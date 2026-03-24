/**
 * CV Schema and Validation
 * Defines the structure and validation for Agent CVs
 */

/**
 * CV Schema definition
 */
export const CVSchema = {
  // Required fields
  required: ['id', 'name', 'version', 'capabilities'],
  
  // Field types and constraints
  fields: {
    id: { type: 'string', pattern: /^[a-z0-9_-]+$/ },
    name: { type: 'string', minLength: 1, maxLength: 100 },
    version: { type: 'string', pattern: /^\d+\.\d+\.\d+/ },
    description: { type: 'string', optional: true },
    
    capabilities: {
      type: 'object',
      required: true,
      fields: {
        languages: { type: 'array', items: 'string' },
        domains: { type: 'array', items: 'string' },
        tools: { type: 'array', items: 'string' },
        maxContextTokens: { type: 'number', min: 1000 },
        supportsStreaming: { type: 'boolean' },
        supportsVision: { type: 'boolean' },
        supportsFunctionCalling: { type: 'boolean', optional: true },
        supportsParallelToolCalls: { type: 'boolean', optional: true }
      }
    },
    
    performance: {
      type: 'object',
      optional: true,
      fields: {
        successRate: { type: 'number', min: 0, max: 1 },
        avgLatency: { type: 'number', min: 0 },
        qualityScore: { type: 'number', min: 0, max: 100 },
        tasksCompleted: { type: 'number', min: 0 },
        tasksSucceeded: { type: 'number', min: 0, optional: true },
        tasksFailed: { type: 'number', min: 0, optional: true },
        lastUpdated: { type: 'number', optional: true }
      }
    },
    
    execution: {
      type: 'object',
      optional: true,
      fields: {
        preferredClient: { type: 'string', enum: ['claude', 'kimi', 'codex', 'auto'] },
        fallbackClients: { type: 'array', items: 'string' },
        parallelizable: { type: 'boolean' },
        retryPolicy: {
          type: 'object',
          fields: {
            maxRetries: { type: 'number', min: 0 },
            backoff: { type: 'string', enum: ['fixed', 'linear', 'exponential'] },
            initialDelay: { type: 'number', min: 0, optional: true },
            maxDelay: { type: 'number', min: 0, optional: true }
          }
        },
        timeout: { type: 'number', min: 0 }
      }
    },
    
    resources: {
      type: 'object',
      optional: true,
      fields: {
        minMemory: { type: 'number', min: 0 },
        maxMemory: { type: 'number', min: 0 },
        priority: { type: 'number', min: 1, max: 10 },
        cpuCores: { type: 'number', min: 1, optional: true }
      }
    },
    
    specialization: {
      type: 'object',
      optional: true,
      fields: {
        primary: { type: 'string' },
        secondary: { type: 'array', items: 'string' },
        certifications: { type: 'array', items: 'string' },
        experience: {
          type: 'object',
          optional: true,
          fields: {
            years: { type: 'number', min: 0 },
            projects: { type: 'array', items: 'string' }
          }
        }
      }
    },
    
    lifecycle: {
      type: 'object',
      optional: true,
      fields: {
        status: { type: 'string', enum: ['active', 'idle', 'suspended', 'deprecated'] },
        maxLifetime: { type: 'number', min: 0 },
        createdAt: { type: 'number', optional: true },
        expiresAt: { type: 'number', optional: true }
      }
    },
    
    metadata: {
      type: 'object',
      optional: true,
      fields: {
        author: { type: 'string' },
        tags: { type: 'array', items: 'string' },
        category: { type: 'string' }
      }
    }
  }
};

/**
 * Validate a CV against the schema
 * @param {Object} cv - CV to validate
 * @returns {Object} - Validation result { valid: boolean, errors: string[] }
 */
