/**
 * @fileoverview Composition Gateway Module - Centralized data access layer
 * @module composition
 *
 * This module provides a unified gateway layer for database operations,
 * roadmap management, and git checkpoint functionality. It serves as the
 * primary interface between the application business logic and data sources.
 *
 * @example
 * // Import specific gateways
 * import { DBGateway, RoadmapGateway, GitCheckpointGateway } from './composition/index.js';
 *
 * // Initialize database gateway
 * const db = new DBGateway({
 *   host: 'localhost',
 *   port: 3306,
 *   user: 'app',
 *   password: 'secret',
 *   database: 'cognimesh',
 *   readReplica: {
 *     host: 'replica.local',
 *     port: 3306,
 *     user: 'readonly',
 *     password: 'secret',
 *     database: 'cognimesh'
 *   }
 * });
 *
 * // Initialize roadmap gateway with caching
 * const roadmapGateway = new RoadmapGateway(db, {
 *   cacheTTL: 300000 // 5 minutes
 * });
 *
 * // Initialize git checkpoint gateway
 * const checkpointGateway = new GitCheckpointGateway({
 *   repoPath: process.cwd(),
 *   tagPrefix: 'checkpoint/'
 * });
 *
 * @example
 * // Use event listeners for monitoring
 * db.on('query', ({ sql, rows }) => {
 *   console.log(`Executed query returning ${rows} rows`);
 * });
 *
 * roadmapGateway.on('roadmapCreated', ({ id, title }) => {
 *   console.log(`Roadmap created: ${title} (${id})`);
 * });
 *
 * checkpointGateway.on('checkpointCreated', (checkpoint) => {
 *   console.log(`Checkpoint created: ${checkpoint.message}`);
 * });
 */

// Database Gateway
export { 
  DBGateway,
  /** @typedef {import('./db-gateway.js').DBConfig} DBConfig */
  /** @typedef {import('./db-gateway.js').QueryResult} QueryResult */
} from './db-gateway.js';

// Roadmap Gateway
export { 
  RoadmapGateway,
  /** @typedef {import('./roadmap-gateway.js').Roadmap} Roadmap */
  /** @typedef {import('./roadmap-gateway.js').RoadmapFilters} RoadmapFilters */
  /** @typedef {import('./roadmap-gateway.js').Progress} Progress */
} from './roadmap-gateway.js';

// Git Checkpoint Gateway
export { 
  GitCheckpointGateway,
  /** @typedef {import('./git-checkpoint-gateway.js').Checkpoint} Checkpoint */
  /** @typedef {import('./git-checkpoint-gateway.js').CheckpointDiff} CheckpointDiff */
} from './git-checkpoint-gateway.js';

/**
 * @typedef {Object} CompositionGatewayConfig
 * @property {import('./db-gateway.js').DBConfig} db - Database configuration
 * @property {Object} [roadmap] - Roadmap gateway options
 * @property {number} [roadmap.cacheTTL] - Cache TTL in milliseconds
 * @property {Object} [checkpoint] - Checkpoint gateway options
 * @property {string} [checkpoint.repoPath] - Git repository path
 * @property {string} [checkpoint.tagPrefix] - Checkpoint tag prefix
 */

/**
 * Composition Gateway manager class for coordinated gateway access
 * @class
 * @example
 * const manager = new CompositionGatewayManager(config);
 * await manager.initialize();
 * 
 * // Use gateways
 * const roadmap = await manager.roadmaps.getRoadmap('123');
 * await manager.db.transaction([...]);
 * 
 * // Cleanup
 * await manager.close();
 */
export class CompositionGatewayManager {
  /**
   * Database gateway instance
   * @type {import('./db-gateway.js').DBGateway|null}
   */
  db = null;

  /**
   * Roadmap gateway instance
   * @type {import('./roadmap-gateway.js').RoadmapGateway|null}
   */
  roadmaps = null;

  /**
   * Git checkpoint gateway instance
   * @type {import('./git-checkpoint-gateway.js').GitCheckpointGateway|null}
   */
  checkpoints = null;

  /**
   * Configuration object
   * @type {CompositionGatewayConfig}
   * @private
   */
  #config;

  /**
   * Creates a new CompositionGatewayManager
   * @param {CompositionGatewayConfig} config - Gateway configuration
   */
  constructor(config) {
    this.#config = config;
  }

  /**
   * Initializes all gateways
   * @returns {Promise<void>}
   * @throws {Error} If initialization fails
   */
  async initialize() {
    const { DBGateway } = await import('./db-gateway.js');
    const { RoadmapGateway } = await import('./roadmap-gateway.js');
    const { GitCheckpointGateway } = await import('./git-checkpoint-gateway.js');

    // Initialize database gateway
    this.db = new DBGateway(this.#config.db);

    // Initialize roadmap gateway with database connection
    this.roadmaps = new RoadmapGateway(this.db, this.#config.roadmap);

    // Initialize checkpoint gateway
    this.checkpoints = new GitCheckpointGateway(this.#config.checkpoint);
  }

  /**
   * Gets health status for all gateways
   * @returns {{db: Object, roadmaps: Object, checkpoints: Object}} Health status
   */
  getHealthStatus() {
    return {
      db: this.db?.getHealthStatus() || { healthy: false },
      roadmaps: {
        connected: !!this.roadmaps,
        cacheStats: this.roadmaps?.getCacheStats()
      },
      checkpoints: {
        initialized: !!this.checkpoints
      }
    };
  }

  /**
   * Closes all gateways and releases resources
   * @returns {Promise<void>}
   */
  async close() {
    await this.db?.close();
    this.roadmaps?.close();
    this.checkpoints?.removeAllListeners();
    
    this.db = null;
    this.roadmaps = null;
    this.checkpoints = null;
  }
}

export default {
  DBGateway: null, // Set at runtime via dynamic import
  RoadmapGateway: null,
  GitCheckpointGateway: null,
  CompositionGatewayManager
};
