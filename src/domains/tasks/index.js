/**
 * @fileoverview Tasks Domain - Task management with Eisenhower matrix
 * @module domains/tasks
 *
 * Uses SQLite repository for persistence when available,
 * falls back to in-memory Map when no repository is provided.
 * 
 * Relationship with Issues (src/domains/issues):
 * - Tasks: Simple todo items, Eisenhower matrix prioritization, agent execution
 * - Issues: Full ticket/project management with comments, labels, assignments
 * - Tasks can be linked to Issues via the issueId field
 * - Use tasks for quick todos; use issues for collaborative project work
 */

/**
 * @typedef {'urgent-important' | 'not-urgent-important' | 'urgent-not-important' | 'not-urgent-not-important'} EisenhowerQuadrant
 * @typedef {'critical' | 'high' | 'medium' | 'low'} TaskPriority
 * @typedef {'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'archived'} TaskStatus
 */

/**
 * Manages tasks with Eisenhower matrix prioritization.
 * Persists to SQLite when a repository is available.
 */
export class TaskDomain {
  /** @type {Map<string, Object>} In-memory cache */
  #tasks = new Map();
  /** @type {Object|null} TaskRepository instance */
  #repo = null;

  /**
   * @param {Object} [options]
   * @param {Object} [options.repositories] - RepositoryFactory instance
   */
  constructor(options = {}) {
    this.#tasks = new Map();
    this.#repo = options.repositories?.tasks ?? null;
  }

  /**
   * Load all tasks from the repository into the cache
   * Call once after construction to hydrate the in-memory cache.
   */
  async loadFromRepository() {
    if (!this.#repo) return;
    try {
      const rows = await this.#repo.findAll({ limit: 10000 });
      for (const row of rows) {
        const task = this.#hydrateFromRow(row);
        this.#tasks.set(task.id, task);
      }
    } catch {
      // Repository not ready or table doesn't exist — continue in-memory
    }
  }

  #generateId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  #now() {
    return new Date().toISOString();
  }

