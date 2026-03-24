/**
 * Circuit Breaker Middleware
 * Fault tolerance pattern with persistence support for CogniMesh
 *
 * @module src/middleware/circuit-breaker
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} CircuitBreakerState
 * @property {string} state - Current state (CLOSED, OPEN, HALF_OPEN)
 * @property {number} failureCount - Current failure count
 * @property {number} successCount - Current success count
 * @property {number} lastFailureTime - Timestamp of last failure
 * @property {number} lastSuccessTime - Timestamp of last success
 * @property {number} openedAt - When circuit was opened
 * @property {number} halfOpenAttempts - Number of half-open probe attempts
 * @property {string} circuitId - Unique circuit identifier
 */

/**
 * @typedef {Object} CircuitBreakerConfig
 * @property {number} failureThreshold - Failures before opening
 * @property {number} successThreshold - Successes before closing from half-open
 * @property {number} timeout - Timeout before attempting half-open (ms)
 * @property {number} halfOpenMaxCalls - Max probe calls in half-open state
 * @property {boolean} resetTimeout - Whether to reset on timeout
 * @property {string} [persistencePath] - Path for state persistence
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Whether execution succeeded
 * @property {*} [result] - Function result on success
 * @property {Error} [error] - Error on failure
 * @property {string} state - State after execution
 * @property {boolean} rejected - Whether call was rejected by circuit
 */

// ============================================================================
// Constants
// ============================================================================

const CIRCUIT_STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

const DEFAULT_CONFIG = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,
  halfOpenMaxCalls: 3,
  resetTimeout: true
};

// ============================================================================
// Errors
// ============================================================================

/**
 * Circuit breaker error
 */
export class CircuitBreakerError extends Error {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.code = code;
    this.metadata = metadata;
  }
}

// ============================================================================
// CircuitBreaker Class
// ============================================================================

/**
 * Circuit breaker implementation with states:
 * - CLOSED: Normal operation
 * - OPEN: Failing, rejecting calls
 * - HALF_OPEN: Testing if service recovered
 */
export class CircuitBreaker {
  #state;
  #config;
  #stats;
  #listeners;
  #persistencePath;
  #circuitId;
  #halfOpenCallCount;

  /**
   * @param {string} [circuitId] - Unique circuit identifier
   * @param {CircuitBreakerConfig} [config] - Configuration
   */
  constructor(circuitId = null, config = {}) {
    this.#circuitId = circuitId || `cb_${randomUUID()}`;
    this.#config = { ...DEFAULT_CONFIG, ...config };
    this.#persistencePath = config.persistencePath || null;
    this.#listeners = new Map();
    this.#halfOpenCallCount = 0;

    this.#initializeState();
  }

  // ========================================================================
  // State Management
  // ========================================================================

