/**
 * @fileoverview Safe Mode Handler for CogniMesh BIOS
 * @module bios/modes/safe-mode
 * @description Minimal functionality mode for critical failures
 * @version 5.0.0
 */

import { EventEmitter } from 'events';

/**
 * Safe Mode - Minimal functionality for critical failures
 * @class
 * @extends EventEmitter
 * @description Provides emergency operations when normal modes fail
 */
export class SafeMode extends EventEmitter {
  /**
   * Creates a new SafeMode handler
   * @constructor
   * @param {CogniMeshBIOS} bios - BIOS instance reference
   */
  constructor(bios) {
    super();
    
    /**
     * BIOS instance reference
     * @type {CogniMeshBIOS}
     * @private
     */
    this._bios = bios;
    
    /**
     * Mode active flag
     * @type {boolean}
     * @private
     */
    this._active = false;
    
    /**
     * Entry reason/error
     * @type {Error|null}
     * @private
     */
    this._entryError = null;
    
    /**
     * Entry timestamp
     * @type {number|null}
     * @private
     */
    this._entryTime = null;
    
    /**
     * Recovery attempts counter
     * @type {number}
     * @private
     */
    this._recoveryAttempts = 0;
    
    /**
     * Maximum recovery attempts
     * @type {number}
     * @private
     */
    this._maxRecoveryAttempts = 3;
    
    /**
     * Emergency log buffer
     * @type {Array<Object>}
     * @private
     */
    this._emergencyLogs = [];
    
    /**
     * Maximum emergency log entries
     * @type {number}
     * @private
     */
    this._maxEmergencyLogs = 100;
    
    /**
     * Minimal component set for safe mode
     * @type {Array<string>}
     * @private
     */
    this._minimalComponents = ['monitor', 'logger'];
    
    /**
     * Safe mode capabilities
     * @type {Set<string>}
     * @private
     */
    this._capabilities = new Set([
      'diagnostics',
      'logging',
      'status',
      'shutdown',
      'recovery-attempt'
    ]);
  }

  /**
   * Check if safe mode is active
   * @returns {boolean}
   */
  get isActive() {
    return this._active;
  }

  /**
   * Get entry error
   * @returns {Error|null}
   */
  get entryError() {
    return this._entryError;
  }

  /**
   * Get safe mode capabilities
   * @returns {Array<string>}
   */
  get capabilities() {
    return Array.from(this._capabilities);
  }

  /**
   * Enter safe mode
   * @async
   * @param {Object} [options={}] - Entry options
   * @param {Error} [options.cause] - Error that caused safe mode entry
   * @param {boolean} [options.preserveState=true] - Preserve pre-failure state
   * @returns {Promise<Object>} Entry result
   */
  async enter(options = {}) {
    if (this._active) {
      return { success: false, reason: 'Already in safe mode' };
    }
    
    this._entryTime = Date.now();
    this._entryError = options.cause || null;
    this._recoveryAttempts = 0;
    
    // Log entry
    this._logEmergency('SAFE_MODE_ENTERED', {
      cause: this._entryError?.message || 'Unknown',
      timestamp: new Date().toISOString()
    });
    
    // Shutdown non-critical components
    await this._shutdownNonCriticalComponents();
    
    // Activate minimal components only
    await this._activateMinimalComponents();
    
    this._active = true;
    
    const entryResult = {
      success: true,
      timestamp: new Date().toISOString(),
      cause: this._entryError?.message,
      capabilities: this.capabilities,
      restricted: true
    };
    
    this._bios.emit('bios:safe-mode:entered', entryResult);
    this.emit('safe-mode:active', entryResult);
    
    return entryResult;
  }

  /**
   * Exit safe mode
   * @async
   * @param {Object} [options={}] - Exit options
   * @param {boolean} [options.force=false] - Force exit without recovery
   * @returns {Promise<Object>} Exit result
   */
  async exit(options = {}) {
    if (!this._active) {
      return { success: false, reason: 'Not in safe mode' };
    }
    
    // Attempt recovery unless forced
    if (!options.force) {
      const recovery = await this.attemptRecovery();
      if (!recovery.success) {
        return {
          success: false,
          reason: 'Recovery failed',
          recovery
        };
      }
    }
    
    const duration = Date.now() - this._entryTime;
    
    this._active = false;
    this._entryError = null;
    
    const exitResult = {
      success: true,
      duration,
      recoveryAttempts: this._recoveryAttempts,
      forced: options.force || false
    };
    
    this._bios.emit('bios:safe-mode:exited', exitResult);
    this.emit('safe-mode:inactive', exitResult);
    
    return exitResult;
  }

