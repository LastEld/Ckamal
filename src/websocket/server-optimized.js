/**
 * @fileoverview Optimized WebSocket Server with Message Batching
 * @module websocket/server-optimized
 * @description Enhanced WebSocket server with message batching and performance optimizations
 * @version 5.0.0
 */

import { WebSocketServer } from './server.js';
import { MessageBatcher, MessagePriority, RoomMessageBatcher } from './message-batcher.js';

/**
 * Optimized WebSocket Server configuration
 * @typedef {Object} OptimizedWebSocketConfig
 * @property {boolean} [enableBatching=true] - Enable message batching
 * @property {number} [batchFlushInterval=16] - Batch flush interval
 * @property {number} [maxBatchSize=100] - Maximum messages per batch
 * @property {boolean} [enablePerRoomBatching=true] - Enable per-room batching
 * @property {boolean} [enableHeartbeatOptimization=true] - Optimize heartbeat handling
 * @property {number} [heartbeatInterval=30000] - Heartbeat interval
 * @property {number} [maxConnectionsPerClient=5] - Max connections per client
 */

/**
 * Optimized WebSocket Server with message batching
 * @extends WebSocketServer
 */
export class OptimizedWebSocketServer extends WebSocketServer {
  /** @type {Map<string, MessageBatcher>} */
  #clientBatchers;
  
  /** @type {RoomMessageBatcher} */
  #roomBatcher;
  
  /** @type {OptimizedWebSocketConfig} */
  #config;
  
  /** @type {Map<string, number>} */
  #clientConnectionCounts;
  
  /** @type {Object} */
  #stats;
  
  /** @type {NodeJS.Timeout|null} */
  #flushInterval;

  /**
   * Creates an OptimizedWebSocketServer instance
   * @param {import('http').Server} [server] - HTTP server to attach to
   * @param {OptimizedWebSocketConfig} [options={}] - Server options
   */
  constructor(server, options = {}) {
    super(server, {
      ...options,
      heartbeatInterval: options.heartbeatInterval || 30000
    });

    this.#config = {
      enableBatching: true,
      batchFlushInterval: 16,
      maxBatchSize: 100,
      enablePerRoomBatching: true,
      enableHeartbeatOptimization: true,
      heartbeatInterval: 30000,
      maxConnectionsPerClient: 5,
      ...options
    };

