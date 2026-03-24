# Controllers Module Contract

## Overview

The Controllers Module provides unified and autonomous controllers for CogniMesh v5.0. It handles HTTP request processing, tool execution, workflow management, and autonomous agent operations with comprehensive error handling and validation.

## Public Interfaces

### UnifiedController

Main unified controller for tool execution and request handling.

```javascript
import { UnifiedController } from './controllers/index.js';

const controller = new UnifiedController({
  repositories: repoFactory,
  tools: toolRegistry,
  config: appConfig
});
```

**Methods:**

- `constructor(options)` - Creates unified controller
  - `options.repositories` - Repository factory
  - `options.tools` - Tool registry
  - `options.config` - Application configuration

- `initialize()` - Initializes controller
  - Returns: Promise<void>

- `executeTool(toolName, params, context)` - Executes a tool
  - `toolName` (string) - Tool identifier
  - `params` (Object) - Tool parameters
  - `context` (Object) - Execution context
  - Returns: Promise<ToolResult>

- `validateRequest(schema, data)` - Validates request data
  - Returns: ValidationResult

- `handleError(error, req, res)` - Handles errors uniformly
  - Returns: ErrorResponse

### AutonomousController

Controller for autonomous agent operations.

- `constructor(options)` - Creates autonomous controller
  - `options.intentParser` - Intent parser instance
  - `options.persistence` - State persistence

- `execute(intent, context)` - Executes autonomous intent
  - `intent` (string) - Natural language intent
  - `context` (Object) - Execution context
  - Returns: Promise<ExecutionResult>

- `parseIntent(text)` - Parses intent from text
  - Returns: Promise<IntentResult>

- `getExecutionState(id)` - Gets execution state
  - Returns: Promise<ExecutionState>

- `resumeExecution(id)` - Resumes paused execution
  - Returns: Promise<ExecutionResult>

### TaskController

Controller for task management.

- `createTask(data)` - Creates new task
  - Returns: Promise<Task>

- `getTask(id)` - Gets task by ID
  - Returns: Promise<Task>

- `updateTask(id, updates)` - Updates task
  - Returns: Promise<Task>

- `deleteTask(id)` - Deletes task
  - Returns: Promise<boolean>

- `listTasks(filters)` - Lists tasks with filtering
  - Returns: Promise<Task[]>

- `setTaskPriority(id, priority)` - Sets task priority
  - Returns: Promise<Task>

- `setTaskQuadrant(id, quadrant)` - Sets Eisenhower quadrant
  - Returns: Promise<Task>

### RoadmapController

Controller for roadmap management.

- `createRoadmap(data)` - Creates roadmap
  - Returns: Promise<Roadmap>

- `getRoadmap(id)` - Gets roadmap
  - Returns: Promise<Roadmap>

- `updateRoadmap(id, updates)` - Updates roadmap
  - Returns: Promise<Roadmap>

- `deleteRoadmap(id)` - Deletes roadmap
  - Returns: Promise<boolean>

- `updateProgress(id, progress)` - Updates progress
  - Returns: Promise<Progress>

- `getNodeStatus(roadmapId, nodeId)` - Gets node status
  - Returns: Promise<NodeStatus>

### Claude Controllers

#### ClaudeCoreController

- `sendMessage(messages, options)` - Sends message to Claude
  - Returns: Promise<MessageResponse>

- `streamMessage(messages, options)` - Streams message
  - Returns: AsyncIterable<StreamChunk>

- `createConversation()` - Creates conversation
  - Returns: Promise<Conversation>

#### ClaudeVisionController

- `analyzeImage(image, prompt)` - Analyzes image
  - Returns: Promise<ImageAnalysis>

- `extractText(image)` - Extracts text from image
  - Returns: Promise<string>

- `compareImages(image1, image2)` - Compares images
  - Returns: Promise<ImageComparison>

#### ClaudeContextController

