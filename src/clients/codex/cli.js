/**
 * Codex CLI Client with GPT 5.3/5.4 Dual-Mode Support
 * Integration with OpenAI Codex CLI supporting both model versions
 */

import { BaseClient } from '../base-client.js';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

/**
 * Model configurations for GPT 5.3 and 5.4 Codex
 */
const MODEL_CONFIGS = {
  'gpt-5.4-codex': {
    name: 'gpt-5.4-codex',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.060,
    features: ['completion', 'edit', 'chat', 'code_generation', 'complex_reasoning', 'multi_file'],
    bestFor: 'complex_tasks',
    complexityThreshold: 0.7,
    latencyProfile: 'slower',
    description: 'Most capable model for complex coding tasks'
  },
  'gpt-5.3-codex': {
    name: 'gpt-5.3-codex',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    features: ['completion', 'edit', 'chat', 'code_generation', 'quick_tasks'],
    bestFor: 'quick_tasks',
    complexityThreshold: 0.4,
    latencyProfile: 'faster',
    description: 'Fast and cost-effective for routine coding tasks'
  }
};

/**
 * Task complexity analyzer
 */
class TaskComplexityAnalyzer {
  /**
   * Analyze task complexity score (0-1)
   * @param {Object} task - Task to analyze
   * @returns {number} Complexity score
   */
  static analyze(task) {
    let score = 0;
    let factors = 0;

    // Factor 1: Description length and complexity
    if (task.description) {
      const words = task.description.split(/\s+/).length;
      if (words > 100) score += 0.3;
      else if (words > 50) score += 0.2;
      else if (words > 20) score += 0.1;
      factors++;

      // Check for complexity indicators
      const complexityIndicators = [
        'architect', 'design pattern', 'refactor', 'optimize',
        'algorithm', 'complex', 'integrate', 'migrate',
        'performance', 'scalability', 'security audit'
      ];
      const hasComplexity = complexityIndicators.some(ind => 
        task.description.toLowerCase().includes(ind)
      );
      if (hasComplexity) score += 0.2;
    }

    // Factor 2: Code size
    if (task.code) {
      const lines = task.code.split('\n').length;
      if (lines > 200) score += 0.3;
      else if (lines > 100) score += 0.2;
      else if (lines > 50) score += 0.1;
      factors++;
    }

    // Factor 3: Multi-file indication
    if (task.files && task.files.length > 1) {
      score += Math.min(0.2, task.files.length * 0.05);
      factors++;
    }

    // Factor 4: Instructions complexity
    if (task.instructions) {
      const instructionWords = task.instructions.split(/\s+/).length;
      if (instructionWords > 50) score += 0.15;
      else if (instructionWords > 20) score += 0.1;
      factors++;
    }

    // Normalize by factors considered
    return factors > 0 ? Math.min(1, score / factors * 4) : 0.5;
  }

  /**
   * Estimate token count for a task
   * @param {Object} task - Task to estimate
   * @returns {number} Estimated token count
   */
  static estimateTokens(task) {
    let tokens = 0;
    
    // Rough estimation: ~4 chars per token
    if (task.description) {
      tokens += Math.ceil(task.description.length / 4);
    }
    if (task.code) {
      tokens += Math.ceil(task.code.length / 4);
    }
    if (task.instructions) {
      tokens += Math.ceil(task.instructions.length / 4);
    }
    if (task.files) {
      tokens += task.files.length * 100; // Approximate per file
    }

    return tokens;
  }

  /**
   * Estimate cost for a task with a specific model
   * @param {Object} task - Task to estimate
   * @param {string} model - Model name
   * @returns {Object} Cost estimation
   */
  static estimateCost(task, model) {
    const config = MODEL_CONFIGS[model];
    if (!config) return null;

    const estimatedInput = this.estimateTokens(task);
    const estimatedOutput = Math.min(config.maxOutputTokens, Math.ceil(estimatedInput * 0.5));
    
    const inputCost = (estimatedInput / 1000) * config.costPer1kInput;
    const outputCost = (estimatedOutput / 1000) * config.costPer1kOutput;

    return {
      model,
      estimatedInputTokens: estimatedInput,
      estimatedOutputTokens: estimatedOutput,
      estimatedCost: parseFloat((inputCost + outputCost).toFixed(4)),
      inputCost: parseFloat(inputCost.toFixed(4)),
      outputCost: parseFloat(outputCost.toFixed(4))
    };
  }
}

