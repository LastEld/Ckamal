/**
 * Metrics Collection Middleware
 * Prometheus-compatible metrics for CogniMesh
 *
 * @module src/middleware/metrics
 */

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} MetricValue
 * @property {number} value - Current value
 * @property {number} timestamp - When recorded
 * @property {Object} [labels] - Label values
 */

/**
 * @typedef {Object} HistogramBucket
 * @property {number} le - Less than or equal to boundary
 * @property {number} count - Cumulative count
 */

/**
 * @typedef {Object} QuantileValue
 * @property {number} quantile - Quantile (0-1)
 * @property {number} value - Value at quantile
 */

/**
 * @typedef {Object} MetricConfig
 * @property {string} name - Metric name
 * @property {string} help - Help text
 * @property {string[]} [labelNames] - Allowed label names
 * @property {Object} [buckets] - Bucket boundaries for histogram
 * @property {number[]} [quantiles] - Quantiles for summary
 */

// ============================================================================
// Errors
// ============================================================================

/**
 * Metrics error
 */
export class MetricsError extends Error {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'MetricsError';
    this.code = code;
    this.metadata = metadata;
  }
}

// ============================================================================
// Base Metric Class
// ============================================================================

/**
 * Base class for all metric types
 */
class BaseMetric {
  #name;
  #help;
  #labelNames;
  #values;

  /**
   * @param {MetricConfig} config - Metric configuration
   */
  constructor(config) {
    this.#validateName(config.name);
    
    this.#name = config.name;
    this.#help = config.help || '';
    this.#labelNames = config.labelNames || [];
    this.#values = new Map();
  }

