/**
 * @fileoverview Task Repository with Eisenhower matrix queries for CogniMesh v5.0
 * @module db/repositories/tasks
 */

import { BaseRepository } from './base-repository.js';

const TASK_STATUS_TO_STORAGE = new Map([
  ['in-progress', 'running'],
  ['in_progress', 'running'],
  ['done', 'completed']
]);

function normalizeStatusForStorage(status) {
  if (typeof status !== 'string') {
    return status;
  }

  return TASK_STATUS_TO_STORAGE.get(status) || status;
}

function normalizeTaskWrite(data) {
  const normalized = { ...data };

  if (normalized.status !== undefined) {
    normalized.status = normalizeStatusForStorage(normalized.status);
  }

  if (normalized.due_date !== undefined && normalized.deadline_at === undefined) {
    normalized.deadline_at = normalized.due_date;
  } else if (normalized.deadline_at !== undefined && normalized.due_date === undefined) {
    normalized.due_date = normalized.deadline_at;
  }

  if (Array.isArray(normalized.tags)) {
    normalized.tags = JSON.stringify(normalized.tags);
  }

  return normalized;
}

function hydrateTask(task) {
  if (!task) {
    return task;
  }

  return {
    ...task,
    status: task.status === 'running' ? 'in-progress' : task.status,
    due_date: task.due_date ?? task.deadline_at ?? null
  };
}

/**
 * @typedef {Object} Task
 * @property {number} id - Task ID
 * @property {string} title - Task title
 * @property {string} [description] - Task description
 * @property {('urgent-important'|'not-urgent-important'|'urgent-not-important'|'not-urgent-not-important')} quadrant - Eisenhower quadrant
 * @property {('pending'|'in-progress'|'completed'|'cancelled')} status - Task status
 * @property {number} [priority] - Priority within quadrant (1-10)
 * @property {string} [due_date] - Due date (ISO string)
 * @property {number} [roadmap_id] - Associated roadmap ID
 * @property {number} [context_id] - Associated context ID
 * @property {string} [tags] - JSON array of tags
 * @property {number} [estimated_minutes] - Estimated time in minutes
 * @property {number} [actual_minutes] - Actual time spent in minutes
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 * @property {string} [completed_at] - Completion timestamp
 */

/**
 * @typedef {Object} EisenhowerQuadrant
 * @property {Task[]} urgentImportant - Do First
 * @property {Task[]} notUrgentImportant - Schedule
 * @property {Task[]} urgentNotImportant - Delegate
 * @property {Task[]} notUrgentNotImportant - Eliminate
 */

/**
 * @typedef {Object} TaskFilters
 * @property {string} [quadrant] - Filter by quadrant
 * @property {string} [status] - Filter by status
 * @property {number} [roadmap_id] - Filter by roadmap
 * @property {number} [context_id] - Filter by context
 * @property {boolean} [overdue] - Filter overdue tasks
 * @property {string} [tag] - Filter by tag
 */

/**
 * Task repository with Eisenhower matrix support
 * @extends BaseRepository
 */
export class TaskRepository extends BaseRepository {
  /** @type {string[]} */
  static COLUMNS = [
    'title',
    'description',
    'quadrant',
    'status',
    'priority',
    'due_date',
    'deadline_at',
    'roadmap_id',
    'context_id',
    'tags',
    'estimated_minutes',
    'actual_minutes',
    'completed_at'
  ];

  /**
   * Create a task repository
   * @param {import('../connection/index.js').ConnectionPool} pool - Connection pool
   */
  constructor(pool) {
    super(pool, 'tasks', 'id', TaskRepository.COLUMNS);
    this._availableTaskColumns = null;
    this._availableTaskColumnsPromise = null;
    this._dueDateExpression = null;
  }

  async findById(id) {
    return hydrateTask(await super.findById(id));
  }

  async findAll(filters = {}) {
    const normalizedFilters = {
      ...filters,
      where: filters.where ? { ...filters.where } : filters.where
    };

    if (normalizedFilters.where?.status !== undefined) {
      if (Array.isArray(normalizedFilters.where.status)) {
        normalizedFilters.where.status = normalizedFilters.where.status.map(normalizeStatusForStorage);
      } else if (
        normalizedFilters.where.status &&
        typeof normalizedFilters.where.status === 'object' &&
        'value' in normalizedFilters.where.status
      ) {
        normalizedFilters.where.status = {
          ...normalizedFilters.where.status,
          value: normalizeStatusForStorage(normalizedFilters.where.status.value)
        };
      } else {
        normalizedFilters.where.status = normalizeStatusForStorage(normalizedFilters.where.status);
      }
    }

    const tasks = await super.findAll(normalizedFilters);
    return tasks.map(hydrateTask);
  }

