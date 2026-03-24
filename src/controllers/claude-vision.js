/**
 * Claude Vision Controller
 * Vision operations for image analysis and processing
 * 
 * @module controllers/claude-vision
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
 * Analysis types for vision operations
 * @readonly
 * @enum {string}
 */
export const AnalysisType = {
    GENERAL: 'general',
    OCR: 'ocr',
    CHART: 'chart',
    OBJECTS: 'objects',
    FACE: 'face',
    SCENE: 'scene',
    COLOR: 'color'
};

/**
 * Supported image formats
 * @readonly
 * @enum {string}
 */
export const ImageFormat = {
    PNG: 'image/png',
    JPEG: 'image/jpeg',
    WEBP: 'image/webp',
    GIF: 'image/gif'
};

/**
 * ClaudeVisionController class
 * Manages vision operations and image analysis
 */
export class ClaudeVisionController {
    /**
     * Create a new ClaudeVisionController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.gateway] - Vision API gateway
     * @param {Object} [options.storage] - Image storage gateway
     */
    constructor(options = {}) {
        this.gateway = options.gateway || null;
        this.storage = options.storage || null;
        this.name = 'ClaudeVisionController';
        this._images = new Map();
    }

    /**
     * Upload an image for analysis
     * @param {Object} image - Image data
     * @param {string} image.content - Base64-encoded image content
     * @param {string} [image.filename] - Original filename
     * @param {string} [image.mimeType] - MIME type
     * @param {string} [image.projectId] - Project ID for organization
     * @param {string[]} [image.tags] - Optional tags
     * @returns {Promise<Object>} Upload result with image ID
     */
    async upload(image) {
        try {
            const validation = validateRequest({
                required: ['content'],
                types: {
                    content: 'string',
                    filename: 'string',
                    mimeType: 'string',
                    projectId: 'string'
                }
            }, image);

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            // Validate base64
            let buffer;
            try {
                buffer = Buffer.from(image.content, 'base64');
            } catch (error) {
                return {
                    success: false,
                    error: 'Invalid base64 content',
                    code: 'VALIDATION_ERROR'
                };
            }

            // Check size (max 5MB for images)
            if (buffer.length > 5 * 1024 * 1024) {
                return {
                    success: false,
                    error: 'Image size exceeds 5MB limit',
                    code: 'VALIDATION_ERROR'
                };
            }

            // Detect MIME type if not provided
            let mimeType = image.mimeType || this._detectMimeType(buffer);

            if (this.storage && this.storage.storeImage) {
                const result = await this.storage.storeImage({
                    data: buffer,
                    mimeType,
                    filename: image.filename,
                    projectId: image.projectId,
                    tags: image.tags || []
                });

                return formatResponse({
                    imageId: result.id,
                    mimeType,
                    sizeBytes: buffer.length,
                    dimensions: result.dimensions
                }, { uploaded: true });
            }

            const imageId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            this._images.set(imageId, {
                id: imageId,
                filename: image.filename ?? null,
                mimeType,
                sizeBytes: buffer.length,
                projectId: image.projectId ?? null,
                tags: image.tags || [],
                uploadedAt: new Date().toISOString(),
                dimensions: null
            });

            return formatResponse({
                imageId,
                mimeType,
                sizeBytes: buffer.length
            }, { uploaded: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to upload image' });
        }
    }

    /**
     * Analyze an image
     * @param {string} imageId - Image ID
     * @param {AnalysisType} [analysisType='general'] - Type of analysis
     * @param {Object} [options] - Analysis options
     * @param {boolean} [options.useCache=true] - Use cached results
     * @returns {Promise<Object>} Analysis results
     */
    async analyze(imageId, analysisType = AnalysisType.GENERAL, options = {}) {
        try {
            if (!imageId) {
                return {
                    success: false,
                    error: 'Image ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!Object.values(AnalysisType).includes(analysisType)) {
                return {
                    success: false,
                    error: `Invalid analysis type. Valid: ${Object.values(AnalysisType).join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            if (this.gateway && this.gateway.analyzeImage) {
                const result = await this.gateway.analyzeImage(imageId, analysisType, options);
                return formatResponse(result);
            }

            return {
                success: false,
                error: 'Vision analysis gateway is not configured',
                code: 'NOT_CONFIGURED'
            };
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to analyze image' });
        }
    }

    /**
     * Perform comprehensive analysis on an image
     * @param {string} imageId - Image ID
     * @param {Object} [options] - Analysis options
     * @returns {Promise<Object>} Comprehensive analysis results
     */
    async analyzeComprehensive(imageId, options = {}) {
        try {
            if (!imageId) {
                return {
                    success: false,
                    error: 'Image ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const analysisTypes = [
                AnalysisType.GENERAL,
                AnalysisType.OCR,
                AnalysisType.OBJECTS,
                AnalysisType.SCENE,
                AnalysisType.COLOR
            ];

            const results = {};
            for (const type of analysisTypes) {
                try {
                    const result = await this.analyze(imageId, type, options);
                    if (result.success) {
                        results[type] = result.data;
                    }
                } catch (e) {
                    results[type] = { error: e.message };
                }
            }

            return formatResponse({
                imageId,
                analyses: results,
                completedAt: new Date().toISOString()
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed comprehensive analysis' });
        }
    }

    /**
     * Extract text from an image (OCR)
     * @param {string} imageId - Image ID
     * @param {Object} [options] - OCR options
     * @param {boolean} [options.structured=true] - Return structured text blocks
     * @returns {Promise<Object>} OCR results
     */
    async extractText(imageId, options = {}) {
        return this.analyze(imageId, AnalysisType.OCR, options);
    }

    /**
     * Extract data from charts and graphs
     * @param {string} imageId - Image ID
     * @param {Object} [options] - Extraction options
     * @param {'structured'|'raw'|'csv'} [options.format='structured'] - Output format
     * @returns {Promise<Object>} Chart data
     */
    async extractChartData(imageId, options = {}) {
        try {
            const result = await this.analyze(imageId, AnalysisType.CHART, options);
            if (!result.success) return result;

            // Format conversion would happen here
            return formatResponse({
                ...result.data,
                format: options.format || 'structured'
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to extract chart data' });
        }
    }

    /**
     * Detect objects in an image
     * @param {string} imageId - Image ID
     * @param {Object} [options] - Detection options
     * @returns {Promise<Object>} Detected objects
     */
    async detectObjects(imageId, options = {}) {
        return this.analyze(imageId, AnalysisType.OBJECTS, options);
    }

    /**
     * Classify scene type
     * @param {string} imageId - Image ID
     * @returns {Promise<Object>} Scene classification
     */
    async classifyScene(imageId) {
        return this.analyze(imageId, AnalysisType.SCENE);
    }

    /**
     * Analyze color palette
     * @param {string} imageId - Image ID
     * @returns {Promise<Object>} Color analysis
     */
    async analyzeColors(imageId) {
        return this.analyze(imageId, AnalysisType.COLOR);
    }

    /**
     * Compare two images
     * @param {string} imageId1 - First image ID
     * @param {string} imageId2 - Second image ID
     * @param {Object} [options] - Comparison options
     * @param {boolean} [options.detailed=true] - Include detailed analysis
     * @returns {Promise<Object>} Comparison results
     */
    async compare(imageId1, imageId2, options = {}) {
        try {
            if (!imageId1 || !imageId2) {
                return {
                    success: false,
                    error: 'Both image IDs are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (this.gateway && this.gateway.compareImages) {
                const result = await this.gateway.compareImages(imageId1, imageId2, options);
                return formatResponse(result);
            }

            return {
                success: false,
                error: 'Vision comparison gateway is not configured',
                code: 'NOT_CONFIGURED'
            };
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to compare images' });
        }
    }

    /**
     * Ask a question about an image
     * @param {string} imageId - Image ID
     * @param {string} question - Question to ask
     * @returns {Promise<Object>} Answer
     */
    async visualQA(imageId, question) {
        try {
            if (!imageId || !question) {
                return {
                    success: false,
                    error: 'Image ID and question are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (this.gateway && this.gateway.visualQA) {
                const result = await this.gateway.visualQA(imageId, question);
                return formatResponse(result);
            }

            return {
                success: false,
                error: 'Vision QA gateway is not configured',
                code: 'NOT_CONFIGURED'
            };
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to answer question' });
        }
    }

    /**
     * Batch analyze multiple images
     * @param {string[]} imageIds - Array of image IDs
     * @param {AnalysisType} [analysisType='general'] - Analysis type
     * @param {Object} [options] - Batch options
     * @param {number} [options.concurrency=3] - Parallel analyses
     * @returns {Promise<Object>} Batch results
     */
    async batchAnalyze(imageIds, analysisType = AnalysisType.GENERAL, options = {}) {
        try {
            if (!Array.isArray(imageIds) || imageIds.length === 0) {
                return {
                    success: false,
                    error: 'Image IDs array is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const concurrency = Math.min(Math.max(options.concurrency || 3, 1), 10);
            const results = [];
            
            // Process in batches
            for (let i = 0; i < imageIds.length; i += concurrency) {
                const batch = imageIds.slice(i, i + concurrency);
                const batchResults = await Promise.all(
                    batch.map(id => this.analyze(id, analysisType, options))
                );
                results.push(...batchResults);
            }

            const completed = results.filter(r => r.success).length;
            const failed = results.length - completed;

            return formatResponse({
                analysisType,
                completed,
                failed,
                results: results.map(r => r.data || r)
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed batch analysis' });
        }
    }

    /**
     * Get image metadata
     * @param {string} imageId - Image ID
     * @param {Object} [options] - Options
     * @param {boolean} [options.includeBase64=false] - Include base64 data
     * @returns {Promise<Object>} Image metadata
     */
    async getImage(imageId, options = {}) {
        try {
            if (!imageId) {
                return {
                    success: false,
                    error: 'Image ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (this.storage && this.storage.getImage) {
                const result = await this.storage.getImage(imageId, options);
                return formatResponse(result);
            }

            const image = this._images.get(imageId);
            if (!image) {
                return {
                    success: false,
                    error: `Image not found: ${imageId}`,
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse(image);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get image' });
        }
    }

    /**
     * List uploaded images
     * @param {Object} [filters] - Filter criteria
     * @param {string} [filters.projectId] - Filter by project
     * @param {boolean} [filters.analyzed] - Filter by analyzed status
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} List of images
     */
    async list(filters = {}, pagination = {}) {
        try {
            if (this.storage && this.storage.listImages) {
                const result = await this.storage.listImages({
                    ...filters,
                    ...parsePagination(pagination)
                });
                return formatListResponse(result.images || result, {
                    total: result.total || result.length,
                    ...parsePagination(pagination)
                });
            }

            let images = Array.from(this._images.values());

            if (filters.projectId) {
                images = images.filter(image => image.projectId === filters.projectId);
            }

            if (filters.analyzed !== undefined) {
                images = images.filter(image => Boolean(image.analyzedAt) === filters.analyzed);
            }

            const { limit, offset } = parsePagination(pagination);
            const paginated = images.slice(offset, offset + limit);

            return formatListResponse(paginated, {
                total: images.length,
                limit,
                offset
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list images' });
        }
    }

    /**
     * Delete an image
     * @param {string} imageId - Image ID
     * @returns {Promise<Object>} Deletion result
     */
    async delete(imageId) {
        try {
            if (!imageId) {
                return {
                    success: false,
                    error: 'Image ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (this.storage && this.storage.deleteImage) {
                await this.storage.deleteImage(imageId);
            } else if (!this._images.delete(imageId)) {
                return {
                    success: false,
                    error: `Image not found: ${imageId}`,
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse({ id: imageId, deleted: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to delete image' });
        }
    }

    /**
     * Get vision capabilities
     * @returns {Object} Available capabilities
     */
    getCapabilities() {
        return formatResponse({
            available: true,
            analysisTypes: Object.values(AnalysisType),
            supportedFormats: Object.values(ImageFormat),
            maxImageSize: 5 * 1024 * 1024, // 5MB
            maxDimension: 8192,
            recommendedDimension: 1568
        });
    }

    // Private methods

    /**
     * Detect MIME type from buffer
     * @private
     * @param {Buffer} buffer - Image buffer
     * @returns {string} MIME type
     */
    _detectMimeType(buffer) {
        if (buffer[0] === 0x89 && buffer[1] === 0x50) {
            return ImageFormat.PNG;
        }
        if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
            return ImageFormat.JPEG;
        }
        if (buffer[0] === 0x52 && buffer[1] === 0x49) {
            return ImageFormat.WEBP;
        }
        if (buffer[0] === 0x47 && buffer[1] === 0x49) {
            return ImageFormat.GIF;
        }
        return ImageFormat.PNG;
    }
}

/**
 * Create a new ClaudeVisionController instance
 * @param {Object} [options] - Controller options
 * @returns {ClaudeVisionController} Controller instance
 */
export function createClaudeVisionController(options = {}) {
    return new ClaudeVisionController(options);
}

export default ClaudeVisionController;
