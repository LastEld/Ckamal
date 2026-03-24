/**
 * @fileoverview Mock client implementations for testing
 * Provides mock implementations of external services and clients
 */

import { mock } from 'node:test';

/**
 * Mock Database Client
 */
export class MockDatabaseClient {
  constructor() {
    this.data = new Map();
    this.queries = [];
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    return { status: 'connected' };
  }

  async disconnect() {
    this.connected = false;
    return { status: 'disconnected' };
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params, timestamp: Date.now() });
    
    // Simple mock query handling
    if (sql.includes('SELECT')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT')) {
      return { rows: [{ id: this.generateId() }], rowCount: 1 };
    }
    if (sql.includes('UPDATE')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('DELETE')) {
      return { rows: [], rowCount: 1 };
    }
    
    return { rows: [], rowCount: 0 };
  }

  async transaction(callback) {
    const client = new MockDatabaseClient();
    client.connected = true;
    try {
      const result = await callback(client);
      return result;
    } catch (error) {
      throw error;
    }
  }

  generateId() {
    return `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getQueries() {
    return this.queries;
  }

  clearQueries() {
    this.queries = [];
  }
}

/**
 * Mock Redis Client
 */
export class MockRedisClient {
  constructor() {
    this.store = new Map();
    this.subscribers = new Map();
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    return this;
  }

  async disconnect() {
    this.connected = false;
  }

  async get(key) {
    return this.store.get(key) || null;
  }

  async set(key, value, options = {}) {
    this.store.set(key, value);
    
    if (options.EX) {
      setTimeout(() => this.store.delete(key), options.EX * 1000);
    }
    
    return 'OK';
  }

  async del(...keys) {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.has(key)) {
        this.store.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async exists(...keys) {
    return keys.filter(key => this.store.has(key)).length;
  }

  async expire(key, seconds) {
    setTimeout(() => this.store.delete(key), seconds * 1000);
    return 1;
  }

  async keys(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this.store.keys()).filter(key => regex.test(key));
  }

  async lpush(key, ...values) {
    const list = this.store.get(key) || [];
    list.unshift(...values);
    this.store.set(key, list);
    return list.length;
  }

  async rpush(key, ...values) {
    const list = this.store.get(key) || [];
    list.push(...values);
    this.store.set(key, list);
    return list.length;
  }

  async lpop(key) {
    const list = this.store.get(key) || [];
    const value = list.shift();
    this.store.set(key, list);
    return value || null;
  }

  async rpop(key) {
    const list = this.store.get(key) || [];
    const value = list.pop();
    this.store.set(key, list);
    return value || null;
  }

  async lrange(key, start, stop) {
    const list = this.store.get(key) || [];
    return list.slice(start, stop === -1 ? undefined : stop + 1);
  }

  async publish(channel, message) {
    const subscribers = this.subscribers.get(channel) || [];
    subscribers.forEach(callback => callback(message));
    return subscribers.length;
  }

  subscribe(channel, callback) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, []);
    }
    this.subscribers.get(channel).push(callback);
  }

  async hset(key, field, value) {
    const hash = this.store.get(key) || {};
    hash[field] = value;
    this.store.set(key, hash);
    return 1;
  }

  async hget(key, field) {
    const hash = this.store.get(key) || {};
    return hash[field] || null;
  }

  async hgetall(key) {
    return this.store.get(key) || {};
  }

  async hdel(key, ...fields) {
    const hash = this.store.get(key) || {};
    let deleted = 0;
    for (const field of fields) {
      if (field in hash) {
        delete hash[field];
        deleted++;
      }
    }
    return deleted;
  }

  clear() {
    this.store.clear();
    this.subscribers.clear();
  }
}

/**
 * Mock Email Client
 */
export class MockEmailClient {
  constructor() {
    this.sentEmails = [];
  }

  async send(options) {
    const email = {
      id: `email-${Date.now()}`,
      to: options.to,
      from: options.from,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
      sentAt: new Date().toISOString()
    };
    
    this.sentEmails.push(email);
    return { messageId: email.id, accepted: [options.to] };
  }

  async sendTemplate(templateId, to, data) {
    return this.send({
      to,
      subject: `Template: ${templateId}`,
      text: `Template ${templateId} with data: ${JSON.stringify(data)}`
    });
  }

  getSentEmails() {
    return this.sentEmails;
  }

  clearSentEmails() {
    this.sentEmails = [];
  }

  wasEmailSentTo(email) {
    return this.sentEmails.some(e => e.to === email);
  }
}

/**
 * Mock File Storage Client
 */
export class MockFileStorageClient {
  constructor() {
    this.files = new Map();
  }

  async upload(key, data, options = {}) {
    const file = {
      key,
      data: Buffer.isBuffer(data) ? data : Buffer.from(data),
      contentType: options.contentType || 'application/octet-stream',
      metadata: options.metadata || {},
      uploadedAt: new Date().toISOString()
    };
    
    this.files.set(key, file);
    return { key, size: file.data.length, etag: `etag-${Date.now()}` };
  }

  async download(key) {
    const file = this.files.get(key);
    if (!file) {
      const error = new Error('File not found');
      error.code = 'NotFound';
      throw error;
    }
    return file.data;
  }

  async delete(key) {
    const existed = this.files.has(key);
    this.files.delete(key);
    return { deleted: existed };
  }

  async exists(key) {
    return this.files.has(key);
  }

  async getSignedUrl(key, options = {}) {
    return {
      url: `https://mock-storage.example.com/${key}?signed=true`,
      expires: options.expires || 3600
    };
  }

  async list(prefix = '') {
    const files = [];
    for (const [key, file] of this.files) {
      if (key.startsWith(prefix)) {
        files.push({
          key,
          size: file.data.length,
          lastModified: file.uploadedAt
        });
      }
    }
    return files;
  }

  clear() {
    this.files.clear();
  }
}

