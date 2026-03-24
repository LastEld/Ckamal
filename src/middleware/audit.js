/**
 * Audit Logging Middleware
 * Tamper-proof audit logging with Merkle tree verification for CogniMesh
 *
 * @module src/middleware/audit
 */

import { createHash, randomUUID } from 'crypto';
import { MerkleTree } from '../domains/merkle/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} AuditRecord
 * @property {string} id - Unique record ID
 * @property {string} action - Action name
 * @property {string} timestamp - ISO timestamp
 * @property {string} actor - Actor identifier
 * @property {Object} context - Action context
 * @property {string} [resource] - Resource type
 * @property {string} [resourceId] - Resource ID
 * @property {string} [result] - Action result (success, failure)
 * @property {string} hash - Record hash
 * @property {string} [previousHash] - Previous record hash for chain
 * @property {string} [merkleRoot] - Associated Merkle root
 */

/**
 * @typedef {Object} AuditQueryFilters
 * @property {string} [action] - Filter by action
 * @property {string} [actor] - Filter by actor
 * @property {string} [resource] - Filter by resource
 * @property {string} [result] - Filter by result
 * @property {Date} [startDate] - Start date range
 * @property {Date} [endDate] - End date range
 * @property {string} [merkleRoot] - Filter by Merkle root
 */

/**
 * @typedef {Object} AnomalyResult
 * @property {boolean} detected - Whether anomaly was detected
 * @property {string} [type] - Anomaly type
 * @property {number} [severity] - Severity score (0-1)
 * @property {string} [description] - Description
 * @property {AuditRecord[]} [relatedRecords] - Related records
 */

// ============================================================================
// Errors
// ============================================================================

/**
 * Audit error
 */
export class AuditError extends Error {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'AuditError';
    this.code = code;
    this.metadata = metadata;
  }
}

// ============================================================================
// AuditMiddleware Class
// ============================================================================

/**
 * Audit middleware for tamper-proof logging
 * Integrates with Merkle trees for cryptographic verification
 */
export class AuditMiddleware {
  #records;
  #merkleTree;
  #config;
  #persistence;
  #anomalyConfig;
  #lastHash;
  #batchQueue;
  #batchTimer;

  /**
   * @param {Object} [config] - Configuration options
   * @param {boolean} [config.enableMerkle=true] - Enable Merkle tree integration
   * @param {number} [config.maxRecords=10000] - Maximum records to keep in memory
   * @param {number} [config.batchSize=100] - Batch size for Merkle tree updates
   * @param {number} [config.batchInterval=5000] - Batch flush interval in ms
   * @param {boolean} [config.chainHashes=true] - Chain record hashes for tamper detection
   * @param {Object} [config.anomalyDetection] - Anomaly detection config
   * @param {number} [config.anomalyDetection.rateThreshold=100] - Actions per minute threshold
   * @param {number} [config.anomalyDetection.errorThreshold=0.5] - Error rate threshold
   * @param {Function} [config.persistence] - Optional persistence function
   */
  constructor(config = {}) {
    this.#config = {
      enableMerkle: config.enableMerkle !== false,
      maxRecords: config.maxRecords || 10000,
      batchSize: config.batchSize || 100,
      batchInterval: config.batchInterval || 5000,
      chainHashes: config.chainHashes !== false,
      anomalyDetection: {
        rateThreshold: 100,
        errorThreshold: 0.5,
        ...config.anomalyDetection
      }
    };

    this.#records = new Map();
    this.#merkleTree = null;
    this.#persistence = config.persistence || null;
    this.#anomalyConfig = this.#config.anomalyDetection;
    this.#lastHash = null;
    this.#batchQueue = [];
    this.#batchTimer = null;

