/**
 * @fileoverview Thinking Budget Management for Claude Extended Thinking
 * @module claude/extended-thinking/budget
 *
 * Manages token budgets for Claude's extended thinking mode, providing
 * allocation, tracking, and alert capabilities.
 */

import { EventEmitter } from 'events';

/**
 * Budget state enumeration
 * @readonly
 * @enum {string}
 */
export const BudgetState = {
  /** Budget is fully available */
  AVAILABLE: 'available',
  /** Budget is partially consumed */
  PARTIAL: 'partial',
  /** Budget is near exhaustion (alert threshold reached) */
  WARNING: 'warning',
  /** Budget is exhausted */
  EXHAUSTED: 'exhausted',
  /** Budget is in an error state */
  ERROR: 'error',
};

/**
 * ThinkingBudget - Manages token budgets for extended thinking
 *
 * Provides allocation, tracking, and alerting for thinking token budgets.
 * Emits events when thresholds are reached or budget is exhausted.
 *
 * @extends EventEmitter
 * @example
 * const budget = new ThinkingBudget({ initialBudget: 16000 });
 *
 * budget.on('thresholdReached', ({ remaining }) => {
 *   console.log(`Warning: Only ${remaining} tokens remaining`);
 * });
 *
 * budget.allocateBudget(32000);
 * budget.trackUsage(1500);
 */
export class ThinkingBudget extends EventEmitter {
  /**
   * Creates a new ThinkingBudget instance
   * @param {Object} options - Budget configuration
   * @param {number} [options.initialBudget=0] - Initial budget allocation
   * @param {number} [options.alertThreshold=0.8] - Alert threshold (0-1)
   * @param {boolean} [options.strictMode=false] - Throw on over-allocation
   * @param {boolean} [options.enableAlerts=true] - Enable threshold alerts
   */
  constructor(options = {}) {
    super();

    this.totalBudget = 0;
    this.used = 0;
    this.remaining = 0;
    this.alertThreshold = options.alertThreshold ?? 0.8;
    this.strictMode = options.strictMode ?? false;
    this.enableAlerts = options.enableAlerts ?? true;

    // Alert tracking to prevent duplicate alerts
    this.alertTriggered = false;

    // Statistics
    this.stats = {
      allocations: 0,
      totalAllocated: 0,
      usageEvents: 0,
      totalUsed: 0,
      alertCount: 0,
      exhaustionCount: 0,
    };

    // Allocation history
    this.allocationHistory = [];
    this.usageHistory = [];
    this.maxHistorySize = options.maxHistorySize ?? 50;

    // Set initial budget if provided
    if (options.initialBudget > 0) {
      this.allocateBudget(options.initialBudget);
    }
  }

  /**
   * Allocates a thinking budget
   *
   * @param {number} tokens - Number of tokens to allocate
   * @returns {Object} Allocation result with status
   * @throws {Error} When tokens is invalid or budget already allocated in strict mode
   *
   * @example
   * const result = budget.allocateBudget(16000);
   * console.log(result.state); // 'available'
   * console.log(result.remaining); // 16000
   */
  allocateBudget(tokens) {
    // Validate input
    if (!Number.isInteger(tokens) || tokens < 0) {
      throw new Error('Budget must be a non-negative integer');
    }

    if (tokens > 128000) {
      throw new Error('Budget cannot exceed 128000 tokens');
    }

    // Check strict mode
    if (this.strictMode && this.totalBudget > 0) {
      throw new Error('Budget already allocated. Reset before re-allocating in strict mode.');
    }

    // Reset current state
    const previousBudget = this.totalBudget;
    this.totalBudget = tokens;
    this.used = 0;
    this.remaining = tokens;
    this.alertTriggered = false;

    // Record allocation
    const allocation = {
      amount: tokens,
      timestamp: new Date().toISOString(),
      previousBudget,
    };

    this.allocationHistory.push(allocation);
    this.trimAllocationHistory();

    // Update stats
    this.stats.allocations++;
    this.stats.totalAllocated += tokens;

    // Determine state
    const state = this.determineState();

    this.emit('budgetAllocated', {
      amount: tokens,
      previousBudget,
      state,
      timestamp: allocation.timestamp,
    });

    return {
      allocated: tokens,
      remaining: this.remaining,
      state,
      timestamp: allocation.timestamp,
    };
  }

