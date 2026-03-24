/**
 * @fileoverview Database Backup System Usage Examples
 * @example
 * 
 * This example demonstrates the CogniMesh database backup/recovery system.
 * 
 * Recovery Objectives:
 * - RTO (Recovery Time Objective): < 1 hour
 * - RPO (Recovery Point Objective): < 15 minutes
 * 
 * Backup Strategy:
 * - Full backup: Daily at 02:00
 * - Incremental: Every 4 hours via WAL archiving
 * - Retention: 7 days for full backups, 24 hours for incremental
 */

import { 
  BackupManager, 
  BackupType, 
  createBackupManager,
  quickBackup,
  quickRestore 
} from '../../src/db/backup.js';

// ============================================================================
// Example 1: Basic Backup Manager Setup
// ============================================================================

async function example1_basicSetup() {
  console.log('\n=== Example 1: Basic Backup Manager Setup ===\n');
  
  // Create backup manager with custom configuration
  const backupManager = new BackupManager({
    backupDir: './backups',           // Backup directory
    retention: {
      full: 7 * 24,                   // 7 days for full backups
      incremental: 24,                 // 24 hours for incremental
      wal: 24                          // 24 hours for WAL archives
    },
    schedule: {
      full: '0 2 * * *',              // Daily at 02:00
      incremental: '0 */4 * * *',     // Every 4 hours
      wal: '*/15 * * * *'             // Every 15 minutes
    },
    compression: {
      enabled: true,
      level: 6
    },
    verify: {
      enabled: true,
      sampleSize: 100
    },
    rto: 60,    // Recovery Time Objective: < 1 hour
    rpo: 15     // Recovery Point Objective: < 15 minutes
  }, './data/cognimesh.db');           // Database path
  
  // Initialize the manager
  await backupManager.initialize();
  
  console.log('✓ Backup manager initialized');
  console.log('  - Backup directory: ./backups');
  console.log('  - RTO target: 60 minutes');
  console.log('  - RPO target: 15 minutes');
  
  // Listen for events
  backupManager.on('backup:start', (data) => {
    console.log(`  [EVENT] Backup started: ${data.backupType}`);
  });
  
  backupManager.on('backup:complete', (data) => {
    console.log(`  [EVENT] Backup completed: ${data.metadata.filename}`);
  });
  
  await backupManager.shutdown();
}

// ============================================================================
// Example 2: Creating Backups
// ============================================================================

async function example2_creatingBackups() {
  console.log('\n=== Example 2: Creating Backups ===\n');
  
  const backupManager = createBackupManager({
    backupDir: './backups'
  }, './data/cognimesh.db');
  
  await backupManager.initialize();
  
  try {
    // 2.1: Full backup
    console.log('Creating full backup...');
    const fullBackup = await backupManager.createBackup({
      type: BackupType.FULL,
      verify: true,
      compress: true
    });
    
    console.log('✓ Full backup created:');
    console.log(`  - File: ${fullBackup.metadata.filename}`);
    console.log(`  - Size: ${fullBackup.metadata.sizeFormatted}`);
    console.log(`  - Duration: ${fullBackup.metadata.durationFormatted}`);
    console.log(`  - Hash: ${fullBackup.metadata.hash}`);
    
    // 2.2: Incremental backup
    console.log('\nCreating incremental backup...');
    const incrementalBackup = await backupManager.createBackup({
      type: BackupType.INCREMENTAL,
      verify: true
    });
    
    console.log('✓ Incremental backup created:');
    console.log(`  - File: ${incrementalBackup.metadata.filename}`);
    console.log(`  - Duration: ${incrementalBackup.metadata.durationFormatted}`);
    
    // 2.3: Emergency backup (quick state capture)
    console.log('\nCreating emergency backup...');
    const emergencyBackup = await backupManager.createBackup({
      type: BackupType.EMERGENCY
    });
    
    console.log('✓ Emergency backup created:');
    console.log(`  - File: ${emergencyBackup.metadata.filename}`);
    
  } catch (error) {
    console.error('✗ Backup failed:', error.message);
  }
  
  await backupManager.shutdown();
}

// ============================================================================
// Example 3: Listing and Managing Backups
// ============================================================================

