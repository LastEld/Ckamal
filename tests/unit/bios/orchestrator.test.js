/**
 * @fileoverview Unit tests for the current agent orchestrator public surface.
 */

import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { AgentOrchestrator, TaskPriority } from '../../../src/bios/orchestrator.js';
import { SpawnManager } from '../../../src/bios/spawn-manager.js';

describe('AgentOrchestrator', () => {
  let spawnManager;
  let orchestrator;

  beforeEach(() => {
    spawnManager = new SpawnManager({
      healthCheckInterval: 60_000
    });

    mock.method(spawnManager, 'spawnAgent', async (_cv, options = {}) => ({
      id: `agent-${options.task?.id || 'unknown'}`,
      executeTask: async (task) => ({
        taskId: task.id,
        type: task.type,
        input: task.data,
        client: options.client || 'claude'
      }),
      isHealthy: () => true
    }));
    mock.method(spawnManager, 'terminateAgent', async () => true);
    mock.method(spawnManager, 'getFallbackChain', () => [{ name: 'claude' }]);
    mock.method(spawnManager, 'getAllAgentStatuses', () => []);
    mock.method(spawnManager, 'getStats', () => ({ agentCount: 0, totalMemory: 0 }));
    mock.method(spawnManager, 'getAgentStatus', () => ({ healthy: true, lifecycleState: 'active' }));

    orchestrator = new AgentOrchestrator({
      spawnManager,
      maxConcurrentTasks: 2,
      defaultTimeout: 1_000
    });
  });

  afterEach(async () => {
    await orchestrator.dispose();
    mock.restoreAll();
  });

  it('delegates a task through the spawn manager', async () => {
    const result = await orchestrator.delegateTask({
      id: 'task-001',
      type: 'analysis',
      data: { prompt: 'inspect this code' }
    }, {
      client: 'kimi',
      priority: TaskPriority.HIGH
    });

    assert.equal(result.taskId, 'task-001');
    assert.equal(result.client, 'kimi');
    assert.equal(result.input.prompt, 'inspect this code');
  });

  it('aggregates parallel execution results', async () => {
    const result = await orchestrator.parallelExecution([
      { type: 'review', data: { file: 'a.js' } },
      { type: 'review', data: { file: 'b.js' } }
    ], {
      clients: ['claude', 'codex'],
      aggregation: 'all'
    });

    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.successful, 2);
    assert.equal(result.failed.length, 0);
  });

  it('chains sequential execution with transformed input', async () => {
    const result = await orchestrator.chainExecution([
      {
        client: 'claude',
        task: 'summarize',
        data: { step: 1 }
      },
      {
        client: 'codex',
        task: 'implement',
        transform: (previous) => ({
          carriedTaskId: previous.taskId,
          carriedClient: previous.client
        })
      }
    ], {
      initialData: { seed: true }
    });

    assert.equal(result.finalOutput.client, 'codex');
    assert.equal(result.finalOutput.input.input.carriedClient, 'claude');
    assert.equal(result.finalOutput.input.input.carriedTaskId.includes('step-0'), true);
  });

  it('cancels queued tasks', async () => {
    const queuedTask = {
      id: 'queued-task',
      type: 'background',
      data: {},
      priority: TaskPriority.LOW,
      state: 'pending',
      createdAt: new Date()
    };

    const queuedPromise = orchestrator._queueTask(queuedTask);

    assert.equal(orchestrator.cancelTask('queued-task'), true);
    await assert.rejects(queuedPromise, /Task cancelled/i);
  });

  it('reports status and supports agent monitoring', () => {
    orchestrator.agents.set('agent-123', {
      agent: {},
      cv: { id: 'cv-test' },
      spawnedAt: new Date(),
      tasksCompleted: 0,
      tasksFailed: 0
    });

    const monitor = orchestrator.monitorAgent('agent-123');
    const status = orchestrator.getStatus();

    assert.equal(status.agents.active, 1);
    assert.equal(status.tasks.pending, 0);
    assert.deepEqual(monitor.getStatus(), { healthy: true, lifecycleState: 'active' });

    monitor.stop();
  });
});
