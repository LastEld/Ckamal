/**
 * @fileoverview CEO Chat Service - Business logic for CEO Chat system
 * @module domains/chat/chat-service
 * 
 * Provides:
 * - Threaded conversation management
 * - CEO agent integration
 * - Message threading and replies
 * - Integration with approvals and issues
 * - Real-time event emission
 * 
 * Inspired by Paperclip's chat patterns with CEO agent capabilities
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

// ============================================================================
// CONSTANTS
// ============================================================================

export const ThreadKind = {
  TASK: 'task',
  STRATEGY: 'strategy',
  QUESTION: 'question',
  DECISION: 'decision'
};

export const ThreadStatus = {
  ACTIVE: 'active',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  ARCHIVED: 'archived'
};

export const MessageAuthorType = {
  USER: 'user',
  AGENT: 'agent',
  SYSTEM: 'system',
  CEO: 'ceo'
};

export const Priority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent'
};

// ============================================================================
// ERRORS
// ============================================================================

export class ChatError extends Error {
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.metadata = metadata;
    this.statusCode = this.#getStatusCode(code);
  }

  #getStatusCode(code) {
    const codes = {
      'THREAD_NOT_FOUND': 404,
      'MESSAGE_NOT_FOUND': 404,
      'INVALID_KIND': 400,
      'INVALID_STATUS': 400,
      'PERMISSION_DENIED': 403,
      'VALIDATION_ERROR': 400,
      'ALREADY_RESOLVED': 409
    };
    return codes[code] || 500;
  }
}

// ============================================================================
// CHAT SERVICE
// ============================================================================

/**
 * Chat Service - Manages CEO Chat functionality
 * @extends EventEmitter
 */
export class ChatService extends EventEmitter {
  #db;
  #config;
  #ceoAgent;

  /**
   * Create ChatService instance
   * @param {Object} options
   * @param {Object} options.db - Database instance
   * @param {Object} [options.ceoAgent] - CEO agent instance for responses
   * @param {Object} [options.config] - Configuration
   */
  constructor(options = {}) {
    super();
    
    if (!options?.db) {
      throw new ChatError('CONFIG_ERROR', 'Database instance required');
    }

    this.#db = options.db;
    this.#ceoAgent = options.ceoAgent || null;
    this.#config = {
      maxMessageLength: options.maxMessageLength || 10000,
      maxThreadTitleLength: options.maxThreadTitleLength || 200,
      autoCeoResponse: options.autoCeoResponse !== false,
      ceoResponseDelay: options.ceoResponseDelay || 1000,
      ...options
    };
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
    this.#validateThreadData(data);

    const id = randomUUID();
    const now = new Date().toISOString();

    const thread = {
      id,
      company_id: data.companyId,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      kind: data.kind || ThreadKind.QUESTION,
      status: ThreadStatus.ACTIVE,
      priority: data.priority || Priority.NORMAL,
      issue_id: data.issueId || null,
      approval_id: data.approvalId || null,
      task_id: data.taskId || null,
      created_by_type: data.createdByType || MessageAuthorType.USER,
      created_by_id: data.createdById,
      assigned_to_type: data.assignedToType || null,
      assigned_to_id: data.assignedToId || null,
      message_count: 0,
      unread_count: 0,
      created_at: now,
      updated_at: now
    };

    this.#db.prepare(`
      INSERT INTO chat_threads (
        id, company_id, title, description, kind, status, priority,
        issue_id, approval_id, task_id,
        created_by_type, created_by_id, assigned_to_type, assigned_to_id,
        message_count, unread_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      thread.id, thread.company_id, thread.title, thread.description,
      thread.kind, thread.status, thread.priority,
      thread.issue_id, thread.approval_id, thread.task_id,
      thread.created_by_type, thread.created_by_id,
      thread.assigned_to_type, thread.assigned_to_id,
      thread.message_count, thread.unread_count,
      thread.created_at, thread.updated_at
    );

    // Add creator as participant
    await this.addParticipant(id, {
      type: data.createdByType || MessageAuthorType.USER,
      id: data.createdById,
      role: 'owner'
    });

    // Add CEO agent as participant
    await this.addParticipant(id, {
      type: MessageAuthorType.CEO,
      id: 'ceo-agent',
      role: 'member'
    });

    this.emit('threadCreated', { thread });

