/**
 * @fileoverview WebSocket Message Batcher
 * @module websocket/message-batcher
 * @description Batches WebSocket messages for improved throughput and reduced latency
 * @version 5.0.0
 */

import { EventEmitter } from 'events';

/**
 * Message batcher configuration
 * @typedef {Object} MessageBatcherConfig
 * @property {number} [maxBatchSize=100] - Maximum messages per batch
 * @property {number} [flushInterval=16] - Flush interval in ms (default: 1 frame)
 * @property {number} [maxQueueSize=1000] - Maximum queue size before dropping
 * @property {boolean} [priorityQueue=true] - Enable priority queuing
 * @property {boolean} [compression=true] - Compress batched messages
 * @property {number} [compressionThreshold=1024] - Compress if batch exceeds this size
 */

/**
 * Message priority levels
 * @readonly
 * @enum {number}
 */
export const MessagePriority = {
  CRITICAL: 0,   // Immediate send, bypass batching
  HIGH: 1,       // Send in next batch
  NORMAL: 2,     // Standard batching
  LOW: 3,        // Batch with longer intervals
  BACKGROUND: 4  // Send when idle
};

/**
 * WebSocket Message Batcher
 * @extends EventEmitter
 */
export class MessageBatcher extends EventEmitter {
  #config;
  #queues;
  #flushTimer;
  #isFlushing;
  #stats;
  #sendFunction;
  #compressionEnabled;
  
  /**
   * Create a new MessageBatcher
   * @param {Function} sendFunction - Function to send messages (ws.send)
   * @param {MessageBatcherConfig} [config={}]
   */
  constructor(sendFunction, config = {}) {
    super();
    
    this.#sendFunction = sendFunction;
    this.#config = {
      maxBatchSize: config.maxBatchSize || 100,
      flushInterval: config.flushInterval || 16,
      maxQueueSize: config.maxQueueSize || 1000,
      priorityQueue: config.priorityQueue !== false,
      compression: config.compression !== false,
      compressionThreshold: config.compressionThreshold || 1024
    };
    
