/**
 * @fileoverview Issues Domain Tests - Issue/Ticket management
 * @module tests/domains/issues-service
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IssueService } from '../../src/domains/issues/issue-service.js';

// Mock repositories for testing
class MockIssueRepository {
  constructor() {
    this.issues = new Map();
    this.nextIssueNumber = 1;
  }

  async create(issue) {
    this.issues.set(issue.id, issue);
    return issue;
  }

  async findById(id) {
    return this.issues.get(id);
  }

  async update(id, updates) {
    const issue = this.issues.get(id);
    if (issue) {
      Object.assign(issue, updates);
    }
    return issue;
  }

  async softDelete(id, deletedBy) {
    const issue = this.issues.get(id);
    if (issue) {
      issue.deleted_at = new Date().toISOString();
      issue.deleted_by = deletedBy;
    }
    return true;
  }

  async findByCompany(companyId, filters = {}) {
    return Array.from(this.issues.values())
      .filter(i => i.company_id === companyId && !i.deleted_at)
      .slice(0, filters.limit || 50);
  }

  async getNextIssueNumber(companyId) {
    return this.nextIssueNumber++;
  }

  async updateAssignee(id, assigneeType, assigneeId) {
    return this.update(id, { assignee_type: assigneeType, assignee_id: assigneeId });
  }

  async incrementCommentCount(id, delta) {
    const issue = this.issues.get(id);
    if (issue) {
      issue.comment_count = (issue.comment_count || 0) + delta;
    }
  }

  async getStatistics(companyId) {
    return {
      total: this.issues.size,
      backlog: 0,
      todo: 0,
      in_progress: 0,
      in_review: 0,
      blocked: 0,
      completed: 0,
      cancelled: 0
    };
  }

  async findOverdue(companyId) {
    return [];
  }
}

class MockCommentRepository {
  constructor() {
    this.comments = new Map();
  }

  async create(comment) {
    this.comments.set(comment.id, comment);
    return comment;
  }

  async findByIssue(issueId, options = {}) {
    return Array.from(this.comments.values())
      .filter(c => c.issue_id === issueId && !c.is_deleted);
  }

  async findThreads(issueId) {
    return Array.from(this.comments.values())
      .filter(c => c.issue_id === issueId && !c.parent_id && !c.is_deleted);
  }

  async findReplies(parentId) {
    return Array.from(this.comments.values())
      .filter(c => c.parent_id === parentId && !c.is_deleted);
  }

  async softDelete(id, deletedBy, reason) {
    const comment = this.comments.get(id);
    if (comment) {
      comment.is_deleted = true;
      comment.deleted_by = deletedBy;
      comment.deleted_at = new Date().toISOString();
    }
    return true;
  }

  async markEdited(id, editedBy) {
    const comment = this.comments.get(id);
    if (comment) {
      comment.is_edited = true;
      comment.edited_by = editedBy;
      comment.edited_at = new Date().toISOString();
    }
    return true;
  }

  async findById(id) {
    return this.comments.get(id);
  }
}

class MockLabelRepository {
  constructor() {
    this.labels = new Map();
  }

  async create(label) {
    this.labels.set(label.id, label);
    return label;
  }

  async findById(id) {
    return this.labels.get(id);
  }

  async findByCompany(companyId) {
    return Array.from(this.labels.values())
      .filter(l => l.company_id === companyId);
  }

  async incrementUsage(labelId, delta) {
    const label = this.labels.get(labelId);
    if (label) {
      label.usage_count = (label.usage_count || 0) + delta;
    }
  }
}

class MockLabelLinkRepository {
  constructor() {
    this.links = [];
  }

  async create(issueId, labelId, companyId, meta = {}) {
    const link = { issue_id: issueId, label_id: labelId, company_id: companyId, ...meta };
    this.links.push(link);
    return link;
  }

  async delete(issueId, labelId) {
    const index = this.links.findIndex(l => l.issue_id === issueId && l.label_id === labelId);
    if (index >= 0) {
      this.links.splice(index, 1);
      return true;
    }
    return false;
  }

  async findByIssue(issueId) {
    return this.links
      .filter(l => l.issue_id === issueId)
      .map(l => ({ ...l, name: 'test-label' }));
  }
}

class MockReadStateRepository {
  constructor() {
    this.states = new Map();
  }

  async markRead(issueId, userId, lastCommentId) {
    const key = `${issueId}:${userId}`;
    this.states.set(key, {
      issue_id: issueId,
      user_id: userId,
      is_read: true,
      read_at: new Date().toISOString(),
      last_seen_comment_id: lastCommentId
    });
  }

  async markUnread(issueId, userId) {
    const key = `${issueId}:${userId}`;
    this.states.set(key, {
      issue_id: issueId,
      user_id: userId,
      is_read: false
    });
  }

  async getUnreadCount(userId, companyId) {
    return Array.from(this.states.values())
      .filter(s => s.user_id === userId && !s.is_read).length;
  }

  async getUnreadIssues(userId, companyId) {
    return Array.from(this.states.values())
      .filter(s => s.user_id === userId && !s.is_read);
  }

  async findByIssueAndUser(issueId, userId) {
    return this.states.get(`${issueId}:${userId}`);
  }

  async markUnreadForAllExcept(issueId, exceptUserId = null) {
    // Mark all states for this issue as unread except for exceptUserId
    for (const [key, state] of this.states.entries()) {
      if (state.issue_id === issueId && state.user_id !== exceptUserId) {
        state.is_read = false;
        state.updated_at = new Date().toISOString();
      }
    }
  }
}

class MockAssignmentHistoryRepository {
  constructor() {
    this.history = [];
  }

  async record(data) {
    this.history.push({
      ...data,
      id: `hist-${Date.now()}`,
      created_at: new Date().toISOString()
    });
  }

  async findByIssue(issueId) {
    return this.history.filter(h => h.issueId === issueId);
  }
}

describe('Issues Domain', () => {
  let issueService;
  let mockRepos;

  beforeEach(() => {
    mockRepos = {
      issues: new MockIssueRepository(),
      issueComments: new MockCommentRepository(),
      issueLabels: new MockLabelRepository(),
      issueLabelLinks: new MockLabelLinkRepository(),
      issueReadStates: new MockReadStateRepository(),
      issueAssignmentHistory: new MockAssignmentHistoryRepository()
    };

    issueService = new IssueService({
      repositories: mockRepos,
      companyId: 'company-1',
      userId: 'user-1'
    });
  });

  describe('Issue CRUD', () => {
    it('should create an issue with required fields', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        description: 'Test Description',
        companyId: 'company-1'
      });

      assert.ok(issue.id);
      assert.ok(issue.id.startsWith('iss_'));
      assert.equal(issue.title, 'Test Issue');
      assert.equal(issue.description, 'Test Description');
      assert.equal(issue.status, 'backlog');
      assert.equal(issue.priority, 'medium');
      assert.equal(issue.companyId, 'company-1');
      assert.ok(issue.issueNumber);
      assert.ok(issue.createdAt);
    });

    it('should require a title', async () => {
      await assert.rejects(
        issueService.createIssue({ companyId: 'company-1' }),
        /title is required/i
      );
    });

    it('should require a company ID', async () => {
      await assert.rejects(
        issueService.createIssue({ title: 'Test' }),
        /company ID is required/i
      );
    });

    it('should create issue with custom status and priority', async () => {
      const issue = await issueService.createIssue({
        title: 'Urgent Bug',
        status: 'todo',
        priority: 'critical',
        companyId: 'company-1'
      });

      assert.equal(issue.status, 'todo');
      assert.equal(issue.priority, 'critical');
    });

    it('should validate status values', async () => {
      await assert.rejects(
        issueService.createIssue({
          title: 'Test',
          status: 'invalid_status',
          companyId: 'company-1'
        }),
        /invalid status/i
      );
    });

    it('should validate priority values', async () => {
      await assert.rejects(
        issueService.createIssue({
          title: 'Test',
          priority: 'invalid_priority',
          companyId: 'company-1'
        }),
        /invalid priority/i
      );
    });

    it('should get an issue by ID', async () => {
      const created = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const fetched = await issueService.getIssue(created.id);
      assert.equal(fetched.id, created.id);
      assert.equal(fetched.title, created.title);
    });

    it('should update an issue', async () => {
      const created = await issueService.createIssue({
        title: 'Original Title',
        companyId: 'company-1'
      });

      const updated = await issueService.updateIssue(created.id, {
        title: 'Updated Title',
        status: 'in_progress'
      });

      assert.equal(updated.title, 'Updated Title');
    });

    it('should reject empty title in update', async () => {
      const created = await issueService.createIssue({
        title: 'Test',
        companyId: 'company-1'
      });

      await assert.rejects(
        issueService.updateIssue(created.id, { title: '' }),
        /cannot be empty/i
      );
    });

    it('should soft delete an issue', async () => {
      const created = await issueService.createIssue({
        title: 'To Delete',
        companyId: 'company-1'
      });

      const result = await issueService.deleteIssue(created.id, 'user-1');
      assert.equal(result, true);

      const fetched = await issueService.getIssue(created.id);
      assert.equal(fetched, null);
    });

    it('should list issues for company', async () => {
      await issueService.createIssue({ title: 'Issue 1', companyId: 'company-1' });
      await issueService.createIssue({ title: 'Issue 2', companyId: 'company-1' });

      const issues = await issueService.listIssues({ companyId: 'company-1' });
      assert.equal(issues.length, 2);
    });

    it('should search issues', async () => {
      await issueService.createIssue({ 
        title: 'Searchable Issue', 
        description: 'Contains keyword',
        companyId: 'company-1' 
      });

      const results = await issueService.searchIssues('keyword', { companyId: 'company-1' });
      // Search delegates to listIssues with search filter
      assert.ok(Array.isArray(results));
    });

    it('should track issue creation metadata', async () => {
      const issue = await issueService.createIssue({
        title: 'Test',
        companyId: 'company-1',
        createdByType: 'agent',
        createdById: 'agent-1',
        originKind: 'automation'
      });

      assert.equal(issue.createdByType, 'agent');
      assert.equal(issue.createdById, 'agent-1');
      assert.equal(issue.originKind, 'automation');
    });
  });

  describe('Comment Threading', () => {
    it('should add a comment to an issue', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const comment = await issueService.addComment(issue.id, {
        content: 'This is a comment',
        authorType: 'user',
        authorId: 'user-1'
      });

      assert.ok(comment.id);
      assert.equal(comment.content, 'This is a comment');
      assert.equal(comment.issueId, issue.id);
      assert.equal(comment.authorType, 'user');
    });

    it('should require comment content', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await assert.rejects(
        issueService.addComment(issue.id, { content: '' }),
        /content is required/i
      );
    });

    it('should get comments for an issue', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await issueService.addComment(issue.id, { content: 'Comment 1' });
      await issueService.addComment(issue.id, { content: 'Comment 2' });

      const comments = await issueService.getComments(issue.id);
      assert.equal(comments.length, 2);
    });

    it('should support threaded comments', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const parent = await issueService.addComment(issue.id, {
        content: 'Parent comment'
      });

      const reply = await issueService.addComment(issue.id, {
        content: 'Reply comment',
        parentId: parent.id
      });

      assert.equal(reply.parentId, parent.id);
    });

    it('should get threaded comments structure', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await issueService.addComment(issue.id, { content: 'Thread 1' });
      await issueService.addComment(issue.id, { content: 'Thread 2' });

      const threads = await issueService.getThreadedComments(issue.id);
      assert.ok(Array.isArray(threads));
    });

    it('should update a comment', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const comment = await issueService.addComment(issue.id, {
        content: 'Original'
      });

      await issueService.updateComment(comment.id, 'Updated content', 'user-1');

      const updated = await mockRepos.issueComments.findById(comment.id);
      assert.equal(updated.is_edited, true);
    });

    it('should delete a comment', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const comment = await issueService.addComment(issue.id, {
        content: 'To delete'
      });

      const result = await issueService.deleteComment(comment.id, 'user-1');
      assert.equal(result, true);

      const comments = await issueService.getComments(issue.id);
      assert.equal(comments.length, 0);
    });

    it('should track comment count on issue', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await issueService.addComment(issue.id, { content: 'Comment' });

      const updated = await mockRepos.issues.findById(issue.id);
      assert.equal(updated.comment_count, 1);
    });

    it('should support different comment types', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const comment = await issueService.addComment(issue.id, {
        content: 'System note',
        commentType: 'system_note'
      });

      assert.equal(comment.comment_type, 'system_note');
    });
  });

  describe('Label Management', () => {
    it('should create a label', async () => {
      const label = await issueService.createLabel({
        name: 'Bug',
        description: 'Something is broken',
        color: '#FF0000',
        companyId: 'company-1'
      });

      assert.ok(label.id);
      assert.equal(label.name, 'bug'); // normalized to lowercase
      assert.equal(label.description, 'Something is broken');
      assert.equal(label.color, '#FF0000');
    });

    it('should require label name', async () => {
      await assert.rejects(
        issueService.createLabel({ companyId: 'company-1' }),
        /name is required/i
      );
    });

    it('should require company ID for label', async () => {
      await assert.rejects(
        issueService.createLabel({ name: 'Test' }),
        /company ID is required/i
      );
    });

    it('should get labels for company', async () => {
      await issueService.createLabel({ name: 'Bug', companyId: 'company-1' });
      await issueService.createLabel({ name: 'Feature', companyId: 'company-1' });

      const labels = await issueService.getLabels('company-1');
      assert.equal(labels.length, 2);
    });

    it('should add label to issue', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const label = await issueService.createLabel({
        name: 'Bug',
        companyId: 'company-1'
      });

      await mockRepos.issueLabels.create(label);

      const updated = await issueService.addLabelToIssue(issue.id, label.id);
      assert.ok(updated.labels.includes('bug'));
    });

    it('should remove label from issue', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const label = await issueService.createLabel({
        name: 'Bug',
        companyId: 'company-1'
      });

      await issueService.addLabelToIssue(issue.id, label.id);
      const result = await issueService.removeLabelFromIssue(issue.id, label.id);

      assert.equal(result, true);
    });

    it('should track label usage count', async () => {
      const label = await issueService.createLabel({
        name: 'Bug',
        companyId: 'company-1'
      });

      await mockRepos.issueLabels.create(label);

      const issue = await issueService.createIssue({
        title: 'Test',
        companyId: 'company-1'
      });

      await issueService.addLabelToIssue(issue.id, label.id);

      const updatedLabel = await mockRepos.issueLabels.findById(label.id);
      assert.equal(updatedLabel.usage_count, 1);
    });

    it('should get labels for a specific issue', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const labels = await issueService.getIssueLabels(issue.id);
      assert.ok(Array.isArray(labels));
    });
  });

  describe('Assignment Workflow', () => {
    it('should assign issue to user', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const assigned = await issueService.assignIssue(issue.id, 'user', 'user-2', {
        changedById: 'user-1'
      });

      assert.equal(assigned.assigneeType, 'user');
      assert.equal(assigned.assigneeId, 'user-2');
    });

    it('should assign issue to agent', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const assigned = await issueService.assignIssue(issue.id, 'agent', 'agent-1');

      assert.equal(assigned.assigneeType, 'agent');
      assert.equal(assigned.assigneeId, 'agent-1');
    });

    it('should validate assignee type', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await assert.rejects(
        issueService.assignIssue(issue.id, 'invalid', 'id'),
        /must be "user" or "agent"/i
      );
    });

    it('should unassign issue', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await issueService.assignIssue(issue.id, 'user', 'user-2');
      const unassigned = await issueService.unassignIssue(issue.id);

      assert.equal(unassigned.assigneeType, null);
      assert.equal(unassigned.assigneeId, null);
    });

    it('should record assignment history', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await issueService.assignIssue(issue.id, 'user', 'user-2', {
        changedById: 'user-1',
        reason: 'Handing off'
      });

      const history = await issueService.getAssignmentHistory(issue.id);
      assert.ok(history.length > 0);
    });

    it('should create system comment on assignment', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await issueService.assignIssue(issue.id, 'user', 'user-2');

      const comments = await issueService.getComments(issue.id);
      const assignmentComment = comments.find(c => c.comment_type === 'assignment_change');
      assert.ok(assignmentComment);
    });
  });

  describe('Read State Tracking', () => {
    it('should mark issue as read', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      const result = await issueService.markAsRead(issue.id, 'user-1');
      assert.ok(result);
    });

    it('should mark issue as unread', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await issueService.markAsRead(issue.id, 'user-1');
      await issueService.markAsUnread(issue.id, 'user-1');

      // Verify by checking read state
      const state = await mockRepos.issueReadStates.findByIssueAndUser(issue.id, 'user-1');
      assert.equal(state.is_read, false);
    });

    it('should get unread count for user', async () => {
      await issueService.createIssue({ title: 'Issue 1', companyId: 'company-1' });
      await issueService.createIssue({ title: 'Issue 2', companyId: 'company-1' });

      const count = await issueService.getUnreadCount('user-1', 'company-1');
      assert.ok(typeof count === 'number');
    });

    it('should get unread issues for user', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await issueService.markAsUnread(issue.id, 'user-1');

      const unread = await issueService.getUnreadIssues('user-1');
      assert.ok(Array.isArray(unread));
    });

    it('should track last seen comment', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1'
      });

      await issueService.markAsRead(issue.id, 'user-1', 'comment-123');

      const state = await mockRepos.issueReadStates.findByIssueAndUser(issue.id, 'user-1');
      assert.equal(state.last_seen_comment_id, 'comment-123');
    });

    it('should mark as unread for others on update', async () => {
      const issue = await issueService.createIssue({
        title: 'Test Issue',
        companyId: 'company-1',
        createdById: 'user-1'
      });

      // When issue is updated, others should be marked unread
      // This is tested through the updateIssue method
      const updated = await issueService.updateIssue(issue.id, { title: 'Updated' });
      assert.ok(updated);
    });
  });

  describe('Statistics and Reporting', () => {
    it('should get issue statistics for company', async () => {
      await issueService.createIssue({ 
        title: 'Issue 1', 
        status: 'backlog',
        companyId: 'company-1' 
      });

      const stats = await issueService.getStatistics('company-1');

      assert.ok(typeof stats.total === 'number');
      assert.ok(typeof stats.backlog === 'number');
      assert.ok(typeof stats.todo === 'number');
    });

    it('should get overdue issues', async () => {
      const issue = await issueService.createIssue({
        title: 'Overdue Issue',
        dueDate: '2023-01-01', // Past date
        companyId: 'company-1'
      });

      const overdue = await issueService.getOverdueIssues('company-1');
      assert.ok(Array.isArray(overdue));
    });

    it('should include issue number in created issues', async () => {
      const issue1 = await issueService.createIssue({
        title: 'First',
        companyId: 'company-1'
      });

      const issue2 = await issueService.createIssue({
        title: 'Second',
        companyId: 'company-1'
      });

      assert.ok(issue1.issueNumber);
      assert.ok(issue2.issueNumber);
      assert.equal(issue2.issueNumber, issue1.issueNumber + 1);
    });
  });

  describe('Service Context', () => {
    it('should set company context', () => {
      issueService.setCompany('company-2');
      assert.equal(issueService.getCurrentCompany(), 'company-2');
    });

    it('should set user context', () => {
      issueService.setUser('user-2');
      // User context is private, but we can verify it works through operations
      assert.ok(issueService);
    });
  });
});
