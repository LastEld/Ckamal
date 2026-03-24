/**
 * @fileoverview Queue monitoring with statistics, alerting, and dashboard integration.
 * @module queue/monitor
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('queue-monitor');

/**
 * Alert severity levels.
 * @readonly
 * @enum {string}
 */
export const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * Metric types.
 * @readonly
 * @enum {string}
 */
export const MetricType = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  RATE: 'rate'
};

/**
 * @typedef {Object} AlertRule
 * @property {string} id - Rule identifier
 * @property {string} name - Rule name
 * @property {string} metric - Metric to monitor
 * @property {string} operator - Comparison operator ('gt', 'lt', 'eq', 'gte', 'lte')
 * @property {number} threshold - Threshold value
 * @property {AlertSeverity} severity - Alert severity
 * @property {string} [message] - Alert message template
 * @property {number} [cooldown] - Cooldown period in milliseconds
 * @property {boolean} [enabled] - Whether rule is enabled
 */

/**
 * @typedef {Object} Alert
 * @property {string} id - Alert identifier
 * @property {string} ruleId - Rule that triggered this alert
 * @property {string} name - Alert name
 * @property {AlertSeverity} severity - Alert severity
 * @property {string} message - Alert message
 * @property {number} timestamp - When alert was triggered
 * @property {Object} context - Alert context data
 * @property {boolean} acknowledged - Whether alert is acknowledged
 * @property {number} [acknowledgedAt] - When alert was acknowledged
 * @property {string} [acknowledgedBy] - Who acknowledged the alert
 */

/**
 * @typedef {Object} MetricSnapshot
 * @property {string} name - Metric name
 * @property {MetricType} type - Metric type
 * @property {number} value - Current value
 * @property {number} timestamp - When metric was recorded
 * @property {Object} [labels] - Metric labels/tags
 */

/**
 * Queue Monitor with statistics collection, alerting, and dashboard integration.
 * @extends EventEmitter
 */
export class QueueMonitor extends EventEmitter {
  /**
   * @param {Object} [options] - Monitor options
   * @param {number} [options.metricsRetention=3600] - Metrics retention in seconds
   * @param {number} [options.snapshotInterval=60000] - Snapshot interval in milliseconds
   * @param {boolean} [options.autoSnapshot=true] - Whether to auto-snapshot
   * @param {boolean} [options.emitEvents=true] - Whether to emit events
   */
  constructor(options = {}) {
    super();
    this.metricsRetention = options.metricsRetention ?? 3600; // 1 hour
    this.snapshotInterval = options.snapshotInterval ?? 60000; // 1 minute
    this.autoSnapshot = options.autoSnapshot !== false;
    this.emitEvents = options.emitEvents !== false;
    
    /** @type {Map<string, AlertRule>} */
    this.alertRules = new Map();
    /** @type {Map<string, Alert>} */
    this.activeAlerts = new Map();
    /** @type {Alert[]} */
    this.alertHistory = [];
    /** @type {Map<string, MetricSnapshot[]>} */
    this.metrics = new Map();
    /** @type {Map<string, number>} */
    this.counters = new Map();
    /** @type {Map<string, number>} */
    this.gauges = new Map();
    /** @type {Object} */
    this.components = {};
    
    this.stats = {
      totalAlerts: 0,
      acknowledgedAlerts: 0,
      resolvedAlerts: 0
    };

    // Start auto-snapshot if enabled
    if (this.autoSnapshot) {
      this.#startSnapshotInterval();
    }
  }

