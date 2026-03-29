/**
 * @fileoverview Database Query Cache with intelligent invalidation
 * @module db/query-cache
 * @description Caches SQL query results with automatic invalidation on writes
 * @version 5.0.0
 */

import { LRUCache } from '../utils/cache.js';
import { createHash } from 'crypto';

/**
 * Query cache configuration
 * @typedef {Object} QueryCacheConfig
 * @property {number} [maxSize=5000] - Maximum cache entries
 * @property {number} [defaultTtl=300000] - Default TTL in ms (5 minutes)
 * @property {boolean} [enabled=true] - Enable caching
 * @property {string[]} [cacheableTables=['tasks', 'roadmaps', 'contexts']] - Tables to cache
 * @property {string[]} [cacheablePatterns] - Regex patterns for cacheable queries
 * @property {string[]} [skipPatterns] - Regex patterns to skip caching
 */

/**
 * Cache entry metadata
 * @typedef {Object} CacheEntry
 * @property {*} result - Cached query result
 * @property {number} timestamp - Cache timestamp
 * @property {number} ttl - TTL in milliseconds
 * @property {string[]} tables - Tables involved in query
 * @property {string} queryHash - Query hash for invalidation
 */

/**
 * Database Query Cache with intelligent invalidation
 * @class QueryCache
 */
export class QueryCache {
  /** @type {LRUCache} */
  #cache;
  
  /** @type {QueryCacheConfig} */
  #config;
  
  /** @type {Map<string, Set<string>>} */
  #tableToQueries;
  
  /** @type {boolean} */
  #enabled;
  
  /** @type {Object} */
  #stats;

  /**
   * Create a new QueryCache
   * @param {QueryCacheConfig} config
   */
  constructor(config = {}) {
    this.#config = {
      maxSize: 5000,
      defaultTtl: 300000, // 5 minutes
      enabled: true,
      cacheableTables: ['tasks', 'roadmaps', 'contexts', 'companies', 'issues', 'documents'],
      cacheablePatterns: [
        /^SELECT\s+/i,
        /^SELECT\s+.*\s+FROM\s+/i
      ],
      skipPatterns: [
        /FOR\s+UPDATE/i,
        /LOCK\s+IN\s+SHARE\s+MODE/i,
        /NOW\(\)/i,
        /RANDOM\(\)/i,
        /CURRENT_TIMESTAMP/i,
        /datetime\s*\(\s*'now'\s*\)/i
      ],
      ...config
    };

