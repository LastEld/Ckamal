/**
 * Multi-Client Gateway (BIOS)
 * Unified interface for managing multiple AI provider clients
 * 
 * Enhanced for CogniMesh Phase 4 with:
 * - Kimi 2.5 integration (256K context, thinking mode, multimodal)
 * - Improved fallback chain with capability matching
 * - Task routing based on provider strengths
 */

import { EventEmitter } from 'events';

// Client imports
import { ClaudeCliClient } from '../clients/claude/cli.js';
import { ClaudeDesktopClient } from '../clients/claude/desktop.js';
import { ClaudeVSCodeClient } from '../clients/claude/vscode.js';
import { KimiCliClient } from '../clients/kimi/cli.js';
import { KimiVSCodeClient } from '../clients/kimi/vscode.js';
import { CodexCliClient } from '../clients/codex/cli.js';
import { GPT54CodexAppClient } from '../clients/codex/app.js';
import { GPT54CodexVSCodeClient } from '../clients/codex/vscode.js';

function normalizeGatewayMode(mode) {
  return mode || null;
}

function normalizeRoutingTarget(target) {
  if (!target) {
    return null;
  }

  if (typeof target === 'string') {
    return { provider: target, mode: null };
  }

  return {
    provider: target.provider,
    mode: normalizeGatewayMode(target.mode)
  };
}

export const PROVIDERS = {
  CLAUDE: 'claude',
  KIMI: 'kimi',
  CODEX: 'codex'
};

export const CAPABILITIES = {
  claude: {
    modes: ['cli', 'desktop', 'vscode'],
    context: 1000000,
    features: ['plan_mode', 'sub_agents', 'streaming', 'computer_use', 'extended_thinking', 'vision'],
    pricing: { input: 15, output: 75 },
    strengths: ['complex_reasoning', 'long_context', 'computer_automation', 'planning', 'coding', 'ide_integration', 'cli_integration']
  },
  
  kimi: {
    modes: ['cli', 'vscode'],
    context: 256000,
    features: [
      'multimodal',
      'thinking_mode',
      'long_context',
      'chinese_optimization',
      'batch_code_review'
    ],
    pricing: { input: 5, output: 15 },
    strengths: ['multimodal', 'chinese_language', 'cost_effective']
  },
  
  codex: {
    modes: ['cli', 'app', 'vscode'],
    context: 128000,
    features: ['completion', 'infilling', 'edit_style', 'code_generation'],
    pricing: { input: 10, output: 30 },
    strengths: ['code_completion', 'inline_editing', 'quick_generation']
  }
};

// Task routing configuration
export const TASK_ROUTING = {
  // Use Kimi for multimodal tasks
  multimodal: {
    primary: 'kimi',
    fallback: ['claude', 'codex']
  },
  
  // Use Kimi for Chinese language tasks
  chinese: {
    primary: 'kimi',
    fallback: ['claude', 'codex']
  },
  
  // Use Kimi for long context (up to 256K)
  long_context: {
    primary: 'kimi',
    secondary: 'claude',
    fallback: ['claude', 'codex']
  },
  
  // Use Claude for complex reasoning
  complex_reasoning: {
    primary: 'claude',
    fallback: ['kimi', 'codex']
  },
  
  // Use Claude for very long context (1M)
  very_long_context: {
    primary: 'claude',
    fallback: ['kimi', 'codex']
  },
  
  // Use Sonnet for code completion (cost-effective, high quality)
  code_completion: {
    primary: { provider: 'claude', mode: 'vscode' },
    secondary: { provider: 'codex', mode: 'vscode' },
    fallback: [
      { provider: 'codex', mode: 'cli' },
      { provider: 'claude', mode: 'cli' },
      { provider: 'kimi', mode: 'cli' }
    ]
  },
  
  // Use Claude VS Code surface for editor integration
  ide_integration: {
    primary: { provider: 'claude', mode: 'vscode' },
    fallback: [
      { provider: 'codex', mode: 'vscode' },
      { provider: 'kimi', mode: 'vscode' },
      { provider: 'claude', mode: 'cli' }
    ]
  },
  
  // Use Claude Code CLI for CLI coding tasks
  cli_coding: {
    primary: { provider: 'claude', mode: 'cli' },
    fallback: [
      { provider: 'codex', mode: 'cli' },
      { provider: 'kimi', mode: 'cli' },
      { provider: 'claude', mode: 'desktop' }
    ]
  },
  
  // Use Claude for planning
  planning: {
    primary: 'claude',
    fallback: ['kimi', 'codex']
  },
  
  // Use Kimi for batch operations
  batch_operations: {
    primary: 'kimi',
    fallback: ['claude', 'codex']
  }
};

