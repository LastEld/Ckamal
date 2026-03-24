/**
 * @fileoverview Alert lifecycle manager for creating, acknowledging,
 * resolving, and escalating alerts.
 * @module alerts/manager
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * Alert states in the lifecycle.
 * @readonly
 * @enum {string}
 */
export const AlertState = {
  PENDING: 'PENDING',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED',
  ESCALATED: 'ESCALATED'
};

/**
 * @typedef {Object} AlertMetadata
 * @property {string} [source] - Alert source system
 * @property {string} [service] - Service that generated the alert
 * @property {string} [host] - Host where alert originated
 * @property {Object} [tags] - Key-value tags
 * @property {string} [assignedTo] - User/team assigned to the alert
 * @property {number} [escalationLevel=0] - Current escalation level
 */

/**
 * @typedef {Object} Alert
 * @property {string} id - Unique alert identifier
 * @property {string} type - Alert type/category
 * @property {string} message - Alert message
 * @property {string} priority - Alert priority (HIGH, MEDIUM, LOW)
 * @property {AlertState} state - Current alert state
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string} [acknowledgedAt] - ISO timestamp of acknowledgment
 * @property {string} [acknowledgedBy] - User who acknowledged
 * @property {string} [resolvedAt] - ISO timestamp of resolution
 * @property {string} [resolvedBy] - User who resolved
 * @property {string} [escalatedAt] - ISO timestamp of escalation
 * @property {string} [escalationReason] - Reason for escalation
 * @property {AlertMetadata} metadata - Additional alert data
 */

/**
 * @typedef {Object} ManagerConfig
 * @property {number} [autoEscalationMs=3600000] - Auto-escalation timeout (1 hour)
 * @property {number} [maxEscalationLevels=3] - Maximum escalation levels
 * @property {boolean} [enableAutoEscalation=true] - Enable automatic escalation
 * @property {Function} [onEscalation] - Callback for escalation events
 */

/**
 * Alert lifecycle manager with state transitions and escalation.
 * @extends EventEmitter
 */
export class AlertManager extends EventEmitter {
  /**
   * Default manager configuration.
   * @type {ManagerConfig}
   */
  static DEFAULT_CONFIG = {
    autoEscalationMs: 3600000, // 1 hour
    maxEscalationLevels: 3,
    enableAutoEscalation: true
  };

  /**
   * Valid state transitions.
   * @type {Object.<AlertState, Array<AlertState>>}
   */
  static STATE_TRANSITIONS = {
    [AlertState.PENDING]: [AlertState.ACKNOWLEDGED, AlertState.RESOLVED, AlertState.ESCALATED],
    [AlertState.ACKNOWLEDGED]: [AlertState.RESOLVED, AlertState.ESCALATED],
    [AlertState.ESCALATED]: [AlertState.ACKNOWLEDGED, AlertState.RESOLVED],
    [AlertState.RESOLVED]: []
  };

  /**
   * Creates a new AlertManager instance.
   * @param {ManagerConfig} [config={}] - Manager configuration
   */
  constructor(config = {}) {
    super();
    this.config = { ...AlertManager.DEFAULT_CONFIG, ...config };
    
    /** @type {Map<string, Alert>} */
    this.alerts = new Map();
    
    /** @type {Map<string, NodeJS.Timeout>} */
    this.escalationTimers = new Map();
    
    this.metrics = {
      created: 0,
      acknowledged: 0,
      resolved: 0,
      escalated: 0
    };

    if (this.config.enableAutoEscalation) {
      this.startAutoEscalationCheck();
    }
  }

  /**
   * Creates a new alert.
   * @param {string} type - Alert type/category
   * @param {string} message - Alert message
   * @param {Object} [options={}] - Alert options
   * @param {string} [options.priority='MEDIUM'] - Alert priority
   * @param {AlertMetadata} [options.metadata={}] - Alert metadata
   * @returns {Alert} Created alert
   */
  createAlert(type, message, options = {}) {
    const {
      priority = 'MEDIUM',
      metadata = {}
    } = options;

    const alert = {
      id: randomUUID(),
      type,
      message,
      priority,
      state: AlertState.PENDING,
      createdAt: new Date().toISOString(),
      metadata: {
        escalationLevel: 0,
        ...metadata
      }
    };

    this.alerts.set(alert.id, alert);
    this.metrics.created++;

    // Set up auto-escalation timer
    if (this.config.enableAutoEscalation) {
      this.scheduleAutoEscalation(alert.id);
    }

    this.emit('alertCreated', { alert });
    return alert;
  }

