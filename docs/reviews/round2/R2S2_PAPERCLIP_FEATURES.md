# Paperclip Feature Inventory - Round 2 Review

**Date:** 2026-03-29  
**Source:** `archive/paperclip/`  
**Scope:** Complete feature inventory of Paperclip platform

---

## Executive Summary

Paperclip is a comprehensive **AI agent orchestration platform** with board-level governance, multi-tenant company support, plugin extensibility, and real-time execution capabilities. It provides a control plane for managing AI agents across multiple local and remote runtime adapters.

---

## 1. API Endpoint Inventory (by Resource)

### Total Routes: **24 Route Files** | **~150+ Endpoints**

| Resource | Route File | Endpoint Count | Key Operations |
|----------|-----------|----------------|----------------|
| **Agents** | `agents.ts` | 25+ | CRUD, skills sync, config management, keys, org chart, adapter testing |
| **Issues** | `issues.ts` | 35+ | CRUD, comments, attachments, labels, approvals, read states, inbox, documents, work products |
| **Projects** | `projects.ts` | 12 | CRUD, workspaces |
| **Companies** | `companies.ts` | 15+ | CRUD, settings, import/export, org chart (SVG/PNG), skills |
| **Plugins** | `plugins.ts` | 25+ | Install, enable/disable, health, config, bridge (data/action), tools, jobs, webhooks, streaming |
| **Routines** | `routines.ts` | 14 | CRUD, triggers, runs, public webhooks, secret rotation |
| **Goals** | `goals.ts` | 8 | CRUD, hierarchy |
| **Approvals** | `approvals.ts` | 10 | CRUD, comments, approve/reject |
| **Activity** | `activity.ts` | 6 | List, create, runs, heartbeat context |
| **Dashboard** | `dashboard.ts` | 2 | Summary |
| **Secrets** | `secrets.ts` | 6 | CRUD for company secrets |
| **Costs** | `costs.ts` | 4 | Events, summary |
| **Execution Workspaces** | `execution-workspaces.ts` | 10 | CRUD, operations, runtime services |
| **Instance Settings** | `instance-settings.ts` | 4 | General/experimental settings |
| **LLMs** | `llms.ts` | 3 | List models, pricing |
| **Access** | `access.ts` | 6 | Permissions, membership, grants |
| **Auth** | `authz.ts` | (middleware) | Board auth, company access, instance admin |
| **Sidebar Badges** | `sidebar-badges.ts` | 3 | Badge management |
| **Health** | `health.ts` | 2 | Health checks |
| **Assets** | `assets.ts` | 5 | File uploads, content serving |
| **Company Skills** | `company-skills.ts` | 8 | Skill management, runtime entries |

### Endpoint Categories by Function:

```
Core Operations:
├── CRUD Operations: ~80 endpoints
├── Query/Search: ~25 endpoints  
├── Actions/Commands: ~30 endpoints
├── Webhooks: ~10 endpoints
└── Streaming/SSE: ~5 endpoints
```

---

## 2. Database Table Inventory (by Domain)

### Total Tables: **57 Tables**

| Domain | Tables | Count |
|--------|--------|-------|
| **Authentication & Users** | `authUsers`, `authSessions`, `authAccounts`, `authVerifications`, `boardApiKeys`, `cliAuthChallenges`, `instanceUserRoles` | 7 |
| **Company & Organization** | `companies`, `companyLogos`, `companyMemberships`, `invites`, `joinRequests`, `instanceSettings` | 6 |
| **Agents** | `agents`, `agentApiKeys`, `agentConfigRevisions`, `agentRuntimeState`, `agentTaskSessions`, `agentWakeupRequests` | 6 |
| **Projects & Workspaces** | `projects`, `projectWorkspaces`, `projectGoals`, `executionWorkspaces`, `workspaceOperations`, `workspaceRuntimeServices` | 6 |
| **Issues & Work Tracking** | `issues`, `issueComments`, `issueAttachments`, `issueLabels`, `labels`, `issueReadStates`, `issueInboxArchives`, `issueDocuments`, `issueWorkProducts`, `issueApprovals` | 10 |
| **Goals** | `goals` | 1 |
| **Routines** | `routines`, `routineTriggers`, `routineRuns` | 3 |
| **Approvals** | `approvals`, `approvalComments` | 2 |
| **Budget & Cost** | `budgetPolicies`, `budgetIncidents`, `costEvents`, `financeEvents` | 4 |
| **Activity & Logging** | `activityLog`, `heartbeatRuns`, `heartbeatRunEvents` | 3 |
| **Documents** | `documents`, `documentRevisions` | 2 |
| **Secrets** | `companySecrets`, `companySecretVersions` | 2 |
| **Plugins** | `plugins`, `pluginConfig`, `pluginCompanySettings`, `pluginState`, `pluginEntities`, `pluginJobs`, `pluginJobRuns`, `pluginWebhookDeliveries`, `pluginLogs` | 9 |
| **Permissions** | `principalPermissionGrants` | 1 |
| **Skills** | `companySkills` | 1 |
| **Assets** | `assets` | 1 |

