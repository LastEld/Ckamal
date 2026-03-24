/**
 * @fileoverview Context Management Module for CogniMesh v5.0
 * Manages context windows with sliding window support and prioritization.
 * @module claude/context
 */

import { EventEmitter } from 'events';
import { ContextCompressor } from './compressor.js';

/**
 * @typedef {Object} ContextEntry
 * @property {string} id - Unique identifier
 * @property {string} content - Context content
 * @property {Object} metadata - Associated metadata
 * @property {number} timestamp - Creation timestamp
 * @property {number} priority - Priority score (0-100)
 * @property {number} tokenCount - Cached token count
 */

/**
 * @typedef {Object} ContextQuery
 * @property {string} [search] - Text search query
 * @property {number} [maxTokens] - Maximum tokens to return
 * @property {string} [type] - Filter by content type
 * @property {Date} [since] - Filter by date
 */

/**
 * ContextManager handles context window management with sliding window
 * and prioritization strategies for optimal token usage.
 * @extends EventEmitter
 */
export class ContextManager extends EventEmitter {
  /** @type {Map<string, ContextEntry>} */
  #contexts = new Map();
  
  /** @type {Set<string>} */
  #subscribers = new Set();
  
  /** @type {ContextCompressor} */
  #compressor;
  
  /** @type {number} */
  #maxTokens;
  
  /** @type {number} */
  #currentTokens = 0;

  /**
   * Creates a ContextManager instance.
   * @param {Object} options - Configuration options
   * @param {number} [options.maxTokens=100000] - Maximum context window size
   * @param {boolean} [options.enableCompression=true] - Enable automatic compression
   * @param {ContextCompressor} [options.compressor] - Custom compressor instance
   */
  constructor(options = {}) {
    super();
    this.#maxTokens = options.maxTokens || 100000;
    this.#compressor = options.compressor || new ContextCompressor();
    this.enableCompression = options.enableCompression !== false;
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
   * Subscribes to the context manager.
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
   * Unsubscribes from the context manager.
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
   * Adds context to the manager.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} content - Context content to add
   * @param {Object} [metadata={}] - Context metadata
   * @param {string} [metadata.type='general'] - Content type
   * @param {number} [metadata.priority=50] - Priority (0-100)
   * @returns {string} Context entry ID
   * @throws {Error} If unauthorized or content exceeds limits
   */
  addContext(subscriptionKey, content, metadata = {}) {
    this.#requireAuth(subscriptionKey);
    
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid content: must be non-empty string');
    }

    const id = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tokenCount = this.estimateTokens(content);
    
    if (tokenCount > this.#maxTokens) {
      throw new Error(`Content exceeds maximum token limit: ${tokenCount} > ${this.#maxTokens}`);
    }

    /** @type {ContextEntry} */
    const entry = {
      id,
      content,
      metadata: {
        type: metadata.type || 'general',
        source: metadata.source,
        tags: metadata.tags || [],
        ...metadata
      },
      timestamp: Date.now(),
      priority: Math.min(100, Math.max(0, metadata.priority || 50)),
      tokenCount
    };

    this.#contexts.set(id, entry);
    this.#currentTokens += tokenCount;

