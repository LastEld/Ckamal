/**
 * Query Optimizer - Query analysis and optimization
 * @module intelligence/query
 */

/**
 * Query definition
 * @typedef {Object} Query
 * @property {string} type - Query type ('select', 'insert', 'update', 'delete', 'aggregate')
 * @property {string} collection - Target collection/table
 * @property {Object} filter - Query filter/filter
 * @property {Object} [projection] - Field projection
 * @property {Object} [sort] - Sort specification
 * @property {number} [limit] - Result limit
 * @property {number} [skip] - Skip offset
 * @property {string[]} [populate] - Fields to populate
 */

/**
 * Optimized query result
 * @typedef {Object} OptimizedQuery
 * @property {Query} query - Optimized query
 * @property {string[]} appliedOptimizations - List of applied optimizations
 * @property {number} estimatedComplexity - Query complexity score
 * @property {number} estimatedCost - Estimated execution cost
 * @property {IndexSuggestion[]} indexSuggestions - Suggested indexes
 */

/**
 * Index suggestion
 * @typedef {Object} IndexSuggestion
 * @property {string} collection - Target collection
 * @property {string[]} fields - Index fields
 * @property {string} type - Index type ('single', 'compound', 'text', 'hashed')
 * @property {number} impact - Performance impact score (0-1)
 * @property {string} reason - Reason for suggestion
 */

/**
 * Complexity estimate
 * @typedef {Object} ComplexityEstimate
 * @property {number} score - Complexity score (0-100)
 * @property {string} level - Complexity level ('low', 'medium', 'high', 'extreme')
 * @property {string[]} factors - Contributing factors
 */

/**
 * Query Optimizer for database query analysis and optimization
 */
export class QueryOptimizer {
  /**
   * Create a Query Optimizer
   * @param {Object} options - Configuration options
   * @param {Object} options.costModel - Cost model configuration
   * @param {number} options.complexityThreshold - Complexity warning threshold
   */
  constructor(options = {}) {
    this.costModel = options.costModel || this.getDefaultCostModel();
    this.complexityThreshold = options.complexityThreshold || 50;
    this.queryHistory = [];
    this.indexStats = new Map();
  }

  /**
   * Get default cost model
   * @private
   * @returns {Object} Cost model
   */
  getDefaultCostModel() {
    return {
      baseCost: 1,
      filterCost: 2,
      sortCost: 5,
      skipCost: 1,
      limitCost: 0.5,
      joinCost: 10,
      scanCostPerDoc: 0.001,
      indexLookupCost: 0.01,
      memorySortCost: 3
    };
  }

  /**
   * Optimize a query
   * @param {Query} query - Query to optimize
   * @returns {OptimizedQuery} Optimized query with recommendations
   */
  optimize(query) {
    const optimizations = [];
    let optimizedQuery = { ...query };
    
    // Apply optimizations
    const filterOpt = this.optimizeFilter(optimizedQuery);
    if (filterOpt.applied) {
      optimizedQuery = filterOpt.query;
      optimizations.push(...filterOpt.optimizations);
    }
    
    const sortOpt = this.optimizeSort(optimizedQuery);
    if (sortOpt.applied) {
      optimizedQuery = sortOpt.query;
      optimizations.push(...sortOpt.optimizations);
    }
    
    const projectionOpt = this.optimizeProjection(optimizedQuery);
    if (projectionOpt.applied) {
      optimizedQuery = projectionOpt.query;
      optimizations.push(...projectionOpt.optimizations);
    }
    
    const paginationOpt = this.optimizePagination(optimizedQuery);
    if (paginationOpt.applied) {
      optimizedQuery = paginationOpt.query;
      optimizations.push(...paginationOpt.optimizations);
    }
    
    // Generate index suggestions
    const indexSuggestions = this.suggestIndex(optimizedQuery);
    
    // Calculate complexity
    const complexity = this.estimateComplexity(optimizedQuery);
    
    // Estimate cost
    const estimatedCost = this.estimateCost(optimizedQuery, complexity);
    
    const result = {
      query: optimizedQuery,
      appliedOptimizations: optimizations,
      estimatedComplexity: complexity.score,
      estimatedCost,
      indexSuggestions
    };
    
    // Record in history
    this.queryHistory.push({
      timestamp: Date.now(),
      original: query,
      optimized: result
    });
    
    return result;
  }

