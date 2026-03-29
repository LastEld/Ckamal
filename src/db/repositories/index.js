/**
 * @fileoverview Repository Factory for CogniMesh v5.0
 * @module db/repositories
 */

import { ConnectionPool } from '../connection/index.js';
import { TaskRepository } from './tasks.js';
import { RoadmapRepository } from './roadmaps.js';
import { MerkleRepository } from './merkle.js';
import { ContextRepository } from './contexts.js';
import { RuntimeRepository } from './runtime.js';
import { CompanyRepository, CompanyMembershipRepository } from './companies.js';

/**
 * @typedef {Object} RepositorySet
 * @property {TaskRepository} tasks - Task repository
 * @property {RoadmapRepository} roadmaps - Roadmap repository
 * @property {MerkleRepository} merkle - Merkle repository
 * @property {ContextRepository} contexts - Context repository
 * @property {RuntimeRepository} runtime - Runtime persistence repository
 * @property {CompanyRepository} companies - Company repository
 * @property {CompanyMembershipRepository} companyMemberships - Company membership repository
 */

/**
 * Repository factory and manager
 */
export class RepositoryFactory {
  /** @type {ConnectionPool|null} */
  #pool = null;

  /** @type {boolean} */
  #ownsPool = false;
  
  /** @type {Map<string, any>} */
  #repositories = new Map();
  
  /** @type {boolean} */
  #initialized = false;

  /**
   * Create a repository factory
   * @param {Object} options - Factory options
   * @param {string} options.databasePath - Path to SQLite database
   * @param {ConnectionPool} [options.pool] - Existing connection pool
   */
  constructor(options = {}) {
    if (options.pool) {
      this.#pool = options.pool;
      this.#ownsPool = false;
    } else if (options.databasePath) {
      this.#pool = new ConnectionPool({ databasePath: options.databasePath });
      this.#ownsPool = true;
    } else {
      throw new Error('Either databasePath or pool must be provided');
    }
  }

  /**
   * Initialize the factory and connection pool
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#initialized) return;

    if (!this.#pool) {
      throw new Error('RepositoryFactory not properly configured');
    }

    // Initialize the pool only if it has not already been brought up.
    const poolStats = typeof this.#pool.getStats === 'function'
      ? this.#pool.getStats()
      : null;
    const poolNeedsInitialization = poolStats ? poolStats.total === 0 : true;

    if (poolNeedsInitialization && typeof this.#pool.initialize === 'function') {
      await this.#pool.initialize();
    }

    // Create repositories
    this.#repositories.set('tasks', new TaskRepository(this.#pool));
    this.#repositories.set('roadmaps', new RoadmapRepository(this.#pool));
    this.#repositories.set('merkle', new MerkleRepository(this.#pool));
    this.#repositories.set('contexts', new ContextRepository(this.#pool));
    this.#repositories.set('runtime', new RuntimeRepository(this.#pool));
    this.#repositories.set('companies', new CompanyRepository(this.#pool));
    this.#repositories.set('companyMemberships', new CompanyMembershipRepository(this.#pool));

    this.#initialized = true;
  }

  /**
   * Check if factory is initialized
   * @returns {boolean}
   */
  get isInitialized() {
    return this.#initialized;
  }

  /**
   * Get the connection pool
   * @returns {ConnectionPool}
   */
  get pool() {
    return this.#pool;
  }

  /**
   * Get task repository
   * @returns {TaskRepository}
   */
  get tasks() {
    this.#ensureInitialized();
    return this.#repositories.get('tasks');
  }

  /**
   * Get roadmap repository
   * @returns {RoadmapRepository}
   */
  get roadmaps() {
    this.#ensureInitialized();
    return this.#repositories.get('roadmaps');
  }

  /**
   * Get merkle repository
   * @returns {MerkleRepository}
   */
  get merkle() {
    this.#ensureInitialized();
    return this.#repositories.get('merkle');
  }

  /**
   * Get context repository
   * @returns {ContextRepository}
   */
  get contexts() {
    this.#ensureInitialized();
    return this.#repositories.get('contexts');
  }

