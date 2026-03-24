/**
 * Caching Utilities
 * LRU Cache with TTL support, multi-tier caching, and cache warming
 * @module utils/cache
 */

const DEFAULT_TTL = 60 * 1000; // 60 seconds
const DEFAULT_MAX_SIZE = 1000;

// ============================================================================
// LRU Cache Implementation
// ============================================================================

/**
 * LRU (Least Recently Used) Cache Node
 * @private
 */
class LRUNode {
    constructor(key, value) {
        this.key = key;
        this.value = value;
        this.prev = null;
        this.next = null;
        this.timestamp = Date.now();
    }
}

/**
 * LRU (Least Recently Used) Cache with TTL support
 */
export class LRUCache {
    /**
     * Create a new LRUCache
     * @param {object} options - Configuration options
     * @param {number} options.maxSize - Maximum number of entries (default: 1000)
     * @param {number} options.ttl - Time-to-live in milliseconds (default: 60000)
     * @param {Function} options.onEvict - Callback when entry is evicted
     * @param {boolean} options.updateAgeOnGet - Update age on get (default: true)
     */
    constructor(options = {}) {
        this.maxSize = options.maxSize || DEFAULT_MAX_SIZE;
        this.defaultTtl = options.ttl || DEFAULT_TTL;
        this.onEvict = options.onEvict || null;
        this.updateAgeOnGet = options.updateAgeOnGet !== false;
        
        this._cache = new Map();
        this._head = null;
        this._tail = null;
        this._size = 0;
        
        // Statistics
        this._hits = 0;
        this._misses = 0;
        this._sets = 0;
        this._deletes = 0;
        this._evictions = 0;
    }

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {any} Cached value or undefined if not found/expired
     */
    get(key) {
        const node = this._cache.get(key);
        
        if (!node) {
            this._misses++;
            return undefined;
        }

        // Check if expired
        if (this._isExpired(node)) {
            this._removeNode(node);
            this._cache.delete(key);
            this._triggerEviction(node.key, node.value, "expired");
            this._misses++;
            return undefined;
        }

        // Move to front (most recently used)
        this._moveToFront(node);
        
        if (this.updateAgeOnGet) {
            node.timestamp = Date.now();
        }
        
        this._hits++;
        return node.value;
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - TTL in milliseconds (optional, uses default if not set)
     * @returns {LRUCache} this for chaining
     */
    set(key, value, ttl = null) {
        const node = this._cache.get(key);

        // Update existing entry
        if (node) {
            node.value = value;
            node.timestamp = Date.now();
            node.ttl = ttl !== null ? ttl : this.defaultTtl;
            this._moveToFront(node);
            return this;
        }

        // Evict oldest entries if at capacity
        while (this._size >= this.maxSize) {
            this._evictLRU();
        }

        // Add new entry
        const newNode = new LRUNode(key, value);
        newNode.ttl = ttl !== null ? ttl : this.defaultTtl;
        this._addToFront(newNode);
        this._cache.set(key, newNode);
        this._sets++;

        return this;
    }

    /**
     * Check if key exists in cache (and not expired)
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        const node = this._cache.get(key);
        
        if (!node) {
            return false;
        }

        if (this._isExpired(node)) {
            this._removeNode(node);
            this._cache.delete(key);
            this._triggerEviction(node.key, node.value, "expired");
            return false;
        }

        return true;
    }

    /**
     * Peek at value without updating LRU order
     * @param {string} key - Cache key
     * @returns {any} Cached value or undefined
     */
    peek(key) {
        const node = this._cache.get(key);
        
        if (!node || this._isExpired(node)) {
            return undefined;
        }

        return node.value;
    }

    /**
     * Delete entry from cache
     * @param {string} key - Cache key
     * @returns {boolean} True if deleted, false if not found
     */
    delete(key) {
        const node = this._cache.get(key);
        
        if (node) {
            this._removeNode(node);
            this._cache.delete(key);
            this._deletes++;
            return true;
        }

        return false;
    }

    /**
     * Clear all entries from cache
     * @returns {LRUCache} this for chaining
     */
    clear() {
        if (this.onEvict) {
            let node = this._tail;
            while (node) {
                this._triggerEviction(node.key, node.value, "clear");
                node = node.prev;
            }
        }

        this._cache.clear();
        this._head = null;
        this._tail = null;
        this._size = 0;
        this._hits = 0;
        this._misses = 0;
        this._sets = 0;
        this._deletes = 0;
        this._evictions = 0;

        return this;
    }

    /**
     * Get all cache keys (non-expired only)
     * @returns {Array<string>}
     */
    keys() {
        this._cleanupExpired();
        const keys = [];
        let node = this._head;
        while (node) {
            keys.push(node.key);
            node = node.next;
        }
        return keys;
    }

    /**
     * Get all cache values (non-expired only)
     * @returns {Array<any>}
     */
    values() {
        this._cleanupExpired();
        const values = [];
        let node = this._head;
        while (node) {
            values.push(node.value);
            node = node.next;
        }
        return values;
    }

    /**
     * Get all cache entries (non-expired only)
     * @returns {Array<[string, any]>}
     */
    entries() {
        this._cleanupExpired();
        const entries = [];
        let node = this._head;
        while (node) {
            entries.push([node.key, node.value]);
            node = node.next;
        }
        return entries;
    }

    /**
     * Get current cache size
     * @returns {number}
     */
    get size() {
        return this._size;
    }

    /**
     * Get cache statistics
     * @returns {object} Stats object
     */
    stats() {
        const total = this._hits + this._misses;
        return {
            size: this._size,
            maxSize: this.maxSize,
            defaultTtl: this.defaultTtl,
            hitRate: total > 0 ? this._hits / total : 0,
            hits: this._hits,
            misses: this._misses,
            sets: this._sets,
            deletes: this._deletes,
            evictions: this._evictions,
            total
        };
    }

    /**
     * Reset statistics
     * @returns {LRUCache} this for chaining
     */
    resetStats() {
        this._hits = 0;
        this._misses = 0;
        this._sets = 0;
        this._deletes = 0;
        this._evictions = 0;
        return this;
    }

    /**
     * Get or compute value
     * @param {string} key - Cache key
     * @param {Function} factory - Factory function to create value
     * @param {number} ttl - TTL in milliseconds
     * @returns {Promise<any>} Cached or computed value
     */
    async getOrSet(key, factory, ttl = null) {
        const cached = this.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const value = await factory();
        this.set(key, value, ttl);
        return value;
    }

    /**
     * Invalidate entries matching a pattern
     * @param {RegExp} pattern - Pattern to match keys
     * @returns {number} Number of entries invalidated
     */
    invalidatePattern(pattern) {
        let count = 0;
        
        for (const key of this._cache.keys()) {
            if (pattern.test(key)) {
                this.delete(key);
                count++;
            }
        }

        return count;
    }

    /**
     * Invalidate entries by prefix
     * @param {string} prefix - Key prefix
     * @returns {number} Number of entries invalidated
     */
    invalidatePrefix(prefix) {
        return this.invalidatePattern(new RegExp(`^${prefix}`));
    }

    /**
     * Invalidate entries by tag
     * @param {string} tag - Tag to invalidate
     * @returns {number} Number of entries invalidated
     */
    invalidateTag(tag) {
        let count = 0;
        
        for (const [key, node] of this._cache.entries()) {
            const value = node.value;
            if (value && typeof value === "object" && value._cacheTags?.includes(tag)) {
                this.delete(key);
                count++;
            }
        }

        return count;
    }

    /**
     * Set with tags for later invalidation
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {object} options - Options including ttl and tags
     * @returns {LRUCache} this for chaining
     */
    setWithTags(key, value, options = {}) {
        const { ttl = null, tags = [] } = options;
        const taggedValue = { ...value, _cacheTags: tags };
        this.set(key, taggedValue, ttl);
        return this;
    }

    /**
     * Warm the cache with multiple entries
     * @param {Array<{key: string, value: any, ttl?: number}>} entries - Entries to add
     * @returns {LRUCache} this for chaining
     */
    warm(entries) {
        for (const entry of entries) {
            this.set(entry.key, entry.value, entry.ttl);
        }
        return this;
    }

    /**
     * Pre-fetch values into cache
     * @param {Array<string>} keys - Keys to fetch
     * @param {Function} fetcher - Function to fetch values
     * @param {number} ttl - TTL for fetched values
     * @returns {Promise<LRUCache>} this for chaining
     */
    async prefetch(keys, fetcher, ttl = null) {
        const results = await Promise.allSettled(
            keys.map(async key => {
                if (!this.has(key)) {
                    const value = await fetcher(key);
                    this.set(key, value, ttl);
                }
            })
        );
        
        return this;
    }

    // Private methods

    /**
     * Check if node is expired
     * @private
     * @param {LRUNode} node - Node to check
     * @returns {boolean}
     */
    _isExpired(node) {
        const ttl = node.ttl !== undefined ? node.ttl : this.defaultTtl;
        return Date.now() - node.timestamp > ttl;
    }

    /**
     * Add node to front of list
     * @private
     * @param {LRUNode} node - Node to add
     */
    _addToFront(node) {
        node.next = this._head;
        node.prev = null;
        
        if (this._head) {
            this._head.prev = node;
        }
        
        this._head = node;
        
        if (!this._tail) {
            this._tail = node;
        }
        
        this._size++;
    }

    /**
     * Remove node from list
     * @private
     * @param {LRUNode} node - Node to remove
     */
    _removeNode(node) {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this._head = node.next;
        }

        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this._tail = node.prev;
        }

