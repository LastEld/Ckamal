/**
 * @fileoverview Context Snapshot Repository for CogniMesh v5.0
 * @module db/repositories/contexts
 */

import { createHash } from 'crypto';
import { BaseRepository } from './base-repository.js';

/**
 * @typedef {Object} ContextSnapshot
 * @property {number} id - Snapshot ID
 * @property {string} name - Context name
 * @property {string} [description] - Context description
 * @property {string} context_type - Type of context (session, project, agent, etc.)
 * @property {number} [parent_id] - Parent context ID
 * @property {string} state_data - JSON serialized state
 * @property {string} [metadata] - JSON metadata
 * @property {number} [version] - Version number
 * @property {string} [checksum] - State checksum for integrity
 * @property {number} [size_bytes] - Size of state data in bytes
 * @property {boolean} [compressed] - Whether data is compressed
 * @property {string} [tags] - JSON array of tags
 * @property {string} [created_by] - Creator identifier
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 * @property {string} [expires_at] - Expiration timestamp
 */

/**
 * @typedef {Object} ContextDiff
 * @property {string[]} added - Added keys
 * @property {string[]} removed - Removed keys
 * @property {Object} modified - Modified keys with old/new values
 * @property {Object} unchanged - Unchanged keys
 */

/**
 * Context snapshot repository
 * @extends BaseRepository
 */
export class ContextRepository extends BaseRepository {
  /** @type {string[]} */
  static COLUMNS = [
    'name',
    'description',
    'context_type',
    'parent_id',
    'state_data',
    'metadata',
    'version',
    'checksum',
    'size_bytes',
    'compressed',
    'tags',
    'created_by',
    'expires_at'
  ];

  /**
   * Create a context repository
   * @param {import('../connection/index.js').ConnectionPool} pool - Connection pool
   */
  constructor(pool) {
    super(pool, 'contexts', 'id', ContextRepository.COLUMNS);
  }

  /**
   * Create a new context snapshot
   * @param {Object} data - Context data
   * @returns {Promise<ContextSnapshot>}
   */
  async create(data) {
    const enrichedData = { ...data };

    // Auto-calculate checksum if state_data provided
    if (enrichedData.state_data && !enrichedData.checksum) {
      enrichedData.checksum = this.#calculateChecksum(enrichedData.state_data);
    }

    // Auto-calculate size
    if (enrichedData.state_data) {
      enrichedData.size_bytes = Buffer.byteLength(
        enrichedData.state_data, 
        'utf8'
      );
    }

    // Set initial version
    if (!enrichedData.version) {
      enrichedData.version = 1;
    }

    return super.create(enrichedData);
  }

  /**
   * Create a versioned snapshot (increments version from parent)
   * @param {number} parentId - Parent context ID
   * @param {Object} data - New context data
   * @returns {Promise<ContextSnapshot>}
   */
  async createVersion(parentId, data) {
    const parent = await this.findById(parentId);
    if (!parent) {
      throw new Error(`Parent context ${parentId} not found`);
    }

    return this.create({
      ...data,
      parent_id: parentId,
      version: (parent.version || 1) + 1,
      context_type: parent.context_type
    });
  }

  /**
   * Get context with parsed state data
   * @param {number} id - Context ID
   * @returns {Promise<(ContextSnapshot & {parsedState: Object})|undefined>}
   */
  async getWithState(id) {
    const context = await this.findById(id);
    if (!context) return undefined;

    return {
      ...context,
      parsedState: this.#parseState(context.state_data)
    };
  }

  /**
   * Update context with version increment
   * @param {number} id - Context ID
   * @param {Object} data - Update data
   * @returns {Promise<ContextSnapshot|undefined>}
   */
  async update(id, data) {
    const enrichedData = { ...data };

    // Recalculate checksum if state changed
    if (enrichedData.state_data) {
      enrichedData.checksum = this.#calculateChecksum(enrichedData.state_data);
      enrichedData.size_bytes = Buffer.byteLength(
        enrichedData.state_data, 
        'utf8'
      );
    }

    // Auto-increment version on update
    const current = await this.findById(id);
    if (current && enrichedData.state_data !== undefined) {
      enrichedData.version = (current.version || 1) + 1;
    }

    return super.update(id, enrichedData);
  }

  /**
   * Find contexts by type
   * @param {string} type - Context type
   * @param {Object} [options] - Query options
   * @returns {Promise<ContextSnapshot[]>}
   */
  async findByType(type, options = {}) {
    return this.findAll({
      where: { context_type: type },
      orderBy: 'updated_at',
      orderDirection: 'DESC',
      limit: options.limit,
      offset: options.offset
    });
  }

