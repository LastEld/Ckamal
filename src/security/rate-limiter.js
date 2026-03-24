/**
 * @fileoverview Rate Limiter with multiple strategies
 * @module @cognimesh/security/rate-limiter
 * @version 5.0.0
 */

/**
 * Rate limiting strategies
 * @enum {string}
 */
export const RateLimitStrategy = {
  TOKEN_BUCKET: 'token_bucket',
  SLIDING_WINDOW: 'sliding_window',
  FIXED_WINDOW: 'fixed_window'
};

/**
 * Rate Limiter with multiple strategies
 * @class RateLimiter
 */
export class RateLimiter {
  /**
   * @param {Object} [options={}] - Rate limiter options
   * @param {string} [options.strategy='token_bucket'] - Rate limiting strategy
   * @param {number} [options.maxRequests=100] - Maximum requests per window
   * @param {number} [options.windowMs=60000] - Window size in milliseconds
   * @param {string} [options.keyPrefix='ratelimit:'] - Key prefix for storage
   * @param {number} [options.bucketSize=100] - Token bucket size
   * @param {number} [options.refillRate=1.67] - Token refill rate per second
   * @param {Map} [options.storage] - Storage backend (Map or Redis-like)
   * @param {string} [options.headerLimit='X-RateLimit-Limit'] - Limit header name
   * @param {string} [options.headerRemaining='X-RateLimit-Remaining'] - Remaining header name
   * @param {string} [options.headerReset='X-RateLimit-Reset'] - Reset header name
   * @param {string} [options.headerRetryAfter='Retry-After'] - Retry-After header name
   */
  constructor(options = {}) {
    this.strategy = options.strategy || RateLimitStrategy.TOKEN_BUCKET;
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000;
    this.keyPrefix = options.keyPrefix || 'ratelimit:';
    this.bucketSize = options.bucketSize || this.maxRequests;
    this.refillRate = options.refillRate || this.bucketSize / (this.windowMs / 1000);
    this.storage = options.storage || new Map();
    
    this.headers = {
      limit: options.headerLimit || 'X-RateLimit-Limit',
      remaining: options.headerRemaining || 'X-RateLimit-Remaining',
      reset: options.headerReset || 'X-RateLimit-Reset',
      retryAfter: options.headerRetryAfter || 'Retry-After'
    };
  }

