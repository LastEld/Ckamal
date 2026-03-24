/**
 * @fileoverview Request Routing Module for CogniMesh v5.0
 * Routes requests based on intent analysis and complexity estimation.
 * @module claude/router
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} RouteRequest
 * @property {string} id - Request unique identifier
 * @property {string} content - Request content
 * @property {string} [type] - Request type hint
 * @property {Object} [metadata] - Request metadata
 * @property {number} [priority=50] - Request priority
 * @property {number} [timestamp] - Request timestamp
 */

/**
 * @typedef {Object} RouteResult
 * @property {string} requestId - Original request ID
 * @property {string} target - Target route
 * @property {string} intent - Detected intent
 * @property {number} complexity - Complexity score (0-1)
 * @property {Object} routing - Routing decisions
 * @property {number} confidence - Routing confidence (0-1)
 */

/**
 * @typedef {Object} IntentAnalysis
 * @property {string} primary - Primary intent
 * @property {string[]} secondary - Secondary intents
 * @property {Object} entities - Extracted entities
 * @property {number} confidence - Analysis confidence
 */

/**
 * @typedef {Object} ComplexityAnalysis
 * @property {number} score - Complexity score (0-1)
 * @property {Object} factors - Contributing factors
 * @property {string} [level] - Complexity level
 * @property {Object} recommendations - Routing recommendations
 */

/**
 * @typedef {Object} RouteConfig
 * @property {string} name - Route name
 * @property {string[]} patterns - Matching patterns
 * @property {number} priority - Route priority
 * @property {Object} handler - Route handler reference
 * @property {Object} requirements - Route requirements
 */

/**
 * RequestRouter analyzes requests and routes them to appropriate handlers
 * based on intent and complexity analysis.
 * @extends EventEmitter
 */
export class RequestRouter extends EventEmitter {
  /** @type {Map<string, RouteConfig>} */
  #routes = new Map();
  
  /** @type {Map<string, Function>} */
  #handlers = new Map();
  
  /** @type {Set<string>} */
  #subscribers = new Set();
  
  /** @type {Object} */
  #intentPatterns;
  
  /** @type {Object} */
  #complexityConfig;

  /**
   * Creates a RequestRouter instance.
   * @param {Object} [options={}] - Router configuration
   */
  constructor(options = {}) {
    super();
    
    this.#intentPatterns = {
      coding: /\b(code|program|function|class|implement|debug|refactor|script)\b/i,
      analysis: /\b(analyze|explain|compare|evaluate|assess|review|summarize)\b/i,
      creative: /\b(write|create|generate|draft|compose|story|poem|blog)\b/i,
      question: /\b(what|why|how|when|where|who|which|can|could|would|will)\b/i,
      data: /\b(data|csv|json|xml|database|query|table|chart|graph)\b/i,
      math: /\b(calculate|compute|solve|equation|formula|math|number|sum)\b/i,
      conversation: /\b(chat|talk|discuss|conversation|hello|hi|hey)\b/i,
      task: /\b(task|todo|remind|schedule|plan|organize|manage)\b/i
    };