    // Trigger CEO welcome message if auto-response enabled
    if (this.#config.autoCeoResponse && this.#ceoAgent) {
      setTimeout(() => {
        this.#generateCeoWelcome(thread);
      }, this.#config.ceoResponseDelay);
    }

    return this.getThread(id);
  }

  /**
   * Get thread by ID
   * @param {string} id - Thread ID
   * @returns {Object|null} Thread data
   */
  getThread(id) {
    const thread = this.#db.prepare(`
      SELECT t.*,
        (SELECT json_group_array(json_object(
          'type', p.participant_type,
          'id', p.participant_id,
          'role', p.role
        )) FROM chat_participants p 
        WHERE p.thread_id = t.id AND p.left_at IS NULL) as participants
      FROM chat_threads t
      WHERE t.id = ?
    `).get(id);

    if (!thread) return null;

    return this.#parseThread(thread);
  }

  /**
   * List threads with filters
   * @param {Object} filters - Query filters
   * @returns {Object[]} Matching threads
   */
  listThreads(filters = {}) {
    const {
      companyId,
      status,
      kind,
      priority,
      assignedToType,
      assignedToId,
      participantType,
      participantId,
      limit = 50,
      offset = 0
    } = filters;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (companyId) {
      whereClause += ' AND t.company_id = ?';
      params.push(companyId);
    }

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }

    if (kind) {
      whereClause += ' AND t.kind = ?';
      params.push(kind);
    }

    if (priority) {
      whereClause += ' AND t.priority = ?';
      params.push(priority);
    }

    if (assignedToType && assignedToId) {
      whereClause += ' AND t.assigned_to_type = ? AND t.assigned_to_id = ?';
      params.push(assignedToType, assignedToId);
    }

    if (participantType && participantId) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM chat_participants p 
        WHERE p.thread_id = t.id 
        AND p.participant_type = ? 
        AND p.participant_id = ?
        AND p.left_at IS NULL
      )`;
      params.push(participantType, participantId);
    }

    const threads = this.#db.prepare(`
      SELECT t.*,
        (SELECT json_group_array(json_object(
          'type', p.participant_type,
          'id', p.participant_id,
          'role', p.role
        )) FROM chat_participants p 
        WHERE p.thread_id = t.id AND p.left_at IS NULL) as participants
      FROM chat_threads t
      ${whereClause}
      ORDER BY t.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return threads.map(t => this.#parseThread(t));
  }

