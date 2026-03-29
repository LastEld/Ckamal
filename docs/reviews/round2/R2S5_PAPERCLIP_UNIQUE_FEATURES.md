# Round 2 Review: Paperclip Unique Features Analysis

**Date:** 2026-03-29  
**Reviewer:** Round 2 Subagent  
**Scope:** Identify features unique to Paperclip (not in Ckamal) for potential Phase 2 absorption

---

## Executive Summary

This document provides a comprehensive gap analysis between Paperclip (archive/paperclip/) and Ckamal. After thorough review of both codebases, **15 major unique feature areas** have been identified in Paperclip that do not exist in Ckamal.

**Key Finding:** Paperclip has evolved into a sophisticated multi-agent orchestration platform with advanced workspace management, financial tracking, and plugin ecosystems. Ckamal has a solid foundation but lacks many production-grade features present in Paperclip.

---

## 1. Features ONLY in Paperclip (Not Absorbed)

### 1.1 Execution Workspaces System ⭐ HIGH VALUE

**What it does:**
- Durable record for shared or derived runtime workspaces
- Tracks where work happened (shared workspace, isolated git worktree, operator branch, adapter-managed remote sandbox)
- Links PRs, branches, previews, and cleanup state
- Supports reuse across multiple related issues

**Schema:**
```typescript
// execution_workspaces table
- id, companyId, projectId, projectWorkspaceId
- mode: 'shared_workspace' | 'isolated_workspace' | 'operator_branch' | 'adapter_managed'
- strategyType: 'project_primary' | 'git_worktree' | 'adapter_managed'
- status: 'active' | 'idle' | 'in_review' | 'archived' | 'cleanup_failed'
- cwd, repoUrl, baseRef, branchName, providerRef, providerType
- cleanupEligibleAt, cleanupReason
```

**Why it's valuable:**
- Enables cloud-hosted deployments where execution happens remotely
- Supports both solo developers (direct master editing) and team workflows (isolated branches)
- Provides cleanup automation and workspace lifecycle management
- Allows PRs/previews to be tracked as work products

**Implementation complexity:** HIGH
- Requires database schema additions
- Needs workspace provisioning/teardown logic
- Requires git worktree management
- Needs integration with execution adapters

**Files involved:**
- `packages/db/src/schema/execution_workspaces.ts`
- `packages/db/src/schema/workspace_operations.ts`
- `packages/db/src/schema/workspace_runtime_services.ts`
- `doc/plans/2026-03-10-workspace-strategy-and-git-worktrees.md`
- `doc/plans/2026-03-13-workspace-product-model-and-work-product.md`

---

### 1.2 Work Products System ⭐ HIGH VALUE

**What it does:**
- First-class place to show outputs of work: previews, PRs, branches, commits, artifacts, documents
- Tracks work product status: active, ready_for_review, merged, closed, failed, archived
- Links work products to issues, execution workspaces, and runtime services
- Health status tracking for previews

**Schema:**
```typescript
// issue_work_products table
- type: 'preview_url' | 'runtime_service' | 'pull_request' | 'branch' | 'commit' | 'artifact' | 'document'
- provider: 'paperclip' | 'github' | 'vercel' | 's3' | 'custom'
- status, reviewState, healthStatus
- isPrimary flag for primary work product
```

**Why it's valuable:**
- Separates planning (issues) from outputs (PRs/previews)
- Provides visibility into what agents produced
- Enables PR review workflows within the control plane
- Tracks health of deployed previews

**Implementation complexity:** MEDIUM
- Database schema additions
- UI components for work product display
- Integration with git providers

**Files involved:**
- `packages/db/src/schema/issue_work_products.ts`
- `packages/shared/src/types/work-product.ts`

---

### 1.3 Finance Events Ledger ⭐ HIGH VALUE

**What it does:**
- Separate ledger for non-inference financial events
- Tracks: credit purchases, top-ups, refunds, platform fees, provisioned capacity, training charges
- Distinguishes between usage provider and biller (enables OpenRouter/Cloudflare aggregation)
- Supports account-level financial accounting

