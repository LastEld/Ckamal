/**
 * @fileoverview Cost Tracking Service for CogniMesh v5.0
 * Manages AI API cost recording, aggregation, and analysis.
 * @module domains/billing/cost-service
 */

import { EventEmitter } from 'events';

/**
 * Cost event data structure
 * @typedef {Object} CostEvent
 * @property {string} uuid - Unique identifier
 * @property {number} [company_id] - Organization ID
 * @property {number} [user_id] - User who initiated
 * @property {string} [agent_id] - Agent/CV identifier
 * @property {string} [session_id] - Runtime session
 * @property {string} request_id - Unique request identifier
 * @property {number} [conversation_id] - Parent conversation
 * @property {number} [task_id] - Linked task
 * @property {string} provider - Runtime provider
 * @property {string} model - Model identifier
 * @property {string} billing_model - subscription | pay_per_use
 * @property {number} input_tokens - Input token count
 * @property {number} output_tokens - Output token count
 * @property {number} input_cost - Input cost in USD
 * @property {number} output_cost - Output cost in USD
 * @property {number} base_cost - Fixed request cost
 * @property {number} total_cost - Total cost in USD
 * @property {string} [routing_strategy] - Routing method used
 * @property {number} [estimated_cost] - Pre-execution estimate
 * @property {string} operation_type - Type of operation
 * @property {Object} metadata - Additional metadata
 * @property {Date} created_at - Timestamp
 */

/**
 * Cost filters for querying
 * @typedef {Object} CostFilters
 * @property {Date} [startDate] - Start date for range
 * @property {Date} [endDate] - End date for range
 * @property {number} [company_id] - Filter by company
 * @property {number} [user_id] - Filter by user
 * @property {string} [agent_id] - Filter by agent
 * @property {string} [session_id] - Filter by session
 * @property {string} [provider] - Filter by provider
 * @property {string} [model] - Filter by model
 * @property {string} [operation_type] - Filter by operation
 * @property {string} [billing_model] - Filter by billing model
 */

/**
 * Aggregated cost statistics
 * @typedef {Object} CostStats
 * @property {number} totalCost - Total cost in USD
 * @property {number} totalTokens - Total tokens consumed
 * @property {number} inputTokens - Total input tokens
 * @property {number} outputTokens - Total output tokens
 * @property {number} requestCount - Number of requests
 * @property {Object.<string, number>} costByProvider - Cost breakdown by provider
 * @property {Object.<string, number>} costByModel - Cost breakdown by model
 * @property {Object.<string, number>} costByOperation - Cost breakdown by operation
 * @property {Object.<string, number>} costByAgent - Cost breakdown by agent
 */

/**
 * Cost tracking service with full attribution
 * @extends EventEmitter
 */
export class CostService extends EventEmitter {
  /**
   * Creates a CostService instance
   * @param {Object} options - Configuration options
   * @param {Object} options.repositories - Repository factory
   * @param {Object} options.db - Database connection (for raw queries)
   */
  constructor(options = {}) {
    super();
    this.repositories = options.repositories || null;
    this.db = options.db || null;
    this.costEventRepo = this.repositories?.costEvents ?? null;
    this.costRateRepo = this.repositories?.costRates ?? null;
  }

