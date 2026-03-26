import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BackupManager {
  constructor(config = {}) {
    this.dbPath = config.dbPath || './data/cognimesh.db';
    this.backupDir = config.backupDir || './backups';
    this.retentionDays = config.retentionDays || 7;
  }

  async initialize() {
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  async createBackup(options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = options.name || `backup-${timestamp}`;
    const backupPath = path.join(this.backupDir, `${backupName}.db`);
    
    // SQLite backup
    await execAsync(`sqlite3 "${this.dbPath}" ".backup '${backupPath}'"`);
    
    // Create metadata
    const metadata = {
      name: backupName,
      createdAt: new Date().toISOString(),
      size: (await fs.stat(backupPath)).size,
      version: '5.0.0'
    };
    await fs.writeFile(
      path.join(this.backupDir, `${backupName}.json`),
      JSON.stringify(metadata, null, 2)
    );
    
    return { path: backupPath, metadata };
  }

  async restoreFromBackup(backupName) {
    const backupPath = path.join(this.backupDir, `${backupName}.db`);
    
    // Verify backup exists
    await fs.access(backupPath);
    
    // Restore
    await execAsync(`sqlite3 "${backupPath}" ".backup '${this.dbPath}'"`);
    
    return { restored: true, from: backupPath };
  }

  async listBackups() {
    const files = await fs.readdir(this.backupDir);
    const backups = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const metadata = JSON.parse(
          await fs.readFile(path.join(this.backupDir, file), 'utf8')
        );
        backups.push(metadata);
      }
    }
    
    return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async cleanupOldBackups() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    
    const backups = await this.listBackups();
    const oldBackups = backups.filter(b => new Date(b.createdAt) < cutoff);
    
    for (const backup of oldBackups) {
      await fs.unlink(path.join(this.backupDir, `${backup.name}.db`));
      await fs.unlink(path.join(this.backupDir, `${backup.name}.json`));
    }
    
    return { deleted: oldBackups.length };
  }
}

/**
 * Backup type constants used by examples and scheduling
 */
export const BackupType = {
  FULL: 'full',
  INCREMENTAL: 'incremental',
  EMERGENCY: 'emergency'
};

/**
 * Factory function to create a BackupManager with separate config and dbPath args
 */
export function createBackupManager(config = {}, dbPath) {
  return new BackupManager({ ...config, dbPath });
}

/**
 * Quick one-shot backup without managing a BackupManager instance
 */
export async function quickBackup(dbPath, backupDir) {
  const manager = new BackupManager({ dbPath, backupDir });
  await manager.initialize();
  return manager.createBackup();
}

/**
 * Quick one-shot restore without managing a BackupManager instance
 */
export async function quickRestore(backupPath, dbPath) {
  const backupDir = path.dirname(backupPath);
  const backupName = path.basename(backupPath, '.db');
  const manager = new BackupManager({ dbPath, backupDir });
  return manager.restoreFromBackup(backupName);
}

export default BackupManager;
