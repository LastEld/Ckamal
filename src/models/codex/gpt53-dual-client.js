/**
 * Dual-Mode GPT Codex Client
 * Combines GPT 5.4 and 5.3 with automatic model selection
 */

'use strict';

const { GPT53Client } = require('./gpt53-client');
const { GPT53_CONFIG, estimateUsage, shouldUseGPT53 } = require('./gpt53-config');

/**
 * GPT 5.4 Client (placeholder - would be implemented similarly)
 * This represents the premium model for complex tasks
 */
class GPT54Client extends GPT53Client {
  constructor(options = {}) {
    super({
      ...options,
      model: {
        name: 'gpt-5.4-codex',
        version: '5.4',
        provider: 'openai',
        description: 'Premium coding model with 256K context',
      },
      context: {
        maxTokens: 256000,
        maxOutputTokens: 32768,
      },
      cost: {
        inputPricePer1M: 2.00,
        outputPricePer1M: 6.00,
        cachedInputPricePer1M: 1.00,
      },
    });
  }
}

/**
 * Task Complexity Analyzer
 * Determines task complexity for model selection
 */
class TaskComplexityAnalyzer {
  /**
   * Analyze task complexity
   * @param {Object} task - Task to analyze
   * @returns {Object} Complexity analysis
   */
  analyze(task) {
    const factors = {
      tokenCount: this._estimateTokenCount(task),
      cognitiveComplexity: this._assessCognitiveComplexity(task),
      contextDepth: this._assessContextDepth(task),
      noveltyFactor: this._assessNovelty(task),
      precisionRequired: this._assessPrecision(task),
    };

    const complexityScore = this._calculateComplexityScore(factors);
    
    return {
      score: complexityScore,
      level: this._getComplexityLevel(complexityScore),
      factors,
      recommendedModel: complexityScore > 0.6 ? 'gpt-5.4' : 'gpt-5.3',
      estimatedTokens: factors.tokenCount,
    };
  }

  _estimateTokenCount(task) {
    const text = task.prompt || task.code || task.requirements || '';
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  _assessCognitiveComplexity(task) {
    const complexityIndicators = [
      'architect', 'design pattern', 'algorithm', 'optimize', 'refactor',
      'complex', 'integration', 'system', 'framework', 'library',
      'concurrent', 'async', 'thread', 'performance', 'scale',
    ];
    
    const text = (task.prompt || task.requirements || '').toLowerCase();
    const matches = complexityIndicators.filter(ind => text.includes(ind)).length;
    return Math.min(matches / 5, 1.0);
  }

  _assessContextDepth(task) {
    const text = task.prompt || task.code || '';
    const lines = text.split('\n').length;
    
    if (lines < 50) return 0.2;
    if (lines < 200) return 0.4;
    if (lines < 500) return 0.6;
    if (lines < 1000) return 0.8;
    return 1.0;
  }

  _assessNovelty(task) {
    const noveltyIndicators = [
      'new feature', 'implement', 'create', 'build', 'design',
      'innovative', 'novel', 'unique', 'custom',
    ];
    
    const text = (task.prompt || task.requirements || '').toLowerCase();
    const matches = noveltyIndicators.filter(ind => text.includes(ind)).length;
    return Math.min(matches / 3, 1.0);
  }

  _assessPrecision(task) {
    const precisionIndicators = [
      'exact', 'precise', 'correct', 'accurate', 'bug fix',
      'security', 'critical', 'production', 'deploy',
    ];
    
    const text = (task.prompt || task.requirements || '').toLowerCase();
    const matches = precisionIndicators.filter(ind => text.includes(ind)).length;
    return Math.min(matches / 3, 1.0);
  }

  _calculateComplexityScore(factors) {
    const weights = {
      tokenCount: 0.25,
      cognitiveComplexity: 0.30,
      contextDepth: 0.20,
      noveltyFactor: 0.15,
      precisionRequired: 0.10,
    };

    // Normalize token count
    const normalizedTokens = Math.min(factors.tokenCount / 64000, 1.0);

    return (
      normalizedTokens * weights.tokenCount +
      factors.cognitiveComplexity * weights.cognitiveComplexity +
      factors.contextDepth * weights.contextDepth +
      factors.noveltyFactor * weights.noveltyFactor +
      factors.precisionRequired * weights.precisionRequired
    );
  }

  _getComplexityLevel(score) {
    if (score < 0.3) return 'simple';
    if (score < 0.6) return 'moderate';
    if (score < 0.8) return 'complex';
    return 'very_complex';
  }
}

/**
 * Dual-Mode GPT Codex Client
 * Automatically selects between GPT 5.3 and 5.4
 */
class DualModeCodexClient {
  constructor(options = {}) {
    this.gpt53 = new GPT53Client(options.gpt53);
    this.gpt54 = new GPT54Client(options.gpt54);
    this.analyzer = new TaskComplexityAnalyzer();
    
    this.selectionMode = options.selectionMode || 'auto'; // 'auto', '53', '54', 'cost', 'speed'
    this.costBudget = options.costBudget || 1.00;
    this.speedPriority = options.speedPriority || false;
    
    this.metrics = {
      gpt53Usage: { requests: 0, tokens: 0, cost: 0 },
      gpt54Usage: { requests: 0, tokens: 0, cost: 0 },
      savingsVsGPT54: 0,
    };
    
    this.comparisonHistory = [];
  }

