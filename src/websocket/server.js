/**
 * @fileoverview Enhanced WebSocket Server with room-based subscriptions, 
 * presence tracking, message history, typing indicators, and real-time collaboration
 * @module websocket/server
 */

import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';

/**
 * @typedef {Object} ConnectionOptions
 * @property {boolean} [authenticate=true] - Whether to require authentication
 * @property {number} [heartbeatInterval=30000] - Heartbeat interval in ms
 * @property {number} [heartbeatTimeout=60000] - Heartbeat timeout in ms
 * @property {number} [messageHistoryLimit=100] - Max messages per room to keep in history
 * @property {number} [typingTimeout=5000] - Typing indicator timeout in ms
 * @property {number} [presenceTimeout=60000] - Presence inactivity timeout in ms
 * @property {boolean} [enablePresence=true] - Enable presence tracking
 * @property {boolean} [enableHistory=true] - Enable message history
 * @property {boolean} [enableTyping=true] - Enable typing indicators
 * @property {boolean} [enableCursors=true] - Enable cursor tracking
 * @property {boolean} [enableActivityFeed=true] - Enable activity feed
 * @property {boolean} [enableNotifications=true] - Enable notification center
 * @property {Function} [messagePersistenceAdapter] - Adapter for message persistence
 * @property {Function} [presenceAdapter] - Adapter for distributed presence (e.g., Redis)
 */

/**
 * @typedef {Object} AuthenticatedSocket
 * @extends {WebSocket}
 * @property {string} id - Unique connection ID
 * @property {boolean} isAuthenticated - Authentication status
 * @property {string} [userId] - Authenticated user ID
 * @property {string} [userName] - User display name
 * @property {string} [userAvatar] - User avatar URL
 * @property {Set<string>} rooms - Subscribed rooms
 * @property {number} lastPing - Last ping timestamp
 * @property {NodeJS.Timeout} [heartbeatTimer] - Heartbeat timer
 * @property {Map<string, any>} presence - Presence data per room
 * @property {Map<string, NodeJS.Timeout>} typingTimers - Typing indicator timers
 * @property {Object} cursor - Current cursor position
 * @property {Date} connectedAt - Connection timestamp
 * @property {Map<string, Date>} roomJoinedAt - When user joined each room
 */

/**
 * @typedef {Object} RoomInfo
 * @property {string} name - Room name
 * @property {Set<string>} members - Set of user IDs
 * @property {Array<Object>} history - Message history
 * @property {Map<string, Object>} presence - User presence data
 * @property {Set<string>} typingUsers - Users currently typing
 * @property {Map<string, Object>} cursors - User cursor positions
 * @property {Date} createdAt - Room creation time
 * @property {Object} metadata - Room metadata
 */

/**
 * @typedef {Object} ActivityEvent
 * @property {string} id - Activity ID
 * @property {string} type - Activity type
 * @property {string} userId - User ID
 * @property {string} [room] - Room name
 * @property {Object} data - Activity data
 * @property {Date} timestamp - Activity timestamp
 */

/**
 * @typedef {Object} Notification
 * @property {string} id - Notification ID
 * @property {string} type - Notification type
 * @property {string} title - Notification title
 * @property {string} message - Notification message
 * @property {string} [userId] - Target user ID
 * @property {string} [room] - Related room
 * @property {Object} [data] - Additional data
 * @property {boolean} read - Read status
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} [expiresAt] - Expiration timestamp
 */

/**
 * Enhanced WebSocket Server with real-time collaboration features
 * @extends {EventEmitter}
 */
export class WebSocketServer extends EventEmitter {
  /** @type {WSServer} */
  #wss;

  /** @type {Map<string, AuthenticatedSocket>} */
  #clients;

  /** @type {Map<string, RoomInfo>} */
  #rooms;

  /** @type {Map<string, Set<string>>} */
  #userSockets;

  /** @type {ConnectionOptions} */
  #options;

  /** @type {boolean} */
  #isRunning;

  /** @type {Array<ActivityEvent>} */
  #activityFeed;

  /** @type {Map<string, Array<Notification>>} */
  #notifications;

  /** @type {Map<string, Object>} */
  #annotations;

  /** @type {NodeJS.Timeout|null} */
  #presenceCleanupTimer;

  /**
   * Creates a WebSocketServer instance
   * @param {import('http').Server} [server] - HTTP server to attach to
   * @param {ConnectionOptions} [options={}] - Server options
   */
  constructor(server, options = {}) {
    super();

    this.#options = {
      authenticate: true,
      heartbeatInterval: 30000,
      heartbeatTimeout: 60000,
      messageHistoryLimit: 100,
      typingTimeout: 5000,
      presenceTimeout: 60000,
      enablePresence: true,
      enableHistory: true,
      enableTyping: true,
      enableCursors: true,
      enableActivityFeed: true,
      enableNotifications: true,
      messagePersistenceAdapter: null,
      presenceAdapter: null,
      ...options,
    };

    this.#clients = new Map();
    this.#rooms = new Map();
    this.#userSockets = new Map();
    this.#activityFeed = [];
    this.#notifications = new Map();
    this.#annotations = new Map();
    this.#presenceCleanupTimer = null;
    this.#isRunning = false;

