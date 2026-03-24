/**
 * @fileoverview Agent Supervisor Tests
 * @module tests/agents/supervisor
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { AgentSupervisor, AgentHealthStatus, RestartPolicy } from '../../src/agents/supervisor.js';

describe('Agent Supervisor', () => {
  let supervisor;

  before(() => {
    supervisor = new AgentSupervisor({
      healthCheckInterval: 1000,
      unhealthyThreshold: 2
    });
    supervisor.start();
  });

  after(() => {
    if (supervisor) {
      supervisor.dispose();
    }
  });

  describe('Registration', () => {
    it('should register agents for supervision', () => {
      const agent = {
        id: 'agent-1',
        state: 'ACTIVE',
        lastHeartbeat: Date.now()
      };

      const supervised = supervisor.supervise(agent);
      
      assert.ok(supervised);
      assert.strictEqual(supervised.id, 'agent-1');
      assert.strictEqual(supervisor.agents.size, 1);
    });

    it('should unregister agents', () => {
      const agent = {
        id: 'agent-2',
        state: 'ACTIVE',
        lastHeartbeat: Date.now()
      };

      supervisor.supervise(agent);
      assert.strictEqual(supervisor.agents.size, 2);

      const result = supervisor.unsupervise('agent-2');
      assert.strictEqual(result, true);
      assert.strictEqual(supervisor.agents.size, 1);
    });
  });

  describe('Health Status', () => {
    it('should get agent health status', () => {
      const agent = {
        id: 'agent-3',
        state: 'ACTIVE',
        lastHeartbeat: Date.now()
      };

      supervisor.supervise(agent);
      
      const health = supervisor.getAgentHealth('agent-3');
      assert.ok(Object.values(AgentHealthStatus).includes(health));
    });

    it('should return UNKNOWN for unsupervised agents', () => {
      const health = supervisor.getAgentHealth('non-existent');
      assert.strictEqual(health, AgentHealthStatus.UNKNOWN);
    });
  });

  describe('Statistics', () => {
    it('should provide supervisor statistics', () => {
      const stats = supervisor.getStats();
      
      assert.ok(stats);
      assert.ok(typeof stats.totalAgents === 'number');
      assert.ok(typeof stats.healthyAgents === 'number');
      assert.ok(typeof stats.isRunning === 'boolean');
    });
  });

  describe('Restart Policy', () => {
    it('should have defined restart policies', () => {
      assert.ok(RestartPolicy.NEVER);
      assert.ok(RestartPolicy.ON_FAILURE);
      assert.ok(RestartPolicy.ALWAYS);
    });
  });
});
