/**
 * @fileoverview CogniMesh Multi-Actor Authentication Middleware
 * Express middleware supporting users, agents, and API keys
 * @module src/auth/multi-actor-middleware
 * @version 5.0.0
 */

import { AsyncLocalStorage } from 'async_hooks';
import { AuthError, getAuthService, AUTH_MODES, ACTOR_TYPES } from './auth-service.js';

// ============================================================================
// Constants
// ============================================================================

const AUTH_HEADERS = {
  AUTHORIZATION: 'authorization',
  API_KEY: 'x-api-key',
  CSRF_TOKEN: 'x-csrf-token'
};

// const AUTH_SCHEMES = {
//   BEARER: 'bearer',
//   BASIC: 'basic'
// };

const DEFAULT_RATE_LIMITS = {
  [ACTOR_TYPES.USER]: { window: 60000, max: 100 },      // 100 requests per minute
  [ACTOR_TYPES.AGENT]: { window: 60000, max: 500 },     // 500 requests per minute
  [ACTOR_TYPES.API_KEY]: { window: 60000, max: 1000 }   // 1000 requests per minute
};

// ============================================================================
// Multi-Actor Auth Middleware
// ============================================================================

/**
 * Multi-actor authentication middleware for Express
 * Supports JWT tokens (users), API keys (agents/services), and session cookies
 */
export class MultiActorAuthMiddleware {
  #authService;
  #config;
  #contextStorage;
  #rateLimits;

