/**
 * GPT 5.3 Codex Client
 * Native client for cost-effective, fast code operations
 */

'use strict';

const EventEmitter = require('events');
const { GPT53_CONFIG, getTaskConfig, estimateUsage } = require('./gpt53-config');

/**
 * GPT 5.3 Codex Client
 * Optimized for cost-effectiveness and speed
 */
class GPT53Client extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = { ...GPT53_CONFIG, ...options };
    this.initialized = false;
    this.apiClient = null;
    this.cache = new Map();
    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageLatency: 0,
    };
    
    this.requestQueue = [];
    this.processingQueue = false;
  }

  /**
   * Initialize the client
   * @returns {Promise<boolean>} Initialization success
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }

    try {
      // Validate API key
      if (!this.config.api.apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      // Initialize API client (lazy load OpenAI SDK)
      const { OpenAI } = await this._loadOpenAI();
      this.apiClient = new OpenAI({
        apiKey: this.config.api.apiKey,
        baseURL: this.config.api.baseURL,
        organization: this.config.api.organization,
        timeout: this.config.performance.requestTimeout,
        maxRetries: this.config.performance.maxRetries,
      });

      // Initialize cache if enabled
      if (this.config.cache.enabled) {
        this._initializeCache();
      }

      this.initialized = true;
      this.emit('initialized');
      
      return true;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Quick completion for simple tasks
   * @param {string} prompt - Input prompt
   * @param {Object} options - Completion options
   * @returns {Promise<Object>} Completion result
   */
  async quickCompletion(prompt, options = {}) {
    this._ensureInitialized();
    
    const taskConfig = getTaskConfig('quickCompletion');
    const mergedOptions = { ...taskConfig, ...options };
    
    return this._executeRequest({
      type: 'quick_completion',
      prompt,
      ...mergedOptions,
    });
  }

  /**
   * Standard refactoring operation
   * @param {string} code - Code to refactor
   * @param {string} instructions - Refactoring instructions
   * @param {Object} options - Refactoring options
   * @returns {Promise<Object>} Refactoring result
   */
  async standardRefactoring(code, instructions, options = {}) {
    this._ensureInitialized();
    
    const taskConfig = getTaskConfig('standardRefactoring');
    const prompt = this._buildRefactoringPrompt(code, instructions);
    
    return this._executeRequest({
      type: 'standard_refactoring',
      prompt,
      code,
      instructions,
      ...taskConfig,
      ...options,
    });
  }

  /**
   * Generate code based on requirements
   * @param {string} requirements - Code requirements
   * @param {Object} context - Generation context
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated code
   */
  async codeGeneration(requirements, context = {}, options = {}) {
    this._ensureInitialized();
    
    const taskConfig = getTaskConfig('codeGeneration');
    const prompt = this._buildGenerationPrompt(requirements, context);
    
    return this._executeRequest({
      type: 'code_generation',
      prompt,
      requirements,
      context,
      ...taskConfig,
      ...options,
    });
  }

  /**
   * Generate unit tests for code
   * @param {string} code - Code to test
   * @param {Object} options - Test generation options
   * @returns {Promise<Object>} Generated tests
   */
  async unitTestGeneration(code, options = {}) {
    this._ensureInitialized();
    
    const taskConfig = getTaskConfig('unitTestGeneration');
    const prompt = this._buildTestPrompt(code, options);
    
    return this._executeRequest({
      type: 'unit_test_generation',
      prompt,
      code,
      ...taskConfig,
      ...options,
    });
  }

  /**
   * Simple code analysis
   * @param {string} code - Code to analyze
   * @param {string} analysisType - Type of analysis
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async simpleAnalysis(code, analysisType = 'general', options = {}) {
    this._ensureInitialized();
    
    const taskConfig = getTaskConfig('simpleAnalysis');
    const prompt = this._buildAnalysisPrompt(code, analysisType);
    
    return this._executeRequest({
      type: 'simple_analysis',
      prompt,
      code,
      analysisType,
      ...taskConfig,
      ...options,
    });
  }

  /**
   * Get client capabilities
   * @returns {Object} Capabilities information
   */
  getCapabilities() {
    return {
      model: this.config.model.name,
      version: this.config.model.version,
      maxContextTokens: this.config.capabilities.maxContextTokens,
      supportsStreaming: this.config.capabilities.supportsStreaming,
      supportsFunctionCalling: this.config.capabilities.supportsFunctionCalling,
      supportsJSONMode: this.config.capabilities.supportsJSONMode,
      supportsVision: this.config.capabilities.supportsVision,
      supportsToolUse: this.config.capabilities.supportsToolUse,
      supportsBatching: this.config.capabilities.supportsBatching,
      supportsCaching: this.config.capabilities.supportsCaching,
      costProfile: {
        inputPrice: this.config.cost.inputPricePer1M,
        outputPrice: this.config.cost.outputPricePer1M,
        cachedInputPrice: this.config.cost.cachedInputPricePer1M,
      },
      performanceProfile: {
        targetResponseTime: this.config.performance.targetResponseTime,
        maxConcurrentRequests: this.config.performance.maxConcurrentRequests,
      },
      optimalFor: [
        'Quick completions',
        'Simple refactoring',
        'Code formatting',
        'Basic code generation',
        'Simple unit tests',
        'Syntax checking',
        'Code review',
        'Documentation',
      ],
    };
  }

  /**
   * Get current metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    const cacheHitRate = this.metrics.totalRequests > 0
      ? (this.metrics.cacheHits / this.metrics.totalRequests) * 100
      : 0;
      
    return {
      ...this.metrics,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      averageCostPerRequest: this.metrics.totalRequests > 0
        ? this.metrics.totalCost / this.metrics.totalRequests
        : 0,
    };
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Shutdown the client
   */
  async shutdown() {
    this.initialized = false;
    this.apiClient = null;
    this.cache.clear();
    this.emit('shutdown');
  }

  // Private methods

  _ensureInitialized() {
    if (!this.initialized) {
      throw new Error('GPT53Client not initialized. Call initialize() first.');
    }
  }

  async _loadOpenAI() {
    try {
      return require('openai');
    } catch {
      // Fallback to dynamic import if not installed
      return await import('openai');
    }
  }

  _initializeCache() {
    // Set up cache cleanup interval
    setInterval(() => {
      this._cleanupCache();
    }, 300000); // Clean every 5 minutes
  }

  _cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.cache.ttl * 1000) {
        this.cache.delete(key);
      }
    }
  }

  _getCacheKey(request) {
    const crypto = require('crypto');
    const data = JSON.stringify({
      type: request.type,
      prompt: request.prompt,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    });
    return this.config.cache.keyPrefix + crypto.createHash('sha256').update(data).digest('hex');
  }

  _getCachedResponse(cacheKey) {
    const entry = this.cache.get(cacheKey);
    if (entry && Date.now() - entry.timestamp < this.config.cache.ttl * 1000) {
      this.metrics.cacheHits++;
      return entry.data;
    }
    this.metrics.cacheMisses++;
    return null;
  }

  _cacheResponse(cacheKey, response) {
    if (this.cache.size >= this.config.cache.maxSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(cacheKey, {
      data: response,
      timestamp: Date.now(),
    });
  }

  async _executeRequest(request) {
    const startTime = Date.now();
    
    // Check cache
    if (this.config.cache.enabled && !request.skipCache) {
      const cacheKey = this._getCacheKey(request);
      const cached = this._getCachedResponse(cacheKey);
      if (cached) {
        return {
          ...cached,
          cached: true,
          latency: Date.now() - startTime,
        };
      }
    }

    try {
      const response = await this._callAPI(request);
      const latency = Date.now() - startTime;
      
      // Update metrics
      this.metrics.totalRequests++;
      this.metrics.totalTokens += (response.usage?.totalTokens || 0);
      this.metrics.totalCost += (response.cost?.totalCost || 0);
      this.metrics.averageLatency = 
        (this.metrics.averageLatency * (this.metrics.totalRequests - 1) + latency) / 
        this.metrics.totalRequests;

      const result = {
        content: response.content,
        usage: response.usage,
        cost: response.cost,
        latency,
        model: this.config.model.name,
        cached: false,
      };

      // Cache response
      if (this.config.cache.enabled && !request.skipCache) {
        this._cacheResponse(this._getCacheKey(request), result);
      }

      this.emit('requestComplete', result);
      return result;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async _callAPI(request) {
    const messages = [
      {
        role: 'system',
        content: this._getSystemPrompt(request.type),
      },
      {
        role: 'user',
        content: request.prompt,
      },
    ];

    const completion = await this.apiClient.chat.completions.create({
      model: this.config.model.name,
      messages,
      temperature: request.temperature ?? this.config.api.temperature,
      max_tokens: request.maxTokens,
      top_p: this.config.api.topP,
      frequency_penalty: this.config.api.frequencyPenalty,
      presence_penalty: this.config.api.presencePenalty,
      stream: false,
    });

    const content = completion.choices[0]?.message?.content || '';
    const usage = completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const cost = estimateUsage(usage.prompt_tokens, usage.completion_tokens);

    return {
      content,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
      cost,
    };
  }

  _getSystemPrompt(type) {
    const prompts = {
      quick_completion: 'You are a fast code completion assistant. Provide concise, accurate completions.',
      standard_refactoring: 'You are a code refactoring expert. Improve code while maintaining functionality.',
      code_generation: 'You are a code generation assistant. Produce clean, well-documented code.',
      unit_test_generation: 'You are a test generation specialist. Create comprehensive unit tests.',
      simple_analysis: 'You are a code analysis assistant. Provide clear, actionable insights.',
    };
    return prompts[type] || prompts.quick_completion;
  }

  _buildRefactoringPrompt(code, instructions) {
    return `Refactor the following code according to these instructions: ${instructions}

Code:
\`\`\`
${code}
\`\`\`

Provide the refactored code only.`;
  }

  _buildGenerationPrompt(requirements, context) {
    let prompt = `Generate code based on these requirements:
${requirements}`;

    if (context.language) {
      prompt += `\n\nLanguage: ${context.language}`;
    }
    if (context.framework) {
      prompt += `\nFramework: ${context.framework}`;
    }
    if (context.style) {
      prompt += `\nStyle: ${context.style}`;
    }

    prompt += '\n\nProvide clean, well-documented code.';
    return prompt;
  }

  _buildTestPrompt(code, options) {
    const framework = options.framework || 'jest';
    return `Generate unit tests for the following code using ${framework}:

\`\`\`
${code}
\`\`\`

Provide comprehensive tests covering:
- Normal cases
- Edge cases
- Error cases`;
  }

  _buildAnalysisPrompt(code, analysisType) {
    const analyses = {
      general: 'Provide a general analysis of this code.',
      complexity: 'Analyze the time and space complexity of this code.',
      security: 'Identify potential security issues in this code.',
      performance: 'Identify performance optimization opportunities.',
      maintainability: 'Assess the maintainability and suggest improvements.',
    };

    return `${analyses[analysisType] || analyses.general}

\`\`\`
${code}
\`\`\``;
  }
}

module.exports = { GPT53Client };
