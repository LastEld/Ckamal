/**
 * @fileoverview Migration 014: Routine Scheduling System
 * @module db/migrations/014_routine_scheduling
 * @description Creates tables for cron-like routine scheduling based on Paperclip patterns
 * @version 5.0.0
 */

/**
 * Migration configuration
 * @typedef {Object} MigrationConfig
 * @property {string} name - Migration name
 * @property {number} version - Migration version
 */
export const config = {
  name: 'routine_scheduling',
  version: 14
};

/**
 * SQL statements for creating routine scheduling tables
 * @type {string[]}
 */
const UP_MIGRATION = `
-- =====================================================
-- Routine Scheduling System
-- Based on Paperclip's routines schema
-- =====================================================

-- Routines table: Defines scheduled tasks
CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id TEXT NOT NULL,
  project_id TEXT,
  goal_id TEXT,
  parent_issue_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  assignee_agent_id TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  concurrency_policy TEXT NOT NULL DEFAULT 'coalesce_if_active' CHECK (concurrency_policy IN ('allow_multiple', 'skip_if_active', 'coalesce_if_active')),
  catch_up_policy TEXT NOT NULL DEFAULT 'skip_missed' CHECK (catch_up_policy IN ('skip_missed', 'run_once', 'run_all_missed')),
  max_retries INTEGER NOT NULL DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 3600,
  created_by_agent_id TEXT,
  created_by_user_id TEXT,
  updated_by_agent_id TEXT,
  updated_by_user_id TEXT,
  last_triggered_at DATETIME,
  last_enqueued_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  -- Note: Foreign keys to projects, goals, agents omitted - tables may not exist
  FOREIGN KEY (parent_issue_id) REFERENCES issues(id) ON DELETE SET NULL
);

-- Indexes for routines table
CREATE INDEX IF NOT EXISTS idx_routines_company_status ON routines(company_id, status);
CREATE INDEX IF NOT EXISTS idx_routines_company_assignee ON routines(company_id, assignee_agent_id);
CREATE INDEX IF NOT EXISTS idx_routines_company_project ON routines(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_routines_status_triggered ON routines(status, last_triggered_at);

-- =====================================================
-- Routine Triggers Table
-- Defines when and how routines are triggered
-- =====================================================

CREATE TABLE IF NOT EXISTS routine_triggers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id TEXT NOT NULL,
  routine_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cron', 'webhook', 'event', 'manual')),
  label TEXT,
  enabled BOOLEAN NOT NULL DEFAULT 1,
  cron_expression TEXT,
  timezone TEXT DEFAULT 'UTC',
  next_run_at DATETIME,
  last_fired_at DATETIME,
  public_id TEXT UNIQUE,
  webhook_secret TEXT,
  signing_mode TEXT,
  replay_window_sec INTEGER DEFAULT 300,
  last_result TEXT,
  event_type TEXT,
  event_filters TEXT, -- JSON filter conditions
  created_by_agent_id TEXT,
  created_by_user_id TEXT,
  updated_by_agent_id TEXT,
  updated_by_user_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
  -- Note: Foreign keys to agents omitted - table may not exist
);

-- Indexes for routine_triggers table
CREATE INDEX IF NOT EXISTS idx_routine_triggers_company_routine ON routine_triggers(company_id, routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_triggers_company_kind ON routine_triggers(company_id, kind);
CREATE INDEX IF NOT EXISTS idx_routine_triggers_next_run ON routine_triggers(next_run_at) WHERE enabled = 1;
CREATE INDEX IF NOT EXISTS idx_routine_triggers_public_id ON routine_triggers(public_id);

-- =====================================================
-- Routine Runs Table
-- Execution history and status tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS routine_runs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id TEXT NOT NULL,
  routine_id TEXT NOT NULL,
  trigger_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('cron', 'webhook', 'event', 'manual', 'retry')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
  priority TEXT NOT NULL DEFAULT 'medium',
  triggered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  idempotency_key TEXT,
  trigger_payload TEXT, -- JSON payload
  linked_issue_id TEXT,
  coalesced_into_run_id TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  failure_reason TEXT,
  error_details TEXT, -- JSON error info
  output_data TEXT, -- JSON output
  execution_duration_ms INTEGER,
  agent_id TEXT, -- Agent that executed the run
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
  FOREIGN KEY (trigger_id) REFERENCES routine_triggers(id) ON DELETE SET NULL,
  FOREIGN KEY (linked_issue_id) REFERENCES issues(id) ON DELETE SET NULL
  -- Note: Foreign key to agents omitted - table may not exist
);

-- Indexes for routine_runs table
CREATE INDEX IF NOT EXISTS idx_routine_runs_company_routine ON routine_runs(company_id, routine_id, created_at);
CREATE INDEX IF NOT EXISTS idx_routine_runs_trigger ON routine_runs(trigger_id, created_at);
CREATE INDEX IF NOT EXISTS idx_routine_runs_linked_issue ON routine_runs(linked_issue_id);
CREATE INDEX IF NOT EXISTS idx_routine_runs_idempotency ON routine_runs(trigger_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_routine_runs_status ON routine_runs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_routine_runs_pending ON routine_runs(status) WHERE status IN ('pending', 'running');

-- =====================================================
-- Routine Assignments Table
-- Many-to-many: routines <-> agents
-- =====================================================

CREATE TABLE IF NOT EXISTS routine_assignments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  routine_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  assignment_type TEXT NOT NULL DEFAULT 'primary' CHECK (assignment_type IN ('primary', 'backup', 'escalation')),
  is_active BOOLEAN NOT NULL DEFAULT 1,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by TEXT,
  unassigned_at DATETIME,
  notes TEXT,
  
  FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
  -- Note: Foreign key to agents omitted - table may not exist
  UNIQUE(routine_id, agent_id, assignment_type)
);

-- Indexes for routine_assignments table
CREATE INDEX IF NOT EXISTS idx_routine_assignments_routine ON routine_assignments(routine_id, is_active);
CREATE INDEX IF NOT EXISTS idx_routine_assignments_agent ON routine_assignments(agent_id, is_active);

-- =====================================================
-- Routine Scheduler Locks Table
-- Distributed locking to prevent duplicate runs
-- =====================================================

CREATE TABLE IF NOT EXISTS routine_scheduler_locks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  routine_id TEXT NOT NULL UNIQUE,
  trigger_id TEXT,
  locked_by TEXT NOT NULL, -- Instance/hostname that acquired the lock
  locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  run_id TEXT,
  
  FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
  FOREIGN KEY (trigger_id) REFERENCES routine_triggers(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES routine_runs(id) ON DELETE SET NULL
);

-- Indexes for scheduler locks
CREATE INDEX IF NOT EXISTS idx_scheduler_locks_expires ON routine_scheduler_locks(expires_at);

-- =====================================================
-- Update trigger for routines table
-- =====================================================

CREATE TRIGGER IF NOT EXISTS tr_routines_updated_at
AFTER UPDATE ON routines
BEGIN
  UPDATE routines SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =====================================================
-- Update trigger for routine_triggers table
-- =====================================================

CREATE TRIGGER IF NOT EXISTS tr_routine_triggers_updated_at
AFTER UPDATE ON routine_triggers
BEGIN
  UPDATE routine_triggers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =====================================================
-- Update trigger for routine_runs table
-- =====================================================

CREATE TRIGGER IF NOT EXISTS tr_routine_runs_updated_at
AFTER UPDATE ON routine_runs
BEGIN
  UPDATE routine_runs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
`;

