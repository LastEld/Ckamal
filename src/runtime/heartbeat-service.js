/**
 * @fileoverview Heartbeat Runtime Service - Core service for agent run tracking
 * Inspired by Paperclip's heartbeat system.
 * @module runtime/heartbeat-service
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Run status states
 * @readonly
 * @enum {string}
 */
export const RunStatus = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed_out'
};

/**
 * Invocation sources
 * @readonly
 * @enum {string}
 */
export const InvocationSource = {
  TIMER: 'timer',
  ASSIGNMENT: 'assignment',
  ON_DEMAND: 'on_demand',
  AUTOMATION: 'automation'
};

/**
 * Trigger details
 * @readonly
 * @enum {string}
 */
export const TriggerDetail = {
  MANUAL: 'manual',
  PING: 'ping',
  CALLBACK: 'callback',
  SYSTEM: 'system'
};

/**
 * Error codes
 * @readonly
 * @enum {string}
 */
export const ErrorCode = {
  AGENT_NOT_FOUND: 'agent_not_found',
  AGENT_NOT_INVOKABLE: 'agent_not_invokable',
  BUDGET_EXCEEDED: 'budget_exceeded',
  PROCESS_LOST: 'process_lost',
  ADAPTER_FAILED: 'adapter_failed',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
  SETUP_FAILED: 'setup_failed'
};

/**
 * Default configuration
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  maxConcurrentRuns: 1,
  maxConcurrentRunsMax: 10,
  spawnTimeout: 30000,
  defaultTimeout: 60000,
  maxRetries: 3,
  retryWindow: 300000,
  logExcerptBytes: 8192,
  maxLiveLogChunkBytes: 8192
};

/**
 * HeartbeatService - Core service for tracking agent runs
 * @extends EventEmitter
 */
export class HeartbeatService extends EventEmitter {
  /**
   * Create a new HeartbeatService
   * @param {Object} options - Configuration options
   * @param {import('../db/connection/index.js').ConnectionPool} options.db - Database connection pool
   * @param {import('../db/repositories/base-repository.js').BaseRepository} options.repository - Optional custom repository
   * @param {Object} options.config - Service configuration
   */
  constructor(options = {}) {
    super();
    
    this.db = options.db;
    this.repository = options.repository;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    
    // Active run tracking
    this.activeRuns = new Map();
    this.runLocks = new Map();
    
    // Agent start locks (prevent concurrent starts for same agent)
    this.startLocks = new Map();
    
    // Log storage
    this.logStorage = options.logStorage || new MemoryLogStorage();
    
    // Budget service integration
    this.budgetService = options.budgetService;
    
    // WebSocket publisher for live events
    this.eventPublisher = options.eventPublisher;
    
    // Orphaned run reaper interval
    this.reaperInterval = null;
    this.reaperIntervalMs = options.reaperIntervalMs || 30000;
  }

  /**
   * Initialize the service
   * @returns {Promise<HeartbeatService>}
   */
  async initialize() {
    // Start orphaned run reaper
    this._startReaper();
    
    // Resume any queued runs
    await this._resumeQueuedRuns();
    
    this.emit('initialized');
    return this;
  }

  /**
   * Dispose the service
   * @returns {Promise<void>}
   */
  async dispose() {
    if (this.reaperInterval) {
      clearInterval(this.reaperInterval);
      this.reaperInterval = null;
    }
    
    // Cancel all active runs
    const activeRunIds = Array.from(this.activeRuns.keys());
    for (const runId of activeRunIds) {
      await this.cancelRun(runId, 'Service shutting down');
    }
    
    this.removeAllListeners();
  }

  // ============================================
  // Run Lifecycle
  // ============================================

