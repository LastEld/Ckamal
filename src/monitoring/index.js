/**
 * Monitoring Service - Prometheus Metrics for CogniMesh
 * @module src/monitoring
 * @description Provides Prometheus-compatible metrics collection and exposure
 * @version 1.0.0
 */

import prometheus from 'prom-client';

/**
 * Monitoring Service class for collecting and exposing metrics
 * @class MonitoringService
 */
export class MonitoringService {
  /**
   * Creates a new MonitoringService instance
   */
  constructor() {
    this.register = new prometheus.Registry();
    
    // Default metrics (Node.js runtime metrics)
    prometheus.collectDefaultMetrics({ 
      register: this.register,
      prefix: 'cognimesh_'
    });
    
    // HTTP request counter
    this.httpRequests = new prometheus.Counter({
      name: 'cognimesh_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.register]
    });
    
    // HTTP request duration histogram
    this.httpDuration = new prometheus.Histogram({
      name: 'cognimesh_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register]
    });
    
    // AI client request counter
    this.aiRequests = new prometheus.Counter({
      name: 'cognimesh_ai_requests_total',
      help: 'Total AI client requests',
      labelNames: ['provider', 'model', 'status'],
      registers: [this.register]
    });
    
    // AI request duration histogram
    this.aiDuration = new prometheus.Histogram({
      name: 'cognimesh_ai_request_duration_seconds',
      help: 'AI request duration in seconds',
      labelNames: ['provider', 'model'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.register]
    });
    
    // AI token usage counter
    this.aiTokens = new prometheus.Counter({
      name: 'cognimesh_ai_tokens_total',
      help: 'Total AI tokens used',
      labelNames: ['provider', 'model', 'type'],
      registers: [this.register]
    });
    
    // Active WebSocket connections gauge
    this.wsConnections = new prometheus.Gauge({
      name: 'cognimesh_websocket_connections_active',
      help: 'Active WebSocket connections',
      registers: [this.register]
    });
    
    // WebSocket messages counter
    this.wsMessages = new prometheus.Counter({
      name: 'cognimesh_websocket_messages_total',
      help: 'Total WebSocket messages',
      labelNames: ['type', 'direction'],
      registers: [this.register]
    });
    
    // Database connection pool gauge
    this.dbConnections = new prometheus.Gauge({
      name: 'cognimesh_db_connections_active',
      help: 'Active database connections',
      labelNames: ['state'],
      registers: [this.register]
    });
    
    // Database query duration histogram
    this.dbQueryDuration = new prometheus.Histogram({
      name: 'cognimesh_db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.register]
    });
    
    // Tool execution counter
    this.toolExecutions = new prometheus.Counter({
      name: 'cognimesh_tool_executions_total',
      help: 'Total tool executions',
      labelNames: ['tool', 'status'],
      registers: [this.register]
    });
    
    // Tool execution duration histogram
    this.toolDuration = new prometheus.Histogram({
      name: 'cognimesh_tool_execution_duration_seconds',
      help: 'Tool execution duration in seconds',
      labelNames: ['tool'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [this.register]
    });
    
    // Error counter
    this.errors = new prometheus.Counter({
      name: 'cognimesh_errors_total',
      help: 'Total errors',
      labelNames: ['type', 'component'],
      registers: [this.register]
    });
    
    // BIOS components health gauge
    this.biosHealth = new prometheus.Gauge({
      name: 'cognimesh_bios_component_health',
      help: 'BIOS component health status (1 = healthy, 0 = unhealthy)',
      labelNames: ['component'],
      registers: [this.register]
    });
    
    // Task queue size gauge
    this.taskQueueSize = new prometheus.Gauge({
      name: 'cognimesh_task_queue_size',
      help: 'Current task queue size',
      labelNames: ['queue'],
      registers: [this.register]
    });
    
    // Circuit breaker state gauge
    this.circuitBreakerState = new prometheus.Gauge({
      name: 'cognimesh_circuit_breaker_state',
      help: 'Circuit breaker state (0 = closed, 1 = open, 2 = half-open)',
      labelNames: ['name'],
      registers: [this.register]
    });
    
    // Rate limit hits counter
    this.rateLimitHits = new prometheus.Counter({
      name: 'cognimesh_rate_limit_hits_total',
      help: 'Total rate limit hits',
      labelNames: ['endpoint'],
      registers: [this.register]
    });
  }
  
  /**
   * Get all metrics in Prometheus exposition format
     * @returns {Promise<string>} Prometheus formatted metrics
   */
  async getMetrics() {
    return this.register.metrics();
  }
  
  /**
   * Get metrics content type
   * @returns {string} Content type for Prometheus metrics
   */
  getContentType() {
    return this.register.contentType;
  }
  
  /**
   * Record HTTP request metrics
   * @param {string} method - HTTP method
   * @param {string} route - Request route
   * @param {number} status - HTTP status code
   * @param {number} duration - Request duration in seconds
   */
  recordHttpRequest(method, route, status, duration) {
    this.httpRequests.inc({ method, route, status });
    this.httpDuration.observe({ method, route }, duration);
  }
  
  /**
   * Record AI client request metrics
   * @param {string} provider - AI provider (claude, openai, etc.)
   * @param {string} model - Model name
   * @param {string} status - Request status (success/error)
   * @param {number} [duration] - Request duration in seconds
   */
  recordAiRequest(provider, model, status, duration) {
    this.aiRequests.inc({ provider, model, status });
    if (duration !== undefined) {
      this.aiDuration.observe({ provider, model }, duration);
    }
  }
  
  /**
   * Record AI token usage
   * @param {string} provider - AI provider
   * @param {string} model - Model name
   * @param {string} type - Token type (input/output)
   * @param {number} count - Number of tokens
   */
  recordAiTokens(provider, model, type, count) {
    this.aiTokens.inc({ provider, model, type }, count);
  }
  
  /**
   * Set active WebSocket connections count
   * @param {number} count - Number of active connections
   */
  setWsConnections(count) {
    this.wsConnections.set(count);
  }
  
  /**
   * Increment WebSocket connections
   */
  incrementWsConnections() {
    this.wsConnections.inc();
  }
  
  /**
   * Decrement WebSocket connections
   */
  decrementWsConnections() {
    this.wsConnections.dec();
  }
  
  /**
   * Record WebSocket message
   * @param {string} type - Message type
   * @param {string} direction - Message direction (in/out)
   */
  recordWsMessage(type, direction) {
    this.wsMessages.inc({ type, direction });
  }
  
  /**
   * Set database connections count
   * @param {string} state - Connection state (in_use, available, total)
   * @param {number} count - Number of connections
   */
  setDbConnections(state, count) {
    this.dbConnections.set({ state }, count);
  }
  
  /**
   * Record database query duration
   * @param {string} operation - Database operation type
   * @param {number} duration - Query duration in seconds
   */
  recordDbQuery(operation, duration) {
    this.dbQueryDuration.observe({ operation }, duration);
  }
  
  /**
   * Record tool execution metrics
   * @param {string} tool - Tool name
   * @param {string} status - Execution status (success/error)
   * @param {number} [duration] - Execution duration in seconds
   */
  recordToolExecution(tool, status, duration) {
    this.toolExecutions.inc({ tool, status });
    if (duration !== undefined) {
      this.toolDuration.observe({ tool }, duration);
    }
  }
  
  /**
   * Record error
   * @param {string} type - Error type
   * @param {string} component - Component where error occurred
   */
  recordError(type, component) {
    this.errors.inc({ type, component });
  }
  
  /**
   * Set BIOS component health status
   * @param {string} component - Component name
   * @param {boolean} healthy - Health status
   */
  setBiosHealth(component, healthy) {
    this.biosHealth.set({ component }, healthy ? 1 : 0);
  }
  
  /**
   * Set task queue size
   * @param {string} queue - Queue name
   * @param {number} size - Queue size
   */
  setTaskQueueSize(queue, size) {
    this.taskQueueSize.set({ queue }, size);
  }
  
  /**
   * Set circuit breaker state
   * @param {string} name - Circuit breaker name
   * @param {string} state - Circuit breaker state (closed/open/half-open)
   */
  setCircuitBreakerState(name, state) {
    const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
    this.circuitBreakerState.set({ name }, stateValue);
  }
  
  /**
   * Record rate limit hit
   * @param {string} endpoint - Endpoint that was rate limited
   */
  recordRateLimitHit(endpoint) {
    this.rateLimitHits.inc({ endpoint });
  }
  
  /**
   * Create an Express middleware for HTTP request tracking
   * @returns {Function} Express middleware
   */
  httpMiddleware() {
    return (req, res, next) => {
      const start = process.hrtime.bigint();
      
      res.on('finish', () => {
        const duration = Number(process.hrtime.bigint() - start) / 1e9;
        const route = req.route?.path || req.path;
        this.recordHttpRequest(req.method, route, res.statusCode, duration);
      });
      
      next();
    };
  }
  
  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.register.resetMetrics();
  }
  
  /**
   * Get metric names
   * @returns {string[]} Array of metric names
   */
  getMetricNames() {
    return this.register.getMetricsAsArray().map(m => m.name);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

/**
 * Get default monitoring service instance
 * @returns {MonitoringService}
 */
export function getMonitoringService() {
  if (!defaultInstance) {
    defaultInstance = new MonitoringService();
  }
  return defaultInstance;
}

/**
 * Reset default instance (primarily for testing)
 */
export function resetMonitoringService() {
  defaultInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export default MonitoringService;
