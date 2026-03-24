/**
 * @fileoverview Budget Management System for CogniMesh v5.0
 * Manages spending limits and alerts for AI API costs.
 * @module analytics/budget
 */

import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { EventEmitter } from 'events';

/**
 * Budget period types
 * @typedef {'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'} BudgetPeriod
 */

/**
 * Budget configuration
 * @typedef {Object} BudgetConfig
 * @property {string} id - Budget identifier
 * @property {BudgetPeriod} period - Budget period type
 * @property {number} amount - Budget amount in USD
 * @property {number} alertThreshold - Alert threshold percentage (0-1)
 * @property {Date} startDate - Budget period start
 * @property {Date} [endDate] - Budget period end (for custom periods)
 * @property {string[]} [providers] - Limit to specific providers
 * @property {boolean} blockOnExceed - Whether to block operations when exceeded
 */

/**
 * Budget status information
 * @typedef {Object} BudgetStatus
 * @property {string} id - Budget identifier
 * @property {number} limit - Budget limit amount
 * @property {number} spent - Amount spent in current period
 * @property {number} remaining - Remaining budget
 * @property {number} percentage - Percentage used
 * @property {string} status - 'ok', 'warning', 'critical', or 'exceeded'
 * @property {Date} periodStart - Current period start
 * @property {Date} periodEnd - Current period end
 */

/**
 * Operation check result
 * @typedef {Object} OperationCheck
 * @property {boolean} allowed - Whether operation is allowed
 * @property {string} [reason] - Reason if blocked
 * @property {number} estimatedRemaining - Estimated remaining after operation
 * @property {string} [budgetId] - Applicable budget ID
 */

/**
 * Alert configuration
 * @typedef {Object} AlertConfig
 * @property {number} threshold - Alert threshold (0-1)
 * @property {Function} [onAlert] - Alert callback
 * @property {boolean} [emailNotification] - Enable email notifications
 * @property {string[]} [recipients] - Email recipients
 */

/**
 * Manages budgets and spending limits for AI API costs
 * @extends EventEmitter
 */
export class BudgetManager extends EventEmitter {
  /**
   * Alert levels
   * @readonly
   * @enum {string}
   */
  static ALERT_LEVELS = {
    OK: 'ok',
    WARNING: 'warning',
    CRITICAL: 'critical',
    EXCEEDED: 'exceeded'
  };

  /**
   * Creates a new BudgetManager instance
   * @param {Object} options - Configuration options
   * @param {string} [options.dataDir='./data'] - Directory for SQLite database
   * @param {string} [options.dbName='budgets.db'] - Database filename
   * @param {CostTracker} [options.costTracker] - CostTracker instance for spending queries
   */
  constructor(options = {}) {
    super();
    this.dataDir = options.dataDir || './data';
    this.dbName = options.dbName || 'budgets.db';
    this.costTracker = options.costTracker || null;
    this.db = null;
    this.alerts = new Map();
    this.defaultThreshold = 0.8;
  }

