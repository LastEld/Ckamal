# Plugin System Architecture

## Overview

The CogniMesh Plugin System provides a secure, extensible architecture for third-party extensions. Plugins run in isolated worker processes with controlled access to system capabilities via a well-defined API.

---

## Key Design Principles

1. **Worker Isolation**: Each plugin runs in a separate Node.js process
2. **Capability-Based Security**: Plugins declare required capabilities; access is explicitly granted
3. **JSON-RPC Communication**: Structured communication between host and plugins
4. **Event-Driven**: Plugins can subscribe to and emit events
5. **State Isolation**: Plugin state is scoped and isolated from other plugins

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              COGNIMESH HOST                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Plugin Registry                               │   │
│  │  - Plugin metadata storage                                          │   │
│  │  - Capability management                                            │   │
│  │  - Lifecycle state machine                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Plugin Loader                                 │   │
│  │  - Manifest parsing                                                  │   │
│  │  - Worker spawning                                                   │   │
│  │  - Lifecycle management                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Host RPC Server                                 │   │
│  │  - Request routing                                                   │   │
│  │  - Capability enforcement                                            │   │
│  │  - Event distribution                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ JSON-RPC over stdio
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
┌───────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│     Plugin Worker 1   │ │  Plugin Worker 2 │ │  Plugin Worker N │
│  ┌─────────────────┐  │ │  ┌────────────┐  │ │  ┌────────────┐  │
│  │   Plugin Code   │  │ │  │Plugin Code │  │ │  │Plugin Code │  │
│  │  (User-defined) │  │ │  │(User-def)  │  │ │  │(User-def)  │  │
│  └────────┬────────┘  │ │  └─────┬──────┘  │ │  └─────┬──────┘  │
│           │           │ │        │         │ │        │         │
│  ┌────────▼────────┐  │ │  ┌─────▼──────┐  │ │  ┌─────▼──────┐  │
│  │   Plugin SDK    │  │ │  │ Plugin SDK │  │ │  │ Plugin SDK │  │
│  │  - Context API  │  │ │  │- Context   │  │ │  │- Context   │  │
│  │  - Tool reg     │  │ │  │  API       │  │ │  │  API       │  │
│  │  - Event handlers│ │ │  │- Tool reg  │  │ │  │- Tool reg  │  │
│  └────────┬────────┘  │ │  └─────┬──────┘  │ │  └─────┬──────┘  │
│           │           │ │        │         │ │        │         │
│  ┌────────▼────────┐  │ │  ┌─────▼──────┐  │ │  ┌─────▼──────┐  │
│  │   Worker RPC    │  │ │  │ Worker RPC │  │ │  │ Worker RPC │  │
│  │   (stdio)       │  │ │  │  (stdio)   │  │ │  │  (stdio)   │  │
│  └─────────────────┘  │ │  └────────────┘  │ │  └────────────┘  │
└───────────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## Plugin Lifecycle

### State Machine

```
                    ┌─────────────┐
                    │  INSTALLED  │
                    └──────┬──────┘
                           │ registerPlugin()
                           ▼
                    ┌─────────────┐
                    │  REGISTERED │
                    └──────┬──────┘
                           │ loadFromDirectory()
                           ▼
             ┌─────────────┴─────────────┐
             │         LOADING           │
             └─────────────┬─────────────┘
                           │ spawn worker
                           ▼
                    ┌─────────────┐
           ┌───────│ INITIALIZING│───────┐
           │       └──────┬──────┘       │
           │              │ setup()      │
           │              ▼              │
     error │       ┌─────────────┐       │ error
           └──────▶│   ACTIVE    │◀──────┘
                     └──────┬──────┘
                            │ config change
                            ▼
                     ┌─────────────┐
                     │  UPDATING   │
                     └──────┬──────┘
                            │ reload
                            ▼
                     ┌─────────────┐
              ┌─────│  UNLOADING  │─────┐
              │      └─────────────┘      │
              │                             │
              ▼                             ▼
       ┌─────────────┐              ┌─────────────┐
       │  TERMINATED │              │    FAILED   │
       └─────────────┘              └─────────────┘
```

### Lifecycle Hooks

```javascript
export default definePlugin({
  // Called once when plugin is loaded
  async setup(ctx) {
    // Register tools
    ctx.tools.register('myTool', declaration, handler);
    
    // Subscribe to events
    ctx.events.on('task.created', handler);
    
    // Access config
    const config = await ctx.config.get();
  },
  
  // Called periodically for health checks
  async onHealth() {
    return {
      status: 'ok', // or 'degraded' or 'error'
      message: 'Operating normally'
    };
  },
  
  // Called when config changes
  async onConfigChanged(config) {
    // React to new configuration
  },
  
  // Called during graceful shutdown
  async onShutdown() {
    // Cleanup resources
  },
  
  // Validate config before applying
  async onValidateConfig(config) {
    if (!config.apiKey) {
      return { ok: false, errors: ['apiKey is required'] };
    }
    return { ok: true };
  }
});
```

---

## Worker Isolation

### Process Isolation

Each plugin runs in a separate Node.js process:

