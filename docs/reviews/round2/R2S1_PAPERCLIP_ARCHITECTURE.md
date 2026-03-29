# Round 2, Study 1: Paperclip Architecture Deep Dive

## Executive Summary

Paperclip is a sophisticated **Node.js-based control plane for AI-agent companies** that demonstrates excellent architectural patterns for building multi-agent orchestration systems. It uses a **monorepo structure** with pnpm workspaces, implements a **plugin system** for extensibility, and employs a **heartbeat-based agent scheduling** mechanism.

**Key Architectural Pillars:**
- Modular monorepo with clear package boundaries
- Adapter pattern for multi-provider AI agent support
- Plugin system with capability-based security
- Drizzle ORM with PostgreSQL for data persistence
- React + Vite + shadcn/ui for the frontend

---

## 1. Directory Structure Analysis

```
archive/paperclip/
├── packages/                    # Shared packages
│   ├── db/                     # Drizzle ORM schema & migrations
│   ├── shared/                 # Shared types, constants, validators
│   ├── adapter-utils/          # Adapter interface definitions
│   ├── adapters/               # Agent adapter implementations
│   │   ├── claude-local/       # Claude Code adapter
│   │   ├── codex-local/        # OpenAI Codex adapter
│   │   ├── cursor-local/       # Cursor IDE adapter
│   │   ├── gemini-local/       # Google Gemini adapter
│   │   ├── opencode-local/     # OpenCode adapter
│   │   ├── pi-local/           # Pi AI adapter
│   │   └── openclaw-gateway/   # OpenClaw gateway adapter
│   └── plugins/                # Plugin system
│       ├── sdk/                # Plugin SDK for authors
│       ├── create-paperclip-plugin/  # Plugin scaffolding
│       └── examples/           # Example plugins
├── server/                     # Express REST API
│   └── src/
│       ├── adapters/           # HTTP & Process adapters
│       ├── auth/               # Authentication (Better Auth)
│       ├── middleware/         # Express middleware
│       ├── routes/             # API route handlers
│       ├── services/           # Business logic services
│       ├── storage/            # Storage providers
│       └── realtime/           # WebSocket for live events
├── ui/                         # React frontend
│   └── src/
│       ├── adapters/           # UI adapter configs
│       ├── api/                # API client layer
│       ├── components/         # React components (shadcn/ui)
│       ├── context/            # React context providers
│       ├── hooks/              # Custom React hooks
│       ├── pages/              # Route-level pages
│       └── plugins/            # Plugin UI integration
├── cli/                        # CLI tooling
├── doc/                        # Documentation
│   ├── plans/                  # Dated implementation plans
│   ├── plugins/                # Plugin specifications
│   └── spec/                   # Technical specifications
└── tests/                      # E2E tests (Playwright)
```

### Structure Strengths
1. **Clear separation of concerns** - Each package has a single responsibility
2. **Workspace-based organization** - pnpm workspaces enable clean dependency management
3. **Co-location of related code** - Adapters contain server, UI, and CLI parts together
4. **Explicit documentation hierarchy** - Plans, specs, and guides are organized by date/topic

---

## 2. Monorepo Organization

### Package Architecture (pnpm workspaces)

```yaml
# pnpm-workspace.yaml
packages:
  - packages/*
  - packages/adapters/*
  - packages/plugins/*
  - packages/plugins/examples/*
  - server
  - ui
  - cli
```

### Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                        APPLICATIONS                         │
├─────────────┬─────────────┬─────────────────────────────────┤
│   server    │     ui      │        cli                      │
└──────┬──────┴──────┬──────┴─────────────────────────────────┘
       │             │
       ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│                      PLATFORM PACKAGES                        │
