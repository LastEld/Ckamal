/**
 * @fileoverview Conversation Management Module for CogniMesh v5.0
 * Handles conversation branching, merging, and lifecycle management.
 * @module claude/conversation
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} Message
 * @property {string} id - Message unique identifier
 * @property {'user'|'assistant'|'system'} role - Message role
 * @property {string} content - Message content
 * @property {number} timestamp - Creation timestamp
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} Conversation
 * @property {string} id - Conversation unique identifier
 * @property {string} [parentId] - Parent conversation ID for forks
 * @property {string[]} branchIds - Child branch IDs
 * @property {Message[]} messages - Conversation messages
 * @property {Object} metadata - Conversation metadata
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 * @property {string} status - Conversation status
 */

/**
 * @typedef {Object} ExportOptions
 * @property {'json'|'markdown'|'html'|'text'} format - Export format
 * @property {boolean} [includeMetadata=true] - Include metadata in export
 * @property {boolean} [pretty=true] - Pretty print output
 */

/**
 * ConversationManager handles conversation lifecycle including
 * forking, merging, and exporting with branch support.
 * @extends EventEmitter
 */
export class ConversationManager extends EventEmitter {
  /** @type {Map<string, Conversation>} */
  #conversations = new Map();
  
  /** @type {Set<string>} */
  #subscribers = new Set();
  
  /** @type {number} */
  #maxConversations;
  
  /** @type {number} */
  #maxMessagesPerConversation;

  /**
   * Creates a ConversationManager instance.
   * @param {Object} options - Configuration options
   * @param {number} [options.maxConversations=1000] - Maximum stored conversations
   * @param {number} [options.maxMessagesPerConversation=10000] - Max messages per conversation
   */
  constructor(options = {}) {
    super();
    this.#maxConversations = options.maxConversations || 1000;
    this.#maxMessagesPerConversation = options.maxMessagesPerConversation || 10000;
  }