```javascript
// Worker spawning
const child = spawn(nodePath, [workerPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    CKAMAL_PLUGIN_ID: plugin.id,
    CKAMAL_PLUGIN_VERSION: plugin.version,
    CKAMAL_HOST_VERSION: '5.0.0',
    CKAMAL_PLUGIN_MODE: 'worker'
  }
});
```

### Resource Limits

| Resource | Default Limit | Configurable |
|----------|---------------|--------------|
| Memory | 512MB | Yes |
| CPU | Shared | No |
| File descriptors | 1024 | Yes |
| Execution time | 30s | Yes |

### Communication Protocol

Plugins communicate with the host via JSON-RPC 2.0 over stdio:

```javascript
// Request from host to plugin
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "executeTool",
  "params": {
    "toolName": "myTool",
    "parameters": { "arg": "value" },
    "runContext": {
      "agentId": "agent-123",
      "runId": "run-456",
      "projectId": "proj-789",
      "userId": "user-abc"
    }
  }
}

// Response from plugin
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": "Tool execution result",
    "data": { "key": "value" }
  }
}

// Error response
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error"
  }
}
```

---

## Event System

### Event Structure

```javascript
interface PluginEvent {
  eventId: string;           // UUID
  eventType: string;         // e.g., 'task.created'
  occurredAt: string;        // ISO timestamp
  actorId?: string;          // Who caused the event
  actorType?: 'user' | 'agent' | 'system' | 'plugin';
  entityId?: string;         // Primary entity ID
  entityType?: string;       // Entity type
  payload: unknown;          // Event data
}
```

### Subscribing to Events

```javascript
// Subscribe with pattern matching
const unsubscribe = ctx.events.on('task.*', (event) => {
  ctx.logger.info('Task event', { type: event.eventType });
});

// Subscribe with filter
ctx.events.on('task.updated', 
  { projectId: 'my-project' },
  (event) => {
    // Only receives events for my-project
  }
);

// Wildcard subscriptions
ctx.events.on('plugin.*', handler);  // All plugin events
ctx.events.on('*', handler);          // All events
```

### Emitting Events

```javascript
// Emit a namespaced event
await ctx.events.emit('analysisComplete', {
  result: 'success',
  findings: [...]
});

// Event name is automatically prefixed: plugin.{id}.analysisComplete
```

### Event Delivery Guarantees

| Aspect | Guarantee |
|--------|-----------|
| Delivery | At-least-once |
| Ordering | Best-effort per source |
| Persistence | Events logged to database |
| Retry | 3 attempts with backoff |

---

## State Management

### Scoped State

Plugin state is isolated by scope:

```javascript
// State key structure
interface ScopeKey {
  scopeKind: 'instance' | 'project' | 'task' | 'conversation' | 'user';
  scopeId?: string;
  namespace?: string;
  stateKey: string;
}

// Examples
await ctx.state.set(
  { scopeKind: 'instance', stateKey: 'config' },
  { theme: 'dark' }
);

await ctx.state.set(
  { scopeKind: 'project', scopeId: 'proj-123', stateKey: 'cache' },
  { data: [...] }
);

await ctx.state.set(
  { scopeKind: 'user', scopeId: 'user-456', namespace: 'prefs', stateKey: 'notifications' },
  { email: true }
);
```

### State Isolation

