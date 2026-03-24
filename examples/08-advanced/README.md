# 08 - Advanced

> **Difficulty:** ⭐⭐⭐⭐ Expert  
> **Time:** 25 minutes

## Overview

This example demonstrates advanced CogniMesh features including custom middleware, event handling, circuit breakers, and authentication.

## Concepts Covered

- Custom middleware creation
- Event handling and propagation
- Circuit breaker pattern
- Authentication and ACL
- Metrics collection
- Audit logging

## Files

### custom-middleware.js
Demonstrates creating and using custom middleware:
1. Authentication middleware
2. ACL (Access Control List) middleware
3. Metrics middleware
4. Audit middleware
5. Circuit breaker middleware

### event-handling.js
Shows advanced event handling patterns:
1. EventEmitter patterns
2. Event propagation
3. Event filtering
4. Async event handlers
5. Event bus architecture

## Key APIs

### Middleware

#### `createAuthMiddleware(options)`
Creates authentication middleware.

Options:
- `mode` - 'jwt', 'api-key', 'session'
- `secret` - JWT secret
- `algorithms` - JWT algorithms

#### `createACL(options)`
Creates ACL middleware.

Options:
- `roles` - Role definitions
- `permissions` - Permission mappings
- `inheritance` - Role inheritance rules

#### `createMetricsMiddleware(options)`
Creates metrics collection middleware.

Options:
- `collectDefaultMetrics` - Enable default metrics
- `requestDurationBuckets` - Histogram buckets

#### `createAuditMiddleware(options)`
Creates audit logging middleware.

Options:
- `logLevel` - Minimum level to log
- `includeRequestBody` - Log request bodies
- `includeResponseBody` - Log response bodies

#### `CircuitBreaker(options)`
Circuit breaker for fault tolerance.

Options:
- `failureThreshold` - Failures before opening (default: 5)
- `resetTimeout` - Time before attempting reset (default: 60000)
- `monitoringPeriod` - Window for failure count (default: 60000)

States:
- `CLOSED` - Normal operation
- `OPEN` - Failing, rejecting requests
- `HALF_OPEN` - Testing if service recovered

### Event Handling

#### `EventEmitter`
Standard Node.js EventEmitter extended for CogniMesh.

Methods:
- `on(event, handler)` - Subscribe to event
- `emit(event, data)` - Emit event
- `once(event, handler)` - One-time subscription
- `off(event, handler)` - Unsubscribe

## Expected Output (custom-middleware.js)

```
[CogniMesh v5.0] Custom Middleware Example
===========================================

✅ Server initialized

--- Authentication Middleware ---

JWT Config:
  Mode: jwt
  Algorithms: HS256, HS384, HS512

Authenticated request:
  User: user-123
  Role: developer
  Permissions: read:tasks, write:tasks

Protected resource access: ✅ Granted

--- ACL Middleware ---

Role Hierarchy:
  admin → manager → developer → viewer

Permission check (developer):
  read:tasks → ✅ Allow
  write:tasks → ✅ Allow
  delete:users → ❌ Deny

Permission check (admin):
  delete:users → ✅ Allow
  system:config → ✅ Allow

--- Circuit Breaker ---

Circuit state: CLOSED
Simulating failures...
  Failure 1/5 → State: CLOSED
  Failure 2/5 → State: CLOSED
  Failure 3/5 → State: CLOSED
  Failure 4/5 → State: CLOSED
  Failure 5/5 → State: OPEN ⚠️

Circuit is OPEN - requests rejected
  Error: Circuit breaker is OPEN

Waiting for timeout...
Retry after timeout → State: HALF_OPEN

Success on retry → State: CLOSED ✅

--- Metrics Middleware ---

Request metrics:
  Total requests: 10
  Success rate: 80%
  Average latency: 45ms
  p95 latency: 120ms
  p99 latency: 180ms

--- Audit Middleware ---

Audit log:
  [2026-03-23T15:30:00Z] user-123 READ /api/tasks
  [2026-03-23T15:30:01Z] user-123 WRITE /api/tasks/123
  [2026-03-23T15:30:02Z] admin DELETE /api/users/456

✅ Middleware example complete
```

## Expected Output (event-handling.js)

```
[CogniMesh v5.0] Event Handling Example
========================================

✅ BIOS booted

--- Basic Event Handling ---

Subscribing to events...
Emitting events...
  📢 bios:boot:start
  📢 bios:config:loaded
  📢 bios:boot:complete

Event history:
  1. bios:boot:start
  2. bios:config:loaded
  3. bios:boot:complete

--- Event Filtering ---

Filtered events (system only):
  📢 system:alert
  📢 system:critical

--- Async Event Handlers ---

Async processing:
  Processing task-1... Done (150ms)
  Processing task-2... Done (230ms)
  Processing task-3... Done (80ms)

All async handlers completed in 230ms

--- Event Bus Architecture ---

Channel: tasks
  Subscribers: 3
  Messages: 5

Channel: notifications
  Subscribers: 2
  Messages: 3

Broadcast: task-created → 3 subscribers notified

--- Error Handling ---

Event handler error caught:
  Event: risky-operation
  Error: Simulated failure
  Fallback: Executed ✅

✅ Event handling example complete
```

## Next Steps

After completing all examples:

1. Review the main [README](../../README.md) for architecture details
2. Explore the [src](../../src/) directory for implementation details
3. Check [PROJECT_STATUS.md](../../PROJECT_STATUS.md) for roadmap
