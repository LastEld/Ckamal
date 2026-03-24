/**
 * @fileoverview Parallel task executor with concurrency limiting and progress tracking.
 * @module gsd/parallel-executor
 */

import { ConcurrencyLimiter } from './concurrency.js';
import { TaskQueue, Priority } from './task-queue.js';

/**
 * Task execution status.
 * @readonly
 * @enum {string}
 */
export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Task with execution metadata.
 * @typedef {Object} ExecutableTask
 * @property {string} id - Unique task identifier
 * @property {Function} execute - Task execution function
 * @property {number} [priority=Priority.NORMAL] - Task priority
 * @property {string[]} [dependencies=[]] - Task dependencies (task IDs)
 * @property {*} [data] - Task data
 * @property {Object} [metadata] - Task metadata
 */

/**
 * Task execution result.
 * @typedef {Object} TaskResult
 * @property {string} taskId - Task identifier
 * @property {TaskStatus} status - Execution status
 * @property {*} [result] - Task result on success
 * @property {Error} [error] - Error on failure
 * @property {number} [duration] - Execution duration in ms
 * @property {number} [attempts] - Number of execution attempts
 */

/**
 * Execution options.
 * @typedef {Object} ExecutionOptions
 * @property {number} [concurrency=5] - Maximum concurrent tasks
 * @property {boolean} [continueOnError=true] - Continue on individual task errors
 * @property {boolean} [abortOnError=false] - Abort all on first error
 * @property {number} [timeout] - Timeout per task in ms
 * @property {Function} [onProgress] - Progress callback
 * @property {Function} [onTaskComplete] - Task completion callback
 * @property {Function} [onTaskError] - Task error callback
 */

/**
 * Aggregated execution results.
 * @typedef {Object} ExecutionResults
 * @property {TaskResult[]} results - All task results
 * @property {TaskResult[]} successful - Successful results
 * @property {TaskResult[]} failed - Failed results
 * @property {number} total - Total tasks
 * @property {number} completed - Completed count
 * @property {number} failed - Failed count
 * @property {number} duration - Total duration in ms
 */

/**
 * Executes tasks in parallel with dependency resolution.
 */
export class ParallelExecutor {
  /**
   * @param {Object} [options] - Executor options
   * @param {number} [options.defaultConcurrency=5] - Default concurrency limit
   */
  constructor(options = {}) {
    this.defaultConcurrency = options.defaultConcurrency || 5;
    this.limiter = null;
    this.queue = null;
    this.isRunning = false;
    this.cancelled = false;
    
    /** @type {Map<string, TaskResult>} */
    this.results = new Map();
    /** @type {Map<string, ExecutableTask>} */
    this.tasks = new Map();
    /** @type {Set<string>} */
    this.running = new Set();
    
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Perform topological sort on tasks based on dependencies.
   * @param {ExecutableTask[]} tasks - Tasks to sort
   * @returns {ExecutableTask[]} Sorted tasks
   * @throws {Error} If circular dependency detected
   * @private
   */
  topologicalSort(tasks) {
    const visited = new Set();
    const temp = new Set();
    const result = [];
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    const visit = (taskId) => {
      if (temp.has(taskId)) {
        throw new Error(`Circular dependency detected: ${taskId}`);
      }
      if (visited.has(taskId)) return;

      temp.add(taskId);
      const task = taskMap.get(taskId);
      
      if (task && task.dependencies) {
        for (const depId of task.dependencies) {
          visit(depId);
        }
      }

      temp.delete(taskId);
      visited.add(taskId);
      result.push(task);
    };

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        visit(task.id);
      }
    }