  async create(data) {
    const normalizedData = await this.#filterWriteColumns(normalizeTaskWrite(data));
    return hydrateTask(await super.create(normalizedData));
  }

  async update(id, data) {
    const normalizedData = await this.#filterWriteColumns(normalizeTaskWrite(data));
    return hydrateTask(await super.update(id, normalizedData));
  }

  /**
   * Get tasks organized by Eisenhower matrix quadrants
   * @param {Object} [options] - Options
   * @param {boolean} [options.includeCompleted=false] - Include completed tasks
   * @param {number} [options.limitPerQuadrant=50] - Max tasks per quadrant
   * @returns {Promise<EisenhowerQuadrant>}
   */
  async getEisenhowerMatrix(options = {}) {
    const { includeCompleted = false, limitPerQuadrant = 50 } = options;
    const dueDateExpression = await this.#getDueDateExpression();
    
    const baseWhere = includeCompleted ? '' : "status != 'completed'";
    
    const quadrants = [
      { key: 'urgentImportant', quadrant: 'urgent-important', label: 'do_first' },
      { key: 'notUrgentImportant', quadrant: 'not-urgent-important', label: 'schedule' },
      { key: 'urgentNotImportant', quadrant: 'urgent-not-important', label: 'delegate' },
      { key: 'notUrgentNotImportant', quadrant: 'not-urgent-not-important', label: 'eliminate' }
    ];

    const result = {
      urgentImportant: [],
      notUrgentImportant: [],
      urgentNotImportant: [],
      notUrgentNotImportant: []
    };

    for (const { key, quadrant } of quadrants) {
      let where = `quadrant = ?`;
      const params = [quadrant];
      
      if (baseWhere) {
        where += ` AND ${baseWhere}`;
      }

      const sql = `
        SELECT * FROM ${this.tableName} 
        WHERE ${where}
        ORDER BY priority DESC, ${dueDateExpression} ASC, created_at ASC
        LIMIT ?
      `;
      params.push(limitPerQuadrant);

      result[key] = (await this.pool.all(sql, params)).map(hydrateTask);
    }

    return result;
  }

  /**
   * Get tasks by quadrant
   * @param {string} quadrant - Quadrant name
   * @param {Object} [options] - Query options
   * @returns {Promise<Task[]>}
   */
  async findByQuadrant(quadrant, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    
    let where = { quadrant };
    if (status) {
      where.status = status;
    }

    return this.findAll({
      where,
      orderBy: 'priority',
      orderDirection: 'DESC',
      limit,
      offset
    });
  }

  /**
   * Get overdue tasks
   * @param {Object} [options] - Query options
   * @returns {Promise<Task[]>}
   */
  async findOverdue(options = {}) {
    const { limit = 50, includeCompleted = false } = options;
    const now = new Date().toISOString();
    const dueDateExpression = await this.#getDueDateExpression();

    let sql = `
      SELECT * FROM ${this.tableName} 
      WHERE ${dueDateExpression} < ? AND ${dueDateExpression} IS NOT NULL
    `;
    const params = [now];

    if (!includeCompleted) {
      sql += ` AND status != 'completed'`;
    }

    sql += ` ORDER BY ${dueDateExpression} ASC, priority DESC LIMIT ?`;
    params.push(limit);

    return (await this.pool.all(sql, params)).map(hydrateTask);
  }

