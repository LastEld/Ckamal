# CogniMesh Database Architecture

## Overview

CogniMesh uses SQLite as its primary database with a custom migration system managing 18 schema migrations. The database supports multi-tenancy through company scoping and provides comprehensive audit trails.

## Schema Overview

### Migration Timeline

| # | Migration | Description | Tables Added |
|---|-----------|-------------|--------------|
| 001 | Initial Schema | Core tables | 10 tables |
| 002 | Add Indexes | Performance indexes | - |
| 003 | Additional Performance Indexes | More indexes | - |
| 004 | Runtime Persistence | Runtime state | 2 tables |
| 005 | Repository Contract Alignment | Contract tables | 2 tables |
| 006 | Auth System | Multi-actor auth | 7 tables |
| 007 | Company Model | Multi-tenancy | 1 table |
| 008 | Cost Tracking | Billing system | 4 tables |
| 009 | Plugin System | Plugin architecture | 10 tables |
| 010 | Heartbeat Runtime | Agent runs | 5 tables |
| 011 | Document Versioning | Doc versioning | 2 tables |
| 012 | Issue System | Issue tracking | 2 tables |
| 013 | Approval Workflows | Approval system | 2 tables |
| 014 | Routine Scheduling | Scheduled tasks | 2 tables |
| 015 | Activity Logging | Activity feed | 1 table |
| 016 | Webhooks | Webhook system | 1 table |
| 017 | Skills | Skill management | 2 tables |
| 018 | GitHub Integration | GitHub sync | 2 tables |

**Total: 56 tables + views**

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           COGNIMESH DATABASE SCHEMA                             │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    companies    │     │   auth_users    │     │  agent_api_keys │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │◄────┤ company_id (FK) │     │ actor_id        │
│ name            │     │ id (PK)         │     │ company_id (FK)─┼──►┌─────────┐
│ slug            │     │ email           │     │ key_hash        │   │ company_│
│ settings        │     │ password_hash   │     │ permissions     │   │ members │
│ status          │     │ role            │     │ expires_at      │   └─────────┘
└────────┬────────┘     │ status          │     └─────────────────┘
         │              └─────────────────┘
         │
         │              ┌─────────────────┐
         │              │ auth_sessions   │
         │              ├─────────────────┤
         │              │ id (PK)         │
         └─────────────►│ user_id (FK)    │
                        │ token           │
                        │ expires_at      │
                        └─────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CORE DOMAIN TABLES                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     tasks       │     │   roadmaps      │     │   contexts      │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ company_id (FK) │     │ company_id (FK) │     │ company_id (FK) │
│ title           │     │ title           │     │ name            │
│ status          │     │ description     │     │ type            │
│ priority        │     │ status          │     │ snapshot_data   │
│ assignee_id     │     │ owner_id        │     │ version         │
│ parent_id ──────┼────►│ created_at      │     │ checksum        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         │              ┌─────────────────┐
         └─────────────►│ task_comments   │
                        ├─────────────────┤
                        │ id (PK)         │
                        │ task_id (FK)    │
                        │ user_id (FK)    │
                        │ content         │
                        └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   cost_events   │     │    budgets      │     │ budget_alerts   │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ company_id (FK)─┼────►│ scope_type      │     │ budget_id (FK)──┼──┐
│ user_id (FK)    │     │ scope_id        │     │ level           │  │
│ agent_id        │     │ amount          │     │ threshold       │  │
│ provider        │     │ period          │     │ acknowledged    │  │
│ total_cost      │     │ enforcement     │     └─────────────────┘  │
│ input_tokens    │     └─────────────────┘                          │
│ output_tokens   │                                                  │
└─────────────────┘                                                  │
                                                                     │
