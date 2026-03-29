/**
 * @fileoverview Webhook Service - Core webhook functionality
 * @module domains/webhooks/webhook-service
 * @description Handles webhook registration, delivery, signature validation, and retry logic
 * @version 5.0.0
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { AppError, ValidationError, NotFoundError } from '../../utils/errors.js';
import { 
  WebhookEventType, 
  isValidEventType, 
  validateEventPayload,
  getCategoryForEventType 
} from './webhook-events.js';

/**
 * Webhook status values
 * @readonly
 * @enum {string}
 */
export const WebhookStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  DISABLED: 'disabled',
  FAILED: 'failed'
};

/**
 * Delivery status values
 * @readonly
 * @enum {string}
 */
export const DeliveryStatus = {
  PENDING: 'pending',
  DELIVERING: 'delivering',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  RETRYING: 'retrying',
  EXHAUSTED: 'exhausted'
};

/**
 * Signing algorithm values
 * @readonly
 * @enum {string}
 */
export const SigningAlgorithm = {
  HMAC_SHA256: 'hmac-sha256',
  HMAC_SHA512: 'hmac-sha512'
};

/**
 * Webhook Service class
 * @class
 * @description Handles all webhook-related operations
 */
export class WebhookService {
  /**
   * Creates a new WebhookService instance
   * @constructor
   * @param {Object} options - Service options
   * @param {import('better-sqlite3').Database} options.db - Database instance
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.httpClient] - HTTP client for webhook delivery (defaults to fetch)
   */
  constructor(options = {}) {
    this._db = options.db;
    this._logger = options.logger || console;
    this._httpClient = options.httpClient || null;
    
    // Default retry configuration
    this._retryConfig = {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      backoffMultiplier: 2,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504]
    };

