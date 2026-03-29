# CogniMesh Plugin System Architecture

## Overview

The CogniMesh Plugin System provides a secure, isolated, and extensible architecture for third-party extensions. Plugins run in worker processes with controlled access to system capabilities through a well-defined SDK.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLUGIN SYSTEM LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Plugin Registry                                │   │
│  │                    (State Management)                               │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│         ┌───────────────────────┼───────────────────────┐                  │
│         ▼                       ▼                       ▼                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐             │
│  │   Plugin A   │      │   Plugin B   │      │   Plugin C   │             │
│  │   (Active)   │      │   (Active)   │      │  (Loading)   │             │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘             │
│         │                     │                     │                      │
│         └─────────────────────┼─────────────────────┘                      │
│                               ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                      Worker Process Pool                            │  │
│  │                                                                     │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │  │
│  │  │  Worker A       │  │  Worker B       │  │  Worker C       │     │  │
│  │  │  (Isolated)     │  │  (Isolated)     │  │  (Isolated)     │     │  │
│  │  │                 │  │                 │  │                 │     │  │
│  │  │  • Plugin Code  │  │  • Plugin Code  │  │  • Plugin Code  │     │  │
│  │  │  • SDK Runtime  │  │  • SDK Runtime  │  │  • SDK Runtime  │     │  │
│  │  │  • Limited      │  │  • Limited      │  │  • Limited      │     │  │
│  │  │    Memory       │  │    Memory       │  │    Memory       │     │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │  │
│  │           │                    │                    │               │  │
│  │           └────────────────────┼────────────────────┘               │  │
│  │                                ▼                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │              JSON-RPC Communication Layer                   │   │  │
│  │  │                   (stdio / IPC)                             │   │  │
│  │  └─────────────────────────────┬───────────────────────────────┘   │  │
│  └────────────────────────────────┼───────────────────────────────────┘  │
│                                   │                                       │
│  ┌────────────────────────────────┼───────────────────────────────────┐  │
│  │                    Host Process (CogniMesh)                        │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                   PluginContext Host                        │  │  │
│  │  │  • Capability Enforcement                                   │  │  │
│  │  │  • State Isolation                                          │  │  │
│  │  │  • Event Routing                                            │  │  │
│  │  │  • HTTP Proxy                                               │  │  │
│  │  │  • Audit Logging                                            │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │  │
│  │  │    Tools     │  │    State     │  │   Events     │            │  │
│  │  │   Registry   │  │   Storage    │  │    Bus       │            │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

## Plugin Lifecycle

```
┌─────────┐   Load    ┌──────────┐  Register  ┌────────────┐  Setup  ┌────────┐
│  Idle   │ ────────▶ │ Installed│ ─────────▶ │ Registered │ ─────▶ │ Loading│
└─────────┘           └──────────┘            └────────────┘         └───┬────┘
                                                                         │
    ┌────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────┐ Initialize ┌──────────┐  Health  ┌──────────┐ Unload ┌──────────┐
│ Loading  │ ──────────▶ │ Active   │ ───────▶ │ Running  │ ─────▶ │Unloading │
└──────────┘             └──────────┘  Check   └──────────┘        └────┬─────┘
     │                     │         Failed                            │
     │ Error               │ ◀────────────────                        │
     └─────────────────────┘                                           │
                                                                        ▼
                                                                  ┌──────────┐
                                                                  │Terminated│
                                                                  └──────────┘
```

### Lifecycle States

| State | Description |
|-------|-------------|
| `installed` | Plugin files on disk, not yet registered |
| `registered` | Registered in plugin registry |
| `loading` | Worker process starting |
| `initializing` | Plugin setup() executing |
| `active` | Plugin running and healthy |
| `failed` | Error during initialization or runtime |
| `updating` | Plugin being updated |
| `unloading` | Graceful shutdown in progress |
| `terminated` | Worker stopped, resources cleaned up |

## Plugin SDK

### Defining a Plugin

