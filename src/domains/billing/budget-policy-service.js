/**
 * @fileoverview Budget policy service
 * Adds policy-level hard limits and incident management.
 */

const POLICY_SCOPE_TYPES = new Set(['global', 'company', 'project', 'agent']);
const POLICY_ENFORCEMENT = new Set(['hard', 'soft', 'notify']);
const INCIDENT_SEVERITIES = new Set(['warning', 'critical', 'exceeded']);

function safeJsonParse(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return fallback;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class BudgetPolicyService {
  constructor(options = {}) {
    this.db = options.db || null;
    this.name = 'BudgetPolicyService';
  }

  _requireDb() {
    if (!this.db) {
      throw new Error('Database connection is required');
    }
  }

  _hydratePolicy(row) {
    if (!row) return null;
    return {
      ...row,
      hard_limit_cents: Number(row.hard_limit_cents) || 0,
      is_active: parseBool(row.is_active, true),
      metadata: safeJsonParse(row.metadata, {})
    };
  }

  _hydrateIncident(row) {
    if (!row) return null;
    return {
      ...row,
      current_spend_cents: Number(row.current_spend_cents) || 0,
      limit_cents: Number(row.limit_cents) || 0,
      acknowledged: parseBool(row.acknowledged, false),
      metadata: safeJsonParse(row.metadata, {}),
      policy_name: row.policy_name || null,
      enforcement_mode: row.enforcement_mode || null
    };
  }

  async createPolicy(data = {}) {
    this._requireDb();

    const companyId = String(data.company_id || '').trim();
    const name = String(data.name || '').trim();
    const scopeType = String(data.scope_type || '').trim();
    const hardLimit = Number.parseInt(data.hard_limit_cents, 10);
    const enforcementMode = String(data.enforcement_mode || 'hard').trim();

    if (!companyId) throw new Error('company_id is required');
    if (!name) throw new Error('name is required');
    if (!POLICY_SCOPE_TYPES.has(scopeType)) {
      throw new Error(`scope_type must be one of: ${[...POLICY_SCOPE_TYPES].join(', ')}`);
    }
    if (!Number.isFinite(hardLimit) || hardLimit <= 0) {
      throw new Error('hard_limit_cents must be a positive integer');
    }
    if (!POLICY_ENFORCEMENT.has(enforcementMode)) {
      throw new Error(`enforcement_mode must be one of: ${[...POLICY_ENFORCEMENT].join(', ')}`);
    }

    const createdAt = toIsoOrNull(data.created_at);

    const result = this.db.prepare(`
      INSERT INTO budget_policies (
        company_id,
        name,
        scope_type,
        scope_id,
        hard_limit_cents,
        enforcement_mode,
        is_active,
        metadata
        ${createdAt ? ', created_at, updated_at' : ''}
      )
      VALUES (
        @company_id,
        @name,
        @scope_type,
        @scope_id,
        @hard_limit_cents,
        @enforcement_mode,
        @is_active,
        @metadata
        ${createdAt ? ', @created_at, @created_at' : ''}
      )
    `).run({
      company_id: companyId,
      name,
      scope_type: scopeType,
      scope_id: data.scope_id || null,
      hard_limit_cents: hardLimit,
      enforcement_mode: enforcementMode,
      is_active: parseBool(data.is_active, true) ? 1 : 0,
      metadata: JSON.stringify(data.metadata || {}),
      created_at: createdAt
    });

    return this.getPolicy(result.lastInsertRowid);
  }

  async listPolicies(filters = {}) {
    this._requireDb();

    const where = [];
    const params = {};

    if (filters.company_id) {
      where.push('company_id = @company_id');
      params.company_id = String(filters.company_id);
    }
    if (filters.scope_type) {
      where.push('scope_type = @scope_type');
      params.scope_type = String(filters.scope_type);
    }
    if (filters.scope_id) {
      where.push('scope_id = @scope_id');
      params.scope_id = String(filters.scope_id);
    }
    if (filters.is_active !== undefined) {
      where.push('is_active = @is_active');
      params.is_active = parseBool(filters.is_active) ? 1 : 0;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const rows = this.db.prepare(`
      SELECT *
      FROM budget_policies
      ${whereClause}
      ORDER BY created_at DESC
    `).all(params);

    return rows.map((row) => this._hydratePolicy(row));
  }

  async getPolicy(idOrUuid) {
    this._requireDb();
    if (!idOrUuid) return null;

    const row = this.db.prepare(`
      SELECT *
      FROM budget_policies
      WHERE uuid = ? OR id = ?
      LIMIT 1
    `).get(String(idOrUuid), Number.parseInt(idOrUuid, 10) || -1);

    return this._hydratePolicy(row);
  }

  async updatePolicy(idOrUuid, updates = {}) {
    this._requireDb();
    const policy = await this.getPolicy(idOrUuid);
    if (!policy) throw new Error('Policy not found');

    const allowed = {};

    if (updates.name !== undefined) {
      const value = String(updates.name || '').trim();
      if (!value) throw new Error('name cannot be empty');
      allowed.name = value;
    }
    if (updates.scope_type !== undefined) {
      const value = String(updates.scope_type || '').trim();
      if (!POLICY_SCOPE_TYPES.has(value)) {
        throw new Error(`scope_type must be one of: ${[...POLICY_SCOPE_TYPES].join(', ')}`);
      }
      allowed.scope_type = value;
    }
    if (updates.scope_id !== undefined) {
      allowed.scope_id = updates.scope_id || null;
    }
    if (updates.hard_limit_cents !== undefined) {
      const value = Number.parseInt(updates.hard_limit_cents, 10);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('hard_limit_cents must be a positive integer');
      }
      allowed.hard_limit_cents = value;
    }
    if (updates.enforcement_mode !== undefined) {
      const value = String(updates.enforcement_mode || '').trim();
      if (!POLICY_ENFORCEMENT.has(value)) {
        throw new Error(`enforcement_mode must be one of: ${[...POLICY_ENFORCEMENT].join(', ')}`);
      }
      allowed.enforcement_mode = value;
    }
    if (updates.is_active !== undefined) {
      allowed.is_active = parseBool(updates.is_active) ? 1 : 0;
    }
    if (updates.metadata !== undefined) {
      allowed.metadata = JSON.stringify(updates.metadata || {});
    }

    if (Object.keys(allowed).length === 0) {
      return policy;
    }

    const setClause = Object.keys(allowed)
      .map((key) => `${key} = @${key}`)
      .join(', ');

    this.db.prepare(`
      UPDATE budget_policies
      SET ${setClause}
      WHERE id = @id
    `).run({
      ...allowed,
      id: policy.id
    });

    return this.getPolicy(policy.id);
  }

  async deletePolicy(idOrUuid) {
    this._requireDb();
    const policy = await this.getPolicy(idOrUuid);
    if (!policy) return false;

    const result = this.db.prepare(`
      DELETE FROM budget_policies
      WHERE id = ?
    `).run(policy.id);

    return result.changes > 0;
  }

  async createIncident(data = {}) {
    this._requireDb();

    const policyId = Number.parseInt(data.policy_id, 10);
    const companyId = String(data.company_id || '').trim();
    const severity = String(data.severity || '').trim();

    if (!Number.isFinite(policyId) || policyId <= 0) {
      throw new Error('policy_id is required');
    }
    if (!companyId) throw new Error('company_id is required');
    if (!INCIDENT_SEVERITIES.has(severity)) {
      throw new Error(`severity must be one of: ${[...INCIDENT_SEVERITIES].join(', ')}`);
    }

    const createdAt = toIsoOrNull(data.created_at);

    const result = this.db.prepare(`
      INSERT INTO budget_incidents (
        policy_id,
        company_id,
        severity,
        current_spend_cents,
        limit_cents,
        description,
        acknowledged,
        metadata
        ${createdAt ? ', created_at' : ''}
      )
      VALUES (
        @policy_id,
        @company_id,
        @severity,
        @current_spend_cents,
        @limit_cents,
        @description,
        @acknowledged,
        @metadata
        ${createdAt ? ', @created_at' : ''}
      )
    `).run({
      policy_id: policyId,
      company_id: companyId,
      severity,
      current_spend_cents: Number.parseInt(data.current_spend_cents, 10) || 0,
      limit_cents: Number.parseInt(data.limit_cents, 10) || 0,
      description: data.description || null,
      acknowledged: parseBool(data.acknowledged, false) ? 1 : 0,
      metadata: JSON.stringify(data.metadata || {}),
      created_at: createdAt
    });

    return this.getIncident(result.lastInsertRowid);
  }

  async getIncident(idOrUuid) {
    this._requireDb();
    if (!idOrUuid) return null;

    const row = this.db.prepare(`
      SELECT
        bi.*,
        bp.name AS policy_name,
        bp.enforcement_mode
      FROM budget_incidents bi
      INNER JOIN budget_policies bp ON bp.id = bi.policy_id
      WHERE bi.uuid = ? OR bi.id = ?
      LIMIT 1
    `).get(String(idOrUuid), Number.parseInt(idOrUuid, 10) || -1);

    return this._hydrateIncident(row);
  }

  async listIncidents(filters = {}) {
    this._requireDb();

    const where = [];
    const params = {};

    if (filters.company_id) {
      where.push('bi.company_id = @company_id');
      params.company_id = String(filters.company_id);
    }
    if (filters.policy_id) {
      where.push('bi.policy_id = @policy_id');
      params.policy_id = Number.parseInt(filters.policy_id, 10);
    }
    if (filters.severity) {
      where.push('bi.severity = @severity');
      params.severity = String(filters.severity);
    }
    if (filters.acknowledged !== undefined) {
      where.push('bi.acknowledged = @acknowledged');
      params.acknowledged = parseBool(filters.acknowledged) ? 1 : 0;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const limit = Math.max(1, Math.min(200, Number.parseInt(filters.limit, 10) || 50));
    const offset = Math.max(0, Number.parseInt(filters.offset, 10) || 0);

    const rows = this.db.prepare(`
      SELECT
        bi.*,
        bp.name AS policy_name,
        bp.enforcement_mode
      FROM budget_incidents bi
      INNER JOIN budget_policies bp ON bp.id = bi.policy_id
      ${whereClause}
      ORDER BY bi.created_at DESC
      LIMIT @limit OFFSET @offset
    `).all({
      ...params,
      limit,
      offset
    });

    return rows.map((row) => this._hydrateIncident(row));
  }

  async acknowledgeIncident(idOrUuid, acknowledgedBy = null) {
    this._requireDb();
    const incident = await this.getIncident(idOrUuid);
    if (!incident) return null;

    this.db.prepare(`
      UPDATE budget_incidents
      SET
        acknowledged = 1,
        acknowledged_by = @acknowledged_by,
        acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      id: incident.id,
      acknowledged_by: acknowledgedBy || null
    });

    return this.getIncident(incident.id);
  }

  async evaluatePolicy(policyIdOrUuid, options = {}) {
    this._requireDb();
    const policy = await this.getPolicy(policyIdOrUuid);
    if (!policy) throw new Error('Policy not found');
    if (!policy.is_active) {
      return { policy, triggered: false, reason: 'inactive' };
    }

    let currentSpendCents = Number.parseInt(options.current_spend_cents, 10);
    if (!Number.isFinite(currentSpendCents)) {
      currentSpendCents = await this._getCurrentCompanySpendCents(policy.company_id);
    }

    const ratio = policy.hard_limit_cents > 0
      ? currentSpendCents / policy.hard_limit_cents
      : 0;

    let severity = null;
    if (ratio >= 1) severity = 'exceeded';
    else if (ratio >= 0.9) severity = 'critical';
    else if (ratio >= 0.75) severity = 'warning';

    if (!severity) {
      return {
        policy,
        triggered: false,
        current_spend_cents: currentSpendCents,
        usage_ratio: Number(ratio.toFixed(4))
      };
    }

    // Avoid duplicate identical incidents in the same hour.
    const existing = this.db.prepare(`
      SELECT id
      FROM budget_incidents
      WHERE policy_id = ?
        AND severity = ?
        AND acknowledged = 0
        AND created_at >= datetime('now', '-60 minutes')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(policy.id, severity);

    const incident = existing
      ? await this.getIncident(existing.id)
      : await this.createIncident({
          policy_id: policy.id,
          company_id: policy.company_id,
          severity,
          current_spend_cents: currentSpendCents,
          limit_cents: policy.hard_limit_cents,
          description: `Budget policy "${policy.name}" reached ${Math.round(ratio * 100)}% of limit.`,
          metadata: { usage_ratio: Number(ratio.toFixed(4)) }
        });

    return {
      policy,
      triggered: true,
      incident,
      current_spend_cents: currentSpendCents,
      usage_ratio: Number(ratio.toFixed(4)),
      should_block: severity === 'exceeded' && policy.enforcement_mode === 'hard'
    };
  }

  async _getCurrentCompanySpendCents(companyId) {
    if (!companyId) return 0;

    const periodStart = new Date();
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);

    const costRow = this.db.prepare(`
      SELECT COALESCE(SUM(total_cost), 0) AS total_cost
      FROM cost_events
      WHERE company_id = ?
        AND created_at >= ?
    `).get(companyId, periodStart.toISOString());

    const financeRow = this.db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS amount_cents
      FROM finance_events
      WHERE company_id = ?
        AND created_at >= ?
    `).get(companyId, periodStart.toISOString());

    const costCents = Math.round((Number(costRow?.total_cost || 0)) * 100);
    const financeCents = Number(financeRow?.amount_cents || 0);

    return costCents + financeCents;
  }
}

export default BudgetPolicyService;
