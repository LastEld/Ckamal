# Round 3: Paperclip Features Absorption Verification

**Date:** 2026-03-29  
**Scope:** Cross-reference verification of Paperclip features against Ckamal codebase  
**Method:** Code search, migration analysis, and file inspection

---

## Summary

| Status | Count | Features |
|--------|-------|----------|
| ✅ Fully Absorbed | 16 | Multi-actor Auth, Company Model, Plugin System, Heartbeat Runtime, Issue System, Approval Workflows, Routine Scheduling, Document Versioning, Activity Logging, Webhooks, Skill Sync, CEO Chat, Org Chart, Dashboard Widgets, PWA, Cost Tracking (basic) |
| ⚠️ Partially Absorbed | 4 | Session Compaction, Cost Events/Budgeting, Company Import/Export, Heartbeat CLI |
| ❌ Not Absorbed | 9 | Execution Workspaces, Work Products, Finance Events, Enhanced Budget Policies, Quota Windows, Goals Management, Plugin Job Scheduler, Project Workspaces, Workspace Operations |

---

## Detailed Verification

### 1. Multi-actor Auth
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- File: `src/auth/multi-actor-middleware.js` (775 lines)
- Supports JWT tokens (users), API keys (agents/services), session cookies
- Actor types: `user`, `agent`, `api_key`, `system`, `webhook`, `integration`
- Features: Rate limiting per actor type, CSRF protection, permission system
- Lines 26-30: Default rate limits per actor type
- Lines 168-188: `requireActorType()` middleware

---

### 2. Company/Organization Model
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/007_company_model.js` (322 lines)
- Tables: `companies`, `company_memberships`
- Features:
  - Company budget tracking (`budget_monthly_cents`, `spent_monthly_cents`)
  - Multi-tenancy with `company_id` on tasks, roadmaps, contexts, conversations
  - Role-based membership (owner, admin, member, viewer)
  - Company branding (logo_url, brand_color)
- Lines 90-95: Company columns include budget and branding fields
- Lines 135-174: Company memberships table with roles

---

### 3. Cost Tracking/Budgeting
**Status:** ⚠️ PARTIALLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/008_cost_tracking.js` (302 lines)
- Tables: `cost_events`, `budgets`, `budget_alerts`, `cost_rates`

**What EXISTS:**
- Per-request cost tracking with token usage
- Budgets with threshold alerts (50%, 75%, 90%)
- Model pricing rates
- Lines 17-85: `cost_events` table with attribution

**What's MISSING (from Paperclip):**
- Finance Events Ledger (separate table for non-inference charges)
- Enhanced budget policies with incident tracking
- Budget enforcement with hard stops
- Cost attribution to goals
- Provider/biller separation

---

### 4. Plugin System
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/009_plugin_system.js` (424 lines)
- Tables: `plugins`, `plugin_configs`, `plugin_states`, `plugin_tools`, `plugin_ui_slots`, `plugin_events`, `plugin_logs`, `plugin_executions`, `plugin_dependencies`, `plugin_webhooks`
- Features:
  - UI extension slots (widget, sidebar, detailTab, toolbar, page, modal)
  - Tool registration for agents
  - Worker APIs and capability system
  - Event delivery tracking
  - Plugin health monitoring
- Lines 107-131: `plugin_tools` table for agent tool registration
- Lines 134-161: `plugin_ui_slots` for UI extensions

---

### 5. Heartbeat Runtime
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/010_heartbeat_runtime.js` (247 lines)
- Service: `src/runtime/heartbeat-service.js` (1000+ lines)
- Tables: `heartbeat_runs`, `heartbeat_run_events`, `agent_sessions`, `agent_wakeup_requests`, `agent_runtime_state`, `cost_ledger`

**Features:**
- Run status tracking: queued, running, succeeded, failed, cancelled, timed_out
- Real-time event streaming
- Session ID tracking before/after runs
- Cost ledger per run
- Lines 17-52: `heartbeat_runs` table with full Paperclip-compatible schema
- Lines 64-80: `heartbeat_run_events` for event logging
- Lines 169-187: `cost_ledger` with billing dimensions

