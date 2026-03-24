# WebSocket Module Contract

**Version:** 2.0.0  
**Status:** STABLE  
**Last Updated:** 2026-03-23

## Overview

This document defines the contract for the WebSocket module which provides real-time communication capabilities with collaboration features.

## Features

### Core Capabilities
- ✅ Room-based subscriptions
- ✅ Presence tracking
- ✅ Message history
- ✅ Typing indicators
- ✅ Live cursor tracking
- ✅ Real-time annotations
- ✅ Activity feed
- ✅ Notification center
- ✅ Task collaboration
- ✅ Automatic reconnection
- ✅ Multi-server scaling (Redis)

## API Contract

### Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connection` | `socket, request` | New client connected |
| `authenticated` | `socket` | Client authenticated |
| `disconnect` | `socket, code, reason` | Client disconnected |
| `subscribe` | `socket, room` | Client joined room |
| `unsubscribe` | `socket, room` | Client left room |
| `presence:update` | `socket, room, data` | Presence updated |
| `typing:start` | `socket, room` | User started typing |
| `typing:stop` | `socket, room` | User stopped typing |
| `cursor:update` | `socket, room, data` | Cursor position updated |
| `activity` | `activity` | New activity recorded |
| `notification` | `userId, notification` | Notification sent |
| `message` | `socket, message` | Custom message received |
| `error` | `error` | Server error |

### Client Protocol

#### Authentication
```javascript
// Request
{ type: 'auth', token: string, userId?: string, userName?: string, userAvatar?: string }

// Success Response
{ type: 'auth_success', id: string, userId: string, serverTime: number, features: object }

// Failure Response
{ type: 'auth_failed', message: string }
```

#### Room Management
```javascript
// Subscribe
{ type: 'subscribe', room: string, presence?: object, metadata?: object }
{ type: 'subscribed', room: string, members: string[], presence: object[], typing: string[] }

// Unsubscribe
{ type: 'unsubscribe', room: string }
{ type: 'unsubscribed', room: string }

// User events
{ type: 'user:joined', room: string, user: object, presence?: object }
{ type: 'user:left', room: string, user: object }
```

#### Broadcasting
```javascript
// Send
{ type: 'broadcast', room?: string, payload: object, eventId?: string }

// Confirmation
{ type: 'broadcast:confirmed', eventId: string, timestamp: number }
```

#### Presence
```javascript
// Update
{ type: 'presence:update', room: string, status: string, data?: object }

// Events
{ type: 'presence:updated', room: string, user: object }
{ type: 'presence:offline', room: string, userId: string }
```

#### Typing Indicators
```javascript
// Control
{ type: 'typing:start', room: string, context?: object }
{ type: 'typing:stop', room: string }

// Events
{ type: 'typing:started', room: string, userId: string, userName: string, context?: object }
{ type: 'typing:stopped', room: string, userId: string, userName: string }
```

#### Cursor Tracking
```javascript
// Update
{ type: 'cursor:update', room: string, x: number, y: number, selection?: object, document?: string }

// Event
{ type: 'cursor:updated', room: string, cursor: object }
```

#### Message History
```javascript
// Request
{ type: 'history:get', room: string, limit?: number, before?: number, after?: number }

// Response
{ type: 'history:response', room: string, messages: object[], count: number, total: number }
{ type: 'history:error', message: string }
```

#### Activity Feed
```javascript
// Request
{ type: 'activity:get', limit?: number, types?: string[], since?: string }

// Response
{ type: 'activity:response', activities: object[], count: number }
{ type: 'activity:error', message: string }
```

#### Notifications
```javascript
// Mark read
{ type: 'notification:markRead', notificationId?: string, markAll?: boolean }

// Clear
{ type: 'notification:clear', notificationId?: string, clearAll?: boolean }

// Events
{ type: 'notification:new', notification: object }
{ type: 'notifications:count', unread: number, total: number }
```

#### Real-time Annotations
```javascript
// Create
{ type: 'annotation:create', room: string, document?: string, x: number, y: number, content: string, type?: string }
{ type: 'annotation:created', annotation: object }

// Update
{ type: 'annotation:update', room: string, annotationId: string, updates: object }
{ type: 'annotation:updated', annotation: object }

// Delete
{ type: 'annotation:delete', room: string, annotationId: string }
{ type: 'annotation:deleted', annotationId: string }

// Get
{ type: 'annotation:get', room: string, document?: string }
{ type: 'annotation:list', room: string, document?: string, annotations: object[] }
{ type: 'annotation:error', message: string }
```

#### Task Collaboration
```javascript
// Subscribe
{ type: 'task:subscribe', taskId: string }
{ type: 'task:subscribed', taskId: string, room: string }

// Unsubscribe
{ type: 'task:unsubscribe', taskId: string }
{ type: 'task:unsubscribed', taskId: string }

// Update
{ type: 'task:update', taskId: string, changes: object }
{ type: 'task:updated', taskId: string, changes: object, updatedBy: string, updatedByName: string, timestamp: number }

// Comment
{ type: 'task:comment', taskId: string, comment: string, parentId?: string }
{ type: 'task:comment', taskId: string, comment: object }

// Assign
{ type: 'task:assign', taskId: string, assigneeId: string, assigneeName?: string }
{ type: 'task:assigned', taskId: string, assigneeId: string, assigneeName: string, assignedBy: string, timestamp: number }

// Error
{ type: 'task:error', message: string }
```

#### Reconnection
```javascript
// Request
{ type: 'reconnect', previousId?: string, lastEventId?: string, rooms?: string[] }

// Response
{ type: 'reconnected', id: string, userId: string, reconnectedRooms: string[], missedMessages: object[], serverTime: number }
```

