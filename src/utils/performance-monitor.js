/**
 * @fileoverview Performance Monitoring Utility
 * @module utils/performance-monitor
 * @description Performance monitoring and metrics collection
 * @version 5.0.0
 */

import { EventEmitter } from 'events';
import { globalQueryCache } from '../db/query-cache.js';

/**
 * Performance metrics
 * @typedef {Object} PerformanceMetrics
 * @property {Object} database - Database metrics
 * @property {Object} cache - Cache metrics
 * @property {Object} requests - Request metrics
 * @property {Object} websocket - WebSocket metrics
 * @property {Object} memory - Memory metrics
 */

/**
 * Performance Monitor
 * @extends EventEmitter
 */
export class PerformanceMonitor extends EventEmitter {
  #metrics;
  #interval;
  #config;
  #histograms;
  #counters;

  /**
   * Create a new PerformanceMonitor
   * @param {Object} [config={}] - Configuration
   */
  constructor(config = {}) {
    super();
    
    this.#config = {
      collectionInterval: config.collectionInterval || 30000, // 30 seconds
      retentionPeriod: config.retentionPeriod || 3600000, // 1 hour
      slowQueryThreshold: config.slowQueryThreshold || 100, // 100ms
      slowRequestThreshold: config.slowRequestThreshold || 500, // 500ms
      ...config
    };

