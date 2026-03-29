/**
 * @fileoverview Company Repository - Data access layer for companies and memberships
 * @module db/repositories/companies
 */

import crypto from 'crypto';
import { BaseRepository } from './base-repository.js';

/**
 * @typedef {Object} Company
 * @property {string} id - Database ID (UUID/TEXT from migration 006)
 * @property {string} uuid - Unique identifier (same as id for TEXT PK)
 * @property {string} name - Company name
 * @property {string} slug - URL-friendly identifier
 * @property {string} description - Company description
 * @property {string} status - Company status
 * @property {string} pause_reason - Reason for suspension
 * @property {string} paused_at - ISO timestamp of suspension
 * @property {string} brand_color - Primary brand color
 * @property {string} logo_url - Company logo URL
 * @property {number} budget_monthly_cents - Monthly budget
 * @property {number} spent_monthly_cents - Monthly spend
 * @property {string} settings - JSON settings
 * @property {number} require_approval_for_agents - Approval flag
 * @property {string} created_by - Creator user ID
 * @property {string} created_at - ISO timestamp
 * @property {string} updated_at - ISO timestamp
 * @property {string} deleted_at - Soft delete timestamp
 * @property {string} deleted_by - Deleter user ID
 */

/**
 * Company repository with multi-tenant support
 * Compatible with companies table created in migration 006 (TEXT id)
 * @extends BaseRepository
 */
export class CompanyRepository extends BaseRepository {
  /** @type {string[]} */
  static COLUMNS = [
    'uuid',
    'name',
    'slug',
    'description',
    'status',
    'pause_reason',
    'paused_at',
    'brand_color',
    'logo_url',
    'budget_monthly_cents',
    'spent_monthly_cents',
    'settings',
    'require_approval_for_agents',
    'created_by',
    'deleted_at',
    'deleted_by'
  ];

  /**
   * Create a company repository
   * @param {import('../connection/index.js').ConnectionPool} pool - Connection pool
   */
  constructor(pool) {
    super(pool, 'companies', 'id', CompanyRepository.COLUMNS);
  }

  /**
   * Find a company by its ID
   * @param {string} id - Company ID (UUID)
   * @returns {Promise<Company|undefined>}
   */
  async findById(id) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ? AND deleted_at IS NULL`;
    return this.pool.get(sql, [id]);
  }

  /**
   * Find a company by its UUID (alias for findById since id is UUID)
   * @param {string} uuid - Company UUID
   * @returns {Promise<Company|undefined>}
   */
  async findByUUID(uuid) {
    return this.findById(uuid);
  }

  /**
   * Find a company by its slug
   * @param {string} slug - Company slug
   * @returns {Promise<Company|undefined>}
   */
  async findBySlug(slug) {
    const sql = `SELECT * FROM ${this.tableName} WHERE slug = ? AND deleted_at IS NULL`;
    return this.pool.get(sql, [slug]);
  }

  /**
   * Find companies by creator
   * @param {string} userId - Creator user ID
   * @param {Object} [options] - Query options
   * @returns {Promise<Company[]>}
   */
  async findByCreator(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE created_by = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    return this.pool.all(sql, [userId, limit, offset]);
  }

  /**
   * Find companies by status
   * @param {string} status - Company status
   * @param {Object} [options] - Query options
   * @returns {Promise<Company[]>}
   */
  async findByStatus(status, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE status = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `;
    return this.pool.all(sql, [status, limit, offset]);
  }

  /**
   * Search companies by name or description
   * @param {string} query - Search query
   * @param {Object} [options] - Search options
   * @returns {Promise<Company[]>}
   */
  async search(query, options = {}) {
    const { limit = 20 } = options;
    const searchPattern = `%${query}%`;

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE (name LIKE ? OR description LIKE ? OR slug LIKE ?)
      AND deleted_at IS NULL
      ORDER BY 
        CASE WHEN name LIKE ? THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT ?
    `;

    return this.pool.all(sql, [
      searchPattern, 
      searchPattern, 
      searchPattern,
      `%${query}%`,
      limit
    ]);
  }

  /**
   * Check if a slug is available
   * @param {string} slug - Slug to check
   * @param {string} [excludeId] - ID to exclude (for updates)
   * @returns {Promise<boolean>}
   */
  async isSlugAvailable(slug, excludeId = null) {
    let sql = `SELECT 1 as exists_flag FROM ${this.tableName} WHERE slug = ? AND deleted_at IS NULL`;
    const params = [slug];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    sql += ' LIMIT 1';
    const result = await this.pool.get(sql, params);
    return !result;
  }

  /**
   * Create a new company with TEXT id (UUID)
   * @param {Object} data - Company data
   * @returns {Promise<Company>}
   */
  async create(data) {
    // Generate UUID if not provided
    const id = data.id || crypto.randomUUID();
    const uuid = data.uuid || id;
    
    const columns = ['id', 'uuid', ...Object.keys(data).filter(k => k !== 'id' && k !== 'uuid')];
    const placeholders = columns.map(() => '?').join(', ');
    const values = [id, uuid, ...columns.slice(2).map(col => data[col])];

    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    await this.pool.run(sql, values);

    // Return created object directly to avoid race condition
    return { id, uuid, ...data };
  }

  /**
   * Soft delete a company
   * @param {string} id - Company ID
   * @param {string} [deletedBy] - User ID performing deletion
   * @returns {Promise<boolean>}
   */
  async softDelete(id, deletedBy = null) {
    const sql = `
      UPDATE ${this.tableName} 
      SET deleted_at = CURRENT_TIMESTAMP, 
          deleted_by = ?,
          status = 'deleted',
          updated_at = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = ?
    `;
    const result = await this.pool.run(sql, [deletedBy, id]);
    return result.changes > 0;
  }

  /**
   * Restore a soft-deleted company
   * @param {string} id - Company ID
   * @returns {Promise<boolean>}
   */
  async restore(id) {
    const sql = `
      UPDATE ${this.tableName} 
      SET deleted_at = NULL, 
          deleted_by = NULL,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = ?
    `;
    const result = await this.pool.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Update company status
   * @param {string} id - Company ID
   * @param {string} status - New status
   * @param {Object} [meta] - Additional metadata
   * @returns {Promise<Company|undefined>}
   */
  async updateStatus(id, status, meta = {}) {
    const updates = { 
      status, 
      updated_at: new Date().toISOString() 
    };

    if (status === 'suspended') {
      updates.pause_reason = meta.reason || 'Suspended';
      updates.paused_at = new Date().toISOString();
    } else if (status === 'active') {
      updates.pause_reason = null;
      updates.paused_at = null;
    }

    return this.update(id, updates);
  }

  /**
   * Get company statistics
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended,
        COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted
      FROM ${this.tableName}
    `;
    return this.pool.get(sql, []);
  }

  /**
   * Update spent budget
   * @param {string} id - Company ID
   * @param {number} amountCents - Amount to add (can be negative)
   * @returns {Promise<Company|undefined>}
   */
  async addToSpentBudget(id, amountCents) {
    const sql = `
      UPDATE ${this.tableName} 
      SET spent_monthly_cents = COALESCE(spent_monthly_cents, 0) + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = ?
      RETURNING *
    `;
    return this.pool.get(sql, [amountCents, id]);
  }

  /**
   * Reset monthly spend (for billing cycle)
   * @param {string} id - Company ID
   * @returns {Promise<Company|undefined>}
   */
  async resetMonthlySpend(id) {
    return this.update(id, { spent_monthly_cents: 0 });
  }
}

