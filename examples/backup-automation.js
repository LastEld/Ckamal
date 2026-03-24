/**
 * Backup Automation Example
 * Demonstrates how to use the BackupScheduler with monitoring
 */

import { BackupScheduler } from '../src/db/backup-scheduler.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  // Configuration
  const config = {
    // Database and backup paths
    dbPath: './data/cognimesh.db',
    backupDir: './backups',
    
    // Schedule: Daily at 2 AM
    schedule: '0 2 * * *',
    
    // Retention: Keep 14 days of backups
    retentionDays: 14,
    
    // Timezone
    timezone: 'UTC',
    
    // Verify backups after creation
    verifyBackups: true,
    
    // Alert on failure
    alertOnFailure: true,
    alertWebhook: process.env.BACKUP_ALERT_WEBHOOK,
    
    // S3 Configuration (optional)
    s3Config: {
      endpoint: process.env.S3_ENDPOINT,
      bucket: process.env.S3_BUCKET,
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      region: process.env.S3_REGION || 'us-east-1',
      prefix: 'cognimesh/backups/'
    }
  };

  // Create scheduler instance
  const scheduler = new BackupScheduler(config);

  // Initialize
  logger.info('Initializing backup scheduler...');
  await scheduler.initialize();

  // Start scheduled backups
  logger.info('Starting backup scheduler...');
  scheduler.startScheduler();

  // Log status
  const status = scheduler.getStatus();
  logger.info('Backup scheduler started', {
    schedule: status.schedule,
    nextRun: status.nextRun,
    retentionDays: status.retentionDays,
    s3Enabled: status.s3Enabled
  });

  // Example: Run immediate backup on startup (optional)
  // await scheduler.runImmediateBackup();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down backup scheduler...');
    scheduler.stopScheduler();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down backup scheduler...');
    scheduler.stopScheduler();
    process.exit(0);
  });

  // Example: Periodic metrics logging (every hour)
  setInterval(() => {
    const metrics = scheduler.getMetrics();
    logger.info('Backup metrics', metrics);
  }, 60 * 60 * 1000);
}

main().catch(error => {
  logger.error('Backup automation failed', { error: error.message });
  process.exit(1);
});
