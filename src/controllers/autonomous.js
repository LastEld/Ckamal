/**
 * @fileoverview Autonomous Execution Controller
 * Self-directed task execution with planning, verification, and correction.
 * @module controllers/autonomous
 */

import { EventEmitter } from 'events';

import { IntentParser } from './autonomous/intents.js';
import { StatePersistence } from './autonomous/persistence.js';

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Whether execution succeeded
 * @property {any} data - Execution output
 * @property {string[]} logs - Execution log entries
 * @property {number} duration - Execution duration in ms
 * @property {Object} metrics - Execution metrics
 */

/**
 * @typedef {Object} ExecutionContext
 * @property {string} executionId - Unique execution ID
 * @property {string} goal - Original goal
 * @property {Object} plan - Execution plan
 * @property {number} startTime - Start timestamp
 * @property {Object} metadata - Additional context
 */

/**
 * Execution phases
 * @enum {string}
 */
export const ExecutionPhase = {
  PLAN: 'plan',
  EXECUTE: 'execute',
  VERIFY: 'verify',
  CORRECT: 'correct',
  COMPLETE: 'complete',
};

/**
 * Autonomous Controller
 * Handles self-directed goal execution with planning and self-correction.
 * @extends EventEmitter
 */
export class AutonomousController extends EventEmitter {
  /** @type {IntentParser} */
  #intentParser;

  /** @type {StatePersistence} */
  #persistence;

  /** @type {Map<string, Function>} */
  #handlers = new Map();

  /** @type {Object} */
  #config;

  /**
   * Creates an AutonomousController instance
   * @param {Object} [config] - Configuration options
   * @param {boolean} [config.enablePersistence=true] - Enable state persistence
   * @param {number} [config.maxRetries=3] - Maximum retry attempts
   * @param {number} [config.timeout=30000] - Execution timeout in ms
   * @param {boolean} [config.enableLearning=true] - Enable execution learning
   */
  constructor(config = {}) {
    super();
    
    this.#config = {
      enablePersistence: true,
      maxRetries: 3,
      timeout: 30000,
      enableLearning: true,
      ...config,
    };

    this.#intentParser = new IntentParser();
    this.#persistence = new StatePersistence();
    
