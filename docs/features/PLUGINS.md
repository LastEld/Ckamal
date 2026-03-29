# Plugin System

CogniMesh v5.0 provides a powerful plugin architecture for extending platform functionality. Plugins can register tools, handle events, manage state, and provide UI components.

## Overview

The plugin system enables:
- **Tool registration**: Add custom MCP tools
- **Event handling**: Subscribe to and emit events
- **State management**: Scoped persistent state
- **UI extensions**: Dashboard components and widgets
- **HTTP integration**: External API calls
- **Sandboxed execution**: Secure plugin isolation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PLUGIN HOST                             │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Registry   │  │    Loader    │  │   Runtime    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
│         └─────────────────┴─────────────────┘              │
│                           │                                │
└───────────────────────────┼─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
┌────────▼────────┐  ┌──────▼───────┐  ┌──────▼───────┐
│   Plugin A      │  │   Plugin B   │  │   Plugin C   │
│   (Tools)       │  │   (Events)   │  │   (UI)       │
└─────────────────┘  └──────────────┘  └──────────────┘
```

## Plugin Development Guide

### Creating a Plugin

Use the `definePlugin` factory from the SDK:

```javascript
// my-plugin.js
import { definePlugin } from '@ckamal/plugin-sdk';

export default definePlugin({
  async setup(ctx) {
    // Plugin initialization
    ctx.logger.info('My plugin is starting...');
    
    // Register tools
    ctx.tools.register('myTool', {
      displayName: 'My Custom Tool',
      description: 'Does something useful',
      parametersSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        },
        required: ['input']
      }
    }, async (params, runCtx) => {
      return { 
        content: `Processed: ${params.input}` 
      };
    });
    
    // Subscribe to events
    ctx.events.on('task.created', (event) => {
      ctx.logger.info('New task created', { taskId: event.entityId });
    });
  },
  
  async onHealth() {
    // Health check
    return { status: 'ok' };
  },
  
  async onConfigChanged(config) {
    // Handle configuration updates
    ctx.logger.info('Config updated', config);
  },
  
  async onShutdown() {
    // Cleanup
    ctx.logger.info('Plugin shutting down...');
  }
});
```

### Plugin Manifest

Each plugin requires a `manifest.json`:

```json
{
  "apiVersion": 1,
  "id": "@myorg/my-plugin",
  "version": "1.0.0",
  "name": "My Custom Plugin",
  "description": "Adds custom functionality to CogniMesh",
  "entrypoints": {
    "worker": "dist/worker.js",
    "ui": "dist/ui.js"
  },
  "capabilities": [
    "tools.register",
    "state.read",
    "state.write",
    "events.subscribe",
    "events.emit",
    "http.outbound"
  ],
  "configSchema": {
    "type": "object",
    "properties": {
      "apiKey": { "type": "string" },
      "endpoint": { "type": "string" }
    }
  }
}
```

## SDK Reference

### Plugin Context

The `setup` function receives a context object with:

#### Configuration

```javascript
// Get configuration
const config = await ctx.config.get();
// Returns: { apiKey: 'xxx', endpoint: 'https://...' }
```

#### State Management

```javascript
// Scoped state storage
await ctx.state.set({
  scopeKind: 'instance',  // instance, project, task, conversation, user
  scopeId: 'task-123',
  namespace: 'my-plugin',
  stateKey: 'progress'
}, { step: 5, total: 10 });

// Retrieve state
const progress = await ctx.state.get({
  scopeKind: 'task',
  scopeId: 'task-123',
  namespace: 'my-plugin',
  stateKey: 'progress'
});

// Delete state
await ctx.state.delete({
  scopeKind: 'task',
  scopeId: 'task-123',
  namespace: 'my-plugin',
  stateKey: 'progress'
});
```

#### Event Handling

```javascript
// Subscribe to events
const unsubscribe = ctx.events.on('task.created', (event) => {
  console.log('Task created:', event.entityId);
});

// With filter
ctx.events.on('task.updated', 
  { projectId: 'proj-123' },
  (event) => {
    console.log('Project task updated');
  }
);

// Unsubscribe
unsubscribe();

