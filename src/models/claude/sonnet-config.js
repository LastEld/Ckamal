/**
 * Claude Sonnet Configuration Module
 * Configuration for Claude 4.6/4.5 Sonnet with 200K context, model selection, cost tracking, and performance optimization
 */

import { EventEmitter } from 'events';

/**
 * Claude Sonnet Model Versions
 */
export const SONNET_MODELS = {
  SONNET_4_6: {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    version: '4.6.0',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    knowledgeCutoff: '2025-01',
    features: ['extended_thinking', 'computer_use', 'vision', 'function_calling', 'streaming'],
    strengths: ['coding', 'reasoning', 'vision', 'multilingual', 'analysis']
  },
  SONNET_4_5: {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    version: '4.5.0',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    knowledgeCutoff: '2024-10',
    features: ['extended_thinking', 'computer_use', 'vision', 'function_calling', 'streaming'],
    strengths: ['coding', 'reasoning', 'vision', 'multilingual']
  }
};

/**
 * Default Configuration for Sonnet
 */
export const DEFAULT_SONNET_CONFIG = {
  model: SONNET_MODELS.SONNET_4_6,
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1.0,
  
  // Extended Thinking
  extendedThinking: {
    enabled: false,
    budgetTokens: 4000,  // Budget for thinking process
    enabledByDefault: false
  },
  
  // Performance Optimization
  performance: {
    // Context compression for long conversations
    contextCompression: {
      enabled: true,
      threshold: 150000,  // Compress when context exceeds this
      strategy: 'summary' // 'summary', 'semantic', 'truncation'
    },
    
    // Caching strategy
    caching: {
      enabled: true,
      ttl: 300000,        // 5 minutes default cache
      maxSize: 100,       // Maximum cached responses
      keyStrategy: 'content-hash'
    },
    
    // Request batching
    batching: {
      enabled: false,
      maxBatchSize: 5,
      maxWaitMs: 100
    },
    
    // Retry configuration
    retry: {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      retryableErrors: ['rate_limit', 'timeout', 'server_error']
    },
    
    // Streaming configuration
    streaming: {
      enabled: true,
      chunkSize: 1024,
      timeoutMs: 30000
    }
  },
  
  // Usage Tracking (billing handled by subscription)
  costTracking: {
    enabled: true,
    logDetails: true
  },
  
  // Safety Settings
  safety: {
    maxRequestsPerMinute: 60,
    maxTokensPerMinute: 100000,
    maxConcurrentRequests: 5,
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeoutMs: 30000
    }
  }
};

/**
 * Cost Tracker for Claude Sonnet
 */
export class SonnetCostTracker extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_SONNET_CONFIG.costTracking, ...config };
    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
      sessions: []
    };
    this.currentSession = null;
  }

  /**
   * Start a new tracking session
   */
  startSession(sessionId = null) {
    this.currentSession = {
      id: sessionId || `session-${Date.now()}`,
      startTime: Date.now(),
      inputTokens: 0,
      outputTokens: 0,
      requests: 0
    };
    return this.currentSession;
  }

  /**
   * End current session
   */
  endSession() {
    if (this.currentSession) {
      this.currentSession.endTime = Date.now();
      this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;
      this.usage.sessions.push(this.currentSession);
      this.emit('sessionEnd', this.currentSession);
      this.currentSession = null;
    }
  }

  /**
   * Record token usage
   */
  recordUsage(inputTokens, outputTokens, model = SONNET_MODELS.SONNET_4_6) {
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    this.usage.requests++;

    if (this.currentSession) {
      this.currentSession.inputTokens += inputTokens;
      this.currentSession.outputTokens += outputTokens;
      this.currentSession.requests++;
    }

    const usageRecord = {
      timestamp: Date.now(),
      inputTokens,
      outputTokens,
      model: model.id
    };

    this.emit('usage', usageRecord);

    if (this.config.logDetails) {
      console.log(`[Sonnet Usage] Input: ${inputTokens} tokens, Output: ${outputTokens} tokens`);
    }

    return usageRecord;
  }

  /**
   * Get current usage statistics
   */
  getStats() {
    return {
      ...this.usage,
      currentSession: this.currentSession,
      averageTokensPerRequest: this.usage.requests > 0 ? (this.usage.inputTokens + this.usage.outputTokens) / this.usage.requests : 0
    };
  }

  /**
   * Reset usage statistics
   */
  reset() {
    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
      sessions: []
    };
    this.currentSession = null;
    this.emit('reset');
  }

  /**
   * Estimate token usage for a request (billing handled by subscription)
   */
  estimateUsage(inputTokens, outputTokens) {
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens
    };
  }
}

/**
 * Performance Optimizer for Sonnet
 */
export class SonnetPerformanceOptimizer {
  constructor(config = {}) {
    this.config = { ...DEFAULT_SONNET_CONFIG.performance, ...config };
    this.cache = new Map();
    this.compressionHistory = [];
  }

