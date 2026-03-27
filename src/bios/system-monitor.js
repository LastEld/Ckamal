/**
 * @fileoverview System Health Monitor for CogniMesh BIOS
 * @module bios/system-monitor
 * @description Event-driven system health monitoring and alerting
 * @version 5.0.0
 */

import { EventEmitter } from 'events';

/**
 * Alert severity levels
 * @readonly
 * @enum {string}
 */
export const AlertLevel = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

/**
 * Health metric types
 * @readonly
 * @enum {string}
 */
export const MetricType = {
  CPU: 'cpu',
  MEMORY: 'memory',
  DISK: 'disk',
  NETWORK: 'network',
  COMPONENT: 'component',
  CUSTOM: 'custom'
};

/**
 * Health alert structure
 * @typedef {Object} HealthAlert
 * @property {string} id - Unique alert identifier
 * @property {AlertLevel} level - Alert severity
 * @property {string} source - Alert source (component/metric name)
 * @property {string} message - Human-readable alert message
 * @property {number} timestamp - Alert timestamp
 * @property {Object} [data] - Additional alert data
 */

/**
 * Health metric structure
 * @typedef {Object} HealthMetric
 * @property {MetricType} type - Metric type
 * @property {string} name - Metric name
 * @property {number} value - Current value
 * @property {number} [threshold] - Warning threshold
 * @property {number} [criticalThreshold] - Critical threshold
 * @property {string} [unit] - Value unit (%, MB, ms, etc.)
 */

/**
 * System Monitor - Health monitoring and alerting subsystem
 * @class
 * @extends EventEmitter
 * @description Monitors system health, tracks metrics, and emits alerts
 */
export class SystemMonitor extends EventEmitter {
  /**
   * Default check interval in milliseconds
   * @static
   * @type {number}
   */
  static DEFAULT_INTERVAL = 30000; // 30 seconds

  /**
   * Maximum alerts to retain in history
   * @static
   * @type {number}
   */
  static MAX_ALERT_HISTORY = 100;

  /**
   * Creates a new SystemMonitor instance
   * @constructor
   * @param {Object} [options={}] - Monitor configuration
   * @param {number} [options.checkInterval=30000] - Health check interval
   * @param {boolean} [options.autoStart=true] - Auto-start monitoring
   */
  constructor(options = {}) {
    super();
    
    /**
     * Monitor configuration
     * @type {Object}
     * @private
     */
    this._config = {
      checkInterval: options.checkInterval || SystemMonitor.DEFAULT_INTERVAL,
      autoStart: options.autoStart !== false
    };
    
    /**
     * Monitor initialization state
     * @type {boolean}
     * @private
     */
    this._initialized = false;
    
    /**
     * Active monitoring state
     * @type {boolean}
     * @private
     */
    this._active = false;
    
    /**
     * Health check interval handle
     * @type {Timer|null}
     * @private
     */
    this._intervalHandle = null;
    
    /**
     * Registered health metrics
     * @type {Map<string, HealthMetric>}
     * @private
     */
    this._metrics = new Map();
    
    /**
     * Alert history
     * @type {HealthAlert[]}
     * @private
     */
    this._alertHistory = [];
    
    /**
     * Active (unacknowledged) alerts
     * @type {Map<string, HealthAlert>}
     * @private
     */
    this._activeAlerts = new Map();
    
    /**
     * Metric history for trend analysis
     * @type {Map<string, Array<{timestamp: number, value: number}>>}
     * @private
     */
    this._metricHistory = new Map();
    
    /**
     * Maximum history entries per metric
     * @type {number}
     * @private
     */
    this._maxHistory = 100;
    
    /**
     * Component type identifier
     * @type {string}
     */
    this.type = 'system-monitor';
  }

  /**
   * Initialize the system monitor
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) {
      return;
    }
    
    this._setupDefaultMetrics();
    
    if (this._config.autoStart) {
      this.start();
    }
    
    this._initialized = true;
    this.emit('monitor:initialized');
  }

  /**
   * Setup default system metrics
   * @private
   */
  _setupDefaultMetrics() {
    // Memory usage metric
    this.registerMetric({
      type: MetricType.MEMORY,
      name: 'memory.usage',
      threshold: 80,
      criticalThreshold: 95,
      unit: '%'
    });
    
    // CPU usage metric (if available)
    this.registerMetric({
      type: MetricType.CPU,
      name: 'cpu.usage',
      threshold: 70,
      criticalThreshold: 90,
      unit: '%'
    });
  }

