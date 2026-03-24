/**
 * @fileoverview BIOS Health Monitor - Real-time System Health Monitoring
 * @module bios/health-monitor
 * @description Real-time health monitoring, metric collection, threshold checking, and alert generation
 * @version 5.0.0
 */

import { EventEmitter } from 'events';

/**
 * Health status levels
 * @readonly
 * @enum {string}
 */
export const HealthStatus = {
  HEALTHY: 'HEALTHY',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Alert severity levels
 * @readonly
 * @enum {string}
 */
export const AlertSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

/**
 * Default health metric thresholds
 * @constant {Object}
 */
export const DefaultThresholds = {
  // System metrics
  'memory.usage': { warning: 80, critical: 95, unit: '%' },
  'memory.heapUsed': { warning: 512, critical: 1024, unit: 'MB' },
  'cpu.usage': { warning: 70, critical: 90, unit: '%' },
  'eventLoop.lag': { warning: 100, critical: 500, unit: 'ms' },
  
  // Agent metrics
  'agents.active': { warning: 40, critical: 50, unit: 'count' },
  'agents.failureRate': { warning: 20, critical: 50, unit: '%' },
  
  // Client metrics
  'client.latency': { warning: 5000, critical: 10000, unit: 'ms' },
  'client.errorRate': { warning: 10, critical: 30, unit: '%' },
  
  // Task metrics
  'tasks.queueDepth': { warning: 100, critical: 500, unit: 'count' },
  'tasks.processingTime': { warning: 30000, critical: 120000, unit: 'ms' }
};

/**
 * Health Monitor - Real-time system health monitoring
 * @class
 * @extends EventEmitter
 * @description Collects metrics, checks thresholds, and generates alerts
 */
export class HealthMonitor extends EventEmitter {
  /**
   * Creates a new HealthMonitor
   * @constructor
   * @param {Object} [options={}] - Monitor options
   */
  constructor(options = {}) {
    super();
    
    /**
     * Monitor options
     * @type {Object}
     * @private
     */
    this._options = {
      collectionInterval: 5000,      // 5 seconds
      alertCooldown: 60000,          // 1 minute
      maxMetricsHistory: 1000,       // Keep last 1000 data points
      maxAlerts: 100,                // Keep last 100 alerts
      autoStart: false,
      ...options
    };
    
    /**
     * Metric collectors registry
     * @type {Map<string, Function>}
     * @private
     */
    this._collectors = new Map();
    
    /**
     * Metric data store (time series)
     * @type {Map<string, Array<Object>>}
     * @private
     */
    this._metrics = new Map();
    
    /**
     * Thresholds configuration
     * @type {Map<string, Object>}
     * @private
     */
    this._thresholds = new Map();
    
    /**
     * Alert history
     * @type {Array<Object>}
     * @private
     */
    this._alerts = [];
    
    /**
     * Alert cooldown tracking
     * @type {Map<string, number>}
     * @private
     */
    this._alertCooldowns = new Map();
    
    /**
     * Collection timer
     * @type {Timer|null}
     * @private
     */
    this._collectionTimer = null;
    
    /**
     * Monitor running state
     * @type {boolean}
     * @private
     */
    this._running = false;
    
    /**
     * Component health status
     * @type {Map<string, Object>}
     * @private
     */
    this._componentHealth = new Map();
    
    /**
     * Last collection timestamp
     * @type {number}
     * @private
     */
    this._lastCollection = 0;
    
    // Initialize default thresholds
    this._initializeDefaultThresholds();
    
    // Register built-in collectors
    this._registerBuiltinCollectors();
  }

  /**
   * Check if monitor is running
   * @returns {boolean}
   */
  get isRunning() {
    return this._running;
  }

  /**
   * Get last collection timestamp
   * @returns {number}
   */
  get lastCollection() {
    return this._lastCollection;
  }

  /**
   * Initialize default thresholds
   * @private
   */
  _initializeDefaultThresholds() {
    for (const [metric, thresholds] of Object.entries(DefaultThresholds)) {
      this._thresholds.set(metric, thresholds);
    }
  }

  /**
   * Register built-in metric collectors
   * @private
   */
  _registerBuiltinCollectors() {
    this.registerCollector('system.memory', () => this._collectMemoryMetrics());
    this.registerCollector('system.cpu', () => this._collectCPUMetrics());
    this.registerCollector('system.eventloop', () => this._collectEventLoopMetrics());
    this.registerCollector('system.process', () => this._collectProcessMetrics());
  }

  /**
   * Initialize the health monitor
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    this.emit('monitor:initialized');
    
    if (this._options.autoStart) {
      this.start();
    }
  }

  /**
   * Start metric collection
   */
  start() {
    if (this._running) {
      return;
    }
    
    this._running = true;
    this.emit('monitor:started');
    
    // Immediate first collection
    this._collectAll();
    
    // Schedule periodic collection
    this._collectionTimer = setInterval(() => {
      this._collectAll();
    }, this._options.collectionInterval);
  }

  /**
   * Stop metric collection
   */
  stop() {
    if (!this._running) {
      return;
    }
    
    this._running = false;
    
    if (this._collectionTimer) {
      clearInterval(this._collectionTimer);
      this._collectionTimer = null;
    }
    
    this.emit('monitor:stopped');
  }

  /**
   * Collect all registered metrics
   * @private
   */
  async _collectAll() {
    const timestamp = Date.now();
    this._lastCollection = timestamp;
    
    for (const [name, collector] of this._collectors) {
      try {
        const value = await collector();
        
        if (value !== null && value !== undefined) {
          this._recordMetric(name, value, timestamp);
          this._checkThreshold(name, value);
        }
      } catch (error) {
        this.emit('collector:error', { name, error: error.message });
      }
    }
    
    this.emit('metrics:collected', { timestamp, count: this._collectors.size });
  }

  /**
   * Record a metric value
   * @private
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {number} timestamp - Timestamp
   */
  _recordMetric(name, value, timestamp) {
    if (!this._metrics.has(name)) {
      this._metrics.set(name, []);
    }
    
    const series = this._metrics.get(name);
    
    series.push({
      timestamp,
      value: typeof value === 'number' ? value : Number(value)
    });
    
    // Trim history to max size
    if (series.length > this._options.maxMetricsHistory) {
      series.shift();
    }
  }

  /**
   * Check metric against thresholds
   * @private
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   */
  _checkThreshold(name, value) {
    const thresholds = this._thresholds.get(name);
    
    if (!thresholds) {
      return;
    }
    
    const numValue = typeof value === 'number' ? value : Number(value);
    
    // Determine status
    let status = HealthStatus.HEALTHY;
    
    if (thresholds.critical !== undefined && numValue >= thresholds.critical) {
      status = HealthStatus.CRITICAL;
    } else if (thresholds.warning !== undefined && numValue >= thresholds.warning) {
      status = HealthStatus.WARNING;
    }
    
    // Generate alert if not healthy
    if (status !== HealthStatus.HEALTHY) {
      this._generateAlert(name, numValue, status, thresholds);
    }
  }

  /**
   * Generate health alert
   * @private
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {HealthStatus} status - Health status
   * @param {Object} thresholds - Threshold configuration
   */
  _generateAlert(metric, value, status, thresholds) {
    const alertKey = `${metric}:${status}`;
    const now = Date.now();
    
    // Check cooldown
    const lastAlert = this._alertCooldowns.get(alertKey);
    if (lastAlert && (now - lastAlert) < this._options.alertCooldown) {
      return;
    }
    
    this._alertCooldowns.set(alertKey, now);
    
    const severity = status === HealthStatus.CRITICAL ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
    
    const alert = {
      id: `alert-${now}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      metric,
      value,
      status,
      severity,
      thresholds,
      message: this._formatAlertMessage(metric, value, status, thresholds)
    };
    
    this._alerts.push(alert);
    
    // Trim alert history
    if (this._alerts.length > this._options.maxAlerts) {
      this._alerts.shift();
    }
    
    this.emit('alert', alert);
    this.emit(`alert:${severity.toLowerCase()}`, alert);
  }

  /**
   * Format alert message
   * @private
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {HealthStatus} status - Health status
   * @param {Object} thresholds - Threshold configuration
   * @returns {string} Formatted message
   */
  _formatAlertMessage(metric, value, status, thresholds) {
    const unit = thresholds.unit || '';
    const threshold = status === HealthStatus.CRITICAL 
      ? thresholds.critical 
      : thresholds.warning;
    
    return `${metric} is ${status.toLowerCase()}: ${value}${unit} (threshold: ${threshold}${unit})`;
  }

  /**
   * Collect memory metrics
   * @private
   * @returns {Promise<Object>}
   */
  async _collectMemoryMetrics() {
    const usage = process.memoryUsage();
    
    // Calculate percentage
    const totalSystem = usage.heapTotal + usage.external;
    const usedPercent = (usage.heapUsed / usage.heapTotal) * 100;
    
    return {
      'memory.heapUsed': Math.round(usage.heapUsed / 1024 / 1024),
      'memory.heapTotal': Math.round(usage.heapTotal / 1024 / 1024),
      'memory.rss': Math.round(usage.rss / 1024 / 1024),
      'memory.external': Math.round(usage.external / 1024 / 1024),
      'memory.usage': Math.round(usedPercent)
    };
  }

  /**
   * Collect CPU metrics
   * @private
   * @returns {Promise<Object>}
   */
  async _collectCPUMetrics() {
    // CPU usage estimation based on event loop
    const startUsage = process.cpuUsage();
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const userPercent = (endUsage.user / 1000000) * 10; // Convert to approximate %
        const systemPercent = (endUsage.system / 1000000) * 10;
        
        resolve({
          'cpu.user': Math.round(userPercent),
          'cpu.system': Math.round(systemPercent),
          'cpu.usage': Math.round(userPercent + systemPercent)
        });
      }, 100);
    });
  }

  /**
   * Collect event loop metrics
   * @private
   * @returns {Promise<Object>}
   */
  async _collectEventLoopMetrics() {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000;
        
        resolve({
          'eventLoop.lag': Math.round(lag)
        });
      });
    });
  }

  /**
   * Collect process metrics
   * @private
   * @returns {Object}
   */
  _collectProcessMetrics() {
    return {
      'process.uptime': Math.round(process.uptime()),
      'process.pid': process.pid,
      'process.activeHandles': process._getActiveHandles?.().length || 0,
      'process.activeRequests': process._getActiveRequests?.().length || 0
    };
  }

  /**
   * Register a metric collector
   * @param {string} name - Collector name
   * @param {Function} collector - Collector function
   */
  registerCollector(name, collector) {
    this._collectors.set(name, collector);
  }

  /**
   * Unregister a metric collector
   * @param {string} name - Collector name
   * @returns {boolean}
   */
  unregisterCollector(name) {
    return this._collectors.delete(name);
  }

  /**
   * Set threshold for a metric
   * @param {string} metric - Metric name
   * @param {Object} thresholds - Threshold configuration
   * @param {number} [thresholds.warning] - Warning threshold
   * @param {number} [thresholds.critical] - Critical threshold
   * @param {string} [thresholds.unit] - Unit of measurement
   */
  setThreshold(metric, thresholds) {
    this._thresholds.set(metric, thresholds);
  }

  /**
   * Get threshold for a metric
   * @param {string} metric - Metric name
   * @returns {Object|undefined}
   */
  getThreshold(metric) {
    return this._thresholds.get(metric);
  }

  /**
   * Get all thresholds
   * @returns {Object}
   */
  getAllThresholds() {
    return Object.fromEntries(this._thresholds);
  }

  /**
   * Get metric time series
   * @param {string} name - Metric name
   * @param {Object} [options={}] - Query options
   * @returns {Array<Object>}
   */
  getMetricSeries(name, options = {}) {
    const series = this._metrics.get(name) || [];
    
    if (options.since) {
      return series.filter(m => m.timestamp >= options.since);
    }
    
    if (options.limit) {
      return series.slice(-options.limit);
    }
    
    return [...series];
  }

  /**
   * Get latest metric value
   * @param {string} name - Metric name
   * @returns {Object|null}
   */
  getLatestMetric(name) {
    const series = this._metrics.get(name);
    
    if (!series || series.length === 0) {
      return null;
    }
    
    return series[series.length - 1];
  }

  /**
   * Get all current metrics
   * @returns {Object}
   */
  getAllMetrics() {
    const metrics = {};
    
    for (const [name, series] of this._metrics) {
      const latest = series[series.length - 1];
      if (latest) {
        metrics[name] = latest.value;
      }
    }
    
    return metrics;
  }

  /**
   * Get metric statistics
   * @param {string} name - Metric name
   * @param {Object} [options={}] - Query options
   * @returns {Object|null}
   */
  getMetricStats(name, options = {}) {
    const series = this.getMetricSeries(name, options);
    
    if (series.length === 0) {
      return null;
    }
    
    const values = series.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Calculate standard deviation
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(avgSquareDiff);
    
    return {
      count: values.length,
      min,
      max,
      avg: Math.round(avg * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      current: values[values.length - 1]
    };
  }

  /**
   * Update component health status
   * @param {string} componentId - Component identifier
   * @param {HealthStatus} status - Health status
   * @param {Object} [details={}] - Additional details
   */
  updateComponentHealth(componentId, status, details = {}) {
    const previous = this._componentHealth.get(componentId);
    
    this._componentHealth.set(componentId, {
      status,
      timestamp: Date.now(),
      ...details
    });
    
    // Emit status change event
    if (!previous || previous.status !== status) {
      this.emit('component:health:changed', {
        component: componentId,
        status,
        previous: previous?.status
      });
    }
  }

  /**
   * Get component health status
   * @param {string} componentId - Component identifier
   * @returns {Object|undefined}
   */
  getComponentHealth(componentId) {
    return this._componentHealth.get(componentId);
  }

  /**
   * Get all component health statuses
   * @returns {Object}
   */
  getAllComponentHealth() {
    return Object.fromEntries(this._componentHealth);
  }

  /**
   * Get overall system health
   * @returns {Object}
   */
  getSystemHealth() {
    const components = Array.from(this._componentHealth.values());
    
    if (components.length === 0) {
      return {
        status: HealthStatus.UNKNOWN,
        components: { total: 0, healthy: 0, warning: 0, error: 0, critical: 0 }
      };
    }
    
    const counts = {
      total: components.length,
      healthy: components.filter(c => c.status === HealthStatus.HEALTHY).length,
      warning: components.filter(c => c.status === HealthStatus.WARNING).length,
      error: components.filter(c => c.status === HealthStatus.ERROR).length,
      critical: components.filter(c => c.status === HealthStatus.CRITICAL).length
    };
    
    // Determine overall status
    let status = HealthStatus.HEALTHY;
    
    if (counts.critical > 0) {
      status = HealthStatus.CRITICAL;
    } else if (counts.error > 0) {
      status = HealthStatus.ERROR;
    } else if (counts.warning > 0) {
      status = HealthStatus.WARNING;
    }
    
    return {
      status,
      components: counts,
      timestamp: Date.now()
    };
  }

  /**
   * Get alerts
   * @param {Object} [options={}] - Query options
   * @returns {Array<Object>}
   */
  getAlerts(options = {}) {
    let alerts = [...this._alerts];
    
    if (options.severity) {
      alerts = alerts.filter(a => a.severity === options.severity);
    }
    
    if (options.since) {
      alerts = alerts.filter(a => a.timestamp >= options.since);
    }
    
    if (options.limit) {
      alerts = alerts.slice(-options.limit);
    }
    
    return alerts;
  }

  /**
   * Get active alerts (not resolved)
   * @returns {Array<Object>}
   */
  getActiveAlerts() {
    // For now, return all alerts (could be enhanced with alert resolution)
    return [...this._alerts];
  }

  /**
   * Clear alerts
   * @param {Object} [options={}] - Clear options
   */
  clearAlerts(options = {}) {
    if (options.all) {
      this._alerts = [];
      this._alertCooldowns.clear();
    } else if (options.before) {
      this._alerts = this._alerts.filter(a => a.timestamp >= options.before);
    }
    
    this.emit('alerts:cleared');
  }

  /**
   * Acknowledge an alert
   * @param {string} alertId - Alert ID
   * @returns {boolean}
   */
  acknowledgeAlert(alertId) {
    const alert = this._alerts.find(a => a.id === alertId);
    
    if (!alert) {
      return false;
    }
    
    alert.acknowledged = true;
    alert.acknowledgedAt = Date.now();
    
    this.emit('alert:acknowledged', alert);
    
    return true;
  }

  /**
   * Force immediate metric collection
   * @async
   * @returns {Promise<void>}
   */
  async collectNow() {
    await this._collectAll();
  }

  /**
   * Get monitor status
   * @returns {Object}
   */
  getStatus() {
    return {
      running: this._running,
      lastCollection: this._lastCollection,
      collectors: this._collectors.size,
      metrics: this._metrics.size,
      alerts: this._alerts.length,
      components: this._componentHealth.size
    };
  }

  /**
   * Dispose of the monitor
   */
  dispose() {
    this.stop();
    this._collectors.clear();
    this._metrics.clear();
    this._alerts = [];
    this._alertCooldowns.clear();
    this._componentHealth.clear();
    this.removeAllListeners();
  }

  /**
   * Health check for BIOS component interface
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    const systemHealth = this.getSystemHealth();
    
    return {
      healthy: systemHealth.status !== HealthStatus.CRITICAL && systemHealth.status !== HealthStatus.ERROR,
      status: systemHealth.status,
      message: `Health monitor ${this._running ? 'running' : 'stopped'}`,
      details: {
        running: this._running,
        collectors: this._collectors.size,
        metrics: this._metrics.size,
        alerts: this._alerts.length
      }
    };
  }

  /**
   * Shutdown for BIOS component interface
   */
  async shutdown() {
    this.dispose();
  }
}

export default HealthMonitor;