  /**
   * Validates subscriber authentication.
   * @private
   * @param {string} subscriptionKey - Subscriber key
   * @throws {Error} If not authenticated
   */
  #requireAuth(subscriptionKey) {
    if (!this.#subscribers.has(subscriptionKey)) {
      throw new Error('Unauthorized: Valid subscription required');
    }
  }

  /**
   * Subscribes to the conversation manager.
   * @param {string} subscriptionKey - Unique subscriber identifier
   * @returns {boolean} Success status
   */
  subscribe(subscriptionKey) {
    if (this.#subscribers.has(subscriptionKey)) {
      return false;
    }
    this.#subscribers.add(subscriptionKey);
    this.emit('subscribed', { subscriptionKey, timestamp: Date.now() });
    return true;
  }

  /**
   * Unsubscribes from the conversation manager.
   * @param {string} subscriptionKey - Subscriber identifier
   * @returns {boolean} Success status
   */
  unsubscribe(subscriptionKey) {
    const removed = this.#subscribers.delete(subscriptionKey);
    if (removed) {
      this.emit('unsubscribed', { subscriptionKey, timestamp: Date.now() });
    }
    return removed;
  }

  /**
   * Creates a new conversation.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {Object} [options={}] - Conversation options
   * @param {string} [options.title] - Conversation title
   * @param {Object} [options.metadata={}] - Initial metadata
   * @param {Message[]} [options.messages=[]] - Initial messages
   * @returns {Conversation} Created conversation
   */
  createConversation(subscriptionKey, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    this.#enforceStorageLimits();

    const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    /** @type {Conversation} */
    const conversation = {
      id,
      parentId: null,
      branchIds: [],
      messages: options.messages || [],
      metadata: {
        title: options.title || `Conversation ${id.slice(-6)}`,
        tags: [],
        ...options.metadata
      },
      createdAt: now,
      updatedAt: now,
      status: 'active'
    };

    this.#conversations.set(id, conversation);
    this.emit('conversationCreated', { id, timestamp: now });

    return conversation;
  }

  /**
   * Forks an existing conversation creating a new branch.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} id - Source conversation ID
   * @param {Object} [options={}] - Fork options
   * @param {string} [options.upToMessageId] - Fork up to specific message
   * @returns {Conversation} Forked conversation
   * @throws {Error} If conversation not found
   */
  forkConversation(subscriptionKey, id, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    const source = this.#conversations.get(id);
    if (!source) {
      throw new Error(`Conversation not found: ${id}`);
    }

    this.#enforceStorageLimits();

    const forkId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    // Determine messages to include in fork
    let messages = [...source.messages];
    if (options.upToMessageId) {
      const upToIndex = messages.findIndex(m => m.id === options.upToMessageId);
      if (upToIndex >= 0) {
        messages = messages.slice(0, upToIndex + 1);
      }
    }

    /** @type {Conversation} */
    const fork = {
      id: forkId,
      parentId: id,
      branchIds: [],
      messages: messages.map(m => ({
        ...m,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        forkedFrom: m.id
      })),
      metadata: {
        ...source.metadata,
        title: `${source.metadata.title} (fork)`,
        forkedFrom: id,
        forkedAt: now,
        ...options.metadata
      },
      createdAt: now,
      updatedAt: now,
      status: 'active'
    };

    this.#conversations.set(forkId, fork);
    source.branchIds.push(forkId);

    this.emit('conversationForked', { 
      sourceId: id, 
      forkId, 
      messageCount: fork.messages.length,
      timestamp: now 
    });

    return fork;
  }

  /**
   * Merges multiple conversations into a single conversation.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string[]} ids - Conversation IDs to merge
   * @param {Object} [options={}] - Merge options
   * @param {string} [options.strategy='interleave'] - Merge strategy
   * @returns {Conversation} Merged conversation
   * @throws {Error} If conversations not found
   */
  mergeConversations(subscriptionKey, ids, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    if (ids.length < 2) {
      throw new Error('At least 2 conversations required for merge');
    }

    const conversations = ids.map(id => {
      const conv = this.#conversations.get(id);
      if (!conv) throw new Error(`Conversation not found: ${id}`);
      return conv;
    });

    this.#enforceStorageLimits();

    const mergeId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const strategy = options.strategy || 'interleave';

    // Merge messages based on strategy
    let mergedMessages = [];
    
    switch (strategy) {
      case 'append':
        conversations.forEach(c => mergedMessages.push(...c.messages));
        break;
      case 'interleave':
        const maxLen = Math.max(...conversations.map(c => c.messages.length));
        for (let i = 0; i < maxLen; i++) {
          conversations.forEach(c => {
            if (c.messages[i]) mergedMessages.push(c.messages[i]);
          });
        }
        break;
      case 'chronological':
        mergedMessages = conversations
          .flatMap(c => c.messages)
          .sort((a, b) => a.timestamp - b.timestamp);
        break;
      default:
        throw new Error(`Unknown merge strategy: ${strategy}`);
    }

    // Renumber message IDs
    mergedMessages = mergedMessages.map((m, idx) => ({
      ...m,
      id: `msg_${mergeId}_${idx}`,
      mergedFrom: m.id
    }));

    /** @type {Conversation} */
    const merged = {
      id: mergeId,
      parentId: null,
      branchIds: [],
      messages: mergedMessages.slice(0, this.#maxMessagesPerConversation),
      metadata: {
        title: `Merged: ${conversations.map(c => c.metadata.title).join(', ')}`,
        mergedFrom: ids,
        mergeStrategy: strategy,
        mergedAt: now,
        ...options.metadata
      },
      createdAt: now,
      updatedAt: now,
      status: 'active'
    };

    this.#conversations.set(mergeId, merged);

    this.emit('conversationsMerged', {
      sourceIds: ids,
      mergedId: mergeId,
      messageCount: merged.messages.length,
      timestamp: now
    });

    return merged;
  }

  /**
   * Gets conversation history.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} id - Conversation ID
   * @param {Object} [options={}] - History options
   * @param {number} [options.limit] - Maximum messages to return
   * @param {number} [options.offset=0] - Message offset
   * @returns {Message[]} Conversation messages
   */
  getHistory(subscriptionKey, id, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    const conversation = this.#conversations.get(id);
    if (!conversation) {
      throw new Error(`Conversation not found: ${id}`);
    }

    let messages = conversation.messages;
    const offset = options.offset || 0;
    
    if (offset > 0) {
      messages = messages.slice(offset);
    }
    
    if (options.limit) {
      messages = messages.slice(0, options.limit);
    }

    return messages;
  }

  /**
   * Adds a message to a conversation.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} id - Conversation ID
   * @param {Object} message - Message to add
   * @param {'user'|'assistant'|'system'} message.role - Message role
   * @param {string} message.content - Message content
   * @param {Object} [message.metadata] - Message metadata
   * @returns {Message} Added message
   */
  addMessage(subscriptionKey, id, message) {
    this.#requireAuth(subscriptionKey);
    
    const conversation = this.#conversations.get(id);
    if (!conversation) {
      throw new Error(`Conversation not found: ${id}`);
    }

    if (conversation.messages.length >= this.#maxMessagesPerConversation) {
      throw new Error(`Maximum message limit reached for conversation: ${id}`);
    }

    /** @type {Message} */
    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: message.role,
      content: message.content,
      timestamp: Date.now(),
      metadata: message.metadata || {}
    };

    conversation.messages.push(newMessage);
    conversation.updatedAt = Date.now();

    this.emit('messageAdded', { conversationId: id, messageId: newMessage.id });

    return newMessage;
  }

  /**
   * Gets a conversation by ID.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} id - Conversation ID
   * @returns {Conversation|undefined} Conversation or undefined
   */
  getConversation(subscriptionKey, id) {
    this.#requireAuth(subscriptionKey);
    return this.#conversations.get(id);
  }

  /**
   * Lists all conversations.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {Object} [options={}] - List options
   * @param {string} [options.status] - Filter by status
   * @param {string} [options.tag] - Filter by tag
   * @returns {Conversation[]} Conversations
   */
  listConversations(subscriptionKey, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    let conversations = Array.from(this.#conversations.values());

    if (options.status) {
      conversations = conversations.filter(c => c.status === options.status);
    }

    if (options.tag) {
      conversations = conversations.filter(c => 
        c.metadata.tags?.includes(options.tag)
      );
    }

    return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Deletes a conversation.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} id - Conversation ID
   * @returns {boolean} Success status
   */
  deleteConversation(subscriptionKey, id) {
    this.#requireAuth(subscriptionKey);
    
    const deleted = this.#conversations.delete(id);
    if (deleted) {
      this.emit('conversationDeleted', { id, timestamp: Date.now() });
    }
    return deleted;
  }

  /**
   * Exports a conversation to specified format.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} id - Conversation ID
   * @param {ExportOptions} [options={}] - Export options
   * @returns {string} Exported content
   */
  exportConversation(subscriptionKey, id, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    const conversation = this.#conversations.get(id);
    if (!conversation) {
      throw new Error(`Conversation not found: ${id}`);
    }

    const format = options.format || 'json';
    const includeMetadata = options.includeMetadata !== false;
    const pretty = options.pretty !== false;

    switch (format) {
      case 'json':
        return this.#exportAsJson(conversation, includeMetadata, pretty);
      case 'markdown':
        return this.#exportAsMarkdown(conversation, includeMetadata);
      case 'html':
        return this.#exportAsHtml(conversation, includeMetadata);
      case 'text':
        return this.#exportAsText(conversation, includeMetadata);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Gets conversation tree structure.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} [rootId] - Root conversation ID
   * @returns {Object} Tree structure
   */
  getConversationTree(subscriptionKey, rootId) {
    this.#requireAuth(subscriptionKey);
    
    if (rootId) {
      const root = this.#conversations.get(rootId);
      if (!root) throw new Error(`Conversation not found: ${rootId}`);
      return this.#buildTree(root);
    }

    // Find all root conversations
    const roots = Array.from(this.#conversations.values())
      .filter(c => !c.parentId);
    
    return {
      roots: roots.map(r => this.#buildTree(r))
    };
  }

  /**
   * Builds tree structure recursively.
   * @private
   * @param {Conversation} node - Current node
   * @returns {Object} Tree node
   */
  #buildTree(node) {
    return {
      id: node.id,
      title: node.metadata.title,
      messageCount: node.messages.length,
      createdAt: node.createdAt,
      branches: node.branchIds.map(id => {
        const child = this.#conversations.get(id);
        return child ? this.#buildTree(child) : null;
      }).filter(Boolean)
    };
  }

  /**
   * Exports as JSON.
   * @private
   */
  #exportAsJson(conversation, includeMetadata, pretty) {
    const data = includeMetadata ? conversation : {
      id: conversation.id,
      messages: conversation.messages
    };
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  }

  /**
   * Exports as Markdown.
   * @private
   */
  #exportAsMarkdown(conversation, includeMetadata) {
    const lines = [];
    
    if (includeMetadata) {
      lines.push(`# ${conversation.metadata.title}`);
      lines.push(`\n> ID: ${conversation.id}`);
      lines.push(`> Created: ${new Date(conversation.createdAt).toISOString()}`);
      if (conversation.parentId) {
        lines.push(`> Forked from: ${conversation.parentId}`);
      }
      lines.push('');
    }

    for (const msg of conversation.messages) {
      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      lines.push(`## ${role}\n`);
      lines.push(msg.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Exports as HTML.
   * @private
   */
  #exportAsHtml(conversation, includeMetadata) {
    const lines = ['<!DOCTYPE html>', '<html>', '<head>', 
      `<title>${conversation.metadata.title}</title>`,
      '<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px}.user{color:#0066cc}.assistant{color:#006600}.system{color:#666}</style>',
      '</head>', '<body>'];

    if (includeMetadata) {
      lines.push(`<h1>${this.#escapeHtml(conversation.metadata.title)}</h1>`);
      lines.push('<hr>');
    }

    for (const msg of conversation.messages) {
      lines.push(`<div class="${msg.role}">`);
      lines.push(`<strong>${msg.role.toUpperCase()}</strong>`);
      lines.push(`<p>${this.#escapeHtml(msg.content)}</p>`);
      lines.push('</div>');
    }

    lines.push('</body></html>');
    return lines.join('\n');
  }

  /**
   * Exports as plain text.
   * @private
   */
  #exportAsText(conversation, includeMetadata) {
    const lines = [];

    if (includeMetadata) {
      lines.push(`Title: ${conversation.metadata.title}`);
      lines.push(`ID: ${conversation.id}`);
      lines.push('---');
    }

    for (const msg of conversation.messages) {
      lines.push(`${msg.role.toUpperCase()}: ${msg.content}`);
    }

    return lines.join('\n');
  }

  /**
   * Escapes HTML entities.
   * @private
   */
  #escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Enforces storage limits.
   * @private
   */
  #enforceStorageLimits() {
    while (this.#conversations.size >= this.#maxConversations) {
      const oldest = Array.from(this.#conversations.values())
        .sort((a, b) => a.updatedAt - b.updatedAt)[0];
      if (oldest) {
        this.#conversations.delete(oldest.id);
        this.emit('conversationEvicted', { id: oldest.id, reason: 'storage_limit' });
      }
    }
  }

  /**
   * Gets manager statistics.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {Object} Statistics
   */
  getStats(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    
    const conversations = Array.from(this.#conversations.values());
    
    return {
      totalConversations: conversations.length,
      maxConversations: this.#maxConversations,
      totalMessages: conversations.reduce((sum, c) => sum + c.messages.length, 0),
      activeConversations: conversations.filter(c => c.status === 'active').length,
      forkedConversations: conversations.filter(c => c.parentId !== null).length,
      subscriberCount: this.#subscribers.size
    };
  }

  /**
   * Disposes the manager and clears all resources.
   */
  dispose() {
    this.#conversations.clear();
    this.#subscribers.clear();
    this.removeAllListeners();
  }
}

export default ConversationManager;
