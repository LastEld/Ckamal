/**
 * CogniMesh v5.0 - Performance Indexes Migration
 * Adds composite indexes, FTS5 full-text search, partial indexes, and vector search support
 */

/**
 * Apply performance indexes
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  // ============================================
  // COMPOSITE INDEXES for common query patterns
  // ============================================

  // Users: common lookup patterns
  db.exec(`
    -- Active users by role and status
    CREATE INDEX IF NOT EXISTS idx_users_role_status 
      ON users(role, status) 
      WHERE deleted_at IS NULL;
    
    -- Users by login recency
    CREATE INDEX IF NOT EXISTS idx_users_last_login 
      ON users(last_login_at DESC) 
      WHERE deleted_at IS NULL AND status = 'active';
  `);

  // Tasks: workflow and queue patterns
  db.exec(`
    -- Task queue: pending tasks by priority
    CREATE INDEX IF NOT EXISTS idx_tasks_queue 
      ON tasks(status, priority DESC, created_at) 
      WHERE deleted_at IS NULL AND status IN ('pending', 'queued', 'retrying');
    
    -- Tasks by assignee and status
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status 
      ON tasks(assignee_id, status, updated_at DESC) 
      WHERE deleted_at IS NULL;
    
    -- Overdue tasks
    CREATE INDEX IF NOT EXISTS idx_tasks_overdue 
      ON tasks(deadline_at, status) 
      WHERE deleted_at IS NULL 
        AND deadline_at IS NOT NULL 
        AND status NOT IN ('completed', 'cancelled', 'failed');
    
    -- Task hierarchy
    CREATE INDEX IF NOT EXISTS idx_tasks_hierarchy 
      ON tasks(parent_id, status, priority DESC) 
      WHERE deleted_at IS NULL;
  `);

  // Roadmaps and nodes
  db.exec(`
    -- Active roadmaps with node counts
    CREATE INDEX IF NOT EXISTS idx_roadmaps_active 
      ON roadmaps(owner_id, status, updated_at DESC) 
      WHERE deleted_at IS NULL AND status = 'active';
    
    -- Roadmap nodes by type and status
    CREATE INDEX IF NOT EXISTS idx_nodes_type_status 
      ON roadmap_nodes(roadmap_id, node_type, status) 
      WHERE deleted_at IS NULL;
    
    -- Roadmap dependency resolution
    CREATE INDEX IF NOT EXISTS idx_nodes_dependencies 
      ON roadmap_nodes(roadmap_id, status, completed_at) 
      WHERE deleted_at IS NULL AND node_type = 'milestone';
  `);

  // Contexts and conversations
  db.exec(`
    -- Contexts by type and access
    CREATE INDEX IF NOT EXISTS idx_contexts_access 
      ON contexts(context_type, visibility, last_accessed_at DESC) 
      WHERE deleted_at IS NULL;
    
    -- Conversations by context and recency
    CREATE INDEX IF NOT EXISTS idx_conversations_recent 
      ON conversations(context_id, last_message_at DESC) 
      WHERE deleted_at IS NULL AND status = 'active';
    
    -- Messages by conversation and type
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_type 
      ON messages(conversation_id, message_type, sent_at DESC) 
      WHERE is_deleted = 0;
  `);

  // Analytics and audit
  db.exec(`
    -- Time-series analytics queries
    CREATE INDEX IF NOT EXISTS idx_analytics_timeseries 
      ON analytics(metric_name, bucket_date, bucket_hour, value) 
      WHERE sampled = 0;
    
    -- Audit log by entity and time
    CREATE INDEX IF NOT EXISTS idx_audit_entity_time 
      ON audit_logs(entity_type, entity_id, timestamp DESC);
    
    -- Audit log by user and action
    CREATE INDEX IF NOT EXISTS idx_audit_user_action 
      ON audit_logs(user_id, action, timestamp DESC);
  `);

  // Batches and alerts
  db.exec(`
    -- Active batches by type
    CREATE INDEX IF NOT EXISTS idx_batches_active 
      ON batches(batch_type, status, created_at DESC) 
      WHERE deleted_at IS NULL AND status IN ('pending', 'queued', 'running', 'paused');
    
    -- Unresolved alerts
    CREATE INDEX IF NOT EXISTS idx_alerts_unresolved 
      ON alerts(severity DESC, created_at) 
      WHERE status IN ('unread', 'read') AND (expires_at IS NULL OR expires_at > datetime('now'));
    
    -- Alerts by source
    CREATE INDEX IF NOT EXISTS idx_alerts_source_time 
      ON alerts(source, created_at DESC) 
      WHERE deleted_at IS NULL;
  `);

  // ============================================
  // FTS5 FULL-TEXT SEARCH VIRTUAL TABLES
  // ============================================

  // Messages FTS5 table
  db.exec(`
    -- External content FTS5 table for messages
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      content_rowid='id',
      content='messages'
    );

    -- Triggers to keep FTS index in sync
    CREATE TRIGGER IF NOT EXISTS trg_messages_fts_insert
    AFTER INSERT ON messages
    BEGIN
      INSERT INTO messages_fts(rowid, content)
      VALUES (NEW.id, COALESCE(NEW.content_plain, NEW.content));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_messages_fts_update
    AFTER UPDATE ON messages
    WHEN OLD.content != NEW.content OR OLD.content_plain != NEW.content_plain
    BEGIN
      UPDATE messages_fts SET content = COALESCE(NEW.content_plain, NEW.content)
      WHERE rowid = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_messages_fts_delete
    AFTER DELETE ON messages
    BEGIN
      DELETE FROM messages_fts WHERE rowid = OLD.id;
    END;
  `);

  // Tasks FTS5 table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
      title,
      description,
      content_rowid='id',
      content='tasks'
    );

    CREATE TRIGGER IF NOT EXISTS trg_tasks_fts_insert
    AFTER INSERT ON tasks
    BEGIN
      INSERT INTO tasks_fts(rowid, title, description)
      VALUES (NEW.id, NEW.title, NEW.description);
    END;

    CREATE TRIGGER IF NOT EXISTS trg_tasks_fts_update
    AFTER UPDATE ON tasks
    WHEN OLD.title != NEW.title OR OLD.description != NEW.description
    BEGIN
      UPDATE tasks_fts SET title = NEW.title, description = NEW.description
      WHERE rowid = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_tasks_fts_delete
    AFTER DELETE ON tasks
    BEGIN
      DELETE FROM tasks_fts WHERE rowid = OLD.id;
    END;
  `);

  // Contexts FTS5 table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS contexts_fts USING fts5(
      name,
      description,
      content_rowid='id',
      content='contexts'
    );

    CREATE TRIGGER IF NOT EXISTS trg_contexts_fts_insert
    AFTER INSERT ON contexts
    BEGIN
      INSERT INTO contexts_fts(rowid, name, description)
      VALUES (NEW.id, NEW.name, NEW.description);
    END;

    CREATE TRIGGER IF NOT EXISTS trg_contexts_fts_update
    AFTER UPDATE ON contexts
    WHEN OLD.name != NEW.name OR OLD.description != NEW.description
    BEGIN
      UPDATE contexts_fts SET name = NEW.name, description = NEW.description
      WHERE rowid = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_contexts_fts_delete
    AFTER DELETE ON contexts
    BEGIN
      DELETE FROM contexts_fts WHERE rowid = OLD.id;
    END;
  `);

  // ============================================
  // PARTIAL INDEXES for specific query patterns
  // ============================================

  // High priority tasks
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_high_priority 
      ON tasks(created_at) 
      WHERE deleted_at IS NULL AND priority <= 3;
  `);

  // Recently updated entities
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_recently_updated 
      ON tasks(updated_at DESC) 
      WHERE deleted_at IS NULL AND updated_at > datetime('now', '-7 days');
    
    CREATE INDEX IF NOT EXISTS idx_roadmaps_recently_updated 
      ON roadmaps(updated_at DESC) 
      WHERE deleted_at IS NULL AND updated_at > datetime('now', '-7 days');
  `);

  // Public/shared contexts
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contexts_public 
      ON contexts(name) 
      WHERE deleted_at IS NULL AND visibility IN ('public', 'shared');
  `);

  // Messages needing attention (errors, tool results)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_attention 
      ON messages(conversation_id, sent_at DESC) 
      WHERE is_deleted = 0 AND message_type IN ('error', 'tool_result');
  `);

  // Unacknowledged critical alerts
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alerts_critical 
      ON alerts(alert_type, created_at) 
      WHERE status = 'unread' AND severity <= 2;
  `);

  // ============================================
  // VECTOR SEARCH SUPPORT (sqlite-vec extension)
  // ============================================

  // Document chunks for RAG (created regardless of vec0 availability)
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      context_id INTEGER NOT NULL,
      document_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      char_count INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE,
      UNIQUE(context_id, document_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_context ON document_chunks(context_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
  `);

  // Vector embeddings tables (optional - only if sqlite-vec is available)
  try {
    // Vector embeddings table for contexts
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS context_embeddings USING vec0(
      embedding FLOAT[768]
    );
    `);

    // Vector embeddings table for messages
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS message_embeddings USING vec0(
        embedding FLOAT[768]
      );
    `);

    // Vector storage for chunks (separate from metadata)
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding FLOAT[768]
      );
    `);
  } catch (err) {
    // sqlite-vec extension not available, skip vector tables
    // This is expected in environments without the extension
  }

  // ============================================
  // COVERING INDEXES for common queries
  // ============================================

  // Task list view (covers most columns needed)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_list_view 
      ON tasks(status, priority DESC, title, updated_at, assignee_id, task_type) 
      WHERE deleted_at IS NULL;
  `);

  // Conversation list view
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_list 
      ON conversations(status, last_message_at DESC, title, message_count) 
      WHERE deleted_at IS NULL;
  `);

  // ============================================
  // INDEX STATISTICS TABLE
  // ============================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS index_statistics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      index_name TEXT NOT NULL UNIQUE,
      table_name TEXT NOT NULL,
      index_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_analyzed_at DATETIME,
      estimated_rows INTEGER,
      estimated_selectivity REAL,
      query_count INTEGER DEFAULT 0,
      avg_query_time_ms REAL,
      metadata TEXT DEFAULT '{}'
    );
  `);
}

/**
 * Rollback performance indexes
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  // Drop FTS5 triggers first
  db.exec(`
    DROP TRIGGER IF EXISTS trg_messages_fts_insert;
    DROP TRIGGER IF EXISTS trg_messages_fts_update;
    DROP TRIGGER IF EXISTS trg_messages_fts_delete;
    DROP TRIGGER IF EXISTS trg_tasks_fts_insert;
    DROP TRIGGER IF EXISTS trg_tasks_fts_update;
    DROP TRIGGER IF EXISTS trg_tasks_fts_delete;
    DROP TRIGGER IF EXISTS trg_contexts_fts_insert;
    DROP TRIGGER IF EXISTS trg_contexts_fts_update;
    DROP TRIGGER IF EXISTS trg_contexts_fts_delete;
  `);

  // Drop FTS5 tables
  db.exec(`
    DROP TABLE IF EXISTS messages_fts;
    DROP TABLE IF EXISTS tasks_fts;
    DROP TABLE IF EXISTS contexts_fts;
    DROP TABLE IF EXISTS chunk_embeddings;
    DROP TABLE IF EXISTS context_embeddings;
    DROP TABLE IF EXISTS message_embeddings;
  `);

  // Drop document chunks table
  db.exec(`DROP TABLE IF EXISTS document_chunks`);

  // Drop index statistics
  db.exec(`DROP TABLE IF EXISTS index_statistics`);

  // Drop composite indexes
  const indexes = [
    // Users
    'idx_users_role_status', 'idx_users_last_login',
    // Tasks
    'idx_tasks_queue', 'idx_tasks_assignee_status', 'idx_tasks_overdue',
    'idx_tasks_hierarchy', 'idx_tasks_high_priority', 'idx_tasks_recently_updated',
    'idx_tasks_list_view',
    // Roadmaps
    'idx_roadmaps_active', 'idx_roadmaps_recently_updated',
    // Nodes
    'idx_nodes_type_status', 'idx_nodes_dependencies',
    // Contexts
    'idx_contexts_access', 'idx_contexts_public',
    // Conversations
    'idx_conversations_recent', 'idx_conversations_list',
    // Messages
    'idx_messages_conversation_type', 'idx_messages_attention',
    // Analytics & Audit
    'idx_analytics_timeseries', 'idx_audit_entity_time', 'idx_audit_user_action',
    // Batches & Alerts
    'idx_batches_active', 'idx_alerts_unresolved', 'idx_alerts_critical', 'idx_alerts_source_time'
  ];

  for (const index of indexes) {
    db.exec(`DROP INDEX IF EXISTS ${index}`);
  }
}
