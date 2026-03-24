/**
 * @fileoverview Concurrency limiter for controlling parallel execution.
 * @module gsd/concurrency
 */

/**
 * Semaphore for managing concurrent access.
 * @private
 */
class Semaphore {
  /**
   * @param {number} maxConcurrency - Maximum number of concurrent operations
   */
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.current = 0;
    /** @type {Array<{resolve: Function, reject: Function}>} */
    this.queue = [];
  }

  /**
   * Acquire a permit from the semaphore.
   * @returns {Promise<void>}
   */
  async acquire() {
    if (this.current < this.maxConcurrency) {
      this.current++;
      return;
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  /**
   * Release a permit back to the semaphore.
   */
  release() {
    if (this.queue.length > 0) {
      const { resolve } = this.queue.shift();
      resolve();
    } else {
      this.current--;
    }
  }
}

/**
 * Manages concurrency limiting for async operations.
 */
export class ConcurrencyLimiter {
  /**
   * @param {number} maxConcurrency - Maximum number of concurrent operations
   */
  constructor(maxConcurrency = 5) {
    if (maxConcurrency < 1) {
      throw new Error('maxConcurrency must be at least 1');
    }
    this.maxConcurrency = maxConcurrency;
    this.semaphore = new Semaphore(maxConcurrency);
  }

  /**
   * Acquire a permit to execute.
   * @returns {Promise<void>}
   */
  async acquire() {
    await this.semaphore.acquire();
  }

  /**
   * Release a permit after execution.
   */
  release() {
    this.semaphore.release();
  }

  /**
   * Execute a function within the concurrency limit.
   * @template T
   * @param {() => Promise<T>} fn - Function to execute
   * @returns {Promise<T>}
   * @example
   * const limiter = new ConcurrencyLimiter(3);
   * const result = await limiter.withLimit(async () => {
   *   return await fetchData();
   * });
   */
  async withLimit(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Get current number of active operations.
   * @returns {number}
   */
  get activeCount() {
    return this.semaphore.current;
  }

  /**
   * Get number of pending operations in queue.
   * @returns {number}
   */
  get pendingCount() {
    return this.semaphore.queue.length;
  }
}

export default ConcurrencyLimiter;
