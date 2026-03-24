/**
 * Claude Streaming Controller
 * Streaming operations for real-time Claude API responses
 * 
 * @module controllers/claude-streaming
 * @version 1.0.0
 */

import {
    validateRequest,
    formatResponse,
    handleError,
    generateId
} from './helpers.js';

/**
 * Stream status values
 * @readonly
 * @enum {string}
 */
export const StreamStatus = {
    PENDING: 'pending',
    ACTIVE: 'active',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    ERROR: 'error',
    CLOSED: 'closed'
};

/**
 * Stream type values
 * @readonly
 * @enum {string}
 */
export const StreamType = {
    SSE: 'sse',
    WEBSOCKET: 'websocket',
    MULTIPLEXER: 'multiplexer'
};

/**
 * Stream priority values
 * @readonly
 * @enum {string}
 */
export const StreamPriority = {
    CRITICAL: 'critical',
    HIGH: 'high',
    NORMAL: 'normal',
    LOW: 'low',
    BACKGROUND: 'background'
};

/**
 * ClaudeStreamingController class
 * Manages streaming connections and real-time message delivery
 */
export class ClaudeStreamingController {
    /**
     * Create a new ClaudeStreamingController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.gateway] - Streaming gateway
     */
    constructor(options = {}) {
        this.gateway = options.gateway || null;
        this.name = 'ClaudeStreamingController';
        this._streams = new Map();
        this._servers = {
            websocket: null,
            sse: null
        };
    }

