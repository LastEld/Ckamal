# Alerts Module

## Overview

The Alerts Module is a comprehensive notification and alerting system designed for CogniMesh v5.0. It provides enterprise-grade alert management with multi-channel delivery, intelligent routing, rate limiting, and sophisticated rule-based triggering mechanisms.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    AlertSystem                              │
├──────────────┬────────────────────────┬─────────────────────┤
│ AlertManager │      AlertEngine       │     RuleEngine      │
├──────────────┤  ┌──────────────────┐  │  ┌───────────────┐  │
│ - Creation   │  │ Priority Queue   │  │  │ BaseRule      │  │
│ - Lifecycle  │  │ Rate Limiter     │  │  │ ThresholdRule │  │
│ - Storage    │  │ Deduplicator     │  │  │ PatternRule   │  │
└──────────────┘  └────────┬─────────┘  │  │ AnomalyRule   │  │
                           │            │  └───────────────┘  │
                    ┌──────┴──────┐     └─────────────────────┘
                    │  Channels   │
                    ├─────────────┤
                    │ Email       │
                    │ Webhook     │
                    │ WebSocket   │
                    │ Console     │
                    └─────────────┘
```

### Data Flow

1. **Alert Creation**: Alerts are created via manual API call or rule evaluation
2. **Queue Processing**: Alerts enter the priority queue based on urgency
3. **Deduplication**: Duplicate alerts are detected and merged
4. **Channel Routing**: Alerts are routed to appropriate delivery channels
5. **Delivery Attempt**: Each channel attempts delivery with retry logic
6. **State Tracking**: Alert state transitions are tracked (PENDING → PROCESSING → DELIVERED)
7. **Acknowledgment**: Recipients acknowledge receipt
8. **Resolution**: Alerts are resolved when issues are fixed

## Components

### AlertManager

Central component for alert lifecycle management:

- **Alert Creation**: Validates and creates new alerts
- **State Management**: Tracks alert states (PENDING → ACKNOWLEDGED → RESOLVED)
- **Persistence**: Stores alerts with configurable retention
- **Deduplication**: Prevents duplicate alerts within time windows
- **Acknowledgment Tracking**: Records who acknowledged what and when

### AlertEngine

Processing engine for alert delivery:

- **Priority Queue**: Orders alerts by priority level
- **Rate Limiting**: Prevents alert flooding
- **Channel Management**: Manages multiple delivery channels
- **Circuit Breaker**: Protects against cascading failures
- **Retry Logic**: Automatic retry with exponential backoff

### RuleEngine

Rule-based alert triggering:

- **Rule Registration**: Dynamic rule addition/removal
- **Evaluation Context**: Provides data context for evaluation
- **Composite Logic**: AND/OR combinations of rules
- **Threshold Monitoring**: Numeric threshold crossing detection
- **Pattern Matching**: Regex-based pattern detection
- **Anomaly Detection**: Statistical anomaly identification

### Delivery Channels

**Email Channel**
- SMTP-based email delivery
- HTML and text format support
- Attachment support
- Template rendering

**Webhook Channel**
- HTTP POST to configured endpoints
- Custom headers support
- Payload transformation
- SSL/TLS support

**WebSocket Channel**
- Real-time browser notifications
- Room-based routing
- Client filtering
- Connection management

**Console Channel**
- Development and debugging
- Structured logging
- Color-coded output

## Usage

### Basic Setup

```javascript
import { AlertSystem, ConsoleChannel } from './alerts/index.js';

const alerts = new AlertSystem();
alerts.addChannel(new ConsoleChannel());

// Create an alert
alerts.alert('system.startup', 'System initialized successfully', {
  priority: 'LOW'
});
```

### Multi-Channel Configuration

```javascript
import { 
  AlertSystem, 
  EmailChannel, 
  WebhookChannel, 
  WebSocketChannel 
} from './alerts/index.js';

const alerts = new AlertSystem();

// Email for critical alerts
alerts.addChannel(new EmailChannel({
  host: 'smtp.company.com',
  port: 587,
  secure: true,
  auth: {
    user: process.env.ALERT_EMAIL_USER,
    pass: process.env.ALERT_EMAIL_PASS
  }
}));

