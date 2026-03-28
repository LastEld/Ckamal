#!/usr/bin/env node
/**
 * Backup Verification Script
 * Usage: node scripts/backup-verify.js [options]
 * 
 * Verifies integrity of all or specific backups
 */

import { BackupManager } from '../src/db/backup.js';
import { logger } from '../src/utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const verifyLogger = logger.child('backup-verify');

/**
 * Calculate SHA-256 hash of file
 */
async function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Verify a single backup file
 */
async function verifyBackupFile(backupPath, metadata = null) {
  const result = {
    path: backupPath,
    name: path.basename(backupPath, '.db'),
    verified: false,
    checks: {},
    duration: 0
  };

  const startTime = Date.now();

  try {
    // Check 1: File exists and readable
    try {
      await fs.access(backupPath, fs.constants.R_OK);
      result.checks.fileExists = { passed: true };
    } catch (error) {
      result.checks.fileExists = { passed: false, error: error.message };
      result.duration = Date.now() - startTime;
      return result;
    }

    // Check 2: File size
    const stats = await fs.stat(backupPath);
    result.checks.fileSize = { 
      passed: stats.size > 0, 
      size: stats.size,
      sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`
    };

    // Check 3: SQLite header magic bytes
    const headerBuffer = Buffer.alloc(16);
    const fd = await fs.open(backupPath, 'r');
    await fd.read(headerBuffer, 0, 16, 0);
    await fd.close();
    
    const sqliteMagic = Buffer.from('SQLite format 3\x00');
    result.checks.sqliteHeader = {
      passed: headerBuffer.equals(sqliteMagic),
      header: headerBuffer.toString('hex').slice(0, 32)
    };

    // Check 4: SQLite integrity
    try {
      const { stdout } = await execAsync(`sqlite3 "${backupPath}" "PRAGMA integrity_check;"`);
      result.checks.sqliteIntegrity = {
        passed: stdout.trim() === 'ok',
        result: stdout.trim()
      };
    } catch (error) {
      result.checks.sqliteIntegrity = {
        passed: false,
        error: error.message
      };
    }

    // Check 5: Table count
    try {
      const { stdout } = await execAsync(
        `sqlite3 "${backupPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"`
      );
      result.checks.tableCount = {
        passed: parseInt(stdout.trim(), 10) > 0,
        count: parseInt(stdout.trim(), 10)
      };
    } catch (error) {
      result.checks.tableCount = {
        passed: false,
        error: error.message
      };
    }

    // Check 6: File hash (if metadata provided)
    if (metadata?.hash) {
      const hash = await calculateHash(backupPath);
      result.checks.fileHash = {
        passed: hash === metadata.hash,
        current: hash,
        expected: metadata.hash
      };
    }

    // Check 7: Metadata consistency
    if (metadata) {
      result.checks.metadata = {
        passed: stats.size === metadata.size,
        actualSize: stats.size,
        expectedSize: metadata.size
      };
    }

    // Overall verification
    result.verified = Object.values(result.checks).every(c => c.passed);
    result.duration = Date.now() - startTime;

  } catch (error) {
    result.error = error.message;
    result.duration = Date.now() - startTime;
  }

  return result;
}

/**
 * Print verification result
 */
function printResult(result, verbose = false) {
  const status = result.verified ? '✅' : '❌';
  console.log(`${status} ${result.name}`);
  
  if (verbose || !result.verified) {
    for (const [check, data] of Object.entries(result.checks)) {
      const checkStatus = data.passed ? '✓' : '✗';
      let details = '';
      
      if (check === 'fileSize') {
        details = `(${data.sizeFormatted || (data.size + ' bytes')})`;
      } else if (check === 'tableCount') {
        details = `(${data.count} tables)`;
      } else if (check === 'sqliteIntegrity' && !data.passed) {
        details = `(${data.result || data.error})`;
      } else if (!data.passed && data.error) {
        details = `(${data.error})`;
      }
      
      console.log(`   ${checkStatus} ${check} ${details}`);
    }
    console.log(`   Duration: ${result.duration}ms`);
  }
}

/**
 * Main verification function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Backup Verification Script

Usage: node scripts/backup-verify.js [options] [backup-name]

Arguments:
  backup-name        Specific backup to verify (optional, verifies all if omitted)

Options:
  --verbose          Show detailed results for all backups
  --json             Output results as JSON
  --fix              Attempt to fix issues (remove corrupted backups)
  --help             Show this help message

Examples:
  node scripts/backup-verify.js
  node scripts/backup-verify.js --verbose
  node scripts/backup-verify.js backup-2024-01-15T10-30-00-000Z
  node scripts/backup-verify.js --json > verification-report.json
    `);
    process.exit(0);
  }

  const verbose = args.includes('--verbose');
  const jsonOutput = args.includes('--json');
  const fixMode = args.includes('--fix');
  
  // Get backup name if provided (first non-flag argument)
  const backupName = args.find(arg => !arg.startsWith('--'));

  const backupDir = process.env.BACKUP_DIR || './backups';
  const manager = new BackupManager({ backupDir });
  await manager.initialize();

  let backups = [];
  
  if (backupName) {
    // Verify specific backup
    backups = [{ name: backupName }];
  } else {
    // Get all backups
    backups = await manager.listBackups();
  }

  if (backups.length === 0) {
    console.log('No backups found to verify.\n');
    process.exit(0);
  }

  verifyLogger.info(`Starting verification of ${backups.length} backup(s)`);

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const backup of backups) {
    const backupPath = path.join(backupDir, `${backup.name}.db`);
    const metadataPath = path.join(backupDir, `${backup.name}.json`);
    
    let metadata = null;
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(metadataContent);
    } catch {
      // Metadata not required for basic verification
    }

    const result = await verifyBackupFile(backupPath, metadata);
    results.push(result);

    if (result.verified) {
      passed++;
    } else {
      failed++;
    }

    if (!jsonOutput) {
      printResult(result, verbose);
    }

    // Fix mode: remove corrupted backups
    if (fixMode && !result.verified) {
      console.log(`   🔧 Removing corrupted backup...`);
      try {
        await fs.unlink(backupPath);
        await fs.unlink(metadataPath).catch(() => {});
        console.log(`   ✅ Removed corrupted backup: ${backup.name}`);
      } catch (error) {
        console.log(`   ❌ Failed to remove: ${error.message}`);
      }
    }
  }

  // Summary
  const summary = {
    total: results.length,
    passed,
    failed,
    fixMode,
    timestamp: new Date().toISOString(),
    results
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('\n' + '='.repeat(50));
    console.log('Verification Summary');
    console.log('='.repeat(50));
    console.log(`Total:  ${summary.total}`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`❌ Failed: ${summary.failed}`);
    console.log(`Duration: ${results.reduce((sum, r) => sum + r.duration, 0)}ms`);
    console.log('='.repeat(50));
  }

  verifyLogger.info('Verification completed', { passed, failed, total: results.length });

  // Exit with error code if any failed
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
