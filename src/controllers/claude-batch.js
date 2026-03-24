/**
 * Claude Batch Controller
 * Batch operations for processing multiple Claude API requests
 * 
 * @module controllers/claude-batch
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
 * Batch job status values
 * @readonly
 * @enum {string}
 */
export const BatchStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

/**
 * ClaudeBatchController class
 * Manages batch processing of Claude API requests
 */
export class ClaudeBatchController {
    /**
     * Create a new ClaudeBatchController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.gateway] - Batch API gateway
     * @param {Object} [options.manager] - Batch manager instance
     */
    constructor(options = {}) {
        this.gateway = options.gateway || null;
        this.manager = options.manager || null;
        this.name = 'ClaudeBatchController';
        this._jobs = new Map();
    }

    /**
     * Create a new batch job
     * @param {Object} batch - Batch configuration
     * @param {string} [batch.name] - Batch name
     * @param {string} [batch.description] - Batch description
     * @param {Array} batch.requests - Array of API requests
     * @param {number} [batch.priority=5] - Batch priority (1-10)
     * @param {Object} [options] - Processing options
     * @param {number} [options.maxConcurrent=5] - Max concurrent requests
     * @param {number} [options.maxRetries=3] - Max retries per request
     * @param {boolean} [options.autoStart=false] - Auto-start processing
     * @returns {Promise<Object>} Created batch job
     */
    async create(batch, options = {}) {
        try {
            const validation = validateRequest({
                required: ['requests'],
                types: {
                    name: 'string',
                    description: 'string',
                    requests: 'array',
                    priority: 'number'
                },
                validators: {
                    priority: (v) => !v || (v >= 1 && v <= 10) || 'Priority must be 1-10',
                    requests: (v) => v.length > 0 || 'Requests array must not be empty'
                }
            }, batch);

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            // Validate each request
            for (let i = 0; i < batch.requests.length; i++) {
                const req = batch.requests[i];
                if (!req.messages || !Array.isArray(req.messages)) {
                    return {
                        success: false,
                        error: `Request ${i}: messages array is required`,
                        code: 'VALIDATION_ERROR'
                    };
                }
            }

            const jobId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const job = {
                id: jobId,
                name: batch.name || 'Untitled Batch',
                description: batch.description,
                status: BatchStatus.PENDING,
                totalRequests: batch.requests.length,
                completedRequests: 0,
                failedRequests: 0,
                priority: batch.priority || 5,
                requests: batch.requests.map((req, idx) => ({
                    id: `${jobId}_req_${idx}`,
                    status: 'pending',
                    model: req.model || 'claude-3-5-sonnet-20241022',
                    messages: req.messages,
                    maxTokens: req.max_tokens || 1024,
                    temperature: req.temperature,
                    priority: req.priority || 5
                })),
                results: [],
                errors: [],
                options: {
                    maxConcurrent: Math.min(Math.max(options.maxConcurrent || 5, 1), 20),
                    maxRetries: Math.min(Math.max(options.maxRetries || 3, 0), 10)
                },
                createdAt: new Date().toISOString(),
                startedAt: null,
                completedAt: null
            };

            this._jobs.set(jobId, job);

            // Auto-start if requested
            if (options.autoStart) {
                await this.start(jobId);
            }

            return formatResponse({
                id: jobId,
                name: job.name,
                status: job.status,
                totalRequests: job.totalRequests,
                createdAt: job.createdAt
            }, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create batch' });
        }
    }

    /**
     * Get batch job status
     * @param {string} batchId - Batch job ID
     * @param {Object} [options] - Options
     * @param {boolean} [options.includeResults=false] - Include results if completed
     * @returns {Promise<Object>} Batch status
     */
    async getStatus(batchId, options = {}) {
        try {
            if (!batchId) {
                return {
                    success: false,
                    error: 'Batch ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const job = this._jobs.get(batchId);
            if (!job) {
                return {
                    success: false,
                    error: `Batch job not found: ${batchId}`,
                    code: 'NOT_FOUND'
                };
            }

            const result = {
                id: job.id,
                name: job.name,
                status: job.status,
                totalRequests: job.totalRequests,
                completedRequests: job.completedRequests,
                failedRequests: job.failedRequests,
                progress: Math.round((job.completedRequests / job.totalRequests) * 100),
                createdAt: job.createdAt,
                startedAt: job.startedAt,
                completedAt: job.completedAt
            };

            if (options.includeResults && job.status === BatchStatus.COMPLETED) {
                result.results = job.results;
                result.errors = job.errors;
            }

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get batch status' });
        }
    }

    /**
     * Get batch results
     * @param {string} batchId - Batch job ID
     * @param {Object} [options] - Options
     * @param {'json'|'csv'|'summary'} [options.format='json'] - Output format
     * @param {boolean} [options.includeErrors=true] - Include error details
     * @returns {Promise<Object>} Batch results
     */
    async getResults(batchId, options = {}) {
        try {
            if (!batchId) {
                return {
                    success: false,
                    error: 'Batch ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const job = this._jobs.get(batchId);
            if (!job) {
                return {
                    success: false,
                    error: `Batch job not found: ${batchId}`,
                    code: 'NOT_FOUND'
                };
            }

            if (job.status !== BatchStatus.COMPLETED) {
                return {
                    success: false,
                    error: `Batch job is not completed. Current status: ${job.status}`,
                    code: 'INVALID_REQUEST'
                };
            }

            const format = options.format || 'json';
            let results = job.results;

            if (format === 'csv') {
                // Convert to CSV format
                results = this._convertToCSV(job.results);
            } else if (format === 'summary') {
                results = {
                    completed: job.completedRequests,
                    failed: job.failedRequests,
                    total: job.totalRequests
                };
            }

            return formatResponse({
                id: batchId,
                format,
                completed: job.completedRequests,
                failed: job.failedRequests,
                results: options.includeErrors !== false ? results : results.filter(r => !r.error),
                errors: options.includeErrors !== false ? job.errors : undefined
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get batch results' });
        }
    }

    /**
     * Start processing a batch job
     * @param {string} batchId - Batch job ID
     * @returns {Promise<Object>} Start result
     */
    async start(batchId) {
        try {
            if (!batchId) {
                return {
                    success: false,
                    error: 'Batch ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const job = this._jobs.get(batchId);
            if (!job) {
                return {
                    success: false,
                    error: `Batch job not found: ${batchId}`,
                    code: 'NOT_FOUND'
                };
            }

            if (job.status !== BatchStatus.PENDING) {
                return {
                    success: false,
                    error: `Cannot start batch with status: ${job.status}`,
                    code: 'INVALID_REQUEST'
                };
            }

            job.status = BatchStatus.RUNNING;
            job.startedAt = new Date().toISOString();

            // Start processing
            this._processBatch(job);

            return formatResponse({
                id: batchId,
                status: job.status,
                startedAt: job.startedAt
            }, { started: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to start batch' });
        }
    }

    /**
     * Cancel a batch job
     * @param {string} batchId - Batch job ID
     * @returns {Promise<Object>} Cancel result
     */
    async cancel(batchId) {
        try {
            if (!batchId) {
                return {
                    success: false,
                    error: 'Batch ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const job = this._jobs.get(batchId);
            if (!job) {
                return {
                    success: false,
                    error: `Batch job not found: ${batchId}`,
                    code: 'NOT_FOUND'
                };
            }

            if (job.status === BatchStatus.COMPLETED || job.status === BatchStatus.CANCELLED) {
                return {
                    success: false,
                    error: `Cannot cancel batch with status: ${job.status}`,
                    code: 'INVALID_REQUEST'
                };
            }

            job.status = BatchStatus.CANCELLED;
            job.completedAt = new Date().toISOString();

            return formatResponse({
                id: batchId,
                status: job.status,
                completedRequests: job.completedRequests,
                cancelledAt: job.completedAt
            }, { cancelled: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to cancel batch' });
        }
    }

    /**
     * List batch jobs
     * @param {Object} [filters] - Filter criteria
     * @param {BatchStatus} [filters.status] - Filter by status
     * @param {number} [filters.priority] - Filter by priority
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} List of batch jobs
     */
    async list(filters = {}, pagination = {}) {
        try {
            let jobs = Array.from(this._jobs.values());

            // Apply filters
            if (filters.status) {
                jobs = jobs.filter(j => j.status === filters.status);
            }
            if (filters.priority) {
                jobs = jobs.filter(j => j.priority <= filters.priority);
            }

            // Sort by creation date (newest first)
            jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Apply pagination
            const { limit, offset } = parsePagination(pagination);
            const paginated = jobs.slice(offset, offset + limit);

            // Return summary for each job
            const summaries = paginated.map(job => ({
                id: job.id,
                name: job.name,
                status: job.status,
                totalRequests: job.totalRequests,
                completedRequests: job.completedRequests,
                progress: Math.round((job.completedRequests / job.totalRequests) * 100),
                createdAt: job.createdAt
            }));

            return formatListResponse(summaries, {
                total: jobs.length,
                limit,
                offset
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list batches' });
        }
    }

    /**
     * Add requests to an existing pending batch
     * @param {string} batchId - Batch job ID
     * @param {Array} requests - Additional requests
     * @returns {Promise<Object>} Update result
     */
    async addRequests(batchId, requests) {
        try {
            if (!batchId) {
                return {
                    success: false,
                    error: 'Batch ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!Array.isArray(requests) || requests.length === 0) {
                return {
                    success: false,
                    error: 'Requests array is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const job = this._jobs.get(batchId);
            if (!job) {
                return {
                    success: false,
                    error: `Batch job not found: ${batchId}`,
                    code: 'NOT_FOUND'
                };
            }

            if (job.status !== BatchStatus.PENDING) {
                return {
                    success: false,
                    error: `Can only add requests to pending batches. Current status: ${job.status}`,
                    code: 'INVALID_REQUEST'
                };
            }

            const startIdx = job.requests.length;
            const newRequests = requests.map((req, idx) => ({
                id: `${batchId}_req_${startIdx + idx}`,
                status: 'pending',
                model: req.model || 'claude-3-5-sonnet-20241022',
                messages: req.messages,
                maxTokens: req.max_tokens || 1024,
                temperature: req.temperature,
                priority: req.priority || 5
            }));

            job.requests.push(...newRequests);
            job.totalRequests = job.requests.length;

            return formatResponse({
                id: batchId,
                added: requests.length,
                total: job.totalRequests
            }, { added: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to add requests' });
        }
    }

    /**
     * Delete a batch job
     * @param {string} batchId - Batch job ID
     * @returns {Promise<Object>} Delete result
     */
    async delete(batchId) {
        try {
            if (!batchId) {
                return {
                    success: false,
                    error: 'Batch ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!this._jobs.has(batchId)) {
                return {
                    success: false,
                    error: `Batch job not found: ${batchId}`,
                    code: 'NOT_FOUND'
                };
            }

            this._jobs.delete(batchId);

            return formatResponse({ id: batchId, deleted: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to delete batch' });
        }
    }

    /**
     * Get batch statistics
     * @returns {Object} Batch statistics
     */
    getStats() {
        const jobs = Array.from(this._jobs.values());
        const stats = {
            total: jobs.length,
            byStatus: {
                pending: jobs.filter(j => j.status === BatchStatus.PENDING).length,
                running: jobs.filter(j => j.status === BatchStatus.RUNNING).length,
                completed: jobs.filter(j => j.status === BatchStatus.COMPLETED).length,
                failed: jobs.filter(j => j.status === BatchStatus.FAILED).length,
                cancelled: jobs.filter(j => j.status === BatchStatus.CANCELLED).length
            },
            totalRequests: jobs.reduce((sum, j) => sum + j.totalRequests, 0),
            completedRequests: jobs.reduce((sum, j) => sum + j.completedRequests, 0)
        };

        return formatResponse(stats);
    }

    // Private methods

    /**
     * Process batch job asynchronously
     * @private
     * @param {Object} job - Batch job
     */
    async _processBatch(job) {
        const { maxConcurrent } = job.options;
        const pendingRequests = job.requests.filter(r => r.status === 'pending');

        // Process in chunks
        for (let i = 0; i < pendingRequests.length; i += maxConcurrent) {
            if (job.status !== BatchStatus.RUNNING) {
                break;
            }

            const chunk = pendingRequests.slice(i, i + maxConcurrent);
            await Promise.all(chunk.map(req => this._processRequest(job, req)));
        }

        // Mark complete if still running
        if (job.status === BatchStatus.RUNNING) {
            job.status = job.completedRequests === 0 && job.failedRequests === job.totalRequests
                ? BatchStatus.FAILED
                : BatchStatus.COMPLETED;
            job.completedAt = new Date().toISOString();
        }
    }

    /**
     * Process a single request
     * @private
     * @param {Object} job - Batch job
     * @param {Object} request - Request to process
     */
    async _processRequest(job, request) {
        if (!job || !request) {
            throw new Error('Batch job and request are required');
        }

        try {
            request.status = 'processing';
            let result;

            if (this.manager && typeof this.manager.processRequest === 'function') {
                result = await this.manager.processRequest(request, job.options);
            } else if (this.gateway && typeof this.gateway.sendMessage === 'function') {
                result = await this.gateway.sendMessage({
                    model: request.model,
                    messages: request.messages,
                    max_tokens: request.maxTokens,
                    temperature: request.temperature
                });
            } else {
                throw new Error('Claude batch gateway is not configured');
            }

            const payload = result?.data ?? result;
            request.status = 'completed';
            job.completedRequests++;
            job.results.push({
                requestId: request.id,
                success: true,
                content: payload?.content ?? payload ?? null
            });
        } catch (error) {
            request.status = 'failed';
            job.failedRequests++;
            job.errors.push({
                requestId: request.id,
                error: error.message
            });
        }
    }

    /**
     * Convert results to CSV
     * @private
     * @param {Array} results - Results array
     * @returns {string} CSV string
     */
    _convertToCSV(results) {
        if (results.length === 0) return '';

        const headers = ['requestId', 'success', 'content'];
        const rows = results.map(r => [r.requestId, r.success, r.content]);

        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }
}

/**
 * Create a new ClaudeBatchController instance
 * @param {Object} [options] - Controller options
 * @returns {ClaudeBatchController} Controller instance
 */
export function createClaudeBatchController(options = {}) {
    return new ClaudeBatchController(options);
}

export default ClaudeBatchController;
