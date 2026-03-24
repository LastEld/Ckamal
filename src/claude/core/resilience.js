/**
 * @fileoverview Resilience patterns for Claude client
 * @module claude/core/resilience
 *
 * Provides retry logic, circuit breaker integration, bulkhead pattern,
 * timeout handling, and error classification for robust API interactions.
 */

import { EventEmitter } from 'events';

/**
 * Error classification categories for determining retry behavior
 * @readonly
 * @enum {string}
 */
export const ErrorCategory = {
  /** Network-level errors that are typically transient */
  TRANSIENT: 'transient',
  /** Rate limiting errors that require backoff */
  RATE_LIMIT: 'rate_limit',
  /** Authentication errors that should not be retried */
  AUTHENTICATION: 'authentication',
  /** Client-side errors (4xx) that should not be retried */
  CLIENT_ERROR: 'client_error',
  /** Server-side errors (5xx) that may be retried */
  SERVER_ERROR: 'server_error',
  /** Timeout errors that may be retried with caution */
  TIMEOUT: 'timeout',
  /** Unknown errors - conservative approach, may retry */
  UNKNOWN: 'unknown',
};

/**
 * Classifies an error into a category for retry decisions
 * @param {Error} error - The error to classify
 * @returns {ErrorCategory} The error category
 */
