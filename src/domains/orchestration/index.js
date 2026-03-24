/**
 * @fileoverview Orchestration Domain - Tool orchestration and pipeline execution
 * @module domains/orchestration
 */

/**
 * Tool configuration options
 * @typedef {Object} ToolConfig
 * @property {number} [timeout] - Execution timeout in milliseconds
 * @property {number} [retries] - Number of retry attempts
 * @property {boolean} [cache] - Whether to cache results
 * @property {string[]} [dependsOn] - Dependencies on other tools
 */

/**
 * Tool handler function
 * @typedef {Function} ToolHandler
 * @param {any} input - Tool input
 * @param {Object} context - Execution context
 * @returns {Promise<any>|any} Tool output
 */

/**
 * Registered tool structure
 * @typedef {Object} RegisteredTool
 * @property {string} name - Tool name
 * @property {ToolHandler} handler - Tool handler function
 * @property {ToolConfig} config - Tool configuration
 */

/**
 * Pipeline step structure
 * @typedef {Object} PipelineStep
 * @property {string} name - Tool name
 * @property {ToolConfig} [config] - Override config
 */

/**
 * Pipeline execution result
 * @typedef {Object} PipelineResult
 * @property {boolean} success - Execution success
 * @property {any} output - Final output
 * @property {Object} steps - Step results
 * @property {number} duration - Execution duration in ms
 */

/**
 * Orchestrator manages tool registration and pipeline execution
 * @class
 */
class Orchestrator {
  constructor() {
    /** @type {Map<string, RegisteredTool>} */
    this.tools = new Map();
    /** @type {Map<string, any>} */
    this.cache = new Map();
  }

  /**
   * Registers a tool with the orchestrator
   * @param {string} name - Unique tool name
   * @param {ToolHandler} handler - Tool handler function
   * @param {ToolConfig} [config={}] - Tool configuration
   * @returns {Orchestrator} This instance for chaining
   * @throws {Error} If name or handler is invalid
   */
  registerTool(name, handler, config = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Tool name must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }

    this.tools.set(name, {
      name,
      handler,
      config: {
        timeout: 30000,
        retries: 0,
        cache: false,
        dependsOn: [],
        ...config
      }
    });

    return this;
  }

  /**
   * Gets a registered tool
   * @param {string} name - Tool name
   * @returns {RegisteredTool|undefined} Tool or undefined
   * @private
   */
  _getTool(name) {
    return this.tools.get(name);
  }

  /**
   * Executes a single tool
   * @param {string} name - Tool name
   * @param {any} input - Tool input
   * @param {Object} context - Execution context
   * @returns {Promise<any>} Tool output
   * @private
   */
  async _executeTool(name, input, context = {}) {
    const tool = this._getTool(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }

    const cacheKey = `${name}:${JSON.stringify(input)}`;
    if (tool.config.cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let result;
    let attempts = 0;
    const maxAttempts = tool.config.retries + 1;

    while (attempts < maxAttempts) {
      try {
        const timeout = tool.config.timeout;
        const handlerPromise = Promise.resolve(tool.handler(input, context));

        if (timeout > 0) {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Tool "${name}" timed out`)), timeout);
          });
          result = await Promise.race([handlerPromise, timeoutPromise]);
        } else {
          result = await handlerPromise;
        }

        if (tool.config.cache) {
          this.cache.set(cacheKey, result);
        }

        return result;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw error;
        }
      }
    }
  }

  /**
   * Creates a pipeline from tool names
   * @param {string[]} tools - Array of tool names
   * @returns {PipelineStep[]} Pipeline definition
   * @throws {Error} If any tool is not registered
   */
  createPipeline(tools) {
    if (!Array.isArray(tools)) {
      throw new Error('Tools must be an array');
    }

    return tools.map(name => {
      if (!this.tools.has(name)) {
        throw new Error(`Tool "${name}" is not registered`);
      }
      return { name };
    });
  }

  /**
   * Executes a pipeline with initial input
   * @param {PipelineStep[]} pipeline - Pipeline definition
   * @param {any} input - Initial input
   * @returns {Promise<PipelineResult>} Execution result
   */
  async executePipeline(pipeline, input) {
    const startTime = Date.now();
    const stepResults = {};
    let currentInput = input;

    try {
      for (const step of pipeline) {
        const stepStart = Date.now();
        const output = await this._executeTool(step.name, currentInput, {
          stepResults,
          pipeline
        });

        stepResults[step.name] = {
          input: currentInput,
          output,
          duration: Date.now() - stepStart
        };

        currentInput = output;
      }

      return {
        success: true,
        output: currentInput,
        steps: stepResults,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: error.message,
        steps: stepResults,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Creates parallel execution configuration
   * @param {string[]} tools - Tool names to execute in parallel
   * @returns {Function} Parallel executor function
   */
  parallel(tools) {
    if (!Array.isArray(tools)) {
      throw new Error('Tools must be an array');
    }

    return async (input) => {
      const results = await Promise.all(
        tools.map(name => this._executeTool(name, input).catch(err => ({ error: err.message })))
      );

      return {
        parallel: true,
        tools,
        results: results.map((result, i) => ({
          tool: tools[i],
          result
        }))
      };
    };
  }

  /**
   * Creates sequential execution configuration
   * @param {string[]} tools - Tool names to execute sequentially
   * @returns {Function} Sequential executor function
   */
  sequence(tools) {
    if (!Array.isArray(tools)) {
      throw new Error('Tools must be an array');
    }

    return async (input) => {
      const pipeline = this.createPipeline(tools);
      return this.executePipeline(pipeline, input);
    };
  }

  /**
   * Lists all registered tools
   * @returns {string[]} Array of tool names
   */
  listTools() {
    return Array.from(this.tools.keys());
  }

  /**
   * Unregisters a tool
   * @param {string} name - Tool name
   * @returns {boolean} True if removed
   */
  unregisterTool(name) {
    return this.tools.delete(name);
  }

  /**
   * Clears the result cache
   */
  clearCache() {
    this.cache.clear();
  }
}

export { Orchestrator };
export default Orchestrator;
