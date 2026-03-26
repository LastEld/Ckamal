/**
 * @fileoverview Workflow planner for the GSD Engine.
 * @module gsd/planner
 */

/**
 * @typedef {Object} Task
 * @property {string} id - Task identifier
 * @property {string} name - Task name
 * @property {number} [duration] - Estimated duration in ms
 * @property {string[]} [dependencies] - IDs of tasks this task depends on
 * @property {string} [type] - Task type for specialist matching
 * @property {Object} [metadata] - Additional task metadata
 */

/**
 * @typedef {Object} PlannedTask
 * @extends Task
 * @property {number} earliestStart - Earliest start time
 * @property {number} latestStart - Latest start time (for critical path)
 * @property {number} level - Topological level (0 = no dependencies)
 * @property {boolean} isCritical - Whether on critical path
 */

/**
 * @typedef {Object} PlanResult
 * @property {PlannedTask[]} tasks - All planned tasks
 * @property {PlannedTask[][]} levels - Tasks grouped by topological level
 * @property {PlannedTask[]} criticalPath - Tasks on critical path
 * @property {number} totalDuration - Estimated total duration
 * @property {number} parallelFactor - Parallelization factor (0-1)
 */

/**
 * @typedef {Object} PlanningConstraints
 * @property {number} [maxParallel] - Maximum parallel tasks
 * @property {string[]} [resourcePools] - Available resource pools
 * @property {Object} [priorities] - Task ID to priority mapping
 * @property {number} [deadline] - Deadline timestamp
 */

/**
 * Workflow planner that creates optimized execution plans.
 */
export class Planner {
  /** @type {PlanningConstraints} */
  constraints;

  /**
   * Create a new planner.
   * @param {PlanningConstraints} [constraints] - Planning constraints
   */
  constructor(constraints = {}) {
    this.constraints = constraints;
  }

  /**
   * Create an execution plan for tasks.
   * @param {Task[]} tasks - Tasks to plan
   * @param {PlanningConstraints} [constraints] - Optional constraints override
   * @returns {PlanResult} Execution plan
   */
  plan(tasks, constraints = null) {
    const effectiveConstraints = { ...this.constraints, ...constraints };
    
    // Build dependency graph
    const graph = this._buildDependencyGraph(tasks);
    
    // Perform topological sort
    const sorted = this._topologicalSort(graph, tasks);
    
    // Group by levels
    const levels = this._groupByLevels(sorted, graph);
    
    // Calculate timing
    const timing = this._calculateTiming(sorted, graph, effectiveConstraints);
    
    // Find critical path
    const criticalPath = this._findCriticalPath(sorted, timing);
    
    // Build planned tasks
    const plannedTasks = sorted.map(task => ({
      ...task,
      earliestStart: timing.earliestStart[task.id] || 0,
      latestStart: timing.latestStart[task.id] || 0,
      level: this._getTaskLevel(task, graph),
      isCritical: criticalPath.some(t => t.id === task.id),
    }));

    // Calculate total duration
    const totalDuration = Math.max(
      ...plannedTasks.map(t => t.earliestStart + (t.duration || 0))
    );

    // Calculate parallel factor
    const parallelFactor = this._calculateParallelFactor(levels, tasks.length);

    return {
      tasks: plannedTasks,
      levels,
      criticalPath,
      totalDuration,
      parallelFactor,
    };
  }

  /**
   * Perform topological sort on tasks.
   * @param {Task[]} tasks - Tasks to sort
   * @returns {Task[]} Topologically sorted tasks
   */
  topologicalSort(tasks) {
    const graph = this._buildDependencyGraph(tasks);
    return this._topologicalSort(graph, tasks);
  }

  /**
   * Detect parallel execution opportunities.
   * @param {Task[]} tasks - Tasks to analyze
   * @returns {Task[][]} Groups of tasks that can execute in parallel
   */
  detectParallelOpportunities(tasks) {
    const graph = this._buildDependencyGraph(tasks);
    const sorted = this._topologicalSort(graph, tasks);
    return this._groupByLevels(sorted, graph);
  }

  /**
   * Analyze critical path.
   * @param {Task[]} tasks - Tasks to analyze
   * @returns {Object} Critical path analysis
   */
  analyzeCriticalPath(tasks) {
    const graph = this._buildDependencyGraph(tasks);
    const sorted = this._topologicalSort(graph, tasks);
    const timing = this._calculateTiming(sorted, graph, this.constraints);
    const criticalPath = this._findCriticalPath(sorted, timing);

    const totalDuration = criticalPath.reduce(
      (sum, task) => sum + (task.duration || 0), 
      0
    );

    const slackTimes = {};
    for (const task of sorted) {
      slackTimes[task.id] = (timing.latestStart[task.id] || 0) - 
                            (timing.earliestStart[task.id] || 0);
    }

    return {
      criticalPath,
      totalDuration,
      slackTimes,
      bottleneck: criticalPath.length > 0 ? criticalPath[0] : null,
    };
  }

