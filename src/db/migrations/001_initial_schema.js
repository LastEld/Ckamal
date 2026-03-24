/**
 * CogniMesh v5.0 - Initial Database Schema
 * Creates core tables with foreign keys, indexes, timestamps, and soft deletes
 */

/**
 * Apply initial schema
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // ============================================
  // USERS - Core user accounts
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      email TEXT UNIQUE,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_hash TEXT,
      avatar_url TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
      role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user', 'guest', 'service')),
      preferences TEXT DEFAULT '{}', -- JSON object
      last_login_at DATETIME,
      metadata TEXT DEFAULT '{}', -- JSON object for extensibility
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME, -- Soft delete
      deleted_by INTEGER,
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
  `);

  // ============================================
  // TASKS - Agent tasks and workflow items
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      parent_id INTEGER,
      assignee_id INTEGER,
      creator_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'queued', 'running', 'paused', 
        'completed', 'failed', 'cancelled', 'retrying'
      )),
      priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
      task_type TEXT DEFAULT 'generic' CHECK (task_type IN (
        'generic', 'agent', 'analysis', 'generation', 
        'review', 'integration', 'notification'
      )),
      input_data TEXT DEFAULT '{}', -- JSON input
      output_data TEXT DEFAULT '{}', -- JSON output
      result_summary TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      deadline_at DATETIME,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      deleted_by INTEGER,
      FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
  `);

  // ============================================
  // ROADMAPS - Project roadmaps and milestones
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS roadmaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      owner_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'deleted')),
      visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'shared')),
      config TEXT DEFAULT '{}', -- JSON configuration
      started_at DATETIME,
      target_at DATETIME,
      completed_at DATETIME,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      deleted_by INTEGER,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_roadmaps_owner ON roadmaps(owner_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_roadmaps_status ON roadmaps(status) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_roadmaps_visibility ON roadmaps(visibility) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_roadmaps_deleted_at ON roadmaps(deleted_at);
  `);

  // ============================================
  // ROADMAP_NODES - Nodes within roadmaps (tasks, milestones, etc.)
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS roadmap_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      roadmap_id INTEGER NOT NULL,
      parent_id INTEGER,
      linked_task_id INTEGER,
      node_type TEXT DEFAULT 'task' CHECK (node_type IN (
        'milestone', 'task', 'decision', 'phase', 'goal', 'epic'
      )),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'blocked', 'completed', 'cancelled')),
      position_x REAL DEFAULT 0,
      position_y REAL DEFAULT 0,
      config TEXT DEFAULT '{}',
      dependencies TEXT DEFAULT '[]', -- JSON array of node IDs
      started_at DATETIME,
      completed_at DATETIME,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (roadmap_id) REFERENCES roadmaps(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES roadmap_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_roadmap ON roadmap_nodes(roadmap_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_nodes_parent ON roadmap_nodes(parent_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_nodes_task ON roadmap_nodes(linked_task_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_nodes_type ON roadmap_nodes(node_type) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_nodes_status ON roadmap_nodes(status) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_nodes_deleted_at ON roadmap_nodes(deleted_at);
  `);

  // ============================================
  // CONTEXTS - Knowledge contexts and memory spaces
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      owner_id INTEGER,
      parent_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      context_type TEXT DEFAULT 'general' CHECK (context_type IN (
        'general', 'project', 'agent', 'session', 'knowledge', 'workflow'
      )),
      visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'shared')),
      tags TEXT DEFAULT '[]', -- JSON array
      config TEXT DEFAULT '{}',
      embedding_model TEXT,
      vector_dimension INTEGER,
      document_count INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      last_accessed_at DATETIME,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      deleted_by INTEGER,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (parent_id) REFERENCES contexts(id) ON DELETE CASCADE,
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_contexts_owner ON contexts(owner_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_contexts_parent ON contexts(parent_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_contexts_type ON contexts(context_type) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_contexts_visibility ON contexts(visibility) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_contexts_deleted_at ON contexts(deleted_at);
  `);

  // ============================================
  // CONVERSATIONS - Chat/communication threads
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      context_id INTEGER,
      creator_id INTEGER,
      title TEXT,
      conversation_type TEXT DEFAULT 'chat' CHECK (conversation_type IN (
        'chat', 'agent_session', 'workflow', 'task_thread', 'review'
      )),
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived', 'deleted')),
      participant_ids TEXT DEFAULT '[]', -- JSON array of user IDs
      message_count INTEGER DEFAULT 0,
      token_count INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      last_message_at DATETIME,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      deleted_by INTEGER,
      FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE SET NULL,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_context ON conversations(context_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_conversations_creator ON conversations(creator_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(conversation_type) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at ON conversations(deleted_at);
  `);

  // ============================================
  // MESSAGES - Individual messages in conversations
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      conversation_id INTEGER NOT NULL,
      parent_id INTEGER,
      sender_id INTEGER,
      sender_type TEXT DEFAULT 'user' CHECK (sender_type IN ('user', 'agent', 'system', 'tool')),
      message_type TEXT DEFAULT 'text' CHECK (message_type IN (
        'text', 'image', 'file', 'code', 'tool_call', 'tool_result', 
        'thinking', 'summary', 'error', 'notification'
      )),
      content TEXT NOT NULL,
      content_plain TEXT, -- Plain text version for search
      tokens_used INTEGER,
      metadata TEXT DEFAULT '{}', -- JSON: model, temperature, etc.
      tool_calls TEXT, -- JSON array of tool calls
      attachments TEXT DEFAULT '[]', -- JSON array of attachment references
      edit_history TEXT, -- JSON array of previous versions
      is_deleted BOOLEAN DEFAULT 0,
      deleted_by INTEGER,
      deleted_reason TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      edited_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE SET NULL,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);
    CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
    CREATE INDEX IF NOT EXISTS idx_messages_is_deleted ON messages(is_deleted) WHERE is_deleted = 0;
  `);

  // ============================================
  // CHECKPOINTS - System state checkpoints
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      checkpoint_type TEXT DEFAULT 'manual' CHECK (checkpoint_type IN (
        'manual', 'auto', 'pre_migration', 'pre_deploy', 'scheduled'
      )),
      name TEXT NOT NULL,
      description TEXT,
      state_data TEXT NOT NULL, -- JSON snapshot
      state_hash TEXT NOT NULL, -- SHA256 of state for integrity
      parent_checkpoint_id INTEGER,
      created_by INTEGER,
      restored_at DATETIME,
      restored_by INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (parent_checkpoint_id) REFERENCES checkpoints(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (restored_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_checkpoints_type ON checkpoints(checkpoint_type);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON checkpoints(created_at);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_parent ON checkpoints(parent_checkpoint_id);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_deleted_at ON checkpoints(deleted_at);
  `);

  // ============================================
  // AUDIT_LOGS - Comprehensive audit trail
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      session_id TEXT,
      action TEXT NOT NULL, -- create, update, delete, login, logout, etc.
      entity_type TEXT NOT NULL, -- table name or resource type
      entity_id TEXT, -- UUID or ID of affected entity
      entity_uuid TEXT, -- UUID if available
      old_values TEXT, -- JSON of previous state
      new_values TEXT, -- JSON of new state
      changes_summary TEXT, -- Human-readable summary
      ip_address TEXT,
      user_agent TEXT,
      request_id TEXT,
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_logs(request_id);
  `);

  // ============================================
  // MERKLE_TREES - Merkle tree storage for data integrity
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS merkle_trees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      tree_type TEXT NOT NULL, -- 'audit', 'message', 'document', etc.
      root_hash TEXT NOT NULL,
      leaf_count INTEGER NOT NULL DEFAULT 0,
      depth INTEGER NOT NULL DEFAULT 0,
      entity_type TEXT, -- Optional: associated entity type
      entity_id TEXT, -- Optional: associated entity ID
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finalized_at DATETIME,
      deleted_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_merkle_type ON merkle_trees(tree_type);
    CREATE INDEX IF NOT EXISTS idx_merkle_root ON merkle_trees(root_hash);
    CREATE INDEX IF NOT EXISTS idx_merkle_entity ON merkle_trees(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_merkle_created ON merkle_trees(created_at);
  `);

  // ============================================
  // MERKLE_LEAVES - Individual leaves in merkle trees
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS merkle_leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tree_id INTEGER NOT NULL,
      leaf_index INTEGER NOT NULL,
      leaf_hash TEXT NOT NULL,
      data_hash TEXT NOT NULL, -- Hash of actual data
      data_reference TEXT, -- Reference to actual data
      sibling_hash TEXT, -- For proof construction
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tree_id) REFERENCES merkle_trees(id) ON DELETE CASCADE,
      UNIQUE(tree_id, leaf_index)
    );

    CREATE INDEX IF NOT EXISTS idx_leaves_tree ON merkle_leaves(tree_id);
    CREATE INDEX IF NOT EXISTS idx_leaves_hash ON merkle_leaves(leaf_hash);
    CREATE INDEX IF NOT EXISTS idx_leaves_reference ON merkle_leaves(data_reference);
  `);

  // ============================================
  // BATCHES - Batch processing tracking
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      batch_type TEXT NOT NULL CHECK (batch_type IN (
        'import', 'export', 'migration', 'processing', 'sync', 'cleanup'
      )),
      name TEXT,
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled'
      )),
      total_items INTEGER DEFAULT 0,
      processed_items INTEGER DEFAULT 0,
      failed_items INTEGER DEFAULT 0,
      config TEXT DEFAULT '{}',
      input_data TEXT, -- JSON input parameters
      output_data TEXT, -- JSON results/summary
      error_log TEXT, -- JSON array of errors
      started_at DATETIME,
      completed_at DATETIME,
      created_by INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_batches_type ON batches(batch_type);
    CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
    CREATE INDEX IF NOT EXISTS idx_batches_created_by ON batches(created_by);
    CREATE INDEX IF NOT EXISTS idx_batches_created_at ON batches(created_at);
    CREATE INDEX IF NOT EXISTS idx_batches_deleted_at ON batches(deleted_at);
  `);

  // ============================================
  // ALERTS - System alerts and notifications
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      alert_type TEXT NOT NULL CHECK (alert_type IN (
        'info', 'warning', 'error', 'critical', 'security', 'system'
      )),
      severity INTEGER DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT, -- Component that generated the alert
      source_id TEXT, -- Optional ID of source entity
      status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'acknowledged', 'resolved', 'dismissed')),
      acknowledged_by INTEGER,
      acknowledged_at DATETIME,
      resolved_by INTEGER,
      resolved_at DATETIME,
      auto_resolve BOOLEAN DEFAULT 0,
      auto_resolve_after INTEGER, -- Seconds to auto-resolve
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      deleted_at DATETIME,
      FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts(source);
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_expires ON alerts(expires_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_deleted_at ON alerts(deleted_at);
  `);

  // ============================================
  // ANALYTICS - Usage and performance metrics
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      metric_name TEXT NOT NULL,
      metric_type TEXT NOT NULL CHECK (metric_type IN (
        'counter', 'gauge', 'histogram', 'timing', 'event'
      )),
      value REAL NOT NULL,
      unit TEXT, -- e.g., 'ms', 'bytes', 'count'
      dimensions TEXT DEFAULT '{}', -- JSON key-value pairs for filtering
      entity_type TEXT,
      entity_id TEXT,
      session_id TEXT,
      user_id INTEGER,
      bucket_date DATE, -- For time-series aggregation
      bucket_hour INTEGER, -- Hour of day (0-23)
      sampled BOOLEAN DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_name ON analytics(metric_name);
    CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics(metric_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_entity ON analytics(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics(user_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics(session_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_recorded ON analytics(recorded_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_bucket ON analytics(bucket_date, bucket_hour);
  `);

  // ============================================
  // SETTINGS - System and user settings
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      value_type TEXT DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'encrypted')),
      category TEXT DEFAULT 'general' CHECK (category IN (
        'general', 'security', 'notifications', 'integrations', 
        'ai', 'ui', 'system', 'experimental'
      )),
      scope TEXT DEFAULT 'system' CHECK (scope IN ('system', 'user', 'organization', 'context')),
      scope_id TEXT, -- ID within scope (user_id, org_id, etc.)
      is_sensitive BOOLEAN DEFAULT 0,
      description TEXT,
      default_value TEXT,
      validation_regex TEXT,
      min_value REAL,
      max_value REAL,
      allowed_values TEXT, -- JSON array of allowed values
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
    CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
    CREATE INDEX IF NOT EXISTS idx_settings_scope ON settings(scope, scope_id);
    CREATE INDEX IF NOT EXISTS idx_settings_updated ON settings(updated_at);
  `);

  // ============================================
  // Update triggers for updated_at
  // ============================================
  const tables = ['users', 'tasks', 'roadmaps', 'roadmap_nodes', 'contexts', 
                  'conversations', 'messages', 'batches', 'settings'];
  
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
}

/**
 * Rollback initial schema
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  // Disable foreign keys temporarily to avoid constraint issues during rollback
  db.pragma('foreign_keys = OFF');
  
  try {
    // Drop triggers first to avoid issues during table drops
    const triggerTables = ['users', 'tasks', 'roadmaps', 'roadmap_nodes', 
                           'contexts', 'conversations', 'messages', 'batches', 'settings'];
    
    for (const table of triggerTables) {
      db.exec(`DROP TRIGGER IF EXISTS trg_${table}_updated_at`);
    }
    
    // Drop in reverse order to respect foreign keys
    const tables = [
      'settings', 'analytics', 'alerts', 'batches',
      'merkle_leaves', 'merkle_trees', 'audit_logs', 'checkpoints',
      'messages', 'conversations', 'contexts', 'roadmap_nodes',
      'roadmaps', 'tasks', 'users'
    ];
    
    for (const table of tables) {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
    
    // Drop migrations table
    db.exec(`DROP TABLE IF EXISTS migrations`);
  } finally {
    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');
  }
}
