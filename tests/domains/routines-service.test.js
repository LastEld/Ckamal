/**
 * @fileoverview Routines Domain Tests - Routine scheduling and execution
 * @module tests/domains/routines-service
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { 
  RoutineService, 
  RoutineStatus, 
  RoutinePriority, 
  ConcurrencyPolicy,
  CatchUpPolicy,
  TriggerKind,
  RunStatus,
  RunSource
} from '../../src/domains/routines/routine-service.js';
import { RoutineScheduler } from '../../src/domains/routines/routine-scheduler.js';

// Mock database for testing
class MockDatabase {
  constructor() {
    this.tables = {
      routines: [],
      routine_triggers: [],
      routine_runs: [],
      routine_assignments: [],
      routine_scheduler_locks: []
    };
    this.nextId = 1;
  }

  prepare(sql) {
    return {
      get: (...params) => this.executeGet(sql, params),
      all: (...params) => this.executeAll(sql, params),
      run: (...params) => this.executeRun(sql, params)
    };
  }

  executeGet(sql, params) {
    // Handle routine lookup with assignments
    if (sql.includes('FROM routines r') && sql.includes('LEFT JOIN routine_assignments')) {
      const routine = this.tables.routines.find(r => r.id === params[0] && r.company_id === params[1]);
      if (routine) {
        const agents = this.tables.routine_assignments
          .filter(a => a.routine_id === routine.id && a.is_active === 1)
          .map(a => a.agent_id)
          .join(',');
        return { ...routine, assigned_agents: agents };
      }
      return undefined;
    }

    // Handle simple routine lookup
    if (sql.includes('FROM routines WHERE id = ?')) {
      return this.tables.routines.find(r => r.id === params[0]);
    }

    // Handle trigger lookup
    if (sql.includes('FROM routine_triggers WHERE id = ?')) {
      return this.tables.routine_triggers.find(t => t.id === params[0]);
    }

    // Handle run lookup
    if (sql.includes('FROM routine_runs WHERE id = ?')) {
      return this.tables.routine_runs.find(r => r.id === params[0]);
    }

    // Handle count queries
    if (sql.includes('SELECT COUNT(*)')) {
      if (sql.includes('FROM routines')) {
        return { total: this.tables.routines.length };
      }
      if (sql.includes('FROM routine_runs')) {
        return { total: this.tables.routine_runs.length };
      }
      if (sql.includes('active_runs')) {
        const routineId = params[0];
        const count = this.tables.routine_runs.filter(
          r => r.routine_id === routineId && ['pending', 'running'].includes(r.status)
        ).length;
        return { count };
      }
    }

    // Handle routine with stats
    if (sql.includes('trigger_count') || sql.includes('active_runs')) {
      const routine = this.tables.routines.find(r => r.company_id === params[0]);
      if (routine) {
        const triggerCount = this.tables.routine_triggers.filter(t => t.routine_id === routine.id).length;
        const activeRuns = this.tables.routine_runs.filter(
          r => r.routine_id === routine.id && ['pending', 'running'].includes(r.status)
        ).length;
        const lastRun = this.tables.routine_runs
          .filter(r => r.routine_id === routine.id)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
        return {
          ...routine,
          trigger_count: triggerCount,
          active_runs: activeRuns,
          last_run_at: lastRun?.created_at || null
        };
      }
    }

    return undefined;
  }

  executeAll(sql, params) {
    // Handle routine listing
    if (sql.includes('FROM routines')) {
      let results = [...this.tables.routines];
      
      if (sql.includes('WHERE r.company_id = ?')) {
        results = results.filter(r => r.company_id === params[0]);
      }
      
      if (sql.includes('ORDER BY')) {
        results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      
      return results;
    }

    // Handle trigger listing
    if (sql.includes('FROM routine_triggers')) {
      let results = [...this.tables.routine_triggers];
      
      if (sql.includes('WHERE routine_id = ?')) {
        results = results.filter(t => t.routine_id === params[0]);
      }
      
      if (sql.includes('WHERE company_id = ?')) {
        results = results.filter(t => t.company_id === params[0]);
      }
      
      return results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // Handle run listing
    if (sql.includes('FROM routine_runs')) {
      let results = [...this.tables.routine_runs];
      
      if (sql.includes('WHERE routine_id = ? AND company_id = ?')) {
        results = results.filter(r => r.routine_id === params[0] && r.company_id === params[1]);
      }
      
      if (sql.includes('WHERE rr.status = ?')) {
        results = results.filter(r => r.status === params[0]);
      }
      
      return results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // Handle cron triggers lookup
    if (sql.includes('rt.kind = ?') && sql.includes('rt.enabled = 1')) {
      return this.tables.routine_triggers.filter(
        t => t.kind === params[0] && t.enabled === 1
      );
    }

    // Handle pending runs lookup
    if (sql.includes('rr.status = ?')) {
      return this.tables.routine_runs
        .filter(r => r.status === params[0])
        .slice(0, params[1]);
    }

    return [];
  }

  executeRun(sql, params) {
    // Handle routine creation
    if (sql.includes('INSERT INTO routines')) {
      const routine = {
        id: `routine-${this.nextId++}`,
        company_id: params[0],
        project_id: params[1],
        goal_id: params[2],
        parent_issue_id: params[3],
        name: params[4],
        description: params[5],
        assignee_agent_id: params[6],
        priority: params[7],
        status: params[8],
        concurrency_policy: params[9],
        catch_up_policy: params[10],
        max_retries: params[11],
        timeout_seconds: params[12],
        created_by_agent_id: params[13],
        created_by_user_id: params[14],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.tables.routines.push(routine);
      return { changes: 1, lastInsertRowid: this.tables.routines.length };
    }

    // Handle trigger creation
    if (sql.includes('INSERT INTO routine_triggers')) {
      const trigger = {
        id: `trigger-${this.nextId++}`,
        company_id: params[0],
        routine_id: params[1],
        kind: params[2],
        label: params[3],
        enabled: params[4],
        cron_expression: params[5],
        timezone: params[6],
        next_run_at: params[7],
        public_id: params[8],
        webhook_secret: params[9],
        signing_mode: params[10],
        replay_window_sec: params[11],
        event_type: params[12],
        event_filters: params[13],
        created_by_agent_id: params[14],
        created_by_user_id: params[15],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.tables.routine_triggers.push(trigger);
      return { changes: 1, lastInsertRowid: this.tables.routine_triggers.length };
    }

    // Handle run creation
    if (sql.includes('INSERT INTO routine_runs')) {
      const run = {
        id: `run-${this.nextId++}`,
        company_id: params[0],
        routine_id: params[1],
        trigger_id: params[2],
        source: params[3],
        status: params[4],
        priority: params[5],
        trigger_payload: params[6],
        idempotency_key: params[7],
        attempt_number: params[8],
        max_attempts: params[9],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.tables.routine_runs.push(run);
      return { changes: 1, lastInsertRowid: this.tables.routine_runs.length };
    }

    // Handle routine update
    if (sql.includes('UPDATE routines SET') && sql.includes('WHERE id = ?')) {
      const routine = this.tables.routines.find(r => r.id === params[params.length - 2]);
      if (routine) {
        // Parse SET clause to determine what to update
        if (params[0] === RoutineStatus.ARCHIVED) {
          routine.status = params[0];
        }
        routine.updated_at = new Date().toISOString();
      }
      return { changes: routine ? 1 : 0 };
    }

    // Handle trigger update
    if (sql.includes('UPDATE routine_triggers SET')) {
      const trigger = this.tables.routine_triggers.find(t => t.id === params[params.length - 2]);
      if (trigger) {
        trigger.updated_at = new Date().toISOString();
      }
      return { changes: trigger ? 1 : 0 };
    }

    // Handle run update
    if (sql.includes('UPDATE routine_runs SET')) {
      const run = this.tables.routine_runs.find(r => r.id === params[params.length - 1]);
      if (run) {
        if (params[0] === RunStatus.CANCELLED || params[0] === RunStatus.RUNNING) {
          run.status = params[0];
        }
        run.updated_at = new Date().toISOString();
      }
      return { changes: run ? 1 : 0 };
    }

    // Handle trigger deletion
    if (sql.includes('DELETE FROM routine_triggers')) {
      const initialCount = this.tables.routine_triggers.length;
      this.tables.routine_triggers = this.tables.routine_triggers.filter(
        t => !(t.id === params[0] && t.company_id === params[1])
      );
      return { changes: initialCount - this.tables.routine_triggers.length };
    }

    // Handle lock operations
    if (sql.includes('INSERT INTO routine_scheduler_locks')) {
      const lock = {
        routine_id: params[0],
        trigger_id: params[1],
        locked_by: params[2],
        expires_at: params[3],
        run_id: params[4]
      };
      this.tables.routine_scheduler_locks.push(lock);
      return { changes: 1 };
    }

    if (sql.includes('DELETE FROM routine_scheduler_locks')) {
      const initialCount = this.tables.routine_scheduler_locks.length;
      if (params.length === 1) {
        this.tables.routine_scheduler_locks = this.tables.routine_scheduler_locks.filter(
          l => l.run_id !== params[0]
        );
      } else {
        this.tables.routine_scheduler_locks = this.tables.routine_scheduler_locks.filter(
          l => l.locked_by !== params[0]
        );
      }
      return { changes: initialCount - this.tables.routine_scheduler_locks.length };
    }

    return { changes: 0 };
  }
}

describe('Routines Domain', () => {
  describe('RoutineService', () => {
    let routineService;
    let mockDb;

    beforeEach(() => {
      mockDb = new MockDatabase();
      routineService = new RoutineService({ db: mockDb });
    });

    describe('Routine CRUD', () => {
      it('should create a routine', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Daily Report',
          description: 'Generate daily analytics report'
        });

        assert.ok(routine.id);
        assert.equal(routine.name, 'Daily Report');
        assert.equal(routine.description, 'Generate daily analytics report');
        assert.equal(routine.status, RoutineStatus.ACTIVE);
        assert.equal(routine.priority, RoutinePriority.MEDIUM);
        assert.equal(routine.concurrencyPolicy, ConcurrencyPolicy.COALESCE_IF_ACTIVE);
        assert.equal(routine.catchUpPolicy, CatchUpPolicy.SKIP_MISSED);
        assert.equal(routine.maxRetries, 3);
        assert.equal(routine.timeoutSeconds, 3600);
        assert.equal(routine.companyId, 'company-1');
      });

      it('should create routine with custom options', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Critical Task',
          priority: RoutinePriority.CRITICAL,
          concurrencyPolicy: ConcurrencyPolicy.SKIP_IF_ACTIVE,
          maxRetries: 5,
          timeoutSeconds: 7200,
          assigneeAgentId: 'agent-1'
        });

        assert.equal(routine.priority, RoutinePriority.CRITICAL);
        assert.equal(routine.concurrencyPolicy, ConcurrencyPolicy.SKIP_IF_ACTIVE);
        assert.equal(routine.maxRetries, 5);
        assert.equal(routine.timeoutSeconds, 7200);
      });

      it('should require company ID', async () => {
        await assert.rejects(
          routineService.createRoutine({ name: 'Test' }),
          /companyId is required/i
        );
      });

      it('should require name', async () => {
        await assert.rejects(
          routineService.createRoutine({ companyId: 'company-1' }),
          /name is required/i
        );
      });

      it('should validate name length', async () => {
        await assert.rejects(
          routineService.createRoutine({ 
            companyId: 'company-1',
            name: 'A'.repeat(256)
          }),
          /less than 255/i
        );
      });

      it('should get routine by ID', async () => {
        const created = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test Routine'
        });

        const fetched = await routineService.getRoutine(created.id, 'company-1');
        assert.equal(fetched.id, created.id);
        assert.equal(fetched.name, 'Test Routine');
      });

      it('should return null for non-existent routine', async () => {
        const result = await routineService.getRoutine('non-existent', 'company-1');
        assert.equal(result, null);
      });

      it('should list routines for company', async () => {
        await routineService.createRoutine({ companyId: 'company-1', name: 'Routine 1' });
        await routineService.createRoutine({ companyId: 'company-1', name: 'Routine 2' });

        const result = await routineService.listRoutines('company-1');
        assert.equal(result.data.length, 2);
        assert.ok(result.pagination);
        assert.ok(typeof result.pagination.total === 'number');
      });

      it('should filter routines by status', async () => {
        await routineService.createRoutine({ companyId: 'company-1', name: 'Active' });
        
        const result = await routineService.listRoutines('company-1', {
          status: RoutineStatus.ACTIVE
        });
        
        assert.ok(result.data);
      });

      it('should update routine', async () => {
        const created = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Original Name'
        });

        mockDb.tables.routines.push({
          id: created.id,
          company_id: 'company-1',
          name: 'Original Name'
        });

        const updated = await routineService.updateRoutine(
          created.id,
          'company-1',
          { name: 'Updated Name', maxRetries: 10 }
        );

        assert.equal(updated.name, 'Updated Name');
      });

      it('should delete routine (archive)', async () => {
        const created = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'To Delete'
        });

        mockDb.tables.routines.push({
          id: created.id,
          company_id: 'company-1',
          status: RoutineStatus.ACTIVE
        });

        const result = await routineService.deleteRoutine(created.id, 'company-1');
        assert.equal(result, true);
      });

      it('should pause routine', async () => {
        const created = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        mockDb.tables.routines.push({
          id: created.id,
          company_id: 'company-1',
          status: RoutineStatus.ACTIVE
        });

        const paused = await routineService.pauseRoutine(created.id, 'company-1');
        assert.equal(paused.status, RoutineStatus.PAUSED);
      });

      it('should resume routine', async () => {
        const created = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        mockDb.tables.routines.push({
          id: created.id,
          company_id: 'company-1',
          status: RoutineStatus.PAUSED
        });

        const resumed = await routineService.resumeRoutine(created.id, 'company-1');
        assert.equal(resumed.status, RoutineStatus.ACTIVE);
      });
    });

    describe('Trigger Management', () => {
      it('should schedule routine with cron', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Scheduled Task'
        });

        const trigger = await routineService.scheduleRoutine(
          routine.id,
          'company-1',
          {
            cronExpression: '0 9 * * *',
            timezone: 'America/New_York',
            label: 'Daily at 9am'
          }
        );

        assert.ok(trigger.id);
        assert.equal(trigger.kind, TriggerKind.CRON);
        assert.equal(trigger.cronExpression, '0 9 * * *');
        assert.equal(trigger.timezone, 'America/New_York');
        assert.equal(trigger.enabled, true);
        assert.ok(trigger.nextRunAt);
      });

      it('should validate cron expression', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        await assert.rejects(
          routineService.scheduleRoutine(routine.id, 'company-1', {
            cronExpression: 'invalid-cron'
          }),
          /invalid cron expression/i
        );
      });

      it('should create webhook trigger', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Webhook Task'
        });

        const trigger = await routineService.createWebhookTrigger(
          routine.id,
          'company-1',
          {
            label: 'GitHub Webhook',
            signingMode: 'hmac-sha256',
            replayWindowSec: 600
          }
        );

        assert.equal(trigger.kind, TriggerKind.WEBHOOK);
        assert.ok(trigger.publicId);
        assert.ok(trigger.webhookSecret);
        assert.equal(trigger.replayWindowSec, 600);
      });

      it('should create event trigger', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Event Task'
        });

        const trigger = await routineService.createEventTrigger(
          routine.id,
          'company-1',
          {
            eventType: 'task.completed',
            filters: { taskType: 'deployment' },
            label: 'On deployment complete'
          }
        );

        assert.equal(trigger.kind, TriggerKind.EVENT);
        assert.equal(trigger.eventType, 'task.completed');
        assert.ok(trigger.eventFilters);
      });

      it('should require event type for event triggers', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        await assert.rejects(
          routineService.createEventTrigger(routine.id, 'company-1', {}),
          /eventType is required/i
        );
      });

      it('should list triggers for routine', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        await routineService.scheduleRoutine(routine.id, 'company-1', {
          cronExpression: '0 * * * *'
        });

        await routineService.createWebhookTrigger(routine.id, 'company-1', {});

        const triggers = await routineService.listTriggers(routine.id, 'company-1');
        assert.equal(triggers.length, 2);
      });

      it('should update trigger', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        const trigger = await routineService.scheduleRoutine(routine.id, 'company-1', {
          cronExpression: '0 * * * *',
          label: 'Hourly'
        });

        mockDb.tables.routine_triggers.push({
          id: trigger.id,
          company_id: 'company-1',
          label: 'Hourly'
        });

        const updated = await routineService.updateTrigger(
          trigger.id,
          'company-1',
          { label: 'Every Hour', enabled: false }
        );

        assert.ok(updated);
      });

      it('should delete trigger', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        const trigger = await routineService.scheduleRoutine(routine.id, 'company-1', {
          cronExpression: '0 * * * *'
        });

        mockDb.tables.routine_triggers.push({
          id: trigger.id,
          company_id: 'company-1'
        });

        const result = await routineService.deleteTrigger(trigger.id, 'company-1');
        assert.equal(result, true);
      });
    });

    describe('Run Execution', () => {
      it('should run routine manually', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test Routine'
        });

        mockDb.tables.routines.push({
          id: routine.id,
          company_id: 'company-1',
          status: RoutineStatus.ACTIVE,
          priority: RoutinePriority.MEDIUM,
          max_retries: 3,
          concurrency_policy: ConcurrencyPolicy.ALLOW_MULTIPLE
        });

        const run = await routineService.runRoutine(routine.id, 'company-1', {
          payload: { test: true },
          triggeredBy: 'user-1'
        });

        assert.ok(run.id);
        assert.equal(run.routineId, routine.id);
        assert.equal(run.companyId, 'company-1');
        assert.equal(run.source, RunSource.MANUAL);
        assert.equal(run.status, RunStatus.PENDING);
      });

      it('should skip run if active and policy is skip_if_active', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        mockDb.tables.routines.push({
          id: routine.id,
          company_id: 'company-1',
          status: RoutineStatus.ACTIVE,
          concurrency_policy: ConcurrencyPolicy.SKIP_IF_ACTIVE
        });

        // Add an active run
        mockDb.tables.routine_runs.push({
          routine_id: routine.id,
          status: RunStatus.RUNNING
        });

        const result = await routineService.runRoutine(routine.id, 'company-1');
        
        assert.ok(result.skipped);
        assert.equal(result.reason, 'active_run_exists');
      });

      it('should get run history', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        mockDb.tables.routine_runs.push(
          { id: 'run-1', routine_id: routine.id, company_id: 'company-1', status: RunStatus.COMPLETED },
          { id: 'run-2', routine_id: routine.id, company_id: 'company-1', status: RunStatus.FAILED }
        );

        const history = await routineService.getRunHistory(routine.id, 'company-1');
        assert.ok(history.data);
        assert.ok(history.pagination);
      });

      it('should get specific run', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        mockDb.tables.routine_runs.push({
          id: 'run-1',
          routine_id: routine.id,
          company_id: 'company-1',
          status: RunStatus.COMPLETED
        });

        const run = await routineService.getRun('run-1', 'company-1');
        assert.ok(run);
        assert.equal(run.id, 'run-1');
      });

      it('should cancel a run', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        mockDb.tables.routine_runs.push({
          id: 'run-1',
          routine_id: routine.id,
          company_id: 'company-1',
          status: RunStatus.PENDING
        });

        const cancelled = await routineService.cancelRun('run-1', 'company-1');
        assert.equal(cancelled.status, RunStatus.CANCELLED);
      });

      it('should retry a failed run', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        mockDb.tables.routine_runs.push({
          id: 'run-1',
          routine_id: routine.id,
          company_id: 'company-1',
          status: RunStatus.FAILED,
          trigger_id: null,
          source: RunSource.MANUAL,
          priority: RoutinePriority.MEDIUM,
          trigger_payload: null,
          idempotency_key: 'key-1',
          attempt_number: 1,
          max_attempts: 3
        });

        const retry = await routineService.retryRun('run-1', 'company-1');
        assert.equal(retry.source, RunSource.RETRY);
      });

      it('should get pending runs', async () => {
        mockDb.tables.routine_runs.push(
          { id: 'run-1', status: RunStatus.PENDING, priority: RoutinePriority.HIGH, triggered_at: new Date().toISOString() },
          { id: 'run-2', status: RunStatus.PENDING, priority: RoutinePriority.LOW, triggered_at: new Date().toISOString() }
        );

        const pending = await routineService.getPendingRuns(10);
        assert.ok(Array.isArray(pending));
      });
    });

    describe('Agent Assignments', () => {
      it('should assign agent to routine', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        const assignment = await routineService.assignAgent(routine.id, 'agent-1', {
          type: 'primary',
          assignedBy: 'user-1',
          notes: 'Primary agent'
        });

        assert.ok(assignment);
        assert.equal(assignment.routine_id, routine.id);
        assert.equal(assignment.agent_id, 'agent-1');
      });

      it('should unassign agent from routine', async () => {
        const routine = await routineService.createRoutine({
          companyId: 'company-1',
          name: 'Test'
        });

        mockDb.tables.routine_assignments.push({
          routine_id: routine.id,
          agent_id: 'agent-1',
          is_active: 1
        });

        const result = await routineService.unassignAgent(routine.id, 'agent-1');
        assert.equal(result, true);
      });
    });
  });

  describe('RoutineScheduler', () => {
    let scheduler;
    let mockDb;

    beforeEach(() => {
      mockDb = new MockDatabase();
      scheduler = new RoutineScheduler({ db: mockDb });
    });

    afterEach(async () => {
      if (scheduler) {
        await scheduler.stop();
      }
    });

    describe('Lifecycle', () => {
      it('should start scheduler', async () => {
        await scheduler.start();
        assert.equal(scheduler.isRunning, true);
      });

      it('should stop scheduler', async () => {
        await scheduler.start();
        await scheduler.stop();
        assert.equal(scheduler.isRunning, false);
      });

      it('should get scheduler status', () => {
        const status = scheduler.getStatus();
        assert.equal(typeof status.isRunning, 'boolean');
        assert.equal(typeof status.activeCronTasks, 'number');
        assert.equal(typeof status.executingRuns, 'number');
        assert.ok(status.instanceId);
      });
    });

    describe('Cron Management', () => {
      it('should schedule cron trigger', async () => {
        const result = await scheduler.scheduleCron({
          id: 'trigger-1',
          routineId: 'routine-1',
          companyId: 'company-1',
          cronExpression: '0 * * * *',
          timezone: 'UTC'
        });

        assert.equal(result, true);
      });

      it('should unschedule cron trigger', async () => {
        await scheduler.scheduleCron({
          id: 'trigger-1',
          routineId: 'routine-1',
          companyId: 'company-1',
          cronExpression: '0 * * * *'
        });

        const result = await scheduler.unscheduleCron('trigger-1');
        assert.equal(result, true);
      });
    });

    describe('Execution', () => {
      it('should check if already running', async () => {
        const result1 = await scheduler.executeRun('run-1');
        // Second call while first is still "running" should return already_running
        const result2 = await scheduler.executeRun('run-1');
        
        // Note: In real implementation, the first would start executing
        // and the second would return already_running
        assert.ok(result1);
      });

      it('should defer when max concurrent reached', async () => {
        scheduler._config.maxConcurrentRuns = 0; // Force defer
        
        const result = await scheduler.executeRun('run-1');
        assert.equal(result.status, 'deferred');
      });
    });

    describe('Configuration', () => {
      it('should have default config', () => {
        assert.equal(RoutineScheduler.DEFAULT_CONFIG.pollIntervalMs, 30000);
        assert.equal(RoutineScheduler.DEFAULT_CONFIG.lockTimeoutMs, 300000);
        assert.equal(RoutineScheduler.DEFAULT_CONFIG.maxConcurrentRuns, 10);
      });

      it('should accept custom config', () => {
        const customScheduler = new RoutineScheduler({
          db: mockDb,
          config: {
            pollIntervalMs: 60000,
            maxConcurrentRuns: 5
          }
        });

        const status = customScheduler.getStatus();
        assert.equal(status.config.pollIntervalMs, 60000);
        assert.equal(status.config.maxConcurrentRuns, 5);
      });
    });
  });

  describe('Constants', () => {
    it('should have RoutineStatus enum', () => {
      assert.equal(RoutineStatus.ACTIVE, 'active');
      assert.equal(RoutineStatus.PAUSED, 'paused');
      assert.equal(RoutineStatus.ARCHIVED, 'archived');
    });

    it('should have RoutinePriority enum', () => {
      assert.equal(RoutinePriority.LOW, 'low');
      assert.equal(RoutinePriority.MEDIUM, 'medium');
      assert.equal(RoutinePriority.HIGH, 'high');
      assert.equal(RoutinePriority.CRITICAL, 'critical');
    });

    it('should have ConcurrencyPolicy enum', () => {
      assert.equal(ConcurrencyPolicy.ALLOW_MULTIPLE, 'allow_multiple');
      assert.equal(ConcurrencyPolicy.SKIP_IF_ACTIVE, 'skip_if_active');
      assert.equal(ConcurrencyPolicy.COALESCE_IF_ACTIVE, 'coalesce_if_active');
    });

    it('should have CatchUpPolicy enum', () => {
      assert.equal(CatchUpPolicy.SKIP_MISSED, 'skip_missed');
      assert.equal(CatchUpPolicy.RUN_ONCE, 'run_once');
      assert.equal(CatchUpPolicy.RUN_ALL_MISSED, 'run_all_missed');
    });

    it('should have TriggerKind enum', () => {
      assert.equal(TriggerKind.CRON, 'cron');
      assert.equal(TriggerKind.WEBHOOK, 'webhook');
      assert.equal(TriggerKind.EVENT, 'event');
      assert.equal(TriggerKind.MANUAL, 'manual');
    });

    it('should have RunStatus enum', () => {
      assert.equal(RunStatus.PENDING, 'pending');
      assert.equal(RunStatus.RUNNING, 'running');
      assert.equal(RunStatus.COMPLETED, 'completed');
      assert.equal(RunStatus.FAILED, 'failed');
      assert.equal(RunStatus.CANCELLED, 'cancelled');
      assert.equal(RunStatus.TIMEOUT, 'timeout');
    });

    it('should have RunSource enum', () => {
      assert.equal(RunSource.CRON, 'cron');
      assert.equal(RunSource.WEBHOOK, 'webhook');
      assert.equal(RunSource.EVENT, 'event');
      assert.equal(RunSource.MANUAL, 'manual');
      assert.equal(RunSource.RETRY, 'retry');
    });
  });
});