  /**
   * Generate unique IDs.
   * @param {string} prefix
   * @returns {string}
   * @private
   */
  #generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start snapshot interval.
   * @private
   */
  #startSnapshotInterval() {
    this.snapshotTimer = setInterval(() => {
      this.takeSnapshot();
    }, this.snapshotInterval);
  }

  /**
   * Register a queue component for monitoring.
   * @param {string} name - Component name
   * @param {Object} component - Component instance (TaskQueue, Scheduler, Executor, etc.)
   * @returns {this}
   */
  registerComponent(name, component) {
    this.components[name] = component;
    
    // Listen to component events if available
    if (component.on) {
      component.on('task:enqueued', (data) => {
        this.increment(`queue.${name}.enqueued`);
        this.emit('event', { type: 'task:enqueued', component: name, data });
      });
      
      component.on('task:started', (data) => {
        this.increment(`queue.${name}.started`);
        this.emit('event', { type: 'task:started', component: name, data });
      });
      
      component.on('task:completed', (data) => {
        this.increment(`queue.${name}.completed`);
        this.recordDuration(`queue.${name}.duration`, data?.duration || 0);
        this.emit('event', { type: 'task:completed', component: name, data });
      });
      
      component.on('task:failed', (data) => {
        this.increment(`queue.${name}.failed`);
        this.emit('event', { type: 'task:failed', component: name, data });
      });
      
      component.on('task:cancelled', (data) => {
        this.increment(`queue.${name}.cancelled`);
        this.emit('event', { type: 'task:cancelled', component: name, data });
      });
    }

    logger.info(`Registered component for monitoring: ${name}`);
    
    return this;
  }

  /**
   * Unregister a component.
   * @param {string} name - Component name
   * @returns {boolean}
   */
  unregisterComponent(name) {
    if (this.components[name]) {
      delete this.components[name];
      logger.info(`Unregistered component: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Increment a counter metric.
   * @param {string} name - Metric name
   * @param {number} [value=1] - Amount to increment
   * @param {Object} [labels] - Metric labels
   */
  increment(name, value = 1, labels = {}) {
    const key = this.#metricKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    this.#recordMetric(name, MetricType.COUNTER, current + value, labels);
  }

  /**
   * Set a gauge metric.
   * @param {string} name - Metric name
   * @param {number} value - Gauge value
   * @param {Object} [labels] - Metric labels
   */
  gauge(name, value, labels = {}) {
    const key = this.#metricKey(name, labels);
    this.gauges.set(key, value);
    this.#recordMetric(name, MetricType.GAUGE, value, labels);
  }

  /**
   * Record a histogram value.
   * @param {string} name - Metric name
   * @param {number} value - Value to record
   * @param {Object} [labels] - Metric labels
   */
  recordDuration(name, value, labels = {}) {
    this.#recordMetric(name, MetricType.HISTOGRAM, value, labels);
  }

  /**
   * Calculate and record rate.
   * @param {string} name - Metric name
   * @param {number} count - Count in period
   * @param {number} periodSeconds - Period in seconds
   * @param {Object} [labels] - Metric labels
   */
  recordRate(name, count, periodSeconds, labels = {}) {
    const rate = count / periodSeconds;
    this.#recordMetric(name, MetricType.RATE, rate, labels);
  }

  /**
   * Create metric key from name and labels.
   * @param {string} name
   * @param {Object} labels
   * @returns {string}
   * @private
   */
  #metricKey(name, labels) {
    if (Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  /**
   * Record a metric snapshot.
   * @param {string} name
   * @param {MetricType} type
   * @param {number} value
   * @param {Object} labels
   * @private
   */
  #recordMetric(name, type, value, labels) {
    const snapshots = this.metrics.get(name) || [];
    snapshots.push({
      name,
      type,
      value,
      timestamp: Date.now(),
      labels
    });

    // Keep only recent metrics
    const cutoff = Date.now() - (this.metricsRetention * 1000);
    while (snapshots.length > 0 && snapshots[0].timestamp < cutoff) {
      snapshots.shift();
    }

    this.metrics.set(name, snapshots);
  }

  /**
   * Get current metric value.
   * @param {string} name
   * @param {Object} [labels]
   * @returns {number|null}
   */
  getMetric(name, labels = {}) {
    const key = this.#metricKey(name, labels);
    return this.counters.get(key) ?? this.gauges.get(key) ?? null;
  }

  /**
   * Get metric history.
   * @param {string} name
   * @param {number} [duration] - Duration in milliseconds
   * @returns {MetricSnapshot[]}
   */
  getMetricHistory(name, duration) {
    const snapshots = this.metrics.get(name) || [];
    
    if (duration) {
      const cutoff = Date.now() - duration;
      return snapshots.filter(s => s.timestamp >= cutoff);
    }
    
    return [...snapshots];
  }

  /**
   * Add an alert rule.
   * @param {AlertRule} rule
   * @returns {string} Rule ID
   */
  addAlertRule(rule) {
    const id = rule.id || this.#generateId('rule');
    const fullRule = {
      ...rule,
      id,
      cooldown: rule.cooldown ?? 60000, // 1 minute default
      enabled: rule.enabled !== false,
      lastTriggered: 0
    };
    
    this.alertRules.set(id, fullRule);
    logger.info(`Added alert rule: ${id} (${rule.name})`);
    
    return id;
  }

  /**
   * Remove an alert rule.
   * @param {string} ruleId
   * @returns {boolean}
   */
  removeAlertRule(ruleId) {
    return this.alertRules.delete(ruleId);
  }

  /**
   * Enable/disable alert rule.
   * @param {string} ruleId
   * @param {boolean} enabled
   * @returns {boolean}
   */
  setRuleEnabled(ruleId, enabled) {
    const rule = this.alertRules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Evaluate alert rules.
   * @returns {Alert[]}
   */
  evaluateRules() {
    const triggered = [];
    const now = Date.now();

    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      if (now - rule.lastTriggered < rule.cooldown) continue;

      const value = this.getMetric(rule.metric);
      if (value === null) continue;

      const shouldTrigger = this.#compare(value, rule.operator, rule.threshold);
      
      if (shouldTrigger) {
        rule.lastTriggered = now;
        const alert = this.#createAlert(rule, value);
        triggered.push(alert);
      }
    }

    return triggered;
  }

  /**
   * Compare value with threshold.
   * @param {number} value
   * @param {string} operator
   * @param {number} threshold
   * @returns {boolean}
   * @private
   */
  #compare(value, operator, threshold) {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      default: return false;
    }
  }

  /**
   * Create an alert.
   * @param {AlertRule} rule
   * @param {number} value
   * @returns {Alert}
   * @private
   */
  #createAlert(rule, value) {
    const id = this.#generateId('alert');
    const message = rule.message 
      ? rule.message.replace('{{value}}', value).replace('{{threshold}}', rule.threshold)
      : `${rule.name}: ${rule.metric} is ${value} (threshold: ${rule.threshold})`;

    const alert = {
      id,
      ruleId: rule.id,
      name: rule.name,
      severity: rule.severity,
      message,
      timestamp: Date.now(),
      context: {
        metric: rule.metric,
        value,
        threshold: rule.threshold,
        operator: rule.operator
      },
      acknowledged: false
    };

    this.activeAlerts.set(id, alert);
    this.alertHistory.push(alert);
    this.stats.totalAlerts++;

    logger.warn(`Alert triggered: ${rule.name} (${rule.severity})`);

    if (this.emitEvents) {
      this.emit('alert', alert);
    }

    return alert;
  }

  /**
   * Acknowledge an alert.
   * @param {string} alertId
   * @param {string} [acknowledgedBy]
   * @returns {boolean}
   */
  acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedAt = Date.now();
    alert.acknowledgedBy = acknowledgedBy;
    this.stats.acknowledgedAlerts++;

    logger.info(`Alert acknowledged: ${alertId}`);

    if (this.emitEvents) {
      this.emit('alert:acknowledged', alert);
    }

    return true;
  }

  /**
   * Resolve an alert.
   * @param {string} alertId
   * @returns {boolean}
   */
  resolveAlert(alertId) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.resolvedAt = Date.now();
    this.activeAlerts.delete(alertId);
    this.stats.resolvedAlerts++;

    logger.info(`Alert resolved: ${alertId}`);

    if (this.emitEvents) {
      this.emit('alert:resolved', alert);
    }

    return true;
  }

  /**
   * Get active alerts.
   * @param {Object} [filters]
   * @param {string} [filters.severity]
   * @returns {Alert[]}
   */
  getActiveAlerts(filters = {}) {
    let alerts = Array.from(this.activeAlerts.values());
    
    if (filters.severity) {
      alerts = alerts.filter(a => a.severity === filters.severity);
    }
    
    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get alert history.
   * @param {number} [limit=100]
   * @returns {Alert[]}
   */
  getAlertHistory(limit = 100) {
    return this.alertHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Take a comprehensive snapshot of all components.
   * @returns {Object}
   */
  takeSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      components: {},
      metrics: this.#getMetricsSnapshot(),
      alerts: {
        active: this.activeAlerts.size,
        bySeverity: this.#getAlertsBySeverity()
      }
    };

    // Collect component stats
    for (const [name, component] of Object.entries(this.components)) {
      if (component.getStats) {
        snapshot.components[name] = component.getStats();
      }
    }

    if (this.emitEvents) {
      this.emit('snapshot', snapshot);
    }

    return snapshot;
  }

  /**
   * Get metrics snapshot.
   * @returns {Object}
   * @private
   */
  #getMetricsSnapshot() {
    const snapshot = {};
    
    for (const [name, values] of this.counters) {
      snapshot[name] = { type: 'counter', value: values };
    }
    
    for (const [name, value] of this.gauges) {
      snapshot[name] = { type: 'gauge', value };
    }
    
    return snapshot;
  }

  /**
   * Get alerts grouped by severity.
   * @returns {Object}
   * @private
   */
  #getAlertsBySeverity() {
    const counts = {};
    for (const alert of this.activeAlerts.values()) {
      counts[alert.severity] = (counts[alert.severity] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get health status.
   * @returns {Object}
   */
  getHealth() {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.severity === AlertSeverity.CRITICAL);
    const errorAlerts = activeAlerts.filter(a => a.severity === AlertSeverity.ERROR);
    
    let status = 'healthy';
    if (criticalAlerts.length > 0) {
      status = 'critical';
    } else if (errorAlerts.length > 0) {
      status = 'degraded';
    } else if (activeAlerts.length > 0) {
      status = 'warning';
    }

    return {
      status,
      timestamp: Date.now(),
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      errorAlerts: errorAlerts.length,
      warningAlerts: activeAlerts.filter(a => a.severity === AlertSeverity.WARNING).length,
      infoAlerts: activeAlerts.filter(a => a.severity === AlertSeverity.INFO).length
    };
  }

  /**
   * Get monitor statistics.
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      activeAlerts: this.activeAlerts.size,
      rules: this.alertRules.size,
      metrics: this.metrics.size,
      components: Object.keys(this.components).length
    };
  }

  /**
   * Get dashboard data.
   * @returns {Object}
   */
  getDashboardData() {
    const snapshot = this.takeSnapshot();
    const health = this.getHealth();
    
    return {
      health,
      snapshot,
      recentAlerts: this.getActiveAlerts().slice(0, 10),
      topMetrics: this.#getTopMetrics(),
      componentStatus: Object.entries(this.components).map(([name, comp]) => ({
        name,
        hasGetStats: typeof comp.getStats === 'function',
        status: health.status
      }))
    };
  }

  /**
   * Get top metrics for dashboard.
   * @returns {Object}
   * @private
   */
  #getTopMetrics() {
    const top = {};
    const priorityMetrics = [
      'queue.*.enqueued',
      'queue.*.completed',
      'queue.*.failed',
      'queue.*.duration'
    ];
    
    for (const pattern of priorityMetrics) {
      const prefix = pattern.replace('.*.', '.');
      for (const [key, value] of this.counters) {
        if (key.includes(prefix)) {
          top[key] = value;
        }
      }
    }
    
    return top;
  }

  /**
   * Clear all metrics.
   */
  clearMetrics() {
    this.counters.clear();
    this.gauges.clear();
    this.metrics.clear();
    logger.info('All metrics cleared');
  }

  /**
   * Clear resolved alerts from history.
   * @param {number} [olderThan] - Clear alerts older than this many milliseconds
   */
  clearAlertHistory(olderThan) {
    if (olderThan) {
      const cutoff = Date.now() - olderThan;
      this.alertHistory = this.alertHistory.filter(a => a.timestamp > cutoff);
    } else {
      this.alertHistory = [];
    }
    logger.info('Alert history cleared');
  }

  /**
   * Stop monitoring.
   */
  stop() {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    logger.info('Monitor stopped');
  }
}

export default QueueMonitor;