├──────────────┬──────────────┬────────────────┬──────────────┤
│     db       │   shared     │ adapter-utils  │  adapters/*  │
│  (Drizzle)   │(Types/Zod)   │  (Interfaces)  │(Implement)   │
└──────────────┴──────────────┴────────────────┴──────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      PLUGIN ECOSYSTEM                         │
├─────────────────────────────────────────────────────────────┤
│  @paperclipai/plugin-sdk  │  create-paperclip-plugin         │
│  (Plugin runtime API)     │  (Scaffolding CLI)               │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Workspace Tool | pnpm 9.15+ | Fast, disk-efficient, strict dependency management |
| Build System | TypeScript + esbuild | Fast compilation, ESM-first |
| Testing | Vitest + Playwright | Unit + E2E coverage |
| Package Publishing | NPM registry | Standard distribution |

---

## 3. Technology Stack

### Backend Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Node.js 20+ | JavaScript runtime |
| Framework | Express.js | HTTP server & routing |
| Database | PostgreSQL (embedded or external) | Primary data store |
| ORM | Drizzle ORM | Type-safe SQL queries |
| Auth | Better Auth | Session & user management |
| Real-time | WebSocket (ws) | Live event streaming |
| Validation | Zod | Schema validation |

### Frontend Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | React 18 | UI library |
| Build Tool | Vite | Development & bundling |
| Styling | Tailwind CSS | Utility-first CSS |
| Components | shadcn/ui | Headless UI primitives |
| State | TanStack Query | Server state management |
| Routing | React Router | Client-side navigation |

### Key Dependencies Analysis

```typescript
// Drizzle ORM Pattern - Type-safe schema definition
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    adapterType: text("adapter_type").notNull().default("process"),
    adapterConfig: jsonb("adapter_config").$type<Record<string, unknown>>().notNull().default({}),
    // ...
  },
  (table) => ({
    companyStatusIdx: index("agents_company_status_idx").on(table.companyId, table.status),
  })
);
```

---

## 4. Plugin System Architecture

### Plugin Architecture Overview

Paperclip's plugin system enables **third-party extensions** without modifying core code. Plugins run in **out-of-process workers** communicating via JSON-RPC over stdio.

```
┌──────────────────────────────────────────────────────────────────┐
│                    PAPERCLIP HOST PROCESS                        │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Plugin      │  │ Plugin      │  │ Plugin Job Scheduler    │  │
│  │ Loader      │  │ Registry    │  │                         │  │
│  └──────┬──────┘  └─────────────┘  └─────────────────────────┘  │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           PLUGIN WORKER PROCESS (Node.js)                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │   │
│  │  │ Worker RPC  │  │ Plugin      │  │ Host Client │       │   │
│  │  │ Host        │  │ Definition  │  │ Handlers    │       │   │
│  │  └──────┬──────┘  └─────────────┘  └─────────────┘       │   │
│  │         │                                                 │   │
│  │         │  JSON-RPC over stdio                            │   │
│  │         │                                                 │   │
│  └─────────┼─────────────────────────────────────────────────┘   │
│            │                                                      │
│            ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    HOST SERVICES                         │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │   │
│  │  │ Events     │ │ State      │ │ HTTP       │ ...       │   │
│  │  └────────────┘ └────────────┘ └────────────┘           │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Plugin Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Install │───▶│ Validate │───▶│  Load    │───▶│ Initialize│
└──────────┘    └──────────┘    └──────────┘    └────┬─────┘
                                                     │
                         ┌───────────────────────────┼───────────┐
                         ▼                           ▼           ▼
                   ┌──────────┐               ┌──────────┐ ┌──────────┐
                   │  Start   │               │  Health  │ │ Shutdown │
                   │  Worker  │               │   Check  │ │          │
                   └──────────┘               └──────────┘ └──────────┘
```

### Capability System

Plugins declare **capabilities** in their manifest. The host enforces these at runtime:

```typescript
// Example capabilities
interface PluginCapabilities {
  // Data Read
  "companies.read": boolean;
  "projects.read": boolean;
  "issues.read": boolean;
  "agents.read": boolean;
  
  // Data Write
  "issues.create": boolean;
  "issues.update": boolean;
  "activity.log.write": boolean;
  
  // Plugin State
  "plugin.state.read": boolean;
  "plugin.state.write": boolean;
  
  // Runtime / Integration
  "events.subscribe": boolean;
  "events.emit": boolean;
  "jobs.schedule": boolean;
  "http.outbound": boolean;
  "secrets.read-ref": boolean;
  
  // Agent Tools
  "agent.tools.register": boolean;
}
```

### Plugin SDK API

```typescript
// Plugin definition pattern
export default definePlugin({
  async setup(ctx: PluginContext) {
    // Subscribe to events
    ctx.events.on("issue.created", async (event) => {
      // Handle event
    });
    
    // Register scheduled jobs
    ctx.jobs.register("full-sync", async (job) => {
      // Run sync
    });
    
    // Register agent tools
    ctx.tools.register("search", {
      displayName: "Search",
      description: "Search external system",
      parametersSchema: { /* JSON Schema */ }
    }, async (params, runCtx) => {
      // Execute tool
      return { content: "result" };
    });
    
    // Register UI data handlers
    ctx.data.register("sync-health", async (params) => {
      return { status: "ok" };
    });
  }
});
```

---

## 5. Adapter Pattern Implementation

### Adapter Architecture

The **Adapter Pattern** abstracts different AI agent providers behind a unified interface:

```
┌──────────────────────────────────────────────────────────────┐
│                    ADAPTER REGISTRY                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│   │  claude_    │  │  codex_     │  │   cursor    │         │
│   │  local      │  │  local      │  │             │         │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│          │                │                │                │
│   ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐         │
│   │  Hermes     │  │  OpenCode   │  │   Gemini    │         │
│   │  (OpenAI)   │  │  Local      │  │   Local     │         │
│   └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│   │  openclaw_  │  │  process    │  │    http     │         │
│   │  gateway    │  │  (generic)  │  │  (generic)  │         │
│   └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Adapter Interface