**Schema:**
```typescript
// finance_events table
- eventKind: 'inference_charge' | 'platform_fee' | 'credit_purchase' | 'credit_refund' | 
             'provisioned_capacity_charge' | 'training_charge' | 'custom_model_import_charge' | ...
- direction: 'debit' | 'credit'
- biller, provider, executionAdapterType, pricingTier, region
- quantity, unit, amountCents, currency
```

**Why it's valuable:**
- Enables accurate billing with aggregators (OpenRouter, Cloudflare AI Gateway)
- Separates inference costs from platform fees
- Supports complex billing scenarios (BYOK, provisioned throughput)
- Foundation for financial reporting and cost attribution

**Implementation complexity:** MEDIUM
- Database schema
- Financial event ingestion
- Reporting queries

**Files involved:**
- `packages/db/src/schema/finance_events.ts`
- `packages/shared/src/constants.ts` (FinanceEventKind, FinanceDirection, FinanceUnit)
- `doc/plans/2026-03-14-billing-ledger-and-reporting.md`

---

### 1.4 Enhanced Budget Policies ⭐ HIGH VALUE

**What it does:**
- Generic budget policy system (not just simple monthly counters)
- Supports multiple scope types: company, agent, project
- Multiple window kinds: calendar_month_utc, lifetime
- Threshold-based enforcement: soft alerts (80%) and hard stops (100%)
- Durable incident tracking with approval integration

**Schema:**
```typescript
// budget_policies table
- scopeType: 'company' | 'agent' | 'project'
- metric: 'billed_cents' (extensible to tokens, requests)
- windowKind: 'calendar_month_utc' | 'lifetime'
- warnPercent, hardStopEnabled

// budget_incidents table
- thresholdType: 'soft' | 'hard'
- status: 'open' | 'resolved' | 'dismissed'
- Creates approval on hard-stop
```

**Why it's valuable:**
- Prevents runaway costs with automatic pausing
- Project-level lifetime budgets for bounded workstreams
- Approval workflow for budget overrides
- Incident deduplication prevents alert spam

**Implementation complexity:** HIGH
- Budget engine service
- Threshold detection
- Integration with cost event ingestion
- Preflight checks before execution
- Approval system integration

**Files involved:**
- `packages/db/src/schema/budget_policies.ts`
- `packages/db/src/schema/budget_incidents.ts`
- `doc/plans/2026-03-14-budget-policies-and-enforcement.md`

---

### 1.5 Session Compaction ⭐ MEDIUM VALUE

**What it does:**
- Automatically rotates agent sessions based on thresholds
- Configurable: maxSessionRuns, maxRawInputTokens, maxSessionAgeHours
- Adapter-aware: Claude/Codex have native context management, others use threshold-based
- Prevents context window exhaustion

**Schema:**
```typescript
interface SessionCompactionPolicy {
  enabled: boolean;
  maxSessionRuns: number;      // default: 200
  maxRawInputTokens: number;   // default: 2,000,000
  maxSessionAgeHours: number;  // default: 72
}
```

**Why it's valuable:**
- Prevents agents from hitting context limits
- Reduces token costs from large contexts
- Automatic session lifecycle management

**Implementation complexity:** MEDIUM
- Policy resolution logic
- Integration with heartbeat system
- Adapter-specific behavior

**Files involved:**
- `packages/adapter-utils/src/session-compaction.ts`

---

### 1.6 Quota Windows ⭐ MEDIUM VALUE

**What it does:**
- Tracks provider rate limits and usage windows
- Displays remaining quota with reset times
- Supports multiple windows per provider (e.g., "5h", "7d", "Sonnet 7d")
- Visual indicators for quota consumption

**Schema:**
```typescript
interface QuotaWindow {
  label: string;           // e.g., "5h", "7d", "Sonnet 7d"
  usedPercent: number | null;
  resetsAt: string | null;
  valueLabel: string | null;  // e.g., "$4.20 remaining"
}
```

**Why it's valuable:**
- Prevents hitting rate limits during agent execution
- Visual cost awareness for operators
- Supports subscription quota tracking

**Implementation complexity:** LOW
- Shared types
- UI components
- Provider API integrations

**Files involved:**
- `packages/shared/src/types/quota.ts`

---

### 1.7 Goals Management System ⭐ HIGH VALUE

