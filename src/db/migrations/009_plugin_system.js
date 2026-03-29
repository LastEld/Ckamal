/**
 * @fileoverview CogniMesh v5.0 - Plugin System Migration
 * Creates tables for plugin management, state storage, events, and logs.
 * 
 * @module db/migrations/009_plugin_system
 * @see plugin-sdk-design.md
 */

/**
 * Apply plugin system schema
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // ============================================
  // PLUGINS - Plugin registry
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'Unknown',
      license TEXT,
      status TEXT NOT NULL DEFAULT 'installed' 
        CHECK (status IN ('installed', 'registered', 'loading', 'initializing', 'active', 'updating', 'failed', 'unloading', 'terminated')),
      manifest_path TEXT NOT NULL,
      worker_path TEXT,
      ui_path TEXT,
      capabilities TEXT NOT NULL DEFAULT '[]', -- JSON array
      config_schema TEXT, -- JSON schema for config validation
      subscribed_events TEXT DEFAULT '[]', -- JSON array of event patterns
      error_message TEXT,
      manifest_hash TEXT NOT NULL, -- SHA256 for integrity
      source TEXT DEFAULT 'local' CHECK (source IN ('local', 'npm', 'git', 'marketplace')),
      installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      activated_at DATETIME,
      last_error_at DATETIME,
      restart_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
    CREATE INDEX IF NOT EXISTS idx_plugins_source ON plugins(source);
    CREATE INDEX IF NOT EXISTS idx_plugins_installed_at ON plugins(installed_at);
  `);

  // ============================================
  // PLUGIN_CONFIGS - Plugin configurations
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}', -- JSON object
      is_encrypted BOOLEAN DEFAULT 0,
      encryption_version INTEGER,
      validation_errors TEXT, -- JSON array of validation errors
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER,
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by) REFERENCES auth_users(id) ON DELETE SET NULL,
      UNIQUE(plugin_id)
    );

    CREATE INDEX IF NOT EXISTS idx_plugin_configs_plugin_id ON plugin_configs(plugin_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_configs_updated_by ON plugin_configs(updated_by);
  `);

  // ============================================
  // PLUGIN_STATES - Plugin isolated state storage
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      scope_kind TEXT NOT NULL DEFAULT 'instance' 
        CHECK (scope_kind IN ('instance', 'project', 'task', 'conversation', 'user', 'context', 'global')),
      scope_id TEXT, -- UUID or ID within scope
      namespace TEXT DEFAULT 'default',
      state_key TEXT NOT NULL,
      value TEXT, -- JSON value
      value_type TEXT DEFAULT 'json' CHECK (value_type IN ('json', 'string', 'number', 'boolean', 'binary')),
      version INTEGER DEFAULT 1, -- For optimistic locking
      expires_at DATETIME, -- Optional TTL
      metadata TEXT DEFAULT '{}', -- JSON: encryption info, etc.
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
      UNIQUE(plugin_id, scope_kind, scope_id, namespace, state_key)
    );

    CREATE INDEX IF NOT EXISTS idx_plugin_states_plugin_id ON plugin_states(plugin_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_states_scope ON plugin_states(scope_kind, scope_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_states_key ON plugin_states(state_key);
    CREATE INDEX IF NOT EXISTS idx_plugin_states_expires ON plugin_states(expires_at) WHERE expires_at IS NOT NULL;
  `);

  // ============================================
  // PLUGIN_TOOLS - Registered tool metadata
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      tool_name TEXT NOT NULL, -- Local name within plugin
      full_name TEXT NOT NULL UNIQUE, -- Fully qualified: plugin_id.tool_name
      display_name TEXT NOT NULL,
      description TEXT NOT NULL,
      parameters_schema TEXT NOT NULL, -- JSON schema
      return_schema TEXT, -- JSON schema for return type
      is_enabled BOOLEAN DEFAULT 1,
      execution_count INTEGER DEFAULT 0,
      last_executed_at DATETIME,
      average_execution_ms INTEGER,
      error_count INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}', -- JSON: tags, examples, etc.
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_plugin_tools_plugin_id ON plugin_tools(plugin_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_tools_full_name ON plugin_tools(full_name);
    CREATE INDEX IF NOT EXISTS idx_plugin_tools_enabled ON plugin_tools(is_enabled) WHERE is_enabled = 1;
  `);

  // ============================================
  // PLUGIN_UI_SLOTS - UI slot registrations
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_ui_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      slot_id TEXT NOT NULL,
      slot_type TEXT NOT NULL CHECK (slot_type IN ('widget', 'sidebar', 'detailTab', 'toolbar', 'page', 'modal', 'contextMenu')),
      zone TEXT, -- UI zone/location
      title TEXT,
      description TEXT,
      icon TEXT, -- Icon name or URL
      entity_types TEXT, -- JSON array of applicable entity types
      required_capabilities TEXT DEFAULT '[]', -- JSON array
      render_config TEXT DEFAULT '{}', -- JSON: height, width, etc.
      is_enabled BOOLEAN DEFAULT 1,
      priority INTEGER DEFAULT 100, -- Lower = higher priority
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
      UNIQUE(plugin_id, slot_id)
    );

    CREATE INDEX IF NOT EXISTS idx_plugin_ui_slots_plugin_id ON plugin_ui_slots(plugin_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_ui_slots_type ON plugin_ui_slots(slot_type);
    CREATE INDEX IF NOT EXISTS idx_plugin_ui_slots_zone ON plugin_ui_slots(zone);
    CREATE INDEX IF NOT EXISTS idx_plugin_ui_slots_enabled ON plugin_ui_slots(is_enabled) WHERE is_enabled = 1;
  `);

  // ============================================
  // PLUGIN_EVENTS - Event delivery tracking
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE, -- UUID
      plugin_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT, -- JSON event payload
      entity_id TEXT,
      entity_type TEXT,
      project_id TEXT,
      conversation_id TEXT,
      delivered_at DATETIME,
      processed_at DATETIME,
      processing_duration_ms INTEGER,
      success BOOLEAN,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_plugin_events_plugin_id ON plugin_events(plugin_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_events_event_type ON plugin_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_plugin_events_entity ON plugin_events(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_events_project ON plugin_events(project_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_events_created ON plugin_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_plugin_events_delivered ON plugin_events(delivered_at) WHERE delivered_at IS NULL;
  `);

  // ============================================
  // PLUGIN_LOGS - Aggregated plugin logs
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      log_id TEXT, -- UUID from plugin
      level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
      message TEXT NOT NULL,
      metadata TEXT DEFAULT '{}', -- JSON context
      source_file TEXT,
      source_line INTEGER,
      trace_id TEXT, -- For distributed tracing
      span_id TEXT,
      timestamp DATETIME NOT NULL,
      ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_plugin_logs_plugin_id ON plugin_logs(plugin_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_logs_level ON plugin_logs(level);
    CREATE INDEX IF NOT EXISTS idx_plugin_logs_timestamp ON plugin_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_plugin_logs_trace ON plugin_logs(trace_id);
  `);

  // ============================================
  // PLUGIN_EXECUTIONS - Tool execution history
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_id TEXT NOT NULL UNIQUE, -- UUID
      plugin_id TEXT NOT NULL,
      tool_name TEXT,
      action_type TEXT CHECK (action_type IN ('tool', 'data', 'action', 'event_handler')),
      input_params TEXT, -- JSON (may be truncated for large inputs)
      output_result TEXT, -- JSON (may be truncated)
      error_message TEXT,
      error_stack TEXT,
      started_at DATETIME NOT NULL,
      completed_at DATETIME,
      duration_ms INTEGER,
      agent_id TEXT,
      conversation_id TEXT,
      project_id TEXT,
      user_id INTEGER,
      success BOOLEAN,
      metadata TEXT DEFAULT '{}', -- JSON: cache hit, etc.
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_plugin_executions_plugin_id ON plugin_executions(plugin_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_executions_tool ON plugin_executions(plugin_id, tool_name);
    CREATE INDEX IF NOT EXISTS idx_plugin_executions_started ON plugin_executions(started_at);
    CREATE INDEX IF NOT EXISTS idx_plugin_executions_success ON plugin_executions(success);
  `);

  // ============================================
  // PLUGIN_DEPENDENCIES - Plugin dependency graph
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      depends_on_plugin_id TEXT NOT NULL,
      version_constraint TEXT, -- Semver range
      is_optional BOOLEAN DEFAULT 0,
      resolved_at DATETIME,
      resolution_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on_plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
      UNIQUE(plugin_id, depends_on_plugin_id)
    );

    CREATE INDEX IF NOT EXISTS idx_plugin_dependencies_plugin ON plugin_dependencies(plugin_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_dependencies_depends ON plugin_dependencies(depends_on_plugin_id);
  `);

  // ============================================
  // PLUGIN_WEBHOOKS - Webhook endpoint registrations
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      endpoint_key TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      method TEXT DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
      secret_hash TEXT, -- For HMAC verification
      is_enabled BOOLEAN DEFAULT 1,
      rate_limit_requests INTEGER DEFAULT 100,
      rate_limit_window INTEGER DEFAULT 3600, -- seconds
      last_called_at DATETIME,
      call_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE,
      UNIQUE(plugin_id, endpoint_key)
    );

    CREATE INDEX IF NOT EXISTS idx_plugin_webhooks_plugin_id ON plugin_webhooks(plugin_id);
    CREATE INDEX IF NOT EXISTS idx_plugin_webhooks_path ON plugin_webhooks(path);
    CREATE INDEX IF NOT EXISTS idx_plugin_webhooks_enabled ON plugin_webhooks(is_enabled) WHERE is_enabled = 1;
  `);

  // ============================================
  // Update triggers for updated_at
  // ============================================
  const tables = [
    'plugins', 'plugin_configs', 'plugin_states', 'plugin_tools',
    'plugin_ui_slots', 'plugin_webhooks'
  ];
  
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
  // Cleanup trigger for expired state
  // ============================================
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_plugin_states_cleanup_expired
    AFTER INSERT ON plugin_states
    BEGIN
      DELETE FROM plugin_states WHERE expires_at IS NOT NULL AND expires_at < datetime('now');
    END;
  `);

  // ============================================
  // Views for common queries
  // ============================================
  
  // Active plugins view
  db.exec(`
    CREATE VIEW IF NOT EXISTS v_active_plugins AS
    SELECT 
      p.*,
      pc.config as active_config,
      COUNT(pt.id) as tool_count,
      COUNT(pus.id) as ui_slot_count
    FROM plugins p
    LEFT JOIN plugin_configs pc ON p.id = pc.plugin_id
    LEFT JOIN plugin_tools pt ON p.id = pt.plugin_id AND pt.is_enabled = 1
    LEFT JOIN plugin_ui_slots pus ON p.id = pus.plugin_id AND pus.is_enabled = 1
    WHERE p.status = 'active'
    GROUP BY p.id;
  `);

  // Plugin health view
  db.exec(`
    CREATE VIEW IF NOT EXISTS v_plugin_health AS
    SELECT 
      p.id,
      p.name,
      p.status,
      p.restart_count,
      p.last_error_at,
      p.error_message,
      COUNT(pe.id) as pending_events,
      MAX(pe.created_at) as last_event_at,
      COUNT(DISTINCT px.id) as recent_executions,
      SUM(CASE WHEN px.success = 0 THEN 1 ELSE 0 END) as recent_errors
    FROM plugins p
    LEFT JOIN plugin_events pe ON p.id = pe.plugin_id AND pe.delivered_at IS NULL
    LEFT JOIN plugin_executions px ON p.id = px.plugin_id 
      AND px.started_at > datetime('now', '-1 hour')
    GROUP BY p.id;
  `);
}

/**
 * Rollback plugin system schema
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  // Disable foreign keys temporarily
  db.pragma('foreign_keys = OFF');
  
  try {
    // Drop views
    db.exec(`DROP VIEW IF EXISTS v_active_plugins;`);
    db.exec(`DROP VIEW IF EXISTS v_plugin_health;`);
    
    // Drop triggers
    const tables = [
      'plugins', 'plugin_configs', 'plugin_states', 'plugin_tools',
      'plugin_ui_slots', 'plugin_webhooks'
    ];
    
    for (const table of tables) {
      db.exec(`DROP TRIGGER IF EXISTS trg_${table}_updated_at;`);
    }
    
    db.exec(`DROP TRIGGER IF EXISTS trg_plugin_states_cleanup_expired;`);
    
    // Drop tables in reverse dependency order
    const dropTables = [
      'plugin_webhooks',
      'plugin_dependencies',
      'plugin_executions',
      'plugin_logs',
      'plugin_events',
      'plugin_ui_slots',
      'plugin_tools',
      'plugin_states',
      'plugin_configs',
      'plugins'
    ];
    
    for (const table of dropTables) {
      db.exec(`DROP TABLE IF EXISTS ${table};`);
    }
  } finally {
    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');
  }
}

export default { up, down };
