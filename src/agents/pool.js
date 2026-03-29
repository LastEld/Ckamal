/**
 * @fileoverview Agent Pool - Dynamic pool with auto-scaling and load balancing
 * @module agents/pool
 */

import { EventEmitter } from 'events';
import { AgentLifecycle } from './lifecycle.js';
import { AgentType, AgentLifecycleState } from './types.js';

/**
 * Agent Pool with dynamic scaling and health checks
 * @extends EventEmitter
 */
export class AgentPool extends EventEmitter {
  /**
   * Create a new AgentPool
   * @param {Object} [options] - Pool configuration
   * @param {string} [options.agentType] - Type of agents in pool
   * @param {number} [options.minPoolSize=2] - Minimum pool size
   * @param {number} [options.maxPoolSize=10] - Maximum pool size
   * @param {boolean} [options.autoScale=true] - Enable auto-scaling
   * @param {number} [options.scaleInterval=30000] - Auto-scaling interval in ms
   * @param {number} [options.healthCheckInterval=10000] - Health check interval in ms
   * @param {number} [options.idleTimeout=300000] - Idle timeout in ms
   * @param {number} [options.queueTimeout=30000] - Queue wait timeout in ms
   * @param {Object} [options.cv] - Default CV for spawned agents
   */
  constructor(options = {}) {
    super();

    this.agentType = options.agentType || AgentType.SYSTEM;
    this.minPoolSize = options.minPoolSize ?? 2;
    this.maxPoolSize = options.maxPoolSize ?? 10;
    this.autoScaleEnabled = options.autoScale !== false;
    this.scaleInterval = options.scaleInterval || 30000;
    this.healthCheckInterval = options.healthCheckInterval || 10000;
    this.idleTimeout = options.idleTimeout || 300000;
    this.queueTimeout = options.queueTimeout || 30000;
    this.defaultCv = options.cv || {};

    // Lifecycle manager
    this.lifecycle = new AgentLifecycle();
    
    // Pool state
    /** @type {Map<string, PooledAgent>} */
    this.agents = new Map();
    
    /** @type {Set<string>} */
    this.availableAgents = new Set();
    
    /** @type {Array<{resolve: Function, reject: Function, timeout: number, priority: number}>} */
    this.waitQueue = [];
    
    /** @type {Object} */
    this.stats = {
      totalRequests: 0,
      totalAcquired: 0,
      totalReleased: 0,
      totalTimeouts: 0,
      scaleUpCount: 0,
      scaleDownCount: 0,
      peakPoolSize: 0,
      createdAt: Date.now()
    };

    /** @type {Map<string, ReturnType<setTimeout>>} */
    this.idleTimers = new Map();

    /** @type {ReturnType<setInterval>|null} */
    this.autoScaleTimer = null;

    /** @type {ReturnType<setInterval>|null} */
    this.healthCheckTimer = null;

    /** @type {boolean} */
    this.isShuttingDown = false;

    // Set up lifecycle event forwarding
    this._setupLifecycleEvents();
  }

  /**
   * Set up lifecycle event forwarding
   * @private
   */
  _setupLifecycleEvents() {
    const events = ['spawning', 'spawned', 'initializing', 'initialized', 
                    'activating', 'activated', 'deactivating', 'deactivated',
                    'terminating', 'terminated', 'destroying', 'destroyed', 'error'];
    
    events.forEach(event => {
      this.lifecycle.on(event, (data) => {
        this.emit(`agent:${event}`, data);
      });
    });
  }

  /**
   * Initialize the pool
   * @returns {Promise<void>}
   * @emits AgentPool#initialized
   */
  async initialize() {
    if (this.isShuttingDown) {
      throw new Error('Cannot initialize pool that is shutting down');
    }

    // Create minimum pool size
    const initPromises = [];
    for (let i = 0; i < this.minPoolSize; i++) {
      initPromises.push(this._createAgent());
    }

    await Promise.all(initPromises);

    // Start auto-scaling
    if (this.autoScaleEnabled) {
      this._startAutoScaling();
    }

    // Start health checks
    this._startHealthChecks();

    this.emit('initialized', {
      poolSize: this.agents.size,
      minPoolSize: this.minPoolSize,
      maxPoolSize: this.maxPoolSize
    });
  }

