/**
 * @fileoverview Document Repository - Data access layer for documents and revisions
 * @module domains/documents/document-repository
 */

import { BaseRepository } from '../../db/repositories/base-repository.js';

/**
 * @typedef {Object} Document
 * @property {string} id - Document UUID
 * @property {string} company_id - Company UUID
 * @property {string} title - Document title
 * @property {string} content - Current document content
 * @property {string} format - Content format (markdown, text, html, json, yaml)
 * @property {string} status - Document status (active, archived, deleted)
 * @property {string} visibility - Visibility level (private, shared, public)
 * @property {number} current_version - Latest version number
 * @property {string} latest_revision_id - ID of latest revision
 * @property {number} word_count - Word count
 * @property {number} char_count - Character count
 * @property {string} tags - JSON array of tags
 * @property {string} metadata - JSON metadata
 * @property {string} created_by - Creator user ID
 * @property {string} updated_by - Last updater user ID
 * @property {string} deleted_by - Deleter user ID
 * @property {string} deleted_at - Soft delete timestamp
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 */

/**
 * @typedef {Object} DocumentRevision
 * @property {string} id - Revision UUID
 * @property {string} document_id - Parent document UUID
 * @property {number} version_number - Sequential version number
 * @property {string} content - Revision content
 * @property {string} title - Document title at this revision
 * @property {string} change_summary - Summary of changes
 * @property {number} word_count - Word count
 * @property {number} char_count - Character count
 * @property {string} author - Author user ID
 * @property {string} author_type - Author type (user, agent, system)
 * @property {string} created_at - Creation timestamp
 */

/**
 * @typedef {Object} DocumentShare
 * @property {string} id - Share UUID
 * @property {string} document_id - Document UUID
 * @property {string} source_company_id - Sharing company ID
 * @property {string} target_company_id - Receiving company ID
 * @property {string} permission - Access level (read, write, admin)
 * @property {string} shared_by - User who shared
 * @property {string} share_token - Unique share token
 * @property {string} expires_at - Expiration timestamp
 * @property {string} revoked_at - Revocation timestamp
 * @property {string} revoked_by - User who revoked
 * @property {string} created_at - Creation timestamp
 */

/**
 * Document repository with versioning support
 * @extends BaseRepository
 */
export class DocumentRepository extends BaseRepository {
  /** @type {string[]} */
  static COLUMNS = [
    'company_id',
    'title',
    'content',
    'format',
    'status',
    'visibility',
    'current_version',
    'latest_revision_id',
    'word_count',
    'char_count',
    'tags',
    'metadata',
    'created_by',
    'updated_by',
    'deleted_by',
    'deleted_at'
  ];

  /**
   * Create a document repository
   * @param {import('../../db/connection/index.js').ConnectionPool} pool - Connection pool
   */
  constructor(pool) {
    super(pool, 'documents', 'id', DocumentRepository.COLUMNS);
  }