export class ClientGateway extends EventEmitter {
  constructor(config = {}) {
    super();
    this.clients = new Map();
    this.providers = PROVIDERS;
    this.capabilities = CAPABILITIES;
    this.taskRouting = config.taskRouting || TASK_ROUTING;
    this.config = config;
    this.healthMonitor = null;
    this.fallbackChain = config.fallbackChain || ['claude', 'kimi', 'codex'];
    this.stats = {
      requests: 0,
      fallbacks: 0,
      errors: 0,
      latency: []
    };
  }

  /**
   * Initialize all configured client connections
   */
  async initialize() {
    this.emit('initializing');
    
    const initPromises = [];

    // Initialize Claude clients if configured
    if (this.config.claude !== false) {
      initPromises.push(this._initClaudeClients());
    }

    // Initialize Kimi clients if configured
    if (this.config.kimi !== false) {
      initPromises.push(this._initKimiClients());
    }

    // Initialize Codex clients if configured
    if (this.config.codex !== false) {
      initPromises.push(this._initCodexClients());
    }

    await Promise.allSettled(initPromises);

    // Start health monitoring
    this._startHealthMonitoring();

    this.emit('initialized', this.getAllStatuses());
    return this.getAllStatuses();
  }

  /**
   * Initialize Claude-specific clients
   */
  async _initClaudeClients() {
    const configs = this.config.claude || {};

    try {
      // CLI client
      if (configs.cli !== false) {
        const cliClient = new ClaudeCliClient({
          model: 'claude-sonnet-4-6',
          ...(configs.cli || {})
        });
        await cliClient.initialize();
        this._registerClient('claude:cli', cliClient);
      }

      // Desktop client
      if (configs.desktop !== false) {
        const desktopClient = new ClaudeDesktopClient({
          model: 'claude-opus-4-6',
          ...(configs.desktop || {})
        });
        await desktopClient.initialize();
        this._registerClient('claude:desktop', desktopClient);
      }

      // VS Code client
      const vscodeConfig = configs.vscode;
      if (vscodeConfig !== false) {
        const vscodeClient = new ClaudeVSCodeClient({
          model: 'claude-sonnet-4-6',
          ...(vscodeConfig || {})
        });
        await vscodeClient.initialize();
        this._registerClient('claude:vscode', vscodeClient);
      }
    } catch (error) {
      this.emit('clientError', { provider: 'claude', error });
    }
  }

  /**
   * Initialize Kimi-specific clients (Kimi 2.5)
   */
  async _initKimiClients() {
    const configs = this.config.kimi || {};

    try {
      // CLI client - Primary client with full Kimi 2.5 features
      if (configs.cli !== false) {
        const cliConfig = configs.cli || {};
        // Enable all Kimi 2.5 features by default
        const enhancedConfig = {
          model: 'moonshot-v1-128k',
          features: {
            thinkingMode: true,
            multimodal: true,
            longContext: true,
            chineseOptimization: true
          },
          preferApi: false,
          ...cliConfig
        };
        
        const cliClient = new KimiCliClient(enhancedConfig);
        await cliClient.initialize();
        this._registerClient('kimi:cli', cliClient);
      }

      // VS Code client
      const vscodeConfig = configs.vscode;
      if (vscodeConfig !== false) {
        const vscodeClient = new KimiVSCodeClient(vscodeConfig || {});
        await vscodeClient.initialize();
        this._registerClient('kimi:vscode', vscodeClient);
      }
    } catch (error) {
      this.emit('clientError', { provider: 'kimi', error });
    }
  }

