/**
 * @fileoverview Roadmap Repository with progress tracking for CogniMesh v5.0
 * @module db/repositories/roadmaps
 */

import { BaseRepository } from './base-repository.js';

function normalizeRoadmapWrite(data) {
  const normalized = { ...data };

  if (normalized.name !== undefined && normalized.title === undefined) {
    normalized.title = normalized.name;
  } else if (normalized.title !== undefined && normalized.name === undefined) {
    normalized.name = normalized.title;
  }

  if (normalized.start_date !== undefined && normalized.started_at === undefined) {
    normalized.started_at = normalized.start_date;
  } else if (normalized.started_at !== undefined && normalized.start_date === undefined) {
    normalized.start_date = normalized.started_at;
  }

  if (normalized.target_date !== undefined && normalized.target_at === undefined) {
    normalized.target_at = normalized.target_date;
  } else if (normalized.target_at !== undefined && normalized.target_date === undefined) {
    normalized.target_date = normalized.target_at;
  }

  if (Array.isArray(normalized.milestones)) {
    normalized.milestones = JSON.stringify(normalized.milestones);
  }

  return normalized;
}

function hydrateRoadmap(roadmap) {
  if (!roadmap) {
    return roadmap;
  }

  return {
    ...roadmap,
    name: roadmap.name ?? roadmap.title,
    start_date: roadmap.start_date ?? roadmap.started_at ?? null,
    target_date: roadmap.target_date ?? roadmap.target_at ?? null
  };
}

/**
 * @typedef {Object} Roadmap
 * @property {number} id - Roadmap ID
 * @property {string} name - Roadmap name
 * @property {string} [description] - Roadmap description
 * @property {('active'|'completed'|'archived'|'draft')} status - Roadmap status
 * @property {number} [parent_id] - Parent roadmap ID (for nested roadmaps)
 * @property {string} [start_date] - Start date (ISO string)
 * @property {string} [target_date] - Target completion date (ISO string)
 * @property {string} [completed_at] - Completion timestamp
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 */

/**
 * @typedef {Object} RoadmapProgress
 * @property {number} roadmapId - Roadmap ID
 * @property {number} totalTasks - Total number of tasks
 * @property {number} completedTasks - Number of completed tasks
 * @property {number} pendingTasks - Number of pending tasks
 * @property {number} inProgressTasks - Number of in-progress tasks
 * @property {number} completionPercentage - Completion percentage (0-100)
 * @property {number} estimatedHours - Total estimated hours
 * @property {number} actualHours - Total actual hours spent
 * @property {number} remainingHours - Estimated remaining hours
 */

/**
 * @typedef {Object} RoadmapMilestone
 * @property {number} id - Milestone ID
 * @property {number} roadmap_id - Roadmap ID
 * @property {string} name - Milestone name
 * @property {string} [description] - Milestone description
 * @property {string} target_date - Target date
 * @property {boolean} achieved - Whether milestone is achieved
 * @property {string} [achieved_at] - Achievement timestamp
 */

/**
 * Roadmap repository with progress tracking
 * @extends BaseRepository
 */
export class RoadmapRepository extends BaseRepository {
  /** @type {string[]} */
  static COLUMNS = [
    'name',
    'title',
    'description',
    'status',
    'parent_id',
    'start_date',
    'started_at',
    'target_date',
    'target_at',
    'milestones',
    'completed_at'
  ];

  /**
   * Create a roadmap repository
   * @param {import('../connection/index.js').ConnectionPool} pool - Connection pool
   */
  constructor(pool) {
    super(pool, 'roadmaps', 'id', RoadmapRepository.COLUMNS);
  }

  async findById(id) {
    return hydrateRoadmap(await super.findById(id));
  }

  async findAll(filters = {}) {
    const roadmaps = await super.findAll(filters);
    return roadmaps.map(hydrateRoadmap);
  }

  async create(data) {
    return hydrateRoadmap(await super.create(normalizeRoadmapWrite(data)));
  }

  async update(id, data) {
    return hydrateRoadmap(await super.update(id, normalizeRoadmapWrite(data)));
  }

  /**
   * Find roadmaps by status
   * @param {string} status - Roadmap status
   * @param {Object} [options] - Query options
   * @returns {Promise<Roadmap[]>}
   */
  async findByStatus(status, options = {}) {
    return this.findAll({
      where: { status },
      orderBy: 'updated_at',
      orderDirection: 'DESC',
      limit: options.limit,
      offset: options.offset
    });
  }

  /**
   * Find child roadmaps
   * @param {number} parentId - Parent roadmap ID
   * @returns {Promise<Roadmap[]>}
   */
  async findChildren(parentId) {
    return this.findAll({
      where: { parent_id: parentId },
      orderBy: 'created_at',
      orderDirection: 'ASC'
    });
  }

  /**
   * Find top-level roadmaps (no parent)
   * @param {Object} [options] - Query options
   * @returns {Promise<Roadmap[]>}
   */
  async findTopLevel(options = {}) {
    return this.findAll({
      where: { parent_id: null },
      orderBy: 'updated_at',
      orderDirection: 'DESC',
      limit: options.limit,
      offset: options.offset
    });
  }

