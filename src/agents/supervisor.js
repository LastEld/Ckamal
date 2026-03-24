/**
 * @fileoverview Agent Supervisor - Health monitoring, automatic restart, error recovery
 * @module agents/supervisor
 */

import { EventEmitter } from 'events';
import { CircuitBreaker } from '../middleware/circuit-breaker.js';
import { AgentLifecycleState } from './types.js';

/**
 * Agent health status
 * @readonly
 * @enum {string}
 */
export const AgentHealthStatus = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNHEALTHY: 'UNHEALTHY',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Restart policy
 * @readonly
 * @enum {string}
 */
export const RestartPolicy = {
  NEVER: 'NEVER',
  ON_FAILURE: 'ON_FAILURE',
  ALWAYS: 'ALWAYS'
};

/**
 * Agent Supervisor for health monitoring and automatic recovery
 * @extends EventEmitter
 */
export class AgentSupervisor extends EventEmitter {
  /**
   * Create a new AgentSupervisor
   * @param {Object} [options] - Supervisor options
   * @param {number} [options.healthCheckInterval=10000] - Health check interval in ms
   * @param {number} [options.unhealthyThreshold=3] - Failed checks before marking unhealthy
   * @param {number} [options.heartbeatTimeout=60000] - Heartbeat timeout in ms
   * @param {string} [options.restartPolicy=ON_FAILURE] - Restart policy
   * @param {number} [options.maxRestarts=3] - Maximum restarts per time window
   * @param {number} [options.restartWindow=300000] - Restart tracking window in ms
   * @param {boolean} [options.circuitBreakerEnabled=true] - Enable circuit breaker
   * @param {Object} [options.circuitBreakerConfig] - Circuit breaker configuration
   */
  constructor(options = {}) {
    super();

    this.healthCheckInterval = options.healthCheckInterval || 10000;
    this.unhealthyThreshold = options.unhealthyThreshold || 3;
    this.heartbeatTimeout = options.heartbeatTimeout || 60000;
    this.restartPolicy = options.restartPolicy || RestartPolicy.ON_FAILURE;
    this.maxRestarts = options.maxRestarts || 3;
    this.restartWindow = options.restartWindow || 300000;
    this.circuitBreakerEnabled = options.circuitBreakerEnabled !== false;

    // Circuit breaker
    this.circuitBreaker = new CircuitBreaker('agent-supervisor', {
      failureThreshold: options.circuitBreakerConfig?.failureThreshold || 5,
      successThreshold: options.circuitBreakerConfig?.successThreshold || 3,
      timeout: options.circuitBreakerConfig?.timeout || 60000,
      halfOpenMaxCalls: options.circuitBreakerConfig?.halfOpenMaxCalls || 3,
      ...options.circuitBreakerConfig
    });

    /** @type {Map<string, SupervisedAgent>} */
    this.agents = new Map();

    /** @type {Map<string, AgentHealthStatus>} */
    this.healthStatus = new Map();

    /** @type {Map<string, number>} */
    this.healthCheckFailures = new Map();

    /** @type {Map<string, Array<number>>} */
    this.restartHistory = new Map();

    /** @type {ReturnType<setInterval>|null} */
    this.healthCheckTimer = null;

    /** @type {boolean} */
    this.isRunning = false;

    // Set up circuit breaker events
    this._setupCircuitBreakerEvents();
  }

  /**
   * Set up circuit breaker event handlers
   * @private
   */
  _setupCircuitBreakerEvents() {
    this.circuitBreaker.on('open', () => {
      this.emit('circuitOpen', { supervisor: this });
    });

    this.circuitBreaker.on('close', () => {
      this.emit('circuitClose', { supervisor: this });
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.emit('circuitHalfOpen', { supervisor: this });
    });
  }

  /**
   * Start the supervisor
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this._startHealthChecks();
    
    this.emit('started', { timestamp: Date.now() });
  }

  /**
   * Stop the supervisor
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    this.emit('stopped', { timestamp: Date.now() });
  }

  /**
   * Register an agent for supervision
   * @param {Object} agent - Agent to supervise
   * @param {Object} [options] - Supervision options
   * @param {Function} [options.healthCheck] - Custom health check function
   * @param {Function} [options.onUnhealthy] - Callback when agent becomes unhealthy
   * @param {Function} [options.onRestart] - Callback to restart agent
   * @param {string} [options.restartPolicy] - Override restart policy for this agent
   * @returns {SupervisedAgent} Supervised agent info
   */
  supervise(agent, options = {}) {
    const supervisedAgent = {
      id: agent.id,
      agent,
      healthCheck: options.healthCheck || this._defaultHealthCheck.bind(this),
      onUnhealthy: options.onUnhealthy,
      onRestart: options.onRestart,
      restartPolicy: options.restartPolicy || this.restartPolicy,
      registeredAt: Date.now(),
      lastHealthCheck: null,
      restartCount: 0
    };

    this.agents.set(agent.id, supervisedAgent);
    this.healthStatus.set(agent.id, AgentHealthStatus.UNKNOWN);
    this.healthCheckFailures.set(agent.id, 0);
    this.restartHistory.set(agent.id, []);

    this.emit('agentRegistered', { agentId: agent.id });

    // Perform initial health check
    this._checkAgentHealth(supervisedAgent);

    return supervisedAgent;
  }