  /**
   * Initialize Codex-specific clients
   */
  async _initCodexClients() {
    const configs = this.config.codex || {};

    try {
      // CLI client
      if (configs.cli !== false) {
        const cliClient = new CodexCliClient(configs.cli || {});
        await cliClient.initialize();
        this._registerClient('codex:cli', cliClient);
      }

      // App client
      if (configs.app !== false) {
        const appClient = new GPT54CodexAppClient(configs.app || {});
        await appClient.initialize();
        this._registerClient('codex:app', appClient);
      }

      // VS Code client
      const vscodeConfig = configs.vscode;
      if (vscodeConfig !== false) {
        const vscodeClient = new GPT54CodexVSCodeClient(vscodeConfig || {});
        await vscodeClient.initialize();
        this._registerClient('codex:vscode', vscodeClient);
      }
    } catch (error) {
      this.emit('clientError', { provider: 'codex', error });
    }
  }

  /**
   * Register a client with the gateway
   */
  _registerClient(id, client) {
    this.clients.set(id, client);
    
    // Forward client events
    client.on('health', (health) => {
      this.emit('clientHealth', { id, health });
    });
    
    client.on('error', (error) => {
      this.emit('clientError', { id, error });
    });

    this.emit('clientRegistered', { id, client });
  }

  /**
   * Send a message to a specific provider
   */
  async sendToClient(provider, message, options = {}) {
    const client = this._resolveClient(provider, options.mode);
    
    if (!client) {
      throw new Error(`Client not found for provider: ${provider}`);
    }

    if (!client.isConnected()) {
      throw new Error(`Client ${provider} is not connected`);
    }

    const formattedMessage = client.formatMessage({
      content: message,
      timestamp: new Date(),
      ...options.metadata
    });

    this.emit('sending', { provider, message: formattedMessage });
    
    const startTime = Date.now();
    
    try {
      const response = await client.send(formattedMessage, options);
      const parsedResponse = client.parseResponse(response);
      
      // Update stats
      this.stats.requests++;
      this.stats.latency.push(Date.now() - startTime);
      
      this.emit('received', { provider, response: parsedResponse, latency: Date.now() - startTime });
      return parsedResponse;
    } catch (error) {
      this.stats.errors++;
      this.emit('sendError', { provider, error });
      
      // Try fallback if enabled
      if (options.fallback !== false) {
        this.stats.fallbacks++;
        return this._tryFallback(message, options, provider);
      }
      
      throw error;
    }
  }

  /**
   * Broadcast a message to all connected clients
   */
  async broadcast(message, options = {}) {
    const results = new Map();
    const filter = options.filter || {};
    const normalizedModes = Array.isArray(filter.modes)
      ? new Set(filter.modes.map((mode) => normalizeGatewayMode(mode)))
      : null;

    const sendPromises = [];

    for (const [id, client] of this.clients) {
      // Apply filters
      if (filter.providers && !filter.providers.includes(client.provider)) {
        continue;
      }
      if (normalizedModes && !normalizedModes.has(client.mode)) {
        continue;
      }
      if (filter.connectedOnly && !client.isConnected()) {
        continue;
      }

      sendPromises.push(
        client.send(message, options)
          .then(response => ({ success: true, response }))
          .catch(error => ({ success: false, error: error.message }))
          .then(result => results.set(id, result))
      );
    }

    await Promise.all(sendPromises);

    this.emit('broadcast', { message, results });
    return results;
  }

  /**
   * Get connection status for a specific provider
   */
  getClientStatus(provider, mode = null) {
    if (mode) {
      const normalizedMode = normalizeGatewayMode(mode);
      const client = this.clients.get(`${provider}:${normalizedMode}`);
      return client ? client.getStatus() : null;
    }

    // Get all clients for this provider
    const statuses = [];
    for (const [id, client] of this.clients) {
      if (id.startsWith(`${provider}:`)) {
        statuses.push(client.getStatus());
      }
    }
    return statuses;
  }

