/**
 * @fileoverview Issue Service - Business logic layer for issue/ticket management
 * @module domains/issues/service
 * 
 * Inspired by Paperclip's issue system, this service provides:
 * - CRUD for issues with company isolation
 * - Threaded commenting system
 * - Label management
 * - Assignment workflow with history
 * - Read state tracking
 * - Search and filtering
 * 
 * Note: Issues are SEPARATE from tasks:
 * - Tasks (src/domains/tasks): Simple todo items, Eisenhower matrix
 * - Issues (this service): Full ticket/project management with comments, labels, assignments
 */

import {
  IssueRepository,
  IssueCommentRepository,
  IssueLabelRepository,
  IssueLabelLinkRepository,
  IssueReadStateRepository,
  IssueAttachmentRepository,
  IssueAssignmentHistoryRepository
} from './issue-repository.js';

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

const VALID_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled'];
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const VALID_ORIGIN_KINDS = ['manual', 'automation', 'integration', 'alert', 'routine_execution'];
const VALID_ACTOR_TYPES = ['user', 'agent', 'system'];

/**
 * Generate UUID
 * @returns {string}
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `iss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current ISO timestamp
 * @returns {string}
 */
function now() {
  return new Date().toISOString();
}

/**
 * Validate status
 * @param {string} status
 * @returns {string}
 */
function validateStatus(status) {
  const normalized = status?.toLowerCase();
  if (!VALID_STATUSES.includes(normalized)) {
    throw new Error(`Invalid status: ${status}. Valid: ${VALID_STATUSES.join(', ')}`);
  }
  return normalized;
}

/**
 * Validate priority
 * @param {string} priority
 * @returns {string}
 */
function validatePriority(priority) {
  const normalized = priority?.toLowerCase();
  if (!VALID_PRIORITIES.includes(normalized)) {
    throw new Error(`Invalid priority: ${priority}. Valid: ${VALID_PRIORITIES.join(', ')}`);
  }
  return normalized;
}

// ============================================================================
// ISSUE SERVICE
// ============================================================================

/**
 * @typedef {Object} CreateIssueData
 * @property {string} title - Issue title (required)
 * @property {string} [description] - Issue description
 * @property {string} [status='backlog'] - Initial status
 * @property {string} [priority='medium'] - Issue priority
 * @property {string} [companyId] - Company ID (required if not set in service)
 * @property {string} [parentId] - Parent issue ID for sub-issues
 * @property {string} [projectId] - Project ID
 * @property {number} [taskId] - Linked task ID
 * @property {string} [assigneeType] - 'user' or 'agent'
 * @property {string} [assigneeId] - Assignee ID
 * @property {string} [createdByType='user'] - Creator type
 * @property {string} [createdById] - Creator ID
 * @property {string} [originKind='manual'] - Origin of issue
 * @property {string} [originId] - Origin identifier
 * @property {string} [dueDate] - Due date ISO string
 */

/**
 * @typedef {Object} Issue
 * @property {string} id - Issue UUID
 * @property {number} issueNumber - Sequential issue number
 * @property {string} title - Issue title
 * @property {string} description - Issue description
 * @property {string} status - Current status
 * @property {string} priority - Issue priority
 * @property {string} [assigneeType] - Assignee type
 * @property {string} [assigneeId] - Assignee ID
 * @property {string} createdAt - Creation timestamp
 * @property {string} updatedAt - Last update timestamp
 * @property {string[]} labels - Label names
 * @property {boolean} isRead - Whether read by current user
 * @property {number} commentCount - Number of comments
 * @property {number} attachmentCount - Number of attachments
 */

/**
 * Issue Service - Main business logic for issue management
 */
export class IssueService {
  /** @type {IssueRepository|null} */
  #issueRepo = null;
  /** @type {IssueCommentRepository|null} */
  #commentRepo = null;
  /** @type {IssueLabelRepository|null} */
  #labelRepo = null;
  /** @type {IssueLabelLinkRepository|null} */
  #labelLinkRepo = null;
  /** @type {IssueReadStateRepository|null} */
  #readStateRepo = null;
  /** @type {IssueAttachmentRepository|null} */
  #attachmentRepo = null;
  /** @type {IssueAssignmentHistoryRepository|null} */
  #assignmentHistoryRepo = null;