    this.#setupDefaultHandlers();
    this.#setupEventHandlers();
  }

  /**
   * Execute a goal autonomously
   * @param {string} goal - Goal description
   * @param {Object} [context={}] - Execution context
   * @returns {Promise<ExecutionResult>} Execution result
   * @example
   * const result = await controller.executeGoal('Create a new project named "MyApp"');
   */
  async executeGoal(goal, context = {}) {
    const executionId = crypto.randomUUID();
    const startTime = performance.now();
    
    this.emit('execution:started', { executionId, goal, context });

    const executionContext = {
      executionId,
      goal,
      startTime,
      phase: ExecutionPhase.PLAN,
      metadata: { ...context },
      logs: [],
      retries: 0,
    };

    try {
      // Phase 1: Plan
      this.#log(executionContext, 'Planning task execution...');
      const plan = await this.planTask(goal, executionContext);
      executionContext.plan = plan;
      executionContext.phase = ExecutionPhase.EXECUTE;

      if (this.#config.enablePersistence) {
        await this.#persistence.saveState(executionId, executionContext);
      }

      // Phase 2: Execute
      this.#log(executionContext, `Executing ${plan.steps.length} steps...`);
      const executionResult = await this.#executeSteps(plan, executionContext);
      
      if (!executionResult.success) {
        throw new Error(executionResult.error);
      }

      executionContext.phase = ExecutionPhase.VERIFY;

      // Phase 3: Verify
      this.#log(executionContext, 'Verifying execution results...');
      const verification = await this.#verifyExecution(executionResult, executionContext);
      
      if (!verification.valid) {
        executionContext.phase = ExecutionPhase.CORRECT;
        const corrected = await this.selfCorrect(
          new Error(verification.issues.join(', ')),
          executionContext
        );
        
        if (!corrected.success) {
          throw new Error(`Correction failed: ${corrected.error}`);
        }
      }

      executionContext.phase = ExecutionPhase.COMPLETE;

      // Phase 4: Learn (optional)
      if (this.#config.enableLearning) {
        await this.learnFromExecution({
          executionId,
          goal,
          plan,
          result: executionResult,
          context: executionContext,
        });
      }

      const duration = performance.now() - startTime;
      const result = {
        success: true,
        data: executionResult.data,
        logs: executionContext.logs,
        duration,
        metrics: {
          stepsExecuted: plan.steps.length,
          retries: executionContext.retries,
          verificationPassed: verification.valid,
        },
      };

      this.emit('execution:completed', { executionId, result });
      return result;

    } catch (error) {
      const duration = performance.now() - startTime;
      const result = {
        success: false,
        error: error.message,
        logs: executionContext.logs,
        duration,
        metrics: {
          retries: executionContext.retries,
        },
      };

      this.emit('execution:failed', { executionId, error, result });
      return result;
    }
  }

  /**
   * Plan a task execution
   * @param {string} task - Task description
   * @param {Object} [context] - Planning context
   * @returns {Promise<Object>} Execution plan
   * @example
   * const plan = await controller.planTask('Deploy application to production');
   * // Returns: { steps: [...], dependencies: [...], estimatedTime: ... }
   */
  async planTask(task, context = {}) {
    this.emit('planning:started', { task, context });

    // Parse intent
    const intent = this.#intentParser.parseIntent(task);
    
    // Generate plan based on intent
    const plan = await this.#generatePlan(intent, context);

    this.emit('planning:completed', { task, plan });
    
    return {
      intent,
      steps: plan.steps,
      dependencies: plan.dependencies || [],
      estimatedTime: plan.estimatedTime || 0,
      fallback: plan.fallback,
    };
  }

  /**
   * Self-correct after an error
   * @param {Error} error - The error that occurred
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Correction result
   * @example
   * const correction = await controller.selfCorrect(error, context);
   * if (correction.success) {
   *   // Retry with corrected approach
   * }
   */
  async selfCorrect(error, context) {
    this.emit('correction:started', { error, context });

    if (context.retries >= this.#config.maxRetries) {
      return {
        success: false,
        error: `Maximum retries (${this.#config.maxRetries}) exceeded`,
      };
    }

    context.retries++;
    this.#log(context, `Attempting self-correction (retry ${context.retries})...`);

    // Analyze error and determine correction strategy
    const strategy = this.#determineCorrectionStrategy(error, context);
    
    try {
      // Apply correction
      const correctionResult = await this.#applyCorrection(strategy, context);
      
      this.emit('correction:completed', { 
        error, 
        strategy,
        result: correctionResult,
      });

      return {
        success: true,
        strategy: strategy.type,
        result: correctionResult,
      };
    } catch (correctionError) {
      this.emit('correction:failed', { error, correctionError });
      return {
        success: false,
        error: correctionError.message,
      };
    }
  }

  /**
   * Learn from execution results
   * @param {Object} result - Execution result data
   * @returns {Promise<Object>} Learning result
   * @example
   * await controller.learnFromExecution({
   *   executionId: '...',
   *   goal: '...',
   *   plan: {...},
   *   result: {...},
   * });
   */
  async learnFromExecution(result) {
    this.emit('learning:started', { result });

    // Extract patterns and insights
    const insights = this.#extractInsights(result);
    
    // Store learnings
    if (this.#config.enablePersistence) {
      const learningKey = `learning:${result.executionId}`;
      await this.#persistence.saveState(learningKey, {
        timestamp: new Date().toISOString(),
        goal: result.goal,
        intent: result.plan.intent,
        insights,
        metrics: result.context.metrics || {},
      });
    }

    this.emit('learning:completed', { result, insights });

    return {
      learned: true,
      insights,
    };
  }

  /**
   * Register a handler for specific intent types
   * @param {string} intentType - Intent type to handle
   * @param {Function} handler - Handler function
   * @returns {AutonomousController} this for chaining
   */
  registerHandler(intentType, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    this.#handlers.set(intentType, handler);
    return this;
  }

  /**
   * Get execution checkpoint
   * @param {string} executionId - Execution ID
   * @returns {Promise<Object|null>} Checkpoint data
   */
  async getCheckpoint(executionId) {
    return this.#persistence.loadState(executionId);
  }

  /**
   * Restore from checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Promise<Object>} Restoration result
   */
  async restoreFromCheckpoint(checkpointId) {
    const state = await this.#persistence.restoreCheckpoint(checkpointId);
    if (!state) {
      throw new Error(`Checkpoint '${checkpointId}' not found`);
    }
    return state;
  }

  /**
   * Get controller configuration
   * @returns {Object} Configuration
   */
  getConfig() {
    return { ...this.#config };
  }

  /**
   * Update configuration
   * @param {Object} updates - Configuration updates
   * @returns {AutonomousController} this for chaining
   */
  updateConfig(updates) {
    this.#config = { ...this.#config, ...updates };
    return this;
  }

  // Private methods

  /**
   * Setup default handlers
   * @private
   */
  #setupDefaultHandlers() {
    this.#handlers.set('CREATE', this.#handleCreate.bind(this));
    this.#handlers.set('UPDATE', this.#handleUpdate.bind(this));
    this.#handlers.set('DELETE', this.#handleDelete.bind(this));
    this.#handlers.set('QUERY', this.#handleQuery.bind(this));
    this.#handlers.set('ANALYZE', this.#handleAnalyze.bind(this));
    this.#handlers.set('EXECUTE', this.#handleExecute.bind(this));
  }

  /**
   * Setup event handlers
   * @private
   */
  #setupEventHandlers() {
    this.on('execution:failed', async ({ executionId, error }) => {
      if (this.#config.enablePersistence) {
        await this.#persistence.saveState(`failed:${executionId}`, {
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  /**
   * Log a message
   * @private
   * @param {Object} context - Execution context
   * @param {string} message - Log message
   */
  #log(context, message) {
    const entry = `[${new Date().toISOString()}] ${message}`;
    context.logs.push(entry);
    this.emit('execution:log', { executionId: context.executionId, entry });
  }

  /**
   * Generate execution plan
   * @private
   * @param {Object} intent - Parsed intent
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Plan
   */
  async #generatePlan(intent, _context) {
    // Default planning logic
    const steps = [];
    
    // Add validation step
    steps.push({
      id: crypto.randomUUID(),
      type: 'validate',
      description: `Validate ${intent.type} operation`,
      params: intent.entities,
    });

    // Add main execution step
    steps.push({
      id: crypto.randomUUID(),
      type: 'execute',
      description: `Execute ${intent.action}: ${intent.type}`,
      params: intent.entities,
      handler: intent.type,
    });

    // Add verification step
    steps.push({
      id: crypto.randomUUID(),
      type: 'verify',
      description: 'Verify execution results',
      params: {},
    });

    return {
      steps,
      dependencies: [],
      estimatedTime: steps.length * 1000,
      fallback: {
        type: 'manual',
        description: 'Request manual intervention',
      },
    };
  }

  /**
   * Execute plan steps
   * @private
   * @param {Object} plan - Execution plan
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async #executeSteps(plan, context) {
    const results = [];

    for (const step of plan.steps) {
      this.#log(context, `Executing step: ${step.description}`);

      try {
        const handler = this.#handlers.get(step.handler || step.type);
        
        if (!handler && step.type === 'execute') {
          throw new Error(`No handler for type: ${step.handler}`);
        }

        const result = handler 
          ? await handler(step.params, context)
          : { success: true, data: null };

        results.push({ step: step.id, success: true, data: result });

        // Create checkpoint after each step
        if (this.#config.enablePersistence) {
          await this.#persistence.checkpoint(context.executionId, {
            step: step.id,
            results,
          });
        }
      } catch (error) {
        results.push({ step: step.id, success: false, error: error.message });
        return {
          success: false,
          error: error.message,
          step,
          results,
        };
      }
    }

    return {
      success: true,
      data: results,
    };
  }

  /**
   * Verify execution results
   * @private
   * @param {Object} result - Execution result
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Verification result
   */
  async #verifyExecution(result, _context) {
    const issues = [];

    // Basic verification
    if (!result.success) {
      issues.push('Execution was not successful');
    }

    if (!result.data || result.data.length === 0) {
      issues.push('No execution results');
    }

    // Check all steps succeeded
    const failedSteps = result.data?.filter(r => !r.success) || [];
    if (failedSteps.length > 0) {
      issues.push(`${failedSteps.length} steps failed`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Determine correction strategy
   * @private
   * @param {Error} error - The error
   * @param {Object} context - Execution context
   * @returns {Object} Correction strategy
   */
  #determineCorrectionStrategy(error, _context) {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('timeout')) {
      return { type: 'retry_with_timeout', params: { timeout: this.#config.timeout * 2 } };
    }

    if (errorMessage.includes('not found')) {
      return { type: 'recreate_resource', params: {} };
    }

    if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
      return { type: 'escalate_permissions', params: {} };
    }

    return { type: 'retry', params: {} };
  }

  /**
   * Apply correction
   * @private
   * @param {Object} strategy - Correction strategy
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Correction result
   */
  async #applyCorrection(strategy, context) {
    this.#log(context, `Applying correction: ${strategy.type}`);
    
    // Simulate correction
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      applied: true,
      strategy: strategy.type,
    };
  }

  /**
   * Extract insights from execution
   * @private
   * @param {Object} result - Execution result
   * @returns {Object[]} Insights
   */
  #extractInsights(result) {
    const insights = [];

    if (result.result.success) {
      insights.push({
        type: 'success_pattern',
        description: `Successful execution pattern for ${result.plan.intent.type}`,
        confidence: 0.9,
      });
    } else {
      insights.push({
        type: 'failure_pattern',
        description: `Failure pattern: ${result.result.error}`,
        confidence: 0.8,
      });
    }

    return insights;
  }

  // Default handlers

  async #handleCreate(params, context) {
    this.#log(context, `Creating resource with params: ${JSON.stringify(params)}`);
    return { created: true, params };
  }

  async #handleUpdate(params, context) {
    this.#log(context, `Updating resource with params: ${JSON.stringify(params)}`);
    return { updated: true, params };
  }

  async #handleDelete(params, context) {
    this.#log(context, `Deleting resource with params: ${JSON.stringify(params)}`);
    return { deleted: true, params };
  }

  async #handleQuery(params, context) {
    this.#log(context, `Querying with params: ${JSON.stringify(params)}`);
    return { data: [], params };
  }

  async #handleAnalyze(params, context) {
    this.#log(context, `Analyzing with params: ${JSON.stringify(params)}`);
    return { analysis: {}, params };
  }

  async #handleExecute(params, context) {
    this.#log(context, `Executing with params: ${JSON.stringify(params)}`);
    return { executed: true, params };
  }
}

export default AutonomousController;
