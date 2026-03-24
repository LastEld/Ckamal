import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Abstract Base Client
 * Base class for all AI provider clients
 */

export class BaseClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.status = 'disconnected';
    this.latency = null;
    this.lastPing = null;
    this.health = {
      connected: false,
      lastError: null,
      reconnectAttempts: 0
    };
    this.id = crypto.randomUUID();
    this.name = config.name || 'unnamed-client';
    this.provider = config.provider || 'unknown';
    this.mode = config.mode || 'unknown';
  }

  /**
   * Initialize the client connection
   * @abstract
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Send a message to the client
   * @abstract
   * @param {string} message - Message to send
   * @param {Object} options - Send options
   */
  async send(message, options = {}) {
    throw new Error('send() must be implemented by subclass');
  }

  /**
   * Execute a task on the client
   * @abstract
   * @param {Object} task - Task definition
   * @param {Object} options - Execution options
   */
  async execute(task, options = {}) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Get client capabilities
   * @abstract
   * @returns {Object} Capabilities object
   */
  getCapabilities() {
    throw new Error('getCapabilities() must be implemented by subclass');
  }

  /**
   * Check if client is connected
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.health.connected;
  }

  /**
   * Get client status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      provider: this.provider,
      status: this.status,
      latency: this.latency,
      health: { ...this.health },
      capabilities: this.getCapabilities()
    };
  }

  /**
   * Update health status
   * @param {Object} health - Health update
   */
  updateHealth(health) {
    this.health = { ...this.health, ...health };
    this.emit('health', this.health);
  }

  /**
   * Measure and update latency
   */
  async ping() {
    const start = Date.now();
    try {
      await this._doPing();
      this.latency = Date.now() - start;
      this.lastPing = new Date();
      this.updateHealth({ connected: true, lastError: null });
    } catch (error) {
      this.latency = null;
      this.updateHealth({ 
        connected: false, 
        lastError: error.message,
        reconnectAttempts: this.health.reconnectAttempts + 1
      });
      throw error;
    }
    return this.latency;
  }

  /**
   * Internal ping implementation
   * @abstract
   * @protected
   */
  async _doPing() {
    throw new Error('_doPing() must be implemented by subclass');
  }

  /**
   * Reconnect the client
   */
  async reconnect() {
    this.status = 'reconnecting';
    this.emit('reconnecting');
    try {
      await this.initialize();
      this.health.reconnectAttempts = 0;
      this.emit('reconnected');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect the client
   */
  async disconnect() {
    this.status = 'disconnected';
    this.health.connected = false;
    this.emit('disconnected');
  }

  /**
   * Format message for this provider
   * @param {Object} message - Generic message format
   * @returns {Object} Provider-specific format
   */
  formatMessage(message) {
    return message;
  }

  /**
   * Parse response from this provider
   * @param {Object} response - Provider-specific response
   * @returns {Object} Generic response format
   */
  parseResponse(response) {
    return response;
  }
}