---

### 6. Issue System
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/012_issue_system.js` (427 lines)
- Tables: `issues`, `issue_comments`, `issue_labels`, `issue_label_links`, `issue_attachments`, `issue_read_states`, `issue_assignment_history`

**Features:**
- Full ticket tracking with hierarchy (parent_id)
- Threaded comments
- Labels and assignment
- Read state tracking per user
- File attachments
- Assignment history
- Lines 26-99: `issues` table with status, priority, assignment
- Lines 101-155: `issue_comments` with threading support

---

### 7. Approval Workflows
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/013_approval_workflows.js` (272 lines)
- Tables: `approvals`, `approval_comments`, `approval_delegations`, `approval_policies`, `approval_audit_log`, `approval_stakeholders`

**Features:**
- Risk assessment (low, medium, high, critical)
- Approval delegation
- Policy-based routing
- Immutable audit trail
- Stakeholder notifications
- Lines 19-64: `approvals` table with risk levels and timeout
- Lines 96-132: `approval_delegations` for temporary delegation

---

### 8. Routine Scheduling
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/014_routine_scheduling.js` (279 lines)
- Service: `src/domains/routines/routine-service.js`
- Tables: `routines`, `routine_triggers`, `routine_runs`, `routine_assignments`, `routine_scheduler_locks`

**Features:**
- Cron-based scheduling
- Multiple trigger types (cron, webhook, event, manual)
- Concurrency policies
- Distributed locking
- Lines 29-57: `routines` table with concurrency and catch-up policies
- Lines 69-99: `routine_triggers` with cron and webhook support

---

### 9. Document Versioning
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/011_document_versioning.js` (180 lines)
- Tables: `documents`, `document_revisions`, `document_shares`, `document_subscriptions`
- FTS: `documents_fts` for full-text search

**Features:**
- Full version history
- Cross-company sharing
- User subscriptions
- Full-text search
- Lines 52-58: FTS5 virtual table for search
- Lines 62-78: `document_revisions` with version numbering

---

### 10. Activity Logging
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/015_activity_logging.js` (457 lines)
- Tables: `activity_log`, `activity_log_details`, `activity_log_aggregates`, `activity_log_subscriptions`, `activity_log_anomalies`

**Features:**
- Categorization (auth, security, data, admin, agent, system)
- Privacy levels (public, standard, sensitive, restricted)
- Chain of custody with hash verification
- Anomaly detection
- Real-time subscriptions
- Lines 47-132: `activity_log` with comprehensive tracking
- Lines 292-327: `activity_log_anomalies` for security detection

---

### 11. Webhooks
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/016_webhooks.js` (370 lines)
- Service: `src/domains/webhooks/webhook-service.js`
- Tables: `webhooks`, `webhook_event_types`, `webhook_deliveries`, `webhook_delivery_attempts`, `webhook_events`, `webhook_stats`

**Features:**
- HMAC signature verification
- Delivery retry with exponential backoff
- Attempt history
- Health monitoring
- Lines 34-71: `webhooks` table with signing algorithms
- Lines 99-139: `webhook_deliveries` with retry tracking

---

### 12. Skill Sync
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Migration: `src/db/migrations/017_skills.js` (303 lines)
- Service: `src/domains/skills/skill-sync.js`
- Tables: `skills`, `skill_versions`, `skill_assignments`, `skill_sync_logs`, `agent_skills`

**Features:**
- Skill registry with versioning
- Agent/company assignments
- Sync operation logging
- Global vs company-scoped skills
- Lines 48-87: `skills` table with global flag
- Lines 166-197: `skill_sync_logs` for tracking sync operations

---

### 13. CEO Chat
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Component: `src/dashboard/public/components/ceo-chat.js` (958 lines)
- Migration: `src/db/migrations/019_chat_system.js`
- Service: `src/domains/chat/chat-service.js`

