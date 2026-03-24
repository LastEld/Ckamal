/**
 * @fileoverview Claude Opus 4.6 Configuration Module
 * @module models/claude/opus-config
 * 
 * Provides configuration management for Claude Opus 4.6 with:
 * - 1M token context window support
 * - Cost tracking and budgeting
 * - Session management
 * - Native protocol settings
 */

import { EventEmitter } from 'events';

/**
 * Default configuration for Claude Opus 4.6
 * @constant {Object}
 */
export const OPUS_DEFAULTS = {
  // Model specifications per research spec
  MODEL_ID: 'claude-opus-4-6-20260320',
  CONTEXT_WINDOW: 1_000_000,      // 1M tokens
  MAX_OUTPUT_TOKENS: 128_000,      // 128K output
  OPTIMAL_CONTEXT: 800_000,        // Optimal working context
  
  // Connection settings
  WEBSOCKET_URL: 'ws://localhost:3456',
  CONNECTION_TIMEOUT: 30000,
  HEARTBEAT_INTERVAL: 30000,
  RECONNECT_MAX_ATTEMPTS: 10,
  
  // Session settings
  SESSION_TTL: 24 * 60 * 60 * 1000, // 24 hours
  MAX_SESSIONS_PER_USER: 10,
  
  // Cost tracking (approximate rates per 1M tokens)
  COST_PER_INPUT_TOKEN: 0.000015,   // $15/MTok input
  COST_PER_OUTPUT_TOKEN: 0.000075,  // $75/MTok output
  
  // Compression thresholds
  COMPRESSION_THRESHOLD: 0.8,       // Compact at 80% of limit
  PRIORITIZATION_THRESHOLD: 0.9,    // Prioritize at 90% of limit
  
  // Streaming settings
  STREAM_CHUNK_SIZE: 4096,
  STREAM_TIMEOUT: 300000,           // 5 minutes
  
  // File upload
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  SUPPORTED_FORMATS: [
    'txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 
    'py', 'java', 'cpp', 'c', 'h', 'hpp', 'cs',
    'go', 'rs', 'rb', 'php', 'swift', 'kt',
    'html', 'css', 'scss', 'less', 'xml', 'yaml', 'yml',
    'sql', 'sh', 'bash', 'ps1', 'dockerfile', 'makefile'
  ],
  
  // Performance
  MAX_CONCURRENT_REQUESTS: 5,
  REQUEST_TIMEOUT: 600000,          // 10 minutes for complex tasks
  
  // Extended thinking
  EXTENDED_THINKING_DEFAULT: false,
  THINKING_BUDGET_MIN: 1024,
  THINKING_BUDGET_MAX: 32000,
};

/**
 * Error types for Opus configuration
 */
export class OpusConfigError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'OpusConfigError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Configuration manager for Claude Opus 4.6
 * @extends EventEmitter
 */
export class OpusConfig extends EventEmitter {
  #config;
  #costTracker;
  #sessionStore;
  
