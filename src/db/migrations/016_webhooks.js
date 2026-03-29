/**
 * @fileoverview Migration 016: Webhook System
 * Creates tables for comprehensive webhook management including subscriptions,
 * deliveries, and event tracking.
 * 
 * @module db/migrations/016_webhooks
 * @version 5.0.0
 */

/**
 * Migration configuration
 * @typedef {Object} MigrationConfig
 * @property {string} name - Migration name
 * @property {number} version - Migration version
 */
export const config = {
  name: 'webhooks',
  version: 16
};

/**
 * SQL statements for creating webhook tables
 * @type {string[]}
 */
const UP_MIGRATION = `
-- =====================================================
-- Webhook System Tables
-- =====================================================

-- =====================================================
-- Webhooks Table
-- Core webhook configuration
-- =====================================================
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_id TEXT NOT NULL,
  
  -- Basic info
  name TEXT,
  description TEXT,
  url TEXT NOT NULL,
  headers TEXT, -- JSON object of custom headers
  
  -- Security
  signing_algorithm TEXT NOT NULL DEFAULT 'hmac-sha256' CHECK (signing_algorithm IN ('hmac-sha256', 'hmac-sha512')),
  secret_hash TEXT NOT NULL, -- Hashed secret (actual secret shown once on creation)
  secret_rotated_at DATETIME,
  
  -- Status
  active BOOLEAN NOT NULL DEFAULT 1,
  disabled_reason TEXT,
  
  -- Delivery settings
  retry_count INTEGER NOT NULL DEFAULT 5 CHECK (retry_count >= 0 AND retry_count <= 20),
  
  -- Statistics
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_success_at DATETIME,
  last_failure_at DATETIME,
  
  -- Audit
  created_by_user_id TEXT,
  created_by_agent_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES auth_users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_agent_id) REFERENCES runtime_provider_sessions(id) ON DELETE SET NULL
);

-- Indexes for webhooks table
CREATE INDEX IF NOT EXISTS idx_webhooks_company ON webhooks(company_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_company_active ON webhooks(company_id, active);
CREATE INDEX IF NOT EXISTS idx_webhooks_created_at ON webhooks(created_at DESC);

-- =====================================================
-- Webhook Event Types Table
-- Many-to-many: webhooks <-> event types
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_event_types (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  webhook_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  category TEXT, -- Derived from event type for quick filtering
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE,
  UNIQUE(webhook_id, event_type)
);

-- Indexes for webhook_event_types table
CREATE INDEX IF NOT EXISTS idx_webhook_event_types_webhook ON webhook_event_types(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_types_event ON webhook_event_types(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_event_types_category ON webhook_event_types(category);

-- =====================================================
-- Webhook Deliveries Table
-- Delivery tracking and history
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  webhook_id TEXT NOT NULL,
  
  -- Event info
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON payload
  
  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'delivered', 'failed', 'retrying', 'exhausted')),
  
  -- Attempt tracking
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at DATETIME,
  
  -- Response info
  http_status_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  
  -- Timing
  delivered_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);

-- Indexes for webhook_deliveries table
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_id ON webhook_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON webhook_deliveries(webhook_id, status) WHERE status IN ('pending', 'retrying');

-- =====================================================
-- Webhook Delivery Attempts Table
-- Detailed attempt history for failed deliveries
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  delivery_id TEXT NOT NULL,
  
  -- Attempt info
  attempt_number INTEGER NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  
  -- Result
  success BOOLEAN,
  http_status_code INTEGER,
  error_message TEXT,
  response_body TEXT,
  duration_ms INTEGER,
  
  -- Request details (for debugging)
  request_headers TEXT, -- JSON
  request_body_size INTEGER,
  
  FOREIGN KEY (delivery_id) REFERENCES webhook_deliveries(id) ON DELETE CASCADE
);

-- Indexes for webhook_delivery_attempts table
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_attempts_delivery ON webhook_delivery_attempts(delivery_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_attempts_started ON webhook_delivery_attempts(started_at DESC);

-- =====================================================
-- Webhook Events Table (Optional - for event replay/idempotency)
-- Stores all events for potential replay
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  
  -- Event info
  event_type TEXT NOT NULL,
  category TEXT,
  payload TEXT NOT NULL, -- JSON payload
  
  -- Source
  source_type TEXT, -- 'system', 'user', 'agent', 'webhook'
  source_id TEXT,
  
  -- Status
  processed BOOLEAN NOT NULL DEFAULT 0,
  processed_at DATETIME,
  
  -- Idempotency
  idempotency_key TEXT UNIQUE,
  
  -- Timing
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Indexes for webhook_events table
CREATE INDEX IF NOT EXISTS idx_webhook_events_company ON webhook_events(company_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_category ON webhook_events(category);
CREATE INDEX IF NOT EXISTS idx_webhook_events_occurred ON webhook_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed ON webhook_events(processed) WHERE processed = 0;
CREATE INDEX IF NOT EXISTS idx_webhook_events_idempotency ON webhook_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- Webhook Stats Table (Materialized stats for performance)
-- Daily aggregated statistics per webhook
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id TEXT NOT NULL,
  stats_date DATE NOT NULL,
  
  -- Counts
  total_deliveries INTEGER NOT NULL DEFAULT 0,
  successful_deliveries INTEGER NOT NULL DEFAULT 0,
  failed_deliveries INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  avg_duration_ms INTEGER,
  max_duration_ms INTEGER,
  min_duration_ms INTEGER,
  
  -- Retries
  total_retries INTEGER NOT NULL DEFAULT 0,
  
  -- HTTP status distribution (JSON)
  status_codes TEXT,
  
  -- Event type distribution (JSON)
  event_types TEXT,
  
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE,
  UNIQUE(webhook_id, stats_date)
);

-- Indexes for webhook_stats table
CREATE INDEX IF NOT EXISTS idx_webhook_stats_webhook ON webhook_stats(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_stats_date ON webhook_stats(stats_date);

-- =====================================================
-- Update Triggers
-- =====================================================

-- Update trigger for webhooks table
CREATE TRIGGER IF NOT EXISTS tr_webhooks_updated_at
AFTER UPDATE ON webhooks
BEGIN
  UPDATE webhooks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =====================================================
-- Views
-- =====================================================

-- Webhook delivery summary view
CREATE VIEW IF NOT EXISTS v_webhook_delivery_summary AS
SELECT 
  w.id as webhook_id,
  w.company_id,
  w.name,
  w.url,
  w.active,
  COUNT(wd.id) as total_deliveries,
  SUM(CASE WHEN wd.status = 'delivered' THEN 1 ELSE 0 END) as successful_deliveries,
  SUM(CASE WHEN wd.status = 'failed' OR wd.status = 'exhausted' THEN 1 ELSE 0 END) as failed_deliveries,
  SUM(CASE WHEN wd.status = 'pending' OR wd.status = 'retrying' THEN 1 ELSE 0 END) as pending_deliveries,
  MAX(wd.delivered_at) as last_delivery_at,
  AVG(CASE WHEN wd.status = 'delivered' THEN wd.duration_ms END) as avg_duration_ms
FROM webhooks w
LEFT JOIN webhook_deliveries wd ON w.id = wd.webhook_id
GROUP BY w.id;

-- Recent failed deliveries view
CREATE VIEW IF NOT EXISTS v_webhook_recent_failures AS
SELECT 
  wd.*,
  w.company_id,
  w.name as webhook_name,
  w.url as webhook_url
FROM webhook_deliveries wd
JOIN webhooks w ON wd.webhook_id = w.id
WHERE wd.status IN ('failed', 'exhausted')
  AND wd.created_at > datetime('now', '-24 hours')
ORDER BY wd.created_at DESC;

-- Webhook health status view
CREATE VIEW IF NOT EXISTS v_webhook_health AS
SELECT 
  w.id,
  w.company_id,
  w.name,
  w.url,
  w.active,
  COUNT(CASE WHEN wd.created_at > datetime('now', '-24 hours') THEN 1 END) as deliveries_24h,
  COUNT(CASE WHEN wd.status = 'delivered' AND wd.created_at > datetime('now', '-24 hours') THEN 1 END) as success_24h,
  COUNT(CASE WHEN wd.status IN ('failed', 'exhausted') AND wd.created_at > datetime('now', '-24 hours') THEN 1 END) as failures_24h,
  CASE 
    WHEN w.active = 0 THEN 'disabled'
    WHEN COUNT(CASE WHEN wd.created_at > datetime('now', '-24 hours') THEN 1 END) = 0 THEN 'idle'
    WHEN COUNT(CASE WHEN wd.status = 'delivered' AND wd.created_at > datetime('now', '-24 hours') THEN 1 END) * 1.0 / 
         NULLIF(COUNT(CASE WHEN wd.created_at > datetime('now', '-24 hours') THEN 1 END), 0) >= 0.95 THEN 'healthy'
    WHEN COUNT(CASE WHEN wd.status = 'delivered' AND wd.created_at > datetime('now', '-24 hours') THEN 1 END) * 1.0 / 
         NULLIF(COUNT(CASE WHEN wd.created_at > datetime('now', '-24 hours') THEN 1 END), 0) >= 0.80 THEN 'degraded'
    ELSE 'unhealthy'
  END as health_status
FROM webhooks w
LEFT JOIN webhook_deliveries wd ON w.id = wd.webhook_id
GROUP BY w.id;
`;

