/**
 * @fileoverview Ckamal Plugin Registry Service
 * Manages plugin lifecycle, registration, and discovery.
 * 
 * @module plugins/plugin-registry
 * @see plugin-sdk-design.md
 */

import { EventEmitter } from 'events';
import { validateManifest, hashManifest, PLUGIN_STATUSES } from './plugin-sdk.js';

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} PluginRecord
 * @property {string} id - Plugin ID
 * @property {string} version - Plugin version
 * @property {string} name - Human-readable name
 * @property {string} description - Plugin description
 * @property {string} author - Plugin author
 * @property {string} [license] - License
 * @property {string} status - Current status
 * @property {string} manifestPath - Path to manifest file
 * @property {string} [workerPath] - Path to worker entry point
 * @property {string} [uiPath] - Path to UI bundle
 * @property {string[]} capabilities - Granted capabilities
 * @property {Object} [config] - Active configuration
 * @property {string} [configSchema] - JSON schema for config
 * @property {string} [errorMessage] - Last error message
 * @property {Date} installedAt - Installation timestamp
 * @property {Date} [activatedAt] - Activation timestamp
 * @property {Date} [lastErrorAt] - Last error timestamp
 * @property {number} [restartCount] - Number of restarts
 * @property {string} manifestHash - Hash of manifest for integrity
 */

/**
 * @typedef {Object} PluginRegistryOptions
 * @property {import('../db/index.js').Database} db - Database instance
 * @property {Object} [logger] - Logger instance
 * @property {Object} [eventBus] - Event bus for publishing events
 * @property {string} [pluginDir] - Directory for plugin storage
 * @property {number} [healthCheckInterval] - Health check interval in ms
 * @property {number} [maxRestarts] - Max restarts before marking failed
 */

// ============================================================================
// Plugin Registry
// ============================================================================

export class PluginRegistry extends EventEmitter {
  /**
   * Create a plugin registry
   * @param {PluginRegistryOptions} options - Registry options
   */
  constructor(options) {
    super();
    
    this.db = options.db;
    this.logger = options.logger || console;
    this.eventBus = options.eventBus;
    this.pluginDir = options.pluginDir || './plugins';
    this.healthCheckInterval = options.healthCheckInterval || 30000;
    this.maxRestarts = options.maxRestarts || 5;
    
    /** @type {Map<string, PluginRecord>} */
    this.plugins = new Map();
    
    /** @type {Map<string, import('./plugin-loader.js').PluginWorker>} */
    this.workers = new Map();
    
    this.healthCheckTimer = null;
    this.isInitialized = false;
  }
  
  /**
   * Initialize the registry
   * Loads registered plugins from database
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    
    this.logger.info('Initializing plugin registry...');
    
    // Load all registered plugins from database
    const rows = this.db.prepare(`
      SELECT * FROM plugins WHERE status != ?
    `).all(PLUGIN_STATUSES.TERMINATED);
    
    for (const row of rows) {
      const plugin = this._rowToRecord(row);
      this.plugins.set(plugin.id, plugin);
      
      // Auto-start plugins that should be active
      if (plugin.status === PLUGIN_STATUSES.ACTIVE) {
        this._scheduleActivation(plugin.id);
      }
    }
    
    // Start health check loop
    this._startHealthChecks();
    
    this.isInitialized = true;
    this.emit('initialized', { count: this.plugins.size });
    this.logger.info(`Plugin registry initialized with ${this.plugins.size} plugins`);
  }
  
  /**
   * Register a new plugin
   * @param {Object} params - Registration parameters
   * @param {string} params.manifestPath - Path to manifest file
   * @param {Object} params.manifest - Parsed manifest
   * @param {string} [params.source] - Source (npm, local, git)
   * @returns {Promise<PluginRecord>}
   */
  async registerPlugin(params) {
    const { manifestPath, manifest, source = 'local' } = params;
    
    // Validate manifest
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
    }
    
    // Check for existing plugin
    const existing = this.getPlugin(manifest.id);
    if (existing) {
      throw new Error(`Plugin ${manifest.id} is already registered`);
    }
    
    // Create plugin record
    const now = new Date();
    const record = {
      id: manifest.id,
      version: manifest.version,
      name: manifest.name,
      description: manifest.description,
      author: manifest.author || 'Unknown',
      license: manifest.license,
      status: PLUGIN_STATUSES.REGISTERED,
      manifestPath,
      workerPath: manifest.entrypoints?.worker,
      uiPath: manifest.entrypoints?.ui,
      capabilities: manifest.capabilities || [],
      configSchema: manifest.configSchema ? JSON.stringify(manifest.configSchema) : null,
      manifestHash: hashManifest(manifest),
      source,
      installedAt: now,
      restartCount: 0
    };
    
