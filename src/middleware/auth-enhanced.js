/**
 * @fileoverview Enhanced Authentication Middleware
 * JWT refresh tokens, per-user rate limiting, and session management
 * @module src/middleware/auth-enhanced
 * @version 5.1.0
 */

import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, createHash } from 'crypto';
import { RateLimiter, RateLimitStrategy } from '../security/rate-limiter.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG = {
  tokenLifetime: 900, // 15 minutes (short-lived)
  refreshLifetime: 604800, // 7 days
  maxRefreshTokens: 5,
  maxSessionsPerUser: 3,
  rateLimitWindow: 900000, // 15 minutes
  rateLimitMax: 100,
  slidingRefresh: true,
  rotateRefreshTokens: true
};

// ============================================================================
// Errors
// ============================================================================

/**
 * Enhanced auth error
 */
export class EnhancedAuthError extends Error {
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'EnhancedAuthError';
    this.code = code;
    this.metadata = metadata;
    this.statusCode = this.#getStatusCode(code);
  }

  #getStatusCode(code) {
    const codes = {
      'AUTH_REQUIRED': 401,
      'INVALID_TOKEN': 401,
      'TOKEN_EXPIRED': 401,
      'TOKEN_REVOKED': 401,
      'REFRESH_INVALID': 401,
      'SESSION_EXPIRED': 401,
      'RATE_LIMIT_EXCEEDED': 429,
      'MAX_SESSIONS_EXCEEDED': 403,
      'SESSION_HIJACK_DETECTED': 403,
      'INSUFFICIENT_PERMISSIONS': 403
    };
    return codes[code] || 500;
  }
}

// ============================================================================
// Enhanced Auth Middleware
// ============================================================================

/**
 * Enhanced authentication with refresh tokens, per-user rate limiting,
 * and advanced session management
 * @class EnhancedAuthMiddleware
 */
export class EnhancedAuthMiddleware {
  #config;
  #sessions;
  #refreshTokens;
  #revokedTokens;
  #rateLimiters;
  #userRateLimits;
  #secret;
  #cleanupInterval;

  /**
   * @param {Object} config - Configuration options
   * @param {string} config.secret - JWT signing secret
   * @param {string} [config.algorithm='HS256'] - JWT algorithm
   * @param {number} [config.tokenLifetime=900] - Access token lifetime (seconds)
   * @param {number} [config.refreshLifetime=604800] - Refresh token lifetime (seconds)
   * @param {number} [config.maxRefreshTokens=5] - Max refresh tokens per user
   * @param {number} [config.maxSessionsPerUser=3] - Max concurrent sessions
   * @param {boolean} [config.slidingRefresh=true] - Extend refresh token on use
   * @param {boolean} [config.rotateRefreshTokens=true] - Issue new refresh token on refresh
   */
  constructor(config) {
    if (!config?.secret) {
      throw new EnhancedAuthError('CONFIG_ERROR', 'Secret is required');
    }

    this.#config = {
      ...DEFAULT_CONFIG,
      ...config,
      issuer: config.issuer || 'cognimesh-auth',
      audience: config.audience || 'cognimesh-api'
    };

    this.#sessions = new Map();
    this.#refreshTokens = new Map();
    this.#revokedTokens = new Map();
    this.#rateLimiters = new Map();
    this.#userRateLimits = new Map();
    
    // Convert secret to Uint8Array for jose
    this.#secret = new TextEncoder().encode(config.secret);
    
