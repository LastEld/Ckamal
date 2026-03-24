/**
 * @fileoverview Task scheduler with cron-based scheduling, one-time scheduling,
 * recurring tasks, and dependency management.
 * @module queue/scheduler
 */

import { EventEmitter } from 'events';
import cron from 'node-cron';
import { createLogger } from '../utils/logger.js';
import { Priority } from './task-queue.js';

const logger = createLogger('scheduler');

/**
 * Scheduled task status values.
 * @readonly
 * @enum {string}
 */
export const ScheduleStatus = {
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused'
};

/**
 * @typedef {Object} ScheduledTask
 * @property {string} id - Unique task identifier
 * @property {Function} execute - Task execution function
 * @property {number} priority - Task priority level
 * @property {string} type - Schedule type: 'once', 'cron', 'delay', 'dependency'
 * @property {string} [cron] - Cron expression for recurring tasks
 * @property {number} [scheduledTime] - Scheduled execution time for one-time tasks
 * @property {number} [delay] - Delay in milliseconds
 * @property {string[]} [dependencies] - IDs of tasks this task depends on
 * @property {number} [maxRetries] - Maximum retry attempts
 * @property {number} [retryDelay] - Delay between retries in milliseconds
 * @property {Object} [data] - Optional task data
 * @property {Object} [metadata] - Optional metadata
 * @property {string} status - Current schedule status
 * @property {number} createdAt - Creation timestamp
 * @property {number} [nextRun] - Next scheduled run time
 * @property {number} [runCount] - Number of times task has run
 * @property {number} [lastRun] - Last run timestamp
 * @property {Object} [cronJob] - Cron job reference
 */

/**
 * Task Scheduler with cron-based scheduling and dependency management.
 * Extends EventEmitter for schedule lifecycle events.
 * @extends EventEmitter
 */
export class Scheduler extends EventEmitter {
  /**
   * @param {Object} [options] - Scheduler options
   * @param {number} [options.defaultPriority=Priority.NORMAL] - Default task priority
   * @param {number} [options.maxRetries=3] - Default max retry attempts
   * @param {number} [options.retryDelay=1000] - Default retry delay in ms
   * @param {boolean} [options.emitEvents=true] - Whether to emit events
   */
  constructor(options = {}) {
    super();
    this.defaultPriority = options.defaultPriority ?? Priority.NORMAL;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.emitEvents = options.emitEvents !== false;
    
    /** @type {Map<string, ScheduledTask>} */
    this.scheduledTasks = new Map();
    /** @type {Map<string, Object>} */
    this.cronJobs = new Map();
    /** @type {Map<string, NodeJS.Timeout>} */
    this.timeouts = new Map();
    
    this.stats = {
      scheduled: 0,
      executed: 0,
      cancelled: 0,
      failed: 0
    };
  }

