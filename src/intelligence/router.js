/**
 * @fileoverview ML-based Intelligence Router for request routing and handler selection.
 * Provides intent analysis, complexity estimation, and adaptive routing decisions.
 * @module intelligence/router
 */

import { RouterCache } from './router-cache.js';
import { RouterEngine } from './router-engine.js';

/**
 * @typedef {Object} RouteRequest
 * @property {string} intent - Primary intent of the request
 * @property {string} [content] - Request content for analysis
 * @property {Object} [metadata] - Additional request metadata
 * @property {number} [priority=1] - Request priority (1-10)
 * @property {string} [userId] - User identifier for personalization
 * @property {string} [sessionId] - Session identifier
 */

/**
 * @typedef {Object} RouteResult
 * @property {string} handlerId - Selected handler identifier
 * @property {string} handlerType - Type of handler (local, remote, hybrid)
 * @property {number} confidence - Confidence score (0-1)
 * @property {string} modelId - Selected model identifier
 * @property {Object} parameters - Extracted parameters
 * @property {number} estimatedCost - Estimated processing cost
 * @property {number} estimatedLatency - Estimated latency in ms
 * @property {string} routingStrategy - Strategy used for routing
 * @property {string} [abTestGroup] - A/B test group assignment
 */

/**
 * @typedef {Object} RouteFeedback
 * @property {string} routeId - Unique route identifier
 * @property {boolean} success - Whether the route was successful
 * @property {number} actualLatency - Actual processing latency
 * @property {number} qualityScore - Quality score from feedback (0-1)
 * @property {string} [error] - Error message if failed
 * @property {Object} [metadata] - Additional feedback metadata
 */

/**
 * @typedef {Object} HandlerProfile
 * @property {string} id - Handler identifier
 * @property {string} type - Handler type (local, remote, hybrid)
 * @property {string[]} capabilities - Supported capabilities
 * @property {number} maxComplexity - Maximum complexity handled
 * @property {number} costFactor - Cost factor (1-10)
 * @property {number} qualityScore - Historical quality score (0-1)
 * @property {number} currentLoad - Current load (0-1)
 * @property {number} avgLatency - Average latency in ms
 * @property {boolean} available - Availability status
 */

/**
 * ML-based Intelligence Router for adaptive request routing.
 * @class
 */
export class IntelligenceRouter {
  /**
   * Creates an instance of IntelligenceRouter.
   * @param {Object} options - Router configuration
   * @param {RouterCache} [options.cache] - Route cache instance
   * @param {RouterEngine} [options.engine] - Route engine instance
   * @param {number} [options.cacheTTL=300000] - Default cache TTL in ms (5 min)
   * @param {boolean} [options.enableABTesting=false] - Enable A/B testing
   * @param {number} [options.minConfidence=0.6] - Minimum confidence threshold
   * @param {number} [options.qualityWeight=0.4] - Weight for quality in scoring
   * @param {number} [options.costWeight=0.3] - Weight for cost in scoring
   * @param {number} [options.latencyWeight=0.3] - Weight for latency in scoring
   */
  constructor(options = {}) {
    this.cache = options.cache || new RouterCache();
    this.engine = options.engine || new RouterEngine();
    this.cacheTTL = options.cacheTTL || 300000;
    this.enableABTesting = options.enableABTesting || false;
    this.minConfidence = options.minConfidence || 0.6;
    
    // Scoring weights (should sum to 1)
    this.qualityWeight = options.qualityWeight ?? 0.4;
    this.costWeight = options.costWeight ?? 0.3;
    this.latencyWeight = options.latencyWeight ?? 0.3;
    
    /** @type {Map<string, HandlerProfile>} */
    this.handlers = new Map();
    
    /** @type {Map<string, Object>} */
    this.intentPatterns = new Map();
    
    /** @type {Array<RouteFeedback>} */
    this.feedbackHistory = [];
    
    /** @type {Map<string, number>} */
    this.routePerformance = new Map();
    
    /** @type {Object} */
    this.abTestConfig = {
      enabled: this.enableABTesting,
      groups: ['control', 'treatment'],
      splitRatio: 0.5
    };
    
    this.metrics = {
      totalRoutes: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgConfidence: 0,
      avgLatency: 0
    };
  }

