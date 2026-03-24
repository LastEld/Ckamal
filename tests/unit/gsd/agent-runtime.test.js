import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Agent } from '../../../src/gsd/agent.js';
import { SpawnManager } from '../../../src/bios/spawn-manager.js';

describe('Agent Runtime Adapter', () => {
  it('executes executeTask through an injected agent executor', async () => {
    const agent = new Agent('agent-1', 'worker', {
      config: {
        executor: async (task) => ({
          id: task.id,
          payload: task.payload
        })
      }
    });

    const result = await agent.executeTask({
      type: 'analyze',
      data: { topic: 'router' }
    });

    assert.ok(result.id);
    assert.deepEqual(result.payload, { topic: 'router' });
  });

  it('spawns agents that use the subscription runtime manager when provided', async () => {
    const runtimeManager = {
      async getClient(binding) {
        return {
          async execute(task, options) {
            return {
              binding,
              description: task.description,
              model: options.model
            };
          }
        };
      },
      async shutdown() {}
    };

    const manager = new SpawnManager({
      healthCheckInterval: 60000,
      runtimeManager
    });

    const agent = await manager.spawnAgent(
      {
        id: 'builder',
        type: 'worker',
        capabilities: {}
      },
      {
        client: 'codex',
        task: {
          complexity: 9,
          files: ['src/index.js']
        }
      }
    );

    const result = await agent.executeTask({
      id: 'task-1',
      type: 'code',
      data: { content: 'Implement the execution path' }
    });

    assert.equal(result.binding.canonicalModelId, 'gpt-5.4-codex');
    assert.equal(result.model, 'gpt-5.4-codex');
    assert.equal(result.description, 'Implement the execution path');

    await manager.dispose();
  });
});
