/**
 * @fileoverview Data Validator using Zod schemas
 * @module @cognimesh/security/validator
 * @version 5.0.0
 */

import { z } from 'zod';

/**
 * Data Validator using Zod schemas
 * @class Validator
 */
export class Validator {
  /**
   * @param {Object} [options={}] - Validator options
   * @param {boolean} [options.strict=true] - Strict validation
   * @param {boolean} [options.stripUnknown=false] - Strip unknown properties
   * @param {boolean} [options.abortEarly=false] - Abort on first error
   */
  constructor(options = {}) {
    this.options = {
      strict: true,
      stripUnknown: false,
      abortEarly: false,
      ...options
    };
    
    this.customRules = new Map();
    
    this.schemas = {
      email: z.string().email('Invalid email format'),
      password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain uppercase letter')
        .regex(/[a-z]/, 'Password must contain lowercase letter')
        .regex(/[0-9]/, 'Password must contain number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain special character'),
      uuid: z.string().uuid('Invalid UUID format'),
      url: z.string().url('Invalid URL format'),
      ipv4: z.string().regex(
        /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
        'Invalid IPv4 address'
      ),
      ipv6: z.string().regex(
        /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
        'Invalid IPv6 address'
      ),
      phone: z.string().regex(
        /^\+?[1-9]\d{1,14}$/,
        'Invalid phone number'
      )
    };
  }

  /**
   * Validate data against a Zod schema
   * @param {any} data - Data to validate
   * @param {z.ZodSchema} schema - Zod schema
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  validate(data, schema, options = {}) {
    const opts = { ...this.options, ...options };
    
    try {
      const result = schema.parse(data, { abortEarly: opts.abortEarly });
      
      return {
        success: true,
        data: result,
        errors: null
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          data: null,
          errors: this.formatErrors(error)
        };
      }
      throw error;
    }
  }

  /**
   * Validate data asynchronously
   * @param {any} data - Data to validate
   * @param {z.ZodSchema} schema - Zod schema
   * @param {Object} [options={}] - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateAsync(data, schema, options = {}) {
    const opts = { ...this.options, ...options };
    
    try {
      const result = await schema.parseAsync(data, { abortEarly: opts.abortEarly });
      
      return {
        success: true,
        data: result,
        errors: null
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          data: null,
          errors: this.formatErrors(error)
        };
      }
      throw error;
    }
  }

  /**
   * Sanitize and validate data
   * @param {any} data - Data to sanitize and validate
   * @param {z.ZodSchema} schema - Zod schema
   * @param {import('./sanitizer.js').Sanitizer} sanitizer - Sanitizer instance
   * @param {Object} [options={}] - Options
   * @returns {Object} Validation result
   */
  sanitizeAndValidate(data, schema, sanitizer, options = {}) {
    let sanitizedData = data;
    
    if (sanitizer && typeof sanitizer.comprehensive === 'function') {
      if (typeof data === 'string') {
        sanitizedData = sanitizer.xss(data);
      } else if (typeof data === 'object' && data !== null) {
        sanitizedData = this.sanitizeObjectValues(data, sanitizer);
      }
    }
    
    return this.validate(sanitizedData, schema, options);
  }

  /**
   * Sanitize all string values in an object recursively
   * @param {Object} obj - Object to sanitize
   * @param {import('./sanitizer.js').Sanitizer} sanitizer - Sanitizer instance
   * @returns {Object} Sanitized object
   * @private
   */
  sanitizeObjectValues(obj, sanitizer) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObjectValues(item, sanitizer));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          result[key] = sanitizer.xss(value);
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.sanitizeObjectValues(value, sanitizer);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    
    return obj;
  }

  /**
   * Format Zod errors to a consistent structure
   * @param {z.ZodError} error - Zod error
   * @returns {Array<Object>} Formatted errors
   */
  formatErrors(error) {
    return error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code,
      ...(err.minimum !== undefined && { minimum: err.minimum }),
      ...(err.maximum !== undefined && { maximum: err.maximum }),
      ...(err.expected !== undefined && { expected: err.expected }),
      ...(err.received !== undefined && { received: err.received })
    }));
  }

  /**
   * Register a custom validation rule
   * @param {string} name - Rule name
   * @param {Function} validator - Validation function
   * @param {string} [message='Validation failed'] - Error message
   */
  registerRule(name, validator, message = 'Validation failed') {
    this.customRules.set(name, { validator, message });
  }

  /**
   * Create a custom Zod schema from registered rule
   * @param {string} ruleName - Rule name
   * @returns {z.ZodSchema} Zod schema
   */
  createCustomSchema(ruleName) {
    const rule = this.customRules.get(ruleName);
    if (!rule) {
      throw new Error(`Custom rule '${ruleName}' not found`);
    }
    
    return z.custom(rule.validator, { message: rule.message });
  }

  /**
   * Create validation schema for common patterns
   * @param {string} pattern - Pattern name
   * @returns {z.ZodSchema} Zod schema
   */
  createSchema(pattern) {
    if (this.schemas[pattern]) {
      return this.schemas[pattern];
    }
    throw new Error(`Unknown pattern: ${pattern}`);
  }

  /**
   * Validate array of items
   * @param {Array} items - Items to validate
   * @param {z.ZodSchema} itemSchema - Schema for each item
   * @returns {Object} Validation result
   */
  validateArray(items, itemSchema) {
    const schema = z.array(itemSchema);
    return this.validate(items, schema);
  }

  /**
   * Validate object with specific shape
   * @param {Object} data - Data to validate
   * @param {Object} shape - Shape definition
   * @returns {Object} Validation result
   */
  validateObject(data, shape) {
    const schema = z.object(shape);
    return this.validate(data, schema);
  }

  /**
   * Create middleware for request validation
   * @param {z.ZodSchema} schema - Validation schema
   * @param {string} [source='body'] - Request property to validate
   * @returns {Function} Express middleware
   */
  middleware(schema, source = 'body') {
    return async (req, res, next) => {
      const result = await this.validateAsync(req[source], schema);
      
      if (!result.success) {
        const error = new Error('Validation failed');
        error.statusCode = 400;
        error.errors = result.errors;
        return next(error);
      }
      
      req[source] = result.data;
      next();
    };
  }

  /**
   * Get common validation schemas
   * @returns {Object} Common schemas
   */
  getCommonSchemas() {
    return {
      pagination: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(10)
      }),
      
      id: z.object({
        id: z.string().min(1)
      }),
      
      search: z.object({
        q: z.string().min(1).max(100),
        sort: z.enum(['asc', 'desc']).optional(),
        field: z.string().optional()
      }),
      
      dateRange: z.object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional()
      })
    };
  }
}

export default Validator;
