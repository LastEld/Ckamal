/**
 * @fileoverview Company Domain Tests - Multi-tenant organization management
 * @module tests/domains/company-service
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CompanyDomain } from '../../src/domains/company/company-domain.js';

describe('Company Domain', () => {
  let companyDomain;

  beforeEach(() => {
    companyDomain = new CompanyDomain();
  });

  describe('Company CRUD', () => {
    it('should create a company with required fields', () => {
      const company = companyDomain.createCompany({
        name: 'Test Company',
        description: 'A test company'
      }, 'creator-1');

      assert.ok(company.id);
      assert.equal(company.name, 'Test Company');
      assert.equal(company.description, 'A test company');
      assert.equal(company.status, 'active');
      assert.equal(company.slug, 'test-company');
      assert.ok(company.createdAt);
      assert.equal(company.createdBy, 'creator-1');
    });

    it('should generate slug from name', () => {
      const company = companyDomain.createCompany({
        name: 'My Amazing Company'
      }, 'creator-1');

      assert.equal(company.slug, 'my-amazing-company');
    });

    it('should accept custom slug', () => {
      const company = companyDomain.createCompany({
        name: 'Test Company',
        slug: 'custom-slug'
      }, 'creator-1');

      assert.equal(company.slug, 'custom-slug');
    });

    it('should require a name', () => {
      assert.throws(() => {
        companyDomain.createCompany({}, 'creator-1');
      }, /name is required/i);
    });

    it('should validate name length', () => {
      assert.throws(() => {
        companyDomain.createCompany({ name: 'A' }, 'creator-1');
      }, /between 2 and 100/i);

      assert.throws(() => {
        companyDomain.createCompany({ name: 'A'.repeat(101) }, 'creator-1');
      }, /between 2 and 100/i);
    });

    it('should prevent duplicate slugs', () => {
      companyDomain.createCompany({
        name: 'First Company',
        slug: 'unique-slug'
      }, 'creator-1');

      assert.throws(() => {
        companyDomain.createCompany({
          name: 'Second Company',
          slug: 'unique-slug'
        }, 'creator-1');
      }, /already exists/i);
    });

    it('should get company by ID', () => {
      const created = companyDomain.createCompany({
        name: 'Test Company'
      }, 'creator-1');

      const fetched = companyDomain.getCompany(created.id);
      assert.equal(fetched.id, created.id);
      assert.equal(fetched.name, 'Test Company');
    });

    it('should return undefined for non-existent company', () => {
      const result = companyDomain.getCompany('non-existent-id');
      assert.equal(result, undefined);
    });

    it('should get company by slug', () => {
      companyDomain.createCompany({
        name: 'Test Company',
        slug: 'test-co'
      }, 'creator-1');

      const fetched = companyDomain.getCompanyBySlug('test-co');
      assert.ok(fetched);
      assert.equal(fetched.slug, 'test-co');
    });

    it('should update company', () => {
      const company = companyDomain.createCompany({
        name: 'Original Name',
        slug: 'test-update'
      }, 'creator-1');

      // Add creator as owner member first
      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      const updated = companyDomain.updateCompany(
        company.id,
        { name: 'Updated Name', description: 'Updated description' },
        'creator-1'
      );

      assert.equal(updated.name, 'Updated Name');
      assert.equal(updated.description, 'Updated description');
    });

    it('should update company settings', () => {
      const company = companyDomain.createCompany({
        name: 'Test Company'
      }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      const updated = companyDomain.updateCompany(
        company.id,
        { 
          requireApprovalForAgents: false,
          brandColor: '#FF5733',
          settings: { customSetting: true }
        },
        'creator-1'
      );

      assert.equal(updated.requireApprovalForAgents, false);
      assert.equal(updated.brandColor, '#FF5733');
    });

    it('should check permissions for updates', () => {
      const company = companyDomain.createCompany({
        name: 'Test Company'
      }, 'creator-1');

      // Add creator as owner
      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      // Add a regular member
      companyDomain.addMember({
        companyId: company.id,
        userId: 'member-1',
        role: 'member',
        status: 'active'
      });

      // Member should not be able to update
      assert.throws(() => {
        companyDomain.updateCompany(
          company.id,
          { name: 'Hacked Name' },
          'member-1'
        );
      }, /insufficient permissions/i);
    });

    it('should delete company', () => {
      const company = companyDomain.createCompany({
        name: 'To Delete'
      }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      const result = companyDomain.deleteCompany(company.id, 'creator-1');
      assert.equal(result, true);

      const fetched = companyDomain.getCompany(company.id);
      assert.equal(fetched, undefined);
    });

    it('should only allow owners to delete company', () => {
      const company = companyDomain.createCompany({
        name: 'Test Company'
      }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'admin-1',
        role: 'admin',
        status: 'active'
      });

      assert.throws(() => {
        companyDomain.deleteCompany(company.id, 'admin-1');
      }, /only company owners/i);
    });

    it('should list active companies', () => {
      companyDomain.createCompany({ name: 'Company 1' }, 'creator-1');
      companyDomain.createCompany({ name: 'Company 2' }, 'creator-1');
      companyDomain.createCompany({ name: 'Company 3' }, 'creator-1');

      const companies = companyDomain.listCompanies();
      assert.equal(companies.length, 3);
    });

    it('should filter companies by status', () => {
      const company = companyDomain.createCompany({ name: 'Active Co' }, 'creator-1');
      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      companyDomain.suspendCompany(company.id, 'Testing', 'creator-1');

      const active = companyDomain.listCompanies({ status: 'active' });
      const suspended = companyDomain.listCompanies({ status: 'suspended' });

      assert.equal(active.length, 0);
      assert.equal(suspended.length, 1);
    });

    it('should suspend company', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      const suspended = companyDomain.suspendCompany(company.id, 'Billing issue', 'creator-1');

      assert.equal(suspended.status, 'suspended');
      assert.equal(suspended.pauseReason, 'Billing issue');
      assert.ok(suspended.pausedAt);
    });

    it('should reactivate company', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      companyDomain.suspendCompany(company.id, 'Test', 'creator-1');
      const reactivated = companyDomain.reactivateCompany(company.id, 'creator-1');

      assert.equal(reactivated.status, 'active');
      assert.equal(reactivated.pauseReason, null);
      assert.equal(reactivated.pausedAt, null);
    });
  });

  describe('Member Management', () => {
    it('should add member to company', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      const member = companyDomain.addMember({
        companyId: company.id,
        userId: 'user-1',
        role: 'member'
      });

      assert.ok(member.id);
      assert.equal(member.companyId, company.id);
      assert.equal(member.userId, 'user-1');
      assert.equal(member.role, 'member');
      assert.equal(member.status, 'active');
    });

    it('should validate member role', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      assert.throws(() => {
        companyDomain.addMember({
          companyId: company.id,
          userId: 'user-1',
          role: 'invalid-role'
        });
      }, /invalid role/i);
    });

    it('should prevent duplicate membership', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      const first = companyDomain.addMember({
        companyId: company.id,
        userId: 'user-1',
        role: 'member'
      });

      // Idempotent - returns existing membership instead of throwing
      const second = companyDomain.addMember({
        companyId: company.id,
        userId: 'user-1',
        role: 'member'
      });

      assert.equal(first.id, second.id);
      assert.equal(first.role, 'member');
    });

    it('should invite member with pending status', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      const invitation = companyDomain.inviteMember(
        company.id,
        'invited-user',
        'member',
        'creator-1'
      );

      assert.equal(invitation.status, 'pending');
      assert.equal(invitation.role, 'member');
      assert.equal(invitation.invitedBy, 'creator-1');
      assert.ok(invitation.invitedAt);
    });

    it('should check invite permissions', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'member-1',
        role: 'member',
        status: 'active'
      });

      assert.throws(() => {
        companyDomain.inviteMember(company.id, 'new-user', 'member', 'member-1');
      }, /insufficient permissions/i);
    });

    it('should not allow inviting as owner', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      assert.throws(() => {
        companyDomain.inviteMember(company.id, 'new-user', 'owner', 'creator-1');
      }, /cannot invite users as owner/i);
    });

    it('should accept invitation', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      const invitation = companyDomain.inviteMember(
        company.id,
        'invited-user',
        'member',
        'creator-1'
      );

      const accepted = companyDomain.acceptInvitation(invitation.id, 'invited-user');

      assert.equal(accepted.status, 'active');
      assert.ok(accepted.joinedAt);
    });

    it('should validate invitation ownership on accept', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      const invitation = companyDomain.inviteMember(
        company.id,
        'invited-user',
        'member',
        'creator-1'
      );

      assert.throws(() => {
        companyDomain.acceptInvitation(invitation.id, 'wrong-user');
      }, /does not belong/i);
    });

    it('should remove member', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'admin-1',
        role: 'admin',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'member-1',
        role: 'member',
        status: 'active'
      });

      const result = companyDomain.removeMember(company.id, 'member-1', 'admin-1');
      assert.equal(result, true);

      const membership = companyDomain.getMembership('member-1', company.id);
      assert.equal(membership, undefined);
    });

    it('should prevent removing owners', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'admin-1',
        role: 'admin',
        status: 'active'
      });

      assert.throws(() => {
        companyDomain.removeMember(company.id, 'creator-1', 'admin-1');
      }, /cannot remove company owner/i);
    });

    it('should allow leaving company', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'co-owner',
        role: 'owner',
        status: 'active'
      });

      const result = companyDomain.leaveCompany(company.id, 'co-owner');
      assert.equal(result, true);
    });

    it('should prevent sole owner from leaving', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      assert.throws(() => {
        companyDomain.leaveCompany(company.id, 'creator-1');
      }, /sole owner/i);
    });

    it('should update member role', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'member-1',
        role: 'member',
        status: 'active'
      });

      const updated = companyDomain.updateMemberRole(
        company.id,
        'member-1',
        'admin',
        'creator-1'
      );

      assert.equal(updated.role, 'admin');
    });

    it('should only allow owners to assign owner role', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'creator-1',
        role: 'owner',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'admin-1',
        role: 'admin',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'member-1',
        role: 'member',
        status: 'active'
      });

      assert.throws(() => {
        companyDomain.updateMemberRole(company.id, 'member-1', 'owner', 'admin-1');
      }, /only owners can transfer ownership/i);
    });

    it('should get company members', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'user-1',
        role: 'member'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'user-2',
        role: 'viewer'
      });

      const members = companyDomain.getCompanyMembers(company.id);
      assert.equal(members.length, 3); // creator-1 (owner), user-1 (member), user-2 (viewer)
    });

    it('should check membership', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'member-1',
        role: 'member',
        status: 'active'
      });

      assert.equal(companyDomain.isMember('member-1', company.id), true);
      assert.equal(companyDomain.isMember('non-member', company.id), false);
    });

    it('should get membership details', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'member-1',
        role: 'admin',
        status: 'active'
      });

      const membership = companyDomain.getMembership('member-1', company.id);
      assert.equal(membership.role, 'admin');
      assert.equal(membership.status, 'active');
    });

    it('should get user companies', () => {
      const company1 = companyDomain.createCompany({ name: 'Company 1' }, 'user-1');
      const company2 = companyDomain.createCompany({ name: 'Company 2' }, 'user-1');

      // Members are added automatically for creator
      const userCompanies = companyDomain.getUserCompanies('user-1');
      assert.equal(userCompanies.length, 2);
    });
  });

  describe('Role Permissions', () => {
    it('should check specific permission', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'owner',
        role: 'owner',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'admin',
        role: 'admin',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'member',
        role: 'member',
        status: 'active'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'viewer',
        role: 'viewer',
        status: 'active'
      });

      // Owner should have all permissions
      assert.equal(companyDomain.hasPermission('owner', company.id, 'canDeleteCompany'), true);

      // Admin should not delete company
      assert.equal(companyDomain.hasPermission('admin', company.id, 'canDeleteCompany'), false);
      // But should manage billing
      assert.equal(companyDomain.hasPermission('admin', company.id, 'canManageBilling'), true);

      // Member has limited permissions
      assert.equal(companyDomain.hasPermission('member', company.id, 'canCreateTasks'), true);
      assert.equal(companyDomain.hasPermission('member', company.id, 'canManageBilling'), false);

      // Viewer has read-only
      assert.equal(companyDomain.hasPermission('viewer', company.id, 'canCreateTasks'), false);
    });

    it('should get all permissions for user', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'admin',
        role: 'admin',
        status: 'active'
      });

      const permissions = companyDomain.getPermissions('admin', company.id);

      assert.equal(permissions.canCreateTasks, true);
      assert.equal(permissions.canManageBilling, true);
      assert.equal(permissions.canDeleteCompany, false);
      assert.equal(permissions.canManageSettings, true);
    });

    it('should return viewer permissions for non-members', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      const permissions = companyDomain.getPermissions('random-user', company.id);

      assert.equal(permissions.canCreateTasks, false);
      assert.equal(permissions.canManageBilling, false);
    });
  });

  describe('Context Management', () => {
    it('should set current company context', () => {
      companyDomain.setCurrentCompany('company-123');
      assert.equal(companyDomain.getCurrentCompany(), 'company-123');
    });

    it('should clear current company context', () => {
      companyDomain.setCurrentCompany('company-123');
      companyDomain.clearCurrentCompany();
      assert.equal(companyDomain.getCurrentCompany(), null);
    });
  });

  describe('Statistics', () => {
    it('should get company statistics', () => {
      const company = companyDomain.createCompany({ name: 'Test' }, 'creator-1');

      companyDomain.addMember({
        companyId: company.id,
        userId: 'user-1',
        role: 'member'
      });

      companyDomain.addMember({
        companyId: company.id,
        userId: 'user-2',
        role: 'admin'
      });

      const stats = companyDomain.getCompanyStats(company.id);
      assert.ok(stats);
    });
  });
});
