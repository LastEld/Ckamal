# CogniMesh Monitoring & Observability

> **All models are accessed through flat-rate subscriptions. No API billing applies.**

## Overview

This document describes the monitoring and observability setup for CogniMesh, including metrics collection, dashboards, and alerting.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  CogniMesh  │────▶│  Prometheus │◀────│   Grafana   │
│   Server    │     │   (metrics) │     │ (dashboards)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Alertmanager│
                    │  (alerts)   │
                    └─────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start CogniMesh Server

```bash
npm start
```

The metrics endpoint will be available at `http://localhost:3000/metrics`

### 3. Start Monitoring Stack

```bash
cd config
docker-compose -f docker-compose.monitoring.yml up -d
```

This starts:
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/cognimesh)
- **Alertmanager**: http://localhost:9093
- **Node Exporter**: System metrics

## Metrics

### Default Metrics (Node.js Runtime)

| Metric | Description |
|--------|-------------|
| `cognimesh_process_cpu_seconds_total` | CPU usage |
| `cognimesh_process_resident_memory_bytes` | Memory usage |
| `cognimesh_process_heap_bytes` | Heap size |
| `cognimesh_nodejs_eventloop_lag_seconds` | Event loop lag |

### HTTP Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cognimesh_http_requests_total` | Counter | method, route, status | Total HTTP requests |
| `cognimesh_http_request_duration_seconds` | Histogram | method, route | Request duration |

### AI Client Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cognimesh_ai_requests_total` | Counter | provider, model, status | AI API requests |
| `cognimesh_ai_request_duration_seconds` | Histogram | provider, model | AI request duration |
| `cognimesh_ai_tokens_total` | Counter | provider, model, type | Token usage |

### WebSocket Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cognimesh_websocket_connections_active` | Gauge | - | Active connections |
| `cognimesh_websocket_messages_total` | Counter | type, direction | Messages sent/received |

### Database Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cognimesh_db_connections_active` | Gauge | state | Connection pool status |
| `cognimesh_db_query_duration_seconds` | Histogram | operation | Query duration |

### Application Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cognimesh_tool_executions_total` | Counter | tool, status | Tool executions |
| `cognimesh_errors_total` | Counter | type, component | Application errors |
| `cognimesh_task_queue_size` | Gauge | queue | Pending tasks |
| `cognimesh_circuit_breaker_state` | Gauge | name | Circuit breaker state |
| `cognimesh_rate_limit_hits_total` | Counter | endpoint | Rate limit hits |
| `cognimesh_bios_component_health` | Gauge | component | BIOS health status |

## Using the Monitoring Service

### Basic Usage

```javascript
import { getMonitoringService } from './monitoring/index.js';

const monitoring = getMonitoringService();

// Record HTTP request
monitoring.recordHttpRequest('GET', '/api/tasks', 200, 0.123);

// Record AI request
monitoring.recordAiRequest('claude', 'claude-3-opus', 'success', 2.5);

// Record custom metric
monitoring.recordError('database', 'connection');
```

### Express Middleware

```javascript
import { getMonitoringService } from './monitoring/index.js';

const monitoring = getMonitoringService();
app.use(monitoring.httpMiddleware());
```

## Grafana Dashboards

### Available Dashboards

1. **CogniMesh Overview**: Main operational dashboard
   - Request rates and latency
   - Error rates
   - Resource usage
   - AI metrics

2. **Database Performance**: Query performance and connection pool

3. **WebSocket Activity**: Real-time connection metrics

### Import Dashboard

```bash
# Dashboard is auto-provisioned in Grafana
# Or manually import from config/grafana/dashboard.json
```

## Alerting

### Alert Rules

Located in `config/prometheus/alerts.yml`:

| Alert | Severity | Condition |
|-------|----------|-----------|
| CogniMeshHighErrorRate | critical | > 10 errors/sec |
| CogniMeshHighLatency | warning | p95 > 2s |
| CogniMeshServiceDown | critical | Service unreachable |
| CogniMeshDBPoolExhaustion | critical | > 90% connections in use |
| CogniMeshAIRequestFailures | warning | > 10% failure rate |
| CogniMeshCircuitBreakerOpen | warning | Circuit breaker open |

### SLO Alerts

| SLO | Target | Alert |
|-----|--------|-------|
| Availability | 99.9% | CogniMeshAvailabilitySLOViolation |
| Latency | 95% < 500ms | CogniMeshLatencySLOViolation |

### Alertmanager Routes

- **Critical**: PagerDuty + Email
- **Warning**: Slack + Email
- **Info**: Slack only

## Configuration

### Environment Variables

```bash
# Metrics configuration
METRICS_ENABLED=true
METRICS_PORT=9090
METRICS_PATH=/metrics

# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=secret

# Alertmanager
ALERTMANAGER_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
ALERTMANAGER_PAGERDUTY_KEY=...
```

### Prometheus Configuration

See `config/prometheus/prometheus.yml` for scrape configuration.

## Troubleshooting

### Metrics Not Available

1. Check if server is running: `curl http://localhost:3000/health`
2. Check metrics endpoint: `curl http://localhost:3000/metrics`
3. Verify prom-client is installed: `npm list prom-client`

### Grafana Not Showing Data

1. Check Prometheus target status: http://localhost:9090/targets
2. Verify datasource configuration in Grafana
3. Check query in Prometheus: http://localhost:9090/graph

### Alerts Not Firing

1. Check alert rules: http://localhost:9090/rules
2. Check alertmanager status: http://localhost:9093
3. Verify alert expressions in Prometheus

## API Reference

### MonitoringService

```typescript
class MonitoringService {
  // HTTP Metrics
  recordHttpRequest(method: string, route: string, status: number, duration: number): void
  
  // AI Metrics
  recordAiRequest(provider: string, model: string, status: string, duration?: number): void
  recordAiTokens(provider: string, model: string, type: string, count: number): void
  
  // WebSocket Metrics
  setWsConnections(count: number): void
  incrementWsConnections(): void
  decrementWsConnections(): void
  recordWsMessage(type: string, direction: string): void
  
  // Database Metrics
  setDbConnections(state: string, count: number): void
  recordDbQuery(operation: string, duration: number): void
  
  // Tool Metrics
  recordToolExecution(tool: string, status: string, duration?: number): void
  
  // Error Tracking
  recordError(type: string, component: string): void
  
  // BIOS Health
  setBiosHealth(component: string, healthy: boolean): void
  
  // Task Queue
  setTaskQueueSize(queue: string, size: number): void
  
  // Circuit Breaker
  setCircuitBreakerState(name: string, state: 'closed' | 'open' | 'half-open'): void
  
  // Rate Limiting
  recordRateLimitHit(endpoint: string): void
  
  // Express Middleware
  httpMiddleware(): Function
  
  // Metrics Export
  getMetrics(): Promise<string>
  getContentType(): string
  getMetricNames(): string[]
  reset(): void
}
```

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [prom-client GitHub](https://github.com/siimon/prom-client)
- [OpenMetrics Specification](https://openmetrics.io/)
