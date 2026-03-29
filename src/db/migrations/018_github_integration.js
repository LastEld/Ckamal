/**
 * @fileoverview Migration 018: GitHub Integration
 * 
 * Creates tables for GitHub integration:
 * - github_issue_sync: Maps Ckamal issues to GitHub issues
 * - github_webhooks: Stores registered webhook configurations
 * - github_repos: Tracks connected repositories
 * 
 * This enables two-way synchronization between Ckamal issues and GitHub issues,
 * as well as webhook-based event handling.
 */

/**
 * Apply GitHub integration migration
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.pragma('foreign_keys = ON');

  // ============================================
  // GITHUB_REPOS TABLE - Connected repositories
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_repos (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      
      -- Repository identification
      github_owner TEXT NOT NULL,
      github_repo TEXT NOT NULL,
      github_repo_id INTEGER,
      
      -- Repository metadata (cached)
      repo_name TEXT,
      repo_description TEXT,
      repo_url TEXT,
      default_branch TEXT DEFAULT 'main',
      is_private BOOLEAN DEFAULT 0,
      
      -- Sync configuration
      sync_enabled BOOLEAN DEFAULT 1,
      sync_direction TEXT DEFAULT 'bidirectional' 
        CHECK (sync_direction IN ('to_github', 'from_github', 'bidirectional')),
      sync_labels BOOLEAN DEFAULT 1,
      sync_comments BOOLEAN DEFAULT 1,
      sync_assignees BOOLEAN DEFAULT 1,
      
      -- Webhook configuration
      webhook_id INTEGER,
      webhook_secret TEXT,
      webhook_url TEXT,
      webhook_events TEXT DEFAULT 'issues,issue_comment,pull_request',
      
      -- Label mappings (JSON)
      label_mappings TEXT DEFAULT '{}',
      
      -- Status tracking
      last_sync_at DATETIME,
      last_sync_status TEXT CHECK (last_sync_status IN ('success', 'partial', 'failed')),
      last_sync_error TEXT,
      
      -- Timestamps
      connected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      disconnected_at DATETIME,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Constraints
      UNIQUE(company_id, github_owner, github_repo),
      
      -- Foreign Keys
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- GitHub repos indexes
    CREATE INDEX IF NOT EXISTS idx_github_repos_company ON github_repos(company_id) WHERE disconnected_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_github_repos_owner_repo ON github_repos(github_owner, github_repo);
    CREATE INDEX IF NOT EXISTS idx_github_repos_sync ON github_repos(company_id, sync_enabled) WHERE sync_enabled = 1;
  `);

  // ============================================
  // GITHUB_ISSUE_SYNC TABLE - Issue synchronization mapping
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_issue_sync (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      
      -- Ckamal issue reference
      ckamal_issue_id TEXT NOT NULL,
      
      -- GitHub issue reference
      github_owner TEXT NOT NULL,
      github_repo TEXT NOT NULL,
      github_issue_number INTEGER NOT NULL,
      github_issue_id INTEGER,
      
      -- Sync metadata
      sync_direction TEXT NOT NULL DEFAULT 'bidirectional'
        CHECK (sync_direction IN ('to_github', 'from_github', 'bidirectional')),
      
      -- Last sync tracking
      last_sync_at DATETIME,
      last_sync_status TEXT CHECK (last_sync_status IN ('pending', 'success', 'conflict', 'failed')),
      last_sync_error TEXT,
      
      -- Conflict resolution
      conflict_resolution TEXT DEFAULT 'manual'
        CHECK (conflict_resolution IN ('manual', 'github_wins', 'ckamal_wins', 'newer_wins')),
      
      -- Version tracking for conflict detection
      ckamal_version TEXT,
      github_version TEXT,
      
      -- Timestamps
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      
      -- Constraints
      UNIQUE(ckamal_issue_id, github_owner, github_repo),
      
      -- Foreign Keys
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (ckamal_issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );

    -- GitHub issue sync indexes
    CREATE INDEX IF NOT EXISTS idx_github_issue_sync_company ON github_issue_sync(company_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_github_issue_sync_ckamal ON github_issue_sync(ckamal_issue_id);
    CREATE INDEX IF NOT EXISTS idx_github_issue_sync_github ON github_issue_sync(github_owner, github_repo, github_issue_number);
    CREATE INDEX IF NOT EXISTS idx_github_issue_sync_status ON github_issue_sync(last_sync_status) WHERE last_sync_status IN ('pending', 'failed');
    CREATE INDEX IF NOT EXISTS idx_github_issue_sync_last_sync ON github_issue_sync(last_sync_at);
  `);

  // ============================================
  // GITHUB_COMMENT_SYNC TABLE - Comment synchronization
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_comment_sync (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      
      -- Issue sync reference
      issue_sync_id TEXT NOT NULL,
      
      -- Ckamal comment reference
      ckamal_comment_id TEXT,
      
      -- GitHub comment reference
      github_comment_id INTEGER NOT NULL,
      
      -- Comment metadata
      comment_type TEXT DEFAULT 'user' CHECK (comment_type IN ('user', 'system')),
      author_github_login TEXT,
      
      -- Sync tracking
      synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sync_direction TEXT DEFAULT 'to_github' CHECK (sync_direction IN ('to_github', 'from_github')),
      
      -- Timestamps
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Foreign Keys
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (issue_sync_id) REFERENCES github_issue_sync(id) ON DELETE CASCADE,
      FOREIGN KEY (ckamal_comment_id) REFERENCES issue_comments(id) ON DELETE SET NULL
    );

    -- GitHub comment sync indexes
    CREATE INDEX IF NOT EXISTS idx_github_comment_sync_issue ON github_comment_sync(issue_sync_id);
    CREATE INDEX IF NOT EXISTS idx_github_comment_sync_ckamal ON github_comment_sync(ckamal_comment_id) WHERE ckamal_comment_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_github_comment_sync_github ON github_comment_sync(github_comment_id);
  `);

  // ============================================
  // GITHUB_WEBHOOK_LOG TABLE - Webhook event log
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_webhook_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT,
      
      -- Event details
      event_type TEXT NOT NULL,
      delivery_id TEXT,
      github_owner TEXT,
      github_repo TEXT,
      
      -- Payload (stored as JSON)
      payload TEXT NOT NULL,
      
      -- Processing status
      processed BOOLEAN DEFAULT 0,
      processed_at DATETIME,
      processing_result TEXT,
      processing_error TEXT,
      
      -- IP and signature for security audit
      source_ip TEXT,
      signature_valid BOOLEAN,
      
      -- Timestamps
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- GitHub webhook log indexes
    CREATE INDEX IF NOT EXISTS idx_github_webhook_log_company ON github_webhook_log(company_id);
    CREATE INDEX IF NOT EXISTS idx_github_webhook_log_event ON github_webhook_log(event_type);
    CREATE INDEX IF NOT EXISTS idx_github_webhook_log_delivery ON github_webhook_log(delivery_id);
    CREATE INDEX IF NOT EXISTS idx_github_webhook_log_processed ON github_webhook_log(processed) WHERE processed = 0;
    CREATE INDEX IF NOT EXISTS idx_github_webhook_log_received ON github_webhook_log(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_github_webhook_log_repo ON github_webhook_log(github_owner, github_repo);
  `);

  // ============================================
  // GITHUB_SYNC_QUEUE TABLE - Pending sync operations
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_sync_queue (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      
      -- Operation details
      operation_type TEXT NOT NULL 
        CHECK (operation_type IN ('issue_create', 'issue_update', 'issue_delete', 'comment_create', 'comment_update', 'label_update')),
      
      -- Entity references
      ckamal_issue_id TEXT,
      github_owner TEXT,
      github_repo TEXT,
      github_issue_number INTEGER,
      
      -- Operation data (JSON)
      operation_data TEXT,
      
      -- Priority and scheduling
      priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
      scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      -- Retry tracking
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      last_error TEXT,
      
      -- Status
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
      
      -- Processing
      processing_started_at DATETIME,
      processing_completed_at DATETIME,
      processed_by TEXT,
      
      -- Timestamps
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Foreign Keys
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (ckamal_issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );

    -- GitHub sync queue indexes
    CREATE INDEX IF NOT EXISTS idx_github_sync_queue_status ON github_sync_queue(status) WHERE status IN ('pending', 'processing', 'failed');
    CREATE INDEX IF NOT EXISTS idx_github_sync_queue_company ON github_sync_queue(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_github_sync_queue_scheduled ON github_sync_queue(scheduled_at) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS idx_github_sync_queue_issue ON github_sync_queue(ckamal_issue_id) WHERE status IN ('pending', 'processing');
  `);

  // ============================================
  // UPDATE TRIGGERS
  // ============================================
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_github_repos_updated_at
    AFTER UPDATE ON github_repos
    FOR EACH ROW
    BEGIN
      UPDATE github_repos SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_github_issue_sync_updated_at
    AFTER UPDATE ON github_issue_sync
    FOR EACH ROW
    BEGIN
      UPDATE github_issue_sync SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_github_sync_queue_updated_at
    AFTER UPDATE ON github_sync_queue
    FOR EACH ROW
    BEGIN
      UPDATE github_sync_queue SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  console.log('[Migration 018] GitHub integration tables created successfully');
}

/**
 * Rollback GitHub integration migration
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.pragma('foreign_keys = OFF');

  try {
    // Drop triggers first
    db.exec(`
      DROP TRIGGER IF EXISTS trg_github_repos_updated_at;
      DROP TRIGGER IF EXISTS trg_github_issue_sync_updated_at;
      DROP TRIGGER IF EXISTS trg_github_sync_queue_updated_at;
    `);

    // Drop tables in reverse order of dependencies
    db.exec(`
      DROP TABLE IF EXISTS github_sync_queue;
      DROP TABLE IF EXISTS github_webhook_log;
      DROP TABLE IF EXISTS github_comment_sync;
      DROP TABLE IF EXISTS github_issue_sync;
      DROP TABLE IF EXISTS github_repos;
    `);

    console.log('[Migration 018] GitHub integration tables removed');
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
