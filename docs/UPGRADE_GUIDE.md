# CogniMesh v1 to v2 Upgrade Guide

This guide walks you through upgrading from CogniMesh v1.x to v2.0.

## Table of Contents

- [Overview](#overview)
- [Pre-Upgrade Checklist](#pre-upgrade-checklist)
- [Breaking Changes](#breaking-changes)
- [Configuration Changes](#configuration-changes)
- [Data Migration Steps](#data-migration-steps)
- [Post-Upgrade Verification](#post-upgrade-verification)
- [Rollback Procedure](#rollback-procedure)
- [Troubleshooting](#troubleshooting)

---

## Overview

CogniMesh v2.0 introduces significant architectural changes including:

- **Multi-tenancy support** with company/organization model
- **Enhanced authentication** with OAuth and API key support
- **Plugin system** for extensibility
- **Cost tracking** and budget management
- **Activity logging** with anomaly detection
- **GitHub integration** for issue synchronization

### Version Mapping

| v1 Component | v2 Equivalent | Migration |
|--------------|---------------|-----------|
| `users` table | `auth_users` | 006, 007 |
| Basic tasks | Enhanced tasks with company_id | 005, 007 |
| Simple contexts | Contexts with state_data | 005 |
| N/A | Companies/Organizations | 006, 007 |
| N/A | Plugin System | 009 |
| N/A | Cost Tracking | 008 |
| N/A | Activity Logging | 015 |
| N/A | GitHub Integration | 018 |

---

## Pre-Upgrade Checklist

Before starting the upgrade, complete these steps:

### 1. Backup Your Data

```bash
# Create full database backup
cp data/cognimesh.db data/cognimesh-v1-backup-$(date +%Y%m%d).db

# Or use the built-in backup tool
npm run db:backup
```

### 2. Check Current Version

```bash
# Check current application version
cat package.json | grep version

# Check migration status
node scripts/migrate.js status
```

### 3. Review Breaking Changes

Read through [Breaking Changes](#breaking-changes) to identify impacts on:
- Custom integrations
- API clients
- Database queries
- Configuration files

### 4. System Requirements

Verify your system meets v2 requirements:

| Requirement | v1 Minimum | v2 Minimum |
|-------------|------------|------------|
| Node.js | 16.x | 18.x |
| SQLite | 3.35+ | 3.37+ |
| RAM | 512MB | 1GB |
| Disk | 1GB | 2GB |

### 5. Notify Users

Schedule downtime and notify users if applicable.

---

## Breaking Changes

### API Changes

#### Authentication

**v1**:
```javascript
// Token-based auth in headers
Authorization: Bearer <token>
```

**v2**:
```javascript
// Support for multiple auth methods
Authorization: Bearer <session_token>
X-API-Key: <api_key>
X-Agent-Key: <agent_key>
```

#### Response Format

**v1**:
```json
{
  "data": { ... },
  "success": true
}
```

**v2**:
```json
{
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2024-01-01T00:00:00Z",
    "companyId": "company_uuid"
  }
}
```

### Database Schema Changes

#### Users Table Migration

The `users` table is deprecated in favor of `auth_users`:

| v1 Column | v2 Column | Notes |
|-----------|-----------|-------|
| `id` | `id` | Type changed: INTEGER → TEXT (UUID) |
| `username` | `name` | Consolidated with display_name |
| `display_name` | `name` | Same field |
| `email` | `email` | Unchanged |
| `role` | `role` | Values changed: 'user','admin' → 'user','admin','guest' |
| `status` | `status` | Values changed |
| N/A | `company_id` | New required field |

#### Foreign Key Changes

Tables now reference `auth_users.id` instead of `users.id`:
- `tasks.creator_id`
- `tasks.assignee_id`
- `conversations.creator_id`
- `roadmaps.owner_id`

### Configuration Changes

#### Environment Variables

**Deprecated**:
```bash
AUTH_MODE=basic
SINGLE_TENANT=true
```

**New**:
```bash
AUTH_MODE=multi_actor
DEFAULT_COMPANY_ENABLED=true
DEFAULT_COMPANY_NAME="Default Organization"
```

#### Plugin Configuration

New configuration section for plugins:

```json
{
  "plugins": {
    "enabled": true,
    "directory": "./plugins",
    "sandbox": true,
    "allowedHosts": ["api.example.com"]
  }
}
```

---

## Configuration Changes

### Step 1: Update .env File

Create a backup and update your `.env`:

```bash
cp .env .env.v1.backup
cp .env.example .env
```

### Step 2: Migrate Settings

Copy values from old `.env` and map to new keys:

| Old Key | New Key | Default |
|---------|---------|---------|
| `DATABASE_PATH` | `DATABASE_URL` | `file:./data/cognimesh.db` |
| `JWT_SECRET` | `AUTH_SECRET` | (required) |
| `API_RATE_LIMIT` | `RATE_LIMIT_REQUESTS` | 1000 |
| N/A | `COMPANY_ISOLATION` | true |
| N/A | `COST_TRACKING_ENABLED` | true |

### Step 3: Add New Required Settings

```bash
# Company/Organization
DEFAULT_COMPANY_ENABLED=true
DEFAULT_COMPANY_NAME="Default Organization"
DEFAULT_COMPANY_SLUG="default"

# Cost Tracking
COST_TRACKING_ENABLED=true
DEFAULT_BUDGET_ALERT_THRESHOLD=0.80

# Activity Logging
ACTIVITY_LOGGING_ENABLED=true
ACTIVITY_LOG_RETENTION_DAYS=90

# Plugins
PLUGINS_ENABLED=true
PLUGINS_DIRECTORY=./plugins
```

### Step 4: Configure Authentication Providers

For OAuth integration:

```bash
# GitHub OAuth
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

---

## Data Migration Steps

### Step 1: Stop the Application

```bash
# Stop running services
npm run stop
# or
pm2 stop cognimesh
# or kill the process
```

### Step 2: Create Pre-Migration Backup

```bash
# Full backup
cp data/cognimesh.db data/cognimesh-pre-v2.db

# Schema export
sqlite3 data/cognimesh.db ".schema" > schema-v1.sql

# Data export (optional)
sqlite3 data/cognimesh.db ".dump" > data-v1.sql
```

### Step 3: Update Application Code

```bash
# Pull v2 code
git fetch origin
git checkout v2.0.0

# Install dependencies
npm install

# Verify installation
npm run doctor
```

### Step 4: Run Database Migrations

```bash
# Check migration status
node scripts/migrate.js status

# Preview migrations (dry run)
node scripts/migrate.js up --dry-run

# Apply migrations
node scripts/migrate.js up

# If errors occur, check logs
node scripts/migrate.js up --verbose
```

### Step 5: Verify Migrations

```sql
-- Check applied migrations
SELECT * FROM migrations ORDER BY batch DESC;

-- Verify company creation (migration 007)
SELECT * FROM companies;

-- Verify user migration
SELECT * FROM auth_users;

-- Check company memberships
SELECT * FROM company_memberships;
```

### Step 6: Data Validation

Run validation queries to ensure data integrity:

```sql
-- Check orphaned records
SELECT COUNT(*) FROM tasks WHERE company_id IS NULL;

-- Verify foreign keys
SELECT COUNT(*) FROM tasks t 
LEFT JOIN auth_users u ON t.creator_id = u.id 
WHERE t.creator_id IS NOT NULL AND u.id IS NULL;

-- Check migration 005 alignment
SELECT COUNT(*) FROM roadmaps WHERE name IS NULL OR title IS NULL;
```

### Step 7: Configure Default Company

If migration 007 didn't create a default company (e.g., no existing users):

```sql
-- Create default company manually
INSERT INTO companies (id, name, slug, status, created_at, updated_at)
VALUES (
  lower(hex(randomblob(16))),
  'Default Organization',
  'default',
  'active',
  datetime('now'),
  datetime('now')
);

-- Assign all unassigned data to default company
UPDATE tasks SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL;
UPDATE roadmaps SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL;
UPDATE contexts SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL;
UPDATE conversations SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL;
```

---

## Post-Upgrade Verification

### Step 1: Start Application

```bash
# Start in development mode
npm run dev

# Or production mode
npm run build
npm start
```

### Step 2: Run Health Checks

```bash
# Run diagnostics
npm run bios:diagnose

# Run tests
npm test

# Verify API endpoints
curl http://localhost:3000/api/health
```

### Step 3: Verify Core Functionality

Test these critical functions:

- [ ] User login/authentication
- [ ] Task creation and assignment
- [ ] Context access
- [ ] Conversation creation
- [ ] Settings modification

### Step 4: Check Logs

```bash
# Application logs
tail -f logs/app.log

# Error logs
tail -f logs/error.log

# Migration logs
cat logs/migrations.log
```

### Step 5: Performance Check

```sql
-- Check table sizes
SELECT name, SUM(pgsize) as size 
FROM dbstat 
GROUP BY name 
ORDER BY size DESC;

-- Check index usage
SELECT name, query_count FROM index_statistics;
```

---

## Rollback Procedure

If issues occur during upgrade:

### Step 1: Stop Application

```bash
# Stop services
pm2 stop cognimesh
# or
killall node
```

### Step 2: Restore Database

```bash
# Restore from pre-migration backup
cp data/cognimesh-pre-v2.db data/cognimesh.db

# Or use backup tool
node scripts/backup-restore.js --file data/cognimesh-pre-v2.db
```

### Step 3: Restore Configuration

```bash
# Restore .env
cp .env.v1.backup .env

# Restore other configs
cp config/settings.v1.json config/settings.json
```

### Step 4: Downgrade Code

```bash
# Checkout v1
git checkout v1.x

# Reinstall dependencies
npm install

# Start application
npm start
```

### Step 5: Verify Rollback

```bash
# Check status
node scripts/migrate.js status

# Run tests
npm test

# Verify functionality
```

---

## Troubleshooting

### Migration Failures

#### Issue: Checksum Mismatch

**Symptom**: `Checksum mismatch for migration "XXX"`

**Solution**:
```bash
# If modification was intentional
node scripts/migrate.js up --force

# If modification was accidental
# Restore original migration file from git
git checkout src/db/migrations/XXX_migration_name.js
```

#### Issue: Foreign Key Constraint Failed

**Symptom**: Migration fails with foreign key error

**Solution**:
```sql
-- Find problematic records
SELECT t.* FROM tasks t 
LEFT JOIN users u ON t.creator_id = u.id 
WHERE t.creator_id IS NOT NULL AND u.id IS NULL;

-- Fix by setting to NULL or creating placeholder user
UPDATE tasks SET creator_id = NULL WHERE creator_id NOT IN (SELECT id FROM users);
```

#### Issue: Migration Timeout

**Symptom**: Lock timeout during migration

**Solution**:
```bash
# Clear stuck lock
sqlite3 data/cognimesh.db "DELETE FROM _migration_lock;"

# Retry with longer timeout
node scripts/migrate.js up --timeout 120000
```

### Application Issues

#### Issue: Authentication Failures

**Symptom**: Users cannot log in after upgrade

**Solution**:
```sql
-- Verify user migration
SELECT COUNT(*) FROM auth_users;

-- Check for password hash issues
SELECT id, email, password_hash IS NOT NULL as has_password 
FROM auth_users;

-- If needed, reset a user's password
-- (Use application admin or direct database update)
```

#### Issue: Missing Data

**Symptom**: Tasks/contexts not visible after upgrade

**Solution**:
```sql
-- Check company_id assignment
SELECT COUNT(*) FROM tasks WHERE company_id IS NULL;

-- Assign to default company if needed
UPDATE tasks 
SET company_id = (SELECT id FROM companies LIMIT 1) 
WHERE company_id IS NULL;
```

#### Issue: Plugin Errors

**Symptom**: Plugin-related errors in logs

**Solution**:
```bash
# Disable plugins temporarily
export PLUGINS_ENABLED=false

# Or in .env
PLUGINS_ENABLED=false

# Then restart
npm start
```

### Performance Issues

#### Issue: Slow Queries

**Symptom**: Application is slow after upgrade

**Solution**:
```sql
-- Update statistics
ANALYZE;

-- Check for missing indexes
PRAGMA index_list(tasks);
PRAGMA index_list(auth_users);

-- Run optimization
PRAGMA optimize;
```

#### Issue: Large Database Size

**Symptom**: Database grew significantly

**Solution**:
```bash
# Vacuum database
sqlite3 data/cognimesh.db "VACUUM;"

# Check for large tables
sqlite3 data/cognimesh.db 
  "SELECT name, SUM(pgsize) FROM dbstat GROUP BY name ORDER BY SUM(pgsize) DESC;"
```

---

## Getting Help

If you encounter issues not covered here:

1. **Check Logs**: Review `logs/error.log` and `logs/migrations.log`
2. **Run Diagnostics**: `npm run bios:diagnose`
3. **Check Documentation**: See `API_REFERENCE.md` and `ARCHITECTURE.md`
4. **Community Support**: Open an issue with:
   - Current and target version
   - Error messages
   - Migration status output
   - Relevant log excerpts

---

## Quick Reference Card

```bash
# Pre-upgrade
npm run db:backup
git stash
git checkout v2.0.0
npm install

# Migration
node scripts/migrate.js status
node scripts/migrate.js up --dry-run
node scripts/migrate.js up

# Post-upgrade
npm run bios:diagnose
npm test
npm start

# Rollback (if needed)
cp data/cognimesh-pre-v2.db data/cognimesh.db
git checkout v1.x
npm install
npm start
```
