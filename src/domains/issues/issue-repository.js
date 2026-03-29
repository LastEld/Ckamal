/**
 * @fileoverview Issue Repository - Data access layer for issues and related entities
 * @module domains/issues/repository
 * 
 * Provides CRUD operations and specialized queries for:
 * - Issues (tickets)
 * - Issue comments (threaded)
 * - Labels and label links
 * - Attachments
 * - Read states
 * - Assignment history
 */

import { BaseRepository } from '../../db/repositories/base-repository.js';

// ============================================================================
// ISSUE REPOSITORY
// ============================================================================

/**
 * @typedef {Object} Issue
 * @property {string} id - UUID primary key
 * @property {string} company_id - Company UUID
 * @property {string} [parent_id] - Parent issue UUID (for sub-issues)
 * @property {string} [project_id] - Project UUID
 * @property {number} [task_id] - Linked task ID
 * @property {number} [issue_number] - Sequential number within company
 * @property {string} title - Issue title
 * @property {string} [description] - Issue description
 * @property {string} status - Issue status
 * @property {string} priority - Issue priority
 * @property {string} [assignee_type] - 'user' or 'agent'
 * @property {string} [assignee_id] - Assignee UUID
 * @property {string} created_by_type - 'user', 'agent', or 'system'
 * @property {string} [created_by_id] - Creator UUID
 * @property {string} [started_at] - When work started
 * @property {string} [completed_at] - When completed
 * @property {string} [cancelled_at] - When cancelled
 * @property {string} [due_date] - Due date
 * @property {string} origin_kind - Origin of issue
 * @property {string} [origin_id] - Origin identifier
 * @property {string} [origin_run_id] - Run ID if from automation
 * @property {number} comment_count - Number of comments
 * @property {number} attachment_count - Number of attachments
 * @property {string} [hidden_at] - Soft delete timestamp
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 */

/**
 * Issue repository with multi-tenant support
 * @extends BaseRepository
 */
export class IssueRepository extends BaseRepository {
  /** @type {string[]} */
  static COLUMNS = [
    'company_id',
    'parent_id',
    'project_id',
    'task_id',
    'issue_number',
    'title',
    'description',
    'status',
    'priority',
    'assignee_type',
    'assignee_id',
    'created_by_type',
    'created_by_id',
    'started_at',
    'completed_at',
    'cancelled_at',
    'due_date',
    'origin_kind',
    'origin_id',
    'origin_run_id',
    'comment_count',
    'attachment_count',
    'hidden_at',
    'deleted_at',
    'deleted_by'
  ];

  /**
   * Create an issue repository
   * @param {import('../../db/connection/index.js').ConnectionPool} pool - Connection pool
   */
  constructor(pool) {
    super(pool, 'issues', 'id', IssueRepository.COLUMNS);
  }

