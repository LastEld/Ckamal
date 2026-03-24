/**
 * @fileoverview Claude Client - Subscription-based authentication client for Claude AI
 * @module claude/core/client
 *
 * This module provides a client for interacting with Claude AI using subscription-based
 * authentication only (CLAUDE_SESSION_TOKEN). No API key methods are implemented.
 */

import { EventEmitter } from 'events';
import { CircuitBreaker } from '../../middleware/circuit-breaker.js';
import { RetryPolicy } from './resilience.js';

/**
 * Error types specific to Claude client operations
 */
export class ClaudeError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ClaudeError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export class AuthenticationError extends ClaudeError {
  constructor(message, details = {}) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends ClaudeError {
  constructor(message, retryAfter, details = {}) {
    super(message, 'RATE_LIMIT', details);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ConversationError extends ClaudeError {
  constructor(message, conversationId, details = {}) {
    super(message, 'CONVERSATION_ERROR', details);
    this.name = 'ConversationError';
    this.conversationId = conversationId;
  }
}

/**
 * Claude API endpoints and configuration
 * @constant {Object}
 */
const CLAUDE_CONFIG = {
  BASE_URL: 'https://claude.ai/api',
  DEFAULT_TIMEOUT: 120000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  STREAM_CHUNK_SIZE: 1024,
};

/**
 * ClaudeClient - Main client for Claude AI interactions
 *
 * Uses subscription-based authentication via CLAUDE_SESSION_TOKEN environment variable.
 * No API key authentication methods are provided.
 *
 * @extends EventEmitter
 * @example
 * const client = new ClaudeClient();
 * const response = await client.sendMessage([
 *   { role: 'user', content: 'Hello Claude!' }
 * ]);
 */
export class ClaudeClient extends EventEmitter {
  /**
   * Creates a new ClaudeClient instance
   * @param {Object} options - Client configuration options
   * @param {string} [options.sessionToken] - Claude session token (defaults to CLAUDE_SESSION_TOKEN env var)
   * @param {string} [options.organizationId] - Organization ID for multi-org accounts
   * @param {number} [options.timeout] - Request timeout in milliseconds
   * @param {Object} [options.retryPolicy] - Custom retry policy configuration
   * @param {Object} [options.circuitBreaker] - Custom circuit breaker configuration
   */
  constructor(options = {}) {
    super();

    this.sessionToken = options.sessionToken || process.env.CLAUDE_SESSION_TOKEN;
    this.organizationId = options.organizationId || process.env.CLAUDE_ORGANIZATION_ID;
    this.timeout = options.timeout || CLAUDE_CONFIG.DEFAULT_TIMEOUT;

    this.validateSessionToken();

    // Initialize retry policy with exponential backoff
    this.retryPolicy = new RetryPolicy({
      maxRetries: options.retryPolicy?.maxRetries ?? CLAUDE_CONFIG.MAX_RETRIES,
      baseDelay: options.retryPolicy?.baseDelay ?? CLAUDE_CONFIG.RETRY_DELAY,
      maxDelay: options.retryPolicy?.maxDelay ?? 30000,
      backoffMultiplier: options.retryPolicy?.backoffMultiplier ?? 2,
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'RATE_LIMIT'],
    });

    // Initialize circuit breaker for resilience
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: options.circuitBreaker?.failureThreshold ?? 5,
      resetTimeout: options.circuitBreaker?.resetTimeout ?? 60000,
      halfOpenRequests: options.circuitBreaker?.halfOpenRequests ?? 3,
      name: 'claude-api',
    });

    // Request tracking for bulkhead pattern
    this.activeRequests = 0;
    this.maxConcurrentRequests = options.maxConcurrentRequests || 10;
    this.requestQueue = [];

    // Conversation tracking
    this.conversations = new Map();
    this.currentConversationId = null;

    this.setupCircuitBreakerListeners();
  }