    this.#wss = new WSServer({
      server,
      clientTracking: true,
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3,
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024,
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
      },
    });

    this.#setupEventHandlers();
    this.#startPresenceCleanup();
  }

  /**
   * Sets up WebSocket server event handlers
   * @private
   */
  #setupEventHandlers() {
    this.#wss.on('connection', (ws, req) => {
      this.#handleConnection(ws, req);
    });

    this.#wss.on('error', (error) => {
      this.emit('error', error);
    });

    this.#wss.on('close', () => {
      this.#isRunning = false;
      this.emit('close');
    });
  }

  /**
   * Handles new WebSocket connections
   * @param {WebSocket} ws - WebSocket connection
   * @param {import('http').IncomingMessage} req - HTTP request
   * @private
   */
  #handleConnection(ws, req) {
    const socket = /** @type {AuthenticatedSocket} */ (ws);
    socket.id = this.#generateId();
    socket.isAuthenticated = !this.#options.authenticate;
    socket.rooms = new Set();
    socket.lastPing = Date.now();
    socket.presence = new Map();
    socket.typingTimers = new Map();
    socket.cursor = null;
    socket.connectedAt = new Date();
    socket.roomJoinedAt = new Map();

    this.#clients.set(socket.id, socket);

    this.emit('connection', socket, req);

    socket.on('message', (data) => {
      this.#handleMessage(socket, data);
    });

    socket.on('close', (code, reason) => {
      this.#handleDisconnect(socket, code, reason);
    });

    socket.on('error', (error) => {
      this.emit('connectionError', error, socket);
    });

    socket.on('pong', () => {
      socket.lastPing = Date.now();
    });

    this.#startHeartbeat(socket);

    if (!socket.isAuthenticated) {
      this.#send(socket, {
        type: 'auth_required',
        message: 'Authentication required',
        connectionId: socket.id,
      });
    } else {
      this.#send(socket, {
        type: 'connected',
        id: socket.id,
        serverTime: Date.now(),
        features: {
          presence: this.#options.enablePresence,
          history: this.#options.enableHistory,
          typing: this.#options.enableTyping,
          cursors: this.#options.enableCursors,
          activityFeed: this.#options.enableActivityFeed,
          notifications: this.#options.enableNotifications,
        },
      });
    }
  }

  /**
   * Handles incoming messages
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {import('ws').Data} data - Message data
   * @private
   */
  #handleMessage(socket, data) {
    try {
      const message = JSON.parse(data.toString());

      if (!socket.isAuthenticated && message.type !== 'auth') {
        this.#send(socket, {
          type: 'error',
          message: 'Authentication required',
        });
        return;
      }

      switch (message.type) {
        case 'auth':
          this.#handleAuth(socket, message);
          break;
        case 'subscribe':
        case 'room:subscribe':
          this.#handleSubscribe(socket, message);
          break;
        case 'unsubscribe':
        case 'room:unsubscribe':
          this.#handleUnsubscribe(socket, message);
          break;
        case 'ping':
          this.#send(socket, { type: 'pong', timestamp: Date.now() });
          break;
        case 'broadcast':
        case 'room:broadcast':
          this.#handleBroadcast(socket, message);
          break;
        case 'presence:update':
          this.#handlePresenceUpdate(socket, message);
          break;
        case 'typing:start':
          this.#handleTypingStart(socket, message);
          break;
        case 'typing:stop':
          this.#handleTypingStop(socket, message);
          break;
        case 'cursor:update':
          this.#handleCursorUpdate(socket, message);
          break;
        case 'history:get':
          this.#handleHistoryGet(socket, message);
          break;
        case 'activity:get':
          this.#handleActivityGet(socket, message);
          break;
        case 'notification:markRead':
          this.#handleNotificationMarkRead(socket, message);
          break;
        case 'notification:clear':
          this.#handleNotificationClear(socket, message);
          break;
        case 'annotation:create':
          this.#handleAnnotationCreate(socket, message);
          break;
        case 'annotation:update':
          this.#handleAnnotationUpdate(socket, message);
          break;
        case 'annotation:delete':
          this.#handleAnnotationDelete(socket, message);
          break;
        case 'annotation:get':
          this.#handleAnnotationGet(socket, message);
          break;
        // Task collaboration
        case 'task:subscribe':
          this.#handleTaskSubscribe(socket, message);
          break;
        case 'task:unsubscribe':
          this.#handleTaskUnsubscribe(socket, message);
          break;
        case 'task:update':
          this.#handleTaskUpdate(socket, message);
          break;
        case 'task:comment':
          this.#handleTaskComment(socket, message);
          break;
        case 'task:assign':
          this.#handleTaskAssign(socket, message);
          break;
        // Reconnection
        case 'reconnect':
          this.#handleReconnect(socket, message);
          break;
        default:
          this.emit('message', socket, message);
      }
    } catch (error) {
      this.#send(socket, {
        type: 'error',
        message: 'Invalid message format',
        error: error.message,
      });
    }
  }

  /**
   * Handles authentication
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Auth message
   * @private
   */
  #handleAuth(socket, message) {
    const { token, userId, userName, userAvatar } = message;

    this.emit('authenticate', socket, token, (result) => {
      if (result.success) {
        socket.isAuthenticated = true;
        socket.userId = result.userId || userId;
        socket.userName = result.userName || userName;
        socket.userAvatar = result.userAvatar || userAvatar;

        // Track user's sockets
        if (!this.#userSockets.has(socket.userId)) {
          this.#userSockets.set(socket.userId, new Set());
        }
        this.#userSockets.get(socket.userId).add(socket.id);

        this.#send(socket, {
          type: 'auth_success',
          id: socket.id,
          userId: socket.userId,
          serverTime: Date.now(),
          features: {
            presence: this.#options.enablePresence,
            history: this.#options.enableHistory,
            typing: this.#options.enableTyping,
            cursors: this.#options.enableCursors,
            activityFeed: this.#options.enableActivityFeed,
            notifications: this.#options.enableNotifications,
          },
        });

        this.emit('authenticated', socket);
        this.#addActivity('user:connected', socket.userId, null, {
          socketId: socket.id,
          userName: socket.userName,
        });
      } else {
        this.#send(socket, {
          type: 'auth_failed',
          message: result.message || 'Authentication failed',
        });

        setTimeout(() => socket.close(1008, 'Authentication failed'), 100);
      }
    });
  }

  /**
   * Handles reconnection with session recovery
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Reconnect message
   * @private
   */
  #handleReconnect(socket, message) {
    const { previousId, lastEventId, rooms: requestedRooms } = message;

    // Try to recover previous session
    if (previousId && this.#clients.has(previousId)) {
      const oldSocket = this.#clients.get(previousId);
      
      // Transfer session data
      socket.isAuthenticated = oldSocket.isAuthenticated;
      socket.userId = oldSocket.userId;
      socket.userName = oldSocket.userName;
      socket.userAvatar = oldSocket.userAvatar;
      
      // Transfer rooms
      for (const room of oldSocket.rooms) {
        socket.rooms.add(room);
        socket.roomJoinedAt.set(room, oldSocket.roomJoinedAt.get(room));
      }
      
      // Clean up old socket
      oldSocket.rooms.clear();
      this.#clients.delete(previousId);
    }

    // Re-subscribe to requested rooms
    if (requestedRooms && Array.isArray(requestedRooms)) {
      for (const room of requestedRooms) {
        this.joinRoom(socket, room);
      }
    }

    // Get missed messages if lastEventId provided
    let missedMessages = [];
    if (lastEventId && this.#options.enableHistory) {
      missedMessages = this.#getMissedMessages(lastEventId);
    }

    this.#send(socket, {
      type: 'reconnected',
      id: socket.id,
      userId: socket.userId,
      reconnectedRooms: Array.from(socket.rooms),
      missedMessages,
      serverTime: Date.now(),
    });

    this.emit('reconnected', socket);
  }

  /**
   * Handles room subscription
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Subscribe message
   * @private
   */
  #handleSubscribe(socket, message) {
    const { room, presence: initialPresence, metadata } = message;

    if (!room || typeof room !== 'string') {
      this.#send(socket, {
        type: 'error',
        message: 'Room name required',
      });
      return;
    }

    this.joinRoom(socket, room, initialPresence, metadata);
  }

  /**
   * Handles room unsubscription
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Unsubscribe message
   * @private
   */
  #handleUnsubscribe(socket, message) {
    const { room } = message;

    if (!room || typeof room !== 'string') {
      this.#send(socket, {
        type: 'error',
        message: 'Room name required',
      });
      return;
    }

    this.leaveRoom(socket, room);
  }

  /**
   * Handles broadcast from client
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Broadcast message
   * @private
   */
  #handleBroadcast(socket, message) {
    const { room, payload, eventId } = message;

    const enrichedPayload = {
      ...payload,
      senderId: socket.userId,
      senderName: socket.userName,
      timestamp: Date.now(),
      eventId: eventId || this.#generateId(),
    };

    if (room) {
      this.broadcastToRoom(room, enrichedPayload, socket);
      this.#addToHistory(room, enrichedPayload);
    } else {
      this.broadcast(enrichedPayload, socket);
    }

    // Confirm receipt
    this.#send(socket, {
      type: 'broadcast:confirmed',
      eventId: enrichedPayload.eventId,
      timestamp: Date.now(),
    });
  }

  /**
   * Handles presence updates
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Presence message
   * @private
   */
  #handlePresenceUpdate(socket, message) {
    if (!this.#options.enablePresence) return;

    const { room, status, data } = message;

    if (!room || !socket.rooms.has(room)) return;

    const roomInfo = this.#rooms.get(room);
    if (!roomInfo) return;

    const presenceData = {
      userId: socket.userId,
      userName: socket.userName,
      userAvatar: socket.userAvatar,
      status: status || 'online',
      ...data,
      lastSeen: Date.now(),
    };

    socket.presence.set(room, presenceData);
    roomInfo.presence.set(socket.userId, presenceData);

    // Broadcast presence update to room
    this.broadcastToRoom(room, {
      type: 'presence:updated',
      room,
      user: presenceData,
    }, socket);

    // Persist if adapter configured
    if (this.#options.presenceAdapter) {
      this.#options.presenceAdapter.setPresence(room, socket.userId, presenceData);
    }

    this.emit('presence:update', socket, room, presenceData);
  }

  /**
   * Handles typing start indicator
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Typing message
   * @private
   */
  #handleTypingStart(socket, message) {
    if (!this.#options.enableTyping) return;

    const { room, context } = message;

    if (!room || !socket.rooms.has(room)) return;

    const roomInfo = this.#rooms.get(room);
    if (!roomInfo) return;

    roomInfo.typingUsers.add(socket.userId);

    // Clear existing timer
    if (socket.typingTimers.has(room)) {
      clearTimeout(socket.typingTimers.get(room));
    }

    // Set auto-clear timer
    const timer = setTimeout(() => {
      this.#handleTypingStop(socket, { room });
    }, this.#options.typingTimeout);

    socket.typingTimers.set(room, timer);

    // Broadcast to room
    this.broadcastToRoom(room, {
      type: 'typing:started',
      room,
      userId: socket.userId,
      userName: socket.userName,
      context,
    }, socket);

    this.emit('typing:start', socket, room);
  }

  /**
   * Handles typing stop indicator
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Typing message
   * @private
   */
  #handleTypingStop(socket, message) {
    if (!this.#options.enableTyping) return;

    const { room } = message;

    if (!room || !socket.rooms.has(room)) return;

    const roomInfo = this.#rooms.get(room);
    if (!roomInfo) return;

    roomInfo.typingUsers.delete(socket.userId);

    // Clear timer
    if (socket.typingTimers.has(room)) {
      clearTimeout(socket.typingTimers.get(room));
      socket.typingTimers.delete(room);
    }

    // Broadcast to room
    this.broadcastToRoom(room, {
      type: 'typing:stopped',
      room,
      userId: socket.userId,
      userName: socket.userName,
    }, socket);

    this.emit('typing:stop', socket, room);
  }

  /**
   * Handles cursor position updates
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Cursor message
   * @private
   */
  #handleCursorUpdate(socket, message) {
    if (!this.#options.enableCursors) return;

    const { room, x, y, selection, document } = message;

    if (!room || !socket.rooms.has(room)) return;

    const roomInfo = this.#rooms.get(room);
    if (!roomInfo) return;

    const cursorData = {
      userId: socket.userId,
      userName: socket.userName,
      userColor: this.#getUserColor(socket.userId),
      x,
      y,
      selection,
      document,
      timestamp: Date.now(),
    };

    socket.cursor = cursorData;
    roomInfo.cursors.set(socket.userId, cursorData);

    // Throttle cursor updates - broadcast to room
    this.broadcastToRoom(room, {
      type: 'cursor:updated',
      room,
      cursor: cursorData,
    }, socket);

    this.emit('cursor:update', socket, room, cursorData);
  }

  /**
   * Handles history retrieval
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - History message
   * @private
   */
  #handleHistoryGet(socket, message) {
    if (!this.#options.enableHistory) {
      this.#send(socket, {
        type: 'history:error',
        message: 'History not enabled',
      });
      return;
    }

    const { room, limit = 50, before, after } = message;

    if (!room || !socket.rooms.has(room)) {
      this.#send(socket, {
        type: 'history:error',
        message: 'Not subscribed to room',
      });
      return;
    }

    const roomInfo = this.#rooms.get(room);
    if (!roomInfo) {
      this.#send(socket, {
        type: 'history:error',
        message: 'Room not found',
      });
      return;
    }

    let history = [...roomInfo.history];

    // Filter by timestamp
    if (before) {
      history = history.filter((m) => m.timestamp < before);
    }
    if (after) {
      history = history.filter((m) => m.timestamp > after);
    }

    // Apply limit
    history = history.slice(-limit);

    this.#send(socket, {
      type: 'history:response',
      room,
      messages: history,
      count: history.length,
      total: roomInfo.history.length,
    });
  }

  /**
   * Handles activity feed retrieval
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Activity message
   * @private
   */
  #handleActivityGet(socket, message) {
    if (!this.#options.enableActivityFeed) {
      this.#send(socket, {
        type: 'activity:error',
        message: 'Activity feed not enabled',
      });
      return;
    }

    const { limit = 50, types, since } = message;

    let activities = [...this.#activityFeed];

    if (types && Array.isArray(types)) {
      activities = activities.filter((a) => types.includes(a.type));
    }

    if (since) {
      activities = activities.filter((a) => a.timestamp > new Date(since));
    }

    activities = activities.slice(-limit);

    this.#send(socket, {
      type: 'activity:response',
      activities,
      count: activities.length,
    });
  }

  /**
   * Handles notification mark as read
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Mark read message
   * @private
   */
  #handleNotificationMarkRead(socket, message) {
    const { notificationId, markAll } = message;
    const userNotifications = this.#notifications.get(socket.userId) || [];

    if (markAll) {
      userNotifications.forEach((n) => (n.read = true));
    } else if (notificationId) {
      const notification = userNotifications.find((n) => n.id === notificationId);
      if (notification) {
        notification.read = true;
      }
    }

    this.#sendUnreadCount(socket);
  }

  /**
   * Handles notification clear
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Clear message
   * @private
   */
  #handleNotificationClear(socket, message) {
    const { notificationId, clearAll } = message;

    if (clearAll) {
      this.#notifications.set(socket.userId, []);
    } else if (notificationId) {
      const userNotifications = this.#notifications.get(socket.userId) || [];
      const filtered = userNotifications.filter((n) => n.id !== notificationId);
      this.#notifications.set(socket.userId, filtered);
    }

    this.#sendUnreadCount(socket);
  }

  /**
   * Sends unread notification count
   * @param {AuthenticatedSocket} socket - Client socket
   * @private
   */
  #sendUnreadCount(socket) {
    const userNotifications = this.#notifications.get(socket.userId) || [];
    const unreadCount = userNotifications.filter((n) => !n.read).length;

    this.#send(socket, {
      type: 'notifications:count',
      unread: unreadCount,
      total: userNotifications.length,
    });
  }

  // ==================== Annotations ====================

  /**
   * Handles annotation creation
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Annotation message
   * @private
   */
  #handleAnnotationCreate(socket, message) {
    const { room, document, x, y, content, type = 'note' } = message;

    if (!room || !socket.rooms.has(room)) return;

    const annotationId = this.#generateId();
    const annotation = {
      id: annotationId,
      room,
      document,
      x,
      y,
      content,
      type,
      createdBy: socket.userId,
      createdByName: socket.userName,
      createdAt: Date.now(),
      resolved: false,
    };

    if (!this.#annotations.has(room)) {
      this.#annotations.set(room, new Map());
    }
    this.#annotations.get(room).set(annotationId, annotation);

    this.broadcastToRoom(room, {
      type: 'annotation:created',
      annotation,
    }, socket);

    this.#addActivity('annotation:created', socket.userId, room, { annotationId });
  }

  /**
   * Handles annotation update
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Annotation message
   * @private
   */
  #handleAnnotationUpdate(socket, message) {
    const { room, annotationId, updates } = message;

    if (!room || !socket.rooms.has(room)) return;

    const roomAnnotations = this.#annotations.get(room);
    if (!roomAnnotations) return;

    const annotation = roomAnnotations.get(annotationId);
    if (!annotation) return;

    Object.assign(annotation, updates, { updatedAt: Date.now() });

    this.broadcastToRoom(room, {
      type: 'annotation:updated',
      annotation,
    }, socket);
  }

  /**
   * Handles annotation deletion
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Annotation message
   * @private
   */
  #handleAnnotationDelete(socket, message) {
    const { room, annotationId } = message;

    if (!room || !socket.rooms.has(room)) return;

    const roomAnnotations = this.#annotations.get(room);
    if (!roomAnnotations) return;

    roomAnnotations.delete(annotationId);

    this.broadcastToRoom(room, {
      type: 'annotation:deleted',
      annotationId,
    }, socket);

    this.#addActivity('annotation:deleted', socket.userId, room, { annotationId });
  }

  /**
   * Handles annotation retrieval
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Annotation message
   * @private
   */
  #handleAnnotationGet(socket, message) {
    const { room, document } = message;

    if (!room) {
      this.#send(socket, {
        type: 'annotation:error',
        message: 'Room required',
      });
      return;
    }

    const roomAnnotations = this.#annotations.get(room);
    let annotations = roomAnnotations ? Array.from(roomAnnotations.values()) : [];

    if (document) {
      annotations = annotations.filter((a) => a.document === document);
    }

    this.#send(socket, {
      type: 'annotation:list',
      room,
      document,
      annotations,
    });
  }

  // ==================== Task Collaboration ====================

  /**
   * Handles task subscription
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Task subscribe message
   * @private
   */
  #handleTaskSubscribe(socket, message) {
    const { taskId } = message;
    if (!taskId) return;

    const taskRoom = `task:${taskId}`;
    this.joinRoom(socket, taskRoom, { role: 'collaborator' });

    this.#send(socket, {
      type: 'task:subscribed',
      taskId,
      room: taskRoom,
    });

    this.#addActivity('task:subscribed', socket.userId, taskRoom, { taskId });
  }

  /**
   * Handles task unsubscription
   * @param {AuthenticatedSocket} socket - Client socket
     * @param {Object} message - Task unsubscribe message
   * @private
   */
  #handleTaskUnsubscribe(socket, message) {
    const { taskId } = message;
    if (!taskId) return;

    const taskRoom = `task:${taskId}`;
    this.leaveRoom(socket, taskRoom);

    this.#send(socket, {
      type: 'task:unsubscribed',
      taskId,
    });
  }

  /**
   * Handles task update
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Task update message
   * @private
   */
  #handleTaskUpdate(socket, message) {
    const { taskId, changes } = message;
    if (!taskId) return;

    const taskRoom = `task:${taskId}`;
    
    if (!socket.rooms.has(taskRoom)) {
      this.#send(socket, {
        type: 'task:error',
        message: 'Not subscribed to task',
      });
      return;
    }

    const update = {
      type: 'task:updated',
      taskId,
      changes,
      updatedBy: socket.userId,
      updatedByName: socket.userName,
      timestamp: Date.now(),
    };

    this.broadcastToRoom(taskRoom, update);
    this.#addToHistory(taskRoom, update);
    this.#addActivity('task:updated', socket.userId, taskRoom, { taskId, changes });
  }

  /**
   * Handles task comment
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Task comment message
   * @private
   */
  #handleTaskComment(socket, message) {
    const { taskId, comment, parentId } = message;
    if (!taskId || !comment) return;

    const taskRoom = `task:${taskId}`;

    if (!socket.rooms.has(taskRoom)) {
      this.#send(socket, {
        type: 'task:error',
        message: 'Not subscribed to task',
      });
      return;
    }

    const commentData = {
      type: 'task:comment',
      taskId,
      comment: {
        id: this.#generateId(),
        text: comment,
        parentId,
        createdBy: socket.userId,
        createdByName: socket.userName,
        createdAt: Date.now(),
      },
    };

    this.broadcastToRoom(taskRoom, commentData);
    this.#addToHistory(taskRoom, commentData);
    this.#addActivity('task:comment', socket.userId, taskRoom, { taskId });
  }

  /**
   * Handles task assignment
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {Object} message - Task assign message
   * @private
   */
  #handleTaskAssign(socket, message) {
    const { taskId, assigneeId, assigneeName } = message;
    if (!taskId) return;

    const taskRoom = `task:${taskId}`;

    if (!socket.rooms.has(taskRoom)) {
      this.#send(socket, {
        type: 'task:error',
        message: 'Not subscribed to task',
      });
      return;
    }

    const assignment = {
      type: 'task:assigned',
      taskId,
      assigneeId,
      assigneeName,
      assignedBy: socket.userId,
      assignedByName: socket.userName,
      timestamp: Date.now(),
    };

    this.broadcastToRoom(taskRoom, assignment);
    this.#addToHistory(taskRoom, assignment);
    this.#addActivity('task:assigned', socket.userId, taskRoom, { taskId, assigneeId });

    // Send notification to assignee
    if (assigneeId) {
      this.sendNotification(assigneeId, {
        type: 'task:assigned',
        title: 'Task Assigned',
        message: `${socket.userName} assigned you a task`,
        data: { taskId, assignerId: socket.userId },
      });
    }
  }

  // ==================== Core Methods ====================

  /**
   * Handles client disconnection
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {number} code - Close code
   * @param {Buffer} reason - Close reason
   * @private
   */
  #handleDisconnect(socket, code, reason) {
    this.#stopHeartbeat(socket);

    // Clear typing indicators
    for (const [room, timer] of socket.typingTimers) {
      clearTimeout(timer);
      const roomInfo = this.#rooms.get(room);
      if (roomInfo) {
        roomInfo.typingUsers.delete(socket.userId);
        this.broadcastToRoom(room, {
          type: 'typing:stopped',
          room,
          userId: socket.userId,
        });
      }
    }

    // Remove from rooms
    for (const room of socket.rooms) {
      this.leaveRoom(socket, room, true);
    }

    // Remove from user sockets
    if (socket.userId) {
      const userSockets = this.#userSockets.get(socket.userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.#userSockets.delete(socket.userId);
          this.#addActivity('user:disconnected', socket.userId, null, {
            socketId: socket.id,
          });
        }
      }
    }

    this.#clients.delete(socket.id);
    this.emit('disconnect', socket, code, reason);
  }

  /**
   * Starts heartbeat for a connection
   * @param {AuthenticatedSocket} socket - Client socket
   * @private
   */
  #startHeartbeat(socket) {
    socket.heartbeatTimer = setInterval(() => {
      if (!socket.isAlive) {
        socket.terminate();
        return;
      }

      if (Date.now() - socket.lastPing > this.#options.heartbeatTimeout) {
        socket.isAlive = false;
        socket.ping();
      }
    }, this.#options.heartbeatInterval);

    socket.isAlive = true;
  }

  /**
   * Stops heartbeat for a connection
   * @param {AuthenticatedSocket} socket - Client socket
   * @private
   */
  #stopHeartbeat(socket) {
    if (socket.heartbeatTimer) {
      clearInterval(socket.heartbeatTimer);
      socket.heartbeatTimer = undefined;
    }
  }

  /**
   * Starts presence cleanup interval
   * @private
   */
  #startPresenceCleanup() {
    if (!this.#options.enablePresence) return;

    this.#presenceCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [roomName, roomInfo] of this.#rooms) {
        for (const [userId, presence] of roomInfo.presence) {
          if (now - presence.lastSeen > this.#options.presenceTimeout) {
            roomInfo.presence.delete(userId);
            this.broadcastToRoom(roomName, {
              type: 'presence:offline',
              room: roomName,
              userId,
            });
          }
        }
      }
    }, this.#options.presenceTimeout);

    if (typeof this.#presenceCleanupTimer.unref === 'function') {
      this.#presenceCleanupTimer.unref();
    }
  }

  /**
   * Sends message to a socket
   * @param {AuthenticatedSocket} socket - Target socket
   * @param {Object} data - Message data
   * @private
   */
  #send(socket, data) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  /**
   * Generates unique connection ID
   * @returns {string} Unique ID
   * @private
   */
  #generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Gets consistent color for user
   * @param {string} userId - User ID
   * @returns {string} Color hex code
   * @private
   */
  #getUserColor(userId) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
      '#FF9FF3', '#54A0FF', '#48DBFB', '#1DD1A1', '#FFC048',
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Adds message to room history
   * @param {string} room - Room name
   * @param {Object} message - Message data
   * @private
   */
  #addToHistory(room, message) {
    if (!this.#options.enableHistory) return;

    const roomInfo = this.#rooms.get(room);
    if (!roomInfo) return;

    roomInfo.history.push(message);

    // Trim history if exceeds limit
    if (roomInfo.history.length > this.#options.messageHistoryLimit) {
      roomInfo.history = roomInfo.history.slice(-this.#options.messageHistoryLimit);
    }

    // Persist if adapter configured
    if (this.#options.messagePersistenceAdapter) {
      this.#options.messagePersistenceAdapter.saveMessage(room, message);
    }
  }

  /**
   * Adds activity to feed
   * @param {string} type - Activity type
   * @param {string} userId - User ID
   * @param {string} [room] - Room name
   * @param {Object} [data] - Activity data
   * @private
   */
  #addActivity(type, userId, room, data = {}) {
    if (!this.#options.enableActivityFeed) return;

    const activity = {
      id: this.#generateId(),
      type,
      userId,
      room,
      data,
      timestamp: new Date(),
    };

    this.#activityFeed.push(activity);

    // Keep only last 1000 activities
    if (this.#activityFeed.length > 1000) {
      this.#activityFeed = this.#activityFeed.slice(-1000);
    }

    this.emit('activity', activity);
  }

  /**
   * Gets missed messages after event ID
   * @param {string} lastEventId - Last known event ID
   * @returns {Array<Object>} Missed messages
   * @private
   */
  #getMissedMessages(lastEventId) {
    const missed = [];
    for (const roomInfo of this.#rooms.values()) {
      let found = false;
      for (const msg of roomInfo.history) {
        if (found) {
          missed.push(msg);
        } else if (msg.eventId === lastEventId) {
          found = true;
        }
      }
    }
    return missed;
  }

  // ==================== Public API ====================

  /**
   * Makes a socket join a room
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {string} room - Room name
   * @param {Object} [initialPresence] - Initial presence data
   * @param {Object} [metadata] - Room metadata
   */
  joinRoom(socket, room, initialPresence = null, metadata = {}) {
    if (!this.#rooms.has(room)) {
      this.#rooms.set(room, {
        name: room,
        members: new Set(),
        history: [],
        presence: new Map(),
        typingUsers: new Set(),
        cursors: new Map(),
        createdAt: new Date(),
        metadata,
      });
    }

    const roomInfo = this.#rooms.get(room);
    roomInfo.members.add(socket.userId);
    socket.rooms.add(room);
    socket.roomJoinedAt.set(room, new Date());

    // Set initial presence
    if (this.#options.enablePresence && initialPresence) {
      const presenceData = {
        userId: socket.userId,
        userName: socket.userName,
        userAvatar: socket.userAvatar,
        ...initialPresence,
        lastSeen: Date.now(),
      };
      socket.presence.set(room, presenceData);
      roomInfo.presence.set(socket.userId, presenceData);
    }

    this.#send(socket, {
      type: 'subscribed',
      room,
      members: Array.from(roomInfo.members),
      presence: Array.from(roomInfo.presence.values()),
      typing: Array.from(roomInfo.typingUsers),
    });

    // Notify others
    this.broadcastToRoom(room, {
      type: 'user:joined',
      room,
      user: {
        id: socket.userId,
        name: socket.userName,
        avatar: socket.userAvatar,
      },
      presence: initialPresence,
    }, socket);

    this.emit('subscribe', socket, room);
    this.#addActivity('room:joined', socket.userId, room, { room });
  }

  /**
   * Makes a socket leave a room
   * @param {AuthenticatedSocket} socket - Client socket
   * @param {string} room - Room name
   * @param {boolean} [isDisconnecting=false] - Whether client is disconnecting
   */
  leaveRoom(socket, room, isDisconnecting = false) {
    const roomInfo = this.#rooms.get(room);
    if (roomInfo) {
      roomInfo.members.delete(socket.userId);
      roomInfo.presence.delete(socket.userId);
      roomInfo.typingUsers.delete(socket.userId);
      roomInfo.cursors.delete(socket.userId);

      if (!isDisconnecting) {
        this.#send(socket, {
          type: 'unsubscribed',
          room,
        });

        this.broadcastToRoom(room, {
          type: 'user:left',
          room,
          user: {
            id: socket.userId,
            name: socket.userName,
          },
        }, socket);
      }

      if (roomInfo.members.size === 0) {
        this.#rooms.delete(room);
      }
    }

    socket.rooms.delete(room);
    socket.presence.delete(room);
    socket.roomJoinedAt.delete(room);

    this.emit('unsubscribe', socket, room);
  }

  /**
   * Broadcasts message to all connected clients
   * @param {Object} data - Message data
   * @param {AuthenticatedSocket} [exclude] - Socket to exclude
   */
  broadcast(data, exclude = null) {
    const message = JSON.stringify(data);

    for (const socket of this.#clients.values()) {
      if (socket !== exclude && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  }

  /**
   * Broadcasts message to a specific room
   * @param {string} room - Room name
   * @param {Object} data - Message data
   * @param {AuthenticatedSocket} [exclude] - Socket to exclude
   */
  broadcastToRoom(room, data, exclude = null) {
    const roomInfo = this.#rooms.get(room);
    if (!roomInfo) return;

    const message = JSON.stringify(data);

    for (const socket of this.#clients.values()) {
      if (socket !== exclude && 
          socket.rooms.has(room) && 
          socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  }

  /**
   * Sends message to specific client
   * @param {string} clientId - Client ID
   * @param {Object} data - Message data
   * @returns {boolean} Whether the message was sent
   */
  sendToClient(clientId, data) {
    const socket = this.#clients.get(clientId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  /**
   * Sends message to specific user (all their sockets)
   * @param {string} userId - User ID
   * @param {Object} data - Message data
   * @returns {number} Number of clients the message was sent to
   */
  sendToUser(userId, data) {
    let count = 0;
    const socketIds = this.#userSockets.get(userId);
    
    if (!socketIds) return 0;

    const message = JSON.stringify(data);

    for (const socketId of socketIds) {
      const socket = this.#clients.get(socketId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
        count++;
      }
    }

    return count;
  }

  /**
   * Sends notification to user
   * @param {string} userId - User ID
   * @param {Object} notificationData - Notification data
   * @returns {boolean} Whether notification was sent
   */
  sendNotification(userId, notificationData) {
    if (!this.#options.enableNotifications) return false;

    const notification = {
      id: this.#generateId(),
      ...notificationData,
      read: false,
      createdAt: new Date(),
    };

    if (!this.#notifications.has(userId)) {
      this.#notifications.set(userId, []);
    }

    const userNotifications = this.#notifications.get(userId);
    userNotifications.push(notification);

    // Keep only last 100 notifications per user
    if (userNotifications.length > 100) {
      userNotifications.shift();
    }

    // Send to user's sockets
    const sent = this.sendToUser(userId, {
      type: 'notification:new',
      notification,
    });

    this.emit('notification', userId, notification);
    return sent > 0;
  }

  /**
   * Gets all clients in a room
   * @param {string} room - Room name
   * @returns {AuthenticatedSocket[]} Array of sockets
   */
  getRoomClients(room) {
    const roomInfo = this.#rooms.get(room);
    if (!roomInfo) return [];

    return Array.from(this.#clients.values()).filter(
      (socket) => socket.rooms.has(room)
    );
  }

  /**
   * Gets all room names
   * @returns {string[]} Array of room names
   */
  getRooms() {
    return Array.from(this.#rooms.keys());
  }

  /**
   * Gets room info
   * @param {string} room - Room name
   * @returns {RoomInfo|undefined} Room info
   */
  getRoomInfo(room) {
    return this.#rooms.get(room);
  }

  /**
   * Gets room member count
   * @param {string} room - Room name
   * @returns {number} Number of members
   */
  getRoomSize(room) {
    const roomInfo = this.#rooms.get(room);
    return roomInfo ? roomInfo.members.size : 0;
  }

  /**
   * Gets client by ID
   * @param {string} clientId - Client ID
   * @returns {AuthenticatedSocket|undefined} Client socket
   */
  getClient(clientId) {
    return this.#clients.get(clientId);
  }

  /**
   * Gets all connected clients
   * @returns {AuthenticatedSocket[]} Array of client sockets
   */
  getClients() {
    return Array.from(this.#clients.values());
  }

  /**
   * Gets total number of connected clients
   * @returns {number} Client count
   */
  getClientCount() {
    return this.#clients.size;
  }

  /**
   * Gets all sockets for a user
   * @param {string} userId - User ID
   * @returns {AuthenticatedSocket[]} Array of sockets
   */
  getUserSockets(userId) {
    const socketIds = this.#userSockets.get(userId);
    if (!socketIds) return [];

    return Array.from(socketIds)
      .map((id) => this.#clients.get(id))
      .filter(Boolean);
  }

  /**
   * Disconnects a client
   * @param {string} clientId - Client ID
   * @param {number} [code=1000] - Close code
   * @param {string} [reason=''] - Close reason
   * @returns {boolean} Whether the client was disconnected
   */
  disconnect(clientId, code = 1000, reason = '') {
    const socket = this.#clients.get(clientId);
    if (socket) {
      socket.close(code, reason);
      return true;
    }
    return false;
  }

  /**
   * Disconnects all clients
   * @param {number} [code=1000] - Close code
   * @param {string} [reason=''] - Close reason
   */
  disconnectAll(code = 1000, reason = '') {
    for (const socket of this.#clients.values()) {
      socket.close(code, reason);
    }
  }

  /**
   * Starts the WebSocket server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.#isRunning) {
      throw new Error('Server is already running');
    }

    this.#isRunning = true;
    this.emit('ready');
  }

  /**
   * Stops the WebSocket server gracefully
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.#isRunning) {
      return;
    }

    this.#isRunning = false;

    if (this.#presenceCleanupTimer) {
      clearInterval(this.#presenceCleanupTimer);
      this.#presenceCleanupTimer = null;
    }

    return new Promise((resolve) => {
      this.disconnectAll(1001, 'Server shutting down');

      this.#wss.close(() => {
        this.emit('stopped');
        resolve();
      });
    });
  }

  /**
   * Checks if server is running
   * @returns {boolean} Server status
   */
  isRunning() {
    return this.#isRunning;
  }

  /**
   * Gets server statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const roomStats = {};
    for (const [name, room] of this.#rooms) {
      roomStats[name] = {
        members: room.members.size,
        history: room.history.length,
        typing: room.typingUsers.size,
        cursors: room.cursors.size,
      };
    }

    return {
      clients: this.#clients.size,
      users: this.#userSockets.size,
      rooms: this.#rooms.size,
      isRunning: this.#isRunning,
      roomStats,
      features: {
        presence: this.#options.enablePresence,
        history: this.#options.enableHistory,
        typing: this.#options.enableTyping,
        cursors: this.#options.enableCursors,
        activityFeed: this.#options.enableActivityFeed,
        notifications: this.#options.enableNotifications,
      },
    };
  }

  /**
   * Gets activity feed
   * @param {Object} [options] - Query options
   * @returns {Array<ActivityEvent>} Activity events
   */
  getActivityFeed(options = {}) {
    const { limit = 50, types, since } = options;
    
    let activities = [...this.#activityFeed];

    if (types && Array.isArray(types)) {
      activities = activities.filter((a) => types.includes(a.type));
    }

    if (since) {
      activities = activities.filter((a) => a.timestamp > new Date(since));
    }

    return activities.slice(-limit);
  }

  /**
   * Gets user's notifications
   * @param {string} userId - User ID
   * @param {Object} [options] - Query options
   * @returns {Array<Notification>} Notifications
   */
  getUserNotifications(userId, options = {}) {
    const { unreadOnly = false, limit = 50 } = options;
    
    let notifications = this.#notifications.get(userId) || [];

    if (unreadOnly) {
      notifications = notifications.filter((n) => !n.read);
    }

    return notifications.slice(-limit);
  }

  /**
   * Creates an annotation in a room
   * @param {string} room - Room name
   * @param {Object} annotation - Annotation data
   * @returns {string} Annotation ID
   */
  createAnnotation(room, annotation) {
    const id = this.#generateId();
    const fullAnnotation = {
      id,
      room,
      ...annotation,
      createdAt: Date.now(),
    };

    if (!this.#annotations.has(room)) {
      this.#annotations.set(room, new Map());
    }

    this.#annotations.get(room).set(id, fullAnnotation);

    this.broadcastToRoom(room, {
      type: 'annotation:created',
      annotation: fullAnnotation,
    });

    return id;
  }

  /**
   * Gets annotations for a room
   * @param {string} room - Room name
   * @param {string} [document] - Document filter
   * @returns {Array<Object>} Annotations
   */
  getAnnotations(room, document) {
    const roomAnnotations = this.#annotations.get(room);
    if (!roomAnnotations) return [];

    let annotations = Array.from(roomAnnotations.values());

    if (document) {
      annotations = annotations.filter((a) => a.document === document);
    }

    return annotations;
  }
}

export default WebSocketServer;