    // Persist to database
    this._persistRecord(record);
    
    // Add to memory
    this.plugins.set(record.id, record);
    
    this.emit('registered', { pluginId: record.id });
    this.logger.info(`Plugin registered: ${record.id}@${record.version}`);
    
    return record;
  }
  
  /**
   * Unregister a plugin
   * @param {string} pluginId - Plugin ID
   * @param {Object} [options] - Options
   * @param {boolean} [options.purgeData=false] - Whether to purge plugin data
   */
  async unregisterPlugin(pluginId, options = {}) {
    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    // Stop worker if running
    if (this.workers.has(pluginId)) {
      await this.stopPlugin(pluginId);
    }
    
    // Update status
    plugin.status = PLUGIN_STATUSES.TERMINATED;
    this._updateRecord(pluginId, { status: PLUGIN_STATUSES.TERMINATED });
    
    // Remove from memory
    this.plugins.delete(pluginId);
    
    // Optionally purge data
    if (options.purgeData) {
      this._purgePluginData(pluginId);
    }
    
    this.emit('unregistered', { pluginId });
    this.logger.info(`Plugin unregistered: ${pluginId}`);
  }
  
  /**
   * Start/activate a plugin
   * @param {string} pluginId - Plugin ID
   * @param {Object} [config] - Configuration to apply
   * @returns {Promise<PluginRecord>}
   */
  async startPlugin(pluginId, config) {
    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    // Check if already active
    if (plugin.status === PLUGIN_STATUSES.ACTIVE) {
      return plugin;
    }
    
    // Validate status transition
    const validTransitions = [
      PLUGIN_STATUSES.REGISTERED,
      PLUGIN_STATUSES.FAILED,
      PLUGIN_STATUSES.TERMINATED
    ];
    
    if (!validTransitions.includes(plugin.status)) {
      throw new Error(`Cannot start plugin from status: ${plugin.status}`);
    }
    
    // Update status
    plugin.status = PLUGIN_STATUSES.LOADING;
    this._updateRecord(pluginId, { status: PLUGIN_STATUSES.LOADING });
    this.emit('starting', { pluginId });
    
    try {
      // Apply configuration
      if (config) {
        await this.updatePluginConfig(pluginId, config);
      }
      
      // Spawn worker (via loader)
      this.emit('workerSpawning', { pluginId });
      
      // Worker spawn is handled by plugin-loader
      // This method expects the loader to call back
      
      plugin.status = PLUGIN_STATUSES.INITIALIZING;
      plugin.activatedAt = new Date();
      this._updateRecord(pluginId, { 
        status: PLUGIN_STATUSES.INITIALIZING,
        activatedAt: plugin.activatedAt.toISOString()
      });
      
      return plugin;
      
    } catch (error) {
      plugin.status = PLUGIN_STATUSES.FAILED;
      plugin.errorMessage = error.message;
      plugin.lastErrorAt = new Date();
      this._updateRecord(pluginId, {
        status: PLUGIN_STATUSES.FAILED,
        errorMessage: error.message,
        lastErrorAt: plugin.lastErrorAt.toISOString()
      });
      
      this.emit('failed', { pluginId, error: error.message });
      throw error;
    }
  }
  
  /**
   * Stop a plugin
   * @param {string} pluginId - Plugin ID
   * @param {Object} [options] - Options
   * @param {boolean} [options.graceful=true] - Whether to attempt graceful shutdown
   * @param {number} [options.timeout=10000] - Shutdown timeout in ms
   */
  async stopPlugin(pluginId, options = {}) {
    const { graceful = true, timeout = 10000 } = options;
    
    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    // Validate status transition - can only stop from ACTIVE, LOADING, or INITIALIZING states
    const stoppableStatuses = [PLUGIN_STATUSES.ACTIVE, PLUGIN_STATUSES.LOADING, PLUGIN_STATUSES.INITIALIZING];
    if (!stoppableStatuses.includes(plugin.status)) {
      this.logger.debug(`Plugin ${pluginId} cannot be stopped from status: ${plugin.status}`);
      return;
    }
    
    // Prevent concurrent stop operations
    if (plugin.status === PLUGIN_STATUSES.UNLOADING) {
      this.logger.debug(`Plugin ${pluginId} is already unloading`);
      return;
    }
    
    plugin.status = PLUGIN_STATUSES.UNLOADING;
    this._updateRecord(pluginId, { status: PLUGIN_STATUSES.UNLOADING });
    this.emit('stopping', { pluginId });
    
    // Terminate worker
    const worker = this.workers.get(pluginId);
    if (worker) {
      if (graceful) {
        try {
          await Promise.race([
            worker.shutdown(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Shutdown timeout')), timeout)
            )
          ]);
        } catch (error) {
          this.logger.warn(`Graceful shutdown failed for ${pluginId}, forcing termination`);
          await worker.terminate();
        }
      } else {
        await worker.terminate();
      }
      
      this.workers.delete(pluginId);
    }
    
    plugin.status = PLUGIN_STATUSES.TERMINATED;
    this._updateRecord(pluginId, { status: PLUGIN_STATUSES.TERMINATED });
    
    this.emit('stopped', { pluginId });
    this.logger.info(`Plugin stopped: ${pluginId}`);
  }
  
  /**
   * Update plugin configuration
   * @param {string} pluginId - Plugin ID
   * @param {Object} config - New configuration
   * @param {Object} [options] - Options
   * @param {boolean} [options.validate=true] - Whether to validate against schema
   */
  async updatePluginConfig(pluginId, config, options = {}) {
    const { validate = true } = options;
    
    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    // Validate against schema if available
    if (validate && plugin.configSchema) {
      const schema = JSON.parse(plugin.configSchema);
      const validation = this._validateAgainstSchema(config, schema);
      if (!validation.valid) {
        throw new Error(`Config validation failed: ${validation.errors.join(', ')}`);
      }
    }
    
    // Store config
    const configJson = JSON.stringify(config);
    plugin.config = config;
    
    this.db.prepare(`
      INSERT INTO plugin_configs (plugin_id, config, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(plugin_id) DO UPDATE SET
        config = excluded.config,
        updated_at = excluded.updated_at
    `).run(pluginId, configJson, new Date().toISOString());
    
    // Notify worker if active
    if (plugin.status === PLUGIN_STATUSES.ACTIVE) {
      const worker = this.workers.get(pluginId);
      if (worker) {
        await worker.configChanged(config);
      }
    }
    
    this.emit('configChanged', { pluginId, config });
    this.logger.info(`Plugin config updated: ${pluginId}`);
  }
  
  /**
   * Get plugin configuration
   * @param {string} pluginId - Plugin ID
   * @returns {Object|null}
   */
  getPluginConfig(pluginId) {
    const row = this.db.prepare(`
      SELECT config FROM plugin_configs WHERE plugin_id = ?
    `).get(pluginId);
    
    return row ? JSON.parse(row.config) : null;
  }
  
  /**
   * Get a plugin by ID
   * @param {string} pluginId - Plugin ID
   * @returns {PluginRecord|undefined}
   */
  getPlugin(pluginId) {
    return this.plugins.get(pluginId);
  }
  
  /**
   * Get all plugins
   * @param {Object} [filter] - Filter options
   * @param {string} [filter.status] - Filter by status
   * @returns {PluginRecord[]}
   */
  getAllPlugins(filter = {}) {
    let plugins = Array.from(this.plugins.values());
    
    if (filter.status) {
      plugins = plugins.filter(p => p.status === filter.status);
    }
    
    return plugins;
  }
  
  /**
   * Check if a plugin has a capability
   * @param {string} pluginId - Plugin ID
   * @param {string} capability - Capability to check
   * @returns {boolean}
   */
  hasCapability(pluginId, capability) {
    const plugin = this.getPlugin(pluginId);
    return plugin ? plugin.capabilities.includes(capability) : false;
  }
  
  /**
   * Register a worker instance for an active plugin
   * @param {string} pluginId - Plugin ID
   * @param {import('./plugin-loader.js').PluginWorker} worker - Worker instance
   */
  registerWorker(pluginId, worker) {
    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    // Validate worker is not already registered
    if (this.workers.has(pluginId)) {
      this.logger.warn(`Worker already registered for ${pluginId}, replacing existing worker`);
      const existingWorker = this.workers.get(pluginId);
      existingWorker.removeAllListeners();
    }
    
    this.workers.set(pluginId, worker);
    
    // Mark as active
    plugin.status = PLUGIN_STATUSES.ACTIVE;
    plugin.errorMessage = null;
    plugin.restartCount = 0;
    this._updateRecord(pluginId, { 
      status: PLUGIN_STATUSES.ACTIVE,
      errorMessage: null,
      restartCount: 0
    });
    
    this.emit('activated', { pluginId });
    this.logger.info(`Plugin activated: ${pluginId}`);
    
    // Listen for worker events
    worker.on('error', (error) => this._handleWorkerError(pluginId, error));
    worker.on('exit', (code) => this._handleWorkerExit(pluginId, code));
  }
  
  /**
   * Get worker for a plugin
   * @param {string} pluginId - Plugin ID
   * @returns {import('./plugin-loader.js').PluginWorker|undefined}
   */
  getWorker(pluginId) {
    return this.workers.get(pluginId);
  }
  
  /**
   * Dispatch an event to plugins
   * @param {import('./plugin-sdk.js').PluginEvent} event - Event to dispatch
   */
  async dispatchEvent(event) {
    // Validate event structure
    if (!event || typeof event !== 'object') {
      this.logger.warn('Invalid event structure, skipping dispatch');
      return;
    }
    
    if (!event.eventType) {
      this.logger.warn('Event missing eventType, skipping dispatch');
      return;
    }
    
    for (const [pluginId, worker] of this.workers) {
      const plugin = this.getPlugin(pluginId);
      if (!plugin || plugin.status !== PLUGIN_STATUSES.ACTIVE) {
        continue;
      }
      
      // Check if plugin subscribes to this event type
      const eventTypes = plugin.subscribedEvents || [];
      if (this._matchesEventPattern(event.eventType, eventTypes)) {
        try {
          // Add delivery metadata
          const enrichedEvent = {
            ...event,
            _delivery: {
              dispatchedAt: new Date().toISOString(),
              toPluginId: pluginId
            }
          };
          await worker.sendEvent(enrichedEvent);
        } catch (error) {
          this.logger.error(`Failed to send event to ${pluginId}`, { 
            error: error.message,
            eventType: event.eventType 
          });
        }
      }
    }
  }
  
  /**
   * Dispose the registry
   */
  async dispose() {
    this.logger.info('Disposing plugin registry...');
    
    // Stop all plugins
    const activePlugins = this.getAllPlugins({ status: PLUGIN_STATUSES.ACTIVE });
    await Promise.all(activePlugins.map(p => this.stopPlugin(p.id).catch(() => {})));
    
    // Stop health checks
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    this.isInitialized = false;
    this.emit('disposed');
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  /**
   * Convert database row to PluginRecord
   * @private
   */
  _rowToRecord(row) {
    return {
      id: row.id,
      version: row.version,
      name: row.name,
      description: row.description,
      author: row.author,
      license: row.license,
      status: row.status,
      manifestPath: row.manifest_path,
      workerPath: row.worker_path,
      uiPath: row.ui_path,
      capabilities: JSON.parse(row.capabilities || '[]'),
      configSchema: row.config_schema,
      errorMessage: row.error_message,
      installedAt: new Date(row.installed_at),
      activatedAt: row.activated_at ? new Date(row.activated_at) : null,
      lastErrorAt: row.last_error_at ? new Date(row.last_error_at) : null,
      restartCount: row.restart_count || 0,
      manifestHash: row.manifest_hash,
      source: row.source,
      subscribedEvents: row.subscribed_events ? JSON.parse(row.subscribed_events) : []
    };
  }
  
  /**
   * Persist plugin record to database
   * @private
   */
  _persistRecord(record) {
    this.db.prepare(`
      INSERT INTO plugins (
        id, version, name, description, author, license, status,
        manifest_path, worker_path, ui_path, capabilities, config_schema,
        manifest_hash, source, installed_at, restart_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.version,
      record.name,
      record.description,
      record.author,
      record.license,
      record.status,
      record.manifestPath,
      record.workerPath,
      record.uiPath,
      JSON.stringify(record.capabilities),
      record.configSchema,
      record.manifestHash,
      record.source,
      record.installedAt.toISOString(),
      record.restartCount
    );
  }
  
  /**
   * Update plugin record in database
   * @private
   */
  _updateRecord(pluginId, updates) {
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
      fields.push(`${dbKey} = ?`);
      values.push(value);
    }
    
    values.push(pluginId);
    
    this.db.prepare(`
      UPDATE plugins SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }
  
  /**
   * Purge all data for a plugin
   * @private
   */
  _purgePluginData(pluginId) {
    // Delete plugin states
    this.db.prepare('DELETE FROM plugin_states WHERE plugin_id = ?').run(pluginId);
    // Delete plugin configs
    this.db.prepare('DELETE FROM plugin_configs WHERE plugin_id = ?').run(pluginId);
    // Delete plugin logs
    this.db.prepare('DELETE FROM plugin_logs WHERE plugin_id = ?').run(pluginId);
    // Delete plugin events
    this.db.prepare('DELETE FROM plugin_events WHERE plugin_id = ?').run(pluginId);
  }
  
  /**
   * Validate config against schema
   * @private
   */
  _validateAgainstSchema(config, schema) {
    // Basic JSON schema validation
    // In production, use a proper JSON schema validator like Ajv
    const errors = [];
    
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in config)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  /**
   * Schedule plugin activation
   * @private
   */
  _scheduleActivation(pluginId) {
    // Defer activation to next tick to allow initialization to complete
    setImmediate(() => {
      this.startPlugin(pluginId).catch(error => {
        this.logger.error(`Failed to auto-start plugin ${pluginId}`, { error: error.message });
      });
    });
  }
  
  /**
   * Start health check loop
   * @private
   */
  _startHealthChecks() {
    this.healthCheckTimer = setInterval(() => {
      this._runHealthChecks();
    }, this.healthCheckInterval);
  }
  
  /**
   * Run health checks on all active plugins
   * @private
   */
  async _runHealthChecks() {
    for (const [pluginId, worker] of this.workers) {
      try {
        const health = await worker.healthCheck();
        
        if (health.status !== 'ok') {
          this.logger.warn(`Plugin ${pluginId} health check: ${health.status}`, { 
            message: health.message 
          });
          
          if (health.status === 'error') {
            await this._handleWorkerError(pluginId, new Error(health.message));
          }
        }
      } catch (error) {
        this.logger.error(`Health check failed for ${pluginId}`, { error: error.message });
        await this._handleWorkerError(pluginId, error);
      }
    }
  }
  
  /**
   * Handle worker error
   * @private
   */
  async _handleWorkerError(pluginId, error) {
    const plugin = this.getPlugin(pluginId);
    if (!plugin) return;
    
    plugin.errorMessage = error.message;
    plugin.lastErrorAt = new Date();
    plugin.restartCount++;
    
    this._updateRecord(pluginId, {
      errorMessage: error.message,
      lastErrorAt: plugin.lastErrorAt.toISOString(),
      restartCount: plugin.restartCount
    });
    
    this.emit('workerError', { pluginId, error: error.message });
    
    // Restart if under max restarts
    if (plugin.restartCount < this.maxRestarts) {
      this.logger.warn(`Restarting plugin ${pluginId} (attempt ${plugin.restartCount})`);
      await this.stopPlugin(pluginId, { graceful: false });
      await this.startPlugin(pluginId);
    } else {
      this.logger.error(`Plugin ${pluginId} exceeded max restarts, marking as failed`);
      plugin.status = PLUGIN_STATUSES.FAILED;
      this._updateRecord(pluginId, { status: PLUGIN_STATUSES.FAILED });
      this.emit('failed', { pluginId, error: 'Max restarts exceeded' });
    }
  }
  
  /**
   * Handle worker exit
   * @private
   */
  async _handleWorkerExit(pluginId, code) {
    const plugin = this.getPlugin(pluginId);
    if (!plugin) return;
    
    // Clean up worker reference
    this.workers.delete(pluginId);
    
    // Handle different exit scenarios
    if (code !== 0 && plugin.status === PLUGIN_STATUSES.ACTIVE) {
      this.logger.error(`Plugin ${pluginId} worker exited unexpectedly with code ${code}`);
      await this._handleWorkerError(pluginId, new Error(`Worker exited with code ${code}`));
    } else if (code !== 0 && plugin.status === PLUGIN_STATUSES.UNLOADING) {
      // Non-zero exit during unloading is acceptable (force kill)
      this.logger.debug(`Plugin ${pluginId} worker exited with code ${code} during unloading`);
    } else if (plugin.status === PLUGIN_STATUSES.ACTIVE) {
      // Clean exit while active is unexpected
      this.logger.warn(`Plugin ${pluginId} worker exited cleanly while active`);
      await this._handleWorkerError(pluginId, new Error('Worker exited unexpectedly'));
    }
  }
  
  /**
   * Check if event type matches any of the patterns
   * @private
   */
  _matchesEventPattern(eventType, patterns) {
    for (const pattern of patterns) {
      if (pattern === eventType) return true;
      if (pattern === '*') return true;
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -1);
        if (eventType.startsWith(prefix)) return true;
      }
    }
    return false;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a plugin registry
 * @param {PluginRegistryOptions} options - Registry options
 * @returns {PluginRegistry}
 */
export function createPluginRegistry(options) {
  return new PluginRegistry(options);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  PluginRegistry,
  createPluginRegistry,
  PLUGIN_STATUSES
};
