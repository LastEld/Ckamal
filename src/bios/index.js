/**
 * @fileoverview CogniMesh v5.0 BIOS - Basic Input/Output System
 * @module bios/index
 * @description Core BIOS firmware for multi-agent orchestration
 * @version 5.0.0
 */

import { EventEmitter } from 'events';
import { SystemMonitor } from './system-monitor.js';
import { BootMode } from './modes/boot.js';
import { OperationalMode } from './modes/operational.js';
import { MaintenanceMode } from './modes/maintenance.js';
import { SafeMode } from './modes/safe-mode.js';
import { DiagnoseMode } from './modes/diagnose.js';
import { RoutineScheduler } from '../domains/routines/routine-scheduler.js';

/**
 * System state enumeration
 * @readonly
 * @enum {string}
 */
export const SystemState = {
  BOOT: 'BOOT',
  DIAGNOSE: 'DIAGNOSE',
  OPERATIONAL: 'OPERATIONAL',
  MAINTENANCE: 'MAINTENANCE',
  SAFE_MODE: 'SAFE_MODE'
};

/**
 * BIOS component interface
 * @typedef {Object} BIOSComponent
 * @property {string} id - Unique component identifier
 * @property {string} type - Component type classification
 * @property {Function} initialize - Async initialization function
 * @property {Function} healthCheck - Health verification function
 * @property {Function} shutdown - Graceful shutdown function
 */

/**
 * CogniMesh BIOS - Core system firmware
 * @class
 * @extends EventEmitter
 * @description Manages system lifecycle, state transitions, and component orchestration
 */
export class CogniMeshBIOS extends EventEmitter {
  /**
   * BIOS firmware version
   * @static
   * @type {string}
   */
  static VERSION = '5.0.0';

  /**
   * Creates a new CogniMesh BIOS instance
   * @constructor
   */
  constructor() {
    super();
    
    /**
     * Current system state
     * @type {SystemState}
     * @private
     */
    this._state = SystemState.BOOT;
    
    /**
     * Previous system state
     * @type {SystemState|null}
     * @private
     */
    this._previousState = null;
    
    /**
     * BIOS firmware version
     * @type {string}
     */
    this.version = CogniMeshBIOS.VERSION;
    
    /**
     * Registered system components
     * @type {Map<string, BIOSComponent>}
     * @private
     */
    this._components = new Map();
    
    /**
     * Active operator/agent reference
     * @type {Object|null}
     * @private
     */
    this._operator = null;
    
    /**
     * System health monitor
     * @type {SystemMonitor}
     * @private
     */
    this._monitor = new SystemMonitor();
    
    /**
     * Mode handlers mapping
     * @type {Map<SystemState, Object>}
     * @private
     */
    this._modes = new Map();
    
    /**
     * Boot timestamp
     * @type {number}
     * @private
     */
    this._bootTime = null;
    
    /**
     * Configuration store
     * @type {Object}
     * @private
     */
    this._config = {};

    /**
     * State transition lock
     * @type {boolean}
     * @private
     */
    this._transitioning = false;

    /**
     * Transition history
     * @type {Array<Object>}
     * @private
     */
    this._transitionHistory = [];

    /**
     * Maximum transition history
     * @type {number}
     * @private
     */
    this._maxTransitionHistory = 50;

    /**
     * Error log
     * @type {Array<Object>}
     * @private
     */
    this._errorLog = [];

    /**
     * Maximum error log size
     * @type {number}
     * @private
     */
    this._maxErrorLogSize = 100;

    /**
     * Routine scheduler instance
     * @type {RoutineScheduler|null}
     * @private
     */
    this._routineScheduler = null;

    /**
     * Database instance
     * @type {import('better-sqlite3').Database|null}
     * @private
     */
    this._db = null;

    this._initializeModes();
    this._setupEventHandlers();
  }

  /**
   * Get current system state
   * @returns {SystemState} Current BIOS state
   */
  get state() {
    return this._state;
  }

  /**
   * Get previous system state
   * @returns {SystemState|null}
   */
  get previousState() {
    return this._previousState;
  }

  /**
   * Get registered components
   * @returns {Map<string, BIOSComponent>} Component registry
   */
  get components() {
    return new Map(this._components);
  }

  /**
   * Get BIOS configuration
   * @returns {Object}
   */
  get config() {
    return { ...this._config };
  }

