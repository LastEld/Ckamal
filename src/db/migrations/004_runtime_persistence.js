/**
 * Runtime persistence schema for operator/session state.
 */

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_state_entries (
      state_key TEXT PRIMARY KEY,
      state_type TEXT NOT NULL DEFAULT 'runtime',
      state_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      checksum TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      provider_session_id TEXT,
      execution_id TEXT,
      schedule_id TEXT
    );

    CREATE TABLE IF NOT EXISTS runtime_state_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_key TEXT NOT NULL,
      version INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      checksum TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      provider_session_id TEXT,
      execution_id TEXT,
      schedule_id TEXT,
      UNIQUE(state_key, version)
    );

    CREATE TABLE IF NOT EXISTS runtime_checkpoints (
      id TEXT PRIMARY KEY,
      state_key TEXT NOT NULL,
      version INTEGER NOT NULL,
      parent_id TEXT,
      state_json TEXT NOT NULL,
      checksum TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      provider_session_id TEXT,
      execution_id TEXT,
      schedule_id TEXT,
      FOREIGN KEY (parent_id) REFERENCES runtime_checkpoints(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_provider_sessions (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_session_id TEXT,
      agent_name TEXT,
      model TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'paused', 'closed', 'error')),
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS runtime_agent_executions (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      provider TEXT,
      agent_name TEXT,
      state_key TEXT,
      schedule_id TEXT,
      goal TEXT,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'retrying')),
      phase TEXT,
      input_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT,
      error_message TEXT,
      started_at DATETIME,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (session_id) REFERENCES runtime_provider_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (state_key) REFERENCES runtime_state_entries(state_key) ON DELETE SET NULL,
      FOREIGN KEY (schedule_id) REFERENCES runtime_schedules(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS runtime_schedules (
      id TEXT PRIMARY KEY,
      name TEXT,
      schedule_type TEXT NOT NULL DEFAULT 'cron',
      expression TEXT NOT NULL,
      target_key TEXT,
      provider TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'failed')),
      next_run_at DATETIME,
      last_run_at DATETIME,
      paused_at DATETIME,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_state_updated
      ON runtime_state_entries(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_runtime_state_expiry
      ON runtime_state_entries(expires_at)
      WHERE expires_at IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_runtime_state_version
      ON runtime_state_versions(state_key, version DESC);

    CREATE INDEX IF NOT EXISTS idx_runtime_checkpoint_key
      ON runtime_checkpoints(state_key, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_runtime_session_provider
      ON runtime_provider_sessions(provider, status, last_seen_at DESC);

    CREATE INDEX IF NOT EXISTS idx_runtime_execution_session
      ON runtime_agent_executions(session_id, status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_runtime_execution_state
      ON runtime_agent_executions(state_key, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_runtime_execution_schedule
      ON runtime_agent_executions(schedule_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_runtime_schedule_status
      ON runtime_schedules(status, next_run_at ASC);

    CREATE INDEX IF NOT EXISTS idx_runtime_schedule_target
      ON runtime_schedules(target_key, status);

    CREATE TRIGGER IF NOT EXISTS trg_runtime_state_entries_updated_at
    AFTER UPDATE ON runtime_state_entries
    FOR EACH ROW
    BEGIN
      UPDATE runtime_state_entries
      SET updated_at = CURRENT_TIMESTAMP
      WHERE state_key = NEW.state_key;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_runtime_provider_sessions_updated_at
    AFTER UPDATE ON runtime_provider_sessions
    FOR EACH ROW
    BEGIN
      UPDATE runtime_provider_sessions
      SET last_seen_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_runtime_agent_executions_updated_at
    AFTER UPDATE ON runtime_agent_executions
    FOR EACH ROW
    BEGIN
      UPDATE runtime_agent_executions
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_runtime_schedules_updated_at
    AFTER UPDATE ON runtime_schedules
    FOR EACH ROW
    BEGIN
      UPDATE runtime_schedules
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);
}

export function down(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_runtime_schedules_updated_at;
    DROP TRIGGER IF EXISTS trg_runtime_agent_executions_updated_at;
    DROP TRIGGER IF EXISTS trg_runtime_provider_sessions_updated_at;
    DROP TRIGGER IF EXISTS trg_runtime_state_entries_updated_at;

    DROP TABLE IF EXISTS runtime_agent_executions;
    DROP TABLE IF EXISTS runtime_schedules;
    DROP TABLE IF EXISTS runtime_checkpoints;
    DROP TABLE IF EXISTS runtime_state_versions;
    DROP TABLE IF EXISTS runtime_provider_sessions;
    DROP TABLE IF EXISTS runtime_state_entries;
  `);
}
