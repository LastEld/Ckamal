/**
 * @fileoverview Approval Workflow Service
 * Manages approval workflows for agent actions
 * Inspired by Paperclip's approval system
 * @module domains/approvals/approval-service
 * @version 5.0.0
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// Constants
// ============================================================================

export const ApprovalStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CHANGES_REQUESTED: 'changes_requested',
  ESCALATED: 'escalated',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired'
};

export const ApprovalType = {
  AGENT_ACTION: 'agent_action',
  CODE_CHANGE: 'code_change',
  FILE_DELETE: 'file_delete',
  FILE_MODIFY: 'file_modify',
  SYSTEM_COMMAND: 'system_command',
  API_CALL: 'api_call',
  DEPLOYMENT: 'deployment',
  CONFIG_CHANGE: 'config_change',
  ACCESS_GRANT: 'access_grant',
  COST_THRESHOLD: 'cost_threshold'
};

export const RiskLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

export const ActorType = {
  USER: 'user',
  AGENT: 'agent',
  SYSTEM: 'system'
};

// Default escalation timeouts in seconds
const DEFAULT_ESCALATION_TIMEOUTS = [3600, 7200, 14400]; // 1h, 2h, 4h

// ============================================================================
// Errors
// ============================================================================

export class ApprovalError extends Error {
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
    this.metadata = metadata;
    this.statusCode = this.#getStatusCode(code);
  }

  #getStatusCode(code) {
    const codes = {
      'APPROVAL_NOT_FOUND': 404,
      'APPROVAL_ALREADY_DECIDED': 409,
      'INSUFFICIENT_PERMISSIONS': 403,
      'INVALID_STATUS': 400,
      'TIMEOUT_EXPIRED': 410,
      'POLICY_VIOLATION': 403,
      'DELEGATION_NOT_FOUND': 404,
      'INVALID_DELEGATION': 400
    };
    return codes[code] || 500;
  }
}

// ============================================================================
// Approval Service
// ============================================================================

/**
 * Approval Service - Manages approval workflows for agent actions
 * @extends EventEmitter
 */
export class ApprovalService extends EventEmitter {
  #db;
  #config;
  #escalationInterval;
  #auditEnabled;

  /**
   * @param {Object} options - Service options
   * @param {Object} options.db - Database instance (better-sqlite3)
   * @param {Object} options.config - Configuration options
   * @param {boolean} options.auditEnabled - Enable audit logging
   */
  constructor(options = {}) {
    super();
    
    if (!options?.db) {
      throw new ApprovalError('CONFIG_ERROR', 'Database instance required');
    }

    this.#db = options.db;
    this.#auditEnabled = options.auditEnabled !== false;
    this.#config = {
      defaultTimeout: options.defaultTimeout || 86400, // 24 hours
      maxEscalationLevel: options.maxEscalationLevel || 3,
      escalationTimeouts: options.escalationTimeouts || DEFAULT_ESCALATION_TIMEOUTS,
      autoApproveEnabled: options.autoApproveEnabled !== false,
      ...options
    };