```typescript
interface ServerAdapterModule {
  type: string;
  
  // Core execution
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
  
  // Environment validation
  testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult>;
  
  // Skill management (for local adapters)
  listSkills?(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot>;
  syncSkills?(ctx: AdapterSkillContext, desiredSkills: string[]): Promise<AdapterSkillSnapshot>;
  
  // Session management
  sessionCodec?: AdapterSessionCodec;
  sessionManagement?: AdapterSessionManagement;
  
  // Model information
  models?: AdapterModel[];
  listModels?: () => Promise<AdapterModel[]>;
  detectModel?: () => Promise<{ model: string; provider: string; source: string } | null>;
  
  // Quota/rate limit reporting
  getQuotaWindows?: () => Promise<ProviderQuotaResult>;
  
  // Agent configuration documentation
  agentConfigurationDoc?: string;
  supportsLocalAgentJwt?: boolean;
}
```

### Adapter Registration Pattern

```typescript
// server/src/adapters/registry.ts
const adaptersByType = new Map<string, ServerAdapterModule>(
  [
    claudeLocalAdapter,
    codexLocalAdapter,
    cursorLocalAdapter,
    geminiLocalAdapter,
    openCodeLocalAdapter,
    piLocalAdapter,
    openclawGatewayAdapter,
    hermesLocalAdapter,
    processAdapter,
    httpAdapter,
  ].map((a) => [a.type, a]),
);

export function getServerAdapter(type: string): ServerAdapterModule {
  const adapter = adaptersByType.get(type);
  if (!adapter) {
    return processAdapter; // Graceful fallback
  }
  return adapter;
}
```

### Adapter Execution Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent     │────▶│  Heartbeat  │────▶│   Adapter   │────▶│   Child     │
│   Config    │     │   Service   │     │   Execute   │     │  Process    │
└─────────────┘     └─────────────┘     └──────┬──────┘     └──────┬──────┘
                                               │                   │
                                               │     ┌─────────────┘
                                               │     │
                                               ▼     ▼
                                        ┌─────────────────┐
                                        │  Parse stdout   │
                                        │  Stream events  │
                                        └────────┬────────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
                                        │  Update run     │
                                        │  state in DB    │
                                        └─────────────────┘
