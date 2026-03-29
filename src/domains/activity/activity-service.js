/**
 * @fileoverview Activity Service - Comprehensive activity logging for CogniMesh
 * Inspired by Paperclip's activity-log.ts with enhanced categorization,
 * privacy filtering, and aggregation support.
 * @module domains/activity/activity-service
 * @version 5.0.0
 */

import { createHash, randomUUID } from 'crypto';
import { getDb } from '../../db/connection/index.js';

// ============================================================================
// Activity Event Types
// ============================================================================

/**
 * Authentication activity events
 * @const {Object}
 */
export const AUTH_ACTIVITIES = {
  LOGIN_ATTEMPT: 'auth.login.attempt',
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGOUT: 'auth.logout',
  TOKEN_REFRESH: 'auth.token.refresh',
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
  SESSION_EXPIRED: 'auth.session.expired'
};

/**
 * Data modification activity events
 * @const {Object}
 */
export const DATA_ACTIVITIES = {
  CREATE: 'data.create',
  READ: 'data.read',
  UPDATE: 'data.update',
  DELETE: 'data.delete',
  BULK_CREATE: 'data.bulk.create',
  BULK_UPDATE: 'data.bulk.update',
  BULK_DELETE: 'data.bulk.delete',
  EXPORT: 'data.export',
  IMPORT: 'data.import',
  ARCHIVE: 'data.archive',
  RESTORE: 'data.restore'
};

/**
 * Admin activity events
 * @const {Object}
 */
export const ADMIN_ACTIVITIES = {
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
  AUDIT_LOG_ACCESS: 'admin.audit.access'
};

/**
 * Agent activity events
 * @const {Object}
 */
export const AGENT_ACTIVITIES = {
  REGISTERED: 'agent.registered',
  UNREGISTERED: 'agent.unregistered',
  ASSIGNED: 'agent.assigned',
  UNASSIGNED: 'agent.unassigned',
  RUN_STARTED: 'agent.run.started',
  RUN_COMPLETED: 'agent.run.completed',
  RUN_FAILED: 'agent.run.failed',
  RUN_CANCELLED: 'agent.run.cancelled',
  HEARTBEAT: 'agent.heartbeat',
  STATE_CHANGE: 'agent.state.change',
  CAPABILITY_ADDED: 'agent.capability.added',
  CAPABILITY_REMOVED: 'agent.capability.removed'
};

/**
 * Security activity events
 * @const {Object}
 */
export const SECURITY_ACTIVITIES = {
  RATE_LIMIT_EXCEEDED: 'security.rate_limit.exceeded',
  SUSPICIOUS_ACTIVITY: 'security.activity.suspicious',
  BRUTE_FORCE_DETECTED: 'security.brute_force.detected',
  UNAUTHORIZED_ACCESS: 'security.access.unauthorized',
  PRIVILEGE_ESCALATION: 'security.privilege.escalation',
  IP_BLOCKED: 'security.ip.blocked',
  IP_UNBLOCKED: 'security.ip.unblocked'
};

/**
 * System activity events
 * @const {Object}
 */
export const SYSTEM_ACTIVITIES = {
  STARTUP: 'system.startup',
  SHUTDOWN: 'system.shutdown',
  BACKUP_STARTED: 'system.backup.started',
  BACKUP_COMPLETED: 'system.backup.completed',
  BACKUP_FAILED: 'system.backup.failed',
  MIGRATION_STARTED: 'system.migration.started',
  MIGRATION_COMPLETED: 'system.migration.completed',
  MAINTENANCE_MODE_ENABLED: 'system.maintenance.enabled',
  MAINTENANCE_MODE_DISABLED: 'system.maintenance.disabled',
  ERROR: 'system.error',
  WARNING: 'system.warning'
};

// ============================================================================
// Privacy Configuration
// ============================================================================

/**
 * PII field patterns for redaction
 * @const {string[]}
 */
const PII_PATTERNS = [
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'creditCard',
  'credit_card',
  'ssn',
  'socialSecurity',
  'dob',
  'birthDate',
  'phone',
  'email',
  'address',
  'ipAddress',
  'authorization',
  'cookie',
  'sessionId',
  'privateKey',
  'accessToken',
  'refreshToken'
];

/**
 * Privacy levels and their redaction rules
 * @const {Object}
 */
