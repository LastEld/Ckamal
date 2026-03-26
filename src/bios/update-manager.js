import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, readFile, writeFile, stat, rm, copyFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { extract } from 'tar';
import { unzip } from 'zlib';
import { promisify } from 'util';
import cron from 'node-cron';
const { schedule: scheduleJob } = cron;
import { compare, valid, gt, coerce } from 'semver';

const gunzip = promisify(unzip);

/**
 * Update states
 */
export const UpdateState = {
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  APPLYING: 'applying',
  APPLIED: 'applied',
  FAILED: 'failed',
  ROLLING_BACK: 'rolling_back',
  ROLLED_BACK: 'rolled_back'
};

/**
 * Update types
 */
export const UpdateType = {
  PATCH: 'patch',
  MINOR: 'minor',
  MAJOR: 'major',
  HOTFIX: 'hotfix'
};

/**
 * Update Manager - Handles checking, downloading, and applying updates
 * @extends EventEmitter
 */
export class UpdateManager extends EventEmitter {
  constructor(github, config = {}) {
    super();
    
    this.github = github;
    this.config = {
      owner: config.owner,
      repo: config.repo,
      tempDir: config.tempDir || './tmp/updates',
      backupDir: config.backupDir || './tmp/backups',
      installDir: config.installDir || './',
      currentVersion: config.currentVersion || '0.0.0',
      allowPrerelease: config.allowPrerelease || false,
      requireChecksum: config.requireChecksum !== false,
      autoRollback: config.autoRollback !== false,
      maxHistory: config.maxHistory || 50,
      ...config
    };
    
    this.currentVersion = this.config.currentVersion;
    this.updateHistory = [];
    this.currentState = UpdateState.IDLE;
    this.scheduledJobs = new Map();
    this.autoUpdateEnabled = false;
    this.checkInterval = null;
    
    // Load history if exists
    this._loadHistory().catch(() => {});
  }

  /**
   * Check for available updates
   * @returns {Promise<Object>} Update check result
   */
  async checkForUpdates() {
    if (this.currentState === UpdateState.CHECKING) {
      throw new Error('Update check already in progress');
    }

    this._setState(UpdateState.CHECKING);

    try {
      const release = await this.github.getLatestRelease(
        this.config.owner,
        this.config.repo
      );

      // Skip drafts and prereleases unless allowed
      if (release.draft || (release.prerelease && !this.config.allowPrerelease)) {
        this._setState(UpdateState.IDLE);
        return { available: false, reason: 'release_not_allowed' };
      }

      // Parse and compare versions
      const latestVersion = this._normalizeVersion(release.tagName);
      const hasUpdate = this._hasUpdate(this.currentVersion, latestVersion);

      const result = {
        available: hasUpdate,
        currentVersion: this.currentVersion,
        latestVersion,
        release,
        type: hasUpdate ? this._determineUpdateType(this.currentVersion, latestVersion) : null,
        publishedAt: release.publishedAt,
        downloadUrl: release.assets[0]?.browserDownloadUrl || release.tarballUrl
      };

      if (hasUpdate) {
        this.emit('update:available', result);
      }

      this._setState(UpdateState.IDLE);
      return result;
    } catch (error) {
      this._setState(UpdateState.IDLE);
      throw error;
    }
  }

  /**
   * Download an update
   * @param {string} version - Version to download
   * @returns {Promise<Object>} Download result
   */
  async downloadUpdate(version) {
    if (this.currentState !== UpdateState.IDLE && this.currentState !== UpdateState.CHECKING) {
      throw new Error(`Cannot download in state: ${this.currentState}`);
    }

    this._setState(UpdateState.DOWNLOADING);

    try {
      // Get release info
      const release = await this.github.getReleaseByTag(
        this.config.owner,
        this.config.repo,
        version
      );

      // Find asset (prefer tar.gz, fallback to zip or first asset)
      const asset = this._selectAsset(release.assets) || {
        browserDownloadUrl: release.tarballUrl,
        name: `${version}.tar.gz`
      };

      // Setup paths
      const downloadDir = join(this.config.tempDir, version);
      await mkdir(downloadDir, { recursive: true });
      
      const downloadPath = join(downloadDir, asset.name);
      const checksumPath = join(downloadDir, `${asset.name}.sha256`);

      // Download asset
      const downloadResult = await this.github.downloadAsset(
        asset.browserDownloadUrl,
        downloadPath
      );

      // Download checksum if available
      const checksumAsset = release.assets.find(a => 
        a.name === `${asset.name}.sha256` || 
        a.name === 'checksums.txt' ||
        a.name === 'SHA256SUMS'
      );

      let verified = false;
      if (checksumAsset) {
        await this.github.downloadAsset(checksumAsset.browserDownloadUrl, checksumPath);
        verified = await this._verifyChecksum(downloadPath, checksumPath);
      } else if (this.config.requireChecksum) {
        throw new Error('Checksum verification required but no checksum file found');
      }

      // Extract archive
      const extractDir = join(downloadDir, 'extracted');
      await this._extractArchive(downloadPath, extractDir);

      const result = {
        version,
        downloadPath,
        extractDir,
        size: downloadResult.size,
        downloadedAt: downloadResult.downloadedAt,
        verified,
        asset: {
          name: asset.name,
          url: asset.browserDownloadUrl
        }
      };

      this._addToHistory({
        version,
        action: 'download',
        timestamp: new Date().toISOString(),
        success: true
      });

      this._setState(UpdateState.DOWNLOADED);
      this.emit('update:downloaded', result);
      
      return result;
    } catch (error) {
      this._setState(UpdateState.FAILED);
      this.emit('update:failed', { phase: 'download', error: error.message });
      throw error;
    }
  }

