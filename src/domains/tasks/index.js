/**
 * @fileoverview Tasks Domain - Task management with Eisenhower matrix
 * @module domains/tasks
 */

/**
 * Eisenhower quadrant
 * @typedef {'urgent-important' | 'not-urgent-important' | 'urgent-not-important' | 'not-urgent-not-important'} EisenhowerQuadrant
 */

/**
 * Task priority
 * @typedef {'critical' | 'high' | 'medium' | 'low'} TaskPriority
 */

/**
 * Task status
 * @typedef {'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'archived'} TaskStatus
 */

/**
 * Task structure
 * @typedef {Object} Task
 * @property {string} id - Unique task identifier
 * @property {string} title - Task title
 * @property {string} description - Task description
 * @property {TaskStatus} status - Current status
 * @property {TaskPriority} priority - Priority level
 * @property {boolean} urgent - Is urgent
 * @property {boolean} important - Is important
 * @property {EisenhowerQuadrant} quadrant - Eisenhower quadrant
 * @property {string|null} roadmapNodeId - Linked roadmap node
 * @property {string|null} parentTaskId - Parent task for subtasks
 * @property {string[]} subtasks - Child task IDs
 * @property {string[]} tags - Task tags
 * @property {string|null} dueDate - Due date ISO string
 * @property {number} estimatedMinutes - Time estimate
 * @property {number} actualMinutes - Time spent
 * @property {string} createdAt - Creation timestamp
 * @property {string} updatedAt - Last update timestamp
 * @property {string} createdBy - Creator user ID
 * @property {string[]} assignees - Assigned user IDs
 * @property {string[]} attachments - Attachment file IDs
 */

/**
 * Matrix organization result
 * @typedef {Object} MatrixOrganization
 * @property {Task[]} urgentImportant - Do first
 * @property {Task[]} notUrgentImportant - Schedule
 * @property {Task[]} urgentNotImportant - Delegate
 * @property {Task[]} notUrgentNotImportant - Eliminate
 */

/**
 * Manages tasks with Eisenhower matrix prioritization
 */
export class TaskDomain {
  /**
   * @private
   * @type {Map<string, Task>}
   */
  #tasks = new Map();

  /**
   * Creates a new TaskDomain
   */
  constructor() {
    this.#tasks = new Map();
  }

