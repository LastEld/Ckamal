/**
 * Pipeline Orchestration Middleware
 * Composable middleware pipeline with error handling and short-circuit support
 *
 * @module src/middleware/orchestration
 */

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} PipelineContext
 * @property {string} id - Pipeline execution ID
 * @property {Object} data - Pipeline data
 * @property {Map<string, *>} state - Execution state
 * @property {boolean} aborted - Whether pipeline was aborted
 * @property {string} [abortReason] - Reason for abortion
 * @property {number} startedAt - Start timestamp
 * @property {number} [completedAt] - Completion timestamp
 * @property {Error[]} errors - Collected errors
 * @property {Object} metadata - Additional metadata
 */

/**
 * @typedef {Function} MiddlewareFunction
 * @param {PipelineContext} context - Pipeline context
 * @param {Function} next - Next middleware function
 * @returns {Promise<void>|void}
 */

/**
 * @typedef {Object} MiddlewareConfig
 * @property {string} name - Middleware name
 * @property {number} [priority=0] - Execution priority (higher = earlier)
 * @property {boolean} [enabled=true] - Whether enabled
 * @property {boolean} [continueOnError=false] - Continue on error
 * @property {number} [timeout] - Execution timeout in ms
 */

/**
 * @typedef {Object} PipelineResult
 * @property {boolean} success - Whether pipeline succeeded
 * @property {PipelineContext} context - Final context
 * @property {number} duration - Execution duration in ms
 * @property {Object} [error] - Error information if failed
 */

// ============================================================================
// Errors
// ============================================================================

/**
 * Orchestration error (base class)
 */
export class OrchestrationError extends Error {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'OrchestrationError';
    this.code = code;
    this.metadata = metadata;
  }
}

/**
 * Pipeline error
 */
export class PipelineError extends OrchestrationError {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(code, message, metadata = {}) {
    super(code, message, metadata);
    this.name = 'PipelineError';
  }
}

/**
 * Transform error
 */
export class TransformError extends OrchestrationError {
  /**
   * @param {string} message - Error message
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(message, metadata = {}) {
    super('TRANSFORM_ERROR', message, metadata);
    this.name = 'TransformError';
  }
}

/**
 * Pipeline abort error
 */
export class PipelineAbortError extends Error {
  /**
   * @param {string} reason - Abort reason
   * @param {PipelineContext} context - Pipeline context
   */
  constructor(reason, context) {
    super(`Pipeline aborted: ${reason}`);
    this.name = 'PipelineAbortError';
    this.reason = reason;
    this.context = context;
  }
}

// ============================================================================
// OrchestrationMiddleware Class
// ============================================================================

/**
 * Pipeline orchestration middleware
 * Manages ordered middleware execution with error handling and short-circuit support
 */
export class OrchestrationMiddleware {
  #middlewares;
  #config;
  #hooks;

  /**
   * @param {Object} [config] - Configuration options
   * @param {boolean} [config.continueOnError=false] - Continue on middleware errors
   * @param {number} [config.defaultTimeout=30000] - Default middleware timeout
   * @param {boolean} [config.enableHooks=true] - Enable lifecycle hooks
   */
  constructor(config = {}) {
    this.#config = {
      continueOnError: config.continueOnError || false,
      defaultTimeout: config.defaultTimeout || 30000,
      enableHooks: config.enableHooks !== false
    };

