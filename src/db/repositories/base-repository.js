/**
 * @fileoverview Base Repository with CRUD operations for CogniMesh v5.0
 * @module db/repositories/base
 */

/**
 * Filter options for findAll and count
 * @typedef {Object} FilterOptions
 * @property {Object.<string, any>} [where] - Where conditions
 * @property {string} [orderBy] - Order by column
 * @property {('ASC'|'DESC')} [orderDirection='ASC'] - Order direction
 * @property {number} [limit] - Limit results
 * @property {number} [offset] - Offset results
 */

/**
 * BaseRepository - Abstract base class for all repositories
 * @abstract
 */
export class BaseRepository {
  /** @type {import('../connection/index.js').ConnectionPool} */
  #pool;
  
  /** @type {string} */
  #tableName;
  
  /** @type {string} */
  #primaryKey;
  
  /** @type {string[]} */
  #columns;

  /**
   * Create a base repository
   * @param {import('../connection/index.js').ConnectionPool} pool - Connection pool
   * @param {string} tableName - Database table name
   * @param {string} primaryKey - Primary key column name
   * @param {string[]} columns - List of column names (excluding primary key)
   */
  constructor(pool, tableName, primaryKey, columns) {
    if (new.target === BaseRepository) {
      throw new TypeError('Cannot instantiate abstract BaseRepository directly');
    }
    
    this.#pool = pool;
    this.#tableName = tableName;
    this.#primaryKey = primaryKey;
    this.#columns = columns;
  }

  /**
   * Get the connection pool
   * @protected
   * @returns {import('../connection/index.js').ConnectionPool}
   */
  get pool() {
    return this.#pool;
  }

  /**
   * Get the table name
   * @protected
   * @returns {string}
   */
  get tableName() {
    return this.#tableName;
  }

  /**
   * Get the primary key column name
   * @protected
   * @returns {string}
   */
  get primaryKey() {
    return this.#primaryKey;
  }

  /**
   * Get the column names
   * @protected
   * @returns {string[]}
   */
  get columns() {
    return [...this.#columns];
  }

  /**
   * Find a record by its primary key
   * @param {number|string} id - Record ID
   * @returns {Promise<Object|undefined>}
   */
  async findById(id) {
    const sql = `SELECT * FROM ${this.#tableName} WHERE ${this.#primaryKey} = ?`;
    return this.#pool.get(sql, [id]);
  }

  /**
   * Find all records with optional filtering
   * @param {FilterOptions} [filters={}] - Filter options
   * @returns {Promise<Object[]>}
   */
  async findAll(filters = {}) {
    const { whereClause, values } = this.#buildWhereClause(filters.where);
    const orderClause = this.#buildOrderClause(filters.orderBy, filters.orderDirection);
    const limitClause = this.#buildLimitClause(filters.limit, filters.offset);

    const sql = `SELECT * FROM ${this.#tableName}${whereClause}${orderClause}${limitClause}`;
    return this.#pool.all(sql, values);
  }

  /**
   * Create a new record
   * @param {Object} data - Record data (without primary key)
   * @returns {Promise<Object>} Created record with primary key
   */
  async create(data) {
    const filteredData = this.#filterValidColumns(data);
    const columns = Object.keys(filteredData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(filteredData);

    const sql = `INSERT INTO ${this.#tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await this.#pool.run(sql, values);

    return this.findById(result.lastID);
  }

  /**
   * Update a record by its primary key
   * @param {number|string} id - Record ID
   * @param {Object} data - Data to update
   * @returns {Promise<Object|undefined>} Updated record
   */
  async update(id, data) {
    const filteredData = this.#filterValidColumns(data);
    const columns = Object.keys(filteredData);
    
    if (columns.length === 0) {
      return this.findById(id);
    }

    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const values = [...Object.values(filteredData), id];

    const sql = `UPDATE ${this.#tableName} SET ${setClause} WHERE ${this.#primaryKey} = ?`;
    await this.#pool.run(sql, values);

    return this.findById(id);
  }

  /**
   * Delete a record by its primary key
   * @param {number|string} id - Record ID
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(id) {
    const sql = `DELETE FROM ${this.#tableName} WHERE ${this.#primaryKey} = ?`;
    const result = await this.#pool.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Count records with optional filtering
   * @param {Object} [where] - Where conditions
   * @returns {Promise<number>}
   */
  async count(where = {}) {
    const { whereClause, values } = this.#buildWhereClause(where);
    const sql = `SELECT COUNT(*) as count FROM ${this.#tableName}${whereClause}`;
    const result = await this.#pool.get(sql, values);
    return result?.count || 0;
  }

  /**
   * Check if a record exists
   * @param {number|string} id - Record ID
   * @returns {Promise<boolean>}
   */
  async exists(id) {
    const sql = `SELECT 1 as exists_flag FROM ${this.#tableName} WHERE ${this.#primaryKey} = ? LIMIT 1`;
    const result = await this.#pool.get(sql, [id]);
    return !!result;
  }

  /**
   * Execute within a transaction
   * @template T
   * @param {(repo: BaseRepository) => Promise<T>} fn - Function to execute
   * @returns {Promise<T>}
   */
  async transaction(fn) {
    return this.#pool.withTransaction(async (db) => {
      // Create a temporary repository with the transaction db
      const txRepo = new TransactionRepository(
        db,
        this.#tableName,
        this.#primaryKey,
        this.#columns
      );
      return fn(txRepo);
    });
  }

  /**
   * Build WHERE clause from conditions
   * @private
   * @param {Object} [where] - Where conditions
   * @returns {{whereClause: string, values: any[]}}
   */
  #buildWhereClause(where) {
    if (!where || Object.keys(where).length === 0) {
      return { whereClause: '', values: [] };
    }

    const conditions = [];
    const values = [];

    for (const [key, value] of Object.entries(where)) {
      if (value === null || value === undefined) {
        conditions.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => '?').join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        values.push(...value);
      } else if (typeof value === 'object' && value.operator) {
        // Advanced operators: { operator: '>', value: 5 }
        conditions.push(`${key} ${value.operator} ?`);
        values.push(value.value);
      } else {
        conditions.push(`${key} = ?`);
        values.push(value);
      }
    }

