/**
 * @fileoverview Heartbeat Controller - Enhanced REST API for heartbeat runs and sessions
 * @module controllers/heartbeat-controller
 * @version 5.0.0
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
   * @param {import('../websocket/server.js').WebSocketServer} options.wsServer - WebSocket server
   */
  constructor(options = {}) {
    this.heartbeatService = options.heartbeatService;
    this.sessionManager = options.sessionManager;
    this.spawnManager = options.spawnManager;
    this.wsServer = options.wsServer;
    this.prefix = '/api/heartbeat';
    
    // Active log streams for real-time updates
    this.activeLogStreams = new Map();
  }

  /**
   * Initialize the controller
   * @returns {Promise<HeartbeatController>}
   */
  async initialize() {
    // Set up event listener for real-time log streaming
    if (this.heartbeatService) {
      this.heartbeatService.on('run:log', (data) => {
        this._broadcastLogChunk(data);
      });
    }
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

    // GET /api/heartbeat/runs/:id/log - Stream run log (SSE)
    const logMatch = pathname.match(new RegExp(`^${this.prefix}/runs/([^/]+)/log$`));
    if (logMatch && req.method === 'GET') {
      return this._streamRunLogSSE(req, res, logMatch[1], url);
    }

    // GET /api/heartbeat/runs/:id/cost - Get run cost
    const costMatch = pathname.match(new RegExp(`^${this.prefix}/runs/([^/]+)/cost$`));
    if (costMatch && req.method === 'GET') {
      return this._getRunCost(req, res, costMatch[1]);
    }

    // POST /api/heartbeat/agents/:id/wakeup - Wake up an agent
    const wakeupMatch = pathname.match(new RegExp(`^${this.prefix}/agents/([^/]+)/wakeup$`));
    if (wakeupMatch && req.method === 'POST') {
      return this._wakeupAgent(req, res, wakeupMatch[1]);
    }

    // GET /api/heartbeat/agents/:id/sessions - List agent sessions
    const sessionsMatch = pathname.match(new RegExp(`^${this.prefix}/agents/([^/]+)/sessions$`));
    if (sessionsMatch && req.method === 'GET') {
      return this._listSessions(req, res, sessionsMatch[1], url);
    }

    // DELETE /api/heartbeat/agents/:id/sessions/:sessionId - Delete specific session
    const sessionDeleteMatch = pathname.match(new RegExp(`^${this.prefix}/agents/([^/]+)/sessions/([^/]+)$`));
    if (sessionDeleteMatch && req.method === 'DELETE') {
      return this._deleteSession(req, res, sessionDeleteMatch[1], sessionDeleteMatch[2]);
    }

    // GET /api/heartbeat/costs - Get cost summary
    if (pathname === `${this.prefix}/costs` && req.method === 'GET') {
      return this._getCostSummary(req, res, url);
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
          total: runs.length
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

      // Broadcast run creation via WebSocket
      this._broadcastRunEvent('run:created', run);

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

      // Broadcast run cancellation via WebSocket
      this._broadcastRunEvent('run:cancelled', run);

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

      // Broadcast run retry via WebSocket
      this._broadcastRunEvent('run:retried', { originalRunId: runId, newRun });

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

  /**
   * Stream run log using Server-Sent Events (SSE)
   */
  async _streamRunLogSSE(req, res, runId, url) {
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

      const useSSE = url.searchParams.get('sse') !== 'false';
      const follow = url.searchParams.get('follow') === 'true';

      if (useSSE) {
        // Set up SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });

        // Send initial event
        res.write(`event: connected\n`);
        res.write(`data: ${JSON.stringify({ runId, status: run.status, timestamp: new Date().toISOString() })}\n\n`);

        // Track if client is still connected
        let isConnected = true;
        
        // Handle client disconnect and errors
        const cleanup = () => { isConnected = false; };
        req.on('close', cleanup);
        req.on('error', cleanup);
        res.on('error', cleanup);

        // Stream existing log entries
        let seq = 0;
        await this.heartbeatService.streamRunLog(runId, (entry) => {
          if (!isConnected) return;
          seq++;
          try {
            res.write(`event: log\n`);
            res.write(`id: ${seq}\n`);
            res.write(`data: ${JSON.stringify({
              seq,
              stream: entry.stream,
              chunk: entry.chunk,
              timestamp: new Date().toISOString()
            })}\n\n`);
          } catch (err) {
            // Client disconnected during write
            isConnected = false;
          }
        });

        // If not following or run already complete, end the stream
        if (!follow || !['queued', 'running'].includes(run.status)) {
          if (isConnected) {
            res.write(`event: complete\n`);
            res.write(`data: ${JSON.stringify({ 
              runId, 
              status: run.status,
              totalEvents: seq 
            })}\n\n`);
            res.end();
          }
          req.off('close', cleanup);
          req.off('error', cleanup);
          res.off('error', cleanup);
          return true;
        }

        // Follow mode: keep connection open for real-time updates
        const streamId = `${runId}_${Date.now()}`;
        const streamInfo = { res, runId, isConnected: () => isConnected };
        this.activeLogStreams.set(streamId, streamInfo);

        // Send heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
          if (!isConnected) {
            clearInterval(heartbeat);
            return;
          }
          try {
            res.write(`event: heartbeat\n`);
            res.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
          } catch (err) {
            isConnected = false;
            clearInterval(heartbeat);
          }
        }, 30000);

        // Watch for run completion
        const checkRunStatus = setInterval(async () => {
          if (!isConnected) {
            clearInterval(checkRunStatus);
            return;
          }
          try {
            const currentRun = await this.heartbeatService.getRun(runId);
            if (currentRun && !['queued', 'running'].includes(currentRun.status)) {
              // Run completed, send completion event
              try {
                res.write(`event: complete\n`);
                res.write(`data: ${JSON.stringify({ 
                  runId, 
                  status: currentRun.status,
                  totalEvents: seq 
                })}\n\n`);
                res.end();
              } catch (err) {
                // Ignore write errors on close
              }
              isConnected = false;
              clearInterval(checkRunStatus);
              clearInterval(heartbeat);
              this.activeLogStreams.delete(streamId);
            }
          } catch (err) {
            // Ignore errors checking run status
          }
        }, 5000);

        // Clean up on client disconnect
        const onClose = () => {
          isConnected = false;
          clearInterval(heartbeat);
          clearInterval(checkRunStatus);
          this.activeLogStreams.delete(streamId);
        };
        req.once('close', onClose);
        req.once('error', onClose);
        res.once('error', onClose);

        // Send current status
        if (isConnected) {
          res.write(`event: status\n`);
          res.write(`data: ${JSON.stringify({ status: run.status })}\n\n`);
        }
      } else {
        // Plain text streaming (original behavior)
        res.writeHead(200, { 
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked'
        });

        await this.heartbeatService.streamRunLog(runId, (entry) => {
          res.write(`[${entry.stream}] ${entry.chunk}\n`);
        });

        res.end();
      }

      return true;
    } catch (error) {
      // If headers not sent, send error response
      if (!res.headersSent) {
        this._sendError(res, 500, error.message);
      }
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
        const existingStatus = this.spawnManager.getAgentStatus(agentId);
        
        if (existingStatus) {
          await this.spawnManager.startHeartbeatRun(agentId, {
            taskKey: params.taskKey,
            invocationSource: params.source,
            triggerDetail: params.triggerDetail
          });
        } else {
          this._sendJson(res, 202, { 
            run,
            message: 'Run created, agent spawn required'
          });
          return true;
        }
      }

      // Broadcast wakeup event
      this._broadcastRunEvent('agent:wakeup', { agentId, runId: run.id });

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

  async _deleteSession(req, res, agentId, sessionId) {
    try {
      if (!this.sessionManager) {
        this._sendError(res, 503, 'Session manager not available');
        return true;
      }

      const deleted = await this.sessionManager.clearSession(sessionId);

      if (!deleted) {
        this._sendError(res, 404, 'Session not found');
        return true;
      }

      // Broadcast session deletion
      this._broadcastRunEvent('session:deleted', { agentId, sessionId });

      this._sendJson(res, 200, { agentId, sessionId, deleted: true });
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

      // Get daily breakdown
      const dailyBreakdown = await this.heartbeatService.db.all(`
        SELECT 
          date(occurred_at) as date,
          SUM(cost_cents) as cost,
          COUNT(DISTINCT run_id) as runs
        FROM cost_ledger
        WHERE occurred_at >= ? AND occurred_at <= ?
        GROUP BY date(occurred_at)
        ORDER BY date DESC
        LIMIT 30
      `, [
        since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        until || new Date().toISOString()
      ]);

      this._sendJson(res, 200, {
        totalCostCents: result?.total_cost || 0,
        totalInputTokens: result?.total_input || 0,
        totalOutputTokens: result?.total_output || 0,
        runCount: result?.run_count || 0,
        agentCount: result?.agent_count || 0,
        dailyBreakdown,
        filters: { since, until }
      });
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
        spawn: !!this.spawnManager,
        websocket: !!this.wsServer
      }
    });
    return true;
  }

  // ============================================
  // WebSocket Broadcasting
  // ============================================

  /**
   * Broadcast run event to WebSocket subscribers
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  _broadcastRunEvent(event, data) {
    if (!this.wsServer) return;

    // Broadcast to heartbeat room
    this.wsServer.broadcastToRoom('heartbeat', {
      type: event,
      data,
      timestamp: new Date().toISOString()
    });

    // Also broadcast to agent-specific room if agentId is available
    if (data.agentId || data.run?.agentId) {
      const agentId = data.agentId || data.run?.agentId;
      this.wsServer.broadcastToRoom(`agent:${agentId}`, {
        type: event,
        data,
        timestamp: new Date().toISOString()
      });
    }

    // Broadcast to run-specific room if runId is available
    if (data.id || data.runId || data.run?.id) {
      const runId = data.id || data.runId || data.run?.id;
      this.wsServer.broadcastToRoom(`run:${runId}`, {
        type: event,
        data,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Broadcast log chunk to active SSE streams
   * @param {Object} data - Log data
   */
  _broadcastLogChunk(data) {
    // Broadcast to active SSE streams
    for (const [streamId, stream] of this.activeLogStreams) {
      if (stream.runId === data.runId && !stream.res.writableEnded && !stream.res.destroyed) {
        try {
          stream.res.write(`event: log\n`);
          stream.res.write(`data: ${JSON.stringify({
            stream: data.stream,
            chunk: data.chunk,
            truncated: data.truncated,
            timestamp: data.timestamp
          })}\n\n`);
        } catch (err) {
          // Stream write failed, clean it up
          this.activeLogStreams.delete(streamId);
        }
      } else if (stream.res.writableEnded || stream.res.destroyed) {
        // Clean up ended streams
        this.activeLogStreams.delete(streamId);
      }
    }

    // Broadcast to WebSocket
    if (this.wsServer) {
      this.wsServer.broadcastToRoom(`run:${data.runId}`, {
        type: 'run:log',
        data,
        timestamp: new Date().toISOString()
      });
    }
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
