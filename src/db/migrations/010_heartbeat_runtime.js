/**
 * @fileoverview Heartbeat Runtime Schema Migration
 * Creates tables for agent heartbeat runs, sessions, wakeup requests, and cost tracking.
 * Inspired by Paperclip's heartbeat system.
 * @module db/migrations/010_heartbeat_runtime
 */

/**
 * Apply heartbeat runtime schema
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.exec(`
    -- ============================================
    -- HEARTBEAT_RUNS - Core run tracking
    -- ============================================
    CREATE TABLE IF NOT EXISTS heartbeat_runs (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      agent_id TEXT NOT NULL,
      invocation_source TEXT CHECK (invocation_source IN ('timer', 'assignment', 'on_demand', 'automation')),
      trigger_detail TEXT CHECK (trigger_detail IN ('manual', 'ping', 'callback', 'system')),
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out')),
      started_at DATETIME,
      finished_at DATETIME,
      error TEXT,
      error_code TEXT,
      wakeup_request_id TEXT,
      exit_code INTEGER,
      signal TEXT,
      usage_json TEXT DEFAULT '{}',
      result_json TEXT,
      session_id_before TEXT,
      session_id_after TEXT,
      context_snapshot TEXT DEFAULT '{}',
      log_store TEXT,
      log_ref TEXT,
      log_bytes INTEGER DEFAULT 0,
      log_sha256 TEXT,
      log_compressed BOOLEAN DEFAULT 0,
      stdout_excerpt TEXT,
      stderr_excerpt TEXT,
      process_pid INTEGER,
      process_started_at DATETIME,
      retry_of_run_id TEXT,
      process_loss_retry_count INTEGER DEFAULT 0,
      external_run_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES runtime_provider_sessions(id) ON DELETE CASCADE,
      -- Note: Foreign key to agent_wakeup_requests omitted - table created later in this migration
      FOREIGN KEY (retry_of_run_id) REFERENCES heartbeat_runs(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_agent ON heartbeat_runs(agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_status ON heartbeat_runs(status, agent_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_wakeup ON heartbeat_runs(wakeup_request_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_retry ON heartbeat_runs(retry_of_run_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_external ON heartbeat_runs(external_run_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_session_before ON heartbeat_runs(session_id_before);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_session_after ON heartbeat_runs(session_id_after);

    -- ============================================
    -- HEARTBEAT_RUN_EVENTS - Event log for runs
    -- ============================================
    CREATE TABLE IF NOT EXISTS heartbeat_run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      stream TEXT CHECK (stream IN ('system', 'stdout', 'stderr')),
      level TEXT CHECK (level IN ('info', 'warn', 'error')),
      color TEXT,
      message TEXT,
      payload TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES heartbeat_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES runtime_provider_sessions(id) ON DELETE CASCADE,
      UNIQUE(run_id, seq)
    );

    CREATE INDEX IF NOT EXISTS idx_heartbeat_events_run ON heartbeat_run_events(run_id, seq);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_events_agent ON heartbeat_run_events(agent_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_events_type ON heartbeat_run_events(event_type, created_at);

    -- ============================================
    -- AGENT_SESSIONS - Per-task session persistence
    -- ============================================
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      agent_id TEXT NOT NULL,
      task_key TEXT NOT NULL,
      provider TEXT CHECK (provider IN ('claude', 'kimi', 'codex', 'cursor', 'gemini', 'other')),
      session_params_json TEXT DEFAULT '{}',
      session_display_id TEXT,
      last_run_id TEXT,
      last_error TEXT,
      run_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cached_input_tokens INTEGER DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES runtime_provider_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (last_run_id) REFERENCES heartbeat_runs(id) ON DELETE SET NULL,
      UNIQUE(agent_id, task_key, provider)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_task ON agent_sessions(task_key);
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_provider ON agent_sessions(agent_id, provider);
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_run ON agent_sessions(last_run_id);

    -- ============================================
    -- AGENT_WAKEUP_REQUESTS - Wakeup queue
    -- ============================================
    CREATE TABLE IF NOT EXISTS agent_wakeup_requests (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      agent_id TEXT NOT NULL,
      source TEXT CHECK (source IN ('timer', 'assignment', 'on_demand', 'automation')),
      trigger_detail TEXT CHECK (trigger_detail IN ('manual', 'ping', 'callback', 'system')),
      reason TEXT,
      payload TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'claimed', 'completed', 'failed', 'deferred_issue_execution')),
      run_id TEXT,
      requested_by_type TEXT CHECK (requested_by_type IN ('user', 'agent', 'system')),
      requested_by_id TEXT,
      idempotency_key TEXT,
      requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      claimed_at DATETIME,
      finished_at DATETIME,
      error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES runtime_provider_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (run_id) REFERENCES heartbeat_runs(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_wakeup_requests_agent ON agent_wakeup_requests(agent_id, status, requested_at);
    CREATE INDEX IF NOT EXISTS idx_wakeup_requests_status ON agent_wakeup_requests(status, requested_at);
    CREATE INDEX IF NOT EXISTS idx_wakeup_requests_run ON agent_wakeup_requests(run_id);
    CREATE INDEX IF NOT EXISTS idx_wakeup_requests_idempotency ON agent_wakeup_requests(idempotency_key) WHERE idempotency_key IS NOT NULL;

    -- ============================================
    -- AGENT_RUNTIME_STATE - Current state per agent
    -- ============================================
    CREATE TABLE IF NOT EXISTS agent_runtime_state (
      agent_id TEXT PRIMARY KEY,
      provider TEXT CHECK (provider IN ('claude', 'kimi', 'codex', 'cursor', 'gemini', 'other')),
      session_id TEXT,
      last_run_id TEXT,
      last_run_status TEXT,
      last_error TEXT,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cached_input_tokens INTEGER DEFAULT 0,
      total_cost_cents INTEGER DEFAULT 0,
      state_json TEXT DEFAULT '{}',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES runtime_provider_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (last_run_id) REFERENCES heartbeat_runs(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_state_run ON agent_runtime_state(last_run_id);

    -- ============================================
    -- COST_LEDGER - Cost tracking per run
    -- ============================================
    CREATE TABLE IF NOT EXISTS cost_ledger (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      run_id TEXT,
      agent_id TEXT NOT NULL,
      task_id TEXT,
      project_id TEXT,
      provider TEXT NOT NULL,
      biller TEXT NOT NULL DEFAULT 'unknown',
      billing_type TEXT CHECK (billing_type IN ('metered_api', 'subscription_included', 'subscription_overage', 'credits', 'fixed', 'unknown')),
      model TEXT DEFAULT 'unknown',
      input_tokens INTEGER DEFAULT 0,
      cached_input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost_cents INTEGER DEFAULT 0,
      occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT DEFAULT '{}',
      FOREIGN KEY (run_id) REFERENCES heartbeat_runs(id) ON DELETE SET NULL,
      FOREIGN KEY (agent_id) REFERENCES runtime_provider_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cost_ledger_run ON cost_ledger(run_id);
    CREATE INDEX IF NOT EXISTS idx_cost_ledger_agent ON cost_ledger(agent_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_cost_ledger_task ON cost_ledger(task_id);
    CREATE INDEX IF NOT EXISTS idx_cost_ledger_project ON cost_ledger(project_id);
    CREATE INDEX IF NOT EXISTS idx_cost_ledger_occurred ON cost_ledger(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_cost_ledger_provider ON cost_ledger(provider, occurred_at);

    -- ============================================
    -- Update triggers
    -- ============================================
    CREATE TRIGGER IF NOT EXISTS trg_heartbeat_runs_updated_at
    AFTER UPDATE ON heartbeat_runs
    FOR EACH ROW
    BEGIN
      UPDATE heartbeat_runs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_agent_sessions_updated_at
    AFTER UPDATE ON agent_sessions
    FOR EACH ROW
    BEGIN
      UPDATE agent_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_agent_wakeup_requests_updated_at
    AFTER UPDATE ON agent_wakeup_requests
    FOR EACH ROW
    BEGIN
      UPDATE agent_wakeup_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_agent_runtime_state_updated_at
    AFTER UPDATE ON agent_runtime_state
    FOR EACH ROW
    BEGIN
      UPDATE agent_runtime_state SET updated_at = CURRENT_TIMESTAMP WHERE agent_id = NEW.agent_id;
    END;
  `);
}

/**
 * Rollback heartbeat runtime schema
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_agent_runtime_state_updated_at;
    DROP TRIGGER IF EXISTS trg_agent_wakeup_requests_updated_at;
    DROP TRIGGER IF EXISTS trg_agent_sessions_updated_at;
    DROP TRIGGER IF EXISTS trg_heartbeat_runs_updated_at;

    DROP TABLE IF EXISTS cost_ledger;
    DROP TABLE IF EXISTS agent_runtime_state;
    DROP TABLE IF EXISTS agent_wakeup_requests;
    DROP TABLE IF EXISTS agent_sessions;
    DROP TABLE IF EXISTS heartbeat_run_events;
    DROP TABLE IF EXISTS heartbeat_runs;
  `);
}
