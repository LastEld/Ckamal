/**
 * @fileoverview BIOS Substrate API - Agent Interface Layer
 * @module bios/substrate-api
 * @description Substrate interface for agents, resource allocation, and communication
 * @version 5.0.0
 */

import { EventEmitter } from 'events';

/**
 * Agent states
 * @readonly
 * @enum {string}
 */
export const AgentState = {
  SPAWNING: 'SPAWNING',
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  DEGRADED: 'DEGRADED',
  SHUTTING_DOWN: 'SHUTTING_DOWN',
  DESTROYED: 'DESTROYED',
  FAILED: 'FAILED'
};

/**
 * Resource types
 * @readonly
 * @enum {string}
 */
export const ResourceType = {
  MEMORY: 'MEMORY',
  CPU: 'CPU',
  AGENT_SLOT: 'AGENT_SLOT',
  TASK_SLOT: 'TASK_SLOT',
  API_QUOTA: 'API_QUOTA'
};

/**
 * Event bus priority levels
 * @readonly
 * @enum {number}
 */
export const EventPriority = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3
};

/**
 * Substrate API - Agent interface and resource management layer
 * @class
 * @extends EventEmitter
 * @description Provides the substrate interface for agents to interact with the BIOS
 */
export class SubstrateAPI extends EventEmitter {
  /**
   * Creates a new SubstrateAPI
   * @constructor
   * @param {BIOSCore} bios - BIOS core instance
   * @param {Object} [options={}] - API options
   */
  constructor(bios, options = {}) {
    super();
    
    /**
     * BIOS core reference
     * @type {BIOSCore}
     * @private
     */
    this._bios = bios;
    
    /**
     * API options
     * @type {Object}
     * @private
     */
    this._options = {
      maxAgents: 50,
      maxMemoryPerAgent: 512 * 1024 * 1024, // 512MB
      maxTotalMemory: 4 * 1024 * 1024 * 1024, // 4GB
      maxParallelSpawns: 5,
      spawnTimeout: 30000,
      gracefulShutdown: 60000,
      ...options
    };
    
    /**
     * Registered agents
     * @type {Map<string, Object>}
     * @private
     */
    this._agents = new Map();
    
    /**
     * Agent resource allocations
     * @type {Map<string, Object>}
     * @private
     */
    this._allocations = new Map();
    
    /**
     * Event bus subscribers
     * @type {Map<string, Set<Function>>}
     * @private
     */
    this._subscribers = new Map();
    
    /**
     * Message queue for agents
     * @type {Map<string, Array<Object>>}
     * @private
     */
    this._messageQueues = new Map();
    
    /**
     * Global event history
     * @type {Array<Object>}
     * @private
     */
    this._eventHistory = [];
    
    /**
     * Maximum event history size
     * @type {number}
     * @private
     */
    this._maxEventHistory = 1000;
    
    /**
     * Agent factory registry
     * @type {Map<string, Function>}
     * @private
     */
    this._agentFactories = new Map();
    
    /**
     * Resource pool
     * @type {Object}
     * @private
     */
    this._resources = {
      agents: { used: 0, max: this._options.maxAgents },
      memory: { used: 0, max: this._options.maxTotalMemory },
      tasks: { used: 0, max: this._options.maxAgents * 2 }
    };
    
    /**
     * Spawn queue
     * @type {Array<Object>}
     * @private
     */
    this._spawnQueue = [];
    
    /**
     * Spawn semaphore
     * @type {number}
     * @private
     */
    this._activeSpawns = 0;
  }

  /**
   * Get registered agent count
   * @returns {number}
   */
  get agentCount() {
    return this._agents.size;
  }

  /**
   * Get available resources
   * @returns {Object}
   */
  get availableResources() {
    return {
      agents: this._resources.agents.max - this._resources.agents.used,
      memory: this._resources.memory.max - this._resources.memory.used,
      tasks: this._resources.tasks.max - this._resources.tasks.used
    };
  }

  /**
   * Initialize the substrate API
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    this.emit('substrate:initialized');
  }

  /**
   * Spawn a new agent
   * @async
   * @param {string} type - Agent type
   * @param {Object} [options={}] - Spawn options
   * @param {Object} [options.config] - Agent configuration
   * @param {Object} [options.resources] - Resource requirements
   * @returns {Promise<Object>} Spawned agent
   */
  async spawnAgent(type, options = {}) {
    // Check resource availability
    const resourceCheck = this._checkResources(options.resources);
    
    if (!resourceCheck.available) {
      throw new Error(`Insufficient resources: ${resourceCheck.reason}`);
    }
    
    // Check spawn concurrency
    if (this._activeSpawns >= this._options.maxParallelSpawns) {
      // Queue for later
      return this._queueSpawn(type, options);
    }
    
    return this._executeSpawn(type, options);
  }