  /**
   * Validates that a session token is configured
   * @private
   * @throws {AuthenticationError} When session token is not provided
   */
  validateSessionToken() {
    if (!this.sessionToken) {
      throw new AuthenticationError(
        'CLAUDE_SESSION_TOKEN environment variable is required. ' +
        'Claude integration uses subscription-based authentication only. ' +
        'No API key authentication is supported.',
        { hint: 'Set CLAUDE_SESSION_TOKEN environment variable with your Claude session token' }
      );
    }

    // Validate token format (basic check)
    if (this.sessionToken.length < 32) {
      throw new AuthenticationError(
        'Invalid session token format. Token appears to be too short.',
        { hint: 'Ensure you are using a valid Claude session token from your browser' }
      );
    }
  }

  /**
   * Sets up circuit breaker event listeners
   * @private
   */
  setupCircuitBreakerListeners() {
    this.circuitBreaker.on('open', () => {
      this.emit('circuitOpen', { timestamp: new Date().toISOString() });
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.emit('circuitHalfOpen', { timestamp: new Date().toISOString() });
    });

    this.circuitBreaker.on('close', () => {
      this.emit('circuitClosed', { timestamp: new Date().toISOString() });
    });
  }

  /**
   * Gets the default headers for API requests
   * @private
   * @returns {Object} Headers object
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cookie': `sessionKey=${this.sessionToken}`,
      'User-Agent': 'CogniMesh-Claude-Client/1.0',
      'X-Claude-Client': 'web',
    };

    if (this.organizationId) {
      headers['X-Organization-Id'] = this.organizationId;
    }

    return headers;
  }

  /**
   * Implements bulkhead pattern - limits concurrent requests
   * @private
   * @returns {Promise<Function>} Release function to call when request completes
   */
  async acquireRequestSlot() {
    if (this.activeRequests < this.maxConcurrentRequests) {
      this.activeRequests++;
      return () => {
        this.activeRequests--;
        this.processQueue();
      };
    }

    // Queue the request if at capacity
    return new Promise((resolve) => {
      this.requestQueue.push(resolve);
    });
  }

