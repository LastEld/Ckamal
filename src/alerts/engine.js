/**
 * @fileoverview Alert processing engine with priority queue, rate limiting,
 * deduplication, and batch processing capabilities.
 * @module alerts/engine
 */

import { EventEmitter } from 'events';

/**
 * Alert priority levels.
 * @readonly
 * @enum {number}
 */
export const AlertPriority = {
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
};

/**
 * @typedef {Object} Alert
 * @property {string} id - Unique alert identifier
 * @property {string} type - Alert type/category
 * @property {string} message - Alert message
 * @property {string} priority - Alert priority (HIGH, MEDIUM, LOW)
 * @property {string} timestamp - ISO timestamp
 * @property {Object} metadata - Additional alert data
 * @property {string} [state] - Alert state
 */

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} maxRequests - Maximum requests per window
 * @property {number} windowMs - Time window in milliseconds
 */

/**
 * @typedef {Object} EngineConfig
 * @property {number} [batchSize=10] - Number of alerts to process per batch
 * @property {number} [batchIntervalMs=1000] - Interval between batch processing
 * @property {number} [deduplicationWindowMs=60000] - Deduplication window
 * @property {Object.<string, RateLimitConfig>} [rateLimits] - Per-channel rate limits
 * @property {number} [maxQueueSize=1000] - Maximum queue size
 */

/**
 * Priority queue implementation for alerts.
 * @template T
 */
class PriorityQueue {
  /**
   * Creates a new PriorityQueue instance.
   */
  constructor() {
    /** @type {Array<{item: T, priority: number, timestamp: number}>} */
    this.items = [];
  }

  /**
   * Enqueues an item with priority.
   * @param {T} item - Item to enqueue
   * @param {number} priority - Priority (lower is higher priority)
   */
  enqueue(item, priority) {
    const element = { item, priority, timestamp: Date.now() };
    
    let added = false;
    for (let i = 0; i < this.items.length; i++) {
      if (element.priority < this.items[i].priority) {
        this.items.splice(i, 0, element);
        added = true;
        break;
      }
    }
    
    if (!added) {
      this.items.push(element);
    }
  }

  /**
   * Dequeues the highest priority item.
   * @returns {T|null} Dequeued item or null if empty
   */
  dequeue() {
    if (this.isEmpty()) return null;
    return this.items.shift().item;
  }

  /**
   * Peeks at the highest priority item without removing.
   * @returns {T|null} Highest priority item or null if empty
   */
  peek() {
    if (this.isEmpty()) return null;
    return this.items[0].item;
  }

  /**
   * Checks if queue is empty.
   * @returns {boolean} True if empty
   */
  isEmpty() {
    return this.items.length === 0;
  }

  /**
   * Gets queue size.
   * @returns {number} Number of items in queue
   */
  size() {
    return this.items.length;
  }

  /**
   * Clears all items from queue.
   */
  clear() {
    this.items = [];
  }

  /**
   * Gets items sorted by priority.
   * @returns {Array<T>} Array of items
   */
  toArray() {
    return this.items.map(el => el.item);
  }
}

/**
 * Rate limiter implementation using sliding window algorithm.
 */
class RateLimiter {
  /**
   * Creates a new RateLimiter instance.
   * @param {RateLimitConfig} config - Rate limit configuration
   */
  constructor(config) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
    /** @type {Array<number>} */
    this.requests = [];
  }

  /**
   * Checks if a request is allowed.
   * @returns {{allowed: boolean, remaining: number, resetTime: number}} Rate limit check result
   */
  checkLimit() {
    const now = Date.now();
    
    // Remove expired requests
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    const allowed = this.requests.length < this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - this.requests.length);
    const resetTime = this.requests.length > 0 
      ? this.requests[0] + this.windowMs 
      : now + this.windowMs;

    return { allowed, remaining, resetTime };
  }

  /**
   * Records a request if allowed.
   * @returns {{allowed: boolean, remaining: number, resetTime: number}} Rate limit result
   */
  tryRequest() {
    const result = this.checkLimit();
    
    if (result.allowed) {
      this.requests.push(Date.now());
    }
    
    return result;
  }

  /**
   * Resets the rate limiter.
   */
  reset() {
    this.requests = [];
  }
}

