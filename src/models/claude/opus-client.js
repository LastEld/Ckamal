/**
 * @fileoverview Claude Opus 4.6 Native Client
 * @module models/claude/opus-client
 * 
 * Deep native integration with Claude Opus 4.6:
 * - Native protocol implementation (not API wrapper)
 * - Session-based authentication
 * - 1M token context window management
 * - Streaming support with WebSocket (ws://localhost:3456)
 * - Context compression and prioritization
 * - Cost tracking integration
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { OpusConfig } from './opus-config.js';
import { OpusSessionManager, SessionState, SessionError } from './opus-session.js';
import { ContextCompressor } from '../../claude/context/compressor.js';
import { StreamProtocol, MessageType } from '../../claude/streaming/protocol.js';

/**
 * Error types for Opus client
 */
export class OpusClientError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'OpusClientError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Claude Opus 4.6 Native Client
 * Implements deep integration with Claude Desktop/App via native protocol
 * @extends EventEmitter
 */
export class OpusClient extends EventEmitter {
  #config;
  #sessionManager;
  #compressor;
  #protocol;
  #ws;
  #currentSession;
  #connectionState;
  #messageQueue;
  #heartbeatTimer;
  #reconnectAttempts;
  #streamCallbacks;
  #pendingCompletion;
  #completionBuffer;
  
