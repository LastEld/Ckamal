/**
 * Claude Files Controller
 * File handling and document analysis
 * 
 * @module controllers/claude-files
 * @version 1.0.0
 */

import {
    validateRequest,
    formatResponse,
    formatListResponse,
    handleError,
    parsePagination
} from './helpers.js';

/**
 * Supported file categories
 * @readonly
 * @enum {string}
 */
export const FileCategory = {
    IMAGE: 'image',
    DOCUMENT: 'document',
    CODE: 'code',
    DATA: 'data'
};

/**
 * File size limits in bytes
 * @readonly
 */
export const SIZE_LIMITS = {
    [FileCategory.IMAGE]: 5 * 1024 * 1024,      // 5MB
    [FileCategory.DOCUMENT]: 10 * 1024 * 1024,  // 10MB
    [FileCategory.CODE]: 1 * 1024 * 1024,       // 1MB
    [FileCategory.DATA]: 1 * 1024 * 1024        // 1MB
};

/**
 * Analysis types for documents
 * @readonly
 * @enum {string}
 */
export const DocumentAnalysisType = {
    SUMMARY: 'summary',
    ENTITIES: 'entities',
    KEYWORDS: 'keywords',
    SENTIMENT: 'sentiment',
    TOPICS: 'topics',
    QA: 'qa'
};

/**
 * ClaudeFilesController class
 * Manages file uploads, storage, and document analysis
 */
export class ClaudeFilesController {
    /**
     * Create a new ClaudeFilesController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.storage] - File storage gateway
     * @param {Object} [options.analyzer] - Document analyzer gateway
     */
    constructor(options = {}) {
        this.storage = options.storage || null;
        this.analyzer = options.analyzer || null;
        this.name = 'ClaudeFilesController';
        this._files = new Map();
    }

