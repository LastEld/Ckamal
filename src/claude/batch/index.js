/**
 * @fileoverview Claude Batch API Processing Module
 * Provides batch job creation, status tracking, and result retrieval.
 * @module claude/batch
 */

/**
 * @typedef {Object} BatchRequest
 * @property {string} custom_id - Unique identifier for the request
 * @property {Object} params - Request parameters (model, messages, etc.)
 */

/**
 * @typedef {Object} BatchStatus
 * @property {string} id - Batch ID
 * @property {string} status - Current status (in_progress, completed, failed, cancelled)
 * @property {number} request_counts.total - Total requests
 * @property {number} request_counts.completed - Completed requests
 * @property {number} request_counts.failed - Failed requests
 * @property {string} created_at - ISO timestamp
 * @property {string} [completed_at] - ISO timestamp when completed
 */

/**
 * @typedef {Object} BatchResult
 * @property {string} custom_id - Request identifier
 * @property {Object} result - Response data or error
 */

/**
 * BatchProcessor handles Claude Batch API operations.
 * Requires subscription authentication.
 */
export class BatchProcessor {
  /**
   * @param {Object} config
   * @param {string} config.apiKey - Anthropic API key
   * @param {string} [config.baseUrl='https://api.anthropic.com/v1'] - API base URL
   * @param {number} [config.timeout=30000] - Request timeout in ms
   */
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
    this.timeout = config.timeout || 30000;
  }

  /**
   * Makes authenticated API requests.
   * @private
   * @param {string} endpoint - API endpoint
   * @param {Object} [options] - Fetch options
   * @returns {Promise<Object>} API response
   */
  async _request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
          'anthropic-dangerous-direct-browser-access': 'true',
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          `API Error ${response.status}: ${error.error?.message || response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Creates a new batch job.
   * @param {BatchRequest[]} requests - Array of requests to process
   * @returns {Promise<BatchStatus>} Created batch status
   */
  async createBatch(requests) {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error('Requests array is required and must not be empty');
    }

    if (requests.length > 10000) {
      throw new Error('Maximum 10,000 requests per batch exceeded');
    }

    const payload = {
      requests: requests.map((req, index) => ({
        custom_id: req.custom_id || `req_${index}_${Date.now()}`,
        params: req.params,
      })),
    };

    return this._request('/messages/batches', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Gets the status of a batch job.
   * @param {string} batchId - Batch identifier
   * @returns {Promise<BatchStatus>} Batch status
   */
  async getBatchStatus(batchId) {
    if (!batchId) {
      throw new Error('Batch ID is required');
    }

    return this._request(`/messages/batches/${batchId}`);
  }

  /**
   * Gets the results of a completed batch.
   * @param {string} batchId - Batch identifier
   * @returns {Promise<BatchResult[]>>} Batch results
   */
  async getBatchResults(batchId) {
    if (!batchId) {
      throw new Error('Batch ID is required');
    }

    const response = await this._request(`/messages/batches/${batchId}/results`);
    return response.results || [];
  }

  /**
   * Cancels a batch job.
   * @param {string} batchId - Batch identifier
   * @returns {Promise<BatchStatus>} Updated batch status
   */
  async cancelBatch(batchId) {
    if (!batchId) {
      throw new Error('Batch ID is required');
    }

    return this._request(`/messages/batches/${batchId}/cancel`, {
      method: 'POST',
    });
  }

  /**
   * Lists batch jobs with optional filtering.
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {number} [filters.limit=20] - Maximum results
   * @param {string} [filters.before_id] - Pagination cursor
   * @returns {Promise<{batches: BatchStatus[], has_more: boolean}>} List of batches
   */
  async listBatches(filters = {}) {
    const params = new URLSearchParams();

    if (filters.status) {
      params.append('status', filters.status);
    }
    if (filters.limit) {
      params.append('limit', String(Math.min(filters.limit, 100)));
    }
    if (filters.before_id) {
      params.append('before_id', filters.before_id);
    }

    const queryString = params.toString();
    const endpoint = `/messages/batches${queryString ? `?${queryString}` : ''}`;

    return this._request(endpoint);
  }
}

export default BatchProcessor;
