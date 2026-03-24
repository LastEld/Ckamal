/**
 * @fileoverview Agent Scheduler - Task scheduling with priority queues and load distribution
 * @module agents/scheduler
 */

import { EventEmitter } from 'events';

/**
 * Scheduling strategies
 * @readonly
 * @enum {string}
 */
export const SchedulingStrategy = {
  ROUND_ROBIN: 'ROUND_ROBIN',
  PRIORITY: 'PRIORITY',
  LOAD_BASED: 'LOAD_BASED',
  CAPABILITY_BASED: 'CAPABILITY_BASED',
  FIFO: 'FIFO'
};

/**
 * Task priority levels
 * @readonly
 * @enum {number}
 */
export const TaskPriority = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
  BACKGROUND: 4
};

/**
 * Task states
 * @readonly
 * @enum {string}
 */
export const TaskState = {
  PENDING: 'PENDING',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMEOUT: 'TIMEOUT'
};

/**
 * Agent Scheduler for task distribution and scheduling
 * @extends EventEmitter
 */
export class AgentScheduler extends EventEmitter {
  /**
   * Create a new AgentScheduler
   * @param {Object} [options] - Scheduler options
   * @param {string} [options.strategy=ROUND_ROBIN] - Default scheduling strategy
   * @param {number} [options.maxQueueSize=1000] - Maximum queue size
   * @param {number} [options.defaultTimeout=30000] - Default task timeout in ms
   * @param {boolean} [options.enableMetrics=true] - Enable metrics collection
   */
  constructor(options = {}) {
    super();

    this.strategy = options.strategy || SchedulingStrategy.ROUND_ROBIN;
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.enableMetrics = options.enableMetrics !== false;

    // Task queues by priority (0 = highest priority)
    /** @type {Map<number, Array<ScheduledTask>>} */
    this.queues = new Map();
    
    // Initialize priority queues
    Object.values(TaskPriority).forEach(priority => {
      this.queues.set(priority, []);
    });

    // Registered agents
    /** @type {Map<string, RegisteredAgent>} */
    this.agents = new Map();

    // Active tasks
    /** @type {Map<string, ScheduledTask>} */
    this.activeTasks = new Map();

    // Completed tasks (limited history)
    /** @type {Array<ScheduledTask>} */
    this.completedTasks = [];
    this.maxCompletedHistory = 100;

    // Round-robin index
    this.roundRobinIndex = 0;

    // Metrics
    this.metrics = {
      tasksSubmitted: 0,
      tasksScheduled: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksCancelled: 0,
      tasksTimeout: 0,
      totalWaitTime: 0,
      totalExecutionTime: 0
    };

    /** @type {ReturnType<setInterval>|null} */
    this.processingTimer = null;

    /** @type {boolean} */
    this.isRunning = false;
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this._startProcessing();

    this.emit('started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    this.emit('stopped');
  }

  /**
   * Register an agent with the scheduler
   * @param {Object} agent - Agent to register
   * @param {Object} [options] - Registration options
   * @param {number} [options.weight=1] - Agent weight for weighted scheduling
   * @param {string[]} [options.capabilities=[]] - Agent capabilities
   * @param {number} [options.maxConcurrent=1] - Maximum concurrent tasks
   * @returns {RegisteredAgent} Registered agent
   */
  registerAgent(agent, options = {}) {
    const registeredAgent = {
      id: agent.id,
      agent,
      weight: options.weight || 1,
      capabilities: options.capabilities || [],
      maxConcurrent: options.maxConcurrent || 1,
      currentLoad: 0,
      totalTasks: 0,
      registeredAt: Date.now()
    };

    this.agents.set(agent.id, registeredAgent);

    this.emit('agentRegistered', { agentId: agent.id });

    return registeredAgent;
  }

  /**
   * Unregister an agent
   * @param {string} agentId - Agent ID
   * @returns {boolean} True if unregistered
   */
  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    // Cancel any pending tasks assigned to this agent
    this._reassignAgentTasks(agentId);

    this.agents.delete(agentId);

    this.emit('agentUnregistered', { agentId });

    return true;
  }

