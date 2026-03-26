/**
 * @fileoverview Agent pool implementation for the GSD Engine.
 * @module gsd/agent-pool
 */

import { EventEmitter } from 'events';
import { Agent, AgentStatus } from './agent.js';
import { WORKER } from './agent-types.js';

/**
 * Agent pool that manages a collection of agents.
 * @extends EventEmitter
 */
export class AgentPool extends EventEmitter {
  /** @type {Map<string, Agent>} */
  agents;
  
  /** @type {Agent[]} */
  availableAgents;
  
  /** @type {Array<{task: Object, resolve: Function, reject: Function}>} */
  taskQueue;
  
  /** @type {import('./agent-types.js').AgentTypeConfig} */
  agentType;
  
  /** @type {number} */
  minPoolSize;
  
  /** @type {number} */
  maxPoolSize;
  
  /** @type {number} */
  currentId;
  
  /** @type {ReturnType<setInterval>|null} */
  autoScaleTimer;
  
  /** @type {ReturnType<setInterval>|null} */
  healthCheckTimer;
  
  /** @type {boolean} */
  isShuttingDown;
  
  /** @type {Object} */
  stats;

  /**
   * Create a new agent pool.
   * @param {Object} [options] - Pool configuration options
   * @param {import('./agent-types.js').AgentTypeConfig} [options.agentType] - Type of agents to create
   * @param {number} [options.minPoolSize=2] - Minimum number of agents
   * @param {number} [options.maxPoolSize=10] - Maximum number of agents
   * @param {boolean} [options.autoScale=true] - Enable auto-scaling
   * @param {number} [options.scaleInterval=30000] - Auto-scaling check interval in ms
   * @param {number} [options.healthCheckInterval=10000] - Health check interval in ms
   */
  constructor(options = {}) {
    super();
    
    this.agentType = options.agentType || WORKER;
    this.minPoolSize = options.minPoolSize || 2;
    this.maxPoolSize = options.maxPoolSize || 10;
    this.currentId = 0;
    
    this.agents = new Map();
    this.availableAgents = [];
    this.taskQueue = [];
    
    this.autoScaleTimer = null;
    this.healthCheckTimer = null;
    this.isShuttingDown = false;
    
    this.stats = {
      totalTasksSubmitted: 0,
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
      scaleUpCount: 0,
      scaleDownCount: 0,
      peakPoolSize: 0,
    };

    // Initialize minimum pool size
    this._initializePool();

    // Start auto-scaling if enabled
    if (options.autoScale !== false) {
      this._startAutoScaling(options.scaleInterval || 30000);
    }

    // Start health checks
    this._startHealthChecks(options.healthCheckInterval || 10000);
  }

