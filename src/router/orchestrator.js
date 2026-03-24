/**
 * @fileoverview Multi-Model Orchestrator with multiple execution modes.
 * Supports SINGLE, PARALLEL, CHAINED, SWARM, PLAN, and COWORK modes.
 * @module router/orchestrator
 */

import { EventEmitter } from 'events';
import { ModelRouter } from './model-router.js';

/**
 * Orchestration modes
 */
export const ORCHESTRATION_MODES = {
  SINGLE: 'single',       // One model execution
  PARALLEL: 'parallel',   // Multiple models simultaneously
  CHAINED: 'chained',     // Sequential execution
  SWARM: 'swarm',         // Agent swarm execution
  PLAN: 'plan',           // Planned execution
  COWORK: 'cowork'        // Collaborative work
};

/**
 * @typedef {Object} OrchestrationTask
 * @property {string} id - Task identifier
 * @property {string} mode - Orchestration mode
 * @property {Object} payload - Task payload
 * @property {string[]} [models] - Specific models to use
 * @property {number} [timeout] - Task timeout
 * @property {Object} [options] - Mode-specific options
 */

/**
 * @typedef {Object} OrchestrationResult
 * @property {string} id - Execution ID
 * @property {string} mode - Orchestration mode
 * @property {string} status - Execution status
 * @property {Object[]} results - Individual results
 * @property {Object} [aggregated] - Aggregated result
 * @property {number} duration - Execution duration
 * @property {Error} [error] - Error if failed
 */

/**
 * @typedef {Object} SwarmConfig
 * @property {number} count - Number of agents
 * @property {string} [strategy] - Aggregation strategy (best, majority, average)
 * @property {number} [diversity] - Diversity factor (0-1)
 */

/**
 * @typedef {Object} ExecutionPlan
 * @property {string} id - Plan ID
 * @property {PlanStep[]} steps - Plan steps
 * @property {Object} [variables] - Plan variables
 */

/**
 * @typedef {Object} PlanStep
 * @property {number} order - Step order
 * @property {string} action - Step action
 * @property {string[]} [dependsOn] - Dependencies
 * @property {Object} [config] - Step configuration
 */

/**
 * Multi-Model Orchestrator for complex execution patterns
 * @extends EventEmitter
 */
export class Orchestrator extends EventEmitter {
  /**
   * Creates an instance of Orchestrator
   * @param {Object} options - Orchestrator configuration
   * @param {ModelRouter} options.router - Model router instance
   * @param {number} options.defaultTimeout - Default task timeout
   * @param {boolean} options.enableMetrics - Enable metrics collection
   */
  constructor(options = {}) {
    super();
    
    this.router = options.router || new ModelRouter();
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.enableMetrics = options.enableMetrics ?? true;
    
    /** @type {Map<string, OrchestrationResult>} */
    this.activeExecutions = new Map();
    
    /** @type {Object} */
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      avgDuration: 0
    };
    