  /**
   * Optimize context for long conversations
   */
  optimizeContext(messages, targetTokens = 150000) {
    const estimatedTokens = this.estimateTokens(messages);
    
    if (estimatedTokens <= targetTokens) {
      return { messages, compressed: false, originalTokens: estimatedTokens };
    }

    const strategy = this.config.contextCompression.strategy;
    
    switch (strategy) {
      case 'summary':
        return this._compressBySummary(messages, targetTokens);
      case 'truncation':
        return this._compressByTruncation(messages, targetTokens);
      case 'semantic':
        return this._compressBySemantic(messages, targetTokens);
      default:
        return this._compressByTruncation(messages, targetTokens);
    }
  }

  /**
   * Compress by keeping system + recent messages + summarizing older ones
   */
  _compressBySummary(messages, targetTokens) {
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    
    // Keep last 10 messages
    const recentMessages = nonSystemMessages.slice(-10);
    const olderMessages = nonSystemMessages.slice(0, -10);

    // Create summary of older messages
    const summary = {
      role: 'system',
      content: `[Context Summary: ${olderMessages.length} previous messages summarized. Key points from conversation history preserved.]`,
      isSummary: true
    };

    const compressed = [...systemMessages, summary, ...recentMessages];
    
    return {
      messages: compressed,
      compressed: true,
      originalTokens: this.estimateTokens(messages),
      compressedTokens: this.estimateTokens(compressed),
      summaryCount: olderMessages.length
    };
  }

  /**
   * Compress by truncating oldest messages
   */
  _compressByTruncation(messages, targetTokens) {
    let result = [...messages];
    
    // Keep system messages and remove oldest non-system messages
    while (this.estimateTokens(result) > targetTokens && result.length > 5) {
      const firstNonSystem = result.findIndex(m => m.role !== 'system');
      if (firstNonSystem >= 0) {
        result.splice(firstNonSystem, 1);
      } else {
        break;
      }
    }

    return {
      messages: result,
      compressed: true,
      originalTokens: this.estimateTokens(messages),
      compressedTokens: this.estimateTokens(result)
    };
  }

  /**
   * Compress by semantic importance (placeholder for advanced implementation)
   */
  _compressBySemantic(messages, targetTokens) {
    // For now, fallback to summary strategy
    // Advanced implementation would use embeddings to keep most semantically important messages
    return this._compressBySummary(messages, targetTokens);
  }

  /**
   * Estimate token count
   */
  estimateTokens(messages) {
    if (!Array.isArray(messages)) {
      messages = [{ content: messages }];
    }
    
    let total = 0;
    for (const message of messages) {
      const content = typeof message === 'string' ? message : message.content;
      if (typeof content === 'string') {
        // Rough estimation: ~4 chars per token
        total += Math.ceil(content.length / 4);
      }
    }
    return total;
  }

  /**
   * Get from cache
   */
  getFromCache(key) {
    if (!this.config.caching.enabled) return null;
    
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.config.caching.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Set in cache
   */
  setInCache(key, data) {
    if (!this.config.caching.enabled) return;
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.config.caching.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Generate cache key
   */
  generateCacheKey(messages, options = {}) {
    const content = JSON.stringify({ messages, options });
    // Simple hash for demo - use crypto in production
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `cache_${hash}`;
  }

  /**
   * Calculate retry delay
   */
  calculateRetryDelay(attemptNumber) {
    const { initialDelayMs, backoffMultiplier, maxDelayMs } = this.config.retry;
    const delay = initialDelayMs * Math.pow(backoffMultiplier, attemptNumber - 1);
    return Math.min(delay, maxDelayMs);
  }
}

/**
 * Sonnet Configuration Manager
 */
export class SonnetConfigManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = this._mergeConfig(DEFAULT_SONNET_CONFIG, config);
    this.costTracker = new SonnetCostTracker(this.config.costTracking);
    this.optimizer = new SonnetPerformanceOptimizer(this.config.performance);
  }

  /**
   * Deep merge configuration
   */
  _mergeConfig(defaults, overrides) {
    const result = { ...defaults };
    
    for (const key in overrides) {
      if (overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
        result[key] = this._mergeConfig(defaults[key] || {}, overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
    
    return result;
  }

  /**
   * Get configuration
   */
  get(path = null) {
    if (!path) return this.config;
    
    const parts = path.split('.');
    let current = this.config;
    
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    
    return current;
  }

  /**
   * Update configuration
   */
  update(path, value) {
    const parts = path.split('.');
    let current = this.config;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    
    current[parts[parts.length - 1]] = value;
    this.emit('configUpdated', { path, value });
  }

  /**
   * Get model configuration
   */
  getModelConfig(modelId = null) {
    if (!modelId) return this.config.model;
    return SONNET_MODELS[modelId] || SONNET_MODELS.SONNET_4_6;
  }

  /**
   * Switch model
   */
  switchModel(modelId) {
    const model = SONNET_MODELS[modelId];
    if (!model) {
      throw new Error(`Unknown model: ${modelId}. Available: ${Object.keys(SONNET_MODELS).join(', ')}`);
    }
    
    this.config.model = model;
    this.emit('modelSwitched', model);
    return model;
  }

  /**
   * Get cost tracker
   */
  getCostTracker() {
    return this.costTracker;
  }

  /**
   * Get optimizer
   */
  getOptimizer() {
    return this.optimizer;
  }
}

export default {
  SONNET_MODELS,
  DEFAULT_SONNET_CONFIG,
  SonnetCostTracker,
  SonnetPerformanceOptimizer,
  SonnetConfigManager
};
