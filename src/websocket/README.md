# WebSocket Real-Time Features

Enhanced WebSocket implementation for CogniMesh with real-time collaboration features.

## Features

### Core Features
- ✅ Room-based subscriptions with presence tracking
- ✅ Message history with persistence support
- ✅ Typing indicators
- ✅ Live cursor tracking
- ✅ Real-time annotations
- ✅ Activity feed
- ✅ Notification center
- ✅ Task collaboration
- ✅ Automatic reconnection with session recovery
- ✅ Redis adapter for multi-server scaling

### Server Features
- Heartbeat mechanism
- Authentication hooks
- Broadcast to all or specific rooms
- User presence tracking
- Message persistence adapter support
- Distributed presence with Redis
- Lock management for resource coordination

### Client Features
- Auto-connect and auto-reconnect
- Exponential backoff for reconnection
- Message queuing while offline
- Session recovery
- Heartbeat ping/pong
- Connection state management

## Quick Start

### Server

```javascript
import { createWebSocketServer } from './src/websocket/index.js';
import { createServer } from 'http';

const httpServer = createServer();
const wss = createWebSocketServer(httpServer, {
  authenticate: true,
  enablePresence: true,
  enableHistory: true,
  enableTyping: true,
  enableCursors: true,
  enableActivityFeed: true,
  enableNotifications: true,
  messageHistoryLimit: 100,
});

// Handle authentication
wss.on('authenticate', (socket, token, callback) => {
  // Validate token
  callback({ 
    success: true, 
    userId: 'user-123',
    userName: 'John Doe'
  });
});

// Start server
await wss.start();
httpServer.listen(3000);
```

### Client

```javascript
import { createWebSocketClient } from './src/websocket/index.js';

const client = createWebSocketClient({
  url: 'ws://localhost:3000',
  autoConnect: true,
  autoReconnect: true,
  auth: {
    token: 'your-auth-token',
    userId: 'user-123',
    userName: 'John Doe'
  },
  debug: true
});

// Connection events
client.on('connect', () => console.log('Connected'));
client.on('authenticated', (data) => console.log('Authenticated', data));
client.on('disconnect', (code, reason) => console.log('Disconnected', code, reason));
client.on('reconnecting', (attempt) => console.log('Reconnecting...', attempt));

// Subscribe to room
client.subscribe('room-123', { status: 'online' });

// Handle room events
client.on('subscribed', (room, data) => {
  console.log('Subscribed to', room, 'with members:', data.members);
});

// Broadcast message
client.broadcastToRoom('room-123', { 
  type: 'chat:message', 
  text: 'Hello!' 
});
```

## Room Management

### Subscribing to Rooms

```javascript
// Server
wss.joinRoom(socket, 'room-123', { status: 'online' });

// Client
client.subscribe('room-123', { 
  status: 'online',
  role: 'admin'
});
```

### Room Events

```javascript
// Server emits
{
  type: 'user:joined',
  room: 'room-123',
  user: { id: 'user-123', name: 'John' },
  presence: { status: 'online' }
}

{
  type: 'user:left',
  room: 'room-123',
  user: { id: 'user-123', name: 'John' }
}
```

## Presence Tracking

### Update Presence

```javascript
// Client
client.updatePresence('room-123', 'busy', { 
  currentTask: 'coding',
  since: Date.now()
});
```

### Presence Events

```javascript
client.on('presence', (message) => {
  // message.type: 'presence:updated' | 'presence:offline'
  // message.user: { id, name, avatar, status, ... }
});
```

## Typing Indicators

```javascript
// Start typing
client.startTyping('room-123', { field: 'comment-input' });

// Stop typing (auto-stops after timeout)
client.stopTyping('room-123');

// Listen for typing events
client.on('typing', (message) => {
  // message.type: 'typing:started' | 'typing:stopped'
  // message.userId, message.userName, message.context
});
```

## Live Cursor Tracking

```javascript
// Update cursor position (throttled)
client.updateCursor('room-123', x, y, {
  document: 'doc-123',
  selection: { start: 10, end: 20 }
});

// Listen for cursor updates
client.on('cursor', (message) => {
  // message.cursor: { userId, x, y, userColor, selection, ... }
});
```

## Message History

```javascript
// Request history
client.getHistory('room-123', {
  limit: 50,
  before: Date.now() - 3600000 // 1 hour ago
});

// Receive history
client.on('history', (room, messages) => {
  console.log('History for', room, messages);
});
```

## Activity Feed