    // Delivery tracking
    this._pendingDeliveries = new Map();
    this._deliveryQueue = [];
    this._isProcessingQueue = false;
  }

  // ============================================================
  // Webhook CRUD Operations
  // ============================================================

  /**
   * Register a new webhook
   * @async
   * @param {Object} data - Webhook configuration
   * @param {string} data.companyId - Company ID
   * @param {string} data.url - Webhook URL
   * @param {string[]} data.eventTypes - Event types to subscribe to
   * @param {string} [data.name] - Webhook name
   * @param {string} [data.description] - Webhook description
   * @param {Object} [data.headers] - Custom headers to include
   * @param {string} [data.signingAlgorithm='hmac-sha256'] - Signing algorithm
   * @param {string} [data.secret] - Custom secret (auto-generated if not provided)
   * @param {boolean} [data.active=true] - Whether webhook is active
   * @param {number} [data.retryCount=5] - Maximum retry attempts
   * @param {string} [data.createdByUserId] - Creating user ID
   * @param {string} [data.createdByAgentId] - Creating agent ID
   * @returns {Promise<Object>} Created webhook
   */
  async createWebhook(data) {
    this._validateWebhookData(data);

    // Generate secret if not provided
    const secret = data.secret || this._generateSecret();
    const secretHash = this._hashSecret(secret);

    // Create webhook
    const stmt = this._db.prepare(`
      INSERT INTO webhooks (
        company_id, name, description, url, headers, signing_algorithm,
        secret_hash, active, retry_count, created_by_user_id, created_by_agent_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const webhook = stmt.get(
      data.companyId,
      data.name || null,
      data.description || null,
      data.url,
      data.headers ? JSON.stringify(data.headers) : null,
      data.signingAlgorithm || SigningAlgorithm.HMAC_SHA256,
      secretHash,
      data.active !== false ? 1 : 0,
      data.retryCount ?? this._retryConfig.maxRetries,
      data.createdByUserId || null,
      data.createdByAgentId || null
    );

    // Create event type subscriptions
    if (data.eventTypes && data.eventTypes.length > 0) {
      await this._createEventSubscriptions(webhook.id, data.eventTypes);
    }

    this._logger.info(`[WebhookService] Created webhook: ${webhook.id}`);

    // Return webhook with plain secret (only shown once)
    return {
      ...this._transformWebhook(webhook),
      secret
    };
  }

  /**
   * Get a webhook by ID
   * @async
   * @param {string} id - Webhook ID
   * @param {string} companyId - Company ID for verification
   * @returns {Promise<Object|null>} Webhook or null
   */
  async getWebhook(id, companyId) {
    const stmt = this._db.prepare(`
      SELECT w.*,
        GROUP_CONCAT(wet.event_type) as event_types
      FROM webhooks w
      LEFT JOIN webhook_event_types wet ON w.id = wet.webhook_id
      WHERE w.id = ? AND w.company_id = ?
      GROUP BY w.id
    `);

    const webhook = stmt.get(id, companyId);
    return webhook ? this._transformWebhook(webhook) : null;
  }

  /**
   * List webhooks for a company
   * @async
   * @param {string} companyId - Company ID
   * @param {Object} [filters={}] - Filter options
   * @param {boolean} [filters.activeOnly=false] - Only active webhooks
   * @param {string} [filters.eventType] - Filter by event type
   * @param {number} [filters.limit=50] - Result limit
   * @param {number} [filters.offset=0] - Result offset
   * @returns {Promise<Object>} Paginated webhooks
   */
  async listWebhooks(companyId, filters = {}) {
    let whereClause = 'WHERE w.company_id = ?';
    const params = [companyId];

    if (filters.activeOnly) {
      whereClause += ' AND w.active = 1';
    }

    if (filters.eventType) {
      whereClause += ' AND w.id IN (SELECT webhook_id FROM webhook_event_types WHERE event_type = ?)';
      params.push(filters.eventType);
    }

    const countStmt = this._db.prepare(`
      SELECT COUNT(*) as total FROM webhooks w ${whereClause}
    `);
    const { total } = countStmt.get(...params);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const stmt = this._db.prepare(`
      SELECT w.*,
        GROUP_CONCAT(wet.event_type) as event_types,
        COUNT(DISTINCT wd.id) as total_deliveries,
        COUNT(DISTINCT CASE WHEN wd.status = 'delivered' THEN wd.id END) as successful_deliveries,
        MAX(wd.created_at) as last_delivery_at
      FROM webhooks w
      LEFT JOIN webhook_event_types wet ON w.id = wet.webhook_id
      LEFT JOIN webhook_deliveries wd ON w.id = wd.webhook_id
      ${whereClause}
      GROUP BY w.id
      ORDER BY w.created_at DESC
      LIMIT ? OFFSET ?
    `);

    const webhooks = stmt.all(...params, limit, offset);

    return {
      data: webhooks.map(w => this._transformWebhook(w)),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + webhooks.length < total
      }
    };
  }

  /**
   * Update a webhook
   * @async
   * @param {string} id - Webhook ID
   * @param {string} companyId - Company ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated webhook
   */
  async updateWebhook(id, companyId, updates) {
    const allowedFields = [
      'name', 'description', 'url', 'headers', 'signing_algorithm',
      'active', 'retry_count'
    ];

    const setClause = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbField = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(dbField)) {
        setClause.push(`${dbField} = ?`);
        params.push(dbField === 'headers' && value ? JSON.stringify(value) : value);
      }
    }

    if (setClause.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    params.push(id, companyId);

    const stmt = this._db.prepare(`
      UPDATE webhooks 
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
      RETURNING *
    `);

    const webhook = stmt.get(...params);
    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    // Update event types if provided
    if (updates.eventTypes) {
      await this._updateEventSubscriptions(id, updates.eventTypes);
    }

    this._logger.info(`[WebhookService] Updated webhook: ${id}`);
    return this.getWebhook(id, companyId);
  }

  /**
   * Delete a webhook
   * @async
   * @param {string} id - Webhook ID
   * @param {string} companyId - Company ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteWebhook(id, companyId) {
    const stmt = this._db.prepare(`
      DELETE FROM webhooks
      WHERE id = ? AND company_id = ?
    `);

    const result = stmt.run(id, companyId);
    
    if (result.changes === 0) {
      throw new NotFoundError('Webhook not found');
    }

    this._logger.info(`[WebhookService] Deleted webhook: ${id}`);
    return true;
  }

  /**
   * Rotate webhook secret
   * @async
   * @param {string} id - Webhook ID
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} New secret
   */
  async rotateSecret(id, companyId) {
    const newSecret = this._generateSecret();
    const secretHash = this._hashSecret(newSecret);

    const stmt = this._db.prepare(`
      UPDATE webhooks 
      SET secret_hash = ?, secret_rotated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
      RETURNING *
    `);

    const webhook = stmt.get(secretHash, id, companyId);
    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    this._logger.info(`[WebhookService] Rotated secret for webhook: ${id}`);
    
    return {
      webhookId: id,
      secret: newSecret,
      rotatedAt: new Date().toISOString()
    };
  }

  // ============================================================
  // Event Delivery
  // ============================================================

  /**
   * Trigger an event and dispatch to subscribed webhooks
   * @async
   * @param {WebhookEventType} eventType - Event type
   * @param {Object} payload - Event payload
   * @param {Object} [options] - Delivery options
   * @param {string} [options.companyId] - Filter by company
   * @param {string} [options.priority='normal'] - Delivery priority
   * @returns {Promise<Object>} Delivery result summary
   */
  async triggerEvent(eventType, payload, options = {}) {
    if (!isValidEventType(eventType)) {
      throw new ValidationError(`Invalid event type: ${eventType}`);
    }

    // Validate payload
    const validation = validateEventPayload(eventType, payload);
    if (!validation.valid) {
      throw new ValidationError(`Invalid payload: ${validation.errors.join(', ')}`);
    }

    // Find subscribed webhooks
    const webhooks = this._getSubscribedWebhooks(eventType, options.companyId);
    
    if (webhooks.length === 0) {
      return { dispatched: 0, webhooks: [] };
    }

    const eventId = this._generateEventId();
    const timestamp = new Date().toISOString();

    // Create delivery records
    const deliveries = [];
    for (const webhook of webhooks) {
      const delivery = await this._createDelivery(webhook, eventType, payload, eventId, timestamp);
      deliveries.push(delivery);
      
      // Add to queue
      this._deliveryQueue.push({
        deliveryId: delivery.id,
        webhook,
        eventType,
        payload,
        attempt: 0
      });
    }

    // Process queue
    this._processDeliveryQueue();

    this._logger.info(`[WebhookService] Triggered ${eventType} to ${webhooks.length} webhooks`);

    return {
      eventId,
      eventType,
      dispatched: webhooks.length,
      deliveries: deliveries.map(d => ({
        id: d.id,
        webhookId: d.webhookId,
        status: d.status
      }))
    };
  }

  /**
   * Send a test webhook delivery
   * @async
   * @param {string} webhookId - Webhook ID
   * @param {string} companyId - Company ID
   * @param {WebhookEventType} [eventType] - Event type to test (defaults to system.alert)
   * @returns {Promise<Object>} Test delivery result
   */
  async testWebhook(webhookId, companyId, eventType = WebhookEventType.SYSTEM_ALERT) {
    const webhook = await this.getWebhook(webhookId, companyId);
    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    const testPayload = {
      test: true,
      message: 'This is a test webhook delivery',
      timestamp: new Date().toISOString(),
      webhookId: webhook.id,
      eventType: eventType
    };

    const eventId = `test_${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Create delivery record
    const delivery = await this._createDelivery(webhook, eventType, testPayload, eventId, timestamp);

    // Attempt immediate delivery
    const result = await this._attemptDelivery(delivery, webhook, eventType, testPayload);

    return {
      success: result.success,
      deliveryId: delivery.id,
      webhookId: webhook.id,
      url: webhook.url,
      statusCode: result.statusCode,
      responseBody: result.responseBody,
      durationMs: result.durationMs,
      signature: result.signature
    };
  }

  // ============================================================
  // Delivery Management
  // ============================================================

  /**
   * List deliveries for a webhook
   * @async
   * @param {string} webhookId - Webhook ID
   * @param {string} companyId - Company ID
   * @param {Object} [filters={}] - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.eventType] - Filter by event type
   * @param {number} [filters.limit=50] - Result limit
   * @param {number} [filters.offset=0] - Result offset
   * @returns {Promise<Object>} Paginated deliveries
   */
  async listDeliveries(webhookId, companyId, filters = {}) {
    // Verify webhook exists
    const webhook = await this.getWebhook(webhookId, companyId);
    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    let whereClause = 'WHERE webhook_id = ?';
    const params = [webhookId];

    if (filters.status) {
      whereClause += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.eventType) {
      whereClause += ' AND event_type = ?';
      params.push(filters.eventType);
    }

    const countStmt = this._db.prepare(`
      SELECT COUNT(*) as total FROM webhook_deliveries ${whereClause}
    `);
    const { total } = countStmt.get(...params);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const stmt = this._db.prepare(`
      SELECT * FROM webhook_deliveries
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const deliveries = stmt.all(...params, limit, offset);

    return {
      data: deliveries.map(d => this._transformDelivery(d)),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + deliveries.length < total
      }
    };
  }

  /**
   * Get a specific delivery
   * @async
   * @param {string} deliveryId - Delivery ID
   * @param {string} companyId - Company ID
   * @returns {Promise<Object|null>} Delivery or null
   */
  async getDelivery(deliveryId, companyId) {
    const stmt = this._db.prepare(`
      SELECT wd.*, w.company_id
      FROM webhook_deliveries wd
      JOIN webhooks w ON wd.webhook_id = w.id
      WHERE wd.id = ? AND w.company_id = ?
    `);

    const delivery = stmt.get(deliveryId, companyId);
    return delivery ? this._transformDelivery(delivery) : null;
  }

  /**
   * Retry a failed delivery
   * @async
   * @param {string} deliveryId - Delivery ID
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} Retry result
   */
  async retryDelivery(deliveryId, companyId) {
    const delivery = await this.getDelivery(deliveryId, companyId);
    if (!delivery) {
      throw new NotFoundError('Delivery not found');
    }

    if (delivery.status === DeliveryStatus.DELIVERED) {
      throw new ValidationError('Cannot retry a successful delivery');
    }

    // Get webhook
    const webhook = await this.getWebhook(delivery.webhookId, companyId);
    if (!webhook || !webhook.active) {
      throw new ValidationError('Webhook is not active');
    }

    // Reset delivery status
    const stmt = this._db.prepare(`
      UPDATE webhook_deliveries 
      SET status = ?, attempt_count = 0, next_retry_at = NULL, error_message = NULL
      WHERE id = ?
    `);
    stmt.run(DeliveryStatus.PENDING, deliveryId);

    // Add to queue
    this._deliveryQueue.push({
      deliveryId: delivery.id,
      webhook,
      eventType: delivery.eventType,
      payload: delivery.payload,
      attempt: 0
    });

    this._processDeliveryQueue();

    return { success: true, deliveryId };
  }

  // ============================================================
  // Signature Validation
  // ============================================================

  /**
   * Generate signature for webhook payload
   * @param {Object} payload - Event payload
   * @param {string} secret - Webhook secret
   * @param {string} [algorithm='hmac-sha256'] - Signing algorithm
   * @returns {string} Generated signature
   */
  generateSignature(payload, secret, algorithm = SigningAlgorithm.HMAC_SHA256) {
    const data = JSON.stringify(payload);
    const algo = algorithm === SigningAlgorithm.HMAC_SHA512 ? 'sha512' : 'sha256';
    return createHmac(algo, secret).update(data).digest('hex');
  }

  /**
   * Verify webhook signature
   * @param {Object} payload - Event payload
   * @param {string} signature - Provided signature
   * @param {string} secret - Webhook secret
   * @param {string} [algorithm='hmac-sha256'] - Signing algorithm
   * @returns {boolean} True if signature is valid
   */
  verifySignature(payload, signature, secret, algorithm = SigningAlgorithm.HMAC_SHA256) {
    try {
      const expectedSignature = this.generateSignature(payload, secret, algorithm);
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      
      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }
      
      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify webhook signature from headers (supports multiple formats)
   * @param {Object} payload - Event payload
   * @param {Object} headers - HTTP headers
   * @param {string} secret - Webhook secret
   * @returns {boolean} True if signature is valid
   */
  verifySignatureFromHeaders(payload, headers, secret) {
    // Try common signature header formats
    const signature = 
      headers['x-webhook-signature'] ||
      headers['x-signature'] ||
      headers['webhook-signature'] ||
      headers['signature'];

    if (!signature) {
      return false;
    }

    // Handle signature with prefix (e.g., "sha256=...")
    const cleanSignature = signature.includes('=') 
      ? signature.split('=')[1] 
      : signature;

    return this.verifySignature(payload, cleanSignature, secret);
  }

  // ============================================================
  // Private Methods
  // ============================================================

  /**
   * Validate webhook data
   * @private
   * @param {Object} data - Webhook data
   * @throws {ValidationError} If validation fails
   */
  _validateWebhookData(data) {
    if (!data.companyId) {
      throw new ValidationError('companyId is required');
    }
    if (!data.url) {
      throw new ValidationError('url is required');
    }
    if (!this._isValidUrl(data.url)) {
      throw new ValidationError('Invalid URL format');
    }
    if (!data.eventTypes || !Array.isArray(data.eventTypes) || data.eventTypes.length === 0) {
      throw new ValidationError('eventTypes must be a non-empty array');
    }
    
    // Validate event types
    for (const eventType of data.eventTypes) {
      if (!isValidEventType(eventType)) {
        throw new ValidationError(`Invalid event type: ${eventType}`);
      }
    }
  }

  /**
   * Check if URL is valid
   * @private
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid
   */
  _isValidUrl(url) {
    try {
      const parsed = new URL(url);
      // Only allow HTTPS in production, HTTP for localhost
      if (process.env.NODE_ENV === 'production') {
        return parsed.protocol === 'https:';
      }
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  /**
   * Generate a random secret
   * @private
   * @returns {string} Generated secret
   */
  _generateSecret() {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Hash a secret for storage
   * @private
   * @param {string} secret - Secret to hash
   * @returns {string} Hashed secret
   */
  _hashSecret(secret) {
    // Simple hash for storage - in production use bcrypt or similar
    return createHmac('sha256', 'webhook-secret-key').update(secret).digest('hex');
  }

  /**
   * Generate unique event ID
   * @private
   * @returns {string} Event ID
   */
  _generateEventId() {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create event subscriptions
   * @private
   * @param {string} webhookId - Webhook ID
   * @param {string[]} eventTypes - Event types
   */
  _createEventSubscriptions(webhookId, eventTypes) {
    const stmt = this._db.prepare(`
      INSERT INTO webhook_event_types (webhook_id, event_type, category)
      VALUES (?, ?, ?)
    `);

    for (const eventType of eventTypes) {
      const category = getCategoryForEventType(eventType);
      stmt.run(webhookId, eventType, category);
    }
  }

  /**
   * Update event subscriptions
   * @private
   * @param {string} webhookId - Webhook ID
   * @param {string[]} eventTypes - New event types
   */
  _updateEventSubscriptions(webhookId, eventTypes) {
    // Delete existing subscriptions
    const deleteStmt = this._db.prepare(`
      DELETE FROM webhook_event_types WHERE webhook_id = ?
    `);
    deleteStmt.run(webhookId);

    // Create new subscriptions
    this._createEventSubscriptions(webhookId, eventTypes);
  }

  /**
   * Get webhooks subscribed to an event type
   * @private
   * @param {string} eventType - Event type
   * @param {string} [companyId] - Optional company filter
   * @returns {Array<Object>} Subscribed webhooks
   */
  _getSubscribedWebhooks(eventType, companyId) {
    let query = `
      SELECT w.* FROM webhooks w
      JOIN webhook_event_types wet ON w.id = wet.webhook_id
      WHERE wet.event_type = ? AND w.active = 1
    `;
    const params = [eventType];

    if (companyId) {
      query += ' AND w.company_id = ?';
      params.push(companyId);
    }

    const stmt = this._db.prepare(query);
    return stmt.all(...params).map(w => this._transformWebhook(w));
  }

  /**
   * Create delivery record
   * @private
   * @param {Object} webhook - Webhook
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @param {string} eventId - Event ID
   * @param {string} timestamp - Timestamp
   * @returns {Object} Created delivery
   */
  _createDelivery(webhook, eventType, payload, eventId, timestamp) {
    const stmt = this._db.prepare(`
      INSERT INTO webhook_deliveries (
        webhook_id, event_type, event_id, payload, status
      ) VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `);

    return stmt.get(
      webhook.id,
      eventType,
      eventId,
      JSON.stringify(payload),
      DeliveryStatus.PENDING
    );
  }

  /**
   * Process delivery queue
   * @private
   * @async
   */
  async _processDeliveryQueue() {
    if (this._isProcessingQueue) {
      return;
    }

    this._isProcessingQueue = true;

    try {
      while (this._deliveryQueue.length > 0) {
        const item = this._deliveryQueue.shift();
        await this._processDelivery(item);
      }
    } finally {
      this._isProcessingQueue = false;
    }
  }

  /**
   * Process a single delivery
   * @private
   * @param {Object} item - Delivery queue item
   */
  async _processDelivery(item) {
    const { deliveryId, webhook, eventType, payload, attempt } = item;

    // Get the full delivery record
    const deliveryStmt = this._db.prepare('SELECT * FROM webhook_deliveries WHERE id = ?');
    const delivery = deliveryStmt.get(deliveryId);

    if (!delivery || delivery.status === DeliveryStatus.DELIVERED) {
      return;
    }

    // Update status to delivering
    this._db.prepare(`
      UPDATE webhook_deliveries SET status = ?, attempt_count = ? WHERE id = ?
    `).run(DeliveryStatus.DELIVERING, attempt + 1, deliveryId);

    // Attempt delivery
    const result = await this._attemptDelivery(delivery, webhook, eventType, payload);

    if (result.success) {
      // Success - update delivery record
      this._db.prepare(`
        UPDATE webhook_deliveries 
        SET status = ?, http_status_code = ?, delivered_at = CURRENT_TIMESTAMP, 
            response_body = ?, duration_ms = ?
        WHERE id = ?
      `).run(
        DeliveryStatus.DELIVERED,
        result.statusCode,
        result.responseBody ? JSON.stringify(result.responseBody).substring(0, 1000) : null,
        result.durationMs,
        deliveryId
      );

      // Update webhook stats
      this._db.prepare(`
        UPDATE webhooks 
        SET last_success_at = CURRENT_TIMESTAMP, success_count = success_count + 1
        WHERE id = ?
      `).run(webhook.id);

    } else {
      // Failed - check if we should retry
      const maxRetries = webhook.retryCount || this._retryConfig.maxRetries;
      
      if (attempt < maxRetries && this._shouldRetry(result.statusCode)) {
        // Schedule retry with exponential backoff
        const delay = this._calculateRetryDelay(attempt);
        const nextRetryAt = new Date(Date.now() + delay);

        this._db.prepare(`
          UPDATE webhook_deliveries 
          SET status = ?, error_message = ?, http_status_code = ?, next_retry_at = ?
          WHERE id = ?
        `).run(
          DeliveryStatus.RETRYING,
          result.error?.substring(0, 500),
          result.statusCode,
          nextRetryAt.toISOString(),
          deliveryId
        );

        // Add back to queue with delay
        setTimeout(() => {
          this._deliveryQueue.push({
            deliveryId,
            webhook,
            eventType,
            payload,
            attempt: attempt + 1
          });
          this._processDeliveryQueue();
        }, delay);

      } else {
        // Exhausted retries
        this._db.prepare(`
          UPDATE webhook_deliveries 
          SET status = ?, error_message = ?, http_status_code = ?
          WHERE id = ?
        `).run(
          DeliveryStatus.EXHAUSTED,
          result.error?.substring(0, 500),
          result.statusCode,
          deliveryId
        );

        // Update webhook stats
        this._db.prepare(`
          UPDATE webhooks 
          SET last_failure_at = CURRENT_TIMESTAMP, failure_count = failure_count + 1
          WHERE id = ?
        `).run(webhook.id);

        // Check if we should disable the webhook
        await this._checkWebhookHealth(webhook);
      }
    }
  }

  /**
   * Attempt webhook delivery
   * @private
   * @param {Object} delivery - Delivery record
   * @param {Object} webhook - Webhook config
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @returns {Object} Delivery result
   */
  async _attemptDelivery(delivery, webhook, eventType, payload) {
    const startTime = Date.now();

    // Build payload with metadata
    const fullPayload = {
      eventId: delivery.event_id,
      eventType: eventType,
      timestamp: new Date().toISOString(),
      webhookId: webhook.id,
      data: payload
    };

    // Generate signature
    const signature = this.generateSignature(fullPayload, webhook.secret || '', webhook.signingAlgorithm);

    // Build headers
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Id': webhook.id,
      'X-Event-Id': delivery.event_id,
      'X-Event-Type': eventType,
      'User-Agent': 'CogniMesh-Webhook/5.0'
    };

    // Add custom headers if configured
    if (webhook.headers) {
      Object.assign(headers, webhook.headers);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const fetchFn = this._httpClient || fetch;
      const response = await fetchFn(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(fullPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;
      const responseBody = await response.text().catch(() => null);

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          responseBody,
          durationMs,
          signature
        };
      } else {
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`,
          responseBody,
          durationMs
        };
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        error: error.message || 'Network error',
        durationMs
      };
    }
  }

  /**
   * Check if we should retry based on status code
   * @private
   * @param {number} statusCode - HTTP status code
   * @returns {boolean} True if should retry
   */
  _shouldRetry(statusCode) {
    if (!statusCode) return true; // Network errors
    return this._retryConfig.retryableStatusCodes.includes(statusCode);
  }

  /**
   * Calculate retry delay with exponential backoff
   * @private
   * @param {number} attempt - Current attempt number
   * @returns {number} Delay in milliseconds
   */
  _calculateRetryDelay(attempt) {
    const delay = this._retryConfig.baseDelayMs * Math.pow(this._retryConfig.backoffMultiplier, attempt);
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.min(Math.floor(delay + jitter), this._retryConfig.maxDelayMs);
  }

  /**
   * Check webhook health and disable if too many failures
   * @private
   * @param {Object} webhook - Webhook
   */
  async _checkWebhookHealth(webhook) {
    // Check recent failure rate
    const stmt = this._db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as successful
      FROM webhook_deliveries
      WHERE webhook_id = ? AND created_at > datetime('now', '-24 hours')
    `);

    const stats = stmt.get(webhook.id);
    
    if (stats.total >= 10) {
      const failureRate = (stats.total - stats.successful) / stats.total;
      
      if (failureRate > 0.8) {
        // Disable webhook due to high failure rate
        this._db.prepare(`
          UPDATE webhooks 
          SET active = 0, disabled_reason = 'High failure rate', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(webhook.id);

        this._logger.warn(`[WebhookService] Disabled webhook ${webhook.id} due to high failure rate`);
      }
    }
  }

  /**
   * Transform database webhook to API format
   * @private
   * @param {Object} row - Database row
   * @returns {Object} Transformed webhook
   */
  _transformWebhook(row) {
    if (!row) return null;

    return {
      id: row.id,
      companyId: row.company_id,
      name: row.name,
      description: row.description,
      url: row.url,
      headers: row.headers ? JSON.parse(row.headers) : null,
      signingAlgorithm: row.signing_algorithm,
      active: Boolean(row.active),
      retryCount: row.retry_count,
      eventTypes: row.event_types ? row.event_types.split(',') : [],
      successCount: row.success_count || 0,
      failureCount: row.failure_count || 0,
      lastSuccessAt: row.last_success_at,
      lastFailureAt: row.last_failure_at,
      secretRotatedAt: row.secret_rotated_at,
      disabledReason: row.disabled_reason,
      totalDeliveries: row.total_deliveries || 0,
      successfulDeliveries: row.successful_deliveries || 0,
      lastDeliveryAt: row.last_delivery_at,
      createdByUserId: row.created_by_user_id,
      createdByAgentId: row.created_by_agent_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Transform database delivery to API format
   * @private
   * @param {Object} row - Database row
   * @returns {Object} Transformed delivery
   */
  _transformDelivery(row) {
    if (!row) return null;

    return {
      id: row.id,
      webhookId: row.webhook_id,
      eventType: row.event_type,
      eventId: row.event_id,
      payload: row.payload ? JSON.parse(row.payload) : null,
      status: row.status,
      httpStatusCode: row.http_status_code,
      attemptCount: row.attempt_count,
      errorMessage: row.error_message,
      responseBody: row.response_body,
      durationMs: row.duration_ms,
      deliveredAt: row.delivered_at,
      nextRetryAt: row.next_retry_at,
      createdAt: row.created_at
    };
  }
}

export default WebhookService;
