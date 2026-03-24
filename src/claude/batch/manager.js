/**
 * @fileoverview Batch Job Manager with queue, concurrency, and retry handling.
 * @module claude/batch/manager
 */

import { BatchProcessor } from './index.js';

/**
 * @typedef {Object} QueueJob
 * @property {string} id - Unique job identifier
 * @property {string} batchId - Associated batch ID
 * @property {number} priority - Priority level (1-10, lower is higher)
 * @property {string} status - Job status (pending, processing, completed, failed, cancelled)
 * @property {number} attempts - Number of retry attempts
 * @property {number} maxRetries - Maximum retry attempts
 * @property {Object} data - Job data (requests, options)
 * @property {Object} [result] - Job result
 * @property {Error} [error] - Last error
 * @property {number} createdAt - Timestamp
 * @property {number} [startedAt] - Processing start timestamp
 * @property {number} [completedAt] - Completion timestamp
 */

/**
 * @typedef {Object} ManagerProgress
 * @property {number} total - Total jobs
 * @property {number} pending - Pending jobs
 * @property {number} processing - Processing jobs
 * @property {number} completed - Completed jobs
 * @property {number} failed - Failed jobs
 * @property {number} cancelled - Cancelled jobs
 * @property {number} progressPercent - Completion percentage
 */

/**
 * BatchManager handles job queuing, processing, and lifecycle management.
 * Supports priority queues, concurrency limits, and automatic retries.
 */
export class BatchManager {
  /**
   * @param {Object} config
   * @param {string} config.apiKey - Anthropic API key
   * @param {number} [config.concurrency=3] - Max concurrent batch jobs
   * @param {number} [config.maxRetries=3] - Default max retry attempts
   * @param {number} [config.pollInterval=5000] - Status poll interval in ms
   * @param {number} [config.retryDelay=1000] - Delay between retries in ms
   */
  constructor(config) {
    this.processor = new BatchProcessor({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeout: config.timeout,
    });

    this.concurrency = config.concurrency || 3;
    this.maxRetries = config.maxRetries || 3;
    this.pollInterval = config.pollInterval || 5000;
    this.retryDelay = config.retryDelay || 1000;

    /** @type {Map<string, QueueJob>} */
    this.jobs = new Map();

    /** @type {Set<string>} */
    this.processingJobs = new Set();

    /** @type {Set<string>} */
    this.pollingIntervals = new Set();

    this.isRunning = false;
    this.processingPromise = null;
  }

  /**
   * Generates a unique job ID.
   * @private
   * @returns {string} Unique identifier
   */
  _generateId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delays execution.
   * @private
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Adds a job to the queue.
   * @param {Object} jobData - Job data
   * @param {Object} jobData.requests - Batch requests
   * @param {Object} [jobData.options] - Additional options
   * @param {number} [jobData.priority=5] - Job priority (1-10)
   * @param {number} [jobData.maxRetries] - Override default max retries
   * @returns {string} Job ID
   */
  enqueue(jobData) {
    const id = this._generateId();

    /** @type {QueueJob} */
    const job = {
      id,
      batchId: null,
      priority: jobData.priority ?? 5,
      status: 'pending',
      attempts: 0,
      maxRetries: jobData.maxRetries ?? this.maxRetries,
      data: {
        requests: jobData.requests,
        options: jobData.options || {},
      },
      createdAt: Date.now(),
    };

    this.jobs.set(id, job);

    if (this.isRunning) {
      this._processQueue();
    }

    return id;
  }

  /**
   * Gets a job by ID.
   * @param {string} jobId - Job identifier
   * @returns {QueueJob|undefined} Job or undefined
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Gets all jobs.
   * @param {Object} [filters] - Optional filters
   * @param {string} [filters.status] - Filter by status
   * @returns {QueueJob[]} Array of jobs
   */
  getJobs(filters = {}) {
    let jobs = Array.from(this.jobs.values());

    if (filters.status) {
      jobs = jobs.filter((job) => job.status === filters.status);
    }

    return jobs;
  }