  /**
   * Tracks usage against the budget
   *
   * @param {number} tokens - Tokens consumed
   * @param {Object} metadata - Optional metadata about usage
   * @returns {Object} Updated budget status
   * @throws {Error} When usage exceeds budget in strict mode
   *
   * @example
   * const status = budget.trackUsage(1500);
   * console.log(status.remaining); // 14500
   * console.log(status.percentage); // 0.09375
   */
  trackUsage(tokens, metadata = {}) {
    if (!Number.isInteger(tokens) || tokens < 0) {
      throw new Error('Usage must be a non-negative integer');
    }

    if (tokens === 0) {
      return this.getStatus();
    }

    // Check if this would exceed budget in strict mode
    if (this.strictMode && tokens > this.remaining) {
      throw new Error(
        `Usage (${tokens}) exceeds remaining budget (${this.remaining}). ` +
        'Disable strict mode to allow over-allocation tracking.'
      );
    }

    // Track usage
    this.used += tokens;
    this.remaining = Math.max(0, this.totalBudget - this.used);

    // Record usage event
    const usage = {
      tokens,
      timestamp: new Date().toISOString(),
      remaining: this.remaining,
      percentage: this.totalBudget > 0 ? this.used / this.totalBudget : 0,
      ...metadata,
    };

    this.usageHistory.push(usage);
    this.trimUsageHistory();

    // Update stats
    this.stats.usageEvents++;
    this.stats.totalUsed += tokens;

    // Emit usage event
    this.emit('usage', usage);

    // Check for threshold alert
    if (this.enableAlerts && !this.alertTriggered) {
      const usageRatio = this.totalBudget > 0 ? this.used / this.totalBudget : 0;
      if (usageRatio >= this.alertThreshold) {
        this.alertTriggered = true;
        this.stats.alertCount++;
        this.emit('thresholdReached', {
          threshold: this.alertThreshold,
          used: this.used,
          remaining: this.remaining,
          percentage: usageRatio,
          timestamp: usage.timestamp,
        });
      }
    }

    // Check for exhaustion
    if (this.remaining === 0 && this.totalBudget > 0) {
      this.stats.exhaustionCount++;
      this.emit('budgetExhausted', {
        totalBudget: this.totalBudget,
        used: this.used,
        timestamp: usage.timestamp,
      });
    }

    return this.getStatus();
  }

  /**
   * Releases (returns) tokens to the budget
   *
   * Useful for corrections or when actual usage was less than reserved.
   *
   * @param {number} tokens - Tokens to release
   * @returns {Object} Updated budget status
   * @throws {Error} When release amount is invalid
   *
   * @example
   * budget.trackUsage(5000); // Reserved 5K
   * // Actual usage was only 3K
   * budget.releaseTokens(2000); // Return 2K to budget
   */
  releaseTokens(tokens) {
    if (!Number.isInteger(tokens) || tokens < 0) {
      throw new Error('Release amount must be a non-negative integer');
    }

    if (tokens > this.used) {
      throw new Error(`Cannot release more tokens (${tokens}) than used (${this.used})`);
    }

    this.used -= tokens;
    this.remaining = Math.min(this.totalBudget, this.remaining + tokens);

    // Reset alert if we're back below threshold
    const usageRatio = this.totalBudget > 0 ? this.used / this.totalBudget : 0;
    if (usageRatio < this.alertThreshold) {
      this.alertTriggered = false;
    }

    this.emit('tokensReleased', {
      released: tokens,
      used: this.used,
      remaining: this.remaining,
      timestamp: new Date().toISOString(),
    });

    return this.getStatus();
  }

  /**
   * Gets the remaining budget
   * @returns {number} Remaining tokens
   */
  getRemainingBudget() {
    return this.remaining;
  }

  /**
   * Gets the total allocated budget
   * @returns {number} Total budget
   */
  getTotalBudget() {
    return this.totalBudget;
  }

  /**
   * Gets the used amount
   * @returns {number} Used tokens
   */
  getUsedBudget() {
    return this.used;
  }

