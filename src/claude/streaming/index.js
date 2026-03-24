/**
 * @fileoverview Stream Manager for CogniMesh v5.0
 * Handles WebSocket and SSE streaming connections
 * @module claude/streaming
 */

import { StreamProtocol, MessageType, createProtocol } from './protocol.js';

/**
 * Connection states
 * @enum {string}
 */
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  CLOSING: 'closing',
  CLOSED: 'closed',
  ERROR: 'error',
};

/**
 * Stream transport types
 * @enum {string}
 */
export const TransportType = {
  WEBSOCKET: 'websocket',
  SSE: 'sse',
};

/**
 * Stream Manager for handling WebSocket and SSE connections
 * @class StreamManager
 */
export class StreamManager {
  /**
   * Create a StreamManager instance
   * @param {Object} options - Stream options
   * @param {string} [options.url] - WebSocket/SSE endpoint URL
   * @param {string} [options.transport='websocket'] - Transport type ('websocket' | 'sse')
   * @param {Object} [options.auth] - Subscription authentication data
   * @param {string} [options.auth.token] - Subscription token
   * @param {string} [options.auth.subscriptionId] - Subscription ID
   * @param {Object} [options.protocol] - Protocol options passed to StreamProtocol
   * @param {boolean} [options.autoReconnect=true] - Auto-reconnect on disconnect
   * @param {number} [options.reconnectDelay=1000] - Reconnect delay in ms
   * @param {number} [options.maxReconnectAttempts=5] - Max reconnection attempts
   * @param {number} [options.pingInterval=30000] - Ping interval in ms
   * @param {number} [options.messageTimeout=10000] - Message timeout in ms
   */
  constructor(options = {}) {
    /** @type {string|null} */
    this.url = options.url || null;
    /** @type {TransportType} */
    this.transport = options.transport || TransportType.WEBSOCKET;
    /** @type {Object|null} */
    this.auth = options.auth || null;
    /** @type {StreamProtocol} */
    this.protocol = createProtocol(options.protocol);
    
    /** @type {boolean} */
    this.autoReconnect = options.autoReconnect !== false;
    /** @type {number} */
    this.reconnectDelay = options.reconnectDelay || 1000;
    /** @type {number} */
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    /** @type {number} */
    this.pingInterval = options.pingInterval || 30000;
    /** @type {number} */
    this.messageTimeout = options.messageTimeout || 10000;

    /** @type {ConnectionState} */
    this._state = ConnectionState.DISCONNECTED;
    /** @type {WebSocket|EventSource|null} */
    this._connection = null;
    /** @type {string|null} */
    this._conversationId = null;
    /** @type {number} */
    this._reconnectAttempts = 0;
    /** @type {number|null} */
    this._pingTimer = null;
    /** @type {number|null} */
    this._reconnectTimer = null;
    /** @type {Map<string,Function>} */
    this._pendingMessages = new Map();
    /** @type {number} */
    this._messageId = 0;
    
    // Callbacks
    /** @type {Function|null} */
    this._onDataCallback = null;
    /** @type {Function|null} */
    this._onErrorCallback = null;
    /** @type {Function|null} */
    this._onConnectCallback = null;
    /** @type {Function|null} */
    this._onDisconnectCallback = null;
    /** @type {Function|null} */
    this._onStateChangeCallback = null;

    /** @type {boolean} */
    this._cleanupScheduled = false;
  }

  /**
   * Set connection state and notify listeners
   * @param {ConnectionState} state - New state
   * @private
   */
  _setState(state) {
    const prevState = this._state;
    this._state = state;
    if (this._onStateChangeCallback && prevState !== state) {
      this._onStateChangeCallback(state, prevState);
    }
  }

  /**
   * Initialize WebSocket connection
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<void>}
   * @private
   */
  async _initWebSocket(conversationId) {
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not supported in this environment');
    }

    const url = new URL(this.url);
    url.searchParams.set('conversationId', conversationId);
    url.searchParams.set('protocol', this.protocol.getVersion());
    
    if (this.auth?.subscriptionId) {
      url.searchParams.set('subscription', this.auth.subscriptionId);
    }

