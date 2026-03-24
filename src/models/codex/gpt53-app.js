/**
 * GPT 5.3 Codex App Integration
 * Fast, cost-effective integration for application use
 */

'use strict';

const { GPT53Client } = require('./gpt53-client');
const { DualModeCodexClient } = require('./gpt53-dual-client');

/**
 * Response Cache Manager
 * Manages caching for GPT 5.3 responses
 */
class ResponseCache {
  constructor(options = {}) {
    this.ttl = options.ttl || 3600;
    this.maxSize = options.maxSize || 1000;
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };
    
    // Start cleanup interval
    this._startCleanup();
  }

  /**
   * Get cached response
   * @param {string} key - Cache key
   * @returns {Object|null} Cached response or null
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set cached response
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   * @param {number} customTTL - Custom TTL in seconds
   */
  set(key, data, customTTL = null) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (customTTL || this.ttl) * 1000,
    });
  }

  /**
   * Generate cache key from request
   * @param {Object} request - Request object
   * @returns {string} Cache key
   */
  generateKey(request) {
    const crypto = require('crypto');
    const data = JSON.stringify({
      type: request.type,
      prompt: request.prompt,
      code: request.code,
      instructions: request.instructions,
      options: request.options,
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? this.stats.hits / (this.stats.hits + this.stats.misses)
      : 0;
    
    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Clear all cached entries
   */
  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  _startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }
}

/**
 * Batch Processor
 * Batches multiple requests for efficient processing
 */
class BatchProcessor {
  constructor(client, options = {}) {
    this.client = client;
    this.maxBatchSize = options.maxBatchSize || 10;
    this.maxWaitTime = options.maxWaitTime || 5000;
    this.queue = [];
    this.processing = false;
    this.flushTimer = null;
  }

  /**
   * Add request to batch
   * @param {Object} request - Request to batch
   * @returns {Promise<Object>} Request result
   */
  async add(request) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        request,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Process immediately if batch is full
      if (this.queue.length >= this.maxBatchSize) {
        this._flush();
      } else if (!this.flushTimer) {
        // Set flush timer
        this.flushTimer = setTimeout(() => this._flush(), this.maxWaitTime);
      }
    });
  }

  /**
   * Flush all pending requests
   */
  async _flush() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;

    const batch = this.queue.splice(0, this.maxBatchSize);

    try {
      // Process batch in parallel
      const results = await Promise.all(
        batch.map(item => this._processSingle(item.request))
      );

      // Resolve all promises
      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (error) {
      // Reject all on error
      batch.forEach(item => {
        item.reject(error);
      });
    } finally {
      this.processing = false;
      
      // Flush remaining if any
      if (this.queue.length > 0) {
        this._flush();
      }
    }
  }

  async _processSingle(request) {
    const methodMap = {
      quick_completion: () => this.client.quickCompletion(request.prompt, request.options),
      standard_refactoring: () => this.client.standardRefactoring(request.code, request.instructions, request.options),
      code_generation: () => this.client.codeGeneration(request.requirements, request.context, request.options),
      unit_test_generation: () => this.client.unitTestGeneration(request.code, request.options),
      simple_analysis: () => this.client.simpleAnalysis(request.code, request.analysisType, request.options),
    };

    const method = methodMap[request.type];
    if (!method) {
      throw new Error(`Unknown request type: ${request.type}`);
    }

    return method();
  }
}

/**
 * GPT 5.3 App Integration
 * High-level interface for application integration
 */
class GPT53App {
  constructor(options = {}) {
    this.options = {
      useDualMode: options.useDualMode ?? true,
      enableCache: options.enableCache ?? true,
      enableBatch: options.enableBatch ?? true,
      cacheTTL: options.cacheTTL || 3600,
      selectionMode: options.selectionMode || 'auto',
      ...options,
    };

    this.client = null;
    this.cache = null;
    this.batchProcessor = null;
    this.initialized = false;
  }