┌────────────────────────────────────────────────────────────────────┘
│                         BILLING SYSTEM

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ heartbeat_runs  │     │ heartbeat_run_  │     │  cost_ledger    │
├─────────────────┤     │ _events         │     ├─────────────────┤
│ id (PK)         │     ├─────────────────┤     │ id (PK)         │
│ agent_id (FK)   │◄────┤ run_id (FK)     │     │ run_id (FK)─────┼──►┌─────────────┐
│ status          │     │ agent_id (FK)   │     │ agent_id (FK)   │   │agent_runtime│
│ invocation_src  │     │ seq             │     │ provider        │   │    _state   │
│ started_at      │     │ event_type      │     │ cost_cents      │   ├─────────────┤
│ finished_at     │     │ stream          │     │ input_tokens    │   │ agent_id(PK)│
│ usage_json      │     │ message         │     │ output_tokens   │   │ last_run_id │
└─────────────────┘     └─────────────────┘     └─────────────────┘   │ total_cost  │
                                                                      └─────────────┘
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PLUGIN SYSTEM TABLES                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    plugins      │     │ plugin_configs  │     │ plugin_states   │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │◄────┤ plugin_id (FK)  │     │ plugin_id (FK)──┼──┐
│ version         │     │ config          │     │ scope_kind      │  │
│ name            │     │ is_encrypted    │     │ scope_id        │  │
│ status          │     │ updated_by      │     │ namespace       │  │
│ capabilities    │     └─────────────────┘     │ state_key       │  │
│ manifest_hash   │                             │ value           │  │
└────────┬────────┘                             └─────────────────┘  │
         │                                                           │
         │              ┌─────────────────┐     ┌─────────────────┐  │
         ├─────────────►│  plugin_tools   │     │plugin_executions│  │
         │              ├─────────────────┤     ├─────────────────┤  │
         │              │ id (PK)         │     │ id (PK)         │  │
         └─────────────►│ plugin_id (FK)  │     │ plugin_id (FK)  │◄─┘
                        │ tool_name       │     │ tool_name       │
                        │ full_name       │     │ execution_id    │
                        │ parameters_     │     │ input_params    │
                        │   schema        │     │ output_result   │
                        └─────────────────┘     │ success         │
                                                │ duration_ms     │
┌─────────────────┐     ┌─────────────────┐     └─────────────────┘
│  plugin_events  │     │  plugin_logs    │
├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │
│ plugin_id (FK)  │     │ plugin_id (FK)  │
│ event_type      │     │ level           │
│ payload         │     │ message         │
│ delivered_at    │     │ metadata        │
│ processed_at    │     │ timestamp       │
└─────────────────┘     └─────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                         SUPPORTING TABLES                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     issues      │     │   approvals     │     │   routines      │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ company_id (FK) │     │ request_id      │     │ name            │
│ title           │     │ requester_id    │     │ schedule        │
│ status          │     │ approver_id     │     │ last_run_at     │
│ priority        │     │ status          │     │ next_run_at     │
│ assignee_id     │     │ risk_level      │     │ is_active       │
└─────────────────┘     │ expires_at      │     └─────────────────┘
                        └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    skills       │     │ skill_sync      │     │    webhooks     │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ name            │     │ skill_id (FK)   │     │ company_id (FK) │
│ type            │     │ source          │     │ endpoint_url    │
│ content         │     │ sync_status     │     │ events          │
│ version         │     │ last_sync_at    │     │ is_active       │
└─────────────────┘     └─────────────────┘     └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ activity_logs   │     │  documents      │     │ doc_versions    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ company_id (FK) │     │ company_id (FK) │     │ document_id(FK) │
│ actor_type      │     │ title           │     │ version_number  │
│ actor_id        │     │ current_version │◄────┤ content         │
│ action          │     │ latest_version  │     │ created_by      │
│ entity_type     │     └─────────────────┘     └─────────────────┘
└─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  merkle_trees   │     │ merkle_leaves   │     │  conversations  │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ tree_type       │     │ tree_id (FK)    │     │ company_id (FK) │
│ root_hash       │     │ leaf_hash       │     │ agent_id        │
│ leaf_count      │     │ data            │     │ status          │
│ last_verified   │     │ timestamp       │     │ context_json    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Table Reference