**Features:**
- Threaded conversations
- Real-time WebSocket updates
- Message threading/replies
- Issue kind selection (task/strategy/question/decision)
- Read state tracking
- Lines 16-36: Component with threaded messaging support
- Lines 407-416: CEO response request handling

---

### 14. Org Chart
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Component: `src/dashboard/public/components/org-chart.js` (1000+ lines)
- Controller: `src/controllers/orgchart-controller.js`

**Features:**
- SVG-based tree visualization
- Pan and zoom
- Real-time status updates via WebSocket
- Collapsible nodes
- Agent detail panel
- Search and filtering
- Lines 21-82: Component with viewport state for pan/zoom
- Lines 505-526: Bezier curve link rendering

---

### 15. PWA (Progressive Web App)
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Documentation: `src/dashboard/public/PWA_README.md` (180 lines)
- Manager: `src/dashboard/public/components/pwa-manager.js` (387 lines)
- Service Worker: `src/dashboard/public/service-worker.js`
- Mobile: `src/dashboard/public/mobile-optimizations.js`

**Features:**
- Web App Manifest
- Offline caching
- Background sync
- Push notifications
- Mobile touch gestures
- Install prompt handling
- Lines 23-61: PWA Manager initialization
- Lines 249-279: Push notification subscription

---

### 16. Dashboard Widgets
**Status:** ✅ FULLY ABSORBED

**Evidence:**
- Component: `src/dashboard/public/components/active-agents-panel.js`
- Component: `src/dashboard/public/components/cost-widget.js`
- Component: `src/dashboard/public/components/system-health.js`
- Component: `src/dashboard/public/components/performance-chart.js`
- Styles: `src/dashboard/public/styles/components/dashboard-widgets.css`

**Features:**
- Active agents panel
- Cost tracking widget
- System health indicators
- Performance charts
- Real-time updates

---

## Paperclip Unique Features - NOT ABSORBED

### 1. Execution Workspaces System
**Status:** ❌ NOT ABSORBED

**What Paperclip has:**
- `execution_workspaces` table with modes (shared_workspace, isolated_workspace, operator_branch, adapter_managed)
- Workspace lifecycle management
- Git worktree integration
- Cleanup automation

**Evidence of absence:**
- `grep -r "execution.?workspace" src/` - No matches found
- No `execution_workspaces` table in any migration

---

### 2. Work Products System
**Status:** ❌ NOT ABSORBED

**What Paperclip has:**
- `issue_work_products` table
- Types: preview_url, runtime_service, pull_request, branch, commit, artifact, document
- Health status tracking for previews

**Evidence of absence:**
- `grep -r "work.?product|WorkProduct" src/` - No matches found
- No `issue_work_products` table in any migration

---

### 3. Finance Events Ledger
**Status:** ❌ NOT ABSORBED

**What Paperclip has:**
- `finance_events` table separate from cost_events
- Event kinds: credit_purchase, credit_refund, platform_fee, provisioned_capacity_charge
- Provider/biller separation for aggregators

**Evidence of absence:**
- `grep -r "finance.?event|FinanceEvent" src/` - No matches found
- No `finance_events` table in any migration

---

### 4. Enhanced Budget Policies
**Status:** ❌ NOT ABSORBED

**What Paperclip has:**
- `budget_policies` with scope types (company, agent, project)
- `budget_incidents` table for threshold tracking
- Hard stop enforcement with approval integration
- Window kinds: calendar_month_utc, lifetime

**Evidence of absence:**
- `grep -r "budget.?polic|BudgetPolic" src/` - No matches found
- `grep -r "budget.?incident" src/` - No matches found
- Ckamal has `budgets` table but not Paperclip's enhanced policy system

---

### 5. Session Compaction
**Status:** ⚠️ PARTIALLY ABSORBED

**What EXISTS:**
- File: `src/runtime/session-manager.js` (548 lines)
- Config: maxSessionRuns, maxRawInputTokens, maxSessionAgeHours
- Lines 14-19: Default compaction config
- Lines 298-355: `evaluateCompaction()` method