  /**
   * Shutdown non-critical components
   * @private
   * @async
   */
  async _shutdownNonCriticalComponents() {
    for (const [id, component] of this._bios.components) {
      if (!this._minimalComponents.includes(id)) {
        try {
          if (component.shutdown) {
            await component.shutdown();
          }
          this._bios.unregisterComponent(id);
          this._logEmergency('COMPONENT_SHUTDOWN', { id });
        } catch (error) {
          this._logEmergency('COMPONENT_SHUTDOWN_ERROR', { id, error: error.message });
        }
      }
    }
  }

  /**
   * Activate minimal components
   * @private
   * @async
   */
  async _activateMinimalComponents() {
    // Ensure system monitor is active for basic health tracking
    if (!this._bios.getComponent('monitor')) {
      const { SystemMonitor } = await import('../system-monitor.js');
      const monitor = new SystemMonitor({ autoStart: false });
      await monitor.initialize();
      this._bios.registerComponent('monitor', monitor);
    }
  }

  /**
   * Attempt system recovery
   * @async
   * @returns {Promise<Object>} Recovery result
   */
  async attemptRecovery() {
    this._recoveryAttempts++;
    
    this._logEmergency('RECOVERY_ATTEMPT', {
      attempt: this._recoveryAttempts,
      maxAttempts: this._maxRecoveryAttempts
    });
    
    if (this._recoveryAttempts > this._maxRecoveryAttempts) {
      return {
        success: false,
        reason: 'Maximum recovery attempts exceeded',
        attempts: this._recoveryAttempts
      };
    }
    
    try {
      // Step 1: Run diagnostics
      const diagnostics = await this._runSafeDiagnostics();
      if (!diagnostics.healthy) {
        return {
          success: false,
          step: 'diagnostics',
          issues: diagnostics.issues
        };
      }
      
      // Step 2: Clear temporary state
      await this._clearTemporaryState();
      
      // Step 3: Reinitialize components
      await this._reinitializeComponents();
      
      this._logEmergency('RECOVERY_SUCCESS', {
        attempt: this._recoveryAttempts
      });
      
      return {
        success: true,
        attempts: this._recoveryAttempts,
        diagnostics
      };
      
    } catch (error) {
      this._logEmergency('RECOVERY_FAILED', {
        attempt: this._recoveryAttempts,
        error: error.message
      });
      
      return {
        success: false,
        step: 'exception',
        error: error.message,
        attempts: this._recoveryAttempts
      };
    }
  }

