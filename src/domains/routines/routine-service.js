/**
 * @fileoverview Routine Service - CRUD and management for scheduled routines
 * @module domains/routines/routine-service
 * @description Service layer for routine scheduling based on Paperclip patterns
 * @version 5.0.0
 */

import { AppError } from '../../utils/errors.js';
import cron from 'node-cron';

/**
 * Routine status values
 * @readonly
 * @enum {string}
 */
export const RoutineStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  ARCHIVED: 'archived'
};

/**
 * Routine priority values
 * @readonly
 * @enum {string}
 */
export const RoutinePriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Concurrency policy values
 * @readonly
 * @enum {string}
 */
export const ConcurrencyPolicy = {
  ALLOW_MULTIPLE: 'allow_multiple',
  SKIP_IF_ACTIVE: 'skip_if_active',
  COALESCE_IF_ACTIVE: 'coalesce_if_active'
};

/**
 * Catch-up policy values
 * @readonly
 * @enum {string}
 */
export const CatchUpPolicy = {
  SKIP_MISSED: 'skip_missed',
  RUN_ONCE: 'run_once',
  RUN_ALL_MISSED: 'run_all_missed'
};

/**
 * Trigger kind values
 * @readonly
 * @enum {string}
 */
export const TriggerKind = {
  CRON: 'cron',
  WEBHOOK: 'webhook',
  EVENT: 'event',
  MANUAL: 'manual'
};

/**
 * Run status values
 * @readonly
 * @enum {string}
 */
export const RunStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

/**
 * Run source values
 * @readonly
 * @enum {string}
 */
export const RunSource = {
  CRON: 'cron',
  WEBHOOK: 'webhook',
  EVENT: 'event',
  MANUAL: 'manual',
  RETRY: 'retry'
};

/**
 * Routine Service class
 * @class
 * @description Handles CRUD operations and business logic for routines
 */