  /**
   * Acquire an agent from the pool.
   * @returns {Promise<Agent>} Promise that resolves to an available agent
   * @emits AgentPool#agentAcquired
   */
  async acquireAgent() {
    if (this.isShuttingDown) {
      throw new Error('Agent pool is shutting down');
    }

    // Check for available agent
    const agent = this.availableAgents.find(a => a.isAvailable());
    
    if (agent) {
      this._removeFromAvailable(agent);
      
      /**
       * Agent acquired event.
       * @event AgentPool#agentAcquired
       * @type {Object}
       * @property {string} agentId - Agent identifier
       * @property {number} availableCount - Remaining available agents
       */
      this.emit('agentAcquired', {
        agentId: agent.id,
        availableCount: this.availableAgents.length,
      });
      
      return agent;
    }

    // Try to scale up if under max
    if (this.agents.size < this.maxPoolSize) {
      const newAgent = this._createAgent();
      
      /**
       * Agent acquired event.
       * @event AgentPool#agentAcquired
       */
      this.emit('agentAcquired', {
        agentId: newAgent.id,
        availableCount: this.availableAgents.length,
      });
      
      return newAgent;
    }

    // Wait for an agent to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.taskQueue.findIndex(item => item.resolve === resolve);
        if (index > -1) {
          this.taskQueue.splice(index, 1);
        }
        reject(new Error('Timeout waiting for available agent'));
      }, 30000);

      this.taskQueue.push({
        resolve: (agent) => {
          clearTimeout(timeout);
          resolve(agent);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  /**
   * Release an agent back to the pool.
   * @param {Agent} agent - Agent to release
   * @emits AgentPool#agentReleased
   */
  releaseAgent(agent) {
    if (!this.agents.has(agent.id)) {
      return;
    }

    // Check if there are waiting tasks
    if (this.taskQueue.length > 0 && agent.isAvailable()) {
      const waiting = this.taskQueue.shift();
      waiting.resolve(agent);
      return;
    }

    // Return to available pool if healthy and not shutting down
    if (agent.isAvailable() && !this.isShuttingDown) {
      this.availableAgents.push(agent);
      
      /**
       * Agent released event.
       * @event AgentPool#agentReleased
       * @type {Object}
       * @property {string} agentId - Agent identifier
       * @property {number} availableCount - Available agents count
       */
      this.emit('agentReleased', {
        agentId: agent.id,
        availableCount: this.availableAgents.length,
      });
    }
  }

  /**
   * Get pool statistics.
   * @returns {Object} Pool statistics
   */
  getStats() {
    const agentStatuses = Array.from(this.agents.values()).map(a => a.getStatus());
    
    return {
      poolSize: this.agents.size,
      availableCount: this.availableAgents.length,
      busyCount: agentStatuses.filter(a => a.status === AgentStatus.BUSY).length,
      queueDepth: this.taskQueue.length,
      minPoolSize: this.minPoolSize,
      maxPoolSize: this.maxPoolSize,
      isHealthy: agentStatuses.every(a => a.isHealthy),
      stats: { ...this.stats },
      agents: agentStatuses,
    };
  }

  /**
   * Scale up the pool by adding agents.
   * @param {number} count - Number of agents to add
   * @returns {number} Number of agents actually added
   * @emits AgentPool#scaledUp
   */
  scaleUp(count) {
    if (this.isShuttingDown) {
      return 0;
    }

    const toAdd = Math.min(count, this.maxPoolSize - this.agents.size);
    const added = [];

    for (let i = 0; i < toAdd; i++) {
      added.push(this._createAgent());
    }

    this.stats.scaleUpCount += toAdd;
    
    if (this.agents.size > this.stats.peakPoolSize) {
      this.stats.peakPoolSize = this.agents.size;
    }

    /**
     * Scaled up event.
     * @event AgentPool#scaledUp
     * @type {Object}
     * @property {number} count - Number of agents added
     * @property {number} newSize - New pool size
     * @property {string[]} agentIds - IDs of added agents
     */
    this.emit('scaledUp', {
      count: toAdd,
      newSize: this.agents.size,
      agentIds: added.map(a => a.id),
    });

    return toAdd;
  }

  /**
   * Scale down the pool by removing idle agents.
   * @param {number} count - Number of agents to remove
   * @returns {number} Number of agents actually removed
   * @emits AgentPool#scaledDown
   */
  scaleDown(count) {
    const toRemove = Math.min(
      count,
      this.availableAgents.length - this.minPoolSize
    );

    if (toRemove <= 0) {
      return 0;
    }

    const removed = [];

    for (let i = 0; i < toRemove; i++) {
      const agent = this.availableAgents.pop();
      if (agent) {
        this.agents.delete(agent.id);
        removed.push(agent);
        agent.terminate();
      }
    }

    this.stats.scaleDownCount += toRemove;

    /**
     * Scaled down event.
     * @event AgentPool#scaledDown
     * @type {Object}
     * @property {number} count - Number of agents removed
     * @property {number} newSize - New pool size
     * @property {string[]} agentIds - IDs of removed agents
     */
    this.emit('scaledDown', {
      count: toRemove,
      newSize: this.agents.size,
      agentIds: removed.map(a => a.id),
    });

    return toRemove;
  }

  /**
   * Execute shutdown sequence.
   * @returns {Promise<void>}
   * @emits AgentPool#shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    // Stop auto-scaling and health checks
    if (this.autoScaleTimer) {
      clearInterval(this.autoScaleTimer);
      this.autoScaleTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Reject all queued tasks
    while (this.taskQueue.length > 0) {
      const waiting = this.taskQueue.shift();
      waiting.reject(new Error('Agent pool is shutting down'));
    }

    // Terminate all agents
    const terminationPromises = Array.from(this.agents.values()).map(agent => 
      agent.terminate()
    );
    
    await Promise.all(terminationPromises);

    this.agents.clear();
    this.availableAgents = [];

    /**
     * Shutdown event.
     * @event AgentPool#shutdown
     * @type {Object}
     * @property {number} finalPoolSize - Final pool size (should be 0)
     * @property {Object} finalStats - Final statistics
     */
    this.emit('shutdown', {
      finalPoolSize: this.agents.size,
      finalStats: { ...this.stats },
    });

    // Remove all listeners
    this.removeAllListeners();
  }

  /**
   * Initialize the pool with minimum agents.
   * @private
   */
  _initializePool() {
    for (let i = 0; i < this.minPoolSize; i++) {
      this._createAgent();
    }
  }

  /**
   * Create a new agent and add to pool.
   * @returns {Agent} Created agent
   * @private
   */
  _createAgent() {
    const id = `${this.agentType.name.toLowerCase()}-${++this.currentId}`;
    const agent = new Agent(id, this.agentType);
    
    this.agents.set(id, agent);
    this.availableAgents.push(agent);

    // Listen to agent events
    agent.on('taskCompleted', () => {
      this.stats.totalTasksCompleted++;
      this.releaseAgent(agent);
    });

    agent.on('taskFailed', () => {
      this.stats.totalTasksFailed++;
      this.releaseAgent(agent);
    });

    agent.on('unhealthy', () => {
      this._handleUnhealthyAgent(agent);
    });

    return agent;
  }

  /**
   * Remove agent from available list.
   * @param {Agent} agent - Agent to remove
   * @private
   */
  _removeFromAvailable(agent) {
    const index = this.availableAgents.indexOf(agent);
    if (index > -1) {
      this.availableAgents.splice(index, 1);
    }
  }

  /**
   * Handle unhealthy agent.
   * @param {Agent} agent - Unhealthy agent
   * @private
   */
  _handleUnhealthyAgent(agent) {
    this._removeFromAvailable(agent);
    this.agents.delete(agent.id);
    
    // Replace with new agent if not shutting down
    if (!this.isShuttingDown && this.agents.size < this.minPoolSize) {
      this._createAgent();
    }

    /**
     * Agent removed event.
     * @event AgentPool#agentRemoved
     * @type {Object}
     * @property {string} agentId - Agent identifier
     * @property {string} reason - Removal reason
     */
    this.emit('agentRemoved', {
      agentId: agent.id,
      reason: 'unhealthy',
    });
  }

  /**
   * Start auto-scaling timer.
   * @param {number} interval - Check interval in ms
   * @private
   */
  _startAutoScaling(interval) {
    this.autoScaleTimer = setInterval(() => {
      if (this.isShuttingDown) {
        return;
      }

      const queueDepth = this.taskQueue.length;
      const availableCount = this.availableAgents.length;
      const busyCount = this.agents.size - availableCount;
      const utilization = this.agents.size > 0 ? busyCount / this.agents.size : 0;

      // Scale up if queue is deep or high utilization
      if (queueDepth > 3 || utilization > 0.8) {
        const scaleAmount = Math.min(
          Math.ceil(queueDepth / 2),
          this.maxPoolSize - this.agents.size
        );
        if (scaleAmount > 0) {
          this.scaleUp(scaleAmount);
        }
      }

      // Scale down if too many idle agents
      if (availableCount > this.minPoolSize && utilization < 0.3 && queueDepth === 0) {
        const scaleAmount = Math.floor((availableCount - this.minPoolSize) / 2);
        if (scaleAmount > 0) {
          this.scaleDown(scaleAmount);
        }
      }
    }, interval);
  }

  /**
   * Start health check timer.
   * @param {number} interval - Check interval in ms
   * @private
   */
  _startHealthChecks(interval) {
    this.healthCheckTimer = setInterval(() => {
      if (this.isShuttingDown) {
        return;
      }

      for (const agent of this.agents.values()) {
        const status = agent.getStatus();
        
        // Check for stale heartbeats
        if (status.lastHeartbeat) {
          const heartbeatAge = Date.now() - new Date(status.lastHeartbeat).getTime();
          const maxAge = agent.type.heartbeatInterval * 3;
          
          if (heartbeatAge > maxAge) {
            agent.markUnhealthy();
          }
        }

        // Check for agents stuck in error state
        if (status.status === AgentStatus.ERROR) {
          this._handleUnhealthyAgent(agent);
        }
      }
    }, interval);
  }
}

export default AgentPool;