```

---

## 6. Heartbeat System Design

### Heartbeat Architecture

The **Heartbeat System** is Paperclip's core orchestration mechanism for agent scheduling:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      HEARTBEAT ORCHESTRATION                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────┐ │
│  │   Timer Tick    │─────▶│  Reap Orphaned  │─────▶│ Resume Queued│ │
│  │  (Interval)     │      │     Runs        │      │    Runs      │ │
│  └─────────────────┘      └─────────────────┘      └─────────────┘ │
│           │                                                         │
│           ▼                                                         │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    RUN STATE MACHINE                          │ │
│  ├─────────┬─────────┬─────────┬─────────┬─────────┬────────────┤ │
│  │ queued  │──▶│running  │──▶│completed│   │failed   │   │cancelled   │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └────────────┘ │
│       ▲          │                                              │
│       └──────────┘ (on failure, retry logic)                     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Key Heartbeat Components

| Component | Responsibility |
|-----------|----------------|
| `heartbeatService` | Main orchestration service |
| `tickTimers()` | Periodic check for agents needing wakeup |
| `reapOrphanedRuns()` | Clean up stale running runs |
| `resumeQueuedRuns()` | Resume work from previous process |
| `evaluateSessionCompaction()` | Rotate sessions based on thresholds |
| `withAgentStartLock()` | Prevent concurrent runs per agent |

### Session Management

```typescript
// Session compaction policy for managing conversation context
interface SessionCompactionPolicy {
  enabled: boolean;
  maxSessionRuns: number;        // Rotate after N runs
  maxRawInputTokens: number;     // Rotate after token threshold
  maxSessionAgeHours: number;    // Rotate after age threshold
}

// Session state tracking
interface AdapterRuntime {
  sessionId: string | null;
  sessionParams: Record<string, unknown> | null;
  sessionDisplayId: string | null;
  taskKey: string | null;
}
```

### Run Execution Flow

```
1. WAKEUP TRIGGER
   ├── Timer-based (scheduled heartbeat)
   ├── Assignment-based (issue assigned)
   ├── On-demand (manual invocation)
   └── Automation (webhook/callback)

2. PRE-EXECUTION CHECKS
   ├── Budget enforcement
   ├── Agent status validation
   ├── Workspace resolution
   └── Session parameter building

3. EXECUTION
   ├── Spawn adapter process
   ├── Stream stdout/stderr
   ├── Parse transcript events
   └── Update run state

4. POST-EXECUTION
   ├── Normalize usage/costs
   ├── Write cost events
   ├── Update agent runtime state
   └── Trigger next heartbeat if needed
```

---

## 7. UI Component Architecture (shadcn/ui)

### Component Architecture

Paperclip uses **shadcn/ui** for headless, accessible UI primitives:

```
ui/src/components/
├── ui/                          # shadcn/ui primitives
│   ├── button.tsx              # Button component
│   ├── card.tsx                # Card container
│   ├── dialog.tsx              # Modal dialogs
│   ├── dropdown-menu.tsx       # Dropdown menus
│   ├── input.tsx               # Form inputs
│   ├── select.tsx              # Select dropdowns
│   ├── tabs.tsx                # Tab navigation
│   └── ...                     # Other primitives
│
├── AgentConfigForm.tsx         # Agent configuration UI
├── AgentProperties.tsx         # Agent detail view
├── ApprovalCard.tsx            # Approval workflow UI
├── CommandPalette.tsx          # Global search/commands
├── Layout.tsx                  # App shell layout
├── OnboardingWizard.tsx        # New user onboarding
└── ...                         # Domain-specific components
```

### Design System

| Token | Usage |
|-------|-------|
| `--background` | Page background |
| `--foreground` | Primary text |
| `--card` | Card backgrounds |
| `--primary` | Primary actions |
| `--destructive` | Errors/destructive actions |
| `--muted` | Secondary backgrounds |
| `--border` | Borders and dividers |

### Component Pattern Example

```tsx
// Composed component using shadcn primitives
export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AgentIcon type={agent.icon} />
          <CardTitle>{agent.name}</CardTitle>
        </div>
        <CardDescription>{agent.role}</CardDescription>
      </CardHeader>
      <CardContent>
        <AgentStatusBadge status={agent.status} />
        <BudgetProgress 
          spent={agent.spentMonthlyCents} 
          total={agent.budgetMonthlyCents} 
        />
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" size="sm">Pause</Button>
        <Button size="sm">Wake</Button>
      </CardFooter>
    </Card>
  );
}
```

### State Management

```
┌─────────────────────────────────────────────────────────────┐
│                     STATE ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │           TanStack Query (Server State)               │ │
│  │  • API caching                                          │ │
│  │  • Background refetching                                │ │
│  │  • Optimistic updates                                   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │           React Context (UI State)                    │ │
│  │  • CompanyContext - Selected company                  │ │
│  │  • DialogContext - Modal management                   │ │
│  │  • AuthContext - Authentication state                 │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │           Local State (Component)                     │ │
│  │  • Form inputs                                          │ │
│  │  • UI toggles                                           │ │
│  │  • Animation states                                     │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Database Schema (Drizzle ORM)

