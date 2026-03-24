/**
 * @fileoverview MCP Tool Registry for CogniMesh v5.0
 * Central registry for managing and executing MCP tools.
 * @module tools/index
 */

import { z } from 'zod';
import { allTools, toolCounts } from './definitions/index.js';
export {
  createTool,
  createResponseSchema
} from './definition-helpers.js';

/**
 * Tool definition structure
 * @typedef {Object} ToolDefinition
 * @property {string} name - Tool name
 * @property {string} description - Tool description
 * @property {z.ZodSchema} inputSchema - Zod schema for input validation
 * @property {z.ZodSchema} outputSchema - Zod schema for output validation
 * @property {Function} handler - Tool execution handler
 * @property {string[]} [tags] - Tool tags for categorization
 * @property {boolean} [requiresAuth] - Whether tool requires authentication
 * @property {string} [subscription] - Required subscription tier
 */

/**
 * Tool execution result
 * @typedef {Object} ToolResult
 * @property {boolean} success - Whether execution was successful
 * @property {*} data - Result data
 * @property {string[]} [errors] - Error messages if failed
 * @property {number} [executionTime] - Execution time in ms
 */

/**
 * ToolRegistry - Central registry for MCP tools
 */
export class ToolRegistry {
  /** @type {Map<string, ToolDefinition>} */
  #tools = new Map();

  /** @type {Map<string, number>} */
  #executionStats = new Map();
  
  /** @type {boolean} */
  #initialized = false;
  
  /** @type {Object} */
  #context = {};

