/**
 * @fileoverview Agent Orchestrator - Multi-client task execution and coordination
 * @module bios/orchestrator
 */

import { EventEmitter } from 'events';
import { SpawnManager, LifecycleState } from './spawn-manager.js';

/**
 * Execution strategies
 * @readonly
 * @enum {string}
 */
export const ExecutionStrategy = {
  SINGLE: 'single',
  PARALLEL: 'parallel',
  CHAINED: 'chained',
  SWARM: 'swarm',
  PLAN: 'plan'
};

/**
 * Task priority levels
 * @readonly
 * @enum {number}
 */
export const TaskPriority = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
  BACKGROUND: 5
};

/**
 * Task states
 * @readonly
 * @enum {string}
 */
export const TaskState = {
  PENDING: 'pending',
  QUEUED: 'queued',
  ASSIGNED: 'assigned',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

/**
 * Task definition
 * @typedef {Object} Task
 * @property {string} id - Unique task identifier
 * @property {string} type - Task type
 * @property {Object} data - Task data/payload
 * @property {TaskPriority} priority - Task priority
 * @property {ExecutionStrategy} strategy - Execution strategy
 * @property {TaskState} state - Current state
 * @property {string} [assignedAgent] - Assigned agent ID
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} [startedAt] - Start timestamp
 * @property {Date} [completedAt] - Completion timestamp
 * @property {Object} [result] - Task result
 * @property {Error} [error] - Task error
 * @property {number} [timeout] - Task timeout (ms)
 * @property {number} [retryCount] - Number of retries
 * @property {number} [maxRetries] - Maximum retries
 */

/**
 * Chain step definition
 * @typedef {Object} ChainStep
 * @property {string} client - Client to use ('kimi', 'claude', 'codex', 'auto')
 * @property {string} task - Task type
 * @property {Object} [data] - Step data
 * @property {string} [inputFrom] - Input from previous step
 * @property {Function} [transform] - Transform function for input
 */

/**
 * Swarm agent configuration
 * @typedef {Object} SwarmAgentConfig
 * @property {string} role - Agent role in swarm
 * @property {string} [client] - Preferred client
 * @property {Object} [capabilities] - Required capabilities
 * @property {Object} [context] - Agent context
 */

/**
 * AgentOrchestrator - Main orchestration system for multi-client agent execution
 * @extends EventEmitter
 */
export class AgentOrchestrator extends EventEmitter {
  /**
   * Create a new AgentOrchestrator
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    super();
    
    // Spawn manager for agent lifecycle
    this.spawnManager = options.spawnManager instanceof SpawnManager
      ? options.spawnManager
      : new SpawnManager(options.spawnManager);
    
    // Active agents registry
    this.agents = new Map();
    
    // Task queue
    this.queue = [];
    this.tasks = new Map();
    
    // Execution strategies
    this.strategies = { ...ExecutionStrategy };
    
    // Configuration
    this.config = {
      defaultTimeout: options.defaultTimeout || 60000,
      maxConcurrentTasks: options.maxConcurrentTasks || 10,
      maxQueueSize: options.maxQueueSize || 100,
      autoRetry: options.autoRetry !== false,
      defaultMaxRetries: options.defaultMaxRetries || 2,
      ...options
    };
    
    // Running tasks tracking
    this.runningTasks = new Map();
    this.taskProcessorInterval = null;
    
    // Plan mode storage
    this.plans = new Map();
    
    // Swarm management
    this.swarms = new Map();
    
    // Set up spawn manager event forwarding
    this._setupEventForwarding();
    
    // Start task processor
    this._startTaskProcessor();
  }
  
  /**
   * Forward spawn manager events
   * @private
   */
  _setupEventForwarding() {
    const events = [
      'spawnStarted', 'spawnCompleted', 'spawnFailed', 'spawnQueued',
      'agentTaskStarted', 'agentTaskCompleted', 'agentTaskFailed',
      'agentPaused', 'agentResumed', 'agentTerminating', 'agentTerminated',
      'agentDegraded', 'agentRestarting', 'agentRestarted', 'agentZombie',
      'clientHealthChanged'
    ];
    
    for (const event of events) {
      this.spawnManager.on(event, (data) => this.emit(event, data));
    }
  }
  
  /**
   * Spawn a new agent from a CV
   * @param {Object} cv - Agent CV (Curriculum Vitae)
   * @param {Object} options - Spawn options
   * @param {string} options.client - Preferred client
   * @param {Object} options.context - Initial context
   * @returns {Promise<Agent>} Spawned agent
   */
  async spawnAgent(cv, options = {}) {
    const agent = await this.spawnManager.spawnAgent(cv, options);
    
    this.agents.set(agent.id, {
      agent,
      cv,
      spawnedAt: new Date(),
      tasksCompleted: 0,
      tasksFailed: 0
    });
    
    this.emit('agentSpawned', { 
      agentId: agent.id, 
      type: cv.type,
      client: options.client 
    });
    
    return agent;
  }
  
  /**
   * Delegate a task to a specific client
   * @param {Task} task - Task to delegate
   * @param {Object} options - Delegation options
   * @param {string} options.client - Target client ('claude', 'kimi', 'codex')
   * @param {TaskPriority} options.priority - Task priority
   * @param {number} options.timeout - Task timeout
   * @returns {Promise<Object>} Task result
   */
  async delegateTask(task, options = {}) {
    const taskId = task.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const taskDef = {
      id: taskId,
      type: task.type,
      data: task.data,
      priority: options.priority || TaskPriority.NORMAL,
      strategy: ExecutionStrategy.SINGLE,
      state: TaskState.PENDING,
      client: options.client,
      timeout: options.timeout || this.config.defaultTimeout,
      maxRetries: options.maxRetries || this.config.defaultMaxRetries,
      retryCount: 0,
      createdAt: new Date()
    };
    
    // Store task
    this.tasks.set(taskId, taskDef);
    
    // Check if we can execute immediately
    if (this.runningTasks.size < this.config.maxConcurrentTasks) {
      return this._executeSingleTask(taskDef);
    }
    
    // Queue the task
    return this._queueTask(taskDef);
  }
  
  /**
   * Execute tasks in parallel across multiple clients
   * @param {Array<Task>} tasks - Tasks to execute
   * @param {Object} options - Execution options
   * @param {Array<string>} options.clients - Specific clients to use
   * @param {string} options.aggregation - Result aggregation method ('merge', 'vote', 'first', 'all')
   * @returns {Promise<Object>} Aggregated results
   */
  async parallelExecution(tasks, options = {}) {
    const executionId = `parallel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.emit('parallelExecutionStarted', { 
      executionId, 
      taskCount: tasks.length 
    });
    
    // Determine clients to use
    const clients = options.clients || this._selectClientsForParallel(tasks.length);
    
    // Create task definitions
    const taskDefs = tasks.map((task, index) => ({
      id: `${executionId}-task-${index}`,
      type: task.type,
      data: task.data,
      priority: task.priority || TaskPriority.NORMAL,
      strategy: ExecutionStrategy.PARALLEL,
      state: TaskState.PENDING,
      client: clients[index % clients.length],
      timeout: task.timeout || this.config.defaultTimeout,
      executionId,
      createdAt: new Date()
    }));
    
    // Store tasks
    for (const taskDef of taskDefs) {
      this.tasks.set(taskDef.id, taskDef);
    }
    
    try {
      // Execute all tasks in parallel
      const results = await Promise.allSettled(
        taskDefs.map(taskDef => this._executeSingleTask(taskDef))
      );
      
      // Aggregate results
      const aggregated = this._aggregateResults(results, options.aggregation);
      
      this.emit('parallelExecutionCompleted', { 
        executionId, 
        results: aggregated 
      });
      
      return aggregated;
    } catch (error) {
      this.emit('parallelExecutionFailed', { 
        executionId, 
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * Execute tasks in a chain (sequential with handoff)
   * @param {Array<ChainStep>} steps - Chain steps
   * @param {Object} options - Chain options
   * @param {Object} options.initialData - Initial input data
   * @returns {Promise<Object>} Final result
   */
  async chainExecution(steps, options = {}) {
    const executionId = `chain-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.emit('chainExecutionStarted', { 
      executionId, 
      stepCount: steps.length 
    });
    
    let currentData = options.initialData || {};
    const stepResults = [];
    
    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        this.emit('chainStepStarted', { 
          executionId, 
          step: i + 1, 
          total: steps.length,
          client: step.client 
        });
        
        // Transform input if specified
        if (step.transform && typeof step.transform === 'function') {
          currentData = step.transform(currentData, stepResults);
        }
        
        // Create task for this step
        const task = {
          id: `${executionId}-step-${i}`,
          type: step.task,
          data: { ...step.data, input: currentData }
        };
        
        // Execute step
        const result = await this.delegateTask(task, {
          client: step.client === 'auto' ? undefined : step.client,
          priority: TaskPriority.HIGH
        });
        
        currentData = result;
        stepResults.push({
          step: i,
          client: step.client,
          task: step.task,
          result
        });
        
        this.emit('chainStepCompleted', { 
          executionId, 
          step: i + 1,
          result 
        });
      }
      
      const finalResult = {
        executionId,
        finalOutput: currentData,
        steps: stepResults
      };
      
      this.emit('chainExecutionCompleted', { executionId, result: finalResult });
      
      return finalResult;
    } catch (error) {
      this.emit('chainExecutionFailed', { 
        executionId, 
        step: stepResults.length + 1,
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * Execute using Kimi-style agent swarm
   * @param {Task} task - Main task
   * @param {Object} options - Swarm options
   * @param {Array<SwarmAgentConfig>} options.agents - Swarm agent configurations
   * @param {string} options.coordinator - Coordinator agent client
   * @returns {Promise<Object>} Swarm result
   */
  async swarmExecution(task, options = {}) {
    const swarmId = `swarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.emit('swarmExecutionStarted', { swarmId, task: task.type });
    
    // Default swarm configuration
    const defaultAgents = [
      { role: 'coordinator', client: 'kimi', capabilities: { planning: true } },
      { role: 'researcher', client: 'kimi', capabilities: { search: true } },
      { role: 'implementer', client: 'codex', capabilities: { coding: true } },
      { role: 'reviewer', client: 'claude', capabilities: { analysis: true } }
    ];
    
    const swarmAgents = options.agents || defaultAgents;
    
    // Spawn swarm agents
    const spawnedAgents = [];
    
    try {
      for (const agentConfig of swarmAgents) {
        const cv = {
          id: `swarm-${agentConfig.role}`,
          type: agentConfig.role,
          capabilities: agentConfig.capabilities || {}
        };
        
        const agent = await this.spawnAgent(cv, {
          client: agentConfig.client,
          context: {
            swarmId,
            role: agentConfig.role,
            ...agentConfig.context
          }
        });
        
        spawnedAgents.push({ agent, config: agentConfig });
      }
      
      this.swarms.set(swarmId, {
        id: swarmId,
        agents: spawnedAgents,
        task,
        state: 'running',
        createdAt: new Date()
      });
      
      // Phase 1: Coordinator creates plan
      this.emit('swarmPhase', { swarmId, phase: 'planning' });
      
      const coordinator = spawnedAgents.find(a => a.config.role === 'coordinator');
      const plan = await coordinator.agent.executeTask({
        id: `${swarmId}-plan`,
        type: 'create_plan',
        data: { task, agents: swarmAgents.map(a => a.config.role) }
      });
      
      // Phase 2: Parallel execution by agents
      this.emit('swarmPhase', { swarmId, phase: 'execution' });
      
      const subTasks = plan.subTasks || [];
      const swarmResults = await Promise.allSettled(
        subTasks.map(async (subTask, index) => {
          const agent = spawnedAgents.find(a => a.config.role === subTask.role) || 
                        spawnedAgents[index % spawnedAgents.length];
          
          return agent.agent.executeTask({
            id: `${swarmId}-subtask-${index}`,
            type: subTask.type,
            data: subTask.data
          });
        })
      );
      
      // Phase 3: Aggregation
      this.emit('swarmPhase', { swarmId, phase: 'aggregation' });
      
      const aggregated = this._aggregateSwarmResults(swarmResults);
      
      // Phase 4: Review
      this.emit('swarmPhase', { swarmId, phase: 'review' });
      
      const reviewer = spawnedAgents.find(a => a.config.role === 'reviewer');
      const review = await reviewer.agent.executeTask({
        id: `${swarmId}-review`,
        type: 'review_results',
        data: { original: task, results: aggregated, plan }
      });
      
      const result = {
        swarmId,
        plan,
        results: aggregated,
        review
      };
      
      this.emit('swarmExecutionCompleted', { swarmId, result });
      
      return result;
    } catch (error) {
      this.emit('swarmExecutionFailed', { swarmId, error: error.message });
      throw error;
    } finally {
      // Cleanup swarm agents
      for (const { agent } of spawnedAgents) {
        await this.terminateAgent(agent.id);
      }
      
      this.swarms.delete(swarmId);
    }
  }
  
  /**
   * Execute using Claude-style plan mode
   * @param {Task} task - Task to execute
   * @param {Object} options - Plan mode options
   * @param {string} [options.plan] - Pre-defined plan
   * @param {boolean} options.requireApproval - Require approval for each step
   * @returns {Promise<Object>} Execution result with plan
   */
  async planModeExecution(task, options = {}) {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.emit('planModeStarted', { planId, task: task.type });
    
    // Spawn planning agent (prefer Claude for plan mode)
    const cv = {
      id: 'planner',
      type: 'planner',
      capabilities: { planning: true, extendedThinking: true }
    };
    
    const agent = await this.spawnAgent(cv, { client: 'claude' });
    
    try {
      // Step 1: Create or use provided plan
      let plan;
      
      if (options.plan) {
        plan = options.plan;
      } else {
        this.emit('planModeCreating', { planId });
        
        const planResult = await agent.executeTask({
          id: `${planId}-create`,
          type: 'create_detailed_plan',
          data: task
        });
        
        plan = planResult.plan;
      }
      
      this.plans.set(planId, {
        id: planId,
        plan,
        task,
        state: 'created',
        steps: plan.steps || [],
        currentStep: 0,
        results: [],
        createdAt: new Date()
      });
      
      this.emit('planModeCreated', { planId, steps: plan.steps.length });
      
      // Step 2: Execute plan
      const planState = this.plans.get(planId);
      planState.state = 'executing';
      
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        planState.currentStep = i;
        
        this.emit('planModeStep', { 
          planId, 
          step: i + 1, 
          total: plan.steps.length,
          description: step.description 
        });
        
        // Check for approval if required
        if (options.requireApproval) {
          // In a real implementation, this would wait for external approval
          // For now, we auto-approve
          this.emit('planModeAwaitingApproval', { planId, step: i + 1 });
        }
        
        // Execute step
        const stepResult = await agent.executeTask({
          id: `${planId}-step-${i}`,
          type: step.type || 'execute',
          data: { ...step.data, previousResults: planState.results }
        });
        
        planState.results.push({
          step: i,
          description: step.description,
          result: stepResult
        });
        
        this.emit('planModeStepCompleted', { planId, step: i + 1 });
      }
      
      // Step 3: Review
      this.emit('planModeReviewing', { planId });
      
      const review = await agent.executeTask({
        id: `${planId}-review`,
        type: 'review_execution',
        data: { 
          originalTask: task, 
          plan,
          results: planState.results 
        }
      });
      
      planState.state = 'completed';
      
      const result = {
        planId,
        plan,
        execution: planState.results,
        review,
        summary: review.summary || 'Plan execution completed'
      };
      
      this.emit('planModeCompleted', { planId, result });
      
      return result;
    } catch (error) {
      const planState = this.plans.get(planId);
      if (planState) {
        planState.state = 'failed';
        planState.error = error;
      }
      
      this.emit('planModeFailed', { planId, error: error.message });
      throw error;
    } finally {
      await this.terminateAgent(agent.id);
    }
  }
  
  /**
   * Monitor an agent's health
   * @param {string} agentId - Agent identifier
   * @returns {Object} Monitor handle
   */
  monitorAgent(agentId) {
    const agentInfo = this.agents.get(agentId);
    
    if (!agentInfo) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    const monitor = {
      agentId,
      startedAt: new Date(),
      checkInterval: null,
      
      start: (intervalMs = 5000) => {
        monitor.checkInterval = setInterval(async () => {
          const status = this.spawnManager.getAgentStatus(agentId);
          
          if (!status) {
            monitor.stop();
            return;
          }
          
          this.emit('agentMonitorCheck', { agentId, status });
          
          // Auto-restart on failure if configured
          if (!status.healthy && this.config.autoRetry) {
            this.emit('agentMonitorAlert', { 
              agentId, 
              status,
              action: 'triggering_restart'
            });
          }
        }, intervalMs);

        if (typeof monitor.checkInterval.unref === 'function') {
          monitor.checkInterval.unref();
        }
      },
      
      stop: () => {
        if (monitor.checkInterval) {
          clearInterval(monitor.checkInterval);
          monitor.checkInterval = null;
        }
      },
      
      getStatus: () => this.spawnManager.getAgentStatus(agentId)
    };
    
    monitor.start();
    
    return monitor;
  }
  
  /**
   * Terminate an agent gracefully
   * @param {string} agentId - Agent identifier
   * @returns {Promise<boolean>} True if terminated
   */
  async terminateAgent(agentId) {
    this.agents.delete(agentId);
    return this.spawnManager.terminateAgent(agentId);
  }
  
  /**
   * Execute a single task
   * @private
   * @param {Task} taskDef - Task definition
   * @returns {Promise<Object>} Task result
   */
  async _executeSingleTask(taskDef) {
    taskDef.state = TaskState.RUNNING;
    taskDef.startedAt = new Date();
    
    this.runningTasks.set(taskDef.id, taskDef);
    
    this.emit('taskStarted', { taskId: taskDef.id, type: taskDef.type });
    
    try {
      // Spawn or get agent
      const cv = {
        id: `agent-${taskDef.type}`,
        type: taskDef.type,
        capabilities: {}
      };
      
      const agent = await this.spawnManager.spawnAgent(cv, {
        client: taskDef.client,
        task: taskDef
      });
      
      taskDef.assignedAgent = agent.id;
      
      // Execute with timeout
      const timeout = taskDef.timeout || this.config.defaultTimeout;
      
      const result = await Promise.race([
        agent.executeTask({
          id: taskDef.id,
          type: taskDef.type,
          data: taskDef.data
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Task timeout')), timeout)
        )
      ]);
      
      taskDef.state = TaskState.COMPLETED;
      taskDef.completedAt = new Date();
      taskDef.result = result;
      
      this.runningTasks.delete(taskDef.id);
      
      this.emit('taskCompleted', { 
        taskId: taskDef.id, 
        duration: taskDef.completedAt - taskDef.startedAt 
      });
      
      // Clean up agent after task
      await this.spawnManager.terminateAgent(agent.id);
      
      return result;
    } catch (error) {
      taskDef.state = TaskState.FAILED;
      taskDef.error = error;
      taskDef.retryCount++;
      
      this.runningTasks.delete(taskDef.id);
      
      this.emit('taskFailed', { taskId: taskDef.id, error: error.message });
      
      // Retry if configured
      if (taskDef.retryCount < taskDef.maxRetries && this.config.autoRetry) {
        this.emit('taskRetrying', { 
          taskId: taskDef.id, 
          attempt: taskDef.retryCount + 1 
        });
        
        // Try with fallback client
        const fallbackChain = this.spawnManager.getFallbackChain(taskDef.client);
        if (fallbackChain.length > 1) {
          taskDef.client = fallbackChain[1].name;
        }
        
        return this._executeSingleTask(taskDef);
      }
      
      throw error;
    }
  }
  
  /**
   * Queue a task for later execution
   * @private
   * @param {Task} taskDef - Task definition
   * @returns {Promise<Object>} Task result
   */
  _queueTask(taskDef) {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error('Task queue is full');
    }
    
    taskDef.state = TaskState.QUEUED;
    
    // Insert based on priority
    const insertIndex = this.queue.findIndex(t => t.priority > taskDef.priority);
    if (insertIndex === -1) {
      this.queue.push(taskDef);
    } else {
      this.queue.splice(insertIndex, 0, taskDef);
    }
    
    this.emit('taskQueued', { 
      taskId: taskDef.id, 
      queuePosition: insertIndex === -1 ? this.queue.length - 1 : insertIndex 
    });
    
    // Return promise that resolves when task completes
    return new Promise((resolve, reject) => {
      taskDef._resolve = resolve;
      taskDef._reject = reject;
    });
  }
  
  /**
   * Start the task processor
   * @private
   */
  _startTaskProcessor() {
    if (this.taskProcessorInterval) {
      clearInterval(this.taskProcessorInterval);
    }

    this.taskProcessorInterval = setInterval(() => {
      this._processQueue();
    }, 100);

    if (typeof this.taskProcessorInterval.unref === 'function') {
      this.taskProcessorInterval.unref();
    }
  }
  
  /**
   * Process queued tasks
   * @private
   */
  _processQueue() {
    while (
      this.queue.length > 0 &&
      this.runningTasks.size < this.config.maxConcurrentTasks
    ) {
      const task = this.queue.shift();
      
      this._executeSingleTask(task)
        .then(result => {
          if (task._resolve) task._resolve(result);
        })
        .catch(error => {
          if (task._reject) task._reject(error);
        });
    }
  }
  
  /**
   * Select clients for parallel execution
   * @private
   * @param {number} count - Number of clients needed
   * @returns {Array<string>} Client names
   */
  _selectClientsForParallel(count) {
    const healthy = Array.from(this.spawnManager.clients.values())
      .filter(c => c.healthy)
      .sort((a, b) => b.weight - a.weight);
    
    const clients = [];
    for (let i = 0; i < count; i++) {
      clients.push(healthy[i % healthy.length].name);
    }
    return clients;
  }
  
  /**
   * Aggregate parallel results
   * @private
   * @param {Array<PromiseSettledResult>} results - Raw results
   * @param {string} method - Aggregation method
   * @returns {Object} Aggregated results
   */
  _aggregateResults(results, method = 'all') {
    const successful = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    
    const failed = results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason);
    
    switch (method) {
      case 'first':
        return successful[0] || null;
        
      case 'merge':
        return successful.reduce((acc, r) => ({ ...acc, ...r }), {});
        
      case 'vote':
        // Simple majority voting for string results
        const votes = {};
        for (const r of successful) {
          const key = JSON.stringify(r);
          votes[key] = (votes[key] || 0) + 1;
        }
        const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
        return winner ? JSON.parse(winner[0]) : null;
        
      case 'all':
      default:
        return {
          results: successful,
          failed: failed.map(f => f.message),
          summary: {
            total: results.length,
            successful: successful.length,
            failed: failed.length
          }
        };
    }
  }
  
  /**
   * Aggregate swarm results
   * @private
   * @param {Array<PromiseSettledResult>} results - Swarm results
   * @returns {Object} Aggregated results
   */
  _aggregateSwarmResults(results) {
    const successful = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    
    return {
      outputs: successful,
      merged: successful.reduce((acc, r) => {
        if (typeof r === 'object') {
          return { ...acc, ...r };
        }
        return acc;
      }, {}),
      summary: {
        total: results.length,
        successful: successful.length,
        failed: results.length - successful.length
      }
    };
  }
  
  /**
   * Get orchestrator status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      agents: {
        active: this.agents.size,
        statuses: this.spawnManager.getAllAgentStatuses()
      },
      tasks: {
        pending: this.queue.length,
        running: this.runningTasks.size,
        total: this.tasks.size
      },
      swarms: {
        active: this.swarms.size,
        ids: Array.from(this.swarms.keys())
      },
      plans: {
        active: Array.from(this.plans.values()).filter(p => p.state === 'executing').length,
        total: this.plans.size
      },
      resources: this.spawnManager.getStats()
    };
  }
  
  /**
   * Cancel a pending or running task
   * @param {string} taskId - Task identifier
   * @returns {boolean} True if cancelled
   */
  cancelTask(taskId) {
    // Check queue
    const queueIndex = this.queue.findIndex(t => t.id === taskId);
    if (queueIndex > -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.state = TaskState.CANCELLED;
      if (task._reject) {
        task._reject(new Error('Task cancelled'));
      }
      this.emit('taskCancelled', { taskId });
      return true;
    }
    
    // Check running
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      // Signal cancellation (implementation depends on agent support)
      runningTask.state = TaskState.CANCELLED;
      this.runningTasks.delete(taskId);
      this.emit('taskCancelled', { taskId });
      return true;
    }
    
    return false;
  }
  
  /**
   * Dispose the orchestrator
   */
  async dispose() {
    if (this.taskProcessorInterval) {
      clearInterval(this.taskProcessorInterval);
      this.taskProcessorInterval = null;
    }

    // Cancel all pending tasks
    for (const task of [...this.queue]) {
      this.cancelTask(task.id);
    }
    
    // Wait for running tasks
    const runningIds = Array.from(this.runningTasks.keys());
    
    // Give running tasks a chance to complete
    if (runningIds.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Terminate all agents
    for (const agentId of this.agents.keys()) {
      await this.terminateAgent(agentId);
    }
    
    // Dispose spawn manager
    await this.spawnManager.dispose();
    
    this.removeAllListeners();
  }
}

export default AgentOrchestrator;