        node.prev = null;
        node.next = null;
        this._size--;
    }

    /**
     * Move node to front of list
     * @private
     * @param {LRUNode} node - Node to move
     */
    _moveToFront(node) {
        if (node === this._head) {
            return;
        }
        
        this._removeNode(node);
        this._addToFront(node);
    }

    /**
     * Evict least recently used entry
     * @private
     */
    _evictLRU() {
        if (!this._tail) {
            return;
        }

        const node = this._tail;
        this._removeNode(node);
        this._cache.delete(node.key);
        this._evictions++;
        this._triggerEviction(node.key, node.value, "lru");
    }

    /**
     * Trigger eviction callback
     * @private
     * @param {string} key - Evicted key
     * @param {any} value - Evicted value
     * @param {string} reason - Eviction reason
     */
    _triggerEviction(key, value, reason) {
        if (this.onEvict) {
            try {
                this.onEvict(key, value, reason);
            } catch {
                // Ignore callback errors
            }
        }
    }

    /**
     * Clean up expired entries
     * @private
     */
    _cleanupExpired() {
        const now = Date.now();
        let node = this._tail;
        
        while (node) {
            const prev = node.prev;
            const ttl = node.ttl !== undefined ? node.ttl : this.defaultTtl;
            
            if (now - node.timestamp > ttl) {
                this._removeNode(node);
                this._cache.delete(node.key);
                this._triggerEviction(node.key, node.value, "expired");
            }
            
            node = prev;
        }
    }
}

