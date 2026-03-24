/**
 * Task Scheduler - Intelligent task scheduling with dependencies
 * @module intelligence/scheduler
 */

/**
 * Task definition
 * @typedef {Object} Task
 * @property {string} id - Unique task identifier
 * @property {string} name - Task name
 * @property {number} priority - Task priority (1-10, higher = more important)
 * @property {number} duration - Estimated duration in milliseconds
 * @property {string[]} dependencies - IDs of tasks this task depends on
 * @property {number} deadline - Deadline timestamp
 * @property {string} [resource] - Required resource
 * @property {Object} [metadata] - Additional task metadata
 * @property {Function} [execute] - Task execution function
 */

/**
 * Schedule options
 * @typedef {Object} ScheduleOptions
 * @property {boolean} respectDependencies - Whether to respect dependencies
 * @property {boolean} respectDeadline - Whether to prioritize by deadline
 * @property {number} maxConcurrent - Maximum concurrent tasks
 * @property {string[]} availableResources - Available resources
 */

/**
 * Scheduled task result
 * @typedef {Object} ScheduledTask
 * @property {Task} task - The task
 * @property {number} scheduledStart - Scheduled start time
 * @property {number} scheduledEnd - Scheduled end time
 * @property {string} status - Task status
 * @property {string[]} [blockingTasks] - Tasks blocking this one
 */

/**
 * Schedule result
 * @typedef {Object} ScheduleResult
 * @property {ScheduledTask[]} tasks - Scheduled tasks
 * @property {number} makespan - Total schedule duration
 * @property {number} utilization - Resource utilization (0-1)
 * @property {boolean} feasible - Whether schedule is feasible
 * @property {string[]} warnings - Schedule warnings
 */

/**
 * Intelligent Task Scheduler with dependency-aware scheduling
 */
export class Scheduler {
  /**
   * Create a Task Scheduler
   * @param {Object} options - Configuration options
   * @param {number} options.defaultPriority - Default task priority
   * @param {number} options.maxConcurrent - Default max concurrent tasks
   */
  constructor(options = {}) {
    this.defaultPriority = options.defaultPriority || 5;
    this.maxConcurrent = options.maxConcurrent || 4;
    this.tasks = new Map();
    this.schedule = [];
    this.running = new Set();
    this.completed = new Set();
    this.failed = new Set();
    this.resourceUsage = new Map();
  }

  /**
   * Schedule a task
   * @param {Task} task - Task to schedule
   * @param {ScheduleOptions} options - Schedule options
   * @returns {ScheduledTask} Scheduled task
   */
  schedule(task, options = {}) {
    const opts = {
      respectDependencies: true,
      respectDeadline: true,
      maxConcurrent: this.maxConcurrent,
      ...options
    };

    // Validate task
    if (!task.id) throw new Error('Task must have an id');
    
    // Store task
    this.tasks.set(task.id, {
      ...task,
      priority: task.priority || this.defaultPriority,
      dependencies: task.dependencies || [],
      scheduledAt: Date.now()
    });

    // Calculate schedule
    const scheduledTask = this.calculateSchedule(task, opts);
    
    // Add to schedule
    this.schedule.push(scheduledTask);
    
    return scheduledTask;
  }

