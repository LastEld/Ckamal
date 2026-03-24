-- ============================================================================
-- CogniMesh v5.0 - Batch Processing Schema Extension
-- Additional tables for advanced batch operations and queue management
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BATCH_ITEMS - Individual items within a batch
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    batch_id INTEGER NOT NULL,
    item_index INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped', 'retrying')),
    
    -- Input/Output data
    input_data TEXT,           -- JSON input for this item
    output_data TEXT,          -- JSON output from processing
    error_data TEXT,           -- JSON error details if failed
    
    -- Processing metadata
    processor_id TEXT,         -- ID of worker/agent that processed this item
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    -- Timing
    started_at DATETIME,
    completed_at DATETIME,
    processing_duration_ms INTEGER,
    
    -- For retry logic
    retry_after DATETIME,
    last_error TEXT,
    
    -- Foreign key to source entity
    source_type TEXT,          -- e.g., 'task', 'message', 'document'
    source_id TEXT,
    source_uuid TEXT,
    
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    UNIQUE(batch_id, item_index)
);

CREATE INDEX idx_batch_items_batch ON batch_items(batch_id);
CREATE INDEX idx_batch_items_status ON batch_items(status);
CREATE INDEX idx_batch_items_source ON batch_items(source_type, source_id);
CREATE INDEX idx_batch_items_processor ON batch_items(processor_id) WHERE processor_id IS NOT NULL;
CREATE INDEX idx_batch_items_retry ON batch_items(retry_after) WHERE status IN ('failed', 'retrying');

-- ----------------------------------------------------------------------------
-- BATCH_DEPENDENCIES - Dependencies between batches
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    depends_on_batch_id INTEGER NOT NULL,
    dependency_type TEXT DEFAULT 'completion' CHECK (dependency_type IN ('completion', 'success', 'partial')),
    is_blocking BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    UNIQUE(batch_id, depends_on_batch_id)
);

CREATE INDEX idx_batch_deps_batch ON batch_dependencies(batch_id);
CREATE INDEX idx_batch_deps_depends ON batch_dependencies(depends_on_batch_id);

-- ----------------------------------------------------------------------------
-- BATCH_WORKERS - Worker registration and assignment
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    worker_id TEXT NOT NULL UNIQUE,
    worker_type TEXT NOT NULL CHECK (worker_type IN ('local', 'remote', 'agent')),
    
    -- Status and capacity
    status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'paused', 'offline', 'error')),
    current_batch_id INTEGER,
    max_concurrent_items INTEGER DEFAULT 1,
    
    -- Capabilities
    supported_batch_types TEXT DEFAULT '[]', -- JSON array
    supported_task_types TEXT DEFAULT '[]',  -- JSON array
    
    -- Performance metrics
    total_items_processed INTEGER DEFAULT 0,
    total_items_failed INTEGER DEFAULT 0,
    avg_processing_time_ms REAL,
    
    -- Health check
    last_heartbeat_at DATETIME,
    last_seen_ip TEXT,
    
    metadata TEXT DEFAULT '{}',
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (current_batch_id) REFERENCES batches(id) ON DELETE SET NULL
);

CREATE INDEX idx_batch_workers_status ON batch_workers(status);
CREATE INDEX idx_batch_workers_type ON batch_workers(worker_type);
CREATE INDEX idx_batch_workers_current ON batch_workers(current_batch_id);
CREATE INDEX idx_batch_workers_heartbeat ON batch_workers(last_heartbeat_at);

