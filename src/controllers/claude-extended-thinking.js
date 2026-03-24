/**
 * Claude Extended Thinking Controller
 * Extended thinking capabilities for Claude 3.7 Sonnet
 * 
 * @module controllers/claude-extended-thinking
 * @version 1.0.0
 */

import {
    validateRequest,
    formatResponse,
    handleError,
    generateId
} from './helpers.js';

/**
 * Thinking status
 * @readonly
 * @enum {string}
 */
export const ThinkingStatus = {
    DISABLED: 'disabled',
    ENABLED: 'enabled',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ERROR: 'error'
};

/**
 * Budget constraints
 * @readonly
 */
export const BUDGET_CONSTRAINTS = {
    MIN_BUDGET_TOKENS: 1024,
    MAX_BUDGET_TOKENS: 32000,
    DEFAULT_BUDGET_TOKENS: 16000
};

/**
 * Supported models for extended thinking
 * @readonly
 * @type {string[]}
 */
export const SUPPORTED_MODELS = ['claude-3-7-sonnet-20250219', 'claude-3-7-sonnet'];

/**
 * ClaudeExtendedThinkingController class
 * Manages extended thinking sessions for Claude 3.7 Sonnet
 */
export class ClaudeExtendedThinkingController {
    /**
     * Create a new ClaudeExtendedThinkingController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.gateway] - Extended thinking gateway
     */
    constructor(options = {}) {
        this.gateway = options.gateway || null;
        this.name = 'ClaudeExtendedThinkingController';
        this._sessions = new Map();
        this._defaultSessionId = null;
    }