  get name() { return this.#name; }
  get help() { return this.#help; }
  get labelNames() { return [...this.#labelNames]; }

  /**
   * Validate metric name (Prometheus format)
   * @private
   * @param {string} name - Metric name
   */
  #validateName(name) {
    if (!name || typeof name !== 'string') {
      throw new MetricsError('INVALID_NAME', 'Metric name is required');
    }
    
    // Prometheus naming convention: [a-zA-Z_:][a-zA-Z0-9_:]*
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) {
      throw new MetricsError('INVALID_NAME', `Invalid metric name: ${name}`);
    }
  }

  /**
   * Get label key from labels object
   * @private
   * @param {Object} labels - Label values
   * @returns {string}
   */
  #getLabelKey(labels = {}) {
    if (this.#labelNames.length === 0) {
      return '';
    }

    // Validate labels
    for (const name of this.#labelNames) {
      if (!(name in labels)) {
        throw new MetricsError(
          'MISSING_LABEL', 
          `Missing required label: ${name}`,
          { metric: this.#name, label: name }
        );
      }
    }

    // Create sorted key for consistent lookup
    return this.#labelNames
      .map(name => `${name}=${labels[name]}`)
      .join(',');
  }

  /**
   * Get or create value entry
   * @protected
   * @param {Object} labels - Label values
   * @returns {Object} Value entry
   */
  _getEntry(labels = {}) {
    const key = this.#getLabelKey(labels);
    
    if (!this.#values.has(key)) {
      this.#values.set(key, this._createEntry(labels));
    }

    return this.#values.get(key);
  }

  /**
   * Create new entry (override in subclasses)
   * @protected
   * @param {Object} labels - Label values
   * @returns {Object}
   */
  _createEntry(labels) {
    return { labels, timestamp: Date.now() };
  }

  /**
   * Get all values
   * @protected
   * @returns {Array<Object>}
   */
  _getAllValues() {
    return Array.from(this.#values.values());
  }

  /**
   * Format labels for Prometheus output
   * @protected
   * @param {Object} labels - Label object
   * @returns {string}
   */
  _formatLabels(labels) {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';

    const formatted = entries
      .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
      .join(',');
    
    return `{${formatted}}`;
  }

  /**
   * Get metric type string (override in subclasses)
   * @protected
   * @returns {string}
   */
  _getType() {
    return 'untyped';
  }

  /**
   * Generate Prometheus exposition format
   * @returns {string}
   */
  toPrometheus() {
    const lines = [];
    
    if (this.#help) {
      lines.push(`# HELP ${this.#name} ${this.#help}`);
    }
    lines.push(`# TYPE ${this.#name} ${this._getType()}`);
    
    lines.push(...this._getPrometheusLines());
    
    return lines.join('\n');
  }

  /**
   * Get Prometheus format lines (override in subclasses)
   * @protected
   * @returns {string[]}
   */
  _getPrometheusLines() {
    return [];
  }

  /**
   * Reset all values
   */
  reset() {
    this.#values.clear();
  }
}

// ============================================================================
// Counter Metric
// ============================================================================

/**
 * Counter metric - only increases
 */
export class Counter extends BaseMetric {
  /**
   * Increment counter
   * @param {Object} [labels] - Label values
   * @param {number} [value=1] - Amount to increment
   */
  inc(labels = {}, value = 1) {
    if (value < 0) {
      throw new MetricsError('INVALID_VALUE', 'Counter cannot decrease');
    }

    const entry = this._getEntry(labels);
    entry.value = (entry.value || 0) + value;
    entry.timestamp = Date.now();
  }

  /**
   * Get current value
   * @param {Object} [labels] - Label values
   * @returns {number}
   */
  get(labels = {}) {
    const entry = this._getEntry(labels);
    return entry.value || 0;
  }

  _getType() {
    return 'counter';
  }

  _createEntry(labels) {
    return { ...super._createEntry(labels), value: 0 };
  }

  _getPrometheusLines() {
    return this._getAllValues().map(entry => 
      `${this.name}${this._formatLabels(entry.labels)} ${entry.value}`
    );
  }
}

// ============================================================================
// Gauge Metric
// ============================================================================

/**
 * Gauge metric - can increase or decrease
 */
export class Gauge extends BaseMetric {
  /**
   * Set gauge value
   * @param {Object} [labels] - Label values
   * @param {number} value - Value to set
   */
  set(labels = {}, value) {
    const entry = this._getEntry(labels);
    entry.value = value;
    entry.timestamp = Date.now();
  }

  /**
   * Increment gauge
   * @param {Object} [labels] - Label values
   * @param {number} [value=1] - Amount to increment
   */
  inc(labels = {}, value = 1) {
    const entry = this._getEntry(labels);
    entry.value = (entry.value || 0) + value;
    entry.timestamp = Date.now();
  }

  /**
   * Decrement gauge
   * @param {Object} [labels] - Label values
   * @param {number} [value=1] - Amount to decrement
   */
  dec(labels = {}, value = 1) {
    const entry = this._getEntry(labels);
    entry.value = (entry.value || 0) - value;
    entry.timestamp = Date.now();
  }

  /**
   * Get current value
   * @param {Object} [labels] - Label values
   * @returns {number}
   */
  get(labels = {}) {
    const entry = this._getEntry(labels);
    return entry.value || 0;
  }

  _getType() {
    return 'gauge';
  }

  _createEntry(labels) {
    return { ...super._createEntry(labels), value: 0 };
  }

  _getPrometheusLines() {
    return this._getAllValues().map(entry => 
      `${this.name}${this._formatLabels(entry.labels)} ${entry.value}`
    );
  }
}

// ============================================================================
// Histogram Metric
// ============================================================================

/**
 * Histogram metric - samples observations into buckets
 */
export class Histogram extends BaseMetric {
  #buckets;

  /**
   * @param {MetricConfig} config - Metric configuration
   */
  constructor(config) {
    super(config);
    
    // Default Prometheus buckets
    this.#buckets = config.buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }

  /**
   * Observe a value
   * @param {Object} [labels] - Label values
   * @param {number} value - Value to observe
   */
  observe(labels = {}, value) {
    const entry = this._getEntry(labels);
    
    entry.sum = (entry.sum || 0) + value;
    entry.count = (entry.count || 0) + 1;
    
    // Update buckets
    if (!entry.buckets) {
      entry.buckets = new Map();
    }
    
    for (const bucket of this.#buckets) {
      if (value <= bucket) {
        const key = String(bucket);
        entry.buckets.set(key, (entry.buckets.get(key) || 0) + 1);
      }
    }
    
    // +Inf bucket counts all observations
    entry.buckets.set('+Inf', (entry.buckets.get('+Inf') || 0) + 1);
    
    entry.timestamp = Date.now();
  }

  /**
   * Time a function execution
   * @template T
   * @param {Object} [labels] - Label values
   * @param {Function} fn - Function to time
   * @returns {Promise<T>} Function result
   */
  async time(labels = {}, fn) {
    const start = process.hrtime.bigint();
    
    try {
      return await fn();
    } finally {
      const duration = Number(process.hrtime.bigint() - start) / 1e9; // Convert to seconds
      this.observe(labels, duration);
    }
  }

  /**
   * Get bucket counts
   * @param {Object} [labels] - Label values
   * @returns {Map<string, number>}
   */
  getBuckets(labels = {}) {
    const entry = this._getEntry(labels);
    return entry.buckets || new Map();
  }

  _getType() {
    return 'histogram';
  }

  _createEntry(labels) {
    return { 
      ...super._createEntry(labels), 
      sum: 0, 
      count: 0,
      buckets: new Map()
    };
  }

  _getPrometheusLines() {
    const lines = [];
    
    for (const entry of this._getAllValues()) {
      const labels = this._formatLabels(entry.labels);
      
      // Bucket lines
      for (const bucket of [...this.#buckets, '+Inf']) {
        const bucketLabel = bucket === '+Inf' ? '+Inf' : String(bucket);
        const bucketValue = entry.buckets?.get(bucketLabel) || 0;
        const bucketLabels = labels.slice(0, -1) + (labels ? ',' : '{') + `le="${bucketLabel}"}`;
        lines.push(`${this.name}_bucket${bucketLabels} ${bucketValue}`);
      }
      
      // Sum line
      lines.push(`${this.name}_sum${labels} ${entry.sum || 0}`);
      
      // Count line
      lines.push(`${this.name}_count${labels} ${entry.count || 0}`);
    }
    
    return lines;
  }
}

// ============================================================================
// Summary Metric
// ============================================================================

/**
 * Summary metric - calculates quantiles using sliding time window
 */
export class Summary extends BaseMetric {
  #quantiles;
  #maxAge;
  #ageBuckets;

  /**
   * @param {MetricConfig} config - Metric configuration
   */
  constructor(config) {
    super(config);
    
    this.#quantiles = config.quantiles || [0.5, 0.9, 0.99];
    this.#maxAge = config.maxAge || 600000; // 10 minutes
    this.#ageBuckets = config.ageBuckets || 5;
  }

  /**
   * Observe a value
   * @param {Object} [labels] - Label values
   * @param {number} value - Value to observe
   */
  observe(labels = {}, value) {
    const entry = this._getEntry(labels);
    
    if (!entry.observations) {
      entry.observations = [];
    }
    
    entry.observations.push({
      value,
      timestamp: Date.now()
    });
    
    // Clean old observations
    this.#cleanOldObservations(entry);
    
    entry.timestamp = Date.now();
  }

  /**
   * Time a function execution
   * @template T
   * @param {Object} [labels] - Label values
   * @param {Function} fn - Function to time
   * @returns {Promise<T>} Function result
   */
  async time(labels = {}, fn) {
    const start = process.hrtime.bigint();
    
    try {
      return await fn();
    } finally {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      this.observe(labels, duration);
    }
  }

  /**
   * Calculate quantile
   * @param {Object} [labels] - Label values
   * @param {number} quantile - Quantile to calculate (0-1)
   * @returns {number}
   */
  getQuantile(labels = {}, quantile) {
    const entry = this._getEntry(labels);
    
    if (!entry.observations || entry.observations.length === 0) {
      return 0;
    }
    
    this.#cleanOldObservations(entry);
    
    const sorted = entry.observations
      .map(o => o.value)
      .sort((a, b) => a - b);
    
    const index = Math.ceil(sorted.length * quantile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get sum of all observations
   * @param {Object} [labels] - Label values
   * @returns {number}
   */
  getSum(labels = {}) {
    const entry = this._getEntry(labels);
    if (!entry.observations) return 0;
    
    this.#cleanOldObservations(entry);
    return entry.observations.reduce((sum, o) => sum + o.value, 0);
  }

  /**
   * Get count of observations
   * @param {Object} [labels] - Label values
   * @returns {number}
   */
  getCount(labels = {}) {
    const entry = this._getEntry(labels);
    if (!entry.observations) return 0;
    
    this.#cleanOldObservations(entry);
    return entry.observations.length;
  }

  /**
   * Clean old observations
   * @private
   * @param {Object} entry - Entry to clean
   */
  #cleanOldObservations(entry) {
    if (!entry.observations) return;
    
    const cutoff = Date.now() - this.#maxAge;
    entry.observations = entry.observations.filter(o => o.timestamp >= cutoff);
  }

  _getType() {
    return 'summary';
  }

  _createEntry(labels) {
    return { 
      ...super._createEntry(labels), 
      observations: []
    };
  }

  _getPrometheusLines() {
    const lines = [];
    
    for (const entry of this._getAllValues()) {
      const labels = this._formatLabels(entry.labels);
      
      // Quantile lines
      for (const quantile of this.#quantiles) {
        const value = this.getQuantile(entry.labels, quantile);
        const quantileLabels = labels.slice(0, -1) + (labels ? ',' : '{') + `quantile="${quantile}"}`;
        lines.push(`${this.name}${quantileLabels} ${value}`);
      }
      
      // Sum line
      lines.push(`${this.name}_sum${labels} ${this.getSum(entry.labels)}`);
      
      // Count line
      lines.push(`${this.name}_count${labels} ${this.getCount(entry.labels)}`);
    }
    
    return lines;
  }
}

// ============================================================================
// Metrics Middleware
// ============================================================================

/**
 * Metrics middleware for collecting and exposing Prometheus-compatible metrics
 */
export class MetricsMiddleware {
  #metrics;
  #config;
  #requestCounter;
  #requestDuration;
  #errorCounter;
  #activeRequests;

  /**
   * @param {Object} [config] - Configuration
   * @param {string} [config.prefix='cognimesh'] - Metric name prefix
   * @param {string[]} [config.defaultLabels] - Default label names
   */
  constructor(config = {}) {
    this.#config = {
      prefix: config.prefix || 'cognimesh',
      defaultLabels: config.defaultLabels || []
    };
    
    this.#metrics = new Map();
    
    // Initialize default metrics
    this.#requestCounter = this.createCounter({
      name: `${this.#config.prefix}_http_requests_total`,
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status']
    });
    
    this.#requestDuration = this.createHistogram({
      name: `${this.#config.prefix}_http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    });
    
    this.#errorCounter = this.createCounter({
      name: `${this.#config.prefix}_errors_total`,
      help: 'Total errors',
      labelNames: ['type', 'code']
    });
    
    this.#activeRequests = this.createGauge({
      name: `${this.#config.prefix}_active_requests`,
      help: 'Currently active requests'
    });
  }

