/**
 * @fileoverview Roadmap Gateway - Data access layer for roadmaps with caching
 * @module composition/roadmap-gateway
 */

import { EventEmitter } from 'events';

/**
 * Roadmap data structure
 * @typedef {Object} Roadmap
 * @property {string} id - Unique identifier
 * @property {string} title - Roadmap title
 * @property {string} description - Roadmap description
 * @property {string} status - Roadmap status (draft, active, completed, archived)
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {Array<Object>} milestones - Array of milestones
 * @property {Object} metadata - Additional metadata
 */

/**
 * Filter options for roadmap queries
 * @typedef {Object} RoadmapFilters
 * @property {string} [status] - Filter by status
 * @property {Date} [createdAfter] - Filter by creation date
 * @property {Date} [createdBefore] - Filter by creation date
 * @property {string} [search] - Search in title/description
 * @property {number} [limit=50] - Max results
 * @property {number} [offset=0] - Pagination offset
 * @property {string} [sortBy='createdAt'] - Sort field
 * @property {'asc'|'desc'} [sortOrder='desc'] - Sort direction
 */

/**
 * Progress data structure
 * @typedef {Object} Progress
 * @property {string} roadmapId - Associated roadmap ID
 * @property {number} percentComplete - Overall completion percentage
 * @property {number} completedMilestones - Number of completed milestones
 * @property {number} totalMilestones - Total number of milestones
 * @property {Array<Object>} milestoneProgress - Per-milestone progress
 * @property {Date} lastUpdated - Last progress update
 */

/**
 * Cache entry wrapper
 * @typedef {Object} CacheEntry
 * @property {any} value - Cached value
 * @property {number} expiresAt - Expiration timestamp
 */

/**
 * Roadmap Gateway class for roadmap data access and caching
 * @extends EventEmitter
 */
export class RoadmapGateway extends EventEmitter {
  /**
   * Database gateway instance
   * @type {import('./db-gateway.js').DBGateway}
   * @private
   */
  #db;

  /**
   * In-memory cache storage
   * @type {Map<string, CacheEntry>}
   * @private
   */
  #cache = new Map();

  /**
   * Default cache TTL in milliseconds
   * @type {number}
   * @private
   */
  #defaultTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Cache statistics
   * @type {{hits: number, misses: number, evictions: number}}
   * @private
   */
  #cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  /**
   * Cleanup interval for expired cache entries
   * @type {NodeJS.Timeout|null}
   * @private
   */
  #cleanupInterval = null;

