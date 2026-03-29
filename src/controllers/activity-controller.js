/**
 * @fileoverview Activity Controller - REST API for activity logging and auditing
 * @module controllers/activity-controller
 * @version 5.0.0
 */

import { z } from 'zod';
import { getActivityService } from '../domains/activity/index.js';

/**
 * Validation schemas
 */
const activityFeedSchema = z.object({
  companyId: z.string().optional(),
  projectId: z.string().optional(),
  category: z.string().optional(),
  actorId: z.string().optional(),
  actorType: z.enum(['user', 'agent', 'system', 'api_key']).optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  severity: z.enum(['debug', 'info', 'notice', 'warning', 'error', 'critical', 'emergency']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
  cursor: z.string().optional()
});

const dashboardSchema = z.object({
  companyId: z.string().optional(),
  projectId: z.string().optional(),
  days: z.number().min(1).max(90).default(7)
});

const exportSchema = z.object({
  format: z.enum(['csv', 'json']).default('json'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  category: z.string().optional(),
  severity: z.string().optional()
});

const subscribeSchema = z.object({
  channels: z.array(z.string()).min(1),
  filters: z.record(z.any()).optional()
});

const acknowledgeAlertSchema = z.object({
  reason: z.string().optional()
});

/**
 * ActivityController - API endpoints for activity logging
 */
export class ActivityController {
  /**
   * Create an ActivityController
   * @param {Object} options - Configuration options
   * @param {import('../domains/activity/activity-service.js').ActivityService} options.activityService - Activity service
   * @param {import('../websocket/server.js').WebSocketServer} options.wsServer - WebSocket server
   */
  constructor(options = {}) {
    this.activityService = options.activityService || getActivityService();
    this.wsServer = options.wsServer;
    this.prefix = '/api/activity';
    this.alertSubscriptions = new Map();
  }

  /**
   * Initialize the controller
   * @returns {Promise<ActivityController>}
   */
  async initialize() {
    return this;
  }

  /**
   * Handle HTTP requests
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @returns {Promise<boolean>} True if request was handled
   */
  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Skip if not our prefix
    if (!pathname.startsWith(this.prefix)) {
      return false;
    }

    // GET /api/activity - Activity feed
    if (pathname === this.prefix && req.method === 'GET') {
      return this._getActivityFeed(req, res, url);
    }

    // GET /api/activity/dashboard - Dashboard aggregations
    if (pathname === `${this.prefix}/dashboard` && req.method === 'GET') {
      return this._getDashboard(req, res, url);
    }

    // GET /api/activity/entity/:type/:id - Entity activity
    const entityMatch = pathname.match(new RegExp(`^${this.prefix}/entity/([^/]+)/([^/]+)$`));
    if (entityMatch && req.method === 'GET') {
      return this._getEntityActivity(req, res, entityMatch[1], entityMatch[2], url);
    }

    // GET /api/activity/security - Security events
    if (pathname === `${this.prefix}/security` && req.method === 'GET') {
      return this._getSecurityEvents(req, res, url);
    }

    // GET /api/activity/alerts - Anomaly alerts
    if (pathname === `${this.prefix}/alerts` && req.method === 'GET') {
      return this._getAlerts(req, res, url);
    }

    // POST /api/activity/alerts/:id/acknowledge - Acknowledge alert
    const acknowledgeMatch = pathname.match(new RegExp(`^${this.prefix}/alerts/([^/]+)/acknowledge$`));
    if (acknowledgeMatch && req.method === 'POST') {
      return this._acknowledgeAlert(req, res, acknowledgeMatch[1]);
    }

    // GET /api/activity/export - Export activity
    if (pathname === `${this.prefix}/export` && req.method === 'GET') {
      return this._exportActivity(req, res, url);
    }

    // POST /api/activity/subscribe - WebSocket subscription setup
    if (pathname === `${this.prefix}/subscribe` && req.method === 'POST') {
      return this._subscribe(req, res);
    }

    // GET /api/activity/:id - Get single activity
    const activityMatch = pathname.match(new RegExp(`^${this.prefix}/([^/]+)$`));
    if (activityMatch && req.method === 'GET') {
      return this._getActivity(req, res, activityMatch[1]);
    }

    return false;
  }

  // ============================================
  // Activity Feed Endpoints
  // ============================================

  async _getActivityFeed(req, res, url) {
    try {
      if (!this.activityService) {
        this._sendError(res, 503, 'Activity service not available');
        return true;
      }

      const query = Object.fromEntries(url.searchParams);
      const filters = activityFeedSchema.parse({
        companyId: query.companyId,
        projectId: query.projectId,
        category: query.category,
        actorId: query.actorId,
        actorType: query.actorType,
        entityType: query.entityType,
        entityId: query.entityId,
        severity: query.severity,
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit ? parseInt(query.limit, 10) : 50,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
        cursor: query.cursor
      });

      const result = await this.activityService.getActivityFeed(filters, {
        limit: filters.limit,
        offset: filters.offset,
        cursor: filters.cursor
      });

      this._sendJson(res, 200, result);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this._sendError(res, 400, 'Validation error', error.errors);
      } else {
        this._sendError(res, 500, error.message);
      }
      return true;
    }
  }

  async _getActivity(req, res, activityId) {
    try {
      if (!this.activityService) {
        this._sendError(res, 503, 'Activity service not available');
        return true;
      }

      const activity = await this.activityService.getActivity(activityId);

      if (!activity) {
        this._sendError(res, 404, 'Activity not found');
        return true;
      }

      this._sendJson(res, 200, { activity });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  // ============================================
  // Dashboard Endpoints
  // ============================================

  async _getDashboard(req, res, url) {
    try {
      if (!this.activityService) {
        this._sendError(res, 503, 'Activity service not available');
        return true;
      }

      const query = Object.fromEntries(url.searchParams);
      const filters = dashboardSchema.parse({
        companyId: query.companyId,
        projectId: query.projectId,
        days: query.days ? parseInt(query.days, 10) : 7
      });

      const aggregations = await this.activityService.getDashboardAggregations({
        companyId: filters.companyId,
        projectId: filters.projectId,
        days: filters.days
      });

      this._sendJson(res, 200, aggregations);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this._sendError(res, 400, 'Validation error', error.errors);
      } else {
        this._sendError(res, 500, error.message);
      }
      return true;
    }
  }

  // ============================================
  // Entity Activity Endpoints
  // ============================================

  async _getEntityActivity(req, res, entityType, entityId, url) {
    try {
      if (!this.activityService) {
        this._sendError(res, 503, 'Activity service not available');
        return true;
      }

      const includeDetails = url.searchParams.get('includeDetails') === 'true';
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);

      const result = await this.activityService.getActivityByEntity(entityType, entityId, {
        limit,
        includeDetails
      });

      if (!result || result.activities.length === 0) {
        this._sendJson(res, 200, {
          entityType,
          entityId,
          stats: {
            total: 0,
            successCount: 0,
            failureCount: 0,
            uniqueActors: 0,
            firstActivity: null,
            lastActivity: null
          },
          activities: []
        });
        return true;
      }

      this._sendJson(res, 200, result);
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  // ============================================
  // Security Events Endpoints
  // ============================================

  async _getSecurityEvents(req, res, url) {
    try {
      if (!this.activityService) {
        this._sendError(res, 503, 'Activity service not available');
        return true;
      }

      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const severity = url.searchParams.get('severity');
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const filters = {
        category: 'security',
        startDate,
        endDate,
        severity: severity || undefined
      };

      const result = await this.activityService.getActivityFeed(filters, { limit, offset });

      // Add security-specific metadata
      const securityStats = {
        criticalCount: result.items.filter(a => a.severity === 'critical').length,
        errorCount: result.items.filter(a => a.severity === 'error').length,
        warningCount: result.items.filter(a => a.severity === 'warning').length,
        uniqueIPs: [...new Set(result.items.map(a => a.ip_address).filter(Boolean))].length
      };

      this._sendJson(res, 200, {
        ...result,
        securityStats,
        filters: { startDate, endDate, severity }
      });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  // ============================================
  // Alert Endpoints
  // ============================================

  async _getAlerts(req, res, url) {
    try {
      const acknowledged = url.searchParams.get('acknowledged');
      const severity = url.searchParams.get('severity');
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);

      // Query anomaly alerts from database
      // Note: In a full implementation, this would query an anomaly detection service
      const alerts = await this._fetchAlerts({
        acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
        severity,
        limit
      });

      this._sendJson(res, 200, {
        alerts,
        total: alerts.length,
        unacknowledged: alerts.filter(a => !a.acknowledged).length
      });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _acknowledgeAlert(req, res, alertId) {
    try {
      const body = await this._readJsonBody(req).catch(() => ({}));
      const params = acknowledgeAlertSchema.parse(body);

      // Acknowledge the alert
      const acknowledged = await this._acknowledgeAlertById(alertId, {
        reason: params.reason,
        acknowledgedAt: new Date().toISOString()
      });

      if (!acknowledged) {
        this._sendError(res, 404, 'Alert not found');
        return true;
      }

      this._sendJson(res, 200, {
        alertId,
        acknowledged: true,
        reason: params.reason
      });
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this._sendError(res, 400, 'Validation error', error.errors);
      } else {
        this._sendError(res, 500, error.message);
      }
      return true;
    }
  }

  // ============================================
  // Export Endpoints
  // ============================================

  async _exportActivity(req, res, url) {
    try {
      if (!this.activityService) {
        this._sendError(res, 503, 'Activity service not available');
        return true;
      }

      const query = Object.fromEntries(url.searchParams);
      const params = exportSchema.parse({
        format: query.format || 'json',
        startDate: query.startDate,
        endDate: query.endDate,
        category: query.category,
        severity: query.severity
      });

      const filters = {
        startDate: params.startDate,
        endDate: params.endDate,
        category: params.category,
        severity: params.severity
      };

      // Get all matching activities (higher limit for export)
      const result = await this.activityService.getActivityFeed(filters, { limit: 10000, offset: 0 });

      if (params.format === 'csv') {
        const csv = this._convertToCsv(result.items);
        res.writeHead(200, {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="activity-export-${new Date().toISOString().split('T')[0]}.csv"`
        });
        res.end(csv);
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="activity-export-${new Date().toISOString().split('T')[0]}.json"`
        });
        res.end(JSON.stringify({ activities: result.items, exportedAt: new Date().toISOString() }, null, 2));
      }

      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this._sendError(res, 400, 'Validation error', error.errors);
      } else {
        this._sendError(res, 500, error.message);
      }
      return true;
    }
  }

  // ============================================
  // WebSocket Subscription Endpoints
  // ============================================

  async _subscribe(req, res) {
    try {
      if (!this.wsServer) {
        this._sendError(res, 503, 'WebSocket server not available');
        return true;
      }

      const body = await this._readJsonBody(req);
      const params = subscribeSchema.parse(body);

      // Generate subscription ID
      const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store subscription
      this.alertSubscriptions.set(subscriptionId, {
        channels: params.channels,
        filters: params.filters || {},
        createdAt: new Date().toISOString()
      });

      // Set up activity service subscription if activityService supports it
      if (this.activityService && typeof this.activityService.subscribe === 'function') {
        this.activityService.subscribe(subscriptionId, params.filters, (activity) => {
          // Broadcast to WebSocket subscribers on matching channels
          for (const channel of params.channels) {
            this.wsServer.broadcastToRoom(channel, {
              type: 'activity',
              subscriptionId,
              activity
            });
          }
        });
      }

      this._sendJson(res, 201, {
        subscriptionId,
        channels: params.channels,
        wsEndpoint: '/ws',
        message: 'Connect to WebSocket and subscribe to the specified channels'
      });
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this._sendError(res, 400, 'Validation error', error.errors);
      } else {
        this._sendError(res, 500, error.message);
      }
      return true;
    }
  }

  // ============================================
  // Real-time Broadcasting
  // ============================================

  /**
   * Broadcast activity to WebSocket subscribers
   * @param {Object} activity - Activity to broadcast
   * @param {string[]} channels - Channels to broadcast to
   */
  broadcastActivity(activity, channels = ['activity']) {
    if (!this.wsServer) return;

    for (const channel of channels) {
      this.wsServer.broadcastToRoom(channel, {
        type: 'activity:new',
        activity,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Broadcast alert to WebSocket subscribers
   * @param {Object} alert - Alert to broadcast
   */
  broadcastAlert(alert) {
    if (!this.wsServer) return;

    this.wsServer.broadcastToRoom('alerts', {
      type: 'alert:new',
      alert,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // Private Helpers
  // ============================================

  async _fetchAlerts(filters = {}) {
    // In a full implementation, this would query an anomaly detection service
    // For now, return mock data structure
    return Array.from({ length: filters.limit || 20 }, (_, i) => ({
      id: `alert_${i + 1}`,
      type: ['rate_limit', 'unusual_pattern', 'security', 'performance'][i % 4],
      severity: ['warning', 'error', 'critical'][i % 3],
      message: `Sample alert ${i + 1}`,
      acknowledged: filters.acknowledged !== undefined ? filters.acknowledged : i % 3 === 0,
      acknowledgedBy: i % 3 === 0 ? 'admin' : null,
      acknowledgedAt: i % 3 === 0 ? new Date().toISOString() : null,
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
      metadata: {}
    }));
  }

  async _acknowledgeAlertById(_alertId, _data) {
    // In a full implementation, this would update the anomaly detection service
    return true;
  }

  _convertToCsv(items) {
    if (items.length === 0) return '';

    const headers = ['id', 'action', 'actor_type', 'actor_id', 'entity_type', 'entity_id', 'severity', 'status', 'occurred_at'];
    const rows = items.map(item => [
      item.id,
      item.action,
      item.actor_type,
      item.actor_id,
      item.entity_type,
      item.entity_id,
      item.severity,
      item.status,
      item.occurred_at
    ]);

    return [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  }

  async _readJsonBody(req) {
    const chunks = [];

    try {
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      if (chunks.length === 0) {
        return {};
      }

      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        return {};
      }

      return JSON.parse(raw);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON body: ${error.message}`);
      }
      throw error;
    }
  }

  _sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }

  _sendError(res, statusCode, message, details = null) {
    const payload = { error: message };
    if (details) {
      payload.details = details;
    }
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }
}

export default ActivityController;