  /**
   * Creates an OpusConfig instance
   * @param {Object} options - Configuration options
   * @param {string} [options.websocketUrl] - WebSocket URL
   * @param {number} [options.maxContextTokens] - Max context tokens
   * @param {number} [options.maxOutputTokens] - Max output tokens
   * @param {Object} [options.costLimits] - Cost limiting options
   * @param {Object} [options.sessionOptions] - Session management options
   */
  constructor(options = {}) {
    super();
    
    this.#config = {
      modelId: options.modelId || OPUS_DEFAULTS.MODEL_ID,
      websocketUrl: options.websocketUrl || OPUS_DEFAULTS.WEBSOCKET_URL,
      contextWindow: options.maxContextTokens || OPUS_DEFAULTS.CONTEXT_WINDOW,
      maxOutputTokens: options.maxOutputTokens || OPUS_DEFAULTS.MAX_OUTPUT_TOKENS,
      optimalContext: options.optimalContext || OPUS_DEFAULTS.OPTIMAL_CONTEXT,
      connectionTimeout: options.connectionTimeout || OPUS_DEFAULTS.CONNECTION_TIMEOUT,
      heartbeatInterval: options.heartbeatInterval || OPUS_DEFAULTS.HEARTBEAT_INTERVAL,
      maxReconnectAttempts: options.maxReconnectAttempts || OPUS_DEFAULTS.RECONNECT_MAX_ATTEMPTS,
      sessionTtl: options.sessionTtl || OPUS_DEFAULTS.SESSION_TTL,
      maxSessionsPerUser: options.maxSessionsPerUser || OPUS_DEFAULTS.MAX_SESSIONS_PER_USER,
      streamChunkSize: options.streamChunkSize || OPUS_DEFAULTS.STREAM_CHUNK_SIZE,
      streamTimeout: options.streamTimeout || OPUS_DEFAULTS.STREAM_TIMEOUT,
      maxFileSize: options.maxFileSize || OPUS_DEFAULTS.MAX_FILE_SIZE,
      supportedFormats: options.supportedFormats || OPUS_DEFAULTS.SUPPORTED_FORMATS,
      maxConcurrentRequests: options.maxConcurrentRequests || OPUS_DEFAULTS.MAX_CONCURRENT_REQUESTS,
      requestTimeout: options.requestTimeout || OPUS_DEFAULTS.REQUEST_TIMEOUT,
      extendedThinking: options.extendedThinking ?? OPUS_DEFAULTS.EXTENDED_THINKING_DEFAULT,
      thinkingBudget: this.#clampThinkingBudget(options.thinkingBudget),
      compressionThreshold: options.compressionThreshold || OPUS_DEFAULTS.COMPRESSION_THRESHOLD,
      prioritizationThreshold: options.prioritizationThreshold || OPUS_DEFAULTS.PRIORITIZATION_THRESHOLD,
    };
    