  /**
   * Get runtime repository
   * @returns {RuntimeRepository}
   */
  get runtime() {
    this.#ensureInitialized();
    return this.#repositories.get('runtime');
  }

  /**
   * Get company repository
   * @returns {CompanyRepository}
   */
  get companies() {
    this.#ensureInitialized();
    return this.#repositories.get('companies');
  }

  /**
   * Get company membership repository
   * @returns {CompanyMembershipRepository}
   */
  get companyMemberships() {
    this.#ensureInitialized();
    return this.#repositories.get('companyMemberships');
  }

  /**
   * Get all repositories
   * @returns {RepositorySet}
   */
  get all() {
    this.#ensureInitialized();
    return {
      tasks: this.#repositories.get('tasks'),
      roadmaps: this.#repositories.get('roadmaps'),
      merkle: this.#repositories.get('merkle'),
      contexts: this.#repositories.get('contexts'),
      runtime: this.#repositories.get('runtime'),
      companies: this.#repositories.get('companies'),
      companyMemberships: this.#repositories.get('companyMemberships')
    };
  }

  /**
   * Get a repository by name
   * @param {string} name - Repository name
   * @returns {any}
   */
  get(name) {
    this.#ensureInitialized();
    const repo = this.#repositories.get(name);
    if (!repo) {
      throw new Error(`Repository '${name}' not found. Available: ${this.available.join(', ')}`);
    }
    return repo;
  }

  /**
   * Get available repository names
   * @returns {string[]}
   */
  get available() {
    return Array.from(this.#repositories.keys());
  }

  /**
   * Execute a transaction across multiple repositories
   * @template T
   * @param {(repos: RepositorySet) => Promise<T>} fn - Transaction function
   * @returns {Promise<T>}
   */
  async transaction(fn) {
    this.#ensureInitialized();
    
    return this.#pool.withTransaction(async () => {
      return fn(this.all);
    });
  }

  /**
   * Close all repositories and connection pool
   * @returns {Promise<void>}
   */
  async close() {
    if (this.#ownsPool && this.#pool && typeof this.#pool.close === 'function') {
      await this.#pool.close();
    }
    this.#repositories.clear();
    this.#initialized = false;
  }

  /**
   * Ensure factory is initialized
   * @private
   */
  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('RepositoryFactory not initialized. Call initialize() first.');
    }
  }
}

/**
 * Singleton instance for global use
 * @type {RepositoryFactory|null}
 */
let globalFactory = null;

/**
 * Initialize the global repository factory
 * @param {Object} options - Factory options
 * @returns {Promise<RepositoryFactory>}
 */
export async function initializeRepositories(options) {
  if (globalFactory) {
    await globalFactory.close();
  }
  
  globalFactory = new RepositoryFactory(options);
  await globalFactory.initialize();
  return globalFactory;
}

/**
 * Get the global repository factory
 * @returns {RepositoryFactory}
 */
export function getRepositories() {
  if (!globalFactory) {
    throw new Error('Repositories not initialized. Call initializeRepositories() first.');
  }
  return globalFactory;
}

/**
 * Check if repositories are initialized
 * @returns {boolean}
 */
export function isInitialized() {
  return globalFactory !== null && globalFactory.isInitialized;
}

/**
 * Close the global repository factory
 * @returns {Promise<void>}
 */
export async function closeRepositories() {
  if (globalFactory) {
    await globalFactory.close();
    globalFactory = null;
  }
}

// Re-export all repositories
export { TaskRepository } from './tasks.js';
export { RoadmapRepository } from './roadmaps.js';
export { MerkleRepository } from './merkle.js';
export { ContextRepository } from './contexts.js';
export { RuntimeRepository } from './runtime.js';
export { CompanyRepository, CompanyMembershipRepository } from './companies.js';
export { BaseRepository } from './base-repository.js';

// Optimized repositories
export { OptimizedBaseRepository } from './base-repository-optimized.js';

// Query cache
export { QueryCache, globalQueryCache, withQueryCache } from '../query-cache.js';

export default RepositoryFactory;
