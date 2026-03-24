/**
 * Claude Context Controller
 * Context window management and optimization
 * 
 * @module controllers/claude-context
 * @version 1.0.0
 */

import {
    validateRequest,
    formatResponse,
    handleError
} from './helpers.js';

/**
 * Window strategy types
 * @readonly
 * @enum {string}
 */
export const WindowStrategy = {
    FIXED: 'fixed',
    TOKEN_AWARE: 'token_aware',
    IMPORTANCE_BASED: 'importance_based',
    SUMMARY_BASED: 'summary_based',
    HYBRID: 'hybrid'
};

/**
 * Compression levels
 * @readonly
 * @enum {string}
 */
export const CompressionLevel = {
    NONE: 'none',
    LIGHT: 'light',
    MODERATE: 'moderate',
    AGGRESSIVE: 'aggressive'
};

/**
 * ClaudeContextController class
 * Manages context window optimization and compression
 */
export class ClaudeContextController {
    /**
     * Create a new ClaudeContextController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.gateway] - Context gateway
     */
    constructor(options = {}) {
        this.gateway = options.gateway || null;
        this.name = 'ClaudeContextController';
        this._strategy = WindowStrategy.HYBRID;
        this._config = {};
    }

    /**
     * Optimize context for API calls
     * @param {Array} messages - Messages to optimize
     * @param {Object} [options] - Optimization options
     * @param {string} [options.model='claude-3-5-sonnet'] - Model ID
     * @param {WindowStrategy} [options.strategy='hybrid'] - Window strategy
     * @param {number} [options.maxTokens] - Max tokens for context
     * @param {CompressionLevel} [options.compression='moderate'] - Compression level
     * @param {boolean} [options.preserveSystem=true] - Preserve system messages
     * @returns {Promise<Object>} Optimized context
     */
    async optimize(messages, options = {}) {
        try {
            const validation = validateRequest({
                required: ['messages'],
                types: {
                    messages: 'array',
                    maxTokens: 'number',
                    preserveSystem: 'boolean'
                }
            }, { messages, ...options });

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const strategy = options.strategy || WindowStrategy.HYBRID;
            const model = options.model || 'claude-3-5-sonnet';
            const contextWindow = this._getContextWindowSize(model);
            const maxTokens = options.maxTokens || Math.floor(contextWindow * 0.7);

            // Mock optimization
            const originalTokens = this._estimateTokens(messages);
            const optimized = this._applyStrategy(messages, strategy, {
                maxTokens,
                preserveSystem: options.preserveSystem !== false,
                compressionLevel: options.compression || CompressionLevel.MODERATE
            });
            const finalTokens = this._estimateTokens(optimized);

            return formatResponse({
                messages: optimized,
                stats: {
                    originalCount: messages.length,
                    finalCount: optimized.length,
                    originalTokens,
                    finalTokens,
                    tokensSaved: originalTokens - finalTokens,
                    utilizationPercent: Math.round((finalTokens / contextWindow) * 100)
                },
                strategy,
                model
            }, { optimized: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to optimize context' });
        }
    }

    /**
     * Compress messages to fit token budget
     * @param {Array} messages - Messages to compress
     * @param {Object} [options] - Compression options
     * @param {number} [options.targetTokens] - Target token count
     * @param {CompressionLevel} [options.level='moderate'] - Compression level
     * @param {string[]} [options.techniques] - Specific techniques to apply
     * @returns {Promise<Object>} Compression result
     */
    async compress(messages, options = {}) {
        try {
            const validation = validateRequest({
                required: ['messages'],
                types: {
                    messages: 'array',
                    targetTokens: 'number'
                }
            }, { messages, ...options });

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const originalTokens = this._estimateTokens(messages);
            const level = options.level || CompressionLevel.MODERATE;
            const factor = {
                [CompressionLevel.NONE]: 1,
                [CompressionLevel.LIGHT]: 0.9,
                [CompressionLevel.MODERATE]: 0.75,
                [CompressionLevel.AGGRESSIVE]: 0.6
            };
            const targetTokens = options.targetTokens || Math.max(1, Math.floor(originalTokens * (factor[level] || factor[CompressionLevel.MODERATE])));
            const compressed = this._compressMessages(messages, targetTokens);
            const finalTokens = this._estimateTokens(compressed);

            return formatResponse({
                messages: compressed,
                stats: {
                    originalCount: messages.length,
                    finalCount: compressed.length,
                    originalTokens,
                    finalTokens,
                    tokensSaved: originalTokens - finalTokens,
                    compressionRatio: originalTokens > 0 ? finalTokens / originalTokens : 1,
                    targetTokens
                },
                techniquesApplied: ['normalization', 'deduplication', 'token_budget_trim'],
                level
            }, { compressed: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to compress context' });
        }
    }

    /**
     * Prioritize messages by importance
     * @param {Array} messages - Messages to prioritize
     * @param {Object} [options] - Prioritization options
     * @param {number} [options.topN] - Return only top N messages
     * @param {number} [options.minPriority] - Minimum priority threshold (0-100)
     * @param {Object} [options.weights] - Custom priority weights
     * @returns {Promise<Object>} Prioritized messages
     */
    async prioritize(messages, options = {}) {
        try {
            const validation = validateRequest({
                required: ['messages'],
                types: {
                    messages: 'array',
                    topN: 'number',
                    minPriority: 'number'
                }
            }, { messages, ...options });

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const prioritized = this._rankMessages(messages);

            let result = prioritized;
            if (options.topN) {
                result = result.slice(0, options.topN);
            }
            if (options.minPriority !== undefined) {
                result = result.filter(p => p.priority >= options.minPriority);
            }

            return formatResponse({
                messages: result.map(p => p.message),
                priorities: result.map(p => ({
                    index: p.index,
                    role: p.message.role,
                    priority: p.priority,
                    tokens: p.tokens,
                    factors: p.factors
                })),
                stats: {
                    total: messages.length,
                    selected: result.length,
                    dropped: messages.length - result.length
                }
            }, { prioritized: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to prioritize messages' });
        }
    }

    /**
     * Set window management strategy
     * @param {WindowStrategy} strategy - Strategy to use
     * @param {Object} [config] - Strategy configuration
     * @returns {Object} Strategy set result
     */
    setStrategy(strategy, config = {}) {
        try {
            if (!Object.values(WindowStrategy).includes(strategy)) {
                return {
                    success: false,
                    error: `Invalid strategy. Valid: ${Object.values(WindowStrategy).join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const previousStrategy = this._strategy;
            this._strategy = strategy;
            this._config = config;

            return formatResponse({
                strategy,
                config,
                previousStrategy
            }, { strategySet: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to set strategy' });
        }
    }

    /**
     * Get current strategy
     * @returns {Object} Current strategy configuration
     */
    getStrategy() {
        return formatResponse({
            strategy: this._strategy,
            config: this._config,
            availableStrategies: Object.values(WindowStrategy)
        });
    }

    /**
     * Get context statistics
     * @param {Array} messages - Messages to analyze
     * @param {Object} [options] - Stats options
     * @param {string} [options.model='claude-3-5-sonnet'] - Model for context window
     * @returns {Promise<Object>} Context statistics
     */
    async getStats(messages, options = {}) {
        try {
            const validation = validateRequest({
                required: ['messages'],
                types: {
                    messages: 'array'
                }
            }, { messages, ...options });

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const model = options.model || 'claude-3-5-sonnet';
            const contextWindow = this._getContextWindowSize(model);
            const totalTokens = this._estimateTokens(messages);
            const utilization = (totalTokens / contextWindow) * 100;

            // Calculate per-message breakdown
            const perMessage = messages.map((msg, idx) => ({
                index: idx,
                role: msg.role,
                tokens: this._estimateTokens([msg]),
                preview: typeof msg.content === 'string' 
                    ? msg.content.slice(0, 100) 
                    : JSON.stringify(msg.content).slice(0, 100)
            }));

            return formatResponse({
                stats: {
                    messageCount: messages.length,
                    totalTokens,
                    maxTokens: contextWindow,
                    utilizationPercent: Math.round(utilization),
                    status: utilization > 90 ? 'critical' :
                            utilization > 75 ? 'warning' :
                            utilization > 50 ? 'elevated' : 'normal',
                    remainingTokens: contextWindow - totalTokens,
                    averageTokensPerMessage: Math.round(totalTokens / messages.length)
                },
                messageBreakdown: perMessage,
                model: {
                    id: model,
                    contextWindow
                }
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get stats' });
        }
    }

    /**
     * Estimate token count for text or messages
     * @param {Object} params - Estimation parameters
     * @param {string} [params.text] - Text to estimate
     * @param {Array} [params.messages] - Messages to estimate
     * @param {string} [params.model='claude-3-5-sonnet'] - Model ID
     * @returns {Object} Token estimation
     */
    estimateTokens(params) {
        try {
            if (!params.text && !params.messages) {
                return {
                    success: false,
                    error: 'Either text or messages must be provided',
                    code: 'VALIDATION_ERROR'
                };
            }

            const model = params.model || 'claude-3-5-sonnet';
            let total = 0;
            let perMessage = [];

            if (params.messages) {
                perMessage = params.messages.map(m => ({
                    role: m.role,
                    tokens: this._estimateTokens([m])
                }));
                total = perMessage.reduce((sum, m) => sum + m.tokens, 0);
            } else {
                total = Math.ceil(params.text.length / 4); // Rough estimate
            }

            const contextWindow = this._getContextWindowSize(model);
            const utilization = total / contextWindow;

            return formatResponse({
                tokens: total,
                model,
                contextWindow,
                utilizationPercent: Math.round(utilization * 100),
                status: utilization > 0.9 ? 'critical' :
                        utilization > 0.75 ? 'warning' :
                        utilization > 0.5 ? 'elevated' : 'normal',
                perMessage
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to estimate tokens' });
        }
    }

    /**
     * Summarize conversation history
     * @param {Array} messages - Messages to summarize
     * @param {Object} [options] - Summarization options
     * @param {number} [options.messagesToSummarize] - Number of messages to summarize
     * @param {number} [options.preserveRecent=5] - Number of recent messages to preserve
     * @returns {Promise<Object>} Summarization result
     */
    async summarize(messages, options = {}) {
        try {
            const validation = validateRequest({
                required: ['messages'],
                types: {
                    messages: 'array',
                    messagesToSummarize: 'number',
                    preserveRecent: 'number'
                }
            }, { messages, ...options });

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const preserveRecent = options.preserveRecent || 5;
            const messagesToSummarize = options.messagesToSummarize || 
                                        Math.max(0, messages.length - preserveRecent);

            const toSummarize = messages.slice(0, messagesToSummarize);
            const preserved = messages.slice(-preserveRecent);
            const summarizer =
                (this.gateway && typeof this.gateway.summarizeContext === 'function' && this.gateway.summarizeContext.bind(this.gateway)) ||
                (this.gateway && typeof this.gateway.summarize === 'function' && this.gateway.summarize.bind(this.gateway));

            if (!summarizer) {
                return {
                    success: false,
                    error: 'Context summarizer is not configured',
                    code: 'NOT_CONFIGURED'
                };
            }

            const summaryResult = await summarizer(toSummarize, options);
            const summary = typeof summaryResult === 'string'
                ? summaryResult
                : summaryResult?.summary || summaryResult?.data?.summary;

            if (!summary) {
                return {
                    success: false,
                    error: 'Context summarizer did not return a summary',
                    code: 'INVALID_RESPONSE'
                };
            }

            return formatResponse({
                summary,
                preservedMessages: preserved,
                summarizedCount: toSummarize.length,
                preservedCount: preserved.length,
                tokensBefore: this._estimateTokens(messages),
                tokensAfter: this._estimateTokens(preserved) + this._estimateTokens([{ content: summary }])
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to summarize' });
        }
    }

    // Private methods

    /**
     * Get context window size for model
     * @private
     * @param {string} model - Model ID
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

        return 200000; // Default
    }

    /**
     * Estimate tokens for messages
     * @private
     * @param {Array} messages - Messages
     * @returns {number} Estimated tokens
     */
    _estimateTokens(messages) {
        // Simple estimation: ~4 characters per token
        const text = messages.map(m => {
            if (typeof m.content === 'string') return m.content;
            if (Array.isArray(m.content)) {
                return m.content.map(c => typeof c === 'string' ? c : c.text || '').join('');
            }
            return JSON.stringify(m.content);
        }).join('');

        return Math.ceil(text.length / 4) + messages.length * 4; // + overhead per message
    }

    _rankMessages(messages) {
        const totalMessages = Math.max(messages.length, 1);

        return messages
            .map((msg, idx) => {
                const tokens = this._estimateTokens([msg]);
                const roleScore = msg.role === 'system'
                    ? 100
                    : msg.role === 'user'
                        ? 75
                        : msg.role === 'tool'
                            ? 65
                            : 55;
                const recencyScore = totalMessages === 1 ? 30 : Math.round((idx / (totalMessages - 1)) * 30);
                const tokenScore = Math.min(Math.round(tokens / 10), 20);
                const hasStructuredContent = Array.isArray(msg.content) || (msg.content && typeof msg.content === 'object');
                const structureScore = hasStructuredContent ? 10 : 0;
                const priority = roleScore + recencyScore + tokenScore + structureScore;

                return {
                    message: msg,
                    index: idx,
                    priority,
                    tokens,
                    factors: {
                        recency: recencyScore,
                        role: roleScore,
                        size: tokenScore,
                        structure: structureScore
                    }
                };
            })
            .sort((a, b) => b.priority - a.priority || a.index - b.index);
    }

    _compressMessages(messages, targetTokens) {
        const normalized = messages.map(message => ({
            ...message,
            content: typeof message.content === 'string'
                ? message.content.replace(/\s+/g, ' ').trim()
                : message.content
        }));
        const deduplicated = normalized.filter((message, index, list) => {
            if (index === 0) {
                return true;
            }

            const previous = list[index - 1];
            return previous.role !== message.role || previous.content !== message.content;
        });

        return this._trimByTokens(deduplicated, targetTokens, true);
    }

    _selectImportantMessages(messages, maxTokens, preserveSystem) {
        const systemMessages = preserveSystem ? messages.filter(message => message.role === 'system') : [];
        const systemTokens = this._estimateTokens(systemMessages);
        let remainingTokens = Math.max(0, maxTokens - systemTokens);
        const ranked = this._rankMessages(messages.filter(message => message.role !== 'system'));
        const selected = [];

        for (const entry of ranked) {
            if (entry.tokens <= remainingTokens) {
                selected.push(entry);
                remainingTokens -= entry.tokens;
            }
        }

        return [
            ...systemMessages,
            ...selected
                .sort((a, b) => a.index - b.index)
                .map(entry => entry.message)
        ];
    }

    /**
     * Apply window strategy to messages
     * @private
     * @param {Array} messages - Messages
     * @param {WindowStrategy} strategy - Strategy
     * @param {Object} config - Config
     * @returns {Array} Filtered messages
     */
    _applyStrategy(messages, strategy, config) {
        const { maxTokens, preserveSystem } = config;
        let result = [...messages];

        // Always preserve system messages if requested
        const systemMessages = preserveSystem 
            ? messages.filter(m => m.role === 'system') 
            : [];

        switch (strategy) {
            case WindowStrategy.FIXED:
                // Keep last N messages
                const systemCount = systemMessages.length;
                result = [...systemMessages, ...messages.slice(-(config.maxMessages || 50) + systemCount)];
                break;

            case WindowStrategy.TOKEN_AWARE:
                // Keep messages until token limit
                result = this._trimByTokens(messages, maxTokens, preserveSystem);
                break;

            case WindowStrategy.IMPORTANCE_BASED:
                result = this._selectImportantMessages(messages, maxTokens, preserveSystem);
                break;

            case WindowStrategy.SUMMARY_BASED:
            case WindowStrategy.HYBRID:
            default:
                result = this._estimateTokens(messages) > maxTokens
                    ? this._selectImportantMessages(messages, maxTokens, preserveSystem)
                    : messages;
        }

        return result;
    }

    /**
     * Trim messages to fit token budget
     * @private
     * @param {Array} messages - Messages
     * @param {number} maxTokens - Max tokens
     * @param {boolean} preserveSystem - Preserve system messages
     * @returns {Array} Trimmed messages
     */
    _trimByTokens(messages, maxTokens, preserveSystem) {
        const systemMessages = preserveSystem 
            ? messages.filter(m => m.role === 'system') 
            : [];
        
        let remainingTokens = maxTokens - this._estimateTokens(systemMessages);
        const selected = [];
        const nonSystem = messages.filter(m => m.role !== 'system');

        // Add from end until limit
        for (let i = nonSystem.length - 1; i >= 0; i--) {
            const msg = nonSystem[i];
            const msgTokens = this._estimateTokens([msg]);
            if (msgTokens <= remainingTokens) {
                selected.unshift(msg);
                remainingTokens -= msgTokens;
            } else {
                break;
            }
        }

        return [...systemMessages, ...selected];
    }
}

/**
 * Create a new ClaudeContextController instance
 * @param {Object} [options] - Controller options
 * @returns {ClaudeContextController} Controller instance
 */
export function createClaudeContextController(options = {}) {
    return new ClaudeContextController(options);
}

export default ClaudeContextController;