**What's MISSING:**
- Adapter-aware compaction (Claude/Codex have native context management)
- Threshold-based rotation from Paperclip's design

---

### 6. Quota Windows
**Status:** ❌ NOT ABSORBED

**What Paperclip has:**
- `QuotaWindow` type with label, usedPercent, resetsAt
- Provider rate limit tracking
- Visual indicators for quota consumption

**Evidence of absence:**
- `grep -r "quota.?window|QuotaWindow" src/` - No matches found

---

### 7. Goals Management System
**Status:** ❌ NOT ABSORBED

**What Paperclip has:**
- `goals` table with hierarchical levels (company, team, agent, task)
- `project_goals` junction table
- Goal status: planned, active, achieved, cancelled

**Evidence of absence:**
- `grep -r "goals?.*table" src/db/migrations/` - No `goals` table migration
- No `goals` table schema found

---

### 8. Company Import/Export v2 (Markdown-First)
**Status:** ⚠️ PARTIALLY ABSORBED

**What EXISTS:**
- File: `src/bios/commands/company-cli.js` - Basic company export
- `src/domains/company/` domain with import/export

**What's MISSING:**
- Markdown-first package format (COMPANY.md, TEAM.md, AGENTS.md)
- GitHub repos as package sources
- Package graph resolution
- Adapter-aware skill sync surfaces

---

### 9. Plugin Job Scheduler
**Status:** ❌ NOT ABSORBED

**What Paperclip has:**
- `plugin_jobs` table with cron scheduling
- `plugin_job_runs` for history
- Integration with plugin worker system

**Evidence of absence:**
- `grep -r "plugin.?job|PluginJob" src/` - No matches found
- No `plugin_jobs` table in migration 009

---

### 10. Project Workspaces
**Status:** ❌ NOT ABSORBED

**What Paperclip has:**
- `project_workspaces` table
- Source types: local_path, git_repo, non_git_path, remote_managed
- Multiple workspaces per project (monorepo-friendly)

**Evidence of absence:**
- `grep -r "project.?workspace|ProjectWorkspace" src/` - No matches found

---

### 11. Workspace Operations
**Status:** ❌ NOT ABSORBED

**What Paperclip has:**
- `workspace_operations` table
- Phase-based execution (setup, cleanup)
- Log storage for operation output

**Evidence of absence:**
- `grep -r "workspace.?operation|WorkspaceOperation" src/` - No matches found

---

### 12. Cost Events with Full Billing Dimensions
**Status:** ⚠️ PARTIALLY ABSORBED

**What EXISTS:**
- Migration 010: `cost_ledger` table with provider, biller, billing_type
- Lines 169-187: billing dimensions in `cost_ledger`

**What's MISSING:**
- Links to goals for cost attribution
- Enhanced multi-dimensional indexing
- Billing code support

---

### 13. Heartbeat Run Summary CLI
**Status:** ⚠️ PARTIALLY ABSORBED

**What EXISTS:**
- `src/runtime/heartbeat-service.js` - Run tracking
- `src/controllers/heartbeat-controller.js` - API endpoints

**What's MISSING:**
- Dedicated CLI command for invoking heartbeats with live output
- Real-time event streaming CLI

---

## Conclusion

### Absorption Rate
- **Fully Absorbed:** 16/29 features (55%)
- **Partially Absorbed:** 4/29 features (14%)
- **Not Absorbed:** 9/29 features (31%)

### Critical Gaps for Phase 2
1. **Execution Workspaces** - Foundation for cloud deployments
2. **Finance Events** - Required for accurate billing
3. **Enhanced Budget Policies** - Production-grade cost controls
4. **Goals Management** - Strategic alignment

### Recommendation
Priority for Phase 2 should focus on:
1. Goals Management (high value, medium effort)
2. Cost Events enhancement (high value, medium effort)
3. Execution Workspaces (high value, high effort)
4. Enhanced Budget Policies (high value, high effort)

---

*End of Verification Report*
