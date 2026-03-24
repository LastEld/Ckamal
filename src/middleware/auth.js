/**
 * Authentication Middleware
 * Multi-strategy authentication for CogniMesh with JWT, API key, OAuth, and session support
 *
 * @module src/middleware/auth
 */

import { AsyncLocalStorage } from 'async_hooks';
import { SignJWT, jwtVerify, base64url, importPKCS8, importSPKI } from 'jose';
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} AuthContext
 * @property {boolean} authenticated - Whether user is authenticated
 * @property {string} [userId] - User identifier
 * @property {string} [role] - Global role
 * @property {string[]} [permissions] - Granted permissions
 * @property {string} [scope] - Resource scope
 * @property {string} [sessionId] - Linked session
 * @property {number} [expiresAt] - Token expiration timestamp
 * @property {string} [mode] - Auth mode used
 * @property {string} [authType] - Type of authentication (jwt, apikey, oauth, session)
 * @property {string} [clientIp] - Client IP address
 */

/**
 * @typedef {Object} TokenPayload
 * @property {string} sub - Subject (user ID)
 * @property {string} iss - Issuer
 * @property {string} aud - Audience
 * @property {number} iat - Issued at
 * @property {number} exp - Expiration
 * @property {string} jti - JWT ID
 * @property {Object} [claims] - Additional claims
 */

/**
 * @typedef {Object} Session
 * @property {string} id - Session ID
 * @property {string} userId - User ID
 * @property {string} [tokenId] - Associated token ID
 * @property {number} createdAt - Creation timestamp
 * @property {number} expiresAt - Expiration timestamp
 * @property {Object} [metadata] - Session metadata
 * @property {number} [lastActivity] - Last activity timestamp
 */

/**
 * @typedef {Object} RateLimitEntry
 * @property {number} count - Request count
 * @property {number} windowStart - Window start timestamp
 * @property {number} resetAt - Reset timestamp
 */

// ============================================================================
// Constants
// ============================================================================

export const AUTH_MODES = {
  TRUST: 'trust',
  TOKEN: 'token',
  HYBRID: 'hybrid',
  REQUIRED: 'required'
};

export const AUTH_TYPES = {
  JWT: 'jwt',
  API_KEY: 'apikey',
  OAUTH: 'oauth',
  SESSION: 'session',
  BASIC: 'basic'
};

export const JWT_ALGORITHMS = {
  RS256: 'RS256',
  HS256: 'HS256',
  ES256: 'ES256'
};

const DEFAULT_TOKEN_LIFETIME = 3600;
const DEFAULT_REFRESH_LIFETIME = 86400 * 7;
const DEFAULT_ISSUER = 'cognimesh';
const DEFAULT_AUDIENCE = 'cognimesh-api';
const DEFAULT_RATE_LIMIT_WINDOW = 60000;
const DEFAULT_RATE_LIMIT_MAX = 100;

// ============================================================================
// Errors
// ============================================================================

/**
 * Authentication error
 */
export class AuthError extends Error {
  /**
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} [metadata] - Additional metadata
   */
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.metadata = metadata;
    this.statusCode = this.#getStatusCode(code);
  }

  /**
   * Get HTTP status code for error
   * @param {string} code
   * @returns {number}
   */
  #getStatusCode(code) {
    const codes = {
      'AUTH_REQUIRED': 401,
      'INVALID_TOKEN': 401,
      'TOKEN_EXPIRED': 401,
      'TOKEN_REVOKED': 401,
      'INVALID_API_KEY': 401,
      'INVALID_OAUTH': 401,
      'INVALID_SESSION': 401,
      'SESSION_EXPIRED': 401,
      'RATE_LIMIT_EXCEEDED': 429,
      'INSUFFICIENT_PERMISSIONS': 403,
      'INVALID_SECRET': 500,
      'INVALID_ALGORITHM': 500
    };
    return codes[code] || 500;
  }
}

// ============================================================================
// AuthMiddleware Class
// ============================================================================

/**
 * Authentication middleware class
 * Handles JWT (RS256/HS256), API key (HMAC), OAuth, and Session authentication
 * with rate limiting per auth method
 */
export class AuthMiddleware {
  #config;
  #sessions;
  #apiKeys;
  #revokedTokens;
  #contextStorage;
  #cleanupInterval;
  #cachedSecret;
  #privateKey;
  #publicKey;
  #rateLimits;
  #oauthProviders;

