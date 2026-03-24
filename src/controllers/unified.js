/**
 * @fileoverview Unified MCP Tool Handler
 * Central controller for registering and executing MCP tools with middleware support.
 * @module controllers/unified
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import crypto from 'crypto';
import { performance } from 'perf_hooks';

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name - Tool name
 * @property {Function} handler - Tool handler function
 * @property {z.ZodSchema} [schema] - Zod validation schema
 * @property {string} [description] - Tool description
 * @property {string[]} [tags] - Tool tags
 */

/**
 * @typedef {Object} ToolContext
 * @property {string} toolName - Name of the executing tool
 * @property {Object} params - Tool parameters
 * @property {number} timestamp - Execution timestamp
 * @property {string} [requestId] - Unique request ID
 */

/**
 * @typedef {Function} MiddlewareFunction
 * @param {ToolContext} context - Execution context
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */

/**
 * Schema for tool registration
 * @const {z.ZodSchema}
 */
const toolRegistrationSchema = z.object({
  name: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  handler: z.function(),
  schema: z.instanceof(z.ZodSchema).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Schema for tool execution
 * @const {z.ZodSchema}
 */
const toolExecutionSchema = z.object({
  name: z.string().min(1),
  params: z.record(z.any()).default({}),
  requestId: z.string().uuid().optional(),
});

/**
 * Unified MCP Tool Controller
 * Manages tool registration, execution, and middleware pipeline.
 * @extends EventEmitter
 */
export class UnifiedController extends EventEmitter {
  /** @type {Map<string, ToolDefinition>} */
  #tools = new Map();

  /** @type {MiddlewareFunction[]} */
  #middleware = [];

  /** @type {Map<string, Object>} */
  #schemas = new Map();

  /**
   * Creates a UnifiedController instance
   * @param {Object} [options] - Configuration options
   * @param {boolean} [options.enableMetrics=true] - Enable execution metrics
   * @param {boolean} [options.enableCaching=false] - Enable result caching
   */
  constructor(options = {}) {
    super();
    this.options = {
      enableMetrics: true,
      enableCaching: false,
      ...options,
    };
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
    };
    this.initialized = false;
  }

  /**
   * Initialize the controller.
   * @returns {Promise<UnifiedController>}
   */
  async initialize() {
    this.initialized = true;
    this.emit('controller:initialized', {
      toolCount: this.#listAvailableTools().length
    });
    return this;
  }

  /**
   * Registers a new tool
   * @param {string} name - Tool name (alphanumeric with underscores/hyphens)
   * @param {Function} handler - Tool handler function
   * @param {Object} [config] - Tool configuration
   * @param {z.ZodSchema} [config.schema] - Zod validation schema for params
   * @param {string} [config.description] - Tool description
   * @param {string[]} [config.tags] - Tool tags for categorization
   * @returns {UnifiedController} this for chaining
   * @throws {Error} If tool name is invalid or already exists
   * @example
   * controller.registerTool('math.add', (a, b) => a + b, {
   *   schema: z.object({ a: z.number(), b: z.number() }),
   *   description: 'Add two numbers'
   * });
   */
  registerTool(name, handler, config = {}) {
    const validation = toolRegistrationSchema.safeParse({
      name,
      handler,
      ...config,
    });

    if (!validation.success) {
      throw new Error(`Invalid tool registration: ${validation.error.message}`);
    }

    if (this.#tools.has(name)) {
      throw new Error(`Tool '${name}' is already registered`);
    }

    const toolDef = {
      name,
      handler,
      schema: config.schema,
      description: config.description || '',
      tags: config.tags || [],
      registeredAt: Date.now(),
    };

    this.#tools.set(name, toolDef);
    this.emit('tool:registered', { name, ...config });

    return this;
  }

  /**
   * Unregisters a tool
   * @param {string} name - Tool name
   * @returns {boolean} True if tool was removed
   */
  unregisterTool(name) {
    const existed = this.#tools.delete(name);
    if (existed) {
      this.emit('tool:unregistered', { name });
    }
    return existed;
  }

  /**
   * Executes a registered tool
   * @param {string} name - Tool name
   * @param {Object} [params={}] - Tool parameters
   * @param {Object} [options] - Execution options
   * @param {string} [options.requestId] - Unique request ID
   * @param {number} [options.timeout] - Execution timeout in ms
   * @returns {Promise<any>} Tool execution result
   * @throws {Error} If tool not found or execution fails
   * @example
   * const result = await controller.executeTool('math.add', { a: 1, b: 2 });
   */
  async executeTool(name, params = {}, options = {}) {
    const startTime = performance.now();
    const requestId = options.requestId || crypto.randomUUID();

    const validation = toolExecutionSchema.safeParse({ name, params, requestId });
    if (!validation.success) {
      throw new Error(`Invalid execution request: ${validation.error.message}`);
    }

    const tool = this.#tools.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    const context = {
      toolName: name,
      params,
      requestId,
      timestamp: Date.now(),
      startTime,
    };

    this.emit('tool:executing', context);

    try {
      // Validate params against schema if provided
      if (tool.schema) {
        const paramValidation = tool.schema.safeParse(params);
        if (!paramValidation.success) {
          throw new Error(`Parameter validation failed: ${paramValidation.error.message}`);
        }
      }

      // Execute middleware pipeline
      const result = await this.#runMiddleware(context, async () => {
        const execStart = performance.now();
        
        let handlerResult;
        if (options.timeout) {
          handlerResult = await this.#executeWithTimeout(
            () => tool.handler(params, context),
            options.timeout
          );
        } else {
          handlerResult = await tool.handler(params, context);
        }
        
        context.executionTime = performance.now() - execStart;
        return handlerResult;
      });

      const totalTime = performance.now() - startTime;
      this.#updateMetrics(true, totalTime);

      this.emit('tool:executed', {
        ...context,
        result,
        executionTime: totalTime,
      });

      return result;
    } catch (error) {
      const totalTime = performance.now() - startTime;
      this.#updateMetrics(false, totalTime);

      const errorContext = {
        ...context,
        error: error.message,
        executionTime: totalTime,
      };

      this.emit('tool:error', errorContext);
      throw error;
    }
  }

  /**
   * Lists all registered tools
   * @param {Object} [filter] - Filter options
   * @param {string} [filter.tag] - Filter by tag
   * @returns {Array<Object>} Array of tool definitions (without handlers)
   */
  listTools(filter = {}) {
    const tools = Array.from(this.#tools.values()).map((tool) => {
      const toolInfo = { ...tool };
      delete toolInfo.handler;
      return toolInfo;
    });
    
    if (filter.tag) {
      return tools.filter(t => t.tags?.includes(filter.tag));
    }
    
    return tools;
  }

  /**
   * Gets tool schema
   * @param {string} name - Tool name
   * @returns {z.ZodSchema|null} Tool schema or null
   */
  getToolSchema(name) {
    const tool = this.#tools.get(name);
    return tool?.schema || null;
  }

  /**
   * Gets tool definition
   * @param {string} name - Tool name
   * @returns {ToolDefinition|undefined} Tool definition
   */
  getTool(name) {
    const tool = this.#tools.get(name);
    return tool ? { ...tool } : undefined;
  }

  /**
   * Checks if a tool is registered
   * @param {string} name - Tool name
   * @returns {boolean}
   */
  hasTool(name) {
    return this.#tools.has(name);
  }

  /**
   * Adds middleware to the pipeline
   * @param {MiddlewareFunction} middleware - Middleware function
   * @returns {UnifiedController} this for chaining
   * @example
   * controller.use(async (context, next) => {
   *   console.log('Before:', context.toolName);
   *   await next();
   *   console.log('After:', context.toolName);
   * });
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.#middleware.push(middleware);
    return this;
  }

  /**
   * Clears all middleware
   * @returns {UnifiedController} this for chaining
   */
  clearMiddleware() {
    this.#middleware = [];
    return this;
  }

  /**
   * Gets current metrics
   * @returns {Object} Metrics snapshot
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Handle incoming HTTP API requests.
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @returns {Promise<boolean>}
   */
  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/tools' && req.method === 'GET') {
      this.#sendJson(res, 200, {
        tools: this.#listAvailableTools(),
        total: this.#listAvailableTools().length
      });
      return true;
    }

    if (pathname === '/api/controller/metrics' && req.method === 'GET') {
      this.#sendJson(res, 200, {
        initialized: this.initialized,
        metrics: this.getMetrics()
      });
      return true;
    }

    const toolMatch = pathname.match(/^\/api\/tools\/([^/]+)(?:\/execute)?$/);
    if (toolMatch) {
      const toolName = decodeURIComponent(toolMatch[1]);

      if (req.method === 'GET') {
        const tool = this.#getAvailableTool(toolName);
        if (!tool) {
          this.#sendJson(res, 404, { error: `Tool '${toolName}' not found` });
          return true;
        }

        const toolInfo = { ...tool };
        delete toolInfo.handler;
        this.#sendJson(res, 200, toolInfo);
        return true;
      }

      if (req.method === 'POST') {
        const body = await this.#readJsonBody(req);
        const params = body?.params && typeof body.params === 'object'
          ? body.params
          : body || {};

        try {
          const result = await this.#executeAvailableTool(toolName, params, {
            requestId: body?.requestId,
            timeout: body?.timeout,
            userId: body?.userId,
            subscription: body?.subscription
          });

          this.#sendJson(res, 200, result);
        } catch (error) {
          this.#sendJson(res, 400, { error: error.message, tool: toolName });
        }

        return true;
      }
    }

    if (pathname === '/api/tools/execute' && req.method === 'POST') {
      const body = await this.#readJsonBody(req);
      const name = body?.name;
      const params = body?.params && typeof body.params === 'object' ? body.params : {};

      if (!name || typeof name !== 'string') {
        this.#sendJson(res, 400, { error: 'Tool name is required' });
        return true;
      }

      try {
        const result = await this.#executeAvailableTool(name, params, {
          requestId: body?.requestId,
          timeout: body?.timeout,
          userId: body?.userId,
          subscription: body?.subscription
        });
        this.#sendJson(res, 200, result);
      } catch (error) {
        this.#sendJson(res, 400, { error: error.message, tool: name });
      }

      return true;
    }

    return false;
  }

  /**
   * Resets metrics
   * @returns {UnifiedController} this for chaining
   */
  resetMetrics() {
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
    };
    return this;
  }

  /**
   * Clears all registered tools
   * @returns {UnifiedController} this for chaining
   */
  clear() {
    this.#tools.clear();
    this.emit('tools:cleared');
    return this;
  }

  /**
   * Read and parse a JSON request body.
   * @private
   * @param {import('http').IncomingMessage} req
   * @returns {Promise<any>}
   */
  async #readJsonBody(req) {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) {
      return {};
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON body: ${error.message}`);
    }
  }

  /**
   * Send a JSON response.
   * @private
   * @param {import('http').ServerResponse} res
   * @param {number} statusCode
   * @param {any} payload
   */
  #sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }

  /**
   * Get a tool from the external registry or the local controller map.
   * @private
   * @param {string} name
   * @returns {ToolDefinition|undefined}
   */
  #getAvailableTool(name) {
    if (typeof this.options.tools?.get === 'function') {
      return this.options.tools.get(name);
    }

    return this.#tools.get(name);
  }

  /**
   * List all available tools.
   * @private
   * @returns {Array<Object>}
   */
  #listAvailableTools() {
    if (typeof this.options.tools?.list === 'function') {
      return this.options.tools.list();
    }

    return this.listTools();
  }

  /**
   * Execute a tool from the external registry or the local controller map.
   * @private
   * @param {string} name
   * @param {Object} params
   * @param {Object} context
   * @returns {Promise<any>}
   */
  async #executeAvailableTool(name, params, context = {}) {
    if (typeof this.options.tools?.execute === 'function') {
      return this.options.tools.execute(name, params, context);
    }

    return this.executeTool(name, params, context);
  }

  /**
   * Runs middleware pipeline
   * @private
   * @param {ToolContext} context - Execution context
   * @param {Function} finalHandler - Final handler
   * @returns {Promise<any>}
   */
  async #runMiddleware(context, finalHandler) {
    let index = 0;
    const middleware = this.#middleware;

    const next = async () => {
      if (index < middleware.length) {
        const current = middleware[index++];
        return current(context, next);
      }
      return finalHandler();
    };

    return next();
  }

  /**
   * Executes handler with timeout
   * @private
   * @param {Function} handler - Handler function
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<any>}
   */
  #executeWithTimeout(handler, timeout) {
    return Promise.race([
      handler(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Execution timeout after ${timeout}ms`)), timeout)
      ),
    ]);
  }

  /**
   * Updates execution metrics
   * @private
   * @param {boolean} success - Whether execution succeeded
   * @param {number} executionTime - Execution time in ms
   */
  #updateMetrics(success, executionTime) {
    if (!this.options.enableMetrics) return;

    this.metrics.totalExecutions++;
    
    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }

    // Update running average
    const n = this.metrics.totalExecutions;
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * (n - 1) + executionTime) / n;
  }
}

export default UnifiedController;
