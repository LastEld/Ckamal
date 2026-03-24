/**
 * CogniMesh v5.0 - WebSocket Client
 * Handles real-time communication with the dashboard server
 */

class WebSocketClient extends EventTarget {
  constructor(options = {}) {
    super();
    this.url = options.url || this.buildWsUrl();
    this.token = options.token || localStorage.getItem('authToken');
    this.reconnectInterval = options.reconnectInterval || 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.heartbeatInterval = options.heartbeatInterval || 30000;
    this.connectionTimeout = options.connectionTimeout || 10000;
    
    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.connectionTimer = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.subscriptions = new Set();
    this.messageQueue = [];
    this.clientId = null;
  }

  // Build WebSocket URL from current location
  buildWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  // Set authentication token
  setToken(token) {
    this.token = token;
  }

  // Connect to WebSocket server
  connect() {
    if (this.isConnecting || this.isConnected) {
      return Promise.resolve();
    }

    this.isConnecting = true;
    this.dispatchEvent(new CustomEvent('connecting'));

    return new Promise((resolve, reject) => {
      try {
        // Build URL with token
        let url = this.url;
        if (this.token) {
          url += `?token=${encodeURIComponent(this.token)}`;
        }

        this.ws = new WebSocket(url);

        // Connection timeout
        this.connectionTimer = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            this.ws.close();
            reject(new Error('Connection timeout'));
          }
        }, this.connectionTimeout);

        this.ws.onopen = (event) => this.handleOpen(event, resolve);
        this.ws.onmessage = (event) => this.handleMessage(event);
        this.ws.onclose = (event) => this.handleClose(event);
        this.ws.onerror = (event) => this.handleError(event, reject);
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  // Handle connection open
  handleOpen(event, resolve) {
    clearTimeout(this.connectionTimer);
    this.isConnecting = false;
    this.isConnected = true;
    this.reconnectAttempts = 0;

    // Start heartbeat
    this.startHeartbeat();

    // Resubscribe to previous rooms
    this.resubscribe();

    // Flush message queue
    this.flushMessageQueue();

    this.dispatchEvent(new CustomEvent('connected', {
      detail: { clientId: this.clientId }
    }));

    resolve();
  }

  // Handle incoming message
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      
      // Handle server messages
      switch (message.type) {
        case 'connected':
          this.clientId = message.clientId;
          break;
          
        case 'pong':
          // Heartbeat response, connection is alive
          break;
          
        case 'subscribed':
          this.dispatchEvent(new CustomEvent('subscribed', {
            detail: { room: message.room }
          }));
          break;
          
        case 'unsubscribed':
          this.dispatchEvent(new CustomEvent('unsubscribed', {
            detail: { room: message.room }
          }));
          break;
          
        case 'error':
          this.dispatchEvent(new CustomEvent('error', {
            detail: message
          }));
          break;
          
        default:
          // Broadcast message to listeners
          this.dispatchEvent(new CustomEvent('message', {
            detail: message
          }));
          
          // Also dispatch specific event type
          this.dispatchEvent(new CustomEvent(`message:${message.type}`, {
            detail: message.data
          }));
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  // Handle connection close
  handleClose(event) {
    clearTimeout(this.connectionTimer);
    this.isConnecting = false;
    this.isConnected = false;
    this.stopHeartbeat();

    this.dispatchEvent(new CustomEvent('disconnected', {
      detail: { code: event.code, reason: event.reason }
    }));

    // Attempt reconnection if not intentionally closed
    if (event.code !== 1000 && event.code !== 1001) {
      this.scheduleReconnect();
    }
  }

  // Handle connection error
  handleError(event, reject) {
    clearTimeout(this.connectionTimer);
    this.isConnecting = false;
    
    this.dispatchEvent(new CustomEvent('error', {
      detail: { type: 'connection', event }
    }));

    if (reject) {
      reject(new Error('WebSocket connection failed'));
    }
  }

  // Schedule reconnection attempt
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.dispatchEvent(new CustomEvent('reconnect_failed'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.min(this.reconnectAttempts, 5);

    this.dispatchEvent(new CustomEvent('reconnecting', {
      detail: { attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts, delay }
    }));

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Error handled in handleError
      });
    }, delay);
  }

  // Send message to server
  send(type, data) {
    const message = JSON.stringify({ type, ...data });

    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      // Queue message for later
      this.messageQueue.push(message);
    }
  }

  // Flush queued messages
  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.ws.send(message);
    }
  }

  // Subscribe to a room/topic
  subscribe(room) {
    this.subscriptions.add(room);
    this.send('subscribe', { room });
  }

  // Unsubscribe from a room/topic
  unsubscribe(room) {
    this.subscriptions.delete(room);
    this.send('unsubscribe', { room });
  }

  // Subscribe to roadmap updates
  subscribeRoadmap(roadmapId) {
    this.send('roadmap.subscribe', { roadmapId });
    this.subscriptions.add(`roadmap:${roadmapId}`);
  }

  // Resubscribe to all previous subscriptions after reconnection
  resubscribe() {
    for (const room of this.subscriptions) {
      if (room.startsWith('roadmap:')) {
        const roadmapId = room.replace('roadmap:', '');
        this.send('roadmap.subscribe', { roadmapId });
      } else {
        this.send('subscribe', { room });
      }
    }
  }

  // Send task update
  updateTask(task) {
    this.send('task.update', { data: task });
  }

  // Start heartbeat ping
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send('ping', {});
      }
    }, this.heartbeatInterval);
  }

  // Stop heartbeat
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Disconnect from server
  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isConnecting = false;
    this.subscriptions.clear();
  }

  // Check connection status
  getStatus() {
    if (this.isConnected) return 'connected';
    if (this.isConnecting) return 'connecting';
    if (this.reconnectTimer) return 'reconnecting';
    return 'disconnected';
  }
}

// Export for module systems if available
if (typeof window !== 'undefined') {
  window.WebSocketClient = WebSocketClient;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebSocketClient };
}
