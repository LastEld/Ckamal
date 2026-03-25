/**
 * @fileoverview Claude Opus 4.5 Configuration Module
 * @module models/claude/opus45-config
 *
 * Provides configuration management for Claude Opus 4.5 with:
 * - 200K token context window support
 * - Session management
 * - Native protocol settings
 * - Extended thinking support
 */

import { EventEmitter } from 'events';

/**
 * Default configuration for Claude Opus 4.5
 * @constant {Object}
 */
export const OPUS_45_DEFAULTS = {
  // Model specifications
  MODEL_ID: 'claude-opus-4-5-20251202',
  CONTEXT_WINDOW: 200_000,           // 200K tokens
  MAX_OUTPUT_TOKENS: 32_000,          // 32K output
  OPTIMAL_CONTEXT: 160_000,           // Optimal working context

  // Connection settings
  WEBSOCKET_URL: 'ws://localhost:3456',
  CONNECTION_TIMEOUT: 30000,
  HEARTBEAT_INTERVAL: 30000,
  RECONNECT_MAX_ATTEMPTS: 10,

  // Session settings
  SESSION_TTL: 24 * 60 * 60 * 1000, // 24 hours
  MAX_SESSIONS_PER_USER: 10,

  // Temperature
  TEMPERATURE_DEFAULT: 1,

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
  MAX_CONCURRENT_REQUESTS: 4,
  REQUEST_TIMEOUT: 600000,          // 10 minutes for complex tasks

  // Extended thinking
  EXTENDED_THINKING_DEFAULT: false,
  THINKING_BUDGET_MIN: 1024,
  THINKING_BUDGET_MAX: 32000,
};

/**
 * Error types for Opus 4.5 configuration
 */
export class Opus45ConfigError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'Opus45ConfigError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Configuration manager for Claude Opus 4.5
 * @extends EventEmitter
 */
export class Opus45Config extends EventEmitter {
  #config;
  #sessionStore;

  /**
   * Creates an Opus45Config instance
   * @param {Object} options - Configuration options
   * @param {string} [options.websocketUrl] - WebSocket URL
   * @param {number} [options.maxContextTokens] - Max context tokens
   * @param {number} [options.maxOutputTokens] - Max output tokens
   * @param {Object} [options.sessionOptions] - Session management options
   */
  constructor(options = {}) {
    super();

    this.#config = {
      modelId: options.modelId || OPUS_45_DEFAULTS.MODEL_ID,
      websocketUrl: options.websocketUrl || OPUS_45_DEFAULTS.WEBSOCKET_URL,
      contextWindow: options.maxContextTokens || OPUS_45_DEFAULTS.CONTEXT_WINDOW,
      maxOutputTokens: options.maxOutputTokens || OPUS_45_DEFAULTS.MAX_OUTPUT_TOKENS,
      optimalContext: options.optimalContext || OPUS_45_DEFAULTS.OPTIMAL_CONTEXT,
      temperature: options.temperature ?? OPUS_45_DEFAULTS.TEMPERATURE_DEFAULT,
      connectionTimeout: options.connectionTimeout || OPUS_45_DEFAULTS.CONNECTION_TIMEOUT,
      heartbeatInterval: options.heartbeatInterval || OPUS_45_DEFAULTS.HEARTBEAT_INTERVAL,
      maxReconnectAttempts: options.maxReconnectAttempts || OPUS_45_DEFAULTS.RECONNECT_MAX_ATTEMPTS,
      sessionTtl: options.sessionTtl || OPUS_45_DEFAULTS.SESSION_TTL,
      maxSessionsPerUser: options.maxSessionsPerUser || OPUS_45_DEFAULTS.MAX_SESSIONS_PER_USER,
      streamChunkSize: options.streamChunkSize || OPUS_45_DEFAULTS.STREAM_CHUNK_SIZE,
      streamTimeout: options.streamTimeout || OPUS_45_DEFAULTS.STREAM_TIMEOUT,
      maxFileSize: options.maxFileSize || OPUS_45_DEFAULTS.MAX_FILE_SIZE,
      supportedFormats: options.supportedFormats || OPUS_45_DEFAULTS.SUPPORTED_FORMATS,
      maxConcurrentRequests: options.maxConcurrentRequests || OPUS_45_DEFAULTS.MAX_CONCURRENT_REQUESTS,
      requestTimeout: options.requestTimeout || OPUS_45_DEFAULTS.REQUEST_TIMEOUT,
      extendedThinking: options.extendedThinking ?? OPUS_45_DEFAULTS.EXTENDED_THINKING_DEFAULT,
      thinkingBudget: this.#clampThinkingBudget(options.thinkingBudget),
      compressionThreshold: options.compressionThreshold || OPUS_45_DEFAULTS.COMPRESSION_THRESHOLD,
      prioritizationThreshold: options.prioritizationThreshold || OPUS_45_DEFAULTS.PRIORITIZATION_THRESHOLD,
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
    if (!budget) return OPUS_45_DEFAULTS.THINKING_BUDGET_MIN;
    return Math.max(
      OPUS_45_DEFAULTS.THINKING_BUDGET_MIN,
      Math.min(budget, OPUS_45_DEFAULTS.THINKING_BUDGET_MAX)
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
      temperature: this.#config.temperature,
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
      'compressionThreshold', 'prioritizationThreshold', 'temperature'
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
 * Creates a new Opus45Config instance
 * @param {Object} options - Configuration options
 * @returns {Opus45Config} Config instance
 */
export function createOpus45Config(options = {}) {
  return new Opus45Config(options);
}

export default Opus45Config;
