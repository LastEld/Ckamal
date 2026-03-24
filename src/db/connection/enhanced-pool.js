/**
 * @fileoverview Enhanced Database Connection Pool with Performance Optimizations
 * @module db/connection/enhanced-pool
 * 
 * Extends the base connection pool with:
 * - Query result caching
 * - Prepared statement pooling
 * - Connection warmup
 * - Query timing and statistics
 */

import { ConnectionPool } from './index.js';
import { LRUCache } from '../../analysis/lru-cache.js';
import { PerformanceMonitor } from '../../utils/performance.js';

/**
 * Enhanced pool configuration
 * @typedef {Object} EnhancedPoolConfig
 * @property {string} databasePath - Path to SQLite database file
 * @property {number} [statementCacheSize=100] - Max prepared statements to cache
 * @property {number} [queryCacheSize=500] - Max query results to cache
 * @property {number} [queryCacheTtl=30000] - Query cache TTL in milliseconds
 * @property {boolean} [enableQueryCache=false] - Enable query result caching
 * @property {boolean} [enableStatementCache=true] - Enable prepared statement caching
 * @property {boolean} [warmupOnInit=true] - Warmup connections on initialization
 * @property {string[]} [warmupQueries] - Queries to run during warmup
 */

/**
 * Query statistics
 * @typedef {Object} QueryStats
 * @property {number} totalQueries - Total queries executed
 * @property {number} cachedQueries - Queries served from cache
 * @property {number} preparedStatements - Active prepared statements
 * @property {number} avgQueryTime - Average query execution time
 * @property {number} cacheHitRate - Cache hit rate percentage
 */

/**
 * EnhancedConnectionPool - High-performance database connection pool
 * @extends ConnectionPool
 */
export class EnhancedConnectionPool extends ConnectionPool {
  /** @type {Map<string, import('sqlite3').Statement>} */
  #statementCache = new Map();
  
  /** @type {LRUCache} */
  #queryCache;
  
  /** @type {PerformanceMonitor} */
  #monitor;
  
  /** @type {EnhancedPoolConfig} */
  #config;
  
  /** @type {Map<string, number>} */
  #queryStats = new Map();

  /**
   * Create an enhanced connection pool
   * @param {EnhancedPoolConfig} config - Pool configuration
   */
  constructor(config) {
    super(config);
    
    this.#config = {
      statementCacheSize: 100,
      queryCacheSize: 500,
      queryCacheTtl: 30000,
      enableQueryCache: false,
      enableStatementCache: true,
      warmupOnInit: true,
      warmupQueries: [
        'SELECT 1',
        'PRAGMA foreign_keys',
        'PRAGMA journal_mode'
      ],
      ...config
    };
    
