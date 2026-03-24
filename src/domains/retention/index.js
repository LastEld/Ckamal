/**
 * @fileoverview Retention Domain - Data retention policy management
 * @module domains/retention
 */

/**
 * Configuration for a retention policy
 * @typedef {Object} RetentionPolicy
 * @property {number} archiveAge - Age in days before archiving
 * @property {number} purgeAge - Age in days before purging
 * @property {string} storageTier - Storage tier (hot, warm, cold)
 * @property {boolean} compress - Whether to compress archived data
 */

/**
 * Archive record metadata
 * @typedef {Object} ArchiveRecord
 * @property {string} dataType - Type of data archived
 * @property {string} archivedAt - ISO timestamp of archival
 * @property {number} recordCount - Number of records archived
 * @property {string} location - Storage location
 */

/**
 * Manages data retention policies and lifecycle
 */
export class RetentionManager {
  /**
   * @private
   * @type {Map<string, RetentionPolicy>}
   */
  #policies = new Map();

  /**
   * @private
   * @type {Map<string, ArchiveRecord[]>}
   */
  #archives = new Map();

  /**
   * @private
   * @type {string[]}
   */
  #purgeLog = [];

  /**
   * Creates a new RetentionManager
   */
  constructor() {
    this.#policies = new Map();
    this.#archives = new Map();
    this.#purgeLog = [];
  }

  /**
   * Set a retention policy for a data type
   * @param {string} dataType - The type of data to apply policy to
   * @param {RetentionPolicy} config - Policy configuration
   * @returns {void}
   * @throws {Error} If config is invalid
   */
  setPolicy(dataType, config) {
    if (!dataType || typeof dataType !== 'string') {
      throw new Error('dataType must be a non-empty string');
    }

    if (!config || typeof config !== 'object') {
      throw new Error('config must be a valid object');
    }

    const policy = {
      archiveAge: config.archiveAge ?? 90,
      purgeAge: config.purgeAge ?? 365,
      storageTier: config.storageTier ?? 'warm',
      compress: config.compress ?? true
    };

    if (policy.purgeAge <= policy.archiveAge) {
      throw new Error('purgeAge must be greater than archiveAge');
    }

    this.#policies.set(dataType, policy);
  }

  /**
   * Get policy for a data type
   * @private
   * @param {string} dataType - Data type to lookup
   * @returns {RetentionPolicy|undefined}
   */
  #getPolicy(dataType) {
    return this.#policies.get(dataType);
  }

  /**
   * Apply all configured policies to their respective data types
   * @returns {Promise<Object>} Summary of applied actions
   */
  async applyPolicies() {
    const results = {
      archived: [],
      purged: [],
      errors: []
    };

    for (const [dataType, policy] of this.#policies) {
      try {
        const archiveResult = await this.archive(dataType, policy.archiveAge);
        if (archiveResult.recordCount > 0) {
          results.archived.push({
            dataType,
            ...archiveResult
          });
        }

        const purgeResult = await this.purge(dataType, policy.purgeAge);
        if (purgeResult.deletedCount > 0) {
          results.purged.push({
            dataType,
            ...purgeResult
          });
        }
      } catch (error) {
        results.errors.push({
          dataType,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Archive data older than specified age
   * @param {string} dataType - Type of data to archive
   * @param {number} age - Age threshold in days
   * @returns {Promise<ArchiveRecord>} Archive operation result
   */
  async archive(dataType, age) {
    if (!dataType || typeof dataType !== 'string') {
      throw new Error('dataType must be a non-empty string');
    }

    if (typeof age !== 'number' || age < 0) {
      throw new Error('age must be a non-negative number');
    }

    const policy = this.#getPolicy(dataType);
    const storageTier = policy?.storageTier ?? 'warm';
    const compress = policy?.compress ?? true;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - age);

    // Simulated archive operation
    const archiveRecord = {
      dataType,
      archivedAt: new Date().toISOString(),
      recordCount: 0,
      location: `${storageTier}/${dataType}/${cutoffDate.toISOString().split('T')[0]}`,
      compressed: compress,
      cutoffDate: cutoffDate.toISOString()
    };

    // Store archive record
    if (!this.#archives.has(dataType)) {
      this.#archives.set(dataType, []);
    }
    this.#archives.get(dataType).push(archiveRecord);

    return archiveRecord;
  }

  /**
   * Purge data older than specified age
   * @param {string} dataType - Type of data to purge
   * @param {number} age - Age threshold in days
   * @returns {Promise<Object>} Purge operation result
   */
  async purge(dataType, age) {
    if (!dataType || typeof dataType !== 'string') {
      throw new Error('dataType must be a non-empty string');
    }

    if (typeof age !== 'number' || age < 0) {
      throw new Error('age must be a non-negative number');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - age);

    const purgeRecord = {
      dataType,
      purgedAt: new Date().toISOString(),
      deletedCount: 0,
      cutoffDate: cutoffDate.toISOString()
    };

    this.#purgeLog.push(purgeRecord);

    return purgeRecord;
  }

  /**
   * Get archive history for a data type
   * @param {string} dataType - Data type to query
   * @returns {ArchiveRecord[]}
   */
  getArchiveHistory(dataType) {
    return this.#archives.get(dataType) ?? [];
  }

  /**
   * Get purge log
   * @returns {Object[]}
   */
  getPurgeLog() {
    return [...this.#purgeLog];
  }

  /**
   * List all configured policies
   * @returns {Object.<string, RetentionPolicy>}
   */
  listPolicies() {
    return Object.fromEntries(this.#policies);
  }
}

export default RetentionManager;
