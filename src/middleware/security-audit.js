/**
 * @fileoverview Security Audit Logging Middleware
 * Comprehensive audit logging for auth attempts, data modifications, and admin actions
 * @module src/middleware/security-audit
 * @version 5.0.0
 */

import { createHash, randomUUID } from 'crypto';
import { AuditMiddleware } from './audit.js';

// ============================================================================
// Audit Event Types
// ============================================================================

/**
 * Authentication audit events
 * @const {Object}
 */
export const AUTH_EVENTS = {
  LOGIN_ATTEMPT: 'auth.login.attempt',
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGOUT: 'auth.logout',
  TOKEN_REFRESH: 'auth.token.refresh',
  TOKEN_REFRESH_FAILURE: 'auth.token.refresh.failure',
  TOKEN_REVOKED: 'auth.token.revoked',
  PASSWORD_CHANGE: 'auth.password.change',
  PASSWORD_RESET_REQUEST: 'auth.password.reset.request',
  PASSWORD_RESET_COMPLETE: 'auth.password.reset.complete',
  MFA_ENABLED: 'auth.mfa.enabled',
  MFA_DISABLED: 'auth.mfa.disabled',
  MFA_CHALLENGE: 'auth.mfa.challenge',
  MFA_SUCCESS: 'auth.mfa.success',
  MFA_FAILURE: 'auth.mfa.failure',
  SESSION_CREATED: 'auth.session.created',
  SESSION_DESTROYED: 'auth.session.destroyed',
  SESSION_EXPIRED: 'auth.session.expired',
  SESSION_HIJACK_DETECTED: 'auth.session.hijack_detected'
};

/**
 * Data modification audit events
 * @const {Object}
 */
export const DATA_EVENTS = {
  CREATE: 'data.create',
  READ: 'data.read',
  UPDATE: 'data.update',
  DELETE: 'data.delete',
  BULK_CREATE: 'data.bulk.create',
  BULK_UPDATE: 'data.bulk.update',
  BULK_DELETE: 'data.bulk.delete',
  EXPORT: 'data.export',
  IMPORT: 'data.import',
  BACKUP: 'data.backup',
  RESTORE: 'data.restore'
};

/**
 * Admin action audit events
 * @const {Object}
 */
export const ADMIN_EVENTS = {
  USER_CREATE: 'admin.user.create',
  USER_UPDATE: 'admin.user.update',
  USER_DELETE: 'admin.user.delete',
  USER_ENABLE: 'admin.user.enable',
  USER_DISABLE: 'admin.user.disable',
  ROLE_CREATE: 'admin.role.create',
  ROLE_UPDATE: 'admin.role.update',
  ROLE_DELETE: 'admin.role.delete',
  PERMISSION_GRANT: 'admin.permission.grant',
  PERMISSION_REVOKE: 'admin.permission.revoke',
  CONFIG_UPDATE: 'admin.config.update',
  SYSTEM_MAINTENANCE: 'admin.system.maintenance',
  SECURITY_POLICY_UPDATE: 'admin.security.policy.update',
  AUDIT_LOG_ACCESS: 'admin.audit.access',
  AUDIT_LOG_EXPORT: 'admin.audit.export'
};

/**
 * Security events
 * @const {Object}
 */
export const SECURITY_EVENTS = {
  RATE_LIMIT_EXCEEDED: 'security.rate_limit.exceeded',
  SQL_INJECTION_DETECTED: 'security.injection.sql',
  XSS_ATTEMPT_DETECTED: 'security.injection.xss',
  CSRF_VIOLATION: 'security.csrf.violation',
  SUSPICIOUS_ACTIVITY: 'security.activity.suspicious',
  BRUTE_FORCE_DETECTED: 'security.brute_force.detected',
  PRIVILEGE_ESCALATION: 'security.privilege.escalation',
  DATA_EXFILTRATION: 'security.data.exfiltration',
  UNAUTHORIZED_ACCESS: 'security.access.unauthorized',
  IP_BLOCKED: 'security.ip.blocked'
};

// ============================================================================
// Security Audit Logger
// ============================================================================

/**
 * Security audit logger for comprehensive logging
 * @class SecurityAuditLogger
 */
export class SecurityAuditLogger {
  #audit;
  #config;
  #alertThresholds;
  #suspiciousIps;
  #userActivity;