/**
 * Alert deduplication using content-based hashing.
 */
class Deduplicator {
  /**
   * Creates a new Deduplicator instance.
   * @param {number} windowMs - Deduplication window in milliseconds
   */
  constructor(windowMs = 60000) {
    this.windowMs = windowMs;
    /** @type {Map<string, number>} */
    this.seen = new Map();
  }

  /**
   * Generates a fingerprint for an alert.
   * @param {Alert} alert - Alert to fingerprint
   * @returns {string} Alert fingerprint
   */
  getFingerprint(alert) {
    const key = `${alert.type}:${alert.message}:${JSON.stringify(alert.metadata || {})}`;
    return this.hashCode(key);
  }

  /**
   * Simple hash function for strings.
   * @private
   * @param {string} str - String to hash
   * @returns {string} Hash code
   */
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Checks if an alert is a duplicate.
   * @param {Alert} alert - Alert to check
   * @returns {boolean} True if duplicate
   */
  isDuplicate(alert) {
    this.cleanup();
    
    const fingerprint = this.getFingerprint(alert);
    const lastSeen = this.seen.get(fingerprint);
    
    if (lastSeen && Date.now() - lastSeen < this.windowMs) {
      return true;
    }
    
    this.seen.set(fingerprint, Date.now());
    return false;
  }

  /**
   * Cleans up expired entries.
   * @private
   */
  cleanup() {
    const now = Date.now();
    for (const [fingerprint, timestamp] of this.seen.entries()) {
      if (now - timestamp > this.windowMs) {
        this.seen.delete(fingerprint);
      }
    }
  }

  /**
   * Gets deduplication statistics.
   * @returns {Object} Statistics
   */
  getStats() {
    this.cleanup();
    return {
      trackedAlerts: this.seen.size,
      windowMs: this.windowMs
    };
  }
}

/**
 * Alert processing engine with queue, rate limiting, and deduplication.
 * @extends EventEmitter
 */
export class AlertEngine extends EventEmitter {
  /**
   * Default engine configuration.
   * @type {EngineConfig}
   */
  static DEFAULT_CONFIG = {
    batchSize: 10,
    batchIntervalMs: 1000,
    deduplicationWindowMs: 60000,
    maxQueueSize: 1000,
    rateLimits: {
      email: { maxRequests: 10, windowMs: 60000 },
      webhook: { maxRequests: 100, windowMs: 60000 },
      console: { maxRequests: 1000, windowMs: 60000 },
      websocket: { maxRequests: 1000, windowMs: 60000 }
    }
  };

  /**
   * Creates a new AlertEngine instance.
   * @param {EngineConfig} [config={}] - Engine configuration
   */
  constructor(config = {}) {
    super();
    this.config = { ...AlertEngine.DEFAULT_CONFIG, ...config };
    
    /** @type {PriorityQueue<Alert>} */
    this.queue = new PriorityQueue();
    
    /** @type {Deduplicator} */
    this.deduplicator = new Deduplicator(this.config.deduplicationWindowMs);
    
    /** @type {Map<string, RateLimiter>} */
    this.rateLimiters = new Map();
    
    /** @type {Array<BaseChannel>} */
    this.channels = [];
    
    this.isRunning = false;
    this.processingInterval = null;
    this.metrics = {
      received: 0,
      queued: 0,
      deduplicated: 0,
      processed: 0,
      dropped: 0,
      rateLimited: 0
    };
  }

  /**
   * Adds a delivery channel to the engine.
   * @param {BaseChannel} channel - Channel to add
   */
  addChannel(channel) {
    this.channels.push(channel);
    
    // Initialize rate limiter for this channel type
    const rateLimitConfig = this.config.rateLimits[channel.name];
    if (rateLimitConfig) {
      this.rateLimiters.set(channel.name, new RateLimiter(rateLimitConfig));
    }
    
    this.emit('channelAdded', { channel: channel.name });
  }

