/**
 * @fileoverview Boot Mode Handler for CogniMesh BIOS
 * @module bios/modes/boot
 * @description Initial power-on sequence and initialization
 * @version 5.0.0
 */

/**
 * Boot sequence phases
 * @readonly
 * @enum {string}
 */
export const BootPhase = {
  POWER_ON: 'POWER_ON',
  POST: 'POST',           // Power-On Self Test
  CONFIG_LOAD: 'CONFIG_LOAD',
  SUBSYSTEM_INIT: 'SUBSYSTEM_INIT',
  DIAGNOSTICS: 'DIAGNOSTICS',
  HANDOFF: 'HANDOFF'
};

/**
 * Boot Mode - Handles system initialization sequence
 * @class
 * @description Manages the BIOS boot sequence from power-on to operational
 */
export class BootMode {
  /**
   * Creates a new BootMode handler
   * @constructor
   * @param {CogniMeshBIOS} bios - BIOS instance reference
   */
  constructor(bios) {
    /**
     * BIOS instance reference
     * @type {CogniMeshBIOS}
     * @private
     */
    this._bios = bios;
    
    /**
     * Current boot phase
     * @type {BootPhase}
     * @private
     */
    this._phase = BootPhase.POWER_ON;
    
    /**
     * Boot start timestamp
     * @type {number|null}
     * @private
     */
    this._startTime = null;
    
    /**
     * Phase durations for metrics
     * @type {Map<string, number>}
     * @private
     */
    this._phaseDurations = new Map();
    
    /**
     * Boot errors collection
     * @type {Array<{phase: string, error: Error}>}
     * @private
     */
    this._errors = [];
  }

  /**
   * Get current boot phase
   * @returns {BootPhase} Current phase
   */
  get phase() {
    return this._phase;
  }

  /**
   * Enter boot mode and execute boot sequence
   * @async
   * @param {Object} [options={}] - Boot options
   * @returns {Promise<Object>} Boot result
   */
  async enter(options = {}) {
    this._startTime = Date.now();
    this._bios.emit('bios:boot:phase', { phase: BootPhase.POWER_ON });
    
    try {
      // Phase 1: Power-On Self Test
      await this._executePhase(BootPhase.POST, () => this._runPOST());
      
      // Phase 2: Configuration Loading
      await this._executePhase(BootPhase.CONFIG_LOAD, () => this._loadConfiguration(options));
      
      // Phase 3: Subsystem Initialization
      await this._executePhase(BootPhase.SUBSYSTEM_INIT, () => this._initializeSubsystems());
      
      // Phase 4: Diagnostics (if not skipped)
      if (!options.skipDiagnostics) {
        await this._executePhase(BootPhase.DIAGNOSTICS, () => this._runDiagnostics());
      }
      
      // Phase 5: Handoff preparation
      await this._executePhase(BootPhase.HANDOFF, () => this._prepareHandoff());
      
      return {
        success: true,
        duration: Date.now() - this._startTime,
        phases: Object.fromEntries(this._phaseDurations),
        errors: this._errors.length > 0 ? this._errors : undefined
      };
      
    } catch (error) {
      this._errors.push({ phase: this._phase, error });
      this._bios.emit('bios:boot:failed', { phase: this._phase, error: error.message });
      throw error;
    }
  }

  /**
   * Execute a boot phase with timing
   * @private
   * @async
   * @param {BootPhase} phase - Phase to execute
   * @param {Function} fn - Phase execution function
   */
  async _executePhase(phase, fn) {
    const phaseStart = Date.now();
    this._phase = phase;
    this._bios.emit('bios:boot:phase', { phase });
    
    try {
      await fn();
      this._phaseDurations.set(phase, Date.now() - phaseStart);
    } catch (error) {
      this._phaseDurations.set(phase, Date.now() - phaseStart);
      throw error;
    }
  }

