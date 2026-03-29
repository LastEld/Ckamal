/**
 * Migration: Authentication System Enhancement
 * Creates multi-actor auth tables inspired by Paperclip's better-auth
 * Supports users, agents, API keys, and company scoping
 */

/**
 * Apply migration
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // ============================================
  // COMPANIES - Multi-tenant organization support
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      settings TEXT DEFAULT '{}',
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
    CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
    CREATE INDEX IF NOT EXISTS idx_companies_created ON companies(created_at);
  `);

  // ============================================
  // AUTH_USERS - Enhanced user authentication
  // Based on Paperclip's authUsers schema
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT NOT NULL,
      email_verified BOOLEAN DEFAULT 0,
      image TEXT,
      password_hash TEXT,
      company_id TEXT,
      role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user', 'guest')),
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
      last_login_at DATETIME,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email) WHERE status != 'deleted';
    CREATE INDEX IF NOT EXISTS idx_auth_users_company ON auth_users(company_id) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_auth_users_status ON auth_users(status);
    CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users(role) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_auth_users_created ON auth_users(created_at);
  `);

  // ============================================
  // AUTH_SESSIONS - Session management
  // Based on Paperclip's authSessions schema
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_created ON auth_sessions(created_at);
  `);

  // ============================================
  // AUTH_ACCOUNTS - OAuth provider accounts
  // Based on Paperclip's authAccounts schema
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at DATETIME,
      refresh_token_expires_at DATETIME,
      scope TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      UNIQUE(user_id, provider_id)
    );

    CREATE INDEX IF NOT EXISTS idx_auth_accounts_user ON auth_accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_accounts_provider ON auth_accounts(provider_id, account_id);
  `);

  // ============================================
  // AUTH_VERIFICATIONS - Email/password reset tokens
  // Based on Paperclip's authVerifications schema
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_verifications (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_auth_verifications_identifier ON auth_verifications(identifier);
    CREATE INDEX IF NOT EXISTS idx_auth_verifications_expires ON auth_verifications(expires_at);
  `);

  // ============================================
  // AGENT_API_KEYS - Machine-to-machine auth
  // Inspired by Paperclip's agent API key pattern
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      name TEXT,
      actor_id TEXT NOT NULL,
      actor_type TEXT DEFAULT 'agent' CHECK (actor_type IN ('user', 'agent')),
      company_id TEXT,
      permissions TEXT DEFAULT '[]',
      rate_limit INTEGER DEFAULT 500,
      expires_at DATETIME,
      last_used_at DATETIME,
      use_count INTEGER DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME,
      revoked_by TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES auth_users(id) ON DELETE SET NULL,
      FOREIGN KEY (revoked_by) REFERENCES auth_users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_api_keys_actor ON agent_api_keys(actor_id, actor_type);
    CREATE INDEX IF NOT EXISTS idx_agent_api_keys_company ON agent_api_keys(company_id) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_agent_api_keys_prefix ON agent_api_keys(key_prefix);
    CREATE INDEX IF NOT EXISTS idx_agent_api_keys_expires ON agent_api_keys(expires_at) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_agent_api_keys_revoked ON agent_api_keys(revoked_at) WHERE revoked_at IS NOT NULL;
  `);

  // ============================================
  // COMPANY_MEMBERS - Company membership
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      UNIQUE(company_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members(company_id);
    CREATE INDEX IF NOT EXISTS idx_company_members_user ON company_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_company_members_role ON company_members(company_id, role);
  `);

  // ============================================
  // Update triggers for updated_at
  // ============================================
  const tables = ['companies', 'auth_users', 'auth_sessions', 'auth_accounts', 'auth_verifications'];
  
  for (const table of tables) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_${table}_updated_at
      AFTER UPDATE ON ${table}
      FOR EACH ROW
      BEGIN
        UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
  }

  // ============================================
  // MIGRATE EXISTING USERS
  // Migrate from users table to auth_users
  // ============================================
  
  // Check if users table exists and has data
  const usersTableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='users'
  `).get();

  if (usersTableExists) {
    // Create default company for existing users
    // Generate UUID using SQLite's randomblob since crypto may not be available
    const defaultCompanyId = db.prepare(`SELECT lower(hex(randomblob(16))) as uuid`).get().uuid;
    
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT OR IGNORE INTO companies (id, name, slug, created_at, updated_at)
      VALUES (?, 'Default Organization', 'default-org', ?, ?)
    `).run(defaultCompanyId, now, now);

    // Migrate existing users to auth_users
    // Check if uuid column exists in users table
    const userColumns = db.prepare(`PRAGMA table_info(users)`).all();
    const hasUuidColumn = userColumns.some(col => col.name === 'uuid');
    
    if (hasUuidColumn) {
      db.prepare(`
        INSERT INTO auth_users (
          id, email, name, password_hash, company_id, role, status,
          last_login_at, metadata, created_at, updated_at
        )
        SELECT 
          COALESCE(uuid, lower(hex(randomblob(16)))),
          email,
          COALESCE(display_name, username, email),
          password_hash,
          ?,
          COALESCE(role, 'user'),
          COALESCE(status, 'active'),
          last_login_at,
          COALESCE(metadata, '{}'),
          COALESCE(created_at, CURRENT_TIMESTAMP),
          COALESCE(updated_at, CURRENT_TIMESTAMP)
        FROM users
        WHERE (uuid IS NOT NULL AND uuid NOT IN (SELECT id FROM auth_users))
      `).run(defaultCompanyId);
    }
  }

  console.log('[Migration 006] Auth system tables created successfully');
}

/**
 * Rollback migration
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.pragma('foreign_keys = OFF');

  try {
    // Drop triggers first
    const tables = ['companies', 'auth_users', 'auth_sessions', 'auth_accounts', 'auth_verifications'];
    for (const table of tables) {
      db.exec(`DROP TRIGGER IF EXISTS trg_${table}_updated_at`);
    }

    // Drop tables in reverse order
    db.exec(`DROP TABLE IF EXISTS company_members`);
    db.exec(`DROP TABLE IF EXISTS agent_api_keys`);
    db.exec(`DROP TABLE IF EXISTS auth_verifications`);
    db.exec(`DROP TABLE IF EXISTS auth_accounts`);
    db.exec(`DROP TABLE IF EXISTS auth_sessions`);
    db.exec(`DROP TABLE IF EXISTS auth_users`);
    db.exec(`DROP TABLE IF EXISTS companies`);

    console.log('[Migration 006] Auth system tables removed');
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
