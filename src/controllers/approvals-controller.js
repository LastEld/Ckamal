/**
 * @fileoverview Approvals Controller
 * REST API controller for approval workflow management
 * 
 * @module controllers/approvals-controller
 * @version 5.0.0
 */

import { ApprovalService, ApprovalStatus, ApprovalType, RiskLevel, ActorType } from '../domains/approvals/approval-service.js';
import {
    validateRequest,
    formatResponse,
    formatListResponse,
    handleError,
    parsePagination
} from './helpers.js';

/**
 * Approval schema for validation
 * @const {Object}
 */
const APPROVAL_SCHEMA = {
    required: ['companyId', 'type', 'payload'],
    types: {
        companyId: 'string',
        type: 'string',
        priority: 'string',
        timeout: 'number',
        requestedByAgentId: 'string',
        requestedByUserId: 'string'
    },
    enums: {
        type: Object.values(ApprovalType),
        priority: ['low', 'normal', 'high', 'critical']
    },
    validators: {
        companyId: (value) => value.length > 0 || 'companyId cannot be empty',
        type: (value) => Object.values(ApprovalType).includes(value) || 'Invalid approval type'
    }
};

/**
 * Comment schema for validation
 * @const {Object}
 */
const COMMENT_SCHEMA = {
    required: ['content'],
    types: {
        content: 'string',
        authorType: 'string',
        authorId: 'string',
        parentCommentId: 'string'
    },
    enums: {
        authorType: Object.values(ActorType)
    },
    validators: {
        content: (value) => value.length > 0 || 'Comment content cannot be empty'
    }
};

/**
 * Delegation schema for validation
 * @const {Object}
 */
const DELEGATION_SCHEMA = {
    required: ['companyId', 'delegatorUserId', 'delegateUserId', 'expiresAt'],
    types: {
        companyId: 'string',
        delegatorUserId: 'string',
        delegateUserId: 'string',
        expiresAt: 'string'
    },
    validators: {
        companyId: (value) => value.length > 0 || 'companyId cannot be empty',
        delegatorUserId: (value) => value.length > 0 || 'delegatorUserId cannot be empty',
        delegateUserId: (value) => value.length > 0 || 'delegateUserId cannot be empty'
    }
};

/**
 * ApprovalsController class
 * Manages approval workflows, decisions, delegations, and comments
 */
export class ApprovalsController {
    /**
     * Create a new ApprovalsController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.db] - Database instance
     * @param {Object} [options.service] - ApprovalService instance (optional)
     */
    constructor(options = {}) {
        this.service = options.service;
        this.db = options.db;
        this.name = 'ApprovalsController';
    }

    /**
     * Get or initialize the approval service
     * @private
     * @returns {ApprovalService}
     */
    _getService() {
        if (!this.service) {
            if (!this.db) {
                throw new Error('Database instance required for ApprovalService');
            }
            this.service = new ApprovalService({ db: this.db });
        }
        return this.service;
    }

    // ========================================================================
    // Approval CRUD
    // ========================================================================

    /**
     * Create a new approval request
     * @param {Object} data - Approval data
     * @param {string} data.companyId - Company ID
     * @param {string} data.type - Approval type
     * @param {Object} data.payload - Action payload
     * @param {string} [data.requestedByAgentId] - Requesting agent ID
     * @param {string} [data.requestedByUserId] - Requesting user ID
     * @param {string} [data.priority='normal'] - Priority level
     * @param {number} [data.timeout] - Timeout in seconds
     * @param {string[]} [data.stakeholders] - User IDs to notify
     * @returns {Promise<Object>} Created approval
     * 
     * @example
     * const approval = await controller.createApproval({
     *   companyId: 'comp-123',
     *   type: 'code_change',
     *   payload: { file: 'src/app.js', changes: '...' },
     *   requestedByAgentId: 'agent-456'
     * });
     */
    async createApproval(data) {
        try {
            const validation = validateRequest(APPROVAL_SCHEMA, data);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!data.requestedByAgentId && !data.requestedByUserId) {
                return {
                    success: false,
                    error: 'Either requestedByAgentId or requestedByUserId is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const approval = await service.createApproval({
                companyId: data.companyId,
                type: data.type,
                payload: data.payload,
                requestedByAgentId: data.requestedByAgentId,
                requestedByUserId: data.requestedByUserId,
                priority: data.priority || 'normal',
                timeout: data.timeout,
                stakeholders: data.stakeholders || []
            });

            return formatResponse(approval, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create approval' });
        }
    }

