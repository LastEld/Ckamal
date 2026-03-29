/**
 * @fileoverview Issues REST API Controller
 * HTTP endpoints for issue/ticket management
 * @module controllers/issues-controller
 */

import { IssueService } from '../domains/issues/issue-service.js';
import { formatResponse, formatListResponse, handleError, parsePagination } from './helpers.js';

/**
 * Issues Controller - REST API endpoints for issue management
 */
export class IssuesController {
  /**
   * @param {Object} options
   * @param {IssueService} [options.service] - Issue service instance
   * @param {Object} [options.repositories] - Repository factory
   */
  constructor(options = {}) {
    this.service = options.service || null;
    this.repositories = options.repositories || null;
    
    if (!this.service && this.repositories) {
      this.service = new IssueService({ repositories: this.repositories });
    }
  }

  /**
   * Initialize controller
   */
  async initialize() {
    if (!this.service && this.repositories) {
      this.service = new IssueService({ repositories: this.repositories });
    }
  }

  // ============================================================================
  // ISSUE CRUD
  // ============================================================================

  /**
   * POST /api/issues - Create issue
   */
  async createIssue(req, res) {
    try {
      const body = await this._parseBody(req);
      const companyId = this._getCompanyId(req);
      // const userId = this._getUserId(req);

      const issue = await this.service.createIssue({
        ...body,
        companyId,
        createdById: userId
      });

      this._sendJson(res, 201, formatResponse(issue));
    } catch (error) {
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * GET /api/issues - List issues
   */
  async listIssues(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const companyId = this._getCompanyId(req);
      
      const filters = {
        companyId,
        status: url.searchParams.get('status') || undefined,
        priority: url.searchParams.get('priority') || undefined,
        assigneeId: url.searchParams.get('assigneeId') || undefined,
        assigneeType: url.searchParams.get('assigneeType') || undefined,
        search: url.searchParams.get('search') || undefined,
        labels: url.searchParams.getAll('label'),
        orderBy: url.searchParams.get('orderBy') || 'updated_at',
        orderDirection: url.searchParams.get('orderDirection') || 'DESC',
        ...parsePagination(Object.fromEntries(url.searchParams))
      };

      const issues = await this.service.listIssues(filters);
      
      this._sendJson(res, 200, formatListResponse(issues, {
        total: issues.length,
        limit: filters.limit,
        offset: filters.offset
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * GET /api/issues/:id - Get issue
   */
  async getIssue(req, res, params) {
    try {
      const { id } = params;
      const companyId = this._getCompanyId(req);
      
      const issue = await this.service.getIssue(id);
      
      if (!issue) {
        return this._sendJson(res, 404, { success: false, error: 'Issue not found', code: 'NOT_FOUND' });
      }

      // Permission check: ensure issue belongs to user's company
      if (companyId && issue.companyId && issue.companyId !== companyId) {
        return this._sendJson(res, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
      }

      this._sendJson(res, 200, formatResponse(issue));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * PUT /api/issues/:id - Update issue
   */
  async updateIssue(req, res, params) {
    try {
      const { id } = params;
      const body = await this._parseBody(req);
      const companyId = this._getCompanyId(req);
      const userId = this._getUserId(req);

      // Check permission: verify issue belongs to user's company
      const existingIssue = await this.service.getIssue(id);
      if (!existingIssue) {
        return this._sendJson(res, 404, { success: false, error: 'Issue not found', code: 'NOT_FOUND' });
      }
      
      if (companyId && existingIssue.companyId && existingIssue.companyId !== companyId) {
        return this._sendJson(res, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
      }
      
      const issue = await this.service.updateIssue(id, body);
      this._sendJson(res, 200, formatResponse(issue));
    } catch (error) {
      if (error.message?.includes('not found')) {
        return this._sendJson(res, 404, { success: false, error: error.message, code: 'NOT_FOUND' });
      }
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * DELETE /api/issues/:id - Delete issue
   */
  async deleteIssue(req, res, params) {
    try {
      const { id } = params;
      const userId = this._getUserId(req);
      const companyId = this._getCompanyId(req);

      // Check permission: verify issue belongs to user's company
      const existingIssue = await this.service.getIssue(id);
      if (!existingIssue) {
        return this._sendJson(res, 404, { success: false, error: 'Issue not found', code: 'NOT_FOUND' });
      }
      
      if (companyId && existingIssue.companyId && existingIssue.companyId !== companyId) {
        return this._sendJson(res, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
      }
      
      await this.service.deleteIssue(id, userId);
      this._sendJson(res, 200, formatResponse({ id, deleted: true }));
    } catch (error) {
      if (error.message?.includes('not found')) {
        return this._sendJson(res, 404, { success: false, error: error.message, code: 'NOT_FOUND' });
      }
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // COMMENTS
  // ============================================================================

  /**
   * POST /api/issues/:id/comments - Add comment
   */
  async addComment(req, res, params) {
    try {
      const { id } = params;
      const body = await this._parseBody(req);
      const userId = this._getUserId(req);
      const companyId = this._getCompanyId(req);

      // Check permission: verify issue belongs to user's company
      const existingIssue = await this.service.getIssue(id);
      if (!existingIssue) {
        return this._sendJson(res, 404, { success: false, error: 'Issue not found', code: 'NOT_FOUND' });
      }
      
      if (companyId && existingIssue.companyId && existingIssue.companyId !== companyId) {
        return this._sendJson(res, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
      }

      // Fix: Properly handle comment threading - set threadRootId if replying to a comment
      let threadRootId = body.threadRootId || null;
      const parentId = body.parentId || null;
      
      // If parentId is provided but no threadRootId, use parentId as thread root
      if (parentId && !threadRootId) {
        threadRootId = parentId;
      }

      const comment = await this.service.addComment(id, {
        ...body,
        authorId: userId,
        authorType: body.authorType || 'user',
        parentId,
        threadRootId
      });

      this._sendJson(res, 201, formatResponse(comment));
    } catch (error) {
      if (error.message?.includes('not found')) {
        return this._sendJson(res, 404, { success: false, error: error.message, code: 'NOT_FOUND' });
      }
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * GET /api/issues/:id/comments - List comments
   */
  async listComments(req, res, params) {
    try {
      const { id } = params;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      
      const options = {
        limit: parseInt(url.searchParams.get('limit')) || 100,
        offset: parseInt(url.searchParams.get('offset')) || 0,
        includeDeleted: url.searchParams.get('includeDeleted') === 'true'
      };

      const comments = await this.service.getComments(id, options);
      this._sendJson(res, 200, formatListResponse(comments, {
        total: comments.length,
        limit: options.limit,
        offset: options.offset
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * PUT /api/issues/:id/comments/:commentId - Update comment
   */
  async updateComment(req, res, params) {
    try {
      const { id, commentId } = params;
      const body = await this._parseBody(req);
      const userId = this._getUserId(req);
      const companyId = this._getCompanyId(req);

      // Check permission: verify issue belongs to user's company
      const existingIssue = await this.service.getIssue(id);
      if (!existingIssue) {
        return this._sendJson(res, 404, { success: false, error: 'Issue not found', code: 'NOT_FOUND' });
      }
      
      if (companyId && existingIssue.companyId && existingIssue.companyId !== companyId) {
        return this._sendJson(res, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
      }

      // Get existing comment to check ownership
      const comments = await this.service.getComments(id);
      const existingComment = comments.find(c => c.id === commentId);
      if (!existingComment) {
        return this._sendJson(res, 404, { success: false, error: 'Comment not found', code: 'NOT_FOUND' });
      }

      // Permission check: only comment author can edit (unless system/admin)
      if (existingComment.authorId !== userId && existingComment.authorType !== 'system') {
        return this._sendJson(res, 403, { success: false, error: 'Cannot edit comment: not the author', code: 'FORBIDDEN' });
      }

      const comment = await this.service.updateComment(commentId, body.content, userId);
      this._sendJson(res, 200, formatResponse(comment));
    } catch (error) {
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * DELETE /api/issues/:id/comments/:commentId - Delete comment
   */
  async deleteComment(req, res, params) {
    try {
      const { id, commentId } = params;
      const userId = this._getUserId(req);
      const companyId = this._getCompanyId(req);
      const body = await this._parseBody(req).catch(() => ({}));

      // Check permission: verify issue belongs to user's company
      const existingIssue = await this.service.getIssue(id);
      if (!existingIssue) {
        return this._sendJson(res, 404, { success: false, error: 'Issue not found', code: 'NOT_FOUND' });
      }
      
      if (companyId && existingIssue.companyId && existingIssue.companyId !== companyId) {
        return this._sendJson(res, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
      }

      // Get existing comment to check ownership
      const comments = await this.service.getComments(id);
      const existingComment = comments.find(c => c.id === commentId);
      if (!existingComment) {
        return this._sendJson(res, 404, { success: false, error: 'Comment not found', code: 'NOT_FOUND' });
      }

      // Permission check: only comment author can delete (unless system/admin)
      if (existingComment.authorId !== userId && existingComment.authorType !== 'system') {
        return this._sendJson(res, 403, { success: false, error: 'Cannot delete comment: not the author', code: 'FORBIDDEN' });
      }

      await this.service.deleteComment(commentId, userId, body.reason);
      this._sendJson(res, 200, formatResponse({ commentId, deleted: true }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // LABELS
  // ============================================================================

  /**
   * POST /api/issues/:id/labels - Add label to issue
   */
  async addLabel(req, res, params) {
    try {
      const { id } = params;
      const body = await this._parseBody(req);
      const companyId = this._getCompanyId(req);

      // Check permission: verify issue belongs to user's company
      const existingIssue = await this.service.getIssue(id);
      if (!existingIssue) {
        return this._sendJson(res, 404, { success: false, error: 'Issue not found', code: 'NOT_FOUND' });
      }
      
      if (companyId && existingIssue.companyId && existingIssue.companyId !== companyId) {
        return this._sendJson(res, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
      }

      // Fix: Support both labelId and labelName for flexibility
      let labelId = body.labelId;
      if (!labelId && body.labelName) {
        // Find label by name within the company
        const labels = await this.service.getLabels(companyId);
        const label = labels.find(l => l.name.toLowerCase() === body.labelName.toLowerCase());
        if (!label) {
          return this._sendJson(res, 404, { success: false, error: `Label not found: ${body.labelName}`, code: 'NOT_FOUND' });
        }
        labelId = label.id;
      }

      if (!labelId) {
        return this._sendJson(res, 400, { success: false, error: 'labelId or labelName is required', code: 'VALIDATION_ERROR' });
      }

      const issue = await this.service.addLabelToIssue(id, labelId);
      this._sendJson(res, 200, formatResponse(issue));
    } catch (error) {
      if (error.message?.includes('not found')) {
        return this._sendJson(res, 404, { success: false, error: error.message, code: 'NOT_FOUND' });
      }
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * DELETE /api/issues/:id/labels/:labelId - Remove label from issue
   */
  async removeLabel(req, res, params) {
    try {
      const { id, labelId } = params;
      const companyId = this._getCompanyId(req);

      // Check permission: verify issue belongs to user's company
      const existingIssue = await this.service.getIssue(id);
      if (!existingIssue) {
        return this._sendJson(res, 404, { success: false, error: 'Issue not found', code: 'NOT_FOUND' });
      }
      
      if (companyId && existingIssue.companyId && existingIssue.companyId !== companyId) {
        return this._sendJson(res, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
      }

      await this.service.removeLabelFromIssue(id, labelId);
      this._sendJson(res, 200, formatResponse({ issueId: id, labelId, removed: true }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * GET /api/issues/labels - List all labels
   */
  async listLabels(req, res) {
    try {
      const companyId = this._getCompanyId(req);
      const labels = await this.service.getLabels(companyId);
      this._sendJson(res, 200, formatListResponse(labels, {
        total: labels.length,
        limit: labels.length,
        offset: 0
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * POST /api/issues/labels - Create label
   */
  async createLabel(req, res) {
    try {
      const body = await this._parseBody(req);
      const companyId = this._getCompanyId(req);

      const label = await this.service.createLabel({
        ...body,
        companyId
      });

      this._sendJson(res, 201, formatResponse(label));
    } catch (error) {
      this._sendJson(res, 400, handleError(error));
    }
  }

  // ============================================================================
  // ASSIGNMENT
  // ============================================================================

  /**
   * POST /api/issues/:id/assign - Assign issue
   */
  async assignIssue(req, res, params) {
    try {
      const { id } = params;
      const body = await this._parseBody(req);
      const userId = this._getUserId(req);
      const companyId = this._getCompanyId(req);

      // Check permission: verify issue belongs to user's company
      const existingIssue = await this.service.getIssue(id);
      if (!existingIssue) {
        return this._sendJson(res, 404, { success: false, error: 'Issue not found', code: 'NOT_FOUND' });
      }
      
      if (companyId && existingIssue.companyId && existingIssue.companyId !== companyId) {
        return this._sendJson(res, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
      }

      let issue;
      if (body.assigneeType === null || body.assigneeId === null) {
        issue = await this.service.unassignIssue(id, { changedById: userId });
      } else {
        issue = await this.service.assignIssue(id, body.assigneeType, body.assigneeId, {
          changedById: userId,
          reason: body.reason
        });
      }

      this._sendJson(res, 200, formatResponse(issue));
    } catch (error) {
      if (error.message?.includes('not found')) {
        return this._sendJson(res, 404, { success: false, error: error.message, code: 'NOT_FOUND' });
      }
      this._sendJson(res, 400, handleError(error));
    }
  }

  // ============================================================================
  // READ STATE
  // ============================================================================

  /**
   * POST /api/issues/:id/read - Mark as read
   */
  async markAsRead(req, res, params) {
    try {
      const { id } = params;
      const body = await this._parseBody(req).catch(() => ({}));
      const userId = this._getUserId(req);
      const companyId = this._getCompanyId(req);

      // Check permission: verify issue belongs to user's company
      const existingIssue = await this.service.getIssue(id);
      if (!existingIssue) {
        return this._sendJson(res, 404, { success: false, error: 'Issue not found', code: 'NOT_FOUND' });
      }
      
      if (companyId && existingIssue.companyId && existingIssue.companyId !== companyId) {
        return this._sendJson(res, 403, { success: false, error: 'Access denied', code: 'FORBIDDEN' });
      }

      const result = await this.service.markAsRead(id, userId, body.lastCommentId);
      this._sendJson(res, 200, formatResponse({ issueId: id, markedAsRead: true, result }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * GET /api/issues/unread - Get unread issues for current user
   */
  async getUnreadIssues(req, res) {
    try {
      const userId = this._getUserId(req);
      const issueIds = await this.service.getUnreadIssues(userId);
      
      this._sendJson(res, 200, formatResponse({ issueIds, count: issueIds.length }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // SEARCH
  // ============================================================================

  /**
   * GET /api/issues/search - Search issues
   */
  async searchIssues(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = url.searchParams.get('q') || '';
      const companyId = this._getCompanyId(req);

      // Fix: Include all available filter options for comprehensive search
      const options = {
        companyId,
        status: url.searchParams.get('status') || undefined,
        priority: url.searchParams.get('priority') || undefined,
        assigneeId: url.searchParams.get('assigneeId') || undefined,
        assigneeType: url.searchParams.get('assigneeType') || undefined,
        labels: url.searchParams.getAll('label'),
        orderBy: url.searchParams.get('orderBy') || 'updated_at',
        orderDirection: url.searchParams.get('orderDirection') || 'DESC',
        ...parsePagination(Object.fromEntries(url.searchParams))
      };

      const issues = await this.service.searchIssues(query, options);
      this._sendJson(res, 200, formatListResponse(issues, {
        total: issues.length,
        limit: options.limit,
        offset: options.offset
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * GET /api/issues/statistics - Get issue statistics
   */
  async getStatistics(req, res) {
    try {
      const companyId = this._getCompanyId(req);
      const stats = await this.service.getStatistics(companyId);
      this._sendJson(res, 200, formatResponse(stats));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Parse request body
   * @private
   */
  async _parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   * @private
   */
  _sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }

  /**
   * Get company ID from request
   * @private
   */
  _getCompanyId(req) {
    // Try to get from auth context, headers, or query params
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return req.headers['x-company-id'] || 
           url.searchParams.get('companyId') || 
           req.companyId || 
           null;
  }

  /**
   * Get user ID from request
   * @private
   */
  _getUserId(req) {
    // Try to get from auth context, headers, or query params
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return req.headers['x-user-id'] || 
           url.searchParams.get('userId') || 
           req.userId || 
           'anonymous';
  }
}

/**
 * Create issues controller instance
 * @param {Object} options
 * @returns {IssuesController}
 */
export function createIssuesController(options = {}) {
  return new IssuesController(options);
}

export default IssuesController;