// ============================================================================
// Legacy Cache class (alias for LRUCache)
// ============================================================================

/**
 * Cache class (alias for LRUCache for backward compatibility)
 */
export class Cache extends LRUCache {}

// ============================================================================
// Cached Function Wrapper
// ============================================================================

/**
 * Create a cached wrapper for async functions
 * @param {Function} fn - Async function to wrap
 * @param {object} options - Cache options
 * @param {Function} options.keyFn - Function to generate cache key
 * @param {number} options.ttl - TTL in milliseconds
 * @param {number} options.maxSize - Maximum cache size
 * @returns {Function} Cached function with cache property
 */
export function cached(fn, options = {}) {
    const cache = new LRUCache(options);
    
    const keyFn = options.keyFn || ((...args) => JSON.stringify(args));

    async function cachedFn(...args) {
        const key = keyFn(...args);
        
        const cached = cache.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const result = await fn(...args);
        cache.set(key, result, options.ttl);
        return result;
    }

    // Expose cache for external operations
    cachedFn.cache = cache;
    cachedFn.invalidate = (...args) => {
        const key = keyFn(...args);
        return cache.delete(key);
    };
    cachedFn.invalidateAll = () => cache.clear();

    return cachedFn;
}

// ============================================================================
// Multi-tier Cache
// ============================================================================

