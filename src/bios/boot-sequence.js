/**
 * @fileoverview BIOS Boot Sequence - 6-Phase Initialization
 * @module bios/boot-sequence
 * @description Complete boot sequence implementation with 6 phases
 * @version 5.0.0
 */

import { EventEmitter } from 'events';

/**
 * Boot sequence phases
 * @readonly
 * @enum {string}
 */
export const BootSequencePhase = {
  POWER_ON: 'POWER_ON',
  POST: 'POST',
  CONFIG_LOAD: 'CONFIG_LOAD',
  SUBSYSTEM_INIT: 'SUBSYSTEM_INIT',
  DIAGNOSTICS: 'DIAGNOSTICS',
  HANDOFF: 'HANDOFF'
};

/**
 * Boot sequence configuration defaults
 * @constant {Object}
 */
export const BootDefaults = {
  minNodeVersion: 18,
  minMemoryMB: 50,
  configFile: '.env',
  maxBootTime: 60000,
  failFast: true,
  skipDiagnostics: false,
  skipClients: false
};

/**
 * Boot Sequence - 6-phase system initialization
 * @class
 * @extends EventEmitter
 * @description Manages the complete boot sequence from power-on to operational
 */
export class BootSequence extends EventEmitter {
  /**
   * Creates a new BootSequence
   * @constructor
   * @param {BIOSCore} bios - BIOS core instance
   * @param {Object} [options={}] - Boot options
   */
  constructor(bios, options = {}) {
    super();
    
    /**
     * BIOS core reference
     * @type {BIOSCore}
     * @private
     */
    this._bios = bios;
    
    /**
     * Boot options
     * @type {Object}
     * @private
     */
    this._options = { ...BootDefaults, ...options };
    
    /**
     * Current phase
     * @type {BootSequencePhase|null}
     * @private
     */
    this._currentPhase = null;
    
    /**
     * Phase execution history
     * @type {Array<Object>}
     * @private
     */
    this._phaseHistory = [];
    
    /**
     * Boot start timestamp
     * @type {number|null}
     * @private
     */
    this._startTime = null;
    
    /**
     * Phase handlers
     * @type {Map<BootSequencePhase, Function>}
     * @private
     */
    this._phaseHandlers = new Map();
    
    /**
     * Subsystem initialization order
     * @type {Array<Object>}
     * @private
     */
    this._subsystemOrder = [];
    
    /**
     * Boot cancelled flag
     * @type {boolean}
     * @private
     */
    this._cancelled = false;
    
    this._initializePhaseHandlers();
    this._initializeSubsystemOrder();
  }

  /**
   * Get current phase
   * @returns {BootSequencePhase|null}
   */
  get currentPhase() {
    return this._currentPhase;
  }

  /**
   * Get boot duration
   * @returns {number}
   */
  get duration() {
    return this._startTime ? Date.now() - this._startTime : 0;
  }

  /**
   * Check if boot is in progress
   * @returns {boolean}
   */
  get isRunning() {
    return this._currentPhase !== null && !this._isComplete();
  }

  /**
   * Check if boot was cancelled
   * @returns {boolean}
   */
  get isCancelled() {
    return this._cancelled;
  }

  /**
   * Initialize phase handlers
   * @private
   */
  _initializePhaseHandlers() {
    this._phaseHandlers.set(BootSequencePhase.POWER_ON, this._phasePowerOn.bind(this));
    this._phaseHandlers.set(BootSequencePhase.POST, this._phasePOST.bind(this));
    this._phaseHandlers.set(BootSequencePhase.CONFIG_LOAD, this._phaseConfigLoad.bind(this));
    this._phaseHandlers.set(BootSequencePhase.SUBSYSTEM_INIT, this._phaseSubsystemInit.bind(this));
    this._phaseHandlers.set(BootSequencePhase.DIAGNOSTICS, this._phaseDiagnostics.bind(this));
    this._phaseHandlers.set(BootSequencePhase.HANDOFF, this._phaseHandoff.bind(this));
  }