```javascript
// Request activity feed
client.getActivityFeed({
  limit: 50,
  types: ['user:joined', 'task:updated', 'annotation:created'],
  since: new Date(Date.now() - 86400000).toISOString()
});

// Receive activities
client.on('activity', (activities) => {
  console.log('Recent activities:', activities);
});
```

## Notifications

```javascript
// Server sends notification
wss.sendNotification('user-123', {
  type: 'task:assigned',
  title: 'Task Assigned',
  message: 'John assigned you a task',
  data: { taskId: 'task-456' }
});

// Client receives
client.on('notification', (message) => {
  if (message.type === 'notification:new') {
    showToast(message.notification);
  }
});

// Mark as read
client.markNotificationsRead({ markAll: true });
```

## Real-time Annotations

```javascript
// Create annotation
client.createAnnotation('room-123', {
  document: 'doc-456',
  x: 100,
  y: 200,
  content: 'This needs review',
  type: 'comment'
});

// Update annotation
client.updateAnnotation('room-123', 'annotation-id', {
  resolved: true
});

// Delete annotation
client.deleteAnnotation('room-123', 'annotation-id');

// Get annotations
client.getAnnotations('room-123', 'doc-456');

// Listen for annotation events
client.on('annotation', (message) => {
  // message.type: 'annotation:created' | 'annotation:updated' | 'annotation:deleted' | 'annotation:list'
});
```

## Task Collaboration

```javascript
// Subscribe to task updates
client.subscribeToTask('task-123');

// Task events
client.on('task', (message) => {
  switch (message.type) {
    case 'task:updated':
      console.log('Task updated:', message.changes);
      break;
    case 'task:comment':
      console.log('New comment:', message.comment);
      break;
    case 'task:assigned':
      console.log('Task assigned to:', message.assigneeName);
      break;
  }
});

// Update task
client.updateTask('task-123', {
  status: 'in_progress',
  progress: 50
});

// Add comment
client.commentOnTask('task-123', 'Great progress!', parentCommentId);

// Assign task
client.assignTask('task-123', 'user-456', 'Jane Doe');
```

## Reconnection & Session Recovery

```javascript
const client = createWebSocketClient({
  url: 'ws://localhost:3000',
  autoReconnect: true,
  reconnectInterval: 1000,
  maxReconnectInterval: 30000,
  reconnectDecay: 1.5,
  maxReconnectAttempts: 10
});

// Track last event for recovery
let lastEventId = null;

client.on('message', (message) => {
  if (message.eventId) {
    lastEventId = message.eventId;
  }
});

// Manual reconnection with recovery
client.reconnect({ lastEventId });

// Listen for reconnection
client.on('reconnected', (data) => {
  console.log('Reconnected! Missed messages:', data.missedMessages);
});
```

## Redis Adapter (Multi-Server)

```javascript
import { RedisAdapter } from './src/websocket/index.js';

const adapter = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  keyPrefix: 'ws:',
  presenceTTL: 120,
  messageTTL: 86400
});

await adapter.connect();

// Use with WebSocket server
const wss = createWebSocketServer(httpServer, {
  messagePersistenceAdapter: adapter,
  presenceAdapter: adapter
});

// Handle cross-server messages
adapter.onMessage((message) => {
  // Broadcast to local clients
  wss.broadcastToRoom(message.room, message.payload);
});
```

### Mock Adapter (Development)

```javascript
import { MockRedisAdapter } from './src/websocket/index.js';

const adapter = new MockRedisAdapter();
await adapter.connect();
// Use for development without Redis
```

## Server API

### Methods

| Method | Description |
|--------|-------------|
| `joinRoom(socket, room, presence?, metadata?)` | Add socket to room |
| `leaveRoom(socket, room, isDisconnecting?)` | Remove socket from room |
| `broadcast(data, exclude?)` | Broadcast to all clients |
| `broadcastToRoom(room, data, exclude?)` | Broadcast to room |
| `sendToClient(clientId, data)` | Send to specific client |
| `sendToUser(userId, data)` | Send to all user's sockets |
| `sendNotification(userId, notification)` | Send notification |
| `getRoomClients(room)` | Get clients in room |
| `getRoomInfo(room)` | Get room information |
| `getStats()` | Get server statistics |
| `getActivityFeed(options?)` | Get activity feed |
| `getUserNotifications(userId, options?)` | Get user notifications |
| `createAnnotation(room, annotation)` | Create annotation |
| `getAnnotations(room, document?)` | Get annotations |

### Events

| Event | Description |
|-------|-------------|
| `connection` | New connection |
| `authenticated` | Client authenticated |
| `disconnect` | Client disconnected |
| `subscribe` | Client subscribed to room |
| `unsubscribe` | Client unsubscribed |
| `presence:update` | Presence updated |
| `typing:start` | User started typing |
| `typing:stop` | User stopped typing |
| `cursor:update` | Cursor position updated |
| `activity` | New activity recorded |
| `notification` | Notification sent |
| `message` | Custom message received |

