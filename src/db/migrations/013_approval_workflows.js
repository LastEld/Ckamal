/**
 * Migration: Approval Workflows for Agent Actions
 * Based on Paperclip's approval system pattern
 * Provides approval workflows for agent actions requiring human oversight
 */

/**
 * Apply migration
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // ============================================
  // APPROVALS - Core approval request table
  // Based on Paperclip's approvals schema
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested', 'escalated', 'cancelled', 'expired')),
      priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
      
      -- Requester info (agent or user)
      requested_by_agent_id TEXT,
      requested_by_user_id TEXT,
      requested_by_type TEXT NOT NULL CHECK (requested_by_type IN ('agent', 'user', 'system')),
      
      -- Payload containing the action requiring approval
      payload TEXT NOT NULL, -- JSON: { action, target, params, context, estimatedImpact }
      
      -- Risk assessment
      risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
      risk_factors TEXT DEFAULT '[]', -- JSON array of identified risk factors
      
      -- Decision info
      decision_note TEXT,
      decided_by_user_id TEXT,
      decided_at DATETIME,
      
      -- Timestamps and timeouts
      timeout_at DATETIME, -- When approval expires
      escalated_at DATETIME,
      escalation_level INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      -- Foreign keys
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by_user_id) REFERENCES auth_users(id) ON DELETE SET NULL,
      FOREIGN KEY (decided_by_user_id) REFERENCES auth_users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_approvals_company_status ON approvals(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_approvals_company_type ON approvals(company_id, type);
    CREATE INDEX IF NOT EXISTS idx_approvals_status_type ON approvals(status, type);
    CREATE INDEX IF NOT EXISTS idx_approvals_requested_by ON approvals(requested_by_agent_id, requested_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_timeout ON approvals(timeout_at) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS idx_approvals_created ON approvals(created_at);
    CREATE INDEX IF NOT EXISTS idx_approvals_company_status_type ON approvals(company_id, status, type);
  `);

  // ============================================
  // APPROVAL_COMMENTS - Discussion thread
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_comments (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL,
      author_type TEXT NOT NULL CHECK (author_type IN ('user', 'agent', 'system')),
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      is_decision_note BOOLEAN DEFAULT 0,
      
      -- For threaded discussions
      parent_comment_id TEXT,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_comment_id) REFERENCES approval_comments(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_approval_comments_approval ON approval_comments(approval_id);
    CREATE INDEX IF NOT EXISTS idx_approval_comments_author ON approval_comments(author_id, author_type);
    CREATE INDEX IF NOT EXISTS idx_approval_comments_created ON approval_comments(created_at);
  `);

  // ============================================
  // APPROVAL_DELEGATIONS - Temporary delegation
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_delegations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      
      -- Who delegates
      delegator_user_id TEXT NOT NULL,
      
      -- Who receives delegation
      delegate_user_id TEXT NOT NULL,
      
      -- Scope of delegation
      approval_types TEXT DEFAULT '[]', -- JSON array, empty means all types
      risk_levels TEXT DEFAULT '["low", "medium"]', -- JSON array of allowed risk levels
      
      -- Time bounds
      starts_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      
      -- Status
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
      revoked_at DATETIME,
      revoked_by TEXT,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (delegator_user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      FOREIGN KEY (delegate_user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      FOREIGN KEY (revoked_by) REFERENCES auth_users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_approval_delegations_company ON approval_delegations(company_id);
    CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegator ON approval_delegations(delegator_user_id);
    CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegate ON approval_delegations(delegate_user_id);
    CREATE INDEX IF NOT EXISTS idx_approval_delegations_status ON approval_delegations(status, expires_at);
  `);

  // ============================================
  // APPROVAL_POLICIES - Who can approve what
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_policies (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      
      -- Policy matching criteria
      name TEXT NOT NULL,
      description TEXT,
      approval_type TEXT, -- NULL means applies to all types
      risk_levels TEXT DEFAULT '["low", "medium", "high", "critical"]', -- JSON array
      
      -- Approval rules
      min_approvers INTEGER DEFAULT 1,
      require_specific_roles TEXT DEFAULT '[]', -- JSON array of required roles
      require_specific_users TEXT DEFAULT '[]', -- JSON array of specific user IDs
      
      -- Auto-approval rules
      auto_approve BOOLEAN DEFAULT 0,
      auto_approve_conditions TEXT, -- JSON: conditions for auto-approval
      
      -- Escalation rules
      escalation_timeout INTEGER DEFAULT 3600, -- seconds before escalation
      escalation_targets TEXT DEFAULT '[]', -- JSON array of user/role IDs
      max_escalation_level INTEGER DEFAULT 2,
      
      -- Policy status
      is_active BOOLEAN DEFAULT 1,
      priority INTEGER DEFAULT 0, -- Higher priority = checked first
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_approval_policies_company ON approval_policies(company_id);
    CREATE INDEX IF NOT EXISTS idx_approval_policies_type ON approval_policies(approval_type);
    CREATE INDEX IF NOT EXISTS idx_approval_policies_active ON approval_policies(company_id, is_active, priority DESC);
  `);

  // ============================================
  // APPROVAL_AUDIT_LOG - Immutable audit trail
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_audit_log (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL,
      action TEXT NOT NULL, -- created, approved, rejected, commented, delegated, escalated, etc.
      actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
      actor_id TEXT NOT NULL,
      details TEXT, -- JSON with action-specific details
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_approval_audit_approval ON approval_audit_log(approval_id);
    CREATE INDEX IF NOT EXISTS idx_approval_audit_actor ON approval_audit_log(actor_id, actor_type);
    CREATE INDEX IF NOT EXISTS idx_approval_audit_created ON approval_audit_log(created_at);
  `);

  // ============================================
  // APPROVAL_STAKEHOLDERS - People to notify
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_stakeholders (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'watcher' CHECK (role IN ('approver', 'watcher', 'requester')),
      notified_at DATETIME,
      responded_at DATETIME,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      UNIQUE(approval_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_approval_stakeholders_approval ON approval_stakeholders(approval_id);
    CREATE INDEX IF NOT EXISTS idx_approval_stakeholders_user ON approval_stakeholders(user_id);
  `);

  // ============================================
  // Update triggers for updated_at
  // ============================================
  const tables = ['approvals', 'approval_comments', 'approval_policies'];
  
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
  // Insert default policies for new companies
  // ============================================
  
  console.log('[Migration 013] Approval workflow tables created successfully');
}

/**
 * Rollback migration
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.pragma('foreign_keys = OFF');

  try {
    // Drop triggers first
    const tables = ['approvals', 'approval_comments', 'approval_policies'];
    for (const table of tables) {
      db.exec(`DROP TRIGGER IF EXISTS trg_${table}_updated_at`);
    }

    // Drop tables in reverse order (respecting foreign keys)
    db.exec(`DROP TABLE IF EXISTS approval_stakeholders`);
    db.exec(`DROP TABLE IF EXISTS approval_audit_log`);
    db.exec(`DROP TABLE IF EXISTS approval_policies`);
    db.exec(`DROP TABLE IF EXISTS approval_delegations`);
    db.exec(`DROP TABLE IF EXISTS approval_comments`);
    db.exec(`DROP TABLE IF EXISTS approvals`);

    console.log('[Migration 013] Approval workflow tables removed');
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
