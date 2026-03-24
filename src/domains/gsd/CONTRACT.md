# GSD Domain Contract

## Overview

The GSD (Get Sh*t Done) Domain provides workflow creation, execution, and management for CogniMesh. It supports task orchestration with dependencies, retries, and progress tracking.

## Interface

### GSDDomain Class

```javascript
import { GSDDomain } from './domains/gsd/index.js';

const gsd = new GSDDomain({
  defaultTimeout: 300000,
  maxConcurrent: 3
});
```

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tools` | GSDTools | `new GSDTools()` | Custom tools instance |
| `validator` | WorkflowValidator | `new WorkflowValidator()` | Custom validator |
| `defaultTimeout` | number | `300000` | Default timeout in ms (5 min) |
| `maxConcurrent` | number | `3` | Max concurrent workflows |

#### Methods

##### createWorkflow(type, tasks, options)
Creates a new workflow with the specified tasks.

- **Parameters:**
  - `type` (string): Workflow type (e.g., 'code-generation', 'refactoring')
  - `tasks` (Array<Object>): Task definitions
    - `id` (string, optional): Task identifier
    - `type` (string): Task type
    - `params` (Object): Task parameters
    - `dependsOn` (string, optional): ID of dependency task
    - `maxRetries` (number, optional): Max retry attempts
  - `options` (Object, optional):
    - `id` (string): Custom workflow ID
    - `metadata` (Object): Workflow metadata
- **Returns:** `Workflow`
- **Throws:** `ValidationError` if workflow definition is invalid
- **Events:**
  - `workflowCreated` - Workflow created successfully

##### executeWorkflow(id, options)
Executes a workflow by ID.

- **Parameters:**
  - `id` (string): Workflow identifier
  - `options` (WorkflowExecutionOptions, optional):
    - `continueOnError` (boolean): Continue on task failure
    - `timeout` (number): Execution timeout in ms
    - `context` (Object): Initial context data
    - `onProgress` (Function): Progress callback
    - `onTaskStart` (Function): Task start callback
    - `onTaskComplete` (Function): Task completion callback
- **Returns:** `Promise<Workflow>`
- **Events:**
  - `workflowStarted` - Execution started
  - `taskStarted` - Individual task started
  - `workflowProgress` - Progress update
  - `taskComplete` - Individual task complete
  - `workflowComplete` - All tasks completed
  - `workflowError` - Execution failed

##### getStatus(id)
Gets current workflow status.

- **Parameters:**
  - `id` (string): Workflow identifier
- **Returns:** `WorkflowStatus`

##### cancelWorkflow(id, reason)
Cancels a running workflow.

- **Parameters:**
  - `id` (string): Workflow to cancel
  - `reason` (string, optional): Cancellation reason
- **Returns:** `boolean` - True if cancelled successfully
- **Events:**
  - `workflowCancelled` - Workflow was cancelled

##### listWorkflows(filters)
Lists workflows with optional filtering.

- **Parameters:**
  - `filters` (Object, optional):
    - `status` (string): Filter by status
    - `type` (string): Filter by type
- **Returns:** `WorkflowStatus[]`

##### deleteWorkflow(id)
Deletes a workflow.

- **Parameters:**
  - `id` (string): Workflow to delete
- **Returns:** `boolean` - True if deleted

##### clearCompleted(options)
Clears completed workflows.

- **Parameters:**
  - `options` (Object, optional):
    - `excludeStatuses` (string[]): Statuses to preserve
- **Returns:** `number` - Number of workflows cleared

## Types

### Workflow
```typescript
interface Workflow {
  id: string;
  type: string;
  tasks: WorkflowTask[];
  state: WorkflowState;
  status: 'created' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata: object;
  error?: Error;
}
```

### WorkflowTask
```typescript
interface WorkflowTask {
  id: string;
  type: string;
  params: object;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  dependsOn?: string;
  retryCount: number;
  maxRetries: number;
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: Error;
}
```

### WorkflowState
```typescript
interface WorkflowState {
  currentStep: number;
  context: object;
  results: { [taskId: string]: any };
}
```

### WorkflowStatus
```typescript
interface WorkflowStatus {
  id: string;
  type: string;
  status: string;
  progress: number;      // 0-100
  completedTasks: number;
  totalTasks: number;
  currentTask?: string;
  startedAt?: string;
  completedAt?: string;
  error?: {
    message: string;
    name: string;
  };
}
```

### WorkflowExecutionOptions
```typescript
interface WorkflowExecutionOptions {
  continueOnError?: boolean;
  timeout?: number;
  context?: object;
  onProgress?: (progress: number) => void;
  onTaskStart?: (task: WorkflowTask) => void;
  onTaskComplete?: (task: WorkflowTask, result: TaskResult) => void;
}
```

### TaskResult
```typescript
interface TaskResult {
  taskId: string;
  success: boolean;
  result: any;
  error?: Error;
  duration: number;  // milliseconds
}
```

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `workflowCreated` | `{ workflowId, type, taskCount }` | Workflow created |
| `workflowStarted` | `{ workflowId, taskCount }` | Execution started |
| `taskStarted` | `{ workflowId, taskId, type }` | Task started |
| `workflowProgress` | `{ workflowId, progress, currentTask, completedTasks, totalTasks }` | Progress update |
| `taskComplete` | `{ workflowId, taskId, result }` | Task completed |
| `workflowComplete` | `{ workflowId, duration }` | Workflow completed |
| `workflowError` | `{ workflowId, error }` | Workflow failed |
| `workflowCancelled` | `{ workflowId, reason }` | Workflow cancelled |

## Usage Examples

### Basic Workflow
```javascript
const gsd = new GSDDomain();