### Table Relationships Summary:
- **Core Entities:** Company → Project → Issue (hierarchical)
- **Agent Ecosystem:** Company → Agent → Agent Keys, Runtime State, Sessions
- **Plugin System:** Plugin → Config, State, Jobs, Logs, Webhooks
- **Audit Trail:** Activity log references all major entities
- **Multi-tenancy:** All tables scoped by `companyId`

---

## 3. Service Layer Inventory

### Total Services: **~35 Services**

| Service | File | Purpose |
|---------|------|---------|
| **Core Domain Services** |||
| `agentService` | `agents.ts` | Agent CRUD, org hierarchy, config |
| `agentInstructionsService` | `agent-instructions.ts` | Instruction bundles, file management |
| `companyService` | `companies.ts` | Company management |
| `companySkillService` | `company-skills.ts` | Skill catalog, runtime entries |
| `projectService` | `projects.ts` | Project & workspace management |
| `issueService` | `issues.ts` | Issue lifecycle, comments, assignments |
| `issueApprovalService` | `issue-approvals.ts` | Issue-approval linking |
| `goalService` | `goals.ts` | Goal hierarchy |
| `routineService` | `routines.ts` | Routine & trigger management |
| `approvalService` | `approvals.ts` | Approval workflows |
| **Execution & Runtime** |||
| `heartbeatService` | `heartbeat.ts` | Agent wake/execution orchestration |
| `executionWorkspaceService` | `execution-workspaces.ts` | Workspace provisioning |
| `workspaceOperationService` | `workspace-operations.ts` | Workspace operations |
| `workProductService` | `work-products.ts` | Work product tracking |
| `reconcilePersistedRuntimeServicesOnStartup` | `workspace-runtime.ts` | Runtime reconciliation |
| **Governance & Access** |||
| `accessService` | `access.ts` | Permissions, grants, membership |
| `boardAuthService` | `board-auth.ts` | Board authentication |
| `budgetService` | `budgets.ts` | Budget policies, incidents |
| `secretService` | `secrets.ts` | Secret management, resolution |
| `instanceSettingsService` | `instance-settings.ts` | Instance configuration |
| **Financial** |||
| `costService` | `costs.ts` | Cost tracking |
| `financeService` | `finance.ts` | Financial events |
| **Activity & Logging** |||
| `activityService` | `activity.ts` | Activity queries |
| `logActivity` | `activity-log.ts` | Activity logging |
| `dashboardService` | `dashboard.ts` | Dashboard summaries |
| `sidebarBadgeService` | `sidebar-badges.ts` | UI badge state |
| **Plugin System** |||
| `pluginRegistryService` | `plugin-registry.ts` | Plugin registration |
| `pluginLifecycleManager` | `plugin-lifecycle.ts` | Plugin state transitions |
| `pluginLoader` | `plugin-loader.ts` | Plugin installation |
| `pluginWorkerManager` | `plugin-worker-manager.ts` | Worker orchestration |
| `pluginJobScheduler` | `plugin-job-scheduler.ts` | Job scheduling |
| `pluginJobStore` | `plugin-job-store.ts` | Job persistence |
| `pluginStreamBus` | `plugin-stream-bus.ts` | SSE streaming |
| `pluginToolDispatcher` | `plugin-tool-dispatcher.ts` | Tool execution |
| `pluginToolRegistry` | `plugin-tool-registry.ts` | Tool registration |
| `pluginEventBus` | `plugin-event-bus.ts` | Event routing |
| `pluginStateStore` | `plugin-state-store.ts` | State persistence |
| `pluginSecretsHandler` | `plugin-secrets-handler.ts` | Plugin secret resolution |
| `pluginCapabilityValidator` | `plugin-capability-validator.ts` | Capability checking |
| `pluginConfigValidator` | `plugin-config-validator.ts` | Config validation |
| `pluginManifestValidator` | `plugin-manifest-validator.ts` | Manifest validation |
| `pluginRuntimeSandbox` | `plugin-runtime-sandbox.ts` | Sandboxed execution |
| `pluginDevWatcher` | `plugin-dev-watcher.ts` | Development mode |
| `pluginHostServices` | `plugin-host-services.ts` | Host-provided services |
| `pluginLogRetention` | `plugin-log-retention.ts` | Log cleanup |
| `pluginJobCoordinator` | `plugin-job-coordinator.ts` | Job coordination |
| **Utilities** |||
| `createStorageServiceFromConfig` | `storage/index.ts` | File storage |
| `notifyHireApproved` | `hire-hook.ts` | Hiring notifications |
| `publishLiveEvent` | `live-events.ts` | Real-time events |
| `companyPortabilityService` | `company-portability.ts` | Import/export |
| `documentService` | `documents.ts` | Document management |
| `assetService` | `assets.ts` | File assets |

