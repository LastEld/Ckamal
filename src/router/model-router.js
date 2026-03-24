/**
 * @fileoverview Multi-Model Router with multi-factor scoring algorithm.
 * Routes tasks to optimal models based on Quality (40%), Cost (30%), Latency (20%), Load (10%).
 * @module router/model-router
 */

import { EventEmitter } from 'events';
import {
  getSubscriptionModelProfiles,
  normalizeModelId
} from '../clients/catalog.js';

/**
 * @typedef {Object} ModelCapabilities
 * @property {string[]} features - Supported features (vision, reasoning, code, etc.)
 * @property {number} maxTokens - Maximum token context
 * @property {string[]} languages - Supported programming languages
 * @property {string[]} domains - Specialized domains
 */

/**
 * @typedef {Object} ModelProfile
 * @property {string} id - Model identifier
 * @property {string} name - Human-readable name
 * @property {string} provider - Provider (anthropic, openai, moonshot, etc.)
 * @property {number} qualityScore - Quality score (0-1)
 * @property {number} costPer1kTokens - Cost per 1000 tokens
 * @property {number} avgLatencyMs - Average latency in milliseconds
 * @property {number} currentLoad - Current load (0-1)
 * @property {number} maxConcurrency - Maximum concurrent requests
 * @property {ModelCapabilities} capabilities - Model capabilities
 * @property {boolean} available - Availability status
 * @property {number} successRate - Historical success rate (0-1)
 * @property {number} lastUsed - Last used timestamp
 */

/**
 * @typedef {Object} TaskDefinition
 * @property {string} id - Task identifier
 * @property {string} type - Task type (code, analysis, creative, etc.)
 * @property {string} content - Task content/prompt
 * @property {Object} [context] - Task context
 * @property {number} [priority=5] - Task priority (1-10)
 * @property {number} [maxCost] - Maximum cost budget
 * @property {number} [maxLatency] - Maximum latency in ms
 * @property {string[]} [requiredFeatures] - Required model features
 * @property {string} [preferredModel] - Preferred model ID
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} RouteResult
 * @property {string} modelId - Selected model ID
 * @property {string} provider - Model provider
 * @property {number} score - Total score (0-1)
 * @property {Object} scores - Individual factor scores
 * @property {number} estimatedCost - Estimated cost
 * @property {number} estimatedLatency - Estimated latency
 * @property {string} complexity - Task complexity level
 * @property {number} confidence - Routing confidence (0-1)
 * @property {string} strategy - Routing strategy used
 */

/**
 * Scoring weights for multi-factor routing
 */
export const SCORING_WEIGHTS = {
  QUALITY: 0.40,
  COST: 0.30,
  LATENCY: 0.20,
  LOAD: 0.10
};

/**
 * Task complexity levels
 */
export const COMPLEXITY_LEVELS = {
  SIMPLE: { min: 1, max: 3, label: 'simple' },
  MODERATE: { min: 4, max: 6, label: 'moderate' },
  COMPLEX: { min: 7, max: 8, label: 'complex' },
  CRITICAL: { min: 9, max: 10, label: 'critical' }
};

/**
 * Multi-Model Router with intelligent task routing
 * @extends EventEmitter
 */
export class ModelRouter extends EventEmitter {
  /**
   * Creates an instance of ModelRouter
   * @param {Object} options - Router configuration
   * @param {Object} options.weights - Custom scoring weights
   * @param {number} options.fallbackThreshold - Score threshold for fallback (default: 0.3)
   * @param {boolean} options.enableCache - Enable route caching
   * @param {number} options.cacheTTL - Cache TTL in ms (default: 5 min)
   */
  constructor(options = {}) {
    super();
    
    this.weights = {
      ...SCORING_WEIGHTS,
      ...options.weights
    };
    
    this.fallbackThreshold = options.fallbackThreshold ?? 0.3;
    this.enableCache = options.enableCache ?? true;
    this.cacheTTL = options.cacheTTL ?? 300000;
    
    /** @type {Map<string, ModelProfile>} */
    this.models = new Map();
    
    /** @type {Map<string, RouteResult>} */
    this.routeCache = new Map();
    
    /** @type {Map<string, Function>} */
    this.modelExecutors = new Map();
    
    /** @type {Object} */
    this.metrics = {
      totalRoutes: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgRoutingTime: 0,
      fallbackCount: 0
    };
    
    /** @type {Object} */
    this.routingHistory = {
      routes: [],
      maxHistory: 1000
    };
    
    this.initialized = false;
  }
  
