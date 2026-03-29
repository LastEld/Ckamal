/**
 * @fileoverview Plugins REST API Controller
 * HTTP endpoints for plugin management
 * @module controllers/plugins-controller
 */

import { formatResponse, formatListResponse, handleError, parsePagination } from './helpers.js';
import { validateManifest } from '../plugins/plugin-sdk.js';

/**
 * Plugins Controller - REST API endpoints for plugin lifecycle management
 */
export class PluginsController {
  /**
   * @param {Object} options
   * @param {import('../plugins/plugin-registry.js').PluginRegistry} options.registry - Plugin registry
   * @param {import('../plugins/plugin-loader.js').PluginLoader} options.loader - Plugin loader
   * @param {import('../tools/index.js').ToolRegistry} options.toolRegistry - Tool registry for MCP integration
   * @param {Object} options.db - Database connection
   * @param {Object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.registry = options.registry || null;
    this.loader = options.loader || null;
    this.toolRegistry = options.toolRegistry || null;
    this.db = options.db || null;
    this.logger = options.logger || console;
  }

  /**
   * Initialize controller
   */
  async initialize() {
    this.logger.info('[PluginsController] Initialized');
  }

  /**
   * Main request handler for plugin routes
   * @param {Object} req - HTTP request
   * @param {Object} res - HTTP response
   * @returns {Promise<boolean>} - Whether request was handled
   */
  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method;

    // Match routes
    const route = this._matchRoute(pathname, method);
    if (route) {
      try {
        return await route.handler(req, res, route.params);
      } catch (error) {
        this._sendJson(res, 500, handleError(error));
        return true;
      }
    }