  /**
   * Get tasks due today
   * @param {Object} [options] - Query options
   * @returns {Promise<Task[]>}
   */
  async findDueToday(options = {}) {
    const { includeCompleted = false } = options;
    const dueDateExpression = await this.#getDueDateExpression();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let sql = `
      SELECT * FROM ${this.tableName} 
      WHERE ${dueDateExpression} >= ? AND ${dueDateExpression} < ?
    `;
    const params = [today.toISOString(), tomorrow.toISOString()];

    if (!includeCompleted) {
      sql += ` AND status != 'completed'`;
    }

    sql += ` ORDER BY priority DESC, ${dueDateExpression} ASC`;

    return (await this.pool.all(sql, params)).map(hydrateTask);
  }

  /**
   * Get tasks due this week
   * @param {Object} [options] - Query options
   * @returns {Promise<Task[]>}
   */
  async findDueThisWeek(options = {}) {
    const { includeCompleted = false } = options;
    const dueDateExpression = await this.#getDueDateExpression();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    let sql = `
      SELECT * FROM ${this.tableName} 
      WHERE ${dueDateExpression} >= ? AND ${dueDateExpression} < ?
    `;
    const params = [today.toISOString(), nextWeek.toISOString()];

    if (!includeCompleted) {
      sql += ` AND status != 'completed'`;
    }

    sql += ` ORDER BY ${dueDateExpression} ASC, priority DESC`;

    return (await this.pool.all(sql, params)).map(hydrateTask);
  }

  /**
   * Find tasks by tag
   * @param {string} tag - Tag to search for
   * @param {Object} [options] - Query options
   * @returns {Promise<Task[]>}
   */
  async findByTag(tag, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE tags LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    return (await this.pool.all(sql, [`%"${tag}"%`, limit, offset])).map(hydrateTask);
  }

  /**
   * Find tasks by roadmap
   * @param {number} roadmapId - Roadmap ID
   * @param {Object} [options] - Query options
   * @returns {Promise<Task[]>}
   */
  async findByRoadmap(roadmapId, options = {}) {
    return this.findAll({
      where: { roadmap_id: roadmapId },
      orderBy: 'priority',
      orderDirection: 'DESC',
      limit: options.limit,
      offset: options.offset
    });
  }

  /**
   * Find tasks by context
   * @param {number} contextId - Context ID
   * @param {Object} [options] - Query options
   * @returns {Promise<Task[]>}
   */
  async findByContext(contextId, options = {}) {
    return this.findAll({
      where: { context_id: contextId },
      orderBy: 'created_at',
      orderDirection: 'DESC',
      limit: options.limit,
      offset: options.offset
    });
  }

  /**
   * Complete a task
   * @param {number} id - Task ID
   * @returns {Promise<Task|undefined>}
   */
  async complete(id) {
    const completedAt = new Date().toISOString();
    return this.update(id, {
      status: 'completed',
      completed_at: completedAt
    });
  }

  /**
   * Move task to different quadrant
   * @param {number} id - Task ID
   * @param {string} quadrant - New quadrant
   * @returns {Promise<Task|undefined>}
   */
  async moveToQuadrant(id, quadrant) {
    const validQuadrants = [
      'urgent-important',
      'not-urgent-important',
      'urgent-not-important',
      'not-urgent-not-important'
    ];
    
    if (!validQuadrants.includes(quadrant)) {
      throw new Error(`Invalid quadrant: ${quadrant}`);
    }

    return this.update(id, { quadrant });
  }

  /**
   * Update task priority
   * @param {number} id - Task ID
   * @param {number} priority - New priority (1-10)
   * @returns {Promise<Task|undefined>}
   */
  async setPriority(id, priority) {
    const normalizedPriority = Math.max(1, Math.min(10, priority));
    return this.update(id, { priority: normalizedPriority });
  }

  /**
   * Track time spent on task
   * @param {number} id - Task ID
   * @param {number} minutes - Minutes to add
   * @returns {Promise<Task|undefined>}
   */
  async addTimeSpent(id, minutes) {
    const sql = `
      UPDATE ${this.tableName} 
      SET actual_minutes = COALESCE(actual_minutes, 0) + ?
      WHERE ${this.primaryKey} = ?
      RETURNING *
    `;
    return hydrateTask(await this.pool.get(sql, [minutes, id]));
  }

  /**
   * Get task statistics
   * @param {Object} [options] - Query options
   * @returns {Promise<Object>}
   */
  async getStatistics(options = {}) {
    const { since, until } = options;
    
    let whereClause = '';
    const params = [];
    
    if (since) {
      whereClause += whereClause ? ' AND created_at >= ?' : 'WHERE created_at >= ?';
      params.push(since);
    }
    if (until) {
      whereClause += whereClause ? ' AND created_at <= ?' : 'WHERE created_at <= ?';
      params.push(until);
    }

    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status IN ('in-progress', 'running') THEN 1 END) as in_progress,
        COUNT(CASE WHEN quadrant = 'urgent-important' THEN 1 END) as do_first,
        COUNT(CASE WHEN quadrant = 'not-urgent-important' THEN 1 END) as schedule,
        COUNT(CASE WHEN quadrant = 'urgent-not-important' THEN 1 END) as delegate,
        COUNT(CASE WHEN quadrant = 'not-urgent-not-important' THEN 1 END) as eliminate,
        SUM(estimated_minutes) as total_estimated_minutes,
        SUM(actual_minutes) as total_actual_minutes
      FROM ${this.tableName}
      ${whereClause}
    `;

    return this.pool.get(sql, params);
  }

