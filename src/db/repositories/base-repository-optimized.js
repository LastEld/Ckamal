/**
 * @fileoverview Optimized Base Repository with Query Caching
 * @module db/repositories/base-repository-optimized
 * @description Enhanced base repository with intelligent query caching
 * @version 5.0.0
 */

import { BaseRepository } from './base-repository.js';
import { globalQueryCache, QueryCache } from '../query-cache.js';

/**
 * Cache configuration for repository
 * @typedef {Object} RepositoryCacheConfig
 * @property {boolean} [enabled=true] - Enable caching
 * @property {number} [defaultTtl=300000] - Default TTL in ms
 * @property {number} [findByIdTtl=600000] - TTL for findById
 * @property {number} [findAllTtl=120000] - TTL for findAll
 * @property {number} [countTtl=60000] - TTL for count operations
 * @property {string[]} [skipCacheMethods] - Methods to skip caching
 */

/**
 * Optimized Base Repository with query caching
 * @extends BaseRepository
 */
export class OptimizedBaseRepository extends BaseRepository {
  /** @type {QueryCache} */
  #cache;
  
  /** @type {RepositoryCacheConfig} */
  #cacheConfig;
  
  /** @type {boolean} */
  #cacheEnabled;

  /**
   * Create an optimized base repository
   * @param {import('../connection/index.js').ConnectionPool} pool - Connection pool
   * @param {string} tableName - Database table name
   * @param {string} primaryKey - Primary key column name
   * @param {string[]} columns - List of column names
   * @param {RepositoryCacheConfig} [cacheConfig={}] - Cache configuration
   */
  constructor(pool, tableName, primaryKey, columns, cacheConfig = {}) {
    super(pool, tableName, primaryKey, columns);
    
    this.#cacheConfig = {
      enabled: true,
      defaultTtl: 300000, // 5 minutes
      findByIdTtl: 600000, // 10 minutes
      findAllTtl: 120000, // 2 minutes
      countTtl: 60000, // 1 minute
      skipCacheMethods: [],
      ...cacheConfig
    };
    