  /**
   * Prioritize and schedule multiple tasks
   * @param {Task[]} tasks - Tasks to prioritize
   * @param {ScheduleOptions} options - Schedule options
   * @returns {ScheduleResult} Complete schedule
   */
  prioritize(tasks, options = {}) {
    const opts = {
      respectDependencies: true,
      respectDeadline: true,
      maxConcurrent: this.maxConcurrent,
      ...options
    };

    // Clear existing schedule
    this.schedule = [];
    this.tasks.clear();
    
    // Store all tasks
    for (const task of tasks) {
      this.tasks.set(task.id, {
        ...task,
        priority: task.priority || this.defaultPriority,
        dependencies: task.dependencies || []
      });
    }

    // Topological sort for dependencies
    const sortedTasks = opts.respectDependencies 
      ? this.topologicalSort(tasks)
      : tasks;

    // Score and sort tasks
    const scoredTasks = sortedTasks.map(task => ({
      task,
      score: this.calculatePriorityScore(task, opts)
    }));

    // Group by dependency levels
    const levels = this.groupByDependencyLevel(scoredTasks.map(s => s.task));
    
    // Schedule each level
    const scheduledTasks = [];
    const warnings = [];
    let currentTime = Date.now();
    
    for (const level of levels) {
      // Sort within level by priority score
      const levelTasks = level
        .map(task => ({ task, score: this.calculatePriorityScore(task, opts) }))
        .sort((a, b) => b.score - a.score);

      // Schedule tasks respecting concurrency
      const levelScheduled = this.scheduleLevel(levelTasks, currentTime, opts);
      scheduledTasks.push(...levelScheduled);

      // Update current time to end of this level
      const maxEndTime = Math.max(...levelScheduled.map(t => t.scheduledEnd));
      currentTime = maxEndTime;

      // Check deadline violations
      for (const st of levelScheduled) {
        if (st.task.deadline && st.scheduledEnd > st.task.deadline) {
          warnings.push(`Task ${st.task.id} may miss deadline`);
        }
      }
    }

    this.schedule = scheduledTasks;

    // Calculate metrics
    const makespan = scheduledTasks.length > 0 
      ? Math.max(...scheduledTasks.map(t => t.scheduledEnd)) - Date.now()
      : 0;

    const utilization = this.calculateUtilization(scheduledTasks, makespan);
    const feasible = warnings.length === 0;

    return {
      tasks: scheduledTasks,
      makespan,
      utilization,
      feasible,
      warnings
    };
  }

  /**
   * Check if task dependencies are satisfied
   * @param {string} taskId - Task ID
   * @returns {boolean} Whether dependencies are satisfied
   */
  areDependenciesSatisfied(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    return task.dependencies.every(depId => this.completed.has(depId));
  }

  /**
   * Get tasks ready to execute (dependencies satisfied)
   * @returns {Task[]} Ready tasks
   */
  getReadyTasks() {
    const ready = [];
    for (const [id, task] of this.tasks) {
      if (!this.running.has(id) && !this.completed.has(id) && !this.failed.has(id)) {
        if (this.areDependenciesSatisfied(id)) {
          ready.push(task);
        }
      }
    }
    return ready.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Mark task as started
   * @param {string} taskId - Task ID
   */
  startTask(taskId) {
    this.running.add(taskId);
    const task = this.tasks.get(taskId);
    if (task && task.resource) {
      this.resourceUsage.set(task.resource, (this.resourceUsage.get(task.resource) || 0) + 1);
    }
  }

  /**
   * Mark task as completed
   * @param {string} taskId - Task ID
   */
  completeTask(taskId) {
    this.running.delete(taskId);
    this.completed.add(taskId);
    const task = this.tasks.get(taskId);
    if (task && task.resource) {
      this.resourceUsage.set(task.resource, this.resourceUsage.get(task.resource) - 1);
    }
  }

  /**
   * Mark task as failed
   * @param {string} taskId - Task ID
   */
  failTask(taskId) {
    this.running.delete(taskId);
    this.failed.add(taskId);
    const task = this.tasks.get(taskId);
    if (task && task.resource) {
      this.resourceUsage.set(task.resource, this.resourceUsage.get(task.resource) - 1);
    }
  }

  /**
   * Get schedule statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      total: this.tasks.size,
      running: this.running.size,
      completed: this.completed.size,
      failed: this.failed.size,
      pending: this.tasks.size - this.running.size - this.completed.size - this.failed.size,
      resourceUsage: Object.fromEntries(this.resourceUsage)
    };
  }

  /**
   * Calculate schedule for a single task
   * @private
   * @param {Task} task - Task to schedule
   * @param {ScheduleOptions} opts - Schedule options
   * @returns {ScheduledTask}
   */
  calculateSchedule(task, opts) {
    const now = Date.now();
    let startTime = now;

    // Consider dependencies
    const blockingTasks = [];
    if (opts.respectDependencies) {
      for (const depId of task.dependencies) {
        const dep = this.schedule.find(s => s.task.id === depId);
        if (dep && !this.completed.has(depId)) {
          startTime = Math.max(startTime, dep.scheduledEnd);
          blockingTasks.push(depId);
        }
      }
    }

    return {
      task,
      scheduledStart: startTime,
      scheduledEnd: startTime + (task.duration || 0),
      status: 'scheduled',
      blockingTasks: blockingTasks.length > 0 ? blockingTasks : undefined
    };
  }

  /**
   * Calculate priority score for task
   * @private
   * @param {Task} task - Task
   * @param {ScheduleOptions} opts - Options
   * @returns {number} Priority score
   */
  calculatePriorityScore(task, opts) {
    let score = task.priority * 10;

    // Deadline urgency
    if (opts.respectDeadline && task.deadline) {
      const timeToDeadline = task.deadline - Date.now();
      const urgency = Math.max(0, 1000 - timeToDeadline / 1000);
      score += urgency;
    }

    // Dependency depth bonus (tasks with dependents should run first)
    const dependentCount = this.countDependents(task.id);
    score += dependentCount * 5;

    // Duration penalty (prefer shorter tasks when under pressure)
    if (task.duration) {
      score -= task.duration / 10000;
    }

    return score;
  }

  /**
   * Topological sort of tasks
   * @private
   * @param {Task[]} tasks - Tasks to sort
   * @returns {Task[]} Sorted tasks
   */
  topologicalSort(tasks) {
    const visited = new Set();
    const temp = new Set();
    const result = [];

    const visit = (task) => {
      if (temp.has(task.id)) {
        throw new Error(`Circular dependency detected involving task ${task.id}`);
      }
      if (visited.has(task.id)) return;

      temp.add(task.id);
      
      for (const depId of task.dependencies) {
        const dep = tasks.find(t => t.id === depId);
        if (dep) visit(dep);
      }

      temp.delete(task.id);
      visited.add(task.id);
      result.push(task);
    };

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        visit(task);
      }
    }