    // Initialize cost tracker
    this.#costTracker = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      sessionCosts: new Map(),
      dailyBudget: options.costLimits?.dailyBudget || Infinity,
      monthlyBudget: options.costLimits?.monthlyBudget || Infinity,
      alertsEnabled: options.costLimits?.alertsEnabled ?? true,
      alertThreshold: options.costLimits?.alertThreshold || 0.8,
    };
    
    // Initialize session store
    this.#sessionStore = new Map();
    
    this.emit('config:initialized', { config: this.getPublicConfig() });
  }
  
  /**
   * Clamps thinking budget to valid range
   * @private
   * @param {number} budget - Requested budget
   * @returns {number} Clamped budget
   */
  #clampThinkingBudget(budget) {
    if (!budget) return OPUS_DEFAULTS.THINKING_BUDGET_MIN;
    return Math.max(
      OPUS_DEFAULTS.THINKING_BUDGET_MIN,
      Math.min(budget, OPUS_DEFAULTS.THINKING_BUDGET_MAX)
    );
  }
  
  /**
   * Gets the full configuration
   * @returns {Object} Configuration object
   */
  getConfig() {
    return { ...this.#config };
  }
  
  /**
   * Gets public configuration (excludes sensitive data)
   * @returns {Object} Public configuration
   */
  getPublicConfig() {
    return {
      modelId: this.#config.modelId,
      contextWindow: this.#config.contextWindow,
      maxOutputTokens: this.#config.maxOutputTokens,
      optimalContext: this.#config.optimalContext,
      websocketUrl: this.#config.websocketUrl,
      extendedThinking: this.#config.extendedThinking,
      thinkingBudget: this.#config.thinkingBudget,
      supportedFormats: this.#config.supportedFormats,
    };
  }
  
  /**
   * Updates configuration
   * @param {Object} updates - Configuration updates
   * @returns {Object} Updated configuration
   */
  updateConfig(updates) {
    const allowedKeys = [
      'websocketUrl', 'connectionTimeout', 'heartbeatInterval',
      'maxReconnectAttempts', 'sessionTtl', 'streamChunkSize',
      'streamTimeout', 'maxFileSize', 'maxConcurrentRequests',
      'requestTimeout', 'extendedThinking', 'thinkingBudget',
      'compressionThreshold', 'prioritizationThreshold'
    ];
    
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        if (key === 'thinkingBudget') {
          this.#config[key] = this.#clampThinkingBudget(updates[key]);
        } else {
          this.#config[key] = updates[key];
        }
      }
    }
    
    this.emit('config:updated', { config: this.getPublicConfig() });
    return this.getConfig();
  }
  
  // ==================== Cost Tracking ====================
  
  /**
   * Records token usage and calculates cost
   * @param {number} inputTokens - Input tokens used
   * @param {number} outputTokens - Output tokens used
   * @param {string} sessionId - Associated session ID
   * @returns {Object} Cost information
   */
  recordUsage(inputTokens, outputTokens, sessionId = 'default') {
    const inputCost = inputTokens * OPUS_DEFAULTS.COST_PER_INPUT_TOKEN;
    const outputCost = outputTokens * OPUS_DEFAULTS.COST_PER_OUTPUT_TOKEN;
    const totalCost = inputCost + outputCost;
    
    // Update global counters
    this.#costTracker.totalInputTokens += inputTokens;
    this.#costTracker.totalOutputTokens += outputTokens;
    this.#costTracker.totalCost += totalCost;
    
    // Update session costs
    if (!this.#costTracker.sessionCosts.has(sessionId)) {
      this.#costTracker.sessionCosts.set(sessionId, {
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        requests: 0,
      });
    }
    
    const sessionCost = this.#costTracker.sessionCosts.get(sessionId);
    sessionCost.inputTokens += inputTokens;
    sessionCost.outputTokens += outputTokens;
    sessionCost.totalCost += totalCost;
    sessionCost.requests += 1;
    
    // Check budget thresholds
    this.#checkBudgetAlerts();
    
    const costInfo = {
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      totalCost,
      cumulativeCost: this.#costTracker.totalCost,
      sessionId,
    };
    
    this.emit('cost:recorded', costInfo);
    return costInfo;
  }
  
  /**
   * Checks budget thresholds and emits alerts
   * @private
   */
  #checkBudgetAlerts() {
    if (!this.#costTracker.alertsEnabled) return;
    
    const { totalCost, dailyBudget, monthlyBudget, alertThreshold } = this.#costTracker;
    
    // Check daily budget
    if (dailyBudget !== Infinity && totalCost >= dailyBudget * alertThreshold) {
      if (totalCost >= dailyBudget) {
        this.emit('budget:exceeded', { type: 'daily', limit: dailyBudget, current: totalCost });
      } else {
        this.emit('budget:warning', { type: 'daily', limit: dailyBudget, current: totalCost, threshold: alertThreshold });
      }
    }
    
    // Check monthly budget
    if (monthlyBudget !== Infinity && totalCost >= monthlyBudget * alertThreshold) {
      if (totalCost >= monthlyBudget) {
        this.emit('budget:exceeded', { type: 'monthly', limit: monthlyBudget, current: totalCost });
      } else {
        this.emit('budget:warning', { type: 'monthly', limit: monthlyBudget, current: totalCost, threshold: alertThreshold });
      }
    }
  }
  
  /**
   * Gets current cost statistics
   * @returns {Object} Cost statistics
   */
  getCostStats() {
    return {
      totalInputTokens: this.#costTracker.totalInputTokens,
      totalOutputTokens: this.#costTracker.totalOutputTokens,
      totalCost: this.#costTracker.totalCost,
      sessionCount: this.#costTracker.sessionCosts.size,
      dailyBudget: this.#costTracker.dailyBudget,
      monthlyBudget: this.#costTracker.monthlyBudget,
      budgetUtilization: {
        daily: this.#costTracker.dailyBudget !== Infinity 
          ? this.#costTracker.totalCost / this.#costTracker.dailyBudget 
          : 0,
        monthly: this.#costTracker.monthlyBudget !== Infinity 
          ? this.#costTracker.totalCost / this.#costTracker.monthlyBudget 
          : 0,
      },
    };
  }
  
  /**
   * Gets cost breakdown by session
   * @returns {Object} Session costs
   */
  getSessionCosts() {
    const costs = {};
    for (const [sessionId, stats] of this.#costTracker.sessionCosts) {
      costs[sessionId] = { ...stats };
    }
    return costs;
  }
  
  /**
   * Sets budget limits
   * @param {Object} limits - Budget limits
   * @param {number} [limits.daily] - Daily budget limit
   * @param {number} [limits.monthly] - Monthly budget limit
   * @param {number} [limits.alertThreshold] - Alert threshold (0-1)
   */
  setBudgetLimits(limits) {
    if (limits.daily !== undefined) {
      this.#costTracker.dailyBudget = limits.daily;
    }
    if (limits.monthly !== undefined) {
      this.#costTracker.monthlyBudget = limits.monthly;
    }
    if (limits.alertThreshold !== undefined) {
      this.#costTracker.alertThreshold = Math.max(0, Math.min(1, limits.alertThreshold));
    }
    
    this.emit('budget:updated', this.getCostStats());
  }
  
  /**
   * Resets cost tracking
   * @param {boolean} [resetSessions=false] - Also reset session costs
   */
  resetCostTracking(resetSessions = false) {
    this.#costTracker.totalInputTokens = 0;
    this.#costTracker.totalOutputTokens = 0;
    this.#costTracker.totalCost = 0;
    
    if (resetSessions) {
      this.#costTracker.sessionCosts.clear();
    }
    
    this.emit('cost:reset');
  }
  
  // ==================== Context Management ====================
  
  /**
   * Checks if context needs compression
   * @param {number} currentTokens - Current token count
   * @returns {boolean} Whether compression is needed
   */
  needsCompression(currentTokens) {
    return currentTokens > this.#config.contextWindow * this.#config.compressionThreshold;
  }
  
  /**
   * Checks if context needs prioritization
   * @param {number} currentTokens - Current token count
   * @returns {boolean} Whether prioritization is needed
   */
  needsPrioritization(currentTokens) {
    return currentTokens > this.#config.contextWindow * this.#config.prioritizationThreshold;
  }
  
  /**
   * Calculates available context space
   * @param {number} usedTokens - Used tokens
   * @returns {number} Available tokens
   */
  getAvailableContext(usedTokens) {
    return Math.max(0, this.#config.contextWindow - usedTokens);
  }
  
  /**
   * Validates file for upload
   * @param {Object} file - File object
   * @param {string} file.name - File name
   * @param {number} file.size - File size in bytes
   * @returns {Object} Validation result
   */
  validateFile(file) {
    const errors = [];
    
    if (file.size > this.#config.maxFileSize) {
      errors.push(`File size exceeds maximum of ${this.#config.maxFileSize} bytes`);
    }
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!this.#config.supportedFormats.includes(ext)) {
      errors.push(`Unsupported file format: ${ext}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings: file.size > this.#config.maxFileSize * 0.8 
        ? ['File is approaching size limit'] 
        : [],
    };
  }
  
  /**
   * Estimates tokens from text
   * @param {string} text - Text to estimate
   * @returns {number} Estimated tokens
   */
  estimateTokens(text) {
    // Claude uses ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Gets model capabilities
   * @returns {Object} Model capabilities
   */
  getCapabilities() {
    return {
      contextWindow: this.#config.contextWindow,
      maxOutputTokens: this.#config.maxOutputTokens,
      supportsStreaming: true,
      supportsVision: true,
      supportsExtendedThinking: true,
      supportsToolUse: true,
      supportsSessionPersistence: true,
      supportedFormats: this.#config.supportedFormats,
    };
  }
}

/**
 * Creates a new OpusConfig instance
 * @param {Object} options - Configuration options
 * @returns {OpusConfig} Config instance
 */
export function createOpusConfig(options = {}) {
  return new OpusConfig(options);
}

export default OpusConfig;