  /**
   * Create a new run
   * @param {Object} params - Run parameters
   * @param {string} params.agentId - Agent ID
   * @param {string} [params.invocationSource] - Source of invocation
   * @param {string} [params.triggerDetail] - Trigger detail
   * @param {string} [params.wakeupRequestId] - Associated wakeup request
   * @param {Object} [params.contextSnapshot] - Execution context
   * @param {string} [params.sessionIdBefore] - Session ID before run
   * @param {string} [params.retryOfRunId] - Original run if retry
   * @param {string} [params.externalRunId] - External system reference
   * @returns {Promise<Object>} Created run
   */
  async createRun(params) {
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    const run = {
      id: runId,
      agent_id: params.agentId,
      invocation_source: params.invocationSource || InvocationSource.ON_DEMAND,
      trigger_detail: params.triggerDetail || TriggerDetail.MANUAL,
      status: RunStatus.QUEUED,
      wakeup_request_id: params.wakeupRequestId || null,
      context_snapshot: JSON.stringify(params.contextSnapshot || {}),
      session_id_before: params.sessionIdBefore || null,
      retry_of_run_id: params.retryOfRunId || null,
      external_run_id: params.externalRunId || null,
      process_loss_retry_count: params.retryOfRunId ? 1 : 0,
      created_at: now,
      updated_at: now
    };

    await this._insert('heartbeat_runs', run);
    
    this.emit('run:created', { runId, agentId: params.agentId, status: RunStatus.QUEUED });
    
    return this._formatRun(run);
  }

  /**
   * Start a run (claim it from queued state)
   * @param {string} runId - Run ID
   * @returns {Promise<Object|null>} Started run or null if already claimed
   */
  async startRun(runId) {
    const run = await this.getRun(runId);
    if (!run) return null;
    
    // Can only start queued runs
    if (run.status !== RunStatus.QUEUED) {
      return run.status === RunStatus.RUNNING ? run : null;
    }
    
    // Check agent exists and is invokable
    const agent = await this._getAgent(run.agent_id);
    if (!agent) {
      await this._failRun(runId, 'Agent not found', ErrorCode.AGENT_NOT_FOUND);
      return null;
    }
    
    if (['paused', 'terminated', 'pending_approval'].includes(agent.status)) {
      await this._failRun(runId, 'Agent is not invokable', ErrorCode.AGENT_NOT_INVOKABLE);
      return null;
    }
    
    // Check budget
    if (this.budgetService) {
      const budgetCheck = await this.budgetService.checkBudget(run.agent_id, {
        context: run.context_snapshot
      });
      if (budgetCheck.blocked) {
        await this._failRun(runId, budgetCheck.reason, ErrorCode.BUDGET_EXCEEDED);
        return null;
      }
    }
    
    // Check concurrent run limits
    const runningCount = await this._countRunningRuns(run.agent_id);
    const maxConcurrent = this._getMaxConcurrentRuns(agent);
    
    if (runningCount >= maxConcurrent) {
      // Stay queued, will be processed when slot available
      return null;
    }
    
    // Claim the run
    const now = new Date().toISOString();
    const updated = await this._update(
      'heartbeat_runs',
      { 
        status: RunStatus.RUNNING,
        started_at: now,
        updated_at: now
      },
      { id: runId, status: RunStatus.QUEUED }
    );
    
    if (!updated) {
      // Another worker claimed it
      return null;
    }
    
    const startedRun = await this.getRun(runId);
    
    // Track active run
    this.activeRuns.set(runId, {
      startTime: Date.now(),
      agentId: run.agent_id,
      eventSeq: 0,
      stdoutExcerpt: '',
      stderrExcerpt: ''
    });
    
    // Emit start event
    await this.appendRunEvent(runId, {
      eventType: 'lifecycle',
      stream: 'system',
      level: 'info',
      message: 'Run started'
    });
    
    this.emit('run:started', { runId, agentId: run.agent_id });
    
    return startedRun;
  }