  /**
   * Check if request is allowed without consuming tokens
   * @param {string} key - Rate limit key (e.g., IP, user ID)
   * @returns {Promise<Object>} Check result with allowed, limit, remaining, reset
   */
  async check(key) {
    const fullKey = this.keyPrefix + key;
    
    switch (this.strategy) {
      case RateLimitStrategy.TOKEN_BUCKET:
        return this.checkTokenBucket(fullKey);
      case RateLimitStrategy.SLIDING_WINDOW:
        return this.checkSlidingWindow(fullKey);
      case RateLimitStrategy.FIXED_WINDOW:
        return this.checkFixedWindow(fullKey);
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`);
    }
  }

  /**
   * Consume tokens for a request
   * @param {string} key - Rate limit key
   * @param {number} [tokens=1] - Number of tokens to consume
   * @returns {Promise<Object>} Consume result with allowed, limit, remaining, reset, retryAfter
   */
  async consume(key, tokens = 1) {
    const fullKey = this.keyPrefix + key;
    
    switch (this.strategy) {
      case RateLimitStrategy.TOKEN_BUCKET:
        return this.consumeTokenBucket(fullKey, tokens);
      case RateLimitStrategy.SLIDING_WINDOW:
        return this.consumeSlidingWindow(fullKey, tokens);
      case RateLimitStrategy.FIXED_WINDOW:
        return this.consumeFixedWindow(fullKey, tokens);
      default:
        throw new Error(`Unknown strategy: ${this.strategy}`);
    }
  }

  /**
   * Reset rate limit for a key
   * @param {string} key - Rate limit key
   * @returns {Promise<boolean>} Whether reset was successful
   */
  async reset(key) {
    const fullKey = this.keyPrefix + key;
    this.storage.delete(fullKey);
    return true;
  }

  /**
   * Check token bucket status
   * @private
   */
  checkTokenBucket(key) {
    const now = Date.now();
    const bucket = this.storage.get(key) || {
      tokens: this.bucketSize,
      lastRefill: now
    };
    
    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    const currentTokens = Math.min(this.bucketSize, bucket.tokens + tokensToAdd);
    
    return {
      allowed: currentTokens >= 1,
      limit: this.bucketSize,
      remaining: Math.floor(currentTokens),
      reset: Math.ceil((1 - (currentTokens % 1)) / this.refillRate * 1000) + now,
      strategy: this.strategy
    };
  }

  /**
   * Consume from token bucket
   * @private
   */
  consumeTokenBucket(key, tokens) {
    const now = Date.now();
    let bucket = this.storage.get(key);
    
    if (!bucket) {
      bucket = { tokens: this.bucketSize, lastRefill: now };
    }
    
    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    bucket.tokens = Math.min(this.bucketSize, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
    
    if (bucket.tokens < tokens) {
      const waitTime = Math.ceil((tokens - bucket.tokens) / this.refillRate * 1000);
      this.storage.set(key, bucket);
      
      return {
        allowed: false,
        limit: this.bucketSize,
        remaining: Math.floor(bucket.tokens),
        reset: now + waitTime,
        retryAfter: Math.ceil(waitTime / 1000),
        strategy: this.strategy
      };
    }
    
    bucket.tokens -= tokens;
    this.storage.set(key, bucket);
    
    return {
      allowed: true,
      limit: this.bucketSize,
      remaining: Math.floor(bucket.tokens),
      reset: Math.ceil((this.bucketSize - bucket.tokens) / this.refillRate * 1000) + now,
      strategy: this.strategy
    };
  }

  /**
   * Check sliding window status
   * @private
   */
  checkSlidingWindow(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const requests = this.storage.get(key) || [];
    
    const currentWindow = requests.filter(timestamp => timestamp > windowStart);
    const remaining = Math.max(0, this.maxRequests - currentWindow.length);
    
    let reset = now + this.windowMs;
    if (currentWindow.length > 0) {
      reset = currentWindow[0] + this.windowMs;
    }
    
    return {
      allowed: remaining > 0,
      limit: this.maxRequests,
      remaining,
      reset,
      strategy: this.strategy
    };
  }

  /**
   * Consume from sliding window
   * @private
   */
  consumeSlidingWindow(key, tokens) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    let requests = this.storage.get(key) || [];
    
    requests = requests.filter(timestamp => timestamp > windowStart);
    
    if (requests.length + tokens > this.maxRequests) {
      const oldestRequest = requests[0] || now;
      const retryAfter = Math.ceil((oldestRequest + this.windowMs - now) / 1000);
      this.storage.set(key, requests);
      
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: Math.max(0, this.maxRequests - requests.length),
        reset: oldestRequest + this.windowMs,
        retryAfter,
        strategy: this.strategy
      };
    }
    
    for (let i = 0; i < tokens; i++) {
      requests.push(now);
    }
    this.storage.set(key, requests);
    
    const reset = requests.length > 0 ? requests[0] + this.windowMs : now + this.windowMs;
    
    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - requests.length),
      reset,
      strategy: this.strategy
    };
  }

  /**
   * Check fixed window status
   * @private
   */
  checkFixedWindow(key) {
    const now = Date.now();
    const windowKey = this.getFixedWindowKey(key, now);
    const window = this.storage.get(windowKey) || { count: 0, start: this.getWindowStart(now) };
    
    const remaining = Math.max(0, this.maxRequests - window.count);
    const reset = window.start + this.windowMs;
    
    return {
      allowed: remaining > 0,
      limit: this.maxRequests,
      remaining,
      reset,
      strategy: this.strategy
    };
  }

  /**
   * Consume from fixed window
   * @private
   */
  consumeFixedWindow(key, tokens) {
    const now = Date.now();
    const windowKey = this.getFixedWindowKey(key, now);
    let window = this.storage.get(windowKey);
    
    if (!window) {
      window = { count: 0, start: this.getWindowStart(now) };
    }
    
    if (now > window.start + this.windowMs) {
      window = { count: 0, start: this.getWindowStart(now) };
    }
    
    if (window.count + tokens > this.maxRequests) {
      const retryAfter = Math.ceil((window.start + this.windowMs - now) / 1000);
      
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: Math.max(0, this.maxRequests - window.count),
        reset: window.start + this.windowMs,
        retryAfter,
        strategy: this.strategy
      };
    }
    
    window.count += tokens;
    this.storage.set(windowKey, window);
    
    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - window.count),
      reset: window.start + this.windowMs,
      strategy: this.strategy
    };
  }

  /**
   * Get fixed window key
   * @private
   */
  getFixedWindowKey(key, timestamp) {
    const windowIndex = Math.floor(timestamp / this.windowMs);
    return `${key}:${windowIndex}`;
  }

  /**
   * Get window start time
   * @private
   */
  getWindowStart(timestamp) {
    return Math.floor(timestamp / this.windowMs) * this.windowMs;
  }

  /**
   * Create Express/Fastify middleware
   * @param {Object} [options={}] - Middleware options
   * @param {Function} [options.keyGenerator] - Function to generate rate limit key from request
   * @param {boolean} [options.skipSuccessfulRequests=false] - Skip successful requests
   * @param {boolean} [options.skipFailedRequests=false] - Skip failed requests
   * @returns {Function} Middleware function
   */
  middleware(options = {}) {
    const keyGenerator = options.keyGenerator || ((req) => req.ip || req.headers['x-forwarded-for']);
    const skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    const skipFailedRequests = options.skipFailedRequests || false;
    
    return async (req, res, next) => {
      const key = keyGenerator(req);
      
      try {
        const result = await this.consume(key);
        
        res.setHeader(this.headers.limit, result.limit);
        res.setHeader(this.headers.remaining, Math.max(0, result.remaining));
        res.setHeader(this.headers.reset, Math.ceil(result.reset / 1000));
        
        if (!result.allowed) {
          res.setHeader(this.headers.retryAfter, result.retryAfter || Math.ceil((result.reset - Date.now()) / 1000));
          const error = new Error('Too many requests');
          error.statusCode = 429;
          return next(error);
        }
        
        if (skipSuccessfulRequests || skipFailedRequests) {
          const originalSend = res.send;
          res.send = (body) => {
            res.send = originalSend;
            const isSuccess = res.statusCode < 400;
            
            if ((skipSuccessfulRequests && isSuccess) || (skipFailedRequests && !isSuccess)) {
              this.reset(key).catch(() => {});
            }
            
            return res.send(body);
          };
        }
        
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Create WebSocket rate limiter
   * @param {Object} [options={}] - WebSocket options
   * @param {Function} [options.keyGenerator] - Function to generate key from WebSocket
   * @returns {Function} WebSocket middleware
   */
  websocketMiddleware(options = {}) {
    const keyGenerator = options.keyGenerator || ((ws, req) => req.socket.remoteAddress);
    
    return async (ws, req, next) => {
      const key = keyGenerator(ws, req);
      
      try {
        const result = await this.consume(key);
        
        if (!result.allowed) {
          ws.close(1008, 'Rate limit exceeded');
          return;
        }
        
        ws.rateLimit = result;
        next();
      } catch (error) {
        ws.close(1011, 'Internal error');
      }
    };
  }

  /**
   * Get rate limit status for a key
   * @param {string} key - Rate limit key
   * @returns {Promise<Object>} Current status
   */
  async getStatus(key) {
    return this.check(key);
  }

  /**
   * Get multiple rate limit statuses
   * @param {Array<string>} keys - Rate limit keys
   * @returns {Promise<Object>} Statuses by key
   */
  async getStatuses(keys) {
    const statuses = {};
    
    await Promise.all(
      keys.map(async (key) => {
        statuses[key] = await this.check(key);
      })
    );
    
    return statuses;
  }
}

export default RateLimiter;
