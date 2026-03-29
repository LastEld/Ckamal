#!/usr/bin/env node
/**
 * @fileoverview CogniMesh v5.0 - Main Server with Full Integration
 * @module server
 * @description MCP Server with complete system initialization and all components
 * @version 5.0.0
 */

import { createServer } from 'http';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import Database from 'better-sqlite3';

// Core BIOS and Config
import { CogniMeshBIOS, SystemState } from './bios/index.js';
import { createConfig, loadConfig, ConfigError } from './config.js';

// Database
import { RepositoryFactory } from './db/repositories/index.js';
import { ConnectionPool, setDb } from './db/connection/index.js';
import { MigrationRunner } from './db/migrations/index.js';

// Tools and Controllers
import { ToolRegistry } from './tools/index.js';
import { allTools } from './tools/definitions/index.js';
import { UnifiedController } from './controllers/unified.js';
import { IssuesController } from './controllers/issues-controller.js';
import { DocumentsController } from './controllers/documents-controller.js';
import { BillingController } from './controllers/billing-controller.js';
import { FinanceController } from './controllers/finance-controller.js';
import { BudgetPolicyController } from './controllers/budget-policy-controller.js';
import { AuthController } from './controllers/auth-controller.js';
import { CompanyController } from './controllers/company-controller.js';
import { HeartbeatController } from './controllers/heartbeat-controller.js';
import { ActivityController } from './controllers/activity-controller.js';
import { ApprovalsController } from './controllers/approvals-controller.js';
import { RoutinesController } from './controllers/routines-controller.js';
import { WebhooksController } from './controllers/webhooks-controller.js';
import { PluginsController } from './controllers/plugins-controller.js';
import { WorkspacesController } from './controllers/workspaces-controller.js';
import { WorkProductsController } from './controllers/work-products-controller.js';

// Plugin System
import { PluginRegistry, PluginLoader } from './plugins/index.js';

// Runtime and Activity
import { HeartbeatService, SessionManager } from './runtime/index.js';
import { ActivityService, getActivityService } from './domains/activity/index.js';

// WebSocket
import { WebSocketServer } from './websocket/server.js';

// Security
import { RateLimiter } from './security/rate-limiter.js';
import { SecurityAuditLogger } from './middleware/security-audit.js';

// Health
import { HealthChecker, HealthStatus } from './health/index.js';

// Dashboard
import { DashboardServer } from './dashboard/server.js';

// Alerts
import { AlertManager } from './alerts/manager.js';

// Domains
import { TaskDomain } from './domains/tasks/index.js';
import { RoadmapDomain } from './domains/roadmaps/index.js';

// Utilities
import { logger } from './utils/logger.js';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Server status enumeration
 * @readonly
 * @enum {string}
 */
export const ServerStatus = {
  INITIALIZING: 'initializing',
  BOOTING: 'booting',
  RUNNING: 'running',
  MAINTENANCE: 'maintenance',
  SHUTTING_DOWN: 'shutting_down',
  ERROR: 'error'
};

/**
 * CogniMesh Server - Main MCP Server class with full integration
 * @class CogniMeshServer
 * @extends EventEmitter
 */
export class CogniMeshServer extends EventEmitter {
  /**
   * Server version
   * @static
   * @type {string}
   */
  static VERSION = '5.0.0';

  /**
   * Creates a new CogniMesh Server instance
   * @param {Object} options - Server options
   */
  constructor(options = {}) {
    super();

    this._config = null;
    this._bios = null;
    this._tools = null;
    this._repositories = null;
    this._connectionPool = null;
    this._httpServer = null;
    this._wsServer = null;
    this._controller = null;
    this._status = ServerStatus.INITIALIZING;
    this._startTime = null;
    this._options = options;
    this._shuttingDown = false;

    // Additional integrated components
    this._rateLimiters = {};
    this._circuitBreakers = new Map();
    this._securityAudit = null;
    this._metricsMiddleware = null;
    this._authMiddleware = null;
    this._aclMiddleware = null;
    this._auditMiddleware = null;
    this._orchestrationMiddleware = null;
    this._middlewareModulePromise = null;
    this._processHandlers = [];

    // Dashboard and domain components
    this._dashboardServer = null;
    this._analytics = null;
    this._alertManager = null;
    this._taskDomain = null;
    this._roadmapDomain = null;
    
    // Runtime and Activity services
    this._heartbeatService = null;
    this._sessionManager = null;
    this._activityService = null;
    
    // Controllers
    this._heartbeatController = null;
    this._activityController = null;

    // Billing controller
    this._billingController = null;
    this._financeController = null;
    this._budgetPolicyController = null;
    this._issuesController = null;
    this._documentsController = null;

    // Approvals and Routines controllers
    this._approvalsController = null;
    this._routinesController = null;

    // Webhooks controller
    this._webhooksController = null;

    // Workspace and work product controllers
    this._workspacesController = null;
    this._workProductsController = null;

    // Plugin System
    this._pluginRegistry = null;
    this._pluginLoader = null;
    this._pluginsController = null;

    // Health checker
    this._healthChecker = new HealthChecker({
      server: this,
      version: CogniMeshServer.VERSION
    });

    // Setup signal handlers
    this._setupSignalHandlers();
  }

  // ==================== Getters ====================

  get status() { return this._status; }
  get config() { return this._config; }
  get bios() { return this._bios; }
  get tools() { return this._tools; }
  get repositories() { return this._repositories; }
  get wsServer() { return this._wsServer; }
  get dashboardServer() { return this._dashboardServer; }
  get analytics() { return this._analytics; }
  get alertManager() { return this._alertManager; }

  // ==================== Main Lifecycle ====================

