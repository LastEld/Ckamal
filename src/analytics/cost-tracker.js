/**
 * @fileoverview AI Cost Tracking System for CogniMesh v5.0
 * Tracks API costs across multiple AI providers with time-series storage.
 * @module analytics/cost-tracker
 */

import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { join } from 'path';
import { mkdir } from 'fs/promises';

/**
 * Supported AI providers
 * @typedef {'claude' | 'openai' | 'kimi'} Provider
 */

/**
 * Cost record structure
 * @typedef {Object} CostRecord
 * @property {string} id - Unique identifier
 * @property {string} provider - AI provider name
 * @property {string} model - Model identifier
 * @property {number} tokens - Number of tokens
 * @property {number} cost - Cost in USD
 * @property {number} timestamp - Unix timestamp
 * @property {string} operation - Operation type (completion, embedding, etc.)
 */

/**
 * Cost filters for querying
 * @typedef {Object} CostFilters
 * @property {Date} [startDate] - Start date for range
 * @property {Date} [endDate] - End date for range
 * @property {string} [provider] - Filter by provider
 * @property {string} [model] - Filter by model
 * @property {string} [operation] - Filter by operation type
 */

/**
 * Aggregated cost statistics
 * @typedef {Object} CostStats
 * @property {number} totalCost - Total cost in USD
 * @property {number} totalTokens - Total tokens consumed
 * @property {number} requestCount - Number of requests
 * @property {Object.<string, number>} costByProvider - Cost breakdown by provider
 * @property {Object.<string, number>} costByModel - Cost breakdown by model
 */

/**
 * Manages AI API cost tracking across multiple providers
 */
