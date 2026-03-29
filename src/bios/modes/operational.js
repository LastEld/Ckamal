/**
 * @fileoverview Operational Mode Handler for CogniMesh BIOS
 * @module bios/modes/operational
 * @description Full system functionality for normal operations
 * @version 5.0.0
 */

import { EventEmitter } from 'events';

/**
 * Operational state types
 * @readonly
 * @enum {string}
 */
export const OperationalState = {
  IDLE: 'IDLE',
  PROCESSING: 'PROCESSING',
  SYNCING: 'SYNCING',
  EXECUTING: 'EXECUTING'
};

/**
 * Task queue priority levels
 * @readonly
 * @enum {number}
 */
export const TaskPriority = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3
};

/**
 * Operational Mode - Full system functionality
 * @class
 * @extends EventEmitter
 * @description Handles normal BIOS operations, task execution, and agent orchestration
 */
export class OperationalMode extends EventEmitter {
  /**
   * Creates a new OperationalMode handler
   * @constructor
   * @param {CogniMeshBIOS} bios - BIOS instance reference
   */
  constructor(bios) {
    super();
    
    /**
     * BIOS instance reference
     * @type {CogniMeshBIOS}
     * @private
     */
    this._bios = bios;
    
    /**
     * Current operational state
     * @type {OperationalState}
     * @private
     */
    this._state = OperationalState.IDLE;
    
    /**
     * Task queue
     * @type {Array<{id: string, priority: number, task: Object, resolve: Function, reject: Function}>}
     * @private
     */
    this._taskQueue = [];
    
    /**
     * Active tasks
     * @type {Map<string, Object>}
     * @private
     */
    this._activeTasks = new Map();
    
    /**
     * Task execution limit (concurrent)
     * @type {number}
     * @private
     */
    this._concurrencyLimit = 5;
    
    /**
     * Mode active flag
     * @type {boolean}
     * @private
     */
    this._active = false;
    
    /**
     * Task processor interval
     * @type {Timer|null}
     * @private
     */
    this._processorInterval = null;
    
    /**
     * Statistics tracking
     * @type {Object}
     * @private
     */
    this._stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksQueued: 0,
      startTime: null
    };
    