  /**
   * Find issue by ID with company check
   * @param {string} id - Issue ID
   * @param {string} companyId - Company ID for verification
   * @returns {Promise<Issue|undefined>}
   */
  async findByIdForCompany(id, companyId) {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    `;
    return this.pool.get(sql, [id, companyId]);
  }

  /**
   * Get next issue number for a company
   * @param {string} companyId - Company ID
   * @returns {Promise<number>}
   */
  async getNextIssueNumber(companyId) {
    const sql = `
      SELECT COALESCE(MAX(issue_number), 0) + 1 as next_number 
      FROM ${this.tableName} 
      WHERE company_id = ?
    `;
    const result = await this.pool.get(sql, [companyId]);
    return result?.next_number || 1;
  }

  /**
   * Find issues by company with optional filters
   * @param {string} companyId - Company ID
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.priority] - Filter by priority
   * @param {string} [filters.assigneeId] - Filter by assignee
   * @param {string} [filters.assigneeType] - Assignee type ('user' or 'agent')
   * @param {string} [filters.createdById] - Filter by creator
   * @param {string} [filters.search] - Search in title/description
   * @param {string[]} [filters.labels] - Filter by label names
   * @param {boolean} [filters.includeHidden] - Include hidden issues
   * @param {string} [filters.orderBy] - Order by column
   * @param {string} [filters.orderDirection] - Order direction
   * @param {number} [filters.limit] - Limit results
   * @param {number} [filters.offset] - Offset results
   * @returns {Promise<Issue[]>}
   */
  async findByCompany(companyId, filters = {}) {
    const {
      status,
      priority,
      assigneeId,
      assigneeType,
      createdById,
      search,
      labels,
      includeHidden = false,
      orderBy = 'updated_at',
      orderDirection = 'DESC',
      limit = 50,
      offset = 0
    } = filters;

    let whereClause = 'WHERE i.company_id = ? AND i.deleted_at IS NULL';
    const params = [companyId];

    if (!includeHidden) {
      whereClause += ' AND i.hidden_at IS NULL';
    }

    if (status) {
      whereClause += ' AND i.status = ?';
      params.push(status);
    }

    if (priority) {
      whereClause += ' AND i.priority = ?';
      params.push(priority);
    }

    if (assigneeId) {
      whereClause += ' AND i.assignee_id = ?';
      params.push(assigneeId);
    }

    if (assigneeType) {
      whereClause += ' AND i.assignee_type = ?';
      params.push(assigneeType);
    }

    if (createdById) {
      whereClause += ' AND i.created_by_id = ?';
      params.push(createdById);
    }

    if (search) {
      // Escape special LIKE characters to prevent SQL injection
      const escapedSearch = search.replace(/[%_]/g, '\\$&');
      whereClause += ' AND (i.title LIKE ? ESCAPE \\ OR i.description LIKE ? ESCAPE \\)';
      const searchPattern = `%${escapedSearch}%`;
      params.push(searchPattern, searchPattern);
    }

    // Handle label filtering with JOIN
    let joinClause = '';
    if (labels && labels.length > 0) {
      joinClause = `
        INNER JOIN issue_label_links ill ON i.id = ill.issue_id
        INNER JOIN issue_labels il ON ill.label_id = il.id AND il.name IN (${labels.map(() => '?').join(', ')})
      `;
      params.push(...labels);
    }

    const sql = `
      SELECT DISTINCT i.* FROM ${this.tableName} i
      ${joinClause}
      ${whereClause}
      ORDER BY i.${orderBy} ${orderDirection === 'DESC' ? 'DESC' : 'ASC'}
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    return this.pool.all(sql, params);
  }

  /**
   * Count issues by company with filters
   * @param {string} companyId - Company ID
   * @param {Object} [filters] - Filter options
   * @returns {Promise<number>}
   */
  async countByCompany(companyId, filters = {}) {
    const { status, assigneeId, includeHidden = false } = filters;

    let whereClause = 'WHERE company_id = ? AND deleted_at IS NULL';
    const params = [companyId];

    if (!includeHidden) {
      whereClause += ' AND hidden_at IS NULL';
    }

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (assigneeId) {
      whereClause += ' AND assignee_id = ?';
      params.push(assigneeId);
    }

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = await this.pool.get(sql, params);
    return result?.count || 0;
  }

  /**
   * Update issue status
   * @param {string} id - Issue ID
   * @param {string} status - New status
   * @param {Object} [meta] - Additional metadata
   * @returns {Promise<Issue|undefined>}
   */
  async updateStatus(id, status, meta = {}) {
    const updates = { status };

    // Update timestamps based on status
    if (status === 'in_progress' && meta.startedAt) {
      updates.started_at = meta.startedAt;
    } else if (status === 'completed' && meta.completedAt) {
      updates.completed_at = meta.completedAt;
    } else if (status === 'cancelled' && meta.cancelledAt) {
      updates.cancelled_at = meta.cancelledAt;
    }

    return this.update(id, updates);
  }

  /**
   * Update assignee
   * @param {string} id - Issue ID
   * @param {string|null} assigneeType - 'user', 'agent', or null
   * @param {string|null} assigneeId - Assignee ID or null
   * @returns {Promise<Issue|undefined>}
   */
  async updateAssignee(id, assigneeType, assigneeId) {
    return this.update(id, {
      assignee_type: assigneeType,
      assignee_id: assigneeId
    });
  }

