/**
 * @fileoverview Activity Logger Middleware
 * Automatic logging of all API calls with actor attribution and privacy filtering.
 * Inspired by Paperclip's activity-log.ts
 * @module src/middleware/activity-logger
 * @version 5.0.0
 */

import { getActivityService, AUTH_ACTIVITIES, DATA_ACTIVITIES, AGENT_ACTIVITIES, SECURITY_ACTIVITIES, SYSTEM_ACTIVITIES } from '../domains/activity/activity-service.js';
import { getSecurityAuditLogger, AUTH_EVENTS, DATA_EVENTS, SECURITY_EVENTS } from './security-audit.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default configuration for activity logging
 * @const {Object}
 */
const DEFAULT_CONFIG = {
  // Logging behavior
  logRequests: true,
  logResponses: true,
  logDataChanges: true,
  logAuthEvents: true,
  logSystemEvents: false,
  
  // Actor attribution
  identifyUser: true,
  identifyAgent: true,
  identifyApiKey: true,
  
  // Privacy
  privacyLevel: 'standard',
  redactRequestBody: false,
  redactResponseBody: false,
  redactHeaders: ['authorization', 'cookie', 'x-api-key', 'x-auth-token'],
  
  // Performance
  skipHealthChecks: true,
  skipStaticAssets: true,
  
  // Sampling (for high-traffic endpoints)
  samplingRate: 1.0, // 1.0 = log everything
  
  // Categories to always log (regardless of sampling)
  criticalCategories: ['security', 'auth', 'admin'],
  
  // Body size limits
  maxBodySize: 10000, // bytes
  
  // Async logging
  asyncLogging: true
};

/**
 * Route to activity category mapping
 * @const {Object}
 */
const ROUTE_CATEGORIES = {
  '/api/auth': 'auth',
  '/api/users': 'admin',
  '/api/agents': 'agent',
  '/api/tasks': 'data',
  '/api/projects': 'data',
  '/api/companies': 'admin',
  '/api/billing': 'admin',
  '/api/integrations': 'integration',
  '/api/admin': 'admin',
  '/api/system': 'system'
};

/**
 * HTTP method to action mapping
 * @const {Object}
 */
const METHOD_ACTIONS = {
  GET: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
  HEAD: 'read',
  OPTIONS: 'read'
};

// ============================================================================
// Activity Logger Middleware
// ============================================================================

/**
 * Activity Logger middleware for Express
 * Automatically logs all API requests with proper actor attribution
 * @param {Object} [config={}] - Configuration options
 * @returns {Function} Express middleware
 */
