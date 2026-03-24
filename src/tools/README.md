# Tools Module

## Overview

The Tools Module provides the MCP (Model Context Protocol) implementation for CogniMesh v5.0. It manages tool registration, validation, execution, and provides a comprehensive set of built-in tool definitions for various system operations.

## Architecture

### Registry Pattern

```
┌─────────────────────────────────────────────────────────┐
│                    ToolRegistry                          │
├─────────────────────────────────────────────────────────┤
│  Map<string, ToolDefinition>                            │
│  - Validation (Zod schemas)                             │
│  - Execution (handler functions)                        │
│  - Statistics (execution counts)                        │
└─────────────────────────────────────────────────────────┘
                           ↓
              ┌────────────┼────────────┐
              ↓            ↓            ↓
        Analysis    Claude Tools    System
           ↓            ↓            ↓
        Tasks      Roadmap Tools   Others
```

### Tool Execution Flow

```
Tool Call → Registry.lookup → Validation → Handler → Result
                              ↓
                        Subscription Check
```

## Components

### ToolRegistry

Central tool management:

- **Registration**: Add new tools with schemas
- **Validation**: Validate inputs against schemas
- **Execution**: Route calls to handlers
- **Statistics**: Track execution metrics
- **Subscription**: Handle access control

### Tool Definitions

Built-in tool categories:

**Analysis Tools**
- Code analysis and review
- Architecture analysis
- Pattern detection

**Claude Tools**
- Chat and conversation
- Text completion
- Streaming responses
- Vision capabilities

**Task Tools**
- Task CRUD operations
- Status management
- Priority/quadrant updates
- Bulk operations

**Roadmap Tools**
- Roadmap management
- Progress tracking
- Phase/milestone control

**System Tools**
- System status and metrics
- Command execution
- Configuration management

## Usage

### Registry Setup

```javascript
import { ToolRegistry } from './tools/index.js';
import { allTools } from './tools/definitions/index.js';

const registry = new ToolRegistry();

// Register built-in tools
for (const tool of allTools) {
  registry.register(tool);
}

console.log(`Registered ${registry.count} tools`);

// Get tool list
const tools = registry.list();
console.log('Available tools:', tools.map(t => t.name));
```

### Creating Custom Tools

```javascript
import { createTool, createResponseSchema } from './tools/index.js';
import { z } from 'zod';

// Define input schema
const inputSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.any().optional()
});

// Define output schema
const outputSchema = createResponseSchema(
  z.object({
    status: z.number(),
    headers: z.record(z.string()),
    body: z.any()
  })
);

// Create tool
const httpTool = createTool({
  name: 'http_request',
  description: 'Makes HTTP requests to external APIs',
  inputSchema,
  outputSchema,
  handler: async (params, context) => {
    const response = await fetch(params.url, {
      method: params.method,
      headers: params.headers,
      body: params.body ? JSON.stringify(params.body) : undefined
    });
    
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.json()
    };
  },
  tags: ['http', 'external-api'],
  requiresAuth: true
});

// Register
registry.register(httpTool);
```

### Tool Execution

```javascript
// Execute with validation
const result = await registry.execute(
  'create_task',
  {
    title: 'Review code',
    priority: 'high',
    quadrant: 'do_first'
  },
  {
    userId: 'user-123',
    subscription: 'premium'
  }
);

if (result.success) {
  console.log('Task created:', result.data);
} else {
  console.error('Failed:', result.errors);
}

// Check execution time
console.log(`Executed in ${result.executionTime}ms`);
```

### Parameter Validation

```javascript
// Validate before execution
const validation = registry.validateParams('create_task', {
  title: '',  // Invalid: empty string
  priority: 'invalid'  // Invalid: not in enum
});

if (!validation.valid) {
  console.log('Validation errors:');
  validation.errors.forEach(error => {
    console.log(`  - ${error}`);
  });
}
```

### Tool Filtering

```javascript
// List all tools
const allTools = registry.list();

// Filter by tag
const httpTools = registry.list({ tags: ['http'] });

// Filter by auth requirement
const publicTools = registry.list({ requiresAuth: false });

// Filter by subscription
const premiumTools = registry.list({ subscription: 'premium' });
```

### Statistics

```javascript
// Get execution stats
const stats = registry.getStats();
for (const [toolName, count] of Object.entries(stats)) {
  console.log(`${toolName}: ${count} executions`);
}

// Most used tools
const topTools = Object.entries(stats)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);
```

### Built-in Tools Usage

```javascript
// Analysis tools
const analysis = await registry.execute('analyze_code', {
  code: sourceCode,
  language: 'javascript',
  focus: ['performance', 'security']
});

// Task tools
const task = await registry.execute('create_task', {
  title: 'Implement feature',
  description: 'Add new authentication flow',
  priority: 'high',
  quadrant: 'do_first',
  dueDate: '2024-02-01'
});

// Roadmap tools
const roadmap = await registry.execute('create_roadmap', {
  title: 'Q1 Goals',
  phases: [
    { name: 'Planning', milestones: ['Requirements'] },
    { name: 'Development', milestones: ['MVP', 'Beta'] }
  ]
});

// System tools
const status = await registry.execute('get_status', {});
const metrics = await registry.execute('get_metrics', {
  category: 'performance'
});
```

## Configuration

### Registry Configuration

```javascript
{
  // Tool defaults
  defaultTimeout: 30000,
  maxRetries: 3,
  
  // Validation
  strictValidation: true,
  coerceTypes: true,
  
  // Execution
  enableMetrics: true,
  logExecutions: true,
  
  // Security
  requireAuthByDefault: false,
  defaultSubscription: null
}
```

### Tool Definition Structure

```javascript
{
  // Required
  name: 'tool_name',  // Unique identifier
  description: 'What this tool does',
  inputSchema: z.ZodSchema,  // Input validation
  outputSchema: z.ZodSchema,  // Output validation
  handler: async (params, context) => {  // Implementation
    return result;
  },
  
  // Optional
  tags: ['category1', 'category2'],
  requiresAuth: true,
  subscription: 'premium',
  timeout: 30000,
  retries: 3
}
```

## Best Practices

1. **Schema Validation**: Always define strict schemas
2. **Error Handling**: Handle errors gracefully in handlers
3. **Timeouts**: Set appropriate timeouts for operations
4. **Documentation**: Write clear descriptions
5. **Tagging**: Tag tools for organization
6. **Subscription Tiers**: Use subscription for access control
7. **Metrics**: Enable execution tracking
8. **Testing**: Test tools thoroughly before registration
