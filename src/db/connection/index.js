/**
 * @fileoverview Database Connection Pool for CogniMesh v5.0
 * @module db/connection
 */

import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { EventEmitter } from 'events';

/**
 * Connection wrapper with health tracking
 * @typedef {Object} PooledConnection
 * @property {sqlite3.Database} db - SQLite database instance
 * @property {boolean} inUse - Whether connection is currently in use
 * @property {number} lastUsed - Timestamp of last use
 * @property {number} createdAt - Timestamp when connection was created
 * @property {number} healthCheckFailures - Number of consecutive health check failures
 * @property {number|null} acquiredAt - Timestamp when connection was acquired (null if not in use)
 * @property {string|null} acquiredBy - Stack trace or identifier of who acquired the connection
 */

/**
 * Connection pool configuration
 * @typedef {Object} PoolConfig
 * @property {string} databasePath - Path to SQLite database file
 * @property {number} [minConnections=2] - Minimum connections in pool
 * @property {number} [maxConnections=10] - Maximum connections in pool
 * @property {number} [acquireTimeout=30000] - Timeout for acquiring connection (ms)
 * @property {number} [idleTimeout=300000] - Idle timeout before closing connection (ms)
 * @property {number} [healthCheckInterval=30000] - Health check interval (ms)
 * @property {number} [maxHealthCheckFailures=3] - Max health check failures before reconnect
 * @property {number} [maxConnectionLeaseTime=60000] - Max time a connection can be held (ms)
 * @property {number} [queryTimeout=30000] - Query execution timeout (ms)
 * @property {number} [retryAttempts=3] - Number of retry attempts for transient errors
 * @property {number} [retryDelay=100] - Base delay between retries (ms)
 */

/**
 * Custom error class for database connection errors
 */
export class ConnectionPoolError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'ConnectionPoolError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * ConnectionPool - Multi-connection pool with health checks and auto-reconnection
 * @extends EventEmitter
 */
export class ConnectionPool extends EventEmitter {
  /** @type {PooledConnection[]} */
  #pool = [];
  
  /** @type {PoolConfig} */
  #config;
  
  /** @type {NodeJS.Timeout|null} */
  #healthCheckTimer = null;
  
  /** @type {NodeJS.Timeout|null} */
  #idleCleanupTimer = null;
  
  /** @type {boolean} */
  #isShuttingDown = false;

  /** @type {boolean} */
  #isInitialized = false;

