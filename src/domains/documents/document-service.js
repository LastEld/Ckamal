/**
 * @fileoverview Document Service - Business logic for document management with versioning
 * @module domains/documents/document-service
 */

/**
 * @typedef {Object} Document
 * @property {string} id - Document UUID
 * @property {string} companyId - Company UUID
 * @property {string} title - Document title
 * @property {string} content - Current content
 * @property {string} format - Content format
 * @property {string} status - Document status
 * @property {string} visibility - Visibility level
 * @property {number} currentVersion - Latest version number
 * @property {string} latestRevisionId - ID of latest revision
 * @property {number} wordCount - Word count
 * @property {number} charCount - Character count
 * @property {string[]} tags - Tags
 * @property {Object} metadata - Additional metadata
 * @property {string} createdBy - Creator ID
 * @property {string} updatedBy - Last updater ID
 * @property {string} deletedAt - Soft delete timestamp
 * @property {string} createdAt - Creation timestamp
 * @property {string} updatedAt - Last update timestamp
 */

/**
 * @typedef {Object} DocumentRevision
 * @property {string} id - Revision UUID
 * @property {string} documentId - Parent document UUID
 * @property {number} versionNumber - Sequential version
 * @property {string} content - Revision content
 * @property {string} title - Document title at revision
 * @property {string} changeSummary - Summary of changes
 * @property {number} wordCount - Word count
 * @property {number} charCount - Character count
 * @property {string} author - Author ID
 * @property {string} authorType - Author type (user, agent, system)
 * @property {string} createdAt - Creation timestamp
 */

/**
 * @typedef {Object} CreateDocumentData
 * @property {string} title - Document title
 * @property {string} [content=''] - Initial content
 * @property {string} [format='markdown'] - Content format
 * @property {string} [visibility='private'] - Visibility level
 * @property {string[]} [tags=[]] - Tags
 * @property {Object} [metadata={}] - Metadata
 */

/**
 * @typedef {Object} UpdateDocumentData
 * @property {string} [title] - New title
 * @property {string} [content] - New content
 * @property {string} [changeSummary] - Summary of changes
 * @property {string} [visibility] - New visibility
 * @property {string[]} [tags] - New tags
 * @property {Object} [metadata] - Metadata updates
 */

/**
 * @typedef {Object} ShareDocumentData
 * @property {string} targetCompanyId - Company to share with
 * @property {string} [permission='read'] - Access level
 * @property {string} [expiresAt] - Expiration timestamp
 */

import crypto from 'crypto';

// Valid formats and visibilities
const VALID_FORMATS = ['markdown', 'text', 'html', 'json', 'yaml'];
const VALID_VISIBILITIES = ['private', 'shared', 'public'];
const VALID_STATUSES = ['active', 'archived', 'deleted'];

/**
 * Generate a UUID
 * @returns {string}
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Get current ISO timestamp
 * @returns {string}
 */
function now() {
  return new Date().toISOString();
}

/**
 * Generate a share token
 * @returns {string}
 */
