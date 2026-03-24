/**
 * Kimi IDE Integration
 * IDE integration with TCP socket communication
 * 
 * Features:
 * - TCP socket communication (port 18123)
 * - Inline completion
 * - Cross-file references
 * - Bilingual support (zh/en)
 * - Code explanation
 * - Test generation
 * - Performance optimization
 * - Security audit
 * 
 * @module models/kimi/kimi-ide
 */

import { KimiClient } from './kimi-client.js';
import net from 'net';
import http from 'http';
import { existsSync, readFileSync } from 'fs';
import { extname, basename, relative, dirname, join } from 'path';

/**
 * KimiIDEClient - IDE integration for Kimi Code
 * @extends KimiClient
 */
export class KimiIDEClient extends KimiClient {
  constructor(options = {}) {
    super({
      ...options,
      features: {
        longContext: true,
        thinkingMode: true,
        multimodal: false, // IDE usually doesn't need multimodal
        chineseOptimization: true,
        streaming: true,
        contextCaching: true,
        ...options.features
      }
    });

    // TCP Socket configuration
    this.port = options.port || 18123;
    this.host = options.host || 'localhost';
    this.socket = null;

    // Request handling
    this.responseHandlers = new Map();
    this.requestId = 0;
    this.messageQueue = [];

    // IDE context
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.fileTree = null;
    this.crossFileRefs = new Map();
    this.openFiles = new Set();

    // Language preference
    this.languagePreference = options.language || 'auto'; // 'zh', 'en', 'auto'

    // Editor state
    this.currentFile = null;
    this.cursorPosition = null;
    this.selection = null;

    // Completion cache
    this.completionCache = new Map();
    this.completionCacheExpiry = 30000; // 30 seconds

    // CogniMesh integration
    this.cogniMeshEnabled = options.cogniMeshEnabled ?? true;
  }

  /**
   * Initialize IDE client
   */
  async initialize() {
    this.emit('initializing');

    try {
      // Check if Kimi extension is running
      await this._checkExtensionHealth();

      // Connect via TCP socket
      await this._connectSocket();

      // Initialize IDE context
      await this._initializeContext();

      this.emit('ready');
      return true;
    } catch (error) {
      // Fall back to standard API mode
      this.emit('warning', { 
        message: 'IDE extension not available, falling back to API mode',
        error: error.message 
      });
      
      await super.initialize();
      this.useFallback = true;
      
      this.emit('ready', { mode: 'fallback' });
      return true;
    }
  }

  /**
   * Check extension health via HTTP
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
        resolve();
      });

      this.socket.on('data', (data) => {
        this._handleSocketData(data);
      });

      this.socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.socket.on('close', () => {
        this.emit('disconnected');
      });
    });
  }

  /**
   * Handle socket data
   * @private
   */
  _handleSocketData(data) {
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
   * Initialize IDE context
   * @private
   */
  async _initializeContext() {
    try {
      // Request file tree
      const fileTree = await this._sendSocketRequest({
        type: 'getFileTree',
        workspaceRoot: this.workspaceRoot
      }, 15000);

      this.fileTree = fileTree;

      // Load cross-file references
      await this._loadCrossFileReferences();
    } catch (error) {
      this.emit('warning', { message: 'Failed to initialize IDE context', error: error.message });
    }
  }

  /**
   * Load cross-file references
   * @private
   */
  async _loadCrossFileReferences() {
    try {
      const refs = await this._sendSocketRequest({
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
   * Send request via socket
   * @private
   */
  _sendSocketRequest(payload, timeoutMs = 60000) {
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
   * Handle file change notification
   * @private
   */
  _handleFileChange(message) {
    this.emit('fileChange', message);

    // Update cross-file references if needed
    if (message.requiresRefUpdate) {
      this._loadCrossFileReferences();
    }

    // Invalidate completion cache for changed file
    this.completionCache.delete(message.filePath);

    // Update CogniMesh context
    if (this.cogniMeshEnabled) {
      this._updateCogniMeshContext(message);
    }
  }

  // ============================================================================
  // INLINE COMPLETION
  // ============================================================================

  /**
   * Get inline completion at cursor position
   * @param {Object} document - Document info
   * @param {string} document.uri - Document URI
   * @param {string} document.languageId - Language ID
   * @param {string} document.content - Document content
   * @param {Object} position - Cursor position { line, character }
   * @param {Object} options - Completion options
   * @param {number} [options.maxLines] - Maximum lines to suggest
   * @param {boolean} [options.includeRelatedFiles] - Include related files context
   */
  async inlineCompletion(document, position, options = {}) {
    if (this.useFallback) {
      return this._fallbackCompletion(document, position, options);
    }

    // Check cache
    const cacheKey = this._getCompletionCacheKey(document.uri, position);
    const cached = this.completionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.completionCacheExpiry) {
      return cached.result;
    }

    // Extract context window
    const contextWindow = this._extractContextWindow(document.content, position);

    // Get related files
    const relatedFiles = options.includeRelatedFiles !== false
      ? await this._getRelatedFiles(document.uri)
      : [];

    const result = await this._sendSocketRequest({
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

    // Cache result
    this.completionCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * Fallback completion using API
   * @private
   */
  async _fallbackCompletion(document, position, options) {
    const contextWindow = this._extractContextWindow(document.content, position);

    const prompt = this._buildCompletionPrompt(
      contextWindow.prefix,
      contextWindow.suffix,
      document.languageId
    );

    const response = await this.send(prompt, {
      maxTokens: options.maxTokens || 500,
      temperature: options.temperature ?? 0.2,
      system: `You are a code completion engine. Continue the code naturally. Only output the completion, no explanations.`
    });

    return {
      completions: [{
        text: response.content,
        position
      }]
    };
  }

  /**
   * Build completion prompt
   * @private
   */
  _buildCompletionPrompt(prefix, suffix, language) {
    return `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
  }

  /**
   * Extract context window around position
   * @private
   */
  _extractContextWindow(content, position, maxChars = 10000) {
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

    // Add current line prefix up to cursor
    const currentLine = lines[cursorLine] || '';
    const linePrefix = currentLine.substring(0, position.character);
    if (linePrefix) {
      prefixLines.push(linePrefix);
    }

    // Current line suffix from cursor
    const lineSuffix = currentLine.substring(position.character);
    if (lineSuffix) {
      suffixLines.unshift(lineSuffix);
    }

    return {
      prefix: prefixLines.join('\n'),
      suffix: suffixLines.join('\n'),
      cursorLine,
      cursorChar: position.character
    };
  }

  /**
   * Get completion cache key
   * @private
   */
  _getCompletionCacheKey(uri, position) {
    return `${uri}:${position.line}:${position.character}`;
  }

  // ============================================================================
  // CODE EXPLANATION
  // ============================================================================

  /**
   * Explain selected code
   * @param {Object} document - Document info
   * @param {Object} selection - Selection range
   * @param {Object} options - Explanation options
   * @param {string} [options.detail] - Detail level ('brief', 'detailed', 'comprehensive')
   * @param {boolean} [options.includeExamples] - Include usage examples
   */
  async explainSelection(document, selection, options = {}) {
    const language = this._resolveLanguage(options.language);
    
    const prompt = language === 'zh'
      ? '请详细解释以下代码的功能、逻辑和实现细节：'
      : 'Please explain the functionality, logic, and implementation details of the following code:';

    if (this.useFallback) {
      return this._fallbackExplanation(document, selection, prompt, options);
    }

    return this._sendSocketRequest({
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
      prompt,
      options: {
        detail: options.detail || 'detailed',
        includeExamples: options.includeExamples ?? true,
        language
      }
    }, options.timeout || 30000);
  }

  /**
   * Fallback explanation using API
   * @private
   */
  async _fallbackExplanation(document, selection, prompt, options) {
    const fullPrompt = `${prompt}\n\n\`\`\`${document.languageId}\n${selection.text}\n\`\`\``;

    const response = await this.send(fullPrompt, {
      maxTokens: options.maxTokens || 2048,
      temperature: 0.3
    });

    return {
      explanation: response.content,
      detail: options.detail || 'detailed'
    };
  }

  // ============================================================================
  // TEST GENERATION
  // ============================================================================

  /**
   * Generate tests for code
   * @param {Object} document - Document info
   * @param {Object} options - Test generation options
   * @param {string} [options.framework] - Test framework
   * @param {string} [options.coverage] - Coverage level ('basic', 'comprehensive', 'exhaustive')
   */
  async generateTests(document, options = {}) {
    const language = this._resolveLanguage(options.language);
    
    const prompt = language === 'zh'
      ? '为以下代码生成全面的单元测试，包括正常情况、边界情况和错误处理：'
      : 'Generate comprehensive unit tests for the following code, including normal cases, edge cases, and error handling:';

    const relatedFiles = await this._getRelatedFiles(document.uri);

    if (this.useFallback) {
      return this._fallbackTestGeneration(document, prompt, relatedFiles, options);
    }

    return this._sendSocketRequest({
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
        coverage: options.coverage || 'comprehensive',
        includeMocks: options.includeMocks ?? true,
        language
      }
    }, options.timeout || 60000);
  }

  /**
   * Fallback test generation using API
   * @private
   */
  async _fallbackTestGeneration(document, prompt, relatedFiles, options) {
    const framework = options.framework || this._detectTestFramework(document.languageId);
    
    const fullPrompt = `${prompt}\n\nFile: ${document.uri}\nFramework: ${framework}\n\n\`\`\`${document.languageId}\n${document.content}\n\`\`\``;

    const response = await this.send(fullPrompt, {
      maxTokens: options.maxTokens || 4096,
      temperature: 0.3,
      system: `Generate ${options.coverage || 'comprehensive'} unit tests using ${framework}. Include setup, test cases, and assertions.`
    });

    return {
      tests: response.content,
      framework,
      filePath: this._getTestFilePath(document.uri, framework)
    };
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
      ruby: 'rspec',
      php: 'phpunit'
    };
    return frameworks[languageId] || 'generic';
  }

  /**
   * Get test file path
   * @private
   */
  _getTestFilePath(sourcePath, framework) {
    const dir = dirname(sourcePath);
    const base = basename(sourcePath, extname(sourcePath));
    const ext = extname(sourcePath);

    // Common test file patterns
    const patterns = {
      jest: `${base}.test${ext}`,
      pytest: `test_${base}${ext}`,
      generic: `${base}_test${ext}`
    };

    return join(dir, patterns[framework] || patterns.generic);
  }

  // ============================================================================
  // PERFORMANCE OPTIMIZATION
  // ============================================================================

  /**
   * Optimize code performance
   * @param {string} code - Code to optimize
   * @param {Object} options - Optimization options
   * @param {Array<string>} [options.focus] - Focus areas ('time', 'memory', 'algorithm')
   */
  async optimizePerformance(code, options = {}) {
    const language = this._resolveLanguage(options.language);
    
    const prompt = language === 'zh'
      ? '分析以下代码的性能瓶颈并提供优化建议，重点关注时间复杂度、空间复杂度和算法效率：'
      : 'Analyze performance bottlenecks in the following code and provide optimization suggestions, focusing on time complexity, space complexity, and algorithm efficiency:';

    const fullPrompt = `${prompt}\n\n\`\`\`${options.languageId || ''}\n${code}\n\`\`\``;

    const response = await this.send(fullPrompt, {
      maxTokens: options.maxTokens || 4096,
      temperature: 0.3,
      system: `Provide specific, actionable performance optimizations. Include before/after code comparisons and explain the improvements.`
    });

    return {
      optimizations: response.content,
      focus: options.focus || ['time', 'memory', 'algorithm']
    };
  }

  // ============================================================================
  // SECURITY AUDIT
  // ============================================================================

  /**
   * Perform security audit on code
   * @param {string} code - Code to audit
   * @param {Object} options - Audit options
   * @param {string} [options.severity] - Minimum severity ('critical', 'high', 'medium', 'low', 'all')
   * @param {Array<string>} [options.categories] - Categories to check
   */
  async securityAudit(code, options = {}) {
    const language = this._resolveLanguage(options.language);
    
    const prompt = language === 'zh'
      ? '对以下代码进行安全审计，识别潜在的安全漏洞、注入风险、敏感信息泄露和其他安全问题：'
      : 'Perform a security audit on the following code, identifying potential security vulnerabilities, injection risks, sensitive information leaks, and other security issues:';

    const fullPrompt = `${prompt}\n\n\`\`\`${options.languageId || ''}\n${code}\n\`\`\``;

    const response = await this.send(fullPrompt, {
      maxTokens: options.maxTokens || 4096,
      temperature: 0.2,
      system: `Perform a thorough security audit. For each issue found, provide:
1. Severity level
2. Issue description
3. Location in code
4. Potential impact
5. Recommended fix with code example`
    });

    return {
      audit: response.content,
      severity: options.severity || 'all',
      categories: options.categories || ['injection', 'xss', 'secrets', 'auth', 'validation']
    };
  }

  // ============================================================================
  // CROSS-FILE REFERENCES
  // ============================================================================

  /**
   * Get cross-file references
   * @param {string} filePath - File to get references for
   * @param {Object} options - Options
   */
  async getCrossFileReferences(filePath, options = {}) {
    // Check cache first
    const cached = this.crossFileRefs.get(filePath);
    if (cached && !options.forceRefresh) {
      return { references: cached, cached: true };
    }

    if (this.useFallback) {
      return { references: [], cached: false, fallback: true };
    }

    const result = await this._sendSocketRequest({
      type: 'getCrossFileReferences',
      filePath,
      options: {
        includeImports: options.includeImports ?? true,
        includeExports: options.includeExports ?? true,
        includeUsages: options.includeUsages ?? true,
        maxDepth: options.maxDepth || 2
      }
    }, options.timeout || 20000);

    // Cache result
    this.crossFileRefs.set(filePath, result.references || []);

    return result;
  }

  /**
   * Get related files for context
   * @private
   */
  async _getRelatedFiles(fileUri) {
    const refs = this.crossFileRefs.get(fileUri) || [];
    
    // Load content of related files (limit to 10)
    const relatedFiles = [];
    for (const ref of refs.slice(0, 10)) {
      try {
        if (existsSync(ref.path)) {
          const content = readFileSync(ref.path, 'utf-8');
          relatedFiles.push({
            path: ref.path,
            content: content.substring(0, 5000), // Limit content
            relationship: ref.type
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return relatedFiles;
  }

  // ============================================================================
  // BILINGUAL SUPPORT
  // ============================================================================

  /**
   * Resolve language preference
   * @private
   */
  _resolveLanguage(preferred) {
    if (preferred && preferred !== 'auto') {
      return preferred;
    }
    return this.languagePreference === 'auto' ? 'en' : this.languagePreference;
  }

  /**
   * Set language preference
   * @param {string} language - 'zh', 'en', or 'auto'
   */
  setLanguagePreference(language) {
    this.languagePreference = language;
  }

  // ============================================================================
  // COGNIMESH INTEGRATION
  // ============================================================================

  /**
   * Update CogniMesh context
   * @private
   */
  async _updateCogniMeshContext(message) {
    try {
      await this._sendSocketRequest({
        type: 'cogniMesh',
        action: 'contextUpdate',
        change: {
          type: message.changeType,
          filePath: message.filePath,
          timestamp: Date.now()
        }
      }, 5000);
    } catch (error) {
      // Silent fail
      this.emit('warning', { message: 'CogniMesh context update failed', error: error.message });
    }
  }

  /**
   * Create CogniMesh task from IDE
   * @param {Object} taskData - Task data
   */
  async createCogniMeshTask(taskData, options = {}) {
    if (this.useFallback) {
      throw new Error('CogniMesh integration requires IDE extension');
    }

    const language = this._resolveLanguage(options.language);

    return this._sendSocketRequest({
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

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Set current editor state
   * @param {Object} state - Editor state
   */
  setEditorState(state) {
    if (state.file) this.currentFile = state.file;
    if (state.position) this.cursorPosition = state.position;
    if (state.selection) this.selection = state.selection;
  }

  /**
   * Get IDE capabilities
   */
  getCapabilities() {
    return {
      ...super.getCapabilities(),
      mode: 'ide',
      features: [
        ...super.getCapabilities().features,
        'inline_completion',
        'code_explanation',
        'test_generation',
        'performance_optimization',
        'security_audit',
        'cross_file_references',
        'bilingual_support',
        'cogni_mesh_integration'
      ],
      ideFeatures: {
        tcpSocket: true,
        port: this.port,
        supportsStreaming: true,
        maxCompletions: 10,
        languages: ['zh', 'en', 'auto']
      },
      workspace: {
        root: this.workspaceRoot,
        hasFileTree: !!this.fileTree
      }
    };
  }

  /**
   * Disconnect IDE client
   */
  async disconnect() {
    if (this.socket) {
      this.socket.end();
      this.socket.destroy();
      this.socket = null;
    }

    // Clear pending requests
    for (const [id, { reject, timeout }] of this.responseHandlers) {
      clearTimeout(timeout);
      reject(new Error('Client disconnected'));
    }
    this.responseHandlers.clear();

    this.fileTree = null;
    this.crossFileRefs.clear();
    this.completionCache.clear();

    await super.close();
  }
}

export default KimiIDEClient;