/**
 * Multi-tier cache (L1 memory + L2 memory + optional persistent layer)
 * Provides fast L1 access, larger L2 storage, and persistent backing
 */
export class MultiTierCache {
    /**
     * Create a new MultiTierCache
     * @param {object} options - Configuration options
     * @param {number} options.l1Size - L1 cache size (default: 100)
     * @param {number} options.l2Size - L2 cache size (default: 1000)
     * @param {number} options.l1Ttl - L1 TTL in milliseconds
     * @param {number} options.l2Ttl - L2 TTL in milliseconds
     * @param {object} options.persistent - Persistent cache instance
     */
    constructor(options = {}) {
        this.l1 = new LRUCache({ 
            maxSize: options.l1Size || 100,
            ttl: options.l1Ttl || 5000
        });
        this.l2 = new LRUCache({ 
            maxSize: options.l2Size || 1000,
            ttl: options.l2Ttl || 60000
        });
        this.persistent = options.persistent || null;
        this.stats = {
            l1Hits: 0,
            l2Hits: 0,
            persistentHits: 0,
            misses: 0
        };
    }

    /**
     * Get value from cache (tries L1 -> L2 -> Persistent)
     * @param {string} key - Cache key
     * @returns {Promise<any>} Cached value or undefined
     */
    async get(key) {
        // Try L1
        let value = this.l1.get(key);
        if (value !== undefined) {
            this.stats.l1Hits++;
            return value;
        }

        // Try L2
        value = this.l2.get(key);
        if (value !== undefined) {
            this.stats.l2Hits++;
            // Promote to L1
            this.l1.set(key, value);
            return value;
        }

        // Try persistent
        if (this.persistent) {
            value = await this.persistent.get(key);
            if (value !== undefined) {
                this.stats.persistentHits++;
                this.l2.set(key, value);
                this.l1.set(key, value);
                return value;
            }
        }

        this.stats.misses++;
        return undefined;
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {object} options - Options for each tier
     * @param {boolean} options.l1 - Store in L1 (default: true)
     * @param {boolean} options.l2 - Store in L2 (default: true)
     * @param {boolean} options.persistent - Store in persistent (default: true)
     * @param {number} options.l1Ttl - L1 TTL
     * @param {number} options.l2Ttl - L2 TTL
     * @param {number} options.persistentTtl - Persistent TTL
     * @returns {Promise<void>}
     */
    async set(key, value, options = {}) {
        const { l1 = true, l2 = true, persistent = true } = options;
        
        if (l1) this.l1.set(key, value, options.l1Ttl);
        if (l2) this.l2.set(key, value, options.l2Ttl);
        if (persistent && this.persistent) {
            await this.persistent.set(key, value, options.persistentTtl);
        }
    }

    /**
     * Delete value from all cache tiers
     * @param {string} key - Cache key
     * @returns {Promise<void>}
     */
    async delete(key) {
        this.l1.delete(key);
        this.l2.delete(key);
        if (this.persistent) {
            await this.persistent.delete(key);
        }
    }

    /**
     * Clear all cache tiers
     * @returns {Promise<void>}
     */
    async clear() {
        this.l1.clear();
        this.l2.clear();
        if (this.persistent) {
            await this.persistent.clear();
        }
    }

    /**
     * Warm cache with multiple entries
     * @param {Array<{key: string, value: any, tier?: string}>} entries - Entries to warm
     * @returns {Promise<void>}
     */
    async warm(entries) {
        for (const entry of entries) {
            const { key, value, tier = "l2" } = entry;
            
            switch (tier) {
                case "l1":
                    this.l1.set(key, value);
                    break;
                case "l2":
                    this.l2.set(key, value);
                    break;
                case "persistent":
                    if (this.persistent) {
                        await this.persistent.set(key, value);
                    }
                    break;
                case "all":
                    this.l1.set(key, value);
                    this.l2.set(key, value);
                    if (this.persistent) {
                        await this.persistent.set(key, value);
                    }
                    break;
            }
        }
    }

    /**
     * Get cache statistics
     * @returns {object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            l1: this.l1.stats(),
            l2: this.l2.stats(),
            totalHits: this.stats.l1Hits + this.stats.l2Hits + this.stats.persistentHits,
            hitRate: this._calculateHitRate()
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            l1Hits: 0,
            l2Hits: 0,
            persistentHits: 0,
            misses: 0
        };
        this.l1.resetStats();
        this.l2.resetStats();
    }

    /**
     * Calculate hit rate
     * @private
     * @returns {number}
     */
    _calculateHitRate() {
        const total = this.stats.l1Hits + this.stats.l2Hits + 
                      this.stats.persistentHits + this.stats.misses;
        return total > 0 ? (total - this.stats.misses) / total : 0;
    }
}

// ============================================================================
// Cache Warmer
// ============================================================================

/**
 * Cache Warmer for pre-populating cache
 */
export class CacheWarmer {
    /**
     * Create a new CacheWarmer
     * @param {LRUCache|MultiTierCache} cache - Cache instance to warm
     * @param {object} options - Configuration options
     */
    constructor(cache, options = {}) {
        this.cache = cache;
        this.batchSize = options.batchSize || 10;
        this.interval = options.interval || 1000;
        this.retryAttempts = options.retryAttempts || 3;
    }

