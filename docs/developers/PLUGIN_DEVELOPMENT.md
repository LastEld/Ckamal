# Plugin Development Guide

This guide explains how to create, package, and distribute plugins for CogniMesh. Plugins extend the platform's capabilities with custom tools, UI components, and integrations.

## Table of Contents

- [Plugin Architecture](#plugin-architecture)
- [Plugin SDK](#plugin-sdk)
- [Creating a Plugin](#creating-a-plugin)
- [Plugin Manifest](#plugin-manifest)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Registering Tools](#registering-tools)
- [State Management](#state-management)
- [Event Handling](#event-handling)
- [UI Integration](#ui-integration)
- [Publishing Plugins](#publishing-plugins)
- [Examples](#examples)

---

## Plugin Architecture

Plugins run in isolated worker processes with controlled access to the host system:

```
┌─────────────────────────────────────────────────────────────────┐
│                         CogniMesh Host                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Plugin     │  │   Plugin     │  │     HTTP/Event       │  │
│  │   Registry   │  │   Loader     │  │     Gateway          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼────────────────┼────────────────────┼──────────────┘
          │                │                    │
          │    RPC         │    RPC             │
          │   (restricted) │   (restricted)     │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Worker Processes                         │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │   Plugin A       │  │   Plugin B       │    ...             │
│  │   (isolated)     │  │   (isolated)     │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Plugin Capabilities

Plugins can request these capabilities:

| Capability | Description |
|------------|-------------|
| `tools.register` | Register MCP tools |
| `state.read` | Read plugin state |
| `state.write` | Write plugin state |
| `events.subscribe` | Subscribe to system events |
| `events.emit` | Emit custom events |
| `http.outbound` | Make HTTP requests |
| `tasks.read` | Read task data |
| `tasks.write` | Create/modify tasks |
| `conversations.read` | Read conversation data |
| `roadmaps.read` | Read roadmap data |
| `system.metrics` | Access system metrics |
| `system.logs.read` | Read system logs |

---

## Plugin SDK

The Plugin SDK (`src/plugins/plugin-sdk.js`) provides the main API for plugin development.

### SDK Reference

#### `definePlugin(definition)`

Main factory function for creating plugins:

```javascript
import { definePlugin } from '@ckamal/plugin-sdk';

export default definePlugin({
  async setup(ctx) {
    // Plugin initialization
  },
  
  async onHealth() {
    return { status: 'ok' };
  },
  
  async onConfigChanged(config) {
    // Handle configuration changes
  },
  
  async onShutdown() {
    // Cleanup before shutdown
  }
});
```

#### Plugin Context (`ctx`)

The context object provides access to host services:

```javascript
// Identity
ctx.manifest        // Plugin manifest
ctx.instanceId      // Runtime instance ID

// Configuration
await ctx.config.get()           // Get plugin config

// State management
await ctx.state.get(key)         // Read state
await ctx.state.set(key, value)  // Write state
await ctx.state.delete(key)      // Delete state

// Events
ctx.events.on(pattern, handler)  // Subscribe to events
ctx.events.emit(name, payload)   // Emit events

// Tool registration
ctx.tools.register(name, declaration, handler);

// HTTP requests
await ctx.http.fetch(url, init);

// Logging
ctx.logger.info(message, meta);
ctx.logger.warn(message, meta);
ctx.logger.error(message, meta);
ctx.logger.debug(message, meta);
```

---

## Creating a Plugin

### Step 1: Project Setup

```bash
mkdir my-cognimesh-plugin
cd my-cognimesh-plugin
npm init
```

### Step 2: Create Plugin Entry Point

Create `index.js`:

```javascript
import { definePlugin } from '@ckamal/plugin-sdk';

export default definePlugin({
  async setup(ctx) {
    ctx.logger.info('MyPlugin starting...', { 
      version: ctx.manifest.version 
    });

    // Register a tool
    ctx.tools.register('greet', {
      displayName: 'Greeting Tool',
      description: 'Generates a personalized greeting',
      parametersSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name to greet'
          },
          language: {
            type: 'string',
            enum: ['en', 'es', 'fr'],
            default: 'en',
            description: 'Language for greeting'
          }
        },
        required: ['name']
      }
    }, async (params, runCtx) => {
      const greetings = {
        en: `Hello, ${params.name}!`,
        es: `¡Hola, ${params.name}!`,
        fr: `Bonjour, ${params.name}!`
      };
      
      return {
        content: greetings[params.language],
        data: { timestamp: new Date().toISOString() }
      };
    });

    // Subscribe to events
    ctx.events.on('task.completed', (event) => {
      ctx.logger.info('Task completed', { 
        taskId: event.entityId 
      });
    });
  },

  async onHealth() {
    return {
      status: 'ok',
      message: 'Plugin is healthy',
      details: { uptime: process.uptime() }
    };
  },

  async onShutdown() {
    console.log('Cleaning up...');
  }
});
```

### Step 3: Create Plugin Manifest

Create `manifest.json`:

```json
{
  "apiVersion": 1,
  "id": "@myorg/greeting-plugin",
  "version": "1.0.0",
  "name": "Greeting Plugin",
  "description": "A simple greeting plugin for CogniMesh",
  "entrypoints": {
    "worker": "./index.js"
  },
  "capabilities": [
    "tools.register",
    "events.subscribe",
    "state.read",
    "state.write"
  ],
  "configSchema": {
    "type": "object",
    "properties": {
      "defaultLanguage": {
        "type": "string",
        "enum": ["en", "es", "fr"],
        "default": "en"
      },
      "logLevel": {
        "type": "string",
        "enum": ["debug", "info", "warn", "error"],
        "default": "info"
      }
    }
  }
}
```

### Step 4: Install SDK

```bash
npm install @ckamal/plugin-sdk
```

### Step 5: Test Locally

Place your plugin in the CogniMesh plugins directory:

```bash
mkdir -p /path/to/Ckamal/plugins/@myorg/greeting-plugin
cp -r * /path/to/Ckamal/plugins/@myorg/greeting-plugin/
```

---

## Plugin Manifest

The manifest defines plugin metadata and requirements:

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `apiVersion` | `number` | Plugin API version (must be 1) |
| `id` | `string` | Unique plugin ID (scoped like `@org/name`) |
| `version` | `string` | Semver version |
| `name` | `string` | Human-readable name |
| `description` | `string` | Plugin description |
| `entrypoints.worker` | `string` | Main entry point path |
| `capabilities` | `string[]` | Required capabilities |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `entrypoints.ui` | `string` | UI bundle entry point |
| `configSchema` | `object` | JSON Schema for config validation |
| `events` | `object` | Event subscriptions declaration |
| `uiSlots` | `array` | UI slot declarations |

### ID Format

```
@organization/plugin-name
my-plugin-name
```

Valid characters: lowercase letters, numbers, hyphens, dots, underscores, tildes.

---

## Plugin Lifecycle

```
INSTALLED → REGISTERED → LOADING → INITIALIZING → ACTIVE
                                              ↓
TERMINATED ← UNLOADING ← FAILED ←─────────────┘
```

### Lifecycle Hooks

```javascript
definePlugin({
  // Called during INITIALIZING → ACTIVE
  async setup(ctx) {
    // Initialize plugin
    // Register tools
    // Subscribe to events
  },

  // Called when config changes
  async onConfigChanged(config) {
    // React to new configuration
  },

  // Called periodically for health checks
  async onHealth() {
    return {
      status: 'ok' | 'degraded' | 'error',
      message: 'Optional description',
      details: { /* diagnostics */ }
    };
  },

  // Called during ACTIVE → TERMINATED
  async onShutdown() {
    // Cleanup resources
    // Close connections
  }
});
```

---

## Registering Tools

Tools are functions that AI agents can invoke:

```javascript
ctx.tools.register('toolName', {
  // Tool declaration (metadata)
  displayName: 'Human Readable Name',
  description: 'What this tool does',
  parametersSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Parameter description'
      },
      param2: {
        type: 'number',
        minimum: 0,
        maximum: 100
      }
    },
    required: ['param1']
  }
}, async (params, runCtx) => {
  // Tool handler
  // params: validated parameters
  // runCtx: execution context
  
  return {
    // Response
    content: 'Text result for the AI',
    data: { /* structured data */ },
    artifacts: [
      { type: 'file', name: 'output.txt', content: '...' }
    ]
  };
});
```

### Tool Run Context

```javascript
{
  agentId: 'agent-123',      // Invoking agent
  runId: 'run-456',          // Current run ID
  projectId: 'proj-789',     // Project scope
  userId: 'user-abc',        // Authenticated user
  conversationId: 'conv-def' // Optional conversation
}
```

### Tool Result

```javascript
{
  content: 'Primary text output',     // Required
  data: { /* structured output */ },  // Optional
  error: 'Error message',             // If failed
  artifacts: [                        // Attachments
    { type: 'file', name: 'data.json', content: '...' }
  ]
}
```

---

## State Management

Plugins have scoped state storage:

```javascript
// Scope types
const instanceKey = { 
  scopeKind: 'instance',  // Per plugin instance
  stateKey: 'counter'
};

const projectKey = {
  scopeKind: 'project',   // Per project
  scopeId: 'proj-123',
  stateKey: 'settings'
};

const taskKey = {
  scopeKind: 'task',      // Per task
  scopeId: 'task-456',
  stateKey: 'progress'
};

const userKey = {
  scopeKind: 'user',      // Per user
  scopeId: 'user-789',
  stateKey: 'preferences'
};

// With namespace
const namespacedKey = {
  scopeKind: 'project',
  scopeId: 'proj-123',
  namespace: 'custom-ns',  // Default: 'default'
  stateKey: 'data'
};

// Usage
await ctx.state.set(instanceKey, 42);
const value = await ctx.state.get(instanceKey);
await ctx.state.delete(instanceKey);
```

---

## Event Handling

### Subscribing to Events

```javascript
// Simple pattern matching
ctx.events.on('task.created', (event) => {
  console.log('Task created:', event.entityId);
});

// Wildcards
ctx.events.on('task.*', (event) => {
  // Matches: task.created, task.updated, task.completed, etc.
});

// With filters
ctx.events.on('task.completed', 
  { projectId: 'proj-123' },
  (event) => {
    // Only for specific project
  }
);

// Unsubscribe
const unsubscribe = ctx.events.on('task.*', handler);
unsubscribe(); // Remove subscription
```

### Event Object

```javascript
{
  eventId: 'evt-uuid',
  eventType: 'task.completed',
  occurredAt: '2024-01-15T10:30:00Z',
  actorId: 'user-123',
  actorType: 'user',  // 'user' | 'agent' | 'system' | 'plugin'
  entityId: 'task-456',
  entityType: 'task',
  payload: { /* event data */ }
}
```

### Emitting Events

```javascript
await ctx.events.emit('customEvent', {
  customField: 'value'
});

// Event type will be: plugin.{pluginId}.customEvent
```

---

## UI Integration

Plugins can provide UI components via slots:

### Manifest Declaration

```json
{
  "uiSlots": [
    {
      "slot": "dashboard.header",
      "component": "MyHeaderWidget"
    },
    {
      "slot": "task.sidebar",
      "component": "TaskExtension"
    }
  ]
}
```

### Available Slots

| Slot | Description |
|------|-------------|
| `dashboard.header` | Top of dashboard |
| `dashboard.sidebar` | Dashboard sidebar |
| `task.sidebar` | Task detail sidebar |
| `workflow.canvas` | Workflow visualization |
| `settings.tab` | Settings page tab |

### Data/Action Handlers

```javascript
// Provide data to UI
ctx.data.register('widgetData', async (request) => {
  return {
    items: await fetchItems(request.projectId)
  };
});

// Handle UI actions
ctx.actions.register('doSomething', async (payload) => {
  await performAction(payload);
  return { success: true };
});
```

---

## Publishing Plugins

### Package Structure

```
my-plugin/
├── manifest.json      # Plugin metadata
├── index.js           # Entry point
├── README.md          # Documentation
├── LICENSE            # License file
└── package.json       # NPM metadata (optional)
```

### Distribution

1. **Local Installation**: Copy to `plugins/` directory
2. **GitHub Releases**: Tag and release on GitHub
3. **NPM**: Publish to npm registry
4. **Private Registry**: Host on private npm/registry

### Installing Plugins

```bash
# Via CLI
cognimesh plugin install @myorg/my-plugin

# Via dashboard
# Navigate to Settings > Plugins > Install

# Manual installation
git clone https://github.com/myorg/my-plugin.git
plugins/my-plugin
```

---

## Examples

### GitHub Integration Plugin

```javascript
import { definePlugin } from '@ckamal/plugin-sdk';

export default definePlugin({
  async setup(ctx) {
    // Register GitHub tool
    ctx.tools.register('github.createIssue', {
      displayName: 'Create GitHub Issue',
      description: 'Creates an issue in a GitHub repository',
      parametersSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'owner/repo' },
          title: { type: 'string' },
          body: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } }
        },
        required: ['repo', 'title']
      }
    }, async (params, runCtx) => {
      const config = await ctx.config.get();
      const token = config.githubToken;
      
      const response = await ctx.http.fetch(
        `https://api.github.com/repos/${params.repo}/issues`,
        {
          method: 'POST',
          headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: params.title,
            body: params.body,
            labels: params.labels
          })
        }
      );
      
      const issue = await response.json();
      
      return {
        content: `Created issue #${issue.number}: ${issue.html_url}`,
        data: { issueNumber: issue.number, url: issue.html_url }
      };
    });

    // Sync issues periodically
    ctx.events.on('system.tick', async () => {
      const lastSync = await ctx.state.get({
        scopeKind: 'instance',
        stateKey: 'lastSync'
      });
      
      if (!lastSync || Date.now() - lastSync > 60000) {
        await syncIssues(ctx);
        await ctx.state.set(
          { scopeKind: 'instance', stateKey: 'lastSync' },
          Date.now()
        );
      }
    });
  },

  async onHealth() {
    const token = (await ctx.config.get()).githubToken;
    if (!token) {
      return { status: 'error', message: 'GitHub token not configured' };
    }
    return { status: 'ok' };
  }
});
```

### Data Analytics Plugin

```javascript
import { definePlugin } from '@ckamal/plugin-sdk';