    return false;
  }

  /**
   * Match route patterns
   * @private
   */
  _matchRoute(pathname, method) {
    const patterns = [
      // Plugin CRUD
      { pattern: /^\/api\/plugins$/, methods: { GET: 'listPlugins', POST: 'installPlugin' } },
      { pattern: /^\/api\/plugins\/([^/]+)$/, methods: { GET: 'getPlugin', PUT: 'updatePlugin', DELETE: 'uninstallPlugin' }, params: ['id'] },
      
      // Plugin lifecycle
      { pattern: /^\/api\/plugins\/([^/]+)\/enable$/, methods: { POST: 'enablePlugin' }, params: ['id'] },
      { pattern: /^\/api\/plugins\/([^/]+)\/disable$/, methods: { POST: 'disablePlugin' }, params: ['id'] },
      
      // Plugin logs
      { pattern: /^\/api\/plugins\/([^/]+)\/logs$/, methods: { GET: 'getPluginLogs' }, params: ['id'] },
      
      // Plugin tool execution
      { pattern: /^\/api\/plugins\/([^/]+)\/tools\/([^/]+)$/, methods: { POST: 'executeTool' }, params: ['id', 'toolId'] },
    ];

    for (const route of patterns) {
      const match = pathname.match(route.pattern);
      if (match && route.methods[method]) {
        const params = {};
        if (route.params) {
          route.params.forEach((param, index) => {
            params[param] = decodeURIComponent(match[index + 1]);
          });
        }
        return {
          handler: this[route.methods[method]].bind(this),
          params
        };
      }
    }

    return null;
  }

  // ============================================================================
  // PLUGIN CRUD
  // ============================================================================

  /**
   * GET /api/plugins - List installed plugins
   */
  async listPlugins(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      
      const filters = {
        status: url.searchParams.get('status') || undefined,
        ...parsePagination(Object.fromEntries(url.searchParams))
      };

      const plugins = this.registry.getAllPlugins(filters);
      
      // Enhance with additional metadata
      const enhancedPlugins = plugins.map(p => ({
        id: p.id,
        version: p.version,
        name: p.name,
        description: p.description,
        author: p.author,
        license: p.license,
        status: p.status,
        capabilities: p.capabilities,
        installedAt: p.installedAt?.toISOString(),
        activatedAt: p.activatedAt?.toISOString(),
        restartCount: p.restartCount,
        errorMessage: p.errorMessage
      }));

      this._sendJson(res, 200, formatListResponse(enhancedPlugins, {
        total: enhancedPlugins.length
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * POST /api/plugins - Install plugin
   */
  async installPlugin(req, res) {
    try {
      const body = await this._parseBody(req);
      
      // Validate required fields
      if (!body.manifest && !body.manifestPath) {
        return this._sendJson(res, 400, {
          success: false,
          error: 'Either manifest or manifestPath is required',
          code: 'VALIDATION_ERROR'
        });
      }

      let manifest;
      let manifestPath;

      if (body.manifestPath) {
        // Load from path
        const { readFile } = await import('fs/promises');
        const content = await readFile(body.manifestPath, 'utf-8');
        manifest = JSON.parse(content);
        manifestPath = body.manifestPath;
      } else {
        manifest = body.manifest;
        manifestPath = body.manifestPath || `./plugins/${manifest.id}/ckamal-plugin.json`;
      }

      // Validate manifest
      const validation = validateManifest(manifest);
      if (!validation.valid) {
        return this._sendJson(res, 400, {
          success: false,
          error: `Invalid manifest: ${validation.errors.join(', ')}`,
          code: 'VALIDATION_ERROR'
        });
      }

      // Check if plugin already exists
      const existing = this.registry.getPlugin(manifest.id);
      if (existing) {
        return this._sendJson(res, 409, {
          success: false,
          error: `Plugin ${manifest.id} is already registered`,
          code: 'PLUGIN_EXISTS'
        });
      }

      // Register plugin
      const plugin = await this.registry.registerPlugin({
        manifestPath,
        manifest,
        source: body.source || 'local'
      });

      // Auto-start if requested
      if (body.autoStart !== false) {
        await this.registry.startPlugin(plugin.id, body.config);
        
        // Spawn worker if loader available
        if (this.loader) {
          await this.loader._spawnWorker(plugin, manifest);
        }
      }

      this._sendJson(res, 201, formatResponse({
        id: plugin.id,
        version: plugin.version,
        name: plugin.name,
        status: plugin.status,
        message: 'Plugin installed successfully'
      }));
    } catch (error) {
      this.logger.error('[PluginsController] Install failed:', error);
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * GET /api/plugins/:id - Get plugin details
   */
  async getPlugin(req, res, params) {
    try {
      const { id } = params;
      const plugin = this.registry.getPlugin(id);

      if (!plugin) {
        return this._sendJson(res, 404, {
          success: false,
          error: 'Plugin not found',
          code: 'NOT_FOUND'
        });
      }

      // Get worker info if available
      const worker = this.registry.getWorker(id);
      const config = this.registry.getPluginConfig(id);

      const details = {
        id: plugin.id,
        version: plugin.version,
        name: plugin.name,
        description: plugin.description,
        author: plugin.author,
        license: plugin.license,
        status: plugin.status,
        capabilities: plugin.capabilities,
        manifestPath: plugin.manifestPath,
        workerPath: plugin.workerPath,
        uiPath: plugin.uiPath,
        config: config,
        configSchema: plugin.configSchema ? JSON.parse(plugin.configSchema) : null,
        installedAt: plugin.installedAt?.toISOString(),
        activatedAt: plugin.activatedAt?.toISOString(),
        lastErrorAt: plugin.lastErrorAt?.toISOString(),
        restartCount: plugin.restartCount,
        errorMessage: plugin.errorMessage,
        worker: worker ? {
          isInitialized: worker.isInitialized,
          isTerminated: worker.isTerminated
        } : null
      };

      this._sendJson(res, 200, formatResponse(details));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * PUT /api/plugins/:id - Update plugin config
   */
  async updatePlugin(req, res, params) {
    try {
      const { id } = params;
      const body = await this._parseBody(req);

      const plugin = this.registry.getPlugin(id);
      if (!plugin) {
        return this._sendJson(res, 404, {
          success: false,
          error: 'Plugin not found',
          code: 'NOT_FOUND'
        });
      }

      // Update config if provided
      if (body.config) {
        await this.registry.updatePluginConfig(id, body.config, {
          validate: body.validate !== false
        });
      }

      // Update other fields if needed
      if (body.restart === true) {
        if (this.loader) {
          await this.loader.reloadPlugin(id);
        }
      }

      this._sendJson(res, 200, formatResponse({
        id,
        message: 'Plugin updated successfully'
      }));
    } catch (error) {
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * DELETE /api/plugins/:id - Uninstall plugin
   */
  async uninstallPlugin(req, res, params) {
    try {
      const { id } = params;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const purgeData = url.searchParams.get('purgeData') === 'true';

      const plugin = this.registry.getPlugin(id);
      if (!plugin) {
        return this._sendJson(res, 404, {
          success: false,
          error: 'Plugin not found',
          code: 'NOT_FOUND'
        });
      }

      // Unload via loader if available
      if (this.loader) {
        await this.loader.unloadPlugin(id, { purgeData });
      } else {
        await this.registry.unregisterPlugin(id, { purgeData });
      }

      this._sendJson(res, 200, formatResponse({
        id,
        uninstalled: true,
        purgeData
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // PLUGIN LIFECYCLE
  // ============================================================================

  /**
   * POST /api/plugins/:id/enable - Enable plugin
   */
  async enablePlugin(req, res, params) {
    try {
      const { id } = params;

      const plugin = this.registry.getPlugin(id);
      if (!plugin) {
        return this._sendJson(res, 404, {
          success: false,
          error: 'Plugin not found',
          code: 'NOT_FOUND'
        });
      }

      if (plugin.status === 'active') {
        return this._sendJson(res, 200, formatResponse({
          id,
          status: plugin.status,
          message: 'Plugin is already active'
        }));
      }

      await this.registry.startPlugin(id);

      // Spawn worker if loader available
      if (this.loader) {
        const { readFile } = await import('fs/promises');
        const manifestContent = await readFile(plugin.manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);
        await this.loader._spawnWorker(plugin, manifest);
      }

      this._sendJson(res, 200, formatResponse({
        id,
        status: 'active',
        message: 'Plugin enabled successfully'
      }));
    } catch (error) {
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * POST /api/plugins/:id/disable - Disable plugin
   */
  async disablePlugin(req, res, params) {
    try {
      const { id } = params;
      const body = await this._parseBody(req).catch(() => ({}));

      const plugin = this.registry.getPlugin(id);
      if (!plugin) {
        return this._sendJson(res, 404, {
          success: false,
          error: 'Plugin not found',
          code: 'NOT_FOUND'
        });
      }

      if (plugin.status !== 'active') {
        return this._sendJson(res, 200, formatResponse({
          id,
          status: plugin.status,
          message: 'Plugin is not active'
        }));
      }

      await this.registry.stopPlugin(id, {
        graceful: body.graceful !== false,
        timeout: body.timeout || 10000
      });

      this._sendJson(res, 200, formatResponse({
        id,
        status: 'terminated',
        message: 'Plugin disabled successfully'
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // PLUGIN LOGS
  // ============================================================================

  /**
   * GET /api/plugins/:id/logs - Get plugin logs
   */
  async getPluginLogs(req, res, params) {
    try {
      const { id } = params;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      const plugin = this.registry.getPlugin(id);
      if (!plugin) {
        return this._sendJson(res, 404, {
          success: false,
          error: 'Plugin not found',
          code: 'NOT_FOUND'
        });
      }

      // Get logs from database
      const limit = parseInt(url.searchParams.get('limit')) || 100;
      const level = url.searchParams.get('level');

      let logs = [];
      if (this.db) {
        let query = 'SELECT * FROM plugin_logs WHERE plugin_id = ?';
        const args = [id];

        if (level) {
          query += ' AND level = ?';
          args.push(level);
        }

        query += ' ORDER BY timestamp DESC LIMIT ?';
        args.push(limit);

        const stmt = this.db.prepare(query);
        logs = stmt.all(...args);
      }

      this._sendJson(res, 200, formatListResponse(logs, { total: logs.length }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // PLUGIN TOOLS
  // ============================================================================

  /**
   * POST /api/plugins/:id/tools/:toolId - Execute plugin tool
   */
  async executeTool(req, res, params) {
    try {
      const { id, toolId } = params;
      const body = await this._parseBody(req);

      const plugin = this.registry.getPlugin(id);
      if (!plugin) {
        return this._sendJson(res, 404, {
          success: false,
          error: 'Plugin not found',
          code: 'NOT_FOUND'
        });
      }

      if (plugin.status !== 'active') {
        return this._sendJson(res, 400, {
          success: false,
          error: `Plugin is not active (status: ${plugin.status})`,
          code: 'PLUGIN_NOT_ACTIVE'
        });
      }

      if (!this.loader) {
        return this._sendJson(res, 503, {
          success: false,
          error: 'Plugin loader not available',
          code: 'LOADER_UNAVAILABLE'
        });
      }

      // Execute the tool
      const result = await this.loader.executeTool(
        id,
        toolId,
        body.parameters || {},
        {
          agentId: body.agentId || 'api',
          runId: body.runId || `run_${Date.now()}`,
          projectId: body.projectId || 'default',
          userId: body.userId || 'anonymous',
          conversationId: body.conversationId
        }
      );

      this._sendJson(res, 200, formatResponse(result));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Parse request body
   * @private
   */
  _parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(new Error('Invalid JSON in request body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Get user ID from request
   * @private
   */
  _getUserId(req) {
    return req.auth?.userId || req.auth?.id || null;
  }

  /**
   * Get company ID from request
   * @private
   */
  _getCompanyId(req) {
    return req.auth?.companyId || req.headers['x-company-id'] || null;
  }

  /**
   * Send JSON response
   * @private
   */
  _sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
    return true;
  }
}

export default PluginsController;
