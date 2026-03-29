/**
 * @fileoverview Ckamal Plugin Loader
 * Handles dynamic loading, worker spawning, and lifecycle management.
 * 
 * @module plugins/plugin-loader
 * @see plugin-sdk-design.md
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} PluginLoaderOptions
 * @property {import('./plugin-registry.js').PluginRegistry} registry - Plugin registry
 * @property {Object} [logger] - Logger instance
 * @property {number} [rpcTimeout] - RPC timeout in ms
 * @property {number} [maxBufferSize] - Max stdio buffer size
 * @property {string} [nodePath] - Path to node executable
 */

/**
 * @typedef {Object} RpcMessage
 * @property {string} jsonrpc - Always "2.0"
 * @property {string|number} [id] - Request ID
 * @property {string} [method] - Method name
 * @property {unknown} [params] - Method parameters
 * @property {unknown} [result] - Result value
 * @property {{code: number, message: string}} [error] - Error object
 */

// ============================================================================
// JSON-RPC Constants
// ============================================================================

const JSONRPC_VERSION = '2.0';

export const JSONRPC_ERROR_CODES = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  WORKER_UNAVAILABLE: -32000,
  CAPABILITY_DENIED: -32001,
  WORKER_ERROR: -32002,
  TIMEOUT: -32003
});

// ============================================================================
// Plugin Loader
// ============================================================================

export class PluginLoader extends EventEmitter {
  /**
   * Create a plugin loader
   * @param {PluginLoaderOptions} options - Loader options
   */
  constructor(options) {
    super();
    
    this.registry = options.registry;
    this.logger = options.logger || console;
    this.rpcTimeout = options.rpcTimeout || 30000;
    this.maxBufferSize = options.maxBufferSize || 10 * 1024 * 1024; // 10MB
    this.nodePath = options.nodePath || process.execPath;
    
    /** @type {Map<string, PluginWorker>} */
    this.workers = new Map();
  }
  
  /**
   * Load and start a plugin
   * @param {string} manifestPath - Path to plugin manifest
   * @param {Object} [config] - Initial configuration
   * @returns {Promise<import('./plugin-registry.js').PluginRecord>}
   */
  async loadPlugin(manifestPath, config) {
    // Read and parse manifest
    const manifestContent = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    
    // Register with registry
    const plugin = await this.registry.registerPlugin({
      manifestPath,
      manifest
    });
    
    // Start the plugin
    await this.registry.startPlugin(plugin.id, config);
    
    // Spawn worker
    await this._spawnWorker(plugin, manifest);
    
    return plugin;
  }
  
  /**
   * Load plugin from directory
   * @param {string} pluginDir - Plugin directory
   * @param {Object} [config] - Initial configuration
   * @returns {Promise<import('./plugin-registry.js').PluginRecord>}
   */
  async loadFromDirectory(pluginDir, config) {
    const manifestPath = resolve(pluginDir, 'ckamal-plugin.json');
    return this.loadPlugin(manifestPath, config);
  }
  
  /**
   * Spawn a worker process for a plugin
   * @private
   */
  async _spawnWorker(plugin, manifest) {
    const workerPath = resolve(dirname(plugin.manifestPath), manifest.entrypoints.worker);
    
    this.logger.info(`Spawning worker for ${plugin.id}: ${workerPath}`);
    
    // Spawn worker process
    const child = spawn(this.nodePath, [workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CKAMAL_PLUGIN_ID: plugin.id,
        CKAMAL_PLUGIN_VERSION: plugin.version,
        CKAMAL_HOST_VERSION: '5.0.0',
        CKAMAL_PLUGIN_MODE: 'worker'
      }
    });
    
    // Create worker wrapper
    const worker = new PluginWorker({
      pluginId: plugin.id,
      process: child,
      logger: this.logger,
      rpcTimeout: this.rpcTimeout
    });
    
    // Store worker reference
    this.workers.set(plugin.id, worker);
    this.registry.registerWorker(plugin.id, worker);
    
    // Wait for worker to initialize
    try {
      await worker.initialize({
        manifest,
        config: this.registry.getPluginConfig(plugin.id) || {},
        instanceInfo: {
          instanceId: this._generateInstanceId(),
          hostVersion: '5.0.0'
        },
        apiVersion: 1
      });
      
      this.logger.info(`Worker initialized for ${plugin.id}`);
      
    } catch (error) {
      this.logger.error(`Worker initialization failed for ${plugin.id}`, { error: error.message });
      await worker.terminate();
      this.workers.delete(plugin.id);
      throw error;
    }
    