    this.#cacheEnabled = this.#cacheConfig.enabled;
    this.#cache = globalQueryCache;
  }

  /**
   * Check if caching is enabled for method
   * @private
   * @param {string} methodName
   * @returns {boolean}
   */
  #isCacheEnabled(methodName) {
    return this.#cacheEnabled && 
           !this.#cacheConfig.skipCacheMethods.includes(methodName);
  }

  /**
   * Find a record by its primary key (cached)
   * @param {number|string} id - Record ID
   * @returns {Promise<Object|undefined>}
   */
  async findById(id) {
    if (!this.#isCacheEnabled('findById')) {
      return super.findById(id);
    }

    const sql = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
    const cacheKey = `${this.tableName}:findById:${id}`;

    return this.#cache.getOrSet(
      cacheKey,
      async () => super.findById(id),
      { ttl: this.#cacheConfig.findByIdTtl }
    );
  }

  /**
   * Find all records with optional filtering (cached)
   * @param {Object} [filters={}] - Filter options
   * @returns {Promise<Object[]>}
   */
  async findAll(filters = {}) {
    if (!this.#isCacheEnabled('findAll')) {
      return super.findAll(filters);
    }

    // Generate cache key from filters
    const filterKey = JSON.stringify(filters);
    const cacheKey = `${this.tableName}:findAll:${this.#hashString(filterKey)}`;

    return this.#cache.getOrSet(
      cacheKey,
      async () => super.findAll(filters),
      { ttl: this.#cacheConfig.findAllTtl }
    );
  }

  /**
   * Count records (cached)
   * @param {Object} [where] - Where conditions
   * @returns {Promise<number>}
   */
  async count(where = {}) {
    if (!this.#isCacheEnabled('count') || Object.keys(where).length > 0) {
      return super.count(where);
    }

    const cacheKey = `${this.tableName}:count`;

    return this.#cache.getOrSet(
      cacheKey,
      async () => super.count(where),
      { ttl: this.#cacheConfig.countTtl }
    );
  }

  /**
   * Create a new record (invalidates cache)
   * @param {Object} data - Record data
   * @returns {Promise<Object>}
   */
  async create(data) {
    const result = await super.create(data);
    this.#invalidateTableCache();
    return result;
  }

  /**
   * Update a record (invalidates cache)
   * @param {number|string} id - Record ID
   * @param {Object} data - Data to update
   * @returns {Promise<Object|undefined>}
   */
  async update(id, data) {
    const result = await super.update(id, data);
    this.#invalidateTableCache();
    this.#invalidateRecordCache(id);
    return result;
  }

  /**
   * Delete a record (invalidates cache)
   * @param {number|string} id - Record ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const result = await super.delete(id);
    this.#invalidateTableCache();
    this.#invalidateRecordCache(id);
    return result;
  }

  /**
   * Check if a record exists (cached)
   * @param {number|string} id - Record ID
   * @returns {Promise<boolean>}
   */
  async exists(id) {
    if (!this.#isCacheEnabled('exists')) {
      return super.exists(id);
    }

    const cacheKey = `${this.tableName}:exists:${id}`;

    return this.#cache.getOrSet(
      cacheKey,
      async () => super.exists(id),
      { ttl: this.#cacheConfig.findByIdTtl }
    );
  }

  /**
   * Bulk create records (invalidates cache)
   * @param {Object[]} records - Records to create
   * @returns {Promise<Object[]>}
   */
  async bulkCreate(records) {
    const results = [];
    
    for (const record of records) {
      results.push(await super.create(record));
    }
    
    this.#invalidateTableCache();
    return results;
  }

  /**
   * Bulk update records (invalidates cache)
   * @param {number|string[]} ids - Record IDs
   * @param {Object} data - Update data
   * @returns {Promise<number>}
   */
  async bulkUpdate(ids, data) {
    const result = await this.bulkUpdateStatus?.(ids, data.status) || 
                   await this.#executeBulkUpdate(ids, data);
    
    this.#invalidateTableCache();
    ids.forEach(id => this.#invalidateRecordCache(id));
    
    return result;
  }

  /**
   * Execute bulk update
   * @private
   * @param {number|string[]} ids - Record IDs
   * @param {Object} data - Update data
   * @returns {Promise<number>}
   */
  async #executeBulkUpdate(ids, data) {
    if (!ids || ids.length === 0) return 0;

    const columns = Object.keys(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const placeholders = ids.map(() => '?').join(',');
    
    const sql = `
      UPDATE ${this.tableName} 
      SET ${setClause}, updated_at = datetime('now')
      WHERE ${this.primaryKey} IN (${placeholders})
    `;

    const result = await this.pool.run(sql, [...Object.values(data), ...ids]);
    return result.changes;
  }

  /**
   * Execute raw query with caching
   * @param {string} sql - SQL query
   * @param {Array} [params=[]] - Query parameters
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.cache=false] - Cache result
   * @param {number} [options.ttl] - Cache TTL
   * @returns {Promise<*>}
   */
  async queryCached(sql, params = [], options = {}) {
    const { cache = false, ttl } = options;
    
    if (!cache || !this.#cacheEnabled) {
      return this.pool.all(sql, params);
    }

    const cacheKey = `${this.tableName}:query:${this.#hashString(sql + JSON.stringify(params))}`;

    return this.#cache.getOrSet(
      cacheKey,
      async () => this.pool.all(sql, params),
      { ttl: ttl || this.#cacheConfig.defaultTtl }
    );
  }

  /**
   * Invalidate cache for this table
   * @private
   */
  #invalidateTableCache() {
    if (this.#cacheEnabled) {
      this.#cache.invalidateByTable(this.tableName);
    }
  }

  /**
   * Invalidate cache for specific record
   * @private
   * @param {number|string} id - Record ID
   */
  #invalidateRecordCache(id) {
    if (this.#cacheEnabled) {
      this.#cache.invalidateQuery(`${this.tableName}:findById:${id}`);
      this.#cache.invalidateQuery(`${this.tableName}:exists:${id}`);
    }
  }

  /**
   * Hash a string for cache key
   * @private
   * @param {string} str - String to hash
   * @returns {string}
   */
  #hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return this.#cache.getStats();
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats() {
    this.#cache.resetStats();
  }

  /**
   * Clear cache for this repository
   */
  clearCache() {
    this.#invalidateTableCache();
  }

  /**
   * Enable/disable caching
   * @param {boolean} enabled
   */
  setCacheEnabled(enabled) {
    this.#cacheEnabled = enabled;
    this.#cacheConfig.enabled = enabled;
  }

  /**
   * Warm cache with data
   * @param {Array<{method: string, args: Array, result: *}>} entries
   */
  warmCache(entries) {
    if (!this.#cacheEnabled) return;

    entries.forEach(({ method, args = [], result }) => {
      let cacheKey;
      
      switch (method) {
        case 'findById':
          cacheKey = `${this.tableName}:findById:${args[0]}`;
          break;
        case 'findAll':
          cacheKey = `${this.tableName}:findAll:${this.#hashString(JSON.stringify(args[0] || {}))}`;
          break;
        case 'count':
          cacheKey = `${this.tableName}:count`;
          break;
        default:
          return;
      }
      
      this.#cache.set(cacheKey, [], result);
    });
  }

  /**
   * Preload common queries into cache
   * @returns {Promise<void>}
   */
  async preloadCache() {
    if (!this.#cacheEnabled) return;

    try {
      // Preload count
      const count = await super.count();
      const countKey = `${this.tableName}:count`;
      this.#cache.set(countKey, [], count, { ttl: this.#cacheConfig.countTtl });

      // Preload recent records (limit to 100)
      const recent = await super.findAll({ 
        orderBy: 'created_at', 
        orderDirection: 'DESC',
        limit: 100 
      });
      
      // Cache individual records
      recent.forEach(record => {
        const key = `${this.tableName}:findById:${record[this.primaryKey]}`;
        this.#cache.set(key, [], record, { ttl: this.#cacheConfig.findByIdTtl });
      });

    } catch (error) {
      console.warn(`[OptimizedBaseRepository] Failed to preload cache for ${this.tableName}:`, error.message);
    }
  }
}

export default OptimizedBaseRepository;