  /**
   * Register a new tool
   * @param {ToolDefinition} tool - Tool definition
   * @returns {ToolRegistry} - This registry for chaining
   * @throws {Error} If tool name is already registered
   */
  register(tool) {
    if (this.#tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }

    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a valid name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('Tool must have a valid description');
    }

    if (!tool.inputSchema || !(tool.inputSchema instanceof z.ZodSchema)) {
      throw new Error('Tool must have a valid Zod input schema');
    }

    if (!tool.outputSchema || !(tool.outputSchema instanceof z.ZodSchema)) {
      throw new Error('Tool must have a valid Zod output schema');
    }

    if (typeof tool.handler !== 'function') {
      throw new Error('Tool must have a handler function');
    }

    this.#tools.set(tool.name, {
      ...tool,
      tags: tool.tags || [],
      requiresAuth: tool.requiresAuth || false,
      registeredAt: new Date().toISOString()
    });

    this.#executionStats.set(tool.name, 0);
    return this;
  }
  
  /**
   * Register multiple tools
   * @param {ToolDefinition[]} tools - Array of tool definitions
   * @returns {ToolRegistry} - This registry for chaining
   */
  registerMany(tools) {
    for (const tool of tools) {
      this.register(tool);
    }
    return this;
  }

  /**
   * Unregister a tool
   * @param {string} name - Tool name
   * @returns {boolean} - Whether tool was unregistered
   */
  unregister(name) {
    const existed = this.#tools.has(name);
    this.#tools.delete(name);
    this.#executionStats.delete(name);
    return existed;
  }

  /**
   * List all registered tools
   * @param {Object} [filter] - Filter options
   * @param {string[]} [filter.tags] - Filter by tags
   * @param {boolean} [filter.requiresAuth] - Filter by auth requirement
   * @param {string} [filter.subscription] - Filter by subscription tier
   * @returns {ToolDefinition[]} - List of tool definitions
   */
  list(filter = {}) {
    let tools = Array.from(this.#tools.values());

    if (filter.tags && filter.tags.length > 0) {
      tools = tools.filter(t => 
        filter.tags.some(tag => t.tags.includes(tag))
      );
    }

    if (filter.requiresAuth !== undefined) {
      tools = tools.filter(t => t.requiresAuth === filter.requiresAuth);
    }

    if (filter.subscription) {
      tools = tools.filter(t => t.subscription === filter.subscription);
    }

    return tools.map(t => ({
      name: t.name,
      description: t.description,
      tags: t.tags,
      requiresAuth: t.requiresAuth,
      subscription: t.subscription,
      registeredAt: t.registeredAt
    }));
  }

  /**
   * Get a tool by name
   * @param {string} name - Tool name
   * @returns {ToolDefinition|undefined} - Tool definition or undefined
   */
  get(name) {
    return this.#tools.get(name);
  }

  /**
   * Check if a tool exists
   * @param {string} name - Tool name
   * @returns {boolean} - Whether tool exists
   */
  has(name) {
    return this.#tools.has(name);
  }

  /**
   * Execute a tool
   * @param {string} name - Tool name
   * @param {Object} params - Tool parameters
   * @param {Object} [context] - Execution context
   * @param {string} [context.userId] - User ID
   * @param {string} [context.subscription] - User subscription tier
   * @returns {Promise<ToolResult>} - Execution result
   */
  async execute(name, params, context = {}) {
    const tool = this.#tools.get(name);
    
    if (!tool) {
      return {
        success: false,
        errors: [`Tool '${name}' not found`],
        data: null
      };
    }

    // Check subscription requirements
    if (tool.subscription && context.subscription !== tool.subscription) {
      return {
        success: false,
        errors: [`Tool '${name}' requires '${tool.subscription}' subscription`],
        data: null
      };
    }

    // Validate parameters
    const validation = this.validateParams(name, params);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
        data: null
      };
    }

    const startTime = Date.now();
    
    try {
      // Merge execution contexts
      const executionContext = {
        ...this.#context,
        ...context,
        toolName: name,
        executedAt: new Date().toISOString()
      };
      
      const result = await tool.handler(validation.data, executionContext);
      const executionTime = Date.now() - startTime;
      const normalizedResult =
        result &&
        typeof result === 'object' &&
        Object.prototype.hasOwnProperty.call(result, 'success') &&
        Object.prototype.hasOwnProperty.call(result, 'data')
          ? result
          : { success: true, data: result };

      if (!normalizedResult.success) {
        return {
          success: false,
          errors: normalizedResult.errors || [normalizedResult.error || 'Tool execution failed'],
          data: null,
          executionTime
        };
      }
      
      // Validate output
      const outputValidation = tool.outputSchema.safeParse(normalizedResult.data);
      if (!outputValidation.success) {
        return {
          success: false,
          errors: ['Tool returned invalid output', outputValidation.error.message],
          data: null,
          executionTime
        };
      }

      // Update stats
      this.#executionStats.set(name, (this.#executionStats.get(name) || 0) + 1);

      return {
        success: true,
        data: outputValidation.data,
        executionTime
      };
    } catch (error) {
      return {
        success: false,
        errors: [error.message],
        data: null,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Validate tool parameters
   * @param {string} name - Tool name
   * @param {Object} params - Parameters to validate
   * @returns {Object} - Validation result
   */
  validateParams(name, params) {
    const tool = this.#tools.get(name);
    
    if (!tool) {
      return {
        valid: false,
        errors: [`Tool '${name}' not found`],
        data: null
      };
    }

    const result = tool.inputSchema.safeParse(params);
    
    if (result.success) {
      return {
        valid: true,
        errors: [],
        data: result.data
      };
    }

    return {
      valid: false,
      errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      data: null
    };
  }

  /**
   * Get execution statistics
   * @returns {Object} - Statistics by tool name
   */
  getStats() {
    return Object.fromEntries(this.#executionStats);
  }
  
  /**
   * Get comprehensive registry statistics
   * @returns {Object} - Registry statistics
   */
  getRegistryStats() {
    const tools = Array.from(this.#tools.values());
    const tagCounts = {};
    
    for (const tool of tools) {
      for (const tag of tool.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    
    return {
      totalTools: this.#tools.size,
      totalExecutions: Array.from(this.#executionStats.values()).reduce((a, b) => a + b, 0),
      tagDistribution: tagCounts,
      authRequiredTools: tools.filter(t => t.requiresAuth).length,
      initialized: this.#initialized
    };
  }

  /**
   * Get total number of registered tools
   * @returns {number} - Tool count
   */
  get count() {
    return this.#tools.size;
  }
  
  /**
   * Check if registry is initialized
   * @returns {boolean} - Initialization status
   */
  get isInitialized() {
    return this.#initialized;
  }
  
  /**
   * Initialize the registry with all default tools
   * @param {Object} [options] - Initialization options
   * @param {Object} [options.context] - Global context for all tool executions
   * @param {boolean} [options.skipDefaultTools] - Skip registering default tools
   * @returns {ToolRegistry} - This registry for chaining
   */
  initialize(options = {}) {
    if (this.#initialized) {
      return this;
    }
    
    this.#context = options.context || {};
    
    // Register all default tools
    if (!options.skipDefaultTools) {
      this.registerMany(allTools);
    }
    
    this.#initialized = true;
    return this;
  }
  
  /**
   * Update the global execution context
   * @param {Object} context - New context properties
   * @returns {ToolRegistry} - This registry for chaining
   */
  setContext(context) {
    this.#context = { ...this.#context, ...context };
    return this;
  }
  
  /**
   * Get the current global execution context
   * @returns {Object} - Current context
   */
  getContext() {
    return { ...this.#context };
  }

  /**
   * Clear all tools
   */
  clear() {
    this.#tools.clear();
    this.#executionStats.clear();
    this.#initialized = false;
    this.#context = {};
  }
}

/**
 * Create a standard tool definition
 * @param {Object} config - Tool configuration
 * @param {string} config.name - Tool name
 * @param {string} config.description - Tool description
 * @param {z.ZodSchema} config.inputSchema - Input schema
 * @param {z.ZodSchema} config.outputSchema - Output schema
 * @param {Function} config.handler - Handler function
 * @param {string[]} [config.tags] - Tags
 * @param {boolean} [config.requiresAuth] - Requires auth
 * @param {string} [config.subscription] - Subscription tier
 * @returns {ToolDefinition} - Tool definition
 */
/**
 * Global tool registry instance
 */
export const registry = new ToolRegistry();

/**
 * Initialize the global tool registry with all tools
 * @param {Object} [options] - Initialization options
 * @returns {ToolRegistry} - The initialized registry
 */
export function initializeRegistry(options = {}) {
  return registry.initialize(options);
}

/**
 * Get tool counts by category
 * @returns {Object} - Tool counts
 */
export function getToolCounts() {
  return toolCounts;
}

export default registry;
