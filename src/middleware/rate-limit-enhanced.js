/**
 * @fileoverview Enhanced Rate Limiting Middleware with distributed support
 * @module middleware/rate-limit-enhanced
 * @description Advanced rate limiting with tiered limits, distributed support, and smart throttling
 * @version 5.0.0
 */

import { RateLimiter, RateLimitStrategy } from '../security/rate-limiter.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Enhanced rate limit configurations
 * @const {Object<string, RateLimitConfig>}
 */
export const enhancedRateLimitConfig = {
  // Default API rate limit
  default: {
    strategy: RateLimitStrategy.TOKEN_BUCKET,
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    bucketSize: 100,
    refillRate: 100 / 60 // per second
  },
  
  // Auth endpoints (stricter)
  auth: {
    strategy: RateLimitStrategy.TOKEN_BUCKET,
    windowMs: 60 * 1000,
    maxRequests: 10,
    bucketSize: 10,
    refillRate: 10 / 60
  },
  
  // API endpoints (higher limits)
  api: {
    strategy: RateLimitStrategy.TOKEN_BUCKET,
    windowMs: 60 * 1000,
    maxRequests: 1000,
    bucketSize: 1000,
    refillRate: 1000 / 60
  },
  
  // Claude AI endpoints
  claude: {
    strategy: RateLimitStrategy.TOKEN_BUCKET,
    windowMs: 60 * 1000,
    maxRequests: 50,
    bucketSize: 50,
    refillRate: 50 / 60
  },
  
  // WebSocket messages
  websocket: {
    strategy: RateLimitStrategy.TOKEN_BUCKET,
    windowMs: 1000, // 1 second
    maxRequests: 100,
    bucketSize: 100,
    refillRate: 100
  },
  
  // Batch operations (lower limits)
  batch: {
    strategy: RateLimitStrategy.SLIDING_WINDOW,
    windowMs: 60 * 1000,
    maxRequests: 10,
    bucketSize: 10,
    refillRate: 10 / 60
  },
  
  // Admin endpoints (very high limits)
  admin: {
    strategy: RateLimitStrategy.TOKEN_BUCKET,
    windowMs: 60 * 1000,
    maxRequests: 5000,
    bucketSize: 5000,
    refillRate: 5000 / 60
  }
};

// ============================================================================
// Enhanced Rate Limit Error
// ============================================================================

/**
 * Enhanced rate limit error with retry information
 */
export class EnhancedRateLimitError extends Error {
  /**
   * @param {string} message - Error message
   * @param {Object} details - Error details
   */
  constructor(message, details = {}) {
    super(message);
    this.name = 'EnhancedRateLimitError';
    this.statusCode = 429;
    this.retryAfter = details.retryAfter || 60;
    this.limit = details.limit || 0;
    this.remaining = details.remaining || 0;
    this.reset = details.reset || Date.now() + 60000;
    this.windowMs = details.windowMs || 60000;
    this.scope = details.scope || 'global';
  }

