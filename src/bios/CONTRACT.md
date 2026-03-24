# BIOS Layer Contract

## Overview

CogniMesh BIOS (Basic Input/Output System) is the foundational firmware layer for AI-driven multi-agent development. It provides system lifecycle management, component orchestration, health monitoring, and a unified interface for coordinating multiple AI clients including Claude, Kimi, and Codex.

**Version:** 5.0.0  
**Last Updated:** 2026-03-23  
**Compatibility:** CogniMesh v5.0+

---

## Public Interfaces

### CogniMeshBIOS

The core BIOS class managing system state and component lifecycle.

#### Methods

##### `boot(options)` → `Promise<boolean>`

Initializes the complete BIOS system with multi-phase boot sequence.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `options` | `Object` | No | Boot configuration options |
| `options.configPath` | `string` | No | Path to configuration file |
| `options.skipDiagnostics` | `boolean` | No | Skip diagnostic checks (default: false) |

**Returns:** `Promise<boolean>` - Boot success status

**Events Emitted:**
- `bios:boot:start` - Boot sequence initiated
- `bios:config:loaded` - Configuration loaded
- `bios:subsystems:initialized` - Subsystems ready
- `bios:boot:complete` - Successful boot
- `bios:boot:error` - Boot failure

**Example:**
```javascript
const bios = new CogniMeshBIOS();
const success = await bios.boot({
  configPath: './config/bios.json',
  skipDiagnostics: false
});
```

---

##### `diagnose()` → `Promise<Object>`

Runs comprehensive system diagnostics on all registered components.

**Returns:** `Promise<Object>`
```typescript
{
  healthy: boolean;        // Overall system health
  errors: string[];        // List of diagnostic errors
  components: Object;      // Per-component health status
  timestamp: string;       // ISO timestamp
}
```

**Events Emitted:**
- `bios:diagnose:start` - Diagnostics started
- `bios:diagnose:complete` - Diagnostics complete

---

##### `getStatus()` → `Object`

Returns comprehensive system status snapshot.

**Returns:** `Object`
```typescript
{
  version: string;         // BIOS version
  state: SystemState;      // Current state
  uptime: number;          // System uptime in ms
  bootTime: string;        // ISO boot timestamp
  components: string[];    // Registered component IDs
  health: Object;          // Health monitor status
  config: Object;          // Sanitized configuration
}
```

---

##### `setMode(mode, options)` → `Promise<boolean>`

Transitions system to a different operational mode.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `SystemState` | Yes | Target mode (BOOT, OPERATIONAL, MAINTENANCE, SAFE_MODE) |
| `options` | `Object` | No | Transition options |

**Throws:** `Error` - If transition is invalid

**Events Emitted:**
- `bios:transition:start` - Transition initiated
- `bios:transition:complete` - Transition successful
- `bios:transition:error` - Transition failed

---

### OperatorConsole

Interactive console for system management and command execution.

#### Methods

##### `registerCommand(name, handler, description)` → `void`

Registers a new console command.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `string` | Yes | Command name |
| `handler` | `Function` | Yes | Command handler function |
| `description` | `string` | No | Help text description |

---

##### `execute(input)` → `Promise<any>`

Executes a console command with arguments.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `input` | `string` | Yes | Command input string |

**Returns:** `Promise<any>` - Command result

**Events Emitted:**
- `command:success` - Command executed successfully
- `command:error` - Command execution failed

#### Built-in Commands

| Command | Signature | Description |
|---------|-----------|-------------|
| `status` | `status()` | Show system status |
| `agents` | `agents <list\|spawn <cv-id>\|kill <agent-id>>` | Agent management |
| `clients` | `clients()` | Show client connections |
| `delegate` | `delegate <task> [--client <name>]` | Delegate task to client |
| `parallel` | `parallel <tasks...> [--strategy <name>]` | Run parallel tasks |
| `chain` | `chain <step1> <step2> ...` | Chain tasks across clients |
| `update` | `update [check\|apply\|rollback]` | Update management |
| `patch` | `patch <create\|verify\|apply> <id>` | Patch management |
| `logs` | `logs [--level <level>] [--tail <n>]` | Show system logs |
| `metrics` | `metrics()` | Show system metrics |
| `test` | `test [--suite <name>]` | Run regression tests |
| `help` | `help [command]` | Show help information |
| `exit/quit` | `exit()` | Exit console |

#### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `command:success` | `{ command, args, result }` | Command executed successfully |
| `command:error` | `{ command, args, error }` | Command execution failed |

---

### AgentOrchestrator

Multi-client task execution and coordination system.

