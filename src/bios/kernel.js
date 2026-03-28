/**
 * @fileoverview BIOS Kernel - Core System Firmware
 * @module bios/kernel
 * @description Central BIOS kernel with 5-phase boot sequence, mode management, and state machine
 * @version 5.0.0
 */

import { EventEmitter } from 'events';
import { SystemState } from './index.js';
import { BootMode, BootPhase } from './modes/boot.js';
import { OperationalMode } from './modes/operational.js';
import { MaintenanceMode } from './modes/maintenance.js';
import { SafeMode } from './modes/safe-mode.js';
import { DiagnoseMode } from './modes/diagnose.js';

/**
 * BIOS Kernel version
 * @constant {string}
 */
export const BIOS_VERSION = '5.0.0';

/**
 * POST Check categories
 * @readonly
 * @enum {Object}
 */
export const POSTChecks = {
  INFRASTRUCTURE: [
    'NODE_VERSION_CHECK',
    'ENVIRONMENT_VARIABLES',
    'MEMORY_AVAILABILITY',
    'FILESYSTEM_ACCESS'
  ],
  AI_CLIENTS: [
    'CLAUDE_AVAILABILITY',
    'KIMI_AVAILABILITY',
    'CODEX_AVAILABILITY',
    'CLIENT_CAPABILITY_CHECK'
  ],
  DEPENDENCIES: [
    'DATABASE_CONNECTIVITY',
    'VECTOR_STORE_READY',
    'GITHUB_API_ACCESS'
  ],
  CONFIGURATION: [
    'CONFIG_SCHEMA_VALID',
    'REQUIRED_FIELDS_PRESENT',
    'SECURITY_SETTINGS_OK'
  ]
};

/**
 * BIOS Core - Central system firmware
 * @class
 * @extends EventEmitter
 * @description Manages the complete BIOS lifecycle, state machine, and boot sequence
 */
export class BIOSCore extends EventEmitter {
  /**
   * Creates a new BIOS Core instance
   * @constructor
   * @param {Object} [options={}] - BIOS configuration options
   */
  constructor(options = {}) {
    super();
    
    /**
     * BIOS version
     * @type {string}
     */
    this.version = BIOS_VERSION;
    
    /**
     * Current system state
     * @type {SystemState}
     * @private
     */
    this._state = SystemState.BOOT;
    
    /**
     * Previous system state (for transitions)
     * @type {SystemState|null}
     * @private
     */
    this._previousState = null;
    
    /**
     * State transition history
     * @type {Array<Object>}
     * @private
     */
    this._transitionHistory = [];
    
    /**
     * Maximum transition history size
     * @type {number}
     * @private
     */
    this._maxTransitionHistory = 50;
    
    /**
     * Registered mode handlers
     * @type {Map<SystemState, Object>}
     * @private
     */
    this._modes = new Map();
    
    /**
     * Registered components
     * @type {Map<string, Object>}
     * @private
     */
    this._components = new Map();
    
    /**
     * BIOS configuration
     * @type {Object}
     * @private
     */
    this._config = {
      mode: process.env.BIOS_MODE || 'OPERATIONAL',
      autoUpdate: process.env.AUTO_UPDATE === 'true',
      regressionThreshold: parseFloat(process.env.REGRESSION_THRESHOLD) || 5.0,
      maxAgents: parseInt(process.env.MAX_AGENTS, 10) || 50,
      logLevel: process.env.LOG_LEVEL || 'info',
      ...options
    };
    
    /**
     * Boot timestamp
     * @type {number|null}
     * @private
     */
    this._bootTime = null;
    
    /**
     * POST results cache
     * @type {Object|null}
     * @private
     */
    this._postResults = null;
    
    /**
     * Boot sequence instance
     * @type {Object|null}
     * @private
     */
    this._bootSequence = null;
    
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
     * State transition lock
     * @type {boolean}
     * @private
     */
    this._transitioning = false;
    
    // Initialize mode handlers
    this._initializeModes();
    
    // Setup event handlers
    this._setupEventHandlers();
  }

  /**
   * Get current system state
   * @returns {SystemState}
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
   * @returns {Map<string, Object>}
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
   * Check if system is in a particular state
   * @param {SystemState} state - State to check
   * @returns {boolean}
   */
  is(state) {
    return this._state === state;
  }

  /**
   * Check if system is operational
   * @returns {boolean}
   */
  isOperational() {
    return this._state === SystemState.OPERATIONAL;
  }

