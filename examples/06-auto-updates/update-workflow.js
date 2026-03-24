#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Update Workflow Example
 * 
 * This example demonstrates the complete update workflow:
 * 1. Initialize update manager
 * 2. Check for available updates
 * 3. Download update
 * 4. Apply update
 * 5. Rollback if needed
 * 6. Schedule future updates
 * 7. Configure auto-updates
 * 
 * @example
 *   node update-workflow.js
 * 
 * @module examples/06-auto-updates/update-workflow
 */

import { CogniMeshBIOS } from '../../src/bios/index.js';
import { UpdateManager, UpdateState } from '../../src/bios/update-manager.js';
import { EventEmitter } from 'events';

// ============================================================
// Update Workflow Example
// ============================================================

console.log('[CogniMesh v5.0] Update Workflow Example');
console.log('=========================================\n');

// Mock GitHub client for demonstration
class MockGitHubClient extends EventEmitter {
  async getLatestRelease(owner, repo) {
    // Simulate API call
    await this._sleep(100);
    
    return {
      tagName: 'v5.1.0',
      name: 'CogniMesh v5.1.0',
      body: 'Performance improvements and bug fixes',
      publishedAt: '2026-03-20T10:00:00Z',
      draft: false,
      prerelease: false,
      assets: [
        {
          name: 'cognimesh-5.1.0.tar.gz',
          browserDownloadUrl: 'https://example.com/cognimesh-5.1.0.tar.gz',
          size: 2400000
        }
      ]
    };
  }

  async getReleaseByTag(owner, repo, tag) {
    return this.getLatestRelease(owner, repo);
  }