-- ----------------------------------------------------------------------------
-- BATCH_SCHEDULES - Scheduled batch jobs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    description TEXT,
    
    -- Schedule configuration
    schedule_type TEXT NOT NULL CHECK (schedule_type IN ('cron', 'interval', 'once')),
    cron_expression TEXT,           -- For cron schedules
    interval_seconds INTEGER,       -- For interval schedules
    run_at DATETIME,                -- For one-time schedules
    timezone TEXT DEFAULT 'UTC',
    
    -- Batch template
    batch_type TEXT NOT NULL,
    batch_config TEXT DEFAULT '{}', -- JSON template for batch creation
    
    -- Execution control
    is_active BOOLEAN DEFAULT 1,
    max_retries INTEGER DEFAULT 0,
    retry_delay_seconds INTEGER DEFAULT 60,
    timeout_seconds INTEGER DEFAULT 3600,
    
    -- Scheduling limits
    max_concurrent_runs INTEGER DEFAULT 1,
    max_runs_total INTEGER,         -- NULL = unlimited
    runs_completed INTEGER DEFAULT 0,
    
    -- Last execution tracking
    last_run_at DATETIME,
    last_run_batch_id INTEGER,
    last_run_status TEXT,
    next_run_at DATETIME,
    
    created_by INTEGER,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (last_run_batch_id) REFERENCES batches(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_batch_schedules_active ON batch_schedules(is_active) WHERE is_active = 1;
CREATE INDEX idx_batch_schedules_next_run ON batch_schedules(next_run_at) WHERE is_active = 1;

-- ----------------------------------------------------------------------------
-- BATCH_QUEUE - Priority queue for batch items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_item_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    queue_position INTEGER,
    
    -- Routing
    required_capabilities TEXT DEFAULT '[]', -- JSON array of required worker capabilities
    preferred_worker_id TEXT,
    
    -- Queue metadata
    queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    attempt_number INTEGER DEFAULT 0,
    
    FOREIGN KEY (batch_item_id) REFERENCES batch_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_batch_queue_priority ON batch_queue(priority, queue_position);
CREATE INDEX idx_batch_queue_expires ON batch_queue(expires_at);
CREATE INDEX idx_batch_queue_worker ON batch_queue(preferred_worker_id);

-- ----------------------------------------------------------------------------
-- BATCH_LOGS - Detailed batch execution logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    batch_item_id INTEGER,
    
    log_level TEXT DEFAULT 'info' CHECK (log_level IN ('debug', 'info', 'warning', 'error', 'critical')),
    log_category TEXT DEFAULT 'general' CHECK (log_category IN ('general', 'processing', 'validation', 'io', 'system')),
    message TEXT NOT NULL,
    
    -- Structured data
    context TEXT,              -- JSON additional context
    stack_trace TEXT,
    
    -- Source attribution
    source_file TEXT,
    source_line INTEGER,
    function_name TEXT,
    
    -- Performance
    memory_usage_bytes INTEGER,
    processing_duration_ms INTEGER,
    
    logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    FOREIGN KEY (batch_item_id) REFERENCES batch_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_batch_logs_batch ON batch_logs(batch_id);
CREATE INDEX idx_batch_logs_item ON batch_logs(batch_item_id);
CREATE INDEX idx_batch_logs_level ON batch_logs(log_level);
CREATE INDEX idx_batch_logs_logged ON batch_logs(logged_at);
CREATE INDEX idx_batch_logs_category ON batch_logs(log_category);

-- ----------------------------------------------------------------------------
-- BATCH_TEMPLATES - Reusable batch configurations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    
    batch_type TEXT NOT NULL,
    config_schema TEXT,        -- JSON Schema for validation
    default_config TEXT DEFAULT '{}',
    
    -- UI/UX
    icon TEXT,
    color TEXT,
    category TEXT DEFAULT 'general',
    tags TEXT DEFAULT '[]',
    
    -- Permissions
    is_public BOOLEAN DEFAULT 0,
    allowed_user_ids TEXT,     -- JSON array, NULL = all
    
    -- Usage stats
    usage_count INTEGER DEFAULT 0,
    last_used_at DATETIME,
    
    created_by INTEGER,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_batch_templates_type ON batch_templates(batch_type);
CREATE INDEX idx_batch_templates_category ON batch_templates(category);
CREATE INDEX idx_batch_templates_public ON batch_templates(is_public) WHERE is_public = 1;

-- ----------------------------------------------------------------------------
-- Update triggers
-- ----------------------------------------------------------------------------

CREATE TRIGGER IF NOT EXISTS trg_batch_items_updated_at
AFTER UPDATE ON batch_items
FOR EACH ROW
BEGIN
    UPDATE batch_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_batch_workers_updated_at
AFTER UPDATE ON batch_workers
FOR EACH ROW
BEGIN
    UPDATE batch_workers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_batch_schedules_updated_at
AFTER UPDATE ON batch_schedules
FOR EACH ROW
BEGIN
    UPDATE batch_schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    UPDATE batch_schedules SET next_run_at = CASE 
        WHEN NEW.schedule_type = 'interval' AND NEW.is_active = 1 
        THEN datetime(COALESCE(OLD.last_run_at, 'now'), '+' || NEW.interval_seconds || ' seconds')
        ELSE NULL
    END WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_batch_templates_updated_at
AFTER UPDATE ON batch_templates
FOR EACH ROW
BEGIN
    UPDATE batch_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
