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
 */

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
      ...config
    };
    
    if (!this.#config.databasePath) {
      throw new Error('databasePath is required');
    }
  }

  /**
   * Initialize the connection pool
   * @returns {Promise<void>}
   */
  async initialize() {
    this.emit('initializing');
    
    // Create minimum connections
    const createPromises = [];
    for (let i = 0; i < this.#config.minConnections; i++) {
      createPromises.push(this.#createConnection());
    }
    
    await Promise.all(createPromises);
    
    // Start health checks
    this.#startHealthChecks();
    this.#startIdleCleanup();
    
    this.emit('initialized', { poolSize: this.#pool.length });
  }

  /**
   * Create a new database connection
   * @private
   * @returns {Promise<PooledConnection>}
   */
  #createConnection() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.#config.databasePath, (err) => {
        if (err) {
          this.emit('connectionError', err);
          reject(err);
          return;
        }

        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');
        
        // Enable WAL mode for better concurrency
        db.run('PRAGMA journal_mode = WAL');

        const connection = {
          db,
          inUse: false,
          lastUsed: Date.now(),
          createdAt: Date.now(),
          healthCheckFailures: 0
        };

        this.#pool.push(connection);
        this.emit('connectionCreated', { connection });
        resolve(connection);
      });
    });
  }

  /**
   * Acquire a connection from the pool
   * @returns {Promise<sqlite3.Database>}
   */
  async acquire() {
    if (this.#isShuttingDown) {
      throw new Error('Pool is shutting down');
    }

    const startTime = Date.now();
    
    while (Date.now() - startTime < this.#config.acquireTimeout) {
      // Look for available connection
      const available = this.#pool.find(c => !c.inUse);
      
      if (available) {
        available.inUse = true;
        available.lastUsed = Date.now();
        available.healthCheckFailures = 0;
        this.emit('connectionAcquired', { connection: available });
        return available.db;
      }

      // Create new connection if under max
      if (this.#pool.length < this.#config.maxConnections) {
        const conn = await this.#createConnection();
        conn.inUse = true;
        conn.lastUsed = Date.now();
        this.emit('connectionAcquired', { connection: conn });
        return conn.db;
      }

      // Wait a bit and retry
      await this.#delay(50);
    }

    throw new Error(`Failed to acquire connection within ${this.#config.acquireTimeout}ms`);
  }

  /**
   * Release a connection back to the pool
   * @param {sqlite3.Database} db - Database connection to release
   * @returns {void}
   */
  release(db) {
    const connection = this.#pool.find(c => c.db === db);
    
    if (!connection) {
      this.emit('releaseError', new Error('Connection not found in pool'));
      return;
    }

    connection.inUse = false;
    connection.lastUsed = Date.now();
    this.emit('connectionReleased', { connection });
  }

  /**
   * Execute a SQL query and return all rows
   * @param {string} sql - SQL query
   * @param {any[]} [params=[]] - Query parameters
   * @returns {Promise<any[]>}
   */
  async query(sql, params = []) {
    const db = await this.acquire();
    try {
      return await this.#promisifyAll(db, sql, params);
    } finally {
      this.release(db);
    }
  }

  /**
   * Execute a SQL query and return first row
   * @param {string} sql - SQL query
   * @param {any[]} [params=[]] - Query parameters
   * @returns {Promise<any|undefined>}
   */
  async get(sql, params = []) {
    const db = await this.acquire();
    try {
      return await this.#promisifyGet(db, sql, params);
    } finally {
      this.release(db);
    }
  }

  /**
   * Execute a SQL query and return all rows
   * @param {string} sql - SQL query
   * @param {any[]} [params=[]] - Query parameters
   * @returns {Promise<any[]>}
   */
  async all(sql, params = []) {
    return this.query(sql, params);
  }

  /**
   * Execute a SQL run statement (INSERT, UPDATE, DELETE)
   * @param {string} sql - SQL statement
   * @param {any[]} [params=[]] - Statement parameters
   * @returns {Promise<{lastID: number, changes: number}>}
   */
  async run(sql, params = []) {
    const db = await this.acquire();
    try {
      return await this.#promisifyRun(db, sql, params);
    } finally {
      this.release(db);
    }
  }

  /**
   * Execute a function within a transaction
   * @template T
   * @param {(db: sqlite3.Database) => Promise<T>} fn - Function to execute
   * @returns {Promise<T>}
   */
  async withTransaction(fn) {
    const db = await this.acquire();
    
    try {
      await this.#promisifyRun(db, 'BEGIN TRANSACTION');
      
      try {
        const result = await fn(db);
        await this.#promisifyRun(db, 'COMMIT');
        return result;
      } catch (error) {
        await this.#promisifyRun(db, 'ROLLBACK');
        throw error;
      }
    } finally {
      this.release(db);
    }
  }

  /**
   * Promisified db.all
   * @private
   * @param {sqlite3.Database} db
   * @param {string} sql
   * @param {any[]} params
   * @returns {Promise<any[]>}
   */
  #promisifyAll(db, sql, params) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Promisified db.get
   * @private
   * @param {sqlite3.Database} db
   * @param {string} sql
   * @param {any[]} params
   * @returns {Promise<any>}
   */
  #promisifyGet(db, sql, params) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Promisified db.run
   * @private
   * @param {sqlite3.Database} db
   * @param {string} sql
   * @param {any[]} params
   * @returns {Promise<{lastID: number, changes: number}>}
   */
  #promisifyRun(db, sql, params) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
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
      if (connection.inUse) continue;

      try {
        await this.#promisifyGet(connection.db, 'SELECT 1');
        connection.healthCheckFailures = 0;
      } catch (error) {
        connection.healthCheckFailures++;
        this.emit('healthCheckFailed', { connection, error });

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
        connection.db.close(resolve);
      });

      // Create new connection
      const db = new sqlite3.Database(this.#config.databasePath, (err) => {
        if (err) {
          this.emit('reconnectError', err);
          return;
        }
        
        db.run('PRAGMA foreign_keys = ON');
        db.run('PRAGMA journal_mode = WAL');
      });

      connection.db = db;
      connection.healthCheckFailures = 0;
      connection.createdAt = Date.now();
      
      this.emit('reconnected', { connection });
    } catch (error) {
      this.emit('reconnectError', error);
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
      conn.db.close();
      this.#pool.splice(index, 1);
      this.emit('connectionClosed', { connection: conn });
    }
  }

  /**
   * Get pool statistics
   * @returns {{total: number, inUse: number, available: number, healthCheckFailures: number}}
   */
  getStats() {
    return {
      total: this.#pool.length,
      inUse: this.#pool.filter(c => c.inUse).length,
      available: this.#pool.filter(c => !c.inUse).length,
      healthCheckFailures: this.#pool.reduce((sum, c) => sum + c.healthCheckFailures, 0)
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
    }
    
    if (this.#idleCleanupTimer) {
      clearInterval(this.#idleCleanupTimer);
    }

    // Wait for all connections to be released
    const waitStart = Date.now();
    while (this.#pool.some(c => c.inUse) && Date.now() - waitStart < 30000) {
      await this.#delay(100);
    }

    // Close all connections
    const closePromises = this.#pool.map(conn => {
      return new Promise((resolve) => {
        conn.db.close(resolve);
      });
    });

    await Promise.all(closePromises);
    this.#pool = [];
    
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
 * @returns {ConnectionPool}
 */
export function createPool(databasePath) {
  return new ConnectionPool({ databasePath });
}

export default ConnectionPool;