  /**
   * Initialize subsystem order
   * @private
   */
  _initializeSubsystemOrder() {
    this._subsystemOrder = [
      { id: 'event-system', name: 'Event System', critical: true, init: () => this._initEventSystem() },
      { id: 'system-monitor', name: 'System Monitor', critical: true, init: () => this._initSystemMonitor() },
      { id: 'logger', name: 'Logger', critical: true, init: () => this._initLogger() },
      { id: 'config-store', name: 'Configuration Store', critical: true, init: () => this._initConfigStore() },
      { id: 'cv-registry', name: 'CV Registry', critical: false, init: () => this._initCVRegistry() },
      { id: 'client-gateway', name: 'Client Gateway', critical: false, init: () => this._initClientGateway() },
      { id: 'spawn-manager', name: 'Spawn Manager', critical: false, init: () => this._initSpawnManager() },
      { id: 'orchestrator', name: 'Orchestrator', critical: false, init: () => this._initOrchestrator() }
    ];
  }

  /**
   * Execute complete boot sequence
   * @async
   * @returns {Promise<Object>} Boot result
   */
  async execute() {
    if (this._startTime) {
      throw new Error('Boot sequence already executed');
    }
    
    this._startTime = Date.now();
    this.emit('boot:start', { timestamp: this._startTime });
    
    const phases = Object.values(BootSequencePhase);
    const results = {
      success: true,
      phases: {},
      errors: [],
      duration: 0
    };
    
    try {
      for (const phase of phases) {
        if (this._cancelled) {
          throw new Error('Boot sequence cancelled');
        }
        
        if (this.duration > this._options.maxBootTime) {
          throw new Error(`Boot timeout exceeded (${this._options.maxBootTime}ms)`);
        }
        
        const phaseResult = await this._executePhase(phase);
        results.phases[phase] = phaseResult;
        
        if (!phaseResult.success) {
          results.success = false;
          results.errors.push({
            phase,
            error: phaseResult.error
          });
          
          if (this._options.failFast) {
            break;
          }
        }
      }
      
      results.duration = this.duration;
      
      if (results.success) {
        this.emit('boot:complete', results);
      } else {
        this.emit('boot:failed', results);
      }
      
      return results;
      
    } catch (error) {
      results.success = false;
      results.error = error.message;
      results.duration = this.duration;
      
      this.emit('boot:error', { error: error.message, phase: this._currentPhase });
      
      return results;
    }
  }

  /**
   * Execute a single phase
   * @private
   * @async
   * @param {BootSequencePhase} phase - Phase to execute
   * @returns {Promise<Object>} Phase result
   */
  async _executePhase(phase) {
    const phaseStart = Date.now();
    this._currentPhase = phase;
    
    this.emit('phase:start', { phase, timestamp: phaseStart });
    
    const handler = this._phaseHandlers.get(phase);
    
    if (!handler) {
      const error = new Error(`No handler for phase: ${phase}`);
      this.emit('phase:error', { phase, error });
      return { success: false, error: error.message, duration: 0 };
    }
    
    try {
      const result = await handler();
      const duration = Date.now() - phaseStart;
      
      const phaseResult = {
        success: true,
        duration,
        ...result
      };
      
      this._phaseHistory.push({
        phase,
        ...phaseResult,
        timestamp: Date.now()
      });
      
      this.emit('phase:complete', { phase, result: phaseResult });
      
      return phaseResult;
      
    } catch (error) {
      const duration = Date.now() - phaseStart;
      
      const phaseResult = {
        success: false,
        error: error.message,
        duration
      };
      
      this._phaseHistory.push({
        phase,
        ...phaseResult,
        timestamp: Date.now()
      });
      
      this.emit('phase:error', { phase, error: error.message });
      
      return phaseResult;
    }
  }

