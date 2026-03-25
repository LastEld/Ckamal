/**
 * Claude Usage Controller
 * Subscription-only usage tracking and analytics.
 * Metered billing, invoices, and budget alerts have been removed.
 *
 * @module controllers/claude-usage
 * @version 2.0.0
 */

import {
    formatResponse,
    handleError
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
 * Metric types (cost retained for backward compat but not actively tracked)
 * @readonly
 * @enum {string}
 */
export const MetricType = {
    TOKENS: 'tokens',
    REQUESTS: 'requests'
};

/**
 * ClaudeUsageController class
 * Manages usage tracking and analytics (subscription-only, no metered billing)
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
     * @returns {Promise<Object>} Dashboard data
     */
    async getDashboard(options = {}) {
        try {
            const dashboard = {
                timestamp: new Date().toISOString(),
                subscriptionMode: true
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
