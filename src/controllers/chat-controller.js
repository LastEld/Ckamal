/**
 * @fileoverview Chat Controller - REST API for CEO Chat
 * @module controllers/chat-controller
 * 
 * HTTP endpoints for:
 * - Thread CRUD operations
 * - Message management with threading
 * - CEO agent integration
 * - Read state tracking
 * - Reactions and attachments
 */

import { ChatService, ThreadKind, ThreadStatus, MessageAuthorType } from '../domains/chat/chat-service.js';
import {
  validateRequest,
  formatResponse,
  formatListResponse,
  handleError
} from './helpers.js';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const THREAD_SCHEMA = {
  required: ['title', 'companyId', 'createdById'],
  types: {
    title: 'string',
    description: 'string',
    companyId: 'string',
    createdById: 'string',
    kind: 'string',
    priority: 'string',
    issueId: 'string',
    approvalId: 'string',
    taskId: 'number'
  },
  enums: {
    kind: Object.values(ThreadKind),
    priority: ['low', 'normal', 'high', 'urgent']
  }
};

const MESSAGE_SCHEMA = {
  required: ['content', 'authorId'],
  types: {
    content: 'string',
    authorId: 'string',
    authorType: 'string',
    authorName: 'string',
    contentType: 'string',
    parentId: 'string',
    threadRootId: 'string'
  },
  enums: {
    authorType: Object.values(MessageAuthorType),
    contentType: ['text', 'markdown', 'system', 'action']
  }
};

const REACTION_SCHEMA = {
  required: ['reactorType', 'reactorId', 'reaction'],
  types: {
    reactorType: 'string',
    reactorId: 'string',
    reaction: 'string'
  },
  enums: {
    reactorType: ['user', 'agent']
  }
};

// ============================================================================
// CHAT CONTROLLER
// ============================================================================

/**
 * Chat Controller - REST API for CEO Chat system
 */
export class ChatController {
  /**
   * Create ChatController instance
   * @param {Object} options
   * @param {Object} [options.db] - Database instance
   * @param {ChatService} [options.service] - Chat service instance
   */
  constructor(options = {}) {
    this.service = options.service;
    this.db = options.db;
    this.name = 'ChatController';
  }

  /**
   * Get or initialize chat service
   * @private
   * @returns {ChatService}
   */
  _getService() {
    if (!this.service) {
      if (!this.db) {
        throw new Error('Database instance required for ChatService');
      }
      this.service = new ChatService({ db: this.db });
    }
    return this.service;
  }

  // ============================================================================
  // THREAD OPERATIONS
  // ============================================================================

  /**
   * Create a new chat thread
   * @param {Object} data - Thread data
   * @returns {Promise<Object>} Created thread
   */
  async createThread(data) {
    try {
      const validation = validateRequest(THREAD_SCHEMA, data);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const thread = await service.createThread({
        title: data.title,
        description: data.description,
        companyId: data.companyId,
        kind: data.kind || ThreadKind.QUESTION,
        priority: data.priority || 'normal',
        createdByType: data.createdByType || MessageAuthorType.USER,
        createdById: data.createdById,
        issueId: data.issueId,
        approvalId: data.approvalId,
        taskId: data.taskId
      });

      return formatResponse(thread, { created: true });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to create thread' });
    }
  }

  /**
   * List threads with filters
   * @param {Object} filters - Query filters
   * @returns {Promise<Object>} List of threads
   */
  async listThreads(filters = {}) {
    try {
      const service = this._getService();
      const threads = service.listThreads({
        companyId: filters.companyId,
        status: filters.status,
        kind: filters.kind,
        priority: filters.priority,
        assignedToType: filters.assignedToType,
        assignedToId: filters.assignedToId,
        participantType: filters.participantType,
        participantId: filters.participantId,
        limit: parseInt(filters.limit, 10) || 50,
        offset: parseInt(filters.offset, 10) || 0
      });

      return formatListResponse(threads, {
        total: threads.length,
        limit: filters.limit,
        offset: filters.offset
      });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to list threads' });
    }
  }

