/**
 * @fileoverview Alert delivery channels with circuit breaker pattern.
 * Provides various channels for delivering alerts with resilience mechanisms.
 * @module alerts/channels
 */

import { EventEmitter } from 'events';
import https from 'https';
import http from 'http';
import net from 'net';

/**
 * Circuit breaker states.
 * @readonly
 * @enum {string}
 */
export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * Circuit breaker configuration.
 * @typedef {Object} CircuitBreakerConfig
 * @property {number} failureThreshold - Number of failures before opening circuit
 * @property {number} resetTimeout - Time in ms before attempting reset
 * @property {number} halfOpenMaxCalls - Max calls in half-open state
 */

/**
 * Base circuit breaker implementation for resilient external calls.
 * @extends EventEmitter
 */
export class CircuitBreaker extends EventEmitter {
  /**
   * Default circuit breaker configuration.
   * @type {CircuitBreakerConfig}
   */
  static DEFAULT_CONFIG = {
    failureThreshold: 5,
    resetTimeout: 30000,
    halfOpenMaxCalls: 3
  };

  /**
   * Creates a new CircuitBreaker instance.
   * @param {CircuitBreakerConfig} [config={}] - Circuit breaker configuration
   */
  constructor(config = {}) {
    super();
    this.config = { ...CircuitBreaker.DEFAULT_CONFIG, ...config };
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
  }

  /**
   * Executes a function with circuit breaker protection.
   * @template T
   * @param {Function} fn - Function to execute
   * @returns {Promise<T>} - Result of the function
   * @throws {Error} When circuit is open or function fails
   */
  async execute(fn) {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    if (this.state === CircuitState.HALF_OPEN && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      throw new Error('Circuit breaker is HALF_OPEN - max calls reached');
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handles successful execution.
   * @private
   */
  onSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenMaxCalls) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Handles failed execution.
   * @private
   */
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Transitions to a new state.
   * @param {CircuitState} newState - State to transition to
   * @private
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.successCount = 0;
    this.halfOpenCalls = 0;

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
    }

    this.emit('stateChange', { oldState, newState });
  }

  /**
   * Gets current circuit breaker state.
   * @returns {Object} Current state information
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Base class for alert delivery channels.
 * @extends EventEmitter
 * @abstract
 */
export class BaseChannel extends EventEmitter {
  /**
   * Creates a new BaseChannel instance.
   * @param {string} name - Channel name
   * @param {Object} [options={}] - Channel options
   */
  constructor(name, options = {}) {
    super();
    this.name = name;
    this.options = options;
    this.enabled = options.enabled !== false;
    this.metrics = {
      sent: 0,
      failed: 0,
      lastSent: null
    };
  }

  /**
   * Sends an alert through the channel.
   * @abstract
   * @param {Alert} alert - Alert to send
   * @returns {Promise<boolean>} - Whether the alert was sent successfully
   */
  async send(alert) {
    throw new Error('send() must be implemented by subclass');
  }

  /**
   * Gets channel metrics.
   * @returns {Object} Channel metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
}

/**
 * Email delivery channel using SMTP.
 * @extends BaseChannel
 */
export class EmailChannel extends BaseChannel {
  /**
   * Creates a new EmailChannel instance.
   * @param {Object} config - SMTP configuration
   * @param {string} config.host - SMTP server host
   * @param {number} config.port - SMTP server port
   * @param {string} [config.user] - SMTP username
   * @param {string} [config.password] - SMTP password
   * @param {string} config.from - From email address
   * @param {string[]} config.to - Recipient email addresses
   * @param {Object} [options={}] - Channel options
   */
  constructor(config, options = {}) {
    super('email', options);
    this.config = config;
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    this.circuitBreaker.on('stateChange', (state) => {
      this.emit('circuitStateChange', state);
    });
  }