    this.#complexityConfig = {
      lengthThresholds: { low: 100, medium: 500, high: 2000 },
      contextIndicators: ['context', 'background', 'previous', 'earlier', 'before'],
      reasoningIndicators: ['reason', 'because', 'therefore', 'thus', 'logic', 'step by step'],
      multiStepIndicators: ['steps', 'process', 'workflow', 'pipeline', 'sequence'],
      ...options.complexityConfig
    };

    this.#initializeDefaultRoutes();
  }

  /**
   * Initializes default routes.
   * @private
   */
  #initializeDefaultRoutes() {
    const defaults = [
      { name: 'coding', patterns: ['code', 'program', 'function'], priority: 100 },
      { name: 'analysis', patterns: ['analyze', 'explain', 'compare'], priority: 90 },
      { name: 'creative', patterns: ['write', 'create', 'generate'], priority: 80 },
      { name: 'data', patterns: ['data', 'csv', 'json', 'query'], priority: 85 },
      { name: 'math', patterns: ['calculate', 'solve', 'compute'], priority: 95 },
      { name: 'conversation', patterns: ['chat', 'talk', 'hello'], priority: 70 },
      { name: 'task', patterns: ['task', 'todo', 'schedule'], priority: 75 },
      { name: 'default', patterns: ['*'], priority: 0 }
    ];

    for (const route of defaults) {
      this.#routes.set(route.name, route);
    }
  }

  /**
   * Validates subscriber authentication.
   * @private
   * @param {string} subscriptionKey - Subscriber key
   * @throws {Error} If not authenticated
   */
  #requireAuth(subscriptionKey) {
    if (!this.#subscribers.has(subscriptionKey)) {
      throw new Error('Unauthorized: Valid subscription required');
    }
  }

  /**
   * Subscribes to the router.
   * @param {string} subscriptionKey - Unique subscriber identifier
   * @returns {boolean} Success status
   */
  subscribe(subscriptionKey) {
    if (this.#subscribers.has(subscriptionKey)) {
      return false;
    }
    this.#subscribers.add(subscriptionKey);
    this.emit('subscribed', { subscriptionKey, timestamp: Date.now() });
    return true;
  }

  /**
   * Unsubscribes from the router.
   * @param {string} subscriptionKey - Subscriber identifier
   * @returns {boolean} Success status
   */
  unsubscribe(subscriptionKey) {
    const removed = this.#subscribers.delete(subscriptionKey);
    if (removed) {
      this.emit('unsubscribed', { subscriptionKey, timestamp: Date.now() });
    }
    return removed;
  }

  /**
   * Routes a request to appropriate handler.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {RouteRequest} request - Request to route
   * @returns {RouteResult} Routing result
   */
  route(subscriptionKey, request) {
    this.#requireAuth(subscriptionKey);
    
    if (!request || !request.content) {
      throw new Error('Invalid request: content required');
    }

    const requestId = request.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const content = request.content;

    // Analyze intent and complexity
    const intent = this.analyzeIntent(subscriptionKey, content);
    const complexity = this.estimateComplexity(subscriptionKey, content);

    // Determine target route
    const target = this.#selectRoute(intent, complexity, request);
    const handler = this.#handlers.get(target);

    const result = {
      requestId,
      target,
      intent: intent.primary,
      complexity: complexity.score,
      routing: {
        strategy: complexity.level,
        handler: handler ? target : null,
        priority: request.priority || 50,
        estimatedTokens: this.#estimateTokenNeeds(complexity, content)
      },
      confidence: intent.confidence,
      analysis: { intent, complexity }
    };

    this.emit('requestRouted', result);

    // Execute handler if available
    if (handler) {
      try {
        const handlerResult = handler(request, result);
        this.emit('handlerExecuted', { requestId, target, success: true });
        return { ...result, handlerResult };
      } catch (error) {
        this.emit('handlerError', { requestId, target, error: error.message });
        return { ...result, handlerError: error.message };
      }
    }

    return result;
  }

  /**
   * Analyzes request intent.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} content - Request content
   * @returns {IntentAnalysis} Intent analysis result
   */
  analyzeIntent(subscriptionKey, content) {
    this.#requireAuth(subscriptionKey);
    
    const scores = {};
    const lowerContent = content.toLowerCase();

    // Score each intent pattern
    for (const [intent, pattern] of Object.entries(this.#intentPatterns)) {
      const matches = lowerContent.match(pattern) || [];
      scores[intent] = matches.length;
    }

    // Find primary and secondary intents
    const sorted = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, score]) => score > 0);

    const primary = sorted.length > 0 ? sorted[0][0] : 'general';
    const secondary = sorted.slice(1, 4).map(([intent]) => intent);

    // Calculate confidence
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 
      ? Math.min(1, sorted[0]?.[1] / totalScore + 0.3) 
      : 0.3;

    // Extract entities (simple pattern matching)
    const entities = this.#extractEntities(content);

    return {
      primary,
      secondary,
      entities,
      confidence: Math.round(confidence * 100) / 100
    };
  }

  /**
   * Estimates request complexity.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} content - Request content
   * @returns {ComplexityAnalysis} Complexity analysis
   */
  estimateComplexity(subscriptionKey, content) {
    this.#requireAuth(subscriptionKey);
    
    const factors = {};
    const lowerContent = content.toLowerCase();

    // Length factor
    const length = content.length;
    factors.length = length < this.#complexityConfig.lengthThresholds.low ? 0.1 :
                     length < this.#complexityConfig.lengthThresholds.medium ? 0.3 :
                     length < this.#complexityConfig.lengthThresholds.high ? 0.5 : 0.7;

    // Context references
    const contextRefs = this.#complexityConfig.contextIndicators
      .filter(ind => lowerContent.includes(ind)).length;
    factors.context = Math.min(0.3, contextRefs * 0.1);

    // Reasoning requirements
    const reasoningRefs = this.#complexityConfig.reasoningIndicators
      .filter(ind => lowerContent.includes(ind)).length;
    factors.reasoning = Math.min(0.3, reasoningRefs * 0.1);

    // Multi-step indicators
    const multiStepRefs = this.#complexityConfig.multiStepIndicators
      .filter(ind => lowerContent.includes(ind)).length;
    factors.multiStep = Math.min(0.2, multiStepRefs * 0.1);

    // Code complexity indicators
    const codeIndicators = (content.match(/[{};]/g) || []).length;
    factors.code = Math.min(0.2, codeIndicators * 0.02);

    // Question complexity
    const questionCount = (content.match(/\?/g) || []).length;
    factors.questions = Math.min(0.15, questionCount * 0.05);

    // Calculate total score
    const score = Math.min(1, Object.values(factors).reduce((a, b) => a + b, 0));

    // Determine level
    let level;
    if (score < 0.3) level = 'simple';
    else if (score < 0.6) level = 'moderate';
    else if (score < 0.8) level = 'complex';
    else level = 'very_complex';

    // Generate recommendations
    const recommendations = this.#generateRecommendations(score, factors);

    return {
      score: Math.round(score * 100) / 100,
      factors,
      level,
      recommendations
    };
  }

  /**
   * Registers a new route.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {RouteConfig} config - Route configuration
   * @param {Function} [handler] - Route handler function
   */
  registerRoute(subscriptionKey, config, handler) {
    this.#requireAuth(subscriptionKey);
    
    this.#routes.set(config.name, {
      ...config,
      registeredAt: Date.now()
    });

    if (handler) {
      this.#handlers.set(config.name, handler);
    }

    this.emit('routeRegistered', { name: config.name, timestamp: Date.now() });
  }

  /**
   * Unregisters a route.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} name - Route name
   * @returns {boolean} Success status
   */
  unregisterRoute(subscriptionKey, name) {
    this.#requireAuth(subscriptionKey);
    
    const deleted = this.#routes.delete(name);
    this.#handlers.delete(name);
    
    if (deleted) {
      this.emit('routeUnregistered', { name, timestamp: Date.now() });
    }
    
    return deleted;
  }

  /**
   * Gets registered routes.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {RouteConfig[]} Route configurations
   */
  getRoutes(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    return Array.from(this.#routes.values());
  }

  /**
   * Batch routes multiple requests.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {RouteRequest[]} requests - Requests to route
   * @returns {RouteResult[]} Routing results
   */
  routeBatch(subscriptionKey, requests) {
    this.#requireAuth(subscriptionKey);
    return requests.map(req => this.route(subscriptionKey, req));
  }

  /**
   * Selects best route based on analysis.
   * @private
   * @param {IntentAnalysis} intent - Intent analysis
   * @param {ComplexityAnalysis} complexity - Complexity analysis
   * @param {RouteRequest} request - Original request
   * @returns {string} Selected route name
   */
  #selectRoute(intent, complexity, request) {
    // Check for explicit type hint
    if (request.type && this.#routes.has(request.type)) {
      return request.type;
    }

    // Match intent to route
    const candidates = [];
    
    for (const [name, route] of this.#routes.entries()) {
      let score = 0;
      
      // Pattern matching
      if (route.patterns) {
        for (const pattern of route.patterns) {
          if (pattern === '*') {
            score += route.priority * 0.1;
          } else if (intent.primary.includes(pattern) || 
                     intent.secondary.some(s => s.includes(pattern))) {
            score += route.priority;
          }
        }
      }

      // Complexity matching
      if (complexity.level === 'simple' && name === 'conversation') {
        score += 10;
      }
      if (complexity.level === 'very_complex' && name === 'analysis') {
        score += 10;
      }

      candidates.push({ name, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.name || 'default';
  }

  /**
   * Extracts entities from content.
   * @private
   * @param {string} content - Content to analyze
   * @returns {Object} Extracted entities
   */
  #extractEntities(content) {
    const entities = {
      languages: [],
      formats: [],
      topics: []
    };

    // Programming languages
    const langPattern = /\b(javascript|python|java|c\+\+|c#|ruby|go|rust|typescript|php|swift|kotlin)\b/gi;
    entities.languages = [...content.matchAll(langPattern)].map(m => m[1].toLowerCase());

    // File formats
    const formatPattern = /\b(json|xml|csv|yaml|markdown|html|sql|pdf|doc)\b/gi;
    entities.formats = [...content.matchAll(formatPattern)].map(m => m[1].toLowerCase());

    // Common topics
    const topicPattern = /\b(api|database|server|client|frontend|backend|algorithm|security|testing)\b/gi;
    entities.topics = [...content.matchAll(topicPattern)].map(m => m[1].toLowerCase());

    return entities;
  }

  /**
   * Generates routing recommendations.
   * @private
   * @param {number} score - Complexity score
   * @param {Object} factors - Complexity factors
   * @returns {Object} Recommendations
   */
  #generateRecommendations(score, factors) {
    const recs = {
      model: score > 0.7 ? 'claude-3-opus' : score > 0.4 ? 'claude-3-sonnet' : 'claude-3-haiku',
      temperature: score > 0.6 ? 0.3 : 0.7,
      maxTokens: score > 0.7 ? 4000 : score > 0.4 ? 2000 : 1000,
      strategies: []
    };

    if (factors.reasoning > 0.2) {
      recs.strategies.push('chain_of_thought');
      recs.temperature = Math.max(0.2, recs.temperature - 0.1);
    }

    if (factors.multiStep > 0.1) {
      recs.strategies.push('step_by_step');
    }

    if (factors.context > 0.2) {
      recs.strategies.push('context_enrichment');
    }

    if (factors.code > 0.1) {
      recs.strategies.push('code_formatting');
      recs.maxTokens = Math.max(recs.maxTokens, 2000);
    }

    return recs;
  }

  /**
   * Estimates token needs.
   * @private
   * @param {ComplexityAnalysis} complexity - Complexity analysis
   * @param {string} content - Request content
   * @returns {Object} Token estimates
   */
  #estimateTokenNeeds(complexity, content) {
    const inputTokens = Math.ceil(content.length / 4);
    
    // Output estimate based on complexity
    const outputMultiplier = 
      complexity.level === 'simple' ? 0.5 :
      complexity.level === 'moderate' ? 1.0 :
      complexity.level === 'complex' ? 2.0 : 3.0;
    
    const outputTokens = Math.ceil(inputTokens * outputMultiplier);

    return {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
      withMargin: Math.ceil((inputTokens + outputTokens) * 1.2)
    };
  }

  /**
   * Updates intent patterns.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {Object} patterns - New patterns
   */
  updateIntentPatterns(subscriptionKey, patterns) {
    this.#requireAuth(subscriptionKey);
    this.#intentPatterns = { ...this.#intentPatterns, ...patterns };
    this.emit('patternsUpdated', { type: 'intent', timestamp: Date.now() });
  }

  /**
   * Gets router statistics.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {Object} Statistics
   */
  getStats(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    
    return {
      routes: this.#routes.size,
      handlers: this.#handlers.size,
      subscribers: this.#subscribers.size,
      intentTypes: Object.keys(this.#intentPatterns)
    };
  }

  /**
   * Disposes the router and clears resources.
   */
  dispose() {
    this.#routes.clear();
    this.#handlers.clear();
    this.#subscribers.clear();
    this.removeAllListeners();
  }
}

export default RequestRouter;