  /**
   * Soft delete (hide) an issue
   * @param {string} id - Issue ID
   * @param {string} [deletedBy] - User ID performing deletion
   * @returns {Promise<boolean>}
   */
  async softDelete(id, deletedBy = null) {
    const sql = `
      UPDATE ${this.tableName} 
      SET hidden_at = CURRENT_TIMESTAMP, 
          deleted_at = CURRENT_TIMESTAMP,
          deleted_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = ?
    `;
    const result = await this.pool.run(sql, [deletedBy, id]);
    return result.changes > 0;
  }

  /**
   * Restore a hidden issue
   * @param {string} id - Issue ID
   * @returns {Promise<boolean>}
   */
  async restore(id) {
    const sql = `
      UPDATE ${this.tableName} 
      SET hidden_at = NULL, 
          deleted_at = NULL,
          deleted_by = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = ?
    `;
    const result = await this.pool.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Increment comment count
   * @param {string} issueId - Issue ID
   * @param {number} [delta=1] - Amount to change
   * @returns {Promise<void>}
   */
  async incrementCommentCount(issueId, delta = 1) {
    const sql = `
      UPDATE ${this.tableName} 
      SET comment_count = MAX(0, comment_count + ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await this.pool.run(sql, [delta, issueId]);
  }

  /**
   * Increment attachment count
   * @param {string} issueId - Issue ID
   * @param {number} [delta=1] - Amount to change
   * @returns {Promise<void>}
   */
  async incrementAttachmentCount(issueId, delta = 1) {
    const sql = `
      UPDATE ${this.tableName} 
      SET attachment_count = MAX(0, attachment_count + ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await this.pool.run(sql, [delta, issueId]);
  }

  /**
   * Get issue statistics for a company
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>}
   */
  async getStatistics(companyId) {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'backlog' THEN 1 END) as backlog,
        COUNT(CASE WHEN status = 'todo' THEN 1 END) as todo,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'in_review' THEN 1 END) as in_review,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high,
        COUNT(CASE WHEN priority = 'medium' THEN 1 END) as medium,
        COUNT(CASE WHEN priority = 'low' THEN 1 END) as low
      FROM ${this.tableName}
      WHERE company_id = ? AND deleted_at IS NULL AND hidden_at IS NULL
    `;
    return this.pool.get(sql, [companyId]);
  }

  /**
   * Find overdue issues
   * @param {string} companyId - Company ID
   * @returns {Promise<Issue[]>}
   */
  async findOverdue(companyId) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE company_id = ? 
        AND deleted_at IS NULL 
        AND hidden_at IS NULL
        AND due_date IS NOT NULL
        AND due_date < date('now')
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY due_date ASC
    `;
    return this.pool.all(sql, [companyId]);
  }
}

// ============================================================================
// ISSUE COMMENT REPOSITORY
// ============================================================================

/**
 * @typedef {Object} IssueComment
 * @property {string} id - UUID primary key
 * @property {string} issue_id - Issue UUID
 * @property {string} company_id - Company UUID
 * @property {string} [parent_id] - Parent comment UUID (for threading)
 * @property {string} [thread_root_id] - Root of thread
 * @property {string} content - Comment content
 * @property {string} [content_plain] - Plain text version
 * @property {string} author_type - 'user', 'agent', or 'system'
 * @property {string} [author_id] - Author UUID
 * @property {string} comment_type - Type of comment
 * @property {string} [metadata] - JSON metadata
 * @property {boolean} is_edited - Whether edited
 * @property {string} [edited_at] - Edit timestamp
 * @property {string} [edited_by] - Editor UUID
 * @property {boolean} is_deleted - Soft delete flag
 * @property {string} [deleted_at] - Deletion timestamp
 * @property {string} [deleted_by] - Deleter UUID
 * @property {string} [deleted_reason] - Deletion reason
 * @property {string} created_at - Creation timestamp
 */

/**
 * Issue comment repository
 * @extends BaseRepository
 */
export class IssueCommentRepository extends BaseRepository {
  static COLUMNS = [
    'issue_id',
    'company_id',
    'parent_id',
    'thread_root_id',
    'content',
    'content_plain',
    'author_type',
    'author_id',
    'comment_type',
    'metadata',
    'is_edited',
    'edited_at',
    'edited_by',
    'is_deleted',
    'deleted_at',
    'deleted_by',
    'deleted_reason'
  ];