const PRIVACY_RULES = {
  public: {
    redactFields: ['password', 'secret', 'token', 'apiKey', 'api_key'],
    includeRequestBody: false,
    includeResponseBody: false,
    includeIp: false
  },
  standard: {
    redactFields: PII_PATTERNS,
    includeRequestBody: true,
    includeResponseBody: true,
    includeIp: true
  },
  sensitive: {
    redactFields: [...PII_PATTERNS, 'name', 'username', 'userId'],
    includeRequestBody: false,
    includeResponseBody: false,
    includeIp: false
  },
  restricted: {
    redactFields: null, // Redact everything except metadata
    includeRequestBody: false,
    includeResponseBody: false,
    includeIp: false
  }
};

// ============================================================================
// Activity Service
// ============================================================================

/**
 * Activity Service for comprehensive activity logging
 * @class ActivityService
 */
export class ActivityService {
  #db;
  #config;
  #subscriptions;
  #hooks;
  #lastHash;

  /**
   * @param {Object} [config={}] - Configuration options
   * @param {boolean} [config.enableChaining=true] - Enable hash chaining for tamper detection
   * @param {boolean} [config.enableAggregation=true] - Enable automatic aggregation
   * @param {number} [config.aggregationInterval=3600000] - Aggregation interval in ms (1 hour)
   * @param {boolean} [config.enableRealTime=true] - Enable real-time subscriptions
   * @param {Function} [config.onActivity] - Global activity hook
   */
  constructor(config = {}) {
    this.#config = {
      enableChaining: config.enableChaining !== false,
      enableAggregation: config.enableAggregation !== false,
      aggregationInterval: config.aggregationInterval || 3600000,
      enableRealTime: config.enableRealTime !== false,
      onActivity: config.onActivity || null,
      ...config
    };

    this.#db = null;
    this.#subscriptions = new Map();
    this.#hooks = new Map();
    this.#lastHash = null;

