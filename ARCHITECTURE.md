# CogniMesh v5.0 Architecture

## Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Component Architecture](#component-architecture)
4. [Data Flow](#data-flow)
5. [Technology Stack](#technology-stack)
6. [Design Patterns](#design-patterns)
7. [Security Architecture](#security-architecture)
8. [Scalability Considerations](#scalability-considerations)

---

## Overview

**CogniMesh v5.0** is a production-grade MCP (Model Context Protocol) server designed for multi-agent AI orchestration. It provides a unified platform for managing AI agents, tasks, workflows, and integrations with multiple AI clients including Claude, Kimi, and Codex.

### Key Capabilities

- **Multi-Agent Orchestration**: Spawn and manage specialized agents for different tasks
- **Multi-Client Support**: Unified interface for Claude, Kimi, and Codex AI clients
- **Domain-Driven Design**: 10 isolated business domains with clear boundaries
- **Verifiable Audit**: Cryptographic proof of all operations via Merkle trees
- **Real-time Communication**: WebSocket-based streaming and event distribution
- **Auto-scaling**: Dynamic agent pool management based on workload

### Architecture Philosophy

The system follows a **BIOS metaphor** - treating the AI orchestration platform like computer firmware with:
- Boot sequence and diagnostics
- Operational modes (boot, operational, maintenance, safe-mode)
- Component registry and lifecycle management
- Self-healing and recovery mechanisms

---

## High-Level Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT INTERFACE LAYER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Claude    │  │    Kimi     │  │    Codex    │  │   WebSocket/MCP     │ │
│  │   Desktop   │  │    IDE      │  │   Copilot   │  │      Clients        │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
└─────────┼────────────────┼────────────────┼────────────────────┼────────────┘
          │                │                │                    │
          └────────────────┴────────────────┘                    │
                           │                                     │
┌──────────────────────────┴─────────────────────────────────────┴────────────┐
│                         CLIENT GATEWAY LAYER                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Client Gateway (Router)                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │  Claude      │  │  Kimi        │  │  Codex       │              │   │
│  │  │  Adapter     │  │  Adapter     │  │  Adapter     │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT ORCHESTRATOR LAYER                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  CogniMeshBIOS (v5.0.0)                             │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │   │
│  │  │    BOOT    │  │ OPERATIONAL│  │MAINTENANCE │  │ SAFE_MODE  │    │   │
│  │  │    Mode    │  │    Mode    │  │    Mode    │  │    Mode    │    │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │              System Monitor & Health Check                  │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXECUTION LAYER (Domains)                           │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │Architecture │ │   Context   │ │    GSD      │ │Integrations │          │
│  │  Analyzer   │ │  Snapshots  │ │  Domain     │ │  Webhooks   │          │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │   Merkle    │ │Orchestration│ │  Retention  │ │  Roadmaps   │          │
│  │   Trees     │ │   Engine    │ │  Policies   │ │   & Paths   │          │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐                                            │
│  │    Tasks    │ │   Thought   │                                            │
│  │  Manager    │ │    Audit    │                                            │
│  └─────────────┘ └─────────────┘                                            │
│                                                                             │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GITHUB INTEGRATION LAYER                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    GitHub Client Integration                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │  Auto-Update │  │    Patcher   │  │   Registry   │              │   │
│  │  │   Manager    │  │  & Verifier  │  │   & Cache    │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility | Key Components |
|-------|---------------|----------------|
| **Client Interface** | User-facing AI client integrations | Claude Desktop, Kimi IDE, Codex Copilot |
| **Client Gateway** | Protocol adaptation and routing | Client adapters, request routing |
| **Agent Orchestrator** | System lifecycle and state management | CogniMeshBIOS, System Monitor |
| **Execution Layer** | Business logic and domain operations | 10 DDD domains, GSD Engine |
| **GitHub Integration** | Version control and auto-updates | Patcher, Update Manager |

---

## Component Architecture

### 1. CogniMeshBIOS (Core System Firmware)

**Purpose**: Manages system lifecycle, state transitions, and component orchestration using a BIOS metaphor.

**Responsibilities**:
- Execute boot sequence with diagnostics
- Manage operational modes (BOOT → OPERATIONAL → MAINTENANCE → SAFE_MODE)
- Component registration and lifecycle management
- System health monitoring and self-healing
- Graceful shutdown coordination

**Key Classes**:
```javascript
class CogniMeshBIOS extends EventEmitter {
  static VERSION = '5.0.0';
  
  // State management
  get state() -> SystemState
  get components() -> Map<string, BIOSComponent>
  get operator() -> Object|null
  
  // Lifecycle
  async boot(options) -> boolean
  async diagnose() -> DiagnosticResults
  async transitionTo(targetState, options) -> boolean
  async shutdown(options) -> void
  
  // Component management
  registerComponent(id, component)
  unregisterComponent(id)
  getComponent(id) -> BIOSComponent
  
  // Status
  getStatus() -> SystemStatus
}
```

**Dependencies**:
- `SystemMonitor` - Health monitoring
- `BootMode`, `OperationalMode`, `MaintenanceMode`, `SafeMode` - State handlers

---

### 2. Client Gateway Layer

**Purpose**: Provides unified access to multiple AI clients with protocol adaptation.

**Responsibilities**:
- Client detection and protocol negotiation
- Request transformation for each client type
- Response normalization
- Multi-client session management

**Key Classes**:
```javascript
// Base client interface
class BaseClient {
  async connect()
  async disconnect()
  async execute(params)
  getCapabilities() -> ClientCapabilities
}

// Client-specific adapters
class ClaudeClient extends BaseClient { }
class KimiClient extends BaseClient { }
class CodexClient extends BaseClient { }
```

**Supported Clients**:
| Client | Interface | Features |
|--------|-----------|----------|
| Claude | Desktop, IDE, MCP | Vision, Extended Thinking, Streaming |
| Kimi | IDE, Swarm | Multi-turn conversations |
| Codex | Copilot, CLI, Cursor | Code completion, Inline chat |

---

### 3. Domain Layer (10 Domains)

**Purpose**: Encapsulates business logic in isolated, testable domains following DDD principles.

#### Domain Registry

```javascript
class DomainRegistry {
  register(id, entry) -> DomainRegistry
  get(id, options) -> DomainInstance
  has(id) -> boolean
  list(filters) -> DomainInfo[]
  async initialize()
  async dispose()
}
```

#### Domain Details

| Domain | Purpose | Key Classes |
|--------|---------|-------------|
| **Architecture** | Project structure analysis | `ArchitectureAnalyzer` |
| **Context** | Snapshot management | `ContextSnapshotManager` |
| **GSD** | Workflow execution | `GSDDomain`, `WorkflowBuilder` |
| **Integrations** | Webhooks, notifications | `IntegrationManager` |
| **Merkle** | Cryptographic audit | `MerkleTree`, `AuditProof` |
| **Orchestration** | Tool orchestration | `OrchestrationEngine` |
| **Retention** | Data lifecycle | `RetentionPolicyManager` |
| **Roadmaps** | Learning paths | `RoadmapManager` |
| **Tasks** | Task management | `TaskManager`, `EisenhowerMatrix` |
| **Thought** | Reasoning audit | `ThoughtChain` |

---

### 4. GSD Engine (Get Shit Done)

**Purpose**: Core workflow execution engine with agent orchestration.

**Responsibilities**:
- Workflow creation and execution
- Agent pool management
- Task planning and scheduling
- Parallel execution coordination
- Result aggregation and verification

**Key Classes**:
```javascript
class GSDEngine {
  createWorkflow(type, tasks, options) -> Workflow
  executeWorkflow(workflowId, options) -> ExecutionResult
  cancelWorkflow(workflowId)
  getWorkflowStatus(workflowId) -> WorkflowStatus
}

class AgentPool {
  acquire(type, timeout) -> Agent
  release(agent)
  scale(targetSize)
  getStats() -> PoolStats
}

class Agent {
  get status() -> AgentStatus
  async execute(task) -> TaskResult
  async terminate()
}

class Planner {
  createPlan(tasks, options) -> ExecutionPlan
  optimizePlan(plan) -> OptimizedPlan
  estimateDuration(plan) -> number
}
```

**Agent Types**:
- `WORKER` - General purpose task execution
- `COORDINATOR` - Multi-agent workflow coordination
- `SPECIALIST` - Domain-specific deep expertise

---

### 5. Database & Persistence Layer

**Purpose**: Provides data persistence with connection pooling and repository pattern.

**Key Classes**:
```javascript
class ConnectionPool extends EventEmitter {
  async initialize()
  acquire() -> DatabaseConnection
  release(connection)
  getStats() -> PoolStats
  async close()
}

class RepositoryFactory {
  get tasks() -> TaskRepository
  get roadmaps() -> RoadmapRepository
  get contexts() -> ContextRepository
  get merkle() -> MerkleRepository
}

// Base repository interface
class BaseRepository {
  findById(id) -> Entity|null
  findAll(filters) -> Entity[]
  create(data) -> Entity
  update(id, data) -> Entity
  delete(id) -> boolean
}
```

**Schema**:
- SQLite with multi-connection pooling
- Migration system with rollback support
- Vector extension for RAG embeddings

---

### 6. WebSocket & Real-time Layer

**Purpose**: Enables real-time bidirectional communication for streaming and events.

**Key Classes**:
```javascript
class WebSocketServer extends EventEmitter {
  async start()
  async stop()
  broadcast(message, rooms)
  sendToClient(clientId, message)
  getStats() -> WebSocketStats
}

class StreamManager {
  createStream(options) -> Stream
  registerStream(streamId, stream)
  pipeToClient(streamId, socket)
  abortStream(streamId)
}
```

**Features**:
- Heartbeat and connection management
- Room-based message broadcasting
- Stream backpressure handling
- Authentication integration

---

### 7. GitHub Integration Layer

**Purpose**: Provides version control integration, auto-updates, and patch management.

**Key Classes**:
```javascript
class UpdateManager {
  async checkForUpdates() -> UpdateInfo
  async downloadUpdate(version) -> DownloadResult
  async applyUpdate(version) -> ApplyResult
  async rollback()
}

class PatchVerifier {
  async verifyPatch(patch) -> VerificationResult
  async applyPatch(patch, options) -> PatchResult
  async verifyIntegrity() -> IntegrityResult
}

class RegressionSuite {
  async runTests() -> TestResults
  async runBenchmarks() -> BenchmarkResults
  compareResults(baseline, current) -> Comparison
}
```

---

## Data Flow

### 1. Request Flow Through System

```
┌─────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Client  │────▶│    HTTP/     │────▶│    Client    │────▶│  BIOS Check  │
│ Request │     │   WebSocket  │     │   Gateway    │     │   & Route    │
└─────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                 │
                    ┌────────────────────────────────────────────┘
                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Response   │◀────│   Result     │◀────│   Domain     │◀────│   Tool       │
│   to Client  │     │   Formatter  │     │   Execution  │     │   Handler    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### 2. Agent Spawning Flow

```
┌──────────────┐
│ Spawn Request│
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   BIOS       │────▶│   Agent      │────▶│   CV         │
│   Validate   │     │   Pool       │     │   Factory    │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │ Scale Up │  │ Agent    │  │ Inject   │
       │ Pool     │  │ Instance │  │ Context  │
       └────┬─────┘  └────┬─────┘  └────┬─────┘
            │             │             │
            └─────────────┴─────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │ Agent Ready  │
                   │  Event       │
                   └──────────────┘
```

### 3. Update/Patch Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   GitHub     │────▶│   Download   │────▶│   Verify     │
│   Release    │     │   Package    │     │   Signature  │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                    ┌────────────────────────────┘
                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Resume     │◀────│   Apply      │◀────│   Create     │◀────│   Run        │
│   Operations │     │   Patch      │     │   Checkpoint │     │   Regression │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### 4. Multi-Client Orchestration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Unified Request                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Claude    │  │    Kimi     │  │    Codex    │
│   Handler   │  │   Handler   │  │   Handler   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │               │               │
       └───────────────┼───────────────┘
                       ▼
              ┌─────────────────┐
              │   Aggregator    │
              │  (Consensus)    │
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │ Unified Response│
              └─────────────────┘
```

---

## Technology Stack

### Core Runtime

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | 20+ | JavaScript runtime with ES modules |
| Language | JavaScript | ES2022 | Primary language with modern features |
| Module System | ES Modules | - | Native import/export support |

### Database & Storage

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Database | SQLite | Primary persistence |
| Connection Pool | Custom | Multi-connection management |
| Migrations | Custom runner | Schema versioning |
| Vector Store | SQLite + Extension | RAG embeddings storage |

### Communication

| Component | Technology | Purpose |
|-----------|-----------|---------|
| HTTP Server | Node.js `http` | REST API endpoints |
| WebSocket | `ws` library | Real-time communication |
| MCP Protocol | JSON-RPC | Model Context Protocol |
| Streaming | Server-Sent Events | Live response streaming |

### AI Integration

| Client | API | Features |
|--------|-----|----------|
| Claude | Anthropic API | Messages, Vision, Extended Thinking |
| Kimi | Moonshot API | Chat completions |
| Codex | OpenAI API | Code completions |
| GitHub | Octokit | Repository operations |

### Validation & Security

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Validation | Zod | Schema validation |
| GitHub API | Octokit | Repository integration |
| Encryption | Node.js `crypto` | AES-256-GCM, scrypt |

### Development Tools

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Testing | Custom runners | Unit, integration, performance |
| Linting | ESLint | Code quality |
| Formatting | Prettier | Code formatting |

---

## Design Patterns

### 1. BIOS Metaphor

The system emulates computer BIOS firmware:

```javascript
// Boot sequence
await bios.boot({
  configPath: './config.json',
  skipDiagnostics: false
});

// State transitions
await bios.transitionTo(SystemState.MAINTENANCE, {
  reason: 'Scheduled update',
  timeout: 300000
});

// Safe mode on critical errors
bios.on('system:critical', async (error) => {
  await bios.transitionTo(SystemState.SAFE_MODE, { cause: error });
});
```

**Benefits**:
- Clear system lifecycle semantics
- Self-diagnostic capabilities
- Graceful degradation
- Predictable recovery paths

---

### 2. Domain-Driven Design

10 isolated domains with clear boundaries:

```javascript
// Domain registration
const registry = new DomainRegistry();
registry.register('tasks', {
  name: 'Task Management Domain',
  version: '1.0.0',
  factory: TaskDomain,
  dependencies: ['context']
});

// Dependency resolution
const taskDomain = registry.get('tasks');
// Automatically resolves 'context' dependency
```

**Domain Characteristics**:
- Each domain has a CONTRACT.md defining its interface
- Dependencies explicitly declared
- Lazy initialization with singleton support
- Clean disposal lifecycle

---

### 3. Event-Driven Architecture

Built on Node.js EventEmitter:

```javascript
// BIOS events
bios.on('bios:boot:start', ({ version, timestamp }) => {
  logger.info(`Boot started: v${version}`);
});

bios.on('bios:boot:complete', ({ duration }) => {
  metrics.recordBootTime(duration);
});

// Agent events
agent.on('task:start', (task) => {
  audit.log({ type: 'task_start', taskId: task.id });
});

agent.on('task:complete', (result) => {
  eventBus.emit('workflow:progress', result);
});
```

**Event Categories**:
- System lifecycle events
- Agent state changes
- Workflow progress
- Security audit events

---

### 4. Circuit Breaker Pattern

Fault tolerance for external services:

```javascript
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenMaxCalls: 3
});

// Execute with automatic failure handling
const result = await breaker.execute(
  () => claudeClient.sendMessage(params)
);

// States: CLOSED → OPEN → HALF_OPEN → CLOSED
```

**Configuration**:
- `failureThreshold`: Failures before opening
- `resetTimeout`: Time before attempting reset
- `halfOpenMaxCalls`: Test calls in half-open state

---

### 5. Repository Pattern

Abstracted data access:

```javascript
// Repository interface
class TaskRepository extends BaseRepository {
  async findByStatus(status, options) -> Task[]
  async findOverdue() -> Task[]
  async updatePriority(id, priority) -> Task
  async getEisenhowerMatrix() -> MatrixData
}

// Usage
const tasks = await repositories.tasks
  .findByStatus('pending', { limit: 10 });
```

**Benefits**:
- Testability via mock repositories
- Query optimization centralized
- Schema changes isolated

---

### 6. Gateway Pattern

Unified access to external services:

```javascript
// Database Gateway
class DatabaseGateway {
  async query(sql, params) -> QueryResult
  async transaction(fn) -> TransactionResult
}

// Git Checkpoint Gateway
class GitCheckpointGateway {
  async createCheckpoint(tag, metadata) -> Checkpoint
  async restoreCheckpoint(checkpointId) -> void
}
```

---

### 7. Factory Pattern

Agent and CV creation:

```javascript
// CV (Curriculum Vitae) Factory
const cv = CVFactory.create({
  role: 'architect',
  specialties: ['system-design', 'performance'],
  experience: 'senior'
});

// Agent Factory
const agent = AgentFactory.create({
  type: AGENT_TYPES.SPECIALIST,
  cv: cv,
  domain: 'architecture'
});
```

---

## Security Architecture

### Authentication Methods

```javascript
// JWT Authentication
const auth = new AuthMiddleware({
  type: AUTH_TYPES.JWT,
  secret: process.env.JWT_SECRET,
  algorithm: JWT_ALGORITHMS.HS256,
  expiry: '1h'
});

// API Key Authentication
const apiAuth = new AuthMiddleware({
  type: AUTH_TYPES.API_KEY,
  header: 'X-API-Key',
  validate: async (key) => validateKey(key)
});

// OAuth Integration
const oauthAuth = new AuthMiddleware({
  type: AUTH_TYPES.OAUTH,
  provider: 'github',
  scopes: ['read:user', 'read:org']
});

// Session-based
const sessionAuth = new AuthMiddleware({
  type: AUTH_TYPES.SESSION,
  store: redisStore,
  maxAge: 24 * 60 * 60 * 1000
});
```

---

### Authorization (ACL)

Role-based access control with hierarchy:

```javascript
const acl = new ACLMiddleware({
  roles: ROLE_HIERARCHY,
  inherit: ROLE_INHERITANCE
});

// Standard roles
const ROLES = {
  ADMIN: 'admin',      // Full access
  MANAGER: 'manager',  // Project management
  USER: 'user',        // Standard operations
  GUEST: 'guest'      // Read-only
};

// Permission checking
acl.check({
  user: currentUser,
  resource: 'task',
  action: 'update',
  context: { taskId: '123' }
});

// Custom conditions
acl.addCondition(ownerCondition());
acl.addCondition(timeCondition({ start: '09:00', end: '18:00' }));
acl.addCondition(ipCondition({ allowed: ['10.0.0.0/8'] }));
```

---

### Audit Logging with Merkle Trees

Cryptographic verification of audit trail:

```javascript
// Every operation is logged and hashed
const audit = new AuditMiddleware({
  storage: merkleRepository,
  includeContext: true
});

// Merkle tree structure for tamper evidence
class MerkleTree {
  insert(data) -> LeafNode
  verify(leaf) -> boolean
  getRoot() -> RootHash
  generateProof(leaf) -> MerkleProof
}

// Usage
await audit.log({
  action: 'task.update',
  user: 'user-123',
  resource: 'task-456',
  changes: { status: 'completed' },
  timestamp: Date.now()
});

// Later verification
const proof = await merkle.generateProof(leafId);
const isValid = await merkle.verify(proof);
```

---

### Input Sanitization

```javascript
const sanitizer = new InputSanitizer({
  allowedTags: ['b', 'i', 'code'],
  maxLength: 10000,
  escapeHtml: true
});

// Validation schema with Zod
const taskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  dueDate: z.date().optional()
});

const validated = taskSchema.parse(input);
```

---

### Rate Limiting

```javascript
const rateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // requests per window
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests' });
  }
});

// Per-endpoint limits
app.use('/api/tools', rateLimiter.withConfig({ max: 50 }));
app.use('/api/admin', rateLimiter.withConfig({ max: 20 }));
```

---

### Security Headers

```javascript
// Applied to all HTTP responses
{
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}
```

---

## Scalability Considerations

### 1. Connection Pooling

SQLite with multi-connection pooling for concurrent access:

```javascript
const pool = new ConnectionPool({
  databasePath: './data/cognimesh.db',
  maxConnections: 10,
  busyTimeout: 5000,
  maxRetries: 5,
  retryDelay: 200
});

// Automatic connection management
const connection = await pool.acquire();
try {
  await connection.run('INSERT INTO tasks ...');
} finally {
  pool.release(connection);
}
```

**Pool Statistics**:
- Total connections
- In-use connections
- Available connections
- Wait queue length

---

### 2. Agent Pooling with Auto-scaling

Dynamic agent management based on workload:

```javascript
const agentPool = new AgentPool({
  minSize: 2,
  maxSize: 50,
  idleTimeout: 300000,
  scaleUpThreshold: 0.8,    // Scale up at 80% utilization
  scaleDownThreshold: 0.3   // Scale down at 30% utilization
});

// Auto-scaler monitors and adjusts
const autoScaler = new AutoScaler(agentPool, {
  checkInterval: 30000,
  scaleUpCooldown: 60000,
  scaleDownCooldown: 300000
});
```

**Scaling Policies**:
- Reactive: Scale based on current load
- Predictive: Scale based on forecast
- Scheduled: Scale based on time patterns

---

### 3. Load Balancing Strategies

```javascript
const loadBalancer = new LoadBalancer({
  strategy: 'weighted-round-robin',
  healthCheck: {
    interval: 30000,
    timeout: 5000,
    path: '/health'
  }
});

// Strategies available:
// - round-robin
// - weighted-round-robin
// - least-connections
// - least-response-time
// - ip-hash
```

---

### 4. Caching Strategy

Multi-tier caching for optimal performance:

```javascript
// LRU Cache for hot data
const lruCache = new LRUCache({
  max: 1000,
  ttl: 60000,
  updateAgeOnGet: true
});

// Domain-specific caches
const caches = {
  tools: new LRUCache({ max: 100 }),      // Tool definitions
  contexts: new LRUCache({ max: 50 }),    // Context snapshots
  responses: new LRUCache({ max: 200 })   // AI responses
};

// Cache middleware
app.use(cacheMiddleware({
  ttl: 300,
  keyGenerator: (req) => `${req.method}:${req.url}`,
  condition: (req) => req.method === 'GET'
}));
```

**Cache Tiers**:
1. **In-Memory**: Fastest, per-process
2. **Shared**: Redis/memcached for multi-instance
3. **Persistent**: SQLite for durable cache

---

### 5. Performance Monitoring

```javascript
const metrics = new MetricsMiddleware({
  enabled: true,
  exportInterval: 60000
});

// Tracked metrics:
// - Request latency (p50, p95, p99)
// - Throughput (requests/sec)
// - Error rates
// - Database query times
// - Agent utilization
// - Cache hit/miss ratios
```

---

## System States

```
                    ┌─────────────┐
                    │    BOOT     │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
       ┌─────────────┐           ┌─────────────┐
       │   DIAGNOSE  │           │  SAFE_MODE  │
       └──────┬──────┘           └─────────────┘
              │                      ▲
              ▼                      │
       ┌─────────────┐               │
       │ OPERATIONAL │───────────────┘
       └──────┬──────┘    (on critical error)
              │
              ▼
       ┌─────────────┐
       │MAINTENANCE  │
       └─────────────┘
```

---

## Configuration Summary

| Category | Key Settings |
|----------|-------------|
| **Server** | Port: 3000, Host: localhost, Env: development/production |
| **Database** | SQLite, 10 max connections, 5s busy timeout |
| **WebSocket** | Port: 8080, 30s heartbeat, 50MB max payload |
| **BIOS** | Max 50 agents, 5% regression threshold |
| **Security** | JWT/OAuth/API Key auth, 15-min rate window |
| **Cache** | 1000 max entries, 60s TTL |

---

## Appendix: File Structure

```
src/
├── bios/              # BIOS layer
├── clients/           # Client adapters
├── claude/            # Claude integration
├── controllers/       # MCP tool handlers
├── dashboard/         # Web dashboard
├── db/                # Database layer
├── domains/           # 10 DDD domains
├── gsd/               # GSD engine
├── intelligence/      # AI components
├── middleware/        # Middleware stack
├── security/          # Security modules
├── tools/             # Tool definitions
├── utils/             # Utilities
├── validation/        # Schema validation
├── websocket/         # WebSocket server
├── server.js          # Main entry
└── config.js          # Configuration
```

---

*Version: 5.0.0*  
*Last Updated: 2026-03-23*  
*CogniMesh Architecture Team*