  /**
   * Start health monitoring
   * @returns {boolean} True if monitoring started
   */
  start() {
    if (this._active) {
      return false;
    }
    
    this._active = true;
    this._scheduleChecks();
    this.emit('monitor:started');
    return true;
  }

  /**
   * Stop health monitoring
   * @returns {boolean} True if monitoring stopped
   */
  stop() {
    if (!this._active) {
      return false;
    }
    
    this._active = false;
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
    
    this.emit('monitor:stopped');
    return true;
  }

  /**
   * Schedule periodic health checks
   * @private
   */
  _scheduleChecks() {
    this._intervalHandle = setInterval(() => {
      this._runHealthChecks();
    }, this._config.checkInterval);

    if (typeof this._intervalHandle.unref === 'function') {
      this._intervalHandle.unref();
    }
    
    // Run immediate check
    this._runHealthChecks();
  }

  /**
   * Execute health checks for all metrics
   * @private
   * @async
   */
  async _runHealthChecks() {
    try {
      // Memory check
      await this._checkMemory();
      
      // CPU check
      await this._checkCpu();
      
      // Custom metrics
      for (const [name, metric] of this._metrics) {
        if (metric.checkFn) {
          const value = await metric.checkFn();
          this.recordMetric(name, value);
        }
      }
      
      this.emit('monitor:check:complete');
    } catch (error) {
      this.emit('monitor:check:error', error);
    }
  }

  /**
   * Check system memory usage
   * @private
   * @async
   */
  async _checkMemory() {
    const usage = process.memoryUsage();
    const totalUsed = usage.heapUsed + usage.external;
    const totalAvailable = usage.heapTotal + usage.external;
    const percentage = (totalUsed / totalAvailable) * 100;
    
    this.recordMetric('memory.usage', percentage, {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss
    });
  }

  /**
   * Check CPU usage (simplified estimation)
   * @private
   * @async
   */
  async _checkCpu() {
    const intervalMs = 500;
    const startUsage = process.cpuUsage();
    const startTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    const endUsage = process.cpuUsage(startUsage);
    const elapsed = Date.now() - startTime;

    const userMs = endUsage.user / 1000;
    const systemMs = endUsage.system / 1000;
    const cpuCount = (await import('os')).cpus().length;
    const percentage = Math.min(((userMs + systemMs) / (elapsed * cpuCount)) * 100, 100);

    this.recordMetric('cpu.usage', percentage, {
      user: userMs,
      system: systemMs
    });
  }

  /**
   * Register a new health metric
   * @param {Object} config - Metric configuration
   * @param {MetricType} config.type - Metric type
   * @param {string} config.name - Unique metric name
   * @param {number} [config.threshold] - Warning threshold
   * @param {number} [config.criticalThreshold] - Critical threshold
   * @param {string} [config.unit] - Value unit
   * @param {Function} [config.checkFn] - Custom check function
   */
  registerMetric(config) {
    const metric = {
      type: config.type,
      name: config.name,
      threshold: config.threshold,
      criticalThreshold: config.criticalThreshold,
      unit: config.unit,
      checkFn: config.checkFn
    };
    
    this._metrics.set(config.name, metric);
    this._metricHistory.set(config.name, []);
  }

  /**
   * Record a metric value
   * @param {string} name - Metric name
   * @param {number} value - Current value
   * @param {Object} [metadata] - Additional metric metadata
   */
  recordMetric(name, value, metadata = {}) {
    const metric = this._metrics.get(name);
    if (!metric) {
      return;
    }
    
    const timestamp = Date.now();
    
    // Store in history
    const history = this._metricHistory.get(name);
    history.push({ timestamp, value, metadata });
    
    // Trim history if needed
    if (history.length > this._maxHistory) {
      history.shift();
    }
    
    // Check thresholds
    this._evaluateThresholds(name, value, metric);
    
    this.emit('metric:recorded', { name, value, timestamp, metadata });
  }

