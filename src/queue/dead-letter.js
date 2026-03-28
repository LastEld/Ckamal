/**
 * @fileoverview Dead Letter Queue for failed task storage, retry tracking,
 * and manual retry capabilities.
 * @module queue/dead-letter
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('dead-letter');

/**
 * Failed task status.
 * @readonly
 * @enum {string}
 */
export const FailedTaskStatus = {
  FAILED: 'failed',
  RETRYING: 'retrying',
  RETRIED: 'retried',
  ARCHIVED: 'archived',
  DISCARDED: 'discarded'
};

/**
 * @typedef {Object} FailedTask
 * @property {string} id - Failed task identifier
 * @property {string} originalId - Original task ID
 * @property {Function} execute - Task execution function (serialized if possible)
 * @property {*} [data] - Original task data
 * @property {Object} [metadata] - Original task metadata
 * @property {string} error - Error message
 * @property {string} [stack] - Error stack trace
 * @property {number} failedAt - Timestamp when task failed
 * @property {number} attempts - Number of retry attempts made
 * @property {string} status - Current status in dead letter queue
 * @property {number} [retriedAt] - Timestamp when manually retried
 * @property {string} [retryResult] - Result of manual retry
 * @property {string} [queue] - Source queue name
 * @property {string} [worker] - Worker that processed the task
 * @property {Object[]} [attemptHistory] - History of all attempts
 */

/**
 * Dead Letter Queue for managing failed tasks.
 * @extends EventEmitter
 */
export class DeadLetterQueue extends EventEmitter {
  /**
   * @param {Object} [options] - DLQ options
   * @param {number} [options.maxSize=10000] - Maximum queue size
   * @param {number} [options.retentionDays=30] - Retention period in days
   * @param {boolean} [options.autoArchive=true] - Auto-archive old tasks
   * @param {boolean} [options.emitEvents=true] - Whether to emit events
   */
  constructor(options = {}) {
    super();
    this.maxSize = options.maxSize ?? 10000;
    this.retentionDays = options.retentionDays ?? 30;
    this.autoArchive = options.autoArchive !== false;
    this.emitEvents = options.emitEvents !== false;
    
    /** @type {Map<string, FailedTask>} */
    this.failedTasks = new Map();
    /** @type {Map<string, FailedTask>} */
    this.archivedTasks = new Map();
    
    this.stats = {
      totalFailed: 0,
      totalRetried: 0,
      totalRecovered: 0,
      totalDiscarded: 0,
      totalArchived: 0
    };

    // Start cleanup interval if auto-archive enabled
    if (this.autoArchive) {
      this.#startCleanupInterval();
    }
  }