/**
 * @typedef {Object} CompanyMembership
 * @property {number} id - Database ID
 * @property {string} uuid - Unique identifier
 * @property {string} company_id - Company ID (TEXT UUID)
 * @property {string} user_id - User ID (TEXT UUID from auth_users)
 * @property {string} role - Member role
 * @property {string} status - Membership status
 * @property {string} invited_by - Inviter user ID
 * @property {string} invited_at - Invitation timestamp
 * @property {string} joined_at - Join timestamp
 * @property {string} permissions - JSON permissions
 * @property {string} created_at - ISO timestamp
 * @property {string} updated_at - ISO timestamp
 * @property {string} deleted_at - Soft delete timestamp
 */

/**
 * Company membership repository
 * @extends BaseRepository
 */
export class CompanyMembershipRepository extends BaseRepository {
  /** @type {string[]} */
  static COLUMNS = [
    'uuid',
    'company_id',
    'user_id',
    'role',
    'status',
    'invited_by',
    'invited_at',
    'joined_at',
    'permissions',
    'deleted_at'
  ];

  /**
   * Create a membership repository
   * @param {import('../connection/index.js').ConnectionPool} pool - Connection pool
   */
  constructor(pool) {
    super(pool, 'company_memberships', 'id', CompanyMembershipRepository.COLUMNS);
  }

