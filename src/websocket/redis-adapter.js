/**
 * @fileoverview Redis Adapter for multi-server WebSocket scaling
 * @module websocket/redis-adapter
 */

import { EventEmitter } from 'events';

function createNotConfiguredError(message) {
  const error = new Error(message);
  error.code = 'NOT_CONFIGURED';
  return error;
}

/**
 * @typedef {Object} RedisAdapterOptions
 * @property {string} [host='localhost'] - Redis host
 * @property {number} [port=6379] - Redis port
 * @property {string} [password] - Redis password
 * @property {number} [db=0] - Redis database
 * @property {string} [keyPrefix='ws:'] - Key prefix for Redis
 * @property {number} [presenceTTL=120] - Presence TTL in seconds
 * @property {number} [messageTTL=86400] - Message history TTL in seconds
 * @property {Function} [redisClient] - Custom Redis client factory
 */

/**
 * @typedef {Object} RedisMessage
 * @property {string} type - Message type
 * @property {string} room - Target room
 * @property {Object} payload - Message payload
 * @property {string} [senderId] - Sender server ID
 * @property {number} timestamp - Message timestamp
 */

/**
 * Redis Adapter for distributed WebSocket servers
 * Enables multi-server scaling with shared state
 * @extends {EventEmitter}
 */
export class RedisAdapter extends EventEmitter {
  /** @type {any} */
  #pubClient;

  /** @type {any} */
  #subClient;

  /** @type {RedisAdapterOptions} */
  #options;

  /** @type {string} */
  #serverId;

  /** @type {boolean} */
  #isConnected;

  /** @type {Set<string>} */
  #subscribedRooms;

  /** @type {Function} */
  #messageHandler;

  /**
   * Creates a RedisAdapter instance
   * @param {RedisAdapterOptions} [options={}] - Adapter options
   */
  constructor(options = {}) {
    super();

    this.#options = {
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
      keyPrefix: 'ws:',
      presenceTTL: 120,
      messageTTL: 86400,
      redisClient: null,
      ...options,
    };