  /**
   * Phase 1: POWER_ON - System initialization
   * @private
   * @returns {Promise<Object>} Phase result
   */
  async _phasePowerOn() {
    this.emit('poweron:start');
    
    const bootRecord = {
      version: this._bios.version,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      platform: process.platform,
      arch: process.arch
    };
    
    this._bios.emit('bios:boot:poweron', bootRecord);
    
    this.emit('poweron:complete', bootRecord);
    
    return {
      bootRecord,
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Phase 2: POST - Power-On Self Test
   * @private
   * @returns {Promise<Object>} Phase result
   */
  async _phasePOST() {
    this.emit('post:start');
    
    const checks = {
      infrastructure: [],
      configuration: []
    };
    
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    const nodeCheck = {
      name: 'NODE_VERSION',
      passed: majorVersion >= this._options.minNodeVersion,
      message: `Node.js ${nodeVersion}`,
      details: { required: `>=${this._options.minNodeVersion}`, current: nodeVersion }
    };
    checks.infrastructure.push(nodeCheck);
    
    const requiredVars = ['GITHUB_TOKEN'];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    const envCheck = {
      name: 'ENVIRONMENT_VARIABLES',
      passed: missingVars.length === 0,
      message: missingVars.length === 0 
        ? 'All required env vars present' 
        : `Missing: ${missingVars.join(', ')}`,
      details: { required: requiredVars, missing: missingVars }
    };
    checks.infrastructure.push(envCheck);
    
    const memUsage = process.memoryUsage();
    const memoryMB = memUsage.heapTotal / 1024 / 1024;
    const memoryCheck = {
      name: 'MEMORY_AVAILABILITY',
      passed: memoryMB >= this._options.minMemoryMB,
      message: `${memoryMB.toFixed(1)}MB available`,
      details: { required: `${this._options.minMemoryMB}MB`, available: `${memoryMB.toFixed(1)}MB` }
    };
    checks.infrastructure.push(memoryCheck);
    
    try {
      const fs = await import('fs/promises');
      await fs.access('.', fs.constants.R_OK | fs.constants.W_OK);
      checks.infrastructure.push({
        name: 'FILESYSTEM_ACCESS',
        passed: true,
        message: 'Read/Write access confirmed',
        details: { read: true, write: true }
      });
    } catch (error) {
      checks.infrastructure.push({
        name: 'FILESYSTEM_ACCESS',
        passed: false,
        message: `Access error: ${error.message}`,
        details: { error: error.message }
      });
    }
    
    const configExists = await this._checkConfigFile();
    checks.configuration.push({
      name: 'CONFIG_FILE',
      passed: configExists,
      message: configExists ? 'Configuration file found' : 'No configuration file',
      details: { file: this._options.configFile }
    });
    
    const failedChecks = [
      ...checks.infrastructure.filter(c => !c.passed),
      ...checks.configuration.filter(c => !c.passed && c.name !== 'CONFIG_FILE')
    ];
    
    if (failedChecks.length > 0) {
      const error = new Error(`POST failed: ${failedChecks.map(c => c.name).join(', ')}`);
      this.emit('post:failed', { checks, failed: failedChecks });
      throw error;
    }
    
    this.emit('post:complete', { checks });
    
    return { checks, passed: true };
  }

  /**
   * Phase 3: CONFIG_LOAD - Configuration loading
   * @private
   * @returns {Promise<Object>} Phase result
   */
  async _phaseConfigLoad() {
    this.emit('config:start');
    
    const config = {
      githubToken: process.env.GITHUB_TOKEN,
      mode: process.env.BIOS_MODE || 'OPERATIONAL',
      autoUpdate: process.env.AUTO_UPDATE === 'true',
      regressionThreshold: parseFloat(process.env.REGRESSION_THRESHOLD) || 5.0,
      maxAgents: parseInt(process.env.MAX_AGENTS) || 50,
      logLevel: process.env.LOG_LEVEL || 'info',
      statePath: process.env.STATE_PATH || './state',
      ...this._options
    };
    
    try {
      const fs = await import('fs/promises');
      const envContent = await fs.readFile(this._options.configFile, 'utf-8').catch(() => null);
      
      if (envContent) {
        const envVars = this._parseEnvFile(envContent);
        Object.assign(config, envVars);
      }
    } catch (error) {
      // Non-critical
    }
    
    const validation = this._validateConfig(config);
    
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
    
    this._bios.updateConfig(config);
    
    this.emit('config:complete', { config: this._sanitizeConfig(config) });
    this._bios.emit('bios:config:loaded', this._sanitizeConfig(config));
    
    return { 
      config: this._sanitizeConfig(config),
      validation,
      source: 'environment'
    };
  }

  /**
   * Phase 4: SUBSYSTEM_INIT - Initialize all subsystems
   * @private
   * @returns {Promise<Object>} Phase result
   */
  async _phaseSubsystemInit() {
    this.emit('subsystems:start');
    
    const initialized = [];
    const failed = [];
    
    for (const subsystem of this._subsystemOrder) {
      if (this._cancelled) {
        throw new Error('Boot cancelled during subsystem initialization');
      }
      
      try {
        this.emit('subsystem:init:start', { id: subsystem.id, name: subsystem.name });
        
        const result = await subsystem.init();
        
        initialized.push({
          id: subsystem.id,
          name: subsystem.name,
          result
        });
        
        this.emit('subsystem:init:complete', { id: subsystem.id });
        
      } catch (error) {
        failed.push({
          id: subsystem.id,
          name: subsystem.name,
          error: error.message,
          critical: subsystem.critical
        });
        
        this.emit('subsystem:init:failed', { id: subsystem.id, error: error.message });
        
        if (subsystem.critical) {
          throw new Error(`Critical subsystem failed: ${subsystem.id} - ${error.message}`);
        }
      }
    }
    
    this.emit('subsystems:complete', { initialized: initialized.length, failed: failed.length });
    this._bios.emit('bios:subsystems:initialized', { initialized, failed });
    
    return { initialized, failed };
  }

  /**
   * Phase 5: DIAGNOSTICS - Run health checks
   * @private
   * @returns {Promise<Object>} Phase result
   */
  async _phaseDiagnostics() {
    if (this._options.skipDiagnostics) {
      this.emit('diagnostics:skipped');
      return { skipped: true };
    }
    
    this.emit('diagnostics:start');
    
    const componentChecks = [];
    
    for (const [id, component] of this._bios.components) {
      if (component.healthCheck) {
        try {
          const health = await component.healthCheck();
          componentChecks.push({ id, ...health });
        } catch (error) {
          componentChecks.push({
            id,
            healthy: false,
            error: error.message
          });
        }
      }
    }
    
    const unhealthy = componentChecks.filter(c => !c.healthy);
    
    if (unhealthy.length > 0) {
      this.emit('diagnostics:warning', { unhealthy });
    }
    
    this.emit('diagnostics:complete', { 
      components: componentChecks.length,
      healthy: componentChecks.length - unhealthy.length,
      unhealthy: unhealthy.length
    });
    
    return {
      components: componentChecks,
      healthy: unhealthy.length === 0,
      warnings: unhealthy.length
    };
  }

  /**
   * Phase 6: HANDOFF - Transition to operational mode
   * @private
   * @returns {Promise<Object>} Phase result
   */
  async _phaseHandoff() {
    this.emit('handoff:start');
    
    const checks = {
      components: this._bios.components.size > 0,
      config: this._bios.config && Object.keys(this._bios.config).length > 0,
      state: this._bios.state === 'BOOT'
    };
    
    const ready = Object.values(checks).every(c => c);
    
    if (!ready) {
      const failed = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);
      
      throw new Error(`Handoff checks failed: ${failed.join(', ')}`);
    }
    
    const handoffData = {
      bootTime: this._startTime,
      phases: this._phaseHistory.length,
      duration: this.duration,
      components: Array.from(this._bios.components.keys()),
      timestamp: new Date().toISOString()
    };
    
    this.emit('handoff:ready', handoffData);
    this._bios.emit('bios:handoff:ready', handoffData);
    
    return {
      ready: true,
      checks,
      handoffData
    };
  }

  /**
   * Initialize event system
   * @private
   * @returns {Promise<Object>}
   */
  async _initEventSystem() {
    return { status: 'initialized', type: 'EventEmitter' };
  }

  /**
   * Initialize system monitor
   * @private
   * @returns {Promise<Object>}
   */
  async _initSystemMonitor() {
    try {
      const { SystemMonitor } = await import('./system-monitor.js');
      const monitor = new SystemMonitor();
      await monitor.initialize();
      this._bios.registerComponent('monitor', monitor);
      return { status: 'initialized', type: 'SystemMonitor' };
    } catch (error) {
      throw new Error(`System monitor initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize logger
   * @private
   * @returns {Promise<Object>}
   */
  async _initLogger() {
    try {
      const { default: logger } = await import('../utils/logger.js');
      this._bios.registerComponent('logger', {
        type: 'logger',
        info: (msg) => logger.info(msg),
        error: (msg) => logger.error(msg),
        warn: (msg) => logger.warn(msg),
        debug: (msg) => logger.debug(msg)
      });
      return { status: 'initialized', type: 'Logger' };
    } catch (error) {
      return { status: 'fallback', type: 'Console' };
    }
  }

  /**
   * Initialize configuration store
   * @private
   * @returns {Promise<Object>}
   */
  async _initConfigStore() {
    return { status: 'initialized', type: 'ConfigStore', keys: Object.keys(this._bios.config) };
  }

  /**
   * Initialize CV Registry
   * @private
   * @returns {Promise<Object>}
   */
  async _initCVRegistry() {
    try {
      const { CVRegistry } = await import('./cv-registry.js');
      const registry = new CVRegistry();
      await registry.initialize();
      this._bios.registerComponent('cv-registry', registry);
      return { status: 'initialized', type: 'CVRegistry', templates: registry.getTemplateCount() };
    } catch (error) {
      throw new Error(`CV Registry initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize client gateway
   * @private
   * @returns {Promise<Object>}
   */
  async _initClientGateway() {
    return { status: 'deferred', type: 'ClientGateway' };
  }

  /**
   * Initialize spawn manager
   * @private
   * @returns {Promise<Object>}
   */
  async _initSpawnManager() {
    try {
      const { SpawnManager } = await import('./spawn-manager.js');
      const { SubscriptionRuntimeManager } = await import('../router/subscription-runtime.js');

      const runtimeManager = new SubscriptionRuntimeManager({
        skipUnavailable: true
      });
      const manager = new SpawnManager({
        bios: this._bios,
        runtimeManager
      });

      this._bios.registerComponent('subscription-runtime', runtimeManager);
      this._bios.registerComponent('spawn-manager', manager);
      return { status: 'initialized', type: 'SpawnManager' };
    } catch (error) {
      throw new Error(`Spawn manager initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize orchestrator
   * @private
   * @returns {Promise<Object>}
   */
  async _initOrchestrator() {
    try {
      const { Orchestrator } = await import('./orchestrator.js');
      const spawnManager = this._bios.getComponent('spawn-manager');
      const orchestrator = new Orchestrator({
        bios: this._bios,
        spawnManager
      });
      this._bios.registerComponent('orchestrator', orchestrator);
      return { status: 'initialized', type: 'Orchestrator' };
    } catch (error) {
      return { status: 'deferred', type: 'Orchestrator', error: error.message };
    }
  }

  /**
   * Check if config file exists
   * @private
   * @returns {Promise<boolean>}
   */
  async _checkConfigFile() {
    try {
      const fs = await import('fs/promises');
      await fs.access(this._options.configFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse environment file
   * @private
   * @param {string} content - File content
   * @returns {Object} Parsed variables
   */
  _parseEnvFile(content) {
    const vars = {};
    
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        vars[key] = value.replace(/^["']|["']$/g, '');
      }
    }
    
    return vars;
  }

  /**
   * Validate configuration
   * @private
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validation result
   */
  _validateConfig(config) {
    const errors = [];
    
    const validModes = ['BOOT', 'DIAGNOSE', 'OPERATIONAL', 'MAINTENANCE', 'SAFE_MODE'];
    if (!validModes.includes(config.mode)) {
      errors.push(`Invalid mode: ${config.mode}`);
    }
    
    if (config.maxAgents < 1 || config.maxAgents > 1000) {
      errors.push('maxAgents must be between 1 and 1000');
    }
    
    if (config.regressionThreshold < 0 || config.regressionThreshold > 100) {
      errors.push('regressionThreshold must be between 0 and 100');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize configuration for logging
   * @private
   * @param {Object} config - Raw configuration
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
   * Check if boot is complete
   * @private
   * @returns {boolean}
   */
  _isComplete() {
    return this._currentPhase === BootSequencePhase.HANDOFF;
  }

  /**
   * Cancel boot sequence
   */
  cancel() {
    this._cancelled = true;
    this.emit('boot:cancelled');
  }

  /**
   * Get boot status
   * @returns {Object} Boot status
   */
  getStatus() {
    return {
      currentPhase: this._currentPhase,
      duration: this.duration,
      isRunning: this.isRunning,
      isCancelled: this._cancelled,
      phasesCompleted: this._phaseHistory.length,
      phaseHistory: this._phaseHistory.map(p => ({
        phase: p.phase,
        success: p.success,
        duration: p.duration
      }))
    };
  }

  /**
   * Get phase history
   * @returns {Array<Object>} Phase history
   */
  getPhaseHistory() {
    return [...this._phaseHistory];
  }

  /**
   * Reset boot sequence for re-execution
   */
  reset() {
    this._currentPhase = null;
    this._phaseHistory = [];
    this._startTime = null;
    this._cancelled = false;
  }
}

export default BootSequence;
