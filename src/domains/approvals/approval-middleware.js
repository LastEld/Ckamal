/**
 * @fileoverview Approval Middleware
 * Express middleware for requiring approval on agent actions
 * @module domains/approvals/approval-middleware
 * @version 5.0.0
 */

import { getApprovalService, ApprovalType, ApprovalStatus, ActorType } from './approval-service.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_REQUIRE_APPROVAL_TYPES = [
  ApprovalType.FILE_DELETE,
  ApprovalType.SYSTEM_COMMAND,
  ApprovalType.DEPLOYMENT,
  ApprovalType.ACCESS_GRANT
];

// ============================================================================
// Approval Middleware
// ============================================================================

/**
 * Approval Middleware - Requires approval for sensitive agent actions
 */
export class ApprovalMiddleware {
  #approvalService;
  #config;

  /**
   * @param {Object} options - Middleware options
   * @param {Object} options.db - Database instance
   * @param {Object} options.approvalService - ApprovalService instance
   * @param {string[]} options.requireApprovalTypes - Action types requiring approval
   * @param {Function} options.getCompanyId - Function to extract company ID from request
   * @param {Function} options.getUserId - Function to extract user ID from request
   * @param {boolean} options.allowAgentAutoApprove - Allow agents to auto-approve low-risk actions
   */
  constructor(options = {}) {
    this.#approvalService = options.approvalService || getApprovalService({ db: options.db });
    this.#config = {
      requireApprovalTypes: options.requireApprovalTypes || DEFAULT_REQUIRE_APPROVAL_TYPES,
      getCompanyId: options.getCompanyId || ((req) => req.auth?.companyId),
      getUserId: options.getUserId || ((req) => req.auth?.actorId),
      allowAgentAutoApprove: options.allowAgentAutoApprove !== false,
      ...options
    };
  }

  /**
   * Create middleware that requires approval for specific action types
   * @param {Object} options - Middleware options
   * @param {string[]} options.types - Action types that require approval
   * @param {Function} options.getPayload - Function to extract payload from request
   * @returns {Function} Express middleware
   */
  requireApproval(options = {}) {
    const types = options.types || this.#config.requireApprovalTypes;
    const getPayload = options.getPayload || this.#defaultGetPayload;

    return async (req, res, next) => {
      try {
        // Skip if no authentication
        if (!req.auth?.authenticated) {
          return res.status(401).json({
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
          });
        }

        const companyId = this.#config.getCompanyId(req);
        const actorId = this.#config.getUserId(req);
        const actorType = req.auth.actorType;

        if (!companyId) {
          return res.status(403).json({
            error: 'Company scope required',
            code: 'COMPANY_REQUIRED'
          });
        }

        // Extract action type and payload from request
        const actionType = req.headers['x-action-type'] || req.body?.actionType;
        const payload = getPayload(req);

        // Check if this action type requires approval
        const requiresApproval = types.includes(actionType) || 
                                 types.some(t => payload?.action?.includes(t));

        if (!requiresApproval) {
          // No approval needed, continue
          return next();
        }

        // Check for existing approval in request
        const approvalId = req.headers['x-approval-id'] || req.body?.approvalId;

        if (approvalId) {
          // Validate existing approval
          const approval = this.#approvalService.getApproval(approvalId);

          if (!approval) {
            return res.status(404).json({
              error: 'Approval not found',
              code: 'APPROVAL_NOT_FOUND'
            });
          }

          if (approval.companyId !== companyId) {
            return res.status(403).json({
              error: 'Approval does not belong to this company',
              code: 'APPROVAL_MISMATCH'
            });
          }

          if (approval.status !== ApprovalStatus.APPROVED) {
            return res.status(403).json({
              error: 'Approval not granted',
              code: 'APPROVAL_NOT_GRANTED',
              status: approval.status,
              approval
            });
          }

          // Check if approval is for this specific action
          const payloadMatch = this.#comparePayloads(approval.payload, payload);
          if (!payloadMatch) {
            return res.status(403).json({
              error: 'Approval does not match the requested action',
              code: 'APPROVAL_MISMATCH'
            });
          }

          // Valid approval exists
          req.approval = approval;
          return next();
        }

        // No approval provided - create approval request
        const approvalType = this.#mapToApprovalType(actionType, payload);
        
        const approval = await this.#approvalService.createApproval({
          companyId,
          type: approvalType,
          payload,
          requestedByAgentId: actorType === ActorType.AGENT ? actorId : undefined,
          requestedByUserId: actorType === ActorType.USER ? actorId : undefined,
          priority: this.#determinePriority(payload)
        });

        // If auto-approved, continue
        if (approval.status === ApprovalStatus.APPROVED) {
          req.approval = approval;
          return next();
        }

        // Return pending approval response
        return res.status(202).json({
          message: 'Approval required for this action',
          code: 'APPROVAL_REQUIRED',
          approval: {
            id: approval.id,
            type: approval.type,
            status: approval.status,
            riskLevel: approval.riskLevel,
            riskFactors: approval.riskFactors,
            timeoutAt: approval.timeoutAt,
            createdAt: approval.createdAt
          },
          action: {
            type: actionType,
            payload: this.#sanitizePayload(payload)
          }
        });

      } catch (error) {
        if (error.code) {
          return res.status(error.statusCode || 500).json({
            error: error.message,
            code: error.code
          });
        }
        next(error);
      }
    };
  }

  /**
   * Middleware to check if user can approve requests
   * @returns {Function} Express middleware
   */
  requireApprover() {
    return async (req, res, next) => {
      try {
        if (!req.auth?.authenticated) {
          return res.status(401).json({
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
          });
        }

        // Check if user has approver role or permission
        const isApprover = req.auth.role === 'admin' || 
                          req.auth.role === 'owner' ||
                          req.auth.permissions?.includes('approvals.manage');

        if (!isApprover) {
          return res.status(403).json({
            error: 'Approver permissions required',
            code: 'INSUFFICIENT_PERMISSIONS'
          });
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Middleware to inject approval status into requests
   * @returns {Function} Express middleware
   */
  injectApprovalStatus() {
    return async (req, res, next) => {
      try {
        const approvalId = req.headers['x-approval-id'] || req.query?.approvalId;
        
        if (approvalId) {
          const approval = this.#approvalService.getApproval(approvalId);
          if (approval) {
            req.approval = approval;
          }
        }

        next();
      } catch (error) {
        // Non-fatal, continue without approval
        next();
      }
    };
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  #defaultGetPayload(req) {
    return {
      action: req.body?.action,
      target: req.body?.target || req.params,
      params: req.body,
      method: req.method,
      path: req.path,
      estimatedImpact: req.body?.estimatedImpact || 'medium',
      estimatedCost: req.body?.estimatedCost,
      affectedSystems: req.body?.affectedSystems || [],
      requiresSudo: req.body?.requiresSudo || false,
      requiresAdmin: req.body?.requiresAdmin || false
    };
  }

  #mapToApprovalType(actionType, payload) {
    // Map action types to approval types
    const mapping = {
      'code_change': ApprovalType.CODE_CHANGE,
      'file_delete': ApprovalType.FILE_DELETE,
      'file_modify': ApprovalType.FILE_MODIFY,
      'system_command': ApprovalType.SYSTEM_COMMAND,
      'api_call': ApprovalType.API_CALL,
      'deployment': ApprovalType.DEPLOYMENT,
      'config_change': ApprovalType.CONFIG_CHANGE,
      'access_grant': ApprovalType.ACCESS_GRANT,
      'agent_action': ApprovalType.AGENT_ACTION
    };

    if (mapping[actionType]) {
      return mapping[actionType];
    }

    // Infer from payload
    if (payload?.action?.includes('delete')) return ApprovalType.FILE_DELETE;
    if (payload?.action?.includes('deploy')) return ApprovalType.DEPLOYMENT;
    if (payload?.requiresSudo || payload?.requiresAdmin) return ApprovalType.SYSTEM_COMMAND;

    return ApprovalType.AGENT_ACTION;
  }

  #determinePriority(payload) {
    if (payload?.urgent || payload?.priority === 'critical') return 'critical';
    if (payload?.priority === 'high') return 'high';
    if (payload?.priority === 'low') return 'low';
    return 'normal';
  }

  #comparePayloads(approved, current) {
    // Compare key fields to ensure approval matches action
    const keyFields = ['action', 'target', 'method', 'path'];
    
    for (const field of keyFields) {
      if (approved[field] && current[field]) {
        if (JSON.stringify(approved[field]) !== JSON.stringify(current[field])) {
          return false;
        }
      }
    }

    return true;
  }

  #sanitizePayload(payload) {
    // Remove sensitive data from payload for response
    const sensitive = ['password', 'secret', 'token', 'key', 'credential'];
    const sanitized = { ...payload };

    for (const key of Object.keys(sanitized)) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create approval middleware instance
 * @param {Object} options - Middleware options
 * @returns {ApprovalMiddleware}
 */
export function createApprovalMiddleware(options = {}) {
  return new ApprovalMiddleware(options);
}

/**
 * Create requireApproval middleware function
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
export function requireApproval(options = {}) {
  const middleware = new ApprovalMiddleware(options);
  return middleware.requireApproval(options);
}

/**
 * Create requireApprover middleware function
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
export function requireApprover(options = {}) {
  const middleware = new ApprovalMiddleware(options);
  return middleware.requireApprover();
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Wrap an agent execution function with approval checking
 * @param {Function} executeFn - Agent execution function
 * @param {Object} options - Options
 * @returns {Function} Wrapped function
 */
export function withApprovalCheck(executeFn, options = {}) {
  const approvalService = options.approvalService || getApprovalService();
  const requireApprovalTypes = options.requireApprovalTypes || DEFAULT_REQUIRE_APPROVAL_TYPES;

  return async function(task, ...args) {
    const actionType = task.type || task.action;
    
    // Check if approval is needed
    if (!requireApprovalTypes.includes(actionType)) {
      return executeFn.call(this, task, ...args);
    }

    // Check for existing approval
    const approvalId = task.approvalId || task.meta?.approvalId;
    
    if (approvalId) {
      const approval = approvalService.getApproval(approvalId);
      
      if (approval && approval.status === ApprovalStatus.APPROVED) {
        return executeFn.call(this, task, ...args);
      }
    }

    // Create approval request
    const payload = {
      action: actionType,
      target: task.target || task.data?.target,
      params: task.data,
      estimatedImpact: task.data?.estimatedImpact || 'medium'
    };

    const approval = await approvalService.createApproval({
      companyId: task.companyId || task.meta?.companyId,
      type: actionType,
      payload,
      requestedByAgentId: task.agentId,
      priority: task.priority || 'normal'
    });

    if (approval.status === ApprovalStatus.APPROVED) {
      return executeFn.call(this, { ...task, approvalId: approval.id }, ...args);
    }

    // Throw approval required error
    const error = new Error('Approval required for this action');
    error.code = 'APPROVAL_REQUIRED';
    error.approval = approval;
    throw error;
  };
}

/**
 * Express route handler to approve/reject/review approvals
 * @param {Object} approvalService - ApprovalService instance
 * @returns {Object} Route handlers
 */
export function createApprovalRoutes(approvalService) {
  return {
    // List approvals
    list: async (req, res, next) => {
      try {
        const filters = {
          companyId: req.auth?.companyId,
          status: req.query.status,
          type: req.query.type,
          limit: parseInt(req.query.limit) || 50,
          offset: parseInt(req.query.offset) || 0
        };

        const approvals = approvalService.listApprovals(filters);
        res.json({ approvals });
      } catch (error) {
        next(error);
      }
    },

    // Get single approval
    get: async (req, res, next) => {
      try {
        const approval = approvalService.getApproval(req.params.id);
        
        if (!approval) {
          return res.status(404).json({ error: 'Approval not found' });
        }

        if (approval.companyId !== req.auth?.companyId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ approval });
      } catch (error) {
        next(error);
      }
    },

    // Approve
    approve: async (req, res, next) => {
      try {
        const approval = await approvalService.approve(req.params.id, {
          decidedByUserId: req.auth?.actorId,
          note: req.body?.note
        });

        res.json({ approval });
      } catch (error) {
        if (error.code) {
          return res.status(error.statusCode).json({
            error: error.message,
            code: error.code
          });
        }
        next(error);
      }
    },

    // Reject
    reject: async (req, res, next) => {
      try {
        const approval = await approvalService.reject(req.params.id, {
          decidedByUserId: req.auth?.actorId,
          reason: req.body?.reason
        });

        res.json({ approval });
      } catch (error) {
        if (error.code) {
          return res.status(error.statusCode).json({
            error: error.message,
            code: error.code
          });
        }
        next(error);
      }
    },

    // Request changes
    requestChanges: async (req, res, next) => {
      try {
        const approval = await approvalService.requestChanges(req.params.id, {
          decidedByUserId: req.auth?.actorId,
          feedback: req.body?.feedback
        });

        res.json({ approval });
      } catch (error) {
        if (error.code) {
          return res.status(error.statusCode).json({
            error: error.message,
            code: error.code
          });
        }
        next(error);
      }
    },

    // Add comment
    addComment: async (req, res, next) => {
      try {
        const comment = await approvalService.addComment(req.params.id, {
          authorType: req.auth?.actorType || 'user',
          authorId: req.auth?.actorId,
          content: req.body?.content,
          parentCommentId: req.body?.parentCommentId
        });

        res.status(201).json({ comment });
      } catch (error) {
        next(error);
      }
    }
  };
}

export default ApprovalMiddleware;