  /**
   * Acquire an agent from the pool
   * @param {Object} [options] - Acquisition options
   * @param {number} [options.priority=0] - Request priority (higher = more important)
   * @param {number} [options.timeout] - Custom timeout in ms
   * @returns {Promise<PooledAgent>} Acquired agent
   * @emits AgentPool#agentAcquired
   */
  async acquire(options = {}) {
    if (this.isShuttingDown) {
      throw new Error('Pool is shutting down');
    }

    this.stats.totalRequests++;

    const priority = options.priority || 0;
    const timeout = options.timeout || this.queueTimeout;

    // Try to get available agent immediately
    const agent = this._getAvailableAgent();
    if (agent) {
      return this._acquireAgent(agent);
    }

    // Try to scale up if under max
    if (this.agents.size < this.maxPoolSize) {
      const newAgent = await this._createAgent();
      return this._acquireAgent(newAgent);
    }

    // Wait for an agent to become available
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._removeFromQueue(resolve);
        this.stats.totalTimeouts++;
        reject(new Error(`Timeout waiting for agent after ${timeout}ms`));
      }, timeout);

      this.waitQueue.push({
        resolve,
        reject,
        timeout: timer,
        priority
      });

      // Sort by priority (highest first)
      this.waitQueue.sort((a, b) => b.priority - a.priority);
    });
  }

  /**
   * Release an agent back to the pool
   * @param {PooledAgent} agent - Agent to release
   * @returns {void}
   * @emits AgentPool#agentReleased
   */
  release(agent) {
    if (!this.agents.has(agent.id)) {
      return;
    }

    const pooledAgent = this.agents.get(agent.id);
    
    // Check if acquired
    if (!pooledAgent.acquired) {
      return;
    }

    pooledAgent.acquired = false;
    pooledAgent.acquiredAt = null;
    pooledAgent.taskCount++;
    pooledAgent.lastUsed = Date.now();

    this.stats.totalReleased++;

    // Check for waiting requests
    if (this.waitQueue.length > 0 && pooledAgent.state === AgentLifecycleState.READY) {
      const waiter = this.waitQueue.shift();
      clearTimeout(waiter.timeout);
      
      pooledAgent.acquired = true;
      pooledAgent.acquiredAt = Date.now();
      this.stats.totalAcquired++;
      
      this.emit('agentAcquired', {
        agentId: agent.id,
        fromQueue: true,
        queueDepth: this.waitQueue.length
      });

      waiter.resolve(pooledAgent);
      return;
    }

    // Return to available pool if healthy and not shutting down
    // Accept both READY and ACTIVE states since agents are ACTIVE after creation
    if ((pooledAgent.state === AgentLifecycleState.READY || 
         pooledAgent.state === AgentLifecycleState.ACTIVE) && !this.isShuttingDown) {
      this.availableAgents.add(agent.id);
      this._startIdleTimer(agent.id);

      this.emit('agentReleased', {
        agentId: agent.id,
        availableCount: this.availableAgents.size
      });
    } else {
      // Agent not in valid state, destroy it and potentially create new
      this._destroyAgent(agent.id);
    }
  }

  /**
   * Scale up the pool
   * @param {number} [count=1] - Number of agents to add
   * @returns {Promise<number>} Number of agents actually added
   * @emits AgentPool#scaledUp
   */
  async scaleUp(count = 1) {
    if (this.isShuttingDown) {
      return 0;
    }

    const toAdd = Math.min(count, this.maxPoolSize - this.agents.size);
    const added = [];

    for (let i = 0; i < toAdd; i++) {
      try {
        const agent = await this._createAgent();
        added.push(agent);
      } catch (error) {
        this.emit('error', { phase: 'scaleUp', error });
        break;
      }
    }

    this.stats.scaleUpCount += added.length;
    
    if (this.agents.size > this.stats.peakPoolSize) {
      this.stats.peakPoolSize = this.agents.size;
    }

    this.emit('scaledUp', {
      count: added.length,
      newSize: this.agents.size,
      agentIds: added.map(a => a.id)
    });

    return added.length;
  }

  /**
   * Scale down the pool
   * @param {number} [count=1] - Number of agents to remove
   * @returns {Promise<number>} Number of agents actually removed
   * @emits AgentPool#scaledDown
   */
  async scaleDown(count = 1) {
    // Calculate how many we can remove
    const availableIds = Array.from(this.availableAgents);
    const toRemove = Math.min(
      count,
      availableIds.length,
      this.agents.size - this.minPoolSize
    );

    if (toRemove <= 0) {
      return 0;
    }

    const removed = [];

    for (let i = 0; i < toRemove; i++) {
      const agentId = availableIds[i];
      if (await this._destroyAgent(agentId)) {
        removed.push(agentId);
      }
    }

    this.stats.scaleDownCount += removed.length;

    this.emit('scaledDown', {
      count: removed.length,
      newSize: this.agents.size,
      agentIds: removed
    });

    return removed.length;
  }

  /**
   * Get pool statistics
   * @returns {Object} Pool statistics
   */
  getStats() {
    const agents = Array.from(this.agents.values());
    const activeAgents = agents.filter(a => a.acquired);
    const availableAgents = agents.filter(a => !a.acquired);
    const stateCounts = this.lifecycle.getStats().stateCounts;

    return {
      poolSize: this.agents.size,
      availableCount: availableAgents.length,
      activeCount: activeAgents.length,
      waitQueueDepth: this.waitQueue.length,
      minPoolSize: this.minPoolSize,
      maxPoolSize: this.maxPoolSize,
      agentType: this.agentType,
      stateCounts,
      stats: { ...this.stats },
      utilization: this.agents.size > 0 ? activeAgents.length / this.agents.size : 0,
      agents: agents.map(a => ({
        id: a.id,
        state: a.state,
        acquired: a.acquired,
        taskCount: a.taskCount,
        createdAt: a.createdAt
      }))
    };
  }

  /**
   * Shutdown the pool
   * @returns {Promise<void>}
   * @emits AgentPool#shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    // Stop timers
    if (this.autoScaleTimer) {
      clearInterval(this.autoScaleTimer);
      this.autoScaleTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Clear idle timers
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();

    // Reject all waiting requests
    while (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Pool is shutting down'));
    }

    // Destroy all agents
    const agentIds = Array.from(this.agents.keys());
    await Promise.all(
      agentIds.map(id => this._destroyAgent(id).catch(() => {}))
    );

    this.agents.clear();
    this.availableAgents.clear();

    await this.lifecycle.dispose();

    this.emit('shutdown', {
      finalPoolSize: 0,
      finalStats: { ...this.stats }
    });

    this.removeAllListeners();
  }

  /**
   * Create a new agent and add to pool
   * @private
   * @returns {Promise<PooledAgent>} Created agent
   */
  async _createAgent() {
    const cv = {
      type: this.agentType,
      ...this.defaultCv
    };

    const agent = await this.lifecycle.createAgent(cv);
    
    const pooledAgent = {
      ...agent,
      acquired: false,
      acquiredAt: null,
      taskCount: 0,
      lastUsed: Date.now(),
      healthCheckFailures: 0
    };

    this.agents.set(agent.id, pooledAgent);
    this.availableAgents.add(agent.id);

    return pooledAgent;
  }

  /**
   * Destroy an agent
   * @private
   * @param {string} agentId - Agent ID
   * @returns {Promise<boolean>} True if destroyed
   */
  async _destroyAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    // Cancel idle timer
    if (this.idleTimers.has(agentId)) {
      clearTimeout(this.idleTimers.get(agentId));
      this.idleTimers.delete(agentId);
    }

    // Remove from available set
    this.availableAgents.delete(agentId);

    // Remove from agents map
    this.agents.delete(agentId);

    // Destroy via lifecycle
    try {
      await this.lifecycle.destroyAgent(agent);
      return true;
    } catch (error) {
      this.emit('error', { phase: 'destroy', agentId, error });
      return false;
    }
  }

  /**
   * Get an available agent
   * @private
   * @returns {PooledAgent|null} Available agent or null
   */
  _getAvailableAgent() {
    for (const agentId of this.availableAgents) {
      const agent = this.agents.get(agentId);
      if (agent && !agent.acquired && 
          (agent.state === AgentLifecycleState.READY || 
           agent.state === AgentLifecycleState.ACTIVE)) {
        // Clear idle timer
        if (this.idleTimers.has(agentId)) {
          clearTimeout(this.idleTimers.get(agentId));
          this.idleTimers.delete(agentId);
        }
        return agent;
      }
    }
    return null;
  }

  /**
   * Acquire an agent
   * @private
   * @param {PooledAgent} agent - Agent to acquire
   * @returns {PooledAgent} Acquired agent
   */
  _acquireAgent(agent) {
    // Remove from available set
    this.availableAgents.delete(agent.id);
    
    // Clear idle timer if exists
    if (this.idleTimers.has(agent.id)) {
      clearTimeout(this.idleTimers.get(agent.id));
      this.idleTimers.delete(agent.id);
    }
    
    agent.acquired = true;
    agent.acquiredAt = Date.now();
    this.stats.totalAcquired++;

    this.emit('agentAcquired', {
      agentId: agent.id,
      availableCount: this.availableAgents.size
    });

    return agent;
  }

  /**
   * Remove from wait queue
   * @private
   * @param {Function} resolve - Resolve function to match
   */
  _removeFromQueue(resolve) {
    const index = this.waitQueue.findIndex(item => item.resolve === resolve);
    if (index > -1) {
      this.waitQueue.splice(index, 1);
    }
  }

  /**
   * Start idle timer for an agent
   * @private
   * @param {string} agentId - Agent ID
   */
  _startIdleTimer(agentId) {
    // Clear existing timer
    if (this.idleTimers.has(agentId)) {
      clearTimeout(this.idleTimers.get(agentId));
    }

    const timer = setTimeout(() => {
      this._handleIdleTimeout(agentId);
    }, this.idleTimeout);

    this.idleTimers.set(agentId, timer);
  }

  /**
   * Handle idle timeout
   * @private
   * @param {string} agentId - Agent ID
   */
  async _handleIdleTimeout(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent || agent.acquired) {
      return;
    }

    // Only scale down if above minimum
    if (this.agents.size > this.minPoolSize) {
      await this._destroyAgent(agentId);
      
      this.emit('agentIdleTimeout', {
        agentId,
        reason: 'idle timeout'
      });
    }
  }

  /**
   * Start auto-scaling timer
   * @private
   */
  _startAutoScaling() {
    if (this.autoScaleTimer) {
      return;
    }

    this.autoScaleTimer = setInterval(() => {
      this._checkScaling();
    }, this.scaleInterval);
  }

  /**
   * Check and execute scaling
   * @private
   */
  async _checkScaling() {
    if (this.isShuttingDown) {
      return;
    }

    const stats = this.getStats();
    const { availableCount, poolSize, waitQueueDepth, utilization } = stats;

    // Scale up if queue is deep or high utilization
    if (waitQueueDepth > 0 || utilization > 0.8) {
      const needed = Math.max(
        Math.ceil(waitQueueDepth / 2),
        Math.ceil(poolSize * 0.3)
      );
      const canAdd = Math.min(needed, this.maxPoolSize - poolSize);
      
      if (canAdd > 0) {
        await this.scaleUp(canAdd);
      }
    }

    // Scale down if too many idle agents
    if (availableCount > this.minPoolSize && utilization < 0.3 && waitQueueDepth === 0) {
      const canRemove = Math.min(
        Math.floor((availableCount - this.minPoolSize) / 2),
        poolSize - this.minPoolSize
      );
      
      if (canRemove > 0) {
        await this.scaleDown(canRemove);
      }
    }
  }

  /**
   * Start health check timer
   * @private
   */
  _startHealthChecks() {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(() => {
      this._runHealthChecks();
    }, this.healthCheckInterval);
  }

  /**
   * Run health checks on all agents
   * @private
   */
  async _runHealthChecks() {
    if (this.isShuttingDown) {
      return;
    }

    for (const agent of this.agents.values()) {
      // Skip acquired agents
      if (agent.acquired) {
        continue;
      }

      // Check lifecycle state
      if (agent.state === AgentLifecycleState.ERROR) {
        agent.healthCheckFailures++;
        
        if (agent.healthCheckFailures >= 3) {
          this.emit('agentUnhealthy', {
            agentId: agent.id,
            reason: 'error state'
          });
          
          await this._destroyAgent(agent.id);
          
          // Replace if needed
          if (this.agents.size < this.minPoolSize) {
            await this._createAgent();
          }
        }
      } else {
        agent.healthCheckFailures = 0;
      }
    }
  }
}

/**
 * @typedef {Object} PooledAgent
 * @extends ManagedAgent
 * @property {boolean} acquired - Whether agent is currently acquired
 * @property {number} [acquiredAt] - When agent was acquired
 * @property {number} taskCount - Total tasks completed
 * @property {number} lastUsed - Last used timestamp
 * @property {number} healthCheckFailures - Consecutive health check failures
 */

export default AgentPool;
