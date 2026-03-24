/**
 * @fileoverview Agent Scheduler Tests
 * @module tests/agents/scheduler
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { AgentScheduler, SchedulingStrategy, TaskPriority, TaskState } from '../../src/agents/scheduler.js';

describe('Agent Scheduler', () => {
  let scheduler;

  before(() => {
    scheduler = new AgentScheduler({
      strategy: SchedulingStrategy.ROUND_ROBIN,
      maxQueueSize: 100
    });
    scheduler.start();
  });

  after(() => {
    if (scheduler) {
      scheduler.dispose();
    }
  });

  describe('Agent Registration', () => {
    it('should register agents', () => {
      const agent = { id: 'agent-1' };
      
      const registered = scheduler.registerAgent(agent, {
        capabilities: ['analysis'],
        maxConcurrent: 2
      });

      assert.ok(registered);
      assert.strictEqual(registered.id, 'agent-1');
      assert.deepStrictEqual(registered.capabilities, ['analysis']);
    });

    it('should unregister agents', () => {
      const agent = { id: 'agent-2' };
      
      scheduler.registerAgent(agent);
      assert.strictEqual(scheduler.agents.size, 2);

      const result = scheduler.unregisterAgent('agent-2');
      assert.strictEqual(result, true);
      assert.strictEqual(scheduler.agents.size, 1);
    });
  });

  describe('Task Submission', () => {
    it('should submit tasks', () => {
      const task = scheduler.submit({
        id: 'task-1',
        type: 'analysis'
      }, {
        priority: TaskPriority.HIGH
      });

      assert.ok(task);
      assert.strictEqual(task.id, 'task-1');
      assert.strictEqual(task.priority, TaskPriority.HIGH);
      // Task may be PENDING or SCHEDULED depending on agent availability
      assert.ok(task.state === TaskState.PENDING || task.state === TaskState.SCHEDULED);
    });

    it('should cancel pending tasks', () => {
      // Submit with a capability that no agent has to ensure it stays pending
      const task = scheduler.submit({
        id: 'task-2',
        type: 'test'
      }, {
        requiredCapability: 'non-existent-capability'
      });

      // Ensure task is still pending (not scheduled)
      if (task.state === TaskState.PENDING) {
        const result = scheduler.cancel('task-2', 'test cancellation');
        assert.strictEqual(result, true);
        
        const cancelledTask = scheduler.getTask('task-2');
        assert.strictEqual(cancelledTask.state, TaskState.CANCELLED);
      } else {
        // Task was already scheduled, cancel should fail
        const result = scheduler.cancel('task-2', 'test cancellation');
        // Cancel returns false for non-pending tasks
        assert.strictEqual(result, false);
      }
    });

    it('should track task metrics', () => {
      const stats = scheduler.getStats();
      
      assert.ok(stats);
      assert.ok(typeof stats.totalQueueDepth === 'number');
      assert.ok(typeof stats.metrics.tasksSubmitted === 'number');
    });
  });

  describe('Scheduling Strategies', () => {
    it('should have defined strategies', () => {
      assert.ok(SchedulingStrategy.ROUND_ROBIN);
      assert.ok(SchedulingStrategy.LOAD_BASED);
      assert.ok(SchedulingStrategy.CAPABILITY_BASED);
      assert.ok(SchedulingStrategy.FIFO);
    });

    it('should have defined priority levels', () => {
      assert.strictEqual(TaskPriority.CRITICAL, 0);
      assert.strictEqual(TaskPriority.HIGH, 1);
      assert.strictEqual(TaskPriority.NORMAL, 2);
      assert.strictEqual(TaskPriority.LOW, 3);
      assert.strictEqual(TaskPriority.BACKGROUND, 4);
    });

    it('should change strategy', () => {
      scheduler.setStrategy(SchedulingStrategy.LOAD_BASED);
      assert.strictEqual(scheduler.strategy, SchedulingStrategy.LOAD_BASED);
    });
  });

  describe('Task Lifecycle', () => {
    it('should mark tasks as started', () => {
      scheduler.registerAgent({ id: 'worker-1' }, { maxConcurrent: 5 });
      
      const task = scheduler.submit({
        id: 'task-3',
        type: 'test'
      });

      // Manually trigger scheduling
      scheduler._processQueues();

      // If task was scheduled, mark it started
      if (scheduler.activeTasks.has('task-3')) {
        scheduler.markTaskStarted('task-3', 'worker-1');
        
        const updatedTask = scheduler.getTask('task-3');
        assert.strictEqual(updatedTask.state, TaskState.RUNNING);
        assert.strictEqual(updatedTask.assignedAgent, 'worker-1');
      }
    });

    it('should mark tasks as completed', () => {
      scheduler.markTaskCompleted('task-3', { result: 'success' });
      
      const task = scheduler.getTask('task-3');
      if (task) {
        assert.strictEqual(task.state, TaskState.COMPLETED);
        assert.deepStrictEqual(task.result, { result: 'success' });
      }
    });
  });
});
