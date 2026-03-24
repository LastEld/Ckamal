/**
 * @fileoverview Database Gateway - Connection pooling, transactions, and health checks
 * @module composition/db-gateway
 */

import { EventEmitter } from 'events';
import { createPool } from 'mysql2/promise';

/**
 * Database configuration options
 * @typedef {Object} DBConfig
 * @property {string} host - Database host
 * @property {number} port - Database port
 * @property {string} user - Database user
 * @property {string} password - Database password
 * @property {string} database - Database name
 * @property {number} [connectionLimit=10] - Max connections in pool
 * @property {number} [queueLimit=0] - Max connection queue size
 * @property {number} [acquireTimeout=60000] - Connection acquire timeout
 * @property {number} [timeout=60000] - Connection timeout
 * @property {DBConfig} [readReplica] - Optional read replica configuration
 */

/**
 * Query result wrapper
 * @typedef {Object} QueryResult
 * @property {Array} rows - Result rows
 * @property {Object} fields - Field metadata
 * @property {number} affectedRows - Number of affected rows
 * @property {number} insertId - Last insert ID
 */

/**
 * Database Gateway class managing connections, pooling, and queries
 * @extends EventEmitter
 */
export class DBGateway extends EventEmitter {
  /**
   * Primary connection pool
   * @type {import('mysql2/promise').Pool}
   * @private
   */
  #pool;

  /**
   * Read replica connection pool (for SELECT queries)
   * @type {import('mysql2/promise').Pool|null}
   * @private
   */
  #readPool;

  /**
   * Active connections for transaction management
   * @type {Map<string, import('mysql2/promise').Connection>}
   * @private
   */
  #activeConnections = new Map();

  /**
   * Gateway configuration
   * @type {DBConfig}
   * @private
   */
  #config;

  /**
   * Health check interval
   * @type {NodeJS.Timeout|null}
   * @private
   */
  #healthInterval = null;

