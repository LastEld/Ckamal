/**
 * @fileoverview Validation Manager for CogniMesh v5.0
 * @module validation/index
 * @description Centralized validation system with Zod integration and error aggregation
 */

import { z } from 'zod';
import * as schemas from './schemas.js';

/**
 * Custom validation error with aggregated error details
 * @extends Error
 */
export class ValidationError extends Error {
  /**
   * @param {string} message - Error message
   * @param {Array<import('./schemas.js').ValidationIssue>} issues - Validation issues
   */
  constructor(message, issues = []) {
    super(message);
    this.name = 'ValidationError';
    this.issues = issues;
    
    /** @type {Record<string, string[]>} */
    this.fieldErrors = this._aggregateFieldErrors(issues);
  }

  /**
   * Aggregate errors by field path
   * @private
   * @param {Array<import('./schemas.js').ValidationIssue>} issues
   * @returns {Record<string, string[]>}
   */
  _aggregateFieldErrors(issues) {
    /** @type {Record<string, string[]>} */
    const errors = {};
    
    for (const issue of issues) {
      const path = issue.path.join('.') || 'root';
      if (!errors[path]) {
        errors[path] = [];
      }
      errors[path].push(issue.message);
    }
    
    return errors;
  }

  /**
   * Get formatted error messages
   * @returns {string}
   */
  toString() {
    const lines = [this.message, ''];
    
    for (const [path, messages] of Object.entries(this.fieldErrors)) {
      lines.push(`  ${path}:`);
      for (const msg of messages) {
        lines.push(`    - ${msg}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Get errors as JSON-serializable object
   * @returns {Record<string, string[]>}
   */
  toJSON() {
    return this.fieldErrors;
  }
}

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} success - Whether validation passed
 * @property {any} [data] - Validated and transformed data
 * @property {ValidationError} [error] - Validation error if failed
 * @property {Array<import('./schemas.js').ValidationIssue>} [issues] - All validation issues
 */

/**
 * Schema registry and validation manager
 * @class ValidationSchemas
 */
export class ValidationSchemas {
  constructor() {
    /** @private @type {Map<string, z.ZodSchema>} */
    this._schemas = new Map();
    
    /** @private @type {Map<string, import('./schemas.js').SchemaMetadata>} */
    this._metadata = new Map();

    // Register built-in schemas
    this._registerBuiltinSchemas();
  }

  /**
   * Register built-in schemas from schemas.js
   * @private
   */
  _registerBuiltinSchemas() {
    // Task schemas
    this.register('task.create', schemas.taskCreateSchema, {
      description: 'Schema for creating a new task',
      category: 'task'
    });
    this.register('task.update', schemas.taskUpdateSchema, {
      description: 'Schema for updating an existing task',
      category: 'task'
    });
    this.register('task.query', schemas.taskQuerySchema, {
      description: 'Schema for task queries',
      category: 'task'
    });
    this.register('task.id', schemas.taskIdSchema, {
      description: 'Schema for task ID validation',
      category: 'task'
    });

    // Roadmap schemas
    this.register('roadmap.create', schemas.roadmapCreateSchema, {
      description: 'Schema for creating a roadmap',
      category: 'roadmap'
    });
    this.register('roadmap.update', schemas.roadmapUpdateSchema, {
      description: 'Schema for updating a roadmap',
      category: 'roadmap'
    });
    this.register('roadmap.milestone', schemas.milestoneSchema, {
      description: 'Schema for milestone validation',
      category: 'roadmap'
    });

    // User schemas
    this.register('user.create', schemas.userCreateSchema, {
      description: 'Schema for user registration',
      category: 'user'
    });
    this.register('user.update', schemas.userUpdateSchema, {
      description: 'Schema for user profile updates',
      category: 'user'
    });
    this.register('user.login', schemas.userLoginSchema, {
      description: 'Schema for user login',
      category: 'user'
    });
    this.register('user.preferences', schemas.userPreferencesSchema, {
      description: 'Schema for user preferences',
      category: 'user'
    });

    // Context schemas
    this.register('context.create', schemas.contextCreateSchema, {
      description: 'Schema for creating context',
      category: 'context'
    });
    this.register('context.update', schemas.contextUpdateSchema, {
      description: 'Schema for updating context',
      category: 'context'
    });
    this.register('context.message', schemas.contextMessageSchema, {
      description: 'Schema for context messages',
      category: 'context'
    });

    // Alert schemas
    this.register('alert.create', schemas.alertCreateSchema, {
      description: 'Schema for creating alerts',
      category: 'alert'
    });
    this.register('alert.update', schemas.alertUpdateSchema, {
      description: 'Schema for updating alert status',
      category: 'alert'
    });
    this.register('alert.config', schemas.alertConfigSchema, {
      description: 'Schema for alert configuration',
      category: 'alert'
    });

    // Claude API schemas
    this.register('claude.request', schemas.claudeRequestSchema, {
      description: 'Schema for Claude API requests',
      category: 'claude'
    });
    this.register('claude.message', schemas.claudeMessageSchema, {
      description: 'Schema for Claude messages',
      category: 'claude'
    });
    this.register('claude.tool', schemas.claudeToolSchema, {
      description: 'Schema for Claude tool definitions',
      category: 'claude'
    });

    // System schemas
    this.register('system.config', schemas.systemConfigSchema, {
      description: 'Schema for system configuration',
      category: 'system'
    });
    this.register('system.health', schemas.systemHealthSchema, {
      description: 'Schema for health check responses',
      category: 'system'
    });
    this.register('system.metrics', schemas.systemMetricsSchema, {
      description: 'Schema for system metrics',
      category: 'system'
    });

    // Pagination schemas
    this.register('pagination.params', schemas.paginationParamsSchema, {
      description: 'Schema for pagination parameters',
      category: 'pagination'
    });
    this.register('pagination.response', schemas.paginationResponseSchema, {
      description: 'Schema for paginated responses',
      category: 'pagination'
    });

    // WebSocket schemas
    this.register('websocket.connect', schemas.websocketConnectSchema, {
      description: 'Schema for WebSocket connection params',
      category: 'websocket'
    });
    this.register('websocket.message', schemas.websocketMessageSchema, {
      description: 'Schema for WebSocket messages',
      category: 'websocket'
    });
    this.register('websocket.event', schemas.websocketEventSchema, {
      description: 'Schema for WebSocket events',
      category: 'websocket'
    });
  }

  /**
   * Register a schema with optional metadata
   * @template T
   * @param {string} name - Unique schema identifier
   * @param {z.ZodSchema<T>} schema - Zod schema
   * @param {Partial<import('./schemas.js').SchemaMetadata>} [metadata] - Schema metadata
   * @returns {ValidationSchemas} - Returns this for chaining
   * @throws {Error} If schema name already exists
   */
  register(name, schema, metadata = {}) {
    if (this._schemas.has(name)) {
      throw new Error(`Schema "${name}" is already registered`);
    }

    this._schemas.set(name, schema);
    this._metadata.set(name, {
      name,
      description: metadata.description || '',
      category: metadata.category || 'general',
      createdAt: new Date().toISOString(),
      ...metadata
    });

    return this;
  }

  /**
   * Unregister a schema
   * @param {string} name - Schema name to unregister
   * @returns {boolean} - Whether the schema was removed
   */
  unregister(name) {
    const hadSchema = this._schemas.has(name);
    this._schemas.delete(name);
    this._metadata.delete(name);
    return hadSchema;
  }

  /**
   * Get a registered schema
   * @param {string} name - Schema name
   * @returns {z.ZodSchema | undefined} - The schema or undefined
   */
  get(name) {
    return this._schemas.get(name);
  }

  /**
   * Get schema metadata
   * @param {string} name - Schema name
   * @returns {import('./schemas.js').SchemaMetadata | undefined}
   */
  getMetadata(name) {
    return this._metadata.get(name);
  }

  /**
   * Check if a schema is registered
   * @param {string} name - Schema name
   * @returns {boolean}
   */
  has(name) {
    return this._schemas.has(name);
  }

  /**
   * List all registered schema names
   * @returns {string[]}
   */
  list() {
    return Array.from(this._schemas.keys());
  }

  /**
   * List schemas by category
   * @param {string} category - Category filter
   * @returns {string[]}
   */
  listByCategory(category) {
    const names = [];
    for (const [name, meta] of this._metadata) {
      if (meta.category === category) {
        names.push(name);
      }
    }
    return names;
  }

  /**
   * Get all categories
   * @returns {string[]}
   */
  getCategories() {
    const categories = new Set();
    for (const meta of this._metadata.values()) {
      categories.add(meta.category);
    }
    return Array.from(categories);
  }

  /**
   * Validate data against a registered schema
   * @template T
   * @param {unknown} data - Data to validate
   * @param {string} schemaName - Name of registered schema
   * @returns {ValidationResult & { data?: T }}
   */
  validate(data, schemaName) {
    const schema = this._schemas.get(schemaName);
    
    if (!schema) {
      const error = new ValidationError(`Schema "${schemaName}" not found`, [{
        path: ['schema'],
        message: `Schema "${schemaName}" is not registered`,
        code: 'schema_not_found'
      }]);
      
      return {
        success: false,
        error,
        issues: error.issues
      };
    }

    return this._executeValidation(data, schema);
  }

  /**
   * Validate data against a schema directly
   * @template T
   * @param {unknown} data - Data to validate
   * @param {z.ZodSchema<T>} schema - Zod schema
   * @returns {ValidationResult & { data?: T }}
   */
  validateWithSchema(data, schema) {
    return this._executeValidation(data, schema);
  }

  /**
   * Execute validation and format result
   * @private
   * @template T
   * @param {unknown} data
   * @param {z.ZodSchema<T>} schema
   * @returns {ValidationResult & { data?: T }}
   */
  _executeValidation(data, schema) {
    const result = schema.safeParse(data);

    if (result.success) {
      return {
        success: true,
        data: result.data
      };
    }

    const issues = result.error.issues.map(issue => ({
      path: issue.path,
      message: issue.message,
      code: issue.code
    }));

    const error = new ValidationError('Validation failed', issues);

    return {
      success: false,
      error,
      issues
    };
  }

  /**
   * Validate data asynchronously (for schemas with async transforms/refinements)
   * @template T
   * @param {unknown} data - Data to validate
   * @param {string} schemaName - Name of registered schema
   * @returns {Promise<ValidationResult & { data?: T }>}
   */
  async validateAsync(data, schemaName) {
    const schema = this._schemas.get(schemaName);
    
    if (!schema) {
      const error = new ValidationError(`Schema "${schemaName}" not found`, [{
        path: ['schema'],
        message: `Schema "${schemaName}" is not registered`,
        code: 'schema_not_found'
      }]);
      
      return {
        success: false,
        error,
        issues: error.issues
      };
    }

    try {
      const validated = await schema.parseAsync(data);
      return {
        success: true,
        data: validated
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        const issues = err.issues.map(issue => ({
          path: issue.path,
          message: issue.message,
          code: issue.code
        }));

        const error = new ValidationError('Validation failed', issues);

        return {
          success: false,
          error,
          issues
        };
      }

      throw err;
    }
  }

  /**
   * Validate partial data (for PATCH operations)
   * @template T
   * @param {unknown} data - Data to validate
   * @param {string} schemaName - Name of registered schema
   * @returns {ValidationResult & { data?: Partial<T> }}
   */
  validatePartial(data, schemaName) {
    const schema = this._schemas.get(schemaName);
    
    if (!schema) {
      const error = new ValidationError(`Schema "${schemaName}" not found`, [{
        path: ['schema'],
        message: `Schema "${schemaName}" is not registered`,
        code: 'schema_not_found'
      }]);
      
      return {
        success: false,
        error,
        issues: error.issues
      };
    }

    // Create partial schema
    const partialSchema = schema instanceof z.ZodObject
      ? schema.partial()
      : schema;

    return this._executeValidation(data, partialSchema);
  }

  /**
   * Assert that data is valid (throws on validation failure)
   * @template T
   * @param {unknown} data - Data to validate
   * @param {string} schemaName - Name of registered schema
   * @returns {T} - Validated data
   * @throws {ValidationError}
   */
  assert(data, schemaName) {
    const result = this.validate(data, schemaName);
    
    if (!result.success) {
      throw result.error;
    }
    
    return result.data;
  }

  /**
   * Get inferred type from schema
   * @template T
   * @param {z.ZodSchema<T>} schema
   * @returns {T | undefined}
   */
  infer(schema) {
    return undefined;
  }
}

/**
 * Default validation instance
 * @type {ValidationSchemas}
 */
export const validator = new ValidationSchemas();

/**
 * Quick validation helper
 * @template T
 * @param {unknown} data - Data to validate
 * @param {z.ZodSchema<T>} schema - Zod schema
 * @returns {ValidationResult & { data?: T }}
 */
export function validate(data, schema) {
  return validator.validateWithSchema(data, schema);
}

/**
 * Create a validation middleware for Express/Fastify
 * @param {string} schemaName - Registered schema name
 * @param {string} [source='body'] - Request property to validate (body, query, params)
 * @returns {Function} Middleware function
 */
export function createValidator(schemaName, source = 'body') {
  return async (req, res, next) => {
    const result = validator.validate(req[source], schemaName);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: result.error.message,
        issues: result.issues
      });
    }
    
    // Attach validated data
    req[`validated${source.charAt(0).toUpperCase() + source.slice(1)}`] = result.data;
    next();
  };
}

/**
 * Re-export all schemas
 */
export { schemas };

export default ValidationSchemas;
