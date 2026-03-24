/**
 * @fileoverview Alert System module exports for CogniMesh v5.0.
 * Provides a comprehensive alert management system with delivery channels,
 * processing engine, lifecycle management, and trigger rules.
 * @module alerts
 */

import * as channelsModule from './channels.js';
import * as engineModule from './engine.js';
import * as managerModule from './manager.js';
import * as rulesModule from './rules.js';

const engineExports = engineModule.default || {};

export const AlertEngine = engineModule.AlertEngine;
export const AlertPriority = engineModule.AlertPriority;
export const PriorityQueue = engineExports.PriorityQueue;
export const RateLimiter = engineExports.RateLimiter;
export const Deduplicator = engineExports.Deduplicator;

// Channels
export {
  CircuitBreaker,
  CircuitState,
  BaseChannel,
  EmailChannel,
  WebhookChannel,
  ConsoleChannel,
  WebSocketChannel,
  createChannel
} from './channels.js';

// Manager
export {
  AlertManager,
  AlertState
} from './manager.js';

// Rules
export {
  BaseRule,
  ThresholdRule,
  PatternRule,
  AnomalyRule,
  CompositeRule,
  RuleEngine
} from './rules.js';

/**
 * Complete alert system that integrates all components.
 * Provides a high-level interface for alert management.
 */
export class AlertSystem {
  /**
   * Creates a new AlertSystem instance.
   * @param {Object} [options={}] - System options
   */
  constructor(options = {}) {
    this.manager = new managerModule.AlertManager(options.manager);
    this.engine = new AlertEngine(options.engine);
    this.ruleEngine = new rulesModule.RuleEngine();

    // Connect manager to engine
    this.manager.on('alertCreated', ({ alert }) => {
      this.engine.submit(alert);
    });

    // Start processing
    this.engine.start();
  }

  /**
   * Adds a delivery channel.
   * @param {import('./channels.js').BaseChannel} channel - Channel to add
   */
  addChannel(channel) {
    this.engine.addChannel(channel);
  }

  /**
   * Creates and submits a new alert.
   * @param {string} type - Alert type
   * @param {string} message - Alert message
   * @param {Object} [options={}] - Alert options
   * @returns {import('./manager.js').Alert} Created alert
   */
  alert(type, message, options = {}) {
    return this.manager.createAlert(type, message, options);
  }

  /**
   * Registers a trigger rule.
   * @param {import('./rules.js').BaseRule} rule - Rule to register
   */
  registerRule(rule) {
    this.ruleEngine.register(rule);
  }

  /**
   * Evaluates rules against data and creates alerts for triggers.
   * @param {Object} data - Data to evaluate
   */
  evaluate(data) {
    const results = this.ruleEngine.evaluate({ data });
    
    for (const result of results) {
      if (result.triggered) {
        this.manager.createAlert(
          result.ruleType,
          result.message,
          {
            priority: this.severityToPriority(result.severity),
            metadata: {
              ruleId: result.ruleId,
              details: result.details
            }
          }
        );
      }
    }
  }

  /**
   * Converts severity to priority.
   * @private
   * @param {number} severity - Severity level (1-10)
   * @returns {string} Priority level
   */
  severityToPriority(severity) {
    if (severity >= 8) return 'HIGH';
    if (severity >= 5) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Shuts down the alert system.
   */
  shutdown() {
    this.engine.stop();
    this.manager.dispose();
  }
}

export default {
  ...channelsModule,
  ...engineModule,
  ...managerModule,
  ...rulesModule,
  PriorityQueue,
  RateLimiter,
  Deduplicator,
  AlertSystem
};
