# Controllers Module

## Overview

The Controllers Module provides the HTTP request handling and business logic layer for CogniMesh v5.0. It includes unified tool execution, autonomous agent control, task management, roadmap management, and specialized Claude AI controllers for various operations.

## Architecture

### Controller Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                 UnifiedController                        │
├──────────────┬──────────────────────────────────────────┤
│  Autonomous  │              Domain Controllers           │
├──────────────┼──────────────┬─────────────┬─────────────┤
│ IntentParser │ TaskController│ RoadmapCtrl │ Claude Cont │
│ Persistence  │ - CRUD        │ - CRUD      │ - Core      │
│ Execution    │ - Quadrants   │ - Progress  │ - Vision    │
│              │ - Priorities  │ - Nodes     │ - Context   │
└──────────────┴──────────────┴─────────────┴─────────────┘
```

### Request Flow

```
HTTP Request → Route Handler → Controller → Repository/Tool
                                    ↓
                              Validation
                                    ↓
                              Response Formatting
```

## Components

### UnifiedController

Central controller coordinating all operations:

- **Tool Execution**: Executes registered tools with validation
- **Request Validation**: Schema-based request validation
- **Error Handling**: Unified error handling and formatting
- **Context Management**: Request context propagation
- **Response Formatting**: Consistent response structure

### AutonomousController

Autonomous agent operation controller:

- **Intent Parsing**: Natural language to structured intent
- **Entity Extraction**: Named entity recognition
- **Action Planning**: Plan generation from intent
- **State Persistence**: Execution state management
- **Error Recovery**: Automatic retry and recovery

### TaskController

Task management controller:

- **CRUD Operations**: Create, read, update, delete tasks
- **Eisenhower Matrix**: Quadrant-based organization
- **Priority Management**: Task prioritization
- **Status Tracking**: Task status lifecycle
- **Filtering & Search**: Advanced task queries

### RoadmapController

Roadmap management controller:

- **Roadmap CRUD**: Roadmap lifecycle management
- **Progress Tracking**: Real-time progress updates
- **Node Management**: Phase and milestone control
- **Dependency Handling**: Task dependency tracking
- **Visualization**: Data for roadmap visualization

### Claude Controllers

**ClaudeCoreController**
- Message sending and streaming
- Conversation management
- Model selection
- Parameter tuning

**ClaudeVisionController**
- Image analysis
- OCR and text extraction
- Visual question answering
- Image comparison

**ClaudeContextController**
- Context compression
- Token estimation
- Window optimization
- History management

**ClaudeConversationController**
- Conversation state
- Message threading
- Forking and branching
- Export/import

**ClaudeTokensController**
- Token budgeting
- Usage tracking
- Cost estimation
- Alert management

**ClaudeStreamingController**
- Stream management
- Chunk processing
- Connection handling
- Error recovery

**ClaudeBatchController**
- Batch job management
- Parallel execution
- Result aggregation
- Progress tracking

**ClaudeExtendedThinkingController**
- Extended thinking budgets
- Budget allocation
- Usage monitoring
- Adaptive control

## Usage

### Unified Controller

```javascript
import { UnifiedController } from './controllers/index.js';

const controller = new UnifiedController({
  repositories: repoFactory,
  tools: toolRegistry,
  config: {
    maxExecutionTime: 30000,
    enableMetrics: true
  }
});

await controller.initialize();

// Execute tool
const result = await controller.executeTool(
  'analyze_code',
  { code: sourceCode, language: 'javascript' },
  { 
    userId: 'user-123',
    requestId: 'req-456'
  }
);

// Handle with validation
const validation = controller.validateRequest(
  schemas.toolRequest,
  requestBody
);

if (!validation.valid) {
  return controller.formatError({
    message: 'Validation failed',
    details: validation.errors
  });
}
```

### Autonomous Controller

```javascript
import { AutonomousController } from './controllers/index.js';

const autonomous = new AutonomousController({
  intentParser: new IntentParser(),
  persistence: new StatePersistence()
});

// Execute natural language command
const result = await autonomous.execute(
  'Create a high priority task to review the pull request',
  { userId: 'user-123' }
);

console.log('Actions:', result.actions);

