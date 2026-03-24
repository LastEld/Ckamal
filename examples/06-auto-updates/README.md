# 06 - Auto Updates

> **Difficulty:** ⭐⭐⭐ Advanced  
> **Time:** 15 minutes

## Overview

This example demonstrates the UpdateManager for managing system updates, including checking, downloading, applying updates, and rollback capabilities.

## Concepts Covered

- UpdateManager initialization
- Checking for available updates
- Downloading updates
- Applying updates
- Scheduling updates
- Auto-update configuration
- Rollback operations
- Update history

## Files

### update-workflow.js
Demonstrates the complete update workflow:
1. Check for updates
2. Download update
3. Apply update
4. Rollback if needed

## Key APIs

### UpdateManager

#### `UpdateManager.constructor(github, config)`
Creates a new update manager.

Config options:
- `owner` - GitHub repository owner
- `repo` - GitHub repository name
- `currentVersion` - Current system version
- `tempDir` - Temporary download directory
- `backupDir` - Backup directory
- `autoRollback` - Enable auto-rollback on failure (default: true)
- `allowPrerelease` - Allow pre-release versions (default: false)

#### `UpdateManager.checkForUpdates()`
Checks for available updates on GitHub.

Returns:
```javascript
{
  available: boolean,
  currentVersion: string,
  latestVersion: string,
  release: object,
  type: 'patch' | 'minor' | 'major' | 'hotfix'
}
```

#### `UpdateManager.downloadUpdate(version)`
Downloads a specific version.

Returns:
```javascript
{
  version: string,
  downloadPath: string,
  extractDir: string,
  size: number,
  verified: boolean
}
```

#### `UpdateManager.applyUpdate(version)`
Applies a downloaded update.

Returns:
```javascript
{
  version: string,
  previousVersion: string,
  appliedAt: string,
  backupId: string,
  verified: boolean
}
```

#### `UpdateManager.scheduleUpdate(version, time)`
Schedules an update for a specific time.

Time formats:
- `Date` object - One-time scheduled update
- Cron string - Recurring schedule

#### `UpdateManager.enableAutoUpdate(options)`
Enables automatic updates.

Options:
- `checkInterval` - Cron expression for checks (default: '0 */6 * * *')
- `autoDownload` - Auto-download updates (default: true)
- `autoApply` - Auto-apply updates (default: false)

#### `UpdateManager.rollback(backupId)`
Rolls back to a previous version.

Returns:
```javascript
{
  success: boolean,
  previousVersion: string,
  restoredVersion: string,
  rolledBackAt: string
}
```

### Events

The UpdateManager emits the following events:

| Event | Description |
|-------|-------------|
| `update:available` | New update available |
| `update:downloaded` | Update downloaded successfully |
| `update:applying` | Update application started |
| `update:applied` | Update applied successfully |
| `update:failed` | Update failed |
| `update:rolledback` | Rollback completed |
| `update:ready` | Update ready to apply (auto-update) |
| `state:changed` | State machine transition |

### Update States

```javascript
UpdateState = {
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  APPLYING: 'applying',
  APPLIED: 'applied',
  FAILED: 'failed',
  ROLLING_BACK: 'rolling_back',
  ROLLED_BACK: 'rolled_back'
}
```

## Expected Output (update-workflow.js)

```
[CogniMesh v5.0] Update Workflow Example
=========================================

✅ Update manager initialized
   Current version: 5.0.0

--- Checking for Updates ---

Checking GitHub for updates...
✅ Update available!
   Current: 5.0.0
   Latest: 5.1.0
   Type: minor
   Published: 2026-03-20

--- Downloading Update ---

Downloading v5.1.0...
State: downloading
Progress: 100%
✅ Download complete!
   Size: 2.4 MB
   Verified: true
   Location: ./tmp/updates/5.1.0

--- Applying Update ---

Applying v5.1.0...
State: applying
Steps:
  1. Creating backup... ✅
  2. Applying files... ✅
  3. Running verification... ✅
  4. Updating version... ✅

✅ Update applied successfully!
   Previous: 5.0.0
   Current: 5.1.0
   Backup: backup-1711212345678

--- Update History ---

Total updates: 1
1. [apply] v5.1.0 - 2026-03-23T15:30:00.000Z ✅

--- Rollback Demo ---

Rolling back to v5.0.0...
State: rolling_back
✅ Rollback complete!
   Restored to: 5.0.0

--- Scheduling Demo ---

Scheduling update for next maintenance window...
✅ Update scheduled
   Job ID: update-5.1.0-1711212400000
   Scheduled for: 2026-03-24T02:00:00.000Z

--- Auto-Update Demo ---

Enabling auto-update (check only)...
✅ Auto-update enabled
   Check interval: Every 6 hours
   Auto-download: true
   Auto-apply: false

✅ Update workflow example complete!
```

## Next Steps

Now that you understand update management:

- [07-custom-agents](../07-custom-agents/) - Learn to create custom agents