    this.emit('contextAdded', { id, tokenCount, totalTokens: this.#currentTokens });

    // Trigger sliding window if needed
    if (this.#currentTokens > this.#maxTokens) {
      this.prioritizeContext(subscriptionKey);
    }

    return id;
  }

  /**
   * Retrieves context entries matching the query.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {ContextQuery} [query={}] - Search query parameters
   * @returns {ContextEntry[]} Matching context entries
   */
  getContext(subscriptionKey, query = {}) {
    this.#requireAuth(subscriptionKey);
    
    let results = Array.from(this.#contexts.values());

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      results = results.filter(ctx => 
        ctx.content.toLowerCase().includes(searchLower) ||
        ctx.metadata.tags?.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    if (query.type) {
      results = results.filter(ctx => ctx.metadata.type === query.type);
    }

    if (query.since) {
      const sinceTime = new Date(query.since).getTime();
      results = results.filter(ctx => ctx.timestamp >= sinceTime);
    }

    // Sort by priority (desc) then timestamp (desc)
    results.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.timestamp - a.timestamp;
    });

    if (query.maxTokens) {
      let tokenSum = 0;
      results = results.filter(ctx => {
        tokenSum += ctx.tokenCount;
        return tokenSum <= query.maxTokens;
      });
    }

    return results;
  }

  /**
   * Removes a specific context entry.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} id - Context entry ID
   * @returns {boolean} Success status
   */
  removeContext(subscriptionKey, id) {
    this.#requireAuth(subscriptionKey);
    
    const entry = this.#contexts.get(id);
    if (!entry) return false;

    this.#contexts.delete(id);
    this.#currentTokens -= entry.tokenCount;
    
    this.emit('contextRemoved', { id, tokenCount: entry.tokenCount, totalTokens: this.#currentTokens });
    return true;
  }

  /**
   * Clears all context entries.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {number} Number of entries cleared
   */
  clearContext(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    
    const count = this.#contexts.size;
    this.#contexts.clear();
    this.#currentTokens = 0;
    
    this.emit('contextCleared', { count, timestamp: Date.now() });
    return count;
  }

  /**
   * Gets the current total token count.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {number} Total token count
   */
  getTokenCount(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    return this.#currentTokens;
  }

  /**
   * Gets maximum token capacity.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {number} Maximum token capacity
   */
  getMaxTokens(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    return this.#maxTokens;
  }

  /**
   * Prioritizes context using sliding window strategy.
   * Removes or compresses low-priority entries when over budget.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {Object} Statistics about the operation
   */
  prioritizeContext(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    
    const stats = { removed: 0, compressed: 0, tokensFreed: 0 };
    
    while (this.#currentTokens > this.#maxTokens && this.#contexts.size > 0) {
      const entries = Array.from(this.#contexts.values())
        .sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);
      
      const lowest = entries[0];
      
      // Try compression first if enabled and entry is large
      if (this.enableCompression && lowest.tokenCount > 100 && lowest.priority > 20) {
        const compressed = this.#compressor.compress(lowest.content, Math.floor(lowest.tokenCount * 0.5));
        const newTokenCount = this.estimateTokens(compressed);
        
        const tokensSaved = lowest.tokenCount - newTokenCount;
        lowest.content = compressed;
        lowest.tokenCount = newTokenCount;
        this.#currentTokens -= tokensSaved;
        
        stats.compressed++;
        stats.tokensFreed += tokensSaved;
        
        this.emit('contextCompressed', { id: lowest.id, tokensSaved });
      } else {
        // Remove lowest priority entry
        this.#contexts.delete(lowest.id);
        this.#currentTokens -= lowest.tokenCount;
        
        stats.removed++;
        stats.tokensFreed += lowest.tokenCount;
        
        this.emit('contextEvicted', { id: lowest.id, reason: 'sliding_window' });
      }
    }

    return stats;
  }

  /**
   * Estimates token count for text (approximation).
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    // Approximate: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  /**
   * Gets memory usage statistics.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {Object} Memory statistics
   */
  getMemoryStats(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    
    return {
      entryCount: this.#contexts.size,
      currentTokens: this.#currentTokens,
      maxTokens: this.#maxTokens,
      utilization: this.#currentTokens / this.#maxTokens,
      subscriberCount: this.#subscribers.size
    };
  }

  /**
   * Disposes the manager and clears all resources.
   */
  dispose() {
    this.#contexts.clear();
    this.#subscribers.clear();
    this.removeAllListeners();
    this.#currentTokens = 0;
  }
}

export { ContextCompressor } from './compressor.js';
export default ContextManager;