    // Start escalation monitor
    this.#startEscalationMonitor();
  }

  // ========================================================================
  // Approval Creation
  // ========================================================================

  /**
   * Create a new approval request for an agent action
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
   */
  async createApproval(data) {
    const {
      companyId,
      type,
      payload,
      requestedByAgentId,
      requestedByUserId,
      priority = 'normal',
      timeout = this.#config.defaultTimeout,
      stakeholders = []
    } = data;

    // Validate required fields
    if (!companyId || !type || !payload) {
      throw new ApprovalError('VALIDATION_ERROR', 'companyId, type, and payload are required');
    }

    if (!requestedByAgentId && !requestedByUserId) {
      throw new ApprovalError('VALIDATION_ERROR', 'Either requestedByAgentId or requestedByUserId is required');
    }

    // Calculate risk level
    const riskLevel = this.#assessRisk(type, payload);
    const riskFactors = this.#identifyRiskFactors(type, payload);

    // Check for auto-approval
    const autoApproveResult = await this.#checkAutoApproval({
      companyId,
      type,
      riskLevel,
      payload,
      requestedByAgentId,
      requestedByUserId
    });

    const id = randomUUID();
    const now = new Date().toISOString();
    const timeoutAt = new Date(Date.now() + timeout * 1000).toISOString();
    const requestedByType = requestedByAgentId ? ActorType.AGENT : ActorType.USER;

    // Create approval record
    this.#db.prepare(`
      INSERT INTO approvals (
        id, company_id, type, status, priority,
        requested_by_agent_id, requested_by_user_id, requested_by_type,
        payload, risk_level, risk_factors, timeout_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      companyId,
      type,
      autoApproveResult.autoApprove ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING,
      priority,
      requestedByAgentId || null,
      requestedByUserId || null,
      requestedByType,
      JSON.stringify(payload),
      riskLevel,
      JSON.stringify(riskFactors),
      timeoutAt,
      now,
      now
    );

    // Add stakeholders
    if (stakeholders.length > 0) {
      this.#addStakeholders(id, stakeholders, 'watcher');
    }

    // Find and add approvers based on policy
    const approvers = await this.#findApprovers(companyId, type, riskLevel);
    if (approvers.length > 0) {
      this.#addStakeholders(id, approvers, 'approver');
    }

    // Audit log
    if (this.#auditEnabled) {
      this.#logAudit(id, 'created', requestedByType, requestedByAgentId || requestedByUserId, {
        type,
        riskLevel,
        autoApproved: autoApproveResult.autoApprove,
        autoApproveReason: autoApproveResult.reason
      });
    }

    const approval = this.getApproval(id);

    // Emit event
    this.emit('approvalCreated', { approval, autoApproved: autoApproveResult.autoApprove });

    // If auto-approved, emit approved event too
    if (autoApproveResult.autoApprove) {
      this.emit('approvalAutoApproved', { approval, reason: autoApproveResult.reason });
    }

    return approval;
  }

  /**
   * Get approval by ID
   * @param {string} id - Approval ID
   * @returns {Object|null} Approval record
   */
  getApproval(id) {
    const approval = this.#db.prepare(`
      SELECT 
        a.*,
        (SELECT json_group_array(json_object(
          'id', s.id,
          'userId', s.user_id,
          'role', s.role,
          'notifiedAt', s.notified_at
        )) FROM approval_stakeholders s WHERE s.approval_id = a.id) as stakeholders,
        (SELECT json_group_array(json_object(
          'id', c.id,
          'authorType', c.author_type,
          'authorId', c.author_id,
          'content', c.content,
          'createdAt', c.created_at
        )) FROM approval_comments c WHERE c.approval_id = a.id ORDER BY c.created_at) as comments
      FROM approvals a
      WHERE a.id = ?
    `).get(id);

    if (!approval) return null;

    // Parse JSON fields
    return this.#parseApproval(approval);
  }

  /**
   * List approvals with filters
   * @param {Object} filters - Query filters
   * @returns {Object[]} Matching approvals
   */
  listApprovals(filters = {}) {
    const {
      companyId,
      status,
      type,
      riskLevel,
      requestedBy,
      limit = 50,
      offset = 0
    } = filters;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (companyId) {
      whereClause += ' AND company_id = ?';
      params.push(companyId);
    }

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (type) {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    if (riskLevel) {
      whereClause += ' AND risk_level = ?';
      params.push(riskLevel);
    }

    if (requestedBy) {
      whereClause += ' AND (requested_by_agent_id = ? OR requested_by_user_id = ?)';
      params.push(requestedBy, requestedBy);
    }

    const approvals = this.#db.prepare(`
      SELECT * FROM approvals
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return approvals.map(a => this.#parseApproval(a));
  }

  // ========================================================================
  // Decision Methods
  // ========================================================================

  /**
   * Approve an approval request
   * @param {string} approvalId - Approval ID
   * @param {Object} options - Approval options
   * @param {string} options.decidedByUserId - User making the decision
   * @param {string} [options.note] - Optional note
   * @returns {Promise<Object>} Updated approval
   */
  async approve(approvalId, options) {
    const { decidedByUserId, note } = options;

    const approval = this.getApproval(approvalId);
    if (!approval) {
      throw new ApprovalError('APPROVAL_NOT_FOUND', `Approval ${approvalId} not found`);
    }

    if (approval.status !== ApprovalStatus.PENDING && approval.status !== ApprovalStatus.ESCALATED) {
      throw new ApprovalError('APPROVAL_ALREADY_DECIDED', `Approval is already ${approval.status}`);
    }

    // Check permissions
    const canApprove = await this.#canUserApprove(decidedByUserId, approval);
    if (!canApprove) {
      throw new ApprovalError('INSUFFICIENT_PERMISSIONS', 'User cannot approve this request');
    }

    const now = new Date().toISOString();

    this.#db.prepare(`
      UPDATE approvals
      SET status = ?, decided_by_user_id = ?, decided_at = ?, decision_note = ?, updated_at = ?
      WHERE id = ?
    `).run(ApprovalStatus.APPROVED, decidedByUserId, now, note || null, now, approvalId);

    // Add comment if note provided
    if (note) {
      await this.addComment(approvalId, {
        authorType: ActorType.USER,
        authorId: decidedByUserId,
        content: note,
        isDecisionNote: true
      });
    }

    // Audit log
    if (this.#auditEnabled) {
      this.#logAudit(approvalId, 'approved', ActorType.USER, decidedByUserId, { note });
    }

    const updated = this.getApproval(approvalId);
    this.emit('approvalApproved', { approval: updated, decidedBy: decidedByUserId });

    return updated;
  }

  /**
   * Reject an approval request
   * @param {string} approvalId - Approval ID
   * @param {Object} options - Rejection options
   * @param {string} options.decidedByUserId - User making the decision
   * @param {string} [options.reason] - Rejection reason
   * @returns {Promise<Object>} Updated approval
   */
  async reject(approvalId, options) {
    const { decidedByUserId, reason } = options;

    const approval = this.getApproval(approvalId);
    if (!approval) {
      throw new ApprovalError('APPROVAL_NOT_FOUND', `Approval ${approvalId} not found`);
    }

    if (approval.status !== ApprovalStatus.PENDING && approval.status !== ApprovalStatus.ESCALATED) {
      throw new ApprovalError('APPROVAL_ALREADY_DECIDED', `Approval is already ${approval.status}`);
    }

    // Check permissions
    const canApprove = await this.#canUserApprove(decidedByUserId, approval);
    if (!canApprove) {
      throw new ApprovalError('INSUFFICIENT_PERMISSIONS', 'User cannot reject this request');
    }

    const now = new Date().toISOString();

    this.#db.prepare(`
      UPDATE approvals
      SET status = ?, decided_by_user_id = ?, decided_at = ?, decision_note = ?, updated_at = ?
      WHERE id = ?
    `).run(ApprovalStatus.REJECTED, decidedByUserId, now, reason || null, now, approvalId);

    // Add comment with rejection reason
    if (reason) {
      await this.addComment(approvalId, {
        authorType: ActorType.USER,
        authorId: decidedByUserId,
        content: `Rejected: ${reason}`,
        isDecisionNote: true
      });
    }

    // Audit log
    if (this.#auditEnabled) {
      this.#logAudit(approvalId, 'rejected', ActorType.USER, decidedByUserId, { reason });
    }

    const updated = this.getApproval(approvalId);
    this.emit('approvalRejected', { approval: updated, decidedBy: decidedByUserId, reason });

    return updated;
  }

  /**
   * Request changes to an approval
   * @param {string} approvalId - Approval ID
   * @param {Object} options - Request options
   * @param {string} options.decidedByUserId - User requesting changes
   * @param {string} options.feedback - Feedback for changes needed
   * @returns {Promise<Object>} Updated approval
   */
  async requestChanges(approvalId, options) {
    const { decidedByUserId, feedback } = options;

    const approval = this.getApproval(approvalId);
    if (!approval) {
      throw new ApprovalError('APPROVAL_NOT_FOUND', `Approval ${approvalId} not found`);
    }

    if (approval.status !== ApprovalStatus.PENDING && approval.status !== ApprovalStatus.ESCALATED) {
      throw new ApprovalError('APPROVAL_ALREADY_DECIDED', `Approval is already ${approval.status}`);
    }

    const now = new Date().toISOString();

    this.#db.prepare(`
      UPDATE approvals
      SET status = ?, decided_by_user_id = ?, decided_at = ?, decision_note = ?, updated_at = ?
      WHERE id = ?
    `).run(ApprovalStatus.CHANGES_REQUESTED, decidedByUserId, now, feedback, now, approvalId);

    // Add comment with detailed feedback
    await this.addComment(approvalId, {
      authorType: ActorType.USER,
      authorId: decidedByUserId,
      content: `Changes requested: ${feedback}`,
      isDecisionNote: true
    });

    // Audit log
    if (this.#auditEnabled) {
      this.#logAudit(approvalId, 'changes_requested', ActorType.USER, decidedByUserId, { feedback });
    }

    const updated = this.getApproval(approvalId);
    this.emit('approvalChangesRequested', { approval: updated, decidedBy: decidedByUserId, feedback });

    return updated;
  }

  // ========================================================================
  // Delegation
  // ========================================================================

  /**
   * Delegate approval authority to another user
   * @param {Object} data - Delegation data
   * @returns {Promise<Object>} Created delegation
   */
  async delegateApproval(data) {
    const {
      companyId,
      delegatorUserId,
      delegateUserId,
      approvalTypes = [],
      riskLevels = [RiskLevel.LOW, RiskLevel.MEDIUM],
      startsAt = new Date(),
      expiresAt,
      createdBy
    } = data;

    if (!companyId || !delegatorUserId || !delegateUserId) {
      throw new ApprovalError('VALIDATION_ERROR', 'companyId, delegatorUserId, and delegateUserId are required');
    }

    if (!expiresAt) {
      throw new ApprovalError('VALIDATION_ERROR', 'expiresAt is required');
    }

    // Check for circular delegation
    const existingDelegation = this.#db.prepare(`
      SELECT * FROM approval_delegations
      WHERE company_id = ? AND delegate_user_id = ? AND delegator_user_id = ?
      AND status = 'active' AND expires_at > datetime('now')
    `).get(companyId, delegatorUserId, delegateUserId);

    if (existingDelegation) {
      throw new ApprovalError('INVALID_DELEGATION', 'Circular delegation detected');
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    this.#db.prepare(`
      INSERT INTO approval_delegations (
        id, company_id, delegator_user_id, delegate_user_id,
        approval_types, risk_levels, starts_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      companyId,
      delegatorUserId,
      delegateUserId,
      JSON.stringify(approvalTypes),
      JSON.stringify(riskLevels),
      startsAt.toISOString(),
      expiresAt.toISOString(),
      now
    );

    const delegation = this.#db.prepare('SELECT * FROM approval_delegations WHERE id = ?').get(id);

    // Audit log
    if (this.#auditEnabled) {
      this.#logAudit(null, 'delegation_created', ActorType.USER, createdBy, {
        delegationId: id,
        delegatorUserId,
        delegateUserId
      });
    }

    this.emit('delegationCreated', { delegation });

    return this.#parseDelegation(delegation);
  }

  /**
   * Revoke a delegation
   * @param {string} delegationId - Delegation ID
   * @param {string} revokedBy - User ID revoking the delegation
   * @returns {Promise<boolean>} True if revoked
   */
  async revokeDelegation(delegationId, revokedBy) {
    const now = new Date().toISOString();

    const result = this.#db.prepare(`
      UPDATE approval_delegations
      SET status = 'revoked', revoked_at = ?, revoked_by = ?
      WHERE id = ? AND status = 'active'
    `).run(now, revokedBy, delegationId);

    if (result.changes === 0) {
      throw new ApprovalError('DELEGATION_NOT_FOUND', 'Active delegation not found');
    }

    // Audit log
    if (this.#auditEnabled) {
      this.#logAudit(null, 'delegation_revoked', ActorType.USER, revokedBy, { delegationId });
    }

    this.emit('delegationRevoked', { delegationId, revokedBy });

    return true;
  }

  /**
   * Get active delegations for a user
   * @param {string} companyId - Company ID
   * @param {string} userId - User ID
   * @returns {Object[]} Active delegations
   */
  getActiveDelegations(companyId, userId) {
    const delegations = this.#db.prepare(`
      SELECT * FROM approval_delegations
      WHERE company_id = ? AND delegate_user_id = ?
      AND status = 'active' AND starts_at <= datetime('now') AND expires_at > datetime('now')
    `).all(companyId, userId);

    return delegations.map(d => this.#parseDelegation(d));
  }

  // ========================================================================
  // Comments
  // ========================================================================

  /**
   * Add a comment to an approval
   * @param {string} approvalId - Approval ID
   * @param {Object} data - Comment data
   * @returns {Promise<Object>} Created comment
   */
  async addComment(approvalId, data) {
    const { authorType, authorId, content, parentCommentId, isDecisionNote = false } = data;

    const approval = this.getApproval(approvalId);
    if (!approval) {
      throw new ApprovalError('APPROVAL_NOT_FOUND', `Approval ${approvalId} not found`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    this.#db.prepare(`
      INSERT INTO approval_comments (id, approval_id, author_type, author_id, content, parent_comment_id, is_decision_note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, approvalId, authorType, authorId, content, parentCommentId || null, isDecisionNote ? 1 : 0, now);

    const comment = this.#db.prepare('SELECT * FROM approval_comments WHERE id = ?').get(id);

    // Notify stakeholders (in real implementation, this would send notifications)
    this.emit('commentAdded', { approvalId, comment });

    return comment;
  }

  // ========================================================================
  // Policy Management
  // ========================================================================

  /**
   * Create an approval policy
   * @param {Object} data - Policy data
   * @returns {Promise<Object>} Created policy
   */
  async createPolicy(data) {
    const {
      companyId,
      name,
      description,
      approvalType,
      riskLevels = [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL],
      minApprovers = 1,
      requireSpecificRoles = [],
      requireSpecificUsers = [],
      autoApprove = false,
      autoApproveConditions = null,
      escalationTimeout = 3600,
      escalationTargets = [],
      maxEscalationLevel = 2,
      priority = 0
    } = data;

    const id = randomUUID();
    const now = new Date().toISOString();

    this.#db.prepare(`
      INSERT INTO approval_policies (
        id, company_id, name, description, approval_type, risk_levels,
        min_approvers, require_specific_roles, require_specific_users,
        auto_approve, auto_approve_conditions, escalation_timeout,
        escalation_targets, max_escalation_level, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, companyId, name, description, approvalType || null, JSON.stringify(riskLevels),
      minApprovers, JSON.stringify(requireSpecificRoles), JSON.stringify(requireSpecificUsers),
      autoApprove ? 1 : 0, autoApproveConditions ? JSON.stringify(autoApproveConditions) : null,
      escalationTimeout, JSON.stringify(escalationTargets), maxEscalationLevel, priority, now, now
    );

    return this.getPolicy(id);
  }

  /**
   * Get policy by ID
   * @param {string} id - Policy ID
   * @returns {Object|null} Policy record
   */
  getPolicy(id) {
    const policy = this.#db.prepare('SELECT * FROM approval_policies WHERE id = ?').get(id);
    if (!policy) return null;
    return this.#parsePolicy(policy);
  }

  /**
   * List policies for a company
   * @param {string} companyId - Company ID
   * @returns {Object[]} Policies
   */
  listPolicies(companyId) {
    const policies = this.#db.prepare(`
      SELECT * FROM approval_policies
      WHERE company_id = ? AND is_active = 1
      ORDER BY priority DESC, created_at ASC
    `).all(companyId);

    return policies.map(p => this.#parsePolicy(p));
  }

  /**
   * Check approval policy to determine if approval is needed
   * @param {Object} request - Request data
   * @returns {Promise<Object>} Policy check result
   */
  async checkApprovalPolicy(request) {
    const { companyId, type, riskLevel = RiskLevel.MEDIUM, payload, actorId, actorType } = request;

    // Get all active policies for company
    const policies = this.listPolicies(companyId);

    // Find matching policies
    const matchingPolicies = policies.filter(policy => {
      // Check if policy applies to this approval type
      if (policy.approvalType && policy.approvalType !== type) {
        return false;
      }

      // Check if policy applies to this risk level
      if (!policy.riskLevels.includes(riskLevel)) {
        return false;
      }

      return true;
    });

    if (matchingPolicies.length === 0) {
      // No matching policy - use default behavior (require approval for medium+ risk)
      const requiresApproval = riskLevel !== RiskLevel.LOW;
      return {
        requiresApproval,
        autoApprove: !requiresApproval,
        matchingPolicy: null,
        approvers: [],
        minApprovers: 1,
        reason: requiresApproval ? 'No matching policy, default requires approval' : 'Low risk, no approval required'
      };
    }

    // Get highest priority matching policy
    const policy = matchingPolicies[0];

    // Check auto-approve conditions
    if (policy.autoApprove && policy.autoApproveConditions) {
      const conditionsMet = this.#evaluateAutoApproveConditions(policy.autoApproveConditions, payload);
      if (conditionsMet) {
        return {
          requiresApproval: false,
          autoApprove: true,
          matchingPolicy: policy,
          approvers: [],
          minApprovers: 0,
          reason: 'Auto-approve conditions met'
        };
      }
    }

    // Find approvers
    const approvers = await this.#findApproversByPolicy(policy);

    return {
      requiresApproval: true,
      autoApprove: false,
      matchingPolicy: policy,
      approvers,
      minApprovers: policy.minApprovers,
      escalationTimeout: policy.escalationTimeout,
      escalationTargets: policy.escalationTargets
    };
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  #assessRisk(type, payload) {
    // Simple risk assessment based on type and payload
    const riskScores = {
      [ApprovalType.CODE_CHANGE]: 2,
      [ApprovalType.FILE_DELETE]: 3,
      [ApprovalType.SYSTEM_COMMAND]: 4,
      [ApprovalType.DEPLOYMENT]: 4,
      [ApprovalType.CONFIG_CHANGE]: 3,
      [ApprovalType.ACCESS_GRANT]: 4,
      [ApprovalType.AGENT_ACTION]: 2,
      [ApprovalType.COST_THRESHOLD]: 2
    };

    let score = riskScores[type] || 2;

    // Adjust based on payload
    if (payload.estimatedImpact) {
      if (payload.estimatedImpact === 'high') score += 2;
      if (payload.estimatedImpact === 'critical') score += 3;
    }

    if (payload.affectedSystems) {
      score += Math.min(payload.affectedSystems.length, 2);
    }

    // Map score to risk level
    if (score <= 1) return RiskLevel.LOW;
    if (score <= 3) return RiskLevel.MEDIUM;
    if (score <= 5) return RiskLevel.HIGH;
    return RiskLevel.CRITICAL;
  }

  #identifyRiskFactors(type, payload) {
    const factors = [];

    if (type === ApprovalType.FILE_DELETE) {
      factors.push('file_deletion');
    }

    if (type === ApprovalType.SYSTEM_COMMAND) {
      factors.push('system_command_execution');
    }

    if (payload?.target?.includes('production') || payload?.target?.includes('prod')) {
      factors.push('production_target');
    }

    if (payload?.estimatedCost > 100) {
      factors.push('high_cost');
    }

    if (payload?.requiresSudo || payload?.requiresAdmin) {
      factors.push('elevated_privileges');
    }

    return factors;
  }

  async #checkAutoApproval(request) {
    if (!this.#config.autoApproveEnabled) {
      return { autoApprove: false, reason: 'Auto-approval disabled' };
    }

    const policyCheck = await this.checkApprovalPolicy(request);

    return {
      autoApprove: policyCheck.autoApprove,
      reason: policyCheck.reason
    };
  }

  async #findApprovers(companyId, type, riskLevel) {
    // Get policies that apply
    const policies = this.listPolicies(companyId);
    const matchingPolicy = policies.find(p => 
      (!p.approvalType || p.approvalType === type) &&
      p.riskLevels.includes(riskLevel)
    );

    if (!matchingPolicy) {
      // Default: find company admins
      const admins = this.#db.prepare(`
        SELECT user_id FROM company_members
        WHERE company_id = ? AND role IN ('owner', 'admin')
      `).all(companyId);

      return admins.map(a => a.user_id);
    }

    return this.#findApproversByPolicy(matchingPolicy);
  }

  async #findApproversByPolicy(policy) {
    const approvers = new Set();

    // Add specific users
    if (policy.requireSpecificUsers?.length > 0) {
      policy.requireSpecificUsers.forEach(id => approvers.add(id));
    }

    // Add users with specific roles
    if (policy.requireSpecificRoles?.length > 0) {
      const roleUsers = this.#db.prepare(`
        SELECT user_id FROM company_members
        WHERE company_id = ? AND role IN (${policy.requireSpecificRoles.map(() => '?').join(',')})
      `).all(policy.companyId, ...policy.requireSpecificRoles);

      roleUsers.forEach(u => approvers.add(u.user_id));
    }

    // If no specific requirements, default to company admins
    if (approvers.size === 0) {
      const admins = this.#db.prepare(`
        SELECT user_id FROM company_members
        WHERE company_id = ? AND role IN ('owner', 'admin')
      `).all(policy.companyId);

      admins.forEach(a => approvers.add(a.user_id));
    }

    return Array.from(approvers);
  }

  async #canUserApprove(userId, approval) {
    // Check if user is an approver for this approval
    const stakeholder = this.#db.prepare(`
      SELECT * FROM approval_stakeholders
      WHERE approval_id = ? AND user_id = ? AND role = 'approver'
    `).get(approval.id, userId);

    if (stakeholder) return true;

    // Check for active delegation
    const delegation = this.#db.prepare(`
      SELECT * FROM approval_delegations
      WHERE company_id = ? AND delegate_user_id = ? AND status = 'active'
      AND starts_at <= datetime('now') AND expires_at > datetime('now')
      AND (json_array_length(approval_types) = 0 OR approval_types LIKE ?)
      AND risk_levels LIKE ?
    `).get(approval.companyId, userId, `%${approval.type}%`, `%${approval.riskLevel}%`);

    if (delegation) return true;

    // Check if user is company admin
    const admin = this.#db.prepare(`
      SELECT * FROM company_members
      WHERE company_id = ? AND user_id = ? AND role IN ('owner', 'admin')
    `).get(approval.companyId, userId);

    return !!admin;
  }

  #evaluateAutoApproveConditions(conditions, payload) {
    // Simple condition evaluation
    if (conditions.maxEstimatedCost && payload.estimatedCost > conditions.maxEstimatedCost) {
      return false;
    }

    if (conditions.allowedTargets && payload.target) {
      const allowed = conditions.allowedTargets.some(t => payload.target.includes(t));
      if (!allowed) return false;
    }

    if (conditions.blockedTargets && payload.target) {
      const blocked = conditions.blockedTargets.some(t => payload.target.includes(t));
      if (blocked) return false;
    }

    return true;
  }

  #addStakeholders(approvalId, userIds, role) {
    const stmt = this.#db.prepare(`
      INSERT OR IGNORE INTO approval_stakeholders (id, approval_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();

    for (const userId of userIds) {
      stmt.run(randomUUID(), approvalId, userId, role, now);
    }
  }

  #logAudit(approvalId, action, actorType, actorId, details = {}) {
    this.#db.prepare(`
      INSERT INTO approval_audit_log (id, approval_id, action, actor_type, actor_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), approvalId, action, actorType, actorId, JSON.stringify(details), new Date().toISOString());
  }

  #startEscalationMonitor() {
    // Check for escalations every minute
    this.#escalationInterval = setInterval(() => {
      this.#processEscalations();
    }, 60000);

    if (typeof this.#escalationInterval.unref === 'function') {
      this.#escalationInterval.unref();
    }
  }

  #processEscalations() {
    const now = new Date().toISOString();

    // Find pending approvals that need escalation
    const pendingApprovals = this.#db.prepare(`
      SELECT * FROM approvals
      WHERE status = 'pending' AND timeout_at > ?
    `).all(now);

    for (const approval of pendingApprovals) {
      const policy = this.checkApprovalPolicy({
        companyId: approval.company_id,
        type: approval.type,
        riskLevel: approval.risk_level
      });

      const escalationTimeout = policy.escalationTimeout || this.#config.escalationTimeouts[approval.escalation_level || 0];
      const shouldEscalate = new Date(approval.created_at).getTime() + (escalationTimeout * 1000) < Date.now();

      if (shouldEscalate && approval.escalation_level < (policy.maxEscalationLevel || this.#config.maxEscalationLevel)) {
        this.#escalateApproval(approval);
      }
    }

    // Mark expired approvals
    this.#db.prepare(`
      UPDATE approvals
      SET status = 'expired', updated_at = ?
      WHERE status = 'pending' AND timeout_at <= ?
    `).run(now, now);
  }

  #escalateApproval(approval) {
    const newLevel = (approval.escalation_level || 0) + 1;
    const now = new Date().toISOString();

    this.#db.prepare(`
      UPDATE approvals
      SET escalation_level = ?, escalated_at = ?, updated_at = ?
      WHERE id = ?
    `).run(newLevel, now, now, approval.id);

    // Get escalation targets
    const policy = this.checkApprovalPolicy({
      companyId: approval.company_id,
      type: approval.type,
      riskLevel: approval.risk_level
    });

    const targets = policy.escalationTargets || [];
    if (targets.length > 0) {
      this.#addStakeholders(approval.id, targets, 'approver');
    }

    // Audit log
    if (this.#auditEnabled) {
      this.#logAudit(approval.id, 'escalated', ActorType.SYSTEM, 'system', { newLevel });
    }

    this.emit('approvalEscalated', { approvalId: approval.id, newLevel });
  }

  #parseApproval(row) {
    if (!row) return null;

    return {
      ...row,
      payload: JSON.parse(row.payload || '{}'),
      riskFactors: JSON.parse(row.risk_factors || '[]'),
      stakeholders: JSON.parse(row.stakeholders || '[]'),
      comments: JSON.parse(row.comments || '[]')
    };
  }

  #parseDelegation(row) {
    if (!row) return null;

    return {
      ...row,
      approvalTypes: JSON.parse(row.approval_types || '[]'),
      riskLevels: JSON.parse(row.risk_levels || '[]')
    };
  }

  #parsePolicy(row) {
    if (!row) return null;

    return {
      ...row,
      riskLevels: JSON.parse(row.risk_levels || '[]'),
      requireSpecificRoles: JSON.parse(row.require_specific_roles || '[]'),
      requireSpecificUsers: JSON.parse(row.require_specific_users || '[]'),
      autoApproveConditions: row.auto_approve_conditions ? JSON.parse(row.auto_approve_conditions) : null,
      escalationTargets: JSON.parse(row.escalation_targets || '[]')
    };
  }

  /**
   * Dispose the service
   */
  dispose() {
    if (this.#escalationInterval) {
      clearInterval(this.#escalationInterval);
      this.#escalationInterval = null;
    }
    this.removeAllListeners();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let serviceInstance = null;

export function getApprovalService(options = {}) {
  if (!serviceInstance && options.db) {
    serviceInstance = new ApprovalService(options);
  }
  return serviceInstance;
}

export function resetApprovalService() {
  if (serviceInstance) {
    serviceInstance.dispose();
    serviceInstance = null;
  }
}

export default ApprovalService;