### Authentication (Migration 006)

#### companies
Multi-tenant organization table.

```sql
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  settings TEXT DEFAULT '{}',
  status TEXT DEFAULT 'active', -- active|suspended|deleted
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### auth_users
User authentication table.

```sql
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT 0,
  password_hash TEXT,
  company_id TEXT REFERENCES companies(id),
  role TEXT DEFAULT 'user', -- admin|user|guest
  status TEXT DEFAULT 'active', -- active|inactive|suspended|deleted
  last_login_at DATETIME,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### agent_api_keys
Machine-to-machine authentication.

```sql
CREATE TABLE agent_api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT,
  actor_id TEXT NOT NULL,
  actor_type TEXT DEFAULT 'agent', -- user|agent
  company_id TEXT REFERENCES companies(id),
  permissions TEXT DEFAULT '[]',
  rate_limit INTEGER DEFAULT 500,
  expires_at DATETIME,
  last_used_at DATETIME,
  use_count INTEGER DEFAULT 0,
  revoked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Billing (Migration 008)

#### cost_events
Per-request cost tracking.

```sql
CREATE TABLE cost_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  company_id INTEGER,
  user_id INTEGER,
  agent_id TEXT,
  request_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0,
  routing_strategy TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### budgets
Spending limits and policies.

```sql
CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  scope_type TEXT NOT NULL, -- global|company|user|agent
  scope_id TEXT,
  name TEXT NOT NULL,
  period TEXT NOT NULL, -- daily|weekly|monthly|yearly|custom
  amount REAL NOT NULL,
  alert_threshold_1 REAL DEFAULT 0.50,
  alert_threshold_2 REAL DEFAULT 0.75,
  alert_threshold_3 REAL DEFAULT 0.90,
  enforcement_mode TEXT DEFAULT 'hard', -- soft|hard|notify_only
  is_active BOOLEAN DEFAULT 1
);
```

### Heartbeat Runtime (Migration 010)

#### heartbeat_runs
Agent execution run tracking.

```sql
CREATE TABLE heartbeat_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  invocation_source TEXT, -- timer|assignment|on_demand|automation
  trigger_detail TEXT, -- manual|ping|callback|system
  status TEXT DEFAULT 'queued', -- queued|running|succeeded|failed|cancelled|timed_out
  started_at DATETIME,
  finished_at DATETIME,
  error TEXT,
  error_code TEXT,
  usage_json TEXT DEFAULT '{}',
  result_json TEXT,
  context_snapshot TEXT DEFAULT '{}',
  retry_of_run_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### cost_ledger
Per-run cost tracking.

```sql
CREATE TABLE cost_ledger (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  agent_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  biller TEXT DEFAULT 'unknown',
  model TEXT DEFAULT 'unknown',
  input_tokens INTEGER DEFAULT 0,
  cached_input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Plugin System (Migration 009)

#### plugins
Plugin registry.

```sql
CREATE TABLE plugins (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'installed', -- installed|registered|loading|active|failed|terminated
  manifest_path TEXT NOT NULL,
  capabilities TEXT DEFAULT '[]',
  manifest_hash TEXT NOT NULL,
  installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  activated_at DATETIME
);
```

#### plugin_states
Isolated plugin state storage.

```sql
CREATE TABLE plugin_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  scope_kind TEXT DEFAULT 'instance', -- instance|project|task|conversation|user|context|global
  scope_id TEXT,
  namespace TEXT DEFAULT 'default',
  state_key TEXT NOT NULL,
  value TEXT,
  version INTEGER DEFAULT 1,
  expires_at DATETIME,
  FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
  UNIQUE(plugin_id, scope_kind, scope_id, namespace, state_key)
);
```

### Other Key Tables

#### tasks
Task management with Eisenhower matrix support.

```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE,
  company_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  quadrant TEXT, -- urgent_important, not_urgent_important, etc.
  due_date DATETIME,
  assignee_id INTEGER,
  parent_id INTEGER,
  metadata TEXT DEFAULT '{}'
);
```

#### issues
Issue tracking system.

```sql
CREATE TABLE issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE,
  company_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  assignee_id INTEGER,
  reporter_id INTEGER,
  labels TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### approvals
Approval workflow system.

```sql
CREATE TABLE approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT UNIQUE NOT NULL,
  requester_id TEXT NOT NULL,
  requester_type TEXT, -- user|agent
  action_type TEXT NOT NULL,
  action_params TEXT,
  status TEXT DEFAULT 'pending', -- pending|approved|rejected|auto_approved|expired
  risk_level TEXT, -- low|medium|high|critical
  approver_id TEXT,
  expires_at DATETIME
);
```

## Indexes

### Performance Indexes

```sql
-- Auth indexes
CREATE INDEX idx_auth_users_email ON auth_users(email) WHERE status != 'deleted';
CREATE INDEX idx_auth_users_company ON auth_users(company_id) WHERE status = 'active';
CREATE INDEX idx_agent_api_keys_actor ON agent_api_keys(actor_id, actor_type);