  /**
   * Evaluate metric against thresholds
   * @private
   * @param {string} name - Metric name
   * @param {number} value - Current value
   * @param {Object} metric - Metric configuration
   */
  _evaluateThresholds(name, value, metric) {
    // Critical threshold check
    if (metric.criticalThreshold !== undefined && value >= metric.criticalThreshold) {
      this._raiseAlert({
        level: AlertLevel.CRITICAL,
        source: name,
        message: `${name} at critical level: ${value.toFixed(2)}${metric.unit || ''}`,
        data: { value, threshold: metric.criticalThreshold }
      });
    }
    // Warning threshold check
    else if (metric.threshold !== undefined && value >= metric.threshold) {
      this._raiseAlert({
        level: AlertLevel.WARNING,
        source: name,
        message: `${name} above threshold: ${value.toFixed(2)}${metric.unit || ''}`,
        data: { value, threshold: metric.threshold }
      });
    }
    // Clear alert if value is back to normal
    else {
      const alertId = `alert:${name}`;
      if (this._activeAlerts.has(alertId)) {
        this.acknowledgeAlert(alertId, 'Value returned to normal range');
      }
    }
  }

  /**
   * Raise a health alert
   * @private
   * @param {Object} alertData - Alert data
   */
  _raiseAlert(alertData) {
    const id = `alert:${alertData.source}`;
    
    const alert = {
      id,
      level: alertData.level,
      source: alertData.source,
      message: alertData.message,
      timestamp: Date.now(),
      data: alertData.data || {}
    };
    
    // Store in active alerts
    this._activeAlerts.set(id, alert);
    
    // Add to history
    this._alertHistory.unshift(alert);
    if (this._alertHistory.length > SystemMonitor.MAX_ALERT_HISTORY) {
      this._alertHistory.pop();
    }
    
    // Emit appropriate event
    this.emit('alert', alert);
    
    if (alert.level === AlertLevel.CRITICAL) {
      this.emit('critical', new Error(alert.message));
    }
    
    if (alert.level === AlertLevel.ERROR) {
      this.emit('error', alert);
    }
  }

  /**
   * Acknowledge an active alert
   * @param {string} alertId - Alert identifier
   * @param {string} [reason] - Acknowledgment reason
   * @returns {boolean} True if alert was acknowledged
   */
  acknowledgeAlert(alertId, reason) {
    const alert = this._activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }
    
    this._activeAlerts.delete(alertId);
    
    this.emit('alert:acknowledged', {
      alert,
      reason,
      acknowledgedAt: Date.now()
    });
    
    return true;
  }

  /**
   * Get current monitor status
   * @returns {Object} Monitor status
   */
  getStatus() {
    return {
      initialized: this._initialized,
      active: this._active,
      metrics: Array.from(this._metrics.keys()),
      activeAlerts: Array.from(this._activeAlerts.values()),
      alertCount: this._activeAlerts.size,
      historyCount: this._alertHistory.length
    };
  }

  /**
   * Health check for BIOS component interface
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    return {
      healthy: this._initialized && this._active,
      status: this.getStatus(),
      message: this._active ? 'Monitor active' : 'Monitor not active'
    };
  }

  /**
   * Get alert history
   * @param {Object} [options={}] - Query options
   * @param {AlertLevel} [options.level] - Filter by level
   * @param {number} [options.limit=50] - Maximum results
   * @returns {HealthAlert[]} Alert history
   */
  getAlertHistory(options = {}) {
    let alerts = [...this._alertHistory];
    
    if (options.level) {
      alerts = alerts.filter(a => a.level === options.level);
    }
    
    if (options.limit) {
      alerts = alerts.slice(0, options.limit);
    }
    
    return alerts;
  }

  /**
   * Get metric history
   * @param {string} name - Metric name
   * @param {Object} [options={}] - Query options
   * @param {number} [options.limit=50] - Maximum results
   * @returns {Array<{timestamp: number, value: number}>} Metric history
   */
  getMetricHistory(name, options = {}) {
    const history = this._metricHistory.get(name) || [];
    const limit = options.limit || 50;
    return history.slice(-limit);
  }

  /**
   * Dispose of the monitor and cleanup resources
   */
  dispose() {
    this.stop();
    this._metrics.clear();
    this._activeAlerts.clear();
    this._alertHistory = [];
    this._metricHistory.clear();
    this.removeAllListeners();
    this._initialized = false;
  }

  /**
   * Graceful shutdown for BIOS component interface
   */
  async shutdown() {
    this.dispose();
  }
}

export default SystemMonitor;
