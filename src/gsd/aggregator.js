/**
 * @fileoverview Results Aggregation Module for GSD Infrastructure
 * @module gsd/aggregator
 */

/**
 * Aggregation strategies enum
 * @readonly
 * @enum {string}
 */
export const AggregationStrategies = {
  /** Concatenate results into an array */
  CONCAT: 'CONCAT',
  /** Deep merge objects */
  MERGE: 'MERGE',
  /** Sum numeric values */
  SUM: 'SUM',
  /** Calculate average of numeric values */
  AVG: 'AVG',
  /** Vote-based selection (majority wins) */
  VOTE: 'VOTE',
  /** Select best result based on score/rank */
  BEST: 'BEST'
};

/**
 * Result item with optional metadata
 * @typedef {Object} ResultItem
 * @property {*} value - The result value
 * @property {number} [score] - Score for BEST strategy
 * @property {number} [weight=1] - Weight for weighted aggregation
 * @property {boolean} [partial=false] - Whether this is a partial result
 */

/**
 * Aggregation options
 * @typedef {Object} AggregationOptions
 * @property {string} [strategy] - Aggregation strategy to use
 * @property {Function} [comparator] - Custom comparator for BEST strategy
 * @property {Function} [mergeCustomizer] - Custom merge function for MERGE strategy
 * @property {number} [minVotes=1] - Minimum votes required for VOTE strategy
 * @property {boolean} [ignorePartial=false] - Whether to ignore partial results
 */

/**
 * Results Aggregator with multiple strategies
 */
export class Aggregator {
  /**
   * Create an Aggregator instance
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.defaultStrategy=AggregationStrategies.CONCAT] - Default strategy
   * @param {boolean} [options.throwOnEmpty=true] - Throw error on empty results
   */
  constructor(options = {}) {
    this.defaultStrategy = options.defaultStrategy || AggregationStrategies.CONCAT;
    this.throwOnEmpty = options.throwOnEmpty ?? true;
    this.strategies = new Map();
    
    // Register built-in strategies
    this._registerBuiltInStrategies();
  }

  /**
   * Register built-in aggregation strategies
   * @private
   */
  _registerBuiltInStrategies() {
    this.strategies.set(AggregationStrategies.CONCAT, this._concat.bind(this));
    this.strategies.set(AggregationStrategies.MERGE, this._merge.bind(this));
    this.strategies.set(AggregationStrategies.SUM, this._sum.bind(this));
    this.strategies.set(AggregationStrategies.AVG, this._avg.bind(this));
    this.strategies.set(AggregationStrategies.VOTE, this._vote.bind(this));
    this.strategies.set(AggregationStrategies.BEST, this._best.bind(this));
  }

  /**
   * Filter out partial results if needed
   * @param {Array<ResultItem|*>} results - Input results
   * @param {boolean} ignorePartial - Whether to ignore partial results
   * @returns {Array<ResultItem|*>} Filtered results
   * @private
   */
  _filterPartial(results, ignorePartial) {
    if (!ignorePartial) return results;
    return results.filter(r => !r || typeof r !== 'object' || !r.partial);
  }

  /**
   * Normalize results to ResultItem format
   * @param {Array<*>} results - Raw results
   * @returns {Array<ResultItem>} Normalized results
   * @private
   */
  _normalizeResults(results) {
    return results.map(r => {
      if (r && typeof r === 'object' && 'value' in r) {
        return { weight: 1, partial: false, ...r };
      }
      return { value: r, weight: 1, partial: false };
    });
  }

  /**
   * CONCAT strategy: Concatenate all values into an array
   * @param {Array<ResultItem>} results - Normalized results
   * @returns {Array<*>} Concatenated array
   * @private
   */
  _concat(results) {
    return results.map(r => r.value);
  }

  /**
   * Deep merge objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @param {Function} [customizer] - Custom merge function
   * @returns {Object} Merged object
   * @private
   */
  _deepMerge(target, source, customizer) {
    if (customizer) {
      const result = customizer(target, source);
      if (result !== undefined) return result;
    }

    if (typeof target !== 'object' || target === null) return source;
    if (typeof source !== 'object' || source === null) return target;
    if (Array.isArray(target) && Array.isArray(source)) {
      return [...target, ...source];
    }

    const merged = { ...target };
    for (const key of Object.keys(source)) {
      if (key in merged) {
        merged[key] = this._deepMerge(merged[key], source[key], customizer);
      } else {
        merged[key] = source[key];
      }
    }
    return merged;
  }

  /**
   * MERGE strategy: Deep merge all objects
   * @param {Array<ResultItem>} results - Normalized results
   * @param {Object} options - Aggregation options
   * @returns {Object} Merged object
   * @private
   */
  _merge(results, options) {
    const objects = results.map(r => r.value).filter(v => v && typeof v === 'object' && !Array.isArray(v));
    return objects.reduce((acc, obj) => this._deepMerge(acc, obj, options.mergeCustomizer), {});
  }

  /**
   * SUM strategy: Sum numeric values
   * @param {Array<ResultItem>} results - Normalized results
   * @returns {number} Sum of values
   * @private
   */
  _sum(results) {
    return results.reduce((acc, r) => {
      const val = Number(r.value) || 0;
      return acc + val * r.weight;
    }, 0);
  }