    /**
     * List approvals with filters
     * @param {Object} [filters] - Query filters
     * @param {string} [filters.companyId] - Company ID
     * @param {string} [filters.status] - Filter by status
     * @param {string} [filters.type] - Filter by type
     * @param {string} [filters.riskLevel] - Filter by risk level
     * @param {string} [filters.requestedBy] - Filter by requester
     * @param {Object} [pagination] - Pagination options
     * @param {number} [pagination.limit=50] - Items per page
     * @param {number} [pagination.offset=0] - Offset for pagination
     * @returns {Promise<Object>} List of approvals
     */
    async listApprovals(filters = {}, pagination = {}) {
        try {
            const { limit, offset } = parsePagination(pagination);
            const service = this._getService();

            const approvals = await service.listApprovals({
                companyId: filters.companyId,
                status: filters.status,
                type: filters.type,
                riskLevel: filters.riskLevel,
                requestedBy: filters.requestedBy,
                limit,
                offset
            });

            return formatListResponse(approvals, {
                total: approvals.length,
                limit,
                offset
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list approvals' });
        }
    }

    /**
     * Get a single approval by ID
     * @param {string} id - Approval ID
     * @returns {Promise<Object>} Approval data
     */
    async getApproval(id) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Approval ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const approval = await service.getApproval(id);

            if (!approval) {
                return {
                    success: false,
                    error: `Approval not found: ${id}`,
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse(approval);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get approval' });
        }
    }

    // ========================================================================
    // Decision Methods
    // ========================================================================

    /**
     * Approve an approval request
     * @param {string} id - Approval ID
     * @param {Object} data - Approval data
     * @param {string} data.decidedByUserId - User making the decision
     * @param {string} [data.note] - Optional approval note
     * @returns {Promise<Object>} Updated approval
     */
    async approve(id, data) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Approval ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!data?.decidedByUserId) {
                return {
                    success: false,
                    error: 'decidedByUserId is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const approval = await service.approve(id, {
                decidedByUserId: data.decidedByUserId,
                note: data.note
            });

            return formatResponse(approval, { approved: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to approve request' });
        }
    }

    /**
     * Reject an approval request
     * @param {string} id - Approval ID
     * @param {Object} data - Rejection data
     * @param {string} data.decidedByUserId - User making the decision
     * @param {string} [data.reason] - Rejection reason
     * @returns {Promise<Object>} Updated approval
     */
    async reject(id, data) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Approval ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!data?.decidedByUserId) {
                return {
                    success: false,
                    error: 'decidedByUserId is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const approval = await service.reject(id, {
                decidedByUserId: data.decidedByUserId,
                reason: data.reason
            });

            return formatResponse(approval, { rejected: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to reject request' });
        }
    }

