/**
 * Controller Helpers
 * Common utilities for controllers
 * 
 * @module controllers/helpers
 * @version 1.0.0
 */

const FALLBACK_ERROR_CODE = Object.freeze({
    ParseError: 'PARSE_ERROR',
    InvalidRequest: 'INVALID_REQUEST',
    MethodNotFound: 'METHOD_NOT_FOUND',
    InvalidParams: 'INVALID_PARAMS',
    InternalError: 'INTERNAL_ERROR'
});

class FallbackMcpError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = 'McpError';
        this.code = code;

        if (details !== undefined) {
            this.details = details;
        }
    }
}

let McpError = FallbackMcpError;
let ErrorCode = FALLBACK_ERROR_CODE;

try {
    const mcpTypes = await import('@modelcontextprotocol/sdk/types.js');
    McpError = mcpTypes.McpError || FallbackMcpError;
    ErrorCode = mcpTypes.ErrorCode || FALLBACK_ERROR_CODE;
} catch {
    // Keep local fallbacks when the optional MCP SDK package is not installed.
}

/**
 * Standardized success response
 * @typedef {Object} SuccessResponse
 * @property {boolean} success - Always true
 * @property {*} data - Response data
 * @property {Object} [meta] - Optional metadata
 */

/**
 * Standardized error response
 * @typedef {Object} ErrorResponse
 * @property {boolean} success - Always false
 * @property {string} error - Error message
 * @property {string} [code] - Error code
 * @property {*} [details] - Additional error details
 */

/**
 * Validation result
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} [errors] - Validation errors if invalid
 */

/**
 * Validate request data against a schema
 * @param {Object} schema - Validation schema with required fields and types
 * @param {Object} data - Data to validate
 * @returns {ValidationResult} Validation result
 * 
 * @example
 * const schema = {
 *   required: ['name', 'email'],
 *   types: { name: 'string', age: 'number' },
 *   enums: { status: ['active', 'inactive'] }
 * };
 * const result = validateRequest(schema, { name: 'John', email: 'john@example.com' });
 */
export function validateRequest(schema, data) {
    const errors = [];
    
    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['Data must be an object'] };
    }
    
    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
        for (const field of schema.required) {
            if (data[field] === undefined || data[field] === null) {
                errors.push(`Missing required field: ${field}`);
            }
        }
    }
    
    // Check types
    if (schema.types && typeof schema.types === 'object') {
        for (const [field, type] of Object.entries(schema.types)) {
            if (data[field] !== undefined && data[field] !== null) {
                const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
                if (actualType !== type) {
                    errors.push(`Field ${field} must be of type ${type}, got ${actualType}`);
                }
            }
        }
    }
    
    // Check enums
    if (schema.enums && typeof schema.enums === 'object') {
        for (const [field, allowedValues] of Object.entries(schema.enums)) {
            if (data[field] !== undefined && data[field] !== null) {
                if (!allowedValues.includes(data[field])) {
                    errors.push(`Field ${field} must be one of: ${allowedValues.join(', ')}`);
                }
            }
        }
    }
    
    // Check custom validators
    if (schema.validators && typeof schema.validators === 'object') {
        for (const [field, validator] of Object.entries(schema.validators)) {
            if (data[field] !== undefined && data[field] !== null) {
                const result = validator(data[field], data);
                if (result !== true) {
                    errors.push(typeof result === 'string' ? result : `Invalid value for ${field}`);
                }
            }
        }
    }
    
    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined
    };
}

/**
 * Format a successful response
 * @param {*} data - Response data
 * @param {Object} [meta] - Optional metadata (pagination, counts, etc.)
 * @returns {SuccessResponse} Standardized success response
 * 
 * @example
 * return formatResponse({ id: 1, name: 'Task' }, { total: 100, page: 1 });
 */
export function formatResponse(data, meta = null) {
    const response = {
        success: true,
        data
    };
    
    if (meta && typeof meta === 'object') {
        response.meta = meta;
    }
    
    return response;
}

/**
 * Format a list response with pagination
 * @param {Array} items - List items
 * @param {Object} pagination - Pagination info
 * @param {number} pagination.total - Total count
 * @param {number} pagination.limit - Items per page
 * @param {number} pagination.offset - Current offset
 * @returns {SuccessResponse} Formatted list response
 */
