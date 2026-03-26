# Backup Automation System

Full backup automation for CogniMesh with monitoring, S3 upload, and verification.

## Created Files

| File | Description |
|------|-------------|
| `src/db/backup-scheduler.js` | Backup scheduler with cron, metrics, S3 |
| `scripts/backup-restore.js` | Backup restore script |
| `scripts/backup-verify.js` | Backup verification script |
| `src/api/routes/backup-monitor.js` | API endpoints for monitoring |
| `tests/unit/db/backup-scheduler.test.js` | Unit tests |
| `examples/backup-automation.js` | Usage example |

## NPM Scripts

```json
"db:backup"            // Create manual backup
"db:backup:restore"    // Restore from backup
"db:backup:verify"     // Verify backups
"db:backup:schedule"   // Start scheduled backups
```

## Quick Start

### 1. Start the Scheduler

```javascript
import { BackupScheduler } from './src/db/backup-scheduler.js';

const scheduler = new BackupScheduler({
  schedule: '0 2 * * *',      // Daily at 2:00
  retentionDays: 7,            // Retain for 7 days
  verifyBackups: true          // Verify after creation
});

await scheduler.initialize();
scheduler.startScheduler();
```

### 2. CLI Commands

```bash
# List backups
node scripts/backup-restore.js --list

# Restore
node scripts/backup-restore.js backup-2024-01-15T10-30-00-000Z --force

# Verification
node scripts/backup-verify.js --verbose

# Delete corrupted
node scripts/backup-verify.js --fix
```

### 3. S3 Integration

```javascript
const scheduler = new BackupScheduler({
  s3Config: {
    endpoint: 'https://s3.example.com',
    bucket: 'backups',
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    prefix: 'cognimesh/'
  }
});
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/backup/status` | GET | Scheduler status |
| `/api/backup/metrics` | GET | Backup metrics |
| `/api/backup/health` | GET | Health check |
| `/api/backup/trigger` | POST | Trigger backup |
| `/api/backup/list` | GET | List backups |
| `/api/backup/verify` | POST | Verification |
| `/api/backup/cleanup` | POST | Clean up old backups |

## Metrics

```javascript
const metrics = scheduler.getMetrics();
// {
//   totalBackups: 100,
//   successfulBackups: 98,
//   failedBackups: 2,
//   lastBackupTime: '2024-01-15T10:30:00.000Z',
//   averageBackupTime: 1500,
//   recentHistory: [...]
// }
```

## Health Check

```bash
curl http://localhost:3000/api/backup/health
```

Response:
```json
{
  "status": "healthy",
  "issues": [],
  "latestBackup": {
    "name": "backup-2024-01-15T10-30-00-000Z",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "age": "2 hours ago"
  },
  "schedulerRunning": true
}
```

## Backup Verification

Checks:
- ✅ File exists and is readable
- ✅ File size > 0
- ✅ SQLite magic bytes
- ✅ SQLite integrity_check
- ✅ Table count > 0
- ✅ SHA-256 hash (optional)

## Testing

```bash
npm test -- backup-scheduler.test.js
```

## Architecture

```
┌─────────────────┐
│ BackupScheduler │
├─────────────────┤
│ - cron schedule │
│ - metrics       │
│ - S3 handler    │
│ - verifier      │
└────────┬────────┘
         │
    ┌────┴────┬─────────────┐
    ▼         ▼             ▼
┌────────┐ ┌────────┐  ┌──────────┐
│ Manager│ │ Metrics│  │ Verifier │
└────────┘ └────────┘  └──────────┘
```