export default definePlugin({
  async setup(ctx) {
    // Track task metrics
    ctx.events.on('task.completed', async (event) => {
      const projectId = event.payload.projectId;
      const key = {
        scopeKind: 'project',
        scopeId: projectId,
        stateKey: 'taskMetrics'
      };
      
      const metrics = await ctx.state.get(key) || {
        totalCompleted: 0,
        avgDuration: 0
      };
      
      metrics.totalCompleted++;
      if (event.payload.duration) {
        metrics.avgDuration = (
          metrics.avgDuration * (metrics.totalCompleted - 1) + 
          event.payload.duration
        ) / metrics.totalCompleted;
      }
      
      await ctx.state.set(key, metrics);
    });

    // Tool to get analytics
    ctx.tools.register('analytics.getProjectMetrics', {
      displayName: 'Get Project Metrics',
      description: 'Get analytics for a project',
      parametersSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      }
    }, async (params) => {
      const metrics = await ctx.state.get({
        scopeKind: 'project',
        scopeId: params.projectId,
        stateKey: 'taskMetrics'
      });
      
      return {
        content: `Total completed: ${metrics?.totalCompleted || 0}`,
        data: metrics
      };
    });
  }
});
```

### Complete Plugin with All Features

See `examples/plugins/` in the repository for complete working examples.