  /**
   * Processes queued requests when slots become available
   * @private
   */
  processQueue() {
    if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      const next = this.requestQueue.shift();
      this.activeRequests++;
      next(() => {
        this.activeRequests--;
        this.processQueue();
      });
    }
  }

  /**
   * Makes an HTTP request with timeout and retry logic
   * @private
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} Fetch response
   * @throws {ClaudeError} On request failure
   */
  async makeRequest(endpoint, options = {}) {
    const release = await this.acquireRequestSlot();

    try {
      const url = `${CLAUDE_CONFIG.BASE_URL}${endpoint}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        headers: { ...this.getHeaders(), ...options.headers },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After'), 10) || 60;
        throw new RateLimitError('Rate limit exceeded', retryAfter);
      }

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(
          'Session token invalid or expired',
          { status: response.status }
        );
      }

      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new ClaudeError('Request timeout', 'TIMEOUT_ERROR', { timeout: this.timeout });
      }
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Sends a message to Claude and returns the complete response
   *
   * @param {Array<Object>} messages - Array of message objects with role and content
   * @param {Object} options - Message options
   * @param {string} [options.conversationId] - Existing conversation ID
   * @param {string} [options.model] - Model to use (e.g., 'claude-3-opus-20240229')
   * @param {number} [options.maxTokens] - Maximum tokens in response
   * @param {number} [options.temperature] - Sampling temperature (0-1)
   * @param {boolean} [options.enableThinking] - Enable extended thinking mode
   * @param {number} [options.thinkingBudget] - Token budget for thinking
   * @returns {Promise<Object>} Claude's response with content and metadata
   * @throws {ClaudeError} On communication or authentication errors
   *
   * @example
   * const response = await client.sendMessage([
   *   { role: 'user', content: 'Explain quantum computing' }
   * ], {
   *   model: 'claude-3-opus-20240229',
   *   maxTokens: 4096,
   *   enableThinking: true,
   *   thinkingBudget: 16000
   * });
   */
  async sendMessage(messages, options = {}) {
    return this.circuitBreaker.execute(async () => {
      return this.retryPolicy.execute(async () => {
        const conversationId = options.conversationId || this.currentConversationId;

        const body = {
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            ...(msg.attachments && { attachments: msg.attachments }),
          })),
          model: options.model || 'claude-3-5-sonnet-20241022',
          max_tokens: options.maxTokens || 4096,
          ...(options.temperature !== undefined && { temperature: options.temperature }),
          ...(options.enableThinking && {
            thinking: {
              type: 'enabled',
              budget_tokens: options.thinkingBudget || 16000,
            },
          }),
        };

        const response = await this.makeRequest('/chat', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new ClaudeError(
            `Claude API error: ${response.status} - ${errorText}`,
            'API_ERROR',
            { status: response.status, body: errorText }
          );
        }

        const data = await response.json();

        // Track conversation
        if (data.conversation_id) {
          this.currentConversationId = data.conversation_id;
          this.conversations.set(data.conversation_id, {
            id: data.conversation_id,
            createdAt: new Date().toISOString(),
            messages: [...messages, { role: 'assistant', content: data.content }],
          });
        }

        this.emit('messageSent', {
          conversationId: data.conversation_id,
          tokensUsed: data.usage?.total_tokens,
          timestamp: new Date().toISOString(),
        });

        return {
          content: data.content,
          conversationId: data.conversation_id,
          model: data.model,
          usage: data.usage,
          thinking: data.thinking,
          stopReason: data.stop_reason,
        };
      });
    });
  }

  /**
   * Streams a message response from Claude
   *
   * Returns an async iterator that yields response chunks as they arrive.
   * Useful for real-time UI updates.
   *
   * @param {Array<Object>} messages - Array of message objects
   * @param {Object} options - Stream options (same as sendMessage)
   * @returns {AsyncGenerator<Object>} Async generator yielding response chunks
   * @throws {ClaudeError} On communication or authentication errors
   *
   * @example
   * for await (const chunk of client.streamMessage([
   *   { role: 'user', content: 'Write a story' }
   * ])) {
   *   process.stdout.write(chunk.content);
   * }
   */
  async *streamMessage(messages, options = {}) {
    const release = await this.acquireRequestSlot();

    try {
      const stream = await this.circuitBreaker.execute(() => this._createStream(messages, options));

      for await (const chunk of stream) {
        yield chunk;
      }
    } finally {
      release();
    }
  }

  /**
   * Creates an async iterator for streamed Claude responses.
   * @private
   */
  async *_createStream(messages, options = {}) {
    const body = {
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      model: options.model || 'claude-3-5-sonnet-20241022',
      max_tokens: options.maxTokens || 4096,
      stream: true,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.enableThinking && {
        thinking: {
          type: 'enabled',
          budget_tokens: options.thinkingBudget || 16000,
        },
      }),
    };

    const response = await this.makeRequest('/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new ClaudeError(
        `Claude streaming error: ${response.status}`,
        'STREAM_ERROR',
        { status: response.status, body: errorText }
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            const data = line.trim().slice(6);

            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              yield {
                type: parsed.type,
                content: parsed.delta?.text || parsed.content,
                thinking: parsed.thinking,
                usage: parsed.usage,
                finishReason: parsed.finish_reason,
              };
            } catch (parseError) {
              this.emit('parseError', { line: data, error: parseError.message });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Creates a new conversation
   *
   * @param {Object} options - Conversation options
   * @param {string} [options.name] - Optional conversation name
   * @param {Object} [options.metadata] - Optional metadata to store
   * @returns {Promise<Object>} New conversation details
   * @throws {ClaudeError} On creation failure
   *
   * @example
   * const conversation = await client.createConversation({
   *   name: 'Project Discussion',
   *   metadata: { project: 'cognimesh' }
   * });
   */
  async createConversation(options = {}) {
    return this.circuitBreaker.execute(async () => {
      return this.retryPolicy.execute(async () => {
        const response = await this.makeRequest('/conversations', {
          method: 'POST',
          body: JSON.stringify({
            name: options.name || null,
            metadata: options.metadata || {},
          }),
        });

        if (!response.ok) {
          throw new ConversationError(
            'Failed to create conversation',
            null,
            { status: response.status }
          );
        }

        const data = await response.json();

        const conversation = {
          id: data.id,
          name: data.name,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          metadata: data.metadata,
          messages: [],
        };

        this.conversations.set(data.id, conversation);
        this.currentConversationId = data.id;

        this.emit('conversationCreated', { conversationId: data.id });

        return conversation;
      });
    });
  }

  /**
   * Retrieves a conversation by ID
   *
   * @param {string} id - Conversation ID
   * @param {Object} options - Retrieval options
   * @param {boolean} [options.includeMessages=true] - Include message history
   * @returns {Promise<Object>} Conversation details
   * @throws {ConversationError} When conversation not found or access denied
   *
   * @example
   * const conversation = await client.getConversation('conv_123');
   * console.log(conversation.messages);
   */
  async getConversation(id, options = {}) {
    return this.circuitBreaker.execute(async () => {
      return this.retryPolicy.execute(async () => {
        const queryParams = new URLSearchParams();
        if (options.includeMessages !== false) {
          queryParams.set('include_messages', 'true');
        }

        const response = await this.makeRequest(
          `/conversations/${id}?${queryParams.toString()}`,
          { method: 'GET' }
        );

        if (response.status === 404) {
          throw new ConversationError('Conversation not found', id, { status: 404 });
        }

        if (!response.ok) {
          throw new ConversationError(
            'Failed to retrieve conversation',
            id,
            { status: response.status }
          );
        }

        const data = await response.json();

        const conversation = {
          id: data.id,
          name: data.name,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          metadata: data.metadata,
          messages: data.messages || [],
        };

        // Update local cache
        this.conversations.set(id, conversation);

        return conversation;
      });
    });
  }

  /**
   * Sets the active organization context
   *
   * All subsequent requests will use this organization ID.
   *
   * @param {string} id - Organization ID
   * @returns {ClaudeClient} This client instance for chaining
   * @throws {AuthenticationError} When organization ID is invalid
   *
   * @example
   * client.setOrganization('org_123');
   * const response = await client.sendMessage([...]);
   */
  setOrganization(id) {
    if (!id || typeof id !== 'string') {
      throw new AuthenticationError('Organization ID must be a non-empty string');
    }

    this.organizationId = id;
    this.emit('organizationChanged', { organizationId: id });

    return this;
  }

  /**
   * Lists available organizations for the current session
   *
   * @returns {Promise<Array<Object>>} Array of organization objects
   * @throws {ClaudeError} On API error
   */
  async listOrganizations() {
    return this.circuitBreaker.execute(async () => {
      return this.retryPolicy.execute(async () => {
        const response = await this.makeRequest('/organizations', { method: 'GET' });

        if (!response.ok) {
          throw new ClaudeError(
            'Failed to list organizations',
            'ORG_LIST_ERROR',
            { status: response.status }
          );
        }

        const data = await response.json();
        return data.organizations || [];
      });
    });
  }

  /**
   * Gets the current conversation ID
   * @returns {string|null} Current conversation ID or null
   */
  getCurrentConversationId() {
    return this.currentConversationId;
  }

  /**
   * Gets all cached conversations
   * @returns {Array<Object>} Array of conversation objects
   */
  getCachedConversations() {
    return Array.from(this.conversations.values());
  }

  /**
   * Clears the conversation cache
   * @returns {ClaudeClient} This client instance for chaining
   */
  clearConversationCache() {
    this.conversations.clear();
    this.currentConversationId = null;
    return this;
  }

  /**
   * Gets client health status
   * @returns {Object} Health status information
   */
  getHealthStatus() {
    return {
      circuitBreaker: this.circuitBreaker.getState(),
      activeRequests: this.activeRequests,
      maxConcurrentRequests: this.maxConcurrentRequests,
      queuedRequests: this.requestQueue.length,
      cachedConversations: this.conversations.size,
      hasSessionToken: !!this.sessionToken,
      organizationId: this.organizationId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Closes the client and cleans up resources
   * @returns {Promise<void>}
   */
  async close() {
    this.clearConversationCache();
    this.requestQueue = [];
    this.activeRequests = 0;
    this.circuitBreaker.removeAllListeners();
    this.removeAllListeners();
  }
}

export default ClaudeClient;