  /**
   * AVG strategy: Calculate weighted average
   * @param {Array<ResultItem>} results - Normalized results
   * @returns {number} Weighted average
   * @private
   */
  _avg(results) {
    const valid = results.filter(r => typeof r.value === 'number');
    if (valid.length === 0) return 0;
    
    const { weightedSum, totalWeight } = valid.reduce(
      (acc, r) => ({
        weightedSum: acc.weightedSum + r.value * r.weight,
        totalWeight: acc.totalWeight + r.weight
      }),
      { weightedSum: 0, totalWeight: 0 }
    );
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * VOTE strategy: Select value with most votes
   * @param {Array<ResultItem>} results - Normalized results
   * @param {Object} options - Aggregation options
   * @returns {*} Most voted value
   * @private
   */
  _vote(results, options) {
    const votes = new Map();
    const minVotes = options.minVotes ?? 1;
    
    for (const r of results) {
      const key = JSON.stringify(r.value);
      const current = votes.get(key) || { value: r.value, count: 0, weight: 0 };
      current.count++;
      current.weight += r.weight;
      votes.set(key, current);
    }
    
    let winner = null;
    let maxWeight = 0;
    
    for (const entry of votes.values()) {
      if (entry.count >= minVotes && entry.weight > maxWeight) {
        maxWeight = entry.weight;
        winner = entry.value;
      }
    }
    
    return winner;
  }

  /**
   * BEST strategy: Select best result based on score
   * @param {Array<ResultItem>} results - Normalized results
   * @param {Object} options - Aggregation options
   * @returns {*} Best result
   * @private
   */
  _best(results, options) {
    const valid = results.filter(r => r.score !== undefined);
    
    if (valid.length === 0) {
      // Fall back to first non-null value
      const first = results.find(r => r.value != null);
      return first?.value ?? null;
    }
    
    const comparator = options.comparator || ((a, b) => b.score - a.score);
    const sorted = [...valid].sort((a, b) => comparator(a, b));
    return sorted[0].value;
  }

  /**
   * Register a custom aggregation strategy
   * @param {string} name - Strategy name
   * @param {Function} handler - Strategy handler function
   */
  registerStrategy(name, handler) {
    this.strategies.set(name, handler);
  }

  /**
   * Unregister a custom aggregation strategy
   * @param {string} name - Strategy name to unregister
   * @returns {boolean} Whether strategy was removed
   */
  unregisterStrategy(name) {
    // Don't allow unregistering built-in strategies
    if (Object.values(AggregationStrategies).includes(name)) {
      return false;
    }
    return this.strategies.delete(name);
  }

  /**
   * Aggregate results using specified strategy
   * @param {Array<ResultItem|*>} results - Results to aggregate
   * @param {string|AggregationOptions} [strategyOrOptions] - Strategy name or options
   * @param {AggregationOptions} [options={}] - Aggregation options
   * @returns {*} Aggregated result
   * @throws {Error} If results are empty and throwOnEmpty is true
   */
  aggregate(results, strategyOrOptions, options = {}) {
    // Parse arguments
    let strategy = this.defaultStrategy;
    let opts = options;
    
    if (typeof strategyOrOptions === 'string') {
      strategy = strategyOrOptions;
    } else if (strategyOrOptions && typeof strategyOrOptions === 'object') {
      opts = { ...strategyOrOptions, ...options };
      strategy = opts.strategy || this.defaultStrategy;
    }
    
    // Validate results
    if (!Array.isArray(results) || results.length === 0) {
      if (this.throwOnEmpty) {
        throw new Error('Cannot aggregate empty results');
      }
      return null;
    }
    
    // Filter partial results if needed
    const filtered = this._filterPartial(results, opts.ignorePartial);
    if (filtered.length === 0) {
      if (this.throwOnEmpty) {
        throw new Error('No non-partial results to aggregate');
      }
      return null;
    }
    
    // Get strategy handler
    const handler = this.strategies.get(strategy);
    if (!handler) {
      throw new Error(`Unknown aggregation strategy: ${strategy}`);
    }
    
    // Normalize and aggregate
    const normalized = this._normalizeResults(filtered);
    return handler(normalized, opts);
  }

  /**
   * Type-specific aggregation helper
   * @param {Array<*>} results - Results to aggregate
   * @param {string} type - Expected type: 'array', 'object', 'number', 'string'
   * @param {string} [strategy] - Override strategy
   * @returns {*} Type-appropriate aggregated result
   */
  aggregateByType(results, type, strategy) {
    const typeStrategies = {
      array: AggregationStrategies.CONCAT,
      object: AggregationStrategies.MERGE,
      number: AggregationStrategies.SUM,
      string: AggregationStrategies.CONCAT
    };
    
    const defaultStrategy = typeStrategies[type] || AggregationStrategies.CONCAT;
    return this.aggregate(results, strategy || defaultStrategy);
  }

  /**
   * Aggregate with partial result handling
   * @param {Array<ResultItem>} results - Results with partial flags
   * @param {string} [strategy] - Aggregation strategy
   * @returns {{result: *, partial: boolean, coverage: number}} Aggregation with metadata
   */
  aggregateWithPartial(results, strategy) {
    const total = results.length;
    const partialCount = results.filter(r => r && typeof r === 'object' && r.partial).length;
    const coverage = total > 0 ? (total - partialCount) / total : 0;
    
    const result = this.aggregate(results, { strategy, ignorePartial: false });
    
    return {
      result,
      partial: partialCount > 0,
      coverage
    };
  }
}

export default Aggregator;
