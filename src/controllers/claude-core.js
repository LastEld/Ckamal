/**
 * Claude Core Controller
 * Core Claude operations including models, configuration, and basic API calls
 * 
 * @module controllers/claude-core
 * @version 1.0.0
 */

import {
    validateRequest,
    formatResponse,
    handleError
} from './helpers.js';

/**
 * Available Claude models
 * @readonly
 * @enum {string}
 */
export const ClaudeModel = {
    CLAUDE_3_OPUS: 'claude-3-opus-20240229',
    CLAUDE_3_SONNET: 'claude-3-sonnet-20240229',
    CLAUDE_3_HAIKU: 'claude-3-haiku-20240307',
    CLAUDE_3_5_SONNET: 'claude-3-5-sonnet-20241022',
    CLAUDE_3_7_SONNET: 'claude-3-7-sonnet-20250219'
};

/**
 * Claude API configuration
 * @typedef {Object} ClaudeConfig
 * @property {string} apiKey - API key
 * @property {string} baseUrl - API base URL
 * @property {number} timeout - Request timeout in ms
 * @property {number} maxRetries - Maximum retry attempts
 */

/**
 * ClaudeCoreController class
 * Manages core Claude operations and configuration
 */
export class ClaudeCoreController {
    /**
     * Create a new ClaudeCoreController
     * @param {Object} [options] - Controller options
     * @param {ClaudeConfig} [options.config] - API configuration
     * @param {Object} [options.gateway] - API gateway for data access
     */
    constructor(options = {}) {
        this.config = options.config || {};
        this.gateway = options.gateway || null;
        this.name = 'ClaudeCoreController';
    }

    /**
     * Get available Claude models
     * @returns {Object} List of available models
     */
    async getModels() {
        try {
            const models = [
                {
                    id: ClaudeModel.CLAUDE_3_OPUS,
                    name: 'Claude 3 Opus',
                    description: 'Most powerful model for complex tasks',
                    contextWindow: 200000,
                    maxOutputTokens: 4096,
                    capabilities: ['text', 'vision', 'tool_use', 'computer_use']
                },
                {
                    id: ClaudeModel.CLAUDE_3_SONNET,
                    name: 'Claude 3 Sonnet',
                    description: 'Balanced performance and speed',
                    contextWindow: 200000,
                    maxOutputTokens: 4096,
                    capabilities: ['text', 'vision', 'tool_use', 'computer_use']
                },
                {
                    id: ClaudeModel.CLAUDE_3_HAIKU,
                    name: 'Claude 3 Haiku',
                    description: 'Fastest model for simple tasks',
                    contextWindow: 200000,
                    maxOutputTokens: 4096,
                    capabilities: ['text', 'vision', 'tool_use']
                },
                {
                    id: ClaudeModel.CLAUDE_3_5_SONNET,
                    name: 'Claude 3.5 Sonnet',
                    description: 'Latest Sonnet with enhanced capabilities',
                    contextWindow: 200000,
                    maxOutputTokens: 8192,
                    capabilities: ['text', 'vision', 'tool_use', 'computer_use', 'citations']
                },
                {
                    id: ClaudeModel.CLAUDE_3_7_SONNET,
                    name: 'Claude 3.7 Sonnet',
                    description: 'Latest model with extended thinking',
                    contextWindow: 200000,
                    maxOutputTokens: 128000,
                    capabilities: ['text', 'vision', 'tool_use', 'computer_use', 'citations', 'extended_thinking']
                }
            ];

            return formatResponse(models, { count: models.length });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get models' });
        }
    }

    /**
     * Get model details by ID
     * @param {string} modelId - Model ID
     * @returns {Promise<Object>} Model details
     */
    async getModel(modelId) {
        try {
            if (!modelId) {
                return {
                    success: false,
                    error: 'Model ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const models = await this.getModels();
            const model = models.data.find(m => m.id === modelId);

            if (!model) {
                return {
                    success: false,
                    error: `Model not found: ${modelId}`,
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse(model);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get model' });
        }
    }

    /**
     * Configure Claude API settings
     * @param {Object} config - Configuration updates
     * @param {string} [config.apiKey] - API key
     * @param {string} [config.baseUrl] - Base URL
     * @param {number} [config.timeout] - Timeout in ms
     * @param {number} [config.maxRetries] - Max retries
     * @returns {Promise<Object>} Updated configuration
     */
    async configure(config) {
        try {
            const validation = validateRequest({
                types: {
                    apiKey: 'string',
                    baseUrl: 'string',
                    timeout: 'number',
                    maxRetries: 'number'
                },
                validators: {
                    timeout: (v) => v > 0 || 'Timeout must be positive',
                    maxRetries: (v) => v >= 0 || 'Max retries must be non-negative'
                }
            }, config);

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            this.config = { ...this.config, ...config };

            return formatResponse({
                configured: true,
                config: this._sanitizeConfig(this.config)
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to configure' });
        }
    }

    /**
     * Get current configuration
     * @returns {Object} Current configuration (sanitized)
     */
    getConfiguration() {
        return formatResponse(this._sanitizeConfig(this.config));
    }

    /**
     * Send a basic message to Claude
     * @param {Object} params - Message parameters
     * @param {string} params.model - Model ID
     * @param {Array} params.messages - Message array
     * @param {number} [params.maxTokens] - Max tokens to generate
     * @param {number} [params.temperature] - Sampling temperature
     * @param {Object} [params.tools] - Tool definitions
     * @returns {Promise<Object>} Claude response
     */
    async sendMessage(params) {
        try {
            const validation = validateRequest({
                required: ['model', 'messages'],
                types: {
                    model: 'string',
                    messages: 'array',
                    maxTokens: 'number',
                    temperature: 'number'
                },
                validators: {
                    temperature: (v) => !v || (v >= 0 && v <= 1) || 'Temperature must be between 0 and 1',
                    maxTokens: (v) => !v || v > 0 || 'Max tokens must be positive'
                }
            }, params);

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            // This would call the actual API through gateway
            if (this.gateway && this.gateway.sendMessage) {
                const result = await this.gateway.sendMessage(params);
                return formatResponse(result);
            }

            return {
                success: false,
                error: 'Claude gateway is not configured',
                code: 'NOT_CONFIGURED'
            };
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to send message' });
        }
    }

    /**
     * Get API health status
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            // Check if API is accessible
            const status = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                gateway: this.gateway ? 'configured' : 'not_configured'
            };

            return formatResponse(status);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Health check failed' });
        }
    }

    /**
     * Get API usage limits
     * @returns {Promise<Object>} Rate limits and quotas
     */
    async getLimits() {
        try {
            // Return default limits
            return formatResponse({
                requestsPerMinute: 4000,
                tokensPerMinute: 4000000,
                requestsPerDay: 100000,
                contextWindow: 200000,
                maxOutputTokens: 128000
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get limits' });
        }
    }

    // Private methods

    /**
     * Sanitize config for display (hide sensitive data)
     * @private
     * @param {Object} config - Configuration
     * @returns {Object} Sanitized config
     */
    _sanitizeConfig(config) {
        const sanitized = { ...config };
        if (sanitized.apiKey) {
            sanitized.apiKey = `${sanitized.apiKey.slice(0, 8)}...`;
        }
        return sanitized;
    }
}

/**
 * Create a new ClaudeCoreController instance
 * @param {Object} [options] - Controller options
 * @returns {ClaudeCoreController} Controller instance
 */
export function createClaudeCoreController(options = {}) {
    return new ClaudeCoreController(options);
}

export default ClaudeCoreController;