  constructor(pool) {
    super(pool, 'issue_comments', 'id', IssueCommentRepository.COLUMNS);
  }

  /**
   * Find comments by issue
   * @param {string} issueId - Issue ID
   * @param {Object} [options] - Query options
   * @returns {Promise<IssueComment[]>}
   */
  async findByIssue(issueId, options = {}) {
    const { includeDeleted = false, limit = 100, offset = 0 } = options;

    let whereClause = 'WHERE issue_id = ?';
    if (!includeDeleted) {
      whereClause += ' AND is_deleted = 0';
    }

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ORDER BY 
        CASE WHEN parent_id IS NULL THEN created_at ELSE (
          SELECT created_at FROM ${this.tableName} WHERE id = ${this.tableName}.parent_id
        ) END DESC,
        parent_id ASC,
        created_at ASC
      LIMIT ? OFFSET ?
    `;
    return this.pool.all(sql, [issueId, limit, offset]);
  }

  /**
   * Find thread root comments with reply count
   * @param {string} issueId - Issue ID
   * @returns {Promise<Array<IssueComment & {reply_count: number}>>}
   */
  async findThreads(issueId) {
    const sql = `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM ${this.tableName} r 
         WHERE r.parent_id = c.id AND r.is_deleted = 0) as reply_count
      FROM ${this.tableName} c
      WHERE c.issue_id = ? 
        AND c.parent_id IS NULL 
        AND c.is_deleted = 0
      ORDER BY c.created_at DESC
    `;
    return this.pool.all(sql, [issueId]);
  }

  /**
   * Find replies to a comment
   * @param {string} parentId - Parent comment ID
   * @returns {Promise<IssueComment[]>}
   */
  async findReplies(parentId) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE parent_id = ? AND is_deleted = 0
      ORDER BY created_at ASC
    `;
    return this.pool.all(sql, [parentId]);
  }

  /**
   * Soft delete a comment
   * @param {string} id - Comment ID
   * @param {string} deletedBy - User ID
   * @param {string} [reason] - Deletion reason
   * @returns {Promise<boolean>}
   */
  async softDelete(id, deletedBy, reason = null) {
    const sql = `
      UPDATE ${this.tableName} 
      SET is_deleted = 1,
          deleted_at = CURRENT_TIMESTAMP,
          deleted_by = ?,
          deleted_reason = ?
      WHERE ${this.primaryKey} = ?
    `;
    const result = await this.pool.run(sql, [deletedBy, reason, id]);
    return result.changes > 0;
  }

  /**
   * Mark comment as edited
   * @param {string} id - Comment ID
   * @param {string} editedBy - Editor ID
   * @returns {Promise<boolean>}
   */
  async markEdited(id, editedBy) {
    const sql = `
      UPDATE ${this.tableName} 
      SET is_edited = 1,
          edited_at = CURRENT_TIMESTAMP,
          edited_by = ?
      WHERE ${this.primaryKey} = ?
    `;
    const result = await this.pool.run(sql, [editedBy, id]);
    return result.changes > 0;
  }
}

// ============================================================================
// ISSUE LABEL REPOSITORY
// ============================================================================

/**
 * @typedef {Object} IssueLabel
 * @property {string} id - UUID primary key
 * @property {string} company_id - Company UUID
 * @property {string} name - Label name
 * @property {string} [description] - Label description
 * @property {string} color - Hex color code
 * @property {number} usage_count - Times used
 * @property {boolean} is_system - System label flag
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 */

/**
 * Issue label repository
 * @extends BaseRepository
 */
export class IssueLabelRepository extends BaseRepository {
  static COLUMNS = [
    'company_id',
    'name',
    'description',
    'color',
    'usage_count',
    'is_system',
    'deleted_at'
  ];

  constructor(pool) {
    super(pool, 'issue_labels', 'id', IssueLabelRepository.COLUMNS);
  }