    /**
     * Warm cache with data from a fetcher function
     * @param {Function} fetcher - Function that returns array of {key, value, ttl?} objects
     * @param {object} options - Warm options
     * @param {boolean} options.async - Whether to warm asynchronously (default: true)
     * @returns {Promise<number>|number} Number of entries warmed
     */
    async warm(fetcher, options = {}) {
        const { async = true } = options;
        
        try {
            const entries = await fetcher();
            
            if (!Array.isArray(entries)) {
                throw new Error("Fetcher must return an array of entries");
            }

            if (async) {
                // Warm in background batches
                this._warmInBatches(entries);
                return entries.length;
            } else {
                // Warm synchronously
                return this._warmSync(entries);
            }
        } catch (error) {
            console.error("Cache warm failed:", error);
            return 0;
        }
    }

    /**
     * Warm cache synchronously
     * @private
     * @param {Array} entries - Entries to warm
     * @returns {number} Number of entries warmed
     */
    _warmSync(entries) {
        let count = 0;
        
        for (const entry of entries) {
            try {
                if (this.cache instanceof MultiTierCache) {
                    this.cache.set(entry.key, entry.value, { 
                        l1: entry.tier === "l1" || entry.tier === "all",
                        l2: entry.tier !== "l1" && entry.tier !== "persistent"
                    });
                } else {
                    this.cache.set(entry.key, entry.value, entry.ttl);
                }
                count++;
            } catch (error) {
                console.error(`Failed to warm entry ${entry.key}:`, error);
            }
        }
        
        return count;
    }

    /**
     * Warm cache in batches
     * @private
     * @param {Array} entries - Entries to warm
     */
    async _warmInBatches(entries) {
        for (let i = 0; i < entries.length; i += this.batchSize) {
            const batch = entries.slice(i, i + this.batchSize);
            
            await Promise.allSettled(
                batch.map(entry => this._warmEntry(entry))
            );
            
            // Wait between batches
            if (i + this.batchSize < entries.length) {
                await new Promise(resolve => setTimeout(resolve, this.interval));
            }
        }
    }

    /**
     * Warm a single entry with retry
     * @private
     * @param {object} entry - Entry to warm
     */
    async _warmEntry(entry) {
        for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
            try {
                if (this.cache instanceof MultiTierCache) {
                    await this.cache.set(entry.key, entry.value, {
                        l1: entry.tier === "l1" || entry.tier === "all",
                        l2: entry.tier !== "l1" && entry.tier !== "persistent"
                    });
                } else {
                    this.cache.set(entry.key, entry.value, entry.ttl);
                }
                return;
            } catch (error) {
                if (attempt === this.retryAttempts - 1) {
                    console.error(`Failed to warm entry ${entry.key} after ${this.retryAttempts} attempts`);
                }
                await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
            }
        }
    }
}

// ============================================================================
// Global cache instance
// ============================================================================

export const globalCache = new LRUCache({ maxSize: 5000 });

// ============================================================================
// Default export
// ============================================================================

export default {
    LRUCache,
    Cache,
    MultiTierCache,
    CacheWarmer,
    cached,
    globalCache
};
