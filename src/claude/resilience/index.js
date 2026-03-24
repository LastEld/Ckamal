/**
 * @fileoverview Resilience Module for CogniMesh v5.0
 * Combines circuit breaker, bulkhead, retry, and fallback patterns.
 * @module claude/resilience
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} CircuitBreakerConfig
 * @property {number} failureThreshold - Failures before opening
 * @property {number} resetTimeout - Time before attempting reset (ms)
 * @property {number} halfOpenRequests - Requests in half-open state
 */

/**
 * @typedef {Object} BulkheadConfig
 * @property {number} maxConcurrent - Maximum concurrent executions
 * @property {number} maxQueue - Maximum queue size
 * @property {number} queueTimeout - Queue wait timeout (ms)
 */

/**
 * @typedef {Object} RetryConfig
 * @property {number} maxAttempts - Maximum retry attempts
 * @property {number} baseDelay - Initial delay between retries (ms)
 * @property {number} maxDelay - Maximum delay between retries (ms)
 * @property {number} backoffMultiplier - Exponential backoff multiplier
 * @property {Function} [retryCondition] - Function to determine if retryable
 */

/**
 * @typedef {Object} ResilienceConfig
 * @property {CircuitBreakerConfig} [circuitBreaker] - Circuit breaker config
 * @property {BulkheadConfig} [bulkhead] - Bulkhead config
 * @property {RetryConfig} [retry] - Retry config
 * @property {Function} [fallback] - Fallback function
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Whether execution succeeded
 * @property {*} result - Execution result
 * @property {Error} [error] - Error if failed
 * @property {number} attempts - Number of attempts made
 * @property {number} duration - Execution duration (ms)
 * @property {string} [strategy] - Resilience strategy used
 */

/**
 * Circuit breaker states
 * @readonly
 * @enum {string}
 */
const CircuitState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
};

/**
 * ResilienceManager combines multiple resilience patterns:
 * - Circuit Breaker: Prevents cascade failures
 * - Bulkhead: Isolates resources
 * - Retry: Transient failure recovery
 * - Fallback: Graceful degradation
 * @extends EventEmitter
 */
export class ResilienceManager extends EventEmitter {
  /** @type {CircuitBreakerConfig} */
  #circuitConfig;
  
  /** @type {BulkheadConfig} */
  #bulkheadConfig;
  
  /** @type {RetryConfig} */
  #retryConfig;
  
  /** @type {Function} */
  #fallback;
  
  /** @type {CircuitState} */
  #circuitState = CircuitState.CLOSED;
  
  /** @type {number} */
  #failureCount = 0;
  
  /** @type {number} */
  #successCount = 0;
  
  /** @type {number} */
  #lastFailureTime = 0;
  
  /** @type {number} */
  #halfOpenAttempts = 0;
  
  /** @type {Set<Promise>} */
  #activeExecutions = new Set();
  
  /** @type {Array<{resolve: Function, reject: Function, fn: Function, context: Object}>} */
  #queue = [];
  
  /** @type {Set<string>} */
  #subscribers = new Set();
  
  /** @type {Map<string, ExecutionResult>} */
  #executionHistory = new Map();
  
  /** @type {number} */
  #maxHistorySize = 1000;

  /**
   * Creates a ResilienceManager instance.
   * @param {ResilienceConfig} [config={}] - Resilience configuration
   */
  constructor(config = {}) {
    super();

    this.#circuitConfig = {
      failureThreshold: 5,
      resetTimeout: 30000,
      halfOpenRequests: 3,
      ...config.circuitBreaker
    };