  /**
   * Check if system is in safe mode
   * @returns {boolean}
   */
  isSafeMode() {
    return this._state === SystemState.SAFE_MODE;
  }

  /**
   * Initialize all mode handlers
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
    // Forward mode events
    for (const [state, mode] of this._modes) {
      if (mode && mode.on) {
        mode.on('*', (event, data) => {
          this.emit(`mode:${state}:${event}`, data);
        });
      }
    }
  }

  /**
   * Execute complete BIOS boot sequence (5 phases)
   * @async
   * @param {Object} [options={}] - Boot options
   * @returns {Promise<Object>} Boot result
   */
  async boot(options = {}) {
    if (this._bootTime) {
      throw new Error('System already booted');
    }
    
    this._bootTime = Date.now();
    this.emit('bios:boot:start', { version: this.version, timestamp: this._bootTime });
    
    try {
      // Get boot mode handler
      const bootMode = this._modes.get(SystemState.BOOT);
      
      // Execute boot sequence through boot mode
      const result = await bootMode.enter(options);
      
      if (!result.success) {
        throw new Error(`Boot failed: ${result.errors?.map(e => e.error).join(', ')}`);
      }
      
      // Store POST results
      this._postResults = {
        passed: true,
        timestamp: new Date().toISOString(),
        duration: result.duration
      };
      
      // Transition to operational mode
      await this._enterMode(SystemState.OPERATIONAL, options);
      
      const bootResult = {
        success: true,
        duration: result.duration,
        state: this._state,
        timestamp: new Date().toISOString()
      };
      
      this.emit('bios:boot:complete', bootResult);
      return bootResult;
      
    } catch (error) {
      this._logError('BOOT_FAILED', error);
      this.emit('bios:boot:failed', { error: error.message });
      
      // Attempt safe mode recovery
      await this._enterMode(SystemState.SAFE_MODE, { cause: error });
      
      return {
        success: false,
        error: error.message,
        state: this._state
      };
    }
  }

  /**
   * Execute POST (Power-On Self Test)
   * @async
   * @param {Object} [options={}] - POST options
   * @returns {Promise<Object>} POST results
   */
  async post(options = {}) {
    this.emit('bios:post:start');
    
    const results = {
      timestamp: new Date().toISOString(),
      passed: true,
      checks: {}
    };
    
    const errors = [];
    
    // Infrastructure checks
    results.checks.infrastructure = await this._runPOSTCategory(
      POSTChecks.INFRASTRUCTURE,
      options.failFast
    );
    
    if (results.checks.infrastructure.failed > 0) {
      errors.push(...results.checks.infrastructure.errors);
      if (options.failFast) {
        results.passed = false;
        this.emit('bios:post:failed', results);
        return results;
      }
    }
    
    // Configuration checks
    results.checks.configuration = await this._runPOSTCategory(
      POSTChecks.CONFIGURATION,
      options.failFast
    );
    
    if (results.checks.configuration.failed > 0) {
      errors.push(...results.checks.configuration.errors);
      if (options.failFast) {
        results.passed = false;
        this.emit('bios:post:failed', results);
        return results;
      }
    }
    
    // AI Client checks (optional, warnings only)
    if (!options.skipClients) {
      results.checks.ai_clients = await this._runPOSTCategory(
        POSTChecks.AI_CLIENTS,
        false
      );
    }
    
    // Dependency checks (optional, warnings only)
    if (!options.skipDependencies) {
      results.checks.dependencies = await this._runPOSTCategory(
        POSTChecks.DEPENDENCIES,
        false
      );
    }
    
    // Overall result
    results.passed = errors.length === 0;
    results.errors = errors;
    
    this._postResults = results;
    
    if (results.passed) {
      this.emit('bios:post:passed', results);
    } else {
      this.emit('bios:post:failed', results);
    }
    
    return results;
  }

  /**
   * Run a category of POST checks
   * @private
   * @async
   * @param {Array<string>} checks - Checks to run
   * @param {boolean} failFast - Stop on first failure
   * @returns {Promise<Object>} Category results
   */
  async _runPOSTCategory(checks, failFast) {
    const results = {
      total: checks.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      details: {}
    };
    
    for (const check of checks) {
      try {
        const result = await this._executePOSTCheck(check);
        results.details[check] = result;
        
        if (result.passed) {
          results.passed++;
        } else {
          results.failed++;
          results.errors.push(`${check}: ${result.message}`);
          
          if (failFast) {
            break;
          }
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`${check}: ${error.message}`);
        results.details[check] = { passed: false, error: error.message };
        
        if (failFast) {
          break;
        }
      }
    }
    
    return results;
  }