**What it does:**
- Hierarchical goal tracking (company → team → agent → task levels)
- Goal status: planned, active, achieved, cancelled
- Project-goal linking via project_goals junction table
- Owner agent assignment

**Schema:**
```typescript
// goals table
- title, description
- level: 'company' | 'team' | 'agent' | 'task'
- status: 'planned' | 'active' | 'achieved' | 'cancelled'
- parentId (self-referential hierarchy)
- ownerAgentId

// project_goals table
- Many-to-many linking
```

**Why it's valuable:**
- Connects daily work (issues) to strategic objectives
- Enables OKR-style goal tracking
- Project portfolio management

**Implementation complexity:** MEDIUM
- Database schema
- CRUD API endpoints
- UI for goal hierarchy
- Project linking

**Files involved:**
- `packages/db/src/schema/goals.ts`
- `packages/db/src/schema/project_goals.ts`
- `packages/shared/src/types/goal.ts`

---

### 1.8 Company Import/Export v2 (Markdown-First) ⭐ HIGH VALUE

**What it does:**
- Markdown-first package format (COMPANY.md, TEAM.md, AGENTS.md, SKILL.md)
- GitHub repos as first-class package sources
- Agent Skills ecosystem compatible
- Package graph resolution with dependency-aware tree selection
- Adapter-aware skill sync surfaces

**Key capabilities:**
- Import from local folder or GitHub URL
- Export to clean vendor-neutral package + `.paperclip.yaml` sidecar
- Entity-level import preview (create/update/skip plan)
- Collision handling with provenance-aware matching

**Why it's valuable:**
- Human-readable company configurations
- Version control friendly
- Template sharing and reuse
- Skills.sh compatibility
- No central registry required

**Implementation complexity:** HIGH
- Markdown frontmatter parser
- Package graph resolution
- Import preview engine
- Skill sync integration
- GitHub API integration

**Files involved:**
- `cli/src/commands/client/company.ts`
- `packages/shared/src/types/company-portability.ts`
- `doc/plans/2026-03-13-company-import-export-v2.md`
- `docs/companies/companies-spec.md`

---

### 1.9 Plugin Job Scheduler ⭐ MEDIUM VALUE

**What it does:**
- Cron-based job scheduling for plugins
- Job run history and status tracking
- Manual and scheduled triggers
- Integration with plugin worker system

**Schema:**
```typescript
// plugin_jobs table
- jobKey, schedule (cron expression)
- status: 'active' | 'paused' | 'error'
- lastRunAt, nextRunAt

// plugin_job_runs table
- trigger: 'schedule' | 'manual' | 'retry'
- status, durationMs, logs
```

**Why it's valuable:**
- Plugins can schedule recurring tasks
- Background job processing
- Operational visibility into plugin jobs

**Implementation complexity:** MEDIUM
- Database schema
- Cron scheduler service
- Plugin SDK integration

**Files involved:**
- `packages/db/src/schema/plugin_jobs.ts`
- `packages/plugins/sdk/src/types.ts`

---

### 1.10 Heartbeat Run Summary & CLI ⭐ MEDIUM VALUE

**What it does:**
- Rich heartbeat run tracking with events
- Real-time event streaming during runs
- CLI command for invoking heartbeats with live output
- Run status tracking: queued, running, succeeded, failed, cancelled, timed_out
- Session ID tracking before/after runs

**Schema:**
```typescript
// heartbeat_runs table
- invocationSource: 'timer' | 'assignment' | 'on_demand' | 'automation'
- status, startedAt, finishedAt
- sessionIdBefore, sessionIdAfter
- usageJson, resultJson
- logStore, logRef, logBytes, logSha256

// heartbeat_run_events table
- Sequential event log (seq, eventType, stream, level, message, payload)
```

**Why it's valuable:**
- Complete audit trail of agent executions
- Real-time visibility into agent activity
- Debugging and troubleshooting
- Session lifecycle tracking

**Implementation complexity:** MEDIUM
- Event streaming infrastructure
- Log storage
- CLI integration

**Files involved:**
- `packages/db/src/schema/heartbeat_runs.ts`
- `packages/db/src/schema/heartbeat_run_events.ts`
- `cli/src/commands/heartbeat-run.ts`

---

### 1.11 Project Workspaces ⭐ MEDIUM VALUE

