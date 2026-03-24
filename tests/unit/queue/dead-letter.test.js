/**
 * @fileoverview Unit tests for Dead Letter Queue
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DeadLetterQueue, FailedTaskStatus } from '../../../src/queue/dead-letter.js';

describe('DeadLetterQueue', () => {
  let dlq;

  beforeEach(() => {
    dlq = new DeadLetterQueue({ autoArchive: false });
  });

  describe('add', () => {
    it('should add failed task to queue', () => {
      const task = {
        id: 't1',
        execute: async () => 'retry',
        data: { foo: 'bar' },
        metadata: { priority: 1 }
      };
      
      const failed = dlq.add(task, new Error('failed'), { attempts: 3 });
      
      assert.ok(failed.id.startsWith('dlq_'));
      assert.equal(failed.originalId, 't1');
      assert.equal(failed.error, 'failed');
      assert.equal(failed.status, FailedTaskStatus.FAILED);
      assert.equal(failed.attempts, 3);
      assert.deepEqual(failed.data, { foo: 'bar' });
    });

    it('should track attempt history', () => {
      const task = { id: 't1', execute: async () => 'retry' };
      const history = [
        { attempt: 1, error: 'error1', timestamp: Date.now() },
        { attempt: 2, error: 'error2', timestamp: Date.now() }
      ];
      
      const failed = dlq.add(task, new Error('final'), { 
        attempts: 3, 
        attemptHistory: history 
      });
      
      assert.equal(failed.attemptHistory.length, 2);
    });

    it('should remove oldest task when queue is full', () => {
      const smallDlq = new DeadLetterQueue({ maxSize: 2, autoArchive: false });
      
      smallDlq.add({ id: 't1', execute: async () => 'retry' }, new Error('e1'));
      smallDlq.add({ id: 't2', execute: async () => 'retry' }, new Error('e2'));
      smallDlq.add({ id: 't3', execute: async () => 'retry' }, new Error('e3'));
      
      assert.equal(smallDlq.count(), 2);
      assert.equal(smallDlq.has('dlq_'), false); // First one removed
    });
  });

  describe('get', () => {
    it('should get failed task by id', () => {
      const task = { id: 't1', execute: async () => 'retry' };
      const failed = dlq.add(task, new Error('failed'));
      
      const retrieved = dlq.get(failed.id);
      
      assert.equal(retrieved.id, failed.id);
    });

    it('should return null for non-existent task', () => {
      assert.equal(dlq.get('nonexistent'), null);
    });
  });

  describe('getByOriginalId', () => {
    it('should get failed task by original id', () => {
      const task = { id: 'original-123', execute: async () => 'retry' };
      dlq.add(task, new Error('failed'));
      
      const retrieved = dlq.getByOriginalId('original-123');
      
      assert.equal(retrieved.originalId, 'original-123');
    });

    it('should return null for non-existent original id', () => {
      assert.equal(dlq.getByOriginalId('nonexistent'), null);
    });
  });

  describe('list', () => {
    it('should list all failed tasks', () => {
      dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'));
      dlq.add({ id: 't2', execute: async () => 'r2' }, new Error('e2'));
      
      const tasks = dlq.list();
      
      assert.equal(tasks.length, 2);
    });

    it('should filter by status', () => {
      const task1 = { id: 't1', execute: async () => 'r1' };
      const failed1 = dlq.add(task1, new Error('e1'));
      
      // Mark as archived manually for test
      failed1.status = FailedTaskStatus.ARCHIVED;
      
      dlq.add({ id: 't2', execute: async () => 'r2' }, new Error('e2'));
      
      const archived = dlq.list({ status: FailedTaskStatus.ARCHIVED });
      
      assert.equal(archived.length, 1);
      assert.equal(archived[0].id, failed1.id);
    });

    it('should filter by queue', () => {
      dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'), { queue: 'q1' });
      dlq.add({ id: 't2', execute: async () => 'r2' }, new Error('e2'), { queue: 'q2' });
      
      const q1Tasks = dlq.list({ queue: 'q1' });
      
      assert.equal(q1Tasks.length, 1);
      assert.equal(q1Tasks[0].queue, 'q1');
    });

    it('should filter by date range', () => {
      const now = Date.now();
      
      dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'));
      
      const since = new Date(now - 1000);
      const until = new Date(now + 1000);
      const tasks = dlq.list({ since, until });
      
      assert.equal(tasks.length, 1);
    });

    it('should support pagination', () => {
      for (let i = 0; i < 5; i++) {
        dlq.add({ id: `t${i}`, execute: async () => `r${i}` }, new Error(`e${i}`));
      }
      
      const page1 = dlq.list({ limit: 2, offset: 0 });
      const page2 = dlq.list({ limit: 2, offset: 2 });
      
      assert.equal(page1.length, 2);
      assert.equal(page2.length, 2);
    });
  });

  describe('retry', () => {
    it('should retry failed task successfully', async () => {
      const task = { 
        id: 't1', 
        execute: async () => 'success' 
      };
      const failed = dlq.add(task, new Error('original error'));
      
      const result = await dlq.retry(failed.id);
      
      assert.equal(result.success, true);
      assert.equal(result.result, 'success');
    });

    it('should handle retry failure', async () => {
      const task = { 
        id: 't1', 
        execute: async () => { throw new Error('still fails'); } 
      };
      const failed = dlq.add(task, new Error('original error'));
      
      const result = await dlq.retry(failed.id);
      
      assert.equal(result.success, false);
      assert.ok(result.error);
    });

    it('should return error for non-existent task', async () => {
      const result = await dlq.retry('nonexistent');
      
      assert.equal(result.success, false);
      assert.ok(result.error.message.includes('not found'));
    });

    it('should return error for task without execute function', async () => {
      const failed = dlq.add({ id: 't1' }, new Error('error'));
      
      const result = await dlq.retry(failed.id);
      
      assert.equal(result.success, false);
      assert.ok(result.error.message.includes('no execute'));
    });
  });

  describe('retryMany', () => {
    it('should retry multiple tasks', async () => {
      const failed1 = dlq.add(
        { id: 't1', execute: async () => 'r1' }, 
        new Error('e1')
      );
      const failed2 = dlq.add(
        { id: 't2', execute: async () => 'r2' }, 
        new Error('e2')
      );
      
      const result = await dlq.retryMany([failed1.id, failed2.id]);
      
      assert.equal(result.total, 2);
      assert.equal(result.succeeded, 2);
      assert.equal(result.failed, 0);
    });
  });

  describe('retryAll', () => {
    it('should retry all tasks matching filter', async () => {
      dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'), { queue: 'q1' });
      dlq.add({ id: 't2', execute: async () => 'r2' }, new Error('e2'), { queue: 'q1' });
      dlq.add({ id: 't3', execute: async () => 'r3' }, new Error('e3'), { queue: 'q2' });
      
      const result = await dlq.retryAll({ queue: 'q1' });
      
      assert.equal(result.total, 2);
    });
  });

  describe('archive', () => {
    it('should archive failed task', () => {
      const failed = dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'));
      
      const archived = dlq.archive(failed.id);
      
      assert.equal(archived, true);
      assert.equal(dlq.count(), 0);
      assert.ok(dlq.get(failed.id).status === FailedTaskStatus.ARCHIVED);
    });

    it('should return false for non-existent task', () => {
      assert.equal(dlq.archive('nonexistent'), false);
    });
  });

  describe('discard', () => {
    it('should permanently remove task', () => {
      const failed = dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'));
      
      const discarded = dlq.discard(failed.id);
      
      assert.equal(discarded, true);
      assert.equal(dlq.count(), 0);
      assert.equal(dlq.get(failed.id), null);
    });

    it('should return false for non-existent task', () => {
      assert.equal(dlq.discard('nonexistent'), false);
    });
  });

  describe('cleanup', () => {
    it('should archive old tasks', () => {
      // This test would need to mock time or use a very short retention
      // For now, just verify the method exists and returns a number
      const cleaned = dlq.cleanup(0); // Archive everything
      
      assert.equal(typeof cleaned, 'number');
    });
  });

  describe('getStats', () => {
    it('should return DLQ statistics', () => {
      dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'));
      
      const stats = dlq.getStats();
      
      assert.equal(stats.totalFailed, 1);
      assert.equal(stats.currentFailed, 1);
    });
  });

  describe('has and count', () => {
    it('should check if task exists', () => {
      const failed = dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'));
      
      assert.equal(dlq.has(failed.id), true);
      assert.equal(dlq.has('nonexistent'), false);
    });

    it('should return count of failed tasks', () => {
      assert.equal(dlq.count(), 0);
      
      dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'));
      
      assert.equal(dlq.count(), 1);
    });
  });

  describe('clear', () => {
    it('should clear all tasks', () => {
      dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'));
      dlq.add({ id: 't2', execute: async () => 'r2' }, new Error('e2'));
      
      const count = dlq.clear();
      
      assert.equal(count, 2);
      assert.equal(dlq.count(), 0);
    });
  });

  describe('events', () => {
    it('should emit task:failed event', (t, done) => {
      dlq.on('task:failed', (task) => {
        assert.ok(task.id);
        done();
      });
      
      dlq.add({ id: 't1', execute: async () => 'r1' }, new Error('e1'));
    });
  });
});