async function example3_listingBackups() {
  console.log('\n=== Example 3: Listing and Managing Backups ===\n');
  
  const backupManager = createBackupManager({
    backupDir: './backups'
  }, './data/cognimesh.db');
  
  await backupManager.initialize();
  
  // List all backups
  console.log('Listing all backups:');
  const backups = await backupManager.listBackups({
    includeMetadata: true
  });
  
  console.log(`Found ${backups.length} backups:\n`);
  
  for (const backup of backups) {
    console.log(`  [${backup.type.toUpperCase()}] ${backup.filename}`);
    console.log(`    Size: ${backup.sizeFormatted}`);
    console.log(`    Created: ${backup.createdAt}`);
    console.log(`    Verified: ${backup.verified ? '✓' : '✗'}`);
    console.log();
  }
  
  // Filter by type
  console.log('Listing only full backups:');
  const fullBackups = await backupManager.listBackups({
    type: 'full',
    limit: 5
  });
  
  console.log(`Found ${fullBackups.length} full backups\n`);
  
  // Cleanup old backups
  console.log('Cleaning up old backups...');
  const cleanup = await backupManager.cleanupOldBackups();
  console.log(`✓ Removed ${cleanup.removed} old backups`);
  
  await backupManager.shutdown();
}

// ============================================================================
// Example 4: Scheduled Backups
// ============================================================================

async function example4_scheduledBackups() {
  console.log('\n=== Example 4: Scheduled Backups ===\n');
  
  const backupManager = createBackupManager({
    backupDir: './backups'
  }, './data/cognimesh.db');
  
  await backupManager.initialize();
  
  // Schedule full backup daily at 02:00
  console.log('Scheduling daily full backup at 02:00...');
  const dailyJob = backupManager.scheduleBackups('0 2 * * *', {
    type: BackupType.FULL,
    verify: true
  });
  
  console.log('✓ Scheduled daily backup:');
  console.log(`  - Job ID: ${dailyJob.id}`);
  console.log(`  - Schedule: ${dailyJob.schedule}`);
  console.log(`  - Next run: ${dailyJob.nextRun}`);
  
  // Schedule incremental backup every 4 hours
  console.log('\nScheduling incremental backup every 4 hours...');
  const incrementalJob = backupManager.scheduleBackups('0 */4 * * *', {
    type: BackupType.INCREMENTAL,
    verify: true
  });
  
  console.log('✓ Scheduled incremental backup:');
  console.log(`  - Job ID: ${incrementalJob.id}`);
  console.log(`  - Schedule: ${incrementalJob.schedule}`);
  console.log(`  - Next run: ${incrementalJob.nextRun}`);
  
  // List scheduled jobs
  console.log('\nScheduled jobs:');
  const jobs = backupManager.getScheduledJobs();
  for (const job of jobs) {
    console.log(`  - ${job.id}: ${job.type} (${job.schedule})`);
  }
  
  // Cancel specific job
  console.log('\nCancelling incremental job...');
  const cancelled = backupManager.cancelScheduledBackup(incrementalJob.id);
  console.log(`✓ Cancelled: ${cancelled}`);
  
  // Cancel all remaining jobs
  console.log('\nCancelling all scheduled jobs...');
  const cancelledCount = backupManager.cancelAllScheduledBackups();
  console.log(`✓ Cancelled ${cancelledCount} jobs`);
  
  await backupManager.shutdown();
}

// ============================================================================
// Example 5: Database Recovery
// ============================================================================

async function example5_databaseRecovery() {
  console.log('\n=== Example 5: Database Recovery ===\n');
  
  const backupManager = createBackupManager({
    backupDir: './backups'
  }, './data/cognimesh.db');
  
  await backupManager.initialize();
  
  try {
    // Get list of available backups
    const backups = await backupManager.listBackups({ limit: 5 });
    
    if (backups.length === 0) {
      console.log('No backups available for restore');
      return;
    }
    
    console.log('Available backups for restore:');
    backups.forEach((b, i) => {
      console.log(`  ${i + 1}. [${b.type}] ${b.filename} (${b.sizeFormatted})`);
    });
    
    // Restore from most recent backup
    const latestBackup = backups[0];
    console.log(`\nRestoring from: ${latestBackup.filename}`);
    
    const restoreResult = await backupManager.restoreFromBackup(
      latestBackup.path,
      {
        verify: true,
        force: true
      }
    );
    
    console.log('✓ Restore completed:');
    console.log(`  - Restored from: ${restoreResult.restoredFrom}`);
    console.log(`  - Duration: ${restoreResult.duration}`);
    console.log(`  - Emergency backup: ${restoreResult.emergencyBackup?.filename || 'N/A'}`);
    
  } catch (error) {
    console.error('✗ Restore failed:', error.message);
  }
  
  await backupManager.shutdown();
}

