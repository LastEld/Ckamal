/**
 * @fileoverview Performance monitoring and optimization utilities
 * @module utils/performance
 * 
 * Provides tools for monitoring system performance, memoization,
 * debouncing, throttling, and query optimization.
 */

import { EventEmitter } from 'events';

/**
 * Performance metric entry
 * @typedef {Object} MetricEntry
 * @property {number} value - Metric value
 * @property {number} timestamp - Entry timestamp
 */

/**
 * Performance statistics
 * @typedef {Object} PerformanceStats
 * @property {number} avg - Average value
 * @property {number} min - Minimum value
 * @property {number} max - Maximum value
 * @property {number} count - Number of samples
 * @property {number} p95 - 95th percentile
 * @property {number} p99 - 99th percentile
 */

/**
 * PerformanceMonitor - Tracks timing metrics and performance statistics
 * @extends EventEmitter
 */
export class PerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.timers = new Map();
    this.enabled = process.env.PERFORMANCE_MONITORING !== 'false';
  }

  /**
   * Start a timer for a named operation
   * @param {string} name - Timer name
   * @returns {boolean} True if timer started
   */
  startTimer(name) {
    if (!this.enabled) return false;
    
    this.timers.set(name, process.hrtime.bigint());
    this.emit('timerStarted', { name, timestamp: Date.now() });
    return true;
  }

  /**
   * End a timer and record the metric
   * @param {string} name - Timer name
   * @returns {number|null} Duration in milliseconds, or null if timer not found
   */
  endTimer(name) {
    if (!this.enabled) return null;
    
    const start = this.timers.get(name);
    if (!start) return null;
    
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to ms
    
    this.recordMetric(name, duration);
    this.timers.delete(name);
    
    this.emit('timerEnded', { name, duration, timestamp: Date.now() });
    return duration;
  }

  /**
   * Record a metric value
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   */
  recordMetric(name, value) {
    if (!this.enabled) return;
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const entries = this.metrics.get(name);
    entries.push({
      value,
      timestamp: Date.now()
    });
    
    // Keep only last 10000 entries per metric to prevent memory bloat
    if (entries.length > 10000) {
      entries.splice(0, entries.length - 10000);
    }
  }

  /**
   * Get statistics for a metric
   * @param {string} name - Metric name
   * @returns {PerformanceStats|null} Statistics or null if no data
   */
  getStats(name) {
    const entries = this.metrics.get(name);
    if (!entries || entries.length === 0) return null;
    
    const values = entries.map(m => m.value);
    const sorted = [...values].sort((a, b) => a - b);
    
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    
    // Calculate percentiles
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    const p95 = sorted[p95Index];
    const p99 = sorted[p99Index];
    
    return { avg, min, max, count: values.length, p95, p99 };
  }

  /**
   * Get all metric names
   * @returns {string[]}
   */
  getMetricNames() {
    return Array.from(this.metrics.keys());
  }

  /**
   * Get all statistics
   * @returns {Object.<string, PerformanceStats>}
   */
  getAllStats() {
    const stats = {};
    for (const name of this.metrics.keys()) {
      stats[name] = this.getStats(name);
    }
    return stats;
  }

  /**
   * Clear all metrics
   * @param {string} [name] - Specific metric to clear, or all if omitted
   */
  clear(name) {
    if (name) {
      this.metrics.delete(name);
      this.timers.delete(name);
    } else {
      this.metrics.clear();
      this.timers.clear();
    }
  }

  /**
   * Create a timed wrapper for an async function
   * @template T
   * @param {string} name - Metric name
   * @param {() => Promise<T>} fn - Function to time
   * @returns {Promise<T>}
   */
  async timeAsync(name, fn) {
    this.startTimer(name);
    try {
      return await fn();
    } finally {
      this.endTimer(name);
    }
  }

  /**
   * Create a timed wrapper for a sync function
   * @template T
   * @param {string} name - Metric name
   * @param {() => T} fn - Function to time
   * @returns {T}
   */
  timeSync(name, fn) {
    this.startTimer(name);
    try {
      return fn();
    } finally {
      this.endTimer(name);
    }
  }
}

/**
 * Cache entry with TTL
 * @typedef {Object} CacheEntry
 * @property {*} value - Cached value
 * @property {number} expires - Expiration timestamp
 * @property {number} accesses - Number of accesses
 */

/**
 * Memoize an async function with TTL-based caching
 * @template T
 * @param {(...args: any[]) => Promise<T>} fn - Function to memoize
 * @param {Object} options - Memoization options
 * @param {number} [options.ttl=60000] - Time to live in milliseconds
 * @param {number} [options.maxSize=1000] - Maximum cache size
 * @param {Function} [options.keyGenerator] - Custom key generator function
 * @returns {(...args: any[]) => Promise<T>} Memoized function
 */
export function memoize(fn, options = {}) {
  const ttl = options.ttl ?? 60000;
  const maxSize = options.maxSize ?? 1000;
  const keyGenerator = options.keyGenerator ?? ((args) => JSON.stringify(args));
  
  /** @type {Map<string, CacheEntry>} */
  const cache = new Map();
  
  // Cleanup expired entries periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expires < now) {
        cache.delete(key);
      }
    }
  }, Math.min(ttl, 60000));
  
  // Prevent unhandled rejection warnings
  cleanupInterval.unref?.();
  
  const memoized = async function(...args) {
    const key = keyGenerator(args);
    const cached = cache.get(key);
    const now = Date.now();
    
    if (cached && cached.expires > now) {
      cached.accesses++;
      return cached.value;
    }
    
    // Remove expired entry if exists
    if (cached) {
      cache.delete(key);
    }
    
    // Evict oldest entries if at capacity
    if (cache.size >= maxSize) {
      const entriesToDelete = cache.size - maxSize + 1;
      const keys = Array.from(cache.keys()).slice(0, entriesToDelete);
      for (const k of keys) {
        cache.delete(k);
      }
    }
    
    const result = await fn.apply(this, args);
    
    cache.set(key, {
      value: result,
      expires: now + ttl,
      accesses: 1
    });
    
    return result;
  };
  
  // Attach cache management methods
  memoized.cache = {
    get size() { return cache.size; },
    clear: () => cache.clear(),
    has: (key) => cache.has(key),
    delete: (key) => cache.delete(key),
    stats: () => ({
      size: cache.size,
      entries: Array.from(cache.entries()).map(([k, v]) => ({
        key: k,
        expires: v.expires,
        accesses: v.accesses
      }))
    })
  };
  
  return memoized;
}

