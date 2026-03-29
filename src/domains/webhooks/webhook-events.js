/**
 * @fileoverview Webhook Events - Event types and payload schemas
 * @module domains/webhooks/webhook-events
 * @description Defines all webhook event types and their payload schemas for the Ckamal webhook system
 * @version 5.0.0
 */

/**
 * Webhook event types enum
 * @readonly
 * @enum {string}
 */
export const WebhookEventType = {
  // Task events
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  TASK_CANCELLED: 'task.cancelled',
  TASK_UPDATED: 'task.updated',

  // Agent events
  AGENT_SPAWNED: 'agent.spawned',
  AGENT_TERMINATED: 'agent.terminated',
  AGENT_STATUS_CHANGED: 'agent.status_changed',
  AGENT_ERROR: 'agent.error',

  // Issue events
  ISSUE_CREATED: 'issue.created',
  ISSUE_UPDATED: 'issue.updated',
  ISSUE_CLOSED: 'issue.closed',
  ISSUE_REOPENED: 'issue.reopened',

  // Approval events
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_DECIDED: 'approval.decided',
  APPROVAL_ESCALATED: 'approval.escalated',
  APPROVAL_CANCELLED: 'approval.cancelled',

  // Cost events
  COST_BUDGET_EXCEEDED: 'cost.budget_exceeded',
  COST_THRESHOLD_REACHED: 'cost.threshold_reached',
  COST_ANOMALY_DETECTED: 'cost.anomaly_detected',

  // Heartbeat events
  HEARTBEAT_RUN_COMPLETED: 'heartbeat.run.completed',
  HEARTBEAT_RUN_FAILED: 'heartbeat.run.failed',
  HEARTBEAT_SESSION_STARTED: 'heartbeat.session.started',
  HEARTBEAT_SESSION_ENDED: 'heartbeat.session.ended',

  // Routine events
  ROUTINE_TRIGGERED: 'routine.triggered',
  ROUTINE_COMPLETED: 'routine.completed',
  ROUTINE_FAILED: 'routine.failed',

  // System events
  SYSTEM_MAINTENANCE: 'system.maintenance',
  SYSTEM_ALERT: 'system.alert',
  SYSTEM_BACKUP_COMPLETED: 'system.backup_completed'
};

/**
 * Event category groups for filtering
 * @readonly
 * @enum {string}
 */
export const EventCategory = {
  TASKS: 'tasks',
  AGENTS: 'agents',
  ISSUES: 'issues',
  APPROVALS: 'approvals',
  COSTS: 'costs',
  HEARTBEAT: 'heartbeat',
  ROUTINES: 'routines',
  SYSTEM: 'system'
};

/**
 * Maps event types to their categories
 * @type {Object<WebhookEventType, EventCategory>}
 */
export const EventTypeToCategory = {
  [WebhookEventType.TASK_CREATED]: EventCategory.TASKS,
  [WebhookEventType.TASK_COMPLETED]: EventCategory.TASKS,
  [WebhookEventType.TASK_FAILED]: EventCategory.TASKS,
  [WebhookEventType.TASK_CANCELLED]: EventCategory.TASKS,
  [WebhookEventType.TASK_UPDATED]: EventCategory.TASKS,

  [WebhookEventType.AGENT_SPAWNED]: EventCategory.AGENTS,
  [WebhookEventType.AGENT_TERMINATED]: EventCategory.AGENTS,
  [WebhookEventType.AGENT_STATUS_CHANGED]: EventCategory.AGENTS,
  [WebhookEventType.AGENT_ERROR]: EventCategory.AGENTS,

  [WebhookEventType.ISSUE_CREATED]: EventCategory.ISSUES,
  [WebhookEventType.ISSUE_UPDATED]: EventCategory.ISSUES,
  [WebhookEventType.ISSUE_CLOSED]: EventCategory.ISSUES,
  [WebhookEventType.ISSUE_REOPENED]: EventCategory.ISSUES,

  [WebhookEventType.APPROVAL_REQUESTED]: EventCategory.APPROVALS,
  [WebhookEventType.APPROVAL_DECIDED]: EventCategory.APPROVALS,
  [WebhookEventType.APPROVAL_ESCALATED]: EventCategory.APPROVALS,
  [WebhookEventType.APPROVAL_CANCELLED]: EventCategory.APPROVALS,

  [WebhookEventType.COST_BUDGET_EXCEEDED]: EventCategory.COSTS,
  [WebhookEventType.COST_THRESHOLD_REACHED]: EventCategory.COSTS,
  [WebhookEventType.COST_ANOMALY_DETECTED]: EventCategory.COSTS,

  [WebhookEventType.HEARTBEAT_RUN_COMPLETED]: EventCategory.HEARTBEAT,
  [WebhookEventType.HEARTBEAT_RUN_FAILED]: EventCategory.HEARTBEAT,
  [WebhookEventType.HEARTBEAT_SESSION_STARTED]: EventCategory.HEARTBEAT,
  [WebhookEventType.HEARTBEAT_SESSION_ENDED]: EventCategory.HEARTBEAT,

  [WebhookEventType.ROUTINE_TRIGGERED]: EventCategory.ROUTINES,
  [WebhookEventType.ROUTINE_COMPLETED]: EventCategory.ROUTINES,
  [WebhookEventType.ROUTINE_FAILED]: EventCategory.ROUTINES,

  [WebhookEventType.SYSTEM_MAINTENANCE]: EventCategory.SYSTEM,
  [WebhookEventType.SYSTEM_ALERT]: EventCategory.SYSTEM,
  [WebhookEventType.SYSTEM_BACKUP_COMPLETED]: EventCategory.SYSTEM
};