  /**
   * Initialize the app integration
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this.initialized) return true;

    // Initialize client
    if (this.options.useDualMode) {
      this.client = new DualModeCodexClient({
        selectionMode: this.options.selectionMode,
      });
    } else {
      this.client = new GPT53Client();
    }

    await this.client.initialize();

    // Initialize cache
    if (this.options.enableCache) {
      this.cache = new ResponseCache({ ttl: this.options.cacheTTL });
    }

    // Initialize batch processor
    if (this.options.enableBatch) {
      this.batchProcessor = new BatchProcessor(this.client);
    }

    this.initialized = true;
    return true;
  }

  /**
   * Quick code completion
   * @param {string} prompt - Completion prompt
   * @param {Object} options - Options
   * @returns {Promise<Object>} Completion result
   */
  async complete(prompt, options = {}) {
    const request = { type: 'quick_completion', prompt, options };
    return this._execute(request);
  }

  /**
   * Refactor code
   * @param {string} code - Code to refactor
   * @param {string} instructions - Refactoring instructions
   * @param {Object} options - Options
   * @returns {Promise<Object>} Refactoring result
   */
  async refactor(code, instructions, options = {}) {
    const request = { type: 'standard_refactoring', code, instructions, options };
    return this._execute(request);
  }

  /**
   * Generate code
   * @param {string} requirements - Requirements
   * @param {Object} context - Generation context
   * @param {Object} options - Options
   * @returns {Promise<Object>} Generated code
   */
  async generate(requirements, context = {}, options = {}) {
    const request = { type: 'code_generation', requirements, context, options };
    return this._execute(request);
  }

  /**
   * Generate unit tests
   * @param {string} code - Code to test
   * @param {Object} options - Options
   * @returns {Promise<Object>} Generated tests
   */
  async generateTests(code, options = {}) {
    const request = { type: 'unit_test_generation', code, options };
    return this._execute(request);
  }

  /**
   * Analyze code
   * @param {string} code - Code to analyze
   * @param {string} analysisType - Analysis type
   * @param {Object} options - Options
   * @returns {Promise<Object>} Analysis result
   */
  async analyze(code, analysisType = 'general', options = {}) {
    const request = { type: 'simple_analysis', code, analysisType, options };
    return this._execute(request);
  }

  /**
   * Process multiple tasks in batch
   * @param {Array<Object>} tasks - Tasks to process
   * @returns {Promise<Array<Object>>} Task results
   */
  async batch(tasks) {
    if (!this.options.enableBatch) {
      // Process sequentially if batching disabled
      const results = [];
      for (const task of tasks) {
        results.push(await this._execute(task));
      }
      return results;
    }

    // Process in parallel using batch processor
    return Promise.all(tasks.map(task => this.batchProcessor.add(task)));
  }

  /**
   * Get system status and metrics
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      initialized: this.initialized,
      dualMode: this.options.useDualMode,
      cache: this.cache?.getStats() || null,
      capabilities: this.client?.getCapabilities() || null,
      metrics: this.client?.getMetrics() || null,
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache?.clear();
  }

  /**
   * Shutdown the app
   */
  async shutdown() {
    await this.client?.shutdown();
    this.initialized = false;
  }

  // Private methods

  async _execute(request) {
    // Check cache first
    if (this.options.enableCache && !request.options?.skipCache) {
      const cacheKey = this.cache.generateKey(request);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    // Execute request
    let result;
    if (this.options.useDualMode) {
      result = await this.client.execute(request, request.options);
    } else {
      result = await this._executeSingleMode(request);
    }

    // Cache result
    if (this.options.enableCache && !request.options?.skipCache) {
      const cacheKey = this.cache.generateKey(request);
      this.cache.set(cacheKey, result, request.options?.cacheTTL);
    }

    return result;
  }

  async _executeSingleMode(request) {
    const methodMap = {
      quick_completion: () => this.client.quickCompletion(request.prompt, request.options),
      standard_refactoring: () => this.client.standardRefactoring(request.code, request.instructions, request.options),
      code_generation: () => this.client.codeGeneration(request.requirements, request.context, request.options),
      unit_test_generation: () => this.client.unitTestGeneration(request.code, request.options),
      simple_analysis: () => this.client.simpleAnalysis(request.code, request.analysisType, request.options),
    };

    const method = methodMap[request.type];
    if (!method) {
      throw new Error(`Unknown request type: ${request.type}`);
    }

    return method();
  }
}

// Factory function for easy creation
function createGPT53App(options = {}) {
  const app = new GPT53App(options);
  return app;
}

module.exports = {
  GPT53App,
  ResponseCache,
  BatchProcessor,
  createGPT53App,
};