  /**
   * Execute a single POST check
   * @private
   * @async
   * @param {string} check - Check identifier
   * @returns {Promise<Object>} Check result
   */
  async _executePOSTCheck(check) {
    switch (check) {
      case 'NODE_VERSION_CHECK':
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
        return {
          passed: majorVersion >= 18,
          message: majorVersion >= 18 ? `Node.js ${nodeVersion}` : `Node.js 18+ required, found ${nodeVersion}`,
          details: { version: nodeVersion }
        };
        
      case 'ENVIRONMENT_VARIABLES':
        const required = ['GITHUB_TOKEN'];
        const missing = required.filter(v => !process.env[v]);
        return {
          passed: missing.length === 0,
          message: missing.length === 0 ? 'All required env vars present' : `Missing: ${missing.join(', ')}`,
          details: { missing, present: required.filter(v => process.env[v]) }
        };
        
      case 'MEMORY_AVAILABILITY':
        const memUsage = process.memoryUsage();
        const hasEnoughMemory = memUsage.heapTotal >= 50 * 1024 * 1024;
        return {
          passed: hasEnoughMemory,
          message: hasEnoughMemory 
            ? `Memory OK: ${(memUsage.heapTotal / 1024 / 1024).toFixed(1)}MB` 
            : 'Insufficient memory (< 50MB)',
          details: memUsage
        };
        
      case 'FILESYSTEM_ACCESS':
        try {
          const fs = await import('fs/promises');
          await fs.access('.', fs.constants.R_OK);
          return {
            passed: true,
            message: 'Filesystem access OK',
            details: { read: true, write: true }
          };
        } catch (error) {
          return {
            passed: false,
            message: `Filesystem error: ${error.message}`,
            details: { error: error.message }
          };
        }
        
      case 'CONFIG_SCHEMA_VALID':
        const configValid = this._config && typeof this._config === 'object';
        return {
          passed: configValid,
          message: configValid ? 'Configuration schema valid' : 'Invalid configuration',
          details: { valid: configValid }
        };
        
      case 'REQUIRED_FIELDS_PRESENT':
        const requiredFields = ['mode'];
        const missingFields = requiredFields.filter(f => !this._config[f]);
        return {
          passed: missingFields.length === 0,
          message: missingFields.length === 0 ? 'Required fields present' : `Missing: ${missingFields.join(', ')}`,
          details: { missing: missingFields }
        };
        
      case 'SECURITY_SETTINGS_OK':
        const tokenOk = process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.length >= 20;
        return {
          passed: tokenOk,
          message: tokenOk ? 'Security settings OK' : 'Security warning: token may be invalid',
          details: { tokenConfigured: tokenOk }
        };
        
      case 'CLAUDE_AVAILABILITY':
      case 'KIMI_AVAILABILITY':
      case 'CODEX_AVAILABILITY':
        // These are optional - return warning not failure
        return {
          passed: true,
          message: `${check.split('_')[0]} client check skipped (optional)`,
          details: { optional: true }
        };
        
      case 'DATABASE_CONNECTIVITY':
      case 'VECTOR_STORE_READY':
        return {
          passed: true,
          message: `${check} check skipped (optional)`,
          details: { optional: true }
        };
        
      default:
        return {
          passed: true,
          message: `Unknown check: ${check}`,
          details: { skipped: true }
        };
    }
  }

  /**
   * Transition to a different system mode
   * @async
   * @param {SystemState} targetState - Target state
   * @param {Object} [options={}] - Transition options
   * @returns {Promise<boolean>} Success status
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
      await this._enterMode(targetState, options);
      
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
      
      return true;
      
    } catch (error) {
      this._logError('TRANSITION_FAILED', error);
      this.emit('bios:transition:failed', { 
        from: this._state, 
        to: targetState, 
        error: error.message 
      });
      
      // Attempt recovery to safe mode
      if (targetState !== SystemState.SAFE_MODE) {
        await this._enterMode(SystemState.SAFE_MODE, { cause: error });
      }
      
      throw error;
      
    } finally {
      this._transitioning = false;
    }
  }

  /**
   * Enter a specific mode
   * @private
   * @async
   * @param {SystemState} state - Mode state
   * @param {Object} options - Entry options
   */
  async _enterMode(state, options = {}) {
    const mode = this._modes.get(state);
    
    if (!mode) {
      throw new Error(`Mode handler not found: ${state}`);
    }
    
    // Update state before entering mode (so mode knows current state)
    this._previousState = this._state;
    this._state = state;
    
    // Enter the mode
    if (mode.enter) {
      await mode.enter(options);
    }
    
    this.emit('bios:mode:entered', { state, previous: this._previousState });
  }