  toJSON() {
    return {
      error: this.message,
      retryAfter: this.retryAfter,
      limit: this.limit,
      remaining: this.remaining,
      reset: this.reset,
      windowMs: this.windowMs,
      scope: this.scope
    };
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

/**
 * Distributed storage adapter interface
 * @type {Object|null}
 */
let distributedStorage = null;

// ============================================================================
// Key Generators
// ============================================================================

/**
 * Default key generator using IP address
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
function defaultKeyGenerator(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (cfConnectingIp) return cfConnectingIp;
  if (realIp) return realIp;
  
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

/**
 * Generate per-client key based on API key or user ID
 * @param {Object} req - Express request object
 * @returns {string} Rate limit key
 */
function clientKeyGenerator(req) {
  // Check for authenticated user
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  
  // Check for API key
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  
  if (apiKey) {
    const normalizedKey = apiKey.replace(/^Bearer\s+/i, '');
    return `apikey:${normalizedKey.slice(0, 16)}`;
  }
  
  // Fall back to IP-based key
  return `ip:${defaultKeyGenerator(req)}`;
}

/**
 * Generate composite key (IP + endpoint)
 * @param {Object} req - Express request object
 * @returns {string}
 */
function endpointKeyGenerator(req) {
  const ip = defaultKeyGenerator(req);
  const endpoint = req.route?.path || req.path || 'unknown';
  return `${ip}:${endpoint}`;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create enhanced rate limiting middleware
 * @param {string|Object} presetOrOptions - Preset name or custom options
 * @param {Object} [options={}] - Additional middleware options
 * @param {Function} [options.keyGenerator] - Custom key generator
 * @param {boolean} [options.perClient=false] - Use per-client limits
 * @param {boolean} [options.perEndpoint=false] - Use per-endpoint limits
 * @param {boolean} [options.skipSuccessfulRequests=false] - Skip counting successful requests
 * @param {boolean} [options.skipFailedRequests=false] - Skip counting failed requests
 * @param {Function} [options.onLimitReached] - Callback when limit is reached
 * @param {Function} [options.onRejected] - Callback when request is rejected
 * @param {string} [options.scope='global'] - Rate limit scope identifier
 * @param {boolean} [options.distributed=false] - Use distributed storage
 * @returns {Function} Express middleware function
 */
export function enhancedRateLimitMiddleware(presetOrOptions, options = {}) {
  // Get base configuration
  let baseConfig;
  
  if (typeof presetOrOptions === 'string') {
    const preset = enhancedRateLimitConfig[presetOrOptions];
    if (!preset) {
      throw new Error(`Unknown rate limit preset: ${presetOrOptions}`);
    }
    baseConfig = preset;
  } else {
    baseConfig = presetOrOptions;
  }
  
  // Determine key generator
  let keyGenerator;
  if (options.keyGenerator) {
    keyGenerator = options.keyGenerator;
  } else if (options.perEndpoint) {
    keyGenerator = endpointKeyGenerator;
  } else if (options.perClient) {
    keyGenerator = clientKeyGenerator;
  } else {
    keyGenerator = defaultKeyGenerator;
  }
  
  const {
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    onLimitReached = null,
    onRejected = null,
    scope = 'global',
    distributed = false
  } = options;
  
  // Create or get rate limiter instance
  const configKey = JSON.stringify({ ...baseConfig, scope, distributed });
  let limiter = limiterInstances.get(configKey);
  
  if (!limiter) {
    const storage = distributed && distributedStorage 
      ? distributedStorage 
      : sharedStorage;
      
    limiter = new RateLimiter({
      strategy: baseConfig.strategy,
      windowMs: baseConfig.windowMs,
      maxRequests: baseConfig.maxRequests,
      bucketSize: baseConfig.bucketSize,
      refillRate: baseConfig.refillRate,
      storage,
      keyPrefix: `ratelimit:${scope}:`
    });
    limiterInstances.set(configKey, limiter);
  }
  
  // Return Express middleware
  return async (req, res, next) => {
    // Skip if disabled
    if (req.headers['x-skip-rate-limit'] === process.env.RATE_LIMIT_SECRET) {
      return next();
    }
    
    const key = keyGenerator(req);
    
    try {
      const result = await limiter.consume(key);
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.reset / 1000));
      res.setHeader('X-RateLimit-Scope', scope);
      
      // Store rate limit info on request
      req.rateLimit = {
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
        allowed: result.allowed,
        scope
      };
      
      if (!result.allowed) {
        // Rate limit exceeded
        const retryAfter = result.retryAfter || Math.ceil((result.reset - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfter);
        
        if (onLimitReached) {
          onLimitReached(req, res, key, result);
        }
        
        const error = new EnhancedRateLimitError(
          'Too many requests, please try again later',
          {
            retryAfter,
            limit: result.limit,
            remaining: result.remaining,
            reset: result.reset,
            windowMs: baseConfig.windowMs,
            scope
          }
        );
        
        if (onRejected) {
          return onRejected(req, res, error);
        }
        
        return res.status(429).json(error.toJSON());
      }
      
      // Setup skip logic if needed
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalEnd = res.end;
        res.end = function(...args) {
          res.end = originalEnd;
          const isSuccess = res.statusCode < 400;
          
          if ((skipSuccessfulRequests && isSuccess) || (skipFailedRequests && !isSuccess)) {
            limiter.reset(key).catch(() => {});
          }
          
          return originalEnd.apply(res, args);
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
 * Default rate limit middleware
 * @param {Object} [options={}] - Additional options
 * @returns {Function} Express middleware
 */
export function defaultRateLimit(options = {}) {
  return enhancedRateLimitMiddleware('default', options);
}

/**
 * Auth rate limit middleware (strict)
 * @param {Object} [options={}] - Additional options
 * @returns {Function} Express middleware
 */
export function authRateLimit(options = {}) {
  return enhancedRateLimitMiddleware('auth', { perClient: true, ...options });
}

/**
 * API rate limit middleware
 * @param {Object} [options={}] - Additional options
 * @returns {Function} Express middleware
 */
export function apiRateLimit(options = {}) {
  return enhancedRateLimitMiddleware('api', { perClient: true, ...options });
}

/**
 * Claude API rate limit middleware
 * @param {Object} [options={}] - Additional options
 * @returns {Function} Express middleware
 */
export function claudeRateLimit(options = {}) {
  return enhancedRateLimitMiddleware('claude', { perClient: true, ...options });
}

/**
 * Batch operations rate limit middleware
 * @param {Object} [options={}] - Additional options
 * @returns {Function} Express middleware
 */
export function batchRateLimit(options = {}) {
  return enhancedRateLimitMiddleware('batch', { perClient: true, ...options });
}

/**
 * Admin rate limit middleware (high limits)
 * @param {Object} [options={}] - Additional options
 * @returns {Function} Express middleware
 */
export function adminRateLimit(options = {}) {
  return enhancedRateLimitMiddleware('admin', { perClient: true, ...options });
}

/**
 * WebSocket message rate limit middleware
 * @param {Object} [options={}] - Additional options
 * @returns {Function} WebSocket middleware
 */
export function websocketRateLimit(options = {}) {
  return enhancedRateLimitMiddleware('websocket', {
    keyGenerator: (ws, req) => {
      return req.socket?.remoteAddress || 'unknown';
    },
    ...options
  });
}

// ============================================================================
// Distributed Storage
// ============================================================================

/**
 * Set distributed storage adapter
 * @param {Object} adapter - Storage adapter with get/set/delete methods
 */
export function setDistributedStorage(adapter) {
  distributedStorage = adapter;
}

/**
 * Get distributed storage adapter
 * @returns {Object|null}
 */
export function getDistributedStorage() {
  return distributedStorage;
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
  const config = enhancedRateLimitConfig[preset];
  if (!config) {
    throw new Error(`Unknown rate limit preset: ${preset}`);
  }
  
  const configKey = JSON.stringify(config);
  const limiter = limiterInstances.get(configKey);
  
  if (!limiter) {
    return {
      limit: config.maxRequests,
      remaining: config.maxRequests,
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
  const config = enhancedRateLimitConfig[preset];
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

/**
 * Get rate limiting statistics
 * @returns {Object}
 */
export function getRateLimitStats() {
  const stats = {
    instances: limiterInstances.size,
    presets: Object.keys(enhancedRateLimitConfig),
    distributed: !!distributedStorage
  };
  
  limiterInstances.forEach((limiter, key) => {
    stats[key] = {
      storageSize: limiter.storage?.size || 0
    };
  });
  
  return stats;
}

export default enhancedRateLimitMiddleware;