-- Cost indexes
CREATE INDEX idx_cost_events_company_created ON cost_events(company_id, created_at);
CREATE INDEX idx_cost_events_agent ON cost_events(agent_id, created_at);

-- Heartbeat indexes
CREATE INDEX idx_heartbeat_runs_agent ON heartbeat_runs(agent_id, created_at DESC);
CREATE INDEX idx_heartbeat_runs_status ON heartbeat_runs(status, agent_id);

-- Plugin indexes
CREATE INDEX idx_plugin_states_scope ON plugin_states(scope_kind, scope_id);
CREATE INDEX idx_plugin_tools_full_name ON plugin_tools(full_name);
```

## Migration Guide

### Running Migrations

```javascript
import { runMigrations } from './db/migrations/index.js';

// Run all pending migrations
const result = await runMigrations(db, {
  migrationsPath: './db/migrations'
});

console.log(`Applied ${result.migrations.length} migrations in batch ${result.batch}`);
```

### Creating New Migrations

```javascript
import { createMigrationRunner } from './db/migrations/index.js';

const runner = createMigrationRunner(db);
const { filename, path } = await runner.createMigration('add_user_preferences');

// Edit the generated file
```

### Migration Template

```javascript
/**
 * Migration: Add user preferences
 */

export function up(db) {
  db.exec(`
    CREATE TABLE user_preferences (
      user_id TEXT PRIMARY KEY,
      theme TEXT DEFAULT 'light',
      notifications_enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    );
  `);
}

export function down(db) {
  db.exec(`DROP TABLE IF EXISTS user_preferences;`);
}
```

### Rollback Migrations

```javascript
// Rollback last batch
await runner.rollback(1);

// Rollback all migrations
await runner.rollback('all');

// Fresh start (rollback + re-run)
await runner.fresh();
```

### Migration Status

```javascript
const status = runner.status();
console.log({
  applied: status.applied,
  pending: status.pending,
  currentBatch: status.currentBatch,
  lastApplied: status.lastApplied
});
```

## Best Practices

### Schema Design
1. Always use foreign keys with proper ON DELETE actions
2. Include `created_at` and `updated_at` on all tables
3. Use UUIDs for external references, integers for internal
4. Store JSON in TEXT columns with validation

### Indexing
1. Index all foreign key columns
2. Index columns used in WHERE clauses
3. Use partial indexes for filtered queries
4. Index columns used in ORDER BY

### Migrations
1. Never modify existing migration files after they've been applied
2. Always provide both `up` and `down` functions
3. Test migrations on a copy of production data
4. Use transactions for data integrity

---

*Version: 5.0.0*  
*Total Migrations: 18*  
*Total Tables: 56*  
*Last Updated: 2026-03-28*