**What it does:**
- Durable, configured, project-scoped codebase objects
- Multiple workspace support per project (monorepo-friendly)
- Source types: local_path, git_repo, non_git_path, remote_managed
- Setup/cleanup commands
- Remote provider support for cloud deployments

**Schema:**
```typescript
// project_workspaces table
- name, sourceType, cwd, repoUrl, repoRef, defaultRef
- setupCommand, cleanupCommand
- remoteProvider, remoteWorkspaceRef
- isPrimary, visibility
```

**Why it's valuable:**
- Supports monorepo workflows
- Cloud deployment ready
- Non-git project support
- Workspace automation hooks

**Implementation complexity:** MEDIUM
- Database schema
- Workspace management UI
- Git integration

**Files involved:**
- `packages/db/src/schema/project_workspaces.ts`

---

### 1.12 Cost Events with Billing Dimensions ⭐ HIGH VALUE

**What it does:**
- Canonical billing ledger with rich dimensions
- Separates provider (who provided the model) from biller (who charged for it)
- Billing types: metered_api, subscription_included, subscription_overage, credits, fixed
- Cached token tracking

**Schema:**
```typescript
// cost_events table
- provider, biller, billingType
- inputTokens, cachedInputTokens, outputTokens
- costCents, occurredAt
- Links to heartbeatRunId, agentId, issueId, projectId, goalId
```

**Why it's valuable:**
- Accurate multi-provider billing
- Subscription vs overage tracking
- Cost attribution across projects/goals
- Foundation for budget enforcement

**Implementation complexity:** MEDIUM
- Database schema
- Adapter contract updates
- Reporting queries

**Files involved:**
- `packages/db/src/schema/cost_events.ts`
- `doc/plans/2026-03-14-billing-ledger-and-reporting.md`

---

### 1.13 Advanced Plugin System ⭐ HIGH VALUE

**What it does:**
- Comprehensive plugin SDK with 20+ capabilities
- UI extension slots: page, detailTab, dashboardWidget, sidebar, commentAnnotation
- Worker APIs: config, events, jobs, http, secrets, assets, activity, state, entities
- Domain APIs: companies, projects, issues, goals, agents
- Tool registration for agents

**Capabilities:**
- `companies.read`, `projects.read`, `issues.read`, `agents.read`
- `issues.create`, `issues.update`, `agents.invoke`
- `events.subscribe`, `events.emit`, `jobs.schedule`
- `ui.page.register`, `ui.detailTab.register`, `ui.dashboardWidget.register`

**Why it's valuable:**
- Extensible platform architecture
- Third-party integrations
- Custom UI extensions
- Agent tool ecosystem

**Implementation complexity:** VERY HIGH
- Plugin runtime environment
- Worker isolation
- UI component mounting
- Capability permission system
- Event bridge

**Files involved:**
- `packages/plugins/sdk/` (entire SDK)
- `packages/db/src/schema/plugins.ts`
- `packages/db/src/schema/plugin_config.ts`
- `packages/db/src/schema/plugin_entities.ts`
- `packages/db/src/schema/plugin_state.ts`
- `doc/plugins/PLUGIN_SPEC.md`

---

### 1.14 Workspace Operations ⭐ MEDIUM VALUE

**What it does:**
- Tracks workspace provisioning and teardown operations
- Phase-based execution (setup, cleanup)
- Log storage for operation output
- Links to execution workspaces and heartbeat runs

**Schema:**
```typescript
// workspace_operations table
- phase, command, cwd, status
- logStore, logRef, logBytes, logSha256
- Links to executionWorkspaceId, heartbeatRunId
```

**Why it's valuable:**
- Audit trail for workspace lifecycle
- Debugging workspace setup failures
- Operational visibility

**Implementation complexity:** LOW
- Database schema
- Operation tracking

**Files involved:**
- `packages/db/src/schema/workspace_operations.ts`

---

### 1.15 Enhanced Cost Events Schema ⭐ MEDIUM VALUE

**What it does:**
- Links cost events to goals
- Billing code support for cost attribution
- Multi-dimensional indexing for reporting

**Why it's valuable:**
- Cost attribution to strategic goals
- Billing code-based cost allocation
- Efficient reporting queries

**Implementation complexity:** LOW
- Schema additions
- Index creation

