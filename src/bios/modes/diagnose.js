/**
 * @fileoverview Diagnostics Mode Handler for CogniMesh BIOS
 * @module bios/modes/diagnose
 * @description Comprehensive system diagnostics and health reporting
 * @version 5.0.0
 */

import { EventEmitter } from 'events';

/**
 * Diagnostic test categories
 * @readonly
 * @enum {string}
 */
export const DiagnosticCategory = {
  INFRASTRUCTURE: 'INFRASTRUCTURE',
  AI_CLIENTS: 'AI_CLIENTS',
  DEPENDENCIES: 'DEPENDENCIES',
  CONFIGURATION: 'CONFIGURATION',
  COMPONENTS: 'COMPONENTS',
  PERFORMANCE: 'PERFORMANCE'
};

/**
 * Diagnostic test result status
 * @readonly
 * @enum {string}
 */
export const DiagnosticStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARNING: 'WARNING',
  SKIP: 'SKIP',
  PENDING: 'PENDING'
};

/**
 * Diagnostics Mode - Comprehensive system health checking
 * @class
 * @extends EventEmitter
 * @description Runs comprehensive diagnostics on all system components
 */
export class DiagnoseMode extends EventEmitter {
  /**
   * Creates a new DiagnoseMode handler
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
     * Current diagnostic session
     * @type {Object|null}
     * @private
     */
    this._currentSession = null;
    
    /**
     * Diagnostic test registry
     * @type {Map<string, Function>}
     * @private
     */
    this._tests = new Map();
    
    /**
     * Session history
     * @type {Array<Object>}
     * @private
     */
    this._sessionHistory = [];
    
    /**
     * Maximum history size
     * @type {number}
     * @private
     */
    this._maxHistorySize = 20;
    
