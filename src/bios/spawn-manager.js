/**
 * @fileoverview Agent Spawn Manager - Lifecycle and resource management for BIOS orchestrator
 * @module bios/spawn-manager
 * 
 * UPDATED: Integrated with Heartbeat Runtime for run tracking and session persistence
 */

import { EventEmitter } from 'events';
import { Agent } from '../engine/agent.js';
import { getModelRuntimeCandidates, resolveModelRuntime } from '../clients/catalog.js';

/**
 * Agent lifecycle states (extended from base AgentStatus)
 * @readonly
 * @enum {string}
 */
export const LifecycleState = {
  // Creation states
  SPAWNING: 'spawning',
  INITIALIZING: 'initializing',
  READY: 'ready',
  
  // Runtime states
  ACTIVE: 'active',
  PAUSED: 'paused',
  DEGRADED: 'degraded',
  RUNNING: 'running',  // Added for heartbeat integration
  
  // Termination states
  SHUTTING_DOWN: 'shutting_down',
  DESTROYED: 'destroyed',
  
  // Error states
  FAILED: 'failed',
  ZOMBIE: 'zombie'
};

/**
 * Resource limits configuration
 * @typedef {Object} ResourceLimits
 * @property {number} maxAgents - Maximum number of concurrent agents
 * @property {number} maxMemoryPerAgent - Maximum memory per agent (MB)
 * @property {number} maxTotalMemory - Maximum total memory for all agents (MB)
 * @property {number} maxCpuPerAgent - Maximum CPU percent per agent
 * @property {number} maxParallelSpawns - Maximum parallel spawn operations
 * @property {number} spawnTimeout - Timeout for spawn operations (ms)
 * @property {number} gracefulShutdownTimeout - Timeout for graceful shutdown (ms)
 */

/**
 * Default resource limits
 * @type {ResourceLimits}
 */
export const DEFAULT_RESOURCE_LIMITS = {
  maxAgents: 50,
  maxMemoryPerAgent: 512, // MB
  maxTotalMemory: 4096,   // MB (4GB)
  maxCpuPerAgent: 50,     // percent
  maxParallelSpawns: 5,
  spawnTimeout: 30000,    // 30s
  gracefulShutdownTimeout: 60000 // 60s
};

/**
 * Client configuration for multi-client support
 * @typedef {Object} ClientConfig
 * @property {string} name - Client name (kimi, claude, codex)
 * @property {string} type - Client type (cli, desktop, vscode, app)
 * @property {Object} capabilities - Client capabilities
 * @property {number} weight - Load balancing weight
 * @property {boolean} healthy - Health status
 * @property {number} priority - Priority for selection (1-10)
 */

/**
 * Spawn record for tracking agent lifecycle
 * @typedef {Object} SpawnRecord
 * @property {string} agentId - Agent identifier
 * @property {string} cvId - CV template ID used
 * @property {LifecycleState} lifecycleState - Current lifecycle state
 * @property {ClientConfig} assignedClient - Assigned client
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} startedAt - Start timestamp
 * @property {Date} terminatedAt - Termination timestamp
 * @property {Object} resources - Resource usage
 * @property {Error} lastError - Last error encountered
 * @property {number} restartCount - Number of restarts
 * @property {string} [currentRunId] - Current heartbeat run ID (if any)
 */

/**
 * SpawnManager handles agent lifecycle, resource allocation, and client selection
 * @extends EventEmitter
 */
export class SpawnManager extends EventEmitter {
  /**
   * Create a new SpawnManager
   * @param {Object} options - Configuration options
   * @param {ResourceLimits} options.resourceLimits - Resource limits
   * @param {Array<ClientConfig>} options.clients - Available clients
   * @param {import('../runtime/heartbeat-service.js').HeartbeatService} [options.heartbeatService] - Heartbeat service
   * @param {import('../runtime/session-manager.js').SessionManager} [options.sessionManager] - Session manager
   */
  constructor(options = {}) {
    super();
    
    // Active agents storage
    this.agents = new Map();
    this.spawnRecords = new Map();
    
    // Resource management
    this.resourceLimits = { ...DEFAULT_RESOURCE_LIMITS, ...options.resourceLimits };
    this.currentResourceUsage = {
      agentCount: 0,
      totalMemory: 0,
      activeSpawns: 0
    };
    
    // Client management
    this.clients = new Map();
    this.clientFallbackChain = ['claude', 'kimi', 'codex'];
    this.runtimeManager = options.runtimeManager || null;
    this.initializeClients(options.clients);
    
    // Heartbeat runtime integration
    this.heartbeatService = options.heartbeatService || null;
    this.sessionManager = options.sessionManager || null;
    
    // Spawn queue for when limits are reached
    this.spawnQueue = [];
    
    // Monitoring
    this.monitorInterval = null;
    this.healthCheckInterval = options.healthCheckInterval || 10000; // 10s
    
    // Error recovery
    this.maxRestarts = options.maxRestarts || 3;
    this.restartWindow = options.restartWindow || 300000; // 5 minutes
    this.restartHistory = new Map();
    
    // Start monitoring
    this._startMonitoring();
  }
  