  /**
   * @param {Object} [config] - Configuration options
   * @param {string} [config.mode='trust'] - Auth mode (trust, token, hybrid, required)
   * @param {string} [config.secret] - JWT signing secret (for HS256)
   * @param {string} [config.secretFile] - Path to secret file
   * @param {string} [config.privateKey] - RSA private key (for RS256)
   * @param {string} [config.privateKeyFile] - Path to private key file
   * @param {string} [config.publicKey] - RSA public key (for RS256)
   * @param {string} [config.publicKeyFile] - Path to public key file
   * @param {string} [config.algorithm='HS256'] - JWT algorithm (RS256, HS256, ES256)
   * @param {boolean} [config.autoGenerateSecret=false] - Auto-generate secret
   * @param {string} [config.issuer] - Token issuer
   * @param {string} [config.audience] - Token audience
   * @param {number} [config.tokenLifetime=3600] - Token lifetime in seconds
   * @param {number} [config.refreshLifetime=604800] - Refresh token lifetime
   * @param {Object} [config.rateLimits] - Rate limit config per auth method
   * @param {number} [config.rateLimits.jwt] - JWT auth rate limit (requests per window)
   * @param {number} [config.rateLimits.apiKey] - API key auth rate limit
   * @param {number} [config.rateLimits.oauth] - OAuth auth rate limit
   * @param {number} [config.rateLimits.session] - Session auth rate limit
   * @param {number} [config.rateLimitWindow=60000] - Rate limit window in ms
   */
  constructor(config = {}) {
    this.#config = {
      mode: config.mode || process.env.COGNIMESH_AUTH_MODE || AUTH_MODES.TRUST,
      secret: config.secret || process.env.COGNIMESH_AUTH_SECRET,
      secretFile: config.secretFile || process.env.COGNIMESH_AUTH_SECRET_FILE,
      privateKey: config.privateKey || process.env.COGNIMESH_AUTH_PRIVATE_KEY,
      privateKeyFile: config.privateKeyFile || process.env.COGNIMESH_AUTH_PRIVATE_KEY_FILE,
      publicKey: config.publicKey || process.env.COGNIMESH_AUTH_PUBLIC_KEY,
      publicKeyFile: config.publicKeyFile || process.env.COGNIMESH_AUTH_PUBLIC_KEY_FILE,
      algorithm: config.algorithm || process.env.COGNIMESH_AUTH_ALGORITHM || JWT_ALGORITHMS.HS256,
      autoGenerateSecret: config.autoGenerateSecret || process.env.COGNIMESH_AUTH_AUTO_GENERATE === 'true',
      issuer: config.issuer || process.env.COGNIMESH_AUTH_ISSUER || DEFAULT_ISSUER,
      audience: config.audience || process.env.COGNIMESH_AUTH_AUDIENCE || DEFAULT_AUDIENCE,
      tokenLifetime: config.tokenLifetime || parseInt(process.env.COGNIMESH_TOKEN_LIFETIME) || DEFAULT_TOKEN_LIFETIME,
      refreshLifetime: config.refreshLifetime || parseInt(process.env.COGNIMESH_REFRESH_LIFETIME) || DEFAULT_REFRESH_LIFETIME,
      rateLimits: {
        jwt: config.rateLimits?.jwt || parseInt(process.env.COGNIMESH_RATE_LIMIT_JWT) || DEFAULT_RATE_LIMIT_MAX,
        apiKey: config.rateLimits?.apiKey || parseInt(process.env.COGNIMESH_RATE_LIMIT_APIKEY) || DEFAULT_RATE_LIMIT_MAX,
        oauth: config.rateLimits?.oauth || parseInt(process.env.COGNIMESH_RATE_LIMIT_OAUTH) || DEFAULT_RATE_LIMIT_MAX,
        session: config.rateLimits?.session || parseInt(process.env.COGNIMESH_RATE_LIMIT_SESSION) || DEFAULT_RATE_LIMIT_MAX
      },
      rateLimitWindow: config.rateLimitWindow || parseInt(process.env.COGNIMESH_RATE_LIMIT_WINDOW) || DEFAULT_RATE_LIMIT_WINDOW
    };

    this.#sessions = new Map();
    this.#apiKeys = new Map();
    this.#revokedTokens = new Map();
    this.#contextStorage = new AsyncLocalStorage();
    this.#cleanupInterval = null;
    this.#cachedSecret = null;
    this.#privateKey = null;
    this.#publicKey = null;
    this.#rateLimits = new Map();
    this.#oauthProviders = new Map();

