/**
 * @fileoverview GSD (Get Sh*t Done) Domain - Workflow execution and task management
 * @module domains/gsd
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { GSDTools } from './domain/tools.js';
import { WorkflowValidator } from './domain/validation.js';

/**
 * Workflow definition
 * @typedef {Object} Workflow
 * @property {string} id - Unique workflow identifier
 * @property {string} type - Workflow type
 * @property {WorkflowTask[]} tasks - Workflow tasks
 * @property {WorkflowState} state - Current state
 * @property {string} status - Execution status
 * @property {string} createdAt - Creation timestamp
 * @property {string} [startedAt] - Start timestamp
 * @property {string} [completedAt] - Completion timestamp
 * @property {Object} metadata - Additional metadata
 * @property {Error} [error] - Error if failed
 */

/**
 * Workflow task
 * @typedef {Object} WorkflowTask
 * @property {string} id - Task identifier
 * @property {string} type - Task type
 * @property {Object} params - Task parameters
 * @property {string} status - Task status (pending, running, completed, failed, cancelled)
 * @property {string} [dependsOn] - ID of task this depends on
 * @property {number} [retryCount] - Number of retries attempted
 * @property {number} [maxRetries] - Maximum retry attempts
 * @property {string} [startedAt] - Task start timestamp
 * @property {string} [completedAt] - Task completion timestamp
 * @property {*} [result] - Task result
 * @property {Error} [error] - Task error
 */

/**
 * Workflow state
 * @typedef {Object} WorkflowState
 * @property {number} currentStep - Current step index
 * @property {Object} context - Shared context between tasks
 * @property {Object} results - Results from completed tasks
 */

/**
 * Workflow status
 * @typedef {Object} WorkflowStatus
 * @property {string} id - Workflow ID
 * @property {string} type - Workflow type
 * @property {string} status - Current status
 * @property {number} progress - Progress percentage (0-100)
 * @property {number} completedTasks - Number of completed tasks
 * @property {number} totalTasks - Total number of tasks
 * @property {string} [currentTask] - Currently executing task ID
 * @property {string} [startedAt] - Start timestamp
 * @property {string} [completedAt] - Completion timestamp
 * @property {Object} [error] - Error information if failed
 */

/**
 * Workflow execution options
 * @typedef {Object} WorkflowExecutionOptions
 * @property {boolean} [continueOnError=false] - Continue on task failure
 * @property {number} [timeout] - Execution timeout in milliseconds
 * @property {Object} [context] - Initial context data
 * @property {Function} [onProgress] - Progress callback
 * @property {Function} [onTaskStart] - Task start callback
 * @property {Function} [onTaskComplete] - Task completion callback
 */

/**
 * Task execution result
 * @typedef {Object} TaskResult
 * @property {string} taskId - Task identifier
 * @property {boolean} success - Whether task succeeded
 * @property {*} result - Task result data
 * @property {Error} [error] - Error if failed
 * @property {number} duration - Execution duration in milliseconds
 */

/**
 * GSD Domain for workflow creation and execution
 * @extends EventEmitter
 */
export class GSDDomain extends EventEmitter {
  /**
   * @param {Object} options - Domain options
   * @param {Object} [options.tools] - Custom tools configuration
   * @param {Object} [options.validator] - Custom validator instance
   * @param {number} [options.defaultTimeout=300000] - Default timeout (5 minutes)
   * @param {number} [options.maxConcurrent=3] - Max concurrent workflows
   */
  constructor(options = {}) {
    super();
    this.tools = options.tools || new GSDTools();
    this.validator = options.validator || new WorkflowValidator();
    this.defaultTimeout = options.defaultTimeout || 300000; // 5 minutes
    this.maxConcurrent = options.maxConcurrent || 3;
    
    /** @type {Map<string, Workflow>} */
    this.workflows = new Map();
    /** @type {Map<string, AbortController>} */
    this.abortControllers = new Map();
    /** @type {Set<string>} */
    this.runningWorkflows = new Set();
  }

  /**
   * Creates a new workflow
   * @param {string} type - Workflow type (e.g., 'code-generation', 'refactoring', 'analysis')
   * @param {Array<Object>} tasks - Workflow tasks definition
   * @param {Object} [options] - Workflow options
   * @param {string} [options.id] - Custom workflow ID
   * @param {Object} [options.metadata] - Workflow metadata
   * @returns {Workflow} Created workflow
   * @throws {ValidationError} If workflow definition is invalid
   * @fires GSDDomain#workflowCreated
   */
  createWorkflow(type, tasks, options = {}) {
    // Validate workflow definition
    const validation = this.validator.validateWorkflow(type, tasks);
    if (!validation.valid) {
      const error = new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
      error.name = 'ValidationError';
      error.validationErrors = validation.errors;
      throw error;
    }

    // Create workflow tasks with defaults
    const workflowTasks = tasks.map((task, index) => ({
      id: task.id || `task-${index}`,
      type: task.type,
      params: task.params || {},
      status: 'pending',
      dependsOn: task.dependsOn || null,
      retryCount: 0,
      maxRetries: task.maxRetries || 3,
      ...task
    }));

    /** @type {Workflow} */
    const workflow = {
      id: options.id || `wf-${randomUUID().slice(0, 8)}`,
      type,
      tasks: workflowTasks,
      state: {
        currentStep: 0,
        context: {},
        results: {}
      },
      status: 'created',
      createdAt: new Date().toISOString(),
      metadata: options.metadata || {}
    };

    this.workflows.set(workflow.id, workflow);

    /** @event GSDDomain#workflowCreated */
    this.emit('workflowCreated', { workflowId: workflow.id, type, taskCount: tasks.length });

    return workflow;
  }

