/**
 * @fileoverview Webhooks Controller
 * REST API controller for webhook management
 * 
 * @module controllers/webhooks-controller
 * @version 5.0.0
 */

import { WebhookService, WebhookStatus, SigningAlgorithm } from '../domains/webhooks/webhook-service.js';
import { WebhookEventType, getAllEventTypes, getEventTypeDescription, getEventTypesByCategory } from '../domains/webhooks/webhook-events.js';
import {
    validateRequest,
    formatResponse,
    formatListResponse,
    handleError
} from './helpers.js';

/**
 * Webhook creation schema
 * @const {Object}
 */
const WEBHOOK_CREATE_SCHEMA = {
    required: ['companyId', 'url', 'eventTypes'],
    types: {
        companyId: 'string',
        url: 'string',
        name: 'string',
        description: 'string',
        eventTypes: 'array',
        headers: 'object',
        signingAlgorithm: 'string',
        secret: 'string',
        active: 'boolean',
        retryCount: 'number'
    },
    enums: {
        signingAlgorithm: Object.values(SigningAlgorithm)
    },
    validators: {
        url: (value) => {
            try {
                new URL(value);
                return true;
            } catch {
                return 'Invalid URL format';
            }
        },
        eventTypes: (value) => {
            if (!Array.isArray(value) || value.length === 0) {
                return 'eventTypes must be a non-empty array';
            }
            const validTypes = getAllEventTypes();
            for (const type of value) {
                if (!validTypes.includes(type)) {
                    return `Invalid event type: ${type}`;
                }
            }
            return true;
        },
        retryCount: (value) => {
            if (value !== undefined && (value < 0 || value > 20)) {
                return 'retryCount must be between 0 and 20';
            }
            return true;
        }
    }
};

/**
 * Webhook update schema
 * @const {Object}
 */
const WEBHOOK_UPDATE_SCHEMA = {
    types: {
        name: 'string',
        description: 'string',
        url: 'string',
        eventTypes: 'array',
        headers: 'object',
        signingAlgorithm: 'string',
        active: 'boolean',
        retryCount: 'number'
    },
    enums: {
        signingAlgorithm: Object.values(SigningAlgorithm)
    },
    validators: {
        url: (value) => {
            if (!value) return true;
            try {
                new URL(value);
                return true;
            } catch {
                return 'Invalid URL format';
            }
        },
        eventTypes: (value) => {
            if (!value) return true;
            if (!Array.isArray(value) || value.length === 0) {
                return 'eventTypes must be a non-empty array';
            }
            const validTypes = getAllEventTypes();
            for (const type of value) {
                if (!validTypes.includes(type)) {
                    return `Invalid event type: ${type}`;
                }
            }
            return true;
        },
        retryCount: (value) => {
            if (value !== undefined && (value < 0 || value > 20)) {
                return 'retryCount must be between 0 and 20';
            }
            return true;
        }
    }
};

/**
 * WebhooksController class
 * Manages webhook endpoints, deliveries, and event subscriptions
 */
export class WebhooksController {
    /**
     * Create a new WebhooksController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.db] - Database instance
     * @param {Object} [options.service] - WebhookService instance (optional)
     * @param {Object} [options.logger] - Logger instance
     */
    constructor(options = {}) {
        this.service = options.service;
        this.db = options.db;
        this.logger = options.logger || console;
        this.name = 'WebhooksController';
    }

    /**
     * Get or initialize the webhook service
     * @private
     * @returns {WebhookService}
     */
    _getService() {
        if (!this.service) {
            if (!this.db) {
                throw new Error('Database instance required for WebhookService');
            }
            this.service = new WebhookService({ db: this.db, logger: this.logger });
        }
        return this.service;
    }

    // ========================================================================
    // Webhook CRUD
    // ========================================================================