  /**
   * Get roadmap with all descendants
   * @param {number} id - Roadmap ID
   * @returns {Promise<Object>} Roadmap with children array
   */
  async getWithDescendants(id) {
    const roadmap = await this.findById(id);
    if (!roadmap) return undefined;

    const descendants = await this.#getDescendantsRecursive(id);
    return { ...roadmap, children: descendants };
  }

  /**
   * Recursively get all descendants
   * @private
   * @param {number} parentId - Parent ID
   * @returns {Promise<Object[]>}
   */
  async #getDescendantsRecursive(parentId) {
    const children = await this.findChildren(parentId);
    
    for (const child of children) {
      const subChildren = await this.#getDescendantsRecursive(child.id);
      child.children = subChildren;
    }
    
    return children;
  }

  /**
   * Get roadmap progress statistics
   * @param {number} id - Roadmap ID
   * @returns {Promise<RoadmapProgress>}
   */
  async getProgress(id) {
    const sql = `
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
        COUNT(CASE WHEN status IN ('in-progress', 'running') THEN 1 END) as in_progress_tasks,
        SUM(estimated_minutes) / 60.0 as estimated_hours,
        SUM(actual_minutes) / 60.0 as actual_hours
      FROM tasks
      WHERE roadmap_id = ?
    `;

    const result = await this.pool.get(sql, [id]);
    
    if (!result || result.total_tasks === 0) {
      return {
        roadmapId: id,
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        completionPercentage: 0,
        estimatedHours: 0,
        actualHours: 0,
        remainingHours: 0
      };
    }

    const total = result.total_tasks;
    const completed = result.completed_tasks;
    const estimated = result.estimated_hours || 0;
    const actual = result.actual_hours || 0;

    return {
      roadmapId: id,
      totalTasks: total,
      completedTasks: completed,
      pendingTasks: result.pending_tasks,
      inProgressTasks: result.in_progress_tasks,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      estimatedHours: Math.round(estimated * 100) / 100,
      actualHours: Math.round(actual * 100) / 100,
      remainingHours: Math.max(0, Math.round((estimated - actual) * 100) / 100)
    };
  }

  /**
   * Get progress for multiple roadmaps
   * @param {number[]} ids - Roadmap IDs
   * @returns {Promise<RoadmapProgress[]>}
   */
  async getBulkProgress(ids) {
    if (!ids || ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    const sql = `
      SELECT 
        roadmap_id,
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
        COUNT(CASE WHEN status IN ('in-progress', 'running') THEN 1 END) as in_progress_tasks,
        SUM(estimated_minutes) / 60.0 as estimated_hours,
        SUM(actual_minutes) / 60.0 as actual_hours
      FROM tasks
      WHERE roadmap_id IN (${placeholders})
      GROUP BY roadmap_id
    `;

    const results = await this.pool.all(sql, ids);
    
    return ids.map(id => {
      const result = results.find(r => r.roadmap_id === id);
      
      if (!result) {
        return {
          roadmapId: id,
          totalTasks: 0,
          completedTasks: 0,
          pendingTasks: 0,
          inProgressTasks: 0,
          completionPercentage: 0,
          estimatedHours: 0,
          actualHours: 0,
          remainingHours: 0
        };
      }

      const total = result.total_tasks;
      const completed = result.completed_tasks;
      const estimated = result.estimated_hours || 0;
      const actual = result.actual_hours || 0;

      return {
        roadmapId: id,
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: result.pending_tasks,
        inProgressTasks: result.in_progress_tasks,
        completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        estimatedHours: Math.round(estimated * 100) / 100,
        actualHours: Math.round(actual * 100) / 100,
        remainingHours: Math.max(0, Math.round((estimated - actual) * 100) / 100)
      };
    });
  }

  /**
   * Get aggregated progress for a roadmap including all descendants
   * @param {number} id - Roadmap ID
   * @returns {Promise<RoadmapProgress>}
   */
  async getAggregatedProgress(id) {
    // Get all descendant IDs including self
    const descendantIds = await this.#getAllDescendantIds(id);
    descendantIds.push(id);

    const placeholders = descendantIds.map(() => '?').join(',');
    const sql = `
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
        COUNT(CASE WHEN status IN ('in-progress', 'running') THEN 1 END) as in_progress_tasks,
        SUM(estimated_minutes) / 60.0 as estimated_hours,
        SUM(actual_minutes) / 60.0 as actual_hours
      FROM tasks
      WHERE roadmap_id IN (${placeholders})
    `;

    const result = await this.pool.get(sql, descendantIds);
    
    const total = result.total_tasks || 0;
    const completed = result.completed_tasks || 0;
    const estimated = result.estimated_hours || 0;
    const actual = result.actual_hours || 0;

    return {
      roadmapId: id,
      totalTasks: total,
      completedTasks: completed,
      pendingTasks: result.pending_tasks || 0,
      inProgressTasks: result.in_progress_tasks || 0,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      estimatedHours: Math.round(estimated * 100) / 100,
      actualHours: Math.round(actual * 100) / 100,
      remainingHours: Math.max(0, Math.round((estimated - actual) * 100) / 100)
    };
  }

  /**
   * Get all descendant IDs recursively
   * @private
   * @param {number} parentId - Parent ID
   * @returns {Promise<number[]>}
   */
  async #getAllDescendantIds(parentId) {
    const sql = `SELECT id FROM ${this.tableName} WHERE parent_id = ?`;
    const children = await this.pool.all(sql, [parentId]);
    
    let ids = children.map(c => c.id);
    
    for (const child of children) {
      const subIds = await this.#getAllDescendantIds(child.id);
      ids = ids.concat(subIds);
    }
    
    return ids;
  }

  /**
   * Mark roadmap as completed
   * @param {number} id - Roadmap ID
   * @returns {Promise<Roadmap|undefined>}
   */
  async complete(id) {
    const completedAt = new Date().toISOString();
    return this.update(id, {
      status: 'completed',
      completed_at: completedAt
    });
  }

  /**
   * Archive a roadmap
   * @param {number} id - Roadmap ID
   * @returns {Promise<Roadmap|undefined>}
   */
  async archive(id) {
    return this.update(id, { status: 'archived' });
  }

  /**
   * Activate a roadmap
   * @param {number} id - Roadmap ID
   * @returns {Promise<Roadmap|undefined>}
   */
  async activate(id) {
    return this.update(id, { status: 'active' });
  }

  /**
   * Get overdue roadmaps
   * @returns {Promise<Roadmap[]>}
   */
  async findOverdue() {
    const now = new Date().toISOString();
    
    return this.findAll({
      where: {
        target_date: { operator: '<', value: now },
        status: { operator: '!=', value: 'completed' }
      },
      orderBy: 'target_date',
      orderDirection: 'ASC'
    });
  }

  /**
   * Get roadmaps starting soon
   * @param {number} [days=7] - Days to look ahead
   * @returns {Promise<Roadmap[]>}
   */
  async findStartingSoon(days = 7) {
    const now = new Date().toISOString();
    const future = new Date();
    future.setDate(future.getDate() + days);

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE COALESCE(start_date, started_at) >= ? AND COALESCE(start_date, started_at) <= ?
      AND status IN ('draft', 'active')
      ORDER BY COALESCE(start_date, started_at) ASC
    `;

    return (await this.pool.all(sql, [now, future.toISOString()])).map(hydrateRoadmap);
  }

  /**
   * Get roadmaps with upcoming deadlines
   * @param {number} [days=7] - Days to look ahead
   * @returns {Promise<Array<Roadmap & {daysRemaining: number}>>}
   */
  async findUpcomingDeadlines(days = 7) {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    const sql = `
      SELECT *, 
        julianday(COALESCE(target_date, target_at)) - julianday('now') as days_remaining
      FROM ${this.tableName}
      WHERE COALESCE(target_date, target_at) >= ? AND COALESCE(target_date, target_at) <= ?
      AND status IN ('draft', 'active')
      ORDER BY COALESCE(target_date, target_at) ASC
    `;

    const results = await this.pool.all(sql, [
      now.toISOString(), 
      future.toISOString()
    ]);

    return results.map(r => ({
      ...hydrateRoadmap(r),
      daysRemaining: Math.ceil(r.days_remaining)
    }));
  }

  /**
   * Search roadmaps
   * @param {string} query - Search query
   * @param {Object} [options] - Search options
   * @returns {Promise<Roadmap[]>}
   */
  async search(query, options = {}) {
    const { limit = 20 } = options;
    const searchPattern = `%${query}%`;

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE COALESCE(name, title) LIKE ? OR description LIKE ?
      ORDER BY 
        CASE WHEN COALESCE(name, title) LIKE ? THEN 1 ELSE 2 END,
        updated_at DESC
      LIMIT ?
    `;

    const exactPattern = `%${query}%`;
    const roadmaps = await this.pool.all(sql, [
      searchPattern, 
      searchPattern,
      exactPattern,
      limit
    ]);
    return roadmaps.map(hydrateRoadmap);
  }

  /**
   * Get roadmap statistics
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as top_level
      FROM ${this.tableName}
    `;

    return this.pool.get(sql, []);
  }

  /**
   * Move roadmap to different parent
   * @param {number} id - Roadmap ID
   * @param {number|null} parentId - New parent ID (null for top-level)
   * @returns {Promise<Roadmap|undefined>}
   */
  async moveToParent(id, parentId) {
    // Prevent circular references
    if (parentId !== null) {
      const descendantIds = await this.#getAllDescendantIds(id);
      if (descendantIds.includes(parentId)) {
        throw new Error('Cannot move roadmap to its own descendant');
      }
    }

    return this.update(id, { parent_id: parentId });
  }
}

export default RoadmapRepository;