  /**
   * Suggest indexes for a query
   * @param {Query} query - Query to analyze
   * @returns {IndexSuggestion[]} Index suggestions
   */
  suggestIndex(query) {
    const suggestions = [];
    const { collection, filter, sort } = query;
    
    if (!collection) return suggestions;
    
    // Analyze filter fields
    const filterFields = this.extractFilterFields(filter);
    
    // Suggest compound index for filter + sort
    if (filterFields.length > 0) {
      const fields = [...filterFields];
      
      // Add sort fields not in filter
      if (sort && Object.keys(sort).length > 0) {
        for (const sortField of Object.keys(sort)) {
          if (!fields.includes(sortField)) {
            fields.push(sortField);
          }
        }
      }
      
      if (fields.length > 0) {
        suggestions.push({
          collection,
          fields,
          type: fields.length === 1 ? 'single' : 'compound',
          impact: this.calculateIndexImpact(query, fields),
          reason: `Optimizes filter on [${filterFields.join(', ')}]` +
                  (sort ? ` with sort on [${Object.keys(sort).join(', ')}]` : '')
        });
      }
    }
    
    // Suggest text index for text search patterns
    const textFields = this.detectTextSearchFields(filter);
    if (textFields.length > 0) {
      suggestions.push({
        collection,
        fields: textFields,
        type: 'text',
        impact: 0.7,
        reason: `Supports text search on fields: [${textFields.join(', ')}]`
      });
    }
    
    return suggestions.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Estimate query complexity
   * @param {Query} query - Query to analyze
   * @returns {ComplexityEstimate} Complexity estimate
   */
  estimateComplexity(query) {
    const factors = [];
    let score = 0;
    
    // Filter complexity
    const filterFields = this.extractFilterFields(query.filter);
    if (filterFields.length > 0) {
      score += filterFields.length * 5;
      factors.push(`${filterFields.length} filter field(s)`);
    }
    
    // Check for expensive operators
    const filterStr = JSON.stringify(query.filter || {});
    const expensiveOps = ['$regex', '$where', '$near', '$text', '$search'];
    for (const op of expensiveOps) {
      if (filterStr.includes(op)) {
        score += 20;
        factors.push(`expensive operator: ${op}`);
      }
    }
    
    // Sort complexity
    if (query.sort && Object.keys(query.sort).length > 0) {
      const sortFields = Object.keys(query.sort).length;
      score += sortFields * 10;
      factors.push(`${sortFields} sort field(s)`);
    }
    
    // Pagination impact
    if (query.skip && query.skip > 1000) {
      score += 15;
      factors.push(`large skip: ${query.skip}`);
    }
    
    // Population/join complexity
    if (query.populate && query.populate.length > 0) {
      score += query.populate.length * 15;
      factors.push(`${query.populate.length} population(s)`);
    }
    
    // Limit impact (reduces complexity)
    if (query.limit && query.limit < 100) {
      score -= 5;
      factors.push(`limit: ${query.limit}`);
    }
    
    score = Math.max(0, Math.min(100, score));
    
    let level;
    if (score < 20) level = 'low';
    else if (score < 50) level = 'medium';
    else if (score < 80) level = 'high';
    else level = 'extreme';
    
    return { score, level, factors };
  }

  /**
   * Optimize query filter
   * @private
   * @param {Query} query - Query to optimize
   * @returns {{applied: boolean, query: Query, optimizations: string[]}}
   */
  optimizeFilter(query) {
    const optimizations = [];
    let filter = { ...query.filter };
    let applied = false;
    
    // Remove null/undefined values
    for (const [key, value] of Object.entries(filter)) {
      if (value === null || value === undefined) {
        delete filter[key];
        optimizations.push(`removed null filter: ${key}`);
        applied = true;
      }
    }
    
    // Simplify $in with single value
    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'object' && value.$in && value.$in.length === 1) {
        filter[key] = value.$in[0];
        optimizations.push(`simplified single-value $in: ${key}`);
        applied = true;
      }
    }
    
    // Convert $or with single condition
    if (filter.$or && filter.$or.length === 1) {
      filter = { ...filter, ...filter.$or[0] };
      delete filter.$or;
      optimizations.push('removed single-condition $or');
      applied = true;
    }
    
