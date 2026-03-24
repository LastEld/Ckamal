# Middleware Module

## Overview

The Middleware Module provides essential Express/Fastify middleware components for CogniMesh v5.0. It handles cross-cutting concerns including authentication, authorization, audit logging, circuit breakers, metrics collection, and request orchestration.

## Architecture

### Middleware Stack

```
Request → Auth → ACL → Audit → Circuit Breaker → Metrics → Orchestration → Handler
              ↓
         Response ← Metrics ← Audit
```

### Component Structure

```
middleware/
├── auth.js              # JWT/Session/API key auth
├── auth-permissions.js  # Permission checking
├── acl.js               # Access control lists
├── audit.js             # Audit logging
├── circuit-breaker.js   # Circuit breaker pattern
├── metrics.js           # Metrics collection
└── orchestration.js     # Request orchestration
```

## Components

### AuthMiddleware

Authentication handling:

- **JWT Auth**: Token-based authentication
- **Session Auth**: Cookie-based sessions
- **API Key Auth**: API key validation
- **Token Refresh**: Automatic refresh
- **Multi-mode**: Supports multiple auth modes

### ACLMiddleware

Role-based access control:

- **Role Definitions**: Define roles and permissions
- **Resource Protection**: Protect routes/resources
- **Hierarchical Roles**: Role inheritance
- **Dynamic Permissions**: Runtime permission changes
- **Condition-based**: Conditional access rules

### PermissionChecker

Fine-grained permission system:

- **Attribute-based**: ABAC support
- **Custom Conditions**: User-defined conditions
- **Inheritance**: Permission inheritance
- **Caching**: Cached permission checks
- **Validation**: Permission validation

### AuditMiddleware

Audit trail logging:

- **Request Logging**: Log all requests
- **Response Logging**: Log responses
- **User Tracking**: Track user actions
- **Compliance**: Compliance logging
- **Search**: Searchable audit trail

### CircuitBreaker

Fault tolerance pattern:

- **State Management**: Open/Closed/Half-open states
- **Failure Tracking**: Track failure counts
- **Automatic Recovery**: Auto-reset after timeout
- **Named Breakers**: Multiple named breakers
- **Metrics**: Breaker statistics

### MetricsMiddleware

Request metrics:

- **Request Count**: Track request volume
- **Latency**: Response time tracking
- **Error Rate**: Error percentage
- **Throughput**: Requests per second
- **Export**: Prometheus/StatsD export

### OrchestrationMiddleware

Request processing:

- **Transform Pipeline**: Request/response transforms
- **Validation**: Input validation
- **Enrichment**: Data enrichment
- **Routing**: Dynamic routing
- **Aggregation**: Response aggregation

## Usage

### Authentication

```javascript
import express from 'express';
import { AuthMiddleware, AUTH_MODES } from './middleware/index.js';

const app = express();

// JWT authentication
const auth = new AuthMiddleware({
  mode: AUTH_MODES.JWT,
  secret: process.env.JWT_SECRET,
  tokenExpiry: '24h',
  refreshExpiry: '7d'
});

app.use(auth.middleware);

// Protected route
app.get('/api/profile', (req, res) => {
  // req.user contains authenticated user
  res.json({ user: req.user });
});

// Generate token
const token = auth.generateToken({ userId: '123', role: 'user' });
```

### Access Control

```javascript
import { ACLMiddleware } from './middleware/index.js';

const acl = new ACLMiddleware({
  roles: {
    admin: ['*'],  // All permissions
    editor: ['read', 'write'],
    viewer: ['read']
  },
  resources: {
    '/api/users': ['read', 'write', 'delete'],
    '/api/posts': ['read', 'write']
  }
});

app.use(acl.middleware);

// Check permission manually
app.delete('/api/users/:id', (req, res) => {
  if (!acl.checkPermission(req.user, 'users', 'delete')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // ... delete user
});
```

### Fine-grained Permissions

```javascript
import { PermissionChecker, ownerCondition } from './middleware/index.js';

const checker = new PermissionChecker();

// Add custom condition
checker.addCondition('owner', ownerCondition);
checker.addCondition('time', timeCondition);

// Check with conditions
const allowed = checker.check(
  req.user,
  resource,
  'update',
  [
    { type: 'owner', field: 'userId' },
    { type: 'time', hours: [9, 17] }
  ]
);
```