    this.#startCleanupInterval();
  }

  // ========================================================================
  // Token Generation
  // ========================================================================

  /**
   * Generate access and refresh tokens
   * @param {Object} payload - Token payload
   * @param {string} payload.userId - User identifier
   * @param {string} [payload.role='user'] - User role
   * @param {string[]} [payload.permissions=[]] - User permissions
   * @param {Object} [payload.metadata={}] - Additional metadata
   * @returns {Promise<Object>} Tokens and session info
   */
  async generateTokens(payload) {
    const now = Math.floor(Date.now() / 1000);
    const jti = this.#generateTokenId();
    const sessionId = this.#generateSessionId();

    // Check max sessions per user
    const userSessions = this.#getUserSessions(payload.userId);
    if (userSessions.length >= this.#config.maxSessionsPerUser) {
      // Invalidate oldest session
      const oldest = userSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
      this.invalidateSession(oldest.id);
    }

    // Create session
    const session = {
      id: sessionId,
      userId: payload.userId,
      role: payload.role || 'user',
      permissions: payload.permissions || [],
      metadata: payload.metadata || {},
      createdAt: now,
      lastActivity: now,
      ip: payload.ip,
      userAgent: payload.userAgent,
      tokenId: jti
    };

    this.#sessions.set(sessionId, session);

    // Generate access token
    const accessToken = await new SignJWT({
      sub: payload.userId,
      role: payload.role || 'user',
      permissions: payload.permissions || [],
      sid: sessionId,
      type: 'access'
    })
      .setProtectedHeader({ alg: this.#config.algorithm, typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + this.#config.tokenLifetime)
      .setIssuer(this.#config.issuer)
      .setAudience(this.#config.audience)
      .setJti(jti)
      .sign(this.#secret);

    // Generate refresh token
    const refreshTokenData = await this.#createRefreshToken(payload.userId, sessionId);

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      expiresIn: this.#config.tokenLifetime,
      sessionId,
      tokenType: 'Bearer'
    };
  }

  /**
   * Create refresh token
   * @private
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Refresh token data
   */
  async #createRefreshToken(userId, sessionId) {
    const now = Math.floor(Date.now() / 1000);
    const jti = this.#generateTokenId();
    const tokenId = randomBytes(32).toString('base64url');
    
    // Hash the token for storage (security best practice)
    const tokenHash = createHash('sha256').update(tokenId).digest('hex');

    const refreshToken = await new SignJWT({
      sub: userId,
      sid: sessionId,
      type: 'refresh',
      th: tokenHash.substring(0, 16) // Partial hash for lookup
    })
      .setProtectedHeader({ alg: this.#config.algorithm, typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + this.#config.refreshLifetime)
      .setIssuer(this.#config.issuer)
      .setAudience(this.#config.audience)
      .setJti(jti)
      .sign(this.#secret);

    // Store refresh token metadata
    const refreshData = {
      jti,
      userId,
      sessionId,
      tokenHash,
      createdAt: now,
      expiresAt: now + this.#config.refreshLifetime,
      lastUsed: now,
      useCount: 0
    };

    // Clean up old refresh tokens for this user
    this.#cleanupUserRefreshTokens(userId);
    
    this.#refreshTokens.set(jti, refreshData);

    return {
      token: tokenId + '.' + refreshToken,
      jti
    };
  }

  // ========================================================================
  // Token Refresh
  // ========================================================================

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @param {Object} [context={}] - Request context
   * @param {string} [context.ip] - Client IP
   * @param {string} [context.userAgent] - User agent
   * @returns {Promise<Object>} New tokens
   */
  async refreshAccessToken(refreshToken, context = {}) {
    if (!refreshToken) {
      throw new EnhancedAuthError('REFRESH_INVALID', 'Refresh token required');
    }

    // Split token ID from JWT
    const [tokenId, tokenJwt] = refreshToken.split('.');
    if (!tokenId || !tokenJwt) {
      throw new EnhancedAuthError('REFRESH_INVALID', 'Invalid refresh token format');
    }

    try {
      // Verify the JWT
      const { payload } = await jwtVerify(
        refreshToken,
        this.#secret,
        {
          issuer: this.#config.issuer,
          audience: this.#config.audience,
          algorithms: [this.#config.algorithm]
        }
      );

      if (payload.type !== 'refresh') {
        throw new EnhancedAuthError('REFRESH_INVALID', 'Invalid token type');
      }

      // Check if refresh token is revoked
      const storedToken = this.#refreshTokens.get(payload.jti);
      if (!storedToken) {
        throw new EnhancedAuthError('TOKEN_REVOKED', 'Refresh token has been revoked');
      }

      // Verify token hash matches
      const tokenHash = createHash('sha256').update(tokenId).digest('hex');
      if (storedToken.tokenHash !== tokenHash) {
        // Potential token theft - revoke all user sessions
        this.#handleSuspiciousActivity(storedToken.userId, 'TOKEN_MISMATCH');
        throw new EnhancedAuthError('SESSION_HIJACK_DETECTED', 'Security violation detected');
      }

      // Get session
      const session = this.#sessions.get(payload.sid);
      if (!session) {
        throw new EnhancedAuthError('SESSION_EXPIRED', 'Session no longer exists');
      }

      // Check for session hijacking indicators
      if (context.ip && session.ip && context.ip !== session.ip) {
        // IP changed - could be suspicious or just network change
        console.warn('[Auth] IP change detected for session:', payload.sid);
      }

      // Update refresh token usage
      storedToken.lastUsed = Math.floor(Date.now() / 1000);
      storedToken.useCount++;

      // Revoke old refresh token if rotation is enabled
      if (this.#config.rotateRefreshTokens) {
        this.#refreshTokens.delete(payload.jti);
      } else if (this.#config.slidingRefresh) {
        // Extend expiration
        const now = Math.floor(Date.now() / 1000);
        storedToken.expiresAt = now + this.#config.refreshLifetime;
      }

      // Update session activity
      session.lastActivity = Math.floor(Date.now() / 1000);

      // Generate new tokens
      const tokens = await this.generateTokens({
        userId: session.userId,
        role: session.role,
        permissions: session.permissions,
        metadata: session.metadata,
        ip: context.ip,
        userAgent: context.userAgent
      });

      // Invalidate old session
      this.#sessions.delete(payload.sid);

      return tokens;
    } catch (error) {
      if (error instanceof EnhancedAuthError) throw error;
      if (error.code === 'ERR_JWT_EXPIRED') {
        throw new EnhancedAuthError('TOKEN_EXPIRED', 'Refresh token has expired');
      }
      throw new EnhancedAuthError('REFRESH_INVALID', `Token validation failed: ${error.message}`);
    }
  }

  // ========================================================================
  // Token Verification
  // ========================================================================

  /**
   * Verify access token
   * @param {string} token - Access token
   * @param {Object} [context={}] - Request context
   * @returns {Promise<Object>} Token payload and context
   */
  async verifyToken(token, context = {}) {
    if (!token) {
      throw new EnhancedAuthError('AUTH_REQUIRED', 'Access token required');
    }

    try {
      const { payload } = await jwtVerify(
        token,
        this.#secret,
        {
          issuer: this.#config.issuer,
          audience: this.#config.audience,
          algorithms: [this.#config.algorithm]
        }
      );

      if (payload.type !== 'access') {
        throw new EnhancedAuthError('INVALID_TOKEN', 'Invalid token type');
      }

      // Check if session exists
      const session = this.#sessions.get(payload.sid);
      if (!session) {
        throw new EnhancedAuthError('SESSION_EXPIRED', 'Session has expired');
      }

      // Check if token is revoked
      if (this.#revokedTokens.has(payload.jti)) {
        throw new EnhancedAuthError('TOKEN_REVOKED', 'Token has been revoked');
      }

      // Update session activity
      session.lastActivity = Math.floor(Date.now() / 1000);

      // Check per-user rate limit
      if (!this.#checkUserRateLimit(payload.sub)) {
        throw new EnhancedAuthError('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded');
      }

      return {
        userId: payload.sub,
        role: payload.role,
        permissions: payload.permissions,
        sessionId: payload.sid,
        jti: payload.jti,
        session
      };
    } catch (error) {
      if (error instanceof EnhancedAuthError) throw error;
      if (error.code === 'ERR_JWT_EXPIRED') {
        throw new EnhancedAuthError('TOKEN_EXPIRED', 'Access token has expired');
      }
      throw new EnhancedAuthError('INVALID_TOKEN', `Token validation failed: ${error.message}`);
    }
  }

  // ========================================================================
  // Session Management
  // ========================================================================

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session object
   */
  getSession(sessionId) {
    const session = this.#sessions.get(sessionId);
    if (!session) return null;

    // Check if session is expired
    const maxInactiveTime = 30 * 24 * 60 * 60; // 30 days
    const now = Math.floor(Date.now() / 1000);
    if (now - session.lastActivity > maxInactiveTime) {
      this.invalidateSession(sessionId);
      return null;
    }

    return { ...session };
  }

  /**
   * Get all sessions for a user
   * @param {string} userId - User ID
   * @returns {Array<Object>} User sessions
   */
  #getUserSessions(userId) {
    return Array.from(this.#sessions.values())
      .filter(s => s.userId === userId);
  }

  /**
   * List sessions for a user
   * @param {string} userId - User ID
   * @returns {Array<Object>} User sessions (without sensitive data)
   */
  listUserSessions(userId) {
    return this.#getUserSessions(userId).map(s => ({
      id: s.id,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      ip: s.ip,
      userAgent: s.userAgent
    }));
  }

  /**
   * Invalidate a session
   * @param {string} sessionId - Session ID
   * @returns {boolean} Success
   */
  invalidateSession(sessionId) {
    const session = this.#sessions.get(sessionId);
    if (!session) return false;

    // Revoke associated refresh tokens
    for (const [jti, token] of this.#refreshTokens) {
      if (token.sessionId === sessionId) {
        this.#refreshTokens.delete(jti);
      }
    }

    this.#sessions.delete(sessionId);
    return true;
  }

  /**
   * Invalidate all sessions for a user
   * @param {string} userId - User ID
   * @param {string} [exceptSessionId] - Session to keep (current session)
   * @returns {number} Number of sessions invalidated
   */
  invalidateUserSessions(userId, exceptSessionId = null) {
    let count = 0;
    for (const [sessionId, session] of this.#sessions) {
      if (session.userId === userId && sessionId !== exceptSessionId) {
        this.invalidateSession(sessionId);
        count++;
      }
    }
    return count;
  }

  /**
   * Revoke a token
   * @param {string} jti - Token JTI
   * @param {string} [reason] - Revocation reason
   */
  revokeToken(jti, reason = '') {
    this.#revokedTokens.set(jti, {
      revokedAt: Math.floor(Date.now() / 1000),
      reason
    });
  }

  // ========================================================================
  // Per-User Rate Limiting
  // ========================================================================

  /**
   * Initialize rate limiter for a user
   * @private
   * @param {string} userId - User ID
   * @returns {RateLimiter}
   */
  #getUserRateLimiter(userId) {
    if (!this.#userRateLimits.has(userId)) {
      const limiter = new RateLimiter({
        strategy: RateLimitStrategy.TOKEN_BUCKET,
        windowMs: this.#config.rateLimitWindow,
        maxRequests: this.#config.rateLimitMax,
        bucketSize: this.#config.rateLimitMax,
        refillRate: this.#config.rateLimitMax / (this.#config.rateLimitWindow / 1000)
      });
      this.#userRateLimits.set(userId, limiter);
    }
    return this.#userRateLimits.get(userId);
  }

  /**
   * Check if user has exceeded rate limit
   * @private
   * @param {string} userId - User ID
   * @returns {boolean} True if within limit
   */
  #checkUserRateLimit(userId) {
    const limiter = this.#getUserRateLimiter(userId);
    const result = limiter.consume(userId);
    return result.allowed;
  }

  /**
   * Get rate limit status for user
   * @param {string} userId - User ID
   * @returns {Object} Rate limit status
   */
  getUserRateLimitStatus(userId) {
    const limiter = this.#getUserRateLimiter(userId);
    return limiter.getStatus(userId);
  }

  // ========================================================================
  // Express Middleware
  // ========================================================================

  /**
   * Express middleware for JWT authentication
   * @returns {Function} Express middleware
   */
  middleware() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          req.auth = { authenticated: false };
          return next();
        }

        const token = authHeader.substring(7);
        const context = await this.verifyToken(token, {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });

        req.auth = {
          authenticated: true,
          userId: context.userId,
          role: context.role,
          permissions: context.permissions,
          sessionId: context.sessionId,
          jti: context.jti
        };
        req.token = token;
        req.session = context.session;

        next();
      } catch (error) {
        if (error.statusCode === 401) {
          req.auth = { authenticated: false };
          return next();
        }
        next(error);
      }
    };
  }

  /**
   * Express middleware for token refresh endpoint
   * @returns {Function} Express middleware
   */
  refreshMiddleware() {
    return async (req, res, next) => {
      try {
        const { refreshToken } = req.body;
        const tokens = await this.refreshAccessToken(refreshToken, {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });

        req.refreshedTokens = tokens;
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Require authentication middleware
   * @returns {Function} Express middleware
   */
  requireAuth() {
    return (req, res, next) => {
      if (!req.auth?.authenticated) {
        const error = new EnhancedAuthError('AUTH_REQUIRED', 'Authentication required');
        return next(error);
      }
      next();
    };
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  #generateTokenId() {
    return randomBytes(16).toString('hex');
  }

  #generateSessionId() {
    return `sess_${randomBytes(16).toString('base64url')}`;
  }

  #cleanupUserRefreshTokens(userId) {
    const userTokens = Array.from(this.#refreshTokens.entries())
      .filter(([_, token]) => token.userId === userId)
      .sort((a, b) => a[1].createdAt - b[1].createdAt);

    while (userTokens.length >= this.#config.maxRefreshTokens) {
      const [oldestJti] = userTokens.shift();
      this.#refreshTokens.delete(oldestJti);
    }
  }

  #handleSuspiciousActivity(userId, type) {
    console.error(`[Auth] Suspicious activity detected for user ${userId}: ${type}`);
    // Invalidate all sessions for this user
    this.invalidateUserSessions(userId);
    // Could also trigger alerts, notifications, etc.
  }

  #startCleanupInterval() {
    // Clean up expired data every hour
    this.#cleanupInterval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);

      // Clean up expired refresh tokens
      for (const [jti, token] of this.#refreshTokens) {
        if (token.expiresAt < now) {
          this.#refreshTokens.delete(jti);
        }
      }

      // Clean up old revoked tokens (keep for 7 days)
      for (const [jti, data] of this.#revokedTokens) {
        if (now - data.revokedAt > 604800) {
          this.#revokedTokens.delete(jti);
        }
      }

      // Clean up inactive sessions
      const maxInactive = 30 * 24 * 60 * 60; // 30 days
      for (const [sessionId, session] of this.#sessions) {
        if (now - session.lastActivity > maxInactive) {
          this.invalidateSession(sessionId);
        }
      }
    }, 3600000); // Every hour

    if (this.#cleanupInterval.unref) {
      this.#cleanupInterval.unref();
    }
  }

  // ========================================================================
  // Cleanup
  // ========================================================================

  dispose() {
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = null;
    }
    this.#sessions.clear();
    this.#refreshTokens.clear();
    this.#revokedTokens.clear();
    this.#userRateLimits.clear();
  }

  // ========================================================================
  // Status
  // ========================================================================

  getStatus() {
    return {
      sessions: this.#sessions.size,
      refreshTokens: this.#refreshTokens.size,
      revokedTokens: this.#revokedTokens.size,
      rateLimiters: this.#userRateLimits.size,
      config: {
        tokenLifetime: this.#config.tokenLifetime,
        refreshLifetime: this.#config.refreshLifetime,
        maxSessionsPerUser: this.#config.maxSessionsPerUser,
        maxRefreshTokens: this.#config.maxRefreshTokens
      }
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

export function getEnhancedAuth(config) {
  if (!defaultInstance && config) {
    defaultInstance = new EnhancedAuthMiddleware(config);
  }
  return defaultInstance;
}

export function resetEnhancedAuth() {
  if (defaultInstance) {
    defaultInstance.dispose();
    defaultInstance = null;
  }
}

export default EnhancedAuthMiddleware;