// Emit custom events
await ctx.events.emit('custom.event', {
  data: 'value'
});
```

**Event Patterns:**
- `task.created` - Specific event
- `task.*` - All task events
- `*` - All events

**Available Events:**
| Event | Payload |
|-------|---------|
| `task.created` | `{ taskId, title, assignee }` |
| `task.updated` | `{ taskId, changes }` |
| `task.completed` | `{ taskId, completedAt }` |
| `agent.spawned` | `{ agentId, type }` |
| `agent.completed` | `{ agentId, result }` |
| `heartbeat.run.started` | `{ runId, agentId }` |
| `heartbeat.run.completed` | `{ runId, status, cost }` |
| `issue.created` | `{ issueId, title }` |
| `approval.requested` | `{ approvalId, type }` |

#### Tool Registration

```javascript
ctx.tools.register('toolName', {
  displayName: 'Human-readable name',
  description: 'What this tool does',
  parametersSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string' },
      param2: { type: 'number', default: 10 }
    },
    required: ['param1']
  }
}, async (params, runCtx) => {
  // Tool implementation
  // runCtx contains: agentId, runId, projectId, userId, conversationId
  
  return {
    content: 'Result text',
    data: { key: 'value' },      // Structured data
    artifacts: [                  // File attachments
      { type: 'file', name: 'output.txt', content: '...' }
    ]
  };
});
```

#### HTTP Client

```javascript
// Make HTTP requests (proxied through host for audit)
const response = await ctx.http.fetch('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' })
});

if (response.ok) {
  const data = await response.json();
}
```

#### Logging

```javascript
// Structured logging
ctx.logger.info('Operation completed', { duration: 123 });
ctx.logger.warn('Deprecated feature used', { feature: 'old-api' });
ctx.logger.error('Operation failed', { error: err.message });
ctx.logger.debug('Debug info', { details: '...' });
```

### Capabilities

Declare required capabilities in the manifest:

| Capability | Description |
|------------|-------------|
| `tools.register` | Register custom tools |
| `state.read` | Read scoped state |
| `state.write` | Write scoped state |
| `events.subscribe` | Subscribe to events |
| `events.emit` | Emit custom events |
| `http.outbound` | Make HTTP requests |
| `tasks.read` | Read task data |
| `tasks.write` | Create/modify tasks |
| `conversations.read` | Read conversation data |
| `conversations.write` | Modify conversations |
| `roadmaps.read` | Read roadmap data |
| `roadmaps.write` | Modify roadmaps |
| `system.metrics` | Access system metrics |
| `system.logs.read` | Read system logs |

## Example Plugin Walkthrough

### 1. GitHub Integration Plugin

A complete example that adds GitHub integration tools:

```javascript
// github-plugin/index.js
import { definePlugin } from '@ckamal/plugin-sdk';

export default definePlugin({
  async setup(ctx) {
    const config = await ctx.config.get();
    const octokit = createOctokit(config.githubToken);
    
    // Tool: Create GitHub issue from task
    ctx.tools.register('github_create_issue', {
      displayName: 'Create GitHub Issue',
      description: 'Creates a GitHub issue from the current task',
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
      const { data: issue } = await octokit.rest.issues.create({
        owner: params.repo.split('/')[0],
        repo: params.repo.split('/')[1],
        title: params.title,
        body: params.body,
        labels: params.labels
      });
      
      // Store mapping in plugin state
      await ctx.state.set({
        scopeKind: 'task',
        scopeId: runCtx.taskId,
        namespace: 'github-plugin',
        stateKey: 'issue'
      }, {
        githubIssueNumber: issue.number,
        url: issue.html_url
      });
      
      return {
        content: `Created GitHub issue #${issue.number}: ${issue.html_url}`,
        data: { issueNumber: issue.number, url: issue.html_url }
      };
    });
    
    // Tool: Sync task status with issue
    ctx.tools.register('github_sync_status', {
      displayName: 'Sync GitHub Issue Status',
      description: 'Syncs task status with linked GitHub issue',
      parametersSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed'] }
        },
        required: ['repo', 'state']
      }
    }, async (params, runCtx) => {
      // Get stored issue mapping
      const mapping = await ctx.state.get({
        scopeKind: 'task',
        scopeId: runCtx.taskId,
        namespace: 'github-plugin',
        stateKey: 'issue'
      });
      
      if (!mapping) {
        return { error: 'No linked GitHub issue found' };
      }
      
      await octokit.rest.issues.update({
        owner: params.repo.split('/')[0],
        repo: params.repo.split('/')[1],
        issue_number: mapping.githubIssueNumber,
        state: params.state
      });
      
      return {
        content: `Updated GitHub issue #${mapping.githubIssueNumber} to ${params.state}`
      };
    });
    
    // Event handler: Auto-create issue when task marked critical
    ctx.events.on('task.created', async (event) => {
      if (event.payload.priority === 'critical') {
        ctx.logger.info('Critical task created, consider creating GitHub issue');
      }
    });
  }
});
```

### 2. Slack Notification Plugin

```javascript
// slack-plugin/index.js
import { definePlugin } from '@ckamal/plugin-sdk';

