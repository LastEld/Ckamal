/**
 * Claude Tokens Controller
 * Token management and optimization
 * 
 * @module controllers/claude-tokens
 * @version 1.0.0
 */

import {
    formatResponse,
    handleError,
    generateId
} from './helpers.js';

/**
 * Budget types
 * @readonly
 * @enum {string}
 */
export const BudgetType = {
    REQUEST: 'request',
    SESSION: 'session',
    HOUR: 'hour',
    DAY: 'day',
    MONTH: 'month',
    PROJECT: 'project'
};

/**
 * Truncation strategies
 * @readonly
 * @enum {string}
 */
export const TruncationStrategy = {
    HEAD: 'head',
    TAIL: 'tail',
    MIDDLE: 'middle',
    HEAD_TAIL: 'head_tail',
    SMART: 'smart'
};

/**
 * Alert levels
 * @readonly
 * @enum {string}
 */
export const AlertLevel = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'critical'
};

/**
 * ClaudeTokensController class
 * Manages token counting, optimization, and budget tracking
 */
export class ClaudeTokensController {
    /**
     * Create a new ClaudeTokensController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.gateway] - Token API gateway
     */
    constructor(options = {}) {
        this.gateway = options.gateway || null;
        this.name = 'ClaudeTokensController';
        this._budgets = new Map();
        this._usage = new Map();
        this._sessionId = generateId('session');
        this._alerts = [];
    }