export function validateCV(cv) {
  const errors = [];
  
  if (!cv || typeof cv !== 'object') {
    return { valid: false, errors: ['CV must be an object'] };
  }
  
  // Check required fields
  for (const field of CVSchema.required) {
    if (!(field in cv)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate fields
  for (const [fieldName, fieldSchema] of Object.entries(CVSchema.fields)) {
    const value = cv[fieldName];
    
    if (value === undefined) {
      if (fieldSchema.required && !fieldSchema.optional) {
        errors.push(`Missing required field: ${fieldName}`);
      }
      continue;
    }
    
    const fieldErrors = validateField(fieldName, value, fieldSchema);
    errors.push(...fieldErrors);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate a single field
 * @param {string} name - Field name
 * @param {*} value - Field value
 * @param {Object} schema - Field schema
 * @returns {string[]} - Array of error messages
 */
function validateField(name, value, schema) {
  const errors = [];
  
  // Type validation
  if (schema.type === 'string' && typeof value !== 'string') {
    errors.push(`${name} must be a string`);
    return errors;
  }
  
  if (schema.type === 'number' && typeof value !== 'number') {
    errors.push(`${name} must be a number`);
    return errors;
  }
  
  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${name} must be a boolean`);
    return errors;
  }
  
  if (schema.type === 'array' && !Array.isArray(value)) {
    errors.push(`${name} must be an array`);
    return errors;
  }
  
  if (schema.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
    errors.push(`${name} must be an object`);
    return errors;
  }
  
  // String constraints
  if (schema.type === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${name} must be at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${name} must be at most ${schema.maxLength} characters`);
    }
    if (schema.pattern && !schema.pattern.test(value)) {
      errors.push(`${name} does not match required pattern`);
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${name} must be one of: ${schema.enum.join(', ')}`);
    }
  }
  
  // Number constraints
  if (schema.type === 'number') {
    if (schema.min !== undefined && value < schema.min) {
      errors.push(`${name} must be at least ${schema.min}`);
    }
    if (schema.max !== undefined && value > schema.max) {
      errors.push(`${name} must be at most ${schema.max}`);
    }
  }
  
  // Array constraints
  if (schema.type === 'array') {
    if (schema.items === 'string') {
      const nonStrings = value.filter(item => typeof item !== 'string');
      if (nonStrings.length > 0) {
        errors.push(`${name} must contain only strings`);
      }
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${name} must have at least ${schema.minItems} items`);
    }
  }
  
  // Object constraints - validate nested fields
  if (schema.type === 'object' && schema.fields) {
    for (const [nestedName, nestedSchema] of Object.entries(schema.fields)) {
      const nestedValue = value[nestedName];
      
      if (nestedValue === undefined) {
        if (nestedSchema.required && !nestedSchema.optional) {
          errors.push(`${name}.${nestedName} is required`);
        }
        continue;
      }
      
      const nestedErrors = validateField(`${name}.${nestedName}`, nestedValue, nestedSchema);
      errors.push(...nestedErrors);
    }
  }
  
  return errors;
}

/**
 * Create a default CV with minimal required fields
 * @param {string} id - CV ID
 * @param {string} name - Agent name
 * @returns {Object} - Default CV
 */
export function createDefaultCV(id, name) {
  return {
    id,
    name,
    version: '1.0.0',
    description: '',
    capabilities: {
      languages: [],
      domains: [],
      tools: [],
      maxContextTokens: 100000,
      supportsStreaming: true,
      supportsVision: false
    },
    performance: {
      successRate: 0.9,
      avgLatency: 2000,
      qualityScore: 80,
      tasksCompleted: 0
    },
    execution: {
      preferredClient: 'auto',
      fallbackClients: [],
      parallelizable: false,
      retryPolicy: {
        maxRetries: 3,
        backoff: 'exponential'
      },
      timeout: 300000
    },
    resources: {
      minMemory: 256,
      maxMemory: 2048,
      priority: 5
    },
    specialization: {
      primary: 'generalist',
      secondary: [],
      certifications: []
    },
    lifecycle: {
      status: 'active',
      maxLifetime: 3600000
    },
    metadata: {
      author: 'system',
      tags: [],
      category: 'general'
    },
    createdAt: Date.now()
  };
}

/**
 * Sanitize a CV - remove undefined/null values and normalize
 * @param {Object} cv - CV to sanitize
 * @returns {Object} - Sanitized CV
 */
export function sanitizeCV(cv) {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(cv)) {
    if (value === undefined || value === null) continue;
    
    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = sanitizeCV(value);
      if (Object.keys(nested).length > 0) {
        sanitized[key] = nested;
      }
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Compare two CVs and return differences
 * @param {Object} cv1 - First CV
 * @param {Object} cv2 - Second CV
 * @returns {Object} - Differences { added, removed, changed }
 */
export function diffCVs(cv1, cv2) {
  const added = {};
  const removed = {};
  const changed = {};
  
  // Find added and changed
  for (const key in cv2) {
    if (!(key in cv1)) {
      added[key] = cv2[key];
    } else if (JSON.stringify(cv1[key]) !== JSON.stringify(cv2[key])) {
      changed[key] = { from: cv1[key], to: cv2[key] };
    }
  }
  
  // Find removed
  for (const key in cv1) {
    if (!(key in cv2)) {
      removed[key] = cv1[key];
    }
  }
  
  return { added, removed, changed };
}

export default {
  CVSchema,
  validateCV,
  createDefaultCV,
  sanitizeCV,
  diffCVs
};
