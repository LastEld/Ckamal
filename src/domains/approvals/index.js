/**
 * @fileoverview Approval Workflow Domain
 * Approval workflows for agent actions
 * @module domains/approvals
 * @version 5.0.0
 */

export {
  ApprovalService,
  getApprovalService,
  resetApprovalService,
  ApprovalStatus,
  ApprovalType,
  RiskLevel,
  ActorType,
  ApprovalError
} from './approval-service.js';

export {
  ApprovalMiddleware,
  createApprovalMiddleware,
  requireApproval,
  requireApprover,
  withApprovalCheck,
  createApprovalRoutes
} from './approval-middleware.js';