### Schema Organization

```
packages/db/src/schema/
├── index.ts                    # Schema exports
├── auth.ts                     # Better Auth tables
├── companies.ts                # Company entities
├── agents.ts                   # Agent definitions
├── projects.ts                 # Projects
├── project_workspaces.ts       # Workspace mappings
├── goals.ts                    # Goal hierarchy
├── issues.ts                   # Tasks/Issues
├── heartbeat_runs.ts           # Agent execution runs
├── cost_events.ts              # Cost tracking
├── budget_policies.ts          # Budget rules
├── plugins.ts                  # Plugin metadata
├── plugin_state.ts             # Plugin state storage
└── ...                         # Supporting tables
```

### Core Entity Relationships

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    companies    │◄──────│     agents      │◄──────│  heartbeat_runs │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │       │ id (PK)         │
│ name            │       │ company_id (FK) │       │ agent_id (FK)   │
│ status          │       │ name            │       │ status          │
└─────────────────┘       │ adapter_type    │       │ usage_json      │
         │                │ adapter_config  │       │ result_json     │
         │                │ reports_to (FK) │       └─────────────────┘
         │                └─────────────────┘
         │                         │
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│    projects     │       │     issues      │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ company_id (FK) │       │ company_id (FK) │
│ goal_id (FK)    │       │ project_id (FK) │
└─────────────────┘       │ assignee_agent  │
                          │ status          │
                          └─────────────────┘
```

### Key Schema Patterns

#### 1. Company-Scoped Entities

Every business entity is scoped to a company:

```typescript
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // ...
  },
  (table) => ({
    companyStatusIdx: index("agents_company_status_idx").on(table.companyId, table.status),
  })
);
```

#### 2. JSONB for Flexible Config

Adapter and runtime configurations use JSONB:

```typescript
adapterConfig: jsonb("adapter_config").$type<Record<string, unknown>>().notNull().default({}),
runtimeConfig: jsonb("runtime_config").$type<Record<string, unknown>>().notNull().default({}),
```

#### 3. Soft Deletes / Status

Status enums instead of hard deletes:

```typescript
status: text("status").notNull().default("idle"), // active | paused | idle | running | error | terminated
```

#### 4. Audit Fields

Every table includes audit timestamps:

```typescript
createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
```

### Migration Strategy

```
packages/db/src/migrations/
├── 0000_mature_masked_marvel.sql
├── 0001_fast_northstar.sql
├── ...
├── 0045_workable_shockwave.sql
└── meta/
    ├── _journal.json           # Migration journal
    └── 0000_snapshot.json      # Schema snapshots
```

**Migration Workflow:**
1. Edit schema files in `packages/db/src/schema/`
2. Run `pnpm db:generate` to create migration
3. Run `pnpm db:migrate` to apply migrations

---

## 9. Key Architectural Patterns

### Pattern 1: Service Layer Pattern

```typescript
// server/src/services/agents.ts
export function agentService(db: Db) {
  return {
    async list(companyId: string) {
      // Implementation
    },
    async create(input: CreateAgentInput) {
      // Implementation
    },
    async update(agentId: string, patch: UpdateAgentPatch) {
      // Implementation
    },
    // ...
  };
}

// Usage
const agents = agentService(db);
await agents.create({ name: "CTO", role: "engineering" });
```

### Pattern 2: Route Registration Pattern

```typescript
// server/src/routes/agents.ts
export function agentRoutes(db: Db): Router {
  const router = Router();
  const service = agentService(db);
  
  router.get("/", async (req, res) => {
    const agents = await service.list(req.actor.companyId);
    res.json({ agents });
  });
  
  return router;
}