  /**
   * Gets current progress statistics.
   * @returns {ManagerProgress} Progress information
   */
  getProgress() {
    const jobs = Array.from(this.jobs.values());
    const total = jobs.length;
    const pending = jobs.filter((j) => j.status === 'pending').length;
    const processing = jobs.filter((j) => j.status === 'processing').length;
    const completed = jobs.filter((j) => j.status === 'completed').length;
    const failed = jobs.filter((j) => j.status === 'failed').length;
    const cancelled = jobs.filter((j) => j.status === 'cancelled').length;

    return {
      total,
      pending,
      processing,
      completed,
      failed,
      cancelled,
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  /**
   * Starts the job processor.
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.processingPromise = this._processLoop();
  }

  /**
   * Stops the job processor and cleans up resources.
   * @param {Object} [options]
   * @param {boolean} [options.cancelRunning=false] - Cancel running jobs
   * @returns {Promise<void>}
   */
  async stop(options = {}) {
    this.isRunning = false;

    // Clear all polling intervals
    this.pollingIntervals.forEach((intervalId) => clearInterval(intervalId));
    this.pollingIntervals.clear();

    // Cancel running jobs if requested
    if (options.cancelRunning) {
      const running = this.getJobs({ status: 'processing' });
      await Promise.all(
        running.map((job) => this.cancelJob(job.id).catch(() => {}))
      );
    }

    // Wait for processing loop to complete
    if (this.processingPromise) {
      await this.processingPromise.catch(() => {});
      this.processingPromise = null;
    }
  }

  /**
   * Main processing loop.
   * @private
   */
  async _processLoop() {
    while (this.isRunning) {
      await this._processQueue();
      await this._delay(100);
    }
  }

  /**
   * Processes the job queue with concurrency limit.
   * @private
   */
  async _processQueue() {
    const availableSlots = this.concurrency - this.processingJobs.size;
    if (availableSlots <= 0) return;

    // Get pending jobs sorted by priority
    const pendingJobs = this.getJobs({ status: 'pending' }).sort(
      (a, b) => a.priority - b.priority
    );

    const jobsToProcess = pendingJobs.slice(0, availableSlots);

    await Promise.all(
      jobsToProcess.map((job) => this._processJob(job.id))
    );
  }

  /**
   * Processes a single job.
   * @private
   * @param {string} jobId - Job identifier
   */
  async _processJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'pending') return;

    job.status = 'processing';
    job.startedAt = Date.now();
    job.attempts++;
    this.processingJobs.add(jobId);

    try {
      // Create batch
      const batch = await this.processor.createBatch(job.data.requests);
      job.batchId = batch.id;

      // Start polling for status
      await this._pollBatchStatus(jobId);
    } catch (error) {
      await this._handleJobError(jobId, error);
    } finally {
      this.processingJobs.delete(jobId);
    }
  }

  /**
   * Polls batch status until completion.
   * @private
   * @param {string} jobId - Job identifier
   */
  async _pollBatchStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    return new Promise((resolve) => {
      const poll = async () => {
        try {
          const status = await this.processor.getBatchStatus(job.batchId);

          if (status.status === 'completed') {
            const results = await this.processor.getBatchResults(job.batchId);
            job.status = 'completed';
            job.result = {
              status,
              results,
            };
            job.completedAt = Date.now();
            clearInterval(intervalId);
            this.pollingIntervals.delete(intervalId);
            resolve();
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            throw new Error(`Batch ${status.status}: ${status.error || 'Unknown error'}`);
          }
        } catch (error) {
          clearInterval(intervalId);
          this.pollingIntervals.delete(intervalId);
          await this._handleJobError(jobId, error);
          resolve();
        }
      };

      const intervalId = setInterval(poll, this.pollInterval);
      this.pollingIntervals.add(intervalId);
      poll(); // Initial check
    });
  }

  /**
   * Handles job errors with retry logic.
   * @private
   * @param {string} jobId - Job identifier
   * @param {Error} error - Error object
   */
  async _handleJobError(jobId, error) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.error = error;

    if (job.attempts < job.maxRetries) {
      // Retry
      job.status = 'pending';
      await this._delay(this.retryDelay * job.attempts);
    } else {
      // Max retries reached
      job.status = 'failed';
      job.completedAt = Date.now();
    }
  }

  /**
   * Cancels a job.
   * @param {string} jobId - Job identifier
   * @returns {Promise<boolean>} True if cancelled
   */
  async cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'completed' || job.status === 'failed') {
      return false;
    }

    if (job.batchId) {
      try {
        await this.processor.cancelBatch(job.batchId);
      } catch (error) {
        // Batch may already be complete
      }
    }

    job.status = 'cancelled';
    job.completedAt = Date.now();
    this.processingJobs.delete(jobId);

    return true;
  }

  /**
   * Retries a failed job.
   * @param {string} jobId - Job identifier
   * @returns {boolean} True if queued for retry
   */
  retryJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'failed') return false;

    job.status = 'pending';
    job.attempts = 0;
    job.error = null;
    job.result = null;
    job.completedAt = null;

    if (this.isRunning) {
      this._processQueue();
    }

    return true;
  }

  /**
   * Removes a job from the queue.
   * @param {string} jobId - Job identifier
   * @returns {boolean} True if removed
   */
  removeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'processing') return false;

    this.jobs.delete(jobId);
    return true;
  }

  /**
   * Clears completed and failed jobs.
   * @returns {number} Number of jobs cleared
   */
  clearCompleted() {
    let cleared = 0;
    for (const [id, job] of this.jobs) {
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        this.jobs.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Aggregates results from completed jobs.
   * @param {Object} [options]
   * @param {string[]} [options.jobIds] - Specific job IDs to aggregate
   * @returns {Object} Aggregated results
   */
  aggregateResults(options = {}) {
    const jobs = options.jobIds
      ? options.jobIds.map((id) => this.jobs.get(id)).filter(Boolean)
      : this.getJobs({ status: 'completed' });

    const allResults = [];
    const errors = [];

    for (const job of jobs) {
      if (job.result?.results) {
        allResults.push(...job.result.results);
      }
    }

    const failedJobs = this.getJobs({ status: 'failed' });
    for (const job of failedJobs) {
      if (job.error) {
        errors.push({
          jobId: job.id,
          error: job.error.message,
        });
      }
    }

    return {
      total: allResults.length,
      results: allResults,
      errors,
      timestamp: Date.now(),
    };
  }
}

export default BatchManager;