  /**
   * Complete a run successfully
   * @param {string} runId - Run ID
   * @param {Object} result - Execution result
   * @param {Object} [result.resultJson] - Result JSON
   * @param {number} [result.exitCode] - Exit code
   * @param {string} [result.sessionIdAfter] - Session ID after run
   * @param {Object} [result.usage] - Token/cost usage
   * @returns {Promise<Object|null>} Completed run
   */
  async completeRun(runId, result = {}) {
    const run = await this.getRun(runId);
    if (!run || run.status !== RunStatus.RUNNING) return null;
    
    const activeRun = this.activeRuns.get(runId);
    const now = new Date().toISOString();
    
    const usageJson = this._buildUsageJson(result.usage, run);
    
    await this._update(
      'heartbeat_runs',
      {
        status: RunStatus.SUCCEEDED,
        finished_at: now,
        result_json: result.resultJson ? JSON.stringify(result.resultJson) : null,
        exit_code: result.exitCode ?? 0,
        session_id_after: result.sessionIdAfter || run.session_id_before,
        usage_json: usageJson,
        stdout_excerpt: activeRun?.stdoutExcerpt || null,
        stderr_excerpt: activeRun?.stderrExcerpt || null,
        updated_at: now
      },
      { id: runId }
    );
    
    // Append completion event
    await this.appendRunEvent(runId, {
      eventType: 'lifecycle',
      stream: 'system',
      level: 'info',
      message: 'Run completed successfully',
      payload: { exitCode: result.exitCode ?? 0 }
    });
    
    // Record costs
    if (result.usage) {
      await this._recordCost(runId, run.agent_id, result.usage);
    }
    
    // Update runtime state
    await this._updateRuntimeState(run.agent_id, runId, RunStatus.SUCCEEDED, result);
    
    // Emit before cleanup to ensure listeners can access active run state
    this.emit('run:completed', { runId, agentId: run.agent_id, status: RunStatus.SUCCEEDED });
    
    // Process next queued run for this agent before cleanup
    await this._processNextQueuedRun(run.agent_id);
    
    // Cleanup after all processing is done
    this.activeRuns.delete(runId);
    
    return this.getRun(runId);
  }

  /**
   * Fail a run
   * @param {string} runId - Run ID
   * @param {string} error - Error message
   * @param {string} [errorCode] - Error code
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.shouldRetry] - Whether to queue retry
   * @returns {Promise<Object|null>} Failed run
   */
  async failRun(runId, error, errorCode = ErrorCode.ADAPTER_FAILED, options = {}) {
    const run = await this.getRun(runId);
    if (!run || !['queued', 'running'].includes(run.status)) return null;
    
    const activeRun = this.activeRuns.get(runId);
    const now = new Date().toISOString();
    
    await this._update(
      'heartbeat_runs',
      {
        status: RunStatus.FAILED,
        finished_at: now,
        error: error,
        error_code: errorCode,
        stdout_excerpt: activeRun?.stdoutExcerpt || null,
        stderr_excerpt: activeRun?.stderrExcerpt || null,
        updated_at: now
      },
      { id: runId }
    );
    
    // Update runtime state before emitting events
    await this._updateRuntimeState(run.agent_id, runId, RunStatus.FAILED, { error });
    
    // Append failure event
    await this.appendRunEvent(runId, {
      eventType: 'lifecycle',
      stream: 'system',
      level: 'error',
      message: `Run failed: ${error}`,
      payload: { errorCode }
    });
    
    // Cleanup after all processing
    this.activeRuns.delete(runId);
    
    this.emit('run:failed', { runId, agentId: run.agent_id, error, errorCode });
    
    // Queue retry if appropriate
    if (options.shouldRetry && errorCode === ErrorCode.PROCESS_LOST) {
      await this._queueRetry(run, error);
    }
    
    // Process next queued run
    await this._processNextQueuedRun(run.agent_id);
    
    return this.getRun(runId);
  }

  /**
   * Cancel a run
   * @param {string} runId - Run ID
   * @param {string} [reason] - Cancellation reason
   * @returns {Promise<Object|null>} Cancelled run
   */
  async cancelRun(runId, reason = 'Cancelled') {
    const run = await this.getRun(runId);
    if (!run || !['queued', 'running'].includes(run.status)) return null;
    
    const now = new Date().toISOString();
    
    await this._update(
      'heartbeat_runs',
      {
        status: RunStatus.CANCELLED,
        finished_at: now,
        error: reason,
        error_code: ErrorCode.CANCELLED,
        updated_at: now
      },
      { id: runId }
    );
    
    // Cleanup before emitting to ensure consistent state
    this.activeRuns.delete(runId);
    
    // Append cancellation event after cleanup
    await this.appendRunEvent(runId, {
      eventType: 'lifecycle',
      stream: 'system',
      level: 'warn',
      message: `Run cancelled: ${reason}`,
      payload: { reason }
    });
    
    this.emit('run:cancelled', { runId, agentId: run.agent_id, reason });
    
    // Process next queued run
    await this._processNextQueuedRun(run.agent_id);
    
    return this.getRun(runId);
  }

