/**
 * AI Optimizer - Model selection and request optimization
 * @module intelligence/optimizer
 */

/**
 * Model capability definition
 * @typedef {Object} ModelCapabilities
 * @property {string[]} tasks - Supported task types
 * @property {number} maxTokens - Maximum token capacity
 * @property {number} costPer1kTokens - Cost per 1000 tokens
 * @property {number} avgLatencyMs - Average latency in milliseconds
 * @property {number} qualityScore - Quality rating (0-1)
 */

/**
 * Task constraints for model selection
 * @typedef {Object} TaskConstraints
 * @property {number} [maxLatencyMs] - Maximum acceptable latency
 * @property {number} [maxCost] - Maximum acceptable cost
 * @property {number} [minQuality] - Minimum quality threshold
 * @property {string} [preferredProvider] - Preferred model provider
 */

/**
 * Optimized request result
 * @typedef {Object} OptimizedRequest
 * @property {string} selectedModel - Selected model identifier
 * @property {Object} parameters - Optimized parameters
 * @property {number} estimatedCost - Estimated cost
 * @property {number} estimatedLatency - Estimated latency
 * @property {number} confidence - Optimization confidence score
 */

/**
 * AI Optimizer for intelligent model selection and request optimization
 */
export class AIOptimizer {
  /**
   * Create an AI Optimizer
   * @param {Object} options - Configuration options
   * @param {Object.<string, ModelCapabilities>} options.models - Available models
   * @param {Object} options.defaultConstraints - Default constraints
   */
  constructor(options = {}) {
    this.models = options.models || this.getDefaultModels();
    this.defaultConstraints = options.defaultConstraints || {};
    this.requestHistory = [];
    this.performanceMetrics = new Map();
  }

  /**
   * Get default model definitions
   * @returns {Object.<string, ModelCapabilities>}
   */
  getDefaultModels() {
    return {
      'gpt-4': {
        tasks: ['complex', 'creative', 'analysis', 'code', 'reasoning'],
        maxTokens: 8192,
        costPer1kTokens: 0.03,
        avgLatencyMs: 2500,
        qualityScore: 0.95
      },
      'gpt-3.5-turbo': {
        tasks: ['simple', 'chat', 'classification', 'extraction'],
        maxTokens: 4096,
        costPer1kTokens: 0.0015,
        avgLatencyMs: 800,
        qualityScore: 0.78
      },
      'claude-3-opus': {
        tasks: ['complex', 'creative', 'analysis', 'code', 'long-context'],
        maxTokens: 200000,
        costPer1kTokens: 0.015,
        avgLatencyMs: 3000,
        qualityScore: 0.96
      },
      'claude-3-sonnet': {
        tasks: ['balanced', 'analysis', 'code', 'chat'],
        maxTokens: 200000,
        costPer1kTokens: 0.003,
        avgLatencyMs: 1500,
        qualityScore: 0.88
      }
    };
  }

  /**
   * Optimize a request for best model and parameters
   * @param {Object} request - Request to optimize
   * @param {string} request.task - Task type
   * @param {string} request.content - Request content
   * @param {TaskConstraints} [request.constraints] - Task constraints
   * @returns {OptimizedRequest} Optimized request configuration
   */
  optimizeRequest(request) {
    const { task, content, constraints = {} } = request;
    const mergedConstraints = { ...this.defaultConstraints, ...constraints };
    
    const estimatedTokens = this.estimateTokens(content);
    const selectedModel = this.selectModel(task, mergedConstraints, estimatedTokens);
    
    const parameters = this.optimizeParameters(selectedModel, task, estimatedTokens);
    const estimatedCost = this.estimateCost({ tokens: estimatedTokens }, selectedModel);
    const estimatedLatency = this.estimateLatency({ tokens: estimatedTokens }, selectedModel);
    
    const result = {
      selectedModel,
      parameters,
      estimatedCost,
      estimatedLatency,
      confidence: this.calculateConfidence(selectedModel, task, mergedConstraints)
    };

    this.requestHistory.push({
      timestamp: Date.now(),
      request,
      optimization: result
    });

    return result;
  }

  /**
   * Select the best model for a task
   * @param {string} task - Task type
   * @param {TaskConstraints} constraints - Task constraints
   * @param {number} [estimatedTokens] - Estimated token count
   * @returns {string} Selected model identifier
   */
  selectModel(task, constraints, estimatedTokens = 1000) {
    const candidates = Object.entries(this.models).filter(([_, capabilities]) => {
      // Check task support
      if (!capabilities.tasks.includes(task) && !capabilities.tasks.includes('general')) {
        return false;
      }
      
      // Check token capacity
      if (estimatedTokens > capabilities.maxTokens) {
        return false;
      }
      
      // Check latency constraint
      if (constraints.maxLatencyMs && capabilities.avgLatencyMs > constraints.maxLatencyMs) {
        return false;
      }
      
      // Check quality constraint
      if (constraints.minQuality && capabilities.qualityScore < constraints.minQuality) {
        return false;
      }
      
      return true;
    });

    if (candidates.length === 0) {
      // Fallback to model with highest quality
      return Object.entries(this.models)
        .sort((a, b) => b[1].qualityScore - a[1].qualityScore)[0]?.[0] || 'gpt-3.5-turbo';
    }

    // Score candidates based on weighted criteria
    const scored = candidates.map(([name, caps]) => {
      let score = 0;
      
      // Quality score (40%)
      score += caps.qualityScore * 0.4;
      
      // Cost efficiency (30%) - inverse of cost
      const maxCost = Math.max(...candidates.map(c => c[1].costPer1kTokens));
      score += (1 - caps.costPer1kTokens / maxCost) * 0.3;
      
      // Speed score (20%) - inverse of latency
      const maxLatency = Math.max(...candidates.map(c => c[1].avgLatencyMs));
      score += (1 - caps.avgLatencyMs / maxLatency) * 0.2;
      
      // Task match bonus (10%)
      const taskIndex = caps.tasks.indexOf(task);
      if (taskIndex !== -1) {
        score += (1 - taskIndex / caps.tasks.length) * 0.1;
      }
      
      return { name, score, caps };
    });

    return scored.sort((a, b) => b.score - a.score)[0].name;
  }

