/**
 * @fileoverview Extended Thinking Mode Control for Claude
 * @module claude/extended-thinking
 *
 * Extended thinking mode allows Claude to perform deeper reasoning before
 * generating responses. This module provides control interfaces for managing
 * thinking mode, budgets, and status monitoring.
 *
 * @example
 * import { ExtendedThinkingController } from '@cognimesh/claude-extended-thinking';
 *
 * const controller = new ExtendedThinkingController();
 * await controller.enableThinking(32000); // Enable with 32K token budget
 *
 * const client = new ClaudeClient();
 * const response = await client.sendMessage(
 *   [{ role: 'user', content: 'Solve this complex problem...' }],
 *   {
 *     enableThinking: true,
 *     thinkingBudget: controller.getCurrentBudget()
 *   }
 * );
 */

import { ThinkingBudget } from './budget.js';
import { EventEmitter } from 'events';

/**
 * Thinking status states
 * @readonly
 * @enum {string}
 */
export const ThinkingStatus = {
  /** Thinking mode is disabled */
  DISABLED: 'disabled',
  /** Thinking mode is enabled and active */
  ENABLED: 'enabled',
  /** Thinking mode is enabled but budget exhausted */
  EXHAUSTED: 'exhausted',
  /** Thinking mode is in an error state */
  ERROR: 'error',
};

/**
 * ExtendedThinkingController - Manages Claude's extended thinking mode
 *
 * Provides a high-level interface for controlling Claude's extended thinking
 * capabilities, including budget management and status tracking.
 *
 * @extends EventEmitter
 * @example
 * const controller = new ExtendedThinkingController({
 *   defaultBudget: 16000,
 *   alertThreshold: 0.8
 * });
 *
 * controller.on('budgetExhausted', () => {
 *   console.log('Thinking budget depleted');
 * });
 */
export class ExtendedThinkingController extends EventEmitter {
  /**
   * Creates a new ExtendedThinkingController
   * @param {Object} options - Controller configuration
   * @param {number} [options.defaultBudget=16000] - Default thinking budget in tokens
   * @param {number} [options.alertThreshold=0.8] - Alert threshold (0-1) for budget warnings
   * @param {boolean} [options.autoDisableOnExhaustion=false] - Auto-disable when budget exhausted
   * @param {boolean} [options.trackUsage=true] - Enable usage tracking
   */
  constructor(options = {}) {
    super();

    this.defaultBudget = options.defaultBudget ?? 16000;
    this.alertThreshold = options.alertThreshold ?? 0.8;
    this.autoDisableOnExhaustion = options.autoDisableOnExhaustion ?? false;
    this.trackUsage = options.trackUsage ?? true;

    // Initialize budget manager
    this.budget = new ThinkingBudget({
      initialBudget: this.defaultBudget,
      alertThreshold: this.alertThreshold,
    });

    // Current state
    this.status = ThinkingStatus.DISABLED;
    this.currentBudgetTokens = 0;
    this.enabledAt = null;
    this.disabledAt = null;

    // Usage history
    this.usageHistory = [];
    this.maxHistorySize = options.maxHistorySize ?? 100;

    // Bind event listeners
    this.setupBudgetListeners();
  }