    this.#bulkheadConfig = {
      maxConcurrent: 10,
      maxQueue: 100,
      queueTimeout: 5000,
      ...config.bulkhead
    };

    this.#retryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryCondition: (error) => this.#defaultRetryCondition(error),
      ...config.retry
    };

    this.#fallback = config.fallback || null;
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
   * Subscribes to the resilience manager.
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
   * Unsubscribes from the resilience manager.
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
   * Executes a function with resilience patterns applied.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {Function} fn - Function to execute
   * @param {Object} [context={}] - Execution context
   * @param {string} [context.operation] - Operation name
   * @param {*} [context.args] - Arguments for function
   * @returns {Promise<ExecutionResult>} Execution result
   */
  async execute(subscriptionKey, fn, context = {}) {
    this.#requireAuth(subscriptionKey);
    
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // Check circuit breaker
      this.#checkCircuitState();
      
      if (this.#circuitState === CircuitState.OPEN) {
        throw new Error('Circuit breaker is OPEN');
      }

      // Apply bulkhead pattern
      const result = await this.#executeWithBulkhead(fn, context, operationId);
      
      // Record success
      this.#recordSuccess();
      
      const executionResult = {
        success: true,
        result,
        attempts: 1,
        duration: Date.now() - startTime,
        operationId
      };

      this.#recordExecution(operationId, executionResult);
      return executionResult;

    } catch (error) {
      // Record failure
      this.#recordFailure(error);

      // Try fallback
      if (this.#fallback) {
        try {
          const fallbackResult = await this.#fallback(error, context);
          
          const executionResult = {
            success: true,
            result: fallbackResult,
            attempts: 1,
            duration: Date.now() - startTime,
            strategy: 'fallback',
            operationId
          };

          this.emit('fallbackExecuted', { operationId, context, timestamp: Date.now() });
          this.#recordExecution(operationId, executionResult);
          return executionResult;
        } catch (fallbackError) {
          // Fall through to error result
        }
      }

      const executionResult = {
        success: false,
        error,
        attempts: 1,
        duration: Date.now() - startTime,
        operationId
      };

      this.#recordExecution(operationId, executionResult);
      throw error;
    }
  }

  /**
   * Executes with bulkhead pattern.
   * @private
   */
  async #executeWithBulkhead(fn, context, operationId) {
    // Check if we can execute immediately
    if (this.#activeExecutions.size < this.#bulkheadConfig.maxConcurrent) {
      return this.#executeWithRetry(fn, context, operationId);
    }

    // Check queue space
    if (this.#queue.length >= this.#bulkheadConfig.maxQueue) {
      throw new Error('Bulkhead queue full');
    }

    // Queue the request
    return new Promise((resolve, reject) => {
      const queued = {
        resolve,
        reject,
        fn,
        context,
        operationId,
        queuedAt: Date.now()
      };

      this.#queue.push(queued);
      this.emit('queued', { operationId, queuePosition: this.#queue.length });

      // Set timeout
      setTimeout(() => {
        const index = this.#queue.indexOf(queued);
        if (index !== -1) {
          this.#queue.splice(index, 1);
          reject(new Error('Bulkhead queue timeout'));
        }
      }, this.#bulkheadConfig.queueTimeout);
    });
  }

  /**
   * Executes with retry pattern.
   * @private
   */
  async #executeWithRetry(fn, context, operationId) {
    let lastError;
    let attempts = 0;

    for (let attempt = 1; attempt <= this.#retryConfig.maxAttempts; attempt++) {
      attempts = attempt;
      let executionPromise;
      
      try {
        executionPromise = Promise.resolve(fn(context.args));
        this.#activeExecutions.add(executionPromise);
        
        const result = await executionPromise;
        
        if (attempt > 1) {
          this.emit('retrySuccess', { operationId, attempts, timestamp: Date.now() });
        }
        
        return result;
      } catch (error) {
        lastError = error;

        if (attempt < this.#retryConfig.maxAttempts && 
            this.#retryConfig.retryCondition(error)) {
          
          const delay = this.#calculateDelay(attempt);
          this.emit('retryScheduled', { 
            operationId, 
            attempt, 
            delay, 
            error: error.message,
            timestamp: Date.now() 
          });
          
          await this.#sleep(delay);
        } else {
          break;
        }
      } finally {
        if (executionPromise) {
          this.#activeExecutions.delete(executionPromise);
        }
      }
    }

    throw lastError;
  }

  /**
   * Checks and updates circuit breaker state.
   * @private
   */
  #checkCircuitState() {
    if (this.#circuitState === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - this.#lastFailureTime;
      
      if (timeSinceLastFailure >= this.#circuitConfig.resetTimeout) {
        this.#circuitState = CircuitState.HALF_OPEN;
        this.#halfOpenAttempts = 0;
        this.emit('circuitHalfOpen', { timestamp: Date.now() });
      } else {
        throw new Error(`Circuit breaker OPEN (retry after ${this.#circuitConfig.resetTimeout - timeSinceLastFailure}ms)`);
      }
    }

    if (this.#circuitState === CircuitState.HALF_OPEN) {
      if (this.#halfOpenAttempts >= this.#circuitConfig.halfOpenRequests) {
        throw new Error('Circuit breaker half-open limit reached');
      }
      this.#halfOpenAttempts++;
    }
  }

  /**
   * Records a successful execution.
   * @private
   */
  #recordSuccess() {
    this.#successCount++;

    if (this.#circuitState === CircuitState.HALF_OPEN) {
      // Close circuit if enough successes in half-open
      if (this.#successCount >= this.#circuitConfig.halfOpenRequests) {
        this.#circuitState = CircuitState.CLOSED;
        this.#failureCount = 0;
        this.#successCount = 0;
        this.emit('circuitClosed', { timestamp: Date.now() });
      }
    }
  }

  /**
   * Records a failed execution.
   * @private
   */
  #recordFailure(error) {
    this.#failureCount++;
    this.#lastFailureTime = Date.now();

    if (this.#circuitState === CircuitState.HALF_OPEN) {
      // Open circuit on failure in half-open
      this.#circuitState = CircuitState.OPEN;
      this.emit('circuitOpen', { 
        reason: 'half_open_failure',
        error: error.message,
        timestamp: Date.now() 
      });
    } else if (this.#circuitState === CircuitState.CLOSED &&
               this.#failureCount >= this.#circuitConfig.failureThreshold) {
      // Open circuit on threshold reached
      this.#circuitState = CircuitState.OPEN;
      this.emit('circuitOpen', { 
        reason: 'threshold_reached',
        failures: this.#failureCount,
        timestamp: Date.now() 
      });
    }
  }

  /**
   * Calculates retry delay with exponential backoff.
   * @private
   */
  #calculateDelay(attempt) {
    const exponential = this.#retryConfig.baseDelay * 
      Math.pow(this.#retryConfig.backoffMultiplier, attempt - 1);
    const jitter = Math.random() * 100; // Add jitter
    return Math.min(exponential + jitter, this.#retryConfig.maxDelay);
  }

  /**
   * Default retry condition.
   * @private
   */
  #defaultRetryCondition(error) {
    // Retry on network errors, timeouts, rate limits
    const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED'];
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    
    if (error.code && retryableCodes.includes(error.code)) return true;
    if (error.statusCode && retryableStatuses.includes(error.statusCode)) return true;
    if (error.message?.includes('timeout')) return true;
    if (error.message?.includes('rate limit')) return true;
    
    return false;
  }

  /**
   * Records execution for history.
   * @private
   */
  #recordExecution(operationId, result) {
    this.#executionHistory.set(operationId, result);
    
    // Trim history
    while (this.#executionHistory.size > this.#maxHistorySize) {
      const firstKey = this.#executionHistory.keys().next().value;
      this.#executionHistory.delete(firstKey);
    }

    this.#processQueue();
  }

  /**
   * Processes queued requests.
   * @private
   */
  #processQueue() {
    while (this.#queue.length > 0 && 
           this.#activeExecutions.size < this.#bulkheadConfig.maxConcurrent) {
      const queued = this.#queue.shift();
      
      // Check if timed out
      if (Date.now() - queued.queuedAt > this.#bulkheadConfig.queueTimeout) {
        queued.reject(new Error('Queue timeout'));
        continue;
      }

      this.emit('dequeued', { operationId: queued.operationId });

      // Execute
      this.#executeWithRetry(queued.fn, queued.context, queued.operationId)
        .then(queued.resolve)
        .catch(queued.reject);
    }
  }

  /**
   * Sleep utility.
   * @private
   */
  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets current circuit breaker state.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {Object} Circuit state info
   */
  getCircuitState(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    
    return {
      state: this.#circuitState,
      failureCount: this.#failureCount,
      successCount: this.#successCount,
      lastFailureTime: this.#lastFailureTime,
      halfOpenAttempts: this.#halfOpenAttempts,
      config: this.#circuitConfig
    };
  }

  /**
   * Gets bulkhead statistics.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {Object} Bulkhead stats
   */
  getBulkheadStats(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    
    return {
      activeExecutions: this.#activeExecutions.size,
      queuedRequests: this.#queue.length,
      availableSlots: this.#bulkheadConfig.maxConcurrent - this.#activeExecutions.size,
      config: this.#bulkheadConfig
    };
  }

  /**
   * Gets execution history.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {Object} [options] - Filter options
   * @returns {ExecutionResult[]} Execution history
   */
  getHistory(subscriptionKey, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    let history = Array.from(this.#executionHistory.values());

    if (options.success !== undefined) {
      history = history.filter(h => h.success === options.success);
    }

    if (options.limit) {
      history = history.slice(-options.limit);
    }

    return history;
  }

  /**
   * Manually opens the circuit breaker.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} [reason='manual'] - Reason for opening
   */
  openCircuit(subscriptionKey, reason = 'manual') {
    this.#requireAuth(subscriptionKey);
    
    this.#circuitState = CircuitState.OPEN;
    this.#lastFailureTime = Date.now();
    
    this.emit('circuitOpen', { reason, manual: true, timestamp: Date.now() });
  }

  /**
   * Manually closes the circuit breaker.
   * @param {string} subscriptionKey - Authenticated subscriber key
   */
  closeCircuit(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    
    this.#circuitState = CircuitState.CLOSED;
    this.#failureCount = 0;
    this.#successCount = 0;
    this.#halfOpenAttempts = 0;
    
    this.emit('circuitClosed', { manual: true, timestamp: Date.now() });
  }

  /**
   * Gets resilience statistics.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @returns {Object} Statistics
   */
  getStats(subscriptionKey) {
    this.#requireAuth(subscriptionKey);
    
    const history = Array.from(this.#executionHistory.values());
    const successes = history.filter(h => h.success).length;
    
    return {
      circuit: this.getCircuitState(subscriptionKey),
      bulkhead: this.getBulkheadStats(subscriptionKey),
      execution: {
        total: history.length,
        successes,
        failures: history.length - successes,
        successRate: history.length > 0 ? successes / history.length : 0
      },
      subscribers: this.#subscribers.size
    };
  }

  /**
   * Updates configuration.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {ResilienceConfig} config - New configuration
   */
  updateConfig(subscriptionKey, config) {
    this.#requireAuth(subscriptionKey);
    
    if (config.circuitBreaker) {
      this.#circuitConfig = { ...this.#circuitConfig, ...config.circuitBreaker };
    }
    if (config.bulkhead) {
      this.#bulkheadConfig = { ...this.#bulkheadConfig, ...config.bulkhead };
    }
    if (config.retry) {
      this.#retryConfig = { ...this.#retryConfig, ...config.retry };
    }
    if (config.fallback) {
      this.#fallback = config.fallback;
    }

    this.emit('configUpdated', { timestamp: Date.now() });
  }

  /**
   * Disposes the manager and clears resources.
   */
  dispose() {
    this.#activeExecutions.clear();
    this.#queue = [];
    this.#executionHistory.clear();
    this.#subscribers.clear();
    this.removeAllListeners();
    
    this.#circuitState = CircuitState.CLOSED;
    this.#failureCount = 0;
    this.#successCount = 0;
  }
}

export { CircuitState };
export default ResilienceManager;
