/**
 * @fileoverview CogniMesh Authentication System Tests
 * @module src/auth/auth.test
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { AuthService, AuthError, ACTOR_TYPES, AUTH_MODES, resetAuthService } from './auth-service.js';
import { createMultiActorMiddleware } from './multi-actor-middleware.js';

// ============================================================================
// Test Setup
// ============================================================================

describe('CogniMesh Authentication System', () => {
  let db;
  let authService;
  let middleware;

  before(async () => {
    // Create in-memory database
    db = new Database(':memory:');
    
    // Create required tables
    db.exec(`
      CREATE TABLE companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        settings TEXT DEFAULT '{}',
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE auth_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT NOT NULL,
        email_verified BOOLEAN DEFAULT 0,
        image TEXT,
        password_hash TEXT,
        company_id TEXT,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'active',
        last_login_at DATETIME,
        metadata TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE company_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
        UNIQUE(company_id, user_id)
      );

      CREATE TABLE agent_api_keys (
        id TEXT PRIMARY KEY,
        key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        name TEXT,
        actor_id TEXT NOT NULL,
        actor_type TEXT DEFAULT 'agent',
        company_id TEXT,
        permissions TEXT DEFAULT '[]',
        rate_limit INTEGER DEFAULT 500,
        expires_at DATETIME,
        last_used_at DATETIME,
        use_count INTEGER DEFAULT 0,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        revoked_at DATETIME,
        revoked_by TEXT
      );
    `);

    // Initialize auth service
    authService = new AuthService({
      db,
      mode: AUTH_MODES.REQUIRED,
      algorithm: 'HS256',
      secret: 'test-secret-key-for-unit-tests-only-do-not-use-in-production'
    });

    // Initialize middleware
    middleware = createMultiActorMiddleware({
      authService,
      mode: AUTH_MODES.REQUIRED
    });
  });

  after(() => {
    authService.dispose();
    resetAuthService();
    db.close();
  });

  // ============================================================================
  // User Registration Tests
  // ============================================================================

  describe('User Registration', () => {
    it('should register a new user with valid credentials', async () => {
      await authService.register({
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'Test User'
      });

      assert.ok(result.user, 'User should be created');
      assert.ok(result.tokens, 'Tokens should be generated');
      assert.ok(result.tokens.accessToken, 'Access token should exist');
      assert.ok(result.tokens.refreshToken, 'Refresh token should exist');
      assert.equal(result.user.email, 'test@example.com');
      assert.ok(result.user.company_id, 'User should have a company');
    });

    it('should reject registration with invalid email', async () => {
      await assert.rejects(
        async () => {
          await authService.register({
            email: 'invalid-email',
            password: 'SecurePassword123!'
          });
        },
        (err) => err instanceof AuthError && err.code === 'INVALID_CREDENTIALS'
      );
    });

    it('should reject registration with short password', async () => {
      await assert.rejects(
        async () => {
          await authService.register({
            email: 'test2@example.com',
            password: 'short'
          });
        },
        (err) => err instanceof AuthError && err.code === 'INVALID_CREDENTIALS'
      );
    });

    it('should reject duplicate email registration', async () => {
      await assert.rejects(
        async () => {
          await authService.register({
            email: 'test@example.com',
            password: 'AnotherPassword123!'
          });
        },
        (err) => err instanceof AuthError && err.code === 'INVALID_CREDENTIALS'
      );
    });
  });

  // ============================================================================
  // User Login Tests
  // ============================================================================

  describe('User Login', () => {
    it('should login with valid credentials', async () => {
      const result = await authService.login('test@example.com', 'SecurePassword123!');

      assert.ok(result.user, 'User should be returned');
      assert.ok(result.tokens, 'Tokens should be generated');
      assert.equal(result.user.email, 'test@example.com');
    });

    it('should reject login with invalid password', async () => {
      await assert.rejects(
        async () => {
          await authService.login('test@example.com', 'WrongPassword123!');
        },
        (err) => err instanceof AuthError && err.code === 'INVALID_CREDENTIALS'
      );
    });

    it('should reject login for non-existent user', async () => {
      await assert.rejects(
        async () => {
          await authService.login('nonexistent@example.com', 'Password123!');
        },
        (err) => err instanceof AuthError && err.code === 'INVALID_CREDENTIALS'
      );
    });
  });

  // ============================================================================
  // Token Verification Tests
  // ============================================================================

  describe('Token Verification', () => {
    let tokens;

    before(async () => {
      const result = await authService.login('test@example.com', 'SecurePassword123!');
      tokens = result.tokens;
    });

    it('should verify valid access token', async () => {
      const context = await authService.verifyAccessToken(tokens.accessToken);

      assert.equal(context.authenticated, true);
      assert.equal(context.actorType, ACTOR_TYPES.USER);
      assert.ok(context.actorId);
      assert.ok(context.companyId);
    });

    it('should reject invalid token', async () => {
      await assert.rejects(
        async () => {
          await authService.verifyAccessToken('invalid-token');
        },
        (err) => err instanceof AuthError
      );
    });

    it('should reject tampered token', async () => {
      const tamperedToken = tokens.accessToken.slice(0, -10) + 'tampered123';
      await assert.rejects(
        async () => {
          await authService.verifyAccessToken(tamperedToken);
        },
        (err) => err instanceof AuthError
      );
    });
  });

  // ============================================================================
  // Token Refresh Tests
  // ============================================================================

  describe('Token Refresh', () => {
    let tokens;

    before(async () => {
      const result = await authService.login('test@example.com', 'SecurePassword123!');
      tokens = result.tokens;
    });

    it('should refresh tokens with valid refresh token', async () => {
      const newTokens = await authService.refreshTokens(tokens.refreshToken);

      assert.ok(newTokens.accessToken, 'New access token should exist');
      assert.ok(newTokens.refreshToken, 'New refresh token should exist');
      assert.notEqual(newTokens.accessToken, tokens.accessToken, 'Access token should be different');
    });

    it('should reject refresh with invalid token', async () => {
      await assert.rejects(
        async () => {
          await authService.refreshTokens('invalid-refresh-token');
        },
        (err) => err instanceof AuthError
      );
    });

    it('should reject reuse of revoked refresh token', async () => {
      const result = await authService.login('test@example.com', 'SecurePassword123!');
      const refreshToken = result.tokens.refreshToken;

      // First refresh should succeed
      await authService.refreshTokens(refreshToken);

      // Second refresh with same token should fail
      await assert.rejects(
        async () => {
          await authService.refreshTokens(refreshToken);
        },
        (err) => err instanceof AuthError && err.code === 'TOKEN_REVOKED'
      );
    });
  });

  // ============================================================================
  // API Key Tests
  // ============================================================================

  describe('API Key Management', () => {
    let userId;
    let companyId;

    before(async () => {
      const result = await authService.login('test@example.com', 'SecurePassword123!');
      const context = await authService.verifyAccessToken(result.tokens.accessToken);
      userId = context.actorId;
      companyId = context.companyId;
    });

    it('should create API key for user', async () => {
      const result = await authService.createApiKey({
        actorId: userId,
        actorType: ACTOR_TYPES.USER,
        name: 'Test API Key',
        companyId,
        permissions: ['read', 'write']
      });

      assert.ok(result.key, 'API key should be generated');
      assert.ok(result.key.startsWith('cm_'), 'Key should start with cm_ prefix');
      assert.ok(result.apiKey, 'API key data should be returned');
      assert.equal(result.apiKey.name, 'Test API Key');
    });

    it('should validate API key and return auth context', async () => {
      const { key } = await authService.createApiKey({
        actorId: userId,
        actorType: ACTOR_TYPES.USER,
        companyId
      });

      const context = await authService.validateApiKey(key);

      assert.equal(context.authenticated, true);
      assert.equal(context.actorId, userId);
      assert.equal(context.actorType, ACTOR_TYPES.USER);
    });

    it('should reject invalid API key format', async () => {
      await assert.rejects(
        async () => {
          await authService.validateApiKey('invalid-key');
        },
        (err) => err instanceof AuthError && err.code === 'INVALID_API_KEY'
      );
    });

    it('should reject non-existent API key', async () => {
      await assert.rejects(
        async () => {
          await authService.validateApiKey('cm_nonexistent_123456789012345678901234567890');
        },
        (err) => err instanceof AuthError && err.code === 'INVALID_API_KEY'
      );
    });

    it('should revoke API key', async () => {
      const { key, apiKey } = await authService.createApiKey({
        actorId: userId,
        actorType: ACTOR_TYPES.USER,
        companyId
      });

      const revoked = await authService.revokeApiKey(apiKey.id, userId);
      assert.equal(revoked, true);

      // Should reject use of revoked key
      await assert.rejects(
        async () => {
          await authService.validateApiKey(key);
        },
        (err) => err instanceof AuthError && err.code === 'API_KEY_REVOKED'
      );
    });

    it('should list API keys for actor', async () => {
      // Create a few keys
      await authService.createApiKey({ actorId: userId, actorType: ACTOR_TYPES.USER, companyId, name: 'Key 1' });
      await authService.createApiKey({ actorId: userId, actorType: ACTOR_TYPES.USER, companyId, name: 'Key 2' });

      const keys = await authService.listApiKeys(userId);

      assert.ok(keys.length >= 2, 'Should have at least 2 keys');
      assert.ok(keys.every(k => !k.key_hash), 'Should not expose key_hash');
    });

    it('should reject expired API key', async () => {
      const { key } = await authService.createApiKey({
        actorId: userId,
        actorType: ACTOR_TYPES.USER,
        companyId,
        expiresIn: -1 // Already expired
      });

      await assert.rejects(
        async () => {
          await authService.validateApiKey(key);
        },
        (err) => err instanceof AuthError && err.code === 'API_KEY_EXPIRED'
      );
    });
  });

  // ============================================================================
  // Session Management Tests
  // ============================================================================

  describe('Session Management', () => {
    let userId;

    before(async () => {
      const result = await authService.login('test@example.com', 'SecurePassword123!');
      const context = await authService.verifyAccessToken(result.tokens.accessToken);
      userId = context.actorId;
    });

    it('should track user sessions', async () => {
      // Login multiple times to create sessions
      await authService.login('test@example.com', 'SecurePassword123!');
      await authService.login('test@example.com', 'SecurePassword123!');

      const sessions = authService.getSessions(userId);
      assert.ok(sessions.length >= 2, 'Should have multiple sessions');
    });

    it('should invalidate user session', async () => {
      // Create a new user for this test
      await authService.register({
        email: 'session-test@example.com',
        password: 'SecurePassword123!',
        name: 'Session Test'
      });
      const result = await authService.login('session-test@example.com', 'SecurePassword123!');
      
      // Get session from in-memory store after login
      const sessions = authService.getSessions(result.user.id);
      assert.ok(sessions.length > 0, 'Should have at least one session');
      
      const sessionId = sessions[0].id;
      const invalidated = authService.invalidateSession(sessionId);
      assert.equal(invalidated, true);
    });

    it('should invalidate all user sessions', async () => {
      // Create multiple sessions
      await authService.login('test@example.com', 'SecurePassword123!');
      await authService.login('test@example.com', 'SecurePassword123!');
      await authService.login('test@example.com', 'SecurePassword123!');

      const count = authService.invalidateUserSessions(userId);
      assert.ok(count > 0, 'Should invalidate multiple sessions');

      const remaining = authService.getSessions(userId);
      assert.equal(remaining.length, 0, 'Should have no active sessions');
    });
  });

  // ============================================================================
  // Company Management Tests
  // ============================================================================

  describe('Company Management', () => {
    it('should create a company', async () => {
      const result = await authService.login('test@example.com', 'SecurePassword123!');
      const context = await authService.verifyAccessToken(result.tokens.accessToken);

      const company = await authService.createCompany(
        { name: 'Test Company', slug: 'test-company' },
        context.actorId
      );

      assert.ok(company.id, 'Company should have ID');
      assert.equal(company.name, 'Test Company');
      assert.equal(company.slug, 'test-company');
    });

    it('should retrieve company by ID', async () => {
      const result = await authService.login('test@example.com', 'SecurePassword123!');
      const context = await authService.verifyAccessToken(result.tokens.accessToken);

      const company = await authService.createCompany(
        { name: 'Another Company' },
        context.actorId
      );

      const retrieved = authService.getCompany(company.id);
      assert.ok(retrieved);
      assert.equal(retrieved.name, 'Another Company');
    });
  });

  // ============================================================================
  // Multi-Actor Middleware Tests
  // ============================================================================

  describe('Multi-Actor Middleware', () => {
    it('should authenticate with JWT token', async () => {
      const result = await authService.login('test@example.com', 'SecurePassword123!');
      
      const req = {
        path: '/api/protected',
        headers: {
          authorization: `Bearer ${result.tokens.accessToken}`
        },
        ip: '127.0.0.1'
      };
      const res = { headersSent: false };
      let nextCalled = false;

      const middlewareFn = middleware.middleware();
      await middlewareFn(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, true);
      assert.equal(req.auth.authenticated, true);
      assert.equal(req.auth.actorType, ACTOR_TYPES.USER);
    });

    it('should authenticate with API key', async () => {
      const loginResult = await authService.login('test@example.com', 'SecurePassword123!');
      const context = await authService.verifyAccessToken(loginResult.tokens.accessToken);

      const { key } = await authService.createApiKey({
        actorId: context.actorId,
        actorType: ACTOR_TYPES.USER,
        companyId: context.companyId
      });

      const req = {
        path: '/api/protected',
        headers: {
          'x-api-key': key
        },
        ip: '127.0.0.1'
      };
      const res = { headersSent: false };
      let nextCalled = false;

      const middlewareFn = middleware.middleware();
      await middlewareFn(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, true);
      assert.equal(req.auth.authenticated, true);
    });

    it('should reject request without credentials', async () => {
      const req = {
        path: '/api/protected',
        headers: {},
        ip: '127.0.0.1'
      };
      const res = {
        headersSent: false,
        statusCode: null,
        jsonData: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.jsonData = data; return this; }
      };

      const middlewareFn = middleware.middleware();
      await middlewareFn(req, res, () => {});

      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData.code, 'AUTH_REQUIRED');
    });

    it('should allow public paths without auth', async () => {
      const req = {
        path: '/api/v1/auth/login',
        headers: {},
        ip: '127.0.0.1'
      };
      const res = { headersSent: false };
      let nextCalled = false;

      const middlewareFn = middleware.middleware();
      await middlewareFn(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, true);
      assert.equal(req.auth.authenticated, false);
    });
  });

  // ============================================================================
  // Password Security Tests
  // ============================================================================

  describe('Password Security', () => {
    it('should use scrypt for password hashing', async () => {
      const result = await authService.register({
        email: 'password-test@example.com',
        password: 'VerySecurePassword123!',
        name: 'Password Test User'
      });

      const user = db.prepare('SELECT password_hash FROM auth_users WHERE email = ?')
        .get('password-test@example.com');

      assert.ok(user.password_hash.startsWith('$scrypt$'), 'Should use scrypt');
      assert.ok(user.password_hash.includes('N=131072'), 'Should use high iteration count');
    });
  });

  // ============================================================================
  // Logout Tests
  // ============================================================================

  describe('Logout', () => {
    it('should logout and invalidate refresh token', async () => {
      const result = await authService.login('test@example.com', 'SecurePassword123!');
      
      const loggedOut = await authService.logout(result.tokens.refreshToken);
      assert.equal(loggedOut, true);

      // Should not be able to refresh with revoked token
      await assert.rejects(
        async () => {
          await authService.refreshTokens(result.tokens.refreshToken);
        },
        (err) => err instanceof AuthError
      );
    });
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running authentication tests...\n');
}