/**
 * SQL statements for dropping webhook tables
 * @type {string}
 */
const DOWN_MIGRATION = `
-- Drop views
DROP VIEW IF EXISTS v_webhook_health;
DROP VIEW IF EXISTS v_webhook_recent_failures;
DROP VIEW IF EXISTS v_webhook_delivery_summary;

-- Drop triggers
DROP TRIGGER IF EXISTS tr_webhooks_updated_at;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS webhook_stats;
DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS webhook_delivery_attempts;
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_event_types;
DROP TABLE IF EXISTS webhooks;
`;

/**
 * Execute migration up
 * @async
 * @param {import('better-sqlite3').Database} db - Database instance
 * @returns {Promise<void>}
 */
export async function up(db) {
  // Execute the entire migration as a single script
  db.exec(UP_MIGRATION);
  
  console.log(`[Migration ${config.version}] Created webhook system tables`);
}

/**
 * Execute migration down
 * @async
 * @param {import('better-sqlite3').Database} db - Database instance
 * @returns {Promise<void>}
 */
export async function down(db) {
  const statements = DOWN_MIGRATION.split(';').filter(s => s.trim());
  
  for (const statement of statements) {
    if (statement.trim()) {
      db.exec(statement + ';');
    }
  }
  
  console.log(`[Migration ${config.version}] Dropped webhook system tables`);
}

export default { config, up, down };