export function formatListResponse(items, pagination) {
    const { total, limit, offset } = pagination;
    const page = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);
    
    return formatResponse(items, {
        total,
        count: items.length,
        limit,
        offset,
        page,
        totalPages,
        hasNext: offset + items.length < total,
        hasPrev: offset > 0
    });
}

/**
 * Handle errors and return standardized error response
 * @param {Error} error - Error object
 * @param {Object} [options] - Error handling options
 * @param {string} [options.defaultMessage] - Default error message
 * @param {boolean} [options.throwMcpError] - Whether to throw McpError instead of returning
 * @returns {ErrorResponse} Standardized error response
 * @throws {McpError} If throwMcpError is true
 * 
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   return handleError(error, { defaultMessage: 'Operation failed' });
 * }
 */
export function handleError(error, options = {}) {
    const { defaultMessage = 'An error occurred', throwMcpError = false } = options;
    
    // Determine error code
    let code = 'INTERNAL_ERROR';
    let message = error.message || defaultMessage;
    
    if (error.code) {
        code = error.code;
    } else if (error.name === 'ValidationError') {
        code = 'VALIDATION_ERROR';
    } else if (error.name === 'NotFoundError') {
        code = 'NOT_FOUND';
    } else if (error.name === 'UnauthorizedError') {
        code = 'UNAUTHORIZED';
    } else if (error.name === 'ConflictError') {
        code = 'CONFLICT';
    }
    
    const errorResponse = {
        success: false,
        error: message,
        code,
        ...(error.details && { details: error.details })
    };
    
    if (throwMcpError) {
        const mcpCode = mapToMcpErrorCode(code);
        throw new McpError(mcpCode, message, error.details);
    }
    
    return errorResponse;
}

/**
 * Map internal error codes to MCP error codes
 * @param {string} code - Internal error code
 * @returns {ErrorCode} MCP error code
 */
function mapToMcpErrorCode(code) {
    const mapping = {
        'VALIDATION_ERROR': ErrorCode.InvalidParams,
        'NOT_FOUND': ErrorCode.InvalidRequest,
        'UNAUTHORIZED': ErrorCode.InvalidRequest,
        'CONFLICT': ErrorCode.InvalidRequest,
        'INTERNAL_ERROR': ErrorCode.InternalError,
        'METHOD_NOT_FOUND': ErrorCode.MethodNotFound,
        'PARSE_ERROR': ErrorCode.ParseError,
        'INVALID_REQUEST': ErrorCode.InvalidRequest
    };
    
    return mapping[code] || ErrorCode.InternalError;
}

/**
 * Wrap an async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {Object} [options] - Error handling options
 * @returns {Function} Wrapped function
 * 
 * @example
 * const safeCreate = withErrorHandling(async (data) => {
 *   return await createTask(data);
 * }, { defaultMessage: 'Failed to create task' });
 */
export function withErrorHandling(fn, options = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            return handleError(error, options);
        }
    };
}

/**
 * Create a standardized controller method wrapper
 * @param {Function} fn - Method implementation
 * @param {Object} [options] - Options
 * @returns {Function} Wrapped method
 */
export function createControllerMethod(fn, options = {}) {
    const { validate = null, requireId = false } = options;
    
    return async (...args) => {
        try {
            const [params] = args;
            
            // Validate if schema provided
            if (validate) {
                const validation = validateRequest(validate, params);
                if (!validation.valid) {
                    return {
                        success: false,
                        error: `Validation failed: ${validation.errors.join(', ')}`,
                        code: 'VALIDATION_ERROR'
                    };
                }
            }
            
            // Check ID if required
            if (requireId && (!params || !params.id)) {
                return {
                    success: false,
                    error: 'ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }
            
            return await fn(...args);
        } catch (error) {
            return handleError(error, options);
        }
    };
}

/**
 * Generate a unique ID
 * @param {string} [prefix] - Optional prefix
 * @returns {string} Unique ID
 */
export function generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Filter object to only include specified keys
 * @param {Object} obj - Source object
 * @param {string[]} keys - Keys to keep
 * @returns {Object} Filtered object
 */
export function pick(obj, keys) {
    const result = {};
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = obj[key];
        }
    }
    return result;
}

/**
 * Filter object to exclude specified keys
 * @param {Object} obj - Source object
 * @param {string[]} keys - Keys to exclude
 * @returns {Object} Filtered object
 */
export function omit(obj, keys) {
    const result = { ...obj };
    for (const key of keys) {
        delete result[key];
    }
    return result;
}

