/**
 * GPT 5.4 Codex VSCode Extension Client
 * Advanced IDE integration with context-aware features, multi-file refactoring,
 * architecture suggestions, performance optimization, and security analysis
 */

import { BaseClient } from '../base-client.js';
import net from 'net';
import http from 'http';
import crypto from 'crypto';

export class GPT54CodexVSCodeClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'codex',
      mode: 'vscode',
      name: config.name || 'GPT-5.4-Codex-VSCode'
    });
    this.port = config.port || 8443;
    this.host = config.host || 'localhost';
    this.apiEndpoint = config.apiEndpoint || `http://${this.host}:${this.port}`;
    this.socket = null;
    this.responseHandlers = new Map();
    this.requestId = 0;
    
    // GPT 5.4 specific features
    this.contextWindow = config.contextWindow || 256000;
    this.enableAdvancedIntelliSense = config.enableAdvancedIntelliSense ?? true;
    this.enableSmartRefactoring = config.enableSmartRefactoring ?? true;
    this.enableArchitectureSuggestions = config.enableArchitectureSuggestions ?? true;
    this.enablePerformanceOptimization = config.enablePerformanceOptimization ?? true;
    this.enableSecurityAnalysis = config.enableSecurityAnalysis ?? true;
    this.enableMultiFileContext = config.enableMultiFileContext ?? true;
    
    // Project context cache
    this.projectContext = new Map();
    this.fileCache = new Map();
    this.analysisCache = new Map();
  }

  /**
   * Initialize the VSCode client connection
   */
  async initialize() {
    this.status = 'initializing';
    this.emit('initializing');

    try {
      // Check VSCode extension health
      await this._checkVSCodeHealth();

      // Connect to VSCode socket
      await this._connectSocket();

      // Initialize GPT 5.4 capabilities
      await this._initializeCapabilities();

      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready');
      
      return {
        success: true,
        port: this.port,
        capabilities: this.getCapabilities()
      };
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Check VSCode extension API health
   */
  _checkVSCodeHealth() {
    return new Promise((resolve, reject) => {
      const req = http.get(`${this.apiEndpoint}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const health = JSON.parse(data);
              resolve(health);
            } catch {
              resolve({ status: 'ok' });
            }
          } else {
            reject(new Error(`VSCode extension not responding: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`VSCode extension not running on port ${this.port}: ${error.message}`));
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('VSCode health check timeout'));
      });
    });
  }

  /**
   * Connect to VSCode extension socket
   */
  _connectSocket() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('VSCode socket connection timeout'));
      }, 10000);

      this.socket = net.connect({ port: this.port + 1, host: this.host });

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket.on('data', (data) => {
        this._handleData(data);
      });

      this.socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.socket.on('close', () => {
        this.updateHealth({ connected: false });
        this.emit('disconnected');
      });
    });
  }

  /**
   * Initialize GPT 5.4 capabilities
   */
  async _initializeCapabilities() {
    return this._sendRequest({
      type: 'initialize',
      capabilities: {
        contextWindow: this.contextWindow,
        advancedIntelliSense: this.enableAdvancedIntelliSense,
        smartRefactoring: this.enableSmartRefactoring,
        architectureSuggestions: this.enableArchitectureSuggestions,
        performanceOptimization: this.enablePerformanceOptimization,
        securityAnalysis: this.enableSecurityAnalysis,
        multiFileContext: this.enableMultiFileContext
      }
    });
  }

  _handleData(data) {
    try {
      const lines = data.toString().split('\n').filter(Boolean);

      for (const line of lines) {
        const message = JSON.parse(line);

        if (message.id && this.responseHandlers.has(message.id)) {
          const { resolve, reject } = this.responseHandlers.get(message.id);
          this.responseHandlers.delete(message.id);

          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message);
          }
        } else if (message.type === 'progress') {
          this.emit('progress', message);
        } else if (message.type === 'notification') {
          this.emit('notification', message);
        } else if (message.type === 'suggestion') {
          this.emit('suggestion', message);
        }
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Send request to VSCode extension
   */
  _sendRequest(payload, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      this.responseHandlers.set(id, { resolve, reject });

      const message = { id, ...payload };
      this.socket.write(JSON.stringify(message) + '\n');

      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Request timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Advanced IntelliSense with context-aware suggestions
   */
  async advancedIntelliSense(document, position) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    if (!this.enableAdvancedIntelliSense) {
      throw new Error('Advanced IntelliSense is disabled');
    }

    return this._sendRequest({
      type: 'advancedIntelliSense',
      document: {
        uri: document.uri,
        languageId: document.languageId,
        version: document.version,
        content: document.content
      },
      position: {
        line: position.line,
        character: position.character
      },
      context: await this._getDocumentContext(document)
    }, 30000);
  }

  /**
   * Smart refactoring across single or multiple files
   */
  async smartRefactoring(document, operation) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    if (!this.enableSmartRefactoring) {
      throw new Error('Smart refactoring is disabled');
    }

    const payload = {
      type: 'smartRefactoring',
      operation: {
        type: operation.type, // 'extract', 'rename', 'inline', 'move', 'restructure'
        target: operation.target,
        options: operation.options || {}
      },
      document: {
        uri: document.uri,
        content: document.content,
        languageId: document.languageId
      }
    };

    // Add multi-file context if available
    if (this.enableMultiFileContext && operation.relatedFiles) {
      payload.relatedFiles = await this._fetchRelatedFiles(operation.relatedFiles);
    }

    return this._sendRequest(payload, 120000);
  }

  /**
   * Get architecture suggestions for the project
   */
  async architectureSuggestions(project) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    if (!this.enableArchitectureSuggestions) {
      throw new Error('Architecture suggestions are disabled');
    }

    const projectContext = await this._analyzeProjectContext(project);

    return this._sendRequest({
      type: 'architectureSuggestions',
      project: {
        name: project.name,
        rootPath: project.rootPath,
        structure: projectContext.structure,
        dependencies: projectContext.dependencies,
        entryPoints: projectContext.entryPoints,
        modules: projectContext.modules
      },
      focus: project.focus || 'general' // 'scalability', 'maintainability', 'performance', 'security'
    }, 180000);
  }

  /**
   * Performance optimization analysis
   */
  async performanceOptimization(document) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    if (!this.enablePerformanceOptimization) {
      throw new Error('Performance optimization is disabled');
    }

    const cacheKey = `${document.uri}_${document.version}`;
    
    // Check cache
    if (this.analysisCache.has(cacheKey)) {
      const cached = this.analysisCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) { // 5 min cache
        return cached.result;
      }
    }

    const result = await this._sendRequest({
      type: 'performanceOptimization',
      document: {
        uri: document.uri,
        content: document.content,
        languageId: document.languageId
      },
      analysisType: document.analysisType || 'full' // 'full', 'bottlenecks', 'memory', 'cpu'
    }, 60000);

    // Cache result
    this.analysisCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * Security analysis of code
   */
  async securityAnalysis(document) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    if (!this.enableSecurityAnalysis) {
      throw new Error('Security analysis is disabled');
    }

    return this._sendRequest({
      type: 'securityAnalysis',
      document: {
        uri: document.uri,
        content: document.content,
        languageId: document.languageId
      },
      analysisLevel: document.analysisLevel || 'standard', // 'basic', 'standard', 'deep'
      focusAreas: document.focusAreas || ['vulnerabilities', 'secrets', 'dependencies']
    }, 90000);
  }

  /**
   * Multi-file refactoring operation
   */
  async multiFileRefactoring(instruction, files, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    if (!this.enableMultiFileContext) {
      throw new Error('Multi-file context is disabled');
    }

    const fileContents = await Promise.all(
      files.map(async (f) => ({
        path: f.path,
        content: f.content || await this._readFileContent(f.path),
        languageId: f.languageId
      }))
    );

    return this._sendRequest({
      type: 'multiFileRefactoring',
      instruction,
      files: fileContents,
      options: {
        autoApply: options.autoApply ?? false,
        reviewChanges: options.reviewChanges ?? true,
        createBackup: options.createBackup ?? true,
        preserveFormatting: options.preserveFormatting ?? true
      }
    }, 300000);
  }

  /**
   * Generate smart code completion
   */
  async smartCompletion(filePath, position, context, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    return this._sendRequest({
      type: 'smartCompletion',
      filePath,
      position: {
        line: position.line,
        character: position.character
      },
      context: {
        prefix: context.prefix,
        suffix: context.suffix,
        languageId: context.languageId,
        imports: context.imports,
        symbols: context.symbols
      },
      options: {
        maxTokens: options.maxTokens || 256,
        temperature: options.temperature ?? 0.1,
        contextAware: options.contextAware ?? true
      }
    }, 15000);
  }

  /**
   * Get architecture view of the project
   */
  async getArchitectureView(projectPath, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    return this._sendRequest({
      type: 'architectureView',
      projectPath,
      options: {
        includeDependencies: options.includeDependencies ?? true,
        includeMetrics: options.includeMetrics ?? true,
        detailLevel: options.detailLevel || 'medium', // 'low', 'medium', 'high'
        format: options.format || 'graph' // 'graph', 'tree', 'list'
      }
    }, 60000);
  }

  /**
   * Get performance insights for the project
   */
  async getPerformanceInsights(projectPath, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    return this._sendRequest({
      type: 'performanceInsights',
      projectPath,
      options: {
        scope: options.scope || 'project', // 'file', 'module', 'project'
        metrics: options.metrics || ['time', 'memory', 'complexity'],
        baseline: options.baseline
      }
    }, 120000);
  }

  /**
   * Create task/roadmap from code analysis
   */
  async createTaskFromAnalysis(analysis, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    return this._sendRequest({
      type: 'createTaskFromAnalysis',
      analysis: {
        type: analysis.type, // 'refactor', 'optimize', 'secure', 'implement'
        target: analysis.target,
        findings: analysis.findings,
        priority: analysis.priority || 'medium'
      },
      options: {
        autoCreate: options.autoCreate ?? false,
        assignTo: options.assignTo,
        tags: options.tags || [],
        dueDate: options.dueDate
      }
    }, 30000);
  }

  /**
   * Integrate with CogniMesh dashboard
   */
  async syncWithDashboard(data, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    return this._sendRequest({
      type: 'syncWithDashboard',
      data: {
        metrics: data.metrics,
        tasks: data.tasks,
        insights: data.insights,
        timestamp: new Date().toISOString()
      },
      options: {
        syncType: options.syncType || 'full', // 'full', 'incremental'
        targetEndpoint: options.targetEndpoint
      }
    }, 30000);
  }

  /**
   * Manage agent pool for distributed tasks
   */
  async manageAgentPool(action, agents, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    return this._sendRequest({
      type: 'manageAgentPool',
      action, // 'spawn', 'terminate', 'scale', 'status'
      agents: agents.map(a => ({
        id: a.id || crypto.randomUUID(),
        type: a.type,
        config: a.config
      })),
      options: {
        priority: options.priority || 'normal',
        timeout: options.timeout || 60000
      }
    }, 60000);
  }

  // Helper methods

  async _getDocumentContext(document) {
    // Extract imports, symbols, and references
    return {
      imports: document.imports || [],
      symbols: document.symbols || [],
      references: document.references || [],
      languageId: document.languageId
    };
  }

  async _fetchRelatedFiles(filePaths) {
    const files = [];
    for (const path of filePaths) {
      try {
        const content = await this._readFileContent(path);
        files.push({ path, content });
      } catch (error) {
        this.emit('warning', { message: `Could not read file: ${path}`, error: error.message });
      }
    }
    return files;
  }

  async _readFileContent(filePath) {
    // This would typically use VSCode's filesystem API
    // For now, return a placeholder that VSCode extension will resolve
    return null;
  }

  async _analyzeProjectContext(project) {
    // Analyze project structure, dependencies, entry points
    return {
      structure: project.structure || {},
      dependencies: project.dependencies || [],
      entryPoints: project.entryPoints || [],
      modules: project.modules || []
    };
  }

  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    return this._sendRequest({
      type: 'chat',
      content: message.content,
      context: message.context,
      options: {
        model: options.model || 'gpt-5.4-codex',
        temperature: options.temperature ?? 0.1,
        maxTokens: options.maxTokens || 4096,
        stream: options.stream ?? false
      }
    }, options.timeout || 120000);
  }

  async execute(task, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 VSCode client not connected');
    }

    return this._sendRequest({
      type: 'execute',
      task: {
        description: task.description,
        code: task.code,
        filePath: task.filePath,
        language: task.language,
        mode: task.mode || 'edit',
        context: task.context
      },
      options: {
        autoApply: options.autoApply ?? false,
        reviewChanges: options.reviewChanges ?? true
      }
    }, options.timeout || 300000);
  }

  getCapabilities() {
    return {
      provider: 'codex',
      mode: 'vscode',
      version: '5.4',
      contextWindow: this.contextWindow,
      features: [
        'chat',
        'advanced_intellisense',
        'smart_refactoring',
        'multi_file_refactoring',
        'smart_completion',
        'architecture_suggestions',
        'architecture_view',
        'performance_optimization',
        'performance_insights',
        'security_analysis',
        'task_creation',
        'dashboard_sync',
        'agent_pool_management',
        'inline_completion',
        'code_explanation',
        'test_generation',
        'documentation_generation'
      ],
      streaming: true,
      supportsFiles: true,
      supportsMultiFileContext: this.enableMultiFileContext,
      supportsComposer: true,
      supportsEditorContext: true,
      ideFeatures: {
        advancedIntelliSense: this.enableAdvancedIntelliSense,
        smartRefactoring: this.enableSmartRefactoring,
        architectureSuggestions: this.enableArchitectureSuggestions,
        performanceOptimization: this.enablePerformanceOptimization,
        securityAnalysis: this.enableSecurityAnalysis
      }
    };
  }

  async _doPing() {
    return this._sendRequest({ type: 'ping' }, 5000);
  }

  async disconnect() {
    if (this.socket) {
      try {
        await this._sendRequest({ type: 'disconnect' }, 5000);
      } catch (error) {
        // Ignore disconnect errors
      }
      this.socket.end();
      this.socket = null;
    }
    this.responseHandlers.clear();
    this.projectContext.clear();
    this.fileCache.clear();
    this.analysisCache.clear();
    await super.disconnect();
  }
}