    return {
      whereClause: ` WHERE ${conditions.join(' AND ')}`,
      values
    };
  }

  /**
   * Build ORDER BY clause
   * @private
   * @param {string} [orderBy] - Order by column
   * @param {('ASC'|'DESC')} [direction='ASC'] - Order direction
   * @returns {string}
   */
  #buildOrderClause(orderBy, direction = 'ASC') {
    if (!orderBy) return '';
    const safeDirection = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    return ` ORDER BY ${orderBy} ${safeDirection}`;
  }

  /**
   * Build LIMIT/OFFSET clause
   * @private
   * @param {number} [limit] - Limit
   * @param {number} [offset] - Offset
   * @returns {string}
   */
  #buildLimitClause(limit, offset) {
    let clause = '';
    if (limit !== undefined && limit > 0) {
      clause += ` LIMIT ${Math.floor(limit)}`;
      if (offset !== undefined && offset > 0) {
        clause += ` OFFSET ${Math.floor(offset)}`;
      }
    }
    return clause;
  }

  /**
   * Filter data to only include valid columns
   * @private
   * @param {Object} data - Input data
   * @returns {Object}
   */
  #filterValidColumns(data) {
    const validColumns = new Set(this.#columns);
    const filtered = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (validColumns.has(key)) {
        filtered[key] = value;
      }
    }
    
    return filtered;
  }
}

/**
 * Transaction-aware repository for use within transactions
 * @extends BaseRepository
 */
class TransactionRepository extends BaseRepository {
  /** @type {import('sqlite3').Database} */
  #db;

  /**
   * @param {import('sqlite3').Database} db - Transaction database handle
   * @param {string} tableName
   * @param {string} primaryKey
   * @param {string[]} columns
   */
  constructor(db, tableName, primaryKey, columns) {
    // Pass a mock pool that delegates to the transaction db
    super({
      get: (sql, params) => this.#promisifyGet(sql, params),
      all: (sql, params) => this.#promisifyAll(sql, params),
      run: (sql, params) => this.#promisifyRun(sql, params)
    }, tableName, primaryKey, columns);
    
    this.#db = db;
  }

  /**
   * @private
   */
  #promisifyGet(sql, params) {
    return new Promise((resolve, reject) => {
      this.#db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * @private
   */
  #promisifyAll(sql, params) {
    return new Promise((resolve, reject) => {
      this.#db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * @private
   */
  #promisifyRun(sql, params) {
    return new Promise((resolve, reject) => {
      this.#db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
}

export default BaseRepository;
