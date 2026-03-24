/**
 * @fileoverview Quality metrics tracking for RAG system
 * @module analysis/rag-metrics
 */

/**
 * @typedef {Object} QueryMetrics
 * @property {string} queryId - Unique query identifier
 * @property {string} query - Query text
 * @property {number} latencyMs - Total query latency
 * @property {number} retrievalLatencyMs - Document retrieval latency
 * @property {number} embeddingLatencyMs - Embedding generation latency
 * @property {number} resultCount - Number of results returned
 * @property {number} timestamp - Query timestamp
 */

/**
 * @typedef {Object} EvaluationMetrics
 * @property {number} recallAtK - Recall@K score
 * @property {number} precisionAtK - Precision@K score
 * @property {number} ndcg - NDCG score
 * @property {number} mrr - Mean Reciprocal Rank
 */

/**
 * Metrics collector for RAG system performance tracking
 */
export class MetricsCollector {
  /**
   * Creates a new MetricsCollector
   * @param {Object} options - Configuration options
   * @param {number} [options.maxHistory=10000] - Maximum metrics history size
   * @param {boolean} [options.enableDetailedTracking=true] - Enable per-query tracking
   */
  constructor(options = {}) {
    this.maxHistory = options.maxHistory ?? 10000;
    this.enableDetailedTracking = options.enableDetailedTracking ?? true;

    /** @type {QueryMetrics[]} */
    this.queryHistory = [];
    
    /** @type {Map<string, Object>} */
    this.activeQueries = new Map();

    // Aggregated statistics
    this.stats = {
      totalQueries: 0,
      totalLatencyMs: 0,
      totalRetrievalLatencyMs: 0,
      totalEmbeddingLatencyMs: 0,
      totalResults: 0,
      errors: 0
    };

    // Evaluation tracking
    /** @type {EvaluationMetrics[]} */
    this.evaluations = [];
  }

  /**
   * Start tracking a new query
   * @param {string} queryId - Unique query identifier
   * @param {string} query - Query text
   * @returns {Object} Query context for tracking
   */
  startQuery(queryId, query) {
    const context = {
      queryId,
      query,
      startTime: performance.now(),
      stages: {}
    };

    this.activeQueries.set(queryId, context);
    this.stats.totalQueries++;

    return context;
  }

  /**
   * Record the start of a query stage
   * @param {string} queryId - Query identifier
   * @param {string} stageName - Name of the stage (e.g., 'embedding', 'retrieval')
   */
  startStage(queryId, stageName) {
    const context = this.activeQueries.get(queryId);
    if (!context) return;

    context.stages[stageName] = {
      startTime: performance.now()
    };
  }

  /**
   * Record the end of a query stage
   * @param {string} queryId - Query identifier
   * @param {string} stageName - Name of the stage
   * @param {Object} [metadata] - Additional metadata
   */
  endStage(queryId, stageName, metadata = {}) {
    const context = this.activeQueries.get(queryId);
    if (!context || !context.stages[stageName]) return;

    const stage = context.stages[stageName];
    stage.endTime = performance.now();
    stage.latencyMs = stage.endTime - stage.startTime;
    stage.metadata = metadata;
  }

  /**
   * Complete query tracking and record metrics
   * @param {string} queryId - Query identifier
   * @param {Object} result - Query result
   * @param {number} result.resultCount - Number of results
   * @param {boolean} [result.success=true] - Whether query succeeded
   * @returns {QueryMetrics|null} Recorded metrics
   */
  endQuery(queryId, result = {}) {
    const context = this.activeQueries.get(queryId);
    if (!context) return null;

    const endTime = performance.now();
    const totalLatency = endTime - context.startTime;

    const metrics = {
      queryId,
      query: context.query,
      latencyMs: totalLatency,
      retrievalLatencyMs: context.stages.retrieval?.latencyMs ?? 0,
      embeddingLatencyMs: context.stages.embedding?.latencyMs ?? 0,
      resultCount: result.resultCount ?? 0,
      timestamp: Date.now(),
      success: result.success !== false,
      stages: { ...context.stages }
    };

    // Update statistics
    this.stats.totalLatencyMs += totalLatency;
    this.stats.totalRetrievalLatencyMs += metrics.retrievalLatencyMs;
    this.stats.totalEmbeddingLatencyMs += metrics.embeddingLatencyMs;
    this.stats.totalResults += metrics.resultCount;
    
    if (!metrics.success) {
      this.stats.errors++;
    }

    // Store in history
    if (this.enableDetailedTracking) {
      this.queryHistory.push(metrics);
      
      // Trim history if needed
      if (this.queryHistory.length > this.maxHistory) {
        this.queryHistory = this.queryHistory.slice(-this.maxHistory);
      }
    }

    this.activeQueries.delete(queryId);
    return metrics;
  }