  /**
   * Initializes the database and creates tables
   * @returns {Promise<void>}
   */
  async init() {
    await mkdir(this.dataDir, { recursive: true });
    
    this.db = await open({
      filename: join(this.dataDir, this.dbName),
      driver: sqlite3.Database
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        amount REAL NOT NULL,
        alert_threshold REAL DEFAULT 0.8,
        start_date INTEGER NOT NULL,
        end_date INTEGER,
        providers TEXT,
        block_on_exceed INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS budget_alerts (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        acknowledged INTEGER DEFAULT 0,
        FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget ON budget_alerts(budget_id);
      CREATE INDEX IF NOT EXISTS idx_budget_alerts_timestamp ON budget_alerts(timestamp);
    `);
  }

  /**
   * Closes the database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  /**
   * Generates a unique ID
   * @private
   * @returns {string}
   */
  _generateId() {
    return `budget-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Calculates period boundaries
   * @private
   * @param {BudgetPeriod} period - Period type
   * @param {Date} [referenceDate=new Date()] - Reference date
   * @param {Date} [customStart] - Custom start date
   * @param {Date} [customEnd] - Custom end date
   * @returns {{start: Date, end: Date}} Period boundaries
   */
  _calculatePeriod(period, referenceDate = new Date(), customStart = null, customEnd = null) {
    const now = new Date(referenceDate);
    const start = new Date(now);
    const end = new Date(now);

    switch (period) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'weekly':
        const dayOfWeek = start.getDay();
        start.setDate(start.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case 'monthly':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(start.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'yearly':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(11, 31);
        end.setHours(23, 59, 59, 999);
        break;
      case 'custom':
        if (customStart && customEnd) {
          return { start: new Date(customStart), end: new Date(customEnd) };
        }
        throw new Error('Custom period requires start and end dates');
      default:
        throw new Error(`Unknown period type: ${period}`);
    }

    return { start, end };
  }

  /**
   * Sets or updates a budget
   * @param {BudgetPeriod} period - Budget period type
   * @param {number} amount - Budget amount in USD
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.id] - Custom budget ID
   * @param {number} [options.alertThreshold=0.8] - Alert threshold (0-1)
   * @param {Date} [options.startDate] - Period start date
   * @param {Date} [options.endDate] - Period end date (for custom)
   * @param {string[]} [options.providers] - Limit to providers
   * @param {boolean} [options.blockOnExceed=true] - Block on exceed
   * @returns {Promise<BudgetConfig>} Created/updated budget
   */
  async setBudget(period, amount, options = {}) {
    if (!this.db) {
      throw new Error('BudgetManager not initialized. Call init() first.');
    }

    const id = options.id || this._generateId();
    const alertThreshold = options.alertThreshold ?? this.defaultThreshold;
    const providers = options.providers ? JSON.stringify(options.providers) : null;
    const blockOnExceed = options.blockOnExceed !== false ? 1 : 0;

    const { start, end } = this._calculatePeriod(
      period,
      options.startDate || new Date(),
      options.startDate,
      options.endDate
    );

    await this.db.run(
      `INSERT OR REPLACE INTO budgets 
       (id, period, amount, alert_threshold, start_date, end_date, providers, block_on_exceed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, period, amount, alertThreshold, start.getTime(), end?.getTime(), 
       providers, blockOnExceed, Date.now(), Date.now()]
    );

    const budget = {
      id,
      period,
      amount,
      alertThreshold,
      startDate: start,
      endDate: end,
      providers: options.providers || null,
      blockOnExceed: options.blockOnExceed !== false
    };

    this.emit('budget:set', budget);
    return budget;
  }

  /**
   * Gets a budget by ID
   * @param {string} id - Budget ID
   * @returns {Promise<BudgetConfig|null>} Budget configuration
   */
  async getBudget(id) {
    if (!this.db) {
      throw new Error('BudgetManager not initialized. Call init() first.');
    }

    const row = await this.db.get('SELECT * FROM budgets WHERE id = ?', [id]);
    if (!row) return null;

    return {
      id: row.id,
      period: row.period,
      amount: row.amount,
      alertThreshold: row.alert_threshold,
      startDate: new Date(row.start_date),
      endDate: row.end_date ? new Date(row.end_date) : null,
      providers: row.providers ? JSON.parse(row.providers) : null,
      blockOnExceed: row.block_on_exceed === 1
    };
  }

  /**
   * Gets all budgets
   * @returns {Promise<BudgetConfig[]>} All budgets
   */
  async getAllBudgets() {
    if (!this.db) {
      throw new Error('BudgetManager not initialized. Call init() first.');
    }

    const rows = await this.db.all('SELECT * FROM budgets ORDER BY created_at DESC');
    return rows.map(row => ({
      id: row.id,
      period: row.period,
      amount: row.amount,
      alertThreshold: row.alert_threshold,
      startDate: new Date(row.start_date),
      endDate: row.end_date ? new Date(row.end_date) : null,
      providers: row.providers ? JSON.parse(row.providers) : null,
      blockOnExceed: row.block_on_exceed === 1
    }));
  }

  /**
   * Deletes a budget
   * @param {string} id - Budget ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteBudget(id) {
    if (!this.db) {
      throw new Error('BudgetManager not initialized. Call init() first.');
    }

    const result = await this.db.run('DELETE FROM budgets WHERE id = ?', [id]);
    const deleted = result.changes > 0;
    if (deleted) {
      this.emit('budget:deleted', { id });
    }
    return deleted;
  }

  /**
   * Gets current spending for a period
   * @private
   * @param {BudgetConfig} budget - Budget configuration
   * @returns {Promise<number>} Amount spent
   */
  async _getSpending(budget) {
    if (!this.costTracker) {
      return 0;
    }

    const filters = {
      startDate: budget.startDate,
      endDate: budget.endDate || new Date()
    };

    const stats = await this.costTracker.getStats(filters);
    return stats.totalCost;
  }

  /**
   * Gets the current status of all budgets
   * @returns {Promise<BudgetStatus[]>} Budget statuses
   */
  async getBudgetStatus() {
    if (!this.db) {
      throw new Error('BudgetManager not initialized. Call init() first.');
    }

    const budgets = await this.getAllBudgets();
    const statuses = [];

    for (const budget of budgets) {
      const { start, end } = this._calculatePeriod(
        budget.period,
        new Date(),
        budget.startDate,
        budget.endDate
      );

      const spent = await this._getSpending({ ...budget, startDate: start, endDate: end });
      const remaining = Math.max(0, budget.amount - spent);
      const percentage = budget.amount > 0 ? (spent / budget.amount) : 0;

      let status = BudgetManager.ALERT_LEVELS.OK;
      if (percentage >= 1) {
        status = BudgetManager.ALERT_LEVELS.EXCEEDED;
      } else if (percentage >= budget.alertThreshold) {
        status = BudgetManager.ALERT_LEVELS.WARNING;
      } else if (percentage >= budget.alertThreshold * 0.75) {
        status = BudgetManager.ALERT_LEVELS.CRITICAL;
      }

      statuses.push({
        id: budget.id,
        limit: budget.amount,
        spent: parseFloat(spent.toFixed(4)),
        remaining: parseFloat(remaining.toFixed(4)),
        percentage: parseFloat((percentage * 100).toFixed(2)),
        status,
        periodStart: start,
        periodEnd: end
      });
    }

    return statuses;
  }

  /**
   * Checks if an operation is allowed within budget
   * @param {Object} operation - Operation details
   * @param {number} [operation.estimatedCost=0] - Estimated cost
   * @param {string} [operation.provider] - Provider name
   * @param {string} [operation.budgetId] - Specific budget to check
   * @returns {Promise<OperationCheck>} Check result
   */
  async checkBudget(operation = {}) {
    if (!this.db) {
      throw new Error('BudgetManager not initialized. Call init() first.');
    }

    const { estimatedCost = 0, provider, budgetId } = operation;

    let budgets = await this.getAllBudgets();
    
    if (budgetId) {
      const budget = budgets.find(b => b.id === budgetId);
      budgets = budget ? [budget] : [];
    }

    if (provider) {
      budgets = budgets.filter(b => !b.providers || b.providers.includes(provider));
    }

    if (budgets.length === 0) {
      return {
        allowed: true,
        estimatedRemaining: Infinity
      };
    }

    const statuses = await this.getBudgetStatus();
    
    for (const budget of budgets) {
      const status = statuses.find(s => s.id === budget.id);
      if (!status) continue;

      const remainingAfterOp = status.remaining - estimatedCost;

      if (status.status === BudgetManager.ALERT_LEVELS.EXCEEDED && budget.blockOnExceed) {
        return {
          allowed: false,
          reason: `Budget ${budget.id} exceeded`,
          estimatedRemaining: status.remaining,
          budgetId: budget.id
        };
      }

      if (remainingAfterOp < 0 && budget.blockOnExceed) {
        return {
          allowed: false,
          reason: `Operation would exceed budget ${budget.id}`,
          estimatedRemaining: status.remaining,
          budgetId: budget.id
        };
      }
    }

    const minRemaining = Math.min(...statuses
      .filter(s => budgets.some(b => b.id === s.id))
      .map(s => s.remaining - estimatedCost)
    );

    return {
      allowed: true,
      estimatedRemaining: Math.max(0, minRemaining),
      budgetId: budgets[0]?.id
    };
  }

  /**
   * Checks budgets and emits alerts if needed
   * @returns {Promise<void>}
   */
  async checkAlerts() {
    if (!this.db) {
      throw new Error('BudgetManager not initialized. Call init() first.');
    }

    const statuses = await this.getBudgetStatus();
    const now = Date.now();

    for (const status of statuses) {
      const budget = await this.getBudget(status.id);
      if (!budget) continue;

      const shouldAlert = 
        (status.status === BudgetManager.ALERT_LEVELS.WARNING && status.percentage >= budget.alertThreshold * 100) ||
        status.status === BudgetManager.ALERT_LEVELS.EXCEEDED;

      if (shouldAlert) {
        // Check if we already sent an alert recently
        const recentAlert = await this.db.get(
          `SELECT * FROM budget_alerts 
           WHERE budget_id = ? AND level = ? AND timestamp > ? AND acknowledged = 0
           ORDER BY timestamp DESC LIMIT 1`,
          [status.id, status.status, now - 24 * 60 * 60 * 1000] // 24 hours
        );

        if (!recentAlert) {
          const alert = {
            id: `alert-${now}-${Math.random().toString(36).substring(2, 11)}`,
            budgetId: status.id,
            level: status.status,
            message: this._formatAlertMessage(status),
            timestamp: now
          };

          await this.db.run(
            `INSERT INTO budget_alerts (id, budget_id, level, message, timestamp)
             VALUES (?, ?, ?, ?, ?)`,
            [alert.id, alert.budgetId, alert.level, alert.message, alert.timestamp]
          );

          this.emit('budget:alert', alert, status);
        }
      }
    }
  }

  /**
   * Formats an alert message
   * @private
   * @param {BudgetStatus} status - Budget status
   * @returns {string} Formatted message
   */
  _formatAlertMessage(status) {
    if (status.status === BudgetManager.ALERT_LEVELS.EXCEEDED) {
      return `Budget ${status.id} has been exceeded! Spent: $${status.spent}, Limit: $${status.limit}`;
    }
    return `Budget ${status.id} is at ${status.percentage.toFixed(1)}% usage. Remaining: $${status.remaining}`;
  }

  /**
   * Gets recent alerts
   * @param {Object} [options={}] - Query options
   * @param {boolean} [options.unacknowledgedOnly=false] - Only unacknowledged
   * @param {number} [options.limit=50] - Maximum alerts to return
   * @returns {Promise<Array>} Alert records
   */
  async getAlerts(options = {}) {
    if (!this.db) {
      throw new Error('BudgetManager not initialized. Call init() first.');
    }

    const { unacknowledgedOnly = false, limit = 50 } = options;
    
    let query = 'SELECT * FROM budget_alerts';
    const params = [];

    if (unacknowledgedOnly) {
      query += ' WHERE acknowledged = 0';
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    return await this.db.all(query, params);
  }

  /**
   * Acknowledges an alert
   * @param {string} alertId - Alert ID
   * @returns {Promise<boolean>} True if acknowledged
   */
  async acknowledgeAlert(alertId) {
    if (!this.db) {
      throw new Error('BudgetManager not initialized. Call init() first.');
    }

    const result = await this.db.run(
      'UPDATE budget_alerts SET acknowledged = 1 WHERE id = ?',
      [alertId]
    );

    return result.changes > 0;
  }

  /**
   * Gets spending forecast relative to budgets
   * @param {number} [days=30] - Days to forecast
   * @returns {Promise<Object>} Forecast data
   */
  async getForecast(days = 30) {
    if (!this.db || !this.costTracker) {
      throw new Error('BudgetManager not properly initialized.');
    }

    const budgets = await this.getAllBudgets();
    const forecast = await this.costTracker.predictCosts(days);
    const status = await this.getBudgetStatus();

    const budgetForecasts = budgets.map(budget => {
      const currentStatus = status.find(s => s.id === budget.id);
      const projectedTotal = currentStatus.spent + forecast.predictedCost;
      const willExceed = projectedTotal > budget.amount;

      return {
        budgetId: budget.id,
        currentSpent: currentStatus.spent,
        projectedTotal,
        budgetLimit: budget.amount,
        willExceed,
        projectedOverspend: willExceed ? projectedTotal - budget.amount : 0
      };
    });

    return {
      forecast,
      budgets: budgetForecasts,
      overallRisk: budgetForecasts.some(bf => bf.willExceed) ? 'high' : 'low'
    };
  }
}

export default BudgetManager;