  /**
   * Executes a workflow
   * @param {string} workflowId - Workflow to execute
   * @param {WorkflowExecutionOptions} [options] - Execution options
   * @returns {Promise<Workflow>} Completed workflow
   * @throws {Error} If workflow not found or already running
   * @fires GSDDomain#workflowStarted
   * @fires GSDDomain#workflowProgress
   * @fires GSDDomain#workflowComplete
   * @fires GSDDomain#workflowError
   */
  async executeWorkflow(workflowId, options = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (this.runningWorkflows.has(workflowId)) {
      throw new Error(`Workflow ${workflowId} is already running`);
    }

    // Check concurrent limit
    if (this.runningWorkflows.size >= this.maxConcurrent) {
      throw new Error(`Max concurrent workflows (${this.maxConcurrent}) reached`);
    }

    // Initialize execution
    this.runningWorkflows.add(workflowId);
    workflow.status = 'running';
    workflow.startedAt = new Date().toISOString();
    workflow.state.context = { ...options.context, ...workflow.state.context };

    const abortController = new AbortController();
    this.abortControllers.set(workflowId, abortController);

    /** @event GSDDomain#workflowStarted */
    this.emit('workflowStarted', { workflowId, taskCount: workflow.tasks.length });

    // Set up timeout
    const timeout = options.timeout || this.defaultTimeout;
    const timeoutId = setTimeout(() => {
      abortController.abort(new Error(`Workflow timeout after ${timeout}ms`));
    }, timeout);

    try {
      // Execute tasks
      for (let i = 0; i < workflow.tasks.length; i++) {
        if (abortController.signal.aborted) {
          throw abortController.signal.reason || new Error('Workflow cancelled');
        }

        const task = workflow.tasks[i];
        workflow.state.currentStep = i;

        // Skip if task already completed
        if (task.status === 'completed') {
          continue;
        }

        // Wait for dependencies
        if (task.dependsOn) {
          const dependency = workflow.tasks.find(t => t.id === task.dependsOn);
          if (dependency && dependency.status !== 'completed') {
            await this.#waitForTask(dependency, abortController.signal);
          }
        }

        // Update status
        task.status = 'running';
        task.startedAt = new Date().toISOString();

        if (options.onTaskStart) {
          options.onTaskStart(task);
        }

        /** @event GSDDomain#taskStarted */
        this.emit('taskStarted', { workflowId, taskId: task.id, type: task.type });

        // Execute task with retry logic
        const result = await this.#executeTaskWithRetry(
          task, 
          workflow.state,
          abortController.signal
        );

        // Update task status
        task.completedAt = new Date().toISOString();

        if (result.success) {
          task.status = 'completed';
          task.result = result.result;
          workflow.state.results[task.id] = result.result;
        } else {
          task.status = 'failed';
          task.error = result.error;

          if (!options.continueOnError) {
            throw result.error;
          }
        }

        if (options.onTaskComplete) {
          options.onTaskComplete(task, result);
        }

        // Calculate and report progress
        const progress = Math.round(((i + 1) / workflow.tasks.length) * 100);
        
        /** @event GSDDomain#workflowProgress */
        this.emit('workflowProgress', { 
          workflowId, 
          progress, 
          currentTask: task.id,
          completedTasks: i + 1,
          totalTasks: workflow.tasks.length
        });

        if (options.onProgress) {
          options.onProgress(progress);
        }
      }

      // Mark workflow as completed
      workflow.status = 'completed';
      workflow.completedAt = new Date().toISOString();

      /** @event GSDDomain#workflowComplete */
      this.emit('workflowComplete', { 
        workflowId, 
        duration: new Date(workflow.completedAt) - new Date(workflow.startedAt)
      });

      return workflow;
    } catch (error) {
      workflow.status = 'failed';
      workflow.error = error;

      /** @event GSDDomain#workflowError */
      this.emit('workflowError', { workflowId, error });

      throw error;
    } finally {
      clearTimeout(timeoutId);
      this.runningWorkflows.delete(workflowId);
      this.abortControllers.delete(workflowId);
    }
  }

  /**
   * Gets workflow status
   * @param {string} workflowId - Workflow identifier
   * @returns {WorkflowStatus} Current workflow status
   * @throws {Error} If workflow not found
   */
  getStatus(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const completedTasks = workflow.tasks.filter(t => t.status === 'completed').length;
    const totalTasks = workflow.tasks.length;
    const progress = totalTasks > 0 
      ? Math.round((completedTasks / totalTasks) * 100) 
      : 0;

    const currentTask = workflow.tasks.find(t => t.status === 'running');

    return {
      id: workflow.id,
      type: workflow.type,
      status: workflow.status,
      progress,
      completedTasks,
      totalTasks,
      currentTask: currentTask?.id,
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt,
      error: workflow.error ? {
        message: workflow.error.message,
        name: workflow.error.name
      } : undefined
    };
  }

  /**
   * Cancels a running workflow
   * @param {string} workflowId - Workflow to cancel
   * @param {string} [reason] - Cancellation reason
   * @returns {boolean} True if cancelled successfully
   * @fires GSDDomain#workflowCancelled
   */
  cancelWorkflow(workflowId, reason = 'User cancelled') {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (workflow.status !== 'running') {
      return false;
    }

    const abortController = this.abortControllers.get(workflowId);
    if (abortController) {
      abortController.abort(new Error(reason));
    }

    workflow.status = 'cancelled';
    
    // Mark running tasks as cancelled
    for (const task of workflow.tasks) {
      if (task.status === 'running') {
        task.status = 'cancelled';
        task.completedAt = new Date().toISOString();
      }
    }

    this.runningWorkflows.delete(workflowId);
    this.abortControllers.delete(workflowId);

    /** @event GSDDomain#workflowCancelled */
    this.emit('workflowCancelled', { workflowId, reason });

    return true;
  }

  /**
   * Lists all workflows
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.type] - Filter by type
   * @returns {WorkflowStatus[]} Workflow status list
   */
  listWorkflows(filters = {}) {
    const workflows = Array.from(this.workflows.values());
    
    return workflows
      .filter(wf => {
        if (filters.status && wf.status !== filters.status) return false;
        if (filters.type && wf.type !== filters.type) return false;
        return true;
      })
      .map(wf => this.getStatus(wf.id));
  }

  /**
   * Deletes a workflow
   * @param {string} workflowId - Workflow to delete
   * @returns {boolean} True if deleted
   */
  deleteWorkflow(workflowId) {
    // Cancel if running
    if (this.runningWorkflows.has(workflowId)) {
      this.cancelWorkflow(workflowId, 'Workflow deleted');
    }

    return this.workflows.delete(workflowId);
  }

  /**
   * Clears all completed workflows
   * @param {Object} [options] - Clear options
   * @param {string[]} [options.excludeStatuses] - Statuses to exclude from clearing
   * @returns {number} Number of workflows cleared
   */
  clearCompleted(options = {}) {
    const excludeStatuses = options.excludeStatuses || ['running'];
    let cleared = 0;

    for (const [id, workflow] of this.workflows) {
      if (!excludeStatuses.includes(workflow.status)) {
        this.workflows.delete(id);
        cleared++;
      }
    }

    return cleared;
  }

  // Private methods

  /**
   * Waits for a task to complete
   * @private
   * @param {WorkflowTask} task - Task to wait for
   * @param {AbortSignal} signal - Abort signal
   * @returns {Promise<void>}
   */
  async #waitForTask(task, signal) {
    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }

        if (task.status === 'completed') {
          resolve();
        } else if (task.status === 'failed' || task.status === 'cancelled') {
          reject(new Error(`Dependency task ${task.id} ${task.status}`));
        } else {
          setTimeout(checkStatus, 100);
        }
      };
      checkStatus();
    });
  }

  /**
   * Executes task with retry logic
   * @private
   * @param {WorkflowTask} task - Task to execute
   * @param {WorkflowState} state - Workflow state
   * @param {AbortSignal} signal - Abort signal
   * @returns {Promise<TaskResult>} Task result
   */
  async #executeTaskWithRetry(task, state, signal) {
    let lastError;
    const startTime = Date.now();

    while (task.retryCount <= task.maxRetries) {
      try {
        if (signal.aborted) {
          throw signal.reason || new Error('Task cancelled');
        }

        const result = await this.tools.execute(task.type, {
          ...task.params,
          context: state.context,
          previousResults: state.results
        }, signal);

        return {
          taskId: task.id,
          success: true,
          result,
          duration: Date.now() - startTime
        };
      } catch (error) {
        lastError = error;
        task.retryCount++;

        if (task.retryCount <= task.maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, task.retryCount - 1), 10000);
          await this.#delay(delay);
        }
      }
    }

    return {
      taskId: task.id,
      success: false,
      error: lastError,
      duration: Date.now() - startTime
    };
  }

  /**
   * Delays execution
   * @private
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const gsdDomain = new GSDDomain();
export { GSDTools, WorkflowValidator };
export default GSDDomain;