  /**
   * Initialize both clients
   * @returns {Promise<boolean>}
   */
  async initialize() {
    await Promise.all([
      this.gpt53.initialize(),
      this.gpt54.initialize(),
    ]);
    return true;
  }

  /**
   * Execute task with automatic model selection
   * @param {Object} task - Task to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Task result
   */
  async execute(task, options = {}) {
    const selection = await this.selectModel(task, options);
    const client = selection.model === 'gpt-5.3' ? this.gpt53 : this.gpt54;
    
    const startTime = Date.now();
    
    try {
      const result = await this._executeWithClient(client, task, options);
      const latency = Date.now() - startTime;
      
      // Update metrics
      this._updateMetrics(selection.model, result.usage, result.cost);
      
      return {
        ...result,
        modelUsed: selection.model,
        selection,
        latency,
      };
    } catch (error) {
      // Fallback to GPT 5.4 if GPT 5.3 fails on complex task
      if (selection.model === 'gpt-5.3' && this._shouldFallback(error)) {
        const fallbackResult = await this._executeWithClient(this.gpt54, task, options);
        return {
          ...fallbackResult,
          modelUsed: 'gpt-5.4',
          fallback: true,
          originalError: error.message,
          latency: Date.now() - startTime,
        };
      }
      throw error;
    }
  }

  /**
   * Select the appropriate model for a task
   * @param {Object} task - Task to analyze
   * @param {Object} options - Selection options
   * @returns {Object} Model selection
   */
  async selectModel(task, options = {}) {
    // Override with explicit mode
    if (options.model) {
      return {
        model: options.model,
        reason: 'explicit_selection',
        confidence: 1.0,
      };
    }

    // Mode-based selection
    switch (this.selectionMode) {
      case '53':
        return { model: 'gpt-5.3', reason: 'mode:cost_optimized', confidence: 1.0 };
      case '54':
        return { model: 'gpt-5.4', reason: 'mode:premium', confidence: 1.0 };
      case 'speed':
        return { model: 'gpt-5.3', reason: 'mode:speed_priority', confidence: 1.0 };
      default:
        return this._autoSelect(task, options);
    }
  }

  /**
   * Compare costs between models for a task
   * @param {Object} task - Task to compare
   * @returns {Object} Cost comparison
   */
  async compareModels(task) {
    const analysis = this.analyzer.analyze(task);
    const estimatedInputTokens = analysis.estimatedTokens;
    const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.5); // Estimate 50% output

    const usage = estimateUsage(estimatedInputTokens, estimatedOutputTokens);

    return {
      estimatedInputTokens,
      estimatedOutputTokens,
      totalTokens: usage.totalTokens,
      gpt53: {
        estimatedLatency: this._estimateLatency(task, 'gpt-5.3'),
      },
      gpt54: {
        estimatedLatency: this._estimateLatency(task, 'gpt-5.4'),
      },
      recommendation: analysis.recommendedModel,
    };
  }

  /**
   * Quick completion with auto-selection
   */
  async quickCompletion(prompt, options = {}) {
    return this.execute({ type: 'quick_completion', prompt, ...options }, options);
  }

  /**
   * Standard refactoring with auto-selection
   */
  async standardRefactoring(code, instructions, options = {}) {
    return this.execute({ 
      type: 'standard_refactoring', 
      code, 
      instructions, 
      ...options 
    }, options);
  }

  /**
   * Code generation with auto-selection
   */
  async codeGeneration(requirements, context = {}, options = {}) {
    return this.execute({ 
      type: 'code_generation', 
      requirements, 
      context, 
      ...options 
    }, options);
  }

  /**
   * Unit test generation with auto-selection
   */
  async unitTestGeneration(code, options = {}) {
    return this.execute({ 
      type: 'unit_test_generation', 
      code, 
      ...options 
    }, options);
  }

  /**
   * Simple analysis with auto-selection
   */
  async simpleAnalysis(code, analysisType = 'general', options = {}) {
    return this.execute({ 
      type: 'simple_analysis', 
      code, 
      analysisType, 
      ...options 
    }, options);
  }