  /**
   * Sends an alert via email.
   * @param {Alert} alert - Alert to send
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  async send(alert) {
    if (!this.enabled) return false;

    return this.circuitBreaker.execute(async () => {
      try {
        // In a real implementation, use nodemailer or similar
        // This is a placeholder for the SMTP send logic
        const emailContent = this.formatEmail(alert);
        await this.smtpSend(emailContent);

        this.metrics.sent++;
        this.metrics.lastSent = new Date().toISOString();
        this.emit('sent', { channel: this.name, alert });
        return true;
      } catch (error) {
        this.metrics.failed++;
        this.emit('failed', { channel: this.name, alert, error });
        throw error;
      }
    });
  }

  /**
   * Formats an alert as an email.
   * @private
   * @param {Alert} alert - Alert to format
   * @returns {Object} Formatted email content
   */
  formatEmail(alert) {
    return {
      from: this.config.from,
      to: this.config.to,
      subject: `[${alert.priority}] Alert: ${alert.type}`,
      text: `
Alert Type: ${alert.type}
Priority: ${alert.priority}
Timestamp: ${alert.timestamp}
Message: ${alert.message}

Metadata:
${JSON.stringify(alert.metadata, null, 2)}
      `.trim(),
      html: `
<h2>Alert: ${alert.type}</h2>
<p><strong>Priority:</strong> ${alert.priority}</p>
<p><strong>Timestamp:</strong> ${alert.timestamp}</p>
<p><strong>Message:</strong> ${alert.message}</p>
<h3>Metadata:</h3>
<pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
      `.trim()
    };
  }

  /**
   * Sends email via SMTP (placeholder implementation).
   * @private
   * @param {Object} content - Email content
   * @returns {Promise<void>}
   */
  async smtpSend(content) {
    // Placeholder: In real implementation, use nodemailer
    // For now, simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Webhook delivery channel using HTTP POST.
 * @extends BaseChannel
 */
export class WebhookChannel extends BaseChannel {
  /**
   * Creates a new WebhookChannel instance.
   * @param {Object} config - Webhook configuration
   * @param {string} config.url - Webhook URL
   * @param {Object} [config.headers={}] - Additional HTTP headers
   * @param {number} [config.timeout=5000] - Request timeout in ms
   * @param {Object} [options={}] - Channel options
   */
  constructor(config, options = {}) {
    super('webhook', options);
    this.config = {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
      ...config
    };
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    this.circuitBreaker.on('stateChange', (state) => {
      this.emit('circuitStateChange', state);
    });
  }

  /**
   * Sends an alert via HTTP POST webhook.
   * @param {Alert} alert - Alert to send
   * @returns {Promise<boolean>} - Whether the webhook was sent successfully
   */
  async send(alert) {
    if (!this.enabled) return false;

    return this.circuitBreaker.execute(async () => {
      try {
        const payload = JSON.stringify({
          channel: 'webhook',
          timestamp: new Date().toISOString(),
          alert: {
            id: alert.id,
            type: alert.type,
            priority: alert.priority,
            message: alert.message,
            metadata: alert.metadata
          }
        });

        await this.httpPost(payload);

        this.metrics.sent++;
        this.metrics.lastSent = new Date().toISOString();
        this.emit('sent', { channel: this.name, alert });
        return true;
      } catch (error) {
        this.metrics.failed++;
        this.emit('failed', { channel: this.name, alert, error });
        throw error;
      }
    });
  }

  /**
   * Performs HTTP POST request.
   * @private
   * @param {string} payload - JSON payload
   * @returns {Promise<void>}
   */
  httpPost(payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.url);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          ...this.config.headers,
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: this.config.timeout
      };

      const req = client.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(payload);
      req.end();
    });
  }
}

/**
 * Console output delivery channel.
 * @extends BaseChannel
 */
export class ConsoleChannel extends BaseChannel {
  /**
   * Creates a new ConsoleChannel instance.
   * @param {Object} [options={}] - Channel options
   * @param {Function} [options.logger=console.log] - Logging function
   */
  constructor(options = {}) {
    super('console', options);
    this.logger = options.logger || console.log;
  }

  /**
   * Sends an alert to console output.
   * @param {Alert} alert - Alert to send
   * @returns {Promise<boolean>} - Always returns true
   */
  async send(alert) {
    if (!this.enabled) return false;

    const output = {
      channel: 'console',
      timestamp: new Date().toISOString(),
      alert: {
        id: alert.id,
        type: alert.type,
        priority: alert.priority,
        message: alert.message,
        metadata: alert.metadata
      }
    };

    const colorCode = this.getColorCode(alert.priority);
    this.logger(`${colorCode}[${alert.priority}] ${alert.type}:${resetCode} ${alert.message}`);
    this.logger(JSON.stringify(output, null, 2));

    this.metrics.sent++;
    this.metrics.lastSent = new Date().toISOString();
    this.emit('sent', { channel: this.name, alert });
    return true;
  }

