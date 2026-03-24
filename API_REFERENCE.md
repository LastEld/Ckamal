# CogniMesh v5.0 API Reference

Complete API documentation for the CogniMesh Multi-Agent Orchestration Platform.

**Version:** 5.0.0  
**Last Updated:** 2026-03-23

---

## Table of Contents

1. [Overview](#overview)
2. [MCP Tools API](#mcp-tools-api)
   - [Task Tools (11)](#task-tools)
   - [Roadmap Tools (13)](#roadmap-tools)
   - [Claude Tools (12)](#claude-tools)
   - [System Tools (12)](#system-tools)
   - [Analysis Tools (10)](#analysis-tools)
3. [HTTP API Endpoints](#http-api-endpoints)
4. [WebSocket API](#websocket-api)
5. [BIOS Console Commands](#bios-console-commands)
6. [JavaScript API](#javascript-api)
7. [Configuration API](#configuration-api)
8. [Event API](#event-api)

---

## Overview

CogniMesh v5.0 provides a comprehensive API for multi-agent orchestration, task management, and AI integration. The API follows these conventions:

### API Structure

- **MCP Tools**: JSON-RPC style tool definitions for AI assistants
- **HTTP REST API**: Standard HTTP endpoints for external integrations
- **WebSocket API**: Real-time bidirectional communication
- **BIOS Console**: Interactive command-line interface
- **JavaScript SDK**: Programmatic API for Node.js applications

### Authentication

Most endpoints require authentication via:
- **JWT Token**: `Authorization: Bearer <token>` header
- **API Key**: `X-API-Key: <key>` header (for service-to-service)
- **WebSocket Token**: Sent via `auth` message after connection

### Response Format

All API responses follow a consistent format:

```json
{
  "success": boolean,
  "data": object | null,
  "errors": string[] | undefined,
  "executionTime": number | undefined
}
```

### Error Handling

HTTP Status Codes:
- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error
- `503` - Service Unavailable

---

## MCP Tools API

CogniMesh exposes 58 MCP (Model Context Protocol) tools organized into 5 categories.

### Task Tools (11)

Complete task lifecycle management with Eisenhower Matrix support.

#### `task_create`

Create a new task with title, description, priority, and optional due date.

**Input Schema:**
```json
{
  "title": "string (1-200 chars)",
  "description": "string (max 5000 chars, optional)",
  "priority": "low | medium | high | critical (default: medium)",
  "assignee": "string (optional)",
  "dueDate": "ISO datetime (optional)",
  "tags": ["string"],
  "parentId": "string (optional)",
  "metadata": "object (optional)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "title": "string",
    "description": "string",
    "status": "pending | in_progress | completed | cancelled | blocked",
    "priority": "low | medium | high | critical",
    "assignee": "string",
    "dueDate": "ISO datetime",
    "tags": ["string"],
    "parentId": "string",
    "createdAt": "ISO datetime",
    "updatedAt": "ISO datetime",
    "metadata": "object"
  }
}
```

**Example:**
```javascript
const result = await toolRegistry.execute('task_create', {
  title: 'Implement authentication',
  description: 'Add JWT-based auth to API endpoints',
  priority: 'high',
  assignee: 'developer-1',
  tags: ['backend', 'security']
});
```

---

#### `task_update`

Update task properties including status, priority, assignee, and due date.

**Input Schema:**
```json
{
  "id": "string (required)",
  "title": "string (1-200 chars, optional)",
  "description": "string (max 5000 chars, optional)",
  "status": "pending | in_progress | completed | cancelled | blocked (optional)",
  "priority": "low | medium | high | critical (optional)",
  "assignee": "string (optional)",
  "dueDate": "ISO datetime (optional)",
  "tags": ["string"] (optional),
  "metadata": "object (optional)"
}
```

**Example:**
```javascript
await toolRegistry.execute('task_update', {
  id: 'task_123',
  status: 'in_progress',
  assignee: 'new-developer'
});
```

---

#### `task_delete`

Delete a task by ID, optionally cascading to child tasks.

**Input Schema:**
```json
{
  "id": "string (required)",
  "cascade": "boolean (default: false)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

---

#### `task_get`

Retrieve a task by ID with full details.

**Input Schema:**
```json
{ "id": "string (required)" }
```

**Output Schema:** Task object (same as task_create output)

---

#### `task_list`

List tasks with filtering by status, priority, assignee, and pagination.

**Input Schema:**
```json
{
  "status": "pending | in_progress | completed | cancelled | blocked (optional)",
  "priority": "low | medium | high | critical (optional)",
  "assignee": "string (optional)",
  "tags": ["string"] (optional),
  "search": "string (optional)",
  "page": "number (default: 1)",
  "pageSize": "number (1-100, default: 20)",
  "sortBy": "createdAt | updatedAt | dueDate | priority (default: createdAt)",
  "sortOrder": "asc | desc (default: desc)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "tasks": [/* Task objects */],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

---

#### `task_search`

Full-text search across task titles, descriptions, and tags.

**Input Schema:**
```json
{
  "query": "string (required, min 1 char)",
  "filters": {
    "status": "... (optional)",
    "priority": "... (optional)",
    "assignee": "string (optional)"
  },
  "page": "number (default: 1)",
  "pageSize": "number (1-100, default: 20)"
}
```

---

#### `task_next_actions`

Get prioritized list of next actions based on due dates, priorities, and dependencies.

**Input Schema:**
```json
{
  "limit": "number (1-50, default: 10)",
  "assignee": "string (optional)",
  "includeBlocked": "boolean (default: false)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "actions": [
      {
        "task": { /* Task object */ },
        "reason": "string (why this is a next action)",
        "urgency": "number (0-1)"
      }
    ]
  }
}
```

---

#### `task_bulk_update`

Update multiple tasks at once with the same changes.

**Input Schema:**
```json
{
  "ids": ["string"] (1-100 items),
  "updates": {
    "status": "... (optional)",
    "priority": "... (optional)",
    "assignee": "string (optional)",
    "tags": {
      "add": ["string"],
      "remove": ["string"]
    }
  }
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "updated": 10,
    "failed": 0,
    "details": [
      { "id": "task_1", "success": true },
      { "id": "task_2", "success": false, "error": "..." }
    ]
  }
}
```

---

#### `task_link`

Create a relationship between two tasks.

**Input Schema:**
```json
{
  "sourceId": "string (required)",
  "targetId": "string (required)",
  "linkType": "blocks | relates_to | duplicates | depends_on",
  "bidirectional": "boolean (default: false)"
}
```

---

#### `task_stats`

Get comprehensive task statistics and analytics.

**Input Schema:**
```json
{
  "assignee": "string (optional)",
  "dateRange": {
    "start": "ISO datetime",
    "end": "ISO datetime"
  }
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "total": 100,
    "byStatus": { "pending": 30, "in_progress": 20, ... },
    "byPriority": { "low": 20, "medium": 50, ... },
    "overdue": 5,
    "completedThisWeek": 15
  }
}
```

---

#### `task_dependencies`

Get all dependencies and dependents for a task.

**Input Schema:**
```json
{
  "id": "string (required)",
  "depth": "number (1-5, default: 2)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "dependencies": [/* Task objects */],
    "dependents": [/* Task objects */],
    "graph": {
      "nodes": [{ "id": "string", "task": { /* Task */ } }],
      "edges": [{ "source": "string", "target": "string", "type": "string" }]
    }
  }
}
```

---

### Roadmap Tools (13)

Educational roadmap creation, management, and visualization.

#### `roadmap_create`

Create a new roadmap with name, description, timeline, and initial nodes.

**Input Schema:**
```json
{
  "name": "string (1-200 chars)",
  "description": "string (max 5000 chars, optional)",
  "startDate": "ISO datetime (optional)",
  "endDate": "ISO datetime (optional)",
  "initialNodes": [
    {
      "type": "milestone | feature | epic | task",
      "title": "string",
      "description": "string (optional)",
      "startDate": "ISO datetime (optional)",
      "endDate": "ISO datetime (optional)"
    }
  ],
  "tags": ["string"],
  "owner": "string (required)"
}
```

**Output Schema:** Roadmap object with nodes array

---

#### `roadmap_get`

Retrieve a roadmap by ID with all nodes and details.

**Input Schema:**
```json
{
  "id": "string (required)",
  "includeProgress": "boolean (default: true)"
}
```

---

#### `roadmap_update`

Update roadmap properties.

**Input Schema:**
```json
{
  "id": "string (required)",
  "name": "string (optional)",
  "description": "string (optional)",
  "status": "draft | active | completed | archived (optional)",
  "startDate": "ISO datetime (optional)",
  "endDate": "ISO datetime (optional)",
  "tags": ["string"] (optional)
}
```

---

#### `roadmap_delete`

Delete a roadmap and optionally archive associated nodes.

**Input Schema:**
```json
{
  "id": "string (required)",
  "archive": "boolean (default: false)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": { "deleted": true, "archived": false }
}
```

---

#### `roadmap_list`

List roadmaps with filtering.

**Input Schema:**
```json
{
  "status": "draft | active | completed | archived (optional)",
  "owner": "string (optional)",
  "tags": ["string"] (optional),
  "page": "number (default: 1)",
  "pageSize": "number (1-50, default: 20)"
}
```

---

#### `roadmap_update_progress`

Update progress for roadmap and individual nodes.

**Input Schema:**
```json
{
  "roadmapId": "string (required)",
  "nodeProgress": [
    {
      "nodeId": "string",
      "progress": "number (0-100)",
      "status": "planned | in_progress | completed | skipped (optional)"
    }
  ],
  "autoCalculate": "boolean (default: true)",
  "cascade": "boolean (default: true)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "roadmapId": "string",
    "overallProgress": 75,
    "byNode": { "node1": 100, "node2": 50 }
  }
}
```

---

#### `roadmap_add_node`

Add a new node (milestone, feature, epic, task) to an existing roadmap.

**Input Schema:**
```json
{
  "roadmapId": "string (required)",
  "type": "milestone | feature | epic | task",
  "title": "string",
  "description": "string (optional)",
  "startDate": "ISO datetime (optional)",
  "endDate": "ISO datetime (optional)",
  "dependencies": ["string"] (optional),
  "assignees": ["string"] (optional),
  "position": {
    "after": "string (optional)",
    "before": "string (optional)",
    "parent": "string (optional)"
  }
}
```

---

#### `roadmap_remove_node`

Remove a node from roadmap with options to handle dependencies.

**Input Schema:**
```json
{
  "roadmapId": "string (required)",
  "nodeId": "string (required)",
  "moveDependents": "delete | promote | keep (default: keep)"
}
```

---

#### `roadmap_export`

Export roadmap to various formats.

**Input Schema:**
```json
{
  "id": "string (required)",
  "format": "json | pdf | png | markdown | csv | ical",
  "options": {
    "includeCompleted": "boolean (default: true)",
    "includeDescription": "boolean (default: true)",
    "dateFormat": "string (default: ISO)",
    "theme": "light | dark | colorful (default: light)"
  }
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "format": "pdf",
    "content": "base64-encoded-content",
    "url": "/exports/roadmap_123.pdf"
  }
}
```

---

#### `roadmap_import`

Import roadmap from external formats.

**Input Schema:**
```json
{
  "source": "json | csv | jira | github | asana | linear",
  "content": "string (optional)",
  "url": "string URL (optional)",
  "options": {
    "preserveIds": "boolean (default: false)",
    "mapAssignees": { "old": "new" },
    "defaultOwner": "string (required)"
  }
}
```

*Note: Either `content` or `url` must be provided.*

---

#### `roadmap_clone`

Clone an existing roadmap.

**Input Schema:**
```json
{
  "sourceId": "string (required)",
  "newName": "string (required)",
  "options": {
    "copyNodes": "boolean (default: true)",
    "copyProgress": "boolean (default: false)",
    "copyAssignees": "boolean (default: false)",
    "offsetDates": {
      "days": "number",
      "weeks": "number",
      "months": "number"
    },
    "newOwner": "string (optional)"
  }
}
```

---

#### `roadmap_stats`

Get comprehensive statistics about roadmap progress, velocity, and health.

**Input Schema:**
```json
{
  "id": "string (required)",
  "includeVelocity": "boolean (default: true)",
  "includeForecast": "boolean (default: false)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "overall": {
      "totalNodes": 20,
      "completedNodes": 15,
      "inProgressNodes": 3,
      "overallProgress": 75,
      "health": "excellent | good | fair | poor | critical"
    },
    "byType": {
      "milestone": { "total": 5, "completed": 4 },
      "feature": { "total": 10, "completed": 8 }
    },
    "timeline": {
      "startDate": "ISO datetime",
      "endDate": "ISO datetime",
      "daysRemaining": 30,
      "daysOverdue": 0
    },
    "velocity": {
      "weeklyAverage": 2.5,
      "trend": "improving | stable | declining"
    },
    "forecast": {
      "predictedCompletion": "ISO datetime",
      "confidence": 0.85
    }
  }
}
```

---

#### `roadmap_update_node`

Update an existing node in a roadmap.

**Input Schema:**
```json
{
  "roadmapId": "string (required)",
  "nodeId": "string (required)",
  "title": "string (optional)",
  "description": "string (optional)",
  "status": "planned | in_progress | completed | skipped (optional)",
  "startDate": "ISO datetime (optional)",
  "endDate": "ISO datetime (optional)",
  "progress": "number (0-100, optional)",
  "assignees": ["string"] (optional),
  "dependencies": ["string"] (optional)
}
```

---

### Claude Tools (12)

Claude AI integration capabilities. **Requires Pro subscription.**

#### `claude_chat`

Send a message to Claude and receive a response.

**Subscription:** Pro  
**Input Schema:**
```json
{
  "message": "string (1-100000 chars)",
  "conversationId": "string (optional)",
  "systemPrompt": "string (max 10000 chars, optional)",
  "model": "claude-3-opus | claude-3-sonnet | claude-3-haiku (default: claude-3-sonnet)",
  "temperature": "number (0-1, default: 0.7)",
  "maxTokens": "number (1-4096, optional)",
  "context": [
    { "role": "user | assistant | system", "content": "string" }
  ] (max 50 items, optional)
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "message": { "role": "assistant", "content": "string" },
    "conversationId": "string",
    "tokenUsage": {
      "inputTokens": 100,
      "outputTokens": 150,
      "totalTokens": 250,
      "estimatedCost": 0.0075
    },
    "model": "claude-3-sonnet"
  }
}
```

---

#### `claude_stream`

Start a streaming conversation with Claude.

**Subscription:** Pro  
**Input Schema:**
```json
{
  "message": "string (1-100000 chars)",
  "conversationId": "string (optional)",
  "model": "claude-3-opus | claude-3-sonnet | claude-3-haiku",
  "temperature": "number (0-1, default: 0.7)",
  "maxTokens": "number (1-4096, optional)",
  "onChunk": "string (callback reference, optional)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "streamId": "string",
    "status": "started | streaming | completed | error"
  }
}
```

---

#### `claude_analyze_file`

Analyze code or document files using Claude AI. Supports up to 100MB files.

**Subscription:** Pro  
**Input Schema:**
```json
{
  "filePath": "string",
  "analysisType": "code_review | documentation | security | general | summarize (default: general)",
  "language": "string (optional)",
  "contextFiles": ["string"] (max 10, optional),
  "questions": ["string"] (optional),
  "model": "claude-3-opus | claude-3-sonnet (default: claude-3-sonnet)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "summary": "string",
    "findings": [
      {
        "type": "string",
        "description": "string",
        "severity": "info | low | medium | high | critical"
      }
    ],
    "suggestions": ["string"],
    "tokenUsage": { /* TokenCount */ }
  }
}
```

---

#### `claude_batch_create`

Create a batch job for processing multiple requests.

**Subscription:** Pro  
**Input Schema:**
```json
{
  "requests": [
    {
      "id": "string",
      "message": "string",
      "systemPrompt": "string (optional)",
      "temperature": "number (0-1, optional)",
      "maxTokens": "number (optional)"
    }
  ] (1-100 items),
  "model": "claude-3-opus | claude-3-sonnet | claude-3-haiku (default: claude-3-haiku)",
  "webhookUrl": "string URL (optional)"
}
```

---

#### `claude_batch_status`

Check the status of a batch processing job.

**Subscription:** Pro  
**Input Schema:** `{ "batchId": "string" }`

---

#### `claude_batch_results`

Retrieve results from a completed batch job.

**Subscription:** Pro  
**Input Schema:**
```json
{
  "batchId": "string",
  "page": "number (default: 1)",
  "pageSize": "number (1-100, default: 50)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "batchId": "string",
    "results": [
      {
        "requestId": "string",
        "status": "success | error",
        "response": "any (optional)",
        "error": "string (optional)"
      }
    ]
  }
}
```

---

#### `claude_context_compress`

Compress long conversation context to reduce token usage.

**Subscription:** Pro  
**Input Schema:**
```json
{
  "conversationId": "string",
  "compressionRatio": "number (0.1-0.9, default: 0.5)",
  "preserveRecent": "number (0-20, default: 5)",
  "strategy": "summarize | extract_key_points | hierarchical (default: summarize)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "originalTokens": 1000,
    "compressedTokens": 500,
    "compressionRatio": 0.5,
    "compressedContent": "string",
    "preservedKeyPoints": ["string"]
  }
}
```

---

#### `claude_token_count`

Count tokens for text without making an API call.

**Input Schema:**
```json
{
  "text": "string",
  "model": "claude-3-opus | claude-3-sonnet | claude-3-haiku (default: claude-3-sonnet)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "inputTokens": 100,
    "outputTokens": 0,
    "totalTokens": 100,
    "estimatedCost": 0.0003
  }
}
```

---

#### `claude_usage_stats`

Get Claude API usage statistics.

**Subscription:** Pro  
**Input Schema:**
```json
{
  "startDate": "ISO datetime (optional)",
  "endDate": "ISO datetime (optional)",
  "granularity": "hour | day | week | month (default: day)"
}
```

---

#### `claude_conversation_create`

Create a new conversation context for multi-turn chats.

**Subscription:** Pro  
**Input Schema:**
```json
{
  "title": "string (optional)",
  "systemPrompt": "string (max 10000 chars, optional)",
  "model": "claude-3-opus | claude-3-sonnet | claude-3-haiku",
  "metadata": "object (optional)"
}
```

---

#### `claude_conversation_get`

Retrieve a conversation by ID with full message history.

**Subscription:** Pro  
**Input Schema:**
```json
{
  "conversationId": "string",
  "includeMetadata": "boolean (default: true)"
}
```

---

#### `claude_conversation_list`

List all conversations with pagination.

**Subscription:** Pro  
**Input Schema:**
```json
{
  "search": "string (optional)",
  "model": "claude-3-opus | claude-3-sonnet | claude-3-haiku (optional)",
  "page": "number (default: 1)",
  "pageSize": "number (1-100, default: 20)",
  "sortBy": "createdAt | updatedAt (default: updatedAt)"
}
```

---

### System Tools (12)

System health, configuration, and maintenance capabilities.

#### `system_health`

Get comprehensive system health status for all components.

**Input Schema:**
```json
{
  "detailed": "boolean (default: false)",
  "components": ["string"] (optional)
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "overall": "healthy | degraded | unhealthy | unknown",
    "components": [
      {
        "name": "string",
        "status": "healthy | degraded | unhealthy | unknown",
        "latency": "number (ms)",
        "lastChecked": "ISO datetime",
        "message": "string"
      }
    ],
    "uptime": "number (seconds)",
    "version": "string",
    "timestamp": "ISO datetime"
  }
}
```

---

#### `system_metrics`

Get real-time system metrics.

**Input Schema:**
```json
{
  "duration": "number (1-60 minutes, default: 5)",
  "components": ["cpu | memory | disk | network | all"] (default: ["all"])
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "cpu": { "usage": 45, "cores": 8, "temperature": 65 },
    "memory": { "used": 4096000, "total": 16384000, "percentage": 25 },
    "disk": { "used": 50000000, "total": 100000000, "percentage": 50 },
    "network": { "bytesIn": 1024000, "bytesOut": 512000, "connections": 42 },
    "timestamp": "ISO datetime"
  }
}
```

---

#### `system_config_get`

Retrieve system configuration values.

**Input Schema:**
```json
{
  "section": "string (optional)",
  "key": "string (optional)",
  "includeDefaults": "boolean (default: true)"
}
```

---

#### `system_config_set`

Update system configuration values.

**Input Schema:**
```json
{
  "section": "string (optional)",
  "key": "string (required)",
  "value": "any (required)",
  "validate": "boolean (default: true)",
  "restartRequired": "boolean (default: false)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "updated": true,
    "previousValue": "any",
    "restartRequired": false
  }
}
```

---

#### `system_logs`

Retrieve system logs with filtering.

**Input Schema:**
```json
{
  "level": "debug | info | warn | error | fatal (optional)",
  "component": "string (optional)",
  "search": "string (optional)",
  "startTime": "ISO datetime (optional)",
  "endTime": "ISO datetime (optional)",
  "limit": "number (1-1000, default: 100)",
  "offset": "number (default: 0)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "timestamp": "ISO datetime",
        "level": "info",
        "component": "BIOS",
        "message": "System initialized",
        "metadata": {}
      }
    ],
    "total": 1000,
    "hasMore": true
  }
}
```

---

#### `system_cache_clear`

Clear system caches selectively or entirely.

**Input Schema:**
```json
{
  "caches": ["memory | disk | redis | cdn | all"] (default: ["all"]),
  "pattern": "string (optional)"
}
```

---

#### `system_backup_create`

Create a system backup.

**Input Schema:**
```json
{
  "type": "full | incremental | partial (default: full)",
  "components": ["database | files | config | logs | all"] (default: ["all"]),
  "retention": "number (1-365 days, default: 30)",
  "compress": "boolean (default: true)",
  "encrypt": "boolean (default: false)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "id": "backup_123456",
    "type": "full",
    "size": 1073741824,
    "createdAt": "ISO datetime",
    "expiresAt": "ISO datetime",
    "status": "in_progress",
    "components": ["database", "files"]
  }
}
```

---

#### `system_backup_restore`

Restore system from a backup.

**Input Schema:**
```json
{
  "backupId": "string",
  "components": ["database | files | config | logs | all"] (default: ["all"]),
  "validate": "boolean (default: true)",
  "dryRun": "boolean (default: false)"
}
```

---

#### `system_backup_list`

List all available system backups.

**Input Schema:**
```json
{
  "type": "full | incremental | partial (optional)",
  "status": "pending | in_progress | completed | failed (optional)",
  "page": "number (default: 1)",
  "pageSize": "number (1-50, default: 20)",
  "sortBy": "createdAt | size | type (default: createdAt)",
  "sortOrder": "asc | desc (default: desc)"
}
```

---

#### `system_restart`

Restart system services or the entire system.

**Input Schema:**
```json
{
  "scope": "services | full | component (default: services)",
  "component": "string (required if scope=component)",
  "graceful": "boolean (default: true)",
  "timeout": "number (1-300 seconds, default: 60)",
  "force": "boolean (default: false)"
}
```

---

#### `system_status`

Get current system operational status.

**Input Schema:** `{ "includeHistory": "boolean (default: false)" }`

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "status": "online | offline | maintenance | degraded",
    "mode": "none | scheduled | in_progress",
    "message": "string",
    "since": "ISO datetime",
    "scheduledMaintenance": {
      "start": "ISO datetime",
      "end": "ISO datetime",
      "description": "string"
    }
  }
}
```

---

#### `system_maintenance`

Perform system maintenance tasks.

**Input Schema:**
```json
{
  "action": "start | schedule | cancel | run_task",
  "task": "cleanup | optimize | reindex | verify | update (required if action=run_task)",
  "scheduledTime": "ISO datetime (optional)",
  "duration": "number (1-1440 minutes, optional)",
  "message": "string (optional)"
}
```

---

### Analysis Tools (10)

Code analysis, architecture review, and reporting capabilities.

#### `analyze_code`

Perform static code analysis.

**Input Schema:**
```json
{
  "path": "string",
  "language": "javascript | typescript | python | java | go | rust | csharp (optional)",
  "rules": ["string"] (optional),
  "exclude": ["string"] (optional),
  "severity": ["info | low | medium | high | critical"] (default: ["low", "medium", "high", "critical"])
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalFiles": 100,
      "totalLines": 5000,
      "issuesBySeverity": { "high": 5, "medium": 10 }
    },
    "issues": [
      {
        "file": "string",
        "line": 42,
        "column": 10,
        "severity": "high",
        "rule": "unused-variable",
        "message": "string",
        "suggestion": "string"
      }
    ],
    "metrics": {
      "complexity": 15,
      "maintainability": 85,
      "duplication": 5
    }
  }
}
```

---

#### `analyze_architecture`

Analyze codebase architecture.

**Input Schema:**
```json
{
  "path": "string",
  "includeTests": "boolean (default: false)",
  "generateDiagram": "boolean (default: true)",
  "diagramType": "mermaid | plantuml | graphviz (default: mermaid)",
  "focus": ["coupling | cohesion | complexity | layers | modules"] (default: ["coupling", "cohesion"])
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "score": 85,
    "grade": "A | B | C | D | F",
    "issues": [/* ArchitectureIssue[] */],
    "recommendations": ["string"],
    "diagram": "mermaid diagram string"
  }
}
```

---

#### `analyze_dependencies`

Analyze project dependencies.

**Input Schema:**
```json
{
  "path": "string",
  "checkVulnerabilities": "boolean (default: true)",
  "checkLicenses": "boolean (default: true)",
  "checkOutdated": "boolean (default: true)",
  "severity": ["info | low | medium | high | critical"] (default: ["medium", "high", "critical"])
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "direct": [/* Dependency[] */],
    "transitive": [/* Dependency[] */],
    "vulnerabilities": [
      {
        "dependency": "string",
        "severity": "high",
        "issues": [
          {
            "id": "CVE-2024-1234",
            "description": "string",
            "fixedIn": "1.2.3"
          }
        ]
      }
    ],
    "licenses": { "MIT": ["package1", "package2"] }
  }
}
```

---

#### `analyze_performance`

Analyze code for performance bottlenecks.

**Input Schema:**
```json
{
  "path": "string",
  "type": "static | profile | benchmark (default: static)",
  "metrics": ["cpu | memory | io | network | render"] (default: ["cpu", "memory"]),
  "baseline": "string (path to baseline, optional)"
}
```

---

#### `analyze_security`

Perform security analysis.

**Input Schema:**
```json
{
  "path": "string",
  "checks": ["vulnerabilities | secrets | config | dependencies | auth | injection"] (default: ["vulnerabilities", "secrets"]),
  "severity": ["info | low | medium | high | critical"] (default: ["medium", "high", "critical"]),
  "includeTests": "boolean (default: false)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "score": 95,
    "criticalIssues": 0,
    "highIssues": 2,
    "mediumIssues": 5,
    "lowIssues": 10,
    "issues": [
      {
        "id": "SEC-001",
        "severity": "high",
        "category": "injection",
        "file": "string",
        "line": 42,
        "description": "string",
        "remediation": "string",
        "cwe": "CWE-89",
        "owasp": "A03:2021"
      }
    ],
    "secrets": [
      {
        "type": "api_key",
        "file": "string",
        "line": 10,
        "preview": "sk-***"
      }
    ]
  }
}
```

---

#### `analyze_patterns`

Detect code patterns and anti-patterns.

**Input Schema:**
```json
{
  "path": "string",
  "patterns": ["design | anti | idiom | refactoring"] (default: ["design", "anti"]),
  "languages": ["string"] (optional),
  "minConfidence": "number (0-1, default: 0.7)"
}
```

---

#### `analyze_diff`

Analyze code changes (diff) for quality and risk.

**Input Schema:**
```json
{
  "base": "string (commit/branch/tag)",
  "head": "string (commit/branch/tag)",
  "path": "string (optional)",
  "includeCoverage": "boolean (default: true)",
  "riskThreshold": "low | medium | high (default: medium)"
}
```

---

#### `analyze_coverage`

Analyze test coverage data.

**Input Schema:**
```json
{
  "path": "string",
  "reports": ["string"] (optional),
  "threshold": "number (0-100, default: 80)",
  "format": "lcov | cobertura | jacoco | json (default: lcov)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "overall": {
      "lines": 85.5,
      "functions": 90.0,
      "branches": 75.0
    },
    "files": [
      {
        "file": "src/index.js",
        "lines": { "total": 100, "covered": 90, "percentage": 90 },
        "functions": { "total": 10, "covered": 9, "percentage": 90 }
      }
    ],
    "uncovered": [
      {
        "file": "src/index.js",
        "lines": [42, 43, 44]
      }
    ]
  }
}
```

---

#### `generate_report`

Generate comprehensive analysis report.

**Input Schema:**
```json
{
  "analyses": ["code | architecture | dependencies | performance | security | coverage"] (default: ["code"]),
  "format": "html | pdf | markdown | json (default: html)",
  "output": "string (path, optional)",
  "includeHistory": "boolean (default: false)",
  "branding": {
    "title": "string (optional)",
    "logo": "string (optional)",
    "colors": {
      "primary": "string (optional)",
      "secondary": "string (optional)"
    }
  }
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "reportId": "report_123",
    "format": "html",
    "url": "/reports/report_123.html",
    "summary": "Analysis report generated in html format"
  }
}
```

---

#### `analyze_rag`

Perform RAG (Retrieval-Augmented Generation) analysis on codebase.

**Input Schema:**
```json
{
  "query": "string",
  "path": "string",
  "contextSize": "number (1-20, default: 5)",
  "similarity": {
    "minScore": "number (0-1, default: 0.7)",
    "maxResults": "number (1-50, default: 10)"
  },
  "includeCode": "boolean (default: true)"
}
```

**Output Schema:**
```json
{
  "success": true,
  "data": {
    "query": "string",
    "sources": [
      {
        "file": "string",
        "relevance": 0.95,
        "excerpt": "string"
      }
    ],
    "answer": "string",
    "confidence": 0.85
  }
}
```

---

## HTTP API Endpoints

### Health & Status

#### `GET /health`

System health check endpoint.

**Response:**
```json
{
  "healthy": true,
  "status": "running",
  "version": "5.0.0",
  "uptime": 86400000,
  "timestamp": "2026-03-23T15:00:00Z",
  "checks": {
    "bios": true,
    "database": true,
    "repositories": true,
    "tools": true,
    "http": true,
    "websocket": true
  },
  "components": {
    "bios": { "state": "OPERATIONAL", "uptime": 86400000, "components": 5 },
    "database": { "total": 10, "inUse": 2, "available": 8 },
    "tools": { "registered": 58 },
    "websocket": { "clients": 5, "rooms": 3 }
  }
}
```

**Status Codes:**
- `200` - System healthy
- `503` - System unhealthy

---

#### `GET /status`

Detailed system status.

**Response:**
```json
{
  "status": "running",
  "version": "5.0.0",
  "uptime": 86400000,
  "bios": {
    "version": "5.0.0",
    "state": "OPERATIONAL",
    "uptime": 86400000,
    "components": ["connectionPool", "repositories", "tools", "websocket"]
  },
  "timestamp": "2026-03-23T15:00:00Z"
}
```

---

### Tools API

#### `GET /tools`

List all available MCP tools.

**Response:**
```json
{
  "tools": [
    {
      "name": "task_create",
      "description": "Create a new task...",
      "tags": ["task", "create"],
      "requiresAuth": false,
      "registeredAt": "2026-03-23T10:00:00Z"
    }
  ],
  "count": 58,
  "stats": {
    "task_create": 15,
    "task_update": 8,
    "...": "..."
  }
}
```

---

#### `POST /tools/:name/execute`

Execute a specific tool.

**Request:**
```json
{
  "params": {
    "title": "New Task",
    "priority": "high"
  },
  "context": {
    "userId": "user123",
    "subscription": "pro"
  }
}
```

**Response:** Tool-specific response (see MCP Tools section)

---

### Agents API

#### `GET /agents`

List all active agents.

**Response:**
```json
{
  "agents": [
    {
      "id": "sa-00",
      "name": "Coordinator",
      "cv": "core/coordinator",
      "status": "active",
      "tasks": 42,
      "uptime": "2h 30m"
    }
  ],
  "total": 3
}
```

---

#### `POST /agents/spawn`

Spawn a new agent.

**Request:**
```json
{
  "cvId": "core/analyst",
  "options": {
    "name": "Custom Agent",
    "capabilities": ["analysis", "code_review"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "agentId": "sa-04",
  "cvId": "core/analyst",
  "status": "initializing"
}
```

---

### Clients API

#### `GET /clients`

List connected AI clients.

**Response:**
```json
{
  "clients": [
    {
      "id": "kimi",
      "name": "Kimi AI",
      "connected": true,
      "type": "AI Assistant",
      "capabilities": ["code", "analysis"],
      "lastSeen": "2026-03-23T15:00:00Z",
      "tasksActive": 2
    }
  ]
}
```

---

#### `POST /delegate`

Delegate a task to a specific client.

**Request:**
```json
{
  "to": "claude",
  "task": "Review this code for security issues",
  "priority": "high",
  "timeout": 300000
}
```

**Response:**
```json
{
  "success": true,
  "delegationId": "task-123456",
  "target": "claude",
  "status": "delegated",
  "timestamp": "2026-03-23T15:00:00Z"
}
```

---

### Updates API

#### `GET /updates`

Check for available system updates.

**Response:**
```json
{
  "current": "5.0.0",
  "available": [
    {
      "version": "5.1.0",
      "type": "minor",
      "description": "Performance improvements",
      "date": "2026-03-20"
    }
  ],
  "updateAvailable": true
}
```

---

#### `POST /updates/apply`

Apply available updates.

**Request:**
```json
{
  "version": "5.1.0",
  "backupFirst": true,
  "confirm": true
}
```

**Response:**
```json
{
  "success": true,
  "previous": "5.0.0",
  "current": "5.1.0",
  "appliedAt": "2026-03-23T15:00:00Z"
}
```

---

## WebSocket API

### Connection

Connect to the WebSocket endpoint:

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');
```

### Authentication

After connection, authenticate with a token:

```javascript
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-jwt-token'
}));
```

**Response:**
```json
{ "type": "auth_success", "id": "conn_123", "userId": "user123" }
```

Or on failure:
```json
{ "type": "auth_failed", "message": "Invalid token" }
```

### Message Types

#### `subscribe`

Subscribe to a room for targeted broadcasts:

```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  room: 'tasks'
}));
```

**Response:**
```json
{ "type": "subscribed", "room": "tasks" }
```

---

#### `unsubscribe`

Unsubscribe from a room:

```javascript
ws.send(JSON.stringify({
  type: 'unsubscribe',
  room: 'tasks'
}));
```

---

#### `broadcast`

Broadcast a message to all clients or a specific room:

```javascript
ws.send(JSON.stringify({
  type: 'broadcast',
  room: 'tasks', // optional
  payload: {
    event: 'task_created',
    data: { id: 'task_123', title: 'New Task' }
  }
}));
```

---

#### `execute_tool`

Execute a tool via WebSocket:

```javascript
ws.send(JSON.stringify({
  type: 'execute_tool',
  toolName: 'task_create',
  params: { title: 'New Task', priority: 'high' },
  requestId: 'req_123'
}));
```

**Response:**
```json
{
  "type": "tool_result",
  "requestId": "req_123",
  "result": { "success": true, "data": { ... } }
}
```

---

#### `ping`

Keep connection alive:

```javascript
ws.send(JSON.stringify({ type: 'ping' }));
```

**Response:**
```json
{ "type": "pong", "timestamp": 1711209600000 }
```

### Events

Server-initiated events:

| Event | Description | Payload |
|-------|-------------|---------|
| `connected` | Connection established | `{ id, timestamp }` |
| `auth_required` | Authentication needed | `{ message }` |
| `disconnected` | Connection closed | `{ code, reason }` |
| `error` | Error occurred | `{ message }` |
| `system:alert` | System alert | `{ level, message, component }` |
| `agent:spawned` | New agent created | `{ agentId, cvId }` |
| `agent:killed` | Agent terminated | `{ agentId }` |
| `task:delegated` | Task delegated | `{ delegationId, target, status }` |

---

## BIOS Console Commands

The BIOS Console provides an interactive command-line interface for system management.

### Command Syntax

```
command [subcommand] [options] [arguments]
```

Options can be specified as:
- `--key=value`
- `--key value`
- `-k value`

### Commands

#### `status`

Show system status overview.

```
> status
```

**Output:**
```
┌─────────────────────────────────────────┐
│           SYSTEM STATUS                 │
├─────────────────────────────────────────┤
│  Version:    5.0.0                      │
│  Uptime:     2h 30m 15s                 │
│  Memory:     156.3 MB                   │
├─────────────────────────────────────────┤
│  Agents:     3/5                        │
│  Clients:    2/3                        │
├─────────────────────────────────────────┤
│  Tasks:      42                         │
│  Timestamp:  2026-03-23T15:00:00Z       │
└─────────────────────────────────────────┘
```

---

#### `agents`

Agent management commands.

**List agents:**
```
> agents list
```

**Spawn agent:**
```
> agents spawn <cv-id>
> agents spawn core/analyst
```

**Kill agent:**
```
> agents kill <agent-id>
> agents kill sa-04
```

---

#### `clients`

Show client connections status.

```
> clients
```

**Output:**
```
┌──────────┬──────────────────┬──────────┬──────────────┬────────────────────────┬──────────┐
│ ID       │ Name             │ Status   │ Type         │ Capabilities           │ Active   │
├──────────┼──────────────────┼──────────┼──────────────┼────────────────────────┼──────────┤
│ kimi     │ Kimi AI          │ ● Online │ AI Assistant │ code,analysis          │ 0        │
│ claude   │ Claude           │ ● Online │ AI Assistant │ code,writing           │ 0        │
│ codex    │ Codex            │ ○ Offline│ Code Gen     │ code                   │ 0        │
└──────────┴──────────────────┴──────────┴──────────────┴────────────────────────┴──────────┘
```

---

#### `delegate`

Delegate a task to a specific client.

```
> delegate --to=<client> --task="<description>" [--priority=<level>]
> delegate --to=claude --task="Review authentication code" --priority=high
```

**Short form:**
```
> delegate <client> <task>
> delegate claude "Review authentication code"
```

---

#### `parallel`

Run parallel tasks across multiple clients.

```
> parallel --clients=<client1,client2,...> --task="<description>"
> parallel --clients=kimi,codex --task="Optimize database queries"
```

---

#### `chain`

Chain tasks across multiple clients (sequential execution).

```
> chain --steps='[{"client":"claude","task":"design API"},{"client":"kimi","task":"implement"}]'
```

---

#### `update`

Update management commands.

**Check for updates:**
```
> update check
```

**Apply updates:**
```
> update apply
```

---

#### `patch`

Patch management commands.

**Create patch:**
```
> patch create "Fix memory leak in agent pool"
```

**Verify patch:**
```
> patch verify <patch-id>
> patch verify patch-abc123
```

**List patches:**
```
> patch list
```

---

#### `rollback`

Rollback system to a specific version.

```
> rollback <version>
> rollback 4.9.0
```

---

#### `logs`

Show system logs.

```
> logs [--lines=<n>] [--level=<level>] [--component=<name>]
> logs --lines=100 --level=error --component=BIOS
```

---

#### `metrics`

Show system metrics.

```
> metrics
```

**Output:**
```
┌─────────────────────────────────────────┐
│           SYSTEM METRICS                │
├─────────────────────────────────────────┤
│  Uptime:           2h 30m 15s           │
│  Task Success Rate: 98.5%               │
│  Tasks Completed:  42                   │
│  Tasks Failed:     0                    │
│  Agents Spawned:   5                    │
├─────────────────────────────────────────┤
│  Memory Usage:                          │
│    RSS:      156.3 MB                   │
│    Heap:     89.2 MB                    │
├─────────────────────────────────────────┤
│  Active Agents:    3                    │
│  Connected Clients: 2                   │
└─────────────────────────────────────────┘
```

---

#### `test`

Run regression tests.

```
> test
```

**Output:**
```
┌─────────────────────────────────┬──────────┬──────────┐
│ Test                            │ Status   │ Duration │
├─────────────────────────────────┼──────────┼──────────┤
│ Agent Spawning                  │ ✓ PASS   │ 12ms     │
│ Task Delegation                 │ ✓ PASS   │ 8ms      │
│ Client Communication            │ ✓ PASS   │ 15ms     │
│ Patch Creation                  │ ✓ PASS   │ 5ms      │
│ Update Check                    │ ✓ PASS   │ 23ms     │
├─────────────────────────────────┼──────────┴──────────┤
│ Total: 5    Passed: 5   Failed: 0                     │
└─────────────────────────────────┴─────────────────────┘
```

---

#### `help`

Show available commands.

```
> help
```

---

#### `exit` / `quit`

Exit the console.

```
> exit
> quit
```

---

## JavaScript API

### CogniMeshServer

Main server class for programmatic control.

#### Constructor

```javascript
import { CogniMeshServer } from './server.js';

const server = new CogniMeshServer({
  config: { /* custom config */ },
  skipDiagnostics: false
});
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `status` | `ServerStatus` | Current server status |
| `config` | `Config` | Server configuration |
| `bios` | `CogniMeshBIOS` | BIOS instance |
| `tools` | `ToolRegistry` | Tool registry |
| `repositories` | `RepositoryFactory` | Database repositories |
| `wsServer` | `WebSocketServer` | WebSocket server |

#### Methods

##### `initialize()`

Initialize the server.

```javascript
await server.initialize();
```

**Returns:** `Promise<CogniMeshServer>`

---

##### `start()`

Start the server.

```javascript
await server.start();
```

---

##### `stop()`

Stop the server gracefully.

```javascript
await server.stop();
```

---

##### `getHealth()`

Get comprehensive health status.

```javascript
const health = server.getHealth();
console.log(health.healthy); // true/false
console.log(health.checks);  // Component health checks
```

---

### CogniMeshBIOS

BIOS firmware for system lifecycle management.

#### Constructor

```javascript
import { CogniMeshBIOS } from './bios/index.js';

const bios = new CogniMeshBIOS();
```

#### Methods

##### `boot(options)`

Execute BIOS boot sequence.

```javascript
const success = await bios.boot({
  configPath: './config.json',
  skipDiagnostics: false
});
```

---

##### `getStatus()`

Get system status.

```javascript
const status = bios.getStatus();
// Returns: { version, state, uptime, components, health, config }
```

---

##### `registerComponent(id, component)`

Register a system component.

```javascript
bios.registerComponent('myService', {
  type: 'service',
  initialize: async () => true,
  healthCheck: async () => ({ healthy: true, message: 'OK' }),
  shutdown: async () => { /* cleanup */ }
});
```

---

##### `diagnose()`

Run system diagnostics.

```javascript
const results = await bios.diagnose();
// Returns: { healthy, errors, components, timestamp }
```

---

##### `transitionTo(state, options)`

Transition to a different system mode.

```javascript
await bios.transitionTo('MAINTENANCE', { reason: 'Scheduled maintenance' });
```

States: `BOOT`, `DIAGNOSE`, `OPERATIONAL`, `MAINTENANCE`, `SAFE_MODE`

---

##### `shutdown(options)`

Graceful system shutdown.

```javascript
await bios.shutdown({ force: false });
```

---

### ToolRegistry

Central registry for MCP tools.

#### Constructor

```javascript
import { ToolRegistry } from './tools/index.js';

const registry = new ToolRegistry();
```

#### Methods

##### `register(tool)`

Register a new tool.

```javascript
import { z } from 'zod';
import { createTool, createResponseSchema } from './tools/index.js';

registry.register(createTool({
  name: 'my_tool',
  description: 'My custom tool',
  inputSchema: z.object({ name: z.string() }),
  outputSchema: createResponseSchema(z.object({ greeting: z.string() })),
  handler: async (params) => ({
    success: true,
    data: { greeting: `Hello, ${params.name}!` }
  }),
  tags: ['custom']
}));
```

---

##### `execute(name, params, context)`

Execute a registered tool.

```javascript
const result = await registry.execute('task_create', {
  title: 'New Task',
  priority: 'high'
}, {
  userId: 'user123',
  subscription: 'pro'
});

// Result: { success, data, errors, executionTime }
```

---

##### `list(filter)`

List registered tools.

```javascript
const tools = registry.list({
  tags: ['task'],
  requiresAuth: false
});
```

---

##### `get(name)` / `has(name)`

Get or check tool existence.

```javascript
const tool = registry.get('task_create');
const exists = registry.has('task_create');
```

---

##### `validateParams(name, params)`

Validate tool parameters without executing.

```javascript
const validation = registry.validateParams('task_create', {
  title: 'Test'
});
// Returns: { valid, errors, data }
```

---

##### `getStats()` / `count`

Get execution statistics.

```javascript
const stats = registry.getStats();
const total = registry.count;
```

---

### OperatorConsole

Interactive console for system management.

#### Constructor

```javascript
import { OperatorConsole } from './bios/console.js';

const console = new OperatorConsole(bios);
```

#### Methods

##### `execute(input)`

Execute a console command.

```javascript
const result = await console.execute('status');
const result = await console.execute('agents spawn core/analyst');
```

---

##### `registerCommand(name, handler, description)`

Register a custom command.

```javascript
console.registerCommand(
  'custom',
  async (args) => ({ success: true, message: 'Custom command' }),
  'My custom command'
);
```

---

##### `getCompletions(partial)`

Get command completions.

```javascript
const completions = console.getCompletions('ag');
// Returns: ['agents']
```

---

## Configuration API

### Config Class

Configuration management with environment loading.

#### Constructor

```javascript
import { Config } from './config.js';

const config = new Config({
  port: 3000,
  host: 'localhost',
  env: 'development'
});
```

#### Configuration Sections

| Section | Description | Key Options |
|---------|-------------|-------------|
| `server` | HTTP server settings | `port`, `host`, `env`, `name` |
| `paths` | File system paths | `root`, `data`, `cache`, `logs` |
| `database` | Database configuration | `path`, `maxConnections`, `busyTimeout` |
| `github` | GitHub integration | `token`, `repo`, `autoUpdate` |
| `clients` | AI client settings | `claude`, `kimi`, `codex` |
| `bios` | BIOS settings | `mode`, `logLevel`, `maxAgents` |
| `websocket` | WebSocket settings | `enabled`, `port`, `heartbeatInterval` |
| `dashboard` | Dashboard settings | `enabled`, `port`, `authEnabled` |
| `mcp` | MCP protocol settings | `idleTimeout`, `serializeToolCalls` |
| `cache` | Cache settings | `enabled`, `maxSize`, `ttl` |
| `security` | Security settings | `mode`, `jwtSecret`, `rateLimitMax` |
| `features` | Feature flags | `taskManagement`, `claudeIntegration` |

#### Methods

##### `validate()`

Validate configuration settings.

```javascript
const errors = config.validate();
if (errors.length > 0) {
  console.error('Config errors:', errors);
}
```

---

##### `get(path, defaultValue)`

Get configuration value by dot-notation path.

```javascript
const port = config.get('server.port', 3000);
const dbPath = config.get('database.path');
```

---

##### `set(path, value)`

Set configuration value.

```javascript
config.set('server.port', 8080);
config.set('features.newFeature', true);
```

---

##### `merge(config)`

Merge configuration object.

```javascript
config.merge({
  server: { port: 8080 },
  features: { taskManagement: false }
});
```

---

##### `loadFromFile(path)`

Load from JSON file.

```javascript
config.loadFromFile('./config/production.json');
```

---

##### `isFeatureEnabled(name)`

Check if feature is enabled.

```javascript
if (config.isFeatureEnabled('claudeIntegration')) {
  // Enable Claude tools
}
```

---

##### `toSafeObject()` / `toJSON()`

Get sanitized config (secrets redacted).

```javascript
console.log(config.toJSON());
// Sensitive values shown as [REDACTED]
```

---

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `COGNIMESH_PORT` | Server port | 3000 |
| `COGNIMESH_HOST` | Server host | localhost |
| `NODE_ENV` | Environment | development |
| `DATABASE_PATH` | Database file path | ./data/cognimesh.db |
| `DB_MAX_CONNECTIONS` | Max DB connections | 10 |
| `GITHUB_TOKEN` | GitHub API token | - |
| `ANTHROPIC_API_KEY` | Claude API key | - |
| `KIMI_API_KEY` | Kimi API key | - |
| `OPENAI_API_KEY` | OpenAI/Codex API key | - |
| `JWT_SECRET` | JWT signing secret | - |
| `WS_ENABLED` | Enable WebSocket | true |
| `WS_PORT` | WebSocket port | 8080 |
| `DASHBOARD_ENABLED` | Enable dashboard | true |
| `DASHBOARD_PORT` | Dashboard port | 3001 |
| `LOG_LEVEL` | Log level | info |
| `FEATURE_TASKS` | Enable task tools | true |
| `FEATURE_CLAUDE` | Enable Claude tools | true |

---

## Event API

CogniMesh uses EventEmitter for internal communication.

### CogniMeshServer Events

| Event | Description | Payload |
|-------|-------------|---------|
| `initializing` | Server initialization started | - |
| `initialized` | Server initialization complete | - |
| `initializationError` | Initialization failed | `Error` |
| `started` | Server started | - |
| `stopping` | Server stopping | - |
| `stopped` | Server stopped | - |
| `error` | Generic error | `Error` |
| `bios:boot:start` | BIOS boot started | `{ version, timestamp }` |
| `bios:boot:complete` | BIOS boot complete | `{ duration, state, components }` |
| `bios:boot:error` | BIOS boot error | `Error` |
| `system:critical` | Critical system error | `Error` |
| `ws:connection` | WebSocket client connected | `AuthenticatedSocket` |
| `ws:disconnect` | WebSocket client disconnected | `socket, code, reason` |

---

### CogniMeshBIOS Events

| Event | Description | Payload |
|-------|-------------|---------|
| `bios:boot:start` | Boot sequence started | `{ version, timestamp }` |
| `bios:boot:complete` | Boot sequence completed | `{ duration, state, components }` |
| `bios:boot:error` | Boot sequence failed | `Error` |
| `bios:config:loaded` | Configuration loaded | `config` |
| `bios:subsystems:initialized` | Subsystems initialized | - |
| `bios:diagnose:start` | Diagnostics started | - |
| `bios:diagnose:complete` | Diagnostics completed | `results` |
| `bios:safe-mode:entered` | Entered safe mode | `{ cause }` |
| `bios:component:registered` | Component registered | `{ id, type }` |
| `bios:component:unregistered` | Component unregistered | `{ id }` |
| `bios:transition:start` | State transition started | `{ from, to }` |
| `bios:transition:complete` | State transition completed | `{ from, to }` |
| `bios:transition:error` | State transition failed | `{ state, error }` |
| `bios:shutdown:start` | Shutdown started | - |
| `bios:shutdown:complete` | Shutdown completed | - |
| `system:alert` | System alert | `{ level, message, component }` |
| `system:critical` | Critical error | `Error` |

---

### UnifiedController Events

| Event | Description | Payload |
|-------|-------------|---------|
| `tool:registered` | Tool registered | `{ name, ...config }` |
| `tool:unregistered` | Tool unregistered | `{ name }` |
| `tool:executing` | Tool execution started | `ToolContext` |
| `tool:executed` | Tool execution completed | `ToolContext & { result }` |
| `tool:error` | Tool execution failed | `ToolContext & { error }` |
| `tools:cleared` | All tools cleared | - |

---

### WebSocketServer Events

| Event | Description | Payload |
|-------|-------------|---------|
| `connection` | Client connected | `AuthenticatedSocket, req` |
| `authenticated` | Client authenticated | `AuthenticatedSocket` |
| `disconnect` | Client disconnected | `socket, code, reason` |
| `message` | Message received | `socket, message` |
| `subscribe` | Client subscribed to room | `socket, room` |
| `unsubscribe` | Client unsubscribed | `socket, room` |
| `error` | Server error | `Error` |
| `close` | Server closed | - |
| `ready` | Server ready | - |
| `stopped` | Server stopped | - |

---

### OperatorConsole Events

| Event | Description | Payload |
|-------|-------------|---------|
| `command:success` | Command executed | `{ command, args, result }` |
| `command:error` | Command failed | `{ command, args, error }` |
| `agent:spawned` | Agent spawned | `{ agentId, cvId }` |
| `agent:killed` | Agent killed | `{ agentId }` |
| `task:delegated` | Task delegated | `delegation` |
| `tasks:parallel` | Parallel tasks executed | `{ clients, task, results }` |
| `tasks:chain` | Chained tasks executed | `{ steps, results }` |
| `console:exit` | Console exit requested | - |

---

## Examples

### Basic Server Setup

```javascript
import { createAndStartServer } from './server.js';

const server = await createAndStartServer({
  port: 3000,
  skipDiagnostics: false
});

console.log('Server running on port', server.config.server.port);

// Graceful shutdown
process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
```

### Custom Tool Registration

```javascript
import { z } from 'zod';
import { createTool, createResponseSchema } from './tools/index.js';

server.tools.register(createTool({
  name: 'hello_world',
  description: 'Say hello to someone',
  inputSchema: z.object({
    name: z.string().min(1),
    greeting: z.string().default('Hello')
  }),
  outputSchema: createResponseSchema(z.object({
    message: z.string()
  })),
  handler: async (params) => ({
    success: true,
    data: {
      message: `${params.greeting}, ${params.name}!`
    }
  }),
  tags: ['example', 'greeting']
}));

// Execute the tool
const result = await server.tools.execute('hello_world', {
  name: 'CogniMesh',
  greeting: 'Welcome to'
});

console.log(result.data.message); // "Welcome to, CogniMesh!"
```

### WebSocket Client

```javascript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.on('open', () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your-jwt-token'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  
  switch (message.type) {
    case 'auth_success':
      console.log('Authenticated as', message.userId);
      
      // Subscribe to task updates
      ws.send(JSON.stringify({
        type: 'subscribe',
        room: 'tasks'
      }));
      break;
      
    case 'subscribed':
      console.log('Subscribed to room:', message.room);
      break;
      
    case 'tool_result':
      console.log('Tool result:', message.result);
      break;
  }
});

// Execute a tool
ws.send(JSON.stringify({
  type: 'execute_tool',
  toolName: 'task_create',
  params: { title: 'New Task', priority: 'high' },
  requestId: 'req-123'
}));
```

### BIOS Console Usage

```javascript
import { OperatorConsole } from './bios/console.js';

const console = new OperatorConsole(server.bios);

// Execute commands programmatically
const status = await console.execute('status');
console.log(status.formatted);

const agents = await console.execute('agents list');
console.log(agents.formatted);

// Spawn a new agent
const spawn = await console.execute('agents spawn core/analyst');
console.log(spawn.message);

// Delegate a task
const delegation = await console.execute(
  'delegate --to=claude --task="Review this code" --priority=high'
);
```

---

## Client Examples

### Claude Client

The Claude client provides integration with Anthropic's Claude AI models.

**Basic Usage:**
```javascript
import { ClaudeClient } from './src/clients/claude-client.js';

const client = new ClaudeClient({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-sonnet',
  maxTokens: 4096
});

// Simple chat
const response = await client.chat({
  message: 'Explain quantum computing',
  systemPrompt: 'You are a helpful physics tutor.'
});

console.log(response.content);
```

**Streaming:**
```javascript
const stream = await client.stream({
  message: 'Write a poem about AI',
  onChunk: (chunk) => {
    process.stdout.write(chunk.content);
  }
});

await stream.complete;
```

**Vision Analysis:**
```javascript
const analysis = await client.analyzeImage({
  imagePath: './diagram.png',
  prompt: 'Describe this architecture diagram',
  analysisType: 'documentation'
});

console.log(analysis.summary);
console.log(analysis.findings);
```

**Batch Processing:**
```javascript
const batch = await client.createBatch({
  requests: [
    { id: '1', message: 'Summarize this text' },
    { id: '2', message: 'Translate to French' },
    { id: '3', message: 'Generate code' }
  ]
});

const results = await client.getBatchResults(batch.id);
```

---

### Kimi Client

The Kimi client provides integration with Moonshot's Kimi AI.

**Basic Usage:**
```javascript
import { KimiClient } from './src/clients/kimi-client.js';

const client = new KimiClient({
  apiKey: process.env.KIMI_API_KEY,
  model: 'kimi-latest'
});

// Chat completion
const response = await client.chat({
  messages: [
    { role: 'system', content: 'You are a coding assistant.' },
    { role: 'user', content: 'Write a React component' }
  ],
  temperature: 0.7
});

console.log(response.choices[0].message.content);
```

**Multi-turn Conversation:**
```javascript
const conversation = await client.createConversation({
  systemPrompt: 'You are a helpful assistant.'
});

const response1 = await conversation.send('What is TypeScript?');
const response2 = await conversation.send('How is it different from JavaScript?');

// Get conversation history
const history = conversation.getHistory();
```

**Code Completion:**
```javascript
const completion = await client.complete({
  prompt: 'function fibonacci(n) {',
  maxTokens: 100,
  stop: ['}\n']
});

console.log(completion.text);
```

**Swarm Mode:**
```javascript
const swarm = await client.createSwarm({
  agents: 3,
  task: 'Review this codebase for security issues'
});

const results = await swarm.execute();
// Results from all 3 agents
```

---

### Codex Client

The Codex client provides integration with OpenAI's Codex for code generation.

**Basic Usage:**
```javascript
import { CodexClient } from './src/clients/codex-client.js';

const client = new CodexClient({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo'
});

// Code completion
const completion = await client.complete({
  prompt: '// Create a function to reverse a string\n',
  language: 'javascript',
  maxTokens: 150
});

console.log(completion.code);
```

**Inline Edit:**
```javascript
const edit = await client.edit({
  code: 'function add(a, b) { return a + b; }',
  instruction: 'Add TypeScript types and JSDoc',
  language: 'typescript'
});

console.log(edit.code);
```

**Code Review:**
```javascript
const review = await client.review({
  code: fs.readFileSync('./src/utils.js', 'utf8'),
  context: 'This is a utility module for data processing'
});

review.issues.forEach(issue => {
  console.log(`${issue.severity}: ${issue.message} (line ${issue.line})`);
});
```

**Multi-file Context:**
```javascript
const result = await client.generate({
  files: [
    { path: 'src/types.ts', content: '...' },
    { path: 'src/api.ts', content: '...' }
  ],
  task: 'Create a React component that uses these types and API'
});

console.log(result.files);
```

---

### Multi-Client Orchestration

Execute tasks across multiple clients with different strategies.

**Single (Best Client Selection):**
```javascript
import { ClientOrchestrator } from './src/bios/orchestrator.js';

const orchestrator = new ClientOrchestrator();

// Automatically selects best client based on task
const result = await orchestrator.execute({
  task: 'Refactor this authentication code',
  strategy: 'SINGLE'
});
```

**Parallel Execution:**
```javascript
const results = await orchestrator.execute({
  task: 'Review this PR for security issues',
  strategy: 'PARALLEL',
  clients: ['claude', 'kimi', 'codex']
});

// Aggregate results from all clients
const consensus = results.consensus;
const disagreements = results.disagreements;
```

**Chained Execution:**
```javascript
const result = await orchestrator.execute({
  strategy: 'CHAINED',
  steps: [
    { client: 'kimi', task: 'Analyze this codebase structure' },
    { client: 'claude', task: 'Design improvements based on analysis' },
    { client: 'codex', task: 'Implement the design' }
  ]
});
```

**Swarm Mode:**
```javascript
const swarm = await orchestrator.execute({
  task: 'Find all bugs in this codebase',
  strategy: 'SWARM',
  swarmSize: 5,
  aggregation: 'UNION'  // or 'INTERSECTION', 'VOTE'
});
```

---

## Error Handling Guide

### Error Types

CogniMesh uses specific error classes for different failure scenarios:

| Error Class | Status Code | Description |
|-------------|-------------|-------------|
| `ValidationError` | 400 | Invalid input data |
| `AuthenticationError` | 401 | Authentication required/failed |
| `AuthorizationError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource not found |
| `ConflictError` | 409 | Resource conflict |
| `RateLimitError` | 429 | Rate limit exceeded |
| `ClientError` | 400-499 | Client-side error |
| `ServerError` | 500-599 | Server-side error |
| `ClientUnavailableError` | 503 | AI client unavailable |
| `TimeoutError` | 504 | Request timeout |

### Handling Errors

**Basic Error Handling:**
```javascript
import { 
  ValidationError, 
  NotFoundError, 
  RateLimitError 
} from './src/errors/index.js';

try {
  const result = await toolRegistry.execute('task_create', {
    title: 'New Task'
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.errors);
    // Handle validation error
  } else if (error instanceof NotFoundError) {
    console.error('Resource not found:', error.resource);
    // Handle not found
  } else if (error instanceof RateLimitError) {
    console.error('Rate limited. Retry after:', error.retryAfter);
    // Implement backoff
    await sleep(error.retryAfter * 1000);
  } else {
    console.error('Unexpected error:', error);
    throw error;
  }
}
```

**Retry with Exponential Backoff:**
```javascript
async function executeWithRetry(operation, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Don't retry on validation errors
      if (error instanceof ValidationError) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

// Usage
const result = await executeWithRetry(
  () => client.chat({ message: 'Hello' })
);
```

**Circuit Breaker Pattern:**
```javascript
import { CircuitBreaker } from './src/middleware/circuit-breaker.js';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenMaxCalls: 3
});

try {
  const result = await breaker.execute(
    () => claudeClient.chat({ message: 'Hello' })
  );
} catch (error) {
  if (error.name === 'CircuitOpenError') {
    console.error('Service temporarily unavailable');
    // Fall back to alternative
  }
}
```

**Global Error Handler:**
```javascript
// In your application initialization
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application-specific handling
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Graceful shutdown
  server.stop().then(() => process.exit(1));
});
```

### HTTP API Error Responses

All HTTP API errors follow this format:

```json
{
  "success": false,
  "errors": [
    {
      "code": "VALIDATION_ERROR",
      "message": "Title is required",
      "field": "title",
      "value": null
    }
  ],
  "executionTime": 15
}
```

**Common Error Codes:**

| Code | Description | Resolution |
|------|-------------|------------|
| `VALIDATION_ERROR` | Input validation failed | Check field requirements |
| `AUTHENTICATION_ERROR` | Missing or invalid credentials | Check API keys/tokens |
| `AUTHORIZATION_ERROR` | Insufficient permissions | Verify access rights |
| `RESOURCE_NOT_FOUND` | Requested resource doesn't exist | Check resource ID |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Implement retry with backoff |
| `CLIENT_UNAVAILABLE` | AI client is offline | Check client status |
| `TIMEOUT_ERROR` | Request timed out | Increase timeout or reduce complexity |
| `INTERNAL_ERROR` | Server error | Contact support |

---

## Rate Limiting

CogniMesh implements token bucket rate limiting to ensure fair usage and system stability.

### Rate Limit Tiers

| Endpoint Type | Requests | Window | Per-Client |
|---------------|----------|--------|------------|
| Default | 100 | 15 minutes | No |
| Authentication | 10 | 1 minute | Yes |
| Claude API | 30 | 1 minute | Yes |
| Admin | 20 | 15 minutes | Yes |
| Tools | 50 | 15 minutes | Yes |

### Rate Limit Headers

All responses include rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1711209600
Retry-After: 900  (only on 429 responses)
```

### Handling Rate Limits

**Client-Side Handling:**
```javascript
async function makeRequest(url, options) {
  const response = await fetch(url, options);
  
  // Check rate limit headers
  const limit = response.headers.get('X-RateLimit-Limit');
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const reset = response.headers.get('X-RateLimit-Reset');
  
  console.log(`Rate limit: ${remaining}/${limit}, resets at ${new Date(reset * 1000)}`);
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
    await sleep(retryAfter * 1000);
    return makeRequest(url, options);  // Retry
  }
  
  return response;
}
```

**Preemptive Rate Limiting:**
```javascript
class RateLimitAwareClient {
  constructor() {
    this.limits = new Map();
  }
  
  async execute(toolName, params) {
    const limit = this.limits.get(toolName);
    
    if (limit && limit.remaining === 0) {
      const waitTime = limit.reset * 1000 - Date.now();
      if (waitTime > 0) {
        console.log(`Waiting ${waitTime}ms for rate limit reset...`);
        await sleep(waitTime);
      }
    }
    
    const result = await toolRegistry.execute(toolName, params);
    
    // Update rate limit tracking
    if (result.rateLimit) {
      this.limits.set(toolName, result.rateLimit);
    }
    
    return result;
  }
}
```

### Configuration

**Custom Rate Limits:**
```javascript
import { rateLimitMiddleware } from './src/middleware/rate-limit.js';

// Apply custom rate limit to specific route
app.use('/api/custom', rateLimitMiddleware({
  windowMs: 60000,  // 1 minute
  max: 50,          // 50 requests
  perClient: true
}));

// Different limits for different clients
app.use('/api/claude', rateLimitMiddleware('claude', { perClient: true }));
app.use('/api/kimi', rateLimitMiddleware({ windowMs: 60000, max: 60 }));
```

**Rate Limit Status:**
```javascript
import { getRateLimitStatus } from './src/middleware/rate-limit.js';

// Get current rate limit status
const status = getRateLimitStatus('client-123');
console.log(status);
// {
//   limit: 100,
//   remaining: 87,
//   reset: 1711209600,
//   window: 900000
// }
```

### Best Practices

1. **Monitor Rate Limits** - Always check `X-RateLimit-Remaining` header
2. **Implement Backoff** - Use exponential backoff when rate limited
3. **Cache Responses** - Cache results to reduce API calls
4. **Batch Requests** - Use batch operations when available
5. **Distribute Load** - Use different API keys for different workloads

---

## See Also

- [PROJECT_STATUS.md](./PROJECT_STATUS.md) - Project status and architecture
- [README.md](./README.md) - Getting started guide
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [CHANGELOG.md](./CHANGELOG.md) - Version history
- `/src/domains/*/CONTRACT.md` - Domain-specific contracts

---

*CogniMesh v5.0 - Multi-Agent Orchestration Platform*  
*Copyright (c) 2026 CogniMesh Team*