  /**
   * Initialize the server with all components
   * @async
   * @returns {Promise<CogniMeshServer>} This server instance for chaining
   */
  async initialize() {
    try {
      this._status = ServerStatus.INITIALIZING;
      this._startTime = Date.now();
      this.emit('initializing');

      logger.info(`[CogniMesh v${CogniMeshServer.VERSION}] Initializing...`);

      // Phase 1: Core Infrastructure
      await this._initializeConfig();
      await this._initializeBIOS();
      await this._initializeSecurityAudit();

      // Phase 2: Database Layer
      await this._runMigrations();
      await this._initializeDatabase();
      await this._initializeRepositories();

      // Phase 3: Business Logic Layer
      await this._initializeDomains();
      await this._initializeRuntimeServices();
      await this._initializeActivityService();
      await this._initializeTools();
      await this._initializeAnalytics();
      await this._initializeAlertManager();
      await this._initializePluginSystem();

      // Phase 4: Middleware Layer
      await this._initializeRateLimiters();
      await this._initializeCircuitBreakers();
      await this._initializeAuthMiddleware();
      await this._initializeACL();
      await this._initializeAuditMiddleware();
      await this._initializeMetricsMiddleware();
      await this._initializeOrchestrationMiddleware();

      // Phase 5: Controllers and HTTP
      await this._initializeController();
      await this._initializeHttpServer();
      await this._initializeWebSocket();
      await this._initializeDashboard();

      // Phase 6: Final Setup
      await this._setupMiddleware();
      await this._registerComponents();
      await this._setupEventHandlers();

      const initTime = Date.now() - this._startTime;
      logger.info(`[CogniMesh] Initialization completed in ${initTime}ms`);
      this.emit('initialized');

      return this;
    } catch (error) {
      this._status = ServerStatus.ERROR;
      this.emit('initializationError', error);
      logger.error('[CogniMesh] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start the server
   * @async
   * @returns {Promise<CogniMeshServer>} This server instance
   */
  async start() {
    if (this._status === ServerStatus.RUNNING) {
      logger.warn('[Server] Already running');
      return this;
    }

    logger.info('[Server] Starting...');

    // Start main HTTP server
    await new Promise((resolve, reject) => {
      this._httpServer.listen(this._config.server.port, this._config.server.host, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    logger.info(`[Server] HTTP server listening on http://${this._config.server.host}:${this._config.server.port}`);

    // Start dashboard server if enabled
    if (this._dashboardServer && this._config.dashboard?.enabled !== false) {
      await this._dashboardServer.start();
      logger.info(`[Dashboard] Server started`);
    }

    this._status = ServerStatus.RUNNING;
    this.emit('started');

    logger.info('[CogniMesh] Server is now operational');

    return this;
  }

  /**
   * Stop the server gracefully
   * @async
   * @returns {Promise<void>}
   */
  async stop() {
    if (this._shuttingDown) {
      return;
    }

    this._shuttingDown = true;
    this._status = ServerStatus.SHUTTING_DOWN;
    this.emit('stopping');

    logger.info('[Server] Shutting down gracefully...');

    try {
      // Stop dashboard server
      if (this._dashboardServer) {
        try {
          logger.info('[Dashboard] Stopping server...');
          await this._dashboardServer.stop();
        } catch (error) {
          logger.error('[Dashboard] Error stopping:', error);
        }
      }

      // Stop WebSocket server
      if (this._wsServer) {
        try {
          logger.info('[WebSocket] Stopping server...');
          await this._wsServer.stop();
        } catch (error) {
          logger.error('[WebSocket] Error stopping:', error);
        }
      }

      // Close HTTP server
      if (this._httpServer) {
        logger.info('[HTTP] Closing server...');
        await new Promise((resolve) => {
          this._httpServer.close(resolve);
        });
      }

      // Close analytics
      if (this._analytics?._initialized) {
        try {
          logger.info('[Analytics] Closing...');
          await this._analytics.close();
        } catch (error) {
          logger.error('[Analytics] Error closing:', error);
        }
      }

      // Shutdown runtime services
      if (this._heartbeatService) {
        try {
          logger.info('[Runtime] Disposing heartbeat service...');
          await this._heartbeatService.dispose();
        } catch (error) {
          logger.error('[Runtime] Error disposing heartbeat service:', error);
        }
      }

      if (this._sessionManager) {
        try {
          logger.info('[Runtime] Disposing session manager...');
          await this._sessionManager.dispose();
        } catch (error) {
          logger.error('[Runtime] Error disposing session manager:', error);
        }
      }

      if (this._activityService) {
        try {
          logger.info('[Activity] Shutting down activity service...');
          await this._activityService.shutdown();
        } catch (error) {
          logger.error('[Activity] Error shutting down activity service:', error);
        }
      }

      // Shutdown Plugin System
      if (this._pluginLoader) {
        try {
          logger.info('[Plugins] Disposing plugin loader...');
          await this._pluginLoader.dispose();
        } catch (error) {
          logger.error('[Plugins] Error disposing plugin loader:', error);
        }
      }

      if (this._pluginRegistry) {
        try {
          logger.info('[Plugins] Disposing plugin registry...');
          await this._pluginRegistry.dispose();
        } catch (error) {
          logger.error('[Plugins] Error disposing plugin registry:', error);
        }
      }

      // Shutdown BIOS (will shutdown all registered components)
      if (this._bios) {
        logger.info('[BIOS] Shutting down...');
        await this._bios.shutdown();
      }

      this._status = ServerStatus.INITIALIZING;
      this.emit('stopped');

      logger.info('[CogniMesh] Server stopped');
    } finally {
      this._removeProcessHandlers();
    }
  }

  // ==================== Initialization Phases ====================

  async _initializeConfig() {
    logger.info('[Config] Loading configuration...');
    try {
      if (this._options.config) {
        this._config = createConfig(this._options.config);
      } else {
        this._config = await loadConfig(this._options);
      }
      logger.info('[Config] Configuration loaded successfully');
      logger.info(`[Config] Environment: ${this._config.server.env}`);
      logger.info(`[Config] Database: ${this._config.database?.path || 'default'}`);
    } catch (error) {
      if (error instanceof ConfigError) {
        logger.error('[Config] Configuration error:', error.message);
      }
      throw error;
    }
  }

  async _initializeBIOS() {
    logger.info('[BIOS] Initializing...');
    this._bios = new CogniMeshBIOS();

    this._bios.on('bios:boot:start', (data) => {
      logger.info(`[BIOS] Boot started (v${data.version})`);
      this.emit('bios:boot:start', data);
    });

    this._bios.on('bios:boot:complete', (data) => {
      logger.info(`[BIOS] Boot completed in ${data.duration}ms`);
      this.emit('bios:boot:complete', data);
    });

    this._bios.on('bios:boot:error', (error) => {
      logger.error('[BIOS] Boot error:', error.message);
      this.emit('bios:boot:error', error);
    });

    this._bios.on('system:critical', (error) => {
      logger.error('[BIOS] Critical error:', error.message);
      this.emit('system:critical', error);
    });

    const bootSuccess = await this._bios.boot({
      skipDiagnostics: this._options.skipDiagnostics
    });

    if (!bootSuccess) {
      throw new Error('BIOS boot sequence failed');
    }

    this._status = ServerStatus.BOOTING;
  }

  async _initializeSecurityAudit() {
    logger.info('[Security] Initializing security audit logger...');
    this._securityAudit = new SecurityAuditLogger({
      logDir: path.join(process.cwd(), 'logs', 'security')
    });
    await this._securityAudit.initialize();
    logger.info('[Security] Security audit logger initialized');
  }

  async _initializeDatabase() {
    logger.info('[Database] Initializing connection pool...');
    this._connectionPool = new ConnectionPool({
      databasePath: this._config.database.path,
      maxConnections: this._config.database.maxConnections,
      busyTimeout: this._config.database.busyTimeout
    });

    this._connectionPool.on('initialized', (data) => {
      logger.info(`[Database] Pool initialized with ${data.poolSize} connections`);
    });

    this._connectionPool.on('connectionError', (error) => {
      logger.error('[Database] Connection error:', error.message);
    });

    await this._connectionPool.initialize();
    
    // Set global database reference for components that need better-sqlite3
    this._db = new Database(this._config.database.path);
    setDb(this._db);
  }

  async _runMigrations() {
    logger.info('[Migrations] Running pending migrations...');
    mkdirSync(path.dirname(this._config.database.path), { recursive: true });

    const db = new Database(this._config.database.path);
    const runner = new MigrationRunner(db, {
      migrationsPath: path.join(__dirname, 'db', 'migrations')
    });

    try {
      const result = await runner.runMigrations();
      if (result.success) {
        logger.info(`[Migrations] Applied ${result.migrations.length} migrations (batch ${result.batch})`);
        for (const migration of result.migrations) {
          logger.info(`[Migrations]  - ${migration.name} (${migration.executionTime}ms)`);
        }
      }
    } finally {
      db.close();
    }
  }

  async _initializeRepositories() {
    logger.info('[Repositories] Initializing...');
    this._repositories = new RepositoryFactory({
      pool: this._connectionPool
    });
    await this._repositories.initialize();
    logger.info(`[Repositories] Initialized: ${this._repositories.available.join(', ')}`);
  }

  async _initializeDomains() {
    logger.info('[Domains] Initializing...');
    this._taskDomain = new TaskDomain({ repositories: this._repositories });
    this._roadmapDomain = new RoadmapDomain({ repositories: this._repositories });
    // Hydrate domain caches from SQLite
    await this._taskDomain.loadFromRepository();
    await this._roadmapDomain.loadFromRepository();
    logger.info('[Domains] Task and Roadmap domains initialized (persisted)');
  }

  async _initializeRuntimeServices() {
    logger.info('[Runtime] Initializing heartbeat service...');
    
    // Initialize Heartbeat Service
    this._heartbeatService = new HeartbeatService({
      db: this._connectionPool,
      config: {
        maxConcurrentRuns: this._config.runtime?.maxConcurrentRuns || 1,
        defaultTimeout: this._config.runtime?.defaultTimeout || 60000,
        maxRetries: this._config.runtime?.maxRetries || 3
      }
    });
    await this._heartbeatService.initialize();
    
    // Initialize Session Manager
    logger.info('[Runtime] Initializing session manager...');
    this._sessionManager = new SessionManager({
      db: this._connectionPool,
      config: {
        compaction: {
          enabled: true,
          maxSessionRuns: 10,
          maxRawInputTokens: 100000,
          maxSessionAgeHours: 24
        }
      }
    });
    await this._sessionManager.initialize();
    
    // Wire up session manager to heartbeat service
    this._heartbeatService.sessionManager = this._sessionManager;
    
    logger.info('[Runtime] Heartbeat service and session manager initialized');
  }

  async _initializeActivityService() {
    logger.info('[Activity] Initializing activity service...');
    
    this._activityService = getActivityService({
      db: this._db,
      connectionPool: this._connectionPool
    });
    await this._activityService.initialize();
    
    logger.info('[Activity] Activity service initialized');
  }

  async _initializeTools() {
    logger.info('[Tools] Initializing registry...');
    this._tools = new ToolRegistry();

    for (const tool of allTools) {
      try {
        this._tools.register(tool);
      } catch (error) {
        logger.warn(`[Tools] Failed to register '${tool.name}':`, error.message);
      }
    }

    logger.info(`[Tools] Registered ${this._tools.count} tools`);
  }

  async _initializeAnalytics() {
    logger.info('[Analytics] Initializing...');
    try {
      const { Analytics } = await import('./analytics/index.js');
      this._analytics = new Analytics({
        connectionPool: this._connectionPool,
        enabled: this._config.analytics?.enabled !== false
      });
      await this._analytics.init();
      logger.info('[Analytics] Initialized');
    } catch (error) {
      logger.warn('[Analytics] Optional analytics module unavailable, continuing without it:', error.message);
      this._analytics = {
        _initialized: false,
        async init() {},
        async close() {},
        async getCostStats() {
          return {};
        }
      };
    }
  }

  async _initializeAlertManager() {
    logger.info('[Alerts] Initializing alert manager...');
    this._alertManager = new AlertManager({
      analytics: this._analytics,
      autoCleanup: true
    });
    logger.info('[Alerts] Alert manager initialized');
  }

  async _initializePluginSystem() {
    logger.info('[Plugins] Initializing plugin system...');

    // Create plugin registry
    this._pluginRegistry = new PluginRegistry({
      db: this._db || this._connectionPool?.getConnection?.(),
      logger: logger,
      eventBus: this,
      pluginDir: this._config.plugins?.directory || './plugins',
      healthCheckInterval: this._config.plugins?.healthCheckInterval || 30000,
      maxRestarts: this._config.plugins?.maxRestarts || 5
    });

    // Create plugin loader
    this._pluginLoader = new PluginLoader({
      registry: this._pluginRegistry,
      logger: logger,
      rpcTimeout: this._config.plugins?.rpcTimeout || 30000
    });

    // Initialize registry
    await this._pluginRegistry.initialize();

    // Load plugins from configured directories
    await this._loadPluginsFromDirectories();

    // Register plugin tools with MCP tool registry
    await this._registerPluginTools();

    // Create plugins controller
    this._pluginsController = new PluginsController({
      registry: this._pluginRegistry,
      loader: this._pluginLoader,
      toolRegistry: this._tools,
      db: this._connectionPool?.getConnection?.() || this._db,
      logger: logger
    });
    await this._pluginsController.initialize();

    // Listen for plugin events
    this._pluginRegistry.on('activated', ({ pluginId }) => {
      logger.info(`[Plugins] Plugin activated: ${pluginId}`);
      this.emit('plugin:activated', { pluginId });
    });

    this._pluginRegistry.on('failed', ({ pluginId, error }) => {
      logger.error(`[Plugins] Plugin failed: ${pluginId}`, { error });
      this.emit('plugin:failed', { pluginId, error });
    });

    this._pluginRegistry.on('workerError', ({ pluginId, error }) => {
      logger.error(`[Plugins] Worker error for ${pluginId}:`, { error });
      this.emit('plugin:worker:error', { pluginId, error });
    });

    logger.info(`[Plugins] Plugin system initialized with ${this._pluginRegistry.plugins.size} plugins`);
  }

  async _loadPluginsFromDirectories() {
    const pluginDirs = this._config.plugins?.directories || ['./plugins'];
    const { readdir, stat } = await import('fs/promises');
    const { resolve } = await import('path');

    for (const dir of pluginDirs) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const pluginDir = resolve(dir, entry.name);
            const manifestPath = resolve(pluginDir, 'ckamal-plugin.json');
            
            try {
              await stat(manifestPath);
              // Try to load the plugin
              await this._pluginLoader.loadFromDirectory(pluginDir);
              logger.info(`[Plugins] Auto-loaded plugin from ${pluginDir}`);
            } catch (err) {
              // No manifest or failed to load, skip
              logger.debug(`[Plugins] Skipping ${pluginDir}: ${err.message}`);
            }
          }
        }
      } catch (error) {
        logger.debug(`[Plugins] Could not read plugin directory ${dir}: ${error.message}`);
      }
    }
  }

  async _registerPluginTools() {
    if (!this._tools || !this._pluginRegistry) return;

    // Create a dynamic tool wrapper for plugin tools
    const pluginToolHandler = async (toolName, params, context) => {
      // Parse plugin ID and tool name from format: plugin:{id}:{tool}
      const match = toolName.match(/^plugin:([^:]+):(.+)$/);
      if (!match) {
        throw new Error(`Invalid plugin tool format: ${toolName}`);
      }
      
      const [, pluginId, pluginToolName] = match;
      
      return this._pluginLoader.executeTool(
        pluginId,
        pluginToolName,
        params,
        context
      );
    };

    // The actual registration happens when plugins activate and register tools
    // This is handled via the plugin registry events
    this._pluginRegistry.on('activated', async ({ pluginId }) => {
      const plugin = this._pluginRegistry.getPlugin(pluginId);
      if (!plugin || !plugin.manifest?.tools) return;

      // Register each tool from the manifest
      for (const toolDecl of plugin.manifest.tools) {
        const fullToolName = `plugin:${pluginId}:${toolDecl.name}`;
        
        try {
          // Create tool definition
          const toolDef = {
            name: fullToolName,
            description: `[${plugin.name}] ${toolDecl.description}`,
            inputSchema: this._convertSchemaToZod(toolDecl.parametersSchema),
            outputSchema: { parse: (x) => x }, // Allow any output
            handler: async (params, context) => {
              return pluginToolHandler(fullToolName, params, context);
            },
            tags: ['plugin', pluginId, ...(toolDecl.tags || [])],
            requiresAuth: true
          };

          this._tools.register(toolDef);
          logger.info(`[Plugins] Registered tool: ${fullToolName}`);
        } catch (error) {
          logger.error(`[Plugins] Failed to register tool ${fullToolName}:`, error);
        }
      }
    });
  }

  /**
   * Convert JSON schema to Zod schema (simplified)
   * @private
   */
  _convertSchemaToZod(jsonSchema) {
    
    if (!jsonSchema || typeof jsonSchema !== 'object') {
      return z.object({});
    }

    if (jsonSchema.type === 'object') {
      const shape = {};
      for (const [key, prop] of Object.entries(jsonSchema.properties || {})) {
        shape[key] = this._convertSchemaToZod(prop);
      }
      
      let schema = z.object(shape);
      
      if (jsonSchema.required) {
        // Zod already makes all properties required by default
      }
      
      return schema;
    }

    if (jsonSchema.type === 'string') {
      let schema = z.string();
      if (jsonSchema.enum) {
        schema = z.enum(jsonSchema.enum);
      }
      return schema;
    }

    if (jsonSchema.type === 'number') {
      return z.number();
    }

    if (jsonSchema.type === 'integer') {
      return z.number().int();
    }

    if (jsonSchema.type === 'boolean') {
      return z.boolean();
    }

    if (jsonSchema.type === 'array') {
      return z.array(this._convertSchemaToZod(jsonSchema.items));
    }

    return z.any();
  }

  async _initializeRateLimiters() {
    logger.info('[RateLimiter] Initializing rate limiters...');
    
    // Default rate limiter
    this._rateLimiters.default = new RateLimiter({
      strategy: 'token_bucket',
      maxRequests: 100,
      windowMs: 60000,
      bucketSize: 100,
      refillRate: 1.67
    });

    // Auth rate limiter (stricter)
    this._rateLimiters.auth = new RateLimiter({
      strategy: 'token_bucket',
      maxRequests: 10,
      windowMs: 60000,
      bucketSize: 10,
      refillRate: 0.17
    });

    // Claude API rate limiter
    this._rateLimiters.claude = new RateLimiter({
      strategy: 'token_bucket',
      maxRequests: 50,
      windowMs: 60000,
      bucketSize: 50,
      refillRate: 0.83
    });

    logger.info('[RateLimiter] Rate limiters initialized: default, auth, claude');
  }

  async _initializeCircuitBreakers() {
    logger.info('[CircuitBreaker] Initializing circuit breakers...');
    const middleware = await this._loadMiddlewareModule();
    const CircuitBreaker = middleware?.CircuitBreaker;
    if (!CircuitBreaker) {
      logger.warn('[CircuitBreaker] Middleware module unavailable, skipping circuit breaker initialization');
      return;
    }
    
    // Create circuit breakers for external services
    const services = ['claude-api', 'kimi-api', 'codex-api', 'github-api'];
    for (const service of services) {
      const breaker = new CircuitBreaker(service, {
        failureThreshold: 5,
        resetTimeout: 30000,
        halfOpenMaxCalls: 3
      });
      this._circuitBreakers.set(service, breaker);
    }

    logger.info(`[CircuitBreaker] Initialized ${this._circuitBreakers.size} circuit breakers`);
  }

  async _initializeAuthMiddleware() {
    logger.info('[Middleware] Initializing auth middleware...');
    const middleware = await this._loadMiddlewareModule();
    if (!middleware?.getAuthMiddleware) {
      logger.warn('[Middleware] Auth middleware unavailable, continuing without it');
      this._authMiddleware = null;
      return;
    }

    this._authMiddleware = middleware.getAuthMiddleware({
      jwtSecret: this._config.security?.jwtSecret,
      mode: this._config.server?.env === 'production' ? 'strict' : 'standard'
    });
    logger.info('[Middleware] Auth middleware initialized');
  }

  async _initializeACL() {
    logger.info('[Middleware] Initializing ACL middleware...');
    const middleware = await this._loadMiddlewareModule();
    if (!middleware?.getACL) {
      logger.warn('[Middleware] ACL middleware unavailable, continuing without it');
      this._aclMiddleware = null;
      return;
    }

    this._aclMiddleware = middleware.getACL({
      defaultRole: 'user',
      strictMode: this._config.server?.env === 'production'
    });
    logger.info('[Middleware] ACL middleware initialized');
  }

  async _initializeAuditMiddleware() {
    logger.info('[Middleware] Initializing audit middleware...');
    const middleware = await this._loadMiddlewareModule();
    if (!middleware?.getAuditMiddleware) {
      logger.warn('[Middleware] Audit middleware unavailable, continuing without it');
      this._auditMiddleware = null;
      return;
    }

    this._auditMiddleware = middleware.getAuditMiddleware({
      securityAudit: this._securityAudit,
      logRequests: true,
      logResponses: true
    });
    logger.info('[Middleware] Audit middleware initialized');
  }

  async _initializeMetricsMiddleware() {
    logger.info('[Middleware] Initializing metrics middleware...');
    const middleware = await this._loadMiddlewareModule();
    if (!middleware?.getMetricsMiddleware) {
      logger.warn('[Middleware] Metrics middleware unavailable, continuing without it');
      this._metricsMiddleware = null;
      return;
    }

    this._metricsMiddleware = middleware.getMetricsMiddleware({
      collectDefaultMetrics: true,
      requestDurationBuckets: [0.1, 0.5, 1, 2, 5]
    });
    
    // Initialize new Prometheus monitoring service
    const { getMonitoringService } = await import('./monitoring/index.js');
    this._monitoring = getMonitoringService();
    logger.info('[Middleware] Metrics middleware initialized with Prometheus');
  }

  async _initializeOrchestrationMiddleware() {
    logger.info('[Middleware] Initializing orchestration middleware...');
    const middleware = await this._loadMiddlewareModule();
    if (!middleware?.getOrchestrationMiddleware) {
      logger.warn('[Middleware] Orchestration middleware unavailable, continuing without it');
      this._orchestrationMiddleware = null;
      return;
    }

    this._orchestrationMiddleware = middleware.getOrchestrationMiddleware({
      enablePipeline: true,
      enableTransforms: true
    });
    logger.info('[Middleware] Orchestration middleware initialized');
  }

  async _initializeController() {
    logger.info('[Controller] Initializing controllers...');
    
    this._controller = new UnifiedController({
      repositories: this._repositories,
      tools: this._tools,
      config: this._config,
      rateLimiters: this._rateLimiters,
      circuitBreakers: this._circuitBreakers,
      authMiddleware: this._authMiddleware,
      aclMiddleware: this._aclMiddleware,
      auditMiddleware: this._auditMiddleware
    });
    await this._controller.initialize();
    
    // Initialize Issues Controller
    this._issuesController = new IssuesController({
      repositories: this._repositories
    });
    await this._issuesController.initialize();
    
    // Initialize Documents Controller
    this._documentsController = new DocumentsController({
      repositories: this._repositories
    });
    await this._documentsController.initialize();

    // Controllers/services that use raw SQL expect better-sqlite3 semantics.
    // Prefer the direct DB handle over pooled sqlite3 connections.
    const directDb = this._db || this._connectionPool?.getConnection?.() || null;
    
    // Initialize Billing Controller
    this._billingController = new BillingController({
      repositories: this._repositories,
      db: directDb
    });
    await this._billingController.initialize();

    // Initialize Finance Controller
    this._financeController = new FinanceController({
      db: directDb
    });
    await this._financeController.initialize();

    // Initialize Budget Policy Controller
    this._budgetPolicyController = new BudgetPolicyController({
      db: directDb
    });
    await this._budgetPolicyController.initialize();
    
    // Initialize Auth Controller
    const { AuthService } = await import('./auth/auth-service.js');
    this._authService = new AuthService({ db: directDb });
    this._authController = new AuthController({
      authService: this._authService,
      db: directDb
    });
    
    // Initialize Company Controller
    this._companyController = new CompanyController({
      repositories: this._repositories,
      db: directDb
    });
    
    // Initialize Heartbeat Controller
    this._heartbeatController = new HeartbeatController({
      heartbeatService: this._heartbeatService,
      sessionManager: this._sessionManager,
      spawnManager: this._bios?.getSpawnManager?.(),
      wsServer: this._wsServer
    });
    await this._heartbeatController.initialize();
    
    // Initialize Activity Controller
    this._activityController = new ActivityController({
      activityService: this._activityService,
      wsServer: this._wsServer
    });
    await this._activityController.initialize();

    // Initialize Approvals Controller
    this._approvalsController = new ApprovalsController({
      db: directDb
    });

    // Initialize Routines Controller
    this._routinesController = new RoutinesController({
      db: directDb,
      logger: logger
    });

    // Initialize Webhooks Controller
    this._webhooksController = new WebhooksController({
      db: directDb,
      logger: logger
    });

    // Initialize Workspaces Controller
    this._workspacesController = new WorkspacesController({
      db: directDb
    });
    await this._workspacesController.initialize();

    // Initialize Work Products Controller
    this._workProductsController = new WorkProductsController({
      db: directDb
    });
    await this._workProductsController.initialize();
    
    logger.info('[Controller] All controllers initialized');
  }

  async _initializeHttpServer() {
    logger.info('[HTTP] Initializing server...');

    this._httpServer = createServer(async (req, res) => {
      // Apply security headers
      this._applySecurityHeaders(res);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', this._config.websocket?.corsOrigin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Set content type
      res.setHeader('Content-Type', 'application/json');

      // Request logging
      const startTime = Date.now();
      this._logRequest(req);

      // Route handling
      const handled = await this._handleRoute(req, res);
      
      if (!handled) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found', path: req.url }));
      }

      // Log response time
      const duration = Date.now() - startTime;
      logger.debug(`[HTTP] ${req.method} ${req.url} - ${duration}ms`);
    });

    logger.info(`[HTTP] Server initialized on ${this._config.server.host}:${this._config.server.port}`);
  }

  async _initializeWebSocket() {
    if (!this._config.websocket?.enabled) {
      logger.info('[WebSocket] WebSocket server disabled');
      return;
    }

    logger.info('[WebSocket] Initializing server...');

    this._wsServer = new WebSocketServer(this._httpServer, {
      authenticate: this._config.websocket.requireAuth,
      heartbeatInterval: this._config.websocket.heartbeatInterval,
      heartbeatTimeout: this._config.websocket.heartbeatInterval * 2
    });

    this._wsServer.on('connection', (socket) => {
      logger.debug(`[WebSocket] Client connected: ${socket.id}`);
      this.emit('ws:connection', socket);
    });

    this._wsServer.on('disconnect', (socket, code, reason) => {
      logger.debug(`[WebSocket] Client disconnected: ${socket.id} (code: ${code})`);
      this.emit('ws:disconnect', socket, code, reason);
    });

    this._wsServer.on('message', (socket, message) => {
      this._handleWebSocketMessage(socket, message);
    });

    await this._wsServer.start();
    logger.info(`[WebSocket] Server started on path ${this._config.websocket?.path || '/ws'}`);
  }

  async _initializeDashboard() {
    if (this._config.dashboard?.enabled === false) {
      logger.info('[Dashboard] Dashboard server disabled');
      return;
    }

    logger.info('[Dashboard] Initializing server...');

    this._dashboardServer = new DashboardServer({
      port: this._config.dashboard?.port || 3000,
      host: this._config.dashboard?.host || '0.0.0.0',
      jwtSecret: this._config.security?.jwtSecret,
      authEnabled: this._config.dashboard?.authEnabled ?? (process.env.NODE_ENV === 'production'),
      apiBaseUrl: `http://${this._config.server.host}:${this._config.server.port}`,
      taskDomain: this._taskDomain,
      roadmapDomain: this._roadmapDomain,
      alertManager: this._alertManager,
      analytics: this._analytics
    });

    logger.info('[Dashboard] Dashboard server initialized');
  }

  // ==================== Route Handling ====================

  async _handleRoute(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Health endpoints (no rate limiting)
    if (pathname === '/health' && req.method === 'GET') {
      return await this._handleHealthCheck(req, res);
    }
    if (pathname === '/health/ready' && req.method === 'GET') {
      return await this._handleReadiness(req, res);
    }
    if (pathname === '/health/live' && req.method === 'GET') {
      return await this._handleLiveness(req, res);
    }
    if (pathname === '/health/legacy' && req.method === 'GET') {
      return this._handleLegacyHealth(req, res);
    }

    // Apply rate limiting for other endpoints
    const rateLimitResult = await this._applyRateLimit(req, res, 'default');
    if (!rateLimitResult) return true; // Rate limit exceeded

    // Status endpoint
    if (pathname === '/status' && req.method === 'GET') {
      return this._handleStatus(req, res);
    }

    // Tools endpoint
    if (pathname === '/tools' && req.method === 'GET') {
      return this._handleToolsList(req, res);
    }

    // Metrics endpoint
    if (pathname === '/metrics' && req.method === 'GET') {
      return this._handleMetrics(req, res);
    }

    if (pathname === '/api/system' && req.method === 'GET') {
      return this._handleApiSystemStatus(req, res);
    }

    if (pathname === '/api/system/status' && req.method === 'GET') {
      return this._handleApiSystemStatus(req, res);
    }

    if (pathname === '/api/system/metrics' && req.method === 'GET') {
      return this._handleApiSystemMetrics(req, res);
    }

    if (pathname === '/api/agents' && req.method === 'GET') {
      return this._handleApiAgents(req, res);
    }

    // Issues API routes
    const issuesRoute = this._matchIssuesRoute(pathname, req.method);
    if (issuesRoute) {
      return await issuesRoute.handler(req, res, issuesRoute.params);
    }

    // Documents API routes
    const documentsRoute = this._matchDocumentsRoute(pathname, req.method);
    if (documentsRoute) {
      return await documentsRoute.handler(req, res, documentsRoute.params);
    }

    // Auth API routes
    const authRoute = this._matchAuthRoute(pathname, req.method);
    if (authRoute) {
      // Apply auth middleware if route requires authentication
      if (authRoute.requiresAuth) {
        const authResult = await this._applyAuthMiddleware(req, res);
        if (!authResult) return true; // Auth failed, response already sent
      } else {
        // Try to authenticate but don't require it
        await this._applyAuthMiddleware(req, res, { required: false });
      }
      return await authRoute.handler(req, res, authRoute.params);
    }

    // Company API routes
    const companyRoute = this._matchCompanyRoute(pathname, req.method);
    if (companyRoute) {
      // All company routes require authentication
      const authResult = await this._applyAuthMiddleware(req, res);
      if (!authResult) return true; // Auth failed, response already sent
      return await companyRoute.handler(req, res, companyRoute.params);
    }

    // Finance API routes
    if (pathname.startsWith('/api/finance')) {
      if (typeof this._financeController?.handle === 'function') {
        return await this._financeController.handle(req, res);
      }
    }

    // Budget policy API routes
    if (pathname.startsWith('/api/billing/policies') || pathname.startsWith('/api/billing/incidents')) {
      if (typeof this._budgetPolicyController?.handle === 'function') {
        return await this._budgetPolicyController.handle(req, res);
      }
    }

    // Billing API routes
    if (pathname.startsWith('/api/billing')) {
      if (typeof this._billingController?.handle === 'function') {
        return await this._billingController.handle(req, res);
      }
    }

    // Workspaces API routes
    if (pathname.startsWith('/api/workspaces')) {
      if (typeof this._workspacesController?.handle === 'function') {
        return await this._workspacesController.handle(req, res);
      }
    }

    // Work products API routes
    if (pathname.startsWith('/api/work-products')) {
      if (typeof this._workProductsController?.handle === 'function') {
        return await this._workProductsController.handle(req, res);
      }
    }

    // Heartbeat API routes
    if (pathname.startsWith('/api/heartbeat')) {
      if (typeof this._heartbeatController?.handle === 'function') {
        return await this._heartbeatController.handle(req, res);
      }
    }

    // Activity API routes
    if (pathname.startsWith('/api/activity')) {
      if (typeof this._activityController?.handle === 'function') {
        return await this._activityController.handle(req, res);
      }
    }

    // Approvals API routes
    if (pathname.startsWith('/api/approvals')) {
      if (typeof this._approvalsController?.handle === 'function') {
        return await this._approvalsController.handle(req, res);
      }
    }

    // Routines API routes
    if (pathname.startsWith('/api/routines')) {
      if (typeof this._routinesController?.handle === 'function') {
        return await this._routinesController.handle(req, res);
      }
    }

    // Webhooks API routes
    if (pathname.startsWith('/api/webhooks')) {
      if (typeof this._webhooksController?.handle === 'function') {
        return await this._webhooksController.handle(req, res);
      }
    }

    // Plugins API routes
    if (pathname.startsWith('/api/plugins')) {
      if (typeof this._pluginsController?.handle === 'function') {
        return await this._pluginsController.handle(req, res);
      }
    }

    // API routes via controller
    if (pathname.startsWith('/api/')) {
      if (typeof this._controller?.handle === 'function') {
        return await this._controller.handle(req, res);
      }
      return false;
    }

    return false;
  }

  _sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }

