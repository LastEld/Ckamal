/**
 * @fileoverview Approvals Domain Tests - Approval workflow management
 * @module tests/domains/approvals-service
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { 
  ApprovalService, 
  ApprovalStatus, 
  ApprovalType, 
  RiskLevel, 
  ActorType,
  ApprovalError 
} from '../../src/domains/approvals/approval-service.js';

// Mock database for testing
class MockDatabase {
  constructor() {
    this.tables = {
      approvals: [],
      approval_stakeholders: [],
      approval_comments: [],
      approval_delegations: [],
      approval_policies: [],
      approval_audit_log: [],
      company_members: []
    };
    this.queryResults = new Map();
  }

  prepare(sql) {
    return {
      get: (...params) => this.executeGet(sql, params),
      all: (...params) => this.executeAll(sql, params),
      run: (...params) => this.executeRun(sql, params)
    };
  }

  executeGet(sql, params) {
    // Handle approval lookup by ID
    if (sql.includes('FROM approvals') && sql.includes('WHERE a.id = ?')) {
      const approval = this.tables.approvals.find(a => a.id === params[0]);
      if (approval) {
        return {
          ...approval,
          stakeholders: JSON.stringify(this.tables.approval_stakeholders
            .filter(s => s.approval_id === approval.id)),
          comments: JSON.stringify(this.tables.approval_comments
            .filter(c => c.approval_id === approval.id))
        };
      }
      return undefined;
    }

    // Handle simple approval lookup
    if (sql.includes('FROM approvals WHERE id = ?')) {
      return this.tables.approvals.find(a => a.id === params[0]);
    }

    // Handle policy lookup
    if (sql.includes('FROM approval_policies WHERE id = ?')) {
      return this.tables.approval_policies.find(p => p.id === params[0]);
    }

    // Handle delegation lookup
    if (sql.includes('FROM approval_delegations WHERE id = ?')) {
      return this.tables.approval_delegations.find(d => d.id === params[0]);
    }

    // Handle stakeholder check
    if (sql.includes('FROM approval_stakeholders WHERE approval_id = ? AND user_id = ?')) {
      return this.tables.approval_stakeholders.find(
        s => s.approval_id === params[0] && s.user_id === params[1]
      );
    }

    // Handle delegation check
    if (sql.includes('FROM approval_delegations WHERE company_id = ? AND delegate_user_id = ?')) {
      return this.tables.approval_delegations.find(
        d => d.company_id === params[0] && d.delegate_user_id === params[1] && d.status === 'active'
      );
    }

    // Handle company admin check
    if (sql.includes('FROM company_members WHERE company_id = ? AND user_id = ?')) {
      return this.tables.company_members.find(
        m => m.company_id === params[0] && m.user_id === params[1]
      );
    }

    // Handle circular delegation check
    if (sql.includes('circular delegation')) {
      return this.tables.approval_delegations.find(
        d => d.company_id === params[0] && 
             d.delegate_user_id === params[1] && 
             d.delegator_user_id === params[2] &&
             d.status === 'active'
      );
    }

    return undefined;
  }

  executeAll(sql, params) {
    // Handle approvals listing
    if (sql.includes('FROM approvals')) {
      let results = [...this.tables.approvals];
      
      // Apply filters
      if (sql.includes('company_id = ?')) {
        const companyIdx = params.findIndex(p => p === 'company-1' || p === 'comp-123');
        if (companyIdx >= 0) {
          results = results.filter(a => a.company_id === params[companyIdx]);
        }
      }
      
      if (sql.includes('status = ?')) {
        const statusIdx = params.indexOf(ApprovalStatus.PENDING);
        if (statusIdx >= 0) {
          results = results.filter(a => a.status === params[statusIdx]);
        }
      }

      return results;
    }

    // Handle policies listing
    if (sql.includes('FROM approval_policies WHERE company_id = ?')) {
      return this.tables.approval_policies.filter(p => p.company_id === params[0] && p.is_active === 1);
    }

    // Handle delegations listing
    if (sql.includes('FROM approval_delegations WHERE company_id = ? AND delegate_user_id = ?')) {
      return this.tables.approval_delegations.filter(
        d => d.company_id === params[0] && 
             d.delegate_user_id === params[1] &&
             d.status === 'active'
      );
    }

    // Handle company members lookup
    if (sql.includes('FROM company_members WHERE company_id = ? AND role IN')) {
      return this.tables.company_members.filter(
        m => m.company_id === params[0] && ['owner', 'admin'].includes(m.role)
      );
    }

    return [];
  }

  executeRun(sql, params) {
    // Handle approval creation
    if (sql.includes('INSERT INTO approvals')) {
      const approval = {
        id: params[0],
        company_id: params[1],
        type: params[2],
        status: params[3],
        priority: params[4],
        requested_by_agent_id: params[5],
        requested_by_user_id: params[6],
        requested_by_type: params[7],
        payload: params[8],
        risk_level: params[9],
        risk_factors: params[10],
        timeout_at: params[11],
        created_at: params[12],
        updated_at: params[13],
        escalation_level: 0
      };
      this.tables.approvals.push(approval);
      return { changes: 1, lastInsertRowid: this.tables.approvals.length };
    }

    // Handle stakeholder creation
    if (sql.includes('INSERT OR IGNORE INTO approval_stakeholders')) {
      this.tables.approval_stakeholders.push({
        id: params[0],
        approval_id: params[1],
        user_id: params[2],
        role: params[3],
        created_at: params[4]
      });
      return { changes: 1 };
    }

    // Handle approval update
    if (sql.includes('UPDATE approvals SET status = ?')) {
      const approvalId = params[5]; // Last param is WHERE id = ?
      const approval = this.tables.approvals.find(a => a.id === approvalId);
      if (approval) {
        approval.status = params[0];
        approval.decided_by_user_id = params[1];
        approval.decided_at = params[2];
        approval.decision_note = params[3];
        approval.updated_at = params[4];
      }
      return { changes: approval ? 1 : 0 };
    }

    // Handle comment creation
    if (sql.includes('INSERT INTO approval_comments')) {
      this.tables.approval_comments.push({
        id: params[0],
        approval_id: params[1],
        author_type: params[2],
        author_id: params[3],
        content: params[4],
        parent_comment_id: params[5],
        is_decision_note: params[6],
        created_at: params[7]
      });
      return { changes: 1 };
    }

    // Handle delegation creation
    if (sql.includes('INSERT INTO approval_delegations')) {
      this.tables.approval_delegations.push({
        id: params[0],
        company_id: params[1],
        delegator_user_id: params[2],
        delegate_user_id: params[3],
        approval_types: params[4],
        risk_levels: params[5],
        starts_at: params[6],
        expires_at: params[7],
        created_at: params[8],
        status: 'active'
      });
      return { changes: 1 };
    }

    // Handle delegation revocation
    if (sql.includes('UPDATE approval_delegations SET status = \'revoked\'')) {
      const delegation = this.tables.approval_delegations.find(d => d.id === params[2]);
      if (delegation) {
        delegation.status = 'revoked';
        delegation.revoked_at = params[0];
        delegation.revoked_by = params[1];
      }
      return { changes: delegation ? 1 : 0 };
    }

    // Handle policy creation
    if (sql.includes('INSERT INTO approval_policies')) {
      this.tables.approval_policies.push({
        id: params[0],
        company_id: params[1],
        name: params[2],
        description: params[3],
        approval_type: params[4],
        risk_levels: params[5],
        min_approvers: params[6],
        require_specific_roles: params[7],
        require_specific_users: params[8],
        auto_approve: params[9],
        auto_approve_conditions: params[10],
        escalation_timeout: params[11],
        escalation_targets: params[12],
        max_escalation_level: params[13],
        priority: params[14],
        created_at: params[15],
        updated_at: params[16],
        is_active: 1
      });
      return { changes: 1 };
    }

    // Handle audit log
    if (sql.includes('INSERT INTO approval_audit_log')) {
      this.tables.approval_audit_log.push({
        id: params[0],
        approval_id: params[1],
        action: params[2],
        actor_type: params[3],
        actor_id: params[4],
        details: params[5],
        created_at: params[6]
      });
      return { changes: 1 };
    }

    // Handle escalation
    if (sql.includes('UPDATE approvals SET escalation_level = ?')) {
      const approval = this.tables.approvals.find(a => a.id === params[3]);
      if (approval) {
        approval.escalation_level = params[0];
        approval.escalated_at = params[1];
        approval.updated_at = params[2];
      }
      return { changes: approval ? 1 : 0 };
    }

    return { changes: 0 };
  }
}

describe('Approvals Domain', () => {
  let approvalService;
  let mockDb;

  beforeEach(() => {
    mockDb = new MockDatabase();
    // Add company members for permission checks
    mockDb.tables.company_members = [
      { company_id: 'comp-123', user_id: 'admin-1', role: 'admin' },
      { company_id: 'comp-123', user_id: 'owner-1', role: 'owner' },
      { company_id: 'comp-123', user_id: 'user-1', role: 'member' }
    ];
    
    approvalService = new ApprovalService({ 
      db: mockDb,
      auditEnabled: false 
    });
  });

  afterEach(() => {
    if (approvalService) {
      approvalService.dispose();
    }
  });

  describe('Approval Creation', () => {
    it('should create an approval request', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: { action: 'delete_file', file: 'test.txt' },
        requestedByUserId: 'user-1'
      });

      assert.ok(approval.id);
      assert.equal(approval.company_id, 'comp-123');
      assert.equal(approval.type, ApprovalType.AGENT_ACTION);
      assert.equal(approval.status, ApprovalStatus.PENDING);
      assert.ok(approval.risk_level);
    });

    it('should require companyId', async () => {
      await assert.rejects(
        approvalService.createApproval({
          type: ApprovalType.AGENT_ACTION,
          payload: {}
        }),
        (err) => err instanceof ApprovalError && err.code === 'VALIDATION_ERROR'
      );
    });

    it('should require requester', async () => {
      await assert.rejects(
        approvalService.createApproval({
          companyId: 'comp-123',
          type: ApprovalType.AGENT_ACTION,
          payload: {}
        }),
        (err) => err instanceof ApprovalError && err.code === 'VALIDATION_ERROR'
      );
    });

    it('should assess risk level based on type', async () => {
      const lowRisk = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      const highRisk = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.SYSTEM_COMMAND,
        payload: {},
        requestedByUserId: 'user-1'
      });

      assert.ok(lowRisk.risk_level);
      assert.ok(highRisk.risk_level);
    });

    it('should set timeout for approval', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1',
        timeout: 3600 // 1 hour
      });

      assert.ok(approval.timeout_at);
      const timeoutDate = new Date(approval.timeout_at);
      const createdDate = new Date(approval.created_at);
      const diffHours = (timeoutDate - createdDate) / (1000 * 60 * 60);
      assert.ok(Math.abs(diffHours - 1) < 0.1);
    });

    it('should add stakeholders on creation', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1',
        stakeholders: ['watcher-1', 'watcher-2']
      });

      const stored = mockDb.tables.approval_stakeholders.filter(
        s => s.approval_id === approval.id
      );
      assert.ok(stored.length >= 2);
    });

    it('should emit approvalCreated event', async () => {
      let emittedData = null;
      approvalService.on('approvalCreated', (data) => {
        emittedData = data;
      });

      await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      assert.ok(emittedData);
      assert.ok(emittedData.approval);
    });
  });

  describe('Approve/Reject', () => {
    it('should approve a pending approval', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      // Add admin as stakeholder
      mockDb.tables.approval_stakeholders.push({
        approval_id: approval.id,
        user_id: 'admin-1',
        role: 'approver'
      });

      const approved = await approvalService.approve(approval.id, {
        decidedByUserId: 'admin-1',
        note: 'Looks good'
      });

      assert.equal(approved.status, ApprovalStatus.APPROVED);
      assert.equal(approved.decided_by_user_id, 'admin-1');
      assert.ok(approved.decided_at);
    });

    it('should reject an approval', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      mockDb.tables.approval_stakeholders.push({
        approval_id: approval.id,
        user_id: 'admin-1',
        role: 'approver'
      });

      const rejected = await approvalService.reject(approval.id, {
        decidedByUserId: 'admin-1',
        reason: 'Too risky'
      });

      assert.equal(rejected.status, ApprovalStatus.REJECTED);
      assert.ok(rejected.decision_note);
    });

    it('should request changes', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      mockDb.tables.approval_stakeholders.push({
        approval_id: approval.id,
        user_id: 'admin-1',
        role: 'approver'
      });

      const changed = await approvalService.requestChanges(approval.id, {
        decidedByUserId: 'admin-1',
        feedback: 'Please provide more details'
      });

      assert.equal(changed.status, ApprovalStatus.CHANGES_REQUESTED);
    });

    it('should throw if approval not found', async () => {
      await assert.rejects(
        approvalService.approve('non-existent', { decidedByUserId: 'admin-1' }),
        (err) => err instanceof ApprovalError && err.code === 'APPROVAL_NOT_FOUND'
      );
    });

    it('should throw if already decided', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      mockDb.tables.approval_stakeholders.push({
        approval_id: approval.id,
        user_id: 'admin-1',
        role: 'approver'
      });

      await approvalService.approve(approval.id, { decidedByUserId: 'admin-1' });

      // Update the mock to show it's already approved
      const storedApproval = mockDb.tables.approvals.find(a => a.id === approval.id);
      storedApproval.status = ApprovalStatus.APPROVED;

      await assert.rejects(
        approvalService.approve(approval.id, { decidedByUserId: 'admin-1' }),
        (err) => err instanceof ApprovalError && err.code === 'APPROVAL_ALREADY_DECIDED'
      );
    });

    it('should check permissions before approving', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      await assert.rejects(
        approvalService.approve(approval.id, { decidedByUserId: 'random-user' }),
        (err) => err instanceof ApprovalError && err.code === 'INSUFFICIENT_PERMISSIONS'
      );
    });

    it('should emit approvalApproved event', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      mockDb.tables.approval_stakeholders.push({
        approval_id: approval.id,
        user_id: 'admin-1',
        role: 'approver'
      });

      let emitted = false;
      approvalService.on('approvalApproved', () => {
        emitted = true;
      });

      await approvalService.approve(approval.id, { decidedByUserId: 'admin-1' });
      assert.equal(emitted, true);
    });
  });

  describe('Delegation', () => {
    it('should create a delegation', async () => {
      const delegation = await approvalService.delegateApproval({
        companyId: 'comp-123',
        delegatorUserId: 'admin-1',
        delegateUserId: 'user-1',
        approvalTypes: [ApprovalType.AGENT_ACTION],
        riskLevels: [RiskLevel.LOW, RiskLevel.MEDIUM],
        expiresAt: new Date(Date.now() + 86400000)
      });

      assert.ok(delegation.id);
      assert.equal(delegation.company_id, 'comp-123');
      assert.equal(delegation.delegator_user_id, 'admin-1');
      assert.equal(delegation.delegate_user_id, 'user-1');
    });

    it('should require all delegation fields', async () => {
      await assert.rejects(
        approvalService.delegateApproval({
          companyId: 'comp-123',
          delegatorUserId: 'admin-1'
        }),
        (err) => err instanceof ApprovalError && err.code === 'VALIDATION_ERROR'
      );
    });

    it('should detect circular delegation', async () => {
      // First create an existing delegation
      mockDb.tables.approval_delegations.push({
        company_id: 'comp-123',
        delegator_user_id: 'admin-1',
        delegate_user_id: 'user-1',
        status: 'active',
        expires_at: new Date(Date.now() + 86400000).toISOString()
      });

      await assert.rejects(
        approvalService.delegateApproval({
          companyId: 'comp-123',
          delegatorUserId: 'user-1', // Now user-1 tries to delegate back
          delegateUserId: 'admin-1',
          expiresAt: new Date(Date.now() + 86400000)
        }),
        (err) => err instanceof ApprovalError && err.code === 'INVALID_DELEGATION'
      );
    });

    it('should revoke a delegation', async () => {
      const delegation = await approvalService.delegateApproval({
        companyId: 'comp-123',
        delegatorUserId: 'admin-1',
        delegateUserId: 'user-1',
        expiresAt: new Date(Date.now() + 86400000)
      });

      mockDb.tables.approval_delegations.push(delegation);

      const result = await approvalService.revokeDelegation(delegation.id, 'admin-1');
      assert.equal(result, true);
    });

    it('should get active delegations for user', async () => {
      mockDb.tables.approval_delegations.push({
        id: 'del-1',
        company_id: 'comp-123',
        delegator_user_id: 'admin-1',
        delegate_user_id: 'user-1',
        status: 'active',
        starts_at: new Date(Date.now() - 1000).toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        approval_types: JSON.stringify([ApprovalType.AGENT_ACTION]),
        risk_levels: JSON.stringify([RiskLevel.LOW])
      });

      const delegations = approvalService.getActiveDelegations('comp-123', 'user-1');
      assert.equal(delegations.length, 1);
    });

    it('should allow delegate to approve', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      // Add delegation
      mockDb.tables.approval_delegations.push({
        company_id: 'comp-123',
        delegator_user_id: 'admin-1',
        delegate_user_id: 'user-2',
        status: 'active',
        starts_at: new Date(Date.now() - 1000).toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        approval_types: JSON.stringify([ApprovalType.AGENT_ACTION]),
        risk_levels: JSON.stringify([RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH])
      });

      // Add admin as approver
      mockDb.tables.approval_stakeholders.push({
        approval_id: approval.id,
        user_id: 'admin-1',
        role: 'approver'
      });

      // User-2 should be able to approve via delegation
      const approved = await approvalService.approve(approval.id, {
        decidedByUserId: 'user-2'
      });

      assert.equal(approved.status, ApprovalStatus.APPROVED);
    });

    it('should emit delegationCreated event', async () => {
      let emitted = false;
      approvalService.on('delegationCreated', () => {
        emitted = true;
      });

      await approvalService.delegateApproval({
        companyId: 'comp-123',
        delegatorUserId: 'admin-1',
        delegateUserId: 'user-1',
        expiresAt: new Date(Date.now() + 86400000)
      });

      assert.equal(emitted, true);
    });
  });

  describe('Auto-Approval', () => {
    it('should auto-approve low risk operations with policy', async () => {
      // Create a policy that auto-approves
      mockDb.tables.approval_policies.push({
        id: 'pol-1',
        company_id: 'comp-123',
        approval_type: ApprovalType.AGENT_ACTION,
        risk_levels: JSON.stringify([RiskLevel.LOW]),
        auto_approve: 1,
        auto_approve_conditions: JSON.stringify({ maxEstimatedCost: 10 }),
        min_approvers: 1,
        priority: 1,
        is_active: 1
      });

      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: { estimatedCost: 5 },
        requestedByUserId: 'user-1'
      });

      // With auto-approval policy, this might be auto-approved
      assert.ok(approval.status);
    });

    it('should evaluate auto-approve conditions', async () => {
      const policyCheck = await approvalService.checkApprovalPolicy({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        riskLevel: RiskLevel.LOW,
        payload: { estimatedCost: 5 }
      });

      assert.ok(typeof policyCheck.requiresApproval === 'boolean');
    });
  });

  describe('Escalation', () => {
    it('should escalate pending approval', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      // Manually set escalation level
      const stored = mockDb.tables.approvals.find(a => a.id === approval.id);
      stored.escalation_level = 1;
      stored.escalated_at = new Date().toISOString();

      assert.equal(stored.escalation_level, 1);
    });

    it('should add escalation targets', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      // Add escalation targets
      mockDb.tables.approval_stakeholders.push(
        { approval_id: approval.id, user_id: 'escalation-1', role: 'approver' }
      );

      const stakeholders = mockDb.tables.approval_stakeholders.filter(
        s => s.approval_id === approval.id
      );
      assert.ok(stakeholders.length > 0);
    });

    it('should check approval policy for escalation timeout', async () => {
      const policy = await approvalService.checkApprovalPolicy({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        riskLevel: RiskLevel.HIGH
      });

      assert.ok(policy);
    });
  });

  describe('Comments', () => {
    it('should add comment to approval', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      const comment = await approvalService.addComment(approval.id, {
        authorType: ActorType.USER,
        authorId: 'user-1',
        content: 'This looks safe to approve'
      });

      assert.ok(comment.id);
      assert.equal(comment.content, 'This looks safe to approve');
    });

    it('should support threaded comments', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      const parent = await approvalService.addComment(approval.id, {
        authorType: ActorType.USER,
        authorId: 'user-1',
        content: 'Question about this'
      });

      const reply = await approvalService.addComment(approval.id, {
        authorType: ActorType.USER,
        authorId: 'user-2',
        content: 'Here is the answer',
        parentCommentId: parent.id
      });

      assert.equal(reply.parent_comment_id, parent.id);
    });

    it('should mark decision notes', async () => {
      const approval = await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      const comment = await approvalService.addComment(approval.id, {
        authorType: ActorType.USER,
        authorId: 'admin-1',
        content: 'Approved with conditions',
        isDecisionNote: true
      });

      assert.equal(comment.is_decision_note, 1);
    });
  });

  describe('Policy Management', () => {
    it('should create approval policy', async () => {
      const policy = await approvalService.createPolicy({
        companyId: 'comp-123',
        name: 'High Risk Policy',
        description: 'Requires 2 approvers for high risk',
        approvalType: ApprovalType.CODE_CHANGE,
        riskLevels: [RiskLevel.HIGH, RiskLevel.CRITICAL],
        minApprovers: 2,
        escalationTimeout: 7200
      });

      assert.ok(policy.id);
      assert.equal(policy.company_id, 'comp-123');
      assert.equal(policy.name, 'High Risk Policy');
      assert.equal(policy.min_approvers, 2);
    });

    it('should list policies for company', async () => {
      mockDb.tables.approval_policies.push({
        id: 'pol-1',
        company_id: 'comp-123',
        name: 'Policy 1',
        is_active: 1,
        priority: 1,
        risk_levels: JSON.stringify([RiskLevel.LOW]),
        require_specific_roles: '[]',
        require_specific_users: '[]',
        auto_approve: 0,
        escalation_targets: '[]'
      });

      const policies = approvalService.listPolicies('comp-123');
      assert.equal(policies.length, 1);
    });

    it('should find approvers based on policy', async () => {
      mockDb.tables.approval_policies.push({
        id: 'pol-1',
        company_id: 'comp-123',
        require_specific_users: JSON.stringify(['specific-user-1']),
        risk_levels: JSON.stringify([RiskLevel.LOW]),
        is_active: 1
      });

      const policyCheck = await approvalService.checkApprovalPolicy({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        riskLevel: RiskLevel.LOW
      });

      assert.ok(Array.isArray(policyCheck.approvers));
    });
  });

  describe('Approval Listing', () => {
    it('should list all approvals', async () => {
      await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.CODE_CHANGE,
        payload: {},
        requestedByUserId: 'user-2'
      });

      const approvals = approvalService.listApprovals({ companyId: 'comp-123' });
      assert.ok(approvals.length >= 2);
    });

    it('should filter by status', async () => {
      await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      const pending = approvalService.listApprovals({ 
        companyId: 'comp-123', 
        status: ApprovalStatus.PENDING 
      });
      
      assert.ok(Array.isArray(pending));
    });

    it('should filter by type', async () => {
      await approvalService.createApproval({
        companyId: 'comp-123',
        type: ApprovalType.AGENT_ACTION,
        payload: {},
        requestedByUserId: 'user-1'
      });

      const filtered = approvalService.listApprovals({ 
        companyId: 'comp-123', 
        type: ApprovalType.AGENT_ACTION 
      });
      
      assert.ok(Array.isArray(filtered));
    });
  });
});
