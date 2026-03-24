/**
 * @fileoverview Unit tests for Executor
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Executor, ExecutionMode } from '../../../src/queue/executor.js';

describe('Executor', () => {
  let executor;

  beforeEach(() => {
    executor = new Executor();
  });

  describe('run', () => {
    it('should execute a single task', async () => {
      const task = {
        id: 't1',
        execute: async () => 'result'
      };
      
      const result = await executor.run(task);
      
      assert.equal(result.success, true);
      assert.equal(result.data, 'result');
      assert.equal(result.attempts, 1);
      assert.ok(result.duration >= 0);
    });

    it('should handle task failure', async () => {
      const task = {
        id: 't1',
        execute: async () => { throw new Error('failed'); }
      };
      
      const result = await executor.run(task);
      
      assert.equal(result.success, false);
      assert.ok(result.error);
      assert.equal(result.error.message, 'failed');
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const task = {
        id: 't1',
        execute: async () => {
          attempts++;
          if (attempts < 3) throw new Error('retry');
          return 'success';
        }
      };
      
      const result = await executor.run(task, { maxRetries: 3, retryDelay: 10 });
      
      assert.equal(result.success, true);
      assert.equal(result.attempts, 3);
    });

    it('should fail after max retries', async () => {
      const task = {
        id: 't1',
        execute: async () => { throw new Error('always fails'); }
      };
      
      const result = await executor.run(task, { maxRetries: 2, retryDelay: 10 });
      
      assert.equal(result.success, false);
      assert.equal(result.attempts, 3); // initial + 2 retries
    });

    it('should timeout long-running tasks', async () => {
      const task = {
        id: 't1',
        execute: async () => {
          await new Promise(r => setTimeout(r, 1000));
          return 'done';
        }
      };
      
      const result = await executor.run(task, { timeout: 50 });
      
      assert.equal(result.success, false);
      assert.ok(result.error.message.includes('timed out'));
    });
  });

  describe('parallel', () => {
    it('should execute tasks in parallel', async () => {
      const tasks = [
        { id: 't1', execute: async () => 'r1' },
        { id: 't2', execute: async () => 'r2' },
        { id: 't3', execute: async () => 'r3' }
      ];
      
      const result = await executor.parallel(tasks);
      
      assert.equal(result.success, true);
      assert.equal(result.completed.length, 3);
      assert.equal(result.failed.length, 0);
    });

    it('should limit concurrency', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        id: `t${i}`,
        execute: async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise(r => setTimeout(r, 50));
          concurrent--;
          return i;
        }
      }));
      
      await executor.parallel(tasks, { concurrency: 2 });
      
      assert.equal(maxConcurrent, 2);
    });

    it('should report partial failures', async () => {
      const tasks = [
        { id: 't1', execute: async () => 'r1' },
        { id: 't2', execute: async () => { throw new Error('fail'); } },
        { id: 't3', execute: async () => 'r3' }
      ];
      
      const result = await executor.parallel(tasks);
      
      assert.equal(result.success, false);
      assert.equal(result.completed.length, 2);
      assert.equal(result.failed.length, 1);
    });

    it('should call progress callback', async () => {
      const progress = [];
      const tasks = [
        { id: 't1', execute: async () => 'r1' },
        { id: 't2', execute: async () => 'r2' }
      ];
      
      await executor.parallel(tasks, {
        onProgress: (completed, total) => progress.push({ completed, total })
      });
      
      assert.ok(progress.length > 0);
    });
  });

  describe('sequential', () => {
    it('should execute tasks in order', async () => {
      const order = [];
      const tasks = [
        { id: 't1', execute: async () => { order.push(1); return 'r1'; } },
        { id: 't2', execute: async () => { order.push(2); return 'r2'; } },
        { id: 't3', execute: async () => { order.push(3); return 'r3'; } }
      ];
      
      await executor.sequential(tasks);
      
      assert.deepEqual(order, [1, 2, 3]);
    });

    it('should stop on error by default', async () => {
      const order = [];
      const tasks = [
        { id: 't1', execute: async () => { order.push(1); return 'r1'; } },
        { id: 't2', execute: async () => { order.push(2); throw new Error('fail'); } },
        { id: 't3', execute: async () => { order.push(3); return 'r3'; } }
      ];
      
      await executor.sequential(tasks, { continueOnError: false });
      
      assert.deepEqual(order, [1, 2]);
    });

    it('should continue on error when configured', async () => {
      const order = [];
      const tasks = [
        { id: 't1', execute: async () => { order.push(1); return 'r1'; } },
        { id: 't2', execute: async () => { order.push(2); throw new Error('fail'); } },
        { id: 't3', execute: async () => { order.push(3); return 'r3'; } }
      ];
      
      await executor.sequential(tasks, { continueOnError: true });
      
      assert.deepEqual(order, [1, 2, 3]);
    });
  });

  describe('batched', () => {
    it('should execute tasks in batches', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `t${i}`,
        execute: async () => i
      }));
      
      const result = await executor.batched(tasks, { batchSize: 3 });
      
      assert.equal(result.success, true);
      assert.equal(result.completed.length, 10);
      assert.equal(result.stats.batches, 4);
    });
  });

  describe('race', () => {
    it('should return first completed task', async () => {
      const tasks = [
        { id: 'slow', execute: async () => { await sleep(100); return 'slow'; } },
        { id: 'fast', execute: async () => { await sleep(10); return 'fast'; } }
      ];
      
      const result = await executor.race(tasks);
      
      assert.equal(result.success, true);
      assert.equal(result.data, 'fast');
    });
  });

  describe('allSettled', () => {
    it('should wait for all tasks', async () => {
      const tasks = [
        { id: 't1', execute: async () => 'r1' },
        { id: 't2', execute: async () => { throw new Error('fail'); } },
        { id: 't3', execute: async () => 'r3' }
      ];
      
      const result = await executor.allSettled(tasks);
      
      assert.equal(result.completed.length, 2);
      assert.equal(result.failed.length, 1);
    });
  });

  describe('execute', () => {
    it('should execute with PARALLEL mode', async () => {
      const tasks = [
        { id: 't1', execute: async () => 'r1' },
        { id: 't2', execute: async () => 'r2' }
      ];
      
      const result = await executor.execute(tasks, { mode: ExecutionMode.PARALLEL });
      
      assert.equal(result.success, true);
    });

    it('should execute with SEQUENTIAL mode', async () => {
      const tasks = [
        { id: 't1', execute: async () => 'r1' },
        { id: 't2', execute: async () => 'r2' }
      ];
      
      const result = await executor.execute(tasks, { mode: ExecutionMode.SEQUENTIAL });
      
      assert.equal(result.success, true);
    });

    it('should return success for empty tasks', async () => {
      const result = await executor.execute([]);
      
      assert.equal(result.success, true);
      assert.equal(result.total, 0);
    });

    it('should throw for unknown mode', async () => {
      await assert.rejects(
        executor.execute([{ id: 't1', execute: async () => 'r1' }], { mode: 'unknown' }),
        /Unknown execution mode/
      );
    });
  });

  describe('getStats', () => {
    it('should return executor statistics', async () => {
      await executor.parallel([
        { id: 't1', execute: async () => 'done' },
        { id: 't2', execute: async () => 'done' }
      ]);
      
      const stats = executor.getStats();
      
      assert.equal(stats.totalExecuted, 2);
      assert.equal(stats.totalCompleted, 2);
      assert.equal(stats.running, 0);
    });
  });

  describe('events', () => {
    it('should emit execution:start event', (t, done) => {
      executor.on('execution:start', (data) => {
        assert.equal(data.mode, ExecutionMode.PARALLEL);
        assert.equal(data.taskCount, 1);
        done();
      });
      
      executor.parallel([{ id: 't1', execute: async () => 'r1' }]);
    });

    it('should emit task:complete event', (t, done) => {
      executor.on('task:complete', (result) => {
        assert.equal(result.taskId, 't1');
        assert.equal(result.success, true);
        done();
      });
      
      executor.run({ id: 't1', execute: async () => 'r1' });
    });
  });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
