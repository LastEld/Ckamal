/**
 * @fileoverview Budget Management Service for CogniMesh v5.0
 * Manages spending limits, alerts, and enforcement.
 * @module domains/billing/budget-service
 */

import { EventEmitter } from 'events';

/**
 * Budget configuration
 * @typedef {Object} Budget
 * @property {string} uuid - Unique identifier
 * @property {string} scope_type - global | company | user | agent
 * @property {string} [scope_id] - ID within scope
 * @property {string} name - Budget name
 * @property {string} description - Budget description
 * @property {string} period - daily | weekly | monthly | yearly | custom
 * @property {number} amount - Budget limit
 * @property {string} currency - Currency code
 * @property {Date} start_date - Period start
 * @property {Date} [end_date] - Period end
 * @property {number} alert_threshold_1 - First alert threshold (0-1)
 * @property {number} alert_threshold_2 - Second alert threshold (0-1)
 * @property {number} alert_threshold_3 - Third alert threshold (0-1)
 * @property {string} enforcement_mode - soft | hard | notify_only
 * @property {string[]} [providers] - Allowed providers
 * @property {string[]} [models] - Allowed models
 * @property {string[]} [operations] - Allowed operations
 * @property {boolean} is_active - Budget status
 */

/**
 * Budget status information
 * @typedef {Object} BudgetStatus
 * @property {string} uuid - Budget identifier
 * @property {string} name - Budget name
 * @property {number} limit - Budget limit
 * @property {number} spent - Amount spent
 * @property {number} remaining - Remaining budget
 * @property {number} percentage - Percentage used
 * @property {string} status - ok | info | warning | critical | exceeded
 * @property {Date} periodStart - Current period start
 * @property {Date} periodEnd - Current period end
 * @property {boolean} isBlocking - Whether budget blocks operations
 */

/**
 * Operation check result
 * @typedef {Object} OperationCheck
 * @property {boolean} allowed - Whether operation is allowed
 * @property {string} [reason] - Reason if blocked
 * @property {number} estimatedRemaining - Estimated remaining after operation
 * @property {string} [budgetUuid] - Applicable budget UUID
 * @property {string} [status] - Budget status
 */

/**
 * Budget alert information
 * @typedef {Object} BudgetAlert
 * @property {string} uuid - Alert identifier
 * @property {string} budget_id - Budget UUID
 * @property {string} level - Alert level
 * @property {number} threshold_triggered - Triggered threshold
 * @property {number} current_spend - Current spend amount
 * @property {number} budget_limit - Budget limit
 * @property {string} title - Alert title
 * @property {string} message - Alert message
 * @property {boolean} acknowledged - Whether alert is acknowledged
 */

/**
 * Budget management service with enforcement
 * @extends EventEmitter
 */
export class BudgetService extends EventEmitter {
  /**
   * Alert levels
   * @readonly
   * @enum {string}
   */
  static ALERT_LEVELS = {
    OK: 'ok',
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'critical',
    EXCEEDED: 'exceeded'
  };

  /**
   * Enforcement modes
   * @readonly
   * @enum {string}
   */
  static ENFORCEMENT_MODES = {
    SOFT: 'soft',           // Warn but allow
    HARD: 'hard',           // Block when exceeded
    NOTIFY_ONLY: 'notify_only'  // Track only
  };

  /**
   * Creates a BudgetService instance
   * @param {Object} options - Configuration options
   * @param {Object} options.repositories - Repository factory
   * @param {Object} options.db - Database connection
   * @param {CostService} [options.costService] - CostService instance
   */
  constructor(options = {}) {
    super();
    this.repositories = options.repositories || null;
    this.db = options.db || null;
    this.costService = options.costService || null;
    this.budgetRepo = this.repositories?.budgets ?? null;
    this.alertRepo = this.repositories?.budgetAlerts ?? null;
    this._pendingChecks = new Map();
    this._checkingBudgets = new Set();
  }

