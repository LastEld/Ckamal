# Database Schema Documentation

## Overview

CogniMesh v5.0 uses SQLite as its primary database with a custom connection pooling system. The schema supports multi-tenancy through company-based isolation and includes comprehensive audit logging.

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MULTI-TENANCY CORE                                    │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐                │
│  │  companies   │◀──────│company_      │──────▶│  auth_users  │                │
│  │  (tenants)   │       │members       │       │  (users)     │                │
│  └──────┬───────┘       └──────────────┘       └──────┬───────┘                │
│         │                                             │                         │
│         │    ┌────────────────────────────────────────┘                         │
│         │    │                                                                   │
│         ▼    ▼                                                                   │
│  ┌────────────────────────────────────────────────────────┐                     │
│  │                     DATA ISOLATION                     │                     │
│  │  All tables below have company_id for isolation        │                     │
│  └────────────────────────────────────────────────────────┘                     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTICATION                                        │
│                                                                                  │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐                │
│  │  auth_users  │◀──────│auth_sessions │       │auth_accounts │                │
│  │              │       │              │       │(OAuth)       │                │
│  └──────┬───────┘       └──────────────┘       └──────────────┘                │
│         │                                                                        │
│         │         ┌──────────────┐       ┌──────────────┐                      │
│         └────────▶│agent_api_keys│       │auth_verificat│                      │
│                   │(M2M auth)    │       │ions          │                      │
│                   └──────────────┘       └──────────────┘                      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TASK MANAGEMENT                                       │
│                                                                                  │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐                │
│  │    tasks     │◀──────│ task_deps    │       │task_tags     │                │
│  │              │       │              │       │              │                │
│  └──────┬───────┘       └──────────────┘       └──────────────┘                │
│         │                                                                        │
│         │         ┌──────────────┐       ┌──────────────┐                      │
│         └────────▶│task_comments │       │task_history  │                      │
│                   │              │       │              │                      │
│                   └──────────────┘       └──────────────┘                      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ISSUE TRACKING                                        │
│                                                                                  │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐                │
│  │    issues    │◀──────│issue_comments│       │issue_labels  │                │
│  │              │       │              │       │              │                │
│  └──────┬───────┘       └──────────────┘       └──────┬───────┘                │
│         │                                             │                         │
│         │         ┌──────────────┐       ┌───────────┴──────────┐             │
│         └────────▶│issue_attachm │       │   issue_label_links  │             │
│                   │ents          │       └──────────────────────┘             │
│                   └──────────────┘                                              │
│                                                                                  │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐                │
│  │issue_read_   │       │issue_assign_ │       │              │                │
│  │states        │       │ment_history  │       │              │                │
│  └──────────────┘       └──────────────┘       └──────────────┘                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           APPROVAL WORKFLOWS                                    │
│                                                                                  │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐                │
│  │  approvals   │◀──────│approval_com- │       │approval_dele-│                │
│  │              │       │ments         │       │gations       │                │
│  └──────┬───────┘       └──────────────┘       └──────────────┘                │
│         │                                                                        │
│         │         ┌──────────────┐       ┌──────────────┐                      │
│         └────────▶│approval_audit│       │approval_poli-│                      │
│                   │_log          │       │cies          │                      │
│                   └──────────────┘       └──────────────┘                      │
│                                                                                  │
│  ┌──────────────┐                                                                │
│  │approval_     │                                                                │
│  │stakeholders  │                                                                │
│  └──────────────┘                                                                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BILLING & COSTS                                       │
│                                                                                  │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐                │
│  │  cost_events │       │   budgets    │       │ budget_alerts│                │
│  │              │       │              │       │              │                │
│  └──────────────┘       └──────────────┘       └──────────────┘                │
│                                                                                  │
│  ┌──────────────┐                                                                │
│  │  cost_rates  │                                                                │
│  │ (pricing)    │                                                                │
│  └──────────────┘                                                                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PLUGIN SYSTEM                                         │
│                                                                                  │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐                │
│  │   plugins    │◀──────│plugin_configs│       │plugin_states │                │
│  │              │       │              │       │              │                │
│  └──────┬───────┘       └──────────────┘       └──────────────┘                │
│         │                                                                        │
│         │    ┌─────────┬─────────┬─────────┬─────────┐                         │
│         │    │         │         │         │         │                         │
│         ▼    ▼         ▼         ▼         ▼         ▼                         │
│  ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │plugin_tools  │ │plugin_ui_│ │plugin_   │ │plugin_   │ │plugin_   │          │
│  │              │ │slots     │ │events    │ │logs      │ │executions│          │
│  └──────────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                                                  │
│  ┌──────────────┐       ┌──────────────┐                                       │
│  │plugin_depen- │       │plugin_web-   │                                       │
│  │dencies       │       │hooks         │                                       │
│  └──────────────┘       └──────────────┘                                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SUPPORTING TABLES                                     │
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   contexts   │  │   roadmaps   │  │  merkle_     │  │   webhooks   │       │
│  │              │  │              │  │  trees       │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │conversations │  │   skills     │  │  routines    │  │   activity   │       │
│  │              │  │              │  │              │  │   _log       │       │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                          │
│  │   runtime_   │  │   document_  │  │   versions   │                          │
│  │   state      │  │              │  │              │                          │
│  └──────────────┘  └──────────────┘  └──────────────┘                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Table Descriptions

