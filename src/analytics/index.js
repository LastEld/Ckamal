/**
 * @fileoverview Analytics System for CogniMesh v5.0
 * Centralized analytics module for cost tracking, budget management, and reporting.
 * @module analytics
 */

import { CostTracker } from './cost-tracker.js';
import { BudgetManager } from './budget.js';
import { ReportGenerator } from './reports.js';
import { AlertManager } from '../alerts/index.js';

/**
 * Analytics system configuration
 * @typedef {Object} AnalyticsConfig
 * @property {string} [dataDir='./data'] - Directory for databases
 * @property {string} [reportsDir='./reports'] - Directory for reports
 * @property {boolean} [autoCheckBudgets=true] - Auto-check budgets periodically
 * @property {number} [checkInterval=60000] - Budget check interval in ms
 */

/**
 * Main Analytics class that coordinates all analytics components
 */
export class Analytics {
  /**
   * Creates a new Analytics instance
   * @param {AnalyticsConfig} [config={}] - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      dataDir: './data',
      reportsDir: './reports',
      autoCheckBudgets: true,
      checkInterval: 60000,
      ...config
    };

    this.costTracker = null;
    this.budgetManager = null;
    this.reportGenerator = null;
    this.alertManager = null;
    this._initialized = false;
    this._checkInterval = null;
  }

  /**
   * Initializes all analytics components
   * @returns {Promise<void>}
   */
  async init() {
    if (this._initialized) {
      return;
    }

    // Initialize components
    this.costTracker = new CostTracker({
      dataDir: this.config.dataDir,
      dbName: 'costs.db'
    });

    this.budgetManager = new BudgetManager({
      dataDir: this.config.dataDir,
      dbName: 'budgets.db',
      costTracker: this.costTracker
    });

    this.reportGenerator = new ReportGenerator({
      dataDir: this.config.dataDir,
      reportsDir: this.config.reportsDir,
      costTracker: this.costTracker,
      budgetManager: this.budgetManager
    });

    // Initialize AlertManager for budget alerts
    this.alertManager = new AlertManager(this.config.alertManager);

    // Initialize databases
    await this.costTracker.init();
    await this.budgetManager.init();
    await this.reportGenerator.init();
    await this.alertManager.init?.();

    // Set up budget alerts
    this.budgetManager.on('budget:alert', (alert, status) => {
      this._handleBudgetAlert(alert, status);
    });

    // Auto-check budgets if enabled
    if (this.config.autoCheckBudgets) {
      this._startBudgetChecks();
    }

    this._initialized = true;
  }

  /**
   * Handles budget alert events
   * @private
   * @param {Object} alert - Alert data
   * @param {Object} status - Budget status
   */
  _handleBudgetAlert(alert, status) {
    // Create alert through AlertManager for real-time notifications
    if (this.alertManager) {
      this.alertManager.createAlert(
        'budget',
        alert.message,
        {
          priority: 'MEDIUM',
          metadata: { 
            budgetId: status.budgetId,
            current: status.current,
            threshold: status.threshold,
            percentUsed: status.percentUsed,
            severity: 'warning'
          }
        }
      );
    }
    
    // Emit event for external handlers (backward compatibility)
    if (this._onAlert) {
      this._onAlert(alert, status);
    }
  }

  /**
   * Starts periodic budget checks
   * @private
   */
  _startBudgetChecks() {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
    }

    this._checkInterval = setInterval(() => {
      this.budgetManager?.checkAlerts().catch(err => {
        console.error('[Analytics] Budget check failed:', err);
      });
    }, this.config.checkInterval);
  }

  /**
   * Stops periodic budget checks
   * @private
   */
  _stopBudgetChecks() {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
  }

  /**
   * Sets up an alert handler callback
   * @param {Function} handler - Alert handler function
   */
  onAlert(handler) {
    this._onAlert = handler;
  }

  /**
   * Closes all analytics components
   * @returns {Promise<void>}
   */
  async close() {
    this._stopBudgetChecks();

    await this.costTracker?.close();
    await this.budgetManager?.close();
    await this.reportGenerator?.close();
    this.alertManager?.dispose?.();

    this._initialized = false;
  }

  /**
   * Tracks an API request cost
   * @param {string} provider - AI provider
   * @param {string} model - Model identifier
   * @param {Object} tokens - Token counts
   * @param {number} tokens.input - Input tokens
   * @param {number} tokens.output - Output tokens
   * @param {number} cost - Calculated cost
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Cost record
   */
  async trackRequest(provider, model, tokens, cost, options) {
    this._ensureInitialized();
    return this.costTracker.trackRequest(provider, model, tokens, cost, options);
  }

  /**
   * Gets cost statistics
   * @param {Object} [filters] - Filter options
   * @returns {Promise<Object>} Cost statistics
   */
  async getCostStats(filters) {
    this._ensureInitialized();
    return this.costTracker.getStats(filters);
  }

  /**
   * Checks if an operation is within budget
   * @param {Object} operation - Operation details
   * @returns {Promise<Object>} Check result
   */
  async checkBudget(operation) {
    this._ensureInitialized();
    return this.budgetManager.checkBudget(operation);
  }

  /**
   * Generates a report
   * @param {string} type - Report type
   * @param {string} format - Output format
   * @param {Object} dateRange - Date range
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Generated report
   */
  async generateReport(type, format, dateRange, options) {
    this._ensureInitialized();
    return this.reportGenerator.generate(type, format, dateRange, options);
  }

  /**
   * Ensures the analytics system is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error('Analytics not initialized. Call init() first.');
    }
  }
}

// Export individual components
export { CostTracker, BudgetManager, ReportGenerator };

// Default export
export default Analytics;