    return result;
  }

  /**
   * Check if all dependencies are satisfied.
   * @param {ExecutableTask} task - Task to check
   * @returns {boolean}
   * @private
   */
  dependenciesSatisfied(task) {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every(depId => {
      const result = this.results.get(depId);
      return result && result.status === TaskStatus.COMPLETED;
    });
  }

  /**
   * Execute a single task.
   * @param {ExecutableTask} task - Task to execute
   * @param {ExecutionOptions} options - Execution options
   * @returns {Promise<TaskResult>}
   * @private
   */
  async executeTask(task, options) {
    const startTime = Date.now();
    const taskResult = {
      taskId: task.id,
      status: TaskStatus.RUNNING,
      attempts: 0
    };

    this.running.add(task.id);

    try {
      const executeWithTimeout = async () => {
        if (options.timeout) {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Task timeout')), options.timeout);
          });
          return await Promise.race([
            task.execute(task.data),
            timeoutPromise
          ]);
        }
        return await task.execute(task.data);
      };

      const result = await this.limiter.withLimit(executeWithTimeout);
      
      taskResult.status = TaskStatus.COMPLETED;
      taskResult.result = result;
      taskResult.duration = Date.now() - startTime;
      taskResult.attempts = 1;

      if (options.onTaskComplete) {
        options.onTaskComplete(taskResult);
      }

    } catch (error) {
      taskResult.status = TaskStatus.FAILED;
      taskResult.error = error;
      taskResult.duration = Date.now() - startTime;
      taskResult.attempts = 1;

      if (options.onTaskError) {
        options.onTaskError(taskResult, error);
      }

      if (options.abortOnError) {
        this.cancelled = true;
      }
    }

    this.running.delete(task.id);
    this.results.set(task.id, taskResult);

    if (taskResult.status === TaskStatus.COMPLETED) {
      this.stats.completed++;
    } else {
      this.stats.failed++;
    }

    this.reportProgress(options);

    return taskResult;
  }

  /**
   * Report progress to callback.
   * @param {ExecutionOptions} options - Execution options
   * @private
   */
  reportProgress(options) {
    if (options.onProgress) {
      options.onProgress({
        total: this.stats.total,
        completed: this.stats.completed,
        failed: this.stats.failed,
        running: this.running.size,
        pending: this.stats.total - this.stats.completed - this.stats.failed - this.running.size,
        percent: Math.round((this.stats.completed + this.stats.failed) / this.stats.total * 100)
      });
    }
  }

  /**
   * Execute tasks in parallel with concurrency control.
   * @param {ExecutableTask[]} tasks - Tasks to execute
   * @param {ExecutionOptions} [options] - Execution options
   * @returns {Promise<ExecutionResults>} Execution results
   * @example
   * const executor = new ParallelExecutor();
   * const results = await executor.execute([
   *   { id: 'task1', execute: async () => 'result1', priority: Priority.HIGH },
   *   { id: 'task2', execute: async () => 'result2', dependencies: ['task1'] }
   * ], {
   *   concurrency: 3,
   *   onProgress: (p) => console.log(`${p.percent}% complete`)
   * });
   */
  async execute(tasks, options = {}) {
    if (this.isRunning) {
      throw new Error('Executor is already running');
    }

    this.isRunning = true;
    this.cancelled = false;
    this.results.clear();
    this.tasks.clear();
    this.running.clear();

    // Initialize components
    const concurrency = options.concurrency || this.defaultConcurrency;
    this.limiter = new ConcurrencyLimiter(concurrency);
    this.queue = new TaskQueue();

    // Sort tasks by dependencies
    const sortedTasks = this.topologicalSort(tasks);
    
    // Store tasks and enqueue
    for (const task of sortedTasks) {
      this.tasks.set(task.id, task);
      this.queue.enqueue(task, task.priority || Priority.NORMAL);
    }

    this.stats = {
      total: tasks.length,
      completed: 0,
      failed: 0,
      startTime: Date.now(),
      endTime: null
    };

    const promises = [];

    // Process queue
    while (!this.cancelled && (!this.queue.isEmpty() || this.running.size > 0)) {
      // Find ready tasks (dependencies satisfied)
      const readyTasks = [];
      const pendingTasks = [];

      while (!this.queue.isEmpty()) {
        const task = this.queue.dequeue();
        if (this.dependenciesSatisfied(task)) {
          readyTasks.push(task);
        } else {
          pendingTasks.push(task);
        }
      }

      // Re-enqueue pending tasks
      for (const task of pendingTasks) {
        this.queue.enqueue(task, task.priority || Priority.NORMAL);
      }

      // Execute ready tasks
      for (const task of readyTasks) {
        if (this.cancelled) break;
        
        const promise = this.executeTask(task, options);
        promises.push(promise);

        // If abort on error, wait for result
        if (options.abortOnError) {
          const result = await promise;
          if (result.status === TaskStatus.FAILED) {
            break;
          }
        }
      }

      // Small delay to allow async operations to start
      if (readyTasks.length === 0 && this.running.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // Wait for all running tasks to complete
    await Promise.all(promises);

    this.stats.endTime = Date.now();
    this.isRunning = false;

    return this.aggregateResults();
  }

  /**
   * Aggregate execution results.
   * @returns {ExecutionResults}
   * @private
   */
  aggregateResults() {
    const allResults = Array.from(this.results.values());
    const successful = allResults.filter(r => r.status === TaskStatus.COMPLETED);
    const failedResults = allResults.filter(r => r.status === TaskStatus.FAILED);

    return {
      results: allResults,
      successful,
      failed: failedResults,
      total: this.stats.total,
      completed: this.stats.completed,
      failedCount: this.stats.failed,
      duration: this.stats.endTime - this.stats.startTime
    };
  }

  /**
   * Cancel execution.
   */
  cancel() {
    this.cancelled = true;
  }

  /**
   * Check if executor is currently running.
   * @returns {boolean}
   */
  get running() {
    return this.isRunning;
  }
}

export default ParallelExecutor;