  /**
   * Gets ANSI color code for priority.
   * @private
   * @param {string} priority - Alert priority
   * @returns {string} ANSI color code
   */
  getColorCode(priority) {
    switch (priority) {
      case 'HIGH': return '\x1b[31m'; // Red
      case 'MEDIUM': return '\x1b[33m'; // Yellow
      case 'LOW': return '\x1b[32m'; // Green
      default: return '\x1b[0m';
    }
  }
}

/** @type {string} ANSI reset code */
const resetCode = '\x1b[0m';

/**
 * WebSocket delivery channel for real-time alerts.
 * @extends BaseChannel
 */
export class WebSocketChannel extends BaseChannel {
  /**
   * Creates a new WebSocketChannel instance.
   * @param {Object} config - WebSocket configuration
   * @param {number} [config.port=8080] - WebSocket server port
   * @param {string} [config.host='localhost'] - WebSocket server host
   * @param {Object} [options={}] - Channel options
   */
  constructor(config = {}, options = {}) {
    super('websocket', options);
    this.config = {
      port: 8080,
      host: 'localhost',
      ...config
    };
    this.clients = new Set();
    this.server = null;
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    this.circuitBreaker.on('stateChange', (state) => {
      this.emit('circuitStateChange', state);
    });
  }

  /**
   * Starts the WebSocket server.
   * @returns {Promise<void>}
   */
  async start() {
    if (this.server) return;

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, () => {
        this.emit('started', { host: this.config.host, port: this.config.port });
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  /**
   * Stops the WebSocket server.
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.server) return;

    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      this.server.close(() => {
        this.server = null;
        this.emit('stopped');
        resolve();
      });
    });
  }

  /**
   * Handles new WebSocket connections.
   * @private
   * @param {net.Socket} socket - Client socket
   */
  handleConnection(socket) {
    this.clients.add(socket);
    this.emit('clientConnected', { clientCount: this.clients.size });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.emit('clientDisconnected', { clientCount: this.clients.size });
    });

    socket.on('error', (error) => {
      this.emit('clientError', { error });
      this.clients.delete(socket);
    });
  }

  /**
   * Sends an alert to all connected WebSocket clients.
   * @param {Alert} alert - Alert to send
   * @returns {Promise<boolean>} - Whether the alert was broadcast successfully
   */
  async send(alert) {
    if (!this.enabled || this.clients.size === 0) return false;

    return this.circuitBreaker.execute(async () => {
      try {
        const message = JSON.stringify({
          channel: 'websocket',
          timestamp: new Date().toISOString(),
          alert: {
            id: alert.id,
            type: alert.type,
            priority: alert.priority,
            message: alert.message,
            metadata: alert.metadata
          }
        });

        const failures = [];
        for (const client of this.clients) {
          try {
            client.write(message + '\n');
          } catch (error) {
            failures.push(error);
          }
        }

        if (failures.length === this.clients.size) {
          throw new Error('All WebSocket clients failed');
        }

        this.metrics.sent++;
        this.metrics.lastSent = new Date().toISOString();
        this.emit('sent', { channel: this.name, alert, clientCount: this.clients.size });
        return true;
      } catch (error) {
        this.metrics.failed++;
        this.emit('failed', { channel: this.name, alert, error });
        throw error;
      }
    });
  }

  /**
   * Gets the number of connected clients.
   * @returns {number} Connected client count
   */
  getClientCount() {
    return this.clients.size;
  }
}

/**
 * Factory function to create channels by type.
 * @param {string} type - Channel type ('email', 'webhook', 'console', 'websocket')
 * @param {Object} config - Channel configuration
 * @param {Object} [options={}] - Channel options
 * @returns {BaseChannel} Created channel instance
 * @throws {Error} When channel type is unknown
 */
export function createChannel(type, config, options = {}) {
  switch (type.toLowerCase()) {
    case 'email':
      return new EmailChannel(config, options);
    case 'webhook':
      return new WebhookChannel(config, options);
    case 'console':
      return new ConsoleChannel(options);
    case 'websocket':
      return new WebSocketChannel(config, options);
    default:
      throw new Error(`Unknown channel type: ${type}`);
  }
}

export default {
  CircuitBreaker,
  CircuitState,
  BaseChannel,
  EmailChannel,
  WebhookChannel,
  ConsoleChannel,
  WebSocketChannel,
  createChannel
};
