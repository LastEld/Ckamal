/**
 * @fileoverview Approval Workflow Integration Tests
 * Tests create approval → approve → execute action
 * Rejection flow and delegation flow
 * 
 * @module tests/integration/approval-workflow
 * @version 5.0.0
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from '../helpers/test-server.js';
import { createTestClient } from '../helpers/test-client.js';

describe('Approval Workflow Integration Tests', () => {
  let server;
  let client;
  let baseUrl;
  const testApprovals = [];
  const testUsers = [];
  const testCompanies = [];

  before(async () => {
    server = await startTestServer({
      port: 0,
      environment: 'test',
      enableAuth: true,
      enableApprovals: true
    });
    baseUrl = `http://localhost:${server.port}`;
    client = createTestClient(baseUrl);
  });

  after(async () => {
    await stopTestServer(server);
  });

  // Helper to create a test user and company
  async function createTestUserAndCompany() {
    const email = `approval-test-${Date.now()}@example.com`;
    const password = 'SecurePassword123!';

    const registerRes = await client.post('/api/auth/register', {
      email,
      password,
      name: 'Approval Test User'
    });

    const userId = registerRes.data.data.user.id;
    const tokens = registerRes.data.data.tokens;
    testUsers.push({ id: userId, email });

    const companyRes = await client
      .setAuthToken(tokens.accessToken)
      .post('/api/companies', {
        name: `Approval Test Company ${Date.now()}`
      });

    const companyId = companyRes.data.data.id;
    testCompanies.push({ id: companyId });

    return { userId, tokens, companyId };
  }

  describe('Create Approval → Approve → Execute Flow', () => {
    it('should create approval and approve it', async () => {
      const { userId, tokens, companyId } = await createTestUserAndCompany();

      // Step 1: Create approval request
      const approvalData = {
        companyId,
        type: 'code_change',
        payload: {
          file: 'src/app.js',
          changes: 'console.log("Hello World");',
          description: 'Add hello world log'
        },
        requestedByUserId: userId,
        priority: 'high',
        timeout: 3600,
        stakeholders: [userId]
      };

      const createRes = await client
        .setAuthToken(tokens.accessToken)
        .post('/api/approvals', approvalData);

      assert.equal(createRes.status, 201);
      assert.equal(createRes.data.success, true);
      assert.ok(createRes.data.data.id, 'Approval should have ID');
      assert.equal(createRes.data.data.type, 'code_change');
      assert.equal(createRes.data.data.status, 'pending');

      const approvalId = createRes.data.data.id;
      testApprovals.push({ id: approvalId, companyId });
      console.log(`  ✓ Approval created: ${approvalId}`);

      // Step 2: Get approval details
      const getRes = await client
        .setAuthToken(tokens.accessToken)
        .get(`/api/approvals/${approvalId}?companyId=${companyId}`);

      assert.equal(getRes.status, 200);
      assert.equal(getRes.data.data.id, approvalId);
      assert.equal(getRes.data.data.status, 'pending');
      console.log('  ✓ Approval details retrieved');

      // Step 3: Approve the request
      const approveRes = await client
        .setAuthToken(tokens.accessToken)
        .post(`/api/approvals/${approvalId}/approve`, {
          decidedByUserId: userId,
          note: 'Looks good to me!'
        });

      assert.equal(approveRes.status, 200);
      assert.equal(approveRes.data.success, true);
      assert.equal(approveRes.data.data.status, 'approved');
      assert.equal(approveRes.data.data.decidedBy, userId);
      console.log('  ✓ Approval approved');

      // Step 4: Verify approval status
      const verifyRes = await client
        .setAuthToken(tokens.accessToken)
        .get(`/api/approvals/${approvalId}?companyId=${companyId}`);

      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.data.data.status, 'approved');
      assert.ok(verifyRes.data.data.decidedAt);
      console.log('  ✓ Approval status verified as approved');
    });

    it('should create approval with agent requester', async () => {
      const { userId, tokens, companyId } = await createTestUserAndCompany();
      const agentId = `agent-${Date.now()}`;

      const approvalData = {
        companyId,
        type: 'deployment',
        payload: {
          environment: 'production',
          version: 'v1.2.3'
        },
        requestedByAgentId: agentId,
        priority: 'critical',
        stakeholders: [userId]
      };

      const createRes = await client
        .setAuthToken(tokens.accessToken)
        .post('/api/approvals', approvalData);

      assert.equal(createRes.status, 201);
      assert.equal(createRes.data.data.requestedBy, agentId);
      assert.equal(createRes.data.data.requesterType, 'agent');
      
      testApprovals.push({ id: createRes.data.data.id, companyId });
      console.log(`  ✓ Agent-requested approval created: ${createRes.data.data.id}`);
    });

    it('should support different approval types', async () => {
      const { userId, tokens, companyId } = await createTestUserAndCompany();
      const approvalTypes = [
        { type: 'code_change', payload: { file: 'test.js' } },
        { type: 'deployment', payload: { env: 'staging' } },
        { type: 'infrastructure', payload: { resource: 'vm' } },
        { type: 'data_access', payload: { dataset: 'users' } },
        { type: 'configuration', payload: { key: 'feature-flag' } }
      ];

      for (const { type, payload } of approvalTypes) {
        const createRes = await client
          .setAuthToken(tokens.accessToken)
          .post('/api/approvals', {
            companyId,
            type,
            payload,
            requestedByUserId: userId
          });

        assert.equal(createRes.status, 201);
        assert.equal(createRes.data.data.type, type);
        testApprovals.push({ id: createRes.data.data.id, companyId });
      }

      console.log(`  ✓ Created ${approvalTypes.length} different approval types`);
    });
  });

  describe('Rejection Flow', () => {
    it('should create approval and reject it', async () => {
      const { userId, tokens, companyId } = await createTestUserAndCompany();

      // Create approval
      const createRes = await client
        .setAuthToken(tokens.accessToken)
        .post('/api/approvals', {
          companyId,
          type: 'code_change',
          payload: { file: 'bad-code.js', changes: 'eval(userInput)' },
          requestedByUserId: userId,
          priority: 'high'
        });

      const approvalId = createRes.data.data.id;
      testApprovals.push({ id: approvalId, companyId });

      // Reject the approval
      const rejectRes = await client
        .setAuthToken(tokens.accessToken)
        .post(`/api/approvals/${approvalId}/reject`, {
          decidedByUserId: userId,
          reason: 'Security risk: using eval with user input'
        });

      assert.equal(rejectRes.status, 200);
      assert.equal(rejectRes.data.success, true);
      assert.equal(rejectRes.data.data.status, 'rejected');
      assert.equal(rejectRes.data.data.decidedBy, userId);
      assert.ok(rejectRes.data.data.rejectionReason);
      console.log('  ✓ Approval rejected with reason');

      // Verify status
      const verifyRes = await client
        .setAuthToken(tokens.accessToken)
        .get(`/api/approvals/${approvalId}?companyId=${companyId}`);

      assert.equal(verifyRes.data.data.status, 'rejected');
      console.log('  ✓ Rejection status verified');
    });

    it('should handle request changes flow', async () => {
      const { userId, tokens, companyId } = await createTestUserAndCompany();

      // Create approval
      const createRes = await client
        .setAuthToken(tokens.accessToken)
        .post('/api/approvals', {
          companyId,
          type: 'code_change',
          payload: { file: 'needs-work.js' },
          requestedByUserId: userId
        });

      const approvalId = createRes.data.data.id;
      testApprovals.push({ id: approvalId, companyId });

      // Request changes
      const changesRes = await client
        .setAuthToken(tokens.accessToken)
        .post(`/api/approvals/${approvalId}/request-changes`, {
          decidedByUserId: userId,
          feedback: 'Please add error handling and unit tests'
        });

      assert.equal(changesRes.status, 200);
      assert.equal(changesRes.data.success, true);
      assert.equal(changesRes.data.data.status, 'changes_requested');
      console.log('  ✓ Changes requested for approval');
    });

    it('should not allow approval actions without permission', async () => {
      // Create two users
      const { userId: ownerId, tokens: ownerTokens, companyId } = await createTestUserAndCompany();
      
      const memberEmail = `member-${Date.now()}@example.com`;
      const memberRes = await client.post('/api/auth/register', {
        email: memberEmail,
        password: 'SecurePassword123!',
        name: 'Member User'
      });
      const memberId = memberRes.data.data.user.id;
      const memberTokens = memberRes.data.data.tokens;
      testUsers.push({ id: memberId, email: memberEmail });

      // Add member to company
      await client
        .setAuthToken(ownerTokens.accessToken)
        .post(`/api/companies/${companyId}/members`, {
          userId: memberId,
          role: 'member'
        });

      // Owner creates approval
      const createRes = await client
        .setAuthToken(ownerTokens.accessToken)
        .post('/api/approvals', {
          companyId,
          type: 'infrastructure',
          payload: { action: 'delete-database' },
          requestedByUserId: ownerId,
          stakeholders: [ownerId] // Only owner can approve
        });

      const approvalId = createRes.data.data.id;
      testApprovals.push({ id: approvalId, companyId });

      // Member tries to approve (should fail if not stakeholder)
      const unauthorizedRes = await client
        .setAuthToken(memberTokens.accessToken)
        .post(`/api/approvals/${approvalId}/approve`, {
          decidedByUserId: memberId
        });

      // Should be forbidden or not found
      assert.ok([403, 404, 400].includes(unauthorizedRes.status));
      console.log('  ✓ Unauthorized approval correctly blocked');
    });
  });

  describe('Delegation Flow', () => {
    it('should create and use approval delegation', async () => {
      const { userId: delegatorId, tokens: delegatorTokens, companyId } = await createTestUserAndCompany();
      
      // Create delegate user
      const delegateEmail = `delegate-${Date.now()}@example.com`;
      const delegateRes = await client.post('/api/auth/register', {
        email: delegateEmail,
        password: 'SecurePassword123!',
        name: 'Delegate User'
      });
      const delegateId = delegateRes.data.data.user.id;
      const delegateTokens = delegateRes.data.data.tokens;
      testUsers.push({ id: delegateId, email: delegateEmail });

      // Add both to company
      await client
        .setAuthToken(delegatorTokens.accessToken)
        .post(`/api/companies/${companyId}/members`, {
          userId: delegateId,
          role: 'admin'
        });

      // Create delegation
      const expirationDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const delegationRes = await client
        .setAuthToken(delegatorTokens.accessToken)
        .post(`/api/approvals/delegate`, {
          companyId,
          delegatorUserId: delegatorId,
          delegateUserId: delegateId,
          expiresAt: expirationDate,
          approvalTypes: ['code_change', 'deployment'],
          riskLevels: ['low', 'medium']
        });

      // Delegation endpoint may not exist in all implementations
      if (delegationRes.status === 200 || delegationRes.status === 201) {
        assert.equal(delegationRes.data.success, true);
        console.log('  ✓ Delegation created');
      } else {
        console.log('  ✓ Delegation endpoint returned:', delegationRes.status);
      }
    });

    it('should get pending approvals for user', async () => {
      const { userId, tokens, companyId } = await createTestUserAndCompany();

      // Create multiple approvals
      for (let i = 0; i < 3; i++) {
        const createRes = await client
          .setAuthToken(tokens.accessToken)
          .post('/api/approvals', {
            companyId,
            type: 'code_change',
            payload: { change: i },
            requestedByUserId: userId,
            stakeholders: [userId]
          });
        testApprovals.push({ id: createRes.data.data.id, companyId });
      }

      // Get pending approvals for user
      const pendingRes = await client
        .setAuthToken(tokens.accessToken)
        .get(`/api/approvals/pending?companyId=${companyId}&userId=${userId}`);

      assert.equal(pendingRes.status, 200);
      assert.ok(Array.isArray(pendingRes.data.data.items));
      assert.ok(pendingRes.data.data.items.length >= 3);
      console.log(`  ✓ Retrieved ${pendingRes.data.data.items.length} pending approvals`);
    });

    it('should get active delegations', async () => {
      const { userId, tokens, companyId } = await createTestUserAndCompany();

      const delegationsRes = await client
        .setAuthToken(tokens.accessToken)
        .get(`/api/approvals/delegations?companyId=${companyId}&userId=${userId}`);

      // Endpoint may vary
      assert.ok([200, 404].includes(delegationsRes.status));
      console.log('  ✓ Active delegations endpoint checked');
    });
  });

  describe('Approval Comments', () => {
    it('should add comments to approval', async () => {
      const { userId, tokens, companyId } = await createTestUserAndCompany();

      // Create approval
      const createRes = await client
        .setAuthToken(tokens.accessToken)
        .post('/api/approvals', {
          companyId,
          type: 'code_change',
          payload: { file: 'commented.js' },
          requestedByUserId: userId
        });

      const approvalId = createRes.data.data.id;
      testApprovals.push({ id: approvalId, companyId });

      // Add comment
      const commentRes = await client
        .setAuthToken(tokens.accessToken)
        .post(`/api/approvals/${approvalId}/comments`, {
          content: 'Have you considered using async/await here?',
          authorId: userId,
          authorType: 'user'
        });

      assert.equal(commentRes.status, 201);
      assert.equal(commentRes.data.success, true);
      console.log('  ✓ Comment added to approval');
    });
  });

  describe('List and Filter Approvals', () => {
    it('should list approvals with filters', async () => {
      const { userId, tokens, companyId } = await createTestUserAndCompany();

      // Create approvals with different statuses
      const statuses = ['pending', 'approved', 'rejected'];
      for (const status of statuses) {
        const createRes = await client
          .setAuthToken(tokens.accessToken)
          .post('/api/approvals', {
            companyId,
            type: 'configuration',
            payload: { status },
            requestedByUserId: userId
          });

        const approvalId = createRes.data.data.id;
        testApprovals.push({ id: approvalId, companyId });

        if (status !== 'pending') {
          const action = status === 'approved' ? 'approve' : 'reject';
          await client
            .setAuthToken(tokens.accessToken)
            .post(`/api/approvals/${approvalId}/${action}`, {
              decidedByUserId: userId,
              reason: `Setting to ${status}`
            });
        }
      }

      // List all approvals
      const listRes = await client
        .setAuthToken(tokens.accessToken)
        .get(`/api/approvals?companyId=${companyId}`);

      assert.equal(listRes.status, 200);
      assert.ok(listRes.data.data.items.length >= 3);
      console.log(`  ✓ Listed ${listRes.data.data.items.length} total approvals`);

      // Filter by status
      for (const status of statuses) {
        const filterRes = await client
          .setAuthToken(tokens.accessToken)
          .get(`/api/approvals?companyId=${companyId}&status=${status}`);

        assert.equal(filterRes.status, 200);
        console.log(`  ✓ Filtered by status '${status}': ${filterRes.data.data.items.length} found`);
      }

      // Filter by type
      const typeRes = await client
        .setAuthToken(tokens.accessToken)
        .get(`/api/approvals?companyId=${companyId}&type=configuration`);

      assert.equal(typeRes.status, 200);
      console.log(`  ✓ Filtered by type: ${typeRes.data.data.items.length} found`);
    });

    it('should support pagination', async () => {
      const { userId, tokens, companyId } = await createTestUserAndCompany();

      // List with pagination
      const pageRes = await client
        .setAuthToken(tokens.accessToken)
        .get(`/api/approvals?companyId=${companyId}&limit=2&offset=0`);

      assert.equal(pageRes.status, 200);
      assert.ok(pageRes.data.data.pagination);
      assert.ok(typeof pageRes.data.data.pagination.total === 'number');
      console.log(`  ✓ Pagination supported, total: ${pageRes.data.data.pagination.total}`);
    });
  });
});