  /**
   * Normalize result sets returned by different DB adapters.
   * @private
   * @param {any} value
   * @returns {Array<Object>}
   */
  _normalizeRows(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (Array.isArray(value.rows)) return value.rows;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.data)) return value.data;
    if (typeof value[Symbol.iterator] === 'function') return Array.from(value);
    return [];
  }

  /**
   * Generate UUID for cost events
   * @private
   * @returns {string}
   */
  _generateUuid() {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate request ID
   * @private
   * @returns {string}
   */
  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get current cost rates for a provider/model
   * @param {string} provider - Provider name
   * @param {string} model - Model identifier
   * @param {string} [billing_model='subscription'] - Billing model
   * @returns {Promise<Object|null>} Rate information
   */
  async getRates(provider, model, billing_model = 'subscription') {
    if (!this.db) return null;

    const row = await this.db.prepare(`
      SELECT input_rate, output_rate, base_cost, currency
      FROM cost_rates
      WHERE provider = ? AND model = ? AND billing_model = ?
        AND effective_from <= datetime('now')
        AND (effective_until IS NULL OR effective_until > datetime('now'))
      ORDER BY effective_from DESC
      LIMIT 1
    `).get(provider, model, billing_model);

    return row || null;
  }

  /**
   * Calculate cost for token usage
   * @param {string} provider - Provider name
   * @param {string} model - Model identifier
   * @param {Object} tokens - Token counts
   * @param {number} tokens.input - Input tokens
   * @param {number} tokens.output - Output tokens
   * @param {string} [billing_model='subscription'] - Billing model
   * @returns {Promise<Object>} Calculated costs
   */
  async calculateCost(provider, model, tokens, billing_model = 'subscription') {
    const rates = await this.getRates(provider, model, billing_model);
    
    if (!rates) {
      // Return zero cost for unknown rates (subscription models)
      return {
        input_cost: 0,
        output_cost: 0,
        base_cost: 0,
        total_cost: 0,
        rates: null
      };
    }

    const inputTokens = tokens.input || 0;
    const outputTokens = tokens.output || 0;

    // Use integer math for precision (cents per 1000 tokens)
    const input_cost_raw = (inputTokens * rates.input_rate) / 1000;
    const output_cost_raw = (outputTokens * rates.output_rate) / 1000;
    const base_cost_raw = rates.base_cost || 0;
    const total_cost_raw = input_cost_raw + output_cost_raw + base_cost_raw;

    // Round to 6 decimal places using proper decimal rounding to avoid floating point errors
    const round6 = (n) => Math.round(n * 1000000) / 1000000;

    return {
      input_cost: round6(input_cost_raw),
      output_cost: round6(output_cost_raw),
      base_cost: round6(base_cost_raw),
      total_cost: round6(total_cost_raw),
      rates
    };
  }

  /**
   * Record a cost event
   * @param {Object} data - Cost event data
   * @param {Object} data.tokens - Token usage
   * @param {number} data.tokens.input - Input tokens
   * @param {number} data.tokens.output - Output tokens
   * @param {string} data.provider - Provider name
   * @param {string} data.model - Model identifier
   * @param {Object} [data.attribution] - Attribution data
   * @param {number} [data.attribution.company_id] - Company ID
   * @param {number} [data.attribution.user_id] - User ID
   * @param {string} [data.attribution.agent_id] - Agent ID
   * @param {string} [data.attribution.session_id] - Session ID
   * @param {Object} [data.context] - Request context
   * @param {string} [data.context.request_id] - Request ID
   * @param {number} [data.context.conversation_id] - Conversation ID
   * @param {number} [data.context.task_id] - Task ID
   * @param {Object} [data.routing] - Routing information
   * @param {string} [data.routing.strategy] - Routing strategy
   * @param {number} [data.routing.estimated_cost] - Estimated cost
   * @param {string} [data.operation_type='completion'] - Operation type
   * @param {Object} [data.metadata={}] - Additional metadata
   * @returns {Promise<CostEvent>} Recorded cost event
   * @throws {Error} If required fields are missing
   */
  async recordCost(data) {
    // Validate required data
    if (!data || typeof data !== 'object') {
      throw new Error('Cost data is required');
    }

    const {
      tokens,
      provider,
      model,
      attribution = {},
      context = {},
      routing = {},
      operation_type = 'completion',
      metadata = {},
      billing_model = 'subscription'
    } = data;

    // Validate required fields
    if (!tokens || typeof tokens !== 'object') {
      throw new Error('tokens object is required with input and/or output counts');
    }
    if (!provider || typeof provider !== 'string') {
      throw new Error('provider is required and must be a string');
    }
    if (!model || typeof model !== 'string') {
      throw new Error('model is required and must be a string');
    }

    // Calculate costs
    const costs = await this.calculateCost(provider, model, tokens, billing_model);

    const event = {
      uuid: this._generateUuid(),
      request_id: context.request_id || this._generateRequestId(),
      company_id: attribution.company_id || null,
      user_id: attribution.user_id || null,
      agent_id: attribution.agent_id || null,
      session_id: attribution.session_id || null,
      conversation_id: context.conversation_id || null,
      task_id: context.task_id || null,
      provider: provider.toLowerCase(),
      model,
      billing_model,
      input_tokens: tokens.input || 0,
      output_tokens: tokens.output || 0,
      total_tokens: (tokens.input || 0) + (tokens.output || 0),
      input_cost: costs.input_cost,
      output_cost: costs.output_cost,
      base_cost: costs.base_cost,
      total_cost: costs.total_cost,
      routing_strategy: routing.strategy || null,
      estimated_cost: routing.estimated_cost || null,
      operation_type,
      metadata: JSON.stringify(metadata),
      created_at: new Date().toISOString()
    };

    // Persist to database
    try {
      if (this.costEventRepo) {
        await this.costEventRepo.create(event);
      } else if (this.db) {
        const columns = Object.keys(event).join(', ');
        const placeholders = Object.keys(event).map(() => '?').join(', ');
        const values = Object.values(event);
        
        await this.db.prepare(
          `INSERT INTO cost_events (${columns}) VALUES (${placeholders})`
        ).run(...values);
      }
    } catch (dbError) {
      throw new Error(`Failed to record cost event: ${dbError.message}`);
    }

    this.emit('cost:recorded', event);
    return event;
  }

  /**
   * Get cost events with filtering
   * @param {CostFilters} [filters={}] - Filter criteria
   * @param {Object} [pagination] - Pagination options
   * @param {number} [pagination.page=1] - Page number
   * @param {number} [pagination.per_page=50] - Items per page
   * @returns {Promise<{events: CostEvent[], pagination: Object}>}
   */
  async getCosts(filters = {}, pagination = {}) {
    if (!this.db) {
      return { events: [], pagination: { total: 0, page: 1, per_page: 50, pages: 0 } };
    }

    const conditions = [];
    const params = [];

    if (filters.startDate) {
      conditions.push('created_at >= ?');
      params.push(filters.startDate.toISOString());
    }

    if (filters.endDate) {
      conditions.push('created_at <= ?');
      params.push(filters.endDate.toISOString());
    }

    if (filters.company_id) {
      conditions.push('company_id = ?');
      params.push(filters.company_id);
    }

    if (filters.user_id) {
      conditions.push('user_id = ?');
      params.push(filters.user_id);
    }

    if (filters.agent_id) {
      conditions.push('agent_id = ?');
      params.push(filters.agent_id);
    }

    if (filters.session_id) {
      conditions.push('session_id = ?');
      params.push(filters.session_id);
    }

    if (filters.provider) {
      conditions.push('provider = ?');
      params.push(filters.provider.toLowerCase());
    }

    if (filters.model) {
      conditions.push('model = ?');
      params.push(filters.model);
    }

    if (filters.operation_type) {
      conditions.push('operation_type = ?');
      params.push(filters.operation_type);
    }

    if (filters.billing_model) {
      conditions.push('billing_model = ?');
      params.push(filters.billing_model);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.db.prepare(
      `SELECT COUNT(*) as total FROM cost_events ${whereClause}`
    ).get(...params);
    const total = countResult.total;

    // Get paginated results
    const page = pagination.page || 1;
    const per_page = pagination.per_page || 50;
    const offset = (page - 1) * per_page;

    const rows = await this.db.prepare(
      `SELECT * FROM cost_events ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, per_page, offset);

    const events = this._normalizeRows(rows).map(row => {
      let parsedMetadata = {};
      try {
        parsedMetadata = JSON.parse(row.metadata || '{}');
      } catch (e) {
        // If metadata is invalid JSON, use empty object
        parsedMetadata = { _parseError: true, _raw: row.metadata };
      }
      return {
        ...row,
        metadata: parsedMetadata
      };
    });

    return {
      events,
      pagination: {
        total,
        page,
        per_page,
        pages: Math.ceil(total / per_page)
      }
    };
  }

  /**
   * Get aggregated cost statistics
   * @param {CostFilters} [filters={}] - Filter criteria
   * @returns {Promise<CostStats>}
   */
  async getStats(filters = {}) {
    if (!this.db) {
      return {
        totalCost: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        requestCount: 0,
        costByProvider: {},
        costByModel: {},
        costByOperation: {},
        costByAgent: {}
      };
    }

    const conditions = [];
    const params = [];

    if (filters.startDate) {
      conditions.push('created_at >= ?');
      params.push(filters.startDate.toISOString());
    }

    if (filters.endDate) {
      conditions.push('created_at <= ?');
      params.push(filters.endDate.toISOString());
    }

    if (filters.company_id) {
      conditions.push('company_id = ?');
      params.push(filters.company_id);
    }

    if (filters.user_id) {
      conditions.push('user_id = ?');
      params.push(filters.user_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const byAgentConditions = [...conditions, 'agent_id IS NOT NULL'];
    const byAgentWhereClause = `WHERE ${byAgentConditions.join(' AND ')}`;

    const normalizeCostMap = (value, keyField) => {
      const rows = this._normalizeRows(value);
      return Object.fromEntries(
        rows
          .filter(row => row && row[keyField] != null)
          .map(row => [String(row[keyField]), Number(row.cost) || 0])
      );
    };

    const [
      summary,
      byProvider,
      byModel,
      byOperation,
      byAgent
    ] = await Promise.all([
      // Summary statistics
      this.db.prepare(`
        SELECT 
          COALESCE(SUM(total_cost), 0) as totalCost,
          COALESCE(SUM(total_tokens), 0) as totalTokens,
          COALESCE(SUM(input_tokens), 0) as inputTokens,
          COALESCE(SUM(output_tokens), 0) as outputTokens,
          COUNT(*) as requestCount
        FROM cost_events ${whereClause}
      `).get(...params),

      // Cost by provider
      this.db.prepare(`
        SELECT provider, SUM(total_cost) as cost 
        FROM cost_events ${whereClause}
        GROUP BY provider
      `).all(...params),

      // Cost by model
      this.db.prepare(`
        SELECT model, SUM(total_cost) as cost 
        FROM cost_events ${whereClause}
        GROUP BY model
      `).all(...params),

      // Cost by operation
      this.db.prepare(`
        SELECT operation_type, SUM(total_cost) as cost 
        FROM cost_events ${whereClause}
        GROUP BY operation_type
      `).all(...params),

      // Cost by agent
      this.db.prepare(`
        SELECT agent_id, SUM(total_cost) as cost 
        FROM cost_events ${byAgentWhereClause}
        GROUP BY agent_id
      `).all(...params)
    ]);

    return {
      totalCost: summary.totalCost || 0,
      totalTokens: summary.totalTokens || 0,
      inputTokens: summary.inputTokens || 0,
      outputTokens: summary.outputTokens || 0,
      requestCount: summary.requestCount || 0,
      costByProvider: normalizeCostMap(byProvider, 'provider'),
      costByModel: normalizeCostMap(byModel, 'model'),
      costByOperation: normalizeCostMap(byOperation, 'operation_type'),
      costByAgent: normalizeCostMap(byAgent, 'agent_id')
    };
  }

  /**
   * Get daily cost breakdown
   * @param {number} [days=30] - Number of days
   * @param {CostFilters} [filters={}] - Additional filters
   * @returns {Promise<Array<{date: string, cost: number, tokens: number, requests: number}>>}
   */
  async getDailyCosts(days = 30, filters = {}) {
    if (!this.db) return [];

    const conditions = ['created_at >= datetime(\'now\', ?)'];
    const params = [`-${days} days`];

    if (filters.company_id) {
      conditions.push('company_id = ?');
      params.push(filters.company_id);
    }

    if (filters.user_id) {
      conditions.push('user_id = ?');
      params.push(filters.user_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.db.prepare(`
      SELECT 
        DATE(created_at) as date,
        SUM(total_cost) as cost,
        SUM(total_tokens) as tokens,
        COUNT(*) as requests
      FROM cost_events
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all(...params);

    return this._normalizeRows(rows).map(row => ({
      ...row,
      cost: Number(row.cost) || 0,
      tokens: Number(row.tokens) || 0,
      requests: Number(row.requests) || 0
    }));
  }

  /**
   * Predict future costs based on historical data
   * @param {number} [days=30] - Days to predict
   * @param {CostFilters} [filters={}] - Historical data filters
   * @returns {Promise<Object>} Prediction results
   */
  async predictCosts(days = 30, filters = {}) {
    const historyDays = Math.max(days * 3, 30); // At least 30 days history for better predictions
    const dailyData = this._normalizeRows(await this.getDailyCosts(historyDays, filters));

    if (dailyData.length < 3) {
      return {
        predictedCost: 0,
        confidence: 0,
        dailyBreakdown: Array(days).fill(0),
        trend: 'insufficient_data',
        averageDailyCost: 0
      };
    }

    const costs = dailyData.map(d => d.cost).reverse();
    const avgDailyCost = costs.reduce((a, b) => a + b, 0) / costs.length || 0;

    // Simple linear regression for trend
    const n = costs.length;
    const sumX = costs.reduce((sum, _, i) => sum + i, 0);
    const sumY = costs.reduce((sum, cost) => sum + cost, 0);
    const sumXY = costs.reduce((sum, cost, i) => sum + i * cost, 0);
    const sumXX = costs.reduce((sum, _, i) => sum + i * i, 0);

    const denominator = n * sumXX - sumX * sumX;
    const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;

    // Generate predictions using weighted average for stability
    const predictions = [];
    const recentAvg = costs.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, costs.length);
    
    for (let i = 1; i <= days; i++) {
      // Blend trend with historical average for stability
      const trendComponent = recentAvg + slope * i;
      const historicalComponent = avgDailyCost;
      const blended = trendComponent * 0.6 + historicalComponent * 0.4;
      const predicted = Math.max(0, blended);
      predictions.push(Math.round(predicted * 10000) / 10000);
    }

    const totalPredicted = predictions.reduce((a, b) => a + b, 0);

    // Calculate confidence based on data variance (coefficient of variation)
    const variance = costs.length > 1 
      ? costs.reduce((sum, cost) => sum + Math.pow(cost - avgDailyCost, 2), 0) / (costs.length - 1)
      : 0;
    const stdDev = Math.sqrt(variance);
    const cv = avgDailyCost > 0 ? stdDev / avgDailyCost : 0;
    // Higher CV = lower confidence; cap at 1.0
    const confidence = Math.max(0, Math.min(1, 1 - cv));

    return {
      predictedCost: parseFloat(totalPredicted.toFixed(4)),
      confidence: parseFloat(confidence.toFixed(2)),
      dailyBreakdown: predictions,
      trend: slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable',
      averageDailyCost: parseFloat(avgDailyCost.toFixed(4)),
      historyDays: dailyData.length
    };
  }

  /**
   * Get cost summary for dashboard widget
   * @param {Object} options - Summary options
   * @param {number} [options.company_id] - Company scope
   * @param {number} [options.user_id] - User scope
   * @param {Date} [options.period_start] - Period start
   * @param {Date} [options.period_end] - Period end
   * @returns {Promise<Object>} Dashboard summary
   */
  async getDashboardSummary(options = {}) {
    const {
      company_id,
      user_id,
      period_start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      period_end = new Date()
    } = options;

    const filters = {
      startDate: period_start,
      endDate: period_end,
      company_id,
      user_id
    };

    const [stats, dailyCosts, forecast] = await Promise.all([
      this.getStats(filters),
      this.getDailyCosts(30, { company_id, user_id }),
      this.predictCosts(30, { company_id, user_id })
    ]);

    // Calculate trend (dailyCosts is ordered DESC by date)
    const recentDays = dailyCosts.slice(0, 7);
    const previousDays = dailyCosts.slice(7, 14);
    const recentAvg = recentDays.reduce((s, d) => s + d.cost, 0) / (recentDays.length || 1);
    const previousAvg = previousDays.reduce((s, d) => s + d.cost, 0) / (previousDays.length || 1);
    // Prevent extreme trend values
    const rawTrend = previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0;
    const trendPercent = Math.max(-1000, Math.min(1000, rawTrend));

    return {
      period: {
        start: period_start.toISOString(),
        end: period_end.toISOString()
      },
      summary: {
        totalSpend: parseFloat(stats.totalCost.toFixed(2)),
        totalRequests: stats.requestCount,
        totalTokens: stats.totalTokens,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        averageCostPerRequest: stats.requestCount > 0 
          ? parseFloat((stats.totalCost / stats.requestCount).toFixed(4))
          : 0
      },
      breakdown: {
        byProvider: stats.costByProvider,
        byModel: stats.costByModel,
        byOperation: stats.costByOperation,
        byAgent: stats.costByAgent
      },
      trend: {
        daily: dailyCosts,
        weeklyChangePercent: parseFloat(trendPercent.toFixed(1)),
        direction: trendPercent > 5 ? 'up' : trendPercent < -5 ? 'down' : 'stable'
      },
      forecast: {
        next30Days: forecast.predictedCost,
        confidence: forecast.confidence,
        trend: forecast.trend
      }
    };
  }
}

export default CostService;