  /**
   * Apply a downloaded update
   * @param {string} version - Version to apply
   * @returns {Promise<Object>} Apply result
   */
  async applyUpdate(version) {
    if (this.currentState !== UpdateState.DOWNLOADED) {
      throw new Error(`Cannot apply update in state: ${this.currentState}`);
    }

    this._setState(UpdateState.APPLYING);
    this.emit('update:applying', { version });

    const backupId = `backup-${Date.now()}`;
    const backupPath = join(this.config.backupDir, backupId);
    const extractDir = join(this.config.tempDir, version, 'extracted');

    try {
      // 1. Create backup
      await this._createBackup(backupPath);

      // 2. Apply update
      await this._applyFiles(extractDir, this.config.installDir);

      // 3. Run verification if configured
      if (this.config.verifyCommand) {
        const { execSync } = await import('child_process');
        execSync(this.config.verifyCommand, { cwd: this.config.installDir });
      }

      // 4. Update version
      const previousVersion = this.currentVersion;
      this.currentVersion = version;

      // 5. Record success
      const result = {
        version,
        previousVersion,
        appliedAt: new Date().toISOString(),
        backupId,
        verified: true
      };

      this._addToHistory({
        version,
        action: 'apply',
        timestamp: result.appliedAt,
        success: true,
        backupId
      });

      this._setState(UpdateState.APPLIED);
      this.emit('update:applied', result);

      // Cleanup old backups
      this._cleanupOldBackups().catch(() => {});

      return result;
    } catch (error) {
      this._setState(UpdateState.FAILED);
      this.emit('update:failed', { phase: 'apply', error: error.message, version });

      // Auto-rollback if enabled
      if (this.config.autoRollback) {
        try {
          await this.rollback(backupId);
        } catch (rollbackError) {
          this.emit('update:failed', { 
            phase: 'rollback', 
            error: rollbackError.message,
            originalError: error.message 
          });
        }
      }

      throw error;
    }
  }

  /**
   * Schedule an update for a specific time
   * @param {string} version - Version to update to
   * @param {Date|string} time - When to apply (Date or cron expression)
   * @returns {Promise<Object>} Scheduled job info
   */
  async scheduleUpdate(version, time) {
    const jobId = `update-${version}-${Date.now()}`;

    let job;
    if (time instanceof Date) {
      // One-time scheduled update
      const delay = time.getTime() - Date.now();
      if (delay < 0) {
        throw new Error('Scheduled time is in the past');
      }

      const timeout = setTimeout(async () => {
        try {
          const download = await this.downloadUpdate(version);
          await this.applyUpdate(version);
        } catch (error) {
          this.emit('update:failed', { phase: 'scheduled', error: error.message, version });
        }
        this.scheduledJobs.delete(jobId);
      }, delay);

      job = { type: 'timeout', handle: timeout, version, scheduledFor: time.toISOString() };
    } else if (typeof time === 'string') {
      // Cron-based recurring schedule
      job = scheduleJob(time, async () => {
        try {
          const check = await this.checkForUpdates();
          if (check.available) {
            const download = await this.downloadUpdate(check.latestVersion);
            await this.applyUpdate(check.latestVersion);
          }
        } catch (error) {
          this.emit('update:failed', { phase: 'scheduled', error: error.message });
        }
      });

      job = { type: 'cron', handle: job, version, cron: time };
    }

    this.scheduledJobs.set(jobId, job);

    return {
      jobId,
      version,
      scheduledFor: time instanceof Date ? time.toISOString() : time,
      type: job.type
    };
  }

  /**
   * Cancel a scheduled update
   * @param {string} jobId - Job ID to cancel
   * @returns {boolean} Whether cancellation succeeded
   */
  cancelScheduledUpdate(jobId) {
    const job = this.scheduledJobs.get(jobId);
    if (!job) return false;

    if (job.type === 'timeout') {
      clearTimeout(job.handle);
    } else if (job.type === 'cron') {
      job.handle.cancel();
    }

    this.scheduledJobs.delete(jobId);
    return true;
  }