  /**
   * Get a single thread by ID
   * @param {string} id - Thread ID
   * @returns {Promise<Object>} Thread data
   */
  async getThread(id) {
    try {
      if (!id) {
        return {
          success: false,
          error: 'Thread ID is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const thread = service.getThread(id);

      if (!thread) {
        return {
          success: false,
          error: `Thread not found: ${id}`,
          code: 'NOT_FOUND'
        };
      }

      return formatResponse(thread);
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to get thread' });
    }
  }

  /**
   * Update thread
   * @param {string} id - Thread ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated thread
   */
  async updateThread(id, data) {
    try {
      if (!id) {
        return {
          success: false,
          error: 'Thread ID is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const thread = await service.updateThread(id, {
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        assignedToType: data.assignedToType,
        assignedToId: data.assignedToId
      });

      return formatResponse(thread);
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to update thread' });
    }
  }

  /**
   * Resolve a thread
   * @param {string} id - Thread ID
   * @param {Object} data - Resolution data
   * @returns {Promise<Object>} Resolved thread
   */
  async resolveThread(id, data) {
    try {
      if (!id) {
        return {
          success: false,
          error: 'Thread ID is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const thread = await service.resolveThread(id, {
        resolvedBy: data.resolvedBy,
        resolution: data.resolution,
        resolutionMessage: data.resolutionMessage
      });

      return formatResponse(thread, { resolved: true });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to resolve thread' });
    }
  }

  /**
   * Close a thread
   * @param {string} id - Thread ID
   * @returns {Promise<Object>} Closed thread
   */
  async closeThread(id) {
    try {
      if (!id) {
        return {
          success: false,
          error: 'Thread ID is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const thread = await service.updateThread(id, { status: ThreadStatus.CLOSED });

      return formatResponse(thread, { closed: true });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to close thread' });
    }
  }

  /**
   * Delete a thread
   * @param {string} id - Thread ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteThread(id) {
    try {
      if (!id) {
        return {
          success: false,
          error: 'Thread ID is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      // Archive instead of hard delete
      await service.updateThread(id, { status: ThreadStatus.ARCHIVED });

      return formatResponse({ id, deleted: true, archived: true });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to delete thread' });
    }
  }

  // ============================================================================
  // MESSAGE OPERATIONS
  // ============================================================================

  /**
   * Add message to thread
   * @param {string} threadId - Thread ID
   * @param {Object} data - Message data
   * @returns {Promise<Object>} Created message
   */
  async addMessage(threadId, data) {
    try {
      if (!threadId) {
        return {
          success: false,
          error: 'Thread ID is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const validation = validateRequest(MESSAGE_SCHEMA, data);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const message = await service.addMessage(threadId, {
        content: data.content,
        authorType: data.authorType || MessageAuthorType.USER,
        authorId: data.authorId,
        authorName: data.authorName,
        contentType: data.contentType || 'text',
        parentId: data.parentId,
        threadRootId: data.threadRootId,
        isSystem: data.isSystem || false,
        actionType: data.actionType,
        actionData: data.actionData,
        actionStatus: data.actionStatus
      });

      return formatResponse(message, { created: true });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to add message' });
    }
  }

  /**
   * Get messages for a thread
   * @param {string} threadId - Thread ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} List of messages
   */
  async getMessages(threadId, options = {}) {
    try {
      if (!threadId) {
        return {
          success: false,
          error: 'Thread ID is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const messages = service.getMessages(threadId, {
        limit: parseInt(options.limit, 10) || 100,
        offset: parseInt(options.offset, 10) || 0,
        includeDeleted: options.includeDeleted === 'true',
        threadRootId: options.threadRootId
      });

      return formatListResponse(messages, {
        total: messages.length,
        limit: options.limit,
        offset: options.offset
      });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to get messages' });
    }
  }

  /**
   * Get threaded messages with replies
   * @param {string} threadId - Thread ID
   * @returns {Promise<Object>} Threaded messages
   */
  async getThreadedMessages(threadId) {
    try {
      if (!threadId) {
        return {
          success: false,
          error: 'Thread ID is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const messages = service.getThreadedMessages(threadId);

      return formatListResponse(messages, {
        total: messages.length,
        threaded: true
      });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to get threaded messages' });
    }
  }

  /**
   * Update message
   * @param {string} threadId - Thread ID
   * @param {string} messageId - Message ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated message
   */
  async updateMessage(threadId, messageId, data) {
    try {
      if (!threadId || !messageId) {
        return {
          success: false,
          error: 'Thread ID and Message ID are required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const message = await service.updateMessage(messageId, {
        content: data.content
      });

      return formatResponse(message);
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to update message' });
    }
  }

  /**
   * Delete message
   * @param {string} threadId - Thread ID
   * @param {string} messageId - Message ID
   * @param {string} deletedBy - User ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteMessage(threadId, messageId, deletedBy) {
    try {
      if (!threadId || !messageId) {
        return {
          success: false,
          error: 'Thread ID and Message ID are required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      await service.deleteMessage(messageId, deletedBy);

      return formatResponse({ threadId, messageId, deleted: true });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to delete message' });
    }
  }

  // ============================================================================
  // READ STATE OPERATIONS
  // ============================================================================

  /**
   * Mark thread as read
   * @param {string} threadId - Thread ID
   * @param {Object} data - Read data
   * @returns {Promise<Object>} Read state
   */
  async markAsRead(threadId, data) {
    try {
      if (!threadId) {
        return {
          success: false,
          error: 'Thread ID is required',
          code: 'VALIDATION_ERROR'
        };
      }

      if (!data?.userId) {
        return {
          success: false,
          error: 'userId is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const readState = await service.markAsRead(threadId, data.userId, data.lastMessageId);

      return formatResponse(readState);
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to mark as read' });
    }
  }

  /**
   * Get unread count for user
   * @param {string} userId - User ID
   * @param {string} [companyId] - Company ID
   * @returns {Promise<Object>} Unread count
   */
  async getUnreadCount(userId, companyId) {
    try {
      if (!userId) {
        return {
          success: false,
          error: 'userId is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const count = service.getUnreadCount(userId, companyId);

      return formatResponse({ count, userId, companyId });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to get unread count' });
    }
  }

  // ============================================================================
  // REACTION OPERATIONS
  // ============================================================================

  /**
   * Add reaction to message
   * @param {string} threadId - Thread ID
   * @param {string} messageId - Message ID
   * @param {Object} data - Reaction data
   * @returns {Promise<Object>} Reaction
   */
  async addReaction(threadId, messageId, data) {
    try {
      if (!threadId || !messageId) {
        return {
          success: false,
          error: 'Thread ID and Message ID are required',
          code: 'VALIDATION_ERROR'
        };
      }

      const validation = validateRequest(REACTION_SCHEMA, data);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const reaction = await service.addReaction(messageId, {
        reactorType: data.reactorType,
        reactorId: data.reactorId,
        reaction: data.reaction
      });

      return formatResponse(reaction, { created: true });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to add reaction' });
    }
  }

  /**
   * Remove reaction from message
   * @param {string} threadId - Thread ID
   * @param {string} messageId - Message ID
   * @param {Object} data - Reaction data
   * @returns {Promise<Object>} Removal result
   */
  async removeReaction(threadId, messageId, data) {
    try {
      if (!threadId || !messageId) {
        return {
          success: false,
          error: 'Thread ID and Message ID are required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      await service.removeReaction(messageId, data.reactorType, data.reactorId, data.reaction);

      return formatResponse({ threadId, messageId, removed: true });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to remove reaction' });
    }
  }

  // ============================================================================
  // CEO AGENT OPERATIONS
  // ============================================================================

  /**
   * Request CEO response for a thread
   * @param {string} threadId - Thread ID
   * @returns {Promise<Object>} CEO response
   */
  async requestCeoResponse(threadId) {
    try {
      if (!threadId) {
        return {
          success: false,
          error: 'Thread ID is required',
          code: 'VALIDATION_ERROR'
        };
      }

      const service = this._getService();
      const message = await service.requestCeoResponse(threadId);

      return formatResponse(message, { ceoResponse: true });
    } catch (error) {
      return handleError(error, { defaultMessage: 'Failed to get CEO response' });
    }
  }

  // ============================================================================
  // HTTP HANDLER
  // ============================================================================

  /**
   * Handle HTTP requests
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @returns {Promise<boolean>} Whether request was handled
   */
  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method;

    // Parse request body for POST/PUT/PATCH
    let body = {};
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      body = await this._readJsonBody(req);
    }

    const queryParams = Object.fromEntries(url.searchParams);

    // === THREAD ROUTES ===

    // POST /api/chat/threads - Create thread
    if (pathname === '/api/chat/threads' && method === 'POST') {
      const result = await this.createThread(body);
      this._sendJson(res, result.success ? 201 : 400, result);
      return true;
    }

    // GET /api/chat/threads - List threads
    if (pathname === '/api/chat/threads' && method === 'GET') {
      const result = await this.listThreads(queryParams);
      this._sendJson(res, result.success ? 200 : 500, result);
      return true;
    }

    // GET /api/chat/threads/:id - Get thread
    const threadGetMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)$/);
    if (threadGetMatch && method === 'GET') {
      const id = decodeURIComponent(threadGetMatch[1]);
      const result = await this.getThread(id);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // PUT /api/chat/threads/:id - Update thread
    const threadUpdateMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)$/);
    if (threadUpdateMatch && method === 'PUT') {
      const id = decodeURIComponent(threadUpdateMatch[1]);
      const result = await this.updateThread(id, body);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // DELETE /api/chat/threads/:id - Delete thread
    const threadDeleteMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)$/);
    if (threadDeleteMatch && method === 'DELETE') {
      const id = decodeURIComponent(threadDeleteMatch[1]);
      const result = await this.deleteThread(id);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // POST /api/chat/threads/:id/resolve - Resolve thread
    const threadResolveMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/resolve$/);
    if (threadResolveMatch && method === 'POST') {
      const id = decodeURIComponent(threadResolveMatch[1]);
      const result = await this.resolveThread(id, body);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // POST /api/chat/threads/:id/close - Close thread
    const threadCloseMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/close$/);
    if (threadCloseMatch && method === 'POST') {
      const id = decodeURIComponent(threadCloseMatch[1]);
      const result = await this.closeThread(id);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // POST /api/chat/threads/:id/messages - Add message
    const threadMessagesMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/messages$/);
    if (threadMessagesMatch && method === 'POST') {
      const threadId = decodeURIComponent(threadMessagesMatch[1]);
      const result = await this.addMessage(threadId, body);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
        : 201;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // GET /api/chat/threads/:id/messages - Get messages
    if (threadMessagesMatch && method === 'GET') {
      const threadId = decodeURIComponent(threadMessagesMatch[1]);
      const result = await this.getMessages(threadId, queryParams);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // GET /api/chat/threads/:id/messages/threaded - Get threaded messages
    const threadedMessagesMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/messages\/threaded$/);
    if (threadedMessagesMatch && method === 'GET') {
      const threadId = decodeURIComponent(threadedMessagesMatch[1]);
      const result = await this.getThreadedMessages(threadId);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // POST /api/chat/threads/:id/read - Mark as read
    const threadReadMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/read$/);
    if (threadReadMatch && method === 'POST') {
      const threadId = decodeURIComponent(threadReadMatch[1]);
      const result = await this.markAsRead(threadId, body);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // POST /api/chat/threads/:id/ceo-response - Request CEO response
    const threadCeoMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)\/ceo-response$/);
    if (threadCeoMatch && method === 'POST') {
      const threadId = decodeURIComponent(threadCeoMatch[1]);
      const result = await this.requestCeoResponse(threadId);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // === MESSAGE ROUTES ===

    // PUT /api/chat/messages/:id - Update message
    const messageUpdateMatch = pathname.match(/^\/api\/chat\/messages\/([^/]+)$/);
    if (messageUpdateMatch && method === 'PUT') {
      const messageId = decodeURIComponent(messageUpdateMatch[1]);
      // Thread ID can be passed in body or we look it up
      const threadId = body.threadId;
      const result = await this.updateMessage(threadId, messageId, body);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // DELETE /api/chat/messages/:id - Delete message
    const messageDeleteMatch = pathname.match(/^\/api\/chat\/messages\/([^/]+)$/);
    if (messageDeleteMatch && method === 'DELETE') {
      const messageId = decodeURIComponent(messageDeleteMatch[1]);
      const threadId = body.threadId || queryParams.threadId;
      const result = await this.deleteMessage(threadId, messageId, body.deletedBy);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // POST /api/chat/messages/:id/reactions - Add reaction
    const messageReactionsMatch = pathname.match(/^\/api\/chat\/messages\/([^/]+)\/reactions$/);
    if (messageReactionsMatch && method === 'POST') {
      const messageId = decodeURIComponent(messageReactionsMatch[1]);
      const threadId = body.threadId || queryParams.threadId;
      const result = await this.addReaction(threadId, messageId, body);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
        : 201;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // DELETE /api/chat/messages/:id/reactions - Remove reaction
    if (messageReactionsMatch && method === 'DELETE') {
      const messageId = decodeURIComponent(messageReactionsMatch[1]);
      const threadId = body.threadId || queryParams.threadId;
      const result = await this.removeReaction(threadId, messageId, body);
      const statusCode = !result.success 
        ? (result.code === 'NOT_FOUND' ? 404 : 500) 
        : 200;
      this._sendJson(res, statusCode, result);
      return true;
    }

    // === UNREAD COUNT ROUTE ===

    // GET /api/chat/unread - Get unread count
    if (pathname === '/api/chat/unread' && method === 'GET') {
      const result = await this.getUnreadCount(queryParams.userId, queryParams.companyId);
      const statusCode = !result.success 
        ? (result.code === 'VALIDATION_ERROR' ? 400 : 500) 
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
 * Create ChatController instance
 * @param {Object} options
 * @returns {ChatController}
 */
export function createChatController(options = {}) {
  return new ChatController(options);
}

export default ChatController;
