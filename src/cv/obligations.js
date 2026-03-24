/**
 * Obligations Monitor
 * SLA tracking, performance monitoring, resource usage tracking, and violation detection
 */

import { EventEmitter } from 'events';
import { validateObligations } from './schema.js';

/**
 * Obligations Monitor for tracking agent obligations and SLAs
 */
export class ObligationsMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      checkInterval: 30000, // 30 seconds
      maxViolations: 1000,
      alertThreshold: 3, // Alert after N consecutive violations
      enableAutoRecovery: true,
      ...options
    };
    
    // Agent monitors
    this.monitors = new Map(); // agentId -> monitor state
    
    // Violations log
    this.violations = [];
    
    // Active alerts
    this.alerts = new Map();
    
    // Resource tracking
    this.resourceUsage = new Map();
    
    // Stats
    this.stats = {
      totalMonitors: 0,
      activeMonitors: 0,
      totalViolations: 0,
      totalAlerts: 0,
      checksPerformed: 0
    };
    
    // Start monitoring loop
    this.intervalId = null;
    this._startMonitoring();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // AGENT REGISTRATION
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Register an agent for obligation monitoring
   * @param {string} agentId - Agent ID
   * @param {Object} cv - Agent CV with obligations
   * @param {Object} options - Registration options
   */
  register(agentId, cv, options = {}) {
    if (!cv || !cv.obligations) {
      throw new Error('CV must have obligations defined');
    }
    
    // Validate obligations
    const validation = validateObligations(cv.obligations);
    if (!validation.valid) {
      throw new Error(`Invalid obligations: ${validation.errors.join(', ')}`);
    }
    
    const monitor = {
      agentId,
      cvId: cv.identity?.id,
      obligations: validation.data,
      state: {
        status: 'active',
        startTime: Date.now(),
        lastCheck: null,
        consecutiveViolations: 0,
        totalViolations: 0,
        tasksCompleted: 0,
        tasksFailed: 0
      },
      metrics: {
        responseTimes: [],
        tokenUsage: {
          perRequest: [],
          total: 0
        },
        cost: {
          total: 0,
          perTask: []
        },
        errors: [],
        availability: {
          uptime: 0,
          lastCheck: Date.now(),
          failures: 0
        }
      },
      violations: [],
      options: {
        checkInterval: options.checkInterval || this.options.checkInterval
      }
    };
    
    this.monitors.set(agentId, monitor);
    
    this.stats.totalMonitors++;
    this.stats.activeMonitors++;
    
    this.emit('agent:registered', { agentId, cvId: cv.identity?.id });
    
    return monitor;
  }

  /**
   * Unregister an agent
   * @param {string} agentId - Agent ID
   */
  unregister(agentId) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return false;
    
    // Final compliance check
    const compliance = this.checkCompliance(agentId);
    
    this.monitors.delete(agentId);
    this.resourceUsage.delete(agentId);
    
    this.stats.activeMonitors--;
    
    this.emit('agent:unregistered', { agentId, finalCompliance: compliance });
    
    return true;
  }

  /**
   * Get monitor for an agent
   * @param {string} agentId - Agent ID
   * @returns {Object|null}
   */
  getMonitor(agentId) {
    return this.monitors.get(agentId) || null;
  }

  /**
   * List all monitored agents
   * @returns {Array}
   */
  listMonitors() {
    return Array.from(this.monitors.entries()).map(([id, monitor]) => ({
      agentId: id,
      cvId: monitor.cvId,
      status: monitor.state.status,
      startTime: monitor.state.startTime,
      totalViolations: monitor.state.totalViolations
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SLA TRACKING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Record task start
   * @param {string} agentId - Agent ID
   * @param {Object} task - Task details
   */
  recordTaskStart(agentId, task) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return;
    
    monitor.state.currentTask = {
      id: task.id,
      startTime: Date.now(),
      expectedDuration: task.expectedDuration
    };
    
    // Check if task would exceed obligations
    const timeout = monitor.obligations.performance?.response_time?.timeout_absolute_ms;
    if (timeout && task.expectedDuration > timeout) {
      this._recordViolation(agentId, 'timeout_warning', {
        taskId: task.id,
        expectedDuration: task.expectedDuration,
        limit: timeout
      });
    }
  }

  /**
   * Record task completion
   * @param {string} agentId - Agent ID
   * @param {Object} result - Task result
   */
  recordTaskComplete(agentId, result) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return;
    
    const duration = Date.now() - (monitor.state.currentTask?.startTime || Date.now());
    const success = result.success !== false;
    
    // Update metrics
    monitor.metrics.responseTimes.push(duration);
    if (monitor.metrics.responseTimes.length > 100) {
      monitor.metrics.responseTimes.shift();
    }
    
    if (success) {
      monitor.state.tasksCompleted++;
    } else {
      monitor.state.tasksFailed++;
      monitor.metrics.errors.push({
        timestamp: Date.now(),
        error: result.error || 'Unknown error',
        taskId: result.taskId
      });
    }
    
    // Check SLA violations
    this._checkResponseTimeSLA(agentId, duration);
    this._checkErrorRateSLA(agentId);
    
    // Update resource usage
    if (result.tokensUsed) {
      this._recordTokenUsage(agentId, result.tokensUsed);
    }
    
    if (result.cost) {
      this._recordCost(agentId, result.cost);
    }
    
    monitor.state.currentTask = null;
    
    this.emit('task:complete', {
      agentId,
      duration,
      success,
      taskId: result.taskId
    });
  }

  /**
   * Record task failure
   * @param {string} agentId - Agent ID
   * @param {Error} error - Error that occurred
   * @param {Object} context - Failure context
   */
  recordTaskFailure(agentId, error, context = {}) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return;
    
    monitor.state.tasksFailed++;
    monitor.metrics.errors.push({
      timestamp: Date.now(),
      error: error.message,
      stack: context.includeStackTrace ? error.stack : undefined,
      context
    });
    
    monitor.metrics.availability.failures++;
    
    // Check if we should alert
    this._checkErrorRateSLA(agentId);
    
    this.emit('task:failure', {
      agentId,
      error: error.message,
      context
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PERFORMANCE MONITORING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get performance metrics for an agent
   * @param {string} agentId - Agent ID
   * @returns {Object|null}
   */
  getPerformanceMetrics(agentId) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return null;
    
    const times = monitor.metrics.responseTimes;
    const sorted = [...times].sort((a, b) => a - b);
    
    return {
      agentId,
      cvId: monitor.cvId,
      status: monitor.state.status,
      uptime: Date.now() - monitor.state.startTime,
      tasks: {
        completed: monitor.state.tasksCompleted,
        failed: monitor.state.tasksFailed,
        total: monitor.state.tasksCompleted + monitor.state.tasksFailed,
        successRate: this._calculateSuccessRate(monitor)
      },
      responseTime: {
        p50: this._percentile(sorted, 50),
        p95: this._percentile(sorted, 95),
        p99: this._percentile(sorted, 99),
        avg: times.reduce((a, b) => a + b, 0) / times.length || 0,
        min: sorted[0] || 0,
        max: sorted[sorted.length - 1] || 0
      },
      errors: {
        total: monitor.metrics.errors.length,
        recent: monitor.metrics.errors.slice(-10)
      },
      availability: {
        uptime: monitor.metrics.availability.uptime,
        failures: monitor.metrics.availability.failures
      }
    };
  }

  /**
   * Check if agent meets performance SLAs
   * @param {string} agentId - Agent ID
   * @returns {Object}
   */
  checkPerformanceSLAs(agentId) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) {
      return { compliant: false, reason: 'Agent not monitored' };
    }
    
    const obligations = monitor.obligations;
    const metrics = this.getPerformanceMetrics(agentId);
    const violations = [];
    
    // Check response time SLA
    if (obligations.performance?.response_time) {
      const sla = obligations.performance.response_time;
      
      if (sla.p95_max_ms && metrics.responseTime.p95 > sla.p95_max_ms) {
        violations.push({
          type: 'response_time_p95',
          limit: sla.p95_max_ms,
          actual: Math.round(metrics.responseTime.p95),
          severity: 'warning'
        });
      }
      
      if (sla.p99_max_ms && metrics.responseTime.p99 > sla.p99_max_ms) {
        violations.push({
          type: 'response_time_p99',
          limit: sla.p99_max_ms,
          actual: Math.round(metrics.responseTime.p99),
          severity: 'critical'
        });
      }
    }
    
    // Check success rate SLA
    if (obligations.output_quality?.accuracy?.min_score) {
      const minRate = obligations.output_quality.accuracy.min_score;
      if (metrics.tasks.successRate < minRate) {
        violations.push({
          type: 'success_rate',
          limit: minRate,
          actual: metrics.tasks.successRate,
          severity: 'critical'
        });
      }
    }
    
    // Check availability SLA
    if (obligations.performance?.availability?.uptime_percent) {
      const minUptime = obligations.performance.availability.uptime_percent;
      const actualUptime = this._calculateUptime(monitor);
      if (actualUptime < minUptime) {
        violations.push({
          type: 'availability',
          limit: minUptime,
          actual: actualUptime,
          severity: 'critical'
        });
      }
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      metrics
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RESOURCE USAGE TRACKING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Record token usage
   * @param {string} agentId - Agent ID
   * @param {number} tokens - Tokens used
   */
  recordTokenUsage(agentId, tokens) {
    this._recordTokenUsage(agentId, tokens);
  }

  /**
   * Record cost
   * @param {string} agentId - Agent ID
   * @param {number} cost - Cost incurred
   */
  recordCost(agentId, cost) {
    this._recordCost(agentId, cost);
  }

  /**
   * Get resource usage for an agent
   * @param {string} agentId - Agent ID
   * @returns {Object|null}
   */
  getResourceUsage(agentId) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return null;
    
    const usage = this.resourceUsage.get(agentId) || {
      tokens: { total: 0, perRequest: [], perTask: [], perDay: 0 },
      cost: { total: 0, perTask: [], perDay: 0 },
      compute: { cpuTime: 0, memoryPeak: 0 }
    };
    
    const limits = monitor.obligations.resource_limits || {};
    
    return {
      agentId,
      usage,
      limits,
      withinLimits: this._checkWithinLimits(usage, limits)
    };
  }

  /**
   * Check resource limits for an agent
   * @param {string} agentId - Agent ID
   * @returns {Object}
   */
  checkResourceLimits(agentId) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) {
      return { compliant: false, reason: 'Agent not monitored' };
    }
    
    const usage = this.resourceUsage.get(agentId);
    if (!usage) {
      return { compliant: true, reason: 'No usage recorded' };
    }
    
    const limits = monitor.obligations.resource_limits || {};
    const violations = [];
    
    // Check token limits
    if (limits.tokens?.per_task && usage.tokens.total > limits.tokens.per_task) {
      violations.push({
        type: 'token_limit_per_task',
        limit: limits.tokens.per_task,
        actual: usage.tokens.total,
        severity: 'critical'
      });
    }
    
    if (limits.tokens?.per_day && usage.tokens.perDay > limits.tokens.per_day) {
      violations.push({
        type: 'token_limit_per_day',
        limit: limits.tokens.per_day,
        actual: usage.tokens.perDay,
        severity: 'critical'
      });
    }
    
    // Check cost limits
    if (limits.cost?.budget_usd_per_task && usage.cost.total > limits.cost.budget_usd_per_task) {
      violations.push({
        type: 'cost_limit_per_task',
        limit: limits.cost.budget_usd_per_task,
        actual: usage.cost.total,
        severity: 'critical'
      });
    }
    
    if (limits.cost?.budget_usd_per_day && usage.cost.perDay > limits.cost.budget_usd_per_day) {
      violations.push({
        type: 'cost_limit_per_day',
        limit: limits.cost.budget_usd_per_day,
        actual: usage.cost.perDay,
        severity: 'critical'
      });
    }
    
    // Check compute limits
    if (limits.compute?.max_execution_time_ms && usage.compute.cpuTime > limits.compute.max_execution_time_ms) {
      violations.push({
        type: 'execution_time_limit',
        limit: limits.compute.max_execution_time_ms,
        actual: usage.compute.cpuTime,
        severity: 'warning'
      });
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      usage,
      limits
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VIOLATION DETECTION
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get all violations
   * @param {Object} filters - Filter options
   * @returns {Array}
   */
  getViolations(filters = {}) {
    let violations = [...this.violations];
    
    if (filters.agentId) {
      violations = violations.filter(v => v.agentId === filters.agentId);
    }
    
    if (filters.type) {
      violations = violations.filter(v => v.type === filters.type);
    }
    
    if (filters.severity) {
      violations = violations.filter(v => v.severity === filters.severity);
    }
    
    if (filters.since) {
      violations = violations.filter(v => v.timestamp >= filters.since);
    }
    
    if (filters.limit) {
      violations = violations.slice(0, filters.limit);
    }
    
    return violations;
  }

  /**
   * Get violations for a specific agent
   * @param {string} agentId - Agent ID
   * @returns {Array}
   */
  getAgentViolations(agentId) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return [];
    
    return monitor.violations;
  }

  /**
   * Clear violations
   * @param {string} agentId - Optional agent ID to clear only for that agent
   */
  clearViolations(agentId) {
    if (agentId) {
      const monitor = this.monitors.get(agentId);
      if (monitor) {
        monitor.violations = [];
        monitor.state.consecutiveViolations = 0;
      }
      this.violations = this.violations.filter(v => v.agentId !== agentId);
    } else {
      this.violations = [];
      this.monitors.forEach(m => {
        m.violations = [];
        m.state.consecutiveViolations = 0;
      });
    }
    
    this.emit('violations:cleared', { agentId });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // COMPLIANCE CHECKING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Check overall compliance for an agent
   * @param {string} agentId - Agent ID
   * @returns {Object}
   */
  checkCompliance(agentId) {
    const performanceCheck = this.checkPerformanceSLAs(agentId);
    const resourceCheck = this.checkResourceLimits(agentId);
    
    const allViolations = [
      ...performanceCheck.violations || [],
      ...resourceCheck.violations || []
    ];
    
    return {
      agentId,
      compliant: allViolations.length === 0,
      performance: performanceCheck,
      resources: resourceCheck,
      violations: allViolations,
      summary: {
        totalViolations: allViolations.length,
        critical: allViolations.filter(v => v.severity === 'critical').length,
        warning: allViolations.filter(v => v.severity === 'warning').length
      }
    };
  }

  /**
   * Check compliance for all agents
   * @returns {Object}
   */
  checkAllCompliance() {
    const results = [];
    let totalViolations = 0;
    let compliant = 0;
    let nonCompliant = 0;
    
    for (const agentId of this.monitors.keys()) {
      const check = this.checkCompliance(agentId);
      results.push(check);
      
      totalViolations += check.violations.length;
      if (check.compliant) {
        compliant++;
      } else {
        nonCompliant++;
      }
    }
    
    return {
      total: results.length,
      compliant,
      nonCompliant,
      totalViolations,
      results
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ALERTING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get active alerts
   * @returns {Array}
   */
  getAlerts() {
    return Array.from(this.alerts.entries()).map(([id, alert]) => ({
      id,
      ...alert
    }));
  }

  /**
   * Acknowledge an alert
   * @param {string} alertId - Alert ID
   */
  acknowledgeAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = Date.now();
      this.emit('alert:acknowledged', { alertId, alert });
    }
  }

  /**
   * Clear an alert
   * @param {string} alertId - Alert ID
   */
  clearAlert(alertId) {
    this.alerts.delete(alertId);
    this.emit('alert:cleared', { alertId });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Stop monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.emit('monitoring:stopped');
  }

  /**
   * Resume monitoring
   */
  resume() {
    this._startMonitoring();
    this.emit('monitoring:resumed');
  }

  /**
   * Get monitor statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      violations: this.violations.length,
      alerts: this.alerts.size,
      resourceTracked: this.resourceUsage.size
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  _startMonitoring() {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(() => {
      this._performChecks();
    }, this.options.checkInterval);
    this.intervalId.unref?.();
  }

  _performChecks() {
    this.stats.checksPerformed++;
    
    for (const [agentId, monitor] of this.monitors) {
      if (monitor.state.status !== 'active') continue;
      
      // Check resource limits
      const resourceCheck = this.checkResourceLimits(agentId);
      if (!resourceCheck.compliant) {
        for (const violation of resourceCheck.violations) {
          this._recordViolation(agentId, violation.type, violation);
        }
      }
      
      // Update availability
      monitor.metrics.availability.uptime += this.options.checkInterval;
      
      // Check for stale tasks
      if (monitor.state.currentTask) {
        const elapsed = Date.now() - monitor.state.currentTask.startTime;
        const timeout = monitor.obligations.performance?.response_time?.timeout_absolute_ms;
        
        if (timeout && elapsed > timeout * 1.5) {
          this._recordViolation(agentId, 'task_timeout', {
            taskId: monitor.state.currentTask.id,
            elapsed,
            timeout
          });
        }
      }
    }
  }

  _recordViolation(agentId, type, details) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return;
    
    const violation = {
      id: this._generateId(),
      agentId,
      type,
      timestamp: Date.now(),
      severity: details.severity || 'warning',
      ...details
    };
    
    // Add to global log
    this.violations.unshift(violation);
    while (this.violations.length > this.options.maxViolations) {
      this.violations.pop();
    }
    
    // Add to monitor
    monitor.violations.unshift(violation);
    monitor.state.consecutiveViolations++;
    monitor.state.totalViolations++;
    
    this.stats.totalViolations++;
    
    // Check if alert needed
    if (monitor.state.consecutiveViolations >= this.options.alertThreshold) {
      this._createAlert(agentId, violation);
    }
    
    this.emit('violation', violation);
  }

  _createAlert(agentId, violation) {
    const alertId = `${agentId}-${Date.now()}`;
    
    const alert = {
      id: alertId,
      agentId,
      type: violation.type,
      severity: violation.severity,
      message: this._getAlertMessage(violation),
      createdAt: Date.now(),
      violation,
      acknowledged: false
    };
    
    this.alerts.set(alertId, alert);
    this.stats.totalAlerts++;
    
    this.emit('alert', alert);
  }

  _getAlertMessage(violation) {
    const formatNum = (n) => n?.toFixed ? n.toFixed(2) : n;
    const formatPct = (n) => n ? (n * 100).toFixed(1) : '0';
    
    const messages = {
      token_limit_per_task: `Token limit exceeded: ${violation.actual} > ${violation.limit}`,
      cost_limit_per_task: `Cost limit exceeded: $${formatNum(violation.actual)} > $${violation.limit}`,
      response_time_p95: `Response time P95 exceeded: ${violation.actual}ms > ${violation.limit}ms`,
      response_time_p99: `Response time P99 exceeded: ${violation.actual}ms > ${violation.limit}ms`,
      success_rate: `Success rate below threshold: ${formatPct(violation.actual)}% < ${formatPct(violation.limit)}%`,
      availability: `Availability below threshold: ${formatNum(violation.actual)}% < ${violation.limit}%`,
      task_timeout: `Task timed out after ${violation.elapsed}ms`,
      test_violation: `Test violation occurred`
    };
    
    return messages[violation.type] || `Violation: ${violation.type}`;
  }

  _recordTokenUsage(agentId, tokens) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return;
    
    let usage = this.resourceUsage.get(agentId);
    if (!usage) {
      usage = {
        tokens: { total: 0, perRequest: [], perTask: [], perDay: 0 },
        cost: { total: 0, perTask: [], perDay: 0 },
        compute: { cpuTime: 0, memoryPeak: 0 }
      };
      this.resourceUsage.set(agentId, usage);
    }
    
    usage.tokens.total += tokens;
    usage.tokens.perRequest.push(tokens);
    usage.tokens.perDay += tokens;
    
    // Check warning threshold
    const limits = monitor.obligations.resource_limits?.tokens;
    if (limits?.warning_threshold && limits?.per_task) {
      const warningLevel = limits.per_task * limits.warning_threshold;
      if (usage.tokens.total > warningLevel && usage.tokens.total <= limits.per_task) {
        this._recordViolation(agentId, 'token_warning', {
          current: usage.tokens.total,
          limit: limits.per_task,
          threshold: warningLevel
        });
      }
    }
  }

  _recordCost(agentId, cost) {
    let usage = this.resourceUsage.get(agentId);
    if (!usage) {
      usage = {
        tokens: { total: 0, perRequest: [], perTask: [], perDay: 0 },
        cost: { total: 0, perTask: [], perDay: 0 },
        compute: { cpuTime: 0, memoryPeak: 0 }
      };
      this.resourceUsage.set(agentId, usage);
    }
    
    usage.cost.total += cost;
    usage.cost.perTask.push(cost);
    usage.cost.perDay += cost;
  }

  _checkResponseTimeSLA(agentId, duration) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return;
    
    const sla = monitor.obligations.performance?.response_time;
    if (!sla) return;
    
    if (sla.timeout_absolute_ms && duration > sla.timeout_absolute_ms) {
      this._recordViolation(agentId, 'response_time_exceeded', {
        actual: duration,
        limit: sla.timeout_absolute_ms
      });
    }
  }

  _checkErrorRateSLA(agentId) {
    const monitor = this.monitors.get(agentId);
    if (!monitor) return;
    
    const successRate = this._calculateSuccessRate(monitor);
    const minRate = monitor.obligations.output_quality?.accuracy?.min_score;
    
    if (minRate && successRate < minRate) {
      this._recordViolation(agentId, 'success_rate', {
        actual: successRate,
        limit: minRate,
        severity: 'critical'
      });
    }
  }

  _checkWithinLimits(usage, limits) {
    if (limits.tokens?.per_task && usage.tokens.total > limits.tokens.per_task) {
      return false;
    }
    if (limits.cost?.budget_usd_per_task && usage.cost.total > limits.cost.budget_usd_per_task) {
      return false;
    }
    return true;
  }

  _calculateSuccessRate(monitor) {
    const total = monitor.state.tasksCompleted + monitor.state.tasksFailed;
    if (total === 0) return 1;
    return monitor.state.tasksCompleted / total;
  }

  _calculateUptime(monitor) {
    const total = Date.now() - monitor.state.startTime;
    const failures = monitor.metrics.availability.failures;
    // Simplified: assume each failure is 1 minute downtime
    const downtime = failures * 60000;
    return ((total - downtime) / total) * 100;
  }

  _percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  _generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default ObligationsMonitor;