  /**
   * Find a document by its ID
   * @param {string} id - Document UUID
   * @returns {Promise<Document|undefined>}
   */
  async findById(id) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ? AND deleted_at IS NULL`;
    return this.pool.get(sql, [id]);
  }

  /**
   * Find documents by company
   * @param {string} companyId - Company UUID
   * @param {Object} [options] - Query options
   * @returns {Promise<Document[]>}
   */
  async findByCompany(companyId, options = {}) {
    const { 
      status = 'active', 
      visibility = null,
      limit = 50, 
      offset = 0,
      orderBy = 'updated_at',
      orderDirection = 'DESC'
    } = options;

    let where = { company_id: companyId };
    if (status) {
      where.status = status;
    }
    if (visibility) {
      where.visibility = visibility;
    }

    return this.findAll({
      where,
      orderBy,
      orderDirection,
      limit,
      offset
    });
  }

  /**
   * Search documents by title or content using FTS
   * @param {string} query - Search query
   * @param {Object} [options] - Search options
   * @returns {Promise<Document[]>}
   */
  async search(query, options = {}) {
    const { companyId = null, limit = 20 } = options;
    
    let sql = `
      SELECT d.* FROM ${this.tableName} d
      JOIN documents_fts fts ON d.rowid = fts.rowid
      WHERE documents_fts MATCH ?
      AND d.deleted_at IS NULL
    `;
    const params = [query];

    if (companyId) {
      sql += ' AND d.company_id = ?';
      params.push(companyId);
    }

    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    return this.pool.all(sql, params);
  }

  /**
   * Soft delete a document
   * @param {string} id - Document ID
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
   * Restore a soft-deleted document
   * @param {string} id - Document ID
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
   * Update document version info after creating a revision
   * @param {string} id - Document ID
   * @param {number} versionNumber - New version number
   * @param {string} revisionId - New revision ID
   * @param {Object} contentStats - Content statistics
   * @returns {Promise<Document|undefined>}
   */
  async updateVersion(id, versionNumber, revisionId, contentStats = {}) {
    const sql = `
      UPDATE ${this.tableName} 
      SET current_version = ?,
          latest_revision_id = ?,
          word_count = ?,
          char_count = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = ?
      RETURNING *
    `;
    return this.pool.get(sql, [
      versionNumber,
      revisionId,
      contentStats.wordCount || 0,
      contentStats.charCount || 0,
      id
    ]);
  }

  /**
   * Get documents shared with a company
   * @param {string} companyId - Company UUID
   * @param {Object} [options] - Query options
   * @returns {Promise<Array<Document & {share_id: string, permission: string}>>}
   */
  async findSharedWithCompany(companyId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const sql = `
      SELECT d.*, ds.id as share_id, ds.permission
      FROM ${this.tableName} d
      JOIN document_shares ds ON d.id = ds.document_id
      WHERE ds.target_company_id = ?
      AND ds.revoked_at IS NULL
      AND (ds.expires_at IS NULL OR ds.expires_at > CURRENT_TIMESTAMP)
      AND d.deleted_at IS NULL
      AND d.status = 'active'
      ORDER BY d.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    return this.pool.all(sql, [companyId, limit, offset]);
  }

  /**
   * Get document statistics for a company
   * @param {string} companyId - Company UUID
   * @returns {Promise<Object>}
   */
  async getStatistics(companyId) {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived,
        COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted,
        SUM(word_count) as total_words,
        SUM(char_count) as total_chars
      FROM ${this.tableName}
      WHERE company_id = ?
    `;
    return this.pool.get(sql, [companyId]);
  }
}

/**
 * Document revision repository
 * @extends BaseRepository
 */
export class DocumentRevisionRepository extends BaseRepository {
  /** @type {string[]} */
  static COLUMNS = [
    'document_id',
    'version_number',
    'content',
    'title',
    'change_summary',
    'word_count',
    'char_count',
    'author',
    'author_type',
    'created_at'
  ];

  /**
   * Create a revision repository
   * @param {import('../../db/connection/index.js').ConnectionPool} pool - Connection pool
   */
  constructor(pool) {
    super(pool, 'document_revisions', 'id', DocumentRevisionRepository.COLUMNS);
  }

  /**
   * Find all revisions for a document
   * @param {string} documentId - Document UUID
   * @param {Object} [options] - Query options
   * @returns {Promise<DocumentRevision[]>}
   */
  async findByDocument(documentId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE document_id = ?
      ORDER BY version_number DESC
      LIMIT ? OFFSET ?
    `;
    return this.pool.all(sql, [documentId, limit, offset]);
  }

  /**
   * Find a specific revision by document and version number
   * @param {string} documentId - Document UUID
   * @param {number} versionNumber - Version number
   * @returns {Promise<DocumentRevision|undefined>}
   */
  async findByVersion(documentId, versionNumber) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE document_id = ? AND version_number = ?
      LIMIT 1
    `;
    return this.pool.get(sql, [documentId, versionNumber]);
  }

  /**
   * Get the next version number for a document
   * @param {string} documentId - Document UUID
   * @returns {Promise<number>}
   */
  async getNextVersionNumber(documentId) {
    const sql = `
      SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
      FROM ${this.tableName}
      WHERE document_id = ?
    `;
    const result = await this.pool.get(sql, [documentId]);
    return result?.next_version || 1;
  }

  /**
   * Get revision count for a document
   * @param {string} documentId - Document UUID
   * @returns {Promise<number>}
   */
  async countByDocument(documentId) {
    const sql = `
      SELECT COUNT(*) as count FROM ${this.tableName}
      WHERE document_id = ?
    `;
    const result = await this.pool.get(sql, [documentId]);
    return result?.count || 0;
  }

  /**
   * Find revisions by author
   * @param {string} authorId - Author user ID
   * @param {Object} [options] - Query options
   * @returns {Promise<DocumentRevision[]>}
   */
  async findByAuthor(authorId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const sql = `
      SELECT dr.*, d.title as document_title, d.company_id
      FROM ${this.tableName} dr
      JOIN documents d ON dr.document_id = d.id
      WHERE dr.author = ?
      ORDER BY dr.created_at DESC
      LIMIT ? OFFSET ?
    `;
    return this.pool.all(sql, [authorId, limit, offset]);
  }

  /**
   * Get revision statistics for a document
   * @param {string} documentId - Document UUID
   * @returns {Promise<Object>}
   */
  async getStatistics(documentId) {
    const sql = `
      SELECT 
        COUNT(*) as total_revisions,
        MIN(created_at) as first_revision_at,
        MAX(created_at) as last_revision_at,
        COUNT(DISTINCT author) as unique_authors
      FROM ${this.tableName}
      WHERE document_id = ?
    `;
    return this.pool.get(sql, [documentId]);
  }

  /**
   * Compare two revisions
   * @param {string} revisionId1 - First revision ID
   * @param {string} revisionId2 - Second revision ID
   * @returns {Promise<{revision1: DocumentRevision, revision2: DocumentRevision}|undefined>}
   */
  async compare(revisionId1, revisionId2) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE id IN (?, ?)
      ORDER BY version_number ASC
    `;
    const results = await this.pool.all(sql, [revisionId1, revisionId2]);
    if (results.length !== 2) return undefined;
    
    return {
      revision1: results[0],
      revision2: results[1]
    };
  }
}

