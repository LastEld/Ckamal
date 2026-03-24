/**
 * @fileoverview Context Manager for cross-model context sharing.
 * Provides context translation, compaction, and state management.
 * @module router/context-manager
 */

import { EventEmitter } from 'events';
import { LRUCache } from '../utils/cache.js';

/**
 * @typedef {Object} ContextSnapshot
 * @property {string} id - Context ID
 * @property {string} sessionId - Session identifier
 * @property {Object} data - Context data
 * @property {string} sourceModel - Source model ID
 * @property {string} [targetModel] - Target model ID (for translation)
 * @property {number} timestamp - Creation timestamp
 * @property {number} version - Context version
 * @property {number} size - Context size in bytes
 */

/**
 * @typedef {Object} ContextTranslation
 * @property {string} fromModel - Source model
 * @property {string} toModel - Target model
 * @property {Function} translator - Translation function
 * @property {Object} [mapping] - Field mapping
 */

/**
 * @typedef {Object} CompactionStrategy
 * @property {string} name - Strategy name
 * @property {number} threshold - Size threshold in bytes
 * @property {Function} compact - Compaction function
 */

/**
 * Context Manager for managing shared state across models
 * @extends EventEmitter
 */
export class ContextManager extends EventEmitter {
  /**
   * Creates an instance of ContextManager
   * @param {Object} options - Configuration options
   * @param {number} options.maxContextSize - Maximum context size in bytes
   * @param {number} options.compactionThreshold - Compaction threshold
   * @param {number} options.ttl - Context TTL in ms
   * @param {boolean} options.enableTranslation - Enable context translation
   */
  constructor(options = {}) {
    super();
    
    this.maxContextSize = options.maxContextSize || 1024 * 1024; // 1MB
    this.compactionThreshold = options.compactionThreshold || 100 * 1024; // 100KB
    this.enableTranslation = options.enableTranslation ?? true;
    
    // Context storage
    this.contexts = new LRUCache({
      maxSize: options.maxContexts || 100,
      ttl: options.ttl || 30 * 60 * 1000 // 30 minutes
    });
    
    // Session contexts mapping
    this.sessions = new Map();
    
    // Translation registry
    this.translators = new Map();
    
    // Compaction strategies
    this.compactionStrategies = new Map();
    
    // State management
    this.state = new Map();
    
    this.initialized = false;
    
    // Register default strategies
    this.registerDefaultStrategies();
  }
  
  /**
   * Initialize the context manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    this.initialized = true;
    this.emit('initialized');
  }
  
  /**
   * Register default compaction strategies
   * @private
   */
  registerDefaultStrategies() {
    // Summary strategy - keep only key information
    this.registerCompactionStrategy('summary', {
      threshold: 50 * 1024,
      compact: (context) => this.summaryCompaction(context)
    });
    
    // Truncation strategy - remove oldest entries
    this.registerCompactionStrategy('truncation', {
      threshold: 100 * 1024,
      compact: (context) => this.truncationCompaction(context)
    });
    
    // Semantic strategy - keep semantically important data
    this.registerCompactionStrategy('semantic', {
      threshold: 200 * 1024,
      compact: (context) => this.semanticCompaction(context)
    });
  }
  
