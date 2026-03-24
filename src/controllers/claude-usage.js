/**
 * Claude Usage Controller
 * Usage tracking and analytics
 * 
 * @module controllers/claude-usage
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
 * Usage period options
 * @readonly
 * @enum {string}
 */
export const UsagePeriod = {
    DAY: '1d',
    WEEK: '7d',
    MONTH: '30d',
    QUARTER: '90d'
};

/**
 * Metric types
 * @readonly
 * @enum {string}
 */
export const MetricType = {
    COST: 'cost',
    TOKENS: 'tokens',
    REQUESTS: 'requests'
};

/**
 * ClaudeUsageController class
 * Manages usage tracking, billing, and analytics
 */
export class ClaudeUsageController {
    /**
     * Create a new ClaudeUsageController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.gateway] - Usage API gateway
     */
    constructor(options = {}) {
        this.gateway = options.gateway || null;
        this.name = 'ClaudeUsageController';
        this._usage = new Map();
        this._invoices = new Map();
        this._alerts = [];
        this._alertConfig = null;
    }

    /**
     * Get comprehensive usage statistics
     * @param {Object} [options] - Options
     * @param {UsagePeriod} [options.period='30d'] - Time period
     * @param {string} [options.sessionId] - Filter by session
     * @param {string} [options.projectId] - Filter by project
     * @param {'hour'|'day'|'week'|'month'} [options.granularity='day'] - Time granularity
     * @returns {Promise<Object>} Usage statistics
     */
    async getUsage(options = {}) {
        try {
            const period = options.period || UsagePeriod.MONTH;
            const granularity = options.granularity || 'day';

            if (!Object.values(UsagePeriod).includes(period)) {
                return {
                    success: false,
                    error: `Invalid period. Valid: ${Object.values(UsagePeriod).join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!['hour', 'day', 'week', 'month'].includes(granularity)) {
                return {
                    success: false,
                    error: 'Granularity must be one of: hour, day, week, month',
                    code: 'VALIDATION_ERROR'
                };
            }

            const end = new Date();
            const start = this._getPeriodStart(period, end);
            const records = this._getUsageRecords({
                start,
                end,
                sessionId: options.sessionId,
                projectId: options.projectId
            });

            return formatResponse(
                this._buildUsageSummary(records, {
                    period,
                    granularity,
                    start,
                    end,
                    sessionId: options.sessionId,
                    projectId: options.projectId
                })
            );
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get usage' });
        }
    }

    /**
     * Get usage by model
     * @param {Object} [options] - Options
     * @param {string} [options.model] - Specific model
     * @param {UsagePeriod} [options.period='30d'] - Time period
     * @returns {Promise<Object>} Model usage
     */
    async getUsageByModel(options = {}) {
        try {
            const usage = await this.getUsage(options);

            if (!usage.success) {
                return usage;
            }
            
            if (options.model) {
                const modelUsage = usage.data.byModel[options.model];
                if (!modelUsage) {
                    return {
                        success: false,
                        error: `No usage data for model: ${options.model}`,
                        code: 'NOT_FOUND'
                    };
                }
                return formatResponse({ model: options.model, ...modelUsage });
            }

            return formatResponse(usage.data.byModel);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get model usage' });
        }
    }

    /**
     * Get token usage by type
     * @param {Object} [options] - Options
     * @param {UsagePeriod} [options.period='30d'] - Time period
     * @returns {Promise<Object>} Token usage
     */
    async getTokenUsage(options = {}) {
        try {
            const usage = await this.getUsage(options);
            if (!usage.success) {
                return usage;
            }
            return formatResponse(usage.data.byType);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get token usage' });
        }
    }

    /**
     * Get usage forecast
     * @param {Object} [options] - Options
     * @param {number} [options.days=30] - Days to forecast
     * @returns {Promise<Object>} Forecast
     */
    async getForecast(options = {}) {
        try {
            const days = options.days || 30;

            if (typeof days !== 'number' || days <= 0) {
                return {
                    success: false,
                    error: 'Days must be a positive number',
                    code: 'VALIDATION_ERROR'
                };
            }

            const end = new Date();
            const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
            const records = this._getUsageRecords({
                start,
                end,
                sessionId: options.sessionId,
                projectId: options.projectId
            });

            if (records.length === 0) {
                return {
                    success: false,
                    error: 'No usage data available for forecasting',
                    code: 'NOT_FOUND'
                };
            }

            const usage = this._buildUsageSummary(records, {
                period: UsagePeriod.MONTH,
                granularity: 'day',
                start,
                end
            });
            const coverageDays = this._getCoverageDays(records, start, end);

            return formatResponse({
                period: `${days}d`,
                projectedTokens: Math.round((usage.totalTokens / coverageDays) * days),
                projectedRequests: Math.round((usage.totalRequests / coverageDays) * days),
                projectedCost: parseFloat(((usage.totalCost / coverageDays) * days).toFixed(2)),
                confidence: this._estimateForecastConfidence(coverageDays, records.length),
                basedOn: {
                    records: records.length,
                    coverageDays,
                    sourcePeriod: UsagePeriod.MONTH
                }
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get forecast' });
        }
    }

    /**
     * Compare usage between periods
     * @param {Object} options - Comparison options
     * @param {UsagePeriod} [options.currentPeriod='7d'] - Current period
     * @param {UsagePeriod} [options.previousPeriod='7d'] - Previous period
     * @returns {Promise<Object>} Comparison result
     */
    async comparePeriods(options = {}) {
        try {
            const currentPeriod = options.currentPeriod || UsagePeriod.WEEK;
            const previousPeriod = options.previousPeriod || UsagePeriod.WEEK;
            const now = new Date();
            const currentDays = this._getPeriodDays(currentPeriod);
            const previousDays = this._getPeriodDays(previousPeriod);
            const currentStart = new Date(now.getTime() - currentDays * 24 * 60 * 60 * 1000);
            const previousEnd = currentStart;
            const previousStart = new Date(previousEnd.getTime() - previousDays * 24 * 60 * 60 * 1000);

            const current = this._buildUsageSummary(
                this._getUsageRecords({
                    start: currentStart,
                    end: now,
                    sessionId: options.sessionId,
                    projectId: options.projectId
                }),
                { period: currentPeriod, granularity: 'day', start: currentStart, end: now }
            );
            const previous = this._buildUsageSummary(
                this._getUsageRecords({
                    start: previousStart,
                    end: previousEnd,
                    sessionId: options.sessionId,
                    projectId: options.projectId
                }),
                { period: previousPeriod, granularity: 'day', start: previousStart, end: previousEnd }
            );

            const change = {
                tokens: current.totalTokens - previous.totalTokens,
                cost: parseFloat((current.totalCost - previous.totalCost).toFixed(2)),
                requests: current.totalRequests - previous.totalRequests
            };

            const percentChange = {
                tokens: previous.totalTokens > 0
                    ? parseFloat(((change.tokens / previous.totalTokens) * 100).toFixed(2))
                    : 0,
                cost: previous.totalCost > 0
                    ? parseFloat(((change.cost / previous.totalCost) * 100).toFixed(2))
                    : 0,
                requests: previous.totalRequests > 0
                    ? parseFloat(((change.requests / previous.totalRequests) * 100).toFixed(2))
                    : 0
            };

            return formatResponse({
                current: {
                    period: currentPeriod,
                    ...current
                },
                previous: {
                    period: previousPeriod,
                    ...previous
                },
                change,
                percentChange
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to compare periods' });
        }
    }

    /**
     * Get invoice
     * @param {Object} [options] - Options
     * @param {'current'|'previous'} [options.period='current'] - Period
     * @returns {Promise<Object>} Invoice
     */
    async getInvoice(options = {}) {
        try {
            const period = options.period || 'current';

            if (!['current', 'previous'].includes(period)) {
                return {
                    success: false,
                    error: 'Period must be current or previous',
                    code: 'VALIDATION_ERROR'
                };
            }

            return formatResponse(this._buildInvoice(period));
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get invoice' });
        }
    }

    /**
     * List invoices
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} List of invoices
     */
    async listInvoices(pagination = {}) {
        try {
            const invoices = this._listInvoiceSummaries();

            const { limit, offset } = parsePagination(pagination);
            const paginated = invoices.slice(offset, offset + limit);

            return formatListResponse(paginated, {
                total: invoices.length,
                limit,
                offset
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list invoices' });
        }
    }

    /**
     * Configure billing alerts
     * @param {Object} config - Alert configuration
     * @param {number} [config.budgetLimit=100] - Monthly budget limit
     * @param {number[]} [config.thresholds=[50, 75, 90, 100]] - Alert thresholds
     * @returns {Promise<Object>} Configuration result
     */
    async configureAlerts(config) {
        try {
            const input = config || {};
            const validation = validateRequest({
                types: {
                    budgetLimit: 'number',
                    thresholds: 'array'
                },
                validators: {
                    budgetLimit: (value) => value === undefined || value > 0 || 'Budget limit must be positive',
                    thresholds: (value) =>
                        value === undefined ||
                        (Array.isArray(value) && value.every(item => typeof item === 'number' && item >= 0)) ||
                        'Thresholds must be an array of non-negative numbers'
                }
            }, input);

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const configuration = {
                budgetLimit: input.budgetLimit || 100,
                thresholds: [...(input.thresholds || [50, 75, 90, 100])].sort((a, b) => a - b),
                configuredAt: new Date().toISOString()
            };

            this._alertConfig = configuration;

            return formatResponse(configuration);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to configure alerts' });
        }
    }

    /**
     * Check billing alerts
     * @returns {Promise<Object>} Alert status
     */
    async checkAlerts() {
        try {
            if (!this._alertConfig) {
                return {
                    success: false,
                    error: 'Billing alerts are not configured',
                    code: 'NOT_CONFIGURED'
                };
            }

            const usage = await this.getUsage();
            if (!usage.success) {
                return usage;
            }

            const currentCost = usage.data.totalCost;
            const budget = this._alertConfig.budgetLimit;
            const percentUsed = (currentCost / budget) * 100;

            const activeAlerts = [];
            for (const threshold of this._alertConfig.thresholds) {
                if (percentUsed >= threshold) {
                    activeAlerts.push({
                        threshold,
                        level: threshold >= 100 ? 'critical' : threshold >= 90 ? 'warning' : 'info',
                        message: threshold >= 100
                            ? 'Budget exceeded'
                            : `Budget reached ${threshold}%`
                    });
                }
            }

            return formatResponse({
                currentUsage: currentCost,
                budget,
                percentUsed: Math.round(percentUsed),
                activeAlerts,
                configuredAt: this._alertConfig.configuredAt
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to check alerts' });
        }
    }

    /**
     * Project costs
     * @param {Object} [options] - Options
     * @param {number} [options.days=30] - Days to project
     * @param {'conservative'|'expected'|'aggressive'} [options.scenario='expected'] - Scenario
     * @returns {Promise<Object>} Cost projection
     */
    async projectCosts(options = {}) {
        try {
            const days = options.days || 30;
            const scenario = options.scenario || 'expected';

            const multipliers = {
                conservative: 0.8,
                expected: 1.0,
                aggressive: 1.3
            };

            if (typeof days !== 'number' || days <= 0) {
                return {
                    success: false,
                    error: 'Days must be a positive number',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!multipliers[scenario]) {
                return {
                    success: false,
                    error: `Invalid scenario. Valid: ${Object.keys(multipliers).join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const end = new Date();
            const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
            const records = this._getUsageRecords({
                start,
                end,
                sessionId: options.sessionId,
                projectId: options.projectId
            });
            const usage = this._buildUsageSummary(records, {
                period: UsagePeriod.MONTH,
                granularity: 'day',
                start,
                end
            });

            if (usage.totalCost === 0) {
                return {
                    success: false,
                    error: 'No cost-tracked usage data available for projection',
                    code: 'NOT_FOUND'
                };
            }

            const coverageDays = this._getCoverageDays(records, start, end);
            const dailyAverage = usage.totalCost / coverageDays;
            const projectedCost = dailyAverage * days * multipliers[scenario];

            return formatResponse({
                period: `${days}d`,
                scenario,
                projectedCost: parseFloat(projectedCost.toFixed(2)),
                dailyAverage: parseFloat((dailyAverage * multipliers[scenario]).toFixed(2)),
                basedOn: {
                    records: records.length,
                    coverageDays
                }
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to project costs' });
        }
    }

    /**
     * Get cost optimization recommendations
     * @param {Object} [options] - Options
     * @param {UsagePeriod} [options.period='30d'] - Analysis period
     * @returns {Promise<Object>} Recommendations
     */
    async getOptimizationRecommendations(options = {}) {
        try {
            const usage = await this.getUsage({
                period: options.period || UsagePeriod.MONTH,
                sessionId: options.sessionId,
                projectId: options.projectId
            });

            if (!usage.success) {
                return usage;
            }

            const recommendations = [];
            const models = Object.entries(usage.data.byModel).sort((a, b) => b[1].cost - a[1].cost);
            const totalCost = usage.data.totalCost;
            const totalRequests = usage.data.totalRequests;
            const averageTokensPerRequest = totalRequests > 0
                ? usage.data.totalTokens / totalRequests
                : 0;

            if (models.length > 0 && totalCost > 0) {
                const [topModel, topStats] = models[0];
                const costShare = topStats.cost / totalCost;
                if (costShare >= 0.8) {
                    recommendations.push({
                        type: 'model_selection',
                        message: `Review routing for ${topModel}; it accounts for ${Math.round(costShare * 100)}% of tracked cost`,
                        potentialSavings: parseFloat((topStats.cost * 0.15).toFixed(2))
                    });
                }
            }

            if (averageTokensPerRequest >= 8000) {
                recommendations.push({
                    type: 'context_optimization',
                    message: 'Average tokens per request are high; review context compression or truncation policies',
                    potentialSavings: totalCost > 0 ? parseFloat((totalCost * 0.1).toFixed(2)) : 0
                });
            }

            if (usage.data.costTrackedRequests < totalRequests) {
                recommendations.push({
                    type: 'telemetry',
                    message: 'Some usage events do not include cost metadata; enable cost tracking for accurate billing analytics',
                    potentialSavings: 0
                });
            }

            return formatResponse({
                recommendations,
                totalPotentialSavings: recommendations.reduce((sum, r) => sum + r.potentialSavings, 0)
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get recommendations' });
        }
    }

    /**
     * Get efficiency metrics
     * @param {Object} [options] - Options
     * @param {UsagePeriod} [options.period='30d'] - Analysis period
     * @returns {Promise<Object>} Efficiency metrics
     */
    async getEfficiencyMetrics(options = {}) {
        try {
            const period = options.period || UsagePeriod.MONTH;
            const end = new Date();
            const start = this._getPeriodStart(period, end);
            const usage = await this.getUsage({
                period,
                sessionId: options.sessionId,
                projectId: options.projectId
            });

            if (!usage.success) {
                return usage;
            }

            const records = this._getUsageRecords({
                start,
                end,
                sessionId: options.sessionId,
                projectId: options.projectId
            });
            const latencyRecords = records.filter(record => typeof record.latencyMs === 'number');
            const successRecords = records.filter(record => typeof record.success === 'boolean');
            const cacheRecords = records.filter(record => typeof record.cacheHit === 'boolean');

            return formatResponse({
                tokensPerDollar: usage.data.totalCost > 0
                    ? parseFloat((usage.data.totalTokens / usage.data.totalCost).toFixed(2))
                    : null,
                requestsPerDollar: usage.data.totalCost > 0
                    ? parseFloat((usage.data.totalRequests / usage.data.totalCost).toFixed(2))
                    : null,
                averageLatency: latencyRecords.length > 0
                    ? Math.round(latencyRecords.reduce((sum, record) => sum + record.latencyMs, 0) / latencyRecords.length)
                    : null,
                successRate: successRecords.length > 0
                    ? parseFloat(((successRecords.filter(record => record.success).length / successRecords.length) * 100).toFixed(2))
                    : null,
                cacheHitRate: cacheRecords.length > 0
                    ? parseFloat(((cacheRecords.filter(record => record.cacheHit).length / cacheRecords.length) * 100).toFixed(2))
                    : null,
                sampleSize: {
                    requests: usage.data.totalRequests,
                    latency: latencyRecords.length,
                    success: successRecords.length,
                    cache: cacheRecords.length
                }
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get efficiency metrics' });
        }
    }

    /**
     * Get analytics dashboard
     * @param {Object} [options] - Options
     * @param {boolean} [options.includeTrends=true] - Include trends
     * @param {boolean} [options.includeEfficiency=true] - Include efficiency
     * @param {boolean} [options.includeRecommendations=true] - Include recommendations
     * @returns {Promise<Object>} Dashboard data
     */
    async getDashboard(options = {}) {
        try {
            const dashboard = {
                timestamp: new Date().toISOString()
            };

            if (options.includeTrends !== false) {
                const usage = await this.getUsage({
                    period: options.period || UsagePeriod.MONTH,
                    sessionId: options.sessionId,
                    projectId: options.projectId
                });
                dashboard.usage = usage.success
                    ? usage.data
                    : { available: false, code: usage.code, error: usage.error };
                dashboard.trends = usage.success ? usage.data.timeSeries : [];
            }

            if (options.includeEfficiency !== false) {
                const efficiency = await this.getEfficiencyMetrics(options);
                dashboard.efficiency = efficiency.success
                    ? efficiency.data
                    : { available: false, code: efficiency.code, error: efficiency.error };
            }

            if (options.includeRecommendations !== false) {
                const recommendations = await this.getOptimizationRecommendations(options);
                dashboard.recommendations = recommendations.success
                    ? recommendations.data
                    : { available: false, code: recommendations.code, error: recommendations.error };
            }

            return formatResponse(dashboard);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get dashboard' });
        }
    }

    /**
     * Record usage event
     * @param {Object} event - Usage event
     * @param {number} event.tokens - Tokens used
     * @param {string} event.model - Model used
     * @param {string} [event.sessionId] - Session ID
     * @param {string} [event.projectId] - Project ID
     */
    recordUsage(event) {
        const record = this._normalizeUsageRecord({
            id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            ...event
        });

        this._usage.set(record.id, record);
        return record;
    }

    // Private methods

    /**
     * Get usage records within a range
     * @private
     * @param {Object} filters - Filter options
     * @returns {Array<Object>} Filtered usage records
     */
    _getUsageRecords(filters = {}) {
        return [...this._usage.values()]
            .filter(record => {
                const timestamp = new Date(record.timestamp);
                if (Number.isNaN(timestamp.getTime())) {
                    return false;
                }

                if (filters.start && timestamp < filters.start) return false;
                if (filters.end && timestamp > filters.end) return false;
                if (filters.sessionId && record.sessionId !== filters.sessionId) return false;
                if (filters.projectId && record.projectId !== filters.projectId) return false;
                return true;
            })
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    _normalizeUsageRecord(event) {
        const inputTokens = this._numberOrZero(event.inputTokens);
        const outputTokens = this._numberOrZero(event.outputTokens);
        const thinkingTokens = this._numberOrZero(event.thinkingTokens);
        const explicitTokens = this._numberOrZero(event.tokens);
        const totalTokens = explicitTokens || inputTokens + outputTokens + thinkingTokens;

        return {
            ...event,
            tokens: totalTokens,
            inputTokens,
            outputTokens,
            thinkingTokens,
            cost: typeof event.cost === 'number' ? event.cost : this._numberOrZero(event.totalCost),
            latencyMs: typeof event.latencyMs === 'number' ? event.latencyMs : null,
            success: typeof event.success === 'boolean'
                ? event.success
                : (typeof event.status === 'string' ? event.status === 'success' : null),
            cacheHit: typeof event.cacheHit === 'boolean' ? event.cacheHit : null
        };
    }

    _buildUsageSummary(records, meta) {
        const byModel = {};
        const byType = {
            input: { tokens: 0, cost: 0 },
            output: { tokens: 0, cost: 0 },
            thinking: { tokens: 0, cost: 0 }
        };

        let totalTokens = 0;
        let totalCost = 0;
        let costTrackedRequests = 0;

        for (const record of records) {
            const model = record.model || 'unknown';
            if (!byModel[model]) {
                byModel[model] = { tokens: 0, cost: 0, requests: 0 };
            }

            byModel[model].tokens += record.tokens;
            byModel[model].requests += 1;
            totalTokens += record.tokens;

            if (record.cost > 0) {
                byModel[model].cost += record.cost;
                totalCost += record.cost;
                costTrackedRequests++;
            }

            byType.input.tokens += record.inputTokens;
            byType.output.tokens += record.outputTokens;
            byType.thinking.tokens += record.thinkingTokens;

            if (record.cost > 0 && record.tokens > 0) {
                byType.input.cost += record.cost * (record.inputTokens / record.tokens);
                byType.output.cost += record.cost * (record.outputTokens / record.tokens);
                byType.thinking.cost += record.cost * (record.thinkingTokens / record.tokens);
            }
        }

        return {
            period: meta.period,
            granularity: meta.granularity,
            totalTokens,
            totalCost: parseFloat(totalCost.toFixed(2)),
            totalRequests: records.length,
            costTrackedRequests,
            byModel: Object.fromEntries(
                Object.entries(byModel).map(([model, stats]) => [
                    model,
                    {
                        tokens: stats.tokens,
                        cost: parseFloat(stats.cost.toFixed(2)),
                        requests: stats.requests
                    }
                ])
            ),
            byType: {
                input: {
                    tokens: byType.input.tokens,
                    cost: parseFloat(byType.input.cost.toFixed(2))
                },
                output: {
                    tokens: byType.output.tokens,
                    cost: parseFloat(byType.output.cost.toFixed(2))
                },
                thinking: {
                    tokens: byType.thinking.tokens,
                    cost: parseFloat(byType.thinking.cost.toFixed(2))
                }
            },
            timeSeries: this._buildTimeSeries(records, meta.granularity),
            filters: {
                sessionId: meta.sessionId || null,
                projectId: meta.projectId || null,
                start: meta.start.toISOString(),
                end: meta.end.toISOString()
            }
        };
    }

    _buildTimeSeries(records, granularity) {
        const buckets = new Map();

        for (const record of records) {
            const date = new Date(record.timestamp);
            const key = this._getTimeBucketKey(date, granularity);
            if (!buckets.has(key)) {
                buckets.set(key, {
                    timestamp: key,
                    tokens: 0,
                    cost: 0,
                    requests: 0
                });
            }

            const bucket = buckets.get(key);
            bucket.tokens += record.tokens;
            bucket.cost += record.cost;
            bucket.requests += 1;
        }

        return [...buckets.values()]
            .map(bucket => ({
                ...bucket,
                cost: parseFloat(bucket.cost.toFixed(2))
            }))
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    _buildInvoice(period) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() + (period === 'previous' ? -1 : 0), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + (period === 'previous' ? 0 : 1), 1);
        const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;

        if (this._invoices.has(key)) {
            return this._invoices.get(key);
        }

        const summary = this._buildUsageSummary(
            this._getUsageRecords({ start, end }),
            { period: key, granularity: 'month', start, end }
        );
        const invoice = {
            period,
            invoiceId: `inv_${key.replace('-', '_')}`,
            startDate: this._formatLocalDate(start),
            endDate: this._formatLocalDate(new Date(end.getFullYear(), end.getMonth(), 0)),
            totalAmount: summary.totalCost,
            currency: 'USD',
            source: 'local_usage_records',
            lineItems: Object.entries(summary.byModel).map(([model, stats]) => ({
                model,
                tokens: stats.tokens,
                cost: stats.cost,
                requests: stats.requests
            }))
        };

        this._invoices.set(key, invoice);
        return invoice;
    }

    _listInvoiceSummaries() {
        const months = new Set();

        for (const record of this._usage.values()) {
            const date = new Date(record.timestamp);
            if (Number.isNaN(date.getTime())) {
                continue;
            }

            months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
        }

        return [...months]
            .sort()
            .reverse()
            .map(periodKey => {
                const [year, month] = periodKey.split('-').map(Number);
                const start = new Date(year, month - 1, 1);
                const end = new Date(year, month, 1);
                const summary = this._buildUsageSummary(
                    this._getUsageRecords({ start, end }),
                    { period: periodKey, granularity: 'month', start, end }
                );

                return {
                    id: `inv_${periodKey.replace('-', '_')}`,
                    period: periodKey,
                    amount: summary.totalCost,
                    status: 'tracked',
                    requests: summary.totalRequests
                };
            });
    }

    _getPeriodStart(period, reference = new Date()) {
        return new Date(reference.getTime() - this._getPeriodDays(period) * 24 * 60 * 60 * 1000);
    }

    _getPeriodDays(period) {
        switch (period) {
            case UsagePeriod.DAY:
                return 1;
            case UsagePeriod.WEEK:
                return 7;
            case UsagePeriod.MONTH:
                return 30;
            case UsagePeriod.QUARTER:
                return 90;
            default:
                return 30;
        }
    }

    _getCoverageDays(records, defaultStart, defaultEnd) {
        if (records.length === 0) {
            return 1;
        }

        const first = new Date(records[0].timestamp);
        const last = new Date(records[records.length - 1].timestamp);
        const start = Number.isNaN(first.getTime()) ? defaultStart : first;
        const end = Number.isNaN(last.getTime()) ? defaultEnd : last;
        return Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)) || 1);
    }

    _estimateForecastConfidence(coverageDays, recordsCount) {
        const coverageScore = Math.min(coverageDays / 30, 1);
        const volumeScore = Math.min(recordsCount / 100, 1);
        return parseFloat((0.2 + coverageScore * 0.45 + volumeScore * 0.3).toFixed(2));
    }

    _getTimeBucketKey(date, granularity) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');

        switch (granularity) {
            case 'hour':
                return `${year}-${month}-${day}T${hour}:00:00.000Z`;
            case 'week': {
                const weekStart = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
                weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
                return weekStart.toISOString();
            }
            case 'month':
                return `${year}-${month}-01T00:00:00.000Z`;
            case 'day':
            default:
                return `${year}-${month}-${day}T00:00:00.000Z`;
        }
    }

    _numberOrZero(value) {
        return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    }

    _formatLocalDate(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }
}

/**
 * Create a new ClaudeUsageController instance
 * @param {Object} [options] - Controller options
 * @returns {ClaudeUsageController} Controller instance
 */
export function createClaudeUsageController(options = {}) {
    return new ClaudeUsageController(options);
}

export default ClaudeUsageController;