// Get execution state
const state = await autonomous.getExecutionState(result.id);

// Resume if paused
if (state.status === 'paused') {
  const resumed = await autonomous.resumeExecution(result.id);
}
```

### Task Controller

```javascript
import { createTaskController } from './controllers/index.js';

const tasks = createTaskController(unifiedController);

// Create task with Eisenhower quadrant
const task = await tasks.createTask({
  title: 'Review security audit',
  description: 'Go through the security audit report',
  priority: TaskPriority.HIGH,
  quadrant: 'do_first',  // Urgent & Important
  dueDate: '2024-01-15',
  tags: ['security', 'audit']
});

// Update status
await tasks.updateTask(task.id, { status: TaskStatus.IN_PROGRESS });

// List with filtering
const pending = await tasks.listTasks({
  status: TaskStatus.PENDING,
  quadrant: 'do_first',
  priority: TaskPriority.HIGH
});

// Set priority
await tasks.setTaskPriority(task.id, TaskPriority.CRITICAL);
```

### Roadmap Controller

```javascript
import { createRoadmapController } from './controllers/index.js';

const roadmaps = createRoadmapController(unifiedController);

// Create roadmap
const roadmap = await roadmaps.createRoadmap({
  title: 'Q1 2024 Product Roadmap',
  description: 'First quarter development goals',
  phases: [
    {
      name: 'Planning Phase',
      milestones: [
        { name: 'Requirements Finalized', completed: true },
        { name: 'Design Approved', completed: false }
      ]
    }
  ]
});

// Update progress
await roadmaps.updateProgress(roadmap.id, {
  phaseId: roadmap.phases[0].id,
  milestoneIndex: 1,
  completed: true
});

// Get node status
const status = await roadmaps.getNodeStatus(
  roadmap.id,
  roadmap.phases[0].milestones[0].id
);
```

### Claude Controllers

```javascript
import { 
  createClaudeCoreController,
  createClaudeVisionController 
} from './controllers/index.js';

// Core controller
const claude = createClaudeCoreController(unifiedController);

const response = await claude.sendMessage([
  { role: 'user', content: 'Explain async/await' }
], {
  model: 'claude-3-sonnet-20240229',
  maxTokens: 1024
});

// Vision controller
const vision = createClaudeVisionController(unifiedController);

const analysis = await vision.analyzeImage(
  imageBuffer,
  'What errors do you see in this code?'
);
```

## Configuration

### Unified Controller

```javascript
{
  repositories: RepositoryFactory,
  tools: ToolRegistry,
  config: {
    maxExecutionTime: 30000,
    maxRetries: 3,
    enableMetrics: true,
    enableCaching: true,
    cacheTTL: 300000
  }
}
```

### Autonomous Controller

```javascript
{
  intentParser: {
    model: 'claude-3-sonnet',
    confidenceThreshold: 0.7
  },
  persistence: {
    storage: 'database',
    retention: '30d'
  },
  execution: {
    maxSteps: 50,
    timeout: 60000,
    allowUserConfirmations: true
  }
}
```

### Task Controller

```javascript
{
  defaultStatus: TaskStatus.PENDING,
  defaultPriority: TaskPriority.MEDIUM,
  enableNotifications: true,
  maxTagsPerTask: 10,
  quadrants: {
    do_first: { urgent: true, important: true },
    schedule: { urgent: false, important: true },
    delegate: { urgent: true, important: false },
    eliminate: { urgent: false, important: false }
  }
}
```

### Roadmap Controller

```javascript
{
  maxPhases: 20,
  maxMilestonesPerPhase: 50,
  enableProgressTracking: true,
  autoCalculateProgress: true,
  allowParallelPhases: false,
  notificationTriggers: ['milestone_complete', 'phase_complete']
}
```

## Best Practices

1. **Validate Early**: Validate all inputs at controller level
2. **Consistent Responses**: Use formatResponse/formatError helpers
3. **Error Handling**: Wrap async operations with error handling
4. **Context Passing**: Pass request context through all layers
5. **Rate Limiting**: Implement rate limiting at controller level
6. **Logging**: Log all controller operations
7. **Pagination**: Always paginate list responses
8. **Caching**: Cache frequently accessed data
