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
      const tools = this.#listAvailableTools().map((tool) => this.#serializeToolSummary(tool));
      this.#sendJson(res, 200, {
        tools,
        total: tools.length
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

        this.#sendJson(res, 200, this.#serializeToolDetail(tool));
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
   * Serialize a tool summary for API responses.
   * @private
   * @param {Object} tool
   * @returns {Object}
   */
  #serializeToolSummary(tool = {}) {
    const name = typeof tool?.name === 'string' ? tool.name : '';
    const tags = Array.isArray(tool?.tags)
      ? tool.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
      : [];
    const registeredAt = this.#normalizeRegisteredAt(tool?.registeredAt);

    return {
      name,
      description: typeof tool?.description === 'string' ? tool.description : '',
      tags,
      category: this.#inferToolCategory(name, tags, tool?.category),
      requiresAuth: Boolean(tool?.requiresAuth),
      subscription: tool?.subscription || null,
      source: typeof tool?.source === 'string' ? tool.source : 'registry',
      hasInputSchema: Boolean(tool?.inputSchema || tool?.schema),
      hasOutputSchema: Boolean(tool?.outputSchema),
      ...(registeredAt ? { registeredAt } : {})
    };
  }

  /**
   * Serialize full tool details for API responses.
   * @private
   * @param {Object} tool
   * @returns {Object}
   */
  #serializeToolDetail(tool = {}) {
    const summary = this.#serializeToolSummary(tool);
    const inputSchema = this.#serializeSchema(tool?.inputSchema || tool?.schema || null);
    const outputSchema = this.#serializeSchema(tool?.outputSchema || null);

    return {
      ...summary,
      inputSchema,
      outputSchema,
      schema: inputSchema,
      parameters: this.#extractSchemaParameters(inputSchema),
    };
  }

  /**
   * Normalize registeredAt to an ISO string when possible.
   * @private
   * @param {string|number|Date} value
   * @returns {string|null}
   */
  #normalizeRegisteredAt(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return null;
  }

  /**
   * Infer a category for a tool when category is not explicitly set.
   * @private
   * @param {string} name
   * @param {string[]} tags
   * @param {string} explicit
   * @returns {string}
   */
  #inferToolCategory(name = '', tags = [], explicit = '') {
    if (typeof explicit === 'string' && explicit.trim()) {
      return explicit.trim().toLowerCase();
    }
    if (tags.length > 0) {
      return String(tags[0]).toLowerCase();
    }
    const delimiterIndex = name.search(/[_\-.]/);
    if (delimiterIndex > 0) {
      return name.slice(0, delimiterIndex).toLowerCase();
    }
    return name ? name.toLowerCase() : 'general';
  }

  /**
   * Serialize a schema into JSON Schema-like structure.
   * Supports Zod schemas and plain JSON schema objects.
   * @private
   * @param {any} schema
   * @param {number} depth
   * @returns {Object|null}
   */
  #serializeSchema(schema, depth = 0) {
    if (!schema || depth > 12) {
      return null;
    }

    if (this.#looksLikeJsonSchema(schema)) {
      return this.#cloneSerializable(schema, depth + 1);
    }

    const typeName = schema?._def?.typeName;
    if (!typeName) {
      return null;
    }

    switch (typeName) {
      case 'ZodString':
        return this.#decorateSchema({ type: 'string' }, schema);
      case 'ZodNumber':
        return this.#decorateSchema({ type: 'number' }, schema);
      case 'ZodBigInt':
        return this.#decorateSchema({ type: 'integer' }, schema);
      case 'ZodBoolean':
        return this.#decorateSchema({ type: 'boolean' }, schema);
      case 'ZodDate':
        return this.#decorateSchema({ type: 'string', format: 'date-time' }, schema);
      case 'ZodNull':
        return this.#decorateSchema({ type: 'null' }, schema);
      case 'ZodUndefined':
        return this.#decorateSchema({ type: 'null' }, schema);
      case 'ZodAny':
      case 'ZodUnknown':
        return this.#decorateSchema({}, schema);
      case 'ZodNever':
        return this.#decorateSchema({ not: {} }, schema);
      case 'ZodLiteral': {
        const literalValue = schema?._def?.value;
        return this.#decorateSchema({
          type: this.#jsonTypeOfLiteral(literalValue),
          enum: [literalValue]
        }, schema);
      }
      case 'ZodEnum': {
        const values = Array.isArray(schema?._def?.values) ? schema._def.values : [];
        return this.#decorateSchema({ type: 'string', enum: values }, schema);
      }
      case 'ZodNativeEnum': {
        const enumValues = Object.values(schema?._def?.values || {})
          .filter((value) => ['string', 'number'].includes(typeof value));
        const uniqueValues = [...new Set(enumValues)];
        const allNumbers = uniqueValues.length > 0 && uniqueValues.every((value) => typeof value === 'number');
        return this.#decorateSchema({
          type: allNumbers ? 'number' : 'string',
          enum: uniqueValues
        }, schema);
      }
      case 'ZodArray': {
        const itemSchema = this.#serializeSchema(schema?._def?.type, depth + 1) || {};
        return this.#decorateSchema({ type: 'array', items: itemSchema }, schema);
      }
      case 'ZodObject': {
        const shape = this.#getZodObjectShape(schema);
        const properties = {};
        const required = [];

        for (const [key, childSchema] of Object.entries(shape)) {
          properties[key] = this.#serializeSchema(childSchema, depth + 1) || {};
          if (!this.#isOptionalSchema(childSchema)) {
            required.push(key);
          }
        }

        const catchall = schema?._def?.catchall;
        const additionalProperties = this.#isZodNever(catchall)
          ? false
          : (this.#serializeSchema(catchall, depth + 1) || true);

        const objectSchema = {
          type: 'object',
          properties,
          additionalProperties
        };
        if (required.length > 0) {
          objectSchema.required = required;
        }
        return this.#decorateSchema(objectSchema, schema);
      }
      case 'ZodRecord': {
        const valueType = this.#serializeSchema(schema?._def?.valueType, depth + 1) || {};
        return this.#decorateSchema({
          type: 'object',
          additionalProperties: valueType
        }, schema);
      }
      case 'ZodTuple': {
        const items = Array.isArray(schema?._def?.items) ? schema._def.items : [];
        return this.#decorateSchema({
          type: 'array',
          prefixItems: items.map((item) => this.#serializeSchema(item, depth + 1) || {}),
          minItems: items.length,
          maxItems: items.length
        }, schema);
      }
      case 'ZodUnion': {
        const options = Array.isArray(schema?._def?.options) ? schema._def.options : [];
        return this.#decorateSchema({
          anyOf: options
            .map((option) => this.#serializeSchema(option, depth + 1))
            .filter(Boolean)
        }, schema);
      }
      case 'ZodDiscriminatedUnion': {
        const options = Array.from(schema?._def?.options?.values?.() || []);
        return this.#decorateSchema({
          anyOf: options
            .map((option) => this.#serializeSchema(option, depth + 1))
            .filter(Boolean)
        }, schema);
      }
      case 'ZodOptional':
      case 'ZodDefault':
      case 'ZodCatch':
        return this.#decorateSchema(
          this.#serializeSchema(schema?._def?.innerType, depth + 1) || {},
          schema
        );
      case 'ZodNullable': {
        const inner = this.#serializeSchema(schema?._def?.innerType, depth + 1) || {};
        return this.#decorateSchema({ anyOf: [inner, { type: 'null' }] }, schema);
      }
      case 'ZodEffects':
        return this.#decorateSchema(
          this.#serializeSchema(schema?._def?.schema, depth + 1) || {},
          schema
        );
      case 'ZodPipeline':
        return this.#decorateSchema(
          this.#serializeSchema(schema?._def?.out, depth + 1)
          || this.#serializeSchema(schema?._def?.in, depth + 1)
          || {},
          schema
        );
      case 'ZodLazy': {
        const lazySchema = typeof schema?._def?.getter === 'function'
          ? schema._def.getter()
          : null;
        return this.#decorateSchema(this.#serializeSchema(lazySchema, depth + 1) || {}, schema);
      }
      default:
        return this.#decorateSchema({ type: 'object' }, schema);
    }
  }

  /**
   * Extract parameter metadata from JSON schema.
   * @private
   * @param {Object|null} schema
   * @returns {Array<{name: string, type: string, required: boolean, description: string}>}
   */
  #extractSchemaParameters(schema) {
    if (!schema || schema.type !== 'object' || typeof schema.properties !== 'object') {
      return [];
    }

    const required = Array.isArray(schema.required) ? schema.required : [];
    return Object.entries(schema.properties).map(([name, value]) => {
      const type = Array.isArray(value?.type) ? value.type.join('|') : (value?.type || 'any');
      return {
        name,
        type,
        required: required.includes(name),
        description: typeof value?.description === 'string' ? value.description : ''
      };
    });
  }

  /**
   * Determine if a schema object already looks like JSON Schema.
   * @private
   * @param {any} schema
   * @returns {boolean}
   */
  #looksLikeJsonSchema(schema) {
    if (!schema || typeof schema !== 'object') return false;
    return Boolean(
      Object.prototype.hasOwnProperty.call(schema, 'type')
      || Object.prototype.hasOwnProperty.call(schema, 'properties')
      || Object.prototype.hasOwnProperty.call(schema, 'anyOf')
      || Object.prototype.hasOwnProperty.call(schema, 'oneOf')
      || Object.prototype.hasOwnProperty.call(schema, 'allOf')
      || Object.prototype.hasOwnProperty.call(schema, 'enum')
    );
  }

  /**
   * Clone serializable data while dropping functions/undefined.
   * @private
   * @param {any} value
   * @param {number} depth
   * @returns {any}
   */
  #cloneSerializable(value, depth = 0) {
    if (depth > 12) {
      return null;
    }
    if (value === null || value === undefined) {
      return value ?? null;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.#cloneSerializable(entry, depth + 1));
    }
    if (typeof value === 'function') {
      return undefined;
    }
    if (typeof value !== 'object') {
      return value;
    }
    const clone = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalized = this.#cloneSerializable(entry, depth + 1);
      if (normalized !== undefined) {
        clone[key] = normalized;
      }
    }
    return clone;
  }

  /**
   * Add schema description metadata when present.
   * @private
   * @param {Object} jsonSchema
   * @param {any} zodSchema
   * @returns {Object}
   */
  #decorateSchema(jsonSchema, zodSchema) {
    const description = typeof zodSchema?.description === 'string'
      ? zodSchema.description
      : (typeof zodSchema?._def?.description === 'string' ? zodSchema._def.description : '');
    if (!description) {
      return jsonSchema;
    }
    return { ...jsonSchema, description };
  }

  /**
   * Resolve the shape object from a Zod object schema.
   * @private
   * @param {any} schema
   * @returns {Record<string, any>}
   */
  #getZodObjectShape(schema) {
    if (typeof schema?.shape === 'function') {
      return schema.shape();
    }
    if (schema?.shape && typeof schema.shape === 'object') {
      return schema.shape;
    }
    if (typeof schema?._def?.shape === 'function') {
      return schema._def.shape();
    }
    if (schema?._def?.shape && typeof schema._def.shape === 'object') {
      return schema._def.shape;
    }
    return {};
  }

  /**
   * Determine whether schema can be omitted from an object.
   * @private
   * @param {any} schema
   * @returns {boolean}
   */
  #isOptionalSchema(schema) {
    const typeName = schema?._def?.typeName;
    if (typeName === 'ZodOptional' || typeName === 'ZodDefault' || typeName === 'ZodCatch') {
      return true;
    }
    if (typeName === 'ZodEffects') {
      return this.#isOptionalSchema(schema?._def?.schema);
    }
    return false;
  }

  /**
   * Check whether schema is ZodNever.
   * @private
   * @param {any} schema
   * @returns {boolean}
   */
  #isZodNever(schema) {
    return schema?._def?.typeName === 'ZodNever';
  }

  /**
   * Get JSON schema type for a literal value.
   * @private
   * @param {any} value
   * @returns {string}
   */
  #jsonTypeOfLiteral(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    const type = typeof value;
    if (type === 'number' && Number.isInteger(value)) {
      return 'integer';
    }
    if (['string', 'number', 'boolean', 'object'].includes(type)) {
      return type;
    }
    return 'string';
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