/**
 * Mock HTTP Client
 */
export class MockHttpClient {
  constructor() {
    this.responses = new Map();
    this.requests = [];
    this.defaultResponse = { status: 200, data: {} };
  }

  setResponse(method, url, response) {
    const key = `${method.toUpperCase()}:${url}`;
    this.responses.set(key, response);
  }

  clearResponses() {
    this.responses.clear();
  }

  getRequests() {
    return this.requests;
  }

  clearRequests() {
    this.requests = [];
  }

  async request(config) {
    const request = {
      method: config.method || 'GET',
      url: config.url,
      headers: config.headers || {},
      data: config.data,
      params: config.params,
      timestamp: Date.now()
    };
    this.requests.push(request);

    const key = `${request.method}:${request.url}`;
    const response = this.responses.get(key) || this.defaultResponse;

    if (response.error) {
      throw response.error;
    }

    return {
      status: response.status || 200,
      data: response.data || {},
      headers: response.headers || {},
      config
    };
  }

  async get(url, config = {}) {
    return this.request({ ...config, method: 'GET', url });
  }

  async post(url, data, config = {}) {
    return this.request({ ...config, method: 'POST', url, data });
  }

  async put(url, data, config = {}) {
    return this.request({ ...config, method: 'PUT', url, data });
  }

  async patch(url, data, config = {}) {
    return this.request({ ...config, method: 'PATCH', url, data });
  }

  async delete(url, config = {}) {
    return this.request({ ...config, method: 'DELETE', url });
  }
}

/**
 * Mock WebSocket Client for testing
 */
export class MockWebSocketClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.readyState = 0; // CONNECTING
    this.events = new Map();
    this.sentMessages = [];
  }

  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(callback);
  }

  emit(event, ...args) {
    const callbacks = this.events.get(event) || [];
    callbacks.forEach(cb => cb(...args));
  }

  connect() {
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.emit('open');
    }, 10);
  }

  send(data) {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = 3; // CLOSED
    this.emit('close', code, reason);
  }

  terminate() {
    this.close();
  }

  // Simulate receiving message from server
  simulateMessage(data) {
    this.emit('message', Buffer.from(JSON.stringify(data)));
  }

  // Simulate error
  simulateError(error) {
    this.emit('error', error);
  }

  getSentMessages() {
    return this.sentMessages;
  }

  clearSentMessages() {
    this.sentMessages = [];
  }
}

/**
 * Mock Logger
 */
export class MockLogger {
  constructor() {
    this.logs = [];
    this.mockFns = {
      debug: mock.fn((...args) => this.log('debug', ...args)),
      info: mock.fn((...args) => this.log('info', ...args)),
      warn: mock.fn((...args) => this.log('warn', ...args)),
      error: mock.fn((...args) => this.log('error', ...args))
    };
  }

  log(level, message, meta = {}) {
    this.logs.push({
      level,
      message,
      meta,
      timestamp: new Date().toISOString()
    });
  }

