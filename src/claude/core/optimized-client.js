/**
 * @fileoverview Optimized Claude Client with Caching and Batching
 * @module claude/core/optimized-client
 * 
 * Extends the base ClaudeClient with:
 * - Intelligent response caching
 * - Request batching
 * - Token usage optimization
 * - Request deduplication
 */

import { ClaudeClient } from './client.js';
import { LRUCache } from '../../analysis/lru-cache.js';
import { PerformanceMonitor, memoize, batchRequests } from '../../utils/performance.js';
import crypto from 'crypto';

/**
 * Cache key generation options
 * @typedef {Object} CacheOptions
 * @property {boolean} [ignoreSystemPrompt=false] - Ignore system prompt in key
 * @property {number} [ttl=300000] - Cache TTL in milliseconds (default: 5 min)
 * @property {string[]} [ignoreFields] - Fields to ignore when generating cache key
 */

/**
 * Optimized client configuration
 * @typedef {Object} OptimizedClientConfig
 * @property {number} [cacheSize=1000] - Maximum cache entries
 * @property {number} [defaultCacheTtl=300000] - Default cache TTL (5 min)
 * @property {boolean} [enableCache=true] - Enable response caching
 * @property {boolean} [enableBatching=true] - Enable request batching
 * @property {number} [batchDelay=50] - Batch aggregation delay (ms)
 * @property {number} [maxBatchSize=10] - Maximum batch size
 * @property {number} [dedupWindow=1000] - Request deduplication window (ms)
 */

/**
 * Response cache entry
 * @typedef {Object} CacheEntry
 * @property {Object} response - Cached response
 * @property {number} timestamp - Cache timestamp
 * @property {number} tokensUsed - Token usage
 * @property {string} model - Model used
 */

/**
 * OptimizedClaudeClient - High-performance Claude client
 * @extends ClaudeClient
 */
export class OptimizedClaudeClient extends ClaudeClient {
  /** @type {LRUCache} */
  #responseCache;
  
  /** @type {PerformanceMonitor} */
  #monitor;
  
  /** @type {OptimizedClientConfig} */
  #config;
  
  /** @type {Map<string, Promise>} */
  #inflightRequests = new Map();
  
  /** @type {Object} */
  #batchProcessor;

  /**
   * Create an optimized Claude client
   * @param {OptimizedClientConfig} options - Client options
   */
  constructor(options = {}) {
    super(options);
    
    this.#config = {
      cacheSize: 1000,
      defaultCacheTtl: 300000, // 5 minutes
      enableCache: true,
      enableBatching: false, // Disabled by default - requires careful handling
      batchDelay: 50,
      maxBatchSize: 10,
      dedupWindow: 1000,
      ...options
    };
    