/**
 * Deep merge objects
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
export function deepMerge(...objects) {
    const isObject = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj);
    
    return objects.reduce((prev, obj) => {
        if (!obj) return prev;
        
        Object.keys(obj).forEach(key => {
            const pVal = prev[key];
            const oVal = obj[key];
            
            if (Array.isArray(pVal) && Array.isArray(oVal)) {
                prev[key] = [...pVal, ...oVal];
            } else if (isObject(pVal) && isObject(oVal)) {
                prev[key] = deepMerge(pVal, oVal);
            } else {
                prev[key] = oVal;
            }
        });
        
        return prev;
    }, {});
}

/**
 * Parse filter parameters from request
 * @param {Object} params - Request parameters
 * @param {string[]} [allowedFields] - Allowed filter fields
 * @returns {Object} Parsed filters
 */
export function parseFilters(params, allowedFields = []) {
    const filters = {};
    const filterPrefix = 'filter_';
    
    for (const [key, value] of Object.entries(params)) {
        if (key.startsWith(filterPrefix)) {
            const field = key.substring(filterPrefix.length);
            if (allowedFields.length === 0 || allowedFields.includes(field)) {
                filters[field] = value;
            }
        }
    }
    
    // Handle special filter parameters
    if (params.search) filters._search = params.search;
    if (params.from) filters._from = params.from;
    if (params.to) filters._to = params.to;
    if (params.status) filters.status = params.status;
    
    return filters;
}

/**
 * Parse pagination parameters
 * @param {Object} params - Request parameters
 * @param {Object} [defaults] - Default values
 * @returns {Object} Pagination params
 */
export function parsePagination(params = {}, defaults = {}) {
    const maxLimit = defaults.maxLimit || 1000;
    
    let limit = parseInt(params.limit, 10) || defaults.limit || 50;
    limit = Math.min(Math.max(1, limit), maxLimit);
    
    let offset = parseInt(params.offset, 10) || defaults.offset || 0;
    offset = Math.max(0, offset);
    
    return { limit, offset };
}

/**
 * Sort array by specified field and direction
 * @param {Array} items - Items to sort
 * @param {string} field - Sort field
 * @param {'asc'|'desc'} [direction='asc'] - Sort direction
 * @returns {Array} Sorted array
 */
export function sortBy(items, field, direction = 'asc') {
    const sorted = [...items].sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        
        if (typeof aVal === 'string') {
            return direction === 'asc' 
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }
        
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
    
    return sorted;
}

/**
 * Alias for validateRequest
 * @param {Object} schema - Validation schema
 * @param {Object} data - Data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateInput(schema, data) {
    return validateRequest(schema, data);
}

/**
 * Format an error response
 * @param {Error} error - Error object
 * @param {Object} [meta] - Additional metadata
 * @returns {ErrorResponse} Formatted error response
 */
export function formatError(error, meta = {}) {
    const handled = handleError(error, { defaultMessage: error.message });
    if (meta && Object.keys(meta).length > 0) {
        return { ...handled, meta };
    }
    return handled;
}

/**
 * Wrap an async function with error handling
 * Alias for withErrorHandling
 * @param {Function} fn - Async function to wrap
 * @param {Object} [options] - Error handling options
 * @returns {Function} Wrapped function
 */
export function handleAsync(fn, options = {}) {
    return withErrorHandling(fn, options);
}

/**
 * Paginate results
 * @param {Array} data - Data array
 * @param {Object} options - Pagination options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=50] - Items per page
 * @param {number} [options.offset] - Offset (overrides page if provided)
 * @returns {Object} Paginated result with metadata
 */
export function paginateResults(data, options = {}) {
    const limit = options.limit || 50;
    const page = options.page || 1;
    const offset = options.offset !== undefined ? options.offset : (page - 1) * limit;
    
    const paginated = data.slice(offset, offset + limit);
    const totalPages = Math.ceil(data.length / limit);
    
    return {
        data: paginated,
        meta: {
            total: data.length,
            count: paginated.length,
            limit,
            offset,
            page,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    };
}

export default {
    // Original exports
    validateRequest,
    formatResponse,
    formatListResponse,
    handleError,
    withErrorHandling,
    createControllerMethod,
    generateId,
    pick,
    omit,
    deepMerge,
    parseFilters,
    parsePagination,
    sortBy,
    // Aliases for spec compliance
    validateInput,
    formatError,
    handleAsync,
    paginateResults
};
