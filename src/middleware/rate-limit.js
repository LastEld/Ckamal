/**
 * Rate Limiting Middleware
 * Express middleware for rate limiting using token bucket algorithm
 *
 * @module src/middleware/rate-limit
 * @version 5.0.0
 */

import { RateLimiter, RateLimitStrategy } from '../security/rate-limiter.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Rate limit configurations
 * @const {Object<string, RateLimitConfig>}
 */
export const rateLimitConfig = {
  default: { windowMs: 15 * 60 * 1000, max: 100 },
  auth: { windowMs: 60 * 1000, max: 10 },
  claude: { windowMs: 60 * 1000, max: 30 }
};

// ============================================================================
// Errors
// ============================================================================

/**
 * Rate limit error
 */
export class RateLimitError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} retryAfter - Seconds to wait before retry
   * @param {Object} [details={}] - Additional error details
   */
  constructor(message, retryAfter, details = {}) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

// ============================================================================
// Storage
// ============================================================================

/**
 * Shared storage for rate limiters
 * @type {Map<string, Object>}
 */
const sharedStorage = new Map();

/**
 * Rate limiter instances by preset name
 * @type {Map<string, RateLimiter>}
 */
const limiterInstances = new Map();

// ============================================================================
// Key Generators
// ============================================================================

/**
 * Default key generator using IP address
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
function defaultKeyGenerator(req) {
  // Try to get client IP from various headers
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  
  // Use the first IP from x-forwarded-for if present
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  // Fall back to other headers
  if (cfConnectingIp) return cfConnectingIp;
  if (realIp) return realIp;
  
  // Finally use the socket remote address
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

/**
 * Generate per-client key based on API key
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
function clientKeyGenerator(req) {
  // Check for API key in headers
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  
  if (apiKey) {
    // Use API key as part of the key
    const normalizedKey = apiKey.replace(/^Bearer\s+/i, '');
    // Extract first 8 chars for client identification
    return `client:${normalizedKey.slice(0, 16) || normalizedKey}`;
  }
  
  // Fall back to IP-based key
  return `ip:${defaultKeyGenerator(req)}`;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create rate limiting middleware
 * @param {string|Object} presetOrOptions - Preset name ('default', 'auth', 'claude') or custom options
 * @param {Object} [options={}] - Additional middleware options
 * @param {Function} [options.keyGenerator] - Custom key generator function
 * @param {boolean} [options.perClient=false] - Use per-client limits (API key based)
 * @param {boolean} [options.skipSuccessfulRequests=false] - Skip counting successful requests
 * @param {boolean} [options.skipFailedRequests=false] - Skip counting failed requests
 * @param {Function} [options.onLimitReached] - Callback when limit is reached
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Using preset
 * app.use('/api/', rateLimitMiddleware('default'));
 * app.use('/api/auth/', rateLimitMiddleware('auth'));
 * 
 * @example
 * // Using custom options
 * app.use('/api/custom/', rateLimitMiddleware({ windowMs: 60000, max: 50 }));
 * 
 * @example
 * // With per-client limits
 * app.use('/api/claude/', rateLimitMiddleware('claude', { perClient: true }));
 */