  /**
   * Get boot timestamp
   * @returns {number|null}
   */
  get bootTime() {
    return this._bootTime;
  }

  /**
   * Get system uptime in milliseconds
   * @returns {number}
   */
  get uptime() {
    return this._bootTime ? Date.now() - this._bootTime : 0;
  }

  /**
   * Get active operator
   * @returns {Object|null} Current operator reference
   */
  get operator() {
    return this._operator;
  }

  /**
   * Check if in a specific state
   * @param {SystemState} state - State to check
   * @returns {boolean}
   */
  is(state) {
    return this._state === state;
  }

  /**
   * Initialize mode handlers
   * @private
   */
  _initializeModes() {
    this._modes.set(SystemState.BOOT, new BootMode(this));
    this._modes.set(SystemState.OPERATIONAL, new OperationalMode(this));
    this._modes.set(SystemState.MAINTENANCE, new MaintenanceMode(this));
    this._modes.set(SystemState.SAFE_MODE, new SafeMode(this));
    this._modes.set(SystemState.DIAGNOSE, new DiagnoseMode(this));
  }

  /**
   * Setup internal event handlers
   * @private
   */
  _setupEventHandlers() {
    this._monitor.on('alert', (alert) => {
      this.emit('system:alert', alert);
    });
    
    this._monitor.on('critical', (error) => {
      this.emit('system:critical', error);
      this._transitionToSafeMode(error);
    });

    // Forward mode events
    for (const [state, mode] of this._modes) {
      if (mode && mode.on) {
        mode.on('error', (error) => {
          this.emit('mode:error', { state, error });
        });
      }
    }
  }

  /**
   * Execute complete BIOS boot sequence
   * @async
   * @param {Object} [options={}] - Boot configuration options
   * @param {string} [options.configPath] - Path to configuration file
   * @param {boolean} [options.skipDiagnostics=false] - Skip diagnostic checks
   * @returns {Promise<boolean>} Boot success status
   * @emits bios:boot:start
   * @emits bios:boot:complete
   * @emits bios:boot:error
   */
  async boot(options = {}) {
    try {
      this._bootTime = Date.now();
      this.emit('bios:boot:start', { version: this.version, timestamp: this._bootTime });
      
      // Phase 1: Load configuration
      await this._loadConfiguration(options.configPath);
      
      // Phase 2: Initialize core subsystems
      await this._initializeSubsystems();
      
      // Phase 3: Run diagnostics (unless skipped)
      if (!options.skipDiagnostics) {
        const diagResults = await this.diagnose();
        if (!diagResults.healthy) {
          throw new Error(`Diagnostics failed: ${diagResults.errors?.join(', ') || 'Unknown error'}`);
        }
      }
      
      // Phase 4: Enter operational mode
      await this._enterOperationalMode();
      
      this.emit('bios:boot:complete', {
        duration: Date.now() - this._bootTime,
        state: this._state,
        components: Array.from(this._components.keys())
      });
      
      return true;
    } catch (error) {
      this.emit('bios:boot:error', error);
      await this._handleBootFailure(error);
      return false;
    }
  }

  /**
   * Load BIOS configuration
   * @private
   * @async
   * @param {string} [configPath] - Configuration file path
   */
  async _loadConfiguration(_configPath) {
    // Load from environment variables and optional config file
    this._config = {
      githubToken: process.env.GITHUB_TOKEN,
      mode: process.env.BIOS_MODE || SystemState.OPERATIONAL,
      autoUpdate: process.env.AUTO_UPDATE === 'true',
      regressionThreshold: parseFloat(process.env.REGRESSION_THRESHOLD) || 5.0,
      statePath: process.env.STATE_PATH || './state',
      maxAgents: parseInt(process.env.MAX_AGENTS, 10) || 50,
      logLevel: process.env.LOG_LEVEL || 'info'
    };
    
    this.emit('bios:config:loaded', this._sanitizeConfig(this._config));
  }

  /**
   * Sanitize configuration for logging
   * @private
   * @param {Object} config - Configuration
   * @returns {Object} Sanitized configuration
   */
  _sanitizeConfig(config) {
    const sanitized = { ...config };
    if (sanitized.githubToken) {
      sanitized.githubToken = '***';
    }
    return sanitized;
  }