    this.initialized = false;
  }
  
  /**
   * Initialize the orchestrator
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;
    
    if (!this.router.initialized) {
      await this.router.initialize();
    }
    
    this.initialized = true;
    this.emit('initialized');
  }
  
  /**
   * Execute task with single model
   * @param {OrchestrationTask} task - Task definition
   * @returns {Promise<OrchestrationResult>} Execution result
   */
  async executeSingle(task) {
    const startTime = Date.now();
    const executionId = `single-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.emit('executionStarted', { id: executionId, mode: ORCHESTRATION_MODES.SINGLE });
    
    try {
      // Route task to best model
      const route = await this.router.routeTask(task.payload);
      
      // Execute on selected model
      const result = await this.router.executeOnModel(task.payload, route);
      
      const executionResult = {
        id: executionId,
        mode: ORCHESTRATION_MODES.SINGLE,
        status: 'completed',
        results: [result],
        duration: Date.now() - startTime,
        modelUsed: route.modelId
      };
      
      this.updateMetrics(executionResult);
      this.emit('executionComplete', executionResult);
      
      return executionResult;
    } catch (error) {
      const failedResult = {
        id: executionId,
        mode: ORCHESTRATION_MODES.SINGLE,
        status: 'failed',
        results: [],
        duration: Date.now() - startTime,
        error: error.message
      };
      
      this.updateMetrics(failedResult, true);
      this.emit('executionFailed', failedResult);
      
      throw error;
    }
  }
  
  /**
   * Execute tasks in parallel across multiple models
   * @param {OrchestrationTask[]} tasks - Array of tasks
   * @param {Object} options - Parallel options
   * @param {number} options.concurrency - Max concurrent executions
   * @param {string} options.aggregationStrategy - How to aggregate results
   * @returns {Promise<OrchestrationResult>} Execution result
   */
  async executeParallel(tasks, options = {}) {
    const startTime = Date.now();
    const executionId = `parallel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const concurrency = options.concurrency || 3;
    
    this.emit('executionStarted', { 
      id: executionId, 
      mode: ORCHESTRATION_MODES.PARALLEL,
      taskCount: tasks.length 
    });
    
    const results = [];
    const errors = [];
    
    // Process in batches
    for (let i = 0; i < tasks.length; i += concurrency) {
      const batch = tasks.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (task) => {
        try {
          const route = await this.router.routeTask(task.payload);
          const result = await this.router.executeOnModel(task.payload, route);
          return { success: true, taskId: task.id, result };
        } catch (error) {
          return { success: false, taskId: task.id, error: error.message };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const outcome of batchResults) {
        if (outcome.status === 'fulfilled') {
          if (outcome.value.success) {
            results.push(outcome.value.result);
          } else {
            errors.push(outcome.value);
          }
        } else {
          errors.push({ error: outcome.reason?.message || 'Unknown error' });
        }
      }
    }
    
    const executionResult = {
      id: executionId,
      mode: ORCHESTRATION_MODES.PARALLEL,
      status: errors.length === 0 ? 'completed' : (results.length > 0 ? 'partial' : 'failed'),
      results,
      errors: errors.length > 0 ? errors : undefined,
      duration: Date.now() - startTime,
      aggregated: options.aggregationStrategy ? 
        this.aggregateResults(results, options.aggregationStrategy) : undefined
    };
    
    this.updateMetrics(executionResult, executionResult.status === 'failed');
    this.emit('executionComplete', executionResult);
    
    return executionResult;
  }
  
  /**
   * Execute tasks in chain (sequential)
   * @param {OrchestrationTask[]} tasks - Array of tasks
   * @param {Object} options - Chain options
   * @param {boolean} options.stopOnError - Stop on first error
   * @param {boolean} options.passContext - Pass context between tasks
   * @returns {Promise<OrchestrationResult>} Execution result
   */
  async executeChain(tasks, options = {}) {
    const startTime = Date.now();
    const executionId = `chain-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const stopOnError = options.stopOnError ?? true;
    const passContext = options.passContext ?? true;
    
    this.emit('executionStarted', { 
      id: executionId, 
      mode: ORCHESTRATION_MODES.CHAINED,
      taskCount: tasks.length 
    });
    
    const results = [];
    let context = {};
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      try {
        // Add context to payload if enabled
        if (passContext && i > 0) {
          task.payload.context = {
            ...task.payload.context,
            previousResults: results.slice(-3), // Last 3 results
            chainPosition: i,
            totalSteps: tasks.length
          };
        }
        
        const route = await this.router.routeTask(task.payload);
        const result = await this.router.executeOnModel(task.payload, route);
        
        results.push({
          step: i,
          taskId: task.id,
          ...result
        });
        
        // Store context for next step
        if (passContext) {
          context.lastResult = result.result;
          context.step = i;
        }
        
        this.emit('chainStepComplete', { 
          executionId, 
          step: i, 
          totalSteps: tasks.length 
        });
      } catch (error) {
        results.push({
          step: i,
          taskId: task.id,
          error: error.message,
          failed: true
        });
        
        if (stopOnError) {
          const executionResult = {
            id: executionId,
            mode: ORCHESTRATION_MODES.CHAINED,
            status: 'failed',
            results,
            completedSteps: i,
            totalSteps: tasks.length,
            duration: Date.now() - startTime,
            error: error.message
          };
          
          this.updateMetrics(executionResult, true);
          this.emit('executionFailed', executionResult);
          
          if (options.throwOnError) {
            throw error;
          }
          return executionResult;
        }
      }
    }
    
    const executionResult = {
      id: executionId,
      mode: ORCHESTRATION_MODES.CHAINED,
      status: 'completed',
      results,
      completedSteps: results.length,
      totalSteps: tasks.length,
      duration: Date.now() - startTime
    };
    
    this.updateMetrics(executionResult);
    this.emit('executionComplete', executionResult);
    
    return executionResult;
  }
  
  /**
   * Execute task with agent swarm
   * @param {OrchestrationTask} task - Base task
   * @param {SwarmConfig} config - Swarm configuration
   * @returns {Promise<OrchestrationResult>} Execution result
   */
  async executeSwarm(task, config) {
    const startTime = Date.now();
    const executionId = `swarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const count = config.count || 5;
    const strategy = config.strategy || 'majority';
    
    this.emit('executionStarted', { 
      id: executionId, 
      mode: ORCHESTRATION_MODES.SWARM,
      agentCount: count 
    });
    
    // Create varied tasks for diversity
    const swarmTasks = this.createSwarmTasks(task, count, config.diversity || 0.3);
    
    // Execute all swarm agents in parallel
    const promises = swarmTasks.map(async (swarmTask, index) => {
      try {
        // Add slight delay for staggered starts
        if (index > 0) {
          await new Promise(r => setTimeout(r, index * 100));
        }
        
        const route = await this.router.routeTask(swarmTask.payload);
        const result = await this.router.executeOnModel(swarmTask.payload, route);
        
        return {
          agentId: index,
          modelId: route.modelId,
          ...result
        };
      } catch (error) {
        return {
          agentId: index,
          error: error.message,
          failed: true
        };
      }
    });
    
    const swarmResults = await Promise.all(promises);
    
    // Filter successful results
    const successfulResults = swarmResults.filter(r => !r.failed);
    
    // Aggregate based on strategy
    let aggregated;
    if (successfulResults.length > 0) {
      aggregated = this.aggregateSwarmResults(successfulResults, strategy);
    }
    
    const executionResult = {
      id: executionId,
      mode: ORCHESTRATION_MODES.SWARM,
      status: successfulResults.length > count / 2 ? 'completed' : 'partial',
      results: swarmResults,
      aggregated,
      swarmStats: {
        totalAgents: count,
        successfulAgents: successfulResults.length,
        failedAgents: count - successfulResults.length,
        strategy
      },
      duration: Date.now() - startTime
    };
    
    this.updateMetrics(executionResult, successfulResults.length <= count / 2);
    this.emit('executionComplete', executionResult);
    
    return executionResult;
  }
  
  /**
   * Execute planned execution
   * @param {ExecutionPlan} plan - Execution plan
   * @param {Object} initialContext - Initial context
   * @returns {Promise<OrchestrationResult>} Execution result
   */
  async executePlan(plan, initialContext = {}) {
    const startTime = Date.now();
    const executionId = `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.emit('executionStarted', { 
      id: executionId, 
      mode: ORCHESTRATION_MODES.PLAN,
      stepCount: plan.steps.length 
    });
    
    const results = [];
    const context = { ...initialContext, ...plan.variables };
    const completedSteps = new Set();
    
    // Sort steps by order
    const sortedSteps = [...plan.steps].sort((a, b) => a.order - b.order);
    
    for (const step of sortedSteps) {
      // Check dependencies
      if (step.dependsOn) {
        const depsSatisfied = step.dependsOn.every(dep => completedSteps.has(dep));
        if (!depsSatisfied) {
          throw new Error(`Dependencies not satisfied for step ${step.order}`);
        }
      }
      
      try {
        const taskPayload = {
          ...step.config,
          context: { ...context, step: step.order }
        };
        
        const route = await this.router.routeTask(taskPayload);
        const result = await this.router.executeOnModel(taskPayload, route);
        
        results.push({
          step: step.order,
          action: step.action,
          ...result
        });
        
        // Update context with result
        if (step.config?.outputVariable) {
          context[step.config.outputVariable] = result.result;
        }
        
        completedSteps.add(step.order);
        
        this.emit('planStepComplete', { 
          executionId, 
          step: step.order,
          action: step.action
        });
      } catch (error) {
        results.push({
          step: step.order,
          action: step.action,
          error: error.message,
          failed: true
        });
        
        const executionResult = {
          id: executionId,
          mode: ORCHESTRATION_MODES.PLAN,
          status: 'failed',
          results,
          context,
          duration: Date.now() - startTime,
          error: error.message
        };
        
        this.updateMetrics(executionResult, true);
        this.emit('executionFailed', executionResult);
        
        return executionResult;
      }
    }
    
    const executionResult = {
      id: executionId,
      mode: ORCHESTRATION_MODES.PLAN,
      status: 'completed',
      results,
      finalContext: context,
      duration: Date.now() - startTime
    };
    
    this.updateMetrics(executionResult);
    this.emit('executionComplete', executionResult);
    
    return executionResult;
  }
  
  /**
   * Execute collaborative work (multiple models working together)
   * @param {OrchestrationTask[]} tasks - Collaborative tasks
   * @param {Object} options - Cowork options
   * @returns {Promise<OrchestrationResult>} Execution result
   */
  async executeCowork(tasks, options = {}) {
    const startTime = Date.now();
    const executionId = `cowork-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const rounds = options.rounds || 3;
    
    this.emit('executionStarted', { 
      id: executionId, 
      mode: ORCHESTRATION_MODES.COWORK,
      participantCount: tasks.length,
      rounds
    });
    
    const results = [];
    const sharedContext = { rounds: [] };
    
    for (let round = 0; round < rounds; round++) {
      const roundResults = [];
      
      // Each participant contributes in this round
      for (const task of tasks) {
        // Add shared context to task
        const enrichedPayload = {
          ...task.payload,
          context: {
            ...task.payload.context,
            sharedContext: sharedContext,
            round: round + 1,
            totalRounds: rounds,
            role: task.role || 'contributor'
          }
        };
        
        try {
          const route = await this.router.routeTask(enrichedPayload);
          const result = await this.router.executeOnModel(enrichedPayload, route);
          
          roundResults.push({
            round: round + 1,
            taskId: task.id,
            role: task.role,
            ...result
          });
        } catch (error) {
          roundResults.push({
            round: round + 1,
            taskId: task.id,
            role: task.role,
            error: error.message,
            failed: true
          });
        }
      }
      
      // Update shared context with this round's contributions
      sharedContext.rounds.push({
        round: round + 1,
        contributions: roundResults.filter(r => !r.failed).map(r => ({
          taskId: r.taskId,
          result: r.result
        }))
      });
      
      results.push(...roundResults);
      
      this.emit('coworkRoundComplete', { 
        executionId, 
        round: round + 1,
        totalRounds: rounds
      });
    }
    
    // Synthesize final result
    const finalSynthesis = await this.synthesizeCoworkResult(results, sharedContext);
    
    const executionResult = {
      id: executionId,
      mode: ORCHESTRATION_MODES.COWORK,
      status: 'completed',
      results,
      synthesis: finalSynthesis,
      sharedContext,
      duration: Date.now() - startTime
    };
    
    this.updateMetrics(executionResult);
    this.emit('executionComplete', executionResult);
    
    return executionResult;
  }
  
  /**
   * Create varied tasks for swarm execution
   * @param {OrchestrationTask} baseTask - Base task
   * @param {number} count - Number of variants
   * @param {number} diversity - Diversity factor
   * @returns {OrchestrationTask[]} Varied tasks
   * @private
   */
  createSwarmTasks(baseTask, count, diversity) {
    const variations = [
      'Focus on accuracy and precision.',
      'Consider edge cases thoroughly.',
      'Provide comprehensive analysis.',
      'Optimize for efficiency.',
      'Ensure code quality and best practices.',
      'Focus on maintainability.',
      'Consider scalability implications.',
      'Think about security aspects.'
    ];
    
    return Array.from({ length: count }, (_, i) => ({
      ...baseTask,
      id: `${baseTask.id}-agent-${i}`,
      payload: {
        ...baseTask.payload,
        content: diversity > 0 ? 
          `${baseTask.payload.content}\n\n[Agent ${i + 1} Focus: ${variations[i % variations.length]}]` :
          baseTask.payload.content
      }
    }));
  }
  
  /**
   * Aggregate results from multiple executions
   * @param {Object[]} results - Individual results
   * @param {string} strategy - Aggregation strategy
   * @returns {Object} Aggregated result
   * @private
   */
  aggregateResults(results, strategy) {
    switch (strategy) {
      case 'best':
        // Select result with highest confidence or quality
        return results.reduce((best, current) => {
          const bestScore = best.confidence || best.quality || 0;
          const currentScore = current.confidence || current.quality || 0;
          return currentScore > bestScore ? current : best;
        });
        
      case 'majority':
        // Simple majority voting for categorical results
        const counts = {};
        for (const result of results) {
          const key = JSON.stringify(result.result);
          counts[key] = (counts[key] || 0) + 1;
        }
        const majorityKey = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])[0]?.[0];
        return { result: JSON.parse(majorityKey), votes: counts[majorityKey] };
        
      case 'average':
        // Average numerical results
        const numericResults = results.filter(r => typeof r.result === 'number');
        if (numericResults.length === 0) return null;
        const sum = numericResults.reduce((acc, r) => acc + r.result, 0);
        return { result: sum / numericResults.length, count: numericResults.length };
        
      case 'concatenate':
        // Concatenate text results
        return { 
          result: results.map(r => r.result).filter(Boolean).join('\n\n---\n\n'),
          sources: results.length
        };
        
      default:
        return { results };
    }
  }
  
  /**
   * Aggregate swarm results
   * @param {Object[]} results - Swarm results
   * @param {string} strategy - Aggregation strategy
   * @returns {Object} Aggregated result
   * @private
   */
  aggregateSwarmResults(results, strategy) {
    return this.aggregateResults(results, strategy);
  }
  
  /**
   * Synthesize cowork result
   * @param {Object[]} results - All cowork results
   * @param {Object} sharedContext - Shared context
   * @returns {Promise<Object>} Synthesized result
   * @private
   */
  async synthesizeCoworkResult(results, sharedContext) {
    // For now, return a simple synthesis
    // In a full implementation, this could involve another model call
    const successfulResults = results.filter(r => !r.failed);
    
    return {
      summary: `Collaborative work completed with ${successfulResults.length} contributions across ${sharedContext.rounds.length} rounds.`,
      keyPoints: successfulResults
        .filter(r => r.round === sharedContext.rounds.length) // Last round
        .map(r => r.result),
      consensus: this.detectConsensus(successfulResults)
    };
  }
  
  /**
   * Detect consensus among results
   * @param {Object[]} results - Results to analyze
   * @returns {Object} Consensus analysis
   * @private
   */
  detectConsensus(results) {
    // Simple consensus detection - check for similar results
    const resultStrings = results.map(r => JSON.stringify(r.result));
    const uniqueResults = [...new Set(resultStrings)];
    
    return {
      totalResults: results.length,
      uniquePositions: uniqueResults.length,
      consensusLevel: uniqueResults.length === 1 ? 'full' : 
                      uniqueResults.length <= results.length / 2 ? 'partial' : 'none'
    };
  }
  
  /**
   * Update execution metrics
   * @param {OrchestrationResult} result - Execution result
   * @param {boolean} failed - Whether execution failed
   * @private
   */
  updateMetrics(result, failed = false) {
    if (!this.enableMetrics) return;
    
    this.metrics.totalExecutions++;
    
    if (failed) {
      this.metrics.failedExecutions++;
    } else {
      this.metrics.successfulExecutions++;
    }
    
    this.metrics.avgDuration = 
      (this.metrics.avgDuration * (this.metrics.totalExecutions - 1) + result.duration) / 
      this.metrics.totalExecutions;
  }
  
  /**
   * Get orchestrator metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalExecutions > 0 ? 
        this.metrics.successfulExecutions / this.metrics.totalExecutions : 0,
      activeExecutions: this.activeExecutions.size
    };
  }
  
  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      avgDuration: 0
    };
  }
  
  /**
   * Shutdown the orchestrator
   */
  async shutdown() {
    this.activeExecutions.clear();
    this.removeAllListeners();
    
    if (this.router) {
      await this.router.shutdown();
    }
    
    this.initialized = false;
  }
}

export default Orchestrator;