  /** @type {Map<string, Object>} In-memory cache for issues */
  #issues = new Map();
  /** @type {Map<string, Object>} In-memory cache for labels */
  #labels = new Map();

  /** @type {string|null} Current company ID */
  #currentCompanyId = null;
  /** @type {string|null} Current user ID */
  #currentUserId = null;

  /**
   * Create issue service
   * @param {Object} [options]
   * @param {Object} [options.repositories] - Repository factory
   * @param {string} [options.companyId] - Default company ID
   * @param {string} [options.userId] - Current user ID
   */
  constructor(options = {}) {
    const repos = options.repositories;
    if (repos) {
      this.#issueRepo = repos.issues || null;
      this.#commentRepo = repos.issueComments || null;
      this.#labelRepo = repos.issueLabels || null;
      this.#labelLinkRepo = repos.issueLabelLinks || null;
      this.#readStateRepo = repos.issueReadStates || null;
      this.#attachmentRepo = repos.issueAttachments || null;
      this.#assignmentHistoryRepo = repos.issueAssignmentHistory || null;
    }
    this.#currentCompanyId = options.companyId || null;
    this.#currentUserId = options.userId || null;
  }

  /**
   * Initialize repositories with connection pool
   * @param {import('../../db/connection/index.js').ConnectionPool} pool - Connection pool
   */
  initializeRepositories(pool) {
    this.#issueRepo = new IssueRepository(pool);
    this.#commentRepo = new IssueCommentRepository(pool);
    this.#labelRepo = new IssueLabelRepository(pool);
    this.#labelLinkRepo = new IssueLabelLinkRepository(pool);
    this.#readStateRepo = new IssueReadStateRepository(pool);
    this.#attachmentRepo = new IssueAttachmentRepository(pool);
    this.#assignmentHistoryRepo = new IssueAssignmentHistoryRepository(pool);
  }

  /**
   * Set current company context
   * @param {string} companyId
   */
  setCompany(companyId) {
    this.#currentCompanyId = companyId;
  }

  /**
   * Set current user context
   * @param {string} userId
   */
  setUser(userId) {
    this.#currentUserId = userId;
  }

  /**
   * Get current company ID
   * @returns {string|null}
   */
  getCurrentCompany() {
    return this.#currentCompanyId;
  }

  // ============================================================================
  // ISSUE CRUD OPERATIONS
  // ============================================================================

  /**
   * Create a new issue
   * @param {CreateIssueData} data
   * @returns {Promise<Issue>}
   */
  async createIssue(data) {
    if (!data.title?.trim()) {
      throw new Error('Issue title is required');
    }

    const companyId = data.companyId || this.#currentCompanyId;
    if (!companyId) {
      throw new Error('Company ID is required');
    }

    // Get next issue number
    let issueNumber = 1;
    if (this.#issueRepo) {
      issueNumber = await this.#issueRepo.getNextIssueNumber(companyId);
    }

    const issueId = generateUUID();
    const issue = {
      id: issueId,
      company_id: companyId,
      parent_id: data.parentId || null,
      project_id: data.projectId || null,
      task_id: data.taskId || null,
      issue_number: issueNumber,
      title: data.title.trim(),
      description: data.description?.trim() || '',
      status: validateStatus(data.status || 'backlog'),
      priority: validatePriority(data.priority || 'medium'),
      assignee_type: data.assigneeType || null,
      assignee_id: data.assigneeId || null,
      created_by_type: data.createdByType || 'user',
      created_by_id: data.createdById || this.#currentUserId,
      origin_kind: data.originKind || 'manual',
      origin_id: data.originId || null,
      due_date: data.dueDate || null,
      comment_count: 0,
      attachment_count: 0,
      created_at: now(),
      updated_at: now()
    };

    // Persist to repository
    if (this.#issueRepo) {
      await this.#issueRepo.create(issue);
    }

    // Cache in memory
    this.#issues.set(issueId, this.#hydrateIssue(issue));

    // Create read state for creator (mark as read)
    if (this.#readStateRepo && issue.created_by_id) {
      await this.#readStateRepo.markRead(issueId, issue.created_by_id);
    }

    return this.getIssue(issueId);
  }