  // ========================================================================
  // Metric Creation
  // ========================================================================

  /**
   * Create a counter metric
   * @param {MetricConfig} config - Metric configuration
   * @returns {Counter}
   */
  createCounter(config) {
    const metric = new Counter(config);
    this.#metrics.set(config.name, metric);
    return metric;
  }

  /**
   * Create a gauge metric
   * @param {MetricConfig} config - Metric configuration
   * @returns {Gauge}
   */
  createGauge(config) {
    const metric = new Gauge(config);
    this.#metrics.set(config.name, metric);
    return metric;
  }

  /**
   * Create a histogram metric
   * @param {MetricConfig} config - Metric configuration
   * @returns {Histogram}
   */
  createHistogram(config) {
    const metric = new Histogram(config);
    this.#metrics.set(config.name, metric);
    return metric;
  }

  /**
   * Create a summary metric
   * @param {MetricConfig} config - Metric configuration
   * @returns {Summary}
   */
  createSummary(config) {
    const metric = new Summary(config);
    this.#metrics.set(config.name, metric);
    return metric;
  }

  /**
   * Get a metric by name
   * @param {string} name - Metric name
   * @returns {BaseMetric|null}
   */
  getMetric(name) {
    return this.#metrics.get(name) || null;
  }

  // ========================================================================
  // Request Tracking
  // ========================================================================