  /**
   * Sets up budget event listeners
   * @private
   */
  setupBudgetListeners() {
    this.budget.on('thresholdReached', (data) => {
      this.emit('budgetAlert', {
        type: 'threshold',
        remaining: data.remaining,
        percentage: data.percentage,
        threshold: this.alertThreshold,
        timestamp: new Date().toISOString(),
      });
    });

    this.budget.on('budgetExhausted', (data) => {
      this.status = ThinkingStatus.EXHAUSTED;
      this.emit('budgetExhausted', {
        totalAllocated: data.totalBudget,
        totalUsed: data.used,
        timestamp: new Date().toISOString(),
      });

      if (this.autoDisableOnExhaustion) {
        this.disableThinking();
      }
    });

    this.budget.on('budgetAllocated', (data) => {
      this.emit('budgetAllocated', {
        amount: data.amount,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Enables extended thinking mode with a specific budget
   *
   * @param {number} [budgetTokens] - Token budget for thinking (uses default if not specified)
   * @returns {Object} Status after enabling
   * @throws {Error} When budget is invalid
   *
   * @example
   * controller.enableThinking(32000); // Enable with 32K budget
   * console.log(controller.getThinkingStatus());
   * // { enabled: true, budget: 32000, remaining: 32000 }
   */
  enableThinking(budgetTokens) {
    const tokens = budgetTokens ?? this.defaultBudget;

    if (!Number.isInteger(tokens) || tokens < 1024) {
      throw new Error('Thinking budget must be at least 1024 tokens');
    }

    if (tokens > 128000) {
      throw new Error('Thinking budget cannot exceed 128000 tokens');
    }

    // Allocate budget
    this.budget.allocateBudget(tokens);
    this.currentBudgetTokens = tokens;

    // Update status
    this.status = ThinkingStatus.ENABLED;
    this.enabledAt = new Date().toISOString();
    this.disabledAt = null;

    this.emit('enabled', {
      budget: tokens,
      timestamp: this.enabledAt,
    });

    return this.getThinkingStatus();
  }

  /**
   * Disables extended thinking mode
   *
   * @param {Object} options - Disable options
   * @param {boolean} [options.preserveBudget=false] - Keep remaining budget for later
   * @returns {Object} Final status before disabling
   *
   * @example
   * controller.disableThinking();
   * console.log(controller.getThinkingStatus());
   * // { enabled: false, budget: 0, remaining: 0 }
   */
  disableThinking(options = {}) {
    const finalStatus = this.getThinkingStatus();

    if (!options.preserveBudget) {
      this.budget.reset();
      this.currentBudgetTokens = 0;
    }

    this.status = ThinkingStatus.DISABLED;
    this.disabledAt = new Date().toISOString();

    this.emit('disabled', {
      finalUsage: finalStatus.usage,
      timestamp: this.disabledAt,
    });

    return finalStatus;
  }

  /**
   * Gets the current thinking status
   *
   * @returns {Object} Comprehensive status information
   *
   * @example
   * const status = controller.getThinkingStatus();
   * console.log(status.enabled);     // true/false
   * console.log(status.budget);      // Total budget
   * console.log(status.remaining);   // Remaining budget
   * console.log(status.usage);       // Usage statistics
   */
  getThinkingStatus() {
    const budgetStatus = this.budget.getStatus();

    return {
      enabled: this.status === ThinkingStatus.ENABLED,
      status: this.status,
      budget: this.currentBudgetTokens,
      remaining: budgetStatus.remaining,
      used: budgetStatus.used,
      percentage: budgetStatus.percentage,
      usage: {
        totalRequests: this.usageHistory.length,
        averageTokensPerRequest: this.calculateAverageUsage(),
        history: this.getRecentUsage(10),
      },
      timestamps: {
        enabledAt: this.enabledAt,
        disabledAt: this.disabledAt,
      },
      alertThreshold: this.alertThreshold,
    };
  }

  /**
   * Tracks thinking usage from a response
   *
   * @param {number} tokensUsed - Tokens consumed by thinking
   * @param {Object} metadata - Additional metadata about the usage
   * @returns {Object} Updated budget status
   *
   * @example
   * controller.trackUsage(1500, {
   *   requestId: 'req_123',
   *   model: 'claude-3-opus'
   * });
   */
  trackUsage(tokensUsed, metadata = {}) {
    if (!this.trackUsage) {
      return this.budget.getStatus();
    }

    if (tokensUsed < 0) {
      throw new Error('Usage cannot be negative');
    }

    // Track in budget manager
    const status = this.budget.trackUsage(tokensUsed);

    // Record in history
    const record = {
      tokens: tokensUsed,
      timestamp: new Date().toISOString(),
      remaining: status.remaining,
      ...metadata,
    };

    this.usageHistory.push(record);

    // Trim history if too large
    if (this.usageHistory.length > this.maxHistorySize) {
      this.usageHistory = this.usageHistory.slice(-this.maxHistorySize);
    }

    this.emit('usageTracked', record);

    return status;
  }

  /**
   * Adjusts the current thinking budget
   *
   * @param {number} newBudget - New budget amount in tokens
   * @param {Object} options - Adjustment options
   * @param {boolean} [options.preserveUsed=false] - Keep current usage count
   * @returns {Object} Updated status
   *
   * @example
   * // Increase budget mid-session
   * controller.adjustBudget(64000);
   *
   * // Reset with new budget
   * controller.adjustBudget(32000, { preserveUsed: false });
   */
  adjustBudget(newBudget, options = {}) {
    if (!Number.isInteger(newBudget) || newBudget < 1024) {
      throw new Error('Budget must be at least 1024 tokens');
    }

    if (newBudget > 128000) {
      throw new Error('Budget cannot exceed 128000 tokens');
    }

    const currentUsed = this.budget.used;

    this.budget.allocateBudget(newBudget);
    this.currentBudgetTokens = newBudget;

    if (options.preserveUsed && currentUsed > 0) {
      // Restore usage tracking
      this.budget.used = Math.min(currentUsed, newBudget);
      this.budget.remaining = newBudget - this.budget.used;
    }

    // Update status if we were exhausted
    if (this.status === ThinkingStatus.EXHAUSTED && this.budget.remaining > 0) {
      this.status = ThinkingStatus.ENABLED;
    }

    this.emit('budgetAdjusted', {
      newBudget,
      previousBudget: this.currentBudgetTokens,
      preserved: options.preserveUsed,
    });

    return this.getThinkingStatus();
  }

  /**
   * Gets the current budget amount
   * @returns {number} Current budget in tokens
   */
  getCurrentBudget() {
    return this.currentBudgetTokens;
  }

  /**
   * Gets the remaining budget
   * @returns {number} Remaining tokens
   */
  getRemainingBudget() {
    return this.budget.getRemainingBudget();
  }

  /**
   * Checks if thinking is enabled and has budget remaining
   * @returns {boolean} True if thinking can be used
   */
  canUseThinking() {
    return this.status === ThinkingStatus.ENABLED && this.budget.remaining > 0;
  }

  /**
   * Gets usage history
   * @param {number} [limit] - Maximum number of records to return
   * @returns {Array<Object>} Usage history
   */
  getUsageHistory(limit) {
    const history = [...this.usageHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Gets recent usage records
   * @private
   * @param {number} count - Number of records
   * @returns {Array<Object>}
   */
  getRecentUsage(count) {
    return this.usageHistory.slice(-count).map(r => ({
      tokens: r.tokens,
      timestamp: r.timestamp,
    }));
  }

  /**
   * Calculates average token usage per request
   * @private
   * @returns {number}
   */
  calculateAverageUsage() {
    if (this.usageHistory.length === 0) return 0;

    const total = this.usageHistory.reduce((sum, r) => sum + r.tokens, 0);
    return Math.round(total / this.usageHistory.length);
  }

  /**
   * Clears usage history
   * @returns {ExtendedThinkingController} This instance for chaining
   */
  clearHistory() {
    this.usageHistory = [];
    this.emit('historyCleared');
    return this;
  }

  /**
   * Resets the controller to initial state
   * @returns {ExtendedThinkingController} This instance for chaining
   */
  reset() {
    this.disableThinking();
    this.clearHistory();
    this.status = ThinkingStatus.DISABLED;
    this.emit('reset');
    return this;
  }

  /**
   * Creates configuration options for ClaudeClient
   *
   * Generates the appropriate options object to pass to ClaudeClient.sendMessage()
   * when extended thinking should be enabled.
   *
   * @returns {Object|null} Options for ClaudeClient or null if thinking disabled
   *
   * @example
   * const client = new ClaudeClient();
   * const options = controller.getClientOptions();
   *
   * if (options) {
   *   const response = await client.sendMessage(messages, options);
   * }
   */
  getClientOptions() {
    if (!this.canUseThinking()) {
      return null;
    }

    return {
      enableThinking: true,
      thinkingBudget: this.getRemainingBudget(),
    };
  }

  /**
   * Processes a Claude response to extract and track thinking usage
   *
   * @param {Object} response - Response from Claude API
   * @returns {Object} Extracted thinking information
   *
   * @example
   * const response = await client.sendMessage(messages, { enableThinking: true });
   * const thinking = controller.processResponse(response);
   * console.log(thinking.tokensUsed, thinking.content);
   */
  processResponse(response) {
    if (!response) {
      return { tokensUsed: 0, content: null, thinking: null };
    }

    const thinking = response.thinking || null;
    const tokensUsed = response.usage?.thinking_tokens ||
                       thinking?.tokens_used ||
                       0;

    if (tokensUsed > 0) {
      this.trackUsage(tokensUsed, {
        conversationId: response.conversationId,
        model: response.model,
      });
    }

    return {
      tokensUsed,
      content: response.content,
      thinking: thinking?.content || null,
      remainingBudget: this.getRemainingBudget(),
    };
  }

  /**
   * Gets comprehensive statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const budgetStats = this.budget.getStats();
    const history = this.usageHistory;

    return {
      budget: budgetStats,
      usage: {
        totalRequests: history.length,
        totalTokens: history.reduce((sum, r) => sum + r.tokens, 0),
        averageTokens: this.calculateAverageUsage(),
        minTokens: history.length > 0 ? Math.min(...history.map(r => r.tokens)) : 0,
        maxTokens: history.length > 0 ? Math.max(...history.map(r => r.tokens)) : 0,
      },
      sessions: {
        enabledAt: this.enabledAt,
        disabledAt: this.disabledAt,
        status: this.status,
      },
    };
  }
}

/**
 * Quick helper to create thinking-enabled message options
 *
 * @param {number} budgetTokens - Thinking budget
 * @returns {Object} Options for ClaudeClient
 */
export function withThinking(budgetTokens = 16000) {
  return {
    enableThinking: true,
    thinkingBudget: budgetTokens,
  };
}

/**
 * Creates a controller with common presets
 *
 * @param {string} preset - Preset name ('minimal', 'standard', 'deep', 'maximum')
 * @returns {ExtendedThinkingController} Configured controller
 */
export function createPreset(preset = 'standard') {
  const presets = {
    minimal: { defaultBudget: 4096, alertThreshold: 0.9 },
    standard: { defaultBudget: 16000, alertThreshold: 0.8 },
    deep: { defaultBudget: 32000, alertThreshold: 0.75 },
    maximum: { defaultBudget: 64000, alertThreshold: 0.7 },
  };

  const config = presets[preset] || presets.standard;
  return new ExtendedThinkingController(config);
}

// Export thinking status enum
export { ThinkingStatus as Status };

// Re-export budget classes
export { ThinkingBudget } from './budget.js';

// Default export
export default {
  ExtendedThinkingController,
  ThinkingBudget,
  ThinkingStatus,
  withThinking,
  createPreset,
};