### Audit Logging

```javascript
import { AuditMiddleware } from './middleware/index.js';

const audit = new AuditMiddleware({
  logger: winstonLogger,
  includeBody: false,  // Don't log request bodies
  includeHeaders: ['user-agent'],
  sensitiveFields: ['password', 'token']
});

app.use(audit.middleware);

// Manual audit log
audit.log('user.login', {
  userId: req.user.id,
  ip: req.ip,
  success: true
});
```

### Circuit Breaker

```javascript
import { CircuitBreaker } from './middleware/index.js';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  monitoringPeriod: 60000
});

// Use breaker
app.get('/api/external', async (req, res) => {
  try {
    const result = await breaker.execute(async () => {
      return await fetchExternalData();
    });
    res.json(result);
  } catch (error) {
    if (error.name === 'CircuitBreakerError') {
      return res.status(503).json({ 
        error: 'Service temporarily unavailable' 
      });
    }
    throw error;
  }
});

// Named breakers
const dbBreaker = CircuitBreaker.getCircuitBreaker('database');
const apiBreaker = CircuitBreaker.getCircuitBreaker('external-api');
```

### Metrics Collection

```javascript
import { MetricsMiddleware } from './middleware/index.js';

const metrics = new MetricsMiddleware({
  prefix: 'cognimesh',
  labels: { service: 'api' }
});

app.use(metrics.middleware);

// Get metrics
app.get('/metrics', (req, res) => {
  res.json(metrics.getMetrics());
});

// Prometheus format
app.get('/metrics/prometheus', (req, res) => {
  res.type('text/plain');
  res.send(metrics.toPrometheus());
});
```

### Request Orchestration

```javascript
import { OrchestrationMiddleware } from './middleware/index.js';

const orchestration = new OrchestrationMiddleware();

// Add request transform
orchestration.addTransform({
  name: 'sanitize',
  phase: 'request',
  fn: (req) => {
    req.body = sanitizeInput(req.body);
  }
});

// Add response transform
orchestration.addTransform({
  name: 'format',
  phase: 'response',
  fn: (req, res) => {
    res.body = { data: res.body, timestamp: Date.now() };
  }
});

// Add pipeline
orchestration.addPipeline('validate-and-enrich', [
  validateRequest,
  enrichData,
  logRequest
]);

app.use(orchestration.middleware);
```

## Configuration

### Auth Configuration

```javascript
{
  mode: 'jwt',  // 'jwt' | 'session' | 'apikey'
  secret: 'your-secret',
  tokenExpiry: '24h',
  refreshExpiry: '7d',
  algorithms: ['HS256'],
  issuer: 'cognimesh',
  audience: 'api',
  
  // Cookie settings (for session)
  cookieName: 'session',
  cookieSecure: true,
  cookieHttpOnly: true,
  cookieSameSite: 'strict'
}
```

### ACL Configuration

```javascript
{
  roles: {
    admin: ['*'],
    editor: ['read', 'write'],
    viewer: ['read'],
    guest: []
  },
  resources: {
    'users': ['read', 'write', 'delete'],
    'posts': ['read', 'write'],
    'comments': ['read', 'write', 'delete']
  },
  permissions: [
    { role: 'editor', resource: 'posts', actions: ['read', 'write'] },
    { role: 'admin', resource: '*', actions: ['*'] }
  ]
}
```

### Circuit Breaker Configuration

```javascript
{
  failureThreshold: 5,
  resetTimeout: 30000,
  monitoringPeriod: 60000,
  successThreshold: 2,  // Successes to close circuit
  errorFilter: (error) => error.code !== 'ENOTFOUND'
}
```

## Best Practices

1. **Order Matters**: Auth → ACL → Audit → Others
2. **Short-circuit**: Fail fast for auth failures
3. **Async Handling**: Use async middleware properly
4. **Error Propagation**: Pass errors to error handler
5. **Resource Cleanup**: Clean up resources in finally
6. **Circuit Breaker**: Protect external services
7. **Audit Everything**: Log security events
8. **Performance**: Cache permission checks