    /**
     * Upload a file
     * @param {Object} file - File data
     * @param {string} file.filename - Original filename
     * @param {string} file.content - Base64-encoded content
     * @param {string} [file.mimeType] - MIME type
     * @param {string} [file.projectId] - Project ID
     * @param {string[]} [file.tags] - Tags
     * @param {Object} [options] - Upload options
     * @param {boolean} [options.extractContent=true] - Extract text content
     * @returns {Promise<Object>} Upload result
     */
    async upload(file, options = {}) {
        try {
            const validation = validateRequest({
                required: ['filename', 'content'],
                types: {
                    filename: 'string',
                    content: 'string',
                    mimeType: 'string',
                    projectId: 'string'
                }
            }, file);

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            // Decode base64
            let buffer;
            try {
                buffer = Buffer.from(file.content, 'base64');
            } catch (error) {
                return {
                    success: false,
                    error: 'Invalid base64 content',
                    code: 'VALIDATION_ERROR'
                };
            }

            // Detect MIME type
            const mimeType = file.mimeType || this._detectMimeType(file.filename, buffer);
            const category = this._getCategory(mimeType);

            // Check size limit
            const sizeLimit = SIZE_LIMITS[category];
            if (buffer.length > sizeLimit) {
                return {
                    success: false,
                    error: `File size exceeds limit for ${category} files (${this._formatBytes(sizeLimit)})`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const stored = {
                id: fileId,
                filename: file.filename,
                mimeType,
                category,
                sizeBytes: buffer.length,
                projectId: file.projectId,
                tags: file.tags || [],
                extractedContent: null,
                uploadedAt: new Date().toISOString()
            };

            // Extract content if requested
            if (options.extractContent !== false && category === FileCategory.DOCUMENT) {
                stored.extractedContent = await this._extractContent(buffer, mimeType);
            }

            this._files.set(fileId, stored);

            return formatResponse({
                fileId,
                filename: stored.filename,
                mimeType,
                sizeBytes: stored.sizeBytes,
                category,
                warnings: []
            }, { uploaded: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to upload file' });
        }
    }

    /**
     * Upload multiple files
     * @param {Array<Object>} files - Files to upload
     * @param {Object} [options] - Upload options
     * @returns {Promise<Object>} Batch upload result
     */
    async uploadBatch(files, options = {}) {
        try {
            if (!Array.isArray(files) || files.length === 0) {
                return {
                    success: false,
                    error: 'Files array is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const results = [];
            const errors = [];

            for (const file of files) {
                const result = await this.upload(file, options);
                if (result.success) {
                    results.push(result.data);
                } else {
                    errors.push({ filename: file.filename, error: result.error });
                }
            }

            return formatResponse({
                uploaded: results.length,
                failed: errors.length,
                files: results,
                errors: errors.length > 0 ? errors : undefined
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to upload batch' });
        }
    }

    /**
     * Get file by ID
     * @param {string} fileId - File ID
     * @param {Object} [options] - Get options
     * @param {boolean} [options.includeContent=true] - Include file content
     * @returns {Promise<Object>} File data
     */
    async get(fileId, options = {}) {
        try {
            if (!fileId) {
                return {
                    success: false,
                    error: 'File ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const file = this._files.get(fileId);
            if (!file) {
                return {
                    success: false,
                    error: `File not found: ${fileId}`,
                    code: 'NOT_FOUND'
                };
            }

            const result = { ...file };
            
            if (options.includeContent === false) {
                delete result.extractedContent;
            }

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get file' });
        }
    }

    /**
     * List files
     * @param {Object} [filters] - Filter criteria
     * @param {string} [filters.projectId] - Filter by project
     * @param {string} [filters.mimeType] - Filter by MIME type
     * @param {string} [filters.tag] - Filter by tag
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} List of files
     */
    async list(filters = {}, pagination = {}) {
        try {
            let files = Array.from(this._files.values());

            if (filters.projectId) {
                files = files.filter(f => f.projectId === filters.projectId);
            }

            if (filters.mimeType) {
                files = files.filter(f => f.mimeType.startsWith(filters.mimeType));
            }

            if (filters.tag) {
                files = files.filter(f => f.tags.includes(filters.tag));
            }

            // Sort by upload date
            files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

            const { limit, offset } = parsePagination(pagination);
            const paginated = files.slice(offset, offset + limit);

            // Return summaries
            const summaries = paginated.map(f => ({
                id: f.id,
                filename: f.filename,
                mimeType: f.mimeType,
                sizeBytes: f.sizeBytes,
                uploadedAt: f.uploadedAt
            }));

            return formatListResponse(summaries, {
                total: files.length,
                limit,
                offset
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list files' });
        }
    }

    /**
     * Delete a file
     * @param {string} fileId - File ID
     * @param {Object} [options] - Delete options
     * @param {boolean} [options.permanent=false] - Permanent delete
     * @returns {Promise<Object>} Delete result
     */
    async delete(fileId, options = {}) {
        try {
            if (!fileId) {
                return {
                    success: false,
                    error: 'File ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const file = this._files.get(fileId);
            if (!file) {
                return {
                    success: false,
                    error: `File not found: ${fileId}`,
                    code: 'NOT_FOUND'
                };
            }

            this._files.delete(fileId);

            return formatResponse({
                fileId,
                deleted: true,
                permanent: options.permanent || false
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to delete file' });
        }
    }

    /**
     * Analyze a document
     * @param {string} fileId - File ID
     * @param {DocumentAnalysisType} [analysisType='summary'] - Analysis type
     * @param {Object} [options] - Analysis options
     * @returns {Promise<Object>} Analysis result
     */
    async analyze(fileId, analysisType = DocumentAnalysisType.SUMMARY, options = {}) {
        try {
            if (!fileId) {
                return {
                    success: false,
                    error: 'File ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!Object.values(DocumentAnalysisType).includes(analysisType)) {
                return {
                    success: false,
                    error: `Invalid analysis type. Valid: ${Object.values(DocumentAnalysisType).join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const file = this._files.get(fileId);
            if (!file) {
                return {
                    success: false,
                    error: `File not found: ${fileId}`,
                    code: 'NOT_FOUND'
                };
            }

            if (!this.analyzer || typeof this.analyzer.analyze !== 'function') {
                return {
                    success: false,
                    error: 'Document analyzer is not configured',
                    code: 'NOT_CONFIGURED'
                };
            }

            const analyzed = await this.analyzer.analyze(file, analysisType, options);
            const result = {
                fileId,
                analysisType,
                result: analyzed,
                processedAt: new Date().toISOString()
            };

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to analyze document' });
        }
    }

    /**
     * Summarize a document
     * @param {string} fileId - File ID
     * @param {Object} [options] - Summary options
     * @param {number} [options.maxLength=500] - Maximum length
     * @param {string} [options.focus] - Focus area
     * @returns {Promise<Object>} Summary
     */
    async summarize(fileId, options = {}) {
        return this.analyze(fileId, DocumentAnalysisType.SUMMARY, options);
    }

    /**
     * Extract entities from a document
     * @param {string} fileId - File ID
     * @returns {Promise<Object>} Extracted entities
     */
    async extractEntities(fileId) {
        return this.analyze(fileId, DocumentAnalysisType.ENTITIES);
    }

    /**
     * Ask a question about a document
     * @param {string} fileId - File ID
     * @param {string} question - Question
     * @param {Object} [options] - Q&A options
     * @returns {Promise<Object>} Answer
     */
    async questionAnswer(fileId, question, options = {}) {
        try {
            if (!fileId || !question) {
                return {
                    success: false,
                    error: 'File ID and question are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.analyze(fileId, DocumentAnalysisType.QA, { question, ...options });
            return result;
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to answer question' });
        }
    }

    /**
     * Batch analyze files
     * @param {string[]} fileIds - File IDs
     * @param {DocumentAnalysisType} analysisType - Analysis type
     * @param {Object} [options] - Batch options
     * @returns {Promise<Object>} Batch results
     */
    async batchAnalyze(fileIds, analysisType, options = {}) {
        try {
            if (!Array.isArray(fileIds) || fileIds.length === 0) {
                return {
                    success: false,
                    error: 'File IDs array is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const results = [];
            const errors = [];

            for (const fileId of fileIds) {
                const result = await this.analyze(fileId, analysisType, options);
                if (result.success) {
                    results.push(result.data);
                } else {
                    errors.push({ fileId, error: result.error });
                }
            }

            return formatResponse({
                analysisType,
                completed: results.length,
                failed: errors.length,
                results,
                errors: errors.length > 0 ? errors : undefined
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed batch analysis' });
        }
    }

    /**
     * Get supported file types
     * @returns {Object} Supported types
     */
    getSupportedTypes() {
        return formatResponse({
            categories: {
                [FileCategory.IMAGE]: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
                [FileCategory.DOCUMENT]: ['application/pdf', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
                [FileCategory.CODE]: ['text/javascript', 'text/python', 'text/x-java-source', 'text/html', 'text/css'],
                [FileCategory.DATA]: ['application/json', 'text/csv', 'application/yaml', 'text/xml']
            },
            sizeLimits: SIZE_LIMITS
        });
    }

    /**
     * Get storage statistics
     * @returns {Object} Storage stats
     */
    async getStorageStats() {
        try {
            const files = Array.from(this._files.values());
            const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0);

            // MIME type breakdown
            const mimeTypes = {};
            for (const file of files) {
                mimeTypes[file.mimeType] = (mimeTypes[file.mimeType] || 0) + 1;
            }

            return formatResponse({
                files: {
                    count: files.length,
                    totalSize,
                    totalSizeFormatted: this._formatBytes(totalSize)
                },
                mimeTypes
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get stats' });
        }
    }

    // Private methods

    /**
     * Detect MIME type
     * @private
     * @param {string} filename - Filename
     * @param {Buffer} buffer - File buffer
     * @returns {string} MIME type
     */
    _detectMimeType(filename, buffer) {
        void buffer;
        const ext = filename.split('.').pop()?.toLowerCase();
        
        const mimeMap = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp',
            'gif': 'image/gif',
            'pdf': 'application/pdf',
            'txt': 'text/plain',
            'md': 'text/markdown',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'json': 'application/json',
            'csv': 'text/csv',
            'yaml': 'application/yaml',
            'yml': 'application/yaml',
            'js': 'text/javascript',
            'py': 'text/python',
            'java': 'text/x-java-source',
            'html': 'text/html',
            'css': 'text/css'
        };

        return mimeMap[ext] || 'application/octet-stream';
    }

    /**
     * Get file category from MIME type
     * @private
     * @param {string} mimeType - MIME type
     * @returns {string} Category
     */
    _getCategory(mimeType) {
        if (mimeType.startsWith('image/')) return FileCategory.IMAGE;
        if (['application/pdf', 'text/plain', 'text/markdown'].includes(mimeType) || 
            mimeType.includes('officedocument')) return FileCategory.DOCUMENT;
        if (['application/json', 'text/csv', 'application/yaml', 'text/xml'].includes(mimeType)) return FileCategory.DATA;
        return FileCategory.CODE;
    }

    /**
     * Extract content from file
     * @private
     * @param {Buffer} buffer - File buffer
     * @param {string} mimeType - MIME type
     * @returns {Promise<string|null>} Extracted content
     */
    async _extractContent(buffer, mimeType) {
        // Mock content extraction
        if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
            return buffer.toString('utf-8').slice(0, 10000);
        }
        return null;
    }

    /**
     * Format bytes to human readable
     * @private
     * @param {number} bytes - Bytes
     * @returns {string} Formatted string
     */
    _formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

/**
 * Create a new ClaudeFilesController instance
 * @param {Object} [options] - Controller options
 * @returns {ClaudeFilesController} Controller instance
 */
export function createClaudeFilesController(options = {}) {
    return new ClaudeFilesController(options);
}

export default ClaudeFilesController;