    if (this.#config.enableAggregation) {
      this.#startAggregationTimer();
    }
  }

  /**
   * Initialize the service
   * @returns {Promise<ActivityService>}
   */
  async initialize() {
    this.#db = getDb();
    return this;
  }

  /**
   * Shutdown the service
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.#stopAggregationTimer();
    this.#subscriptions.clear();
    this.#hooks.clear();
  }

  // ========================================================================
  // Core Logging
  // ========================================================================

  /**
   * Log an activity
   * @param {Object} input - Activity input
   * @param {string} input.action - Activity action (e.g., 'task.create')
   * @param {string} input.actorType - Actor type ('user', 'agent', 'system', 'api_key')
   * @param {string} input.actorId - Actor identifier
   * @param {string} input.entityType - Entity type (e.g., 'task', 'user')
   * @param {string} input.entityId - Entity identifier
   * @param {Object} [input.details] - Additional details
   * @param {string} [input.category] - Activity category
   * @param {string} [input.severity='info'] - Severity level
   * @param {string} [input.status='success'] - Status
   * @param {string} [input.summary] - Short summary
   * @param {Object} [input.context] - Request context
   * @returns {Promise<Object>} Created activity
   */
  async logActivity(input) {
    const {
      action,
      actorType,
      actorId,
      entityType,
      entityId,
      details = {},
      category = this.#inferCategory(action),
      severity = 'info',
      status = 'success',
      summary,
      context = {}
    } = input;

    // Validate required fields
    if (!action || !actorType || !actorId || !entityType || !entityId) {
      throw new Error('Activity logging requires action, actorType, actorId, entityType, and entityId');
    }

    // Determine privacy level
    const privacyLevel = this.#determinePrivacyLevel(action, category, details);

    // Sanitize details based on privacy level
    const sanitizedDetails = this.#sanitizeDetails(details, privacyLevel);
    const piiFields = this.#detectPIIFields(details);

    // Calculate expiration
    const retentionDays = this.#getRetentionDays(category);
    const expiresAt = retentionDays > 0 
      ? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Compute entry hash for chain of custody
    const entryHash = this.#computeEntryHash({
      action, actorType, actorId, entityType, entityId,
      occurredAt: new Date().toISOString()
    });

    // Insert activity
    const activityId = randomUUID();
    const occurredAt = new Date().toISOString();

    const activity = {
      id: activityId,
      actor_type: actorType,
      actor_id: actorId,
      actor_display: context.actorDisplay || null,
      action,
      category_id: category,
      severity,
      entity_type: entityType,
      entity_id: entityId,
      entity_display: context.entityDisplay || null,
      company_id: context.companyId || null,
      project_id: context.projectId || null,
      conversation_id: context.conversationId || null,
      agent_id: context.agentId || null,
      run_id: context.runId || null,
      ip_address: context.ip || null,
      user_agent: context.userAgent || null,
      request_id: context.requestId || null,
      session_id: context.sessionId || null,
      geo_country: context.geoCountry || null,
      geo_city: context.geoCity || null,
      status,
      result_code: context.resultCode || null,
      summary: summary || this.#generateSummary(action, entityType, entityId),
      metadata_json: JSON.stringify(sanitizedDetails.metadata || {}),
      has_details: Object.keys(sanitizedDetails).length > 0,
      privacy_level: privacyLevel,
      pii_fields: piiFields.length > 0 ? JSON.stringify(piiFields) : null,
      data_retention_days: retentionDays,
      occurred_at: occurredAt,
      expires_at: expiresAt,
      previous_hash: this.#lastHash,
      entry_hash: entryHash
    };

    const stmt = this.#db.prepare(`
      INSERT INTO activity_log (
        id, actor_type, actor_id, actor_display, action, category_id, severity,
        entity_type, entity_id, entity_display, company_id, project_id, conversation_id,
        agent_id, run_id, ip_address, user_agent, request_id, session_id,
        geo_country, geo_city, status, result_code, summary, metadata_json,
        has_details, privacy_level, pii_fields, data_retention_days, occurred_at,
        expires_at, previous_hash, entry_hash
      ) VALUES (
        @id, @actor_type, @actor_id, @actor_display, @action, @category_id, @severity,
        @entity_type, @entity_id, @entity_display, @company_id, @project_id, @conversation_id,
        @agent_id, @run_id, @ip_address, @user_agent, @request_id, @session_id,
        @geo_country, @geo_city, @status, @result_code, @summary, @metadata_json,
        @has_details, @privacy_level, @pii_fields, @data_retention_days, @occurred_at,
        @expires_at, @previous_hash, @entry_hash
      )
    `);

    stmt.run(activity);

    // Update last hash for chaining
    if (this.#config.enableChaining) {
      this.#lastHash = entryHash;
    }

    // Store detailed data if present
    if (Object.keys(sanitizedDetails).length > 0) {
      await this.#storeActivityDetails(activityId, sanitizedDetails, context, privacyLevel);
    }

    // Notify subscribers
    if (this.#config.enableRealTime) {
      this.#notifySubscribers(activity);
    }

    // Call global hook
    if (this.#config.onActivity) {
      try {
        await this.#config.onActivity(activity);
      } catch (error) {
        console.error('Activity hook error:', error);
      }
    }

    // Call specific hooks
    await this.#callHooks(action, activity);

    return { ...activity, details: sanitizedDetails };
  }

  /**
   * Batch log multiple activities
   * @param {Array<Object>} activities - Activities to log
   * @returns {Promise<Array<Object>>} Created activities
   */
  async logBatch(activities) {
    const results = [];
    
    // Use transaction for batch insert
    const insertActivity = this.#db.transaction((items) => {
      for (const item of items) {
        results.push(this.logActivity(item));
      }
    });

    await insertActivity(activities);
    return results;
  }

  // ========================================================================
  // Query Methods
  // ========================================================================

  /**
   * Get activity feed (timeline view)
   * @param {Object} [filters={}] - Query filters
   * @param {string} [filters.companyId] - Filter by company
   * @param {string} [filters.projectId] - Filter by project
   * @param {string} [filters.category] - Filter by category
   * @param {string} [filters.actorId] - Filter by actor
   * @param {string} [filters.entityType] - Filter by entity type
   * @param {string} [filters.entityId] - Filter by entity ID
   * @param {string} [filters.severity] - Filter by severity
   * @param {string} [filters.startDate] - Start date (ISO)
   * @param {string} [filters.endDate] - End date (ISO)
   * @param {Object} [options={}] - Query options
   * @param {number} [options.limit=50] - Maximum results
   * @param {number} [options.offset=0] - Offset for pagination
   * @param {string} [options.cursor] - Cursor for cursor-based pagination
   * @returns {Promise<Object>} Query results
   */
  async getActivityFeed(filters = {}, options = {}) {
    const {
      limit = 50,
      offset = 0,
      cursor
    } = options;

    const whereConditions = ['al.privacy_level != ? OR al.privacy_level IS NULL'];
    const params = ['restricted'];

    if (filters.companyId) {
      whereConditions.push('al.company_id = ?');
      params.push(filters.companyId);
    }
    if (filters.projectId) {
      whereConditions.push('al.project_id = ?');
      params.push(filters.projectId);
    }
    if (filters.category) {
      whereConditions.push('al.category_id = ?');
      params.push(filters.category);
    }
    if (filters.actorId) {
      whereConditions.push('al.actor_id = ?');
      params.push(filters.actorId);
    }
    if (filters.actorType) {
      whereConditions.push('al.actor_type = ?');
      params.push(filters.actorType);
    }
    if (filters.entityType) {
      whereConditions.push('al.entity_type = ?');
      params.push(filters.entityType);
    }
    if (filters.entityId) {
      whereConditions.push('al.entity_id = ?');
      params.push(filters.entityId);
    }
    if (filters.severity) {
      whereConditions.push('al.severity = ?');
      params.push(filters.severity);
    }
    if (filters.startDate) {
      whereConditions.push('al.occurred_at >= ?');
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      whereConditions.push('al.occurred_at <= ?');
      params.push(filters.endDate);
    }
    if (cursor) {
      whereConditions.push('al.occurred_at < ?');
      params.push(cursor);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countStmt = this.#db.prepare(`
      SELECT COUNT(*) as total FROM activity_log al WHERE ${whereClause}
    `);
    const { total } = countStmt.get(...params);

    // Get activities
    const query = `
      SELECT 
        al.*,
        ac.name as category_name,
        ac.color as category_color,
        ac.icon as category_icon
      FROM activity_log al
      LEFT JOIN activity_categories ac ON al.category_id = ac.id
      WHERE ${whereClause}
      ORDER BY al.occurred_at DESC
      LIMIT ? OFFSET ?
    `;

    const stmt = this.#db.prepare(query);
    const activities = stmt.all(...params, limit, offset);

    // Parse JSON fields
    const parsedActivities = activities.map(a => ({
      ...a,
      metadata_json: a.metadata_json ? JSON.parse(a.metadata_json) : null,
      pii_fields: a.pii_fields ? JSON.parse(a.pii_fields) : null
    }));

    // Get next cursor
    const nextCursor = parsedActivities.length > 0 
      ? parsedActivities[parsedActivities.length - 1].occurred_at
      : null;

    return {
      items: parsedActivities,
      total,
      limit,
      offset,
      hasMore: offset + parsedActivities.length < total,
      nextCursor
    };
  }

  /**
   * Get activity by entity
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Entity activity history
   */
  async getActivityByEntity(entityType, entityId, options = {}) {
    const { limit = 100, includeDetails = false } = options;

    const stmt = this.#db.prepare(`
      SELECT 
        al.*,
        ac.name as category_name,
        ac.color as category_color,
        ac.icon as category_icon
        ${includeDetails ? ', ald.changes_summary, ald.before_state, ald.after_state' : ''}
      FROM activity_log al
      LEFT JOIN activity_categories ac ON al.category_id = ac.id
      ${includeDetails ? 'LEFT JOIN activity_log_details ald ON al.id = ald.activity_id' : ''}
      WHERE al.entity_type = ? AND al.entity_id = ?
      ORDER BY al.occurred_at DESC
      LIMIT ?
    `);

    const activities = stmt.all(entityType, entityId, limit);

    // Get summary statistics
    const statsStmt = this.#db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failure_count,
        COUNT(DISTINCT actor_id) as unique_actors,
        MIN(occurred_at) as first_activity,
        MAX(occurred_at) as last_activity
      FROM activity_log
      WHERE entity_type = ? AND entity_id = ?
    `);

    const stats = statsStmt.get(entityType, entityId);

    return {
      entityType,
      entityId,
      stats: {
        ...stats,
        firstActivity: stats.first_activity,
        lastActivity: stats.last_activity
      },
      activities: activities.map(a => ({
        ...a,
        metadata_json: a.metadata_json ? JSON.parse(a.metadata_json) : null
      }))
    };
  }

  /**
   * Get single activity with details
   * @param {string} activityId - Activity ID
   * @returns {Promise<Object|null>} Activity or null
   */
  async getActivity(activityId) {
    const stmt = this.#db.prepare(`
      SELECT 
        al.*,
        ac.name as category_name,
        ac.color as category_color,
        ac.icon as category_icon,
        ald.request_headers,
        ald.request_body,
        ald.response_headers,
        ald.response_body,
        ald.before_state,
        ald.after_state,
        ald.changes_summary,
        ald.stack_trace,
        ald.debug_info
      FROM activity_log al
      LEFT JOIN activity_categories ac ON al.category_id = ac.id
      LEFT JOIN activity_log_details ald ON al.id = ald.activity_id
      WHERE al.id = ?
    `);

    const activity = stmt.get(activityId);
    if (!activity) return null;

    return {
      ...activity,
      metadata_json: activity.metadata_json ? JSON.parse(activity.metadata_json) : null,
      pii_fields: activity.pii_fields ? JSON.parse(activity.pii_fields) : null,
      request_headers: activity.request_headers ? JSON.parse(activity.request_headers) : null,
      response_headers: activity.response_headers ? JSON.parse(activity.response_headers) : null,
      before_state: activity.before_state ? JSON.parse(activity.before_state) : null,
      after_state: activity.after_state ? JSON.parse(activity.after_state) : null,
      changes_summary: activity.changes_summary ? JSON.parse(activity.changes_summary) : null
    };
  }

  // ========================================================================
  // Aggregation
  // ========================================================================

  /**
   * Get dashboard aggregations
   * @param {Object} [filters={}] - Filter options
   * @param {string} [filters.companyId] - Filter by company
   * @param {string} [filters.projectId] - Filter by project
   * @param {number} [filters.days=7] - Number of days
   * @returns {Promise<Object>} Dashboard data
   */
  async getDashboardAggregations(filters = {}) {
    const { companyId, projectId, days = 7 } = filters;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get or compute aggregates
    const aggregates = await this.#getOrComputeAggregates(startDate, companyId, projectId);

    // Get top actions
    const topActionsStmt = this.#db.prepare(`
      SELECT action, COUNT(*) as count
      FROM activity_log
      WHERE occurred_at >= ?
      ${companyId ? 'AND company_id = ?' : ''}
      ${projectId ? 'AND project_id = ?' : ''}
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `);

    const params = [startDate];
    if (companyId) params.push(companyId);
    if (projectId) params.push(projectId);

    const topActions = topActionsStmt.all(...params);

    // Get activity by category
    const categoryStmt = this.#db.prepare(`
      SELECT 
        al.category_id,
        ac.name as category_name,
        ac.color,
        COUNT(*) as count
      FROM activity_log al
      LEFT JOIN activity_categories ac ON al.category_id = ac.id
      WHERE al.occurred_at >= ?
      ${companyId ? 'AND al.company_id = ?' : ''}
      ${projectId ? 'AND al.project_id = ?' : ''}
      GROUP BY al.category_id
      ORDER BY count DESC
    `);

    const byCategory = categoryStmt.all(...params);

    // Get activity by actor type
    const actorTypeStmt = this.#db.prepare(`
      SELECT actor_type, COUNT(*) as count
      FROM activity_log
      WHERE occurred_at >= ?
      ${companyId ? 'AND company_id = ?' : ''}
      ${projectId ? 'AND project_id = ?' : ''}
      GROUP BY actor_type
    `);

    const byActorType = actorTypeStmt.all(...params);

    return {
      period: { days, startDate },
      aggregates,
      topActions,
      byCategory,
      byActorType,
      summary: {
        totalActivities: aggregates.total_count || 0,
        successRate: aggregates.total_count > 0 
          ? (aggregates.success_count / aggregates.total_count * 100).toFixed(1)
          : 0,
        uniqueActors: aggregates.unique_actors || 0
      }
    };
  }

  /**
   * Compute daily aggregates
   * @param {Date} date - Date to compute for
   * @returns {Promise<void>}
   */
  async computeDailyAggregates(date = new Date()) {
    const dateStr = date.toISOString().split('T')[0];

    const stmt = this.#db.prepare(`
      INSERT OR REPLACE INTO activity_log_aggregates (
        aggregate_date, granularity, company_id, project_id, category_id,
        total_count, success_count, failure_count,
        debug_count, info_count, notice_count, warning_count, error_count, critical_count, emergency_count,
        user_count, agent_count, system_count, api_key_count,
        unique_actors, unique_users, unique_agents,
        top_actions, hourly_distribution, computed_at
      )
      SELECT 
        date(occurred_at) as aggregate_date,
        'day' as granularity,
        company_id,
        project_id,
        category_id,
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failure_count,
        SUM(CASE WHEN severity = 'debug' THEN 1 ELSE 0 END) as debug_count,
        SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END) as info_count,
        SUM(CASE WHEN severity = 'notice' THEN 1 ELSE 0 END) as notice_count,
        SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning_count,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_count,
        SUM(CASE WHEN severity = 'emergency' THEN 1 ELSE 0 END) as emergency_count,
        SUM(CASE WHEN actor_type = 'user' THEN 1 ELSE 0 END) as user_count,
        SUM(CASE WHEN actor_type = 'agent' THEN 1 ELSE 0 END) as agent_count,
        SUM(CASE WHEN actor_type = 'system' THEN 1 ELSE 0 END) as system_count,
        SUM(CASE WHEN actor_type = 'api_key' THEN 1 ELSE 0 END) as api_key_count,
        COUNT(DISTINCT actor_id) as unique_actors,
        COUNT(DISTINCT CASE WHEN actor_type = 'user' THEN actor_id END) as unique_users,
        COUNT(DISTINCT CASE WHEN actor_type = 'agent' THEN actor_id END) as unique_agents,
        (
          SELECT json_group_array(json_object('action', action, 'count', cnt))
          FROM (
            SELECT action, COUNT(*) as cnt
            FROM activity_log al2
            WHERE date(al2.occurred_at) = date(activity_log.occurred_at)
              AND (al2.company_id IS activity_log.company_id OR (al2.company_id IS NULL AND activity_log.company_id IS NULL))
            GROUP BY action
            ORDER BY cnt DESC
            LIMIT 5
          )
        ) as top_actions,
        (
          SELECT json_object(
            '00', SUM(CASE WHEN strftime('%H', occurred_at) = '00' THEN 1 ELSE 0 END),
            '01', SUM(CASE WHEN strftime('%H', occurred_at) = '01' THEN 1 ELSE 0 END),
            '02', SUM(CASE WHEN strftime('%H', occurred_at) = '02' THEN 1 ELSE 0 END),
            '03', SUM(CASE WHEN strftime('%H', occurred_at) = '03' THEN 1 ELSE 0 END),
            '04', SUM(CASE WHEN strftime('%H', occurred_at) = '04' THEN 1 ELSE 0 END),
            '05', SUM(CASE WHEN strftime('%H', occurred_at) = '05' THEN 1 ELSE 0 END),
            '06', SUM(CASE WHEN strftime('%H', occurred_at) = '06' THEN 1 ELSE 0 END),
            '07', SUM(CASE WHEN strftime('%H', occurred_at) = '07' THEN 1 ELSE 0 END),
            '08', SUM(CASE WHEN strftime('%H', occurred_at) = '08' THEN 1 ELSE 0 END),
            '09', SUM(CASE WHEN strftime('%H', occurred_at) = '09' THEN 1 ELSE 0 END),
            '10', SUM(CASE WHEN strftime('%H', occurred_at) = '10' THEN 1 ELSE 0 END),
            '11', SUM(CASE WHEN strftime('%H', occurred_at) = '11' THEN 1 ELSE 0 END),
            '12', SUM(CASE WHEN strftime('%H', occurred_at) = '12' THEN 1 ELSE 0 END),
            '13', SUM(CASE WHEN strftime('%H', occurred_at) = '13' THEN 1 ELSE 0 END),
            '14', SUM(CASE WHEN strftime('%H', occurred_at) = '14' THEN 1 ELSE 0 END),
            '15', SUM(CASE WHEN strftime('%H', occurred_at) = '15' THEN 1 ELSE 0 END),
            '16', SUM(CASE WHEN strftime('%H', occurred_at) = '16' THEN 1 ELSE 0 END),
            '17', SUM(CASE WHEN strftime('%H', occurred_at) = '17' THEN 1 ELSE 0 END),
            '18', SUM(CASE WHEN strftime('%H', occurred_at) = '18' THEN 1 ELSE 0 END),
            '19', SUM(CASE WHEN strftime('%H', occurred_at) = '19' THEN 1 ELSE 0 END),
            '20', SUM(CASE WHEN strftime('%H', occurred_at) = '20' THEN 1 ELSE 0 END),
            '21', SUM(CASE WHEN strftime('%H', occurred_at) = '21' THEN 1 ELSE 0 END),
            '22', SUM(CASE WHEN strftime('%H', occurred_at) = '22' THEN 1 ELSE 0 END),
            '23', SUM(CASE WHEN strftime('%H', occurred_at) = '23' THEN 1 ELSE 0 END)
          )
        ) as hourly_distribution,
        CURRENT_TIMESTAMP as computed_at
      FROM activity_log
      WHERE date(occurred_at) = ?
      GROUP BY date(occurred_at), company_id, project_id, category_id
    `);

    stmt.run(dateStr);
  }

  // ========================================================================
  // Subscription Management
  // ========================================================================

  /**
   * Subscribe to activity events
   * @param {string} subscriptionId - Subscription identifier
   * @param {Object} filters - Filter criteria
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  subscribe(subscriptionId, filters, handler) {
    this.#subscriptions.set(subscriptionId, { filters, handler });
    
    return () => {
      this.#subscriptions.delete(subscriptionId);
    };
  }

  /**
   * Register activity hook
   * @param {string} action - Action pattern (supports wildcards)
   * @param {Function} handler - Hook handler
   */
  on(action, handler) {
    if (!this.#hooks.has(action)) {
      this.#hooks.set(action, []);
    }
    this.#hooks.get(action).push(handler);
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  #inferCategory(action) {
    if (action.startsWith('auth.')) return 'auth';
    if (action.startsWith('data.')) return 'data';
    if (action.startsWith('admin.')) return 'admin';
    if (action.startsWith('agent.')) return 'agent';
    if (action.startsWith('security.')) return 'security';
    if (action.startsWith('system.')) return 'system';
    if (action.startsWith('integration.')) return 'integration';
    if (action.startsWith('user.')) return 'user';
    return 'system';
  }

  #determinePrivacyLevel(action, category, details) {
    // Security and auth events are often sensitive
    if (category === 'security' || category === 'auth') {
      return 'sensitive';
    }
    // Check for PII in details
    if (details && this.#hasSensitiveData(details)) {
      return 'sensitive';
    }
    return 'standard';
  }

  #hasSensitiveData(data) {
    const json = JSON.stringify(data).toLowerCase();
    return PII_PATTERNS.some(pattern => json.includes(pattern.toLowerCase()));
  }

  #sanitizeDetails(details, privacyLevel) {
    const rules = PRIVACY_RULES[privacyLevel] || PRIVACY_RULES.standard;
    
    if (!rules.redactFields) {
      // Restricted level - return empty
      return {};
    }

    return this.#deepRedact(details, rules.redactFields);
  }

  #deepRedact(obj, fieldsToRedact) {
    if (!obj || typeof obj !== 'object') return obj;

    const redacted = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key of Object.keys(redacted)) {
      const lowerKey = key.toLowerCase();
      if (fieldsToRedact.some(f => lowerKey.includes(f.toLowerCase()))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof redacted[key] === 'object') {
        redacted[key] = this.#deepRedact(redacted[key], fieldsToRedact);
      }
    }

    return redacted;
  }

  #detectPIIFields(details) {
    const fields = [];
    const json = JSON.stringify(details).toLowerCase();
    
    for (const pattern of PII_PATTERNS) {
      if (json.includes(pattern.toLowerCase())) {
        fields.push(pattern);
      }
    }
    
    return fields;
  }

  #getRetentionDays(category) {
    const stmt = this.#db.prepare('SELECT retention_days FROM activity_categories WHERE id = ?');
    const result = stmt.get(category);
    return result?.retention_days || 90;
  }

  #computeEntryHash(data) {
    const hashData = this.#config.enableChaining && this.#lastHash
      ? `${JSON.stringify(data)}|${this.#lastHash}`
      : JSON.stringify(data);
    return createHash('sha256').update(hashData).digest('hex');
  }

  #generateSummary(action, entityType, entityId) {
    const parts = action.split('.');
    const verb = parts[parts.length - 1];
    return `${verb} ${entityType} ${entityId}`;
  }

  async #storeActivityDetails(activityId, details, context, privacyLevel) {
    const rules = PRIVACY_RULES[privacyLevel];

    const detailsRecord = {
      id: randomUUID(),
      activity_id: activityId,
      request_headers: context.headers && rules.includeRequestBody
        ? JSON.stringify(this.#sanitizeHeaders(context.headers))
        : null,
      request_body: details.request && rules.includeRequestBody
        ? JSON.stringify(details.request)
        : null,
      request_body_size: details.request ? JSON.stringify(details.request).length : 0,
      response_headers: context.responseHeaders && rules.includeResponseBody
        ? JSON.stringify(context.responseHeaders)
        : null,
      response_body: details.response && rules.includeResponseBody
        ? JSON.stringify(details.response).substring(0, 10000) // Truncate large responses
        : null,
      response_body_size: details.response ? JSON.stringify(details.response).length : 0,
      before_state: details.before ? JSON.stringify(details.before) : null,
      after_state: details.after ? JSON.stringify(details.after) : null,
      changes_summary: details.changes ? JSON.stringify(details.changes) : null,
      stack_trace: details.error?.stack || null,
      debug_info: details.debug ? JSON.stringify(details.debug) : null
    };

    const stmt = this.#db.prepare(`
      INSERT INTO activity_log_details (
        id, activity_id, request_headers, request_body, request_body_size,
        response_headers, response_body, response_body_size,
        before_state, after_state, changes_summary, stack_trace, debug_info
      ) VALUES (
        @id, @activity_id, @request_headers, @request_body, @request_body_size,
        @response_headers, @response_body, @response_body_size,
        @before_state, @after_state, @changes_summary, @stack_trace, @debug_info
      )
    `);

    stmt.run(detailsRecord);
  }

  #sanitizeHeaders(headers) {
    const sensitive = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    const sanitized = { ...headers };
    
    for (const key of Object.keys(sanitized)) {
      if (sensitive.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  #notifySubscribers(activity) {
    for (const [id, { filters, handler }] of this.#subscriptions) {
      if (this.#matchesFilters(activity, filters)) {
        try {
          handler(activity);
        } catch (error) {
          console.error(`Subscription ${id} handler error:`, error);
        }
      }
    }
  }

  #matchesFilters(activity, filters) {
    if (filters.category && activity.category_id !== filters.category) return false;
    if (filters.severity && activity.severity !== filters.severity) return false;
    if (filters.actorType && activity.actor_type !== filters.actorType) return false;
    if (filters.entityType && activity.entity_type !== filters.entityType) return false;
    if (filters.action && activity.action !== filters.action) return false;
    return true;
  }

  async #callHooks(action, activity) {
    for (const [pattern, handlers] of this.#hooks) {
      if (this.#matchPattern(action, pattern)) {
        for (const handler of handlers) {
          try {
            await handler(activity);
          } catch (error) {
            console.error(`Hook error for ${pattern}:`, error);
          }
        }
      }
    }
  }

  #matchPattern(action, pattern) {
    if (pattern === action) return true;
    if (pattern.endsWith('*')) {
      return action.startsWith(pattern.slice(0, -1));
    }
    return false;
  }

  async #getOrComputeAggregates(startDate, companyId, projectId) {
    // Try to get existing aggregates
    const whereConditions = ['aggregate_date >= date(?)'];
    const params = [startDate];

    if (companyId) {
      whereConditions.push('company_id = ?');
      params.push(companyId);
    } else {
      whereConditions.push('company_id IS NULL');
    }

    if (projectId) {
      whereConditions.push('project_id = ?');
      params.push(projectId);
    } else {
      whereConditions.push('project_id IS NULL');
    }

    const stmt = this.#db.prepare(`
      SELECT 
        SUM(total_count) as total_count,
        SUM(success_count) as success_count,
        SUM(failure_count) as failure_count,
        SUM(unique_actors) as unique_actors
      FROM activity_log_aggregates
      WHERE ${whereConditions.join(' AND ')}
    `);

    const result = stmt.get(...params);

    // If no aggregates exist, compute them
    if (!result || result.total_count === null) {
      await this.computeDailyAggregates();
      return this.#getOrComputeAggregates(startDate, companyId, projectId);
    }

    return result;
  }

  #startAggregationTimer() {
    // Aggregation timer would be implemented with setInterval in production
    // For now, compute on demand
  }

  #stopAggregationTimer() {
    // Cleanup timer
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance = null;

/**
 * Get default activity service instance
 * @param {Object} [config] - Configuration options
 * @returns {ActivityService}
 */
export function getActivityService(config) {
  if (!defaultInstance) {
    defaultInstance = new ActivityService(config);
  }
  return defaultInstance;
}

/**
 * Reset default instance (primarily for testing)
 */
export function resetActivityService() {
  if (defaultInstance) {
    defaultInstance.shutdown();
    defaultInstance = null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export default ActivityService;