    return {
      applied,
      query: { ...query, filter },
      optimizations
    };
  }

  /**
   * Optimize sort specification
   * @private
   * @param {Query} query - Query to optimize
   * @returns {{applied: boolean, query: Query, optimizations: string[]}}
   */
  optimizeSort(query) {
    const optimizations = [];
    let applied = false;
    
    // Remove redundant sort if it matches index or if limit is small
    if (query.sort && query.limit && query.limit <= 10) {
      optimizations.push('consider removing sort for small result sets');
    }
    
    return { applied, query, optimizations };
  }

  /**
   * Optimize projection
   * @private
   * @param {Query} query - Query to optimize
   * @returns {{applied: boolean, query: Query, optimizations: string[]}}
   */
  optimizeProjection(query) {
    const optimizations = [];
    let applied = false;
    
    // Suggest projection if not present
    if (!query.projection && query.type === 'select') {
      optimizations.push('add projection to reduce data transfer');
    }
    
    return { applied, query, optimizations };
  }

  /**
   * Optimize pagination
   * @private
   * @param {Query} query - Query to optimize
   * @returns {{applied: boolean, query: Query, optimizations: string[]}}
   */
  optimizePagination(query) {
    const optimizations = [];
    let applied = false;
    let { skip, limit } = query;
    
    // Warn about large skip
    if (skip && skip > 10000) {
      optimizations.push('consider cursor-based pagination for large skip values');
    }
    
    // Cap limit
    if (limit && limit > 1000) {
      limit = 1000;
      optimizations.push('capped limit at 1000');
      applied = true;
    }
    
    return {
      applied,
      query: { ...query, skip, limit },
      optimizations
    };
  }

  /**
   * Estimate query execution cost
   * @private
   * @param {Query} query - Optimized query
   * @param {ComplexityEstimate} complexity - Complexity estimate
   * @returns {number} Estimated cost
   */
  estimateCost(query, complexity) {
    let cost = this.costModel.baseCost;
    
    // Add filter cost
    if (query.filter && Object.keys(query.filter).length > 0) {
      cost += Object.keys(query.filter).length * this.costModel.filterCost;
    }
    
    // Add sort cost
    if (query.sort && Object.keys(query.sort).length > 0) {
      cost += Object.keys(query.sort).length * this.costModel.sortCost;
    }
    
    // Add skip cost
    if (query.skip) {
      cost += query.skip * this.costModel.skipCost;
    }
    
    // Add limit cost
    if (query.limit) {
      cost += query.limit * this.costModel.limitCost;
    }
    
    // Add population cost
    if (query.populate) {
      cost += query.populate.length * this.costModel.joinCost;
    }
    
    // Factor in complexity
    cost *= (1 + complexity.score / 100);
    
    return Math.round(cost * 100) / 100;
  }

  /**
   * Calculate potential impact of an index
   * @private
   * @param {Query} query - Query
   * @param {string[]} fields - Index fields
   * @returns {number} Impact score (0-1)
   */
  calculateIndexImpact(query, fields) {
    let impact = 0.5;
    
    // Higher impact if index covers filter fields
    const filterFields = this.extractFilterFields(query.filter);
    const coveredFields = fields.filter(f => filterFields.includes(f));
    impact += (coveredFields.length / filterFields.length) * 0.3;
    
    // Bonus for sort coverage
    if (query.sort) {
      const sortFields = Object.keys(query.sort);
      const coveredSort = fields.filter(f => sortFields.includes(f));
      impact += (coveredSort.length / sortFields.length) * 0.2;
    }
    
    return Math.min(1, impact);
  }

  /**
   * Extract filter fields from filter object
   * @private
   * @param {Object} filter - Filter object
   * @returns {string[]} Field names
   */
  extractFilterFields(filter) {
    if (!filter) return [];
    
    const fields = [];
    for (const [key, value] of Object.entries(filter)) {
      if (key.startsWith('$')) {
        // Handle logical operators
        if (Array.isArray(value)) {
          for (const subFilter of value) {
            fields.push(...this.extractFilterFields(subFilter));
          }
        }
      } else {
        fields.push(key);
      }
    }
    return [...new Set(fields)];
  }

  /**
   * Detect fields that might benefit from text index
   * @private
   * @param {Object} filter - Filter object
   * @returns {string[]} Field names
   */
  detectTextSearchFields(filter) {
    if (!filter) return [];
    
    const fields = [];
    const filterStr = JSON.stringify(filter);
    
    // Check for regex patterns that indicate text search
    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'object' && value !== null) {
        if (value.$regex || value.$text) {
          fields.push(key);
        }
      }
    }
    
    return fields;
  }

  /**
   * Get query pattern analysis
   * @returns {Object} Pattern statistics
   */
  getPatternAnalysis() {
    const collectionUsage = {};
    const fieldUsage = {};
    
    for (const { original } of this.queryHistory) {
      // Collection usage
      collectionUsage[original.collection] = (collectionUsage[original.collection] || 0) + 1;
      
      // Field usage
      const fields = this.extractFilterFields(original.filter);
      for (const field of fields) {
        fieldUsage[field] = (fieldUsage[field] || 0) + 1;
      }
    }
    
    return {
      totalQueries: this.queryHistory.length,
      collectionUsage,
      fieldUsage,
      frequentlyQueriedFields: Object.entries(fieldUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    };
  }
}

export default QueryOptimizer;