export function rateLimitMiddleware(presetOrOptions, options = {}) {
  // Get base configuration
  let baseConfig;
  
  if (typeof presetOrOptions === 'string') {
    const preset = rateLimitConfig[presetOrOptions];
    if (!preset) {
      throw new Error(`Unknown rate limit preset: ${presetOrOptions}`);
    }
    baseConfig = preset;
  } else {
    baseConfig = presetOrOptions;
  }
  
  // Merge with options
  const {
    keyGenerator = options.perClient ? clientKeyGenerator : defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    onLimitReached = null
  } = options;
  
  // Create or get rate limiter instance
  const configKey = JSON.stringify(baseConfig);
  let limiter = limiterInstances.get(configKey);
  
  if (!limiter) {
    limiter = new RateLimiter({
      strategy: RateLimitStrategy.TOKEN_BUCKET,
      windowMs: baseConfig.windowMs,
      maxRequests: baseConfig.max,
      bucketSize: baseConfig.max,
      refillRate: baseConfig.max / (baseConfig.windowMs / 1000),
      storage: sharedStorage,
      keyPrefix: `ratelimit:${baseConfig.windowMs}:`
    });
    limiterInstances.set(configKey, limiter);
  }
  
  // Return Express middleware
  return async (req, res, next) => {
    const key = keyGenerator(req);
    
    try {
      const result = await limiter.consume(key);
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.reset / 1000));
      
      // Store rate limit info on request for later use
      req.rateLimit = {
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
        allowed: result.allowed
      };
      
      if (!result.allowed) {
        // Rate limit exceeded
        const retryAfter = result.retryAfter || Math.ceil((result.reset - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfter);
        
        if (onLimitReached) {
          onLimitReached(req, res, key, result);
        }
        
        const error = new RateLimitError(
          'Too many requests, please try again later',
          retryAfter,
          { limit: result.limit, windowMs: baseConfig.windowMs }
        );
        error.statusCode = 429;
        return next(error);
      }
      
      // Setup skip logic if needed
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;
        res.send = function(body) {
          res.send = originalSend;
          const isSuccess = res.statusCode < 400;
          
          if ((skipSuccessfulRequests && isSuccess) || (skipFailedRequests && !isSuccess)) {
            limiter.reset(key).catch(() => {});
          }
          
          return res.send(body);
        };
      }
      
      next();
    } catch (error) {
      // Log error but don't block the request
      console.error('[RateLimit] Error checking rate limit:', error.message);
      next();
    }
  };
}

// ============================================================================
// Preset Helpers
// ============================================================================

/**
 * Get default rate limit middleware (100 requests per 15 minutes)
 * @param {Object} [options={}] - Additional options
 * @returns {Function} Express middleware
 */
export function defaultRateLimit(options = {}) {
  return rateLimitMiddleware('default', options);
}

/**
 * Get strict rate limit middleware for auth endpoints (10 requests per minute)
 * @param {Object} [options={}] - Additional options
 * @returns {Function} Express middleware
 */
export function authRateLimit(options = {}) {
  return rateLimitMiddleware('auth', options);
}

/**
 * Get Claude API rate limit middleware (30 requests per minute)
 * @param {Object} [options={}] - Additional options
 * @returns {Function} Express middleware
 */
export function claudeRateLimit(options = {}) {
  return rateLimitMiddleware('claude', { perClient: true, ...options });
}

// ============================================================================
// Management Functions
// ============================================================================

/**
 * Get rate limit status for a key
 * @param {string} key - Rate limit key
 * @param {string} [preset='default'] - Configuration preset
 * @returns {Promise<Object>} Rate limit status
 */
export async function getRateLimitStatus(key, preset = 'default') {
  const config = rateLimitConfig[preset];
  if (!config) {
    throw new Error(`Unknown rate limit preset: ${preset}`);
  }
  
  const configKey = JSON.stringify(config);
  const limiter = limiterInstances.get(configKey);
  
  if (!limiter) {
    return {
      limit: config.max,
      remaining: config.max,
      reset: Date.now() + config.windowMs,
      allowed: true
    };
  }
  
  return limiter.getStatus(key);
}

/**
 * Reset rate limit for a key
 * @param {string} key - Rate limit key
 * @param {string} [preset='default'] - Configuration preset
 * @returns {Promise<boolean>} Whether reset was successful
 */
export async function resetRateLimit(key, preset = 'default') {
  const config = rateLimitConfig[preset];
  if (!config) {
    throw new Error(`Unknown rate limit preset: ${preset}`);
  }
  
  const configKey = JSON.stringify(config);
  const limiter = limiterInstances.get(configKey);
  
  if (!limiter) {
    return false;
  }
  
  return limiter.reset(key);
}

/**
 * Get all rate limiter instances (for monitoring)
 * @returns {Map<string, RateLimiter>} Rate limiter instances
 */
export function getRateLimiterInstances() {
  return new Map(limiterInstances);
}

/**
 * Clear all rate limiter instances and storage
 */
export function clearRateLimiters() {
  limiterInstances.clear();
  sharedStorage.clear();
}

// ============================================================================
// Default Export
// ============================================================================

export default rateLimitMiddleware;
