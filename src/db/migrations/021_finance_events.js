/**
 * Migration 021: Finance events ledger
 * Tracks non-token financial events (credits, fees, workspace compute, incidents).
 */

export function up(db) {
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (
        event_type IN (
          'credit_purchase',
          'storage_fee',
          'workspace_compute',
          'budget_incident',
          'adjustment'
        )
      ),
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      description TEXT,
      metadata TEXT DEFAULT '{}',
      created_by TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_finance_events_company
      ON finance_events(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_finance_events_type
      ON finance_events(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_finance_events_company_type
      ON finance_events(company_id, event_type, created_at DESC);
  `);
}

export function down(db) {
  db.exec(`
    DROP INDEX IF EXISTS idx_finance_events_company_type;
    DROP INDEX IF EXISTS idx_finance_events_type;
    DROP INDEX IF EXISTS idx_finance_events_company;
    DROP TABLE IF EXISTS finance_events;
  `);
}
