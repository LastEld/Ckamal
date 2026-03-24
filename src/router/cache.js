/**
 * @fileoverview Semantic Cache with response caching, invalidation, and warming.
 * Provides intelligent caching based on semantic similarity.
 * @module router/cache
 */

import { EventEmitter } from 'events';
import { LRUCache } from '../utils/cache.js';

/**
 * @typedef {Object} CacheEntry
 * @property {string} key - Cache key
 * @property {Object} value - Cached value
 * @property {number} timestamp - Cache timestamp
 * @property {number} ttl - Time to live
 * @property {number} accessCount - Access count
 * @property {number} lastAccess - Last access timestamp
 * @property {string[]} tags - Cache tags
 * @property {Object} metadata - Additional metadata
 */

/**
 * @typedef {Object} SemanticSignature
 * @property {string} hash - Content hash
 * @property {string[]} keywords - Extracted keywords
 * @property {number} complexity - Content complexity
 * @property {string} intent - Detected intent
 */

/**
 * @typedef {Object} CacheConfig
 * @property {number} maxSize - Maximum cache entries
 * @property {number} defaultTTL - Default TTL in ms
 * @property {number} semanticThreshold - Similarity threshold (0-1)
 * @property {boolean} enableSemanticCache - Enable semantic matching
 * @property {boolean} enableResponseCache - Enable response caching
 */

/**
 * Semantic Cache for intelligent response caching
 * @extends EventEmitter
 */
export class SemanticCache extends EventEmitter {
  /**
   * Creates an instance of SemanticCache
   * @param {CacheConfig} options - Cache configuration
   */
  constructor(options = {}) {
    super();
    
    this.config = {
      maxSize: options.maxSize || 1000,
      defaultTTL: options.defaultTTL || 5 * 60 * 1000, // 5 minutes
      semanticThreshold: options.semanticThreshold || 0.85,
      enableSemanticCache: options.enableSemanticCache ?? true,
      enableResponseCache: options.enableResponseCache ?? true,
      ...options
    };
    
    // Primary cache storage
    this.cache = new LRUCache({
      maxSize: this.config.maxSize,
      ttl: this.config.defaultTTL,
      onEvict: (key, value) => this.emit('evicted', { key, value })
    });
    
    // Semantic index for similarity matching
    this.semanticIndex = new Map();
    
    // Tag index for invalidation
    this.tagIndex = new Map();
    
    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      semanticHits: 0,
      evictions: 0,
      totalRequests: 0
    };
    
