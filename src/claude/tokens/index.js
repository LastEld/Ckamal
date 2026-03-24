/**
 * @fileoverview Token Management Module for CogniMesh v5.0
 * Manages token budgets, tracking, and usage analytics.
 * @module claude/tokens
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} TokenUsage
 * @property {number} input - Input tokens consumed
 * @property {number} output - Output tokens generated
 * @property {number} total - Total tokens
 * @property {number} timestamp - Usage timestamp
 * @property {string} [operation] - Operation type
 */

/**
 * @typedef {Object} BudgetAlert
 * @property {'low'|'critical'|'exceeded'} level - Alert level
 * @property {number} remaining - Remaining tokens
 * @property {number} percentUsed - Percentage used
 * @property {string} message - Alert message
 */

/**
 * @typedef {Object} TokenStats
 * @property {number} totalBudget - Total budget
 * @property {number} usedTokens - Used tokens
 * @property {number} remainingTokens - Remaining tokens
 * @property {number} percentUsed - Percentage used
 * @property {TokenUsage[]} recentUsage - Recent usage entries
 * @property {Object} usageByOperation - Usage breakdown by operation
 */

/**
 * TokenManager handles token counting, budgeting, and usage tracking
 * with configurable alerts and limits.
 * @extends EventEmitter
 */
export class TokenManager extends EventEmitter {
  /** @type {number} */
  #budget;
  
  /** @type {number} */
  #usedTokens = 0;
  
  /** @type {TokenUsage[]} */
  #usageHistory = [];
  
  /** @type {Map<string, number>} */
  #operationUsage = new Map();
  
  /** @type {Set<string>} */
  #subscribers = new Set();
  
  /** @type {number} */
  #maxHistorySize;
  
  /** @type {number} */
  #lowThreshold;
  
  /** @type {number} */
  #criticalThreshold;
  
  /** @type {Object} */
  #encoder;

  /**
   * Creates a TokenManager instance.
   * @param {Object} options - Configuration options
   * @param {number} [options.budget=100000] - Initial token budget
   * @param {number} [options.maxHistorySize=10000] - Maximum history entries
   * @param {number} [options.lowThreshold=0.7] - Low budget threshold (0-1)
   * @param {number} [options.criticalThreshold=0.9] - Critical threshold (0-1)
   * @param {Object} [options.encoder] - Custom token encoder
   */
  constructor(options = {}) {
    super();
    this.#budget = options.budget || 100000;
    this.#maxHistorySize = options.maxHistorySize || 10000;
    this.#lowThreshold = options.lowThreshold ?? 0.7;
    this.#criticalThreshold = options.criticalThreshold ?? 0.9;
    this.#encoder = options.encoder || null;
  }

