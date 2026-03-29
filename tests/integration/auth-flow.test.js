/**
 * @fileoverview Authentication Flow Integration Tests
 * Tests full auth flow: register → login → create API key → use API key
 * Company creation flow and member invitation flow
 * 
 * @module tests/integration/auth-flow
 * @version 5.0.0
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from '../helpers/test-server.js';
import { createTestClient } from '../helpers/test-client.js';

describe('Auth Flow Integration Tests', () => {
  let server;
  let client;
  let baseUrl;
  const testUsers = [];
  const testCompanies = [];

  before(async () => {
    server = await startTestServer({
      port: 0,
      environment: 'test',
      enableAuth: true
    });
    baseUrl = `http://localhost:${server.port}`;
    client = createTestClient(baseUrl);
  });

  after(async () => {
    // Cleanup test data
    for (const user of testUsers) {
      try {
        await client.delete(`/api/auth/users/${user.id}`);
      } catch {
        // Ignore cleanup errors
      }
    }
    for (const company of testCompanies) {
      try {
        await client.delete(`/api/companies/${company.id}`);
      } catch {
        // Ignore cleanup errors
      }
    }
    await stopTestServer(server);
  });

  describe('Full Auth Flow', () => {
    it('should complete full auth flow: register → login → create API key → use API key', async () => {
      // Step 1: Register a new user
      const registerData = {
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePassword123!',
        name: 'Test User'
      };

      const registerRes = await client.post('/api/auth/register', registerData);
      
      assert.equal(registerRes.status, 201, 'Registration should succeed');
      assert.equal(registerRes.data.success, true);
      assert.ok(registerRes.data.data.user.id, 'User should have an ID');
      assert.equal(registerRes.data.data.user.email, registerData.email);
      assert.ok(registerRes.data.data.tokens.accessToken, 'Should receive access token');
      assert.ok(registerRes.data.data.tokens.refreshToken, 'Should receive refresh token');
      
      const userId = registerRes.data.data.user.id;
      const tokens = registerRes.data.data.tokens;
      testUsers.push({ id: userId, email: registerData.email });
      
      console.log(`  ✓ User registered: ${userId}`);

      // Step 2: Login with credentials
      const loginRes = await client.post('/api/auth/login', {
        email: registerData.email,
        password: registerData.password
      });

      assert.equal(loginRes.status, 200, 'Login should succeed');
      assert.equal(loginRes.data.success, true);
      assert.ok(loginRes.data.data.tokens.accessToken, 'Should receive new access token');
      
      const loginTokens = loginRes.data.data.tokens;
      console.log('  ✓ User logged in successfully');

      // Step 3: Get current user profile with token
      const profileRes = await client
        .setAuthToken(loginTokens.accessToken)
        .get('/api/auth/me');

      assert.equal(profileRes.status, 200, 'Should get profile');
      assert.equal(profileRes.data.data.user.id, userId);
      assert.equal(profileRes.data.data.user.email, registerData.email);
      console.log('  ✓ Profile retrieved with token');

      // Step 4: Create API key
      const apiKeyRes = await client
        .setAuthToken(loginTokens.accessToken)
        .post('/api/auth/api-keys', {
          name: 'Test API Key',
          permissions: ['read:tasks', 'write:tasks'],
          expiresIn: 3600 // 1 hour
        });

      assert.equal(apiKeyRes.status, 201, 'API key creation should succeed');
      assert.equal(apiKeyRes.data.success, true);
      assert.ok(apiKeyRes.data.data.key, 'Should receive API key (only shown once)');
      assert.ok(apiKeyRes.data.data.apiKey.id, 'API key should have an ID');
      
      const apiKey = apiKeyRes.data.data.key;
      const apiKeyId = apiKeyRes.data.data.apiKey.id;
      console.log(`  ✓ API key created: ${apiKeyId}`);

      // Step 5: Use API key to access protected endpoint
      const apiClient = createTestClient(baseUrl);
      const protectedRes = await apiClient
        .setHeader('X-API-Key', apiKey)
        .get('/api/auth/me');

      assert.equal(protectedRes.status, 200, 'API key should grant access');
      assert.equal(protectedRes.data.data.user.id, userId);
      console.log('  ✓ API key authentication works');

      // Step 6: List API keys
      const listKeysRes = await client
        .setAuthToken(loginTokens.accessToken)
        .get('/api/auth/api-keys');

      assert.equal(listKeysRes.status, 200);
      assert.ok(Array.isArray(listKeysRes.data.data.items));
      assert.ok(listKeysRes.data.data.items.length >= 1);
      console.log(`  ✓ Listed ${listKeysRes.data.data.items.length} API key(s)`);

      // Step 7: Revoke API key
      const revokeRes = await client
        .setAuthToken(loginTokens.accessToken)
        .delete(`/api/auth/api-keys/${apiKeyId}`);

      assert.equal(revokeRes.status, 200);
      assert.equal(revokeRes.data.data.message, 'API key revoked successfully');
      console.log('  ✓ API key revoked');

      // Step 8: Verify revoked key no longer works
      const revokedRes = await apiClient.get('/api/auth/me');
      assert.equal(revokedRes.status, 401, 'Revoked API key should be rejected');
      console.log('  ✓ Revoked API key correctly rejected');

      // Step 9: Logout
      const logoutRes = await client
        .setAuthToken(loginTokens.accessToken)
        .post('/api/auth/logout', {
          refreshToken: loginTokens.refreshToken
        });

      assert.equal(logoutRes.status, 200);
      console.log('  ✓ User logged out');
    });

    it('should handle token refresh flow', async () => {
      // Register and login
      const email = `refresh-test-${Date.now()}@example.com`;
      const password = 'SecurePassword123!';

      await client.post('/api/auth/register', { email, password, name: 'Refresh Test' });
      const loginRes = await client.post('/api/auth/login', { email, password });
      
      const originalTokens = loginRes.data.data.tokens;
      const refreshToken = originalTokens.refreshToken;

      // Refresh token
      const refreshRes = await client.post('/api/auth/refresh', {
        refreshToken
      });

      assert.equal(refreshRes.status, 200);
      assert.ok(refreshRes.data.data.tokens.accessToken, 'Should receive new access token');
      assert.notEqual(
        refreshRes.data.data.tokens.accessToken,
        originalTokens.accessToken,
        'Access token should be different'
      );
      console.log('  ✓ Token refreshed successfully');
    });

    it('should reject invalid credentials', async () => {
      // Test invalid login
      const invalidLoginRes = await client.post('/api/auth/login', {
        email: 'nonexistent@example.com',
        password: 'wrongpassword'
      });

      assert.equal(invalidLoginRes.status, 401);
      assert.equal(invalidLoginRes.data.success, false);
      console.log('  ✓ Invalid credentials rejected');

      // Test weak password registration
      const weakPasswordRes = await client.post('/api/auth/register', {
        email: `weak-${Date.now()}@example.com`,
        password: '123', // Too short
        name: 'Test'
      });

      assert.equal(weakPasswordRes.status, 400);
      console.log('  ✓ Weak password rejected');
    });
  });

  describe('Company Creation Flow', () => {
    it('should create company and manage settings', async () => {
      // Register a user first
      const email = `company-test-${Date.now()}@example.com`;
      const password = 'SecurePassword123!';
      
      const registerRes = await client.post('/api/auth/register', {
        email,
        password,
        name: 'Company Test User'
      });
      
      const tokens = registerRes.data.data.tokens;
      const userId = registerRes.data.data.user.id;
      testUsers.push({ id: userId, email });

      // Step 1: Create company
      const companyData = {
        name: `Test Company ${Date.now()}`,
        description: 'A test company for integration testing',
        brandColor: '#FF5733',
        settings: {
          timezone: 'UTC',
          language: 'en'
        }
      };

      const createRes = await client
        .setAuthToken(tokens.accessToken)
        .post('/api/companies', companyData);

      assert.equal(createRes.status, 201);
      assert.equal(createRes.data.success, true);
      assert.ok(createRes.data.data.id, 'Company should have ID');
      assert.equal(createRes.data.data.name, companyData.name);
      assert.ok(createRes.data.data.slug, 'Company should have slug');
      
      const companyId = createRes.data.data.id;
      testCompanies.push({ id: companyId });
      console.log(`  ✓ Company created: ${companyId}`);

      // Step 2: Get company details
      const getRes = await client
        .setAuthToken(tokens.accessToken)
        .get(`/api/companies/${companyId}`);

      assert.equal(getRes.status, 200);
      assert.equal(getRes.data.data.id, companyId);
      assert.equal(getRes.data.data.membership.role, 'owner');
      console.log('  ✓ Company details retrieved');

      // Step 3: Update company
      const updateRes = await client
        .setAuthToken(tokens.accessToken)
        .put(`/api/companies/${companyId}`, {
          name: `${companyData.name} (Updated)`,
          brandColor: '#33FF57'
        });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.data.name, `${companyData.name} (Updated)`);
      console.log('  ✓ Company updated');

      // Step 4: List companies
      const listRes = await client
        .setAuthToken(tokens.accessToken)
        .get('/api/companies');

      assert.equal(listRes.status, 200);
      assert.ok(Array.isArray(listRes.data.data.items));
      assert.ok(listRes.data.data.items.some(c => c.id === companyId));
      console.log(`  ✓ Listed ${listRes.data.data.items.length} company(s)`);
    });

    it('should enforce company access controls', async () => {
      // Create two users
      const user1Email = `access-test-1-${Date.now()}@example.com`;
      const user2Email = `access-test-2-${Date.now()}@example.com`;
      const password = 'SecurePassword123!';

      const user1Res = await client.post('/api/auth/register', {
        email: user1Email,
        password,
        name: 'User 1'
      });
      const user1Tokens = user1Res.data.data.tokens;
      const user1Id = user1Res.data.data.user.id;
      testUsers.push({ id: user1Id, email: user1Email });

      const user2Res = await client.post('/api/auth/register', {
        email: user2Email,
        password,
        name: 'User 2'
      });
      const user2Tokens = user2Res.data.data.tokens;
      const user2Id = user2Res.data.data.user.id;
      testUsers.push({ id: user2Id, email: user2Email });

      // User 1 creates a company
      const companyRes = await client
        .setAuthToken(user1Tokens.accessToken)
        .post('/api/companies', {
          name: `Access Control Test ${Date.now()}`
        });

      const companyId = companyRes.data.data.id;
      testCompanies.push({ id: companyId });

      // User 2 should not be able to access the company
      const unauthorizedRes = await client
        .setAuthToken(user2Tokens.accessToken)
        .get(`/api/companies/${companyId}`);

      assert.equal(unauthorizedRes.status, 403);
      console.log('  ✓ Access control enforced correctly');
    });
  });

  describe('Member Invitation Flow', () => {
    it('should invite members with different roles', async () => {
      // Create owner user
      const ownerEmail = `owner-${Date.now()}@example.com`;
      const password = 'SecurePassword123!';

      const ownerRes = await client.post('/api/auth/register', {
        email: ownerEmail,
        password,
        name: 'Company Owner'
      });
      const ownerTokens = ownerRes.data.data.tokens;
      const ownerId = ownerRes.data.data.user.id;
      testUsers.push({ id: ownerId, email: ownerEmail });

      // Create company
      const companyRes = await client
        .setAuthToken(ownerTokens.accessToken)
        .post('/api/companies', {
          name: `Member Test Company ${Date.now()}`
        });

      const companyId = companyRes.data.data.id;
      testCompanies.push({ id: companyId });

      // Create members to invite
      const memberEmails = [
        `admin-${Date.now()}@example.com`,
        `member-${Date.now()}@example.com`,
        `viewer-${Date.now()}@example.com`
      ];
      const memberIds = [];

      for (const email of memberEmails) {
        const memberRes = await client.post('/api/auth/register', {
          email,
          password,
          name: `Member ${email.split('-')[0]}`
        });
        memberIds.push(memberRes.data.data.user.id);
        testUsers.push({ id: memberRes.data.data.user.id, email });
      }

      // Invite admin
      const adminRes = await client
        .setAuthToken(ownerTokens.accessToken)
        .post(`/api/companies/${companyId}/members`, {
          userId: memberIds[0],
          role: 'admin'
        });

      assert.equal(adminRes.status, 201);
      assert.equal(adminRes.data.data.membership.role, 'admin');
      console.log('  ✓ Admin member invited');

      // Invite member
      const memberRes = await client
        .setAuthToken(ownerTokens.accessToken)
        .post(`/api/companies/${companyId}/members`, {
          userId: memberIds[1],
          role: 'member'
        });

      assert.equal(memberRes.status, 201);
      assert.equal(memberRes.data.data.membership.role, 'member');
      console.log('  ✓ Regular member invited');

      // Invite viewer
      const viewerRes = await client
        .setAuthToken(ownerTokens.accessToken)
        .post(`/api/companies/${companyId}/members`, {
          userId: memberIds[2],
          role: 'viewer'
        });

      assert.equal(viewerRes.status, 201);
      assert.equal(viewerRes.data.data.membership.role, 'viewer');
      console.log('  ✓ Viewer member invited');

      // List all members
      const listRes = await client
        .setAuthToken(ownerTokens.accessToken)
        .get(`/api/companies/${companyId}/members`);

      assert.equal(listRes.status, 200);
      assert.equal(listRes.data.data.items.length, 4); // owner + 3 invited
      console.log(`  ✓ Listed ${listRes.data.data.items.length} members`);

      // Update member role
      const updateRes = await client
        .setAuthToken(ownerTokens.accessToken)
        .put(`/api/companies/${companyId}/members/${memberIds[1]}`, {
          role: 'admin'
        });

      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.data.membership.role, 'admin');
      console.log('  ✓ Member role updated');
    });

    it('should enforce member permission rules', async () => {
      // Create users
      const ownerEmail = `perm-owner-${Date.now()}@example.com`;
      const memberEmail = `perm-member-${Date.now()}@example.com`;
      const password = 'SecurePassword123!';

      const ownerRes = await client.post('/api/auth/register', {
        email: ownerEmail,
        password,
        name: 'Owner'
      });
      const ownerTokens = ownerRes.data.data.tokens;
      const ownerId = ownerRes.data.data.user.id;
      testUsers.push({ id: ownerId, email: ownerEmail });

      const memberRes = await client.post('/api/auth/register', {
        email: memberEmail,
        password,
        name: 'Member'
      });
      const memberTokens = memberRes.data.data.tokens;
      const memberId = memberRes.data.data.user.id;
      testUsers.push({ id: memberId, email: memberEmail });

      // Create company
      const companyRes = await client
        .setAuthToken(ownerTokens.accessToken)
        .post('/api/companies', {
          name: `Permission Test ${Date.now()}`
        });

      const companyId = companyRes.data.data.id;
      testCompanies.push({ id: companyId });

      // Add member as regular member
      await client
        .setAuthToken(ownerTokens.accessToken)
        .post(`/api/companies/${companyId}/members`, {
          userId: memberId,
          role: 'member'
        });

      // Member should not be able to add other members
      const newMemberEmail = `new-${Date.now()}@example.com`;
      const newMemberRes = await client.post('/api/auth/register', {
        email: newMemberEmail,
        password,
        name: 'New Member'
      });
      const newMemberId = newMemberRes.data.data.user.id;
      testUsers.push({ id: newMemberId, email: newMemberEmail });

      const unauthorizedRes = await client
        .setAuthToken(memberTokens.accessToken)
        .post(`/api/companies/${companyId}/members`, {
          userId: newMemberId,
          role: 'member'
        });

      assert.equal(unauthorizedRes.status, 403);
      console.log('  ✓ Member correctly blocked from adding members');

      // Member should not be able to remove owner
      const removeOwnerRes = await client
        .setAuthToken(memberTokens.accessToken)
        .delete(`/api/companies/${companyId}/members/${ownerId}`);

      assert.equal(removeOwnerRes.status, 403);
      console.log('  ✓ Member correctly blocked from removing owner');

      // Member can remove themselves
      const selfRemoveRes = await client
        .setAuthToken(memberTokens.accessToken)
        .delete(`/api/companies/${companyId}/members/${memberId}`);

      assert.equal(selfRemoveRes.status, 200);
      console.log('  ✓ Member can remove themselves');
    });
  });
});
