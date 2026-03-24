-- ============================================================================
-- CogniMesh v5.0 - Complete Database Schema Reference
-- SQLite-compatible with foreign keys, soft deletes, and audit trail support
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- USERS - Core user accounts
-- ----------------------------------------------------------------------------
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
    preferences TEXT DEFAULT '{}',
    last_login_at DATETIME,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    deleted_by INTEGER,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status ON users(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role_status ON users(role, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_last_login ON users(last_login_at DESC) WHERE deleted_at IS NULL AND status = 'active';

-- ----------------------------------------------------------------------------
-- TASKS - Agent tasks and workflow items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    parent_id INTEGER,
    assignee_id INTEGER,
    creator_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'retrying')),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    task_type TEXT DEFAULT 'generic' CHECK (task_type IN ('generic', 'agent', 'analysis', 'generation', 'review', 'integration', 'notification')),
    input_data TEXT DEFAULT '{}',
    output_data TEXT DEFAULT '{}',
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

CREATE INDEX idx_tasks_parent ON tasks(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_type ON tasks(task_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_priority ON tasks(priority) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_deadline ON tasks(deadline_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_queue ON tasks(status, priority DESC, created_at) WHERE deleted_at IS NULL AND status IN ('pending', 'queued', 'retrying');
CREATE INDEX idx_tasks_assignee_status ON tasks(assignee_id, status, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_overdue ON tasks(deadline_at, status) WHERE deleted_at IS NULL AND deadline_at IS NOT NULL AND status NOT IN ('completed', 'cancelled', 'failed');

-- ----------------------------------------------------------------------------
-- ROADMAPS - Project roadmaps and milestones
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roadmaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    owner_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'deleted')),
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'shared')),
    config TEXT DEFAULT '{}',
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

CREATE INDEX idx_roadmaps_owner ON roadmaps(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_roadmaps_status ON roadmaps(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_roadmaps_visibility ON roadmaps(visibility) WHERE deleted_at IS NULL;
CREATE INDEX idx_roadmaps_active ON roadmaps(owner_id, status, updated_at DESC) WHERE deleted_at IS NULL AND status = 'active';

-- ----------------------------------------------------------------------------
-- ROADMAP_NODES - Nodes within roadmaps
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roadmap_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    roadmap_id INTEGER NOT NULL,
    parent_id INTEGER,
    linked_task_id INTEGER,
    node_type TEXT DEFAULT 'task' CHECK (node_type IN ('milestone', 'task', 'decision', 'phase', 'goal', 'epic')),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'blocked', 'completed', 'cancelled')),
    position_x REAL DEFAULT 0,
    position_y REAL DEFAULT 0,
    config TEXT DEFAULT '{}',
    dependencies TEXT DEFAULT '[]',
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