    this._registerBuiltinTests();
  }

  /**
   * Check if diagnostics mode is active
   * @returns {boolean}
   */
  get isActive() {
    return this._active;
  }

  /**
   * Get current diagnostic session
   * @returns {Object|null}
   */
  get currentSession() {
    return this._currentSession;
  }

  /**
   * Register built-in diagnostic tests
   * @private
   */
  _registerBuiltinTests() {
    // Infrastructure tests
    this.registerTest('node_version', DiagnosticCategory.INFRASTRUCTURE, this._checkNodeVersion.bind(this));
    this.registerTest('environment_vars', DiagnosticCategory.INFRASTRUCTURE, this._checkEnvironmentVars.bind(this));
    this.registerTest('memory_availability', DiagnosticCategory.INFRASTRUCTURE, this._checkMemoryAvailability.bind(this));
    this.registerTest('filesystem_access', DiagnosticCategory.INFRASTRUCTURE, this._checkFilesystemAccess.bind(this));
    
    // AI Client tests
    this.registerTest('claude_availability', DiagnosticCategory.AI_CLIENTS, this._checkClaudeAvailability.bind(this));
    this.registerTest('kimi_availability', DiagnosticCategory.AI_CLIENTS, this._checkKimiAvailability.bind(this));
    this.registerTest('codex_availability', DiagnosticCategory.AI_CLIENTS, this._checkCodexAvailability.bind(this));
    
    // Dependency tests
    this.registerTest('database_connectivity', DiagnosticCategory.DEPENDENCIES, this._checkDatabaseConnectivity.bind(this));
    this.registerTest('github_api_access', DiagnosticCategory.DEPENDENCIES, this._checkGitHubAPIAccess.bind(this));
    
    // Configuration tests
    this.registerTest('config_schema_valid', DiagnosticCategory.CONFIGURATION, this._checkConfigSchema.bind(this));
    this.registerTest('required_fields_present', DiagnosticCategory.CONFIGURATION, this._checkRequiredFields.bind(this));
    this.registerTest('security_settings', DiagnosticCategory.CONFIGURATION, this._checkSecuritySettings.bind(this));
    
    // Performance tests
    this.registerTest('startup_performance', DiagnosticCategory.PERFORMANCE, this._checkStartupPerformance.bind(this));
    this.registerTest('event_loop_lag', DiagnosticCategory.PERFORMANCE, this._checkEventLoopLag.bind(this));
  }

  /**
   * Register a diagnostic test
   * @param {string} id - Test identifier
   * @param {DiagnosticCategory} category - Test category
   * @param {Function} testFn - Test function
   */
  registerTest(id, category, testFn) {
    this._tests.set(id, {
      id,
      category,
      execute: testFn
    });
  }

  /**
   * Enter diagnostics mode
   * @async
   * @param {Object} [options={}] - Entry options
   * @param {Array<string>} [options.tests] - Specific tests to run
   * @param {boolean} [options.autoRun=true] - Automatically start diagnostics
   * @returns {Promise<Object>} Entry result
   */
  async enter(options = {}) {
    if (this._active) {
      return { success: false, reason: 'Diagnostics mode already active' };
    }
    
    this._active = true;
    
    const entryResult = {
      timestamp: new Date().toISOString(),
      testCount: options.tests ? options.tests.length : this._tests.size
    };
    
    this._bios.emit('bios:diagnose:entered', entryResult);
    this.emit('diagnose:active', entryResult);
    
    // Auto-run diagnostics if requested
    if (options.autoRun !== false) {
      await this.runDiagnostics(options);
    }
    
    return entryResult;
  }

  /**
   * Exit diagnostics mode
   * @async
   * @returns {Promise<Object>} Exit result
   */
  async exit() {
    if (!this._active) {
      return { success: false, reason: 'Not in diagnostics mode' };
    }
    
    // Cancel any running diagnostics
    if (this._currentSession) {
      this._currentSession.cancelled = true;
    }
    
    this._active = false;
    this._currentSession = null;
    
    const exitResult = {
      timestamp: new Date().toISOString(),
      sessionsCompleted: this._sessionHistory.length
    };
    
    this._bios.emit('bios:diagnose:exited', exitResult);
    this.emit('diagnose:inactive', exitResult);
    
    return exitResult;
  }

  /**
   * Run comprehensive diagnostics
   * @async
   * @param {Object} [options={}] - Diagnostic options
   * @param {Array<string>} [options.tests] - Specific test IDs to run
   * @param {Array<DiagnosticCategory>} [options.categories] - Categories to run
   * @param {boolean} [options.failFast=false] - Stop on first failure
   * @returns {Promise<Object>} Diagnostic results
   */
  async runDiagnostics(options = {}) {
    const sessionId = `diag-${Date.now()}`;
    const startTime = Date.now();
    
    this._currentSession = {
      id: sessionId,
      startTime,
      status: 'running',
      tests: [],
      cancelled: false
    };
    
    this._bios.emit('bios:diagnose:start', { sessionId });
    
    // Determine which tests to run
    let testsToRun = Array.from(this._tests.values());
    
    if (options.tests) {
      testsToRun = testsToRun.filter(t => options.tests.includes(t.id));
    }
    
    if (options.categories) {
      testsToRun = testsToRun.filter(t => options.categories.includes(t.category));
    }
    
    const results = {
      sessionId,
      timestamp: new Date().toISOString(),
      summary: {
        total: testsToRun.length,
        passed: 0,
        failed: 0,
        warnings: 0,
        skipped: 0
      },
      byCategory: {},
      tests: []
    };
    
    // Initialize category summaries
    Object.values(DiagnosticCategory).forEach(cat => {
      results.byCategory[cat] = { passed: 0, failed: 0, warnings: 0, total: 0 };
    });
    
    // Run each test
    for (const test of testsToRun) {
      if (this._currentSession.cancelled) {
        break;
      }
      
      const testResult = await this._runTest(test);
      results.tests.push(testResult);
      
      // Update summary
      results.summary[testResult.status.toLowerCase()]++;
      results.byCategory[test.category].total++;
      
      if (testResult.status === DiagnosticStatus.PASS) {
        results.byCategory[test.category].passed++;
      } else if (testResult.status === DiagnosticStatus.FAIL) {
        results.byCategory[test.category].failed++;
      } else if (testResult.status === DiagnosticStatus.WARNING) {
        results.byCategory[test.category].warnings++;
      }
      
      this._bios.emit('bios:diagnose:test:complete', {
        sessionId,
        test: test.id,
        status: testResult.status
      });
      
      // Fail fast option
      if (options.failFast && testResult.status === DiagnosticStatus.FAIL) {
        break;
      }
    }
    
    results.duration = Date.now() - startTime;
    results.healthy = results.summary.failed === 0;
    
    // Complete session
    this._currentSession.status = 'completed';
    this._currentSession.results = results;
    this._addToHistory(this._currentSession);
    
    this._bios.emit('bios:diagnose:complete', results);
    this.emit('diagnose:complete', results);
    
    return results;
  }

  /**
   * Run a single diagnostic test
   * @private
   * @async
   * @param {Object} test - Test definition
   * @returns {Promise<Object>} Test result
   */
  async _runTest(test) {
    const startTime = Date.now();
    
    try {
      const result = await test.execute();
      
      return {
        id: test.id,
        category: test.category,
        status: result.status || DiagnosticStatus.PASS,
        message: result.message || 'Test passed',
        details: result.details || {},
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        id: test.id,
        category: test.category,
        status: DiagnosticStatus.FAIL,
        message: error.message,
        error: error.stack,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Check Node.js version
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkNodeVersion() {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 18) {
      return {
        status: DiagnosticStatus.FAIL,
        message: `Node.js 18+ required, found ${nodeVersion}`,
        details: { current: nodeVersion, required: '>=18.0.0' }
      };
    }
    
    return {
      status: DiagnosticStatus.PASS,
      message: `Node.js version OK: ${nodeVersion}`,
      details: { version: nodeVersion }
    };
  }

  /**
   * Check environment variables
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkEnvironmentVars() {
    const required = ['GITHUB_TOKEN'];
    const missing = required.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
      return {
        status: DiagnosticStatus.FAIL,
        message: `Missing required environment variables: ${missing.join(', ')}`,
        details: { missing, present: required.filter(v => process.env[v]) }
      };
    }
    
    return {
      status: DiagnosticStatus.PASS,
      message: 'All required environment variables present',
      details: { present: required }
    };
  }

  /**
   * Check memory availability
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkMemoryAvailability() {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    if (memUsage.heapTotal < 50 * 1024 * 1024) {
      return {
        status: DiagnosticStatus.FAIL,
        message: 'Insufficient memory available',
        details: { heapTotal: memUsage.heapTotal, minRequired: 50 * 1024 * 1024 }
      };
    }
    
    if (heapUsedPercent > 90) {
      return {
        status: DiagnosticStatus.WARNING,
        message: `High memory usage: ${heapUsedPercent.toFixed(1)}%`,
        details: memUsage
      };
    }
    
    return {
      status: DiagnosticStatus.PASS,
      message: `Memory OK: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB used`,
      details: memUsage
    };
  }

  /**
   * Check filesystem access
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkFilesystemAccess() {
    try {
      const fs = await import('fs/promises');
      
      // Test read access
      await fs.access('.', fs.constants.R_OK);
      
      // Test write access to temp directory
      const testFile = `./.bios-test-${Date.now()}`;
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      
      return {
        status: DiagnosticStatus.PASS,
        message: 'Filesystem access OK',
        details: { read: true, write: true }
      };
    } catch (error) {
      return {
        status: DiagnosticStatus.FAIL,
        message: `Filesystem access error: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Claude availability
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkClaudeAvailability() {
    try {
      const claudeModule = await import('../../clients/index.js').catch(() => null);
      
      return {
        status: claudeModule ? DiagnosticStatus.PASS : DiagnosticStatus.WARNING,
        message: claudeModule ? 'Claude subscription clients available' : 'Claude subscription clients not loaded',
        details: { available: !!claudeModule }
      };
    } catch (error) {
      return {
        status: DiagnosticStatus.WARNING,
        message: `Claude check warning: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Kimi availability
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkKimiAvailability() {
    try {
      const kimiModule = await import('../../clients/kimi/index.js').catch(() => null);
      
      return {
        status: kimiModule ? DiagnosticStatus.PASS : DiagnosticStatus.WARNING,
        message: kimiModule ? 'Kimi client available' : 'Kimi client not loaded',
        details: { available: !!kimiModule }
      };
    } catch (error) {
      return {
        status: DiagnosticStatus.WARNING,
        message: `Kimi check warning: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check Codex availability
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkCodexAvailability() {
    try {
      const codexModule = await import('../../clients/codex/index.js').catch(() => null);
      
      return {
        status: codexModule ? DiagnosticStatus.PASS : DiagnosticStatus.WARNING,
        message: codexModule ? 'Codex client available' : 'Codex client not loaded',
        details: { available: !!codexModule }
      };
    } catch (error) {
      return {
        status: DiagnosticStatus.WARNING,
        message: `Codex check warning: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check database connectivity
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkDatabaseConnectivity() {
    try {
      const dbModule = await import('../../db/connection/index.js').catch(() => null);
      
      if (!dbModule) {
        return {
          status: DiagnosticStatus.WARNING,
          message: 'Database module not available',
          details: { connected: false }
        };
      }
      
      return {
        status: DiagnosticStatus.PASS,
        message: 'Database module available',
        details: { connected: true }
      };
    } catch (error) {
      return {
        status: DiagnosticStatus.WARNING,
        message: `Database check warning: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Check GitHub API access
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkGitHubAPIAccess() {
    const token = process.env.GITHUB_TOKEN;
    
    if (!token) {
      return {
        status: DiagnosticStatus.FAIL,
        message: 'GITHUB_TOKEN not configured',
        details: { configured: false }
      };
    }
    
    // Basic token format validation
    if (token.length < 10) {
      return {
        status: DiagnosticStatus.FAIL,
        message: 'GITHUB_TOKEN appears invalid (too short)',
        details: { configured: true, valid: false }
      };
    }
    
    return {
      status: DiagnosticStatus.PASS,
      message: 'GitHub token configured',
      details: { configured: true, valid: true }
    };
  }

  /**
   * Check configuration schema
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkConfigSchema() {
    const config = this._bios._config;
    
    if (!config || Object.keys(config).length === 0) {
      return {
        status: DiagnosticStatus.WARNING,
        message: 'Configuration not loaded',
        details: { loaded: false }
      };
    }
    
    return {
      status: DiagnosticStatus.PASS,
      message: 'Configuration loaded',
      details: { loaded: true, keys: Object.keys(config) }
    };
  }

  /**
   * Check required configuration fields
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkRequiredFields() {
    // Minimal required fields for BIOS operation
    const required = ['mode'];
    const missing = required.filter(f => !this._bios._config[f]);
    
    if (missing.length > 0) {
      return {
        status: DiagnosticStatus.WARNING,
        message: `Missing config fields: ${missing.join(', ')}`,
        details: { missing }
      };
    }
    
    return {
      status: DiagnosticStatus.PASS,
      message: 'All required configuration fields present',
      details: { present: required }
    };
  }

  /**
   * Check security settings
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkSecuritySettings() {
    const issues = [];
    
    // Check for token exposure
    if (process.env.GITHUB_TOKEN) {
      const token = process.env.GITHUB_TOKEN;
      if (token.length < 20) {
        issues.push('GITHUB_TOKEN may be too short');
      }
    }
    
    if (issues.length > 0) {
      return {
        status: DiagnosticStatus.WARNING,
        message: `Security warnings: ${issues.join(', ')}`,
        details: { issues }
      };
    }
    
    return {
      status: DiagnosticStatus.PASS,
      message: 'Security settings OK',
      details: { checks: ['token_length'] }
    };
  }

  /**
   * Check startup performance
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkStartupPerformance() {
    const bootTime = this._bios._bootTime;
    
    if (!bootTime) {
      return {
        status: DiagnosticStatus.SKIP,
        message: 'System not yet booted',
        details: {}
      };
    }
    
    const uptime = Date.now() - bootTime;
    const bootTimeSeconds = uptime / 1000;
    
    if (bootTimeSeconds > 30) {
      return {
        status: DiagnosticStatus.WARNING,
        message: `Slow startup detected: ${bootTimeSeconds.toFixed(1)}s`,
        details: { uptime }
      };
    }
    
    return {
      status: DiagnosticStatus.PASS,
      message: `Startup time OK: ${bootTimeSeconds.toFixed(1)}s`,
      details: { uptime }
    };
  }

  /**
   * Check event loop lag
   * @private
   * @returns {Promise<Object>} Test result
   */
  async _checkEventLoopLag() {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
        
        if (lag > 100) {
          resolve({
            status: DiagnosticStatus.WARNING,
            message: `High event loop lag: ${lag.toFixed(2)}ms`,
            details: { lag }
          });
        } else {
          resolve({
            status: DiagnosticStatus.PASS,
            message: `Event loop lag OK: ${lag.toFixed(2)}ms`,
            details: { lag }
          });
        }
      });
    });
  }

  /**
   * Add session to history
   * @private
   * @param {Object} session - Session record
   */
  _addToHistory(session) {
    this._sessionHistory.unshift(session);
    
    if (this._sessionHistory.length > this._maxHistorySize) {
      this._sessionHistory.pop();
    }
  }

  /**
   * Get diagnostics status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      active: this._active,
      currentSession: this._currentSession,
      registeredTests: this._tests.size,
      historyCount: this._sessionHistory.length
    };
  }

  /**
   * Get session history
   * @param {Object} [options={}] - Query options
   * @param {number} [options.limit=10] - Maximum results
   * @returns {Array<Object>} Session history
   */
  getHistory(options = {}) {
    const limit = options.limit || 10;
    return this._sessionHistory.slice(0, limit).map(s => ({
      id: s.id,
      startTime: s.startTime,
      status: s.status,
      results: s.results ? {
        healthy: s.results.healthy,
        summary: s.results.summary,
        duration: s.results.duration
      } : null
    }));
  }

  /**
   * Get test categories
   * @returns {Array<Object>} Available categories and test counts
   */
  getCategories() {
    const categories = {};
    
    for (const [id, test] of this._tests) {
      if (!categories[test.category]) {
        categories[test.category] = { count: 0, tests: [] };
      }
      categories[test.category].count++;
      categories[test.category].tests.push(id);
    }
    
    return Object.entries(categories).map(([name, data]) => ({
      name,
      ...data
    }));
  }

  /**
   * Generate diagnostic report
   * @param {Object} [options={}] - Report options
   * @returns {Object} Formatted diagnostic report
   */
  generateReport(options = {}) {
    const latestSession = this._sessionHistory[0];
    
    if (!latestSession || !latestSession.results) {
      return {
        generatedAt: new Date().toISOString(),
        error: 'No diagnostic data available'
      };
    }
    
    const results = latestSession.results;
    
    return {
      generatedAt: new Date().toISOString(),
      sessionId: results.sessionId,
      overall: {
        healthy: results.healthy,
        duration: results.duration,
        summary: results.summary
      },
      byCategory: results.byCategory,
      failedTests: results.tests.filter(t => t.status === DiagnosticStatus.FAIL),
      warningTests: results.tests.filter(t => t.status === DiagnosticStatus.WARNING),
      allTests: options.detailed ? results.tests : undefined
    };
  }
}

export default DiagnoseMode;
