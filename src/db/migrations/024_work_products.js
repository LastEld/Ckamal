/**
 * Migration 024: Work products
 * Tracks deliverables produced by agents/users for issues.
 */

export function up(db) {
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_work_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      issue_id TEXT NOT NULL,
      company_id TEXT,
      workspace_id INTEGER,
      product_type TEXT NOT NULL CHECK (product_type IN ('pr', 'branch', 'commit', 'artifact', 'document', 'deployment')),
      provider TEXT NOT NULL,
      title TEXT,
      external_url TEXT,
      external_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged', 'closed', 'deleted', 'failed')),
      created_by_agent_id TEXT,
      created_by_user_id TEXT,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES execution_workspaces(id) ON DELETE SET NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_issue_work_products_issue
      ON issue_work_products(issue_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_issue_work_products_type
      ON issue_work_products(product_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_issue_work_products_company
      ON issue_work_products(company_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_issue_work_products_external
      ON issue_work_products(provider, external_id);

    CREATE TRIGGER IF NOT EXISTS trg_issue_work_products_updated_at
    AFTER UPDATE ON issue_work_products
    FOR EACH ROW
    BEGIN
      UPDATE issue_work_products
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);
}

export function down(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_issue_work_products_updated_at;
    DROP INDEX IF EXISTS idx_issue_work_products_external;
    DROP INDEX IF EXISTS idx_issue_work_products_company;
    DROP INDEX IF EXISTS idx_issue_work_products_type;
    DROP INDEX IF EXISTS idx_issue_work_products_issue;
    DROP TABLE IF EXISTS issue_work_products;
  `);
}