  /**
   * Initialize BIOS subsystems
   * @private
   * @async
   */
  async _initializeSubsystems() {
    // Initialize system monitor
    await this._monitor.initialize();
    this._registerComponent('monitor', this._monitor);
    
    // Additional subsystems initialized here
    this.emit('bios:subsystems:initialized');
  }

  /**
   * Enter operational mode after successful boot
   * @private
   * @async
   */
  async _enterOperationalMode() {
    const mode = this._modes.get(SystemState.OPERATIONAL);
    if (mode) {
      await mode.enter();
      
      // Initialize and start routine scheduler
      await this._initializeRoutineScheduler();
      
      this._previousState = this._state;
      this._state = SystemState.OPERATIONAL;
      this.emit('bios:state:changed', { 
        from: this._previousState, 
        to: SystemState.OPERATIONAL 
      });
    }
  }

  /**
   * Initialize the routine scheduler
   * @private
   * @async
   */
  async _initializeRoutineScheduler() {
    try {
      // Get database instance (assuming it's registered as a component or passed via config)
      const db = this._getDatabase();
      
      if (!db) {
        this._logger?.warn('[BIOS] No database available, routine scheduler disabled');
        return;
      }

      this._routineScheduler = new RoutineScheduler({
        db,
        logger: this._logger,
        heartbeatService: this._monitor,
        config: {
          pollIntervalMs: 30000,
          lockTimeoutMs: 300000,
          maxConcurrentRuns: 10,
          instanceId: `bios-${process.env.HOSTNAME || 'local'}-${Date.now()}`
        }
      });

      // Forward scheduler events
      this._routineScheduler.on('started', () => {
        this.emit('bios:scheduler:started');
      });

      this._routineScheduler.on('stopped', () => {
        this.emit('bios:scheduler:stopped');
      });

      this._routineScheduler.on('run:started', (data) => {
        this.emit('bios:routine:started', data);
      });

      this._routineScheduler.on('run:completed', (data) => {
        this.emit('bios:routine:completed', data);
      });

      this._routineScheduler.on('run:failed', (data) => {
        this.emit('bios:routine:failed', data);
      });

      // Start the scheduler
      await this._routineScheduler.start();
      
      // Register as component
      this.registerComponent('routine-scheduler', {
        type: 'scheduler',
        scheduler: this._routineScheduler,
        healthCheck: () => ({
          healthy: this._routineScheduler.isRunning,
          ...this._routineScheduler.getStatus()
        }),
        shutdown: async () => {
          if (this._routineScheduler) {
            await this._routineScheduler.stop();
          }
        }
      });

      this._logger?.info('[BIOS] Routine scheduler initialized');
    } catch (error) {
      this._logger?.error('[BIOS] Failed to initialize routine scheduler:', error);
      // Don't fail boot - scheduler is not critical
    }
  }

  /**
   * Register plugin system as BIOS component
   * @param {Object} pluginSystem - Plugin system instance
   * @param {import('../plugins/plugin-registry.js').PluginRegistry} pluginSystem.registry - Plugin registry
   * @param {import('../plugins/plugin-loader.js').PluginLoader} pluginSystem.loader - Plugin loader
   */
  registerPluginSystem(pluginSystem) {
    if (!pluginSystem || !pluginSystem.registry) {
      throw new Error('Invalid plugin system provided');
    }

    this.registerComponent('pluginSystem', {
      type: 'plugin_system',
      registry: pluginSystem.registry,
      loader: pluginSystem.loader,
      initialize: async () => pluginSystem.registry.isInitialized,
      healthCheck: async () => this._checkPluginHealth(pluginSystem),
      shutdown: async () => {
        if (pluginSystem.loader) {
          await pluginSystem.loader.dispose();
        }
        if (pluginSystem.registry) {
          await pluginSystem.registry.dispose();
        }
      }
    });

    // Listen to plugin registry events and forward to BIOS
    pluginSystem.registry.on('activated', ({ pluginId }) => {
      this.emit('plugin:activated', { pluginId, timestamp: Date.now() });
    });

    pluginSystem.registry.on('failed', ({ pluginId, error }) => {
      this.emit('plugin:failed', { pluginId, error, timestamp: Date.now() });
    });

    pluginSystem.registry.on('workerError', ({ pluginId, error }) => {
      this.emit('plugin:worker:error', { pluginId, error, timestamp: Date.now() });
    });

    pluginSystem.registry.on('configChanged', ({ pluginId, config }) => {
      this.emit('plugin:config:changed', { pluginId, config, timestamp: Date.now() });
    });

    this.emit('bios:plugin:registered', {
      pluginCount: pluginSystem.registry.plugins.size
    });
  }