  /**
   * Match Issues API routes
   * @private
   */
  _matchIssuesRoute(pathname, method) {
    if (!this._issuesController) return null;

    const patterns = [
      // Issue CRUD
      { pattern: /^\/api\/issues$/, methods: { GET: 'listIssues', POST: 'createIssue' } },
      { pattern: /^\/api\/issues\/search$/, methods: { GET: 'searchIssues' } },
      { pattern: /^\/api\/issues\/statistics$/, methods: { GET: 'getStatistics' } },
      { pattern: /^\/api\/issues\/unread$/, methods: { GET: 'getUnreadIssues' } },
      { pattern: /^\/api\/issues\/labels$/, methods: { GET: 'listLabels', POST: 'createLabel' } },
      { pattern: /^\/api\/issues\/([^/]+)$/, methods: { GET: 'getIssue', PUT: 'updateIssue', DELETE: 'deleteIssue' }, params: ['id'] },
      
      // Comments
      { pattern: /^\/api\/issues\/([^/]+)\/comments$/, methods: { GET: 'listComments', POST: 'addComment' }, params: ['id'] },
      { pattern: /^\/api\/issues\/([^/]+)\/comments\/([^/]+)$/, methods: { PUT: 'updateComment', DELETE: 'deleteComment' }, params: ['id', 'commentId'] },
      
      // Labels
      { pattern: /^\/api\/issues\/([^/]+)\/labels$/, methods: { POST: 'addLabel' }, params: ['id'] },
      { pattern: /^\/api\/issues\/([^/]+)\/labels\/([^/]+)$/, methods: { DELETE: 'removeLabel' }, params: ['id', 'labelId'] },
      
      // Assignment
      { pattern: /^\/api\/issues\/([^/]+)\/assign$/, methods: { POST: 'assignIssue' }, params: ['id'] },
      
      // Read state
      { pattern: /^\/api\/issues\/([^/]+)\/read$/, methods: { POST: 'markAsRead' }, params: ['id'] },
    ];

    for (const route of patterns) {
      const match = pathname.match(route.pattern);
      if (match && route.methods[method]) {
        const params = {};
        if (route.params) {
          route.params.forEach((param, index) => {
            params[param] = match[index + 1];
          });
        }
        return {
          handler: this._issuesController[route.methods[method]].bind(this._issuesController),
          params
        };
      }
    }

    return null;
  }