    /**
     * Create a new webhook
     * @param {Object} data - Webhook configuration
     * @param {string} data.companyId - Company ID
     * @param {string} data.url - Webhook URL
     * @param {string[]} data.eventTypes - Event types to subscribe to
     * @param {string} [data.name] - Webhook name
     * @param {string} [data.description] - Webhook description
     * @returns {Promise<Object>} Created webhook
     * 
     * @example
     * const webhook = await controller.createWebhook({
     *   companyId: 'comp-123',
     *   url: 'https://example.com/webhook',
     *   eventTypes: ['task.completed', 'issue.created'],
     *   name: 'My Webhook'
     * });
     */
    async createWebhook(data) {
        try {
            const validation = validateRequest(WEBHOOK_CREATE_SCHEMA, data);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const webhook = await service.createWebhook({
                companyId: data.companyId,
                url: data.url,
                name: data.name,
                description: data.description,
                eventTypes: data.eventTypes,
                headers: data.headers,
                signingAlgorithm: data.signingAlgorithm,
                secret: data.secret,
                active: data.active,
                retryCount: data.retryCount,
                createdByUserId: data.createdByUserId,
                createdByAgentId: data.createdByAgentId
            });

            return formatResponse(webhook, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create webhook' });
        }
    }

    /**
     * List webhooks for a company
     * @param {string} companyId - Company ID
     * @param {Object} [filters] - Filter options
     * @param {boolean} [filters.activeOnly] - Only active webhooks
     * @param {string} [filters.eventType] - Filter by event type
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} Paginated webhooks
     */
    async listWebhooks(companyId, filters = {}, pagination = {}) {
        try {
            if (!companyId) {
                return {
                    success: false,
                    error: 'companyId is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const result = await service.listWebhooks(companyId, {
                activeOnly: filters.activeOnly,
                eventType: filters.eventType,
                limit: pagination.limit || 50,
                offset: pagination.offset || 0
            });

            return formatListResponse(result.data, result.pagination);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list webhooks' });
        }
    }

    /**
     * Get a single webhook by ID
     * @param {string} id - Webhook ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} Webhook data
     */
    async getWebhook(id, companyId) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Webhook ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const webhook = await service.getWebhook(id, companyId);

            if (!webhook) {
                return {
                    success: false,
                    error: `Webhook not found: ${id}`,
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse(webhook);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get webhook' });
        }
    }

    /**
     * Update a webhook
     * @param {string} id - Webhook ID
     * @param {string} companyId - Company ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated webhook
     */
    async updateWebhook(id, companyId, updates) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Webhook ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const validation = validateRequest(WEBHOOK_UPDATE_SCHEMA, updates);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const webhook = await service.updateWebhook(id, companyId, {
                name: updates.name,
                description: updates.description,
                url: updates.url,
                eventTypes: updates.eventTypes,
                headers: updates.headers,
                signingAlgorithm: updates.signingAlgorithm,
                active: updates.active,
                retryCount: updates.retryCount
            });

            return formatResponse(webhook, { updated: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to update webhook' });
        }
    }

    /**
     * Delete a webhook
     * @param {string} id - Webhook ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteWebhook(id, companyId) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Webhook ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            await service.deleteWebhook(id, companyId);

            return formatResponse({ id, deleted: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to delete webhook' });
        }
    }

    // ========================================================================
    // Webhook Testing
    // ========================================================================

    /**
     * Test a webhook
     * @param {string} id - Webhook ID
     * @param {string} companyId - Company ID
     * @param {WebhookEventType} [eventType] - Event type to test
     * @returns {Promise<Object>} Test result
     */
    async testWebhook(id, companyId, eventType) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Webhook ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const result = await service.testWebhook(id, companyId, eventType);

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to test webhook' });
        }
    }

    // ========================================================================
    // Secret Rotation
    // ========================================================================

    /**
     * Rotate webhook secret
     * @param {string} id - Webhook ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} New secret
     */
    async rotateSecret(id, companyId) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Webhook ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const result = await service.rotateSecret(id, companyId);

            return formatResponse(result, { rotated: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to rotate secret' });
        }
    }

    // ========================================================================
    // Deliveries
    // ========================================================================

    /**
     * List deliveries for a webhook
     * @param {string} id - Webhook ID
     * @param {string} companyId - Company ID
     * @param {Object} [filters] - Filter options
     * @param {string} [filters.status] - Filter by status
     * @param {string} [filters.eventType] - Filter by event type
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} Paginated deliveries
     */
    async listDeliveries(id, companyId, filters = {}, pagination = {}) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Webhook ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const result = await service.listDeliveries(id, companyId, {
                status: filters.status,
                eventType: filters.eventType,
                limit: pagination.limit || 50,
                offset: pagination.offset || 0
            });

            return formatListResponse(result.data, result.pagination);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list deliveries' });
        }
    }

    /**
     * Get a specific delivery
     * @param {string} webhookId - Webhook ID
     * @param {string} deliveryId - Delivery ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} Delivery data
     */
    async getDelivery(webhookId, deliveryId, companyId) {
        try {
            if (!webhookId || !deliveryId || !companyId) {
                return {
                    success: false,
                    error: 'Webhook ID, Delivery ID, and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const delivery = await service.getDelivery(deliveryId, companyId);

            if (!delivery) {
                return {
                    success: false,
                    error: `Delivery not found: ${deliveryId}`,
                    code: 'NOT_FOUND'
                };
            }

            // Verify delivery belongs to webhook
            if (delivery.webhookId !== webhookId) {
                return {
                    success: false,
                    error: 'Delivery does not belong to this webhook',
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse(delivery);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get delivery' });
        }
    }

    /**
     * Retry a failed delivery
     * @param {string} webhookId - Webhook ID
     * @param {string} deliveryId - Delivery ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} Retry result
     */
    async retryDelivery(webhookId, deliveryId, companyId) {
        try {
            if (!webhookId || !deliveryId || !companyId) {
                return {
                    success: false,
                    error: 'Webhook ID, Delivery ID, and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const result = await service.retryDelivery(deliveryId, companyId);

            return formatResponse(result, { retried: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to retry delivery' });
        }
    }

    // ========================================================================
    // Event Types
    // ========================================================================

    /**
     * List available event types
     * @param {string} [category] - Optional category filter
     * @returns {Promise<Object>} Event types list
     */
    async listEventTypes(category) {
        try {
            let eventTypes;
            
            if (category) {
                eventTypes = getEventTypesByCategory(category);
            } else {
                eventTypes = getAllEventTypes();
            }

            const typesWithDescriptions = eventTypes.map(type => ({
                type,
                category: getEventTypesByCategory(category).includes(type) ? category : null,
                description: getEventTypeDescription(type)
            }));

            return formatResponse(typesWithDescriptions, { count: typesWithDescriptions.length });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list event types' });
        }
    }

    // ========================================================================
    // HTTP Request Handler
    // ========================================================================

    /**
     * Handle HTTP requests
     * @param {import('http').IncomingMessage} req
     * @param {import('http').ServerResponse} res
     * @returns {Promise<boolean>}
     */
    async handle(req, res) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;
        const method = req.method;

        // Parse request body for POST/PUT/PATCH requests
        let body = {};
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
            body = await this._readJsonBody(req);
        }

        // Parse query params for GET requests
        const queryParams = Object.fromEntries(url.searchParams);

        // GET /api/webhooks/event-types - List event types
        if (pathname === '/api/webhooks/event-types' && method === 'GET') {
            const result = await this.listEventTypes(queryParams.category);
            this._sendJson(res, result.success ? 200 : 500, result);
            return true;
        }

        // POST /api/webhooks - Create webhook
        if (pathname === '/api/webhooks' && method === 'POST') {
            const result = await this.createWebhook(body);
            this._sendJson(res, result.success ? 201 : (result.code === 'VALIDATION_ERROR' ? 400 : 500), result);
            return true;
        }

        // GET /api/webhooks - List webhooks
        if (pathname === '/api/webhooks' && method === 'GET') {
            const result = await this.listWebhooks(
                queryParams.companyId,
                {
                    activeOnly: queryParams.activeOnly === 'true',
                    eventType: queryParams.eventType
                },
                {
                    limit: parseInt(queryParams.limit, 10) || 50,
                    offset: parseInt(queryParams.offset, 10) || 0
                }
            );
            this._sendJson(res, result.success ? 200 : 500, result);
            return true;
        }

        // GET /api/webhooks/:id - Get webhook
        const getMatch = pathname.match(/^\/api\/webhooks\/([^/]+)$/);
        if (getMatch && method === 'GET') {
            const id = decodeURIComponent(getMatch[1]);
            const result = await this.getWebhook(id, queryParams.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // PUT /api/webhooks/:id - Update webhook
        if (getMatch && method === 'PUT') {
            const id = decodeURIComponent(getMatch[1]);
            const result = await this.updateWebhook(id, body.companyId, body);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // DELETE /api/webhooks/:id - Delete webhook
        if (getMatch && method === 'DELETE') {
            const id = decodeURIComponent(getMatch[1]);
            const result = await this.deleteWebhook(id, queryParams.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/webhooks/:id/test - Test webhook
        const testMatch = pathname.match(/^\/api\/webhooks\/([^/]+)\/test$/);
        if (testMatch && method === 'POST') {
            const id = decodeURIComponent(testMatch[1]);
            const result = await this.testWebhook(id, body.companyId, body.eventType);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/webhooks/:id/rotate - Rotate secret
        const rotateMatch = pathname.match(/^\/api\/webhooks\/([^/]+)\/rotate$/);
        if (rotateMatch && method === 'POST') {
            const id = decodeURIComponent(rotateMatch[1]);
            const result = await this.rotateSecret(id, body.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // GET /api/webhooks/:id/deliveries - List deliveries
        const deliveriesMatch = pathname.match(/^\/api\/webhooks\/([^/]+)\/deliveries$/);
        if (deliveriesMatch && method === 'GET') {
            const id = decodeURIComponent(deliveriesMatch[1]);
            const result = await this.listDeliveries(
                id,
                queryParams.companyId,
                {
                    status: queryParams.status,
                    eventType: queryParams.eventType
                },
                {
                    limit: parseInt(queryParams.limit, 10) || 50,
                    offset: parseInt(queryParams.offset, 10) || 0
                }
            );
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // GET /api/webhooks/:id/deliveries/:deliveryId - Get delivery
        const deliveryMatch = pathname.match(/^\/api\/webhooks\/([^/]+)\/deliveries\/([^/]+)$/);
        if (deliveryMatch && method === 'GET') {
            const webhookId = decodeURIComponent(deliveryMatch[1]);
            const deliveryId = decodeURIComponent(deliveryMatch[2]);
            const result = await this.getDelivery(webhookId, deliveryId, queryParams.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/webhooks/:id/deliveries/:deliveryId/retry - Retry delivery
        if (deliveryMatch && method === 'POST') {
            const webhookId = decodeURIComponent(deliveryMatch[1]);
            const deliveryId = decodeURIComponent(deliveryMatch[2]);
            const result = await this.retryDelivery(webhookId, deliveryId, body.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        return false;
    }

    /**
     * Read and parse JSON request body
     * @private
     * @param {import('http').IncomingMessage} req
     * @returns {Promise<Object>}
     */
    async _readJsonBody(req) {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (chunks.length === 0) return {};
        
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) return {};
        
        try {
            return JSON.parse(raw);
        } catch {
            return {};
        }
    }

    /**
     * Send JSON response
     * @private
     * @param {import('http').ServerResponse} res
     * @param {number} statusCode
     * @param {Object} payload
     */
    _sendJson(res, statusCode, payload) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload, null, 2));
    }
}

/**
 * Create a new WebhooksController instance
 * @param {Object} [options] - Controller options
 * @returns {WebhooksController} WebhooksController instance
 */
export function createWebhooksController(options = {}) {
    return new WebhooksController(options);
}

export default WebhooksController;