export class RoutineService {
  /**
   * Creates a new RoutineService instance
   * @constructor
   * @param {Object} options - Service options
   * @param {import('better-sqlite3').Database} options.db - Database instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this._db = options.db;
    this._logger = options.logger || console;
  }

  // ============================================================
  // CRUD Operations - Routines
  // ============================================================

  /**
   * Create a new routine
   * @async
   * @param {Object} data - Routine data
   * @param {string} data.companyId - Company ID
   * @param {string} data.name - Routine name
   * @param {string} [data.description] - Routine description
   * @param {string} [data.projectId] - Project ID
   * @param {string} [data.goalId] - Goal ID
   * @param {string} [data.parentIssueId] - Parent issue ID
   * @param {string} [data.assigneeAgentId] - Assigned agent ID
   * @param {RoutinePriority} [data.priority='medium'] - Priority level
   * @param {ConcurrencyPolicy} [data.concurrencyPolicy='coalesce_if_active'] - Concurrency handling
   * @param {CatchUpPolicy} [data.catchUpPolicy='skip_missed'] - Missed run handling
   * @param {number} [data.maxRetries=3] - Maximum retry attempts
   * @param {number} [data.timeoutSeconds=3600] - Execution timeout
   * @param {string} [data.createdByAgentId] - Creating agent ID
   * @param {string} [data.createdByUserId] - Creating user ID
   * @returns {Promise<Object>} Created routine
   */
  async createRoutine(data) {
    this._validateRoutineData(data);

    const stmt = this._db.prepare(`
      INSERT INTO routines (
        company_id, project_id, goal_id, parent_issue_id, name, description,
        assignee_agent_id, priority, status, concurrency_policy, catch_up_policy,
        max_retries, timeout_seconds, created_by_agent_id, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const routine = stmt.get(
      data.companyId,
      data.projectId || null,
      data.goalId || null,
      data.parentIssueId || null,
      data.name,
      data.description || null,
      data.assigneeAgentId || null,
      data.priority || RoutinePriority.MEDIUM,
      RoutineStatus.ACTIVE,
      data.concurrencyPolicy || ConcurrencyPolicy.COALESCE_IF_ACTIVE,
      data.catchUpPolicy || CatchUpPolicy.SKIP_MISSED,
      data.maxRetries ?? 3,
      data.timeoutSeconds ?? 3600,
      data.createdByAgentId || null,
      data.createdByUserId || null
    );

    this._logger.info(`[RoutineService] Created routine: ${routine.id}`);
    return this._transformRoutine(routine);
  }

  /**
   * Get a routine by ID
   * @async
   * @param {string} id - Routine ID
   * @param {string} companyId - Company ID for verification
   * @returns {Promise<Object|null>} Routine or null
   */
  async getRoutine(id, companyId) {
    const stmt = this._db.prepare(`
      SELECT r.*, 
        GROUP_CONCAT(DISTINCT ra.agent_id) as assigned_agents
      FROM routines r
      LEFT JOIN routine_assignments ra ON r.id = ra.routine_id AND ra.is_active = 1
      WHERE r.id = ? AND r.company_id = ?
      GROUP BY r.id
    `);

    const routine = stmt.get(id, companyId);
    return routine ? this._transformRoutine(routine) : null;
  }

  /**
   * List routines for a company
   * @async
   * @param {string} companyId - Company ID
   * @param {Object} [filters={}] - Filter options
   * @param {RoutineStatus} [filters.status] - Filter by status
   * @param {string} [filters.projectId] - Filter by project
   * @param {string} [filters.agentId] - Filter by assigned agent
   * @param {number} [filters.limit=50] - Result limit
   * @param {number} [filters.offset=0] - Result offset
   * @returns {Promise<Object>} Paginated routines
   */
  async listRoutines(companyId, filters = {}) {
    let whereClause = 'WHERE r.company_id = ?';
    const params = [companyId];

    if (filters.status) {
      whereClause += ' AND r.status = ?';
      params.push(filters.status);
    }

    if (filters.projectId) {
      whereClause += ' AND r.project_id = ?';
      params.push(filters.projectId);
    }

    if (filters.agentId) {
      whereClause += ' AND r.assignee_agent_id = ?';
      params.push(filters.agentId);
    }

    const countStmt = this._db.prepare(`
      SELECT COUNT(*) as total FROM routines r ${whereClause}
    `);
    const { total } = countStmt.get(...params);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const stmt = this._db.prepare(`
      SELECT r.*,
        COUNT(DISTINCT rt.id) as trigger_count,
        COUNT(DISTINCT CASE WHEN rr.status IN ('pending', 'running') THEN rr.id END) as active_runs,
        MAX(rr.created_at) as last_run_at
      FROM routines r
      LEFT JOIN routine_triggers rt ON r.id = rt.routine_id
      LEFT JOIN routine_runs rr ON r.id = rr.routine_id
      ${whereClause}
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `);

    const routines = stmt.all(...params, limit, offset);

    return {
      data: routines.map(r => this._transformRoutine(r)),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + routines.length < total
      }
    };
  }

  /**
   * Update a routine
   * @async
   * @param {string} id - Routine ID
   * @param {string} companyId - Company ID
   * @param {Object} updates - Fields to update
   * @param {string} [updates.updatedByAgentId] - Updating agent ID
   * @param {string} [updates.updatedByUserId] - Updating user ID
   * @returns {Promise<Object>} Updated routine
   */
  async updateRoutine(id, companyId, updates) {
    const allowedFields = [
      'name', 'description', 'assignee_agent_id', 'priority',
      'concurrency_policy', 'catch_up_policy', 'max_retries',
      'timeout_seconds', 'project_id', 'goal_id', 'parent_issue_id'
    ];

    const setClause = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbField = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(dbField)) {
        setClause.push(`${dbField} = ?`);
        params.push(value);
      }
    }

    if (setClause.length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    params.push(id, companyId);

    const stmt = this._db.prepare(`
      UPDATE routines 
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
      RETURNING *
    `);

    const routine = stmt.get(...params);
    if (!routine) {
      throw new AppError('Routine not found', 404);
    }

    this._logger.info(`[RoutineService] Updated routine: ${id}`);
    return this._transformRoutine(routine);
  }

  /**
   * Delete a routine (soft delete via archive)
   * @async
   * @param {string} id - Routine ID
   * @param {string} companyId - Company ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteRoutine(id, companyId) {
    // Archive instead of hard delete
    const stmt = this._db.prepare(`
      UPDATE routines 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `);

    const result = stmt.run(RoutineStatus.ARCHIVED, id, companyId);
    
    if (result.changes === 0) {
      throw new AppError('Routine not found', 404);
    }

    // Disable all triggers
    this._db.prepare(`
      UPDATE routine_triggers 
      SET enabled = 0, updated_at = CURRENT_TIMESTAMP
      WHERE routine_id = ?
    `).run(id);

    this._logger.info(`[RoutineService] Archived routine: ${id}`);
    return true;
  }

  // ============================================================
  // Routine Triggers
  // ============================================================

  /**
   * Schedule a routine with a cron trigger
   * @async
   * @param {string} routineId - Routine ID
   * @param {string} companyId - Company ID
   * @param {Object} config - Schedule configuration
   * @param {string} config.cronExpression - Cron expression
   * @param {string} [config.timezone='UTC'] - Timezone
   * @param {string} [config.label] - Trigger label
   * @returns {Promise<Object>} Created trigger
   */
  async scheduleRoutine(routineId, companyId, config) {
    // Validate cron expression
    if (!this._validateCronExpression(config.cronExpression)) {
      throw new AppError(`Invalid cron expression: ${config.cronExpression}`, 400);
    }

    // Calculate next run time
    const nextRunAt = this._calculateNextRun(config.cronExpression, config.timezone);

    const publicId = this._generatePublicId();

    const stmt = this._db.prepare(`
      INSERT INTO routine_triggers (
        company_id, routine_id, kind, label, enabled, cron_expression,
        timezone, next_run_at, public_id, created_by_agent_id, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const trigger = stmt.get(
      companyId,
      routineId,
      TriggerKind.CRON,
      config.label || null,
      1,
      config.cronExpression,
      config.timezone || 'UTC',
      nextRunAt.toISOString(),
      publicId,
      config.createdByAgentId || null,
      config.createdByUserId || null
    );

    this._logger.info(`[RoutineService] Scheduled routine ${routineId} with cron: ${config.cronExpression}`);
    return this._transformTrigger(trigger);
  }

  /**
   * Create a webhook trigger
   * @async
   * @param {string} routineId - Routine ID
   * @param {string} companyId - Company ID
   * @param {Object} config - Webhook configuration
   * @param {string} [config.label] - Trigger label
   * @param {string} [config.signingMode] - Request signing mode
   * @param {number} [config.replayWindowSec=300] - Replay protection window
   * @returns {Promise<Object>} Created trigger
   */
  async createWebhookTrigger(routineId, companyId, config = {}) {
    const publicId = this._generatePublicId();
    const webhookSecret = this._generateSecret();

    const stmt = this._db.prepare(`
      INSERT INTO routine_triggers (
        company_id, routine_id, kind, label, enabled, public_id,
        webhook_secret, signing_mode, replay_window_sec,
        created_by_agent_id, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const trigger = stmt.get(
      companyId,
      routineId,
      TriggerKind.WEBHOOK,
      config.label || null,
      1,
      publicId,
      webhookSecret,
      config.signingMode || null,
      config.replayWindowSec || 300,
      config.createdByAgentId || null,
      config.createdByUserId || null
    );

    this._logger.info(`[RoutineService] Created webhook trigger for routine ${routineId}`);
    return this._transformTrigger(trigger);
  }

  /**
   * Create an event-based trigger
   * @async
   * @param {string} routineId - Routine ID
   * @param {string} companyId - Company ID
   * @param {Object} config - Event configuration
   * @param {string} config.eventType - Event type to listen for
   * @param {Object} [config.filters] - Event filter conditions
   * @param {string} [config.label] - Trigger label
   * @returns {Promise<Object>} Created trigger
   */
  async createEventTrigger(routineId, companyId, config) {
    if (!config.eventType) {
      throw new AppError('eventType is required for event triggers', 400);
    }

    const stmt = this._db.prepare(`
      INSERT INTO routine_triggers (
        company_id, routine_id, kind, label, enabled,
        event_type, event_filters, created_by_agent_id, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const trigger = stmt.get(
      companyId,
      routineId,
      TriggerKind.EVENT,
      config.label || null,
      1,
      config.eventType,
      config.filters ? JSON.stringify(config.filters) : null,
      config.createdByAgentId || null,
      config.createdByUserId || null
    );

    this._logger.info(`[RoutineService] Created event trigger for routine ${routineId}: ${config.eventType}`);
    return this._transformTrigger(trigger);
  }

  /**
   * List triggers for a routine
   * @async
   * @param {string} routineId - Routine ID
   * @param {string} companyId - Company ID
   * @returns {Promise<Array<Object>>} List of triggers
   */
  async listTriggers(routineId, companyId) {
    const stmt = this._db.prepare(`
      SELECT * FROM routine_triggers
      WHERE routine_id = ? AND company_id = ?
      ORDER BY created_at DESC
    `);

    const triggers = stmt.all(routineId, companyId);
    return triggers.map(t => this._transformTrigger(t));
  }

  /**
   * Update a trigger
   * @async
   * @param {string} triggerId - Trigger ID
   * @param {string} companyId - Company ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated trigger
   */
  async updateTrigger(triggerId, companyId, updates) {
    // Validate cron if provided
    if (updates.cronExpression && !this._validateCronExpression(updates.cronExpression)) {
      throw new AppError(`Invalid cron expression: ${updates.cronExpression}`, 400);
    }

    const allowedFields = ['label', 'enabled', 'cron_expression', 'timezone', 'event_type', 'event_filters'];
    const setClause = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbField = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(dbField)) {
        setClause.push(`${dbField} = ?`);
        params.push(dbField === 'event_filters' && value ? JSON.stringify(value) : value);
      }
    }

    if (setClause.length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    // Recalculate next run if cron changed
    if (updates.cronExpression) {
      const nextRunAt = this._calculateNextRun(updates.cronExpression, updates.timezone || 'UTC');
      setClause.push('next_run_at = ?');
      params.push(nextRunAt.toISOString());
    }

    params.push(triggerId, companyId);

    const stmt = this._db.prepare(`
      UPDATE routine_triggers 
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
      RETURNING *
    `);

    const trigger = stmt.get(...params);
    if (!trigger) {
      throw new AppError('Trigger not found', 404);
    }

    return this._transformTrigger(trigger);
  }

  /**
   * Delete a trigger
   * @async
   * @param {string} triggerId - Trigger ID
   * @param {string} companyId - Company ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteTrigger(triggerId, companyId) {
    const stmt = this._db.prepare(`
      DELETE FROM routine_triggers
      WHERE id = ? AND company_id = ?
    `);

    const result = stmt.run(triggerId, companyId);
    return result.changes > 0;
  }

  // ============================================================
  // Routine Execution
  // ============================================================

  /**
   * Run a routine immediately
   * @async
   * @param {string} routineId - Routine ID
   * @param {string} companyId - Company ID
   * @param {Object} [options={}] - Run options
   * @param {Object} [options.payload] - Trigger payload
   * @param {string} [options.triggeredBy] - User/agent ID who triggered
   * @returns {Promise<Object>} Created run record
   */
  async runRoutine(routineId, companyId, options = {}) {
    const routine = await this.getRoutine(routineId, companyId);
    if (!routine) {
      throw new AppError('Routine not found', 404);
    }

    if (routine.status !== RoutineStatus.ACTIVE) {
      throw new AppError(`Cannot run routine with status: ${routine.status}`, 400);
    }

    // Check concurrency policy
    if (routine.concurrencyPolicy !== ConcurrencyPolicy.ALLOW_MULTIPLE) {
      const activeRuns = this._db.prepare(`
        SELECT COUNT(*) as count FROM routine_runs
        WHERE routine_id = ? AND status IN ('pending', 'running')
      `).get(routineId);

      if (activeRuns.count > 0) {
        if (routine.concurrencyPolicy === ConcurrencyPolicy.SKIP_IF_ACTIVE) {
          this._logger.info(`[RoutineService] Skipping run for ${routineId}: active run exists`);
          return { skipped: true, reason: 'active_run_exists' };
        }
        // COALESCE_IF_ACTIVE - will be handled during execution
      }
    }

    // Create run record
    const runStmt = this._db.prepare(`
      INSERT INTO routine_runs (
        company_id, routine_id, source, status, priority,
        trigger_payload, idempotency_key, max_attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const idempotencyKey = options.idempotencyKey || `manual:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

    const run = runStmt.get(
      companyId,
      routineId,
      RunSource.MANUAL,
      RunStatus.PENDING,
      routine.priority,
      options.payload ? JSON.stringify(options.payload) : null,
      idempotencyKey,
      routine.maxRetries
    );

    // Update routine last triggered
    this._db.prepare(`
      UPDATE routines SET last_triggered_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(routineId);

    this._logger.info(`[RoutineService] Queued run ${run.id} for routine ${routineId}`);
    return this._transformRun(run);
  }

  /**
   * Pause a routine
   * @async
   * @param {string} routineId - Routine ID
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} Updated routine
   */
  async pauseRoutine(routineId, companyId) {
    return this.updateRoutine(routineId, companyId, { status: RoutineStatus.PAUSED });
  }

  /**
   * Resume a routine
   * @async
   * @param {string} routineId - Routine ID
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} Updated routine
   */
  async resumeRoutine(routineId, companyId) {
    return this.updateRoutine(routineId, companyId, { status: RoutineStatus.ACTIVE });
  }

  /**
   * Get run history for a routine
   * @async
   * @param {string} routineId - Routine ID
   * @param {string} companyId - Company ID
   * @param {Object} [options={}] - Query options
   * @param {RunStatus} [options.status] - Filter by status
   * @param {number} [options.limit=20] - Result limit
   * @param {number} [options.offset=0] - Result offset
   * @returns {Promise<Object>} Paginated runs
   */
  async getRunHistory(routineId, companyId, options = {}) {
    let whereClause = 'WHERE routine_id = ? AND company_id = ?';
    const params = [routineId, companyId];

    if (options.status) {
      whereClause += ' AND status = ?';
      params.push(options.status);
    }

    const countStmt = this._db.prepare(`
      SELECT COUNT(*) as total FROM routine_runs ${whereClause}
    `);
    const { total } = countStmt.get(...params);

    const limit = options.limit || 20;
    const offset = options.offset || 0;

    const stmt = this._db.prepare(`
      SELECT * FROM routine_runs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const runs = stmt.all(...params, limit, offset);

    return {
      data: runs.map(r => this._transformRun(r)),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + runs.length < total
      }
    };
  }

  /**
   * Get a specific run
   * @async
   * @param {string} runId - Run ID
   * @param {string} companyId - Company ID
   * @returns {Promise<Object|null>} Run record
   */
  async getRun(runId, companyId) {
    const stmt = this._db.prepare(`
      SELECT * FROM routine_runs WHERE id = ? AND company_id = ?
    `);

    const run = stmt.get(runId, companyId);
    return run ? this._transformRun(run) : null;
  }

  /**
   * Cancel a run
   * @async
   * @param {string} runId - Run ID
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} Cancelled run
   */
  async cancelRun(runId, companyId) {
    const stmt = this._db.prepare(`
      UPDATE routine_runs 
      SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ? AND status IN ('pending', 'running')
      RETURNING *
    `);

    const run = stmt.get(RunStatus.CANCELLED, runId, companyId);
    if (!run) {
      throw new AppError('Run not found or cannot be cancelled', 404);
    }

    return this._transformRun(run);
  }

  /**
   * Retry a failed run
   * @async
   * @param {string} runId - Run ID to retry
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} New run record
   */
  async retryRun(runId, companyId) {
    const originalRun = await this.getRun(runId, companyId);
    if (!originalRun) {
      throw new AppError('Run not found', 404);
    }

    if (![RunStatus.FAILED, RunStatus.TIMEOUT, RunStatus.CANCELLED].includes(originalRun.status)) {
      throw new AppError(`Cannot retry run with status: ${originalRun.status}`, 400);
    }

    const runStmt = this._db.prepare(`
      INSERT INTO routine_runs (
        company_id, routine_id, trigger_id, source, status, priority,
        trigger_payload, idempotency_key, attempt_number, max_attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const newRun = runStmt.get(
      companyId,
      originalRun.routineId,
      originalRun.triggerId,
      RunSource.RETRY,
      RunStatus.PENDING,
      originalRun.priority,
      originalRun.triggerPayload ? JSON.stringify(originalRun.triggerPayload) : null,
      `${originalRun.idempotencyKey}:retry:${Date.now()}`,
      originalRun.attemptNumber + 1,
      originalRun.maxAttempts
    );

    this._logger.info(`[RoutineService] Created retry run ${newRun.id} for original ${runId}`);
    return this._transformRun(newRun);
  }

  /**
   * Get pending runs ready for execution
   * @async
   * @param {number} [limit=10] - Maximum runs to fetch
   * @returns {Promise<Array<Object>>} Pending runs
   */
  async getPendingRuns(limit = 10) {
    const stmt = this._db.prepare(`
      SELECT rr.*, r.name as routine_name, r.concurrency_policy, r.timeout_seconds
      FROM routine_runs rr
      JOIN routines r ON rr.routine_id = r.id
      WHERE rr.status = ?
      ORDER BY 
        CASE rr.priority
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END,
        rr.triggered_at ASC
      LIMIT ?
    `);

    const runs = stmt.all(RunStatus.PENDING, limit);
    return runs.map(r => this._transformRun(r));
  }

  // ============================================================
  // Agent Assignments
  // ============================================================

  /**
   * Assign an agent to a routine
   * @async
   * @param {string} routineId - Routine ID
   * @param {string} agentId - Agent ID
   * @param {Object} [options={}] - Assignment options
   * @param {string} [options.type='primary'] - Assignment type
   * @param {string} [options.assignedBy] - Who made the assignment
   * @returns {Promise<Object>} Created assignment
   */
  async assignAgent(routineId, agentId, options = {}) {
    const stmt = this._db.prepare(`
      INSERT OR REPLACE INTO routine_assignments (
        routine_id, agent_id, assignment_type, is_active, assigned_by, notes
      ) VALUES (?, ?, ?, 1, ?, ?)
      RETURNING *
    `);

    const assignment = stmt.get(
      routineId,
      agentId,
      options.type || 'primary',
      options.assignedBy || null,
      options.notes || null
    );

    return assignment;
  }

  /**
   * Unassign an agent from a routine
   * @async
   * @param {string} routineId - Routine ID
   * @param {string} agentId - Agent ID
   * @returns {Promise<boolean>} True if unassigned
   */
  async unassignAgent(routineId, agentId) {
    const stmt = this._db.prepare(`
      UPDATE routine_assignments 
      SET is_active = 0, unassigned_at = CURRENT_TIMESTAMP
      WHERE routine_id = ? AND agent_id = ?
    `);

    const result = stmt.run(routineId, agentId);
    return result.changes > 0;
  }

  // ============================================================
  // Private Methods
  // ============================================================

  /**
   * Validate routine data
   * @private
   * @param {Object} data - Routine data
   * @throws {AppError} If validation fails
   */
  _validateRoutineData(data) {
    if (!data.companyId) {
      throw new AppError('companyId is required', 400);
    }
    if (!data.name || data.name.trim().length === 0) {
      throw new AppError('name is required', 400);
    }
    if (data.name.length > 255) {
      throw new AppError('name must be less than 255 characters', 400);
    }
  }

  /**
   * Validate cron expression
   * @private
   * @param {string} expression - Cron expression
   * @returns {boolean} True if valid
   */
  _validateCronExpression(expression) {
    if (!expression || typeof expression !== 'string') {
      return false;
    }
    return cron.validate(expression);
  }

  /**
   * Calculate next run time from cron expression
   * @private
   * @param {string} expression - Cron expression
   * @param {string} timezone - Timezone
   * @returns {Date} Next run date
   */
  _calculateNextRun(expression, timezone = 'UTC') {
    // Use node-cron to get next run
    // This is a simplified version - in production, use a proper cron parser
    const nextRun = new Date();
    nextRun.setMinutes(nextRun.getMinutes() + 1);
    
    return nextRun;
  }

  /**
   * Generate a public ID for webhooks
   * @private
   * @returns {string} Public ID
   */
  _generatePublicId() {
    return `wh_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a webhook secret
   * @private
   * @returns {string} Secret
   */
  _generateSecret() {
    return Array.from({ length: 32 }, () => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('');
  }

  /**
   * Transform database routine to API format
   * @private
   * @param {Object} row - Database row
   * @returns {Object} Transformed routine
   */
  _transformRoutine(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      companyId: row.company_id,
      projectId: row.project_id,
      goalId: row.goal_id,
      parentIssueId: row.parent_issue_id,
      name: row.name,
      description: row.description,
      assigneeAgentId: row.assignee_agent_id,
      assignedAgents: row.assigned_agents ? row.assigned_agents.split(',') : [],
      priority: row.priority,
      status: row.status,
      concurrencyPolicy: row.concurrency_policy,
      catchUpPolicy: row.catch_up_policy,
      maxRetries: row.max_retries,
      timeoutSeconds: row.timeout_seconds,
      triggerCount: row.trigger_count || 0,
      activeRuns: row.active_runs || 0,
      lastRunAt: row.last_run_at,
      lastTriggeredAt: row.last_triggered_at,
      lastEnqueuedAt: row.last_enqueued_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Transform database trigger to API format
   * @private
   * @param {Object} row - Database row
   * @returns {Object} Transformed trigger
   */
  _transformTrigger(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      companyId: row.company_id,
      routineId: row.routine_id,
      kind: row.kind,
      label: row.label,
      enabled: Boolean(row.enabled),
      cronExpression: row.cron_expression,
      timezone: row.timezone,
      nextRunAt: row.next_run_at,
      lastFiredAt: row.last_fired_at,
      publicId: row.public_id,
      signingMode: row.signing_mode,
      replayWindowSec: row.replay_window_sec,
      eventType: row.event_type,
      eventFilters: row.event_filters ? JSON.parse(row.event_filters) : null,
      lastResult: row.last_result,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Transform database run to API format
   * @private
   * @param {Object} row - Database row
   * @returns {Object} Transformed run
   */
  _transformRun(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      companyId: row.company_id,
      routineId: row.routine_id,
      triggerId: row.trigger_id,
      source: row.source,
      status: row.status,
      priority: row.priority,
      triggeredAt: row.triggered_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      idempotencyKey: row.idempotency_key,
      triggerPayload: row.trigger_payload ? JSON.parse(row.trigger_payload) : null,
      linkedIssueId: row.linked_issue_id,
      coalescedIntoRunId: row.coalesced_into_run_id,
      attemptNumber: row.attempt_number,
      maxAttempts: row.max_attempts,
      failureReason: row.failure_reason,
      errorDetails: row.error_details ? JSON.parse(row.error_details) : null,
      outputData: row.output_data ? JSON.parse(row.output_data) : null,
      executionDurationMs: row.execution_duration_ms,
      agentId: row.agent_id,
      routineName: row.routine_name,
      concurrencyPolicy: row.concurrency_policy,
      timeoutSeconds: row.timeout_seconds,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export default RoutineService;