    this.#responseCache = new LRUCache({
      maxSize: this.#config.cacheSize,
      ttlMs: this.#config.defaultCacheTtl,
      onEvict: (key, entry) => {
        this.emit('cacheEvict', { key, tokensUsed: entry.tokensUsed });
      }
    });
    
    this.#monitor = new PerformanceMonitor();
    
    // Initialize batch processor if enabled
    if (this.#config.enableBatching) {
      this.#initializeBatchProcessor();
    }
  }

  /**
   * Initialize batch request processor
   * @private
   */
  #initializeBatchProcessor() {
    // Note: Claude web API doesn't support true batching like the API does
    // This is a placeholder for when using the official Anthropic API
    this.#batchProcessor = {
      enabled: false,
      note: 'Batching requires Anthropic API key, not available with session auth'
    };
  }

  /**
   * Generate a cache key from messages and options
   * @private
   * @param {Array<Object>} messages - Message array
   * @param {Object} options - Request options
   * @param {CacheOptions} [cacheOptions] - Cache key options
   * @returns {string} Cache key
   */
  #generateCacheKey(messages, options, cacheOptions = {}) {
    const keyParts = {
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      })),
      model: options.model || 'default',
      maxTokens: options.maxTokens,
      temperature: options.temperature
    };
    
    // Remove ignored fields
    if (cacheOptions.ignoreFields) {
      for (const field of cacheOptions.ignoreFields) {
        delete keyParts[field];
      }
    }
    
    return crypto.createHash('sha256')
      .update(JSON.stringify(keyParts))
      .digest('hex');
  }

  /**
   * Send a message with caching and deduplication
   * @param {Array<Object>} messages - Array of message objects
   * @param {Object} options - Message options
   * @param {CacheOptions} [cacheOptions] - Cache options for this request
   * @returns {Promise<Object>} Claude's response
   */
  async sendMessage(messages, options = {}, cacheOptions = {}) {
    const shouldCache = cacheOptions.cache !== false && this.#config.enableCache;
    const shouldDedup = cacheOptions.dedup !== false;
    
    // Generate cache key
    const cacheKey = this.#generateCacheKey(messages, options, cacheOptions);
    
    // Check cache first
    if (shouldCache) {
      const cached = this.#responseCache.get(cacheKey);
      if (cached) {
        this.emit('cacheHit', { cacheKey, timestamp: Date.now() });
        this.#monitor.recordMetric('claude:cacheHit', 1);
        return {
          ...cached.response,
          cached: true,
          cachedAt: cached.timestamp
        };
      }
    }
    
    // Check for in-flight request (deduplication)
    if (shouldDedup) {
      const inflight = this.#inflightRequests.get(cacheKey);
      if (inflight) {
        this.emit('dedupHit', { cacheKey });
        this.#monitor.recordMetric('claude:dedupHit', 1);
        return inflight;
      }
    }
    
    // Execute request
    this.#monitor.startTimer('claude:sendMessage');
    
    const requestPromise = super.sendMessage(messages, options)
      .then(response => {
        // Cache successful response
        if (shouldCache && !response.cached) {
          const ttl = cacheOptions.ttl ?? this.#config.defaultCacheTtl;
          this.#responseCache.set(cacheKey, {
            response,
            timestamp: Date.now(),
            tokensUsed: response.usage?.total_tokens || 0,
            model: response.model
          }, { ttlMs: ttl });
          
          this.emit('cacheStore', { cacheKey, tokensUsed: response.usage?.total_tokens });
        }
        
        const duration = this.#monitor.endTimer('claude:sendMessage');
        this.#monitor.recordMetric('claude:requestTime', duration);
        
        return response;
      })
      .catch(error => {
        this.#monitor.endTimer('claude:sendMessage');
        this.#monitor.recordMetric('claude:requestError', 1);
        throw error;
      })
      .finally(() => {
        // Remove from in-flight
        this.#inflightRequests.delete(cacheKey);
      });
    
    // Track in-flight request
    if (shouldDedup) {
      this.#inflightRequests.set(cacheKey, requestPromise);
      
      // Auto-cleanup after dedup window
      setTimeout(() => {
        this.#inflightRequests.delete(cacheKey);
      }, this.#config.dedupWindow);
    }
    
    return requestPromise;
  }

  /**
   * Send multiple messages in parallel with concurrency control
   * @param {Array<{messages: Array<Object>, options: Object}>} requests - Request batches
   * @param {Object} [options] - Batch options
   * @param {number} [options.concurrency=3] - Max concurrent requests
   * @returns {Promise<Array<Object>>} Array of responses
   */
  async sendBatch(requests, options = {}) {
    const concurrency = options.concurrency ?? 3;
    const results = [];
    
    // Process in chunks
    for (let i = 0; i < requests.length; i += concurrency) {
      const chunk = requests.slice(i, i + concurrency);
      
      const chunkPromises = chunk.map(req => 
        this.sendMessage(req.messages, req.options, req.cacheOptions)
          .catch(error => ({ error: error.message, failed: true }))
      );
      
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }
    
    return results;
  }

  /**
   * Stream a message with optional caching of final result
   * @param {Array<Object>} messages - Array of message objects
   * @param {Object} options - Stream options
   * @returns {AsyncGenerator<Object>} Stream of response chunks
   */
  async *streamMessage(messages, options = {}) {
    // Streaming doesn't benefit from caching mid-stream
    // But we can cache the complete response if needed
    yield* super.streamMessage(messages, options);
  }

  /**
   * Clear the response cache
   * @param {string} [pattern] - Optional pattern to match keys
   * @returns {number} Number of entries cleared
   */
  clearCache(pattern) {
    if (!pattern) {
      const size = this.#responseCache.size;
      this.#responseCache.clear();
      return size;
    }
    
    // Pattern-based clearing would require iterating keys
    // LRUCache doesn't expose all keys, so we clear all
    const size = this.#responseCache.size;
    this.#responseCache.clear();
    return size;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    const cacheStats = this.#responseCache.getStats();
    const perfStats = this.#monitor.getAllStats();
    
    return {
      cache: cacheStats,
      performance: perfStats,
      inflightRequests: this.#inflightRequests.size,
      config: {
        enableCache: this.#config.enableCache,
        enableBatching: this.#config.enableBatching,
        cacheSize: this.#config.cacheSize,
        defaultCacheTtl: this.#config.defaultCacheTtl
      }
    };
  }

  /**
   * Create a memoized version of a function using this client's cache
   * @template T
   * @param {(...args: any[]) => Promise<T>} fn - Function to memoize
   * @param {Object} [options] - Memoization options
   * @returns {(...args: any[]) => Promise<T>}
   */
  memoize(fn, options = {}) {
    return memoize(fn, {
      ttl: options.ttl ?? this.#config.defaultCacheTtl,
      maxSize: options.maxSize ?? 100,
      keyGenerator: options.keyGenerator
    });
  }

  /**
   * Get client health status with cache info
   * @returns {Object}
   */
  getHealthStatus() {
    const baseHealth = super.getHealthStatus();
    const cacheStats = this.getCacheStats();
    
    return {
      ...baseHealth,
      optimization: {
        cacheEnabled: this.#config.enableCache,
        cacheHitRate: cacheStats.cache.hitRate,
        cacheSize: cacheStats.cache.size,
        inflightRequests: cacheStats.inflightRequests
      }
    };
  }

  /**
   * Pre-warm cache with common queries
   * @param {Array<{messages: Array<Object>, options: Object}>} queries - Queries to warm
   */
  async warmupCache(queries) {
    for (const query of queries) {
      try {
        await this.sendMessage(query.messages, query.options, { cache: true });
      } catch (error) {
        // Non-critical warmup errors
        this.emit('warmupWarning', { error: error.message });
      }
    }
    this.emit('warmupComplete', { warmed: queries.length });
  }

  /**
   * Close the client and cleanup
   * @returns {Promise<void>}
   */
  async close() {
    this.#responseCache.clear();
    this.#inflightRequests.clear();
    await super.close();
  }
}

/**
 * Create an optimized Claude client instance
 * @param {OptimizedClientConfig} options - Client options
 * @returns {OptimizedClaudeClient}
 */
export function createOptimizedClient(options = {}) {
  return new OptimizedClaudeClient(options);
}

export default OptimizedClaudeClient;
