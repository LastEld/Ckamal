/**
 * @fileoverview GPT 5.4 Codex Desktop Application Client
 * @module models/codex/gpt54-app
 * 
 * Desktop application integration with GPT 5.4 Codex:
 * - WebSocket streaming for real-time interaction
 * - HTTP API fallback
 * - File upload support with drag-and-drop
 * - Session management with persistence
 * - Multimodal support (image + text)
 * - Reasoning visualization
 * 
 * Features:
 * - Native app integration
 * - Real-time streaming
 * - File management
 * - Project workspace
 * - Checkpoint management
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { GPT54Client } from './gpt54-client.js';
import { GPT54Config, PRESETS } from './gpt54-config.js';

/**
 * Error types for App client
 */
export class GPT54AppError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'GPT54AppError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * GPT 5.4 Codex Desktop Application Client
 * Provides integration for desktop applications
 * @extends EventEmitter
 */
export class GPT54AppClient extends EventEmitter {
  #client;
  #config;
  #workspace;
  #sessions;
  #currentSessionId;
  #files;
  #ws;
  #connectionState;
  #uploadQueue;
  
  /**
   * Connection states
   * @enum {string}
   */
  static ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    READY: 'ready',
    ERROR: 'error',
  };
  
  /**
   * Creates a GPT54AppClient instance
   * @param {Object} options - Client options
   * @param {string} [options.apiKey] - OpenAI API key
   * @param {Object} [options.config] - Configuration options
   * @param {string} [options.workspace] - Workspace directory
   */
  constructor(options = {}) {
    super();
    
    this.#config = new GPT54Config(options.config || {});
    this.#client = new GPT54Client({
      apiKey: options.apiKey,
      config: this.#config,
    });
    
    this.#workspace = options.workspace || process.cwd();
    this.#sessions = new Map();
    this.#currentSessionId = null;
    this.#files = new Map();
    this.#ws = null;
    this.#connectionState = GPT54AppClient.ConnectionState.DISCONNECTED;
    this.#uploadQueue = [];
    
    this.#setupClientEvents();
  }
  
  /**
   * Sets up client event handlers
   * @private
   */
  #setupClientEvents() {
    this.#client.on('messageSent', (data) => this.emit('message:sent', data));
    this.#client.on('error', (error) => this.emit('error', error));
    this.#client.on('cost:recorded', (data) => this.emit('cost:recorded', data));
  }
  
  // ==================== Initialization ====================
  
  /**
   * Initializes the app client
   * @param {Object} options - Initialization options
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    this.emit('initializing');
    
    try {
      // Initialize core client
      await this.#client.initialize();
      
      // Create default session
      await this.createSession('default', options.sessionMetadata);
      
      // Connect WebSocket if URL provided
      if (options.websocketUrl || this.#config.getConfig().websocketUrl) {
        await this.#connectWebSocket(options.websocketUrl);
      }
      
      this.emit('ready');
      
    } catch (error) {
      this.emit('error', error);
      throw new GPT54AppError(
        `Failed to initialize: ${error.message}`,
        'INIT_ERROR',
        { cause: error }
      );
    }
  }
  
  /**
   * Connects WebSocket for streaming
   * @private
   * @param {string} url - WebSocket URL
   * @returns {Promise<void>}
   */
  #connectWebSocket(url) {
    return new Promise((resolve, reject) => {
      const wsUrl = url || this.#config.getConfig().websocketUrl;
      
      this.#ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${this.#client.apiKey}`,
          'X-Client-Version': '5.4.0',
        },
      });
      
      this.#ws.on('open', () => {
        this.#connectionState = GPT54AppClient.ConnectionState.CONNECTED;
        this.emit('websocket:connected');
        resolve();
      });
      
      this.#ws.on('message', (data) => {
        this.#handleWebSocketMessage(data);
      });
      
      this.#ws.on('error', (error) => {
        reject(error);
      });
      
      this.#ws.on('close', () => {
        this.#connectionState = GPT54AppClient.ConnectionState.DISCONNECTED;
        this.emit('websocket:disconnected');
      });
    });
  }
  
  /**
   * Handles WebSocket messages
   * @private
   * @param {Buffer} data - Message data
   */
  #handleWebSocketMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      this.emit('websocket:message', message);
      
      switch (message.type) {
        case 'stream:delta':
          this.emit('stream:delta', message);
          break;
        case 'stream:done':
          this.emit('stream:done', message);
          break;
        case 'reasoning:update':
          this.emit('reasoning:update', message);
          break;
        case 'file:processed':
          this.emit('file:processed', message);
          break;
      }
    } catch (error) {
      this.emit('websocket:error', { error: error.message, data });
    }
  }
  
  // ==================== Session Management ====================
  
  /**
   * Creates a new session
   * @param {string} name - Session name
   * @param {Object} metadata - Session metadata
   * @returns {Object} Created session
   */
  async createSession(name, metadata = {}) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session = {
      id: sessionId,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      files: [],
      checkpoints: [],
      metadata: {
        ...metadata,
        workspace: this.#workspace,
      },
      settings: {
        reasoning: true,
        streaming: true,
        autoSave: true,
      },
    };
    
    this.#sessions.set(sessionId, session);
    this.#currentSessionId = sessionId;
    
    this.emit('session:created', session);
    return session;
  }
  
  /**
   * Switches to a different session
   * @param {string} sessionId - Session ID to switch to
   * @returns {boolean} Success status
   */
  switchSession(sessionId) {
    if (!this.#sessions.has(sessionId)) {
      return false;
    }
    
    this.#currentSessionId = sessionId;
    this.emit('session:switched', this.#sessions.get(sessionId));
    return true;
  }
  
  /**
   * Gets current session
   * @returns {Object|null} Current session
   */
  getCurrentSession() {
    return this.#currentSessionId 
      ? this.#sessions.get(this.#currentSessionId) 
      : null;
  }
  
  /**
   * Gets all sessions
   * @returns {Array} All sessions
   */
  getAllSessions() {
    return Array.from(this.#sessions.values());
  }
  
  /**
   * Deletes a session
   * @param {string} sessionId - Session ID to delete
   * @returns {boolean} Success status
   */
  deleteSession(sessionId) {
    if (!this.#sessions.has(sessionId)) {
      return false;
    }
    
    this.#sessions.delete(sessionId);
    
    if (this.#currentSessionId === sessionId) {
      this.#currentSessionId = this.#sessions.size > 0 
        ? this.#sessions.keys().next().value 
        : null;
    }
    
    this.emit('session:deleted', { sessionId });
    return true;
  }
  
  /**
   * Renames a session
   * @param {string} sessionId - Session ID
   * @param {string} newName - New name
   * @returns {boolean} Success status
   */
  renameSession(sessionId, newName) {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return false;
    }
    
    session.name = newName;
    session.updatedAt = Date.now();
    
    this.emit('session:renamed', { sessionId, newName });
    return true;
  }
  
  /**
   * Saves session state
   * @param {string} [sessionId] - Session ID (defaults to current)
   * @returns {Object} Saved session data
   */
  saveSession(sessionId = this.#currentSessionId) {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      throw new GPT54AppError('Session not found', 'SESSION_NOT_FOUND');
    }
    
    session.updatedAt = Date.now();
    
    const saveData = {
      ...session,
      savedAt: Date.now(),
    };
    
    this.emit('session:saved', saveData);
    return saveData;
  }
  
  /**
   * Loads session state
   * @param {Object} data - Session data to load
   * @returns {Object} Loaded session
   */
  loadSession(data) {
    const session = {
      ...data,
      loadedAt: Date.now(),
      messages: data.messages || [],
    };
    
    this.#sessions.set(session.id, session);
    
    this.emit('session:loaded', session);
    return session;
  }
  
  // ==================== Messaging ====================
  
  /**
   * Sends a message in the current session
   * @param {string} message - Message content
   * @param {Object} options - Send options
   * @returns {Promise<Object>} Response
   */
  async sendMessage(message, options = {}) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new GPT54AppError('No active session', 'NO_SESSION');
    }
    
    // Add message to session
    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    session.messages.push(userMessage);
    
    this.emit('message:added', userMessage);
    
    // Send via client
    const response = await this.#client.send(message, {
      ...options,
      messages: session.messages.slice(0, -1), // Exclude current message
    });
    
    // Add response to session
    const assistantMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: response.content,
      reasoning: response.reasoning,
      timestamp: Date.now(),
      usage: response.usage,
    };
    session.messages.push(assistantMessage);
    session.updatedAt = Date.now();
    
    this.emit('message:added', assistantMessage);
    
    // Auto-save if enabled
    if (session.settings.autoSave) {
      this.saveSession(session.id);
    }
    
    return response;
  }
  
  /**
   * Streams a message response
   * @param {string} message - Message content
   * @param {Object} callback - Callback handlers
   * @returns {Promise<string>} Full response
   */
  async streamMessage(message, callback = {}) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new GPT54AppError('No active session', 'NO_SESSION');
    }
    
    // Add message to session
    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    session.messages.push(userMessage);
    
    this.emit('message:added', userMessage);
    
    // Stream via client
    const stream = await this.#client.send(message, {
      streaming: true,
      messages: session.messages.slice(0, -1),
    });
    
    let fullContent = '';
    let fullReasoning = '';
    
    for await (const chunk of stream) {
      switch (chunk.type) {
        case 'content':
          fullContent += chunk.content;
          if (callback.onContent) callback.onContent(chunk.content);
          break;
        case 'reasoning':
          fullReasoning += chunk.reasoning;
          if (callback.onReasoning) callback.onReasoning(chunk.reasoning);
          break;
        case 'done':
          if (callback.onDone) callback.onDone(chunk);
          break;
      }
      
      this.emit('stream:chunk', chunk);
    }
    
    // Add response to session
    const assistantMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: fullContent,
      reasoning: fullReasoning,
      timestamp: Date.now(),
    };
    session.messages.push(assistantMessage);
    session.updatedAt = Date.now();
    
    this.emit('message:added', assistantMessage);
    
    return fullContent;
  }
  
  // ==================== File Management ====================
  
  /**
   * Uploads a file to the current session
   * @param {string|Buffer} file - File path or buffer
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(file, options = {}) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new GPT54AppError('No active session', 'NO_SESSION');
    }
    
    const fs = await import('fs/promises');
    const path = await import('path');
    
    let fileData;
    
    if (Buffer.isBuffer(file)) {
      fileData = {
        name: options.name || 'uploaded_file',
        content: file.toString('utf8'),
        size: file.length,
      };
    } else {
      const content = await fs.readFile(file, 'utf8');
      const stats = await fs.stat(file);
      
      fileData = {
        name: options.name || path.basename(file),
        path: file,
        content,
        size: stats.size,
      };
    }
    
    // Validate file
    const validation = this.#config.validateFile(fileData);
    if (!validation.valid) {
      throw new GPT54AppError(
        `File validation failed: ${validation.errors.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }
    
    // Add to session files
    const fileEntry = {
      id: `file_${Date.now()}`,
      ...fileData,
      uploadedAt: Date.now(),
      type: validation.isImage ? 'image' : 'code',
    };
    
    session.files.push(fileEntry);
    this.#files.set(fileEntry.id, fileEntry);
    
    this.emit('file:uploaded', fileEntry);
    
    return fileEntry;
  }
  
  /**
   * Uploads multiple files
   * @param {Array<string>} files - File paths
   * @param {Object} options - Upload options
   * @returns {Promise<Array>} Upload results
   */
  async uploadFiles(files, options = {}) {
    const results = [];
    const maxFiles = this.#config.getConfig().maxFilesPerRequest;
    
    for (let i = 0; i < files.length && i < maxFiles; i++) {
      try {
        const result = await this.uploadFile(files[i], options);
        results.push({ success: true, file: result });
      } catch (error) {
        results.push({ success: false, error: error.message, path: files[i] });
      }
    }
    
    return results;
  }
  
  /**
   * Removes a file from the session
   * @param {string} fileId - File ID
   * @returns {boolean} Success status
   */
  removeFile(fileId) {
    const session = this.getCurrentSession();
    if (!session) return false;
    
    const index = session.files.findIndex(f => f.id === fileId);
    if (index === -1) return false;
    
    session.files.splice(index, 1);
    this.#files.delete(fileId);
    
    this.emit('file:removed', { fileId });
    return true;
  }
  
  /**
   * Gets files in current session
   * @returns {Array} Session files
   */
  getFiles() {
    const session = this.getCurrentSession();
    return session ? session.files : [];
  }
  
  /**
   * Analyzes uploaded files
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeFiles(options = {}) {
    const session = this.getCurrentSession();
    if (!session || session.files.length === 0) {
      throw new GPT54AppError('No files to analyze', 'NO_FILES');
    }
    
    const files = session.files.map(f => ({
      path: f.name,
      content: f.content,
    }));
    
    return this.#client.complexRefactoring(files, {
      goal: options.goal || 'Analyze and understand the codebase',
      ...options,
    });
  }
  
  // ==================== Checkpoints ====================
  
  /**
   * Creates a checkpoint
   * @param {string} [label] - Checkpoint label
   * @returns {Object} Checkpoint
   */
  createCheckpoint(label) {
    const checkpoint = this.#client.createCheckpoint(label);
    
    const session = this.getCurrentSession();
    if (session) {
      session.checkpoints.push(checkpoint);
    }
    
    return checkpoint;
  }
  
  /**
   * Restores a checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @returns {boolean} Success status
   */
  restoreCheckpoint(checkpointId) {
    return this.#client.restoreCheckpoint(checkpointId);
  }
  
  /**
   * Gets all checkpoints for current session
   * @returns {Array} Checkpoints
   */
  getCheckpoints() {
    const session = this.getCurrentSession();
    return session ? session.checkpoints : [];
  }
  
  // ==================== Advanced Features ====================
  
  /**
   * Performs architecture design
   * @param {Object} requirements - Architecture requirements
   * @returns {Promise<Object>} Architecture design
   */
  async designArchitecture(requirements) {
    return this.#client.codeArchitecture(requirements);
  }
  
  /**
   * Performs complex refactoring
   * @param {Object} options - Refactoring options
   * @returns {Promise<Object>} Refactoring result
   */
  async refactor(options = {}) {
    const session = this.getCurrentSession();
    const files = session?.files.map(f => ({
      path: f.name,
      content: f.content,
    })) || [];
    
    return this.#client.complexRefactoring(files, options);
  }
  
  /**
   * Analyzes security
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Security analysis
   */
  async analyzeSecurity(options = {}) {
    const session = this.getCurrentSession();
    const code = session?.files.map(f => f.content).join('\n\n') || '';
    
    return this.#client.securityAnalysis(code, options);
  }
  
  /**
   * Analyzes performance
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Performance analysis
   */
  async analyzePerformance(options = {}) {
    const session = this.getCurrentSession();
    const code = session?.files.map(f => f.content).join('\n\n') || '';
    
    return this.#client.performanceAnalysis(code, options);
  }
  
  /**
   * Generates system design
   * @param {Object} spec - System specification
   * @returns {Promise<Object>} System design
   */
  async generateSystemDesign(spec) {
    return this.#client.systemDesign(spec);
  }
  
  // ==================== Workspace ====================
  
  /**
   * Sets workspace directory
   * @param {string} workspace - Workspace path
   */
  setWorkspace(workspace) {
    this.#workspace = workspace;
    
    const session = this.getCurrentSession();
    if (session) {
      session.metadata.workspace = workspace;
    }
    
    this.emit('workspace:changed', { workspace });
  }
  
  /**
   * Gets workspace directory
   * @returns {string} Workspace path
   */
  getWorkspace() {
    return this.#workspace;
  }
  
  /**
   * Opens a project in workspace
   * @param {string} projectPath - Project path
   * @returns {Promise<Object>} Project info
   */
  async openProject(projectPath) {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const stats = await fs.stat(projectPath);
    if (!stats.isDirectory()) {
      throw new GPT54AppError('Path is not a directory', 'INVALID_PATH');
    }
    
    this.setWorkspace(projectPath);
    
    // Scan for files
    const files = await this.#scanDirectory(projectPath);
    
    const projectInfo = {
      path: projectPath,
      name: path.basename(projectPath),
      files: files.map(f => path.relative(projectPath, f)),
    };
    
    this.emit('project:opened', projectInfo);
    return projectInfo;
  }
  
  /**
   * Scans directory for files
   * @private
   * @param {string} dir - Directory to scan
   * @returns {Promise<Array>} File paths
   */
  async #scanDirectory(dir) {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const files = [];
    
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip common ignored directories
        if (['node_modules', '.git', 'dist', 'build', '.tmp', 'coverage'].includes(entry.name)) {
          continue;
        }
        const subFiles = await this.#scanDirectory(fullPath);
        files.push(...subFiles);
      } else {
        const ext = path.extname(entry.name).slice(1);
        if (this.#config.getConfig().supportedFormats.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }
  
  // ==================== Settings ====================
  
  /**
   * Updates session settings
   * @param {Object} settings - Settings to update
   * @returns {Object} Updated settings
   */
  updateSettings(settings) {
    const session = this.getCurrentSession();
    if (!session) {
      throw new GPT54AppError('No active session', 'NO_SESSION');
    }
    
    session.settings = { ...session.settings, ...settings };
    
    this.emit('settings:updated', session.settings);
    return session.settings;
  }
  
  /**
   * Gets current settings
   * @returns {Object} Current settings
   */
  getSettings() {
    const session = this.getCurrentSession();
    return session ? session.settings : null;
  }
  
  // ==================== Cleanup ====================
  
  /**
   * Closes the app client
   * @returns {Promise<void>}
   */
  async close() {
    if (this.#ws) {
      this.#ws.close();
      this.#ws = null;
    }
    
    await this.#client.close();
    
    this.#sessions.clear();
    this.#files.clear();
    
    this.emit('closed');
  }
  
  /**
   * Gets client statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      sessions: this.#sessions.size,
      currentSession: this.#currentSessionId,
      files: this.#files.size,
      connectionState: this.#connectionState,
      workspace: this.#workspace,
      costStats: this.#client.getCostStats(),
      metrics: this.#client.getMetrics(),
    };
  }
}

/**
 * Creates a GPT54AppClient instance
 * @param {Object} options - Client options
 * @returns {GPT54AppClient} App client instance
 */
export function createGPT54AppClient(options = {}) {
  return new GPT54AppClient(options);
}

export default GPT54AppClient;
