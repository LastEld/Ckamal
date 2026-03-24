/**
 * Claude Desktop Client
 * Integration with Claude Desktop application via local API
 * Supports Anthropic Opus 4.6 (1M context window)
 */

import { BaseClient } from '../base-client.js';
import { WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Claude Desktop Client for Anthropic Opus 4.6
 * Features:
 * - 1M token context window support
 * - Session-based authentication
 * - WebSocket connection (ws://localhost:3456)
 * - Streaming responses
 * - File upload support
 * - Coding tasks support
 * - Auto-reconnect
 */
export class ClaudeDesktopClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'claude',
      mode: 'desktop',
      name: config.name || 'claude-desktop-opus46'
    });
    
    // WebSocket configuration
    this.ws = null;
    this.apiHost = config.apiHost || 'localhost';
    this.apiPort = config.apiPort || 3456;
    this.wsUrl = config.wsUrl || `ws://${this.apiHost}:${this.apiPort}`;
    
    // Session management
    this.sessionId = config.sessionId || null;
    this.sessionToken = config.sessionToken || null;
    this.conversationId = config.conversationId || null;
    this.pendingRequests = new Map();
    this.requestId = 0;
    
    // Context management (1M tokens)
    this.maxContextTokens = config.maxContextTokens || 1000000;
    this.currentContextTokens = 0;
    this.messageHistory = [];
    
    // Auto-reconnect settings
    this.autoReconnect = config.autoReconnect !== false;
    this.reconnectInterval = config.reconnectInterval || 5000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectTimer = null;
    
    // Streaming handlers
    this.streamHandlers = new Map();
    
    // Coding task handlers
    this.codingCapabilities = {
      codeCompletion: true,
      codeReview: true,
      refactoring: true,
      debugAssistance: true,
      architectureDesign: true
    };
  }

  /**
   * Initialize the client connection
   * Establishes WebSocket connection and authenticates session
   */
  async initialize() {
    this.status = 'initializing';
    
    try {
      // Check if Claude Desktop API is available
      await this._checkApiHealth();
      
      // Authenticate session
      await this._authenticateSession();
      
      // Connect WebSocket
      await this._connectWebSocket();
      
      // Initialize conversation if needed
      if (!this.conversationId) {
        await this._createConversation();
      }
      
      this.status = 'ready';
      this.updateHealth({ connected: true, lastError: null });
      this.emit('ready');
      
      return this.getStatus();
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Check if Claude Desktop API is running
   * @private
   */
  _checkApiHealth() {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${this.apiHost}:${this.apiPort}/health`, (res) => {
        if (res.statusCode === 200) {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const health = JSON.parse(data);
              this.emit('apiHealth', health);
              resolve(health);
            } catch {
              resolve({ status: 'ok' });
            }
          });
        } else {
          reject(new Error(`Claude Desktop API returned status ${res.statusCode}`));
        }
      });

      req.on('error', (error) => {
        reject(new Error(`Claude Desktop not running: ${error.message}`));
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Claude Desktop API health check timeout'));
      });
    });
  }

  /**
   * Authenticate session with Claude Desktop
   * @private
   */
  async _authenticateSession() {
    return new Promise((resolve, reject) => {
      const authData = JSON.stringify({
        clientType: 'cognimesh-desktop-client',
        version: '4.6.0',
        capabilities: ['opus-4.6', '1m-context', 'streaming', 'file-upload']
      });

      const req = http.request({
        hostname: this.apiHost,
        port: this.apiPort,
        path: '/auth/session',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(authData)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.sessionId && response.token) {
              this.sessionId = response.sessionId;
              this.sessionToken = response.token;
              this.emit('authenticated', { sessionId: this.sessionId });
              resolve(response);
            } else {
              reject(new Error('Invalid authentication response'));
            }
          } catch (error) {
            reject(new Error(`Failed to parse auth response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Authentication failed: ${error.message}`));
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Authentication timeout'));
      });

      req.write(authData);
      req.end();
    });
  }

  /**
   * Create a new conversation
   * @private
   */
  async _createConversation() {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: this.apiHost,
        port: this.apiPort,
        path: '/conversations',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            this.conversationId = response.conversationId;
            this.emit('conversationCreated', { conversationId: this.conversationId });
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Conversation creation timeout'));
      });

      req.write(JSON.stringify({
        model: 'claude-opus-4-6',
        maxTokens: this.maxContextTokens
      }));
      req.end();
    });
  }

  /**
   * Establish WebSocket connection
   * @private
   */
  _connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.wsUrl}?session=${this.sessionToken}&conversation=${this.conversationId}`;
      
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`
        }
      });

      const timeout = setTimeout(() => {
        this.ws.terminate();
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.updateHealth({ connected: true });
        resolve();
      });

      this.ws.on('message', (data) => {
        this._handleMessage(data);
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        this.updateHealth({ connected: false, lastError: error.message });
        this.emit('connectionError', error);
        reject(error);
      });

      this.ws.on('close', (code, reason) => {
        this.updateHealth({ connected: false });
        this.emit('disconnected', { code, reason });
        
        if (this.autoReconnect) {
          this._scheduleReconnect();
        }
      });

      this.ws.on('ping', () => {
        this.ws.pong();
      });
    });
  }

  /**
   * Schedule auto-reconnect
   * @private
   */
  _scheduleReconnect() {
    if (this.health.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnectFailed', new Error('Max reconnection attempts reached'));
      return;
    }

    this.status = 'reconnecting';
    this.updateHealth({ reconnectAttempts: this.health.reconnectAttempts + 1 });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.reconnect();
      } catch (error) {
        // Will retry on next interval
      }
    }, this.reconnectInterval);
  }

  /**
   * Handle incoming WebSocket messages
   * @private
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle streaming chunks
      if (message.type === 'stream' && message.streamId) {
        const handler = this.streamHandlers.get(message.streamId);
        if (handler) {
          handler(message.chunk);
        }
        this.emit('stream', message);
        return;
      }
      
      // Handle stream completion
      if (message.type === 'streamEnd' && message.streamId) {
        const handler = this.streamHandlers.get(message.streamId);
        if (handler && handler.onComplete) {
          handler.onComplete(message);
        }
        this.streamHandlers.delete(message.streamId);
        return;
      }
      
      // Handle responses to pending requests
      if (message.requestId && this.pendingRequests.has(message.requestId)) {
        const { resolve, reject } = this.pendingRequests.get(message.requestId);
        this.pendingRequests.delete(message.requestId);
        
        if (message.error) {
          reject(new Error(message.error));
        } else {
          resolve(message);
        }
        return;
      }
      
      // Handle server-initiated messages
      switch (message.type) {
        case 'status':
          this.emit('status', message.data);
          break;
        case 'tokenUpdate':
          this.currentContextTokens = message.tokensUsed || 0;
          this.emit('tokenUpdate', { tokens: this.currentContextTokens });
          break;
        case 'message':
          this._addToHistory(message);
          this.emit('message', message);
          break;
        case 'error':
          this.emit('error', new Error(message.error));
          break;
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Add message to conversation history
   * @private
   */
  _addToHistory(message) {
    this.messageHistory.push({
      id: message.id || crypto.randomUUID(),
      role: message.role || 'assistant',
      content: message.content,
      timestamp: new Date().toISOString()
    });
    
    // Trim history if needed (keep last 1000 messages)
    if (this.messageHistory.length > 1000) {
      this.messageHistory = this.messageHistory.slice(-1000);
    }
  }

  /**
   * Send a message to Claude Desktop
   * @param {Object} message - Message object with content
   * @param {Object} options - Send options
   * @returns {Promise<Object>} Response from Claude
   */
  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Claude Desktop client not connected');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 120000;
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'message',
        content: message.content || message,
        conversationId: options.conversationId || this.conversationId,
        options: {
          model: options.model || 'claude-opus-4-6',
          maxTokens: options.maxTokens || 4096,
          temperature: options.temperature ?? 0.7,
          streaming: options.streaming || false,
          system: options.system,
          ...options.metadata
        }
      };

      this.ws.send(JSON.stringify(payload));

      // Add to history
      this._addToHistory({
        role: 'user',
        content: payload.content
      });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Execute a task on Claude Desktop
   * @param {Object} task - Task definition
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Task result
   */
  async execute(task, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Claude Desktop client not connected');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 300000; // 5 min for tasks
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'task',
        conversationId: options.conversationId || this.conversationId,
        task: {
          type: task.type || 'general',
          description: task.description,
          code: task.code,
          files: task.files,
          language: task.language,
          requirements: task.requirements,
          options: task.options
        },
        options: {
          model: options.model || 'claude-opus-4-6',
          maxTokens: options.maxTokens || 8192,
          workspace: options.cwd,
          ...options.metadata
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Task execution timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Stream responses from Claude Desktop
   * @param {Object} request - Request object
   * @param {Function} callback - Callback for stream chunks
   * @returns {Promise<Object>} Final response
   */
  async stream(request, callback) {
    if (!this.isConnected()) {
      throw new Error('Claude Desktop client not connected');
    }

    const requestId = ++this.requestId;
    const streamId = crypto.randomUUID();
    
    return new Promise((resolve, reject) => {
      const timeout = request.timeout || 120000;
      
      // Register stream handler
      this.streamHandlers.set(streamId, {
        onChunk: callback,
        onComplete: resolve
      });

      this.pendingRequests.set(requestId, { 
        resolve: (response) => {
          this.streamHandlers.delete(streamId);
          resolve(response);
        }, 
        reject: (error) => {
          this.streamHandlers.delete(streamId);
          reject(error);
        }
      });

      const payload = {
        requestId,
        streamId,
        type: 'stream',
        content: request.content || request,
        conversationId: request.conversationId || this.conversationId,
        options: {
          model: request.model || 'claude-opus-4-6',
          maxTokens: request.maxTokens || 4096,
          temperature: request.temperature ?? 0.7,
          ...request.options
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          this.streamHandlers.delete(streamId);
          reject(new Error(`Stream timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Upload a file to Claude Desktop
   * @param {string} filePath - Path to file
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(filePath, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Claude Desktop client not connected');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const fileName = options.fileName || path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);
    const fileType = options.fileType || this._getFileType(filePath);

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 60000;
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'fileUpload',
        conversationId: options.conversationId || this.conversationId,
        file: {
          name: fileName,
          type: fileType,
          size: stats.size,
          content: fileContent.toString('base64'),
          encoding: 'base64'
        },
        options: {
          processImmediately: options.processImmediately !== false,
          extractText: options.extractText !== false,
          ...options.metadata
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`File upload timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Get file type based on extension
   * @private
   */
  _getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.jsx': 'application/javascript',
      '.tsx': 'application/typescript',
      '.json': 'application/json',
      '.py': 'text/x-python',
      '.java': 'text/x-java',
      '.cpp': 'text/x-c++',
      '.c': 'text/x-c',
      '.h': 'text/x-c',
      '.go': 'text/x-go',
      '.rs': 'text/x-rust',
      '.rb': 'text/x-ruby',
      '.php': 'text/x-php',
      '.swift': 'text/x-swift',
      '.kt': 'text/x-kotlin',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.html': 'text/html',
      '.css': 'text/css',
      '.xml': 'application/xml',
      '.yaml': 'application/yaml',
      '.yml': 'application/yaml'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get conversation history
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Message history
   */
  async getConversationHistory(options = {}) {
    if (!this.isConnected()) {
      throw new Error('Claude Desktop client not connected');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 30000;
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'getHistory',
        conversationId: options.conversationId || this.conversationId,
        options: {
          limit: options.limit || 100,
          offset: options.offset || 0,
          includeSystem: options.includeSystem || false
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`History request timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Get local conversation history (cached)
   * @returns {Array} Cached message history
   */
  getLocalHistory() {
    return [...this.messageHistory];
  }

  /**
   * Clear conversation history
   * @param {boolean} remote - Also clear on remote server
   */
  async clearHistory(remote = false) {
    this.messageHistory = [];
    
    if (remote && this.isConnected()) {
      const requestId = ++this.requestId;
      
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(requestId, { resolve, reject });

        this.ws.send(JSON.stringify({
          requestId,
          type: 'clearHistory',
          conversationId: this.conversationId
        }));

        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error('Clear history timeout'));
          }
        }, 30000);
      });
    }
  }

  /**
   * Execute coding task
   * @param {string} taskType - Type of coding task
   * @param {Object} params - Task parameters
   * @returns {Promise<Object>} Task result
   */
  async executeCodingTask(taskType, params = {}) {
    const task = {
      type: 'coding',
      codingType: taskType,
      ...params
    };

    switch (taskType) {
      case 'codeCompletion':
        return this._executeCodeCompletion(params);
      case 'codeReview':
        return this._executeCodeReview(params);
      case 'refactoring':
        return this._executeRefactoring(params);
      case 'debugAssistance':
        return this._executeDebugAssistance(params);
      case 'architectureDesign':
        return this._executeArchitectureDesign(params);
      default:
        return this.execute(task, params.options);
    }
  }

  /**
   * Code completion task
   * @private
   */
  async _executeCodeCompletion(params) {
    const prompt = this._buildCodeCompletionPrompt(params);
    return this.send({ content: prompt }, {
      ...params.options,
      maxTokens: params.options?.maxTokens || 2048
    });
  }

  /**
   * Code review task
   * @private
   */
  async _executeCodeReview(params) {
    const prompt = this._buildCodeReviewPrompt(params);
    return this.send({ content: prompt }, {
      ...params.options,
      maxTokens: params.options?.maxTokens || 4096
    });
  }

  /**
   * Refactoring task
   * @private
   */
  async _executeRefactoring(params) {
    const prompt = this._buildRefactoringPrompt(params);
    return this.send({ content: prompt }, {
      ...params.options,
      maxTokens: params.options?.maxTokens || 8192
    });
  }

  /**
   * Debug assistance task
   * @private
   */
  async _executeDebugAssistance(params) {
    const prompt = this._buildDebugPrompt(params);
    return this.send({ content: prompt }, {
      ...params.options,
      maxTokens: params.options?.maxTokens || 4096
    });
  }

  /**
   * Architecture design task
   * @private
   */
  async _executeArchitectureDesign(params) {
    const prompt = this._buildArchitecturePrompt(params);
    return this.send({ content: prompt }, {
      ...params.options,
      maxTokens: params.options?.maxTokens || 8192
    });
  }

  /**
   * Build code completion prompt
   * @private
   */
  _buildCodeCompletionPrompt(params) {
    const { code, language, cursorPosition, context } = params;
    return `Complete the following ${language || 'code'} code:

File context:
${context || 'N/A'}

Code before cursor:
\`\`\`${language || ''}
${code.slice(0, cursorPosition)}
\`\`\`

Code after cursor:
\`\`\`${language || ''}
${code.slice(cursorPosition)}
\`\`\`

Please provide the code completion at the cursor position. Only return the completion code, no explanations.`;
  }

  /**
   * Build code review prompt
   * @private
   */
  _buildCodeReviewPrompt(params) {
    const { code, language, focusAreas } = params;
    return `Please review the following ${language || ''} code:

\`\`\`${language || ''}
${code}
\`\`\`

Focus areas: ${focusAreas?.join(', ') || 'Best practices, performance, security, maintainability'}

Please provide:
1. Overall assessment
2. Specific issues found (with line numbers if applicable)
3. Suggestions for improvement
4. Code quality rating (1-10)`;
  }

  /**
   * Build refactoring prompt
   * @private
   */
  _buildRefactoringPrompt(params) {
    const { code, language, goals, constraints } = params;
    return `Please refactor the following ${language || ''} code:

\`\`\`${language || ''}
${code}
\`\`\`

Refactoring goals: ${goals?.join(', ') || 'Improve readability and maintainability'}
${constraints ? `Constraints: ${constraints.join(', ')}` : ''}

Please provide:
1. Refactored code
2. Explanation of changes made
3. Benefits of the refactoring`;
  }

  /**
   * Build debug assistance prompt
   * @private
   */
  _buildDebugPrompt(params) {
    const { code, language, error, errorMessage, stackTrace } = params;
    return `Help debug the following ${language || ''} issue:

Code:
\`\`\`${language || ''}
${code}
\`\`\`

Error: ${error || errorMessage || 'Unknown error'}
${stackTrace ? `Stack trace:\n${stackTrace}` : ''}

Please provide:
1. Root cause analysis
2. Solution/fix
3. Prevention recommendations`;
  }

  /**
   * Build architecture design prompt
   * @private
   */
  _buildArchitecturePrompt(params) {
    const { requirements, constraints, techStack, scale } = params;
    return `Design system architecture for the following requirements:

Requirements:
${Array.isArray(requirements) ? requirements.join('\n') : requirements}

${constraints ? `Constraints:\n${Array.isArray(constraints) ? constraints.join('\n') : constraints}` : ''}
${techStack ? `Preferred tech stack: ${techStack}` : ''}
${scale ? `Expected scale: ${scale}` : ''}

Please provide:
1. High-level architecture diagram (describe in text)
2. Component breakdown
3. Data flow
4. Technology choices with justifications
5. Scalability considerations
6. Security considerations`;
  }

  /**
   * Get client capabilities
   * @returns {Object} Capabilities object
   */
  getCapabilities() {
    return {
      provider: 'claude',
      mode: 'desktop',
      model: 'claude-opus-4-6',
      contextWindow: 1000000,
      maxOutputTokens: 8192,
      features: [
        'chat',
        'file_upload',
        'conversation_history',
        'streaming',
        'code_completion',
        'code_review',
        'refactoring',
        'debug_assistance',
        'architecture_design',
        'session_management',
        'auto_reconnect'
      ],
      streaming: true,
      supportsFiles: true,
      supportsConversations: true,
      supportsImages: true,
      supportsDocuments: true,
      codingCapabilities: this.codingCapabilities,
      session: {
        authenticated: !!this.sessionToken,
        sessionId: this.sessionId,
        conversationId: this.conversationId
      }
    };
  }

  /**
   * Get context usage
   * @returns {Object} Context usage statistics
   */
  getContextUsage() {
    return {
      maxTokens: this.maxContextTokens,
      usedTokens: this.currentContextTokens,
      availableTokens: this.maxContextTokens - this.currentContextTokens,
      usagePercent: (this.currentContextTokens / this.maxContextTokens * 100).toFixed(2)
    };
  }

  /**
   * Internal ping implementation
   * @private
   */
  async _doPing() {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      
      this.pendingRequests.set(requestId, { resolve, reject });

      this.ws.send(JSON.stringify({
        requestId,
        type: 'ping',
        timestamp: Date.now()
      }));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Ping timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Reconnect the client
   */
  async reconnect() {
    this.status = 'reconnecting';
    this.emit('reconnecting');
    
    try {
      if (this.ws) {
        this.ws.terminate();
        this.ws = null;
      }
      
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.pendingRequests.clear();
    this.streamHandlers.clear();
    await super.disconnect();
  }

  /**
   * Format message for Claude Desktop
   * @param {Object} message - Generic message format
   * @returns {Object} Formatted message
   */
  formatMessage(message) {
    return {
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
      metadata: message.metadata || {}
    };
  }

  /**
   * Parse response from Claude Desktop
   * @param {Object} response - Desktop-specific response
   * @returns {Object} Generic response format
   */
  parseResponse(response) {
    return {
      content: response.content || response.message,
      metadata: {
        id: response.id,
        model: response.model,
        tokens: response.tokens,
        finishReason: response.finishReason
      },
      timestamp: new Date().toISOString()
    };
  }
}

export default ClaudeDesktopClient;