  /**
   * Generate unique ID
   * @private
   * @returns {string}
   */
  #generateId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current timestamp
   * @private
   * @returns {string}
   */
  #now() {
    return new Date().toISOString();
  }

  /**
   * Generate a mutation timestamp that is guaranteed to move forward
   * @private
   * @param {string} [previousTimestamp] - Previous timestamp
   * @returns {string}
   */
  #nextTimestamp(previousTimestamp) {
    const now = Date.now();
    const previous = previousTimestamp ? new Date(previousTimestamp).getTime() : 0;
    return new Date(now <= previous ? previous + 1 : now).toISOString();
  }

  /**
   * Calculate Eisenhower quadrant
   * @private
   * @param {boolean} urgent - Is urgent
   * @param {boolean} important - Is important
   * @returns {EisenhowerQuadrant}
   */
  #calculateQuadrant(urgent, important) {
    if (urgent && important) return 'urgent-important';
    if (!urgent && important) return 'not-urgent-important';
    if (urgent && !important) return 'urgent-not-important';
    return 'not-urgent-not-important';
  }

  /**
   * Create a new task
   * @param {Object} data - Task creation data
   * @param {string} data.title - Task title
   * @param {string} [data.description] - Task description
   * @param {TaskStatus} [data.status='backlog'] - Initial status
   * @param {TaskPriority} [data.priority='medium'] - Priority
   * @param {boolean} [data.urgent=false] - Is urgent
   * @param {boolean} [data.important=false] - Is important
   * @param {string} [data.roadmapNodeId] - Linked roadmap node
   * @param {string} [data.parentTaskId] - Parent task
   * @param {string[]} [data.tags] - Tags
   * @param {string} [data.dueDate] - Due date
   * @param {number} [data.estimatedMinutes] - Time estimate
   * @param {string} [data.createdBy] - Creator ID
   * @param {string[]} [data.assignees] - Assignee IDs
   * @returns {Task} Created task
   */
  createTask(data) {
    if (!data.title || typeof data.title !== 'string') {
      throw new Error('Task title is required');
    }

    const now = this.#now();
    const urgent = data.urgent ?? false;
    const important = data.important ?? false;

    const task = {
      id: this.#generateId(),
      title: data.title,
      description: data.description ?? '',
      status: data.status ?? 'backlog',
      priority: data.priority ?? 'medium',
      urgent,
      important,
      quadrant: this.#calculateQuadrant(urgent, important),
      roadmapNodeId: data.roadmapNodeId ?? null,
      parentTaskId: data.parentTaskId ?? null,
      subtasks: [],
      tags: data.tags ?? [],
      dueDate: data.dueDate ?? null,
      estimatedMinutes: data.estimatedMinutes ?? 0,
      actualMinutes: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: data.createdBy ?? 'system',
      assignees: data.assignees ?? [],
      attachments: []
    };

    // If this is a subtask, update parent's subtasks list
    if (task.parentTaskId) {
      const parent = this.#tasks.get(task.parentTaskId);
      if (parent) {
        parent.subtasks.push(task.id);
      }
    }

    this.#tasks.set(task.id, task);
    return task;
  }

  /**
   * Get a task by ID
   * @param {string} id - Task ID
   * @returns {Task|undefined}
   */
  getTask(id) {
    if (!id || typeof id !== 'string') {
      return undefined;
    }
    return this.#tasks.get(id);
  }

  /**
   * Update an existing task
   * @param {string} id - Task ID
   * @param {Partial<Task>} data - Update data
   * @returns {Task} Updated task
   * @throws {Error} If task not found
   */
  updateTask(id, data) {
    const task = this.#tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const allowedUpdates = [
      'title', 'description', 'status', 'priority', 'urgent', 'important',
      'dueDate', 'estimatedMinutes', 'actualMinutes', 'tags', 'assignees'
    ];

    for (const key of allowedUpdates) {
      if (key in data) {
        task[key] = data[key];
      }
    }

    // Recalculate quadrant if urgency/importance changed
    if ('urgent' in data || 'important' in data) {
      task.quadrant = this.#calculateQuadrant(task.urgent, task.important);
    }

    task.updatedAt = this.#nextTimestamp(task.updatedAt);
    this.#tasks.set(id, task);

    return task;
  }

  /**
   * Delete a task
   * @param {string} id - Task ID
   * @returns {boolean} True if deleted
   */
  deleteTask(id) {
    const task = this.#tasks.get(id);
    if (!task) {
      return false;
    }

    // Remove from parent's subtasks if applicable
    if (task.parentTaskId) {
      const parent = this.#tasks.get(task.parentTaskId);
      if (parent) {
        parent.subtasks = parent.subtasks.filter(subId => subId !== id);
      }
    }

    this.#deleteTaskRecursive(id);
    return true;
  }

  /**
   * Organize tasks by Eisenhower matrix
   * @param {Object} [filters] - Optional filters
   * @param {string} [filters.assignee] - Filter by assignee
   * @param {string} [filters.status] - Filter by status
   * @returns {MatrixOrganization}
   */
  organizeByMatrix(filters = {}) {
    let tasks = Array.from(this.#tasks.values());

    if (filters.assignee) {
      tasks = tasks.filter(t => t.assignees.includes(filters.assignee));
    }

    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }

    return {
      urgentImportant: tasks.filter(t => t.quadrant === 'urgent-important'),
      notUrgentImportant: tasks.filter(t => t.quadrant === 'not-urgent-important'),
      urgentNotImportant: tasks.filter(t => t.quadrant === 'urgent-not-important'),
      notUrgentNotImportant: tasks.filter(t => t.quadrant === 'not-urgent-not-important')
    };
  }

  /**
   * Link a task to a roadmap node
   * @param {string} taskId - Task ID
   * @param {string} nodeId - Roadmap node ID
   * @returns {Task} Updated task
   * @throws {Error} If task not found
   */
  linkToRoadmap(taskId, nodeId) {
    const task = this.#tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.roadmapNodeId = nodeId;
    task.updatedAt = this.#nextTimestamp(task.updatedAt);
    
    this.#tasks.set(taskId, task);
    return task;
  }

  /**
   * Unlink a task from roadmap
   * @param {string} taskId - Task ID
   * @returns {Task} Updated task
   */
  unlinkFromRoadmap(taskId) {
    return this.updateTask(taskId, { roadmapNodeId: null });
  }

  /**
   * Add attachment to task
   * @param {string} taskId - Task ID
   * @param {string} fileId - File attachment ID
   * @returns {Task} Updated task
   */
  addAttachment(taskId, fileId) {
    const task = this.#tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.attachments.includes(fileId)) {
      task.attachments.push(fileId);
      task.updatedAt = this.#nextTimestamp(task.updatedAt);
      this.#tasks.set(taskId, task);
    }

    return task;
  }

  /**
   * Remove attachment from task
   * @param {string} taskId - Task ID
   * @param {string} fileId - File attachment ID
   * @returns {Task} Updated task
   */
  removeAttachment(taskId, fileId) {
    const task = this.#tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.attachments = task.attachments.filter(id => id !== fileId);
    task.updatedAt = this.#nextTimestamp(task.updatedAt);
    this.#tasks.set(taskId, task);

    return task;
  }

  /**
   * List tasks with optional filtering
   * @param {Object} [filters] - Filter options
   * @param {TaskStatus} [filters.status] - Filter by status
   * @param {TaskPriority} [filters.priority] - Filter by priority
   * @param {EisenhowerQuadrant} [filters.quadrant] - Filter by quadrant
   * @param {string} [filters.assignee] - Filter by assignee
   * @param {string} [filters.roadmapNodeId] - Filter by roadmap node
   * @param {string[]} [filters.tags] - Filter by tags (all must match)
   * @returns {Task[]} Matching tasks
   */
  listTasks(filters = {}) {
    let tasks = Array.from(this.#tasks.values());

    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }

    if (filters.priority) {
      tasks = tasks.filter(t => t.priority === filters.priority);
    }

    if (filters.quadrant) {
      tasks = tasks.filter(t => t.quadrant === filters.quadrant);
    }

    if (filters.assignee) {
      tasks = tasks.filter(t => t.assignees.includes(filters.assignee));
    }

    if (filters.roadmapNodeId) {
      tasks = tasks.filter(t => t.roadmapNodeId === filters.roadmapNodeId);
    }

    if (filters.tags && filters.tags.length > 0) {
      tasks = tasks.filter(t => 
        filters.tags.every(tag => t.tags.includes(tag))
      );
    }

    return tasks;
  }

  /**
   * Get tasks due today
   * @param {string} [assignee] - Optional assignee filter
   * @returns {Task[]}
   */
  getDueToday(assignee) {
    const today = new Date().toISOString().split('T')[0];
    let tasks = this.listTasks({ assignee });
    return tasks.filter(t => t.dueDate?.startsWith(today));
  }

  /**
   * Get overdue tasks
   * @param {string} [assignee] - Optional assignee filter
   * @returns {Task[]}
   */
  getOverdue(assignee) {
    const now = new Date().toISOString();
    let tasks = this.listTasks({ assignee });
    return tasks.filter(t => 
      t.dueDate && t.dueDate < now && t.status !== 'done' && t.status !== 'archived'
    );
  }

  /**
   * Log time spent on task
   * @param {string} taskId - Task ID
   * @param {number} minutes - Minutes to log
   * @returns {Task} Updated task
   */
  logTime(taskId, minutes) {
    const task = this.#tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.actualMinutes += minutes;
    task.updatedAt = this.#nextTimestamp(task.updatedAt);
    this.#tasks.set(taskId, task);

    return task;
  }

  /**
   * Delete a task and all descendants
   * @private
   * @param {string} id - Task ID
   */
  #deleteTaskRecursive(id) {
    const task = this.#tasks.get(id);
    if (!task) {
      return;
    }

    for (const subtaskId of [...task.subtasks]) {
      this.#deleteTaskRecursive(subtaskId);
    }

    this.#tasks.delete(id);
  }

  /**
   * Batch update multiple tasks
   * @param {string[]} ids - Task IDs to update
   * @param {Partial<Task>} updates - Update data
   * @returns {Object} Update result
   */
  batchUpdate(ids, updates) {
    const updated = [];
    const failed = [];

    for (const id of ids) {
      try {
        const task = this.updateTask(id, updates);
        updated.push(task);
      } catch (err) {
        failed.push({ id, error: err.message });
      }
    }

    return { updated, failed, count: updated.length };
  }

  /**
   * Get task statistics
   * @returns {Object} Task statistics
   */
  getStats() {
    const tasks = Array.from(this.#tasks.values());
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const pending = tasks.filter(t => t.status === 'backlog' || t.status === 'todo').length;
    
    const byPriority = {
      critical: tasks.filter(t => t.priority === 'critical').length,
      high: tasks.filter(t => t.priority === 'high').length,
      medium: tasks.filter(t => t.priority === 'medium').length,
      low: tasks.filter(t => t.priority === 'low').length,
    };

    const byQuadrant = {
      doFirst: tasks.filter(t => t.quadrant === 'urgent-important').length,
      schedule: tasks.filter(t => t.quadrant === 'not-urgent-important').length,
      delegate: tasks.filter(t => t.quadrant === 'urgent-not-important').length,
      eliminate: tasks.filter(t => t.quadrant === 'not-urgent-not-important').length,
    };

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Calculate average completion time
    const completedTasks = tasks.filter(t => t.status === 'done' && t.actualMinutes > 0);
    const avgCompletionTime = completedTasks.length > 0
      ? Math.round(completedTasks.reduce((sum, t) => sum + t.actualMinutes, 0) / completedTasks.length)
      : 0;

    return {
      total,
      completed,
      inProgress,
      pending,
      byPriority,
      byQuadrant,
      completionRate,
      averageCompletionTime: avgCompletionTime,
    };
  }
}

export default TaskDomain;
