/**
 * @fileoverview Domain Registry - Central registry for all CogniMesh domains
 * @module domains
 */

import { ArchitectureAnalyzer } from './architecture/index.js';
import { ContextSnapshotManager } from './context/index.js';
import { GSDDomain } from './gsd/index.js';

/**
 * Domain registry entry
 * @typedef {Object} DomainEntry
 * @property {string} name - Domain name
 * @property {string} version - Domain version
 * @property {string} description - Domain description
 * @property {Function} factory - Domain class/constructor
 * @property {Object} [instance] - Singleton instance
 * @property {string[]} [dependencies] - Required dependencies
 */

/**
 * Domain registry configuration
 * @typedef {Object} RegistryConfig
 * @property {boolean} [useSingletons=true] - Use singleton instances
 * @property {Object} [domainOptions] - Options for each domain
 */

/**
 * Central registry for CogniMesh domains
 * Manages domain lifecycle, dependencies, and access
 */
export class DomainRegistry {
  /**
   * @param {RegistryConfig} config - Registry configuration
   */
  constructor(config = {}) {
    this.config = {
      useSingletons: true,
      domainOptions: {},
      ...config
    };

    /** @type {Map<string, DomainEntry>} */
    this.domains = new Map();
    /** @type {Map<string, Object>} */
    this.instances = new Map();

    this.#registerDefaultDomains();
  }

  /**
   * Registers the default CogniMesh domains
   * @private
   */
  #registerDefaultDomains() {
    // Architecture Domain
    this.register('architecture', {
      name: 'Architecture Domain',
      version: '1.0.0',
      description: 'Project architecture analysis and pattern detection',
      factory: ArchitectureAnalyzer,
      dependencies: []
    });

    // Context Domain
    this.register('context', {
      name: 'Context Domain',
      version: '1.0.0',
      description: 'Project context snapshot management',
      factory: ContextSnapshotManager,
      dependencies: []
    });

    // GSD Domain
    this.register('gsd', {
      name: 'GSD Domain',
      version: '1.0.0',
      description: 'Workflow execution and task management',
      factory: GSDDomain,
      dependencies: []
    });
  }

  /**
   * Registers a new domain
   * @param {string} id - Domain identifier
   * @param {DomainEntry} entry - Domain entry
   * @returns {DomainRegistry} This instance for chaining
   */
  register(id, entry) {
    if (this.domains.has(id)) {
      throw new Error(`Domain "${id}" is already registered`);
    }

    if (!entry.factory) {
      throw new Error(`Domain "${id}" must have a factory`);
    }

    this.domains.set(id, {
      name: entry.name || id,
      version: entry.version || '1.0.0',
      description: entry.description || '',
      factory: entry.factory,
      dependencies: entry.dependencies || [],
      instance: null
    });

    return this;
  }

  /**
   * Unregisters a domain
   * @param {string} id - Domain identifier
   * @returns {boolean} True if domain was removed
   */
  unregister(id) {
    const domain = this.domains.get(id);
    if (!domain) {
      return false;
    }

    // Check if other domains depend on this
    for (const [otherId, otherDomain] of this.domains) {
      if (otherDomain.dependencies.includes(id)) {
        throw new Error(`Cannot unregister "${id}": "${otherId}" depends on it`);
      }
    }

    this.instances.delete(id);
    return this.domains.delete(id);
  }

  /**
   * Gets a domain instance
   * @param {string} id - Domain identifier
   * @param {Object} [options] - Instance options (if creating new)
   * @returns {Object} Domain instance
   * @throws {Error} If domain not found
   */
  get(id, options = {}) {
    const domain = this.domains.get(id);
    if (!domain) {
      throw new Error(`Domain "${id}" not found`);
    }

    // Return existing singleton if available
    if (this.config.useSingletons && this.instances.has(id)) {
      return this.instances.get(id);
    }

    // Resolve dependencies
    const dependencies = {};
    for (const depId of domain.dependencies) {
      dependencies[depId] = this.get(depId);
    }

    // Create instance
    const instanceOptions = {
      ...this.config.domainOptions[id],
      ...options,
      dependencies
    };

    const instance = new domain.factory(instanceOptions);

    // Store singleton if configured
    if (this.config.useSingletons) {
      this.instances.set(id, instance);
    }

    return instance;
  }

  /**
   * Checks if a domain is registered
   * @param {string} id - Domain identifier
   * @returns {boolean} True if domain exists
   */
  has(id) {
    return this.domains.has(id);
  }

  /**
   * Gets domain information without creating instance
   * @param {string} id - Domain identifier
   * @returns {Object|undefined} Domain info
   */
  info(id) {
    const domain = this.domains.get(id);
    if (!domain) {
      return undefined;
    }

    return {
      id,
      name: domain.name,
      version: domain.version,
      description: domain.description,
      dependencies: domain.dependencies,
      instantiated: this.instances.has(id)
    };
  }

  /**
   * Lists all registered domains
   * @param {Object} [filters] - Filter options
   * @param {boolean} [filters.instantiatedOnly=false] - Only show instantiated domains
   * @returns {Array<Object>} Domain info list
   */
  list(filters = {}) {
    const domains = [];

    for (const [id, domain] of this.domains) {
      if (filters.instantiatedOnly && !this.instances.has(id)) {
        continue;
      }

      domains.push({
        id,
        name: domain.name,
        version: domain.version,
        description: domain.description,
        dependencies: domain.dependencies,
        instantiated: this.instances.has(id)
      });
    }

    return domains;
  }

  /**
   * Initializes all domains with dependencies
   * @returns {Promise<void>}
   */
  async initialize() {
    const initialized = new Set();

    const init = async (id) => {
      if (initialized.has(id)) {
        return;
      }

      const domain = this.domains.get(id);
      if (!domain) {
        throw new Error(`Domain "${id}" not found`);
      }

      // Initialize dependencies first
      for (const depId of domain.dependencies) {
        await init(depId);
      }

      // Get instance (this creates it if using singletons)
      const instance = this.get(id);

      // Call initialize if available
      if (typeof instance.initialize === 'function') {
        await instance.initialize();
      }

      initialized.add(id);
    };

    // Initialize in dependency order
    for (const id of this.domains.keys()) {
      await init(id);
    }
  }

  /**
   * Disposes all domain instances
   * @returns {Promise<void>}
   */
  async dispose() {
    for (const [id, instance] of this.instances) {
      if (typeof instance.dispose === 'function') {
        try {
          await instance.dispose();
        } catch (error) {
          console.error(`Error disposing domain "${id}":`, error);
        }
      }
    }

    this.instances.clear();
  }

  /**
   * Gets the Architecture Domain instance
   * @param {Object} [options] - Instance options
   * @returns {ArchitectureAnalyzer} Architecture analyzer instance
   */
  architecture(options = {}) {
    return this.get('architecture', options);
  }

  /**
   * Gets the Context Domain instance
   * @param {Object} [options] - Instance options
   * @returns {ContextSnapshotManager} Context manager instance
   */
  context(options = {}) {
    return this.get('context', options);
  }

  /**
   * Gets the GSD Domain instance
   * @param {Object} [options] - Instance options
   * @returns {GSDDomain} GSD domain instance
   */
  gsd(options = {}) {
    return this.get('gsd', options);
  }

  /**
   * Creates a fluent workflow builder
   * @returns {WorkflowBuilder} Workflow builder
   */
  workflow() {
    return new WorkflowBuilder(this.gsd());
  }
}