    this.#queryCache = new LRUCache({
      maxSize: this.#config.queryCacheSize,
      ttlMs: this.#config.queryCacheTtl
    });
    
    this.#monitor = new PerformanceMonitor();
  }

  /**
   * Initialize the enhanced connection pool
   * @returns {Promise<void>}
   */
  async initialize() {
    await super.initialize();
    
    if (this.#config.warmupOnInit) {
      await this.#warmup();
    }
    
    // Start periodic cleanup
    this.#startCleanupInterval();
  }

  /**
   * Warmup connections with common queries
   * @private
   */
  async #warmup() {
    for (const query of this.#config.warmupQueries) {
      try {
        await this.query(query);
      } catch (error) {
        // Non-critical warmup errors
        this.emit('warmupWarning', { query, error: error.message });
      }
    }
    this.emit('warmupComplete');
  }

  /**
   * Start periodic cleanup interval
   * @private
   */
  #startCleanupInterval() {
    // Cleanup expired query cache entries every minute
    setInterval(() => {
      this.#queryCache.cleanup();
    }, 60000);
  }

  /**
   * Execute a cached query
   * @param {string} sql - SQL query
   * @param {any[]} [params=[]] - Query parameters
   * @param {Object} [options] - Query options
   * @param {boolean} [options.useCache=false] - Use query cache
   * @param {number} [options.cacheTtl] - Override cache TTL
   * @returns {Promise<any[]>}
   */
  async query(sql, params = [], options = {}) {
    const useCache = options.useCache ?? this.#config.enableQueryCache;
    const cacheKey = `${sql}:${JSON.stringify(params)}`;
    
    // Check cache for SELECT queries
    if (useCache && sql.trim().toLowerCase().startsWith('select')) {
      const cached = this.#queryCache.get(cacheKey);
      if (cached !== undefined) {
        this.#recordStat('cacheHit');
        return cached;
      }
    }
    
    this.#monitor.startTimer('query');
    
    try {
      const result = await super.query(sql, params);
      
      const duration = this.#monitor.endTimer('query');
      this.#recordStat('query', duration);
      
      // Cache result if caching is enabled
      if (useCache && sql.trim().toLowerCase().startsWith('select')) {
        const ttl = options.cacheTtl ?? this.#config.queryCacheTtl;
        this.#queryCache.set(cacheKey, result, { ttlMs: ttl });
        this.#recordStat('cacheMiss');
      }
      
      return result;
    } catch (error) {
      this.#monitor.endTimer('query');
      this.#recordStat('queryError');
      throw error;
    }
  }

  /**
   * Execute a query with prepared statement caching
   * @param {string} sql - SQL statement
   * @param {any[]} [params=[]] - Statement parameters
   * @returns {Promise<{lastID: number, changes: number}>}
   */
  async run(sql, params = []) {
    if (!this.#config.enableStatementCache) {
      return super.run(sql, params);
    }
    
    this.#monitor.startTimer('run');
    
    try {
      // Use cached statement if available
      const statement = await this.#getStatement(sql);
      
      if (statement) {
        return new Promise((resolve, reject) => {
          statement.run(params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
          });
        });
      }
      
      // Fallback to regular execution
      const result = await super.run(sql, params);
      
      const duration = this.#monitor.endTimer('run');
      this.#recordStat('run', duration);
      
      return result;
    } catch (error) {
      this.#monitor.endTimer('run');
      this.#recordStat('runError');
      throw error;
    }
  }

  /**
   * Get or create a prepared statement
   * @private
   * @param {string} sql - SQL statement
   * @returns {Promise<import('sqlite3').Statement|null>}
   */
  async #getStatement(sql) {
    if (this.#statementCache.has(sql)) {
      return this.#statementCache.get(sql);
    }
    
    // Don't cache if at capacity
    if (this.#statementCache.size >= this.#config.statementCacheSize) {
      return null;
    }
    
    const db = await this.acquire();
    
    try {
      const statement = db.prepare(sql);
      this.#statementCache.set(sql, statement);
      return statement;
    } catch (error) {
      return null;
    } finally {
      this.release(db);
    }
  }

  /**
   * Execute multiple queries in a batch
   * @param {Array<{sql: string, params: any[]}>} queries - Queries to execute
   * @returns {Promise<any[]>} Results for each query
   */
  async batch(queries) {
    if (!Array.isArray(queries) || queries.length === 0) {
      return [];
    }
    
    this.#monitor.startTimer('batch');
    
    const results = [];
    
    await this.withTransaction(async (db) => {
      for (const { sql, params = [] } of queries) {
        const result = await new Promise((resolve, reject) => {
          if (sql.trim().toLowerCase().startsWith('select')) {
            db.all(sql, params, (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          } else {
            db.run(sql, params, function(err) {
              if (err) reject(err);
              else resolve({ lastID: this.lastID, changes: this.changes });
            });
          }
        });
        results.push(result);
      }
    });
    
    const duration = this.#monitor.endTimer('batch');
    this.#recordStat('batch', duration);
    
    return results;
  }

  /**
   * Execute a function with automatic retries
   * @template T
   * @param {() => Promise<T>} fn - Function to execute
   * @param {Object} [options] - Retry options
   * @param {number} [options.maxRetries=3] - Maximum retry attempts
   * @param {number} [options.delay=100] - Delay between retries (ms)
   * @returns {Promise<T>}
   */
  async withRetry(fn, options = {}) {
    const maxRetries = options.maxRetries ?? 3;
    const delay = options.delay ?? 100;
    
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error.message?.includes('SQLITE_CONSTRAINT')) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Record a statistic
   * @private
   * @param {string} name - Statistic name
   * @param {number} [value] - Statistic value
   */
  #recordStat(name, value) {
    const key = `db:${name}`;
    
    if (value !== undefined) {
      this.#monitor.recordMetric(key, value);
    }
    
    const current = this.#queryStats.get(name) ?? 0;
    this.#queryStats.set(name, current + 1);
  }

  /**
   * Invalidate query cache for a pattern
   * @param {string} pattern - SQL pattern to match
   */
  invalidateCache(pattern) {
    const regex = new RegExp(pattern, 'i');
    let count = 0;
    
    for (const key of this.#queryCache.keys()) {
      if (regex.test(key)) {
        this.#queryCache.delete(key);
        count++;
      }
    }
    
    return count;
  }

  /**
   * Get query cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return {
      queryCache: this.#queryCache.getStats(),
      statementCache: {
        size: this.#statementCache.size,
        maxSize: this.#config.statementCacheSize
      }
    };
  }

  /**
   * Get enhanced pool statistics
   * @returns {QueryStats}
   */
  getStats() {
    const baseStats = super.getStats();
    const perfStats = this.#monitor.getAllStats();
    const cacheStats = this.getCacheStats();
    
    const totalQueries = this.#queryStats.get('query') ?? 0;
    const cacheHits = this.#queryStats.get('cacheHit') ?? 0;
    const cacheMisses = this.#queryStats.get('cacheMiss') ?? 0;
    const totalCacheOps = cacheHits + cacheMisses;
    
    return {
      ...baseStats,
      performance: perfStats,
      cache: cacheStats,
      queryStats: Object.fromEntries(this.#queryStats),
      cacheHitRate: totalCacheOps > 0 ? (cacheHits / totalCacheOps) * 100 : 0
    };
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.#queryCache.clear();
    
    for (const stmt of this.#statementCache.values()) {
      try {
        stmt.finalize();
      } catch (error) {
        // Ignore finalize errors
      }
    }
    this.#statementCache.clear();
    
    this.#queryStats.clear();
  }

  /**
   * Close the pool and cleanup resources
   * @returns {Promise<void>}
   */
  async close() {
    this.clearCaches();
    await super.close();
  }
}

/**
 * Create an enhanced connection pool instance
 * @param {string} databasePath - Path to database file
 * @param {Object} [options] - Additional options
 * @returns {EnhancedConnectionPool}
 */
export function createEnhancedPool(databasePath, options = {}) {
  return new EnhancedConnectionPool({
    databasePath,
    ...options
  });
}

export default EnhancedConnectionPool;