    // Initialize priority queues
    this.#queues = new Map([
      [MessagePriority.CRITICAL, []],
      [MessagePriority.HIGH, []],
      [MessagePriority.NORMAL, []],
      [MessagePriority.LOW, []],
      [MessagePriority.BACKGROUND, []]
    ]);
    
    this.#flushTimer = null;
    this.#isFlushing = false;
    this.#compressionEnabled = false;
    
    this.#stats = {
      messagesQueued: 0,
      messagesSent: 0,
      messagesDropped: 0,
      batchesSent: 0,
      bytesSent: 0,
      bytesCompressed: 0,
      avgBatchSize: 0,
      avgLatency: 0
    };
    
    this.#startFlushTimer();
  }
  
  /**
   * Start the flush timer
   * @private
   */
  #startFlushTimer() {
    if (this.#flushTimer) return;
    
    this.#flushTimer = setInterval(() => {
      this.flush();
    }, this.#config.flushInterval);
  }
  
  /**
   * Stop the flush timer
   * @private
   */
  #stopFlushTimer() {
    if (this.#flushTimer) {
      clearInterval(this.#flushTimer);
      this.#flushTimer = null;
    }
  }
  
  /**
   * Queue a message for batching
   * @param {*} message - Message to send
   * @param {MessagePriority} [priority=MessagePriority.NORMAL] - Message priority
   * @returns {boolean} Whether message was queued
   */
  queue(message, priority = MessagePriority.NORMAL) {
    // Critical priority: send immediately
    if (priority === MessagePriority.CRITICAL) {
      this.#sendImmediately(message);
      return true;
    }
    
    const queue = this.#queues.get(priority);
    if (!queue) {
      console.warn(`[MessageBatcher] Unknown priority: ${priority}`);
      return false;
    }
    
    // Check queue capacity
    const totalSize = this.#getTotalQueueSize();
    if (totalSize >= this.#config.maxQueueSize) {
      // Drop lowest priority messages first
      if (priority >= MessagePriority.LOW) {
        this.#stats.messagesDropped++;
        this.emit('dropped', message, priority);
        return false;
      }
      
      // Try to make room by dropping background messages
      const backgroundQueue = this.#queues.get(MessagePriority.BACKGROUND);
      if (backgroundQueue.length > 0) {
        backgroundQueue.shift();
        this.#stats.messagesDropped++;
      } else {
        this.#stats.messagesDropped++;
        this.emit('dropped', message, priority);
        return false;
      }
    }
    
    // Add timestamp for latency tracking
    const wrappedMessage = {
      data: message,
      timestamp: Date.now(),
      priority
    };
    
    queue.push(wrappedMessage);
    this.#stats.messagesQueued++;
    
    this.emit('queued', message, priority);
    
    // Trigger immediate flush if queue is large
    if (queue.length >= this.#config.maxBatchSize) {
      this.flush();
    }
    
    return true;
  }
  
  /**
   * Send message immediately (bypass batching)
   * @private
   * @param {*} message
   */
  #sendImmediately(message) {
    const startTime = Date.now();
    
    try {
      const serialized = JSON.stringify(message);
      this.#sendFunction(serialized);
      
      this.#stats.messagesSent++;
      this.#stats.bytesSent += serialized.length;
      
      const latency = Date.now() - startTime;
      this.#updateAvgLatency(latency);
      
      this.emit('sent', message, 1, latency);
    } catch (error) {
      this.emit('error', error, message);
    }
  }
  
  /**
   * Flush queued messages
   * @param {Object} [options={}] - Flush options
   * @param {boolean} [options.force=false] - Force flush all priorities
   * @returns {Promise<number>} Number of messages sent
   */
  async flush(options = {}) {
    if (this.#isFlushing) return 0;
    if (this.#getTotalQueueSize() === 0) return 0;
    
    this.#isFlushing = true;
    const startTime = Date.now();
    let totalSent = 0;
    
    try {
      // Process in priority order
      const priorities = options.force 
        ? [MessagePriority.HIGH, MessagePriority.NORMAL, MessagePriority.LOW, MessagePriority.BACKGROUND]
        : [MessagePriority.HIGH, MessagePriority.NORMAL];
      
      for (const priority of priorities) {
        const queue = this.#queues.get(priority);
        
        while (queue.length > 0) {
          const batch = queue.splice(0, this.#config.maxBatchSize);
          await this.#sendBatch(batch);
          totalSent += batch.length;
        }
      }
      
      if (totalSent > 0) {
        this.#stats.batchesSent++;
        this.#updateAvgBatchSize(totalSent);
        
        const latency = Date.now() - startTime;
        this.#updateAvgLatency(latency);
        
        this.emit('flushed', totalSent, latency);
      }
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.#isFlushing = false;
    }
    
    return totalSent;
  }
  
  /**
   * Send a batch of messages
   * @private
   * @param {Array} batch - Batch of wrapped messages
   */
  async #sendBatch(batch) {
    if (batch.length === 0) return;
    
    // Single message: send directly
    if (batch.length === 1) {
      const { data } = batch[0];
      const serialized = JSON.stringify(data);
      this.#sendFunction(serialized);
      
      this.#stats.messagesSent++;
      this.#stats.bytesSent += serialized.length;
      return;
    }
    
    // Multiple messages: batch
    const messages = batch.map(m => m.data);
    const batchMessage = {
      type: 'batch',
      count: messages.length,
      messages
    };
    
    let serialized = JSON.stringify(batchMessage);
    
    // Compress if enabled and batch is large
    if (this.#config.compression && serialized.length > this.#config.compressionThreshold) {
      try {
        const compressed = await this.#compress(serialized);
        serialized = compressed;
        this.#stats.bytesCompressed += serialized.length;
      } catch (error) {
        // Fall back to uncompressed
      }
    }
    
    this.#sendFunction(serialized);
    
    this.#stats.messagesSent += batch.length;
    this.#stats.bytesSent += serialized.length;
  }
  
  /**
   * Compress data
   * @private
   * @param {string} data - Data to compress
   * @returns {Promise<string>}
   */
  async #compress(data) {
    // Simple compression: use base64 encoded for now
    // In production, use a proper compression library
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(data).toString('base64');
    }
    return btoa(data);
  }
  
  /**
   * Get total queue size across all priorities
   * @private
   * @returns {number}
   */
  #getTotalQueueSize() {
    let total = 0;
    for (const queue of this.#queues.values()) {
      total += queue.length;
    }
    return total;
  }
  
  /**
   * Update average batch size
   * @private
   * @param {number} size
   */
  #updateAvgBatchSize(size) {
    const n = this.#stats.batchesSent;
    this.#stats.avgBatchSize = 
      (this.#stats.avgBatchSize * (n - 1) + size) / n;
  }
  
  /**
   * Update average latency
   * @private
   * @param {number} latency
   */
  #updateAvgLatency(latency) {
    const alpha = 0.1; // Exponential moving average
    this.#stats.avgLatency = 
      this.#stats.avgLatency * (1 - alpha) + latency * alpha;
  }
  
  /**
   * Get current statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.#stats,
      queueSize: this.#getTotalQueueSize(),
      queueBreakdown: {
        critical: this.#queues.get(MessagePriority.CRITICAL).length,
        high: this.#queues.get(MessagePriority.HIGH).length,
        normal: this.#queues.get(MessagePriority.NORMAL).length,
        low: this.#queues.get(MessagePriority.LOW).length,
        background: this.#queues.get(MessagePriority.BACKGROUND).length
      },
      compressionRatio: this.#stats.bytesSent > 0 
        ? (this.#stats.bytesCompressed / this.#stats.bytesSent * 100).toFixed(2) + '%'
        : '0%'
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.#stats = {
      messagesQueued: 0,
      messagesSent: 0,
      messagesDropped: 0,
      batchesSent: 0,
      bytesSent: 0,
      bytesCompressed: 0,
      avgBatchSize: 0,
      avgLatency: 0
    };
  }
  
  /**
   * Enable/disable compression
   * @param {boolean} enabled
   */
  setCompression(enabled) {
    this.#config.compression = enabled;
  }
  
  /**
   * Set flush interval
   * @param {number} interval - Interval in milliseconds
   */
  setFlushInterval(interval) {
    this.#config.flushInterval = interval;
    this.#stopFlushTimer();
    this.#startFlushTimer();
  }
  
  /**
   * Pause batching
   */
  pause() {
    this.#stopFlushTimer();
  }
  
  /**
   * Resume batching
   */
  resume() {
    this.#startFlushTimer();
  }
  
  /**
   * Dispose of the batcher
   */
  dispose() {
    this.#stopFlushTimer();
    this.flush({ force: true }).then(() => {
      this.#queues.forEach(queue => queue.length = 0);
      this.removeAllListeners();
    });
  }
}