  /**
   * Update thread
   * @param {string} id - Thread ID
   * @param {Object} updates - Update data
   * @returns {Object} Updated thread
   */
  async updateThread(id, updates) {
    const thread = this.getThread(id);
    if (!thread) {
      throw new ChatError('THREAD_NOT_FOUND', `Thread not found: ${id}`);
    }

    const allowedUpdates = {};

    if (updates.title !== undefined) {
      if (!updates.title.trim()) throw new ChatError('VALIDATION_ERROR', 'Title cannot be empty');
      allowedUpdates.title = updates.title.trim();
    }

    if (updates.description !== undefined) {
      allowedUpdates.description = updates.description?.trim() || null;
    }

    if (updates.status !== undefined) {
      if (!Object.values(ThreadStatus).includes(updates.status)) {
        throw new ChatError('INVALID_STATUS', `Invalid status: ${updates.status}`);
      }
      allowedUpdates.status = updates.status;
      
      if (updates.status === ThreadStatus.RESOLVED) {
        allowedUpdates.resolved_at = new Date().toISOString();
      } else if (updates.status === ThreadStatus.CLOSED) {
        allowedUpdates.closed_at = new Date().toISOString();
      }
    }

    if (updates.priority !== undefined) {
      allowedUpdates.priority = updates.priority;
    }

    if (updates.assignedToType !== undefined) {
      allowedUpdates.assigned_to_type = updates.assignedToType;
    }

    if (updates.assignedToId !== undefined) {
      allowedUpdates.assigned_to_id = updates.assignedToId;
    }

    const setClause = Object.keys(allowedUpdates)
      .map(key => `${key} = ?`)
      .join(', ');

    if (setClause) {
      this.#db.prepare(`
        UPDATE chat_threads SET ${setClause}, updated_at = ? WHERE id = ?
      `).run(...Object.values(allowedUpdates), new Date().toISOString(), id);
    }

    const updated = this.getThread(id);
    this.emit('threadUpdated', { thread: updated });
    return updated;
  }

  /**
   * Resolve a thread
   * @param {string} id - Thread ID
   * @param {Object} options - Resolution options
   * @returns {Object} Resolved thread
   */
  async resolveThread(id, options = {}) {
    const thread = this.getThread(id);
    if (!thread) {
      throw new ChatError('THREAD_NOT_FOUND', `Thread not found: ${id}`);
    }

    if (thread.status === ThreadStatus.RESOLVED) {
      throw new ChatError('ALREADY_RESOLVED', 'Thread is already resolved');
    }

    const now = new Date().toISOString();

    this.#db.prepare(`
      UPDATE chat_threads 
      SET status = ?, resolved_at = ?, updated_at = ? 
      WHERE id = ?
    `).run(ThreadStatus.RESOLVED, now, now, id);

    // Add system message
    await this.addMessage(id, {
      content: options.resolutionMessage || `Thread resolved${options.resolvedBy ? ` by ${options.resolvedBy}` : ''}`,
      authorType: MessageAuthorType.SYSTEM,
      authorId: 'system',
      isSystem: true
    });

    const updated = this.getThread(id);
    this.emit('threadResolved', { 
      thread: updated, 
      resolvedBy: options.resolvedBy,
      resolution: options.resolution 
    });

    return updated;
  }

  // ============================================================================
  // MESSAGE OPERATIONS
  // ============================================================================

  /**
   * Add message to thread
   * @param {string} threadId - Thread ID
   * @param {Object} data - Message data
   * @returns {Object} Created message
   */
  async addMessage(threadId, data) {
    const thread = this.getThread(threadId);
    if (!thread) {
      throw new ChatError('THREAD_NOT_FOUND', `Thread not found: ${threadId}`);
    }

    if (thread.status === ThreadStatus.CLOSED || thread.status === ThreadStatus.ARCHIVED) {
      throw new ChatError('INVALID_STATUS', 'Cannot add messages to closed or archived threads');
    }

    this.#validateMessageData(data);

    const id = randomUUID();
    const now = new Date().toISOString();

    // Handle threading
    let threadRootId = data.threadRootId || null;
    if (data.parentId) {
      const parent = this.#db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(data.parentId);
      if (parent) {
        threadRootId = parent.thread_root_id || parent.id;
      }
    }

    const message = {
      id,
      thread_id: threadId,
      company_id: thread.companyId,
      content: data.content.trim(),
      content_type: data.contentType || 'text',
      author_type: data.authorType || MessageAuthorType.USER,
      author_id: data.authorId,
      author_name: data.authorName || null,
      parent_id: data.parentId || null,
      thread_root_id: threadRootId,
      is_edited: false,
      is_deleted: false,
      is_system: data.isSystem || false,
      action_type: data.actionType || null,
      action_data: data.actionData ? JSON.stringify(data.actionData) : null,
      action_status: data.actionStatus || null,
      ceo_context: data.ceoContext ? JSON.stringify(data.ceoContext) : null,
      ceo_suggestions: data.ceoSuggestions ? JSON.stringify(data.ceoSuggestions) : null,
      created_at: now,
      updated_at: now
    };

    this.#db.prepare(`
      INSERT INTO chat_messages (
        id, thread_id, company_id, content, content_type,
        author_type, author_id, author_name,
        parent_id, thread_root_id,
        is_edited, is_deleted, is_system,
        action_type, action_data, action_status,
        ceo_context, ceo_suggestions,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.id, message.thread_id, message.company_id,
      message.content, message.content_type,
      message.author_type, message.author_id, message.author_name,
      message.parent_id, message.thread_root_id,
      message.is_edited, message.is_deleted, message.is_system,
      message.action_type, message.action_data, message.action_status,
      message.ceo_context, message.ceo_suggestions,
      message.created_at, message.updated_at
    );

    // Update thread message count and timestamp
    this.#db.prepare(`
      UPDATE chat_threads 
      SET message_count = message_count + 1, updated_at = ? 
      WHERE id = ?
    `).run(now, threadId);

    // Update read states for other participants
    this.#incrementUnreadForOthers(threadId, id, data.authorId);

    const created = this.getMessage(id);
    this.emit('messageCreated', { message: created, threadId });

    // Trigger CEO response if message is from user and auto-response enabled
    if (this.#config.autoCeoResponse && 
        this.#ceoAgent && 
        data.authorType !== MessageAuthorType.CEO &&
        data.authorType !== MessageAuthorType.SYSTEM) {
      setTimeout(() => {
        this.#generateCeoResponse(thread, created);
      }, this.#config.ceoResponseDelay);
    }

    return created;
  }

  /**
   * Get message by ID
   * @param {string} id - Message ID
   * @returns {Object|null} Message data
   */
  getMessage(id) {
    const message = this.#db.prepare(`
      SELECT m.*,
        (SELECT json_group_array(json_object(
          'reactorType', r.reactor_type,
          'reactorId', r.reactor_id,
          'reaction', r.reaction
        )) FROM chat_reactions r WHERE r.message_id = m.id) as reactions,
        (SELECT json_group_array(json_object(
          'id', a.id,
          'fileName', a.file_name,
          'fileType', a.file_type,
          'fileSize', a.file_size,
          'fileUrl', a.file_url
        )) FROM chat_attachments a WHERE a.message_id = m.id) as attachments
      FROM chat_messages m
      WHERE m.id = ?
    `).get(id);

    if (!message) return null;

    return this.#parseMessage(message);
  }

  /**
   * Get messages for a thread
   * @param {string} threadId - Thread ID
   * @param {Object} options - Query options
   * @returns {Object[]} Messages
   */
  getMessages(threadId, options = {}) {
    const { 
      limit = 100, 
      offset = 0, 
      includeDeleted = false,
      threadRootId = null
    } = options;

    let whereClause = 'WHERE m.thread_id = ?';
    const params = [threadId];

    if (!includeDeleted) {
      whereClause += ' AND m.is_deleted = 0';
    }

    if (threadRootId) {
      whereClause += ' AND (m.thread_root_id = ? OR m.id = ?)';
      params.push(threadRootId, threadRootId);
    }

    const messages = this.#db.prepare(`
      SELECT m.*,
        (SELECT json_group_array(json_object(
          'reactorType', r.reactor_type,
          'reactorId', r.reactor_id,
          'reaction', r.reaction
        )) FROM chat_reactions r WHERE r.message_id = m.id) as reactions,
        (SELECT json_group_array(json_object(
          'id', a.id,
          'fileName', a.file_name,
          'fileType', a.file_type,
          'fileSize', a.file_size,
          'fileUrl', a.file_url
        )) FROM chat_attachments a WHERE a.message_id = m.id) as attachments
      FROM chat_messages m
      ${whereClause}
      ORDER BY m.created_at ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return messages.map(m => this.#parseMessage(m));
  }

  /**
   * Get threaded messages (with replies)
   * @param {string} threadId - Thread ID
   * @returns {Object[]} Threaded messages
   */
  getThreadedMessages(threadId) {
    const messages = this.getMessages(threadId, { limit: 1000 });
    
    // Group by thread root
    const roots = [];
    const replies = new Map();

    for (const msg of messages) {
      if (!msg.parentId) {
        roots.push({ ...msg, replies: [] });
      } else {
        if (!replies.has(msg.threadRootId)) {
          replies.set(msg.threadRootId, []);
        }
        replies.get(msg.threadRootId).push(msg);
      }
    }

    // Attach replies to roots
    for (const root of roots) {
      if (replies.has(root.id)) {
        root.replies = replies.get(root.id).sort((a, b) => 
          new Date(a.createdAt) - new Date(b.createdAt)
        );
      }
    }

    return roots;
  }

  /**
   * Update message
   * @param {string} id - Message ID
   * @param {Object} updates - Update data
   * @returns {Object} Updated message
   */
  async updateMessage(id, updates) {
    const message = this.getMessage(id);
    if (!message) {
      throw new ChatError('MESSAGE_NOT_FOUND', `Message not found: ${id}`);
    }

    if (updates.content !== undefined) {
      if (!updates.content.trim()) {
        throw new ChatError('VALIDATION_ERROR', 'Content cannot be empty');
      }

      this.#db.prepare(`
        UPDATE chat_messages 
        SET content = ?, is_edited = 1, updated_at = ? 
        WHERE id = ?
      `).run(updates.content.trim(), new Date().toISOString(), id);
    }

    const updated = this.getMessage(id);
    this.emit('messageUpdated', { message: updated });
    return updated;
  }

  /**
   * Delete message (soft delete)
   * @param {string} id - Message ID
   * @param {string} deletedBy - User ID
   * @returns {boolean} Success
   */
  async deleteMessage(id, deletedBy) {
    const message = this.getMessage(id);
    if (!message) {
      throw new ChatError('MESSAGE_NOT_FOUND', `Message not found: ${id}`);
    }

    this.#db.prepare(`
      UPDATE chat_messages 
      SET is_deleted = 1, deleted_at = ? 
      WHERE id = ?
    `).run(new Date().toISOString(), id);

    this.emit('messageDeleted', { messageId: id, threadId: message.threadId, deletedBy });
    return true;
  }

  // ============================================================================
  // PARTICIPANT OPERATIONS
  // ============================================================================

  /**
   * Add participant to thread
   * @param {string} threadId - Thread ID
   * @param {Object} participant - Participant data
   * @returns {Object} Participant record
   */
  async addParticipant(threadId, participant) {
    const existing = this.#db.prepare(`
      SELECT * FROM chat_participants 
      WHERE thread_id = ? AND participant_type = ? AND participant_id = ?
    `).get(threadId, participant.type, participant.id);

    if (existing) {
      // Re-join if previously left
      if (existing.left_at) {
        this.#db.prepare(`
          UPDATE chat_participants 
          SET left_at = NULL, joined_at = ? 
          WHERE id = ?
        `).run(new Date().toISOString(), existing.id);
      }
      return existing;
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    this.#db.prepare(`
      INSERT INTO chat_participants (
        id, thread_id, participant_type, participant_id, role, joined_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, threadId, participant.type, participant.id, participant.role || 'member', now);

    return { id, threadId, ...participant, joinedAt: now };
  }

  /**
   * Remove participant from thread
   * @param {string} threadId - Thread ID
   * @param {string} type - Participant type
   * @param {string} id - Participant ID
   * @returns {boolean} Success
   */
  async removeParticipant(threadId, type, id) {
    this.#db.prepare(`
      UPDATE chat_participants 
      SET left_at = ? 
      WHERE thread_id = ? AND participant_type = ? AND participant_id = ?
    `).run(new Date().toISOString(), threadId, type, id);

    return true;
  }

  // ============================================================================
  // READ STATE OPERATIONS
  // ============================================================================

  /**
   * Mark thread as read for user
   * @param {string} threadId - Thread ID
   * @param {string} userId - User ID
   * @param {string} [lastMessageId] - Last read message ID
   * @returns {Object} Read state
   */
  async markAsRead(threadId, userId, lastMessageId = null) {
    const now = new Date().toISOString();

    // Get latest message ID if not provided
    if (!lastMessageId) {
      const latest = this.#db.prepare(`
        SELECT id FROM chat_messages 
        WHERE thread_id = ? AND is_deleted = 0 
        ORDER BY created_at DESC LIMIT 1
      `).get(threadId);
      lastMessageId = latest?.id || null;
    }

    this.#db.prepare(`
      INSERT INTO chat_read_states (id, thread_id, user_id, last_read_at, last_read_message_id, unread_count)
      VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(thread_id, user_id) DO UPDATE SET
        last_read_at = excluded.last_read_at,
        last_read_message_id = excluded.last_read_message_id,
        unread_count = 0,
        updated_at = ?
    `).run(randomUUID(), threadId, userId, now, lastMessageId, now);

    return { threadId, userId, lastReadAt: now, lastMessageId, unreadCount: 0 };
  }

  /**
   * Get unread count for user
   * @param {string} userId - User ID
   * @param {string} [companyId] - Company ID
   * @returns {number} Unread count
   */
  getUnreadCount(userId, companyId = null) {
    let whereClause = 'WHERE user_id = ?';
    const params = [userId];

    if (companyId) {
      whereClause += ' AND thread_id IN (SELECT id FROM chat_threads WHERE company_id = ?)';
      params.push(companyId);
    }

    const result = this.#db.prepare(`
      SELECT COALESCE(SUM(unread_count), 0) as total
      FROM chat_read_states
      ${whereClause}
    `).get(...params);

    return result?.total || 0;
  }

  // ============================================================================
  // REACTION OPERATIONS
  // ============================================================================

  /**
   * Add reaction to message
   * @param {string} messageId - Message ID
   * @param {Object} data - Reaction data
   * @returns {Object} Reaction
   */
  async addReaction(messageId, data) {
    const message = this.getMessage(messageId);
    if (!message) {
      throw new ChatError('MESSAGE_NOT_FOUND', `Message not found: ${messageId}`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    this.#db.prepare(`
      INSERT OR IGNORE INTO chat_reactions (
        id, message_id, thread_id, reactor_type, reactor_id, reaction, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, messageId, message.threadId, data.reactorType, data.reactorId, data.reaction, now);

    return { id, messageId, ...data, createdAt: now };
  }

  /**
   * Remove reaction from message
   * @param {string} messageId - Message ID
   * @param {string} reactorType - Reactor type
   * @param {string} reactorId - Reactor ID
   * @param {string} reaction - Reaction emoji
   * @returns {boolean} Success
   */
  async removeReaction(messageId, reactorType, reactorId, reaction) {
    this.#db.prepare(`
      DELETE FROM chat_reactions 
      WHERE message_id = ? AND reactor_type = ? AND reactor_id = ? AND reaction = ?
    `).run(messageId, reactorType, reactorId, reaction);

    return true;
  }

  // ============================================================================
  // CEO AGENT INTEGRATION
  // ============================================================================

  /**
   * Set CEO agent instance
   * @param {Object} ceoAgent - CEO agent instance
   */
  setCeoAgent(ceoAgent) {
    this.#ceoAgent = ceoAgent;
  }

  /**
   * Request CEO response for a thread
   * @param {string} threadId - Thread ID
   * @returns {Promise<Object>} CEO response message
   */
  async requestCeoResponse(threadId) {
    const thread = this.getThread(threadId);
    if (!thread) {
      throw new ChatError('THREAD_NOT_FOUND', `Thread not found: ${threadId}`);
    }

    const messages = this.getMessages(threadId, { limit: 50 });
    return this.#generateCeoResponse(thread, messages[messages.length - 1]);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  #validateThreadData(data) {
    if (!data.title?.trim()) {
      throw new ChatError('VALIDATION_ERROR', 'Thread title is required');
    }

    if (data.title.length > this.#config.maxThreadTitleLength) {
      throw new ChatError('VALIDATION_ERROR', `Title exceeds maximum length of ${this.#config.maxThreadTitleLength}`);
    }

    if (data.kind && !Object.values(ThreadKind).includes(data.kind)) {
      throw new ChatError('INVALID_KIND', `Invalid thread kind: ${data.kind}`);
    }

    if (!data.companyId) {
      throw new ChatError('VALIDATION_ERROR', 'Company ID is required');
    }

    if (!data.createdById) {
      throw new ChatError('VALIDATION_ERROR', 'Created by ID is required');
    }
  }

  #validateMessageData(data) {
    if (!data.content?.trim()) {
      throw new ChatError('VALIDATION_ERROR', 'Message content is required');
    }

    if (data.content.length > this.#config.maxMessageLength) {
      throw new ChatError('VALIDATION_ERROR', `Message exceeds maximum length of ${this.#config.maxMessageLength}`);
    }

    if (!data.authorId) {
      throw new ChatError('VALIDATION_ERROR', 'Author ID is required');
    }
  }

  #parseThread(row) {
    return {
      id: row.id,
      companyId: row.company_id,
      title: row.title,
      description: row.description,
      kind: row.kind,
      status: row.status,
      priority: row.priority,
      issueId: row.issue_id,
      approvalId: row.approval_id,
      taskId: row.task_id,
      createdByType: row.created_by_type,
      createdById: row.created_by_id,
      assignedToType: row.assigned_to_type,
      assignedToId: row.assigned_to_id,
      messageCount: row.message_count,
      unreadCount: row.unread_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
      closedAt: row.closed_at,
      participants: row.participants ? JSON.parse(row.participants) : []
    };
  }

  #parseMessage(row) {
    return {
      id: row.id,
      threadId: row.thread_id,
      companyId: row.company_id,
      content: row.content,
      contentType: row.content_type,
      authorType: row.author_type,
      authorId: row.author_id,
      authorName: row.author_name,
      parentId: row.parent_id,
      threadRootId: row.thread_root_id,
      isEdited: !!row.is_edited,
      isDeleted: !!row.is_deleted,
      isSystem: !!row.is_system,
      actionType: row.action_type,
      actionData: row.action_data ? JSON.parse(row.action_data) : null,
      actionStatus: row.action_status,
      ceoContext: row.ceo_context ? JSON.parse(row.ceo_context) : null,
      ceoSuggestions: row.ceo_suggestions ? JSON.parse(row.ceo_suggestions) : null,
      reactions: row.reactions ? JSON.parse(row.reactions) : [],
      attachments: row.attachments ? JSON.parse(row.attachments) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  #incrementUnreadForOthers(threadId, messageId, senderId) {
    // Get all participants except sender
    const participants = this.#db.prepare(`
      SELECT participant_type, participant_id FROM chat_participants
      WHERE thread_id = ? AND left_at IS NULL
      AND NOT (participant_type = 'user' AND participant_id = ?)
    `).all(threadId, senderId);

    const now = new Date().toISOString();

    for (const p of participants) {
      if (p.participant_type === 'user') {
        this.#db.prepare(`
          INSERT INTO chat_read_states (id, thread_id, user_id, last_read_at, unread_count)
          VALUES (?, ?, ?, ?, 1)
          ON CONFLICT(thread_id, user_id) DO UPDATE SET
            unread_count = unread_count + 1,
            updated_at = ?
        `).run(randomUUID(), threadId, p.participant_id, now, now);
      }
    }
  }

  async #generateCeoWelcome(thread) {
    const welcomes = {
      [ThreadKind.TASK]: `I've reviewed this task thread. Let me know how I can help break this down, prioritize, or coordinate with the team.`,
      [ThreadKind.STRATEGY]: `I'm here to help with strategic planning. What aspects would you like to explore—roadmapping, risk assessment, or resource allocation?`,
      [ThreadKind.QUESTION]: `I've noted your question. I'll research this and provide a comprehensive response shortly.`,
      [ThreadKind.DECISION]: `I understand you need to make a decision. I'll analyze the options and provide my recommendation based on available data.`
    };

    const content = welcomes[thread.kind] || `I'm here to assist. How can I help with this?`;

    await this.addMessage(thread.id, {
      content,
      authorType: MessageAuthorType.CEO,
      authorId: 'ceo-agent',
      authorName: 'CEO Agent',
      isSystem: false
    });
  }

