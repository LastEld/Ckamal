/**
 * @fileoverview GPT 5.4 Codex Configuration Module
 * @module models/codex/gpt54-config
 * 
 * Provides configuration management for GPT 5.4 Codex with:
 * - 256K token context window support
 * - Advanced reasoning mode settings
 * - Cost tracking and budgeting
 * - Performance optimization
 * - Model variant management
 */

import { EventEmitter } from 'events';

/**
 * Default configuration for GPT 5.4 Codex
 * @constant {Object}
 */
export const GPT54_DEFAULTS = {
  // Model specifications
  MODEL_ID: 'gpt-5.4-codex-2026-03-23',
  CONTEXT_WINDOW: 256_000,         // 256K tokens
  MAX_OUTPUT_TOKENS: 32_768,        // 32K output
  OPTIMAL_CONTEXT: 200_000,         // Optimal working context
  
  // API settings
  BASE_URL: 'https://api.openai.com/v1',
  REQUEST_TIMEOUT: 600_000,         // 10 minutes for complex tasks
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  
  // Connection settings
  WEBSOCKET_URL: 'wss://api.openai.com/v1/realtime',
  CONNECTION_TIMEOUT: 30000,
  HEARTBEAT_INTERVAL: 30000,
  RECONNECT_MAX_ATTEMPTS: 5,
  
  // Session settings
  SESSION_TTL: 24 * 60 * 60 * 1000, // 24 hours
  MAX_SESSIONS_PER_USER: 10,
  
  // Reasoning settings
  REASONING_ENABLED: true,
  REASONING_MODE: 'chain_of_thought',
  REASONING_EFFORT: 'high',         // low, medium, high
  MIN_REASONING_TOKENS: 1024,
  MAX_REASONING_TOKENS: 8192,
  
  // Compression thresholds
  COMPRESSION_THRESHOLD: 0.85,      // Compact at 85% of limit
  PRIORITIZATION_THRESHOLD: 0.95,   // Prioritize at 95% of limit
  
  // Streaming settings
  STREAMING_ENABLED: true,
  STREAM_CHUNK_SIZE: 4096,
  STREAM_TIMEOUT: 600000,           // 10 minutes
  
  // File upload
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_FILES_PER_REQUEST: 20,
  SUPPORTED_FORMATS: [
    'txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs',
    'py', 'java', 'cpp', 'c', 'h', 'hpp', 'cs', 'csproj', 'sln',
    'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'r', 'm',
    'html', 'css', 'scss', 'less', 'sass', 'xml', 'yaml', 'yml', 'toml',
    'sql', 'sh', 'bash', 'ps1', 'zsh', 'fish',
    'dockerfile', 'makefile', 'cmake', 'gradle',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'
  ],
  
  // Performance
  MAX_CONCURRENT_REQUESTS: 3,
  TEMPERATURE: 0.3,                 // Lower for coding tasks
  TOP_P: 1.0,
  
  // Multimodal
  MAX_IMAGE_SIZE: 20 * 1024 * 1024, // 20MB per image
  MAX_IMAGES_PER_REQUEST: 10,
  SUPPORTED_IMAGE_FORMATS: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
  
  // Advanced features
  CODE_INTERPRETER_ENABLED: true,
  BROWSING_ENABLED: false,          // Disabled for coding focus
  FUNCTION_CALLING_ENABLED: true,
  JSON_MODE_ENABLED: true,
};

/**
 * Model variants for GPT 5.4 Codex
 * @constant {Object}
 */