  /**
   * Find membership by company and user
   * @param {string} companyId - Company ID
   * @param {string} userId - User ID
   * @returns {Promise<CompanyMembership|undefined>}
   */
  async findByCompanyAndUser(companyId, userId) {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE company_id = ? AND user_id = ? AND deleted_at IS NULL
      LIMIT 1
    `;
    return this.pool.get(sql, [companyId, userId]);
  }

  /**
   * Find all memberships for a company
   * @param {string} companyId - Company ID
   * @param {Object} [options] - Query options
   * @returns {Promise<CompanyMembership[]>}
   */
  async findByCompany(companyId, options = {}) {
    const { status, limit = 100, offset = 0 } = options;
    
    let sql = `
      SELECT * FROM ${this.tableName}
      WHERE company_id = ? AND deleted_at IS NULL
    `;
    const params = [companyId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.pool.all(sql, params);
  }

  /**
   * Find all memberships for a user
   * @param {string} userId - User ID
   * @param {Object} [options] - Query options
   * @returns {Promise<CompanyMembership[]>}
   */
  async findByUser(userId, options = {}) {
    const { status, limit = 100, offset = 0 } = options;
    
    let sql = `
      SELECT * FROM ${this.tableName}
      WHERE user_id = ? AND deleted_at IS NULL
    `;
    const params = [userId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.pool.all(sql, params);
  }

  /**
   * Find active memberships with company details
   * @param {string} userId - User ID
   * @returns {Promise<Array<CompanyMembership & {company_name: string, company_slug: string}>>}
   */
  async findActiveWithCompanyDetails(userId) {
    const sql = `
      SELECT 
        m.*,
        c.name as company_name,
        c.slug as company_slug,
        c.status as company_status
      FROM ${this.tableName} m
      JOIN companies c ON m.company_id = c.id
      WHERE m.user_id = ? 
      AND m.status = 'active'
      AND m.deleted_at IS NULL
      AND c.deleted_at IS NULL
      ORDER BY m.created_at DESC
    `;
    return this.pool.all(sql, [userId]);
  }

  /**
   * Create a new membership
   * @param {Object} data - Membership data
   * @returns {Promise<CompanyMembership>}
   */
  async create(data) {
    const uuid = data.uuid || crypto.randomUUID();
    
    const columns = ['uuid', ...Object.keys(data).filter(k => k !== 'uuid')];
    const placeholders = columns.map(() => '?').join(', ');
    const values = [uuid, ...columns.slice(1).map(col => data[col])];

    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await this.pool.run(sql, values);

    // Return created object directly to avoid race condition
    return { id: result.lastID, uuid, ...data };
  }

  /**
   * Update membership role
   * @param {number} id - Membership ID
   * @param {string} role - New role
   * @returns {Promise<CompanyMembership|undefined>}
   */
  async updateRole(id, role) {
    return this.update(id, { 
      role, 
      updated_at: new Date().toISOString() 
    });
  }

  /**
   * Update membership status
   * @param {number} id - Membership ID
   * @param {string} status - New status
   * @param {Object} [meta] - Additional metadata
   * @returns {Promise<CompanyMembership|undefined>}
   */
  async updateStatus(id, status, meta = {}) {
    const updates = { 
      status, 
      updated_at: new Date().toISOString() 
    };

    if (status === 'active' && meta.joinedAt) {
      updates.joined_at = meta.joinedAt;
    }

    return this.update(id, updates);
  }

  /**
   * Soft delete a membership (remove member)
   * @param {number} id - Membership ID
   * @returns {Promise<boolean>}
   */
  async softDelete(id) {
    const sql = `
      UPDATE ${this.tableName} 
      SET deleted_at = CURRENT_TIMESTAMP, 
          status = 'inactive',
          updated_at = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = ?
    `;
    const result = await this.pool.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Remove member from company
   * @param {string} companyId - Company ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async removeMember(companyId, userId) {
    const sql = `
      UPDATE ${this.tableName} 
      SET deleted_at = CURRENT_TIMESTAMP, 
          status = 'inactive',
          updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ? AND user_id = ? AND deleted_at IS NULL
    `;
    const result = await this.pool.run(sql, [companyId, userId]);
    return result.changes > 0;
  }

  /**
   * Check if user is a member of company
   * @param {string} companyId - Company ID
   * @param {string} userId - User ID
   * @param {string} [minRole] - Minimum required role (owner > admin > member > viewer)
   * @returns {Promise<boolean>}
   */
  async isMember(companyId, userId, minRole = null) {
    let sql = `
      SELECT role FROM ${this.tableName} 
      WHERE company_id = ? AND user_id = ? AND status = 'active' AND deleted_at IS NULL
      LIMIT 1
    `;
    const result = await this.pool.get(sql, [companyId, userId]);
    
    if (!result) return false;
    if (!minRole) return true;

    const roleHierarchy = { owner: 4, admin: 3, member: 2, viewer: 1 };
    return roleHierarchy[result.role] >= roleHierarchy[minRole];
  }

  /**
   * Count members by role
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>}
   */
  async countByRole(companyId) {
    const sql = `
      SELECT 
        role,
        COUNT(*) as count
      FROM ${this.tableName}
      WHERE company_id = ? AND deleted_at IS NULL
      GROUP BY role
    `;
    const results = await this.pool.all(sql, [companyId]);
    
    const counts = { owner: 0, admin: 0, member: 0, viewer: 0, total: 0 };
    for (const row of results) {
      counts[row.role] = row.count;
      counts.total += row.count;
    }
    return counts;
  }

  /**
   * Get membership statistics
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended
      FROM ${this.tableName}
      WHERE deleted_at IS NULL
    `;
    return this.pool.get(sql, []);
  }
}

export default { CompanyRepository, CompanyMembershipRepository };