  /**
   * Get all client statuses
   */
  getAllStatuses() {
    const statuses = {};
    for (const [id, client] of this.clients) {
      statuses[id] = client.getStatus();
    }
    return statuses;
  }

  /**
   * Execute a task on a specific client
   */
  async executeWithClient(provider, task, options = {}) {
    const client = this._resolveClient(provider, options.mode);
    
    if (!client) {
      throw new Error(`Client not found for provider: ${provider}`);
    }

    this.emit('executing', { provider, task });

    const startTime = Date.now();
    
    try {
      const result = await client.execute(task, options);
      
      this.stats.requests++;
      this.stats.latency.push(Date.now() - startTime);
      
      this.emit('executed', { provider, task, result, latency: Date.now() - startTime });
      return result;
    } catch (error) {
      this.stats.errors++;
      this.emit('executeError', { provider, task, error });
      
      if (options.fallback !== false) {
        this.stats.fallbacks++;
        return this._tryFallback(task, options, provider, true);
      }
      
      throw error;
    }
  }

  /**
   * Execute with Kimi CLI (convenience method for Kimi 2.5 features)
   */
  async executeWithKimi(task, options = {}) {
    const client = this._resolveClient('kimi', 'cli');
    
    if (!client) {
      throw new Error('Kimi CLI client not available');
    }

    // Map task types to Kimi methods
    const methodMap = {
      'long_context_analyze': 'longContextAnalyze',
      'thinking_mode': 'thinkingMode',
      'multimodal_analyze': 'multimodalAnalyze',
      'chinese_optimize': 'chineseOptimization',
      'batch_code_review': 'batchCodeReview',
      'multi_file_refactor': 'multiFileRefactoring',
      'documentation_generation': 'documentationGeneration'
    };

    const method = methodMap[task.type];
    
    if (method && typeof client[method] === 'function') {
      this.emit('executing', { provider: 'kimi', task, method });
      
      const startTime = Date.now();
      const result = await client[method](task.data || task.files || task.prompt || task.code, task.options || {});
      
      this.stats.requests++;
      this.stats.latency.push(Date.now() - startTime);
      
      this.emit('executed', { provider: 'kimi', task, result, method, latency: Date.now() - startTime });
      return result;
    }

    // Fall back to standard execute
    return this.executeWithClient('kimi', task, { mode: 'cli', ...options });
  }

  /**
   * Execute with Claude coding surfaces (Sonnet-backed convenience path)
   */
  async executeWithSonnet(task, options = {}) {
    const preferredMode = normalizeGatewayMode(options.mode) || 'cli';
    const client = this._resolveClient('claude', preferredMode) ||
      this._resolveClient('claude', 'vscode') ||
      this._resolveClient('claude', 'cli');
    
    if (!client) {
      throw new Error('Claude subscription-backed coding surface not available');
    }

    // Map task types to Sonnet methods
    const methodMap = {
      'code_analyze': 'codeAnalyze',
      'code_generate': 'codeGenerate',
      'code_review': 'codeReview',
      'explain_code': 'explainCode',
      'inline_completion': 'inlineCompletion',
      'code_action': 'codeAction',
      'refactoring': 'refactoring',
      'interactive_session': 'startInteractiveSession',
      'batch_process': 'batchProcess',
      'analyze_git_diff': 'analyzeGitDiff',
      'generate_commit_message': 'generateCommitMessage'
    };

    const method = methodMap[task.type];
    const executionOptions = {
      ...options,
      mode: preferredMode,
      model: options.model || 'claude-sonnet-4-6'
    };
    
    if (method && typeof client[method] === 'function') {
      this.emit('executing', { provider: 'claude', task, method, model: executionOptions.model });
      
      const startTime = Date.now();
      let result;
      
      // Handle different method signatures
      switch (task.type) {
        case 'code_analyze':
        case 'explain_code':
          result = await client[method](task.filePath, task.options || executionOptions);
          break;
        case 'code_generate':
          result = await client[method](task.prompt, task.language, task.options || executionOptions);
          break;
        case 'code_review':
          result = await client[method](task.filePath, task.options || executionOptions);
          break;
        case 'inline_completion':
          result = await client[method](task.document, task.position, task.options || executionOptions);
          break;
        case 'code_action':
          result = await client[method](task.document, task.range, task.context || {});
          break;
        case 'refactoring':
          result = await client[method](task.document, task.range, task.operation, task.options || executionOptions);
          break;
        case 'batch_process':
          result = await client[method](task.tasks, task.options || executionOptions);
          break;
        default:
          result = await client[method](task.data || task.prompt || task.code, task.options || executionOptions);
      }
      
      this.stats.requests++;
      this.stats.latency.push(Date.now() - startTime);
      
      this.emit('executed', { provider: 'claude', task, result, method, model: executionOptions.model, latency: Date.now() - startTime });
      return result;
    }

    // Fall back to standard execute
    return this.executeWithClient('claude', task, executionOptions);
  }

