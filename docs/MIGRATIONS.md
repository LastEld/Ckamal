# CogniMesh Database Migrations

This document provides comprehensive documentation for all database migrations in CogniMesh v5.0.

## Table of Contents

- [Overview](#overview)
- [Migration List](#migration-list)
- [Migration Dependencies](#migration-dependencies)
- [Running Migrations](#running-migrations)
- [Rollback Instructions](#rollback-instructions)
- [Troubleshooting](#troubleshooting)

---

## Overview

CogniMesh uses a sequential migration system built on SQLite with better-sqlite3. Each migration is a JavaScript module exporting `up()` and `down()` functions.

### Migration Naming Convention

Migrations follow the pattern: `XXX_description.js` where:
- `XXX` is a 3-digit sequence number (001, 002, etc.)
- `description` is a snake_case description of the migration

### Key Features

- **Checksum validation**: Each migration file is checksummed to detect modifications after application
- **Batch tracking**: Migrations are applied in batches for atomic rollback
- **Advisory locking**: Prevents concurrent migration runs
- **Transaction safety**: Each migration runs in a transaction

---

## Migration List

### 001: Initial Schema
**File**: `001_initial_schema.js`

Creates the foundational database schema with core tables:

| Table | Description |
|-------|-------------|
| `users` | Core user accounts with authentication |
| `tasks` | Agent tasks and workflow items |
| `roadmaps` | Project roadmaps and milestones |
| `roadmap_nodes` | Nodes within roadmaps |
| `contexts` | Knowledge contexts and memory spaces |
| `conversations` | Chat/communication threads |
| `messages` | Individual messages in conversations |
| `checkpoints` | System state checkpoints |
| `audit_logs` | Comprehensive audit trail |
| `merkle_trees` | Merkle tree storage for data integrity |
| `merkle_leaves` | Individual leaves in merkle trees |
| `batches` | Batch processing tracking |
| `alerts` | System alerts and notifications |
| `analytics` | Usage and performance metrics |
| `settings` | System and user settings |

**Key Features**:
- Soft deletes on all major tables
- Foreign key constraints
- JSON columns for flexible metadata
- Comprehensive indexing
- `updated_at` triggers

---

### 002: Performance Indexes
**File**: `002_add_indexes.js`

Adds performance optimizations including:

- **Composite indexes** for common query patterns:
  - `idx_tasks_queue` - Pending tasks by priority
  - `idx_tasks_assignee_status` - Tasks by assignee
  - `idx_contexts_access` - Contexts by type and access

- **FTS5 Full-Text Search**:
  - `messages_fts` - Search message content
  - `tasks_fts` - Search task titles/descriptions
  - `contexts_fts` - Search context names

- **Vector Search Support** (optional):
  - `context_embeddings` - Vector embeddings for contexts
  - `message_embeddings` - Vector embeddings for messages
  - `document_chunks` - Document chunks for RAG

- **Partial Indexes**:
  - `idx_tasks_high_priority` - High priority tasks only
  - `idx_alerts_unresolved` - Unresolved alerts

---

### 003: Additional Performance Indexes
**File**: `003_additional_performance_indexes.js`

Adds 34 secondary indexes for specific access patterns:

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_users_session_lookup` | users | Session lookup by UUID |
| `idx_tasks_completion_stats` | tasks | Task completion statistics |
| `idx_tasks_deadline_window` | tasks | Deadline scheduling |
| `idx_roadmaps_list_view` | roadmaps | Roadmap list queries |
| `idx_nodes_hierarchy` | roadmap_nodes | Node hierarchy traversal |
| `idx_conversations_summary` | conversations | Conversation summary |
| `idx_analytics_hourly` | analytics | Hourly aggregation |
| `idx_audit_action_time` | audit_logs | Action timeline |

Also creates `index_statistics` table for index metadata.

---

### 004: Runtime Persistence
**File**: `004_runtime_persistence.js`

Creates tables for operator/session state management:

| Table | Description |
|-------|-------------|
| `runtime_state_entries` | Key-value state storage |
| `runtime_state_versions` | State version history |
| `runtime_checkpoints` | Named state checkpoints |
| `runtime_provider_sessions` | Provider session tracking |
| `runtime_agent_executions` | Agent execution records |
| `runtime_schedules` | Cron-like schedule definitions |

---

### 005: Repository Contract Alignment
**File**: `005_repository_contract_alignment.js`

**⚠️ Irreversible Migration**

Aligns database schema with repository contracts:

- **Tasks table**: Adds `quadrant`, `due_date`, `roadmap_id`, `context_id`, `tags`, `estimated_minutes`, `actual_minutes`
- **Roadmaps table**: Adds `name`, `parent_id`, `start_date`, `target_date`, `milestones`
- **Contexts table**: Adds `state_data`, `version`, `checksum`, `size_bytes`, `compressed`, `created_by`, `expires_at`
- **Merkle trees table**: Adds `name`, `context_id`, `description`, `updated_at`
- **New table**: `merkle_nodes` - For tree node storage

**Note**: This migration rebuilds the `roadmaps` table with data migration.

---

### 006: Auth System
**File**: `006_auth_system.js`

Implements multi-actor authentication inspired by Paperclip's better-auth:

| Table | Description |
|-------|-------------|
| `companies` | Multi-tenant organization support |
| `auth_users` | Enhanced user authentication |
| `auth_sessions` | Session management |
| `auth_accounts` | OAuth provider accounts |
| `auth_verifications` | Email/password reset tokens |
| `agent_api_keys` | Machine-to-machine authentication |
| `company_members` | Company membership (deprecated by 007) |

**Data Migration**: Migrates existing users from `users` table to `auth_users`.

---

### 007: Company Model Enhancement
**File**: `007_company_model.js`

Enhances multi-tenant architecture:

**Companies table extensions**:
- `uuid`, `description`, `pause_reason`, `paused_at`
- `brand_color`, `logo_url`
- `budget_monthly_cents`, `spent_monthly_cents`
- `require_approval_for_agents`
- `deleted_at`, `deleted_by`, `created_by`

**New table**: `company_memberships` (replaces `company_members`)

**Tenant isolation**: Adds `company_id` to:
- `tasks`
- `roadmaps`
- `contexts`
- `conversations`

---

### 008: Cost Tracking
**File**: `008_cost_tracking.js`

Creates cost tracking and budget management tables:

| Table | Description |
|-------|-------------|
| `cost_events` | Per-request cost tracking |
| `budgets` | Spending limits and policies |
| `budget_alerts` | Budget threshold notifications |
| `cost_rates` | Model pricing rates |

**Seeded Data**: Default cost rates for:
- Claude models (Opus, Sonnet)
- OpenAI models (GPT-5.4 Codex, GPT-5.3 Codex)
- Moonshot models (Kimi K2.5)

---

### 009: Plugin System
**File**: `009_plugin_system.js`

Creates comprehensive plugin management tables:

| Table | Description |
|-------|-------------|
| `plugins` | Plugin registry |
| `plugin_configs` | Plugin configurations |
| `plugin_states` | Isolated state storage |
| `plugin_tools` | Registered tool metadata |
| `plugin_ui_slots` | UI slot registrations |
| `plugin_events` | Event delivery tracking |
| `plugin_logs` | Aggregated plugin logs |
| `plugin_executions` | Tool execution history |
| `plugin_dependencies` | Dependency graph |
| `plugin_webhooks` | Webhook endpoint registrations |

**Views**: `v_active_plugins`, `v_plugin_health`

---

### 010: Heartbeat Runtime
**File**: `010_heartbeat_runtime.js`

Creates runtime execution tracking inspired by Paperclip:

| Table | Description |
|-------|-------------|
| `heartbeat_runs` | Core run tracking |
| `heartbeat_run_events` | Event log for runs |
| `agent_sessions` | Per-task session persistence |
| `agent_wakeup_requests` | Wakeup queue |
| `agent_runtime_state` | Current state per agent |
| `cost_ledger` | Cost tracking per run |

---

### 011: Document Versioning
**File**: `011_document_versioning.js`

Creates document management with version history:

| Table | Description |
|-------|-------------|
| `documents` | Main document records |
| `document_revisions` | Version history |
| `document_shares` | Cross-company sharing |
| `document_subscriptions` | User subscriptions |

**Features**:
- Full-text search via `documents_fts`
- Soft deletes
- Cross-company sharing with permissions

---

### 012: Issue System
**File**: `012_issue_system.js`

Creates comprehensive issue tracking (inspired by Paperclip):

| Table | Description |
|-------|-------------|
| `issues` | Core issue tracking |
| `issue_comments` | Threaded comments |
| `issue_labels` | Label definitions |
| `issue_label_links` | Issue-label relationships |
| `issue_attachments` | File attachments |
| `issue_read_states` | Read/unread tracking |
| `issue_assignment_history` | Assignment tracking |

**Seeded Data**: Default labels (bug, feature, enhancement, documentation, help wanted, good first issue)

---

### 013: Approval Workflows
**File**: `013_approval_workflows.js`

Creates approval workflow system for agent actions:

| Table | Description |
|-------|-------------|
| `approvals` | Core approval requests |
| `approval_comments` | Discussion thread |
| `approval_delegations` | Temporary delegation |
| `approval_policies` | Approval rules |
| `approval_audit_log` | Immutable audit trail |
| `approval_stakeholders` | Notification list |

---

### 014: Routine Scheduling
**File**: `014_routine_scheduling.js`

Creates cron-like routine scheduling system:

| Table | Description |
|-------|-------------|
| `routines` | Scheduled task definitions |
| `routine_triggers` | Trigger configurations |
| `routine_runs` | Execution history |
| `routine_assignments` | Agent assignments |
| `routine_scheduler_locks` | Distributed locking |

**Trigger Types**: `cron`, `webhook`, `event`, `manual`

---

### 015: Activity Logging
**File**: `015_activity_logging.js`

Creates comprehensive activity logging:

| Table | Description |
|-------|-------------|
| `activity_categories` | Event categorization |
| `activity_log` | Core activity tracking |
| `activity_log_details` | Large payloads |
| `activity_log_aggregates` | Daily summaries |
| `activity_log_subscriptions` | Real-time subscriptions |
| `activity_log_anomalies` | Detected anomalies |

**Seeded Categories**: auth, security, data, admin, agent, system, integration, user

**Views**: `v_activity_timeline`, `v_activity_by_entity`, `v_security_events`, `v_recent_activity`

---

### 016: Webhook System
**File**: `016_webhooks.js`

Creates comprehensive webhook management:

| Table | Description |
|-------|-------------|
| `webhooks` | Webhook configurations |
| `webhook_event_types` | Event type subscriptions |
| `webhook_deliveries` | Delivery tracking |
| `webhook_delivery_attempts` | Detailed attempt history |
| `webhook_events` | Event store for replay |
| `webhook_stats` | Daily statistics |

**Views**: `v_webhook_delivery_summary`, `v_webhook_recent_failures`, `v_webhook_health`

---

### 017: Skills System
**File**: `017_skills.js`

Creates skill management tables:

| Table | Description |
|-------|-------------|
| `skills` | Main skill registry |
| `skill_versions` | Version history |
| `skill_assignments` | Agent/company assignments |
| `skill_sync_logs` | Sync operation logs |
| `agent_skills` | CV template skill requirements |

---

### 018: GitHub Integration
**File**: `018_github_integration.js`

Creates GitHub synchronization tables:

| Table | Description |
|-------|-------------|
| `github_repos` | Connected repositories |
| `github_issue_sync` | Issue synchronization mapping |
| `github_comment_sync` | Comment synchronization |
| `github_webhook_log` | Webhook event log |
| `github_sync_queue` | Pending sync operations |

**Sync Directions**: `to_github`, `from_github`, `bidirectional`

---

## Migration Dependencies

```
001_initial_schema
    ├── 002_add_indexes
    ├── 003_additional_performance_indexes
    └── 004_runtime_persistence

005_repository_contract_alignment (depends on 001)

006_auth_system
    ├── 007_company_model (extends companies from 006)
    ├── 008_cost_tracking (references auth_users)
    └── 012_issue_system (references auth_users)

009_plugin_system (independent)
010_heartbeat_runtime (independent)
011_document_versioning (depends on 006, 007)
013_approval_workflows (depends on 006, 007)
014_routine_scheduling (independent)
015_activity_logging (depends on 006, 007)
016_webhooks (independent)
017_skills (depends on 006, 007)
018_github_integration (depends on 012)
```

---

## Running Migrations

### Basic Usage

```bash
# Run all pending migrations
npm run db:migrate

# Or directly
node scripts/migrate.js up
```

### Migration Runner Options

```bash
# Check migration status
node scripts/migrate.js status

# Run migrations (default)
node scripts/migrate.js up

# Rollback last batch
node scripts/migrate.js down

# Rollback specific number of batches
node scripts/migrate.js down --steps 2

# Rollback and re-run last batch
node scripts/migrate.js redo

# Dry run (show what would happen)
node scripts/migrate.js up --dry-run

# Force run (ignore checksum failures)
node scripts/migrate.js up --force

# Reset all migrations (dangerous!)
node scripts/migrate.js reset

# Fresh start (reset + migrate)
node scripts/migrate.js fresh
```

### Programmatic Usage

```javascript
import { createMigrationRunner } from './src/db/migrations/index.js';

const runner = createMigrationRunner(db, {
  migrationsPath: './src/db/migrations',
  migrationsTable: 'migrations',
  lockTimeout: 30000
});

// Run migrations
await runner.runMigrations();

// Check status
const status = runner.status();
console.log(status);
// { applied: 18, pending: 0, total: 18, currentBatch: 5, lastApplied: '018_github_integration' }

// Rollback
await runner.rollback(1);

// Full reset
await runner.reset();

// Fresh start
await runner.fresh();
```

---

## Rollback Instructions

### Standard Rollback

Rollback migrations by batch:

```bash
# Rollback last batch
node scripts/migrate.js down

# Rollback multiple batches
node scripts/migrate.js down --steps 3

# Rollback all migrations
node scripts/migrate.js reset
```

### Migration-Specific Notes

| Migration | Rollback Behavior | Notes |
|-----------|-------------------|-------|
| 001 | Destructive | Drops all tables, data loss |
| 002 | Safe | Drops indexes and FTS tables |
| 003 | Safe | Drops additional indexes |
| 004 | Safe | Drops runtime tables |
| 005 | **Blocked** | Throws error - restore from backup |
| 006 | Destructive | Removes auth tables, company data remains |
| 007 | Partial | Removes memberships, keeps company_id columns |
| 008 | Safe | Drops cost tracking tables |
| 009 | Safe | Drops plugin tables |
| 010 | Safe | Drops heartbeat tables |
| 011 | Safe | Drops document tables |
| 012 | Safe | Drops issue tables |
| 013 | Safe | Drops approval tables |
| 014 | Safe | Drops routine tables |
| 015 | Safe | Drops activity log tables |
| 016 | Safe | Drops webhook tables |
| 017 | Safe | Drops skill tables |
| 018 | Safe | Drops GitHub tables |

### Handling Irreversible Migrations

Migration **005_repository_contract_alignment** cannot be rolled back. If rollback is needed:

1. **Create a backup before migrating**:
   ```bash
   npm run db:backup
   ```

2. **If rollback needed**, restore from backup:
   ```bash
   node scripts/backup-restore.js --file backup-YYYYMMDD-HHMMSS.db
   ```

3. **Alternative**: Create a new migration to reverse specific changes.

---

## Troubleshooting

### Checksum Mismatch

**Error**: `Checksum mismatch for migration "XXX". The migration file has been modified after it was applied.`

**Cause**: Migration file was modified after being applied to the database.

**Solutions**:

1. **Verify intention**: Check if modification was intentional
2. **Force run** (if modification is safe):
   ```bash
   node scripts/migrate.js up --force
   ```
3. **Restore original file** from version control
4. **Create new migration** for additional changes

### Lock Timeout

**Error**: `Could not acquire migration lock within timeout`

**Cause**: Another process is holding the migration lock.

**Solutions**:

1. Check for running processes:
   ```bash
   ps aux | grep node
   ```

2. Clear stuck lock (if process crashed):
   ```sql
   DELETE FROM _migration_lock WHERE lock_key = 'migration_lock';
   ```

3. Increase timeout:
   ```bash
   node scripts/migrate.js up --timeout 60000
   ```

### Foreign Key Constraint Failed

**Error**: `FOREIGN KEY constraint failed` during rollback

**Cause**: Data exists that depends on tables being dropped.

**Solutions**:

1. Check for dependent data:
   ```sql
   SELECT * FROM table_name WHERE foreign_key_column IS NOT NULL;
   ```

2. Delete dependent data or disable foreign keys during rollback:
   ```sql
   PRAGMA foreign_keys = OFF;
   -- Perform rollback
   PRAGMA foreign_keys = ON;
   ```

### Migration Fails Mid-Batch

**Issue**: Partial batch applied, some migrations succeeded, others failed.

**Solution**:

1. Check migration status:
   ```bash
   node scripts/migrate.js status
   ```

2. Fix the failing migration issue

3. Re-run migrations (already-applied migrations are skipped):
   ```bash
   node scripts/migrate.js up
   ```

### Database Locked

**Error**: `database is locked`

**Cause**: Another connection has an open transaction.

**Solutions**:

1. Close other applications using the database
2. Restart the application
3. Check for long-running queries:
   ```sql
   PRAGMA busy_timeout = 5000;
   ```

### Corrupted Migration Table

**Issue**: `migrations` table has incorrect or missing entries.

**Recovery**:

1. Export current schema (without data):
   ```bash
   sqlite3 database.db ".schema" > schema.sql
   ```

2. Identify which migrations have been applied by comparing schema

3. Manually insert missing migration records:
   ```sql
   INSERT INTO migrations (name, batch, applied_at) 
   VALUES ('001_initial_schema', 1, datetime('now'));
   ```

### Migration Performance Issues

**Issue**: Migrations taking too long on large datasets.

**Solutions**:

1. Run during low-traffic periods
2. Use `--dry-run` to estimate time
3. Consider batching data migrations:
   ```javascript
   // In migration file
   const batchSize = 1000;
   let offset = 0;
   while (true) {
     const rows = db.prepare(`SELECT * FROM table LIMIT ? OFFSET ?`).all(batchSize, offset);
     if (rows.length === 0) break;
     // Process batch
     offset += batchSize;
   }
   ```

### Debugging Migrations

Enable verbose logging:

```bash
DEBUG=migrate node scripts/migrate.js up
```

Or in code:

```javascript
const runner = createMigrationRunner(db, { verbose: true });
```

### Getting Help

1. Check migration logs in `logs/migrations.log`
2. Review database state:
   ```sql
   SELECT * FROM migrations ORDER BY batch, name;
   SELECT * FROM _migration_lock;
   ```
3. Check application logs for related errors