  /**
   * Get a run by ID
   * @param {string} runId - Run ID
   * @returns {Promise<Object|null>} Run or null
   */
  async getRun(runId) {
    const run = await this._get('heartbeat_runs', { id: runId });
    return run ? this._formatRun(run) : null;
  }

  /**
   * List runs with filtering
   * @param {Object} filters - Filter options
   * @param {string} [filters.agentId] - Filter by agent
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.invocationSource] - Filter by source
   * @param {number} [filters.limit] - Limit results
   * @param {number} [filters.offset] - Offset results
   * @returns {Promise<Object[]>} Runs
   */
  async listRuns(filters = {}) {
    const conditions = [];
    const values = [];
    
    if (filters.agentId) {
      conditions.push('agent_id = ?');
      values.push(filters.agentId);
    }
    
    if (filters.status) {
      conditions.push('status = ?');
      values.push(filters.status);
    }
    
    if (filters.invocationSource) {
      conditions.push('invocation_source = ?');
      values.push(filters.invocationSource);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = filters.limit ? `LIMIT ${filters.limit}` : '';
    const offsetClause = filters.offset ? `OFFSET ${filters.offset}` : '';
    
    const sql = `
      SELECT * FROM heartbeat_runs
      ${whereClause}
      ORDER BY created_at DESC
      ${limitClause} ${offsetClause}
    `;
    
    const runs = await this._all(sql, values);
    return runs.map(r => this._formatRun(r));
  }

  /**
   * Retry a failed run
   * @param {string} runId - Original run ID
   * @param {Object} [options] - Retry options
   * @returns {Promise<Object|null>} New run or null
   */
  async retryRun(runId, options = {}) {
    const run = await this.getRun(runId);
    if (!run || run.status !== RunStatus.FAILED) return null;
    
    // Create retry run
    return this.createRun({
      agentId: run.agent_id,
      invocationSource: options.invocationSource || InvocationSource.AUTOMATION,
      triggerDetail: options.triggerDetail || TriggerDetail.SYSTEM,
      contextSnapshot: {
        ...run.context_snapshot,
        retryOfRunId: runId,
        retryReason: options.reason || 'manual_retry'
      },
      sessionIdBefore: run.session_id_after || run.session_id_before,
      retryOfRunId: runId
    });
  }

  // ============================================
  // Event Logging
  // ============================================

  /**
   * Append an event to a run
   * @param {string} runId - Run ID
   * @param {Object} event - Event data
   * @param {string} event.eventType - Event type
   * @param {string} [event.stream] - Stream (system, stdout, stderr)
   * @param {string} [event.level] - Log level (info, warn, error)
   * @param {string} [event.color] - ANSI color code
   * @param {string} [event.message] - Human-readable message
   * @param {Object} [event.payload] - Structured data
   * @returns {Promise<Object>} Created event
   */
  async appendRunEvent(runId, event) {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    
    const activeRun = this.activeRuns.get(runId);
    // For active runs, use atomic increment; for completed runs, use DB-based sequencing
    let seq;
    if (activeRun) {
      seq = ++activeRun.eventSeq;
    } else {
      // For non-active runs, always get next seq from DB to ensure ordering
      seq = await this._getNextEventSeq(runId);
    }
    
    // Sanitize message
    const message = event.message ? this._sanitizeLog(event.message) : null;
    
    // Update excerpts for stdout/stderr
    if (activeRun && message) {
      if (event.stream === 'stdout') {
        activeRun.stdoutExcerpt = this._appendExcerpt(activeRun.stdoutExcerpt, message);
      } else if (event.stream === 'stderr') {
        activeRun.stderrExcerpt = this._appendExcerpt(activeRun.stderrExcerpt, message);
      }
    }
    
    const eventRecord = {
      run_id: runId,
      agent_id: run.agent_id,
      seq,
      event_type: event.eventType,
      stream: event.stream || null,
      level: event.level || null,
      color: event.color || null,
      message,
      payload: event.payload ? JSON.stringify(event.payload) : null,
      created_at: new Date().toISOString()
    };
    
    await this._insert('heartbeat_run_events', eventRecord);
    
    // Publish live event (fire-and-forget with error handling)
    if (this.eventPublisher) {
      try {
        await this.eventPublisher.publish({
          type: 'heartbeat.run.event',
          runId,
          agentId: run.agent_id,
          seq,
          eventType: event.eventType,
          stream: event.stream,
          level: event.level,
          message,
          payload: event.payload,
          timestamp: eventRecord.created_at
        });
      } catch (err) {
        // Log but don't fail the event append if publishing fails
        this.emit('publish:error', { runId, error: err.message });
      }
    }
    
    return { ...eventRecord, payload: event.payload };
  }

  /**
   * Get events for a run
   * @param {string} runId - Run ID
   * @param {Object} options - Query options
   * @param {number} [options.sinceSeq] - Get events after this sequence number
   * @param {number} [options.limit] - Limit results
   * @returns {Promise<Object[]>} Events
   */
  async getRunEvents(runId, options = {}) {
    const conditions = ['run_id = ?'];
    const values = [runId];
    
    if (options.sinceSeq !== undefined) {
      conditions.push('seq > ?');
      values.push(options.sinceSeq);
    }
    
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    
    const sql = `
      SELECT * FROM heartbeat_run_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY seq ASC
      ${limitClause}
    `;
    
    const events = await this._all(sql, values);
    return events.map(e => this._formatEvent(e));
  }

  /**
   * Stream run log
   * @param {string} runId - Run ID
   * @param {Function} onData - Callback for log data
   * @returns {Promise<void>}
   */
  async streamRunLog(runId, onData) {
    // Stream from log storage using runId as the reference
    // (log_ref field may not be set, use runId directly)
    return this.logStorage.stream(runId, onData);
  }

  /**
   * Append log chunk to run storage
   * @param {string} runId - Run ID
   * @param {string} stream - Stream name (stdout/stderr)
   * @param {string} chunk - Log chunk
   * @returns {Promise<void>}
   */
  async appendRunLog(runId, stream, chunk) {
    const activeRun = this.activeRuns.get(runId);
    if (!activeRun) return;
    
    const sanitized = this._sanitizeLog(chunk);
    
    // Update excerpt
    if (stream === 'stdout') {
      activeRun.stdoutExcerpt = this._appendExcerpt(activeRun.stdoutExcerpt, sanitized);
    } else if (stream === 'stderr') {
      activeRun.stderrExcerpt = this._appendExcerpt(activeRun.stderrExcerpt, sanitized);
    }
    
    // Store in log storage
    await this.logStorage.append(runId, { stream, chunk: sanitized });
    
    // Publish live log event (fire-and-forget with error handling)
    if (this.eventPublisher) {
      try {
        await this.eventPublisher.publish({
          type: 'heartbeat.run.log',
          runId,
          stream,
          chunk: sanitized.slice(-this.config.maxLiveLogChunkBytes),
          truncated: sanitized.length > this.config.maxLiveLogChunkBytes,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        // Log but don't fail the log append if publishing fails
        this.emit('publish:error', { runId, error: err.message });
      }
    }
  }

  // ============================================
  // Cost Tracking
  // ============================================

  /**
   * Get cost for a run
   * @param {string} runId - Run ID
   * @returns {Promise<Object|null>} Cost data
   */
  async getRunCost(runId) {
    const costs = await this._all(
      'SELECT * FROM cost_ledger WHERE run_id = ?',
      [runId]
    );
    
    if (costs.length === 0) return null;
    
    return {
      runId,
      totalCostCents: costs.reduce((sum, c) => sum + c.cost_cents, 0),
      totalInputTokens: costs.reduce((sum, c) => sum + c.input_tokens, 0),
      totalOutputTokens: costs.reduce((sum, c) => sum + c.output_tokens, 0),
      entries: costs.map(c => this._formatCostEntry(c))
    };
  }

  /**
   * Get costs for an agent
   * @param {string} agentId - Agent ID
   * @param {Object} options - Query options
   * @param {Date} [options.since] - Start date
   * @param {Date} [options.until] - End date
   * @returns {Promise<Object>} Cost summary
   */
  async getAgentCosts(agentId, options = {}) {
    const conditions = ['agent_id = ?'];
    const values = [agentId];
    
    if (options.since) {
      conditions.push('occurred_at >= ?');
      values.push(options.since.toISOString());
    }
    
    if (options.until) {
      conditions.push('occurred_at <= ?');
      values.push(options.until.toISOString());
    }
    
    const sql = `
      SELECT 
        SUM(cost_cents) as total_cost,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        COUNT(*) as entry_count
      FROM cost_ledger
      WHERE ${conditions.join(' AND ')}
    `;
    
    const result = await this._get(sql, values);
    
    return {
      agentId,
      totalCostCents: result?.total_cost || 0,
      totalInputTokens: result?.total_input || 0,
      totalOutputTokens: result?.total_output || 0,
      entryCount: result?.entry_count || 0
    };
  }

  // ============================================
  // Internal Helpers
  // ============================================

  async _get(table, where) {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const conditions = keys.map(k => `${k} = ?`).join(' AND ');
    
    const sql = `SELECT * FROM ${table} WHERE ${conditions} LIMIT 1`;
    return this.repository 
      ? this.repository.findById(where.id)
      : this.db.get(sql, values);
  }

  async _all(sql, values = []) {
    if (this.repository) {
      return this.repository.findAll({ where: sql });
    }
    return this.db.all(sql, values);
  }

  async _insert(table, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    
    if (this.repository) {
      return this.repository.create(data);
    }
    return this.db.run(sql, values);
  }

  async _update(table, data, where) {
    const setKeys = Object.keys(data);
    const setValues = Object.values(data);
    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);
    
    const setClause = setKeys.map(k => `${k} = ?`).join(', ');
    const whereClause = whereKeys.map(k => `${k} = ?`).join(' AND ');
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    
    if (this.repository) {
      const id = where.id || where[Object.keys(where)[0]];
      return this.repository.update(id, data);
    }
    return this.db.run(sql, [...setValues, ...whereValues]);
  }

  async _getAgent(agentId) {
    return this._get('runtime_provider_sessions', { id: agentId });
  }

  async _countRunningRuns(agentId) {
    const result = await this._get(
      `SELECT COUNT(*) as count FROM heartbeat_runs 
       WHERE agent_id = ? AND status = ?`,
      [agentId, RunStatus.RUNNING]
    );
    return result?.count || 0;
  }

  _getMaxConcurrentRuns(agent) {
    try {
      const config = JSON.parse(agent.metadata_json || '{}');
      const heartbeat = config.heartbeat || {};
      const max = Math.floor(heartbeat.maxConcurrentRuns || this.config.maxConcurrentRuns);
      return Math.max(1, Math.min(this.config.maxConcurrentRunsMax, max));
    } catch {
      return this.config.maxConcurrentRuns;
    }
  }

  async _failRun(runId, error, errorCode) {
    const run = await this.getRun(runId);
    if (!run) return null;
    
    const now = new Date().toISOString();
    
    await this._update(
      'heartbeat_runs',
      {
        status: RunStatus.FAILED,
        finished_at: now,
        error,
        error_code: errorCode,
        updated_at: now
      },
      { id: runId }
    );
    
    return this.getRun(runId);
  }

  async _queueRetry(run, error) {
    if (run.process_loss_retry_count >= 1) return;
    
    // Create retry run
    await this.createRun({
      agentId: run.agent_id,
      invocationSource: InvocationSource.AUTOMATION,
      triggerDetail: TriggerDetail.SYSTEM,
      contextSnapshot: {
        ...run.context_snapshot,
        retryOfRunId: run.id,
        retryReason: 'process_lost'
      },
      sessionIdBefore: run.session_id_after || run.session_id_before,
      retryOfRunId: run.id
    });
  }

  async _recordCost(runId, agentId, usage) {
    // Record cost if any usage data is present (check for explicit null/undefined, not falsy)
    const hasCost = usage && (
      usage.costUsd !== undefined && usage.costUsd !== null ||
      usage.inputTokens !== undefined && usage.inputTokens !== null ||
      usage.outputTokens !== undefined && usage.outputTokens !== null
    );
    if (!hasCost) {
      return;
    }
    
    const costCents = usage.costUsd ? Math.round(usage.costUsd * 100) : 0;
    
    await this._insert('cost_ledger', {
      run_id: runId,
      agent_id: agentId,
      provider: usage.provider || 'unknown',
      biller: usage.biller || usage.provider || 'unknown',
      billing_type: usage.billingType || 'unknown',
      model: usage.model || 'unknown',
      input_tokens: usage.inputTokens || 0,
      cached_input_tokens: usage.cachedInputTokens || 0,
      output_tokens: usage.outputTokens || 0,
      cost_cents: costCents,
      occurred_at: new Date().toISOString(),
      metadata_json: JSON.stringify(usage.metadata || {})
    });
  }

  async _updateRuntimeState(agentId, runId, status, result = {}) {
    const existing = await this._get('agent_runtime_state', { agent_id: agentId });
    
    const usage = result.usage || {};
    const costCents = usage.costUsd ? Math.round(usage.costUsd * 100) : 0;
    
    const data = {
      agent_id: agentId,
      provider: usage.provider || existing?.provider || null,
      last_run_id: runId,
      last_run_status: status,
      last_error: result.error || null,
      updated_at: new Date().toISOString()
    };
    
    if (usage.inputTokens) {
      data.total_input_tokens = (existing?.total_input_tokens || 0) + usage.inputTokens;
    }
    if (usage.outputTokens) {
      data.total_output_tokens = (existing?.total_output_tokens || 0) + usage.outputTokens;
    }
    if (usage.cachedInputTokens) {
      data.total_cached_input_tokens = (existing?.total_cached_input_tokens || 0) + usage.cachedInputTokens;
    }
    if (costCents) {
      data.total_cost_cents = (existing?.total_cost_cents || 0) + costCents;
    }
    
    if (existing) {
      await this._update('agent_runtime_state', data, { agent_id: agentId });
    } else {
      await this._insert('agent_runtime_state', data);
    }
  }

  async _getNextEventSeq(runId) {
    const result = await this._get(
      'SELECT MAX(seq) as max_seq FROM heartbeat_run_events WHERE run_id = ?',
      [runId]
    );
    return (result?.max_seq || 0) + 1;
  }

  async _processNextQueuedRun(agentId) {
    // Get next queued run
    const nextRun = await this._get(
      `SELECT * FROM heartbeat_runs 
       WHERE agent_id = ? AND status = ?
       ORDER BY created_at ASC LIMIT 1`,
      [agentId, RunStatus.QUEUED]
    );
    
    if (nextRun) {
      await this.startRun(nextRun.id);
    }
  }

  async _resumeQueuedRuns() {
    // Find all agents with queued runs
    const agents = await this._all(
      `SELECT DISTINCT agent_id FROM heartbeat_runs WHERE status = ?`,
      [RunStatus.QUEUED]
    );
    
    for (const { agent_id } of agents) {
      await this._processNextQueuedRun(agent_id);
    }
  }

  _startReaper() {
    if (this.reaperInterval) return;
    
    this.reaperInterval = setInterval(async () => {
      await this._reapOrphanedRuns();
    }, this.reaperIntervalMs);
  }

  async _reapOrphanedRuns() {
    // Find runs stuck in running state but not in activeRuns
    const stuckRuns = await this._all(
      `SELECT * FROM heartbeat_runs 
       WHERE status = ? AND updated_at < datetime('now', '-5 minutes')`,
      [RunStatus.RUNNING]
    );
    
    for (const run of stuckRuns) {
      if (!this.activeRuns.has(run.id)) {
        // Run is orphaned
        await this.failRun(
          run.id,
          'Process lost - server may have restarted',
          ErrorCode.PROCESS_LOST,
          { shouldRetry: true }
        );
        
        this.emit('run:orphaned', { runId: run.id, agentId: run.agent_id });
      }
    }
  }

  _buildUsageJson(usage, run) {
    if (!usage) return null;
    
    return JSON.stringify({
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      cachedInputTokens: usage.cachedInputTokens || 0,
      costUsd: usage.costUsd,
      provider: usage.provider || 'unknown',
      model: usage.model,
      billingType: usage.billingType,
      sessionReused: !!run.session_id_before
    });
  }

  _formatRun(run) {
    return {
      id: run.id,
      agentId: run.agent_id,
      invocationSource: run.invocation_source,
      triggerDetail: run.trigger_detail,
      status: run.status,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      error: run.error,
      errorCode: run.error_code,
      wakeupRequestId: run.wakeup_request_id,
      exitCode: run.exit_code,
      signal: run.signal,
      usage: run.usage_json ? JSON.parse(run.usage_json) : null,
      result: run.result_json ? JSON.parse(run.result_json) : null,
      sessionIdBefore: run.session_id_before,
      sessionIdAfter: run.session_id_after,
      contextSnapshot: run.context_snapshot ? JSON.parse(run.context_snapshot) : {},
      logStore: run.log_store,
      logRef: run.log_ref,
      logBytes: run.log_bytes,
      logCompressed: run.log_compressed,
      processPid: run.process_pid,
      retryOfRunId: run.retry_of_run_id,
      externalRunId: run.external_run_id,
      createdAt: run.created_at,
      updatedAt: run.updated_at
    };
  }

  _formatEvent(event) {
    return {
      id: event.id,
      runId: event.run_id,
      agentId: event.agent_id,
      seq: event.seq,
      eventType: event.event_type,
      stream: event.stream,
      level: event.level,
      color: event.color,
      message: event.message,
      payload: event.payload ? JSON.parse(event.payload) : null,
      createdAt: event.created_at
    };
  }

  _formatCostEntry(entry) {
    return {
      id: entry.id,
      runId: entry.run_id,
      provider: entry.provider,
      biller: entry.biller,
      billingType: entry.billing_type,
      model: entry.model,
      inputTokens: entry.input_tokens,
      cachedInputTokens: entry.cached_input_tokens,
      outputTokens: entry.output_tokens,
      costCents: entry.cost_cents,
      occurredAt: entry.occurred_at
    };
  }

  _sanitizeLog(text) {
    if (!text || typeof text !== 'string') return text;
    // Basic redaction - can be extended
    return text
      .replace(/api[_-]?key[:\s=]+[^\s\n]+/gi, 'api_key=***REDACTED***')
      .replace(/password[:\s=]+[^\s\n]+/gi, 'password=***REDACTED***')
      .replace(/token[:\s=]+[^\s\n]+/gi, 'token=***REDACTED***');
  }

  _appendExcerpt(current, chunk) {
    const maxBytes = this.config.logExcerptBytes;
    const combined = (current || '') + chunk;
    if (combined.length <= maxBytes) return combined;
    return combined.slice(-maxBytes);
  }
}

/**
 * In-memory log storage for testing/development
 */
class MemoryLogStorage {
  constructor() {
    this.logs = new Map();
  }

  async append(runId, entry) {
    if (!this.logs.has(runId)) {
      this.logs.set(runId, []);
    }
    this.logs.get(runId).push(entry);
  }

  async stream(runId, onData) {
    const entries = this.logs.get(runId) || [];
    for (const entry of entries) {
      onData(entry);
    }
  }

  async finalize(runId) {
    const entries = this.logs.get(runId) || [];
    const bytes = entries.reduce((sum, e) => sum + (e.chunk?.length || 0), 0);
    return { bytes, compressed: false };
  }
}

export default HeartbeatService;
