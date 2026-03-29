/**
 * Kimi VSCode Client
 * Integration with Kimi VS Code extension (Kimi 2.5)
 * TCP Socket communication on port 18123
 * Extended context handling (256K)
 */

import { BaseClient } from '../base-client.js';
import net from 'net';
import http from 'http';


/**
 * KimiVSCodeClient - Advanced IDE integration for Kimi 2.5
 * Features:
 * - TCP Socket communication (port 18123)
 * - 256K context window support
 * - Inline completions
 * - Code explanation
 * - Test generation
 * - Performance optimization
 * - Security audit
 * - File tree analysis
 * - Cross-file references
 * - Bilingual support (Chinese/English)
 * - CogniMesh integration
 */
export class KimiVSCodeClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'kimi',
      mode: 'vscode',
      name: config.name || 'kimi-vscode'
    });
    
    // TCP Socket configuration
    this.port = config.port || 18123;
    this.host = config.host || 'localhost';
    this.socket = null;
    
    // Request handling
    this.responseHandlers = new Map();
    this.requestId = 0;
    this.messageQueue = [];
    
    // Context management
    this.contextWindow = 256000;
    this.fileTree = null;
    this.crossFileRefs = new Map();
    this.languagePreference = config.language || 'auto'; // 'zh', 'en', 'auto'
    
    // CogniMesh integration
    this.cogniMeshEnabled = config.cogniMeshEnabled ?? true;
    this.workspaceRoot = config.workspaceRoot || process.cwd();
  }

  /**
   * Initialize the client connection
   */
  async initialize() {
    this.status = 'initializing';
    this.emit('initializing');

    try {
      // Check if Kimi extension is running
      await this._checkExtensionHealth();

      // Connect to extension via TCP socket
      await this._connectSocket();
      
      // Initialize context
      await this._initializeContext();

      this.status = 'ready';
      this.updateHealth({ connected: true, lastError: null });
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      throw error;
    }
  }

  /**
   * Check if extension HTTP API is available
   * @private
   */
  _checkExtensionHealth() {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${this.host}:${this.port}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Extension health check failed: ${res.statusCode}`));
        }
      });

      req.on('error', (error) => {
        reject(new Error(`Kimi extension not running on port ${this.port}: ${error.message}`));
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Extension health check timeout'));
      });
    });
  }

  /**
   * Connect to extension via TCP socket
   * @private
   */
  _connectSocket() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Socket connection timeout to ${this.host}:${this.port}`));
      }, 10000);

      this.socket = net.connect({ port: this.port, host: this.host });

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.updateHealth({ connected: true });
        resolve();
      });

      this.socket.on('data', (data) => {
        this._handleData(data);
      });

      this.socket.on('error', (error) => {
        clearTimeout(timeout);
        this.updateHealth({ connected: false, lastError: error.message });
        reject(error);
      });

      this.socket.on('close', () => {
        this.updateHealth({ connected: false });
        this.emit('disconnected');
      });
    });
  }

  /**
   * Initialize context with file tree and workspace info
   * @private
   */
  async _initializeContext() {
    try {
      // Request file tree from extension
      const fileTree = await this._sendRequest({
        type: 'getFileTree',
        workspaceRoot: this.workspaceRoot
      }, 15000);
      
      this.fileTree = fileTree;
      
      // Load cross-file references
      await this._loadCrossFileReferences();
    } catch (error) {
      this.emit('warning', { message: 'Failed to initialize context', error: error.message });
    }
  }

  /**
   * Load cross-file references
   * @private
   */
  async _loadCrossFileReferences() {
    try {
      const refs = await this._sendRequest({
        type: 'getCrossFileReferences',
        workspaceRoot: this.workspaceRoot
      }, 20000);
      
      if (refs && refs.references) {
        this.crossFileRefs = new Map(Object.entries(refs.references));
      }
    } catch (error) {
      this.emit('warning', { message: 'Failed to load cross-file references', error: error.message });
    }
  }

  /**
   * Handle incoming socket data
   * @private
   */
  _handleData(data) {
    try {
      const lines = data.toString().split('\n').filter(Boolean);

      for (const line of lines) {
        const message = JSON.parse(line);

        if (message.id && this.responseHandlers.has(message.id)) {
          const { resolve, reject, timeout } = this.responseHandlers.get(message.id);
          clearTimeout(timeout);
          this.responseHandlers.delete(message.id);

          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message);
          }
        } else if (message.type === 'notification') {
          this.emit('notification', message);
        } else if (message.type === 'fileChange') {
          this._handleFileChange(message);
        } else {
          this.emit('message', message);
        }
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Handle file change notifications
   * @private
   */
  _handleFileChange(message) {
    // Update file tree and cross-file references
    this.emit('fileChange', message);
    
    // Trigger incremental context update
    if (this.cogniMeshEnabled) {
      this._updateCogniMeshContext(message);
    }
  }

  /**
   * Send request via socket
   * @private
   */
  _sendRequest(payload, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new Error('Socket not connected'));
        return;
      }

      const id = ++this.requestId;
      const message = { id, ...payload };

      const timeout = setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Request timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.responseHandlers.set(id, { resolve, reject, timeout });

      this.socket.write(JSON.stringify(message) + '\n', (error) => {
        if (error) {
          clearTimeout(timeout);
          this.responseHandlers.delete(id);
          reject(error);
        }
      });
    });
  }

  /**
   * Send message to Kimi
   */
  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Kimi VSCode client not connected');
    }

    return this._sendRequest({
      type: 'chat',
      content: message.content,
      context: this._buildContext(options),
      options: {
        model: options.model || 'kimi-2.5',
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens || 4096,
        language: options.language || this.languagePreference
      }
    }, options.timeout || 120000);
  }

  /**
   * Execute a task
   */
  async execute(task, options = {}) {
    return this._sendRequest({
      type: 'execute',
      task: {
        description: task.description,
        code: task.code,
        filePath: task.filePath,
        language: task.language,
        context: task.context,
        instructions: task.instructions
      },
      options: {
        model: options.model || 'kimi-2.5',
        temperature: options.temperature ?? 0.3
      }
    }, options.timeout || 300000);
  }

  /**
   * Get inline completion at cursor position
   * @param {Object} document - Document info { uri, languageId, content }
   * @param {Object} position - Cursor position { line, character }
   * @param {Object} options - Completion options
   */
  async inlineCompletion(document, position, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Kimi VSCode client not connected');
    }

    // Get context around cursor (respecting 256K limit)
    const contextWindow = this._extractContextWindow(document.content, position);
    
    // Get related files for cross-file context
    const relatedFiles = await this._getRelatedFiles(document.uri);

    return this._sendRequest({
      type: 'inlineCompletion',
      document: {
        uri: document.uri,
        languageId: document.languageId,
        prefix: contextWindow.prefix,
        suffix: contextWindow.suffix
      },
      position,
      relatedFiles,
      options: {
        maxLines: options.maxLines || 10,
        temperature: options.temperature ?? 0.2,
        language: options.language || this.languagePreference
      }
    }, options.timeout || 10000);
  }

  /**
   * Explain selected code
   * @param {Object} document - Document info
   * @param {Object} selection - Selection range { start, end, text }
   * @param {Object} options - Explanation options
   */
  async explainSelection(document, selection, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Kimi VSCode client not connected');
    }

    const language = options.language || this.languagePreference;
    const prompt = language === 'zh' 
      ? '请详细解释以下代码的功能、逻辑和实现细节：'
      : 'Please explain the functionality, logic, and implementation details of the following code:';

    return this._sendRequest({
      type: 'explain',
      document: {
        uri: document.uri,
        languageId: document.languageId
      },
      selection: {
        start: selection.start,
        end: selection.end,
        text: selection.text
      },
      context: options.context || {},
      prompt,
      options: {
        detail: options.detail || 'detailed', // 'brief', 'detailed', 'comprehensive'
        includeExamples: options.includeExamples ?? true,
        language
      }
    }, options.timeout || 30000);
  }

  /**
   * Generate tests for the current document
   * @param {Object} document - Document info
   * @param {Object} options - Test generation options
   */
  async generateTests(document, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Kimi VSCode client not connected');
    }

    const language = options.language || this.languagePreference;
    const prompt = language === 'zh'
      ? '为以下代码生成全面的单元测试，包括正常情况、边界情况和错误处理：'
      : 'Generate comprehensive unit tests for the following code, including normal cases, edge cases, and error handling:';

    // Get related files for context
    const relatedFiles = await this._getRelatedFiles(document.uri);

    return this._sendRequest({
      type: 'generateTests',
      document: {
        uri: document.uri,
        languageId: document.languageId,
        content: document.content
      },
      relatedFiles,
      prompt,
      options: {
        framework: options.framework || this._detectTestFramework(document.languageId),
        coverage: options.coverage || 'comprehensive', // 'basic', 'comprehensive', 'exhaustive'
        includeMocks: options.includeMocks ?? true,
        language
      }
    }, options.timeout || 60000);
  }

  /**
   * Optimize code performance
   * @param {string} code - Code to optimize
   * @param {Object} options - Optimization options
   */
  async optimizePerformance(code, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Kimi VSCode client not connected');
    }

    const language = options.language || this.languagePreference;
    const prompt = language === 'zh'
      ? '分析以下代码的性能瓶颈并提供优化建议，重点关注时间复杂度、空间复杂度和算法效率：'
      : 'Analyze performance bottlenecks in the following code and provide optimization suggestions, focusing on time complexity, space complexity, and algorithm efficiency:';

    return this._sendRequest({
      type: 'optimize',
      code,
      languageId: options.languageId,
      prompt,
      options: {
        focus: options.focus || ['time', 'memory', 'algorithm'], // optimization focus areas
        preserveSemantics: options.preserveSemantics ?? true,
        explainChanges: options.explainChanges ?? true,
        language
      }
    }, options.timeout || 45000);
  }

  /**
   * Perform security audit on code
   * @param {string} code - Code to audit
   * @param {Object} options - Audit options
   */
  async securityAudit(code, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Kimi VSCode client not connected');
    }

    const language = options.language || this.languagePreference;
    const prompt = language === 'zh'
      ? '对以下代码进行安全审计，识别潜在的安全漏洞、注入风险、敏感信息泄露和其他安全问题：'
      : 'Perform a security audit on the following code, identifying potential security vulnerabilities, injection risks, sensitive information leaks, and other security issues:';

    return this._sendRequest({
      type: 'securityAudit',
      code,
      languageId: options.languageId,
      prompt,
      options: {
        severity: options.severity || 'all', // 'critical', 'high', 'medium', 'low', 'all'
        categories: options.categories || ['injection', 'xss', 'secrets', 'auth', 'validation'],
        includeFixes: options.includeFixes ?? true,
        language
      }
    }, options.timeout || 45000);
  }

  /**
   * Analyze file tree structure
   * @param {Object} options - Analysis options
   */
  async analyzeFileTree(options = {}) {
    if (!this.fileTree) {
      await this._initializeContext();
    }

    return this._sendRequest({
      type: 'analyzeFileTree',
      fileTree: this.fileTree,
      workspaceRoot: this.workspaceRoot,
      options: {
        maxDepth: options.maxDepth || 5,
        includePatterns: options.includePatterns || ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'],
        excludePatterns: options.excludePatterns || ['node_modules/**', '.git/**', 'dist/**'],
        language: options.language || this.languagePreference
      }
    }, options.timeout || 30000);
  }

  /**
   * Get cross-file references
   * @param {string} filePath - File to get references for
   * @param {Object} options - Options
   */
  async getCrossFileReferences(filePath, options = {}) {
    const cached = this.crossFileRefs.get(filePath);
    
    if (cached && !options.forceRefresh) {
      return { references: cached, cached: true };
    }

    const result = await this._sendRequest({
      type: 'getCrossFileReferences',
      filePath,
      options: {
        includeImports: options.includeImports ?? true,
        includeExports: options.includeExports ?? true,
        includeUsages: options.includeUsages ?? true,
        maxDepth: options.maxDepth || 2
      }
    }, options.timeout || 20000);

    // Cache the result
    this.crossFileRefs.set(filePath, result.references || []);
    
    return result;
  }

  /**
   * Create CogniMesh task from code
   * @param {Object} taskData - Task data
   * @param {Object} options - Options
   */
  async createCogniMeshTask(taskData, options = {}) {
    if (!this.cogniMeshEnabled) {
      throw new Error('CogniMesh integration is disabled');
    }

    const language = options.language || this.languagePreference;

    return this._sendRequest({
      type: 'cogniMesh',
      action: 'createTask',
      task: {
        title: taskData.title,
        description: taskData.description,
        code: taskData.code,
        filePath: taskData.filePath,
        priority: taskData.priority || 'medium',
        tags: taskData.tags || [],
        assignee: taskData.assignee
      },
      options: {
        createRoadmap: options.createRoadmap ?? false,
        gsdWorkflow: options.gsdWorkflow ?? true,
        language
      }
    }, options.timeout || 15000);
  }

  /**
   * Integrate with CogniMesh roadmap
   * @param {Object} roadmapData - Roadmap data
   * @param {Object} options - Options
   */
  async integrateRoadmap(roadmapData, options = {}) {
    if (!this.cogniMeshEnabled) {
      throw new Error('CogniMesh integration is disabled');
    }

    return this._sendRequest({
      type: 'cogniMesh',
      action: 'integrateRoadmap',
      roadmap: roadmapData,
      options: {
        syncMode: options.syncMode || 'bidirectional', // 'toCogniMesh', 'fromCogniMesh', 'bidirectional'
        autoCreateTasks: options.autoCreateTasks ?? true,
        language: options.language || this.languagePreference
      }
    }, options.timeout || 20000);
  }

  /**
   * Support GSD workflow
   * @param {Object} gsdData - GSD workflow data
   * @param {Object} options - Options
   */
  async supportGSDWorkflow(gsdData, options = {}) {
    if (!this.cogniMeshEnabled) {
      throw new Error('CogniMesh integration is disabled');
    }

    return this._sendRequest({
      type: 'cogniMesh',
      action: 'gsdWorkflow',
      gsd: {
        phase: gsdData.phase, // 'plan', 'execute', 'review', 'deliver'
        tasks: gsdData.tasks,
        context: gsdData.context,
        goal: gsdData.goal
      },
      options: {
        autoSuggest: options.autoSuggest ?? true,
        trackProgress: options.trackProgress ?? true,
        language: options.language || this.languagePreference
      }
    }, options.timeout || 30000);
  }

  /**
   * Get client capabilities
   */
  getCapabilities() {
    return {
      provider: 'kimi',
      mode: 'vscode',
      contextWindow: this.contextWindow,
      features: [
        'inline_completion',
        'chat',
        'explain',
        'generate_tests',
        'optimize_performance',
        'security_audit',
        'file_tree_analysis',
        'cross_file_references',
        'bilingual_support',
        'cogni_mesh_integration'
      ],
      streaming: true,
      supportsFiles: true,
      supportsEditorContext: true,
      supportsGSD: true,
      supportsRoadmap: true,
      languages: ['zh', 'en', 'auto'],
      models: ['kimi-2.5', 'kimi-2.0', 'moonshot-v1-128k']
    };
  }

  /**
   * Internal ping implementation
   * @private
   */
  async _doPing() {
    return this._sendRequest({ type: 'ping' }, 5000);
  }

  /**
   * Build context for requests
   * @private
   */
  _buildContext(options = {}) {
    return {
      fileTree: options.includeFileTree ? this.fileTree : undefined,
      crossFileRefs: options.includeCrossRefs 
        ? Object.fromEntries(this.crossFileRefs) 
        : undefined,
      workspaceRoot: this.workspaceRoot,
      language: options.language || this.languagePreference
    };
  }

  /**
   * Extract context window around position
   * @private
   */
  _extractContextWindow(content, position, maxChars = 50000) {
    const lines = content.split('\n');
    const cursorLine = position.line;
    
    // Calculate prefix
    let prefixLines = [];
    let prefixChars = 0;
    for (let i = cursorLine; i >= 0 && prefixChars < maxChars / 2; i--) {
      const line = lines[i] || '';
      prefixLines.unshift(line);
      prefixChars += line.length + 1;
    }
    
    // Calculate suffix
    let suffixLines = [];
    let suffixChars = 0;
    for (let i = cursorLine + 1; i < lines.length && suffixChars < maxChars / 2; i++) {
      const line = lines[i] || '';
      suffixLines.push(line);
      suffixChars += line.length + 1;
    }
    
    return {
      prefix: prefixLines.join('\n'),
      suffix: suffixLines.join('\n'),
      cursorLine
    };
  }

  /**
   * Get related files for cross-file context
   * @private
   */
  async _getRelatedFiles(fileUri) {
    const refs = this.crossFileRefs.get(fileUri) || [];
    return refs.slice(0, 10); // Limit to 10 related files
  }

  /**
   * Detect test framework for language
   * @private
   */
  _detectTestFramework(languageId) {
    const frameworks = {
      javascript: 'jest',
      typescript: 'jest',
      python: 'pytest',
      java: 'junit',
      go: 'testing',
      rust: 'cargo-test',
      ruby: 'rspec'
    };
    return frameworks[languageId] || 'generic';
  }

  /**
   * Update CogniMesh context on file changes
   * @private
   */
  async _updateCogniMeshContext(message) {
    try {
      await this._sendRequest({
        type: 'cogniMesh',
        action: 'contextUpdate',
        change: {
          type: message.changeType,
          filePath: message.filePath,
          timestamp: Date.now()
        }
      }, 5000);
    } catch (error) {
      // Silent fail - don't block file operations
      this.emit('warning', { message: 'CogniMesh context update failed', error: error.message });
    }
  }

  /**
   * Reconnect the client
   */
  async reconnect() {
    this.status = 'reconnecting';
    this.emit('reconnecting');
    
    try {
      if (this.socket) {
        this.socket.destroy();
        this.socket = null;
      }
      
      await this.initialize();
      this.health.reconnectAttempts = 0;
      this.emit('reconnected');
    } catch (error) {
      this.health.reconnectAttempts++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect the client
   */
  async disconnect() {
    if (this.socket) {
      this.socket.end();
      this.socket.destroy();
      this.socket = null;
    }
    
    // Clear all pending requests
    for (const [, { reject, timeout }] of this.responseHandlers) {
      clearTimeout(timeout);
      reject(new Error('Client disconnected'));
    }
    this.responseHandlers.clear();
    
    this.fileTree = null;
    this.crossFileRefs.clear();
    
    await super.disconnect();
  }
}

export default KimiVSCodeClient;