```
┌─────────────────────────────────────────────────────────┐
│                    Plugin A State                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Instance     │  │ Project:123  │  │ User:456     │  │
│  │ {config}     │  │ {cache}      │  │ {prefs}      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Isolated
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Plugin B State                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Instance     │  │ Project:123  │  │ User:456     │  │
│  │ {config}     │  │ {data}       │  │ {settings}   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Tool Registration

### Tool Declaration

```javascript
ctx.tools.register('analyzeCode', {
  displayName: 'Analyze Code',
  description: 'Analyzes code for issues and improvements',
  parametersSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Code to analyze'
      },
      language: {
        type: 'string',
        enum: ['javascript', 'python', 'rust']
      }
    },
    required: ['code']
  }
}, async (params, runContext) => {
  // Tool implementation
  const result = await analyze(params.code, params.language);
  
  return {
    content: `Analysis complete: ${result.summary}`,
    data: result,
    artifacts: [
      { type: 'json', name: 'details.json', content: JSON.stringify(result) }
    ]
  };
});
```

### Tool Execution Context

```javascript
interface ToolRunContext {
  agentId: string;           // Invoking agent
  runId: string;             // Current run
  projectId: string;         // Project scope
  userId: string;            // Authenticated user
  conversationId?: string;   // Optional conversation
}
```

---

## Capability System

### Available Capabilities

| Capability | Description |
|------------|-------------|
| `tools.register` | Register custom tools |
| `state.read` | Read scoped state |
| `state.write` | Write scoped state |
| `events.subscribe` | Subscribe to events |
| `events.emit` | Emit events |
| `http.outbound` | Make HTTP requests |
| `tasks.read` | Read task data |
| `tasks.write` | Create/modify tasks |
| `conversations.read` | Read conversations |
| `conversations.write` | Modify conversations |
| `roadmaps.read` | Read roadmaps |
| `roadmaps.write` | Modify roadmaps |
| `system.metrics` | Access system metrics |
| `system.logs.read` | Read system logs |

### Capability Enforcement

```javascript
// Host checks capability before allowing operation
async executeTool(pluginId, toolName, params, context) {
  if (!registry.hasCapability(pluginId, 'tools.register')) {
    throw new Error(`Plugin ${pluginId} lacks tools.register capability`);
  }
  
  const worker = workers.get(pluginId);
  return worker.executeTool(toolName, params, context);
}
```

---

## Manifest Format

```json
{
  "apiVersion": 1,
  "id": "@myorg/code-analyzer",
  "version": "1.2.3",
  "name": "Code Analyzer",
  "description": "Analyzes code quality and suggests improvements",
  "author": "My Organization",
  "license": "MIT",
  "entrypoints": {
    "worker": "./dist/worker.js",
    "ui": "./dist/ui.bundle.js"
  },
  "capabilities": [
    "tools.register",
    "state.read",
    "state.write",
    "events.subscribe",
    "http.outbound"
  ],
  "tools": [
    {
      "name": "analyzeCode",
      "displayName": "Analyze Code",
      "description": "Analyzes code for issues",
      "parametersSchema": { ... }
    }
  ],
  "events": {
    "subscribe": ["task.updated", "file.saved"],
    "emit": ["analysis.complete", "issue.found"]
  },
  "uiSlots": [
    {
      "slotId": "codeQualityPanel",
      "slotType": "detailTab",
      "zone": "fileInspector",
      "title": "Code Quality",
      "entityTypes": ["file"]
    }
  ],
  "configSchema": {
    "type": "object",
    "properties": {
      "apiKey": { "type": "string" },
      "maxDepth": { "type": "number", "default": 5 }
    },
    "required": ["apiKey"]
  }
}
```

---

## Security Model

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Malicious code | Worker process isolation |
| Data exfiltration | HTTP requests proxied through host |
| Resource exhaustion | Memory/time limits enforced |
| Privilege escalation | Capability-based access control |
| State tampering | Scoped state isolation |

### Sandboxing

```javascript
// Worker process restrictions
const child = spawn(nodePath, [workerPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    // Limited environment
    CKAMAL_PLUGIN_ID: plugin.id,
    CKAMAL_PLUGIN_VERSION: plugin.version,
    // ... no sensitive env vars
  },
  // Resource limits (via external tools like systemd-run or docker)
  // - Memory: 512MB
  // - CPU: 1 core
  // - Filesystem: read-only except tmp
});
```

---

## Error Handling

### JSON-RPC Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse Error | Invalid JSON |
| -32600 | Invalid Request | Invalid request object |
| -32601 | Method Not Found | Method doesn't exist |
| -32602 | Invalid Params | Invalid method parameters |
| -32603 | Internal Error | Internal plugin error |
| -32000 | Worker Unavailable | Worker process crashed |
| -32001 | Capability Denied | Missing capability |
| -32002 | Worker Error | Worker execution error |
| -32003 | Timeout | RPC call timed out |

### Error Handling Pattern

```javascript
// Plugin-side error handling
async setup(ctx) {
  ctx.tools.register('riskyTool', declaration, async (params) => {
    try {
      const result = await riskyOperation(params);
      return { content: 'Success', data: result };
    } catch (error) {
      // Return structured error
      return {
        content: `Error: ${error.message}`,
        error: error.message,
        data: { code: error.code }
      };
    }
  });
}
```

---

## Performance Considerations

### Worker Pooling

For high-throughput scenarios, plugins can implement internal worker pools:

```javascript
// Plugin-side worker pool
const workerPool = new WorkerPool({
  minWorkers: 2,
  maxWorkers: 8,
  idleTimeoutMs: 30000
});

ctx.tools.register('cpuIntensive', declaration, async (params) => {
  return workerPool.execute(params);
});
```

### Caching

```javascript
// Plugin-side caching
const cache = new LRUCache({ max: 100, ttl: 60000 });

ctx.tools.register('expensiveOperation', declaration, async (params) => {
  const key = JSON.stringify(params);
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const result = await expensiveOperation(params);
  cache.set(key, result);
  return result;
});
```

---

## Debugging

### Plugin Logs

```javascript
// Structured logging to host
ctx.logger.info('Operation started', { 
  operationId: '123',
  params: { ... }
});

ctx.logger.error('Operation failed', {
  error: error.message,
  stack: error.stack
});
```

Logs are forwarded to the host and stored in `plugin_logs` table.

### Health Checks

```javascript
export default definePlugin({
  async onHealth() {
    const dbConnection = await checkDatabase();
    const apiLatency = await checkExternalApi();
    
    if (!dbConnection.ok) {
      return {
        status: 'error',
        message: 'Database connection failed',
        details: { error: dbConnection.error }
      };
    }
    
    if (apiLatency > 1000) {
      return {
        status: 'degraded',
        message: 'High API latency',
        details: { latency: apiLatency }
      };
    }
    
    return { status: 'ok' };
  }
});
```

---

*Version: 5.0.0*  
*Last Updated: 2026-03-28*
