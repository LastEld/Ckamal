/**
 * @fileoverview Documents Domain - Document management with versioning
 * @module domains/documents
 * 
 * This module provides document management capabilities inspired by Paperclip's
 * document system, including full version history, cross-company sharing,
 * and soft delete with retention policies.
 * 
 * @example
 * import { DocumentService } from './document-service.js';
 * import { DocumentRepository, DocumentRevisionRepository, DocumentShareRepository } from './document-repository.js';
 * 
 * // Create service with repositories
 * const docService = new DocumentService({
 *   repositories: {
 *     documents: new DocumentRepository(pool),
 *     documentRevisions: new DocumentRevisionRepository(pool),
 *     documentShares: new DocumentShareRepository(pool)
 *   }
 * });
 * 
 * // Create a document
 * const doc = await docService.createDocument(
 *   { title: 'My Document', content: '# Hello World' },
 *   'company-uuid',
 *   'user-uuid'
 * );
 * 
 * // Update creates a new revision
 * const updated = await docService.updateDocument(
 *   doc.id,
 *   { content: '# Hello World\n\nUpdated content' },
 *   'user-uuid'
 * );
 * 
 * // List revisions
 * const revisions = await docService.listRevisions(doc.id);
 * 
 * // Restore to previous version
 * await docService.restoreRevision(doc.id, 1, 'user-uuid');
 * 
 * // Share with another company
 * await docService.shareDocument(doc.id, {
 *   targetCompanyId: 'other-company-uuid',
 *   permission: 'read'
 * }, 'user-uuid');
 */

export { DocumentService } from './document-service.js';
export { 
  DocumentRepository, 
  DocumentRevisionRepository, 
  DocumentShareRepository 
} from './document-repository.js';

// Re-export types for JSDoc
/**
 * @typedef {import('./document-service.js').Document} Document
 * @typedef {import('./document-service.js').DocumentRevision} DocumentRevision
 * @typedef {import('./document-service.js').CreateDocumentData} CreateDocumentData
 * @typedef {import('./document-service.js').UpdateDocumentData} UpdateDocumentData
 * @typedef {import('./document-service.js').ShareDocumentData} ShareDocumentData
 */
