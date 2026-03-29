/**
 * @fileoverview Performance Optimization Indexes Migration
 * @module db/migrations/020_performance_indexes
 * @description Adds performance indexes for commonly queried fields
 * @version 5.0.0
 */

/**
 * Helper to check if column exists
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {string} column
 */
function hasColumn(db, table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all()
      .some(col => col.name === column);
  } catch (e) {
    return false;
  }
}

/**
 * Helper to check if table exists
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 */
function hasTable(db, table) {
  try {
    const result = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    return !!result;
  } catch (e) {
    return false;
  }
}

/**
 * Migration to add performance indexes
 * @param {import('better-sqlite3').Database} db - Database instance
 */
export function up(db) {
    // Add missing columns for compatibility (only if tables exist)
    if (hasTable(db, 'contexts')) {
      if (!hasColumn(db, 'contexts', 'archived')) {
        db.exec(`ALTER TABLE contexts ADD COLUMN archived INTEGER DEFAULT 0`);
      }
      if (!hasColumn(db, 'contexts', 'type')) {
        db.exec(`ALTER TABLE contexts ADD COLUMN type TEXT DEFAULT 'general'`);
      }
    }
    
    if (hasTable(db, 'companies') && !hasColumn(db, 'companies', 'is_active')) {
      db.exec(`ALTER TABLE companies ADD COLUMN is_active INTEGER DEFAULT 1`);
    }

    // Tasks table indexes
    if (hasTable(db, 'tasks')) {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at DESC);`);
      } catch (e) { }
    }

    // Roadmaps table indexes
    if (hasTable(db, 'roadmaps')) {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_roadmaps_status ON roadmaps(status, updated_at DESC);`);
      } catch (e) { }
    }

    // Contexts table indexes
    if (hasTable(db, 'contexts')) {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_contexts_active ON contexts(company_id, archived) WHERE archived = 0;`);
      } catch (e) { }
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_contexts_type ON contexts(type, created_at DESC);`);
      } catch (e) { }
    }

    // Issues table indexes
    if (hasTable(db, 'issues')) {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status, updated_at DESC);`);
      } catch (e) { }
    }

    // Companies table indexes
    if (hasTable(db, 'companies')) {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active, created_at) WHERE is_active = 1;`);
      } catch (e) { }
    }

    // Activity log indexes
    if (hasTable(db, 'activity_log')) {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_recent ON activity_log(created_at DESC, company_id);`);
      } catch (e) { }
    }

    // Heartbeat runs indexes
    if (hasTable(db, 'heartbeat_runs')) {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_status ON heartbeat_runs(status, created_at DESC);`);
      } catch (e) { }
    }

    // Agent sessions indexes
    if (hasTable(db, 'agent_sessions')) {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status, created_at DESC);`);
      } catch (e) { }
    }

    // Cost events indexes
    if (hasTable(db, 'cost_events')) {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_events_date ON cost_events(created_at DESC, company_id);`);
      } catch (e) { }
    }

    // Add query performance tracking table
    db.exec(`
      CREATE TABLE IF NOT EXISTS query_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_hash TEXT NOT NULL,
        query_pattern TEXT NOT NULL,
        avg_duration_ms REAL DEFAULT 0,
        total_calls INTEGER DEFAULT 0,
        slow_calls INTEGER DEFAULT 0,
        last_called_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(query_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_query_perf_hash ON query_performance(query_hash);
      CREATE INDEX IF NOT EXISTS idx_query_perf_slow ON query_performance(slow_calls DESC) WHERE slow_calls > 0;
    `);

    console.log('[Migration 020] Performance indexes created successfully');
}

/**
 * Rollback the migration
 * @param {import('better-sqlite3').Database} db - Database instance
 */
export function down(db) {
    const indexes = [
      'idx_tasks_status_created',
      'idx_roadmaps_status',
      'idx_contexts_active',
      'idx_contexts_type',
      'idx_issues_status',
      'idx_companies_active',
      'idx_activity_recent',
      'idx_heartbeat_runs_status',
      'idx_agent_sessions_status',
      'idx_cost_events_date',
      'idx_query_perf_hash',
      'idx_query_perf_slow'
    ];

    indexes.forEach(index => {
      try {
        db.exec(`DROP INDEX IF EXISTS ${index}`);
      } catch (error) {
        console.warn(`[Migration 020] Failed to drop index ${index}:`, error.message);
      }
    });

    try {
      db.exec('DROP TABLE IF EXISTS query_performance');
    } catch (error) {
      console.warn('[Migration 020] Failed to drop query_performance table:', error.message);
    }

    console.log('[Migration 020] Performance indexes removed');
}