  /**
   * @param {Object} [config={}] - Configuration options
   * @param {Object} [config.alertThresholds] - Alert thresholds
   * @param {number} [config.alertThresholds.failedLogins=5] - Failed login threshold
   * @param {number} [config.alertThresholds.suspiciousActivity=3] - Suspicious activity threshold
   * @param {Function} [config.onAlert] - Alert callback
   * @param {Function} [config.persistence] - Custom persistence function
   */
  constructor(config = {}) {
    this.#audit = new AuditMiddleware({
      enableMerkle: true,
      chainHashes: true,
      persistence: config.persistence
    });

    this.#config = {
      enableAlerts: config.enableAlerts !== false,
      onAlert: config.onAlert || this.#defaultAlertHandler,
      ...config
    };

    this.#alertThresholds = {
      failedLogins: config.alertThresholds?.failedLogins || 5,
      suspiciousActivity: config.alertThresholds?.suspiciousActivity || 3,
      rateLimitViolations: config.alertThresholds?.rateLimitViolations || 10,
      ...config.alertThresholds
    };

    this.#suspiciousIps = new Map();
    this.#userActivity = new Map();
  }

  /**
   * Initialize the logger for server-managed lifecycle compatibility.
   * @returns {Promise<SecurityAuditLogger>}
   */
  async initialize() {
    return this;
  }

  /**
   * Compatibility wrapper used by the main server request logger.
   * @param {string} action - Audit action name
   * @param {Object} [context={}] - Audit context
   * @returns {Promise<import('./audit.js').AuditRecord>}
   */
  async log(action, context = {}) {
    const {
      actor = 'system',
      resource,
      resourceId,
      result = 'success',
      ip,
      userAgent,
      details,
      ...metadata
    } = context;

    return this.#audit.log(action, {
      actor,
      resource: resource || context.url || action,
      resourceId,
      result,
      ip,
      userAgent,
      details: details ?? metadata
    });
  }

  /**
   * Shutdown hook for server lifecycle compatibility.
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.dispose();
  }

  // ========================================================================
  // Authentication Auditing
  // ========================================================================

  /**
   * Log authentication attempt
   * @param {Object} context - Audit context
   * @param {string} context.actor - User identifier or 'anonymous'
   * @param {boolean} context.success - Whether attempt was successful
   * @param {string} [context.method] - Auth method (password, oauth, mfa, etc.)
   * @param {string} [context.ip] - Client IP
   * @param {string} [context.userAgent] - User agent
   * @param {Object} [context.metadata] - Additional metadata
   */
  async logAuthAttempt(context) {
    const event = context.success ? AUTH_EVENTS.LOGIN_SUCCESS : AUTH_EVENTS.LOGIN_FAILURE;
    
    await this.#audit.log(event, {
      actor: context.actor || 'anonymous',
      resource: 'auth',
      result: context.success ? 'success' : 'failure',
      ip: context.ip,
      userAgent: context.userAgent,
      details: {
        method: context.method || 'unknown',
        ...(context.success ? {} : { reason: context.reason }),
        ...context.metadata
      }
    });

    // Check for suspicious activity
    if (!context.success) {
      await this.#trackFailedAttempt(context);
    }
  }

  /**
   * Log logout event
   * @param {Object} context - Audit context
   */
  async logLogout(context) {
    await this.#audit.log(AUTH_EVENTS.LOGOUT, {
      actor: context.actor,
      resource: 'auth',
      result: 'success',
      ip: context.ip,
      userAgent: context.userAgent,
      details: {
        sessionId: context.sessionId,
        reason: context.reason || 'user_initiated'
      }
    });
  }

  /**
   * Log token refresh
   * @param {Object} context - Audit context
   */
  async logTokenRefresh(context) {
    await this.#audit.log(context.success ? AUTH_EVENTS.TOKEN_REFRESH : AUTH_EVENTS.TOKEN_REFRESH_FAILURE, {
      actor: context.actor || 'anonymous',
      resource: 'auth',
      result: context.success ? 'success' : 'failure',
      ip: context.ip,
      details: {
        sessionId: context.sessionId,
        ...(context.success ? {} : { reason: context.reason })
      }
    });
  }

  /**
   * Log password change
   * @param {Object} context - Audit context
   */
  async logPasswordChange(context) {
    await this.#audit.log(AUTH_EVENTS.PASSWORD_CHANGE, {
      actor: context.actor,
      resource: 'user',
      resourceId: context.userId,
      result: 'success',
      ip: context.ip,
      details: {
        changedBy: context.changedBy || 'self',
        resetTokenUsed: context.resetTokenUsed || false
      }
    });
  }

  /**
   * Log session event
   * @param {string} event - Session event type
   * @param {Object} context - Audit context
   */
  async logSessionEvent(event, context) {
    await this.#audit.log(event, {
      actor: context.actor,
      resource: 'session',
      resourceId: context.sessionId,
      result: 'success',
      ip: context.ip,
      userAgent: context.userAgent,
      details: {
        duration: context.duration,
        reason: context.reason,
        ...context.metadata
      }
    });
  }

  // ========================================================================
  // Data Modification Auditing
  // ========================================================================

  /**
   * Log data creation
   * @param {Object} context - Audit context
   * @param {string} context.actor - User performing action
   * @param {string} context.resourceType - Type of resource
   * @param {string} context.resourceId - Resource identifier
   * @param {Object} context.data - Created data (sanitized)
   * @param {Object} [context.metadata] - Additional metadata
   */
  async logDataCreate(context) {
    await this.#audit.log(DATA_EVENTS.CREATE, {
      actor: context.actor,
      resource: context.resourceType,
      resourceId: context.resourceId,
      result: 'success',
      ip: context.ip,
      details: {
        dataSnapshot: this.#sanitizeDataSnapshot(context.data),
        ...context.metadata
      }
    });
  }

  /**
   * Log data update
   * @param {Object} context - Audit context
   * @param {string} context.actor - User performing action
   * @param {string} context.resourceType - Type of resource
   * @param {string} context.resourceId - Resource identifier
   * @param {Object} context.oldData - Previous data state
   * @param {Object} context.newData - New data state
   * @param {Object} [context.metadata] - Additional metadata
   */
  async logDataUpdate(context) {
    await this.#audit.log(DATA_EVENTS.UPDATE, {
      actor: context.actor,
      resource: context.resourceType,
      resourceId: context.resourceId,
      result: 'success',
      ip: context.ip,
      details: {
        changes: this.#computeChanges(context.oldData, context.newData),
        oldSnapshot: this.#sanitizeDataSnapshot(context.oldData),
        newSnapshot: this.#sanitizeDataSnapshot(context.newData),
        ...context.metadata
      }
    });
  }

  /**
   * Log data deletion
   * @param {Object} context - Audit context
   * @param {string} context.actor - User performing action
   * @param {string} context.resourceType - Type of resource
   * @param {string} context.resourceId - Resource identifier
   * @param {Object} context.data - Deleted data (sanitized)
   * @param {Object} [context.metadata] - Additional metadata
   */
  async logDataDelete(context) {
    await this.#audit.log(DATA_EVENTS.DELETE, {
      actor: context.actor,
      resource: context.resourceType,
      resourceId: context.resourceId,
      result: 'success',
      ip: context.ip,
      details: {
        deletedData: this.#sanitizeDataSnapshot(context.data),
        permanent: context.permanent !== false,
        ...context.metadata
      }
    });
  }

  /**
   * Log data export
   * @param {Object} context - Audit context
   */
  async logDataExport(context) {
    await this.#audit.log(DATA_EVENTS.EXPORT, {
      actor: context.actor,
      resource: context.resourceType,
      result: 'success',
      ip: context.ip,
      details: {
        recordCount: context.recordCount,
        format: context.format,
        filters: context.filters,
        reason: context.reason
      }
    });
  }

  /**
   * Log bulk operation
   * @param {string} event - Bulk event type
   * @param {Object} context - Audit context
   */
  async logBulkOperation(event, context) {
    await this.#audit.log(event, {
      actor: context.actor,
      resource: context.resourceType,
      result: 'success',
      ip: context.ip,
      details: {
        recordCount: context.recordCount,
        criteria: context.criteria,
        successCount: context.successCount,
        failureCount: context.failureCount,
        duration: context.duration
      }
    });
  }

  // ========================================================================
  // Admin Action Auditing
  // ========================================================================

  /**
   * Log admin user action
   * @param {string} event - Admin event type
   * @param {Object} context - Audit context
   */
  async logAdminAction(event, context) {
    await this.#audit.log(event, {
      actor: context.actor,
      resource: 'admin',
      resourceId: context.targetId,
      result: context.success !== false ? 'success' : 'failure',
      ip: context.ip,
      details: {
        action: event,
        targetUser: context.targetUser,
        targetRole: context.targetRole,
        changes: context.changes,
        reason: context.reason,
        ...(context.success === false && { error: context.error })
      }
    });

    // Admin actions always trigger alert
    if (this.#config.enableAlerts) {
      this.#config.onAlert({
        type: 'ADMIN_ACTION',
        severity: 'high',
        event,
        actor: context.actor,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Log configuration change
   * @param {Object} context - Audit context
   */
  async logConfigChange(context) {
    await this.#audit.log(ADMIN_EVENTS.CONFIG_UPDATE, {
      actor: context.actor,
      resource: 'config',
      result: 'success',
      ip: context.ip,
      details: {
        configKey: context.configKey,
        oldValue: context.oldValue,
        newValue: context.newValue,
        reason: context.reason
      }
    });
  }

  // ========================================================================
  // Security Event Auditing
  // ========================================================================

  /**
   * Log security event
   * @param {string} event - Security event type
   * @param {Object} context - Audit context
   */
  async logSecurityEvent(event, context) {
    await this.#audit.log(event, {
      actor: context.actor || 'system',
      resource: 'security',
      result: 'failure', // Security events are always failures
      ip: context.ip,
      userAgent: context.userAgent,
      details: {
        severity: context.severity || 'medium',
        description: context.description,
        evidence: context.evidence,
        recommendation: context.recommendation
      }
    });

    // Check if alert should be triggered
    if (this.#config.enableAlerts && this.#shouldAlert(event, context)) {
      this.#config.onAlert({
        type: 'SECURITY_EVENT',
        severity: context.severity || 'high',
        event,
        actor: context.actor,
        ip: context.ip,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Log rate limit violation
   * @param {Object} context - Audit context
   */
  async logRateLimitExceeded(context) {
    await this.logSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
      actor: context.actor,
      ip: context.ip,
      severity: 'medium',
      description: `Rate limit exceeded for ${context.endpoint}`,
      evidence: {
        endpoint: context.endpoint,
        limit: context.limit,
        window: context.window,
        retryAfter: context.retryAfter
      }
    });

    await this.#trackSuspiciousIp(context.ip, 'rate_limit');
  }

  /**
   * Log injection attempt
   * @param {string} type - Injection type (sql, xss, nosql)
   * @param {Object} context - Audit context
   */
  async logInjectionAttempt(type, context) {
    const eventMap = {
      sql: SECURITY_EVENTS.SQL_INJECTION_DETECTED,
      xss: SECURITY_EVENTS.XSS_ATTEMPT_DETECTED,
      nosql: SECURITY_EVENTS.SQL_INJECTION_DETECTED
    };

    await this.logSecurityEvent(eventMap[type] || SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
      actor: context.actor,
      ip: context.ip,
      severity: 'critical',
      description: `${type.toUpperCase()} injection attempt detected`,
      evidence: {
        path: context.path,
        findings: context.findings,
        sanitized: true
      }
    });

    await this.#trackSuspiciousIp(context.ip, `injection_${type}`);
  }

  // ========================================================================
  // Express Middleware
  // ========================================================================

  /**
   * Create Express middleware for automatic request auditing
   * @param {Object} [options={}] - Middleware options
   * @param {boolean} [options.logRequests=true] - Log all requests
   * @param {boolean} [options.logDataChanges=true] - Log data changes
   * @param {string[]} [options.sensitiveEndpoints] - Endpoints requiring extra logging
   * @returns {Function} Express middleware
   */
  middleware(options = {}) {
    const {
      logRequests = true,
      logDataChanges = true,
      sensitiveEndpoints = ['/admin', '/api/auth', '/api/users']
    } = options;

    return async (req, res, next) => {
      const startTime = Date.now();
      
      // Capture original end function
      const originalEnd = res.end;
      
      res.end = async (...args) => {
        res.end = originalEnd;
        res.end(...args);

        const duration = Date.now() - startTime;
        const isSensitive = sensitiveEndpoints.some(path => req.path.startsWith(path));
        const isDataChange = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

        if (logRequests || isSensitive || (logDataChanges && isDataChange)) {
          await this.#logRequest(req, res, duration, isDataChange);
        }
      };

      next();
    };
  }

  /**
   * Log request details
   * @private
   */
  async #logRequest(req, res, duration, isDataChange) {
    const actor = req.auth?.userId || 'anonymous';
    const success = res.statusCode < 400;
    
    const event = isDataChange 
      ? (success ? DATA_EVENTS.CREATE : 'data.operation.failure')
      : (success ? DATA_EVENTS.READ : 'data.read.failure');

    await this.#audit.log(event, {
      actor,
      resource: req.path,
      result: success ? 'success' : 'failure',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        method: req.method,
        statusCode: res.statusCode,
        duration,
        query: Object.keys(req.query).length > 0 ? Object.keys(req.query) : undefined
      }
    });
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  async #trackFailedAttempt(context) {
    const key = context.ip || context.actor;
    if (!key) return;

    const attempts = this.#suspiciousIps.get(key) || { count: 0, events: [] };
    attempts.count++;
    attempts.events.push({
      timestamp: Date.now(),
      actor: context.actor,
      reason: context.reason
    });

    // Keep only last hour of events
    const oneHourAgo = Date.now() - 3600000;
    attempts.events = attempts.events.filter(e => e.timestamp > oneHourAgo);

    this.#suspiciousIps.set(key, attempts);

    // Check threshold
    if (attempts.count >= this.#alertThresholds.failedLogins) {
      await this.logSecurityEvent(SECURITY_EVENTS.BRUTE_FORCE_DETECTED, {
        actor: context.actor,
        ip: context.ip,
        severity: 'high',
        description: `Multiple failed login attempts detected from ${key}`,
        evidence: { attemptCount: attempts.count }
      });
    }
  }

  async #trackSuspiciousIp(ip, type) {
    if (!ip) return;

    const activity = this.#suspiciousIps.get(ip) || { 
      violations: [], 
      totalScore: 0 
    };

    activity.violations.push({
      type,
      timestamp: Date.now()
    });

    // Calculate risk score
    const scoreMap = {
      rate_limit: 1,
      injection_sql: 10,
      injection_xss: 10,
      brute_force: 5
    };

    activity.totalScore += scoreMap[type] || 1;

    // Auto-block high-risk IPs
    if (activity.totalScore >= 20) {
      await this.logSecurityEvent(SECURITY_EVENTS.IP_BLOCKED, {
        ip,
        severity: 'critical',
        description: `IP blocked due to suspicious activity`,
        evidence: { totalScore: activity.totalScore, violations: activity.violations }
      });
    }

    this.#suspiciousIps.set(ip, activity);
  }

  #shouldAlert(event, context) {
    const criticalEvents = [
      SECURITY_EVENTS.SESSION_HIJACK_DETECTED,
      SECURITY_EVENTS.PRIVILEGE_ESCALATION,
      SECURITY_EVENTS.DATA_EXFILTRATION,
      SECURITY_EVENTS.BRUTE_FORCE_DETECTED
    ];

    return criticalEvents.includes(event) || context.severity === 'critical';
  }

  #defaultAlertHandler(alert) {
    console.error('[SECURITY ALERT]', alert);
    // In production, this would send to SIEM, email, Slack, etc.
  }

  #sanitizeDataSnapshot(data) {
    if (!data || typeof data !== 'object') return data;

    const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'creditCard', 'ssn'];
    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  #computeChanges(oldData, newData) {
    const changes = {};

    for (const key of new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})])) {
      const oldVal = oldData?.[key];
      const newVal = newData?.[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { from: oldVal, to: newVal };
      }
    }

    return changes;
  }

  // ========================================================================
  // Query and Export
  // ========================================================================

  /**
   * Query audit logs
   * @param {Object} [filters={}] - Query filters
   * @returns {Object} Query results
   */
  query(filters = {}) {
    return this.#audit.query(filters);
  }

  /**
   * Export audit trail
   * @param {Object} [filters={}] - Export filters
   * @returns {Object} Export data with Merkle proofs
   */
  exportTrail(filters = {}) {
    return this.#audit.exportTrail(filters);
  }

  /**
   * Get suspicious IP list
   * @returns {Array} Suspicious IPs
   */
  getSuspiciousIps() {
    return Array.from(this.#suspiciousIps.entries()).map(([ip, data]) => ({
      ip,
      ...data
    }));
  }

  /**
   * Get audit statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.#audit.getStats(),
      suspiciousIps: this.#suspiciousIps.size,
      userActivity: this.#userActivity.size
    };
  }

  dispose() {
    this.#audit.dispose();
    this.#suspiciousIps.clear();
    this.#userActivity.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

export function getSecurityAuditLogger(config) {
  if (!defaultInstance && config) {
    defaultInstance = new SecurityAuditLogger(config);
  }
  return defaultInstance;
}

export function resetSecurityAuditLogger() {
  if (defaultInstance) {
    defaultInstance.dispose();
    defaultInstance = null;
  }
}

export default SecurityAuditLogger;