#### Methods

##### `spawnAgent(cv, options)` → `Promise<Agent>`

Spawns a new agent from a CV (Curriculum Vitae).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cv` | `Object` | Yes | Agent CV with capabilities |
| `options.client` | `string` | No | Preferred client ('claude', 'kimi', 'codex') |
| `options.context` | `Object` | No | Initial context data |

**Returns:** `Promise<Agent>` - Spawned agent instance

---

##### `delegateTask(task, options)` → `Promise<Object>`

Delegates a single task to a specific client.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | `Task` | Yes | Task definition object |
| `options.client` | `string` | No | Target client ('claude', 'kimi', 'codex') |
| `options.priority` | `TaskPriority` | No | Task priority level |
| `options.timeout` | `number` | No | Task timeout in ms |

**Returns:** `Promise<Object>` - Task result

---

##### `parallelExecution(tasks, options)` → `Promise<Object>`

Executes multiple tasks in parallel across available clients.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tasks` | `Task[]` | Yes | Array of tasks to execute |
| `options.clients` | `string[]` | No | Specific clients to use |
| `options.aggregation` | `string` | No | Result aggregation ('merge', 'vote', 'first', 'all') |

**Returns:** `Promise<Object>` - Aggregated results

---

##### `chainExecution(steps, options)` → `Promise<Object>`

Executes tasks in a sequential chain with data handoff between steps.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `steps` | `ChainStep[]` | Yes | Array of chain steps |
| `options.initialData` | `Object` | No | Initial input data |

**ChainStep Structure:**
```typescript
{
  client: string;          // Client to use ('kimi', 'claude', 'codex', 'auto')
  task: string;            // Task type
  data?: Object;           // Step data
  inputFrom?: string;      // Input from previous step
  transform?: Function;    // Transform function for input
}
```

---

##### `swarmExecution(task, options)` → `Promise<Object>`

Executes using Kimi-style agent swarm pattern.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | `Task` | Yes | Main task definition |
| `options.agents` | `SwarmAgentConfig[]` | No | Swarm agent configurations |
| `options.coordinator` | `string` | No | Coordinator agent client |

**SwarmAgentConfig Structure:**
```typescript
{
  role: string;            // Agent role in swarm
  client?: string;         // Preferred client
  capabilities?: Object;   // Required capabilities
  context?: Object;        // Agent context
}
```

---

##### `planModeExecution(task, options)` → `Promise<Object>`

Executes using Claude-style plan mode with human-in-the-loop approval.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | `Task` | Yes | Task to plan and execute |
| `options.autoApprove` | `boolean` | No | Auto-approve plan steps |
| `options.onPlanCreated` | `Function` | No | Callback when plan is created |

---

### CVRegistry

Registry for managing agent Curriculum Vitae.

#### Methods

##### `registerCV(cv)` → `Object`