  /**
   * Find labels by company
   * @param {string} companyId - Company ID
   * @returns {Promise<IssueLabel[]>}
   */
  async findByCompany(companyId) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE company_id = ? AND deleted_at IS NULL
      ORDER BY name ASC
    `;
    return this.pool.all(sql, [companyId]);
  }

  /**
   * Find label by name
   * @param {string} companyId - Company ID
   * @param {string} name - Label name
   * @returns {Promise<IssueLabel|undefined>}
   */
  async findByName(companyId, name) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE company_id = ? AND name = ? AND deleted_at IS NULL
      LIMIT 1
    `;
    return this.pool.get(sql, [companyId, name]);
  }

  /**
   * Increment usage count
   * @param {string} labelId - Label ID
   * @param {number} [delta=1] - Amount to change
   * @returns {Promise<void>}
   */
  async incrementUsage(labelId, delta = 1) {
    const sql = `
      UPDATE ${this.tableName} 
      SET usage_count = MAX(0, usage_count + ?)
      WHERE id = ?
    `;
    await this.pool.run(sql, [delta, labelId]);
  }
}

// ============================================================================
// ISSUE LABEL LINK REPOSITORY
// ============================================================================

/**
 * Issue label link repository
 */
export class IssueLabelLinkRepository {
  /** @type {import('../../db/connection/index.js').ConnectionPool} */
  #pool;

  constructor(pool) {
    this.#pool = pool;
  }

  /**
   * Add label to issue
   * @param {string} issueId - Issue ID
   * @param {string} labelId - Label ID
   * @param {string} companyId - Company ID
   * @param {Object} [meta] - Metadata
   * @returns {Promise<Object>}
   */
  async create(issueId, labelId, companyId, meta = {}) {
    const sql = `
      INSERT INTO issue_label_links (issue_id, label_id, company_id, added_by_type, added_by_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(issue_id, label_id) DO NOTHING
      RETURNING *
    `;
    return this.#pool.get(sql, [
      issueId, 
      labelId, 
      companyId,
      meta.addedByType || 'user',
      meta.addedById
    ]);
  }

  /**
   * Remove label from issue
   * @param {string} issueId - Issue ID
   * @param {string} labelId - Label ID
   * @returns {Promise<boolean>}
   */
  async delete(issueId, labelId) {
    const sql = 'DELETE FROM issue_label_links WHERE issue_id = ? AND label_id = ?';
    const result = await this.#pool.run(sql, [issueId, labelId]);
    return result.changes > 0;
  }

  /**
   * Get all labels for an issue
   * @param {string} issueId - Issue ID
   * @returns {Promise<Array<IssueLabel & {added_at: string}>>}
   */
  async findByIssue(issueId) {
    const sql = `
      SELECT l.*, ill.created_at as added_at
      FROM issue_labels l
      JOIN issue_label_links ill ON l.id = ill.label_id
      WHERE ill.issue_id = ? AND l.deleted_at IS NULL
      ORDER BY l.name ASC
    `;
    return this.#pool.all(sql, [issueId]);
  }

  /**
   * Get all issues with a label
   * @param {string} labelId - Label ID
   * @returns {Promise<string[]>}
   */
  async findIssuesByLabel(labelId) {
    const sql = 'SELECT issue_id FROM issue_label_links WHERE label_id = ?';
    const results = await this.#pool.all(sql, [labelId]);
    return results.map(r => r.issue_id);
  }

  /**
   * Remove all labels from an issue
   * @param {string} issueId - Issue ID
   * @returns {Promise<void>}
   */
  async deleteAllForIssue(issueId) {
    const sql = 'DELETE FROM issue_label_links WHERE issue_id = ?';
    await this.#pool.run(sql, [issueId]);
  }
}

// ============================================================================
// ISSUE READ STATE REPOSITORY
// ============================================================================

/**
 * @typedef {Object} IssueReadState
 * @property {number} id - Primary key
 * @property {string} issue_id - Issue UUID
 * @property {string} user_id - User UUID
 * @property {string} company_id - Company UUID
 * @property {boolean} is_read - Read flag
 * @property {string} [read_at] - Read timestamp
 * @property {string} [last_seen_comment_id] - Last seen comment
 * @property {string} [last_seen_at] - Last seen timestamp
 * @property {boolean} notify_on_update - Notification preference
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 */

/**
 * Issue read state repository
 * @extends BaseRepository
 */
export class IssueReadStateRepository extends BaseRepository {
  static COLUMNS = [
    'issue_id',
    'user_id',
    'company_id',
    'is_read',
    'read_at',
    'last_seen_comment_id',
    'last_seen_at',
    'notify_on_update'
  ];