  /**
   * Check if a state transition is valid
   * @private
   * @param {SystemState} from - Source state
   * @param {SystemState} to - Target state
   * @returns {boolean}
   */
  _isValidTransition(from, to) {
    // Valid transitions matrix
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
   * @param {string} id - Component identifier
   * @param {Object} component - Component instance
   */
  registerComponent(id, component) {
    if (this._components.has(id)) {
      throw new Error(`Component '${id}' already registered`);
    }
    
    this._components.set(id, component);
    this.emit('bios:component:registered', { id, type: component.type || 'unknown' });
  }

  /**
   * Unregister a system component
   * @param {string} id - Component identifier
   * @returns {boolean}
   */
  unregisterComponent(id) {
    const component = this._components.get(id);
    
    if (!component) {
      return false;
    }
    
    // Shutdown component if possible
    if (component.shutdown) {
      try {
        component.shutdown();
      } catch (error) {
        this._logError('COMPONENT_SHUTDOWN_ERROR', { id, error: error.message });
      }
    }
    
    this._components.delete(id);
    this.emit('bios:component:unregistered', { id });
    
    return true;
  }

  /**
   * Get a registered component
   * @param {string} id - Component identifier
   * @returns {Object|undefined}
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
   * Run system diagnostics
   * @async
   * @param {Object} [options={}] - Diagnostic options
   * @returns {Promise<Object>} Diagnostic results
   */
  async diagnose(options = {}) {
    const diagnoseMode = this._modes.get(SystemState.DIAGNOSE);
    
    if (!diagnoseMode) {
      throw new Error('Diagnostics mode not available');
    }
    
    // If not in diagnose mode, temporarily enter it
    const wasOperational = this._state === SystemState.OPERATIONAL;
    
    if (this._state !== SystemState.DIAGNOSE) {
      await this._enterMode(SystemState.DIAGNOSE, { autoRun: false });
    }
    
    try {
      const results = await diagnoseMode.runDiagnostics(options);
      
      // Return to previous state if was operational
      if (wasOperational && this._state === SystemState.DIAGNOSE) {
        await this._enterMode(SystemState.OPERATIONAL, {});
      }
      
      return results;
      
    } catch (error) {
      // Return to previous state on error
      if (wasOperational && this._state === SystemState.DIAGNOSE) {
        await this._enterMode(SystemState.OPERATIONAL, {});
      }
      throw error;
    }
  }

  /**
   * Graceful system shutdown
   * @async
   * @param {Object} [options={}] - Shutdown options
   * @returns {Promise<void>}
   */
  async shutdown(options = {}) {
    this.emit('bios:shutdown:start', { timestamp: new Date().toISOString() });
    
    if (!options.force) {
      // Shutdown components in reverse registration order
      const components = Array.from(this._components.entries()).reverse();
      
      for (const [id, component] of components) {
        try {
          if (component.shutdown) {
            await component.shutdown();
          }
        } catch (error) {
          this._logError('SHUTDOWN_ERROR', { id, error: error.message });
        }
      }
    }
    
    // Clear all components
    this._components.clear();
    
    // Reset state
    this._state = SystemState.BOOT;
    this._bootTime = null;
    
    this.emit('bios:shutdown:complete', { timestamp: new Date().toISOString() });
  }

  /**
   * Get comprehensive system status
   * @returns {Object} System status
   */
  getStatus() {
    return {
      version: this.version,
      state: this._state,
      previousState: this._previousState,
      uptime: this.uptime,
      bootTime: this._bootTime ? new Date(this._bootTime).toISOString() : null,
      components: this.getAllComponents(),
      postResults: this._postResults,
      config: {
        mode: this._config.mode,
        autoUpdate: this._config.autoUpdate,
        maxAgents: this._config.maxAgents,
        logLevel: this._config.logLevel
      },
      capabilities: this.getModeCapabilities(),
      transitioning: this._transitioning
    };
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
    this.emit('bios:config:updated', { updates });
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
    this._postResults = null;
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

export default BIOSCore;
