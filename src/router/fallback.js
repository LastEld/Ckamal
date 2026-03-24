/**
 * @fileoverview Fallback System with three-level fallback.
 * Provides instance retry, model escalation, and fallback chains with context preservation.
 * @module router/fallback
 */

import { EventEmitter } from 'events';
import { getDefaultFallbackChains } from '../clients/catalog.js';

/**
 * Fallback levels
 */
export const FALLBACK_LEVELS = {
  INSTANCE_RETRY: 1,    // Retry same model instance
  MODEL_ESCALATION: 2,  // Escalate to different model
  FALLBACK_CHAIN: 3     // Use fallback chain
};

/**
 * @typedef {Object} FallbackConfig
 * @property {number} maxRetries - Maximum retry attempts
 * @property {number} retryDelay - Base retry delay in ms
 * @property {number} backoffMultiplier - Exponential backoff multiplier
 * @property {boolean} preserveContext - Preserve context across fallbacks
 * @property {string[]} fallbackChain - Ordered list of fallback model IDs
 * @property {number} escalationThreshold - Score threshold for escalation
 */

/**
 * @typedef {Object} FallbackAttempt
 * @property {number} level - Fallback level
 * @property {string} modelId - Model attempted
 * @property {string} instanceId - Instance identifier
 * @property {number} timestamp - Attempt timestamp
 * @property {boolean} success - Whether attempt succeeded
 * @property {Error} [error] - Error if failed
 */

/**
 * @typedef {Object} FallbackResult
 * @property {boolean} success - Whether fallback succeeded
 * @property {string} finalModel - Final model used
 * @property {number} attempts - Number of attempts made
 * @property {FallbackAttempt[]} attemptHistory - History of attempts
 * @property {Object} [result] - Execution result if successful
 * @property {Error} [finalError] - Final error if all failed
 * @property {Object} [preservedContext] - Preserved context
 */

/**
 * Fallback System for handling model failures
 * @extends EventEmitter
 */
export class FallbackSystem extends EventEmitter {
  /**
   * Creates an instance of FallbackSystem
   * @param {Object} options - Configuration options
   * @param {FallbackConfig} options.config - Fallback configuration
   * @param {ModelRouter} options.router - Model router instance
   */
  constructor(options = {}) {
    super();
    
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      preserveContext: true,
      fallbackChain: [],
      escalationThreshold: 0.5,
      ...options.config
    };
    
    this.router = options.router;
    
    // Fallback chain registry
    this.fallbackChains = new Map();
    
    // Attempt tracking
    this.attempts = new Map();
    
    // Context preservation storage
    this.contextStore = new Map();
    
    // Statistics
    this.stats = {
      totalFallbacks: 0,
      successfulFallbacks: 0,
      failedFallbacks: 0,
      avgAttempts: 0
    };
    