  constructor(pool) {
    super(pool, 'issue_read_states', 'id', IssueReadStateRepository.COLUMNS);
  }

  /**
   * Get or create read state
   * @param {string} issueId - Issue ID
   * @param {string} userId - User ID
   * @param {string} companyId - Company ID
   * @returns {Promise<IssueReadState>}
   */
  async getOrCreate(issueId, userId, companyId) {
    let state = await this.findByIssueAndUser(issueId, userId);
    if (!state) {
      state = await this.create({
        issue_id: issueId,
        user_id: userId,
        company_id: companyId,
        is_read: false,
        notify_on_update: true
      });
    }
    return state;
  }

  /**
   * Find read state by issue and user
   * @param {string} issueId - Issue ID
   * @param {string} userId - User ID
   * @returns {Promise<IssueReadState|undefined>}
   */
  async findByIssueAndUser(issueId, userId) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE issue_id = ? AND user_id = ?
      LIMIT 1
    `;
    return this.pool.get(sql, [issueId, userId]);
  }

  /**
   * Mark issue as read
   * @param {string} issueId - Issue ID
   * @param {string} userId - User ID
   * @param {string} [lastCommentId] - Last seen comment ID
   * @returns {Promise<IssueReadState>}
   */
  async markRead(issueId, userId, lastCommentId = null) {
    const sql = `
      INSERT INTO ${this.tableName} (issue_id, user_id, company_id, is_read, read_at, last_seen_comment_id, last_seen_at)
      VALUES (
        ?, ?, 
        (SELECT company_id FROM issues WHERE id = ?),
        1, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP
      )
      ON CONFLICT(issue_id, user_id) DO UPDATE SET
        is_read = 1,
        read_at = CURRENT_TIMESTAMP,
        last_seen_comment_id = COALESCE(?, last_seen_comment_id),
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    return this.pool.get(sql, [issueId, userId, issueId, lastCommentId, lastCommentId]);
  }

  /**
   * Mark issue as unread
   * @param {string} issueId - Issue ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async markUnread(issueId, userId) {
    const sql = `
      UPDATE ${this.tableName} 
      SET is_read = 0, updated_at = CURRENT_TIMESTAMP
      WHERE issue_id = ? AND user_id = ?
    `;
    await this.pool.run(sql, [issueId, userId]);
  }

  /**
   * Get unread count for user
   * @param {string} userId - User ID
   * @param {string} [companyId] - Optional company filter
   * @returns {Promise<number>}
   */
  async getUnreadCount(userId, companyId = null) {
    let sql = `
      SELECT COUNT(*) as count 
      FROM ${this.tableName}
      WHERE user_id = ? AND is_read = 0
    `;
    const params = [userId];

    if (companyId) {
      sql += ' AND company_id = ?';
      params.push(companyId);
    }

    const result = await this.pool.get(sql, params);
    return result?.count || 0;
  }

  /**
   * Get all unread issues for user
   * @param {string} userId - User ID
   * @param {string} [companyId] - Optional company filter
   * @returns {Promise<Array<{issue_id: string, created_at: string}>>}
   */
  async getUnreadIssues(userId, companyId = null) {
    let sql = `
      SELECT issue_id, created_at
      FROM ${this.tableName}
      WHERE user_id = ? AND is_read = 0
    `;
    const params = [userId];

    if (companyId) {
      sql += ' AND company_id = ?';
      params.push(companyId);
    }

    sql += ' ORDER BY created_at DESC';
    return this.pool.all(sql, params);
  }

  /**
   * Mark issue as unread for all users except the specified one
   * @param {string} issueId - Issue ID
   * @param {string} [exceptUserId] - User ID to exclude
   * @returns {Promise<void>}
   */
  async markUnreadForAllExcept(issueId, exceptUserId = null) {
    let sql = `
      UPDATE ${this.tableName} 
      SET is_read = 0, updated_at = CURRENT_TIMESTAMP
      WHERE issue_id = ?
    `;
    const params = [issueId];

    if (exceptUserId) {
      sql += ' AND user_id != ?';
      params.push(exceptUserId);
    }

    await this.pool.run(sql, params);
  }
}

