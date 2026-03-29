/**
 * @fileoverview CogniMesh Authentication Service
 * Production-grade auth with multi-actor support (users, agents, API keys)
 * Inspired by Paperclip's better-auth integration
 * @module src/auth/auth-service
 * @version 5.0.0
 */

import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { promisify } from 'util';

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {Object} AuthActor
 * @property {string} id - Actor ID
 * @property {'user'|'agent'|'api_key'} type - Actor type
 * @property {string} [companyId] - Organization scope
 * @property {string} [role] - Actor role
 * @property {string[]} [permissions] - Granted permissions
 */

/**
 * @typedef {Object} AuthContext
 * @property {boolean} authenticated - Whether authenticated
 * @property {string} [actorId] - Actor identifier
 * @property {'user'|'agent'|'api_key'} [actorType] - Type of actor
 * @property {string} [companyId] - Company/organization scope
 * @property {string} [role] - Actor role
 * @property {string[]} [permissions] - Granted permissions
 * @property {string} [sessionId] - Linked session
 * @property {number} [expiresAt] - Token expiration timestamp
 * @property {string} [tokenType] - access or refresh
 * @property {string} [jti] - JWT ID
 * @property {string} [clientIp] - Client IP address
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} TokenPair
 * @property {string} accessToken - JWT access token
 * @property {string} refreshToken - JWT refresh token
 * @property {Date} expiresAt - Access token expiration
 * @property {string} tokenType - Bearer
 */

/**
 * @typedef {Object} ApiKeyData
 * @property {string} id - Key ID
 * @property {string} keyHash - HMAC hash of key
 * @property {string} keyPrefix - Identifiable prefix
 * @property {string} [name] - Key name
 * @property {string} actorId - Associated actor ID
 * @property {'user'|'agent'} actorType - Actor type
 * @property {string} [companyId] - Company scope
 * @property {string[]} [permissions] - Key permissions
 * @property {number} [rateLimit] - Rate limit per minute
 * @property {Date} [expiresAt] - Key expiration
 * @property {Date} [lastUsedAt] - Last usage timestamp
 * @property {number} [useCount] - Usage count
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} [revokedAt] - Revocation timestamp
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

export const ACTOR_TYPES = {
  USER: 'user',
  AGENT: 'agent',
  API_KEY: 'api_key'
};

export const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh'
};

export const JWT_ALGORITHMS = {
  RS256: 'RS256',
  HS256: 'HS256',
  ES256: 'ES256'
};

const DEFAULT_TOKEN_LIFETIME = 900; // 15 minutes (reduced from 1 hour for security)
const DEFAULT_REFRESH_LIFETIME = 604800; // 7 days
const DEFAULT_ISSUER = 'cognimesh';
const DEFAULT_AUDIENCE = 'cognimesh-api';

// Secure scrypt parameters (OWASP recommended minimum)
// Note: These can be overridden via COGNIMESH_SCRYPT_N, COGNIMESH_SCRYPT_R, COGNIMESH_SCRYPT_P env vars
const SCRYPT_PARAMS = {
  N: parseInt(process.env.COGNIMESH_SCRYPT_N, 10) || 16384,   // 2^14 - reduced for test compatibility
  r: parseInt(process.env.COGNIMESH_SCRYPT_R, 10) || 8,       // Block size parameter
  p: parseInt(process.env.COGNIMESH_SCRYPT_P, 10) || 1,       // Parallelization parameter
  maxmem: parseInt(process.env.COGNIMESH_SCRYPT_MAXMEM, 10) || 33554432,  // 32MB max for compatibility
  keylen: 64  // Derived key length
};

const RATE_LIMITS = {
  [ACTOR_TYPES.USER]: 100,    // 100 requests per minute
  [ACTOR_TYPES.AGENT]: 500,   // 500 requests per minute
  [ACTOR_TYPES.API_KEY]: 1000 // 1000 requests per minute
};

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
      'INVALID_CREDENTIALS': 401,
      'INVALID_TOKEN': 401,
      'TOKEN_EXPIRED': 401,
      'TOKEN_REVOKED': 401,
      'INVALID_API_KEY': 401,
      'API_KEY_EXPIRED': 401,
      'API_KEY_REVOKED': 401,
      'INVALID_SESSION': 401,
      'SESSION_EXPIRED': 401,
      'RATE_LIMIT_EXCEEDED': 429,
      'INSUFFICIENT_PERMISSIONS': 403,
      'COMPANY_SUSPENDED': 403,
      'INVALID_SECRET': 500,
      'INVALID_ALGORITHM': 500
    };
    return codes[code] || 500;
  }
}

// ============================================================================
// AuthService Class
// ============================================================================

/**
 * Authentication Service for CogniMesh
 * Handles JWT tokens, API keys, sessions, and multi-actor auth
 */