  /**
   * Auto-select the best client based on task characteristics
   */
  selectBestClient(task) {
    const taskType = this._analyzeTask(task);
    
    // Check task routing configuration first
    const routing = this._getRoutingForTask(taskType);
    if (routing) {
      // Try primary
      const primaryTarget = normalizeRoutingTarget(routing.primary);
      const primary = primaryTarget
        ? this._resolveClient(primaryTarget.provider, primaryTarget.mode)
        : null;
      if (primary && primary.isConnected()) {
        return primary;
      }
      
      // Try secondary
      if (routing.secondary) {
        const secondaryTarget = normalizeRoutingTarget(routing.secondary);
        const secondary = secondaryTarget
          ? this._resolveClient(secondaryTarget.provider, secondaryTarget.mode)
          : null;
        if (secondary && secondary.isConnected()) {
          return secondary;
        }
      }
      
      // Try fallback chain
      for (const entry of routing.fallback || this.fallbackChain) {
        const fallbackTarget = normalizeRoutingTarget(entry);
        const client = fallbackTarget
          ? this._resolveClient(fallbackTarget.provider, fallbackTarget.mode)
          : null;
        if (client && client.isConnected()) {
          return client;
        }
      }
    }
    
    // Legacy task routing logic
    switch (taskType.category) {
      case 'multimodal':
        // Kimi 2.5 for multimodal tasks
        return this._resolveClient('kimi', 'cli') || 
               this._resolveClient('kimi', 'vscode');
      
      case 'chinese_language':
        // Kimi for Chinese language tasks
        return this._resolveClient('kimi', 'cli') || 
               this._resolveClient('kimi', 'vscode');
      
      case 'long_context':
        // Kimi 2.5 for long context (up to 256K)
        return this._resolveClient('kimi', 'cli') || 
               this._resolveClient('claude', 'cli');
      
      case 'complexity_high':
        // Claude Opus for complex reasoning
        return this._resolveClient('claude', 'cli') || 
               this._resolveClient('claude', 'desktop');
      
      case 'very_long_context':
        // Claude for very long context (1M)
        return this._resolveClient('claude', 'cli') ||
               this._resolveClient('claude', 'desktop');
      
      case 'code_completion':
        return this._resolveClient('claude', 'vscode') ||
               this._resolveClient('codex', 'vscode') ||
               this._resolveClient('claude', 'cli') ||
               this._resolveClient('codex', 'cli');
      
      case 'ide_integration':
        return this._resolveClient('claude', 'vscode') ||
               this._resolveClient('codex', 'vscode') ||
               this._resolveClient('kimi', 'vscode');
      
      case 'cli_integration':
        return this._resolveClient('claude', 'cli') ||
               this._resolveClient('codex', 'cli') ||
               this._resolveClient('kimi', 'cli');
      
      case 'planning':
        // Claude for planning with sub-agents
        return this._resolveClient('claude', 'cli') ||
               this._resolveClient('claude', 'desktop');
      
      case 'swarm':
        // Swarm is an orchestration strategy, not a separate provider surface.
        return this._resolveClient('kimi', 'cli');
      
      case 'batch_operations':
        // Kimi for batch operations
        return this._resolveClient('kimi', 'cli') ||
               this._resolveClient('kimi', 'vscode');
      
      default:
        // Default to any available client with fallback chain
        for (const provider of this.fallbackChain) {
          const client = this._resolveClient(provider);
          if (client && client.isConnected()) {
            return client;
          }
        }
        return null;
    }
  }