  /**
   * Match Documents API routes
   * @private
   */
  _matchDocumentsRoute(pathname, method) {
    if (!this._documentsController) return null;

    const patterns = [
      // Document CRUD
      { pattern: /^\/api\/documents$/, methods: { GET: 'listDocuments', POST: 'createDocument' } },
      { pattern: /^\/api\/documents\/search$/, methods: { GET: 'searchDocuments' } },
      { pattern: /^\/api\/documents\/statistics$/, methods: { GET: 'getStatistics' } },
      { pattern: /^\/api\/documents\/([^/]+)$/, methods: { GET: 'getDocument', PUT: 'updateDocument', DELETE: 'deleteDocument' }, params: ['id'] },
      
      // Revisions
      { pattern: /^\/api\/documents\/([^/]+)\/revisions$/, methods: { GET: 'listRevisions' }, params: ['id'] },
      { pattern: /^\/api\/documents\/([^/]+)\/revisions\/([^/]+)$/, methods: { GET: 'getRevision' }, params: ['id', 'version'] },
      { pattern: /^\/api\/documents\/([^/]+)\/restore$/, methods: { POST: 'restoreDocument' }, params: ['id'] },
      { pattern: /^\/api\/documents\/([^/]+)\/restore\/([^/]+)$/, methods: { POST: 'restoreRevision' }, params: ['id', 'version'] },
      { pattern: /^\/api\/documents\/([^/]+)\/compare$/, methods: { GET: 'compareRevisions' }, params: ['id'] },
      
      // Sharing
      { pattern: /^\/api\/documents\/([^/]+)\/share$/, methods: { POST: 'shareDocument' }, params: ['id'] },
      { pattern: /^\/api\/documents\/([^/]+)\/shares$/, methods: { GET: 'listShares' }, params: ['id'] },
      { pattern: /^\/api\/documents\/([^/]+)\/shares\/([^/]+)$/, methods: { DELETE: 'revokeShare' }, params: ['id', 'shareId'] },
    ];

    for (const route of patterns) {
      const match = pathname.match(route.pattern);
      if (match && route.methods[method]) {
        const params = {};
        if (route.params) {
          route.params.forEach((param, index) => {
            params[param] = match[index + 1];
          });
        }
        return {
          handler: this._documentsController[route.methods[method]].bind(this._documentsController),
          params
        };
      }
    }

    return null;
  }