  /**
   * Registers a handler for routing.
   * @param {HandlerProfile} profile - Handler profile
   * @returns {void}
   */
  registerHandler(profile) {
    if (!profile.id || !profile.type) {
      throw new Error('Handler must have id and type');
    }
    this.handlers.set(profile.id, {
      ...profile,
      qualityScore: profile.qualityScore ?? 0.8,
      currentLoad: profile.currentLoad ?? 0,
      avgLatency: profile.avgLatency ?? 100,
      available: profile.available ?? true
    });
  }

  /**
   * Unregisters a handler.
   * @param {string} handlerId - Handler identifier
   * @returns {boolean} - True if handler was removed
   */
  unregisterHandler(handlerId) {
    return this.handlers.delete(handlerId);
  }

  /**
   * Registers an intent pattern for classification.
   * @param {string} intent - Intent name
   * @param {Object} pattern - Pattern configuration
   * @param {string[]} [pattern.keywords] - Matching keywords
   * @param {string[]} [pattern.phrases] - Matching phrases
   * @param {RegExp[]} [pattern.regexes] - Matching regex patterns
   * @param {number} [pattern.complexity=5] - Typical complexity (1-10)
   * @returns {void}
   */
  registerIntent(intent, pattern) {
    this.intentPatterns.set(intent, {
      keywords: pattern.keywords || [],
      phrases: pattern.phrases || [],
      regexes: pattern.regexes || [],
      complexity: pattern.complexity ?? 5
    });
  }

  /**
   * Routes a request to the best handler.
   * @param {RouteRequest} request - Route request
   * @returns {Promise<RouteResult>} - Routing result
   */
  async route(request) {
    const startTime = Date.now();
    this.metrics.totalRoutes++;
    
    // Check cache first
    const cacheKey = this.generateCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      return { ...cached, fromCache: true };
    }
    this.metrics.cacheMisses++;
    
    // Analyze request
    const intent = this.analyzeIntent(request);
    const complexity = this.estimateComplexity(request, intent);
    
    // Find eligible handlers
    const eligibleHandlers = this.findEligibleHandlers(intent, complexity);
    if (eligibleHandlers.length === 0) {
      throw new Error(`No eligible handlers found for intent: ${intent.name}`);
    }
    
    // Score and rank handlers
    const scoredRoutes = this.scoreRoutes(eligibleHandlers, request, intent, complexity);
    const bestRoute = scoredRoutes[0];
    
    // Apply A/B testing if enabled
    const abGroup = this.enableABTesting ? this.assignABTestGroup(request) : null;
    if (abGroup && abGroup !== 'control') {
      // Apply treatment variant routing logic
      bestRoute.routingStrategy = `ab_test_${abGroup}`;
    }
    
    // Select model based on complexity and constraints
    const modelSelection = this.selectModel(complexity, bestRoute, request);
    
    const result = {
      handlerId: bestRoute.handler.id,
      handlerType: bestRoute.handler.type,
      confidence: bestRoute.confidence,
      modelId: modelSelection.modelId,
      parameters: this.extractParameters(request, intent),
      estimatedCost: modelSelection.estimatedCost,
      estimatedLatency: modelSelection.estimatedLatency,
      routingStrategy: bestRoute.routingStrategy || 'ml_optimized',
      abTestGroup: abGroup,
      intent: intent.name,
      complexity: complexity.score,
      timestamp: new Date().toISOString()
    };
    
    // Update confidence tracking
    this.updateConfidenceMetrics(result.confidence);
    
    // Cache the decision
    this.cache.set(cacheKey, result, this.cacheTTL);
    
    // Track performance
    const latency = Date.now() - startTime;
    this.metrics.avgLatency = (this.metrics.avgLatency * (this.metrics.totalRoutes - 1) + latency) / this.metrics.totalRoutes;
    