  /**
   * Get combined capabilities
   */
  getCapabilities() {
    return {
      models: {
        gpt53: this.gpt53.getCapabilities(),
        gpt54: this.gpt54.getCapabilities(),
      },
      selectionModes: ['auto', '53', '54', 'cost', 'speed'],
      autoSelection: {
        enabled: true,
        factors: [
          'Token count',
          'Cognitive complexity',
          'Context depth',
          'Novelty factor',
          'Precision requirements',
        ],
      },
    };
  }

  /**
   * Get usage metrics
   */
  getMetrics() {
    const totalRequests = this.metrics.gpt53Usage.requests + this.metrics.gpt54Usage.requests;
    const totalCost = this.metrics.gpt53Usage.cost + this.metrics.gpt54Usage.cost;
    
    return {
      ...this.metrics,
      totalRequests,
      totalCost,
      gpt53Percentage: totalRequests > 0 
        ? Math.round((this.metrics.gpt53Usage.requests / totalRequests) * 100) 
        : 0,
      averageSavingsPerRequest: totalRequests > 0 
        ? this.metrics.savingsVsGPT54 / totalRequests 
        : 0,
      comparisonHistory: this.comparisonHistory.slice(-10),
    };
  }

  /**
   * Set selection mode
   */
  setSelectionMode(mode) {
    const validModes = ['auto', '53', '54', 'cost', 'speed'];
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Valid modes: ${validModes.join(', ')}`);
    }
    this.selectionMode = mode;
  }

  /**
   * Shutdown both clients
   */
  async shutdown() {
    await Promise.all([
      this.gpt53.shutdown(),
      this.gpt54.shutdown(),
    ]);
  }

  // Private methods

  _autoSelect(task, options) {
    const analysis = this.analyzer.analyze(task);
    
    // Force 5.4 for very complex tasks
    if (analysis.level === 'very_complex') {
      return {
        model: 'gpt-5.4',
        reason: 'high_complexity',
        confidence: analysis.score,
        analysis,
      };
    }

    // Force 5.4 for large contexts
    if (analysis.estimatedTokens > 120000) {
      return {
        model: 'gpt-5.4',
        reason: 'large_context',
        confidence: 1.0,
        analysis,
      };
    }

    // Speed priority -> 5.3
    if (this.speedPriority || options.speedPriority) {
      return {
        model: 'gpt-5.3',
        reason: 'speed_priority',
        confidence: 0.8,
        analysis,
      };
    }

    // Default to 5.3 for simple/moderate tasks
    if (analysis.score < 0.6) {
      return {
        model: 'gpt-5.3',
        reason: 'cost_optimized',
        confidence: 1.0 - analysis.score,
        analysis,
      };
    }

    return {
      model: 'gpt-5.4',
      reason: 'high_quality_required',
      confidence: analysis.score,
      analysis,
    };
  }

  async _executeWithClient(client, task, options) {
    const methodMap = {
      quick_completion: () => client.quickCompletion(task.prompt, options),
      standard_refactoring: () => client.standardRefactoring(task.code, task.instructions, options),
      code_generation: () => client.codeGeneration(task.requirements, task.context, options),
      unit_test_generation: () => client.unitTestGeneration(task.code, options),
      simple_analysis: () => client.simpleAnalysis(task.code, task.analysisType, options),
    };

    const method = methodMap[task.type];
    if (!method) {
      throw new Error(`Unknown task type: ${task.type}`);
    }

    return method();
  }

  _updateMetrics(model, usage, cost) {
    const key = model === 'gpt-5.3' ? 'gpt53Usage' : 'gpt54Usage';
    this.metrics[key].requests++;
    this.metrics[key].tokens += usage?.totalTokens || 0;
    this.metrics[key].cost += cost?.totalCost || 0;

    // Calculate savings vs using GPT 5.4 for everything
    if (model === 'gpt-5.3') {
      const estimated54Cost = (cost?.totalCost || 0) * 4; // 5.4 is ~4x more expensive
      this.metrics.savingsVsGPT54 += estimated54Cost - (cost?.totalCost || 0);
    }
  }

  _shouldFallback(error) {
    const fallbackErrors = [
      'context_length_exceeded',
      'max_tokens_exceeded',
      'complexity_too_high',
    ];
    return fallbackErrors.some(e => error.message?.includes(e) || error.code?.includes(e));
  }

  _estimateLatency(task, model) {
    const baseLatency = model === 'gpt-5.3' ? 1000 : 2000;
    const tokenFactor = this.analyzer.analyze(task).estimatedTokens / 1000;
    return Math.round(baseLatency + tokenFactor * 100);
  }
}

module.exports = {
  DualModeCodexClient,
  TaskComplexityAnalyzer,
  GPT54Client,
};