/**
 * Create a debounced function
 * @template T
 * @param {(...args: any[]) => T} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @param {Object} [options] - Debounce options
 * @param {boolean} [options.immediate=false] - Execute immediately on first call
 * @returns {(...args: any[]) => void} Debounced function
 */
export function debounce(fn, delay, options = {}) {
  let timeoutId = null;
  let lastArgs = null;
  
  return function(...args) {
    lastArgs = args;
    
    const shouldCallNow = options.immediate && !timeoutId;
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (!options.immediate && lastArgs) {
        fn.apply(this, lastArgs);
      }
    }, delay);
    
    if (shouldCallNow) {
      fn.apply(this, args);
    }
  };
}

/**
 * Create a throttled function
 * @template T
 * @param {(...args: any[]) => T} fn - Function to throttle
 * @param {number} limit - Throttle limit in milliseconds
 * @param {Object} [options] - Throttle options
 * @param {boolean} [options.trailing=true] - Execute trailing call
 * @returns {(...args: any[]) => void} Throttled function
 */
export function throttle(fn, limit, options = {}) {
  let inThrottle = false;
  let pendingArgs = null;
  const trailing = options.trailing !== false;
  
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
        if (trailing && pendingArgs) {
          fn.apply(this, pendingArgs);
          pendingArgs = null;
        }
      }, limit);
    } else if (trailing) {
      pendingArgs = args;
    }
  };
}

/**
 * Batch multiple requests into a single call
 * @template T, R
 * @param {(items: T[]) => Promise<R[]>} batchFn - Function that processes batch
 * @param {Object} [options] - Batching options
 * @param {number} [options.delay=10] - Delay before executing batch (ms)
 * @param {number} [options.maxSize=100] - Maximum batch size
 * @returns {(item: T) => Promise<R>} Batched function
 */
export function batchRequests(batchFn, options = {}) {
  const delay = options.delay ?? 10;
  const maxSize = options.maxSize ?? 100;
  
  let queue = [];
  let timeoutId = null;
  
  const processBatch = async () => {
    timeoutId = null;
    const currentQueue = queue;
    queue = [];
    
    if (currentQueue.length === 0) return;
    
    try {
      const items = currentQueue.map(q => q.item);
      const results = await batchFn(items);
      
      // Resolve each promise with its corresponding result
      currentQueue.forEach((q, index) => {
        q.resolve(results[index]);
      });
    } catch (error) {
      // Reject all promises on error
      currentQueue.forEach(q => q.reject(error));
    }
  };
  
  return function(item) {
    return new Promise((resolve, reject) => {
      queue.push({ item, resolve, reject });
      
      if (queue.length >= maxSize) {
        if (timeoutId) clearTimeout(timeoutId);
        processBatch();
      } else if (!timeoutId) {
        timeoutId = setTimeout(processBatch, delay);
      }
    });
  };
}

/**
 * Create a rate-limited function
 * @template T
 * @param {(...args: any[]) => Promise<T>} fn - Function to rate limit
 * @param {number} rps - Requests per second
 * @returns {(...args: any[]) => Promise<T>} Rate-limited function
 */
export function rateLimit(fn, rps) {
  const minInterval = 1000 / rps;
  let lastCall = 0;
  let queue = Promise.resolve();
  
  return function(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    const delayNeeded = Math.max(0, minInterval - timeSinceLastCall);
    
    lastCall = now + delayNeeded;
    
    queue = queue.then(() => 
      new Promise(resolve => setTimeout(resolve, delayNeeded))
        .then(() => fn.apply(this, args))
    );
    
    return queue;
  };
}

/**
 * Profile a function's execution time
 * @template T
 * @param {string} name - Profile name
 * @param {() => T} fn - Function to profile
 * @param {Object} [options] - Profiling options
 * @param {Function} [options.onComplete] - Callback with results
 * @returns {T}
 */
export function profile(name, fn, options = {}) {
  const start = process.hrtime.bigint();
  const startMemory = process.memoryUsage?.();
  
  const complete = (error = null) => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000;
    
    const result = {
      name,
      duration,
      error,
      memoryDelta: startMemory && process.memoryUsage 
        ? {
            heapUsed: process.memoryUsage().heapUsed - startMemory.heapUsed,
            external: process.memoryUsage().external - startMemory.external
          }
        : null
    };
    
    if (options.onComplete) {
      options.onComplete(result);
    }
    
    return result;
  };
  
  try {
    const result = fn();
    
    if (result && typeof result.then === 'function') {
      return result
        .then(value => {
          complete();
          return value;
        })
        .catch(error => {
          complete(error);
          throw error;
        });
    }
    
    complete();
    return result;
  } catch (error) {
    complete(error);
    throw error;
  }
}

// Create global monitor instance
export const globalMonitor = new PerformanceMonitor();

export default {
  PerformanceMonitor,
  globalMonitor,
  memoize,
  debounce,
  throttle,
  batchRequests,
  rateLimit,
  profile
};