  /**
   * @param {Object} options - Middleware options
   * @param {Object} options.authService - AuthService instance
   * @param {string} [options.mode='hybrid'] - Auth mode (trust, token, hybrid, required)
   * @param {boolean} [options.csrfProtection=true] - Enable CSRF protection for sessions
   * @param {Object} [options.rateLimits] - Rate limit configuration per actor type
   * @param {string[]} [options.publicPaths=[]] - Paths that don't require authentication
   * @param {Function} [options.onAuthSuccess] - Callback on successful auth
   * @param {Function} [options.onAuthFailure] - Callback on auth failure
   */
  constructor(options = {}) {
    this.#authService = options.authService || getAuthService();
    this.#config = {
      mode: options.mode || AUTH_MODES.HYBRID,
      csrfProtection: options.csrfProtection !== false,
      rateLimits: { ...DEFAULT_RATE_LIMITS, ...options.rateLimits },
      publicPaths: options.publicPaths || ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh', '/health'],
      onAuthSuccess: options.onAuthSuccess,
      onAuthFailure: options.onAuthFailure
    };
    this.#contextStorage = new AsyncLocalStorage();
    this.#rateLimits = new Map();
  }

  // ========================================================================
  // Main Middleware
  // ========================================================================

  /**
   * Express middleware function
   * @returns {Function} Express middleware
   */
  middleware() {
    return async (req, res, next) => {
      try {
        // Check if path is public
        if (this.#isPublicPath(req.path)) {
          req.auth = { authenticated: false, mode: this.#config.mode };
          return next();
        }

        // Extract and validate authentication
        const authContext = await this.#authenticateRequest(req);

        // Check rate limits
        if (!this.#checkRateLimit(authContext)) {
          throw new AuthError('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded', {
            retryAfter: this.#getRateLimitReset(authContext)
          });
        }

        // Set auth context on request
        req.auth = authContext;

        // Run callback if provided
        if (this.#config.onAuthSuccess) {
          await this.#config.onAuthSuccess(req, authContext);
        }

        // Run in async context
        this.#contextStorage.run(authContext, () => next());
      } catch (error) {
        this.#handleAuthError(error, req, res, next);
      }
    };
  }

  /**
   * Require authentication middleware
   * Must be used after main middleware
   * @returns {Function} Express middleware
   */
  requireAuth() {
    return (req, res, next) => {
      if (!req.auth?.authenticated) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      next();
    };
  }

  /**
   * Require specific permissions
   * @param {string|string[]} permissions - Required permission(s)
   * @returns {Function} Express middleware
   */
  requirePermission(permissions) {
    const required = Array.isArray(permissions) ? permissions : [permissions];

    return (req, res, next) => {
      if (!req.auth?.authenticated) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userPerms = req.auth.permissions || [];
      const hasPermission = required.every(p => 
        userPerms.includes(p) || userPerms.includes('*') || userPerms.includes('admin')
      );

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required
        });
      }

      next();
    };
  }

  /**
   * Require specific actor type
   * @param {string|string[]} actorTypes - Allowed actor type(s)
   * @returns {Function} Express middleware
   */
  requireActorType(actorTypes) {
    const allowed = Array.isArray(actorTypes) ? actorTypes : [actorTypes];

    return (req, res, next) => {
      if (!req.auth?.authenticated) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (!allowed.includes(req.auth.actorType)) {
        return res.status(403).json({
          error: 'Invalid actor type',
          code: 'INVALID_ACTOR_TYPE',
          allowed
        });
      }

      next();
    };
  }

  /**
   * Require company scope
   * @returns {Function} Express middleware
   */
  requireCompany() {
    return (req, res, next) => {
      if (!req.auth?.authenticated) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (!req.auth.companyId) {
        return res.status(403).json({
          error: 'Company scope required',
          code: 'COMPANY_REQUIRED'
        });
      }

      next();
    };
  }

  // ========================================================================
  // Authentication Methods
  // ========================================================================

  /**
   * Authenticate request using available credentials
   * @param {Object} req - Express request
   * @returns {Promise<Object>} Auth context
   */
  async #authenticateRequest(req) {
    const authHeader = req.headers[AUTH_HEADERS.AUTHORIZATION];
    const apiKey = req.headers[AUTH_HEADERS.API_KEY];
    const sessionCookie = req.cookies?.session;

    // Try API key first (highest priority for machine clients)
    if (apiKey) {
      return await this.#authenticateApiKey(apiKey, req);
    }

    // Try JWT bearer token
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return await this.#authenticateJwt(token, req);
    }

    // Try session cookie
    if (sessionCookie) {
      return await this.#authenticateSession(sessionCookie, req);
    }

    // No credentials found
    if (this.#config.mode === AUTH_MODES.REQUIRED) {
      throw new AuthError('AUTH_REQUIRED', 'Authentication required');
    }

    return {
      authenticated: false,
      mode: this.#config.mode,
      clientIp: req.ip
    };
  }

  /**
   * Authenticate JWT token
   * @param {string} token - JWT token
   * @param {Object} req - Express request
   * @returns {Promise<Object>} Auth context
   */
  async #authenticateJwt(token, req) {
    // Handle edge case: empty or malformed token
    if (!token || typeof token !== 'string') {
      throw new AuthError('INVALID_TOKEN', 'Token must be a non-empty string');
    }
    
    // Handle edge case: token with wrong number of segments
    const segments = token.split('.');
    if (segments.length !== 3) {
      throw new AuthError('INVALID_TOKEN', 'Invalid JWT format');
    }

    try {
      const context = await this.#authService.verifyAccessToken(token);
      context.clientIp = req.ip;
      context.userAgent = req.headers['user-agent'];
      return context;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      
      // Handle specific JWT verification errors
      if (error.code === 'ERR_JWT_EXPIRED') {
        throw new AuthError('TOKEN_EXPIRED', 'Token has expired');
      }
      if (error.code === 'ERR_JWT_INVALID' || error.code === 'ERR_JWS_INVALID') {
        throw new AuthError('INVALID_TOKEN', 'Invalid token signature');
      }
      if (error.code === 'ERR_JWT_CLAIM_INVALID') {
        throw new AuthError('INVALID_TOKEN', 'Invalid token claims');
      }
      if (error.code === 'ERR_JWT_ISSUER_INVALID') {
        throw new AuthError('INVALID_TOKEN', 'Invalid token issuer');
      }
      if (error.code === 'ERR_JWT_AUDIENCE_INVALID') {
        throw new AuthError('INVALID_TOKEN', 'Invalid token audience');
      }
      
      throw new AuthError('INVALID_TOKEN', `Token validation failed: ${error.message}`);
    }
  }

  /**
   * Authenticate API key
   * @param {string} apiKey - API key
   * @param {Object} req - Express request
   * @returns {Promise<Object>} Auth context
   */
  async #authenticateApiKey(apiKey, req) {
    try {
      const context = await this.#authService.validateApiKey(apiKey);
      context.clientIp = req.ip;
      context.userAgent = req.headers['user-agent'];
      return context;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('INVALID_API_KEY', 'Invalid API key');
    }
  }

  /**
   * Authenticate session cookie
   * @param {string} sessionId - Session ID
   * @param {Object} req - Express request
   * @returns {Promise<Object>} Auth context
   */
  async #authenticateSession(sessionId, req) {
    // CSRF protection for session-based auth
    if (this.#config.csrfProtection) {
      const csrfToken = req.headers[AUTH_HEADERS.CSRF_TOKEN];
      const csrfCookie = req.cookies?.csrf_token;

      if (!csrfToken || !csrfCookie || csrfToken !== csrfCookie) {
        throw new AuthError('AUTH_REQUIRED', 'Invalid CSRF token');
      }
    }

    // Note: Session validation would require session store integration
    // For now, return unauthenticated in session mode
    if (this.#config.mode === AUTH_MODES.REQUIRED) {
      throw new AuthError('AUTH_REQUIRED', 'Session authentication not implemented');
    }

    return {
      authenticated: false,
      mode: this.#config.mode,
      clientIp: req.ip
    };
  }

  // ========================================================================
  // Rate Limiting
  // ========================================================================

  /**
   * Check rate limit for actor
   * @param {Object} authContext - Auth context
   * @returns {boolean}
   */
  #checkRateLimit(authContext) {
    if (!authContext.authenticated) {
      // Apply stricter limits to unauthenticated requests
      return this.#checkUnauthenticatedLimit(authContext.clientIp);
    }

    const actorType = authContext.actorType;
    const actorId = authContext.actorId;
    const limit = this.#config.rateLimits[actorType] || DEFAULT_RATE_LIMITS[ACTOR_TYPES.USER];

    const key = `${actorType}:${actorId}`;
    const now = Date.now();
    const entry = this.#rateLimits.get(key);

    if (!entry || now > entry.resetAt) {
      this.#rateLimits.set(key, {
        count: 1,
        resetAt: now + limit.window
      });
      return true;
    }

    entry.count++;
    return entry.count <= limit.max;
  }

  /**
   * Check unauthenticated rate limit
   * @param {string} clientIp - Client IP
   * @returns {boolean}
   */
  #checkUnauthenticatedLimit(clientIp) {
    const limit = { window: 60000, max: 20 }; // 20 requests per minute for unauthenticated
    const key = `unauth:${clientIp}`;
    const now = Date.now();
    const entry = this.#rateLimits.get(key);

    if (!entry || now > entry.resetAt) {
      this.#rateLimits.set(key, {
        count: 1,
        resetAt: now + limit.window
      });
      return true;
    }

    entry.count++;
    return entry.count <= limit.max;
  }

  /**
   * Get rate limit reset time
   * @param {Object} authContext - Auth context
   * @returns {number}
   */
  #getRateLimitReset(authContext) {
    const actorType = authContext.actorType || 'unauth';
    const actorId = authContext.actorId || authContext.clientIp;
    const key = `${actorType}:${actorId}`;
    const entry = this.#rateLimits.get(key);

    if (!entry) return 60;
    return Math.ceil((entry.resetAt - Date.now()) / 1000);
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Check if path is public
   * @param {string} path - Request path
   * @returns {boolean}
   */
  #isPublicPath(path) {
    return this.#config.publicPaths.some(publicPath => {
      if (publicPath.endsWith('*')) {
        return path.startsWith(publicPath.slice(0, -1));
      }
      return path === publicPath || path.startsWith(publicPath + '/');
    });
  }

  /**
   * Handle authentication error
   * @param {Error} error - Error object
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  #handleAuthError(error, req, res, next) {
    // Run failure callback if provided
    if (this.#config.onAuthFailure) {
      this.#config.onAuthFailure(req, error);
    }

    if (error instanceof AuthError) {
      if (res.headersSent) {
        return next(error);
      }

      const response = {
        error: error.message,
        code: error.code
      };

      if (error.metadata) {
        Object.assign(response, error.metadata);
      }

      return res.status(error.statusCode).json(response);
    }

    next(error);
  }

  // ========================================================================
  // Context Access
  // ========================================================================

  /**
   * Get current auth context
   * @returns {Object} Current auth context
   */
  getContext() {
    return this.#contextStorage.getStore() || {
      authenticated: false,
      mode: this.#config.mode
    };
  }

  /**
   * Run function within auth context
   * @param {Object} context - Auth context
   * @param {Function} fn - Function to run
   * @returns {Promise<any>}
   */
  runWithContext(context, fn) {
    return this.#contextStorage.run(context, fn);
  }

  /**
   * Require authentication in current context
   * @returns {Object} Auth context
   * @throws {AuthError} If not authenticated
   */
  requireAuthInContext() {
    const ctx = this.getContext();
    if (!ctx.authenticated) {
      throw new AuthError('AUTH_REQUIRED', 'Authentication required');
    }
    return ctx;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create multi-actor auth middleware
 * @param {Object} options - Middleware options
 * @returns {MultiActorAuthMiddleware}
 */
export function createMultiActorMiddleware(options = {}) {
  return new MultiActorAuthMiddleware(options);
}

/**
 * Create standard auth middleware with common configuration
 * @param {Object} options - Options
 * @param {Object} options.db - Database instance
 * @param {string} [options.mode='hybrid'] - Auth mode
 * @returns {Function} Express middleware
 */
export function createAuthMiddleware(options) {
  const authService = getAuthService({ db: options.db });
  const middleware = new MultiActorAuthMiddleware({
    authService,
    mode: options.mode || AUTH_MODES.HYBRID,
    csrfProtection: options.csrfProtection !== false
  });
  return middleware.middleware();
}

// ============================================================================
// Convenience Middleware Exports
// ============================================================================

/**
 * JWT-only authentication middleware
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
export function jwtAuth(options = {}) {
  return async (req, res, next) => {
    try {
      const authService = options.authService || getAuthService();
      const authHeader = req.headers[AUTH_HEADERS.AUTHORIZATION];

      if (!authHeader?.startsWith('Bearer ')) {
        if (options.required !== false) {
          return res.status(401).json({ error: 'Bearer token required', code: 'AUTH_REQUIRED' });
        }
        req.auth = { authenticated: false };
        return next();
      }

      const token = authHeader.substring(7);
      
      // Edge case: empty token after 'Bearer '
      if (!token) {
        if (options.required !== false) {
          return res.status(401).json({ error: 'Token is empty', code: 'AUTH_REQUIRED' });
        }
        req.auth = { authenticated: false };
        return next();
      }
      
      // Edge case: token format validation
      if (token.split('.').length !== 3) {
        if (options.required !== false) {
          return res.status(401).json({ error: 'Invalid token format', code: 'INVALID_TOKEN' });
        }
        req.auth = { authenticated: false };
        return next();
      }
      
      const context = await authService.verifyAccessToken(token);
      req.auth = context;
      next();
    } catch (error) {
      if (options.required === false) {
        req.auth = { authenticated: false };
        return next();
      }
      
      // Map specific JWT errors to appropriate codes
      let code = error.code || 'INVALID_TOKEN';
      if (error.code === 'ERR_JWT_EXPIRED') {
        code = 'TOKEN_EXPIRED';
      } else if (error.code?.startsWith('ERR_JWT') || error.code?.startsWith('ERR_JWS')) {
        code = 'INVALID_TOKEN';
      }
      
      res.status(401).json({ error: error.message, code });
    }
  };
}

/**
 * API key authentication middleware
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
export function apiKeyAuth(options = {}) {
  return async (req, res, next) => {
    try {
      const authService = options.authService || getAuthService();
      const apiKey = req.headers[AUTH_HEADERS.API_KEY];

      if (!apiKey) {
        if (options.required !== false) {
          return res.status(401).json({ error: 'API key required', code: 'AUTH_REQUIRED' });
        }
        req.auth = { authenticated: false };
        return next();
      }

      const context = await authService.validateApiKey(apiKey);
      req.auth = context;
      next();
    } catch (error) {
      if (options.required === false) {
        req.auth = { authenticated: false };
        return next();
      }
      res.status(401).json({ error: error.message, code: error.code || 'INVALID_API_KEY' });
    }
  };
}

/**
 * Multi-strategy authentication middleware (tries JWT, then API key)
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
export function multiAuth(options = {}) {
  return async (req, res, next) => {
    try {
      const authService = options.authService || getAuthService();
      const authHeader = req.headers[AUTH_HEADERS.AUTHORIZATION];
      const apiKey = req.headers[AUTH_HEADERS.API_KEY];

      let context;

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        
        // Edge case: empty token
        if (!token) {
          if (options.required !== false) {
            return res.status(401).json({ error: 'Bearer token is empty', code: 'AUTH_REQUIRED' });
          }
          req.auth = { authenticated: false };
          return next();
        }
        
        // Edge case: malformed JWT
        if (token.split('.').length !== 3) {
          if (options.required !== false) {
            return res.status(401).json({ error: 'Invalid JWT format', code: 'INVALID_TOKEN' });
          }
          req.auth = { authenticated: false };
          return next();
        }
        
        context = await authService.verifyAccessToken(token);
      } else if (apiKey) {
        context = await authService.validateApiKey(apiKey);
      } else {
        if (options.required !== false) {
          return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        }
        req.auth = { authenticated: false };
        return next();
      }

      req.auth = context;
      next();
    } catch (error) {
      if (options.required === false) {
        req.auth = { authenticated: false };
        return next();
      }
      
      // Map specific JWT errors
      let code = error.code || 'INVALID_AUTH';
      if (error.code === 'ERR_JWT_EXPIRED') {
        code = 'TOKEN_EXPIRED';
      } else if (error.code === 'ERR_JWT_INVALID' || error.code === 'ERR_JWS_INVALID') {
        code = 'INVALID_TOKEN';
      }
      
      res.status(401).json({ error: error.message, code });
    }
  };
}

// ============================================================================
// Standalone Middleware Functions (factory pattern - creates instance on call)
// ============================================================================

/**
 * Require authentication middleware factory
 * Creates a middleware instance and returns the requireAuth middleware
 * @param {Object} [options] - Options for middleware creation
 * @param {Object} [options.authService] - AuthService instance (required if db not provided)
 * @param {Object} [options.db] - Database instance
 * @returns {Function} Express middleware
 */
export function requireAuth(options = {}) {
  const authService = options.authService || (options.db ? getAuthService({ db: options.db }) : null);
  if (!authService) {
    // Return a middleware that requires auth context set by previous middleware
    return (req, res, next) => {
      if (!req.auth?.authenticated) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      next();
    };
  }
  const middleware = new MultiActorAuthMiddleware({ ...options, authService });
  return middleware.requireAuth();
}

/**
 * Require specific permissions middleware factory
 * @param {string|string[]} permissions - Required permission(s)
 * @param {Object} [options] - Options for middleware creation
 * @returns {Function} Express middleware
 */
export function requirePermission(permissions, options = {}) {
  const middleware = new MultiActorAuthMiddleware(options);
  return middleware.requirePermission(permissions);
}

/**
 * Require specific actor type middleware factory
 * @param {string|string[]} actorTypes - Allowed actor type(s)
 * @param {Object} [options] - Options for middleware creation
 * @returns {Function} Express middleware
 */
export function requireActorType(actorTypes, options = {}) {
  const middleware = new MultiActorAuthMiddleware(options);
  return middleware.requireActorType(actorTypes);
}

/**
 * Require company scope middleware factory
 * @param {Object} [options] - Options for middleware creation
 * @returns {Function} Express middleware
 */
export function requireCompany(options = {}) {
  const middleware = new MultiActorAuthMiddleware(options);
  return middleware.requireCompany();
}

// ============================================================================
// Exports
// ============================================================================

export default MultiActorAuthMiddleware;