// ============================================================================
// Example 6: Recovery Metrics
// ============================================================================

async function example6_recoveryMetrics() {
  console.log('\n=== Example 6: Recovery Metrics ===\n');
  
  const backupManager = createBackupManager({
    backupDir: './backups'
  }, './data/cognimesh.db');
  
  await backupManager.initialize();
  
  const metrics = await backupManager.getRecoveryMetrics();
  
  console.log('Recovery Metrics:');
  console.log('=================\n');
  
  console.log('RTO (Recovery Time Objective):');
  console.log(`  Target: ${metrics.rto.target} minutes`);
  console.log(`  Estimated: ${metrics.rto.estimated ? metrics.rto.estimated + ' minutes' : 'N/A'}`);
  console.log(`  Status: ${metrics.rto.estimated && metrics.rto.estimated <= metrics.rto.target ? '✓ OK' : '⚠ WARNING'}\n`);
  
  console.log('RPO (Recovery Point Objective):');
  console.log(`  Target: ${metrics.rpo.target} minutes`);
  console.log(`  Actual: ${metrics.rpo.actual} minutes`);
  console.log(`  Status: ${metrics.rpo.status === 'OK' ? '✓ OK' : '✗ VIOLATION'}\n`);
  
  console.log('Backup Statistics:');
  console.log(`  Total backups: ${metrics.backups.total}`);
  console.log(`  Full backups: ${metrics.backups.full}`);
  console.log(`  Incremental backups: ${metrics.backups.incremental}`);
  console.log(`  WAL archives: ${metrics.backups.wal}\n`);
  
  console.log('Storage Usage:');
  console.log(`  Total size: ${metrics.storage.totalSizeFormatted}`);
  console.log(`  Backup directory: ${metrics.storage.backupDir}\n`);
  
  if (metrics.lastBackup) {
    console.log('Last Backup:');
    console.log(`  Time: ${metrics.lastBackup.time}`);
    console.log(`  Type: ${metrics.lastBackup.type}`);
    console.log(`  Size: ${metrics.lastBackup.size}`);
  }
  
  await backupManager.shutdown();
}

// ============================================================================
// Example 7: Quick Backup/Restore Functions
// ============================================================================

async function example7_quickFunctions() {
  console.log('\n=== Example 7: Quick Backup/Restore Functions ===\n');
  
  // Quick backup without managing the manager instance
  console.log('Performing quick backup...');
  try {
    const result = await quickBackup(
      './data/cognimesh.db',
      './backups'
    );
    
    console.log('✓ Quick backup completed:');
    console.log(`  - File: ${result.metadata.filename}`);
    console.log(`  - Size: ${result.metadata.sizeFormatted}`);
    
    // Quick restore
    console.log('\nPerforming quick restore...');
    const restoreResult = await quickRestore(
      result.metadata.path,
      './data/cognimesh.db'
    );
    
    console.log('✓ Quick restore completed:');
    console.log(`  - Duration: ${restoreResult.duration}`);
    
  } catch (error) {
    console.error('✗ Operation failed:', error.message);
  }
}

// ============================================================================
// Example 8: Integration with Maintenance Mode
// ============================================================================