    /**
     * Request changes for an approval
     * @param {string} id - Approval ID
     * @param {Object} data - Request data
     * @param {string} data.decidedByUserId - User requesting changes
     * @param {string} data.feedback - Feedback for changes needed
     * @returns {Promise<Object>} Updated approval
     */
    async requestChanges(id, data) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Approval ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!data?.decidedByUserId) {
                return {
                    success: false,
                    error: 'decidedByUserId is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!data?.feedback) {
                return {
                    success: false,
                    error: 'feedback is required for requesting changes',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const approval = await service.requestChanges(id, {
                decidedByUserId: data.decidedByUserId,
                feedback: data.feedback
            });

            return formatResponse(approval, { changesRequested: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to request changes' });
        }
    }

    // ========================================================================
    // Delegation
    // ========================================================================

    /**
     * Delegate approval authority to another user
     * @param {Object} data - Delegation data
     * @param {string} data.companyId - Company ID
     * @param {string} data.delegatorUserId - User delegating their authority
     * @param {string} data.delegateUserId - User receiving delegation
     * @param {string} data.expiresAt - Expiration date (ISO string)
     * @param {string[]} [data.approvalTypes] - Approval types to delegate
     * @param {string[]} [data.riskLevels] - Risk levels to delegate
     * @returns {Promise<Object>} Created delegation
     */
    async delegate(data) {
        try {
            const validation = validateRequest(DELEGATION_SCHEMA, data);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const delegation = await service.delegateApproval({
                companyId: data.companyId,
                delegatorUserId: data.delegatorUserId,
                delegateUserId: data.delegateUserId,
                expiresAt: new Date(data.expiresAt),
                approvalTypes: data.approvalTypes || [],
                riskLevels: data.riskLevels || [RiskLevel.LOW, RiskLevel.MEDIUM],
                createdBy: data.decidedByUserId || data.delegatorUserId
            });

            return formatResponse(delegation, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create delegation' });
        }
    }

    /**
     * Get active delegations for a user
     * @param {string} companyId - Company ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Active delegations
     */
    async getActiveDelegations(companyId, userId) {
        try {
            if (!companyId || !userId) {
                return {
                    success: false,
                    error: 'companyId and userId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const delegations = await service.getActiveDelegations(companyId, userId);

            return formatResponse(delegations, { count: delegations.length });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get delegations' });
        }
    }

    // ========================================================================
    // Pending Approvals
    // ========================================================================

    /**
     * List pending approvals for current user
     * @param {string} companyId - Company ID
     * @param {string} userId - User ID
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} Pending approvals for user
     */
    async getPendingForUser(companyId, userId, pagination = {}) {
        try {
            if (!companyId || !userId) {
                return {
                    success: false,
                    error: 'companyId and userId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const { limit, offset } = parsePagination(pagination);
            const service = this._getService();

            // Get all pending approvals for the company
            const allPending = await service.listApprovals({
                companyId,
                status: ApprovalStatus.PENDING,
                limit: 1000, // Get all to filter
                offset: 0
            });

            // Get user's active delegations
            const delegations = await service.getActiveDelegations(companyId, userId);

            // Filter approvals user can act on
            const userApprovals = allPending.filter(approval => {
                // Check if user is a stakeholder
                const isStakeholder = approval.stakeholders?.some(
                    s => s.userId === userId && s.role === 'approver'
                );
                if (isStakeholder) return true;

                // Check if user has delegation that covers this approval
                return delegations.some(d => {
                    const typeMatch = d.approvalTypes.length === 0 || 
                        d.approvalTypes.includes(approval.type);
                    const riskMatch = d.riskLevels.includes(approval.riskLevel);
                    return typeMatch && riskMatch;
                });
            });

            // Apply pagination
            const paginated = userApprovals.slice(offset, offset + limit);

            return formatListResponse(paginated, {
                total: userApprovals.length,
                limit,
                offset
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get pending approvals' });
        }
    }

    // ========================================================================
    // Comments
    // ========================================================================

    /**
     * Add a comment to an approval
     * @param {string} id - Approval ID
     * @param {Object} data - Comment data
     * @param {string} data.content - Comment content
     * @param {string} data.authorId - Author ID
     * @param {string} [data.authorType='user'] - Author type (user, agent, system)
     * @param {string} [data.parentCommentId] - Parent comment ID for threads
     * @returns {Promise<Object>} Created comment
     */
    async addComment(id, data) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Approval ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const validation = validateRequest(COMMENT_SCHEMA, data);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const comment = await service.addComment(id, {
                content: data.content,
                authorType: data.authorType || ActorType.USER,
                authorId: data.authorId,
                parentCommentId: data.parentCommentId
            });

            return formatResponse(comment, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to add comment' });
        }
    }

    // ========================================================================
    // HTTP Request Handler
    // ========================================================================

    /**
     * Handle HTTP requests
     * @param {import('http').IncomingMessage} req
     * @param {import('http').ServerResponse} res
     * @returns {Promise<boolean>}
     */
    async handle(req, res) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;
        const method = req.method;

        // Parse request body for POST/PUT requests
        let body = {};
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
            body = await this._readJsonBody(req);
        }

        // Parse query params for GET requests
        const queryParams = Object.fromEntries(url.searchParams);

        // POST /api/approvals - Create approval
        if (pathname === '/api/approvals' && method === 'POST') {
            const result = await this.createApproval(body);
            this._sendJson(res, result.success ? 201 : (result.code === 'VALIDATION_ERROR' ? 400 : 500), result);
            return true;
        }

        // GET /api/approvals - List approvals
        if (pathname === '/api/approvals' && method === 'GET') {
            const result = await this.listApprovals(
                {
                    companyId: queryParams.companyId,
                    status: queryParams.status,
                    type: queryParams.type,
                    riskLevel: queryParams.riskLevel,
                    requestedBy: queryParams.requestedBy
                },
                {
                    limit: parseInt(queryParams.limit, 10) || 50,
                    offset: parseInt(queryParams.offset, 10) || 0
                }
            );
            this._sendJson(res, result.success ? 200 : 500, result);
            return true;
        }

        // GET /api/approvals/pending - List pending for current user
        if (pathname === '/api/approvals/pending' && method === 'GET') {
            const result = await this.getPendingForUser(
                queryParams.companyId,
                queryParams.userId,
                {
                    limit: parseInt(queryParams.limit, 10) || 50,
                    offset: parseInt(queryParams.offset, 10) || 0
                }
            );
            this._sendJson(res, result.success ? 200 : 500, result);
            return true;
        }

        // GET /api/approvals/:id - Get approval
        const getMatch = pathname.match(/^\/api\/approvals\/([^/]+)$/);
        if (getMatch && method === 'GET') {
            const id = decodeURIComponent(getMatch[1]);
            const result = await this.getApproval(id);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/approvals/:id/approve - Approve
        const approveMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/approve$/);
        if (approveMatch && method === 'POST') {
            const id = decodeURIComponent(approveMatch[1]);
            const result = await this.approve(id, body);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 403) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/approvals/:id/reject - Reject
        const rejectMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/reject$/);
        if (rejectMatch && method === 'POST') {
            const id = decodeURIComponent(rejectMatch[1]);
            const result = await this.reject(id, body);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 403) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/approvals/:id/request-changes - Request changes
        const changesMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/request-changes$/);
        if (changesMatch && method === 'POST') {
            const id = decodeURIComponent(changesMatch[1]);
            const result = await this.requestChanges(id, body);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 403) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/approvals/:id/delegate - Delegate approval
        const delegateMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/delegate$/);
        if (delegateMatch && method === 'POST') {
            const id = decodeURIComponent(delegateMatch[1]);
            // Use body with approval ID for context
            const result = await this.delegate({ ...body, approvalId: id });
            const statusCode = !result.success 
                ? (result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 201;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/approvals/:id/comments - Add comment
        const commentMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/comments$/);
        if (commentMatch && method === 'POST') {
            const id = decodeURIComponent(commentMatch[1]);
            const result = await this.addComment(id, body);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 201;
            this._sendJson(res, statusCode, result);
            return true;
        }

        return false;
    }

    /**
     * Read and parse JSON request body
     * @private
     * @param {import('http').IncomingMessage} req
     * @returns {Promise<Object>}
     */
    async _readJsonBody(req) {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (chunks.length === 0) return {};
        
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) return {};
        
        try {
            return JSON.parse(raw);
        } catch {
            return {};
        }
    }

    /**
     * Send JSON response
     * @private
     * @param {import('http').ServerResponse} res
     * @param {number} statusCode
     * @param {Object} payload
     */
    _sendJson(res, statusCode, payload) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload, null, 2));
    }
}

/**
 * Create a new ApprovalsController instance
 * @param {Object} [options] - Controller options
 * @returns {ApprovalsController} ApprovalsController instance
 */
export function createApprovalsController(options = {}) {
    return new ApprovalsController(options);
}

export default ApprovalsController;