CREATE INDEX idx_nodes_roadmap ON roadmap_nodes(roadmap_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_parent ON roadmap_nodes(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_task ON roadmap_nodes(linked_task_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_type ON roadmap_nodes(node_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_status ON roadmap_nodes(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_type_status ON roadmap_nodes(roadmap_id, node_type, status) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- CONTEXTS - Knowledge contexts and memory spaces
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    owner_id INTEGER,
    parent_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    context_type TEXT DEFAULT 'general' CHECK (context_type IN ('general', 'project', 'agent', 'session', 'knowledge', 'workflow')),
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'shared')),
    tags TEXT DEFAULT '[]',
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

CREATE INDEX idx_contexts_owner ON contexts(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contexts_parent ON contexts(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contexts_type ON contexts(context_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_contexts_visibility ON contexts(visibility) WHERE deleted_at IS NULL;
CREATE INDEX idx_contexts_access ON contexts(context_type, visibility, last_accessed_at DESC) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- CONVERSATIONS - Chat/communication threads
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    context_id INTEGER,
    creator_id INTEGER,
    title TEXT,
    conversation_type TEXT DEFAULT 'chat' CHECK (conversation_type IN ('chat', 'agent_session', 'workflow', 'task_thread', 'review')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived', 'deleted')),
    participant_ids TEXT DEFAULT '[]',
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

CREATE INDEX idx_conversations_context ON conversations(context_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_creator ON conversations(creator_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_type ON conversations(conversation_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_status ON conversations(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_last_msg ON conversations(last_message_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_recent ON conversations(context_id, last_message_at DESC) WHERE deleted_at IS NULL AND status = 'active';

-- ----------------------------------------------------------------------------
-- MESSAGES - Individual messages in conversations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    conversation_id INTEGER NOT NULL,
    parent_id INTEGER,
    sender_id INTEGER,
    sender_type TEXT DEFAULT 'user' CHECK (sender_type IN ('user', 'agent', 'system', 'tool')),
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'code', 'tool_call', 'tool_result', 'thinking', 'summary', 'error', 'notification')),
    content TEXT NOT NULL,
    content_plain TEXT,
    tokens_used INTEGER,
    metadata TEXT DEFAULT '{}',
    tool_calls TEXT,
    attachments TEXT DEFAULT '[]',
    edit_history TEXT,
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

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_parent ON messages(parent_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_type ON messages(message_type);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);

-- ============================================================================
-- AUDIT & INTEGRITY TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CHECKPOINTS - System state checkpoints
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    checkpoint_type TEXT DEFAULT 'manual' CHECK (checkpoint_type IN ('manual', 'auto', 'pre_migration', 'pre_deploy', 'scheduled')),
    name TEXT NOT NULL,
    description TEXT,
    state_data TEXT NOT NULL,
    state_hash TEXT NOT NULL,
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

CREATE INDEX idx_checkpoints_type ON checkpoints(checkpoint_type);
CREATE INDEX idx_checkpoints_created ON checkpoints(created_at);

-- ----------------------------------------------------------------------------
-- AUDIT_LOGS - Comprehensive audit trail
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    session_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    entity_uuid TEXT,
    old_values TEXT,
    new_values TEXT,
    changes_summary TEXT,
    ip_address TEXT,
    user_agent TEXT,
    request_id TEXT,
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);

-- ----------------------------------------------------------------------------
-- MERKLE_TREES - Data integrity trees
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merkle_trees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    tree_type TEXT NOT NULL,
    root_hash TEXT NOT NULL,
    leaf_count INTEGER NOT NULL DEFAULT 0,
    depth INTEGER NOT NULL DEFAULT 0,
    entity_type TEXT,
    entity_id TEXT,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finalized_at DATETIME,
    deleted_at DATETIME
);

CREATE INDEX idx_merkle_type ON merkle_trees(tree_type);
CREATE INDEX idx_merkle_root ON merkle_trees(root_hash);
CREATE INDEX idx_merkle_entity ON merkle_trees(entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- MERKLE_LEAVES - Individual merkle leaves
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merkle_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tree_id INTEGER NOT NULL,
    leaf_index INTEGER NOT NULL,
    leaf_hash TEXT NOT NULL,
    data_hash TEXT NOT NULL,
    data_reference TEXT,
    sibling_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tree_id) REFERENCES merkle_trees(id) ON DELETE CASCADE,
    UNIQUE(tree_id, leaf_index)
);

CREATE INDEX idx_leaves_tree ON merkle_leaves(tree_id);
CREATE INDEX idx_leaves_hash ON merkle_leaves(leaf_hash);

-- ============================================================================
-- SYSTEM TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BATCHES - Batch processing tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    batch_type TEXT NOT NULL CHECK (batch_type IN ('import', 'export', 'migration', 'processing', 'sync', 'cleanup')),
    name TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    config TEXT DEFAULT '{}',
    input_data TEXT,
    output_data TEXT,
    error_log TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    created_by INTEGER,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_batches_type ON batches(batch_type);
CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batches_created_by ON batches(created_by);

-- ----------------------------------------------------------------------------
-- ALERTS - System alerts and notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    alert_type TEXT NOT NULL CHECK (alert_type IN ('info', 'warning', 'error', 'critical', 'security', 'system')),
    severity INTEGER DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    source TEXT,
    source_id TEXT,
    status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'acknowledged', 'resolved', 'dismissed')),
    acknowledged_by INTEGER,
    acknowledged_at DATETIME,
    resolved_by INTEGER,
    resolved_at DATETIME,
    auto_resolve BOOLEAN DEFAULT 0,
    auto_resolve_after INTEGER,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    deleted_at DATETIME,
    FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_source ON alerts(source);
CREATE INDEX idx_alerts_created ON alerts(created_at);

-- ----------------------------------------------------------------------------
-- ANALYTICS - Usage and performance metrics
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    metric_name TEXT NOT NULL,
    metric_type TEXT NOT NULL CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'timing', 'event')),
    value REAL NOT NULL,
    unit TEXT,
    dimensions TEXT DEFAULT '{}',
    entity_type TEXT,
    entity_id TEXT,
    session_id TEXT,
    user_id INTEGER,
    bucket_date DATE,
    bucket_hour INTEGER,
    sampled BOOLEAN DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_analytics_name ON analytics(metric_name);
CREATE INDEX idx_analytics_type ON analytics(metric_type);
CREATE INDEX idx_analytics_entity ON analytics(entity_type, entity_id);
CREATE INDEX idx_analytics_recorded ON analytics(recorded_at);

-- ----------------------------------------------------------------------------
-- SETTINGS - System and user settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    value_type TEXT DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'encrypted')),
    category TEXT DEFAULT 'general' CHECK (category IN ('general', 'security', 'notifications', 'integrations', 'ai', 'ui', 'system', 'experimental')),
    scope TEXT DEFAULT 'system' CHECK (scope IN ('system', 'user', 'organization', 'context')),
    scope_id TEXT,
    is_sensitive BOOLEAN DEFAULT 0,
    description TEXT,
    default_value TEXT,
    validation_regex TEXT,
    min_value REAL,
    max_value REAL,
    allowed_values TEXT,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_settings_key ON settings(key);
CREATE INDEX idx_settings_category ON settings(category);
CREATE INDEX idx_settings_scope ON settings(scope, scope_id);

-- ============================================================================
-- MIGRATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    batch INTEGER NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    checksum TEXT,
    execution_time_ms INTEGER
);

CREATE INDEX idx_migrations_batch ON migrations(batch);
CREATE INDEX idx_migrations_applied ON migrations(applied_at);

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
AFTER UPDATE ON tasks
FOR EACH ROW
BEGIN
    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_roadmaps_updated_at
AFTER UPDATE ON roadmaps
FOR EACH ROW
BEGIN
    UPDATE roadmaps SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_roadmap_nodes_updated_at
AFTER UPDATE ON roadmap_nodes
FOR EACH ROW
BEGIN
    UPDATE roadmap_nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_contexts_updated_at
AFTER UPDATE ON contexts
FOR EACH ROW
BEGIN
    UPDATE contexts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_conversations_updated_at
AFTER UPDATE ON conversations
FOR EACH ROW
BEGIN
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_batches_updated_at
AFTER UPDATE ON batches
FOR EACH ROW
BEGIN
    UPDATE batches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_settings_updated_at
AFTER UPDATE ON settings
FOR EACH ROW
BEGIN
    UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