    this.#startCleanupInterval();
  }

  // ========================================================================
  // Express Middleware Methods
  // ========================================================================

  /**
   * JWT authentication middleware
   * Validates JWT tokens from Authorization header
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  jwt = async (req, res, next) => {
    try {
      const clientId = this.#getClientId(req);
      if (!this.#checkRateLimit('jwt', clientId)) {
        throw new AuthError('RATE_LIMIT_EXCEEDED', 'JWT authentication rate limit exceeded', {
          retryAfter: this.#getRateLimitReset('jwt', clientId)
        });
      }

      const authHeader = req.headers?.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (this.#config.mode === AUTH_MODES.REQUIRED) {
          throw new AuthError('AUTH_REQUIRED', 'Bearer token required');
        }
        req.auth = { authenticated: false, authType: null };
        return next();
      }

      const token = authHeader.substring(7);
      const context = await this.verifyToken(token, req);
      
      req.auth = context;
      req.token = token;
      
      this.#contextStorage.run(context, () => next());
    } catch (error) {
      this.#handleAuthError(error, res, next);
    }
  };

  /**
   * API key authentication middleware
   * Validates API keys from X-API-Key header
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  apiKey = async (req, res, next) => {
    try {
      const apiKey = req.headers?.['x-api-key'];
      
      if (!apiKey) {
        if (this.#config.mode === AUTH_MODES.REQUIRED) {
          throw new AuthError('AUTH_REQUIRED', 'API key required');
        }
        req.auth = { authenticated: false, authType: null };
        return next();
      }

      const keyId = apiKey.split('.')[0] || 'unknown';
      if (!this.#checkRateLimit('apiKey', keyId)) {
        throw new AuthError('RATE_LIMIT_EXCEEDED', 'API key rate limit exceeded', {
          retryAfter: this.#getRateLimitReset('apiKey', keyId)
        });
      }

      const context = await this.#authenticateApiKey(apiKey, req);
      
      req.auth = context;
      req.apiKey = { id: keyId };
      
      this.#contextStorage.run(context, () => next());
    } catch (error) {
      this.#handleAuthError(error, res, next);
    }
  };

  /**
   * OAuth authentication middleware
   * Validates OAuth 2.0 tokens and scopes
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  oauth = async (req, res, next) => {
    try {
      const authHeader = req.headers?.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (this.#config.mode === AUTH_MODES.REQUIRED) {
          throw new AuthError('AUTH_REQUIRED', 'OAuth bearer token required');
        }
        req.auth = { authenticated: false, authType: null };
        return next();
      }

      const token = authHeader.substring(7);
      
      const clientId = this.#getClientId(req);
      if (!this.#checkRateLimit('oauth', clientId)) {
        throw new AuthError('RATE_LIMIT_EXCEEDED', 'OAuth rate limit exceeded', {
          retryAfter: this.#getRateLimitReset('oauth', clientId)
        });
      }

      const context = await this.#authenticateOAuthToken(token, req);
      
      req.auth = context;
      req.token = token;
      
      this.#contextStorage.run(context, () => next());
    } catch (error) {
      this.#handleAuthError(error, res, next);
    }
  };

  /**
   * Session-based authentication middleware
   * Validates session cookies/tokens
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  session = async (req, res, next) => {
    try {
      const sessionId = req.cookies?.sessionId || 
                       req.headers?.['x-session-id'] ||
                       req.body?.sessionId;
      
      if (!sessionId) {
        if (this.#config.mode === AUTH_MODES.REQUIRED) {
          throw new AuthError('AUTH_REQUIRED', 'Session required');
        }
        req.auth = { authenticated: false, authType: null };
        return next();
      }

      if (!this.#checkRateLimit('session', sessionId)) {
        throw new AuthError('RATE_LIMIT_EXCEEDED', 'Session rate limit exceeded', {
          retryAfter: this.#getRateLimitReset('session', sessionId)
        });
      }

      const context = await this.#authenticateSession(sessionId, req);
      
      req.auth = context;
      req.session = { id: sessionId };
      
      this.#contextStorage.run(context, () => next());
    } catch (error) {
      this.#handleAuthError(error, res, next);
    }
  };

  /**
   * Multi-strategy authentication middleware
   * Tries multiple auth methods in order
   * @param {string[]} strategies - Auth strategies to try (jwt, apiKey, oauth, session)
   * @returns {Function} Express middleware
   */
  multiStrategy(strategies = ['jwt', 'apiKey', 'session']) {
    return async (req, res, next) => {
      const errors = [];
      
      for (const strategy of strategies) {
        try {
          switch (strategy) {
            case 'jwt':
              if (req.headers?.authorization?.startsWith('Bearer ')) {
                return this.jwt(req, res, next);
              }
              break;
            case 'apiKey':
              if (req.headers?.['x-api-key']) {
                return this.apiKey(req, res, next);
              }
              break;
            case 'oauth':
              if (req.headers?.authorization?.startsWith('Bearer ')) {
                return this.oauth(req, res, next);
              }
              break;
            case 'session':
              if (req.cookies?.sessionId || req.headers?.['x-session-id']) {
                return this.session(req, res, next);
              }
              break;
          }
        } catch (error) {
          errors.push({ strategy, error: error.message });
        }
      }

      if (this.#config.mode === AUTH_MODES.REQUIRED) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          attempted: errors
        });
      }

      req.auth = { authenticated: false, authType: null };
      next();
    };
  }

  /**
   * Token refresh middleware
   * Handles token refresh requests
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  refresh = async (req, res, next) => {
    try {
      const { token, refreshToken } = req.body || {};
      
      if (!token || !refreshToken) {
        throw new AuthError('AUTH_REQUIRED', 'Token and refresh token required');
      }

      const result = await this.refreshToken(token, { refreshToken });
      
      req.refreshedTokens = result;
      next();
    } catch (error) {
      this.#handleAuthError(error, res, next);
    }
  };

  // ========================================================================
  // Core Authentication
  // ========================================================================

  /**
   * Authenticate a request
   * @param {Object} request - Request object
   * @param {Object} [request.headers] - Request headers
   * @param {string} [request.headers.authorization] - Authorization header
   * @param {string} [request.headers['x-api-key']] - API key header
   * @param {Object} [request.query] - Query parameters
   * @param {Object} [request.body] - Request body
   * @returns {Promise<AuthContext>} Authentication context
   * @throws {AuthError} If authentication fails
   */
  async authenticate(request) {
    const authHeader = request?.headers?.authorization;
    const apiKey = request?.headers?.['x-api-key'];
    const sessionId = request?.cookies?.sessionId || request?.headers?.['x-session-id'];

    if (apiKey) {
      return await this.#authenticateApiKey(apiKey, request);
    }

    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      
      if (type === 'Bearer' && token) {
        if (token.startsWith('oauth_')) {
          return await this.#authenticateOAuthToken(token, request);
        }
        return await this.verifyToken(token, request);
      }
      
      if (type === 'Basic' && token) {
        return await this.#authenticateBasic(token, request);
      }
    }

    if (sessionId) {
      return await this.#authenticateSession(sessionId, request);
    }

    if (this.#config.mode === AUTH_MODES.REQUIRED) {
      throw new AuthError('AUTH_REQUIRED', 'Authentication required');
    }

    return {
      authenticated: false,
      mode: this.#config.mode,
      authType: null
    };
  }

  /**
   * Verify a JWT token
   * @param {string} token - JWT token
   * @param {Object} [request] - Optional request for context
   * @returns {Promise<AuthContext>} Authentication context
   * @throws {AuthError} If token is invalid
   */
  async verifyToken(token, request = null) {
    if (!token) {
      throw new AuthError('AUTH_REQUIRED', 'No token provided');
    }

    try {
      const secret = await this.#getSigningKey('verify');
      const { payload } = await jwtVerify(token, secret, {
        issuer: this.#config.issuer,
        audience: this.#config.audience,
        algorithms: [this.#config.algorithm]
      });

      if (this.#isTokenRevoked(payload.jti)) {
        throw new AuthError('TOKEN_REVOKED', 'Token has been revoked', { jti: payload.jti });
      }

      if (payload.sid && this.#sessions.has(payload.sid)) {
        const session = this.#sessions.get(payload.sid);
        session.lastActivity = Date.now();
      }

      return {
        authenticated: true,
        userId: payload.sub,
        role: payload.role || 'user',
        permissions: payload.permissions || [],
        scope: payload.scope,
        sessionId: payload.sid,
        expiresAt: payload.exp * 1000,
        jti: payload.jti,
        mode: this.#config.mode,
        authType: AUTH_TYPES.JWT,
        clientIp: request?.ip || request?.connection?.remoteAddress
      };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (error.code === 'ERR_JWT_EXPIRED') {
        throw new AuthError('TOKEN_EXPIRED', 'Token has expired');
      }
      throw new AuthError('INVALID_TOKEN', `Token validation failed: ${error.message}`);
    }
  }

  /**
   * Refresh an expired token
   * @param {string} token - Expired JWT token
   * @param {Object} [options] - Refresh options
   * @param {string} [options.refreshToken] - Refresh token
   * @returns {Promise<{token: string, refreshToken: string, expiresAt: Date}>} New tokens
   * @throws {AuthError} If refresh fails
   */
  async refreshToken(token, options = {}) {
    if (!token) {
      throw new AuthError('AUTH_REQUIRED', 'No token provided');
    }

    try {
      const secret = await this.#getSigningKey('verify');
      const { payload } = await jwtVerify(token, secret, {
        issuer: this.#config.issuer,
        audience: this.#config.audience,
        algorithms: [this.#config.algorithm]
      });

      return await this.generateToken({
        userId: payload.sub,
        role: payload.role,
        permissions: payload.permissions,
        scope: payload.scope,
        sessionId: payload.sid
      });
    } catch (error) {
      if (error.code !== 'ERR_JWT_EXPIRED') {
        throw new AuthError('INVALID_TOKEN', `Token validation failed: ${error.message}`);
      }

      if (options.refreshToken) {
        return await this.#validateAndRefresh(token, options.refreshToken);
      }

      throw new AuthError('TOKEN_EXPIRED', 'Token has expired and no refresh token provided');
    }
  }

  /**
   * Generate a new JWT token
   * @param {Object} payload - Token payload
   * @param {string} payload.userId - User identifier
   * @param {string} [payload.role='user'] - User role
   * @param {string[]} [payload.permissions=[]] - User permissions
   * @param {string} [payload.scope] - Resource scope
   * @param {string} [payload.sessionId] - Session ID
   * @param {number} [payload.expiresIn] - Custom expiration in seconds
   * @param {Object} [payload.claims] - Additional claims
   * @returns {Promise<{token: string, refreshToken: string, expiresAt: Date, tokenId: string}>}
   */
  async generateToken(payload) {
    const secret = await this.#getSigningKey('sign');
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = payload.expiresIn || this.#config.tokenLifetime;
    const jti = this.#generateTokenId();
    const refreshJti = this.#generateTokenId();

    const sessionId = payload.sessionId || this.#generateSessionId();
    this.#createSession(sessionId, payload.userId, jti);

    const jwt = new SignJWT({
      role: payload.role || 'user',
      permissions: payload.permissions || [],
      scope: payload.scope,
      sid: sessionId,
      ...payload.claims
    });

    const token = await jwt
      .setProtectedHeader({ alg: this.#config.algorithm, typ: 'JWT', kid: 'cm-1' })
      .setSubject(payload.userId)
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .setIssuer(this.#config.issuer)
      .setAudience(this.#config.audience)
      .setJti(jti)
      .sign(secret);

    const refreshJwt = new SignJWT({
      type: 'refresh',
      sid: sessionId
    });

    const refreshToken = await refreshJwt
      .setProtectedHeader({ alg: this.#config.algorithm, typ: 'JWT', kid: 'cm-refresh' })
      .setSubject(payload.userId)
      .setIssuedAt(now)
      .setExpirationTime(now + this.#config.refreshLifetime)
      .setIssuer(this.#config.issuer)
      .setAudience(this.#config.audience)
      .setJti(refreshJti)
      .sign(secret);

    return {
      token,
      refreshToken,
      expiresAt: new Date((now + expiresIn) * 1000),
      tokenId: jti
    };
  }

  // ========================================================================
  // API Key Management
  // ========================================================================

  /**
   * Register an API key with HMAC verification
   * @param {Object} options - API key options
   * @param {string} options.userId - User ID
   * @param {string} [options.name] - Key name
   * @param {string[]} [options.permissions] - Key permissions
   * @param {string} [options.scope] - Key scope
   * @param {number} [options.expiresIn] - Expiration in seconds
   * @returns {{key: string, keyId: string, expiresAt?: Date}} API key info
   */
  registerApiKey(options) {
    const keyId = `ak_${randomBytes(8).toString('hex')}`;
    const keySecret = randomBytes(32).toString('base64url');
    const key = `${keyId}.${keySecret}`;
    
    const secret = this.#config.secret || this.#getDefaultSecret();
    const signature = createHmac('sha256', secret).update(keySecret).digest('hex');

    const apiKeyData = {
      id: keyId,
      signature,
      userId: options.userId,
      name: options.name || 'API Key',
      permissions: options.permissions || [],
      scope: options.scope,
      createdAt: Date.now(),
      expiresAt: options.expiresIn ? Date.now() + (options.expiresIn * 1000) : null,
      lastUsed: null,
      useCount: 0
    };

    this.#apiKeys.set(keyId, apiKeyData);

    return {
      key,
      keyId,
      expiresAt: apiKeyData.expiresAt ? new Date(apiKeyData.expiresAt) : undefined
    };
  }

  /**
   * Revoke an API key
   * @param {string} keyId - API key ID
   * @returns {boolean} True if revoked
   */
  revokeApiKey(keyId) {
    return this.#apiKeys.delete(keyId);
  }

  /**
   * List API keys for a user
   * @param {string} userId - User ID
   * @returns {Array<Object>} API key list (without sensitive data)
   */
  listApiKeys(userId) {
    return Array.from(this.#apiKeys.values())
      .filter(key => key.userId === userId)
      .map(key => ({
        id: key.id,
        name: key.name,
        scope: key.scope,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        lastUsed: key.lastUsed,
        useCount: key.useCount
      }));
  }

  // ========================================================================
  // Session Management
  // ========================================================================

  /**
   * Create a new session
   * @param {string} userId - User ID
   * @param {Object} [metadata] - Session metadata
   * @param {number} [expiresIn] - Session expiration in seconds
   * @returns {Session} Created session
   */
  createSession(userId, metadata = {}, expiresIn = null) {
    const sessionId = this.#generateSessionId();
    const expiresAt = expiresIn 
      ? Date.now() + (expiresIn * 1000)
      : Date.now() + (this.#config.refreshLifetime * 1000);

    const session = {
      id: sessionId,
      userId,
      createdAt: Date.now(),
      expiresAt,
      metadata,
      lastActivity: Date.now()
    };

    this.#sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get active session
   * @param {string} sessionId - Session ID
   * @returns {Session|null} Session object
   */
  getSession(sessionId) {
    const session = this.#sessions.get(sessionId);
    if (!session) return null;
    
    if (session.expiresAt < Date.now()) {
      this.#sessions.delete(sessionId);
      return null;
    }
    
    return session;
  }

  /**
   * List active sessions for a user
   * @param {string} userId - User ID
   * @returns {Array<Session>} Active sessions
   */
  listSessions(userId) {
    return Array.from(this.#sessions.values())
      .filter(session => session.userId === userId && session.expiresAt > Date.now());
  }

  /**
   * Invalidate a session
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if invalidated
   */
  invalidateSession(sessionId) {
    const session = this.#sessions.get(sessionId);
    if (session) {
      if (session.tokenId) {
        this.revokeToken(session.tokenId, 'Session invalidated');
      }
      this.#sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Invalidate all sessions for a user
   * @param {string} userId - User ID
   * @returns {number} Number of sessions invalidated
   */
  invalidateUserSessions(userId) {
    let count = 0;
    for (const [sessionId, session] of this.#sessions) {
      if (session.userId === userId) {
        this.invalidateSession(sessionId);
        count++;
      }
    }
    return count;
  }

  // ========================================================================
  // OAuth Provider Management
  // ========================================================================

  /**
   * Register an OAuth provider
   * @param {string} provider - Provider name (google, github, etc.)
   * @param {Object} config - Provider configuration
   * @param {string} config.clientId - OAuth client ID
   * @param {string} config.clientSecret - OAuth client secret
   * @param {string} config.tokenEndpoint - Token verification endpoint
   * @param {string} config.userInfoEndpoint - User info endpoint
   * @param {Function} [config.verifyToken] - Custom token verification function
   */
  registerOAuthProvider(provider, config) {
    this.#oauthProviders.set(provider, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      tokenEndpoint: config.tokenEndpoint,
      userInfoEndpoint: config.userInfoEndpoint,
      verifyToken: config.verifyToken
    });
  }

  /**
   * Validate OAuth scope
   * @param {string} tokenScope - Token scope
   * @param {string} requiredScope - Required scope
   * @returns {boolean} True if valid
   */
  validateScope(tokenScope, requiredScope) {
    if (!requiredScope) return true;
    if (!tokenScope) return false;

    const scopes = tokenScope.split(' ');
    const required = requiredScope.split(' ');

    return required.every(r => scopes.includes(r) || scopes.includes('*'));
  }

  // ========================================================================
  // Token Revocation
  // ========================================================================

  /**
   * Revoke a token
   * @param {string} jti - Token ID (jti claim)
   * @param {string} [reason] - Revocation reason
   */
  revokeToken(jti, reason = '') {
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
    this.#revokedTokens.set(jti, { expiresAt, reason });
  }

  /**
   * Check if token is revoked
   * @param {string} jti - Token ID
   * @returns {boolean} True if revoked
   */
  isTokenRevoked(jti) {
    return this.#revokedTokens.has(jti);
  }

  // ========================================================================
  // Context Management
  // ========================================================================

  /**
   * Run function within auth context
   * @param {AuthContext} authContext - Auth context
   * @param {Function} fn - Function to run
   * @returns {Promise<any>} Function result
   */
  runWithContext(authContext, fn) {
    return this.#contextStorage.run(authContext, fn);
  }

  /**
   * Get current auth context
   * @returns {AuthContext} Current context
   */
  getContext() {
    return this.#contextStorage.getStore() || {
      authenticated: false,
      mode: this.#config.mode
    };
  }

  /**
   * Require authentication in current context
   * @returns {AuthContext} Current context
   * @throws {AuthError} If not authenticated
   */
  requireAuth() {
    const ctx = this.getContext();
    if (!ctx.authenticated) {
      throw new AuthError('AUTH_REQUIRED', 'Authentication required');
    }
    return ctx;
  }

  // ========================================================================
  // Rate Limiting
  // ========================================================================

  /**
   * Get rate limit status for an identifier
   * @param {string} method - Auth method (jwt, apiKey, oauth, session)
   * @param {string} identifier - Client identifier
   * @returns {{allowed: boolean, remaining: number, resetAt: number}}
   */
  getRateLimitStatus(method, identifier) {
    const key = `${method}:${identifier}`;
    const limit = this.#rateLimits.get(key);
    
    if (!limit) {
      return {
        allowed: true,
        remaining: this.#config.rateLimits[method],
        resetAt: Date.now() + this.#config.rateLimitWindow
      };
    }

    const now = Date.now();
    if (now > limit.resetAt) {
      return {
        allowed: true,
        remaining: this.#config.rateLimits[method],
        resetAt: now + this.#config.rateLimitWindow
      };
    }

    return {
      allowed: limit.count < this.#config.rateLimits[method],
      remaining: Math.max(0, this.#config.rateLimits[method] - limit.count),
      resetAt: limit.resetAt
    };
  }

  // ========================================================================
  // Cleanup
  // ========================================================================

  /**
   * Dispose of the middleware and stop cleanup intervals
   */
  dispose() {
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = null;
    }
    this.#sessions.clear();
    this.#apiKeys.clear();
    this.#revokedTokens.clear();
    this.#rateLimits.clear();
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  async #authenticateApiKey(key, request = null) {
    const [keyId, keySecret] = key.split('.');
    
    if (!keyId || !keySecret) {
      throw new AuthError('INVALID_API_KEY', 'Invalid API key format');
    }

    const apiKeyData = this.#apiKeys.get(keyId);
    if (!apiKeyData) {
      throw new AuthError('INVALID_API_KEY', 'API key not found');
    }

    if (apiKeyData.expiresAt && apiKeyData.expiresAt < Date.now()) {
      throw new AuthError('INVALID_API_KEY', 'API key has expired');
    }

    const secret = this.#config.secret || this.#getDefaultSecret();
    const computedSignature = createHmac('sha256', secret).update(keySecret).digest('hex');
    
    if (computedSignature !== apiKeyData.signature) {
      throw new AuthError('INVALID_API_KEY', 'API key verification failed');
    }

    apiKeyData.lastUsed = Date.now();
    apiKeyData.useCount++;

    return {
      authenticated: true,
      userId: apiKeyData.userId,
      role: 'api',
      permissions: apiKeyData.permissions,
      scope: apiKeyData.scope,
      mode: this.#config.mode,
      authType: AUTH_TYPES.API_KEY,
      clientIp: request?.ip || request?.connection?.remoteAddress
    };
  }

  async #authenticateOAuthToken(token, request = null) {
    let payload;
    let error;

    for (const [providerName, config] of this.#oauthProviders) {
      try {
        if (config.verifyToken) {
          payload = await config.verifyToken(token, config);
        } else {
          payload = await this.#verifyOAuthTokenWithProvider(token, config);
        }
        
        if (payload) {
          payload.provider = providerName;
          break;
        }
      } catch (err) {
        error = err;
        continue;
      }
    }

    if (!payload) {
      throw new AuthError('INVALID_OAUTH', error?.message || 'OAuth token validation failed');
    }

    return {
      authenticated: true,
      userId: payload.sub || payload.id || payload.email,
      role: payload.role || 'oauth_user',
      permissions: payload.permissions || [],
      scope: payload.scope,
      provider: payload.provider,
      mode: this.#config.mode,
      authType: AUTH_TYPES.OAUTH,
      clientIp: request?.ip || request?.connection?.remoteAddress
    };
  }

  async #verifyOAuthTokenWithProvider(token, config) {
    const response = await fetch(config.tokenEndpoint, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Token verification failed: ${response.statusText}`);
    }

    return await response.json();
  }

  async #authenticateSession(sessionId, request = null) {
    const session = this.#sessions.get(sessionId);
    
    if (!session) {
      throw new AuthError('INVALID_SESSION', 'Session not found');
    }

    if (session.expiresAt < Date.now()) {
      this.#sessions.delete(sessionId);
      throw new AuthError('SESSION_EXPIRED', 'Session has expired');
    }

    session.lastActivity = Date.now();

    return {
      authenticated: true,
      userId: session.userId,
      role: session.metadata?.role || 'user',
      permissions: session.metadata?.permissions || [],
      sessionId: session.id,
      expiresAt: session.expiresAt,
      mode: this.#config.mode,
      authType: AUTH_TYPES.SESSION,
      clientIp: request?.ip || request?.connection?.remoteAddress
    };
  }

  async #authenticateBasic(token, request = null) {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');

    if (!username || !password) {
      throw new AuthError('AUTH_REQUIRED', 'Invalid Basic auth format');
    }

    throw new AuthError('AUTH_REQUIRED', 'Basic auth not implemented - use JWT or API key');
  }

  async #validateAndRefresh(token, refreshToken) {
    try {
      const secret = await this.#getSigningKey('verify');
      const { payload } = await jwtVerify(refreshToken, secret, {
        issuer: this.#config.issuer,
        audience: this.#config.audience,
        algorithms: [this.#config.algorithm]
      });

      if (payload.type !== 'refresh') {
        throw new AuthError('INVALID_TOKEN', 'Invalid refresh token');
      }

      return await this.generateToken({
        userId: payload.sub,
        sessionId: payload.sid
      });
    } catch (error) {
      throw new AuthError('INVALID_TOKEN', `Refresh token validation failed: ${error.message}`);
    }
  }

  async #getSigningKey(operation) {
    if (this.#config.algorithm === JWT_ALGORITHMS.HS256) {
      return this.#getHMACSecret();
    }
    
    if (this.#config.algorithm === JWT_ALGORITHMS.RS256) {
      if (operation === 'sign') {
        return await this.#getRSAPrivateKey();
      }
      return await this.#getRSAPublicKey();
    }

    throw new AuthError('INVALID_ALGORITHM', `Unsupported algorithm: ${this.#config.algorithm}`);
  }

  #getHMACSecret() {
    if (this.#cachedSecret) {
      return this.#cachedSecret;
    }

    let secret = this.#config.secret;

    if (!secret && this.#config.secretFile && existsSync(this.#config.secretFile)) {
      secret = readFileSync(this.#config.secretFile, 'utf8').trim();
    }

    if (!secret && this.#config.autoGenerateSecret) {
      secret = this.#generateAndStoreSecret();
    }

    if (!secret) {
      throw new AuthError('INVALID_SECRET', 'No JWT secret configured');
    }

    this.#cachedSecret = base64url.decode(base64url.encode(secret));
    return this.#cachedSecret;
  }

  #generateAndStoreSecret() {
    const secret = randomBytes(64);
    const secretDir = join(homedir(), '.cognimesh');
    const secretPath = join(secretDir, 'jwt-secret');

    if (!existsSync(secretDir)) {
      mkdirSync(secretDir, { recursive: true, mode: 0o700 });
    }

    writeFileSync(secretPath, secret.toString('base64'), { mode: 0o600 });
    return secret.toString('base64');
  }

  async #getRSAPrivateKey() {
    if (this.#privateKey) {
      return this.#privateKey;
    }

    let keyPem = this.#config.privateKey;

    if (!keyPem && this.#config.privateKeyFile && existsSync(this.#config.privateKeyFile)) {
      keyPem = readFileSync(this.#config.privateKeyFile, 'utf8');
    }

    if (!keyPem) {
      throw new AuthError('INVALID_SECRET', 'No RSA private key configured');
    }

    this.#privateKey = await importPKCS8(keyPem, 'RS256');
    return this.#privateKey;
  }

  async #getRSAPublicKey() {
    if (this.#publicKey) {
      return this.#publicKey;
    }

    let keyPem = this.#config.publicKey;

    if (!keyPem && this.#config.publicKeyFile && existsSync(this.#config.publicKeyFile)) {
      keyPem = readFileSync(this.#config.publicKeyFile, 'utf8');
    }

    if (!keyPem) {
      throw new AuthError('INVALID_SECRET', 'No RSA public key configured');
    }

    this.#publicKey = await importSPKI(keyPem, 'RS256');
    return this.#publicKey;
  }

  #getDefaultSecret() {
    if (this.#cachedSecret) {
      return this.#cachedSecret;
    }
    return this.#getHMACSecret();
  }

  #generateTokenId() {
    return `jti_${randomBytes(16).toString('hex')}`;
  }

  #generateSessionId() {
    return `sess_${randomBytes(16).toString('hex')}`;
  }

  #createSession(sessionId, userId, tokenId) {
    const session = {
      id: sessionId,
      userId,
      tokenId,
      createdAt: Date.now(),
      expiresAt: Date.now() + (this.#config.refreshLifetime * 1000),
      lastActivity: Date.now()
    };
    this.#sessions.set(sessionId, session);
    return session;
  }

  #getClientId(req) {
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  #checkRateLimit(method, identifier) {
    const key = `${method}:${identifier}`;
    const now = Date.now();
    const limit = this.#rateLimits.get(key);

    if (!limit) {
      this.#rateLimits.set(key, {
        count: 1,
        windowStart: now,
        resetAt: now + this.#config.rateLimitWindow
      });
      return true;
    }

    if (now > limit.resetAt) {
      this.#rateLimits.set(key, {
        count: 1,
        windowStart: now,
        resetAt: now + this.#config.rateLimitWindow
      });
      return true;
    }

    limit.count++;
    return limit.count <= this.#config.rateLimits[method];
  }

  #getRateLimitReset(method, identifier) {
    const key = `${method}:${identifier}`;
    const limit = this.#rateLimits.get(key);
    return limit ? Math.ceil((limit.resetAt - Date.now()) / 1000) : 60;
  }

  #isTokenRevoked(jti) {
    const revoked = this.#revokedTokens.get(jti);
    if (!revoked) return false;
    
    if (revoked.expiresAt < Date.now()) {
      this.#revokedTokens.delete(jti);
      return false;
    }
    
    return true;
  }

  #handleAuthError(error, res, next) {
    if (error instanceof AuthError) {
      if (res.headersSent) {
        return next(error);
      }
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        ...error.metadata
      });
    }
    next(error);
  }

  #startCleanupInterval() {
    this.#cleanupInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [key, session] of this.#sessions) {
        if (session.expiresAt < now) {
          this.#sessions.delete(key);
        }
      }
      
      for (const [key, revoked] of this.#revokedTokens) {
        if (revoked.expiresAt < now) {
          this.#revokedTokens.delete(key);
        }
      }
      
      for (const [key, limit] of this.#rateLimits) {
        if (limit.resetAt < now) {
          this.#rateLimits.delete(key);
        }
      }
    }, 60000);

    if (this.#cleanupInterval.unref) {
      this.#cleanupInterval.unref();
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

/**
 * Get default auth middleware instance
 * @returns {AuthMiddleware}
 */
export function getAuthMiddleware() {
  if (!defaultInstance) {
    defaultInstance = new AuthMiddleware();
  }
  return defaultInstance;
}

/**
 * Reset default instance (primarily for testing)
 */
export function resetAuthMiddleware() {
  if (defaultInstance) {
    defaultInstance.dispose();
  }
  defaultInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export default AuthMiddleware;