  /**
   * Enable automatic updates
   * @param {Object} options - Auto-update options
   */
  async enableAutoUpdate(options = {}) {
    const config = {
      checkInterval: options.checkInterval || '0 */6 * * *', // Every 6 hours by default
      autoApply: options.autoApply || false,
      autoDownload: options.autoDownload !== false,
      allowRestart: options.allowRestart || false,
      ...options
    };

    this.autoUpdateEnabled = true;

    // Schedule regular checks
    const job = scheduleJob(config.checkInterval, async () => {
      try {
        const check = await this.checkForUpdates();
        
        if (check.available && config.autoDownload) {
          const download = await this.downloadUpdate(check.latestVersion);
          
          if (config.autoApply) {
            if (config.allowRestart) {
              await this.applyUpdate(check.latestVersion);
            } else {
              this.emit('update:ready', { version: check.latestVersion });
            }
          }
        }
      } catch (error) {
        this.emit('update:failed', { phase: 'auto-check', error: error.message });
      }
    });

    this.scheduledJobs.set('auto-update', { type: 'cron', handle: job, config });

    return { enabled: true, config };
  }

  /**
   * Disable automatic updates
   */
  disableAutoUpdate() {
    this.autoUpdateEnabled = false;
    const job = this.scheduledJobs.get('auto-update');
    if (job) {
      job.handle.cancel();
      this.scheduledJobs.delete('auto-update');
    }
    return { enabled: false };
  }

  /**
   * Get update history
   * @returns {Array} Update history
   */
  getUpdateHistory() {
    return [...this.updateHistory];
  }

  /**
   * Rollback to a previous version
   * @param {string} backupId - Backup ID to restore
   * @returns {Promise<Object>} Rollback result
   */
  async rollback(backupId) {
    if (this.currentState === UpdateState.ROLLING_BACK) {
      throw new Error('Rollback already in progress');
    }

    this._setState(UpdateState.ROLLING_BACK);

    try {
      const backupPath = join(this.config.backupDir, backupId);
      
      // Verify backup exists
      await stat(backupPath);

      // Restore from backup
      await this._restoreBackup(backupPath, this.config.installDir);

      // Find version from backup manifest
      let previousVersion = this.currentVersion;
      try {
        const manifestPath = join(backupPath, '.backup-manifest.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
        previousVersion = manifest.version || previousVersion;
      } catch {}

      const result = {
        success: true,
        previousVersion: this.currentVersion,
        restoredVersion: previousVersion,
        backupId,
        rolledBackAt: new Date().toISOString()
      };

      this.currentVersion = previousVersion;

      this._addToHistory({
        version: previousVersion,
        action: 'rollback',
        timestamp: result.rolledBackAt,
        success: true,
        backupId
      });

      this._setState(UpdateState.ROLLED_BACK);
      this.emit('update:rolledback', result);

      return result;
    } catch (error) {
      this._setState(UpdateState.FAILED);
      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  /**
   * Get current state
   * @returns {string} Current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Check if currently updating
   * @returns {boolean} Whether update is in progress
   */
  isUpdating() {
    return [
      UpdateState.CHECKING,
      UpdateState.DOWNLOADING,
      UpdateState.APPLYING,
      UpdateState.ROLLING_BACK
    ].includes(this.currentState);
  }

  // Private methods

  _setState(state) {
    const oldState = this.currentState;
    this.currentState = state;
    this.emit('state:changed', { from: oldState, to: state });
  }

  _normalizeVersion(tag) {
    const version = tag.replace(/^v/, '');
    return valid(version) ? version : coerce(version)?.version || '0.0.0';
  }

  _hasUpdate(current, latest) {
    if (!valid(current) || !valid(latest)) {
      return current !== latest;
    }
    return gt(latest, current);
  }

  _determineUpdateType(current, latest) {
    if (!valid(current) || !valid(latest)) return UpdateType.PATCH;
    
    const cmp = compare(latest, current);
    if (cmp === 0) return null;

    const currentMajor = parseInt(current.split('.')[0]);
    const latestMajor = parseInt(latest.split('.')[0]);
    
    if (latestMajor > currentMajor) return UpdateType.MAJOR;
    
    const currentMinor = parseInt(current.split('.')[1] || 0);
    const latestMinor = parseInt(latest.split('.')[1] || 0);
    
    if (latestMinor > currentMinor) return UpdateType.MINOR;
    
    return UpdateType.PATCH;
  }

  _selectAsset(assets) {
    if (!assets || assets.length === 0) return null;
    
    // Prefer tar.gz for Linux/macOS, zip for Windows
    const platform = process.platform;
    const preferZip = platform === 'win32';
    
    const sorted = [...assets].sort((a, b) => {
      const aIsZip = a.name.endsWith('.zip');
      const bIsZip = b.name.endsWith('.zip');
      const aIsTar = a.name.endsWith('.tar.gz') || a.name.endsWith('.tgz');
      const bIsTar = b.name.endsWith('.tar.gz') || b.name.endsWith('.tgz');
      
      if (preferZip) {
        if (aIsZip && !bIsZip) return -1;
        if (!aIsZip && bIsZip) return 1;
      } else {
        if (aIsTar && !bIsTar) return -1;
        if (!aIsTar && bIsTar) return 1;
      }
      return 0;
    });
    
    return sorted[0];
  }

  async _verifyChecksum(filePath, checksumPath) {
    const checksumContent = await readFile(checksumPath, 'utf-8');
    const expectedHash = checksumContent.trim().split(' ')[0];
    
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    
    await pipeline(stream, async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk);
      }
    }());
    
    const actualHash = hash.digest('hex');
    return actualHash === expectedHash;
  }