#### Heartbeat
```javascript
// Ping
{ type: 'ping', timestamp: number }

// Pong
{ type: 'pong', timestamp: number }
```

## Configuration

### Server Options
```typescript
interface ConnectionOptions {
  authenticate?: boolean;              // Require authentication (default: true)
  heartbeatInterval?: number;          // Heartbeat interval ms (default: 30000)
  heartbeatTimeout?: number;           // Heartbeat timeout ms (default: 60000)
  messageHistoryLimit?: number;        // Max messages per room (default: 100)
  typingTimeout?: number;              // Typing indicator timeout ms (default: 5000)
  presenceTimeout?: number;            // Presence inactivity timeout ms (default: 60000)
  enablePresence?: boolean;            // Enable presence tracking (default: true)
  enableHistory?: boolean;             // Enable message history (default: true)
  enableTyping?: boolean;              // Enable typing indicators (default: true)
  enableCursors?: boolean;             // Enable cursor tracking (default: true)
  enableActivityFeed?: boolean;        // Enable activity feed (default: true)
  enableNotifications?: boolean;       // Enable notifications (default: true)
  messagePersistenceAdapter?: Adapter; // Message persistence adapter
  presenceAdapter?: Adapter;           // Distributed presence adapter
}
```

### Client Options
```typescript
interface WebSocketClientOptions {
  url: string;                         // WebSocket server URL
  autoConnect?: boolean;               // Auto connect on creation (default: true)
  autoReconnect?: boolean;             // Auto reconnect (default: true)
  reconnectInterval?: number;          // Initial reconnect interval ms (default: 1000)
  maxReconnectInterval?: number;       // Max reconnect interval ms (default: 30000)
  reconnectDecay?: number;             // Backoff factor (default: 1.5)
  maxReconnectAttempts?: number;       // Max attempts, 0 = infinite (default: 10)
  heartbeatInterval?: number;          // Heartbeat interval ms (default: 30000)
  connectionTimeout?: number;          // Connection timeout ms (default: 10000)
  auth?: object;                       // Authentication data
  debug?: boolean;                     // Enable debug logging (default: false)
  rooms?: string[];                    // Initial rooms to subscribe
}
```

## Error Handling

### Server Error Types
| Error | Description | Action |
|-------|-------------|--------|
| `auth_failed` | Authentication failed | Re-authenticate or close |
| `room_not_found` | Room doesn't exist | Check room name |
| `not_subscribed` | Not in room | Subscribe first |
| `rate_limited` | Too many messages | Slow down |
| `invalid_message` | Invalid message format | Check protocol |

### Client Error Types
| Error | Description | Action |
|-------|-------------|--------|
| `connection_timeout` | Failed to connect | Retry with backoff |
| `reconnect_failed` | Max attempts reached | Manual reconnect |
| `server_error` | Server reported error | Check error details |
| `parse_error` | Invalid JSON received | Ignore or log |

## Performance Requirements

| Metric | Target | Maximum |
|--------|--------|---------|
| Connection latency | < 100ms | 500ms |
| Message propagation | < 50ms | 200ms |
| Reconnection time | < 2s | 10s |
| Heartbeat interval | 30s | 60s |
| Typing timeout | 5s | 10s |
| Message history | 100 | 1000 |
| Concurrent rooms | 10 | 50 |
| Presence updates | 1/s | 5/s |

## Security

### Authentication
- All connections must authenticate unless `authenticate: false`
- Token-based authentication via `auth` message
- Failed auth results in connection close (code 1008)

### Authorization
- Room access controlled by application logic
- Presence data filtered by room membership
- Notifications only sent to target users

### Rate Limiting
- Presence updates: 1 per second per user per room
- Cursor updates: 10 per second per user
- Broadcast: 30 per minute per user

## Scaling

### Redis Adapter
```javascript
import { RedisAdapter } from './websocket/redis-adapter.js';

const adapter = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  keyPrefix: 'ws:',
  presenceTTL: 120,
  messageTTL: 86400
});

const wss = createWebSocketServer(server, {
  messagePersistenceAdapter: adapter,
  presenceAdapter: adapter
});
```

### Multi-Server Architecture
```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Client 1│     │ Client 2│     │ Client 3│
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     └───────────────┼───────────────┘
                     │
            ┌────────┴────────┐
            │   Load Balancer │
            └────────┬────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────┴────┐  ┌────┴────┐  ┌────┴────┐
   │ Server 1│  │ Server 2│  │ Server 3│
   │ + Redis │  │ + Redis │  │ + Redis │
   │ Adapter │  │ Adapter │  │ Adapter │
   └────┬────┘  └────┬────┘  └────┬────┘
        │            │            │
        └────────────┼────────────┘
                     │
               ┌─────┴─────┐
               │   Redis   │
               │   Pub/Sub │
               └───────────┘
```

## Testing

### Unit Tests
```javascript
// Test presence tracking
// Test typing indicators
// Test cursor updates
// Test room subscriptions
// Test message history
// Test reconnection
```

### Integration Tests
```javascript
// Multi-client scenarios
// Redis adapter sync
// Reconnection recovery
// Message ordering
```

## Migration Guide

### From v1.x to v2.0

1. **Authentication**: Now requires explicit `auth` message
2. **Rooms**: Changed from `join` to `subscribe` terminology
3. **Presence**: Now enabled by default, set `enablePresence: false` to disable
4. **History**: Now enabled by default, requires persistence adapter for cross-server

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-03-23 | Added presence, typing, cursors, annotations, activity feed, notifications, task collaboration, reconnection, Redis adapter |
| 1.0.0 | 2026-01-15 | Initial WebSocket server with rooms and heartbeat |

## References

- WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- ws library: https://github.com/websockets/ws
- Redis: https://redis.io/
