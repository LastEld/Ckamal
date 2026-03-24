/**
 * @fileoverview Claude Opus 4.6 Session Management
 * @module models/claude/opus-session
 * 
 * Provides session persistence, recovery, and multi-session management:
 * - Session persistence with TTL
 * - Automatic session recovery
 * - Multi-session management per user
 * - Session sharing capabilities
 * - Checkpoint and restore
 */

import { EventEmitter } from 'events';
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

/**
 * Session states
 * @enum {string}
 */
export const SessionState = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  RECOVERING: 'recovering',
  ERROR: 'error',
  CLOSED: 'closed',
  EXPIRED: 'expired',
};

/**
 * Session error types
 */
export class SessionError extends Error {
  constructor(message, code, sessionId, details = {}) {
    super(message);
    this.name = 'SessionError';
    this.code = code;
    this.sessionId = sessionId;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Represents a single Opus session
 */
export class OpusSession {
  #id;
  #userId;
  #state;
  #context;
  #metadata;
  #checkpoints;
  #sharedWith;
  #createdAt;
  #lastActivity;
  #ttl;
  #websocketId;
  
  /**
   * Creates an OpusSession
   * @param {Object} options - Session options
   * @param {string} options.userId - User ID
   * @param {string} [options.id] - Session ID (auto-generated if not provided)
   * @param {number} [options.ttl] - Time to live in ms
   * @param {Object} [options.metadata] - Session metadata
   */
  constructor(options) {
    this.#id = options.id || this.#generateId();
    this.#userId = options.userId;
    this.#state = SessionState.PENDING;
    this.#context = {
      messages: [],
      files: [],
      artifacts: [],
      tokenCount: 0,
      compressionLevel: 0,
    };
    this.#metadata = {
      title: options.metadata?.title || `Session ${this.#id.slice(-8)}`,
      tags: options.metadata?.tags || [],
      project: options.metadata?.project || null,
      ...options.metadata,
    };
    this.#checkpoints = [];
    this.#sharedWith = new Set();
    this.#createdAt = Date.now();
    this.#lastActivity = this.#createdAt;
    this.#ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours default
    this.#websocketId = null;
  }
  