  /** @type {Set<string>} */
  #transientErrorCodes = new Set([
    'SQLITE_BUSY',
    'SQLITE_LOCKED',
    'SQLITE_PROTOCOL',
    'SQLITE_IOERR',
    'SQLITE_CANTOPEN',
    'SQLITE_NOMEM'
  ]);

  /**
   * Create a connection pool
   * @param {PoolConfig} config - Pool configuration
   */
  constructor(config) {
    super();
    this.#config = {
      minConnections: 2,
      maxConnections: 10,
      acquireTimeout: 30000,
      idleTimeout: 300000,
      healthCheckInterval: 30000,
      maxHealthCheckFailures: 3,
      maxConnectionLeaseTime: 60000,
      queryTimeout: 30000,
      retryAttempts: 3,
      retryDelay: 100,
      ...config
    };
    
    if (!this.#config.databasePath) {
      throw new ConnectionPoolError(
        'databasePath is required',
        'CONFIG_MISSING_DATABASE_PATH'
      );
    }

    // Validate connection limits
    if (this.#config.minConnections > this.#config.maxConnections) {
      throw new ConnectionPoolError(
        `minConnections (${this.#config.minConnections}) cannot exceed maxConnections (${this.#config.maxConnections})`,
        'CONFIG_INVALID_CONNECTION_LIMITS'
      );
    }

    // Validate timeouts
    if (this.#config.acquireTimeout < 1000) {
      throw new ConnectionPoolError(
        'acquireTimeout must be at least 1000ms',
        'CONFIG_INVALID_TIMEOUT'
      );
    }
  }

  /**
   * Initialize the connection pool
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#isInitialized) {
      throw new ConnectionPoolError(
        'Pool is already initialized',
        'POOL_ALREADY_INITIALIZED'
      );
    }

    this.emit('initializing');
    
    try {
      // Create minimum connections
      const createPromises = [];
      for (let i = 0; i < this.#config.minConnections; i++) {
        createPromises.push(this.#createConnection());
      }
      
      await Promise.all(createPromises);
      
      // Start health checks
      this.#startHealthChecks();
      this.#startIdleCleanup();
      
      this.#isInitialized = true;
      this.emit('initialized', { poolSize: this.#pool.length });
    } catch (error) {
      // Cleanup any partially created connections
      await this.#cleanupPartialInitialization();
      throw new ConnectionPoolError(
        `Failed to initialize pool: ${error.message}`,
        'POOL_INIT_FAILED',
        { originalError: error.message }
      );
    }
  }

  /**
   * Cleanup partial initialization
   * @private
   */
  async #cleanupPartialInitialization() {
    const closePromises = this.#pool.map(conn => {
      return new Promise((resolve) => {
        try {
          conn.db.close(resolve);
        } catch (e) {
          resolve();
        }
      });
    });
    await Promise.all(closePromises);
    this.#pool = [];
  }

  /**
   * Create a new database connection
   * @private
   * @returns {Promise<PooledConnection>}
   */
  #createConnection() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.#config.databasePath, async (err) => {
        if (err) {
          this.emit('connectionError', err);
          reject(new ConnectionPoolError(
            `Failed to create connection: ${err.message}`,
            'CONNECTION_CREATE_FAILED',
            { sqliteError: err.message }
          ));
          return;
        }

        try {
          // Enable foreign keys - await to ensure it's set
          await this.#runPragma(db, 'PRAGMA foreign_keys = ON');
          
          // Enable WAL mode for better concurrency - await to ensure it's set
          await this.#runPragma(db, 'PRAGMA journal_mode = WAL');

          const connection = {
            db,
            inUse: false,
            lastUsed: Date.now(),
            createdAt: Date.now(),
            healthCheckFailures: 0,
            acquiredAt: null,
            acquiredBy: null
          };

          this.#pool.push(connection);
          this.emit('connectionCreated', { connection, poolSize: this.#pool.length });
          resolve(connection);
        } catch (pragmaError) {
          // Close the database if pragma setup fails
          db.close(() => {
            reject(new ConnectionPoolError(
              `Failed to configure connection: ${pragmaError.message}`,
              'CONNECTION_CONFIG_FAILED',
              { originalError: pragmaError.message }
            ));
          });
        }
      });
    });
  }

  /**
   * Execute a PRAGMA statement and return a promise
   * @private
   * @param {sqlite3.Database} db
   * @param {string} pragma
   * @returns {Promise<void>}
   */
  #runPragma(db, pragma) {
    return new Promise((resolve, reject) => {
      db.run(pragma, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Check if an error is transient (retryable)
   * @private
   * @param {Error} error
   * @returns {boolean}
   */
  #isTransientError(error) {
    if (!error) return false;
    const errorCode = error.code || error.message;
    if (!errorCode) return false;
    
    for (const code of this.#transientErrorCodes) {
      if (errorCode.includes(code)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Acquire a connection from the pool
   * @returns {Promise<sqlite3.Database>}
   */
  async acquire() {
    if (this.#isShuttingDown) {
      throw new ConnectionPoolError(
        'Pool is shutting down',
        'POOL_SHUTTING_DOWN'
      );
    }

    if (!this.#isInitialized) {
      throw new ConnectionPoolError(
        'Pool is not initialized',
        'POOL_NOT_INITIALIZED'
      );
    }

    const startTime = Date.now();
    let lastError = null;
    
    while (Date.now() - startTime < this.#config.acquireTimeout) {
      // Look for available connection
      const available = this.#pool.find(c => !c.inUse && this.#isConnectionHealthy(c));
      
      if (available) {
        return this.#markConnectionAcquired(available);
      }

      // Create new connection if under max
      if (this.#pool.length < this.#config.maxConnections) {
        try {
          const conn = await this.#createConnection();
          return this.#markConnectionAcquired(conn);
        } catch (error) {
          lastError = error;
          // Continue to retry if creation failed transiently
          if (!this.#isTransientError(error)) {
            throw error;
          }
        }
      }

      // Wait a bit and retry
      await this.#delay(50);
    }

    const poolStats = this.getStats();
    throw new ConnectionPoolError(
      `Failed to acquire connection within ${this.#config.acquireTimeout}ms. ` +
      `Pool stats: ${JSON.stringify(poolStats)}`,
      'ACQUIRE_TIMEOUT',
      { 
        timeout: this.#config.acquireTimeout,
        poolStats,
        lastError: lastError?.message
      }
    );
  }

  /**
   * Mark a connection as acquired
   * @private
   * @param {PooledConnection} connection
   * @returns {sqlite3.Database}
   */
  #markConnectionAcquired(connection) {
    connection.inUse = true;
    connection.lastUsed = Date.now();
    connection.acquiredAt = Date.now();
    connection.healthCheckFailures = 0;
    
    // Capture stack trace for debugging leaks
    if (Error.captureStackTrace) {
      const stack = {};
      Error.captureStackTrace(stack, this.acquire);
      connection.acquiredBy = stack.stack?.split('\n')[2]?.trim();
    }
    
    this.emit('connectionAcquired', { 
      connection,
      poolStats: this.getStats()
    });
    
    return connection.db;
  }

  /**
   * Get a database connection (non-pooled, for backward compatibility)
   * Returns the first available connection's database instance
   * @returns {sqlite3.Database|null}
   */
  getConnection() {
    // Find an available connection
    const available = this.#pool.find(c => !c.inUse && this.#isConnectionHealthy(c));
    if (available) {
      return available.db;
    }
    // If no available connection, return the first connection's db
    if (this.#pool.length > 0) {
      return this.#pool[0].db;
    }
    return null;
  }

  /**
   * Check if connection is healthy enough to be used
   * @private
   * @param {PooledConnection} connection
   * @returns {boolean}
   */
  #isConnectionHealthy(connection) {
    // Check if connection has been held too long (potential leak)
    if (connection.acquiredAt && 
        Date.now() - connection.acquiredAt > this.#config.maxConnectionLeaseTime) {
      this.emit('connectionLeaseExpired', { 
        connection,
        heldFor: Date.now() - connection.acquiredAt,
        acquiredBy: connection.acquiredBy
      });
      return false;
    }
    
    return connection.healthCheckFailures < this.#config.maxHealthCheckFailures;
  }

  /**
   * Release a connection back to the pool
   * @param {sqlite3.Database} db - Database connection to release
   * @returns {void}
   */
  release(db) {
    if (this.#isShuttingDown) {
      // Don't return connections to pool during shutdown
      return;
    }

    const connection = this.#pool.find(c => c.db === db);
    
    if (!connection) {
      const error = new ConnectionPoolError(
        'Connection not found in pool - it may have been closed or already released',
        'RELEASE_CONNECTION_NOT_FOUND'
      );
      this.emit('releaseError', error);
      return;
    }

    connection.inUse = false;
    connection.lastUsed = Date.now();
    connection.acquiredAt = null;
    connection.acquiredBy = null;
    
    this.emit('connectionReleased', { connection, poolStats: this.getStats() });
  }

  /**
   * Execute a SQL query and return all rows with timeout and retry
   * @param {string} sql - SQL query
   * @param {any[]} [params=[]] - Query parameters
   * @param {Object} [options] - Query options
   * @param {number} [options.timeout] - Query timeout override
   * @returns {Promise<any[]>}
   */
  async query(sql, params = [], options = {}) {
    return this.#withRetry(async () => {
      const db = await this.acquire();
      try {
        return await this.#promisifyAllWithTimeout(
          db, 
          sql, 
          params, 
          options.timeout || this.#config.queryTimeout
        );
      } finally {
        this.release(db);
      }
    });
  }

  /**
   * Execute a SQL query and return first row
   * @param {string} sql - SQL query
   * @param {any[]} [params=[]] - Query parameters
   * @param {Object} [options] - Query options
   * @param {number} [options.timeout] - Query timeout override
   * @returns {Promise<any|undefined>}
   */
  async get(sql, params = [], options = {}) {
    return this.#withRetry(async () => {
      const db = await this.acquire();
      try {
        return await this.#promisifyGetWithTimeout(
          db, 
          sql, 
          params, 
          options.timeout || this.#config.queryTimeout
        );
      } finally {
        this.release(db);
      }
    });
  }

  /**
   * Execute a SQL query and return all rows
   * @param {string} sql - SQL query
   * @param {any[]} [params=[]] - Query parameters
   * @param {Object} [options] - Query options
   * @returns {Promise<any[]>}
   */
  async all(sql, params = [], options = {}) {
    return this.query(sql, params, options);
  }

  /**
   * Execute a SQL run statement (INSERT, UPDATE, DELETE)
   * @param {string} sql - SQL statement
   * @param {any[]} [params=[]] - Statement parameters
   * @param {Object} [options] - Query options
   * @param {number} [options.timeout] - Query timeout override
   * @returns {Promise<{lastID: number, changes: number}>}
   */
  async run(sql, params = [], options = {}) {
    return this.#withRetry(async () => {
      const db = await this.acquire();
      try {
        return await this.#promisifyRunWithTimeout(
          db, 
          sql, 
          params, 
          options.timeout || this.#config.queryTimeout
        );
      } finally {
        this.release(db);
      }
    });
  }

  /**
   * Execute a function with automatic retries for transient errors
   * @private
   * @template T
   * @param {() => Promise<T>} fn - Function to execute
   * @returns {Promise<T>}
   */
  async #withRetry(fn) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.#config.retryAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error.message?.includes('SQLITE_CONSTRAINT') ||
            error.message?.includes('SQLITE_MISMATCH') ||
            error.code?.includes('POOL_')) {
          throw error;
        }
        
        // Only retry transient errors
        if (!this.#isTransientError(error)) {
          throw error;
        }
        
        if (attempt < this.#config.retryAttempts) {
          const delay = this.#config.retryDelay * Math.pow(2, attempt); // Exponential backoff
          this.emit('retry', { attempt, delay, error: error.message });
          await this.#delay(delay);
        }
      }
    }
    
    throw new ConnectionPoolError(
      `Failed after ${this.#config.retryAttempts + 1} attempts: ${lastError.message}`,
      'MAX_RETRIES_EXCEEDED',
      { lastError: lastError.message, attempts: this.#config.retryAttempts + 1 }
    );
  }

  /**
   * Promisified db.all with timeout
   * @private
   * @param {sqlite3.Database} db
   * @param {string} sql
   * @param {any[]} params
   * @param {number} timeout
   * @returns {Promise<any[]>}
   */
  #promisifyAllWithTimeout(db, sql, params, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ConnectionPoolError(
          `Query timeout after ${timeout}ms: ${sql.substring(0, 100)}`,
          'QUERY_TIMEOUT',
          { sql: sql.substring(0, 200), timeout }
        ));
      }, timeout);

      db.all(sql, params, (err, rows) => {
        clearTimeout(timer);
        if (err) {
          reject(new ConnectionPoolError(
            `Query failed: ${err.message}`,
            'QUERY_ERROR',
            { sql: sql.substring(0, 200), sqliteError: err.message, code: err.code }
          ));
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Promisified db.get with timeout
   * @private
   * @param {sqlite3.Database} db
   * @param {string} sql
   * @param {any[]} params
   * @param {number} timeout
   * @returns {Promise<any>}
   */
  #promisifyGetWithTimeout(db, sql, params, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ConnectionPoolError(
          `Query timeout after ${timeout}ms: ${sql.substring(0, 100)}`,
          'QUERY_TIMEOUT',
          { sql: sql.substring(0, 200), timeout }
        ));
      }, timeout);

      db.get(sql, params, (err, row) => {
        clearTimeout(timer);
        if (err) {
          reject(new ConnectionPoolError(
            `Query failed: ${err.message}`,
            'QUERY_ERROR',
            { sql: sql.substring(0, 200), sqliteError: err.message, code: err.code }
          ));
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Promisified db.run with timeout
   * @private
   * @param {sqlite3.Database} db
   * @param {string} sql
   * @param {any[]} params
   * @param {number} timeout
   * @returns {Promise<{lastID: number, changes: number}>}
   */
  #promisifyRunWithTimeout(db, sql, params, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ConnectionPoolError(
          `Query timeout after ${timeout}ms: ${sql.substring(0, 100)}`,
          'QUERY_TIMEOUT',
          { sql: sql.substring(0, 200), timeout }
        ));
      }, timeout);

      db.run(sql, params, function(err) {
        clearTimeout(timer);
        if (err) {
          reject(new ConnectionPoolError(
            `Query failed: ${err.message}`,
            'QUERY_ERROR',
            { sql: sql.substring(0, 200), sqliteError: err.message, code: err.code }
          ));
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Execute a function within a transaction
   * @template T
   * @param {(db: sqlite3.Database) => Promise<T>} fn - Function to execute
   * @param {Object} [options] - Transaction options
   * @param {number} [options.timeout] - Transaction timeout override
   * @returns {Promise<T>}
   */
  async withTransaction(fn, options = {}) {
    const timeout = options.timeout || this.#config.queryTimeout * 2;
    const db = await this.acquire();
    
    try {
      await this.#promisifyRunWithTimeout(db, 'BEGIN TRANSACTION', [], timeout);
      
      try {
        const result = await fn(db);
        await this.#promisifyRunWithTimeout(db, 'COMMIT', [], timeout);
        return result;
      } catch (error) {
        try {
          await this.#promisifyRunWithTimeout(db, 'ROLLBACK', [], timeout);
        } catch (rollbackError) {
          this.emit('rollbackError', { originalError: error, rollbackError });
        }
        throw error;
      }
    } finally {
      this.release(db);
    }
  }

  /**
   * Start health check interval
   * @private
   */
  #startHealthChecks() {
    this.#healthCheckTimer = setInterval(() => {
      this.#performHealthChecks();
    }, this.#config.healthCheckInterval);
  }

  /**
   * Perform health checks on all connections
   * @private
   */
  async #performHealthChecks() {
    for (const connection of this.#pool) {
      // Skip connections that are in use but held too long
      if (connection.inUse) {
        if (connection.acquiredAt && 
            Date.now() - connection.acquiredAt > this.#config.maxConnectionLeaseTime) {
          this.emit('potentialConnectionLeak', {
            connection,
            heldFor: Date.now() - connection.acquiredAt,
            acquiredBy: connection.acquiredBy
          });
        }
        continue;
      }

      try {
        await this.#promisifyGetWithTimeout(connection.db, 'SELECT 1', [], 5000);
        connection.healthCheckFailures = 0;
      } catch (error) {
        connection.healthCheckFailures++;
        this.emit('healthCheckFailed', { 
          connection, 
          error: error.message,
          failures: connection.healthCheckFailures 
        });

        if (connection.healthCheckFailures >= this.#config.maxHealthCheckFailures) {
          await this.#reconnect(connection);
        }
      }
    }
  }

  /**
   * Reconnect a failed connection
   * @private
   * @param {PooledConnection} connection
   */
  async #reconnect(connection) {
    this.emit('reconnecting', { connection });
    
    try {
      // Close old connection
      await new Promise((resolve) => {
        try {
          connection.db.close(resolve);
        } catch (e) {
          resolve();
        }
      });

      // Create new connection properly using the same method as initial creation
      const newDb = await new Promise((resolve, reject) => {
        const db = new sqlite3.Database(this.#config.databasePath, async (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          try {
            await this.#runPragma(db, 'PRAGMA foreign_keys = ON');
            await this.#runPragma(db, 'PRAGMA journal_mode = WAL');
            resolve(db);
          } catch (pragmaErr) {
            db.close(() => reject(pragmaErr));
          }
        });
      });

      connection.db = newDb;
      connection.healthCheckFailures = 0;
      connection.createdAt = Date.now();
      connection.inUse = false;
      connection.acquiredAt = null;
      connection.acquiredBy = null;
      
      this.emit('reconnected', { connection });
    } catch (error) {
      this.emit('reconnectError', { 
        connection, 
        error: error.message,
        // Remove the connection from pool on reconnect failure
        removeFromPool: true
      });
      
      // Remove failed connection from pool
      const index = this.#pool.indexOf(connection);
      if (index > -1) {
        this.#pool.splice(index, 1);
      }
    }
  }

  /**
   * Start idle connection cleanup
   * @private
   */
  #startIdleCleanup() {
    this.#idleCleanupTimer = setInterval(() => {
      this.#cleanupIdleConnections();
    }, this.#config.idleTimeout / 2);
  }

  /**
   * Clean up idle connections above minimum
   * @private
   */
  #cleanupIdleConnections() {
    const now = Date.now();
    const toRemove = [];

    for (let i = this.#pool.length - 1; i >= 0; i--) {
      const conn = this.#pool[i];
      
      if (!conn.inUse && 
          this.#pool.length - toRemove.length > this.#config.minConnections &&
          now - conn.lastUsed > this.#config.idleTimeout) {
        toRemove.push(i);
      }
    }

    for (const index of toRemove) {
      const conn = this.#pool[index];
      try {
        conn.db.close();
      } catch (error) {
        this.emit('closeError', { connection: conn, error: error.message });
      }
      this.#pool.splice(index, 1);
      this.emit('connectionClosed', { connection: conn });
    }
  }

  /**
   * Get pool statistics
   * @returns {{total: number, inUse: number, available: number, healthCheckFailures: number, potentiallyLeaked: number}}
   */
  getStats() {
    const now = Date.now();
    return {
      total: this.#pool.length,
      inUse: this.#pool.filter(c => c.inUse).length,
      available: this.#pool.filter(c => !c.inUse).length,
      healthCheckFailures: this.#pool.reduce((sum, c) => sum + c.healthCheckFailures, 0),
      potentiallyLeaked: this.#pool.filter(c => 
        c.inUse && c.acquiredAt && now - c.acquiredAt > this.#config.maxConnectionLeaseTime
      ).length
    };
  }

  /**
   * Get detailed pool status including connection details
   * @returns {Object}
   */
  getDetailedStatus() {
    const now = Date.now();
    return {
      stats: this.getStats(),
      config: {
        minConnections: this.#config.minConnections,
        maxConnections: this.#config.maxConnections,
        acquireTimeout: this.#config.acquireTimeout,
        idleTimeout: this.#config.idleTimeout,
        maxConnectionLeaseTime: this.#config.maxConnectionLeaseTime
      },
      connections: this.#pool.map(c => ({
        inUse: c.inUse,
        age: now - c.createdAt,
        lastUsed: now - c.lastUsed,
        heldFor: c.inUse && c.acquiredAt ? now - c.acquiredAt : null,
        healthCheckFailures: c.healthCheckFailures,
        acquiredBy: c.acquiredBy
      }))
    };
  }

  /**
   * Close all connections and shutdown pool
   * @returns {Promise<void>}
   */
  async close() {
    this.#isShuttingDown = true;
    this.emit('shuttingDown');

    if (this.#healthCheckTimer) {
      clearInterval(this.#healthCheckTimer);
      this.#healthCheckTimer = null;
    }
    
    if (this.#idleCleanupTimer) {
      clearInterval(this.#idleCleanupTimer);
      this.#idleCleanupTimer = null;
    }

    // Wait for all connections to be released
    const waitStart = Date.now();
    while (this.#pool.some(c => c.inUse) && Date.now() - waitStart < 30000) {
      this.emit('waitingForConnections', { 
        activeConnections: this.#pool.filter(c => c.inUse).length 
      });
      await this.#delay(100);
    }

    // Close all connections
    const closePromises = this.#pool.map(conn => {
      return new Promise((resolve) => {
        try {
          conn.db.close((err) => {
            if (err) {
              this.emit('closeError', { connection: conn, error: err.message });
            }
            resolve();
          });
        } catch (error) {
          this.emit('closeError', { connection: conn, error: error.message });
          resolve();
        }
      });
    });

    await Promise.all(closePromises);
    this.#pool = [];
    this.#isInitialized = false;
    
    this.emit('closed');
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
}

/**
 * Create a default connection pool instance
 * @param {string} databasePath - Path to database file
 * @param {Object} [options] - Additional options
 * @returns {ConnectionPool}
 */
export function createPool(databasePath, options = {}) {
  return new ConnectionPool({ databasePath, ...options });
}

export default ConnectionPool;

// ============================================================================
// Singleton Database Access
// ============================================================================

/** @type {import('better-sqlite3').Database|null} */
let defaultDb = null;

/**
 * Set the default database instance for global access
 * @param {import('better-sqlite3').Database} db - Database instance
 */
export function setDb(db) {
  defaultDb = db;
}

/**
 * Get the default database instance
 * @returns {import('better-sqlite3')..Database}
 * @throws {ConnectionPoolError} If no database has been set
 */
export function getDb() {
  if (!defaultDb) {
    throw new ConnectionPoolError(
      'No default database has been set. Call setDb() first or initialize the connection pool.',
      'DB_NOT_INITIALIZED'
    );
  }
  return defaultDb;
}

/**
 * Clear the default database instance
 */
export function clearDb() {
  defaultDb = null;
}