/**
 * Document share repository
 * @extends BaseRepository
 */
export class DocumentShareRepository extends BaseRepository {
  /** @type {string[]} */
  static COLUMNS = [
    'document_id',
    'source_company_id',
    'target_company_id',
    'permission',
    'shared_by',
    'share_token',
    'expires_at',
    'revoked_at',
    'revoked_by'
  ];

  /**
   * Create a share repository
   * @param {import('../../db/connection/index.js').ConnectionPool} pool - Connection pool
   */
  constructor(pool) {
    super(pool, 'document_shares', 'id', DocumentShareRepository.COLUMNS);
  }

  /**
   * Find shares for a document
   * @param {string} documentId - Document UUID
   * @returns {Promise<DocumentShare[]>}
   */
  async findByDocument(documentId) {
    const sql = `
      SELECT ds.*, 
        sc.name as source_company_name,
        tc.name as target_company_name,
        u.name as shared_by_name
      FROM ${this.tableName} ds
      JOIN companies sc ON ds.source_company_id = sc.id
      JOIN companies tc ON ds.target_company_id = tc.id
      LEFT JOIN auth_users u ON ds.shared_by = u.id
      WHERE ds.document_id = ?
      ORDER BY ds.created_at DESC
    `;
    return this.pool.all(sql, [documentId]);
  }

  /**
   * Find active shares for a document
   * @param {string} documentId - Document UUID
   * @returns {Promise<DocumentShare[]>}
   */
  async findActiveByDocument(documentId) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE document_id = ?
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;
    return this.pool.all(sql, [documentId]);
  }

  /**
   * Find share by token
   * @param {string} token - Share token
   * @returns {Promise<DocumentShare|undefined>}
   */
  async findByToken(token) {
    const sql = `
      SELECT ds.*, d.title as document_title, d.company_id as document_company_id
      FROM ${this.tableName} ds
      JOIN documents d ON ds.document_id = d.id
      WHERE ds.share_token = ?
      AND ds.revoked_at IS NULL
      AND (ds.expires_at IS NULL OR ds.expires_at > CURRENT_TIMESTAMP)
      AND d.deleted_at IS NULL
      LIMIT 1
    `;
    return this.pool.get(sql, [token]);
  }

  /**
   * Find share between specific companies
   * @param {string} documentId - Document UUID
   * @param {string} targetCompanyId - Target company UUID
   * @returns {Promise<DocumentShare|undefined>}
   */
  async findByDocumentAndCompany(documentId, targetCompanyId) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE document_id = ? AND target_company_id = ?
      AND revoked_at IS NULL
      LIMIT 1
    `;
    return this.pool.get(sql, [documentId, targetCompanyId]);
  }

  /**
   * Revoke a share
   * @param {string} id - Share ID
   * @param {string} revokedBy - User ID revoking
   * @returns {Promise<boolean>}
   */
  async revoke(id, revokedBy) {
    const sql = `
      UPDATE ${this.tableName}
      SET revoked_at = CURRENT_TIMESTAMP,
          revoked_by = ?
      WHERE id = ?
    `;
    const result = await this.pool.run(sql, [revokedBy, id]);
    return result.changes > 0;
  }

  /**
   * Check if company has access to a document
   * @param {string} documentId - Document UUID
   * @param {string} companyId - Company UUID
   * @returns {Promise<{hasAccess: boolean, permission: string|null}>}
   */
  async checkAccess(documentId, companyId) {
    const sql = `
      SELECT permission FROM ${this.tableName}
      WHERE document_id = ? AND target_company_id = ?
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      LIMIT 1
    `;
    const result = await this.pool.get(sql, [documentId, companyId]);
    return {
      hasAccess: !!result,
      permission: result?.permission || null
    };
  }
}

export default { 
  DocumentRepository, 
  DocumentRevisionRepository, 
  DocumentShareRepository 
};
