/**
 * @fileoverview Agent Pool and Lifecycle Manager - Main Entry Point
 * @module agents
 * 
 * This module provides a comprehensive agent management system including:
 * - Agent pool with dynamic scaling
 * - Lifecycle management for agents
 * - Health supervision and automatic recovery
 * - Task scheduling and distribution
 * 
 * @example
 * ```javascript
 * import { AgentManager } from './agents/index.js';
 * 
 * const manager = new AgentManager({
 *   agentType: AgentType.CODING,
 *   minPoolSize: 2,
 *   maxPoolSize: 10,
 *   autoScale: true
 * });
 * 
 * await manager.initialize();
 * 
 * // Acquire an agent and execute a task
 * const agent = await manager.acquire();
 * // ... use agent ...
 * manager.release(agent);
 * 
 * // Schedule a task
 * const task = manager.scheduleTask({
 *   id: 'task-1',
 *   type: 'analysis',
 *   payload: { data: '...' }
 * }, { priority: TaskPriority.HIGH });
 * 
 * // Shutdown
 * await manager.shutdown();
 * ```
 */

import { AgentPool } from './pool.js';
import { AgentLifecycle } from './lifecycle.js';
import { AgentSupervisor, AgentHealthStatus, RestartPolicy } from './supervisor.js';
import { AgentScheduler, SchedulingStrategy, TaskPriority, TaskState } from './scheduler.js';
import { 
  AgentType, 
  AgentLifecycleState, 
  AgentTypeConfigs,
  getAgentTypeConfig,
  canHandleTask,
  getAllAgentTypes,
  getCompatibleAgentTypes,
  getDefaultAgentType,
  isValidAgentType,
  comparePriority
} from './types.js';

export {
  // Core classes
  AgentPool,
  AgentLifecycle,
  AgentSupervisor,
  AgentScheduler,
  
  // Enums and constants
  AgentType,
  AgentLifecycleState,
  AgentHealthStatus,
  RestartPolicy,
  SchedulingStrategy,
  TaskPriority,
  TaskState,
  AgentTypeConfigs,
  
  // Utility functions
  getAgentTypeConfig,
  canHandleTask,
  getAllAgentTypes,
  getCompatibleAgentTypes,
  getDefaultAgentType,
  isValidAgentType,
  comparePriority
};

/**
 * Agent Manager - Unified interface for agent management
 * Combines pool, lifecycle, supervision, and scheduling
 */
export class AgentManager {
  /**
   * Create a new AgentManager
   * @param {Object} [options] - Manager options
   * @param {string} [options.agentType=AgentType.SYSTEM] - Default agent type
   * @param {number} [options.minPoolSize=2] - Minimum pool size
   * @param {number} [options.maxPoolSize=10] - Maximum pool size
   * @param {boolean} [options.autoScale=true] - Enable auto-scaling
   * @param {boolean} [options.enableSupervision=true] - Enable supervision
   * @param {boolean} [options.enableScheduling=true] - Enable task scheduling
   * @param {Object} [options.poolOptions] - Additional pool options
   * @param {Object} [options.supervisorOptions] - Additional supervisor options
   * @param {Object} [options.schedulerOptions] - Additional scheduler options
   */
  constructor(options = {}) {
    this.options = {
      agentType: options.agentType || AgentType.SYSTEM,
      minPoolSize: options.minPoolSize ?? 2,
      maxPoolSize: options.maxPoolSize ?? 10,
      autoScale: options.autoScale !== false,
      enableSupervision: options.enableSupervision !== false,
      enableScheduling: options.enableScheduling !== false,
      poolOptions: options.poolOptions || {},
      supervisorOptions: options.supervisorOptions || {},
      schedulerOptions: options.schedulerOptions || {}
    };

    this.pool = null;
    this.supervisor = null;
    this.scheduler = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the agent manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    // Create and initialize pool
    this.pool = new AgentPool({
      agentType: this.options.agentType,
      minPoolSize: this.options.minPoolSize,
      maxPoolSize: this.options.maxPoolSize,
      autoScale: this.options.autoScale,
      ...this.options.poolOptions
    });

    await this.pool.initialize();

    // Set up supervision if enabled
    if (this.options.enableSupervision) {
      this.supervisor = new AgentSupervisor(this.options.supervisorOptions);
      this.supervisor.start();

      // Forward pool events to supervisor
      this.pool.on('agent:activated', (data) => {
        const agent = this.pool.agents.get(data.agentId);
        if (agent) {
          this.supervisor.supervise(agent, {
            onUnhealthy: async (agent, _reason) => {
              // Destroy unhealthy agent and let pool replace it
              await this.pool._destroyAgent(agent.id);
            }
          });
        }
      });

      this.pool.on('agent:destroyed', (data) => {
        this.supervisor.unsupervise(data.agentId);
      });
    }

    // Set up scheduling if enabled
    if (this.options.enableScheduling) {
      this.scheduler = new AgentScheduler(this.options.schedulerOptions);
      this.scheduler.start();

      // Connect scheduler to pool
      this.scheduler.on('taskScheduled', async (data) => {
        try {
          const agent = await this.pool.acquire();
          this.scheduler.markTaskStarted(data.taskId, agent.id);
          
          // Store task-agent association for later
          agent.currentTaskId = data.taskId;
        } catch (error) {
          this.scheduler.markTaskFailed(data.taskId, error);
        }
      });
    }

    this.isInitialized = true;
  }