  /**
   * Submit a task for scheduling
   * @param {Object} task - Task to schedule
   * @param {string} task.id - Task ID
   * @param {string} task.type - Task type
   * @param {*} [task.payload] - Task payload
   * @param {Object} [options] - Scheduling options
   * @param {number} [options.priority=TaskPriority.NORMAL] - Task priority
   * @param {string} [options.strategy] - Scheduling strategy override
   * @param {number} [options.timeout] - Task timeout
   * @param {string} [options.requiredCapability] - Required capability
   * @param {string} [options.preferredAgent] - Preferred agent ID
   * @returns {ScheduledTask} Scheduled task
   * @emits AgentScheduler#taskSubmitted
   */
  submit(task, options = {}) {
    if (!task.id) {
      throw new Error('Task must have an id');
    }

    if (this._getTotalQueueSize() >= this.maxQueueSize) {
      throw new Error('Queue is full');
    }

    const priority = options.priority ?? TaskPriority.NORMAL;
    const scheduledTask = {
      id: task.id,
      type: task.type,
      payload: task.payload,
      priority,
      strategy: options.strategy || this.strategy,
      timeout: options.timeout || this.defaultTimeout,
      requiredCapability: options.requiredCapability,
      preferredAgent: options.preferredAgent,
      state: TaskState.PENDING,
      submittedAt: Date.now(),
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      assignedAgent: null,
      result: null,
      error: null
    };

    // Add to appropriate priority queue
    const queue = this.queues.get(priority);
    queue.push(scheduledTask);

    this.metrics.tasksSubmitted++;

    this.emit('taskSubmitted', { 
      taskId: task.id, 
      priority,
      queueDepth: this._getTotalQueueSize()
    });

    // Try to schedule immediately if possible
    this._processQueues();

    return scheduledTask;
  }

  /**
   * Cancel a pending or scheduled task
   * @param {string} taskId - Task ID
   * @param {string} [reason] - Cancellation reason
   * @returns {boolean} True if cancelled
   * @emits AgentScheduler#taskCancelled
   */
  cancel(taskId, reason = 'cancelled') {
    // Check active tasks
    if (this.activeTasks.has(taskId)) {
      // Cannot cancel active tasks
      return false;
    }

    // Check queues
    for (const [priority, queue] of this.queues) {
      const index = queue.findIndex(t => t.id === taskId);
      if (index !== -1) {
        const task = queue.splice(index, 1)[0];
        task.state = TaskState.CANCELLED;
        task.error = reason;
        task.completedAt = Date.now();

        this.metrics.tasksCancelled++;
        this._addToCompletedHistory(task);

        this.emit('taskCancelled', { taskId, reason });

        return true;
      }
    }

    return false;
  }

  /**
   * Mark a task as started
   * @param {string} taskId - Task ID
   * @param {string} agentId - Agent ID
   */
  markTaskStarted(taskId, agentId) {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return;
    }

    task.state = TaskState.RUNNING;
    task.startedAt = Date.now();
    task.assignedAgent = agentId;

