# API Client SDK Guide

This guide covers the JavaScript API Client for CogniMesh. Use this SDK to interact with the CogniMesh platform from browser or Node.js applications.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [Error Handling](#error-handling)
- [Advanced Usage](#advanced-usage)
- [TypeScript](#typescript)
- [Examples](#examples)

---

## Installation

### Browser (CDN)

```html
<script src="/api-client.js"></script>
<script>
  const client = new ApiClient({ baseUrl: '/api' });
</script>
```

### ES Modules

```javascript
import { ApiClient } from './api-client.js';

const client = new ApiClient({
  baseUrl: 'http://localhost:3000/api'
});
```

### CommonJS

```javascript
const { ApiClient } = require('./api-client');

const client = new ApiClient({
  baseUrl: 'http://localhost:3000/api'
});
```

---

## Quick Start

```javascript
// Initialize client
const client = new ApiClient({
  baseUrl: '/api',
  timeout: 30000,
  retryAttempts: 3
});

// Login
await client.login('username', 'password');

// Get tasks
const tasks = await client.getTasks();

// Create a task
const newTask = await client.createTask({
  title: 'New Task',
  description: 'Task description',
  priority: 5
});

// Update task
await client.updateTask(newTask.id, { status: 'completed' });

// Get analytics
const analytics = await client.getDashboardAnalytics();
```

---

## Authentication

### Login

```javascript
try {
  const { user, token } = await client.login('user', 'pass');
  console.log('Logged in as:', user.username);
} catch (error) {
  console.error('Login failed:', error.message);
}
```

### Token Management

```javascript
// Set token manually (e.g., from storage)
client.setToken(localStorage.getItem('authToken'));

// Get current token
const token = client.getToken();

// Check authentication status
if (client.isAuthenticated()) {
  // User is logged in
}

// Logout
await client.logout();
```

### Handling Unauthorized Errors

```javascript
// The client emits an event on 401 errors
window.addEventListener('api:unauthorized', () => {
  // Redirect to login
  window.location.href = '/login';
});
```

---

## API Reference

### Client Configuration

```javascript
const client = new ApiClient({
  baseUrl: '/api',           // API base URL
  token: 'jwt-token',        // Initial auth token
  timeout: 30000,            // Request timeout (ms)
  retryAttempts: 3,          // Number of retries
  retryDelay: 1000          // Base delay between retries (ms)
});
```

### Generic HTTP Methods

```javascript
// GET request
const data = await client.get('/endpoint', { param: 'value' });

// POST request
const created = await client.post('/endpoint', { name: 'Test' });

// PUT request
const updated = await client.put('/endpoint/123', { name: 'Updated' });

// PATCH request
const patched = await client.patch('/endpoint/123', { field: 'value' });

// DELETE request
await client.delete('/endpoint/123');

// Generic request
const result = await client.request('/custom', {
  method: 'POST',
  body: { data: 'value' },
  headers: { 'X-Custom': 'header' }
});
```

### Tasks API

```javascript
// Get all tasks
const tasks = await client.getTasks({
  status: 'pending',
  priority: 5
});

// Get single task
const task = await client.getTask('task-id');

// Create task
const newTask = await client.createTask({
  title: 'Task title',
  description: 'Description',
  priority: 5,
  quadrant: 'urgent-important',
  dueDate: '2024-12-31T23:59:59Z'
});

// Update task
await client.updateTask('task-id', {
  status: 'completed',
  actualMinutes: 120
});

// Partial update
await client.patchTask('task-id', { priority: 8 });

// Delete task
await client.deleteTask('task-id');

// Batch update
await client.batchUpdateTasks(['id1', 'id2'], {
  status: 'completed'
});

// Get Eisenhower Matrix data
const matrix = await client.getMatrixData();
```

### Roadmaps API

```javascript
// Get all roadmaps
const roadmaps = await client.getRoadmaps();

// Get single roadmap
const roadmap = await client.getRoadmap('roadmap-id');

// Get roadmap progress
const progress = await client.getRoadmapProgress('roadmap-id');

// Create roadmap
const newRoadmap = await client.createRoadmap({
  name: 'Q1 2024',
  description: 'First quarter goals',
  startDate: '2024-01-01',
  targetDate: '2024-03-31'
});

// Update roadmap
await client.updateRoadmap('roadmap-id', {
  status: 'completed'
});

// Create phase
const phase = await client.createPhase('roadmap-id', {
  name: 'Phase 1',
  description: 'Initial phase'
});
```

### Workflows API

```javascript
// Get workflows
const workflows = await client.getWorkflows({ status: 'running' });

// Get single workflow
const workflow = await client.getWorkflow('workflow-id');

// Create workflow
const newWorkflow = await client.createWorkflow({
  name: 'Code Review',
  type: 'analysis',
  tasks: [
    { type: 'analyze', params: { target: 'src/' } },
    { type: 'report', params: {}, dependsOn: 0 }
  ]
});

// Execute workflow
await client.executeWorkflow('workflow-id');

// Control workflow
await client.pauseWorkflow('workflow-id');
await client.resumeWorkflow('workflow-id');
await client.cancelWorkflow('workflow-id');
```

### Agents API

```javascript
// Get all agents
const agents = await client.getAgents();

// Get agent status
const status = await client.getAgentStatus('agent-id');

// Execute task on agent
const result = await client.executeAgentTask('agent-id', {
  type: 'analyze',
  input: 'code to analyze'
});

// Agent pool operations
const poolStats = await client.getAgentPoolStats();
await client.scaleUpPool(5);
await client.scaleDownPool(2);
```

### Context Snapshots API

```javascript
// Get snapshots
const snapshots = await client.getSnapshots();

// Get single snapshot
const snapshot = await client.getSnapshot('snapshot-id');

// Create snapshot
const newSnapshot = await client.createSnapshot({
  name: 'Pre-release',
  description: 'Before v1.0 release',
  includeFiles: ['src/', 'config/']
});

// Get snapshot files
const files = await client.getSnapshotFiles('snapshot-id');

// Restore snapshot
await client.restoreSnapshot('snapshot-id', {
  targetPath: './restored'
});

// Delete snapshot
await client.deleteSnapshot('snapshot-id');

// Compare snapshots
const diff = await client.compareSnapshots('id1', 'id2');
```

### CV (Agent Profiles) API

```javascript
// Get CVs
const cvs = await client.getCVs();

// Get single CV
const cv = await client.getCV('cv-id');

// Create CV
const newCV = await client.createCV({
  name: 'Senior Developer',
  role: 'developer',
  skills: ['javascript', 'nodejs'],
  obligations: ['code-review', 'mentoring']
});

// Update CV
await client.updateCV('cv-id', { skills: ['javascript', 'python'] });

// Delete CV
await client.deleteCV('cv-id');

// Activate/suspend
await client.activateCV('cv-id');
await client.suspendCV('cv-id');

// Get templates
const templates = await client.getCVTemplates();
```

### Analytics API

```javascript
// Get dashboard analytics
const dashboard = await client.getDashboardAnalytics();

// Get trends
const trends = await client.getTrends('7d');  // or '30d', '90d'

// Get performance metrics
const metrics = await client.getPerformanceMetrics();

// Get agent activity
const activity = await client.getAgentActivity();
```

### Billing API

```javascript
// Get billing summary
const summary = await client.getBillingSummary();

// Get cost breakdown
const costs = await client.getCosts({
  startDate: '2024-01-01',
  endDate: '2024-01-31'
});

// Get billing alerts
const alerts = await client.getBillingAlerts();

// Update budget
await client.updateBudgetLimit(10000);  // in cents
```

### Alerts API

```javascript
// Get alerts
const alerts = await client.getAlerts({
  severity: 'high',
  acknowledged: false
});

// Create alert
await client.createAlert({
  title: 'High CPU Usage',
  severity: 'warning',
  message: 'CPU usage exceeded 80%'
});

// Acknowledge alert
await client.acknowledgeAlert('alert-id');

// Dismiss alert
await client.dismissAlert('alert-id');
```

### System API

```javascript
// Get system status
const status = await client.getSystemStatus();

// Get system metrics
const metrics = await client.getSystemMetrics();

// Simple health check
const health = await client.healthCheck();
```

### Tools API

```javascript
// Get available tools
const tools = await client.getTools();

// Get tool details
const tool = await client.getTool('tool-name');

// Execute tool
const result = await client.executeTool('tool-name', {
  param1: 'value1',
  param2: 'value2'
});
```

### Queue API

```javascript
// Get queue tasks
const tasks = await client.getQueueTasks({ status: 'pending' });

// Enqueue task
await client.enqueueTask(
  'process-data',
  'HIGH',
  { input: 'data' },
  { source: 'api' },
  'batch-123'
);

// Change priority
await client.reprioritizeTask('task-id', 'URGENT');

// Get queue stats
const stats = await client.getQueueStats();

// Dead letter queue
const dlq = await client.getDLQTasks();
await client.retryDLQTask('task-id');
```

### Bios/Orchestration API

```javascript
// Spawn agent
const agent = await client.spawnAgent(
  'cv-template-id',
  'claude-desktop',
  { projectId: 'proj-123' },
  { priority: 'high' }
);

// Delegate task
const result = await client.delegateTask(
  'Review this code',
  'claude-desktop',
  { timeout: 60000 }
);

// Execute in parallel
const results = await client.executeParallel(
  ['task1', 'task2'],
  ['claude-desktop', 'codex-cli'],
  { aggregate: true }
);

// Get orchestrator status
const status = await client.getOrchestratorStatus();
```

---

## Error Handling

### Error Types

```javascript
try {
  await client.getTask('invalid-id');
} catch (error) {
  // Error.message contains the error text
  console.error('Error:', error.message);
  
  // Common error patterns
  if (error.message.includes('401')) {
    // Unauthorized - redirect to login
  } else if (error.message.includes('404')) {
    // Not found
  } else if (error.message.includes('429')) {
    // Rate limited - retry after delay
  }
}
```

### Retry Behavior

The client automatically retries on:
- Network errors
- 5xx server errors
- Timeout errors

It does NOT retry on:
- 4xx client errors
- Authentication errors (401)

Configure retry behavior:

```javascript
const client = new ApiClient({
  retryAttempts: 5,
  retryDelay: 2000  // 2s, 4s, 8s, 16s, 32s
});
```

---

## Advanced Usage

### Custom Headers

```javascript
const result = await client.request('/custom', {
  method: 'POST',
  headers: {
    'X-Request-ID': generateId(),
    'X-Source': 'my-app'
  },
  body: data
});
```

### Request Timeout

```javascript
// Per-request timeout
const client = new ApiClient({ timeout: 30000 });

// Note: Individual request timeout overrides not supported directly,
// create separate client instances for different timeout requirements
```

### Request Interception

```javascript
// Extend ApiClient for custom behavior
class CustomClient extends ApiClient {
  async request(endpoint, options = {}) {
    // Add custom header to all requests
    options.headers = {
      ...options.headers,
      'X-Custom-Header': 'value'
    };
    
    // Log requests
    console.log(`API Request: ${options.method || 'GET'} ${endpoint}`);
    
    return super.request(endpoint, options);
  }
}
```

### Response Caching

```javascript
class CachingClient extends ApiClient {
  #cache = new Map();
  
  async get(endpoint, params = {}) {
    const key = `${endpoint}:${JSON.stringify(params)}`;
    
    // Check cache
    if (this.#cache.has(key)) {
      const { data, timestamp } = this.#cache.get(key);
      if (Date.now() - timestamp < 60000) {  // 1 min cache
        return data;
      }
    }
    
    // Fetch and cache
    const data = await super.get(endpoint, params);
    this.#cache.set(key, { data, timestamp: Date.now() });
    return data;
  }
  
  clearCache() {
    this.#cache.clear();
  }
}
```

---

## TypeScript

### Type Definitions

```typescript
// api-client.d.ts

export interface ApiClientOptions {
  baseUrl?: string;
  token?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  priority: number;
  quadrant?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  type: string;
  status: string;
  tasks: WorkflowTask[];
  createdAt: string;
}

export class ApiClient {
  constructor(options?: ApiClientOptions);
  
  setToken(token: string | null): void;
  getToken(): string | null;
  isAuthenticated(): boolean;
  
  // Auth
  login(username: string, password: string): Promise<{ user: any; token: string }>;
  logout(): Promise<void>;
  verifyToken(): Promise<any>;
  
  // Tasks
  getTasks(filters?: Record<string, any>): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  createTask(task: Partial<Task>): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  
  // Workflows
  getWorkflows(filters?: Record<string, any>): Promise<Workflow[]>;
  createWorkflow(data: any): Promise<Workflow>;
  executeWorkflow(id: string): Promise<any>;
  
  // ... additional methods
}
```

### Usage

```typescript
import { ApiClient, Task, Workflow } from './api-client';

const client = new ApiClient({ baseUrl: '/api' });

async function loadTasks(): Promise<Task[]> {
  return client.getTasks({ status: 'pending' });
}
```

---

## Examples

### Complete Task Management Example

```javascript
import { ApiClient } from './api-client.js';

class TaskManager {
  constructor(baseUrl) {
    this.client = new ApiClient({ baseUrl });
  }

  async initialize() {
    // Check auth
    if (!this.client.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    // Load initial data
    const [tasks, matrix] = await Promise.all([
      this.client.getTasks(),
      this.client.getMatrixData()
    ]);

    return { tasks, matrix };
  }

  async createTaskWithWorkflow(taskData, workflowType) {
    // Create task
    const task = await this.client.createTask(taskData);

    // Create and execute workflow
    const workflow = await this.client.createWorkflow({
      name: `${workflowType} for ${task.title}`,
      type: workflowType,
      tasks: [
        { type: 'analyze', params: { taskId: task.id } },
        { type: workflowType, params: {}, dependsOn: 0 }
      ]
    });

    await this.client.executeWorkflow(workflow.id);

    return { task, workflow };
  }

  async getProductivityReport() {
    const [tasks, analytics] = await Promise.all([
      this.client.getTasks({ status: 'completed' }),
      this.client.getDashboardAnalytics()
    ]);

    const totalTime = tasks.reduce((sum, t) => 
      sum + (t.actualMinutes || 0), 0
    );

    return {
      completedTasks: tasks.length,
      totalHours: Math.round(totalTime / 60 * 10) / 10,
      averageTime: Math.round(totalTime / tasks.length),
      trends: analytics.trends
    };
  }
}

// Usage
const manager = new TaskManager('/api');

async function init() {
  const { tasks, matrix } = await manager.initialize();
  console.log(`Loaded ${tasks.length} tasks`);

  // Create task with workflow
  const { task, workflow } = await manager.createTaskWithWorkflow(
    { title: 'Review PR #123', priority: 8 },
    'code-review'
  );

  // Get report
  const report = await manager.getProductivityReport();
  console.log('Productivity:', report);
}
```

### Real-time Updates with WebSocket

```javascript
import { ApiClient } from './api-client.js';

class RealtimeClient extends ApiClient {
  constructor(options) {
    super(options);
    this.ws = null;
    this.subscribers = new Map();
  }

  async connectWebSocket() {
    const wsUrl = this.baseUrl.replace('http', 'ws') + '/ws';
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  handleMessage(message) {
    const handlers = this.subscribers.get(message.type) || [];
    handlers.forEach(handler => handler(message.data));
  }

  subscribe(eventType, handler) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType).push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.subscribers.get(eventType);
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    };
  }
}

// Usage
const client = new RealtimeClient({ baseUrl: '/api' });
await client.connectWebSocket();

// Subscribe to task updates
const unsubscribe = client.subscribe('task.updated', (task) => {
  console.log('Task updated:', task);
});
```
