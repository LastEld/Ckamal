/**
 * @fileoverview LRU Cache for router decisions with TTL support and cache warming.
 * Provides efficient caching with hit/miss statistics and pattern-based invalidation.
 * @module intelligence/router-cache
 */

/**
 * @typedef {Object} CacheEntry
 * @property {*} value - Cached value
 * @property {number} expiresAt - Expiration timestamp
 * @property {number} accessedAt - Last access timestamp
 * @property {number} accessCount - Number of accesses
 */

/**
 * @typedef {Object} CacheStats
 * @property {number} size - Current cache size
 * @property {number} maxSize - Maximum cache size
 * @property {number} hits - Cache hit count
 * @property {number} misses - Cache miss count
 * @property {number} evictions - Number of evictions
 * @property {number} expirations - Number of expired entries
 * @property {number} hitRate - Hit rate percentage
 * @property {number} avgEntryAge - Average entry age in ms
 */

/**
 * LRU Cache implementation with TTL support for router decisions.
 * @class
 */
export class RouterCache {
  /**
   * Creates an instance of RouterCache.
   * @param {Object} options - Cache configuration
   * @param {number} [options.maxSize=1000] - Maximum number of cached entries
   * @param {number} [options.defaultTTL=300000] - Default TTL in ms (5 minutes)
   * @param {boolean} [options.updateAccessOnGet=true] - Update access time on get
   * @param {Function} [options.onEvict] - Callback when entry is evicted
   * @param {Function} [options.onExpire] - Callback when entry expires
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 300000;
    this.updateAccessOnGet = options.updateAccessOnGet ?? true;
    this.onEvict = options.onEvict || null;
    this.onExpire = options.onExpire || null;
    
    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();
    
    /** @type {Map<string, number>} */
    this.accessOrder = new Map();
    
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      totalAccessTime: 0
    };
    
    this.accessCounter = 0;
    this.warmingEnabled = false;
    this.warmKeys = new Set();
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Gets a value from cache.
   * @param {string} key - Cache key
   * @returns {*} - Cached value or undefined if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.expirations++;
      if (this.onExpire) {
        this.onExpire(key, entry.value);
      }
      this.stats.misses++;
      return undefined;
    }
    
    // Update access tracking
    if (this.updateAccessOnGet) {
      entry.accessedAt = Date.now();
      entry.accessCount++;
      this.accessOrder.set(key, ++this.accessCounter);
    }
    
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Sets a value in cache.
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttl] - Time to live in ms (uses default if not specified)
   * @returns {boolean} - True if value was set
   */
  set(key, value, ttl) {
    const now = Date.now();
    const effectiveTTL = ttl ?? this.defaultTTL;
    
    // Evict entries if at capacity and adding new
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    const entry = {
      value,
      expiresAt: now + effectiveTTL,
      accessedAt: now,
      accessCount: 1
    };
    
    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
    
    return true;
  }

  /**
   * Checks if key exists in cache and is not expired.
   * @param {string} key - Cache key
   * @returns {boolean} - True if key exists and is valid
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Deletes a key from cache.
   * @param {string} key - Cache key
   * @returns {boolean} - True if key was deleted
   */
  delete(key) {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    this.accessOrder.delete(key);
    return existed;
  }

  /**
   * Invalidates cache entries matching a pattern.
   * Supports glob-style patterns with * and ? wildcards.
   * @param {string} pattern - Pattern to match (* = any chars, ? = single char)
   * @returns {number} - Number of entries invalidated
   */
  invalidate(pattern) {
    const regex = this.patternToRegex(pattern);
    const keysToDelete = [];
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.delete(key);
    }
    
    return keysToDelete.length;
  }

  /**
   * Converts glob pattern to regex.
   * @param {string} pattern - Glob pattern
   * @returns {RegExp} - Equivalent regex
   * @private
   */
  patternToRegex(pattern) {
    // Escape special regex characters except * and ?
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Evicts least recently used entry.
   * @private
   */
  evictLRU() {
    if (this.cache.size === 0) return;
    
    let oldestKey = null;
    let oldestAccess = Infinity;
    
    for (const [key, accessNum] of this.accessOrder) {
      if (accessNum < oldestAccess) {
        oldestAccess = accessNum;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      this.delete(oldestKey);
      this.stats.evictions++;
      
      if (this.onEvict) {
        this.onEvict(oldestKey, entry?.value);
      }
    }
  }

  /**
   * Cleans up expired entries.
   * @returns {number} - Number of entries cleaned up
   */
  cleanup() {
    const now = Date.now();
    const expired = [];
    
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        expired.push(key);
      }
    }
    
    for (const key of expired) {
      const entry = this.cache.get(key);
      this.delete(key);
      this.stats.expirations++;
      
      if (this.onExpire) {
        this.onExpire(key, entry?.value);
      }
    }
    
    return expired.length;
  }

  /**
   * Warms the cache with pre-computed values.
   * @param {Array<{key: string, value: *, ttl?: number}>} entries - Entries to warm
   * @returns {number} - Number of entries warmed
   */
  warm(entries) {
    let warmed = 0;
    
    for (const { key, value, ttl } of entries) {
      if (!this.has(key)) {
        this.set(key, value, ttl);
        this.warmKeys.add(key);
        warmed++;
      }
    }
    
    this.warmingEnabled = true;
    return warmed;
  }

  /**
   * Refreshes warmed cache entries.
   * @param {Function} fetcher - Function to fetch new values: (key) => Promise<{value, ttl}>
   * @returns {Promise<number>} - Number of entries refreshed
   */
  async refreshWarmed(fetcher) {
    if (!this.warmingEnabled || this.warmKeys.size === 0) {
      return 0;
    }
    
    let refreshed = 0;
    
    for (const key of this.warmKeys) {
      try {
        const result = await fetcher(key);
        if (result) {
          this.set(key, result.value, result.ttl);
          refreshed++;
        }
      } catch (error) {
        // Keep old value on error, but it may expire naturally
      }
    }
    
    return refreshed;
  }

  /**
   * Adds keys to the warm list without setting values.
   * @param {string[]} keys - Keys to add to warm list
   * @returns {void}
   */
  addWarmKeys(keys) {
    for (const key of keys) {
      this.warmKeys.add(key);
    }
    this.warmingEnabled = true;
  }

  /**
   * Removes keys from the warm list.
   * @param {string[]} keys - Keys to remove
   * @returns {void}
   */
  removeWarmKeys(keys) {
    for (const key of keys) {
      this.warmKeys.delete(key);
    }
  }

  /**
   * Gets current cache statistics.
   * @returns {CacheStats} - Cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    let totalAge = 0;
    const now = Date.now();
    for (const entry of this.cache.values()) {
      totalAge += now - entry.accessedAt;
    }
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations,
      hitRate: Math.round(hitRate * 100) / 100,
      avgEntryAge: this.cache.size > 0 ? Math.round(totalAge / this.cache.size) : 0,
      warmKeys: this.warmKeys.size
    };
  }

  /**
   * Resets cache statistics.
   * @returns {void}
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      totalAccessTime: 0
    };
  }

  /**
   * Clears all cache entries.
   * @returns {void}
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.warmKeys.clear();
  }

  /**
   * Gets all keys in cache (including potentially expired).
   * @returns {string[]} - Array of keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Gets cache entries with their metadata.
   * @returns {Array<{key: string, entry: CacheEntry}>} - Entries with metadata
   */
  entries() {
    const result = [];
    for (const [key, entry] of this.cache) {
      result.push({ key, entry });
    }
    return result;
  }

  /**
   * Gets the TTL remaining for a key.
   * @param {string} key - Cache key
   * @returns {number} - Remaining TTL in ms, -1 if not found or expired
   */
  getTTL(key) {
    const entry = this.cache.get(key);
    if (!entry) return -1;
    
    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : -1;
  }

  /**
   * Updates TTL for an existing key.
   * @param {string} key - Cache key
   * @param {number} ttl - New TTL in ms
   * @returns {boolean} - True if TTL was updated
   */
  updateTTL(key, ttl) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    entry.expiresAt = Date.now() + ttl;
    return true;
  }

  /**
   * Disposes the cache and cleans up resources.
   * @returns {void}
   */
  dispose() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

export default RouterCache;