  /**
   * Initialize the router
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    // Register default models
    this.registerDefaultModels();
    
    this.initialized = true;
    this.emit('initialized');
  }
  
  /**
   * Register default models
   * @private
   */
  registerDefaultModels() {
    for (const profile of getSubscriptionModelProfiles()) {
      this.registerModel(profile);
    }
  }
  
  /**
   * Register a model
   * @param {ModelProfile} profile - Model profile
   * @returns {void}
   */
  registerModel(profile) {
    const canonicalId = normalizeModelId(profile.id);

    if (!canonicalId || !profile.provider) {
      throw new Error('Model must have id and provider');
    }
    
    this.models.set(canonicalId, {
      ...profile,
      id: canonicalId,
      qualityScore: profile.qualityScore ?? 0.8,
      currentLoad: profile.currentLoad ?? 0,
      avgLatencyMs: profile.avgLatencyMs ?? 1000,
      successRate: profile.successRate ?? 0.95,
      lastUsed: Date.now()
    });
    
    this.emit('modelRegistered', { modelId: canonicalId, provider: profile.provider });
  }
  
  /**
   * Unregister a model
   * @param {string} modelId - Model identifier
   * @returns {boolean}
   */
  unregisterModel(modelId) {
    const canonicalId = normalizeModelId(modelId);
    const removed = this.models.delete(canonicalId);
    if (removed) {
      this.emit('modelUnregistered', { modelId: canonicalId });
    }
    return removed;
  }
  
  /**
   * Register a model executor function
   * @param {string} modelId - Model identifier
   * @param {Function} executor - Executor function(task) => Promise<result>
   */
  registerExecutor(modelId, executor) {
    const canonicalId = normalizeModelId(modelId);
    this.modelExecutors.set(canonicalId, executor);

    const model = this.models.get(canonicalId);
    if (model) {
      model.available = true;
    }
  }
  
  /**
   * Route a task to the best model
   * @param {TaskDefinition} task - Task definition
   * @returns {Promise<RouteResult>} Routing result
   */
  async routeTask(task) {
    const startTime = Date.now();
    this.metrics.totalRoutes++;
    
    // Check cache
    const cacheKey = this.generateCacheKey(task);
    if (this.enableCache) {
      const cached = this.routeCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
        this.metrics.cacheHits++;
        return { ...cached.result, fromCache: true };
      }
    }
    this.metrics.cacheMisses++;
    
    // Analyze task complexity
    const complexity = this.analyzeTaskComplexity(task);
    
    // Get model scores
    const scores = this.getModelScores(task, complexity);
    
    // Select best model, honoring explicit preferred model requests when possible
    const preferredModelId = normalizeModelId(task.preferredModel);
    const preferred = preferredModelId
      ? scores.find((score) => score.modelId === preferredModelId)
      : null;
    const selected = preferred
      ? this.selectModel([preferred])
      : this.selectModel(scores);
    
    // Build result
    const result = {
      modelId: selected.modelId,
      provider: selected.provider,
      score: selected.totalScore,
      scores: selected.scores,
      estimatedCost: selected.estimatedCost,
      estimatedLatency: selected.estimatedLatency,
      complexity: complexity.level,
      confidence: selected.confidence,
      strategy: preferred ? 'preferred_model' : 'multi_factor_scoring',
      timestamp: new Date().toISOString()
    };
    
    // Cache result
    if (this.enableCache) {
      this.routeCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
    }
    
    // Update metrics
    const routingTime = Date.now() - startTime;
    this.metrics.avgRoutingTime = 
      (this.metrics.avgRoutingTime * (this.metrics.totalRoutes - 1) + routingTime) / this.metrics.totalRoutes;
    
    // Record in history
    this.recordRoute(task, result);
    
    this.emit('taskRouted', { taskId: task.id, modelId: result.modelId, score: result.score });
    
