/**
 * @fileoverview Task executor with parallel execution, sequential execution,
 * retry logic, error handling, and progress tracking.
 * @module queue/executor
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';
import { Priority, TaskStatus } from './task-queue.js';

const logger = createLogger('executor');

/**
 * Execution mode.
 * @readonly
 * @enum {string}
 */
export const ExecutionMode = {
  PARALLEL: 'parallel',
  SEQUENTIAL: 'sequential',
  BATCHED: 'batched',
  RACE: 'race',
  ALL_SETTLED: 'allSettled'
};

/**
 * @typedef {Object} ExecutionOptions
 * @property {string} [mode='parallel'] - Execution mode
 * @property {number} [concurrency=4] - Max concurrent tasks (for parallel mode)
 * @property {number} [batchSize=10] - Batch size (for batched mode)
 * @property {number} [maxRetries=3] - Maximum retry attempts
 * @property {number} [retryDelay=1000] - Delay between retries in milliseconds
 * @property {boolean} [continueOnError=true] - Continue on error (for sequential mode)
 * @property {number} [timeout] - Timeout per task in milliseconds
 * @property {Function} [onProgress] - Progress callback
 * @property {Function} [onTaskComplete] - Individual task completion callback
 * @property {Function} [onTaskError] - Individual task error callback
 * @property {Function} [shouldRetry] - Custom retry decision function
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Whether all tasks succeeded
 * @property {Object[]} completed - Completed task results
 * @property {Object[]} failed - Failed task results
 * @property {number} total - Total number of tasks
 * @property {number} duration - Execution duration in milliseconds
 * @property {Object} stats - Execution statistics
 */

/**
 * @typedef {Object} TaskResult
 * @property {string} taskId - Task identifier
 * @property {boolean} success - Whether task succeeded
 * @property {*} [data] - Task result data (if success)
 * @property {Error} [error] - Error (if failed)
 * @property {number} attempts - Number of attempts made
 * @property {number} duration - Task execution duration in milliseconds
 */

/**
 * Task Executor with multiple execution modes and comprehensive error handling.
 * @extends EventEmitter
 */
export class Executor extends EventEmitter {
  /**
   * @param {Object} [options] - Executor options
   * @param {number} [options.defaultConcurrency=4] - Default concurrency limit
   * @param {number} [options.defaultTimeout=30000] - Default timeout in milliseconds
   * @param {boolean} [options.emitEvents=true] - Whether to emit events
   */
  constructor(options = {}) {
    super();
    this.defaultConcurrency = options.defaultConcurrency ?? 4;
    this.defaultTimeout = options.defaultTimeout ?? 30000;
    this.emitEvents = options.emitEvents !== false;
    
    /** @type {Map<string, Object>} */
    this.runningTasks = new Map();
    this.stats = {
      totalExecuted: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalRetries: 0
    };
  }

  /**
   * Generate a unique execution ID.
   * @returns {string}
   * @private
   */
  #generateId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility.
   * @param {number} ms
   * @returns {Promise<void>}
   * @private
   */
  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute a single task with retry logic and timeout.
   * @param {Object} task - Task to execute
   * @param {string} task.id - Task identifier
   * @param {Function} task.execute - Task execution function
   * @param {*} [task.data] - Task data
   * @param {Object} [options] - Execution options
   * @param {number} [options.maxRetries=3] - Maximum retry attempts
   * @param {number} [options.retryDelay=1000] - Delay between retries
   * @param {number} [options.timeout] - Timeout in milliseconds
   * @param {Function} [options.shouldRetry] - Custom retry decision
   * @returns {Promise<TaskResult>}
   * @private
   */
  async #executeSingle(task, options = {}) {
    const maxRetries = options.maxRetries ?? 0;
    const retryDelay = options.retryDelay ?? 1000;
    const timeout = options.timeout ?? this.defaultTimeout;
    const shouldRetry = options.shouldRetry ?? (() => true);

    const startTime = Date.now();
    let attempts = 0;
    let lastError = null;

    this.runningTasks.set(task.id, {
      task,
      startTime,
      attempts: 0,
      status: 'running'
    });