    this.#middlewares = [];
    this.#hooks = new Map([
      ['before', []],
      ['after', []],
      ['error', []]
    ]);
  }

  // ========================================================================
  // Middleware Management
  // ========================================================================

  /**
   * Add middleware to pipeline
   * @param {MiddlewareFunction|Function} middleware - Middleware function
   * @param {MiddlewareConfig|Object} [config] - Middleware configuration
   * @returns {OrchestrationMiddleware} This instance for chaining
   */
  use(middleware, config = {}) {
    if (typeof middleware !== 'function') {
      throw new PipelineError(
        'INVALID_MIDDLEWARE',
        'Middleware must be a function'
      );
    }

    const middlewareConfig = {
      name: config.name || middleware.name || `middleware_${this.#middlewares.length}`,
      priority: config.priority ?? 0,
      enabled: config.enabled !== false,
      continueOnError: config.continueOnError || this.#config.continueOnError,
      timeout: config.timeout || this.#config.defaultTimeout
    };

    this.#middlewares.push({
      fn: middleware,
      config: middlewareConfig
    });

    // Sort by priority (higher first)
    this.#middlewares.sort((a, b) => b.config.priority - a.config.priority);

    return this;
  }

  /**
   * Add middleware at beginning of pipeline
   * @param {MiddlewareFunction} middleware - Middleware function
   * @param {Object} [config] - Middleware configuration
   * @returns {OrchestrationMiddleware} This instance
   */
  prepend(middleware, config = {}) {
    return this.use(middleware, { ...config, priority: 1000 });
  }

  /**
   * Add middleware at end of pipeline
   * @param {MiddlewareFunction} middleware - Middleware function
   * @param {Object} [config] - Middleware configuration
   * @returns {OrchestrationMiddleware} This instance
   */
  append(middleware, config = {}) {
    return this.use(middleware, { ...config, priority: -1000 });
  }

  /**
   * Remove middleware by name
   * @param {string} name - Middleware name
   * @returns {boolean} True if removed
   */
  remove(name) {
    const index = this.#middlewares.findIndex(m => m.config.name === name);
    if (index !== -1) {
      this.#middlewares.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Enable a middleware
   * @param {string} name - Middleware name
   * @returns {boolean} True if enabled
   */
  enable(name) {
    const middleware = this.#middlewares.find(m => m.config.name === name);
    if (middleware) {
      middleware.config.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a middleware
   * @param {string} name - Middleware name
   * @returns {boolean} True if disabled
   */
  disable(name) {
    const middleware = this.#middlewares.find(m => m.config.name === name);
    if (middleware) {
      middleware.config.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Get middleware list
   * @returns {Array<{name: string, enabled: boolean, priority: number}>}
   */
  list() {
    return this.#middlewares.map(m => ({
      name: m.config.name,
      enabled: m.config.enabled,
      priority: m.config.priority
    }));
  }

  // ========================================================================
  // Pipeline Execution
  // ========================================================================

  /**
   * Execute pipeline
   * @param {Object} [initialData] - Initial pipeline data
   * @param {Object} [options] - Execution options
   * @param {string} [options.id] - Custom execution ID
   * @param {Object} [options.metadata] - Additional metadata
   * @returns {Promise<PipelineResult>} Execution result
   */
  async execute(initialData = {}, options = {}) {
    const startTime = Date.now();
    const executionId = options.id || `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    /** @type {PipelineContext} */
    const context = {
      id: executionId,
      data: { ...initialData },
      state: new Map(),
      aborted: false,
      abortReason: null,
      startedAt: startTime,
      errors: [],
      metadata: { ...options.metadata }
    };

    // Create abort function
    context.abort = (reason = 'User aborted') => {
      context.aborted = true;
      context.abortReason = reason;
    };

    try {
      // Run before hooks
      await this.#runHooks('before', context);

      // Execute middleware chain
      await this.#executeChain(context);

      if (context.aborted) {
        throw new PipelineAbortError(context.abortReason, context);
      }

      // Run after hooks
      await this.#runHooks('after', context);

      context.completedAt = Date.now();

      return {
        success: true,
        context,
        duration: Date.now() - startTime
      };
    } catch (error) {
      context.errors.push(error);
      
      // Run error hooks
      await this.#runHooks('error', context, error);

      context.completedAt = Date.now();

      return {
        success: false,
        context,
        duration: Date.now() - startTime,
        error: {
          name: error.name,
          message: error.message,
          code: error.code,
          stack: error.stack
        }
      };
    }
  }

  /**
   * Execute middleware chain
   * @private
   * @param {PipelineContext} context - Pipeline context
   */
  async #executeChain(context) {
    const enabledMiddlewares = this.#middlewares.filter(m => m.config.enabled);

    if (enabledMiddlewares.length === 0) {
      return;
    }

    let index = 0;

    const next = async () => {
      // Check for abortion
      if (context.aborted) {
        return;
      }

      // Check if we've reached the end
      if (index >= enabledMiddlewares.length) {
        return;
      }

      const middleware = enabledMiddlewares[index++];
      
      try {
        // Execute with timeout
        if (middleware.config.timeout) {
          await this.#executeWithTimeout(
            middleware.fn,
            context,
            next,
            middleware.config.timeout
          );
        } else {
          await middleware.fn(context, next);
        }
      } catch (error) {
        context.errors.push({
          middleware: middleware.config.name,
          error: error.message,
          stack: error.stack
        });

        if (!middleware.config.continueOnError) {
          throw error;
        }

        // Continue to next middleware
        await next();
      }
    };

    await next();
  }

  /**
   * Execute middleware with timeout
   * @private
   * @param {Function} fn - Middleware function
   * @param {PipelineContext} context - Context
   * @param {Function} next - Next function
   * @param {number} timeout - Timeout in ms
   */
  #executeWithTimeout(fn, context, next, timeout) {
    return Promise.race([
      fn(context, next),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new PipelineError(
            'MIDDLEWARE_TIMEOUT',
            `Middleware execution timed out after ${timeout}ms`
          ));
        }, timeout);
      })
    ]);
  }

  // ========================================================================
  // Short-circuit Support
  // ========================================================================

  /**
   * Create conditional middleware
   * @param {Function} condition - Condition function (context) => boolean
   * @param {MiddlewareFunction} middleware - Middleware to conditionally execute
   * @param {Object} [config] - Middleware config
   * @returns {OrchestrationMiddleware} This instance
   */
  when(condition, middleware, config = {}) {
    return this.use(async (ctx, next) => {
      const shouldRun = await condition(ctx);
      if (shouldRun) {
        await middleware(ctx, next);
      } else {
        await next();
      }
    }, { ...config, name: config.name || `when_${middleware.name}` });
  }

  /**
   * Create branching pipeline
   * @param {Function} condition - Condition function
   * @param {OrchestrationMiddleware} trueBranch - Branch if true
   * @param {OrchestrationMiddleware} [falseBranch] - Branch if false
   * @param {Object} [config] - Config
   * @returns {OrchestrationMiddleware} This instance
   */
  branch(condition, trueBranch, falseBranch = null, config = {}) {
    return this.use(async (ctx, next) => {
      const shouldTakeTrue = await condition(ctx);
      
      if (shouldTakeTrue) {
        const result = await trueBranch.execute(ctx.data, { id: ctx.id });
        Object.assign(ctx.data, result.context.data);
      } else if (falseBranch) {
        const result = await falseBranch.execute(ctx.data, { id: ctx.id });
        Object.assign(ctx.data, result.context.data);
      }
      
      await next();
    }, { ...config, name: config.name || 'branch' });
  }

  /**
   * Create parallel execution middleware
   * @param {Array<MiddlewareFunction>} middlewares - Middlewares to run in parallel
   * @param {Object} [config] - Config
   * @returns {OrchestrationMiddleware} This instance
   */
  parallel(middlewares, config = {}) {
    return this.use(async (ctx, next) => {
      await Promise.all(
        middlewares.map(mw => mw(ctx, async () => {}))
      );
      await next();
    }, { ...config, name: config.name || 'parallel' });
  }

  /**
   * Create retry wrapper middleware
   * @param {MiddlewareFunction} middleware - Middleware to retry
   * @param {number} [maxRetries=3] - Maximum retries
   * @param {number} [delay=1000] - Delay between retries
   * @param {Object} [config] - Config
   * @returns {OrchestrationMiddleware} This instance
   */
  retry(middleware, maxRetries = 3, delay = 1000, config = {}) {
    return this.use(async (ctx, next) => {
      let lastError;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await middleware(ctx, next);
          return;
        } catch (error) {
          lastError = error;
          
          if (attempt < maxRetries) {
            await this.#sleep(delay * Math.pow(2, attempt)); // Exponential backoff
          }
        }
      }
      
      throw lastError;
    }, { ...config, name: config.name || `retry_${middleware.name}` });
  }

  /**
   * Create tap middleware (executes without affecting flow)
   * @param {Function} fn - Function to execute
   * @param {Object} [config] - Config
   * @returns {OrchestrationMiddleware} This instance
   */
  tap(fn, config = {}) {
    return this.use(async (ctx, next) => {
      try {
        await fn(ctx);
      } catch (error) {
        // Swallow errors in tap
      }
      await next();
    }, { ...config, name: config.name || 'tap' });
  }

  // ========================================================================
  // Hooks
  // ========================================================================

  /**
   * Register a hook
   * @param {'before'|'after'|'error'} event - Hook event
   * @param {Function} handler - Hook handler
   * @returns {Function} Unregister function
   */
  on(event, handler) {
    if (!this.#hooks.has(event)) {
      throw new PipelineError('INVALID_HOOK', `Unknown hook: ${event}`);
    }

    this.#hooks.get(event).push(handler);

    return () => this.off(event, handler);
  }

  /**
   * Unregister a hook
   * @param {string} event - Hook event
   * @param {Function} handler - Handler to remove
   */
  off(event, handler) {
    const hooks = this.#hooks.get(event);
    if (hooks) {
      const index = hooks.indexOf(handler);
      if (index !== -1) {
        hooks.splice(index, 1);
      }
    }
  }

  /**
   * Run hooks for an event
   * @private
   * @param {string} event - Event name
   * @param {...*} args - Arguments to pass
   */
  async #runHooks(event, ...args) {
    if (!this.#config.enableHooks) {
      return;
    }

    const hooks = this.#hooks.get(event);
    if (hooks) {
      for (const hook of hooks) {
        try {
          await hook(...args);
        } catch (error) {
          // Hook errors don't stop execution
        }
      }
    }
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Sleep helper
   * @private
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   */
  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create composed middleware function
   * @returns {Function} (data, options) => Promise<PipelineResult>
   */
  compose() {
    return (data, options) => this.execute(data, options);
  }

  /**
   * Clone this pipeline
   * @returns {OrchestrationMiddleware} New pipeline with same middlewares
   */
  clone() {
    const cloned = new OrchestrationMiddleware(this.#config);
    
    for (const { fn, config } of this.#middlewares) {
      cloned.use(fn, { ...config });
    }

    return cloned;
  }

  /**
   * Merge another pipeline into this one
   * @param {OrchestrationMiddleware} other - Pipeline to merge
   * @param {Object} [options] - Merge options
   * @param {number} [options.offset=0] - Priority offset for merged middlewares
   * @returns {OrchestrationMiddleware} This instance
   */
  merge(other, options = {}) {
    const offset = options.offset || 0;
    
    for (const { fn, config } of other.list()) {
      const otherMiddleware = other.#middlewares.find(m => m.config.name === config.name);
      if (otherMiddleware) {
        this.use(otherMiddleware.fn, {
          ...otherMiddleware.config,
          priority: otherMiddleware.config.priority + offset,
          name: `${config.name}_merged`
        });
      }
    }

    return this;
  }

  /**
   * Get pipeline statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      total: this.#middlewares.length,
      enabled: this.#middlewares.filter(m => m.config.enabled).length,
      disabled: this.#middlewares.filter(m => !m.config.enabled).length,
      middlewares: this.list()
    };
  }

  /**
   * Clear all middlewares
   */
  clear() {
    this.#middlewares = [];
    this.#hooks.forEach(hooks => hooks.length = 0);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new pipeline
 * @param {...MiddlewareFunction} middlewares - Initial middlewares
 * @returns {OrchestrationMiddleware}
 */
export function pipeline(...middlewares) {
  const p = new OrchestrationMiddleware();
  
  for (const mw of middlewares) {
    p.use(mw);
  }
  
  return p;
}

/**
 * Create conditional middleware
 * @param {Function} condition - Condition function
 * @param {MiddlewareFunction} middleware - Middleware to run if true
 * @returns {MiddlewareFunction}
 */
export function conditional(condition, middleware) {
  return async (ctx, next) => {
    const shouldRun = await condition(ctx);
    if (shouldRun) {
      await middleware(ctx, next);
    } else {
      await next();
    }
  };
}

/**
 * Create error handler middleware
 * @param {Function} handler - Error handler
 * @returns {MiddlewareFunction}
 */
export function errorHandler(handler) {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      await handler(error, ctx);
    }
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

/**
 * Get default orchestration middleware instance
 * @returns {OrchestrationMiddleware}
 */
export function getOrchestrationMiddleware() {
  if (!defaultInstance) {
    defaultInstance = new OrchestrationMiddleware();
  }
  return defaultInstance;
}

/**
 * Reset default instance (primarily for testing)
 */
export function resetOrchestrationMiddleware() {
  defaultInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export default OrchestrationMiddleware;