    return result;
  }
  
  /**
   * Analyze task complexity (1-10)
   * @param {TaskDefinition} task - Task definition
   * @returns {Object} Complexity analysis
   */
  analyzeTaskComplexity(task) {
    let score = 5; // Base complexity
    const factors = [];
    
    const content = task.content || '';
    const contentLength = content.length;
    
    // Content length factor
    if (contentLength > 10000) {
      score += 2;
      factors.push('very_long_content');
    } else if (contentLength > 5000) {
      score += 1;
      factors.push('long_content');
    } else if (contentLength < 500) {
      score -= 1;
      factors.push('short_content');
    }
    
    // Code complexity indicators
    const codeIndicators = [
      /function\s+\w+\s*\([^)]*\)\s*\{/g,
      /class\s+\w+/g,
      /async\s+/g,
      /await\s+/g,
      /import\s+/g,
      /export\s+/g
    ];
    
    let codeComplexity = 0;
    for (const pattern of codeIndicators) {
      const matches = content.match(pattern);
      if (matches) codeComplexity += matches.length;
    }
    
    if (codeComplexity > 20) {
      score += 2;
      factors.push('high_code_complexity');
    } else if (codeComplexity > 10) {
      score += 1;
      factors.push('moderate_code_complexity');
    }
    
    // Analysis depth indicators
    const analysisIndicators = [
      /analyze|analysis|evaluate|assess/gi,
      /compare|contrast|differentiate/gi,
      /optimize|improve|enhance/gi,
      /refactor|restructure|redesign/gi,
      /architecture|design|pattern/gi,
      /algorithm|complexity|performance/gi
    ];
    
    let analysisDepth = 0;
    for (const pattern of analysisIndicators) {
      if (pattern.test(content)) analysisDepth++;
    }
    
    if (analysisDepth > 4) {
      score += 2;
      factors.push('deep_analysis');
    } else if (analysisDepth > 2) {
      score += 1;
      factors.push('moderate_analysis');
    }
    
    // Task type adjustments
    const taskType = (task.type || '').toLowerCase();
    const typeModifiers = {
      'code': 1,
      'refactor': 2,
      'architecture': 3,
      'analysis': 2,
      'review': 1,
      'test': 1,
      'debug': 2,
      'optimize': 2,
      'simple': -2,
      'quick': -1
    };
    
    for (const [type, modifier] of Object.entries(typeModifiers)) {
      if (taskType.includes(type)) {
        score += modifier;
        factors.push(`type_${type}`);
        break;
      }
    }
    
    // Priority adjustment
    const priority = task.priority || 5;
    if (priority >= 9) {
      score += 1;
      factors.push('high_priority');
    } else if (priority <= 2) {
      score -= 1;
      factors.push('low_priority');
    }
    
    // Cap score
    score = Math.min(10, Math.max(1, score));
    
    // Determine level
    let level = 'moderate';
    for (const [name, range] of Object.entries(COMPLEXITY_LEVELS)) {
      if (score >= range.min && score <= range.max) {
        level = range.label;
        break;
      }
    }
    
    return {
      score,
      level,
      factors,
      timestamp: Date.now()
    };
  }
  
  /**
   * Get model scores for a task
   * @param {TaskDefinition} task - Task definition
   * @param {Object} complexity - Complexity analysis
   * @returns {Array<Object>} Scored models
   */
  getModelScores(task, complexity) {
    const scores = [];
    
    for (const [modelId, model] of this.models) {
      if (!model.available) continue;
      
      // Check feature requirements
      if (task.requiredFeatures) {
        const hasAllFeatures = task.requiredFeatures.every(f => 
          model.capabilities.features.includes(f)
        );
        if (!hasAllFeatures) continue;
      }
      
      // Check context requirements
      const estimatedTokens = Math.ceil((task.content?.length || 0) / 4);
      if (estimatedTokens > model.capabilities.maxTokens * 0.8) continue;
      
      // Calculate individual scores
      const qualityScore = model.qualityScore;
      
      // Cost score (inverse, normalized to 0-1, lower cost = higher score)
      const maxCost = 0.1; // $0.10 per 1k tokens as max reference
      const costScore = Math.max(0, 1 - (model.costPer1kTokens / maxCost));
      
      // Latency score (inverse, normalized)
      const maxLatency = 2000; // 2 seconds as max reference
      const latencyScore = Math.max(0, 1 - (model.avgLatencyMs / maxLatency));
      
      // Load score (inverse, less loaded = higher score)
      const loadScore = 1 - model.currentLoad;
      
      // Capability match bonus
      let capabilityBonus = 0;
      if (task.type) {
        const taskDomain = this.getTaskDomain(task);
        if (model.capabilities.domains.includes(taskDomain)) {
          capabilityBonus = 0.1;
        }
      }
      
      // Success rate factor
      const reliabilityScore = model.successRate;
      
      // Calculate weighted total
      const totalScore = (
        qualityScore * this.weights.QUALITY +
        costScore * this.weights.COST +
        latencyScore * this.weights.LATENCY +
        loadScore * this.weights.LOAD
      ) * reliabilityScore + capabilityBonus;
      
      // Estimate cost and latency for this task
      const estimatedTaskTokens = Math.ceil((task.content?.length || 0) / 4);
      const estimatedCost = (estimatedTaskTokens / 1000) * model.costPer1kTokens;
      const estimatedLatency = model.avgLatencyMs * (1 + estimatedTaskTokens / 10000);
      
      // Check constraints
      if (task.maxCost && estimatedCost > task.maxCost) continue;
      if (task.maxLatency && estimatedLatency > task.maxLatency) continue;
      
      // Calculate confidence based on data quality
      const confidence = this.calculateConfidence(model, task);
      
      scores.push({
        modelId,
        provider: model.provider,
        totalScore: totalScore,
        scores: {
          quality: qualityScore,
          cost: costScore,
          latency: latencyScore,
          load: loadScore,
          reliability: reliabilityScore,
          capability: capabilityBonus
        },
        estimatedCost,
        estimatedLatency,
        confidence,
        model
      });
    }
    
    // Sort by total score descending
    scores.sort((a, b) => b.totalScore - a.totalScore);
    
    return scores;
  }
  
  /**
   * Select best model from scores
   * @param {Array<Object>} scores - Model scores
   * @returns {Object} Selected model with details
   */
  selectModel(scores) {
    if (scores.length === 0) {
      throw new Error('No suitable models found for task');
    }
    
    const best = scores[0];
    
    // If best score is below threshold, flag for fallback
    if (best.totalScore < this.fallbackThreshold) {
      this.metrics.fallbackCount++;
      this.emit('lowConfidenceRoute', { modelId: best.modelId, score: best.totalScore });
    }
    
    // Update model load
    const model = this.models.get(best.modelId);
    if (model) {
      model.currentLoad = Math.min(1, model.currentLoad + 0.1);
      model.lastUsed = Date.now();
    }
    
    return best;
  }
  
  /**
   * Fallback routing when primary model fails
   * @param {TaskDefinition} task - Original task
   * @param {string} failedModel - ID of failed model
   * @returns {Promise<RouteResult>} Fallback routing result
   */
  async fallbackRoute(task, failedModel) {
    const canonicalFailedModel = normalizeModelId(failedModel);
    this.emit('fallbackInitiated', { taskId: task.id, failedModel: canonicalFailedModel });
    
    // Mark failed model as temporarily unavailable
    const failed = this.models.get(canonicalFailedModel);
    if (failed) {
      failed.available = false;
      setTimeout(() => { failed.available = true; }, 60000); // Restore after 1 minute
    }
    
    // Re-route excluding the failed model
    const complexity = this.analyzeTaskComplexity(task);
    const scores = this.getModelScores(task, complexity)
      .filter(s => s.modelId !== canonicalFailedModel);
    
    if (scores.length === 0) {
      // All models failed, try the original again as last resort
      if (failed) {
        failed.available = true;
        return this.routeTask(task);
      }
      throw new Error('No fallback models available');
    }
    
    const fallback = scores[0];
    
    const result = {
      modelId: fallback.modelId,
      provider: fallback.provider,
      score: fallback.totalScore,
      scores: fallback.scores,
      estimatedCost: fallback.estimatedCost,
      estimatedLatency: fallback.estimatedLatency,
      complexity: complexity.level,
      confidence: fallback.confidence * 0.9, // Slightly lower confidence for fallback
      strategy: 'fallback_routing',
      fallbackFrom: canonicalFailedModel,
      timestamp: new Date().toISOString()
    };
    
    this.emit('fallbackComplete', { taskId: task.id, fallbackModel: fallback.modelId });
    
    return result;
  }
  
  /**
   * Execute task on routed model
   * @param {TaskDefinition} task - Task definition
   * @param {RouteResult} route - Routing result
   * @returns {Promise<Object>} Execution result
   */
  async executeOnModel(task, route) {
    const canonicalModelId = normalizeModelId(route.modelId);
    const executor = this.modelExecutors.get(canonicalModelId);
    if (!executor) {
      throw new Error(`No executor registered for model: ${canonicalModelId}`);
    }
    
    const startTime = Date.now();
    
    try {
      const result = await executor(task);
      
      // Update model stats on success
      const model = this.models.get(canonicalModelId);
      if (model) {
        model.successRate = model.successRate * 0.95 + 0.05; // Increase success rate
        model.currentLoad = Math.max(0, model.currentLoad - 0.1);
      }
      
      this.emit('executionComplete', {
        taskId: task.id,
        modelId: canonicalModelId,
        duration: Date.now() - startTime,
        success: true
      });
      
      return {
        success: true,
        result,
        modelId: canonicalModelId,
        duration: Date.now() - startTime
      };
    } catch (error) {
      // Update model stats on failure
      const model = this.models.get(canonicalModelId);
      if (model) {
        model.successRate = model.successRate * 0.95; // Decrease success rate
      }
      
      this.emit('executionFailed', {
        taskId: task.id,
        modelId: canonicalModelId,
        error: error.message
      });
      
      // Try fallback
      if (route.fallbackFrom === undefined) {
        const fallback = await this.fallbackRoute(task, canonicalModelId);
        return this.executeOnModel(task, fallback);
      }
      
      throw error;
    }
  }
  
  /**
   * Calculate routing confidence
   * @param {ModelProfile} model - Model profile
   * @param {TaskDefinition} task - Task definition
   * @returns {number} Confidence score (0-1)
   * @private
   */
  calculateConfidence(model, task) {
    let confidence = 0.7; // Base confidence
    
    // Higher confidence for models with more history
    if (model.successRate > 0.95) {
      confidence += 0.15;
    } else if (model.successRate > 0.90) {
      confidence += 0.1;
    }
    
    // Lower confidence for high load
    if (model.currentLoad > 0.8) {
      confidence -= 0.2;
    } else if (model.currentLoad > 0.5) {
      confidence -= 0.1;
    }
    
    // Lower confidence if model hasn't been used recently
    const hoursSinceUse = (Date.now() - model.lastUsed) / (1000 * 60 * 60);
    if (hoursSinceUse > 24) {
      confidence -= 0.1;
    }
    
    return Math.min(1, Math.max(0, confidence));
  }
  
  /**
   * Get task domain from task definition
   * @param {TaskDefinition} task - Task definition
   * @returns {string} Domain
   * @private
   */
  getTaskDomain(task) {
    const type = (task.type || '').toLowerCase();
    
    if (type.includes('code') || type.includes('programming')) return 'coding';
    if (type.includes('analysis') || type.includes('analyze')) return 'analysis';
    if (type.includes('write') || type.includes('writing')) return 'writing';
    if (type.includes('math') || type.includes('calculation')) return 'math';
    if (type.includes('science')) return 'science';
    
    return 'general';
  }
  
  /**
   * Generate cache key for task
   * @param {TaskDefinition} task - Task definition
   * @returns {string} Cache key
   * @private
   */
  generateCacheKey(task) {
    const content = (task.content || '').slice(0, 200);
    const type = task.type || 'unknown';
    const preferredModel = normalizeModelId(task.preferredModel) || 'auto';
    return `route:${type}:${preferredModel}:${this.hashString(content)}`;
  }
  
  /**
   * Simple string hash
   * @param {string} str - String to hash
   * @returns {number} Hash value
   * @private
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  /**
   * Record route in history
   * @param {TaskDefinition} task - Task
   * @param {RouteResult} result - Route result
   * @private
   */
  recordRoute(task, result) {
    this.routingHistory.routes.push({
      taskId: task.id,
      timestamp: Date.now(),
      result
    });
    
    // Trim history
    if (this.routingHistory.routes.length > this.routingHistory.maxHistory) {
      this.routingHistory.routes = this.routingHistory.routes.slice(-this.routingHistory.maxHistory / 2);
    }
  }
  
  /**
   * Update model load status
   * @param {string} modelId - Model identifier
   * @param {number} load - Current load (0-1)
   */
  updateModelLoad(modelId, load) {
    const canonicalId = normalizeModelId(modelId);
    const model = this.models.get(canonicalId);
    if (model) {
      model.currentLoad = Math.max(0, Math.min(1, load));
    }
  }
  
  /**
   * Get router metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return {
      ...this.metrics,
      cacheHitRate: total > 0 ? this.metrics.cacheHits / total : 0,
      modelsRegistered: this.models.size,
      routesInHistory: this.routingHistory.routes.length
    };
  }
  
  /**
   * Get all registered models
   * @returns {Array<ModelProfile>} Models
   */
  getModels() {
    return Array.from(this.models.values());
  }
  
  /**
   * Get model by ID
   * @param {string} modelId - Model identifier
   * @returns {ModelProfile|null}
   */
  getModel(modelId) {
    const canonicalId = normalizeModelId(modelId);
    return this.models.get(canonicalId) || null;
  }
  
  /**
   * Clear route cache
   */
  clearCache() {
    this.routeCache.clear();
  }
  
  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRoutes: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgRoutingTime: 0,
      fallbackCount: 0
    };
  }
  
  /**
   * Shutdown the router
   */
  async shutdown() {
    this.clearCache();
    this.removeAllListeners();
    this.initialized = false;
  }
}

export default ModelRouter;
