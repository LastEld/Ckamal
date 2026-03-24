/**
 * @fileoverview Checkpoint management for workflow persistence.
 * @module gsd/checkpoint
 */

import { writeFile, readFile, mkdir, readdir, unlink, stat, access } from 'fs/promises';
import { join, dirname } from 'path';

/**
 * Checkpoint data structure.
 * @typedef {Object} Checkpoint
 * @property {string} id - Unique checkpoint identifier
 * @property {Object} state - Saved workflow state
 * @property {number} timestamp - Creation timestamp
 * @property {string} [version] - Checkpoint format version
 * @property {number} [size] - Checkpoint size in bytes
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Options for checkpoint manager.
 * @typedef {Object} CheckpointOptions
 * @property {string} [storagePath] - Path for checkpoint storage
 * @property {number} [maxCheckpoints] - Maximum number of checkpoints to keep
 * @property {number} [maxAge] - Maximum age of checkpoints in milliseconds
 * @property {boolean} [compress] - Whether to compress checkpoints
 */

/**
 * Manages workflow checkpoints for persistence and recovery.
 */
export class CheckpointManager {
  /**
   * @param {CheckpointOptions} [options] - Checkpoint options
   */
  constructor(options = {}) {
    this.storagePath = options.storagePath || './checkpoints';
    this.maxCheckpoints = options.maxCheckpoints || 10;
    this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.compress = options.compress || false;
    this.version = '1.0.0';
    
    /** @type {Map<string, Checkpoint>} */
    this.cache = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the checkpoint storage.
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await access(this.storagePath);
    } catch {
      await mkdir(this.storagePath, { recursive: true });
    }

