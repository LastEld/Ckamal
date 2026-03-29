/**
 * Migration 022: Budget policies and incidents
 * Adds hard-limit policy definitions and incident records.
 */

export function up(db) {
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'company', 'project', 'agent')),
      scope_id TEXT,
      hard_limit_cents INTEGER NOT NULL CHECK (hard_limit_cents > 0),
      enforcement_mode TEXT NOT NULL DEFAULT 'hard' CHECK (enforcement_mode IN ('hard', 'soft', 'notify')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      metadata TEXT DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_budget_policies_company
      ON budget_policies(company_id, is_active, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_budget_policies_scope
      ON budget_policies(company_id, scope_type, scope_id);

    CREATE TABLE IF NOT EXISTS budget_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      policy_id INTEGER NOT NULL,
      company_id TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical', 'exceeded')),
      current_spend_cents INTEGER NOT NULL DEFAULT 0,
      limit_cents INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (acknowledged IN (0, 1)),
      acknowledged_by TEXT,
      acknowledged_at DATETIME,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (policy_id) REFERENCES budget_policies(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_budget_incidents_policy
      ON budget_incidents(policy_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_budget_incidents_company
      ON budget_incidents(company_id, acknowledged, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS trg_budget_policies_updated_at
    AFTER UPDATE ON budget_policies
    FOR EACH ROW
    BEGIN
      UPDATE budget_policies
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);
}

export function down(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_budget_policies_updated_at;
    DROP INDEX IF EXISTS idx_budget_incidents_company;
    DROP INDEX IF EXISTS idx_budget_incidents_policy;
    DROP TABLE IF EXISTS budget_incidents;
    DROP INDEX IF EXISTS idx_budget_policies_scope;
    DROP INDEX IF EXISTS idx_budget_policies_company;
    DROP TABLE IF EXISTS budget_policies;
  `);
}
