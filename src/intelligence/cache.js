/**
 * Intelligent Cache - Semantic caching with similarity search
 * @module intelligence/cache
 */

/**
 * Cache entry metadata
 * @typedef {Object} CacheMetadata
 * @property {number} timestamp - When entry was cached
 * @property {number} accessCount - Number of accesses
 * @property {number} lastAccess - Last access timestamp
 * @property {number} ttl - Time to live in milliseconds
 * @property {string[]} tags - Associated tags
 * @property {number} priority - Entry priority (0-1)
 * @property {Object} semanticVector - Semantic embedding vector
 */

/**
 * Cache entry
 * @typedef {Object} CacheEntry
 * @property {*} value - Cached value
 * @property {CacheMetadata} metadata - Entry metadata
 */

/**
 * Search result
 * @typedef {Object} SearchResult
 * @property {string} key - Cache key
 * @property {*} value - Cached value
 * @property {number} similarity - Similarity score (0-1)
 * @property {CacheMetadata} metadata - Entry metadata
 */

/**
 * Intelligent Cache with semantic matching capabilities
 */
export class IntelligentCache {
  /**
   * Create an Intelligent Cache
   * @param {Object} options - Configuration options
   * @param {number} options.maxSize - Maximum number of entries
   * @param {number} options.defaultTTL - Default time to live in ms
   * @param {number} options.similarityThreshold - Semantic match threshold (0-1)
   * @param {boolean} options.enableSemanticSearch - Enable semantic search
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 3600000; // 1 hour
    this.similarityThreshold = options.similarityThreshold ?? 0.85;
    this.enableSemanticSearch = options.enableSemanticSearch ?? true;
    
    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();
    
    /** @type {Map<string, number[]>} */
    this.semanticIndex = new Map();
    
