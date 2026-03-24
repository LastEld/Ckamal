/**
 * Backup Scheduler with Cron, S3 Upload and Monitoring
 * @module db/backup-scheduler
 */

import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { BackupManager } from './backup.js';
import { logger } from '../utils/logger.js';

const backupLogger = logger.child('backup-scheduler');

/**
 * Backup metrics for monitoring
 */
class BackupMetrics {
  constructor() {
    this.stats = {
      totalBackups: 0,
      successfulBackups: 0,
      failedBackups: 0,
      lastBackupTime: null,
      lastBackupSize: 0,
      averageBackupTime: 0,
      totalBackupTime: 0
    };
    this.history = [];
    this.maxHistory = 100;
  }

  recordSuccess(duration, size, metadata = {}) {
    this.stats.totalBackups++;
    this.stats.successfulBackups++;
    this.stats.lastBackupTime = new Date().toISOString();
    this.stats.lastBackupSize = size;
    this.stats.totalBackupTime += duration;
    this.stats.averageBackupTime = this.stats.totalBackupTime / this.stats.successfulBackups;

    this.history.push({
      type: 'success',
      timestamp: new Date().toISOString(),
      duration,
      size,
      ...metadata
    });

    this.trimHistory();
  }

  recordFailure(error, metadata = {}) {
    this.stats.totalBackups++;
    this.stats.failedBackups++;

    this.history.push({
      type: 'failure',
      timestamp: new Date().toISOString(),
      error: error.message,
      ...metadata
    });

    this.trimHistory();
  }

  trimHistory() {
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  getStats() {
    return { ...this.stats, recentHistory: this.history.slice(-10) };
  }
}

/**
 * S3-compatible storage upload handler
 */
class S3UploadHandler {
  constructor(config) {
    this.config = {
      endpoint: config.endpoint,
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region || 'us-east-1',
      prefix: config.prefix || 'backups/',
      ...config
    };
    this.enabled = !!(this.config.endpoint && this.config.bucket && this.config.accessKeyId);
  }

  async upload(backupPath, metadata = {}) {
    if (!this.enabled) {
      backupLogger.warn('S3 upload skipped - configuration incomplete');
      return null;
    }

    const filename = path.basename(backupPath);
    const key = `${this.config.prefix}${metadata.name || filename}`;

    try {
      // Dynamic import for AWS SDK v3
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      
      const client = new S3Client({
        endpoint: this.config.endpoint,
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey
        },
        forcePathStyle: true
      });

      const fileStream = createReadStream(backupPath);
      const fileStats = await fs.stat(backupPath);

      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: fileStream,
        ContentLength: fileStats.size,
        Metadata: {
          'backup-name': metadata.name || filename,
          'backup-date': metadata.createdAt || new Date().toISOString(),
          'backup-version': metadata.version || '5.0.0',
          'backup-size': String(fileStats.size)
        }
      });

      await client.send(command);
      backupLogger.info(`Backup uploaded to S3: ${key}`);
      
      return { key, bucket: this.config.bucket, size: fileStats.size };
    } catch (error) {
      backupLogger.error('S3 upload failed', { error: error.message, key });
      throw error;
    }
  }
}

/**
 * Backup verification handler
 */
class BackupVerifier {
  constructor(manager) {
    this.manager = manager;
  }

  /**
   * Verify backup integrity by checking file hash and basic SQLite validation
   */
  async verifyBackup(backupPath) {
    backupLogger.info(`Verifying backup: ${backupPath}`);
    
    const startTime = Date.now();
    const results = {
      path: backupPath,
      verified: false,
      checks: {}
    };

    try {
      // Check 1: File exists and is readable
      await fs.access(backupPath, fs.constants.R_OK);
      results.checks.fileExists = { passed: true };

      // Check 2: File size is reasonable (> 0)
      const stats = await fs.stat(backupPath);
      results.checks.fileSize = { 
        passed: stats.size > 0, 
        size: stats.size 
      };

      // Check 3: SQLite integrity check
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync(`sqlite3 "${backupPath}" "PRAGMA integrity_check;"`);
      const integrityOk = stdout.trim() === 'ok';
      results.checks.sqliteIntegrity = { 
        passed: integrityOk, 
        result: stdout.trim() 
      };

      // Check 4: Calculate SHA-256 hash
      const hash = await this.calculateHash(backupPath);
      results.checks.fileHash = { 
        passed: true, 
        hash 
      };

      // Overall verification
      results.verified = Object.values(results.checks).every(c => c.passed);
      results.duration = Date.now() - startTime;

      if (results.verified) {
        backupLogger.info(`Backup verification passed: ${backupPath}`);
      } else {
        backupLogger.warn(`Backup verification failed: ${backupPath}`, results.checks);
      }

      return results;
    } catch (error) {
      results.error = error.message;
      results.duration = Date.now() - startTime;
      backupLogger.error(`Backup verification error: ${backupPath}`, { error: error.message });
      return results;
    }
  }

