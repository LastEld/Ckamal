/**
 * @fileoverview Unit tests for Scheduler
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler, ScheduleStatus } from '../../../src/queue/scheduler.js';

describe('Scheduler', () => {
  let scheduler;

  beforeEach(() => {
    scheduler = new Scheduler();
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('schedule', () => {
    it('should schedule a one-time task', () => {
      const futureTime = new Date(Date.now() + 10000);
      const task = scheduler.schedule(
        { id: 't1', execute: async () => 'done' },
        futureTime
      );
      
      assert.equal(task.type, 'once');
      assert.equal(task.status, ScheduleStatus.SCHEDULED);
      assert.ok(task.scheduledTime > Date.now());
    });

    it('should throw for past time', () => {
      assert.throws(() => {
        scheduler.schedule(
          { id: 't1', execute: async () => 'done' },
          new Date(Date.now() - 1000)
        );
      }, /future/);
    });

    it('should auto-generate task id', () => {
      const task = scheduler.schedule(
        { execute: async () => 'done' },
        new Date(Date.now() + 10000)
      );
      
      assert.ok(task.id.startsWith('sched_'));
    });
  });

  describe('scheduleAfter', () => {
    it('should schedule delayed task', () => {
      const task = scheduler.scheduleAfter(
        { id: 't1', execute: async () => 'done' },
        1000
      );
      
      assert.equal(task.type, 'delay');
      assert.equal(task.delay, 1000);
      assert.ok(task.scheduledTime > Date.now());
    });

    it('should throw for negative delay', () => {
      assert.throws(() => {
        scheduler.scheduleAfter(
          { id: 't1', execute: async () => 'done' },
          -100
        );
      }, /non-negative/);
    });
  });

  describe('scheduleRecurring', () => {
    it('should schedule recurring task with cron', () => {
      const task = scheduler.scheduleRecurring(
        { id: 't1', execute: async () => 'done' },
        '0 9 * * 1' // Mondays at 9am
      );
      
      assert.equal(task.type, 'cron');
      assert.equal(task.cron, '0 9 * * 1');
    });

    it('should throw for invalid cron', () => {
      assert.throws(() => {
        scheduler.scheduleRecurring(
          { id: 't1', execute: async () => 'done' },
          'invalid cron'
        );
      }, /Invalid cron/);
    });
  });

  describe('scheduleWithDeps', () => {
    it('should schedule task with dependencies', () => {
      const task = scheduler.scheduleWithDeps(
        { id: 't3', execute: async () => 'done' },
        ['dep1', 'dep2']
      );
      
      assert.equal(task.type, 'dependency');
      assert.deepEqual(task.dependencies, ['dep1', 'dep2']);
      assert.deepEqual(task.metadata.waitingFor, ['dep1', 'dep2']);
    });

    it('should throw for empty dependencies', () => {
      assert.throws(() => {
        scheduler.scheduleWithDeps(
          { id: 't1', execute: async () => 'done' },
          []
        );
      }, /non-empty/);
    });
  });

  describe('cancel', () => {
    it('should cancel scheduled task', () => {
      const task = scheduler.scheduleAfter(
        { id: 't1', execute: async () => 'done' },
        10000
      );
      
      const cancelled = scheduler.cancel(task.id);
      
      assert.equal(cancelled, true);
      assert.equal(scheduler.get(task.id).status, ScheduleStatus.CANCELLED);
    });

    it('should return false for non-existent task', () => {
      const cancelled = scheduler.cancel('nonexistent');
      
      assert.equal(cancelled, false);
    });
  });

  describe('pause and resume', () => {
    it('should pause recurring task', () => {
      const task = scheduler.scheduleRecurring(
        { id: 't1', execute: async () => 'done' },
        '*/5 * * * *'
      );
      
      const paused = scheduler.pause(task.id);
      
      assert.equal(paused, true);
      assert.equal(scheduler.get(task.id).status, ScheduleStatus.PAUSED);
    });

    it('should resume paused task', () => {
      const task = scheduler.scheduleRecurring(
        { id: 't1', execute: async () => 'done' },
        '*/5 * * * *'
      );
      
      scheduler.pause(task.id);
      const resumed = scheduler.resume(task.id);
      
      assert.equal(resumed, true);
      assert.equal(scheduler.get(task.id).status, ScheduleStatus.SCHEDULED);
    });

    it('should return false for non-recurring tasks', () => {
      const task = scheduler.scheduleAfter(
        { id: 't1', execute: async () => 'done' },
        10000
      );
      
      assert.equal(scheduler.pause(task.id), false);
      assert.equal(scheduler.resume(task.id), false);
    });
  });

  describe('list', () => {
    it('should list all scheduled tasks', () => {
      scheduler.scheduleAfter({ id: 't1', execute: async () => 'done' }, 10000);
      scheduler.scheduleAfter({ id: 't2', execute: async () => 'done' }, 20000);
      
      const tasks = scheduler.list();
      
      assert.equal(tasks.length, 2);
    });

    it('should filter by status', () => {
      scheduler.scheduleAfter({ id: 't1', execute: async () => 'done' }, 10000);
      const task2 = scheduler.scheduleAfter({ id: 't2', execute: async () => 'done' }, 20000);
      scheduler.cancel(task2.id);
      
      const cancelled = scheduler.list({ status: ScheduleStatus.CANCELLED });
      
      assert.equal(cancelled.length, 1);
      assert.equal(cancelled[0].id, task2.id);
    });

    it('should filter by type', () => {
      scheduler.scheduleAfter({ id: 't1', execute: async () => 'done' }, 10000);
      scheduler.scheduleRecurring({ id: 't2', execute: async () => 'done' }, '*/5 * * * *');
      
      const cronTasks = scheduler.list({ type: 'cron' });
      
      assert.equal(cronTasks.length, 1);
      assert.equal(cronTasks[0].id, 't2');
    });
  });

  describe('get', () => {
    it('should get task by id', () => {
      scheduler.scheduleAfter({ id: 't1', execute: async () => 'done' }, 10000);
      
      const task = scheduler.get('t1');
      
      assert.equal(task.id, 't1');
    });

    it('should return null for non-existent task', () => {
      assert.equal(scheduler.get('nonexistent'), null);
    });
  });

  describe('has', () => {
    it('should check if task exists', () => {
      scheduler.scheduleAfter({ id: 't1', execute: async () => 'done' }, 10000);
      
      assert.equal(scheduler.has('t1'), true);
      assert.equal(scheduler.has('nonexistent'), false);
    });
  });

  describe('getStats', () => {
    it('should return scheduler statistics', () => {
      scheduler.scheduleAfter({ id: 't1', execute: async () => 'done' }, 10000);
      scheduler.scheduleRecurring({ id: 't2', execute: async () => 'done' }, '*/5 * * * *');
      
      const stats = scheduler.getStats();
      
      assert.equal(stats.total, 2);
      assert.equal(stats.byType.delay, 1);
      assert.equal(stats.byType.cron, 1);
    });
  });

  describe('cancelAll', () => {
    it('should cancel all tasks', () => {
      scheduler.scheduleAfter({ id: 't1', execute: async () => 'done' }, 10000);
      scheduler.scheduleAfter({ id: 't2', execute: async () => 'done' }, 20000);
      
      const count = scheduler.cancelAll();
      
      assert.equal(count, 2);
    });
  });

  describe('events', () => {
    it('should emit task:scheduled event', (t, done) => {
      scheduler.on('task:scheduled', (task) => {
        assert.equal(task.id, 't1');
        done();
      });
      
      scheduler.scheduleAfter({ id: 't1', execute: async () => 'done' }, 10000);
    });

    it('should emit task:cancelled event', (t, done) => {
      scheduler.on('task:cancelled', (task) => {
        assert.equal(task.id, 't1');
        done();
      });
      
      scheduler.scheduleAfter({ id: 't1', execute: async () => 'done' }, 10000);
      scheduler.cancel('t1');
    });
  });
});