    this.#serverId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this.#isConnected = false;
    this.#subscribedRooms = new Set();
    this.#messageHandler = null;
  }

  /**
   * Gets the server ID
   * @returns {string} Server ID
   */
  get serverId() {
    return this.#serverId;
  }

  /**
   * Checks if adapter is connected
   * @returns {boolean} Connection status
   */
  get isConnected() {
    return this.#isConnected;
  }

  /**
   * Connects to Redis
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.#isConnected) {
      return;
    }

    try {
      // Try to import Redis dynamically
      let Redis;
      try {
        const redisModule = await import('redis');
        Redis = redisModule.createClient || redisModule.default?.createClient;
        if (!Redis && redisModule.default) {
          Redis = redisModule.default;
        }
      } catch {
        throw new Error('Redis package not found. Install with: npm install redis');
      }

      const redisUrl = this.#buildRedisUrl();

      // Create publisher client
      if (this.#options.redisClient) {
        this.#pubClient = await this.#options.redisClient(redisUrl);
      } else {
        this.#pubClient = Redis.createClient ? 
          await Redis.createClient({ url: redisUrl }) :
          await Redis({ url: redisUrl });
      }

      // Create subscriber client
      if (this.#options.redisClient) {
        this.#subClient = await this.#options.redisClient(redisUrl);
      } else {
        this.#subClient = Redis.createClient ? 
          await Redis.createClient({ url: redisUrl }) :
          await Redis({ url: redisUrl });
      }

      // Setup error handlers
      this.#pubClient.on('error', (err) => this.emit('error', err));
      this.#subClient.on('error', (err) => this.emit('error', err));

      // Setup message handler for subscriber
      this.#subClient.on('message', (channel, message) => {
        this.#handleRedisMessage(channel, message);
      });

      this.#isConnected = true;
      this.emit('connected');

      // Subscribe to server channel
      await this.#subscribeToChannel(`${this.#options.keyPrefix}server:${this.#serverId}`);

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnects from Redis
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.#isConnected) {
      return;
    }

    try {
      await this.#pubClient.quit();
      await this.#subClient.quit();
      this.#isConnected = false;
      this.emit('disconnected');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Publishes a message to Redis
   * @param {string} room - Room name
   * @param {Object} payload - Message payload
   * @param {Object} [options] - Publish options
   */
  async publish(room, payload, options = {}) {
    if (!this.#isConnected) {
      throw new Error('Redis adapter not connected');
    }

    const message = {
      type: options.type || 'broadcast',
      room,
      payload,
      senderId: this.#serverId,
      timestamp: Date.now(),
      excludeSender: options.excludeSender || false,
    };

    const channel = `${this.#options.keyPrefix}room:${room}`;
    await this.#pubClient.publish(channel, JSON.stringify(message));

    // Also persist to room history
    if (options.persist !== false) {
      await this.#persistMessage(room, message);
    }
  }

  /**
   * Subscribes to a room
   * @param {string} room - Room name
   */
  async subscribe(room) {
    if (!this.#isConnected) {
      throw new Error('Redis adapter not connected');
    }

    const channel = `${this.#options.keyPrefix}room:${room}`;
    await this.#subscribeToChannel(channel);
    this.#subscribedRooms.add(room);
  }

  /**
   * Unsubscribes from a room
   * @param {string} room - Room name
   */
  async unsubscribe(room) {
    if (!this.#isConnected) {
      return;
    }

    const channel = `${this.#options.keyPrefix}room:${room}`;
    await this.#subClient.unsubscribe(channel);
    this.#subscribedRooms.delete(room);
  }

  /**
   * Sets presence for a user in a room
   * @param {string} room - Room name
   * @param {string} userId - User ID
   * @param {Object} data - Presence data
   */
  async setPresence(room, userId, data) {
    if (!this.#isConnected) {
      return;
    }

    const key = `${this.#options.keyPrefix}presence:${room}`;
    const presenceData = {
      ...data,
      serverId: this.#serverId,
      timestamp: Date.now(),
    };

    await this.#pubClient.hSet(key, userId, JSON.stringify(presenceData));
    await this.#pubClient.expire(key, this.#options.presenceTTL);

    // Publish presence update
    await this.publish(room, {
      type: 'presence:updated',
      userId,
      presence: presenceData,
    }, { type: 'presence', persist: false });
  }

  /**
   * Gets all presence data for a room
   * @param {string} room - Room name
   * @returns {Object} Presence data by user ID
   */
  async getPresence(room) {
    if (!this.#isConnected) {
      return {};
    }

    const key = `${this.#options.keyPrefix}presence:${room}`;
    const data = await this.#pubClient.hGetAll(key);

    const presence = {};
    for (const [userId, json] of Object.entries(data)) {
      try {
        presence[userId] = JSON.parse(json);
      } catch {
        // Ignore invalid JSON
      }
    }

    return presence;
  }

  /**
   * Removes presence for a user
   * @param {string} room - Room name
   * @param {string} userId - User ID
   */
  async removePresence(room, userId) {
    if (!this.#isConnected) {
      return;
    }

    const key = `${this.#options.keyPrefix}presence:${room}`;
    await this.#pubClient.hDel(key, userId);

    // Publish presence removal
    await this.publish(room, {
      type: 'presence:offline',
      userId,
    }, { type: 'presence', persist: false });
  }

  /**
   * Saves a message to room history
   * @param {string} room - Room name
   * @param {Object} message - Message data
   */
  async saveMessage(room, message) {
    if (!this.#isConnected) {
      return;
    }

    await this.#persistMessage(room, message);
  }

  /**
   * Gets message history for a room
   * @param {string} room - Room name
   * @param {Object} [options] - Query options
   * @returns {Promise<Array<Object>>} Message history
   */
  async getMessageHistory(room, options = {}) {
    if (!this.#isConnected) {
      return [];
    }

    const { limit = 50, before, after } = options;
    const key = `${this.#options.keyPrefix}history:${room}`;

    let messages = await this.#pubClient.lRange(key, 0, -1);
    messages = messages.map((m) => JSON.parse(m)).reverse();

    if (before) {
      messages = messages.filter((m) => m.timestamp < before);
    }

    if (after) {
      messages = messages.filter((m) => m.timestamp > after);
    }

    return messages.slice(0, limit);
  }

  /**
   * Locks a resource for exclusive access
   * @param {string} resource - Resource identifier
   * @param {string} holder - Lock holder identifier
   * @param {number} [ttl=30000] - Lock TTL in milliseconds
   * @returns {Promise<boolean>} Whether lock was acquired
   */
  async acquireLock(resource, holder, ttl = 30000) {
    if (!this.#isConnected) {
      return false;
    }

    const key = `${this.#options.keyPrefix}lock:${resource}`;
    const result = await this.#pubClient.setNX(key, holder);

    if (result) {
      await this.#pubClient.pExpire(key, ttl);
      return true;
    }

    return false;
  }

  /**
   * Releases a lock
   * @param {string} resource - Resource identifier
   * @param {string} holder - Lock holder identifier
   * @returns {Promise<boolean>} Whether lock was released
   */
  async releaseLock(resource, holder) {
    if (!this.#isConnected) {
      return false;
    }

    const key = `${this.#options.keyPrefix}lock:${resource}`;
    const currentHolder = await this.#pubClient.get(key);

    if (currentHolder === holder) {
      await this.#pubClient.del(key);
      return true;
    }

    return false;
  }

  /**
   * Sets the message handler for incoming messages
   * @param {Function} handler - Message handler function
   */
  onMessage(handler) {
    this.#messageHandler = handler;
  }

  /**
   * Gets server statistics from Redis
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    if (!this.#isConnected) {
      return { connected: false };
    }

    const info = await this.#pubClient.info('server');
    const keys = await this.#pubClient.keys(`${this.#options.keyPrefix}*`);

    return {
      connected: true,
      serverId: this.#serverId,
      redisInfo: info,
      keyCount: keys.length,
      subscribedRooms: this.#subscribedRooms.size,
    };
  }

  // ==================== Private Methods ====================

  /**
   * Builds Redis connection URL
   * @returns {string} Redis URL
   * @private
   */
  #buildRedisUrl() {
    const { host, port, password, db } = this.#options;
    const auth = password ? `:${password}@` : '';
    return `redis://${auth}${host}:${port}/${db}`;
  }

  /**
   * Subscribes to a Redis channel
   * @param {string} channel - Channel name
   * @private
   */
  async #subscribeToChannel(channel) {
    await this.#subClient.subscribe(channel, (message) => {
      this.#handleRedisMessage(channel, message);
    });
  }

  /**
   * Handles incoming Redis messages
   * @param {string} channel - Channel name
   * @param {string} message - Message data
   * @private
   */
  #handleRedisMessage(channel, message) {
    try {
      const data = JSON.parse(message);

      // Skip messages from self if excludeSender is set
      if (data.excludeSender && data.senderId === this.#serverId) {
        return;
      }

      if (this.#messageHandler) {
        this.#messageHandler(data);
      }

      this.emit('message', data);
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${error.message}`));
    }
  }

  /**
   * Persists a message to room history
   * @param {string} room - Room name
   * @param {Object} message - Message data
   * @private
   */
  async #persistMessage(room, message) {
    const key = `${this.#options.keyPrefix}history:${room}`;
    const messageJson = JSON.stringify(message);

    // Add to list
    await this.#pubClient.lPush(key, messageJson);
    await this.#pubClient.expire(key, this.#options.messageTTL);

    // Trim to reasonable size
    await this.#pubClient.lTrim(key, 0, 999);
  }
}