  async _extractArchive(archivePath, extractDir) {
    await mkdir(extractDir, { recursive: true });

    if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
      await extract({
        file: archivePath,
        cwd: extractDir
      });
    } else if (archivePath.endsWith('.zip')) {
      const { default: AdmZip } = await import('adm-zip');
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(extractDir, true);
    } else {
      throw new Error(`Unsupported archive format: ${archivePath}`);
    }
  }

  async _createBackup(backupPath) {
    await mkdir(backupPath, { recursive: true });

    const manifest = {
      version: this.currentVersion,
      createdAt: new Date().toISOString(),
      source: this.config.installDir
    };

    await writeFile(
      join(backupPath, '.backup-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Copy files to backup
    const entries = await readdir(this.config.installDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const src = join(this.config.installDir, entry.name);
      const dest = join(backupPath, entry.name);

      if (entry.isDirectory()) {
        await this._copyDir(src, dest);
      } else {
        await copyFile(src, dest);
      }
    }
  }

  async _restoreBackup(backupPath, installDir) {
    // Remove current installation
    const entries = await readdir(installDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      await rm(join(installDir, entry.name), { recursive: true, force: true });
    }

    // Restore from backup
    const backupEntries = await readdir(backupPath, { withFileTypes: true });
    
    for (const entry of backupEntries) {
      if (entry.name === '.backup-manifest.json') continue;
      
      const src = join(backupPath, entry.name);
      const dest = join(installDir, entry.name);

      if (entry.isDirectory()) {
        await this._copyDir(src, dest);
      } else {
        await copyFile(src, dest);
      }
    }
  }

  async _applyFiles(sourceDir, targetDir) {
    const entries = await readdir(sourceDir, { withFileTypes: true, recursive: true });
    
    for (const entry of entries) {
      const srcPath = join(entry.parentPath || sourceDir, entry.name);
      const relativePath = srcPath.slice(sourceDir.length + 1);
      const destPath = join(targetDir, relativePath);

      if (entry.isDirectory()) {
        await mkdir(destPath, { recursive: true });
      } else {
        await mkdir(dirname(destPath), { recursive: true });
        await copyFile(srcPath, destPath);
      }
    }
  }

  async _copyDir(src, dest) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await this._copyDir(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
  }

  async _cleanupOldBackups() {
    try {
      const entries = await readdir(this.config.backupDir, { withFileTypes: true });
      const backups = entries
        .filter(e => e.isDirectory() && e.name.startsWith('backup-'))
        .map(e => ({
          name: e.name,
          path: join(this.config.backupDir, e.name),
          time: parseInt(e.name.split('-')[1]) || 0
        }))
        .sort((a, b) => b.time - a.time);

      // Keep last 5 backups
      for (const backup of backups.slice(5)) {
        await rm(backup.path, { recursive: true, force: true });
      }
    } catch {}
  }

  async _loadHistory() {
    try {
      const historyPath = join(this.config.tempDir, 'update-history.json');
      const data = await readFile(historyPath, 'utf-8');
      this.updateHistory = JSON.parse(data);
    } catch {
      this.updateHistory = [];
    }
  }

  async _saveHistory() {
    try {
      const historyPath = join(this.config.tempDir, 'update-history.json');
      await mkdir(dirname(historyPath), { recursive: true });
      await writeFile(historyPath, JSON.stringify(this.updateHistory, null, 2));
    } catch {}
  }

  _addToHistory(entry) {
    this.updateHistory.unshift(entry);
    if (this.updateHistory.length > this.config.maxHistory) {
      this.updateHistory = this.updateHistory.slice(0, this.config.maxHistory);
    }
    this._saveHistory().catch(() => {});
  }
}