  async downloadAsset(url, path) {
    await this._sleep(200);
    return {
      size: 2400000,
      downloadedAt: new Date().toISOString()
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// Main execution
// ============================================================

async function main() {
  const bios = new CogniMeshBIOS();
  await bios.boot();

  try {
    // Initialize update manager
    const github = new MockGitHubClient();
    const updateManager = new UpdateManager(github, {
      owner: 'cognimesh',
      repo: 'cognimesh-bios',
      currentVersion: '5.0.0',
      tempDir: './tmp/updates',
      backupDir: './tmp/backups',
      autoRollback: true,
      allowPrerelease: false
    });

    // Listen for update events
    updateManager.on('update:available', (data) => {
      console.log(`\n📢 Update available: ${data.latestVersion}`);
    });

    updateManager.on('update:downloaded', (data) => {
      console.log(`\n📢 Update downloaded: ${data.version}`);
    });

    updateManager.on('update:applying', (data) => {
      console.log(`\n📢 Applying update: ${data.version}`);
    });

    updateManager.on('update:applied', (data) => {
      console.log(`\n📢 Update applied: ${data.version}`);
    });

    updateManager.on('update:failed', (data) => {
      console.log(`\n📢 Update failed: ${data.error}`);
    });

    updateManager.on('state:changed', ({ from, to }) => {
      console.log(`   State: ${from} → ${to}`);
    });

    console.log('✅ Update manager initialized');
    console.log(`   Current version: ${updateManager.currentVersion}\n`);

    // ============================================================
    // Step 1: Check for Updates
    // ============================================================
    
    console.log('--- Checking for Updates ---\n');
    
    const checkResult = await updateManager.checkForUpdates();
    
    if (checkResult.available) {
      console.log('✅ Update available!');
      console.log(`   Current: ${checkResult.currentVersion}`);
      console.log(`   Latest: ${checkResult.latestVersion}`);
      console.log(`   Type: ${checkResult.type}`);
      console.log(`   Published: ${checkResult.publishedAt}`);
    } else {
      console.log('ℹ️  No updates available');
      if (checkResult.reason) {
        console.log(`   Reason: ${checkResult.reason}`);
      }
    }

    // ============================================================
    // Step 2: Download Update
    // ============================================================
    
    if (checkResult.available) {
      console.log('\n--- Downloading Update ---\n');
      
      const targetVersion = checkResult.latestVersion;
      console.log(`Downloading v${targetVersion}...`);
      
      try {
        const downloadResult = await updateManager.downloadUpdate(targetVersion);
        
        console.log('\n✅ Download complete!');
        console.log(`   Version: ${downloadResult.version}`);
        console.log(`   Size: ${(downloadResult.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Verified: ${downloadResult.verified ? 'Yes' : 'No'}`);
        console.log(`   Downloaded at: ${downloadResult.downloadedAt}`);

        // ============================================================
        // Step 3: Apply Update
        // ============================================================
        
        console.log('\n--- Applying Update ---\n');
        
        const applyResult = await updateManager.applyUpdate(targetVersion);
        
        console.log('\n✅ Update applied successfully!');
        console.log(`   Previous version: ${applyResult.previousVersion}`);
        console.log(`   Current version: ${updateManager.currentVersion}`);
        console.log(`   Backup ID: ${applyResult.backupId}`);
        console.log(`   Applied at: ${applyResult.appliedAt}`);

      } catch (error) {
        console.error(`\n❌ Update failed: ${error.message}`);
        
        // Auto-rollback would happen here if enabled
        if (updateManager.config.autoRollback) {
          console.log('   Auto-rollback attempted');
        }
      }
    }

    // ============================================================
    // Step 4: Update History
    // ============================================================
    
    console.log('\n--- Update History ---\n');
    
    const history = updateManager.getUpdateHistory();
    console.log(`Total updates: ${history.length}`);
    
    history.forEach((entry, index) => {
      console.log(`${index + 1}. [${entry.action}] v${entry.version} - ${entry.timestamp} ${entry.success ? '✅' : '❌'}`);
    });

    // ============================================================
    // Step 5: Rollback Demo
    // ============================================================
    
    console.log('\n--- Rollback Demo ---\n');
    
    // Find a backup to rollback to
    const historyEntry = history.find(h => h.backupId);
    if (historyEntry) {
      console.log(`Rolling back to v${historyEntry.version}...`);
      
      try {
        const rollbackResult = await updateManager.rollback(historyEntry.backupId);
        
        console.log('\n✅ Rollback complete!');
        console.log(`   Restored to: ${rollbackResult.restoredVersion}`);
        console.log(`   Rolled back at: ${rollbackResult.rolledBackAt}`);
      } catch (error) {
        console.log(`\n⚠️  Rollback simulation: ${error.message}`);
      }
    }

    // ============================================================
    // Step 6: Scheduling Updates
    // ============================================================
    
    console.log('\n--- Scheduling Demo ---\n');
    
    // Schedule for tomorrow at 2 AM
    const tomorrow2AM = new Date();
    tomorrow2AM.setDate(tomorrow2AM.getDate() + 1);
    tomorrow2AM.setHours(2, 0, 0, 0);
    
    console.log('Scheduling update for next maintenance window...');
    
    const scheduledJob = await updateManager.scheduleUpdate('5.1.0', tomorrow2AM);
    
    console.log('✅ Update scheduled');
    console.log(`   Job ID: ${scheduledJob.jobId}`);
    console.log(`   Version: ${scheduledJob.version}`);
    console.log(`   Scheduled for: ${scheduledJob.scheduledFor}`);
    
    // Cancel the scheduled job (demo purposes)
    console.log('\nCancelling scheduled job...');
    const cancelled = updateManager.cancelScheduledUpdate(scheduledJob.jobId);
    console.log(`   Cancelled: ${cancelled ? 'Yes' : 'No'}`);

    // ============================================================
    // Step 7: Auto-Update Configuration
    // ============================================================
    
    console.log('\n--- Auto-Update Demo ---\n');
    
    // Enable auto-update with check-only (no auto-apply)
    console.log('Enabling auto-update (check only)...');
    
    const autoUpdateConfig = await updateManager.enableAutoUpdate({
      checkInterval: '0 */6 * * *',  // Every 6 hours
      autoDownload: true,
      autoApply: false,  // Require manual approval
      allowRestart: false
    });
    
    console.log('✅ Auto-update enabled');
    console.log(`   Check interval: Every 6 hours`);
    console.log(`   Auto-download: ${autoUpdateConfig.config.autoDownload}`);
    console.log(`   Auto-apply: ${autoUpdateConfig.config.autoApply}`);
    
    // Disable auto-update
    console.log('\nDisabling auto-update...');
    const disabled = updateManager.disableAutoUpdate();
    console.log(`   Auto-update: ${disabled.enabled ? 'enabled' : 'disabled'}`);

    // ============================================================
    // Step 8: State Management
    // ============================================================
    
    console.log('\n--- State Management ---\n');
    
    console.log(`Current state: ${updateManager.getState()}`);
    console.log(`Is updating: ${updateManager.isUpdating()}`);
    
    // Show all possible states
    console.log('\nAll update states:');
    Object.entries(UpdateState).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n✅ Update workflow example complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await bios.shutdown();
    console.log('\n✅ BIOS shutdown complete');
  }
}

main();

// ============================================================
// Key Concepts Demonstrated:
// ============================================================
//
// 1. Update Lifecycle:
//    - checkForUpdates() → downloadUpdate() → applyUpdate()
//    - Each step has corresponding state transitions
//
// 2. Version Comparison:
//    - Semantic versioning support
//    - Update types: patch, minor, major, hotfix
//    - Prerelease handling
//
// 3. Safety Features:
//    - Automatic backup creation
//    - Auto-rollback on failure
//    - Checksum verification
//
// 4. Scheduling:
//    - One-time scheduled updates (Date)
//    - Recurring schedules (cron expressions)
//    - Job cancellation
//
// 5. Auto-Update:
//    - Configurable check intervals
//    - Optional auto-download
//    - Manual approval for critical updates
//
// 6. History Tracking:
//    - All actions logged
//    - Success/failure tracking
//    - Backup ID association
//
// 7. Rollback:
//    - Restore from backup
//    - Version reversion
//    - History preservation
//
// ============================================================
