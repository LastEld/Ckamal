/**
 * @fileoverview WebSocket module exports - Enhanced real-time communication
 * @module websocket
 */

import DefaultWebSocketServer, { WebSocketServer } from './server.js';
import { StreamManager } from './stream-manager.js';
import { WebSocketClient, createWebSocketClient } from './client.js';
import { RedisAdapter, createRedisAdapter } from './redis-adapter.js';

export { WebSocketServer, StreamManager, WebSocketClient, createWebSocketClient, RedisAdapter, createRedisAdapter };

/**
 * @typedef {import('./server.js').ConnectionOptions} ConnectionOptions
 * @typedef {import('./server.js').AuthenticatedSocket} AuthenticatedSocket
 * @typedef {import('./server.js').RoomInfo} RoomInfo
 * @typedef {import('./server.js').ActivityEvent} ActivityEvent
 * @typedef {import('./server.js').Notification} Notification
 * @typedef {import('./stream-manager.js').StreamConfig} StreamConfig
 * @typedef {import('./stream-manager.js').ManagedStream} ManagedStream
 * @typedef {import('./client.js').WebSocketClientOptions} WebSocketClientOptions
 * @typedef {import('./client.js').ConnectionState} ConnectionState
 * @typedef {import('./redis-adapter.js').RedisAdapterOptions} RedisAdapterOptions
 * @typedef {import('./redis-adapter.js').RedisMessage} RedisMessage
 */

/**
 * Create a WebSocket server instance
 * @param {import('http').Server} [server] - HTTP server
 * @param {import('./server.js').ConnectionOptions} [options] - Server options
 * @returns {WebSocketServer} WebSocket server instance
 */
export function createWebSocketServer(server, options) {
  return new WebSocketServer(server, options);
}

/**
 * Create a stream manager instance
 * @param {import('./stream-manager.js').StreamConfig} [config] - Stream configuration
 * @returns {StreamManager} Stream manager instance
 */
export function createStreamManager(config) {
  return new StreamManager(config);
}

/**
 * Create a WebSocket client instance
 * @param {import('./client.js').WebSocketClientOptions} options - Client options
 * @returns {WebSocketClient} WebSocket client instance
 */
export function createClient(options) {
  return new WebSocketClient(options);
}

export default DefaultWebSocketServer;
