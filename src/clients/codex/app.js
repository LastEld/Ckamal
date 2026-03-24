/**
 * GPT 5.4 Codex Desktop App Client
 * Advanced integration with OpenAI GPT 5.4 Codex Desktop Application
 * 
 * Features:
 * - Advanced reasoning capabilities
 * - Code generation & analysis
 * - Multi-modal support
 * - System design & architecture
 * - Algorithm optimization
 */

import { BaseClient } from '../base-client.js';
import { WebSocket } from 'ws';
import http from 'http';
import crypto from 'crypto';

/**
 * GPT 5.4 Codex Desktop Application Client
 * @extends BaseClient
 */
export class GPT54CodexAppClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'codex',
      mode: 'app',
      name: config.name || 'gpt-54-codex-app'
    });
    
    // Connection settings
    this.apiHost = config.apiHost || 'localhost';
    this.apiPort = config.apiPort || 3457;
    this.wsUrl = config.wsUrl || `ws://${this.apiHost}:${this.apiPort}`;
    this.httpUrl = config.httpUrl || `http://${this.apiHost}:${this.apiPort}`;
    
    // WebSocket and state
    this.ws = null;
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.sessionContext = new Map();
    
    // API settings
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-5.4-codex';
    
    // GPT 5.4 specific features
    this.reasoningConfig = {
      chainOfThought: config.chainOfThought ?? true,
      selfCorrection: config.selfCorrection ?? true,
      maxReasoningDepth: config.maxReasoningDepth || 5,
      confidenceThreshold: config.confidenceThreshold || 0.85
    };
    
    // Multi-modal support
    this.multimodalConfig = {
      supportedFormats: ['image', 'audio', 'video', 'text'],
      maxImageSize: config.maxImageSize || 20 * 1024 * 1024, // 20MB
      visionEnabled: config.visionEnabled ?? true
    };
    
    // Advanced capabilities
    this.advancedCapabilities = {
      systemDesign: config.systemDesign ?? true,
      algorithmOptimization: config.algorithmOptimization ?? true,
      performanceTuning: config.performanceTuning ?? true,
      securityAnalysis: config.securityAnalysis ?? true,
      refactoring: config.refactoring ?? true
    };
  }

  /**
   * Initialize the client
   */
  async initialize() {
    this.status = 'initializing';
    
    try {
      // Check if GPT 5.4 Codex Desktop API is available
      await this._checkApiHealth();
      
      // Connect WebSocket
      await this._connectWebSocket();
      
      // Initialize advanced reasoning context
      await this._initializeReasoningContext();
      
      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      throw error;
    }
  }

  /**
   * Check if GPT 5.4 Codex Desktop API is running
   */
  _checkApiHealth() {
    return new Promise((resolve, reject) => {
      const req = http.get(`${this.httpUrl}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`GPT 5.4 Codex API returned status ${res.statusCode}`));
        }
      });

      req.on('error', (error) => {
        reject(new Error(`GPT 5.4 Codex Desktop not running: ${error.message}`));
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('GPT 5.4 Codex Desktop API health check timeout'));
      });
    });
  }

  /**
   * Establish WebSocket connection
   */
  _connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.on('message', (data) => {
        this._handleMessage(data);
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        this.updateHealth({ connected: false, lastError: error.message });
        reject(error);
      });

      this.ws.on('close', () => {
        this.updateHealth({ connected: false });
        this.emit('disconnected');
      });
    });
  }

  /**
   * Initialize advanced reasoning context
   */
  async _initializeReasoningContext() {
    this.sessionContext.set('reasoning', {
      mode: 'advanced',
      chainDepth: 0,
      corrections: [],
      insights: []
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      // Handle responses to pending requests
      if (message.requestId && this.pendingRequests.has(message.requestId)) {
        const { resolve, reject } = this.pendingRequests.get(message.requestId);
        this.pendingRequests.delete(message.requestId);
        
        if (message.error) {
          reject(new Error(message.error));
        } else {
          resolve(message);
        }
      }
      
      // Handle server-initiated messages
      if (message.type === 'status') {
        this.emit('status', message.data);
      } else if (message.type === 'stream') {
        this.emit('stream', message.data);
      } else if (message.type === 'reasoning') {
        this.emit('reasoning', message.data);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Send a message to the client
   */
  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 Codex App client not connected');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 180000; // 3 min for complex reasoning
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'message',
        content: message.content,
        options: {
          model: options.model || this.model,
          streaming: options.streaming || false,
          reasoning: options.reasoning ?? this.reasoningConfig.chainOfThought,
          multimodal: options.multimodal || false,
          conversationId: options.conversationId,
          ...options.metadata
        }
      };

      this.ws.send(JSON.stringify(payload));

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
   * Execute a task on the client
   */
  async execute(task, options = {}) {
    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 600000; // 10 min for complex tasks
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'task',
        task: {
          type: task.type || 'general',
          description: task.description,
          code: task.code,
          files: task.files,
          reasoning: task.reasoning || false,
          options: task.options
        },
        options: {
          workspace: options.cwd,
          reasoningMode: options.reasoningMode || 'advanced',
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
   * Advanced reasoning with chain-of-thought
   * @param {string} prompt - The reasoning prompt
   * @param {Object} options - Reasoning options
   * @returns {Promise<Object>} - Reasoning result with chain and conclusion
   */
  async advancedReasoning(prompt, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 Codex App client not connected');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 300000; // 5 min for complex reasoning
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'advanced_reasoning',
        prompt,
        options: {
          chainOfThought: options.chainOfThought ?? this.reasoningConfig.chainOfThought,
          selfCorrection: options.selfCorrection ?? this.reasoningConfig.selfCorrection,
          maxDepth: options.maxDepth || this.reasoningConfig.maxReasoningDepth,
          confidenceThreshold: options.confidenceThreshold || this.reasoningConfig.confidenceThreshold,
          includeAlternatives: options.includeAlternatives ?? true,
          format: options.format || 'structured'
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Advanced reasoning timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Code architecture design
   * @param {Object} design - Design requirements
   * @param {string} design.description - System description
   * @param {string[]} design.requirements - System requirements
   * @param {Object} design.constraints - Design constraints
   * @param {Object} options - Design options
   * @returns {Promise<Object>} - Architecture design with diagrams and code
   */
  async codeArchitecture(design, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 Codex App client not connected');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 600000; // 10 min for architecture
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'code_architecture',
        design: {
          description: design.description,
          requirements: design.requirements || [],
          constraints: design.constraints || {},
          existingCode: design.existingCode,
          targetPlatform: design.targetPlatform,
          scalability: design.scalability,
          security: design.security
        },
        options: {
          includeDiagrams: options.includeDiagrams ?? true,
          includeCode: options.includeCode ?? true,
          architectureStyle: options.architectureStyle || 'modular',
          documentation: options.documentation ?? true,
          patterns: options.patterns || [],
          ...options.metadata
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Architecture design timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Complex refactoring across multiple files
   * @param {Object} files - Files to refactor
   * @param {Array<{path: string, content: string}>} files.sources - Source files
   * @param {string} files.goal - Refactoring goal
   * @param {Object} options - Refactoring options
   * @returns {Promise<Object>} - Refactoring result with changes
   */
  async complexRefactoring(files, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 Codex App client not connected');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 600000; // 10 min for refactoring
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'complex_refactoring',
        files: files.sources || files,
        refactoring: {
          goal: files.goal || options.goal,
          targetPattern: options.targetPattern,
          preserveBehavior: options.preserveBehavior ?? true,
          improvePerformance: options.improvePerformance ?? false,
          improveReadability: options.improveReadability ?? true,
          addTests: options.addTests ?? true
        },
        options: {
          analysisDepth: options.analysisDepth || 'deep',
          safetyChecks: options.safetyChecks ?? true,
          incremental: options.incremental ?? false,
          generateDiff: options.generateDiff ?? true,
          ...options.metadata
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Complex refactoring timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Algorithm design and optimization
   * @param {Object} requirements - Algorithm requirements
   * @param {string} requirements.problem - Problem description
   * @param {Object} requirements.constraints - Constraints (time, space, etc.)
   * @param {string} requirements.optimizationTarget - Target for optimization
   * @param {Object} options - Design options
   * @returns {Promise<Object>} - Algorithm design with complexity analysis
   */
  async algorithmDesign(requirements, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 Codex App client not connected');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 300000; // 5 min for algorithm design
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'algorithm_design',
        requirements: {
          problem: requirements.problem,
          constraints: requirements.constraints || {},
          optimizationTarget: requirements.optimizationTarget || 'balanced',
          dataSize: requirements.dataSize,
          inputFormat: requirements.inputFormat,
          outputFormat: requirements.outputFormat
        },
        options: {
          provideMultiple: options.provideMultiple ?? true,
          complexityAnalysis: options.complexityAnalysis ?? true,
          proofOfCorrectness: options.proofOfCorrectness ?? false,
          benchmarkSuggestions: options.benchmarkSuggestions ?? true,
          implementationLanguage: options.implementationLanguage || 'javascript',
          ...options.metadata
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Algorithm design timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Multi-modal analysis (text + images)
   * @param {Object} input - Multi-modal input
   * @param {string} input.text - Text prompt
   * @param {Array<{type: string, data: string}>} input.media - Media files
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} - Multi-modal analysis result
   */
  async multimodalAnalysis(input, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 Codex App client not connected');
    }

    if (!this.multimodalConfig.visionEnabled) {
      throw new Error('Vision/multimodal is not enabled');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 180000;
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'multimodal',
        input: {
          text: input.text,
          media: input.media || []
        },
        options: {
          analysisType: options.analysisType || 'comprehensive',
          focusAreas: options.focusAreas || [],
          extractText: options.extractText ?? true,
          detectPatterns: options.detectPatterns ?? true,
          ...options.metadata
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Multimodal analysis timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Performance analysis and optimization
   * @param {Object} code - Code to analyze
   * @param {string} code.content - Code content
   * @param {string} code.language - Programming language
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} - Performance analysis with optimizations
   */
  async performanceAnalysis(code, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 Codex App client not connected');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 300000;
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'performance_analysis',
        code: {
          content: code.content,
          language: code.language,
          context: code.context
        },
        options: {
          analyzeComplexity: options.analyzeComplexity ?? true,
          detectBottlenecks: options.detectBottlenecks ?? true,
          suggestOptimizations: options.suggestOptimizations ?? true,
          memoryAnalysis: options.memoryAnalysis ?? true,
          profilingData: options.profilingData,
          ...options.metadata
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Performance analysis timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Security analysis
   * @param {Object} code - Code to analyze
   * @param {string} code.content - Code content
   * @param {string} code.language - Programming language
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} - Security analysis with vulnerabilities
   */
  async securityAnalysis(code, options = {}) {
    if (!this.isConnected()) {
      throw new Error('GPT 5.4 Codex App client not connected');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 300000;
      
      this.pendingRequests.set(requestId, { resolve, reject });

      const payload = {
        requestId,
        type: 'security_analysis',
        code: {
          content: code.content,
          language: code.language,
          dependencies: code.dependencies
        },
        options: {
          checkOWASP: options.checkOWASP ?? true,
          checkCVE: options.checkCVE ?? true,
          checkSecrets: options.checkSecrets ?? true,
          checkInjection: options.checkInjection ?? true,
          severityThreshold: options.severityThreshold || 'low',
          ...options.metadata
        }
      };

      this.ws.send(JSON.stringify(payload));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Security analysis timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * System design with comprehensive architecture
   * @param {Object} requirements - System requirements
   * @param {Object} options - Design options
   * @returns {Promise<Object>} - Complete system design
   */
  async systemDesign(requirements, options = {}) {
    return this.codeArchitecture(requirements, {
      ...options,
      architectureStyle: 'microservices',
      includeDiagrams: true
    });
  }

  /**
   * Get client capabilities
   */
  getCapabilities() {
    return {
      provider: 'codex',
      mode: 'app',
      model: 'gpt-5.4-codex',
      contextWindow: 256000,
      features: [
        'advanced_reasoning',
        'code_generation',
        'code_architecture',
        'complex_refactoring',
        'algorithm_design',
        'multimodal',
        'performance_analysis',
        'security_analysis',
        'system_design',
        'streaming',
        'chain_of_thought',
        'self_correction'
      ],
      streaming: true,
      supportsFiles: true,
      supportsConversations: true,
      supportsMultimodal: this.multimodalConfig.visionEnabled,
      advancedFeatures: this.advancedCapabilities,
      reasoningConfig: this.reasoningConfig
    };
  }

  /**
   * Get reasoning statistics
   */
  getReasoningStats() {
    const context = this.sessionContext.get('reasoning');
    return {
      chainDepth: context?.chainDepth || 0,
      corrections: context?.corrections?.length || 0,
      insights: context?.insights?.length || 0,
      config: this.reasoningConfig
    };
  }

  async _doPing() {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      
      this.pendingRequests.set(requestId, { resolve, reject });

      this.ws.send(JSON.stringify({
        requestId,
        type: 'ping'
      }));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Ping timeout'));
        }
      }, 5000);
    });
  }

  async reconnect() {
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    this.sessionContext.clear();
    await this.initialize();
  }

  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
    this.sessionContext.clear();
    await super.disconnect();
  }
}

export default GPT54CodexAppClient;
