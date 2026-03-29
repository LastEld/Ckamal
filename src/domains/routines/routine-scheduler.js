/**
 * @fileoverview Routine Scheduler - Cron job management and execution
 * @module domains/routines/routine-scheduler
 * @description Manages scheduled routine execution with distributed locking
 * @version 5.0.0
 */

import cron from 'node-cron';
import { EventEmitter } from 'events';
import { RoutineService, RunStatus, RunSource, TriggerKind, RoutineStatus } from './routine-service.js';
import { SpawnManager } from '../../bios/spawn-manager.js';

/**
 * Scheduler configuration
 * @typedef {Object} SchedulerConfig
 * @property {number} pollIntervalMs - Interval to check for due routines
 * @property {number} lockTimeoutMs - How long a lock is valid
 * @property {number} maxConcurrentRuns - Maximum concurrent executions
 * @property {string} instanceId - Unique identifier for this scheduler instance
 */

/**
 * Routine Scheduler class
 * @class
 * @extends EventEmitter
 * @description Manages cron-based routine scheduling with distributed locking
 */
export class RoutineScheduler extends EventEmitter {
  /**
   * Default configuration
   * @readonly
   * @type {SchedulerConfig}
   */
  static DEFAULT_CONFIG = {
    pollIntervalMs: 30000,      // Check every 30 seconds
    lockTimeoutMs: 300000,      // 5 minute lock timeout
    maxConcurrentRuns: 10,      // Max concurrent executions
    instanceId: `${process.env.HOSTNAME || 'scheduler'}-${Date.now()}`
  };

  /**
   * Creates a new RoutineScheduler instance
   * @constructor
   * @param {Object} options - Scheduler options
   * @param {import('better-sqlite3').Database} options.db - Database instance
   * @param {RoutineService} [options.routineService] - Routine service instance
   * @param {Object} [options.heartbeatService] - Heartbeat service for health checks
   * @param {SpawnManager} [options.spawnManager] - Spawn manager for agent execution
   * @param {Object} [options.logger] - Logger instance
   * @param {SchedulerConfig} [options.config] - Scheduler configuration
   */
  constructor(options = {}) {
    super();

    this._db = options.db;
    this._routineService = options.routineService || new RoutineService({ db: options.db });
    this._heartbeatService = options.heartbeatService || null;
    this._spawnManager = options.spawnManager || null;
    this._logger = options.logger || console;
    this._config = { ...RoutineScheduler.DEFAULT_CONFIG, ...options.config };

    /**
     * Active cron tasks
     * @type {Map<string, cron.ScheduledTask>}
     * @private
     */
    this._cronTasks = new Map();

    /**
     * Poll interval timer
     * @type {Timer|null}
     * @private
     */
    this._pollTimer = null;

    /**
     * Lock cleanup timer
     * @type {Timer|null}
     * @private
     */
    this._cleanupTimer = null;

    /**
     * Currently executing runs
     * @type {Map<string, Promise>}
     * @private
     */
    this._executingRuns = new Map();

    /**
     * Scheduler running state
     * @type {boolean}
     * @private
     */
    this._isRunning = false;

    /**
     * Shutdown flag
     * @type {boolean}
     * @private
     */
    this._shutdownRequested = false;
  }

  /**
   * Check if scheduler is running
   * @returns {boolean}
   */
  get isRunning() {
    return this._isRunning;
  }

  /**
   * Get scheduler status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isRunning: this._isRunning,
      activeCronTasks: this._cronTasks.size,
      executingRuns: this._executingRuns.size,
      instanceId: this._config.instanceId,
      config: { ...this._config }
    };
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Start the scheduler
   * @async
   * @returns {Promise<void>}
   */
  async start() {
    if (this._isRunning) {
      this._logger.warn('[RoutineScheduler] Already running');
      return;
    }

    this._logger.info(`[RoutineScheduler] Starting instance ${this._config.instanceId}`);
    this._shutdownRequested = false;
    this._isRunning = true;

    // Load and schedule all active cron triggers
    await this._loadCronTriggers();

    // Start polling for due routines (for non-cron triggers and catch-up)
    this._startPolling();

    // Start lock cleanup
    this._startLockCleanup();

    // Register with heartbeat service if available
    if (this._heartbeatService) {
      this._heartbeatService.registerComponent('routine-scheduler', {
        status: () => this.getStatus(),
        health: () => this._healthCheck()
      });
    }

    this.emit('started');
    this._logger.info('[RoutineScheduler] Started successfully');
  }