    this.#metrics = {
      database: {
        queries: [],
        slowQueries: [],
        avgQueryTime: 0,
        totalQueries: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0
      },
      requests: {
        total: 0,
        errors: 0,
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0
      },
      websocket: {
        connections: 0,
        messagesSent: 0,
        messagesReceived: 0,
        avgLatency: 0
      },
      memory: {
        used: 0,
        total: 0,
        external: 0
      }
    };

    this.#histograms = new Map();
    this.#counters = new Map();

    this.#startCollection();
  }

  /**
   * Start metrics collection
   * @private
   */
  #startCollection() {
    this.#interval = setInterval(() => {
      this.#collectMetrics();
    }, this.#config.collectionInterval);

    // Initial collection
    this.#collectMetrics();
  }

  /**
   * Collect current metrics
   * @private
   */
  #collectMetrics() {
    // Memory metrics
    if (global.gc) {
      global.gc();
    }
    
    const memUsage = process.memoryUsage();
    this.#metrics.memory = {
      used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024) // MB
    };

    // Cache metrics
    const cacheStats = globalQueryCache.getStats();
    this.#metrics.cache = {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: cacheStats.hitRate,
      size: cacheStats.size
    };

    // Cleanup old metrics
    this.#cleanupOldMetrics();

    this.emit('metrics', this.#metrics);
  }

  /**
   * Cleanup old metrics
   * @private
   */
  #cleanupOldMetrics() {
    const cutoff = Date.now() - this.#config.retentionPeriod;

    // Cleanup database metrics
    this.#metrics.database.queries = this.#metrics.database.queries.filter(
      q => q.timestamp > cutoff
    );
    this.#metrics.database.slowQueries = this.#metrics.database.slowQueries.filter(
      q => q.timestamp > cutoff
    );
  }

  /**
   * Record a database query
   * @param {string} sql - SQL query
   * @param {number} duration - Duration in milliseconds
   * @param {Array} [params] - Query parameters
   */
  recordQuery(sql, duration, params = []) {
    const query = {
      sql: sql.substring(0, 200), // Truncate for storage
      duration,
      timestamp: Date.now(),
      params: params.length
    };

    this.#metrics.database.queries.push(query);
    this.#metrics.database.totalQueries++;

    // Track slow queries
    if (duration > this.#config.slowQueryThreshold) {
      this.#metrics.database.slowQueries.push(query);
      this.emit('slowQuery', query);
    }

    // Update average
    const recentQueries = this.#metrics.database.queries.slice(-100);
    this.#metrics.database.avgQueryTime = 
      recentQueries.reduce((a, b) => a + b.duration, 0) / recentQueries.length;

    this.recordHistogram('query_duration', duration);
  }

  /**
   * Record an HTTP request
   * @param {Object} request - Request details
   * @param {number} duration - Duration in milliseconds
   * @param {number} statusCode - HTTP status code
   */
  recordRequest(request, duration, statusCode) {
    this.#metrics.requests.total++;

    if (statusCode >= 400) {
      this.#metrics.requests.errors++;
    }

    // Update response time stats
    this.recordHistogram('response_time', duration);

    // Calculate percentiles
    const times = this.#histograms.get('response_time') || [];
    if (times.length > 0) {
      const sorted = [...times].sort((a, b) => a - b);
      this.#metrics.requests.p95ResponseTime = this.#percentile(sorted, 0.95);
      this.#metrics.requests.p99ResponseTime = this.#percentile(sorted, 0.99);
      this.#metrics.requests.avgResponseTime = 
        sorted.reduce((a, b) => a + b, 0) / sorted.length;
    }

    if (duration > this.#config.slowRequestThreshold) {
      this.emit('slowRequest', { request, duration, statusCode });
    }
  }

  /**
   * Record WebSocket metrics
   * @param {Object} metrics - WebSocket metrics
   */
  recordWebSocket(metrics) {
    Object.assign(this.#metrics.websocket, metrics);
  }

  /**
   * Record histogram value
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   */
  recordHistogram(name, value) {
    if (!this.#histograms.has(name)) {
      this.#histograms.set(name, []);
    }
    
    const values = this.#histograms.get(name);
    values.push(value);
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
  }

  /**
   * Increment a counter
   * @param {string} name - Counter name
   * @param {number} [value=1] - Value to increment by
   */
  incrementCounter(name, value = 1) {
    const current = this.#counters.get(name) || 0;
    this.#counters.set(name, current + value);
  }

  /**
   * Get counter value
   * @param {string} name - Counter name
   * @returns {number}
   */
  getCounter(name) {
    return this.#counters.get(name) || 0;
  }

  /**
   * Calculate percentile
   * @private
   * @param {number[]} sorted - Sorted array
   * @param {number} p - Percentile (0-1)
   * @returns {number}
   */
  #percentile(sorted, p) {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get all metrics
   * @returns {PerformanceMetrics}
   */
  getMetrics() {
    return {
      ...this.#metrics,
      histograms: Object.fromEntries(
        Array.from(this.#histograms.entries()).map(([k, v]) => [
          k, {
            count: v.length,
            avg: v.reduce((a, b) => a + b, 0) / v.length,
            min: Math.min(...v),
            max: Math.max(...v),
            p95: this.#percentile([...v].sort((a, b) => a - b), 0.95)
          }
        ])
      ),
      counters: Object.fromEntries(this.#counters),
      uptime: process.uptime()
    };
  }

  /**
   * Get performance summary
   * @returns {Object}
   */
  getSummary() {
    const metrics = this.getMetrics();
    
    return {
      database: {
        totalQueries: metrics.database.totalQueries,
        avgQueryTime: metrics.database.avgQueryTime.toFixed(2) + 'ms',
        slowQueries: metrics.database.slowQueries.length
      },
      cache: {
        hitRate: (metrics.cache.hitRate * 100).toFixed(2) + '%',
        size: metrics.cache.size
      },
      requests: {
        total: metrics.requests.total,
        errors: metrics.requests.errors,
        errorRate: metrics.requests.total > 0 
          ? (metrics.requests.errors / metrics.requests.total * 100).toFixed(2) + '%'
          : '0%',
        avgResponseTime: metrics.requests.avgResponseTime.toFixed(2) + 'ms',
        p95ResponseTime: metrics.requests.p95ResponseTime.toFixed(2) + 'ms'
      },
      memory: {
        used: metrics.memory.used + 'MB',
        total: metrics.memory.total + 'MB',
        rss: metrics.memory.rss + 'MB'
      },
      websocket: metrics.websocket,
      uptime: Math.floor(metrics.uptime / 60) + ' minutes'
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.#metrics = {
      database: {
        queries: [],
        slowQueries: [],
        avgQueryTime: 0,
        totalQueries: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0
      },
      requests: {
        total: 0,
        errors: 0,
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0
      },
      websocket: {
        connections: 0,
        messagesSent: 0,
        messagesReceived: 0,
        avgLatency: 0
      },
      memory: {
        used: 0,
        total: 0,
        external: 0
      }
    };

    this.#histograms.clear();
    this.#counters.clear();
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
  }

  /**
   * Create middleware for Express to track requests
   * @returns {Function}
   */
  createMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.recordRequest(
          { method: req.method, path: req.path },
          duration,
          res.statusCode
        );
      });
      
      next();
    };
  }
}

// Global instance
let globalMonitor = null;

/**
 * Get global performance monitor
 * @returns {PerformanceMonitor}
 */
export function getPerformanceMonitor() {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

/**
 * Set global performance monitor
 * @param {PerformanceMonitor} monitor
 */
export function setPerformanceMonitor(monitor) {
  globalMonitor = monitor;
}

export default PerformanceMonitor;