```javascript
import { definePlugin } from '@ckamal/plugin-sdk';

export default definePlugin({
  // Required: Setup function
  async setup(ctx) {
    // Register tools
    ctx.tools.register('analyzeCode', {
      displayName: 'Analyze Code',
      description: 'Analyzes code for issues',
      parametersSchema: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          language: { type: 'string' }
        },
        required: ['code']
      }
    }, async (params, runCtx) => {
      // Tool implementation
      const result = await analyzeCode(params.code, params.language);
      return {
        content: `Found ${result.issues.length} issues`,
        data: result
      };
    });
    
    // Subscribe to events
    ctx.events.on('task.completed', (event) => {
      ctx.logger.info('Task completed', { taskId: event.entityId });
    });
    
    // Access configuration
    const config = await ctx.config.get();
    ctx.logger.info('Plugin configured', { apiEndpoint: config.apiEndpoint });
  },
  
  // Optional: Health check
  async onHealth() {
    return {
      status: 'ok',
      message: 'All systems operational',
      details: { queueLength: 0, lastProcessed: Date.now() }
    };
  },
  
  // Optional: Configuration validation
  async onValidateConfig(config) {
    const errors = [];
    if (!config.apiEndpoint) errors.push('apiEndpoint is required');
    return { ok: errors.length === 0, errors };
  },
  
  // Optional: Config change handler
  async onConfigChanged(newConfig) {
    // React to configuration changes
  },
  
  // Optional: Cleanup on shutdown
  async onShutdown() {
    // Release resources, close connections
  }
});
```

### Plugin Context API

```javascript
// Identity
ctx.manifest        // Plugin manifest
ctx.instanceId      // Runtime instance ID

// Configuration
const config = await ctx.config.get();

// State Management (Isolated)
await ctx.state.set(
  { scopeKind: 'project', scopeId: 'proj-123', stateKey: 'counter' },
  42
);
const value = await ctx.state.get(
  { scopeKind: 'project', scopeId: 'proj-123', stateKey: 'counter' }
);

// Event System
ctx.events.on('task.created', handler);
ctx.events.on('task.*', handler);  // Wildcard pattern
await ctx.events.emit('custom.event', { data: 'value' });

// HTTP Client (Proxied through host)
const response = await ctx.http.fetch('https://api.example.com/data');

// Logging
ctx.logger.info('Message', { meta: 'data' });
ctx.logger.warn('Warning');
ctx.logger.error('Error', { stack: error.stack });
ctx.logger.debug('Debug info');

// Tools (Registration)
ctx.tools.register(name, declaration, handler);

// Data/Action Handlers (for UI)
ctx.data.register(key, handler);
ctx.actions.register(key, handler);
```

### State Scope Kinds

| Scope Kind | Description | Use Case |
|------------|-------------|----------|
| `instance` | Per-plugin-instance state | Plugin settings |
| `project` | Per-project state | Project-specific data |
| `task` | Per-task state | Task context |
| `conversation` | Per-conversation state | Chat history |
| `user` | Per-user state | User preferences |
| `context` | Per-context state | Temporary data |
| `global` | Global state | Shared cache |

## Plugin Manifest

```json
{
  "apiVersion": 1,
  "id": "@myorg/code-analyzer",
  "version": "1.2.3",
  "name": "Code Analyzer",
  "description": "Analyzes code for quality issues",
  "author": "My Organization",
  "license": "MIT",
  "entrypoints": {
    "worker": "./dist/worker.js",
    "ui": "./dist/ui.js"
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
      "parametersSchema": {
        "type": "object",
        "properties": {
          "code": { "type": "string" },
          "language": { "type": "string" }
        },
        "required": ["code"]
      }
    }
  ],
  "events": {
    "subscribes": ["task.completed", "file.changed"],
    "emits": ["analysis.completed"]
  },
  "uiSlots": [
    {
      "slotId": "code-quality-panel",
      "slotType": "detailTab",
      "title": "Code Quality",
      "entityTypes": ["file"]
    }
  ],
  "configSchema": {
    "type": "object",
    "properties": {
      "apiEndpoint": { "type": "string", "format": "uri" },
      "maxIssues": { "type": "integer", "default": 50 }
    },
    "required": ["apiEndpoint"]
  }
}
```

## Capabilities

Plugins must declare required capabilities. Access is enforced by the host.

| Capability | Description |
|------------|-------------|
| `tools.register` | Register custom tools |
| `state.read` | Read scoped state |
| `state.write` | Write scoped state |
| `events.subscribe` | Subscribe to system events |
| `events.emit` | Emit custom events |
| `http.outbound` | Make HTTP requests (proxied) |
| `tasks.read` | Read task data |
| `tasks.write` | Create/update tasks |
| `conversations.read` | Read conversations |
| `conversations.write` | Send messages |
| `roadmaps.read` | Read roadmap data |
| `roadmaps.write` | Modify roadmaps |
| `system.metrics` | Access system metrics |
| `system.logs.read` | Read system logs |

## Registry API

