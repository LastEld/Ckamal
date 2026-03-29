/**
 * @fileoverview Heartbeat Runtime API Controller
 * RESTful API endpoints for heartbeat runs, sessions, and cost tracking.
 * @module controllers/heartbeat
 */

import { z } from 'zod';


/**
 * Validation schemas
 */
const createRunSchema = z.object({
  agentId: z.string().min(1),
  invocationSource: z.enum(['timer', 'assignment', 'on_demand', 'automation']).optional(),
  triggerDetail: z.enum(['manual', 'ping', 'callback', 'system']).optional(),
  contextSnapshot: z.record(z.any()).optional(),
  sessionIdBefore: z.string().optional(),
  externalRunId: z.string().optional()
});

const wakeupSchema = z.object({
  source: z.enum(['timer', 'assignment', 'on_demand', 'automation']).optional(),
  triggerDetail: z.enum(['manual', 'ping', 'callback', 'system']).optional(),
  reason: z.string().optional(),
  payload: z.record(z.any()).optional(),
  taskKey: z.string().optional(),
  idempotencyKey: z.string().optional()
});

const listRunsSchema = z.object({
  agentId: z.string().optional(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out']).optional(),
  invocationSource: z.enum(['timer', 'assignment', 'on_demand', 'automation']).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

/**
 * HeartbeatController - API endpoints for heartbeat runtime
 */
export class HeartbeatController {
  /**
   * Create a HeartbeatController
   * @param {Object} options - Configuration options
   * @param {import('../runtime/heartbeat-service.js').HeartbeatService} options.heartbeatService - Heartbeat service
   * @param {import('../runtime/session-manager.js').SessionManager} options.sessionManager - Session manager
   * @param {import('../bios/spawn-manager.js').SpawnManager} options.spawnManager - Spawn manager
   */
  constructor(options = {}) {
    this.heartbeatService = options.heartbeatService;
    this.sessionManager = options.sessionManager;
    this.spawnManager = options.spawnManager;
    this.prefix = '/api/heartbeat';
  }

  /**
   * Initialize the controller
   * @returns {Promise<HeartbeatController>}
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

    // GET /api/heartbeat/runs - List runs
    if (pathname === `${this.prefix}/runs` && req.method === 'GET') {
      return this._listRuns(req, res, url);
    }

    // POST /api/heartbeat/runs - Create a run
    if (pathname === `${this.prefix}/runs` && req.method === 'POST') {
      return this._createRun(req, res);
    }

    // GET /api/heartbeat/runs/:id - Get run details
    const runDetailMatch = pathname.match(new RegExp(`^${this.prefix}/runs/([^/]+)$`));
    if (runDetailMatch && req.method === 'GET') {
      return this._getRun(req, res, runDetailMatch[1]);
    }

    // POST /api/heartbeat/runs/:id/cancel - Cancel a run
    const cancelMatch = pathname.match(new RegExp(`^${this.prefix}/runs/([^/]+)/cancel$`));
    if (cancelMatch && req.method === 'POST') {
      return this._cancelRun(req, res, cancelMatch[1]);
    }

    // POST /api/heartbeat/runs/:id/retry - Retry a run
    const retryMatch = pathname.match(new RegExp(`^${this.prefix}/runs/([^/]+)/retry$`));
    if (retryMatch && req.method === 'POST') {
      return this._retryRun(req, res, retryMatch[1]);
    }

    // GET /api/heartbeat/runs/:id/events - Get run events
    const eventsMatch = pathname.match(new RegExp(`^${this.prefix}/runs/([^/]+)/events$`));
    if (eventsMatch && req.method === 'GET') {
      return this._getRunEvents(req, res, eventsMatch[1], url);
    }

    // GET /api/heartbeat/runs/:id/log - Stream run log
    const logMatch = pathname.match(new RegExp(`^${this.prefix}/runs/([^/]+)/log$`));
    if (logMatch && req.method === 'GET') {
      return this._streamRunLog(req, res, logMatch[1]);
    }

    // GET /api/heartbeat/runs/:id/cost - Get run cost
    const costMatch = pathname.match(new RegExp(`^${this.prefix}/runs/([^/]+)/cost$`));
    if (costMatch && req.method === 'GET') {
      return this._getRunCost(req, res, costMatch[1]);
    }

    // Agent Wakeup endpoints
    // POST /api/heartbeat/agents/:id/wakeup - Wake up an agent
    const wakeupMatch = pathname.match(new RegExp(`^${this.prefix}/agents/([^/]+)/wakeup$`));
    if (wakeupMatch && req.method === 'POST') {
      return this._wakeupAgent(req, res, wakeupMatch[1]);
    }

    // GET /api/heartbeat/agents/:id/wakeup - List wakeup history
    const wakeupHistoryMatch = pathname.match(new RegExp(`^${this.prefix}/agents/([^/]+)/wakeup$`));
    if (wakeupHistoryMatch && req.method === 'GET') {
      return this._listWakeupHistory(req, res, wakeupHistoryMatch[1], url);
    }

    // Session endpoints
    // GET /api/heartbeat/agents/:id/sessions - List agent sessions
    const sessionsMatch = pathname.match(new RegExp(`^${this.prefix}/agents/([^/]+)/sessions$`));
    if (sessionsMatch && req.method === 'GET') {
      return this._listSessions(req, res, sessionsMatch[1], url);
    }

    // DELETE /api/heartbeat/agents/:id/sessions - Clear agent sessions
    if (sessionsMatch && req.method === 'DELETE') {
      return this._clearAgentSessions(req, res, sessionsMatch[1]);
    }

    // DELETE /api/heartbeat/sessions/:id - Clear specific session
    const sessionMatch = pathname.match(new RegExp(`^${this.prefix}/sessions/([^/]+)$`));
    if (sessionMatch && req.method === 'DELETE') {
      return this._clearSession(req, res, sessionMatch[1]);
    }

    // Cost summary endpoints
    // GET /api/heartbeat/costs - Get cost summary
    if (pathname === `${this.prefix}/costs` && req.method === 'GET') {
      return this._getCostSummary(req, res, url);
    }

    // GET /api/heartbeat/costs/agents/:id - Get agent costs
    const agentCostMatch = pathname.match(new RegExp(`^${this.prefix}/costs/agents/([^/]+)$`));
    if (agentCostMatch && req.method === 'GET') {
      return this._getAgentCosts(req, res, agentCostMatch[1], url);
    }

    // Health check
    if (pathname === `${this.prefix}/health` && req.method === 'GET') {
      return this._healthCheck(req, res);
    }

    return false;
  }

  // ============================================
  // Run Endpoints
  // ============================================

  async _listRuns(req, res, url) {
    try {
      const query = Object.fromEntries(url.searchParams);
      const filters = listRunsSchema.parse({
        agentId: query.agentId,
        status: query.status,
        invocationSource: query.invocationSource,
        limit: query.limit ? parseInt(query.limit, 10) : 20,
        offset: query.offset ? parseInt(query.offset, 10) : 0
      });

      const runs = await this.heartbeatService.listRuns(filters);

      this._sendJson(res, 200, {
        runs,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          total: runs.length // Note: This should be a count query in production
        }
      });
      return true;
    } catch (error) {
      this._sendError(res, 400, error.message);
      return true;
    }
  }

  async _createRun(req, res) {
    try {
      if (!this.heartbeatService) {
        this._sendError(res, 503, 'Heartbeat service not available');
        return true;
      }

      const body = await this._readJsonBody(req);
      const params = createRunSchema.parse(body);

      const run = await this.heartbeatService.createRun(params);

      this._sendJson(res, 201, { run });
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

  async _getRun(req, res, runId) {
    try {
      if (!this.heartbeatService) {
        this._sendError(res, 503, 'Heartbeat service not available');
        return true;
      }

      const run = await this.heartbeatService.getRun(runId);

      if (!run) {
        this._sendError(res, 404, 'Run not found');
        return true;
      }

      this._sendJson(res, 200, { run });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _cancelRun(req, res, runId) {
    try {
      if (!this.heartbeatService) {
        this._sendError(res, 503, 'Heartbeat service not available');
        return true;
      }

      const body = await this._readJsonBody(req).catch(() => ({}));
      const run = await this.heartbeatService.cancelRun(runId, body.reason);

      if (!run) {
        this._sendError(res, 404, 'Run not found or cannot be cancelled');
        return true;
      }

      this._sendJson(res, 200, { run });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _retryRun(req, res, runId) {
    try {
      if (!this.heartbeatService) {
        this._sendError(res, 503, 'Heartbeat service not available');
        return true;
      }

      const body = await this._readJsonBody(req).catch(() => ({}));
      const newRun = await this.heartbeatService.retryRun(runId, body);

      if (!newRun) {
        this._sendError(res, 400, 'Run cannot be retried (must be failed)');
        return true;
      }

      this._sendJson(res, 201, { run: newRun });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _getRunEvents(req, res, runId, url) {
    try {
      if (!this.heartbeatService) {
        this._sendError(res, 503, 'Heartbeat service not available');
        return true;
      }

      const sinceSeq = url.searchParams.get('sinceSeq');
      const limit = url.searchParams.get('limit');

      const options = {
        sinceSeq: sinceSeq ? parseInt(sinceSeq, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined
      };

      const events = await this.heartbeatService.getRunEvents(runId, options);

      this._sendJson(res, 200, { events, runId });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _streamRunLog(req, res, runId) {
    try {
      if (!this.heartbeatService) {
        this._sendError(res, 503, 'Heartbeat service not available');
        return true;
      }

      const run = await this.heartbeatService.getRun(runId);
      if (!run) {
        this._sendError(res, 404, 'Run not found');
        return true;
      }

      res.writeHead(200, { 
        'Content-Type': 'text/plain',
        'Transfer-Encoding': 'chunked'
      });

      await this.heartbeatService.streamRunLog(runId, (entry) => {
        res.write(`[${entry.stream}] ${entry.chunk}\n`);
      });

      res.end();
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _getRunCost(req, res, runId) {
    try {
      if (!this.heartbeatService) {
        this._sendError(res, 503, 'Heartbeat service not available');
        return true;
      }

      const cost = await this.heartbeatService.getRunCost(runId);

      if (!cost) {
        this._sendJson(res, 200, { runId, cost: null, message: 'No cost data available' });
        return true;
      }

      this._sendJson(res, 200, { runId, cost });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  // ============================================
  // Agent Wakeup Endpoints
  // ============================================

  async _wakeupAgent(req, res, agentId) {
    try {
      const body = await this._readJsonBody(req).catch(() => ({}));
      const params = wakeupSchema.parse(body);

      // Create a run for this wakeup
      const run = await this.heartbeatService.createRun({
        agentId,
        invocationSource: params.source || 'on_demand',
        triggerDetail: params.triggerDetail || 'manual',
        contextSnapshot: {
          ...params.payload,
          taskKey: params.taskKey,
          wakeReason: params.reason
        }
      });

      // Attempt to spawn the agent with this run
      if (this.spawnManager) {
        // Check if agent already exists
        const existingStatus = this.spawnManager.getAgentStatus(agentId);
        
        if (existingStatus) {
          // Agent exists, start heartbeat run
          await this.spawnManager.startHeartbeatRun(agentId, {
            taskKey: params.taskKey,
            invocationSource: params.source,
            triggerDetail: params.triggerDetail
          });
        } else {
          // Need to spawn new agent - this would typically be done
          // through the orchestrator or another mechanism
          this._sendJson(res, 202, { 
            run,
            message: 'Run created, agent spawn required'
          });
          return true;
        }
      }

      this._sendJson(res, 201, { run, message: 'Agent wakeup initiated' });
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

  async _listWakeupHistory(req, res, agentId, url) {
    try {
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);

      // Query wakeup requests from database
      const requests = await this.heartbeatService.db.all(`
        SELECT * FROM agent_wakeup_requests
        WHERE agent_id = ?
        ORDER BY requested_at DESC
        LIMIT ?
      `, [agentId, limit]);

      this._sendJson(res, 200, {
        agentId,
        requests: requests.map(r => ({
          id: r.id,
          source: r.source,
          triggerDetail: r.trigger_detail,
          reason: r.reason,
          status: r.status,
          runId: r.run_id,
          requestedAt: r.requested_at,
          finishedAt: r.finished_at
        }))
      });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  // ============================================
  // Session Endpoints
  // ============================================

  async _listSessions(req, res, agentId, url) {
    try {
      if (!this.sessionManager) {
        this._sendError(res, 503, 'Session manager not available');
        return true;
      }

      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const sessions = await this.sessionManager.listSessions(agentId, { limit });

      this._sendJson(res, 200, { agentId, sessions });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _clearAgentSessions(req, res, agentId) {
    try {
      if (!this.sessionManager) {
        this._sendError(res, 503, 'Session manager not available');
        return true;
      }

      const body = await this._readJsonBody(req).catch(() => ({}));
      const count = await this.sessionManager.clearAgentSessions(agentId, {
        taskKey: body.taskKey,
        provider: body.provider
      });

      this._sendJson(res, 200, { agentId, cleared: count });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _clearSession(req, res, sessionId) {
    try {
      if (!this.sessionManager) {
        this._sendError(res, 503, 'Session manager not available');
        return true;
      }

      const cleared = await this.sessionManager.clearSession(sessionId);

      if (!cleared) {
        this._sendError(res, 404, 'Session not found');
        return true;
      }

      this._sendJson(res, 200, { sessionId, cleared: true });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  // ============================================
  // Cost Endpoints
  // ============================================

  async _getCostSummary(req, res, url) {
    try {
      const since = url.searchParams.get('since');
      const until = url.searchParams.get('until');

      // Aggregate costs from database
      const result = await this.heartbeatService.db.get(`
        SELECT 
          SUM(cost_cents) as total_cost,
          SUM(input_tokens) as total_input,
          SUM(output_tokens) as total_output,
          COUNT(DISTINCT run_id) as run_count,
          COUNT(DISTINCT agent_id) as agent_count
        FROM cost_ledger
        WHERE occurred_at >= ? AND occurred_at <= ?
      `, [
        since || new Date(0).toISOString(),
        until || new Date().toISOString()
      ]);

      this._sendJson(res, 200, {
        totalCostCents: result?.total_cost || 0,
        totalInputTokens: result?.total_input || 0,
        totalOutputTokens: result?.total_output || 0,
        runCount: result?.run_count || 0,
        agentCount: result?.agent_count || 0,
        filters: { since, until }
      });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  async _getAgentCosts(req, res, agentId, url) {
    try {
      const since = url.searchParams.get('since') 
        ? new Date(url.searchParams.get('since')) 
        : undefined;
      const until = url.searchParams.get('until') 
        ? new Date(url.searchParams.get('until')) 
        : undefined;

      const costs = await this.heartbeatService.getAgentCosts(agentId, { since, until });

      this._sendJson(res, 200, { agentId, costs });
      return true;
    } catch (error) {
      this._sendError(res, 500, error.message);
      return true;
    }
  }

  // ============================================
  // Health Check
  // ============================================

  async _healthCheck(req, res) {
    this._sendJson(res, 200, {
      status: 'ok',
      services: {
        heartbeat: !!this.heartbeatService,
        sessions: !!this.sessionManager,
        spawn: !!this.spawnManager
      }
    });
    return true;
  }

  // ============================================
  // Helpers
  // ============================================

  async _readJsonBody(req) {
    const chunks = [];

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

    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON body: ${error.message}`);
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

export default HeartbeatController;
