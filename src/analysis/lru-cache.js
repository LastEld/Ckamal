/**
 * @fileoverview Generic LRU Cache implementation for embeddings and search results
 * @module analysis/lru-cache
 */

/**
 * LRU Cache entry metadata
 * @typedef {Object} CacheEntry
 * @property {*} value - Cached value
 * @property {number} lastAccessed - Timestamp of last access
 * @property {number} accessCount - Number of times accessed
 */

/**
 * Generic LRU (Least Recently Used) Cache implementation
 * Supports TTL, size limits, and access statistics
 */
export class LRUCache {
  /**
   * Creates a new LRU Cache instance
   * @param {Object} options - Cache configuration
   * @param {number} [options.maxSize=1000] - Maximum number of entries
   * @param {number} [options.ttlMs=0] - Time-to-live in milliseconds (0 = no expiry)
   * @param {Function} [options.onEvict] - Callback when entry is evicted
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.ttlMs = options.ttlMs ?? 0;
    this.onEvict = options.onEvict ?? null;

    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();
    /** @type {Map<string, number>} */
    this.accessStats = new Map();
    
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Generate a cache key from input
   * @param {*} key - Key to stringify
   * @returns {string} Stringified key
   */
  static generateKey(key) {
    if (typeof key === 'string') return key;
    if (typeof key === 'number') return String(key);
    if (key === null) return 'null';
    if (key === undefined) return 'undefined';
    return JSON.stringify(key);
  }

  /**
   * Get a value from cache
   * @param {*} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const stringKey = LRUCache.generateKey(key);
    const entry = this.cache.get(stringKey);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (this.ttlMs > 0 && Date.now() - entry.lastAccessed > this.ttlMs) {
      this.cache.delete(stringKey);
      this.misses++;
      return undefined;
    }

    // Update access metadata
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    
    // Move to end (most recently used)
    this.cache.delete(stringKey);
    this.cache.set(stringKey, entry);

    this.hits++;
    this.accessStats.set(stringKey, (this.accessStats.get(stringKey) ?? 0) + 1);
    
    return entry.value;
  }

  /**
   * Set a value in cache
   * @param {*} key - Cache key
   * @param {*} value - Value to cache
   * @param {Object} [options] - Set options
   * @param {number} [options.ttlMs] - Override TTL for this entry
   * @returns {boolean} True if set successfully
   */
  set(key, value, options = {}) {
    const stringKey = LRUCache.generateKey(key);
    const ttlMs = options.ttlMs ?? this.ttlMs;

    // Evict oldest if at capacity and key doesn't exist
    if (this.cache.size >= this.maxSize && !this.cache.has(stringKey)) {
      this._evictLRU();
    }

    const entry = {
      value,
      lastAccessed: Date.now(),
      accessCount: 1,
      ttlMs
    };

    this.cache.set(stringKey, entry);
    this.accessStats.set(stringKey, 1);
    
    return true;
  }

  /**
   * Check if key exists in cache (not expired)
   * @param {*} key - Cache key
   * @returns {boolean} True if exists and not expired
   */
  has(key) {
    const stringKey = LRUCache.generateKey(key);
    const entry = this.cache.get(stringKey);

    if (!entry) return false;

    if (this.ttlMs > 0 && Date.now() - entry.lastAccessed > this.ttlMs) {
      this.cache.delete(stringKey);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from cache
   * @param {*} key - Cache key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    const stringKey = LRUCache.generateKey(key);
    const existed = this.cache.has(stringKey);
    
    if (existed) {
      const entry = this.cache.get(stringKey);
      this.cache.delete(stringKey);
      this.accessStats.delete(stringKey);
      
      if (this.onEvict) {
        this.onEvict(stringKey, entry.value);
      }
    }
    
    return existed;
  }

  /**
   * Clear all cache entries
   * @param {boolean} [notify=false] - Whether to call onEvict for each entry
   */
  clear(notify = false) {
    if (notify && this.onEvict) {
      for (const [key, entry] of this.cache) {
        this.onEvict(key, entry.value);
      }
    }
    
    this.cache.clear();
    this.accessStats.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      evictions: this.evictions,
      ttlMs: this.ttlMs
    };
  }

  /**
   * Get most frequently accessed keys
   * @param {number} [limit=10] - Number of top entries to return
   * @returns {Array<{key: string, accesses: number}>}
   */
  getTopAccessed(limit = 10) {
    return Array.from(this.accessStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, accesses]) => ({ key, accesses }));
  }

  /**
   * Clean up expired entries
   * @returns {number} Number of entries removed
   */
  cleanup() {
    if (this.ttlMs <= 0) return 0;

    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.lastAccessed > this.ttlMs) {
        this.cache.delete(key);
        this.accessStats.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Evict least recently used entry
   * @private
   */
  _evictLRU() {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      const entry = this.cache.get(firstKey);
      this.cache.delete(firstKey);
      this.accessStats.delete(firstKey);
      this.evictions++;
      
      if (this.onEvict) {
        this.onEvict(firstKey, entry.value);
      }
    }
  }

  /**
   * Get all keys in cache (LRU order: oldest first)
   * @returns {string[]}
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values in cache (LRU order: oldest first)
   * @returns {Array<*>}
   */
  values() {
    return Array.from(this.cache.values()).map(e => e.value);
  }

  /**
   * Get number of entries
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }
}

export default LRUCache;