export class CostTracker {
  /**
   * Creates a new CostTracker instance
   * @param {Object} options - Configuration options
   * @param {string} [options.dataDir='./data'] - Directory for SQLite database
   * @param {string} [options.dbName='costs.db'] - Database filename
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || './data';
    this.dbName = options.dbName || 'costs.db';
    this.db = null;
  }

  /**
   * Initializes the database and creates tables
   * @returns {Promise<void>}
   */
  async init() {
    await mkdir(this.dataDir, { recursive: true });
    
    this.db = await open({
      filename: join(this.dataDir, this.dbName),
      driver: sqlite3.Database
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS costs (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        tokens INTEGER NOT NULL,
        cost REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        operation TEXT DEFAULT 'completion',
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_costs_timestamp ON costs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_costs_provider ON costs(provider);
      CREATE INDEX IF NOT EXISTS idx_costs_model ON costs(model);
      CREATE INDEX IF NOT EXISTS idx_costs_timestamp_provider ON costs(timestamp, provider);

      CREATE TABLE IF NOT EXISTS cost_rates (
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_rate REAL NOT NULL,
        output_rate REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (provider, model)
      );
    `);
  }

  /**
   * Closes the database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  /**
   * Generates a unique ID
   * @private
   * @returns {string}
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Tracks a new API request cost
   * @param {string} provider - AI provider (claude, openai, kimi)
   * @param {string} model - Model identifier
   * @param {Object} tokens - Token counts
   * @param {number} tokens.input - Input/prompt tokens
   * @param {number} tokens.output - Output/completion tokens
   * @param {number} cost - Calculated cost in USD
   * @param {Object} [options={}] - Additional options
   * @param {string} [options.operation='completion'] - Operation type
   * @param {Object} [options.metadata={}] - Additional metadata
   * @returns {Promise<CostRecord>} The created cost record
   */
  async trackRequest(provider, model, tokens, cost, options = {}) {
    if (!this.db) {
      throw new Error('CostTracker not initialized. Call init() first.');
    }

    const { operation = 'completion', metadata = {} } = options;
    const totalTokens = (tokens.input || 0) + (tokens.output || 0);

    const record = {
      id: this._generateId(),
      provider: provider.toLowerCase(),
      model,
      tokens: totalTokens,
      cost,
      timestamp: Date.now(),
      operation,
      metadata: JSON.stringify(metadata)
    };

    await this.db.run(
      `INSERT INTO costs (id, provider, model, tokens, cost, timestamp, operation, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.provider, record.model, record.tokens, record.cost, 
       record.timestamp, record.operation, record.metadata]
    );

    return record;
  }

  /**
   * Sets pricing rates for a provider/model combination
   * @param {string} provider - AI provider
   * @param {string} model - Model identifier
   * @param {Object} rates - Pricing rates per 1K tokens
   * @param {number} rates.input - Input token rate
   * @param {number} rates.output - Output token rate
   * @returns {Promise<void>}
   */
  async setRates(provider, model, rates) {
    if (!this.db) {
      throw new Error('CostTracker not initialized. Call init() first.');
    }

    await this.db.run(
      `INSERT OR REPLACE INTO cost_rates (provider, model, input_rate, output_rate, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [provider.toLowerCase(), model, rates.input, rates.output, Date.now()]
    );
  }

  /**
   * Calculates cost based on token usage and stored rates
   * @param {string} provider - AI provider
   * @param {string} model - Model identifier
   * @param {Object} tokens - Token counts
   * @param {number} tokens.input - Input tokens
   * @param {number} tokens.output - Output tokens
   * @returns {Promise<number>} Calculated cost in USD
   */
  async calculateCost(provider, model, tokens) {
    if (!this.db) {
      throw new Error('CostTracker not initialized. Call init() first.');
    }

    const rate = await this.db.get(
      `SELECT input_rate, output_rate FROM cost_rates 
       WHERE provider = ? AND model = ?`,
      [provider.toLowerCase(), model]
    );

    if (!rate) {
      throw new Error(`No rates found for ${provider}/${model}`);
    }

    const inputCost = (tokens.input || 0) * rate.input_rate / 1000;
    const outputCost = (tokens.output || 0) * rate.output_rate / 1000;

    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  /**
   * Retrieves cost records with optional filtering
   * @param {CostFilters} [filters={}] - Filter criteria
   * @returns {Promise<CostRecord[]>} Matching cost records
   */
  async getCosts(filters = {}) {
    if (!this.db) {
      throw new Error('CostTracker not initialized. Call init() first.');
    }

    const conditions = [];
    const params = [];

    if (filters.startDate) {
      conditions.push('timestamp >= ?');
      params.push(filters.startDate.getTime());
    }

    if (filters.endDate) {
      conditions.push('timestamp <= ?');
      params.push(filters.endDate.getTime());
    }

    if (filters.provider) {
      conditions.push('provider = ?');
      params.push(filters.provider.toLowerCase());
    }

    if (filters.model) {
      conditions.push('model = ?');
      params.push(filters.model);
    }

    if (filters.operation) {
      conditions.push('operation = ?');
      params.push(filters.operation);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.db.all(
      `SELECT * FROM costs ${whereClause} ORDER BY timestamp DESC`,
      params
    );

    return rows.map(row => ({
      ...row,
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }

  /**
   * Gets aggregated cost statistics
   * @param {CostFilters} [filters={}] - Filter criteria
   * @returns {Promise<CostStats>} Aggregated statistics
   */
  async getStats(filters = {}) {
    if (!this.db) {
      throw new Error('CostTracker not initialized. Call init() first.');
    }

    const conditions = [];
    const params = [];

    if (filters.startDate) {
      conditions.push('timestamp >= ?');
      params.push(filters.startDate.getTime());
    }

    if (filters.endDate) {
      conditions.push('timestamp <= ?');
      params.push(filters.endDate.getTime());
    }

    if (filters.provider) {
      conditions.push('provider = ?');
      params.push(filters.provider.toLowerCase());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [summary, byProvider, byModel] = await Promise.all([
      this.db.get(
        `SELECT 
          COALESCE(SUM(cost), 0) as totalCost,
          COALESCE(SUM(tokens), 0) as totalTokens,
          COUNT(*) as requestCount
         FROM costs ${whereClause}`,
        params
      ),
      this.db.all(
        `SELECT provider, SUM(cost) as cost 
         FROM costs ${whereClause} 
         GROUP BY provider`,
        params
      ),
      this.db.all(
        `SELECT model, SUM(cost) as cost 
         FROM costs ${whereClause} 
         GROUP BY model`,
        params
      )
    ]);

    return {
      totalCost: summary.totalCost,
      totalTokens: summary.totalTokens,
      requestCount: summary.requestCount,
      costByProvider: Object.fromEntries(byProvider.map(r => [r.provider, r.cost])),
      costByModel: Object.fromEntries(byModel.map(r => [r.model, r.cost]))
    };
  }

  /**
   * Predicts future costs based on historical data
   * @param {number} days - Number of days to predict
   * @param {string} [provider] - Specific provider to predict (optional)
   * @returns {Promise<Object>} Prediction results
   */
  async predictCosts(days, provider = null) {
    if (!this.db) {
      throw new Error('CostTracker not initialized. Call init() first.');
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const historyDays = Math.max(days * 2, 7); // Use at least 7 days history
    const historyStart = now - (historyDays * dayMs);

    let query = `
      SELECT 
        DATE(timestamp / 1000, 'unixepoch') as date,
        SUM(cost) as dailyCost,
        SUM(tokens) as dailyTokens,
        COUNT(*) as requestCount
      FROM costs
      WHERE timestamp >= ?
    `;
    const params = [historyStart];

    if (provider) {
      query += ' AND provider = ?';
      params.push(provider.toLowerCase());
    }

    query += ' GROUP BY date ORDER BY date';

    const dailyData = await this.db.all(query, params);

    if (dailyData.length === 0) {
      return {
        predictedCost: 0,
        confidence: 0,
        dailyBreakdown: Array(days).fill(0),
        trend: 'insufficient_data'
      };
    }

    // Calculate moving average and trend
    const costs = dailyData.map(d => d.dailyCost);
    const avgDailyCost = costs.reduce((a, b) => a + b, 0) / costs.length;
    
    // Simple linear regression for trend
    const n = costs.length;
    const sumX = costs.reduce((sum, _, i) => sum + i, 0);
    const sumY = costs.reduce((sum, cost) => sum + cost, 0);
    const sumXY = costs.reduce((sum, cost, i) => sum + i * cost, 0);
    const sumXX = costs.reduce((sum, _, i) => sum + i * i, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // Generate predictions
    const predictions = [];
    let lastValue = costs[costs.length - 1];
    
    for (let i = 1; i <= days; i++) {
      const predicted = Math.max(0, lastValue + slope * i);
      predictions.push(parseFloat(predicted.toFixed(4)));
    }

    const totalPredicted = predictions.reduce((a, b) => a + b, 0);
    
    // Calculate confidence based on data variance
    const variance = costs.reduce((sum, cost) => sum + Math.pow(cost - avgDailyCost, 2), 0) / costs.length;
    const stdDev = Math.sqrt(variance);
    const confidence = Math.max(0, 1 - (stdDev / (avgDailyCost || 1)));

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
   * Gets available providers and their models
   * @returns {Promise<Object.<string, string[]>>} Provider to models mapping
   */
  async getProviders() {
    if (!this.db) {
      throw new Error('CostTracker not initialized. Call init() first.');
    }

    const rows = await this.db.all(
      `SELECT DISTINCT provider, model FROM costs ORDER BY provider, model`
    );

    const providers = {};
    for (const row of rows) {
      if (!providers[row.provider]) {
        providers[row.provider] = [];
      }
      providers[row.provider].push(row.model);
    }

    return providers;
  }

  /**
   * Exports all cost data
   * @returns {Promise<CostRecord[]>} All cost records
   */
  async exportData() {
    if (!this.db) {
      throw new Error('CostTracker not initialized. Call init() first.');
    }

    const rows = await this.db.all('SELECT * FROM costs ORDER BY timestamp');
    return rows.map(row => ({
      ...row,
      metadata: JSON.parse(row.metadata || '{}'),
      date: new Date(row.timestamp).toISOString()
    }));
  }
}

export default CostTracker;
