/**
 * CogniMesh v5.0 - Cost Tracking & Budget Management Schema
 * 
 * Creates tables for:
 * - cost_events: Per-request cost tracking with full attribution
 * - budgets: Spending limits and policies
 * - budget_alerts: Budget threshold notifications
 * - cost_rates: Model pricing rates
 */

export function up(db) {
  db.pragma('foreign_keys = ON');

  // ============================================
  // COST_EVENTS - Per-request cost tracking
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS cost_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      
      -- Attribution (Multi-tenancy)
      company_id INTEGER,           -- Organization/account
      user_id INTEGER,              -- User who initiated
      agent_id TEXT,                -- Agent/CV identifier
      session_id TEXT,              -- Runtime session
      
      -- Request Context
      request_id TEXT NOT NULL,     -- Unique request identifier
      conversation_id INTEGER,      -- Optional: parent conversation
      task_id INTEGER,              -- Optional: linked task
      
      -- Model Information
      provider TEXT NOT NULL,       -- Runtime provider (claude, codex, kimi)
      model TEXT NOT NULL,          -- Model identifier
      billing_model TEXT DEFAULT 'subscription' CHECK (billing_model IN ('subscription', 'pay_per_use')),
      
      -- Token Usage
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      
      -- Cost Breakdown (USD)
      input_cost REAL NOT NULL DEFAULT 0,
      output_cost REAL NOT NULL DEFAULT 0,
      base_cost REAL NOT NULL DEFAULT 0,      -- Request overhead
      total_cost REAL NOT NULL DEFAULT 0,     -- Sum of all costs
      
      -- Routing Information
      routing_strategy TEXT CHECK (routing_strategy IN ('preferred_model', 'multi_factor_scoring', 'fallback_routing')),
      estimated_cost REAL,          -- Pre-execution estimate
      cost_variance REAL GENERATED ALWAYS AS (total_cost - COALESCE(estimated_cost, total_cost)) STORED,
      
      -- Metadata
      operation_type TEXT DEFAULT 'completion' CHECK (operation_type IN ('completion', 'embedding', 'tool_call', 'image_generation')),
      metadata TEXT DEFAULT '{}',   -- JSON: latency, cached, etc.
      
      -- Timestamps
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE SET NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    -- Indexes for cost_events
    CREATE INDEX IF NOT EXISTS idx_cost_events_company_created 
      ON cost_events(company_id, created_at) WHERE company_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_cost_events_user_created 
      ON cost_events(user_id, created_at) WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_cost_events_agent 
      ON cost_events(agent_id, created_at) WHERE agent_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_cost_events_session 
      ON cost_events(session_id, created_at) WHERE session_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_cost_events_provider_model 
      ON cost_events(provider, model, created_at);
    CREATE INDEX IF NOT EXISTS idx_cost_events_created_at 
      ON cost_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_cost_events_request_id 
      ON cost_events(request_id);
    CREATE INDEX IF NOT EXISTS idx_cost_events_billing_model 
      ON cost_events(billing_model, created_at);
  `);

  // ============================================
  // BUDGETS - Spending limits and policies
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      
      -- Scope (Multi-tenancy)
      scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'company', 'user', 'agent')),
      scope_id TEXT,                -- ID within scope type
      
      -- Budget Configuration
      name TEXT NOT NULL,
      description TEXT,
      period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
      amount REAL NOT NULL CHECK (amount > 0),
      currency TEXT DEFAULT 'USD',
      
      -- Time Boundaries
      start_date DATETIME NOT NULL,
      end_date DATETIME,            -- NULL = ongoing/recurring
      
      -- Alert Configuration
      alert_threshold_1 REAL DEFAULT 0.50 CHECK (alert_threshold_1 BETWEEN 0 AND 1),
      alert_threshold_2 REAL DEFAULT 0.75 CHECK (alert_threshold_2 BETWEEN 0 AND 1),
      alert_threshold_3 REAL DEFAULT 0.90 CHECK (alert_threshold_3 BETWEEN 0 AND 1),
      
      -- Enforcement
      enforcement_mode TEXT DEFAULT 'hard' CHECK (enforcement_mode IN ('soft', 'hard', 'notify_only')),
        -- soft: Warn but allow
        -- hard: Block requests when exceeded
        -- notify_only: Track only, no alerts
      
      -- Filters (NULL = all allowed)
      providers TEXT,               -- JSON array of allowed providers
      models TEXT,                  -- JSON array of allowed models
      operations TEXT,              -- JSON array of operation types
      
      -- Status
      is_active BOOLEAN DEFAULT 1,
      created_by INTEGER,
      
      -- Metadata
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (created_by) REFERENCES auth_users(id) ON DELETE SET NULL
    );

    -- Indexes for budgets
    CREATE INDEX IF NOT EXISTS idx_budgets_scope 
      ON budgets(scope_type, scope_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_budgets_active_period 
      ON budgets(is_active, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_budgets_created_by 
      ON budgets(created_by);
  `);

  // ============================================
  // BUDGET_ALERTS - Budget threshold notifications
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      
      budget_id INTEGER NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'critical', 'exceeded')),
      
      -- Alert Context
      threshold_triggered REAL NOT NULL CHECK (threshold_triggered BETWEEN 0 AND 1),
      current_spend REAL NOT NULL,
      budget_limit REAL NOT NULL,
      
      -- Message
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      
      -- Status
      acknowledged BOOLEAN DEFAULT 0,
      acknowledged_by INTEGER,
      acknowledged_at DATETIME,
      
      -- Notification tracking
      channels_notified TEXT DEFAULT '[]', -- JSON array of channels
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
      FOREIGN KEY (acknowledged_by) REFERENCES auth_users(id) ON DELETE SET NULL
    );

    -- Indexes for budget_alerts
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget 
      ON budget_alerts(budget_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_unack 
      ON budget_alerts(budget_id, acknowledged) WHERE acknowledged = 0;
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_level 
      ON budget_alerts(level, created_at);
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_created 
      ON budget_alerts(created_at);
  `);

  // ============================================
  // COST_RATES - Model pricing rates
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS cost_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      billing_model TEXT DEFAULT 'subscription',
      
      -- Pricing (per 1000 tokens)
      input_rate REAL NOT NULL CHECK (input_rate >= 0),
      output_rate REAL NOT NULL CHECK (output_rate >= 0),
      base_cost REAL DEFAULT 0 CHECK (base_cost >= 0),     -- Fixed cost per request
      
      -- Currency
      currency TEXT DEFAULT 'USD',
      
      -- Effective dates
      effective_from DATETIME DEFAULT CURRENT_TIMESTAMP,
      effective_until DATETIME,     -- NULL = current
      
      -- Metadata
      region TEXT,                  -- Optional: region-specific pricing
      metadata TEXT DEFAULT '{}',
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(provider, model, billing_model, effective_from)
    );

    -- Indexes for cost_rates
    CREATE INDEX IF NOT EXISTS idx_cost_rates_provider_model 
      ON cost_rates(provider, model, effective_from);
    CREATE INDEX IF NOT EXISTS idx_cost_rates_current 
      ON cost_rates(provider, model, effective_from, effective_until) 
      WHERE effective_until IS NULL;
  `);

  // ============================================
  // Update triggers for updated_at
  // ============================================
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_budgets_updated_at
    AFTER UPDATE ON budgets
    FOR EACH ROW
    BEGIN
      UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_cost_rates_updated_at
    AFTER UPDATE ON cost_rates
    FOR EACH ROW
    BEGIN
      UPDATE cost_rates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  // ============================================
  // Seed default cost rates
  // ============================================
  const now = new Date().toISOString();
  
  const defaultRates = [
    // Claude models
    ['anthropic', 'claude-opus-4-6', 'subscription', 0.0050, 0.0150, 0],
    ['anthropic', 'claude-opus-4-5', 'subscription', 0.0040, 0.0120, 0],
    ['anthropic', 'claude-sonnet-4-6', 'subscription', 0.0022, 0.0066, 0],
    ['anthropic', 'claude-sonnet-4-5', 'subscription', 0.0019, 0.0057, 0],
    // OpenAI models
    ['openai', 'gpt-5.4-codex', 'subscription', 0.0024, 0.0072, 0],
    ['openai', 'gpt-5.3-codex', 'subscription', 0.0008, 0.0024, 0],
    // Moonshot models
    ['moonshot', 'kimi-k2-5', 'subscription', 0.0009, 0.0027, 0],
    // Pay-per-use rates (example - adjust as needed)
    ['anthropic', 'claude-opus-4-6', 'pay_per_use', 0.0150, 0.0750, 0.001],
    ['anthropic', 'claude-sonnet-4-6', 'pay_per_use', 0.0030, 0.0150, 0.001],
    ['openai', 'gpt-5.4-codex', 'pay_per_use', 0.0030, 0.0120, 0.001],
    ['moonshot', 'kimi-k2-5', 'pay_per_use', 0.0015, 0.0060, 0.001]
  ];

  const insertRate = db.prepare(`
    INSERT OR IGNORE INTO cost_rates 
      (provider, model, billing_model, input_rate, output_rate, base_cost, effective_from)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const rate of defaultRates) {
    insertRate.run(...rate, now);
  }
}

export function down(db) {
  db.pragma('foreign_keys = OFF');
  
  try {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_budgets_updated_at;
      DROP TRIGGER IF EXISTS trg_cost_rates_updated_at;

      DROP TABLE IF EXISTS budget_alerts;
      DROP TABLE IF EXISTS budgets;
      DROP TABLE IF EXISTS cost_rates;
      DROP TABLE IF EXISTS cost_events;
    `);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
