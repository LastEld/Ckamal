/**
 * @fileoverview Finance service
 * Manages non-token financial events for company ledgers.
 */

const FINANCE_EVENT_TYPES = new Set([
  'credit_purchase',
  'storage_fee',
  'workspace_compute',
  'budget_incident',
  'adjustment'
]);

function safeJsonParse(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class FinanceService {
  constructor(options = {}) {
    this.db = options.db || null;
    this.name = 'FinanceService';
  }

  _requireDb() {
    if (!this.db) {
      throw new Error('Database connection is required');
    }
  }

  _hydrate(row) {
    if (!row) return null;
    return {
      ...row,
      metadata: safeJsonParse(row.metadata, {}),
      amount_cents: Number(row.amount_cents) || 0
    };
  }

  async createEvent(data = {}) {
    this._requireDb();

    const companyId = String(data.company_id || '').trim();
    const eventType = String(data.event_type || '').trim();
    const amountCents = Number.parseInt(data.amount_cents, 10);

    if (!companyId) {
      throw new Error('company_id is required');
    }
    if (!FINANCE_EVENT_TYPES.has(eventType)) {
      throw new Error(`event_type must be one of: ${[...FINANCE_EVENT_TYPES].join(', ')}`);
    }
    if (!Number.isFinite(amountCents)) {
      throw new Error('amount_cents must be an integer');
    }

    const createdAt = toIsoOrNull(data.created_at);

    const result = this.db.prepare(`
      INSERT INTO finance_events (
        company_id,
        event_type,
        amount_cents,
        currency,
        description,
        metadata,
        created_by
        ${createdAt ? ', created_at' : ''}
      )
      VALUES (
        @company_id,
        @event_type,
        @amount_cents,
        @currency,
        @description,
        @metadata,
        @created_by
        ${createdAt ? ', @created_at' : ''}
      )
    `).run({
      company_id: companyId,
      event_type: eventType,
      amount_cents: amountCents,
      currency: (data.currency || 'USD').toUpperCase(),
      description: data.description || null,
      metadata: JSON.stringify(data.metadata || {}),
      created_by: data.created_by || null,
      created_at: createdAt
    });

    const row = this.db.prepare(`
      SELECT *
      FROM finance_events
      WHERE id = ?
    `).get(result.lastInsertRowid);

    return this._hydrate(row);
  }

  async getEvent(idOrUuid) {
    this._requireDb();
    if (!idOrUuid) return null;

    const row = this.db.prepare(`
      SELECT *
      FROM finance_events
      WHERE uuid = ? OR id = ?
      LIMIT 1
    `).get(String(idOrUuid), Number.parseInt(idOrUuid, 10) || -1);

    return this._hydrate(row);
  }

  async listEvents(filters = {}, pagination = {}) {
    this._requireDb();

    const where = [];
    const params = {};

    if (filters.company_id) {
      where.push('company_id = @company_id');
      params.company_id = String(filters.company_id);
    }
    if (filters.event_type) {
      where.push('event_type = @event_type');
      params.event_type = String(filters.event_type);
    }
    if (filters.start_date) {
      const iso = toIsoOrNull(filters.start_date);
      if (!iso) throw new Error('Invalid start_date');
      where.push('created_at >= @start_date');
      params.start_date = iso;
    }
    if (filters.end_date) {
      const iso = toIsoOrNull(filters.end_date);
      if (!iso) throw new Error('Invalid end_date');
      where.push('created_at <= @end_date');
      params.end_date = iso;
    }

    const limit = Math.max(1, Math.min(200, Number.parseInt(pagination.limit, 10) || 50));
    const offset = Math.max(0, Number.parseInt(pagination.offset, 10) || 0);
    params.limit = limit;
    params.offset = offset;

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totalRow = this.db.prepare(`
      SELECT COUNT(*) AS total
      FROM finance_events
      ${whereClause}
    `).get(params);

    const rows = this.db.prepare(`
      SELECT *
      FROM finance_events
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `).all(params);

    return {
      items: rows.map((row) => this._hydrate(row)),
      pagination: {
        total: Number(totalRow?.total || 0),
        limit,
        offset
      }
    };
  }

  async getSummary(filters = {}) {
    this._requireDb();

    const where = [];
    const params = {};

    if (filters.company_id) {
      where.push('company_id = @company_id');
      params.company_id = String(filters.company_id);
    }
    if (filters.start_date) {
      const iso = toIsoOrNull(filters.start_date);
      if (!iso) throw new Error('Invalid start_date');
      where.push('created_at >= @start_date');
      params.start_date = iso;
    }
    if (filters.end_date) {
      const iso = toIsoOrNull(filters.end_date);
      if (!iso) throw new Error('Invalid end_date');
      where.push('created_at <= @end_date');
      params.end_date = iso;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const aggregates = this.db.prepare(`
      SELECT
        COUNT(*) AS total_events,
        COALESCE(SUM(amount_cents), 0) AS net_cents,
        COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END), 0) AS debit_cents,
        COALESCE(SUM(CASE WHEN amount_cents < 0 THEN amount_cents ELSE 0 END), 0) AS credit_cents
      FROM finance_events
      ${whereClause}
    `).get(params);

    const byTypeRows = this.db.prepare(`
      SELECT
        event_type,
        COUNT(*) AS event_count,
        COALESCE(SUM(amount_cents), 0) AS amount_cents
      FROM finance_events
      ${whereClause}
      GROUP BY event_type
      ORDER BY event_count DESC
    `).all(params);

    return {
      total_events: Number(aggregates?.total_events || 0),
      net_cents: Number(aggregates?.net_cents || 0),
      debit_cents: Number(aggregates?.debit_cents || 0),
      credit_cents: Number(aggregates?.credit_cents || 0),
      by_type: byTypeRows.map((row) => ({
        event_type: row.event_type,
        event_count: Number(row.event_count || 0),
        amount_cents: Number(row.amount_cents || 0)
      }))
    };
  }
}

export default FinanceService;
