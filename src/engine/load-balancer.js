/**
 * @fileoverview Load Balancer Module for GSD Infrastructure
 * @module gsd/load-balancer
 */

/**
 * Load balancing strategies enum
 * @readonly
 * @enum {string}
 */
export const LoadBalancerStrategies = {
  /** Distribute requests sequentially */
  ROUND_ROBIN: 'ROUND_ROBIN',
  /** Select backend with fewest active connections */
  LEAST_CONNECTIONS: 'LEAST_CONNECTIONS',
  /** Select based on configured weights */
  WEIGHTED: 'WEIGHTED',
  /** Random selection */
  RANDOM: 'RANDOM'
};

/**
 * Backend server configuration
 * @typedef {Object} Backend
 * @property {string} id - Unique backend identifier
 * @property {string} host - Backend host address
 * @property {number} port - Backend port
 * @property {number} [weight=1] - Weight for weighted strategy
 * @property {number} [maxConnections=100] - Maximum concurrent connections
 * @property {Object} [metadata={}] - Additional backend metadata
 * @property {boolean} [healthy=true] - Health status
 * @property {number} [connections=0] - Current active connections
 * @property {number} [totalRequests=0] - Total requests handled
 * @property {number} [failedRequests=0] - Failed request count
 * @property {number} [lastChecked=0] - Last health check timestamp
 */

/**
 * Health check configuration
 * @typedef {Object} HealthCheckConfig
 * @property {number} [interval=30000] - Health check interval in ms
 * @property {number} [timeout=5000] - Health check timeout in ms
 * @property {number} [unhealthyThreshold=3] - Failed checks before marking unhealthy
 * @property {number} [healthyThreshold=2] - Successful checks before marking healthy
 * @property {Function} [checkFn] - Custom health check function
 */

/**
 * Load Balancer with pluggable strategies and health checking
 */
export class LoadBalancer {
  /**
   * Create a LoadBalancer instance
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.strategy=LoadBalancerStrategies.ROUND_ROBIN] - Default strategy
   * @param {HealthCheckConfig} [options.healthCheck] - Health check configuration
   * @param {boolean} [options.enableHealthCheck=true] - Enable health checking
   */
  constructor(options = {}) {
    this.strategy = options.strategy || LoadBalancerStrategies.ROUND_ROBIN;
    this.backends = new Map();
    this.roundRobinIndex = 0;
    this.healthCheckConfig = {
      interval: 30000,
      timeout: 5000,
      unhealthyThreshold: 3,
      healthyThreshold: 2,
      ...options.healthCheck
    };
    this.enableHealthCheck = options.enableHealthCheck ?? true;
    this.healthCheckTimer = null;
    this.backendFailures = new Map(); // Track consecutive failures
    this.backendSuccesses = new Map(); // Track consecutive successes
    
    // Strategy handlers
    this.strategies = new Map([
      [LoadBalancerStrategies.ROUND_ROBIN, this._roundRobin.bind(this)],
      [LoadBalancerStrategies.LEAST_CONNECTIONS, this._leastConnections.bind(this)],
      [LoadBalancerStrategies.WEIGHTED, this._weighted.bind(this)],
      [LoadBalancerStrategies.RANDOM, this._random.bind(this)]
    ]);
    
    if (this.enableHealthCheck) {
      this._startHealthChecks();
    }
  }

  /**
   * Get healthy backends only
   * @returns {Array<Backend>} Healthy backends
   * @private
   */
  _getHealthyBackends() {
    return Array.from(this.backends.values()).filter(b => b.healthy);
  }