  /**
   * Current health status
   * @type {{healthy: boolean, lastCheck: Date|null, errors: string[]}}
   * @private
   */
  #healthStatus = {
    healthy: false,
    lastCheck: null,
    errors: []
  };

  /**
   * Creates a new DBGateway instance
   * @param {DBConfig} config - Database configuration
   */
  constructor(config) {
    super();
    this.#config = {
      connectionLimit: 10,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000,
      ...config
    };
    this.#pool = this.#createPool(this.#config);
    
    // Create read replica pool if configured
    if (this.#config.readReplica) {
      this.#readPool = this.#createPool({
        ...this.#config.readReplica,
        connectionLimit: this.#config.readReplica.connectionLimit || this.#config.connectionLimit * 2
      });
    }

    this.#startHealthChecks();
  }

  /**
   * Creates a connection pool
   * @param {DBConfig} config - Pool configuration
   * @returns {import('mysql2/promise').Pool} Created pool
   * @private
   */
  #createPool(config) {
    return createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: config.connectionLimit,
      queueLimit: config.queueLimit,
      acquireTimeout: config.acquireTimeout,
      timeout: config.timeout,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      dateStrings: true
    });
  }

  /**
   * Starts periodic health checks
   * @private
   */
  #startHealthChecks() {
    const checkInterval = 30000; // 30 seconds
    
    this.#healthInterval = setInterval(async () => {
      await this.#performHealthCheck();
    }, checkInterval);

    // Initial health check
    this.#performHealthCheck();
  }

  /**
   * Performs a health check on primary and replica pools
   * @private
   */
  async #performHealthCheck() {
    const errors = [];
    let healthy = true;

    try {
      const conn = await this.#pool.getConnection();
      await conn.ping();
      conn.release();
    } catch (err) {
      healthy = false;
      errors.push(`Primary pool: ${err.message}`);
    }

    if (this.#readPool) {
      try {
        const conn = await this.#readPool.getConnection();
        await conn.ping();
        conn.release();
      } catch (err) {
        errors.push(`Read replica pool: ${err.message}`);
        // Don't mark unhealthy if primary is still working
      }
    }

    this.#healthStatus = {
      healthy,
      lastCheck: new Date(),
      errors
    };

    this.emit('healthCheck', this.#healthStatus);

    if (!healthy) {
      this.emit('unhealthy', errors);
    }
  }

  /**
   * Gets a connection from the pool
   * @param {boolean} [forRead=false] - Whether this is for a read operation
   * @returns {Promise<import('mysql2/promise').Connection>} Database connection
   * @throws {Error} If pool is exhausted or connection fails
   */
  async getConnection(forRead = false) {
    const pool = (forRead && this.#readPool) ? this.#readPool : this.#pool;
    const connection = await pool.getConnection();
    const connectionId = crypto.randomUUID();
    
    this.#activeConnections.set(connectionId, connection);
    connection.__gatewayId = connectionId;
    
    this.emit('connectionAcquired', { connectionId, forRead });
    
    return connection;
  }

  /**
   * Releases a connection back to the pool
   * @param {import('mysql2/promise').Connection} connection - Connection to release
   */
  releaseConnection(connection) {
    if (!connection) return;
    
    const connectionId = connection.__gatewayId;
    
    if (connectionId && this.#activeConnections.has(connectionId)) {
      this.#activeConnections.delete(connectionId);
    }
    
    try {
      connection.release();
      this.emit('connectionReleased', { connectionId });
    } catch (err) {
      // Connection may already be released
      this.emit('error', { message: 'Failed to release connection', error: err.message });
    }
  }

  /**
   * Executes a SQL query with optional parameters
   * @param {string} sql - SQL query string
   * @param {Array} [params=[]] - Query parameters
   * @param {Object} [options={}] - Query options
   * @param {boolean} [options.useReplica=true] - Use read replica for SELECT queries
   * @returns {Promise<QueryResult>} Query results
   * @throws {Error} If query execution fails
   */
  async query(sql, params = [], options = {}) {
    const { useReplica = true } = options;
    const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
    const useReadPool = isSelect && useReplica && this.#readPool;
    
    let connection;
    try {
      connection = await this.getConnection(useReadPool);
      const [rows, fields] = await connection.execute(sql, params);
      
      this.emit('query', { sql, params, rows: rows.length });
      
      return {
        rows,
        fields,
        affectedRows: rows.affectedRows || 0,
        insertId: rows.insertId || null
      };
    } catch (err) {
      this.emit('queryError', { sql, params, error: err.message });
      throw new Error(`Query failed: ${err.message}`);
    } finally {
      if (connection) {
        this.releaseConnection(connection);
      }
    }
  }

  /**
   * Executes multiple queries as an atomic transaction
   * @param {Array<{sql: string, params: Array}>} queries - Array of query objects
   * @returns {Promise<Array<QueryResult>>} Array of query results
   * @throws {Error} If any query fails, all changes are rolled back
   */
  async transaction(queries) {
    if (!Array.isArray(queries) || queries.length === 0) {
      throw new Error('Transaction requires at least one query');
    }

    let connection;
    const results = [];
    
    try {
      connection = await this.getConnection(false);
      await connection.beginTransaction();
      
      this.emit('transactionStart', { queryCount: queries.length });

      for (const { sql, params = [] } of queries) {
        const [rows, fields] = await connection.execute(sql, params);
        results.push({
          rows,
          fields,
          affectedRows: rows.affectedRows || 0,
          insertId: rows.insertId || null
        });
      }

      await connection.commit();
      this.emit('transactionCommit', { results: results.length });
      
      return results;
    } catch (err) {
      if (connection) {
        try {
          await connection.rollback();
          this.emit('transactionRollback', { error: err.message });
        } catch (rollbackErr) {
          this.emit('error', { 
            message: 'Rollback failed', 
            error: rollbackErr.message,
            originalError: err.message 
          });
        }
      }
      throw new Error(`Transaction failed: ${err.message}`);
    } finally {
      if (connection) {
        this.releaseConnection(connection);
      }
    }
  }

  /**
   * Gets current health status
   * @returns {{healthy: boolean, lastCheck: Date|null, errors: string[]}} Health status
   */
  getHealthStatus() {
    return { ...this.#healthStatus };
  }

  /**
   * Checks if the database is healthy
   * @returns {boolean} True if healthy
   */
  isHealthy() {
    return this.#healthStatus.healthy;
  }

  /**
   * Gets pool statistics
   * @returns {Object} Pool statistics
   */
  getPoolStats() {
    const primaryStats = {
      totalConnections: this.#pool._connectionQueue?.length || 0,
      freeConnections: this.#pool._freeConnections?.length || 0,
      acquiringConnections: this.#pool._acquiringConnections?.length || 0,
      connectionLimit: this.#config.connectionLimit
    };

    const replicaStats = this.#readPool ? {
      totalConnections: this.#readPool._connectionQueue?.length || 0,
      freeConnections: this.#readPool._freeConnections?.length || 0,
      acquiringConnections: this.#readPool._acquiringConnections?.length || 0,
      connectionLimit: this.#config.readReplica.connectionLimit
    } : null;

    return {
      primary: primaryStats,
      replica: replicaStats,
      activeConnections: this.#activeConnections.size
    };
  }

  /**
   * Closes all connections and stops health checks
   * @returns {Promise<void>}
   */
  async close() {
    if (this.#healthInterval) {
      clearInterval(this.#healthInterval);
      this.#healthInterval = null;
    }

    // Release any active connections
    for (const [id, conn] of this.#activeConnections) {
      try {
        conn.release();
      } catch {
        // Ignore release errors during shutdown
      }
    }
    this.#activeConnections.clear();

    await this.#pool.end();
    if (this.#readPool) {
      await this.#readPool.end();
    }

    this.emit('closed');
  }
}

export default DBGateway;
