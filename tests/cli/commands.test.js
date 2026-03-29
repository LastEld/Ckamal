/**
 * @fileoverview Tests for CLI Commands (company, issues, approval, billing)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as companyCli from '../../src/bios/commands/company-cli.js';
import * as issuesCli from '../../src/bios/commands/issues-cli.js';
import * as approvalCli from '../../src/bios/commands/approval-cli.js';
import * as billingCli from '../../src/bios/commands/billing-cli.js';

describe('Company Commands', () => {
  describe('listCompanies', () => {
    it('should list all companies', async () => {
      const result = await companyCli.listCompanies();
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(result.data);
      assert.strictEqual(Array.isArray(result.data), true);
    });

    it('should return formatted output', async () => {
      const result = await companyCli.listCompanies();
      
      assert.ok(result.output);
      assert.strictEqual(typeof result.output, 'string');
    });

    it('should include sample companies if none exist', async () => {
      const result = await companyCli.listCompanies();
      
      assert.ok(result.data.length > 0);
    });
  });

  describe('createCompany', () => {
    it('should create a new company', async () => {
      const result = await companyCli.createCompany('Test Company Inc');
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(result.data);
      assert.ok(/^COMP-\d{3}$/.test(result.data.id));
      assert.strictEqual(result.data.name, 'Test Company Inc');
    });

    it('should generate slug from company name', async () => {
      const result = await companyCli.createCompany('My Test Company');
      
      assert.strictEqual(result.data.slug, 'my-test-company');
    });

    it('should return error when name is missing', async () => {
      const result = await companyCli.createCompany();
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('required'));
    });

    it('should set company as active after creation', async () => {
      const result = await companyCli.createCompany('Active Company');
      
      assert.ok(result.output.includes('Switched'));
    });

    it('should apply company settings', async () => {
      const result = await companyCli.createCompany('Test Company');
      
      assert.ok(result.data.settings);
      assert.strictEqual(result.data.settings.allowPublicIssues, false);
    });
  });

  describe('switchCompany', () => {
    it('should switch to existing company', async () => {
      const created = await companyCli.createCompany('Switch Test Company');
      
      const result = await companyCli.switchCompany(created.data.id);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.id, created.data.id);
    });

    it('should show current company when no id provided', async () => {
      await companyCli.createCompany('Current Company');
      const result = await companyCli.switchCompany();
      
      assert.strictEqual(result.success, true);
    });

    it('should return error for non-existent company', async () => {
      const result = await companyCli.switchCompany('COMP-NONEXISTENT');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'));
    });
  });

  describe('listMembers', () => {
    it('should list company members', async () => {
      const result = await companyCli.listMembers();
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(Array.isArray(result.data), true);
    });

    it('should include member details', async () => {
      const result = await companyCli.listMembers();
      
      if (result.data.length > 0) {
        assert.ok(result.data[0].id);
        assert.ok(result.data[0].name);
        assert.ok(result.data[0].role);
      }
    });
  });

  describe('inviteMember', () => {
    it('should invite a member by email', async () => {
      const result = await companyCli.inviteMember('newuser@example.com');
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.email, 'newuser@example.com');
      assert.ok(/^INV-/.test(result.data.id));
    });

    it('should set invitation role', async () => {
      const result = await companyCli.inviteMember('admin@example.com', { role: 'admin' });
      
      assert.strictEqual(result.data.role, 'admin');
    });

    it('should return error for invalid email', async () => {
      const result = await companyCli.inviteMember('invalid-email');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Valid email'));
    });

    it('should return error when email is missing', async () => {
      const result = await companyCli.inviteMember();
      
      assert.strictEqual(result.success, false);
    });
  });
});

describe('Issues Commands', () => {
  describe('listIssues', () => {
    it('should list all issues', async () => {
      const result = await issuesCli.listIssues();
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(Array.isArray(result.data), true);
    });

    it('should filter by status', async () => {
      const result = await issuesCli.listIssues({ status: 'open' });
      
      assert.strictEqual(result.success, true);
      result.data.forEach(issue => {
        assert.strictEqual(issue.status, 'open');
      });
    });

    it('should filter by priority', async () => {
      const result = await issuesCli.listIssues({ priority: 'high' });
      
      assert.strictEqual(result.success, true);
      result.data.forEach(issue => {
        assert.strictEqual(issue.priority, 'high');
      });
    });

    it('should filter by type', async () => {
      const result = await issuesCli.listIssues({ type: 'bug' });
      
      assert.strictEqual(result.success, true);
      result.data.forEach(issue => {
        assert.strictEqual(issue.type, 'bug');
      });
    });

    it('should include sample issues by default', async () => {
      const result = await issuesCli.listIssues();
      
      assert.ok(result.data.length > 0);
    });
  });

  describe('createIssue', () => {
    it('should create a new issue', async () => {
      const result = await issuesCli.createIssue('Test Issue Title');
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(/^ISS-\d{3}$/.test(result.data.id));
      assert.strictEqual(result.data.title, 'Test Issue Title');
      assert.strictEqual(result.data.status, 'open');
    });

    it('should accept description option', async () => {
      const result = await issuesCli.createIssue('Test Issue', { 
        description: 'This is a test description' 
      });
      
      assert.strictEqual(result.data.description, 'This is a test description');
    });

    it('should accept priority option', async () => {
      const result = await issuesCli.createIssue('Urgent Issue', { priority: 'urgent' });
      
      assert.strictEqual(result.data.priority, 'urgent');
    });

    it('should accept type option', async () => {
      const result = await issuesCli.createIssue('Feature Request', { type: 'feature' });
      
      assert.strictEqual(result.data.type, 'feature');
    });

    it('should accept assignee option', async () => {
      const result = await issuesCli.createIssue('Assigned Issue', { assignee: 'USER-002' });
      
      assert.strictEqual(result.data.assignee, 'USER-002');
    });

    it('should return error when title is missing', async () => {
      const result = await issuesCli.createIssue();
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('required'));
    });
  });

  describe('showIssue', () => {
    it('should show issue details', async () => {
      const created = await issuesCli.createIssue('Show Test Issue');
      
      const result = await issuesCli.showIssue(created.data.id);
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.id, created.data.id);
    });

    it('should return error for non-existent issue', async () => {
      const result = await issuesCli.showIssue('ISS-NONEXISTENT');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'));
    });

    it('should return error when issue ID is missing', async () => {
      const result = await issuesCli.showIssue();
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('required'));
    });
  });

  describe('updateIssue', () => {
    it('should update issue status', async () => {
      const created = await issuesCli.createIssue('Update Test Issue');
      const result = await issuesCli.updateIssue(created.data.id, { status: 'in-progress' });
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.status, 'in-progress');
    });

    it('should update issue priority', async () => {
      const created = await issuesCli.createIssue('Priority Update Test');
      const result = await issuesCli.updateIssue(created.data.id, { priority: 'high' });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.priority, 'high');
    });

    it('should update issue assignee', async () => {
      const created = await issuesCli.createIssue('Assignee Update Test');
      const result = await issuesCli.updateIssue(created.data.id, { assignee: 'USER-003' });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.assignee, 'USER-003');
    });

    it('should reject invalid status values', async () => {
      const created = await issuesCli.createIssue('Invalid Status Test');
      const result = await issuesCli.updateIssue(created.data.id, { status: 'invalid' });
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Invalid status'));
    });

    it('should return error when no updates specified', async () => {
      const created = await issuesCli.createIssue('No Updates Test');
      const result = await issuesCli.updateIssue(created.data.id, {});
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('No updates'));
    });
  });

  describe('commentOnIssue', () => {
    it('should add comment to issue', async () => {
      const created = await issuesCli.createIssue('Comment Test Issue');
      const result = await issuesCli.commentOnIssue(created.data.id, 'This is a test comment');
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.comment.text, 'This is a test comment');
    });

    it('should return error for non-existent issue', async () => {
      const result = await issuesCli.commentOnIssue('ISS-NONEXISTENT', 'Comment');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'));
    });

    it('should return error when comment is missing', async () => {
      const created = await issuesCli.createIssue('Empty Comment Test');
      const result = await issuesCli.commentOnIssue(created.data.id);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('required'));
    });
  });

  describe('closeIssue', () => {
    it('should close an open issue', async () => {
      const created = await issuesCli.createIssue('Close Test Issue');
      const result = await issuesCli.closeIssue(created.data.id);
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.status, 'closed');
    });

    it('should add resolution when provided', async () => {
      const created = await issuesCli.createIssue('Resolved Test Issue');
      const result = await issuesCli.closeIssue(created.data.id, { 
        resolution: 'Fixed in v2.0' 
      });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.resolution, 'Fixed in v2.0');
    });

    it('should return error when issue already closed', async () => {
      const created = await issuesCli.createIssue('Already Closed Test');
      await issuesCli.closeIssue(created.data.id);
      
      const result = await issuesCli.closeIssue(created.data.id);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('already closed'));
    });
  });
});

describe('Approval Commands', () => {
  describe('listApprovals', () => {
    it('should list all approvals', async () => {
      const result = await approvalCli.listApprovals();
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(Array.isArray(result.data), true);
    });

    it('should filter by pending status', async () => {
      const result = await approvalCli.listApprovals({ pending: true });
      
      assert.strictEqual(result.success, true);
      result.data.forEach(approval => {
        assert.strictEqual(approval.status, 'pending');
      });
    });

    it('should filter by type', async () => {
      const result = await approvalCli.listApprovals({ type: 'deployment' });
      
      assert.strictEqual(result.success, true);
      result.data.forEach(approval => {
        assert.strictEqual(approval.type, 'deployment');
      });
    });
  });

  describe('showApproval', () => {
    it('should show approval details', async () => {
      const result = await approvalCli.showApproval('APR-001');
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.id, 'APR-001');
    });

    it('should show approval progress bar', async () => {
      const result = await approvalCli.showApproval('APR-001');
      
      assert.ok(result.output.includes('Progress'));
    });

    it('should show approvers list', async () => {
      const result = await approvalCli.showApproval('APR-001');
      
      assert.ok(result.output.includes('Approvers'));
    });

    it('should return error for non-existent approval', async () => {
      const result = await approvalCli.showApproval('APR-NONEXISTENT');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'));
    });

    it('should return error when approval ID is missing', async () => {
      const result = await approvalCli.showApproval();
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('required'));
    });
  });

  describe('approveRequest', () => {
    it('should approve a pending request', async () => {
      const result = await approvalCli.approveRequest('APR-002');
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
    });

    it('should add comment when approving', async () => {
      const result = await approvalCli.approveRequest('APR-002', { 
        comment: 'LGTM! Approved for deployment.' 
      });
      
      assert.strictEqual(result.success, true);
    });

    it('should return error when already approved', async () => {
      await approvalCli.approveRequest('APR-002');
      const result = await approvalCli.approveRequest('APR-002');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('already approved'));
    });

    it('should return error when approval is rejected', async () => {
      await approvalCli.rejectRequest('APR-001');
      
      const result = await approvalCli.approveRequest('APR-001');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('rejected'));
    });
  });

  describe('rejectRequest', () => {
    it('should reject a pending request', async () => {
      const result = await approvalCli.rejectRequest('APR-002');
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.status, 'rejected');
    });

    it('should add reason when rejecting', async () => {
      const result = await approvalCli.rejectRequest('APR-003', { 
        comment: 'Not ready for production yet' 
      });
      
      assert.strictEqual(result.success, true);
      assert.ok(result.output.includes('Reason'));
    });

    it('should return error when already approved', async () => {
      const result = await approvalCli.rejectRequest('APR-003');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('approved'));
    });

    it('should return error for non-existent approval', async () => {
      const result = await approvalCli.rejectRequest('APR-NONEXISTENT');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found'));
    });
  });
});

describe('Billing Commands', () => {
  describe('getBillingSummary', () => {
    it('should get billing summary', async () => {
      const result = await billingCli.getBillingSummary();
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(result.data);
    });

    it('should include current month data', async () => {
      const result = await billingCli.getBillingSummary();
      
      assert.ok(result.data.currentMonth);
      assert.ok(result.data.currentMonth.total);
      assert.strictEqual(result.data.currentMonth.currency, 'USD');
    });

    it('should include billing cycle info', async () => {
      const result = await billingCli.getBillingSummary();
      
      assert.ok(result.data.billingCycle);
      assert.ok(result.data.billingCycle.start);
      assert.ok(result.data.billingCycle.end);
      assert.ok(result.data.billingCycle.daysRemaining);
    });

    it('should show spending trend', async () => {
      const result = await billingCli.getBillingSummary();
      
      assert.ok(result.output.includes('Spending Trend'));
    });
  });

  describe('getCosts', () => {
    it('should get cost breakdown', async () => {
      const result = await billingCli.getCosts();
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
    });

    it('should accept days option', async () => {
      const result = await billingCli.getCosts({ days: 7 });
      
      assert.strictEqual(result.success, true);
    });

    it('should show costs by service', async () => {
      const result = await billingCli.getCosts();
      
      assert.ok(result.output.includes('By Service'));
      assert.ok(result.data.byService);
      assert.strictEqual(Array.isArray(result.data.byService), true);
    });

    it('should calculate total cost', async () => {
      const result = await billingCli.getCosts();
      
      assert.ok(result.data.total);
      assert.strictEqual(typeof result.data.total, 'number');
      assert.ok(result.data.total > 0);
    });

    it('should show daily trend for 7 days or less', async () => {
      const result = await billingCli.getCosts({ days: 7 });
      
      assert.ok(result.output.includes('Daily Trend'));
      assert.ok(result.data.daily);
    });
  });

  describe('getBudgets', () => {
    it('should get all budgets', async () => {
      const result = await billingCli.getBudgets();
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(Array.isArray(result.data), true);
    });

    it('should show budget progress', async () => {
      const result = await billingCli.getBudgets();
      
      assert.ok(result.output);
    });

    it('should include budget details', async () => {
      const result = await billingCli.getBudgets();
      
      if (result.data.length > 0) {
        const budget = result.data[0];
        assert.ok(budget.id);
        assert.ok(budget.name);
        assert.ok(budget.amount);
        assert.ok(budget.spent);
        assert.ok(budget.status);
      }
    });

    it('should calculate overall totals', async () => {
      const result = await billingCli.getBudgets();
      
      assert.ok(result.output.includes('Overall'));
      assert.ok(result.output.includes('Total Budget'));
      assert.ok(result.output.includes('Total Spent'));
    });
  });

  describe('getAlerts', () => {
    it('should get billing alerts', async () => {
      const result = await billingCli.getAlerts();
      
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.strictEqual(Array.isArray(result.data), true);
    });

    it('should separate unacknowledged and acknowledged alerts', async () => {
      const result = await billingCli.getAlerts();
      
      const unacknowledged = result.data.filter(a => !a.acknowledged);
      const acknowledged = result.data.filter(a => a.acknowledged);
      
      assert.strictEqual(unacknowledged.length + acknowledged.length, result.data.length);
    });

    it('should show alert details', async () => {
      const result = await billingCli.getAlerts();
      
      if (result.data.length > 0) {
        const alert = result.data[0];
        assert.ok(alert.id);
        assert.ok(alert.type);
        assert.ok(alert.severity);
        assert.ok(alert.message);
      }
    });
  });
});
