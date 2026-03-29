# Heartbeat System

The Heartbeat system provides comprehensive agent run tracking, session management, and cost attribution for AI agent execution in CogniMesh v5.0.

## Overview

Inspired by Paperclip's heartbeat system, CogniMesh provides:
- **Run lifecycle management**: Queue, start, complete, fail, and retry runs
- **Real-time event logging**: Structured logging with live streaming
- **Session persistence**: Agent context across multiple runs
- **Cost attribution**: Detailed cost tracking per run and agent
- **Orphaned run recovery**: Automatic detection and retry of lost runs

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HEARTBEAT SERVICE                       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Run Queue  │  │   Executor   │  │   Events     │      │
│  │   Manager    │  │   Engine     │  │   Stream     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
│         └─────────────────┼─────────────────┘              │
│                           │                                │
│              ┌────────────┴────────────┐                  │
│              │      Run Records        │                  │
│              │   (heartbeat_runs)      │                  │
│              └────────────┬────────────┘                  │
└───────────────────────────┼─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
┌────────▼────────┐  ┌──────▼───────┐  ┌──────▼───────┐
│ Session Manager │  │ Cost Ledger  │  │ Event Store  │
│                 │  │              │  │              │
└─────────────────┘  └──────────────┘  └──────────────┘
```

## Run Lifecycle

### Run States

```
QUEUED ──────────► RUNNING ──────────► SUCCEEDED
   │                   │
   │                   ├──────────────► FAILED
   │                   │
   └───────────────────┴──────────────► CANCELLED
                   (can timeout to TIMED_OUT)
```

| State | Description |
|-------|-------------|
| `queued` | Waiting for available slot |
| `running` | Currently executing |
| `succeeded` | Completed successfully |
| `failed` | Failed with error |
| `cancelled` | Manually cancelled |
| `timed_out` | Exceeded time limit |

### Creating Runs

```javascript
import { HeartbeatService, InvocationSource, TriggerDetail } from './src/runtime/heartbeat-service.js';

const heartbeat = new HeartbeatService({ db, budgetService });

// Create a new run
const run = await heartbeat.createRun({
  agentId: 'agent-uuid',
  invocationSource: InvocationSource.ON_DEMAND,  // timer, assignment, on_demand, automation
  triggerDetail: TriggerDetail.MANUAL,            // manual, ping, callback, system
  contextSnapshot: { task: 'refactor-code', priority: 'high' },
  sessionIdBefore: 'previous-session-id',
  externalRunId: 'ext-123'  // External system reference
});

// Returns:
{
  id: 'run-uuid',
  agentId: 'agent-uuid',
  status: 'queued',
  invocationSource: 'on_demand',
  triggerDetail: 'manual',
  createdAt: '2024-01-15T10:30:00Z'
}
```

### Starting Runs

```javascript
// Start a run (claims from queue)
const startedRun = await heartbeat.startRun('run-uuid');

// Returns null if:
// - Already claimed by another worker
// - Agent not found
// - Agent not invokable (paused, terminated, pending_approval)
// - Budget exceeded
// - Concurrent run limit reached
```

### Completing Runs

```javascript
// Complete successfully
await heartbeat.completeRun('run-uuid', {
  resultJson: { filesModified: 5, linesChanged: 150 },
  exitCode: 0,
  sessionIdAfter: 'new-session-id',
  usage: {
    provider: 'claude',
    model: 'claude-3-opus-20240229',
    inputTokens: 2500,
    outputTokens: 1500,
    costUsd: 0.15
  }
});
```

### Failing Runs

```javascript
import { ErrorCode } from './src/runtime/heartbeat-service.js';

// Fail a run
await heartbeat.failRun('run-uuid', 'API rate limit exceeded', ErrorCode.ADAPTER_FAILED, {
  shouldRetry: true  // Queue automatic retry
});

// Error codes:
// - AGENT_NOT_FOUND
// - AGENT_NOT_INVOKABLE
// - BUDGET_EXCEEDED
// - PROCESS_LOST
// - ADAPTER_FAILED
// - TIMEOUT
// - CANCELLED
// - SETUP_FAILED
```

### Cancelling Runs

```javascript
// Cancel a run
await heartbeat.cancelRun('run-uuid', 'User requested cancellation');
```

### Retrying Runs

```javascript
// Retry a failed run
const newRun = await heartbeat.retryRun('failed-run-uuid', {
  invocationSource: InvocationSource.AUTOMATION,
  triggerDetail: TriggerDetail.SYSTEM,
  reason: 'automatic_retry'
});
```

## Event Logging

### Appending Events

```javascript
// Append lifecycle event
await heartbeat.appendRunEvent('run-uuid', {
  eventType: 'lifecycle',
  stream: 'system',
  level: 'info',
  message: 'Starting code analysis'
});

// Append stdout
await heartbeat.appendRunEvent('run-uuid', {
  eventType: 'stdout',
  stream: 'stdout',
  message: 'Processing file: src/app.js'
});