  debug(message, meta) {
    return this.mockFns.debug(message, meta);
  }

  info(message, meta) {
    return this.mockFns.info(message, meta);
  }

  warn(message, meta) {
    return this.mockFns.warn(message, meta);
  }

  error(message, meta) {
    return this.mockFns.error(message, meta);
  }

  getLogs(level) {
    return level 
      ? this.logs.filter(log => log.level === level)
      : this.logs;
  }

  clearLogs() {
    this.logs = [];
  }

  wasCalled(level) {
    return this.mockFns[level]?.mock?.callCount() > 0;
  }
}

/**
 * Mock Authentication Provider
 */
export class MockAuthProvider {
  constructor() {
    this.users = new Map();
    this.tokens = new Map();
    this.sessions = new Map();
  }

  addUser(user) {
    this.users.set(user.id, user);
    this.users.set(user.email, user);
  }

  async validateCredentials(email, password) {
    const user = this.users.get(email);
    if (!user || user.password !== password) {
      return null;
    }
    return { id: user.id, email: user.email, role: user.role };
  }

  async generateToken(user) {
    const token = `mock-token-${Date.now()}-${Math.random().toString(36).substr(2)}`;
    this.tokens.set(token, user);
    return token;
  }

  async validateToken(token) {
    return this.tokens.get(token) || null;
  }

  async revokeToken(token) {
    this.tokens.delete(token);
    return true;
  }

  async createSession(user) {
    const sessionId = `session-${Date.now()}`;
    this.sessions.set(sessionId, {
      userId: user.id,
      createdAt: new Date().toISOString()
    });
    return sessionId;
  }

  clear() {
    this.users.clear();
    this.tokens.clear();
    this.sessions.clear();
  }
}

/**
 * Mock Queue Client (for message queues like RabbitMQ, SQS)
 */
export class MockQueueClient {
  constructor() {
    this.queues = new Map();
    this.consumers = new Map();
    this.connected = false;
  }

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  async assertQueue(name, options = {}) {
    if (!this.queues.has(name)) {
      this.queues.set(name, []);
    }
    return { queue: name };
  }

  async sendToQueue(queue, message, options = {}) {
    if (!this.queues.has(queue)) {
      await this.assertQueue(queue);
    }
    
    const msg = {
      content: Buffer.isBuffer(message) ? message : Buffer.from(JSON.stringify(message)),
      fields: { deliveryTag: Date.now() },
      properties: options
    };
    
    this.queues.get(queue).push(msg);
    
    // Trigger consumers
    const consumers = this.consumers.get(queue) || [];
    consumers.forEach(consumer => consumer(msg));
    
    return true;
  }

  async consume(queue, callback) {
    if (!this.consumers.has(queue)) {
      this.consumers.set(queue, []);
    }
    this.consumers.get(queue).push(callback);
    
    // Process existing messages
    const messages = this.queues.get(queue) || [];
    messages.forEach(msg => callback(msg));
    
    return { consumerTag: `consumer-${Date.now()}` };
  }

  async ack(message) {
    // Mock acknowledgment
    return true;
  }

  async nack(message, allUpTo = false, requeue = true) {
    // Mock negative acknowledgment
    return true;
  }

  getQueueMessages(queue) {
    return this.queues.get(queue) || [];
  }

  clearQueue(queue) {
    this.queues.set(queue, []);
  }

  clearAll() {
    this.queues.clear();
    this.consumers.clear();
  }
}

/**
 * Create a complete mock environment
 */
export function createMockEnvironment() {
  return {
    db: new MockDatabaseClient(),
    redis: new MockRedisClient(),
    email: new MockEmailClient(),
    storage: new MockFileStorageClient(),
    http: new MockHttpClient(),
    ws: MockWebSocketClient,
    logger: new MockLogger(),
    auth: new MockAuthProvider(),
    queue: new MockQueueClient(),
    
    // Helper to reset all mocks
    resetAll() {
      this.db.clearQueries();
      this.redis.clear();
      this.email.clearSentEmails();
      this.storage.clear();
      this.http.clearRequests();
      this.http.clearResponses();
      this.logger.clearLogs();
      this.auth.clear();
      this.queue.clearAll();
    }
  };
}

export default {
  MockDatabaseClient,
  MockRedisClient,
  MockEmailClient,
  MockFileStorageClient,
  MockHttpClient,
  MockWebSocketClient,
  MockLogger,
  MockAuthProvider,
  MockQueueClient,
  createMockEnvironment
};