  /**
   * Initialize available clients
   * @private
   * @param {Array<ClientConfig>} clients - Client configurations
   */
  initializeClients(clients = []) {
    // Default client configurations
    const defaultClients = [
      {
        name: 'claude',
        type: 'cli',
        capabilities: {
          complexTasks: true,
          planning: true,
          extendedThinking: true,
          maxContextTokens: 200000,
          supportsStreaming: true,
          supportsVision: true
        },
        weight: 10,
        healthy: true,
        priority: 10
      },
      {
        name: 'kimi',
        type: 'cli',
        capabilities: {
          complexTasks: true,
          multimodal: true,
          swarmMode: true,
          maxContextTokens: 256000,
          supportsStreaming: true,
          supportsVision: true
        },
        weight: 10,
        healthy: true,
        priority: 9
      },
      {
        name: 'codex',
        type: 'cli',
        capabilities: {
          codeCompletion: true,
          inlineEdit: true,
          infilling: true,
          maxContextTokens: 128000,
          supportsStreaming: true,
          supportsVision: false
        },
        weight: 8,
        healthy: true,
        priority: 8
      }
    ];
    
    const clientConfigs = clients.length > 0 ? clients : defaultClients;
    
    for (const client of clientConfigs) {
      this.clients.set(client.name, {
        ...client,
        stats: {
          requests: 0,
          failures: 0,
          avgLatency: 0,
          lastUsed: null
        }
      });
    }
  }
  
  /**
   * Spawn a new agent from a CV (Curriculum Vitae)
   * @param {Object} cv - Agent CV template
   * @param {Object} options - Spawn options
   * @param {string} options.client - Preferred client
   * @param {Object} options.context - Initial context
   * @param {string} [options.heartbeatRunId] - Existing heartbeat run ID to associate
   * @returns {Promise<Agent>} Spawned agent
   */
  async spawnAgent(cv, options = {}) {
    // Check resource limits
    if (this.currentResourceUsage.agentCount >= this.resourceLimits.maxAgents) {
      throw new Error(`Maximum agent limit (${this.resourceLimits.maxAgents}) reached`);
    }
    
    if (this.currentResourceUsage.activeSpawns >= this.resourceLimits.maxParallelSpawns) {
      // Queue the spawn request
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const index = this.spawnQueue.findIndex(item => item.resolve === resolve);
          if (index > -1) {
            this.spawnQueue.splice(index, 1);
          }
          reject(new Error('Spawn queue timeout'));
        }, this.resourceLimits.spawnTimeout);
        