    return new Promise((resolve, reject) => {
      try {
        this._connection = new WebSocket(url.toString());
        this._connection.binaryType = 'arraybuffer';

        const connectTimeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.messageTimeout);

        this._connection.onopen = () => {
          clearTimeout(connectTimeout);
          this._setState(ConnectionState.CONNECTED);
          this._reconnectAttempts = 0;
          this._startPingTimer();
          resolve();
        };

        this._connection.onmessage = async (event) => {
          await this._handleMessage(event.data);
        };

        this._connection.onclose = (event) => {
          clearTimeout(connectTimeout);
          this._handleDisconnect(event.code, event.reason);
        };

        this._connection.onerror = (error) => {
          clearTimeout(connectTimeout);
          this._handleError(error);
          reject(error);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Initialize SSE connection
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<void>}
   * @private
   */
  async _initSSE(conversationId) {
    if (typeof EventSource === 'undefined') {
      throw new Error('EventSource is not supported in this environment');
    }

    const url = new URL(this.url);
    url.searchParams.set('conversationId', conversationId);
    url.searchParams.set('protocol', this.protocol.getVersion());
    url.searchParams.set('transport', 'sse');
    
    if (this.auth?.subscriptionId) {
      url.searchParams.set('subscription', this.auth.subscriptionId);
    }

    return new Promise((resolve, reject) => {
      try {
        this._connection = new EventSource(url.toString());

        const connectTimeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.messageTimeout);

        this._connection.onopen = () => {
          clearTimeout(connectTimeout);
          this._setState(ConnectionState.CONNECTED);
          this._reconnectAttempts = 0;
          this._startPingTimer();
          resolve();
        };

        this._connection.onmessage = async (event) => {
          // SSE sends data as text
          await this._handleMessage(event.data);
        };

        this._connection.onerror = (error) => {
          clearTimeout(connectTimeout);
          if (this._state === ConnectionState.CONNECTING) {
            reject(new Error('SSE connection failed'));
          } else {
            this._handleError(error);
          }
        };

        // Custom event for disconnect
        this._connection.addEventListener('close', (event) => {
          this._handleDisconnect(event.code, event.reason);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Handle incoming message
   * @param {string|ArrayBuffer} data - Raw message data
   * @private
   */
  async _handleMessage(data) {
    try {
      const frame = await this.protocol.decode(data);

      // Handle ping/pong
      if (frame.type === MessageType.PING) {
        await this._sendPong(frame.payload.timestamp);
        return;
      }

      if (frame.type === MessageType.PONG) {
        // Calculate latency if needed
        return;
      }

      // Resolve pending message if it's a response
      const pendingId = `msg-${frame.sequence}`;
      const pending = this._pendingMessages.get(pendingId);
      if (pending) {
        clearTimeout(pending.timeout);
        this._pendingMessages.delete(pendingId);
        pending.resolve(frame);
        return;
      }

      // Notify data callback
      if (this._onDataCallback) {
        this._onDataCallback(frame.payload, frame);
      }
    } catch (err) {
      this._handleError(err);
    }
  }

  /**
   * Send pong response
   * @param {number} pingTimestamp - Timestamp from ping
   * @private
   */
  async _sendPong(pingTimestamp) {
    try {
      const frame = await this.protocol.encodePong(pingTimestamp);
      await this._sendRaw(frame);
    } catch (err) {
      // Silently ignore pong errors
    }
  }

  /**
   * Send raw data over connection
   * @param {string|Uint8Array} data - Data to send
   * @private
   */
  _sendRaw(data) {
    if (!this._connection) {
      throw new Error('Not connected');
    }

    if (this.transport === TransportType.WEBSOCKET) {
      this._connection.send(data);
    } else if (this.transport === TransportType.SSE) {
      // SSE is server-to-client only for data
      // Client sends via separate POST endpoint
      throw new Error('SSE does not support client-to-server streaming');
    }
  }

  /**
   * Handle disconnection
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   * @private
   */
  _handleDisconnect(code, reason) {
    this._stopPingTimer();
    
    const wasConnected = this._state === ConnectionState.CONNECTED;
    this._setState(ConnectionState.DISCONNECTED);

    if (this._onDisconnectCallback) {
      this._onDisconnectCallback(code, reason);
    }

    // Auto-reconnect if enabled and not intentionally closed
    if (this.autoReconnect && wasConnected && code !== 1000) {
      this._scheduleReconnect();
    }
  }

  /**
   * Handle error
   * @param {Error} error - Error object
   * @private
   */
  _handleError(error) {
    this._setState(ConnectionState.ERROR);
    if (this._onErrorCallback) {
      this._onErrorCallback(error);
    }
  }

  /**
   * Schedule reconnection attempt
   * @private
   */
  _scheduleReconnect() {
    if (this._reconnectAttempts >= this.maxReconnectAttempts) {
      this._setState(ConnectionState.CLOSED);
      return;
    }

    this._reconnectAttempts++;
    this._setState(ConnectionState.RECONNECTING);

    this._reconnectTimer = setTimeout(async () => {
      if (this._conversationId) {
        try {
          await this.createStream(this._conversationId);
        } catch (err) {
          this._handleError(err);
        }
      }
    }, this.reconnectDelay * this._reconnectAttempts);
  }

  /**
   * Start ping timer
   * @private
   */
  _startPingTimer() {
    this._stopPingTimer();
    this._pingTimer = setInterval(async () => {
      try {
        const ping = await this.protocol.encodePing();
        await this._sendRaw(ping);
      } catch {
        // Ping failure may indicate connection issues
      }
    }, this.pingInterval);
  }

  /**
   * Stop ping timer
   * @private
   */
  _stopPingTimer() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  /**
   * Create a new stream connection
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<void>}
   * @throws {Error} If authentication is missing or connection fails
   */
  async createStream(conversationId) {
    if (!this.auth?.subscriptionId) {
      throw new Error('Subscription authentication required');
    }

    if (!this.url) {
      throw new Error('Stream URL not configured');
    }

    if (this._state === ConnectionState.CONNECTING || 
        this._state === ConnectionState.CONNECTED) {
      await this.endStream();
    }

    this._conversationId = conversationId;
    this._setState(ConnectionState.CONNECTING);

    try {
      // Send connect message
      const connectFrame = await this.protocol.encodeConnect(conversationId, this.auth);

      if (this.transport === TransportType.WEBSOCKET) {
        await this._initWebSocket(conversationId);
      } else if (this.transport === TransportType.SSE) {
        await this._initSSE(conversationId);
      } else {
        throw new Error(`Unknown transport: ${this.transport}`);
      }

      // Send initial connect message over WebSocket
      if (this.transport === TransportType.WEBSOCKET) {
        await this._sendRaw(connectFrame);
      }

      if (this._onConnectCallback) {
        this._onConnectCallback(conversationId);
      }
    } catch (err) {
      this._setState(ConnectionState.ERROR);
      throw err;
    }
  }

  /**
   * Send a chunk over the stream
   * @param {Object} chunk - Chunk data
   * @param {string} [chunk.type='text'] - Content type
   * @param {string} chunk.content - Content data
   * @param {Object} [chunk.metadata] - Additional metadata
   * @returns {Promise<void>}
   * @throws {Error} If not connected
   */
  async sendChunk(chunk) {
    if (this._state !== ConnectionState.CONNECTED) {
      throw new Error('Stream not connected');
    }

    if (this.transport === TransportType.SSE) {
      throw new Error('Cannot send chunks over SSE (server-to-client only)');
    }

    const frame = await this.protocol.encodeDelta(chunk);
    await this._sendRaw(frame);
  }

  /**
   * End the stream gracefully
   * @param {Object} [metadata] - End metadata
   * @returns {Promise<void>}
   */
  async endStream(metadata = {}) {
    if (this._state === ConnectionState.CLOSED || 
        this._state === ConnectionState.DISCONNECTED) {
      return;
    }

    this._setState(ConnectionState.CLOSING);
    this.autoReconnect = false; // Prevent reconnection on intentional close

    try {
      if (this._state === ConnectionState.CONNECTED && this._connection) {
        const disconnectFrame = await this.protocol.encodeDisconnect('client_close');
        await this._sendRaw(disconnectFrame);
        
        // Send done frame with metadata
        const doneFrame = await this.protocol.encodeDone(metadata);
        await this._sendRaw(doneFrame);
      }
    } catch {
      // Ignore errors during close
    }

    this._cleanup();
  }

  /**
   * Clean up resources
   * @private
   */
  _cleanup() {
    this._stopPingTimer();
    
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    // Clear pending messages
    for (const [id, pending] of this._pendingMessages) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
      this._pendingMessages.delete(id);
    }

    if (this._connection) {
      if (this.transport === TransportType.WEBSOCKET) {
        this._connection.close(1000, 'Client closed');
      } else if (this.transport === TransportType.SSE) {
        this._connection.close();
      }
      this._connection = null;
    }

    this._conversationId = null;
    this._setState(ConnectionState.CLOSED);
  }

  /**
   * Set data callback
   * @param {Function} callback - Callback function(payload, frame)
   * @returns {StreamManager} This instance for chaining
   */
  onData(callback) {
    this._onDataCallback = callback;
    return this;
  }

  /**
   * Set error callback
   * @param {Function} callback - Callback function(error)
   * @returns {StreamManager} This instance for chaining
   */
  onError(callback) {
    this._onErrorCallback = callback;
    return this;
  }

  /**
   * Set connect callback
   * @param {Function} callback - Callback function(conversationId)
   * @returns {StreamManager} This instance for chaining
   */
  onConnect(callback) {
    this._onConnectCallback = callback;
    return this;
  }

  /**
   * Set disconnect callback
   * @param {Function} callback - Callback function(code, reason)
   * @returns {StreamManager} This instance for chaining
   */
  onDisconnect(callback) {
    this._onDisconnectCallback = callback;
    return this;
  }

  /**
   * Set state change callback
   * @param {Function} callback - Callback function(newState, oldState)
   * @returns {StreamManager} This instance for chaining
   */
  onStateChange(callback) {
    this._onStateChangeCallback = callback;
    return this;
  }

  /**
   * Get current connection state
   * @returns {ConnectionState}
   */
  getState() {
    return this._state;
  }

  /**
   * Get current conversation ID
   * @returns {string|null}
   */
  getConversationId() {
    return this._conversationId;
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this._state === ConnectionState.CONNECTED;
  }

  /**
   * Get transport type
   * @returns {TransportType}
   */
  getTransport() {
    return this.transport;
  }

  /**
   * Destroy the stream manager and cleanup all resources
   */
  destroy() {
    this.endStream();
    this.protocol.close();
    
    // Clear all callbacks
    this._onDataCallback = null;
    this._onErrorCallback = null;
    this._onConnectCallback = null;
    this._onDisconnectCallback = null;
    this._onStateChangeCallback = null;
  }
}

/**
 * Create a new StreamManager instance
 * @param {Object} options - Stream options
 * @returns {StreamManager}
 */
export function createStreamManager(options = {}) {
  return new StreamManager(options);
}

export { StreamProtocol, MessageType, createProtocol };
export default StreamManager;
