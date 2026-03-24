# Alerts Module Contract

## Overview

The Alerts Module provides a comprehensive alert management system for CogniMesh v5.0. It handles alert creation, processing, delivery through multiple channels, and lifecycle management with sophisticated trigger rules and rate limiting.

## Public Interfaces

### AlertSystem

Main class that integrates all alert system components.

```javascript
import { AlertSystem } from './alerts/index.js';

const system = new AlertSystem({
  manager: { maxAlerts: 1000 },
  engine: { workers: 4 }
});
```

**Methods:**

- `constructor(options)` - Creates a new AlertSystem instance
  - `options.manager` - AlertManager configuration
  - `options.engine` - AlertEngine configuration

- `addChannel(channel)` - Adds a delivery channel to the engine
  - `channel` - Instance of BaseChannel subclass

- `alert(type, message, options)` - Creates and submits a new alert
  - `type` (string) - Alert type/category
  - `message` (string) - Alert message
  - `options.priority` - Priority level (LOW, MEDIUM, HIGH, CRITICAL)
  - `options.metadata` - Additional alert metadata
  - Returns: Alert instance

- `registerRule(rule)` - Registers a trigger rule
  - `rule` - Instance of BaseRule subclass

- `evaluate(data)` - Evaluates rules against data and creates alerts
  - `data` (Object) - Data to evaluate against rules

- `shutdown()` - Shuts down the alert system gracefully

### AlertManager

Manages alert lifecycle and state transitions.

- `createAlert(type, message, options)` - Creates a new alert
- `getAlert(id)` - Retrieves an alert by ID
- `acknowledgeAlert(id, userId)` - Acknowledges an alert
- `resolveAlert(id, resolution)` - Resolves an alert
- `getActiveAlerts()` - Returns all active alerts
- `dispose()` - Cleans up resources

### AlertEngine

Processes and delivers alerts through configured channels.

- `submit(alert)` - Submits an alert for processing
- `addChannel(channel)` - Adds a delivery channel
- `removeChannel(name)` - Removes a delivery channel
- `start()` - Starts the processing engine
- `stop()` - Stops the processing engine
- `getStats()` - Returns processing statistics

### RuleEngine

Evaluates trigger rules against data.

- `register(rule)` - Registers a new rule
- `unregister(ruleId)` - Removes a rule
- `evaluate(context)` - Evaluates all rules against context
- `getRules()` - Returns all registered rules

### Channel Classes

**BaseChannel (Abstract)**
- `send(alert)` - Abstract method for sending alerts
- `getName()` - Returns channel name
- `isHealthy()` - Returns health status

**EmailChannel**
- `constructor(smtpConfig)` - Creates email channel
- `send(alert)` - Sends alert via email

**WebhookChannel**
- `constructor(url, options)` - Creates webhook channel
- `send(alert)` - POSTs alert to webhook URL

**WebSocketChannel**
- `constructor(wsServer)` - Creates WebSocket channel
- `send(alert)` - Broadcasts alert to clients

**ConsoleChannel**
- `send(alert)` - Logs alert to console

### Rule Classes

**BaseRule (Abstract)**
- `evaluate(context)` - Abstract evaluation method
- `getRuleType()` - Returns rule type identifier

**ThresholdRule**
- `constructor(field, threshold, operator)` - Creates threshold rule
- Evaluates if field value crosses threshold

**PatternRule**
- `constructor(pattern, field)` - Creates pattern matching rule
- Evaluates if field matches regex pattern

**AnomalyRule**
- `constructor(field, sensitivity)` - Creates anomaly detection rule
- Detects statistical anomalies in data

**CompositeRule**
- `constructor(rules, operator)` - Combines multiple rules
- Supports AND/OR logic between rules

## Data Structures

### Alert

```typescript
interface Alert {
  id: string;
  type: string;
  message: string;
  priority: AlertPriority;
  state: AlertState;
  createdAt: string;
  updatedAt: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  metadata?: Record<string, any>;
}
```

### AlertPriority

```typescript
enum AlertPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}
```

### AlertState

```typescript
enum AlertState {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DELIVERED = 'DELIVERED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
  FAILED = 'FAILED'
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

### RuleEvaluationResult

```typescript
interface RuleEvaluationResult {
  ruleId: string;
  ruleType: string;
  triggered: boolean;
  severity: number; // 1-10
  message: string;
  details?: Record<string, any>;
}
```

## Events

The Alerts module emits events through EventEmitter:

| Event | Payload | Description |
|-------|---------|-------------|
| `alertCreated` | `{ alert }` | New alert created |
| `alertUpdated` | `{ alert, changes }` | Alert state changed |
| `alertAcknowledged` | `{ alert, userId }` | Alert acknowledged |
| `alertResolved` | `{ alert, resolution }` | Alert resolved |
| `alertDelivered` | `{ alert, channel }` | Alert delivered successfully |
| `alertFailed` | `{ alert, channel, error }` | Alert delivery failed |
| `processingStarted` | `{ alert }` | Alert processing began |
| `processingComplete` | `{ alert, duration }` | Alert processing finished |
| `ruleTriggered` | `{ rule, result }` | Rule evaluation triggered |
| `channelError` | `{ channel, error }` | Channel encountered error |
| `circuitOpen` | `{ channel }` | Circuit breaker opened |
| `circuitClosed` | `{ channel }` | Circuit breaker closed |

## Error Handling

### AlertError

Base error class for alert-related errors.

### ChannelError

Thrown when channel operations fail.

- `code`: Error code (ECONNREFUSED, TIMEOUT, etc.)
- `channel`: Name of the channel that failed

### RuleError

Thrown when rule evaluation fails.

- `ruleId`: ID of the rule that failed
- `reason`: Description of the failure

### ValidationError

Thrown when alert validation fails.

### RateLimitError

Thrown when rate limit is exceeded.

- `retryAfter`: Seconds until next allowed request

### PriorityQueueError

Thrown when queue operations fail.

### DeduplicationError

Thrown when deduplication fails.

## Configuration Options

```typescript
interface AlertSystemConfig {
  manager?: {
    maxAlerts?: number;
    retentionDays?: number;
    deduplicationWindow?: number;
  };
  engine?: {
    workers?: number;
    queueSize?: number;
    rateLimit?: {
      windowMs: number;
      maxRequests: number;
    };
  };
}
```

## Usage Example

```javascript
import { AlertSystem, EmailChannel, ThresholdRule } from './alerts/index.js';

const system = new AlertSystem();

// Add delivery channel
const emailChannel = new EmailChannel({
  host: 'smtp.example.com',
  port: 587,
  auth: { user: 'alerts@example.com', pass: 'password' }
});
system.addChannel(emailChannel);

// Register threshold rule
const cpuRule = new ThresholdRule('cpu_usage', 80, '>');
system.registerRule(cpuRule);

// Evaluate data
system.evaluate({ cpu_usage: 85 });

// Manual alert
system.alert('system.warning', 'High memory usage', {
  priority: 'HIGH',
  metadata: { memoryPercent: 92 }
});

// Cleanup
await system.shutdown();
```