export function activityLogger(config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  const activityService = getActivityService();

  return async (req, res, next) => {
    const startTime = Date.now();
    
    // Skip if configured
    if (shouldSkipRequest(req, options)) {
      return next();
    }

    // Capture request data before processing
    const requestData = captureRequestData(req, options);
    
    // Capture original end function
    const originalEnd = res.end;
    
    // Track if response has been logged
    let logged = false;

    res.end = async function(...args) {
      // Prevent double logging
      if (logged) {
        originalEnd.apply(res, args);
        return;
      }
      logged = true;

      // Restore original end
      res.end = originalEnd;
      res.end(...args);

      const duration = Date.now() - startTime;
      const responseData = captureResponseData(res, args, options);

      // Log the activity
      await logActivity(req, res, requestData, responseData, duration, options, activityService);
    };

    next();
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine if request should be skipped
 * @param {Object} req - Express request
 * @param {Object} options - Config options
 * @returns {boolean}
 */
function shouldSkipRequest(req, options) {
  // Skip health checks
  if (options.skipHealthChecks && isHealthCheck(req)) {
    return true;
  }

  // Skip static assets
  if (options.skipStaticAssets && isStaticAsset(req)) {
    return true;
  }

  // Skip if sampling rate is below threshold (for non-critical categories)
  const category = getCategoryFromPath(req.path);
  if (!options.criticalCategories.includes(category) && options.samplingRate < 1.0) {
    if (Math.random() > options.samplingRate) {
      return true;
    }
  }

  return false;
}

/**
 * Check if request is a health check
 * @param {Object} req - Express request
 * @returns {boolean}
 */
function isHealthCheck(req) {
  const healthPaths = ['/health', '/ping', '/ready', '/alive', '/status'];
  return healthPaths.some(path => req.path.startsWith(path));
}

/**
 * Check if request is for a static asset
 * @param {Object} req - Express request
 * @returns {boolean}
 */
function isStaticAsset(req) {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
  return staticExtensions.some(ext => req.path.endsWith(ext));
}

/**
 * Capture request data
 * @param {Object} req - Express request
 * @param {Object} options - Config options
 * @returns {Object}
 */
function captureRequestData(req, options) {
  const data = {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    query: { ...req.query },
    headers: sanitizeHeaders(req.headers, options.redactHeaders),
    ip: getClientIp(req),
    userAgent: req.headers['user-agent']
  };

  // Capture body if not redacted
  if (!options.redactRequestBody && req.body) {
    const bodyStr = JSON.stringify(req.body);
    if (bodyStr.length <= options.maxBodySize) {
      data.body = { ...req.body };
    } else {
      data.body = { _truncated: true, _size: bodyStr.length };
    }
  }

  return data;
}

/**
 * Capture response data
 * @param {Object} res - Express response
 * @param {Array} args - Arguments passed to res.end
 * @param {Object} options - Config options
 * @returns {Object}
 */
function captureResponseData(res, args, options) {
  const data = {
    statusCode: res.statusCode,
    statusMessage: res.statusMessage,
    headers: res.getHeaders()
  };

  // Try to capture response body
  if (!options.redactResponseBody && args[0]) {
    const body = args[0].toString();
    if (body.length <= options.maxBodySize) {
      try {
        data.body = JSON.parse(body);
      } catch {
        data.body = body;
      }
    } else {
      data.body = { _truncated: true, _size: body.length };
    }
  }

  return data;
}

/**
 * Get client IP address
 * @param {Object} req - Express request
 * @returns {string|null}
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip']
    || req.ip
    || req.connection?.remoteAddress
    || null;
}

/**
 * Sanitize headers by redacting sensitive values
 * @param {Object} headers - Request headers
 * @param {string[]} redactList - Headers to redact
 * @returns {Object}
 */
function sanitizeHeaders(headers, redactList) {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (redactList.some(r => lowerKey === r.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Get activity category from request path
 * @param {string} path - Request path
 * @returns {string}
 */
function getCategoryFromPath(path) {
  for (const [prefix, category] of Object.entries(ROUTE_CATEGORIES)) {
    if (path.startsWith(prefix)) {
      return category;
    }
  }
  return 'system';
}

/**
 * Determine entity type and ID from request
 * @param {Object} req - Express request
 * @returns {Object}
 */
function getEntityInfo(req) {
  // Extract from path patterns
  const patterns = [
    { regex: /\/api\/(\w+)\/(\w+)(?:\/|$)/, entityIndex: 1, idIndex: 2 },
    { regex: /\/api\/(\w+)(?:\/|$)/, entityIndex: 1, idIndex: null }
  ];

  for (const pattern of patterns) {
    const match = req.path.match(pattern.regex);
    if (match) {
      return {
        type: match[pattern.entityIndex],
        id: pattern.idIndex ? match[pattern.idIndex] : 'list'
      };
    }
  }

  return { type: 'request', id: req.requestId || 'unknown' };
}

/**
 * Get actor information from request
 * @param {Object} req - Express request
 * @returns {Object}
 */
function getActorInfo(req) {
  // API Key authentication
  if (req.apiKey) {
    return {
      type: 'api_key',
      id: req.apiKey.id || req.apiKey.keyId || 'unknown',
      display: req.apiKey.name || 'API Key'
    };
  }

  // Agent authentication
  if (req.agent) {
    return {
      type: 'agent',
      id: req.agent.id,
      display: req.agent.name || req.agent.id
    };
  }

  // User authentication
  if (req.user || req.auth?.userId) {
    const userId = req.user?.id || req.auth?.userId;
    return {
      type: 'user',
      id: userId,
      display: req.user?.name || req.user?.email || userId
    };
  }

  // Webhook
  if (req.webhook) {
    return {
      type: 'webhook',
      id: req.webhook.id || 'unknown',
      display: req.webhook.name || 'Webhook'
    };
  }

  // Integration
  if (req.integration) {
    return {
      type: 'integration',
      id: req.integration.id || 'unknown',
      display: req.integration.name || 'Integration'
    };
  }

  // System/internal
  return {
    type: 'system',
    id: 'system',
    display: 'System'
  };
}

/**
 * Determine severity based on response status and category
 * @param {number} statusCode - HTTP status code
 * @param {string} category - Activity category
 * @returns {string}
 */
function getSeverity(statusCode, category) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) {
    if (statusCode === 401 || statusCode === 403) return 'warning';
    return 'notice';
  }
  if (category === 'security') return 'warning';
  if (category === 'auth' && statusCode === 200) return 'info';
  return 'info';
}

/**
 * Generate action name from request
 * @param {Object} req - Express request
 * @param {Object} entityInfo - Entity information
 * @returns {string}
 */
function generateAction(req, entityInfo) {
  const method = req.method;
  const entityType = entityInfo.type;
  const action = METHOD_ACTIONS[method] || 'unknown';
  
  return `${entityType}.${action}`;
}

/**
 * Log the activity
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Object} requestData - Captured request data
 * @param {Object} responseData - Captured response data
 * @param {number} duration - Request duration in ms
 * @param {Object} options - Config options
 * @param {Object} activityService - Activity service instance
 */
async function logActivity(req, res, requestData, responseData, duration, options, activityService) {
  try {
    const actor = getActorInfo(req);
    const entityInfo = getEntityInfo(req);
    const category = getCategoryFromPath(req.path);
    const success = responseData.statusCode < 400;
    const severity = getSeverity(responseData.statusCode, category);
    const action = generateAction(req, entityInfo);

    // Build activity details
    const details = {
      request: options.redactRequestBody ? undefined : requestData.body,
      response: options.redactResponseBody ? undefined : responseData.body,
      http: {
        method: requestData.method,
        path: requestData.path,
        statusCode: responseData.statusCode,
        duration: duration
      }
    };

    // Add context
    const context = {
      actorDisplay: actor.display,
      entityDisplay: entityInfo.id,
      companyId: req.company?.id || req.auth?.companyId,
      projectId: req.project?.id || req.body?.projectId,
      conversationId: req.conversation?.id,
      agentId: req.agent?.id,
      runId: req.run?.id,
      ip: requestData.ip,
      userAgent: requestData.userAgent,
      requestId: req.requestId || req.id,
      sessionId: req.session?.id,
      resultCode: responseData.statusCode,
      headers: requestData.headers
    };

    // Log via activity service
    await activityService.logActivity({
      action,
      actorType: actor.type,
      actorId: actor.id,
      entityType: entityInfo.type,
      entityId: entityInfo.id,
      category,
      severity,
      status: success ? 'success' : 'failure',
      summary: `${action} ${success ? 'succeeded' : 'failed'} (${responseData.statusCode})`,
      details,
      context
    });

    // Also log to security audit for auth/security events
    if (category === 'auth' || category === 'security' || responseData.statusCode === 401 || responseData.statusCode === 403) {
      await logSecurityAudit(req, res, requestData, responseData, duration, actor, entityInfo);
    }

  } catch (error) {
    // Don't let activity logging break the request
    console.error('Activity logging error:', error);
  }
}

/**
 * Log to security audit system
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Object} requestData - Request data
 * @param {Object} responseData - Response data
 * @param {number} duration - Duration
 * @param {Object} actor - Actor info
 * @param {Object} entityInfo - Entity info
 */
async function logSecurityAudit(req, res, requestData, responseData, duration, actor, entityInfo) {
  try {
    const auditLogger = getSecurityAuditLogger();
    if (!auditLogger) return;

    const success = responseData.statusCode < 400;
    
    // Map to security audit events
    let event;
    if (req.path.includes('/auth/login')) {
      event = success ? AUTH_EVENTS.LOGIN_SUCCESS : AUTH_EVENTS.LOGIN_FAILURE;
    } else if (req.path.includes('/auth/logout')) {
      event = AUTH_EVENTS.LOGOUT;
    } else if (responseData.statusCode === 401) {
      event = SECURITY_EVENTS.UNAUTHORIZED_ACCESS;
    } else if (responseData.statusCode === 403) {
      event = SECURITY_EVENTS.PRIVILEGE_ESCALATION;
    } else {
      event = DATA_EVENTS.READ;
    }

    await auditLogger.log(event, {
      actor: actor.id,
      resource: entityInfo.type,
      resourceId: entityInfo.id,
      result: success ? 'success' : 'failure',
      ip: requestData.ip,
      userAgent: requestData.userAgent,
      details: {
        method: requestData.method,
        path: requestData.path,
        statusCode: responseData.statusCode,
        duration,
        actorType: actor.type
      }
    });

  } catch (error) {
    console.error('Security audit logging error:', error);
  }
}

// ============================================================================
// Specialized Loggers
// ============================================================================

/**
 * Log authentication event
 * @param {Object} params - Event parameters
 * @param {string} params.event - Auth event type
 * @param {string} params.actorId - Actor ID
 * @param {string} params.actorType - Actor type
 * @param {boolean} params.success - Whether successful
 * @param {Object} [params.metadata] - Additional metadata
 * @param {Object} [params.req] - Express request (for context)
 */
export async function logAuthEvent(params) {
  const { event, actorId, actorType, success, metadata = {}, req } = params;
  
  const activityService = getActivityService();
  
  await activityService.logActivity({
    action: event,
    actorType,
    actorId,
    entityType: 'auth',
    entityId: actorId,
    category: 'auth',
    severity: success ? 'info' : 'warning',
    status: success ? 'success' : 'failure',
    summary: `${event} ${success ? 'succeeded' : 'failed'}`,
    details: metadata,
    context: req ? {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
      requestId: req.requestId
    } : {}
  });
}

/**
 * Log data change event
 * @param {Object} params - Event parameters
 * @param {string} params.action - Action type (create, update, delete)
 * @param {string} params.actorId - Actor ID
 * @param {string} params.actorType - Actor type
 * @param {string} params.entityType - Entity type
 * @param {string} params.entityId - Entity ID
 * @param {Object} [params.before] - State before change
 * @param {Object} [params.after] - State after change
 * @param {Object} [params.changes] - Computed changes
 * @param {Object} [params.req] - Express request
 */
export async function logDataChange(params) {
  const { 
    action, 
    actorId, 
    actorType, 
    entityType, 
    entityId, 
    before, 
    after, 
    changes,
    req 
  } = params;

  const activityService = getActivityService();
  
  const actionMap = {
    create: DATA_ACTIVITIES.CREATE,
    update: DATA_ACTIVITIES.UPDATE,
    delete: DATA_ACTIVITIES.DELETE
  };

  await activityService.logActivity({
    action: actionMap[action] || DATA_ACTIVITIES.UPDATE,
    actorType,
    actorId,
    entityType,
    entityId,
    category: 'data',
    severity: 'info',
    status: 'success',
    summary: `${action} ${entityType} ${entityId}`,
    details: { before, after, changes },
    context: req ? {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
      requestId: req.requestId,
      companyId: req.company?.id
    } : {}
  });
}

/**
 * Log agent event
 * @param {Object} params - Event parameters
 * @param {string} params.event - Agent event type
 * @param {string} params.agentId - Agent ID
 * @param {string} [params.actorId] - Actor who triggered the event
 * @param {string} [params.actorType] - Actor type
 * @param {Object} [params.metadata] - Additional metadata
 */
export async function logAgentEvent(params) {
  const { event, agentId, actorId, actorType = 'system', metadata = {} } = params;

  const activityService = getActivityService();
  
  await activityService.logActivity({
    action: event,
    actorType,
    actorId: actorId || agentId,
    entityType: 'agent',
    entityId: agentId,
    category: 'agent',
    severity: 'info',
    status: 'success',
    summary: `Agent ${agentId}: ${event}`,
    details: metadata,
    context: { agentId }
  });
}

/**
 * Log security event
 * @param {Object} params - Event parameters
 * @param {string} params.event - Security event type
 * @param {string} [params.actorId] - Actor ID (if known)
 * @param {string} [params.severity='warning'] - Event severity
 * @param {string} params.description - Event description
 * @param {Object} [params.evidence] - Supporting evidence
 * @param {Object} [params.req] - Express request
 */
export async function logSecurityEvent(params) {
  const { event, actorId, severity = 'warning', description, evidence = {}, req } = params;

  const activityService = getActivityService();
  
  await activityService.logActivity({
    action: event,
    actorType: actorId ? 'user' : 'system',
    actorId: actorId || 'system',
    entityType: 'security',
    entityId: event,
    category: 'security',
    severity,
    status: 'failure',
    summary: description,
    details: evidence,
    context: req ? {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
      requestId: req.requestId
    } : {}
  });
}

// ============================================================================
// Express Router Extension
// ============================================================================

/**
 * Create activity logging middleware for specific routes
 * @param {Object} [config={}] - Route-specific config
 * @returns {Object} Middleware object with methods
 */
export function createActivityLogger(config = {}) {
  const middleware = activityLogger(config);
  
  return {
    middleware,
    
    /**
     * Log custom activity
     * @param {Object} req - Express request
     * @param {Object} activity - Activity to log
     */
    async log(req, activity) {
      const activityService = getActivityService();
      const actor = getActorInfo(req);
      
      await activityService.logActivity({
        ...activity,
        actorType: activity.actorType || actor.type,
        actorId: activity.actorId || actor.id,
        context: {
          ...activity.context,
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'],
          requestId: req.requestId
        }
      });
    }
  };
}

// ============================================================================
// Exports
// ============================================================================

export default activityLogger;
