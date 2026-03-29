/**
 * @fileoverview Activity Logging Migration
 * Comprehensive activity logging system inspired by Paperclip's activity-log.ts
 * Creates tables for activity tracking with categorization, privacy filtering, and aggregation.
 * @module db/migrations/015_activity_logging
 * @version 5.0.0
 */

/**
 * Apply activity logging schema
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.pragma('foreign_keys = ON');

  // ============================================
  // ACTIVITY_CATEGORIES - Event categorization
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT,
      color TEXT DEFAULT '#6B7280',
      priority INTEGER DEFAULT 100,
      retention_days INTEGER DEFAULT 90,
      is_audited BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Insert default categories
    INSERT OR IGNORE INTO activity_categories (id, name, description, icon, color, priority, is_audited) VALUES
      ('auth', 'Authentication', 'Login, logout, and authentication events', 'shield', '#10B981', 10, 1),
      ('security', 'Security', 'Security-related events and alerts', 'alert-triangle', '#EF4444', 5, 1),
      ('data', 'Data', 'Data creation, modification, and deletion', 'database', '#3B82F6', 20, 1),
      ('admin', 'Administration', 'Administrative actions and configuration', 'settings', '#8B5CF6', 15, 1),
      ('agent', 'Agent', 'Agent lifecycle and execution events', 'bot', '#F59E0B', 25, 0),
      ('system', 'System', 'System-level events and maintenance', 'cpu', '#6B7280', 30, 0),
      ('integration', 'Integration', 'External service integrations', 'plug', '#EC4899', 35, 0),
      ('user', 'User', 'User profile and preference changes', 'user', '#14B8A6', 40, 0);
  `);

  // ============================================
  // ACTIVITY_LOG - Core activity tracking
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      
      -- Actor information (who performed the action)
      actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system', 'api_key', 'webhook', 'integration')),
      actor_id TEXT NOT NULL,
      actor_display TEXT, -- Cached display name for performance
      
      -- Action classification
      action TEXT NOT NULL, -- e.g., 'task.create', 'agent.run', 'user.login'
      category_id TEXT NOT NULL DEFAULT 'system',
      severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'notice', 'warning', 'error', 'critical', 'emergency')),
      
      -- Entity information (what was affected)
      entity_type TEXT NOT NULL, -- e.g., 'task', 'agent', 'project', 'user'
      entity_id TEXT NOT NULL,
      entity_display TEXT, -- Cached display name
      
      -- Context
      company_id TEXT, -- Multi-tenant support
      project_id TEXT,
      conversation_id TEXT,
      
      -- Agent context (for agent actions)
      agent_id TEXT,
      run_id TEXT,
      
      -- Request context
      ip_address TEXT,
      user_agent TEXT,
      request_id TEXT,
      session_id TEXT,
      
      -- Location (if available)
      geo_country TEXT,
      geo_city TEXT,
      
      -- Status and result
      status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure', 'partial', 'cancelled', 'pending')),
      result_code INTEGER, -- HTTP status or custom code
      
      -- Summary (short text for list views)
      summary TEXT,
      
      -- Metadata
      metadata_json TEXT DEFAULT '{}', -- Small metadata (< 1KB)
      has_details BOOLEAN DEFAULT 0, -- Indicates if details exist in activity_log_details
      
      -- Privacy
      privacy_level TEXT DEFAULT 'standard' CHECK (privacy_level IN ('public', 'standard', 'sensitive', 'restricted')),
      pii_fields TEXT, -- JSON array of fields containing PII
      data_retention_days INTEGER DEFAULT 90,
      
      -- Timestamps
      occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME, -- For auto-cleanup
      
      -- Chain of custody for tamper detection
      previous_hash TEXT,
      entry_hash TEXT, -- Hash of this entry for integrity
      
      FOREIGN KEY (category_id) REFERENCES activity_categories(id) ON DELETE SET DEFAULT,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Core indexes for activity_log
    CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log(actor_type, actor_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_category ON activity_log(category_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_company ON activity_log(company_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log(project_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_severity ON activity_log(severity, occurred_at DESC) WHERE severity IN ('error', 'critical', 'emergency');
    CREATE INDEX IF NOT EXISTS idx_activity_log_status ON activity_log(status, occurred_at DESC) WHERE status != 'success';
    CREATE INDEX IF NOT EXISTS idx_activity_log_agent ON activity_log(agent_id, occurred_at DESC) WHERE agent_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_activity_log_run ON activity_log(run_id, occurred_at DESC) WHERE run_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_activity_log_expires ON activity_log(expires_at) WHERE expires_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_activity_log_ip ON activity_log(ip_address, occurred_at DESC) WHERE ip_address IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_activity_log_timeline ON activity_log(occurred_at DESC, id);
    
    -- Composite indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_activity_log_entity_action ON activity_log(entity_type, entity_id, action, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_log_actor_category ON activity_log(actor_id, category_id, occurred_at DESC);
  `);

  // ============================================
  // ACTIVITY_LOG_DETAILS - Large payloads
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log_details (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      activity_id TEXT NOT NULL UNIQUE,
      
      -- Request/Response data
      request_headers TEXT, -- JSON, sanitized
      request_body TEXT, -- Sanitized request payload
      request_body_size INTEGER DEFAULT 0,
      
      response_headers TEXT, -- JSON
      response_body TEXT, -- Truncated if large
      response_body_size INTEGER DEFAULT 0,
      
      -- Change tracking
      before_state TEXT, -- JSON snapshot before change
      after_state TEXT, -- JSON snapshot after change
      changes_summary TEXT, -- JSON array of changed fields
      
      -- Additional context
      stack_trace TEXT, -- For errors
      debug_info TEXT, -- JSON debug data
      raw_payload TEXT, -- For webhooks/integrations
      
      -- Attachments
      attachment_count INTEGER DEFAULT 0,
      attachment_refs TEXT, -- JSON array of file references
      
      -- External references
      external_id TEXT, -- External system reference
      external_url TEXT,
      
      -- Compression
      is_compressed BOOLEAN DEFAULT 0,
      compression_type TEXT DEFAULT 'none' CHECK (compression_type IN ('none', 'gzip', 'zlib')),
      original_size INTEGER,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (activity_id) REFERENCES activity_log(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_activity_log_details_external ON activity_log_details(external_id) WHERE external_id IS NOT NULL;
  `);

  // ============================================
  // ACTIVITY_LOG_AGGREGATES - Daily summaries
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log_aggregates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      -- Aggregation dimensions
      aggregate_date DATE NOT NULL,
      granularity TEXT NOT NULL DEFAULT 'day' CHECK (granularity IN ('hour', 'day', 'week', 'month')),
      
      -- Optional filters
      company_id TEXT,
      project_id TEXT,
      category_id TEXT,
      actor_id TEXT,
      entity_type TEXT,
      
      -- Counts
      total_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      
      -- By severity
      debug_count INTEGER DEFAULT 0,
      info_count INTEGER DEFAULT 0,
      notice_count INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      critical_count INTEGER DEFAULT 0,
      emergency_count INTEGER DEFAULT 0,
      
      -- By actor type
      user_count INTEGER DEFAULT 0,
      agent_count INTEGER DEFAULT 0,
      system_count INTEGER DEFAULT 0,
      api_key_count INTEGER DEFAULT 0,
      
      -- Unique actors
      unique_actors INTEGER DEFAULT 0,
      unique_users INTEGER DEFAULT 0,
      unique_agents INTEGER DEFAULT 0,
      
      -- Top actions (JSON array)
      top_actions TEXT DEFAULT '[]',
      
      -- Activity distribution by hour (JSON object)
      hourly_distribution TEXT DEFAULT '{}',
      
      -- Metadata
      computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sample_activity_ids TEXT, -- JSON array of sample IDs for drill-down
      
      UNIQUE(aggregate_date, granularity, company_id, project_id, category_id, actor_id, entity_type)
    );

    CREATE INDEX IF NOT EXISTS idx_activity_aggregates_date ON activity_log_aggregates(aggregate_date, granularity);
    CREATE INDEX IF NOT EXISTS idx_activity_aggregates_company ON activity_log_aggregates(company_id, aggregate_date);
    CREATE INDEX IF NOT EXISTS idx_activity_aggregates_project ON activity_log_aggregates(project_id, aggregate_date);
    CREATE INDEX IF NOT EXISTS idx_activity_aggregates_category ON activity_log_aggregates(category_id, aggregate_date);
    CREATE INDEX IF NOT EXISTS idx_activity_aggregates_computed ON activity_log_aggregates(computed_at);
  `);

  // ============================================
  // ACTIVITY_LOG_SUBSCRIPTIONS - Real-time subscriptions
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log_subscriptions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      
      -- Subscription owner
      user_id INTEGER,
      company_id TEXT,
      
      -- Filter criteria (NULL = all)
      category_filter TEXT, -- JSON array of category IDs
      severity_filter TEXT, -- JSON array ['warning', 'error']
      entity_type_filter TEXT, -- JSON array
      action_filter TEXT, -- JSON array
      actor_filter TEXT, -- JSON array of actor IDs
      
      -- Delivery config
      delivery_method TEXT DEFAULT 'websocket' CHECK (delivery_method IN ('websocket', 'webhook', 'email', 'slack')),
      delivery_config TEXT DEFAULT '{}', -- JSON: URL, headers, etc.
      
      -- Throttling
      throttle_seconds INTEGER DEFAULT 0,
      batch_size INTEGER DEFAULT 1,
      
      -- Status
      is_active BOOLEAN DEFAULT 1,
      last_delivered_at DATETIME,
      delivery_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_error TEXT,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_activity_subscriptions_user ON activity_log_subscriptions(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_activity_subscriptions_company ON activity_log_subscriptions(company_id, is_active);
  `);

  // ============================================
  // ACTIVITY_LOG_ANOMALIES - Detected anomalies
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log_anomalies (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      
      -- Detection info
      anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('spike', 'pattern', 'unusual_actor', 'unusual_time', 'unusual_location', 'brute_force', 'data_exfiltration')),
      severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'error', 'critical')),
      
      -- Related activity
      activity_ids TEXT NOT NULL, -- JSON array of related activity IDs
      actor_id TEXT,
      ip_address TEXT,
      
      -- Detection details
      description TEXT NOT NULL,
      evidence TEXT, -- JSON
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      -- Resolution
      status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
      resolved_at DATETIME,
      resolved_by TEXT,
      resolution_notes TEXT,
      
      -- Alert tracking
      alert_sent BOOLEAN DEFAULT 0,
      alert_sent_at DATETIME,
      
      FOREIGN KEY (actor_id) REFERENCES auth_users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activity_anomalies_status ON activity_log_anomalies(status, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_anomalies_actor ON activity_log_anomalies(actor_id, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_anomalies_ip ON activity_log_anomalies(ip_address, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_anomalies_type ON activity_log_anomalies(anomaly_type, detected_at DESC);
  `);

  // ============================================
  // Update triggers
  // ============================================
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_activity_log_subscriptions_updated_at
    AFTER UPDATE ON activity_log_subscriptions
    FOR EACH ROW
    BEGIN
      UPDATE activity_log_subscriptions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  // ============================================
  // Views for common queries
  // ============================================
  
  // Activity timeline view with details join
  db.exec(`
    CREATE VIEW IF NOT EXISTS v_activity_timeline AS
    SELECT 
      al.*,
      ac.name as category_name,
      ac.color as category_color,
      ac.icon as category_icon,
      ald.request_body_size,
      ald.changes_summary
    FROM activity_log al
    LEFT JOIN activity_categories ac ON al.category_id = ac.id
    LEFT JOIN activity_log_details ald ON al.id = ald.activity_id
    WHERE al.privacy_level != 'restricted' OR al.privacy_level IS NULL
    ORDER BY al.occurred_at DESC;
  `);

  // Activity summary by entity
  db.exec(`
    CREATE VIEW IF NOT EXISTS v_activity_by_entity AS
    SELECT 
      entity_type,
      entity_id,
      entity_display,
      COUNT(*) as total_activities,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failure_count,
      MAX(occurred_at) as last_activity_at,
      COUNT(DISTINCT actor_id) as unique_actors,
      GROUP_CONCAT(DISTINCT category_id) as categories
    FROM activity_log
    GROUP BY entity_type, entity_id;
  `);

  // Security events view (for dashboards)
  db.exec(`
    CREATE VIEW IF NOT EXISTS v_security_events AS
    SELECT 
      al.*,
      ac.name as category_name,
      ac.icon as category_icon
    FROM activity_log al
    LEFT JOIN activity_categories ac ON al.category_id = ac.id
    WHERE al.category_id IN ('security', 'auth')
      AND al.severity IN ('warning', 'error', 'critical', 'emergency')
    ORDER BY al.occurred_at DESC;
  `);

  // Recent activity with actor info
  db.exec(`
    CREATE VIEW IF NOT EXISTS v_recent_activity AS
    SELECT 
      al.id,
      al.action,
      al.category_id,
      al.entity_type,
      al.entity_id,
      al.entity_display,
      al.actor_type,
      al.actor_id,
      al.actor_display,
      al.severity,
      al.status,
      al.summary,
      al.occurred_at,
      ac.name as category_name,
      ac.color as category_color,
      ac.icon as category_icon
    FROM activity_log al
    LEFT JOIN activity_categories ac ON al.category_id = ac.id
    WHERE al.occurred_at > datetime('now', '-7 days')
    ORDER BY al.occurred_at DESC;
  `);
}

/**
 * Rollback activity logging schema
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.pragma('foreign_keys = OFF');
  
  try {
    // Drop views
    db.exec(`
      DROP VIEW IF EXISTS v_recent_activity;
      DROP VIEW IF EXISTS v_security_events;
      DROP VIEW IF EXISTS v_activity_by_entity;
      DROP VIEW IF EXISTS v_activity_timeline;
    `);
    
    // Drop triggers
    db.exec(`DROP TRIGGER IF EXISTS trg_activity_log_subscriptions_updated_at;`);
    
    // Drop tables in reverse dependency order
    const tables = [
      'activity_log_anomalies',
      'activity_log_subscriptions',
      'activity_log_aggregates',
      'activity_log_details',
      'activity_log',
      'activity_categories'
    ];
    
    for (const table of tables) {
      db.exec(`DROP TABLE IF EXISTS ${table};`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

export default { up, down };