**Files involved:**
- `packages/db/src/schema/cost_events.ts`

---

## 2. Prioritized Absorption List

### P0: High Value, Low/Medium Effort

| Feature | Value | Effort | Priority |
|---------|-------|--------|----------|
| Goals Management | High | Medium | 1 |
| Cost Events (Billing Dimensions) | High | Medium | 2 |
| Quota Windows | Medium | Low | 3 |
| Session Compaction | Medium | Medium | 4 |
| Workspace Operations | Medium | Low | 5 |

### P1: High Value, High Effort

| Feature | Value | Effort | Priority |
|---------|-------|--------|----------|
| Execution Workspaces | High | High | 1 |
| Work Products System | High | High | 2 |
| Finance Events Ledger | High | Medium-High | 3 |
| Enhanced Budget Policies | High | High | 4 |
| Company Import/Export v2 | High | High | 5 |
| Advanced Plugin System | High | Very High | 6 |

### P2: Nice to Have

| Feature | Value | Effort | Priority |
|---------|-------|--------|----------|
| Plugin Job Scheduler | Medium | Medium | 1 |
| Heartbeat Run Summary CLI | Medium | Medium | 2 |
| Project Workspaces | Medium | Medium | 3 |
| Enhanced Cost Events (Goals) | Medium | Low | 4 |

---

## 3. Recommendations for Phase 2 Absorption

### Immediate (Week 1-2)

1. **Goals Management System**
   - Foundation for OKR tracking
   - Relatively self-contained
   - High user value

2. **Quota Windows**
   - Simple type additions
   - Low risk
   - Quick win for cost visibility

### Short-term (Week 3-6)

3. **Cost Events with Billing Dimensions**
   - Critical for accurate billing
   - Required before budget policies
   - Schema migration needed

4. **Session Compaction**
   - Prevents context limit issues
   - Adapter-utils pattern
   - Medium complexity

5. **Workspace Operations**
   - Low complexity
   - Good foundation for execution workspaces

### Medium-term (Week 7-12)

6. **Enhanced Budget Policies**
   - Builds on cost events
   - High production value
   - Requires service layer

7. **Finance Events Ledger**
   - Complements cost events
   - Complex financial modeling
   - Required for advanced billing

8. **Project Workspaces**
   - Foundation for execution workspaces
   - Moderate complexity

### Long-term (Week 13+)

9. **Execution Workspaces System**
   - Major architectural addition
   - Depends on project workspaces
   - Requires git worktree integration

10. **Work Products System**
    - Depends on execution workspaces
    - UI-heavy feature
    - Git provider integrations

11. **Company Import/Export v2**
    - Major feature
    - Markdown parser required
    - GitHub integration

12. **Advanced Plugin System**
    - Largest effort
    - Worker isolation
    - UI extension framework

---

## 4. Feature Dependency Graph

```
Goals Management ←── Cost Events (Goals)
                          ↓
Cost Events (Billing) ←── Budget Policies
                          ↓
                   Finance Events Ledger

Project Workspaces ←── Execution Workspaces ←── Work Products
                              ↓
                    Workspace Operations

Plugin SDK ←── Plugin Job Scheduler

Session Compaction ←── Heartbeat Run Summary
```

---

## 5. Risk Assessment

| Feature | Risk Level | Mitigation |
|---------|------------|------------|
| Execution Workspaces | High | Phased rollout, feature flags |
| Budget Policies | High | Soft alerts first, hard stops later |
| Plugin System | High | Sandbox workers, capability limits |
| Finance Events | Medium | Audit trail, reconciliation checks |
| Goals | Low | Self-contained, additive feature |

---

## 6. Conclusion

Paperclip has evolved significantly beyond Ckamal's current capabilities. The most critical gaps are in:

1. **Workspace Management** - Execution workspaces and work products enable professional development workflows
2. **Financial Controls** - Budget policies and finance events provide production-grade cost management
3. **Extensibility** - The plugin system enables ecosystem growth
4. **Portability** - Markdown-first import/export enables template sharing

**Recommendation:** Prioritize P0 and P1 features for Phase 2, starting with Goals Management and Cost Events as foundational features, then building toward Execution Workspaces and Budget Policies.

---

*End of Review*