  /**
   * Connection states
   * @enum {string}
   */
  static ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    AUTHENTICATING: 'authenticating',
    READY: 'ready',
    ERROR: 'error',
    RECONNECTING: 'reconnecting',
  };
  
  /**
   * Creates an OpusClient instance
   * @param {Object} options - Client options
   * @param {string} [options.sessionToken] - Claude session token
   * @param {string} [options.websocketUrl] - WebSocket URL
   * @param {Object} [options.config] - OpusConfig instance or options
   * @param {Object} [options.sessionManager] - SessionManager instance or options
   */
  constructor(options = {}) {
    super();
    
    // Initialize config
    this.#config = options.config instanceof OpusConfig 
      ? options.config 
      : new OpusConfig(options.config || {});
    
    // Initialize session manager
    this.#sessionManager = options.sessionManager instanceof OpusSessionManager
      ? options.sessionManager
      : new OpusSessionManager(options.sessionManager || {});
    
    // Initialize compressor for 1M context management
    this.#compressor = new ContextCompressor({
      minChunkSize: 100,
      maxChunkSize: 5000,
      preserveStructure: true,
    });
    
    // Initialize protocol handler
    this.#protocol = new StreamProtocol({
      version: '4.6.0',
      compression: true,
      maxPayloadSize: 10 * 1024 * 1024, // 10MB
    });
    
    this.#ws = null;
    this.#currentSession = null;
    this.#connectionState = OpusClient.ConnectionState.DISCONNECTED;
    this.#messageQueue = [];
    this.#heartbeatTimer = null;
    this.#reconnectAttempts = 0;
    this.#streamCallbacks = new Map();
    this.#pendingCompletion = null;
    this.#completionBuffer = '';
    
    this.#setupEventHandlers();
  }
  
  /**
   * Sets up internal event handlers
   * @private
   */
  #setupEventHandlers() {
    // Forward session manager events
    this.#sessionManager.on('session:created', (data) => this.emit('session:created', data));
    this.#sessionManager.on('session:recovered', (data) => this.emit('session:recovered', data));
    this.#sessionManager.on('session:closed', (data) => this.emit('session:closed', data));
    this.#sessionManager.on('session:expired', (data) => this.emit('session:expired', data));
    
    // Forward config events
    this.#config.on('cost:recorded', (data) => this.emit('cost:recorded', data));
    this.#config.on('budget:warning', (data) => this.emit('budget:warning', data));
    this.#config.on('budget:exceeded', (data) => this.emit('budget:exceeded', data));
  }
  
  // ==================== Connection Management ====================
  
  /**
   * Gets current connection state
   * @returns {string} Connection state
   */
  get connectionState() {
    return this.#connectionState;
  }
  
  /**
   * Checks if client is ready for requests
   * @returns {boolean} Whether client is ready
   */
  get isReady() {
    return this.#connectionState === OpusClient.ConnectionState.READY;
  }
  
  /**
   * Initializes the client and establishes connection
   * @param {Object} options - Initialization options
   * @param {string} [options.sessionToken] - Session token for authentication
   * @param {string} [options.sessionId] - Existing session ID to recover
   * @returns {Promise<void>}
   * @throws {OpusClientError} On connection failure
   */
  async initialize(options = {}) {
    if (this.isReady) {
      return;
    }
    
    this.#setConnectionState(OpusClient.ConnectionState.CONNECTING);
    
    try {
      await this.#connectWebSocket(options.sessionToken);
      
      // Recover or create session
      if (options.sessionId) {
        this.#currentSession = await this.#sessionManager.recoverSession(
          options.sessionId,
          this.#ws.id || 'ws_unknown'
        );
      }
      
      if (!this.#currentSession) {
        this.#currentSession = await this.#sessionManager.createSession(
          options.userId || 'default',
          { metadata: options.sessionMetadata }
        );
        this.#currentSession.activate(this.#ws.id || 'ws_unknown');
      }
      
      this.#setConnectionState(OpusClient.ConnectionState.READY);
      this.#reconnectAttempts = 0;
      
      this.emit('initialized', { 
        sessionId: this.#currentSession.id,
        connectionState: this.#connectionState,
      });
      
    } catch (error) {
      this.#setConnectionState(OpusClient.ConnectionState.ERROR);
      throw new OpusClientError(
        `Failed to initialize: ${error.message}`,
        'INIT_ERROR',
        { cause: error }
      );
    }
  }
  
  /**
   * Connects to WebSocket server
   * @private
   * @param {string} sessionToken - Session token
   * @returns {Promise<void>}
   */
  #connectWebSocket(sessionToken) {
    return new Promise((resolve, reject) => {
      const config = this.#config.getConfig();
      
      this.#ws = new WebSocket(config.websocketUrl, {
        headers: {
          'Authorization': `Bearer ${sessionToken || process.env.CLAUDE_SESSION_TOKEN}`,
          'X-Client-Version': '4.6.0',
          'X-Model': 'claude-opus-4-6',
        },
        handshakeTimeout: config.connectionTimeout,
      });
      
      this.#ws.on('open', () => {
        this.#setConnectionState(OpusClient.ConnectionState.CONNECTED);
        this.#startHeartbeat();
        this.#flushMessageQueue();
        resolve();
      });
      
      this.#ws.on('message', (data) => {
        this.#handleMessage(data);
      });
      
      this.#ws.on('close', (code, reason) => {
        this.#handleDisconnect(code, reason);
      });
      
      this.#ws.on('error', (error) => {
        reject(error);
      });
    });
  }
  
  /**
   * Handles incoming WebSocket messages
   * @private
   * @param {Buffer|ArrayBuffer|Buffer[]} data - Message data
   */
  async #handleMessage(data) {
    try {
      const frame = await this.#protocol.decode(data);
      
      switch (frame.type) {
        case MessageType.DELTA:
          this.#handleDelta(frame.payload);
          break;
          
        case MessageType.DONE:
          this.#handleDone(frame.payload);
          break;
          
        case MessageType.ERROR:
          this.#handleError(frame.payload);
          break;
          
        case MessageType.PONG:
          // Heartbeat response
          break;
          
        default:
          this.emit('message', frame);
      }
    } catch (error) {
      this.emit('protocol:error', error);
    }
  }
  
  /**
   * Handles delta/streaming messages
   * @private
   * @param {Object} payload - Delta payload
   */
  #handleDelta(payload) {
    const { streamId, content, type } = payload;

    if (this.#pendingCompletion && type === 'text' && typeof content === 'string') {
      this.#completionBuffer += content;
    }
    
    if (this.#streamCallbacks.has(streamId)) {
      const callbacks = this.#streamCallbacks.get(streamId);
      
      if (type === 'text' && callbacks.onChunk) {
        callbacks.onChunk(content);
      } else if (type === 'thinking' && callbacks.onThinking) {
        callbacks.onThinking(content);
      }
    }
    
    this.emit('delta', payload);
  }
  
  /**
   * Handles stream completion
   * @private
   * @param {Object} payload - Done payload
   */
  #handleDone(payload) {
    const { streamId, usage, finishReason } = payload;
    
    // Record usage costs
    if (usage) {
      this.#config.recordUsage(
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        this.#currentSession?.id
      );
    }
    
    if (this.#streamCallbacks.has(streamId)) {
      const callbacks = this.#streamCallbacks.get(streamId);
      if (callbacks.onDone) {
        callbacks.onDone({ usage, finishReason });
      }
      this.#streamCallbacks.delete(streamId);
    }

    if (this.#pendingCompletion) {
      const content = typeof payload.content === 'string'
        ? payload.content
        : this.#completionBuffer;

      if (content && this.#currentSession) {
        this.#currentSession.addMessage({
          role: 'assistant',
          content,
        });
      }

      this.#resolveCompletion({
        content,
        usage,
        finishReason,
        streamId,
      });
    }
    
    this.emit('done', payload);
  }
  
  /**
   * Handles error messages
   * @private
   * @param {Object} payload - Error payload
   */
  #handleError(payload) {
    const { streamId, code, message } = payload;
    
    if (streamId && this.#streamCallbacks.has(streamId)) {
      const callbacks = this.#streamCallbacks.get(streamId);
      if (callbacks.onError) {
        callbacks.onError(new OpusClientError(message, code, payload));
      }
      this.#streamCallbacks.delete(streamId);
    }

    if (this.#pendingCompletion) {
      this.#rejectCompletion(new OpusClientError(message, code, payload));
    }
    
    this.emit('error', new OpusClientError(message, code, payload));
  }
  
  /**
   * Handles WebSocket disconnection
   * @private
   * @param {number} code - Close code
   * @param {Buffer} reason - Close reason
   */
  #handleDisconnect(code, reason) {
    this.#stopHeartbeat();
    
    const shouldReconnect = code !== 1000 && code !== 1001;
    
    if (shouldReconnect && this.#reconnectAttempts < this.#config.getConfig().maxReconnectAttempts) {
      this.#setConnectionState(OpusClient.ConnectionState.RECONNECTING);
      this.#scheduleReconnect();
    } else {
      this.#setConnectionState(OpusClient.ConnectionState.DISCONNECTED);
      if (this.#currentSession) {
        this.#currentSession.pause();
      }
      if (this.#pendingCompletion) {
        this.#rejectCompletion(new OpusClientError('Connection closed', 'DISCONNECTED', { code }));
      }
    }
    
    this.emit('disconnect', { code, reason: reason?.toString() });
  }
  
  /**
   * Schedules a reconnection attempt
   * @private
   */
  #scheduleReconnect() {
    this.#reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.#reconnectAttempts), 30000);
    
    this.emit('reconnecting', { attempt: this.#reconnectAttempts, delay });
    
    setTimeout(() => {
      this.initialize().catch(() => {
        // Reconnection handled in error handler
      });
    }, delay);
  }
  
  /**
   * Starts heartbeat timer
   * @private
   */
  #startHeartbeat() {
    const interval = this.#config.getConfig().heartbeatInterval;
    this.#heartbeatTimer = setInterval(() => {
      if (this.#ws?.readyState === WebSocket.OPEN) {
        this.#protocol.encodePing().then(ping => {
          this.#ws.send(ping);
        });
      }
    }, interval);
  }
  
  /**
   * Stops heartbeat timer
   * @private
   */
  #stopHeartbeat() {
    if (this.#heartbeatTimer) {
      clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
  }
  
  /**
   * Sets connection state and emits event
   * @private
   * @param {string} state - New state
   */
  #setConnectionState(state) {
    this.#connectionState = state;
    this.emit('state:change', state);
  }

  /**
   * Creates a completion promise for the current request.
   * @private
   * @returns {Promise<Object>}
   */
  #createCompletionPromise() {
    if (this.#pendingCompletion) {
      return Promise.reject(
        new OpusClientError('A request is already pending', 'REQUEST_PENDING')
      );
    }

    this.#completionBuffer = '';

    return new Promise((resolve, reject) => {
      this.#pendingCompletion = { resolve, reject };
    });
  }

  /**
   * Creates a standard response promise.
   * @private
   * @returns {Promise<Object>}
   */
  #createResponsePromise() {
    return this.#createCompletionPromise();
  }

  /**
   * Creates a stream response promise.
   * @private
   * @returns {Promise<Object>}
   */
  #createStreamPromise() {
    return this.#createCompletionPromise();
  }

  /**
   * Resolves the pending completion promise.
   * @private
   * @param {Object} result - Completion result
   */
  #resolveCompletion(result) {
    if (!this.#pendingCompletion) {
      return;
    }

    const { resolve } = this.#pendingCompletion;
    this.#pendingCompletion = null;
    resolve(result);
  }

  /**
   * Rejects the pending completion promise.
   * @private
   * @param {Error} error - Completion error
   */
  #rejectCompletion(error) {
    if (!this.#pendingCompletion) {
      return;
    }

    const { reject } = this.#pendingCompletion;
    this.#pendingCompletion = null;
    reject(error);
  }
  
  /**
   * Flushes queued messages
   * @private
   */
  #flushMessageQueue() {
    while (this.#messageQueue.length > 0 && this.isReady) {
      const msg = this.#messageQueue.shift();
      this.#sendFrame(msg);
    }
  }
  
  /**
   * Sends a frame via WebSocket
   * @private
   * @param {string|Buffer} frame - Frame to send
   */
  #sendFrame(frame) {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(frame);
    } else {
      this.#messageQueue.push(frame);
    }
  }
  
  // ==================== Public API ====================
  
  /**
   * Sends a message to Claude Opus
   * @param {string|Object} message - Message content or object
   * @param {Object} options - Send options
   * @param {boolean} [options.stream=false] - Enable streaming
   * @param {number} [options.maxTokens] - Max output tokens
   * @param {boolean} [options.enableThinking] - Enable extended thinking
   * @returns {Promise<Object>} Response from Claude
   * @throws {OpusClientError} If not ready or request fails
   */
  async send(message, options = {}) {
    if (!this.isReady) {
      throw new OpusClientError('Client not initialized', 'NOT_READY');
    }
    
    const config = this.#config.getConfig();
    const content = typeof message === 'string' ? message : message.content;
    
    // Add message to session
    this.#currentSession.addMessage({
      role: 'user',
      content,
    });
    
    // Check and manage context
    await this.#manageContext();
    
    const request = {
      type: 'message',
      sessionId: this.#currentSession.id,
      messages: this.#currentSession.getContext().messages,
      options: {
        model: config.modelId,
        max_tokens: options.maxTokens || config.maxOutputTokens,
        stream: options.stream ?? false,
        thinking: options.enableThinking ? {
          type: 'enabled',
          budget_tokens: config.thinkingBudget,
        } : undefined,
      },
    };
    
    const frame = await this.#protocol.encode(MessageType.CONNECT, request);
    this.#sendFrame(frame);
    
    if (options.stream) {
      return this.#createStreamPromise();
    }
    
    return this.#createResponsePromise();
  }
  
  /**
   * Streams a response from Claude Opus
   * @param {Object} request - Request object
   * @param {Function} callback - Callback for stream events
   * @param {Function} [callback.onChunk] - Called on each content chunk
   * @param {Function} [callback.onThinking] - Called on thinking chunks
   * @param {Function} [callback.onDone] - Called when stream completes
   * @param {Function} [callback.onError] - Called on error
   * @returns {Promise<string>} Complete response
   * @throws {OpusClientError} If not ready or stream fails
   */
  async stream(request, callback) {
    if (!this.isReady) {
      throw new OpusClientError('Client not initialized', 'NOT_READY');
    }
    
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Register callbacks
    this.#streamCallbacks.set(streamId, callback);
    
    const config = this.#config.getConfig();
    const streamRequest = {
      type: 'stream',
      streamId,
      sessionId: this.#currentSession.id,
      messages: request.messages || [{ role: 'user', content: request.message || request }],
      options: {
        model: config.modelId,
        max_tokens: request.maxTokens || config.maxOutputTokens,
        stream: true,
        thinking: request.enableThinking ? {
          type: 'enabled',
          budget_tokens: config.thinkingBudget,
        } : undefined,
      },
    };
    
    const frame = await this.#protocol.encode(MessageType.CONNECT, streamRequest);
    this.#sendFrame(frame);
    
    // Return promise that resolves when stream completes
    return new Promise((resolve, reject) => {
      const chunks = [];
      
      const originalOnDone = callback.onDone;
      const originalOnError = callback.onError;
      
      callback.onDone = (result) => {
        const fullContent = chunks.join('');
        
        // Add response to session
        this.#currentSession.addMessage({
          role: 'assistant',
          content: fullContent,
        });
        
        if (originalOnDone) originalOnDone(result);
        resolve(fullContent);
      };
      
      callback.onError = (error) => {
        if (originalOnError) originalOnError(error);
        reject(error);
      };
      
      // Intercept chunks to build full response
      const originalOnChunk = callback.onChunk;
      callback.onChunk = (chunk) => {
        chunks.push(chunk);
        if (originalOnChunk) originalOnChunk(chunk);
      };
    });
  }
  
  /**
   * Uploads a file to the session
   * @param {string} filePath - Path to file
   * @param {Object} [options] - Upload options
   * @returns {Promise<Object>} Upload result
   * @throws {OpusClientError} If upload fails
   */
  async uploadFile(filePath, options = {}) {
    if (!this.isReady) {
      throw new OpusClientError('Client not initialized', 'NOT_READY');
    }
    
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const stats = await fs.stat(filePath);
      
      // Validate file
      const validation = this.#config.validateFile({
        name: path.basename(filePath),
        size: stats.size,
      });
      
      if (!validation.valid) {
        throw new OpusClientError(
          `File validation failed: ${validation.errors.join(', ')}`,
          'VALIDATION_ERROR'
        );
      }
      
      const content = await fs.readFile(filePath, 'utf8');
      const fileData = {
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        content,
        uploadedAt: Date.now(),
      };
      
      this.#currentSession.addFile(fileData);
      
      // Send file to Claude
      const request = {
        type: 'file_upload',
        sessionId: this.#currentSession.id,
        file: fileData,
      };
      
      const frame = await this.#protocol.encode(MessageType.CONNECT, request);
      this.#sendFrame(frame);
      
      this.emit('file:uploaded', { filePath, size: stats.size });
      
      return {
        success: true,
        file: fileData,
        warnings: validation.warnings,
      };
      
    } catch (error) {
      if (error instanceof OpusClientError) throw error;
      throw new OpusClientError(
        `File upload failed: ${error.message}`,
        'UPLOAD_ERROR',
        { filePath }
      );
    }
  }
  
  /**
   * Gets conversation history for current session
   * @param {Object} [options] - History options
   * @param {number} [options.limit] - Maximum messages to return
   * @param {number} [options.offset=0] - Message offset
   * @returns {Array<Object>} Message history
   */
  getConversationHistory(options = {}) {
    if (!this.#currentSession) {
      return [];
    }
    
    const messages = this.#currentSession.getContext().messages;
    const offset = options.offset || 0;
    const limit = options.limit || messages.length;
    
    return messages.slice(offset, offset + limit);
  }
  
  /**
   * Compresses context to fit within limits
   * @param {number} [targetTokens] - Target token count (defaults to optimal context)
   * @returns {Object} Compression result
   */
  compressContext(targetTokens) {
    const config = this.#config.getConfig();
    const target = targetTokens || config.optimalContext;
    
    const context = this.#currentSession.getContext();
    const fullText = context.messages.map(m => m.content).join('\n\n');
    
    const result = this.#compressor.compress(fullText, target);
    
    this.#currentSession.setCompressionLevel(
      result.strategy === 'key_points' ? 3 :
      result.strategy === 'summarization' ? 2 :
      result.strategy === 'redundancy_removal' ? 1 : 0
    );
    
    this.emit('context:compressed', result);
    
    return result;
  }
  
  /**
   * Prioritizes context by importance
   * @returns {Array<Object>} Prioritized messages
   */
  prioritizeContext() {
    const context = this.#currentSession.getContext();
    const messages = [...context.messages];
    
    // Score messages by importance
    const scored = messages.map((msg, idx) => ({
      message: msg,
      score: this.#calculateMessagePriority(msg, idx, messages.length),
    }));
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    // Return prioritized order
    return scored.map(s => s.message);
  }
  
  /**
   * Calculates message priority score
   * @private
   * @param {Object} message - Message object
   * @param {number} index - Message index
   * @param {number} total - Total message count
   * @returns {number} Priority score
   */
  #calculateMessagePriority(message, index, total) {
    let score = 0;
    
    // Recent messages are more important
    score += (index / total) * 5;
    
    // System messages are important
    if (message.role === 'system') score += 10;
    
    // Longer messages may contain more context
    score += Math.min(message.content.length / 1000, 3);
    
    // Messages with metadata (like file uploads) are important
    if (message.metadata && Object.keys(message.metadata).length > 0) {
      score += 2;
    }
    
    return score;
  }
  
  /**
   * Manages context size proactively
   * @private
   */
  async #manageContext() {
    const tokenCount = this.#currentSession.getContext().tokenCount;
    
    if (this.#config.needsPrioritization(tokenCount)) {
      // Aggressive prioritization needed
      this.prioritizeContext();
      this.emit('context:prioritized', { tokenCount });
    }
    
    if (this.#config.needsCompression(tokenCount)) {
      // Compress context
      this.compressContext();
    }
  }
  
  /**
   * Creates a checkpoint of current session state
   * @param {string} [label] - Checkpoint label
   * @returns {Object} Checkpoint data
   */
  createCheckpoint(label) {
    if (!this.#currentSession) {
      throw new OpusClientError('No active session', 'NO_SESSION');
    }
    
    return this.#currentSession.createCheckpoint(label);
  }
  
  /**
   * Restores session from checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @returns {boolean} Whether restore succeeded
   */
  restoreCheckpoint(checkpointId) {
    if (!this.#currentSession) {
      throw new OpusClientError('No active session', 'NO_SESSION');
    }
    
    return this.#currentSession.restoreCheckpoint(checkpointId);
  }
  
  /**
   * Gets current session info
   * @returns {Object|null} Session info or null
   */
  getCurrentSession() {
    return this.#currentSession?.getInfo() || null;
  }
  
  /**
   * Gets cost statistics
   * @returns {Object} Cost statistics
   */
  getCostStats() {
    return this.#config.getCostStats();
  }
  
  /**
   * Closes the client and cleans up
   * @param {boolean} [persistSession=true] - Whether to persist session
   * @returns {Promise<void>}
   */
  async close(persistSession = true) {
    this.#stopHeartbeat();
    
    if (this.#currentSession) {
      await this.#sessionManager.closeSession(this.#currentSession.id, persistSession);
      this.#currentSession = null;
    }
    
    if (this.#ws) {
      this.#ws.close(1000, 'Client closing');
      this.#ws = null;
    }
    
    this.#setConnectionState(OpusClient.ConnectionState.DISCONNECTED);
    this.emit('closed');
  }
}

/**
 * Creates an OpusClient instance
 * @param {Object} options - Client options
 * @returns {OpusClient} Client instance
 */
export function createOpusClient(options = {}) {
  return new OpusClient(options);
}

export default OpusClient;