    this.initialized = true;
  }

  /**
   * Generate checkpoint ID.
   * @returns {string}
   * @private
   */
  generateId() {
    return `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get checkpoint file path.
   * @param {string} checkpointId
   * @returns {string}
   * @private
   */
  getFilePath(checkpointId) {
    return join(this.storagePath, `${checkpointId}.json`);
  }

  /**
   * Create a new checkpoint.
   * @param {Object} state - Workflow state to checkpoint
   * @param {Object} [metadata] - Additional metadata
   * @returns {Promise<Checkpoint>} The created checkpoint
   * @example
   * const checkpoint = await manager.create(
   *   { tasks: completedTasks, progress: 50 },
   *   { description: 'After phase 1' }
   * );
   */
  async create(state, metadata = {}) {
    await this.initialize();

    const checkpoint = {
      id: this.generateId(),
      state: structuredClone ? structuredClone(state) : JSON.parse(JSON.stringify(state)),
      timestamp: Date.now(),
      version: this.version,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString()
      }
    };

    // Calculate size
    const stateJson = JSON.stringify(checkpoint.state);
    checkpoint.size = stateJson.length;

    // Save to file
    const filePath = this.getFilePath(checkpoint.id);
    await writeFile(filePath, JSON.stringify(checkpoint, null, 2));

    // Cache in memory
    this.cache.set(checkpoint.id, checkpoint);

    // Prune old checkpoints
    await this.prune();

    return checkpoint;
  }

  /**
   * Restore a checkpoint by ID.
   * @param {string} checkpointId - Checkpoint identifier
   * @returns {Promise<Checkpoint>} The restored checkpoint
   * @throws {Error} If checkpoint not found
   * @example
   * const checkpoint = await manager.restore('chk_1234567890_abc123');
   * console.log(checkpoint.state); // { tasks: [...], progress: 50 }
   */
  async restore(checkpointId) {
    await this.initialize();

    // Check cache first
    if (this.cache.has(checkpointId)) {
      const cached = this.cache.get(checkpointId);
      return structuredClone ? structuredClone(cached) : JSON.parse(JSON.stringify(cached));
    }

    // Load from file
    const filePath = this.getFilePath(checkpointId);
    try {
      const data = await readFile(filePath, 'utf-8');
      const checkpoint = JSON.parse(data);
      
      // Validate checkpoint
      if (!checkpoint.id || !checkpoint.state) {
        throw new Error(`Invalid checkpoint format: ${checkpointId}`);
      }

      // Cache for future access
      this.cache.set(checkpointId, checkpoint);

      return checkpoint;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }
      throw error;
    }
  }

  /**
   * List all available checkpoints.
   * @param {Object} [options] - List options
   * @param {boolean} [options.sortByTime=true] - Sort by timestamp
   * @param {boolean} [options.descending=true] - Sort in descending order
   * @returns {Promise<Checkpoint[]>} Array of checkpoint summaries
   * @example
   * const checkpoints = await manager.list();
   * checkpoints.forEach(chk => {
   *   console.log(`${chk.id}: ${chk.timestamp}`);
   * });
   */
  async list(options = {}) {
    await this.initialize();

    const { sortByTime = true, descending = true } = options;
    const checkpoints = [];

    try {
      const files = await readdir(this.storagePath);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const checkpointId = file.replace('.json', '');
        try {
          const checkpoint = await this.restore(checkpointId);
          checkpoints.push({
            id: checkpoint.id,
            timestamp: checkpoint.timestamp,
            version: checkpoint.version,
            size: checkpoint.size,
            metadata: checkpoint.metadata
          });
        } catch (error) {
          // Skip invalid checkpoints
          console.warn(`Skipping invalid checkpoint: ${checkpointId}`);
        }
      }
    } catch (error) {
      // Directory might not exist yet
      return [];
    }

    if (sortByTime) {
      checkpoints.sort((a, b) => {
        return descending 
          ? b.timestamp - a.timestamp 
          : a.timestamp - b.timestamp;
      });
    }

    return checkpoints;
  }

  /**
   * Delete a checkpoint.
   * @param {string} checkpointId - Checkpoint identifier
   * @returns {Promise<boolean>} True if deleted successfully
   * @example
   * const deleted = await manager.delete('chk_1234567890_abc123');
   * if (deleted) console.log('Checkpoint deleted');
   */
  async delete(checkpointId) {
    await this.initialize();

    const filePath = this.getFilePath(checkpointId);
    
    try {
      await unlink(filePath);
      this.cache.delete(checkpointId);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Prune old checkpoints based on age and count limits.
   * @param {Object} [options] - Prune options
   * @param {number} [options.maxAge] - Override max age in ms
   * @param {number} [options.maxCount] - Override max count
   * @returns {Promise<number>} Number of checkpoints deleted
   * @example
   * const deleted = await manager.prune({ maxAge: 24 * 60 * 60 * 1000 });
   * console.log(`Pruned ${deleted} old checkpoints`);
   */
  async prune(options = {}) {
    await this.initialize();

    const maxAge = options.maxAge || this.maxAge;
    const maxCount = options.maxCount || this.maxCheckpoints;
    const now = Date.now();
    let deleted = 0;

    const checkpoints = await this.list({ sortByTime: true, descending: false });

    // Delete by age
    for (const checkpoint of checkpoints) {
      if (now - checkpoint.timestamp > maxAge) {
        if (await this.delete(checkpoint.id)) {
          deleted++;
        }
      }
    }

    // Delete by count (keep newest)
    const remaining = await this.list({ sortByTime: true, descending: false });
    while (remaining.length > maxCount) {
      const oldest = remaining.shift();
      if (await this.delete(oldest.id)) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Get checkpoint statistics.
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    await this.initialize();

    const checkpoints = await this.list();
    const totalSize = checkpoints.reduce((sum, chk) => sum + (chk.size || 0), 0);

    return {
      total: checkpoints.length,
      totalSize,
      oldest: checkpoints.length > 0 
        ? Math.min(...checkpoints.map(c => c.timestamp))
        : null,
      newest: checkpoints.length > 0
        ? Math.max(...checkpoints.map(c => c.timestamp))
        : null
    };
  }

  /**
   * Clear all checkpoints.
   * @returns {Promise<number>} Number of checkpoints cleared
   */
  async clear() {
    await this.initialize();

    const checkpoints = await this.list();
    let deleted = 0;

    for (const checkpoint of checkpoints) {
      if (await this.delete(checkpoint.id)) {
        deleted++;
      }
    }

    return deleted;
  }
}

export default CheckpointManager;