  /**
   * Validates subscriber authentication.
   * @private
   * @param {string} subscriptionKey - Subscriber key
   * @throws {Error} If not authenticated
   */
  #requireAuth(subscriptionKey) {
    if (!this.#subscribers.has(subscriptionKey)) {
      throw new Error('Unauthorized: Valid subscription required');
    }
  }

  /**
   * Subscribes to the token manager.
   * @param {string} subscriptionKey - Unique subscriber identifier
   * @returns {boolean} Success status
   */
  subscribe(subscriptionKey) {
    if (this.#subscribers.has(subscriptionKey)) {
      return false;
    }
    this.#subscribers.add(subscriptionKey);
    this.emit('subscribed', { subscriptionKey, timestamp: Date.now() });
    return true;
  }

  /**
   * Unsubscribes from the token manager.
   * @param {string} subscriptionKey - Subscriber identifier
   * @returns {boolean} Success status
   */
  unsubscribe(subscriptionKey) {
    const removed = this.#subscribers.delete(subscriptionKey);
    if (removed) {
      this.emit('unsubscribed', { subscriptionKey, timestamp: Date.now() });
    }
    return removed;
  }

  /**
   * Counts tokens in text.
   * Uses configured encoder if available, otherwise approximates.
   * @param {string} text - Text to count
   * @returns {number} Token count
   */
  countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    
    if (this.#encoder) {
      return this.#encoder.count(text);
    }
    
    // Approximation: ~4 characters per token
    // More accurate approximation considering word boundaries
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    let count = 0;
    
    for (const word of words) {
      // Short words are usually 1 token
      if (word.length <= 3) {
        count += 1;
      } 
      // Average English word is ~1.3 tokens
      else if (word.length <= 6) {
        count += 1;
      }
      // Longer words or code
      else {
        count += Math.ceil(word.length / 4);
      }
    }
    
    // Punctuation often gets its own token
    const punctuations = (text.match(/[.,!?;:]/g) || []).length;
    count += Math.ceil(punctuations / 2);
    
    return Math.max(1, count);
  }

  /**
   * Gets the current token budget.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {number} Current budget
   */
  getBudget(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    return this.#budget;
  }

  /**
   * Sets a new token budget.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {number} budget - New budget value
   * @param {Object} [options] - Set options
   * @param {boolean} [options.resetUsage=false] - Reset current usage
   * @returns {TokenStats} Updated statistics
   */
  setBudget(subscriptionKey, budget, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    if (budget < 0) {
      throw new Error('Budget cannot be negative');
    }

    this.#budget = budget;
    
    if (options.resetUsage) {
      this.#usedTokens = 0;
      this.#usageHistory = [];
      this.#operationUsage.clear();
    }

    this.emit('budgetChanged', { 
      newBudget: budget, 
      usedTokens: this.#usedTokens,
      timestamp: Date.now() 
    });

    return this.getStats(subscriptionKey);
  }

  /**
   * Tracks token usage.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {number|TokenUsage} tokens - Tokens used or usage object
   * @param {Object} [metadata] - Usage metadata
   * @param {string} [metadata.operation] - Operation name
   * @param {string} [metadata.model] - Model used
   * @returns {TokenStats} Updated statistics
   * @throws {Error} If budget exceeded and strict mode
   */
  trackUsage(subscriptionKey, tokens, metadata = {}) {
    this.#requireAuth(subscriptionKey);

    let usage;
    if (typeof tokens === 'number') {
      usage = {
        input: tokens,
        output: 0,
        total: tokens,
        timestamp: Date.now(),
        ...metadata
      };
    } else {
      usage = {
        input: tokens.input || 0,
        output: tokens.output || 0,
        total: tokens.input + tokens.output,
        timestamp: Date.now(),
        ...metadata
      };
    }

    // Check if would exceed budget
    if (this.#usedTokens + usage.total > this.#budget) {
      const alert = this.#createAlert('exceeded');
      this.emit('budgetExceeded', { usage, alert, timestamp: Date.now() });
      
      if (metadata.strict) {
        throw new Error(`Token budget exceeded: ${this.#usedTokens + usage.total} > ${this.#budget}`);
      }
    }

    // Record usage
    this.#usedTokens += usage.total;
    this.#usageHistory.push(usage);
    
    // Track by operation
    if (usage.operation) {
      const current = this.#operationUsage.get(usage.operation) || 0;
      this.#operationUsage.set(usage.operation, current + usage.total);
    }

    // Trim history
    while (this.#usageHistory.length > this.#maxHistorySize) {
      this.#usageHistory.shift();
    }

    // Check thresholds
    this.#checkThresholds();

    this.emit('usageTracked', { usage, totalUsed: this.#usedTokens });

    return this.getStats(subscriptionKey);
  }

  /**
   * Gets remaining token budget.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {number} Remaining tokens
   */
  getRemainingBudget(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    return Math.max(0, this.#budget - this.#usedTokens);
  }

  /**
   * Gets comprehensive token statistics.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {TokenStats} Token statistics
   */
  getStats(subscriptionKey) {
    this.#requireAuth(subscriptionKey);

    const usageByOperation = {};
    for (const [op, tokens] of this.#operationUsage.entries()) {
      usageByOperation[op] = tokens;
    }

    return {
      totalBudget: this.#budget,
      usedTokens: this.#usedTokens,
      remainingTokens: this.getRemainingBudget(subscriptionKey),
      percentUsed: this.#budget > 0 ? (this.#usedTokens / this.#budget) : 0,
      recentUsage: this.#usageHistory.slice(-100),
      usageByOperation
    };
  }

  /**
   * Resets usage tracking.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {Object} [options] - Reset options
   * @param {boolean} [options.preserveHistory=false] - Keep history entries
   */
  resetUsage(subscriptionKey, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    this.#usedTokens = 0;
    this.#operationUsage.clear();
    
    if (!options.preserveHistory) {
      this.#usageHistory = [];
    }

    this.emit('usageReset', { timestamp: Date.now(), preserveHistory: options.preserveHistory });
  }

  /**
   * Checks if an operation would exceed budget.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {number} estimatedTokens - Estimated tokens needed
   * @returns {Object} Feasibility check result
   */
  checkFeasibility(subscriptionKey, estimatedTokens) {
    this.#requireAuth(subscriptionKey);
    
    const remaining = this.getRemainingBudget(subscriptionKey);
    const wouldExceed = estimatedTokens > remaining;
    
    return {
      feasible: !wouldExceed,
      remaining,
      requested: estimatedTokens,
      deficit: wouldExceed ? estimatedTokens - remaining : 0,
      percentOfBudget: this.#budget > 0 ? (estimatedTokens / this.#budget) : 0
    };
  }

  /**
   * Gets usage history with optional filtering.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {Object} [options] - Filter options
   * @param {number} [options.since] - Timestamp to get history since
   * @param {string} [options.operation] - Filter by operation
   * @param {number} [options.limit] - Limit results
   * @returns {TokenUsage[]} Filtered usage history
   */
  getHistory(subscriptionKey, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    let history = [...this.#usageHistory];

    if (options.since) {
      history = history.filter(u => u.timestamp >= options.since);
    }

    if (options.operation) {
      history = history.filter(u => u.operation === options.operation);
    }

    if (options.limit) {
      history = history.slice(-options.limit);
    }

    return history;
  }

  /**
   * Gets usage projection based on historical patterns.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {number} [timeWindow=3600000] - Time window in ms (default 1 hour)
   * @returns {Object} Usage projection
   */
  getProjection(subscriptionKey, timeWindow = 3600000) {
    this.#requireAuth(subscriptionKey);
    
    const now = Date.now();
    const windowStart = now - timeWindow;
    
    const recentUsage = this.#usageHistory.filter(u => u.timestamp >= windowStart);
    const totalInWindow = recentUsage.reduce((sum, u) => sum + u.total, 0);
    
    // Calculate rate per hour
    const hoursInWindow = timeWindow / 3600000;
    const ratePerHour = totalInWindow / Math.max(0.1, hoursInWindow);
    
    const remaining = this.getRemainingBudget(subscriptionKey);
    const hoursRemaining = ratePerHour > 0 ? remaining / ratePerHour : Infinity;
    
    return {
      ratePerHour,
      remainingTokens: remaining,
      estimatedHoursRemaining: hoursRemaining,
      estimatedDepletion: hoursRemaining === Infinity ? null : now + (hoursRemaining * 3600000),
      confidence: recentUsage.length > 10 ? 'high' : recentUsage.length > 3 ? 'medium' : 'low'
    };
  }

  /**
   * Configures alert thresholds.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {Object} thresholds - Threshold configuration
   * @param {number} [thresholds.low] - Low alert threshold (0-1)
   * @param {number} [thresholds.critical] - Critical alert threshold (0-1)
   */
  setThresholds(subscriptionKey, thresholds) {
    this.#requireAuth(subscriptionKey);
    
    if (thresholds.low !== undefined) {
      this.#lowThreshold = Math.max(0, Math.min(1, thresholds.low));
    }
    if (thresholds.critical !== undefined) {
      this.#criticalThreshold = Math.max(0, Math.min(1, thresholds.critical));
    }

    this.emit('thresholdsChanged', { 
      low: this.#lowThreshold, 
      critical: this.#criticalThreshold 
    });
  }

  /**
   * Checks budget thresholds and emits alerts.
   * @private
   */
  #checkThresholds() {
    const percentUsed = this.#budget > 0 ? this.#usedTokens / this.#budget : 0;
    
    if (percentUsed >= this.#criticalThreshold) {
      this.emit('budgetAlert', this.#createAlert('critical', percentUsed));
    } else if (percentUsed >= this.#lowThreshold) {
      this.emit('budgetAlert', this.#createAlert('low', percentUsed));
    }
  }

  /**
   * Creates a budget alert.
   * @private
   * @param {'low'|'critical'|'exceeded'} level - Alert level
   * @param {number} [percentUsed] - Percentage used
   * @returns {BudgetAlert} Alert object
   */
  #createAlert(level, percentUsed) {
    const remaining = this.#budget - this.#usedTokens;
    const pct = percentUsed ?? (this.#budget > 0 ? this.#usedTokens / this.#budget : 0);
    
    const messages = {
      low: `Token budget at ${Math.round(pct * 100)}%. Consider optimizing usage.`,
      critical: `Token budget critically low at ${Math.round(pct * 100)}%. Immediate action recommended.`,
      exceeded: `Token budget exceeded! Used ${this.#usedTokens} of ${this.#budget} tokens.`
    };

    return {
      level,
      remaining: Math.max(0, remaining),
      percentUsed: pct,
      message: messages[level]
    };
  }

  /**
   * Disposes the manager and clears all resources.
   */
  dispose() {
    this.#usageHistory = [];
    this.#operationUsage.clear();
    this.#subscribers.clear();
    this.removeAllListeners();
    this.#usedTokens = 0;
  }
}

export { TokenOptimizer } from './optimizer.js';
export default TokenManager;
