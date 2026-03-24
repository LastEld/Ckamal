import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StatePersistence } from '../../../src/controllers/autonomous/persistence.js';

function createMockRuntimeRepository() {
  const states = new Map();
  const versions = new Map();
  const checkpoints = new Map();
  const checkpointKeys = new Map();
  const sessions = new Map();
  const executions = new Map();
  const schedules = new Map();

  return {
    async saveState(record) {
      const current = states.get(record.key);
      const version = current ? current.version + 1 : 1;
      const saved = {
        key: record.key,
        data: record.state,
        version,
        checksum: record.checksum,
        createdAt: current ? current.createdAt : record.createdAt,
        updatedAt: record.updatedAt,
        expiresAt: record.expiresAt || null,
        metadata: record.metadata || {},
        providerSessionId: record.providerSessionId || null,
        executionId: record.executionId || null,
        scheduleId: record.scheduleId || null,
        stateType: record.stateType || 'runtime',
      };

      states.set(record.key, saved);
      versions.set(`${record.key}:${version}`, { ...saved });
      return { ...saved };
    },
    async getState(key) {
      return states.get(key) || null;
    },
    async getStateVersion(key, version) {
      return versions.get(`${key}:${version}`) || null;
    },
    async deleteState(key) {
      const existed = states.delete(key);
      for (const entryKey of Array.from(versions.keys())) {
        if (entryKey.startsWith(`${key}:`)) {
          versions.delete(entryKey);
        }
      }
      for (const [id, cp] of Array.from(checkpoints.entries())) {
        if (cp.key === key) {
          checkpoints.delete(id);
        }
      }
      checkpointKeys.delete(key);
      return existed;
    },
    async createCheckpoint(record) {
      const checkpoint = {
        ...record,
        state: record.state,
      };
      checkpoints.set(record.id, checkpoint);
      if (!checkpointKeys.has(record.key)) {
        checkpointKeys.set(record.key, new Set());
      }
      checkpointKeys.get(record.key).add(record.id);
      return { ...checkpoint };
    },
    async getCheckpoint(id) {
      return checkpoints.get(id) || null;
    },
    async listCheckpoints(key) {
      return Array.from(checkpointKeys.get(key) || [])
        .map(id => checkpoints.get(id))
        .filter(Boolean)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },
    async deleteCheckpoints(key, options = {}) {
      const keepIds = new Set(options.keepIds || []);
      let deleted = 0;
      for (const id of Array.from(checkpointKeys.get(key) || [])) {
        if (!keepIds.has(id)) {
          checkpointKeys.get(key).delete(id);
          checkpoints.delete(id);
          deleted++;
        }
      }
      return deleted;
    },
    async saveProviderSession(record) {
      sessions.set(record.id, { ...record });
      return sessions.get(record.id);
    },
    async getProviderSession(id) {
      return sessions.get(id) || null;
    },
    async listProviderSessions() {
      return Array.from(sessions.values());
    },
    async saveAgentExecution(record) {
      executions.set(record.id, { ...record });
      return executions.get(record.id);
    },
    async getAgentExecution(id) {
      return executions.get(id) || null;
    },
    async listAgentExecutions() {
      return Array.from(executions.values());
    },
    async saveSchedule(record) {
      schedules.set(record.id, { ...record });
      return schedules.get(record.id);
    },
    async getSchedule(id) {
      return schedules.get(id) || null;
    },
    async listSchedules() {
      return Array.from(schedules.values());
    },
    async cleanupExpiredStates() {
      return 0;
    },
    async clear() {
      states.clear();
      versions.clear();
      checkpoints.clear();
      checkpointKeys.clear();
      sessions.clear();
      executions.clear();
      schedules.clear();
      return { statesCleared: 0, checkpointsCleared: 0 };
    },
    async getStats() {
      return {
        states: states.size,
        versions: versions.size,
        checkpoints: checkpoints.size,
        providerSessions: sessions.size,
        executions: executions.size,
        schedules: schedules.size,
        keys: states.size,
        estimatedStateSize: 0,
        estimatedCheckpointSize: 0,
        totalEstimatedSize: 0,
      };
    },
  };
}

describe('StatePersistence', () => {
  it('persists state, checkpoints, sessions, executions, and schedules through a runtime repository', async () => {
    const repository = createMockRuntimeRepository();
    const persistence = new StatePersistence({ repository });

    const first = await persistence.saveState('execution:1', {
      executionId: 'execution:1',
      phase: 'plan',
    });
    assert.equal(first.version, 1);

    const second = await persistence.saveState('execution:1', {
      executionId: 'execution:1',
      phase: 'execute',
    });
    assert.equal(second.version, 2);

    const current = await persistence.loadState('execution:1');
    assert.deepEqual(current, {
      executionId: 'execution:1',
      phase: 'execute',
    });

    const historical = await persistence.loadState('execution:1', { version: 1 });
    assert.deepEqual(historical, {
      executionId: 'execution:1',
      phase: 'plan',
    });

    const checkpoint = await persistence.checkpoint('execution:1', {
      executionId: 'execution:1',
      phase: 'execute',
    });
    assert.equal(checkpoint.key, 'execution:1');

    const checkpoints = await persistence.listCheckpoints('execution:1');
    assert.equal(checkpoints.length, 1);

    const restored = await persistence.restoreCheckpoint(checkpoints[0].id);
    assert.equal(restored.key, 'execution:1');

    const session = await persistence.trackProviderSession({
      id: 'session-1',
      provider: 'codex',
      agentName: 'operator',
      model: 'gpt-5.4-codex',
    });
    assert.equal(session.provider, 'codex');

    const execution = await persistence.trackAgentExecution({
      id: 'run-1',
      sessionId: 'session-1',
      provider: 'codex',
      agentName: 'operator',
      stateKey: 'execution:1',
      status: 'running',
    });
    assert.equal(execution.status, 'running');

    const schedule = await persistence.trackSchedule({
      id: 'schedule-1',
      expression: '*/5 * * * *',
      targetKey: 'execution:1',
    });
    assert.equal(schedule.targetKey, 'execution:1');

    const stats = await persistence.getStats();
    assert.equal(stats.states >= 1, true);
    assert.equal(stats.checkpoints >= 1, true);
    assert.equal(stats.providerSessions, 1);
    assert.equal(stats.executions, 1);
    assert.equal(stats.schedules, 1);
  });
});