    this.initialized = false;
  }
  
  /**
   * Initialize the fallback system
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    // Register default fallback chains
    this.registerDefaultChains();
    
    this.initialized = true;
    this.emit('initialized');
  }
  
  /**
   * Register default fallback chains
   * @private
   */
  registerDefaultChains() {
    const chains = getDefaultFallbackChains();
    for (const [name, models] of Object.entries(chains)) {
      this.registerFallbackChain(name, models);
    }
  }
  
  /**
   * Register a fallback chain
   * @param {string} name - Chain name
   * @param {string[]} models - Ordered list of model IDs
   */
  registerFallbackChain(name, models) {
    this.fallbackChains.set(name, models);
    this.emit('chainRegistered', { name, models });
  }
  
  /**
   * Execute with fallback support
   * @param {Object} task - Task to execute
   * @param {Object} options - Execution options
   * @returns {Promise<FallbackResult>} Fallback result
   */
  async executeWithFallback(task, options = {}) {
    const executionId = `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const attempts = [];
    
    this.emit('fallbackStarted', { executionId, taskId: task.id });
    this.stats.totalFallbacks++;
    
    // Get initial route
    const route = await this.router.routeTask(task);
    let currentModel = route.modelId;
    
    // Preserve context if enabled
    if (this.config.preserveContext) {
      this.preserveContext(executionId, task);
    }
    
    try {
      // Level 1: Instance Retry
      const retryResult = await this.executeWithRetry(
        task, 
        currentModel, 
        executionId,
        attempts
      );
      
      if (retryResult.success) {
        return this.buildSuccessResult(executionId, currentModel, attempts, retryResult);
      }
      
      // Level 2: Model Escalation
      this.emit('escalating', { executionId, fromModel: currentModel });
      
      const escalationResult = await this.executeEscalation(
        task,
        currentModel,
        executionId,
        attempts
      );
      
      if (escalationResult.success) {
        return this.buildSuccessResult(
          executionId, 
          escalationResult.modelId, 
          attempts, 
          escalationResult
        );
      }
      
      // Level 3: Fallback Chain
      const chainName = options.fallbackChain || 'standard';
      this.emit('usingFallbackChain', { executionId, chain: chainName });
      
      const chainResult = await this.executeFallbackChain(
        task,
        chainName,
        executionId,
        attempts
      );
      
      if (chainResult.success) {
        return this.buildSuccessResult(
          executionId,
          chainResult.modelId,
          attempts,
          chainResult
        );
      }
      
      // All levels failed
      return this.buildFailureResult(executionId, attempts, chainResult.error);
      
    } catch (error) {
      return this.buildFailureResult(executionId, attempts, error);
    }
  }
  
  /**
   * Execute with retries on the same model
   * @param {Object} task - Task to execute
   * @param {string} modelId - Model ID
   * @param {string} executionId - Execution ID
   * @param {FallbackAttempt[]} attempts - Attempts array
   * @returns {Promise<Object>} Retry result
   * @private
   */
  async executeWithRetry(task, modelId, executionId, attempts) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const instanceId = `${modelId}-instance-${attempt}`;
      
      try {
        this.emit('retryAttempt', { executionId, modelId, attempt });
        
        const model = this.router.getModel(modelId);
        if (!model || !model.available) {
          throw new Error(`Model ${modelId} not available`);
        }
        
        // Simulate or actual execution
        const result = await this.executeOnModel(task, modelId);
        
        const attemptRecord = {
          level: FALLBACK_LEVELS.INSTANCE_RETRY,
          modelId,
          instanceId,
          timestamp: Date.now(),
          success: true,
          attempt
        };
        attempts.push(attemptRecord);
        
        this.emit('retrySuccess', { executionId, modelId, attempt });
        
        return { success: true, result, attempt };
        
      } catch (error) {
        lastError = error;
        
        const attemptRecord = {
          level: FALLBACK_LEVELS.INSTANCE_RETRY,
          modelId,
          instanceId,
          timestamp: Date.now(),
          success: false,
          error: error.message,
          attempt
        };
        attempts.push(attemptRecord);
        
        this.emit('retryFailed', { executionId, modelId, attempt, error: error.message });
        
        // Calculate delay with exponential backoff
        const delay = this.config.retryDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
        
        if (attempt < this.config.maxRetries) {
          await this.sleep(delay);
        }
      }
    }
    
    return { success: false, error: lastError };
  }
  
  /**
   * Execute with model escalation
   * @param {Object} task - Task to execute
   * @param {string} failedModel - Failed model ID
   * @param {string} executionId - Execution ID
   * @param {FallbackAttempt[]} attempts - Attempts array
   * @returns {Promise<Object>} Escalation result
   * @private
   */
  async executeEscalation(task, failedModel, executionId, attempts) {
    // Get alternative models with better capabilities
    const alternatives = this.findEscalationModels(failedModel);
    
    for (const alternative of alternatives) {
      try {
        this.emit('escalationAttempt', { executionId, fromModel: failedModel, toModel: alternative });
        
        const result = await this.executeOnModel(task, alternative);
        
        const attemptRecord = {
          level: FALLBACK_LEVELS.MODEL_ESCALATION,
          modelId: alternative,
          instanceId: `${alternative}-escalated`,
          timestamp: Date.now(),
          success: true,
          escalatedFrom: failedModel
        };
        attempts.push(attemptRecord);
        
        this.emit('escalationSuccess', { executionId, modelId: alternative });
        
        return { success: true, result, modelId: alternative };
        
      } catch (error) {
        const attemptRecord = {
          level: FALLBACK_LEVELS.MODEL_ESCALATION,
          modelId: alternative,
          instanceId: `${alternative}-escalated`,
          timestamp: Date.now(),
          success: false,
          error: error.message,
          escalatedFrom: failedModel
        };
        attempts.push(attemptRecord);
        
        this.emit('escalationFailed', { executionId, modelId: alternative, error: error.message });
      }
    }
    
    return { success: false, error: new Error('All escalation models failed') };
  }
  
  /**
   * Execute using fallback chain
   * @param {Object} task - Task to execute
   * @param {string} chainName - Fallback chain name
   * @param {string} executionId - Execution ID
   * @param {FallbackAttempt[]} attempts - Attempts array
   * @returns {Promise<Object>} Chain result
   * @private
   */
  async executeFallbackChain(task, chainName, executionId, attempts) {
    const chain = this.fallbackChains.get(chainName);
    if (!chain) {
      throw new Error(`Fallback chain not found: ${chainName}`);
    }
    
    for (const modelId of chain) {
      try {
        this.emit('chainAttempt', { executionId, modelId, chain: chainName });
        
        const result = await this.executeOnModel(task, modelId);
        
        const attemptRecord = {
          level: FALLBACK_LEVELS.FALLBACK_CHAIN,
          modelId,
          instanceId: `${modelId}-chain`,
          timestamp: Date.now(),
          success: true,
          chain: chainName
        };
        attempts.push(attemptRecord);
        
        this.emit('chainSuccess', { executionId, modelId, chain: chainName });
        
        return { success: true, result, modelId };
        
      } catch (error) {
        const attemptRecord = {
          level: FALLBACK_LEVELS.FALLBACK_CHAIN,
          modelId,
          instanceId: `${modelId}-chain`,
          timestamp: Date.now(),
          success: false,
          error: error.message,
          chain: chainName
        };
        attempts.push(attemptRecord);
        
        this.emit('chainFailed', { executionId, modelId, chain: chainName, error: error.message });
      }
    }
    
    return { success: false, error: new Error('All models in fallback chain failed') };
  }
  
  /**
   * Execute task on a specific model
   * @param {Object} task - Task to execute
   * @param {string} modelId - Model ID
   * @returns {Promise<Object>} Execution result
   * @private
   */
  async executeOnModel(task, modelId) {
    // Use router to execute on specific model
    const route = await this.router.routeTask({
      ...task,
      preferredModel: modelId
    });
    
    // Override with specified model
    route.modelId = modelId;
    
    return this.router.executeOnModel(task, route);
  }
  
  /**
   * Find models for escalation
   * @param {string} failedModel - Failed model ID
   * @returns {string[]} Alternative model IDs
   * @private
   */
  findEscalationModels(failedModel) {
    const failed = this.router.getModel(failedModel);
    if (!failed) return [];
    
    // Find models with higher quality scores
    const alternatives = [];
    
    for (const [id, model] of this.router.models) {
      if (id === failedModel) continue;
      if (!model.available) continue;
      
      // Higher quality or same provider with different characteristics
      if (model.qualityScore > failed.qualityScore ||
          (model.provider === failed.provider && model.id !== failed.id)) {
        alternatives.push({
          id,
          score: model.qualityScore,
          cost: model.costPer1kTokens
        });
      }
    }
    
    // Sort by quality descending, then by cost ascending
    alternatives.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.cost - b.cost;
    });
    
    return alternatives.slice(0, 3).map(a => a.id);
  }
  
  /**
   * Preserve context for potential restoration
   * @param {string} executionId - Execution ID
   * @param {Object} task - Task with context
   * @private
   */
  preserveContext(executionId, task) {
    this.contextStore.set(executionId, {
      task: { ...task },
      timestamp: Date.now(),
      preservedAt: Date.now()
    });
    
    // Cleanup old contexts after 1 hour
    setTimeout(() => {
      this.contextStore.delete(executionId);
    }, 60 * 60 * 1000);
  }
  
  /**
   * Restore preserved context
   * @param {string} executionId - Execution ID
   * @returns {Object|null} Preserved context
   */
  restoreContext(executionId) {
    return this.contextStore.get(executionId) || null;
  }
  
  /**
   * Build success result
   * @param {string} executionId - Execution ID
   * @param {string} modelId - Model used
   * @param {FallbackAttempt[]} attempts - Attempt history
   * @param {Object} result - Execution result
   * @returns {FallbackResult}
   * @private
   */
  buildSuccessResult(executionId, modelId, attempts, result) {
    this.stats.successfulFallbacks++;
    this.updateAvgAttempts(attempts.length);
    
    const fallbackResult = {
      success: true,
      finalModel: modelId,
      attempts: attempts.length,
      attemptHistory: attempts,
      result: result.result,
      preservedContext: this.restoreContext(executionId)
    };
    
    this.emit('fallbackComplete', { executionId, success: true, modelId });
    
    return fallbackResult;
  }
  
  /**
   * Build failure result
   * @param {string} executionId - Execution ID
   * @param {FallbackAttempt[]} attempts - Attempt history
   * @param {Error} error - Final error
   * @returns {FallbackResult}
   * @private
   */
  buildFailureResult(executionId, attempts, error) {
    this.stats.failedFallbacks++;
    this.updateAvgAttempts(attempts.length);
    
    const fallbackResult = {
      success: false,
      finalModel: null,
      attempts: attempts.length,
      attemptHistory: attempts,
      finalError: error.message,
      preservedContext: this.restoreContext(executionId)
    };
    
    this.emit('fallbackComplete', { executionId, success: false, error: error.message });
    
    return fallbackResult;
  }
  
  /**
   * Update average attempts statistic
   * @param {number} attempts - Number of attempts
   * @private
   */
  updateAvgAttempts(attempts) {
    const total = this.stats.totalFallbacks;
    this.stats.avgAttempts = 
      (this.stats.avgAttempts * (total - 1) + attempts) / total;
  }
  
  /**
   * Sleep for specified duration
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get fallback statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalFallbacks > 0 ?
        this.stats.successfulFallbacks / this.stats.totalFallbacks : 0,
      chainsRegistered: this.fallbackChains.size,
      availableChains: Array.from(this.fallbackChains.keys())
    };
  }
  
  /**
   * Get fallback chain
   * @param {string} name - Chain name
   * @returns {string[]|null}
   */
  getFallbackChain(name) {
    return this.fallbackChains.get(name) || null;
  }
  
  /**
   * List all fallback chains
   * @returns {Object}
   */
  listFallbackChains() {
    const chains = {};
    for (const [name, models] of this.fallbackChains) {
      chains[name] = models;
    }
    return chains;
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalFallbacks: 0,
      successfulFallbacks: 0,
      failedFallbacks: 0,
      avgAttempts: 0
    };
  }
  
  /**
   * Clear context store
   */
  clearContextStore() {
    this.contextStore.clear();
  }
  
  /**
   * Shutdown the fallback system
   */
  async shutdown() {
    this.clearContextStore();
    this.attempts.clear();
    this.removeAllListeners();
    this.initialized = false;
  }
}

export default FallbackSystem;