/**
 * SQL statements for dropping routine scheduling tables
 * @type {string}
 */
const DOWN_MIGRATION = `
-- Drop triggers
DROP TRIGGER IF EXISTS tr_routine_runs_updated_at;
DROP TRIGGER IF EXISTS tr_routine_triggers_updated_at;
DROP TRIGGER IF EXISTS tr_routines_updated_at;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS routine_scheduler_locks;
DROP TABLE IF EXISTS routine_assignments;
DROP TABLE IF EXISTS routine_runs;
DROP TABLE IF EXISTS routine_triggers;
DROP TABLE IF EXISTS routines;
`;

/**
 * Execute migration up
 * @async
 * @param {import('better-sqlite3').Database} db - Database instance
 * @returns {Promise<void>}
 */
export async function up(db) {
  // Execute the entire migration as a single script
  // SQLite can handle multiple statements in one exec() call
  db.exec(UP_MIGRATION);
  
  console.log(`[Migration ${config.version}] Created routine scheduling tables`);
}

/**
 * Execute migration down
 * @async
 * @param {import('better-sqlite3').Database} db - Database instance
 * @returns {Promise<void>}
 */
export async function down(db) {
  const statements = DOWN_MIGRATION.split(';').filter(s => s.trim());
  
  for (const statement of statements) {
    if (statement.trim()) {
      db.exec(statement + ';');
    }
  }
  
  console.log(`[Migration ${config.version}] Dropped routine scheduling tables`);
}

export default { config, up, down };