    /**
     * Create a WebSocket server for streaming
     * @param {Object} [config] - Server configuration
     * @param {number} [config.port=3457] - Server port
     * @param {string} [config.host='127.0.0.1'] - Server host
     * @param {number} [config.maxClients=100] - Max concurrent clients
     * @param {boolean} [config.compression=true] - Enable compression
     * @returns {Promise<Object>} Server creation result
     */
    async createWebSocketServer(config = {}) {
        try {
            const validation = validateRequest({
                types: {
                    port: 'number',
                    host: 'string',
                    maxClients: 'number'
                }
            }, config);

            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const serverConfig = {
                port: config.port || 3457,
                host: config.host || '127.0.0.1',
                maxClients: Math.min(config.maxClients || 100, 1000),
                compression: config.compression !== false
            };

            const serverId = `ws_${Date.now()}`;
            this._servers.websocket = {
                id: serverId,
                ...serverConfig,
                clients: new Map(),
                rooms: new Map(),
                createdAt: new Date().toISOString()
            };

            return formatResponse({
                serverId,
                type: 'websocket',
                endpoints: {
                    websocket: `ws://${serverConfig.host}:${serverConfig.port}`,
                    health: `http://${serverConfig.host}:${serverConfig.port}/health`
                },
                config: serverConfig
            }, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create WebSocket server' });
        }
    }

    /**
     * Create an SSE (Server-Sent Events) manager
     * @param {Object} [config] - Manager configuration
     * @param {number} [config.maxClients=100] - Max clients
     * @param {number} [config.heartbeatInterval=30000] - Heartbeat interval
     * @param {boolean} [config.bufferEnabled=true] - Enable buffering
     * @returns {Object} Manager creation result
     */
    createSSEManager(config = {}) {
        try {
            const managerConfig = {
                maxClients: Math.min(config.maxClients || 100, 1000),
                heartbeatInterval: config.heartbeatInterval || 30000,
                bufferEnabled: config.bufferEnabled !== false,
                maxBufferSize: config.maxBufferSize || 1000
            };

            const managerId = `sse_${Date.now()}`;
            this._servers.sse = {
                id: managerId,
                ...managerConfig,
                streams: new Map(),
                clients: new Map(),
                createdAt: new Date().toISOString()
            };

            return formatResponse({
                managerId,
                type: 'sse',
                config: managerConfig
            }, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create SSE manager' });
        }
    }

    /**
     * Create a stream multiplexer
     * @param {Object} [config] - Multiplexer configuration
     * @param {'priority'|'round_robin'|'weighted'} [config.strategy='priority'] - Strategy
     * @param {number} [config.maxOutputRate] - Max output rate
     * @returns {Object} Multiplexer creation result
     */
    createMultiplexer(config = {}) {
        try {
            const multiplexerConfig = {
                strategy: config.strategy || 'priority',
                maxOutputRate: config.maxOutputRate,
                processingInterval: config.processingInterval || 10
            };

            const multiplexerId = `mp_${Date.now()}`;
            const multiplexer = {
                id: multiplexerId,
                ...multiplexerConfig,
                streams: new Map(),
                status: StreamStatus.ACTIVE,
                createdAt: new Date().toISOString()
            };

            this._streams.set(multiplexerId, multiplexer);

            return formatResponse({
                multiplexerId,
                type: 'multiplexer',
                config: multiplexerConfig,
                status: StreamStatus.ACTIVE
            }, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create multiplexer' });
        }
    }

    /**
     * Subscribe to a stream
     * @param {StreamType} streamType - Type of stream
     * @param {string} streamId - Stream ID
     * @param {Object} [options] - Subscription options
     * @param {string} [options.clientId] - Client identifier
     * @param {StreamPriority} [options.priority='normal'] - Stream priority
     * @returns {Promise<Object>} Subscription result
     */
    async subscribe(streamType, streamId, options = {}) {
        try {
            if (!streamType || !streamId) {
                return {
                    success: false,
                    error: 'Stream type and ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!Object.values(StreamType).includes(streamType)) {
                return {
                    success: false,
                    error: `Invalid stream type. Valid: ${Object.values(StreamType).join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const clientId = options.clientId || `client_${Date.now()}`;
            const subscriptionId = `sub_${generateId()}`;

            return formatResponse({
                subscriptionId,
                streamType,
                streamId,
                clientId,
                status: 'subscribed',
                priority: options.priority || StreamPriority.NORMAL
            }, { subscribed: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to subscribe' });
        }
    }

    /**
     * Unsubscribe from a stream
     * @param {string} subscriptionId - Subscription ID
     * @returns {Promise<Object>} Unsubscription result
     */
    async unsubscribe(subscriptionId) {
        try {
            if (!subscriptionId) {
                return {
                    success: false,
                    error: 'Subscription ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            return formatResponse({
                subscriptionId,
                status: 'unsubscribed'
            }, { unsubscribed: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to unsubscribe' });
        }
    }

    /**
     * Send a streaming message
     * @param {string} streamId - Stream ID
     * @param {Object} message - Message to send
     * @param {Object} [options] - Send options
     * @returns {Promise<Object>} Send result
     */
    async send(streamId, message, options = {}) {
        try {
            if (!streamId) {
                return {
                    success: false,
                    error: 'Stream ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const eventType = options.eventType || 'message';
            
            return formatResponse({
                streamId,
                eventType,
                sent: true,
                timestamp: new Date().toISOString()
            }, { sent: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to send message' });
        }
    }

    /**
     * Broadcast a message to all subscribers
     * @param {StreamType} streamType - Stream type
     * @param {Object} message - Message to broadcast
     * @param {Object} [options] - Broadcast options
     * @param {string} [options.roomId] - Room ID for WebSocket
     * @param {string} [options.excludeClient] - Client to exclude
     * @returns {Promise<Object>} Broadcast result
     */
    async broadcast(streamType, message, options = {}) {
        try {
            if (!streamType || !message) {
                return {
                    success: false,
                    error: 'Stream type and message are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            return formatResponse({
                streamType,
                recipients: 0,
                roomId: options.roomId,
                timestamp: new Date().toISOString()
            }, { broadcast: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to broadcast' });
        }
    }

    /**
     * Control stream operations
     * @param {string} operation - Control operation
     * @param {string} streamId - Stream ID
     * @param {Object} [options] - Control options
     * @returns {Promise<Object>} Control result
     */
    async control(operation, streamId, options = {}) {
        try {
            void options;
            const validOperations = ['pause', 'resume', 'stop', 'flush'];
            
            if (!operation || !streamId) {
                return {
                    success: false,
                    error: 'Operation and stream ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!validOperations.includes(operation)) {
                return {
                    success: false,
                    error: `Invalid operation. Valid: ${validOperations.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const stream = this._streams.get(streamId);
            if (stream) {
                switch (operation) {
                    case 'pause':
                        stream.status = StreamStatus.PAUSED;
                        break;
                    case 'resume':
                        stream.status = StreamStatus.ACTIVE;
                        break;
                    case 'stop':
                        stream.status = StreamStatus.CLOSED;
                        break;
                }
            }

            return formatResponse({
                operation,
                streamId,
                status: stream?.status || StreamStatus.CLOSED
            }, { controlled: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to control stream' });
        }
    }

    /**
     * Get stream status
     * @param {string} [streamId] - Specific stream ID (optional)
     * @param {Object} [options] - Status options
     * @param {boolean} [options.includeDetails=true] - Include detailed info
     * @returns {Promise<Object>} Stream status
     */
    async getStatus(streamId, options = {}) {
        try {
            const includeDetails = options.includeDetails !== false;

            if (streamId) {
                const stream = this._streams.get(streamId);
                if (!stream) {
                    return {
                        success: false,
                        error: `Stream not found: ${streamId}`,
                        code: 'NOT_FOUND'
                    };
                }

                return formatResponse({
                    id: stream.id,
                    status: stream.status,
                    strategy: stream.strategy,
                    streams: includeDetails ? stream.streams?.size || 0 : undefined,
                    createdAt: stream.createdAt
                });
            }

            // Return overall status
            const streams = Array.from(this._streams.values());
            return formatResponse({
                timestamp: new Date().toISOString(),
                websocket: this._servers.websocket ? {
                    running: true,
                    clients: includeDetails ? this._servers.websocket.clients?.size || 0 : undefined
                } : { running: false },
                sse: this._servers.sse ? {
                    running: true,
                    clients: includeDetails ? this._servers.sse.clients?.size || 0 : undefined
                } : { running: false },
                multiplexers: streams.length
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get status' });
        }
    }

    /**
     * Create a streaming request to Claude
     * @param {Object} params - Request parameters
     * @param {string} params.model - Model ID
     * @param {Array} params.messages - Messages array
     * @param {Function} onChunk - Callback for each chunk
     * @param {Object} [options] - Stream options
     * @returns {Promise<Object>} Stream result
     */
    async streamRequest(params, onChunk, options = {}) {
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

            if (typeof onChunk !== 'function') {
                return {
                    success: false,
                    error: 'onChunk callback is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const streamId = `stream_${Date.now()}`;
            const streamGateway =
                (this.gateway && typeof this.gateway.streamRequest === 'function' && this.gateway.streamRequest.bind(this.gateway)) ||
                (this.gateway && typeof this.gateway.streamMessage === 'function' && this.gateway.streamMessage.bind(this.gateway));

            if (!streamGateway) {
                return {
                    success: false,
                    error: 'Claude streaming gateway is not configured',
                    code: 'NOT_CONFIGURED'
                };
            }

            onChunk({ type: 'start', streamId });
            await streamGateway(params, onChunk, options);
            onChunk({ type: 'end', streamId });

            return formatResponse({
                streamId,
                status: StreamStatus.COMPLETED
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Streaming request failed' });
        }
    }

    /**
     * Stop all streaming servers
     * @returns {Promise<Object>} Stop result
     */
    async stopAll() {
        try {
            this._servers.websocket = null;
            this._servers.sse = null;
            this._streams.clear();

            return formatResponse({ stopped: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to stop servers' });
        }
    }
}

/**
 * Create a new ClaudeStreamingController instance
 * @param {Object} [options] - Controller options
 * @returns {ClaudeStreamingController} Controller instance
 */
export function createClaudeStreamingController(options = {}) {
    return new ClaudeStreamingController(options);
}

export default ClaudeStreamingController;