  /**
   * Run safe mode diagnostics
   * @private
   * @async
   * @returns {Promise<Object>} Diagnostics result
   */
  async _runSafeDiagnostics() {
    const issues = [];
    
    // Check environment
    if (!process.env.GITHUB_TOKEN) {
      issues.push('GITHUB_TOKEN missing');
    }
    
    // Check file system
    try {
      const fs = await import('fs/promises');
      await fs.access('.');
    } catch (error) {
      issues.push(`File system access: ${error.message}`);
    }
    
    // Check minimal components
    for (const id of this._minimalComponents) {
      const component = this._bios.getComponent(id);
      if (!component) {
        issues.push(`Missing component: ${id}`);
      }
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear temporary state
   * @private
   * @async
   */
  async _clearTemporaryState() {
    try {
      const fs = await import('fs/promises');
      const statePath = process.env.STATE_PATH || './state';
      
      // Clear cache files
      try {
        const cacheFiles = await fs.readdir(`${statePath}/cache`);
        for (const file of cacheFiles) {
          await fs.unlink(`${statePath}/cache/${file}`).catch(() => {});
        }
      } catch (error) {
        // Cache clear is non-critical
      }
      
      this._logEmergency('TEMP_STATE_CLEARED');
    } catch (error) {
      this._logEmergency('TEMP_STATE_CLEAR_ERROR', { error: error.message });
    }
  }

  /**
   * Reinitialize core components
   * @private
   * @async
   */
  async _reinitializeComponents() {
    for (const id of this._minimalComponents) {
      const component = this._bios.getComponent(id);
      if (component && component.initialize) {
        try {
          await component.initialize();
          this._logEmergency('COMPONENT_REINITIALIZED', { id });
        } catch (error) {
          this._logEmergency('COMPONENT_REINIT_ERROR', { id, error: error.message });
          throw error;
        }
      }
    }
  }

  /**
   * Log emergency message
   * @private
   * @param {string} event - Event type
   * @param {Object} [data={}] - Event data
   */
  _logEmergency(event, data = {}) {
    const entry = {
      timestamp: Date.now(),
      isoTimestamp: new Date().toISOString(),
      event,
      data,
      safeMode: true
    };
    
    this._emergencyLogs.push(entry);
    
    if (this._emergencyLogs.length > this._maxEmergencyLogs) {
      this._emergencyLogs.shift();
    }
    
    // Also output to console for visibility
    console.error(`[SAFE-MODE] ${event}:`, data);
  }

  /**
   * Execute a safe mode command
   * @async
   * @param {string} command - Command to execute
   * @param {Object} [params={}] - Command parameters
   * @returns {Promise<any>} Command result
   * @throws {Error} If command not available in safe mode
   */
  async executeCommand(command, params = {}) {
    if (!this._capabilities.has(command)) {
      throw new Error(`Command '${command}' not available in safe mode`);
    }
    
    switch (command) {
      case 'diagnostics':
        return this._runSafeDiagnostics();
      
      case 'logging':
        return this._emergencyLogs.slice(-(params.limit || 50));
      
      case 'status':
        return this.getStatus();
      
      case 'shutdown':
        return this._emergencyShutdown();
      
      case 'recovery-attempt':
        return this.attemptRecovery();
      
      default:
        throw new Error(`Unknown safe mode command: ${command}`);
    }
  }

  /**
   * Emergency shutdown
   * @private
   * @async
   */
  async _emergencyShutdown() {
    this._logEmergency('EMERGENCY_SHUTDOWN_INITIATED');
    
    // Save emergency logs
    try {
      const fs = await import('fs/promises');
      const statePath = process.env.STATE_PATH || './state';
      await fs.mkdir(statePath, { recursive: true });
      await fs.writeFile(
        `${statePath}/emergency-logs-${Date.now()}.json`,
        JSON.stringify(this._emergencyLogs, null, 2)
      );
    } catch (error) {
      console.error('Failed to save emergency logs:', error);
    }
    
    process.exit(1);
  }

  /**
   * Get safe mode status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      active: this._active,
      entryTime: this._entryTime ? new Date(this._entryTime).toISOString() : null,
      duration: this._entryTime ? Date.now() - this._entryTime : 0,
      cause: this._entryError?.message,
      recoveryAttempts: this._recoveryAttempts,
      maxRecoveryAttempts: this._maxRecoveryAttempts,
      capabilities: this.capabilities,
      logCount: this._emergencyLogs.length
    };
  }

  /**
   * Get emergency logs
   * @param {Object} [options={}] - Query options
   * @param {number} [options.limit=50] - Maximum entries
   * @param {string} [options.event] - Filter by event type
   * @returns {Array<Object>} Emergency logs
   */
  getEmergencyLogs(options = {}) {
    let logs = [...this._emergencyLogs];
    
    if (options.event) {
      logs = logs.filter(log => log.event === options.event);
    }
    
    if (options.limit) {
      logs = logs.slice(-options.limit);
    }
    
    return logs;
  }

  /**
   * Check if a capability is available
   * @param {string} capability - Capability to check
   * @returns {boolean}
   */
  hasCapability(capability) {
    return this._capabilities.has(capability);
  }

  /**
   * Add a safe mode capability (for extensions)
   * @param {string} capability - Capability to add
   */
  addCapability(capability) {
    this._capabilities.add(capability);
  }

  /**
   * Health check for BIOS component interface
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    return {
      healthy: this._active,
      status: this.getStatus(),
      message: this._active ? 'Safe mode active' : 'Safe mode not active'
    };
  }

  /**
   * Graceful shutdown for BIOS component interface
   */
  async shutdown() {
    this._emergencyLogs = [];
    this._active = false;
  }
}

export default SafeMode;
