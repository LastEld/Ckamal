# GSD (Get Stuff Done) Module

## Overview

The GSD Module provides a robust task execution engine for CogniMesh v5.0. It manages task queuing, agent pools, load balancing, parallel execution, auto-scaling, and checkpointing to ensure reliable and efficient task processing at scale.

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                      GSD Engine                          │
├──────────────┬──────────────┬──────────────┬────────────┤
│  TaskQueue   │  AgentPool   │ LoadBalancer │ Checkpoint │
├──────────────┼──────────────┼──────────────┼────────────┤
│ Priority     │ Agent        │ Round-robin  │ State      │
│ Queue        │ Lifecycle    │ Least-busy   │ Capture    │
│ Scheduling   │ Scaling      │ Weighted     │ Recovery   │
└──────────────┴──────────────┴──────────────┴────────────┘
```

### Execution Flow

```
Task Submission → TaskQueue → LoadBalancer → AgentPool → Agent Execution
                                           ↓
                                      Checkpoint (optional)
                                           ↓
                                      Task Result
```

## Components

### GSDEngine

Central orchestration component:

- **Task Submission**: Accepts and queues tasks
- **Execution Management**: Coordinates task execution
- **Monitoring**: Tracks execution metrics
- **Lifecycle Management**: Handles engine startup/shutdown

### AgentPool

Manages worker agent lifecycle:

- **Agent Creation**: Spawns new agents
- **Agent Lifecycle**: Manages agent states
- **Dynamic Scaling**: Adjusts pool size
- **Health Monitoring**: Monitors agent health

### Agent

Task execution worker:

- **Task Execution**: Runs assigned tasks
- **State Management**: Tracks agent state
- **Error Handling**: Handles execution errors
- **Reporting**: Reports execution results

### TaskQueue

Priority-based task queue:

- **Priority Scheduling**: Higher priority first
- **FIFO within Priority**: Fair ordering
- **Dependency Tracking**: Handles task dependencies
- **Queue Management**: Size limits, cleanup

### LoadBalancer

Distributes tasks across agents:

- **Round Robin**: Sequential distribution
- **Least Busy**: To least loaded agent
- **Weighted**: Based on agent capacity
- **Custom**: User-defined strategies

### ParallelExecutor

Batch task execution:

- **Concurrent Execution**: Parallel processing
- **Result Aggregation**: Collects results
- **Error Handling**: Configurable error behavior
- **Progress Tracking**: Execution progress

### AutoScaler

Automatic pool scaling:

- **Scale Up**: When queue grows
- **Scale Down**: When idle
- **Metrics-based**: Uses performance metrics
- **Configurable Thresholds**: Custom triggers

### Checkpoint

Execution state persistence:

- **State Capture**: Saves execution state
- **Recovery**: Restores from checkpoint
- **Incremental**: Efficient storage
- **Cleanup**: Removes old checkpoints

## Usage

### Engine Setup

```javascript
import { GSDEngine } from './gsd/index.js';

const engine = new GSDEngine({
  maxConcurrency: 20,
  enableAutoScale: true,
  checkpointInterval: 60000
});

await engine.initialize();

// Event handling
engine.on('task:completed', ({ task, result }) => {
  console.log(`Task ${task.id} completed in ${result.duration}ms`);
});

engine.on('task:failed', ({ task, error }) => {
  console.error(`Task ${task.id} failed:`, error);
});
```

### Task Submission

```javascript
// Simple task
const result = await engine.submit({
  type: 'process_data',
  payload: { data: rawData },
  priority: 50,
  timeout: 60000,
  retries: 3
});

// High priority task
const urgentResult = await engine.submit({
  type: 'alert_processing',
  payload: { alert: criticalAlert },
  priority: 95,  // High priority
  timeout: 10000
});

// With dependencies
const taskC = await engine.submit({
  type: 'aggregate_results',
  payload: {},
  dependencies: ['task-a-id', 'task-b-id']
});
```

### Batch Processing

```javascript
// Submit multiple tasks
const tasks = dataItems.map((item, index) => ({
  type: 'process_item',
  payload: { item },
  priority: index < 10 ? 80 : 50  // First 10 are high priority
}));

const results = await engine.submitBatch(tasks, {
  concurrency: 5,      // Max 5 concurrent
  stopOnError: false   // Continue on individual failures
});

// Check results
results.forEach((result, i) => {
  if (result.status === 'completed') {
    console.log(`Item ${i} processed successfully`);
  } else {
    console.error(`Item ${i} failed:`, result.error);
  }
});
```

### Agent Management

```javascript
import { AgentPool, AgentType } from './gsd/index.js';

