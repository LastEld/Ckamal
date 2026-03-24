/**
 * @fileoverview WebSocket Client with reconnection, heartbeat, and real-time features
 * @module websocket/client
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} WebSocketClientOptions
 * @property {string} url - WebSocket server URL
 * @property {boolean} [autoConnect=true] - Auto connect on creation
 * @property {boolean} [autoReconnect=true] - Auto reconnect on disconnect
 * @property {number} [reconnectInterval=1000] - Initial reconnect interval in ms
 * @property {number} [maxReconnectInterval=30000] - Maximum reconnect interval in ms
 * @property {number} [reconnectDecay=1.5] - Reconnect interval decay factor
 * @property {number} [maxReconnectAttempts=10] - Maximum reconnect attempts (0 = infinite)
 * @property {number} [heartbeatInterval=30000] - Heartbeat interval in ms
 * @property {number} [heartbeatTimeout=60000] - Heartbeat timeout in ms
 * @property {number} [connectionTimeout=10000] - Connection timeout in ms
 * @property {Object} [auth] - Authentication data
 * @property {boolean} [debug=false] - Enable debug logging
 * @property {string[]} [rooms] - Initial rooms to subscribe
 */

/**
 * @typedef {Object} ConnectionState
 * @property {boolean} isConnected - Whether client is connected
 * @property {boolean} isAuthenticated - Whether client is authenticated
 * @property {boolean} isReconnecting - Whether client is reconnecting
 * @property {number} reconnectAttempts - Number of reconnect attempts
 * @property {Date} connectedAt - Connection timestamp
 * @property {string} connectionId - Server connection ID
 * @property {string} [userId] - Authenticated user ID
 */

/**
 * Enhanced WebSocket Client with resilience features
 * @extends {EventEmitter}
 */
export class WebSocketClient extends EventEmitter {
  #ws = null;
  #options;
  #state;
  #heartbeatTimer = null;
  #reconnectTimer = null;
  #connectionTimeout = null;
  #currentReconnectInterval;
  #messageQueue = [];
  #subscribedRooms = [];
  #lastEventId = null;
  #boundBeforeUnload = null;

  /**
   * Creates a WebSocketClient instance
   * @param {WebSocketClientOptions} options - Client options
   */
  constructor(options) {
    super();

    this.#options = {
      autoConnect: true,
      autoReconnect: true,
      reconnectInterval: 1000,
      maxReconnectInterval: 30000,
      reconnectDecay: 1.5,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      heartbeatTimeout: 60000,
      connectionTimeout: 10000,
      auth: null,
      debug: false,
      rooms: [],
      ...options,
    };