export const GPT54_MODELS = {
  'gpt-5.4-codex': {
    id: 'gpt-5.4-codex',
    name: 'GPT 5.4 Codex',
    contextWindow: 256000,
    maxOutputTokens: 32768,
    description: 'Advanced coding model with reasoning',
    bestFor: ['complex_coding', 'architecture', 'refactoring', 'analysis'],
    supportsReasoning: true,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: true,
  },
  
  'gpt-5.4-codex-vision': {
    id: 'gpt-5.4-codex-vision',
    name: 'GPT 5.4 Codex Vision',
    contextWindow: 256000,
    maxOutputTokens: 32768,
    description: 'Coding model with vision capabilities',
    bestFor: ['ui_analysis', 'multimodal_coding', 'image_code_review'],
    supportsReasoning: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsFunctions: true,
  },
  
  'gpt-5.4-codex-mini': {
    id: 'gpt-5.4-codex-mini',
    name: 'GPT 5.4 Codex Mini',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    description: 'Faster, cost-effective coding model',
    bestFor: ['quick_completion', 'simple_refactoring', 'code_review'],
    supportsReasoning: true,
    supportsVision: false,
    supportsStreaming: true,
    supportsFunctions: true,
  },
  
  AUTO: 'auto',
};

/**
 * Model aliases for common use cases
 * @constant {Object}
 */
export const MODEL_ALIASES = {
  DEFAULT: 'gpt-5.4-codex',
  STANDARD: 'gpt-5.4-codex',
  VISION: 'gpt-5.4-codex-vision',
  FAST: 'gpt-5.4-codex-mini',
  REASONING: 'gpt-5.4-codex',
  ANALYSIS: 'gpt-5.4-codex',
};

/**
 * Reasoning modes and their characteristics
 * @constant {Object}
 */
export const REASONING_MODES = {
  standard: {
    name: 'Standard',
    description: 'Standard reasoning with balanced speed/quality',
    minTokens: 0,
    maxTokens: 2048,
    defaultTokens: 1024,
    temperature: 0.3,
  },
  chain_of_thought: {
    name: 'Chain of Thought',
    description: 'Step-by-step reasoning for complex problems',
    minTokens: 1024,
    maxTokens: 8192,
    defaultTokens: 4096,
    temperature: 0.2,
  },
  analysis: {
    name: 'Deep Analysis',
    description: 'Thorough analysis with multiple perspectives',
    minTokens: 2048,
    maxTokens: 8192,
    defaultTokens: 4096,
    temperature: 0.2,
  },
  comparative: {
    name: 'Comparative',
    description: 'Compare multiple approaches and solutions',
    minTokens: 1024,
    maxTokens: 6144,
    defaultTokens: 3072,
    temperature: 0.3,
  },
  synthesis: {
    name: 'Synthesis',
    description: 'Synthesize information from multiple sources',
    minTokens: 2048,
    maxTokens: 8192,
    defaultTokens: 4096,
    temperature: 0.25,
  },
};

/**
 * Context window thresholds
 * @constant {Object}
 */
export const CONTEXT_THRESHOLDS = {
  SMALL: 8192,       // Use mini model
  MEDIUM: 65536,     // Use standard model
  LARGE: 196608,     // Use full context
  XLARGE: 245760,    // Near limit
};

/**
 * Configuration presets for different use cases
 * @constant {Object}
 */