  /**
   * Unregister an agent from supervision
   * @param {string} agentId - Agent ID
   * @returns {boolean} True if unregistered
   */
  unsupervise(agentId) {
    const existed = this.agents.has(agentId);
    
    this.agents.delete(agentId);
    this.healthStatus.delete(agentId);
    this.healthCheckFailures.delete(agentId);
    this.restartHistory.delete(agentId);

    if (existed) {
      this.emit('agentUnregistered', { agentId });
    }

    return existed;
  }

  /**
   * Default health check implementation
   * @private
   * @param {Object} agent - Agent to check
   * @returns {Promise<boolean>} Health status
   */
  async _defaultHealthCheck(agent) {
    // Check if agent has built-in health check
    if (typeof agent.isHealthy === 'function') {
      return agent.isHealthy();
    }

    // Check lifecycle state
    if (agent.state === AgentLifecycleState.ERROR) {
      return false;
    }

    // Check heartbeat
    if (agent.lastHeartbeat) {
      const heartbeatAge = Date.now() - agent.lastHeartbeat;
      if (heartbeatAge > this.heartbeatTimeout) {
        return false;
      }
    }

    return true;
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
   * Run health checks on all supervised agents
   * @private
   */
  async _runHealthChecks() {
    for (const supervisedAgent of this.agents.values()) {
      await this._checkAgentHealth(supervisedAgent);
    }
  }

  /**
   * Check health of a single agent
   * @private
   * @param {SupervisedAgent} supervisedAgent - Agent to check
   */
  async _checkAgentHealth(supervisedAgent) {
    const { id, agent, healthCheck } = supervisedAgent;

    try {
      const isHealthy = await this.circuitBreaker.execute(
        () => healthCheck(agent),
        { fallback: false }
      );

      supervisedAgent.lastHealthCheck = Date.now();

      if (isHealthy.success && isHealthy.result) {
        this._handleHealthyAgent(id);
      } else {
        this._handleUnhealthyAgent(id, 'health check failed');
      }
    } catch (error) {
      this._handleUnhealthyAgent(id, error.message);
    }
  }

  /**
   * Handle healthy agent
   * @private
   * @param {string} agentId - Agent ID
   */
  _handleHealthyAgent(agentId) {
    const currentStatus = this.healthStatus.get(agentId);
    const failures = this.healthCheckFailures.get(agentId);

    // Reset failure count
    this.healthCheckFailures.set(agentId, 0);

    // Update status
    this.healthStatus.set(agentId, AgentHealthStatus.HEALTHY);

    // Emit recovery if previously unhealthy
    if (currentStatus === AgentHealthStatus.UNHEALTHY || 
        currentStatus === AgentHealthStatus.DEGRADED) {
      this.emit('agentRecovered', { agentId, previousStatus: currentStatus });
    }

    // Record circuit breaker success
    this.circuitBreaker.recordSuccess();
  }

  /**
   * Handle unhealthy agent
   * @private
   * @param {string} agentId - Agent ID
   * @param {string} reason - Reason for being unhealthy
   */
  _handleUnhealthyAgent(agentId, reason) {
    const failures = (this.healthCheckFailures.get(agentId) || 0) + 1;
    this.healthCheckFailures.set(agentId, failures);

    const currentStatus = this.healthStatus.get(agentId);
    
    // Determine new status
    let newStatus;
    if (failures >= this.unhealthyThreshold) {
      newStatus = AgentHealthStatus.UNHEALTHY;
    } else if (failures > 0) {
      newStatus = AgentHealthStatus.DEGRADED;
    } else {
      newStatus = AgentHealthStatus.HEALTHY;
    }

    this.healthStatus.set(agentId, newStatus);

    // Record circuit breaker failure
    this.circuitBreaker.recordFailure();

    // Emit events
    if (newStatus === AgentHealthStatus.UNHEALTHY && 
        currentStatus !== AgentHealthStatus.UNHEALTHY) {
      this.emit('agentUnhealthy', { agentId, reason, failures });

      // Trigger recovery
      this._triggerRecovery(agentId, reason);
    } else if (newStatus === AgentHealthStatus.DEGRADED) {
      this.emit('agentDegraded', { agentId, reason, failures });
    }
  }

  /**
   * Trigger recovery for an unhealthy agent
   * @private
   * @param {string} agentId - Agent ID
   * @param {string} reason - Failure reason
   */
  async _triggerRecovery(agentId, reason) {
    const supervisedAgent = this.agents.get(agentId);
    if (!supervisedAgent) {
      return;
    }

    const { restartPolicy } = supervisedAgent;

    // Check if we should restart
    if (restartPolicy === RestartPolicy.NEVER) {
      this.emit('restartSkipped', { agentId, reason: 'restart policy is NEVER' });
      return;
    }

    if (restartPolicy === RestartPolicy.ON_FAILURE && !reason.includes('error')) {
      this.emit('restartSkipped', { agentId, reason: 'not a failure' });
      return;
    }

    // Check restart limit
    if (!this._canRestart(agentId)) {
      this.emit('restartLimitReached', { agentId });
      
      // Call custom unhealthy handler if provided
      if (supervisedAgent.onUnhealthy) {
        await supervisedAgent.onUnhealthy(supervisedAgent.agent, reason);
      }
      return;
    }

    // Perform restart
    await this._restartAgent(agentId, reason);
  }

  /**
   * Check if agent can be restarted
   * @private
   * @param {string} agentId - Agent ID
   * @returns {boolean} True if restart is allowed
   */
  _canRestart(agentId) {
    const restarts = this.restartHistory.get(agentId) || [];
    const now = Date.now();
    
    // Filter to recent restarts within window
    const recentRestarts = restarts.filter(time => now - time < this.restartWindow);
    this.restartHistory.set(agentId, recentRestarts);

    return recentRestarts.length < this.maxRestarts;
  }

  /**
   * Restart an agent
   * @private
   * @param {string} agentId - Agent ID
   * @param {string} reason - Restart reason
   */
  async _restartAgent(agentId, reason) {
    const supervisedAgent = this.agents.get(agentId);
    if (!supervisedAgent) {
      return;
    }

    this.emit('agentRestarting', { agentId, reason });

    try {
      // Record restart
      const restarts = this.restartHistory.get(agentId) || [];
      restarts.push(Date.now());
      this.restartHistory.set(agentId, restarts);
      supervisedAgent.restartCount++;

      // Use custom restart handler if provided
      if (supervisedAgent.onRestart) {
        const newAgent = await supervisedAgent.onRestart(supervisedAgent.agent);
        
        // Update supervised agent
        if (newAgent) {
          supervisedAgent.agent = newAgent;
          supervisedAgent.id = newAgent.id;
          
          // Update maps
          this.agents.delete(agentId);
          this.agents.set(newAgent.id, supervisedAgent);
          
          this.healthStatus.delete(agentId);
          this.healthStatus.set(newAgent.id, AgentHealthStatus.HEALTHY);
          
          this.healthCheckFailures.delete(agentId);
          this.healthCheckFailures.set(newAgent.id, 0);
        }
      }

      this.emit('agentRestarted', { 
        agentId, 
        newAgentId: supervisedAgent.agent.id,
        restartCount: supervisedAgent.restartCount 
      });
    } catch (error) {
      this.emit('restartFailed', { agentId, error: error.message });
    }
  }

  /**
   * Manually restart an agent
   * @param {string} agentId - Agent ID
   * @param {string} [reason] - Restart reason
   * @returns {Promise<boolean>} True if restarted successfully
   */
  async restart(agentId, reason = 'manual restart') {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is not supervised`);
    }

    await this._restartAgent(agentId, reason);
    return true;
  }

  /**
   * Get health status of an agent
   * @param {string} agentId - Agent ID
   * @returns {AgentHealthStatus} Health status
   */
  getAgentHealth(agentId) {
    return this.healthStatus.get(agentId) || AgentHealthStatus.UNKNOWN;
  }

  /**
   * Get all health statuses
   * @returns {Object.<string, AgentHealthStatus>} Health status by agent ID
   */
  getAllHealthStatuses() {
    const statuses = {};
    for (const [id, status] of this.healthStatus) {
      statuses[id] = status;
    }
    return statuses;
  }

  /**
   * Get supervisor statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const statuses = this.getAllHealthStatuses();
    const healthCounts = {
      [AgentHealthStatus.HEALTHY]: 0,
      [AgentHealthStatus.DEGRADED]: 0,
      [AgentHealthStatus.UNHEALTHY]: 0,
      [AgentHealthStatus.UNKNOWN]: 0
    };

    for (const status of Object.values(statuses)) {
      healthCounts[status]++;
    }

    return {
      totalAgents: this.agents.size,
      healthCounts,
      healthyAgents: healthCounts[AgentHealthStatus.HEALTHY],
      degradedAgents: healthCounts[AgentHealthStatus.DEGRADED],
      unhealthyAgents: healthCounts[AgentHealthStatus.UNHEALTHY],
      circuitBreakerState: this.circuitBreaker.getState().state,
      isRunning: this.isRunning
    };
  }

  /**
   * Dispose of the supervisor
   */
  dispose() {
    this.stop();
    
    this.agents.clear();
    this.healthStatus.clear();
    this.healthCheckFailures.clear();
    this.restartHistory.clear();
    
    this.removeAllListeners();
  }
}

/**
 * @typedef {Object} SupervisedAgent
 * @property {string} id - Agent ID
 * @property {Object} agent - The actual agent object
 * @property {Function} healthCheck - Health check function
 * @property {Function} [onUnhealthy] - Callback when unhealthy
 * @property {Function} [onRestart] - Callback to restart agent
 * @property {string} restartPolicy - Restart policy for this agent
 * @property {number} registeredAt - Registration timestamp
 * @property {number} [lastHealthCheck] - Last health check timestamp
 * @property {number} restartCount - Number of restarts
 */

export default AgentSupervisor;