  /**
   * Get routing configuration for a task
   */
  _getRoutingForTask(taskType) {
    if (taskType.category && this.taskRouting[taskType.category]) {
      return this.taskRouting[taskType.category];
    }
    
    // Check for explicit task type
    if (taskType.taskType && this.taskRouting[taskType.taskType]) {
      return this.taskRouting[taskType.taskType];
    }
    
    return null;
  }

  /**
   * Analyze task to determine routing
   */
  _analyzeTask(task) {
    const analysis = {
      category: 'default',
      taskType: task?.type,
      complexity: 'medium',
      requiresMultimodal: false,
      requiresChinese: false,
      estimatedTokens: 0,
      hasImages: false,
      hasChinese: false
    };

    if (!task) return analysis;

    // Check for multimodal
    if (task.hasImages || 
        task.hasAudio ||
        task.multimodal ||
        task.imagePath ||
        (task.files && task.files.some(f => /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f.path)))) {
      analysis.category = 'multimodal';
      analysis.requiresMultimodal = true;
      analysis.hasImages = true;
    }

    // Check for Chinese language
    if (task.chinese || 
        task.language === 'chinese' || 
        task.language === 'zh' ||
        /[\u4e00-\u9fa5]/.test(task.description || task.content || task.code || '')) {
      analysis.category = 'chinese_language';
      analysis.requiresChinese = true;
      analysis.hasChinese = true;
    }

    // Check for complexity indicators
    if (task.complexity === 'high' || 
        task.description?.includes('architect') ||
        task.description?.includes('design') ||
        task.requiresReasoning) {
      analysis.category = analysis.category === 'default' ? 'complexity_high' : analysis.category;
      analysis.complexity = 'high';
    }

    // Check for long context
    analysis.estimatedTokens = this._estimateTokens(task);
    if (analysis.estimatedTokens > 120000 && analysis.estimatedTokens <= 256000) {
      analysis.category = 'long_context';
    } else if (analysis.estimatedTokens > 256000) {
      analysis.category = 'very_long_context';
    }

    // Check for completion task
    if (task.type === 'completion' || 
        task.type === 'infilling' ||
        task.type === 'inline_completion' ||
        task.description?.includes('complete') ||
        task.description?.includes('fill')) {
      analysis.category = 'code_completion';
    }

    // Check for IDE integration tasks
    if (task.type === 'ide_integration' ||
        task.type === 'hover' ||
        task.type === 'code_action' ||
        task.type === 'refactor' ||
        task.requiresEditorContext) {
      analysis.category = 'ide_integration';
    }

    // Check for CLI coding tasks
    if (task.type === 'cli_coding' ||
        task.type === 'code_analyze' ||
        task.type === 'code_review' ||
        task.type === 'code_generate' ||
        task.type === 'interactive_session') {
      analysis.category = 'cli_integration';
    }

    // Check for planning
    if (task.type === 'plan' ||
        task.requiresSubAgents ||
        task.description?.includes('plan') ||
        task.description?.includes('orchestrate')) {
      analysis.category = 'planning';
    }

    // Check for swarm
    if (task.type === 'swarm' ||
        task.parallelAgents > 1) {
      analysis.category = 'swarm';
    }

