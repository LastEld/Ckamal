/**
 * @fileoverview GSD Workflow Engine implementation.
 * @module gsd/engine
 */

import { EventEmitter } from 'events';
import { AgentPool } from './agent-pool.js';
import { Planner } from './planner.js';
import { WORKER, canHandleTask } from './agent-types.js';

/**
 * @typedef {Object} WorkflowDefinition
 * @property {string} id - Workflow identifier
 * @property {string} name - Workflow name
 * @property {Array<import('./planner.js').Task>} tasks - Workflow tasks
 * @property {Object} [options] - Workflow options
 */

/**
 * @typedef {Object} WorkflowInstance
 * @property {string} id - Instance identifier
 * @property {string} definitionId - Workflow definition ID
 * @property {string} status - Current status
 * @property {Object} input - Workflow input
 * @property {Object} output - Workflow output
 * @property {Map<string, Object>} taskResults - Results by task ID
 * @property {Set<string>} completedTasks - Completed task IDs
 * @property {Set<string>} runningTasks - Running task IDs
 * @property {Date} startedAt - Start timestamp
 * @property {Date} [completedAt] - Completion timestamp
 * @property {Error} [error] - Error if failed
 */

/**
 * @typedef {Object} GSDEngineOptions
 * @property {number} [minAgents=2] - Minimum agents in pool
 * @property {number} [maxAgents=10] - Maximum agents in pool
 * @property {boolean} [autoScale=true] - Enable auto-scaling
 * @property {number} [defaultTimeout=30000] - Default task timeout
 */

/**
 * GSD Workflow Engine.
 * @extends EventEmitter
 */
export class GSDEngine extends EventEmitter {
  /** @type {Map<string, WorkflowDefinition>} */
  workflowDefinitions;
  
  /** @type {Map<string, WorkflowInstance>} */
  workflowInstances;
  
  /** @type {AgentPool} */
  agentPool;
  
  /** @type {Planner} */
  planner;
  
  /** @type {GSDEngineOptions} */
  options;
  
  /** @type {boolean} */
  isShuttingDown;
  
  /** @type {number} */
  instanceCounter;

  /**
   * Create a new GSD Engine.
   * @param {GSDEngineOptions} [options] - Engine options
   */
  constructor(options = {}) {
    super();
    
    this.options = {
      minAgents: 2,
      maxAgents: 10,
      autoScale: true,
      defaultTimeout: 30000,
      ...options,
    };

    this.workflowDefinitions = new Map();
    this.workflowInstances = new Map();
    this.isShuttingDown = false;
    this.instanceCounter = 0;

    // Initialize agent pool
    this.agentPool = new AgentPool({
      agentType: WORKER,
      minPoolSize: this.options.minAgents,
      maxPoolSize: this.options.maxAgents,
      autoScale: this.options.autoScale,
    });

    // Initialize planner
    this.planner = new Planner();

    // Listen to agent pool events
    this.agentPool.on('scaledUp', (data) => {
      this.emit('poolScaledUp', data);
    });

    this.agentPool.on('scaledDown', (data) => {
      this.emit('poolScaledDown', data);
    });

    this.agentPool.on('agentRemoved', (data) => {
      this.emit('agentRemoved', data);
    });
  }