export default definePlugin({
  async setup(ctx) {
    const config = await ctx.config.get();
    
    // Send notification on approval requests
    ctx.events.on('approval.requested', async (event) => {
      const { approvalId, type, riskLevel } = event.payload;
      
      await ctx.http.fetch(config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 Approval Required`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Approval Required*\nType: ${type}\nRisk: ${riskLevel}\n<${config.dashboardUrl}/approvals/${approvalId}|View Request>`
              }
            }
          ]
        })
      });
    });
    
    // Tool: Send custom notification
    ctx.tools.register('slack_notify', {
      displayName: 'Send Slack Notification',
      description: 'Sends a notification to Slack',
      parametersSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string' },
          message: { type: 'string' },
          mentionUsers: { type: 'array', items: { type: 'string' } }
        },
        required: ['message']
      }
    }, async (params) => {
      const mentionText = params.mentionUsers?.map(u => `<@${u}>`).join(' ') || '';
      
      await ctx.http.fetch(config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: params.channel,
          text: `${mentionText} ${params.message}`
        })
      });
      
      return { content: 'Notification sent' };
    });
  }
});
```

### 3. Custom Analytics Plugin

```javascript
// analytics-plugin/index.js
import { definePlugin } from '@ckamal/plugin-sdk';

export default definePlugin({
  async setup(ctx) {
    // Track all tool executions
    ctx.events.on('*', async (event) => {
      // Store in plugin state for aggregation
      const key = `analytics:${new Date().toISOString().split('T')[0]}`;
      
      const current = await ctx.state.get({
        scopeKind: 'instance',
        scopeId: 'global',
        namespace: 'analytics',
        stateKey: key
      }) || { events: [] };
      
      current.events.push({
        type: event.eventType,
        timestamp: event.occurredAt,
        entityType: event.entityType
      });
      
      await ctx.state.set({
        scopeKind: 'instance',
        scopeId: 'global',
        namespace: 'analytics',
        stateKey: key
      }, current);
    });
    
    // Tool: Get daily report
    ctx.tools.register('analytics_daily_report', {
      displayName: 'Daily Analytics Report',
      description: 'Generates a daily activity report',
      parametersSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' }
        }
      }
    }, async (params) => {
      const date = params.date || new Date().toISOString().split('T')[0];
      
      const data = await ctx.state.get({
        scopeKind: 'instance',
        scopeId: 'global',
        namespace: 'analytics',
        stateKey: `analytics:${date}`
      });
      
      if (!data) {
        return { content: 'No data for this date' };
      }
      
      // Aggregate events
      const counts = data.events.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {});
      
      return {
        content: `Daily Report for ${date}`,
        data: {
          totalEvents: data.events.length,
          breakdown: counts
        }
      };
    });
  }
});
```

## Plugin Lifecycle

### Installation

```bash
# Install from npm
ckamal plugins install @myorg/my-plugin

# Install from file
ckamal plugins install ./my-plugin

# Install from GitHub
ckamal plugins install github:myorg/my-plugin
```

### Lifecycle States

| State | Description |
|-------|-------------|
| `installed` | Files on disk, not loaded |
| `registered` | Loaded, capabilities validated |
| `loading` | `setup()` executing |
| `initializing` | Async initialization in progress |
| `active` | Fully operational |
| `updating` | Update in progress |
| `failed` | Initialization failed |
| `unloading` | Shutdown in progress |
| `terminated` | Cleaned up |

### Management Commands

```bash
# List installed plugins
ckamal plugins list

# Show plugin details
ckamal plugins show @myorg/my-plugin

# Update plugin
ckamal plugins update @myorg/my-plugin

# Remove plugin
ckamal plugins remove @myorg/my-plugin

# Enable/disable plugin
ckamal plugins enable @myorg/my-plugin
ckamal plugins disable @myorg/my-plugin

# View plugin logs
ckamal plugins logs @myorg/my-plugin --follow
```

## Best Practices

1. **Minimal capabilities**: Request only needed capabilities
2. **Error handling**: Always handle errors gracefully
3. **State cleanup**: Clean up state in `onShutdown`
4. **Config validation**: Validate config in `onValidateConfig`
5. **Health checks**: Implement meaningful `onHealth`
6. **Event filtering**: Use filters to avoid processing all events
7. **Rate limiting**: Respect rate limits in HTTP calls
8. **Structured logging**: Use structured logs with metadata