        this.spawnQueue.push({
          cv,
          options,
          resolve: (agent) => {
            clearTimeout(timeout);
            resolve(agent);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        });
        
        this.emit('spawnQueued', { cvId: cv.id, queueLength: this.spawnQueue.length });
      });
    }
    
    this.currentResourceUsage.activeSpawns++;
    
    try {
      return await this._executeSpawn(cv, options);
    } finally {
      this.currentResourceUsage.activeSpawns--;
      this._processSpawnQueue();
    }
  }
  
  /**
   * Execute the actual spawn operation
   * @private
   * @param {Object} cv - Agent CV
   * @param {Object} options - Spawn options
   * @returns {Promise<Agent>} Spawned agent
   */
  async _executeSpawn(cv, options) {
    const agentId = `${cv.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create spawn record
    const record = {
      agentId,
      cvId: cv.id,
      lifecycleState: LifecycleState.SPAWNING,
      assignedClient: null,
      createdAt: new Date(),
      startedAt: null,
      terminatedAt: null,
      resources: {
        memory: 0,
        cpu: 0
      },
      lastError: null,
      restartCount: 0,
      context: options.context || {},
      currentRunId: options.heartbeatRunId || null
    };
    
    this.spawnRecords.set(agentId, record);
    
    this.emit('spawnStarted', { agentId, cvId: cv.id });
    
    try {
      // Select optimal client
      const client = this.selectOptimalClient(options.task || {}, options.client);
      const assignedModel = this.resolveClientModel(options.task || {}, client.name);
      record.assignedClient = client;
      record.assignedModel = assignedModel;
      
      // Check client health
      if (!client.healthy) {
        throw new Error(`Selected client ${client.name} is unhealthy`);
      }
      
      // Update state
      record.lifecycleState = LifecycleState.INITIALIZING;
      
      // Resolve session if heartbeat runtime is available
      let sessionParams = null;
      let sessionDisplayId = null;
      
      if (this.sessionManager && options.task?.taskKey) {
        const sessionResolution = await this.sessionManager.resolveSessionForRun({
          agentId,
          taskKey: options.task.taskKey,
          provider: client.name,
          context: options.context,
          forceFresh: options.forceFreshSession
        });
        
        sessionParams = sessionResolution.sessionParams;
        sessionDisplayId = sessionResolution.sessionDisplayId;
        
        // Store session info in record
        record.sessionParams = sessionParams;
        record.sessionDisplayId = sessionDisplayId;
        record.sessionRotation = sessionResolution.rotationReason;
        record.sessionHandoff = sessionResolution.handoffMarkdown;
      }
      
      // Create agent instance
      const agent = new Agent(agentId, cv.type || 'generic', {
        config: {
          ...cv.capabilities,
          assignedClient: client.name,
          assignedModel,
          sessionParams,
          sessionDisplayId,
          executor: async (task) => this._executeWithRuntime(task, assignedModel, agentId)
        },
        maxErrors: cv.execution?.retryPolicy?.maxAttempts || 3
      });
      
      // Store agent
      this.agents.set(agentId, agent);
      this.currentResourceUsage.agentCount++;
      
      // Set up agent event handlers
      this._attachAgentHandlers(agent, record);
      
      // Initialize agent context
      if (options.context) {
        agent.context = { ...options.context };
      }
      
      // Mark as ready
      record.lifecycleState = LifecycleState.READY;
      record.startedAt = new Date();
      
      // Transition to active
      record.lifecycleState = LifecycleState.ACTIVE;
      
      // If there's a heartbeat run associated, start it
      if (options.heartbeatRunId && this.heartbeatService) {
        await this.heartbeatService.startRun(options.heartbeatRunId);
        record.currentRunId = options.heartbeatRunId;
      }
      
      this.emit('spawnCompleted', { agentId, client: client.name, sessionId: sessionDisplayId });
      
      return agent;
    } catch (error) {
      record.lifecycleState = LifecycleState.FAILED;
      record.lastError = error;
      
      this.emit('spawnFailed', { agentId, error: error.message });
      
      // Cleanup on failure
      await this._cleanupFailedSpawn(agentId);
      
      throw error;
    }
  }
  
  /**
   * Attach event handlers to an agent
   * @private
   * @param {Agent} agent - Agent instance
   * @param {SpawnRecord} record - Spawn record
   */
  _attachAgentHandlers(agent, record) {
    agent.on('taskStarted', async (event) => {
      this.emit('agentTaskStarted', { agentId: agent.id, ...event });
      
      // Update record state
      record.lifecycleState = LifecycleState.RUNNING;
      
      // Log to heartbeat if available
      if (this.heartbeatService && record.currentRunId) {
        await this.heartbeatService.appendRunEvent(record.currentRunId, {
          eventType: 'task',
          stream: 'system',
          level: 'info',
          message: `Task started: ${event.taskType || event.taskId}`,
          payload: { taskId: event.taskId, taskType: event.taskType }
        });
      }
    });
    
    agent.on('taskCompleted', async (event) => {
      this.emit('agentTaskCompleted', { agentId: agent.id, ...event });
      
      // Update client stats
      if (record.assignedClient) {
        const client = this.clients.get(record.assignedClient.name);
        if (client) {
          client.stats.requests++;
          client.stats.lastUsed = new Date();
        }
      }
      
      // Update session and complete heartbeat run
      await this._finalizeRun(agent.id, record, 'succeeded', event);
    });
    
    agent.on('taskFailed', async (event) => {
      this.emit('agentTaskFailed', { agentId: agent.id, ...event });
      
      // Update client stats
      if (record.assignedClient) {
        const client = this.clients.get(record.assignedClient.name);
        if (client) {
          client.stats.failures++;
        }
      }
      
      // Fail heartbeat run
      await this._finalizeRun(agent.id, record, 'failed', event);
    });
    
    agent.on('terminated', (event) => {
      this._handleAgentTermination(agent.id, event.forced);
    });
    
    agent.on('errorRecovery', (event) => {
      this.emit('agentErrorRecovery', { agentId: agent.id, ...event });
      
      // Attempt restart if needed
      if (event.errorCount >= 3) {
        this._attemptAgentRestart(agent.id, record);
      }
    });
  }
  
  /**
   * Finalize a heartbeat run
   * @private
   * @param {string} agentId - Agent ID
   * @param {SpawnRecord} record - Spawn record
   * @param {string} status - Run status
   * @param {Object} event - Completion event
   */
  async _finalizeRun(agentId, record, status, event) {
    if (!this.heartbeatService || !record.currentRunId) return;
    
    try {
      if (status === 'succeeded') {
        // Extract usage from event if available
        const usage = event.usage || {};
        
        await this.heartbeatService.completeRun(record.currentRunId, {
          resultJson: event.result,
          exitCode: 0,
          sessionIdAfter: record.sessionDisplayId,
          usage
        });
        
        // Update session with successful completion
        if (this.sessionManager && record.sessionParams) {
          await this.sessionManager.setSession({
            agentId,
            taskKey: record.context?.taskKey,
            provider: record.assignedClient?.name,
            sessionParams: record.sessionParams,
            sessionDisplayId: record.sessionDisplayId,
            lastRunId: record.currentRunId,
            lastError: null,
            usage
          });
        }
      } else {
        await this.heartbeatService.failRun(
          record.currentRunId,
          event.error || 'Task failed',
          'adapter_failed'
        );
        
        // Update session with error
        if (this.sessionManager && record.sessionParams) {
          await this.sessionManager.setSession({
            agentId,
            taskKey: record.context?.taskKey,
            provider: record.assignedClient?.name,
            sessionParams: record.sessionParams,
            sessionDisplayId: record.sessionDisplayId,
            lastRunId: record.currentRunId,
            lastError: event.error
          });
        }
      }
      
      // Clear current run
      record.currentRunId = null;
      record.lifecycleState = LifecycleState.ACTIVE;
      
    } catch (error) {
      this.emit('heartbeatError', { agentId, error: error.message, runId: record.currentRunId });
    }
  }
  
  /**
   * Start a heartbeat run for an agent
   * @param {string} agentId - Agent ID
   * @param {Object} options - Run options
   * @param {string} options.taskKey - Task identifier
   * @param {Object} [options.context] - Execution context
   * @returns {Promise<Object|null>} Created run or null
   */
  async startHeartbeatRun(agentId, options) {
    if (!this.heartbeatService) return null;
    
    const agent = this.agents.get(agentId);
    const record = this.spawnRecords.get(agentId);
    if (!agent || !record) return null;
    
    const run = await this.heartbeatService.createRun({
      agentId,
      invocationSource: options.invocationSource || 'on_demand',
      triggerDetail: options.triggerDetail || 'manual',
      contextSnapshot: {
        ...options.context,
        taskKey: options.taskKey,
        agentType: record.cvId
      },
      sessionIdBefore: record.sessionDisplayId
    });
    
    record.currentRunId = run.id;
    
    return run;
  }
  
  /**
   * Cancel the current heartbeat run for an agent
   * @param {string} agentId - Agent ID
   * @param {string} [reason] - Cancellation reason
   * @returns {Promise<boolean>} True if cancelled
   */
  async cancelHeartbeatRun(agentId, reason) {
    if (!this.heartbeatService) return false;
    
    const record = this.spawnRecords.get(agentId);
    if (!record || !record.currentRunId) return false;
    
    const cancelled = await this.heartbeatService.cancelRun(record.currentRunId, reason);
    if (cancelled) {
      record.currentRunId = null;
      record.lifecycleState = LifecycleState.ACTIVE;
    }
    
    return !!cancelled;
  }
  
  /**
   * Select optimal client for a task
   * @param {Object} task - Task description
   * @param {string} [preferredClient] - Preferred client name
   * @returns {ClientConfig} Selected client
   */
  selectOptimalClient(task, preferredClient) {
    // Use preferred client if specified and healthy
    if (preferredClient && this.clients.has(preferredClient)) {
      const client = this.clients.get(preferredClient);
      if (client.healthy) {
        return client;
      }
    }
    
    // Task-based selection
    if (task.complexity > 8) {
      const claude = this.clients.get('claude');
      if (claude?.healthy) return claude;
    }
    
    if (task.type === 'completion' || task.type === 'inline_edit') {
      const codex = this.clients.get('codex');
      if (codex?.healthy) return codex;
    }
    
    if (task.multimodal || task.type === 'image_analysis') {
      const kimi = this.clients.get('kimi');
      if (kimi?.healthy) return kimi;
    }
    
    if (task.type === 'planning' || task.requiresPlanning) {
      const claude = this.clients.get('claude');
      if (claude?.healthy) return claude;
    }
    
    // Fallback to load balancer selection
    return this._getBestAvailableClient();
  }
  
  /**
   * Get best available client using load balancing
   * @private
   * @returns {ClientConfig} Best available client
   */
  _getBestAvailableClient() {
    const available = Array.from(this.clients.values())
      .filter(c => c.healthy)
      .sort((a, b) => {
        // Sort by priority, then by failure rate
        const aFailureRate = a.stats.requests > 0 ? a.stats.failures / a.stats.requests : 0;
        const bFailureRate = b.stats.requests > 0 ? b.stats.failures / b.stats.requests : 0;
        
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return aFailureRate - bFailureRate;
      });
    
    if (available.length === 0) {
      throw new Error('No healthy clients available');
    }
    
    // Weighted random selection among top candidates
    const candidates = available.slice(0, 3);
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const client of candidates) {
      random -= client.weight;
      if (random <= 0) {
        return client;
      }
    }
    
    return candidates[0];
  }
  
  /**
   * Get fallback client chain
   * @param {string} primaryClient - Primary client name
   * @returns {Array<ClientConfig>} Fallback chain
   */
  getFallbackChain(primaryClient) {
    const chain = [];
    
    // Add remaining clients in priority order
    const ordered = this.clientFallbackChain.filter(c => c !== primaryClient);
    
    for (const clientName of [primaryClient, ...ordered]) {
      const client = this.clients.get(clientName);
      if (client && client.healthy) {
        chain.push(client);
      }
    }
    
    return chain;
  }

  /**
   * Resolve the canonical model id for a selected client.
   * @param {Object} task - Task metadata
   * @param {string} clientName - Selected client name
   * @returns {string|null} Canonical model id
   */
  resolveClientModel(task, clientName) {
    if (clientName === 'codex') {
      const isComplex = (task.complexity || 0) >= 7 || (task.files?.length || 0) > 5;
      return isComplex ? 'gpt-5.4-codex' : 'gpt-5.3-codex';
    }

    if (clientName === 'kimi') {
      return 'kimi-k2-5';
    }

    if (clientName === 'claude') {
      return task.requiresPlanning || (task.complexity || 0) >= 9
        ? 'claude-opus-4-6'
        : 'claude-sonnet-4-6';
    }

    return null;
  }

  /**
   * Execute a task via the subscription runtime manager when available.
   * @private
   * @param {Object} task - Task to execute
   * @param {string} modelId - Canonical model id
   * @param {string} agentId - Agent ID for heartbeat tracking
   * @returns {Promise<any>} Execution result
   */
  async _executeWithRuntime(task, modelId, _agentId) {
    if (!this.runtimeManager || !modelId) {
      throw new Error(
        `No subscription runtime available for task ${task.id || 'unknown'} (model: ${modelId || 'unassigned'})`
      );
    }

    const preferredBinding = this.runtimeManager.getBinding?.(modelId) || resolveModelRuntime(modelId);
    const fallbackBindings = getModelRuntimeCandidates(modelId);
    const candidates = [];

    if (preferredBinding) {
      candidates.push(preferredBinding);
    }
    for (const binding of fallbackBindings) {
      const key = `${binding.provider}:${binding.mode}:${binding.clientModel}`;
      const seen = candidates.some((entry) => `${entry.provider}:${entry.mode}:${entry.clientModel}` === key);
      if (!seen) {
        candidates.push(binding);
      }
    }

    if (candidates.length === 0) {
      throw new Error(`No runtime binding defined for model ${modelId}`);
    }

    const runtimeTask = this._normalizeRuntimeTask(task);
    let lastError = null;

    for (const binding of candidates) {
      try {
        const client = await this.runtimeManager.getClient(binding);
        const result = await client.execute(runtimeTask, {
          context: task.context || task.payload?.context,
          cwd: task.cwd,
          files: runtimeTask.files,
          model: binding.clientModel,
          timeout: task.timeout
        });

        return {
          ...result,
          usage: result.usage || {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd
          }
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `Failed to initialize runtime client for model ${modelId}: ${lastError?.message || 'unknown error'}`
    );
  }

  /**
   * Normalize an orchestration task into the shape expected by provider clients.
   * @private
   * @param {Object} task - Task to normalize
   * @returns {Object} Normalized task
   */
  _normalizeRuntimeTask(task) {
    const payload = task.data || task.payload || {};
    const files = Array.isArray(task.files || payload.files)
      ? (task.files || payload.files).map((file) => {
          if (typeof file === 'string') {
            return file;
          }

          return file?.path || file?.name || JSON.stringify(file);
        })
      : undefined;

    return {
      ...payload,
      ...task,
      code: task.code || payload.code,
      description: task.description ||
        payload.description ||
        payload.content ||
        task.content ||
        `Execute ${task.type || 'task'}`,
      files,
      instructions: task.instructions || payload.instructions,
      language: task.language || payload.language
    };
  }
  
  /**
   * Pause an agent (suspend execution)
   * @param {string} agentId - Agent identifier
   * @returns {Promise<boolean>} True if paused
   */
  async pauseAgent(agentId) {
    const agent = this.agents.get(agentId);
    const record = this.spawnRecords.get(agentId);
    
    if (!agent || !record) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    if (record.lifecycleState !== LifecycleState.ACTIVE && 
        record.lifecycleState !== LifecycleState.RUNNING) {
      throw new Error(`Cannot pause agent in ${record.lifecycleState} state`);
    }
    
    record.lifecycleState = LifecycleState.PAUSED;
    
    this.emit('agentPaused', { agentId });
    
    return true;
  }
  
  /**
   * Resume a paused agent
   * @param {string} agentId - Agent identifier
   * @returns {Promise<boolean>} True if resumed
   */
  async resumeAgent(agentId) {
    const agent = this.agents.get(agentId);
    const record = this.spawnRecords.get(agentId);
    
    if (!agent || !record) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    if (record.lifecycleState !== LifecycleState.PAUSED) {
      throw new Error(`Cannot resume agent in ${record.lifecycleState} state`);
    }
    
    record.lifecycleState = LifecycleState.ACTIVE;
    
    this.emit('agentResumed', { agentId });
    
    return true;
  }
  
  /**
   * Gracefully terminate an agent
   * @param {string} agentId - Agent identifier
   * @param {Object} options - Termination options
   * @param {number} options.timeout - Grace period timeout
   * @returns {Promise<boolean>} True if terminated
   */
  async terminateAgent(agentId, options = {}) {
    const agent = this.agents.get(agentId);
    const record = this.spawnRecords.get(agentId);
    
    if (!agent || !record) {
      return false;
    }
    
    if (record.lifecycleState === LifecycleState.DESTROYED) {
      return true;
    }
    
    // Cancel any active heartbeat run
    if (record.currentRunId && this.heartbeatService) {
      await this.heartbeatService.cancelRun(record.currentRunId, 'Agent terminated');
    }
    
    record.lifecycleState = LifecycleState.SHUTTING_DOWN;
    
    this.emit('agentTerminating', { agentId });
    
    try {
      // Attempt graceful termination
      const timeout = options.timeout || this.resourceLimits.gracefulShutdownTimeout;
      
      await Promise.race([
        agent.terminate(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Termination timeout')), timeout)
        )
      ]);
      
      record.lifecycleState = LifecycleState.DESTROYED;
      record.terminatedAt = new Date();
      
      this._cleanupAgent(agentId);
      
      this.emit('agentTerminated', { agentId, graceful: true });
      
      return true;
    } catch (error) {
      // Force termination on timeout
      agent.forceTerminate();
      
      record.lifecycleState = LifecycleState.DESTROYED;
      record.terminatedAt = new Date();
      record.lastError = error;
      
      this._cleanupAgent(agentId);
      
      this.emit('agentTerminated', { agentId, graceful: false, error: error.message });
      
      return true;
    }
  }
  
  /**
   * Force terminate an agent immediately
   * @param {string} agentId - Agent identifier
   * @returns {boolean} True if terminated
   */
  forceTerminateAgent(agentId) {
    const agent = this.agents.get(agentId);
    const record = this.spawnRecords.get(agentId);
    
    if (!agent || !record) {
      return false;
    }
    
    // Cancel any active heartbeat run
    if (record.currentRunId && this.heartbeatService) {
      this.heartbeatService.cancelRun(record.currentRunId, 'Agent force terminated').catch(() => {});
    }
    
    agent.forceTerminate();
    
    record.lifecycleState = LifecycleState.DESTROYED;
    record.terminatedAt = new Date();
    
    this._cleanupAgent(agentId);
    
    this.emit('agentForceTerminated', { agentId });
    
    return true;
  }
  
  /**
   * Clean up agent resources
   * @private
   * @param {string} agentId - Agent identifier
   */
  _cleanupAgent(agentId) {
    this.agents.delete(agentId);
    this.currentResourceUsage.agentCount--;
    
    // Keep spawn record for history, but mark as destroyed
    const record = this.spawnRecords.get(agentId);
    if (record) {
      record.lifecycleState = LifecycleState.DESTROYED;
      record.currentRunId = null;
    }
  }
  
  /**
   * Clean up failed spawn
   * @private
   * @param {string} agentId - Agent identifier
   */
  async _cleanupFailedSpawn(agentId) {
    const agent = this.agents.get(agentId);
    
    if (agent) {
      try {
        agent.forceTerminate();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.agents.delete(agentId);
    }
    
    // Keep record for debugging
    const record = this.spawnRecords.get(agentId);
    if (record) {
      record.terminatedAt = new Date();
    }
  }
  
  /**
   * Handle agent termination event
   * @private
   * @param {string} agentId - Agent identifier
   * @param {boolean} forced - Whether termination was forced
   */
  _handleAgentTermination(agentId, forced) {
    const record = this.spawnRecords.get(agentId);
    
    if (record && record.lifecycleState !== LifecycleState.DESTROYED) {
      record.lifecycleState = LifecycleState.DESTROYED;
      record.terminatedAt = new Date();
      
      this._cleanupAgent(agentId);
      
      this.emit('agentTerminated', { agentId, forced });
    }
  }
  
  /**
   * Attempt to restart a failed agent
   * @private
   * @param {string} agentId - Agent identifier
   * @param {SpawnRecord} record - Spawn record
   */
  async _attemptAgentRestart(agentId, record) {
    // Check restart limits
    const restarts = this.restartHistory.get(agentId) || [];
    const recentRestarts = restarts.filter(r => Date.now() - r < this.restartWindow);
    
    if (recentRestarts.length >= this.maxRestarts) {
      record.lifecycleState = LifecycleState.ZOMBIE;
      this.emit('agentZombie', { agentId, reason: 'max_restarts_exceeded' });
      return;
    }
    
    // Record restart attempt
    recentRestarts.push(Date.now());
    this.restartHistory.set(agentId, recentRestarts);
    record.restartCount++;
    
    this.emit('agentRestarting', { agentId, attempt: record.restartCount });
    
    try {
      // Get original CV from record
      const cv = {
        id: record.cvId,
        type: 'generic',
        capabilities: {}
      };
      
      // Terminate old agent
      await this.terminateAgent(agentId, { timeout: 5000 });
      
      // Spawn new agent with same context
      const newAgent = await this.spawnAgent(cv, {
        client: record.assignedClient?.name,
        context: record.context
      });
      
      this.emit('agentRestarted', { 
        oldAgentId: agentId, 
        newAgentId: newAgent.id 
      });
    } catch (error) {
      this.emit('agentRestartFailed', { agentId, error: error.message });
    }
  }
  
  /**
   * Process pending spawn queue
   * @private
   */
  _processSpawnQueue() {
    while (
      this.spawnQueue.length > 0 &&
      this.currentResourceUsage.activeSpawns < this.resourceLimits.maxParallelSpawns
    ) {
      const request = this.spawnQueue.shift();
      
      this.spawnAgent(request.cv, request.options)
        .then(agent => request.resolve(agent))
        .catch(error => request.reject(error));
    }
  }
  
  /**
   * Start resource monitoring
   * @private
   */
  _startMonitoring() {
    this.monitorInterval = setInterval(() => {
      this._checkAgentHealth();
      this._updateResourceUsage();
    }, this.healthCheckInterval);

    if (typeof this.monitorInterval.unref === 'function') {
      this.monitorInterval.unref();
    }
  }
  
  /**
   * Check health of all agents
   * @private
   */
  _checkAgentHealth() {
    for (const [agentId, agent] of this.agents) {
      const record = this.spawnRecords.get(agentId);
      
      if (!record) continue;
      
      const isHealthy = agent.isHealthy();
      
      if (!isHealthy && (record.lifecycleState === LifecycleState.ACTIVE || 
                         record.lifecycleState === LifecycleState.RUNNING)) {
        record.lifecycleState = LifecycleState.DEGRADED;
        this.emit('agentDegraded', { agentId });
        
        // Attempt recovery
        this._attemptAgentRestart(agentId, record);
      }
    }
  }
  
  /**
   * Update resource usage statistics
   * @private
   */
  _updateResourceUsage() {
    // In a real implementation, this would query actual resource usage
    // For now, we estimate based on agent count
    this.currentResourceUsage.totalMemory = this.currentResourceUsage.agentCount * 64; // Estimate 64MB per agent
  }
  
  /**
   * Get agent status
   * @param {string} agentId - Agent identifier
   * @returns {Object} Agent status
   */
  getAgentStatus(agentId) {
    const agent = this.agents.get(agentId);
    const record = this.spawnRecords.get(agentId);
    
    if (!agent || !record) {
      return null;
    }
    
    return {
      ...agent.getStatus(),
      lifecycleState: record.lifecycleState,
      assignedClient: record.assignedClient?.name,
      assignedModel: record.assignedModel,
      restartCount: record.restartCount,
      uptime: record.startedAt ? Date.now() - record.startedAt : 0,
      currentRunId: record.currentRunId,
      sessionId: record.sessionDisplayId
    };
  }
  
  /**
   * Get all agent statuses
   * @returns {Array<Object>} All agent statuses
   */
  getAllAgentStatuses() {
    const statuses = [];
    
    for (const agentId of this.agents.keys()) {
      const status = this.getAgentStatus(agentId);
      if (status) {
        statuses.push(status);
      }
    }
    
    return statuses;
  }
  
  /**
   * Get spawn statistics
   * @returns {Object} Spawn statistics
   */
  getStats() {
    const allRecords = Array.from(this.spawnRecords.values());
    
    return {
      activeAgents: this.agents.size,
      totalSpawns: allRecords.length,
      byLifecycleState: allRecords.reduce((acc, r) => {
        acc[r.lifecycleState] = (acc[r.lifecycleState] || 0) + 1;
        return acc;
      }, {}),
      resourceUsage: { ...this.currentResourceUsage },
      resourceLimits: { ...this.resourceLimits },
      queueLength: this.spawnQueue.length,
      clientStats: Array.from(this.clients.entries()).map(([name, client]) => ({
        name,
        healthy: client.healthy,
        requests: client.stats.requests,
        failures: client.stats.failures
      })),
      heartbeatEnabled: !!this.heartbeatService,
      sessionManagerEnabled: !!this.sessionManager
    };
  }
  
  /**
   * Update client health status
   * @param {string} clientName - Client name
   * @param {boolean} healthy - Health status
   */
  setClientHealth(clientName, healthy) {
    const client = this.clients.get(clientName);
    
    if (client) {
      const wasHealthy = client.healthy;
      client.healthy = healthy;
      
      if (wasHealthy !== healthy) {
        this.emit('clientHealthChanged', { 
          client: clientName, 
          healthy,
          timestamp: new Date()
        });
      }
    }
  }
  
  /**
   * Dispose the spawn manager
   */
  async dispose() {
    // Stop monitoring
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    // Clear spawn queue
    for (const request of this.spawnQueue) {
      request.reject(new Error('Spawn manager disposed'));
    }
    this.spawnQueue = [];
    
    // Terminate all agents
    const terminationPromises = [];
    
    for (const agentId of this.agents.keys()) {
      terminationPromises.push(
        this.terminateAgent(agentId, { timeout: 5000 }).catch(() => {
          this.forceTerminateAgent(agentId);
        })
      );
    }
    
    await Promise.all(terminationPromises);

    if (this.runtimeManager?.shutdown) {
      await this.runtimeManager.shutdown();
    }
    
    this.agents.clear();
    this.spawnRecords.clear();
    this.clients.clear();
    this.restartHistory.clear();
    
    this.removeAllListeners();
  }
}

export default SpawnManager;