  /**
   * Register a workflow definition.
   * @param {WorkflowDefinition} definition - Workflow definition
   * @returns {string} Workflow ID
   * @emits GSDEngine#workflowRegistered
   */
  registerWorkflow(definition) {
    if (!definition.id) {
      throw new Error('Workflow definition must have an id');
    }

    if (!definition.tasks || !Array.isArray(definition.tasks)) {
      throw new Error('Workflow definition must have a tasks array');
    }

    // Validate tasks have unique IDs
    const taskIds = new Set();
    for (const task of definition.tasks) {
      if (!task.id) {
        throw new Error('All tasks must have an id');
      }
      if (taskIds.has(task.id)) {
        throw new Error(`Duplicate task id: ${task.id}`);
      }
      taskIds.add(task.id);
    }

    // Validate dependencies exist
    for (const task of definition.tasks) {
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          if (!taskIds.has(depId)) {
            throw new Error(`Task ${task.id} has unknown dependency: ${depId}`);
          }
        }
      }
    }

    this.workflowDefinitions.set(definition.id, definition);

    /**
     * Workflow registered event.
     * @event GSDEngine#workflowRegistered
     * @type {Object}
     * @property {string} workflowId - Workflow identifier
     * @property {string} name - Workflow name
     * @property {number} taskCount - Number of tasks
     */
    this.emit('workflowRegistered', {
      workflowId: definition.id,
      name: definition.name,
      taskCount: definition.tasks.length,
    });

    return definition.id;
  }

  /**
   * Start a workflow instance.
   * @param {string} id - Workflow definition ID
   * @param {Object} [input={}] - Workflow input data
   * @returns {Promise<string>} Instance ID
   * @emits GSDEngine#workflowStarted
   */
  async startWorkflow(id, input = {}) {
    if (this.isShuttingDown) {
      throw new Error('Engine is shutting down');
    }

    const definition = this.workflowDefinitions.get(id);
    if (!definition) {
      throw new Error(`Workflow definition not found: ${id}`);
    }

    const instanceId = `${id}-${++this.instanceCounter}`;
    
    /** @type {WorkflowInstance} */
    const instance = {
      id: instanceId,
      definitionId: id,
      status: 'running',
      input,
      output: {},
      taskResults: new Map(),
      completedTasks: new Set(),
      runningTasks: new Set(),
      startedAt: new Date(),
      completedAt: null,
      error: null,
    };

    this.workflowInstances.set(instanceId, instance);

    /**
     * Workflow started event.
     * @event GSDEngine#workflowStarted
     * @type {Object}
     * @property {string} instanceId - Instance identifier
     * @property {string} workflowId - Workflow definition ID
     * @property {Object} input - Workflow input
     */
    this.emit('workflowStarted', {
      instanceId,
      workflowId: id,
      input,
    });

    // Create execution plan
    const plan = this.planner.plan(definition.tasks, definition.options);

    // Execute workflow
    this._executeWorkflow(instance, definition, plan).catch(error => {
      instance.status = 'failed';
      instance.error = error;
      
      /**
       * Error event.
       * @event GSDEngine#error
       * @type {Object}
       * @property {string} instanceId - Instance identifier
       * @property {Error} error - Error that occurred
       */
      this.emit('error', { instanceId, error });
    });

    return instanceId;
  }

  /**
   * Pause a running workflow.
   * @param {string} id - Instance ID
   * @returns {boolean} Whether pause was successful
   * @emits GSDEngine#workflowPaused
   */
  pauseWorkflow(id) {
    const instance = this.workflowInstances.get(id);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${id}`);
    }

    if (instance.status !== 'running') {
      return false;
    }

    instance.status = 'paused';

    /**
     * Workflow paused event.
     * @event GSDEngine#workflowPaused
     * @type {Object}
     * @property {string} instanceId - Instance identifier
     * @property {Set<string>} runningTasks - Tasks that were running
     */
    this.emit('workflowPaused', {
      instanceId: id,
      runningTasks: new Set(instance.runningTasks),
    });

    return true;
  }

  /**
   * Resume a paused workflow.
   * @param {string} id - Instance ID
   * @returns {boolean} Whether resume was successful
   * @emits GSDEngine#workflowResumed
   */
  resumeWorkflow(id) {
    const instance = this.workflowInstances.get(id);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${id}`);
    }

    if (instance.status !== 'paused') {
      return false;
    }

    instance.status = 'running';

    /**
     * Workflow resumed event.
     * @event GSDEngine#workflowResumed
     * @type {Object}
     * @property {string} instanceId - Instance identifier
     */
    this.emit('workflowResumed', { instanceId: id });

    // Continue execution
    const definition = this.workflowDefinitions.get(instance.definitionId);
    const plan = this.planner.plan(definition.tasks, definition.options);
    
    this._executeWorkflow(instance, definition, plan).catch(error => {
      instance.status = 'failed';
      instance.error = error;
      this.emit('error', { instanceId: id, error });
    });

    return true;
  }

  /**
   * Stop a workflow.
   * @param {string} id - Instance ID
   * @returns {boolean} Whether stop was successful
   * @emits GSDEngine#workflowStopped
   */
  stopWorkflow(id) {
    const instance = this.workflowInstances.get(id);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${id}`);
    }

    if (instance.status === 'completed' || instance.status === 'failed') {
      return false;
    }

    instance.status = 'stopped';
    instance.completedAt = new Date();

    /**
     * Workflow stopped event.
     * @event GSDEngine#workflowStopped
     * @type {Object}
     * @property {string} instanceId - Instance identifier
     * @property {Set<string>} completedTasks - Completed tasks
     * @property {Set<string>} pendingTasks - Pending tasks
     */
    this.emit('workflowStopped', {
      instanceId: id,
      completedTasks: new Set(instance.completedTasks),
      pendingTasks: new Set(instance.runningTasks),
    });

    return true;
  }

  /**
   * Get workflow status.
   * @param {string} id - Instance ID
   * @returns {Object} Workflow status
   */
  getStatus(id) {
    const instance = this.workflowInstances.get(id);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${id}`);
    }

    const definition = this.workflowDefinitions.get(instance.definitionId);
    const totalTasks = definition.tasks.length;
    const completedTasks = instance.completedTasks.size;
    const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;

    return {
      instanceId: instance.id,
      workflowId: instance.definitionId,
      status: instance.status,
      progress: Math.round(progress * 100),
      completedTasks,
      totalTasks,
      runningTasks: Array.from(instance.runningTasks),
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      duration: instance.completedAt 
        ? instance.completedAt - instance.startedAt 
        : Date.now() - instance.startedAt,
      error: instance.error ? instance.error.message : null,
    };
  }

  /**
   * Get all workflow instances.
   * @param {string} [workflowId] - Filter by workflow definition ID
   * @returns {Object[]} Workflow statuses
   */
  getAllInstances(workflowId = null) {
    const instances = [];
    
    for (const instance of this.workflowInstances.values()) {
      if (!workflowId || instance.definitionId === workflowId) {
        instances.push(this.getStatus(instance.id));
      }
    }
    
    return instances;
  }

  /**
   * Execute workflow tasks.
   * @param {WorkflowInstance} instance - Workflow instance
   * @param {WorkflowDefinition} definition - Workflow definition
   * @param {import('./planner.js').PlanResult} plan - Execution plan
   * @returns {Promise<void>}
   * @private
   */
  async _executeWorkflow(instance, definition, plan) {
    const taskMap = new Map(definition.tasks.map(t => [t.id, t]));
    const pendingTasks = new Set(definition.tasks.map(t => t.id));
    
    // Remove already completed tasks
    for (const taskId of instance.completedTasks) {
      pendingTasks.delete(taskId);
    }

    while (pendingTasks.size > 0) {
      // Check if paused
      while (instance.status === 'paused') {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Check if stopped
      if (instance.status === 'stopped') {
        return;
      }

      // Find ready tasks (all dependencies completed)
      const readyTasks = [];
      for (const taskId of pendingTasks) {
        const task = taskMap.get(taskId);
        const depsCompleted = !task.dependencies || 
          task.dependencies.every(depId => instance.completedTasks.has(depId));
        
        if (depsCompleted && !instance.runningTasks.has(taskId)) {
          readyTasks.push(task);
        }
      }

      if (readyTasks.length === 0 && instance.runningTasks.size === 0) {
        // Deadlock or all done
        break;
      }

      // Execute ready tasks
      const executionPromises = readyTasks.map(async (task) => {
        instance.runningTasks.add(task.id);
        pendingTasks.delete(task.id);

        try {
          const agent = await this.agentPool.acquireAgent();
          
          const taskWrapper = {
            id: task.id,
            type: task.type || 'default',
            handler: task.handler || this._defaultTaskHandler.bind(this),
            input: {
              ...instance.input,
              ...this._gatherTaskInputs(task, instance.taskResults),
              taskData: task.data,
            },
            timeout: task.timeout || this.options.defaultTimeout,
          };

          const result = await agent.executeTask(taskWrapper);
          
          instance.taskResults.set(task.id, result);
          instance.completedTasks.add(task.id);
          instance.runningTasks.delete(task.id);

          /**
           * Task completed event.
           * @event GSDEngine#taskCompleted
           * @type {Object}
           * @property {string} instanceId - Workflow instance ID
           * @property {string} taskId - Task ID
           * @property {Object} result - Task result
           */
          this.emit('taskCompleted', {
            instanceId: instance.id,
            taskId: task.id,
            result,
          });

          this.agentPool.releaseAgent(agent);
        } catch (error) {
          instance.runningTasks.delete(task.id);
          throw error;
        }
      });

      if (executionPromises.length > 0) {
        await Promise.all(executionPromises);
      } else if (instance.runningTasks.size > 0) {
        // Wait for running tasks
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Workflow completed
    if (instance.status === 'running') {
      instance.status = 'completed';
      instance.completedAt = new Date();

      // Build output from task results
      for (const [taskId, result] of instance.taskResults) {
        instance.output[taskId] = result;
      }

      /**
       * Workflow completed event.
       * @event GSDEngine#workflowCompleted
       * @type {Object}
       * @property {string} instanceId - Instance identifier
       * @property {string} workflowId - Workflow definition ID
       * @property {Object} output - Workflow output
       * @property {number} duration - Execution duration in ms
       */
      this.emit('workflowCompleted', {
        instanceId: instance.id,
        workflowId: instance.definitionId,
        output: instance.output,
        duration: instance.completedAt - instance.startedAt,
      });
    }
  }

  /**
   * Default task handler.
   * @param {Object} input - Task input
   * @param {import('./agent.js').Agent} agent - Executing agent
   * @returns {Promise<Object>} Task result
   * @private
   */
  async _defaultTaskHandler(input, agent) {
    // Default implementation - subclasses can override
    return { input, agentId: agent.id, timestamp: Date.now() };
  }

  /**
   * Gather inputs from completed dependencies.
   * @param {import('./planner.js').Task} task - Current task
   * @param {Map<string, Object>} results - Completed task results
   * @returns {Object} Combined inputs
   * @private
   */
  _gatherTaskInputs(task, results) {
    const inputs = {};
    
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        const result = results.get(depId);
        if (result) {
          inputs[depId] = result;
        }
      }
    }
    
    return inputs;
  }

  /**
   * Graceful shutdown.
   * @returns {Promise<void>}
   * @emits GSDEngine#shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    // Stop all running workflows
    for (const instance of this.workflowInstances.values()) {
      if (instance.status === 'running' || instance.status === 'paused') {
        this.stopWorkflow(instance.id);
      }
    }

    // Shutdown agent pool
    await this.agentPool.shutdown();

    /**
     * Shutdown event.
     * @event GSDEngine#shutdown
     * @type {Object}
     * @property {number} completedWorkflows - Number of completed workflows
     * @property {number} stoppedWorkflows - Number of stopped workflows
     */
    this.emit('shutdown', {
      completedWorkflows: Array.from(this.workflowInstances.values())
        .filter(i => i.status === 'completed').length,
      stoppedWorkflows: Array.from(this.workflowInstances.values())
        .filter(i => i.status === 'stopped').length,
    });

    // Remove all listeners
    this.removeAllListeners();
  }

  /**
   * Get engine statistics.
   * @returns {Object} Engine statistics
   */
  getStats() {
    const instances = Array.from(this.workflowInstances.values());
    
    return {
      registeredWorkflows: this.workflowDefinitions.size,
      totalInstances: instances.length,
      runningInstances: instances.filter(i => i.status === 'running').length,
      completedInstances: instances.filter(i => i.status === 'completed').length,
      failedInstances: instances.filter(i => i.status === 'failed').length,
      poolStats: this.agentPool.getStats(),
    };
  }
}

export default GSDEngine;