- `compressContext(messages)` - Compresses context
  - Returns: Promise<Message[]>

- `estimateTokens(messages)` - Estimates tokens
  - Returns: number

- `optimizeWindow(messages, maxTokens)` - Optimizes window
  - Returns: Message[]

### Helper Functions

**Validation & Formatting**
- `validateRequest(data, schema)` - Validates request
- `validateInput(input, rules)` - Validates input
- `formatResponse(data, meta)` - Formats response
- `formatListResponse(items, pagination)` - Formats list
- `formatError(error)` - Formats error

**Error Handling**
- `handleError(error)` - Handles error
- `withErrorHandling(fn)` - Wraps with error handling
- `handleAsync(fn)` - Handles async errors
- `createControllerMethod(fn)` - Creates controller method

**Utilities**
- `generateId(prefix)` - Generates ID
- `pick(obj, keys)` - Picks object keys
- `omit(obj, keys)` - Omits object keys
- `deepMerge(target, source)` - Deep merges objects
- `parseFilters(query)` - Parses filter query
- `parsePagination(query)` - Parses pagination
- `sortBy(array, key)` - Sorts array
- `paginateResults(items, page, limit)` - Paginates results

## Data Structures

### ToolResult

```typescript
interface ToolResult {
  success: boolean;
  data: any;
  errors?: string[];
  executionTime: number;
}
```

### ExecutionResult

```typescript
interface ExecutionResult {
  id: string;
  status: ExecutionStatus;
  intent: IntentResult;
  actions: Action[];
  result: any;
  startedAt: string;
  completedAt?: string;
}
```

### IntentResult

```typescript
interface IntentResult {
  type: string;
  confidence: number;
  entities: Entity[];
  original: string;
}
```

### Entity

```typescript
interface Entity {
  type: string;
  value: string;
  start: number;
  end: number;
  confidence: number;
}
```

### Task

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  quadrant?: EisenhowerQuadrant;
  dueDate?: string;
  assignee?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

### ErrorResponse

```typescript
interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: any;
  stack?: string;
}
```

## Enums

### TaskStatus

```typescript
enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}
```

### TaskPriority

```typescript
enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}
```

### ExecutionStatus

```typescript
enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
```

### NodeStatus

```typescript
enum NodeStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  BLOCKED = 'blocked',
  SKIPPED = 'skipped'
}
```

## Events

The Controllers module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `tool:executed` | `{ tool, result }` | Tool execution complete |
| `intent:parsed` | `{ intent, result }` | Intent parsed |
| `execution:started` | `{ id, intent }` | Autonomous execution started |
| `execution:completed` | `{ id, result }` | Execution completed |
| `task:created` | `{ task }` | Task created |
| `task:updated` | `{ task }` | Task updated |
| `roadmap:updated` | `{ roadmap }` | Roadmap updated |
| `error` | `{ error, context }` | Error occurred |

## Error Handling

### ToolExecutionError

Thrown when tool execution fails.

### ValidationError

Thrown when validation fails.

### ExecutionError

Thrown when autonomous execution fails.

### ControllerError

Base controller error.

## Usage Example

```javascript
import { 
  UnifiedController,
  TaskController,
  createTaskController 
} from './controllers/index.js';

// Initialize unified controller
const controller = new UnifiedController({
  repositories: repoFactory,
  tools: toolRegistry,
  config: appConfig
});

await controller.initialize();

// Execute tool
const result = await controller.executeTool(
  'create_task',
  { title: 'New Task', priority: 'high' },
  { userId: 'user-123' }
);

// Task controller
const tasks = createTaskController(controller);
const task = await tasks.createTask({
  title: 'Implement feature',
  priority: TaskPriority.HIGH,
  quadrant: 'do_first'
});

// Validate request
const validation = controller.validateRequest(
  taskCreateSchema,
  requestBody
);

if (!validation.valid) {
  return formatError(validation.errors);
}
```
