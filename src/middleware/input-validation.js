/**
 * @fileoverview Input Validation Middleware
 * Comprehensive input sanitization, validation, and SQL injection protection
 * @module src/middleware/input-validation
 * @version 5.0.0
 */

import { z } from 'zod';
import { Sanitizer } from '../security/sanitizer.js';
import { Validator } from '../security/validator.js';

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * File upload validation schema
 */
export const FileUploadSchema = z.object({
  filename: z.string()
    .min(1, 'Filename is required')
    .max(255, 'Filename too long')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Filename contains invalid characters'),
  size: z.number()
    .max(10 * 1024 * 1024, 'File too large (max 10MB)'),
  mimetype: z.enum([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/json',
    'text/markdown'
  ], { message: 'Invalid file type' }),
  originalname: z.string().min(1)
});

/**
 * Common input validation schemas
 */
export const ValidationSchemas = {
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/).min(1).max(128),
  
  uuid: z.string().uuid(),
  
  email: z.string().email().min(5).max(254),
  
  username: z.string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username contains invalid characters'),
  
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  
  url: z.string().url().max(2048),
  
  searchQuery: z.string().min(1).max(200).trim(),
  
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
  }),
  
  sortParams: z.object({
    sortBy: z.string().regex(/^[a-zA-Z0-9_]+$/).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
  }),
  
  fileUpload: FileUploadSchema
};

// ============================================================================
// SQL Injection Protection
// ============================================================================

/**
 * SQL Injection detector patterns
 * @const {Array<Object>}
 */