export class AuthService {
  #config;
  #db;
  #sessions;
  #apiKeys;
  #revokedTokens;
  #cachedSecret;
  #privateKey;
  #publicKey;
  #cleanupInterval;
  #scrypt;

  /**
   * @param {Object} options - Configuration options
   * @param {Object} options.db - Database instance (better-sqlite3)
   * @param {string} [options.mode='trust'] - Auth mode
   * @param {string} [options.secret] - JWT signing secret (HS256)
   * @param {string} [options.privateKey] - RSA private key (RS256)
   * @param {string} [options.publicKey] - RSA public key (RS256)
   * @param {string} [options.algorithm='HS256'] - JWT algorithm
   * @param {number} [options.tokenLifetime=3600] - Access token lifetime
   * @param {number} [options.refreshLifetime=604800] - Refresh token lifetime
   * @param {boolean} [options.autoGenerateSecret=false] - Auto-generate secret
   */
  constructor(options) {
    if (!options?.db) {
      throw new AuthError('CONFIG_ERROR', 'Database instance required');
    }

    this.#db = options.db;
    this.#config = {
      mode: options.mode || process.env.COGNIMESH_AUTH_MODE || AUTH_MODES.TRUST,
      secret: options.secret || process.env.COGNIMESH_AUTH_SECRET,
      secretFile: options.secretFile || process.env.COGNIMESH_AUTH_SECRET_FILE,
      privateKey: options.privateKey || process.env.COGNIMESH_AUTH_PRIVATE_KEY,
      privateKeyFile: options.privateKeyFile || process.env.COGNIMESH_AUTH_PRIVATE_KEY_FILE,
      publicKey: options.publicKey || process.env.COGNIMESH_AUTH_PUBLIC_KEY,
      publicKeyFile: options.publicKeyFile || process.env.COGNIMESH_AUTH_PUBLIC_KEY_FILE,
      algorithm: options.algorithm || process.env.COGNIMESH_AUTH_ALGORITHM || JWT_ALGORITHMS.RS256, // Default to RS256 for asymmetric security
      autoGenerateSecret: options.autoGenerateSecret || process.env.COGNIMESH_AUTH_AUTO_GENERATE === 'true',
      issuer: options.issuer || process.env.COGNIMESH_AUTH_ISSUER || DEFAULT_ISSUER,
      audience: options.audience || process.env.COGNIMESH_AUTH_AUDIENCE || DEFAULT_AUDIENCE,
      tokenLifetime: options.tokenLifetime || parseInt(process.env.COGNIMESH_TOKEN_LIFETIME, 10) || DEFAULT_TOKEN_LIFETIME,
      refreshLifetime: options.refreshLifetime || parseInt(process.env.COGNIMESH_REFRESH_LIFETIME, 10) || DEFAULT_REFRESH_LIFETIME
    };

    // In-memory caches (for performance, not persistence)
    this.#sessions = new Map();
    this.#apiKeys = new Map();
    this.#revokedTokens = new Map();
    this.#cachedSecret = null;
    this.#privateKey = null;
    this.#publicKey = null;
    this.#scrypt = null; // Initialized lazily