  /**
   * ROUND_ROBIN strategy
   * @returns {Backend|null} Selected backend
   * @private
   */
  _roundRobin() {
    const healthy = this._getHealthyBackends();
    if (healthy.length === 0) return null;
    
    const backend = healthy[this.roundRobinIndex % healthy.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % healthy.length;
    return backend;
  }

  /**
   * LEAST_CONNECTIONS strategy
   * @returns {Backend|null} Selected backend
   * @private
   */
  _leastConnections() {
    const healthy = this._getHealthyBackends();
    if (healthy.length === 0) return null;
    
    return healthy.reduce((min, backend) => 
      backend.connections < min.connections ? backend : min
    );
  }

  /**
   * WEIGHTED strategy
   * @returns {Backend|null} Selected backend
   * @private
   */
  _weighted() {
    const healthy = this._getHealthyBackends();
    if (healthy.length === 0) return null;
    
    const totalWeight = healthy.reduce((sum, b) => sum + (b.weight || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (const backend of healthy) {
      random -= (backend.weight || 1);
      if (random <= 0) return backend;
    }
    
    return healthy[healthy.length - 1];
  }

  /**
   * RANDOM strategy
   * @returns {Backend|null} Selected backend
   * @private
   */
  _random() {
    const healthy = this._getHealthyBackends();
    if (healthy.length === 0) return null;
    
    return healthy[Math.floor(Math.random() * healthy.length)];
  }

  /**
   * Register a new backend
   * @param {Backend|Object} backend - Backend configuration
   * @returns {Backend} Registered backend
   */
  registerBackend(backend) {
    const id = backend.id || `backend-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    const registered = {
      id,
      host: backend.host,
      port: backend.port,
      weight: backend.weight ?? 1,
      maxConnections: backend.maxConnections ?? 100,
      metadata: backend.metadata ?? {},
      healthy: true,
      connections: 0,
      totalRequests: 0,
      failedRequests: 0,
      lastChecked: Date.now(),
      ...backend
    };
    
    this.backends.set(id, registered);
    this.backendFailures.set(id, 0);
    this.backendSuccesses.set(id, 0);
    
    return registered;
  }

  /**
   * Unregister a backend
   * @param {string} id - Backend identifier
   * @returns {boolean} Whether backend was removed
   */
  unregisterBackend(id) {
    const existed = this.backends.delete(id);
    this.backendFailures.delete(id);
    this.backendSuccesses.delete(id);
    return existed;
  }

  /**
   * Get a backend using the current strategy
   * @param {string} [strategy] - Override strategy for this request
   * @returns {{backend: Backend|null, markStart: Function, markEnd: Function}} Backend with tracking functions
   */
  getBackend(strategy) {
    const useStrategy = strategy || this.strategy;
    const handler = this.strategies.get(useStrategy);
    
    if (!handler) {
      throw new Error(`Unknown load balancing strategy: ${useStrategy}`);
    }
    
    const backend = handler();
    
    if (!backend) {
      return {
        backend: null,
        markStart: () => {},
        markEnd: () => {}
      };
    }
    
    return {
      backend,
      markStart: () => this._markRequestStart(backend.id),
      markEnd: (success = true) => this._markRequestEnd(backend.id, success)
    };
  }

  /**
   * Mark request start on a backend
   * @param {string} id - Backend identifier
   * @private
   */
  _markRequestStart(id) {
    const backend = this.backends.get(id);
    if (backend) {
      backend.connections++;
      backend.totalRequests++;
    }
  }

  /**
   * Mark request end on a backend
   * @param {string} id - Backend identifier
   * @param {boolean} success - Whether request succeeded
   * @private
   */
  _markRequestEnd(id, success = true) {
    const backend = this.backends.get(id);
    if (backend) {
      backend.connections = Math.max(0, backend.connections - 1);
      if (!success) {
        backend.failedRequests++;
      }
    }
  }

  /**
   * Update backend health status
   * @param {string} id - Backend identifier
   * @param {boolean} healthy - New health status
   * @private
   */
  _updateHealth(id, healthy) {
    const backend = this.backends.get(id);
    if (!backend) return;
    
    backend.healthy = healthy;
    backend.lastChecked = Date.now();
    
    if (healthy) {
      this.backendSuccesses.set(id, (this.backendSuccesses.get(id) || 0) + 1);
      this.backendFailures.set(id, 0);
    } else {
      this.backendFailures.set(id, (this.backendFailures.get(id) || 0) + 1);
      this.backendSuccesses.set(id, 0);
    }
  }

  /**
   * Perform health check on a backend
   * @param {Backend} backend - Backend to check
   * @returns {Promise<boolean>} Health status
   * @private
   */
  async _checkBackend(backend) {
    const { checkFn, timeout } = this.healthCheckConfig;
    
    if (checkFn) {
      try {
        const result = await Promise.race([
          checkFn(backend),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), timeout)
          )
        ]);
        return !!result;
      } catch {
        return false;
      }
    }
    
    // Default health check: just check if backend exists
    return true;
  }

  /**
   * Run health checks on all backends
   * @returns {Promise<void>}
   * @private
   */
  async _runHealthChecks() {
    const { unhealthyThreshold, healthyThreshold } = this.healthCheckConfig;
    
    for (const backend of this.backends.values()) {
      const isHealthy = await this._checkBackend(backend);
      
      if (isHealthy) {
        const successes = (this.backendSuccesses.get(backend.id) || 0) + 1;
        this.backendSuccesses.set(backend.id, successes);
        this.backendFailures.set(backend.id, 0);
        
        if (!backend.healthy && successes >= healthyThreshold) {
          this._updateHealth(backend.id, true);
        }
      } else {
        const failures = (this.backendFailures.get(backend.id) || 0) + 1;
        this.backendFailures.set(backend.id, failures);
        this.backendSuccesses.set(backend.id, 0);
        
        if (backend.healthy && failures >= unhealthyThreshold) {
          this._updateHealth(backend.id, false);
        }
      }
    }
  }

  /**
   * Start periodic health checks
   * @private
   */
  _startHealthChecks() {
    if (this.healthCheckTimer) return;
    
    this._runHealthChecks().catch(() => {});
    
    this.healthCheckTimer = setInterval(() => {
      this._runHealthChecks().catch(() => {});
    }, this.healthCheckConfig.interval);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Register a custom load balancing strategy
   * @param {string} name - Strategy name
   * @param {Function} handler - Strategy handler (returns Backend|null)
   */
  registerStrategy(name, handler) {
    this.strategies.set(name, handler.bind(this));
  }

  /**
   * Unregister a custom strategy
   * @param {string} name - Strategy name
   * @returns {boolean} Whether strategy was removed
   */
  unregisterStrategy(name) {
    if (Object.values(LoadBalancerStrategies).includes(name)) {
      return false;
    }
    return this.strategies.delete(name);
  }

  /**
   * Set the active strategy
   * @param {string} strategy - Strategy name
   */
  setStrategy(strategy) {
    if (!this.strategies.has(strategy)) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    this.strategy = strategy;
  }

  /**
   * Get all registered backends
   * @returns {Array<Backend>} All backends
   */
  getBackends() {
    return Array.from(this.backends.values());
  }

  /**
   * Get backend statistics
   * @returns {Array<Object>} Backend statistics
   */
  getStats() {
    return Array.from(this.backends.values()).map(b => ({
      id: b.id,
      healthy: b.healthy,
      connections: b.connections,
      totalRequests: b.totalRequests,
      failedRequests: b.failedRequests,
      failureRate: b.totalRequests > 0 ? b.failedRequests / b.totalRequests : 0,
      lastChecked: b.lastChecked
    }));
  }

  /**
   * Dispose of the load balancer
   */
  dispose() {
    this.stopHealthChecks();
    this.backends.clear();
    this.backendFailures.clear();
    this.backendSuccesses.clear();
  }
}

export default LoadBalancer;