```javascript
import { PluginRegistry } from './plugins/index.js';

const registry = new PluginRegistry({ db, capabilities });

// Register a plugin
const record = await registry.registerPlugin({
  id: '@myorg/plugin',
  manifestPath: '/plugins/my-plugin/manifest.json'
});

// Start a plugin
const active = await registry.startPlugin('@myorg/plugin', {
  maxMemory: '128mb',
  timeout: 30000
});

// Stop a plugin
await registry.stopPlugin('@myorg/plugin');

// List active plugins
const activePlugins = registry.listActive();

// Check capabilities
const canAccess = registry.hasCapability('@myorg/plugin', 'http.outbound');
```

## Loader API

```javascript
import { PluginLoader } from './plugins/index.js';

const loader = new PluginLoader({
  registry,
  maxWorkers: 10,
  workerTimeout: 30000
});

// Load from directory
const plugin = await loader.loadFromDirectory('/plugins/my-plugin');

// Load specific manifest
const plugin = await loader.loadPlugin('/plugins/my-plugin/manifest.json');

// Execute a tool
const result = await loader.executeTool(
  '@myorg/plugin',
  'analyzeCode',
  { code: '...', language: 'javascript' },
  { agentId: 'agent-123', runId: 'run-456' }
);

// Unload plugin
await loader.unloadPlugin('@myorg/plugin', { graceful: true });
```

## Communication Protocol

Plugins communicate with the host via JSON-RPC over stdio:

### Host → Worker

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools.execute",
  "params": {
    "toolName": "analyzeCode",
    "params": { "code": "..." },
    "context": { "agentId": "agent-123", "runId": "run-456" }
  }
}
```

### Worker → Host

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": "Found 3 issues",
    "data": { "issues": [...] }
  }
}
```

### Notifications (Worker → Host)

```json
{
  "jsonrpc": "2.0",
  "method": "log",
  "params": {
    "level": "info",
    "message": "Processing complete",
    "timestamp": "2026-03-28T10:00:00Z"
  }
}
```

## Database Schema

### plugins
```sql
CREATE TABLE plugins (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL, -- installed|registered|loading|active|failed|terminated
  manifest_path TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  error_message TEXT,
  manifest_hash TEXT NOT NULL,
  installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  activated_at DATETIME,
  restart_count INTEGER DEFAULT 0
);
```

### plugin_states
```sql
CREATE TABLE plugin_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL, -- instance|project|task|conversation|user|context|global
  scope_id TEXT,
  namespace TEXT DEFAULT 'default',
  state_key TEXT NOT NULL,
  value TEXT,
  version INTEGER DEFAULT 1, -- Optimistic locking
  expires_at DATETIME,
  FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
  UNIQUE(plugin_id, scope_kind, scope_id, namespace, state_key)
);
```

### plugin_tools
```sql
CREATE TABLE plugin_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  full_name TEXT NOT NULL UNIQUE, -- plugin_id.tool_name
  display_name TEXT NOT NULL,
  parameters_schema TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT 1,
  execution_count INTEGER DEFAULT 0,
  FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
);
```

### plugin_executions
```sql
CREATE TABLE plugin_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id TEXT NOT NULL UNIQUE,
  plugin_id TEXT NOT NULL,
  tool_name TEXT,
  input_params TEXT,
  output_result TEXT,
  error_message TEXT,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  duration_ms INTEGER,
  success BOOLEAN,
  FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
);
```

## Security Model

### Worker Isolation
- Each plugin runs in a separate process
- Memory limits enforced (configurable per plugin)
- CPU time limits
- No direct file system access
- No direct network access (HTTP proxied through host)

### Capability Enforcement
- Capabilities declared in manifest
- Host validates all capability requests
- Unauthorized access attempts logged and blocked
- Runtime capability revocation support

### State Isolation
- Plugin state isolated by scope
- No cross-plugin state access
- Encrypted state storage option
- Automatic expiration for temporary state

### Audit Logging
- All plugin actions logged
- Tool executions tracked
- HTTP requests logged
- State access audited

## Best Practices

### Plugin Development
1. Declare minimal required capabilities
2. Use appropriate state scopes
3. Implement health checks
4. Handle shutdown gracefully
5. Validate all inputs
6. Use structured logging

### Performance
- Keep tool handlers lightweight
- Use async operations
- Implement caching where appropriate
- Monitor memory usage
- Clean up resources in onShutdown

### Error Handling
- Return meaningful error messages
- Use proper error codes
- Log detailed errors for debugging
- Fail gracefully

---

*Version: 5.0.0*  
*Last Updated: 2026-03-28*