  /**
   * Check plugin system health
   * @private
   */
  async _checkPluginHealth(pluginSystem) {
    const registry = pluginSystem.registry;
    const plugins = registry.getAllPlugins();
    
    const health = {
      healthy: true,
      message: `Plugin system healthy with ${plugins.length} plugins`,
      plugins: {
        total: plugins.length,
        active: 0,
        failed: 0,
        installed: 0
      },
      workers: {
        running: 0
      }
    };

    for (const plugin of plugins) {
      if (plugin.status === 'active') health.plugins.active++;
      else if (plugin.status === 'failed') health.plugins.failed++;
      else health.plugins.installed++;
    }

    // Count running workers
    if (pluginSystem.loader && pluginSystem.loader.workers) {
      health.workers.running = pluginSystem.loader.workers.size;
    }

    // Mark unhealthy if any plugins failed
    if (health.plugins.failed > 0) {
      health.healthy = health.plugins.failed < health.plugins.total / 2; // Degraded if < 50% failed
      health.message = `${health.plugins.failed} plugins in failed state`;
    }

    return health;
  }

  /**
   * Get plugin system status
   * @returns {Object|null}
   */
  getPluginSystemStatus() {
    const pluginSystem = this.getComponent('pluginSystem');
    if (!pluginSystem || !pluginSystem.registry) {
      return null;
    }

    const registry = pluginSystem.registry;
    const plugins = registry.getAllPlugins();

    return {
      initialized: registry.isInitialized,
      totalPlugins: plugins.length,
      byStatus: plugins.reduce((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {}),
      plugins: plugins.map(p => ({
        id: p.id,
        name: p.name,
        version: p.version,
        status: p.status,
        capabilities: p.capabilities
      }))
    };
  }

  /**
   * Trigger plugin lifecycle action
   * @param {string} action - Action to perform (enable, disable, restart)
   * @param {string} pluginId - Plugin ID
   */
  async triggerPluginAction(action, pluginId) {
    const pluginSystem = this.getComponent('pluginSystem');
    if (!pluginSystem || !pluginSystem.registry) {
      throw new Error('Plugin system not registered');
    }

    const registry = pluginSystem.registry;
    const plugin = registry.getPlugin(pluginId);
    
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    this.emit('plugin:action:start', { action, pluginId });

    try {
      switch (action) {
        case 'enable':
        case 'start':
          await registry.startPlugin(pluginId);
          break;
        case 'disable':
        case 'stop':
          await registry.stopPlugin(pluginId);
          break;
        case 'restart':
          await registry.stopPlugin(pluginId);
          await registry.startPlugin(pluginId);
          break;
        default:
          throw new Error(`Unknown plugin action: ${action}`);
      }

      this.emit('plugin:action:complete', { action, pluginId, success: true });
    } catch (error) {
      this.emit('plugin:action:error', { action, pluginId, error: error.message });
      throw error;
    }
  }

  /**
   * Get database instance
   * @private
   * @returns {import('better-sqlite3').Database|null}
   */
  _getDatabase() {
    // First check if database is registered as a component
    const dbComponent = this.getComponent('database');
    if (dbComponent?.db) {
      return dbComponent.db;
    }
    
    // Check for global db reference (set during boot)
    return this._db;
  }

  /**
   * Set database instance
   * @param {import('better-sqlite3').Database} db - Database instance
   */
  setDatabase(db) {
    this._db = db;
  }

  /**
   * Get the routine scheduler
   * @returns {RoutineScheduler|null}
   */
  getRoutineScheduler() {
    return this._routineScheduler;
  }

  /**
   * Handle boot sequence failure
   * @private
   * @async
   * @param {Error} error - Boot failure error
   */
  async _handleBootFailure(error) {
    console.error('BIOS BOOT FAILURE:', error.message);
    this._logError('BOOT_FAILED', error);
    await this._transitionToSafeMode(error);
  }

  /**
   * Transition to safe mode on critical errors
   * @private
   * @async
   * @param {Error} error - Critical error that triggered safe mode
   */
  async _transitionToSafeMode(error) {
    try {
      const safeMode = this._modes.get(SystemState.SAFE_MODE);
      if (safeMode) {
        this._previousState = this._state;
        await safeMode.enter({ cause: error });
        this._state = SystemState.SAFE_MODE;
        this.emit('bios:state:changed', { 
          from: this._previousState, 
          to: SystemState.SAFE_MODE,
          cause: error.message
        });
      }
    } catch (safeModeError) {
      console.error('CRITICAL: Failed to enter safe mode:', safeModeError);
      process.exit(1);
    }
  }

  /**
   * Run comprehensive system diagnostics
   * @async
   * @param {Object} [options={}] - Diagnostic options
   * @returns {Promise<Object>} Diagnostic results
   * @returns {boolean} results.healthy - Overall system health
   * @returns {string[]} results.errors - List of diagnostic errors
   * @returns {Object} results.components - Per-component health status
   * @emits bios:diagnose:start
   * @emits bios:diagnose:complete
   */
  async diagnose(options = {}) {
    const diagnoseMode = this._modes.get(SystemState.DIAGNOSE);
    
    if (diagnoseMode) {
      return diagnoseMode.runDiagnostics(options);
    }
    
    // Fallback basic diagnostics
    this.emit('bios:diagnose:start');
    
    const results = {
      healthy: true,
      errors: [],
      components: {},
      timestamp: new Date().toISOString()
    };
    
    // Check each registered component
    for (const [id, component] of this._components) {
      try {
        if (component.healthCheck) {
          const health = await component.healthCheck();
          results.components[id] = health;
          if (!health.healthy) {
            results.healthy = false;
            results.errors.push(`${id}: ${health.message || 'Unhealthy'}`);
          }
        }
      } catch (error) {
        results.healthy = false;
        results.components[id] = { healthy: false, error: error.message };
        results.errors.push(`${id}: ${error.message}`);
      }
    }
    
    // System-level checks
    if (!process.env.GITHUB_TOKEN) {
      results.healthy = false;
      results.errors.push('GITHUB_TOKEN not configured');
    }
    
    this.emit('bios:diagnose:complete', results);
    return results;
  }

  /**
   * Get comprehensive system status
   * @returns {Object} Complete system status
   * @returns {string} status.version - BIOS version
   * @returns {SystemState} status.state - Current state
   * @returns {number} status.uptime - System uptime in ms
   * @returns {string[]} status.components - List of registered components
   * @returns {Object} status.health - Health monitor status
   * @returns {Object} status.config - Current configuration (sanitized)
   */
  getStatus() {
    return {
      version: this.version,
      state: this._state,
      previousState: this._previousState,
      uptime: this.uptime,
      bootTime: this._bootTime ? new Date(this._bootTime).toISOString() : null,
      components: Array.from(this._components.keys()),
      health: this._monitor ? this._monitor.getStatus() : null,
      config: this._sanitizeConfig(this._config),
      capabilities: this.getModeCapabilities()
    };
  }

  /**
   * Get mode capabilities for current state
   * @returns {Object} Mode capabilities
   */
  getModeCapabilities() {
    const capabilities = {
      [SystemState.BOOT]: {
        allowedOperations: ['diagnostics', 'config_load', 'init'],
        agentExecution: false,
        taskQueue: false,
        autoRecovery: false,
        logging: 'console'
      },
      [SystemState.DIAGNOSE]: {
        allowedOperations: ['full_diagnostics', 'health_reports', 'component_tests'],
        agentExecution: false,
        taskQueue: false,
        autoRecovery: false,
        logging: 'verbose'
      },
      [SystemState.OPERATIONAL]: {
        allowedOperations: ['all'],
        agentExecution: true,
        taskQueue: true,
        autoRecovery: true,
        logging: 'normal'
      },
      [SystemState.MAINTENANCE]: {
        allowedOperations: ['updates', 'backups', 'repairs', 'read_only'],
        agentExecution: 'limited',
        taskQueue: 'paused',
        autoRecovery: true,
        logging: 'verbose'
      },
      [SystemState.SAFE_MODE]: {
        allowedOperations: ['diagnostics', 'logging', 'status', 'shutdown', 'recovery'],
        agentExecution: false,
        taskQueue: false,
        autoRecovery: 'attempt_recovery',
        logging: 'emergency'
      }
    };
    
    return capabilities[this._state] || capabilities[SystemState.SAFE_MODE];
  }

  /**
   * Register a system component
   * @param {string} id - Unique component identifier
   * @param {BIOSComponent} component - Component instance
   * @throws {Error} If component ID already exists
   */
  registerComponent(id, component) {
    if (this._components.has(id)) {
      throw new Error(`Component '${id}' already registered`);
    }
    this._components.set(id, component);
    this.emit('bios:component:registered', { id, type: component.type });
  }

  /**
   * @alias registerComponent
   * @private
   */
  _registerComponent(id, component) {
    this.registerComponent(id, component);
  }

  /**
   * Unregister a system component
   * @param {string} id - Component identifier to remove
   * @returns {boolean} True if component was removed
   */
  unregisterComponent(id) {
    const removed = this._components.delete(id);
    if (removed) {
      this.emit('bios:component:unregistered', { id });
    }
    return removed;
  }

  /**
   * Get a registered component
   * @param {string} id - Component identifier
   * @returns {BIOSComponent|undefined} Component instance or undefined
   */
  getComponent(id) {
    return this._components.get(id);
  }

  /**
   * Get all registered components
   * @returns {Array<Object>}
   */
  getAllComponents() {
    return Array.from(this._components.entries()).map(([id, component]) => ({
      id,
      type: component.type || 'unknown',
      hasHealthCheck: typeof component.healthCheck === 'function',
      hasShutdown: typeof component.shutdown === 'function'
    }));
  }

  /**
   * Transition to a different system mode
   * @async
   * @param {SystemState} targetState - State to transition to
   * @param {Object} [options={}] - Transition options
   * @returns {Promise<boolean>} Transition success
   * @throws {Error} If transition is invalid
   */
  async transitionTo(targetState, options = {}) {
    // Validate target state
    if (!Object.values(SystemState).includes(targetState)) {
      throw new Error(`Invalid system state: ${targetState}`);
    }
    
    // Check if already in target state
    if (this._state === targetState) {
      return true;
    }
    
    // Check for transition in progress
    if (this._transitioning) {
      throw new Error('State transition already in progress');
    }
    
    // Validate transition
    if (!this._isValidTransition(this._state, targetState)) {
      throw new Error(`Invalid state transition: ${this._state} -> ${targetState}`);
    }
    
    this._transitioning = true;
    const transitionStart = Date.now();
    
    this.emit('bios:transition:start', {
      from: this._state,
      to: targetState
    });
    
    try {
      // Exit current mode
      const currentMode = this._modes.get(this._state);
      if (currentMode && currentMode.exit) {
        await currentMode.exit(options);
      }
      
      // Enter new mode
      const newMode = this._modes.get(targetState);
      if (newMode && newMode.enter) {
        await newMode.enter(options);
      }
      
      this._previousState = this._state;
      this._state = targetState;
      
      // Record transition
      const transition = {
        from: this._previousState,
        to: targetState,
        timestamp: Date.now(),
        duration: Date.now() - transitionStart
      };
      
      this._transitionHistory.unshift(transition);
      
      if (this._transitionHistory.length > this._maxTransitionHistory) {
        this._transitionHistory.pop();
      }
      
      this.emit('bios:transition:complete', transition);
      this.emit('bios:state:changed', transition);
      
      return true;
      
    } catch (error) {
      this._logError('TRANSITION_FAILED', error);
      this.emit('bios:transition:error', { 
        from: this._state, 
        to: targetState, 
        error: error.message 
      });
      
      // Attempt recovery to safe mode
      if (targetState !== SystemState.SAFE_MODE) {
        await this._transitionToSafeMode(error);
      }
      
      throw error;
      
    } finally {
      this._transitioning = false;
    }
  }

  /**
   * Check if a state transition is valid
   * @private
   * @param {SystemState} from - Source state
   * @param {SystemState} to - Target state
   * @returns {boolean}
   */
  _isValidTransition(from, to) {
    const validTransitions = {
      [SystemState.BOOT]: [SystemState.DIAGNOSE, SystemState.OPERATIONAL, SystemState.SAFE_MODE],
      [SystemState.DIAGNOSE]: [SystemState.OPERATIONAL, SystemState.SAFE_MODE, SystemState.BOOT],
      [SystemState.OPERATIONAL]: [SystemState.MAINTENANCE, SystemState.SAFE_MODE, SystemState.DIAGNOSE],
      [SystemState.MAINTENANCE]: [SystemState.OPERATIONAL, SystemState.SAFE_MODE, SystemState.BOOT],
      [SystemState.SAFE_MODE]: [SystemState.BOOT, SystemState.DIAGNOSE]
    };
    
    const valid = validTransitions[from] || [];
    return valid.includes(to);
  }

  /**
   * Get transition history
   * @param {Object} [options={}] - Query options
   * @returns {Array<Object>} Transition history
   */
  getTransitionHistory(options = {}) {
    const limit = options.limit || 10;
    return this._transitionHistory.slice(0, limit);
  }

  /**
   * Get current mode handler
   * @returns {Object|null}
   */
  getCurrentMode() {
    return this._modes.get(this._state);
  }

  /**
   * Get mode handler by state
   * @param {SystemState} state - Mode state
   * @returns {Object|null}
   */
  getMode(state) {
    return this._modes.get(state);
  }

  /**
   * Graceful system shutdown
   * @async
   * @param {Object} [options={}] - Shutdown options
   * @param {boolean} [options.force=false] - Force immediate shutdown
   * @returns {Promise<void>}
   * @emits bios:shutdown:start
   * @emits bios:shutdown:complete
   */
  async shutdown(options = {}) {
    this.emit('bios:shutdown:start');

    const currentMode = this.getCurrentMode();
    if (currentMode?.exit) {
      try {
        await currentMode.exit(options);
      } catch (error) {
        console.error('Error exiting current BIOS mode:', error);
        this._logError('MODE_EXIT_ERROR', error);
      }
    }
    
    if (!options.force) {
      // Graceful component shutdown
      for (const [id, component] of this._components) {
        try {
          if (component.shutdown) {
            await component.shutdown();
          }
        } catch (error) {
          console.error(`Error shutting down component ${id}:`, error);
          this._logError('SHUTDOWN_ERROR', { id, error: error.message });
        }
      }
    }
    
    this._monitor.dispose && this._monitor.dispose();
    this._previousState = this._state;
    this._state = SystemState.BOOT;
    
    this.emit('bios:shutdown:complete');
  }

  /**
   * Log an error
   * @private
   * @param {string} type - Error type
   * @param {Error|Object} error - Error object or data
   */
  _logError(type, error) {
    const entry = {
      timestamp: Date.now(),
      type,
      message: error instanceof Error ? error.message : JSON.stringify(error),
      stack: error instanceof Error ? error.stack : undefined
    };
    
    this._errorLog.push(entry);
    
    if (this._errorLog.length > this._maxErrorLogSize) {
      this._errorLog.shift();
    }
  }

  /**
   * Get error log
   * @param {Object} [options={}] - Query options
   * @returns {Array<Object>} Error log
   */
  getErrorLog(options = {}) {
    const limit = options.limit || 20;
    return this._errorLog.slice(-limit);
  }

  /**
   * Update configuration
   * @param {Object} updates - Configuration updates
   */
  updateConfig(updates) {
    Object.assign(this._config, updates);
    this.emit('bios:config:updated', { updates: this._sanitizeConfig(updates) });
  }

  /**
   * Reset BIOS to initial state
   * @async
   * @param {Object} [options={}] - Reset options
   */
  async reset(options = {}) {
    this.emit('bios:reset:start');
    
    // Shutdown if not already
    if (this._state !== SystemState.BOOT) {
      await this.shutdown(options);
    }
    
    // Clear state
    this._state = SystemState.BOOT;
    this._previousState = null;
    this._bootTime = null;
    this._errorLog = [];
    this._transitionHistory = [];
    
    // Reset configuration to defaults
    this._config = {
      mode: process.env.BIOS_MODE || 'OPERATIONAL',
      autoUpdate: process.env.AUTO_UPDATE === 'true',
      regressionThreshold: parseFloat(process.env.REGRESSION_THRESHOLD) || 5.0,
      maxAgents: parseInt(process.env.MAX_AGENTS, 10) || 50,
      logLevel: process.env.LOG_LEVEL || 'info'
    };
    
    // Re-initialize modes
    this._initializeModes();
    
    this.emit('bios:reset:complete');
  }
}

export default CogniMeshBIOS;