  /**
   * Creates a new RoadmapGateway instance
   * @param {import('./db-gateway.js').DBGateway} dbGateway - Database gateway instance
   * @param {Object} [options={}] - Gateway options
   * @param {number} [options.cacheTTL=300000] - Cache TTL in milliseconds
   */
  constructor(dbGateway, options = {}) {
    super();
    this.#db = dbGateway;
    this.#defaultTTL = options.cacheTTL || this.#defaultTTL;
    
    // Start cache cleanup
    this.#cleanupInterval = setInterval(() => {
      this.#cleanupCache();
    }, 60000); // Clean every minute
  }

  /**
   * Generates a cache key
   * @param {string} prefix - Key prefix
   * @param {string|Object} identifier - Unique identifier
   * @returns {string} Cache key
   * @private
   */
  #getCacheKey(prefix, identifier) {
    const id = typeof identifier === 'object' ? JSON.stringify(identifier) : String(identifier);
    return `roadmap:${prefix}:${id}`;
  }

  /**
   * Gets a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null
   * @private
   */
  #getFromCache(key) {
    const entry = this.#cache.get(key);
    
    if (!entry) {
      this.#cacheStats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.#cache.delete(key);
      this.#cacheStats.misses++;
      this.#cacheStats.evictions++;
      return null;
    }

    this.#cacheStats.hits++;
    return entry.value;
  }

  /**
   * Sets a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} [ttl] - Custom TTL in milliseconds
   * @private
   */
  #setInCache(key, value, ttl) {
    this.#cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl || this.#defaultTTL)
    });
  }

  /**
   * Invalidates cache entries matching a pattern
   * @param {string} pattern - Key pattern to match
   * @private
   */
  #invalidateCache(pattern) {
    const regex = new RegExp(pattern);
    for (const key of this.#cache.keys()) {
      if (regex.test(key)) {
        this.#cache.delete(key);
        this.#cacheStats.evictions++;
      }
    }
  }

  /**
   * Cleans up expired cache entries
   * @private
   */
  #cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.#cache) {
      if (now > entry.expiresAt) {
        this.#cache.delete(key);
        this.#cacheStats.evictions++;
      }
    }
  }

  /**
   * Maps database row to Roadmap object
   * @param {Object} row - Database row
   * @returns {Roadmap} Roadmap object
   * @private
   */
  #mapToRoadmap(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      milestones: row.milestones ? JSON.parse(row.milestones) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    };
  }

  /**
   * Retrieves a single roadmap by ID
   * @param {string} id - Roadmap ID
   * @param {Object} [options={}] - Query options
   * @param {boolean} [options.useCache=true] - Whether to use cache
   * @returns {Promise<Roadmap|null>} Roadmap object or null if not found
   * @throws {Error} If database query fails
   */
  async getRoadmap(id, options = {}) {
    const { useCache = true } = options;
    const cacheKey = this.#getCacheKey('roadmap', id);

    if (useCache) {
      const cached = this.#getFromCache(cacheKey);
      if (cached) {
        this.emit('cacheHit', { operation: 'getRoadmap', id });
        return cached;
      }
    }

    const result = await this.#db.query(
      'SELECT * FROM roadmaps WHERE id = ?',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const roadmap = this.#mapToRoadmap(result.rows[0]);

    if (useCache) {
      this.#setInCache(cacheKey, roadmap);
    }

    this.emit('roadmapRetrieved', { id });
    return roadmap;
  }

  /**
   * Retrieves roadmaps matching the provided filters
   * @param {RoadmapFilters} [filters={}] - Filter options
   * @returns {Promise<{roadmaps: Roadmap[], total: number}>} Filtered roadmaps and total count
   * @throws {Error} If database query fails
   */
  async getRoadmaps(filters = {}) {
    const {
      status,
      createdAfter,
      createdBefore,
      search,
      limit = 50,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = filters;

    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (createdAfter) {
      conditions.push('created_at >= ?');
      params.push(createdAfter.toISOString());
    }

    if (createdBefore) {
      conditions.push('created_at <= ?');
      params.push(createdBefore.toISOString());
    }

    if (search) {
      conditions.push('(title LIKE ? OR description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

    const allowedSortColumns = ['created_at', 'updated_at', 'title', 'status'];
    const actualSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const actualSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await this.#db.query(
      `SELECT COUNT(*) as total FROM roadmaps ${whereClause}`,
      [...params]
    );
    const total = countResult.rows[0].total;

    // Get roadmaps
    const result = await this.#db.query(
      `SELECT * FROM roadmaps ${whereClause} 
       ORDER BY ${actualSortBy} ${actualSortOrder} 
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const roadmaps = result.rows.map(row => this.#mapToRoadmap(row));

    this.emit('roadmapsRetrieved', { count: roadmaps.length, filters });
    return { roadmaps, total };
  }

  /**
   * Creates a new roadmap
   * @param {Object} data - Roadmap data
   * @param {string} data.title - Roadmap title
   * @param {string} [data.description=''] - Roadmap description
   * @param {string} [data.status='draft'] - Initial status
   * @param {Array<Object>} [data.milestones=[]] - Initial milestones
   * @param {Object} [data.metadata={}] - Additional metadata
   * @returns {Promise<Roadmap>} Created roadmap
   * @throws {Error} If creation fails
   */
  async createRoadmap(data) {
    const {
      title,
      description = '',
      status = 'draft',
      milestones = [],
      metadata = {}
    } = data;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const result = await this.#db.query(
      `INSERT INTO roadmaps (id, title, description, status, milestones, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, description, status, JSON.stringify(milestones), JSON.stringify(metadata), now, now]
    );

    if (result.affectedRows === 0) {
      throw new Error('Failed to create roadmap');
    }

    // Invalidate list caches
    this.#invalidateCache('roadmap:list');

    const roadmap = await this.getRoadmap(id, { useCache: false });
    this.emit('roadmapCreated', { id, title });
    
    return roadmap;
  }

  /**
   * Updates an existing roadmap
   * @param {string} id - Roadmap ID
   * @param {Object} data - Update data
   * @param {string} [data.title] - New title
   * @param {string} [data.description] - New description
   * @param {string} [data.status] - New status
   * @param {Array<Object>} [data.milestones] - New milestones
   * @param {Object} [data.metadata] - New metadata
   * @returns {Promise<Roadmap>} Updated roadmap
   * @throws {Error} If roadmap not found or update fails
   */
  async updateRoadmap(id, data) {
    const updates = [];
    const params = [];
    const allowedFields = ['title', 'description', 'status', 'milestones', 'metadata'];

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key === 'milestones' || key === 'metadata' ? key : key} = ?`);
        params.push(
          key === 'milestones' || key === 'metadata' 
            ? JSON.stringify(value) 
            : value
        );
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    const result = await this.#db.query(
      `UPDATE roadmaps SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      throw new Error(`Roadmap not found: ${id}`);
    }

    // Invalidate caches
    this.#invalidateCache(`roadmap:roadmap:${id}`);
    this.#invalidateCache('roadmap:list');
    this.#invalidateCache(`roadmap:progress:${id}`);

    const roadmap = await this.getRoadmap(id, { useCache: false });
    this.emit('roadmapUpdated', { id, updatedFields: Object.keys(data) });
    
    return roadmap;
  }

  /**
   * Deletes a roadmap
   * @param {string} id - Roadmap ID
   * @returns {Promise<boolean>} True if deleted
   * @throws {Error} If deletion fails
   */
  async deleteRoadmap(id) {
    const result = await this.#db.query(
      'DELETE FROM roadmaps WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      throw new Error(`Roadmap not found: ${id}`);
    }

    // Invalidate all related caches
    this.#invalidateCache(`roadmap:roadmap:${id}`);
    this.#invalidateCache('roadmap:list');
    this.#invalidateCache(`roadmap:progress:${id}`);

    this.emit('roadmapDeleted', { id });
    return true;
  }

  /**
   * Gets progress for a roadmap
   * @param {string} roadmapId - Roadmap ID
   * @param {Object} [options={}] - Query options
   * @param {boolean} [options.useCache=true] - Whether to use cache
   * @returns {Promise<Progress|null>} Progress data or null
   * @throws {Error} If query fails
   */
  async getProgress(roadmapId, options = {}) {
    const { useCache = true } = options;
    const cacheKey = this.#getCacheKey('progress', roadmapId);

    if (useCache) {
      const cached = this.#getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const result = await this.#db.query(
      'SELECT milestones FROM roadmaps WHERE id = ?',
      [roadmapId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const milestones = JSON.parse(result.rows[0].milestones || '[]');
    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter(m => m.completed).length;
    const percentComplete = totalMilestones > 0 
      ? Math.round((completedMilestones / totalMilestones) * 100) 
      : 0;

    const progress = {
      roadmapId,
      percentComplete,
      completedMilestones,
      totalMilestones,
      milestoneProgress: milestones.map(m => ({
        id: m.id,
        title: m.title,
        completed: m.completed || false,
        completedAt: m.completedAt || null
      })),
      lastUpdated: new Date()
    };

    if (useCache) {
      this.#setInCache(cacheKey, progress, 60000); // 1 minute TTL for progress
    }

    return progress;
  }

  /**
   * Updates progress for a roadmap
   * @param {string} roadmapId - Roadmap ID
   * @param {Object} progress - Progress update
   * @param {Array<{milestoneId: string, completed: boolean}>} progress.milestones - Milestone updates
   * @returns {Promise<Progress>} Updated progress
   * @throws {Error} If update fails
   */
  async updateProgress(roadmapId, progress) {
    const roadmap = await this.getRoadmap(roadmapId, { useCache: false });
    
    if (!roadmap) {
      throw new Error(`Roadmap not found: ${roadmapId}`);
    }

    const { milestones = [] } = progress;
    const updatedMilestones = roadmap.milestones.map(m => {
      const update = milestones.find(u => u.milestoneId === m.id);
      if (update) {
        return {
          ...m,
          completed: update.completed,
          completedAt: update.completed ? new Date().toISOString() : null
        };
      }
      return m;
    });

    await this.updateRoadmap(roadmapId, { milestones: updatedMilestones });
    
    const newProgress = await this.getProgress(roadmapId, { useCache: false });
    this.emit('progressUpdated', { roadmapId, progress: newProgress });
    
    return newProgress;
  }

  /**
   * Gets cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      ...this.#cacheStats,
      size: this.#cache.size,
      hitRate: this.#cacheStats.hits + this.#cacheStats.misses > 0
        ? (this.#cacheStats.hits / (this.#cacheStats.hits + this.#cacheStats.misses) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Clears all cached data
   */
  clearCache() {
    this.#cache.clear();
    this.#cacheStats = { hits: 0, misses: 0, evictions: 0 };
    this.emit('cacheCleared');
  }

  /**
   * Closes the gateway and cleanup resources
   */
  close() {
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = null;
    }
    this.clearCache();
    this.emit('closed');
  }
}

export default RoadmapGateway;