/**
 * Event payload schemas for validation
 * @type {Object<WebhookEventType, Object>}
 */
export const EventPayloadSchemas = {
  [WebhookEventType.TASK_CREATED]: {
    required: ['taskId', 'taskType', 'status', 'createdAt'],
    types: {
      taskId: 'string',
      taskType: 'string',
      title: 'string',
      description: 'string',
      status: 'string',
      priority: 'string',
      assigneeId: 'string',
      assigneeType: 'string',
      createdBy: 'string',
      createdAt: 'string',
      metadata: 'object'
    }
  },

  [WebhookEventType.TASK_COMPLETED]: {
    required: ['taskId', 'status', 'completedAt'],
    types: {
      taskId: 'string',
      status: 'string',
      result: 'object',
      outputData: 'object',
      durationMs: 'number',
      completedAt: 'string',
      completedBy: 'string'
    }
  },

  [WebhookEventType.TASK_FAILED]: {
    required: ['taskId', 'status', 'error', 'failedAt'],
    types: {
      taskId: 'string',
      status: 'string',
      error: 'object',
      errorMessage: 'string',
      errorCode: 'string',
      failedAt: 'string',
      attemptNumber: 'number',
      maxAttempts: 'number'
    }
  },

  [WebhookEventType.TASK_CANCELLED]: {
    required: ['taskId', 'status', 'cancelledAt'],
    types: {
      taskId: 'string',
      status: 'string',
      reason: 'string',
      cancelledBy: 'string',
      cancelledAt: 'string'
    }
  },

  [WebhookEventType.TASK_UPDATED]: {
    required: ['taskId', 'changes', 'updatedAt'],
    types: {
      taskId: 'string',
      changes: 'object',
      previousValues: 'object',
      updatedBy: 'string',
      updatedAt: 'string'
    }
  },

  [WebhookEventType.AGENT_SPAWNED]: {
    required: ['agentId', 'agentType', 'status', 'spawnedAt'],
    types: {
      agentId: 'string',
      agentType: 'string',
      agentName: 'string',
      status: 'string',
      sessionId: 'string',
      spawnedBy: 'string',
      spawnedAt: 'string',
      configuration: 'object'
    }
  },

  [WebhookEventType.AGENT_TERMINATED]: {
    required: ['agentId', 'status', 'terminatedAt'],
    types: {
      agentId: 'string',
      agentType: 'string',
      status: 'string',
      sessionId: 'string',
      reason: 'string',
      exitCode: 'number',
      durationMs: 'number',
      terminatedAt: 'string',
      tasksCompleted: 'number'
    }
  },

  [WebhookEventType.AGENT_STATUS_CHANGED]: {
    required: ['agentId', 'previousStatus', 'newStatus', 'changedAt'],
    types: {
      agentId: 'string',
      previousStatus: 'string',
      newStatus: 'string',
      reason: 'string',
      changedAt: 'string'
    }
  },

  [WebhookEventType.AGENT_ERROR]: {
    required: ['agentId', 'error', 'occurredAt'],
    types: {
      agentId: 'string',
      error: 'object',
      errorType: 'string',
      errorMessage: 'string',
      stackTrace: 'string',
      context: 'object',
      occurredAt: 'string'
    }
  },

  [WebhookEventType.ISSUE_CREATED]: {
    required: ['issueId', 'title', 'status', 'createdAt'],
    types: {
      issueId: 'string',
      title: 'string',
      description: 'string',
      status: 'string',
      priority: 'string',
      severity: 'string',
      category: 'string',
      createdBy: 'string',
      createdAt: 'string',
      assignedTo: 'string',
      labels: 'array',
      metadata: 'object'
    }
  },

  [WebhookEventType.ISSUE_UPDATED]: {
    required: ['issueId', 'changes', 'updatedAt'],
    types: {
      issueId: 'string',
      changes: 'object',
      previousValues: 'object',
      updatedBy: 'string',
      updatedAt: 'string',
      comment: 'string'
    }
  },

  [WebhookEventType.ISSUE_CLOSED]: {
    required: ['issueId', 'status', 'resolution', 'closedAt'],
    types: {
      issueId: 'string',
      status: 'string',
      resolution: 'string',
      closedBy: 'string',
      closedAt: 'string',
      timeToResolution: 'number'
    }
  },

  [WebhookEventType.ISSUE_REOPENED]: {
    required: ['issueId', 'status', 'reason', 'reopenedAt'],
    types: {
      issueId: 'string',
      status: 'string',
      reason: 'string',
      reopenedBy: 'string',
      reopenedAt: 'string'
    }
  },

  [WebhookEventType.APPROVAL_REQUESTED]: {
    required: ['approvalId', 'requestType', 'status', 'requestedAt'],
    types: {
      approvalId: 'string',
      requestType: 'string',
      title: 'string',
      description: 'string',
      status: 'string',
      priority: 'string',
      requesterId: 'string',
      requesterType: 'string',
      requestedAt: 'string',
      approvers: 'array',
      timeoutAt: 'string',
      context: 'object',
      metadata: 'object'
    }
  },

  [WebhookEventType.APPROVAL_DECIDED]: {
    required: ['approvalId', 'decision', 'decidedAt'],
    types: {
      approvalId: 'string',
      decision: 'string',
      status: 'string',
      decidedBy: 'string',
      decidedAt: 'string',
      reason: 'string',
      context: 'object'
    }
  },

  [WebhookEventType.APPROVAL_ESCALATED]: {
    required: ['approvalId', 'escalationLevel', 'escalatedAt'],
    types: {
      approvalId: 'string',
      escalationLevel: 'number',
      previousLevel: 'number',
      reason: 'string',
      escalatedBy: 'string',
      escalatedAt: 'string',
      newApprovers: 'array'
    }
  },

  [WebhookEventType.APPROVAL_CANCELLED]: {
    required: ['approvalId', 'reason', 'cancelledAt'],
    types: {
      approvalId: 'string',
      reason: 'string',
      cancelledBy: 'string',
      cancelledAt: 'string'
    }
  },

  [WebhookEventType.COST_BUDGET_EXCEEDED]: {
    required: ['budgetId', 'budgetName', 'currentAmount', 'budgetLimit', 'exceededAt'],
    types: {
      budgetId: 'string',
      budgetName: 'string',
      budgetType: 'string',
      currentAmount: 'number',
      budgetLimit: 'number',
      exceededBy: 'number',
      percentageUsed: 'number',
      period: 'string',
      exceededAt: 'string',
      projectedOverage: 'number'
    }
  },

  [WebhookEventType.COST_THRESHOLD_REACHED]: {
    required: ['thresholdId', 'thresholdName', 'currentAmount', 'thresholdValue', 'reachedAt'],
    types: {
      thresholdId: 'string',
      thresholdName: 'string',
      thresholdType: 'string',
      currentAmount: 'number',
      thresholdValue: 'number',
      percentageReached: 'number',
      period: 'string',
      reachedAt: 'string'
    }
  },

  [WebhookEventType.COST_ANOMALY_DETECTED]: {
    required: ['anomalyId', 'anomalyType', 'severity', 'detectedAt'],
    types: {
      anomalyId: 'string',
      anomalyType: 'string',
      severity: 'string',
      description: 'string',
      expectedAmount: 'number',
      actualAmount: 'number',
      deviation: 'number',
      affectedServices: 'array',
      detectedAt: 'string'
    }
  },

  [WebhookEventType.HEARTBEAT_RUN_COMPLETED]: {
    required: ['runId', 'sessionId', 'status', 'completedAt'],
    types: {
      runId: 'string',
      sessionId: 'string',
      agentId: 'string',
      status: 'string',
      durationMs: 'number',
      tokensUsed: 'object',
      cost: 'number',
      completedAt: 'string',
      output: 'object',
      metadata: 'object'
    }
  },

  [WebhookEventType.HEARTBEAT_RUN_FAILED]: {
    required: ['runId', 'sessionId', 'error', 'failedAt'],
    types: {
      runId: 'string',
      sessionId: 'string',
      agentId: 'string',
      error: 'object',
      errorType: 'string',
      errorMessage: 'string',
      failedAt: 'string',
      attemptNumber: 'number'
    }
  },

  [WebhookEventType.HEARTBEAT_SESSION_STARTED]: {
    required: ['sessionId', 'agentId', 'startedAt'],
    types: {
      sessionId: 'string',
      agentId: 'string',
      agentType: 'string',
      startedBy: 'string',
      startedAt: 'string',
      configuration: 'object'
    }
  },

  [WebhookEventType.HEARTBEAT_SESSION_ENDED]: {
    required: ['sessionId', 'agentId', 'endedAt'],
    types: {
      sessionId: 'string',
      agentId: 'string',
      reason: 'string',
      durationMs: 'number',
      runsCompleted: 'number',
      runsFailed: 'number',
      totalCost: 'number',
      endedAt: 'string'
    }
  },

  [WebhookEventType.ROUTINE_TRIGGERED]: {
    required: ['routineId', 'triggerId', 'runId', 'triggeredAt'],
    types: {
      routineId: 'string',
      routineName: 'string',
      triggerId: 'string',
      triggerType: 'string',
      runId: 'string',
      triggeredBy: 'string',
      triggeredAt: 'string',
      payload: 'object'
    }
  },

  [WebhookEventType.ROUTINE_COMPLETED]: {
    required: ['routineId', 'runId', 'status', 'completedAt'],
    types: {
      routineId: 'string',
      routineName: 'string',
      runId: 'string',
      status: 'string',
      durationMs: 'number',
      output: 'object',
      completedAt: 'string'
    }
  },

  [WebhookEventType.ROUTINE_FAILED]: {
    required: ['routineId', 'runId', 'error', 'failedAt'],
    types: {
      routineId: 'string',
      routineName: 'string',
      runId: 'string',
      error: 'object',
      errorMessage: 'string',
      attemptNumber: 'number',
      maxAttempts: 'number',
      failedAt: 'string'
    }
  },

  [WebhookEventType.SYSTEM_MAINTENANCE]: {
    required: ['maintenanceId', 'maintenanceType', 'status', 'scheduledAt'],
    types: {
      maintenanceId: 'string',
      maintenanceType: 'string',
      description: 'string',
      status: 'string',
      scheduledAt: 'string',
      estimatedDuration: 'number',
      affectedServices: 'array'
    }
  },

  [WebhookEventType.SYSTEM_ALERT]: {
    required: ['alertId', 'alertType', 'severity', 'message', 'createdAt'],
    types: {
      alertId: 'string',
      alertType: 'string',
      severity: 'string',
      message: 'string',
      details: 'object',
      source: 'string',
      createdAt: 'string',
      acknowledged: 'boolean'
    }
  },

  [WebhookEventType.SYSTEM_BACKUP_COMPLETED]: {
    required: ['backupId', 'backupType', 'status', 'completedAt'],
    types: {
      backupId: 'string',
      backupType: 'string',
      status: 'string',
      sizeBytes: 'number',
      durationMs: 'number',
      location: 'string',
      checksum: 'string',
      completedAt: 'string'
    }
  }
};