    while (attempts <= maxRetries) {
      attempts++;
      let timeoutId = null;
      
      try {
        this.runningTasks.set(task.id, {
          task,
          startTime,
          attempts,
          status: 'running'
        });

        const taskPromise = Promise.resolve(
          task.execute(task.data, { attempt: attempts, taskId: task.id })
        );
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Task timed out after ${timeout}ms`));
          }, timeout);
        });

        const result = await Promise.race([taskPromise, timeoutPromise]);

        const duration = Date.now() - startTime;
        
        this.runningTasks.delete(task.id);
        this.stats.totalCompleted++;

        const taskResult = {
          taskId: task.id,
          success: true,
          data: result,
          attempts,
          duration
        };

        if (this.emitEvents) {
          this.emit('task:complete', taskResult);
        }

        return taskResult;
      } catch (error) {
        lastError = error;
        
        const shouldRetryResult = shouldRetry(error, attempts);
        
        if (attempts <= maxRetries && shouldRetryResult) {
          logger.warn(`Task ${task.id} failed (attempt ${attempts}/${maxRetries + 1}): ${error.message}`);
          this.stats.totalRetries++;
          
          if (this.emitEvents) {
            this.emit('task:retry', { taskId: task.id, attempt: attempts, error });
          }
          
          await this.#sleep(retryDelay * attempts); // Exponential backoff
        } else {
          break;
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    const duration = Date.now() - startTime;
    
    this.runningTasks.delete(task.id);
    this.stats.totalFailed++;

    const taskResult = {
      taskId: task.id,
      success: false,
      error: lastError,
      attempts,
      duration
    };

    if (this.emitEvents) {
      this.emit('task:error', taskResult);
    }

    return taskResult;
  }

  /**
   * Execute tasks in parallel with concurrency limit.
   * @param {Object[]} tasks - Tasks to execute
   * @param {ExecutionOptions} [options] - Execution options
   * @returns {Promise<ExecutionResult>}
   */
  async parallel(tasks, options = {}) {
    const startTime = Date.now();
    const concurrency = options.concurrency ?? this.defaultConcurrency;
    const maxRetries = options.maxRetries ?? 0;
    const retryDelay = options.retryDelay ?? 1000;
    const timeout = options.timeout ?? this.defaultTimeout;

    logger.info(`Executing ${tasks.length} tasks in parallel (concurrency: ${concurrency})`);

    if (this.emitEvents) {
      this.emit('execution:start', { mode: ExecutionMode.PARALLEL, taskCount: tasks.length });
    }

    const results = {
      completed: [],
      failed: [],
      total: tasks.length,
      processed: 0
    };

    // Process tasks with concurrency limit
    const executing = new Set();
    
    for (const task of tasks) {
      // Wait if at concurrency limit
      while (executing.size >= concurrency) {
        await Promise.race(executing);
      }

      // Start task execution
      const promise = this.#executeSingle(task, {
        maxRetries,
        retryDelay,
        timeout,
        shouldRetry: options.shouldRetry
      }).then(result => {
        results.processed++;
        
        if (result.success) {
          results.completed.push(result);
        } else {
          results.failed.push(result);
        }

        if (options.onTaskComplete) {
          options.onTaskComplete(result);
        }
        if (options.onTaskError && !result.success) {
          options.onTaskError(result);
        }
        if (options.onProgress) {
          options.onProgress(results.processed, tasks.length, result);
        }

        executing.delete(promise);
      });

      executing.add(promise);
    }

    // Wait for all remaining tasks
    await Promise.all(executing);

    const duration = Date.now() - startTime;
    const success = results.failed.length === 0;

    const executionResult = {
      success,
      completed: results.completed,
      failed: results.failed,
      total: tasks.length,
      duration,
      stats: {
        completed: results.completed.length,
        failed: results.failed.length,
        successRate: (results.completed.length / tasks.length * 100).toFixed(2) + '%'
      }
    };

    this.stats.totalExecuted += tasks.length;

    if (this.emitEvents) {
      this.emit('execution:complete', executionResult);
    }

    return executionResult;
  }

  /**
   * Execute tasks sequentially.
   * @param {Object[]} tasks - Tasks to execute
   * @param {ExecutionOptions} [options] - Execution options
   * @returns {Promise<ExecutionResult>}
   */
  async sequential(tasks, options = {}) {
    const startTime = Date.now();
    const continueOnError = options.continueOnError !== false;
    const maxRetries = options.maxRetries ?? 0;
    const retryDelay = options.retryDelay ?? 1000;
    const timeout = options.timeout ?? this.defaultTimeout;

    logger.info(`Executing ${tasks.length} tasks sequentially`);

    if (this.emitEvents) {
      this.emit('execution:start', { mode: ExecutionMode.SEQUENTIAL, taskCount: tasks.length });
    }

    const results = {
      completed: [],
      failed: [],
      total: tasks.length
    };

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      const result = await this.#executeSingle(task, {
        maxRetries,
        retryDelay,
        timeout,
        shouldRetry: options.shouldRetry
      });

      if (result.success) {
        results.completed.push(result);
      } else {
        results.failed.push(result);
      }

      if (options.onTaskComplete) {
        options.onTaskComplete(result);
      }
      if (options.onTaskError && !result.success) {
        options.onTaskError(result);
      }
      if (options.onProgress) {
        options.onProgress(i + 1, tasks.length, result);
      }

      // Stop on error if continueOnError is false
      if (!result.success && !continueOnError) {
        logger.warn(`Stopping sequential execution due to task failure: ${task.id}`);
        break;
      }
    }

    const duration = Date.now() - startTime;
    const success = results.failed.length === 0;

    const executionResult = {
      success,
      completed: results.completed,
      failed: results.failed,
      total: tasks.length,
      duration,
      stats: {
        completed: results.completed.length,
        failed: results.failed.length,
        successRate: (results.completed.length / tasks.length * 100).toFixed(2) + '%'
      }
    };

    this.stats.totalExecuted += tasks.length;

    if (this.emitEvents) {
      this.emit('execution:complete', executionResult);
    }

    return executionResult;
  }

  /**
   * Execute tasks in batches.
   * @param {Object[]} tasks - Tasks to execute
   * @param {ExecutionOptions} [options] - Execution options
   * @returns {Promise<ExecutionResult>}
   */
  async batched(tasks, options = {}) {
    const batchSize = options.batchSize ?? 10;
    const batches = [];
    
    // Split tasks into batches
    for (let i = 0; i < tasks.length; i += batchSize) {
      batches.push(tasks.slice(i, i + batchSize));
    }

    logger.info(`Executing ${tasks.length} tasks in ${batches.length} batches (batch size: ${batchSize})`);

    if (this.emitEvents) {
      this.emit('execution:start', { 
        mode: ExecutionMode.BATCHED, 
        taskCount: tasks.length,
        batchCount: batches.length 
      });
    }

    const allCompleted = [];
    const allFailed = [];
    const startTime = Date.now();

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      if (this.emitEvents) {
        this.emit('batch:start', { batchIndex: i, batchSize: batch.length });
      }

      const result = await this.parallel(batch, {
        ...options,
        onProgress: (completed, total, taskResult) => {
          const overallCompleted = i * batchSize + completed;
          if (options.onProgress) {
            options.onProgress(overallCompleted, tasks.length, taskResult);
          }
        }
      });

      allCompleted.push(...result.completed);
      allFailed.push(...result.failed);

      if (this.emitEvents) {
        this.emit('batch:complete', { batchIndex: i, result });
      }
    }

    const duration = Date.now() - startTime;
    const success = allFailed.length === 0;

    const executionResult = {
      success,
      completed: allCompleted,
      failed: allFailed,
      total: tasks.length,
      duration,
      stats: {
        completed: allCompleted.length,
        failed: allFailed.length,
        successRate: (allCompleted.length / tasks.length * 100).toFixed(2) + '%',
        batches: batches.length
      }
    };

    this.stats.totalExecuted += tasks.length;

    if (this.emitEvents) {
      this.emit('execution:complete', executionResult);
    }

    return executionResult;
  }

  /**
   * Race tasks - return result of first completed task.
   * @param {Object[]} tasks - Tasks to race
   * @param {ExecutionOptions} [options] - Execution options
   * @returns {Promise<TaskResult>}
   */
  async race(tasks, options = {}) {
    const timeout = options.timeout ?? this.defaultTimeout;
    
    logger.info(`Racing ${tasks.length} tasks`);

    if (this.emitEvents) {
      this.emit('execution:start', { mode: ExecutionMode.RACE, taskCount: tasks.length });
    }

    const promises = tasks.map(task => 
      this.#executeSingle(task, { timeout })
    );

    try {
      const result = await Promise.race(promises);
      
      if (this.emitEvents) {
        this.emit('execution:complete', { mode: ExecutionMode.RACE, winner: result });
      }

      return result;
    } catch (error) {
      const failedResult = {
        taskId: 'race',
        success: false,
        error,
        attempts: 1,
        duration: 0
      };

      if (this.emitEvents) {
        this.emit('execution:error', failedResult);
      }

      return failedResult;
    }
  }

  /**
   * Execute all tasks and wait for all to complete (like Promise.allSettled).
   * @param {Object[]} tasks - Tasks to execute
   * @param {ExecutionOptions} [options] - Execution options
   * @returns {Promise<ExecutionResult>}
   */
  async allSettled(tasks, options = {}) {
    const startTime = Date.now();
    const maxRetries = options.maxRetries ?? 0;
    const retryDelay = options.retryDelay ?? 1000;
    const timeout = options.timeout ?? this.defaultTimeout;

    logger.info(`Executing ${tasks.length} tasks (all settled)`);

    if (this.emitEvents) {
      this.emit('execution:start', { mode: ExecutionMode.ALL_SETTLED, taskCount: tasks.length });
    }

    const results = await Promise.allSettled(
      tasks.map(task => this.#executeSingle(task, {
        maxRetries,
        retryDelay,
        timeout,
        shouldRetry: options.shouldRetry
      }))
    );

    const completed = [];
    const failed = [];

    results.forEach((result, index) => {
      const taskResult = result.status === 'fulfilled' ? result.value : {
        taskId: tasks[index]?.id || `unknown_${index}`,
        success: false,
        error: result.reason,
        attempts: 0,
        duration: 0
      };

      if (taskResult.success) {
        completed.push(taskResult);
      } else {
        failed.push(taskResult);
      }
    });

    const duration = Date.now() - startTime;

    const executionResult = {
      success: failed.length === 0,
      completed,
      failed,
      total: tasks.length,
      duration,
      stats: {
        completed: completed.length,
        failed: failed.length,
        successRate: (completed.length / tasks.length * 100).toFixed(2) + '%'
      }
    };

    this.stats.totalExecuted += tasks.length;

    if (this.emitEvents) {
      this.emit('execution:complete', executionResult);
    }

    return executionResult;
  }

  /**
   * Execute tasks with specified mode.
   * @param {Object[]} tasks - Tasks to execute
   * @param {ExecutionOptions} [options] - Execution options
   * @returns {Promise<ExecutionResult>}
   */
  async execute(tasks, options = {}) {
    if (!tasks || tasks.length === 0) {
      return {
        success: true,
        completed: [],
        failed: [],
        total: 0,
        duration: 0,
        stats: { completed: 0, failed: 0, successRate: '100%' }
      };
    }

    const mode = options.mode ?? ExecutionMode.PARALLEL;

    switch (mode) {
      case ExecutionMode.PARALLEL:
        return this.parallel(tasks, options);
      case ExecutionMode.SEQUENTIAL:
        return this.sequential(tasks, options);
      case ExecutionMode.BATCHED:
        return this.batched(tasks, options);
      case ExecutionMode.RACE:
        return this.race(tasks, options).then(winner => ({
          success: winner.success,
          completed: winner.success ? [winner] : [],
          failed: winner.success ? [] : [winner],
          total: tasks.length,
          duration: winner.duration,
          stats: { completed: winner.success ? 1 : 0, failed: winner.success ? 0 : 1, successRate: winner.success ? '100%' : '0%' }
        }));
      case ExecutionMode.ALL_SETTLED:
        return this.allSettled(tasks, options);
      default:
        throw new Error(`Unknown execution mode: ${mode}`);
    }
  }

  /**
   * Execute a single task immediately.
   * @param {Object} task - Task to execute
   * @param {Object} [options] - Execution options
   * @returns {Promise<TaskResult>}
   */
  async run(task, options = {}) {
    return this.#executeSingle(task, options);
  }

  /**
   * Get currently running tasks.
   * @returns {Object[]}
   */
  getRunningTasks() {
    return Array.from(this.runningTasks.values()).map(rt => ({
      taskId: rt.task.id,
      status: rt.status,
      startTime: rt.startTime,
      duration: Date.now() - rt.startTime,
      attempts: rt.attempts
    }));
  }

  /**
   * Get executor statistics.
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      running: this.runningTasks.size
    };
  }

  /**
   * Cancel a running task.
   * @param {string} taskId
   * @returns {boolean}
   */
  cancel(taskId) {
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      // Note: Actual cancellation depends on task implementation
      // We just mark it here
      runningTask.status = 'cancelling';
      
      if (this.emitEvents) {
        this.emit('task:cancelling', { taskId });
      }
      
      return true;
    }
    return false;
  }
}

export default Executor;