/**
 * Codex CLI Client with dual-model support
 */
export class CodexCliClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'codex',
      mode: 'cli'
    });

    this.cliPath = config.cliPath || this._findCliPath();
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    
    // Model configuration
    this.model = config.model || 'gpt-5.4-codex';
    this.availableModels = Object.keys(MODEL_CONFIGS);
    
    // Mode settings
    this.preferApi = false;
    this.autoModelSelection = config.autoModelSelection ?? false;
    this.costAwareRouting = config.costAwareRouting ?? true;
    this.maxCostPerRequest = config.maxCostPerRequest || 1.0;

    // Performance tracking
    this.performanceMetrics = {
      requests: 0,
      totalLatency: 0,
      totalCost: 0,
      modelUsage: {},
      errors: 0
    };

    // Cost tracking integration
    this.costTracker = config.costTracker || null;
    
    // Batch operations queue
    this.batchQueue = [];
    this.batchMode = config.batchMode || false;
  }

  _notConfigured(message) {
    const error = new Error(message);
    error.code = 'NOT_CONFIGURED';
    return error;
  }

  /**
   * Find Codex CLI executable
   */
  _findCliPath() {
    const platform = os.platform();
    const paths = platform === 'win32'
      ? [
          'codex.cmd',
          'codex.exe',
          'openai.cmd',
          join(os.homedir(), 'AppData', 'Roaming', 'npm', 'codex.cmd'),
          join(os.homedir(), 'AppData', 'Local', 'npm', 'codex.cmd')
        ]
      : [
          'codex',
          'openai',
          '/usr/local/bin/codex',
          '/usr/bin/codex',
          join(os.homedir(), '.local', 'bin', 'codex'),
          join(os.homedir(), '.npm-global', 'bin', 'codex')
        ];

    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return 'codex';
  }

  /**
   * Get model configuration
   */
  getModelConfig(model = this.model) {
    return MODEL_CONFIGS[model] || MODEL_CONFIGS['gpt-5.4-codex'];
  }

  async initialize() {
    this.status = 'initializing';

    try {
      if (this.preferApi) {
        throw this._notConfigured('Codex API billing fallback is disabled; use the CLI or desktop surface');
      }

      const { execSync } = await import('child_process');
      execSync(`${this.cliPath} --version`, { stdio: 'pipe' });

      // Initialize cost tracker if provided
      if (this.costTracker && typeof this.costTracker.init === 'function') {
        await this.costTracker.init();
      }

      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      throw this._notConfigured(`Codex CLI not found or not working: ${error.message}`);
    }
  }

  async _verifyApiAccess() {
    throw this._notConfigured('Codex API access is test-only and disabled in subscription-only runtime');
  }

  /**
   * Send a message (main interface)
   */
  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Codex CLI client not connected');
    }

    // Auto-select model if enabled
    let model = options.model || this.model;
    if (this.autoModelSelection && options.task) {
      model = await this.autoSelectModel(options.task);
    }

    // Check cost constraints
    if (this.costAwareRouting && options.task) {
      const costEstimate = TaskComplexityAnalyzer.estimateCost(options.task, model);
      if (costEstimate && costEstimate.estimatedCost > this.maxCostPerRequest) {
        // Try to use cheaper model
        const alternativeModel = model === 'gpt-5.4-codex' ? 'gpt-5.3-codex' : null;
        if (alternativeModel) {
          const altEstimate = TaskComplexityAnalyzer.estimateCost(options.task, alternativeModel);
          if (altEstimate && altEstimate.estimatedCost <= this.maxCostPerRequest) {
            console.log(`[CodexCLI] Switching to ${alternativeModel} due to cost constraints`);
            model = alternativeModel;
          }
        }
      }
    }

    const startTime = Date.now();
    
    try {
      let result;
      if (this.preferApi) {
        throw this._notConfigured('Codex API billing fallback is disabled; use the CLI or desktop surface');
      }

      result = await this._sendViaCli(message, { ...options, model });

      // Update metrics
      const latency = Date.now() - startTime;
      this._updateMetrics(model, latency, result.usage);

      return {
        ...result,
        model,
        latency,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.performanceMetrics.errors++;
      throw error;
    }
  }

  /**
   * Send via OpenAI API
   */
  async _sendViaApi(message, options) {
    throw this._notConfigured('Codex API billing path is disabled; use the CLI or desktop surface');
  }

  /**
   * Send via CLI
   */
  async _sendViaCli(message, options) {
    const modelConfig = this.getModelConfig(options.model);
    
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 120000;
      const args = [];

      // Add model flag
      args.push('--model', options.model);

      if (options.cwd) {
        args.push('--cwd', options.cwd);
      }

      // Add context files if provided
      if (options.files && options.files.length > 0) {
        args.push('--files', ...options.files);
      }

      // Codex CLI takes message as argument
      args.push(message.content);

      const child = spawn(this.cliPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: options.cwd || process.cwd(),
        env: (() => {
          const env = { ...process.env };
          delete env.OPENAI_API_KEY;
          env.CODEX_MODEL = options.model;
          return env;
        })()
      });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Codex CLI timeout after ${timeout}ms`));
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);

        if (code !== 0 && code !== null) {
          reject(new Error(`Codex CLI exited with code ${code}: ${stderr}`));
        } else {
          // Estimate usage for CLI mode (actual usage not available)
          const estimatedTokens = Math.ceil(message.content.length / 4) + Math.ceil(stdout.length / 4);
          
          resolve({
            content: stdout.trim(),
            raw: stdout,
            exitCode: code,
            usage: {
              prompt_tokens: Math.ceil(message.content.length / 4),
              completion_tokens: Math.ceil(stdout.length / 4),
              total_tokens: estimatedTokens
            }
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * Calculate cost for API usage
   */
  async _calculateCost(model, usage) {
    const config = this.getModelConfig(model);
    const inputCost = (usage.prompt_tokens / 1000) * config.costPer1kInput;
    const outputCost = (usage.completion_tokens / 1000) * config.costPer1kOutput;
    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  /**
   * Update performance metrics
   */
  _updateMetrics(model, latency, usage) {
    this.performanceMetrics.requests++;
    this.performanceMetrics.totalLatency += latency;
    
    if (!this.performanceMetrics.modelUsage[model]) {
      this.performanceMetrics.modelUsage[model] = {
        requests: 0,
        tokens: 0,
        cost: 0
      };
    }
    
    this.performanceMetrics.modelUsage[model].requests++;
    if (usage) {
      this.performanceMetrics.modelUsage[model].tokens += usage.total_tokens || 0;
    }
  }

  /**
   * Quick task execution (optimized for GPT 5.3)
   * For routine, fast tasks with lower cost
   */
  async quickTask(task, options = {}) {
    const model = options.forceModel || 'gpt-5.3-codex';
    const modelConfig = this.getModelConfig(model);

    console.log(`[CodexCLI] Executing quick task with ${modelConfig.name}`);

    const prompt = this._buildTaskPrompt(task);
    
    return this.send(
      { content: prompt },
      {
        ...options,
        model,
        maxTokens: options.maxTokens || modelConfig.maxOutputTokens,
        temperature: options.temperature ?? 0.1,
        operation: 'quick_task'
      }
    );
  }

  /**
   * Complex task execution (optimized for GPT 5.4)
   * For sophisticated tasks requiring deep reasoning
   */
  async complexTask(task, options = {}) {
    const model = options.forceModel || 'gpt-5.4-codex';
    const modelConfig = this.getModelConfig(model);

    console.log(`[CodexCLI] Executing complex task with ${modelConfig.name}`);

    // Enhance prompt for complex tasks
    const enhancedTask = {
      ...task,
      description: this._enhanceComplexPrompt(task)
    };

    const prompt = this._buildTaskPrompt(enhancedTask);
    
    return this.send(
      { content: prompt },
      {
        ...options,
        model,
        maxTokens: options.maxTokens || modelConfig.maxOutputTokens,
        temperature: options.temperature ?? 0.2,
        system: options.system || this._getComplexSystemPrompt(),
        operation: 'complex_task'
      }
    );
  }

  /**
   * Auto-select model based on task complexity
   */
  async autoSelectModel(task) {
    const complexity = TaskComplexityAnalyzer.analyze(task);
    const estimatedTokens = TaskComplexityAnalyzer.estimateTokens(task);

    console.log(`[CodexCLI] Task complexity: ${(complexity * 100).toFixed(1)}%, estimated tokens: ${estimatedTokens}`);

    const config53 = MODEL_CONFIGS['gpt-5.3-codex'];
    const config54 = MODEL_CONFIGS['gpt-5.4-codex'];

    // Check context window constraints
    if (estimatedTokens > config53.contextWindow * 0.8) {
      console.log(`[CodexCLI] Auto-selecting gpt-5.4-codex (context window requirement)`);
      return 'gpt-5.4-codex';
    }

    // Check complexity threshold
    if (complexity >= config54.complexityThreshold) {
      console.log(`[CodexCLI] Auto-selecting gpt-5.4-codex (high complexity)`);
      return 'gpt-5.4-codex';
    }

    // Check if task characteristics favor 5.4
    if (task.files && task.files.length > 5) {
      console.log(`[CodexCLI] Auto-selecting gpt-5.4-codex (multi-file)`);
      return 'gpt-5.4-codex';
    }

    // Default to 5.3 for efficiency
    console.log(`[CodexCLI] Auto-selecting gpt-5.3-codex (efficiency)`);
    return 'gpt-5.3-codex';
  }

  /**
   * Execute task with automatic model selection
   */
  async execute(task, options = {}) {
    if (options.quick) {
      return this.quickTask(task, options);
    }
    
    if (options.complex) {
      return this.complexTask(task, options);
    }

    // Auto-select based on task analysis
    const model = await this.autoSelectModel(task);
    
    if (model === 'gpt-5.3-codex') {
      return this.quickTask(task, options);
    }
    
    return this.complexTask(task, options);
  }

  /**
   * Switch active model
   */
  switchModel(model) {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Unknown model: ${model}. Available: ${this.availableModels.join(', ')}`);
    }
    
    const oldModel = this.model;
    this.model = model;
    
    console.log(`[CodexCLI] Switched model: ${oldModel} -> ${model}`);
    this.emit('model:switched', { from: oldModel, to: model });
    
    return {
      success: true,
      previousModel: oldModel,
      currentModel: model,
      config: this.getModelConfig(model)
    };
  }

  /**
   * Get current model info
   */
  getModelInfo() {
    return {
      current: this.model,
      available: this.availableModels.map(m => ({
        name: m,
        ...MODEL_CONFIGS[m]
      })),
      config: this.getModelConfig()
    };
  }

  /**
   * Batch operations - add to queue
   */
  queueTask(task, options = {}) {
    this.batchQueue.push({ task, options, addedAt: Date.now() });
    return { queued: true, position: this.batchQueue.length };
  }

  /**
   * Execute batch operations
   */
  async executeBatch(options = {}) {
    if (this.batchQueue.length === 0) {
      return { executed: 0, results: [] };
    }

    const { concurrency = 3, continueOnError = true } = options;
    const results = [];
    const queue = [...this.batchQueue];
    this.batchQueue = [];

    console.log(`[CodexCLI] Executing batch of ${queue.length} tasks (concurrency: ${concurrency})`);

    // Process in chunks
    for (let i = 0; i < queue.length; i += concurrency) {
      const chunk = queue.slice(i, i + concurrency);
      
      const chunkPromises = chunk.map(async ({ task, options: taskOptions }) => {
        try {
          const result = await this.execute(task, taskOptions);
          return { success: true, result, task };
        } catch (error) {
          return { success: false, error: error.message, task };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      if (!continueOnError && chunkResults.some(r => !r.success)) {
        break;
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    return {
      executed: queue.length,
      successful: successCount,
      failed: queue.length - successCount,
      results
    };
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const avgLatency = this.performanceMetrics.requests > 0 
      ? this.performanceMetrics.totalLatency / this.performanceMetrics.requests 
      : 0;

    return {
      ...this.performanceMetrics,
      averageLatency: Math.round(avgLatency),
      uptime: process.uptime(),
      currentModel: this.model,
      queueSize: this.batchQueue.length
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.performanceMetrics = {
      requests: 0,
      totalLatency: 0,
      totalCost: 0,
      modelUsage: {},
      errors: 0
    };
  }

  /**
   * Compare costs between models for a task
   */
  compareCosts(task) {
    const results = {};
    
    for (const model of this.availableModels) {
      results[model] = TaskComplexityAnalyzer.estimateCost(task, model);
    }

    return {
      estimates: results,
      recommendation: this._getCostRecommendation(results)
    };
  }

  /**
   * Build task prompt
   */
  _buildTaskPrompt(task) {
    let prompt = '';

    if (task.description) {
      prompt += `${task.description}\n\n`;
    }

    if (task.code) {
      prompt += `\`\`\`${task.language || ''}\n${task.code}\n\`\`\`\n\n`;
    }

    if (task.files && task.files.length > 0) {
      prompt += `Files: ${task.files.join(', ')}\n\n`;
    }

    if (task.instructions) {
      prompt += `${task.instructions}`;
    }

    return prompt.trim();
  }

  /**
   * Enhance prompt for complex tasks
   */
  _enhanceComplexPrompt(task) {
    let enhanced = task.description || '';
    
    if (!enhanced.includes('Think step by step')) {
      enhanced += '\n\nPlease think through this step by step, explaining your reasoning.';
    }
    
    if (task.code && !enhanced.includes('consider edge cases')) {
      enhanced += '\nConsider edge cases, error handling, and best practices.';
    }

    return enhanced;
  }

  /**
   * Get system prompt for complex tasks
   */
  _getComplexSystemPrompt() {
    return `You are an expert software engineer with deep knowledge of:
- Software architecture and design patterns
- Code optimization and performance
- Security best practices
- Testing and maintainability

Provide thorough, well-reasoned solutions with clear explanations.`;
  }

  /**
   * Get cost recommendation
   */
  _getCostRecommendation(estimates) {
    const entries = Object.entries(estimates);
    if (entries.length < 2) return null;

    entries.sort((a, b) => a[1].estimatedCost - b[1].estimatedCost);
    
    const cheapest = entries[0];
    const expensive = entries[entries.length - 1];
    const savings = expensive[1].estimatedCost - cheapest[1].estimatedCost;

    return {
      cheapestModel: cheapest[0],
      potentialSavings: parseFloat(savings.toFixed(4)),
      percentageSavings: Math.round((savings / expensive[1].estimatedCost) * 100)
    };
  }

  getCapabilities() {
    const config = this.getModelConfig();
    
    return {
      provider: 'codex',
      mode: 'cli',
      currentModel: this.model,
      availableModels: this.availableModels,
      contextWindow: config.contextWindow,
      maxOutputTokens: config.maxOutputTokens,
      features: [
        'completion',
        'edit', 
        'chat',
        'code_generation',
        'model_switching',
        'auto_selection',
        'batch_operations',
        'cost_tracking',
        'performance_metrics'
      ],
      streaming: true,
      supportsFiles: true,
      models: this.availableModels,
      modelConfigs: MODEL_CONFIGS,
      costAwareRouting: this.costAwareRouting,
      autoModelSelection: this.autoModelSelection
    };
  }

  async _doPing() {
    const { execSync } = await import('child_process');
    execSync(`${this.cliPath} --version`, { stdio: 'pipe' });
  }

  async disconnect() {
    // Flush any pending batch operations
    if (this.batchQueue.length > 0) {
      console.warn(`[CodexCLI] Warning: ${this.batchQueue.length} tasks still in queue`);
    }
    
    // Close cost tracker
    if (this.costTracker && typeof this.costTracker.close === 'function') {
      await this.costTracker.close();
    }

    await super.disconnect();
  }
}

export { MODEL_CONFIGS, TaskComplexityAnalyzer };
export default CodexCliClient;