const SQL_INJECTION_PATTERNS = [
  { pattern: /(\%27)|(\')|(\-\-)|(\%23)|(#)/gi, name: 'quote_comment', severity: 'high' },
  { pattern: /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/gi, name: 'assignment', severity: 'high' },
  { pattern: /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/gi, name: 'or_injection', severity: 'critical' },
  { pattern: /((\%27)|(\'))union/gi, name: 'union_injection', severity: 'critical' },
  { pattern: /union\s+select/gi, name: 'union_select', severity: 'critical' },
  { pattern: /exec\s*\(/gi, name: 'exec_function', severity: 'critical' },
  { pattern: /insert\s+into/gi, name: 'insert_injection', severity: 'high' },
  { pattern: /delete\s+from/gi, name: 'delete_injection', severity: 'critical' },
  { pattern: /drop\s+table/gi, name: 'drop_table', severity: 'critical' },
  { pattern: /alter\s+table/gi, name: 'alter_table', severity: 'critical' },
  { pattern: /;\s*shutdown/gi, name: 'shutdown', severity: 'critical' },
  { pattern: /benchmark\s*\(/gi, name: 'benchmark', severity: 'high' },
  { pattern: /sleep\s*\(/gi, name: 'sleep', severity: 'high' },
  { pattern: /waitfor\s+delay/gi, name: 'waitfor_delay', severity: 'high' },
  { pattern: /xp_/gi, name: 'extended_proc', severity: 'critical' },
  { pattern: /sp_/gi, name: 'stored_proc', severity: 'high' },
  { pattern: /@@version/gi, name: 'version_probe', severity: 'medium' },
  { pattern: /information_schema/gi, name: 'schema_probe', severity: 'high' },
  { pattern: /sys\./gi, name: 'system_table', severity: 'high' }
];

/**
 * NoSQL Injection detector patterns
 * @const {Array<Object>}
 */
const NOSQL_INJECTION_PATTERNS = [
  { pattern: /\$where/gi, name: 'where_operator', severity: 'critical' },
  { pattern: /\$regex/gi, name: 'regex_operator', severity: 'high' },
  { pattern: /\$ne/gi, name: 'not_equal', severity: 'high' },
  { pattern: /\$gt/gi, name: 'greater_than', severity: 'medium' },
  { pattern: /\$gte/gi, name: 'gte', severity: 'medium' },
  { pattern: /\$lt/gi, name: 'less_than', severity: 'medium' },
  { pattern: /\$lte/gi, name: 'lte', severity: 'medium' },
  { pattern: /\$exists/gi, name: 'exists', severity: 'high' },
  { pattern: /\$in\s*\[/gi, name: 'in_operator', severity: 'medium' },
  { pattern: /\$nin\s*\[/gi, name: 'not_in', severity: 'medium' },
  { pattern: /\$or\s*\[/gi, name: 'or_operator', severity: 'high' },
  { pattern: /\$and\s*\[/gi, name: 'and_operator', severity: 'medium' }
];

/**
 * Detect potential SQL injection attempts
 * @param {string} input - Input to check
 * @returns {Object} Detection result
 */
export function detectSQLInjection(input) {
  if (typeof input !== 'string') return { detected: false };
  
  const findings = [];
  
  for (const { pattern, name, severity } of SQL_INJECTION_PATTERNS) {
    const matches = input.match(pattern);
    if (matches) {
      findings.push({
        pattern: name,
        severity,
        matches: matches.length
      });
    }
  }
  
  return {
    detected: findings.length > 0,
    findings,
    riskLevel: findings.some(f => f.severity === 'critical') ? 'critical' :
               findings.some(f => f.severity === 'high') ? 'high' : 'medium'
  };
}

/**
 * Detect potential NoSQL injection attempts
 * @param {string|Object} input - Input to check
 * @returns {Object} Detection result
 */
export function detectNoSQLInjection(input) {
  const findings = [];
  
  const checkString = (str) => {
    for (const { pattern, name, severity } of NOSQL_INJECTION_PATTERNS) {
      if (pattern.test(str)) {
        findings.push({ pattern: name, severity });
      }
    }
  };
  
  if (typeof input === 'string') {
    checkString(input);
  } else if (typeof input === 'object' && input !== null) {
    const checkObject = (obj) => {
      for (const [key, value] of Object.entries(obj)) {
        // Check for operator keys
        if (key.startsWith('$')) {
          findings.push({
            pattern: 'operator_in_key',
            key,
            severity: 'high'
          });
        }
        
        if (typeof value === 'string') {
          checkString(value);
        } else if (typeof value === 'object') {
          checkObject(value);
        }
      }
    };
    checkObject(input);
  }
  
  return {
    detected: findings.length > 0,
    findings,
    riskLevel: findings.some(f => f.severity === 'critical') ? 'critical' :
               findings.some(f => f.severity === 'high') ? 'high' : 'medium'
  };
}

// ============================================================================
// Input Sanitization Middleware
// ============================================================================

/**
 * Create input sanitization middleware
 * @param {Object} [options={}] - Sanitization options
 * @param {boolean} [options.sanitizeBody=true] - Sanitize request body
 * @param {boolean} [options.sanitizeQuery=true] - Sanitize query parameters
 * @param {boolean} [options.sanitizeParams=true] - Sanitize URL params
 * @param {string[]} [options.excludedFields=[]] - Fields to exclude from sanitization
 * @returns {Function} Express middleware
 */
export function sanitizeInput(options = {}) {
  const {
    sanitizeBody = true,
    sanitizeQuery = true,
    sanitizeParams = true,
    excludedFields = ['password', 'token', 'secret', 'apiKey']
  } = options;

  const sanitizer = new Sanitizer();

  return (req, res, next) => {
    try {
      // Sanitize body
      if (sanitizeBody && req.body) {
        req.body = sanitizeObject(req.body, sanitizer, excludedFields);
      }

      // Sanitize query
      if (sanitizeQuery && req.query) {
        req.query = sanitizeObject(req.query, sanitizer, excludedFields);
      }

      // Sanitize params
      if (sanitizeParams && req.params) {
        req.params = sanitizeObject(req.params, sanitizer, excludedFields);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Recursively sanitize object values
 * @param {Object} obj - Object to sanitize
 * @param {Sanitizer} sanitizer - Sanitizer instance
 * @param {string[]} excludedFields - Fields to skip
 * @returns {Object} Sanitized object
 */
function sanitizeObject(obj, sanitizer, excludedFields) {
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, sanitizer, excludedFields));
  }

  if (typeof obj === 'object' && obj !== null) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (excludedFields.includes(key)) {
        result[key] = value; // Keep excluded fields unchanged
      } else if (typeof value === 'string') {
        result[key] = sanitizer.xss(value);
      } else if (typeof value === 'object') {
        result[key] = sanitizeObject(value, sanitizer, excludedFields);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}

// ============================================================================
// SQL Injection Protection Middleware
// ============================================================================

/**
 * Create SQL injection protection middleware
 * @param {Object} [options={}] - Protection options
 * @param {boolean} [options.checkBody=true] - Check request body
 * @param {boolean} [options.checkQuery=true] - Check query parameters
 * @param {boolean} [options.checkParams=true] - Check URL params
 * @param {boolean} [options.blockOnDetection=true] - Block request if injection detected
 * @returns {Function} Express middleware
 */
export function sqlInjectionProtection(options = {}) {
  const {
    checkBody = true,
    checkQuery = true,
    checkParams = true,
    blockOnDetection = true
  } = options;

  return (req, res, next) => {
    const findings = [];

    const checkValue = (value, path) => {
      if (typeof value === 'string') {
        const result = detectSQLInjection(value);
        if (result.detected) {
          findings.push({ path, ...result });
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
          checkValue(val, `${path}.${key}`);
        }
      }
    };

    if (checkBody && req.body) checkValue(req.body, 'body');
    if (checkQuery && req.query) checkValue(req.query, 'query');
    if (checkParams && req.params) checkValue(req.params, 'params');

    if (findings.length > 0) {
      // Log the detection
      console.warn('[SQL Injection Detection]', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        findings
      });

      if (blockOnDetection) {
        const error = new Error('Potential security violation detected');
        error.statusCode = 403;
        error.code = 'SQL_INJECTION_DETECTED';
        return next(error);
      }

      // Attach findings to request for later use
      req.sqlInjectionFindings = findings;
    }

    next();
  };
}

// ============================================================================
// File Upload Validation Middleware
// ============================================================================

/**
 * Create file upload validation middleware
 * @param {Object} [options={}] - Validation options
 * @param {number} [options.maxSize=10*1024*1024] - Max file size in bytes
 * @param {string[]} [options.allowedTypes] - Allowed MIME types
 * @param {string[]} [options.allowedExtensions] - Allowed file extensions
 * @param {boolean} [options.scanContent=true] - Scan file content
 * @returns {Function} Express middleware
 */
export function validateFileUpload(options = {}) {
  const {
    maxSize = 10 * 1024 * 1024,
    allowedTypes = null,
    allowedExtensions = null,
    scanContent = true
  } = options;

  return async (req, res, next) => {
    try {
      if (!req.file && !req.files) {
        return next();
      }

      const files = req.files || [req.file];

      for (const file of files) {
        // Check file size
        if (file.size > maxSize) {
          const error = new Error(`File too large. Maximum size: ${formatBytes(maxSize)}`);
          error.statusCode = 413;
          return next(error);
        }

        // Check MIME type
        if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
          const error = new Error(`File type not allowed. Allowed: ${allowedTypes.join(', ')}`);
          error.statusCode = 415;
          return next(error);
        }

        // Check extension
        if (allowedExtensions) {
          const ext = file.originalname.split('.').pop().toLowerCase();
          if (!allowedExtensions.includes(ext)) {
            const error = new Error(`File extension not allowed`);
            error.statusCode = 415;
            return next(error);
          }
        }

        // Check for dangerous extensions
        const dangerousExt = ['exe', 'dll', 'bat', 'cmd', 'sh', 'php', 'jsp', 'asp', 'aspx'];
        const ext = file.originalname.split('.').pop().toLowerCase();
        if (dangerousExt.includes(ext)) {
          const error = new Error('Dangerous file type detected');
          error.statusCode = 403;
          return next(error);
        }

        // Content scanning
        if (scanContent && file.buffer) {
          const contentCheck = scanFileContent(file.buffer);
          if (!contentCheck.safe) {
            const error = new Error(`File content validation failed: ${contentCheck.reason}`);
            error.statusCode = 403;
            return next(error);
          }
        }

        // Validate filename
        const filenameCheck = validateFilename(file.originalname);
        if (!filenameCheck.valid) {
          const error = new Error(`Invalid filename: ${filenameCheck.reason}`);
          error.statusCode = 400;
          return next(error);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Scan file content for malicious patterns
 * @param {Buffer} buffer - File buffer
 * @returns {Object} Scan result
 */
function scanFileContent(buffer) {
  // Check for executable signatures
  const executableSigs = [
    Buffer.from([0x4D, 0x5A]), // Windows executable
    Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF
    Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]), // Java class
    Buffer.from([0x50, 0x4B, 0x03, 0x04])  // JAR/ZIP (could be JAR)
  ];

  for (const sig of executableSigs) {
    if (buffer.slice(0, sig.length).equals(sig)) {
      return { safe: false, reason: 'Executable file detected' };
    }
  }

  // Check for script patterns in text files
  const content = buffer.toString('utf8', 0, Math.min(buffer.length, 4096));
  const dangerousPatterns = [
    /<script/i,
    /<%.*%>/,  // JSP
    /<%!/,     // JSP declaration
    /<%=/,     // JSP expression
    /<\?php/i,
    /#!/,      // Shebang
    /eval\s*\(/,
    /document\.write/
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      return { safe: false, reason: 'Suspicious content pattern detected' };
    }
  }

  return { safe: true };
}

/**
 * Validate filename
 * @param {string} filename - Filename to validate
 * @returns {Object} Validation result
 */
function validateFilename(filename) {
  // Check for null bytes
  if (filename.includes('\0')) {
    return { valid: false, reason: 'Filename contains null bytes' };
  }

  // Check for path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, reason: 'Path traversal detected' };
  }

  // Check length
  if (filename.length > 255) {
    return { valid: false, reason: 'Filename too long' };
  }

  // Check for control characters
  if (containsControlCharacters(filename)) {
    return { valid: false, reason: 'Filename contains control characters' };
  }

  return { valid: true };
}

/**
 * Check whether a string contains ASCII control characters.
 * @param {string} value - String to inspect
 * @returns {boolean} Whether control characters were found
 */
function containsControlCharacters(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }

  return false;
}

/**
 * Format bytes to human readable
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// ============================================================================
// Zod Schema Validation Middleware
// ============================================================================

/**
 * Create schema validation middleware using Zod
 * @param {z.ZodSchema} schema - Zod schema
 * @param {string} [source='body'] - Request property to validate
 * @returns {Function} Express middleware
 */
export function validateSchema(schema, source = 'body') {
  return async (req, res, next) => {
    try {
      const result = await schema.parseAsync(req[source]);
      req[source] = result; // Replace with parsed/validated data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        const validationError = new Error('Validation failed');
        validationError.statusCode = 400;
        validationError.code = 'VALIDATION_ERROR';
        validationError.errors = formattedErrors;
        return next(validationError);
      }
      next(error);
    }
  };
}

// ============================================================================
// Combined Validation Middleware
// ============================================================================

/**
 * Create comprehensive input validation middleware
 * Combines sanitization, SQL injection protection, and schema validation
 * @param {Object} [options={}] - Options
 * @param {z.ZodSchema} [options.bodySchema] - Body validation schema
 * @param {z.ZodSchema} [options.querySchema] - Query validation schema
 * @param {z.ZodSchema} [options.paramsSchema] - Params validation schema
 * @param {boolean} [options.enableSanitization=true] - Enable input sanitization
 * @param {boolean} [options.enableSQLProtection=true] - Enable SQL injection protection
 * @returns {Function[]} Array of Express middleware
 */
export function createValidationMiddleware(options = {}) {
  const middlewares = [];

  // Sanitization first
  if (options.enableSanitization !== false) {
    middlewares.push(sanitizeInput());
  }

  // SQL injection protection
  if (options.enableSQLProtection !== false) {
    middlewares.push(sqlInjectionProtection());
  }

  // Schema validation
  if (options.bodySchema) {
    middlewares.push(validateSchema(options.bodySchema, 'body'));
  }
  if (options.querySchema) {
    middlewares.push(validateSchema(options.querySchema, 'query'));
  }
  if (options.paramsSchema) {
    middlewares.push(validateSchema(options.paramsSchema, 'params'));
  }

  return middlewares;
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  sanitizeInput,
  sqlInjectionProtection,
  validateFileUpload,
  validateSchema,
  createValidationMiddleware,
  detectSQLInjection,
  detectNoSQLInjection,
  ValidationSchemas
};
