/**
 * @fileoverview Route Matching Engine for pattern-based request routing.
 * Provides scoring, parameter extraction, and precedence handling.
 * @module intelligence/router-engine
 */

/**
 * @typedef {Object} RouteDefinition
 * @property {string} id - Route identifier
 * @property {string} path - Route path pattern
 * @property {string} handler - Handler identifier
 * @property {string} [method='*'] - HTTP method or action type
 * @property {number} [priority=0] - Route priority (higher = more specific)
 * @property {Object} [constraints] - Route constraints
 * @property {Object} [defaults] - Default parameter values
 * @property {Object} [metadata] - Additional route metadata
 */

/**
 * @typedef {Object} RouteMatch
 * @property {RouteDefinition} route - Matched route
 * @property {number} score - Match score (0-1)
 * @property {Object} params - Extracted parameters
 * @property {string} matchType - Type of match (exact, prefix, regex)
 * @property {number} precedence - Calculated precedence
 */

/**
 * @typedef {Object} MatchRequest
 * @property {string} path - Request path/content
 * @property {string} [method] - Request method/type
 * @property {Object} [headers] - Request headers/metadata
 * @property {Object} [query] - Query parameters
 */

/**
 * Route matching engine with pattern matching and scoring.
 * @class
 */
export class RouterEngine {
  /**
   * Creates an instance of RouterEngine.
   * @param {Object} options - Engine configuration
   * @param {boolean} [options.caseSensitive=false] - Case sensitive matching
   * @param {boolean} [options.strictMode=false] - Strict mode (no trailing slash tolerance)
   * @param {string} [options.paramPattern=':'] - Parameter prefix pattern
   * @param {string} [options.wildcardPattern='*'] - Wildcard pattern
   */
  constructor(options = {}) {
    this.caseSensitive = options.caseSensitive ?? false;
    this.strictMode = options.strictMode ?? false;
    this.paramPattern = options.paramPattern ?? ':';
    this.wildcardPattern = options.wildcardPattern ?? '*';
    
    /** @type {RouteDefinition[]} */
    this.routes = [];
    
    /** @type {Map<string, RegExp>} */
    this.compiledPatterns = new Map();
    
    this.metrics = {
      totalMatches: 0,
      avgMatchTime: 0,
      patternCompilations: 0
    };
  }

  /**
   * Registers a route.
   * @param {RouteDefinition} route - Route definition
   * @returns {void}
   */
  registerRoute(route) {
    if (!route.id || !route.path) {
      throw new Error('Route must have id and path');
    }
    
    const compiledRoute = {
      ...route,
      method: route.method ?? '*',
      priority: route.priority ?? 0,
      pattern: this.compilePattern(route.path)
    };
    
    this.routes.push(compiledRoute);
    this.sortRoutes();
  }

  /**
   * Registers multiple routes.
   * @param {RouteDefinition[]} routes - Array of route definitions
   * @returns {void}
   */
  registerRoutes(routes) {
    for (const route of routes) {
      this.registerRoute(route);
    }
  }

  /**
   * Unregisters a route by id.
   * @param {string} routeId - Route identifier
   * @returns {boolean} - True if route was removed
   */
  unregisterRoute(routeId) {
    const index = this.routes.findIndex(r => r.id === routeId);
    if (index !== -1) {
      this.routes.splice(index, 1);
      this.compiledPatterns.delete(routeId);
      return true;
    }
    return false;
  }

  /**
   * Matches a request against registered routes.
   * @param {MatchRequest} request - Request to match
   * @param {RouteDefinition[]} [routes] - Optional routes to match against (uses registered if not provided)
   * @returns {RouteMatch[]} - Array of matching routes sorted by relevance
   */
  match(request, routes) {
    const startTime = performance.now();
    const routesToMatch = routes || this.routes;
    const matches = [];
    
    const normalizedRequest = this.normalizeRequest(request);
    
    for (const route of routesToMatch) {
      const matchResult = this.matchRoute(normalizedRequest, route);
      if (matchResult) {
        matches.push(matchResult);
      }
    }
    
    // Sort by precedence and score
    matches.sort((a, b) => {
      if (b.precedence !== a.precedence) {
        return b.precedence - a.precedence;
      }
      return b.score - a.score;
    });
    
    // Update metrics
    const matchTime = performance.now() - startTime;
    this.metrics.totalMatches++;
    this.metrics.avgMatchTime = (this.metrics.avgMatchTime * (this.metrics.totalMatches - 1) + matchTime) / this.metrics.totalMatches;
    
    return matches;
  }

