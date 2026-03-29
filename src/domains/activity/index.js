/**
 * @fileoverview Activity Domain - Activity logging and auditing for CogniMesh
 * @module domains/activity
 * @version 5.0.0
 */

export {
  ActivityService,
  getActivityService,
  resetActivityService,
  AUTH_ACTIVITIES,
  DATA_ACTIVITIES,
  ADMIN_ACTIVITIES,
  AGENT_ACTIVITIES,
  SECURITY_ACTIVITIES,
  SYSTEM_ACTIVITIES
} from './activity-service.js';

// Re-export middleware functions for convenience
export {
  activityLogger,
  logAuthEvent,
  logDataChange,
  logAgentEvent,
  logSecurityEvent,
  createActivityLogger
} from '../../middleware/activity-logger.js';