  async calculateHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      
      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }
}

/**
 * Backup Scheduler with monitoring and S3 support
 */
export class BackupScheduler {
  constructor(config = {}) {
    this.manager = new BackupManager(config);
    this.schedule = config.schedule || '0 2 * * *'; // Daily at 2 AM
    this.retentionDays = config.retentionDays || 7;
    this.s3Handler = config.s3Config ? new S3UploadHandler(config.s3Config) : null;
    this.verifier = new BackupVerifier(this.manager);
    this.metrics = new BackupMetrics();
    this.task = null;
    this.running = false;
    this.config = config;
  }

  async initialize() {
    await this.manager.initialize();
    backupLogger.info('Backup scheduler initialized', { 
      schedule: this.schedule,
      retentionDays: this.retentionDays,
      s3Enabled: !!this.s3Handler?.enabled
    });
  }

  /**
   * Start the backup scheduler
   */
  startScheduler() {
    if (this.task) {
      backupLogger.warn('Scheduler already running');
      return;
    }

    if (!cron.validate(this.schedule)) {
      throw new Error(`Invalid cron schedule: ${this.schedule}`);
    }

    this.task = cron.schedule(this.schedule, async () => {
      await this.runScheduledBackup();
    }, {
      scheduled: true,
      timezone: this.config.timezone || 'UTC'
    });

    this.running = true;
    backupLogger.info(`Backup scheduler started with schedule: ${this.schedule}`);
  }

  /**
   * Stop the backup scheduler
   */
  stopScheduler() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.running = false;
      backupLogger.info('Backup scheduler stopped');
    }
  }

  /**
   * Run a scheduled backup with full pipeline
   */
  async runScheduledBackup() {
    const startTime = Date.now();
    backupLogger.info('Starting scheduled backup');

    try {
      // Step 1: Create backup
      const backup = await this.manager.createBackup();
      backupLogger.info(`Backup created: ${backup.path}`, { 
        size: backup.metadata.size,
        name: backup.metadata.name
      });

      // Step 2: Verify backup
      if (this.config.verifyBackups !== false) {
        const verification = await this.verifier.verifyBackup(backup.path);
        if (!verification.verified) {
          throw new Error(`Backup verification failed: ${JSON.stringify(verification.checks)}`);
        }
      }

      // Step 3: Upload to S3 if configured
      if (this.s3Handler?.enabled) {
        await this.s3Handler.upload(backup.path, backup.metadata);
      }

      // Step 4: Cleanup old backups
      const cleanup = await this.manager.cleanupOldBackups();
      backupLogger.info(`Cleanup completed: ${cleanup.deleted} old backups removed`);

      // Record success metrics
      const duration = Date.now() - startTime;
      this.metrics.recordSuccess(duration, backup.metadata.size, {
        name: backup.metadata.name,
        s3Uploaded: !!this.s3Handler?.enabled,
        verified: this.config.verifyBackups !== false
      });

      backupLogger.info('Scheduled backup completed successfully', { duration });
      return { success: true, backup, duration };

    } catch (error) {
      this.metrics.recordFailure(error);
      backupLogger.error('Scheduled backup failed', { error: error.message });
      
      // Alert on failure if configured
      if (this.config.alertOnFailure) {
        await this.sendAlert(error);
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Run immediate backup (manual trigger)
   */
  async runImmediateBackup(options = {}) {
    backupLogger.info('Running immediate backup', options);
    return this.runScheduledBackup();
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return this.metrics.getStats();
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: this.running,
      schedule: this.schedule,
      nextRun: this.task ? this.getNextRunTime() : null,
      retentionDays: this.retentionDays,
      s3Enabled: !!this.s3Handler?.enabled,
      metrics: this.metrics.getStats()
    };
  }

  getNextRunTime() {
    // Simple next run calculation (cron-parser would be more accurate)
    const now = new Date();
    const [minute, hour] = this.schedule.split(' ').slice(0, 2).map(Number);
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }

  /**
   * Send alert on backup failure
   */
  async sendAlert(error) {
    backupLogger.error('BACKUP FAILURE ALERT', { 
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    // Hook for external alerting (email, slack, etc.)
    if (this.config.alertWebhook) {
      try {
        const response = await fetch(this.config.alertWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'backup_failure',
            message: `Backup failed: ${error.message}`,
            timestamp: new Date().toISOString()
          })
        });
        backupLogger.info('Alert sent', { status: response.status });
      } catch (alertError) {
        backupLogger.error('Failed to send alert', { error: alertError.message });
      }
    }
  }
}

export default BackupScheduler;