### companies

Multi-tenant organization table. All data is scoped to a company.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Company UUID |
| name | TEXT | Company name |
| slug | TEXT UNIQUE | URL-friendly identifier |
| settings | TEXT JSON | Company-specific settings |
| status | TEXT | active/suspended/deleted |
| created_at | DATETIME | Creation timestamp |
| updated_at | DATETIME | Last update |

**Indexes**:
- `idx_companies_slug` - Fast lookup by slug
- `idx_companies_status` - Filter by status

---

### auth_users

User authentication and profile information.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | User UUID |
| email | TEXT UNIQUE | User email |
| name | TEXT | Display name |
| password_hash | TEXT | scrypt hash |
| company_id | TEXT FK | Default company |
| role | TEXT | admin/user/guest |
| status | TEXT | active/inactive/suspended |
| last_login_at | DATETIME | Last login |
| created_at | DATETIME | Creation timestamp |

**Indexes**:
- `idx_auth_users_email` - Login lookup
- `idx_auth_users_company` - Company user listing
- `idx_auth_users_status` - Status filtering

---

### agent_api_keys

Machine-to-machine authentication for agents and external services.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Key ID (cm_ prefix) |
| key_hash | TEXT | HMAC-SHA256 hash |
| key_prefix | TEXT | Identifiable prefix |
| actor_id | TEXT | Associated actor |
| actor_type | TEXT | user/agent |
| company_id | TEXT FK | Company scope |
| permissions | TEXT JSON | Granted permissions |
| rate_limit | INTEGER | Rate limit per minute |
| expires_at | DATETIME | Expiration |
| revoked_at | DATETIME | Revocation time |
| last_used_at | DATETIME | Last usage |
| use_count | INTEGER | Usage counter |

**Indexes**:
- `idx_agent_api_keys_actor` - Lookup by actor
- `idx_agent_api_keys_prefix` - Key validation
- `idx_agent_api_keys_expires` - Cleanup expired keys

---

### tasks

Task management with Eisenhower matrix support.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Task ID |
| uuid | TEXT | Task UUID |
| company_id | TEXT FK | Company scope |
| title | TEXT | Task title |
| description | TEXT | Task details |
| status | TEXT | pending/active/completed |
| priority | TEXT | urgent/high/medium/low |
| quadrant | TEXT | eisenhower_quadrant |
| assignee_id | TEXT | Assigned actor |
| assignee_type | TEXT | user/agent |
| due_date | DATETIME | Due date |
| created_by | TEXT | Creator ID |
| created_at | DATETIME | Creation time |
| updated_at | DATETIME | Last update |
| deleted_at | DATETIME | Soft delete |

**Indexes**:
- `idx_tasks_company_status` - Company task listing
- `idx_tasks_assignee` - User's tasks
- `idx_tasks_due_date` - Overdue queries

---

### issues