  /**
   * Execute agent spawn
   * @private
   * @async
   * @param {string} type - Agent type
   * @param {Object} options - Spawn options
   * @returns {Promise<Object>} Spawned agent
   */
  async _executeSpawn(type, options) {
    this._activeSpawns++;
    
    const agentId = this._generateAgentId(type);
    const startTime = Date.now();
    
    this.emit('agent:spawn:start', { agentId, type });
    
    try {
      // Create agent record
      const agent = {
        id: agentId,
        type,
        state: AgentState.SPAWNING,
        config: options.config || {},
        createdAt: startTime,
        startedAt: null,
        heartbeatAt: null,
        resources: options.resources || {},
        metadata: {}
      };
      
      // Allocate resources
      this._allocateResources(agentId, agent.resources);
      
      // Store agent
      this._agents.set(agentId, agent);
      this._messageQueues.set(agentId, []);
      
      // Transition to initializing
      agent.state = AgentState.INITIALIZING;
      
      // Initialize agent using factory if available
      const factory = this._agentFactories.get(type);
      
      if (factory) {
        const instance = await factory(agent, options);
        agent.instance = instance;
      }
      
      // Transition to ready
      agent.state = AgentState.READY;
      agent.startedAt = Date.now();
      
      // Set initial heartbeat
      agent.heartbeatAt = Date.now();
      
      this.emit('agent:spawn:complete', { 
        agentId, 
        type, 
        duration: Date.now() - startTime 
      });
      
      return this._sanitizeAgent(agent);
      
    } catch (error) {
      this.emit('agent:spawn:failed', { agentId, type, error: error.message });
      
      // Cleanup
      this._deallocateResources(agentId);
      this._agents.delete(agentId);
      this._messageQueues.delete(agentId);
      
      throw error;
      
    } finally {
      this._activeSpawns--;
      this._processSpawnQueue();
    }
  }

  /**
   * Queue agent spawn
   * @private
   * @param {string} type - Agent type
   * @param {Object} options - Spawn options
   * @returns {Promise<Object>} Queued spawn promise
   */
  _queueSpawn(type, options) {
    return new Promise((resolve, reject) => {
      const queued = {
        type,
        options,
        resolve,
        reject,
        queuedAt: Date.now()
      };
      
      this._spawnQueue.push(queued);
      
      this.emit('agent:spawn:queued', { type, queueLength: this._spawnQueue.length });
    });
  }

  /**
   * Process spawn queue
   * @private
   */
  async _processSpawnQueue() {
    if (this._spawnQueue.length === 0 || this._activeSpawns >= this._options.maxParallelSpawns) {
      return;
    }
    
    const next = this._spawnQueue.shift();
    
    try {
      const agent = await this._executeSpawn(next.type, next.options);
      next.resolve(agent);
    } catch (error) {
      next.reject(error);
    }
  }

  /**
   * Terminate an agent
   * @async
   * @param {string} agentId - Agent identifier
   * @param {Object} [options={}] - Termination options
   * @param {boolean} [options.force=false] - Force immediate termination
   * @param {number} [options.timeout] - Graceful timeout
   * @returns {Promise<boolean>}
   */
  async terminateAgent(agentId, options = {}) {
    const agent = this._agents.get(agentId);
    
    if (!agent) {
      return false;
    }
    
    const timeout = options.timeout || this._options.gracefulShutdown;
    
    this.emit('agent:terminate:start', { agentId, force: options.force });
    
    // Signal termination
    agent.state = AgentState.SHUTTING_DOWN;
    
    if (!options.force && agent.instance) {
      // Wait for graceful shutdown
      try {
        if (agent.instance.shutdown) {
          await Promise.race([
            agent.instance.shutdown(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Shutdown timeout')), timeout)
            )
          ]);
        }
      } catch (error) {
        this.emit('agent:terminate:timeout', { agentId, error: error.message });
      }
    }
    
    // Cleanup
    this._deallocateResources(agentId);
    this._agents.delete(agentId);
    this._messageQueues.delete(agentId);
    
    agent.state = AgentState.DESTROYED;
    
    this.emit('agent:terminate:complete', { agentId });
    
    return true;
  }

  /**
   * Get agent status
   * @param {string} agentId - Agent identifier
   * @returns {Object|null}
   */
  getAgent(agentId) {
    const agent = this._agents.get(agentId);
    return agent ? this._sanitizeAgent(agent) : null;
  }