  /**
   * Track request duration
   * @param {Object} labels - Label values
   * @param {number} duration - Duration in seconds
   */
  requestDuration(labels, duration) {
    this.#requestDuration.observe(labels, duration);
  }

  /**
   * Count a request
   * @param {Object} labels - Label values (method, route, status)
   */
  requestCount(labels) {
    this.#requestCounter.inc(labels, 1);
  }

  /**
   * Track error
   * @param {Object} labels - Label values (type, code)
   * @param {number} [count=1] - Error count
   */
  errorRate(labels, count = 1) {
    this.#errorCounter.inc(labels, count);
  }

  /**
   * Increment active requests
   */
  incrementActiveRequests() {
    this.#activeRequests.inc({}, 1);
  }

  /**
   * Decrement active requests
   */
  decrementActiveRequests() {
    this.#activeRequests.dec({}, 1);
  }

  /**
   * Track a request with full instrumentation
   * @template T
   * @param {Object} labels - Label values
   * @param {Function} fn - Function to track
   * @returns {Promise<T>}
   */
  async trackRequest(labels, fn) {
    this.incrementActiveRequests();
    const start = process.hrtime.bigint();
    
    try {
      const result = await fn();
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      
      this.requestCount({ ...labels, status: 'success' });
      this.requestDuration(labels, duration);
      
      return result;
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      
      this.requestCount({ ...labels, status: 'error' });
      this.requestDuration(labels, duration);
      this.errorRate({ type: 'request', code: error.code || 'UNKNOWN' });
      
      throw error;
    } finally {
      this.decrementActiveRequests();
    }
  }