  /**
   * Generate a unique failed task ID.
   * @returns {string}
   * @private
   */
  #generateId() {
    return `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start cleanup interval for old tasks.
   * @private
   */
  #startCleanupInterval() {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
    this.cleanupInterval.unref?.();
  }

  /**
   * Add a failed task to the dead letter queue.
   * @param {Object} task - The failed task
   * @param {string} task.id - Original task ID
   * @param {Function} [task.execute] - Task execution function
   * @param {*} [task.data] - Task data
   * @param {Object} [task.metadata] - Task metadata
   * @param {Error} error - The error that caused failure
   * @param {Object} [options] - Additional options
   * @param {number} [options.attempts=0] - Number of attempts made
   * @param {string} [options.queue] - Source queue name
   * @param {string} [options.worker] - Worker that processed the task
   * @param {Object[]} [options.attemptHistory] - History of attempts
   * @returns {FailedTask}
   */
  add(task, error, options = {}) {
    // Check queue size limit
    if (this.failedTasks.size >= this.maxSize) {
      // Remove oldest task
      const oldest = this.#getOldestTask();
      if (oldest) {
        this.failedTasks.delete(oldest.id);
        logger.warn(`Removed oldest failed task due to size limit: ${oldest.id}`);
      }
    }

    const failedTaskId = this.#generateId();
    const now = Date.now();

    const failedTask = {
      id: failedTaskId,
      originalId: task.id,
      execute: task.execute,
      data: task.data ?? null,
      metadata: {
        ...task.metadata,
        originalPriority: task.priority,
        originalTag: task.metadata?.tag
      },
      error: error?.message || String(error),
      stack: error?.stack,
      failedAt: now,
      attempts: options.attempts ?? 0,
      status: FailedTaskStatus.FAILED,
      queue: options.queue || 'unknown',
      worker: options.worker,
      attemptHistory: options.attemptHistory || []
    };

    this.failedTasks.set(failedTaskId, failedTask);
    this.stats.totalFailed++;

    logger.error(`Task added to dead letter queue: ${failedTaskId} (original: ${task.id})`);
    logger.error(`  Error: ${failedTask.error}`);

    if (this.emitEvents) {
      this.emit('task:failed', failedTask);
    }

    return failedTask;
  }

  /**
   * Get the oldest task in the queue.
   * @returns {FailedTask|null}
   * @private
   */
  #getOldestTask() {
    let oldest = null;
    for (const task of this.failedTasks.values()) {
      if (!oldest || task.failedAt < oldest.failedAt) {
        oldest = task;
      }
    }
    return oldest;
  }

  /**
   * Get a failed task by ID.
   * @param {string} failedTaskId
   * @returns {FailedTask|null}
   */
  get(failedTaskId) {
    return this.failedTasks.get(failedTaskId) || this.archivedTasks.get(failedTaskId) || null;
  }

  /**
   * Get a failed task by original task ID.
   * @param {string} originalId
   * @returns {FailedTask|null}
   */
  getByOriginalId(originalId) {
    for (const task of this.failedTasks.values()) {
      if (task.originalId === originalId) {
        return task;
      }
    }
    for (const task of this.archivedTasks.values()) {
      if (task.originalId === originalId) {
        return task;
      }
    }
    return null;
  }

  /**
   * List failed tasks with optional filtering.
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.queue] - Filter by source queue
   * @param {string} [filters.worker] - Filter by worker
   * @param {Date} [filters.since] - Filter tasks failed after this date
   * @param {Date} [filters.until] - Filter tasks failed before this date
   * @param {number} [filters.limit] - Limit results
   * @param {number} [filters.offset] - Offset results
   * @returns {FailedTask[]}
   */
  list(filters = {}) {
    let tasks = Array.from(this.failedTasks.values());

    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }

    if (filters.queue) {
      tasks = tasks.filter(t => t.queue === filters.queue);
    }

    if (filters.worker) {
      tasks = tasks.filter(t => t.worker === filters.worker);
    }

    if (filters.since) {
      const since = filters.since.getTime();
      tasks = tasks.filter(t => t.failedAt >= since);
    }

    if (filters.until) {
      const until = filters.until.getTime();
      tasks = tasks.filter(t => t.failedAt <= until);
    }

    // Sort by failedAt descending (newest first)
    tasks.sort((a, b) => b.failedAt - a.failedAt);

    // Apply pagination
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? tasks.length;
    
    return tasks.slice(offset, offset + limit);
  }

  /**
   * Manually retry a failed task.
   * @param {string} failedTaskId - Failed task ID
   * @param {Object} [options] - Retry options
   * @param {Function} [options.onRetry] - Callback for retry (receives task to retry)
   * @param {boolean} [options.removeOnSuccess=true] - Remove from DLQ on success
   * @returns {Promise<{success: boolean, result?: *, error?: Error, task?: FailedTask}>}
   */
  async retry(failedTaskId, options = {}) {
    const failedTask = this.failedTasks.get(failedTaskId);
    if (!failedTask) {
      logger.warn(`Cannot retry: failed task ${failedTaskId} not found`);
      return { success: false, error: new Error('Failed task not found') };
    }

    if (!failedTask.execute) {
      logger.warn(`Cannot retry: task ${failedTaskId} has no execute function`);
      return { success: false, error: new Error('Task has no execute function') };
    }

    failedTask.status = FailedTaskStatus.RETRYING;
    failedTask.retriedAt = Date.now();
    failedTask.attempts++;

    logger.info(`Retrying failed task: ${failedTaskId} (attempt ${failedTask.attempts})`);

    if (this.emitEvents) {
      this.emit('task:retrying', failedTask);
    }

    try {
      // Create retryable task
      const retryTask = {
        id: failedTask.originalId,
        execute: failedTask.execute,
        data: failedTask.data,
        metadata: {
          ...failedTask.metadata,
          dlqRetry: true,
          dlqId: failedTaskId,
          attempt: failedTask.attempts
        }
      };

      // Execute retry
      const result = await failedTask.execute(failedTask.data, {
        isRetry: true,
        dlqId: failedTaskId,
        attempt: failedTask.attempts,
        previousError: failedTask.error
      });

      // Success
      failedTask.status = FailedTaskStatus.RETRIED;
      failedTask.retryResult = 'success';
      failedTask.retryResultData = result;
      this.stats.totalRetried++;
      this.stats.totalRecovered++;

      logger.info(`Task retry succeeded: ${failedTaskId}`);

      if (this.emitEvents) {
        this.emit('task:recovered', { task: failedTask, result });
      }

      // Remove from DLQ if configured
      if (options.removeOnSuccess !== false) {
        this.failedTasks.delete(failedTaskId);
      }

      // Call retry callback if provided
      if (options.onRetry) {
        await options.onRetry(retryTask);
      }

      return { success: true, result, task: failedTask };
    } catch (error) {
      // Failed again
      failedTask.status = FailedTaskStatus.FAILED;
      failedTask.retryResult = 'failed';
      failedTask.lastRetryError = error.message;
      failedTask.attemptHistory.push({
        attempt: failedTask.attempts,
        error: error.message,
        timestamp: Date.now()
      });

      this.stats.totalRetried++;

      logger.error(`Task retry failed: ${failedTaskId} - ${error.message}`);

      if (this.emitEvents) {
        this.emit('task:retry-failed', { task: failedTask, error });
      }

      return { success: false, error, task: failedTask };
    }
  }

  /**
   * Retry multiple failed tasks.
   * @param {string[]} failedTaskIds - Array of failed task IDs
   * @param {Object} [options] - Retry options
   * @param {boolean} [options.stopOnError=false] - Stop on first error
   * @returns {Promise<{total: number, succeeded: number, failed: number, results: Array}>}
   */
  async retryMany(failedTaskIds, options = {}) {
    const results = [];
    let succeeded = 0;
    let failed = 0;

    for (const taskId of failedTaskIds) {
      const result = await this.retry(taskId, options);
      results.push({ taskId, ...result });

      if (result.success) {
        succeeded++;
      } else {
        failed++;
        if (options.stopOnError) {
          break;
        }
      }
    }

    return {
      total: failedTaskIds.length,
      succeeded,
      failed,
      results
    };
  }

  /**
   * Retry all failed tasks matching filters.
   * @param {Object} [filters] - Filter options (same as list)
   * @param {Object} [options] - Retry options
   * @returns {Promise<{total: number, succeeded: number, failed: number}>}
   */
  async retryAll(filters = {}, options = {}) {
    const tasks = this.list(filters);
    const taskIds = tasks.map(t => t.id);
    
    return this.retryMany(taskIds, options);
  }

  /**
   * Archive a failed task.
   * @param {string} failedTaskId
   * @returns {boolean}
   */
  archive(failedTaskId) {
    const task = this.failedTasks.get(failedTaskId);
    if (!task) {
      return false;
    }

    task.status = FailedTaskStatus.ARCHIVED;
    task.archivedAt = Date.now();
    
    this.archivedTasks.set(failedTaskId, task);
    this.failedTasks.delete(failedTaskId);
    this.stats.totalArchived++;

    logger.info(`Task archived: ${failedTaskId}`);

    if (this.emitEvents) {
      this.emit('task:archived', task);
    }

    return true;
  }

  /**
   * Discard (permanently remove) a failed task.
   * @param {string} failedTaskId
   * @returns {boolean}
   */
  discard(failedTaskId) {
    const task = this.failedTasks.get(failedTaskId) || this.archivedTasks.get(failedTaskId);
    if (!task) {
      return false;
    }

    task.status = FailedTaskStatus.DISCARDED;
    task.discardedAt = Date.now();
    
    this.failedTasks.delete(failedTaskId);
    this.archivedTasks.delete(failedTaskId);
    this.stats.totalDiscarded++;

    logger.info(`Task discarded: ${failedTaskId}`);

    if (this.emitEvents) {
      this.emit('task:discarded', task);
    }

    return true;
  }

  /**
   * Clean up old tasks based on retention policy.
   * @param {number} [retentionDays] - Override retention period
   * @returns {number} Number of tasks cleaned up
   */
  cleanup(retentionDays) {
    const days = retentionDays ?? this.retentionDays;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    // Clean failed tasks
    for (const [id, task] of this.failedTasks) {
      if (task.failedAt < cutoff) {
        this.archive(id);
        cleaned++;
      }
    }

    // Clean archived tasks older than 2x retention
    const archiveCutoff = Date.now() - (days * 2 * 24 * 60 * 60 * 1000);
    for (const [id, task] of this.archivedTasks) {
      if (task.archivedAt < archiveCutoff) {
        this.archivedTasks.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old tasks`);
    }

    return cleaned;
  }

  /**
   * Get DLQ statistics.
   * @returns {Object}
   */
  getStats() {
    const failedTasks = Array.from(this.failedTasks.values());
    const archivedTasks = Array.from(this.archivedTasks.values());

    return {
      ...this.stats,
      currentFailed: failedTasks.length,
      currentArchived: archivedTasks.length,
      byStatus: {
        failed: failedTasks.filter(t => t.status === FailedTaskStatus.FAILED).length,
        retrying: failedTasks.filter(t => t.status === FailedTaskStatus.RETRYING).length,
        retried: failedTasks.filter(t => t.status === FailedTaskStatus.RETRIED).length,
        archived: archivedTasks.length
      },
      byQueue: this.#groupByQueue(failedTasks),
      oldestFailure: failedTasks.length > 0 
        ? new Date(Math.min(...failedTasks.map(t => t.failedAt)))
        : null
    };
  }

  /**
   * Group tasks by queue.
   * @param {FailedTask[]} tasks
   * @returns {Object}
   * @private
   */
  #groupByQueue(tasks) {
    const groups = {};
    for (const task of tasks) {
      const queue = task.queue || 'unknown';
      groups[queue] = (groups[queue] || 0) + 1;
    }
    return groups;
  }

  /**
   * Check if a task exists in DLQ.
   * @param {string} failedTaskId
   * @returns {boolean}
   */
  has(failedTaskId) {
    return this.failedTasks.has(failedTaskId) || this.archivedTasks.has(failedTaskId);
  }

  /**
   * Get count of failed tasks.
   * @returns {number}
   */
  count() {
    return this.failedTasks.size;
  }

  /**
   * Clear all failed tasks.
   * @param {boolean} [archive=false] - Archive instead of discard
   * @returns {number} Number of tasks cleared
   */
  clear(archive = false) {
    const count = this.failedTasks.size;
    
    if (archive) {
      for (const id of this.failedTasks.keys()) {
        this.archive(id);
      }
    } else {
      for (const task of this.failedTasks.values()) {
        task.status = FailedTaskStatus.DISCARDED;
        this.stats.totalDiscarded++;
      }
      this.failedTasks.clear();
    }

    logger.info(`Cleared ${count} failed tasks`);

    return count;
  }

  /**
   * Stop cleanup interval.
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export default DeadLetterQueue;