  /**
   * Acquire an agent from the pool
   * @param {Object} [options] - Acquisition options
   * @returns {Promise<Object>} Acquired agent
   */
  async acquire(options = {}) {
    this._ensureInitialized();
    return this.pool.acquire(options);
  }

  /**
   * Release an agent back to the pool
   * @param {Object} agent - Agent to release
   */
  release(agent) {
    this._ensureInitialized();
    this.pool.release(agent);
  }

  /**
   * Execute a task with an agent from the pool
   * @param {Function} taskFn - Task function(agent)
   * @param {Object} [options] - Execution options
   * @returns {Promise<*>} Task result
   */
  async execute(taskFn, options = {}) {
    const agent = await this.acquire(options);
    
    try {
      const result = await taskFn(agent);
      return result;
    } finally {
      this.release(agent);
    }
  }

  /**
   * Schedule a task for execution
   * @param {Object} task - Task to schedule
   * @param {Object} [options] - Scheduling options
   * @returns {Object} Scheduled task
   */
  scheduleTask(task, options = {}) {
    this._ensureInitialized();
    
    if (!this.scheduler) {
      throw new Error('Scheduling is not enabled');
    }

    return this.scheduler.submit(task, options);
  }

  /**
   * Scale the pool up
   * @param {number} [count=1] - Number of agents to add
   * @returns {Promise<number>} Number added
   */
  async scaleUp(count = 1) {
    this._ensureInitialized();
    return this.pool.scaleUp(count);
  }

  /**
   * Scale the pool down
   * @param {number} [count=1] - Number of agents to remove
   * @returns {Promise<number>} Number removed
   */
  async scaleDown(count = 1) {
    this._ensureInitialized();
    return this.pool.scaleDown(count);
  }

  /**
   * Get manager statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const stats = {
      isInitialized: this.isInitialized,
      agentType: this.options.agentType,
      pool: this.pool ? this.pool.getStats() : null,
      supervisor: this.supervisor ? this.supervisor.getStats() : null,
      scheduler: this.scheduler ? this.scheduler.getStats() : null
    };

    return stats;
  }

  /**
   * Shutdown the manager
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (!this.isInitialized) {
      return;
    }

    if (this.scheduler) {
      this.scheduler.dispose();
      this.scheduler = null;
    }

    if (this.supervisor) {
      this.supervisor.dispose();
      this.supervisor = null;
    }

    if (this.pool) {
      await this.pool.shutdown();
      this.pool = null;
    }

    this.isInitialized = false;
  }

  /**
   * Ensure manager is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('AgentManager not initialized. Call initialize() first.');
    }
  }
}

export default AgentManager;