Issue/ticket tracking with threaded comments.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Issue UUID |
| company_id | TEXT FK | Company scope |
| parent_id | TEXT FK | Parent issue (hierarchy) |
| project_id | TEXT | Associated project |
| task_id | INTEGER FK | Linked task |
| issue_number | INTEGER | Human-readable number |
| title | TEXT | Issue title |
| description | TEXT | Issue description |
| status | TEXT | backlog/todo/in_progress/completed |
| priority | TEXT | critical/high/medium/low |
| assignee_type | TEXT | user/agent |
| assignee_id | TEXT | Assignee ID |
| created_by_type | TEXT | user/agent/system |
| created_by_id | TEXT | Creator ID |
| due_date | DATETIME | Due date |
| created_at | DATETIME | Creation time |
| updated_at | DATETIME | Last update |
| deleted_at | DATETIME | Soft delete |

**Indexes**:
- `idx_issues_company_status` - Company issues
- `idx_issues_assignee` - Assigned issues
- `idx_issues_project` - Project issues
- `idx_issues_status` - Status filtering
- `idx_issues_due_date` - Due date filtering

---

### issue_comments

Threaded comments on issues.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Comment UUID |
| issue_id | TEXT FK | Parent issue |
| company_id | TEXT FK | Company scope |
| parent_id | TEXT FK | Thread parent |
| content | TEXT | Comment content |
| author_type | TEXT | user/agent/system |
| author_id | TEXT | Author ID |
| comment_type | TEXT | comment/status_change/etc |
| is_edited | BOOLEAN | Edit flag |
| created_at | DATETIME | Creation time |
| deleted_at | DATETIME | Soft delete |

**Indexes**:
- `idx_issue_comments_issue` - Issue comments
- `idx_issue_comments_author` - User's comments
- `idx_issue_comments_parent` - Thread traversal

---

### approvals

Approval workflow requests.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Approval UUID |
| company_id | TEXT FK | Company scope |
| type | TEXT | Approval type |
| status | TEXT | pending/approved/rejected |
| priority | TEXT | low/normal/high/critical |
| requested_by_type | TEXT | user/agent/system |
| requested_by_agent_id | TEXT | Requesting agent |
| requested_by_user_id | TEXT | Requesting user |
| payload | TEXT JSON | Action payload |
| risk_level | TEXT | low/medium/high/critical |
| risk_factors | TEXT JSON | Risk analysis |
| decision_note | TEXT | Decision rationale |
| decided_by_user_id | TEXT | Decider ID |
| decided_at | DATETIME | Decision time |
| timeout_at | DATETIME | Expiration |
| created_at | DATETIME | Creation time |

**Indexes**:
- `idx_approvals_company_status` - Company approvals
- `idx_approvals_status_type` - Status filtering
- `idx_approvals_timeout` - Expiration queries

---

### cost_events

Per-request cost tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Event ID |
| uuid | TEXT | Event UUID |
| company_id | TEXT | Company scope |
| user_id | INTEGER | Initiating user |
| agent_id | TEXT | Agent identifier |
| request_id | TEXT | Request ID |
| provider | TEXT | AI provider |
| model | TEXT | Model identifier |
| input_tokens | INTEGER | Input token count |
| output_tokens | INTEGER | Output token count |
| input_cost | REAL | Input cost (USD) |
| output_cost | REAL | Output cost (USD) |
| total_cost | REAL | Total cost (USD) |
| created_at | DATETIME | Event time |

**Indexes**:
- `idx_cost_events_company_created` - Company costs
- `idx_cost_events_user_created` - User costs
- `idx_cost_events_provider_model` - Provider analytics

---

### budgets

Spending limits and policies.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Budget ID |
| uuid | TEXT | Budget UUID |
| scope_type | TEXT | global/company/user/agent |
| scope_id | TEXT | ID within scope |
| name | TEXT | Budget name |
| period | TEXT | daily/weekly/monthly/yearly |
| amount | REAL | Budget limit |
| alert_threshold_1 | REAL | 50% alert |
| alert_threshold_2 | REAL | 75% alert |
| alert_threshold_3 | REAL | 90% alert |
| enforcement_mode | TEXT | soft/hard/notify_only |
| is_active | BOOLEAN | Active flag |
| created_at | DATETIME | Creation time |

**Indexes**:
- `idx_budgets_scope` - Scope lookup
- `idx_budgets_active_period` - Active budgets

---

### plugins