  /**
   * Gets comprehensive budget status
   * @returns {Object} Status object
   */
  getStatus() {
    const percentage = this.totalBudget > 0 ? this.used / this.totalBudget : 0;

    return {
      totalBudget: this.totalBudget,
      used: this.used,
      remaining: this.remaining,
      percentage,
      state: this.determineState(),
      alertTriggered: this.alertTriggered,
      isExhausted: this.remaining === 0 && this.totalBudget > 0,
      isAvailable: this.remaining > 0,
    };
  }

  /**
   * Determines the current budget state
   * @private
   * @returns {BudgetState}
   */
  determineState() {
    if (this.totalBudget === 0) {
      return BudgetState.AVAILABLE;
    }

    if (this.remaining === 0) {
      return BudgetState.EXHAUSTED;
    }

    const usageRatio = this.used / this.totalBudget;

    if (usageRatio >= this.alertThreshold) {
      return BudgetState.WARNING;
    }

    if (usageRatio > 0) {
      return BudgetState.PARTIAL;
    }

    return BudgetState.AVAILABLE;
  }

  /**
   * Resets the budget to zero
   * @returns {Object} Final status before reset
   */
  reset() {
    const finalStatus = this.getStatus();

    this.totalBudget = 0;
    this.used = 0;
    this.remaining = 0;
    this.alertTriggered = false;

    this.emit('reset', {
      finalStatus,
      timestamp: new Date().toISOString(),
    });

    return finalStatus;
  }

  /**
   * Sets a new alert threshold
   * @param {number} threshold - New threshold (0-1)
   * @returns {ThinkingBudget} This instance for chaining
   */
  setAlertThreshold(threshold) {
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
      throw new Error('Alert threshold must be between 0 and 1');
    }

    this.alertThreshold = threshold;

    // Re-check if we should trigger alert
    const usageRatio = this.totalBudget > 0 ? this.used / this.totalBudget : 0;
    if (usageRatio < threshold) {
      this.alertTriggered = false;
    }

    this.emit('thresholdChanged', { threshold });