## Client API

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `url` | required | WebSocket URL |
| `autoConnect` | true | Auto connect on creation |
| `autoReconnect` | true | Auto reconnect on disconnect |
| `reconnectInterval` | 1000 | Initial reconnect interval (ms) |
| `maxReconnectInterval` | 30000 | Maximum reconnect interval (ms) |
| `reconnectDecay` | 1.5 | Reconnect backoff factor |
| `maxReconnectAttempts` | 10 | Max reconnect attempts (0 = infinite) |
| `heartbeatInterval` | 30000 | Heartbeat interval (ms) |
| `connectionTimeout` | 10000 | Connection timeout (ms) |
| `auth` | null | Authentication data |
| `debug` | false | Enable debug logging |

### Methods

| Method | Description |
|--------|-------------|
| `connect()` | Connect to server |
| `disconnect(code?, reason?)` | Disconnect from server |
| `authenticate(auth)` | Authenticate |
| `reconnect(options?)` | Reconnect with recovery |
| `send(data)` | Send message |
| `subscribe(room, presence?, metadata?)` | Subscribe to room |
| `unsubscribe(room)` | Unsubscribe from room |
| `broadcastToRoom(room, payload, eventId?)` | Broadcast to room |
| `updatePresence(room, status, data?)` | Update presence |
| `startTyping(room, context?)` | Start typing indicator |
| `stopTyping(room)` | Stop typing indicator |
| `updateCursor(room, x, y, options?)` | Update cursor position |
| `getHistory(room, options?)` | Get message history |
| `getActivityFeed(options?)` | Get activity feed |
| `markNotificationsRead(options?)` | Mark notifications read |
| `clearNotifications(options?)` | Clear notifications |
| `createAnnotation(room, annotation)` | Create annotation |
| `updateAnnotation(room, id, updates)` | Update annotation |
| `deleteAnnotation(room, id)` | Delete annotation |
| `getAnnotations(room, document?)` | Get annotations |
| `subscribeToTask(taskId)` | Subscribe to task |
| `unsubscribeFromTask(taskId)` | Unsubscribe from task |
| `updateTask(taskId, changes)` | Update task |
| `commentOnTask(taskId, comment, parentId?)` | Comment on task |
| `assignTask(taskId, assigneeId, assigneeName)` | Assign task |
| `destroy()` | Clean up and disconnect |

### Events