    this.initialized = false;
  }
  
  /**
   * Initialize the cache
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    this.initialized = true;
    this.emit('initialized');
  }
  
  /**
   * Get cached response
   * @param {Object} request - Request object
   * @param {Object} options - Get options
   * @returns {Object|null} Cached response or null
   */
  get(request, options = {}) {
    this.stats.totalRequests++;
    
    const key = this.generateKey(request);
    
    // Try exact match first
    const exact = this.cache.get(key);
    if (exact) {
      this.stats.hits++;
      this.emit('cacheHit', { key, type: 'exact' });
      return this.wrapResponse(exact, 'exact');
    }
    
    // Try semantic match if enabled
    if (this.config.enableSemanticCache && options.allowSemantic !== false) {
      const semanticMatch = this.findSemanticMatch(request);
      if (semanticMatch) {
        this.stats.semanticHits++;
        this.emit('cacheHit', { key, type: 'semantic', matchedKey: semanticMatch.key });
        return this.wrapResponse(semanticMatch.value, 'semantic');
      }
    }
    
    this.stats.misses++;
    this.emit('cacheMiss', { key });
    return null;
  }
  
  /**
   * Set cached response
   * @param {Object} request - Request object
   * @param {Object} response - Response to cache
   * @param {Object} options - Cache options
   * @returns {CacheEntry} Cache entry
   */
  set(request, response, options = {}) {
    const key = this.generateKey(request);
    const ttl = options.ttl || this.config.defaultTTL;
    
    // Generate semantic signature
    const signature = this.generateSignature(request);
    
    const entry = {
      key,
      value: response,
      timestamp: Date.now(),
      ttl,
      accessCount: 0,
      lastAccess: Date.now(),
      tags: options.tags || [],
      signature,
      metadata: {
        ...options.metadata,
        cachedAt: Date.now()
      }
    };
    
    // Store in cache
    this.cache.set(key, entry, ttl);
    
    // Index semantically
    if (this.config.enableSemanticCache) {
      this.semanticIndex.set(key, signature);
    }
    
    // Index by tags
    for (const tag of entry.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag).add(key);
    }
    
    this.emit('cacheSet', { key, ttl, tags: entry.tags });
    
    return entry;
  }
  
  /**
   * Generate cache key from request
   * @param {Object} request - Request object
   * @returns {string} Cache key
   * @private
   */
  generateKey(request) {
    const content = typeof request === 'string' ? request : 
      (request.content || request.prompt || JSON.stringify(request));
    
    // Normalize content
    const normalized = this.normalizeContent(content);
    
    // Create hash
    return `cache:${this.hashString(normalized)}`;
  }
  
  /**
   * Generate semantic signature for request
   * @param {Object} request - Request object
   * @returns {SemanticSignature} Semantic signature
   * @private
   */
  generateSignature(request) {
    const content = typeof request === 'string' ? request : 
      (request.content || request.prompt || JSON.stringify(request));
    
    const normalized = this.normalizeContent(content);
    
    // Extract keywords
    const keywords = this.extractKeywords(normalized);
    
    // Detect intent
    const intent = this.detectIntent(normalized);
    
    // Calculate complexity
    const complexity = this.calculateComplexity(normalized);
    
    return {
      hash: this.hashString(normalized),
      keywords,
      complexity,
      intent
    };
  }
  
  /**
   * Find semantically similar cached entry
   * @param {Object} request - Request object
   * @returns {Object|null} Matching entry or null
   * @private
   */
  findSemanticMatch(request) {
    const signature = this.generateSignature(request);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [key, cachedSignature] of this.semanticIndex) {
      const similarity = this.calculateSimilarity(signature, cachedSignature);
      
      if (similarity > this.config.semanticThreshold && similarity > bestScore) {
        const entry = this.cache.peek(key);
        if (entry) {
          bestScore = similarity;
          bestMatch = { key, value: entry, similarity };
        }
      }
    }
    
    return bestMatch;
  }
  
  /**
   * Calculate similarity between signatures
   * @param {SemanticSignature} sig1 - First signature
   * @param {SemanticSignature} sig2 - Second signature
   * @returns {number} Similarity score (0-1)
   * @private
   */
  calculateSimilarity(sig1, sig2) {
    // Intent must match
    if (sig1.intent !== sig2.intent) {
      return 0;
    }
    
    // Complexity should be similar (within 2 levels)
    if (Math.abs(sig1.complexity - sig2.complexity) > 2) {
      return 0;
    }
    
    // Calculate keyword overlap
    const intersection = sig1.keywords.filter(k => sig2.keywords.includes(k));
    const union = [...new Set([...sig1.keywords, ...sig2.keywords])];
    
    const jaccardSimilarity = intersection.length / union.length;
    
    // Weight by keyword overlap
    return jaccardSimilarity;
  }
  
  /**
   * Extract keywords from content
   * @param {string} content - Content to analyze
   * @returns {string[]} Keywords
   * @private
   */
  extractKeywords(content) {
    // Common stop words to filter out
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall',
      'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
      'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'under', 'and', 'but', 'or', 'yet', 'so', 'if',
      'because', 'although', 'though', 'while', 'where', 'when',
      'that', 'which', 'who', 'whom', 'whose', 'what', 'this',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her',
      'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs'
    ]);
    
    // Extract words
    const words = content.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    // Get unique keywords (top 10)
    const wordFreq = {};
    for (const word of words) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
    
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
  
  /**
   * Detect intent from content
   * @param {string} content - Content to analyze
   * @returns {string} Detected intent
   * @private
   */
  detectIntent(content) {
    const lower = content.toLowerCase();
    
    // Intent patterns
    const intents = [
      { name: 'code_generation', patterns: [/write.*code/i, /generate.*function/i, /create.*class/i] },
      { name: 'code_review', patterns: [/review.*code/i, /analyze.*code/i, /check.*quality/i] },
      { name: 'explanation', patterns: [/explain/i, /what.*is/i, /how.*does/i, /why.*is/i] },
      { name: 'debugging', patterns: [/debug/i, /fix.*error/i, /solve.*problem/i, /troubleshoot/i] },
      { name: 'refactoring', patterns: [/refactor/i, /improve.*code/i, /optimize/i, /clean.*up/i] },
      { name: 'documentation', patterns: [/document/i, /add.*comment/i, /write.*doc/i] },
      { name: 'testing', patterns: [/test/i, /unit.*test/i, /spec/i] },
      { name: 'architecture', patterns: [/design/i, /architecture/i, /structure/i, /pattern/i] }
    ];
    
    for (const intent of intents) {
      if (intent.patterns.some(p => p.test(lower))) {
        return intent.name;
      }
    }
    
    return 'general';
  }
  
  /**
   * Calculate content complexity
   * @param {string} content - Content to analyze
   * @returns {number} Complexity score (1-10)
   * @private
   */
  calculateComplexity(content) {
    let score = 5; // Base complexity
    
    // Length factor
    if (content.length > 1000) score += 2;
    else if (content.length > 500) score += 1;
    else if (content.length < 100) score -= 1;
    
    // Technical terms
    const technicalTerms = [
      /async|await|promise|callback/i,
      /class|interface|extends|implements/i,
      /function|method|procedure/i,
      /api|endpoint|service/i,
      /database|query|sql/i,
      /algorithm|complexity|optimization/i,
      /architecture|microservice|distributed/i
    ];
    
    let termCount = 0;
    for (const term of technicalTerms) {
      if (term.test(content)) termCount++;
    }
    
    score += Math.min(termCount / 2, 3);
    
    return Math.min(10, Math.max(1, Math.round(score)));
  }
  
  /**
   * Normalize content for comparison
   * @param {string} content - Content to normalize
   * @returns {string} Normalized content
   * @private
   */
  normalizeContent(content) {
    return content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }
  
  /**
   * Hash string for key generation
   * @param {string} str - String to hash
   * @returns {string} Hash value
   * @private
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Wrap cached response with metadata
   * @param {CacheEntry} entry - Cache entry
   * @param {string} matchType - Type of match
   * @returns {Object} Wrapped response
   * @private
   */
  wrapResponse(entry, matchType) {
    entry.accessCount++;
    entry.lastAccess = Date.now();
    
    return {
      value: entry.value,
      fromCache: true,
      matchType,
      cachedAt: entry.timestamp,
      accessCount: entry.accessCount,
      metadata: entry.metadata
    };
  }
  
  /**
   * Invalidate cache entries by tag
   * @param {string} tag - Tag to invalidate
   * @returns {number} Number of entries invalidated
   */
  invalidateByTag(tag) {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;
    
    let count = 0;
    for (const key of keys) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
        this.semanticIndex.delete(key);
        count++;
      }
    }
    
    this.tagIndex.delete(tag);
    
    this.emit('invalidated', { tag, count });
    
    return count;
  }
  
  /**
   * Invalidate cache entries by pattern
   * @param {RegExp} pattern - Pattern to match
   * @returns {number} Number of entries invalidated
   */
  invalidateByPattern(pattern) {
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        this.semanticIndex.delete(key);
        
        // Remove from tag index
        for (const [tag, keys] of this.tagIndex) {
          keys.delete(key);
        }
        
        count++;
      }
    }
    
    this.emit('invalidated', { pattern: pattern.toString(), count });
    
    return count;
  }
  
  /**
   * Invalidate specific key
   * @param {string} key - Key to invalidate
   * @returns {boolean}
   */
  invalidate(key) {
    const existed = this.cache.has(key);
    
    if (existed) {
      this.cache.delete(key);
      this.semanticIndex.delete(key);
      
      // Remove from tag index
      for (const [tag, keys] of this.tagIndex) {
        keys.delete(key);
      }
      
      this.emit('invalidated', { key });
    }
    
    return existed;
  }
  
  /**
   * Warm cache with entries
   * @param {Array<{request: Object, response: Object, options?: Object}>} entries - Entries to warm
   * @returns {number} Number of entries warmed
   */
  warm(entries) {
    let count = 0;
    
    for (const entry of entries) {
      try {
        this.set(entry.request, entry.response, entry.options || {});
        count++;
      } catch (error) {
        this.emit('warmError', { error: error.message });
      }
    }
    
    this.emit('warmed', { count });
    
    return count;
  }
  
  /**
   * Pre-fetch and cache responses
   * @param {Array<Object>} requests - Requests to pre-fetch
   * @param {Function} fetcher - Function to fetch responses
   * @param {Object} options - Pre-fetch options
   * @returns {Promise<number>} Number of entries cached
   */
  async prefetch(requests, fetcher, options = {}) {
    const ttl = options.ttl || this.config.defaultTTL;
    let count = 0;
    
    for (const request of requests) {
      try {
        // Skip if already cached
        if (this.get(request)) continue;
        
        const response = await fetcher(request);
        this.set(request, response, { ttl });
        count++;
        
        // Rate limiting between requests
        if (options.delay) {
          await new Promise(r => setTimeout(r, options.delay));
        }
      } catch (error) {
        this.emit('prefetchError', { request, error: error.message });
      }
    }
    
    this.emit('prefetchComplete', { count });
    
    return count;
  }
  
  /**
   * Get cache statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const cacheStats = this.cache.stats();
    
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      semanticHitRate: total > 0 ? this.stats.semanticHits / total : 0,
      size: cacheStats.size,
      maxSize: this.config.maxSize,
      tagCount: this.tagIndex.size,
      semanticIndexSize: this.semanticIndex.size
    };
  }
  
  /**
   * Get cache size
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }
  
  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.semanticIndex.clear();
    this.tagIndex.clear();
    
    this.emit('cleared');
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      semanticHits: 0,
      evictions: 0,
      totalRequests: 0
    };
  }
  
  /**
   * Shutdown the cache
   */
  async shutdown() {
    this.clear();
    this.resetStats();
    this.removeAllListeners();
    this.initialized = false;
  }
}

export default SemanticCache;