  /**
   * Build dependency graph from tasks.
   * @param {Task[]} tasks - Tasks
   * @returns {Map<string, Set<string>>} Dependency graph
   * @private
   */
  _buildDependencyGraph(tasks) {
    const graph = new Map();
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    for (const task of tasks) {
      graph.set(task.id, new Set());
    }

    for (const task of tasks) {
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          if (taskMap.has(depId)) {
            graph.get(task.id).add(depId);
          }
        }
      }
    }

    return graph;
  }

  /**
   * Perform topological sort using Kahn's algorithm.
   * @param {Map<string, Set<string>>} graph - Dependency graph
   * @param {Task[]} tasks - All tasks
   * @returns {Task[]} Sorted tasks
   * @private
   */
  _topologicalSort(graph, tasks) {
    const inDegree = new Map();
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    // Initialize in-degrees
    for (const [id, deps] of graph) {
      inDegree.set(id, deps.size);
    }

    // Find all nodes with no dependencies
    const queue = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const result = [];

    while (queue.length > 0) {
      const id = queue.shift();
      result.push(taskMap.get(id));

      // Reduce in-degree for dependents
      for (const [taskId, deps] of graph) {
        if (deps.has(id)) {
          const newDegree = inDegree.get(taskId) - 1;
          inDegree.set(taskId, newDegree);
          if (newDegree === 0) {
            queue.push(taskId);
          }
        }
      }
    }

    if (result.length !== tasks.length) {
      throw new Error('Circular dependency detected in tasks');
    }

    return result;
  }

  /**
   * Group tasks by topological level.
   * @param {Task[]} sorted - Topologically sorted tasks
   * @param {Map<string, Set<string>>} graph - Dependency graph
   * @returns {Task[][]} Tasks grouped by level
   * @private
   */
  _groupByLevels(sorted, graph) {
    const levels = [];
    const levelMap = new Map();

    for (const task of sorted) {
      const deps = graph.get(task.id);
      let level = 0;
      
      for (const depId of deps) {
        const depLevel = levelMap.get(depId) || 0;
        level = Math.max(level, depLevel + 1);
      }
      
      levelMap.set(task.id, level);
      
      if (!levels[level]) {
        levels[level] = [];
      }
      levels[level].push(task);
    }

    return levels.filter(l => l && l.length > 0);
  }

  /**
   * Get level for a specific task.
   * @param {Task} task - Task to check
   * @param {Map<string, Set<string>>} graph - Dependency graph
   * @returns {number} Task level
   * @private
   */
  _getTaskLevel(task, graph) {
    const deps = graph.get(task.id);
    if (!deps || deps.size === 0) {
      return 0;
    }

    let level = 0;
    for (const depId of deps) {
      // Recursively find level (shouldn't happen with sorted tasks)
      level = Math.max(level, 1);
    }
    return level;
  }

  /**
   * Calculate timing for tasks (earliest/latest start).
   * @param {Task[]} sorted - Sorted tasks
   * @param {Map<string, Set<string>>} graph - Dependency graph
   * @param {PlanningConstraints} constraints - Constraints
   * @returns {Object} Timing information
   * @private
   */
  _calculateTiming(sorted, graph, constraints) {
    const earliestStart = {};
    const latestStart = {};
    const taskMap = new Map(sorted.map(t => [t.id, t]));

    // Forward pass: calculate earliest start
    for (const task of sorted) {
      let maxEnd = 0;
      const deps = graph.get(task.id);
      
      for (const depId of deps) {
        const dep = taskMap.get(depId);
        const depEnd = earliestStart[depId] + (dep.duration || 0);
        maxEnd = Math.max(maxEnd, depEnd);
      }
      
      earliestStart[task.id] = maxEnd;
    }

    // Backward pass: calculate latest start
    const totalDuration = Math.max(
      ...sorted.map(t => earliestStart[t.id] + (t.duration || 0))
    );

    for (let i = sorted.length - 1; i >= 0; i--) {
      const task = sorted[i];
      let minStart = totalDuration - (task.duration || 0);

      // Find all tasks that depend on this one
      for (const [taskId, deps] of graph) {
        if (deps.has(task.id)) {
          const dependentStart = latestStart[taskId];
          minStart = Math.min(minStart, dependentStart - (task.duration || 0));
        }
      }

      latestStart[task.id] = minStart;
    }

    return { earliestStart, latestStart, totalDuration };
  }

  /**
   * Find critical path.
   * @param {Task[]} sorted - Sorted tasks
   * @param {Object} timing - Timing information
   * @returns {Task[]} Tasks on critical path
   * @private
   */
  _findCriticalPath(sorted, timing) {
    return sorted.filter(task => {
      const slack = timing.latestStart[task.id] - timing.earliestStart[task.id];
      return slack === 0;
    });
  }

  /**
   * Calculate parallelization factor.
   * @param {Task[][]} levels - Tasks grouped by level
   * @param {number} totalTasks - Total task count
   * @returns {number} Parallel factor (0-1)
   * @private
   */
  _calculateParallelFactor(levels, totalTasks) {
    if (totalTasks === 0) return 0;
    
    const avgTasksPerLevel = totalTasks / levels.length;
    const maxPossibleParallel = Math.max(...levels.map(l => l.length));
    
    // Factor based on how many levels vs sequential execution
    return 1 - (levels.length / totalTasks);
  }

  /**
   * Update planner constraints.
   * @param {PlanningConstraints} constraints - New constraints
   */
  updateConstraints(constraints) {
    this.constraints = { ...this.constraints, ...constraints };
  }

  /**
   * Estimate execution time for a plan.
   * @param {PlanResult} plan - Execution plan
   * @param {number} [agentCount=1] - Number of available agents
   * @returns {number} Estimated duration in ms
   */
  estimateExecutionTime(plan, agentCount = 1) {
    if (agentCount >= plan.criticalPath.length) {
      // Can parallelize well
      let time = 0;
      for (const level of plan.levels) {
        const levelDuration = Math.max(...level.map(t => t.duration || 0));
        time += levelDuration;
      }
      return time;
    }

    // Limited by agent count
    return plan.totalDuration / Math.min(agentCount, plan.tasks.length);
  }
}

export default Planner;
