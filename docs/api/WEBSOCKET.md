# WebSocket API Documentation

Real-time bidirectional communication API for Ckamal.

**Version:** 5.0.0  
**Protocol:** WebSocket (RFC 6455)  
**Message Format:** JSON  
**Last Updated:** 2026-03-28

---

## Table of Contents

1. [Overview](#overview)
2. [Connection](#connection)
3. [Authentication](#authentication)
4. [Message Protocol](#message-protocol)
5. [Room Subscriptions](#room-subscriptions)
6. [Event Types](#event-types)
7. [Real-time Features](#real-time-features)
8. [Heartbeat Controller Events](#heartbeat-controller-events)
9. [Activity Events](#activity-events)
10. [Error Handling](#error-handling)
11. [Client Implementation](#client-implementation)

---

## Overview

The WebSocket API provides real-time bidirectional communication for:

- **Live updates** - Instant notifications for changes
- **Collaboration** - Multi-user editing and presence
- **Monitoring** - Real-time heartbeat run logs
- **Activity feed** - Live activity stream
- **Notifications** - Push notifications

### Connection URL

```
ws://hostname/ws          # Non-secure
wss://hostname/ws         # Secure (recommended)
```

### Features

| Feature | Description |
|---------|-------------|
| Room-based subscriptions | Subscribe to specific rooms for targeted updates |
| Presence tracking | See who's online and active |
| Typing indicators | Real-time typing status |
| Cursor tracking | Collaborative cursor positions |
| Message history | Access to recent room messages |
| Activity feed | Live activity stream |
| Notifications | Push notification delivery |

---

## Connection

### Opening a Connection

```javascript
const ws = new WebSocket('wss://api.example.com/ws');

ws.onopen = () => {
  console.log('Connected to Ckamal WebSocket');
};

ws.onclose = (event) => {
  console.log('Disconnected:', event.code, event.reason);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

### Connection Options

The server supports the following connection behaviors:

| Option | Default | Description |
|--------|---------|-------------|
| `authenticate` | `true` | Require authentication |
| `heartbeatInterval` | `30000` | Heartbeat interval (ms) |
| `heartbeatTimeout` | `60000` | Heartbeat timeout (ms) |
| `messageHistoryLimit` | `100` | Messages per room history |
| `typingTimeout` | `5000` | Typing indicator timeout |
| `presenceTimeout` | `60000` | Presence inactivity timeout |
| `enablePresence` | `true` | Enable presence tracking |
| `enableHistory` | `true` | Enable message history |
| `enableTyping` | `true` | Enable typing indicators |
| `enableCursors` | `true` | Enable cursor tracking |
| `enableActivityFeed` | `true` | Enable activity feed |
| `enableNotifications` | `true` | Enable notifications |

---

## Authentication

### Authentication Flow

```
┌─────────────┐                      ┌─────────────┐
│   Client    │─────── Connect ─────▶│   Server    │
│             │◀──── Auth Required ──│             │
│             │                      │             │
│             │──── Send Auth Msg ──▶│   Validate  │
│             │◀──── Connected ──────│   Token     │
└─────────────┘                      └─────────────┘
```

### Auth Message

Send authentication credentials immediately after connection:

```javascript
ws.onopen = () => {
  // Send authentication
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'eyJhbGciOiJIUzI1NiIs...',  // JWT access token
    userId: 'user-uuid',                  // Optional
    companyId: 'comp-uuid'                // Optional
  }));
};
```

### Auth Response

**Success:**
```json
{
  "type": "connected",
  "id": "conn-uuid",
  "serverTime": 1711651200000,
  "features": {
    "presence": true,
    "history": true,
    "typing": true,
    "cursors": true,
    "activityFeed": true,
    "notifications": true
  }
}
```

**Failure:**
```json
{
  "type": "error",
  "message": "Authentication failed",
  "code": "AUTH_FAILED"
}
```

---

## Message Protocol

### Message Structure

All messages use JSON format with a `type` field:

```json
{
  "type": "message_type",
  "...": "additional fields"
}
```

### Client → Server Messages

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `auth` | Authenticate connection | `token` |
| `subscribe` / `room:subscribe` | Subscribe to room | `room` |
| `unsubscribe` / `room:unsubscribe` | Unsubscribe from room | `room` |
| `ping` | Keep-alive ping | - |
| `broadcast` / `room:broadcast` | Broadcast to room | `room`, `data` |
| `presence:update` | Update presence | `room`, `status` |
| `typing:start` | Start typing | `room` |
| `typing:stop` | Stop typing | `room` |
| `cursor:move` | Move cursor | `room`, `x`, `y` |

### Server → Client Messages

| Type | Description |
|------|-------------|
| `connected` | Connection established |
| `auth_required` | Authentication required |
| `auth_success` | Authentication successful |
| `error` | Error occurred |
| `pong` | Ping response |
| `room:joined` | Successfully joined room |
| `room:left` | Successfully left room |
| `room:member_joined` | Member joined room |
| `room:member_left` | Member left room |
| `room:broadcast` | Broadcast message |
| `presence:update` | Presence update |
| `typing:start` | User started typing |
| `typing:stop` | User stopped typing |
| `cursor:move` | Cursor position update |
| `activity:new` | New activity event |
| `notification:new` | New notification |
| `heartbeat` | Server heartbeat |

---

## Room Subscriptions

### Room Types

| Room Pattern | Description |
|--------------|-------------|
| `heartbeat` | Heartbeat runtime events |
| `agent:{agentId}` | Agent-specific events |
| `run:{runId}` | Run-specific events |
| `company:{companyId}` | Company-wide events |
| `project:{projectId}` | Project events |
| `task:{taskId}` | Task events |
| `user:{userId}` | User-specific events |
| `activity` | Activity feed |
| `alerts` | Alert notifications |

### Subscribing to Rooms

```javascript
// Subscribe to a room
ws.send(JSON.stringify({
  type: 'subscribe',
  room: 'agent:agent-uuid'
}));

// Or using alternative syntax
ws.send(JSON.stringify({
  type: 'room:subscribe',
  room: 'run:run-uuid'
}));
```

### Subscription Response

```json
{
  "type": "room:joined",
  "room": "agent:agent-uuid",
  "userId": "user-uuid",
  "members": 5,
  "history": [
    { "type": "room:broadcast", "data": {...}, "timestamp": "..." }
  ]
}
```

### Unsubscribing

```javascript
ws.send(JSON.stringify({
  type: 'unsubscribe',
  room: 'agent:agent-uuid'
}));
```

---

## Event Types

### Heartbeat Events

Sent from Heartbeat Controller for run lifecycle:

| Event | Description | Data |
|-------|-------------|------|
| `run:created` | New run created | `{ run }` |
| `run:started` | Run started execution | `{ runId, agentId }` |
| `run:completed` | Run completed | `{ runId, status }` |
| `run:failed` | Run failed | `{ runId, error }` |
| `run:cancelled` | Run cancelled | `{ runId, reason }` |
| `run:retried` | Run retried | `{ originalRunId, newRun }` |
| `run:log` | Log entry | `{ runId, stream, chunk }` |
| `agent:wakeup` | Agent awakened | `{ agentId, runId }` |
| `session:deleted` | Session cleared | `{ agentId, sessionId }` |

**Example:**
```json
{
  "type": "run:created",
  "data": {
    "id": "run-uuid",
    "agentId": "agent-uuid",
    "status": "queued",
    "invocationSource": "on_demand"
  },
  "timestamp": "2026-03-28T12:00:00Z"
}
```

### Activity Events

Sent for system activity:

| Event | Description | Data |
|-------|-------------|------|
| `activity:new` | New activity | `{ activity }` |
| `alert:new` | New alert | `{ alert }` |

**Example:**
```json
{
  "type": "activity:new",
  "activity": {
    "id": "act-uuid",
    "action": "task.created",
    "actor_type": "user",
    "actor_id": "user-uuid",
    "entity_type": "task",
    "entity_id": "task-uuid",
    "severity": "info",
    "occurred_at": "2026-03-28T12:00:00Z"
  },
  "timestamp": "2026-03-28T12:00:00Z"
}
```

### Collaboration Events

| Event | Description | Data |
|-------|-------------|------|
| `presence:update` | User presence | `{ userId, status, room }` |
| `typing:start` | Typing started | `{ userId, userName, room }` |
| `typing:stop` | Typing stopped | `{ userId, room }` |
| `cursor:move` | Cursor moved | `{ userId, x, y, room }` |

**Example:**
```json
{
  "type": "presence:update",
  "room": "doc:doc-uuid",
  "userId": "user-uuid",
  "status": "online",
  "lastSeen": "2026-03-28T12:00:00Z"
}
```

### Room Events

| Event | Description | Data |
|-------|-------------|------|
| `room:joined` | User joined room | `{ room, userId, members }` |
| `room:left` | User left room | `{ room, userId, members }` |
| `room:broadcast` | Room broadcast | `{ room, data, from }` |
| `room:member_joined` | Member joined | `{ room, user }` |
| `room:member_left` | Member left | `{ room, userId }` |

---

## Real-time Features

### Presence Tracking

Update your presence status:

```javascript
ws.send(JSON.stringify({
  type: 'presence:update',
  room: 'company:comp-uuid',
  status: 'online',  // online, away, busy, offline
  activity: 'editing document'
}));
```

Receive presence updates:
```json
{
  "type": "presence:update",
  "room": "company:comp-uuid",
  "userId": "user-uuid",
  "status": "online",
  "activity": "editing document",
  "timestamp": "2026-03-28T12:00:00Z"
}
```

### Typing Indicators

Start typing:
```javascript
ws.send(JSON.stringify({
  type: 'typing:start',
  room: 'task:task-uuid'
}));
```

Stop typing:
```javascript
ws.send(JSON.stringify({
  type: 'typing:stop',
  room: 'task:task-uuid'
}));
```

Receive typing indicators:
```json
{
  "type": "typing:start",
  "room": "task:task-uuid",
  "userId": "user-uuid",
  "userName": "John Doe",
  "timestamp": "2026-03-28T12:00:00Z"
}
```

### Cursor Tracking

Update cursor position:
```javascript
ws.send(JSON.stringify({
  type: 'cursor:move',
  room: 'doc:doc-uuid',
  x: 100,
  y: 200,
  selection: { start: 50, end: 100 }
}));
```

### Broadcasting

Send message to all room members:
```javascript
ws.send(JSON.stringify({
  type: 'broadcast',
  room: 'project:project-uuid',
  data: {
    type: 'task_updated',
    taskId: 'task-uuid',
    changes: { status: 'completed' }
  }
}));
```

---

## Heartbeat Controller Events

The Heartbeat Controller broadcasts these events to WebSocket rooms:

### Run Lifecycle Events

```javascript
// Subscribe to all heartbeat events
ws.send(JSON.stringify({ type: 'subscribe', room: 'heartbeat' }));

// Subscribe to specific agent events
ws.send(JSON.stringify({ type: 'subscribe', room: 'agent:agent-uuid' }));

// Subscribe to specific run events
ws.send(JSON.stringify({ type: 'subscribe', room: 'run:run-uuid' }));
```

### Event Broadcasting

The controller broadcasts to multiple rooms:

```javascript
// Broadcast to heartbeat room (all subscribers)
wsServer.broadcastToRoom('heartbeat', {
  type: 'run:created',
  data: { run },
  timestamp: new Date().toISOString()
});

// Broadcast to agent-specific room
wsServer.broadcastToRoom(`agent:${agentId}`, {
  type: 'run:created',
  data: { run },
  timestamp: new Date().toISOString()
});

// Broadcast to run-specific room
wsServer.broadcastToRoom(`run:${runId}`, {
  type: 'run:log',
  data: { runId, stream, chunk },
  timestamp: new Date().toISOString()
});
```

---

## Activity Events

### Subscribe to Activity Feed

```javascript
ws.send(JSON.stringify({ type: 'subscribe', room: 'activity' }));
```

### Activity Event Format

```json
{
  "type": "activity:new",
  "activity": {
    "id": "act-uuid",
    "action": "task.created",
    "actor_type": "user",
    "actor_id": "user-uuid",
    "actor_name": "John Doe",
    "entity_type": "task",
    "entity_id": "task-uuid",
    "company_id": "comp-uuid",
    "project_id": "project-uuid",
    "category": "task",
    "severity": "info",
    "status": "success",
    "metadata": { "title": "New Task" },
    "occurred_at": "2026-03-28T12:00:00Z"
  },
  "timestamp": "2026-03-28T12:00:00Z"
}
```

---

## Error Handling

### Error Message Format

```json
{
  "type": "error",
  "message": "Error description",
  "code": "ERROR_CODE",
  "details": {}  // Optional additional details
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `AUTH_FAILED` | Authentication failed |
| `AUTH_REQUIRED` | Authentication required |
| `INVALID_MESSAGE` | Invalid message format |
| `ROOM_NOT_FOUND` | Room does not exist |
| `NOT_SUBSCRIBED` | Not subscribed to room |
| `RATE_LIMITED` | Too many messages |
| `INTERNAL_ERROR` | Server error |

### Reconnection Strategy

```javascript
class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.reconnectInterval = 5000;
    this.maxReconnectInterval = 30000;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.authenticate();
    };

    this.ws.onclose = () => {
      this.reconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectInterval
    );

    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }
}
```

---

## Client Implementation

### Complete Client Example

```javascript
class CkamalWebSocket {
  constructor(options = {}) {
    this.url = options.url || 'wss://api.example.com/ws';
    this.token = options.token;
    this.companyId = options.companyId;
    
    this.ws = null;
    this.subscriptions = new Set();
    this.messageHandlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectInterval = 5000;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.authenticate();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onclose = () => {
        this.reconnect();
      };

      this.ws.onerror = (error) => {
        reject(error);
      };

      // Wait for auth success
      this.once('auth_success', () => {
        this.reconnectAttempts = 0;
        resolve();
      });
    });
  }

  authenticate() {
    this.send({
      type: 'auth',
      token: this.token,
      companyId: this.companyId
    });
  }

  send(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  subscribe(room) {
    this.subscriptions.add(room);
    this.send({ type: 'subscribe', room });
  }

  unsubscribe(room) {
    this.subscriptions.delete(room);
    this.send({ type: 'unsubscribe', room });
  }

  on(event, handler) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event).push(handler);
  }

  once(event, handler) {
    const onceHandler = (data) => {
      handler(data);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
  }

  off(event, handler) {
    const handlers = this.messageHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  handleMessage(message) {
    const handlers = this.messageHandlers.get(message.type) || [];
    handlers.forEach(handler => handler(message));

    // Handle specific events
    switch (message.type) {
      case 'connected':
        console.log('Connected with ID:', message.id);
        break;
      case 'auth_success':
        // Resubscribe to previous rooms
        this.subscriptions.forEach(room => {
          this.send({ type: 'subscribe', room });
        });
        break;
      case 'error':
        console.error('Server error:', message.message);
        break;
    }
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      30000
    );

    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  disconnect() {
    this.ws.close();
  }
}

// Usage
const client = new CkamalWebSocket({
  url: 'wss://api.example.com/ws',
  token: 'eyJhbGciOiJIUzI1NiIs...',
  companyId: 'comp-uuid'
});

await client.connect();

// Subscribe to rooms
client.subscribe('agent:agent-uuid');
client.subscribe('activity');

// Listen for events
client.on('run:created', (data) => {
  console.log('New run:', data.data.run);
});

client.on('activity:new', (data) => {
  console.log('New activity:', data.activity);
});
```

### React Hook Example

```javascript
import { useEffect, useRef, useState, useCallback } from 'react';

function useWebSocket(token, companyId) {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!token) return;

    ws.current = new WebSocket('wss://api.example.com/ws');

    ws.current.onopen = () => {
      ws.current.send(JSON.stringify({
        type: 'auth',
        token,
        companyId
      }));
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'auth_success') {
        setConnected(true);
      }
      
      setMessages(prev => [...prev, message]);
    };

    ws.current.onclose = () => {
      setConnected(false);
    };

    return () => {
      ws.current?.close();
    };
  }, [token, companyId]);

  const subscribe = useCallback((room) => {
    ws.current?.send(JSON.stringify({ type: 'subscribe', room }));
  }, []);

  const send = useCallback((message) => {
    ws.current?.send(JSON.stringify(message));
  }, []);

  return { connected, messages, subscribe, send };
}
```

---

## Related Documentation

- [AUTHENTICATION.md](./AUTHENTICATION.md) - Authentication flows
- [ENDPOINTS.md](./ENDPOINTS.md) - REST API endpoints
- [ERRORS.md](./ERRORS.md) - Error handling
