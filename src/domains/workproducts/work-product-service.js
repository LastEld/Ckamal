/**
 * @fileoverview Work product service
 * Stores and tracks issue-linked deliverables.
 */

const PRODUCT_TYPES = new Set(['pr', 'branch', 'commit', 'artifact', 'document', 'deployment']);
const PRODUCT_STATUSES = new Set(['active', 'merged', 'closed', 'deleted', 'failed']);

function safeJsonParse(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export class WorkProductService {
  constructor(options = {}) {
    this.db = options.db || null;
    this.name = 'WorkProductService';
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
      metadata: safeJsonParse(row.metadata, {})
    };
  }

  async createProduct(data = {}) {
    this._requireDb();

    const issueId = String(data.issue_id || '').trim();
    const productType = String(data.product_type || '').trim();
    const provider = String(data.provider || '').trim();
    const status = String(data.status || 'active').trim();

    if (!issueId) throw new Error('issue_id is required');
    if (!PRODUCT_TYPES.has(productType)) {
      throw new Error(`product_type must be one of: ${[...PRODUCT_TYPES].join(', ')}`);
    }
    if (!provider) throw new Error('provider is required');
    if (!PRODUCT_STATUSES.has(status)) {
      throw new Error(`status must be one of: ${[...PRODUCT_STATUSES].join(', ')}`);
    }

    const result = this.db.prepare(`
      INSERT INTO issue_work_products (
        issue_id,
        company_id,
        workspace_id,
        product_type,
        provider,
        title,
        external_url,
        external_id,
        status,
        created_by_agent_id,
        created_by_user_id,
        metadata
      )
      VALUES (
        @issue_id,
        @company_id,
        @workspace_id,
        @product_type,
        @provider,
        @title,
        @external_url,
        @external_id,
        @status,
        @created_by_agent_id,
        @created_by_user_id,
        @metadata
      )
    `).run({
      issue_id: issueId,
      company_id: data.company_id || null,
      workspace_id: data.workspace_id || null,
      product_type: productType,
      provider,
      title: data.title || null,
      external_url: data.external_url || null,
      external_id: data.external_id || null,
      status,
      created_by_agent_id: data.created_by_agent_id || null,
      created_by_user_id: data.created_by_user_id || null,
      metadata: JSON.stringify(data.metadata || {})
    });

    return this.getProduct(result.lastInsertRowid);
  }

  async getProduct(idOrUuid) {
    this._requireDb();
    if (!idOrUuid) return null;

    const row = this.db.prepare(`
      SELECT *
      FROM issue_work_products
      WHERE uuid = ? OR id = ?
      LIMIT 1
    `).get(String(idOrUuid), Number.parseInt(idOrUuid, 10) || -1);

    return this._hydrate(row);
  }

  async listProducts(filters = {}) {
    this._requireDb();

    const where = [];
    const params = {};

    if (filters.issue_id) {
      where.push('issue_id = @issue_id');
      params.issue_id = String(filters.issue_id);
    }
    if (filters.company_id) {
      where.push('company_id = @company_id');
      params.company_id = String(filters.company_id);
    }
    if (filters.product_type) {
      where.push('product_type = @product_type');
      params.product_type = String(filters.product_type);
    }
    if (filters.provider) {
      where.push('provider = @provider');
      params.provider = String(filters.provider);
    }
    if (filters.status) {
      where.push('status = @status');
      params.status = String(filters.status);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(200, Number.parseInt(filters.limit, 10) || 50));
    const offset = Math.max(0, Number.parseInt(filters.offset, 10) || 0);

    const rows = this.db.prepare(`
      SELECT *
      FROM issue_work_products
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `).all({
      ...params,
      limit,
      offset
    });

    return rows.map((row) => this._hydrate(row));
  }

  async updateProduct(idOrUuid, updates = {}) {
    this._requireDb();
    const product = await this.getProduct(idOrUuid);
    if (!product) throw new Error('Work product not found');

    const allowed = {};

    if (updates.title !== undefined) {
      allowed.title = updates.title || null;
    }
    if (updates.external_url !== undefined) {
      allowed.external_url = updates.external_url || null;
    }
    if (updates.external_id !== undefined) {
      allowed.external_id = updates.external_id || null;
    }
    if (updates.workspace_id !== undefined) {
      allowed.workspace_id = updates.workspace_id || null;
    }
    if (updates.status !== undefined) {
      const status = String(updates.status || '').trim();
      if (!PRODUCT_STATUSES.has(status)) {
        throw new Error(`status must be one of: ${[...PRODUCT_STATUSES].join(', ')}`);
      }
      allowed.status = status;
    }
    if (updates.metadata !== undefined) {
      allowed.metadata = JSON.stringify(updates.metadata || {});
    }

    if (Object.keys(allowed).length === 0) {
      return product;
    }

    const setClause = Object.keys(allowed).map((key) => `${key} = @${key}`).join(', ');

    this.db.prepare(`
      UPDATE issue_work_products
      SET ${setClause}
      WHERE id = @id
    `).run({
      ...allowed,
      id: product.id
    });

    return this.getProduct(product.id);
  }

  async deleteProduct(idOrUuid) {
    this._requireDb();
    const product = await this.getProduct(idOrUuid);
    if (!product) return false;

    const result = this.db.prepare(`
      UPDATE issue_work_products
      SET status = 'deleted'
      WHERE id = ?
    `).run(product.id);

    return result.changes > 0;
  }
}

export default WorkProductService;