// Append stderr
await heartbeat.appendRunEvent('run-uuid', {
  eventType: 'stderr',
  stream: 'stderr',
  level: 'error',
  message: 'Warning: Deprecated API usage'
});

// Custom event with payload
await heartbeat.appendRunEvent('run-uuid', {
  eventType: 'checkpoint',
  stream: 'system',
  level: 'info',
  message: 'Checkpoint saved',
  payload: { checkpointId: 'chk-123', files: 5 }
});
```

### Streaming Logs

```javascript
// Stream run log
await heartbeat.streamRunLog('run-uuid', (chunk) => {
  console.log(chunk);
});

// Append log chunk
await heartbeat.appendRunLog('run-uuid', 'stdout', 'Processing output...');
```

### Live WebSocket Events

Events are published in real-time via WebSocket:

```javascript
// Client receives:
{
  type: 'heartbeat.run.event',
  runId: 'run-uuid',
  agentId: 'agent-uuid',
  seq: 5,
  eventType: 'lifecycle',
  stream: 'system',
  level: 'info',
  message: 'Run started',
  timestamp: '2024-01-15T10:30:00Z'
}

// Log chunk:
{
  type: 'heartbeat.run.log',
  runId: 'run-uuid',
  stream: 'stdout',
  chunk: 'Processing file...',
  truncated: false,
  timestamp: '2024-01-15T10:30:01Z'
}
```

## Session Management

### Session Lifecycle

Sessions persist agent context across multiple runs:

```javascript
import { SessionManager } from './src/runtime/session-manager.js';

const sessionManager = new SessionManager({ db });
```

### Session Configuration

```javascript
// Default compaction config
const DEFAULT_COMPACTION_CONFIG = {
  enabled: true,
  maxSessionRuns: 10,        // Rotate after 10 runs
  maxRawInputTokens: 100000, // Rotate after 100K tokens
  maxSessionAgeHours: 24     // Rotate after 24 hours
};
```

### Getting Sessions

```javascript
// Get or create session
const session = await sessionManager.getSession(
  'agent-uuid',
  'task-key',
  'claude'
);

// Returns:
{
  id: 'session-uuid',
  agentId: 'agent-uuid',
  taskKey: 'task-key',
  provider: 'claude',
  sessionParams: { /* provider-specific params */ },
  sessionDisplayId: 'sess-abc-123',
  lastRunId: 'run-previous',
  lastError: null,
  runCount: 5,
  totalInputTokens: 25000,
  totalOutputTokens: 10000,
  totalCachedInputTokens: 5000,
  createdAt: '2024-01-15T09:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z'
}
```

### Setting Sessions

```javascript
// Update session after run
await sessionManager.setSession({
  agentId: 'agent-uuid',
  taskKey: 'task-key',
  provider: 'claude',
  sessionParams: { conversationId: 'conv-123' },
  sessionDisplayId: 'sess-abc-123',
  lastRunId: 'run-uuid',
  lastError: null,
  usage: {
    inputTokens: 2500,
    outputTokens: 1500,
    cachedInputTokens: 500
  }
});
```

### Session Rotation

Sessions are automatically rotated based on configured thresholds:

```javascript
// Evaluate if session should rotate
const decision = await sessionManager.evaluateCompaction(
  'agent-uuid',
  'task-key',
  'claude'
);

// Returns:
{
  rotate: true,
  reason: 'session raw input reached 102,450 tokens (threshold 100,000)',
  handoffMarkdown: 'Session handoff:\n- Previous session: sess-abc-123\n...',
  previousRunId: 'run-previous'
}

// Manual rotation
const rotation = await sessionManager.rotateSession(
  'agent-uuid',
  'task-key',
  'claude',
  { reason: 'Manual rotation' }
);

// Force fresh session
await sessionManager.forceFreshSession('agent-uuid', 'task-key', 'claude');
```

### Session Resolution for Runs

```javascript
// Resolve session before starting a run
const sessionState = await sessionManager.resolveSessionForRun({
  agentId: 'agent-uuid',
  taskKey: 'task-key',
  provider: 'claude',
  context: { wakeReason: 'issue_assigned' },
  forceFresh: false
});

// Returns fresh session:
{
  sessionParams: null,
  sessionDisplayId: null,
  fresh: true,
  resetReason: 'wake reason is issue_assigned'
}

// Or returns existing session:
{
  sessionParams: { conversationId: 'conv-123' },
  sessionDisplayId: 'sess-abc-123',
  sessionId: 'session-uuid',
  fresh: false
}
```

### Session Handoff

When a session rotates, a handoff markdown is generated:

```markdown
Session handoff:
- Previous session: sess-abc-123
- Task: refactor-login-flow
- Rotation reason: session raw input reached 102,450 tokens (threshold 100,000)
- Last error: null