  /**
   * Create a new context
   * @param {string} sessionId - Session identifier
   * @param {Object} data - Initial context data
   * @param {Object} options - Context options
   * @returns {ContextSnapshot} Created context
   */
  createContext(sessionId, data = {}, options = {}) {
    const contextId = `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const context = {
      id: contextId,
      sessionId,
      data: { ...data },
      sourceModel: options.sourceModel || 'unknown',
      targetModel: options.targetModel,
      timestamp: Date.now(),
      version: 1,
      size: this.estimateSize(data),
      metadata: {
        ...options.metadata,
        createdAt: Date.now()
      }
    };
    
    // Store context
    this.contexts.set(contextId, context);
    
    // Add to session mapping
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Set());
    }
    this.sessions.get(sessionId).add(contextId);
    
    this.emit('contextCreated', { contextId, sessionId });
    
    return context;
  }
  
  /**
   * Get context by ID
   * @param {string} contextId - Context identifier
   * @returns {ContextSnapshot|null}
   */
  getContext(contextId) {
    return this.contexts.get(contextId) || null;
  }
  
  /**
   * Get all contexts for a session
   * @param {string} sessionId - Session identifier
   * @returns {ContextSnapshot[]}
   */
  getSessionContexts(sessionId) {
    const contextIds = this.sessions.get(sessionId);
    if (!contextIds) return [];
    
    return Array.from(contextIds)
      .map(id => this.contexts.get(id))
      .filter(Boolean);
  }
  
  /**
   * Update context data
   * @param {string} contextId - Context identifier
   * @param {Object} updates - Data updates
   * @returns {ContextSnapshot} Updated context
   */
  updateContext(contextId, updates) {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }
    
    context.data = {
      ...context.data,
      ...updates
    };
    context.version++;
    context.timestamp = Date.now();
    context.size = this.estimateSize(context.data);
    
    // Check if compaction needed
    if (context.size > this.compactionThreshold) {
      this.compactContext(contextId);
    }
    
    this.emit('contextUpdated', { contextId, version: context.version });
    
    return context;
  }
  
  /**
   * Merge multiple contexts into one
   * @param {string[]} contextIds - Context IDs to merge
   * @param {Object} options - Merge options
   * @returns {ContextSnapshot} Merged context
   */
  mergeContexts(contextIds, options = {}) {
    const contexts = contextIds
      .map(id => this.contexts.get(id))
      .filter(Boolean);
    
    if (contexts.length === 0) {
      throw new Error('No valid contexts to merge');
    }
    
    // Merge data
    const mergedData = {};
    for (const ctx of contexts) {
      Object.assign(mergedData, ctx.data);
    }
    
    // Create new merged context
    const sessionId = options.sessionId || contexts[0].sessionId;
    const mergedContext = this.createContext(sessionId, mergedData, {
      sourceModel: 'merged',
      metadata: {
        mergedFrom: contextIds,
        originalSources: contexts.map(c => c.sourceModel)
      }
    });
    
    this.emit('contextsMerged', { 
      mergedContextId: mergedContext.id, 
      sourceIds: contextIds 
    });
    
    return mergedContext;
  }
  
  /**
   * Share context between models
   * @param {string} contextId - Context to share
   * @param {string} targetModel - Target model ID
   * @param {Object} options - Share options
   * @returns {ContextSnapshot} Shared context
   */
  shareContext(contextId, targetModel, options = {}) {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }
    
    let sharedData = { ...context.data };
    
    // Translate if needed
    if (this.enableTranslation && context.sourceModel !== targetModel) {
      sharedData = this.translateContext(
        sharedData, 
        context.sourceModel, 
        targetModel,
        options.translationOptions
      );
    }
    
    // Create shared context
    const sharedContext = this.createContext(context.sessionId, sharedData, {
      sourceModel: context.sourceModel,
      targetModel,
      metadata: {
        sharedFrom: contextId,
        sharedAt: Date.now(),
        ...options.metadata
      }
    });
    
    this.emit('contextShared', { 
      originalId: contextId, 
      sharedId: sharedContext.id,
      targetModel 
    });
    
    return sharedContext;
  }
  
  /**
   * Translate context between model formats
   * @param {Object} data - Context data
   * @param {string} fromModel - Source model
   * @param {string} toModel - Target model
   * @param {Object} options - Translation options
   * @returns {Object} Translated context
   */
  translateContext(data, fromModel, toModel, options = {}) {
    // Check for registered translator
    const translatorKey = `${fromModel}:${toModel}`;
    const translator = this.translators.get(translatorKey);
    
    if (translator) {
      return translator(data, options);
    }
    
    // Default translation - format preservation with adaptations
    return this.defaultTranslation(data, fromModel, toModel);
  }
  
  /**
   * Default context translation
   * @param {Object} data - Context data
   * @param {string} fromModel - Source model
   * @param {string} toModel - Target model
   * @returns {Object} Translated context
   * @private
   */
  defaultTranslation(data, fromModel, toModel) {
    const translated = { ...data };
    
    // Model-specific adaptations
    const adaptations = {
      'anthropic:openai': (d) => ({
        ...d,
        _format: 'openai',
        messages: this.convertToOpenAIMessages(d)
      }),
      'openai:anthropic': (d) => ({
        ...d,
        _format: 'anthropic',
        messages: this.convertToAnthropicMessages(d)
      }),
      'anthropic:moonshot': (d) => ({
        ...d,
        _format: 'moonshot',
        messages: this.convertToMoonshotMessages(d)
      })
    };
    
    const adapter = adaptations[`${fromModel}:${toModel}`];
    if (adapter) {
      return adapter(translated);
    }
    
    // Generic translation - add format marker
    translated._format = toModel;
    translated._translatedFrom = fromModel;
    translated._translatedAt = Date.now();
    
    return translated;
  }
  
  /**
   * Convert messages to OpenAI format
   * @param {Object} data - Context data
   * @returns {Array} OpenAI format messages
   * @private
   */
  convertToOpenAIMessages(data) {
    const messages = data.messages || [];
    return messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));
  }
  
  /**
   * Convert messages to Anthropic format
   * @param {Object} data - Context data
   * @returns {Array} Anthropic format messages
   * @private
   */
  convertToAnthropicMessages(data) {
    const messages = data.messages || [];
    return messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));
  }
  
  /**
   * Convert messages to Moonshot format
   * @param {Object} data - Context data
   * @returns {Array} Moonshot format messages
   * @private
   */
  convertToMoonshotMessages(data) {
    return this.convertToOpenAIMessages(data); // Similar to OpenAI
  }
  
  /**
   * Register a context translator
   * @param {string} fromModel - Source model
   * @param {string} toModel - Target model
   * @param {Function} translator - Translation function
   */
  registerTranslator(fromModel, toModel, translator) {
    const key = `${fromModel}:${toModel}`;
    this.translators.set(key, translator);
  }
  
  /**
   * Compact context to reduce size
   * @param {string} contextId - Context to compact
   * @param {string} [strategy] - Compaction strategy
   * @returns {ContextSnapshot} Compacted context
   */
  compactContext(contextId, strategy = 'summary') {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }
    
    const compactionStrategy = this.compactionStrategies.get(strategy);
    if (!compactionStrategy) {
      throw new Error(`Unknown compaction strategy: ${strategy}`);
    }
    
    const originalSize = context.size;
    context.data = compactionStrategy.compact(context.data);
    context.version++;
    context.size = this.estimateSize(context.data);
    context.metadata = {
      ...context.metadata,
      compactedAt: Date.now(),
      compactionStrategy: strategy,
      originalSize
    };
    
    this.emit('contextCompacted', { 
      contextId, 
      originalSize, 
      newSize: context.size,
      strategy 
    });
    
    return context;
  }
  
  /**
   * Register a compaction strategy
   * @param {string} name - Strategy name
   * @param {Object} strategy - Strategy definition
   */
  registerCompactionStrategy(name, strategy) {
    this.compactionStrategies.set(name, strategy);
  }
  
  /**
   * Summary compaction - keep only key information
   * @param {Object} data - Context data
   * @returns {Object} Compacted data
   * @private
   */
  summaryCompaction(data) {
    const summary = {};
    
    // Keep essential fields
    const essentialFields = ['sessionId', 'taskType', 'goals', 'constraints'];
    for (const field of essentialFields) {
      if (data[field] !== undefined) {
        summary[field] = data[field];
      }
    }
    
    // Summarize messages if present
    if (data.messages && data.messages.length > 10) {
      summary.messages = [
        { role: 'system', content: '[Previous conversation summarized]' },
        ...data.messages.slice(-5) // Keep last 5 messages
      ];
    } else if (data.messages) {
      summary.messages = data.messages;
    }
    
    // Keep key results/decisions
    if (data.results) {
      summary.keyResults = data.results.slice(-3);
    }
    
    summary._compaction = {
      type: 'summary',
      originalFields: Object.keys(data),
      timestamp: Date.now()
    };
    
    return summary;
  }
  
  /**
   * Truncation compaction - remove oldest entries
   * @param {Object} data - Context data
   * @returns {Object} Compacted data
   * @private
   */
  truncationCompaction(data) {
    const compacted = { ...data };
    
    // Truncate arrays
    for (const [key, value] of Object.entries(compacted)) {
      if (Array.isArray(value) && value.length > 20) {
        compacted[key] = [
          ...value.slice(0, 5),
          { _truncated: true, removed: value.length - 10 },
          ...value.slice(-5)
        ];
      }
    }
    
    // Remove old history entries
    if (compacted.history && compacted.history.length > 50) {
      compacted.history = compacted.history.slice(-25);
    }
    
    compacted._compaction = {
      type: 'truncation',
      timestamp: Date.now()
    };
    
    return compacted;
  }
  
  /**
   * Semantic compaction - keep semantically important data
   * @param {Object} data - Context data
   * @returns {Object} Compacted data
   * @private
   */
  semanticCompaction(data) {
    // For now, similar to summary but with importance scoring
    // Full implementation would use embeddings
    const compacted = this.summaryCompaction(data);
    
    compacted._compaction = {
      type: 'semantic',
      timestamp: Date.now(),
      note: 'Importance-based selection'
    };
    
    return compacted;
  }
  
  /**
   * Set state value
   * @param {string} key - State key
   * @param {*} value - State value
   * @param {Object} options - State options
   */
  setState(key, value, options = {}) {
    const stateEntry = {
      value,
      timestamp: Date.now(),
      ttl: options.ttl,
      metadata: options.metadata
    };
    
    this.state.set(key, stateEntry);
    
    // Setup TTL cleanup if specified
    if (options.ttl) {
      setTimeout(() => {
        this.deleteState(key);
      }, options.ttl);
    }
    
    this.emit('stateSet', { key });
  }
  
  /**
   * Get state value
   * @param {string} key - State key
   * @param {*} defaultValue - Default value
   * @returns {*} State value
   */
  getState(key, defaultValue = undefined) {
    const entry = this.state.get(key);
    
    if (!entry) {
      return defaultValue;
    }
    
    // Check TTL
    if (entry.ttl && (Date.now() - entry.timestamp) > entry.ttl) {
      this.deleteState(key);
      return defaultValue;
    }
    
    return entry.value;
  }
  
  /**
   * Delete state value
   * @param {string} key - State key
   * @returns {boolean}
   */
  deleteState(key) {
    const deleted = this.state.delete(key);
    if (deleted) {
      this.emit('stateDeleted', { key });
    }
    return deleted;
  }
  
  /**
   * Get all state keys
   * @returns {string[]}
   */
  getStateKeys() {
    return Array.from(this.state.keys());
  }
  
  /**
   * Clear all state
   */
  clearState() {
    this.state.clear();
    this.emit('stateCleared');
  }
  
  /**
   * Delete context
   * @param {string} contextId - Context ID
   * @returns {boolean}
   */
  deleteContext(contextId) {
    const context = this.contexts.get(contextId);
    if (!context) return false;
    
    // Remove from session mapping
    const sessionContexts = this.sessions.get(context.sessionId);
    if (sessionContexts) {
      sessionContexts.delete(contextId);
      if (sessionContexts.size === 0) {
        this.sessions.delete(context.sessionId);
      }
    }
    
    // Remove from cache
    this.contexts.delete(contextId);
    
    this.emit('contextDeleted', { contextId });
    
    return true;
  }
  
  /**
   * Delete session and all its contexts
   * @param {string} sessionId - Session ID
   * @returns {number} Number of contexts deleted
   */
  deleteSession(sessionId) {
    const contextIds = this.sessions.get(sessionId);
    if (!contextIds) return 0;
    
    let count = 0;
    for (const contextId of contextIds) {
      this.contexts.delete(contextId);
      count++;
    }
    
    this.sessions.delete(sessionId);
    
    this.emit('sessionDeleted', { sessionId, contextsDeleted: count });
    
    return count;
  }
  
  /**
   * Get context statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      contextsCount: this.contexts.size,
      sessionsCount: this.sessions.size,
      stateCount: this.state.size,
      cacheStats: this.contexts.stats(),
      translatorsRegistered: this.translators.size,
      compactionStrategies: Array.from(this.compactionStrategies.keys())
    };
  }
  
  /**
   * Estimate size of data in bytes
   * @param {*} data - Data to estimate
   * @returns {number} Size in bytes
   * @private
   */
  estimateSize(data) {
    try {
      const str = JSON.stringify(data);
      return new Blob([str]).size;
    } catch {
      return 0;
    }
  }
  
  /**
   * Clear all contexts and state
   */
  clear() {
    this.contexts.clear();
    this.sessions.clear();
    this.state.clear();
    this.emit('cleared');
  }
  
  /**
   * Shutdown the context manager
   */
  async shutdown() {
    this.clear();
    this.removeAllListeners();
    this.initialized = false;
  }
}

export default ContextManager;