  /**
   * List all agents
   * @param {Object} [options={}] - List options
   * @returns {Array<Object>}
   */
  listAgents(options = {}) {
    let agents = Array.from(this._agents.values());
    
    if (options.type) {
      agents = agents.filter(a => a.type === options.type);
    }
    
    if (options.state) {
      agents = agents.filter(a => a.state === options.state);
    }
    
    return agents.map(a => this._sanitizeAgent(a));
  }

  /**
   * Update agent state
   * @param {string} agentId - Agent identifier
   * @param {AgentState} state - New state
   * @param {Object} [details={}] - State details
   */
  updateAgentState(agentId, state, details = {}) {
    const agent = this._agents.get(agentId);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    
    const previousState = agent.state;
    agent.state = state;
    
    if (details.metadata) {
      Object.assign(agent.metadata, details.metadata);
    }
    
    this.emit('agent:state:changed', {
      agentId,
      previous: previousState,
      current: state,
      timestamp: Date.now()
    });
  }

  /**
   * Record agent heartbeat
   * @param {string} agentId - Agent identifier
   */
  heartbeat(agentId) {
    const agent = this._agents.get(agentId);
    
    if (agent) {
      agent.heartbeatAt = Date.now();
    }
  }

  /**
   * Check agent health
   * @param {string} agentId - Agent identifier
   * @returns {Object}
   */
  checkAgentHealth(agentId) {
    const agent = this._agents.get(agentId);
    
    if (!agent) {
      return { healthy: false, reason: 'Agent not found' };
    }
    
    const now = Date.now();
    const heartbeatAge = now - (agent.heartbeatAt || agent.startedAt);
    const maxHeartbeatAge = 60000; // 60 seconds
    
    if (heartbeatAge > maxHeartbeatAge) {
      return {
        healthy: false,
        reason: 'Heartbeat timeout',
        lastHeartbeat: agent.heartbeatAt,
        age: heartbeatAge
      };
    }
    
    return {
      healthy: true,
      state: agent.state,
      lastHeartbeat: agent.heartbeatAt,
      uptime: now - agent.startedAt
    };
  }

  /**
   * Register an agent factory
   * @param {string} type - Agent type
   * @param {Function} factory - Factory function
   */
  registerAgentFactory(type, factory) {
    this._agentFactories.set(type, factory);
  }

  /**
   * Allocate resources for an agent
   * @private
   * @param {string} agentId - Agent identifier
   * @param {Object} requirements - Resource requirements
   */
  _allocateResources(agentId, requirements) {
    const allocation = {
      agentId,
      memory: requirements.memory || 0,
      tasks: requirements.tasks || 1,
      timestamp: Date.now()
    };
    
    this._allocations.set(agentId, allocation);
    
    // Update resource pool
    this._resources.agents.used++;
    this._resources.memory.used += allocation.memory;
    this._resources.tasks.used += allocation.tasks;
  }

  /**
   * Deallocate resources for an agent
   * @private
   * @param {string} agentId - Agent identifier
   */
  _deallocateResources(agentId) {
    const allocation = this._allocations.get(agentId);
    
    if (allocation) {
      this._resources.agents.used--;
      this._resources.memory.used -= allocation.memory;
      this._resources.tasks.used -= allocation.tasks;
      
      this._allocations.delete(agentId);
    }
  }

  /**
   * Check resource availability
   * @private
   * @param {Object} requirements - Resource requirements
   * @returns {Object}
   */
  _checkResources(requirements) {
    if (!requirements) {
      return { available: true };
    }
    
    if (this._resources.agents.used >= this._resources.agents.max) {
      return { available: false, reason: 'Maximum agent count reached' };
    }
    
    if (requirements.memory) {
      const available = this._resources.memory.max - this._resources.memory.used;
      if (requirements.memory > available) {
        return { available: false, reason: 'Insufficient memory' };
      }
    }
    
    return { available: true };
  }