  /**
   * Generate a unique schedule ID.
   * @returns {string}
   * @private
   */
  #generateId() {
    return `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate cron expression.
   * @param {string} expression
   * @returns {boolean}
   * @private
   */
  #validateCron(expression) {
    return cron.validate(expression);
  }

  /**
   * Schedule a one-time task at a specific time.
   * @param {Object} task - Task to schedule
   * @param {string} [task.id] - Task identifier (auto-generated if not provided)
   * @param {Function} task.execute - Task execution function
   * @param {number} [task.priority] - Task priority
   * @param {Date|number} time - Scheduled execution time
   * @param {Object} [options] - Schedule options
   * @param {number} [options.maxRetries] - Maximum retry attempts
   * @param {number} [options.retryDelay] - Delay between retries
   * @param {Object} [options.data] - Task data
   * @param {Object} [options.metadata] - Task metadata
   * @returns {ScheduledTask}
   * @throws {Error} If time is in the past
   */
  schedule(task, time, options = {}) {
    const scheduledTime = time instanceof Date ? time.getTime() : time;
    const now = Date.now();

    if (scheduledTime <= now) {
      throw new Error('Scheduled time must be in the future');
    }

    const taskId = task.id || this.#generateId();
    const delay = scheduledTime - now;

    const scheduledTask = {
      id: taskId,
      execute: task.execute,
      priority: task.priority ?? this.defaultPriority,
      type: 'once',
      scheduledTime,
      maxRetries: options.maxRetries ?? this.maxRetries,
      retryDelay: options.retryDelay ?? this.retryDelay,
      data: options.data ?? null,
      metadata: {
        ...options.metadata,
        scheduledAt: now
      },
      status: ScheduleStatus.SCHEDULED,
      createdAt: now,
      nextRun: scheduledTime,
      runCount: 0
    };

    this.scheduledTasks.set(taskId, scheduledTask);

    // Set timeout for execution
    const timeout = setTimeout(() => {
      this.#executeTask(taskId);
    }, delay);
    timeout.unref?.();

    this.timeouts.set(taskId, timeout);
    this.stats.scheduled++;

    logger.info(`Task scheduled: ${taskId} at ${new Date(scheduledTime).toISOString()}`);

    if (this.emitEvents) {
      this.emit('task:scheduled', scheduledTask);
    }

    return scheduledTask;
  }

  /**
   * Schedule a recurring task with cron expression.
   * @param {Object} task - Task to schedule
   * @param {string} [task.id] - Task identifier
   * @param {Function} task.execute - Task execution function
   * @param {number} [task.priority] - Task priority
   * @param {string} cronExpression - Cron expression (e.g., '0 9 * * 1' for Mondays at 9am)
   * @param {Object} [options] - Schedule options
   * @param {boolean} [options.scheduled=true] - Whether to start immediately
   * @param {string} [options.timezone] - Timezone for scheduling
   * @param {number} [options.maxRetries] - Maximum retry attempts
   * @param {number} [options.retryDelay] - Delay between retries
   * @param {Object} [options.data] - Task data
   * @param {Object} [options.metadata] - Task metadata
   * @returns {ScheduledTask}
   * @throws {Error} If cron expression is invalid
   */
  scheduleRecurring(task, cronExpression, options = {}) {
    if (!this.#validateCron(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const taskId = task.id || this.#generateId();
    const now = Date.now();

    const scheduledTask = {
      id: taskId,
      execute: task.execute,
      priority: task.priority ?? this.defaultPriority,
      type: 'cron',
      cron: cronExpression,
      maxRetries: options.maxRetries ?? this.maxRetries,
      retryDelay: options.retryDelay ?? this.retryDelay,
      data: options.data ?? null,
      metadata: {
        ...options.metadata,
        scheduledAt: now
      },
      status: ScheduleStatus.SCHEDULED,
      createdAt: now,
      runCount: 0
    };

    this.scheduledTasks.set(taskId, scheduledTask);

    // Create cron job
    const job = cron.schedule(cronExpression, () => {
      this.#executeTask(taskId);
    }, {
      scheduled: options.scheduled !== false,
      timezone: options.timezone
    });

    this.cronJobs.set(taskId, job);
    this.stats.scheduled++;

    logger.info(`Recurring task scheduled: ${taskId} (${cronExpression})`);

    if (this.emitEvents) {
      this.emit('task:scheduled', scheduledTask);
    }

    return scheduledTask;
  }

  /**
   * Schedule a task to run after a delay.
   * @param {Object} task - Task to schedule
   * @param {string} [task.id] - Task identifier
   * @param {Function} task.execute - Task execution function
   * @param {number} [task.priority] - Task priority
   * @param {number} delay - Delay in milliseconds
   * @param {Object} [options] - Schedule options
   * @param {number} [options.maxRetries] - Maximum retry attempts
   * @param {number} [options.retryDelay] - Delay between retries
   * @param {Object} [options.data] - Task data
   * @param {Object} [options.metadata] - Task metadata
   * @returns {ScheduledTask}
   */
  scheduleAfter(task, delay, options = {}) {
    if (delay < 0) {
      throw new Error('Delay must be non-negative');
    }

    const taskId = task.id || this.#generateId();
    const now = Date.now();
    const scheduledTime = now + delay;

    const scheduledTask = {
      id: taskId,
      execute: task.execute,
      priority: task.priority ?? this.defaultPriority,
      type: 'delay',
      delay,
      scheduledTime,
      maxRetries: options.maxRetries ?? this.maxRetries,
      retryDelay: options.retryDelay ?? this.retryDelay,
      data: options.data ?? null,
      metadata: {
        ...options.metadata,
        scheduledAt: now
      },
      status: ScheduleStatus.SCHEDULED,
      createdAt: now,
      nextRun: scheduledTime,
      runCount: 0
    };

    this.scheduledTasks.set(taskId, scheduledTask);

    // Set timeout for execution
    const timeout = setTimeout(() => {
      this.#executeTask(taskId);
    }, delay);
    timeout.unref?.();

    this.timeouts.set(taskId, timeout);
    this.stats.scheduled++;

    logger.info(`Delayed task scheduled: ${taskId} (delay: ${delay}ms)`);

    if (this.emitEvents) {
      this.emit('task:scheduled', scheduledTask);
    }

    return scheduledTask;
  }

  /**
   * Schedule a task with dependencies.
   * Task will execute when all dependencies are completed.
   * @param {Object} task - Task to schedule
   * @param {string} [task.id] - Task identifier
   * @param {Function} task.execute - Task execution function
   * @param {number} [task.priority] - Task priority
   * @param {string[]} dependencies - IDs of tasks this task depends on
   * @param {Object} [options] - Schedule options
   * @param {number} [options.maxRetries] - Maximum retry attempts
   * @param {number} [options.retryDelay] - Delay between retries
   * @param {Object} [options.data] - Task data
   * @param {Object} [options.metadata] - Task metadata
   * @returns {ScheduledTask}
   */
  scheduleWithDeps(task, dependencies, options = {}) {
    if (!Array.isArray(dependencies) || dependencies.length === 0) {
      throw new Error('Dependencies must be a non-empty array');
    }

    const taskId = task.id || this.#generateId();
    const now = Date.now();

    const scheduledTask = {
      id: taskId,
      execute: task.execute,
      priority: task.priority ?? this.defaultPriority,
      type: 'dependency',
      dependencies: [...dependencies],
      maxRetries: options.maxRetries ?? this.maxRetries,
      retryDelay: options.retryDelay ?? this.retryDelay,
      data: options.data ?? null,
      metadata: {
        ...options.metadata,
        scheduledAt: now,
        waitingFor: [...dependencies]
      },
      status: ScheduleStatus.SCHEDULED,
      createdAt: now,
      runCount: 0
    };

    this.scheduledTasks.set(taskId, scheduledTask);
    this.stats.scheduled++;

    logger.info(`Dependency task scheduled: ${taskId} (depends on: ${dependencies.join(', ')})`);

    if (this.emitEvents) {
      this.emit('task:scheduled', scheduledTask);
    }

    return scheduledTask;
  }

  /**
   * Execute a scheduled task with retry logic.
   * @param {string} taskId - Task identifier
   * @private
   */
  async #executeTask(taskId) {
    const task = this.scheduledTasks.get(taskId);
    if (!task) {
      logger.warn(`Cannot execute: task ${taskId} not found`);
      return;
    }

    // Check dependencies for dependency-type tasks
    if (task.type === 'dependency') {
      const satisfied = this.#checkDependencies(task);
      if (!satisfied) {
        logger.debug(`Dependencies not satisfied for task: ${taskId}`);
        return;
      }
    }

    task.status = ScheduleStatus.RUNNING;
    task.lastRun = Date.now();
    task.runCount++;

    logger.info(`Executing scheduled task: ${taskId}`);

    if (this.emitEvents) {
      this.emit('task:executing', task);
    }

    let attempts = 0;
    let success = false;
    let lastError = null;

    while (attempts <= task.maxRetries && !success) {
      attempts++;
      try {
        await task.execute(task.data, {
          attempt: attempts,
          taskId: task.id,
          runCount: task.runCount
        });
        success = true;
      } catch (error) {
        lastError = error;
        logger.warn(`Task ${taskId} failed (attempt ${attempts}/${task.maxRetries + 1}): ${error.message}`);
        
        if (attempts <= task.maxRetries) {
          await this.#sleep(task.retryDelay);
        }
      }
    }

    if (success) {
      task.status = ScheduleStatus.COMPLETED;
      task.completedAt = Date.now();
      this.stats.executed++;

      logger.info(`Task completed: ${taskId}`);

      if (this.emitEvents) {
        this.emit('task:completed', task);
      }

      // Notify dependent tasks
      this.#notifyDependents(taskId);

      // Clean up one-time tasks
      if (task.type === 'once' || task.type === 'delay') {
        this.scheduledTasks.delete(taskId);
        this.timeouts.delete(taskId);
      }
    } else {
      task.status = ScheduleStatus.FAILED;
      task.failedAt = Date.now();
      task.lastError = lastError?.message;
      this.stats.failed++;

      logger.error(`Task failed after ${attempts} attempts: ${taskId}`);

      if (this.emitEvents) {
        this.emit('task:failed', { task, error: lastError });
      }
    }
  }

  /**
   * Check if all dependencies are satisfied.
   * @param {ScheduledTask} task
   * @returns {boolean}
   * @private
   */
  #checkDependencies(task) {
    for (const depId of task.dependencies) {
      const dep = this.scheduledTasks.get(depId);
      if (!dep || dep.status !== ScheduleStatus.COMPLETED) {
        return false;
      }
    }
    return true;
  }

  /**
   * Notify dependent tasks that a dependency has completed.
   * @param {string} completedTaskId
   * @private
   */
  #notifyDependents(completedTaskId) {
    for (const [taskId, task] of this.scheduledTasks) {
      if (task.type === 'dependency' && task.dependencies.includes(completedTaskId)) {
        // Remove from waiting list
        task.metadata.waitingFor = task.metadata.waitingFor.filter(id => id !== completedTaskId);
        
        // If all dependencies satisfied, schedule execution
        if (task.metadata.waitingFor.length === 0) {
          logger.info(`All dependencies satisfied for task: ${taskId}`);
          this.#executeTask(taskId);
        }
      }
    }
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
   * Cancel a scheduled task.
   * @param {string} taskId - Task identifier
   * @returns {boolean} True if task was found and cancelled
   */
  cancel(taskId) {
    const task = this.scheduledTasks.get(taskId);
    if (!task) {
      logger.warn(`Cannot cancel: task ${taskId} not found`);
      return false;
    }

    // Cancel timeout for one-time/delayed tasks
    const timeout = this.timeouts.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(taskId);
    }

    // Stop cron job for recurring tasks
    const cronJob = this.cronJobs.get(taskId);
    if (cronJob) {
      cronJob.stop();
      cronJob.destroy?.();
      this.cronJobs.delete(taskId);
    }

    task.status = ScheduleStatus.CANCELLED;
    task.cancelledAt = Date.now();
    this.stats.cancelled++;

    logger.info(`Task cancelled: ${taskId}`);

    if (this.emitEvents) {
      this.emit('task:cancelled', task);
    }

    return true;
  }

  /**
   * Pause a recurring task.
   * @param {string} taskId - Task identifier
   * @returns {boolean}
   */
  pause(taskId) {
    const task = this.scheduledTasks.get(taskId);
    if (!task || task.type !== 'cron') {
      return false;
    }

    const cronJob = this.cronJobs.get(taskId);
    if (cronJob) {
      cronJob.stop();
      task.status = ScheduleStatus.PAUSED;
      task.pausedAt = Date.now();

      logger.info(`Task paused: ${taskId}`);

      if (this.emitEvents) {
        this.emit('task:paused', task);
      }

      return true;
    }

    return false;
  }

  /**
   * Resume a paused recurring task.
   * @param {string} taskId - Task identifier
   * @returns {boolean}
   */
  resume(taskId) {
    const task = this.scheduledTasks.get(taskId);
    if (!task || task.type !== 'cron') {
      return false;
    }

    const cronJob = this.cronJobs.get(taskId);
    if (cronJob) {
      cronJob.start();
      task.status = ScheduleStatus.SCHEDULED;
      task.resumedAt = Date.now();

      logger.info(`Task resumed: ${taskId}`);

      if (this.emitEvents) {
        this.emit('task:resumed', task);
      }

      return true;
    }

    return false;
  }

  /**
   * List all scheduled tasks.
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.type] - Filter by type
   * @returns {ScheduledTask[]}
   */
  list(filters = {}) {
    let tasks = Array.from(this.scheduledTasks.values());

    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }

    if (filters.type) {
      tasks = tasks.filter(t => t.type === filters.type);
    }

    return tasks;
  }

  /**
   * Get a specific scheduled task.
   * @param {string} taskId
   * @returns {ScheduledTask|null}
   */
  get(taskId) {
    return this.scheduledTasks.get(taskId) || null;
  }

  /**
   * Get scheduler statistics.
   * @returns {Object}
   */
  getStats() {
    const tasks = Array.from(this.scheduledTasks.values());
    return {
      ...this.stats,
      total: tasks.length,
      byStatus: {
        scheduled: tasks.filter(t => t.status === ScheduleStatus.SCHEDULED).length,
        running: tasks.filter(t => t.status === ScheduleStatus.RUNNING).length,
        completed: tasks.filter(t => t.status === ScheduleStatus.COMPLETED).length,
        failed: tasks.filter(t => t.status === ScheduleStatus.FAILED).length,
        cancelled: tasks.filter(t => t.status === ScheduleStatus.CANCELLED).length,
        paused: tasks.filter(t => t.status === ScheduleStatus.PAUSED).length
      },
      byType: {
        once: tasks.filter(t => t.type === 'once').length,
        cron: tasks.filter(t => t.type === 'cron').length,
        delay: tasks.filter(t => t.type === 'delay').length,
        dependency: tasks.filter(t => t.type === 'dependency').length
      }
    };
  }

  /**
   * Cancel all scheduled tasks.
   * @returns {number} Number of tasks cancelled
   */
  cancelAll() {
    const count = this.scheduledTasks.size;
    
    for (const taskId of this.scheduledTasks.keys()) {
      this.cancel(taskId);
    }

    logger.info(`All tasks cancelled: ${count} tasks`);

    return count;
  }

  /**
   * Check if a task exists.
   * @param {string} taskId
   * @returns {boolean}
   */
  has(taskId) {
    return this.scheduledTasks.has(taskId);
  }

  /**
   * Stop all scheduled work and clear internal timers/jobs.
   * This is intended for shutdown and test cleanup.
   * @returns {number} Number of scheduled tasks cleared
   */
  stop() {
    const count = this.scheduledTasks.size;

    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();

    for (const cronJob of this.cronJobs.values()) {
      cronJob.stop();
      cronJob.destroy?.();
    }
    this.cronJobs.clear();

    this.scheduledTasks.clear();

    logger.info(`Scheduler stopped: ${count} tasks cleared`);
    return count;
  }
}

export default Scheduler;