  /**
   * Generate UUID
   * @private
   * @returns {string}
   */
  _generateUuid() {
    return `bud_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate alert UUID
   * @private
   * @returns {string}
   */
  _generateAlertUuid() {
    return `alr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Calculate period boundaries
   * @private
   * @param {string} period - Period type
   * @param {Date} [referenceDate] - Reference date
   * @returns {{start: Date, end: Date}} Period boundaries
   */
  _calculatePeriod(period, referenceDate = new Date()) {
    const now = new Date(referenceDate);
    const start = new Date(now);
    const end = new Date(now);

    switch (period) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'weekly': {
        const dayOfWeek = start.getDay();
        start.setDate(start.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'monthly': {
        const year = start.getFullYear();
        const month = start.getMonth();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        // End of month: last day at 23:59:59
        end.setFullYear(year, month + 1, 0);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'yearly': {
        const currentYear = start.getFullYear();
        start.setFullYear(currentYear, 0, 1);
        start.setHours(0, 0, 0, 0);
        end.setFullYear(currentYear, 11, 31);
        end.setHours(23, 59, 59, 999);
        break;
      }
      default:
        throw new Error(`Unknown period type: ${period}`);
    }

    return { start, end };
  }

  /**
   * Create a new budget
   * @param {Object} data - Budget configuration
   * @param {string} data.name - Budget name
   * @param {string} data.scope_type - Scope type
   * @param {string} [data.scope_id] - Scope ID
   * @param {string} data.period - Budget period
   * @param {number} data.amount - Budget amount
   * @param {Object} [options] - Additional options
   * @param {number} [options.created_by] - Creator user ID
   * @returns {Promise<Budget>} Created budget
   */
  async createBudget(data, options = {}) {
    const { start, end } = this._calculatePeriod(data.period);

    const budget = {
      uuid: this._generateUuid(),
      scope_type: data.scope_type,
      scope_id: data.scope_id || null,
      name: data.name,
      description: data.description || null,
      period: data.period,
      amount: data.amount,
      currency: data.currency || 'USD',
      start_date: start.toISOString(),
      end_date: data.period === 'custom' ? data.end_date : end.toISOString(),
      alert_threshold_1: data.alert_threshold_1 ?? 0.50,
      alert_threshold_2: data.alert_threshold_2 ?? 0.75,
      alert_threshold_3: data.alert_threshold_3 ?? 0.90,
      enforcement_mode: data.enforcement_mode || 'hard',
      providers: data.providers ? JSON.stringify(data.providers) : null,
      models: data.models ? JSON.stringify(data.models) : null,
      operations: data.operations ? JSON.stringify(data.operations) : null,
      is_active: data.is_active !== false ? 1 : 0,
      created_by: options.created_by || null,
      metadata: JSON.stringify(data.metadata || {}),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (this.budgetRepo) {
      await this.budgetRepo.create(budget);
    } else if (this.db) {
      const columns = Object.keys(budget).join(', ');
      const placeholders = Object.keys(budget).map(() => '?').join(', ');
      await this.db.prepare(
        `INSERT INTO budgets (${columns}) VALUES (${placeholders})`
      ).run(...Object.values(budget));
    }

    this.emit('budget:created', budget);
    return this._hydrateBudget(budget);
  }

  /**
   * Hydrate budget from database row
   * @private
   * @param {Object} row - Database row
   * @returns {Budget}
   */
  _hydrateBudget(row) {
    const parseJson = (value, defaultValue = null) => {
      if (!value) return defaultValue;
      try {
        return JSON.parse(value);
      } catch (e) {
        return defaultValue;
      }
    };

    return {
      ...row,
      providers: parseJson(row.providers),
      models: parseJson(row.models),
      operations: parseJson(row.operations),
      metadata: parseJson(row.metadata, {}),
      is_active: row.is_active === 1 || row.is_active === true,
      start_date: new Date(row.start_date),
      end_date: row.end_date ? new Date(row.end_date) : null
    };
  }

  /**
   * Get budget by UUID
   * @param {string} uuid - Budget UUID
   * @returns {Promise<Budget|null>}
   */
  async getBudget(uuid) {
    if (!this.db) return null;

    const row = await this.db.prepare('SELECT * FROM budgets WHERE uuid = ?').get(uuid);
    return row ? this._hydrateBudget(row) : null;
  }

  /**
   * Get budgets by scope
   * @param {Object} scope - Scope filter
   * @param {string} scope.type - Scope type
   * @param {string} [scope.id] - Scope ID
   * @param {boolean} [activeOnly=true] - Only active budgets
   * @returns {Promise<Budget[]>}
   */
  async getBudgetsByScope(scope, activeOnly = true) {
    if (!this.db) return [];

    let query = 'SELECT * FROM budgets WHERE scope_type = ?';
    const params = [scope.type];

    if (scope.id) {
      query += ' AND scope_id = ?';
      params.push(String(scope.id));
    }

    if (activeOnly) {
      query += ' AND is_active = 1';
    }

    query += ' ORDER BY created_at DESC';

    const rows = await this.db.prepare(query).all(...params);
    return rows.map(r => this._hydrateBudget(r));
  }

  /**
   * Get current spend for a budget
   * @private
   * @param {Budget} budget - Budget configuration
   * @param {Date} periodStart - Period start
   * @param {Date} periodEnd - Period end
   * @returns {Promise<number>} Amount spent
   */
  async _getSpend(budget, periodStart, periodEnd) {
    if (!this.db) return 0;

    const filters = {
      startDate: periodStart,
      endDate: periodEnd
    };

    // Add scope filter based on budget scope
    switch (budget.scope_type) {
      case 'company':
        filters.company_id = budget.scope_id;
        break;
      case 'user':
        filters.user_id = budget.scope_id;
        break;
      case 'agent':
        filters.agent_id = budget.scope_id;
        break;
    }

    const result = await this.db.prepare(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM cost_events
      WHERE created_at >= ? AND created_at <= ?
        ${filters.company_id ? 'AND company_id = ?' : ''}
        ${filters.user_id ? 'AND user_id = ?' : ''}
        ${filters.agent_id ? 'AND agent_id = ?' : ''}
    `).get(
      periodStart.toISOString(),
      periodEnd.toISOString(),
      ...(filters.company_id ? [filters.company_id] : []),
      ...(filters.user_id ? [filters.user_id] : []),
      ...(filters.agent_id ? [filters.agent_id] : [])
    );

    return result?.total || 0;
  }

  /**
   * Get budget status with current spend
   * @param {string} uuid - Budget UUID
   * @returns {Promise<BudgetStatus|null>}
   */
  async getBudgetStatus(uuid) {
    // Thread safety: deduplicate concurrent checks for same budget
    if (this._pendingChecks.has(uuid)) {
      return this._pendingChecks.get(uuid);
    }

    const checkPromise = (async () => {
      try {
        const budget = await this.getBudget(uuid);
        if (!budget) return null;

        const { start, end } = this._calculatePeriod(budget.period);
        const spent = await this._getSpend(budget, start, end);
        const remaining = Math.max(0, budget.amount - spent);
        const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

        let status = BudgetService.ALERT_LEVELS.OK;
        if (percentage >= 100) {
          status = BudgetService.ALERT_LEVELS.EXCEEDED;
        } else if (percentage >= budget.alert_threshold_3 * 100) {
          status = BudgetService.ALERT_LEVELS.CRITICAL;
        } else if (percentage >= budget.alert_threshold_2 * 100) {
          status = BudgetService.ALERT_LEVELS.WARNING;
        } else if (percentage >= budget.alert_threshold_1 * 100) {
          status = BudgetService.ALERT_LEVELS.INFO;
        }

        // Use proper decimal rounding for financial values
        const round4 = (n) => Math.round(n * 10000) / 10000;
        const round2 = (n) => Math.round(n * 100) / 100;

        return {
          uuid: budget.uuid,
          name: budget.name,
          limit: budget.amount,
          spent: round4(spent),
          remaining: round4(remaining),
          percentage: round2(percentage),
          status,
          periodStart: start,
          periodEnd: end,
          isBlocking: status === BudgetService.ALERT_LEVELS.EXCEEDED && 
                      budget.enforcement_mode === BudgetService.ENFORCEMENT_MODES.HARD
        };
      } finally {
        this._pendingChecks.delete(uuid);
      }
    })();

    this._pendingChecks.set(uuid, checkPromise);
    return checkPromise;
  }

  /**
   * Get status for all budgets
   * @param {Object} [scope] - Optional scope filter
   * @returns {Promise<BudgetStatus[]>}
   */
  async getAllBudgetStatuses(scope = null) {
    const budgets = scope 
      ? await this.getBudgetsByScope(scope)
      : await this.getBudgetsByScope({ type: 'global' }, false);

    const statuses = await Promise.all(
      budgets.map(b => this.getBudgetStatus(b.uuid))
    );

    return statuses.filter(Boolean);
  }

  /**
   * Check if an operation is allowed within budget
   * @param {Object} operation - Operation details
   * @param {number} [operation.estimatedCost=0] - Estimated cost
   * @param {string} [operation.provider] - Provider name
   * @param {string} [operation.model] - Model identifier
   * @param {string} [operation.scope_type='global'] - Scope type
   * @param {string} [operation.scope_id] - Scope ID
   * @returns {Promise<OperationCheck>} Check result
   */
  async checkBudget(operation = {}) {
    if (!this.db) {
      return { allowed: true, estimatedRemaining: Infinity };
    }

    const {
      estimatedCost = 0,
      provider,
      model,
      scope_type = 'global',
      scope_id
    } = operation;

    // Get applicable budgets
    const budgets = await this.getBudgetsByScope({ type: scope_type, id: scope_id });

    if (budgets.length === 0) {
      return { allowed: true, estimatedRemaining: Infinity };
    }

    // Check each applicable budget
    const checks = await Promise.all(
      budgets.map(async (budget) => {
        // Filter by provider/model if specified
        if (budget.providers && Array.isArray(budget.providers) && !budget.providers.includes(provider)) {
          return null;
        }
        if (budget.models && Array.isArray(budget.models) && !budget.models.includes(model)) {
          return null;
        }

        const status = await this.getBudgetStatus(budget.uuid);
        if (!status) return null;

        // Calculate if budget is blocking: status is exceeded and enforcement is hard
        const isBlocking = status.status === BudgetService.ALERT_LEVELS.EXCEEDED && 
                           budget.enforcement_mode === BudgetService.ENFORCEMENT_MODES.HARD;

        const remainingAfterOp = status.remaining - estimatedCost;
        const wouldExceed = remainingAfterOp < 0;

        return {
          budget,
          status,
          isBlocking,
          remainingAfterOp,
          wouldExceed
        };
      })
    );

    const applicable = checks.filter(Boolean);

    if (applicable.length === 0) {
      return { allowed: true, estimatedRemaining: Infinity };
    }

    // Check for hard blocks - either already blocked or would exceed with hard enforcement
    const blocking = applicable.find(c => 
      c.isBlocking || 
      (c.wouldExceed && c.budget.enforcement_mode === BudgetService.ENFORCEMENT_MODES.HARD)
    );

    if (blocking) {
      return {
        allowed: false,
        reason: `Budget "${blocking.budget.name}" ${blocking.status.status}`,
        estimatedRemaining: blocking.status.remaining,
        budgetUuid: blocking.budget.uuid,
        status: blocking.status.status
      };
    }

    // Find minimum remaining
    const minRemaining = Math.min(...applicable.map(c => c.remainingAfterOp));

    return {
      allowed: true,
      estimatedRemaining: Math.max(0, minRemaining),
      warnings: applicable
        .filter(c => c.wouldExceed && c.budget.enforcement_mode === BudgetService.ENFORCEMENT_MODES.SOFT)
        .map(c => ({
          budgetUuid: c.budget.uuid,
          message: `Operation would exceed budget "${c.budget.name}"`
        }))
    };
  }

  /**
   * Create a budget alert
   * @private
   * @param {string} budgetUuid - Budget UUID
   * @param {string} level - Alert level
   * @param {BudgetStatus} status - Budget status
   * @returns {Promise<BudgetAlert>}
   */
  async _createAlert(budgetUuid, level, status) {
    const alert = {
      uuid: this._generateAlertUuid(),
      budget_id: budgetUuid,
      level,
      threshold_triggered: status.percentage / 100,
      current_spend: status.spent,
      budget_limit: status.limit,
      title: this._formatAlertTitle(level, status),
      message: this._formatAlertMessage(level, status),
      acknowledged: 0,
      channels_notified: JSON.stringify([]),
      created_at: new Date().toISOString()
    };

    if (this.alertRepo) {
      await this.alertRepo.create(alert);
    } else if (this.db) {
      const columns = Object.keys(alert).join(', ');
      const placeholders = Object.keys(alert).map(() => '?').join(', ');
      await this.db.prepare(
        `INSERT INTO budget_alerts (${columns}) VALUES (${placeholders})`
      ).run(...Object.values(alert));
    }

    this.emit('budget:alert', alert);
    return alert;
  }

  /**
   * Format alert title
   * @private
   * @param {string} level - Alert level
   * @param {BudgetStatus} status - Budget status
   * @returns {string}
   */
  _formatAlertTitle(level, status) {
    const levelLabels = {
      info: 'Budget Notification',
      warning: 'Budget Warning',
      critical: 'Budget Critical',
      exceeded: 'Budget Exceeded'
    };
    return `${levelLabels[level] || 'Budget Alert'}: ${status.name}`;
  }

  /**
   * Format alert message
   * @private
   * @param {string} level - Alert level
   * @param {BudgetStatus} status - Budget status
   * @returns {string}
   */
  _formatAlertMessage(level, status) {
    const percent = status.percentage.toFixed(1);
    const remaining = status.remaining.toFixed(2);
    
    switch (level) {
      case 'exceeded':
        return `Budget "${status.name}" has been exceeded! Spent: $${status.spent.toFixed(2)}, Limit: $${status.limit.toFixed(2)}`;
      case 'critical':
        return `Budget "${status.name}" is at ${percent}% usage. Only $${remaining} remaining.`;
      case 'warning':
        return `Budget "${status.name}" is at ${percent}% usage. $${remaining} remaining.`;
      default:
        return `Budget "${status.name}" is at ${percent}% usage.`;
    }
  }

  /**
   * Check budgets and generate alerts
   * @returns {Promise<BudgetAlert[]>}
   */
  async checkAlerts() {
    if (!this.db) return [];

    // Thread safety: prevent concurrent checkAlerts runs
    if (this._checkingBudgets.has('__global_check__')) {
      return [];
    }
    this._checkingBudgets.add('__global_check__');

    try {
      const statuses = await this.getAllBudgetStatuses();
      const alerts = [];
      const checkedBudgets = new Set();

      for (const status of statuses) {
        // Skip if already processed this budget
        if (checkedBudgets.has(status.uuid)) continue;
        checkedBudgets.add(status.uuid);

        const budget = await this.getBudget(status.uuid);
        if (!budget || !budget.is_active) continue;

        // Determine if alert should be generated (highest threshold crossed)
        let alertLevel = null;
        let thresholdTriggered = 0;
        
        const percentage = status.percentage;
        const thresholds = [
          { level: 'exceeded', threshold: 100, value: 1.0 },
          { level: 'critical', threshold: budget.alert_threshold_3 * 100, value: budget.alert_threshold_3 },
          { level: 'warning', threshold: budget.alert_threshold_2 * 100, value: budget.alert_threshold_2 },
          { level: 'info', threshold: budget.alert_threshold_1 * 100, value: budget.alert_threshold_1 }
        ];

        // Find the highest threshold that was crossed
        for (const t of thresholds) {
          if (percentage >= t.threshold) {
            alertLevel = t.level;
            thresholdTriggered = t.value;
            break; // Highest priority reached
          }
        }

        if (!alertLevel) continue;

        // Check for recent duplicate alerts (within 24 hours for same or higher level)
        const recentAlert = await this.db.prepare(`
          SELECT * FROM budget_alerts 
          WHERE budget_id = ? AND level = ? AND created_at > datetime('now', '-1 day')
          ORDER BY created_at DESC LIMIT 1
        `).get(status.uuid, alertLevel);

        if (!recentAlert) {
          const alert = await this._createAlert(status.uuid, alertLevel, {
            ...status,
            threshold_triggered: thresholdTriggered
          });
          alerts.push(alert);
        }
      }

      return alerts;
    } finally {
      this._checkingBudgets.delete('__global_check__');
    }
  }

  /**
   * Get unacknowledged alerts
   * @param {Object} [options] - Query options
   * @param {string} [options.budgetUuid] - Filter by budget
   * @param {number} [options.limit=50] - Maximum results
   * @returns {Promise<BudgetAlert[]>}
   */
  async getAlerts(options = {}) {
    if (!this.db) return [];

    let query = 'SELECT * FROM budget_alerts WHERE acknowledged = 0';
    const params = [];

    if (options.budgetUuid) {
      query += ' AND budget_id = ?';
      params.push(options.budgetUuid);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(options.limit || 50);

    const rows = await this.db.prepare(query).all(...params);
    return rows.map(r => ({
      ...r,
      acknowledged: r.acknowledged === 1,
      channels_notified: JSON.parse(r.channels_notified || '[]')
    }));
  }

  /**
   * Acknowledge an alert
   * @param {string} alertUuid - Alert UUID
   * @param {number} userId - User acknowledging
   * @returns {Promise<boolean>}
   */
  async acknowledgeAlert(alertUuid, userId) {
    if (!this.db) return false;

    const result = await this.db.prepare(`
      UPDATE budget_alerts 
      SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ?
      WHERE uuid = ?
    `).run(userId, new Date().toISOString(), alertUuid);

    return result.changes > 0;
  }

  /**
   * Update budget
   * @param {string} uuid - Budget UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Budget|null>}
   */
  async updateBudget(uuid, updates) {
    if (!this.db) return null;

    const allowedFields = [
      'name', 'description', 'amount', 'alert_threshold_1',
      'alert_threshold_2', 'alert_threshold_3', 'enforcement_mode',
      'is_active', 'providers', 'models', 'operations'
    ];

    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.includes(key)) continue;
      
      if (['providers', 'models', 'operations'].includes(key) && value) {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(value));
      } else if (key === 'is_active') {
        fields.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return null;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(uuid);

    await this.db.prepare(
      `UPDATE budgets SET ${fields.join(', ')} WHERE uuid = ?`
    ).run(...values);

    this.emit('budget:updated', { uuid, updates });
    return this.getBudget(uuid);
  }

  /**
   * Delete budget
   * @param {string} uuid - Budget UUID
   * @returns {Promise<boolean>}
   */
  async deleteBudget(uuid) {
    if (!this.db) return false;

    const result = await this.db.prepare('DELETE FROM budgets WHERE uuid = ?').run(uuid);
    
    if (result.changes > 0) {
      this.emit('budget:deleted', { uuid });
    }

    return result.changes > 0;
  }

  /**
   * Get budget forecast with risk assessment
   * @param {string} uuid - Budget UUID
   * @param {number} [days=30] - Forecast days
   * @returns {Promise<Object|null>}
   */
  async getForecast(uuid, days = 30) {
    const budget = await this.getBudget(uuid);
    if (!budget || !this.costService) return null;

    const status = await this.getBudgetStatus(uuid);
    const forecast = await this.costService.predictCosts(days, {
      company_id: budget.scope_type === 'company' ? parseInt(budget.scope_id, 10) || undefined : undefined,
      user_id: budget.scope_type === 'user' ? parseInt(budget.scope_id, 10) || undefined : undefined
    });

    const projectedTotal = status.spent + forecast.predictedCost;
    const willExceed = projectedTotal > budget.amount;

    return {
      budgetUuid: uuid,
      budgetName: budget.name,
      currentSpend: status.spent,
      budgetLimit: budget.amount,
      daysRemaining: days,
      forecast: {
        predictedSpend: forecast.predictedCost,
        confidence: forecast.confidence,
        dailyBreakdown: forecast.dailyBreakdown
      },
      projection: {
        projectedTotal,
        willExceed,
        projectedOverspend: willExceed ? projectedTotal - budget.amount : 0,
        daysUntilExhausted: willExceed && forecast.averageDailyCost > 0
          ? Math.max(0, Math.ceil(status.remaining / forecast.averageDailyCost))
          : null
      },
      risk: {
        level: willExceed ? 'high' : forecast.confidence > 0.8 ? 'low' : 'medium',
        recommendation: willExceed 
          ? 'Increase budget limit or reduce usage'
          : 'Budget on track'
      }
    };
  }
}

export default BudgetService;
