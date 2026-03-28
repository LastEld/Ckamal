#!/usr/bin/env node
/**
 * Backup Restore Script
 * Usage: node scripts/backup-restore.js <backup-name> [options]
 * 
 * Options:
 *   --dry-run          Verify backup without restoring
 *   --force            Skip confirmation prompt
 *   --target-db <path> Restore to different database path
 */

import { BackupManager } from '../src/db/backup.js';
import { logger } from '../src/utils/logger.js';
import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const restoreLogger = logger.child('backup-restore');

/**
 * Prompt user for confirmation
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Verify backup before restore
 */
async function verifyBackup(backupPath) {
  restoreLogger.info(`Verifying backup: ${backupPath}`);
  
  try {
    // Check file exists
    await fs.access(backupPath);
    
    // Check file size
    const stats = await fs.stat(backupPath);
    if (stats.size === 0) {
      throw new Error('Backup file is empty');
    }
    restoreLogger.info(`Backup size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // SQLite integrity check
    const { stdout } = await execAsync(`sqlite3 "${backupPath}" "PRAGMA integrity_check;"`);
    if (stdout.trim() !== 'ok') {
      throw new Error(`SQLite integrity check failed: ${stdout.trim()}`);
    }
    restoreLogger.info('SQLite integrity check: PASSED');

    // Get database info
    const { stdout: tableCount } = await execAsync(
      `sqlite3 "${backupPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"`
    );
    restoreLogger.info(`Tables in backup: ${tableCount.trim()}`);

    return { valid: true, size: stats.size, tables: parseInt(tableCount.trim(), 10) };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Main restore function
 */
async function main() {
  const args = process.argv.slice(2);
  const backupName = args[0];
  
  if (!backupName || backupName === '--help' || backupName === '-h') {
    console.log(`
Backup Restore Script

Usage: node scripts/backup-restore.js <backup-name> [options]

Arguments:
  backup-name        Name of the backup to restore (without .db extension)

Options:
  --dry-run          Verify backup without restoring
  --force            Skip confirmation prompt
  --target-db <path> Restore to different database path
  --list             List available backups
  --help             Show this help message

Examples:
  node scripts/backup-restore.js backup-2024-01-15T10-30-00-000Z
  node scripts/backup-restore.js backup-2024-01-15T10-30-00-000Z --dry-run
  node scripts/backup-restore.js backup-2024-01-15T10-30-00-000Z --force --target-db ./data/new.db
    `);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const listMode = args.includes('--list');
  
  const targetDbIndex = args.indexOf('--target-db');
  const targetDb = targetDbIndex !== -1 ? args[targetDbIndex + 1] : null;

  const backupDir = process.env.BACKUP_DIR || './backups';
  const dbPath = targetDb || (process.env.DB_PATH || './data/cognimesh.db');

  const manager = new BackupManager({ dbPath, backupDir });

  // List mode
  if (listMode) {
    await manager.initialize();
    const backups = await manager.listBackups();
    
    console.log('\nAvailable Backups:');
    console.log('='.repeat(80));
    console.log(`${'Name'.padEnd(35)} ${'Date'.padEnd(25)} ${'Size'.padEnd(15)}`);
    console.log('-'.repeat(80));
    
    for (const backup of backups) {
      const size = (backup.size / 1024 / 1024).toFixed(2) + ' MB';
      const date = new Date(backup.createdAt).toLocaleString();
      console.log(`${backup.name.padEnd(35)} ${date.padEnd(25)} ${size.padEnd(15)}`);
    }
    console.log('='.repeat(80));
    console.log(`Total: ${backups.length} backups\n`);
    process.exit(0);
  }

  const backupPath = path.join(backupDir, `${backupName}.db`);
  const metadataPath = path.join(backupDir, `${backupName}.json`);

  restoreLogger.info('Backup Restore Started', {
    backupName,
    backupPath,
    targetDb: dbPath,
    dryRun
  });

  // Step 1: Verify backup exists
  try {
    await fs.access(backupPath);
  } catch {
    console.error(`\n❌ Error: Backup not found: ${backupPath}`);
    console.log('\nUse --list to see available backups.\n');
    process.exit(1);
  }

  // Step 2: Load and display metadata
  let metadata = null;
  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    metadata = JSON.parse(metadataContent);
    console.log('\n📦 Backup Information:');
    console.log(`   Name: ${metadata.name}`);
    console.log(`   Created: ${new Date(metadata.createdAt).toLocaleString()}`);
    console.log(`   Version: ${metadata.version}`);
    console.log(`   Size: ${(metadata.size / 1024 / 1024).toFixed(2)} MB`);
  } catch {
    restoreLogger.warn('Metadata file not found or invalid');
  }

  // Step 3: Verify backup integrity
  console.log('\n🔍 Verifying backup integrity...');
  const verification = await verifyBackup(backupPath);
  
  if (!verification.valid) {
    console.error(`\n❌ Backup verification failed: ${verification.error}\n`);
    process.exit(1);
  }
  
  console.log('✅ Backup verification passed\n');

  // Dry run mode - exit after verification
  if (dryRun) {
    console.log('🔍 Dry run mode - no changes made.\n');
    process.exit(0);
  }

  // Step 4: Warn about target database
  try {
    await fs.access(dbPath);
    console.log(`⚠️  Warning: Target database exists and will be overwritten:`);
    console.log(`   ${path.resolve(dbPath)}\n`);
  } catch {
    console.log(`ℹ️  Target database does not exist and will be created:`);
    console.log(`   ${path.resolve(dbPath)}\n`);
  }

  // Step 5: Confirm restoration
  if (!force) {
    const confirmed = await prompt('⚡ Are you sure you want to restore this backup? (yes/no): ');
    if (!confirmed) {
      console.log('\n❌ Restore cancelled.\n');
      process.exit(0);
    }
  }

  // Step 6: Create safety backup of current database
  try {
    await fs.access(dbPath);
    const safetyBackupName = `pre-restore-${Date.now()}`;
    const safetyBackupPath = path.join(backupDir, `${safetyBackupName}.db`);
    
    console.log(`\n💾 Creating safety backup of current database...`);
    await fs.copyFile(dbPath, safetyBackupPath);
    
    // Create metadata for safety backup
    const safetyMetadata = {
      name: safetyBackupName,
      createdAt: new Date().toISOString(),
      size: (await fs.stat(safetyBackupPath)).size,
      version: '5.0.0',
      type: 'safety-backup',
      note: `Auto-created before restoring ${backupName}`
    };
    await fs.writeFile(
      path.join(backupDir, `${safetyBackupName}.json`),
      JSON.stringify(safetyMetadata, null, 2)
    );
    console.log(`   Safety backup created: ${safetyBackupName}\n`);
  } catch {
    console.log('   No existing database to backup\n');
  }

  // Step 7: Perform restore
  console.log('🔄 Restoring backup...');
  try {
    // Ensure target directory exists
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    
    // Perform the restore
    const result = await manager.restoreFromBackup(backupName);
    
    console.log('\n✅ Restore completed successfully!');
    console.log(`   Restored from: ${result.from}`);
    console.log(`   Target: ${path.resolve(dbPath)}\n`);
    
    restoreLogger.info('Restore completed', { backupName, targetDb: dbPath });
    process.exit(0);
    
  } catch (error) {
    console.error(`\n❌ Restore failed: ${error.message}\n`);
    restoreLogger.error('Restore failed', { error: error.message, backupName });
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
