/**
 * @fileoverview Runtime persistence repository for operator/session state.
 * @module db/repositories/runtime
 */

import crypto from 'crypto';

const DEFAULT_LIMIT = 50;

function toJson(value, fallback = '{}') {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function parseJson(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * RuntimeRepository - Durable persistence for runtime state, checkpoints, sessions, and schedules.
 */
export class RuntimeRepository {
  /** @type {import('../connection/index.js').ConnectionPool} */
  #pool;

  /**
   * @param {import('../connection/index.js').ConnectionPool} pool
   */
  constructor(pool) {
    this.#pool = pool;
  }

  /**
   * Initialize compatibility hook.
   * The schema is created by migrations, so this is a no-op.
   * @returns {Promise<void>}
   */
  async initialize() {}

  /**
   * Save or update a state entry and append a version row.
   * @param {Object} record
   * @param {string} record.key
   * @param {Object} record.state
   * @param {number} [record.version]
   * @param {string} [record.checksum]
   * @param {string} [record.createdAt]
   * @param {string} [record.updatedAt]
   * @param {string|null} [record.expiresAt]
   * @param {Object} [record.metadata]
   * @param {string|null} [record.providerSessionId]
   * @param {string|null} [record.executionId]
   * @param {string|null} [record.scheduleId]
   * @param {string} [record.stateType]
   * @returns {Promise<Object>}
   */
  async saveState(record) {
    if (!record?.key) {
      throw new Error('State key is required');
    }

    return this.#pool.withTransaction(async (db) => {
      const existing = await this.#get(db, `
        SELECT * FROM runtime_state_entries WHERE state_key = ?
      `, [record.key]);

      const now = record.updatedAt || new Date().toISOString();
      const createdAt = existing?.created_at || record.createdAt || now;
      const version = Number.isInteger(record.version)
        ? record.version
        : (existing?.version || 0) + 1;

      const payload = {
        key: record.key,
        state: record.state ?? record.data,
        version,
        checksum: record.checksum || null,
        createdAt,
        updatedAt: now,
        expiresAt: record.expiresAt || null,
        metadata: record.metadata || {},
        providerSessionId: record.providerSessionId || existing?.provider_session_id || null,
        executionId: record.executionId || existing?.execution_id || null,
        scheduleId: record.scheduleId || existing?.schedule_id || null,
        stateType: record.stateType || existing?.state_type || 'runtime',
      };

      if (existing) {
        await this.#run(db, `
          UPDATE runtime_state_entries
          SET state_json = ?, version = ?, checksum = ?, created_at = ?, updated_at = ?,
              expires_at = ?, metadata_json = ?, provider_session_id = ?, execution_id = ?,
              schedule_id = ?, state_type = ?
          WHERE state_key = ?
        `, [
          toJson(payload.state),
          payload.version,
          payload.checksum,
          payload.createdAt,
          payload.updatedAt,
          payload.expiresAt,
          toJson(payload.metadata),
          payload.providerSessionId,
          payload.executionId,
          payload.scheduleId,
          payload.stateType,
          payload.key,
        ]);
      } else {
        await this.#run(db, `
          INSERT INTO runtime_state_entries (
            state_key, state_type, state_json, version, checksum, created_at, updated_at,
            expires_at, metadata_json, provider_session_id, execution_id, schedule_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          payload.key,
          payload.stateType,
          toJson(payload.state),
          payload.version,
          payload.checksum,
          payload.createdAt,
          payload.updatedAt,
          payload.expiresAt,
          toJson(payload.metadata),
          payload.providerSessionId,
          payload.executionId,
          payload.scheduleId,
        ]);
      }

      await this.#run(db, `
        INSERT INTO runtime_state_versions (
          state_key, version, state_json, checksum, created_at, metadata_json,
          provider_session_id, execution_id, schedule_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(state_key, version) DO UPDATE SET
          state_json = excluded.state_json,
          checksum = excluded.checksum,
          created_at = excluded.created_at,
          metadata_json = excluded.metadata_json,
          provider_session_id = excluded.provider_session_id,
          execution_id = excluded.execution_id,
          schedule_id = excluded.schedule_id
      `, [
        payload.key,
        payload.version,
        toJson(payload.state),
        payload.checksum,
        payload.createdAt,
        toJson(payload.metadata),
        payload.providerSessionId,
        payload.executionId,
        payload.scheduleId,
      ]);

      return this.getState(payload.key, { db });
    });
  }

  /**
   * Get current state entry.
   * @param {string} key
   * @param {Object} [options]
   * @param {import('sqlite3').Database} [options.db]
   * @returns {Promise<Object|null>}
   */
  async getState(key, options = {}) {
    const row = options.db
      ? await this.#get(options.db, `
        SELECT * FROM runtime_state_entries WHERE state_key = ?
      `, [key])
      : await this.#pool.get(`
        SELECT * FROM runtime_state_entries WHERE state_key = ?
      `, [key]);

    return this.#hydrateStateRow(row);
  }

  /**
   * Get a specific state version.
   * @param {string} key
   * @param {number} version
   * @returns {Promise<Object|null>}
   */
  async getStateVersion(key, version) {
    const row = await this.#pool.get(`
      SELECT * FROM runtime_state_versions
      WHERE state_key = ? AND version = ?
    `, [key, version]);

    return this.#hydrateVersionRow(row);
  }

  /**
   * List state entries.
   * @param {Object} [options]
   * @param {string} [options.prefix]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @returns {Promise<Object[]>}
   */
  async listStates(options = {}) {
    const { prefix, limit = DEFAULT_LIMIT, offset = 0 } = options;
    const params = [];
    let where = '';

    if (prefix) {
      where = ' WHERE state_key LIKE ?';
      params.push(`${prefix}%`);
    }

    params.push(limit, offset);
    const rows = await this.#pool.all(`
      SELECT * FROM runtime_state_entries${where}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `, params);

    return rows.map(row => this.#hydrateStateRow(row));
  }

  /**
   * Delete a state entry.
   * @param {string} key
   * @param {Object} [options]
   * @param {boolean} [options.cascade=true]
   * @returns {Promise<boolean>}
   */
  async deleteState(key, options = {}) {
    const cascade = options.cascade !== false;
    return this.#pool.withTransaction(async (db) => {
      if (cascade) {
        await this.#run(db, 'DELETE FROM runtime_checkpoints WHERE state_key = ?', [key]);
        await this.#run(db, 'DELETE FROM runtime_state_versions WHERE state_key = ?', [key]);
      }

      const result = await this.#run(db, 'DELETE FROM runtime_state_entries WHERE state_key = ?', [key]);
      return result.changes > 0;
    });
  }

  /**
   * Store a checkpoint snapshot.
   * @param {Object} record
   * @param {string} record.id
   * @param {string} record.key
   * @param {Object} record.state
   * @param {number} record.version
   * @param {string} [record.parentId]
   * @param {string} [record.checksum]
   * @param {string} [record.timestamp]
   * @param {Object} [record.metadata]
   * @param {string|null} [record.providerSessionId]
   * @param {string|null} [record.executionId]
   * @param {string|null} [record.scheduleId]
   * @returns {Promise<Object>}
   */
  async createCheckpoint(record) {
    if (!record?.id || !record?.key) {
      throw new Error('Checkpoint id and key are required');
    }

    await this.#pool.run(`
      INSERT INTO runtime_checkpoints (
        id, state_key, version, parent_id, state_json, checksum, created_at,
        metadata_json, provider_session_id, execution_id, schedule_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      record.id,
      record.key,
      record.version || 1,
      record.parentId || null,
      toJson(record.state ?? record.data),
      record.checksum || null,
      record.timestamp || new Date().toISOString(),
      toJson(record.metadata || {}),
      record.providerSessionId || null,
      record.executionId || null,
      record.scheduleId || null,
    ]);

    return this.getCheckpoint(record.id);
  }

  /**
   * Get checkpoint by id.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getCheckpoint(id) {
    const row = await this.#pool.get(`
      SELECT * FROM runtime_checkpoints WHERE id = ?
    `, [id]);

    return this.#hydrateCheckpointRow(row);
  }

  /**
   * List checkpoints for a state key.
   * @param {string} key
   * @param {Object} [options]
   * @param {number} [options.limit=50]
   * @returns {Promise<Object[]>}
   */
  async listCheckpoints(key, options = {}) {
    const rows = await this.#pool.all(`
      SELECT * FROM runtime_checkpoints
      WHERE state_key = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [key, options.limit || DEFAULT_LIMIT]);

    return rows.map(row => this.#hydrateCheckpointRow(row));
  }

  /**
   * Delete checkpoints for a state key.
   * @param {string} key
   * @param {Object} [options]
   * @param {string[]} [options.keepIds]
   * @returns {Promise<number>}
   */
  async deleteCheckpoints(key, options = {}) {
    const keepIds = options.keepIds || [];

    if (keepIds.length === 0) {
      const result = await this.#pool.run(`
        DELETE FROM runtime_checkpoints WHERE state_key = ?
      `, [key]);
      return result.changes || 0;
    }

    const placeholders = keepIds.map(() => '?').join(', ');
    const result = await this.#pool.run(`
      DELETE FROM runtime_checkpoints
      WHERE state_key = ? AND id NOT IN (${placeholders})
    `, [key, ...keepIds]);

    return result.changes || 0;
  }

  /**
   * Save or update a provider session.
   * @param {Object} record
   * @param {string} record.id
   * @param {string} record.provider
   * @returns {Promise<Object>}
   */
  async saveProviderSession(record) {
    if (!record?.id || !record?.provider) {
      throw new Error('Session id and provider are required');
    }

    const existing = await this.getProviderSession(record.id);
    const startedAt = existing?.startedAt || record.startedAt || new Date().toISOString();
    const lastSeenAt = record.lastSeenAt || new Date().toISOString();

    if (existing) {
      await this.#pool.run(`
        UPDATE runtime_provider_sessions
        SET provider = ?, provider_session_id = ?, agent_name = ?, model = ?, status = ?,
            started_at = ?, last_seen_at = ?, ended_at = ?, metadata_json = ?
        WHERE id = ?
      `, [
        record.provider,
        record.providerSessionId || null,
        record.agentName || null,
        record.model || null,
        record.status || existing.status,
        startedAt,
        lastSeenAt,
        record.endedAt || null,
        toJson(record.metadata || existing.metadata || {}),
        record.id,
      ]);
    } else {
      await this.#pool.run(`
        INSERT INTO runtime_provider_sessions (
          id, provider, provider_session_id, agent_name, model, status, started_at,
          last_seen_at, ended_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        record.id,
        record.provider,
        record.providerSessionId || null,
        record.agentName || null,
        record.model || null,
        record.status || 'active',
        startedAt,
        lastSeenAt,
        record.endedAt || null,
        toJson(record.metadata || {}),
      ]);
    }

    return this.getProviderSession(record.id);
  }

  /**
   * Get provider session.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getProviderSession(id) {
    const row = await this.#pool.get(`
      SELECT * FROM runtime_provider_sessions WHERE id = ?
    `, [id]);

    return this.#hydrateSessionRow(row);
  }

  /**
   * List provider sessions.
   * @param {Object} [options]
   * @param {string} [options.provider]
   * @param {string} [options.status]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @returns {Promise<Object[]>}
   */
  async listProviderSessions(options = {}) {
    const clauses = [];
    const params = [];

    if (options.provider) {
      clauses.push('provider = ?');
      params.push(options.provider);
    }

    if (options.status) {
      clauses.push('status = ?');
      params.push(options.status);
    }

    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    params.push(options.limit || DEFAULT_LIMIT, options.offset || 0);

    const rows = await this.#pool.all(`
      SELECT * FROM runtime_provider_sessions${where}
      ORDER BY last_seen_at DESC
      LIMIT ? OFFSET ?
    `, params);

    return rows.map(row => this.#hydrateSessionRow(row));
  }

  /**
   * Save or update an agent execution record.
   * @param {Object} record
   * @param {string} record.id
   * @returns {Promise<Object>}
   */
  async saveAgentExecution(record) {
    if (!record?.id) {
      throw new Error('Execution id is required');
    }

    const existing = await this.getAgentExecution(record.id);
    const startedAt = record.startedAt || existing?.startedAt || new Date().toISOString();
    const updatedAt = record.updatedAt || new Date().toISOString();

    if (existing) {
      await this.#pool.run(`
        UPDATE runtime_agent_executions
        SET session_id = ?, provider = ?, agent_name = ?, state_key = ?, schedule_id = ?,
            goal = ?, status = ?, phase = ?, input_json = ?, output_json = ?, error_message = ?,
            started_at = ?, updated_at = ?, completed_at = ?, metadata_json = ?
        WHERE id = ?
      `, [
        record.sessionId || null,
        record.provider || null,
        record.agentName || null,
        record.stateKey || null,
        record.scheduleId || null,
        record.goal || null,
        record.status || existing.status || 'queued',
        record.phase || existing.phase || null,
        toJson(record.input || existing.input || {}),
        record.output === undefined ? toJson(existing.output ?? null, 'null') : toJson(record.output, 'null'),
        record.errorMessage || null,
        startedAt,
        updatedAt,
        record.completedAt || null,
        toJson(record.metadata || existing.metadata || {}),
        record.id,
      ]);
    } else {
      await this.#pool.run(`
        INSERT INTO runtime_agent_executions (
          id, session_id, provider, agent_name, state_key, schedule_id, goal, status, phase,
          input_json, output_json, error_message, started_at, updated_at, completed_at,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        record.id,
        record.sessionId || null,
        record.provider || null,
        record.agentName || null,
        record.stateKey || null,
        record.scheduleId || null,
        record.goal || null,
        record.status || 'queued',
        record.phase || null,
        toJson(record.input || {}),
        record.output === undefined ? null : toJson(record.output, 'null'),
        record.errorMessage || null,
        startedAt,
        updatedAt,
        record.completedAt || null,
        toJson(record.metadata || {}),
      ]);
    }

    return this.getAgentExecution(record.id);
  }

  /**
   * Get an execution by id.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getAgentExecution(id) {
    const row = await this.#pool.get(`
      SELECT * FROM runtime_agent_executions WHERE id = ?
    `, [id]);

    return this.#hydrateExecutionRow(row);
  }

  /**
   * List executions.
   * @param {Object} [options]
   * @param {string} [options.sessionId]
   * @param {string} [options.status]
   * @param {string} [options.stateKey]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @returns {Promise<Object[]>}
   */
  async listAgentExecutions(options = {}) {
    const clauses = [];
    const params = [];

    if (options.sessionId) {
      clauses.push('session_id = ?');
      params.push(options.sessionId);
    }

    if (options.status) {
      clauses.push('status = ?');
      params.push(options.status);
    }

    if (options.stateKey) {
      clauses.push('state_key = ?');
      params.push(options.stateKey);
    }

    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    params.push(options.limit || DEFAULT_LIMIT, options.offset || 0);

    const rows = await this.#pool.all(`
      SELECT * FROM runtime_agent_executions${where}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `, params);

    return rows.map(row => this.#hydrateExecutionRow(row));
  }

  /**
   * Save or update a schedule.
   * @param {Object} record
   * @param {string} record.id
   * @returns {Promise<Object>}
   */
  async saveSchedule(record) {
    if (!record?.id) {
      throw new Error('Schedule id is required');
    }

    const existing = await this.getSchedule(record.id);
    const createdAt = existing?.createdAt || record.createdAt || new Date().toISOString();
    const updatedAt = record.updatedAt || new Date().toISOString();

    if (existing) {
      await this.#pool.run(`
        UPDATE runtime_schedules
        SET name = ?, schedule_type = ?, expression = ?, target_key = ?, provider = ?,
            status = ?, next_run_at = ?, last_run_at = ?, paused_at = ?, metadata_json = ?,
            created_at = ?, updated_at = ?
        WHERE id = ?
      `, [
        record.name || null,
        record.scheduleType || existing.scheduleType || 'cron',
        record.expression || existing.expression || '* * * * *',
        record.targetKey || null,
        record.provider || null,
        record.status || existing.status || 'active',
        record.nextRunAt || null,
        record.lastRunAt || null,
        record.pausedAt || null,
        toJson(record.metadata || existing.metadata || {}),
        createdAt,
        updatedAt,
        record.id,
      ]);
    } else {
      await this.#pool.run(`
        INSERT INTO runtime_schedules (
          id, name, schedule_type, expression, target_key, provider, status, next_run_at,
          last_run_at, paused_at, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        record.id,
        record.name || null,
        record.scheduleType || 'cron',
        record.expression || '* * * * *',
        record.targetKey || null,
        record.provider || null,
        record.status || 'active',
        record.nextRunAt || null,
        record.lastRunAt || null,
        record.pausedAt || null,
        toJson(record.metadata || {}),
        createdAt,
        updatedAt,
      ]);
    }

    return this.getSchedule(record.id);
  }

  /**
   * Get a schedule by id.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getSchedule(id) {
    const row = await this.#pool.get(`
      SELECT * FROM runtime_schedules WHERE id = ?
    `, [id]);

    return this.#hydrateScheduleRow(row);
  }

  /**
   * List schedules.
   * @param {Object} [options]
   * @param {string} [options.status]
   * @param {string} [options.targetKey]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @returns {Promise<Object[]>}
   */
  async listSchedules(options = {}) {
    const clauses = [];
    const params = [];

    if (options.status) {
      clauses.push('status = ?');
      params.push(options.status);
    }

    if (options.targetKey) {
      clauses.push('target_key = ?');
      params.push(options.targetKey);
    }

    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    params.push(options.limit || DEFAULT_LIMIT, options.offset || 0);

    const rows = await this.#pool.all(`
      SELECT * FROM runtime_schedules${where}
      ORDER BY next_run_at ASC, updated_at DESC
      LIMIT ? OFFSET ?
    `, params);

    return rows.map(row => this.#hydrateScheduleRow(row));
  }

  /**
   * Remove expired current states.
   * @param {string} [before]
   * @returns {Promise<number>}
   */
  async cleanupExpiredStates(before = new Date().toISOString()) {
    const expired = await this.#pool.all(`
      SELECT state_key FROM runtime_state_entries
      WHERE expires_at IS NOT NULL AND expires_at < ?
    `, [before]);

    let deleted = 0;
    for (const row of expired) {
      const removed = await this.deleteState(row.state_key, { cascade: true });
      if (removed) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Clear runtime persistence tables.
   * @returns {Promise<Object>}
   */
  async clear() {
    const stats = await this.getStats();

    await this.#pool.run('DELETE FROM runtime_checkpoints');
    await this.#pool.run('DELETE FROM runtime_state_versions');
    await this.#pool.run('DELETE FROM runtime_state_entries');
    await this.#pool.run('DELETE FROM runtime_agent_executions');
    await this.#pool.run('DELETE FROM runtime_provider_sessions');
    await this.#pool.run('DELETE FROM runtime_schedules');

    return {
      statesCleared: stats.states,
      versionsCleared: stats.versions,
      checkpointsCleared: stats.checkpoints,
      sessionsCleared: stats.providerSessions,
      executionsCleared: stats.executions,
      schedulesCleared: stats.schedules,
    };
  }

  /**
   * Get storage statistics.
   * @returns {Promise<Object>}
   */
  async getStats() {
    const [
      states,
      versions,
      checkpoints,
      sessions,
      executions,
      schedules,
      stateSize,
      checkpointSize,
    ] = await Promise.all([
      this.#pool.get(`SELECT COUNT(*) AS count FROM runtime_state_entries`),
      this.#pool.get(`SELECT COUNT(*) AS count FROM runtime_state_versions`),
      this.#pool.get(`SELECT COUNT(*) AS count FROM runtime_checkpoints`),
      this.#pool.get(`SELECT COUNT(*) AS count FROM runtime_provider_sessions`),
      this.#pool.get(`SELECT COUNT(*) AS count FROM runtime_agent_executions`),
      this.#pool.get(`SELECT COUNT(*) AS count FROM runtime_schedules`),
      this.#pool.get(`SELECT COALESCE(SUM(LENGTH(state_json)), 0) AS size FROM runtime_state_entries`),
      this.#pool.get(`SELECT COALESCE(SUM(LENGTH(state_json)), 0) AS size FROM runtime_checkpoints`),
    ]);

    return {
      states: states?.count || 0,
      versions: versions?.count || 0,
      checkpoints: checkpoints?.count || 0,
      providerSessions: sessions?.count || 0,
      executions: executions?.count || 0,
      schedules: schedules?.count || 0,
      keys: states?.count || 0,
      estimatedStateSize: stateSize?.size || 0,
      estimatedCheckpointSize: checkpointSize?.size || 0,
      totalEstimatedSize: (stateSize?.size || 0) + (checkpointSize?.size || 0),
    };
  }

  async #get(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(row);
      });
    });
  }

  async #run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }

        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  #hydrateStateRow(row) {
    if (!row) {
      return null;
    }

    return {
      key: row.state_key,
      stateType: row.state_type,
      data: parseJson(row.state_json, {}),
      version: row.version,
      checksum: row.checksum || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at || null,
      metadata: parseJson(row.metadata_json, {}),
      providerSessionId: row.provider_session_id || null,
      executionId: row.execution_id || null,
      scheduleId: row.schedule_id || null,
    };
  }

  #hydrateVersionRow(row) {
    if (!row) {
      return null;
    }

    return {
      key: row.state_key,
      data: parseJson(row.state_json, {}),
      version: row.version,
      checksum: row.checksum || null,
      createdAt: row.created_at,
      metadata: parseJson(row.metadata_json, {}),
      providerSessionId: row.provider_session_id || null,
      executionId: row.execution_id || null,
      scheduleId: row.schedule_id || null,
    };
  }

  #hydrateCheckpointRow(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      key: row.state_key,
      version: row.version,
      parentId: row.parent_id || null,
      state: parseJson(row.state_json, {}),
      checksum: row.checksum || null,
      timestamp: row.created_at,
      metadata: parseJson(row.metadata_json, {}),
      providerSessionId: row.provider_session_id || null,
      executionId: row.execution_id || null,
      scheduleId: row.schedule_id || null,
    };
  }

  #hydrateSessionRow(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      provider: row.provider,
      providerSessionId: row.provider_session_id || null,
      agentName: row.agent_name || null,
      model: row.model || null,
      status: row.status,
      startedAt: row.started_at,
      lastSeenAt: row.last_seen_at,
      endedAt: row.ended_at || null,
      metadata: parseJson(row.metadata_json, {}),
    };
  }

  #hydrateExecutionRow(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      sessionId: row.session_id || null,
      provider: row.provider || null,
      agentName: row.agent_name || null,
      stateKey: row.state_key || null,
      scheduleId: row.schedule_id || null,
      goal: row.goal || null,
      status: row.status,
      phase: row.phase || null,
      input: parseJson(row.input_json, {}),
      output: parseJson(row.output_json, null),
      errorMessage: row.error_message || null,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || null,
      metadata: parseJson(row.metadata_json, {}),
    };
  }

  #hydrateScheduleRow(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name || null,
      scheduleType: row.schedule_type,
      expression: row.expression,
      targetKey: row.target_key || null,
      provider: row.provider || null,
      status: row.status,
      nextRunAt: row.next_run_at || null,
      lastRunAt: row.last_run_at || null,
      pausedAt: row.paused_at || null,
      metadata: parseJson(row.metadata_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export function createRuntimeRepository(pool) {
  return new RuntimeRepository(pool);
}

export default RuntimeRepository;
