/**
 * @fileoverview Error Classes
 * @module utils/errors
 * @description Custom error classes for the application
 * @version 5.0.0
 */

/**
 * Application Error class
 * @class
 * @extends Error
 * @description Standard application error with status code
 */
export class AppError extends Error {
  /**
   * Creates a new AppError
   * @constructor
   * @param {string} message - Error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [code='INTERNAL_ERROR'] - Error code
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error class
 * @class
 * @extends AppError
 * @description Error for validation failures
 */
export class ValidationError extends AppError {
  /**
   * Creates a new ValidationError
   * @constructor
   * @param {string} message - Error message
   * @param {Object} [details={}] - Validation details
   */
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Not Found Error class
 * @class
 * @extends AppError
 * @description Error for resource not found
 */
export class NotFoundError extends AppError {
  /**
   * Creates a new NotFoundError
   * @constructor
   * @param {string} [message='Resource not found'] - Error message
   */
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized Error class
 * @class
 * @extends AppError
 * @description Error for unauthorized access
 */
export class UnauthorizedError extends AppError {
  /**
   * Creates a new UnauthorizedError
   * @constructor
   * @param {string} [message='Unauthorized'] - Error message
   */
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden Error class
 * @class
 * @extends AppError
 * @description Error for forbidden access
 */
export class ForbiddenError extends AppError {
  /**
   * Creates a new ForbiddenError
   * @constructor
   * @param {string} [message='Forbidden'] - Error message
   */
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export default { AppError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError };
