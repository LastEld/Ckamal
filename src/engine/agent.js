/**
 * @fileoverview Agent Base Class - Core agent implementation for GSD (Get Stuff Done) system
 * @module gsd/agent
 */

import { EventEmitter } from 'events';

/**
 * Agent status states
 * @readonly
 * @enum {string}
 */
export const AgentStatus = {
  IDLE: 'idle',
  BUSY: 'busy',
  ERROR: 'error',
  TERMINATING: 'terminating',
  TERMINATED: 'terminated'
};

/**
 * Generate unique agent ID
 * @returns {string} Unique identifier
 */
function generateId() {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Agent base class - Foundation for all CogniMesh agents
 * @extends EventEmitter
 */
export class Agent extends EventEmitter {
  /**
   * Create a new Agent
   * @param {Object} config - Agent configuration
   * @param {string} [config.id] - Agent identifier (auto-generated if not provided)
   * @param {string} config.name - Agent name
   * @param {string} [config.type='worker'] - Agent type
   * @param {Array<string>} [config.capabilities=[]] - Agent capabilities
   * @param {Object} [config.config] - Additional configuration options
   * @param {number} [config.maxErrors=3] - Maximum errors before failure
   */
  constructor(config = {}) {
    super();

    // Support both signature: new Agent(agentId, type, options) and new Agent(config)
    if (typeof config === 'string') {
      // Called as: new Agent(agentId, type, options)
      const agentId = config;
      const type = arguments[1] || 'worker';
      const options = arguments[2] || {};
      
      this.id = agentId;
      this.name = options.name || agentId;
      this.type = type;
      this.capabilities = options.config ? Object.keys(options.config) : [];
      this.maxErrors = options.maxErrors || 3;
      this._rawConfig = options.config || {};
    } else {
      // Called as: new Agent(config)
      this.id = config.id || generateId();
      this.name = config.name || this.id;
      this.type = config.type || 'worker';
      this.capabilities = config.capabilities || [];
      this.maxErrors = config.maxErrors || 3;
      this._rawConfig = config.config || {};
    }

    this.status = AgentStatus.IDLE;
    this.currentTask = null;
    this.stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      errors: 0
    };
    this.createdAt = new Date();
    this.lastHeartbeat = Date.now();
    this.context = {};
    this._terminated = false;
    this._terminating = false;
    this._retryCount = 0;
    this._healthCheckFailures = 0;
  }

  /**
   * Initialize the agent
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize() {
    if (this._terminated) {
      throw new Error('Cannot initialize terminated agent');
    }

    this.emit('initializing', { agentId: this.id });

    try {
      // Perform initialization logic
      await this._performInitialization();
      
      this.status = AgentStatus.IDLE;
      this.emit('initialized', { agentId: this.id, success: true });
      return true;
    } catch (error) {
      this.status = AgentStatus.ERROR;
      this.emit('initialized', { agentId: this.id, success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Perform actual initialization (override in subclasses)
   * @protected
   * @returns {Promise<void>}
   */
  async _performInitialization() {
    // Base implementation - subclasses should override
    await Promise.resolve();
  }

  /**
   * Execute a task
   * @param {Object} task - Task to execute
   * @param {string} task.id - Task identifier
   * @param {string} task.type - Task type
   * @param {Object} [task.payload] - Task data
   * @returns {Promise<any>} Task result
   */
  async execute(task) {
    if (this._terminated || this._terminating) {
      throw new Error('Cannot execute task: agent is terminated');
    }

    if (this.status === AgentStatus.BUSY) {
      throw new Error('Agent is already executing a task');
    }

    if (!task || !task.id) {
      throw new Error('Task must have an id');
    }

    this.status = AgentStatus.BUSY;
    this.currentTask = task;
    this._retryCount = 0;

    this.emit('taskStarted', { 
      agentId: this.id, 
      taskId: task.id, 
      taskType: task.type 
    });

    try {
      const result = await this._performExecution(task);
      
      this.stats.tasksCompleted++;
      this.status = AgentStatus.IDLE;
      this.currentTask = null;
      this._retryCount = 0;

      this.emit('taskCompleted', { 
        agentId: this.id, 
        taskId: task.id, 
        result 
      });

      return result;
    } catch (error) {
      this.stats.tasksFailed++;
      this.stats.errors++;
      this.status = AgentStatus.ERROR;
      this.currentTask = null;

      this.emit('taskFailed', { 
        agentId: this.id, 
        taskId: task.id, 
        error: error.message,
        errorCount: this.stats.errors
      });

      // Trigger error recovery if needed
      if (this.stats.errors >= this.maxErrors) {
        this.emit('errorRecovery', { 
          agentId: this.id, 
          error: error.message,
          errorCount: this.stats.errors
        });
      }

      throw error;
    }
  }

  /**
   * Compatibility wrapper for orchestration layers that call executeTask().
   * @param {Object} task - Task to execute
   * @returns {Promise<any>} Task result
   */
  async executeTask(task) {
    const normalizedTask = {
      ...task,
      payload: task.payload ?? task.data
    };

    if (!normalizedTask.id) {
      normalizedTask.id = generateId();
    }

    return this.execute(normalizedTask);
  }

  /**
   * Perform actual task execution (override in subclasses)
   * @protected
   * @param {Object} task - Task to execute
   * @returns {Promise<any>}
   */
  async _performExecution(task) {
    const executor = this._rawConfig?.executor;
    if (typeof executor === 'function') {
      return executor(task, {
        agent: this,
        agentId: this.id,
        context: this.context
      });
    }

    // Base implementation - subclasses should override
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 10));
    return { taskId: task.id, status: 'completed' };
  }

  /**
   * Update heartbeat timestamp
   */
  heartbeat() {
    this.lastHeartbeat = Date.now();
    this._healthCheckFailures = 0;
    this.emit('heartbeat', { agentId: this.id, timestamp: this.lastHeartbeat });
  }

  /**
   * Gracefully terminate the agent
   * @returns {Promise<boolean>} True if terminated successfully
   */
  async terminate() {
    if (this._terminated) {
      return true;
    }

    if (this._terminating) {
      // Already terminating, wait for it
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this._terminated) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);
      });
    }

    this._terminating = true;
    this.status = AgentStatus.TERMINATING;

    this.emit('terminating', { agentId: this.id });

    try {
      // Allow current task to complete if any
      if (this.currentTask) {
        await this._waitForCurrentTask(5000);
      }

      // Perform cleanup
      await this._performCleanup();

      this._terminated = true;
      this._terminating = false;
      this.status = AgentStatus.TERMINATED;

      this.emit('terminated', { agentId: this.id, graceful: true });

      return true;
    } catch (error) {
      this.status = AgentStatus.ERROR;
      this.emit('terminationFailed', { agentId: this.id, error: error.message });
      throw error;
    }
  }

  /**
   * Force terminate the agent immediately
   * @returns {boolean} True if terminated
   */
  forceTerminate() {
    if (this._terminated) {
      return true;
    }

    this._terminating = false;
    this._terminated = true;
    this.status = AgentStatus.TERMINATED;
    this.currentTask = null;

    // Perform immediate cleanup (synchronous)
    this._performForceCleanup();

    this.emit('terminated', { agentId: this.id, graceful: false, forced: true });

    return true;
  }

  /**
   * Wait for current task to complete
   * @private
   * @param {number} timeout - Maximum wait time in ms
   * @returns {Promise<void>}
   */
  async _waitForCurrentTask(timeout) {
    if (!this.currentTask) {
      return;
    }

    const startTime = Date.now();
    while (this.currentTask && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Perform cleanup during graceful termination (override in subclasses)
   * @protected
   * @returns {Promise<void>}
   */
  async _performCleanup() {
    // Base implementation - subclasses should override
    await Promise.resolve();
  }

  /**
   * Perform immediate cleanup during force termination (override in subclasses)
   * @protected
   */
  _performForceCleanup() {
    // Base implementation - subclasses should override
  }

  /**
   * Retry a task with exponential backoff
   * @param {Object} task - Task to retry
   * @param {number} [maxRetries=3] - Maximum retry attempts
   * @returns {Promise<any>} Task result
   */
  async retry(task, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 1000ms, 2000ms, 4000ms, etc.
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          this.emit('retrying', { 
            agentId: this.id, 
            taskId: task.id, 
            attempt,
            maxRetries,
            delay 
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        this._retryCount = attempt;
        return await this.execute(task);
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error.message?.includes('terminated') || error.message?.includes('cancelled')) {
          throw error;
        }
      }
    }

    throw new Error(`Task failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Recover from error state
   * @returns {Promise<boolean>} True if recovery successful
   */
  async recover() {
    if (this._terminated) {
      throw new Error('Cannot recover terminated agent');
    }

    if (this.status !== AgentStatus.ERROR) {
      return true; // Nothing to recover
    }

    this.emit('recovering', { agentId: this.id, errors: this.stats.errors });

    try {
      // Perform recovery logic
      await this._performRecovery();

      // Reset error state
      this.stats.errors = 0;
      this._healthCheckFailures = 0;
      this.status = AgentStatus.IDLE;

      this.emit('recovered', { agentId: this.id, success: true });

      return true;
    } catch (error) {
      this.emit('recovered', { agentId: this.id, success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Perform actual recovery (override in subclasses)
   * @protected
   * @returns {Promise<void>}
   */
  async _performRecovery() {
    // Base implementation - subclasses should override
    await Promise.resolve();
  }

  /**
   * Get current agent status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      capabilities: [...this.capabilities],
      currentTask: this.currentTask ? { id: this.currentTask.id, type: this.currentTask.type } : null,
      stats: { ...this.stats },
      createdAt: this.createdAt,
      lastHeartbeat: this.lastHeartbeat,
      uptime: Date.now() - this.createdAt.getTime(),
      isTerminated: this._terminated,
      isTerminating: this._terminating,
      retryCount: this._retryCount
    };
  }

  /**
   * Check if agent is available for task execution
   * @returns {boolean} True if available
   */
  isAvailable() {
    return (
      this.status === AgentStatus.IDLE &&
      !this._terminated &&
      !this._terminating &&
      this.stats.errors < this.maxErrors
    );
  }

  /**
   * Check if agent is healthy
   * @returns {boolean} True if healthy
   */
  isHealthy() {
    const heartbeatTimeout = 60000; // 60 seconds
    const heartbeatFresh = Date.now() - this.lastHeartbeat < heartbeatTimeout;
    const noErrors = this.stats.errors < this.maxErrors;
    const notTerminated = !this._terminated;

    const healthy = heartbeatFresh && noErrors && notTerminated;

    if (!healthy && this._healthCheckFailures < 3) {
      this._healthCheckFailures++;
    }

    return healthy;
  }

  /**
   * Get agent info (lightweight status)
   * @returns {Object} Agent info
   */
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      available: this.isAvailable(),
      healthy: this.isHealthy()
    };
  }
}

export default Agent;