  /**
   * Find contexts by parent
   * @param {number} parentId - Parent context ID
   * @returns {Promise<ContextSnapshot[]>}
   */
  async findByParent(parentId) {
    return this.findAll({
      where: { parent_id: parentId },
      orderBy: 'version',
      orderDirection: 'ASC'
    });
  }

  /**
   * Find root contexts (no parent)
   * @param {Object} [options] - Query options
   * @returns {Promise<ContextSnapshot[]>}
   */
  async findRoots(options = {}) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE parent_id IS NULL
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `;
    
    return this.pool.all(sql, [
      options.limit || 50,
      options.offset || 0
    ]);
  }

  /**
   * Get version history for a context chain
   * @param {number} id - Context ID
   * @returns {Promise<ContextSnapshot[]>}
   */
  async getVersionHistory(id) {
    // Get the root of this chain
    let root = await this.findById(id);
    while (root && root.parent_id) {
      const parent = await this.findById(root.parent_id);
      if (!parent) break;
      root = parent;
    }

    if (!root) return [];

    // Get all descendants
    const history = [root];
    await this.#collectDescendants(root.id, history);

    return history.sort((a, b) => (a.version || 0) - (b.version || 0));
  }

  /**
   * Recursively collect all descendants
   * @private
   * @param {number} parentId
   * @param {ContextSnapshot[]} accumulator
   */
  async #collectDescendants(parentId, accumulator) {
    const children = await this.findByParent(parentId);
    
    for (const child of children) {
      accumulator.push(child);
      await this.#collectDescendants(child.id, accumulator);
    }
  }

  /**
   * Find contexts by tag
   * @param {string} tag - Tag to search for
   * @param {Object} [options] - Query options
   * @returns {Promise<ContextSnapshot[]>}
   */
  async findByTag(tag, options = {}) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE tags LIKE ?
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `;

