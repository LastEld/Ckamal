/**
 * @fileoverview Multi-Model Router and Orchestrator Module
 * Provides intelligent routing, orchestration, context management, fallback, and caching.
 * @module router
 */

import { ModelRouter, SCORING_WEIGHTS, COMPLEXITY_LEVELS } from './model-router.js';
import { Orchestrator, ORCHESTRATION_MODES } from './orchestrator.js';
import { ContextManager } from './context-manager.js';
import { FallbackSystem, FALLBACK_LEVELS } from './fallback.js';
import { SemanticCache } from './cache.js';

// Core Router
export { 
  ModelRouter, 
  SCORING_WEIGHTS, 
  COMPLEXITY_LEVELS
} from './model-router.js';

// Orchestrator
export { 
  Orchestrator, 
  ORCHESTRATION_MODES
} from './orchestrator.js';

// Context Manager
export { 
  ContextManager
} from './context-manager.js';

// Fallback System
export { 
  FallbackSystem, 
  FALLBACK_LEVELS
} from './fallback.js';

// Semantic Cache
export { 
  SemanticCache
} from './cache.js';

// Subscription-backed runtime attachment
export {
  SubscriptionRuntimeManager,
  attachSubscriptionRuntime
} from './subscription-runtime.js';

/**
 * Router System Configuration
 */
export const RouterConfig = {
  /** Default scoring weights */
  weights: {
    QUALITY: 0.40,
    COST: 0.30,
    LATENCY: 0.20,
    LOAD: 0.10
  },
  
  /** Default model configurations */
  models: {
    CLAUDE_OPUS_46: 'claude-opus-4-6',
    CLAUDE_SONNET_46: 'claude-sonnet-4-6',
    CLAUDE_SONNET_45: 'claude-sonnet-4-5',
    KIMI_K25: 'kimi-k2-5',
    GPT_54_CODEX: 'gpt-5.4-codex',
    GPT_53_CODEX: 'gpt-5.3-codex'
  },
  
  /** Orchestration modes */
  modes: {
    SINGLE: 'single',
    PARALLEL: 'parallel',
    CHAINED: 'chained',
    SWARM: 'swarm',
    PLAN: 'plan',
    COWORK: 'cowork'
  },
  
  /** Fallback chains */
  fallbackChains: {
    STANDARD: 'standard',
    PREMIUM: 'premium',
    ECONOMY: 'economy',
    SPEED: 'speed'
  }
};

/**
 * Combined Router System that integrates all components
 */
export class RouterSystem {
  /**
   * Creates a RouterSystem instance
   * @param {Object} options - System configuration
   */
  constructor(options = {}) {
    this.router = options.router || new ModelRouter(options.routerOptions);
    this.orchestrator = options.orchestrator || new Orchestrator({ 
      router: this.router,
      ...options.orchestratorOptions 
    });
    this.contextManager = options.contextManager || new ContextManager(options.contextOptions);
    this.fallbackSystem = options.fallbackSystem || new FallbackSystem({ 
      router: this.router,
      ...options.fallbackOptions 
    });
    this.cache = options.cache || new SemanticCache(options.cacheOptions);
    this.subscriptionRuntime = options.subscriptionRuntime || null;
    
    this.initialized = false;
    this.options = options;
  }
  