  /**
   * Stop the scheduler
   * @async
   * @param {Object} [options={}] - Stop options
   * @param {boolean} [options.waitForRunning=true] - Wait for running tasks
   * @param {number} [options.timeoutMs=30000] - Timeout for waiting
   * @returns {Promise<void>}
   */
  async stop(options = {}) {
    if (!this._isRunning) {
      return;
    }

    this._logger.info('[RoutineScheduler] Stopping...');
    this._shutdownRequested = true;

    // Stop polling
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    // Stop lock cleanup
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    // Stop all cron tasks
    for (const [id, task] of this._cronTasks) {
      task.stop();
      this._logger.debug(`[RoutineScheduler] Stopped cron task: ${id}`);
    }
    this._cronTasks.clear();

    // Wait for executing runs
    if (options.waitForRunning !== false && this._executingRuns.size > 0) {
      this._logger.info(`[RoutineScheduler] Waiting for ${this._executingRuns.size} executing runs...`);
      await this._waitForExecutingRuns(options.timeoutMs || 30000);
    }

    // Release all locks held by this instance
    this._releaseInstanceLocks();

    this._isRunning = false;
    this.emit('stopped');
    this._logger.info('[RoutineScheduler] Stopped');
  }

  // ============================================================
  // Cron Management
  // ============================================================

