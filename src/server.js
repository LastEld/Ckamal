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
import { ConnectionPool } from './db/connection/index.js';
import { MigrationRunner } from './db/migrations/index.js';

// Tools and Controllers
import { ToolRegistry } from './tools/index.js';
import { allTools } from './tools/definitions/index.js';
import { UnifiedController } from './controllers/unified.js';

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
      await this._initializeTools();
      await this._initializeAnalytics();
      await this._initializeAlertManager();

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
    logger.info('[Domains] Task and Roadmap domains initialized');
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
    logger.info('[Controller] Initializing unified controller...');
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
    logger.info('[Controller] Unified controller initialized');
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
      authEnabled: this._config.dashboard?.authEnabled !== false,
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

    const checks = {
      bios: biosStatus.state === 'OPERATIONAL',
      database: dbStats.total > 0,
      repositories: this._repositories?.isInitialized || false,
      tools: (this._tools?.count || 0) > 0,
      http: this._status === ServerStatus.RUNNING,
      websocket: this._wsServer ? this._wsServer.isRunning() : true,
      dashboard: this._dashboardServer ? true : true
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
        circuitBreakers: Array.from(this._circuitBreakers.keys())
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