// Webhook for integrations
alerts.addChannel(new WebhookChannel('https://hooks.slack.com/...', {
  headers: { 'Authorization': 'Bearer token' }
}));

// WebSocket for dashboard
alerts.addChannel(new WebSocketChannel(wsServer));
```

### Rule-Based Alerting

```javascript
import { ThresholdRule, PatternRule, CompositeRule } from './alerts/index.js';

// CPU threshold rule
const cpuRule = new ThresholdRule('cpu_percent', 85, '>');
alerts.registerRule(cpuRule);

// Error pattern rule
const errorRule = new PatternRule(/ERROR|FATAL/, 'log_message');
alerts.registerRule(errorRule);

// Combined rule
const criticalRule = new CompositeRule(
  [cpuRule, errorRule],
  'AND'  // Both conditions must be true
);
alerts.registerRule(criticalRule);

// Evaluate metrics
setInterval(() => {
  const metrics = collectSystemMetrics();
  alerts.evaluate(metrics);
}, 5000);
```

### Event Handling

```javascript
alerts.manager.on('alertCreated', ({ alert }) => {
  console.log(`New alert: ${alert.message}`);
});

alerts.manager.on('alertAcknowledged', ({ alert, userId }) => {
  console.log(`Alert ${alert.id} acknowledged by ${userId}`);
});

alerts.engine.on('alertFailed', ({ alert, channel, error }) => {
  console.error(`Failed to deliver to ${channel}:`, error);
});
```

## Configuration

### System Configuration

```javascript
const alerts = new AlertSystem({
  manager: {
    maxAlerts: 5000,           // Maximum stored alerts
    retentionDays: 30,         // Alert retention period
    deduplicationWindow: 300000 // 5 minutes dedup window
  },
  engine: {
    workers: 4,                // Concurrent processing workers
    queueSize: 1000,           // Maximum queue size
    rateLimit: {
      windowMs: 60000,         // 1 minute window
      maxRequests: 100         // Max 100 alerts per minute
    }
  }
});
```

### Channel Configuration

**Email Channel**
```javascript
{
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'alerts@company.com',
    pass: 'app-specific-password'
  },
  from: 'CogniMesh Alerts <alerts@company.com>',
  to: ['admin@company.com', 'ops@company.com'],
  templates: {
    subject: 'Alert: {{type}}',
    body: 'templates/alert-email.hbs'
  }
}
```

**Webhook Channel**
```javascript
{
  url: 'https://api.company.com/webhooks/alerts',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  timeout: 5000,
  retryAttempts: 3,
  retryDelay: 1000
}
```

**WebSocket Channel**
```javascript
{
  server: wsServer,           // WebSocket server instance
  roomPrefix: 'alerts:',      // Room naming prefix
  broadcast: false,           // Send to all or filter
  filter: (alert, client) => {
    // Custom filtering logic
    return client.subscriptions.includes(alert.type);
  }
}
```

### Rule Configuration

**Threshold Rule**
```javascript
{
  field: 'memory_usage',      // Field to monitor
  threshold: 90,              // Threshold value
  operator: '>',              // Comparison operator
  duration: 60000,            // Must exceed for 60 seconds
  cooldown: 300000            // 5 minute cooldown between alerts
}
```

**Pattern Rule**
```javascript
{
  pattern: /Exception|Error/, // Regex pattern
  field: 'message',           // Field to search
  caseSensitive: false,
  cooldown: 60000
}
```

## Best Practices

1. **Use Appropriate Priorities**: Reserve CRITICAL for issues requiring immediate action
2. **Configure Rate Limiting**: Prevent alert fatigue with proper rate limits
3. **Implement Circuit Breakers**: Protect downstream services from overload
4. **Set Up Acknowledgment Flows**: Ensure alerts are not ignored
5. **Monitor Alert Metrics**: Track alert volume, delivery rates, and response times
6. **Use Deduplication**: Prevent spam from recurring issues
7. **Test Channels Regularly**: Verify email, webhook, and WebSocket connectivity
8. **Implement Graceful Degradation**: Handle channel failures gracefully