  /**
   * Match Auth API routes
   * @private
   */
  _matchAuthRoute(pathname, method) {
    if (!this._authController) return null;

    const patterns = [
      // Public Authentication
      { pattern: /^\/api\/auth\/register$/, methods: { POST: 'register' }, requiresAuth: false },
      { pattern: /^\/api\/auth\/login$/, methods: { POST: 'login' }, requiresAuth: false },
      { pattern: /^\/api\/auth\/refresh$/, methods: { POST: 'refresh' }, requiresAuth: false },
      { pattern: /^\/api\/auth\/forgot-password$/, methods: { POST: 'forgotPassword' }, requiresAuth: false },
      { pattern: /^\/api\/auth\/reset-password$/, methods: { POST: 'resetPassword' }, requiresAuth: false },
      
      // Protected Authentication
      { pattern: /^\/api\/auth\/logout$/, methods: { POST: 'logout' }, requiresAuth: true },
      
      // Profile
      { pattern: /^\/api\/auth\/me$/, methods: { GET: 'getMe', PUT: 'updateMe' }, requiresAuth: true },
      
      // API Keys
      { pattern: /^\/api\/auth\/api-keys$/, methods: { GET: 'listApiKeys', POST: 'createApiKey' }, requiresAuth: true },
      { pattern: /^\/api\/auth\/api-keys\/([^/]+)$/, methods: { DELETE: 'revokeApiKey' }, params: ['id'], requiresAuth: true },
    ];

    for (const route of patterns) {
      const match = pathname.match(route.pattern);
      if (match && route.methods[method]) {
        const params = {};
        if (route.params) {
          route.params.forEach((param, index) => {
            params[param] = match[index + 1];
          });
        }
        return {
          handler: this._authController[route.methods[method]].bind(this._authController),
          params,
          requiresAuth: route.requiresAuth
        };
      }
    }

    return null;
  }