  /**
   * Record an error for a query
   * @param {string} queryId - Query identifier
   * @param {Error} error - Error object
   */
  recordError(queryId, error) {
    this.endQuery(queryId, { success: false, error: error.message });
  }

  /**
   * Calculate Recall@K
   * @param {string[]} retrieved - Retrieved document IDs
   * @param {string[]} relevant - Relevant document IDs
   * @param {number} k - K value
   * @returns {number} Recall@K score (0-1)
   */
  static calculateRecallAtK(retrieved, relevant, k) {
    if (!relevant || relevant.length === 0) return 0;
    
    const retrievedK = retrieved.slice(0, k);
    const relevantSet = new Set(relevant);
    const relevantRetrieved = retrievedK.filter(id => relevantSet.has(id)).length;
    
    return relevantRetrieved / relevant.length;
  }

  /**
   * Calculate Precision@K
   * @param {string[]} retrieved - Retrieved document IDs
   * @param {string[]} relevant - Relevant document IDs
   * @param {number} k - K value
   * @returns {number} Precision@K score (0-1)
   */
  static calculatePrecisionAtK(retrieved, relevant, k) {
    if (k === 0) return 0;
    
    const retrievedK = retrieved.slice(0, k);
    if (retrievedK.length === 0) return 0;
    
    const relevantSet = new Set(relevant);
    const relevantRetrieved = retrievedK.filter(id => relevantSet.has(id)).length;
    
    return relevantRetrieved / retrievedK.length;
  }

  /**
   * Calculate NDCG (Normalized Discounted Cumulative Gain)
   * @param {string[]} retrieved - Retrieved document IDs
   * @param {Object} relevanceScores - Map of docId to relevance score
   * @param {number} k - K value
   * @returns {number} NDCG score (0-1)
   */
  static calculateNDCG(retrieved, relevanceScores, k) {
    const retrievedK = retrieved.slice(0, k);
    if (retrievedK.length === 0) return 0;

    // Calculate DCG
    let dcg = 0;
    for (let i = 0; i < retrievedK.length; i++) {
      const rel = relevanceScores[retrievedK[i]] ?? 0;
      dcg += rel / Math.log2(i + 2); // +2 because i starts at 0
    }

    // Calculate ideal DCG
    const idealRels = Object.values(relevanceScores).sort((a, b) => b - a).slice(0, k);
    let idcg = 0;
    for (let i = 0; i < idealRels.length; i++) {
      idcg += idealRels[i] / Math.log2(i + 2);
    }

    return idcg === 0 ? 0 : dcg / idcg;
  }

  /**
   * Calculate Mean Reciprocal Rank (MRR)
   * @param {string[][]} rankedLists - Array of ranked document ID lists
   * @param {string[][]} relevantLists - Array of relevant document ID lists
   * @returns {number} MRR score
   */
  static calculateMRR(rankedLists, relevantLists) {
    if (rankedLists.length === 0) return 0;

    let sumRR = 0;
    
    for (let i = 0; i < rankedLists.length; i++) {
      const ranked = rankedLists[i];
      const relevant = new Set(relevantLists[i]);
      
      let rank = 0;
      for (let j = 0; j < ranked.length; j++) {
        if (relevant.has(ranked[j])) {
          rank = j + 1;
          break;
        }
      }
      
      if (rank > 0) {
        sumRR += 1 / rank;
      }
    }

    return sumRR / rankedLists.length;
  }

