/**
 * @fileoverview Agent Lifecycle Manager
 * @module agents/lifecycle
 */

import { EventEmitter } from 'events';
import { AgentLifecycleState } from './types.js';

/**
 * Generate unique agent ID
 * @returns {string} Unique identifier
 */
function generateId() {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Agent lifecycle manager
 * @extends EventEmitter
 */
export class AgentLifecycle extends EventEmitter {
  /**
   * Create a new AgentLifecycle instance
   * @param {Object} [options] - Configuration options
   * @param {number} [options.initTimeout=30000] - Initialization timeout in ms
   * @param {number} [options.terminationTimeout=30000] - Termination timeout in ms
   * @param {boolean} [options.autoRecover=true] - Enable auto-recovery
   */
  constructor(options = {}) {
    super();
    
    this.initTimeout = options.initTimeout || 30000;
    this.terminationTimeout = options.terminationTimeout || 30000;
    this.autoRecover = options.autoRecover !== false;
    
    /** @type {Map<string, ManagedAgent>} */
    this.agents = new Map();
    
    /** @type {Map<string, Function>} */
    this.agentFactories = new Map();
    
    // Register default agent factory
    this.registerAgentFactory('default', this._defaultAgentFactory.bind(this));
  }

  /**
   * Register an agent factory for a specific type
   * @param {string} type - Agent type
   * @param {Function} factory - Factory function that creates agents
   */
  registerAgentFactory(type, factory) {
    this.agentFactories.set(type, factory);
  }

  /**
   * Default agent factory
   * @private
   * @param {string} id - Agent ID
   * @param {Object} cv - Agent CV/configuration
   * @returns {Object} Agent instance
   */
  _defaultAgentFactory(id, cv) {
    return {
      id,
      type: cv.type || 'default',
      config: cv,
      state: AgentLifecycleState.SPAWNING,
      createdAt: Date.now(),
      metadata: {}
    };
  }

  /**
   * Spawn a new agent from CV
   * @param {Object} cv - Agent CV/configuration
   * @param {string} [cv.type] - Agent type
   * @param {string} [cv.id] - Optional agent ID
   * @returns {Promise<ManagedAgent>} Spawned agent
   * @emits AgentLifecycle#spawning
   * @emits AgentLifecycle#spawned
   */
  async spawnAgent(cv) {
    const id = cv.id || generateId();
    const type = cv.type || 'default';
    
    if (this.agents.has(id)) {
      throw new Error(`Agent with ID ${id} already exists`);
    }

    this.emit('spawning', { agentId: id, type });

    // Get factory for agent type
    const factory = this.agentFactories.get(type) || this.agentFactories.get('default');
    
    const agent = factory(id, cv);
    agent.state = AgentLifecycleState.SPAWNING;
    agent.lifecycleCallbacks = cv.lifecycleCallbacks || {};
    
    this.agents.set(id, agent);

    this.emit('spawned', { agentId: id, type, agent });

    return agent;
  }

  /**
   * Initialize an agent
   * @param {Object} agent - Agent to initialize
   * @returns {Promise<ManagedAgent>} Initialized agent
   * @emits AgentLifecycle#initializing
   * @emits AgentLifecycle#initialized
   */
  async initializeAgent(agent) {
    if (!this.agents.has(agent.id)) {
      throw new Error(`Agent ${agent.id} not found in lifecycle manager`);
    }

    if (agent.state !== AgentLifecycleState.SPAWNING) {
      throw new Error(`Cannot initialize agent in ${agent.state} state`);
    }

    this.emit('initializing', { agentId: agent.id });
    agent.state = AgentLifecycleState.INITIALIZING;

    try {
      // Run custom initialization callback if provided
      if (agent.lifecycleCallbacks.onInitialize) {
        await this._runWithTimeout(
          agent.lifecycleCallbacks.onInitialize(agent),
          this.initTimeout,
          `Agent ${agent.id} initialization timed out`
        );
      }

      agent.state = AgentLifecycleState.READY;
      agent.initializedAt = Date.now();

      this.emit('initialized', { agentId: agent.id, success: true });

      return agent;
    } catch (error) {
      agent.state = AgentLifecycleState.ERROR;
      agent.error = error;

      this.emit('initialized', { agentId: agent.id, success: false, error: error.message });
      this.emit('error', { agentId: agent.id, phase: 'initialization', error });

      throw error;
    }
  }

  /**
   * Activate an agent (mark as ready to work)
   * @param {Object} agent - Agent to activate
   * @returns {Promise<ManagedAgent>} Activated agent
   * @emits AgentLifecycle#activating
   * @emits AgentLifecycle#activated
   */
  async activateAgent(agent) {
    if (!this.agents.has(agent.id)) {
      throw new Error(`Agent ${agent.id} not found in lifecycle manager`);
    }

    if (agent.state !== AgentLifecycleState.READY) {
      throw new Error(`Cannot activate agent in ${agent.state} state`);
    }

    this.emit('activating', { agentId: agent.id });

    try {
      // Run custom activation callback if provided
      if (agent.lifecycleCallbacks.onActivate) {
        await agent.lifecycleCallbacks.onActivate(agent);
      }

      agent.state = AgentLifecycleState.ACTIVE;
      agent.activatedAt = Date.now();

      this.emit('activated', { agentId: agent.id });

      return agent;
    } catch (error) {
      agent.state = AgentLifecycleState.ERROR;
      agent.error = error;

      this.emit('error', { agentId: agent.id, phase: 'activation', error });
      throw error;
    }
  }

  /**
   * Deactivate an agent (stop accepting work)
   * @param {Object} agent - Agent to deactivate
   * @returns {Promise<ManagedAgent>} Deactivated agent
   * @emits AgentLifecycle#deactivating
   * @emits AgentLifecycle#deactivated
   */
  async deactivateAgent(agent) {
    if (!this.agents.has(agent.id)) {
      throw new Error(`Agent ${agent.id} not found in lifecycle manager`);
    }

    if (agent.state !== AgentLifecycleState.ACTIVE) {
      return agent; // Nothing to do
    }

    this.emit('deactivating', { agentId: agent.id });

    try {
      // Run custom deactivation callback if provided
      if (agent.lifecycleCallbacks.onDeactivate) {
        await agent.lifecycleCallbacks.onDeactivate(agent);
      }

      agent.state = AgentLifecycleState.READY;
      agent.deactivatedAt = Date.now();

      this.emit('deactivated', { agentId: agent.id });

      return agent;
    } catch (error) {
      this.emit('error', { agentId: agent.id, phase: 'deactivation', error });
      throw error;
    }
  }

  /**
   * Terminate an agent (graceful shutdown)
   * @param {Object} agent - Agent to terminate
   * @returns {Promise<ManagedAgent>} Terminated agent
   * @emits AgentLifecycle#terminating
   * @emits AgentLifecycle#terminated
   */
  async terminateAgent(agent) {
    if (!this.agents.has(agent.id)) {
      throw new Error(`Agent ${agent.id} not found in lifecycle manager`);
    }

    if (agent.state === AgentLifecycleState.SHUTTING_DOWN ||
        agent.state === AgentLifecycleState.DESTROYED) {
      return agent; // Already terminating or terminated
    }

    this.emit('terminating', { agentId: agent.id });
    agent.state = AgentLifecycleState.SHUTTING_DOWN;

    try {
      // Run custom termination callback if provided
      if (agent.lifecycleCallbacks.onTerminate) {
        await this._runWithTimeout(
          agent.lifecycleCallbacks.onTerminate(agent),
          this.terminationTimeout,
          `Agent ${agent.id} termination timed out`
        );
      }

      // Deactivate first if active
      if (agent.state === AgentLifecycleState.ACTIVE) {
        await this.deactivateAgent(agent);
      }

      agent.state = AgentLifecycleState.READY;
      agent.terminatedAt = Date.now();

      this.emit('terminated', { agentId: agent.id, graceful: true });

      return agent;
    } catch (error) {
      agent.state = AgentLifecycleState.ERROR;
      agent.error = error;

      this.emit('error', { agentId: agent.id, phase: 'termination', error });
      throw error;
    }
  }

  /**
   * Destroy an agent (complete cleanup)
   * @param {Object} agent - Agent to destroy
   * @returns {Promise<boolean>} True if destroyed successfully
   * @emits AgentLifecycle#destroying
   * @emits AgentLifecycle#destroyed
   */
  async destroyAgent(agent) {
    if (!this.agents.has(agent.id)) {
      return true; // Already destroyed or never existed
    }

    this.emit('destroying', { agentId: agent.id });

    try {
      // Terminate first if needed
      if (agent.state !== AgentLifecycleState.READY &&
          agent.state !== AgentLifecycleState.DESTROYED &&
          agent.state !== AgentLifecycleState.ERROR) {
        await this.terminateAgent(agent);
      }

      // Run custom destroy callback if provided
      if (agent.lifecycleCallbacks.onDestroy) {
        await agent.lifecycleCallbacks.onDestroy(agent);
      }

      agent.state = AgentLifecycleState.DESTROYED;
      agent.destroyedAt = Date.now();

      // Remove from tracking
      this.agents.delete(agent.id);

      this.emit('destroyed', { agentId: agent.id });

      return true;
    } catch (error) {
      this.emit('error', { agentId: agent.id, phase: 'destruction', error });
      throw error;
    }
  }

  /**
   * Force destroy an agent (immediate cleanup, no graceful shutdown)
   * @param {Object} agent - Agent to force destroy
   * @returns {boolean} True if destroyed
   * @emits AgentLifecycle#destroyed
   */
  forceDestroyAgent(agent) {
    if (!this.agents.has(agent.id)) {
      return true;
    }

    this.emit('destroying', { agentId: agent.id, forced: true });

    try {
      // Run destroy callback synchronously if provided
      if (agent.lifecycleCallbacks.onDestroy) {
        // Fire and forget - we're forcing destruction
        Promise.resolve(agent.lifecycleCallbacks.onDestroy(agent)).catch(() => {});
      }

      agent.state = AgentLifecycleState.DESTROYED;
      agent.destroyedAt = Date.now();
      agent.forcedDestroy = true;

      // Remove from tracking
      this.agents.delete(agent.id);

      this.emit('destroyed', { agentId: agent.id, forced: true });

      return true;
    } catch (error) {
      this.emit('error', { agentId: agent.id, phase: 'forced_destruction', error });
      return false;
    }
  }

  /**
   * Create and fully initialize an agent (convenience method)
   * @param {Object} cv - Agent CV/configuration
   * @returns {Promise<ManagedAgent>} Fully initialized and activated agent
   */
  async createAgent(cv) {
    const agent = await this.spawnAgent(cv);
    await this.initializeAgent(agent);
    await this.activateAgent(agent);
    return agent;
  }

  /**
   * Get agent by ID
   * @param {string} agentId - Agent ID
   * @returns {ManagedAgent|null} Agent or null if not found
   */
  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get all agents
   * @returns {Array<ManagedAgent>} Array of all agents
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by state
   * @param {string} state - Lifecycle state
   * @returns {Array<ManagedAgent>} Agents in the specified state
   */
  getAgentsByState(state) {
    return this.getAllAgents().filter(agent => agent.state === state);
  }

  /**
   * Get agents by type
   * @param {string} type - Agent type
   * @returns {Array<ManagedAgent>} Agents of the specified type
   */
  getAgentsByType(type) {
    return this.getAllAgents().filter(agent => agent.type === type);
  }

  /**
   * Get lifecycle statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const agents = this.getAllAgents();
    const stateCounts = {};
    
    Object.values(AgentLifecycleState).forEach(state => {
      stateCounts[state] = agents.filter(a => a.state === state).length;
    });

    return {
      totalAgents: agents.length,
      stateCounts,
      activeAgents: stateCounts[AgentLifecycleState.ACTIVE] || 0,
      readyAgents: stateCounts[AgentLifecycleState.READY] || 0,
      errorAgents: stateCounts[AgentLifecycleState.ERROR] || 0
    };
  }

  /**
   * Check if an agent is in a specific state
   * @param {Object} agent - Agent to check
   * @param {string} state - Expected state
   * @returns {boolean} True if in expected state
   */
  isInState(agent, state) {
    return agent.state === state;
  }

  /**
   * Check if agent is active
   * @param {Object} agent - Agent to check
   * @returns {boolean} True if active
   */
  isActive(agent) {
    return this.isInState(agent, AgentLifecycleState.ACTIVE);
  }

  /**
   * Check if agent is ready (initialized but not active)
   * @param {Object} agent - Agent to check
   * @returns {boolean} True if ready
   */
  isReady(agent) {
    return this.isInState(agent, AgentLifecycleState.READY);
  }

  /**
   * Run a promise with timeout
   * @private
   * @param {Promise} promise - Promise to run
   * @param {number} timeout - Timeout in ms
   * @param {string} message - Error message on timeout
   * @returns {Promise} Result or throws timeout error
   */
  async _runWithTimeout(promise, timeout, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(message)), timeout)
      )
    ]);
  }

  /**
   * Dispose of all agents
   * @returns {Promise<void>}
   */
  async dispose() {
    const agents = this.getAllAgents();
    
    // Terminate all agents
    await Promise.all(
      agents.map(agent => 
        this.destroyAgent(agent).catch(() => {})
      )
    );

    this.agents.clear();
    this.agentFactories.clear();
    this.removeAllListeners();
  }
}

/**
 * @typedef {Object} ManagedAgent
 * @property {string} id - Agent ID
 * @property {string} type - Agent type
 * @property {string} state - Current lifecycle state
 * @property {Object} config - Agent configuration/CV
 * @property {number} createdAt - Creation timestamp
 * @property {number} [initializedAt] - Initialization timestamp
 * @property {number} [activatedAt] - Activation timestamp
 * @property {number} [deactivatedAt] - Deactivation timestamp
 * @property {number} [terminatedAt] - Termination timestamp
 * @property {number} [destroyedAt] - Destruction timestamp
 * @property {Error} [error] - Last error
 * @property {Object} [metadata] - Additional metadata
 * @property {Object} [lifecycleCallbacks] - Lifecycle callbacks
 * @property {Function} [lifecycleCallbacks.onInitialize] - Called during initialization
 * @property {Function} [lifecycleCallbacks.onActivate] - Called during activation
 * @property {Function} [lifecycleCallbacks.onDeactivate] - Called during deactivation
 * @property {Function} [lifecycleCallbacks.onTerminate] - Called during termination
 * @property {Function} [lifecycleCallbacks.onDestroy] - Called during destruction
 */

export default AgentLifecycle;