/**
 * Fluent workflow builder
 */
export class WorkflowBuilder {
  /**
   * @param {GSDDomain} gsd - GSD domain instance
   */
  constructor(gsd) {
    this.gsd = gsd;
    this.type = 'custom';
    this.tasks = [];
    this.options = {};
  }

  /**
   * Sets workflow type
   * @param {string} type - Workflow type
   * @returns {WorkflowBuilder} This builder
   */
  ofType(type) {
    this.type = type;
    return this;
  }

  /**
   * Adds a task to the workflow
   * @param {string} type - Task type
   * @param {Object} params - Task parameters
   * @param {Object} [options] - Task options
   * @returns {WorkflowBuilder} This builder
   */
  task(type, params = {}, options = {}) {
    const taskId = options.id || `task-${this.tasks.length}`;
    
    this.tasks.push({
      id: taskId,
      type,
      params,
      dependsOn: options.after || null,
      maxRetries: options.retries
    });

    return this;
  }

  /**
   * Adds multiple tasks in sequence
   * @param {Array<{type: string, params: Object}>} tasks - Tasks to add
   * @returns {WorkflowBuilder} This builder
   */
  sequence(tasks) {
    let lastTaskId = null;

    for (const { type, params = {} } of tasks) {
      const taskId = `task-${this.tasks.length}`;
      
      this.tasks.push({
        id: taskId,
        type,
        params,
        dependsOn: lastTaskId
      });

      lastTaskId = taskId;
    }

    return this;
  }

  /**
   * Adds tasks to run in parallel
   * @param {Array<{type: string, params: Object}>} tasks - Tasks to add
   * @returns {WorkflowBuilder} This builder
   */
  parallel(tasks) {
    for (const { type, params = {} } of tasks) {
      this.tasks.push({
        id: `task-${this.tasks.length}`,
        type,
        params,
        dependsOn: null
      });
    }

    return this;
  }

  /**
   * Sets workflow metadata
   * @param {Object} metadata - Workflow metadata
   * @returns {WorkflowBuilder} This builder
   */
  withMetadata(metadata) {
    this.options.metadata = metadata;
    return this;
  }

  /**
   * Sets execution timeout
   * @param {number} timeout - Timeout in milliseconds
   * @returns {WorkflowBuilder} This builder
   */
  withTimeout(timeout) {
    this.options.timeout = timeout;
    return this;
  }

  /**
   * Sets initial context
   * @param {Object} context - Initial context
   * @returns {WorkflowBuilder} This builder
   */
  withContext(context) {
    this.options.context = context;
    return this;
  }

  /**
   * Builds the workflow
   * @returns {Object} Created workflow
   */
  build() {
    return this.gsd.createWorkflow(this.type, this.tasks, this.options);
  }

  /**
   * Builds and executes the workflow
   * @returns {Promise<Object>} Executed workflow
   */
  async execute() {
    const workflow = this.build();
    return this.gsd.executeWorkflow(workflow.id, this.options);
  }
}

// Export singleton registry
export const domainRegistry = new DomainRegistry();

// Re-export domain classes
export { ArchitectureAnalyzer } from './architecture/index.js';
export { ContextSnapshotManager } from './context/index.js';
export { GSDDomain, GSDTools, WorkflowValidator } from './gsd/index.js';

// Default export
export default DomainRegistry;