    this.#state = {
      isConnected: false,
      isAuthenticated: false,
      isReconnecting: false,
      reconnectAttempts: 0,
      connectedAt: null,
      connectionId: null,
      userId: null,
    };

    this.#currentReconnectInterval = this.#options.reconnectInterval;

    if (typeof window !== 'undefined') {
      this.#boundBeforeUnload = this.#handleBeforeUnload.bind(this);
      window.addEventListener('beforeunload', this.#boundBeforeUnload);
    }

    if (this.#options.autoConnect) {
      this.connect();
    }
  }

  get state() {
    return { ...this.#state };
  }

  get isConnected() {
    return this.#state.isConnected && this.#ws?.readyState === WebSocket.OPEN;
  }

  get isAuthenticated() {
    return this.#state.isAuthenticated;
  }

  get connectionId() {
    return this.#state.connectionId;
  }

  /**
   * Connects to the WebSocket server
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }

      try {
        this.#log('Connecting to', this.#options.url);

        this.#ws = new WebSocket(this.#options.url);

        this.#connectionTimeout = setTimeout(() => {
          this.#ws?.close();
          reject(new Error('Connection timeout'));
        }, this.#options.connectionTimeout);

        this.#ws.onopen = () => {
          clearTimeout(this.#connectionTimeout);
          this.#connectionTimeout = null;
          
          this.#state.isConnected = true;
          this.#state.isReconnecting = false;
          this.#state.reconnectAttempts = 0;
          this.#state.connectedAt = new Date();
          this.#currentReconnectInterval = this.#options.reconnectInterval;

          this.#log('Connected');
          this.emit('connect');

          if (this.#options.auth) {
            this.authenticate(this.#options.auth);
          }

          this.#flushQueue();
          this.#startHeartbeat();

          resolve();
        };

        this.#ws.onmessage = (event) => {
          this.#handleMessage(event.data);
        };

        this.#ws.onclose = (event) => {
          clearTimeout(this.#connectionTimeout);
          this.#connectionTimeout = null;
          this.#handleDisconnect(event.code, event.reason);
        };

        this.#ws.onerror = (error) => {
          this.#log('Error:', error);
          this.emit('error', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnects from the server
   */
  disconnect(code = 1000, reason = '') {
    this.#options.autoReconnect = false;
    this.#cleanup();
    
    if (this.#ws) {
      this.#ws.close(code, reason);
      this.#ws = null;
    }

    this.#state.isConnected = false;
    this.#state.isAuthenticated = false;
  }

  /**
   * Authenticates with the server
   */
  authenticate(auth) {
    this.#options.auth = auth;
    this.send({ type: 'auth', ...auth });
  }

  /**
   * Reconnects with session recovery
   */
  reconnect(options = {}) {
    if (options.lastEventId) {
      this.#lastEventId = options.lastEventId;
    }

    this.send({
      type: 'reconnect',
      previousId: this.#state.connectionId,
      lastEventId: this.#lastEventId,
      rooms: this.#subscribedRooms,
    });
  }

  /**
   * Sends a message to the server
   */
  send(data) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);

    if (this.isConnected) {
      this.#ws.send(message);
      return true;
    } else {
      this.#messageQueue.push(data);
      return false;
    }
  }

  /**
   * Subscribes to a room
   */
  subscribe(room, presence = null, metadata = {}) {
    if (!this.#subscribedRooms.includes(room)) {
      this.#subscribedRooms.push(room);
    }
    this.send({ type: 'subscribe', room, presence, metadata });
  }

  /**
   * Unsubscribes from a room
   */
  unsubscribe(room) {
    this.#subscribedRooms = this.#subscribedRooms.filter(r => r !== room);
    this.send({ type: 'unsubscribe', room });
  }

  // ==================== Presence ====================

  updatePresence(room, status, data = {}) {
    this.send({ type: 'presence:update', room, status, data });
  }

  // ==================== Typing Indicators ====================

  startTyping(room, context = {}) {
    this.send({ type: 'typing:start', room, context });
  }

  stopTyping(room) {
    this.send({ type: 'typing:stop', room });
  }

  // ==================== Cursor Tracking ====================

  updateCursor(room, x, y, options = {}) {
    this.send({ type: 'cursor:update', room, x, y, ...options });
  }

  // ==================== History ====================

  getHistory(room, options = {}) {
    this.send({ type: 'history:get', room, ...options });
  }

  // ==================== Activity Feed ====================

  getActivityFeed(options = {}) {
    this.send({ type: 'activity:get', ...options });
  }

  // ==================== Notifications ====================

  markNotificationsRead(options = {}) {
    this.send({ type: 'notification:markRead', ...options });
  }

  clearNotifications(options = {}) {
    this.send({ type: 'notification:clear', ...options });
  }

  // ==================== Annotations ====================

  createAnnotation(room, annotation) {
    this.send({ type: 'annotation:create', room, ...annotation });
  }

  updateAnnotation(room, annotationId, updates) {
    this.send({ type: 'annotation:update', room, annotationId, updates });
  }

  deleteAnnotation(room, annotationId) {
    this.send({ type: 'annotation:delete', room, annotationId });
  }

  getAnnotations(room, document) {
    this.send({ type: 'annotation:get', room, document });
  }

  // ==================== Task Collaboration ====================

  subscribeToTask(taskId) {
    this.send({ type: 'task:subscribe', taskId });
  }

  unsubscribeFromTask(taskId) {
    this.send({ type: 'task:unsubscribe', taskId });
  }

  updateTask(taskId, changes) {
    this.send({ type: 'task:update', taskId, changes });
  }

  commentOnTask(taskId, comment, parentId) {
    this.send({ type: 'task:comment', taskId, comment, parentId });
  }

  assignTask(taskId, assigneeId, assigneeName) {
    this.send({ type: 'task:assign', taskId, assigneeId, assigneeName });
  }

  // ==================== Private Methods ====================

  #log(...args) {
    if (this.#options.debug) {
      console.log('[WebSocketClient]', ...args);
    }
  }

  #handleMessage(data) {
    try {
      const message = JSON.parse(data);

      // Store event ID for reconnection
      if (message.eventId) {
        this.#lastEventId = message.eventId;
      }

      switch (message.type) {
        case 'connected':
          this.#state.connectionId = message.id;
          break;

        case 'auth_success':
          this.#state.isAuthenticated = true;
          this.#state.userId = message.userId;
          this.emit('authenticated', message);
          // Re-subscribe to rooms after auth
          this.#subscribedRooms.forEach(room => this.subscribe(room));
          break;

        case 'auth_failed':
          this.#state.isAuthenticated = false;
          this.emit('auth_failed', message);
          break;

        case 'subscribed':
          this.emit('subscribed', message.room, message);
          break;

        case 'reconnected':
          this.emit('reconnected', message);
          break;

        case 'presence:updated':
        case 'presence:offline':
          this.emit('presence', message);
          break;

        case 'typing:started':
        case 'typing:stopped':
          this.emit('typing', message);
          break;

        case 'cursor:updated':
          this.emit('cursor', message);
          break;

        case 'history:response':
          this.emit('history', message.room, message.messages);
          break;

        case 'activity:response':
          this.emit('activity', message.activities);
          break;

        case 'notification:new':
        case 'notifications:count':
          this.emit('notification', message);
          break;

        case 'annotation:created':
        case 'annotation:updated':
        case 'annotation:deleted':
        case 'annotation:list':
          this.emit('annotation', message);
          break;

        case 'task:subscribed':
        case 'task:unsubscribed':
        case 'task:updated':
        case 'task:comment':
        case 'task:assigned':
          this.emit('task', message);
          break;

        case 'user:joined':
        case 'user:left':
          this.emit('user', message);
          break;

        case 'error':
          this.emit('server_error', message);
          break;

        case 'pong':
          // Heartbeat response
          break;

        default:
          this.emit('message', message);
      }

    } catch (error) {
      this.emit('parse_error', error, data);
    }
  }

  #handleDisconnect(code, reason) {
    this.#cleanup();
    this.#state.isConnected = false;

    this.#log('Disconnected:', code, reason);
    this.emit('disconnect', code, reason);

    if (this.#options.autoReconnect && this.#shouldReconnect(code)) {
      this.#scheduleReconnect();
    }
  }

  #shouldReconnect(code) {
    // Don't reconnect on normal closure or authentication failure
    const noReconnectCodes = [1000, 1001, 1008];
    return !noReconnectCodes.includes(code);
  }

  #scheduleReconnect() {
    if (this.#state.isReconnecting) return;

    const maxAttempts = this.#options.maxReconnectAttempts;
    if (maxAttempts > 0 && this.#state.reconnectAttempts >= maxAttempts) {
      this.emit('reconnect_failed');
      return;
    }

    this.#state.isReconnecting = true;
    this.#state.reconnectAttempts++;

    this.emit('reconnecting', this.#state.reconnectAttempts);

    this.#reconnectTimer = setTimeout(() => {
      this.#log(`Reconnecting (attempt ${this.#state.reconnectAttempts})...`);
      this.connect().catch(() => {
        // Calculate next interval with exponential backoff
        this.#currentReconnectInterval = Math.min(
          this.#currentReconnectInterval * this.#options.reconnectDecay,
          this.#options.maxReconnectInterval
        );
      });
    }, this.#currentReconnectInterval);
  }

  #startHeartbeat() {
    this.#heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, this.#options.heartbeatInterval);
  }

  #cleanup() {
    clearInterval(this.#heartbeatTimer);
    clearTimeout(this.#reconnectTimer);
    clearTimeout(this.#connectionTimeout);
    this.#heartbeatTimer = null;
    this.#reconnectTimer = null;
    this.#connectionTimeout = null;
    this.#state.isReconnecting = false;
  }

  #flushQueue() {
    while (this.#messageQueue.length > 0) {
      const msg = this.#messageQueue.shift();
      this.send(msg);
    }
  }

  #handleBeforeUnload() {
    this.disconnect();
  }

  destroy() {
    this.disconnect();
    if (typeof window !== 'undefined' && this.#boundBeforeUnload) {
      window.removeEventListener('beforeunload', this.#boundBeforeUnload);
    }
    this.removeAllListeners();
  }
}

/**
 * Creates a WebSocket client instance
 * @param {WebSocketClientOptions} options - Client options
 * @returns {WebSocketClient} WebSocket client instance
 */
export function createWebSocketClient(options) {
  return new WebSocketClient(options);
}

export default WebSocketClient;