    this.#enabled = this.#config.enabled;
    this.#cache = new LRUCache({
      maxSize: this.#config.maxSize,
      ttl: this.#config.defaultTtl,
      onEvict: (key, entry) => this.#onEvict(key, entry)
    });

    this.#tableToQueries = new Map();
    this.#stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0,
      tableInvalidations: 0
    };
  }

  /**
   * Generate hash for query
   * @private
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {string}
   */
  #generateKey(sql, params = []) {
    const hash = createHash('md5');
    hash.update(sql);
    hash.update(JSON.stringify(params));
    return hash.digest('hex');
  }

  /**
   * Extract table names from SQL query
   * @private
   * @param {string} sql - SQL query
   * @returns {string[]}
   */
  #extractTables(sql) {
    const tables = [];
    const upperSql = sql.toUpperCase();
    
    // Match FROM clause
    const fromMatch = upperSql.match(/FROM\s+(\w+)/gi);
    if (fromMatch) {
      fromMatch.forEach(match => {
        const table = match.replace(/FROM\s+/i, '').trim().toLowerCase();
        if (table) tables.push(table);
      });
    }

    // Match JOIN clauses
    const joinMatch = upperSql.match(/JOIN\s+(\w+)/gi);
    if (joinMatch) {
      joinMatch.forEach(match => {
        const table = match.replace(/JOIN\s+/i, '').trim().toLowerCase();
        if (table && !tables.includes(table)) tables.push(table);
      });
    }

    // Match UPDATE clause
    const updateMatch = upperSql.match(/UPDATE\s+(\w+)/i);
    if (updateMatch) {
      const table = updateMatch[1].toLowerCase();
      if (!tables.includes(table)) tables.push(table);
    }

    // Match INSERT INTO clause
    const insertMatch = upperSql.match(/INSERT\s+INTO\s+(\w+)/i);
    if (insertMatch) {
      const table = insertMatch[1].toLowerCase();
      if (!tables.includes(table)) tables.push(table);
    }

    // Match DELETE FROM clause
    const deleteMatch = upperSql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (deleteMatch) {
      const table = deleteMatch[1].toLowerCase();
      if (!tables.includes(table)) tables.push(table);
    }

    return tables;
  }

  /**
   * Check if query should be cached
   * @private
   * @param {string} sql - SQL query
   * @returns {boolean}
   */
  #shouldCache(sql) {
    if (!this.#enabled) return false;

    // Check cacheable patterns
    const isCacheable = this.#config.cacheablePatterns.some(pattern => pattern.test(sql));
    if (!isCacheable) return false;

    // Check skip patterns
    const shouldSkip = this.#config.skipPatterns.some(pattern => pattern.test(sql));
    if (shouldSkip) return false;

    return true;
  }

  /**
   * Get cached result
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {*|undefined} Cached result or undefined
   */
  get(sql, params = []) {
    if (!this.#shouldCache(sql)) return undefined;

    const key = this.#generateKey(sql, params);
    const entry = this.#cache.get(key);

    if (entry !== undefined) {
      this.#stats.hits++;
      return entry.result;
    }

    this.#stats.misses++;
    return undefined;
  }

  /**
   * Cache query result
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {*} result - Query result
   * @param {Object} [options] - Cache options
   * @param {number} [options.ttl] - Custom TTL
   * @returns {boolean}
   */
  set(sql, params, result, options = {}) {
    if (!this.#shouldCache(sql)) return false;

    const key = this.#generateKey(sql, params);
    const tables = this.#extractTables(sql);

    // Only cache if tables are in cacheable list
    const cacheable = tables.every(table => 
      this.#config.cacheableTables.includes(table)
    );
    
    if (!cacheable && tables.length > 0) return false;

    const entry = {
      result,
      timestamp: Date.now(),
      ttl: options.ttl || this.#config.defaultTtl,
      tables,
      queryHash: key
    };

    this.#cache.set(key, entry, entry.ttl);
    this.#stats.sets++;

    // Track table -> query mappings
    tables.forEach(table => {
      if (!this.#tableToQueries.has(table)) {
        this.#tableToQueries.set(table, new Set());
      }
      this.#tableToQueries.get(table).add(key);
    });

    return true;
  }

  /**
   * Invalidate cache entries by table
   * @param {string|string[]} tables - Table name(s)
   * @returns {number} Number of invalidated entries
   */
  invalidateByTable(tables) {
    const tableArray = Array.isArray(tables) ? tables : [tables];
    let count = 0;

    tableArray.forEach(table => {
      const queries = this.#tableToQueries.get(table);
      if (queries) {
        queries.forEach(key => {
          if (this.#cache.delete(key)) {
            count++;
          }
        });
        this.#tableToQueries.delete(table);
      }
    });

    this.#stats.invalidations += count;
    this.#stats.tableInvalidations++;
    return count;
  }

  /**
   * Invalidate specific query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {boolean}
   */
  invalidateQuery(sql, params = []) {
    const key = this.#generateKey(sql, params);
    const deleted = this.#cache.delete(key);
    if (deleted) this.#stats.invalidations++;
    return deleted;
  }

  /**
   * Clear all cached entries
   */
  clear() {
    this.#cache.clear();
    this.#tableToQueries.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const cacheStats = this.#cache.stats();
    const hitRate = cacheStats.total > 0 
      ? (cacheStats.hits / cacheStats.total) * 100 
      : 0;

    return {
      ...this.#stats,
      ...cacheStats,
      hitRate: hitRate.toFixed(2) + '%',
      enabled: this.#enabled,
      tablesTracked: this.#tableToQueries.size,
      config: {
        maxSize: this.#config.maxSize,
        defaultTtl: this.#config.defaultTtl
      }
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.#stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0,
      tableInvalidations: 0
    };
    this.#cache.resetStats();
  }

  /**
   * Warm cache with common queries
   * @param {Array<{sql: string, params?: Array, result: *}>} entries
   */
  warm(entries) {
    entries.forEach(({ sql, params = [], result, ttl }) => {
      this.set(sql, params, result, { ttl });
    });
  }

  /**
   * Get or compute query result
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {Function} fetcher - Function to fetch data if not cached
   * @param {Object} [options] - Cache options
   * @returns {Promise<*>}
   */
  async getOrSet(sql, params, fetcher, options = {}) {
    const cached = this.get(sql, params);
    if (cached !== undefined) {
      return cached;
    }

    const result = await fetcher();
    this.set(sql, params, result, options);
    return result;
  }

  /**
   * Handle cache eviction
   * @private
   * @param {string} key - Cache key
   * @param {CacheEntry} entry - Evicted entry
   */
  #onEvict(key, entry) {
    // Clean up table mappings
    if (entry.tables) {
      entry.tables.forEach(table => {
        const queries = this.#tableToQueries.get(table);
        if (queries) {
          queries.delete(key);
          if (queries.size === 0) {
            this.#tableToQueries.delete(table);
          }
        }
      });
    }
  }

  /**
   * Enable/disable caching
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.#enabled = enabled;
  }

  /**
   * Check if caching is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.#enabled;
  }
}

/**
 * Global query cache instance
 * @type {QueryCache}
 */
export const globalQueryCache = new QueryCache();

/**
 * Wrap a repository method with caching
 * @param {Function} method - Original method
 * @param {string} tableName - Table name for invalidation
 * @param {QueryCache} [cache] - Cache instance
 * @returns {Function}
 */
export function withQueryCache(method, tableName, cache = globalQueryCache) {
  return async function(...args) {
    const result = await method.apply(this, args);
    
    // Invalidate cache on write operations
    const methodName = method.name || '';
    if (['create', 'update', 'delete', 'run', 'execute'].some(op => 
      methodName.toLowerCase().includes(op.toLowerCase())
    )) {
      cache.invalidateByTable(tableName);
    }
    
    return result;
  };
}

export default QueryCache;