export const PRESETS = {
  // Fast responses
  speed: {
    model: MODEL_ALIASES.FAST,
    temperature: 0.5,
    maxTokens: 4096,
    reasoning: false,
    streaming: true,
    requestTimeout: 60000,
  },
  
  // Cost-efficient
  economical: {
    model: MODEL_ALIASES.FAST,
    temperature: 0.4,
    maxTokens: 2048,
    reasoning: false,
    streaming: false,
  },
  
  // High quality
  quality: {
    model: MODEL_ALIASES.STANDARD,
    temperature: 0.2,
    maxTokens: 16384,
    reasoning: true,
    reasoningMode: 'chain_of_thought',
    streaming: true,
  },
  
  // Maximum capability
  maximum: {
    model: MODEL_ALIASES.STANDARD,
    temperature: 0.1,
    maxTokens: 32768,
    reasoning: true,
    reasoningMode: 'analysis',
    reasoningEffort: 'high',
    streaming: true,
    requestTimeout: 600000,
  },
  
  // Architecture design
  architecture: {
    model: MODEL_ALIASES.STANDARD,
    temperature: 0.2,
    maxTokens: 24000,
    reasoning: true,
    reasoningMode: 'analysis',
    reasoningEffort: 'high',
  },
  
  // Refactoring
  refactoring: {
    model: MODEL_ALIASES.STANDARD,
    temperature: 0.1,
    maxTokens: 24000,
    reasoning: true,
    reasoningMode: 'chain_of_thought',
    reasoningEffort: 'high',
  },
  
  // Code review
  code_review: {
    model: MODEL_ALIASES.STANDARD,
    temperature: 0.2,
    maxTokens: 8192,
    reasoning: true,
    reasoningMode: 'analysis',
  },
  
  // Security analysis
  security: {
    model: MODEL_ALIASES.STANDARD,
    temperature: 0.1,
    maxTokens: 14000,
    reasoning: true,
    reasoningMode: 'analysis',
    reasoningEffort: 'high',
  },
  
  // Performance analysis
  performance: {
    model: MODEL_ALIASES.STANDARD,
    temperature: 0.2,
    maxTokens: 12000,
    reasoning: true,
    reasoningMode: 'analysis',
  },
  
  // Multimodal
  multimodal: {
    model: MODEL_ALIASES.VISION,
    temperature: 0.3,
    maxTokens: 4096,
    reasoning: true,
    maxImages: 10,
  },
};

/**
 * Error types for GPT 5.4 configuration
 */
export class GPT54ConfigError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'GPT54ConfigError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Configuration manager for GPT 5.4 Codex
 * @extends EventEmitter
 */
export class GPT54Config extends EventEmitter {
  #config;
  #costTracker;
  #sessionStore;
  