export function classifyError(error) {
  // Network/transient errors
  if (error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'EPIPE' ||
      error.code === 'ECONNABORTED') {
    return ErrorCategory.TRANSIENT;
  }

  // Timeout errors
  if (error.code === 'TIMEOUT_ERROR' || error.name === 'AbortError') {
    return ErrorCategory.TIMEOUT;
  }

  // Rate limiting
  if (error.code === 'RATE_LIMIT' || error.status === 429) {
    return ErrorCategory.RATE_LIMIT;
  }

  // Authentication errors
  if (error.code === 'AUTH_ERROR' || error.status === 401 || error.status === 403) {
    return ErrorCategory.AUTHENTICATION;
  }

  // Client errors (4xx) - don't retry
  if (error.status >= 400 && error.status < 500) {
    return ErrorCategory.CLIENT_ERROR;
  }

  // Server errors (5xx) - may retry
  if (error.status >= 500 && error.status < 600) {
    return ErrorCategory.SERVER_ERROR;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Determines if an error is retryable based on its category
 * @param {Error} error - The error to check
 * @param {Array<string>} [retryableCategories] - Additional categories to consider retryable
 * @returns {boolean} True if the error should be retried
 */
export function isRetryableError(error, retryableCategories = []) {
  const category = classifyError(error);
  const defaultRetryable = [
    ErrorCategory.TRANSIENT,
    ErrorCategory.TIMEOUT,
    ErrorCategory.SERVER_ERROR,
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.UNKNOWN,
  ];

  return [...defaultRetryable, ...retryableCategories].includes(category);
}

/**
 * Calculates exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @param {number} multiplier - Backoff multiplier
 * @param {boolean} useJitter - Whether to add random jitter
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000, multiplier = 2, useJitter = true) {
  // Calculate exponential delay
  let delay = baseDelay * Math.pow(multiplier, attempt);

  // Cap at maximum delay
  delay = Math.min(delay, maxDelay);

  // Add jitter to prevent thundering herd (±25%)
  if (useJitter) {
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    delay = Math.max(0, delay + jitter);
  }

  return Math.round(delay);
}

/**
 * RetryPolicy - Configurable retry logic with exponential backoff
 *
 * Implements the retry pattern with configurable backoff strategies,
 * error classification, and circuit breaker integration.
 *
 * @extends EventEmitter
 * @example
 * const policy = new RetryPolicy({
 *   maxRetries: 3,
 *   baseDelay: 1000,
 *   backoffMultiplier: 2
 * });
 *
 * const result = await policy.execute(async () => {
 *   return await fetchData();
 * });
 */
export class RetryPolicy extends EventEmitter {
  /**
   * Creates a new RetryPolicy instance
   * @param {Object} options - Retry configuration
   * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
   * @param {number} [options.baseDelay=1000] - Initial delay between retries (ms)
   * @param {number} [options.maxDelay=30000] - Maximum delay between retries (ms)
   * @param {number} [options.backoffMultiplier=2] - Exponential backoff multiplier
   * @param {boolean} [options.useJitter=true] - Add random jitter to delays
   * @param {Array<string>} [options.retryableErrors] - Error codes that trigger retry
   * @param {Function} [options.onRetry] - Callback invoked on each retry
   * @param {boolean} [options.circuitBreakerIntegration=true] - Enable circuit breaker signals
   */
  constructor(options = {}) {
    super();

    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelay = options.baseDelay ?? 1000;
    this.maxDelay = options.maxDelay ?? 30000;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.useJitter = options.useJitter ?? true;
    this.retryableErrors = options.retryableErrors || [];
    this.onRetry = options.onRetry || null;
    this.circuitBreakerIntegration = options.circuitBreakerIntegration ?? true;

    // Statistics
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelayMs: 0,
    };
  }

  /**
   * Executes an operation with retry logic
   * @template T
   * @param {Function} operation - Async function to execute
   * @param {Object} context - Additional context for logging/tracking
   * @returns {Promise<T>} Result of the operation
   * @throws {Error} Last error encountered after all retries exhausted
   */
  async execute(operation, context = {}) {
    let lastError;
    let totalDelay = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      this.stats.totalAttempts++;

      try {
        const result = await operation();

        // Success - emit success event
        this.emit('success', {
          attempt,
          totalDelay,
          context,
        });

        if (attempt > 0) {
          this.stats.successfulRetries++;
        }

        return result;
      } catch (error) {
        lastError = error;
        const category = classifyError(error);

        // Don't retry authentication errors
        if (category === ErrorCategory.AUTHENTICATION) {
          this.emit('nonRetryableError', { error, category, attempt, context });
          throw error;
        }

        // Don't retry client errors (4xx)
        if (category === ErrorCategory.CLIENT_ERROR) {
          this.emit('nonRetryableError', { error, category, attempt, context });
          throw error;
        }

        // Check if we should retry
        if (attempt >= this.maxRetries) {
          this.stats.failedRetries++;
          this.emit('exhausted', {
            error,
            attempts: attempt + 1,
            totalDelay,
            context,
          });

          if (this.circuitBreakerIntegration) {
            this.emit('circuitBreakerSignal', { success: false, error });
          }

          throw error;
        }

        // Calculate delay for next attempt
        const delay = category === ErrorCategory.RATE_LIMIT
          ? this.calculateRateLimitDelay(error)
          : calculateBackoff(
              attempt,
              this.baseDelay,
              this.maxDelay,
              this.backoffMultiplier,
              this.useJitter
            );

        totalDelay += delay;
        this.stats.totalDelayMs += delay;

        // Emit retry event
        this.emit('retry', {
          error,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          delay,
          category,
          context,
        });

        if (this.onRetry) {
          this.onRetry({ error, attempt: attempt + 1, delay, context });
        }

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Calculates delay for rate limit errors using Retry-After header
   * @private
   * @param {Error} error - The rate limit error
   * @returns {number} Delay in milliseconds
   */
  calculateRateLimitDelay(error) {
    // Use server-provided retry-after if available
    if (error.retryAfter) {
      return error.retryAfter * 1000;
    }

    // Default rate limit backoff
    return Math.min(this.baseDelay * 5, this.maxDelay);
  }

  /**
   * Promise-based sleep utility
   * @private
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets retry statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalAttempts > 0
        ? (this.stats.totalAttempts - this.stats.failedRetries) / this.stats.totalAttempts
        : 0,
    };
  }

  /**
   * Resets statistics
   */
  resetStats() {
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelayMs: 0,
    };
  }
}

/**
 * Bulkhead - Limits concurrent operations to prevent resource exhaustion
 *
 * Implements the bulkhead pattern to isolate failures and prevent
 * cascading failures across the system.
 *
 * @extends EventEmitter
 * @example
 * const bulkhead = new Bulkhead({ maxConcurrent: 5, maxQueue: 10 });
 * const result = await bulkhead.execute(() => fetchData());
 */
export class Bulkhead extends EventEmitter {
  /**
   * Creates a new Bulkhead instance
   * @param {Object} options - Bulkhead configuration
   * @param {number} [options.maxConcurrent=10] - Maximum concurrent operations
   * @param {number} [options.maxQueue=100] - Maximum queue size
   * @param {number} [options.queueTimeout=30000] - Max time to wait in queue (ms)
   */
  constructor(options = {}) {
    super();

    this.maxConcurrent = options.maxConcurrent ?? 10;
    this.maxQueue = options.maxQueue ?? 100;
    this.queueTimeout = options.queueTimeout ?? 30000;

    this.activeCount = 0;
    this.queue = [];
    this.metrics = {
      executed: 0,
      queued: 0,
      rejected: 0,
      timedOut: 0,
    };
  }

  /**
   * Executes an operation within the bulkhead constraints
   * @template T
   * @param {Function} operation - Operation to execute
   * @returns {Promise<T>} Operation result
   * @throws {Error} When queue is full or timeout occurs
   */
  async execute(operation) {
    // Try to execute immediately if under limit
    if (this.activeCount < this.maxConcurrent) {
      return this.runOperation(operation);
    }

    // Queue the operation
    return this.enqueue(operation);
  }

  /**
   * Runs an operation and tracks it
   * @private
   * @param {Function} operation - Operation to run
   * @returns {Promise<any>}
   */
  async runOperation(operation) {
    this.activeCount++;
    this.metrics.executed++;

    this.emit('operationStarted', {
      active: this.activeCount,
      queued: this.queue.length,
    });

    try {
      const result = await operation();
      this.emit('operationSuccess', { active: this.activeCount });
      return result;
    } catch (error) {
      this.emit('operationFailed', { error, active: this.activeCount });
      throw error;
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  /**
   * Enqueues an operation when at capacity
   * @private
   * @param {Function} operation - Operation to queue
   * @returns {Promise<any>}
   */
  enqueue(operation) {
    if (this.queue.length >= this.maxQueue) {
      this.metrics.rejected++;
      this.emit('rejected', { queueSize: this.queue.length });
      throw new Error('Bulkhead queue is full');
    }

    return new Promise((resolve, reject) => {
      const queueItem = {
        operation,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      // Set queue timeout
      const timeoutId = setTimeout(() => {
        const index = this.queue.indexOf(queueItem);
        if (index > -1) {
          this.queue.splice(index, 1);
          this.metrics.timedOut++;
          this.emit('queueTimeout', { queueSize: this.queue.length });
          reject(new Error('Bulkhead queue timeout'));
        }
      }, this.queueTimeout);

      queueItem.timeoutId = timeoutId;
      this.queue.push(queueItem);
      this.metrics.queued++;

      this.emit('enqueued', {
        queueSize: this.queue.length,
        active: this.activeCount,
      });
    });
  }

  /**
   * Processes the queue when slots become available
   * @private
   */
  processQueue() {
    if (this.queue.length === 0 || this.activeCount >= this.maxConcurrent) {
      return;
    }

    const item = this.queue.shift();
    clearTimeout(item.timeoutId);

    this.runOperation(item.operation)
      .then(item.resolve)
      .catch(item.reject);
  }

  /**
   * Gets current bulkhead status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      active: this.activeCount,
      maxConcurrent: this.maxConcurrent,
      queueSize: this.queue.length,
      maxQueue: this.maxQueue,
      availableSlots: this.maxConcurrent - this.activeCount,
      metrics: { ...this.metrics },
    };
  }

  /**
   * Clears the queue and cancels pending operations
   */
  clear() {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      clearTimeout(item.timeoutId);
      item.reject(new Error('Bulkhead cleared'));
    }
  }
}

/**
 * Timeout wrapper for operations
 *
 * @param {Function} operation - Async operation to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [message='Operation timed out'] - Error message
 * @returns {Promise<any>}
 * @throws {Error} When operation times out
 */
export async function withTimeout(operation, timeoutMs, message = 'Operation timed out') {
  return Promise.race([
    operation(),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Creates a resilient operation wrapper combining retry, bulkhead, and timeout
 *
 * @param {Function} operation - The operation to make resilient
 * @param {Object} options - Resilience options
 * @param {RetryPolicy} [options.retryPolicy] - Custom retry policy
 * @param {Bulkhead} [options.bulkhead] - Custom bulkhead
 * @param {number} [options.timeout] - Operation timeout
 * @returns {Function} Wrapped resilient operation
 */
export function makeResilient(operation, options = {}) {
  const retryPolicy = options.retryPolicy || new RetryPolicy();
  const bulkhead = options.bulkhead || new Bulkhead();
  const timeout = options.timeout;

  return async (...args) => {
    const executeOperation = () => {
      const op = () => operation(...args);
      return timeout ? withTimeout(op, timeout) : op();
    };

    return bulkhead.execute(() => retryPolicy.execute(executeOperation));
  };
}

export default {
  RetryPolicy,
  Bulkhead,
  classifyError,
  isRetryableError,
  calculateBackoff,
  withTimeout,
  makeResilient,
  ErrorCategory,
};
