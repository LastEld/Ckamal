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

import { ConnectionPool, ConnectionPoolError } from './index.js';
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
 * @property {number} [warmupTimeout=30000] - Timeout for warmup queries (ms)
 * @property {number} [statementPrepareTimeout=5000] - Timeout for statement preparation (ms)
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

  /** @type {NodeJS.Timeout|null} */
  #cleanupInterval = null;

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
      warmupTimeout: 30000,
      statementPrepareTimeout: 5000,
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
    const warmupStart = Date.now();
    const warmupPromises = this.#config.warmupQueries.map(async (query) => {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new ConnectionPoolError(
            `Warmup query timeout: ${query}`,
            'WARMUP_TIMEOUT',
            { query, timeout: this.#config.warmupTimeout }
          ));
        }, this.#config.warmupTimeout);
      });
      
      const queryPromise = this.query(query).catch(error => {
        // Non-critical warmup errors
        this.emit('warmupWarning', { query, error: error.message });
        return null;
      });
      
      return Promise.race([queryPromise, timeoutPromise]).catch(error => {
        this.emit('warmupWarning', { query, error: error.message });
        return null;
      });
    });
    
    await Promise.all(warmupPromises);
    
    this.emit('warmupComplete', { 
      duration: Date.now() - warmupStart,
      queriesExecuted: this.#config.warmupQueries.length
    });
  }

  /**
   * Start periodic cleanup interval
   * @private
   */
  #startCleanupInterval() {
    // Cleanup expired query cache entries every minute
    this.#cleanupInterval = setInterval(() => {
      try {
        this.#queryCache.cleanup();
      } catch (error) {
        this.emit('cleanupError', { error: error.message });
      }
    }, 60000);
    
    if (this.#cleanupInterval.unref) {
      this.#cleanupInterval.unref();
    }
  }

  /**
   * Execute a cached query
   * @param {string} sql - SQL query
   * @param {any[]} [params=[]] - Query parameters
   * @param {Object} [options] - Query options
   * @param {boolean} [options.useCache=false] - Use query cache
   * @param {number} [options.cacheTtl] - Override cache TTL
   * @param {number} [options.timeout] - Query timeout override
   * @returns {Promise<any[]>}
   */
  async query(sql, params = [], options = {}) {
    const useCache = options.useCache ?? this.#config.enableQueryCache;
    const cacheKey = `${sql}:${JSON.stringify(params)}`;
    
    // Check cache for SELECT queries
    if (useCache && this.#isCacheableQuery(sql)) {
      const cached = this.#queryCache.get(cacheKey);
      if (cached !== undefined) {
        this.#recordStat('cacheHit');
        return cached;
      }
    }
    
    this.#monitor.startTimer('query');
    
    try {
      const result = await super.query(sql, params, options);
      
      const duration = this.#monitor.endTimer('query');
      this.#recordStat('query', duration);
      
      // Cache result if caching is enabled
      if (useCache && this.#isCacheableQuery(sql)) {
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
   * Check if a query is cacheable
   * @private
   * @param {string} sql
   * @returns {boolean}
   */
  #isCacheableQuery(sql) {
    if (!sql) return false;
    const trimmed = sql.trim().toLowerCase();
    // Only cache SELECT queries that don't use functions that change results
    return trimmed.startsWith('select') && 
           !trimmed.includes('random()') &&
           !trimmed.includes('datetime') &&
           !trimmed.includes('current_timestamp') &&
           !trimmed.includes('now()');
  }

  /**
   * Execute a query with prepared statement caching
   * @param {string} sql - SQL statement
   * @param {any[]} [params=[]] - Statement parameters
   * @param {Object} [options] - Query options
   * @param {number} [options.timeout] - Query timeout override
   * @returns {Promise<{lastID: number, changes: number}>}
   */
  async run(sql, params = [], options = {}) {
    if (!this.#config.enableStatementCache) {
      return super.run(sql, params, options);
    }
    
    this.#monitor.startTimer('run');
    
    try {
      // Use cached statement if available
      const statement = await this.#getStatement(sql);
      
      if (statement) {
        return new Promise((resolve, reject) => {
          const timeout = options.timeout || 30000;
          const timer = setTimeout(() => {
            reject(new ConnectionPoolError(
              `Statement execution timeout after ${timeout}ms`,
              'STATEMENT_TIMEOUT',
              { timeout }
            ));
          }, timeout);
          
          statement.run(params, function(err) {
            clearTimeout(timer);
            if (err) {
              reject(new ConnectionPoolError(
                `Statement execution failed: ${err.message}`,
                'STATEMENT_ERROR',
                { sqliteError: err.message, code: err.code }
              ));
            } else {
              resolve({ lastID: this.lastID, changes: this.changes });
            }
          });
        });
      }
      
      // Fallback to regular execution
      const result = await super.run(sql, params, options);
      
      const duration = this.#monitor.endTimer('run');
      this.#recordStat('run', duration);
      
      // Invalidate cache for modifying queries
      this.#invalidateCacheForQuery(sql);
      
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
    // Return cached statement if available
    if (this.#statementCache.has(sql)) {
      const stmt = this.#statementCache.get(sql);
      // Verify statement is still valid by checking if it's finalized
      try {
        // Try to access a property that would fail if finalized
        if (stmt && typeof stmt.run === 'function') {
          return stmt;
        }
      } catch (e) {
        // Statement is invalid, remove from cache
        this.#statementCache.delete(sql);
      }
    }
    
    // Don't cache if at capacity - evict oldest
    if (this.#statementCache.size >= this.#config.statementCacheSize) {
      const firstKey = this.#statementCache.keys().next().value;
      if (firstKey !== undefined) {
        const oldStmt = this.#statementCache.get(firstKey);
        this.#statementCache.delete(firstKey);
        // Finalize the evicted statement
        try {
          if (oldStmt && typeof oldStmt.finalize === 'function') {
            await new Promise((resolve) => {
              oldStmt.finalize(() => resolve());
            });
          }
        } catch (e) {
          // Ignore finalize errors
        }
      }
    }
    
    const db = await this.acquire();
    
    try {
      const statement = await this.#prepareStatementWithTimeout(db, sql);
      if (statement) {
        this.#statementCache.set(sql, statement);
      }
      return statement;
    } catch (error) {
      this.emit('statementPrepareError', { sql, error: error.message });
      return null;
    } finally {
      this.release(db);
    }
  }

  /**
   * Prepare a statement with timeout
   * @private
   * @param {sqlite3.Database} db
   * @param {string} sql
   * @returns {Promise<import('sqlite3').Statement|null>}
   */
  #prepareStatementWithTimeout(db, sql) {
    return new Promise((resolve, reject) => {
      const timeout = this.#config.statementPrepareTimeout;
      const timer = setTimeout(() => {
        reject(new ConnectionPoolError(
          `Statement preparation timeout after ${timeout}ms`,
          'PREPARE_TIMEOUT',
          { sql: sql.substring(0, 100), timeout }
        ));
      }, timeout);
      
      let statement;
      try {
        statement = db.prepare(sql, (err) => {
          clearTimeout(timer);
          if (err) {
            reject(new ConnectionPoolError(
              `Statement preparation failed: ${err.message}`,
              'PREPARE_ERROR',
              { sql: sql.substring(0, 100), sqliteError: err.message }
            ));
          } else {
            resolve(statement);
          }
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Execute multiple queries in a batch
   * @param {Array<{sql: string, params: any[]}>} queries - Queries to execute
   * @param {Object} [options] - Batch options
   * @param {number} [options.timeout] - Timeout per query
   * @returns {Promise<any[]>} Results for each query
   */
  async batch(queries, options = {}) {
    if (!Array.isArray(queries) || queries.length === 0) {
      return [];
    }
    
    this.#monitor.startTimer('batch');
    
    const results = [];
    
    await this.withTransaction(async (db) => {
      for (const { sql, params = [] } of queries) {
        const result = await new Promise((resolve, reject) => {
          const timeout = options.timeout || 30000;
          const timer = setTimeout(() => {
            reject(new ConnectionPoolError(
              `Batch query timeout after ${timeout}ms`,
              'BATCH_TIMEOUT',
              { sql: sql?.substring(0, 100), timeout }
            ));
          }, timeout);
          
          if (sql.trim().toLowerCase().startsWith('select')) {
            db.all(sql, params, (err, rows) => {
              clearTimeout(timer);
              if (err) {
                reject(new ConnectionPoolError(
                  `Batch query failed: ${err.message}`,
                  'BATCH_ERROR',
                  { sql: sql?.substring(0, 100), sqliteError: err.message }
                ));
              } else {
                resolve(rows);
              }
            });
          } else {
            db.run(sql, params, function(err) {
              clearTimeout(timer);
              if (err) {
                reject(new ConnectionPoolError(
                  `Batch query failed: ${err.message}`,
                  'BATCH_ERROR',
                  { sql: sql?.substring(0, 100), sqliteError: err.message }
                ));
              } else {
                resolve({ lastID: this.lastID, changes: this.changes });
              }
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
   * @param {boolean} [options.exponentialBackoff=true] - Use exponential backoff
   * @returns {Promise<T>}
   */
  async withRetry(fn, options = {}) {
    const maxRetries = options.maxRetries ?? 3;
    const baseDelay = options.delay ?? 100;
    const exponentialBackoff = options.exponentialBackoff !== false;
    
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
        
        if (error.message?.includes('SQLITE_MISMATCH')) {
          throw error;
        }

        if (error.code?.startsWith('POOL_')) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          const delay = exponentialBackoff 
            ? baseDelay * Math.pow(2, attempt) 
            : baseDelay;
          this.emit('retry', { attempt, delay, error: error.message });
          await this.#delay(delay);
        }
      }
    }
    
    throw new ConnectionPoolError(
      `Failed after ${maxRetries + 1} attempts: ${lastError.message}`,
      'MAX_RETRIES_EXCEEDED',
      { lastError: lastError.message, attempts: maxRetries + 1 }
    );
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
   * @returns {number}
   */
  invalidateCache(pattern) {
    try {
      const regex = new RegExp(pattern, 'i');
      let count = 0;
      
      for (const key of this.#queryCache.keys()) {
        if (regex.test(key)) {
          this.#queryCache.delete(key);
          count++;
        }
      }
      
      return count;
    } catch (error) {
      this.emit('cacheInvalidateError', { pattern, error: error.message });
      return 0;
    }
  }

  /**
   * Invalidate cache based on query type
   * @private
   * @param {string} sql
   */
  #invalidateCacheForQuery(sql) {
    if (!sql) return;
    
    const trimmed = sql.trim().toLowerCase();
    
    // Invalidate all cache on INSERT/UPDATE/DELETE since we don't know what tables are affected
    if (trimmed.startsWith('insert') || 
        trimmed.startsWith('update') || 
        trimmed.startsWith('delete') ||
        trimmed.startsWith('replace')) {
      this.#queryCache.clear();
      this.emit('cacheInvalidated', { reason: 'modifying_query', query: sql.substring(0, 100) });
    }
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
    
    // Finalize all cached statements
    const finalizePromises = [];
    for (const [sql, stmt] of this.#statementCache.entries()) {
      try {
        if (stmt && typeof stmt.finalize === 'function') {
          finalizePromises.push(
            new Promise((resolve) => {
              stmt.finalize(() => resolve());
            })
          );
        }
      } catch (error) {
        // Ignore finalize errors
      }
    }
    
    // Wait for finalization but don't block
    Promise.all(finalizePromises).catch(() => {});
    
    this.#statementCache.clear();
    this.#queryStats.clear();
    
    this.emit('cachesCleared');
  }

  /**
   * Get statement cache size
   * @returns {number}
   */
  getStatementCacheSize() {
    return this.#statementCache.size;
  }

  /**
   * Get query cache size
   * @returns {number}
   */
  getQueryCacheSize() {
    return this.#queryCache.size;
  }

  /**
   * Delay utility
   * @private
   * @param {number} ms
   * @returns {Promise<void>}
   */
  #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close the pool and cleanup resources
   * @returns {Promise<void>}
   */
  async close() {
    // Clear cleanup interval
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = null;
    }
    
    // Clear caches (this finalizes statements)
    this.clearCaches();
    
    // Close base pool
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