/**
 * Get all event types as an array
 * @returns {string[]} Array of event type strings
 */
export function getAllEventTypes() {
  return Object.values(WebhookEventType);
}

/**
 * Get event types by category
 * @param {EventCategory} category - Event category
 * @returns {string[]} Array of event types in the category
 */
export function getEventTypesByCategory(category) {
  return Object.entries(EventTypeToCategory)
    .filter(([_, cat]) => cat === category)
    .map(([type]) => type);
}

/**
 * Get category for an event type
 * @param {WebhookEventType} eventType - Event type
 * @returns {EventCategory|null} Event category or null if not found
 */
export function getCategoryForEventType(eventType) {
  return EventTypeToCategory[eventType] || null;
}

/**
 * Validate event payload against schema
 * @param {WebhookEventType} eventType - Event type
 * @param {Object} payload - Event payload to validate
 * @returns {Object} Validation result { valid: boolean, errors?: string[] }
 */
export function validateEventPayload(eventType, payload) {
  const schema = EventPayloadSchemas[eventType];
  if (!schema) {
    return { valid: false, errors: [`Unknown event type: ${eventType}`] };
  }

  const errors = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (payload[field] === undefined || payload[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check types
  if (schema.types) {
    for (const [field, expectedType] of Object.entries(schema.types)) {
      if (payload[field] !== undefined && payload[field] !== null) {
        const actualType = Array.isArray(payload[field]) ? 'array' : typeof payload[field];
        if (actualType !== expectedType) {
          errors.push(`Field ${field} must be of type ${expectedType}, got ${actualType}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Check if an event type is valid
 * @param {string} eventType - Event type to check
 * @returns {boolean} True if valid
 */
export function isValidEventType(eventType) {
  return Object.values(WebhookEventType).includes(eventType);
}

/**
 * Get event type description
 * @param {WebhookEventType} eventType - Event type
 * @returns {string} Human-readable description
 */
export function getEventTypeDescription(eventType) {
  const descriptions = {
    [WebhookEventType.TASK_CREATED]: 'Triggered when a new task is created',
    [WebhookEventType.TASK_COMPLETED]: 'Triggered when a task completes successfully',
    [WebhookEventType.TASK_FAILED]: 'Triggered when a task fails',
    [WebhookEventType.TASK_CANCELLED]: 'Triggered when a task is cancelled',
    [WebhookEventType.TASK_UPDATED]: 'Triggered when a task is updated',
    [WebhookEventType.AGENT_SPAWNED]: 'Triggered when an agent is spawned',
    [WebhookEventType.AGENT_TERMINATED]: 'Triggered when an agent terminates',
    [WebhookEventType.AGENT_STATUS_CHANGED]: 'Triggered when an agent status changes',
    [WebhookEventType.AGENT_ERROR]: 'Triggered when an agent encounters an error',
    [WebhookEventType.ISSUE_CREATED]: 'Triggered when an issue is created',
    [WebhookEventType.ISSUE_UPDATED]: 'Triggered when an issue is updated',
    [WebhookEventType.ISSUE_CLOSED]: 'Triggered when an issue is closed',
    [WebhookEventType.ISSUE_REOPENED]: 'Triggered when an issue is reopened',
    [WebhookEventType.APPROVAL_REQUESTED]: 'Triggered when an approval is requested',
    [WebhookEventType.APPROVAL_DECIDED]: 'Triggered when an approval decision is made',
    [WebhookEventType.APPROVAL_ESCALATED]: 'Triggered when an approval is escalated',
    [WebhookEventType.APPROVAL_CANCELLED]: 'Triggered when an approval is cancelled',
    [WebhookEventType.COST_BUDGET_EXCEEDED]: 'Triggered when a budget is exceeded',
    [WebhookEventType.COST_THRESHOLD_REACHED]: 'Triggered when a cost threshold is reached',
    [WebhookEventType.COST_ANOMALY_DETECTED]: 'Triggered when a cost anomaly is detected',
    [WebhookEventType.HEARTBEAT_RUN_COMPLETED]: 'Triggered when a heartbeat run completes',
    [WebhookEventType.HEARTBEAT_RUN_FAILED]: 'Triggered when a heartbeat run fails',
    [WebhookEventType.HEARTBEAT_SESSION_STARTED]: 'Triggered when a heartbeat session starts',
    [WebhookEventType.HEARTBEAT_SESSION_ENDED]: 'Triggered when a heartbeat session ends',
    [WebhookEventType.ROUTINE_TRIGGERED]: 'Triggered when a routine is triggered',
    [WebhookEventType.ROUTINE_COMPLETED]: 'Triggered when a routine completes',
    [WebhookEventType.ROUTINE_FAILED]: 'Triggered when a routine fails',
    [WebhookEventType.SYSTEM_MAINTENANCE]: 'Triggered for system maintenance events',
    [WebhookEventType.SYSTEM_ALERT]: 'Triggered for system alerts',
    [WebhookEventType.SYSTEM_BACKUP_COMPLETED]: 'Triggered when a system backup completes'
  };

  return descriptions[eventType] || 'No description available';
}

export default {
  WebhookEventType,
  EventCategory,
  EventTypeToCategory,
  EventPayloadSchemas,
  getAllEventTypes,
  getEventTypesByCategory,
  getCategoryForEventType,
  validateEventPayload,
  isValidEventType,
  getEventTypeDescription
};