  /**
   * Schedule a routine with cron
   * @async
   * @param {Object} trigger - Trigger configuration
   * @param {string} trigger.id - Trigger ID
   * @param {string} trigger.routineId - Routine ID
   * @param {string} trigger.companyId - Company ID
   * @param {string} trigger.cronExpression - Cron expression
   * @param {string} [trigger.timezone='UTC'] - Timezone
   * @returns {Promise<boolean>} True if scheduled
   */
  async scheduleCron(trigger) {
    const taskId = `cron:${trigger.id}`;

    // Stop existing task if present
    if (this._cronTasks.has(taskId)) {
      this._cronTasks.get(taskId).stop();
      this._cronTasks.delete(taskId);
    }

    try {
      const task = cron.schedule(trigger.cronExpression, async () => {
        await this._triggerCronRun(trigger);
      }, {
        scheduled: true,
        timezone: trigger.timezone || 'UTC'
      });

      this._cronTasks.set(taskId, task);
      this._logger.debug(`[RoutineScheduler] Scheduled cron: ${taskId} (${trigger.cronExpression})`);
      
      this.emit('cron:scheduled', { triggerId: trigger.id, routineId: trigger.routineId });
      return true;
    } catch (error) {
      this._logger.error(`[RoutineScheduler] Failed to schedule cron ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Unschedule a cron trigger
   * @async
   * @param {string} triggerId - Trigger ID
   * @returns {Promise<boolean>} True if unscheduled
   */
  async unscheduleCron(triggerId) {
    const taskId = `cron:${triggerId}`;
    const task = this._cronTasks.get(taskId);

    if (task) {
      task.stop();
      this._cronTasks.delete(taskId);
      this._logger.debug(`[RoutineScheduler] Unscheduled cron: ${taskId}`);
      this.emit('cron:unscheduled', { triggerId });
      return true;
    }

    return false;
  }

  /**
   * Reload all cron triggers from database
   * @private
   * @async
   */
  async _loadCronTriggers() {
    const stmt = this._db.prepare(`
      SELECT rt.*, r.status as routine_status
      FROM routine_triggers rt
      JOIN routines r ON rt.routine_id = r.id
      WHERE rt.kind = ? AND rt.enabled = 1 AND r.status = ?
    `);

    const triggers = stmt.all(TriggerKind.CRON, RoutineStatus.ACTIVE);

    for (const trigger of triggers) {
      await this.scheduleCron({
        id: trigger.id,
        routineId: trigger.routine_id,
        companyId: trigger.company_id,
        cronExpression: trigger.cron_expression,
        timezone: trigger.timezone
      });
    }

    this._logger.info(`[RoutineScheduler] Loaded ${triggers.length} cron triggers`);
  }

  // ============================================================
  // Execution
  // ============================================================

  /**
   * Execute a routine run
   * @async
   * @param {string} runId - Run ID to execute
   * @returns {Promise<Object>} Execution result
   */
  async executeRun(runId) {
    if (this._executingRuns.has(runId)) {
      return { status: 'already_running', runId };
    }

    // Check concurrent execution limit
    if (this._executingRuns.size >= this._config.maxConcurrentRuns) {
      this._logger.warn(`[RoutineScheduler] Max concurrent runs reached, deferring ${runId}`);
      return { status: 'deferred', runId };
    }

    const executionPromise = this._doExecute(runId);
    this._executingRuns.set(runId, executionPromise);

    try {
      const result = await executionPromise;
      return result;
    } finally {
      this._executingRuns.delete(runId);
    }
  }

  /**
   * Internal execution logic
   * @private
   * @async
   * @param {string} runId - Run ID
   * @returns {Promise<Object>} Execution result
   */
  async _doExecute(runId) {
    const startTime = Date.now();
    
    // Get run details with lock
    const run = await this._acquireRunLock(runId);
    if (!run) {
      return { status: 'lock_failed', runId };
    }

    this._logger.info(`[RoutineScheduler] Executing run ${runId} for routine ${run.routine_id}`);
    this.emit('run:started', { runId, routineId: run.routine_id });

    try {
      // Update run status to running
      this._db.prepare(`
        UPDATE routine_runs 
        SET status = ?, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(RunStatus.RUNNING, runId);

      // Execute the routine (this is where the actual work happens)
      const result = await this._performExecution(run);

      // Update run as completed
      const duration = Date.now() - startTime;
      this._db.prepare(`
        UPDATE routine_runs 
        SET status = ?, completed_at = CURRENT_TIMESTAMP, 
            execution_duration_ms = ?, output_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        RunStatus.COMPLETED, 
        duration, 
        result.output ? JSON.stringify(result.output) : null,
        runId
      );

      // Update trigger last_fired_at if applicable
      if (run.trigger_id) {
        this._db.prepare(`
          UPDATE routine_triggers 
          SET last_fired_at = CURRENT_TIMESTAMP, last_result = ?
          WHERE id = ?
        `).run('success', run.trigger_id);
      }

      this._logger.info(`[RoutineScheduler] Completed run ${runId} in ${duration}ms`);
      this.emit('run:completed', { runId, duration, routineId: run.routine_id });

      return { status: 'completed', runId, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Update run as failed
      this._db.prepare(`
        UPDATE routine_runs 
        SET status = ?, completed_at = CURRENT_TIMESTAMP, 
            execution_duration_ms = ?, failure_reason = ?, error_details = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        RunStatus.FAILED,
        duration,
        error.message,
        JSON.stringify({ stack: error.stack, code: error.code }),
        runId
      );

      this._logger.error(`[RoutineScheduler] Failed run ${runId}:`, error);
      this.emit('run:failed', { runId, error: error.message, routineId: run.routine_id });

      return { status: 'failed', runId, error: error.message };

    } finally {
      // Release lock
      this._releaseRunLock(runId);
    }
  }

  /**
   * Perform the actual routine execution
   * @private
   * @async
   * @param {Object} run - Run record
   * @returns {Promise<Object>} Execution output
   */
  async _performExecution(run) {
    const routine = this._db.prepare('SELECT * FROM routines WHERE id = ?').get(run.routine_id);
    if (!routine) {
      throw new Error(`Routine not found: ${run.routine_id}`);
    }

    // Get assigned agent
    const assignment = this._db.prepare(`
      SELECT agent_id FROM routine_assignments 
      WHERE routine_id = ? AND is_active = 1 AND assignment_type = 'primary'
      LIMIT 1
    `).get(routine.id);

    const agentId = assignment?.agent_id || routine.assignee_agent_id;

    // Update run with agent
    if (agentId) {
      this._db.prepare(`UPDATE routine_runs SET agent_id = ? WHERE id = ?`).run(agentId, run.id);
    }

    // Execute via spawn manager if available, otherwise simulate
    if (this._spawnManager && agentId) {
      return await this._executeWithAgent(run, routine, agentId);
    }

    // Fallback: simulate execution when no spawn manager or agent
    this._logger.debug(`[RoutineScheduler] Simulating execution for routine ${routine.id} (no spawn manager or agent assigned)`);
    return await this._simulateExecution(run, routine, agentId);
  }

  /**
   * Execute routine using the spawn manager
   * @private
   * @async
   * @param {Object} run - Run record
   * @param {Object} routine - Routine record
   * @param {string} agentId - Agent ID to execute with
   * @returns {Promise<Object>} Execution output
   */
  async _executeWithAgent(run, routine, agentId) {
    this._logger.info(`[RoutineScheduler] Executing routine ${routine.id} with agent ${agentId}`);

    try {
      // Resolve agent CV from agent ID
      const cv = await this._resolveAgentCV(agentId, routine);
      if (!cv) {
        throw new Error(`Could not resolve CV for agent ${agentId}`);
      }

      // Create heartbeat run for tracking if heartbeat service available
      let heartbeatRunId = null;
      if (this._heartbeatService) {
        const heartbeatRun = await this._heartbeatService.createRun({
          agentId,
          invocationSource: 'routine',
          triggerDetail: `routine:${routine.id}`,
          contextSnapshot: {
            routineId: routine.id,
            runId: run.id,
            routineName: routine.name,
            companyId: routine.company_id
          }
        });
        heartbeatRunId = heartbeatRun?.id;
      }

      // Spawn and execute agent
      const spawnOptions = {
        context: {
          routineId: routine.id,
          runId: run.id,
          routineName: routine.name,
          companyId: routine.company_id,
          triggerPayload: run.trigger_payload,
          taskKey: `routine:${routine.id}`
        },
        heartbeatRunId,
        task: {
          taskKey: `routine:${routine.id}`,
          type: 'routine_execution',
          description: `Execute routine: ${routine.name}`,
          complexity: routine.priority === 'critical' ? 9 : routine.priority === 'high' ? 7 : 5
        }
      };

      const agent = await this._spawnManager.spawnAgent(cv, spawnOptions);

      // Wait for agent execution to complete
      const executionResult = await this._waitForAgentExecution(agent, routine.timeout_seconds);

      // Complete heartbeat run if created
      if (heartbeatRunId && this._heartbeatService) {
        await this._heartbeatService.completeRun(heartbeatRunId, {
          resultJson: executionResult,
          exitCode: 0
        });
      }

      // Terminate the spawned agent
      await this._spawnManager.terminateAgent(agent.id, { 
        timeout: Math.min(routine.timeout_seconds * 1000 / 2, 30000) 
      }).catch(err => {
        this._logger.warn(`[RoutineScheduler] Failed to terminate agent ${agent.id}:`, err.message);
      });

      return {
        output: {
          executedAt: new Date().toISOString(),
          agentId: agent.id,
          routineName: routine.name,
          result: executionResult
        }
      };

    } catch (error) {
      this._logger.error(`[RoutineScheduler] Agent execution failed for routine ${routine.id}:`, error);
      
      // Emit failure event for monitoring
      this.emit('agentExecutionFailed', {
        runId: run.id,
        routineId: routine.id,
        agentId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Resolve CV for an agent ID
   * @private
   * @async
   * @param {string} agentId - Agent ID
   * @param {Object} routine - Routine record for fallback
   * @returns {Promise<Object|null>} Agent CV or null
   */
  async _resolveAgentCV(agentId, routine) {
    // Try to get CV from spawn manager's active agents
    const existingRecord = this._spawnManager.spawnRecords?.get(agentId);
    if (existingRecord?.cvId) {
      // Build minimal CV from record
      return {
        id: existingRecord.cvId,
        type: 'routine-agent',
        capabilities: {
          routineExecution: true,
          ...(existingRecord.assignedClient && {
            assignedClient: existingRecord.assignedClient.name
          })
        },
        execution: {
          retryPolicy: {
            maxAttempts: routine.max_retries || 3
          }
        }
      };
    }

    // Fallback: create a generic CV for the agent
    return {
      id: `routine-agent-${agentId}`,
      type: 'routine-agent',
      capabilities: {
        routineExecution: true,
        taskAutomation: true
      },
      execution: {
        retryPolicy: {
          maxAttempts: routine.max_retries || 3
        }
      }
    };
  }

  /**
   * Wait for agent execution to complete
   * @private
   * @async
   * @param {import('../../engine/agent.js').Agent} agent - Spawned agent
   * @param {number} timeoutSeconds - Maximum wait time
   * @returns {Promise<Object>} Execution result
   */
  async _waitForAgentExecution(agent, timeoutSeconds) {
    const timeoutMs = (timeoutSeconds || 3600) * 1000;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const status = agent.getStatus ? agent.getStatus() : { state: 'unknown' };
        
        // Check for completion states
        if (status.state === 'completed' || status.state === 'succeeded') {
          clearInterval(checkInterval);
          clearTimeout(timeoutTimer);
          resolve(status.result || { status: 'completed' });
          return;
        }

        if (status.state === 'failed' || status.state === 'error') {
          clearInterval(checkInterval);
          clearTimeout(timeoutTimer);
          reject(new Error(status.error || 'Agent execution failed'));
          return;
        }

        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          clearTimeout(timeoutTimer);
          reject(new Error(`Agent execution timeout after ${timeoutSeconds}s`));
        }
      }, 1000);

      const timeoutTimer = setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Agent execution timeout after ${timeoutSeconds}s`));
      }, timeoutMs);

      // Listen for agent events if available
      if (agent.on) {
        agent.once('taskCompleted', (event) => {
          clearInterval(checkInterval);
          clearTimeout(timeoutTimer);
          resolve(event.result || { status: 'completed' });
        });

        agent.once('taskFailed', (event) => {
          clearInterval(checkInterval);
          clearTimeout(timeoutTimer);
          reject(new Error(event.error || 'Agent task failed'));
        });

        agent.once('terminated', () => {
          clearInterval(checkInterval);
          clearTimeout(timeoutTimer);
          resolve({ status: 'terminated' });
        });
      }
    });
  }

  /**
   * Simulate routine execution (fallback when no spawn manager)
   * @private
   * @async
   * @param {Object} run - Run record
   * @param {Object} routine - Routine record
   * @param {string} [agentId] - Assigned agent ID
   * @returns {Promise<Object>} Simulated execution output
   */
  async _simulateExecution(run, routine, agentId) {
    this._logger.debug(`[RoutineScheduler] Simulating execution for routine ${routine.id}`);

    // Simulate work with configurable duration based on priority
    const simulationMs = routine.priority === 'critical' ? 500 : 
                         routine.priority === 'high' ? 300 : 100;
    await new Promise(resolve => setTimeout(resolve, simulationMs));

    return {
      output: {
        executedAt: new Date().toISOString(),
        agentId,
        routineName: routine.name,
        simulated: true
      }
    };
  }

  // ============================================================
  // Distributed Locking
  // ============================================================

  /**
   * Acquire a distributed lock for a run
   * @private
   * @async
   * @param {string} runId - Run ID
   * @returns {Promise<Object|null>} Run record if lock acquired, null otherwise
   */
  async _acquireRunLock(runId) {
    const run = this._db.prepare('SELECT * FROM routine_runs WHERE id = ?').get(runId);
    if (!run) return null;

    const expiresAt = new Date(Date.now() + this._config.lockTimeoutMs);

    try {
      this._db.prepare(`
        INSERT INTO routine_scheduler_locks (
          routine_id, trigger_id, locked_by, expires_at, run_id
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        run.routine_id,
        run.trigger_id,
        this._config.instanceId,
        expiresAt.toISOString(),
        runId
      );

      return run;
    } catch (error) {
      // Lock already exists
      this._logger.debug(`[RoutineScheduler] Could not acquire lock for run ${runId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Release a run lock
   * @private
   * @param {string} runId - Run ID
   */
  _releaseRunLock(runId) {
    this._db.prepare(`
      DELETE FROM routine_scheduler_locks WHERE run_id = ?
    `).run(runId);
  }

  /**
   * Release all locks held by this instance
   * @private
   */
  _releaseInstanceLocks() {
    const result = this._db.prepare(`
      DELETE FROM routine_scheduler_locks WHERE locked_by = ?
    `).run(this._config.instanceId);

    if (result.changes > 0) {
      this._logger.info(`[RoutineScheduler] Released ${result.changes} locks`);
    }
  }

  /**
   * Clean up expired locks
   * @private
   */
  _cleanupExpiredLocks() {
    const result = this._db.prepare(`
      DELETE FROM routine_scheduler_locks WHERE expires_at < CURRENT_TIMESTAMP
    `).run();

    if (result.changes > 0) {
      this._logger.debug(`[RoutineScheduler] Cleaned up ${result.changes} expired locks`);
    }
  }

  // ============================================================
  // Polling
  // ============================================================

  /**
   * Start polling for due routines
   * @private
   */
  _startPolling() {
    this._pollTimer = setInterval(() => {
      this._pollDueRoutines();
    }, this._config.pollIntervalMs);

    if (typeof this._pollTimer.unref === 'function') {
      this._pollTimer.unref();
    }
  }

  /**
   * Start lock cleanup timer
   * @private
   */
  _startLockCleanup() {
    this._cleanupTimer = setInterval(() => {
      this._cleanupExpiredLocks();
    }, 60000); // Clean up every minute

    if (typeof this._cleanupTimer.unref === 'function') {
      this._cleanupTimer.unref();
    }
  }

  /**
   * Poll for routines that need to run
   * @private
   * @async
   */
  async _pollDueRoutines() {
    if (this._shutdownRequested) return;

    try {
      // Update next_run_at for cron triggers
      this._updateCronNextRuns();

      // Find triggers that are due
      const dueTriggers = this._db.prepare(`
        SELECT rt.*, r.id as routine_id, r.company_id, r.concurrency_policy
        FROM routine_triggers rt
        JOIN routines r ON rt.routine_id = r.id
        WHERE rt.enabled = 1 
          AND r.status = ?
          AND rt.next_run_at <= CURRENT_TIMESTAMP
          AND rt.kind = ?
      `).all(RoutineStatus.ACTIVE, TriggerKind.CRON);

      for (const trigger of dueTriggers) {
        await this._createRunFromTrigger(trigger, RunSource.CRON);
      }

      // Process pending runs
      await this._processPendingRuns();

    } catch (error) {
      this._logger.error('[RoutineScheduler] Error in poll cycle:', error);
    }
  }

  /**
   * Update next_run_at for cron triggers
   * @private
   */
  _updateCronNextRuns() {
    const triggers = this._db.prepare(`
      SELECT id, cron_expression, timezone 
      FROM routine_triggers 
      WHERE kind = ? AND enabled = 1
    `).all(TriggerKind.CRON);

    for (const trigger of triggers) {
      try {
        const nextRun = this._calculateNextRun(trigger.cron_expression, trigger.timezone);
        this._db.prepare(`
          UPDATE routine_triggers SET next_run_at = ? WHERE id = ?
        `).run(nextRun.toISOString(), trigger.id);
      } catch (error) {
        this._logger.warn(`[RoutineScheduler] Failed to calculate next run for trigger ${trigger.id}`);
      }
    }
  }

  /**
   * Process pending runs
   * @private
   * @async
   */
  async _processPendingRuns() {
    const pendingRuns = await this._routineService.getPendingRuns(this._config.maxConcurrentRuns);

    for (const run of pendingRuns) {
      if (this._executingRuns.size >= this._config.maxConcurrentRuns) {
        break;
      }

      // Don't await - let runs execute concurrently
      this.executeRun(run.id).catch(error => {
        this._logger.error(`[RoutineScheduler] Unexpected error executing run ${run.id}:`, error);
      });
    }
  }

  /**
   * Handle cron trigger firing
   * @private
   * @async
   * @param {Object} trigger - Trigger configuration
   */
  async _triggerCronRun(trigger) {
    if (this._shutdownRequested) return;

    const triggerRecord = this._db.prepare(`
      SELECT rt.*, r.concurrency_policy, r.status as routine_status
      FROM routine_triggers rt
      JOIN routines r ON rt.routine_id = r.id
      WHERE rt.id = ? AND rt.enabled = 1
    `).get(trigger.id);

    if (!triggerRecord || triggerRecord.routine_status !== RoutineStatus.ACTIVE) {
      return;
    }

    await this._createRunFromTrigger(triggerRecord, RunSource.CRON);
  }

  /**
   * Create a run from a trigger
   * @private
   * @async
   * @param {Object} trigger - Trigger record
   * @param {RunSource} source - Run source
   */
  async _createRunFromTrigger(trigger, source) {
    // Check idempotency - prevent duplicate runs within 1 minute for same trigger
    const recentRun = this._db.prepare(`
      SELECT id FROM routine_runs 
      WHERE trigger_id = ? AND source = ? 
        AND triggered_at > datetime('now', '-1 minute')
      LIMIT 1
    `).get(trigger.id, source);

    if (recentRun) {
      this._logger.debug(`[RoutineScheduler] Skipping duplicate run for trigger ${trigger.id}`);
      return;
    }

    // Create run record
    const runStmt = this._db.prepare(`
      INSERT INTO routine_runs (
        company_id, routine_id, trigger_id, source, status, priority
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const priority = this._db.prepare('SELECT priority FROM routines WHERE id = ?')
      .get(trigger.routine_id)?.priority || 'medium';

    runStmt.run(
      trigger.company_id,
      trigger.routine_id,
      trigger.id,
      source,
      RunStatus.PENDING,
      priority
    );

    // Update trigger
    this._db.prepare(`
      UPDATE routine_triggers SET last_fired_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(trigger.id);

    // Update routine
    this._db.prepare(`
      UPDATE routines SET last_triggered_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(trigger.routine_id);

    this._logger.debug(`[RoutineScheduler] Created run from trigger ${trigger.id}`);
  }

  // ============================================================
  // Utilities
  // ============================================================

  /**
   * Calculate next run time from cron expression
   * @private
   * @param {string} expression - Cron expression
   * @param {string} timezone - Timezone
   * @returns {Date} Next run date
   */
  _calculateNextRun(expression, timezone = 'UTC') {
    // Get current date
    const now = new Date();
    
    // Simple calculation for common patterns
    // In production, use a proper cron parser like cron-parser
    const parts = expression.split(' ');
    
    if (parts.length === 5) {
      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
      
      const next = new Date(now);
      next.setSeconds(0, 0);
      
      if (minute !== '*') {
        next.setMinutes(parseInt(minute));
        if (next <= now) {
          next.setHours(next.getHours() + 1);
        }
      } else {
        next.setMinutes(now.getMinutes() + 1);
      }
      
      return next;
    }
    
    // Fallback: next minute
    return new Date(now.getTime() + 60000);
  }

  /**
   * Wait for executing runs to complete
   * @private
   * @async
   * @param {number} timeoutMs - Maximum wait time
   * @returns {Promise<void>}
   */
  async _waitForExecutingRuns(timeoutMs) {
    const startTime = Date.now();
    
    while (this._executingRuns.size > 0) {
      if (Date.now() - startTime > timeoutMs) {
        this._logger.warn(`[RoutineScheduler] Timeout waiting for ${this._executingRuns.size} runs`);
        break;
      }
      
      await Promise.allSettled(Array.from(this._executingRuns.values()));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Health check for heartbeat service
   * @private
   * @returns {Object} Health status
   */
  _healthCheck() {
    return {
      healthy: this._isRunning,
      details: {
        activeCronTasks: this._cronTasks.size,
        executingRuns: this._executingRuns.size,
        instanceId: this._config.instanceId
      }
    };
  }
}

export default RoutineScheduler;