    this.#startBatchTimer();
  }

  // ========================================================================
  // Core Logging
  // ========================================================================

  /**
   * Log an action
   * @param {string} action - Action name
   * @param {Object} context - Action context
   * @param {string} context.actor - Actor identifier
   * @param {string} [context.resource] - Resource type
   * @param {string} [context.resourceId] - Resource ID
   * @param {Object} [context.details] - Additional details
   * @param {string} [context.result='success'] - Action result
   * @returns {Promise<AuditRecord>} Created record
   */
  async log(action, context) {
    if (!action) {
      throw new AuditError('INVALID_ACTION', 'Action name is required');
    }

    const record = this.#createRecord(action, context);
    
    // Store in memory
    this.#records.set(record.id, record);
    
    // Maintain max size
    if (this.#records.size > this.#config.maxRecords) {
      const oldestKey = this.#records.keys().next().value;
      this.#records.delete(oldestKey);
    }

    // Add to batch queue for Merkle tree
    if (this.#config.enableMerkle) {
      this.#batchQueue.push(record);
      
      if (this.#batchQueue.length >= this.#config.batchSize) {
        await this.#flushBatch();
      }
    }

    // Persist if configured
    if (this.#persistence) {
      await this.#persistence(record);
    }

    return record;
  }

  /**
   * Create a tamper-proof record
   * @param {Object} data - Record data
   * @returns {AuditRecord} Tamper-proof record with hash
   */
  tamperProof(data) {
    const record = {
      ...data,
      id: data.id || `audit_${randomUUID()}`,
      timestamp: data.timestamp || new Date().toISOString()
    };

    // Create chained hash if enabled
    const hashData = this.#config.chainHashes && this.#lastHash
      ? `${JSON.stringify(record)}|${this.#lastHash}`
      : JSON.stringify(record);

    record.hash = createHash('sha256').update(hashData).digest('hex');
    record.previousHash = this.#lastHash;
    
    this.#lastHash = record.hash;

    return record;
  }

  /**
   * Verify record integrity
   * @param {AuditRecord} record - Record to verify
   * @param {string} [expectedPreviousHash] - Expected previous hash
   * @returns {boolean} True if record is valid
   */
  verifyIntegrity(record, expectedPreviousHash = null) {
    if (!record || !record.hash) {
      return false;
    }

    const hashData = this.#config.chainHashes && record.previousHash
      ? `${JSON.stringify({ ...record, hash: undefined, previousHash: undefined, merkleRoot: undefined })}|${record.previousHash}`
      : JSON.stringify({ ...record, hash: undefined, previousHash: undefined, merkleRoot: undefined });

    const computedHash = createHash('sha256').update(hashData).digest('hex');

    if (computedHash !== record.hash) {
      return false;
    }

    if (expectedPreviousHash && record.previousHash !== expectedPreviousHash) {
      return false;
    }

    return true;
  }

  /**
   * Verify chain of records
   * @param {AuditRecord[]} records - Records to verify
   * @returns {Object} Verification result
   */
  verifyChain(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return { valid: true, index: -1 };
    }

    let previousHash = null;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      
      if (!this.verifyIntegrity(record, previousHash)) {
        return {
          valid: false,
          index: i,
          record,
          expectedPreviousHash: previousHash,
          actualPreviousHash: record.previousHash
        };
      }

      previousHash = record.hash;
    }

    return { valid: true, index: -1 };
  }

  // ========================================================================
  // Query Operations
  // ========================================================================

  /**
   * Query audit logs
   * @param {AuditQueryFilters} [filters] - Query filters
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=100] - Maximum results
   * @param {number} [options.offset=0] - Offset for pagination
   * @param {string} [options.sortBy='timestamp'] - Sort field
   * @param {string} [options.sortOrder='desc'] - Sort order
   * @returns {Object} Query results
   */
  query(filters = {}, options = {}) {
    const {
      limit = 100,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = options;

    let results = Array.from(this.#records.values());

    // Apply filters
    if (filters.action) {
      results = results.filter(r => r.action === filters.action);
    }
    if (filters.actor) {
      results = results.filter(r => r.actor === filters.actor);
    }
    if (filters.resource) {
      results = results.filter(r => r.resource === filters.resource);
    }
    if (filters.result) {
      results = results.filter(r => r.result === filters.result);
    }
    if (filters.merkleRoot) {
      results = results.filter(r => r.merkleRoot === filters.merkleRoot);
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      results = results.filter(r => new Date(r.timestamp) >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      results = results.filter(r => new Date(r.timestamp) <= end);
    }

    // Sort
    results.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    const total = results.length;
    const items = results.slice(offset, offset + limit);

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  /**
   * Get a single record by ID
   * @param {string} id - Record ID
   * @returns {AuditRecord|null} Record or null
   */
  getRecord(id) {
    return this.#records.get(id) || null;
  }

  // ========================================================================
  // Merkle Tree Integration
  // ========================================================================

  /**
   * Build Merkle tree from current records
   * @returns {MerkleTree|null} Built tree or null
   */
  buildMerkleTree() {
    const records = Array.from(this.#records.values());
    
    if (records.length === 0) {
      return null;
    }

    const leaves = records.map(r => JSON.stringify(r));
    this.#merkleTree = new MerkleTree();
    this.#merkleTree.build(leaves);

    return this.#merkleTree;
  }

  /**
   * Get current Merkle root
   * @returns {string|null} Root hash or null
   */
  getMerkleRoot() {
    return this.#merkleTree?.getRoot() || null;
  }

  /**
   * Generate Merkle proof for a record
   * @param {string} recordId - Record ID
   * @returns {Object|null} Merkle proof or null
   */
  generateMerkleProof(recordId) {
    const record = this.#records.get(recordId);
    
    if (!record || !this.#merkleTree) {
      return null;
    }

    return this.#merkleTree.generateProof(JSON.stringify(record));
  }

  /**
   * Verify record against Merkle tree
   * @param {string} recordId - Record ID
   * @returns {boolean} True if verified
   */
  verifyMerkleProof(recordId) {
    const proof = this.generateMerkleProof(recordId);
    
    if (!proof) {
      return false;
    }

    return this.#merkleTree.verifyProof(proof);
  }

  /**
   * Export audit trail with Merkle proofs
   * @param {AuditQueryFilters} [filters] - Filters for export
   * @returns {Object} Export data
   */
  exportTrail(filters = {}) {
    const { items } = this.query(filters, { limit: Infinity });
    
    // Build tree for these records
    const tree = new MerkleTree();
    tree.build(items.map(r => JSON.stringify(r)));
    const root = tree.getRoot();

    // Generate proofs for all records
    const recordsWithProofs = items.map(record => ({
      ...record,
      proof: tree.generateProof(JSON.stringify(record))
    }));

    return {
      root,
      recordCount: items.length,
      exportedAt: new Date().toISOString(),
      records: recordsWithProofs
    };
  }

  // ========================================================================
  // Anomaly Detection
  // ========================================================================

  /**
   * Detect anomalies in audit logs
   * @param {Object} [options] - Detection options
   * @param {number} [options.timeWindowMinutes=5] - Time window for analysis
   * @returns {AnomalyResult[]} Detected anomalies
   */
  detectAnomalies(options = {}) {
    const timeWindow = (options.timeWindowMinutes || 5) * 60 * 1000;
    const now = Date.now();
    const records = Array.from(this.#records.values()).filter(
      r => now - new Date(r.timestamp).getTime() < timeWindow
    );

    const anomalies = [];

    // Check action rate
    const actionCounts = this.#countBy(records, 'action');
    for (const [action, count] of Object.entries(actionCounts)) {
      if (count > this.#anomalyConfig.rateThreshold) {
        anomalies.push({
          detected: true,
          type: 'high_action_rate',
          severity: Math.min(count / this.#anomalyConfig.rateThreshold - 1, 1),
          description: `High rate of "${action}" actions: ${count} in ${options.timeWindowMinutes || 5} minutes`,
          relatedRecords: records.filter(r => r.action === action).slice(0, 10)
        });
      }
    }

    // Check error rate
    const errorRecords = records.filter(r => r.result === 'failure');
    const errorRate = records.length > 0 ? errorRecords.length / records.length : 0;
    
    if (errorRate > this.#anomalyConfig.errorThreshold) {
      anomalies.push({
        detected: true,
        type: 'high_error_rate',
        severity: Math.min(errorRate / this.#anomalyConfig.errorThreshold, 1),
        description: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
        relatedRecords: errorRecords.slice(0, 10)
      });
    }

    // Check for suspicious patterns
    const actorActions = this.#groupByActor(records);
    for (const [actor, actions] of Object.entries(actorActions)) {
      const uniqueActions = new Set(actions.map(a => a.action)).size;
      
      // Unusual variety of actions from single actor
      if (uniqueActions > 10 && actions.length > 20) {
        anomalies.push({
          detected: true,
          type: 'unusual_actor_behavior',
          severity: 0.6,
          description: `Actor "${actor}" performed ${uniqueActions} different actions`,
          relatedRecords: actions.slice(0, 10)
        });
      }
    }

    return anomalies;
  }

  /**
   * Get anomaly statistics
   * @param {number} [timeWindowHours=24] - Time window
   * @returns {Object} Statistics
   */
  getAnomalyStats(timeWindowHours = 24) {
    const timeWindow = timeWindowHours * 60 * 60 * 1000;
    const now = Date.now();
    const records = Array.from(this.#records.values()).filter(
      r => now - new Date(r.timestamp).getTime() < timeWindow
    );

    const actionCounts = this.#countBy(records, 'action');
    const actorCounts = this.#countBy(records, 'actor');
    const resultCounts = this.#countBy(records, 'result');

    return {
      totalRecords: records.length,
      uniqueActions: Object.keys(actionCounts).length,
      uniqueActors: Object.keys(actorCounts).length,
      actionDistribution: actionCounts,
      resultDistribution: resultCounts,
      errorRate: records.length > 0 
        ? (resultCounts.failure || 0) / records.length 
        : 0,
      topActors: Object.entries(actorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    };
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  /**
   * Get audit statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      totalRecords: this.#records.size,
      merkleRoot: this.getMerkleRoot(),
      batchQueueSize: this.#batchQueue.length,
      config: { ...this.#config }
    };
  }

  /**
   * Clear all records
   */
  clear() {
    this.#records.clear();
    this.#batchQueue = [];
    this.#merkleTree = null;
    this.#lastHash = null;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.#stopBatchTimer();
    this.clear();
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Create audit record
   * @private
   * @param {string} action - Action name
   * @param {Object} context - Context
   * @returns {AuditRecord} Created record
   */
  #createRecord(action, context) {
    const record = this.tamperProof({
      action,
      actor: context.actor || 'unknown',
      resource: context.resource,
      resourceId: context.resourceId,
      details: context.details,
      result: context.result || 'success',
      ip: context.ip,
      userAgent: context.userAgent
    });

    record.merkleRoot = this.getMerkleRoot();

    return record;
  }

  /**
   * Flush batch queue to Merkle tree
   * @private
   */
  async #flushBatch() {
    if (this.#batchQueue.length === 0) {
      return;
    }

    const records = [...this.#batchQueue];
    this.#batchQueue = [];

    // Rebuild tree with all records
    this.buildMerkleTree();

    // Update merkle root on new records
    const root = this.getMerkleRoot();
    for (const record of records) {
      record.merkleRoot = root;
    }
  }

  /**
   * Start batch timer
   * @private
   */
  #startBatchTimer() {
    if (this.#config.batchInterval > 0) {
      this.#batchTimer = setInterval(() => {
        this.#flushBatch();
      }, this.#config.batchInterval);
      
      if (this.#batchTimer.unref) {
        this.#batchTimer.unref();
      }
    }
  }

  /**
   * Stop batch timer
   * @private
   */
  #stopBatchTimer() {
    if (this.#batchTimer) {
      clearInterval(this.#batchTimer);
      this.#batchTimer = null;
    }
  }

  /**
   * Count records by field
   * @private
   * @param {AuditRecord[]} records - Records
   * @param {string} field - Field name
   * @returns {Object} Counts
   */
  #countBy(records, field) {
    return records.reduce((acc, record) => {
      const key = record[field] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Group records by actor
   * @private
   * @param {AuditRecord[]} records - Records
   * @returns {Object} Grouped records
   */
  #groupByActor(records) {
    return records.reduce((acc, record) => {
      const actor = record.actor || 'unknown';
      if (!acc[actor]) {
        acc[actor] = [];
      }
      acc[actor].push(record);
      return acc;
    }, {});
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

/**
 * Get default audit middleware instance
 * @returns {AuditMiddleware}
 */
export function getAuditMiddleware() {
  if (!defaultInstance) {
    defaultInstance = new AuditMiddleware();
  }
  return defaultInstance;
}

/**
 * Reset default instance (primarily for testing)
 */
export function resetAuditMiddleware() {
  if (defaultInstance) {
    defaultInstance.dispose();
    defaultInstance = null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export default AuditMiddleware;