function generateShareToken() {
  return `share_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Calculate content statistics
 * @param {string} content
 * @returns {{wordCount: number, charCount: number}}
 */
function calculateStats(content) {
  if (!content) return { wordCount: 0, charCount: 0 };
  const charCount = content.length;
  const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;
  return { wordCount, charCount };
}

/**
 * Simple diff for comparing revisions
 * @param {string} oldContent
 * @param {string} newContent
 * @returns {Object}
 */
function diffContent(oldContent, newContent) {
  const oldLines = (oldContent || '').split('\n');
  const newLines = (newContent || '').split('\n');
  
  const added = [];
  const removed = [];
  
  // Simple line-based diff
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  
  for (const line of newLines) {
    if (!oldSet.has(line) && line.trim()) {
      added.push(line);
    }
  }
  
  for (const line of oldLines) {
    if (!newSet.has(line) && line.trim()) {
      removed.push(line);
    }
  }
  
  const charDiff = newContent.length - oldContent.length;
  const wordDiff = calculateStats(newContent).wordCount - calculateStats(oldContent).wordCount;
  
  return {
    added,
    removed,
    charDiff,
    wordDiff,
    oldLength: oldContent.length,
    newLength: newContent.length
  };
}

/**
 * Document Service - Business logic for document management
 */
export class DocumentService {
  /** @type {Object|null} */
  #documentRepo = null;
  
  /** @type {Object|null} */
  #revisionRepo = null;
  
  /** @type {Object|null} */
  #shareRepo = null;
  
  /** @type {Map<string, Document>} */
  #cache = new Map();
  
  /** @type {number} */
  #retentionDays = 30;

  /**
   * @param {Object} options
   * @param {Object} [options.repositories] - Repository factory
   * @param {number} [options.retentionDays=30] - Soft delete retention period
   */
  constructor(options = {}) {
    this.#documentRepo = options.repositories?.documents ?? null;
    this.#revisionRepo = options.repositories?.documentRevisions ?? null;
    this.#shareRepo = options.repositories?.documentShares ?? null;
    this.#retentionDays = options.retentionDays ?? 30;
  }

  /**
   * Hydrate document from database row
   * @private
   */
  #hydrateDocument(row) {
    if (!row) return undefined;
    return {
      id: row.id,
      companyId: row.company_id,
      title: row.title,
      content: row.content,
      format: row.format || 'markdown',
      status: row.status || 'active',
      visibility: row.visibility || 'private',
      currentVersion: row.current_version || 1,
      latestRevisionId: row.latest_revision_id,
      wordCount: row.word_count || 0,
      charCount: row.char_count || 0,
      tags: row.tags ? JSON.parse(row.tags) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Hydrate revision from database row
   * @private
   */
  #hydrateRevision(row) {
    if (!row) return undefined;
    return {
      id: row.id,
      documentId: row.document_id,
      versionNumber: row.version_number,
      content: row.content,
      title: row.title,
      changeSummary: row.change_summary,
      wordCount: row.word_count || 0,
      charCount: row.char_count || 0,
      author: row.author,
      authorType: row.author_type || 'user',
      createdAt: row.created_at
    };
  }

  /**
   * Convert document to database row
   * @private
   */
  #toDocumentRow(doc) {
    return {
      id: doc.id,
      company_id: doc.companyId,
      title: doc.title,
      content: doc.content,
      format: doc.format,
      status: doc.status,
      visibility: doc.visibility,
      current_version: doc.currentVersion,
      latest_revision_id: doc.latestRevisionId,
      word_count: doc.wordCount,
      char_count: doc.charCount,
      tags: JSON.stringify(doc.tags || []),
      metadata: JSON.stringify(doc.metadata || {}),
      created_by: doc.createdBy,
      updated_by: doc.updatedBy
    };
  }

  /**
   * Convert revision to database row
   * @private
   */
  #toRevisionRow(revision) {
    return {
      id: revision.id,
      document_id: revision.documentId,
      version_number: revision.versionNumber,
      content: revision.content,
      title: revision.title,
      change_summary: revision.changeSummary,
      word_count: revision.wordCount,
      char_count: revision.charCount,
      author: revision.author,
      author_type: revision.authorType
    };
  }

  // ==================== Document CRUD ====================

  /**
   * Create a new document
   * @param {CreateDocumentData} data - Document data
   * @param {string} companyId - Company ID
   * @param {string} creatorId - Creator user ID
   * @returns {Promise<Document>} Created document
   */
  async createDocument(data, companyId, creatorId) {
    // Validation
    if (!data.title || typeof data.title !== 'string') {
      throw new Error('Document title is required');
    }
    
    const title = data.title.trim();
    if (title.length < 1 || title.length > 500) {
      throw new Error('Title must be between 1 and 500 characters');
    }

    const format = VALID_FORMATS.includes(data.format) ? data.format : 'markdown';
    const visibility = VALID_VISIBILITIES.includes(data.visibility) ? data.visibility : 'private';
    const content = data.content || '';
    const stats = calculateStats(content);

    const doc = {
      id: generateUUID(),
      companyId,
      title,
      content,
      format,
      status: 'active',
      visibility,
      currentVersion: 1,
      latestRevisionId: null,
      wordCount: stats.wordCount,
      charCount: stats.charCount,
      tags: data.tags || [],
      metadata: data.metadata || {},
      createdBy: creatorId,
      updatedBy: creatorId,
      deletedAt: null,
      createdAt: now(),
      updatedAt: now()
    };

    // Persist document
    if (this.#documentRepo) {
      await this.#documentRepo.create(this.#toDocumentRow(doc));
      
      // Create initial revision
      const revision = await this.#createRevisionInternal({
        documentId: doc.id,
        versionNumber: 1,
        content: doc.content,
        title: doc.title,
        changeSummary: 'Initial version',
        author: creatorId,
        authorType: 'user'
      });
      
      doc.latestRevisionId = revision.id;
      await this.#documentRepo.update(doc.id, { latest_revision_id: revision.id });
    }

    this.#cache.set(doc.id, doc);
    return doc;
  }

  /**
   * Get a document by ID
   * @param {string} id - Document ID
   * @param {Object} [options] - Options
   * @param {boolean} [options.includeDeleted=false] - Include soft-deleted
   * @returns {Promise<Document|undefined>}
   */
  async getDocument(id, options = {}) {
    if (!id) return undefined;

    // Check cache
    const cached = this.#cache.get(id);
    if (cached && (!cached.deletedAt || options.includeDeleted)) {
      return cached;
    }

    // Fetch from repository
    if (this.#documentRepo) {
      const row = options.includeDeleted 
        ? await this.#documentRepo.findById(id)
        : await this.#documentRepo.findById(id);
      
      if (!row) return undefined;
      
      const doc = this.#hydrateDocument(row);
      if (!doc.deletedAt || options.includeDeleted) {
        this.#cache.set(id, doc);
        return doc;
      }
    }

    return undefined;
  }

  /**
   * Update a document (creates new revision)
   * @param {string} id - Document ID
   * @param {UpdateDocumentData} data - Update data
   * @param {string} updaterId - Updater user ID
   * @returns {Promise<Document>} Updated document
   */
  async updateDocument(id, data, updaterId) {
    const doc = await this.getDocument(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }

    if (doc.status === 'deleted') {
      throw new Error('Cannot update deleted document');
    }

    // Build update
    const updates = {};
    const oldContent = doc.content;
    const oldTitle = doc.title;

    if (data.title !== undefined) {
      const title = data.title.trim();
      if (title.length < 1 || title.length > 500) {
        throw new Error('Title must be between 1 and 500 characters');
      }
      doc.title = title;
      updates.title = title;
    }

    if (data.content !== undefined) {
      doc.content = data.content;
      updates.content = data.content;
      const stats = calculateStats(data.content);
      doc.wordCount = stats.wordCount;
      doc.charCount = stats.charCount;
      updates.word_count = stats.wordCount;
      updates.char_count = stats.charCount;
    }

    if (data.visibility && VALID_VISIBILITIES.includes(data.visibility)) {
      doc.visibility = data.visibility;
      updates.visibility = data.visibility;
    }

    if (data.tags !== undefined) {
      doc.tags = Array.isArray(data.tags) ? data.tags : [];
      updates.tags = JSON.stringify(doc.tags);
    }

    if (data.metadata !== undefined) {
      doc.metadata = { ...doc.metadata, ...data.metadata };
      updates.metadata = JSON.stringify(doc.metadata);
    }

    doc.updatedBy = updaterId;
    updates.updated_by = updaterId;
    doc.updatedAt = now();
    updates.updated_at = now();

    // Create new revision if content changed
    if (data.content !== undefined || data.title !== undefined) {
      const nextVersion = doc.currentVersion + 1;
      
      // Generate change summary if not provided
      let changeSummary = data.changeSummary;
      if (!changeSummary) {
        const changes = [];
        if (data.title !== undefined && data.title !== oldTitle) {
          changes.push('title updated');
        }
        if (data.content !== undefined && data.content !== oldContent) {
          const diff = diffContent(oldContent, data.content);
          if (diff.wordDiff > 0) {
            changes.push(`+${diff.wordDiff} words`);
          } else if (diff.wordDiff < 0) {
            changes.push(`${diff.wordDiff} words`);
          } else {
            changes.push('content updated');
          }
        }
        changeSummary = changes.join(', ') || 'minor update';
      }

      if (this.#revisionRepo) {
        const revision = await this.#createRevisionInternal({
          documentId: doc.id,
          versionNumber: nextVersion,
          content: doc.content,
          title: doc.title,
          changeSummary,
          author: updaterId,
          authorType: 'user'
        });

        doc.currentVersion = nextVersion;
        doc.latestRevisionId = revision.id;
        updates.current_version = nextVersion;
        updates.latest_revision_id = revision.id;
      }
    }

    // Persist updates
    if (this.#documentRepo && Object.keys(updates).length > 0) {
      await this.#documentRepo.update(doc.id, updates);
    }

    this.#cache.set(doc.id, doc);
    return doc;
  }

  /**
   * List documents for a company
   * @param {string} companyId - Company ID
   * @param {Object} [options] - Query options
   * @returns {Promise<Document[]>}
   */
  async listDocuments(companyId, options = {}) {
    if (!this.#documentRepo) return [];

    const rows = await this.#documentRepo.findByCompany(companyId, options);
    return rows.map(row => this.#hydrateDocument(row));
  }

  /**
   * Search documents
   * @param {string} query - Search query
   * @param {Object} [options] - Search options
   * @returns {Promise<Document[]>}
   */
  async searchDocuments(query, options = {}) {
    if (!this.#documentRepo || !query?.trim()) return [];

    const rows = await this.#documentRepo.search(query.trim(), options);
    return rows.map(row => this.#hydrateDocument(row));
  }

  /**
   * Soft delete a document
   * @param {string} id - Document ID
   * @param {string} deleterId - User ID performing deletion
   * @returns {Promise<boolean>}
   */
  async deleteDocument(id, deleterId) {
    const doc = await this.getDocument(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }

    if (this.#documentRepo) {
      await this.#documentRepo.softDelete(id, deleterId);
    }

    doc.status = 'deleted';
    doc.deletedAt = now();
    this.#cache.set(id, doc);
    return true;
  }

  /**
   * Permanently delete a document (after retention period)
   * @param {string} id - Document ID
   * @returns {Promise<boolean>}
   */
  async permanentlyDelete(id) {
    const doc = await this.getDocument(id, { includeDeleted: true });
    if (!doc || !doc.deletedAt) {
      throw new Error('Document must be soft-deleted first');
    }

    // Check retention period
    const deletedAt = new Date(doc.deletedAt);
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - this.#retentionDays);

    if (deletedAt > retentionDate) {
      const daysRemaining = Math.ceil((deletedAt - retentionDate) / (1000 * 60 * 60 * 24));
      throw new Error(`Document is within retention period. ${daysRemaining} days remaining.`);
    }

    if (this.#documentRepo) {
      // Delete revisions first
      const revisions = await this.#revisionRepo.findByDocument(id);
      for (const rev of revisions) {
        await this.#revisionRepo.delete(rev.id);
      }
      
      // Delete shares
      const shares = await this.#shareRepo.findByDocument(id);
      for (const share of shares) {
        await this.#shareRepo.delete(share.id);
      }
      
      // Delete document
      await this.#documentRepo.delete(id);
    }

    this.#cache.delete(id);
    return true;
  }

  /**
   * Restore a soft-deleted document
   * @param {string} id - Document ID
   * @returns {Promise<Document>}
   */
  async restoreDocument(id) {
    const doc = await this.getDocument(id, { includeDeleted: true });
    if (!doc || !doc.deletedAt) {
      throw new Error(`Deleted document not found: ${id}`);
    }

    if (this.#documentRepo) {
      await this.#documentRepo.restore(id);
    }

    doc.status = 'active';
    doc.deletedAt = null;
    this.#cache.set(id, doc);
    return doc;
  }

  // ==================== Revision Management ====================

  /**
   * Create a revision (internal)
   * @private
   */
  async #createRevisionInternal(data) {
    const stats = calculateStats(data.content);
    
    const revision = {
      id: generateUUID(),
      documentId: data.documentId,
      versionNumber: data.versionNumber,
      content: data.content,
      title: data.title,
      changeSummary: data.changeSummary,
      wordCount: stats.wordCount,
      charCount: stats.charCount,
      author: data.author,
      authorType: data.authorType || 'user',
      createdAt: now()
    };

    if (this.#revisionRepo) {
      const row = this.#toRevisionRow(revision);
      await this.#revisionRepo.create(row);
    }

    return revision;
  }

  /**
   * Get a specific revision
   * @param {string} revisionId - Revision ID
   * @returns {Promise<DocumentRevision|undefined>}
   */
  async getRevision(revisionId) {
    if (!this.#revisionRepo) return undefined;
    
    const row = await this.#revisionRepo.findById(revisionId);
    return this.#hydrateRevision(row);
  }

  /**
   * Get revision by version number
   * @param {string} documentId - Document ID
   * @param {number} versionNumber - Version number
   * @returns {Promise<DocumentRevision|undefined>}
   */
  async getRevisionByVersion(documentId, versionNumber) {
    if (!this.#revisionRepo) return undefined;
    
    const row = await this.#revisionRepo.findByVersion(documentId, versionNumber);
    return this.#hydrateRevision(row);
  }

  /**
   * List all revisions for a document
   * @param {string} documentId - Document ID
   * @param {Object} [options] - Query options
   * @returns {Promise<DocumentRevision[]>}
   */
  async listRevisions(documentId, options = {}) {
    if (!this.#revisionRepo) return [];
    
    const rows = await this.#revisionRepo.findByDocument(documentId, options);
    return rows.map(row => this.#hydrateRevision(row));
  }

  /**
   * Restore a document to a specific revision
   * @param {string} documentId - Document ID
   * @param {number} versionNumber - Version to restore
   * @param {string} restorerId - User ID performing restore
   * @returns {Promise<Document>}
   */
  async restoreRevision(documentId, versionNumber, restorerId) {
    const doc = await this.getDocument(documentId);
    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const revision = await this.getRevisionByVersion(documentId, versionNumber);
    if (!revision) {
      throw new Error(`Revision ${versionNumber} not found`);
    }

    // Update document with revision content
    return this.updateDocument(documentId, {
      title: revision.title,
      content: revision.content,
      changeSummary: `Restored to version ${versionNumber}`
    }, restorerId);
  }

  /**
   * Compare two revisions
   * @param {string} revisionId1 - First revision ID
   * @param {string} revisionId2 - Second revision ID
   * @returns {Promise<Object>} Comparison result
   */
  async compareRevisions(revisionId1, revisionId2) {
    if (!this.#revisionRepo) {
      throw new Error('Revision repository not available');
    }

    const comparison = await this.#revisionRepo.compare(revisionId1, revisionId2);
    if (!comparison) {
      throw new Error('One or both revisions not found');
    }

    const rev1 = this.#hydrateRevision(comparison.revision1);
    const rev2 = this.#hydrateRevision(comparison.revision2);

    const diff = diffContent(rev1.content, rev2.content);

    return {
      revision1: rev1,
      revision2: rev2,
      diff,
      titleChanged: rev1.title !== rev2.title,
      oldTitle: rev1.title,
      newTitle: rev2.title
    };
  }

  // ==================== Sharing ====================

  /**
   * Share a document with another company
   * @param {string} documentId - Document ID
   * @param {ShareDocumentData} data - Share data
   * @param {string} sharerId - User ID sharing
   * @returns {Promise<Object>} Share record
   */
  async shareDocument(documentId, data, sharerId) {
    const doc = await this.getDocument(documentId);
    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }

    if (doc.visibility !== 'shared' && doc.visibility !== 'public') {
      throw new Error('Document must have shared or public visibility to share');
    }

    // Check if already shared
    const existing = await this.#shareRepo?.findByDocumentAndCompany(
      documentId, 
      data.targetCompanyId
    );
    
    if (existing && !existing.revoked_at) {
      throw new Error('Document is already shared with this company');
    }

    const share = {
      id: generateUUID(),
      documentId,
      sourceCompanyId: doc.companyId,
      targetCompanyId: data.targetCompanyId,
      permission: data.permission || 'read',
      sharedBy: sharerId,
      shareToken: generateShareToken(),
      expiresAt: data.expiresAt || null,
      revokedAt: null,
      revokedBy: null,
      createdAt: now()
    };

    if (this.#shareRepo) {
      await this.#shareRepo.create({
        id: share.id,
        document_id: share.documentId,
        source_company_id: share.sourceCompanyId,
        target_company_id: share.targetCompanyId,
        permission: share.permission,
        shared_by: share.sharedBy,
        share_token: share.shareToken,
        expires_at: share.expiresAt
      });
    }

    return share;
  }

  /**
   * Revoke a share
   * @param {string} shareId - Share ID
   * @param {string} revokerId - User ID revoking
   * @returns {Promise<boolean>}
   */
  async revokeShare(shareId, revokerId) {
    if (!this.#shareRepo) return false;
    return this.#shareRepo.revoke(shareId, revokerId);
  }

  /**
   * Get shares for a document
   * @param {string} documentId - Document ID
   * @returns {Promise<Object[]>}
   */
  async getDocumentShares(documentId) {
    if (!this.#shareRepo) return [];
    return this.#shareRepo.findByDocument(documentId);
  }

  /**
   * Check if company has access to a document
   * @param {string} documentId - Document ID
   * @param {string} companyId - Company ID
   * @returns {Promise<{hasAccess: boolean, permission: string|null}>}
   */
  async checkAccess(documentId, companyId) {
    const doc = await this.getDocument(documentId);
    if (!doc) return { hasAccess: false, permission: null };

    // Owner always has access
    if (doc.companyId === companyId) {
      return { hasAccess: true, permission: 'admin' };
    }

    // Public documents
    if (doc.visibility === 'public') {
      return { hasAccess: true, permission: 'read' };
    }

    // Check shares
    if (this.#shareRepo) {
      return this.#shareRepo.checkAccess(documentId, companyId);
    }

    return { hasAccess: false, permission: null };
  }

  // ==================== Statistics & Maintenance ====================

  /**
   * Get document statistics for a company
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>}
   */
  async getStatistics(companyId) {
    if (!this.#documentRepo) return { total: 0, active: 0, archived: 0, deleted: 0 };
    return this.#documentRepo.getStatistics(companyId);
  }

  /**
   * Get expired soft-deleted documents
   * @returns {Promise<Document[]>}
   */
  async getExpiredDeletions() {
    if (!this.#documentRepo) return [];
    
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - this.#retentionDays);
    
    const sql = `
      SELECT * FROM documents 
      WHERE deleted_at IS NOT NULL 
      AND deleted_at < ?
    `;
    const rows = await this.#documentRepo.pool.all(sql, [retentionDate.toISOString()]);
    return rows.map(row => this.#hydrateDocument(row));
  }

  /**
   * Clean up expired soft-deleted documents
   * @returns {Promise<number>} Number of documents deleted
   */
  async cleanupExpiredDeletions() {
    const expired = await this.getExpiredDeletions();
    let count = 0;
    
    for (const doc of expired) {
      try {
        await this.permanentlyDelete(doc.id);
        count++;
      } catch (err) {
        // Log but continue
        console.error(`Failed to delete document ${doc.id}:`, err.message);
      }
    }
    
    return count;
  }
}

export default DocumentService;
