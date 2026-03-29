/**
 * @fileoverview Documents REST API Controller
 * HTTP endpoints for document management with versioning
 * @module controllers/documents-controller
 */

import { DocumentService } from '../domains/documents/document-service.js';
import { formatResponse, formatListResponse, handleError, parsePagination } from './helpers.js';

/**
 * Documents Controller - REST API endpoints for document management
 */
export class DocumentsController {
  /**
   * @param {Object} options
   * @param {DocumentService} [options.service] - Document service instance
   * @param {Object} [options.repositories] - Repository factory
   */
  constructor(options = {}) {
    this.service = options.service || null;
    this.repositories = options.repositories || null;
    
    if (!this.service && this.repositories) {
      this.service = new DocumentService({ repositories: this.repositories });
    }
  }

  /**
   * Initialize controller
   */
  async initialize() {
    if (!this.service && this.repositories) {
      this.service = new DocumentService({ repositories: this.repositories });
    }
  }

  // ============================================================================
  // DOCUMENT CRUD
  // ============================================================================

  /**
   * POST /api/documents - Create document
   */
  async createDocument(req, res) {
    try {
      const body = await this._parseBody(req);
      const companyId = this._getCompanyId(req);
      const userId = this._getUserId(req);

      if (!companyId) {
        return this._sendJson(res, 400, { success: false, error: 'Company ID is required', code: 'VALIDATION_ERROR' });
      }

      const document = await this.service.createDocument(body, companyId, userId);
      this._sendJson(res, 201, formatResponse(document));
    } catch (error) {
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * GET /api/documents - List documents
   */
  async listDocuments(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const companyId = this._getCompanyId(req);

      if (!companyId) {
        return this._sendJson(res, 400, { success: false, error: 'Company ID is required', code: 'VALIDATION_ERROR' });
      }

      const options = {
        status: url.searchParams.get('status') || 'active',
        visibility: url.searchParams.get('visibility') || undefined,
        search: url.searchParams.get('search') || undefined,
        tags: url.searchParams.getAll('tag'),
        ...parsePagination(Object.fromEntries(url.searchParams))
      };

      const documents = await this.service.listDocuments(companyId, options);
      this._sendJson(res, 200, formatListResponse(documents, {
        total: documents.length,
        limit: options.limit,
        offset: options.offset
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * GET /api/documents/:id - Get document
   */
  async getDocument(req, res, params) {
    try {
      const { id } = params;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const includeDeleted = url.searchParams.get('includeDeleted') === 'true';

      const document = await this.service.getDocument(id, { includeDeleted });
      
      if (!document) {
        return this._sendJson(res, 404, { success: false, error: 'Document not found', code: 'NOT_FOUND' });
      }

      this._sendJson(res, 200, formatResponse(document));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * PUT /api/documents/:id - Update document
   */
  async updateDocument(req, res, params) {
    try {
      const { id } = params;
      const body = await this._parseBody(req);
      const userId = this._getUserId(req);

      const document = await this.service.updateDocument(id, body, userId);
      this._sendJson(res, 200, formatResponse(document));
    } catch (error) {
      if (error.message?.includes('not found')) {
        return this._sendJson(res, 404, { success: false, error: error.message, code: 'NOT_FOUND' });
      }
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * DELETE /api/documents/:id - Delete document
   */
  async deleteDocument(req, res, params) {
    try {
      const { id } = params;
      const userId = this._getUserId(req);

      await this.service.deleteDocument(id, userId);
      this._sendJson(res, 200, formatResponse({ id, deleted: true }));
    } catch (error) {
      if (error.message?.includes('not found')) {
        return this._sendJson(res, 404, { success: false, error: error.message, code: 'NOT_FOUND' });
      }
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // REVISIONS
  // ============================================================================

  /**
   * GET /api/documents/:id/revisions - List revisions
   */
  async listRevisions(req, res, params) {
    try {
      const { id } = params;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      
      const options = {
        limit: parseInt(url.searchParams.get('limit')) || 50,
        offset: parseInt(url.searchParams.get('offset')) || 0
      };

      const revisions = await this.service.listRevisions(id, options);
      this._sendJson(res, 200, formatListResponse(revisions, {
        total: revisions.length,
        limit: options.limit,
        offset: options.offset
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * GET /api/documents/:id/revisions/:version - Get specific revision
   */
  async getRevision(req, res, params) {
    try {
      const { id, version } = params;
      const versionNumber = parseInt(version, 10);

      if (isNaN(versionNumber)) {
        return this._sendJson(res, 400, { success: false, error: 'Invalid version number', code: 'VALIDATION_ERROR' });
      }

      const revision = await this.service.getRevisionByVersion(id, versionNumber);
      
      if (!revision) {
        return this._sendJson(res, 404, { success: false, error: 'Revision not found', code: 'NOT_FOUND' });
      }

      this._sendJson(res, 200, formatResponse(revision));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * POST /api/documents/:id/restore/:version - Restore to version
   */
  async restoreRevision(req, res, params) {
    try {
      const { id, version } = params;
      const versionNumber = parseInt(version, 10);
      const userId = this._getUserId(req);

      if (isNaN(versionNumber)) {
        return this._sendJson(res, 400, { success: false, error: 'Invalid version number', code: 'VALIDATION_ERROR' });
      }

      const document = await this.service.restoreRevision(id, versionNumber, userId);
      this._sendJson(res, 200, formatResponse(document));
    } catch (error) {
      if (error.message?.includes('not found')) {
        return this._sendJson(res, 404, { success: false, error: error.message, code: 'NOT_FOUND' });
      }
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * GET /api/documents/:id/compare - Compare two revisions
   */
  async compareRevisions(req, res, params) {
    try {
      const { id } = params;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      
      const v1 = url.searchParams.get('v1');
      const v2 = url.searchParams.get('v2');

      if (!v1 || !v2) {
        return this._sendJson(res, 400, { 
          success: false, 
          error: 'Both v1 and v2 query parameters are required', 
          code: 'VALIDATION_ERROR' 
        });
      }

      const revision1 = await this.service.getRevisionByVersion(id, parseInt(v1, 10));
      const revision2 = await this.service.getRevisionByVersion(id, parseInt(v2, 10));

      if (!revision1 || !revision2) {
        return this._sendJson(res, 404, { success: false, error: 'One or both revisions not found', code: 'NOT_FOUND' });
      }

      // Simple diff implementation
      const comparison = this._compareContent(revision1, revision2);
      
      this._sendJson(res, 200, formatResponse(comparison));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // SHARING
  // ============================================================================

  /**
   * POST /api/documents/:id/share - Share document
   */
  async shareDocument(req, res, params) {
    try {
      const { id } = params;
      const body = await this._parseBody(req);
      const userId = this._getUserId(req);

      if (!body.targetCompanyId) {
        return this._sendJson(res, 400, { 
          success: false, 
          error: 'targetCompanyId is required', 
          code: 'VALIDATION_ERROR' 
        });
      }

      const share = await this.service.shareDocument(id, {
        targetCompanyId: body.targetCompanyId,
        permission: body.permission || 'read',
        expiresAt: body.expiresAt
      }, userId);

      this._sendJson(res, 201, formatResponse(share));
    } catch (error) {
      if (error.message?.includes('not found')) {
        return this._sendJson(res, 404, { success: false, error: error.message, code: 'NOT_FOUND' });
      }
      this._sendJson(res, 400, handleError(error));
    }
  }

  /**
   * GET /api/documents/:id/shares - List document shares
   */
  async listShares(req, res, params) {
    try {
      const { id } = params;
      const shares = await this.service.getDocumentShares(id);
      this._sendJson(res, 200, formatListResponse(shares, {
        total: shares.length,
        limit: shares.length,
        offset: 0
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  /**
   * DELETE /api/documents/:id/shares/:shareId - Revoke share
   */
  async revokeShare(req, res, params) {
    try {
      const { shareId } = params;
      const userId = this._getUserId(req);

      await this.service.revokeShare(shareId, userId);
      this._sendJson(res, 200, formatResponse({ shareId, revoked: true }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // SEARCH
  // ============================================================================

  /**
   * GET /api/documents/search - Search documents
   */
  async searchDocuments(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = url.searchParams.get('q') || '';
      const companyId = this._getCompanyId(req);

      const options = {
        companyId,
        ...parsePagination(Object.fromEntries(url.searchParams))
      };

      const documents = await this.service.searchDocuments(query, options);
      this._sendJson(res, 200, formatListResponse(documents, {
        total: documents.length,
        limit: options.limit,
        offset: options.offset
      }));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * GET /api/documents/statistics - Get document statistics
   */
  async getStatistics(req, res) {
    try {
      const companyId = this._getCompanyId(req);
      
      if (!companyId) {
        return this._sendJson(res, 400, { success: false, error: 'Company ID is required', code: 'VALIDATION_ERROR' });
      }

      const stats = await this.service.getStatistics(companyId);
      this._sendJson(res, 200, formatResponse(stats));
    } catch (error) {
      this._sendJson(res, 500, handleError(error));
    }
  }

  // ============================================================================
  // ADMIN / MAINTENANCE
  // ============================================================================

  /**
   * POST /api/documents/:id/restore - Restore soft-deleted document
   */
  async restoreDocument(req, res, params) {
    try {
      const { id } = params;
      const document = await this.service.restoreDocument(id);
      this._sendJson(res, 200, formatResponse(document));
    } catch (error) {
      if (error.message?.includes('not found')) {
        return this._sendJson(res, 404, { success: false, error: error.message, code: 'NOT_FOUND' });
      }
      this._sendJson(res, 400, handleError(error));
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Parse request body
   * @private
   */
  async _parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   * @private
   */
  _sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }

  /**
   * Get company ID from request
   * @private
   */
  _getCompanyId(req) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return req.headers['x-company-id'] || 
           url.searchParams.get('companyId') || 
           req.companyId || 
           null;
  }

  /**
   * Get user ID from request
   * @private
   */
  _getUserId(req) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return req.headers['x-user-id'] || 
           url.searchParams.get('userId') || 
           req.userId || 
           'anonymous';
  }

  /**
   * Compare two revisions and return diff
   * @private
   */
  _compareContent(rev1, rev2) {
    const oldLines = (rev1.content || '').split('\n');
    const newLines = (rev2.content || '').split('\n');
    
    const added = [];
    const removed = [];
    
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
    
    return {
      revision1: {
        id: rev1.id,
        versionNumber: rev1.versionNumber,
        title: rev1.title,
        createdAt: rev1.createdAt
      },
      revision2: {
        id: rev2.id,
        versionNumber: rev2.versionNumber,
        title: rev2.title,
        createdAt: rev2.createdAt
      },
      diff: {
        added,
        removed,
        charDiff: (rev2.content || '').length - (rev1.content || '').length
      },
      titleChanged: rev1.title !== rev2.title,
      oldTitle: rev1.title,
      newTitle: rev2.title
    };
  }
}

/**
 * Create documents controller instance
 * @param {Object} options
 * @returns {DocumentsController}
 */
export function createDocumentsController(options = {}) {
  return new DocumentsController(options);
}

export default DocumentsController;
