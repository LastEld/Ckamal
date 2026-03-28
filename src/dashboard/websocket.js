/**
 * CogniMesh v5.0 - Dashboard WebSocket Adapter
 * Adapter over unified WebSocket server for dashboard-specific functionality
 * @module dashboard/websocket
 */

import { WebSocketServer as UnifiedWebSocketServer } from '../websocket/server.js';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';

/**
 * Dashboard WebSocket adapter extending unified WebSocket server
 * Adds dashboard-specific notification methods and JWT authentication
 * @extends {UnifiedWebSocketServer}
 */
export class DashboardWebSocket extends UnifiedWebSocketServer {
  /**
   * Creates a DashboardWebSocket instance
   * @param {import('http').Server} [server] - HTTP server to attach to
   * @param {Object} [options={}] - Server options
   * @param {string} [options.jwtSecret] - JWT secret for authentication
   * @param {boolean} [options.authEnabled=true] - Whether authentication is enabled
   */
  constructor(server, options = {}) {
    super(server, {
      authenticate: options.authEnabled !== false,
      heartbeatInterval: options.heartbeatInterval || 30000,
      heartbeatTimeout: options.heartbeatTimeout || 60000,
    });

    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'cognimesh-secret';
    this.authEnabled = options.authEnabled !== false;

    // Presence tracking
    this.connectedClients = new Set();
    this.clientUserMap = new Map(); // socketId -> userId

    // Setup authentication handler
    this.on('authenticate', this.#handleAuthenticate.bind(this));
    this.on('connection', this.#handleConnection.bind(this));
  }

  /**
   * Handles new WebSocket connections for presence tracking
   * @param {import('../websocket/server.js').AuthenticatedSocket} socket - Client socket
   * @param {import('http').IncomingMessage} req - HTTP request
   * @private
   */
  #handleConnection(socket, req) {
    // Track connection
    this.connectedClients.add(socket.id);
    
    // Extract user from token if available
    const token = this.extractToken(req);
    if (token) {
      try {
        const decoded = jwt.verify(token, this.jwtSecret);
        this.clientUserMap.set(socket.id, decoded.id || decoded.userId || 'anonymous');
      } catch {
        this.clientUserMap.set(socket.id, 'anonymous');
      }
    } else {
      this.clientUserMap.set(socket.id, 'anonymous');
    }
    
    // Broadcast updated count
    this.broadcastPresence();
    
    // Listen for socket close to clean up
    socket.on('close', () => {
      this.connectedClients.delete(socket.id);
      this.clientUserMap.delete(socket.id);
      this.broadcastPresence();
    });
  }

  /**
   * Broadcasts presence update to all connected clients
   */
  broadcastPresence() {
    const uniqueUsers = new Set(this.clientUserMap.values());
    const presence = {
      type: 'presence.update',
      data: {
        totalConnections: this.connectedClients.size,
        uniqueUsers: uniqueUsers.size,
        timestamp: new Date().toISOString(),
      },
    };
    
    this.broadcast(presence);
  }

  /**
   * Gets current presence statistics
   * @returns {Object} Presence data
   */
  getPresence() {
    const uniqueUsers = new Set(this.clientUserMap.values());
    return {
      totalConnections: this.connectedClients.size,
      uniqueUsers: uniqueUsers.size,
    };
  }

  /**
   * Handles authentication requests
   * @param {import('../websocket/server.js').AuthenticatedSocket} socket - Client socket
   * @param {string} token - JWT token
   * @param {Function} callback - Callback function
   * @private
   */
  #handleAuthenticate(socket, token, callback) {
    if (!this.authEnabled) {
      callback({ success: true, userId: 'anonymous' });
      return;
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      callback({ success: true, userId: decoded.id || decoded.userId, user: decoded });
    } catch (err) {
      callback({ success: false, message: 'Invalid token' });
    }
  }

  /**
   * Extracts token from request URL or headers
   * @param {import('http').IncomingMessage} req - HTTP request
   * @returns {string|null} Token or null
   */
  extractToken(req) {
    // Try URL query parameter first
    const url = new URL(req.url, 'http://localhost');
    const tokenFromQuery = url.searchParams.get('token');
    if (tokenFromQuery) return tokenFromQuery;

    // Try Sec-WebSocket-Protocol header
    const protocol = req.headers['sec-websocket-protocol'];
    if (protocol) {
      const parts = protocol.split(',').map(p => p.trim());
      const authPart = parts.find(p => p.startsWith('auth.'));
      if (authPart) {
        return authPart.replace('auth.', '');
      }
    }

    return null;
  }