async function example8_maintenanceModeIntegration() {
  console.log('\n=== Example 8: Maintenance Mode Integration ===\n');
  
  // This example shows how the backup system integrates with maintenance mode
  // In actual usage, this would be done through the BIOS maintenance mode
  
  console.log('Backup operations in maintenance mode:');
  console.log('');
  
  console.log('1. Enter maintenance mode:');
  console.log('   bios.enterMaintenanceMode({ reason: "Scheduled backup" })');
  console.log('');
  
  console.log('2. Execute BACKUP operation:');
  console.log('   bios.maintenance.executeOperation({');
  console.log('     type: "BACKUP",');
  console.log('     params: {');
  console.log('       type: "full",');
  console.log('       verify: true');
  console.log('     }');
  console.log('   })');
  console.log('');
  
  console.log('3. Schedule automatic backups:');
  console.log('   bios.maintenance.executeOperation({');
  console.log('     type: "BACKUP",');
  console.log('     params: {');
  console.log('       type: "full",');
  console.log('       schedule: "0 2 * * *"');
  console.log('     }');
  console.log('   })');
  console.log('');
  
  console.log('4. List available backups:');
  console.log('   bios.maintenance.listBackups({ type: "full", limit: 10 })');
  console.log('');
  
  console.log('5. Execute RESTORE operation:');
  console.log('   bios.maintenance.executeOperation({');
  console.log('     type: "RESTORE",');
  console.log('     params: {');
  console.log('       backupPath: "./backups/full/cognimesh_full_2026-03-23T10-00-00.db.gz",');
  console.log('       verify: true');
  console.log('     }');
  console.log('   })');
  console.log('');
  
  console.log('6. Exit maintenance mode:');
  console.log('   bios.exitMaintenanceMode()');
  console.log('');
  
  console.log('Events emitted:');
  console.log('  - bios:backup:start');
  console.log('  - bios:backup:complete');
  console.log('  - bios:backup:error');
  console.log('  - bios:restore:start');
  console.log('  - bios:restore:complete');
  console.log('  - bios:restore:error');
}

// ============================================================================
// Example 9: Event Handling
// ============================================================================

async function example9_eventHandling() {
  console.log('\n=== Example 9: Event Handling ===\n');
  
  const backupManager = createBackupManager({
    backupDir: './backups'
  }, './data/cognimesh.db');
  
  await backupManager.initialize();
  
  // Set up event handlers
  backupManager.on('backup:start', (data) => {
    console.log(`[EVENT] Backup started: ${data.backupType} (${data.id})`);
  });
  
  backupManager.on('backup:verifying', (data) => {
    console.log(`[EVENT] Backup verifying: ${data.operationId}`);
  });
  
  backupManager.on('backup:complete', (data) => {
    console.log(`[EVENT] Backup complete: ${data.metadata.filename}`);
    console.log(`        Duration: ${(data.duration / 1000).toFixed(2)}s`);
  });
  
  backupManager.on('backup:error', (data) => {
    console.error(`[EVENT] Backup error: ${data.error}`);
  });
  
  backupManager.on('restore:start', (data) => {
    console.log(`[EVENT] Restore started: ${data.backupPath}`);
  });
  
  backupManager.on('restore:verifying', (data) => {
    console.log(`[EVENT] Restore verifying (${data.stage})`);
  });
  
  backupManager.on('restore:complete', (data) => {
    console.log(`[EVENT] Restore complete: ${(data.duration / 1000).toFixed(2)}s`);
  });
  
  backupManager.on('schedule:start', (data) => {
    console.log(`[EVENT] Scheduled job started: ${data.jobId}`);
  });
  
  backupManager.on('schedule:complete', (data) => {
    console.log(`[EVENT] Scheduled job complete: ${data.jobId}`);
  });
  
  backupManager.on('cleanup:complete', (data) => {
    console.log(`[EVENT] Cleanup complete: ${data.removed} files removed`);
  });
  
  console.log('Event handlers registered');
  console.log('Performing backup to trigger events...\n');
  
  try {
    await backupManager.createBackup({
      type: BackupType.INCREMENTAL,
      verify: true
    });
  } catch (error) {
    // Ignore errors in example
  }
  
  await backupManager.shutdown();
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     CogniMesh Database Backup System - Usage Examples        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  try {
    await example1_basicSetup();
    await example2_creatingBackups();
    await example3_listingBackups();
    await example4_scheduledBackups();
    await example5_databaseRecovery();
    await example6_recoveryMetrics();
    await example7_quickFunctions();
    await example8_maintenanceModeIntegration();
    await example9_eventHandling();
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                   All examples completed!                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
  } catch (error) {
    console.error('\n✗ Example execution failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run examples if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  example1_basicSetup,
  example2_creatingBackups,
  example3_listingBackups,
  example4_scheduledBackups,
  example5_databaseRecovery,
  example6_recoveryMetrics,
  example7_quickFunctions,
  example8_maintenanceModeIntegration,
  example9_eventHandling
};
