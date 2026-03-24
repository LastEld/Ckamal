/**
 * Claude Conversation Controller
 * Conversation management operations
 * 
 * @module controllers/claude-conversation
 * @version 1.0.0
 */

import {
    validateRequest,
    formatResponse,
    formatListResponse,
    handleError,
    generateId,
    parsePagination
} from './helpers.js';

/**
 * Message roles
 * @readonly
 * @enum {string}
 */
export const MessageRole = {
    SYSTEM: 'system',
    USER: 'user',
    ASSISTANT: 'assistant',
    TOOL: 'tool'
};

/**
 * ClaudeConversationController class
 * Manages conversations and message history
 */
export class ClaudeConversationController {
    /**
     * Create a new ClaudeConversationController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.gateway] - Conversation gateway
     * @param {Object} [options.storage] - Conversation storage
     */
    constructor(options = {}) {
        this.gateway = options.gateway || null;
        this.storage = options.storage || null;
        this.name = 'ClaudeConversationController';
        this._conversations = new Map();
    }

    /**
     * Create a new conversation
     * @param {Object} [options] - Conversation options
     * @param {string} [options.title] - Conversation title
     * @param {string} [options.model='claude-3-5-sonnet-20241022'] - Model ID
     * @param {string} [options.systemPrompt] - Initial system prompt
     * @param {Object} [options.metadata] - Custom metadata
     * @returns {Promise<Object>} Created conversation
     */
    async create(options = {}) {
        try {
            const conversationId = `conv_${Date.now()}_${generateId()}`;
            
            const conversation = {
                id: conversationId,
                title: options.title || 'New Conversation',
                model: options.model || 'claude-3-5-sonnet-20241022',
                systemPrompt: options.systemPrompt,
                metadata: options.metadata || {},
                messages: [],
                archived: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (options.systemPrompt) {
                conversation.messages.push({
                    id: `msg_${Date.now()}_system`,
                    role: MessageRole.SYSTEM,
                    content: options.systemPrompt,
                    timestamp: new Date().toISOString()
                });
            }

            this._conversations.set(conversationId, conversation);

            return formatResponse(conversation, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create conversation' });
        }
    }

    /**
     * Get a conversation by ID
     * @param {string} conversationId - Conversation ID
     * @param {Object} [options] - Get options
     * @param {boolean} [options.includeMessages=true] - Include messages
     * @param {number} [options.messageLimit=100] - Max messages to include
     * @returns {Promise<Object>} Conversation data
     */
    async get(conversationId, options = {}) {
        try {
            if (!conversationId) {
                return {
                    success: false,
                    error: 'Conversation ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const conversation = this._conversations.get(conversationId);
            if (!conversation) {
                return {
                    success: false,
                    error: `Conversation not found: ${conversationId}`,
                    code: 'NOT_FOUND'
                };
            }

            const result = { ...conversation };
            
            if (options.includeMessages === false) {
                delete result.messages;
            } else {
                const limit = options.messageLimit || 100;
                result.messages = result.messages.slice(-limit);
            }

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get conversation' });
        }
    }

    /**
     * List conversations
     * @param {Object} [filters] - Filter criteria
     * @param {boolean} [filters.archived=false] - Include archived
     * @param {string} [filters.search] - Search in titles
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} List of conversations
     */
    async list(filters = {}, pagination = {}) {
        try {
            let conversations = Array.from(this._conversations.values());

            // Apply filters
            if (!filters.archived) {
                conversations = conversations.filter(c => !c.archived);
            }

            if (filters.search) {
                const search = filters.search.toLowerCase();
                conversations = conversations.filter(c => 
                    c.title.toLowerCase().includes(search)
                );
            }

            // Sort by updated date
            conversations.sort((a, b) => 
                new Date(b.updatedAt) - new Date(a.updatedAt)
            );

            const { limit, offset } = parsePagination(pagination);
            const paginated = conversations.slice(offset, offset + limit);

            // Return summaries
            const summaries = paginated.map(c => ({
                id: c.id,
                title: c.title,
                model: c.model,
                messageCount: c.messages.length,
                archived: c.archived,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            }));

            return formatListResponse(summaries, {
                total: conversations.length,
                limit,
                offset
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list conversations' });
        }
    }

    /**
     * Update conversation metadata
     * @param {string} conversationId - Conversation ID
     * @param {Object} updates - Fields to update
     * @param {string} [updates.title] - New title
     * @param {string} [updates.model] - New model
     * @param {Object} [updates.metadata] - Updated metadata
     * @returns {Promise<Object>} Updated conversation
     */
    async update(conversationId, updates) {
        try {
            if (!conversationId) {
                return {
                    success: false,
                    error: 'Conversation ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const conversation = this._conversations.get(conversationId);
            if (!conversation) {
                return {
                    success: false,
                    error: `Conversation not found: ${conversationId}`,
                    code: 'NOT_FOUND'
                };
            }

            if (updates.title) conversation.title = updates.title;
            if (updates.model) conversation.model = updates.model;
            if (updates.metadata) {
                conversation.metadata = { ...conversation.metadata, ...updates.metadata };
            }

            conversation.updatedAt = new Date().toISOString();

            return formatResponse(conversation, { updated: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to update conversation' });
        }
    }

    /**
     * Delete a conversation
     * @param {string} conversationId - Conversation ID
     * @param {Object} [options] - Delete options
     * @param {boolean} [options.confirm=false] - Confirm deletion
     * @returns {Promise<Object>} Deletion result
     */
    async delete(conversationId, options = {}) {
        try {
            if (!conversationId) {
                return {
                    success: false,
                    error: 'Conversation ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!options.confirm) {
                return {
                    success: false,
                    warning: 'Set confirm: true to permanently delete this conversation',
                    code: 'CONFIRMATION_REQUIRED'
                };
            }

            const deleted = this._conversations.delete(conversationId);

            return formatResponse({
                id: conversationId,
                deleted
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to delete conversation' });
        }
    }

    /**
     * Add a message to a conversation
     * @param {string} conversationId - Conversation ID
     * @param {Object} message - Message to add
     * @param {MessageRole} message.role - Message role
     * @param {string} message.content - Message content
     * @param {Object} [message.metadata] - Message metadata
     * @returns {Promise<Object>} Added message
     */
    async addMessage(conversationId, message) {
        try {
            const validation = validateRequest({
                required: ['role', 'content'],
                types: {
                    role: 'string',
                    content: 'string',
                    metadata: 'object'
                },
                enums: {
                    role: Object.values(MessageRole)
                }
            }, message);

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const conversation = this._conversations.get(conversationId);
            if (!conversation) {
                return {
                    success: false,
                    error: `Conversation not found: ${conversationId}`,
                    code: 'NOT_FOUND'
                };
            }

            const newMessage = {
                id: `msg_${Date.now()}_${generateId()}`,
                role: message.role,
                content: message.content,
                metadata: message.metadata || {},
                timestamp: new Date().toISOString()
            };

            conversation.messages.push(newMessage);
            conversation.updatedAt = new Date().toISOString();

            return formatResponse(newMessage, { added: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to add message' });
        }
    }

    /**
     * List messages in a conversation
     * @param {string} conversationId - Conversation ID
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} List of messages
     */
    async listMessages(conversationId, pagination = {}) {
        try {
            if (!conversationId) {
                return {
                    success: false,
                    error: 'Conversation ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const conversation = this._conversations.get(conversationId);
            if (!conversation) {
                return {
                    success: false,
                    error: `Conversation not found: ${conversationId}`,
                    code: 'NOT_FOUND'
                };
            }

            const { limit, offset } = parsePagination(pagination);
            const messages = conversation.messages.slice(offset, offset + limit);

            return formatListResponse(messages, {
                total: conversation.messages.length,
                limit,
                offset
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list messages' });
        }
    }

    /**
     * Fork a conversation at a specific message
     * @param {string} conversationId - Source conversation ID
     * @param {string} messageId - Message ID to fork at
     * @param {Object} [options] - Fork options
     * @param {string} [options.newTitle] - Title for new conversation
     * @returns {Promise<Object>} Fork result
     */
    async fork(conversationId, messageId, options = {}) {
        try {
            if (!conversationId || !messageId) {
                return {
                    success: false,
                    error: 'Conversation ID and Message ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const source = this._conversations.get(conversationId);
            if (!source) {
                return {
                    success: false,
                    error: `Conversation not found: ${conversationId}`,
                    code: 'NOT_FOUND'
                };
            }

            const messageIndex = source.messages.findIndex(m => m.id === messageId);
            if (messageIndex === -1) {
                return {
                    success: false,
                    error: `Message not found: ${messageId}`,
                    code: 'NOT_FOUND'
                };
            }

            const newId = `conv_${Date.now()}_${generateId()}`;
            const forked = {
                id: newId,
                title: options.newTitle || `${source.title} (Fork)`,
                model: source.model,
                systemPrompt: source.systemPrompt,
                metadata: { ...source.metadata, forkedFrom: conversationId, forkedAt: messageId },
                messages: source.messages.slice(0, messageIndex + 1),
                archived: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            this._conversations.set(newId, forked);

            return formatResponse({
                newConversation: forked,
                sourceConversationId: conversationId,
                forkedAtMessageId: messageId
            }, { forked: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to fork conversation' });
        }
    }

    /**
     * Merge two conversations
     * @param {string} targetId - Target conversation ID
     * @param {string} sourceId - Source conversation ID
     * @param {Object} [options] - Merge options
     * @param {boolean} [options.includeTimestamps=false] - Preserve timestamps
     * @returns {Promise<Object>} Merge result
     */
    async merge(targetId, sourceId, options = {}) {
        try {
            if (!targetId || !sourceId) {
                return {
                    success: false,
                    error: 'Target and Source conversation IDs are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const target = this._conversations.get(targetId);
            const source = this._conversations.get(sourceId);

            if (!target) {
                return {
                    success: false,
                    error: `Target conversation not found: ${targetId}`,
                    code: 'NOT_FOUND'
                };
            }

            if (!source) {
                return {
                    success: false,
                    error: `Source conversation not found: ${sourceId}`,
                    code: 'NOT_FOUND'
                };
            }

            // Merge messages
            const mergedMessages = [
                ...target.messages,
                ...source.messages.map(m => ({
                    ...m,
                    timestamp: options.includeTimestamps ? m.timestamp : new Date().toISOString()
                }))
            ];

            target.messages = mergedMessages;
            target.updatedAt = new Date().toISOString();

            return formatResponse({
                targetId,
                sourceId,
                totalMessages: target.messages.length,
                mergedMessages: source.messages.length
            }, { merged: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to merge conversations' });
        }
    }

    /**
     * Export a conversation
     * @param {string} conversationId - Conversation ID
     * @param {Object} [options] - Export options
     * @param {'json'|'markdown'} [options.format='json'] - Export format
     * @returns {Promise<Object>} Export result
     */
    async export(conversationId, options = {}) {
        try {
            if (!conversationId) {
                return {
                    success: false,
                    error: 'Conversation ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const conversation = this._conversations.get(conversationId);
            if (!conversation) {
                return {
                    success: false,
                    error: `Conversation not found: ${conversationId}`,
                    code: 'NOT_FOUND'
                };
            }

            const format = options.format || 'json';
            let content;

            if (format === 'markdown') {
                content = this._convertToMarkdown(conversation);
            } else {
                content = JSON.stringify(conversation, null, 2);
            }

            return formatResponse({
                conversationId,
                format,
                content,
                messageCount: conversation.messages.length
            }, { exported: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to export conversation' });
        }
    }

    /**
     * Import a conversation
     * @param {Object} data - Conversation data
     * @param {Object} [options] - Import options
     * @param {string} [options.title] - Override title
     * @param {boolean} [options.preserveTimestamps=true] - Preserve timestamps
     * @returns {Promise<Object>} Import result
     */
    async import(data, options = {}) {
        try {
            if (!data || typeof data !== 'object') {
                return {
                    success: false,
                    error: 'Conversation data is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const newId = `conv_${Date.now()}_${generateId()}`;
            const imported = {
                id: newId,
                title: options.title || data.title || 'Imported Conversation',
                model: data.model || 'claude-3-5-sonnet-20241022',
                systemPrompt: data.systemPrompt,
                metadata: { ...data.metadata, imported: true },
                messages: data.messages || [],
                archived: false,
                createdAt: options.preserveTimestamps !== false ? data.createdAt : new Date().toISOString(),
                updatedAt: options.preserveTimestamps !== false ? data.updatedAt : new Date().toISOString()
            };

            this._conversations.set(newId, imported);

            return formatResponse(imported, { imported: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to import conversation' });
        }
    }

    /**
     * Archive a conversation
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Object>} Archive result
     */
    async archive(conversationId) {
        try {
            if (!conversationId) {
                return {
                    success: false,
                    error: 'Conversation ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const conversation = this._conversations.get(conversationId);
            if (!conversation) {
                return {
                    success: false,
                    error: `Conversation not found: ${conversationId}`,
                    code: 'NOT_FOUND'
                };
            }

            conversation.archived = true;
            conversation.updatedAt = new Date().toISOString();

            return formatResponse(conversation, { archived: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to archive conversation' });
        }
    }

    /**
     * Restore an archived conversation
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Object>} Restore result
     */
    async restore(conversationId) {
        try {
            if (!conversationId) {
                return {
                    success: false,
                    error: 'Conversation ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const conversation = this._conversations.get(conversationId);
            if (!conversation) {
                return {
                    success: false,
                    error: `Conversation not found: ${conversationId}`,
                    code: 'NOT_FOUND'
                };
            }

            conversation.archived = false;
            conversation.updatedAt = new Date().toISOString();

            return formatResponse(conversation, { restored: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to restore conversation' });
        }
    }

    /**
     * Search conversations
     * @param {string} query - Search query
     * @param {Object} [options] - Search options
     * @param {number} [options.limit=50] - Max results
     * @returns {Promise<Object>} Search results
     */
    async search(query, options = {}) {
        try {
            if (!query) {
                return {
                    success: false,
                    error: 'Search query is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const searchLower = query.toLowerCase();
            const results = [];

            for (const conversation of this._conversations.values()) {
                // Search in title
                if (conversation.title.toLowerCase().includes(searchLower)) {
                    results.push({
                        id: conversation.id,
                        title: conversation.title,
                        matchType: 'title'
                    });
                    continue;
                }

                // Search in messages
                const matchingMessages = conversation.messages.filter(m =>
                    typeof m.content === 'string' &&
                    m.content.toLowerCase().includes(searchLower)
                );

                if (matchingMessages.length > 0) {
                    results.push({
                        id: conversation.id,
                        title: conversation.title,
                        matchType: 'message',
                        matchingMessages: matchingMessages.length
                    });
                }
            }

            const limit = options.limit || 50;
            return formatResponse(results.slice(0, limit), {
                query,
                total: results.length,
                returned: Math.min(results.length, limit)
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to search conversations' });
        }
    }

    // Private methods

    /**
     * Convert conversation to markdown
     * @private
     * @param {Object} conversation - Conversation
     * @returns {string} Markdown
     */
    _convertToMarkdown(conversation) {
        const lines = [
            `# ${conversation.title}`,
            '',
            `Model: ${conversation.model}`,
            `Created: ${conversation.createdAt}`,
            `Messages: ${conversation.messages.length}`,
            '',
            '---',
            ''
        ];

        for (const msg of conversation.messages) {
            const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
            lines.push(`## ${role}`, '', msg.content, '', '---', '');
        }

        return lines.join('\n');
    }
}

/**
 * Create a new ClaudeConversationController instance
 * @param {Object} [options] - Controller options
 * @returns {ClaudeConversationController} Controller instance
 */
export function createClaudeConversationController(options = {}) {
    return new ClaudeConversationController(options);
}

export default ClaudeConversationController;