    this.#clientBatchers = new Map();
    this.#clientConnectionCounts = new Map();
    this.#stats = {
      messagesBatched: 0,
      messagesSent: 0,
      bytesSaved: 0,
      connectionsThrottled: 0,
      heartbeatsOptimized: 0
    };

    // Initialize room batcher
    if (this.#config.enablePerRoomBatching) {
      this.#roomBatcher = new RoomMessageBatcher({
        maxBatchSize: this.#config.maxBatchSize,
        flushInterval: this.#config.batchFlushInterval,
        compression: true
      });

      this.#roomBatcher.on('flushed', (roomId, count, latency) => {
        this.emit('room:batch:flushed', { roomId, count, latency });
      });
    }

    this.#setupOptimizedHandlers();
  }

  /**
   * Setup optimized event handlers
   * @private
   */
  #setupOptimizedHandlers() {
    // Override connection handler
    this.on('connection', (socket, req) => {
      this.#handleOptimizedConnection(socket, req);
    });

    // Setup periodic flush
    if (this.#config.enableBatching) {
      this.#flushInterval = setInterval(() => {
        this.#flushAllBatchers();
      }, this.#config.batchFlushInterval);
    }
  }

  /**
   * Handle optimized connection
   * @private
   * @param {WebSocket} socket - Client socket
   * @param {import('http').IncomingMessage} req - HTTP request
   */
  #handleOptimizedConnection(socket, req) {
    // Connection limit check
    const clientIp = req.socket?.remoteAddress || 'unknown';
    const currentConnections = this.#clientConnectionCounts.get(clientIp) || 0;
    
    if (currentConnections >= this.#config.maxConnectionsPerClient) {
      this.#stats.connectionsThrottled++;
      socket.close(1013, 'Too many connections');
      return;
    }

    this.#clientConnectionCounts.set(clientIp, currentConnections + 1);

    // Create message batcher for this client
    if (this.#config.enableBatching) {
      const batcher = new MessageBatcher(
        (data) => {
          if (socket.readyState === 1) { // WebSocket.OPEN
            socket.send(data);
          }
        },
        {
          maxBatchSize: this.#config.maxBatchSize,
          flushInterval: this.#config.batchFlushInterval,
          compression: true
        }
      );

      batcher.on('flushed', (count, latency) => {
        this.#stats.messagesBatched += count;
        this.emit('client:batch:flushed', { socketId: socket.id, count, latency });
      });

      this.#clientBatchers.set(socket.id, batcher);
      socket._batcher = batcher;
    }

    // Handle disconnect
    socket.on('close', () => {
      this.#cleanupClient(socket, clientIp);
    });
  }

  /**
   * Cleanup client resources
   * @private
   * @param {WebSocket} socket - Client socket
   * @param {string} clientIp - Client IP address
   */
  #cleanupClient(socket, clientIp) {
    // Update connection count
    const currentConnections = this.#clientConnectionCounts.get(clientIp) || 1;
    if (currentConnections <= 1) {
      this.#clientConnectionCounts.delete(clientIp);
    } else {
      this.#clientConnectionCounts.set(clientIp, currentConnections - 1);
    }

    // Dispose batcher
    const batcher = this.#clientBatchers.get(socket.id);
    if (batcher) {
      batcher.dispose();
      this.#clientBatchers.delete(socket.id);
    }
  }

  /**
   * Flush all batchers
   * @private
   */
  async #flushAllBatchers() {
    // Flush client batchers
    const promises = [];
    
    for (const batcher of this.#clientBatchers.values()) {
      promises.push(batcher.flush());
    }

    // Flush room batcher
    if (this.#roomBatcher) {
      promises.push(this.#roomBatcher.flushAll());
    }

    await Promise.all(promises);
  }

  /**
   * Send message to client with batching
   * @param {WebSocket} socket - Client socket
   * @param {*} message - Message to send
   * @param {MessagePriority} [priority=MessagePriority.NORMAL] - Message priority
   */
  sendOptimized(socket, message, priority = MessagePriority.NORMAL) {
    if (!this.#config.enableBatching || !socket._batcher) {
      return this.send(socket, message);
    }

    // Critical messages bypass batching
    if (priority === MessagePriority.CRITICAL) {
      return this.send(socket, message);
    }

    socket._batcher.queue(message, priority);
  }

  /**
   * Broadcast to room with batching
   * @param {string} room - Room name
   * @param {*} payload - Message payload
   * @param {WebSocket} [excludeSocket] - Socket to exclude
   * @param {MessagePriority} [priority=MessagePriority.NORMAL] - Message priority
   */
  broadcastToRoomOptimized(room, payload, excludeSocket = null, priority = MessagePriority.NORMAL) {
    if (!this.#config.enablePerRoomBatching || !this.#roomBatcher) {
      return this.broadcastToRoom(room, payload, excludeSocket);
    }

    // Get room info
    const roomInfo = this.getRoom?.(room);
    if (!roomInfo) return;

    // Create send function for room
    const sendFunction = (data) => {
      for (const socket of this.getClientsInRoom?.(room) || []) {
        if (socket !== excludeSocket && socket.readyState === 1) {
          socket.send(data);
        }
      }
    };

    this.#roomBatcher.queue(room, payload, sendFunction, priority);
  }

  /**
   * Optimized heartbeat for all clients
   * Batches heartbeats to reduce overhead
   */
  sendOptimizedHeartbeats() {
    if (!this.#config.enableHeartbeatOptimization) {
      return this.sendHeartbeats?.();
    }

    // Batch heartbeat messages
    const heartbeatMessage = { type: 'ping', timestamp: Date.now() };
    
    // Send via batchers if available
    for (const [socketId, batcher] of this.#clientBatchers) {
      batcher.queue(heartbeatMessage, MessagePriority.LOW);
    }

    this.#stats.heartbeatsOptimized++;
  }

  /**
   * Get room object
   * @param {string} room - Room name
   * @returns {Object|undefined}
   */
  getRoom(room) {
    // Access private rooms map from parent
    return this.rooms?.get?.(room);
  }

  /**
   * Get clients in room
   * @param {string} room - Room name
   * @returns {Array<WebSocket>}
   */
  getClientsInRoom(room) {
    const roomInfo = this.getRoom(room);
    if (!roomInfo) return [];

    const clients = [];
    for (const clientId of roomInfo.members || []) {
      const socket = this.getClient?.(clientId);
      if (socket) clients.push(socket);
    }
    return clients;
  }

  /**
   * Get client by ID
   * @param {string} id - Client ID
   * @returns {WebSocket|undefined}
   */
  getClient(id) {
    // Access private clients map from parent
    return this.clients?.get?.(id);
  }

  /**
   * Get optimized server statistics
   * @returns {Object}
   */
  getOptimizedStats() {
    const baseStats = this.getStats?.() || {};
    
    return {
      ...baseStats,
      optimization: {
        ...this.#stats,
        clientBatchers: this.#clientBatchers.size,
        activeRooms: this.#roomBatcher ? Object.keys(this.#roomBatcher.getStats?.() || {}).length : 0,
        connectionsPerClient: Object.fromEntries(this.#clientConnectionCounts)
      },
      batcherStats: this.#getBatcherStats()
    };
  }

  /**
   * Get batcher statistics
   * @private
   * @returns {Object}
   */
  #getBatcherStats() {
    const stats = {
      clients: {},
      rooms: {}
    };

    for (const [id, batcher] of this.#clientBatchers) {
      stats.clients[id] = batcher.getStats();
    }

    if (this.#roomBatcher) {
      stats.rooms = this.#roomBatcher.getStats();
    }

    return stats;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.#stats = {
      messagesBatched: 0,
      messagesSent: 0,
      bytesSaved: 0,
      connectionsThrottled: 0,
      heartbeatsOptimized: 0
    };

    for (const batcher of this.#clientBatchers.values()) {
      batcher.resetStats();
    }

    if (this.#roomBatcher) {
      this.#roomBatcher.getStats(); // Reset not implemented in RoomMessageBatcher
    }
  }

  /**
   * Stop the server
   */
  async stop() {
    // Flush all batchers before stopping
    await this.#flushAllBatchers();

    // Dispose all batchers
    for (const batcher of this.#clientBatchers.values()) {
      batcher.dispose();
    }
    this.#clientBatchers.clear();

    if (this.#roomBatcher) {
      this.#roomBatcher.dispose();
    }

    if (this.#flushInterval) {
      clearInterval(this.#flushInterval);
    }

    // Call parent stop
    return super.stop?.();
  }

  /**
   * Send message to socket (compatibility with parent)
   * @param {WebSocket} socket - Client socket
   * @param {*} message - Message to send
   * @protected
   */
  send(socket, message) {
    if (socket.readyState === 1) { // WebSocket.OPEN
      const data = typeof message === 'string' ? message : JSON.stringify(message);
      socket.send(data);
      this.#stats.messagesSent++;
    }
  }

  /**
   * Broadcast to room (compatibility with parent)
   * @param {string} room - Room name
   * @param {*} payload - Message payload
   * @param {WebSocket} [excludeSocket] - Socket to exclude
   */
  broadcastToRoom(room, payload, excludeSocket = null) {
    const clients = this.getClientsInRoom(room);
    for (const socket of clients) {
      if (socket !== excludeSocket) {
        this.send(socket, payload);
      }
    }
  }
}

export default OptimizedWebSocketServer;