// ============================================================================
// ISSUE ATTACHMENT REPOSITORY
// ============================================================================

/**
 * @typedef {Object} IssueAttachment
 * @property {string} id - UUID primary key
 * @property {string} issue_id - Issue UUID
 * @property {string} company_id - Company UUID
 * @property {string} [comment_id] - Comment UUID if attached to comment
 * @property {string} file_name - Original file name
 * @property {number} file_size - File size in bytes
 * @property {string} mime_type - MIME type
 * @property {string} storage_type - Storage backend
 * @property {string} storage_path - Storage path/ID
 * @property {string} [storage_url] - Public URL
 * @property {string} [thumbnail_path] - Thumbnail path
 * @property {string} [thumbnail_url] - Thumbnail URL
 * @property {string} [file_hash] - File hash for integrity
 * @property {string} uploaded_by_type - 'user', 'agent', or 'system'
 * @property {string} [uploaded_by_id] - Uploader ID
 * @property {string} created_at - Upload timestamp
 * @property {string} [deleted_at] - Soft delete timestamp
 */

/**
 * Issue attachment repository
 * @extends BaseRepository
 */
export class IssueAttachmentRepository extends BaseRepository {
  static COLUMNS = [
    'issue_id',
    'company_id',
    'comment_id',
    'file_name',
    'file_size',
    'mime_type',
    'storage_type',
    'storage_path',
    'storage_url',
    'thumbnail_path',
    'thumbnail_url',
    'file_hash',
    'uploaded_by_type',
    'uploaded_by_id',
    'deleted_at'
  ];

  constructor(pool) {
    super(pool, 'issue_attachments', 'id', IssueAttachmentRepository.COLUMNS);
  }

  /**
   * Find attachments by issue
   * @param {string} issueId - Issue ID
   * @returns {Promise<IssueAttachment[]>}
   */
  async findByIssue(issueId) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE issue_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    return this.pool.all(sql, [issueId]);
  }

  /**
   * Find attachments by comment
   * @param {string} commentId - Comment ID
   * @returns {Promise<IssueAttachment[]>}
   */
  async findByComment(commentId) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE comment_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    return this.pool.all(sql, [commentId]);
  }

  /**
   * Soft delete an attachment
   * @param {string} id - Attachment ID
   * @returns {Promise<boolean>}
   */
  async softDelete(id) {
    const sql = `
      UPDATE ${this.tableName} 
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = ?
    `;
    const result = await this.pool.run(sql, [id]);
    return result.changes > 0;
  }
}

// ============================================================================
// ISSUE ASSIGNMENT HISTORY REPOSITORY
// ============================================================================

/**
 * Issue assignment history repository
 */
export class IssueAssignmentHistoryRepository {
  /** @type {import('../../db/connection/index.js').ConnectionPool} */
  #pool;

  constructor(pool) {
    this.#pool = pool;
  }

  /**
   * Record assignment change
   * @param {Object} data - Assignment change data
   * @returns {Promise<Object>}
   */
  async record(data) {
    const sql = `
      INSERT INTO issue_assignment_history 
        (issue_id, company_id, previous_assignee_type, previous_assignee_id, 
         new_assignee_type, new_assignee_id, changed_by_type, changed_by_id, change_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `;
    return this.#pool.get(sql, [
      data.issueId,
      data.companyId,
      data.previousAssigneeType,
      data.previousAssigneeId,
      data.newAssigneeType,
      data.newAssigneeId,
      data.changedByType,
      data.changedById,
      data.changeReason
    ]);
  }

  /**
   * Get assignment history for an issue
   * @param {string} issueId - Issue ID
   * @returns {Promise<Object[]>}
   */
  async findByIssue(issueId) {
    const sql = `
      SELECT * FROM issue_assignment_history
      WHERE issue_id = ?
      ORDER BY created_at DESC
    `;
    return this.#pool.all(sql, [issueId]);
  }
}

export default {
  IssueRepository,
  IssueCommentRepository,
  IssueLabelRepository,
  IssueLabelLinkRepository,
  IssueReadStateRepository,
  IssueAttachmentRepository,
  IssueAssignmentHistoryRepository
};