---

## 4. CLI Command Inventory

### Total Commands: **13 Top-Level Commands** | **~30 Subcommands**

| Command | Subcommands | Purpose |
|---------|-------------|---------|
| **Server/Admin Commands** |||
| `onboard` | - | Instance onboarding |
| `doctor` | - | Health diagnostics |
| `configure` | - | Instance configuration |
| `run` | - | Run server |
| `heartbeat-run` | - | Execute heartbeat cycle |
| `db-backup` | - | Database backup |
| `env` | - | Environment setup |
| `allowed-hostname` | - | Hostname management |
| `auth-bootstrap-ceo` | - | Bootstrap CEO agent |
| `worktree` | `lib`, `merge-history-lib` | Git worktree operations |
| **Client Commands** |||
| `agent` | `list`, `get`, `local-cli` | Agent operations |
| `issue` | `list`, `get`, `create`, `update`, `comment`, `checkout`, `release` | Issue management |
| `company` | `list`, `get`, `create`, `update`, `delete` | Company management |
| `project` | `list`, `get`, `create`, `update`, `delete` | Project management |
| `goal` | `list`, `get`, `create`, `update`, `delete` | Goal management |
| `approval` | `list`, `get`, `approve`, `reject` | Approval workflows |
| `activity` | `list` | Activity viewing |
| `dashboard` | `show` | Dashboard view |
| `auth` | `login`, `logout`, `status` | Authentication |
| `context` | `set`, `get`, `list` | CLI context management |
| `plugin` | `list`, `install`, `uninstall`, `enable`, `disable` | Plugin management |
| `zip` | - | Archive operations |

### CLI Features:
- Multi-profile context management
- JSON output mode for scripting
- Interactive board authentication
- Environment variable export
- Local skills installation (Codex/Claude)

---

## 5. UI Page/Feature Inventory

### Total Pages: **38 Pages**

| Category | Pages | Count |
|----------|-------|-------|
| **Dashboard & Overview** | `Dashboard`, `Activity`, `Inbox`, `MyIssues` | 4 |
| **Agent Management** | `Agents`, `AgentDetail`, `NewAgent` | 3 |
| **Work Tracking** | `Issues`, `IssueDetail`, `Goals`, `GoalDetail`, `Projects`, `ProjectDetail`, `Routines`, `RoutineDetail` | 8 |
| **Governance** | `Approvals`, `ApprovalDetail`, `Org`, `OrgChart` | 4 |
| **Company & Settings** | `Companies`, `CompanySettings`, `CompanySkills`, `CompanyExport`, `CompanyImport`, `Costs` | 6 |
| **Instance Admin** | `InstanceSettings`, `InstanceGeneralSettings`, `InstanceExperimentalSettings` | 3 |
| **Plugin System** | `PluginManager`, `PluginPage`, `PluginSettings` | 3 |
| **Execution** | `ExecutionWorkspaceDetail`, `RunTranscriptUxLab` | 2 |
| **Auth & Onboarding** | `Auth`, `CliAuth`, `BoardClaim`, `InviteLanding` | 4 |
| **System** | `DesignGuide`, `NotFound` | 2 |

### UI Components & Features:
- Real-time live events (SSE)
- Org chart visualization (SVG/PNG export)
- File attachments with preview
- Comment threads on issues
- Activity feeds
- Cost tracking dashboards
- Plugin UI slot system
- Responsive design

---

## 6. Plugin Capabilities