  /**
   * Match Company API routes
   * @private
   */
  _matchCompanyRoute(pathname, method) {
    if (!this._companyController) return null;

    const patterns = [
      // Company CRUD
      { pattern: /^\/api\/companies$/, methods: { GET: 'listCompanies', POST: 'createCompany' } },
      { pattern: /^\/api\/companies\/([^/]+)$/, methods: { GET: 'getCompany', PUT: 'updateCompany', DELETE: 'deleteCompany' }, params: ['id'] },
      
      // Members
      { pattern: /^\/api\/companies\/([^/]+)\/members$/, methods: { GET: 'listMembers', POST: 'addMember' }, params: ['id'] },
      { pattern: /^\/api\/companies\/([^/]+)\/members\/([^/]+)$/, methods: { DELETE: 'removeMember', PUT: 'updateMember' }, params: ['id', 'userId'] },
    ];

    for (const route of patterns) {
      const match = pathname.match(route.pattern);
      if (match && route.methods[method]) {
        const params = {};
        if (route.params) {
          route.params.forEach((param, index) => {
            params[param] = match[index + 1];
          });
        }
        return {
          handler: this._companyController[route.methods[method]].bind(this._companyController),
          params
        };
      }
    }

    return null;
  }

  /**
   * Apply authentication middleware
   * @private
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Object} options - Auth options
   * @returns {Promise<boolean>} True if auth passed (or not required), false if auth failed
   */
  async _applyAuthMiddleware(req, res, options = { required: true }) {
    try {
      // Check for Authorization header
      const authHeader = req.headers['authorization'];
      const apiKey = req.headers['x-api-key'];

      if (!authHeader && !apiKey && options.required) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }));
        return false;
      }

      // Try to authenticate
      if (this._authService) {
        try {
          let authContext;
          
          if (apiKey) {
            authContext = await this._authService.validateApiKey(apiKey);
          } else if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            authContext = await this._authService.verifyAccessToken(token);
          } else {
            authContext = { authenticated: false };
          }

          req.auth = authContext;
        } catch (error) {
          if (options.required) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: error.message || 'Authentication failed',
              code: error.code || 'AUTH_FAILED'
            }));
            return false;
          }
          req.auth = { authenticated: false };
        }
      } else {
        // No auth service available
        if (options.required) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Authentication service unavailable',
            code: 'AUTH_UNAVAILABLE'
          }));
          return false;
        }
        req.auth = { authenticated: false };
      }

      return true;
    } catch (error) {
      if (options.required) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Authentication error',
          code: 'AUTH_ERROR'
        }));
        return false;
      }
      req.auth = { authenticated: false };
      return true;
    }
  }

  _getSystemSnapshot() {
    const health = this.getHealth();
    const biosStatus = this._bios?.getStatus() || null;

    return {
      ...health,
      bios: biosStatus,
    };
  }

  _getAgentSnapshot() {
    const biosStatus = this._bios?.getStatus() || null;
    const toolList = typeof this._tools?.list === 'function' ? this._tools.list() : [];
    const wsStats = this._wsServer?.getStats?.() || null;

    const agents = [];

    if (biosStatus) {
      agents.push({
        id: 'bios',
        name: 'BIOS',
        type: 'system',
        state: biosStatus.state,
        healthy: biosStatus.state === SystemState.OPERATIONAL,
        uptime: biosStatus.uptime,
        components: biosStatus.components || [],
        capabilities: biosStatus.capabilities || {},
      });
    }

    agents.push({
      id: 'tools',
      name: 'Tool Registry',
      type: 'registry',
      state: (this._tools?.count || 0) > 0 ? 'ready' : 'empty',
      healthy: (this._tools?.count || 0) > 0,
      count: this._tools?.count || 0,
      tools: toolList.map((tool) => tool.name),
    });

    if (this._wsServer) {
      agents.push({
        id: 'websocket',
        name: 'WebSocket',
        type: 'service',
        state: this._wsServer.isRunning() ? 'running' : 'stopped',
        healthy: this._wsServer.isRunning(),
        clients: this._wsServer.getClientCount?.() || 0,
        stats: wsStats,
      });
    }

    return {
      agents,
      total: agents.length,
      active: agents.filter((agent) => agent.healthy).length,
      timestamp: new Date().toISOString(),
    };
  }

  _handleApiSystemStatus(req, res) {
    this._sendJson(res, 200, this._getSystemSnapshot());
    return true;
  }

  _handleApiSystemMetrics(req, res) {
    const health = this.getHealth();
    const payload = {
      process: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime(),
      },
      server: {
        status: this._status,
        healthy: health.healthy,
        version: CogniMeshServer.VERSION,
        uptime: health.uptime,
      },
      bios: this._bios?.getStatus() || null,
      tools: {
        count: this._tools?.count || 0,
      },
      websocket: this._wsServer?.getStats?.() || null,
      timestamp: new Date().toISOString(),
    };

    this._sendJson(res, 200, payload);
    return true;
  }

  _handleApiAgents(req, res) {
    this._sendJson(res, 200, this._getAgentSnapshot());
    return true;
  }

  async _handleHealthCheck(req, res) {
    try {
      const health = await this._healthChecker.checkHealth();
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;
      res.writeHead(statusCode);
      res.end(JSON.stringify(health, null, 2));
    } catch (error) {
      res.writeHead(503);
      res.end(JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      }, null, 2));
    }
    return true;
  }

  async _handleReadiness(req, res) {
    try {
      const readiness = await this._healthChecker.checkReadiness();
      const statusCode = readiness.ready ? 200 : 503;
      res.writeHead(statusCode);
      res.end(JSON.stringify(readiness, null, 2));
    } catch (error) {
      res.writeHead(503);
      res.end(JSON.stringify({
        ready: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    return true;
  }

  _handleLiveness(req, res) {
    try {
      const liveness = this._healthChecker.checkLiveness();
      const statusCode = liveness.live ? 200 : 503;
      res.writeHead(statusCode);
      res.end(JSON.stringify(liveness, null, 2));
    } catch (error) {
      res.writeHead(503);
      res.end(JSON.stringify({
        live: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    return true;
  }

  _handleLegacyHealth(req, res) {
    const health = this.getHealth();
    res.writeHead(health.healthy ? 200 : 503);
    res.end(JSON.stringify(health, null, 2));
    return true;
  }

  _handleStatus(req, res) {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: this._status,
      version: CogniMeshServer.VERSION,
      uptime: Date.now() - this._startTime,
      bios: this._bios?.getStatus(),
      timestamp: new Date().toISOString()
    }, null, 2));
    return true;
  }

  _handleToolsList(req, res) {
    res.writeHead(200);
    res.end(JSON.stringify({
      tools: this._tools.list(),
      count: this._tools.count,
      stats: this._tools.getStats()
    }, null, 2));
    return true;
  }

  async _handleMetrics(req, res) {
    try {
      if (this._monitoring) {
        // Use Prometheus monitoring service
        const metrics = await this._monitoring.getMetrics();
        res.writeHead(200, { 'Content-Type': this._monitoring.getContentType() });
        res.end(metrics);
      } else {
        // Fallback to legacy metrics
        const metrics = this._metricsMiddleware?.getMetrics?.() || {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metrics, null, 2));
      }
    } catch (error) {
      logger.error('[Metrics] Error collecting metrics:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Failed to collect metrics',
        message: error.message
      }, null, 2));
    }
    return true;
  }

  // ==================== WebSocket Handlers ====================

  async _handleWebSocketMessage(socket, message) {
    switch (message.type) {
      case 'execute_tool':
        await this._handleToolExecution(socket, message);
        break;
      case 'get_status':
        this._wsServer.sendToClient(socket.id, {
          type: 'status',
          data: this.getHealth()
        });
        break;
      case 'subscribe':
        if (message.channel) {
          socket.subscribe(message.channel);
          this._wsServer.sendToClient(socket.id, {
            type: 'subscribed',
            channel: message.channel
          });
        }
        break;
      default:
        this._wsServer.sendToClient(socket.id, {
          type: 'error',
          message: `Unknown message type: ${message.type}`
        });
    }
  }

  async _handleToolExecution(socket, message) {
    const { toolName, params, requestId } = message;

    try {
      // Apply rate limiting per socket
      const rateLimitKey = `ws:${socket.id}`;
      const rateLimitResult = await this._rateLimiters.default.consume(rateLimitKey);
      
      if (!rateLimitResult.allowed) {
        this._wsServer.sendToClient(socket.id, {
          type: 'rate_limited',
          requestId,
          retryAfter: rateLimitResult.retryAfter
        });
        return;
      }

      const result = await this._tools.execute(toolName, params, {
        userId: socket.userId,
        socketId: socket.id
      });

      this._wsServer.sendToClient(socket.id, {
        type: 'tool_result',
        requestId,
        result
      });
    } catch (error) {
      this._wsServer.sendToClient(socket.id, {
        type: 'tool_error',
        requestId,
        error: error.message
      });
    }
  }

  // ==================== Setup and Utilities ====================

  async _setupMiddleware() {
    logger.info('[Middleware] Setting up global middleware...');

    this._registerProcessHandler('uncaughtException', (error) => {
      logger.error('[Error] Uncaught exception:', error);
      this.emit('error', error);
      this._gracefulShutdown(1);
    });

    this._registerProcessHandler('unhandledRejection', (reason, promise) => {
      logger.error('[Error] Unhandled rejection at:', promise, 'reason:', reason);
      this.emit('error', new Error(`Unhandled rejection: ${reason}`));
    });

    logger.info('[Middleware] Global middleware setup complete');
  }

  async _setupEventHandlers() {
    // Setup alert event handlers
    if (this._alertManager) {
      this._alertManager.on('alertCreated', ({ alert }) => {
        this.emit('alert:created', alert);
        if (alert.priority === 'CRITICAL') {
          logger.error(`[Alert] CRITICAL: ${alert.message}`);
        }
      });

      this._alertManager.on('alertEscalated', ({ alert }) => {
        this.emit('alert:escalated', alert);
        logger.warn(`[Alert] Escalated: ${alert.message}`);
      });
    }
  }

  async _registerComponents() {
    logger.info('[BIOS] Registering components...');

    this._bios.registerComponent('connectionPool', {
      type: 'database',
      initialize: async () => true,
      healthCheck: async () => {
        const stats = this._connectionPool.getStats();
        return {
          healthy: stats.total > 0,
          message: `Pool: ${stats.total} connections (${stats.inUse} in use)`,
          stats
        };
      },
      shutdown: async () => {
        await this._connectionPool.close();
      }
    });

    this._bios.registerComponent('repositories', {
      type: 'storage',
      initialize: async () => this._repositories.isInitialized,
      healthCheck: async () => ({
        healthy: this._repositories.isInitialized,
        message: `Repositories: ${this._repositories.available.join(', ')}`
      }),
      shutdown: async () => {
        await this._repositories.close();
      }
    });

    this._bios.registerComponent('tools', {
      type: 'registry',
      initialize: async () => this._tools.count > 0,
      healthCheck: async () => ({
        healthy: this._tools.count > 0,
        message: `Tools registered: ${this._tools.count}`,
        stats: this._tools.getStats()
      }),
      shutdown: async () => {
        this._tools.clear();
      }
    });

    if (this._wsServer) {
      this._bios.registerComponent('websocket', {
        type: 'server',
        initialize: async () => this._wsServer.isRunning(),
        healthCheck: async () => ({
          healthy: this._wsServer.isRunning(),
          message: `Clients: ${this._wsServer.getClientCount()}, Rooms: ${this._wsServer.getRooms().length}`,
          stats: this._wsServer.getStats()
        }),
        shutdown: async () => {
          await this._wsServer.stop();
        }
      });
    }

    if (this._dashboardServer) {
      this._bios.registerComponent('dashboard', {
        type: 'server',
        initialize: async () => true,
        healthCheck: async () => ({
          healthy: true,
          message: 'Dashboard server running'
        }),
        shutdown: async () => {
          await this._dashboardServer.stop();
        }
      });
    }

    if (this._analytics) {
      this._bios.registerComponent('analytics', {
        type: 'service',
        initialize: async () => this._analytics._initialized,
        healthCheck: async () => ({
          healthy: this._analytics._initialized,
          message: 'Analytics service active'
        }),
        shutdown: async () => {
          await this._analytics.close();
        }
      });
    }

    if (this._heartbeatService) {
      this._bios.registerComponent('heartbeatService', {
        type: 'service',
        initialize: async () => true,
        healthCheck: async () => ({
          healthy: true,
          message: 'Heartbeat service active',
          stats: {
            activeRuns: this._heartbeatService.activeRuns?.size || 0
          }
        }),
        shutdown: async () => {
          await this._heartbeatService.dispose();
        }
      });
    }

    if (this._sessionManager) {
      this._bios.registerComponent('sessionManager', {
        type: 'service',
        initialize: async () => true,
        healthCheck: async () => ({
          healthy: true,
          message: 'Session manager active'
        }),
        shutdown: async () => {
          await this._sessionManager.dispose();
        }
      });
    }

    if (this._activityService) {
      this._bios.registerComponent('activityService', {
        type: 'service',
        initialize: async () => true,
        healthCheck: async () => ({
          healthy: true,
          message: 'Activity service active'
        }),
        shutdown: async () => {
          await this._activityService.shutdown();
        }
      });
    }

    // Register plugin system with BIOS
    if (this._pluginRegistry) {
      this._bios.registerPluginSystem({
        registry: this._pluginRegistry,
        loader: this._pluginLoader
      });
      logger.info('[BIOS] Plugin system registered');
    }

    logger.info('[BIOS] All components registered');
  }

  _applySecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Powered-By', 'CogniMesh v5.0');
  }

  _logRequest(req) {
    this._securityAudit?.log('request:received', {
      method: req.method,
      url: req.url,
      ip: req.socket?.remoteAddress,
      userAgent: req.headers['user-agent']
    });
  }

  async _loadMiddlewareModule() {
    if (!this._middlewareModulePromise) {
      this._middlewareModulePromise = import('./middleware/index.js').catch((error) => {
        logger.warn('[Middleware] Optional middleware bundle unavailable:', error.message);
        return null;
      });
    }

    return this._middlewareModulePromise;
  }

  async _applyRateLimit(req, res, preset = 'default') {
    if (!this._rateLimiters[preset]) {
      return true;
    }

    const key = req.socket?.remoteAddress || 'unknown';
    const result = await this._rateLimiters[preset].consume(key);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.reset / 1000));

    if (!result.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Too many requests',
        retryAfter: result.retryAfter || 60
      }));
      return false;
    }

    return true;
  }

  _setupSignalHandlers() {
    const shutdown = (signal) => {
      logger.info(`[Signal] Received ${signal}, initiating graceful shutdown...`);
      this._gracefulShutdown(0);
    };

    this._registerProcessHandler('SIGINT', () => shutdown('SIGINT'));
    this._registerProcessHandler('SIGTERM', () => shutdown('SIGTERM'));

    if (process.platform === 'win32') {
      this._registerProcessHandler('SIGBREAK', () => shutdown('SIGBREAK'));
    }
  }

  _registerProcessHandler(event, handler) {
    const existing = this._processHandlers.find((entry) => entry.event === event);
    if (existing) {
      process.off(event, existing.handler);
      existing.handler = handler;
      process.on(event, handler);
      return;
    }

    this._processHandlers.push({ event, handler });
    process.on(event, handler);
  }

  _removeProcessHandlers() {
    for (const { event, handler } of this._processHandlers) {
      process.off(event, handler);
    }
    this._processHandlers = [];
  }

  async _gracefulShutdown(exitCode = 0) {
    try {
      await this.stop();
      process.exit(exitCode);
    } catch (error) {
      logger.error('[Shutdown] Error during shutdown:', error);
      process.exit(1);
    }
  }

  // ==================== Public API ====================

  getHealth() {
    const biosStatus = this._bios?.getStatus() || { state: 'unknown' };
    const dbStats = this._connectionPool?.getStats() || { total: 0, inUse: 0, available: 0 };
    const wsStats = this._wsServer?.getStats() || { clients: 0, rooms: 0 };
    const pluginStatus = this._bios?.getPluginSystemStatus();

    const checks = {
      bios: biosStatus.state === 'OPERATIONAL',
      database: dbStats.total > 0,
      repositories: this._repositories?.isInitialized || false,
      tools: (this._tools?.count || 0) > 0,
      http: this._status === ServerStatus.RUNNING,
      websocket: this._wsServer ? this._wsServer.isRunning() : true,
      dashboard: this._dashboardServer ? true : true,
      plugins: pluginStatus ? true : true // Optional component
    };

    const healthy = Object.values(checks).every(check => check);

    return {
      healthy,
      status: this._status,
      version: CogniMeshServer.VERSION,
      uptime: this._startTime ? Date.now() - this._startTime : 0,
      timestamp: new Date().toISOString(),
      checks,
      components: {
        bios: {
          state: biosStatus.state,
          uptime: biosStatus.uptime,
          components: biosStatus.components?.length || 0
        },
        database: dbStats,
        tools: {
          registered: this._tools?.count || 0
        },
        websocket: wsStats,
        rateLimiters: Object.keys(this._rateLimiters),
        circuitBreakers: Array.from(this._circuitBreakers.keys()),
        plugins: pluginStatus || null
      }
    };
  }

  /**
   * Get circuit breaker by name
   * @param {string} name - Circuit breaker name
   * @returns {CircuitBreaker|null}
   */
  getCircuitBreaker(name) {
    return this._circuitBreakers.get(name) || null;
  }

  /**
   * Get all circuit breakers status
   * @returns {Array<{name: string, state: string}>}
   */
  getAllCircuitBreakerStates() {
    return Array.from(this._circuitBreakers.entries()).map(([name, breaker]) => ({
      name,
      state: breaker.state
    }));
  }
}

/**
 * Create and start a server instance
 * @param {Object} options - Server options
 * @returns {Promise<CogniMeshServer>} Running server instance
 */
export async function createAndStartServer(options = {}) {
  const server = new CogniMeshServer(options);
  await server.initialize();
  await server.start();
  return server;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const server = new CogniMeshServer();
      await server.initialize();
      await server.start();

      server.on('stopped', () => {
        process.exit(0);
      });
    } catch (error) {
      console.error('[Fatal] Server failed to start:', error);
      process.exit(1);
    }
  })();
}

export default CogniMeshServer;