/**
 * Room-based message batcher for WebSocket rooms
 * @extends EventEmitter
 */
export class RoomMessageBatcher extends EventEmitter {
  #batchers;
  #config;
  
  /**
   * Create a new RoomMessageBatcher
   * @param {MessageBatcherConfig} [config={}]
   */
  constructor(config = {}) {
    super();
    this.#config = config;
    this.#batchers = new Map();
  }
  
  /**
   * Get or create batcher for room
   * @private
   * @param {string} roomId - Room identifier
   * @param {Function} sendFunction - Send function
   * @returns {MessageBatcher}
   */
  #getBatcher(roomId, sendFunction) {
    if (!this.#batchers.has(roomId)) {
      const batcher = new MessageBatcher(sendFunction, this.#config);
      
      // Forward events
      batcher.on('sent', (...args) => this.emit('sent', roomId, ...args));
      batcher.on('flushed', (...args) => this.emit('flushed', roomId, ...args));
      batcher.on('dropped', (...args) => this.emit('dropped', roomId, ...args));
      batcher.on('error', (...args) => this.emit('error', roomId, ...args));
      
      this.#batchers.set(roomId, batcher);
    }
    
    return this.#batchers.get(roomId);
  }
  
  /**
   * Queue message for room
   * @param {string} roomId - Room identifier
   * @param {*} message - Message to send
   * @param {Function} sendFunction - Send function
   * @param {MessagePriority} [priority=MessagePriority.NORMAL] - Priority
   */
  queue(roomId, message, sendFunction, priority = MessagePriority.NORMAL) {
    const batcher = this.#getBatcher(roomId, sendFunction);
    return batcher.queue(message, priority);
  }
  
  /**
   * Flush room's batcher
   * @param {string} roomId - Room identifier
   */
  async flushRoom(roomId) {
    const batcher = this.#batchers.get(roomId);
    if (batcher) {
      await batcher.flush();
    }
  }
  
  /**
   * Flush all batchers
   */
  async flushAll() {
    await Promise.all(
      Array.from(this.#batchers.values()).map(b => b.flush())
    );
  }
  
  /**
   * Dispose of a room's batcher
   * @param {string} roomId - Room identifier
   */
  disposeRoom(roomId) {
    const batcher = this.#batchers.get(roomId);
    if (batcher) {
      batcher.dispose();
      this.#batchers.delete(roomId);
    }
  }
  
  /**
   * Dispose of all batchers
   */
  dispose() {
    this.#batchers.forEach(batcher => batcher.dispose());
    this.#batchers.clear();
    this.removeAllListeners();
  }
  
  /**
   * Get statistics for all rooms
   * @returns {Object}
   */
  getStats() {
    const stats = {};
    this.#batchers.forEach((batcher, roomId) => {
      stats[roomId] = batcher.getStats();
    });
    return stats;
  }
}

export default MessageBatcher;