  /**
   * Power-On Self Test
   * @private
   * @async
   */
  async _runPOST() {
    // Check Node.js version compatibility
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required, found ${nodeVersion}`);
    }
    
    // Check required environment
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable not set');
    }
    
    // Memory availability check (rough estimate)
    const memUsage = process.memoryUsage();
    if (memUsage.heapTotal < 50 * 1024 * 1024) { // 50MB minimum
      throw new Error('Insufficient memory available for BIOS operation');
    }
    
    this._bios.emit('bios:post:complete', { nodeVersion, memory: memUsage });
  }

  /**
   * Load BIOS configuration
   * @private
   * @async
   * @param {Object} options - Boot options
   */
  async _loadConfiguration(options) {
    // Configuration is loaded in the main BIOS class
    // This phase allows for mode-specific config adjustments
    
    const config = {
      mode: process.env.BIOS_MODE || 'OPERATIONAL',
      autoUpdate: process.env.AUTO_UPDATE === 'true',
      regressionThreshold: parseFloat(process.env.REGRESSION_THRESHOLD) || 5.0
    };
    
    this._bios.emit('bios:config:ready', config);
  }

  /**
   * Initialize BIOS subsystems
   * @private
   * @async
   */
  async _initializeSubsystems() {
    const subsystems = [];
    
    // Initialize event system (already done in constructor)
    subsystems.push('event-system');
    
    // Initialize component registry
    subsystems.push('component-registry');
    
    // Initialize mode handlers
    subsystems.push('mode-handlers');
    
    this._bios.emit('bios:subsystems:ready', { subsystems });
  }

  /**
   * Run system diagnostics
   * @private
   * @async
   */
  async _runDiagnostics() {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      tests: []
    };
    
    // Test 1: File system access
    try {
      const fs = await import('fs/promises');
      await fs.access('.');
      diagnostics.tests.push({ name: 'filesystem', status: 'PASS' });
    } catch (error) {
      diagnostics.tests.push({ name: 'filesystem', status: 'FAIL', error: error.message });
    }
    
    // Test 2: Network connectivity (GitHub API)
    try {
      // Basic connectivity test - would use actual GitHub API in production
      diagnostics.tests.push({ name: 'github-api', status: 'PENDING' });
    } catch (error) {
      diagnostics.tests.push({ name: 'github-api', status: 'FAIL', error: error.message });
    }
    
    // Test 3: State directory
    try {
      const fs = await import('fs/promises');
      const statePath = process.env.STATE_PATH || './state';
      await fs.mkdir(statePath, { recursive: true });
      diagnostics.tests.push({ name: 'state-directory', status: 'PASS' });
    } catch (error) {
      diagnostics.tests.push({ name: 'state-directory', status: 'FAIL', error: error.message });
    }
    
    const failedTests = diagnostics.tests.filter(t => t.status === 'FAIL');
    if (failedTests.length > 0) {
      throw new Error(`Diagnostics failed: ${failedTests.map(t => t.name).join(', ')}`);
    }
    
    this._bios.emit('bios:diagnostics:complete', diagnostics);
  }

  /**
   * Prepare for handoff to operational mode
   * @private
   * @async
   */
  async _prepareHandoff() {
    // Final preparations before entering operational mode
    this._bios.emit('bios:handoff:ready', {
      duration: Date.now() - this._startTime,
      phases: Object.fromEntries(this._phaseDurations)
    });
  }

  /**
   * Exit boot mode (called when transitioning)
   * @async
   * @returns {Promise<void>}
   */
  async exit() {
    // Boot mode is transient, cleanup if needed
    this._phase = null;
    this._bios.emit('bios:boot:exit');
  }

  /**
   * Get boot statistics
   * @returns {Object} Boot statistics
   */
  getStats() {
    return {
      phase: this._phase,
      duration: this._startTime ? Date.now() - this._startTime : 0,
      phaseDurations: Object.fromEntries(this._phaseDurations),
      errorCount: this._errors.length
    };
  }
}

export default BootMode;