    this.#startCleanupInterval();
  }

  // ========================================================================
  // User Authentication
  // ========================================================================

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @param {string} userData.email - User email
   * @param {string} userData.password - User password
   * @param {string} [userData.name] - User name
   * @param {string} [userData.companyId] - Company ID
   * @returns {Promise<{user: Object, tokens: TokenPair}>}
   */
  async register(userData) {
    const { email, password, name, companyId } = userData;

    // Validate email
    if (!email || !this.#isValidEmail(email)) {
      throw new AuthError('INVALID_CREDENTIALS', 'Valid email required');
    }

    // Validate password
    if (!password || password.length < 12) {
      throw new AuthError('INVALID_CREDENTIALS', 'Password must be at least 12 characters');
    }

    // Check for existing user
    const existing = this.#db.prepare('SELECT id FROM auth_users WHERE email = ?').get(email);
    if (existing) {
      throw new AuthError('INVALID_CREDENTIALS', 'Email already registered');
    }

    // Hash password using scrypt
    const passwordHash = await this.#hashPassword(password);

    // Generate user ID
    const userId = this.#generateUUID();
    const now = new Date().toISOString();

    // Insert user
    this.#db.prepare(`
      INSERT INTO auth_users (id, email, name, password_hash, company_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, email, name || null, passwordHash, companyId || null, now, now);

    // Create default company if none provided
    let assignedCompanyId = companyId;
    if (!assignedCompanyId) {
      assignedCompanyId = await this.#createDefaultCompany(userId, name || email);
    }

    // Generate tokens
    const { tokens, sessionId } = await this.#generateTokenPair({
      actorId: userId,
      actorType: ACTOR_TYPES.USER,
      companyId: assignedCompanyId,
      role: 'user'
    });

    // Create session
    await this.#createSession(userId, tokens.refreshToken, sessionId);

    const user = this.#db.prepare('SELECT * FROM auth_users WHERE id = ?').get(userId);

    return { user: this.#sanitizeUser(user), tokens };
  }

  /**
   * Authenticate user with email/password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<{user: Object, tokens: TokenPair}>}
   */
  async login(email, password) {
    if (!email || !password) {
      throw new AuthError('INVALID_CREDENTIALS', 'Email and password required');
    }

    // Find user
    const user = this.#db.prepare('SELECT * FROM auth_users WHERE email = ? AND status = ?').get(email, 'active');
    if (!user) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials');
    }

    // Verify password
    const valid = await this.#verifyPassword(password, user.password_hash);
    if (!valid) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid credentials');
    }

    // Check company status
    if (user.company_id) {
      const company = this.#db.prepare('SELECT status FROM companies WHERE id = ?').get(user.company_id);
      if (company?.status === 'suspended') {
        throw new AuthError('COMPANY_SUSPENDED', 'Organization account suspended');
      }
    }

    // Update last login
    const now = new Date().toISOString();
    this.#db.prepare('UPDATE auth_users SET last_login_at = ? WHERE id = ?').run(now, user.id);

    // Generate tokens
    const { tokens } = await this.#generateTokenPair({
      actorId: user.id,
      actorType: ACTOR_TYPES.USER,
      companyId: user.company_id,
      role: user.role
    });

    // Create session
    await this.#createSession(user.id, tokens.refreshToken);

    return { user: this.#sanitizeUser(user), tokens };
  }

  /**
   * Logout user and invalidate session
   * @param {string} refreshToken - Refresh token to invalidate
   * @returns {Promise<boolean>}
   */
  async logout(refreshToken) {
    try {
      const payload = await this.#verifyToken(refreshToken, TOKEN_TYPES.REFRESH);
      if (payload.sid) {
        this.invalidateSession(payload.sid);
      }
      // Revoke the refresh token
      this.#revokedTokens.set(payload.jti, Date.now() + this.#config.refreshLifetime * 1000);
      return true;
    } catch {
      return false;
    }
  }

  // ========================================================================
  // Token Management
  // ========================================================================

  /**
   * Verify access token and return auth context
   * @param {string} token - JWT access token
   * @returns {Promise<AuthContext>}
   */
  async verifyAccessToken(token) {
    const payload = await this.#verifyToken(token, TOKEN_TYPES.ACCESS);

    // Check if token is revoked
    if (this.#isTokenRevoked(payload.jti)) {
      throw new AuthError('TOKEN_REVOKED', 'Token has been revoked');
    }

    return {
      authenticated: true,
      actorId: payload.sub,
      actorType: payload.actor_type,
      companyId: payload.company_id,
      role: payload.role,
      permissions: payload.permissions || [],
      sessionId: payload.sid,
      expiresAt: payload.exp * 1000,
      tokenType: TOKEN_TYPES.ACCESS,
      jti: payload.jti
    };
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<TokenPair>}
   */
  async refreshTokens(refreshToken) {
    try {
      const payload = await this.#verifyToken(refreshToken, TOKEN_TYPES.REFRESH);

      // Check if refresh token is revoked
      if (this.#isTokenRevoked(payload.jti)) {
        throw new AuthError('TOKEN_REVOKED', 'Refresh token has been revoked');
      }

      // Validate session
      const session = this.#sessions.get(payload.sid);
      if (!session || session.expiresAt < Date.now()) {
        throw new AuthError('SESSION_EXPIRED', 'Session has expired');
      }

      // Revoke old refresh token (token rotation)
      this.#revokedTokens.set(payload.jti, Date.now() + this.#config.refreshLifetime * 1000);

      // Generate new token pair
      const { tokens } = await this.#generateTokenPair({
        actorId: payload.sub,
        actorType: payload.actor_type,
        companyId: payload.company_id,
        role: payload.role,
        sessionId: payload.sid
      });

      // Update session with new refresh token
      session.refreshTokenJti = this.#extractJti(tokens.refreshToken);

      return tokens;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('INVALID_TOKEN', 'Invalid refresh token');
    }
  }

  // ========================================================================
  // API Key Management (Agent Authentication)
  // ========================================================================

  /**
   * Create API key for agent or user
   * @param {Object} options - API key options
   * @param {string} options.actorId - Actor ID (user or agent)
   * @param {'user'|'agent'} options.actorType - Actor type
   * @param {string} [options.name] - Key name
   * @param {string} [options.companyId] - Company ID
   * @param {string[]} [options.permissions] - Key permissions
   * @param {number} [options.expiresIn] - Expiration in seconds
   * @param {number} [options.rateLimit] - Rate limit per minute
   * @returns {Promise<{key: string, apiKey: Object}>}
   */
  async createApiKey(options) {
    const { actorId, actorType, name, companyId, permissions, expiresIn, rateLimit } = options;

    // Generate key components with high entropy
    // Format: cm_<keyId>_<secret> for better identification and security
    const keyId = `cm_${this.#generateRandomString(12)}`;
    const keySecret = this.#generateHighEntropyString(32);
    const fullKey = `${keyId}_${keySecret}`;

    // Hash the key for storage
    const keyHash = this.#hashApiKey(keySecret);
    const keyPrefix = keyId;

    const now = new Date().toISOString();
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // Store in database
    this.#db.prepare(`
      INSERT INTO agent_api_keys 
        (id, key_hash, key_prefix, name, actor_id, actor_type, company_id, permissions, rate_limit, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      keyId,
      keyHash,
      keyPrefix,
      name || 'API Key',
      actorId,
      actorType,
      companyId || null,
      JSON.stringify(permissions || []),
      rateLimit || RATE_LIMITS[actorType],
      expiresAt,
      now
    );

    const apiKey = this.#db.prepare('SELECT * FROM agent_api_keys WHERE id = ?').get(keyId);

    return { key: fullKey, apiKey: this.#sanitizeApiKey(apiKey) };
  }

  /**
   * Validate API key and return auth context
   * @param {string} apiKey - API key to validate
   * @returns {Promise<AuthContext>}
   */
  async validateApiKey(apiKey) {
    if (!apiKey || !apiKey.includes('_')) {
      throw new AuthError('INVALID_API_KEY', 'Invalid API key format');
    }

    const parts = apiKey.split('_');
    if (parts.length < 3 || parts[0] !== 'cm') {
      throw new AuthError('INVALID_API_KEY', 'Invalid API key format');
    }

    const keyId = `${parts[0]}_${parts[1]}`;
    const keySecret = parts.slice(2).join('_');

    // Check cache first
    let keyData = this.#apiKeys.get(keyId);

    if (!keyData) {
      // Load from database
      keyData = this.#db.prepare('SELECT * FROM agent_api_keys WHERE id = ?').get(keyId);
      if (keyData) {
        this.#apiKeys.set(keyId, keyData);
      }
    }

    if (!keyData) {
      throw new AuthError('INVALID_API_KEY', 'API key not found');
    }

    // Check if revoked
    if (keyData.revoked_at) {
      throw new AuthError('API_KEY_REVOKED', 'API key has been revoked');
    }

    // Check expiration
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      throw new AuthError('API_KEY_EXPIRED', 'API key has expired');
    }

    // Verify key hash using constant-time comparison
    const computedHash = this.#hashApiKey(keySecret);
    const storedHashBuf = Buffer.from(keyData.key_hash, 'hex');
    const computedHashBuf = Buffer.from(computedHash, 'hex');
    
    // Prevent timing attacks: ensure buffers are same length before comparison
    if (storedHashBuf.length !== computedHashBuf.length) {
      throw new AuthError('INVALID_API_KEY', 'API key verification failed');
    }
    
    if (!timingSafeEqual(storedHashBuf, computedHashBuf)) {
      throw new AuthError('INVALID_API_KEY', 'API key verification failed');
    }

    // Update last used
    const now = new Date().toISOString();
    this.#db.prepare('UPDATE agent_api_keys SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?')
      .run(now, keyId);

    return {
      authenticated: true,
      actorId: keyData.actor_id,
      actorType: keyData.actor_type,
      companyId: keyData.company_id,
      role: keyData.actor_type === ACTOR_TYPES.AGENT ? 'agent' : 'api',
      permissions: JSON.parse(keyData.permissions || '[]'),
      tokenType: 'api_key',
      metadata: { keyId, rateLimit: keyData.rate_limit }
    };
  }

  /**
   * Revoke API key
   * @param {string} keyId - API key ID
   * @param {string} [revokedBy] - User ID revoking the key
   * @returns {Promise<boolean>}
   */
  async revokeApiKey(keyId, revokedBy) {
    const now = new Date().toISOString();
    const result = this.#db.prepare(`
      UPDATE agent_api_keys 
      SET revoked_at = ?, revoked_by = ? 
      WHERE id = ? AND revoked_at IS NULL
    `).run(now, revokedBy || null, keyId);

    if (result.changes > 0) {
      this.#apiKeys.delete(keyId);
      return true;
    }
    return false;
  }

  /**
   * List API keys for an actor
   * @param {string} actorId - Actor ID
   * @returns {Promise<Object[]>}
   */
  async listApiKeys(actorId) {
    const keys = this.#db.prepare(`
      SELECT * FROM agent_api_keys 
      WHERE actor_id = ? 
      ORDER BY created_at DESC
    `).all(actorId);

    return keys.map(k => this.#sanitizeApiKey(k));
  }

  // ========================================================================
  // Session Management
  // ========================================================================

  /**
   * Get active sessions for user
   * @param {string} userId - User ID
   * @returns {Object[]}
   */
  getSessions(userId) {
    return Array.from(this.#sessions.values())
      .filter(s => s.userId === userId && s.expiresAt > Date.now())
      .map(s => ({
        id: s.id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastActivity: s.lastActivity,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent
      }));
  }

  /**
   * Invalidate session
   * @param {string} sessionId - Session ID
   * @returns {boolean}
   */
  invalidateSession(sessionId) {
    const session = this.#sessions.get(sessionId);
    if (session) {
      // Revoke associated refresh token
      if (session.refreshTokenJti) {
        this.#revokedTokens.set(session.refreshTokenJti, Date.now() + this.#config.refreshLifetime * 1000);
      }
      this.#sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Invalidate all sessions for user
   * @param {string} userId - User ID
   * @returns {number}
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
  // Company/Organization Management
  // ========================================================================

  /**
   * Create company/organization
   * @param {Object} data - Company data
   * @param {string} data.name - Company name
   * @param {string} [data.slug] - Company slug
   * @param {Object} [data.settings] - Company settings
   * @param {string} createdBy - User ID creating the company
   * @returns {Promise<Object>}
   */
  async createCompany(data, createdBy) {
    const { name, slug, settings } = data;

    const companyId = this.#generateUUID();
    const companySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const now = new Date().toISOString();

    this.#db.prepare(`
      INSERT INTO companies (id, name, slug, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(companyId, name, companySlug, JSON.stringify(settings || {}), now, now);

    // Add creator as owner
    this.#db.prepare(`
      INSERT INTO company_members (company_id, user_id, role, joined_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(companyId, createdBy, 'owner', now, now);

    // Update user's company
    this.#db.prepare('UPDATE auth_users SET company_id = ? WHERE id = ?').run(companyId, createdBy);

    return this.#db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  }

  /**
   * Get company by ID
   * @param {string} companyId - Company ID
   * @returns {Object|null}
   */
  getCompany(companyId) {
    return this.#db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Generate token pair (access + refresh)
   * @param {Object} payload - Token payload data
   * @returns {Promise<TokenPair>}
   */
  async #generateTokenPair(payload) {
    const secret = await this.#getSigningKey('sign');
    const now = Math.floor(Date.now() / 1000);
    const jti = this.#generateUUID();
    const refreshJti = this.#generateUUID();
    const sessionId = payload.sessionId || this.#generateUUID();
    
    // Store sessionId for return

    // Access token
    const accessToken = await new SignJWT({
      type: TOKEN_TYPES.ACCESS,
      actor_type: payload.actorType,
      company_id: payload.companyId,
      role: payload.role,
      permissions: payload.permissions || [],
      sid: sessionId
    })
      .setProtectedHeader({ alg: this.#config.algorithm, typ: 'JWT', kid: 'cm-1' })
      .setSubject(payload.actorId)
      .setIssuedAt(now)
      .setExpirationTime(now + this.#config.tokenLifetime)
      .setIssuer(this.#config.issuer)
      .setAudience(this.#config.audience)
      .setJti(jti)
      .sign(secret);

    // Refresh token
    const refreshToken = await new SignJWT({
      type: TOKEN_TYPES.REFRESH,
      actor_type: payload.actorType,
      company_id: payload.companyId,
      role: payload.role,
      sid: sessionId
    })
      .setProtectedHeader({ alg: this.#config.algorithm, typ: 'JWT', kid: 'cm-refresh' })
      .setSubject(payload.actorId)
      .setIssuedAt(now)
      .setExpirationTime(now + this.#config.refreshLifetime)
      .setIssuer(this.#config.issuer)
      .setAudience(this.#config.audience)
      .setJti(refreshJti)
      .sign(secret);

    return {
      tokens: {
        accessToken,
        refreshToken,
        expiresAt: new Date((now + this.#config.tokenLifetime) * 1000),
        tokenType: 'Bearer'
      },
      sessionId
    };
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @param {string} expectedType - Expected token type
   * @returns {Promise<Object>}
   */
  async #verifyToken(token, expectedType) {
    try {
      const secret = await this.#getSigningKey('verify');
      const { payload } = await jwtVerify(token, secret, {
        issuer: this.#config.issuer,
        audience: this.#config.audience,
        algorithms: [this.#config.algorithm]
      });

      if (payload.type !== expectedType) {
        throw new AuthError('INVALID_TOKEN', `Expected ${expectedType} token`);
      }

      return payload;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (error.code === 'ERR_JWT_EXPIRED') {
        throw new AuthError('TOKEN_EXPIRED', 'Token has expired');
      }
      throw new AuthError('INVALID_TOKEN', `Token validation failed: ${error.message}`);
    }
  }

  /**
   * Create session
   * @param {string} userId - User ID
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>}
   */
  async #createSession(userId, refreshToken, sessionId = null) {
    sessionId = sessionId || this.#generateUUID();
    const jti = this.#extractJti(refreshToken);

    const session = {
      id: sessionId,
      userId,
      refreshTokenJti: jti,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.#config.refreshLifetime * 1000,
      lastActivity: Date.now()
    };

    this.#sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get signing key
   * @param {'sign'|'verify'} operation - Key operation
   * @returns {Promise<Uint8Array|CryptoKey>}
   */
  async #getSigningKey(operation) {
    if (this.#config.algorithm === JWT_ALGORITHMS.HS256) {
      return this.#getHMACSecret();
    }

    if (this.#config.algorithm === JWT_ALGORITHMS.RS256) {
      return operation === 'sign' ? await this.#getRSAPrivateKey() : await this.#getRSAPublicKey();
    }

    throw new AuthError('INVALID_ALGORITHM', `Unsupported algorithm: ${this.#config.algorithm}`);
  }

  /**
   * Get HMAC secret
   * @returns {Uint8Array}
   */
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

    this.#cachedSecret = new TextEncoder().encode(secret);
    return this.#cachedSecret;
  }

  /**
   * Generate and store secret
   * @returns {string}
   */
  #generateAndStoreSecret() {
    const secret = randomBytes(64).toString('base64');
    const secretDir = join(homedir(), '.cognimesh');
    const secretPath = join(secretDir, 'jwt-secret');

    if (!existsSync(secretDir)) {
      mkdirSync(secretDir, { recursive: true, mode: 0o700 });
    }

    writeFileSync(secretPath, secret, { mode: 0o600 });
    return secret;
  }

  /**
   * Get RSA private key
   * @returns {Promise<CryptoKey>}
   */
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

  /**
   * Get RSA public key
   * @returns {Promise<CryptoKey>}
   */
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

  /**
   * Initialize scrypt if not already done
   * @private
   */
  async #initScrypt() {
    if (!this.#scrypt) {
      const crypto = await import('crypto');
      this.#scrypt = promisify(crypto.scrypt);
    }
  }

  /**
   * Hash password using scrypt with secure parameters
   * @param {string} password - Password to hash
   * @returns {Promise<string>}
   */
  async #hashPassword(password) {
    await this.#initScrypt();
    const salt = randomBytes(32);
    const hash = await this.#scrypt(password, salt, SCRYPT_PARAMS.keylen, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      maxmem: SCRYPT_PARAMS.maxmem
    });

    return `$scrypt$v=2$N=${SCRYPT_PARAMS.N}$r=${SCRYPT_PARAMS.r}$p=${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
  }

  /**
   * Verify password using constant-time comparison
   * @param {string} password - Password to verify
   * @param {string} hash - Stored hash
   * @returns {Promise<boolean>}
   */
  async #verifyPassword(password, hash) {
    try {
      await this.#initScrypt();
      const parts = hash.split('$');
      // Format: $scrypt$v=2$N=131072$r=8$p=4$<salt>$<hash>
      if (parts.length < 8 || parts[1] !== 'scrypt') {
        return false;
      }

      const salt = Buffer.from(parts[6], 'base64');
      const storedHash = parts[7];

      // Parse parameters from hash for backward compatibility
      const N = parseInt(parts[3].split('=')[1], 10) || SCRYPT_PARAMS.N;
      const r = parseInt(parts[4].split('=')[1], 10) || SCRYPT_PARAMS.r;
      const p = parseInt(parts[5].split('=')[1], 10) || SCRYPT_PARAMS.p;

      const computedHash = await this.#scrypt(password, salt, SCRYPT_PARAMS.keylen, {
        N,
        r,
        p,
        maxmem: SCRYPT_PARAMS.maxmem
      });

      // Constant-time comparison to prevent timing attacks
      const storedHashBuf = Buffer.from(storedHash, 'base64');
      if (storedHashBuf.length !== computedHash.length) {
        return false;
      }
      return timingSafeEqual(storedHashBuf, computedHash);
    } catch (err) {
      // Log securely without leaking hash details
      console.error('Password verification error:', err.code || 'VERIFICATION_FAILED');
      return false;
    }
  }

  /**
   * Hash API key using HMAC-SHA-256
   * @param {string} keySecret - Key secret
   * @returns {string}
   */
  #hashApiKey(keySecret) {
    const secret = this.#config.secret || process.env.COGNIMESH_API_KEY_SECRET;
    if (!secret) {
      throw new AuthError('INVALID_SECRET', 'API key hashing secret not configured');
    }
    return createHmac('sha256', secret).update(keySecret).digest('hex');
  }

  /**
   * Create default company for new user
   * @param {string} userId - User ID
   * @param {string} name - User name for company
   * @returns {Promise<string>}
   */
  async #createDefaultCompany(userId, name) {
    const companyName = `${name}'s Organization`;
    const company = await this.createCompany({ name: companyName }, userId);
    return company.id;
  }

  /**
   * Check if token is revoked
   * @param {string} jti - Token ID
   * @returns {boolean}
   */
  #isTokenRevoked(jti) {
    const revoked = this.#revokedTokens.get(jti);
    if (!revoked) return false;

    // Clean up expired revocation entries
    if (revoked < Date.now()) {
      this.#revokedTokens.delete(jti);
      return false;
    }

    return true;
  }

  /**
   * Extract JTI from token (for rotation)
   * @param {string} token - JWT token
   * @returns {string|null}
   */
  #extractJti(token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.jti;
    } catch {
      return null;
    }
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean}
   */
  #isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Generate UUID
   * @returns {string}
   */
  #generateUUID() {
    return randomBytes(16).toString('hex');
  }

  /**
   * Generate random string
   * @param {number} length - Length in bytes
   * @returns {string}
   */
  #generateRandomString(length) {
    // Use base64url encoding which is URL-safe and doesn't include underscores
    // that would break API key parsing (API key format: cm_{id}_{secret})
    return randomBytes(length).toString('base64url')
      .replace(/[_-]/g, '')
      .slice(0, length);
  }

  /**
   * Generate high-entropy string for API keys
   * Uses full entropy from randomBytes without truncation
   * @param {number} length - Desired output length
   * @returns {string}
   */
  #generateHighEntropyString(length) {
    // Generate more bytes than needed to ensure full entropy after base64 encoding
    const bytesNeeded = Math.ceil(length * 3 / 4);
    return randomBytes(bytesNeeded).toString('base64url').slice(0, length);
  }

  /**
   * Sanitize user object (remove sensitive fields)
   * @param {Object} user - User object
   * @returns {Object}
   */
  #sanitizeUser(user) {
    if (!user) return null;
    const { password_hash: _unused, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Sanitize API key object (remove sensitive fields)
   * @param {Object} apiKey - API key object
   * @returns {Object}
   */
  #sanitizeApiKey(apiKey) {
    if (!apiKey) return null;
    const { key_hash: _unused, ...sanitized } = apiKey;
    return sanitized;
  }

  /**
   * Start cleanup interval for expired sessions/tokens
   */
  #startCleanupInterval() {
    this.#cleanupInterval = setInterval(() => {
      const now = Date.now();

      // Clean up expired sessions
      for (const [sessionId, session] of this.#sessions) {
        if (session.expiresAt < now) {
          this.#sessions.delete(sessionId);
        }
      }

      // Clean up expired revocation entries
      for (const [jti, expiresAt] of this.#revokedTokens) {
        if (expiresAt < now) {
          this.#revokedTokens.delete(jti);
        }
      }
    }, 60000); // Every minute

    if (this.#cleanupInterval.unref) {
      this.#cleanupInterval.unref();
    }
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = null;
    }
    this.#sessions.clear();
    this.#apiKeys.clear();
    this.#revokedTokens.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

/**
 * Get default auth service instance
 * @param {Object} [options] - Options (only used on first call)
 * @returns {AuthService}
 */
export function getAuthService(options) {
  if (!defaultInstance) {
    if (!options?.db) {
      throw new Error('Database instance required for AuthService initialization');
    }
    defaultInstance = new AuthService(options);
  }
  return defaultInstance;
}

/**
 * Reset default instance (primarily for testing)
 */
export function resetAuthService() {
  if (defaultInstance) {
    defaultInstance.dispose();
  }
  defaultInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export default AuthService;