const pool = new AgentPool({
  minAgents: 2,
  maxAgents: 20
});

// Create specialized agent
const specialist = pool.createAgent(AgentType.SPECIALIST, {
  capabilities: ['ml_training', 'data_analysis']
});

// Manual scaling
await pool.scaleUp(5);   // Add 5 agents
await pool.scaleDown(3); // Remove 3 agents

// Pool statistics
const stats = pool.getStats();
console.log(`Available: ${stats.available}, Busy: ${stats.busy}`);
```

### Load Balancing

```javascript
import { LoadBalancer } from './gsd/index.js';

// Create with strategy
const balancer = new LoadBalancer('least-busy');

// Change strategy dynamically
balancer.setStrategy('round-robin');

// Available strategies:
// - 'round-robin': Sequential assignment
// - 'least-busy': To agent with least load
// - 'weighted': Based on agent weights
// - 'random': Random assignment
```

### Auto-Scaling

```javascript
import { AutoScaler } from './gsd/index.js';

const scaler = new AutoScaler(pool, {
  scaleUpThreshold: 10,      // Scale up when queue > 10
  scaleDownThreshold: 0.3,   // Scale down when < 30% busy
  checkInterval: 30000,      // Check every 30 seconds
  maxScaleUp: 5,             // Max 5 new agents per scale
  minAgents: 2               // Never go below 2 agents
});

scaler.start();

// Later...
scaler.stop();
```

### Checkpointing

```javascript
import { Checkpoint } from './gsd/index.js';

const checkpoint = new Checkpoint();

// Create checkpoint during long task
async function longRunningTask(data) {
  const state = { processed: 0, results: [] };
  
  for (const item of data) {
    // Process item
    state.results.push(await process(item));
    state.processed++;
    
    // Checkpoint every 100 items
    if (state.processed % 100 === 0) {
      await checkpoint.create({
        taskId: this.taskId,
        state,
        timestamp: Date.now()
      });
    }
  }
  
  return state.results;
}

// Restore from checkpoint
async function resumeTask(checkpointId) {
  const saved = await checkpoint.restore(checkpointId);
  return longRunningTask(remainingData, saved.state);
}
```

### Task Queue Management

```javascript
import { TaskQueue } from './gsd/index.js';

const queue = new TaskQueue();

// Enqueue with priority
const taskId = queue.enqueue(task, 75);

// Peek at next task
const next = queue.peek();

// Check queue size
console.log(`Queue size: ${queue.getSize()}`);

// Remove specific task
queue.remove(taskId);

// Clear queue
queue.clear();
```

## Configuration

### Engine Configuration

```javascript
{
  // Concurrency
  maxConcurrency: 20,
  
  // Auto-scaling
  enableAutoScale: true,
  autoScaleConfig: {
    scaleUpThreshold: 10,
    scaleDownThreshold: 0.3,
    checkInterval: 30000,
    maxScaleUp: 5,
    minAgents: 2,
    maxAgents: 50
  },
  
  // Checkpointing
  enableCheckpoints: true,
  checkpointInterval: 60000,
  checkpointRetention: 86400000,  // 24 hours
  
  // Queue
  maxQueueSize: 10000,
  defaultTimeout: 300000,  // 5 minutes
  defaultRetries: 3,
  
  // Monitoring
  enableMetrics: true,
  metricsInterval: 60000
}
```

### Agent Configuration

```javascript
{
  // Lifecycle
  idleTimeout: 300000,  // 5 minutes
  maxTasksPerAgent: 100,
  
  // Resources
  memoryLimit: '512MB',
  cpuLimit: '50%',
  
  // Health
  healthCheckInterval: 30000,
  maxHealthFailures: 3
}
```

### Agent Types

```javascript
{
  WORKER: {
    capabilities: ['general'],
    concurrentTasks: 1
  },
  COORDINATOR: {
    capabilities: ['coordination', 'scheduling'],
    concurrentTasks: 5
  },
  SPECIALIST: {
    capabilities: ['ml', 'data_processing'],
    concurrentTasks: 1
  }
}
```

## Best Practices

1. **Set Appropriate Timeouts**: Prevent runaway tasks
2. **Use Priorities**: Ensure critical tasks execute first
3. **Handle Dependencies**: Specify task dependencies correctly
4. **Monitor Metrics**: Track queue size and execution times
5. **Configure Auto-scaling**: Set appropriate thresholds
6. **Use Checkpoints**: For long-running tasks
7. **Handle Failures**: Implement retry logic
8. **Resource Limits**: Set memory/CPU limits for agents