  /**
   * Acknowledges an alert.
   * @param {string} id - Alert ID
   * @param {Object} [options={}] - Acknowledgment options
   * @param {string} [options.acknowledgedBy] - User acknowledging
   * @param {string} [options.notes] - Acknowledgment notes
   * @returns {Alert|null} Updated alert or null if not found
   * @throws {Error} If state transition is invalid
   */
  acknowledgeAlert(id, options = {}) {
    const alert = this.alerts.get(id);
    if (!alert) return null;

    this.validateTransition(alert.state, AlertState.ACKNOWLEDGED);

    const previousState = alert.state;
    alert.state = AlertState.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = options.acknowledgedBy || 'system';
    
    if (options.notes) {
      alert.acknowledgmentNotes = options.notes;
    }

    // Cancel auto-escalation
    this.cancelAutoEscalation(id);

    this.metrics.acknowledged++;
    this.emit('alertAcknowledged', { 
      alert, 
      previousState,
      acknowledgedBy: alert.acknowledgedBy 
    });

    return alert;
  }

  /**
   * Resolves an alert.
   * @param {string} id - Alert ID
   * @param {Object} [options={}] - Resolution options
   * @param {string} [options.resolvedBy] - User resolving
   * @param {string} [options.resolution] - Resolution details
   * @returns {Alert|null} Updated alert or null if not found
   * @throws {Error} If state transition is invalid
   */
  resolveAlert(id, options = {}) {
    const alert = this.alerts.get(id);
    if (!alert) return null;

    this.validateTransition(alert.state, AlertState.RESOLVED);

    const previousState = alert.state;
    alert.state = AlertState.RESOLVED;
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = options.resolvedBy || 'system';
    
    if (options.resolution) {
      alert.resolution = options.resolution;
    }

    // Cancel auto-escalation
    this.cancelAutoEscalation(id);

    this.metrics.resolved++;
    this.emit('alertResolved', { 
      alert, 
      previousState,
      resolvedBy: alert.resolvedBy 
    });

    return alert;
  }

  /**
   * Escalates an alert to a higher level.
   * @param {string} id - Alert ID
   * @param {Object} [options={}] - Escalation options
   * @param {string} [options.reason] - Escalation reason
   * @param {boolean} [options.auto=false] - Whether auto-escalated
   * @returns {Alert|null} Updated alert or null if not found/max escalation reached
   * @throws {Error} If state transition is invalid
   */
  escalateAlert(id, options = {}) {
    const alert = this.alerts.get(id);
    if (!alert) return null;

    const currentLevel = alert.metadata.escalationLevel || 0;
    
    // Check max escalation
    if (currentLevel >= this.config.maxEscalationLevels) {
      this.emit('maxEscalationReached', { alert });
      return alert;
    }

    this.validateTransition(alert.state, AlertState.ESCALATED);

    const previousState = alert.state;
    alert.state = AlertState.ESCALATED;
    alert.escalatedAt = new Date().toISOString();
    alert.escalationReason = options.reason || 'manual_escalation';
    alert.metadata.escalationLevel = currentLevel + 1;

    // Cancel and reschedule auto-escalation
    this.cancelAutoEscalation(id);
    if (this.config.enableAutoEscalation) {
      this.scheduleAutoEscalation(id);
    }

    this.metrics.escalated++;
    
    const eventData = { 
      alert, 
      previousState,
      escalationLevel: alert.metadata.escalationLevel,
      reason: alert.escalationReason,
      auto: options.auto || false
    };
    
    this.emit('alertEscalated', eventData);

    // Call escalation callback if provided
    if (this.config.onEscalation) {
      this.config.onEscalation(eventData);
    }

    return alert;
  }

  /**
   * Gets an alert by ID.
   * @param {string} id - Alert ID
   * @returns {Alert|null} Alert or null if not found
   */
  getAlert(id) {
    return this.alerts.get(id) || null;
  }