    /**
     * Enable extended thinking for a session
     * @param {Object} [options] - Enable options
     * @param {string} [options.sessionId] - Session ID (creates new if not provided)
     * @param {boolean} [options.enabled=true] - Enable or disable
     * @param {number} [options.budgetTokens=16000] - Thinking budget in tokens
     * @param {string} [options.model='claude-3-7-sonnet'] - Model to use
     * @returns {Promise<Object>} Enable result
     */
    async enable(options = {}) {
        try {
            const model = options.model || 'claude-3-7-sonnet';
            
            if (!this._isModelSupported(model)) {
                return {
                    success: false,
                    error: `Model '${model}' does not support extended thinking. Supported: ${SUPPORTED_MODELS.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const budgetTokens = options.budgetTokens || BUDGET_CONSTRAINTS.DEFAULT_BUDGET_TOKENS;
            
            // Validate budget
            if (budgetTokens < BUDGET_CONSTRAINTS.MIN_BUDGET_TOKENS || 
                budgetTokens > BUDGET_CONSTRAINTS.MAX_BUDGET_TOKENS) {
                return {
                    success: false,
                    error: `Budget must be between ${BUDGET_CONSTRAINTS.MIN_BUDGET_TOKENS} and ${BUDGET_CONSTRAINTS.MAX_BUDGET_TOKENS} tokens`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const sessionId = options.sessionId || `thinking_${Date.now()}_${generateId()}`;
            const enabled = options.enabled !== false;

            const session = {
                id: sessionId,
                model,
                status: enabled ? ThinkingStatus.ENABLED : ThinkingStatus.DISABLED,
                config: {
                    budgetTokens,
                    enabled
                },
                budgetUsed: 0,
                requests: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            this._sessions.set(sessionId, session);

            if (!this._defaultSessionId) {
                this._defaultSessionId = sessionId;
            }

            return formatResponse({
                sessionId,
                model,
                status: session.status,
                config: session.config,
                message: enabled 
                    ? `Extended thinking enabled with ${budgetTokens} token budget`
                    : 'Extended thinking disabled'
            }, { enabled });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to enable extended thinking' });
        }
    }

    /**
     * Disable extended thinking for a session
     * @param {string} [sessionId] - Session ID (uses default if not provided)
     * @returns {Promise<Object>} Disable result
     */
    async disable(sessionId) {
        try {
            const id = sessionId || this._defaultSessionId;
            
            if (!id) {
                return {
                    success: false,
                    error: 'No session specified and no default session exists',
                    code: 'VALIDATION_ERROR'
                };
            }

            const session = this._sessions.get(id);
            if (!session) {
                return {
                    success: false,
                    error: `Session not found: ${id}`,
                    code: 'NOT_FOUND'
                };
            }

            session.status = ThinkingStatus.DISABLED;
            session.config.enabled = false;
            session.updatedAt = new Date().toISOString();

            return formatResponse({
                sessionId: id,
                status: session.status,
                message: 'Extended thinking disabled'
            }, { disabled: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to disable extended thinking' });
        }
    }

    /**
     * Set thinking budget
     * @param {number} budgetTokens - Budget in tokens
     * @param {string} [sessionId] - Session ID
     * @returns {Promise<Object>} Budget set result
     */
    async setBudget(budgetTokens, sessionId) {
        try {
            if (!budgetTokens || 
                budgetTokens < BUDGET_CONSTRAINTS.MIN_BUDGET_TOKENS || 
                budgetTokens > BUDGET_CONSTRAINTS.MAX_BUDGET_TOKENS) {
                return {
                    success: false,
                    error: `Budget must be between ${BUDGET_CONSTRAINTS.MIN_BUDGET_TOKENS} and ${BUDGET_CONSTRAINTS.MAX_BUDGET_TOKENS} tokens`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const id = sessionId || this._defaultSessionId;
            
            if (!id) {
                return {
                    success: false,
                    error: 'No session specified and no default session exists',
                    code: 'VALIDATION_ERROR'
                };
            }

            const session = this._sessions.get(id);
            if (!session) {
                return {
                    success: false,
                    error: `Session not found: ${id}`,
                    code: 'NOT_FOUND'
                };
            }

            const previous = session.config.budgetTokens;
            session.config.budgetTokens = budgetTokens;
            session.updatedAt = new Date().toISOString();

            return formatResponse({
                sessionId: id,
                budgetTokens,
                previousBudget: previous,
                budgetUsed: session.budgetUsed,
                budgetRemaining: budgetTokens - session.budgetUsed
            }, { budgetSet: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to set budget' });
        }
    }

    /**
     * Get thinking content from a response
     * @param {Object} [options] - Options
     * @param {string} [options.sessionId] - Session ID
     * @param {string} [options.responseId] - Specific response ID
     * @param {boolean} [options.includeChains=true] - Include reasoning chains
     * @param {boolean} [options.includeSteps=true] - Include step breakdown
     * @returns {Promise<Object>} Thinking content
     */
    async getThinking(options = {}) {
        try {
            const id = options.sessionId || this._defaultSessionId;
            
            if (!id) {
                return {
                    success: false,
                    error: 'No session specified and no default session exists',
                    code: 'VALIDATION_ERROR'
                };
            }

            const session = this._sessions.get(id);
            if (!session) {
                return {
                    success: false,
                    error: `Session not found: ${id}`,
                    code: 'NOT_FOUND'
                };
            }

            const request = options.responseId 
                ? session.requests.find(r => r.id === options.responseId)
                : session.requests[session.requests.length - 1];

            if (!request || !request.thinking) {
                return {
                    success: false,
                    error: 'No thinking content available',
                    code: 'NOT_FOUND',
                    message: 'Ensure you have made a request with extended thinking enabled'
                };
            }

            const result = {
                sessionId: id,
                responseId: options.responseId || request.id,
                available: request.thinking.available,
                hasThinking: request.thinking.hasThinking,
                hasRedacted: request.thinking.hasRedacted,
                totalTokens: request.thinking.totalTokens,
                blocksCount: request.thinking.blocksCount
            };

            if (options.includeChains !== false && request.thinking.reasoningChains) {
                result.reasoningChains = request.thinking.reasoningChains;
            }

            if (options.includeSteps !== false && request.thinking.steps) {
                result.steps = request.thinking.steps;
            }

            if (request.thinking.usage) {
                result.usage = request.thinking.usage;
            }

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get thinking content' });
        }
    }

    /**
     * Get thinking statistics
     * @param {Object} [options] - Options
     * @param {string} [options.sessionId] - Session ID (aggregates all if not provided)
     * @param {boolean} [options.includeHistory=false] - Include detailed history
     * @returns {Promise<Object>} Statistics
     */
    async getStats(options = {}) {
        try {
            if (options.sessionId) {
                const session = this._sessions.get(options.sessionId);
                if (!session) {
                    return {
                        success: false,
                        error: `Session not found: ${options.sessionId}`,
                        code: 'NOT_FOUND'
                    };
                }

                const stats = {
                    sessionId: session.id,
                    status: session.status,
                    config: session.config,
                    budgetUsed: session.budgetUsed,
                    budgetRemaining: session.config.budgetTokens - session.budgetUsed,
                    totalRequests: session.requests.length,
                    totalThinkingTokens: session.requests.reduce((sum, r) => 
                        sum + (r.thinking?.totalTokens || 0), 0)
                };

                if (options.includeHistory) {
                    stats.requests = session.requests;
                }

                return formatResponse(stats);
            }

            // Aggregate all sessions
            const allStats = {
                totalSessions: this._sessions.size,
                totalRequests: 0,
                totalThinkingTokens: 0,
                sessions: []
            };

            for (const [id, session] of this._sessions) {
                const stats = {
                    id,
                    requests: session.requests.length,
                    thinkingTokens: session.requests.reduce((sum, r) => 
                        sum + (r.thinking?.totalTokens || 0), 0),
                    config: session.config
                };
                allStats.totalRequests += stats.requests;
                allStats.totalThinkingTokens += stats.thinkingTokens;
                allStats.sessions.push(stats);
            }

            return formatResponse({
                aggregated: true,
                ...allStats
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get stats' });
        }
    }

    /**
     * Get optimization recommendations
     * @param {Object} [options] - Options
     * @param {string} [options.sessionId] - Session ID
     * @param {boolean} [options.applyRecommendations=false] - Auto-apply recommendations
     * @returns {Promise<Object>} Recommendations
     */
    async getRecommendations(options = {}) {
        try {
            const id = options.sessionId || this._defaultSessionId;
            
            if (!id) {
                return {
                    success: false,
                    error: 'No session specified',
                    code: 'VALIDATION_ERROR'
                };
            }

            const session = this._sessions.get(id);
            if (!session) {
                return {
                    success: false,
                    error: `Session not found: ${id}`,
                    code: 'NOT_FOUND'
                };
            }

            const budgetUtilization = session.budgetUsed / session.config.budgetTokens;
            const recommendations = [];

            if (budgetUtilization > 0.8) {
                recommendations.push({
                    action: 'increase_budget',
                    message: 'Budget utilization is high',
                    currentBudget: session.config.budgetTokens,
                    suggestedBudget: Math.min(
                        session.config.budgetTokens * 1.2,
                        BUDGET_CONSTRAINTS.MAX_BUDGET_TOKENS
                    )
                });
            } else if (budgetUtilization < 0.3 && session.requests.length > 5) {
                recommendations.push({
                    action: 'reduce_budget',
                    message: 'Budget may be over-allocated',
                    currentBudget: session.config.budgetTokens,
                    suggestedBudget: Math.max(
                        session.config.budgetTokens * 0.8,
                        BUDGET_CONSTRAINTS.MIN_BUDGET_TOKENS
                    ),
                    potentialSavings: session.config.budgetTokens - Math.max(
                        session.config.budgetTokens * 0.8,
                        BUDGET_CONSTRAINTS.MIN_BUDGET_TOKENS
                    )
                });
            }

            const applied = [];
            if (options.applyRecommendations) {
                for (const rec of recommendations) {
                    if (rec.action === 'increase_budget' || rec.action === 'reduce_budget') {
                        const result = await this.setBudget(Math.ceil(rec.suggestedBudget), id);
                        if (result.success) {
                            applied.push(rec);
                        }
                    }
                }
            }

            return formatResponse({
                sessionId: id,
                currentBudget: session.config.budgetTokens,
                recommendationsCount: recommendations.length,
                recommendations,
                applied: options.applyRecommendations ? applied : undefined
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get recommendations' });
        }
    }

    /**
     * Create a thinking request
     * @param {Object} params - Request parameters
     * @param {string} params.model - Model ID
     * @param {Array} params.messages - Messages
     * @param {Object} [thinkingConfig] - Thinking configuration
     * @returns {Promise<Object>} Request result with thinking
     */
    async createRequest(params, thinkingConfig = {}) {
        try {
            const validation = validateRequest({
                required: ['model', 'messages'],
                types: {
                    model: 'string',
                    messages: 'array'
                }
            }, params);

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!this._isModelSupported(params.model)) {
                return {
                    success: false,
                    error: 'Model does not support extended thinking',
                    code: 'VALIDATION_ERROR'
                };
            }

            const sessionId = thinkingConfig.sessionId || this._defaultSessionId;
            const session = sessionId ? this._sessions.get(sessionId) : null;

            if (!session || session.status !== ThinkingStatus.ENABLED) {
                return {
                    success: false,
                    error: 'Extended thinking is not enabled',
                    code: 'INVALID_REQUEST'
                };
            }

            const requestGateway =
                (this.gateway && typeof this.gateway.createThinkingRequest === 'function' && this.gateway.createThinkingRequest.bind(this.gateway)) ||
                (this.gateway && typeof this.gateway.createRequest === 'function' && this.gateway.createRequest.bind(this.gateway));

            let response;
            if (requestGateway) {
                response = await requestGateway(params, {
                    ...thinkingConfig,
                    sessionId,
                    budgetTokens: session.config.budgetTokens,
                    enableThinking: true
                });
            } else if (this.gateway && typeof this.gateway.sendMessage === 'function') {
                response = await this.gateway.sendMessage(params.messages, {
                    model: params.model,
                    maxTokens: params.maxTokens,
                    temperature: params.temperature,
                    sessionId,
                    enableThinking: true,
                    thinkingBudget: session.config.budgetTokens,
                    ...thinkingConfig
                });
            } else {
                return {
                    success: false,
                    error: 'Extended thinking gateway is not configured',
                    code: 'NOT_CONFIGURED'
                };
            }

            const responseData = response?.data ?? response;
            const thinking = responseData?.thinking;

            if (!thinking) {
                return {
                    success: false,
                    error: 'Gateway response did not include extended thinking data',
                    code: 'INVALID_RESPONSE'
                };
            }

            const thinkingTokens =
                thinking.totalTokens ??
                thinking.usage?.thinkingTokens ??
                responseData?.usage?.thinking_tokens ??
                responseData?.usage?.thinkingTokens ??
                0;
            const request = {
                id: responseData?.id || `req_${Date.now()}`,
                timestamp: new Date().toISOString(),
                thinking: {
                    available: thinking.available !== false,
                    hasThinking: Boolean(thinking),
                    hasRedacted: Boolean(thinking.hasRedacted || thinking.redacted),
                    totalTokens: thinkingTokens,
                    blocksCount: thinking.blocksCount || thinking.blocks?.length || 0,
                    reasoningChains: thinking.reasoningChains,
                    steps: thinking.steps,
                    usage: thinking.usage || {
                        thinkingTokens,
                        inputTokens: responseData?.usage?.input_tokens ?? responseData?.usage?.inputTokens ?? null,
                        outputTokens: responseData?.usage?.output_tokens ?? responseData?.usage?.outputTokens ?? null
                    }
                },
                response: {
                    content: responseData?.content ?? null,
                    model: responseData?.model ?? params.model
                }
            };

            session.requests.push(request);
            session.budgetUsed += request.thinking.totalTokens;
            session.updatedAt = new Date().toISOString();

            return formatResponse({
                requestId: request.id,
                thinking: request.thinking,
                response: request.response
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create request' });
        }
    }

    /**
     * Check if model supports extended thinking
     * @param {string} modelId - Model ID
     * @returns {boolean} Whether supported
     */
    isModelSupported(modelId) {
        return this._isModelSupported(modelId);
    }

    // Private methods

    /**
     * Check if model supports extended thinking
     * @private
     * @param {string} modelId - Model ID
     * @returns {boolean} Whether supported
     */
    _isModelSupported(modelId) {
        return SUPPORTED_MODELS.some(m => modelId.includes(m));
    }

    /**
     * Get or create session
     * @private
     * @param {string} [sessionId] - Session ID
     * @returns {Object} Session
     */
    _getOrCreateSession(sessionId) {
        if (sessionId && this._sessions.has(sessionId)) {
            return this._sessions.get(sessionId);
        }

        const newSession = {
            id: sessionId || `session_${Date.now()}`,
            status: ThinkingStatus.DISABLED,
            config: {},
            requests: [],
            createdAt: new Date().toISOString()
        };

        this._sessions.set(newSession.id, newSession);
        
        if (!this._defaultSessionId) {
            this._defaultSessionId = newSession.id;
        }

        return newSession;
    }
}

/**
 * Create a new ClaudeExtendedThinkingController instance
 * @param {Object} [options] - Controller options
 * @returns {ClaudeExtendedThinkingController} Controller instance
 */
export function createClaudeExtendedThinkingController(options = {}) {
    return new ClaudeExtendedThinkingController(options);
}

export default ClaudeExtendedThinkingController;
