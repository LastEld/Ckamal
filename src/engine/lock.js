/**
 * @fileoverview Distributed Lock Manager for GSD Infrastructure
 * @module gsd/lock
 */

/**
 * Lock entry in the lock store
 * @typedef {Object} LockEntry
 * @property {string} owner - Lock owner identifier
 * @property {number} expiry - Expiry timestamp (ms)
 * @property {number} count - Reentrancy count
 * @property {number} [timeoutId] - Timer for auto-expiry
 */

/**
 * Distributed Lock Manager with Redis-compatible interface
 * Supports auto-expiry and reentrant locks
 */
export class LockManager {
  /**
   * Create a LockManager instance
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.store] - External store (Redis-compatible)
   * @param {Function} [options.onExpire] - Callback when lock expires
   * @param {Function} [options.onRelease] - Callback when lock is released
   */
  constructor(options = {}) {
    this.store = options.store || new Map();
    this.timers = new Map();
    this.onExpire = options.onExpire || (() => {});
    this.onRelease = options.onRelease || (() => {});
    this.isExternalStore = !!options.store;
  }

  /**
   * Generate a unique owner identifier
   * @returns {string} Unique owner ID
   * @private
   */
  _generateOwnerId() {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Calculate expiry timestamp
   * @param {number} ttl - Time to live in milliseconds
   * @returns {number} Expiry timestamp
   * @private
   */
  _calculateExpiry(ttl) {
    return Date.now() + ttl;
  }

  /**
   * Set up auto-expiry timer for a lock
   * @param {string} resource - Resource identifier
   * @param {number} ttl - Time to live in milliseconds
   * @private
   */
  _setupExpiryTimer(resource, ttl) {
    this._clearExpiryTimer(resource);
    const timeoutId = setTimeout(() => {
      this._handleExpiry(resource);
    }, ttl);
    this.timers.set(resource, timeoutId);
  }

  /**
   * Clear expiry timer for a resource
   * @param {string} resource - Resource identifier
   * @private
   */
  _clearExpiryTimer(resource) {
    const timer = this.timers.get(resource);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(resource);
    }
  }

  /**
   * Handle lock expiration
   * @param {string} resource - Resource identifier
   * @private
   */
  _handleExpiry(resource) {
    this.timers.delete(resource);
    const entry = this.store.get(resource);
    if (entry) {
      this.store.delete(resource);
      this.onExpire(resource, entry.owner);
    }
  }

  /**
   * Acquire a lock on a resource
   * @param {string} resource - Resource identifier to lock
   * @param {number} ttl - Time to live in milliseconds
   * @param {Object} [options={}] - Acquisition options
   * @param {string} [options.owner] - Custom owner identifier (for reentrancy)
   * @param {number} [options.retryDelay=100] - Delay between retries in ms
   * @param {number} [options.maxRetries=0] - Maximum retry attempts
   * @returns {Promise<{success: boolean, owner: string|null, count: number}>} Lock result
   */
  async acquire(resource, ttl, options = {}) {
    const owner = options.owner || this._generateOwnerId();
    const retryDelay = options.retryDelay ?? 100;
    const maxRetries = options.maxRetries ?? 0;
    
    let attempt = 0;
    
    while (attempt <= maxRetries) {
      const existing = this.store.get(resource);
      
      // Reentrant lock - same owner
      if (existing && existing.owner === owner) {
        existing.count++;
        existing.expiry = this._calculateExpiry(ttl);
        this._setupExpiryTimer(resource, ttl);
        return { success: true, owner, count: existing.count };
      }
      
      // Check if existing lock has expired
      if (existing && existing.expiry <= Date.now()) {
        this.store.delete(resource);
        this._clearExpiryTimer(resource);
      }
      
      // Try to acquire lock
      if (!this.store.has(resource)) {
        const entry = {
          owner,
          expiry: this._calculateExpiry(ttl),
          count: 1
        };
        this.store.set(resource, entry);
        this._setupExpiryTimer(resource, ttl);
        return { success: true, owner, count: 1 };
      }
      
      // Lock held by another owner, retry if allowed
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
      attempt++;
    }
    
    return { success: false, owner: null, count: 0 };
  }

  /**
   * Release a lock on a resource
   * @param {string} resource - Resource identifier to unlock
   * @param {string} [owner] - Owner identifier (required for reentrant locks)
   * @returns {Promise<{success: boolean, count: number}>} Release result
   */
  async release(resource, owner) {
    const entry = this.store.get(resource);
    
    if (!entry) {
      return { success: false, count: 0 };
    }
    
    // Verify ownership if owner provided
    if (owner && entry.owner !== owner) {
      return { success: false, count: entry.count };
    }
    
    // Decrement reentrancy count
    entry.count--;
    
    if (entry.count <= 0) {
      this.store.delete(resource);
      this._clearExpiryTimer(resource);
      this.onRelease(resource, entry.owner);
      return { success: true, count: 0 };
    }
    
    return { success: true, count: entry.count };
  }

  /**
   * Extend the TTL of an existing lock
   * @param {string} resource - Resource identifier
   * @param {number} ttl - Additional time in milliseconds
   * @param {string} [owner] - Owner identifier for verification
   * @returns {Promise<{success: boolean, expiry: number|null}>} Extension result
   */
  async extend(resource, ttl, owner) {
    const entry = this.store.get(resource);
    
    if (!entry) {
      return { success: false, expiry: null };
    }
    
    // Verify ownership
    if (owner && entry.owner !== owner) {
      return { success: false, expiry: entry.expiry };
    }
    
    entry.expiry = this._calculateExpiry(ttl);
    this._setupExpiryTimer(resource, ttl);
    
    return { success: true, expiry: entry.expiry };
  }

  /**
   * Check if a resource is currently locked
   * @param {string} resource - Resource identifier
   * @returns {Promise<{locked: boolean, owner: string|null, expiresIn: number|null}>} Lock status
   */
  async isLocked(resource) {
    const entry = this.store.get(resource);
    
    if (!entry) {
      return { locked: false, owner: null, expiresIn: null };
    }
    
    // Check if lock has expired
    const now = Date.now();
    if (entry.expiry <= now) {
      this.store.delete(resource);
      this._clearExpiryTimer(resource);
      return { locked: false, owner: null, expiresIn: null };
    }
    
    return {
      locked: true,
      owner: entry.owner,
      expiresIn: entry.expiry - now
    };
  }

  /**
   * Force release a lock (administrative override)
   * @param {string} resource - Resource identifier
   * @returns {Promise<{success: boolean, previousOwner: string|null}>}
   */
  async forceRelease(resource) {
    const entry = this.store.get(resource);
    
    if (!entry) {
      return { success: false, previousOwner: null };
    }
    
    this.store.delete(resource);
    this._clearExpiryTimer(resource);
    this.onRelease(resource, entry.owner);
    
    return { success: true, previousOwner: entry.owner };
  }

  /**
   * Get all active locks
   * @returns {Promise<Array<{resource: string, owner: string, expiresIn: number, count: number}>>} Active locks
   */
  async getActiveLocks() {
    const locks = [];
    const now = Date.now();
    
    for (const [resource, entry] of this.store.entries()) {
      if (entry.expiry > now) {
        locks.push({
          resource,
          owner: entry.owner,
          expiresIn: entry.expiry - now,
          count: entry.count
        });
      }
    }
    
    return locks;
  }

  /**
   * Dispose of the lock manager and clean up resources
   */
  dispose() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    if (!this.isExternalStore) {
      this.store.clear();
    }
  }
}

export default LockManager;
