/**
 * Migration 023: Execution workspaces
 * Adds isolated execution workspace and operation tracking tables.
 */

export function up(db) {
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS execution_workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'terminated')),
      isolation_mode TEXT NOT NULL DEFAULT 'local' CHECK (isolation_mode IN ('local', 'container', 'cloud')),
      config TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_by TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_execution_workspaces_company
      ON execution_workspaces(company_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_execution_workspaces_status
      ON execution_workspaces(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS workspace_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      workspace_id INTEGER NOT NULL,
      operation_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
      requested_by TEXT,
      input_payload TEXT DEFAULT '{}',
      output_payload TEXT DEFAULT '{}',
      error_message TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES execution_workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_operations_workspace
      ON workspace_operations(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_operations_status
      ON workspace_operations(status, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS trg_execution_workspaces_updated_at
    AFTER UPDATE ON execution_workspaces
    FOR EACH ROW
    BEGIN
      UPDATE execution_workspaces
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);
}

export function down(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_execution_workspaces_updated_at;
    DROP INDEX IF EXISTS idx_workspace_operations_status;
    DROP INDEX IF EXISTS idx_workspace_operations_workspace;
    DROP TABLE IF EXISTS workspace_operations;
    DROP INDEX IF EXISTS idx_execution_workspaces_status;
    DROP INDEX IF EXISTS idx_execution_workspaces_company;
    DROP TABLE IF EXISTS execution_workspaces;
  `);
}