| Event | Description |
|-------|-------------|
| `connect` | Connected to server |
| `authenticated` | Successfully authenticated |
| `auth_failed` | Authentication failed |
| `disconnect` | Disconnected from server |
| `reconnecting` | Reconnecting (attempt #) |
| `reconnected` | Successfully reconnected |
| `reconnect_failed` | Reconnection failed |
| `error` | Connection error |
| `server_error` | Server error message |
| `subscribed` | Subscribed to room |
| `presence` | Presence update |
| `typing` | Typing indicator |
| `cursor` | Cursor update |
| `history` | History response |
| `activity` | Activity feed |
| `notification` | Notification |
| `annotation` | Annotation event |
| `task` | Task collaboration event |
| `user` | User joined/left |
| `message` | Custom message |

## Message Protocol

### Client → Server

```typescript
// Authentication
{ type: 'auth', token: string, userId?: string, userName?: string }

// Room management
{ type: 'subscribe', room: string, presence?: object, metadata?: object }
{ type: 'unsubscribe', room: string }

// Broadcasting
{ type: 'broadcast', room?: string, payload: object, eventId?: string }

// Presence
{ type: 'presence:update', room: string, status: string, data?: object }

// Typing
{ type: 'typing:start', room: string, context?: object }
{ type: 'typing:stop', room: string }

// Cursor
{ type: 'cursor:update', room: string, x: number, y: number, selection?: object, document?: string }

// History
{ type: 'history:get', room: string, limit?: number, before?: number, after?: number }

// Activity
{ type: 'activity:get', limit?: number, types?: string[], since?: string }

// Notifications
{ type: 'notification:markRead', notificationId?: string, markAll?: boolean }
{ type: 'notification:clear', notificationId?: string, clearAll?: boolean }

// Annotations
{ type: 'annotation:create', room: string, document?: string, x: number, y: number, content: string, type?: string }
{ type: 'annotation:update', room: string, annotationId: string, updates: object }
{ type: 'annotation:delete', room: string, annotationId: string }
{ type: 'annotation:get', room: string, document?: string }

// Task collaboration
{ type: 'task:subscribe', taskId: string }
{ type: 'task:unsubscribe', taskId: string }
{ type: 'task:update', taskId: string, changes: object }
{ type: 'task:comment', taskId: string, comment: string, parentId?: string }
{ type: 'task:assign', taskId: string, assigneeId: string, assigneeName?: string }

// Reconnection
{ type: 'reconnect', previousId?: string, lastEventId?: string, rooms?: string[] }

// Heartbeat
{ type: 'ping', timestamp: number }
```

### Server → Client

```typescript
// Connection
{ type: 'connected', id: string, serverTime: number, features: object }
{ type: 'auth_success', id: string, userId: string, serverTime: number, features: object }
{ type: 'auth_failed', message: string }
{ type: 'reconnected', id: string, userId: string, reconnectedRooms: string[], missedMessages: object[], serverTime: number }

// Room
{ type: 'subscribed', room: string, members: string[], presence: object[], typing: string[] }
{ type: 'unsubscribed', room: string }
{ type: 'user:joined', room: string, user: object, presence?: object }
{ type: 'user:left', room: string, user: object }

// Broadcast confirmation
{ type: 'broadcast:confirmed', eventId: string, timestamp: number }

// Presence
{ type: 'presence:updated', room: string, user: object }
{ type: 'presence:offline', room: string, userId: string }

// Typing
{ type: 'typing:started', room: string, userId: string, userName: string, context?: object }
{ type: 'typing:stopped', room: string, userId: string, userName: string }

// Cursor
{ type: 'cursor:updated', room: string, cursor: object }

// History
{ type: 'history:response', room: string, messages: object[], count: number, total: number }
{ type: 'history:error', message: string }

// Activity
{ type: 'activity:response', activities: object[], count: number }
{ type: 'activity:error', message: string }

// Notifications
{ type: 'notification:new', notification: object }
{ type: 'notifications:count', unread: number, total: number }

// Annotations
{ type: 'annotation:created', annotation: object }
{ type: 'annotation:updated', annotation: object }
{ type: 'annotation:deleted', annotationId: string }
{ type: 'annotation:list', room: string, document?: string, annotations: object[] }
{ type: 'annotation:error', message: string }

// Task collaboration
{ type: 'task:subscribed', taskId: string, room: string }
{ type: 'task:unsubscribed', taskId: string }
{ type: 'task:updated', taskId: string, changes: object, updatedBy: string, updatedByName: string, timestamp: number }
{ type: 'task:comment', taskId: string, comment: object }
{ type: 'task:assigned', taskId: string, assigneeId: string, assigneeName: string, assignedBy: string, timestamp: number }
{ type: 'task:error', message: string }

// Heartbeat
{ type: 'pong', timestamp: number }

// Errors
{ type: 'error', message: string }
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     WebSocket Server                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Server    │  │   Stream    │  │      Redis Adapter      │ │
│  │   (ws)      │  │   Manager   │  │   (Multi-server sync)   │ │
│  └──────┬──────┘  └─────────────┘  └─────────────────────────┘ │
│         │                                                       │
│  ┌──────┴─────────────────────────────────────────────────────┐│
│  │              Real-time Features                             ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  ││
│  │  │ Presence │ │  Typing  │ │  Cursor  │ │   Activity   │  ││
│  │  │ Tracking │ │Indicators│ │ Tracking │ │    Feed      │  ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  ││
│  │  │ Message  │ │   Task   │ │   Real   │ │ Notification │  ││
│  │  │ History  │ │   Collab │ │  -time   │ │   Center     │  ││
│  │  │          │ │          │ │ Annotations│              │  ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                    WebSocket │ Connection
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     WebSocket Client                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Resilience Layer                                ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ ││
│  │  │ Auto-reconnect│ │ Session     │ │   Message Queue      │ ││
│  │  │ w/ Backoff   │ │ Recovery    │ │   (Offline support)  │ ││
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Feature API                                     ││
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐   ││
│  │  │ Rooms   │ │Presence │ │ Typing  │ │ Cursor Tracking │   ││
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘   ││
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐   ││
│  │  │ History │ │Activity │ │   Task  │ │  Notifications  │   ││
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Performance Considerations

- **Heartbeat**: 30s interval with 60s timeout
- **Typing timeout**: 5s auto-clear
- **Presence timeout**: 60s inactivity
- **Message history limit**: 100 per room (configurable)
- **Cursor updates**: Should be throttled client-side
- **Reconnection**: Exponential backoff starting at 1s
- **Activity feed**: Limited to 1000 events
- **Notifications**: Limited to 100 per user

## License

MIT