/**
 * Creates a Redis adapter instance
 * @param {RedisAdapterOptions} [options] - Adapter options
 * @returns {RedisAdapter} Redis adapter instance
 */
export function createRedisAdapter(options) {
  return new RedisAdapter(options);
}

/**
 * Mock Redis adapter for development/testing without Redis
 * Falls back to in-memory storage
 */
export class MockRedisAdapter extends EventEmitter {
  #data = new Map();
  #presence = new Map();
  #history = new Map();
  #locks = new Map();
  #serverId;
  #isConnected = false;

  constructor() {
    super();
    if (process.env.NODE_ENV !== 'test') {
      throw createNotConfiguredError('MockRedisAdapter is test-only; use RedisAdapter in release runtime');
    }
    this.#serverId = `mock-${Date.now().toString(36)}`;
  }

  get serverId() {
    return this.#serverId;
  }

  get isConnected() {
    return this.#isConnected;
  }

  async connect() {
    this.#isConnected = true;
    this.emit('connected');
  }

  async disconnect() {
    this.#isConnected = false;
    this.emit('disconnected');
  }

  async publish(room, payload, options = {}) {
    // Simulate cross-server message
    setImmediate(() => {
      this.emit('message', {
        type: options.type || 'broadcast',
        room,
        payload,
        senderId: this.#serverId,
        timestamp: Date.now(),
      });
    });
  }

  async subscribe(room) {
    // No-op for mock
  }

  async unsubscribe(room) {
    // No-op for mock
  }

  async setPresence(room, userId, data) {
    if (!this.#presence.has(room)) {
      this.#presence.set(room, new Map());
    }
    this.#presence.get(room).set(userId, {
      ...data,
      serverId: this.#serverId,
      timestamp: Date.now(),
    });
  }

  async getPresence(room) {
    const roomPresence = this.#presence.get(room);
    if (!roomPresence) return {};

    const result = {};
    for (const [userId, data] of roomPresence) {
      result[userId] = data;
    }
    return result;
  }

  async removePresence(room, userId) {
    const roomPresence = this.#presence.get(room);
    if (roomPresence) {
      roomPresence.delete(userId);
    }
  }

  async saveMessage(room, message) {
    if (!this.#history.has(room)) {
      this.#history.set(room, []);
    }
    const history = this.#history.get(room);
    history.unshift(message);
    if (history.length > 100) {
      history.pop();
    }
  }

  async getMessageHistory(room, options = {}) {
    const { limit = 50, before, after } = options;
    let messages = this.#history.get(room) || [];

    if (before) {
      messages = messages.filter((m) => m.timestamp < before);
    }

    if (after) {
      messages = messages.filter((m) => m.timestamp > after);
    }

    return messages.slice(0, limit);
  }

  async acquireLock(resource, holder, ttl = 30000) {
    const existing = this.#locks.get(resource);
    if (existing && existing.expires > Date.now()) {
      return false;
    }
    this.#locks.set(resource, { holder, expires: Date.now() + ttl });
    return true;
  }

  async releaseLock(resource, holder) {
    const existing = this.#locks.get(resource);
    if (existing && existing.holder === holder) {
      this.#locks.delete(resource);
      return true;
    }
    return false;
  }

  onMessage(handler) {
    this.on('message', handler);
  }

  async getStats() {
    return {
      connected: this.#isConnected,
      serverId: this.#serverId,
      mock: true,
      rooms: this.#presence.size,
      totalPresence: Array.from(this.#presence.values()).reduce(
        (sum, room) => sum + room.size, 0
      ),
      totalMessages: Array.from(this.#history.values()).reduce(
        (sum, room) => sum + room.length, 0
      ),
    };
  }
}

export default RedisAdapter;