  // ============================================================================
  // Dashboard-specific notification methods
  // ============================================================================

  /**
   * Notifies clients about task update
   * @param {Object} task - Task data
   */
  notifyTaskUpdate(task) {
    this.broadcastToRoom('tasks', {
      type: 'task.updated',
      data: task,
      timestamp: new Date().toISOString(),
    });

    // Also notify quadrant-specific room if applicable
    if (task.quadrant) {
      this.broadcastToRoom(`quadrant:${task.quadrant}`, {
        type: 'task.updated',
        data: task,
      });
    }
  }

  /**
   * Notifies clients about new task
   * @param {Object} task - Task data
   */
  notifyTaskCreated(task) {
    this.broadcastToRoom('tasks', {
      type: 'task.created',
      data: task,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notifies clients about task deletion
   * @param {string} taskId - Task ID
   */
  notifyTaskDeleted(taskId) {
    this.broadcastToRoom('tasks', {
      type: 'task.deleted',
      data: { id: taskId },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notifies clients about task move between quadrants
   * @param {string} taskId - Task ID
   * @param {string} fromQuadrant - Source quadrant
   * @param {string} toQuadrant - Target quadrant
   */
  notifyTaskMoved(taskId, fromQuadrant, toQuadrant) {
    this.broadcastToRoom('tasks', {
      type: 'task.moved',
      data: { taskId, fromQuadrant, toQuadrant },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notifies clients about roadmap progress update
   * @param {string} roadmapId - Roadmap ID
   * @param {Object} progress - Progress data
   */
  notifyRoadmapProgress(roadmapId, progress) {
    this.broadcastToRoom(`roadmap:${roadmapId}`, {
      type: 'roadmap.progress',
      data: { roadmapId, progress },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notifies clients about roadmap update
   * @param {Object} roadmap - Roadmap data
   */
  notifyRoadmapUpdated(roadmap) {
    this.broadcastToRoom(`roadmap:${roadmap.id}`, {
      type: 'roadmap.updated',
      data: roadmap,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notifies clients about milestone reached
   * @param {string} roadmapId - Roadmap ID
   * @param {Object} milestone - Milestone data
   */
  notifyMilestoneReached(roadmapId, milestone) {
    this.broadcastToRoom(`roadmap:${roadmapId}`, {
      type: 'milestone.reached',
      data: { roadmapId, milestone },
      timestamp: new Date().toISOString(),
    });

    // Also broadcast to alerts
    this.notifyAlert({
      level: 'info',
      title: 'Milestone Reached',
      message: `Milestone "${milestone.name}" has been reached`,
      data: { roadmapId, milestone },
    });
  }

  /**
   * Sends alert notification to all clients
   * @param {Object} alert - Alert data
   */
  notifyAlert(alert) {
    this.broadcastToRoom('alerts', {
      type: 'alert.new',
      data: {
        ...alert,
        id: alert.id || this.generateId(),
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Notifies clients about resolved alert
   * @param {string} alertId - Alert ID
   */
  notifyAlertResolved(alertId) {
    this.broadcastToRoom('alerts', {
      type: 'alert.resolved',
      data: { id: alertId },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcasts system status to all connected clients
   * @param {Object} status - System status data
   */
  notifySystemStatus(status) {
    this.broadcast({
      type: 'system.status',
      data: status,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notifies clients about agent activity
   * @param {Object} activity - Agent activity data
   */
  notifyAgentActivity(activity) {
    this.broadcastToRoom('agents', {
      type: 'agent.activity',
      data: activity,
      timestamp: new Date().toISOString(),
    });
  }

  // ============================================================================
  // Utility methods
  // ============================================================================

  /**
   * Generates a unique ID
   * @returns {string} Unique ID
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets dashboard-specific statistics
   * @returns {Object} Statistics object
   */
  getDashboardStats() {
    const baseStats = this.getStats();
    return {
      ...baseStats,
      rooms: this.getRooms(),
    };
  }
}

export default DashboardWebSocket;