### Plugin System Architecture

| Capability | Status | Description |
|------------|--------|-------------|
| **Lifecycle Management** | ✅ Implemented | Install, enable, disable, uninstall |
| **UI Extensions** | ✅ Implemented | Slots: `company_home`, `issue_panel`, `agent_panel`, `sidebar`, `toolbarButton` |
| **Worker Bridge** | ✅ Implemented | `getData`, `performAction`, SSE streaming |
| **Tool Registration** | ✅ Implemented | Agent-callable tools |
| **Job Scheduling** | ✅ Implemented | Cron-like job execution |
| **Webhook Handling** | ✅ Implemented | Inbound webhook endpoints |
| **State Persistence** | ✅ Implemented | Key-value state storage |
| **Entity Storage** | ✅ Implemented | Plugin-scoped entities |
| **Secrets Access** | ✅ Implemented | Secure secret resolution |
| **Configuration** | ✅ Implemented | Per-plugin config with validation |

### Plugin Example Types:
1. **plugin-hello-world-example** - Basic UI widget
2. **plugin-file-browser-example** - File browser integration
3. **plugin-kitchen-sink-example** - Comprehensive API demo
4. **plugin-authoring-smoke-example** - Development testing

### Plugin Manifest Support:
```typescript
interface PluginManifest {
  id: string;
  version: string;
  requestedPermissions: Permission[];
  surfaces: UiSurface[];
  workerEntry: string;
  uiEntry: string;
  launchers: Launcher[];
}
```

---

## 7. Adapter Types Supported

### Total Adapters: **7 Adapters**

| Adapter | Type | Runtime | Status |
|---------|------|---------|--------|
| **claude-local** | Local CLI | Claude Code | ✅ Full |
| **codex-local** | Local CLI | OpenAI Codex | ✅ Full |
| **cursor-local** | Local IDE | Cursor | ✅ Full |
| **gemini-local** | Local CLI | Gemini CLI | ✅ Full |
| **opencode-local** | Local CLI | OpenCode | ✅ Full |
| **pi-local** | Local CLI | Pi CLI | ✅ Full |
| **openclaw-gateway** | Gateway | Remote execution | ✅ Full |

### Adapter Capabilities Matrix:

| Capability | claude | codex | cursor | gemini | opencode | pi | openclaw |
|------------|--------|-------|--------|--------|----------|-----|----------|
| Local execution | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Skill sync | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Model selection | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Instructions bundle | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quota probing | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Device auth | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 8. Roadmap Features (Implemented vs Planned)

### P0 - Critical (Mostly Implemented)

| Feature | Status | Notes |
|---------|--------|-------|
| Cost safety + heartbeat hardening | 🟡 Partial | Budget policies exist, circuit breaker planned |
| Guided onboarding + first-job magic | 🟡 Partial | Onboard command exists, interview-first planned |
| Shared/cloud deployment foundation | ✅ Implemented | Multiple deployment modes supported |
| Artifact phase 1: non-image attachments | ✅ Implemented | Full attachment support |

### P1 - High Priority (In Progress)

| Feature | Status | Notes |
|---------|--------|-------|
| Board command surface | 🟡 Partial | Issue-based, no dedicated chat |
| Visibility/explainability layer | 🟡 Partial | Dashboard, activity logs exist |
| Auto mode + interrupt/resume | 🟡 Partial | Run states implemented |
| Minimal multi-user collaboration | ✅ Implemented | Company roles exist |

### P2 - Future

| Feature | Status | Notes |
|---------|--------|-------|
| Project workspace / preview / PR lifecycle | 🟡 Partial | Workspaces exist, PR links planned |
| Plugin system + optional chat plugin | ✅ Implemented | Plugin system complete |
| Template/preset expansion | 🟡 Planned | Onboarding profiles planned |
| Knowledge base / RAG | 🔴 Planned | Plugin candidate |
| Remote runtime drivers (e2b) | 🔴 Planned | Architecture ready |

---

## 9. Feature Comparison Matrix