    this.stats = {
      hits: 0,
      misses: 0,
      semanticHits: 0,
      evictions: 0
    };
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this.cleanupInterval.unref?.();
  }

  /**
   * Get value from cache with semantic matching
   * @param {string} key - Cache key
   * @param {Object} options - Get options
   * @param {boolean} options.semantic - Allow semantic matching
   * @returns {*|null} Cached value or null if not found
   */
  get(key, options = {}) {
    const allowSemantic = options.semantic ?? this.enableSemanticSearch;
    
    // Direct match
    const entry = this.cache.get(key);
    if (entry && !this.isExpired(entry)) {
      this.updateAccessStats(entry);
      this.stats.hits++;
      return entry.value;
    }
    
    if (entry && this.isExpired(entry)) {
      this.cache.delete(key);
      this.semanticIndex.delete(key);
    }
    
    // Semantic match
    if (allowSemantic) {
      const semanticMatch = this.findSemanticMatch(key);
      if (semanticMatch) {
        this.stats.semanticHits++;
        this.updateAccessStats(this.cache.get(semanticMatch.key));
        return semanticMatch.value;
      }
    }
    
    this.stats.misses++;
    return null;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {Partial<CacheMetadata>} [metadata] - Entry metadata
   * @returns {boolean} Success status
   */
  set(key, value, metadata = {}) {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    const now = Date.now();
    const entry = {
      value,
      metadata: {
        timestamp: now,
        accessCount: 0,
        lastAccess: now,
        ttl: metadata.ttl || this.defaultTTL,
        tags: metadata.tags || [],
        priority: metadata.priority ?? 0.5,
        semanticVector: metadata.semanticVector || this.computeSemanticVector(key)
      }
    };
    
    this.cache.set(key, entry);
    
    if (this.enableSemanticSearch && entry.metadata.semanticVector) {
      this.semanticIndex.set(key, entry.metadata.semanticVector);
    }
    
    return true;
  }

  /**
   * Semantic search within cache
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.limit - Maximum results
   * @param {number} options.threshold - Minimum similarity threshold
   * @param {string[]} [options.tags] - Filter by tags
   * @returns {SearchResult[]} Search results sorted by similarity
   */
  semanticSearch(query, options = {}) {
    const limit = options.limit || 10;
    const threshold = options.threshold ?? this.similarityThreshold;
    const tags = options.tags || [];
    
    const queryVector = this.computeSemanticVector(query);
    const results = [];
    
    for (const [key, entry] of this.cache) {
      // Skip expired entries
      if (this.isExpired(entry)) continue;
      
      // Tag filter
      if (tags.length > 0 && !tags.some(t => entry.metadata.tags.includes(t))) {
        continue;
      }
      
      const similarity = this.calculateSimilarity(
        queryVector,
        entry.metadata.semanticVector
      );
      
      if (similarity >= threshold) {
        results.push({
          key,
          value: entry.value,
          similarity,
          metadata: entry.metadata
        });
      }
    }
    
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} Whether key exists and is not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.semanticIndex.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete entry from cache
   * @param {string} key - Cache key
   * @returns {boolean} Whether entry was deleted
   */
  delete(key) {
    this.semanticIndex.delete(key);
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.semanticIndex.clear();
    this.stats = { hits: 0, misses: 0, semanticHits: 0, evictions: 0 };
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      semanticHitRate: total > 0 ? this.stats.semanticHits / total : 0,
      utilization: this.cache.size / this.maxSize
    };
  }

  /**
   * Get entries by tag
   * @param {string} tag - Tag to filter by
   * @returns {Array<{key: string, value: *, metadata: CacheMetadata}>} Matching entries
   */
  getByTag(tag) {
    const results = [];
    for (const [key, entry] of this.cache) {
      if (!this.isExpired(entry) && entry.metadata.tags.includes(tag)) {
        results.push({ key, value: entry.value, metadata: entry.metadata });
      }
    }
    return results;
  }

  /**
   * Invalidate entries by tag
   * @param {string} tag - Tag to invalidate
   * @returns {number} Number of entries invalidated
   */
  invalidateByTag(tag) {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.metadata.tags.includes(tag)) {
        this.cache.delete(key);
        this.semanticIndex.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Preload values into cache
   * @param {Array<{key: string, value: *, metadata?: Object}>} entries - Entries to preload
   */
  preload(entries) {
    for (const { key, value, metadata } of entries) {
      this.set(key, value, metadata);
    }
  }

  /**
   * Find semantically similar cached key
   * @private
   * @param {string} key - Query key
   * @returns {SearchResult|null} Best semantic match
   */
  findSemanticMatch(key) {
    const queryVector = this.computeSemanticVector(key);
    let bestMatch = null;
    let bestSimilarity = 0;
    
    for (const [cachedKey, entry] of this.cache) {
      if (this.isExpired(entry)) continue;
      
      const similarity = this.calculateSimilarity(
        queryVector,
        entry.metadata.semanticVector
      );
      
      if (similarity > bestSimilarity && similarity >= this.similarityThreshold) {
        bestSimilarity = similarity;
        bestMatch = { key: cachedKey, value: entry.value, similarity, metadata: entry.metadata };
      }
    }
    
    return bestMatch;
  }

  /**
   * Compute simple semantic vector from text
   * @private
   * @param {string} text - Input text
   * @returns {number[]} Semantic vector
   */
  computeSemanticVector(text) {
    // Simple bag-of-words with n-grams
    const vector = new Array(128).fill(0);
    const tokens = this.tokenize(text);
    
    for (const token of tokens) {
      const hash = this.hashString(token);
      for (let i = 0; i < 128; i++) {
        // Use multiple hash positions for better distribution
        const pos = (hash + i * 31) % 128;
        vector[pos] += 1 / tokens.length;
      }
    }
    
    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return norm > 0 ? vector.map(v => v / norm) : vector;
  }

  /**
   * Calculate cosine similarity between vectors
   * @private
   * @param {number[]} v1 - First vector
   * @param {number[]} v2 - Second vector
   * @returns {number} Cosine similarity
   */
  calculateSimilarity(v1, v2) {
    if (!v1 || !v2 || v1.length !== v2.length) return 0;
    
    let dotProduct = 0;
    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
    }
    
    return dotProduct; // Vectors are already normalized
  }

  /**
   * Tokenize text
   * @private
   * @param {string} text - Text to tokenize
   * @returns {string[]} Tokens
   */
  tokenize(text) {
    if (typeof text !== 'string') {
      text = JSON.stringify(text);
    }
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  /**
   * Simple hash function for strings
   * @private
   * @param {string} str - String to hash
   * @returns {number} Hash value
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Check if entry is expired
   * @private
   * @param {CacheEntry} entry - Cache entry
   * @returns {boolean} Whether expired
   */
  isExpired(entry) {
    const age = Date.now() - entry.metadata.timestamp;
    return age > entry.metadata.ttl;
  }

  /**
   * Update access statistics
   * @private
   * @param {CacheEntry} entry - Cache entry
   */
  updateAccessStats(entry) {
    entry.metadata.accessCount++;
    entry.metadata.lastAccess = Date.now();
  }

  /**
   * Evict least recently used entry
   * @private
   */
  evictLRU() {
    let lruKey = null;
    let lruTime = Infinity;
    let lowestPriority = Infinity;
    
    for (const [key, entry] of this.cache) {
      const score = entry.metadata.lastAccess / entry.metadata.priority;
      if (score < lruTime) {
        lruTime = score;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
      this.semanticIndex.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * Clean up expired entries
   * @private
   */
  cleanup() {
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.semanticIndex.delete(key);
      }
    }
  }

  /**
   * Dispose cache and stop cleanup interval
   */
  dispose() {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

export default IntelligentCache;
