# Middleware Module Contract

## Overview

The Middleware Module provides Express/Fastify middleware for CogniMesh v5.0. It includes authentication, authorization (ACL), permissions, audit logging, circuit breakers, metrics, and orchestration middleware.

## Public Interfaces

### AuthMiddleware

Authentication middleware.

```javascript
import { AuthMiddleware, AUTH_MODES } from './middleware/index.js';

const auth = new AuthMiddleware({
  mode: AUTH_MODES.JWT,
  secret: process.env.JWT_SECRET
});
```

**Methods:**

- `constructor(options)` - Creates auth middleware
  - `options.mode` - Auth mode ('jwt', 'session', 'apikey')
  - `options.secret` - Secret key
  - `options.tokenExpiry` - Token expiry time

- `middleware(req, res, next)` - Express middleware function

- `generateToken(payload)` - Generates JWT token
  - Returns: string

- `verifyToken(token)` - Verifies JWT token
  - Returns: Payload | null

- `getAuthMiddleware()` - Returns singleton instance
  - Returns: AuthMiddleware

### ACLMiddleware

Access control list middleware.

- `constructor(options)` - Creates ACL middleware
  - `options.roles` - Role definitions
  - `options.permissions` - Permission mappings

- `middleware(req, res, next)` - Express middleware

- `checkPermission(user, resource, action)` - Checks permission
  - Returns: boolean

- `addRole(role, permissions)` - Adds role
  - Returns: void

- `removeRole(role)` - Removes role
  - Returns: boolean

### PermissionChecker

Fine-grained permission checking.

- `constructor(options)` - Creates checker

- `check(user, resource, action, conditions)` - Checks with conditions
  - `conditions` - Additional conditions
  - Returns: boolean

- `addCondition(name, fn)` - Adds custom condition
  - Returns: void

### AuditMiddleware

Audit logging middleware.

- `constructor(options)` - Creates audit middleware
  - `options.logger` - Logger instance
  - `options.includeBody` - Log request body

- `middleware(req, res, next)` - Express middleware

- `log(event, data)` - Logs audit event
  - Returns: void

- `getAuditMiddleware()` - Returns singleton instance
  - Returns: AuditMiddleware

### CircuitBreaker

Circuit breaker pattern implementation.

- `constructor(options)` - Creates circuit breaker
  - `options.failureThreshold` - Threshold for opening
  - `options.resetTimeout` - Timeout before half-open

- `execute(fn)` - Executes with circuit breaker
  - Returns: Promise<any>

- `getState()` - Returns current state
  - Returns: CircuitState

- `getCircuitBreaker(name)` - Returns named breaker
  - Returns: CircuitBreaker

- `resetCircuitBreaker(name)` - Resets breaker
  - Returns: void

### MetricsMiddleware

Request metrics collection.

- `constructor(options)` - Creates metrics middleware
  - `options.prefix` - Metric name prefix

- `middleware(req, res, next)` - Express middleware

- `getMetrics()` - Returns collected metrics
  - Returns: Metrics

- `resetMetrics()` - Resets metrics
  - Returns: void

### OrchestrationMiddleware

Request orchestration middleware.

- `constructor(options)` - Creates orchestration middleware

- `middleware(req, res, next)` - Express middleware

- `addTransform(transform)` - Adds request/response transform
  - Returns: void

- `addPipeline(pipeline)` - Adds processing pipeline
  - Returns: void

## Data Structures

### AuthConfig

```typescript
interface AuthConfig {
  mode: 'jwt' | 'session' | 'apikey';
  secret: string;
  tokenExpiry?: number;
  refreshExpiry?: number;
  algorithms?: string[];
}
```

### ACLConfig

```typescript
interface ACLConfig {
  roles: Record<string, string[]>;
  resources: Record<string, string[]>;
  permissions: PermissionRule[];
}
```

### PermissionRule

```typescript
interface PermissionRule {
  role: string;
  resource: string;
  actions: string[];
  conditions?: Condition[];
}
```

### AuditEvent

```typescript
interface AuditEvent {
  timestamp: string;
  userId?: string;
  action: string;
  resource: string;
  result: 'success' | 'failure';
  details?: Record<string, any>;
}
```

### CircuitState

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}
```

### Metrics

```typescript
interface Metrics {
  requestCount: number;
  requestDuration: Histogram;
  requestSize: Histogram;
  responseSize: Histogram;
  errorRate: number;
}
```

## Events

The Middleware module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `auth:success` | `{ user, token }` | Authentication success |
| `auth:failure` | `{ error }` | Authentication failure |
| `access:denied` | `{ user, resource, action }` | Access denied |
| `audit:log` | `{ event }` | Audit event logged |
| `circuit:open` | `{ name }` | Circuit opened |
| `circuit:close` | `{ name }` | Circuit closed |
| `metrics:collected` | `{ metrics }` | Metrics collected |

## Error Handling

### AuthError

Thrown when authentication fails.

### ACLError

Thrown when access is denied.

### PermissionError

Thrown when permission check fails.

### AuditError

Thrown when audit logging fails.

### CircuitBreakerError

Thrown when circuit is open.

### OrchestrationError

Thrown when orchestration fails.

## Usage Example

```javascript
import express from 'express';
import { 
  AuthMiddleware, 
  ACLMiddleware,
  AuditMiddleware,
  CircuitBreaker
} from './middleware/index.js';

const app = express();

// Auth middleware
const auth = new AuthMiddleware({
  mode: 'jwt',
  secret: process.env.JWT_SECRET
});
app.use(auth.middleware);

// ACL middleware
const acl = new ACLMiddleware({
  roles: {
    admin: ['read', 'write', 'delete'],
    user: ['read', 'write']
  }
});
app.use(acl.middleware);

// Audit middleware
const audit = new AuditMiddleware({
  includeBody: false
});
app.use(audit.middleware);

// Circuit breaker
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000
});

app.get('/api/data', async (req, res) => {
  const result = await breaker.execute(() => fetchData());
  res.json(result);
});
```