Plugin registry.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Plugin ID |
| version | TEXT | Plugin version |
| name | TEXT | Display name |
| description | TEXT | Description |
| author | TEXT | Plugin author |
| status | TEXT | installed/registered/active/failed |
| manifest_path | TEXT | Manifest location |
| capabilities | TEXT JSON | Granted capabilities |
| manifest_hash | TEXT | Integrity hash |
| installed_at | DATETIME | Installation time |
| activated_at | DATETIME | Activation time |
| created_at | DATETIME | Registration time |

**Indexes**:
- `idx_plugins_status` - Status filtering
- `idx_plugins_source` - Source filtering

---

### plugin_states

Plugin isolated state storage.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | State ID |
| plugin_id | TEXT FK | Plugin ID |
| scope_kind | TEXT | instance/project/task/user |
| scope_id | TEXT | Scope identifier |
| namespace | TEXT | State namespace |
| state_key | TEXT | State key |
| value | TEXT | State value (JSON) |
| version | INTEGER | Optimistic lock version |
| expires_at | DATETIME | TTL |
| created_at | DATETIME | Creation time |
| updated_at | DATETIME | Last update |

**Indexes**:
- `idx_plugin_states_plugin_id` - Plugin state lookup
- `idx_plugin_states_scope` - Scope filtering
- `idx_plugin_states_key` - Key lookup
- `idx_plugin_states_expires` - Cleanup expired

---

## Index Strategies

### Common Query Patterns

| Query Pattern | Index Strategy |
|---------------|----------------|
| List company tasks | `idx_tasks_company_status` (company_id, status) WHERE deleted_at IS NULL |
| User's assigned tasks | `idx_tasks_assignee` (assignee_id, assignee_type) WHERE deleted_at IS NULL |
| Overdue tasks | `idx_tasks_due_date` (due_date) WHERE deleted_at IS NULL AND due_date IS NOT NULL |
| Company issues by status | `idx_issues_company_status` (company_id, status) WHERE deleted_at IS NULL |
| Pending approvals | `idx_approvals_company_status` (company_id, status) WHERE status = 'pending' |
| Cost analytics | `idx_cost_events_company_created` (company_id, created_at) WHERE company_id IS NOT NULL |
| API key validation | `idx_agent_api_keys_prefix` (key_prefix) |

### Soft Delete Pattern

All tables implement soft deletes with `deleted_at` column:

```sql
-- Index excludes deleted records
CREATE INDEX idx_tasks_company_status 
ON tasks(company_id, status) 
WHERE deleted_at IS NULL;
```

### Multi-tenancy Isolation

All data tables include `company_id` for tenant isolation:

```sql
-- Foreign key with cascade
FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE

-- Index for tenant queries
CREATE INDEX idx_table_company ON table_name(company_id) WHERE deleted_at IS NULL;
```

---

## Migration System

### Migration Files

| Migration | Description |
|-----------|-------------|
| 001_initial_schema.js | Core tables (tasks, contexts, merkle) |
| 002_add_indexes.js | Performance indexes |
| 003_additional_performance_indexes.js | More indexes |
| 004_runtime_persistence.js | Runtime state |
| 006_auth_system.js | Authentication tables |
| 007_company_model.js | Company/tenant tables |
| 008_cost_tracking.js | Billing tables |
| 009_plugin_system.js | Plugin tables |
| 012_issue_system.js | Issue tracking tables |
| 013_approval_workflows.js | Approval tables |

### Migration Structure

```javascript
export function up(db) {
  db.pragma('foreign_keys = ON');
  
  // Create table
  db.exec(`
    CREATE TABLE IF NOT EXISTS new_table (
      id TEXT PRIMARY KEY,
      -- columns
    );
    
    -- Indexes
    CREATE INDEX ...;
    
    -- Triggers
    CREATE TRIGGER ...;
  `);
}

export function down(db) {
  db.pragma('foreign_keys = OFF');
  db.exec('DROP TABLE IF EXISTS new_table;');
  db.pragma('foreign_keys = ON');
}
```

---

## Backup Strategy

### Automated Backups

- **Frequency**: Every 4 hours
- **Retention**: 7 days
- **Location**: `backups/` directory
- **Format**: SQLite dump + WAL checkpoint

### Manual Backup

```javascript
// Using BIOS command
bios.executeCommand('backup', { 
  type: 'full',
  compress: true 
});
```

---

*Version: 5.0.0*  
*Last Updated: 2026-03-28*