  /**
   * Removes a delivery channel.
   * @param {string} channelName - Name of channel to remove
   */
  removeChannel(channelName) {
    this.channels = this.channels.filter(c => c.name !== channelName);
    this.rateLimiters.delete(channelName);
    this.emit('channelRemoved', { channel: channelName });
  }

  /**
   * Submits an alert to the processing queue.
   * @param {Alert} alert - Alert to submit
   * @returns {{accepted: boolean, reason?: string}} Submission result
   */
  submit(alert) {
    this.metrics.received++;

    // Check for duplicates
    if (this.deduplicator.isDuplicate(alert)) {
      this.metrics.deduplicated++;
      this.emit('deduplicated', { alert });
      return { accepted: false, reason: 'duplicate' };
    }

    // Check queue size
    if (this.queue.size() >= this.config.maxQueueSize) {
      this.metrics.dropped++;
      this.emit('dropped', { alert, reason: 'queue_full' });
      return { accepted: false, reason: 'queue_full' };
    }

    // Get priority value
    const priorityValue = AlertPriority[alert.priority] || AlertPriority.MEDIUM;
    
    // Add to queue
    this.queue.enqueue(alert, priorityValue);
    this.metrics.queued++;
    
    this.emit('queued', { alert, queueSize: this.queue.size() });
    return { accepted: true };
  }

  /**
   * Starts the alert processing engine.
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.processingInterval = setInterval(
      () => this.processBatch(),
      this.config.batchIntervalMs
    );
    
    this.emit('started');
  }

  /**
   * Stops the alert processing engine.
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    this.emit('stopped');
  }

  /**
   * Processes a batch of alerts from the queue.
   * @private
   */
  async processBatch() {
    const batch = [];
    const batchSize = Math.min(this.config.batchSize, this.queue.size());
    
    for (let i = 0; i < batchSize; i++) {
      const alert = this.queue.dequeue();
      if (alert) batch.push(alert);
    }

    if (batch.length === 0) return;

    this.emit('batchStart', { size: batch.length });

    for (const alert of batch) {
      await this.processAlert(alert);
    }

    this.emit('batchComplete', { size: batch.length });
  }

  /**
   * Processes a single alert through all channels.
   * @private
   * @param {Alert} alert - Alert to process
   */
  async processAlert(alert) {
    const results = [];

    for (const channel of this.channels) {
      // Check rate limit
      const rateLimiter = this.rateLimiters.get(channel.name);
      if (rateLimiter) {
        const limitCheck = rateLimiter.tryRequest();
        if (!limitCheck.allowed) {
          this.metrics.rateLimited++;
          results.push({ channel: channel.name, sent: false, reason: 'rate_limited' });
          continue;
        }
      }

      try {
        const sent = await channel.send(alert);
        results.push({ channel: channel.name, sent });
      } catch (error) {
        results.push({ channel: channel.name, sent: false, error: error.message });
      }
    }

    this.metrics.processed++;
    this.emit('processed', { alert, results });
  }

  /**
   * Gets current engine metrics.
   * @returns {Object} Engine metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.queue.size(),
      channels: this.channels.length,
      isRunning: this.isRunning,
      deduplication: this.deduplicator.getStats()
    };
  }

  /**
   * Clears all pending alerts from the queue.
   * @returns {number} Number of cleared alerts
   */
  clearQueue() {
    const size = this.queue.size();
    this.queue.clear();
    this.emit('queueCleared', { clearedCount: size });
    return size;
  }

  /**
   * Gets pending alerts from the queue.
   * @returns {Array<Alert>} Pending alerts
   */
  getPendingAlerts() {
    return this.queue.toArray();
  }
}

export default {
  AlertEngine,
  AlertPriority,
  PriorityQueue,
  RateLimiter,
  Deduplicator
};