Registers a new CV in the registry.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cv` | `AgentCV` | Yes | Validated CV object |

**Returns:** `Object` - Registered CV with metadata

**Throws:** `Error` - If CV validation fails or ID already exists

---

##### `findCVs(criteria)` → `Object[]`

Finds CVs matching given criteria with relevance scoring.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `criteria.capabilities` | `string[]` | No | Required capabilities |
| `criteria.domains` | `string[]` | No | Required domains |
| `criteria.tools` | `string[]` | No | Required tools |
| `criteria.languages` | `string[]` | No | Programming languages |
| `criteria.performance` | `Object` | No | Performance requirements |
| `criteria.status` | `string` | No | Lifecycle status |
| `criteria.resources` | `Object` | No | Resource requirements |

**Returns:** `Object[]` - Matching CVs sorted by relevance

---

##### `getCV(id)` → `Object`

Retrieves a CV by its ID.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | CV identifier |

**Returns:** `Object` - CV object or undefined

---

##### `updatePerformance(id, metrics)` → `Object`

Updates performance metrics for a CV.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | CV identifier |
| `metrics` | `Object` | Yes | Performance metrics to update |

**Metrics Structure:**
```typescript
{
  successRate?: number;    // 0-1 success rate
  avgLatency?: number;     // Average latency in ms
  qualityScore?: number;   // 0-100 quality score
  tasksCompleted?: number; // Total tasks completed
  tasksSucceeded?: number; // Successful tasks
  tasksFailed?: number;    // Failed tasks
}
```

---

### ClientGateway

Unified interface for managing multiple AI provider clients.

#### Methods

##### `initialize()` → `Promise<Object>`

Initializes all configured client connections.

**Returns:** `Promise<Object>` - Client status map

---

##### `sendToClient(provider, message, options)` → `Promise<Object>`

Sends a message to a specific client provider.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `provider` | `string` | Yes | Provider name ('claude', 'kimi', 'codex') |
| `message` | `string\|Object` | Yes | Message to send |
| `options` | `Object` | No | Send options |

---

##### `broadcast(message, options)` → `Promise<Object[]>`

Broadcasts a message to all connected clients.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `message` | `string\|Object` | Yes | Message to broadcast |
| `options` | `Object` | No | Broadcast options |

**Returns:** `Promise<Object[]>` - Array of client responses

---

##### `getClientStatus(provider)` → `Object`

Gets the status of a specific client.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `provider` | `string` | Yes | Provider name |

**Returns:** `Object` - Client status information

---

##### `selectBestClient(task)` → `string`

Selects the best client for a given task based on capabilities and availability.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | `Object` | Yes | Task requirements |

**Returns:** `string` - Selected client identifier

---

### UpdateManager

Handles checking, downloading, and applying system updates.

#### Methods

##### `checkForUpdates()` → `Promise<Object>`

Checks for available updates from the configured repository.

**Returns:** `Promise<Object>`
```typescript
{
  available: boolean;      // Whether update is available
  currentVersion: string;  // Current version
  latestVersion: string;   // Latest available version
  release: Object;         // Release details
  type: string;            // Update type (patch, minor, major, hotfix)
  publishedAt: string;     // Release date
  downloadUrl: string;     // Download URL
}
```

---

##### `downloadUpdate(version)` → `Promise<Object>`

Downloads a specific version update.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `version` | `string` | Yes | Version to download |

**Returns:** `Promise<Object>` - Download result with paths and verification status

---

##### `applyUpdate(version)` → `Promise<Object>`

Applies a downloaded update.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `version` | `string` | Yes | Version to apply |

**Returns:** `Promise<Object>` - Application result

**Events Emitted:**
- `update:applying` - Update application started
- `update:applied` - Update successfully applied
- `update:failed` - Update application failed

---

##### `rollback(version)` → `Promise<Object>`

Rolls back to a previous version.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `version` | `string` | Yes | Version to rollback to |

**Returns:** `Promise<Object>` - Rollback result

---

### PatchVerifier

Comprehensive patch verification system with multi-phase testing.

#### Methods

##### `verifyPatch(patchId, options)` → `Promise<Object>`

Verifies a patch through the complete verification pipeline.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `patchId` | `string` | Yes | Unique patch identifier |
| `options.skipPhases` | `string[]` | No | Phases to skip |
| `options.timeout` | `number` | No | Verification timeout |

**Returns:** `Promise<Object>`
```typescript
{
  patchId: string;
  timestamp: Date;
  phases: {
    staticAnalysis: Object;
    unitTests: Object;
    integrationTests: Object;
    performanceTests: Object;
    securityScan: Object;
  };
  passed: boolean;
  score: number;
  issues: Array;
  duration: number;
}
```

**Events Emitted:**
- `verify:start` - Verification started
- `phase:start` - Phase started
- `phase:complete` - Phase completed
- `verify:complete` - Verification complete
- `verify:error` - Verification error

---

##### `runRegressionSuite(suite)` → `Promise<Object>`

Runs a regression test suite.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `suite` | `string\|Object` | Yes | Suite name or configuration |

**Returns:** `Promise<Object>` - Test results

---

##### `approvePatch(patchId)` → `void`

Approves a verified patch for deployment.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `patchId` | `string` | Yes | Patch identifier |

**Throws:** `Error` - If patch verification failed

---

##### `rejectPatch(patchId, reason)` → `void`

Rejects a patch with a reason.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `patchId` | `string` | Yes | Patch identifier |
| `reason` | `string` | Yes | Rejection reason |

---

## Data Structures

### AgentCV

Complete CV schema for agent registration:

```typescript
{
  // Required fields
  id: string;                    // Unique identifier (pattern: ^[a-z0-9_-]+$)
  name: string;                  // Display name (1-100 chars)
  version: string;               // Semantic version (e.g., "1.0.0")
  
  capabilities: {
    languages: string[];         // Supported languages (e.g., ['javascript', 'python'])
    domains: string[];           // Expertise domains (e.g., ['web', 'ai', 'devops'])
    tools: string[];             // Available tools
    maxContextTokens: number;    // Maximum context window
    supportsStreaming: boolean;  // Streaming support flag
    supportsVision: boolean;     // Vision/multimodal support
    supportsFunctionCalling?: boolean;  // Function calling capability
    supportsParallelToolCalls?: boolean; // Parallel tool execution
  };
  
  // Optional fields
  description?: string;          // CV description
  
  performance?: {
    successRate: number;         // 0-1 success rate
    avgLatency: number;          // Average response time (ms)
    qualityScore: number;        // 0-100 quality score
    tasksCompleted: number;      // Total completed tasks
    tasksSucceeded?: number;     // Successful tasks
    tasksFailed?: number;        // Failed tasks
    lastUpdated?: number;        // Timestamp
  };
  
  execution?: {
    preferredClient: 'claude' | 'kimi' | 'codex' | 'auto';
    fallbackClients: string[];   // Fallback client order
    parallelizable: boolean;     // Can run in parallel
    retryPolicy?: {
      maxRetries: number;
      backoff: 'fixed' | 'linear' | 'exponential';
      initialDelay?: number;
      maxDelay?: number;
    };
    timeout?: number;            // Default timeout (ms)
  };
  
  resources?: {
    minMemory: number;           // Minimum memory (MB)
    maxMemory: number;           // Maximum memory (MB)
    priority: number;            // 1-10 priority level
    cpuCores?: number;           // CPU core requirement
  };
  
  specialization?: {
    primary: string;             // Primary specialization
    secondary: string[];         // Secondary skills
    certifications: string[];    // Certifications/qualifications
    experience?: {
      years: number;
      projects: string[];
    };
  };
  
  lifecycle?: {
    status: 'active' | 'idle' | 'suspended' | 'deprecated';
    maxLifetime?: number;        // Maximum lifetime (ms)
    createdAt?: number;          // Creation timestamp
    expiresAt?: number;          // Expiration timestamp
  };
  
  metadata?: {
    author: string;              // CV author
    tags: string[];              // Search tags
    category: string;            // Category classification
  };
}
```

### SystemState

Enumeration of system operational states:

```typescript
enum SystemState {
  BOOT = 'BOOT',                    // Initial boot/startup
  DIAGNOSE = 'DIAGNOSE',            // Running diagnostics
  OPERATIONAL = 'OPERATIONAL',      // Normal operation
  MAINTENANCE = 'MAINTENANCE',      // Maintenance mode
  SAFE_MODE = 'SAFE_MODE'           // Degraded safe mode
}
```

**State Transitions:**
- BOOT → OPERATIONAL (normal boot)
- BOOT → SAFE_MODE (boot failure)
- OPERATIONAL → MAINTENANCE (scheduled maintenance)
- OPERATIONAL → SAFE_MODE (critical error)
- MAINTENANCE → OPERATIONAL (maintenance complete)
- SAFE_MODE → OPERATIONAL (recovery)
- Any → BOOT (shutdown/restart)

---

## Events

### BIOS Events

| Event | Source | Payload | Description |
|-------|--------|---------|-------------|
| `bios:boot:start` | CogniMeshBIOS | `{ version, timestamp }` | Boot sequence initiated |
| `bios:boot:complete` | CogniMeshBIOS | `{ duration, state, components }` | Boot successful |
| `bios:boot:error` | CogniMeshBIOS | `Error` | Boot failed |
| `bios:config:loaded` | CogniMeshBIOS | `config` | Configuration loaded |
| `bios:subsystems:initialized` | CogniMeshBIOS | `{}` | Subsystems ready |
| `bios:diagnose:start` | CogniMeshBIOS | `{}` | Diagnostics started |
| `bios:diagnose:complete` | CogniMeshBIOS | `results` | Diagnostics complete |
| `bios:transition:start` | CogniMeshBIOS | `{ from, to }` | State transition started |
| `bios:transition:complete` | CogniMeshBIOS | `{ from, to }` | State transition complete |
| `bios:transition:error` | CogniMeshBIOS | `{ state, error }` | State transition failed |
| `bios:safe-mode:entered` | CogniMeshBIOS | `{ cause }` | Safe mode activated |
| `bios:component:registered` | CogniMeshBIOS | `{ id, type }` | Component registered |
| `bios:component:unregistered` | CogniMeshBIOS | `{ id }` | Component unregistered |
| `bios:shutdown:start` | CogniMeshBIOS | `{}` | Shutdown initiated |
| `bios:shutdown:complete` | CogniMeshBIOS | `{}` | Shutdown complete |

### Orchestrator Events

| Event | Source | Payload | Description |
|-------|--------|---------|-------------|
| `agentSpawned` | AgentOrchestrator | `{ agentId, type, client }` | Agent spawned |
| `parallelExecutionStarted` | AgentOrchestrator | `{ executionId, taskCount }` | Parallel execution started |
| `parallelExecutionCompleted` | AgentOrchestrator | `{ executionId, results }` | Parallel execution complete |
| `chainExecutionStarted` | AgentOrchestrator | `{ executionId, stepCount }` | Chain execution started |
| `chainStepStarted` | AgentOrchestrator | `{ executionId, step, total, client }` | Chain step started |
| `chainStepCompleted` | AgentOrchestrator | `{ executionId, step, result }` | Chain step complete |
| `swarmExecutionStarted` | AgentOrchestrator | `{ swarmId, task }` | Swarm execution started |

### Update Events

| Event | Source | Payload | Description |
|-------|--------|---------|-------------|
| `update:available` | UpdateManager | `updateInfo` | Update available |
| `update:downloading` | UpdateManager | `{ version, progress }` | Download progress |
| `update:downloaded` | UpdateManager | `{ version, path }` | Download complete |
| `update:applying` | UpdateManager | `{ version }` | Update applying |
| `update:applied` | UpdateManager | `{ version }` | Update applied |
| `update:failed` | UpdateManager | `{ version, error }` | Update failed |
| `update:rollback` | UpdateManager | `{ from, to }` | Rollback executed |

### Health Monitor Events

| Event | Source | Payload | Description |
|-------|--------|---------|-------------|
| `system:alert` | SystemMonitor | `HealthAlert` | System alert |
| `system:critical` | SystemMonitor | `Error` | Critical system error |
| `clientHealthChanged` | ClientGateway | `{ client, healthy }` | Client health changed |

---

## Error Handling

### Error Types

| Error Type | Description | Handling Strategy |
|------------|-------------|-------------------|
| `BootError` | Boot sequence failure | Transition to SAFE_MODE |
| `ComponentError` | Component initialization/operation failure | Log, alert, attempt recovery |
| `TaskError` | Task execution failure | Retry with backoff, fail over |
| `ClientError` | AI client communication failure | Use fallback client |
| `CVError` | CV validation or registry error | Reject invalid CV, alert operator |
| `UpdateError` | Update download/apply failure | Rollback to previous version |
| `VerificationError` | Patch verification failure | Reject patch, alert operator |

### Error Structure

```typescript
interface BIOSError {
  code: string;           // Error code (e.g., 'BIOS_BOOT_FAILED')
  message: string;        // Human-readable message
  source: string;         // Component/source
  timestamp: string;      // ISO timestamp
  severity: 'info' | 'warning' | 'error' | 'critical';
  recoverable: boolean;   // Whether error is recoverable
  details?: Object;       // Additional error details
}
```

### Recovery Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `retry` | Retry operation with exponential backoff | Transient failures |
| `failover` | Switch to fallback client/resource | Client unavailable |
| `degrade` | Reduce functionality and continue | Partial system failure |
| `safeMode` | Enter safe mode with minimal functionality | Critical failure |
| `rollback` | Revert to previous working state | Update/change failure |
| `alert` | Notify operator and wait for intervention | Unknown/unexpected errors |

---

## Constants

### Execution Strategies

```javascript
ExecutionStrategy = {
  SINGLE: 'single',         // Single task execution
  PARALLEL: 'parallel',     // Parallel execution across clients
  CHAINED: 'chained',       // Sequential chain execution
  SWARM: 'swarm',           // Kimi-style swarm execution
  PLAN: 'plan'              // Claude-style plan mode
}
```

### Task Priorities

```javascript
TaskPriority = {
  CRITICAL: 1,    // System-critical tasks
  HIGH: 2,        // High priority
  NORMAL: 3,      // Normal priority (default)
  LOW: 4,         // Low priority
  BACKGROUND: 5   // Background tasks
}
```

### Task States

```javascript
TaskState = {
  PENDING: 'pending',       // Waiting to start
  QUEUED: 'queued',         // In queue
  ASSIGNED: 'assigned',     // Assigned to agent
  RUNNING: 'running',       // Currently executing
  COMPLETED: 'completed',   // Successfully completed
  FAILED: 'failed',         // Execution failed
  CANCELLED: 'cancelled',   // Cancelled by user
  TIMEOUT: 'timeout'        // Execution timed out
}
```

### Update States

```javascript
UpdateState = {
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  APPLYING: 'applying',
  APPLIED: 'applied',
  FAILED: 'failed',
  ROLLING_BACK: 'rolling_back',
  ROLLED_BACK: 'rolled_back'
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 5.0.0 | 2026-03-23 | Initial v5.0 release with multi-client support |