// server/src/app.ts
app.use("/agents", agentRoutes(db));
```

### Pattern 3: Middleware Composition

```typescript
// Authentication middleware
app.use(actorMiddleware(db, { deploymentMode, resolveSession }));

// Route-level guards
api.use(boardMutationGuard());

// Error handling
app.use(errorHandler);
```

### Pattern 4: API Client Pattern (Frontend)

```typescript
// ui/src/api/agents.ts
export const agentsApi = {
  async list(): Promise<Agent[]> {
    const res = await fetch("/api/agents");
    return res.json();
  },
  // ...
};

// ui/src/hooks/useAgents.ts
export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: () => agentsApi.list(),
  });
}
```

### Pattern 5: Event-Driven Plugin Communication

```typescript
// Plugin subscribes to events
ctx.events.on("issue.created", async (event) => {
  await syncToExternalSystem(event.payload);
});

// Plugin emits custom events
ctx.events.emit("sync-complete", companyId, { synced: 42 });
```

---

## 10. Strengths and Innovations

### Architectural Strengths

| Strength | Description |
|----------|-------------|
| **Clean Separation** | Clear boundaries between server, UI, adapters, and plugins |
| **Type Safety** | End-to-end TypeScript with Drizzle ORM ensures type safety |
| **Extensibility** | Plugin system and adapter pattern enable third-party extensions |
| **Multi-Tenancy** | Company-scoped data model supports multiple organizations |
| **Cost Awareness** | Built-in cost tracking and budget enforcement |
| **Session Management** | Sophisticated session rotation and context preservation |
| **Embedded Database** | Zero-config setup with embedded PostgreSQL |

### Key Innovations

#### 1. Heartbeat-Based Orchestration

Unlike traditional job queues, Paperclip uses **heartbeat scheduling**:
- Agents wake on configurable intervals
- Check for assigned work
- Maintain persistent sessions across invocations
- Graceful handling of process restarts

#### 2. Adapter Abstraction

Unified interface for disparate AI agents:
- Claude Code, Codex, Cursor, Gemini, etc.
- Same execution semantics regardless of provider
- Pluggable skill management per adapter

#### 3. Capability-Based Security

Plugins declare capabilities; host enforces:
```typescript
capabilities: [
  "events.subscribe",
  "issues.read",
  "http.outbound",
  "agent.tools.register"
]
```

#### 4. Goal Alignment System

Hierarchical goal tracking:
```
Company Goal
└── Team Goal
    └── Agent Goal
        └── Task
```

Every task traces back to company mission.

#### 5. Audit-First Design

All mutations logged to activity log:
- Actor attribution
- Timestamp
- Before/after state
- Immutable history

---

## 11. Comparison Matrix for CogniMesh

| Aspect | Paperclip | Notes for CogniMesh |
|--------|-----------|---------------------|
| **Monorepo** | pnpm workspaces | Similar approach recommended |
| **Backend** | Express + Drizzle | Consider Fastify or NestJS |
| **Frontend** | React + Vite + shadcn | Same stack recommended |
| **Database** | PostgreSQL | Same - excellent choice |
| **Adapters** | Package-per-adapter | Similar pattern applicable |
| **Plugins** | Out-of-process workers | In-process for simpler deployments |
| **Auth** | Better Auth | Multiple providers needed |
| **Scheduling** | Heartbeat-based | Consider cron + event-driven |
| **Cost Tracking** | Built-in | Essential feature |

---

## 12. Conclusion

Paperclip represents a **mature, production-ready architecture** for AI agent orchestration. Its key contributions are:

1. **The Adapter Pattern** for multi-provider AI support
2. **The Plugin System** with capability-based security
3. **Heartbeat Orchestration** for persistent agent sessions
4. **Company-Scoped Multi-Tenancy** for data isolation

For CogniMesh, the most applicable patterns are:
- The monorepo workspace organization
- The adapter pattern for AI provider abstraction
- The service layer and route registration patterns
- The shadcn/ui component architecture
- The Drizzle ORM schema patterns

---

*Document generated for Round 2 Architecture Review*
*Date: 2026-03-29*