  #nextTimestamp(previousTimestamp) {
    const now = Date.now();
    const previous = previousTimestamp ? new Date(previousTimestamp).getTime() : 0;
    return new Date(now <= previous ? previous + 1 : now).toISOString();
  }

  #calculateQuadrant(urgent, important) {
    if (urgent && important) return 'urgent-important';
    if (!urgent && important) return 'not-urgent-important';
    if (urgent && !important) return 'urgent-not-important';
    return 'not-urgent-not-important';
  }

  /** Convert a DB row to the domain task shape */
  #hydrateFromRow(row) {
    return {
      id: String(row.id),
      title: row.title || '',
      description: row.description || '',
      status: row.status === 'running' ? 'in_progress' : (row.status || 'backlog'),
      priority: row.priority || 'medium',
      urgent: (row.quadrant || '').includes('urgent-') && !(row.quadrant || '').includes('not-urgent'),
      important: (row.quadrant || '').includes('important') && !(row.quadrant || '').includes('not-important'),
      quadrant: row.quadrant || 'not-urgent-not-important',
      roadmapNodeId: row.roadmap_id ? String(row.roadmap_id) : null,
      issueId: row.issue_id || null,
      parentTaskId: null,
      subtasks: [],
      tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
      dueDate: row.due_date || row.deadline_at || null,
      estimatedMinutes: row.estimated_minutes || 0,
      actualMinutes: row.actual_minutes || 0,
      createdAt: row.created_at || this.#now(),
      updatedAt: row.updated_at || this.#now(),
      createdBy: 'system',
      assignees: [],
      attachments: []
    };
  }

  /** Convert a domain task to the DB write shape */
  #toRow(task) {
    return {
      title: task.title,
      description: task.description,
      quadrant: task.quadrant,
      status: task.status === 'in_progress' ? 'running' : task.status,
      priority: task.priority,
      due_date: task.dueDate,
      roadmap_id: task.roadmapNodeId ? Number(task.roadmapNodeId) || null : null,
      issue_id: task.issueId,
      tags: JSON.stringify(task.tags || []),
      estimated_minutes: task.estimatedMinutes,
      actual_minutes: task.actualMinutes
    };
  }

  /**
   * Create a new task
   * @param {Object} data - Task creation data
   * @returns {Object} Created task
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
      issueId: data.issueId ?? null,
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

    if (task.parentTaskId) {
      const parent = this.#tasks.get(task.parentTaskId);
      if (parent) {
        parent.subtasks.push(task.id);
      }
    }

    this.#tasks.set(task.id, task);

    // Persist to SQLite asynchronously (fire-and-forget)
    if (this.#repo) {
      this.#repo.create(this.#toRow(task)).catch(() => {});
    }

    return task;
  }

  /**
   * Get a task by ID
   * @param {string} id
   * @returns {Object|undefined}
   */
  getTask(id) {
    if (!id || typeof id !== 'string') return undefined;
    return this.#tasks.get(id);
  }

  /**
   * Update an existing task
   * @param {string} id
   * @param {Object} data
   * @returns {Object} Updated task
   */
  updateTask(id, data) {
    const task = this.#tasks.get(id);
    if (!task) throw new Error(`Task not found: ${id}`);

    const allowedUpdates = [
      'title', 'description', 'status', 'priority', 'urgent', 'important',
      'dueDate', 'estimatedMinutes', 'actualMinutes', 'tags', 'assignees'
    ];

    for (const key of allowedUpdates) {
      if (key in data) task[key] = data[key];
    }

    if ('urgent' in data || 'important' in data) {
      task.quadrant = this.#calculateQuadrant(task.urgent, task.important);
    }

    task.updatedAt = this.#nextTimestamp(task.updatedAt);
    this.#tasks.set(id, task);

    // Persist update
    if (this.#repo) {
      const numericId = Number(id.replace(/\D/g, '')) || id;
      this.#repo.update(numericId, this.#toRow(task)).catch(() => {});
    }

    return task;
  }

  /**
   * Delete a task
   * @param {string} id
   * @returns {boolean}
   */
  deleteTask(id) {
    const task = this.#tasks.get(id);
    if (!task) return false;

    if (task.parentTaskId) {
      const parent = this.#tasks.get(task.parentTaskId);
      if (parent) {
        parent.subtasks = parent.subtasks.filter(subId => subId !== id);
      }
    }

    this.#deleteTaskRecursive(id);

    // Persist deletion
    if (this.#repo) {
      const numericId = Number(id.replace(/\D/g, '')) || id;
      this.#repo.delete(numericId).catch(() => {});
    }

    return true;
  }

  /**
   * Organize tasks by Eisenhower matrix
   * @param {Object} [filters]
   * @returns {Object}
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

  linkToRoadmap(taskId, nodeId) {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.roadmapNodeId = nodeId;
    task.updatedAt = this.#nextTimestamp(task.updatedAt);
    this.#tasks.set(taskId, task);
    return task;
  }

  unlinkFromRoadmap(taskId) {
    return this.updateTask(taskId, { roadmapNodeId: null });
  }

  /**
   * Link a task to an issue
   * @param {string} taskId - Task ID
   * @param {string} issueId - Issue ID
   * @returns {Object} Updated task
   */
  linkToIssue(taskId, issueId) {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.issueId = issueId;
    task.updatedAt = this.#nextTimestamp(task.updatedAt);
    this.#tasks.set(taskId, task);
    
    // Persist to repository if available
    if (this.#repo) {
      const numericId = Number(taskId.replace(/\D/g, '')) || taskId;
      this.#repo.update(numericId, { 
        issue_id: issueId,
        updated_at: task.updatedAt 
      }).catch(() => {});
    }
    
    return task;
  }

  /**
   * Unlink task from issue
   * @param {string} taskId - Task ID
   * @returns {Object} Updated task
   */
  unlinkFromIssue(taskId) {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.issueId = null;
    task.updatedAt = this.#nextTimestamp(task.updatedAt);
    this.#tasks.set(taskId, task);
    
    if (this.#repo) {
      const numericId = Number(taskId.replace(/\D/g, '')) || taskId;
      this.#repo.update(numericId, { 
        issue_id: null,
        updated_at: task.updatedAt 
      }).catch(() => {});
    }
    
    return task;
  }

  addAttachment(taskId, fileId) {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!task.attachments.includes(fileId)) {
      task.attachments.push(fileId);
      task.updatedAt = this.#nextTimestamp(task.updatedAt);
      this.#tasks.set(taskId, task);
    }
    return task;
  }

  removeAttachment(taskId, fileId) {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.attachments = task.attachments.filter(id => id !== fileId);
    task.updatedAt = this.#nextTimestamp(task.updatedAt);
    this.#tasks.set(taskId, task);
    return task;
  }

  listTasks(filters = {}) {
    let tasks = Array.from(this.#tasks.values());

    if (filters.status) tasks = tasks.filter(t => t.status === filters.status);
    if (filters.priority) tasks = tasks.filter(t => t.priority === filters.priority);
    if (filters.quadrant) tasks = tasks.filter(t => t.quadrant === filters.quadrant);
    if (filters.assignee) tasks = tasks.filter(t => t.assignees.includes(filters.assignee));
    if (filters.roadmapNodeId) tasks = tasks.filter(t => t.roadmapNodeId === filters.roadmapNodeId);
    if (filters.issueId) tasks = tasks.filter(t => t.issueId === filters.issueId);
    if (filters.tags?.length > 0) {
      tasks = tasks.filter(t => filters.tags.every(tag => t.tags.includes(tag)));
    }

    return tasks;
  }

  getDueToday(assignee) {
    const today = new Date().toISOString().split('T')[0];
    return this.listTasks({ assignee }).filter(t => t.dueDate?.startsWith(today));
  }

  getOverdue(assignee) {
    const now = new Date().toISOString();
    return this.listTasks({ assignee }).filter(t =>
      t.dueDate && t.dueDate < now && t.status !== 'done' && t.status !== 'archived'
    );
  }

  logTime(taskId, minutes) {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    task.actualMinutes += minutes;
    task.updatedAt = this.#nextTimestamp(task.updatedAt);
    this.#tasks.set(taskId, task);
    return task;
  }

  #deleteTaskRecursive(id) {
    const task = this.#tasks.get(id);
    if (!task) return;
    for (const subtaskId of [...task.subtasks]) {
      this.#deleteTaskRecursive(subtaskId);
    }
    this.#tasks.delete(id);
  }

  batchUpdate(ids, updates) {
    const updated = [];
    const failed = [];
    for (const id of ids) {
      try {
        updated.push(this.updateTask(id, updates));
      } catch (err) {
        failed.push({ id, error: err.message });
      }
    }
    return { updated, failed, count: updated.length };
  }

  getStats() {
    const tasks = Array.from(this.#tasks.values());
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const pending = tasks.filter(t => t.status === 'backlog' || t.status === 'todo').length;

    return {
      total,
      completed,
      inProgress,
      pending,
      byPriority: {
        critical: tasks.filter(t => t.priority === 'critical').length,
        high: tasks.filter(t => t.priority === 'high').length,
        medium: tasks.filter(t => t.priority === 'medium').length,
        low: tasks.filter(t => t.priority === 'low').length,
      },
      byQuadrant: {
        doFirst: tasks.filter(t => t.quadrant === 'urgent-important').length,
        schedule: tasks.filter(t => t.quadrant === 'not-urgent-important').length,
        delegate: tasks.filter(t => t.quadrant === 'urgent-not-important').length,
        eliminate: tasks.filter(t => t.quadrant === 'not-urgent-not-important').length,
      },
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      averageCompletionTime: (() => {
        const ct = tasks.filter(t => t.status === 'done' && t.actualMinutes > 0);
        return ct.length > 0 ? Math.round(ct.reduce((s, t) => s + t.actualMinutes, 0) / ct.length) : 0;
      })(),
    };
  }
}

export default TaskDomain;
