# Tools Module Contract

## Overview

The Tools Module provides the MCP (Model Context Protocol) tool registry and definitions for CogniMesh v5.0. It manages tool registration, execution, validation, and provides built-in tool definitions for various operations.

## Public Interfaces

### ToolRegistry

Central registry for MCP tools.

```javascript
import { ToolRegistry } from './tools/index.js';

const registry = new ToolRegistry();
```

**Methods:**

- `constructor()` - Creates tool registry

- `register(tool)` - Registers a tool
  - `tool.name` - Tool name
  - `tool.description` - Tool description
  - `tool.inputSchema` - Zod input schema
  - `tool.outputSchema` - Zod output schema
  - `tool.handler` - Handler function
  - `tool.tags` - Tool tags
  - `tool.requiresAuth` - Auth requirement
  - `tool.subscription` - Required subscription
  - Returns: ToolRegistry (chainable)
  - Throws: Error if tool exists

- `unregister(name)` - Unregisters a tool
  - `name` (string) - Tool name
  - Returns: boolean

- `list(filter)` - Lists registered tools
  - `filter.tags` - Filter by tags
  - `filter.requiresAuth` - Filter by auth
  - `filter.subscription` - Filter by subscription
  - Returns: ToolDefinition[]

- `get(name)` - Gets tool by name
  - Returns: ToolDefinition | undefined

- `has(name)` - Checks if tool exists
  - Returns: boolean

- `execute(name, params, context)` - Executes tool
  - `name` (string) - Tool name
  - `params` (Object) - Tool parameters
  - `context.userId` - User ID
  - `context.subscription` - User subscription
  - Returns: Promise<ToolResult>

- `validateParams(name, params)` - Validates parameters
  - Returns: ValidationResult

- `getStats()` - Returns execution statistics
  - Returns: Record<string, number>

- `get count` - Returns tool count
  - Returns: number

- `clear()` - Clears all tools
  - Returns: void

### createTool

Factory function for creating tool definitions.

```javascript
import { createTool } from './tools/index.js';

const tool = createTool({
  name: 'example_tool',
  description: 'An example tool',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  handler: async (params, context) => {
    return { result: 'success' };
  }
});
```

### createResponseSchema

Creates standardized response schema.

```javascript
import { createResponseSchema } from './tools/index.js';

const responseSchema = createResponseSchema(
  z.object({ data: z.string() })
);
// Returns: z.object({ success, data, errors, executionTime })
```

### Tool Definitions

Built-in tool definitions available in `./tools/definitions/`.

**Analysis Tools**
- `analyze_code` - Code analysis
- `analyze_architecture` - Architecture analysis

**Claude Tools**
- `claude_chat` - Chat with Claude
- `claude_complete` - Text completion
- `claude_stream` - Streaming response

**Task Tools**
- `create_task` - Create new task
- `update_task` - Update task
- `delete_task` - Delete task
- `list_tasks` - List tasks

**System Tools**
- `get_status` - System status
- `get_metrics` - System metrics
- `execute_command` - Execute shell command

**Roadmap Tools**
- `create_roadmap` - Create roadmap
- `update_roadmap` - Update roadmap
- `get_progress` - Get progress

## Data Structures

### ToolDefinition

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  handler: (params: any, context: ToolContext) => Promise<any>;
  tags: string[];
  requiresAuth: boolean;
  subscription?: string;
  registeredAt: string;
}
```

### ToolContext

```typescript
interface ToolContext {
  userId?: string;
  subscription?: string;
  socketId?: string;
  requestId?: string;
  timestamp: string;
}
```

### ToolResult

```typescript
interface ToolResult {
  success: boolean;
  data: any;
  errors?: string[];
  executionTime: number;
}
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: any;
}
```

## Events

The Tools module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `tool:registered` | `{ tool }` | Tool registered |
| `tool:unregistered` | `{ name }` | Tool unregistered |
| `tool:executed` | `{ name, result }` | Tool executed |
| `tool:error` | `{ name, error }` | Tool error |
| `tool:validation_failed` | `{ name, errors }` | Validation failed |

## Error Handling

### ToolError

Base error for tool operations.

### ToolNotFoundError

Thrown when tool doesn't exist.

### ToolValidationError

Thrown when parameter validation fails.

### ToolExecutionError

Thrown when tool execution fails.

### ToolSubscriptionError

Thrown when subscription requirement not met.

## Usage Example

```javascript
import { ToolRegistry, createTool } from './tools/index.js';
import { z } from 'zod';

const registry = new ToolRegistry();

// Register a tool
registry.register(createTool({
  name: 'greet',
  description: 'Greets a user',
  inputSchema: z.object({
    name: z.string().min(1),
    greeting: z.string().optional()
  }),
  outputSchema: z.object({
    message: z.string()
  }),
  handler: async (params) => {
    return {
      message: `${params.greeting || 'Hello'}, ${params.name}!`
    };
  },
  tags: ['greeting', 'simple']
}));

// Execute tool
const result = await registry.execute('greet', {
  name: 'World',
  greeting: 'Hi'
}, { userId: 'user-123' });

console.log(result.data.message);  // "Hi, World!"
```
