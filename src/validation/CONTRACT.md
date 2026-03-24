# Validation Module Contract

## Overview

The Validation Module provides centralized validation with Zod integration for CogniMesh v5.0. It includes a validation manager, built-in schemas, error aggregation, and middleware support for Express/Fastify.

## Public Interfaces

### ValidationSchemas

Main validation manager class.

```javascript
import { ValidationSchemas } from './validation/index.js';

const validator = new ValidationSchemas();
```

**Methods:**

- `constructor()` - Creates validation manager
  - Registers built-in schemas

- `register(name, schema, metadata)` - Registers schema
  - `name` (string) - Schema identifier
  - `schema` (z.ZodSchema) - Zod schema
  - `metadata.description` - Schema description
  - `metadata.category` - Schema category
  - Returns: ValidationSchemas (chainable)
  - Throws: Error if name exists

- `unregister(name)` - Unregisters schema
  - `name` (string) - Schema name
  - Returns: boolean

- `get(name)` - Gets registered schema
  - `name` (string) - Schema name
  - Returns: z.ZodSchema | undefined

- `getMetadata(name)` - Gets schema metadata
  - Returns: SchemaMetadata | undefined

- `has(name)` - Checks if schema exists
  - Returns: boolean

- `list()` - Lists all schema names
  - Returns: string[]

- `listByCategory(category)` - Lists schemas in category
  - Returns: string[]

- `getCategories()` - Gets all categories
  - Returns: string[]

- `validate(data, schemaName)` - Validates data
  - `data` (any) - Data to validate
  - `schemaName` (string) - Schema name
  - Returns: ValidationResult

- `validateWithSchema(data, schema)` - Validates with schema directly
  - Returns: ValidationResult

- `validateAsync(data, schemaName)` - Validates asynchronously
  - Returns: Promise<ValidationResult>

- `validatePartial(data, schemaName)` - Validates partial data
  - Returns: ValidationResult

- `assert(data, schemaName)` - Validates and throws on error
  - Returns: any
  - Throws: ValidationError

### ValidationError

Error class with aggregated issues.

- `constructor(message, issues)` - Creates validation error
  - `message` (string) - Error message
  - `issues` (ValidationIssue[]) - Validation issues

- `issues` - Array of validation issues

- `fieldErrors` - Errors grouped by field path

- `toString()` - Formats error message
  - Returns: string

- `toJSON()` - Returns JSON-serializable errors
  - Returns: Record<string, string[]>

### validate

Quick validation helper function.

```javascript
import { validate } from './validation/index.js';

const result = validate(data, schema);
```

### createValidator

Creates Express/Fastify middleware.

```javascript
import { createValidator } from './validation/index.js';

const validateBody = createValidator('task.create', 'body');
app.post('/tasks', validateBody, handler);
```

### schemas

Built-in schema exports from `./validation/schemas.js`.

**Task Schemas**
- `taskCreateSchema` - Task creation
- `taskUpdateSchema` - Task update
- `taskQuerySchema` - Task queries
- `taskIdSchema` - Task ID validation

**Roadmap Schemas**
- `roadmapCreateSchema` - Roadmap creation
- `roadmapUpdateSchema` - Roadmap update
- `milestoneSchema` - Milestone validation

**User Schemas**
- `userCreateSchema` - User registration
- `userUpdateSchema` - User update
- `userLoginSchema` - User login
- `userPreferencesSchema` - Preferences

**Context Schemas**
- `contextCreateSchema` - Context creation
- `contextUpdateSchema` - Context update
- `contextMessageSchema` - Message validation

**Alert Schemas**
- `alertCreateSchema` - Alert creation
- `alertUpdateSchema` - Alert update
- `alertConfigSchema` - Alert config

**Claude Schemas**
- `claudeRequestSchema` - API request
- `claudeMessageSchema` - Message
- `claudeToolSchema` - Tool definition

**System Schemas**
- `systemConfigSchema` - System config
- `systemHealthSchema` - Health check
- `systemMetricsSchema` - Metrics

**Pagination Schemas**
- `paginationParamsSchema` - Pagination params
- `paginationResponseSchema` - Paginated response

**WebSocket Schemas**
- `websocketConnectSchema` - Connection params
- `websocketMessageSchema` - Message
- `websocketEventSchema` - Event

## Data Structures

### ValidationResult

```typescript
interface ValidationResult {
  success: boolean;
  data?: any;
  error?: ValidationError;
  issues?: ValidationIssue[];
}
```

### ValidationIssue

```typescript
interface ValidationIssue {
  path: (string | number)[];
  message: string;
  code: string;
}
```

### SchemaMetadata

```typescript
interface SchemaMetadata {
  name: string;
  description: string;
  category: string;
  createdAt: string;
}
```

## Events

The Validation module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `schema:registered` | `{ name, metadata }` | Schema registered |
| `schema:unregistered` | `{ name }` | Schema unregistered |
| `validation:success` | `{ schema, data }` | Validation passed |
| `validation:error` | `{ schema, error }` | Validation failed |

## Error Handling

### ValidationError

Main validation error class.

- Aggregates all validation issues
- Groups errors by field path
- Provides formatted error messages
- Supports JSON serialization

## Usage Example

```javascript
import { ValidationSchemas, createValidator } from './validation/index.js';
import { z } from 'zod';

const validator = new ValidationSchemas();

// Register custom schema
validator.register('custom.task', z.object({
  title: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high'])
}), {
  description: 'Custom task schema',
  category: 'custom'
});

// Validate data
const result = validator.validate({
  title: 'New Task',
  priority: 'high'
}, 'custom.task');

if (!result.success) {
  console.log('Errors:', result.error.fieldErrors);
} else {
  console.log('Valid data:', result.data);
}

// Express middleware
import express from 'express';
const app = express();

const validateTask = createValidator('task.create', 'body');
app.post('/tasks', validateTask, (req, res) => {
  // req.validatedBody contains validated data
  res.json({ task: req.validatedBody });
});
```