  /**
   * Subscribe to events
   * @param {string} event - Event name or pattern
   * @param {Function} handler - Event handler
   * @param {Object} [options={}] - Subscription options
   * @returns {string} Subscription ID
   */
  subscribe(event, handler, options = {}) {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    if (!this._subscribers.has(event)) {
      this._subscribers.set(event, new Set());
    }
    
    this._subscribers.get(event).add({
      id: subscriptionId,
      handler,
      options,
      priority: options.priority || EventPriority.NORMAL
    });
    
    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   * @param {string} subscriptionId - Subscription ID
   * @returns {boolean}
   */
  unsubscribe(subscriptionId) {
    for (const [event, handlers] of this._subscribers) {
      for (const handler of handlers) {
        if (handler.id === subscriptionId) {
          handlers.delete(handler);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Publish event to subscribers
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @param {Object} [options={}] - Publish options
   */
  publish(event, data, options = {}) {
    const eventObj = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: event,
      data,
      timestamp: Date.now(),
      priority: options.priority || EventPriority.NORMAL,
      source: options.source || 'substrate'
    };
    
    // Store in history
    this._eventHistory.push(eventObj);
    
    if (this._eventHistory.length > this._maxEventHistory) {
      this._eventHistory.shift();
    }
    
    // Emit locally
    this.emit(event, eventObj);
    this.emit('*', eventObj);
    
    // Notify subscribers
    const handlers = this._subscribers.get(event);
    
    if (handlers) {
      // Sort by priority
      const sorted = Array.from(handlers).sort((a, b) => a.priority - b.priority);
      
      for (const handler of sorted) {
        try {
          handler.handler(eventObj);
        } catch (error) {
          this.emit('subscriber:error', { event, error: error.message });
        }
      }
    }
    
    // Notify pattern subscribers
    for (const [pattern, patternHandlers] of this._subscribers) {
      if (pattern.includes('*') && this._matchPattern(event, pattern)) {
        for (const handler of patternHandlers) {
          try {
            handler.handler(eventObj);
          } catch (error) {
            this.emit('subscriber:error', { event, error: error.message });
          }
        }
      }
    }
  }

  /**
   * Match event against pattern
   * @private
   * @param {string} event - Event name
   * @param {string} pattern - Pattern
   * @returns {boolean}
   */
  _matchPattern(event, pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(event);
  }

  /**
   * Get event history
   * @param {Object} [options={}] - Query options
   * @returns {Array<Object>}
   */
  getEventHistory(options = {}) {
    let events = [...this._eventHistory];
    
    if (options.type) {
      events = events.filter(e => e.type === options.type);
    }
    
    if (options.since) {
      events = events.filter(e => e.timestamp >= options.since);
    }
    
    if (options.limit) {
      events = events.slice(-options.limit);
    }
    
    return events;
  }

  /**
   * Send message to agent
   * @param {string} agentId - Target agent
   * @param {Object} message - Message content
   * @returns {boolean}
   */
  sendToAgent(agentId, message) {
    const queue = this._messageQueues.get(agentId);
    
    if (!queue) {
      return false;
    }
    
    queue.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...message
    });
    
    // Limit queue size
    if (queue.length > 100) {
      queue.shift();
    }
    
    this.emit('message:queued', { agentId, message });
    
    return true;
  }

  /**
   * Receive messages for agent
   * @param {string} agentId - Agent identifier
   * @param {Object} [options={}] - Receive options
   * @returns {Array<Object>}
   */
  receiveMessages(agentId, options = {}) {
    const queue = this._messageQueues.get(agentId);
    
    if (!queue) {
      return [];
    }
    
    const limit = options.limit || 10;
    const messages = queue.splice(0, limit);
    
    return messages;
  }

  /**
   * Broadcast message to all agents
   * @param {Object} message - Message content
   * @param {Object} [options={}] - Broadcast options
   * @returns {number} Number of agents messaged
   */
  broadcast(message, options = {}) {
    let count = 0;
    
    for (const [agentId, agent] of this._agents) {
      if (options.type && agent.type !== options.type) {
        continue;
      }
      
      if (options.state && agent.state !== options.state) {
        continue;
      }
      
      this.sendToAgent(agentId, message);
      count++;
    }
    
    return count;
  }

  /**
   * Request resources
   * @async
   * @param {string} agentId - Requesting agent
   * @param {Object} resources - Resource requirements
   * @returns {Promise<Object>}
   */
  async requestResources(agentId, resources) {
    const agent = this._agents.get(agentId);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    
    const currentAllocation = this._allocations.get(agentId) || { memory: 0 };
    const additionalMemory = resources.memory || 0;
    const totalRequired = currentAllocation.memory + additionalMemory;
    
    const available = this._resources.memory.max - this._resources.memory.used;
    
    if (additionalMemory > available) {
      return {
        granted: false,
        reason: 'Insufficient memory available',
        requested: resources,
        available: { memory: available }
      };
    }
    
    // Grant resources
    currentAllocation.memory += additionalMemory;
    this._resources.memory.used += additionalMemory;
    
    this.emit('resources:allocated', { agentId, resources });
    
    return {
      granted: true,
      allocated: resources,
      total: currentAllocation
    };
  }

  /**
   * Release resources
   * @param {string} agentId - Agent identifier
   * @param {Object} resources - Resources to release
   */
  releaseResources(agentId, resources) {
    const allocation = this._allocations.get(agentId);
    
    if (!allocation) {
      return;
    }
    
    if (resources.memory) {
      const releaseAmount = Math.min(resources.memory, allocation.memory);
      allocation.memory -= releaseAmount;
      this._resources.memory.used -= releaseAmount;
    }
    
    this.emit('resources:released', { agentId, resources });
  }

  /**
   * Get resource usage
   * @returns {Object}
   */
  getResourceUsage() {
    return {
      agents: { ...this._resources.agents },
      memory: { ...this._resources.memory },
      tasks: { ...this._resources.tasks }
    };
  }

  /**
   * Execute a task
   * @async
   * @param {string} agentId - Agent identifier
   * @param {Object} task - Task definition
   * @returns {Promise<Object>}
   */
  async executeTask(agentId, task) {
    const agent = this._agents.get(agentId);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    
    if (agent.state !== AgentState.READY && agent.state !== AgentState.ACTIVE) {
      throw new Error(`Agent not ready: ${agent.state}`);
    }
    
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.emit('task:start', { taskId, agentId, type: task.type });
    
    try {
      // Transition to active
      const previousState = agent.state;
      agent.state = AgentState.ACTIVE;
      
      let result;
      
      if (agent.instance && agent.instance.execute) {
        result = await agent.instance.execute(task);
      } else {
        result = await this._executeDefaultTask(task);
      }
      
      // Restore previous state if not terminal
      if (agent.state === AgentState.ACTIVE) {
        agent.state = previousState;
      }
      
      this.emit('task:complete', { taskId, agentId, result });
      
      return {
        taskId,
        success: true,
        result
      };
      
    } catch (error) {
      this.emit('task:failed', { taskId, agentId, error: error.message });
      
      return {
        taskId,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute default task
   * @private
   * @async
   * @param {Object} task - Task definition
   * @returns {Promise<Object>}
   */
  async _executeDefaultTask(task) {
    // Default implementation - subclasses can override
    return { executed: true, type: task.type };
  }

  /**
   * Get substrate status
   * @returns {Object}
   */
  getStatus() {
    return {
      agents: {
        total: this._agents.size,
        byState: this._countAgentsByState()
      },
      resources: this.getResourceUsage(),
      events: {
        history: this._eventHistory.length,
        subscribers: this._countSubscribers()
      },
      spawnQueue: this._spawnQueue.length
    };
  }

  /**
   * Count agents by state
   * @private
   * @returns {Object}
   */
  _countAgentsByState() {
    const counts = {};
    
    for (const agent of this._agents.values()) {
      counts[agent.state] = (counts[agent.state] || 0) + 1;
    }
    
    return counts;
  }

  /**
   * Count total subscribers
   * @private
   * @returns {number}
   */
  _countSubscribers() {
    let count = 0;
    
    for (const handlers of this._subscribers.values()) {
      count += handlers.size;
    }
    
    return count;
  }

  /**
   * Generate agent ID
   * @private
   * @param {string} type - Agent type
   * @returns {string}
   */
  _generateAgentId(type) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${type}-${timestamp}-${random}`;
  }

  /**
   * Sanitize agent for external access
   * @private
   * @param {Object} agent - Agent record
   * @returns {Object}
   */
  _sanitizeAgent(agent) {
    return {
      id: agent.id,
      type: agent.type,
      state: agent.state,
      createdAt: agent.createdAt,
      startedAt: agent.startedAt,
      heartbeatAt: agent.heartbeatAt,
      resources: agent.resources,
      metadata: agent.metadata
    };
  }

  /**
   * Dispose of substrate
   */
  dispose() {
    // Terminate all agents
    for (const agentId of this._agents.keys()) {
      this.terminateAgent(agentId, { force: true }).catch(() => {});
    }
    
    this._agents.clear();
    this._allocations.clear();
    this._subscribers.clear();
    this._messageQueues.clear();
    this._eventHistory = [];
    this._agentFactories.clear();
    this._spawnQueue = [];
    
    this.removeAllListeners();
  }

  /**
   * Health check for BIOS component interface
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    const healthy = this._resources.agents.used < this._resources.agents.max;
    
    return {
      healthy,
      status: healthy ? 'HEALTHY' : 'WARNING',
      message: `Substrate managing ${this._agents.size} agents`,
      details: {
        agents: this._agents.size,
        resources: this.getResourceUsage()
      }
    };
  }

  /**
   * Shutdown for BIOS component interface
   */
  async shutdown() {
    this.dispose();
  }
}

export default SubstrateAPI;