  async #generateCeoResponse(thread, lastMessage) {
    if (!this.#ceoAgent) return;

    try {
      // Get conversation context
      const messages = this.getMessages(thread.id, { limit: 20 });
      const context = {
        threadKind: thread.kind,
        threadTitle: thread.title,
        recentMessages: messages.map(m => ({
          author: m.authorType,
          content: m.content
        })),
        lastMessage: {
          content: lastMessage.content,
          author: lastMessage.authorType
        }
      };

      // Generate CEO response
      const response = await this.#ceoAgent.generateResponse(context);

      // Add CEO message
      const ceoMessage = await this.addMessage(thread.id, {
        content: response.content,
        authorType: MessageAuthorType.CEO,
        authorId: 'ceo-agent',
        authorName: 'CEO Agent',
        ceoContext: response.context,
        ceoSuggestions: response.suggestions
      });

      // If response includes an action, create it
      if (response.action) {
        await this.#createActionFromCeo(thread.id, ceoMessage.id, response.action);
      }

      return ceoMessage;
    } catch (error) {
      console.error('CEO response generation failed:', error);
      
      // Add fallback message
      await this.addMessage(thread.id, {
        content: `I'm processing your message. Let me get back to you with a detailed response.`,
        authorType: MessageAuthorType.CEO,
        authorId: 'ceo-agent',
        authorName: 'CEO Agent'
      });
    }
  }

  async #createActionFromCeo(threadId, messageId, action) {
    // Update message with action data
    this.#db.prepare(`
      UPDATE chat_messages 
      SET action_type = ?, action_data = ?, action_status = 'pending'
      WHERE id = ?
    `).run(action.type, JSON.stringify(action.data), messageId);

    // Emit action created event
    this.emit('ceoActionCreated', {
      threadId,
      messageId,
      action
    });
  }
}

/**
 * Create ChatService instance
 * @param {Object} options
 * @returns {ChatService}
 */
export function createChatService(options = {}) {
  return new ChatService(options);
}

export default ChatService;