  /**
   * Generates a unique session ID
   * @private
   * @returns {string} Session ID
   */
  #generateId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    const hash = createHash('sha256')
      .update(`${timestamp}${random}`)
      .digest('hex')
      .slice(0, 16);
    return `opus_${hash}`;
  }
  
  // ==================== Getters ====================
  
  get id() { return this.#id; }
  get userId() { return this.#userId; }
  get state() { return this.#state; }
  get createdAt() { return this.#createdAt; }
  get lastActivity() { return this.#lastActivity; }
  get websocketId() { return this.#websocketId; }
  
  /**
   * Gets session info
   * @returns {Object} Session information
   */
  getInfo() {
    return {
      id: this.#id,
      userId: this.#userId,
      state: this.#state,
      metadata: { ...this.#metadata },
      createdAt: this.#createdAt,
      lastActivity: this.#lastActivity,
      expiresAt: this.#lastActivity + this.#ttl,
      context: {
        messageCount: this.#context.messages.length,
        fileCount: this.#context.files.length,
        tokenCount: this.#context.tokenCount,
        compressionLevel: this.#context.compressionLevel,
      },
      checkpointCount: this.#checkpoints.length,
      sharedWith: Array.from(this.#sharedWith),
      websocketId: this.#websocketId,
    };
  }
  
  /**
   * Gets full context
   * @returns {Object} Session context
   */
  getContext() {
    return {
      messages: [...this.#context.messages],
      files: [...this.#context.files],
      artifacts: [...this.#context.artifacts],
      tokenCount: this.#context.tokenCount,
      compressionLevel: this.#context.compressionLevel,
    };
  }
  
  // ==================== State Management ====================
  
  /**
   * Activates the session
   * @param {string} websocketId - Associated WebSocket connection ID
   */
  activate(websocketId) {
    this.#websocketId = websocketId;
    this.#state = SessionState.ACTIVE;
    this.#touch();
  }
  
  /**
   * Pauses the session
   */
  pause() {
    if (this.#state === SessionState.ACTIVE) {
      this.#state = SessionState.PAUSED;
      this.#websocketId = null;
      this.#touch();
    }
  }
  
  /**
   * Marks session as recovering
   */
  markRecovering() {
    this.#state = SessionState.RECOVERING;
    this.#touch();
  }
  
  /**
   * Marks session in error state
   * @param {Error} error - Error that occurred
   */
  markError(error) {
    this.#state = SessionState.ERROR;
    this.#metadata.lastError = {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
    };
    this.#touch();
  }
  
  /**
   * Closes the session
   */
  close() {
    this.#state = SessionState.CLOSED;
    this.#websocketId = null;
    this.#touch();
  }

  /**
   * Marks the session as expired.
   */
  markExpired() {
    this.#state = SessionState.EXPIRED;
    this.#websocketId = null;
    this.#touch();
  }
  
  /**
   * Checks if session is expired
   * @returns {boolean} Whether session is expired
   */
  isExpired() {
    return Date.now() > this.#lastActivity + this.#ttl;
  }
  
  /**
   * Checks if session is active
   * @returns {boolean} Whether session is active
   */
  isActive() {
    return this.#state === SessionState.ACTIVE && !this.isExpired();
  }
  
  // ==================== Context Operations ====================
  
  /**
   * Adds a message to the session
   * @param {Object} message - Message to add
   * @param {string} message.role - Message role (user/assistant/system)
   * @param {string} message.content - Message content
   * @param {Object} [message.metadata] - Message metadata
   * @returns {Object} Added message with ID
   */
  addMessage(message) {
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      role: message.role,
      content: message.content,
      timestamp: Date.now(),
      metadata: message.metadata || {},
    };
    
    this.#context.messages.push(msg);
    this.#touch();
    return msg;
  }
  
  /**
   * Adds a file reference to the session
   * @param {Object} file - File reference
   */
  addFile(file) {
    this.#context.files.push({
      id: `file_${Date.now()}`,
      ...file,
      addedAt: Date.now(),
    });
    this.#touch();
  }
  
  /**
   * Adds an artifact to the session
   * @param {Object} artifact - Artifact data
   */
  addArtifact(artifact) {
    this.#context.artifacts.push({
      id: `art_${Date.now()}`,
      ...artifact,
      createdAt: Date.now(),
    });
    this.#touch();
  }
  
  /**
   * Updates token count
   * @param {number} count - Token count
   */
  updateTokenCount(count) {
    this.#context.tokenCount = count;
    this.#touch();
  }
  
  /**
   * Sets compression level
   * @param {number} level - Compression level (0-3)
   */
  setCompressionLevel(level) {
    this.#context.compressionLevel = Math.max(0, Math.min(3, level));
    this.#touch();
  }
  
  /**
   * Clears all context
   */
  clearContext() {
    this.#context.messages = [];
    this.#context.files = [];
    this.#context.artifacts = [];
    this.#context.tokenCount = 0;
    this.#context.compressionLevel = 0;
    this.#touch();
  }
  
  // ==================== Checkpoints ====================
  
  /**
   * Creates a checkpoint
   * @param {string} [label] - Checkpoint label
   * @returns {Object} Checkpoint data
   */
  createCheckpoint(label) {
    const checkpoint = {
      id: `chk_${Date.now()}`,
      label: label || `Checkpoint ${this.#checkpoints.length + 1}`,
      timestamp: Date.now(),
      context: this.getContext(),
      metadata: { ...this.#metadata },
    };
    
    this.#checkpoints.push(checkpoint);
    this.#touch();
    return checkpoint;
  }
  
  /**
   * Restores to a checkpoint
   * @param {string} checkpointId - Checkpoint ID to restore
   * @returns {boolean} Whether restore was successful
   */
  restoreCheckpoint(checkpointId) {
    const checkpoint = this.#checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) return false;
    
    this.#context = { ...checkpoint.context };
    this.#metadata = { ...checkpoint.metadata };
    this.#touch();
    return true;
  }
  
  /**
   * Gets all checkpoints
   * @returns {Array<Object>} Checkpoints
   */
  getCheckpoints() {
    return [...this.#checkpoints];
  }
  
  /**
   * Deletes a checkpoint
   * @param {string} checkpointId - Checkpoint ID to delete
   * @returns {boolean} Whether deletion was successful
   */
  deleteCheckpoint(checkpointId) {
    const index = this.#checkpoints.findIndex(c => c.id === checkpointId);
    if (index === -1) return false;
    
    this.#checkpoints.splice(index, 1);
    this.#touch();
    return true;
  }
  
  // ==================== Sharing ====================
  
  /**
   * Shares session with another user
   * @param {string} userId - User ID to share with
   * @param {string} [permission='read'] - Permission level (read/write)
   */
  shareWith(userId, permission = 'read') {
    this.#sharedWith.add(userId);
    this.#metadata.sharing = this.#metadata.sharing || {};
    this.#metadata.sharing[userId] = { permission, sharedAt: Date.now() };
    this.#touch();
  }
  
  /**
   * Revokes sharing
   * @param {string} userId - User ID to revoke
   */
  revokeSharing(userId) {
    this.#sharedWith.delete(userId);
    if (this.#metadata.sharing) {
      delete this.#metadata.sharing[userId];
    }
    this.#touch();
  }
  
  /**
   * Checks if user has access
   * @param {string} userId - User ID to check
   * @returns {boolean} Whether user has access
   */
  hasAccess(userId) {
    return this.#userId === userId || this.#sharedWith.has(userId);
  }
  
  /**
   * Updates last activity timestamp
   * @private
   */
  #touch() {
    this.#lastActivity = Date.now();
  }
  
  /**
   * Serializes session for storage
   * @returns {Object} Serialized session
   */
  serialize() {
    return {
      id: this.#id,
      userId: this.#userId,
      state: this.#state,
      context: this.#context,
      metadata: this.#metadata,
      checkpoints: this.#checkpoints,
      sharedWith: Array.from(this.#sharedWith),
      createdAt: this.#createdAt,
      lastActivity: this.#lastActivity,
      ttl: this.#ttl,
      websocketId: this.#websocketId,
    };
  }
  
  /**
   * Deserializes session from storage
   * @param {Object} data - Serialized session data
   * @returns {OpusSession} Deserialized session
   */
  static deserialize(data) {
    const session = new OpusSession({
      id: data.id,
      userId: data.userId,
      ttl: data.ttl,
      metadata: data.metadata,
    });
    
    session.#state = data.state;
    session.#context = data.context;
    session.#checkpoints = data.checkpoints || [];
    session.#sharedWith = new Set(data.sharedWith || []);
    session.#createdAt = data.createdAt;
    session.#lastActivity = data.lastActivity;
    session.#websocketId = data.websocketId;
    
    return session;
  }
}

/**
 * Session manager for handling multiple Opus sessions
 * @extends EventEmitter
 */
export class OpusSessionManager extends EventEmitter {
  #sessions;
  #userSessions;
  #persistencePath;
  #cleanupInterval;
  #maxSessionsPerUser;
  
  /**
   * Creates an OpusSessionManager
   * @param {Object} options - Manager options
   * @param {string} [options.persistencePath] - Path for session persistence
   * @param {number} [options.cleanupInterval=60000] - Cleanup interval in ms
   * @param {number} [options.maxSessionsPerUser=10] - Max sessions per user
   */
  constructor(options = {}) {
    super();
    
    this.#sessions = new Map();
    this.#userSessions = new Map();
    this.#persistencePath = options.persistencePath || './sessions';
    this.#cleanupInterval = options.cleanupInterval || 60000;
    this.#maxSessionsPerUser = options.maxSessionsPerUser || 10;
    
    // Start cleanup timer
    this.#startCleanupTimer();
  }
  
  /**
   * Creates a new session
   * @param {string} userId - User ID
   * @param {Object} [options] - Session options
   * @returns {OpusSession} Created session
   * @throws {SessionError} If max sessions reached
   */
  async createSession(userId, options = {}) {
    // Check session limit
    const userSessionIds = this.#userSessions.get(userId) || new Set();
    if (userSessionIds.size >= this.#maxSessionsPerUser) {
      throw new SessionError(
        `Maximum sessions (${this.#maxSessionsPerUser}) reached for user`,
        'SESSION_LIMIT_EXCEEDED',
        null,
        { userId, currentSessions: userSessionIds.size }
      );
    }
    
    const session = new OpusSession({
      userId,
      ...options,
    });
    
    this.#sessions.set(session.id, session);
    userSessionIds.add(session.id);
    this.#userSessions.set(userId, userSessionIds);
    
    // Persist if path is set
    if (this.#persistencePath) {
      await this.#persistSession(session);
    }
    
    this.emit('session:created', { sessionId: session.id, userId });
    return session;
  }
  
  /**
   * Gets a session by ID
   * @param {string} sessionId - Session ID
   * @returns {OpusSession|undefined} Session or undefined
   */
  getSession(sessionId) {
    return this.#sessions.get(sessionId);
  }
  
  /**
   * Gets all sessions for a user
   * @param {string} userId - User ID
   * @returns {Array<OpusSession>} User sessions
   */
  getUserSessions(userId) {
    const sessionIds = this.#userSessions.get(userId);
    if (!sessionIds) return [];
    
    return Array.from(sessionIds)
      .map(id => this.#sessions.get(id))
      .filter(Boolean);
  }
  
  /**
   * Recovers a session
   * @param {string} sessionId - Session ID to recover
   * @param {string} websocketId - New WebSocket connection ID
   * @returns {OpusSession|undefined} Recovered session
   */
  async recoverSession(sessionId, websocketId) {
    let session = this.#sessions.get(sessionId);
    
    // Try to load from persistence if not in memory
    if (!session && this.#persistencePath) {
      session = await this.#loadSession(sessionId);
      if (session) {
        this.#sessions.set(sessionId, session);
        const userSessions = this.#userSessions.get(session.userId) || new Set();
        userSessions.add(sessionId);
        this.#userSessions.set(session.userId, userSessions);
      }
    }
    
    if (!session) return undefined;
    
    if (session.isExpired()) {
      session.markExpired();
      this.emit('session:expired', { sessionId });
      return undefined;
    }
    
    session.markRecovering();
    session.activate(websocketId);
    
    this.emit('session:recovered', { sessionId, userId: session.userId });
    return session;
  }
  
  /**
   * Closes a session
   * @param {string} sessionId - Session ID to close
   * @param {boolean} [persist=true] - Whether to persist before closing
   */
  async closeSession(sessionId, persist = true) {
    const session = this.#sessions.get(sessionId);
    if (!session) return false;
    
    if (persist && this.#persistencePath) {
      await this.#persistSession(session);
    }
    
    session.close();
    
    // Remove from user sessions
    const userSessions = this.#userSessions.get(session.userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.#userSessions.delete(session.userId);
      }
    }
    
    this.#sessions.delete(sessionId);
    this.emit('session:closed', { sessionId, userId: session.userId });
    return true;
  }
  
  /**
   * Persists a session to disk
   * @private
   * @param {OpusSession} session - Session to persist
   */
  async #persistSession(session) {
    try {
      await mkdir(this.#persistencePath, { recursive: true });
      const filePath = join(this.#persistencePath, `${session.id}.json`);
      await writeFile(filePath, JSON.stringify(session.serialize(), null, 2));
    } catch (error) {
      this.emit('error', { type: 'persist', sessionId: session.id, error });
    }
  }
  
  /**
   * Loads a session from disk
   * @private
   * @param {string} sessionId - Session ID to load
   * @returns {OpusSession|undefined} Loaded session
   */
  async #loadSession(sessionId) {
    try {
      const filePath = join(this.#persistencePath, `${sessionId}.json`);
      await access(filePath);
      const data = JSON.parse(await readFile(filePath, 'utf8'));
      return OpusSession.deserialize(data);
    } catch (error) {
      return undefined;
    }
  }
  
  /**
   * Starts the cleanup timer
   * @private
   */
  #startCleanupTimer() {
    setInterval(() => {
      this.#cleanupExpiredSessions();
    }, this.#cleanupInterval);
  }
  
  /**
   * Cleans up expired sessions
   * @private
   */
  async #cleanupExpiredSessions() {
    const expiredSessions = [];
    
    for (const [sessionId, session] of this.#sessions) {
      if (session.isExpired()) {
        expiredSessions.push(sessionId);
      }
    }
    
    for (const sessionId of expiredSessions) {
      await this.closeSession(sessionId, true);
      this.emit('session:expired', { sessionId });
    }
  }
  
  /**
   * Gets manager statistics
   * @returns {Object} Statistics
   */
  getStats() {
    let activeCount = 0;
    let expiredCount = 0;
    
    for (const session of this.#sessions.values()) {
      if (session.isActive()) activeCount++;
      if (session.isExpired()) expiredCount++;
    }
    
    return {
      totalSessions: this.#sessions.size,
      activeSessions: activeCount,
      expiredSessions: expiredCount,
      userCount: this.#userSessions.size,
      maxSessionsPerUser: this.#maxSessionsPerUser,
    };
  }
  
  /**
   * Disposes the manager
   */
  async dispose() {
    // Persist all sessions
    if (this.#persistencePath) {
      for (const session of this.#sessions.values()) {
        await this.#persistSession(session);
      }
    }
    
    this.#sessions.clear();
    this.#userSessions.clear();
    this.removeAllListeners();
  }
}

/**
 * Creates a session manager instance
 * @param {Object} options - Manager options
 * @returns {OpusSessionManager} Session manager
 */
export function createSessionManager(options = {}) {
  return new OpusSessionManager(options);
}

export default OpusSessionManager;