    return worker;
  }
  
  /**
   * Reload a plugin (stop and restart)
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<void>}
   */
  async reloadPlugin(pluginId) {
    const plugin = this.registry.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    // Stop current worker
    const currentWorker = this.workers.get(pluginId);
    if (currentWorker) {
      await currentWorker.terminate();
      this.workers.delete(pluginId);
    }
    
    // Re-read manifest (may have changed)
    const manifestContent = await readFile(plugin.manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    
    // Spawn new worker
    await this._spawnWorker(plugin, manifest);
  }
  
  /**
   * Unload a plugin
   * @param {string} pluginId - Plugin ID
   * @param {Object} [options] - Options
   * @param {boolean} [options.purgeData=false] - Whether to purge data
   */
  async unloadPlugin(pluginId, options = {}) {
    // Stop worker
    const worker = this.workers.get(pluginId);
    if (worker) {
      await worker.terminate();
      this.workers.delete(pluginId);
    }
    
    // Unregister from registry
    await this.registry.unregisterPlugin(pluginId, options);
  }
  
  /**
   * Execute a tool provided by a plugin
   * @param {string} pluginId - Plugin ID
   * @param {string} toolName - Tool name
   * @param {Object} parameters - Tool parameters
   * @param {import('./plugin-sdk.js').ToolRunContext} runContext - Run context
   * @returns {Promise<import('./plugin-sdk.js').ToolResult>}
   */
  async executeTool(pluginId, toolName, parameters, runContext) {
    const worker = this.workers.get(pluginId);
    if (!worker) {
      throw new Error(`Plugin worker not found: ${pluginId}`);
    }
    
    // Check capability
    if (!this.registry.hasCapability(pluginId, 'tools.register')) {
      throw new Error(`Plugin ${pluginId} does not have tools.register capability`);
    }
    
    return worker.executeTool(toolName, parameters, runContext);
  }
  
  /**
   * Send event to a plugin worker
   * @param {string} pluginId - Plugin ID
   * @param {import('./plugin-sdk.js').PluginEvent} event - Event to send
   */
  async sendEvent(pluginId, event) {
    const worker = this.workers.get(pluginId);
    if (!worker) {
      return; // Silently ignore if worker not available
    }
    
    return worker.sendEvent(event);
  }
  
  /**
   * Get data from plugin worker
   * @param {string} pluginId - Plugin ID
   * @param {string} key - Data key
   * @param {Object} params - Data parameters
   */
  async getPluginData(pluginId, key, params) {
    const worker = this.workers.get(pluginId);
    if (!worker) {
      throw new Error(`Plugin worker not found: ${pluginId}`);
    }
    
    return worker.getData(key, params);
  }
  
  /**
   * Perform action on plugin worker
   * @param {string} pluginId - Plugin ID
   * @param {string} key - Action key
   * @param {Object} params - Action parameters
   */
  async performPluginAction(pluginId, key, params) {
    const worker = this.workers.get(pluginId);
    if (!worker) {
      throw new Error(`Plugin worker not found: ${pluginId}`);
    }
    
    return worker.performAction(key, params);
  }
  
  /**
   * Get all active workers
   * @returns {Map<string, PluginWorker>}
   */
  getWorkers() {
    return this.workers;
  }
  
  /**
   * Dispose the loader
   */
  async dispose() {
    this.logger.info('Disposing plugin loader...');
    
    // Terminate all workers
    for (const [pluginId, worker] of this.workers) {
      await worker.terminate().catch(() => {});
    }
    
    this.workers.clear();
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  /**
   * Generate unique instance ID
   * @private
   */
  _generateInstanceId() {
    return `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Plugin Worker
// ============================================================================

export class PluginWorker extends EventEmitter {
  /**
   * Create a plugin worker wrapper
   * @param {Object} options - Options
   * @param {string} options.pluginId - Plugin ID
   * @param {import('child_process').ChildProcess} options.process - Child process
   * @param {Object} options.logger - Logger
   * @param {number} options.rpcTimeout - RPC timeout
   */
  constructor(options) {
    super();
    
    this.pluginId = options.pluginId;
    this.process = options.process;
    this.logger = options.logger;
    this.rpcTimeout = options.rpcTimeout;
    
    this.isInitialized = false;
    this.isTerminated = false;
    this.messageId = 0;
    
    /** @type {Map<string|number, {resolve: Function, reject: Function, timer: NodeJS.Timeout}>} */
    this.pendingRequests = new Map();
    
    // Set up stdio handlers
    this._setupStdio();
  }
  
  /**
   * Set up stdio communication
   * @private
   */
  _setupStdio() {
    // Handle stdout (JSON-RPC responses)
    let buffer = '';
    
    const stdoutHandler = (data) => {
      buffer += data.toString();
      
      // Process complete lines
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        
        if (line) {
          this._handleMessage(line);
        }
      }
      
      // Prevent buffer overflow
      if (buffer.length > 1024 * 1024) {
        this.logger.warn(`Worker ${this.pluginId} stdout buffer overflow, discarding`);
        buffer = '';
      }
    };
    
    const stderrHandler = (data) => {
      const message = data.toString().trim();
      if (message) {
        this.logger.debug(`[${this.pluginId}] ${message}`);
      }
    };
    
    const exitHandler = (code, signal) => {
      this.isTerminated = true;
      
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Worker exited with code ${code}${signal ? `, signal: ${signal}` : ''}`));
      }
      this.pendingRequests.clear();
      
      // Clean up listeners to prevent memory leaks
      this.process.stdout?.off('data', stdoutHandler);
      this.process.stderr?.off('data', stderrHandler);
      
      this.emit('exit', code, signal);
    };
    
    const errorHandler = (error) => {
      this.emit('error', error);
    };
    
    // Store handlers for cleanup
    this._stdioHandlers = { stdoutHandler, stderrHandler, exitHandler, errorHandler };
    
    this.process.stdout.on('data', stdoutHandler);
    this.process.stderr.on('data', stderrHandler);
    this.process.on('exit', exitHandler);
    this.process.on('error', errorHandler);
  }
  
  /**
   * Handle incoming message
   * @private
   */
  _handleMessage(line) {
    try {
      const message = JSON.parse(line);
      
      // Validate JSON-RPC version
      if (message.jsonrpc !== JSONRPC_VERSION) {
        this.logger.warn(`Invalid JSON-RPC version from ${this.pluginId}: ${message.jsonrpc}`);
        return;
      }
      
      // Handle batch requests (array of messages)
      if (Array.isArray(message)) {
        for (const msg of message) {
          this._handleSingleMessage(msg);
        }
      } else {
        this._handleSingleMessage(message);
      }
    } catch (error) {
      this.logger.error(`Failed to parse message from ${this.pluginId}: ${error.message}`, { 
        line: line.substring(0, 200) // Truncate long lines in logs
      });
    }
  }
  
  /**
   * Handle a single JSON-RPC message
   * @private
   */
  _handleSingleMessage(message) {
    if (message.id !== undefined) {
      // Response to pending request
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        
        if (message.error) {
          const error = new Error(message.error.message || 'Unknown error');
          error.code = message.error.code || JSONRPC_ERROR_CODES.INTERNAL_ERROR;
          error.data = message.error.data; // Preserve additional error data
          pending.reject(error);
        } else {
          pending.resolve(message.result);
        }
      } else {
        this.logger.debug(`Received response for unknown request ID: ${message.id}`);
      }
    } else if (message.method) {
      // Notification from worker (e.g., log)
      this._handleNotification(message);
    }
  }
  
  /**
   * Handle notification from worker
   * @private
   */
  _handleNotification(message) {
    // Validate notification has params
    if (!message.params || typeof message.params !== 'object') {
      this.logger.warn(`Invalid notification from ${this.pluginId}: missing params`, { method: message.method });
      return;
    }
    
    switch (message.method) {
      case 'log': {
        const { level, message: logMessage, meta } = message.params;
        const logFn = this.logger[level] || this.logger.info;
        logFn.call(this.logger, `[${this.pluginId}] ${logMessage}`, meta);
        break;
      }
        
      case 'events.emit':
        // Forward event to event bus with plugin context
        this.emit('event', {
          ...message.params,
          _source: {
            pluginId: this.pluginId,
            receivedAt: new Date().toISOString()
          }
        });
        break;
        
      case 'events.subscribe': {
        // Track subscription in registry
        const { pattern } = message.params;
        this.emit('subscribe', { pattern });
        break;
      }
        
      case 'tools.register': {
        // Track tool registration
        const { name, declaration } = message.params;
        this.emit('toolRegistered', { name, declaration });
        break;
      }
        
      default:
        this.logger.debug(`Unknown notification from ${this.pluginId}: ${message.method}`);
    }
  }
  
  /**
   * Send RPC request
   * @private
   */
  _sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      if (this.isTerminated) {
        const error = new Error('Worker is terminated');
        error.code = JSONRPC_ERROR_CODES.WORKER_UNAVAILABLE;
        reject(error);
        return;
      }
      
      if (!this.process || !this.process.stdin || this.process.stdin.destroyed) {
        const error = new Error('Worker stdin is not available');
        error.code = JSONRPC_ERROR_CODES.WORKER_UNAVAILABLE;
        reject(error);
        return;
      }
      
      const id = ++this.messageId;
      const message = {
        jsonrpc: JSONRPC_VERSION,
        id,
        method,
        params
      };
      
      // Set timeout with proper cleanup
      const timer = setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          const error = new Error(`RPC timeout: ${method}`);
          error.code = JSONRPC_ERROR_CODES.TIMEOUT;
          pending.reject(error);
        }
      }, this.rpcTimeout);
      
      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timer });
      
      // Send message
      try {
        const success = this.process.stdin.write(JSON.stringify(message) + '\n', (err) => {
          if (err) {
            clearTimeout(timer);
            this.pendingRequests.delete(id);
            const error = new Error(`Failed to send message: ${err.message}`);
            error.code = JSONRPC_ERROR_CODES.WORKER_ERROR;
            reject(error);
          }
        });
        
        // Handle backpressure
        if (!success) {
          this.process.stdin.once('drain', () => {});
        }
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        const err = new Error(`Failed to send message: ${error.message}`);
        err.code = JSONRPC_ERROR_CODES.WORKER_ERROR;
        reject(err);
      }
    });
  }
  
  /**
   * Send notification (fire and forget)
   * @private
   */
  _sendNotification(method, params) {
    if (this.isTerminated) return;
    
    const message = {
      jsonrpc: JSONRPC_VERSION,
      method,
      params
    };
    
    try {
      this.process.stdin.write(JSON.stringify(message) + '\n');
    } catch (error) {
      this.logger.error(`Failed to send notification to ${this.pluginId}: ${error.message}`);
    }
  }
  
  /**
   * Initialize the worker
   * @param {Object} params - Initialize parameters
   */
  async initialize(params) {
    const result = await this._sendRequest('initialize', params);
    this.isInitialized = result.ok === true;
    return result;
  }
  
  /**
   * Perform health check
   * @returns {Promise<import('./plugin-sdk.js').HealthDiagnostics>}
   */
  async healthCheck() {
    return this._sendRequest('health', {});
  }
  
  /**
   * Request graceful shutdown
   */
  async shutdown() {
    if (this.isTerminated) return;
    
    try {
      await this._sendRequest('shutdown', {});
    } catch (error) {
      // Ignore errors during shutdown
    }
  }
  
  /**
   * Terminate the worker process
   */
  async terminate() {
    if (this.isTerminated || !this.process) return;
    
    // Try graceful shutdown first
    try {
      await Promise.race([
        this.shutdown(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), 5000))
      ]);
    } catch {
      // Force kill if process still exists
      if (this.process && !this.process.killed) {
        try {
          this.process.kill('SIGTERM');
          
          // Wait a bit then SIGKILL if needed
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
        } catch (killError) {
          this.logger.warn(`Failed to kill worker ${this.pluginId}: ${killError.message}`);
        }
      }
    }
    
    this.isTerminated = true;
    
    // Clean up all listeners
    this.removeAllListeners();
  }
  
  /**
   * Notify of config change
   * @param {Object} config - New configuration
   */
  async configChanged(config) {
    return this._sendRequest('configChanged', { config });
  }
  
  /**
   * Send event to worker
   * @param {import('./plugin-sdk.js').PluginEvent} event - Event
   */
  async sendEvent(event) {
    return this._sendRequest('onEvent', { event });
  }
  
  /**
   * Execute a tool
   * @param {string} toolName - Tool name
   * @param {Object} parameters - Tool parameters
   * @param {import('./plugin-sdk.js').ToolRunContext} runContext - Run context
   * @returns {Promise<import('./plugin-sdk.js').ToolResult>}
   */
  async executeTool(toolName, parameters, runContext) {
    return this._sendRequest('executeTool', {
      toolName,
      parameters,
      runContext
    });
  }
  
  /**
   * Get data from worker
   * @param {string} key - Data key
   * @param {Object} params - Data parameters
   */
  async getData(key, params) {
    return this._sendRequest('getData', { key, params });
  }
  
  /**
   * Perform action on worker
   * @param {string} key - Action key
   * @param {Object} params - Action parameters
   */
  async performAction(key, params) {
    return this._sendRequest('performAction', { key, params });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a plugin loader
 * @param {PluginLoaderOptions} options - Loader options
 * @returns {PluginLoader}
 */
export function createPluginLoader(options) {
  return new PluginLoader(options);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  PluginLoader,
  PluginWorker,
  createPluginLoader,
  JSONRPC_ERROR_CODES
};