  /**
   * Estimate cost for a task with a specific model
   * @param {Object} task - Task details
   * @param {number} task.tokens - Estimated token count
   * @param {string} model - Model identifier
   * @returns {number} Estimated cost in USD
   */
  estimateCost(task, model) {
    const modelCaps = this.models[model];
    if (!modelCaps) return 0;
    
    const tokens = task.tokens || 1000;
    return (tokens / 1000) * modelCaps.costPer1kTokens;
  }

  /**
   * Estimate latency for a task with a specific model
   * @param {Object} task - Task details
   * @param {number} task.tokens - Estimated token count
   * @param {string} model - Model identifier
   * @returns {number} Estimated latency in milliseconds
   */
  estimateLatency(task, model) {
    const modelCaps = this.models[model];
    if (!modelCaps) return 1000;
    
    const tokens = task.tokens || 1000;
    // Scale latency with token count
    return modelCaps.avgLatencyMs * (1 + (tokens / modelCaps.maxTokens) * 0.5);
  }

  /**
   * Optimize multiple requests as a batch
   * @param {Object[]} requests - Array of requests
   * @returns {Object} Batch optimization result
   */
  batchOptimize(requests) {
    const optimizations = requests.map(req => this.optimizeRequest(req));
    
    // Group by model for efficiency
    const byModel = optimizations.reduce((acc, opt, idx) => {
      if (!acc[opt.selectedModel]) acc[opt.selectedModel] = [];
      acc[opt.selectedModel].push({ index: idx, optimization: opt });
      return acc;
    }, {});

    const totalCost = optimizations.reduce((sum, opt) => sum + opt.estimatedCost, 0);
    const maxLatency = Math.max(...optimizations.map(opt => opt.estimatedLatency));
    const avgConfidence = optimizations.reduce((sum, opt) => sum + opt.confidence, 0) / optimizations.length;

    return {
      optimizations,
      groupedByModel: byModel,
      totalCost,
      maxLatency,
      avgConfidence,
      recommendedOrder: this.optimizeBatchOrder(optimizations)
    };
  }

  /**
   * Optimize parameters for a model and task
   * @private
   * @param {string} model - Model identifier
   * @param {string} task - Task type
   * @param {number} tokens - Estimated tokens
   * @returns {Object} Optimized parameters
   */
  optimizeParameters(model, task, tokens) {
    const baseParams = {
      temperature: 0.7,
      max_tokens: Math.min(2048, tokens * 2)
    };

    switch (task) {
      case 'code':
        return { ...baseParams, temperature: 0.2, top_p: 0.95 };
      case 'creative':
        return { ...baseParams, temperature: 0.9, top_p: 0.98 };
      case 'classification':
        return { ...baseParams, temperature: 0.1, max_tokens: 100 };
      case 'analysis':
        return { ...baseParams, temperature: 0.3, max_tokens: 4096 };
      default:
        return baseParams;
    }
  }

  /**
   * Estimate token count from content
   * @private
   * @param {string} content - Content to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(content) {
    // Rough estimate: ~4 characters per token
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate confidence score for optimization
   * @private
   * @param {string} model - Selected model
   * @param {string} task - Task type
   * @param {TaskConstraints} constraints - Constraints
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(model, task, constraints) {
    const caps = this.models[model];
    let confidence = caps.qualityScore;
    
    // Reduce confidence if task is not in primary tasks
    if (!caps.tasks.slice(0, 3).includes(task)) {
      confidence *= 0.85;
    }
    
    // Boost confidence if we have history with this combination
    const historyMatch = this.requestHistory.filter(h => 
      h.optimization.selectedModel === model && h.request.task === task
    ).length;
    confidence = Math.min(0.99, confidence + (historyMatch * 0.01));
    
    return confidence;
  }

  /**
   * Optimize batch execution order
   * @private
   * @param {OptimizedRequest[]} optimizations - Optimized requests
   * @returns {number[]} Recommended execution order (indices)
   */
  optimizeBatchOrder(optimizations) {
    // Sort by latency (ascending) and confidence (descending)
    return optimizations
      .map((opt, idx) => ({ idx, latency: opt.estimatedLatency, confidence: opt.confidence }))
      .sort((a, b) => (a.latency / a.confidence) - (b.latency / b.confidence))
      .map(item => item.idx);
  }

  /**
   * Update performance metrics for a model
   * @param {string} model - Model identifier
   * @param {Object} metrics - Performance metrics
   * @param {number} metrics.actualLatency - Actual latency
   * @param {number} metrics.actualCost - Actual cost
   * @param {number} metrics.qualityRating - Quality rating (0-1)
   */
  updateMetrics(model, metrics) {
    if (!this.performanceMetrics.has(model)) {
      this.performanceMetrics.set(model, []);
    }
    this.performanceMetrics.get(model).push({
      timestamp: Date.now(),
      ...metrics
    });
  }
}

export default AIOptimizer;
