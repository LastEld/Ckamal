/**
 * @fileoverview Migration 019: CEO Chat System
 * 
 * Creates tables for the CEO Chat feature:
 * - chat_threads: Top-level conversation threads
 * - chat_messages: Individual messages within threads
 * - chat_participants: Thread participant tracking
 * - chat_reactions: Message reactions
 * - chat_attachments: File attachments to messages
 * 
 * Inspired by Paperclip's chat patterns with CEO agent integration
 */

/**
 * Apply CEO Chat migration
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.pragma('foreign_keys = ON');

  // ============================================
  // CHAT_THREADS - Conversation threads
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      
      -- Thread identification
      title TEXT NOT NULL,
      description TEXT,
      
      -- Thread type and status
      kind TEXT NOT NULL DEFAULT 'question' 
        CHECK (kind IN ('task', 'strategy', 'question', 'decision')),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'resolved', 'closed', 'archived')),
      priority TEXT DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      
      -- Linked entities
      issue_id TEXT,
      approval_id TEXT,
      task_id INTEGER,
      
      -- Thread metadata
      created_by_type TEXT NOT NULL DEFAULT 'user'
        CHECK (created_by_type IN ('user', 'agent', 'system')),
      created_by_id TEXT NOT NULL,
      assigned_to_type TEXT
        CHECK (assigned_to_type IN ('user', 'agent')),
      assigned_to_id TEXT,
      
      -- Statistics
      message_count INTEGER DEFAULT 0,
      unread_count INTEGER DEFAULT 0,
      
      -- Timestamps
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      closed_at DATETIME,
      
      -- Foreign keys
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE SET NULL,
      FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL
    );

    -- Thread indexes
    CREATE INDEX IF NOT EXISTS idx_chat_threads_company ON chat_threads(company_id);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_company_status ON chat_threads(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_kind ON chat_threads(kind);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_assigned ON chat_threads(assigned_to_type, assigned_to_id);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_updated ON chat_threads(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_threads_issue ON chat_threads(issue_id) WHERE issue_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_chat_threads_approval ON chat_threads(approval_id) WHERE approval_id IS NOT NULL;
  `);

  // ============================================
  // CHAT_MESSAGES - Individual messages
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      thread_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      
      -- Message content
      content TEXT NOT NULL,
      content_type TEXT DEFAULT 'text'
        CHECK (content_type IN ('text', 'markdown', 'system', 'action')),
      
      -- Author info
      author_type TEXT NOT NULL
        CHECK (author_type IN ('user', 'agent', 'system', 'ceo')),
      author_id TEXT NOT NULL,
      author_name TEXT,
      
      -- Threading (for nested replies)
      parent_id TEXT,
      thread_root_id TEXT,
      
      -- Message metadata
      is_edited BOOLEAN DEFAULT 0,
      is_deleted BOOLEAN DEFAULT 0,
      is_system BOOLEAN DEFAULT 0,
      
      -- Action data (for action messages)
      action_type TEXT,
      action_data TEXT, -- JSON
      action_status TEXT CHECK (action_status IN ('pending', 'completed', 'failed')),
      
      -- CEO agent specific
      ceo_context TEXT, -- JSON: relevant context CEO used
      ceo_suggestions TEXT, -- JSON: actionable suggestions
      
      -- Timestamps
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      
      -- Foreign keys
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
      FOREIGN KEY (thread_root_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Message indexes
    CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_parent ON chat_messages(parent_id) WHERE parent_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_chat_messages_author ON chat_messages(author_type, author_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_ceo ON chat_messages(author_type) WHERE author_type = 'ceo';
    CREATE INDEX IF NOT EXISTS idx_chat_messages_action ON chat_messages(action_status) WHERE action_status IS NOT NULL;
  `);

  // ============================================
  // CHAT_PARTICIPANTS - Thread participants
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_participants (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      thread_id TEXT NOT NULL,
      participant_type TEXT NOT NULL
        CHECK (participant_type IN ('user', 'agent')),
      participant_id TEXT NOT NULL,
      
      -- Participant settings
      role TEXT DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'member', 'watcher')),
      notifications_enabled BOOLEAN DEFAULT 1,
      
      -- Read tracking
      last_read_at DATETIME,
      last_read_message_id TEXT,
      unread_count INTEGER DEFAULT 0,
      
      -- Timestamps
      joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      left_at DATETIME,
      
      -- Foreign keys
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
      UNIQUE(thread_id, participant_type, participant_id)
    );

    -- Participant indexes
    CREATE INDEX IF NOT EXISTS idx_chat_participants_thread ON chat_participants(thread_id);
    CREATE INDEX IF NOT EXISTS idx_chat_participants_participant ON chat_participants(participant_type, participant_id);
    CREATE INDEX IF NOT EXISTS idx_chat_participants_active ON chat_participants(thread_id) WHERE left_at IS NULL;
  `);

  // ============================================
  // CHAT_REACTIONS - Message reactions
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_reactions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      message_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      
      -- Reactor info
      reactor_type TEXT NOT NULL
        CHECK (reactor_type IN ('user', 'agent')),
      reactor_id TEXT NOT NULL,
      
      -- Reaction
      reaction TEXT NOT NULL, -- emoji or shortcode
      
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Foreign keys
      FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
      UNIQUE(message_id, reactor_type, reactor_id, reaction)
    );

    -- Reaction indexes
    CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);
    CREATE INDEX IF NOT EXISTS idx_chat_reactions_thread ON chat_reactions(thread_id);
  `);

  // ============================================
  // CHAT_ATTACHMENTS - File attachments
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_attachments (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      message_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      
      -- File info
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT, -- stored file path
      file_url TEXT, -- external URL if applicable
      
      -- Metadata
      uploaded_by_type TEXT NOT NULL,
      uploaded_by_id TEXT NOT NULL,
      
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Foreign keys
      FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Attachment indexes
    CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON chat_attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_chat_attachments_thread ON chat_attachments(thread_id);
  `);

  // ============================================
  // CHAT_READ_STATES - User read state per thread
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_read_states (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      thread_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      
      -- Read tracking
      last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_read_message_id TEXT,
      unread_count INTEGER DEFAULT 0,
      
      -- Notification preferences
      muted_until DATETIME,
      
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Foreign keys
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      UNIQUE(thread_id, user_id)
    );

    -- Read state indexes
    CREATE INDEX IF NOT EXISTS idx_chat_read_states_user ON chat_read_states(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_read_states_thread ON chat_read_states(thread_id);
    CREATE INDEX IF NOT EXISTS idx_chat_read_states_unread ON chat_read_states(user_id, unread_count) WHERE unread_count > 0;
  `);

  // ============================================
  // Update triggers
  // ============================================
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_chat_threads_updated_at
    AFTER UPDATE ON chat_threads
    FOR EACH ROW
    BEGIN
      UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_chat_messages_updated_at
    AFTER UPDATE ON chat_messages
    FOR EACH ROW
    BEGIN
      UPDATE chat_messages SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_chat_read_states_updated
    AFTER UPDATE ON chat_read_states
    FOR EACH ROW
    BEGIN
      UPDATE chat_read_states SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  // ============================================
  // CEO_AGENT_PRESENCE - Track CEO agent availability
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS ceo_agent_presence (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      
      -- Presence status
      status TEXT DEFAULT 'available'
        CHECK (status IN ('available', 'busy', 'away', 'offline')),
      
      -- Current activity
      current_thread_id TEXT,
      activity_description TEXT,
      
      -- Statistics
      threads_handled INTEGER DEFAULT 0,
      messages_sent INTEGER DEFAULT 0,
      avg_response_time_seconds INTEGER,
      
      -- Capabilities
      capabilities TEXT DEFAULT '["strategy", "analysis", "decision_support", "task_planning"]',
      
      -- Timestamps
      last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      
      -- Foreign keys
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      UNIQUE(company_id)
    );

    CREATE TRIGGER IF NOT EXISTS trg_ceo_agent_presence_updated
    AFTER UPDATE ON ceo_agent_presence
    FOR EACH ROW
    BEGIN
      UPDATE ceo_agent_presence SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  console.log('[Migration 019] CEO Chat system tables created successfully');
}

/**
 * Rollback CEO Chat migration
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.pragma('foreign_keys = OFF');

  try {
    // Drop triggers first
    db.exec(`
      DROP TRIGGER IF EXISTS trg_chat_threads_updated_at;
      DROP TRIGGER IF EXISTS trg_chat_messages_updated_at;
      DROP TRIGGER IF EXISTS trg_chat_read_states_updated;
      DROP TRIGGER IF EXISTS trg_ceo_agent_presence_updated;
    `);

    // Drop tables in reverse order of dependencies
    db.exec(`
      DROP TABLE IF EXISTS ceo_agent_presence;
      DROP TABLE IF EXISTS chat_read_states;
      DROP TABLE IF EXISTS chat_attachments;
      DROP TABLE IF EXISTS chat_reactions;
      DROP TABLE IF EXISTS chat_participants;
      DROP TABLE IF EXISTS chat_messages;
      DROP TABLE IF EXISTS chat_threads;
    `);

    console.log('[Migration 019] CEO Chat system tables removed');
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