  /**
   * Finds the best matching route.
   * @param {MatchRequest} request - Request to match
   * @param {RouteDefinition[]} [routes] - Optional routes to match against
   * @returns {RouteMatch|null} - Best match or null
   */
  matchBest(request, routes) {
    const matches = this.match(request, routes);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Matches a single route.
   * @param {Object} request - Normalized request
   * @param {RouteDefinition} route - Route definition
   * @returns {RouteMatch|null} - Match result or null
   * @private
   */
  matchRoute(request, route) {
    // Method constraint check
    if (route.method !== '*' && route.method !== request.method) {
      return null;
    }
    
    // Check constraints if defined
    if (route.constraints) {
      for (const [key, constraint] of Object.entries(route.constraints)) {
        const value = request.params?.[key] || request.query?.[key];
        if (!this.checkConstraint(value, constraint)) {
          return null;
        }
      }
    }
    
    // Pattern matching
    const pathMatch = this.matchPath(request.path, route);
    if (!pathMatch) {
      return null;
    }
    
    const score = this.calculateScore(pathMatch, route, request);
    const precedence = this.calculatePrecedence(route, pathMatch);
    
    // Merge with defaults
    const params = { ...route.defaults, ...pathMatch.params };
    
    return {
      route,
      score,
      params,
      matchType: pathMatch.type,
      precedence
    };
  }

  /**
   * Matches path against route pattern.
   * @param {string} path - Request path
   * @param {RouteDefinition} route - Route definition
   * @returns {Object|null} - Path match result
   * @private
   */
  matchPath(path, route) {
    const routePath = this.caseSensitive ? route.path : route.path.toLowerCase();
    const requestPath = this.caseSensitive ? path : path.toLowerCase();
    
    // Exact match
    if (routePath === requestPath) {
      return { type: 'exact', params: {} };
    }
    
    // Check for parameter pattern
    if (routePath.includes(this.paramPattern) || routePath.includes(this.wildcardPattern)) {
      return this.matchPattern(requestPath, route);
    }
    
    // Prefix match
    if (!this.strictMode) {
      // Handle trailing slash tolerance
      const normalizedRoute = routePath.replace(/\/$/, '');
      const normalizedRequest = requestPath.replace(/\/$/, '');
      
      if (normalizedRequest.startsWith(normalizedRoute + '/')) {
        return { 
          type: 'prefix', 
          params: {},
          remainder: normalizedRequest.slice(normalizedRoute.length + 1)
        };
      }
    }
    
    // Regex match if pattern is a regex
    if (route.pattern instanceof RegExp) {
      const match = requestPath.match(route.pattern);
      if (match) {
        const params = {};
        if (match.groups) {
          Object.assign(params, match.groups);
        }
        return { type: 'regex', params, match };
      }
    }
    
    return null;
  }

  /**
   * Matches path against parameterized pattern.
   * @param {string} path - Request path
   * @param {RouteDefinition} route - Route definition
   * @returns {Object|null} - Pattern match result
   * @private
   */
  matchPattern(path, route) {
    const pattern = this.getCompiledPattern(route);
    const match = path.match(pattern);
    
    if (!match) {
      return null;
    }
    
    const params = {};
    const paramNames = route.pattern?.paramNames || [];
    
    for (let i = 0; i < paramNames.length; i++) {
      if (match[i + 1] !== undefined) {
        params[paramNames[i]] = decodeURIComponent(match[i + 1]);
      }
    }
    
    // Handle wildcard capture
    if (route.path.includes(this.wildcardPattern)) {
      const wildcardMatch = path.match(pattern);
      if (wildcardMatch && wildcardMatch.groups?.wildcard) {
        params.wildcard = wildcardMatch.groups.wildcard;
      }
    }
    
    return { type: 'pattern', params };
  }

  /**
   * Compiles a path pattern to regex.
   * @param {string} path - Path pattern
   * @returns {Object} - Compiled pattern with metadata
   */
  compilePattern(path) {
    const paramNames = [];
    let regexPattern = path;
    
    // Escape special regex characters
    regexPattern = regexPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    
    // Replace parameter placeholders :name
    regexPattern = regexPattern.replace(/\\:([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    
    // Replace wildcard *
    if (regexPattern.includes('\\*')) {
      regexPattern = regexPattern.replace(/\\\*/g, '(?:(.*))?');
      if (!paramNames.includes('wildcard')) {
        paramNames.push('wildcard');
      }
    }
    
    // Handle optional trailing slash
    if (!this.strictMode) {
      regexPattern += '\\/?';
    }
    
    regexPattern = `^${regexPattern}$`;
    
    const flags = this.caseSensitive ? '' : 'i';
    const regex = new RegExp(regexPattern, flags);
    
    this.metrics.patternCompilations++;
    
    return {
      regex,
      paramNames,
      original: path
    };
  }

  /**
   * Gets compiled pattern for a route.
   * @param {RouteDefinition} route - Route definition
   * @returns {RegExp} - Compiled regex
   * @private
   */
  getCompiledPattern(route) {
    if (!this.compiledPatterns.has(route.id)) {
      const compiled = this.compilePattern(route.path);
      this.compiledPatterns.set(route.id, compiled);
    }
    return this.compiledPatterns.get(route.id).regex;
  }

  /**
   * Checks if value matches constraint.
   * @param {*} value - Value to check
   * @param {*} constraint - Constraint definition (regex, array, function)
   * @returns {boolean} - True if constraint is satisfied
   * @private
   */
  checkConstraint(value, constraint) {
    if (value === undefined || value === null) {
      return false;
    }
    
    if (constraint instanceof RegExp) {
      return constraint.test(String(value));
    }
    
    if (Array.isArray(constraint)) {
      return constraint.includes(value);
    }
    
    if (typeof constraint === 'function') {
      return constraint(value);
    }
    
    return String(value) === String(constraint);
  }

  /**
   * Calculates match score.
   * @param {Object} pathMatch - Path match result
   * @param {RouteDefinition} route - Route definition
   * @param {Object} request - Request
   * @returns {number} - Score between 0 and 1
   * @private
   */
  calculateScore(pathMatch, route, request) {
    let score = 0.5;
    
    // Base score by match type
    switch (pathMatch.type) {
      case 'exact':
        score = 1.0;
        break;
      case 'pattern':
        score = 0.8;
        break;
      case 'prefix':
        score = 0.6;
        break;
      case 'regex':
        score = 0.75;
        break;
    }
    
    // Adjust for parameter count (more specific = higher score)
    const paramCount = Object.keys(pathMatch.params || {}).length;
    score += paramCount * 0.02;
    
    // Adjust for route priority
    score += (route.priority || 0) * 0.01;
    
    // Method match bonus
    if (route.method !== '*' && route.method === request.method) {
      score += 0.05;
    }
    
    return Math.min(1, score);
  }

  /**
   * Calculates route precedence.
   * @param {RouteDefinition} route - Route definition
   * @param {Object} pathMatch - Path match result
   * @returns {number} - Precedence value (higher = more specific)
   * @private
   */
  calculatePrecedence(route, pathMatch) {
    let precedence = route.priority || 0;
    
    // Exact matches have highest precedence
    if (pathMatch.type === 'exact') {
      precedence += 1000;
    }
    
    // Pattern matches with more static segments have higher precedence
    const staticSegments = (route.path.match(/\//g) || []).length;
    precedence += staticSegments * 10;
    
    // Fewer parameters = more specific = higher precedence
    const paramCount = Object.keys(pathMatch.params || {}).length;
    precedence -= paramCount;
    
    return precedence;
  }

  /**
   * Normalizes request for matching.
   * @param {MatchRequest} request - Raw request
   * @returns {Object} - Normalized request
   * @private
   */
  normalizeRequest(request) {
    let path = request.path || '';
    
    // Ensure leading slash
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    
    return {
      path,
      method: (request.method || '*').toUpperCase(),
      headers: request.headers || {},
      query: request.query || {},
      params: request.params || {}
    };
  }

  /**
   * Sorts routes by specificity (most specific first).
   * @private
   */
  sortRoutes() {
    this.routes.sort((a, b) => {
      // Higher priority first
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      
      // More static segments first
      const aStatic = (a.path.match(/[^:*]/g) || []).length;
      const bStatic = (b.path.match(/[^:*]/g) || []).length;
      if (bStatic !== aStatic) {
        return bStatic - aStatic;
      }
      
      // Shorter path with wildcards later
      const aWildcards = (a.path.match(/\*/g) || []).length;
      const bWildcards = (b.path.match(/\*/g) || []).length;
      return aWildcards - bWildcards;
    });
  }

  /**
   * Extracts parameters from a path using a route pattern.
   * @param {string} path - Path to extract from
   * @param {string} pattern - Route pattern
   * @returns {Object|null} - Extracted parameters or null
   */
  extractParameters(path, pattern) {
    const compiled = this.compilePattern(pattern);
    const match = path.match(compiled.regex);
    
    if (!match) {
      return null;
    }
    
    const params = {};
    for (let i = 0; i < compiled.paramNames.length; i++) {
      if (match[i + 1] !== undefined) {
        params[compiled.paramNames[i]] = decodeURIComponent(match[i + 1]);
      }
    }
    
    return params;
  }

  /**
   * Gets all registered routes.
   * @returns {RouteDefinition[]} - Array of routes
   */
  getRoutes() {
    return [...this.routes];
  }

  /**
   * Gets a route by id.
   * @param {string} routeId - Route identifier
   * @returns {RouteDefinition|null} - Route or null
   */
  getRoute(routeId) {
    return this.routes.find(r => r.id === routeId) || null;
  }

  /**
   * Clears all routes.
   * @returns {void}
   */
  clear() {
    this.routes = [];
    this.compiledPatterns.clear();
  }

  /**
   * Gets engine metrics.
   * @returns {Object} - Engine metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Resets engine metrics.
   * @returns {void}
   */
  resetMetrics() {
    this.metrics = {
      totalMatches: 0,
      avgMatchTime: 0,
      patternCompilations: 0
    };
  }
}

export default RouterEngine;