  // ========================================================================
  // Metrics Endpoint
  // ========================================================================

  /**
   * Generate Prometheus metrics output
   * @returns {string} Prometheus format
   */
  metrics() {
    const lines = [];
    
    for (const metric of this.#metrics.values()) {
      lines.push(metric.toPrometheus());
    }
    
    return lines.join('\n\n') + '\n';
  }

  /**
   * Get metrics as JSON
   * @returns {Object} Metrics data
   */
  toJSON() {
    const result = {};
    
    for (const [name, metric] of this.#metrics) {
      result[name] = {
        type: metric._getType(),
        help: metric.help,
        labelNames: metric.labelNames
      };
    }
    
    return result;
  }

  /**
   * Reset all metrics
   */
  reset() {
    for (const metric of this.#metrics.values()) {
      metric.reset();
    }
  }

  /**
   * Get all metric names
   * @returns {string[]}
   */
  getMetricNames() {
    return Array.from(this.#metrics.keys());
  }

  /**
   * Express/Connect middleware handler
   * @returns {Function} Middleware function
   */
  middleware() {
    return async (req, res, next) => {
      if (req.path === '/metrics') {
        res.set('Content-Type', 'text/plain');
        res.send(this.metrics());
        return;
      }

      const labels = {
        method: req.method,
        route: req.route?.path || req.path
      };

      await this.trackRequest(labels, async () => {
        await new Promise((resolve, reject) => {
          res.on('finish', resolve);
          res.on('error', reject);
          next();
        });
      });
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

/**
 * Get default metrics middleware instance
 * @returns {MetricsMiddleware}
 */
export function getMetricsMiddleware() {
  if (!defaultInstance) {
    defaultInstance = new MetricsMiddleware();
  }
  return defaultInstance;
}

/**
 * Reset default instance (primarily for testing)
 */
export function resetMetricsMiddleware() {
  defaultInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export default MetricsMiddleware;