| Feature | Paperclip | Ckamal | Notes |
|---------|-----------|--------|-------|
| **Core Platform** ||||
| Multi-tenant companies | ✅ | ✅ | Both support company isolation |
| Agent orchestration | ✅ | ✅ | Paperclip more mature |
| Issue tracking | ✅ | ✅ | Similar capabilities |
| Project management | ✅ | ✅ | Paperclip has workspaces |
| **Governance** ||||
| Approval workflows | ✅ | ❌ | Paperclip has formal approvals |
| Budget enforcement | ✅ | ❌ | Paperclip has budget policies |
| Cost tracking | ✅ | ❌ | Paperclip has detailed cost events |
| Permission system | ✅ | ❌ | Paperclip has RBAC |
| **Adapters** ||||
| Claude support | ✅ | ✅ | Both supported |
| Codex support | ✅ | ❌ | Paperclip only |
| Cursor support | ✅ | ❌ | Paperclip only |
| Gemini support | ✅ | ❌ | Paperclip only |
| OpenCode support | ✅ | ❌ | Paperclip only |
| Multiple adapters simultaneously | ✅ | ❌ | Paperclip supports mixed companies |
| **Extensibility** ||||
| Plugin system | ✅ | ❌ | Paperclip has full plugin SDK |
| UI extensions | ✅ | ❌ | Paperclip slots system |
| Custom tools | ✅ | ❌ | Paperclip tool registration |
| Webhook integrations | ✅ | ❌ | Paperclip plugin webhooks |
| **Execution** ||||
| Local execution | ✅ | ✅ | Both supported |
| Workspace isolation | ✅ | ❌ | Paperclip execution workspaces |
| Git worktrees | ✅ | ❌ | Paperclip worktree support |
| Remote execution | 🟡 | ❌ | OpenClaw gateway exists |
| **Observability** ||||
| Activity logging | ✅ | ❌ | Paperclip comprehensive |
| Real-time events | ✅ | ❌ | Paperclip SSE |
| Run transcripts | ✅ | ❌ | Paperclip heartbeat runs |
| Cost analytics | ✅ | ❌ | Paperclip cost dashboard |
| **CLI** ||||
| Full CLI client | ✅ | ❌ | Paperclip comprehensive CLI |
| Context management | ✅ | ❌ | Paperclip profiles |
| Skills installation | ✅ | ❌ | Paperclip auto-installs |
| **Deployment** ||||
| Docker compose | ✅ | ✅ | Both supported |
| Kubernetes | ✅ | ❌ | Paperclip has k8s configs |
| Railway/Railway.toml | ✅ | ❌ | Paperclip native support |
| Tailscale private | ✅ | ❌ | Paperclip documented |

---

## 10. Unique Features (Not in Ckamal)

### High-Value Unique Features

1. **Multi-Adapter Support**
   - Simultaneous support for 7+ AI runtimes
   - Per-agent adapter assignment
   - Adapter-specific skill synchronization

2. **Comprehensive Plugin System**
   - Full SDK with TypeScript types
   - UI slot injection
   - Worker/bridge architecture
   - Tool registration for agents
   - Job scheduling
   - Webhook handling
   - State persistence

3. **Governance & Financial Controls**
   - Budget policies with incident tracking
   - Approval workflows with comments
   - Cost event tracking per agent/company
   - Permission grants system

4. **Workspace & Execution Management**
   - Execution workspaces for isolation
   - Git worktree integration
   - Workspace operations tracking
   - Runtime service reconciliation

5. **Observability Infrastructure**
   - Activity log with attribution
   - Heartbeat run tracking
   - Real-time SSE events
   - Cost analytics dashboard

6. **Enterprise Features**
   - Company import/export
   - Instance settings (general/experimental)
   - Multi-user company membership
   - Role-based access control

7. **Developer Experience**
   - Comprehensive CLI with context profiles
   - Local skills auto-installation
   - Plugin development examples
   - Org chart generation (SVG/PNG)

8. **Document & Artifact System**
   - Issue documents with revision history
   - Work products tracking
   - File attachments with content serving
   - Document templates

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **API Routes** | 24 files, ~150+ endpoints |
| **Database Tables** | 57 tables |
| **Services** | ~35 services |
| **CLI Commands** | 13 top-level, ~30 subcommands |
| **UI Pages** | 38 pages |
| **Adapters** | 7 adapter types |
| **Plugin Examples** | 4 examples |
| **Roadmap Docs** | 28 planning documents |

---

## Architectural Highlights

1. **Layered Architecture:** Routes → Services → Database (clean separation)
2. **Plugin Architecture:** Worker-based with bridge communication
3. **Multi-tenancy:** Company-scoped with permission isolation
4. **Event-Driven:** Activity logs, live events, webhooks
5. **Extensible:** Plugin SDK, adapter interface, UI slots

---

*End of Paperclip Feature Inventory*