Continue from the current task state. Rebuild only the minimum context you need.
```

## Cost Attribution

### Recording Costs

Costs are automatically recorded when runs complete:

```javascript
// In completeRun, costs are recorded to cost_ledger:
{
  run_id: 'run-uuid',
  agent_id: 'agent-uuid',
  provider: 'claude',
  biller: 'claude',
  billing_type: 'subscription',
  model: 'claude-3-opus-20240229',
  input_tokens: 2500,
  cached_input_tokens: 500,
  output_tokens: 1500,
  cost_cents: 15,  // $0.15
  occurred_at: '2024-01-15T10:30:00Z',
  metadata_json: '{"routingStrategy": "capability"}'
}
```

### Runtime State Tracking

Per-agent runtime statistics are maintained:

```javascript
// In agent_runtime_state table:
{
  agent_id: 'agent-uuid',
  provider: 'claude',
  last_run_id: 'run-uuid',
  last_run_status: 'succeeded',
  last_error: null,
  total_input_tokens: 50000,
  total_output_tokens: 20000,
  total_cached_input_tokens: 10000,
  total_cost_cents: 300,
  updated_at: '2024-01-15T10:30:00Z'
}
```

### Querying Costs

```javascript
// Get cost for a specific run
const cost = await heartbeat.getRunCost('run-uuid');

// Returns:
{
  runId: 'run-uuid',
  totalCostCents: 15,
  totalInputTokens: 2500,
  totalOutputTokens: 1500,
  entries: [
    { provider: 'claude', model: 'claude-3-opus', costCents: 15, ... }
  ]
}

// Get costs for an agent
const agentCosts = await heartbeat.getAgentCosts('agent-uuid', {
  since: new Date('2024-01-01'),
  until: new Date('2024-01-31')
});

// Returns:
{
  agentId: 'agent-uuid',
  totalCostCents: 500,
  totalInputTokens: 100000,
  totalOutputTokens: 50000,
  entryCount: 50
}
```

## Orphaned Run Recovery

### Automatic Reaping

The heartbeat service automatically detects and recovers orphaned runs:

```javascript
// Reaper runs every 30 seconds (configurable)
// Finds runs stuck in 'running' state but not tracked in activeRuns

// Orphaned runs are failed with retry:
await heartbeat.failRun(
  run.id,
  'Process lost - server may have restarted',
  ErrorCode.PROCESS_LOST,
  { shouldRetry: true }  // Queue automatic retry
);
```

### Retry Logic

```javascript
// Automatic retry creates new run:
await heartbeat.createRun({
  agentId: run.agent_id,
  invocationSource: InvocationSource.AUTOMATION,
  triggerDetail: TriggerDetail.SYSTEM,
  contextSnapshot: {
    ...run.context_snapshot,
    retryOfRunId: run.id,
    retryReason: 'process_lost'
  },
  retryOfRunId: run.id
});
```

## Configuration

### Service Options

```javascript
const heartbeat = new HeartbeatService({
  db: connectionPool,
  repository: customRepository,  // Optional
  config: {
    maxConcurrentRuns: 1,
    maxConcurrentRunsMax: 10,
    spawnTimeout: 30000,
    defaultTimeout: 60000,
    maxRetries: 3,
    retryWindow: 300000,
    logExcerptBytes: 8192,
    maxLiveLogChunkBytes: 8192
  },
  budgetService: budgetServiceInstance,  // Optional
  eventPublisher: webSocketPublisher,    // Optional
  logStorage: customLogStorage,          // Optional
  reaperIntervalMs: 30000
});
```

### Session Manager Options

```javascript
const sessionManager = new SessionManager({
  db: connectionPool,
  config: {
    compaction: {
      enabled: true,
      maxSessionRuns: 10,
      maxRawInputTokens: 100000,
      maxSessionAgeHours: 24
    }
  },
  cacheTtlMs: 60000
});
```

## Events

The heartbeat service emits events for external integration:

```javascript
heartbeat.on('initialized', () => {
  console.log('Heartbeat service ready');
});

heartbeat.on('run:created', ({ runId, agentId, status }) => {
  console.log(`Run ${runId} created for agent ${agentId}`);
});

heartbeat.on('run:started', ({ runId, agentId }) => {
  console.log(`Run ${runId} started`);
});

heartbeat.on('run:completed', ({ runId, agentId, status }) => {
  console.log(`Run ${runId} completed with status ${status}`);
});

heartbeat.on('run:failed', ({ runId, agentId, error, errorCode }) => {
  console.log(`Run ${runId} failed: ${error}`);
});

heartbeat.on('run:cancelled', ({ runId, agentId, reason }) => {
  console.log(`Run ${runId} cancelled: ${reason}`);
});

heartbeat.on('run:orphaned', ({ runId, agentId }) => {
  console.log(`Run ${runId} was orphaned, retry queued`);
});
```

## Best Practices

1. **Always complete or fail runs**: Don't leave runs in 'running' state
2. **Use session rotation**: Prevent context window overflow
3. **Record accurate usage**: Include all cost attribution data
4. **Handle budget checks**: Respect budget service responses
5. **Stream logs progressively**: Don't buffer all output
6. **Use appropriate timeouts**: Match timeout to expected duration
7. **Set reasonable retry limits**: Prevent infinite retry loops