  /**
   * Gets all alerts with optional filtering.
   * @param {Object} [filters={}] - Filter criteria
   * @param {AlertState} [filters.state] - Filter by state
   * @param {string} [filters.priority] - Filter by priority
   * @param {string} [filters.type] - Filter by type
   * @returns {Array<Alert>} Filtered alerts
   */
  getAlerts(filters = {}) {
    let alerts = Array.from(this.alerts.values());

    if (filters.state) {
      alerts = alerts.filter(a => a.state === filters.state);
    }
    if (filters.priority) {
      alerts = alerts.filter(a => a.priority === filters.priority);
    }
    if (filters.type) {
      alerts = alerts.filter(a => a.type === filters.type);
    }

    return alerts;
  }

  /**
   * Gets alerts grouped by state.
   * @returns {Object.<AlertState, Array<Alert>>} Alerts by state
   */
  getAlertsByState() {
    const grouped = {};
    for (const state of Object.values(AlertState)) {
      grouped[state] = [];
    }
    
    for (const alert of this.alerts.values()) {
      grouped[alert.state].push(alert);
    }
    
    return grouped;
  }

  /**
   * Deletes an alert.
   * @param {string} id - Alert ID
   * @returns {boolean} Whether deletion was successful
   */
  deleteAlert(id) {
    const alert = this.alerts.get(id);
    if (!alert) return false;

    this.cancelAutoEscalation(id);
    this.alerts.delete(id);
    
    this.emit('alertDeleted', { alert });
    return true;
  }

  /**
   * Validates a state transition.
   * @private
   * @param {AlertState} from - Current state
   * @param {AlertState} to - Target state
   * @throws {Error} If transition is invalid
   */
  validateTransition(from, to) {
    const validTransitions = AlertManager.STATE_TRANSITIONS[from];
    if (!validTransitions || !validTransitions.includes(to)) {
      throw new Error(
        `Invalid state transition: ${from} -> ${to}. ` +
        `Valid transitions from ${from}: ${validTransitions?.join(', ') || 'none'}`
      );
    }
  }

  /**
   * Schedules auto-escalation for an alert.
   * @private
   * @param {string} alertId - Alert ID
   */
  scheduleAutoEscalation(alertId) {
    // Clear existing timer if any
    this.cancelAutoEscalation(alertId);

    const timer = setTimeout(() => {
      const alert = this.alerts.get(alertId);
      if (alert && alert.state !== AlertState.RESOLVED) {
        this.escalateAlert(alertId, {
          reason: 'auto_escalation_timeout',
          auto: true
        });
      }
      this.escalationTimers.delete(alertId);
    }, this.config.autoEscalationMs);

    this.escalationTimers.set(alertId, timer);
  }

  /**
   * Cancels auto-escalation for an alert.
   * @private
   * @param {string} alertId - Alert ID
   */
  cancelAutoEscalation(alertId) {
    const timer = this.escalationTimers.get(alertId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(alertId);
    }
  }

  /**
   * Starts the auto-escalation check interval.
   * @private
   */
  startAutoEscalationCheck() {
    // Auto-escalation is handled per-alert via timers
  }

  /**
   * Gets manager metrics.
   * @returns {Object} Manager metrics
   */
  getMetrics() {
    const byState = this.getAlertsByState();
    return {
      ...this.metrics,
      total: this.alerts.size,
      byState: {
        pending: byState[AlertState.PENDING].length,
        acknowledged: byState[AlertState.ACKNOWLEDGED].length,
        escalated: byState[AlertState.ESCALATED].length,
        resolved: byState[AlertState.RESOLVED].length
      },
      pendingEscalations: this.escalationTimers.size
    };
  }

  /**
   * Cleans up resolved alerts older than a specified age.
   * @param {number} maxAgeMs - Maximum age in milliseconds
   * @returns {number} Number of cleaned up alerts
   */
  cleanupResolved(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    for (const [id, alert] of this.alerts.entries()) {
      if (alert.state === AlertState.RESOLVED) {
        const resolvedTime = new Date(alert.resolvedAt).getTime();
        if (resolvedTime < cutoff) {
          this.deleteAlert(id);
          cleaned++;
        }
      }
    }

    this.emit('cleanup', { cleaned });
    return cleaned;
  }

  /**
   * Disposes the manager and cleans up resources.
   */
  dispose() {
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();
    this.removeAllListeners();
  }
}

export default {
  AlertManager,
  AlertState
};