  /**
   * Initialize the router system
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    // Initialize all components
    await Promise.all([
      this.router.initialize(),
      this.orchestrator.initialize(),
      this.contextManager.initialize(),
      this.fallbackSystem.initialize(),
      this.cache.initialize()
    ]);
    
    this.initialized = true;
  }
  
  /**
   * Route and execute a task
   * @param {Object} task - Task definition
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async execute(task, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Check cache first
    if (options.useCache !== false) {
      const cached = this.cache.get(task);
      if (cached) {
        return {
          ...cached.value,
          fromCache: true,
          matchType: cached.matchType
        };
      }
    }
    
    // Create context if not provided
    let context = options.context;
    if (!context && options.trackContext !== false) {
      context = this.contextManager.createContext(
        options.sessionId || `session-${Date.now()}`,
        { task },
        { sourceModel: 'router_system' }
      );
    }
    
    // Execute with fallback support
    const result = await this.fallbackSystem.executeWithFallback(task, options);
    
    // Cache successful response
    if (result.success && options.useCache !== false) {
      this.cache.set(task, result, {
        tags: [task.type, result.finalModel].filter(Boolean)
      });
    }
    
    // Update context if tracking
    if (context && options.trackContext !== false) {
      this.contextManager.updateContext(context.id, {
        lastResult: result,
        completedAt: Date.now()
      });
    }
    
    return result;
  }
  
  /**
   * Execute with specific orchestration mode
   * @param {Object} task - Task or tasks
   * @param {string} mode - Orchestration mode
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeWithMode(task, mode, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    switch (mode) {
      case ORCHESTRATION_MODES.SINGLE:
        return this.orchestrator.executeSingle(task);
        
      case ORCHESTRATION_MODES.PARALLEL:
        return this.orchestrator.executeParallel(task, options);
        
      case ORCHESTRATION_MODES.CHAINED:
        return this.orchestrator.executeChain(task, options);
        
      case ORCHESTRATION_MODES.SWARM:
        return this.orchestrator.executeSwarm(task, options);
        
      case ORCHESTRATION_MODES.PLAN:
        return this.orchestrator.executePlan(task, options);
        
      case ORCHESTRATION_MODES.COWORK:
        return this.orchestrator.executeCowork(task, options);
        
      default:
        throw new Error(`Unknown orchestration mode: ${mode}`);
    }
  }
  
  /**
   * Route task to best model (routing only, no execution)
   * @param {Object} task - Task definition
   * @returns {Promise<import('./model-router.js').RouteResult>} Routing result
   */
  async route(task) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.router.routeTask(task);
  }
  
  /**
   * Execute task on specific model
   * @param {Object} task - Task definition
   * @param {string} modelId - Model ID
   * @returns {Promise<Object>} Execution result
   */
  async executeOnModel(task, modelId) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const route = await this.router.routeTask({
      ...task,
      preferredModel: modelId
    });
    
    route.modelId = modelId;
    
    return this.router.executeOnModel(task, route);
  }
  
  /**
   * Share context between models
   * @param {string} contextId - Context ID
   * @param {string} targetModel - Target model
   * @param {Object} options - Share options
   * @returns {Object} Shared context
   */
  shareContext(contextId, targetModel, options = {}) {
    return this.contextManager.shareContext(contextId, targetModel, options);
  }
  
  /**
   * Create a new context
   * @param {string} sessionId - Session identifier
   * @param {Object} data - Initial context data
   * @param {Object} options - Context options
   * @returns {import('./context-manager.js').ContextSnapshot} Created context
   */
  createContext(sessionId, data = {}, options = {}) {
    return this.contextManager.createContext(sessionId, data, options);
  }
  
  /**
   * Get system statistics
   * @returns {Object} Combined statistics
   */
  getStats() {
    return {
      router: this.router.getMetrics(),
      orchestrator: this.orchestrator.getMetrics(),
      contextManager: this.contextManager.getStats(),
      fallback: this.fallbackSystem.getStats(),
      cache: this.cache.getStats()
    };
  }
  
  /**
   * Get registered models
   * @returns {Array<import('./model-router.js').ModelProfile>}
   */
  getModels() {
    return this.router.getModels();
  }
  
  /**
   * Register a new model
   * @param {import('./model-router.js').ModelProfile} profile - Model profile
   */
  registerModel(profile) {
    this.router.registerModel(profile);
  }
  
  /**
   * Clear all caches
   */
  clearCaches() {
    this.cache.clear();
    this.router.clearCache();
  }
  
  /**
   * Warm cache with entries
   * @param {Array<{request: Object, response: Object, options?: Object}>} entries - Entries to warm
   * @returns {number} Number of entries warmed
   */
  warmCache(entries) {
    return this.cache.warm(entries);
  }
  
  /**
   * Invalidate cache by tag
   * @param {string} tag - Tag to invalidate
   * @returns {number} Number of entries invalidated
   */
  invalidateCache(tag) {
    return this.cache.invalidateByTag(tag);
  }
  
  /**
   * Shutdown the router system
   */
  async shutdown() {
    if (this.subscriptionRuntime) {
      await this.subscriptionRuntime.shutdown();
      this.subscriptionRuntime = null;
    }

    await Promise.all([
      this.router.shutdown(),
      this.orchestrator.shutdown(),
      this.contextManager.shutdown(),
      this.fallbackSystem.shutdown(),
      this.cache.shutdown()
    ]);
    
    this.initialized = false;
  }
}

// Export RouterSystem as default
export default RouterSystem;

// Re-export types for documentation
/**
 * @typedef {import('./model-router.js').ModelProfile} ModelProfile
 * @typedef {import('./model-router.js').TaskDefinition} TaskDefinition
 * @typedef {import('./model-router.js').RouteResult} RouteResult
 * @typedef {import('./orchestrator.js').OrchestrationTask} OrchestrationTask
 * @typedef {import('./orchestrator.js').OrchestrationResult} OrchestrationResult
 * @typedef {import('./context-manager.js').ContextSnapshot} ContextSnapshot
 * @typedef {import('./fallback.js').FallbackResult} FallbackResult
 * @typedef {import('./cache.js').CacheEntry} CacheEntry
 */