    /**
     * Scheduled jobs
     * @type {Map<string, Object>}
     * @private
     */
    this._scheduledJobs = new Map();
  }

  /**
   * Get current operational state
   * @returns {OperationalState}
   */
  get state() {
    return this._state;
  }

  /**
   * Check if mode is active
   * @returns {boolean}
   */
  get isActive() {
    return this._active;
  }

  /**
   * Enter operational mode
   * @async
   * @param {Object} [options={}] - Entry options
   * @returns {Promise<void>}
   */
  async enter(_options = {}) {
    if (this._active) {
      return;
    }
    
    this._active = true;
    this._stats.startTime = Date.now();
    this._state = OperationalState.IDLE;
    
    // Start task processor
    this._startTaskProcessor();
    
    // Initialize scheduled jobs if auto-update enabled
    if (this._bios._config?.autoUpdate) {
      this._initializeScheduledJobs();
    }
    
    this._bios.emit('bios:operational:entered');
    this.emit('operational:ready');
  }

  /**
   * Exit operational mode
   * @async
   * @param {Object} [options={}] - Exit options
   * @returns {Promise<void>}
   */
  async exit(options = {}) {
    if (!this._active) {
      return;
    }
    
    this._active = false;
    
    // Stop task processor
    if (this._processorInterval) {
      clearInterval(this._processorInterval);
      this._processorInterval = null;
    }
    
    // Wait for active tasks to complete (unless forced)
    if (!options.force && this._activeTasks.size > 0) {
      await this._waitForActiveTasks(options.timeout || 30000);
    }
    
    // Cancel pending tasks
    for (const queued of this._taskQueue) {
      queued.reject(new Error('Operational mode shutting down'));
    }
    this._taskQueue = [];
    
    // Clear scheduled jobs
    this._scheduledJobs.clear();
    
    this._state = OperationalState.IDLE;
    this._bios.emit('bios:operational:exited');
  }

  /**
   * Start the task processor
   * @private
   */
  _startTaskProcessor() {
    // Process tasks every 100ms
    this._processorInterval = setInterval(() => {
      this._processTasks();
    }, 100);

    if (typeof this._processorInterval.unref === 'function') {
      this._processorInterval.unref();
    }
  }

  /**
   * Process queued tasks
   * @private
   * @async
   */
  async _processTasks() {
    if (!this._active || this._state !== OperationalState.IDLE) {
      return;
    }
    
    while (
      this._activeTasks.size < this._concurrencyLimit &&
      this._taskQueue.length > 0
    ) {
      // Get highest priority task
      this._taskQueue.sort((a, b) => a.priority - b.priority);
      const next = this._taskQueue.shift();
      
      if (next) {
        this._executeTask(next);
      }
    }
  }

  /**
   * Execute a single task
   * @private
   * @async
   * @param {Object} queuedTask - Queued task entry
   */
  async _executeTask(queuedTask) {
    const { id, task, resolve, reject } = queuedTask;
    
    this._state = OperationalState.PROCESSING;
    this._activeTasks.set(id, {
      id,
      task,
      startTime: Date.now(),
      status: 'running'
    });
    
    this._bios.emit('bios:task:started', { id, type: task.type });
    
    try {
      const result = await this._performTask(task);
      
      this._activeTasks.delete(id);
      this._stats.tasksCompleted++;
      
      this._bios.emit('bios:task:completed', { id, duration: Date.now() - queuedTask.startTime });
      resolve(result);
      
    } catch (error) {
      this._activeTasks.delete(id);
      this._stats.tasksFailed++;
      
      this._bios.emit('bios:task:failed', { id, error: error.message });
      reject(error);
      
    } finally {
      if (this._activeTasks.size === 0) {
        this._state = OperationalState.IDLE;
      }
    }
  }

  /**
   * Perform the actual task execution
   * @private
   * @async
   * @param {Object} task - Task definition
   * @returns {Promise<any>} Task result
   */
  async _performTask(task) {
    switch (task.type) {
      case 'github:sync':
        return this._performGitHubSync(task);
      
      case 'agent:dispatch':
        return this._dispatchAgent(task);
      
      case 'diagnostic:run':
        return this._bios.diagnose();
      
      case 'config:reload':
        return this._reloadConfiguration();
      
      case 'custom':
        if (task.handler && typeof task.handler === 'function') {
          return task.handler(task.data);
        }
        throw new Error('Custom task missing handler');
      
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  /**
   * Perform GitHub synchronization
   * @private
   * @async
   * @param {Object} task - Sync task
   * @returns {Promise<Object>} Sync results
   */
  async _performGitHubSync(task) {
    this._state = OperationalState.SYNCING;
    
    // Placeholder for GitHub sync logic
    // Would use Octokit to sync with repositories
    
    return {
      synced: true,
      repositories: task.repositories || [],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Dispatch an agent/sub-agent
   * @private
   * @async
   * @param {Object} task - Dispatch task
   * @returns {Promise<Object>} Dispatch result
   */
  async _dispatchAgent(task) {
    this._state = OperationalState.EXECUTING;
    
    // Placeholder for agent dispatch logic
    // Would coordinate with sub-agents for multi-client orchestration
    
    return {
      dispatched: true,
      agent: task.agent,
      target: task.target,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reload BIOS configuration
   * @private
   * @async
   * @returns {Promise<Object>} New configuration
   */
  async _reloadConfiguration() {
    // Reload from environment
    return {
      mode: process.env.BIOS_MODE || 'OPERATIONAL',
      autoUpdate: process.env.AUTO_UPDATE === 'true',
      regressionThreshold: parseFloat(process.env.REGRESSION_THRESHOLD) || 5.0
    };
  }

  /**
   * Wait for active tasks to complete
   * @private
   * @async
   * @param {number} timeout - Maximum wait time in ms
   * @returns {Promise<void>}
   */
  async _waitForActiveTasks(timeout) {
    const startTime = Date.now();
    
    while (this._activeTasks.size > 0) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for active tasks');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Queue a task for execution
   * @async
   * @param {Object} task - Task definition
   * @param {string} task.type - Task type
   * @param {TaskPriority} [priority=TaskPriority.NORMAL] - Task priority
   * @returns {Promise<any>} Task result
   */
  async queueTask(task, priority = TaskPriority.NORMAL) {
    return new Promise((resolve, reject) => {
      const id = `task:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      
      this._taskQueue.push({
        id,
        priority,
        task,
        resolve,
        reject,
        startTime: Date.now()
      });
      
      this._stats.tasksQueued++;
      this._bios.emit('bios:task:queued', { id, type: task.type, priority });
    });
  }

  /**
   * Schedule a recurring job
   * @param {string} id - Job identifier
   * @param {string} cronExpression - Cron schedule expression
   * @param {Function} job - Job function to execute
   * @returns {boolean} True if scheduled
   */
  scheduleJob(id, cronExpression, job) {
    if (this._scheduledJobs.has(id)) {
      return false;
    }
    
    // Store job configuration (actual cron scheduling would use node-cron)
    this._scheduledJobs.set(id, {
      id,
      cron: cronExpression,
      job,
      scheduledAt: Date.now()
    });
    
    this._bios.emit('bios:job:scheduled', { id, cron: cronExpression });
    return true;
  }

  /**
   * Initialize scheduled jobs from configuration
   * @private
   */
  _initializeScheduledJobs() {
    // Auto-diagnostics every hour
    this.scheduleJob('auto-diagnostic', '0 * * * *', async () => {
      await this.queueTask({ type: 'diagnostic:run' }, TaskPriority.HIGH);
    });
    
    // Config reload every 5 minutes
    this.scheduleJob('config-reload', '*/5 * * * *', async () => {
      await this.queueTask({ type: 'config:reload' }, TaskPriority.NORMAL);
    });
  }

  /**
   * Cancel a scheduled job
   * @param {string} id - Job identifier
   * @returns {boolean} True if cancelled
   */
  cancelJob(id) {
    const removed = this._scheduledJobs.delete(id);
    if (removed) {
      this._bios.emit('bios:job:cancelled', { id });
    }
    return removed;
  }

  /**
   * Get operational status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      state: this._state,
      active: this._active,
      queueLength: this._taskQueue.length,
      activeTasks: Array.from(this._activeTasks.keys()),
      stats: { ...this._stats },
      uptime: this._stats.startTime ? Date.now() - this._stats.startTime : 0,
      scheduledJobs: Array.from(this._scheduledJobs.keys())
    };
  }

  /**
   * Get operational statistics
   * @returns {Object} Operational statistics
   */
  getStats() {
    return {
      ...this._stats,
      currentQueue: this._taskQueue.length,
      activeTasks: this._activeTasks.size,
      state: this._state
    };
  }
}

export default OperationalMode;