const workflow = gsd.createWorkflow('code-generation', [
  { type: 'analyze', params: { target: 'src/' } },
  { type: 'generate', params: { template: 'component' }, dependsOn: 'task-0' },
  { type: 'format', params: { prettier: true }, dependsOn: 'task-1' }
]);

const result = await gsd.executeWorkflow(workflow.id);
console.log('Workflow completed:', result.status);
```

### With Progress Tracking
```javascript
gsd.on('workflowProgress', ({ workflowId, progress, currentTask }) => {
  console.log(`[${workflowId}] ${progress}% - ${currentTask}`);
});

gsd.on('taskComplete', ({ taskId, result }) => {
  console.log(`Task ${taskId} completed:`, result);
});

await gsd.executeWorkflow(workflow.id);
```

### Error Handling with Continue on Error
```javascript
try {
  await gsd.executeWorkflow(workflow.id, {
    continueOnError: true,
    onTaskComplete: (task, result) => {
      if (!result.success) {
        console.warn(`Task ${task.id} failed:`, result.error);
      }
    }
  });
} catch (error) {
  console.error('Workflow failed:', error);
}
```

### Check Status
```javascript
const status = gsd.getStatus(workflow.id);
console.log(`Progress: ${status.progress}%`);
console.log(`Completed: ${status.completedTasks}/${status.totalTasks}`);

if (status.status === 'running') {
  console.log(`Current task: ${status.currentTask}`);
}
```

### Cancel Workflow
```javascript
// Start workflow
const execution = gsd.executeWorkflow(workflow.id);

// Cancel after 30 seconds
setTimeout(() => {
  gsd.cancelWorkflow(workflow.id, 'Timeout');
}, 30000);

try {
  await execution;
} catch (error) {
  if (error.message.includes('cancelled')) {
    console.log('Workflow was cancelled');
  }
}
```

### List and Manage Workflows
```javascript
// List all running workflows
const running = gsd.listWorkflows({ status: 'running' });
console.log(`${running.length} workflows running`);

// Clear old completed workflows
const cleared = gsd.clearCompleted({ excludeStatuses: ['running', 'failed'] });
console.log(`Cleared ${cleared} workflows`);
```

## Dependencies

- Node.js `events` module
- Node.js `crypto` module
- `./domain/tools.js` - GSDTools class
- `./domain/validation.js` - WorkflowValidator class

## Error Handling

Common errors:
- `ValidationError`: Invalid workflow definition
- `Error`: Workflow not found
- `Error`: Workflow already running
- `Error`: Max concurrent workflows reached

All async methods may throw errors. Always wrap `executeWorkflow` calls in try-catch blocks.

## Task Types

Available task types are defined in `GSDTools`. Common types include:

| Type | Description |
|------|-------------|
| `analyze` | Analyze code or project |
| `generate` | Generate code or files |
| `format` | Format code |
| `lint` | Run linting |
| `test` | Run tests |
| `build` | Build project |
| `deploy` | Deploy application |
| `notify` | Send notification |
| `custom` | Custom task (requires handler) |

See `./domain/tools.js` for complete list and registration.