  /**
   * Get issue by ID
   * @param {string} id
   * @returns {Promise<Issue|null>}
   */
  async getIssue(id) {
    // Check cache first
    const cached = this.#issues.get(id);
    if (cached) {
      return cached;
    }

    // Fetch from repository
    if (!this.#issueRepo) return null;

    const row = await this.#issueRepo.findById(id);
    if (!row || row.deleted_at) return null;

    const issue = await this.#hydrateIssue(row);
    this.#issues.set(id, issue);
    return issue;
  }

  /**
   * Update an issue
   * @param {string} id - Issue ID
   * @param {Object} updates - Update data
   * @returns {Promise<Issue>}
   */
  async updateIssue(id, updates) {
    const issue = await this.getIssue(id);
    if (!issue) {
      throw new Error(`Issue not found: ${id}`);
    }

    const allowedUpdates = {};

    if (updates.title !== undefined) {
      if (!updates.title.trim()) throw new Error('Title cannot be empty');
      allowedUpdates.title = updates.title.trim();
    }

    if (updates.description !== undefined) {
      allowedUpdates.description = updates.description.trim();
    }

    if (updates.status !== undefined) {
      allowedUpdates.status = validateStatus(updates.status);
      // Set timestamps based on status changes
      if (allowedUpdates.status === 'in_progress') {
        allowedUpdates.started_at = now();
      } else if (allowedUpdates.status === 'completed') {
        allowedUpdates.completed_at = now();
      } else if (allowedUpdates.status === 'cancelled') {
        allowedUpdates.cancelled_at = now();
      }
    }

    if (updates.priority !== undefined) {
      allowedUpdates.priority = validatePriority(updates.priority);
    }

    if (updates.dueDate !== undefined) {
      allowedUpdates.due_date = updates.dueDate;
    }

    if (this.#issueRepo) {
      await this.#issueRepo.update(id, allowedUpdates);
    }

    // Invalidate cache
    this.#issues.delete(id);

    // Mark as unread for other users when updated
    await this.#markUnreadForOthers(id);

    return this.getIssue(id);
  }

  /**
   * Delete an issue (soft delete)
   * @param {string} id - Issue ID
   * @param {string} [deletedBy] - User ID performing deletion
   * @returns {Promise<boolean>}
   */
  async deleteIssue(id, deletedBy = null) {
    const issue = await this.getIssue(id);
    if (!issue) {
      throw new Error(`Issue not found: ${id}`);
    }

    if (this.#issueRepo) {
      await this.#issueRepo.softDelete(id, deletedBy || this.#currentUserId);
    }

    this.#issues.delete(id);
    return true;
  }

  /**
   * List issues with filtering
   * @param {Object} [filters]
   * @returns {Promise<Issue[]>}
   */
  async listIssues(filters = {}) {
    const companyId = filters.companyId || this.#currentCompanyId;
    if (!companyId || !this.#issueRepo) {
      return Array.from(this.#issues.values());
    }

    const rows = await this.#issueRepo.findByCompany(companyId, {
      status: filters.status,
      priority: filters.priority,
      assigneeId: filters.assigneeId,
      assigneeType: filters.assigneeType,
      search: filters.search,
      labels: filters.labels,
      orderBy: filters.orderBy || 'updated_at',
      orderDirection: filters.orderDirection || 'DESC',
      limit: filters.limit || 50,
      offset: filters.offset || 0
    });

    const issues = [];
    for (const row of rows) {
      const issue = await this.#hydrateIssue(row);
      this.#issues.set(issue.id, issue);
      issues.push(issue);
    }

    return issues;
  }

  /**
   * Search issues
   * @param {string} query - Search query
   * @param {Object} [options]
   * @returns {Promise<Issue[]>}
   */
  async searchIssues(query, options = {}) {
    return this.listIssues({
      ...options,
      search: query
    });
  }

  // ============================================================================
  // ASSIGNMENT WORKFLOW
  // ============================================================================

