/**
 * @fileoverview State Persistence
 * Durable operator/runtime persistence with checkpoint and schedule tracking.
 * @module controllers/autonomous/persistence
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { z } from 'zod';
import { getRepositories, isInitialized as repositoriesInitialized } from '../../db/repositories/index.js';

const stateEntrySchema = z.object({
  key: z.string().min(1).max(256),
  data: z.record(z.any()),
  version: z.number().int().min(1).default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  checksum: z.string().optional(),
});

const checkpointSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1),
  state: z.record(z.any()),
  timestamp: z.string().datetime(),
  parentId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * StatePersistence
 */
export class StatePersistence extends EventEmitter {
  #states = new Map();
  #checkpoints = new Map();
  #keyCheckpoints = new Map();
  #sessions = new Map();
  #executions = new Map();
  #schedules = new Map();
  #config;
  #repository = null;

  constructor(config = {}) {
    super();

    this.#config = {
      maxCheckpoints: 100,
      enableEncryption: false,
      encryptionKey: null,
      validateChecksums: true,
      ttl: null,
      ...config,
    };

    if (this.#config.enableEncryption && !this.#config.encryptionKey) {
      throw new Error('Encryption key required when encryption is enabled');
    }

    this.#repository = config.repository || null;
    this.#startCleanupInterval();
  }

  async saveState(key, state, options = {}) {
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string');
    }

    if (!state || typeof state !== 'object') {
      throw new Error('State must be an object');
    }

    const now = new Date().toISOString();
    const existing = await this.#loadStateEntry(key);
    const serialized = this.#serialize(state);
    const entry = {
      key,
      data: serialized,
      state: serialized,
      version: options.version || (existing ? existing.version + 1 : 1),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      checksum: this.#calculateChecksum(state),
      expiresAt: options.expiresAt || existing?.expiresAt || null,
      metadata: options.metadata || (typeof state.metadata === 'object' ? state.metadata : {}),
      providerSessionId: options.providerSessionId || state.providerSessionId || existing?.providerSessionId || null,
      executionId: options.executionId || state.executionId || existing?.executionId || null,
      scheduleId: options.scheduleId || state.scheduleId || existing?.scheduleId || null,
      stateType: options.stateType || state.stateType || 'runtime',
    };

    const validation = stateEntrySchema.safeParse({
      key: entry.key,
      data: entry.data,
      version: entry.version,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      checksum: entry.checksum,
    });

    if (!validation.success) {
      throw new Error(`Invalid state: ${validation.error.message}`);
    }

    const repository = this.#getRepository();
    if (repository) {
      const saved = await repository.saveState(entry);
      this.#cacheState(saved, entry.data);
      this.emit('state:saved', { key, version: saved.version });

      if (options.createCheckpoint) {
        await this.checkpoint(key, state, { ...options.metadata, source: 'saveState' });
      }

      return { ...saved, data: state };
    }

    this.#states.set(key, entry);
    this.emit('state:saved', { key, version: entry.version });

    if (options.createCheckpoint) {
      await this.checkpoint(key, state, { ...options.metadata, source: 'saveState' });
    }

    return { ...entry, data: state };
  }

  async loadState(key, options = {}) {
    const entry = await this.#loadStateEntry(key, options.version);
    if (!entry) {
      return null;
    }

    if (this.#config.ttl) {
      const age = Date.now() - new Date(entry.updatedAt).getTime();
      if (age > this.#config.ttl) {
        await this.deleteState(key, { cascade: true });
        this.emit('state:expired', { key });
        return null;
      }
    }

    if (this.#config.validateChecksums && entry.checksum) {
      const currentChecksum = this.#calculateChecksum(entry.data);
      if (currentChecksum !== entry.checksum) {
        this.emit('state:corrupted', { key });
        throw new Error(`State corruption detected for key: ${key}`);
      }
    }

    this.#cacheState(entry, entry.data);
    this.emit('state:loaded', { key, version: entry.version });
    return this.#deserialize(entry.data);
  }

  hasState(key) {
    return this.#states.has(key);
  }

  async deleteState(key, options = {}) {
    const repository = this.#getRepository();
    if (repository) {
      const existed = await repository.deleteState(key, options);
      this.#states.delete(key);
      this.#deleteCheckpointCache(key, options);
      this.emit('state:deleted', { key });
      return existed;
    }

    const existed = this.#states.delete(key);
    if (existed) {
      this.emit('state:deleted', { key });

      if (options.cascade) {
        await this.deleteCheckpoints(key);
      }
    }

    return existed;
  }

  async checkpoint(key, state, metadata = {}) {
    const checkpointId = metadata.id || crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const current = state || (await this.loadState(key)) || {};
    const entry = await this.#loadStateEntry(key);

    const checkpoint = {
      id: checkpointId,
      key,
      version: entry?.version || 1,
      parentId: metadata.parentId,
      state: this.#serialize(current),
      timestamp,
      metadata,
      checksum: this.#calculateChecksum(current),
      providerSessionId: metadata.providerSessionId || entry?.providerSessionId || null,
      executionId: metadata.executionId || entry?.executionId || null,
      scheduleId: metadata.scheduleId || entry?.scheduleId || null,
    };

    const validation = checkpointSchema.safeParse({
      id: checkpoint.id,
      key: checkpoint.key,
      state: checkpoint.state,
      timestamp: checkpoint.timestamp,
      parentId: checkpoint.parentId,
      metadata: checkpoint.metadata,
    });

    if (!validation.success) {
      throw new Error(`Invalid checkpoint: ${validation.error.message}`);
    }

    const repository = this.#getRepository();
    if (repository) {
      const saved = await repository.createCheckpoint(checkpoint);
      this.#cacheCheckpoint(saved);
      this.#cacheCheckpointKey(key, saved.id);
      await this.#enforceMaxCheckpoints(key);
      this.emit('checkpoint:created', { id: saved.id, key });
      return { ...saved, state: current };
    }

    this.#checkpoints.set(checkpointId, checkpoint);
    this.#cacheCheckpointKey(key, checkpointId);
    this.#enforceMaxCheckpoints(key);
    this.emit('checkpoint:created', { id: checkpointId, key });
    return { ...checkpoint, state: current };
  }

  async restoreCheckpoint(checkpointId) {
    const checkpoint = await this.getCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint '${checkpointId}' not found`);
    }

    const restoredState = this.#deserialize(checkpoint.state);
    await this.saveState(checkpoint.key, restoredState, {
      providerSessionId: checkpoint.providerSessionId || undefined,
      executionId: checkpoint.executionId || undefined,
      scheduleId: checkpoint.scheduleId || undefined,
    });

    this.emit('checkpoint:restored', { id: checkpointId, key: checkpoint.key });
    return {
      checkpointId,
      key: checkpoint.key,
      state: restoredState,
      restoredAt: new Date().toISOString(),
    };
  }

  async listCheckpoints(key, options = {}) {
    const repository = this.#getRepository();
    if (repository) {
      return repository.listCheckpoints(key, options);
    }

    const checkpointIds = this.#keyCheckpoints.get(key);
    if (!checkpointIds) {
      return [];
    }

    const limit = options.limit || 50;
    return Array.from(checkpointIds)
      .map(id => this.#checkpoints.get(id))
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit)
      .map(cp => ({ ...cp, state: this.#deserialize(cp.state) }));
  }

  async deleteCheckpoints(key, options = {}) {
    const repository = this.#getRepository();
    if (repository) {
      const deleted = await repository.deleteCheckpoints(key, options);
      this.#deleteCheckpointCache(key, options);
      if (deleted > 0) {
        this.emit('checkpoints:deleted', { key, count: deleted });
      }
      return deleted;
    }

    const checkpointIds = this.#keyCheckpoints.get(key);
    if (!checkpointIds) {
      return 0;
    }

    const keepIds = new Set(options.keepIds || []);
    let deleted = 0;

    for (const id of checkpointIds) {
      if (!keepIds.has(id)) {
        this.#checkpoints.delete(id);
        deleted++;
      }
    }

    this.#deleteCheckpointCache(key, options);

    if (deleted > 0) {
      this.emit('checkpoints:deleted', { key, count: deleted });
    }

    return deleted;
  }

  async getCheckpoint(checkpointId) {
    const repository = this.#getRepository();
    if (repository) {
      const checkpoint = await repository.getCheckpoint(checkpointId);
      if (checkpoint) {
        this.#cacheCheckpoint(checkpoint);
        this.#cacheCheckpointKey(checkpoint.key, checkpoint.id);
      }
      return checkpoint;
    }

    const checkpoint = this.#checkpoints.get(checkpointId);
    if (!checkpoint) {
      return null;
    }
    return { ...checkpoint, state: this.#deserialize(checkpoint.state) };
  }

  async clear() {
    const repository = this.#getRepository();
    if (repository) {
      const result = await repository.clear();
      this.#states.clear();
      this.#checkpoints.clear();
      this.#keyCheckpoints.clear();
      this.#sessions.clear();
      this.#executions.clear();
      this.#schedules.clear();
      this.emit('storage:cleared', result);
      return result;
    }

    const stateCount = this.#states.size;
    const checkpointCount = this.#checkpoints.size;

    this.#states.clear();
    this.#checkpoints.clear();
    this.#keyCheckpoints.clear();
    this.#sessions.clear();
    this.#executions.clear();
    this.#schedules.clear();

    this.emit('storage:cleared', { states: stateCount, checkpoints: checkpointCount });

    return {
      statesCleared: stateCount,
      checkpointsCleared: checkpointCount,
    };
  }

  async cleanupExpired() {
    const repository = this.#getRepository();
    if (repository) {
      return repository.cleanupExpiredStates();
    }

    if (!this.#config.ttl) {
      return 0;
    }

    const now = Date.now();
    let deleted = 0;

    for (const [key, entry] of this.#states) {
      const age = now - new Date(entry.updatedAt).getTime();
      if (age > this.#config.ttl) {
        this.#states.delete(key);
        deleted++;
        this.emit('state:expired', { key });
      }
    }

    return deleted;
  }

  async getStats() {
    const repository = this.#getRepository();
    if (repository) {
      return repository.getStats();
    }

    let totalStateSize = 0;
    for (const entry of this.#states.values()) {
      totalStateSize += JSON.stringify(entry.data).length;
    }

    let totalCheckpointSize = 0;
    for (const cp of this.#checkpoints.values()) {
      totalCheckpointSize += JSON.stringify(cp.state).length;
    }

    return {
      states: this.#states.size,
      checkpoints: this.#checkpoints.size,
      keys: this.#keyCheckpoints.size,
      estimatedStateSize: totalStateSize,
      estimatedCheckpointSize: totalCheckpointSize,
      totalEstimatedSize: totalStateSize + totalCheckpointSize,
    };
  }

  async trackProviderSession(session = {}) {
    const record = {
      id: session.id || crypto.randomUUID(),
      provider: session.provider || 'unknown',
      providerSessionId: session.providerSessionId || null,
      agentName: session.agentName || null,
      model: session.model || null,
      status: session.status || 'active',
      startedAt: session.startedAt || new Date().toISOString(),
      lastSeenAt: session.lastSeenAt || new Date().toISOString(),
      endedAt: session.endedAt || null,
      metadata: session.metadata || {},
    };

    const repository = this.#getRepository();
    const saved = repository
      ? await repository.saveProviderSession(record)
      : this.#saveSessionFallback(record);

    this.#sessions.set(saved.id, saved);
    this.emit('session:tracked', { id: saved.id, provider: saved.provider });
    return saved;
  }

  async getProviderSession(id) {
    const repository = this.#getRepository();
    if (repository) {
      return repository.getProviderSession(id);
    }

    return this.#sessions.get(id) || null;
  }

  async listProviderSessions(options = {}) {
    const repository = this.#getRepository();
    if (repository) {
      return repository.listProviderSessions(options);
    }

    return Array.from(this.#sessions.values())
      .filter(session => !options.provider || session.provider === options.provider)
      .filter(session => !options.status || session.status === options.status)
      .slice(0, options.limit || 50);
  }

  async trackAgentExecution(execution = {}) {
    const record = {
      id: execution.id || crypto.randomUUID(),
      sessionId: execution.sessionId || null,
      provider: execution.provider || null,
      agentName: execution.agentName || null,
      stateKey: execution.stateKey || null,
      scheduleId: execution.scheduleId || null,
      goal: execution.goal || null,
      status: execution.status || 'queued',
      phase: execution.phase || null,
      input: execution.input || {},
      output: execution.output === undefined ? null : execution.output,
      errorMessage: execution.errorMessage || null,
      startedAt: execution.startedAt || new Date().toISOString(),
      updatedAt: execution.updatedAt || new Date().toISOString(),
      completedAt: execution.completedAt || null,
      metadata: execution.metadata || {},
    };

    const repository = this.#getRepository();
    const saved = repository
      ? await repository.saveAgentExecution(record)
      : this.#saveExecutionFallback(record);

    this.#executions.set(saved.id, saved);
    this.emit('execution:tracked', { id: saved.id, status: saved.status });
    return saved;
  }

  async getAgentExecution(id) {
    const repository = this.#getRepository();
    if (repository) {
      return repository.getAgentExecution(id);
    }

    return this.#executions.get(id) || null;
  }

  async listAgentExecutions(options = {}) {
    const repository = this.#getRepository();
    if (repository) {
      return repository.listAgentExecutions(options);
    }

    return Array.from(this.#executions.values())
      .filter(execution => !options.sessionId || execution.sessionId === options.sessionId)
      .filter(execution => !options.status || execution.status === options.status)
      .filter(execution => !options.stateKey || execution.stateKey === options.stateKey)
      .slice(0, options.limit || 50);
  }

  async trackSchedule(schedule = {}) {
    const record = {
      id: schedule.id || crypto.randomUUID(),
      name: schedule.name || null,
      scheduleType: schedule.scheduleType || 'cron',
      expression: schedule.expression || '* * * * *',
      targetKey: schedule.targetKey || null,
      provider: schedule.provider || null,
      status: schedule.status || 'active',
      nextRunAt: schedule.nextRunAt || null,
      lastRunAt: schedule.lastRunAt || null,
      pausedAt: schedule.pausedAt || null,
      metadata: schedule.metadata || {},
      createdAt: schedule.createdAt || new Date().toISOString(),
      updatedAt: schedule.updatedAt || new Date().toISOString(),
    };

    const repository = this.#getRepository();
    const saved = repository
      ? await repository.saveSchedule(record)
      : this.#saveScheduleFallback(record);

    this.#schedules.set(saved.id, saved);
    this.emit('schedule:tracked', { id: saved.id, status: saved.status });
    return saved;
  }

  async getSchedule(id) {
    const repository = this.#getRepository();
    if (repository) {
      return repository.getSchedule(id);
    }

    return this.#schedules.get(id) || null;
  }

  async listSchedules(options = {}) {
    const repository = this.#getRepository();
    if (repository) {
      return repository.listSchedules(options);
    }

    return Array.from(this.#schedules.values())
      .filter(schedule => !options.status || schedule.status === options.status)
      .filter(schedule => !options.targetKey || schedule.targetKey === options.targetKey)
      .slice(0, options.limit || 50);
  }

  async saveProviderSession(session) {
    return this.trackProviderSession(session);
  }

  async saveAgentExecution(execution) {
    return this.trackAgentExecution(execution);
  }

  async saveSchedule(schedule) {
    return this.trackSchedule(schedule);
  }

  #getRepository() {
    if (this.#repository) {
      return this.#repository;
    }

    if (!repositoriesInitialized()) {
      return null;
    }

    try {
      const repositories = getRepositories();
      this.#repository = repositories.runtime || null;
    } catch {
      this.#repository = null;
    }

    return this.#repository;
  }

  async #loadStateEntry(key, version) {
    const repository = this.#getRepository();
    if (repository) {
      const entry = version
        ? await repository.getStateVersion(key, version)
        : await repository.getState(key);

      if (!entry) {
        return null;
      }

      return {
        key: entry.key,
        data: entry.data,
        version: entry.version,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt || entry.createdAt,
        checksum: entry.checksum || null,
        expiresAt: entry.expiresAt || null,
        metadata: entry.metadata || {},
        providerSessionId: entry.providerSessionId || null,
        executionId: entry.executionId || null,
        scheduleId: entry.scheduleId || null,
        stateType: entry.stateType || 'runtime',
      };
    }

    const entry = this.#states.get(key);
    if (!entry) {
      return null;
    }

    if (version && entry.version !== version) {
      return null;
    }

    return entry;
  }

  #cacheState(entry, data) {
    if (!entry) {
      return;
    }

    this.#states.set(entry.key, {
      key: entry.key,
      data: data || entry.data,
      version: entry.version,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      checksum: entry.checksum || null,
      expiresAt: entry.expiresAt || null,
      metadata: entry.metadata || {},
      providerSessionId: entry.providerSessionId || null,
      executionId: entry.executionId || null,
      scheduleId: entry.scheduleId || null,
      stateType: entry.stateType || 'runtime',
    });
  }

  #cacheCheckpoint(checkpoint) {
    if (!checkpoint) {
      return;
    }

    this.#checkpoints.set(checkpoint.id, {
      ...checkpoint,
      state: checkpoint.state,
    });
  }

  #cacheCheckpointKey(key, id) {
    if (!this.#keyCheckpoints.has(key)) {
      this.#keyCheckpoints.set(key, new Set());
    }
    this.#keyCheckpoints.get(key).add(id);
  }

  #deleteCheckpointCache(key, options = {}) {
    const checkpointIds = this.#keyCheckpoints.get(key);
    if (!checkpointIds) {
      return;
    }

    const keepIds = new Set(options.keepIds || []);
    const remaining = [];
    for (const id of checkpointIds) {
      if (keepIds.has(id)) {
        remaining.push(id);
        continue;
      }

      this.#checkpoints.delete(id);
    }

    if (remaining.length === 0) {
      this.#keyCheckpoints.delete(key);
    } else {
      this.#keyCheckpoints.set(key, new Set(remaining));
    }
  }

  async #enforceMaxCheckpoints(key) {
    const repository = this.#getRepository();
    if (repository) {
      const checkpoints = await repository.listCheckpoints(key, { limit: this.#config.maxCheckpoints + 1 });
      if (checkpoints.length <= this.#config.maxCheckpoints) {
        return;
      }

      const keepIds = checkpoints
        .slice(0, this.#config.maxCheckpoints)
        .map(checkpoint => checkpoint.id);

      await repository.deleteCheckpoints(key, { keepIds });
      return;
    }

    const checkpointIds = this.#keyCheckpoints.get(key);
    if (!checkpointIds || checkpointIds.size <= this.#config.maxCheckpoints) {
      return;
    }

    const sortedIds = Array.from(checkpointIds)
      .map(id => ({ id, cp: this.#checkpoints.get(id) }))
      .filter(item => item.cp)
      .sort((a, b) => new Date(a.cp.timestamp) - new Date(b.cp.timestamp));

    const toDelete = sortedIds.slice(0, sortedIds.length - this.#config.maxCheckpoints);
    for (const item of toDelete) {
      this.#checkpoints.delete(item.id);
      checkpointIds.delete(item.id);
    }

    if (checkpointIds.size === 0) {
      this.#keyCheckpoints.delete(key);
    }
  }

  #saveSessionFallback(record) {
    const current = this.#sessions.get(record.id);
    const saved = {
      ...record,
      metadata: clone(record.metadata || current?.metadata || {}),
      status: record.status || current?.status || 'active',
      startedAt: current?.startedAt || record.startedAt,
      lastSeenAt: record.lastSeenAt || new Date().toISOString(),
    };

    this.#sessions.set(saved.id, saved);
    return saved;
  }

  #saveExecutionFallback(record) {
    const current = this.#executions.get(record.id);
    const saved = {
      ...record,
      input: clone(record.input || current?.input || {}),
      output: record.output === undefined ? current?.output ?? null : clone(record.output),
      metadata: clone(record.metadata || current?.metadata || {}),
      status: record.status || current?.status || 'queued',
      startedAt: current?.startedAt || record.startedAt,
      updatedAt: record.updatedAt || new Date().toISOString(),
    };

    this.#executions.set(saved.id, saved);
    return saved;
  }

  #saveScheduleFallback(record) {
    const current = this.#schedules.get(record.id);
    const saved = {
      ...record,
      metadata: clone(record.metadata || current?.metadata || {}),
      status: record.status || current?.status || 'active',
      createdAt: current?.createdAt || record.createdAt,
      updatedAt: record.updatedAt || new Date().toISOString(),
    };

    this.#schedules.set(saved.id, saved);
    return saved;
  }

  #calculateChecksum(state) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(state));
    return hash.digest('hex');
  }

  #serialize(state) {
    const serialized = clone(state);

    if (this.#config.enableEncryption) {
      return this.#encrypt(serialized);
    }

    return serialized;
  }

  #deserialize(data) {
    if (this.#config.enableEncryption && data?.__encrypted) {
      return this.#decrypt(data);
    }

    return clone(data);
  }

  #encrypt(data) {
    const key = crypto.scryptSync(this.#config.encryptionKey, 'state-persistence', 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final(),
    ]);

    return {
      __encrypted: true,
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
      data: encrypted.toString('hex'),
    };
  }

  #decrypt(encrypted) {
    const key = crypto.scryptSync(this.#config.encryptionKey, 'state-persistence', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted.data, 'hex')),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  #startCleanupInterval() {
    if (!this.#config.ttl) {
      return;
    }

    setInterval(() => {
      void this.cleanupExpired();
    }, Math.min(this.#config.ttl / 10, 60000));
  }
}

export default StatePersistence;
