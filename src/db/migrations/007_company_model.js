/**
 * Migration 007: Company/Organization Model Enhancement
 * 
 * Enhances the multi-tenant architecture with a complete company model:
 * - Extends companies table with additional fields (budget, branding, etc.)
 * - Creates company_memberships table (enhanced version of company_members)
 * - Adds company_id to tasks, roadmaps, contexts for data isolation
 * - Migrates existing data to default company
 * 
 * Note: Migration 006 created a basic companies table. This migration:
 * 1. Adds missing columns to companies
 * 2. Creates the enhanced company_memberships table
 * 3. Adds company_id foreign keys to tenant tables
 */

/**
 * Helper: Generate UUID
 */
function generateUUID() {
  // Use SQLite's randomblob if available, otherwise fallback to hex
  return `lower(hex(randomblob(16)))`;
}

/**
 * Helper: Check if column exists in table
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
 * Helper: Get table info
 */
function getTableInfo(db, tableName) {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all();
  } catch {
    return [];
  }
}

/**
 * Helper: Get company table primary key type
 */
function getCompanyIdType(db) {
  const info = getTableInfo(db, 'companies');
  const pkCol = info.find(col => col.pk === 1);
  return pkCol?.type || 'TEXT';
}

/**
 * Apply company model migration
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.pragma('foreign_keys = ON');

  // ============================================
  // EXTEND COMPANIES TABLE (from migration 006)
  // ============================================
  
  if (hasTable(db, 'companies')) {
    // Add missing columns to existing companies table
    const columnsToAdd = [
      { name: 'uuid', def: 'TEXT UNIQUE' },
      { name: 'description', def: 'TEXT' },
      { name: 'pause_reason', def: 'TEXT' },
      { name: 'paused_at', def: 'DATETIME' },
      { name: 'brand_color', def: 'TEXT' },
      { name: 'logo_url', def: 'TEXT' },
      { name: 'budget_monthly_cents', def: 'INTEGER DEFAULT 0' },
      { name: 'spent_monthly_cents', def: 'INTEGER DEFAULT 0' },
      { name: 'require_approval_for_agents', def: 'BOOLEAN DEFAULT 0' },
      { name: 'deleted_at', def: 'DATETIME' },
      { name: 'deleted_by', def: 'TEXT' },
      { name: 'created_by', def: 'TEXT' }
    ];

    for (const col of columnsToAdd) {
      if (!hasColumn(db, 'companies', col.name)) {
        try {
          db.exec(`ALTER TABLE companies ADD COLUMN ${col.name} ${col.def}`);
        } catch (e) {
          // Column might already exist or type mismatch - continue
        }
      }
    }

    // Generate UUIDs for existing companies that don't have one
    if (hasColumn(db, 'companies', 'uuid')) {
      db.exec(`
        UPDATE companies 
        SET uuid = lower(hex(randomblob(16)))
        WHERE uuid IS NULL
      `);
    }

    // Create additional indexes
    if (hasColumn(db, 'companies', 'uuid')) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_companies_uuid ON companies(uuid) WHERE deleted_at IS NULL;
      `);
    }
    if (hasColumn(db, 'companies', 'deleted_at')) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_companies_deleted_at ON companies(deleted_at) WHERE deleted_at IS NOT NULL;
      `);
    }
  }

  // ============================================
  // CREATE COMPANY_MEMBERSHIPS TABLE
  // (Enhanced version of company_members from 006)
  // ============================================
  
  if (!hasTable(db, 'company_memberships')) {
    const companyIdType = getCompanyIdType(db);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS company_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
        company_id ${companyIdType} NOT NULL,
        user_id TEXT NOT NULL,
        
        -- Membership details
        role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'suspended')),
        invited_by TEXT,
        invited_at DATETIME,
        joined_at DATETIME,
        
        -- Permissions (granular overrides)
        permissions TEXT DEFAULT '{}',
        
        -- Audit
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        
        -- Constraints
        UNIQUE(company_id, user_id),
        
        -- Foreign Keys
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
        FOREIGN KEY (invited_by) REFERENCES auth_users(id) ON DELETE SET NULL
      );

      -- Membership indexes
      CREATE INDEX IF NOT EXISTS idx_memberships_company ON company_memberships(company_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_memberships_user ON company_memberships(user_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_memberships_role ON company_memberships(company_id, role) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_memberships_status ON company_memberships(company_id, status) WHERE deleted_at IS NULL;
    `);

    // Migrate data from company_members if it exists
    if (hasTable(db, 'company_members')) {
      db.exec(`
        INSERT INTO company_memberships (
          company_id, user_id, role, joined_at, created_at, updated_at, status
        )
        SELECT 
          company_id, user_id, 
          CASE 
            WHEN role IN ('owner', 'admin', 'member', 'viewer') THEN role 
            ELSE 'member' 
          END,
          joined_at, created_at, created_at, 'active'
        FROM company_members
        WHERE (company_id, user_id) NOT IN (
          SELECT company_id, user_id FROM company_memberships
        )
      `);
    }
  }

  // ============================================
  // ADD COMPANY_ID TO EXISTING TABLES
  // ============================================
  
  const companyIdType = getCompanyIdType(db);

  // Add company_id to tasks (nullable initially for migration)
  if (!hasColumn(db, 'tasks', 'company_id')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN company_id ${companyIdType}`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks(company_id) WHERE deleted_at IS NULL AND company_id IS NOT NULL`);
  }
  
  // Add company_id to roadmaps
  if (!hasColumn(db, 'roadmaps', 'company_id')) {
    db.exec(`ALTER TABLE roadmaps ADD COLUMN company_id ${companyIdType}`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_roadmaps_company ON roadmaps(company_id) WHERE deleted_at IS NULL AND company_id IS NOT NULL`);
  }
  
  // Add company_id to contexts
  if (!hasColumn(db, 'contexts', 'company_id')) {
    db.exec(`ALTER TABLE contexts ADD COLUMN company_id ${companyIdType}`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contexts_company ON contexts(company_id) WHERE deleted_at IS NULL AND company_id IS NOT NULL`);
  }

  // Add company_id to conversations
  if (!hasColumn(db, 'conversations', 'company_id')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN company_id ${companyIdType}`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_company ON conversations(company_id) WHERE deleted_at IS NULL AND company_id IS NOT NULL`);
  }

  // ============================================
  // CREATE DEFAULT COMPANY FOR EXISTING DATA
  // ============================================
  
  if (hasTable(db, 'companies')) {
    // Check if we need to create a default company
    const companyCount = db.prepare('SELECT COUNT(*) as count FROM companies').get();
    
    if (companyCount.count === 0) {
      const now = new Date().toISOString();
      
      // Create default company with TEXT id (matching migration 006)
      // Use SQLite to generate UUID
      const defaultCompanyId = db.prepare("SELECT lower(hex(randomblob(16))) as uuid").get().uuid;
      
      db.prepare(`
        INSERT INTO companies (
          id, uuid, name, slug, description, status, 
          budget_monthly_cents, spent_monthly_cents, require_approval_for_agents,
          created_at, updated_at
        )
        VALUES (?, ?, 'Default Organization', 'default', 'Default organization for existing data', 'active', 0, 0, 0, ?, ?)
      `).run(defaultCompanyId, defaultCompanyId, now, now);

      // Assign first auth_user as owner
      const firstUser = db.prepare('SELECT id FROM auth_users ORDER BY created_at ASC LIMIT 1').get();
      
      if (firstUser) {
        db.prepare(`
          INSERT INTO company_memberships (company_id, user_id, role, status, joined_at, created_at, updated_at)
          VALUES (?, ?, 'owner', 'active', ?, ?, ?)
        `).run(defaultCompanyId, firstUser.id, now, now, now);

        // Update created_by on company
        db.prepare('UPDATE companies SET created_by = ? WHERE id = ?').run(firstUser.id, defaultCompanyId);
      }

      // ============================================
      // MIGRATE EXISTING DATA TO DEFAULT COMPANY
      // ============================================
      
      // Update tasks
      db.prepare(`UPDATE tasks SET company_id = ? WHERE company_id IS NULL`).run(defaultCompanyId);

      // Update roadmaps
      db.prepare(`UPDATE roadmaps SET company_id = ? WHERE company_id IS NULL`).run(defaultCompanyId);

      // Update contexts
      db.prepare(`UPDATE contexts SET company_id = ? WHERE company_id IS NULL`).run(defaultCompanyId);

      // Update conversations
      db.prepare(`UPDATE conversations SET company_id = ? WHERE company_id IS NULL`).run(defaultCompanyId);
    }
  }

  // ============================================
  // UPDATE TRIGGERS
  // ============================================
  
  db.exec(`
    DROP TRIGGER IF EXISTS trg_company_memberships_updated_at;

    CREATE TRIGGER IF NOT EXISTS trg_company_memberships_updated_at
    AFTER UPDATE ON company_memberships
    FOR EACH ROW
    BEGIN
      UPDATE company_memberships SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  console.log('[Migration 007] Company model enhanced successfully');
}

/**
 * Rollback company model migration
 * Note: This removes company_memberships but keeps companies table (from 006)
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.pragma('foreign_keys = OFF');

  try {
    // Drop triggers first
    db.exec(`DROP TRIGGER IF EXISTS trg_company_memberships_updated_at;`);

    // Note: We intentionally keep the company_id columns in tenant tables
    // and the companies table (created in 006) to avoid data loss
    
    // Drop membership table
    db.exec(`DROP TABLE IF EXISTS company_memberships`);

    console.log('[Migration 007] Company memberships removed');
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
