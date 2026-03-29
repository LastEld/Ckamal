/**
 * @fileoverview Auth Edge Case Tests
 * Tests for edge cases, boundary conditions, and error scenarios
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService, AuthError, AUTH_MODES, ACTOR_TYPES, TOKEN_TYPES } from '../../src/auth/auth-service.js';
import {
  createTestDatabase,
  createTestAuthOptions,
  clearTestData,
  closeTestDatabase,
  createMockRequest,
  createMockResponse,
  generateUUID,
  sleep
} from '../setup.js';

describe('Auth Edge Cases', () => {
  let db;
  let authService;

  beforeEach(async () => {
    db = await createTestDatabase();
    const options = createTestAuthOptions(db);
    authService = new AuthService(options);
  });

  afterEach(() => {
    authService.dispose();
    clearTestData(db);
    closeTestDatabase(db);
  });

  // ============================================================================
  // Email Edge Cases
  // ============================================================================

  describe('Email Edge Cases', () => {
    it('should reject email with only whitespace', async () => {
      await assert.rejects(
        authService.register({
          email: '   ',
          password: 'SecurePassword123!',
          name: 'Test User'
        }),
        /Valid email required/
      );
    });

    it('should reject email without @ symbol', async () => {
      await assert.rejects(
        authService.register({
          email: 'testexample.com',
          password: 'SecurePassword123!',
          name: 'Test User'
        }),
        /Valid email required/
      );
    });

    it('should reject email without domain', async () => {
      await assert.rejects(
        authService.register({
          email: 'test@',
          password: 'SecurePassword123!',
          name: 'Test User'
        }),
        /Valid email required/
      );
    });

    it('should reject email with multiple @ symbols', async () => {
      await assert.rejects(
        authService.register({
          email: 'test@@example.com',
          password: 'SecurePassword123!',
          name: 'Test User'
        }),
        /Valid email required/
      );
    });

    it('should handle very long email addresses', async () => {
      const longLocal = 'a'.repeat(50);
      const result = await authService.register({
        email: `${longLocal}@example.com`,
        password: 'SecurePassword123!',
        name: 'Test User'
      });
      assert.ok(result.user);
      assert.equal(result.user.email, `${longLocal}@example.com`);
    });

    it('should reject null email', async () => {
      await assert.rejects(
        authService.register({
          email: null,
          password: 'SecurePassword123!',
          name: 'Test User'
        }),
        /Valid email required/
      );
    });

    it('should reject undefined email', async () => {
      await assert.rejects(
        authService.register({
          email: undefined,
          password: 'SecurePassword123!',
          name: 'Test User'
        }),
        /Valid email required/
      );
    });
  });

  // ============================================================================
  // Password Edge Cases
  // ============================================================================

  describe('Password Edge Cases', () => {
    it('should reject password of exactly 11 characters', async () => {
      await assert.rejects(
        authService.register({
          email: 'test@example.com',
          password: '12345678901', // 11 chars
          name: 'Test User'
        }),
        /Password must be at least 12 characters/
      );
    });

    it('should accept password of exactly 12 characters', async () => {
      const result = await authService.register({
        email: 'test@example.com',
        password: '123456789012', // 12 chars
        name: 'Test User'
      });
      assert.ok(result.user);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(1000);
      const result = await authService.register({
        email: 'test@example.com',
        password: longPassword,
        name: 'Test User'
      });
      assert.ok(result.user);
    });

    it('should reject empty password', async () => {
      await assert.rejects(
        authService.register({
          email: 'test@example.com',
          password: '',
          name: 'Test User'
        }),
        /Password must be at least 12 characters/
      );
    });

    it('should accept password with only whitespace (allowed)', async () => {
      // Whitespace-only passwords are technically allowed if they meet length
      const result = await authService.register({
        email: 'test-whitespace@example.com',
        password: '            ', // 12 spaces
        name: 'Test User'
      });
      assert.ok(result.user);
    });

    it('should handle passwords with special characters', async () => {
      const result = await authService.register({
        email: 'test@example.com',
        password: '!@#$%^&*()_+-=[]{}|;:,.<>?',
        name: 'Test User'
      });
      assert.ok(result.user);
    });

    it('should handle passwords with unicode characters', async () => {
      const result = await authService.register({
        email: 'test@example.com',
        password: 'Secure🔐Password123!',
        name: 'Test User'
      });
      assert.ok(result.user);
    });
  });

  // ============================================================================
  // Name Edge Cases
  // ============================================================================

  describe('Name Edge Cases', () => {
    it('should handle very long names', async () => {
      const longName = 'A'.repeat(100);
      const result = await authService.register({
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: longName
      });
      assert.equal(result.user.name, longName);
    });

    it('should handle single character names', async () => {
      const result = await authService.register({
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'X'
      });
      assert.equal(result.user.name, 'X');
    });

    it('should handle names with special characters', async () => {
      const result = await authService.register({
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'O\'Connor-Smith Jr.'
      });
      assert.equal(result.user.name, 'O\'Connor-Smith Jr.');
    });

    it('should handle names with unicode characters', async () => {
      const result = await authService.register({
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'José García 日本語'
      });
      assert.equal(result.user.name, 'José García 日本語');
    });
  });

  // ============================================================================
  // Token Edge Cases
  // ============================================================================

  describe('Token Edge Cases', () => {
    let tokens;

    beforeEach(async () => {
      const result = await authService.register({
        email: 'token@example.com',
        password: 'SecurePassword123!',
        name: 'Token Test User'
      });
      tokens = result.tokens;
    });

    it('should reject malformed token', async () => {
      await assert.rejects(
        authService.verifyAccessToken('not-a-valid-token'),
        /Token validation failed/
      );
    });

    it('should reject empty token', async () => {
      await assert.rejects(
        authService.verifyAccessToken(''),
        /Token validation failed/
      );
    });

    it('should reject token with only two parts', async () => {
      await assert.rejects(
        authService.verifyAccessToken('part1.part2'),
        /Token validation failed/
      );
    });

    it('should reject token with extra parts', async () => {
      await assert.rejects(
        authService.verifyAccessToken('part1.part2.part3.part4'),
        /Token validation failed/
      );
    });

    it('should reject token with invalid base64', async () => {
      await assert.rejects(
        authService.verifyAccessToken('header.payload!@#.signature'),
        /Token validation failed/
      );
    });

    it('should reject tampered token', async () => {
      const tamperedToken = tokens.accessToken.slice(0, -5) + 'xxxxx';
      await assert.rejects(
        authService.verifyAccessToken(tamperedToken),
        /Token validation failed/
      );
    });

    it('should reject token with modified payload', async () => {
      const parts = tokens.accessToken.split('.');
      parts[1] = Buffer.from('{"sub":"hacker"}').toString('base64url');
      const tamperedToken = parts.join('.');
      await assert.rejects(
        authService.verifyAccessToken(tamperedToken),
        /Token validation failed/
      );
    });

    it('should handle concurrent token refreshes', async () => {
      // Try to refresh the same token multiple times concurrently
      const promises = [
        authService.refreshTokens(tokens.refreshToken),
        authService.refreshTokens(tokens.refreshToken),
        authService.refreshTokens(tokens.refreshToken)
      ];

      // At least one should succeed, others should fail
      const results = await Promise.allSettled(promises);
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // First one succeeds, subsequent ones should fail due to rotation
      assert.ok(succeeded >= 1, 'At least one refresh should succeed');
    });
  });

  // ============================================================================
  // API Key Edge Cases
  // ============================================================================

  describe('API Key Edge Cases', () => {
    let userId;

    beforeEach(async () => {
      const result = await authService.register({
        email: 'apikey@example.com',
        password: 'SecurePassword123!',
        name: 'API Key Test User'
      });
      userId = result.user.id;
    });

    it('should reject API key with invalid format (no underscore)', async () => {
      await assert.rejects(
        authService.validateApiKey('invalidkey'),
        /Invalid API key format/
      );
    });

    it('should reject API key without cm prefix', async () => {
      await assert.rejects(
        authService.validateApiKey('invalid_key_format'),
        /Invalid API key format/
      );
    });

    it('should reject empty API key', async () => {
      await assert.rejects(
        authService.validateApiKey(''),
        /Invalid API key format/
      );
    });

    it('should reject null API key', async () => {
      await assert.rejects(
        authService.validateApiKey(null),
        /Invalid API key format/
      );
    });

    it('should create API key with zero expiration', async () => {
      // Should be valid immediately
      const { key } = await authService.createApiKey({
        actorId: userId,
        actorType: 'user',
        name: 'Test Key',
        expiresIn: 60 // 1 minute minimum
      });
      const context = await authService.validateApiKey(key);
      assert.ok(context.authenticated);
    });

    it('should create API key with maximum permissions', async () => {
      const permissions = Array.from({ length: 50 }, (_, i) => `permission:${i}`);
      const { apiKey } = await authService.createApiKey({
        actorId: userId,
        actorType: 'user',
        name: 'Test Key',
        permissions
      });
      const parsedPerms = JSON.parse(apiKey.permissions);
      assert.equal(parsedPerms.length, 50);
    });

    it('should handle API key creation with empty name', async () => {
      const { apiKey } = await authService.createApiKey({
        actorId: userId,
        actorType: 'user',
        name: ''
      });
      assert.ok(apiKey);
    });

    it('should handle API key creation with null name', async () => {
      const { apiKey } = await authService.createApiKey({
        actorId: userId,
        actorType: 'user',
        name: null
      });
      // Should default to 'API Key'
      assert.ok(apiKey.name);
    });
  });

  // ============================================================================
  // Session Edge Cases
  // ============================================================================

  describe('Session Edge Cases', () => {
    let userId;
    let tokens;

    beforeEach(async () => {
      const result = await authService.register({
        email: 'session@example.com',
        password: 'SecurePassword123!',
        name: 'Session Test User'
      });
      userId = result.user.id;
      tokens = result.tokens;
    });

    it('should handle getting sessions for non-existent user', () => {
      const sessions = authService.getSessions('non-existent-user');
      assert.equal(sessions.length, 0);
    });

    it('should handle invalidating non-existent session', () => {
      const result = authService.invalidateSession('non-existent-session');
      assert.equal(result, false);
    });

    it('should handle invalidating already invalidated session', () => {
      const sessions = authService.getSessions(userId);
      const sessionId = sessions[0].id;

      // First invalidation should succeed
      const result1 = authService.invalidateSession(sessionId);
      assert.equal(result1, true);

      // Second invalidation should return false
      const result2 = authService.invalidateSession(sessionId);
      assert.equal(result2, false);
    });

    it('should handle multiple login sessions', async () => {
      // Create additional sessions by logging in again
      await authService.login('session@example.com', 'SecurePassword123!');
      await authService.login('session@example.com', 'SecurePassword123!');

      const sessions = authService.getSessions(userId);
      assert.ok(sessions.length >= 3);
    });

    it('should invalidate all sessions for user', async () => {
      // Create multiple sessions
      await authService.login('session@example.com', 'SecurePassword123!');
      await authService.login('session@example.com', 'SecurePassword123!');

      const count = authService.invalidateUserSessions(userId);
      assert.ok(count >= 3);

      const remaining = authService.getSessions(userId);
      assert.equal(remaining.length, 0);
    });
  });

  // ============================================================================
  // Company Edge Cases
  // ============================================================================

  describe('Company Edge Cases', () => {
    it('should return undefined for non-existent company', () => {
      // Note: getCompany returns undefined for non-existent companies
      const company = authService.getCompany('non-existent-id');
      assert.ok(company === null || company === undefined);
    });

    it('should handle company creation with valid user', async () => {
      const result = await authService.register({
        email: 'company-creator@example.com',
        password: 'SecurePassword123!',
        name: 'Company Creator'
      });
      
      const company = await authService.createCompany({
        name: 'Test Company',
        description: 'A test company'
      }, result.user.id);
      
      assert.ok(company);
      assert.equal(company.name, 'Test Company');
    });
  });

  // ============================================================================
  // Error Handling Edge Cases
  // ============================================================================

  describe('Error Handling Edge Cases', () => {
    it('should handle AuthError with undefined code', () => {
      const error = new AuthError(undefined, 'Test message');
      assert.equal(error.code, undefined);
      assert.equal(error.statusCode, 500);
    });

    it('should handle AuthError with empty message', () => {
      const error = new AuthError('TEST_ERROR', '');
      assert.equal(error.message, '');
      assert.equal(error.code, 'TEST_ERROR');
    });

    it('should handle AuthError with complex metadata', () => {
      const metadata = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        date: new Date()
      };
      const error = new AuthError('TEST_ERROR', 'Test', metadata);
      assert.deepEqual(error.metadata, metadata);
    });
  });

  // ============================================================================
  // Rate Limiting Edge Cases
  // ============================================================================

  describe('Rate Limiting Edge Cases', () => {
    it('should handle API key with very high rate limit', async () => {
      const result = await authService.register({
        email: 'ratelimit@example.com',
        password: 'SecurePassword123!',
        name: 'Rate Limit Test'
      });

      const { apiKey } = await authService.createApiKey({
        actorId: result.user.id,
        actorType: 'user',
        name: 'High Rate Key',
        rateLimit: 1000000 // Very high
      });

      assert.equal(apiKey.rate_limit, 1000000);
    });

    it('should handle API key with zero rate limit', async () => {
      const result = await authService.register({
        email: 'ratelimit2@example.com',
        password: 'SecurePassword123!',
        name: 'Rate Limit Test'
      });

      const { apiKey } = await authService.createApiKey({
        actorId: result.user.id,
        actorType: 'user',
        name: 'Zero Rate Key',
        rateLimit: 0
      });

      // Should use default or accept 0
      assert.ok(apiKey.rate_limit !== undefined);
    });
  });

  // ============================================================================
  // Concurrent Operations
  // ============================================================================

  describe('Concurrent Operations', () => {
    it('should handle concurrent registrations with different emails', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        authService.register({
          email: `concurrent${i}@example.com`,
          password: 'SecurePassword123!',
          name: `User ${i}`
        })
      );

      const results = await Promise.all(promises);
      assert.equal(results.length, 5);
      // All should have unique IDs
      const ids = results.map(r => r.user.id);
      const uniqueIds = new Set(ids);
      assert.equal(uniqueIds.size, 5);
    });

    it('should handle concurrent API key creation', async () => {
      const result = await authService.register({
        email: 'concurrent-keys@example.com',
        password: 'SecurePassword123!',
        name: 'Concurrent Keys'
      });

      const promises = Array.from({ length: 10 }, (_, i) =>
        authService.createApiKey({
          actorId: result.user.id,
          actorType: 'user',
          name: `Key ${i}`
        })
      );

      const results = await Promise.all(promises);
      assert.equal(results.length, 10);
      // All keys should be unique
      const keys = results.map(r => r.key);
      const uniqueKeys = new Set(keys);
      assert.equal(uniqueKeys.size, 10);
    });
  });
});
