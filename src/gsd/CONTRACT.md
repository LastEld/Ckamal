# GSD (Get Stuff Done) Module Contract

## Overview

The GSD Module provides task execution and agent management for CogniMesh v5.0. It includes agent pooling, task queuing, load balancing, parallel execution, auto-scaling, and checkpointing for reliable task processing.

## Public Interfaces

### GSDEngine

Main engine for task execution.

```javascript
import { GSDEngine } from './gsd/index.js';

const engine = new GSDEngine({
  maxConcurrency: 10,
  enableAutoScale: true
});
```

**Methods:**

- `constructor(options)` - Creates GSD engine
  - `options.maxConcurrency` - Maximum concurrent tasks
  - `options.enableAutoScale` - Enable auto-scaling
  - `options.checkpointInterval` - Checkpoint interval

- `initialize()` - Initializes engine
  - Returns: Promise<void>

- `submit(task)` - Submits task for execution
  - `task` (TaskDefinition) - Task to execute
  - Returns: Promise<TaskResult>

- `submitBatch(tasks)` - Submits batch of tasks
  - Returns: Promise<TaskResult[]>

- `cancel(taskId)` - Cancels pending task
  - Returns: Promise<boolean>

- `getStatus(taskId)` - Gets task status
  - Returns: TaskStatus

- `getStats()` - Returns engine statistics
  - Returns: EngineStats

- `shutdown()` - Shuts down engine
  - Returns: Promise<void>

### AgentPool

Pool of worker agents.

- `constructor(options)` - Creates agent pool
  - `options.minAgents` - Minimum agents
  - `options.maxAgents` - Maximum agents

- `acquire()` - Acquires agent from pool
  - Returns: Promise<Agent>

- `release(agent)` - Returns agent to pool
  - Returns: void

- `scaleUp(count)` - Scales up agent count
  - Returns: Promise<void>

- `scaleDown(count)` - Scales down agent count
  - Returns: Promise<void>

- `getStats()` - Returns pool statistics
  - Returns: PoolStats

### Agent

Individual task execution agent.

- `constructor(type, options)` - Creates agent
  - `type` (AgentType) - Agent type
  - `options` - Agent options

- `execute(task)` - Executes task
  - Returns: Promise<TaskResult>

- `getStatus()` - Returns agent status
  - Returns: AgentStatus

- `terminate()` - Terminates agent
  - Returns: Promise<void>

### TaskQueue

Priority task queue.

- `enqueue(task, priority)` - Adds task to queue
  - Returns: string - Task ID

- `dequeue()` - Removes and returns highest priority task
  - Returns: TaskDefinition | undefined

- `peek()` - Views highest priority task
  - Returns: TaskDefinition | undefined

- `remove(taskId)` - Removes task by ID
  - Returns: boolean

- `getSize()` - Returns queue size
  - Returns: number

- `clear()` - Clears all tasks
  - Returns: void

### LoadBalancer

Distributes tasks across agents.

- `constructor(strategy)` - Creates load balancer
  - `strategy` - Balancing strategy

- `assign(task, agents)` - Assigns task to agent
  - Returns: Agent

- `setStrategy(strategy)` - Changes strategy
  - Returns: void

### ParallelExecutor

Executes tasks in parallel.

- `execute(tasks, options)` - Executes tasks in parallel
  - `options.concurrency` - Max concurrent
  - `options.stopOnError` - Stop on first error
  - Returns: Promise<ParallelResult>

### AutoScaler

Automatically scales agent pool.

- `constructor(pool, options)` - Creates auto-scaler
  - `options.scaleUpThreshold` - Queue threshold for scaling up
  - `options.scaleDownThreshold` - Idle threshold for scaling down
  - `options.checkInterval` - Check interval

- `start()` - Starts auto-scaling
  - Returns: void

- `stop()` - Stops auto-scaling
  - Returns: void

### Checkpoint

Task execution checkpointing.

- `create(state)` - Creates checkpoint
  - Returns: Checkpoint

- `restore(checkpointId)` - Restores from checkpoint
  - Returns: Promise<State>

- `delete(checkpointId)` - Deletes checkpoint
  - Returns: Promise<boolean>

## Data Structures

### TaskDefinition

```typescript
interface TaskDefinition {
  id: string;
  type: string;
  payload: any;
  priority: number;  // 0-100
  timeout?: number;
  retries?: number;
  dependencies?: string[];
  metadata?: Record<string, any>;
}
```

### TaskResult

```typescript
interface TaskResult {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  output?: any;
  error?: Error;
  duration: number;
  startedAt: string;
  completedAt: string;
}
```

### AgentType

```typescript
enum AgentType {
  WORKER = 'worker',
  COORDINATOR = 'coordinator',
  SPECIALIST = 'specialist'
}
```

### AgentStatus

```typescript
interface AgentStatus {
  id: string;
  type: AgentType;
  state: 'idle' | 'busy' | 'terminated';
  currentTask?: string;
  tasksCompleted: number;
  avgExecutionTime: number;
}
```

### EngineStats

```typescript
interface EngineStats {
  tasksSubmitted: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksCancelled: number;
  averageExecutionTime: number;
  queueSize: number;
  activeAgents: number;
}
```

### PoolStats

```typescript
interface PoolStats {
  total: number;
  available: number;
  busy: number;
  queueSize: number;
  avgWaitTime: number;
}
```

## Events

The GSD module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `task:submitted` | `{ task }` | Task submitted |
| `task:started` | `{ task, agent }` | Task started |
| `task:completed` | `{ task, result }` | Task completed |
| `task:failed` | `{ task, error }` | Task failed |
| `task:cancelled` | `{ task }` | Task cancelled |
| `agent:created` | `{ agent }` | Agent created |
| `agent:busy` | `{ agent, task }` | Agent started task |
| `agent:idle` | `{ agent }` | Agent became idle |
| `agent:terminated` | `{ agent }` | Agent terminated |
| `pool:scaled` | `{ oldSize, newSize }` | Pool scaled |
| `checkpoint:created` | `{ checkpoint }` | Checkpoint created |
| `checkpoint:restored` | `{ checkpoint }` | Checkpoint restored |

## Error Handling

### GSDError

Base error for GSD operations.

### TaskError

Thrown when task execution fails.

### AgentError

Thrown when agent operations fail.

### QueueError

Thrown when queue operations fail.

### CheckpointError

Thrown when checkpoint operations fail.

## Usage Example

```javascript
import { GSDEngine, AgentPool, TaskQueue } from './gsd/index.js';

// Initialize engine
const engine = new GSDEngine({
  maxConcurrency: 10,
  enableAutoScale: true
});

await engine.initialize();

// Submit task
const result = await engine.submit({
  type: 'analyze_code',
  payload: { code: sourceCode },
  priority: 80,
  timeout: 30000
});

// Submit batch
const results = await engine.submitBatch([
  { type: 'task1', payload: {}, priority: 50 },
  { type: 'task2', payload: {}, priority: 60 },
  { type: 'task3', payload: {}, priority: 70 }
]);

// Cleanup
await engine.shutdown();
```