    return result;
  }

  /**
   * Analyzes request intent using pattern matching and classification.
   * @param {RouteRequest} request - Route request
   * @returns {Object} - Intent analysis result
   */
  analyzeIntent(request) {
    const content = (request.content || request.intent || '').toLowerCase();
    const scores = new Map();
    
    // Score each registered intent
    for (const [intentName, pattern] of this.intentPatterns) {
      let score = 0;
      let matches = 0;
      
      // Keyword matching
      for (const keyword of pattern.keywords) {
        if (content.includes(keyword.toLowerCase())) {
          score += 0.3;
          matches++;
        }
      }
      
      // Phrase matching
      for (const phrase of pattern.phrases) {
        if (content.includes(phrase.toLowerCase())) {
          score += 0.5;
          matches++;
        }
      }
      
      // Regex matching
      for (const regex of pattern.regexes) {
        if (regex.test(content)) {
          score += 0.7;
          matches++;
        }
      }
      
      // Normalize score by number of patterns
      const totalPatterns = pattern.keywords.length + pattern.phrases.length + pattern.regexes.length;
      if (totalPatterns > 0) {
        score = score / Math.sqrt(totalPatterns) * Math.min(matches / 3 + 0.3, 1);
      }
      
      scores.set(intentName, {
        score: Math.min(score, 1),
        complexity: pattern.complexity,
        matches
      });
    }
    
    // Find best matching intent
    let bestIntent = { name: 'unknown', score: 0, complexity: 5 };
    for (const [name, data] of scores) {
      if (data.score > bestIntent.score) {
        bestIntent = { name, ...data };
      }
    }
    
    // Use request intent if provided and no better match found
    if (request.intent && bestIntent.score < 0.5) {
      const pattern = this.intentPatterns.get(request.intent);
      bestIntent = {
        name: request.intent,
        score: 0.5,
        complexity: pattern?.complexity ?? 5,
        matches: 0
      };
    }
    
    return bestIntent;
  }

  /**
   * Estimates request complexity.
   * @param {RouteRequest} request - Route request
   * @param {Object} intent - Intent analysis result
   * @returns {Object} - Complexity estimation
   */
  estimateComplexity(request, intent) {
    let score = intent.complexity || 5;
    const factors = [];
    
    // Content length factor
    const contentLength = (request.content || '').length;
    if (contentLength > 10000) {
      score += 2;
      factors.push('long_content');
    } else if (contentLength > 5000) {
      score += 1;
      factors.push('medium_content');
    }
    
    // Context depth factor
    const metadataDepth = JSON.stringify(request.metadata || {}).length;
    if (metadataDepth > 1000) {
      score += 1;
      factors.push('rich_metadata');
    }
    
    // Priority adjustment (higher priority may need faster processing)
    const priority = request.priority || 5;
    if (priority >= 8) {
      score = Math.max(1, score - 1);
      factors.push('high_priority');
    }
    
    // Cap score at 10
    score = Math.min(10, Math.max(1, score));
    
    return {
      score,
      level: this.getComplexityLevel(score),
      factors
    };
  }

  /**
   * Gets complexity level name from score.
   * @param {number} score - Complexity score
   * @returns {string} - Complexity level
   * @private
   */
  getComplexityLevel(score) {
    if (score <= 3) return 'low';
    if (score <= 6) return 'medium';
    if (score <= 8) return 'high';
    return 'critical';
  }

  /**
   * Finds handlers eligible for the given intent and complexity.
   * @param {Object} intent - Intent analysis result
   * @param {Object} complexity - Complexity estimation
   * @returns {HandlerProfile[]} - Eligible handlers
   * @private
   */
  findEligibleHandlers(intent, complexity) {
    const eligible = [];
    
    for (const handler of this.handlers.values()) {
      if (!handler.available) continue;
      if (handler.maxComplexity < complexity.score) continue;
      
      // Check capability match
      const hasCapability = handler.capabilities.some(cap => 
        intent.name.toLowerCase().includes(cap.toLowerCase()) ||
        cap.toLowerCase().includes(intent.name.toLowerCase())
      );
      
      if (hasCapability || handler.capabilities.includes('*')) {
        eligible.push(handler);
      }
    }
    
    return eligible;
  }

  /**
   * Scores and ranks route options.
   * @param {HandlerProfile[]} handlers - Eligible handlers
   * @param {RouteRequest} request - Route request
   * @param {Object} intent - Intent analysis
   * @param {Object} complexity - Complexity estimation
   * @returns {Array<{handler: HandlerProfile, score: number, confidence: number, routingStrategy: string}>} - Scored routes
   */
  scoreRoutes(handlers, request, intent, complexity) {
    const scored = handlers.map(handler => {
      // Quality score component
      const qualityComponent = handler.qualityScore * this.qualityWeight;
      
      // Cost component (inverse, lower is better)
      const normalizedCost = 1 - (handler.costFactor / 10);
      const costComponent = normalizedCost * this.costWeight;
      
      // Latency component (inverse, lower is better)
      const normalizedLatency = 1 - Math.min(handler.avgLatency / 1000, 1);
      const latencyComponent = normalizedLatency * this.latencyWeight;
      
      // Load balancing factor
      const loadFactor = 1 - handler.currentLoad;
      
      // Capability match bonus
      const capabilityBonus = handler.capabilities.includes(intent.name) ? 0.1 : 0;
      
      // Historical performance bonus
      const performanceKey = `${handler.id}:${intent.name}`;
      const historicalScore = this.routePerformance.get(performanceKey) || 0.5;
      const performanceBonus = historicalScore * 0.1;
      
      // Calculate total score
      const score = (qualityComponent + costComponent + latencyComponent + capabilityBonus + performanceBonus) * loadFactor;
      
      // Calculate confidence based on data quality
      const confidence = this.calculateConfidence(handler, intent, complexity);
      
      return {
        handler,
        score,
        confidence,
        routingStrategy: 'ml_optimized'
      };
    });
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    return scored;
  }

  /**
   * Calculates confidence score for a route.
   * @param {HandlerProfile} handler - Handler profile
   * @param {Object} intent - Intent analysis
   * @param {Object} complexity - Complexity estimation
   * @returns {number} - Confidence score (0-1)
   * @private
   */
  calculateConfidence(handler, intent, complexity) {
    let confidence = 0.5;
    
    // Boost confidence for exact capability match
    if (handler.capabilities.includes(intent.name)) {
      confidence += 0.2;
    }
    
    // Adjust based on handler quality data reliability
    if (handler.qualityScore > 0.9) {
      confidence += 0.15;
    } else if (handler.qualityScore > 0.7) {
      confidence += 0.1;
    }
    
    // Reduce confidence for high load
    if (handler.currentLoad > 0.8) {
      confidence -= 0.15;
    }
    
    // Reduce confidence for edge complexity cases
    if (complexity.score > 9 || complexity.score < 2) {
      confidence -= 0.1;
    }
    
    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Selects the optimal model based on complexity and constraints.
   * @param {Object} complexity - Complexity estimation
   * @param {Object} route - Selected route
   * @param {RouteRequest} request - Route request
   * @returns {Object} - Model selection result
   */
  selectModel(complexity, route, request) {
    const baseCost = route.handler.costFactor;
    const baseLatency = route.handler.avgLatency;
    
    // Model selection logic based on complexity level
    let modelId;
    let costMultiplier = 1;
    let latencyMultiplier = 1;
    
    switch (complexity.level) {
      case 'low':
        modelId = 'fast';
        costMultiplier = 0.7;
        latencyMultiplier = 0.8;
        break;
      case 'medium':
        modelId = 'balanced';
        costMultiplier = 1.0;
        latencyMultiplier = 1.0;
        break;
      case 'high':
        modelId = 'powerful';
        costMultiplier = 1.5;
        latencyMultiplier = 1.3;
        break;
      case 'critical':
        modelId = 'maximum';
        costMultiplier = 2.0;
        latencyMultiplier = 1.6;
        break;
      default:
        modelId = 'balanced';
    }
    
    // Adjust for high priority requests
    if (request.priority >= 8) {
      latencyMultiplier *= 0.8;
      costMultiplier *= 1.1;
    }
    
    return {
      modelId: `${route.handler.id}:${modelId}`,
      estimatedCost: baseCost * costMultiplier,
      estimatedLatency: baseLatency * latencyMultiplier
    };
  }

  /**
   * Extracts parameters from request.
   * @param {RouteRequest} request - Route request
   * @param {Object} intent - Intent analysis
   * @returns {Object} - Extracted parameters
   * @private
   */
  extractParameters(request, intent) {
    const params = {};
    const content = request.content || '';
    
    // Extract entities using simple patterns
    const patterns = {
      date: /\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/g,
      number: /\b\d+(?:\.\d+)?\b/g,
      email: /\b[\w.-]+@[\w.-]+\.\w+\b/g,
      url: /https?:\/\/[^\s]+/g,
      quoted: /"([^"]*)"/g
    };
    
    for (const [type, regex] of Object.entries(patterns)) {
      const matches = content.match(regex);
      if (matches) {
        params[type] = matches;
      }
    }
    
    // Add request metadata
    if (request.userId) params.userId = request.userId;
    if (request.sessionId) params.sessionId = request.sessionId;
    params.intent = intent.name;
    
    return params;
  }

  /**
   * Assigns A/B test group to request.
   * @param {RouteRequest} request - Route request
   * @returns {string} - A/B test group
   * @private
   */
  assignABTestGroup(request) {
    const hash = this.hashString(request.userId || request.sessionId || String(Date.now()));
    const normalized = hash / 0xFFFFFFFF;
    return normalized < this.abTestConfig.splitRatio ? 'control' : 'treatment';
  }

  /**
   * Simple string hash function.
   * @param {string} str - String to hash
   * @returns {number} - Hash value
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
   * Generates cache key for request.
   * @param {RouteRequest} request - Route request
   * @returns {string} - Cache key
   * @private
   */
  generateCacheKey(request) {
    const intent = request.intent || '';
    const content = (request.content || '').slice(0, 100);
    const priority = request.priority || 5;
    return `route:${intent}:${this.hashString(content)}:${priority}`;
  }

  /**
   * Updates confidence tracking metrics.
   * @param {number} confidence - New confidence value
   * @private
   */
  updateConfidenceMetrics(confidence) {
    const n = this.metrics.totalRoutes;
    this.metrics.avgConfidence = (this.metrics.avgConfidence * (n - 1) + confidence) / n;
  }

  /**
   * Records feedback for route learning.
   * @param {RouteFeedback} feedback - Route feedback
   * @returns {void}
   */
  recordFeedback(feedback) {
    this.feedbackHistory.push({
      ...feedback,
      timestamp: Date.now()
    });
    
    // Update route performance scores
    const performanceKey = `${feedback.routeId}`;
    const currentScore = this.routePerformance.get(performanceKey) || 0.5;
    const learningRate = 0.1;
    
    let newScore;
    if (feedback.success) {
      newScore = currentScore * (1 - learningRate) + feedback.qualityScore * learningRate;
    } else {
      newScore = currentScore * (1 - learningRate);
    }
    
    this.routePerformance.set(performanceKey, Math.max(0, Math.min(1, newScore)));
    
    // Trim history if too large
    if (this.feedbackHistory.length > 10000) {
      this.feedbackHistory = this.feedbackHistory.slice(-5000);
    }
    
    // Invalidate cache entries related to this route
    this.cache.invalidate(`*${feedback.routeId}*`);
  }

  /**
   * Gets current routing metrics.
   * @returns {Object} - Router metrics
   */
  getMetrics() {
    const cacheStats = this.cache.getStats();
    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    
    return {
      ...this.metrics,
      cacheHitRate: totalRequests > 0 ? this.metrics.cacheHits / totalRequests : 0,
      handlersRegistered: this.handlers.size,
      intentsRegistered: this.intentPatterns.size,
      feedbackCount: this.feedbackHistory.length,
      ...cacheStats
    };
  }

  /**
   * Configures A/B testing.
   * @param {Object} config - A/B test configuration
   * @param {boolean} config.enabled - Enable A/B testing
   * @param {string[]} config.groups - Test groups
   * @param {number} config.splitRatio - Split ratio for control group
   * @returns {void}
   */
  configureABTesting(config) {
    this.abTestConfig = {
      ...this.abTestConfig,
      ...config
    };
    this.enableABTesting = this.abTestConfig.enabled;
  }

  /**
   * Updates handler load status for load balancing.
   * @param {string} handlerId - Handler identifier
   * @param {number} load - Current load (0-1)
   * @returns {void}
   */
  updateHandlerLoad(handlerId, load) {
    const handler = this.handlers.get(handlerId);
    if (handler) {
      handler.currentLoad = Math.max(0, Math.min(1, load));
    }
  }

  /**
   * Clears all cached routes.
   * @returns {void}
   */
  clearCache() {
    this.cache.clear();
  }
}

export default IntelligenceRouter;