  /**
   * Record evaluation metrics for a query
   * @param {string} queryId - Query identifier
   * @param {EvaluationMetrics} metrics - Evaluation metrics
   */
  recordEvaluation(queryId, metrics) {
    this.evaluations.push({
      queryId,
      ...metrics,
      timestamp: Date.now()
    });
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance statistics
   */
  getStats() {
    const avgLatency = this.stats.totalQueries > 0 
      ? this.stats.totalLatencyMs / this.stats.totalQueries 
      : 0;
    
    const avgRetrievalLatency = this.stats.totalQueries > 0
      ? this.stats.totalRetrievalLatencyMs / this.stats.totalQueries
      : 0;

    const avgEmbeddingLatency = this.stats.totalQueries > 0
      ? this.stats.totalEmbeddingLatencyMs / this.stats.totalQueries
      : 0;

    return {
      totalQueries: this.stats.totalQueries,
      errors: this.stats.errors,
      errorRate: this.stats.totalQueries > 0 ? this.stats.errors / this.stats.totalQueries : 0,
      averageLatencyMs: avgLatency,
      averageRetrievalLatencyMs: avgRetrievalLatency,
      averageEmbeddingLatencyMs: avgEmbeddingLatency,
      averageResultsPerQuery: this.stats.totalQueries > 0 
        ? this.stats.totalResults / this.stats.totalQueries 
        : 0,
      p95LatencyMs: this._calculatePercentile(95),
      p99LatencyMs: this._calculatePercentile(99)
    };
  }

  /**
   * Calculate latency percentile
   * @private
   * @param {number} percentile - Percentile to calculate
   * @returns {number} Latency at percentile
   */
  _calculatePercentile(percentile) {
    if (this.queryHistory.length === 0) return 0;
    
    const latencies = this.queryHistory
      .map(m => m.latencyMs)
      .sort((a, b) => a - b);
    
    const index = Math.ceil((percentile / 100) * latencies.length) - 1;
    return latencies[Math.max(0, index)];
  }

  /**
   * Get evaluation summary
   * @returns {Object} Evaluation summary
   */
  getEvaluationSummary() {
    if (this.evaluations.length === 0) {
      return null;
    }

    const avg = (key) => this.evaluations.reduce((sum, e) => sum + (e[key] ?? 0), 0) / this.evaluations.length;

    return {
      totalEvaluations: this.evaluations.length,
      averageRecallAtK: avg('recallAtK'),
      averagePrecisionAtK: avg('precisionAtK'),
      averageNDCG: avg('ndcg'),
      averageMRR: avg('mrr')
    };
  }

  /**
   * Get recent query history
   * @param {number} [limit=100] - Number of recent queries
   * @returns {QueryMetrics[]} Recent queries
   */
  getRecentQueries(limit = 100) {
    return this.queryHistory.slice(-limit);
  }

  /**
   * Export metrics to JSON
   * @returns {string} JSON string
   */
  exportToJSON() {
    return JSON.stringify({
      stats: this.getStats(),
      evaluations: this.getEvaluationSummary(),
      queries: this.queryHistory
    }, null, 2);
  }

  /**
   * Export metrics to CSV
   * @returns {string} CSV string
   */
  exportQueriesToCSV() {
    if (this.queryHistory.length === 0) return '';

    const headers = ['queryId', 'query', 'latencyMs', 'retrievalLatencyMs', 'embeddingLatencyMs', 'resultCount', 'timestamp'];
    const rows = this.queryHistory.map(q => [
      q.queryId,
      `"${q.query.replace(/"/g, '""')}"`,
      q.latencyMs,
      q.retrievalLatencyMs,
      q.embeddingLatencyMs,
      q.resultCount,
      new Date(q.timestamp).toISOString()
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * Clear all metrics history
   */
  clear() {
    this.queryHistory = [];
    this.evaluations = [];
    this.activeQueries.clear();
    
    this.stats = {
      totalQueries: 0,
      totalLatencyMs: 0,
      totalRetrievalLatencyMs: 0,
      totalEmbeddingLatencyMs: 0,
      totalResults: 0,
      errors: 0
    };
  }
}

export default MetricsCollector;