  /**
   * Assign issue to user or agent
   * @param {string} issueId - Issue ID
   * @param {string} assigneeType - 'user' or 'agent'
   * @param {string} assigneeId - Assignee ID
   * @param {Object} [options]
   * @returns {Promise<Issue>}
   */
  async assignIssue(issueId, assigneeType, assigneeId, options = {}) {
    if (!['user', 'agent'].includes(assigneeType)) {
      throw new Error('Assignee type must be "user" or "agent"');
    }

    const issue = await this.getIssue(issueId);
    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    const previousType = issue.assigneeType;
    const previousId = issue.assigneeId;

    // Update assignment
    if (this.#issueRepo) {
      await this.#issueRepo.updateAssignee(issueId, assigneeType, assigneeId);
    }

    // Record in history
    if (this.#assignmentHistoryRepo) {
      await this.#assignmentHistoryRepo.record({
        issueId,
        companyId: issue.companyId || this.#currentCompanyId,
        previousAssigneeType: previousType,
        previousAssigneeId: previousId,
        newAssigneeType: assigneeType,
        newAssigneeId: assigneeId,
        changedByType: options.changedByType || 'user',
        changedById: options.changedById || this.#currentUserId,
        changeReason: options.reason || null
      });
    }

    // Create system comment
    await this.addComment(issueId, {
      content: `Assigned to ${assigneeType} ${assigneeId}`,
      commentType: 'assignment_change',
      authorType: 'system'
    });

    // Mark as unread for new assignee
    if (this.#readStateRepo && assigneeId) {
      await this.#readStateRepo.markUnread(issueId, assigneeId);
    }

    this.#issues.delete(issueId);
    return this.getIssue(issueId);
  }

  /**
   * Unassign issue
   * @param {string} issueId - Issue ID
   * @param {Object} [options]
   * @returns {Promise<Issue>}
   */
  async unassignIssue(issueId, options = {}) {
    const issue = await this.getIssue(issueId);
    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    const previousType = issue.assigneeType;
    const previousId = issue.assigneeId;

    if (this.#issueRepo) {
      await this.#issueRepo.updateAssignee(issueId, null, null);
    }

    // Record in history
    if (this.#assignmentHistoryRepo) {
      await this.#assignmentHistoryRepo.record({
        issueId,
        companyId: issue.companyId || this.#currentCompanyId,
        previousAssigneeType: previousType,
        previousAssigneeId: previousId,
        newAssigneeType: null,
        newAssigneeId: null,
        changedByType: options.changedByType || 'user',
        changedById: options.changedById || this.#currentUserId,
        changeReason: options.reason || 'Unassigned'
      });
    }

    await this.addComment(issueId, {
      content: 'Issue unassigned',
      commentType: 'assignment_change',
      authorType: 'system'
    });

    this.#issues.delete(issueId);
    return this.getIssue(issueId);
  }

  /**
   * Get assignment history
   * @param {string} issueId - Issue ID
   * @returns {Promise<Object[]>}
   */
  async getAssignmentHistory(issueId) {
    if (!this.#assignmentHistoryRepo) return [];
    return this.#assignmentHistoryRepo.findByIssue(issueId);
  }

  // ============================================================================
  // COMMENT OPERATIONS (THREADED)
  // ============================================================================

  /**
   * Add comment to issue
   * @param {string} issueId - Issue ID
   * @param {Object} data - Comment data
   * @returns {Promise<Object>}
   */
  async addComment(issueId, data) {
    const issue = await this.getIssue(issueId);
    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    if (!data.content?.trim()) {
      throw new Error('Comment content is required');
    }

    // Validate parentId exists and belongs to this issue
    let threadRootId = data.threadRootId || null;
    if (data.parentId) {
      const parentComment = await this.#commentRepo?.findById(data.parentId);
      if (!parentComment) {
        throw new Error(`Parent comment not found: ${data.parentId}`);
      }
      if (parentComment.issue_id !== issueId) {
        throw new Error('Parent comment does not belong to this issue');
      }
      // Inherit thread root from parent or use parent as root
      threadRootId = parentComment.thread_root_id || parentComment.id;
    }

    const comment = {
      id: generateUUID(),
      issue_id: issueId,
      company_id: issue.companyId || this.#currentCompanyId,
      parent_id: data.parentId || null,
      thread_root_id: threadRootId,
      content: data.content.trim(),
      content_plain: data.contentPlain || data.content.trim(),
      author_type: data.authorType || 'user',
      author_id: data.authorId || this.#currentUserId,
      comment_type: data.commentType || 'comment',
      metadata: data.metadata ? JSON.stringify(data.metadata) : '{}',
      is_edited: false,
      is_deleted: false,
      created_at: now()
    };

    if (this.#commentRepo) {
      await this.#commentRepo.create(comment);
    }

    // Update comment count
    if (this.#issueRepo) {
      await this.#issueRepo.incrementCommentCount(issueId, 1);
    }

    // Notify subscribers about new comment
    await this.#notifySubscribers(issueId, 'new_comment', {
      commentId: comment.id,
      authorId: comment.author_id,
      authorType: comment.author_type
    });

    return comment;
  }

  /**
   * Get comments for an issue
   * @param {string} issueId - Issue ID
   * @param {Object} [options]
   * @returns {Promise<Object[]>}
   */
  async getComments(issueId, options = {}) {
    if (!this.#commentRepo) return [];

    const comments = await this.#commentRepo.findByIssue(issueId, {
      includeDeleted: options.includeDeleted,
      limit: options.limit || 100,
      offset: options.offset || 0
    });

    return comments.map(c => this.#hydrateComment(c));
  }

  /**
   * Get threaded comments
   * @param {string} issueId - Issue ID
   * @returns {Promise<Object[]>}
   */
  async getThreadedComments(issueId) {
    if (!this.#commentRepo) return [];

    const threads = await this.#commentRepo.findThreads(issueId);
    const result = [];

    for (const thread of threads) {
      const threadData = this.#hydrateComment(thread);
      threadData.replies = [];

      if (thread.reply_count > 0) {
        const replies = await this.#commentRepo.findReplies(thread.id);
        threadData.replies = replies.map(r => this.#hydrateComment(r));
      }

      result.push(threadData);
    }

    return result;
  }

  /**
   * Update comment
   * @param {string} commentId - Comment ID
   * @param {string} content - New content
   * @param {string} [editedBy] - Editor ID
   * @returns {Promise<Object>}
   */
  async updateComment(commentId, content, editedBy = null) {
    if (!content?.trim()) {
      throw new Error('Comment content is required');
    }

    if (!this.#commentRepo) {
      throw new Error('Comment repository not available');
    }

    await this.#commentRepo.markEdited(commentId, editedBy || this.#currentUserId);
    
    return this.#commentRepo.update(commentId, {
      content: content.trim(),
      content_plain: content.trim()
    });
  }

  /**
   * Delete comment (soft delete)
   * @param {string} commentId - Comment ID
   * @param {string} [deletedBy] - User ID
   * @param {string} [reason] - Deletion reason
   * @returns {Promise<boolean>}
   */
  async deleteComment(commentId, deletedBy = null, reason = null) {
    if (!this.#commentRepo) return false;

    // Get comment before deletion to know issue_id
    const comment = await this.#commentRepo.findById(commentId);
    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    const result = await this.#commentRepo.softDelete(
      commentId, 
      deletedBy || this.#currentUserId,
      reason
    );

    // Update comment count
    if (result && this.#issueRepo) {
      await this.#issueRepo.incrementCommentCount(comment.issue_id, -1);
    }

    return result;
  }

  // ============================================================================
  // LABEL MANAGEMENT
  // ============================================================================

  /**
   * Create label
   * @param {Object} data - Label data
   * @returns {Promise<Object>}
   */
  async createLabel(data) {
    if (!data.name?.trim()) {
      throw new Error('Label name is required');
    }

    const companyId = data.companyId || this.#currentCompanyId;
    if (!companyId) {
      throw new Error('Company ID is required');
    }

    const label = {
      id: generateUUID(),
      company_id: companyId,
      name: data.name.trim().toLowerCase(),
      description: data.description?.trim() || '',
      color: data.color || '#6B7280',
      usage_count: 0,
      is_system: false,
      created_at: now(),
      updated_at: now()
    };

    if (this.#labelRepo) {
      await this.#labelRepo.create(label);
    }

    this.#labels.set(label.id, label);
    return label;
  }

  /**
   * Get labels for company
   * @param {string} [companyId]
   * @returns {Promise<Object[]>}
   */
  async getLabels(companyId = null) {
    const cid = companyId || this.#currentCompanyId;
    if (!cid || !this.#labelRepo) {
      return Array.from(this.#labels.values());
    }

    return this.#labelRepo.findByCompany(cid);
  }

  /**
   * Add label to issue
   * @param {string} issueId - Issue ID
   * @param {string} labelId - Label ID
   * @returns {Promise<Object>}
   */
  async addLabelToIssue(issueId, labelId) {
    const issue = await this.getIssue(issueId);
    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    // Check if label already exists on issue
    const existingLabels = await this.getIssueLabels(issueId);
    if (existingLabels.some(l => l.id === labelId)) {
      return issue; // Label already assigned, return early
    }

    const companyId = issue.companyId || this.#currentCompanyId;

    if (this.#labelLinkRepo) {
      await this.#labelLinkRepo.create(issueId, labelId, companyId, {
        addedByType: 'user',
        addedById: this.#currentUserId
      });
    }

    if (this.#labelRepo) {
      await this.#labelRepo.incrementUsage(labelId, 1);
    }

    // Add system comment
    const label = this.#labels.get(labelId) || await this.#labelRepo?.findById(labelId);
    await this.addComment(issueId, {
      content: `Added label: ${label?.name || labelId}`,
      commentType: 'label_change',
      authorType: 'system'
    });

    this.#issues.delete(issueId);
    return this.getIssue(issueId);
  }

  /**
   * Remove label from issue
   * @param {string} issueId - Issue ID
   * @param {string} labelId - Label ID
   * @returns {Promise<boolean>}
   */
  async removeLabelFromIssue(issueId, labelId) {
    if (!this.#labelLinkRepo) return false;

    const result = await this.#labelLinkRepo.delete(issueId, labelId);

    if (result) {
      await this.#labelRepo?.incrementUsage(labelId, -1);
      
      const label = this.#labels.get(labelId) || await this.#labelRepo?.findById(labelId);
      await this.addComment(issueId, {
        content: `Removed label: ${label?.name || labelId}`,
        commentType: 'label_change',
        authorType: 'system'
      });
    }

    this.#issues.delete(issueId);
    return result;
  }

  /**
   * Get issue labels
   * @param {string} issueId - Issue ID
   * @returns {Promise<Object[]>}
   */
  async getIssueLabels(issueId) {
    if (!this.#labelLinkRepo) return [];
    return this.#labelLinkRepo.findByIssue(issueId);
  }

  // ============================================================================
  // READ STATE TRACKING
  // ============================================================================

  /**
   * Mark issue as read
   * @param {string} issueId - Issue ID
   * @param {string} [userId] - User ID (defaults to current user)
   * @param {string} [lastCommentId] - Last seen comment ID
   * @returns {Promise<Object>}
   */
  async markAsRead(issueId, userId = null, lastCommentId = null) {
    if (!this.#readStateRepo) return null;

    const uid = userId || this.#currentUserId;
    if (!uid) {
      throw new Error('User ID is required');
    }

    return this.#readStateRepo.markRead(issueId, uid, lastCommentId);
  }

  /**
   * Mark issue as unread
   * @param {string} issueId - Issue ID
   * @param {string} [userId] - User ID
   * @returns {Promise<void>}
   */
  async markAsUnread(issueId, userId = null) {
    if (!this.#readStateRepo) return;

    const uid = userId || this.#currentUserId;
    if (!uid) return;

    return this.#readStateRepo.markUnread(issueId, uid);
  }

  /**
   * Get unread count for user
   * @param {string} [userId] - User ID
   * @param {string} [companyId] - Company ID
   * @returns {Promise<number>}
   */
  async getUnreadCount(userId = null, companyId = null) {
    if (!this.#readStateRepo) return 0;

    const uid = userId || this.#currentUserId;
    if (!uid) return 0;

    return this.#readStateRepo.getUnreadCount(uid, companyId || this.#currentCompanyId);
  }

  /**
   * Get unread issues for user
   * @param {string} [userId] - User ID
   * @returns {Promise<string[]>}
   */
  async getUnreadIssues(userId = null) {
    if (!this.#readStateRepo) return [];

    const uid = userId || this.#currentUserId;
    if (!uid) return [];

    const unread = await this.#readStateRepo.getUnreadIssues(uid, this.#currentCompanyId);
    return unread.map(u => u.issue_id);
  }

  // ============================================================================
  // STATISTICS AND REPORTING
  // ============================================================================

  /**
   * Get issue statistics for company
   * @param {string} [companyId]
   * @returns {Promise<Object>}
   */
  async getStatistics(companyId = null) {
    const cid = companyId || this.#currentCompanyId;
    if (!cid || !this.#issueRepo) {
      return {
        total: 0,
        backlog: 0,
        todo: 0,
        in_progress: 0,
        in_review: 0,
        blocked: 0,
        completed: 0,
        cancelled: 0
      };
    }

    return this.#issueRepo.getStatistics(cid);
  }

  /**
   * Get overdue issues
   * @param {string} [companyId]
   * @returns {Promise<Issue[]>}
   */
  async getOverdueIssues(companyId = null) {
    const cid = companyId || this.#currentCompanyId;
    if (!cid || !this.#issueRepo) return [];

    const rows = await this.#issueRepo.findOverdue(cid);
    return Promise.all(rows.map(r => this.#hydrateIssue(r)));
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Hydrate issue from database row
   * @private
   */
  async #hydrateIssue(row) {
    const issue = {
      id: row.id,
      issueNumber: row.issue_number,
      title: row.title,
      description: row.description || '',
      status: row.status,
      priority: row.priority,
      assigneeType: row.assignee_type,
      assigneeId: row.assignee_id,
      createdByType: row.created_by_type,
      createdById: row.created_by_id,
      companyId: row.company_id,
      parentId: row.parent_id,
      projectId: row.project_id,
      taskId: row.task_id,
      originKind: row.origin_kind,
      originId: row.origin_id,
      dueDate: row.due_date,
      commentCount: row.comment_count || 0,
      attachmentCount: row.attachment_count || 0,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
      hiddenAt: row.hidden_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      labels: []
    };

    // Load labels
    if (this.#labelLinkRepo) {
      const labels = await this.#labelLinkRepo.findByIssue(row.id);
      issue.labels = labels.map(l => l.name);
    }

    // Check read state for current user
    if (this.#readStateRepo && this.#currentUserId) {
      const readState = await this.#readStateRepo.findByIssueAndUser(
        row.id, 
        this.#currentUserId
      );
      issue.isRead = readState?.is_read || false;
    } else {
      issue.isRead = false;
    }

    return issue;
  }

  /**
   * Hydrate comment from database row
   * @private
   */
  #hydrateComment(row) {
    return {
      id: row.id,
      issueId: row.issue_id,
      parentId: row.parent_id,
      threadRootId: row.thread_root_id,
      content: row.content,
      contentPlain: row.content_plain,
      authorType: row.author_type,
      authorId: row.author_id,
      commentType: row.comment_type,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      isEdited: Boolean(row.is_edited),
      editedAt: row.edited_at,
      editedBy: row.edited_by,
      isDeleted: Boolean(row.is_deleted),
      deletedAt: row.deleted_at,
      deletedBy: row.deleted_by,
      createdAt: row.created_at
    };
  }

  /**
   * Mark issue as unread for all users except the specified one
   * @private
   */
  async #markUnreadForOthers(issueId, exceptUserId = null) {
    if (!this.#readStateRepo) return;

    // Mark as unread for all subscribers except the actor
    // This uses the read_state table to find users tracking this issue
    await this.#readStateRepo.markUnreadForAllExcept(issueId, exceptUserId);
  }

  /**
   * Notify subscribers about issue changes
   * @private
   */
  async #notifySubscribers(issueId, eventType, data = {}) {
    if (!this.#readStateRepo) return;

    // Mark unread for relevant users based on event type
    switch (eventType) {
      case 'new_comment':
        // Mark unread for issue subscribers except comment author
        await this.#markUnreadForOthers(issueId, data.authorId);
        break;
      case 'status_change':
      case 'assignment_change':
        // Mark unread for assignee and creator
        await this.#markUnreadForOthers(issueId, data.changedBy);
        break;
      default:
        await this.#markUnreadForOthers(issueId);
    }
  }
}

export default IssueService;
