/**
 * @fileoverview Auth Controller API Tests
 * Tests for authentication REST API endpoints
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuthController } from '../../src/controllers/auth-controller.js';
import { AuthService } from '../../src/auth/auth-service.js';
import {
  createTestDatabase,
  createTestAuthOptions,
  clearTestData,
  closeTestDatabase,
  createMockRequest,
  createMockResponse,
  isSuccessResponse,
  isErrorResponse
} from '../setup.js';

describe('AuthController', () => {
  let db;
  let authService;
  let authController;

  beforeEach(async () => {
    db = await createTestDatabase();
    authService = new AuthService(createTestAuthOptions(db));
    authController = new AuthController({ authService, db });
  });

  afterEach(() => {
    authService.dispose();
    clearTestData(db);
    closeTestDatabase(db);
  });

  // ============================================================================
  // Routes
  // ============================================================================

  describe('Routes', () => {
    it('should return all route definitions', () => {
      const routes = authController.getRoutes();

      assert.ok(Array.isArray(routes));
      assert.ok(routes.length > 0);

      // Check required routes exist
      const paths = routes.map(r => r.path);
      assert.ok(paths.includes('/api/auth/register'));
      assert.ok(paths.includes('/api/auth/login'));
      assert.ok(paths.includes('/api/auth/logout'));
      assert.ok(paths.includes('/api/auth/refresh'));
      assert.ok(paths.includes('/api/auth/me'));
      assert.ok(paths.includes('/api/auth/api-keys'));
    });

    it('should have correct HTTP methods for routes', () => {
      const routes = authController.getRoutes();

      const registerRoute = routes.find(r => r.path === '/api/auth/register');
      assert.equal(registerRoute.method, 'POST');

      const loginRoute = routes.find(r => r.path === '/api/auth/login');
      assert.equal(loginRoute.method, 'POST');

      const meRoute = routes.find(r => r.path === '/api/auth/me');
      assert.equal(meRoute.method, 'GET');
    });

    it('should indicate authentication requirements', () => {
      const routes = authController.getRoutes();

      const publicRoutes = routes.filter(r => !r.auth);
      const protectedRoutes = routes.filter(r => r.auth);

      assert.ok(publicRoutes.some(r => r.path === '/api/auth/register'));
      assert.ok(publicRoutes.some(r => r.path === '/api/auth/login'));
      assert.ok(protectedRoutes.some(r => r.path === '/api/auth/me'));
      assert.ok(protectedRoutes.some(r => r.path === '/api/auth/api-keys'));
    });
  });

  // ============================================================================
  // Register Endpoint
  // ============================================================================

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'newuser@example.com',
          password: 'SecurePassword123!',
          name: 'New User'
        }
      });
      const res = createMockResponse();

      await authController.register(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.parsedData.success, true);
      assert.ok(res.parsedData.data.user);
      assert.ok(res.parsedData.data.tokens);
      assert.equal(res.parsedData.data.user.email, 'newuser@example.com');
    });

    it('should return 400 for invalid email', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'invalid-email',
          password: 'SecurePassword123!',
          name: 'Test User'
        }
      });
      const res = createMockResponse();

      await authController.register(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.parsedData.success, false);
      assert.equal(res.parsedData.code, 'VALIDATION_ERROR');
    });

    it('should return 400 for short password', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'test@example.com',
          password: 'short',
          name: 'Test User'
        }
      });
      const res = createMockResponse();

      await authController.register(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.parsedData.success, false);
    });

    it('should return 400 for missing required fields', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { email: 'test@example.com' }
      });
      const res = createMockResponse();

      await authController.register(req, res);

      assert.equal(res.statusCode, 400);
    });

    it('should return error for duplicate email', async () => {
      // First registration
      const req1 = createMockRequest({
        method: 'POST',
        body: {
          email: 'duplicate@example.com',
          password: 'SecurePassword123!',
          name: 'First User'
        }
      });
      await authController.register(req1, createMockResponse());

      // Second registration with same email
      const req2 = createMockRequest({
        method: 'POST',
        body: {
          email: 'duplicate@example.com',
          password: 'AnotherPassword123!',
          name: 'Second User'
        }
      });
      const res2 = createMockResponse();
      await authController.register(req2, res2);

      assert.equal(res2.statusCode, 401);
      assert.equal(res2.parsedData.success, false);
    });

    it('should handle empty request body', async () => {
      const req = createMockRequest({ method: 'POST', body: {} });
      const res = createMockResponse();

      await authController.register(req, res);

      assert.equal(res.statusCode, 400);
    });
  });

  // ============================================================================
  // Login Endpoint
  // ============================================================================

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'login@example.com',
          password: 'SecurePassword123!',
          name: 'Login Test User'
        }
      });
      await authController.register(req, createMockResponse());
    });

    it('should login with valid credentials', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'login@example.com',
          password: 'SecurePassword123!'
        }
      });
      const res = createMockResponse();

      await authController.login(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.parsedData.success, true);
      assert.ok(res.parsedData.data.user);
      assert.ok(res.parsedData.data.tokens);
    });

    it('should return 401 for invalid credentials', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'login@example.com',
          password: 'WrongPassword123!'
        }
      });
      const res = createMockResponse();

      await authController.login(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res.parsedData.success, false);
    });

    it('should return 401 for non-existent user', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'nonexistent@example.com',
          password: 'SecurePassword123!'
        }
      });
      const res = createMockResponse();

      await authController.login(req, res);

      assert.equal(res.statusCode, 401);
    });

    it('should return 400 for missing email', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { password: 'SecurePassword123!' }
      });
      const res = createMockResponse();

      await authController.login(req, res);

      assert.equal(res.statusCode, 400);
    });

    it('should return 400 for missing password', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { email: 'login@example.com' }
      });
      const res = createMockResponse();

      await authController.login(req, res);

      assert.equal(res.statusCode, 400);
    });
  });

  // ============================================================================
  // Logout Endpoint
  // ============================================================================

  describe('POST /api/auth/logout', () => {
    let refreshToken;

    beforeEach(async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'logout@example.com',
          password: 'SecurePassword123!',
          name: 'Logout Test User'
        }
      });
      const res = createMockResponse();
      await authController.register(req, res);
      refreshToken = res.parsedData.data.tokens.refreshToken;
    });

    it('should logout successfully with refresh token', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { refreshToken }
      });
      const res = createMockResponse();

      await authController.logout(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.parsedData.success, true);
    });

    it('should return success even without token', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {}
      });
      const res = createMockResponse();

      await authController.logout(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.parsedData.success, true);
    });

    it('should invalidate token after logout', async () => {
      // Logout
      const logoutReq = createMockRequest({
        method: 'POST',
        body: { refreshToken }
      });
      await authController.logout(logoutReq, createMockResponse());

      // Try to refresh with logged out token
      const refreshReq = createMockRequest({
        method: 'POST',
        body: { refreshToken }
      });
      const refreshRes = createMockResponse();
      await authController.refresh(refreshReq, refreshRes);

      assert.equal(refreshRes.statusCode, 401);
    });
  });

  // ============================================================================
  // Token Refresh Endpoint
  // ============================================================================

  describe('POST /api/auth/refresh', () => {
    let refreshToken;

    beforeEach(async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'refresh@example.com',
          password: 'SecurePassword123!',
          name: 'Refresh Test User'
        }
      });
      const res = createMockResponse();
      await authController.register(req, res);
      refreshToken = res.parsedData.data.tokens.refreshToken;
    });

    it('should refresh tokens successfully', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { refreshToken }
      });
      const res = createMockResponse();

      await authController.refresh(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.parsedData.success, true);
      assert.ok(res.parsedData.data.tokens.accessToken);
      assert.ok(res.parsedData.data.tokens.refreshToken);
    });

    it('should return 400 for missing refresh token', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {}
      });
      const res = createMockResponse();

      await authController.refresh(req, res);

      assert.equal(res.statusCode, 400);
    });

    it('should return 401 for invalid refresh token', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: { refreshToken: 'invalid-token' }
      });
      const res = createMockResponse();

      await authController.refresh(req, res);

      assert.equal(res.statusCode, 401);
    });

    it('should rotate refresh tokens', async () => {
      const req1 = createMockRequest({
        method: 'POST',
        body: { refreshToken }
      });
      const res1 = createMockResponse();
      await authController.refresh(req1, res1);

      const newRefreshToken = res1.parsedData.data.tokens.refreshToken;
      assert.notEqual(newRefreshToken, refreshToken);

      // Old token should be invalid
      const req2 = createMockRequest({
        method: 'POST',
        body: { refreshToken }
      });
      const res2 = createMockResponse();
      await authController.refresh(req2, res2);
      assert.equal(res2.statusCode, 401);

      // New token should work
      const req3 = createMockRequest({
        method: 'POST',
        body: { refreshToken: newRefreshToken }
      });
      const res3 = createMockResponse();
      await authController.refresh(req3, res3);
      assert.equal(res3.statusCode, 200);
    });
  });

  // ============================================================================
  // Get Profile Endpoint
  // ============================================================================

  describe('GET /api/auth/me', () => {
    let accessToken;
    let userId;

    beforeEach(async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'profile@example.com',
          password: 'SecurePassword123!',
          name: 'Profile Test User'
        }
      });
      const res = createMockResponse();
      await authController.register(req, res);
      accessToken = res.parsedData.data.tokens.accessToken;
      userId = res.parsedData.data.user.id;
    });

    it('should get current user profile', async () => {
      const req = createMockRequest({
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}` },
        auth: {
          authenticated: true,
          actorId: userId,
          actorType: 'user'
        }
      });
      const res = createMockResponse();

      await authController.getMe(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.parsedData.success, true);
      assert.ok(res.parsedData.data.user);
      assert.equal(res.parsedData.data.user.email, 'profile@example.com');
      assert.ok(!res.parsedData.data.user.password_hash);
    });

    it('should return 401 when not authenticated', async () => {
      const req = createMockRequest({
        method: 'GET',
        auth: null
      });
      const res = createMockResponse();

      await authController.getMe(req, res);

      assert.equal(res.statusCode, 401);
    });

    it('should include auth context in response', async () => {
      const req = createMockRequest({
        method: 'GET',
        auth: {
          authenticated: true,
          actorId: userId,
          actorType: 'user',
          companyId: 'test-company',
          role: 'user',
          permissions: ['read:all']
        }
      });
      const res = createMockResponse();

      await authController.getMe(req, res);

      assert.ok(res.parsedData.data.auth);
      assert.equal(res.parsedData.data.auth.actorType, 'user');
      assert.equal(res.parsedData.data.auth.companyId, 'test-company');
    });
  });

  // ============================================================================
  // Update Profile Endpoint
  // ============================================================================

  describe('PUT /api/auth/me', () => {
    let accessToken;
    let userId;

    beforeEach(async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'update@example.com',
          password: 'SecurePassword123!',
          name: 'Update Test User'
        }
      });
      const res = createMockResponse();
      await authController.register(req, res);
      accessToken = res.parsedData.data.tokens.accessToken;
      userId = res.parsedData.data.user.id;
    });

    it('should update user name', async () => {
      const req = createMockRequest({
        method: 'PUT',
        body: { name: 'Updated Name' },
        auth: {
          authenticated: true,
          actorId: userId
        }
      });
      const res = createMockResponse();

      await authController.updateMe(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.parsedData.success, true);
      assert.equal(res.parsedData.data.user.name, 'Updated Name');
    });

    it('should update user email', async () => {
      const req = createMockRequest({
        method: 'PUT',
        body: { email: 'newemail@example.com' },
        auth: {
          authenticated: true,
          actorId: userId
        }
      });
      const res = createMockResponse();

      await authController.updateMe(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.parsedData.data.user.email, 'newemail@example.com');
    });

    it('should return 400 for empty update', async () => {
      const req = createMockRequest({
        method: 'PUT',
        body: {},
        auth: {
          authenticated: true,
          actorId: userId
        }
      });
      const res = createMockResponse();

      await authController.updateMe(req, res);

      assert.equal(res.statusCode, 400);
    });

    it('should return 401 when not authenticated', async () => {
      const req = createMockRequest({
        method: 'PUT',
        body: { name: 'New Name' },
        auth: null
      });
      const res = createMockResponse();

      await authController.updateMe(req, res);

      assert.equal(res.statusCode, 401);
    });

    it('should return 409 for duplicate email', async () => {
      // Create another user first
      const otherReq = createMockRequest({
        method: 'POST',
        body: {
          email: 'other@example.com',
          password: 'SecurePassword123!',
          name: 'Other User'
        }
      });
      await authController.register(otherReq, createMockResponse());

      // Try to update to that email
      const req = createMockRequest({
        method: 'PUT',
        body: { email: 'other@example.com' },
        auth: {
          authenticated: true,
          actorId: userId
        }
      });
      const res = createMockResponse();

      await authController.updateMe(req, res);

      assert.equal(res.statusCode, 409);
    });
  });

  // ============================================================================
  // API Key CRUD Endpoints
  // ============================================================================

  describe('API Key Endpoints', () => {
    let accessToken;
    let userId;

    beforeEach(async () => {
      const req = createMockRequest({
        method: 'POST',
        body: {
          email: 'apikey@example.com',
          password: 'SecurePassword123!',
          name: 'API Key Test User'
        }
      });
      const res = createMockResponse();
      await authController.register(req, res);
      accessToken = res.parsedData.data.tokens.accessToken;
      userId = res.parsedData.data.user.id;
    });

    describe('POST /api/auth/api-keys', () => {
      it('should create API key', async () => {
        const req = createMockRequest({
          method: 'POST',
          body: { name: 'Test API Key' },
          auth: {
            authenticated: true,
            actorId: userId,
            actorType: 'user'
          }
        });
        const res = createMockResponse();

        await authController.createApiKey(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.parsedData.success, true);
        assert.ok(res.parsedData.data.key);
        assert.ok(res.parsedData.data.apiKey);
        assert.equal(res.parsedData.data.apiKey.name, 'Test API Key');
      });

      it('should create API key with custom permissions', async () => {
        const req = createMockRequest({
          method: 'POST',
          body: {
            name: 'Test API Key',
            permissions: ['read:tasks', 'write:tasks']
          },
          auth: {
            authenticated: true,
            actorId: userId,
            actorType: 'user'
          }
        });
        const res = createMockResponse();

        await authController.createApiKey(req, res);

        assert.equal(res.statusCode, 201);
      });

      it('should create API key with expiration', async () => {
        const req = createMockRequest({
          method: 'POST',
          body: {
            name: 'Test API Key',
            expiresIn: 3600
          },
          auth: {
            authenticated: true,
            actorId: userId,
            actorType: 'user'
          }
        });
        const res = createMockResponse();

        await authController.createApiKey(req, res);

        assert.equal(res.statusCode, 201);
      });

      it('should return 401 when not authenticated', async () => {
        const req = createMockRequest({
          method: 'POST',
          body: { name: 'Test Key' },
          auth: null
        });
        const res = createMockResponse();

        await authController.createApiKey(req, res);

        assert.equal(res.statusCode, 401);
      });
    });

    describe('GET /api/auth/api-keys', () => {
      beforeEach(async () => {
        // Create some API keys
        for (let i = 0; i < 3; i++) {
          const req = createMockRequest({
            method: 'POST',
            body: { name: `Key ${i + 1}` },
            auth: {
              authenticated: true,
              actorId: userId,
              actorType: 'user'
            }
          });
          await authController.createApiKey(req, createMockResponse());
        }
      });

      it('should list API keys', async () => {
        const req = createMockRequest({
          method: 'GET',
          url: '/api/auth/api-keys',
          auth: {
            authenticated: true,
            actorId: userId
          }
        });
        const res = createMockResponse();

        await authController.listApiKeys(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.parsedData.success, true);
        assert.ok(Array.isArray(res.parsedData.data));
        assert.ok(res.parsedData.data.length >= 3);
      });

      it('should return 401 when not authenticated', async () => {
        const req = createMockRequest({
          method: 'GET',
          auth: null
        });
        const res = createMockResponse();

        await authController.listApiKeys(req, res);

        assert.equal(res.statusCode, 401);
      });
    });

    describe('DELETE /api/auth/api-keys/:id', () => {
      let apiKeyId;

      beforeEach(async () => {
        const req = createMockRequest({
          method: 'POST',
          body: { name: 'Key to Revoke' },
          auth: {
            authenticated: true,
            actorId: userId,
            actorType: 'user'
          }
        });
        const res = createMockResponse();
        await authController.createApiKey(req, res);
        apiKeyId = res.parsedData.data.apiKey.id;
      });

      it('should revoke API key', async () => {
        const req = createMockRequest({
          method: 'DELETE',
          url: `/api/auth/api-keys/${apiKeyId}`,
          auth: {
            authenticated: true,
            actorId: userId
          }
        });
        const res = createMockResponse();

        await authController.revokeApiKey(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.parsedData.success, true);
      });

      it('should return 404 for non-existent key', async () => {
        const req = createMockRequest({
          method: 'DELETE',
          url: '/api/auth/api-keys/non-existent-id',
          auth: {
            authenticated: true,
            actorId: userId
          }
        });
        const res = createMockResponse();

        await authController.revokeApiKey(req, res);

        assert.equal(res.statusCode, 404);
      });

      it('should return 400 for missing key ID', async () => {
        const req = createMockRequest({
          method: 'DELETE',
          url: '/api/auth/api-keys/',
          auth: {
            authenticated: true,
            actorId: userId
          }
        });
        const res = createMockResponse();

        await authController.revokeApiKey(req, res);

        assert.equal(res.statusCode, 400);
      });
    });
  });

  // ============================================================================
  // Password Reset Endpoints
  // ============================================================================

  describe('Password Reset', () => {
    describe('POST /api/auth/forgot-password', () => {
      it('should return success even for non-existent email', async () => {
        const req = createMockRequest({
          method: 'POST',
          body: { email: 'nonexistent@example.com' }
        });
        const res = createMockResponse();

        await authController.forgotPassword(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.parsedData.success, true);
      });

      it('should return 400 for invalid email', async () => {
        const req = createMockRequest({
          method: 'POST',
          body: { email: 'invalid-email' }
        });
        const res = createMockResponse();

        await authController.forgotPassword(req, res);

        assert.equal(res.statusCode, 400);
      });
    });

    describe('POST /api/auth/reset-password', () => {
      it('should return 501 (not implemented)', async () => {
        const req = createMockRequest({
          method: 'POST',
          body: {
            token: 'some-token',
            password: 'NewPassword123!'
          }
        });
        const res = createMockResponse();

        await authController.resetPassword(req, res);

        assert.equal(res.statusCode, 501);
      });

      it('should validate password length', async () => {
        const req = createMockRequest({
          method: 'POST',
          body: {
            token: 'some-token',
            password: 'short'
          }
        });
        const res = createMockResponse();

        await authController.resetPassword(req, res);

        assert.equal(res.statusCode, 400);
      });
    });
  });
});