  /**
   * Creates a GPT54Config instance
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    super();
    
    this.#config = {
      // Model settings
      modelId: options.model || GPT54_DEFAULTS.MODEL_ID,
      contextWindow: options.maxContextTokens || GPT54_DEFAULTS.CONTEXT_WINDOW,
      maxOutputTokens: options.maxOutputTokens || GPT54_DEFAULTS.MAX_OUTPUT_TOKENS,
      optimalContext: options.optimalContext || GPT54_DEFAULTS.OPTIMAL_CONTEXT,
      temperature: options.temperature ?? GPT54_DEFAULTS.TEMPERATURE,
      topP: options.topP ?? GPT54_DEFAULTS.TOP_P,
      
      // API settings
      baseURL: options.baseURL || GPT54_DEFAULTS.BASE_URL,
      requestTimeout: options.requestTimeout || GPT54_DEFAULTS.REQUEST_TIMEOUT,
      maxRetries: options.maxRetries ?? GPT54_DEFAULTS.MAX_RETRIES,
      retryDelay: options.retryDelay || GPT54_DEFAULTS.RETRY_DELAY,
      
      // Connection settings
      websocketUrl: options.websocketUrl || GPT54_DEFAULTS.WEBSOCKET_URL,
      connectionTimeout: options.connectionTimeout || GPT54_DEFAULTS.CONNECTION_TIMEOUT,
      heartbeatInterval: options.heartbeatInterval || GPT54_DEFAULTS.HEARTBEAT_INTERVAL,
      maxReconnectAttempts: options.maxReconnectAttempts ?? GPT54_DEFAULTS.RECONNECT_MAX_ATTEMPTS,
      
      // Session settings
      sessionTtl: options.sessionTtl || GPT54_DEFAULTS.SESSION_TTL,
      maxSessionsPerUser: options.maxSessionsPerUser || GPT54_DEFAULTS.MAX_SESSIONS_PER_USER,
      
      // Streaming settings
      streaming: options.streaming ?? GPT54_DEFAULTS.STREAMING_ENABLED,
      streamChunkSize: options.streamChunkSize || GPT54_DEFAULTS.STREAM_CHUNK_SIZE,
      streamTimeout: options.streamTimeout || GPT54_DEFAULTS.STREAM_TIMEOUT,
      
      // File settings
      maxFileSize: options.maxFileSize || GPT54_DEFAULTS.MAX_FILE_SIZE,
      maxFilesPerRequest: options.maxFilesPerRequest || GPT54_DEFAULTS.MAX_FILES_PER_REQUEST,
      supportedFormats: options.supportedFormats || GPT54_DEFAULTS.SUPPORTED_FORMATS,
      maxImageSize: options.maxImageSize || GPT54_DEFAULTS.MAX_IMAGE_SIZE,
      maxImagesPerRequest: options.maxImagesPerRequest || GPT54_DEFAULTS.MAX_IMAGES_PER_REQUEST,
      supportedImageFormats: options.supportedImageFormats || GPT54_DEFAULTS.SUPPORTED_IMAGE_FORMATS,
      
      // Performance
      maxConcurrentRequests: options.maxConcurrentRequests || GPT54_DEFAULTS.MAX_CONCURRENT_REQUESTS,
      
      // Reasoning settings
      reasoningEnabled: options.reasoning ?? GPT54_DEFAULTS.REASONING_ENABLED,
      reasoningMode: options.reasoningMode || GPT54_DEFAULTS.REASONING_MODE,
      reasoningEffort: options.reasoningEffort || GPT54_DEFAULTS.REASONING_EFFORT,
      minReasoningTokens: options.minReasoningTokens || GPT54_DEFAULTS.MIN_REASONING_TOKENS,
      maxReasoningTokens: options.maxReasoningTokens || GPT54_DEFAULTS.MAX_REASONING_TOKENS,
      
      // Compression thresholds
      compressionThreshold: options.compressionThreshold || GPT54_DEFAULTS.COMPRESSION_THRESHOLD,
      prioritizationThreshold: options.prioritizationThreshold || GPT54_DEFAULTS.PRIORITIZATION_THRESHOLD,
      
      // Features
      codeInterpreter: options.codeInterpreter ?? GPT54_DEFAULTS.CODE_INTERPRETER_ENABLED,
      browsing: options.browsing ?? GPT54_DEFAULTS.BROWSING_ENABLED,
      functionCalling: options.functionCalling ?? GPT54_DEFAULTS.FUNCTION_CALLING_ENABLED,
      jsonMode: options.jsonMode ?? GPT54_DEFAULTS.JSON_MODE_ENABLED,
    };
    
    // Initialize usage tracker (token counting only - billing handled by subscription)
    this.#costTracker = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalReasoningTokens: 0,
      sessionCosts: new Map(),
    };
    
    // Initialize session store
    this.#sessionStore = new Map();
    
    this.emit('config:initialized', { config: this.getPublicConfig() });
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
      reasoningEnabled: this.#config.reasoningEnabled,
      reasoningMode: this.#config.reasoningMode,
      reasoningEffort: this.#config.reasoningEffort,
      streaming: this.#config.streaming,
      supportedFormats: this.#config.supportedFormats,
      maxFilesPerRequest: this.#config.maxFilesPerRequest,
      maxImagesPerRequest: this.#config.maxImagesPerRequest,
    };
  }
  
  /**
   * Updates configuration
   * @param {Object} updates - Configuration updates
   * @returns {Object} Updated configuration
   */
  updateConfig(updates) {
    const allowedKeys = [
      'temperature', 'topP', 'requestTimeout', 'maxRetries', 'retryDelay',
      'connectionTimeout', 'heartbeatInterval', 'maxReconnectAttempts',
      'sessionTtl', 'streamChunkSize', 'streamTimeout', 'maxFileSize',
      'maxFilesPerRequest', 'maxConcurrentRequests', 'reasoningEnabled',
      'reasoningMode', 'reasoningEffort', 'compressionThreshold',
      'prioritizationThreshold', 'streaming', 'codeInterpreter',
      'browsing', 'functionCalling', 'jsonMode'
    ];
    
    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        this.#config[key] = updates[key];
      }
    }
    
    // Handle reasoning tokens clamping
    if (updates.minReasoningTokens || updates.maxReasoningTokens) {
      this.#config.minReasoningTokens = Math.max(
        0,
        updates.minReasoningTokens ?? this.#config.minReasoningTokens
      );
      this.#config.maxReasoningTokens = Math.min(
        8192,
        updates.maxReasoningTokens ?? this.#config.maxReasoningTokens
      );
    }
    
    this.emit('config:updated', { config: this.getPublicConfig() });
    return this.getConfig();
  }
  
  /**
   * Gets reasoning configuration
   * @returns {Object} Reasoning config
   */
  getReasoningConfig() {
    const mode = REASONING_MODES[this.#config.reasoningMode];
    return {
      enabled: this.#config.reasoningEnabled,
      mode: this.#config.reasoningMode,
      effort: this.#config.reasoningEffort,
      minTokens: this.#config.minReasoningTokens,
      maxTokens: this.#config.maxReasoningTokens,
      defaultTokens: mode?.defaultTokens || 4096,
      temperature: mode?.temperature || 0.3,
    };
  }
  
  // ==================== Cost Tracking ====================
  
  /**
   * Records token usage for a session
   * @param {number} inputTokens - Input tokens used
   * @param {number} outputTokens - Output tokens used
   * @param {string} sessionId - Associated session ID
   * @param {number} [reasoningTokens] - Reasoning tokens used
   * @returns {Object} Usage information
   */
  recordUsage(inputTokens, outputTokens, sessionId = 'default', reasoningTokens = 0) {
    // Update global counters
    this.#costTracker.totalInputTokens += inputTokens;
    this.#costTracker.totalOutputTokens += outputTokens;
    this.#costTracker.totalReasoningTokens += reasoningTokens;

    // Update session usage
    if (!this.#costTracker.sessionCosts.has(sessionId)) {
      this.#costTracker.sessionCosts.set(sessionId, {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        requests: 0,
      });
    }

    const sessionUsage = this.#costTracker.sessionCosts.get(sessionId);
    sessionUsage.inputTokens += inputTokens;
    sessionUsage.outputTokens += outputTokens;
    sessionUsage.reasoningTokens += reasoningTokens;
    sessionUsage.requests += 1;

    const usageInfo = {
      inputTokens,
      outputTokens,
      reasoningTokens,
      sessionId,
    };

    this.emit('usage:recorded', usageInfo);
    return usageInfo;
  }
  
  /**
   * Gets current usage statistics (token counts only - billing handled by subscription)
   * @returns {Object} Usage statistics
   */
  getUsageStats() {
    return {
      totalInputTokens: this.#costTracker.totalInputTokens,
      totalOutputTokens: this.#costTracker.totalOutputTokens,
      totalReasoningTokens: this.#costTracker.totalReasoningTokens,
      sessionCount: this.#costTracker.sessionCosts.size,
    };
  }

  /**
   * Gets usage breakdown by session
   * @returns {Object} Session usage
   */
  getSessionUsage() {
    const usage = {};
    for (const [sessionId, stats] of this.#costTracker.sessionCosts) {
      usage[sessionId] = { ...stats };
    }
    return usage;
  }

  /**
   * Resets usage tracking
   * @param {boolean} [resetSessions=false] - Also reset session usage
   */
  resetUsageTracking(resetSessions = false) {
    this.#costTracker.totalInputTokens = 0;
    this.#costTracker.totalOutputTokens = 0;
    this.#costTracker.totalReasoningTokens = 0;

    if (resetSessions) {
      this.#costTracker.sessionCosts.clear();
    }

    this.emit('usage:reset');
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
    const warnings = [];
    
    if (file.size > this.#config.maxFileSize) {
      errors.push(`File size exceeds maximum of ${this.#config.maxFileSize} bytes`);
    }
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!this.#config.supportedFormats.includes(ext)) {
      errors.push(`Unsupported file format: ${ext}`);
    }
    
    if (file.size > this.#config.maxFileSize * 0.8) {
      warnings.push('File is approaching size limit');
    }
    
    // Check if image
    if (this.#config.supportedImageFormats.includes(ext)) {
      if (file.size > this.#config.maxImageSize) {
        errors.push(`Image size exceeds maximum of ${this.#config.maxImageSize} bytes`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      isImage: this.#config.supportedImageFormats.includes(ext),
    };
  }
  
  /**
   * Estimates tokens from text
   * @param {string|Array} content - Text or messages to estimate
   * @returns {number} Estimated tokens
   */
  estimateTokens(content) {
    if (!Array.isArray(content)) {
      // GPT models use ~4 characters per token on average
      return Math.ceil(content.length / 4);
    }
    
    let total = 0;
    for (const msg of content) {
      if (typeof msg.content === 'string') {
        total += Math.ceil(msg.content.length / 4);
      } else if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === 'text') {
            total += Math.ceil(item.text.length / 4);
          } else if (item.type === 'image_url') {
            total += 1000; // Approximate for images
          }
        }
      }
    }
    return total;
  }
  
  /**
   * Gets model capabilities
   * @returns {Object} Model capabilities
   */
  getCapabilities() {
    const model = GPT54_MODELS[this.#config.modelId] || GPT54_MODELS['gpt-5.4-codex'];
    
    return {
      contextWindow: this.#config.contextWindow,
      maxOutputTokens: this.#config.maxOutputTokens,
      supportsStreaming: this.#config.streaming,
      supportsReasoning: this.#config.reasoningEnabled,
      supportsVision: model?.supportsVision || false,
      supportsFunctionCalling: this.#config.functionCalling,
      supportsCodeInterpreter: this.#config.codeInterpreter,
      supportsJsonMode: this.#config.jsonMode,
      supportedFormats: this.#config.supportedFormats,
      reasoningModes: Object.keys(REASONING_MODES),
    };
  }
  
  /**
   * Selects optimal model based on requirements
   * @param {Object} requirements - Selection requirements
   * @returns {string} Selected model ID
   */
  selectModel(requirements = {}) {
    if (requirements.vision || requirements.images) {
      return GPT54_MODELS['gpt-5.4-codex-vision'].id;
    }
    
    if (requirements.speed && !requirements.quality) {
      return GPT54_MODELS['gpt-5.4-codex-mini'].id;
    }
    
    return GPT54_MODELS['gpt-5.4-codex'].id;
  }
  
  /**
   * Gets preset configuration
   * @param {string} presetName - Preset name
   * @returns {Object} Preset configuration
   */
  getPreset(presetName) {
    return PRESETS[presetName] || PRESETS.quality;
  }
}

/**
 * Creates a new GPT54Config instance
 * @param {Object} options - Configuration options
 * @returns {GPT54Config} Config instance
 */
export function createGPT54Config(options = {}) {
  return new GPT54Config(options);
}

/**
 * Gets default configuration
 * @returns {Object} Default config
 */
export function getDefaults() {
  return { ...GPT54_DEFAULTS };
}

/**
 * Gets model information
 * @param {string} modelId - Model ID
 * @returns {Object} Model info
 */
export function getModelInfo(modelId) {
  return GPT54_MODELS[modelId] || null;
}

/**
 * Estimates token usage for a request (billing handled by subscription)
 * @param {number} inputTokens - Input tokens
 * @param {number} outputTokens - Output tokens
 * @param {number} [reasoningTokens] - Reasoning tokens
 * @returns {Object} Token usage estimate
 */
export function estimateUsage(inputTokens, outputTokens, reasoningTokens = 0) {
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: inputTokens + outputTokens + reasoningTokens,
  };
}

export default GPT54Config;
