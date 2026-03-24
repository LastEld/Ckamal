# Validation Module

## Overview

The Validation Module provides centralized data validation for CogniMesh v5.0 using Zod schemas. It offers a schema registry, built-in validation schemas for common data types, error aggregation, and middleware support for Express/Fastify applications.

## Architecture

### Validation Flow

```
Input Data → Schema Lookup → Zod Validation → Result
                              ↓
                    (Error Aggregation)
```

### Module Structure

```
validation/
├── index.js           # Validation manager
└── schemas.js         # Built-in schemas
```

## Components

### ValidationSchemas

Central validation manager:

- **Schema Registry**: Named schema storage
- **Category Organization**: Group schemas by category
- **Validation Methods**: Multiple validation modes
- **Error Aggregation**: Collect all validation errors
- **Metadata Tracking**: Schema documentation

### ValidationError

Enhanced error class:

- **Issue Aggregation**: Collects all validation issues
- **Field Grouping**: Groups errors by field path
- **Formatted Output**: Human-readable error messages
- **JSON Serialization**: Export errors as JSON

### Built-in Schemas

Comprehensive schema library:

**Task Schemas**
- Task creation/update validation
- Query parameter validation
- ID format validation

**Roadmap Schemas**
- Roadmap structure validation
- Phase/milestone validation
- Progress data validation

**User Schemas**
- Registration/login validation
- Profile update validation
- Preferences validation

**Context Schemas**
- Context creation/update
- Message format validation

**Alert Schemas**
- Alert creation/update
- Configuration validation

**Claude Schemas**
- API request validation
- Message format validation
- Tool definition validation

**System Schemas**
- Configuration validation
- Health check formats
- Metrics formats

**WebSocket Schemas**
- Connection parameters
- Message formats
- Event formats

## Usage

### Basic Validation

```javascript
import { ValidationSchemas } from './validation/index.js';

const validator = new ValidationSchemas();

// Validate using built-in schema
const result = validator.validate({
  title: 'New Task',
  priority: 'high',
  status: 'pending'
}, 'task.create');

if (result.success) {
  console.log('Valid:', result.data);
} else {
  console.log('Errors:', result.error.issues);
}
```

### Custom Schema Registration

```javascript
import { z } from 'zod';

// Define schema
const projectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  deadline: z.string().datetime().optional(),
  members: z.array(z.string().email()).min(1)
});

// Register
validator.register('project.create', projectSchema, {
  description: 'Project creation schema',
  category: 'project'
});

// Use
const result = validator.validate(projectData, 'project.create');
```

### Async Validation

```javascript
// For schemas with async refinements
const result = await validator.validateAsync({
  email: 'user@example.com'
}, 'user.create');

if (!result.success) {
  // Handle async validation errors
}
```

### Partial Validation

```javascript
// For PATCH operations
const result = validator.validatePartial({
  status: 'completed'  // Only updating status
}, 'task.update');

// Validates only provided fields
```

### Error Handling

```javascript
const result = validator.validate(invalidData, 'task.create');

if (!result.success) {
  // Access error details
  console.log('Message:', result.error.message);
  console.log('Issues:', result.error.issues);
  
  // Field-specific errors
  for (const [path, errors] of Object.entries(result.error.fieldErrors)) {
    console.log(`${path}: ${errors.join(', ')}`);
  }
  
  // JSON export
  const jsonErrors = result.error.toJSON();
}
```

### Express Middleware

```javascript
import express from 'express';
import { createValidator } from './validation/index.js';

const app = express();
app.use(express.json());

// Create validators
const validateTaskBody = createValidator('task.create', 'body');
const validateTaskQuery = createValidator('task.query', 'query');
const validateTaskParams = createValidator('task.id', 'params');

// Routes with validation
app.post('/tasks', validateTaskBody, (req, res) => {
  // req.validatedBody contains validated data
  const task = createTask(req.validatedBody);
  res.status(201).json(task);
});

app.get('/tasks', validateTaskQuery, (req, res) => {
  const tasks = listTasks(req.validatedQuery);
  res.json(tasks);
});

app.get('/tasks/:id', validateTaskParams, (req, res) => {
  const task = getTask(req.validatedParams.id);
  res.json(task);
});
```

### Schema Management

```javascript
// List all schemas
const allSchemas = validator.list();
console.log('Available schemas:', allSchemas);

// List by category
const taskSchemas = validator.listByCategory('task');
const userSchemas = validator.listByCategory('user');

// Get all categories
const categories = validator.getCategories();

// Get schema metadata
const meta = validator.getMetadata('task.create');
console.log('Description:', meta.description);

// Check existence
if (validator.has('task.create')) {
  // Schema exists
}

// Unregister
validator.unregister('custom.schema');
```

### Quick Validation

```javascript
import { validate, schemas } from './validation/index.js';

// Direct validation without registry
const result = validate(data, schemas.taskCreateSchema);

if (result.success) {
  // Use validated data
}
```

## Configuration

### Validation Options

```javascript
{
  // Error handling
  includePath: true,
  includeCode: true,
  
  // Coercion
  coerceTypes: true,
  
  // Stripping
  stripUnknown: false,
  strict: false
}
```

### Schema Categories

Built-in categories:
- `task` - Task-related schemas
- `roadmap` - Roadmap schemas
- `user` - User schemas
- `context` - Context schemas
- `alert` - Alert schemas
- `claude` - Claude API schemas
- `system` - System schemas
- `pagination` - Pagination schemas
- `websocket` - WebSocket schemas

## Best Practices

1. **Use Registry**: Register schemas for reuse
2. **Add Metadata**: Document schemas with descriptions
3. **Categorize**: Group related schemas
4. **Validate Early**: Validate at entry points
5. **Handle Errors**: Provide clear error messages
6. **Partial Updates**: Use validatePartial for PATCH
7. **Async Validation**: Use validateAsync when needed
8. **Type Safety**: Leverage Zod type inference