    // Check for batch operations
    if (task.type?.includes('batch') ||
        task.type === 'multi_file_refactor' ||
        task.type === 'batch_code_review' ||
        (task.files && task.files.length > 5)) {
      analysis.category = 'batch_operations';
    }

    return analysis;
  }

  /**
   * Estimate token count for a task
   */
  _estimateTokens(task) {
    let text = '';
    if (task.description) text += task.description;
    if (task.content) text += task.content;
    if (task.code) text += task.code;
    if (task.prompt) text += task.prompt;
    if (task.files) {
      for (const file of task.files) {
        if (file.content) text += file.content;
        if (file.path) text += file.path;
      }
    }
    
    // Rough estimation: ~4 chars per token for English, ~2 for Chinese
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil((chineseChars / 2) + (otherChars / 4));
  }

  /**
   * Try fallback providers
   */
  async _tryFallback(messageOrTask, options, failedProvider, isTask = false) {
    const fallbackIndex = this.fallbackChain.indexOf(failedProvider);
    
    for (let i = fallbackIndex + 1; i < this.fallbackChain.length; i++) {
      const fallbackProvider = this.fallbackChain[i];
      const client = this._resolveClient(fallbackProvider);
      
      if (client && client.isConnected()) {
        this.emit('fallback', { 
          from: failedProvider, 
          to: fallbackProvider 
        });
        
        try {
          if (isTask) {
            return await client.execute(messageOrTask, options);
          } else {
            return await client.send(messageOrTask, options);
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    throw new Error(`All fallback providers failed after ${failedProvider}`);
  }

  /**
   * Resolve client by provider and optional mode
   */
  _resolveClient(provider, mode = null) {
    if (mode) {
      const normalizedMode = normalizeGatewayMode(mode);
      return this.clients.get(`${provider}:${normalizedMode}`) || null;
    }

    // Find any available client for this provider
    for (const [id, client] of this.clients) {
      if (id.startsWith(`${provider}:`) && client.isConnected()) {
        return client;
      }
    }

    // Return first client for provider even if not connected
    for (const [id, client] of this.clients) {
      if (id.startsWith(`${provider}:`)) {
        return client;
      }
    }

    return null;
  }

  /**
   * Start health monitoring
   */
  _startHealthMonitoring() {
    const interval = this.config.healthCheckInterval || 30000; // 30s default
    
    this.healthMonitor = setInterval(async () => {
      for (const [id, client] of this.clients) {
        try {
          await client.ping();
        } catch (error) {
          this.emit('healthCheckFailed', { id, error });
          
          // Auto-reconnect if enabled
          if (this.config.autoReconnect !== false) {
            try {
              await client.reconnect();
            } catch (reconnectError) {
              this.emit('reconnectFailed', { id, error: reconnectError });
            }
          }
        }
      }
    }, interval);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthMonitor) {
      clearInterval(this.healthMonitor);
      this.healthMonitor = null;
    }
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(provider = null) {
    if (provider) {
      return this.capabilities[provider] || null;
    }
    return this.capabilities;
  }

  /**
   * Get gateway statistics
   */
  getStats() {
    const avgLatency = this.stats.latency.length > 0
      ? this.stats.latency.reduce((a, b) => a + b, 0) / this.stats.latency.length
      : 0;
    
    return {
      ...this.stats,
      avgLatency: Math.round(avgLatency),
      connectedClients: Array.from(this.clients.values()).filter(c => c.isConnected()).length,
      totalClients: this.clients.size
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      requests: 0,
      fallbacks: 0,
      errors: 0,
      latency: []
    };
  }

  /**
   * Shutdown all clients
   */
  async shutdown() {
    this.stopHealthMonitoring();
    
    const disconnectPromises = [];
    for (const [, client] of this.clients) {
      disconnectPromises.push(
        client.disconnect().catch(() => {}) // Ignore errors during shutdown
      );
    }
    
    await Promise.all(disconnectPromises);
    this.clients.clear();
    
    this.emit('shutdown');
  }
}

export default ClientGateway;