  /**
   * Initialize circuit state
   * @private
   */
  #initializeState() {
    this.#state = {
      state: CIRCUIT_STATES.CLOSED,
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      openedAt: null,
      halfOpenAttempts: 0,
      circuitId: this.#circuitId
    };

    this.#stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      stateTransitions: [],
      lastTransitionTime: null
    };
  }

  /**
   * Get current state
   * @returns {CircuitBreakerState} Current state
   */
  getState() {
    return { ...this.#state };
  }

  /**
   * Get circuit identifier
   * @returns {string} Circuit ID
   */
  getCircuitId() {
    return this.#circuitId;
  }

  /**
   * Check if circuit allows calls
   * @returns {boolean} True if calls are allowed
   */
  canExecute() {
    const currentState = this.#state.state;

    if (currentState === CIRCUIT_STATES.CLOSED) {
      return true;
    }

    if (currentState === CIRCUIT_STATES.OPEN) {
      // Check if timeout has passed for half-open transition
      if (this.#config.resetTimeout && this.#shouldAttemptReset()) {
        this.#transitionTo(CIRCUIT_STATES.HALF_OPEN);
        this.#halfOpenCallCount = 0;
        return true;
      }
      return false;
    }

    if (currentState === CIRCUIT_STATES.HALF_OPEN) {
      return this.#halfOpenCallCount < this.#config.halfOpenMaxCalls;
    }

    return false;
  }

  /**
   * Execute function with circuit breaker protection
   * @template T
   * @param {Function} fn - Function to execute
   * @param {Object} [options] - Execution options
   * @param {number} [options.timeout] - Execution timeout
   * @param {*} [options.fallback] - Fallback value on rejection
   * @returns {Promise<ExecutionResult>} Execution result
   */
  async execute(fn, options = {}) {
    this.#stats.totalCalls++;

    // Check if call should be rejected
    if (!this.canExecute()) {
      this.#stats.rejectedCalls++;
      
      if (options.fallback !== undefined) {
        return {
          success: true,
          result: options.fallback,
          state: this.#state.state,
          rejected: true
        };
      }

      throw new CircuitBreakerError(
        'CIRCUIT_OPEN',
        'Circuit breaker is open - request rejected',
        { circuitId: this.#circuitId, state: this.#state.state }
      );
    }

    // Track half-open calls
    if (this.#state.state === CIRCUIT_STATES.HALF_OPEN) {
      this.#halfOpenCallCount++;
    }

    try {
      // Execute with optional timeout
      let result;
      if (options.timeout) {
        result = await this.#executeWithTimeout(fn, options.timeout);
      } else {
        result = await fn();
      }

      this.recordSuccess();
      
      return {
        success: true,
        result,
        state: this.#state.state,
        rejected: false
      };
    } catch (error) {
      this.recordFailure();

      if (options.fallback !== undefined) {
        return {
          success: true,
          result: options.fallback,
          state: this.#state.state,
          rejected: false
        };
      }

      return {
        success: false,
        error,
        state: this.#state.state,
        rejected: false
      };
    }
  }

  /**
   * Record a successful execution
   */
  recordSuccess() {
    const previousState = this.#state.state;

    this.#state.successCount++;
    this.#state.lastSuccessTime = Date.now();
    this.#stats.successfulCalls++;

    // Handle state transitions
    if (previousState === CIRCUIT_STATES.HALF_OPEN) {
      if (this.#state.successCount >= this.#config.successThreshold) {
        this.#transitionTo(CIRCUIT_STATES.CLOSED);
        this.#resetCounters();
      }
    } else if (previousState === CIRCUIT_STATES.CLOSED) {
      // Gradually reduce failure count on success (sliding window effect)
      if (this.#state.failureCount > 0) {
        this.#state.failureCount = Math.max(0, this.#state.failureCount - 1);
      }
    }

    this.#emit('success', { state: this.#state });
  }

  /**
   * Record a failed execution
   */
  recordFailure() {
    const previousState = this.#state.state;

    this.#state.failureCount++;
    this.#state.lastFailureTime = Date.now();
    this.#stats.failedCalls++;

    // Handle state transitions
    if (previousState === CIRCUIT_STATES.HALF_OPEN) {
      // Any failure in half-open immediately opens circuit
      this.#transitionTo(CIRCUIT_STATES.OPEN);
      this.#state.openedAt = Date.now();
    } else if (previousState === CIRCUIT_STATES.CLOSED) {
      if (this.#state.failureCount >= this.#config.failureThreshold) {
        this.#transitionTo(CIRCUIT_STATES.OPEN);
        this.#state.openedAt = Date.now();
      }
    }

    this.#emit('failure', { state: this.#state });
  }

  /**
   * Force circuit to OPEN state
   */
  forceOpen() {
    this.#transitionTo(CIRCUIT_STATES.OPEN);
    this.#state.openedAt = Date.now();
  }

  /**
   * Force circuit to CLOSED state
   */
  forceClose() {
    this.#transitionTo(CIRCUIT_STATES.CLOSED);
    this.#resetCounters();
  }

  /**
   * Force circuit to HALF_OPEN state
   */
  forceHalfOpen() {
    this.#transitionTo(CIRCUIT_STATES.HALF_OPEN);
    this.#halfOpenCallCount = 0;
    this.#state.successCount = 0;
  }

  // ========================================================================
  // Persistence
  // ========================================================================

  /**
   * Save circuit state to disk
   * @param {string} [path] - Custom persistence path
   * @returns {Promise<boolean>} Success status
   */
  async saveState(path = null) {
    const savePath = path || this.#persistencePath;
    
    if (!savePath) {
      return false;
    }

    try {
      const data = {
        circuitId: this.#circuitId,
        state: this.#state,
        stats: this.#stats,
        config: {
          failureThreshold: this.#config.failureThreshold,
          successThreshold: this.#config.successThreshold,
          timeout: this.#config.timeout,
          halfOpenMaxCalls: this.#config.halfOpenMaxCalls
        },
        savedAt: new Date().toISOString()
      };

      const dir = dirname(savePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      await writeFile(savePath, JSON.stringify(data, null, 2), 'utf8');
      this.#emit('persist', { path: savePath });
      
      return true;
    } catch (error) {
      this.#emit('error', { type: 'persist', error });
      return false;
    }
  }

  /**
   * Load circuit state from disk
   * @param {string} [path] - Custom persistence path
   * @returns {Promise<boolean>} Success status
   */
  async loadState(path = null) {
    const loadPath = path || this.#persistencePath;
    
    if (!loadPath || !existsSync(loadPath)) {
      return false;
    }

    try {
      const content = await readFile(loadPath, 'utf8');
      const data = JSON.parse(content);

      if (data.circuitId !== this.#circuitId) {
        throw new Error('Circuit ID mismatch');
      }

      // Restore state
      this.#state = {
        ...data.state,
        // Reset half-open state on load to avoid stuck states
        state: data.state.state === CIRCUIT_STATES.HALF_OPEN 
          ? CIRCUIT_STATES.OPEN 
          : data.state.state
      };

      if (data.stats) {
        this.#stats = { ...this.#stats, ...data.stats };
      }

      this.#emit('restore', { path: loadPath, state: this.#state });
      
      return true;
    } catch (error) {
      this.#emit('error', { type: 'restore', error });
      return false;
    }
  }

  // ========================================================================
  // Event Handling
  // ========================================================================

  /**
   * Subscribe to circuit events
   * @param {string} event - Event name (stateChange, success, failure, open, close, halfOpen)
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    
    this.#listeners.get(event).add(handler);

    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe from events
   * @param {string} event - Event name
   * @param {Function} handler - Handler to remove
   */
  off(event, handler) {
    const handlers = this.#listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit event
   * @private
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  #emit(event, data) {
    const handlers = this.#listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data, this);
        } catch (error) {
          // Ignore handler errors
        }
      }
    }

    // Emit generic 'event' handler
    const allHandlers = this.#listeners.get('*');
    if (allHandlers) {
      for (const handler of allHandlers) {
        try {
          handler({ type: event, ...data }, this);
        } catch (error) {
          // Ignore handler errors
        }
      }
    }
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  /**
   * Get circuit statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.#stats,
      currentState: this.#state.state,
      failureCount: this.#state.failureCount,
      successCount: this.#state.successCount,
      successRate: this.#stats.totalCalls > 0 
        ? this.#stats.successfulCalls / this.#stats.totalCalls 
        : 0,
      openDuration: this.#state.state === CIRCUIT_STATES.OPEN && this.#state.openedAt
        ? Date.now() - this.#state.openedAt
        : 0
    };
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    this.#stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      stateTransitions: [],
      lastTransitionTime: null
    };
    this.#resetCounters();
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Transition to new state
   * @private
   * @param {string} newState - New state
   */
  #transitionTo(newState) {
    const oldState = this.#state.state;
    
    if (oldState === newState) {
      return;
    }

    this.#state.state = newState;
    this.#state.halfOpenAttempts = newState === CIRCUIT_STATES.HALF_OPEN 
      ? (this.#state.halfOpenAttempts || 0) + 1 
      : this.#state.halfOpenAttempts;

    this.#stats.stateTransitions.push({
      from: oldState,
      to: newState,
      timestamp: Date.now()
    });
    this.#stats.lastTransitionTime = Date.now();

    this.#emit('stateChange', { from: oldState, to: newState });
    this.#emit(newState.toLowerCase(), { from: oldState });
  }

  /**
   * Reset failure/success counters
   * @private
   */
  #resetCounters() {
    this.#state.failureCount = 0;
    this.#state.successCount = 0;
    this.#halfOpenCallCount = 0;
  }

  /**
   * Check if should attempt reset (transition to half-open)
   * @private
   * @returns {boolean}
   */
  #shouldAttemptReset() {
    if (!this.#state.openedAt) {
      return false;
    }

    return Date.now() - this.#state.openedAt >= this.#config.timeout;
  }

  /**
   * Execute function with timeout
   * @private
   * @param {Function} fn - Function to execute
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<*>}
   */
  #executeWithTimeout(fn, timeout) {
    return Promise.race([
      fn(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Execution timeout after ${timeout}ms`));
        }, timeout);
      })
    ]);
  }
}

// ============================================================================
// Circuit Breaker Registry
// ============================================================================

/**
 * Registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  #breakers;
  #defaultConfig;

  /**
   * @param {Object} [defaultConfig] - Default circuit breaker config
   */
  constructor(defaultConfig = {}) {
    this.#breakers = new Map();
    this.#defaultConfig = defaultConfig;
  }

  /**
   * Get or create circuit breaker
   * @param {string} circuitId - Circuit identifier
   * @param {CircuitBreakerConfig} [config] - Circuit-specific config
   * @returns {CircuitBreaker} Circuit breaker instance
   */
  get(circuitId, config = {}) {
    if (!this.#breakers.has(circuitId)) {
      const breaker = new CircuitBreaker(circuitId, {
        ...this.#defaultConfig,
        ...config
      });
      this.#breakers.set(circuitId, breaker);
    }

    return this.#breakers.get(circuitId);
  }

  /**
   * Remove a circuit breaker
   * @param {string} circuitId - Circuit identifier
   * @returns {boolean} True if removed
   */
  remove(circuitId) {
    const breaker = this.#breakers.get(circuitId);
    if (breaker) {
      this.#breakers.delete(circuitId);
      return true;
    }
    return false;
  }

  /**
   * Get all circuit breakers
   * @returns {Map<string, CircuitBreaker>} All breakers
   */
  getAll() {
    return new Map(this.#breakers);
  }

  /**
   * Get statistics for all circuits
   * @returns {Object} Statistics by circuit ID
   */
  getAllStats() {
    const stats = {};
    for (const [id, breaker] of this.#breakers) {
      stats[id] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Save all circuit states
   * @param {string} basePath - Base directory for persistence
   * @returns {Promise<Object>} Save results
   */
  async saveAll(basePath) {
    const results = {};

    for (const [id, breaker] of this.#breakers) {
      const path = join(basePath, `${id}.json`);
      results[id] = await breaker.saveState(path);
    }

    return results;
  }

  /**
   * Load all circuit states
   * @param {string} basePath - Base directory for persistence
   * @returns {Promise<Object>} Load results
   */
  async loadAll(basePath) {
    const results = {};

    for (const [id, breaker] of this.#breakers) {
      const path = join(basePath, `${id}.json`);
      results[id] = await breaker.loadState(path);
    }

    return results;
  }

  /**
   * Clear all circuit breakers
   */
  clear() {
    this.#breakers.clear();
  }
}

// ============================================================================
// Singleton Instances
// ============================================================================

let defaultInstance = null;
let defaultRegistry = null;

/**
 * Get default circuit breaker instance
 * @returns {CircuitBreaker}
 */
export function getCircuitBreaker(circuitId = 'default') {
  if (!defaultInstance) {
    defaultInstance = new CircuitBreaker(circuitId);
  }
  return defaultInstance;
}

/**
 * Get default circuit breaker registry
 * @returns {CircuitBreakerRegistry}
 */
export function getCircuitBreakerRegistry() {
  if (!defaultRegistry) {
    defaultRegistry = new CircuitBreakerRegistry();
  }
  return defaultRegistry;
}

/**
 * Reset default instances (primarily for testing)
 */
export function resetCircuitBreakers() {
  if (defaultInstance) {
    defaultInstance = null;
  }
  if (defaultRegistry) {
    defaultRegistry.clear();
    defaultRegistry = null;
  }
}

/**
 * Alias for resetCircuitBreakers for backward compatibility
 */
export function resetCircuitBreaker() {
  resetCircuitBreakers();
}

// ============================================================================
// Exports
// ============================================================================

export { CIRCUIT_STATES };
export const CircuitState = CIRCUIT_STATES;

/**
 * Get all circuit breakers from registry
 * @returns {Map<string, CircuitBreaker>} All breakers
 */
export function getAllCircuitBreakers() {
  return getCircuitBreakerRegistry().getAll();
}

/**
 * Get all circuit states
 * @returns {Object} States by circuit ID
 */
export function getAllCircuitStates() {
  const states = {};
  for (const [id, breaker] of getCircuitBreakerRegistry().getAll()) {
    states[id] = breaker.getState();
  }
  return states;
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers() {
  resetCircuitBreakers();
}

/**
 * Remove a circuit breaker
 * @param {string} circuitId - Circuit ID
 * @returns {boolean} True if removed
 */
export function removeCircuitBreaker(circuitId) {
  return getCircuitBreakerRegistry().remove(circuitId);
}

/**
 * Clear all circuit breakers
 */
export function clearAllCircuitBreakers() {
  getCircuitBreakerRegistry().clear();
}

export default CircuitBreaker;