    return result;
  }

  /**
   * Group tasks by dependency level
   * @private
   * @param {Task[]} tasks - Sorted tasks
   * @returns {Task[][]} Tasks grouped by level
   */
  groupByDependencyLevel(tasks) {
    const levels = [];
    const scheduled = new Set();

    while (scheduled.size < tasks.length) {
      const level = [];
      
      for (const task of tasks) {
        if (scheduled.has(task.id)) continue;
        
        // Check if all dependencies are in previous levels
        const depsScheduled = task.dependencies.every(depId => scheduled.has(depId));
        if (depsScheduled) {
          level.push(task);
        }
      }

      if (level.length === 0 && scheduled.size < tasks.length) {
        throw new Error('Unable to resolve task dependencies');
      }

      for (const task of level) {
        scheduled.add(task.id);
      }
      levels.push(level);
    }

    return levels;
  }

  /**
   * Schedule tasks within a level
   * @private
   * @param {Array<{task: Task, score: number}>} tasks - Tasks to schedule
   * @param {number} startTime - Level start time
   * @param {ScheduleOptions} opts - Options
   * @returns {ScheduledTask[]} Scheduled tasks
   */
  scheduleLevel(tasks, startTime, opts) {
    const scheduled = [];
    let currentTime = startTime;
    let concurrentCount = 0;

    for (const { task } of tasks) {
      // Check resource availability
      if (task.resource && opts.availableResources && 
          !opts.availableResources.includes(task.resource)) {
        continue;
      }

      // Respect concurrency limit
      if (concurrentCount >= opts.maxConcurrent) {
        // Move to next time slot
        const earliestEnd = Math.min(...scheduled.map(s => s.scheduledEnd));
        currentTime = earliestEnd;
        concurrentCount = scheduled.filter(s => s.scheduledEnd > currentTime).length;
      }

      const scheduledTask = {
        task,
        scheduledStart: currentTime,
        scheduledEnd: currentTime + (task.duration || 0),
        status: 'scheduled'
      };

      scheduled.push(scheduledTask);
      concurrentCount++;
    }

    return scheduled;
  }

  /**
   * Count tasks that depend on a given task
   * @private
   * @param {string} taskId - Task ID
   * @returns {number} Dependent count
   */
  countDependents(taskId) {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.dependencies.includes(taskId)) count++;
    }
    return count;
  }

  /**
   * Calculate resource utilization
   * @private
   * @param {ScheduledTask[]} tasks - Scheduled tasks
   * @param {number} makespan - Total duration
   * @returns {number} Utilization (0-1)
   */
  calculateUtilization(tasks, makespan) {
    if (makespan === 0) return 0;
    
    const totalWork = tasks.reduce((sum, t) => sum + (t.task.duration || 0), 0);
    const capacity = makespan * this.maxConcurrent;
    
    return Math.min(1, totalWork / capacity);
  }
}

export default Scheduler;
