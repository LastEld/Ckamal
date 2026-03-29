/**
 * @fileoverview Migration 012: Issue/Ticket System
 * 
 * Creates a comprehensive issue tracking system inspired by Paperclip's issues schema:
 * - issues table: Core issue tracking with company isolation
 * - issue_comments: Threaded comments on issues
 * - issue_labels: Label definitions per company
 * - issue_label_links: Many-to-many issue-label relationships
 * - issue_attachments: File attachments for issues
 * - issue_read_states: Track read/unread state per user
 * 
 * This system works alongside the existing tasks table (tasks = simple todo items,
 * issues = full ticket/project management with comments, labels, and assignments).
 */

/**
 * Apply issue system migration
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.pragma('foreign_keys = ON');

  // ============================================
  // ISSUES TABLE - Core issue tracking
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      
      -- Hierarchy and relationships
      parent_id TEXT,
      project_id TEXT,
      task_id INTEGER,
      
      -- Issue content
      issue_number INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      
      -- Status and priority
      status TEXT NOT NULL DEFAULT 'backlog' 
        CHECK (status IN ('backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('critical', 'high', 'medium', 'low')),
      
      -- Assignment (can be user or agent)
      assignee_type TEXT CHECK (assignee_type IN ('user', 'agent')),
      assignee_id TEXT,
      
      -- Creator tracking
      created_by_type TEXT NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user', 'agent', 'system')),
      created_by_id TEXT,
      
      -- Timing
      started_at DATETIME,
      completed_at DATETIME,
      cancelled_at DATETIME,
      due_date DATETIME,
      
      -- Origin tracking (for automated issue creation)
      origin_kind TEXT NOT NULL DEFAULT 'manual' 
        CHECK (origin_kind IN ('manual', 'automation', 'integration', 'alert', 'routine_execution')),
      origin_id TEXT,
      origin_run_id TEXT,
      
      -- Metrics
      comment_count INTEGER DEFAULT 0,
      attachment_count INTEGER DEFAULT 0,
      
      -- Soft delete and audit
      hidden_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      deleted_by TEXT,
      
      -- Foreign Keys
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES issues(id) ON DELETE SET NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    -- Issue indexes
    CREATE INDEX IF NOT EXISTS idx_issues_company ON issues(company_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_company_status ON issues(company_id, status) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee_id, assignee_type) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_company_assignee_status ON issues(company_id, assignee_id, status) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_parent ON issues(parent_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_task ON issues(task_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_origin ON issues(company_id, origin_kind, origin_id);
    CREATE INDEX IF NOT EXISTS idx_issues_number ON issues(company_id, issue_number);
    CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_due_date ON issues(due_date) WHERE deleted_at IS NULL AND due_date IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issues_updated_at ON issues(updated_at DESC) WHERE deleted_at IS NULL;
  `);

  // ============================================
  // ISSUE_COMMENTS TABLE - Threaded comments
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_comments (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      issue_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      
      -- Threading support
      parent_id TEXT,
      thread_root_id TEXT,
      
      -- Comment content
      content TEXT NOT NULL,
      content_plain TEXT,
      
      -- Author (user or agent)
      author_type TEXT NOT NULL DEFAULT 'user' CHECK (author_type IN ('user', 'agent', 'system')),
      author_id TEXT,
      
      -- Comment metadata
      comment_type TEXT NOT NULL DEFAULT 'comment' 
        CHECK (comment_type IN ('comment', 'status_change', 'assignment_change', 'label_change', 'attachment_added', 'system')),
      metadata TEXT DEFAULT '{}',
      
      -- Edit tracking
      is_edited BOOLEAN DEFAULT 0,
      edited_at DATETIME,
      edited_by TEXT,
      
      -- Soft delete
      is_deleted BOOLEAN DEFAULT 0,
      deleted_at DATETIME,
      deleted_by TEXT,
      deleted_reason TEXT,
      
      -- Timestamps
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Foreign Keys
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES issue_comments(id) ON DELETE SET NULL,
      FOREIGN KEY (thread_root_id) REFERENCES issue_comments(id) ON DELETE SET NULL
    );

    -- Comment indexes
    CREATE INDEX IF NOT EXISTS idx_issue_comments_issue ON issue_comments(issue_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_issue_comments_company ON issue_comments(company_id);
    CREATE INDEX IF NOT EXISTS idx_issue_comments_parent ON issue_comments(parent_id);
    CREATE INDEX IF NOT EXISTS idx_issue_comments_thread ON issue_comments(thread_root_id);
    CREATE INDEX IF NOT EXISTS idx_issue_comments_author ON issue_comments(author_id, author_type);
    CREATE INDEX IF NOT EXISTS idx_issue_comments_created ON issue_comments(created_at DESC);
  `);

  // ============================================
  // ISSUE_LABELS TABLE - Label definitions
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_labels (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      
      -- Label properties
      name TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL DEFAULT '#6B7280',
      
      -- Usage tracking
      usage_count INTEGER DEFAULT 0,
      
      -- System labels cannot be deleted
      is_system BOOLEAN DEFAULT 0,
      
      -- Timestamps
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      
      -- Constraints
      UNIQUE(company_id, name),
      
      -- Foreign Keys
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Label indexes
    CREATE INDEX IF NOT EXISTS idx_issue_labels_company ON issue_labels(company_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issue_labels_name ON issue_labels(company_id, name) WHERE deleted_at IS NULL;
  `);

  // ============================================
  // ISSUE_LABEL_LINKS TABLE - Issue-label relationships
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_label_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      
      -- Who added this label
      added_by_type TEXT CHECK (added_by_type IN ('user', 'agent', 'system')),
      added_by_id TEXT,
      
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Constraints
      UNIQUE(issue_id, label_id),
      
      -- Foreign Keys
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (label_id) REFERENCES issue_labels(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Label link indexes
    CREATE INDEX IF NOT EXISTS idx_issue_label_links_issue ON issue_label_links(issue_id);
    CREATE INDEX IF NOT EXISTS idx_issue_label_links_label ON issue_label_links(label_id);
    CREATE INDEX IF NOT EXISTS idx_issue_label_links_company ON issue_label_links(company_id);
  `);

  // ============================================
  // ISSUE_ATTACHMENTS TABLE - File attachments
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_attachments (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      issue_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      comment_id TEXT,
      
      -- File metadata
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      
      -- Storage
      storage_type TEXT NOT NULL DEFAULT 'local' CHECK (storage_type IN ('local', 's3', 'gcs', 'azure')),
      storage_path TEXT NOT NULL,
      storage_url TEXT,
      
      -- Optional thumbnail for images
      thumbnail_path TEXT,
      thumbnail_url TEXT,
      
      -- File hash for integrity
      file_hash TEXT,
      
      -- Uploader
      uploaded_by_type TEXT NOT NULL DEFAULT 'user' CHECK (uploaded_by_type IN ('user', 'agent', 'system')),
      uploaded_by_id TEXT,
      
      -- Timestamps
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      
      -- Foreign Keys
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (comment_id) REFERENCES issue_comments(id) ON DELETE SET NULL
    );

    -- Attachment indexes
    CREATE INDEX IF NOT EXISTS idx_issue_attachments_issue ON issue_attachments(issue_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issue_attachments_comment ON issue_attachments(comment_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_issue_attachments_company ON issue_attachments(company_id) WHERE deleted_at IS NULL;
  `);

  // ============================================
  // ISSUE_READ_STATES TABLE - Track read/unread
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_read_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      
      -- Read state
      is_read BOOLEAN DEFAULT 0,
      read_at DATETIME,
      
      -- Last seen comment (for tracking new comments)
      last_seen_comment_id TEXT,
      last_seen_at DATETIME,
      
      -- Notification preferences
      notify_on_update BOOLEAN DEFAULT 1,
      
      -- Timestamps
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Constraints
      UNIQUE(issue_id, user_id),
      
      -- Foreign Keys
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Read state indexes
    CREATE INDEX IF NOT EXISTS idx_issue_read_states_issue ON issue_read_states(issue_id);
    CREATE INDEX IF NOT EXISTS idx_issue_read_states_user ON issue_read_states(user_id);
    CREATE INDEX IF NOT EXISTS idx_issue_read_states_unread ON issue_read_states(user_id, is_read) WHERE is_read = 0;
    CREATE INDEX IF NOT EXISTS idx_issue_read_states_company ON issue_read_states(company_id);
  `);

  // ============================================
  // ISSUE_ASSIGNMENT_HISTORY TABLE - Track assignments
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS issue_assignment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      
      -- Assignment change
      previous_assignee_type TEXT CHECK (previous_assignee_type IN ('user', 'agent')),
      previous_assignee_id TEXT,
      new_assignee_type TEXT CHECK (new_assignee_type IN ('user', 'agent')),
      new_assignee_id TEXT,
      
      -- Who made the change
      changed_by_type TEXT NOT NULL CHECK (changed_by_type IN ('user', 'agent', 'system')),
      changed_by_id TEXT,
      change_reason TEXT,
      
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Foreign Keys
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Assignment history indexes
    CREATE INDEX IF NOT EXISTS idx_issue_assignment_history_issue ON issue_assignment_history(issue_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_issue_assignment_history_company ON issue_assignment_history(company_id);
  `);

  // ============================================
  // UPDATE TRIGGERS
  // ============================================
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_issues_updated_at
    AFTER UPDATE ON issues
    FOR EACH ROW
    BEGIN
      UPDATE issues SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_issue_labels_updated_at
    AFTER UPDATE ON issue_labels
    FOR EACH ROW
    BEGIN
      UPDATE issue_labels SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_issue_read_states_updated_at
    AFTER UPDATE ON issue_read_states
    FOR EACH ROW
    BEGIN
      UPDATE issue_read_states SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  // ============================================
  // SEED DEFAULT LABELS
  // ============================================
  // Create default labels for existing companies
  const companies = db.prepare('SELECT id FROM companies WHERE deleted_at IS NULL').all();
  const defaultLabels = [
    { name: 'bug', color: '#EF4444', description: 'Something is broken' },
    { name: 'feature', color: '#3B82F6', description: 'New feature request' },
    { name: 'enhancement', color: '#10B981', description: 'Improve existing feature' },
    { name: 'documentation', color: '#8B5CF6', description: 'Documentation improvements' },
    { name: 'help wanted', color: '#F59E0B', description: 'Extra attention needed' },
    { name: 'good first issue', color: '#14B8A6', description: 'Good for newcomers' }
  ];

  const insertLabel = db.prepare(`
    INSERT OR IGNORE INTO issue_labels (company_id, name, color, description, is_system)
    VALUES (?, ?, ?, ?, 1)
  `);

  for (const company of companies) {
    for (const label of defaultLabels) {
      insertLabel.run(company.id, label.name, label.color, label.description);
    }
  }

  console.log('[Migration 012] Issue system created successfully');
}

/**
 * Rollback issue system migration
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.pragma('foreign_keys = OFF');

  try {
    // Drop triggers first
    db.exec(`
      DROP TRIGGER IF EXISTS trg_issues_updated_at;
      DROP TRIGGER IF EXISTS trg_issue_labels_updated_at;
      DROP TRIGGER IF EXISTS trg_issue_read_states_updated_at;
    `);

    // Drop tables in reverse order of dependencies
    db.exec(`
      DROP TABLE IF EXISTS issue_assignment_history;
      DROP TABLE IF EXISTS issue_read_states;
      DROP TABLE IF EXISTS issue_attachments;
      DROP TABLE IF EXISTS issue_label_links;
      DROP TABLE IF EXISTS issue_labels;
      DROP TABLE IF EXISTS issue_comments;
      DROP TABLE IF EXISTS issues;
    `);

    console.log('[Migration 012] Issue system removed');
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