    /**
     * Count tokens in text or messages
     * @param {Object} params - Counting parameters
     * @param {string} [params.text] - Text to count
     * @param {Array} [params.messages] - Messages to count
     * @param {string} [params.model='claude-3-5-sonnet'] - Model ID
     * @param {Object} [options] - Counting options
     * @param {boolean} [options.includeBreakdown=true] - Include detailed breakdown
     * @returns {Promise<Object>} Token count result
     */
    async count(params, options = {}) {
        try {
            if (!params.text && !params.messages) {
                return {
                    success: false,
                    error: 'Either text or messages must be provided',
                    code: 'VALIDATION_ERROR'
                };
            }

            const model = params.model || 'claude-3-5-sonnet';
            const includeBreakdown = options.includeBreakdown !== false;

            let total = 0;
            let breakdown = {};

            if (params.text) {
                const textTokens = this._estimateTextTokens(params.text);
                total = textTokens;
                if (includeBreakdown) {
                    breakdown.text = textTokens;
                }
            }

            if (params.messages) {
                const messageTokens = params.messages.map(m => ({
                    role: m.role,
                    tokens: this._estimateMessageTokens(m)
                }));
                const messagesTotal = messageTokens.reduce((sum, m) => sum + m.tokens, 0);
                total += messagesTotal;
                if (includeBreakdown) {
                    breakdown.messages = messageTokens;
                    breakdown.messagesTotal = messagesTotal;
                }
            }

            // Add tool and image tokens if present
            if (params.tools) {
                const toolTokens = this._estimateToolsTokens(params.tools);
                total += toolTokens;
                if (includeBreakdown) {
                    breakdown.tools = toolTokens;
                }
            }

            if (params.images) {
                const imageTokens = this._estimateImagesTokens(params.images);
                total += imageTokens;
                if (includeBreakdown) {
                    breakdown.images = imageTokens;
                }
            }

            return formatResponse({
                total,
                model,
                breakdown: includeBreakdown ? breakdown : undefined,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to count tokens' });
        }
    }

    /**
     * Optimize content to reduce token count
     * @param {Object} params - Content to optimize
     * @param {string} [params.text] - Text to optimize
     * @param {Array} [params.messages] - Messages to optimize
     * @param {Object} [options] - Optimization options
     * @param {number} [options.targetTokens] - Target token count
     * @param {string[]} [options.strategies] - Strategies to apply
     * @param {TruncationStrategy} [options.truncationStrategy='smart'] - Truncation strategy
     * @returns {Promise<Object>} Optimization result
     */
    async optimize(params, options = {}) {
        try {
            if (!params.text && !params.messages) {
                return {
                    success: false,
                    error: 'Either text or messages must be provided',
                    code: 'VALIDATION_ERROR'
                };
            }

            const originalCount = await this.count(params, { includeBreakdown: false });
            const originalTokens = originalCount.data.total;
            const strategies = options.strategies || ['normalize', 'dedup', 'compress'];

            let optimized = params.text ? { text: params.text } : { messages: [...params.messages] };
            const applied = [];

            // Apply strategies
            if (strategies.includes('normalize')) {
                optimized = this._normalize(optimized);
                applied.push('normalize');
            }

            if (strategies.includes('dedup')) {
                optimized = this._deduplicate(optimized);
                applied.push('deduplicate');
            }

            if (strategies.includes('compress')) {
                optimized = this._compress(optimized);
                applied.push('compress');
            }

            // Apply truncation if target specified and still over
            if (options.targetTokens) {
                const current = await this.count(optimized, { includeBreakdown: false });
                if (current.data.total > options.targetTokens) {
                    optimized = this._truncate(optimized, options.targetTokens, options.truncationStrategy || TruncationStrategy.SMART);
                    applied.push('truncate');
                }
            }

            const finalCount = await this.count(optimized, { includeBreakdown: false });
            const finalTokens = finalCount.data.total;

            return formatResponse({
                optimized: true,
                originalTokens,
                finalTokens,
                tokensSaved: originalTokens - finalTokens,
                compressionRatio: finalTokens / originalTokens,
                strategiesApplied: applied,
                content: params.text ? optimized.text : optimized.messages
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to optimize tokens' });
        }
    }

    /**
     * Set token budget
     * @param {BudgetType} type - Budget type
     * @param {number} limit - Token limit
     * @param {Object} [options] - Budget options
     * @param {boolean} [options.hardLimit=false] - Enforce hard limit
     * @returns {Promise<Object>} Budget set result
     */
    async setBudget(type, limit, options = {}) {
        try {
            if (!Object.values(BudgetType).includes(type)) {
                return {
                    success: false,
                    error: `Invalid budget type. Valid: ${Object.values(BudgetType).join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            if (limit !== null && (typeof limit !== 'number' || limit < 0)) {
                return {
                    success: false,
                    error: 'Limit must be a positive number or null for unlimited',
                    code: 'VALIDATION_ERROR'
                };
            }

            const budget = {
                type,
                limit,
                hard: options.hardLimit || false,
                used: 0,
                remaining: limit,
                setAt: new Date().toISOString()
            };

            this._budgets.set(type, budget);

            return formatResponse(budget, { budgetSet: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to set budget' });
        }
    }

    /**
     * Check current budget status
     * @param {Object} [options] - Check options
     * @param {number} [options.precheckTokens] - Tokens to precheck
     * @param {boolean} [options.detailed=false] - Include detailed history
     * @returns {Object} Budget status
     */
    checkBudget(options = {}) {
        try {
            const budgets = {};
            
            for (const [type, budget] of this._budgets) {
                budgets[type] = {
                    ...budget,
                    utilization: budget.limit ? (budget.used / budget.limit) * 100 : 0,
                    status: this._getBudgetStatus(budget)
                };
            }

            const result = {
                budgets,
                session: {
                    id: this._sessionId,
                    totalUsed: Array.from(this._usage.values()).reduce((sum, u) => sum + u.tokens, 0)
                },
                recentAlerts: this._alerts.slice(-5)
            };

            if (options.precheckTokens) {
                const precheck = this._precheckBudget(options.precheckTokens);
                result.precheck = precheck;
            }

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to check budget' });
        }
    }

    /**
     * Forecast token usage
     * @param {Object} [options] - Forecast options
     * @param {number} [options.hours=24] - Hours to forecast
     * @param {boolean} [options.includeRecommendations=true] - Include recommendations
     * @returns {Object} Forecast result
     */
    forecast(options = {}) {
        try {
            const hours = options.hours || 24;
            
            // Calculate current rate
            const sessionUsage = Array.from(this._usage.values());
            const totalTokens = sessionUsage.reduce((sum, u) => sum + u.tokens, 0);
            const timeElapsed = sessionUsage.length > 0 
                ? (Date.now() - new Date(sessionUsage[0].timestamp)) / (1000 * 60 * 60)
                : 1;
            
            const hourlyRate = timeElapsed > 0 ? totalTokens / timeElapsed : 0;
            const projectedTokens = hourlyRate * hours;

            const result = {
                period: `${hours}h`,
                currentHourlyRate: Math.round(hourlyRate),
                projectedTokens: Math.round(projectedTokens),
                confidence: Math.min(0.95, sessionUsage.length / 100),
                riskLevel: hourlyRate > 10000 ? 'high' : hourlyRate > 5000 ? 'medium' : 'low'
            };

            if (options.includeRecommendations && result.riskLevel !== 'low') {
                result.recommendations = this._generateRecommendations(hourlyRate);
            }

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to forecast' });
        }
    }

    /**
     * Configure budget alerts
     * @param {Object} config - Alert configuration
     * @param {Object} [config.thresholds] - Alert thresholds (0-1)
 * @param {number} [config.cooldownSeconds] - Cooldown between alerts
     * @returns {Object} Configuration result
     */
    configureAlerts(config) {
        try {
            this._alertConfig = {
                thresholds: config.thresholds || { info: 0.5, warning: 0.8, critical: 0.95 },
                cooldown: (config.cooldownSeconds || 60) * 1000
            };

            return formatResponse(this._alertConfig);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to configure alerts' });
        }
    }

    /**
     * Analyze content for optimization opportunities
     * @param {Object} params - Content to analyze
     * @param {string} [params.text] - Text to analyze
     * @param {Array} [params.messages] - Messages to analyze
     * @param {string} [params.model='claude-3-5-sonnet'] - Model ID
     * @returns {Object} Analysis result
     */
    analyze(params) {
        try {
            const count = this.count(params, { includeBreakdown: true });
            const model = params.model || 'claude-3-5-sonnet';
            const contextWindow = this._getContextWindowSize(model);
            const tokens = count.data.total;
            const utilization = tokens / contextWindow;

            const opportunities = [];
            
            if (utilization > 0.75) {
                opportunities.push({
                    type: 'high_utilization',
                    message: 'Context window utilization is high',
                    suggestion: 'Consider using context optimization strategies'
                });
            }

            if (params.text && params.text.length > 10000) {
                opportunities.push({
                    type: 'long_content',
                    message: 'Content is very long',
                    suggestion: 'Consider summarizing or splitting content'
                });
            }

            return formatResponse({
                tokens,
                model,
                utilization: Math.round(utilization * 100),
                status: utilization > 0.9 ? 'critical' : utilization > 0.75 ? 'warning' : 'normal',
                shouldOptimize: utilization > 0.75 || tokens > contextWindow * 0.5,
                opportunities,
                recommendedStrategy: utilization > 0.9 ? 'aggressive_compression' : 'standard_optimization'
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to analyze content' });
        }
    }

    /**
     * Validate content against model limits
     * @param {Object} params - Validation parameters
     * @param {string} [params.content] - Content to validate
     * @param {Array} [params.messages] - Messages to validate
     * @param {string} [params.model='claude-3-5-sonnet'] - Model ID
     * @param {number} [params.maxOutputTokens=4096] - Expected output tokens
     * @returns {Object} Validation result
     */
    validate(params) {
        try {
            const model = params.model || 'claude-3-5-sonnet';
            const maxOutputTokens = params.maxOutputTokens || 4096;
            const contextWindow = this._getContextWindowSize(model);

            const count = this.count(
                { text: params.content, messages: params.messages, model },
                { includeBreakdown: false }
            );
            
            const inputTokens = count.data.total;
            const totalTokens = inputTokens + maxOutputTokens;
            const remaining = contextWindow - totalTokens;

            return formatResponse({
                valid: remaining >= 0,
                inputTokens,
                outputTokens: maxOutputTokens,
                totalTokens,
                contextWindow,
                remaining,
                utilization: Math.round((totalTokens / contextWindow) * 100),
                status: remaining < 0 ? 'exceeds_limit' : remaining < 10000 ? 'critical' : 'ok',
                error: remaining < 0 ? 'Content exceeds model context window' : undefined
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to validate' });
        }
    }

    /**
     * Record token usage
     * @param {number} tokens - Tokens used
     * @param {Object} [metadata] - Usage metadata
     */
    recordUsage(tokens, metadata = {}) {
        const usage = {
            id: generateId('usage'),
            tokens,
            timestamp: new Date().toISOString(),
            ...metadata
        };

        this._usage.set(usage.id, usage);

        // Update budgets
        for (const [type, budget] of this._budgets) {
            budget.used += tokens;
            budget.remaining = budget.limit ? budget.limit - budget.used : null;
            
            // Check for alerts
            this._checkBudgetAlert(type, budget);
        }
    }

    // Private methods

    /**
     * Estimate text tokens
     * @private
     * @param {string} text - Text
     * @returns {number} Estimated tokens
     */
    _estimateTextTokens(text) {
        // Rough estimate: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

    /**
     * Estimate message tokens
     * @private
     * @param {Object} message - Message
     * @returns {number} Estimated tokens
     */
    _estimateMessageTokens(message) {
        const content = typeof message.content === 'string' 
            ? message.content 
            : JSON.stringify(message.content);
        return this._estimateTextTokens(content) + 4; // + overhead
    }

    /**
     * Estimate tools tokens
     * @private
     * @param {Array} tools - Tools
     * @returns {number} Estimated tokens
     */
    _estimateToolsTokens(tools) {
        return tools.length * 100; // Rough estimate
    }

    /**
     * Estimate images tokens
     * @private
     * @param {Array} images - Images
     * @returns {number} Estimated tokens
     */
    _estimateImagesTokens(images) {
        return images.reduce((sum, img) => {
            // Rough estimate based on dimensions
            const pixels = (img.width || 1024) * (img.height || 1024);
            return sum + Math.ceil(pixels / 750);
        }, 0);
    }

    /**
     * Get context window size for model
     * @private
     * @param {string} model - Model
     * @returns {number} Context window size
     */
    _getContextWindowSize(model) {
        const sizes = {
            'claude-3-opus': 200000,
            'claude-3-sonnet': 200000,
            'claude-3-haiku': 200000,
            'claude-3-5-sonnet': 200000,
            'claude-3-7-sonnet': 200000
        };

        for (const [key, size] of Object.entries(sizes)) {
            if (model.includes(key)) return size;
        }

        return 200000;
    }

    /**
     * Normalize content
     * @private
     * @param {Object} content - Content
     * @returns {Object} Normalized content
     */
    _normalize(content) {
        if (content.text) {
            return {
                text: content.text
                    .replace(/\s+/g, ' ')
                    .replace(/\n\s*\n/g, '\n')
                    .trim()
            };
        }
        return content;
    }

    /**
     * Deduplicate content
     * @private
     * @param {Object} content - Content
     * @returns {Object} Deduplicated content
     */
    _deduplicate(content) {
        if (content.messages) {
            const seen = new Set();
            const unique = [];
            for (const msg of content.messages) {
                const key = `${msg.role}:${msg.content}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(msg);
                }
            }
            return { messages: unique };
        }
        return content;
    }

    /**
     * Compress content
     * @private
     * @param {Object} content - Content
     * @returns {Object} Compressed content
     */
    _compress(content) {
        if (content.text) {
            return {
                text: content.text
                    .split(/\r?\n/)
                    .map(line => line.replace(/\s+/g, ' ').trim())
                    .filter((line, index, lines) => line.length > 0 && lines.indexOf(line) === index)
                    .join('\n')
            };
        }

        if (content.messages) {
            return this._deduplicate({
                messages: content.messages.map(message => ({
                    ...message,
                    content: typeof message.content === 'string'
                        ? message.content.replace(/\s+/g, ' ').trim()
                        : message.content
                }))
            });
        }

        return content;
    }

    /**
     * Truncate content to target
     * @private
     * @param {Object} content - Content
     * @param {number} target - Target tokens
     * @param {TruncationStrategy} strategy - Strategy
     * @returns {Object} Truncated content
     */
    _truncate(content, target, strategy) {
        if (content.text) {
            return {
                text: this._truncateText(content.text, target, strategy)
            };
        }

        if (content.messages) {
            return {
                messages: this._truncateMessages(content.messages, target, strategy)
            };
        }

        return content;
    }

    _truncateText(text, target, strategy) {
        const maxChars = Math.max(1, target * 4);
        if (text.length <= maxChars) {
            return text;
        }

        switch (strategy) {
            case TruncationStrategy.HEAD:
                return text.slice(0, maxChars);
            case TruncationStrategy.TAIL:
                return text.slice(-maxChars);
            case TruncationStrategy.MIDDLE: {
                const half = Math.floor(maxChars / 2);
                return `${text.slice(0, half)}\n...\n${text.slice(-half)}`;
            }
            case TruncationStrategy.HEAD_TAIL: {
                const head = Math.floor(maxChars * 0.6);
                const tail = maxChars - head;
                return `${text.slice(0, head)}\n...\n${text.slice(-tail)}`;
            }
            case TruncationStrategy.SMART:
            default: {
                const lines = text.split(/\r?\n/);
                const important = lines.filter(line => line.trim().length > 0);
                const joined = important.join('\n');
                if (joined.length <= maxChars) {
                    return joined;
                }

                const head = Math.floor(maxChars * 0.5);
                const tail = maxChars - head;
                return `${joined.slice(0, head)}\n...\n${joined.slice(-tail)}`;
            }
        }
    }

    _truncateMessages(messages, target, strategy) {
        const total = messages.reduce((sum, message) => sum + this._estimateMessageTokens(message), 0);
        if (total <= target) {
            return messages;
        }

        switch (strategy) {
            case TruncationStrategy.HEAD:
                return this._trimMessagesFromStart(messages, target);
            case TruncationStrategy.TAIL:
                return this._trimMessagesFromEnd(messages, target);
            case TruncationStrategy.MIDDLE: {
                const half = Math.max(1, Math.floor(target / 2));
                const head = this._trimMessagesFromStart(messages, half);
                const remaining = Math.max(0, target - head.reduce((sum, message) => sum + this._estimateMessageTokens(message), 0));
                const tail = this._trimMessagesFromEnd(messages.slice(head.length), remaining);
                return [...head, ...tail];
            }
            case TruncationStrategy.HEAD_TAIL: {
                const headBudget = Math.max(1, Math.floor(target * 0.6));
                const head = this._trimMessagesFromStart(messages, headBudget);
                const remaining = Math.max(0, target - head.reduce((sum, message) => sum + this._estimateMessageTokens(message), 0));
                const tail = this._trimMessagesFromEnd(messages.slice(head.length), remaining);
                return [...head, ...tail];
            }
            case TruncationStrategy.SMART:
            default: {
                const systemMessages = messages.filter(message => message.role === 'system');
                const nonSystem = messages.filter(message => message.role !== 'system');
                const systemTokens = systemMessages.reduce((sum, message) => sum + this._estimateMessageTokens(message), 0);
                const remaining = Math.max(0, target - systemTokens);
                return [...systemMessages, ...this._trimMessagesFromEnd(nonSystem, remaining)];
            }
        }
    }

    _trimMessagesFromStart(messages, targetTokens) {
        let used = 0;
        const selected = [];

        for (const message of messages) {
            const messageTokens = this._estimateMessageTokens(message);
            if (used + messageTokens > targetTokens) {
                break;
            }

            selected.push(message);
            used += messageTokens;
        }

        return selected;
    }

    _trimMessagesFromEnd(messages, targetTokens) {
        let used = 0;
        const selected = [];

        for (let index = messages.length - 1; index >= 0; index--) {
            const message = messages[index];
            const messageTokens = this._estimateMessageTokens(message);
            if (used + messageTokens > targetTokens) {
                continue;
            }

            selected.unshift(message);
            used += messageTokens;
        }

        return selected;
    }

    /**
     * Get budget status
     * @private
     * @param {Object} budget - Budget
     * @returns {string} Status
     */
    _getBudgetStatus(budget) {
        if (!budget.limit) return 'unlimited';
        const ratio = budget.used / budget.limit;
        if (ratio >= 1) return 'exceeded';
        if (ratio >= 0.95) return 'critical';
        if (ratio >= 0.8) return 'warning';
        return 'ok';
    }

    /**
     * Precheck budget
     * @private
     * @param {number} tokens - Tokens to check
     * @returns {Object} Precheck result
     */
    _precheckBudget(tokens) {
        const violations = [];
        
        for (const [type, budget] of this._budgets) {
            if (budget.limit && budget.hard) {
                if (budget.used + tokens > budget.limit) {
                    violations.push({
                        type,
                        remaining: budget.limit - budget.used,
                        requested: tokens,
                        wouldExceedBy: budget.used + tokens - budget.limit
                    });
                }
            }
        }

        return {
            allowed: violations.length === 0,
            violations
        };
    }

    /**
     * Check budget alert
     * @private
     * @param {string} type - Budget type
     * @param {Object} budget - Budget
     */
    _checkBudgetAlert(type, budget) {
        if (!budget.limit || !this._alertConfig) return;

        const ratio = budget.used / budget.limit;
        const thresholds = this._alertConfig.thresholds;

        let level = null;
        if (ratio >= thresholds.critical) level = AlertLevel.CRITICAL;
        else if (ratio >= thresholds.warning) level = AlertLevel.WARNING;
        else if (ratio >= thresholds.info) level = AlertLevel.INFO;

        if (level) {
            // Check cooldown
            const lastAlert = this._alerts.find(a => a.type === type && a.level === level);
            const now = Date.now();
            if (!lastAlert || (now - new Date(lastAlert.timestamp).getTime()) > this._alertConfig.cooldown) {
                this._alerts.push({
                    type,
                    level,
                    message: `${type} budget at ${Math.round(ratio * 100)}%`,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    /**
     * Generate recommendations
     * @private
     * @param {number} rate - Hourly rate
     * @returns {Array} Recommendations
     */
    _generateRecommendations(rate) {
        const recs = [];
        
        if (rate > 10000) {
            recs.push({
                type: 'reduce_usage',
                message: 'Token usage is very high',
                action: 'Consider using smaller models or reducing context'
            });
        }

        return recs;
    }
}

/**
 * Create a new ClaudeTokensController instance
 * @param {Object} [options] - Controller options
 * @returns {ClaudeTokensController} Controller instance
 */
export function createClaudeTokensController(options = {}) {
    return new ClaudeTokensController(options);
}

export default ClaudeTokensController;