    return this.pool.all(sql, [
      `%"${tag}"%`,
      options.limit || 50,
      options.offset || 0
    ]);
  }

  /**
   * Find contexts created by a specific entity
   * @param {string} createdBy - Creator identifier
   * @param {Object} [options] - Query options
   * @returns {Promise<ContextSnapshot[]>}
   */
  async findByCreator(createdBy, options = {}) {
    return this.findAll({
      where: { created_by: createdBy },
      orderBy: 'created_at',
      orderDirection: 'DESC',
      limit: options.limit,
      offset: options.offset
    });
  }

  /**
   * Get expired contexts
   * @returns {Promise<ContextSnapshot[]>}
   */
  async findExpired() {
    const now = new Date().toISOString();
    
    return this.findAll({
      where: { 
        expires_at: { operator: '<', value: now }
      },
      orderBy: 'expires_at',
      orderDirection: 'ASC'
    });
  }

  /**
   * Get contexts expiring soon
   * @param {number} [hours=24] - Hours to look ahead
   * @returns {Promise<ContextSnapshot[]>}
   */
  async findExpiringSoon(hours = 24) {
    const now = new Date().toISOString();
    const future = new Date();
    future.setHours(future.getHours() + hours);

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE expires_at >= ? AND expires_at <= ?
      ORDER BY expires_at ASC
    `;

    return this.pool.all(sql, [now, future.toISOString()]);
  }

  /**
   * Diff two context snapshots
   * @param {number} id1 - First context ID
   * @param {number} id2 - Second context ID
   * @returns {Promise<ContextDiff>}
   */
  async diff(id1, id2) {
    const [ctx1, ctx2] = await Promise.all([
      this.getWithState(id1),
      this.getWithState(id2)
    ]);

    if (!ctx1 || !ctx2) {
      throw new Error('One or both contexts not found');
    }

    const state1 = ctx1.parsedState || {};
    const state2 = ctx2.parsedState || {};

    const keys1 = Object.keys(state1);
    const keys2 = Object.keys(state2);

    const added = keys2.filter(k => !keys1.includes(k));
    const removed = keys1.filter(k => !keys2.includes(k));
    const modified = {};
    const unchanged = {};

    for (const key of keys1) {
      if (keys2.includes(key)) {
        const val1 = JSON.stringify(state1[key]);
        const val2 = JSON.stringify(state2[key]);
        
        if (val1 !== val2) {
          modified[key] = {
            old: state1[key],
            new: state2[key]
          };
        } else {
          unchanged[key] = state1[key];
        }
      }
    }

    return { added, removed, modified, unchanged };
  }

  /**
   * Fork a context (create new branch)
   * @param {number} id - Context ID to fork
   * @param {Object} forkData - Fork metadata
   * @returns {Promise<ContextSnapshot>}
   */
  async fork(id, forkData) {
    const original = await this.findById(id);
    if (!original) {
      throw new Error(`Context ${id} not found`);
    }

    return this.create({
      name: forkData.name || `${original.name} (fork)`,
      description: forkData.description || original.description,
      context_type: original.context_type,
      state_data: original.state_data,
      metadata: JSON.stringify({
        ...this.#parseState(original.metadata),
        forked_from: id,
        forked_at: new Date().toISOString()
      }),
      version: 1,
      checksum: original.checksum,
      size_bytes: original.size_bytes,
      tags: forkData.tags || original.tags,
      created_by: forkData.created_by
    });
  }

  /**
   * Merge context changes (creates new version)
   * @param {number} targetId - Target context ID
   * @param {number} sourceId - Source context ID
   * @param {Object} mergeOptions - Merge options
   * @returns {Promise<ContextSnapshot>}
   */
  async merge(targetId, sourceId, mergeOptions = {}) {
    const [target, source] = await Promise.all([
      this.getWithState(targetId),
      this.getWithState(sourceId)
    ]);

    if (!target || !source) {
      throw new Error('One or both contexts not found');
    }

    const targetState = target.parsedState || {};
    const sourceState = source.parsedState || {};

    // Simple merge: source overwrites target
    const mergedState = mergeOptions.deep
      ? this.#deepMerge(targetState, sourceState)
      : { ...targetState, ...sourceState };

    return this.createVersion(targetId, {
      name: mergeOptions.name || `${target.name} (merged)`,
      state_data: JSON.stringify(mergedState),
      metadata: JSON.stringify({
        merged_from: [targetId, sourceId],
        merged_at: new Date().toISOString()
      })
    });
  }

  /**
   * Verify context integrity using checksum
   * @param {number} id - Context ID
   * @returns {Promise<boolean>}
   */
  async verifyIntegrity(id) {
    const context = await this.findById(id);
    if (!context || !context.checksum) return false;

    const calculatedChecksum = this.#calculateChecksum(context.state_data);
    return calculatedChecksum === context.checksum;
  }

  /**
   * Get context statistics
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT context_type) as type_count,
        SUM(size_bytes) as total_size,
        AVG(size_bytes) as avg_size,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_count,
        COUNT(CASE WHEN expires_at < datetime('now') THEN 1 END) as expired_count
      FROM ${this.tableName}
    `;

    return this.pool.get(sql, []);
  }

  /**
   * Get storage statistics by type
   * @returns {Promise<Object[]>}
   */
  async getStorageByType() {
    const sql = `
      SELECT 
        context_type,
        COUNT(*) as count,
        SUM(size_bytes) as total_size,
        AVG(size_bytes) as avg_size,
        MAX(size_bytes) as max_size
      FROM ${this.tableName}
      GROUP BY context_type
      ORDER BY total_size DESC
    `;

    return this.pool.all(sql, []);
  }

  /**
   * Search contexts
   * @param {string} query - Search query
   * @param {Object} [options] - Search options
   * @returns {Promise<ContextSnapshot[]>}
   */
  async search(query, options = {}) {
    const { limit = 20, type } = options;
    const searchPattern = `%${query}%`;

    let sql = `
      SELECT * FROM ${this.tableName}
      WHERE (name LIKE ? OR description LIKE ?)
    `;
    const params = [searchPattern, searchPattern];

    if (type) {
      sql += ` AND context_type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY updated_at DESC LIMIT ?`;
    params.push(limit);

    return this.pool.all(sql, params);
  }

  /**
   * Clean up expired contexts
   * @param {number} [batchSize=100] - Max to delete
   * @returns {Promise<number>} Number deleted
   */
  async cleanupExpired(batchSize = 100) {
    const expired = await this.findExpired();
    const toDelete = expired.slice(0, batchSize);

    let deleted = 0;
    for (const context of toDelete) {
      const success = await this.delete(context.id);
      if (success) deleted++;
    }

    return deleted;
  }

  /**
   * Calculate checksum for data
   * @private
   * @param {string} data
   * @returns {string}
   */
  #calculateChecksum(data) {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Parse state data JSON
   * @private
   * @param {string} stateData
   * @returns {Object}
   */
  #parseState(stateData) {
    if (!stateData) return {};
    try {
      return JSON.parse(stateData);
    } catch {
      return {};
    }
  }

  /**
   * Deep merge two objects
   * @private
   * @param {Object} target
   * @param {Object} source
   * @returns {Object}
   */
  #deepMerge(target, source) {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.#deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}

export default ContextRepository;
