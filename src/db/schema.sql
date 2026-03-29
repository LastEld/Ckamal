-- ============================================================================
-- CogniMesh v5.0 - Complete Database Schema Reference
-- SQLite-compatible with foreign keys, soft deletes, and audit trail support
-- ============================================================================
--
-- THIS FILE IS A REFERENCE SCHEMA that combines all migrations (001-018+)
-- For actual database operations, use the migration system in src/db/migrations/
--
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================================
-- CORE AUTHENTICATION TABLES (from migration 006)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- COMPANIES - Multi-tenant organizations (from migrations 006/007)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    uuid TEXT UNIQUE,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
    pause_reason TEXT,
    paused_at DATETIME,
    
    -- Branding & Customization
    brand_color TEXT,
    logo_url TEXT,
    
    -- Billing & Limits
    budget_monthly_cents INTEGER DEFAULT 0,
    spent_monthly_cents INTEGER DEFAULT 0,
    
    -- Settings
    settings TEXT DEFAULT '{}',
    require_approval_for_agents BOOLEAN DEFAULT 0,
    
    -- Audit
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    deleted_by TEXT,
    
    -- Foreign Keys
    FOREIGN KEY (created_by) REFERENCES auth_users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES auth_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_companies_slug ON companies(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_created ON companies(created_at);
CREATE INDEX idx_companies_uuid ON companies(uuid) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_deleted_at ON companies(deleted_at) WHERE deleted_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- AUTH_USERS - Enhanced user authentication (from migration 006)
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_auth_users_email ON auth_users(email) WHERE status != 'deleted';
CREATE INDEX idx_auth_users_company ON auth_users(company_id) WHERE status = 'active';
CREATE INDEX idx_auth_users_status ON auth_users(status);
CREATE INDEX idx_auth_users_role ON auth_users(role) WHERE status = 'active';
CREATE INDEX idx_auth_users_created ON auth_users(created_at);

-- ----------------------------------------------------------------------------
-- AUTH_SESSIONS - Session management (from migration 006)
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX idx_auth_sessions_expires ON auth_sessions(expires_at);
CREATE INDEX idx_auth_sessions_created ON auth_sessions(created_at);

-- ----------------------------------------------------------------------------
-- AUTH_ACCOUNTS - OAuth provider accounts (from migration 006)
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_auth_accounts_user ON auth_accounts(user_id);
CREATE INDEX idx_auth_accounts_provider ON auth_accounts(provider_id, account_id);

-- ----------------------------------------------------------------------------
-- AUTH_VERIFICATIONS - Email/password reset tokens (from migration 006)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_verifications (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_verifications_identifier ON auth_verifications(identifier);
CREATE INDEX idx_auth_verifications_expires ON auth_verifications(expires_at);

-- ----------------------------------------------------------------------------
-- AGENT_API_KEYS - Machine-to-machine authentication (from migration 006)
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_agent_api_keys_actor ON agent_api_keys(actor_id, actor_type);
CREATE INDEX idx_agent_api_keys_company ON agent_api_keys(company_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_agent_api_keys_prefix ON agent_api_keys(key_prefix);
CREATE INDEX idx_agent_api_keys_expires ON agent_api_keys(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_agent_api_keys_revoked ON agent_api_keys(revoked_at) WHERE revoked_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- COMPANY_MEMBERS - Basic company membership (legacy from migration 006)
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_company_members_company ON company_members(company_id);
CREATE INDEX idx_company_members_user ON company_members(user_id);
CREATE INDEX idx_company_members_role ON company_members(company_id, role);

-- ----------------------------------------------------------------------------
-- COMPANY_MEMBERSHIPS - Enhanced company memberships (from migration 007)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    company_id TEXT NOT NULL,
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

CREATE INDEX idx_memberships_company ON company_memberships(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_memberships_user ON company_memberships(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_memberships_role ON company_memberships(company_id, role) WHERE deleted_at IS NULL;
CREATE INDEX idx_memberships_status ON company_memberships(company_id, status) WHERE deleted_at IS NULL;

-- ============================================================================
-- CORE ENTITY TABLES (from migration 001)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- USERS - Core user accounts (legacy, kept for compatibility)
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
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- ----------------------------------------------------------------------------
-- TASKS - Agent tasks and workflow items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    company_id TEXT,
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
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_tasks_company ON tasks(company_id) WHERE deleted_at IS NULL AND company_id IS NOT NULL;
CREATE INDEX idx_tasks_parent ON tasks(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_type ON tasks(task_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_priority ON tasks(priority) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_deadline ON tasks(deadline_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_created ON tasks(created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at);
CREATE INDEX idx_tasks_queue ON tasks(status, priority DESC, created_at) WHERE deleted_at IS NULL AND status IN ('pending', 'queued', 'retrying');
CREATE INDEX idx_tasks_assignee_status ON tasks(assignee_id, status, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_overdue ON tasks(deadline_at, status) WHERE deleted_at IS NULL AND deadline_at IS NOT NULL AND status NOT IN ('completed', 'cancelled', 'failed');

-- ----------------------------------------------------------------------------
-- ROADMAPS - Project roadmaps and milestones
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roadmaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    company_id TEXT,
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
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_roadmaps_company ON roadmaps(company_id) WHERE deleted_at IS NULL AND company_id IS NOT NULL;
CREATE INDEX idx_roadmaps_owner ON roadmaps(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_roadmaps_status ON roadmaps(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_roadmaps_visibility ON roadmaps(visibility) WHERE deleted_at IS NULL;
CREATE INDEX idx_roadmaps_active ON roadmaps(owner_id, status, updated_at DESC) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX idx_roadmaps_deleted_at ON roadmaps(deleted_at);

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
CREATE INDEX idx_nodes_deleted_at ON roadmap_nodes(deleted_at);

-- ----------------------------------------------------------------------------
-- CONTEXTS - Knowledge contexts and memory spaces
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    company_id TEXT,
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
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_id) REFERENCES contexts(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_contexts_company ON contexts(company_id) WHERE deleted_at IS NULL AND company_id IS NOT NULL;
CREATE INDEX idx_contexts_owner ON contexts(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contexts_parent ON contexts(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contexts_type ON contexts(context_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_contexts_visibility ON contexts(visibility) WHERE deleted_at IS NULL;
CREATE INDEX idx_contexts_access ON contexts(context_type, visibility, last_accessed_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_contexts_deleted_at ON contexts(deleted_at);

-- ----------------------------------------------------------------------------
-- CONVERSATIONS - Chat/communication threads
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    company_id TEXT,
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
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE SET NULL,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_conversations_company ON conversations(company_id) WHERE deleted_at IS NULL AND company_id IS NOT NULL;
CREATE INDEX idx_conversations_context ON conversations(context_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_creator ON conversations(creator_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_type ON conversations(conversation_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_status ON conversations(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_last_msg ON conversations(last_message_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_recent ON conversations(context_id, last_message_at DESC) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX idx_conversations_deleted_at ON conversations(deleted_at);

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
CREATE INDEX idx_messages_is_deleted ON messages(is_deleted) WHERE is_deleted = 0;

-- ============================================================================
-- DOCUMENT SYSTEM (from migration 011)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- DOCUMENTS - Document management with versioning
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    company_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL DEFAULT 'markdown' CHECK (format IN ('markdown', 'text', 'html', 'json', 'yaml')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared', 'public')),
    current_version INTEGER NOT NULL DEFAULT 1,
    latest_revision_id TEXT,
    word_count INTEGER DEFAULT 0,
    char_count INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',
    created_by TEXT,
    updated_by TEXT,
    deleted_by TEXT,
    deleted_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES auth_users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES auth_users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES auth_users(id) ON DELETE SET NULL,
    FOREIGN KEY (latest_revision_id) REFERENCES document_revisions(id) ON DELETE SET NULL
);

CREATE INDEX idx_documents_company ON documents(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_status ON documents(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_visibility ON documents(visibility) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_updated ON documents(company_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_created ON documents(company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_title ON documents(title) WHERE deleted_at IS NULL;

-- Full-text search for documents
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    title,
    content,
    content_rowid=rowid,
    content='documents'
);

-- ----------------------------------------------------------------------------
-- DOCUMENT_REVISIONS - Document version history
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_revisions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    document_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    title TEXT NOT NULL,
    change_summary TEXT,
    word_count INTEGER DEFAULT 0,
    char_count INTEGER DEFAULT 0,
    author TEXT NOT NULL,
    author_type TEXT NOT NULL DEFAULT 'user' CHECK (author_type IN ('user', 'agent', 'system')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (author) REFERENCES auth_users(id) ON DELETE SET NULL,
    UNIQUE(document_id, version_number)
);

CREATE INDEX idx_revisions_document ON document_revisions(document_id, version_number DESC);
CREATE INDEX idx_revisions_author ON document_revisions(author);
CREATE INDEX idx_revisions_created ON document_revisions(created_at);

-- ----------------------------------------------------------------------------
-- DOCUMENT_SHARES - Cross-company document sharing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_shares (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    document_id TEXT NOT NULL,
    source_company_id TEXT NOT NULL,
    target_company_id TEXT NOT NULL,
    permission TEXT NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'write', 'admin')),
    shared_by TEXT NOT NULL,
    share_token TEXT UNIQUE,
    expires_at DATETIME,
    revoked_at DATETIME,
    revoked_by TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (source_company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (target_company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by) REFERENCES auth_users(id) ON DELETE SET NULL,
    FOREIGN KEY (revoked_by) REFERENCES auth_users(id) ON DELETE SET NULL,
    UNIQUE(document_id, target_company_id)
);

CREATE INDEX idx_shares_document ON document_shares(document_id);
CREATE INDEX idx_shares_source ON document_shares(source_company_id);
CREATE INDEX idx_shares_target ON document_shares(target_company_id);
CREATE INDEX idx_shares_token ON document_shares(share_token) WHERE revoked_at IS NULL;
CREATE INDEX idx_shares_active ON document_shares(target_company_id, revoked_at) WHERE revoked_at IS NULL;

-- ----------------------------------------------------------------------------
-- DOCUMENT_SUBSCRIPTIONS - User subscriptions to documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_subscriptions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    subscription_type TEXT NOT NULL DEFAULT 'watch' CHECK (subscription_type IN ('watch', 'notify', 'ignore')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
    UNIQUE(document_id, user_id)
);

CREATE INDEX idx_subscriptions_document ON document_subscriptions(document_id);
CREATE INDEX idx_subscriptions_user ON document_subscriptions(user_id);

-- ============================================================================
-- ISSUE SYSTEM (from migration 012)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ISSUES - Core issue tracking
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_issues_company ON issues(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_company_status ON issues(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_assignee ON issues(assignee_id, assignee_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_company_assignee_status ON issues(company_id, assignee_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_parent ON issues(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_project ON issues(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_task ON issues(task_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_origin ON issues(company_id, origin_kind, origin_id);
CREATE INDEX idx_issues_number ON issues(company_id, issue_number);
CREATE INDEX idx_issues_status ON issues(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_priority ON issues(priority) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_due_date ON issues(due_date) WHERE deleted_at IS NULL AND due_date IS NOT NULL;
CREATE INDEX idx_issues_created_at ON issues(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_issues_updated_at ON issues(updated_at DESC) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- ISSUE_COMMENTS - Threaded comments on issues
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_issue_comments_issue ON issue_comments(issue_id, created_at);
CREATE INDEX idx_issue_comments_company ON issue_comments(company_id);
CREATE INDEX idx_issue_comments_parent ON issue_comments(parent_id);
CREATE INDEX idx_issue_comments_thread ON issue_comments(thread_root_id);
CREATE INDEX idx_issue_comments_author ON issue_comments(author_id, author_type);
CREATE INDEX idx_issue_comments_created ON issue_comments(created_at DESC);

-- ----------------------------------------------------------------------------
-- ISSUE_LABELS - Label definitions per company
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_issue_labels_company ON issue_labels(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issue_labels_name ON issue_labels(company_id, name) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- ISSUE_LABEL_LINKS - Many-to-many issue-label relationships
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_issue_label_links_issue ON issue_label_links(issue_id);
CREATE INDEX idx_issue_label_links_label ON issue_label_links(label_id);
CREATE INDEX idx_issue_label_links_company ON issue_label_links(company_id);

-- ----------------------------------------------------------------------------
-- ISSUE_ATTACHMENTS - File attachments for issues
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_issue_attachments_issue ON issue_attachments(issue_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issue_attachments_comment ON issue_attachments(comment_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_issue_attachments_company ON issue_attachments(company_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- ISSUE_READ_STATES - Track read/unread state per user
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_issue_read_states_issue ON issue_read_states(issue_id);
CREATE INDEX idx_issue_read_states_user ON issue_read_states(user_id);
CREATE INDEX idx_issue_read_states_unread ON issue_read_states(user_id, is_read) WHERE is_read = 0;
CREATE INDEX idx_issue_read_states_company ON issue_read_states(company_id);

-- ----------------------------------------------------------------------------
-- ISSUE_ASSIGNMENT_HISTORY - Track assignment changes
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_issue_assignment_history_issue ON issue_assignment_history(issue_id, created_at DESC);
CREATE INDEX idx_issue_assignment_history_company ON issue_assignment_history(company_id);

-- ============================================================================
-- AUDIT & INTEGRITY TABLES (from migration 001)
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
CREATE INDEX idx_checkpoints_parent ON checkpoints(parent_checkpoint_id);
CREATE INDEX idx_checkpoints_deleted_at ON checkpoints(deleted_at);

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
CREATE INDEX idx_audit_request ON audit_logs(request_id);

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
CREATE INDEX idx_merkle_created ON merkle_trees(created_at);

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
CREATE INDEX idx_leaves_reference ON merkle_leaves(data_reference);

-- ============================================================================
-- SYSTEM TABLES (from migration 001)
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
CREATE INDEX idx_batches_created_at ON batches(created_at);
CREATE INDEX idx_batches_deleted_at ON batches(deleted_at);

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
CREATE INDEX idx_alerts_expires ON alerts(expires_at);
CREATE INDEX idx_alerts_deleted_at ON alerts(deleted_at);

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
CREATE INDEX idx_analytics_user ON analytics(user_id);
CREATE INDEX idx_analytics_session ON analytics(session_id);
CREATE INDEX idx_analytics_recorded ON analytics(recorded_at);
CREATE INDEX idx_analytics_bucket ON analytics(bucket_date, bucket_hour);

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
CREATE INDEX idx_settings_updated ON settings(updated_at);

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

-- Core tables from migration 001
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

CREATE TRIGGER IF NOT EXISTS trg_messages_updated_at
AFTER UPDATE ON messages
FOR EACH ROW
BEGIN
    UPDATE messages SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
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

-- Auth system tables from migration 006
CREATE TRIGGER IF NOT EXISTS trg_companies_updated_at
AFTER UPDATE ON companies
FOR EACH ROW
BEGIN
    UPDATE companies SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_users_updated_at
AFTER UPDATE ON auth_users
FOR EACH ROW
BEGIN
    UPDATE auth_users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_sessions_updated_at
AFTER UPDATE ON auth_sessions
FOR EACH ROW
BEGIN
    UPDATE auth_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_accounts_updated_at
AFTER UPDATE ON auth_accounts
FOR EACH ROW
BEGIN
    UPDATE auth_accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_verifications_updated_at
AFTER UPDATE ON auth_verifications
FOR EACH ROW
BEGIN
    UPDATE auth_verifications SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Company memberships from migration 007
CREATE TRIGGER IF NOT EXISTS trg_company_memberships_updated_at
AFTER UPDATE ON company_memberships
FOR EACH ROW
BEGIN
    UPDATE company_memberships SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Document system from migration 011
CREATE TRIGGER IF NOT EXISTS trg_documents_updated_at
AFTER UPDATE ON documents
FOR EACH ROW
BEGIN
    UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- FTS triggers for keeping search index in sync
CREATE TRIGGER IF NOT EXISTS trg_documents_fts_insert
AFTER INSERT ON documents
BEGIN
    INSERT INTO documents_fts(rowid, title, content)
    VALUES (NEW.rowid, NEW.title, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_fts_update
AFTER UPDATE ON documents
BEGIN
    UPDATE documents_fts SET title = NEW.title, content = NEW.content
    WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_fts_delete
AFTER DELETE ON documents
BEGIN
    DELETE FROM documents_fts WHERE rowid = OLD.rowid;
END;

-- Issue system from migration 012
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