    // Update agent load
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentLoad++;
    }

    // Calculate wait time
    const waitTime = task.startedAt - task.submittedAt;
    this.metrics.totalWaitTime += waitTime;

    this.emit('taskStarted', { taskId, agentId, waitTime });
  }

  /**
   * Mark a task as completed
   * @param {string} taskId - Task ID
   * @param {*} result - Task result
   */
  markTaskCompleted(taskId, result) {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return;
    }

    task.state = TaskState.COMPLETED;
    task.completedAt = Date.now();
    task.result = result;

    // Update metrics
    this.metrics.tasksCompleted++;
    this.metrics.totalExecutionTime += task.completedAt - (task.startedAt || task.scheduledAt);

    // Update agent load
    if (task.assignedAgent) {
      const agent = this.agents.get(task.assignedAgent);
      if (agent) {
        agent.currentLoad = Math.max(0, agent.currentLoad - 1);
        agent.totalTasks++;
      }
    }

    this.activeTasks.delete(taskId);
    this._addToCompletedHistory(task);

    this.emit('taskCompleted', { taskId, result, executionTime: task.completedAt - task.startedAt });

    // Process more tasks
    this._processQueues();
  }

  /**
   * Mark a task as failed
   * @param {string} taskId - Task ID
   * @param {Error} error - Error
   */
  markTaskFailed(taskId, error) {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return;
    }

    task.state = TaskState.FAILED;
    task.completedAt = Date.now();
    task.error = error.message || error;

    // Update metrics
    this.metrics.tasksFailed++;

    // Update agent load
    if (task.assignedAgent) {
      const agent = this.agents.get(task.assignedAgent);
      if (agent) {
        agent.currentLoad = Math.max(0, agent.currentLoad - 1);
      }
    }

    this.activeTasks.delete(taskId);
    this._addToCompletedHistory(task);

    this.emit('taskFailed', { taskId, error: error.message || error });

    // Process more tasks
    this._processQueues();
  }

  /**
   * Mark a task as timed out
   * @param {string} taskId - Task ID
   */
  markTaskTimeout(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return;
    }

    task.state = TaskState.TIMEOUT;
    task.completedAt = Date.now();
    task.error = 'Task timed out';

    // Update metrics
    this.metrics.tasksTimeout++;

    // Update agent load
    if (task.assignedAgent) {
      const agent = this.agents.get(task.assignedAgent);
      if (agent) {
        agent.currentLoad = Math.max(0, agent.currentLoad - 1);
      }
    }

    this.activeTasks.delete(taskId);
    this._addToCompletedHistory(task);

    this.emit('taskTimeout', { taskId });

    // Process more tasks
    this._processQueues();
  }

  /**
   * Get scheduler statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const queueDepths = {};
    for (const [priority, queue] of this.queues) {
      queueDepths[TaskPriority[priority] || priority] = queue.length;
    }

    return {
      isRunning: this.isRunning,
      strategy: this.strategy,
      totalQueueDepth: this._getTotalQueueSize(),
      queueDepths,
      activeTasks: this.activeTasks.size,
      registeredAgents: this.agents.size,
      metrics: { ...this.metrics },
      averageWaitTime: this.metrics.tasksCompleted > 0 
        ? this.metrics.totalWaitTime / this.metrics.tasksCompleted 
        : 0,
      averageExecutionTime: this.metrics.tasksCompleted > 0 
        ? this.metrics.totalExecutionTime / this.metrics.tasksCompleted 
        : 0
    };
  }

  /**
   * Get task by ID
   * @param {string} taskId - Task ID
   * @returns {ScheduledTask|null} Task or null if not found
   */
  getTask(taskId) {
    // Check active tasks
    if (this.activeTasks.has(taskId)) {
      return this.activeTasks.get(taskId);
    }

    // Check queues
    for (const queue of this.queues.values()) {
      const task = queue.find(t => t.id === taskId);
      if (task) {
        return task;
      }
    }

    // Check completed tasks
    return this.completedTasks.find(t => t.id === taskId) || null;
  }

  /**
   * Get all pending tasks
   * @returns {Array<ScheduledTask>} Pending tasks
   */
  getPendingTasks() {
    const pending = [];
    for (const queue of this.queues.values()) {
      pending.push(...queue);
    }
    return pending;
  }

  /**
   * Get active tasks
   * @returns {Array<ScheduledTask>} Active tasks
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Set scheduling strategy
   * @param {string} strategy - New strategy
   */
  setStrategy(strategy) {
    if (!Object.values(SchedulingStrategy).includes(strategy)) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    this.strategy = strategy;
  }

  /**
   * Start queue processing timer
   * @private
   */
  _startProcessing() {
    if (this.processingTimer) {
      return;
    }

    this.processingTimer = setInterval(() => {
      this._processQueues();
    }, 100);
  }

  /**
   * Process task queues
   * @private
   */
  _processQueues() {
    if (!this.isRunning) {
      return;
    }

    // Get available agents
    const availableAgents = this._getAvailableAgents();
    if (availableAgents.length === 0) {
      return;
    }

    // Process queues by priority
    for (const priority of Array.from(this.queues.keys()).sort((a, b) => a - b)) {
      const queue = this.queues.get(priority);

      while (queue.length > 0 && availableAgents.length > 0) {
        const task = queue[0];
        
        // Select agent based on strategy
        const agent = this._selectAgent(task, availableAgents);
        
        if (!agent) {
          // No suitable agent for this task, try next task
          break;
        }

        // Remove task from queue
        queue.shift();

        // Schedule task
        this._scheduleTask(task, agent);

        // Update available agents list
        const index = availableAgents.findIndex(a => a.id === agent.id);
        if (index !== -1) {
          availableAgents.splice(index, 1);
        }
      }
    }
  }

  /**
   * Get available agents
   * @private
   * @returns {Array<RegisteredAgent>} Available agents
   */
  _getAvailableAgents() {
    return Array.from(this.agents.values()).filter(agent => 
      agent.currentLoad < agent.maxConcurrent
    );
  }

  /**
   * Select an agent for a task
   * @private
   * @param {ScheduledTask} task - Task to schedule
   * @param {Array<RegisteredAgent>} availableAgents - Available agents
   * @returns {RegisteredAgent|null} Selected agent or null
   */
  _selectAgent(task, availableAgents) {
    const strategy = task.strategy || this.strategy;

    // Filter by required capability if specified
    let candidates = availableAgents;
    if (task.requiredCapability) {
      candidates = availableAgents.filter(agent => 
        agent.capabilities.includes(task.requiredCapability)
      );
    }

    // Check preferred agent
    if (task.preferredAgent) {
      const preferred = candidates.find(a => a.id === task.preferredAgent);
      if (preferred) {
        return preferred;
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    switch (strategy) {
      case SchedulingStrategy.ROUND_ROBIN:
        return this._roundRobinSelect(candidates);
      
      case SchedulingStrategy.LOAD_BASED:
        return this._loadBasedSelect(candidates);
      
      case SchedulingStrategy.CAPABILITY_BASED:
        return this._capabilityBasedSelect(task, candidates);
      
      case SchedulingStrategy.FIFO:
      case SchedulingStrategy.PRIORITY:
      default:
        return candidates[0];
    }
  }

  /**
   * Round-robin agent selection
   * @private
   * @param {Array<RegisteredAgent>} candidates - Candidate agents
   * @returns {RegisteredAgent} Selected agent
   */
  _roundRobinSelect(candidates) {
    const agent = candidates[this.roundRobinIndex % candidates.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % candidates.length;
    return agent;
  }

  /**
   * Load-based agent selection (least loaded)
   * @private
   * @param {Array<RegisteredAgent>} candidates - Candidate agents
   * @returns {RegisteredAgent} Selected agent
   */
  _loadBasedSelect(candidates) {
    return candidates.reduce((min, agent) => {
      const minLoad = min.currentLoad / min.maxConcurrent;
      const agentLoad = agent.currentLoad / agent.maxConcurrent;
      return agentLoad < minLoad ? agent : min;
    });
  }

  /**
   * Capability-based agent selection (most matching capabilities)
   * @private
   * @param {ScheduledTask} task - Task to schedule
   * @param {Array<RegisteredAgent>} candidates - Candidate agents
   * @returns {RegisteredAgent} Selected agent
   */
  _capabilityBasedSelect(task, candidates) {
    // For now, just return the first one
    // In a more sophisticated implementation, we'd score agents by capability match
    return candidates[0];
  }

  /**
   * Schedule a task to an agent
   * @private
   * @param {ScheduledTask} task - Task to schedule
   * @param {RegisteredAgent} agent - Target agent
   */
  _scheduleTask(task, agent) {
    task.state = TaskState.SCHEDULED;
    task.scheduledAt = Date.now();
    task.assignedAgent = agent.id;

    this.activeTasks.set(task.id, task);
    this.metrics.tasksScheduled++;

    this.emit('taskScheduled', { 
      taskId: task.id, 
      agentId: agent.id,
      strategy: task.strategy || this.strategy
    });

    // Set timeout handler
    if (task.timeout > 0) {
      setTimeout(() => {
        if (this.activeTasks.has(task.id)) {
          this.markTaskTimeout(task.id);
        }
      }, task.timeout);
    }
  }

  /**
   * Reassign tasks from a departing agent
   * @private
   * @param {string} agentId - Agent ID
   */
  _reassignAgentTasks(agentId) {
    for (const task of this.activeTasks.values()) {
      if (task.assignedAgent === agentId && task.state === TaskState.SCHEDULED) {
        // Reset task to pending and re-queue
        task.state = TaskState.PENDING;
        task.assignedAgent = null;
        task.scheduledAt = null;
        
        const queue = this.queues.get(task.priority);
        queue.unshift(task);
        
        this.activeTasks.delete(task.id);
      }
    }
  }

  /**
   * Get total queue size
   * @private
   * @returns {number} Total size
   */
  _getTotalQueueSize() {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Add task to completed history
   * @private
   * @param {ScheduledTask} task - Completed task
   */
  _addToCompletedHistory(task) {
    this.completedTasks.push(task);
    
    // Trim history
    while (this.completedTasks.length > this.maxCompletedHistory) {
      this.completedTasks.shift();
    }
  }

  /**
   * Clear completed task history
   */
  clearHistory() {
    this.completedTasks = [];
  }

  /**
   * Dispose of the scheduler
   */
  dispose() {
    this.stop();

    // Cancel all pending tasks
    for (const [priority, queue] of this.queues) {
      while (queue.length > 0) {
        const task = queue.shift();
        task.state = TaskState.CANCELLED;
        task.error = 'Scheduler stopped';
        this.metrics.tasksCancelled++;
      }
    }

    this.agents.clear();
    this.activeTasks.clear();
    this.completedTasks = [];

    this.removeAllListeners();
  }
}

/**
 * @typedef {Object} ScheduledTask
 * @property {string} id - Task ID
 * @property {string} type - Task type
 * @property {*} payload - Task payload
 * @property {number} priority - Task priority
 * @property {string} strategy - Scheduling strategy
 * @property {number} timeout - Task timeout
 * @property {string} [requiredCapability] - Required capability
 * @property {string} [preferredAgent] - Preferred agent ID
 * @property {string} state - Task state
 * @property {number} submittedAt - Submission timestamp
 * @property {number} [scheduledAt] - Scheduling timestamp
 * @property {number} [startedAt] - Start timestamp
 * @property {number} [completedAt] - Completion timestamp
 * @property {string} [assignedAgent] - Assigned agent ID
 * @property {*} [result] - Task result
 * @property {string} [error] - Error message
 */

/**
 * @typedef {Object} RegisteredAgent
 * @property {string} id - Agent ID
 * @property {Object} agent - The actual agent object
 * @property {number} weight - Agent weight
 * @property {string[]} capabilities - Agent capabilities
 * @property {number} maxConcurrent - Maximum concurrent tasks
 * @property {number} currentLoad - Current task load
 * @property {number} totalTasks - Total tasks handled
 * @property {number} registeredAt - Registration timestamp
 */

export default AgentScheduler;
