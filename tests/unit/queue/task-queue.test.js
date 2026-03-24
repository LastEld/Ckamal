/**
 * @fileoverview Unit tests for Task Queue
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TaskQueue, Priority, TaskStatus } from '../../../src/queue/task-queue.js';

describe('TaskQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  describe('enqueue', () => {
    it('should enqueue a task with default priority', () => {
      const task = queue.enqueue({ id: 't1', execute: async () => 'done' });
      
      assert.equal(task.id, 't1');
      assert.equal(task.priority, Priority.NORMAL);
      assert.equal(task.status, TaskStatus.PENDING);
      assert.equal(queue.size(), 1);
    });

    it('should enqueue task with custom priority', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' }, Priority.HIGH);
      queue.enqueue({ id: 't2', execute: async () => 'done' }, Priority.LOW);
      
      const peeked = queue.peek();
      assert.equal(peeked.id, 't1');
    });

    it('should auto-generate task id if not provided', () => {
      const task = queue.enqueue({ execute: async () => 'done' });
      
      assert.ok(task.id.startsWith('task_'));
    });

    it('should throw on duplicate task id', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      
      assert.throws(() => {
        queue.enqueue({ id: 't1', execute: async () => 'done' });
      }, /already exists/);
    });

    it('should throw when queue is full', () => {
      const smallQueue = new TaskQueue({ maxSize: 2 });
      smallQueue.enqueue({ id: 't1', execute: async () => 'done' });
      smallQueue.enqueue({ id: 't2', execute: async () => 'done' });
      
      assert.throws(() => {
        smallQueue.enqueue({ id: 't3', execute: async () => 'done' });
      }, /full/);
    });

    it('should store task data and metadata', () => {
      const task = queue.enqueue(
        { id: 't1', execute: async () => 'done' },
        Priority.HIGH,
        { foo: 'bar' },
        { source: 'test' },
        'test-tag'
      );
      
      assert.deepEqual(task.data, { foo: 'bar' });
      assert.equal(task.metadata.source, 'test');
      assert.equal(task.metadata.tag, 'test-tag');
    });
  });

  describe('dequeue', () => {
    it('should dequeue tasks in priority order', () => {
      queue.enqueue({ id: 'low', execute: async () => 'done' }, Priority.LOW);
      queue.enqueue({ id: 'critical', execute: async () => 'done' }, Priority.CRITICAL);
      queue.enqueue({ id: 'high', execute: async () => 'done' }, Priority.HIGH);
      queue.enqueue({ id: 'normal', execute: async () => 'done' }, Priority.NORMAL);
      
      const order = [];
      while (!queue.isEmpty()) {
        order.push(queue.dequeue().id);
      }
      
      assert.deepEqual(order, ['critical', 'high', 'normal', 'low']);
    });

    it('should maintain FIFO for same priority', () => {
      queue.enqueue({ id: 'first', execute: async () => 'done' }, Priority.NORMAL);
      queue.enqueue({ id: 'second', execute: async () => 'done' }, Priority.NORMAL);
      queue.enqueue({ id: 'third', execute: async () => 'done' }, Priority.NORMAL);
      
      assert.equal(queue.dequeue().id, 'first');
      assert.equal(queue.dequeue().id, 'second');
      assert.equal(queue.dequeue().id, 'third');
    });

    it('should return null when queue is empty', () => {
      assert.equal(queue.dequeue(), null);
    });

    it('should update task status to running', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      const task = queue.dequeue();
      
      assert.equal(task.status, TaskStatus.RUNNING);
      assert.ok(task.startedAt);
    });
  });

  describe('peek', () => {
    it('should return highest priority task without removing', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' }, Priority.LOW);
      queue.enqueue({ id: 't2', execute: async () => 'done' }, Priority.HIGH);
      
      const peeked = queue.peek();
      assert.equal(peeked.id, 't2');
      assert.equal(queue.size(), 2);
    });

    it('should return null when queue is empty', () => {
      assert.equal(queue.peek(), null);
    });
  });

  describe('reprioritize', () => {
    it('should change task priority', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' }, Priority.LOW);
      
      const success = queue.reprioritize('t1', Priority.CRITICAL);
      
      assert.equal(success, true);
      assert.equal(queue.peek().priority, Priority.CRITICAL);
    });

    it('should reposition task in heap', () => {
      queue.enqueue({ id: 'low', execute: async () => 'done' }, Priority.LOW);
      queue.enqueue({ id: 'normal', execute: async () => 'done' }, Priority.NORMAL);
      
      queue.reprioritize('low', Priority.CRITICAL);
      
      assert.equal(queue.dequeue().id, 'low');
    });

    it('should return false for non-existent task', () => {
      const success = queue.reprioritize('nonexistent', Priority.HIGH);
      
      assert.equal(success, false);
    });
  });

  describe('remove', () => {
    it('should remove task from queue', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      
      const removed = queue.remove('t1');
      
      assert.equal(removed.id, 't1');
      assert.equal(queue.size(), 0);
    });

    it('should set task status to cancelled', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      
      const removed = queue.remove('t1');
      
      assert.equal(removed.status, TaskStatus.CANCELLED);
      assert.ok(removed.cancelledAt);
    });

    it('should return null for non-existent task', () => {
      const removed = queue.remove('nonexistent');
      
      assert.equal(removed, null);
    });
  });

  describe('get and has', () => {
    it('should get task by id', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      
      const task = queue.get('t1');
      
      assert.equal(task.id, 't1');
    });

    it('should return null for non-existent task', () => {
      assert.equal(queue.get('nonexistent'), null);
    });

    it('should check if task exists', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      
      assert.equal(queue.has('t1'), true);
      assert.equal(queue.has('nonexistent'), false);
    });
  });

  describe('getByTag', () => {
    it('should return tasks by tag', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' }, Priority.NORMAL, null, {}, 'tag-a');
      queue.enqueue({ id: 't2', execute: async () => 'done' }, Priority.NORMAL, null, {}, 'tag-b');
      queue.enqueue({ id: 't3', execute: async () => 'done' }, Priority.NORMAL, null, {}, 'tag-a');
      
      const tasks = queue.getByTag('tag-a');
      
      assert.equal(tasks.length, 2);
      assert.ok(tasks.some(t => t.id === 't1'));
      assert.ok(tasks.some(t => t.id === 't3'));
    });
  });

  describe('clear', () => {
    it('should clear all tasks', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      queue.enqueue({ id: 't2', execute: async () => 'done' });
      
      const count = queue.clear();
      
      assert.equal(count, 2);
      assert.equal(queue.size(), 0);
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', () => {
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      queue.enqueue({ id: 't2', execute: async () => 'done' });
      queue.dequeue();
      
      const stats = queue.getStats();
      
      assert.equal(stats.enqueued, 2);
      assert.equal(stats.dequeued, 1);
      assert.equal(stats.currentSize, 1);
    });
  });

  describe('events', () => {
    it('should emit task:enqueued event', (t, done) => {
      queue.on('task:enqueued', (task) => {
        assert.equal(task.id, 't1');
        done();
      });
      
      queue.enqueue({ id: 't1', execute: async () => 'done' });
    });

    it('should emit task:started event on dequeue', (t, done) => {
      queue.on('task:started', (task) => {
        assert.equal(task.id, 't1');
        done();
      });
      
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      queue.dequeue();
    });

    it('should emit task:cancelled event on remove', (t, done) => {
      queue.on('task:cancelled', (task) => {
        assert.equal(task.id, 't1');
        done();
      });
      
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      queue.remove('t1');
    });
  });
});
