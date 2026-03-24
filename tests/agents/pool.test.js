/**
 * @fileoverview Agent Pool and Lifecycle Tests
 * @module tests/agents/pool
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { AgentManager, AgentType, TaskPriority, AgentTypeConfigs } from '../../src/agents/index.js';

describe('Agent Pool and Lifecycle', () => {
  let manager;

  before(() => {
    manager = new AgentManager({
      agentType: AgentType.SYSTEM,
      minPoolSize: 2,
      maxPoolSize: 5,
      autoScale: false,
      enableSupervision: false,
      enableScheduling: false
    });
  });

  after(async () => {
    if (manager) {
      await manager.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', async () => {
      await manager.initialize();
      
      const stats = manager.getStats();
      assert.strictEqual(stats.isInitialized, true);
      assert.strictEqual(stats.pool.poolSize, 2);
      assert.strictEqual(stats.pool.minPoolSize, 2);
      assert.strictEqual(stats.pool.maxPoolSize, 5);
    });

    it('should throw when acquiring before initialization', async () => {
      const newManager = new AgentManager();
      await assert.rejects(
        () => newManager.acquire(),
        /not initialized/
      );
      await newManager.shutdown();
    });
  });

  describe('Agent Acquisition and Release', () => {
    it('should acquire and release agents', async () => {
      const agent = await manager.acquire();
      assert.ok(agent);
      assert.ok(agent.id);
      assert.strictEqual(agent.acquired, true);
      
      manager.release(agent);
      assert.strictEqual(agent.acquired, false);
    });

    it('should track available agents correctly', async () => {
      const agent1 = await manager.acquire();
      let stats = manager.getStats();
      assert.strictEqual(stats.pool.availableCount, 1);
      
      const agent2 = await manager.acquire();
      stats = manager.getStats();
      assert.strictEqual(stats.pool.availableCount, 0);
      
      manager.release(agent1);
      stats = manager.getStats();
      assert.strictEqual(stats.pool.availableCount, 1);
      
      manager.release(agent2);
      stats = manager.getStats();
      assert.strictEqual(stats.pool.availableCount, 2);
    });
  });

  describe('Scaling', () => {
    it('should scale up the pool', async () => {
      const added = await manager.scaleUp(2);
      assert.strictEqual(added, 2);
      
      const stats = manager.getStats();
      assert.strictEqual(stats.pool.poolSize, 4);
    });

    it('should scale down the pool', async () => {
      const removed = await manager.scaleDown(1);
      assert.strictEqual(removed, 1);
      
      const stats = manager.getStats();
      assert.strictEqual(stats.pool.poolSize, 3);
    });

    it('should respect min/max limits when scaling', async () => {
      // Try to scale up beyond max
      const added = await manager.scaleUp(10);
      assert.strictEqual(added, 2); // 3 + 2 = 5 (max)
      
      // Try to scale down below min
      const removed = await manager.scaleDown(10);
      assert.strictEqual(removed, 3); // 5 - 3 = 2 (min)
    });
  });

  describe('Execute with Agent', () => {
    it('should execute task with acquired agent', async () => {
      const result = await manager.execute(async (agent) => {
        return { agentId: agent.id, task: 'completed' };
      });
      
      assert.ok(result.agentId);
      assert.strictEqual(result.task, 'completed');
    });

    it('should release agent even if task fails', async () => {
      await assert.rejects(
        () => manager.execute(async () => {
          throw new Error('Task failed');
        }),
        /Task failed/
      );
      
      const stats = manager.getStats();
      assert.strictEqual(stats.pool.availableCount, 2);
    });
  });

  describe('Statistics', () => {
    it('should track statistics correctly', async () => {
      const beforeStats = manager.getStats();
      const beforeRequests = beforeStats.pool.stats.totalRequests;
      
      const agent = await manager.acquire();
      manager.release(agent);
      
      const stats = manager.getStats();
      assert.strictEqual(stats.pool.stats.totalRequests, beforeRequests + 1);
      assert.strictEqual(stats.pool.stats.totalAcquired, beforeRequests + 1);
    });
  });
});

describe('Agent Types', () => {
  it('should have all defined agent types', () => {
    const types = Object.values(AgentType);
    assert.ok(types.includes('SYSTEM'));
    assert.ok(types.includes('CODING'));
    assert.ok(types.includes('ANALYSIS'));
    assert.ok(types.includes('REVIEW'));
    assert.ok(types.includes('TEST'));
  });

  it('should get agent type config', () => {
    const config = AgentTypeConfigs[AgentType.CODING];
    assert.ok(config);
    assert.strictEqual(config.name, 'CODING');
    assert.strictEqual(config.capabilities.canExecuteTasks, true);
    assert.ok(config.priority > 0);
  });
});

describe('Task Scheduling', () => {
  let manager;

  before(() => {
    manager = new AgentManager({
      agentType: AgentType.SYSTEM,
      minPoolSize: 1,
      maxPoolSize: 3,
      enableScheduling: true,
      enableSupervision: false
    });
  });

  after(async () => {
    if (manager) {
      await manager.shutdown();
    }
  });

  it('should schedule tasks', async () => {
    await manager.initialize();
    
    const task = manager.scheduleTask({
      id: 'task-1',
      type: 'test',
      payload: { data: 'test' }
    }, { priority: TaskPriority.NORMAL });
    
    assert.ok(task);
    assert.strictEqual(task.id, 'task-1');
    assert.strictEqual(task.priority, TaskPriority.NORMAL);
  });

  it('should track scheduler statistics', async () => {
    // Reset manager to get fresh stats
    await manager.shutdown();
    manager = new AgentManager({
      agentType: AgentType.SYSTEM,
      minPoolSize: 1,
      maxPoolSize: 3,
      enableScheduling: true,
      enableSupervision: false
    });
    await manager.initialize();
    
    manager.scheduleTask({ id: 'task-2', type: 'test' });
    manager.scheduleTask({ id: 'task-3', type: 'test' });
    
    const stats = manager.getStats();
    assert.strictEqual(stats.scheduler.metrics.tasksSubmitted, 2);
  });
});
