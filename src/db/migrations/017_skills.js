/**
 * Migration 017: Skills System
 * 
 * Creates tables for skill management:
 * - skills: Main skill registry
 * - skill_versions: Version history
 * - skill_assignments: Agent/company assignments
 * - skill_sync_logs: Sync operation logs
 */

/**
 * Helper: Check if table exists
 */
function hasTable(db, tableName) {
  try {
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);
    return !!result;
  } catch {
    return false;
  }
}

/**
 * Helper: Check if column exists
 */
function hasColumn(db, tableName, columnName) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some(col => col.name === columnName);
  } catch {
    return false;
  }
}

/**
 * Apply migration
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.pragma('foreign_keys = ON');

  // ============================================
  // SKILLS TABLE - Main skill registry
  // ============================================
  
  if (!hasTable(db, 'skills')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT,
        description TEXT,
        content TEXT NOT NULL,
        version TEXT DEFAULT '1.0.0',
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'draft', 'archived')),
        
        -- Scoping
        company_id TEXT,
        is_global BOOLEAN DEFAULT 0,
        
        -- Categorization
        tags TEXT DEFAULT '[]',
        categories TEXT DEFAULT '[]',
        
        -- Metadata
        metadata TEXT DEFAULT '{}',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign Keys
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES auth_users(id) ON DELETE SET NULL,
        
        -- Constraints
        UNIQUE(name, company_id)
      );

      -- Skill indexes
      CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
      CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
      CREATE INDEX IF NOT EXISTS idx_skills_company ON skills(company_id) WHERE company_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_skills_global ON skills(is_global, status) WHERE is_global = 1;
      CREATE INDEX IF NOT EXISTS idx_skills_created ON skills(created_at);
    `);
  }

  // ============================================
  // SKILL_VERSIONS TABLE - Version history
  // ============================================
  
  if (!hasTable(db, 'skill_versions')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS skill_versions (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        version TEXT NOT NULL,
        content TEXT NOT NULL,
        change_notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign Keys
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES auth_users(id) ON DELETE SET NULL,
        
        -- Constraints
        UNIQUE(skill_id, version)
      );

      -- Version indexes
      CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_id);
      CREATE INDEX IF NOT EXISTS idx_skill_versions_version ON skill_versions(skill_id, version);
      CREATE INDEX IF NOT EXISTS idx_skill_versions_created ON skill_versions(created_at);
    `);
  }

  // ============================================
  // SKILL_ASSIGNMENTS TABLE - Agent/company assignments
  // ============================================
  
  if (!hasTable(db, 'skill_assignments')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS skill_assignments (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        
        -- Assignee
        assignee_type TEXT NOT NULL CHECK (assignee_type IN ('agent', 'company')),
        assignee_id TEXT NOT NULL,
        
        -- Assignment scope
        scope TEXT DEFAULT 'global' CHECK (scope IN ('global', 'project', 'task')),
        scope_target TEXT, -- project_id or task_id if scoped
        
        -- Configuration overrides
        config TEXT DEFAULT '{}',
        
        -- Assignment metadata
        assigned_by TEXT,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        
        -- Foreign Keys
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES auth_users(id) ON DELETE SET NULL,
        
        -- Constraints
        UNIQUE(skill_id, assignee_type, assignee_id, scope, scope_target)
      );

      -- Assignment indexes
      CREATE INDEX IF NOT EXISTS idx_skill_assignments_skill ON skill_assignments(skill_id);
      CREATE INDEX IF NOT EXISTS idx_skill_assignments_assignee ON skill_assignments(assignee_type, assignee_id);
      CREATE INDEX IF NOT EXISTS idx_skill_assignments_scope ON skill_assignments(scope);
      CREATE INDEX IF NOT EXISTS idx_skill_assignments_expires ON skill_assignments(expires_at) WHERE expires_at IS NOT NULL;
    `);
  }

  // ============================================
  // SKILL_SYNC_LOGS TABLE - Sync operation logs
  // ============================================
  
  if (!hasTable(db, 'skill_sync_logs')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS skill_sync_logs (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL CHECK (operation IN ('sync', 'preview', 'remove', 'cleanup', 'full')),
        client TEXT NOT NULL, -- 'claude', 'codex', 'kimi', 'all'
        
        -- Stats
        total_skills INTEGER DEFAULT 0,
        synced INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        removed INTEGER DEFAULT 0,
        
        -- Details
        details TEXT DEFAULT '[]',
        
        -- Timing
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        duration_ms INTEGER,
        
        -- Metadata
        triggered_by TEXT,
        source_ip TEXT
      );

      -- Sync log indexes
      CREATE INDEX IF NOT EXISTS idx_skill_sync_logs_operation ON skill_sync_logs(operation);
      CREATE INDEX IF NOT EXISTS idx_skill_sync_logs_client ON skill_sync_logs(client);
      CREATE INDEX IF NOT EXISTS idx_skill_sync_logs_started ON skill_sync_logs(started_at);
      CREATE INDEX IF NOT EXISTS idx_skill_sync_logs_completed ON skill_sync_logs(completed_at);
    `);
  }

  // ============================================
  // AGENT_SKILLS TABLE - Desired skills for CV templates
  // ============================================
  
  if (!hasTable(db, 'agent_skills')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        
        -- Skill configuration
        is_required BOOLEAN DEFAULT 0,
        priority INTEGER DEFAULT 100, -- Lower = higher priority
        config TEXT DEFAULT '{}',
        
        -- Metadata
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        assigned_by TEXT,
        
        -- Foreign Keys
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES auth_users(id) ON DELETE SET NULL,
        
        -- Constraints
        UNIQUE(agent_id, skill_id)
      );

      -- Agent skill indexes
      CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills(skill_id);
      CREATE INDEX IF NOT EXISTS idx_agent_skills_priority ON agent_skills(agent_id, priority);
    `);
  }

  // ============================================
  // UPDATE TRIGGERS
  // ============================================
  
  const tablesWithUpdatedAt = ['skills'];
  
  for (const table of tablesWithUpdatedAt) {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_${table}_updated_at;
      
      CREATE TRIGGER IF NOT EXISTS trg_${table}_updated_at
      AFTER UPDATE ON ${table}
      FOR EACH ROW
      BEGIN
        UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
  }

  // ============================================
  // SYNC LOG COMPLETION TRIGGER
  // ============================================
  
  db.exec(`
    DROP TRIGGER IF EXISTS trg_skill_sync_logs_completed;
    
    CREATE TRIGGER IF NOT EXISTS trg_skill_sync_logs_completed
    AFTER INSERT ON skill_sync_logs
    FOR EACH ROW
    WHEN NEW.completed_at IS NULL
    BEGIN
      UPDATE skill_sync_logs 
      SET completed_at = CURRENT_TIMESTAMP,
          duration_ms = CASE 
            WHEN NEW.started_at IS NOT NULL 
            THEN (julianday('now') - julianday(NEW.started_at)) * 86400000
            ELSE 0 
          END
      WHERE id = NEW.id;
    END;
  `);

  console.log('[Migration 017] Skills system tables created successfully');
}

/**
 * Rollback migration
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.pragma('foreign_keys = OFF');

  try {
    // Drop triggers first
    db.exec(`DROP TRIGGER IF EXISTS trg_skills_updated_at;`);
    db.exec(`DROP TRIGGER IF EXISTS trg_skill_sync_logs_completed;`);

    // Drop tables in reverse order of creation
    db.exec(`DROP TABLE IF EXISTS agent_skills;`);
    db.exec(`DROP TABLE IF EXISTS skill_sync_logs;`);
    db.exec(`DROP TABLE IF EXISTS skill_assignments;`);
    db.exec(`DROP TABLE IF EXISTS skill_versions;`);
    db.exec(`DROP TABLE IF EXISTS skills;`);

    console.log('[Migration 017] Skills system tables removed');
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
