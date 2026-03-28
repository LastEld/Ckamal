/**
 * @fileoverview GSD Workflow Validation - Workflow definition validation
 * @module domains/gsd/domain/validation
 */

import { GSDTools } from './tools.js';

/**
 * Validation result
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - Validation errors
 * @property {string[]} warnings - Validation warnings
 */

/**
 * Task validation result
 * @typedef {Object} TaskValidationResult
 * @property {boolean} valid - Whether task is valid
 * @property {string[]} errors - Task-specific errors
 * @property {string} taskId - Task identifier
 */

/**
 * Workflow definition validator
 */
export class WorkflowValidator {
  /**
   * @param {Object} options - Validator options
   * @param {GSDTools} [options.tools] - Tools instance for validation
   * @param {number} [options.maxTasks=100] - Maximum allowed tasks
   * @param {number} [options.maxDepth=10] - Maximum dependency depth
   */
  constructor(options = {}) {
    this.tools = options.tools || new GSDTools();
    this.maxTasks = options.maxTasks || 100;
    this.maxDepth = options.maxDepth || 10;
  }

  /**
   * Validates a complete workflow definition
   * @param {string} type - Workflow type
   * @param {Array<Object>} tasks - Workflow tasks
   * @returns {ValidationResult} Validation result
   */
  validateWorkflow(type, tasks) {
    const errors = [];
    const warnings = [];

    // Validate type
    if (!type || typeof type !== 'string') {
      errors.push('Workflow type is required and must be a string');
    }

    // Validate tasks array
    if (!Array.isArray(tasks)) {
      errors.push('Tasks must be an array');
      return { valid: false, errors, warnings };
    }

    if (tasks.length === 0) {
      errors.push('Workflow must have at least one task');
    }

    if (tasks.length > this.maxTasks) {
      errors.push(`Too many tasks: ${tasks.length} (max: ${this.maxTasks})`);
    }

    // Collect task IDs for dependency validation
    const taskIds = new Set();
    const duplicateIds = new Set();

    for (const task of tasks) {
      if (task.id) {
        if (taskIds.has(task.id)) {
          duplicateIds.add(task.id);
        } else {
          taskIds.add(task.id);
        }
      }
    }

    if (duplicateIds.size > 0) {
      errors.push(`Duplicate task IDs: ${Array.from(duplicateIds).join(', ')}`);
    }

    // Validate each task
    const taskResults = tasks.map((task, index) => 
      this.validateTask(task, index, taskIds)
    );

    for (const result of taskResults) {
      errors.push(...result.errors);
    }

    // Validate dependencies (check for cycles)
    const cycleErrors = this.#detectCycles(tasks);
    errors.push(...cycleErrors);

    // Check for orphaned tasks (warning)
    const orphanWarnings = this.#checkOrphanedTasks(tasks);
    warnings.push(...orphanWarnings);

    // Validate reachability
    const unreachableWarnings = this.#checkUnreachableTasks(tasks);
    warnings.push(...unreachableWarnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates a single task definition
   * @param {Object} task - Task definition
   * @param {number} index - Task index
   * @param {Set<string>} [validTaskIds] - Set of valid task IDs for dependency checking
   * @returns {TaskValidationResult} Validation result
   */
  validateTask(task, index, validTaskIds = new Set()) {
    const errors = [];
    const taskId = task?.id || `task-${index}`;

    if (!task || typeof task !== 'object') {
      return {
        valid: false,
        errors: [`Task at index ${index} must be an object`],
        taskId
      };
    }

    // Validate task type
    if (!task.type) {
      errors.push(`Task "${taskId}": type is required`);
    } else if (typeof task.type !== 'string') {
      errors.push(`Task "${taskId}": type must be a string`);
    } else if (!this.tools.has(task.type)) {
      errors.push(`Task "${taskId}": unknown tool type "${task.type}"`);
    }

    // Validate task ID format
    if (task.id && typeof task.id !== 'string') {
      errors.push(`Task at index ${index}: id must be a string`);
    }

    // Validate parameters
    if (task.params !== undefined && typeof task.params !== 'object') {
      errors.push(`Task "${taskId}": params must be an object`);
    }

    // Validate parameters against tool schema
    if (task.type && task.params && this.tools.has(task.type)) {
      const paramValidation = this.tools.validateParams(task.type, task.params);
      if (!paramValidation.valid) {
        errors.push(
          ...paramValidation.errors.map(e => `Task "${taskId}": ${e}`)
        );
      }
    }

    // Validate dependency
    if (task.dependsOn !== undefined) {
      if (typeof task.dependsOn !== 'string') {
        errors.push(`Task "${taskId}": dependsOn must be a string`);
      } else if (!validTaskIds.has(task.dependsOn)) {
        errors.push(`Task "${taskId}": dependsOn references unknown task "${task.dependsOn}"`);
      }
    }

    // Validate retry configuration
    if (task.maxRetries !== undefined) {
      if (typeof task.maxRetries !== 'number' || !Number.isInteger(task.maxRetries)) {
        errors.push(`Task "${taskId}": maxRetries must be an integer`);
      } else if (task.maxRetries < 0) {
        errors.push(`Task "${taskId}": maxRetries must be non-negative`);
      } else if (task.maxRetries > 10) {
        errors.push(`Task "${taskId}": maxRetries too high (max: 10)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      taskId
    };
  }

  /**
   * Validates task dependencies for circular references
   * @param {Array<Object>} tasks - Workflow tasks
   * @returns {string[]} Error messages
   * @private
   */
  #detectCycles(tasks) {
    const errors = [];
    const taskMap = new Map();
    const visiting = new Set();
    const visited = new Set();

    // Build task map
    for (const task of tasks) {
      taskMap.set(task.id || task, task);
    }

    const visit = (task, path = []) => {
      const taskId = task.id || task;

      if (visiting.has(taskId)) {
        const cycleStart = path.indexOf(taskId);
        const cycle = path.slice(cycleStart).concat(taskId);
        errors.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
        return;
      }

      if (visited.has(taskId)) {
        return;
      }

      visiting.add(taskId);
      path.push(taskId);

      // Check depth
      if (path.length > this.maxDepth) {
        errors.push(`Dependency depth exceeded for task "${taskId}" (max: ${this.maxDepth})`);
        visiting.delete(taskId);
        path.pop();
        return;
      }

      // Visit dependencies
      if (task.dependsOn) {
        const dependency = taskMap.get(task.dependsOn);
        if (dependency) {
          visit(dependency, [...path]);
        }
      }

      visiting.delete(taskId);
      visited.add(taskId);
    };

    for (const task of tasks) {
      if (!visited.has(task.id || task)) {
        visit(task);
      }
    }

    return errors;
  }

  /**
   * Checks for orphaned tasks (tasks that will never run due to failed dependencies)
   * @param {Array<Object>} tasks - Workflow tasks
   * @returns {string[]} Warning messages
   * @private
   */
  #checkOrphanedTasks(tasks) {
    const warnings = [];
    const taskMap = new Map(tasks.map(t => [t.id || t, t]));
    const dependencyChain = new Map();

    // Build dependency chains
    for (const task of tasks) {
      const chain = [];
      let current = task;
      while (current?.dependsOn) {
        chain.push(current.dependsOn);
        current = taskMap.get(current.dependsOn);
      }
      dependencyChain.set(task.id || task, chain);
    }

    // Check for potential orphans
    for (const [taskId, chain] of dependencyChain) {
      if (chain.length > 3) {
        warnings.push(`Task "${taskId}" has a long dependency chain (${chain.length} levels)`);
      }
    }

    return warnings;
  }

  /**
   * Checks for unreachable tasks
   * @param {Array<Object>} tasks - Workflow tasks
   * @returns {string[]} Warning messages
   * @private
   */
  #checkUnreachableTasks(tasks) {
    const warnings = [];
    const taskIds = new Set(tasks.map(t => t.id || t));
    const reachableFromStart = new Set();

    // Simple reachability check - tasks without dependencies are reachable
    for (const task of tasks) {
      if (!task.dependsOn) {
        this.#markReachable(task, tasks, reachableFromStart);
      }
    }

    // Find unreachable tasks
    for (const task of tasks) {
      const taskId = task.id || task;
      if (!reachableFromStart.has(taskId)) {
        warnings.push(`Task "${taskId}" may be unreachable (depends on non-existent or unreachable task)`);
      }
    }

    return warnings;
  }

  /**
   * Marks tasks as reachable
   * @param {Object} task - Starting task
   * @param {Array<Object>} allTasks - All tasks
   * @param {Set<string>} reachable - Set of reachable task IDs
   * @private
   */
  #markReachable(task, allTasks, reachable) {
    const taskId = task.id || task;
    if (reachable.has(taskId)) return;

    reachable.add(taskId);

    // Find tasks that depend on this one
    for (const t of allTasks) {
      if (t.dependsOn === taskId) {
        this.#markReachable(t, allTasks, reachable);
      }
    }
  }

  /**
   * Validates workflow execution context
   * @param {Object} context - Execution context
   * @returns {ValidationResult} Validation result
   */
  validateContext(context) {
    const errors = [];
    const warnings = [];

    if (context === undefined || context === null) {
      return { valid: true, errors, warnings };
    }

    if (typeof context !== 'object') {
      errors.push('Context must be an object');
      return { valid: false, errors, warnings };
    }

    // Check for reserved keys
    const reserved = ['workflowId', 'taskId', 'results', 'status'];
    for (const key of reserved) {
      if (key in context) {
        warnings.push(`Context contains reserved key "${key}" which may be overwritten`);
      }
    }

    // Check context size (rough estimate)
    try {
      const size = JSON.stringify(context).length;
      if (size > 1000000) {
        warnings.push(`Context is very large (${size} bytes), may impact performance`);
      }
    } catch (e) {
      errors.push('Context is not serializable');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Sanitizes workflow tasks for safe execution
   * @param {Array<Object>} tasks - Raw task definitions
   * @returns {Array<Object>} Sanitized tasks
   */
  sanitizeTasks(tasks) {
    return tasks.map((task, index) => ({
      id: task.id || `task-${index}`,
      type: String(task.type || ''),
      params: typeof task.params === 'object' ? task.params : {},
      status: 'pending',
      dependsOn: task.dependsOn || null,
      retryCount: 0,
      maxRetries: Math.min(Math.max(0, parseInt(task.maxRetries, 10) || 3), 10),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    }));
  }

  /**
   * Gets validation schema for a tool
   * @param {string} toolName - Tool name
   * @returns {Object|null} JSON Schema or null
   */
  getToolSchema(toolName) {
    const tool = this.tools.get(toolName);
    return tool ? tool.parameters : null;
  }

  /**
   * Lists available tools with their schemas
   * @returns {Array<{name: string, description: string, parameters: Object}>} Tool schemas
   */
  listToolSchemas() {
    return this.tools.list().map(({ name, description }) => ({
      name,
      description,
      parameters: this.tools.get(name).parameters
    }));
  }
}

// Export singleton instance
export const workflowValidator = new WorkflowValidator();
export default WorkflowValidator;