    return this;
  }

  /**
   * Checks if the budget has sufficient tokens
   * @param {number} required - Required tokens
   * @returns {boolean} True if sufficient
   */
  hasSufficientBudget(required) {
    return this.remaining >= required;
  }

  /**
   * Estimates remaining requests based on average usage
   * @param {number} averageTokensPerRequest - Expected average tokens per request
   * @returns {number} Estimated remaining requests
   */
  estimateRemainingRequests(averageTokensPerRequest = 1000) {
    if (averageTokensPerRequest <= 0) return 0;
    return Math.floor(this.remaining / averageTokensPerRequest);
  }

  /**
   * Creates a projection of budget depletion
   * @param {number} usageRate - Tokens per time unit
   * @param {string} timeUnit - Time unit ('minute', 'hour', 'day')
   * @returns {Object} Projection data
   */
  projectDepletion(usageRate, timeUnit = 'hour') {
    if (usageRate <= 0 || this.remaining <= 0) {
      return { willDeplete: false, timeRemaining: Infinity };
    }

    const timeUnits = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
    };

    const msPerUnit = timeUnits[timeUnit] || timeUnits.hour;
    const tokensPerMs = usageRate / msPerUnit;
    const msRemaining = this.remaining / tokensPerMs;

    const depletionTime = new Date(Date.now() + msRemaining);

    return {
      willDeplete: true,
      timeRemaining: msRemaining,
      depletionTime: depletionTime.toISOString(),
      depletionTimeFormatted: depletionTime.toLocaleString(),
    };
  }

  /**
   * Gets budget statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const avgUsage = this.stats.usageEvents > 0
      ? this.stats.totalUsed / this.stats.usageEvents
      : 0;

    return {
      ...this.stats,
      currentBudget: this.totalBudget,
      currentUsed: this.used,
      currentRemaining: this.remaining,
      utilizationRate: this.totalBudget > 0 ? this.used / this.totalBudget : 0,
      averageUsagePerEvent: Math.round(avgUsage),
      allocationHistory: this.allocationHistory.length,
      usageHistory: this.usageHistory.length,
    };
  }

  /**
   * Gets allocation history
   * @param {number} [limit] - Maximum records to return
   * @returns {Array<Object>} Allocation history
   */
  getAllocationHistory(limit) {
    const history = [...this.allocationHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Gets usage history
   * @param {number} [limit] - Maximum records to return
   * @returns {Array<Object>} Usage history
   */
  getUsageHistory(limit) {
    const history = [...this.usageHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Clears all history
   * @returns {ThinkingBudget} This instance for chaining
   */
  clearHistory() {
    this.allocationHistory = [];
    this.usageHistory = [];
    this.emit('historyCleared');
    return this;
  }

  /**
   * Trims allocation history to max size
   * @private
   */
  trimAllocationHistory() {
    if (this.allocationHistory.length > this.maxHistorySize) {
      this.allocationHistory = this.allocationHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Trims usage history to max size
   * @private
   */
  trimUsageHistory() {
    if (this.usageHistory.length > this.maxHistorySize) {
      this.usageHistory = this.usageHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Creates a snapshot of current state for persistence
   * @returns {Object} Serializable state
   */
  toJSON() {
    return {
      totalBudget: this.totalBudget,
      used: this.used,
      remaining: this.remaining,
      alertThreshold: this.alertThreshold,
      strictMode: this.strictMode,
      alertTriggered: this.alertTriggered,
      stats: { ...this.stats },
      allocationHistory: [...this.allocationHistory],
      usageHistory: [...this.usageHistory],
    };
  }

  /**
   * Restores budget from a snapshot
   * @param {Object} data - Snapshot data
   * @returns {ThinkingBudget} This instance for chaining
   */
  fromJSON(data) {
    if (data.totalBudget !== undefined) this.totalBudget = data.totalBudget;
    if (data.used !== undefined) this.used = data.used;
    if (data.remaining !== undefined) this.remaining = data.remaining;
    if (data.alertThreshold !== undefined) this.alertThreshold = data.alertThreshold;
    if (data.strictMode !== undefined) this.strictMode = data.strictMode;
    if (data.alertTriggered !== undefined) this.alertTriggered = data.alertTriggered;
    if (data.stats) this.stats = { ...data.stats };
    if (data.allocationHistory) this.allocationHistory = [...data.allocationHistory];
    if (data.usageHistory) this.usageHistory = [...data.usageHistory];

    this.emit('restored', { timestamp: new Date().toISOString() });

    return this;
  }
}

/**
 * Creates a budget with common presets
 *
 * @param {string} preset - Preset name ('minimal', 'standard', 'deep', 'maximum')
 * @returns {ThinkingBudget} Configured budget
 */
export function createPresetBudget(preset = 'standard') {
  const presets = {
    minimal: 4096,
    standard: 16000,
    deep: 32000,
    maximum: 64000,
  };

  const budget = presets[preset] || presets.standard;
  return new ThinkingBudget({ initialBudget: budget });
}

/**
 * Merges multiple budget statuses for aggregate reporting
 *
 * @param {Array<ThinkingBudget>} budgets - Budgets to merge
 * @returns {Object} Aggregated status
 */
export function mergeBudgetStatuses(budgets) {
  const totalBudget = budgets.reduce((sum, b) => sum + b.totalBudget, 0);
  const totalUsed = budgets.reduce((sum, b) => sum + b.used, 0);
  const totalRemaining = budgets.reduce((sum, b) => sum + b.remaining, 0);

  return {
    totalBudget,
    totalUsed,
    totalRemaining,
    utilizationRate: totalBudget > 0 ? totalUsed / totalBudget : 0,
    budgetCount: budgets.length,
    exhaustedCount: budgets.filter(b => b.remaining === 0 && b.totalBudget > 0).length,
    warningCount: budgets.filter(b => {
      const ratio = b.totalBudget > 0 ? b.used / b.totalBudget : 0;
      return ratio >= b.alertThreshold && b.remaining > 0;
    }).length,
  };
}

// Default export
export default {
  ThinkingBudget,
  BudgetState,
  createPresetBudget,
  mergeBudgetStatuses,
};