  /**
   * Get completion rate by quadrant
   * @returns {Promise<Object[]>}
   */
  async getCompletionByQuadrant() {
    const sql = `
      SELECT 
        quadrant,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        ROUND(
          COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 
          2
        ) as completion_rate
      FROM ${this.tableName}
      GROUP BY quadrant
    `;

    return this.pool.all(sql, []);
  }

  /**
   * Search tasks
   * @param {string} query - Search query
   * @param {Object} [options] - Search options
   * @returns {Promise<Task[]>}
   */
  async search(query, options = {}) {
    const { limit = 20 } = options;
    const searchPattern = `%${query}%`;

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE title LIKE ? OR description LIKE ? OR tags LIKE ?
      ORDER BY 
        CASE WHEN title LIKE ? THEN 1 ELSE 2 END,
        priority DESC,
        created_at DESC
      LIMIT ?
    `;

    const exactPattern = `%${query}%`;
    const tasks = await this.pool.all(sql, [
      searchPattern, 
      searchPattern, 
      searchPattern,
      exactPattern,
      limit
    ]);
    return tasks.map(hydrateTask);
  }

  /**
   * Bulk update task statuses
   * @param {number[]} ids - Task IDs
   * @param {string} status - New status
   * @returns {Promise<number>} Number of affected rows
   */
  async bulkUpdateStatus(ids, status) {
    if (!ids || ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const sql = `
      UPDATE ${this.tableName} 
      SET status = ?, updated_at = datetime('now')
      WHERE ${this.primaryKey} IN (${placeholders})
    `;

    const result = await this.pool.run(sql, [normalizeStatusForStorage(status), ...ids]);
    return result.changes;
  }

  async #filterWriteColumns(data) {
    const availableColumns = await this.#getAvailableColumns();
    return Object.fromEntries(
      Object.entries(data).filter(([key]) => availableColumns.has(key))
    );
  }

  async #getAvailableColumns() {
    if (this._availableTaskColumns) {
      return this._availableTaskColumns;
    }

    if (!this._availableTaskColumnsPromise) {
      this._availableTaskColumnsPromise = this.pool
        .all(`PRAGMA table_info(${this.tableName})`)
        .then((rows) => {
          this._availableTaskColumns = new Set(rows.map((row) => row.name));
          return this._availableTaskColumns;
        })
        .catch(() => {
          this._availableTaskColumns = new Set(this.columns);
          return this._availableTaskColumns;
        });
    }

    return this._availableTaskColumnsPromise;
  }

  async #getDueDateExpression() {
    if (this._dueDateExpression) {
      return this._dueDateExpression;
    }

    const availableColumns = await this.#getAvailableColumns();

    if (availableColumns.has('due_date') && availableColumns.has('deadline_at')) {
      this._dueDateExpression = 'COALESCE(due_date, deadline_at)';
    } else if (availableColumns.has('due_date')) {
      this._dueDateExpression = 'due_date';
    } else if (availableColumns.has('deadline_at')) {
      this._dueDateExpression = 'deadline_at';
    } else {
      this._dueDateExpression = 'NULL';
    }

    return this._dueDateExpression;
  }

  /**
   * Get tasks without a quadrant (inbox)
   * @param {Object} [options] - Query options
   * @returns {Promise<Task[]>}
   */
  async getInbox(options = {}) {
    const { limit = 50 } = options;
    
    return this.findAll({
      where: { 
        quadrant: null,
        status: { operator: '!=', value: 'completed' }
      },
      orderBy: 'created_at',
      orderDirection: 'DESC',
      limit
    });
  }
}

export default TaskRepository;
