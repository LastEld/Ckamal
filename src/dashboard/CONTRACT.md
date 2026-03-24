# Dashboard Module Contract

## Overview

The Dashboard Module provides a web-based monitoring and management interface for CogniMesh v5.0. It includes an Express HTTP server, REST API endpoints, WebSocket real-time updates, and a single-page application frontend.

## Public Interfaces

### DashboardServer

Main dashboard server class.

```javascript
import { DashboardServer } from './dashboard/server.js';

const server = new DashboardServer({
  port: 3000,
  host: '0.0.0.0',
  authEnabled: true,
  jwtSecret: process.env.JWT_SECRET
});
```

**Methods:**

- `constructor(options)` - Creates dashboard server
  - `options.port` - Server port (default: 3000)
  - `options.host` - Server host (default: '0.0.0.0')
  - `options.jwtSecret` - JWT secret for auth
  - `options.authEnabled` - Enable authentication
  - `options.apiBaseUrl` - Base URL for API proxy

- `setupMiddleware()` - Configures Express middleware
  - Security headers, CORS, rate limiting, body parsing

- `authMiddleware(req, res, next)` - JWT authentication middleware

- `requireRole(...roles)` - Role-based access control middleware

- `setupRoutes()` - Sets up all API routes

- `setupAuthRoutes()` - Authentication routes
  - POST `/api/auth/login` - User login
  - GET `/api/auth/verify` - Verify token
  - POST `/api/auth/logout` - Logout

- `setupTaskRoutes()` - Task management routes
  - GET `/api/tasks` - List tasks
  - GET `/api/tasks/:id` - Get task
  - POST `/api/tasks` - Create task
  - PUT `/api/tasks/:id` - Update task
  - PATCH `/api/tasks/:id` - Partial update
  - DELETE `/api/tasks/:id` - Delete task
  - POST `/api/tasks/batch` - Batch update
  - GET `/api/tasks/matrix` - Eisenhower matrix

- `setupRoadmapRoutes()` - Roadmap routes
  - GET `/api/roadmaps` - List roadmaps
  - GET `/api/roadmaps/:id` - Get roadmap
  - PUT `/api/roadmaps/:id` - Update roadmap
  - POST `/api/roadmaps/:id/phases` - Create phase
  - GET `/api/roadmaps/:id/progress` - Get progress

- `setupAnalyticsRoutes()` - Analytics routes
  - GET `/api/analytics/dashboard` - Dashboard stats
  - GET `/api/analytics/trends` - Trend data
  - GET `/api/analytics/performance` - Performance metrics
  - GET `/api/analytics/agents` - Agent activity

- `setupAlertRoutes()` - Alert routes
  - GET `/api/alerts` - List alerts
  - POST `/api/alerts` - Create alert
  - POST `/api/alerts/:id/acknowledge` - Acknowledge
  - DELETE `/api/alerts/:id` - Dismiss alert

- `setupSystemRoutes()` - System routes
  - GET `/api/system/status` - System status
  - GET `/api/system/metrics` - System metrics
  - `/api/agents/*` - Proxy to core API

- `setupErrorHandling()` - Error handling middleware

- `start()` - Starts the server
  - Returns: Promise<Server>

- `stop()` - Stops the server
  - Returns: Promise<void>

### DashboardWebSocket

WebSocket server for real-time updates. Extends the unified `WebSocketServer` from `src/websocket/server.js` with dashboard-specific functionality.

- `constructor(server, options)` - Creates WebSocket server
  - `options.jwtSecret` - JWT secret for authentication
  - `options.authEnabled` - Enable authentication (default: true)
  - `options.heartbeatInterval` - Heartbeat interval (default: 30000ms)
  - `options.heartbeatTimeout` - Heartbeat timeout (default: 60000ms)

**Inherited from WebSocketServer:**
- `start()` - Starts WebSocket server
  - Returns: Promise<void>
- `stop()` - Stops WebSocket server
  - Returns: Promise<void>
- `broadcast(data, exclude)` - Broadcasts to all clients
- `broadcastToRoom(room, data, exclude)` - Broadcasts to a specific room
- `sendToClient(clientId, data)` - Sends to specific client by ID
- `sendToUser(userId, data)` - Sends to all connections of a user
- `joinRoom(socket, room)` - Makes a socket join a room
- `leaveRoom(socket, room)` - Makes a socket leave a room
- `getClientCount()` - Returns connected client count
- `getClients()` - Returns all connected clients
- `getRooms()` - Returns active room names
- `getRoomClients(room)` - Returns clients in a room
- `getRoomSize(room)` - Returns number of members in a room
- `disconnect(clientId, code, reason)` - Disconnects a client
- `disconnectAll(code, reason)` - Disconnects all clients
- `isRunning()` - Returns server status
- `getStats()` - Returns server statistics

**Dashboard-specific methods:**
- `notifyTaskUpdate(task)` - Notifies about task update
- `notifyTaskCreated(task)` - Notifies about new task
- `notifyTaskDeleted(taskId)` - Notifies about task deletion
- `notifyTaskMoved(taskId, fromQuadrant, toQuadrant)` - Notifies about task move
- `notifyRoadmapProgress(roadmapId, progress)` - Notifies about roadmap progress
- `notifyRoadmapUpdated(roadmap)` - Notifies about roadmap update
- `notifyMilestoneReached(roadmapId, milestone)` - Notifies about milestone
- `notifyAlert(alert)` - Sends alert notification
- `notifyAlertResolved(alertId)` - Notifies about resolved alert
- `notifySystemStatus(status)` - Broadcasts system status
- `notifyAgentActivity(activity)` - Notifies about agent activity
- `getDashboardStats()` - Returns dashboard-specific statistics
- `extractToken(req)` - Extracts JWT token from request

## Data Structures

### DashboardConfig

```typescript
interface DashboardConfig {
  port: number;
  host: string;
  jwtSecret: string;
  authEnabled: boolean;
  apiBaseUrl: string;
  corsOrigin: string | boolean;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}
```

### HealthResponse

```typescript
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
}
```

### DashboardStats

```typescript
interface DashboardStats {
  taskStats: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
  };
  completionRate: number;
  averageCompletionTime: number;
  tasksByPriority: Record<string, number>;
  tasksByQuadrant: {
    doFirst: number;
    schedule: number;
    delegate: number;
    eliminate: number;
  };
}
```

### SystemStatus

```typescript
interface SystemStatus {
  status: 'operational' | 'degraded' | 'down';
  components: {
    api: 'healthy' | 'degraded' | 'down';
    websocket: 'healthy' | 'degraded' | 'down';
    database: 'healthy' | 'degraded' | 'down';
    agents: 'healthy' | 'degraded' | 'down';
  };
  version: string;
  timestamp: string;
}
```

### WebSocketMessage

```typescript
interface WebSocketMessage {
  type: string;
  data?: any;
  requestId?: string;
  timestamp?: string;
}
```

## Frontend Components

### App

Main dashboard application component.

### TasksComponent

Task management UI:
- Task list with filtering
- Eisenhower matrix view
- Task creation/editing
- Drag-and-drop quadrant changes

### RoadmapsComponent

Roadmap visualization:
- Roadmap list
- Phase/milestone view
- Progress indicators
- Gantt chart view

### AnalyticsComponent

Analytics dashboard:
- Charts and graphs
- Trend visualization
- Performance metrics
- Agent activity

### AlertsComponent

Alert management:
- Alert list with severity
- Acknowledge/dismiss actions
- Filter by level
- Real-time updates

### APIClient

HTTP client for API calls:
- Request/response handling
- Authentication headers
- Error handling
- Retry logic

### WebSocketClient

WebSocket client:
- Connection management
- Message handling
- Reconnection logic
- Event subscription

## Events

The Dashboard module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `server:started` | `{ port, host }` | Server started |
| `server:stopped` | `{}` | Server stopped |
| `client:connected` | `{ clientId }` | WebSocket client connected |
| `client:disconnected` | `{ clientId, code }` | Client disconnected |
| `ws:message` | `{ clientId, message }` | WebSocket message received |
| `ws:broadcast` | `{ event, data }` | Broadcast sent |
| `api:request` | `{ method, path, duration }` | API request handled |
| `error` | `{ error, context }` | Error occurred |

## Error Handling

### DashboardError

Base error for dashboard operations.

### AuthenticationError

Thrown when authentication fails.

### AuthorizationError

Thrown when user lacks permissions.

### ValidationError

Thrown when request validation fails.

### WebSocketError

Thrown when WebSocket operations fail.

## Usage Example

```javascript
import { DashboardServer } from './dashboard/server.js';

const server = new DashboardServer({
  port: 3000,
  jwtSecret: process.env.JWT_SECRET,
  authEnabled: true,
  apiBaseUrl: 'http://localhost:8080'
});

// Start server
await server.start();

// Access WebSocket
const wsServer = server.getWebSocketServer();
wsServer.notifySystemStatus({ status: 'operational' });
wsServer.notifyTaskUpdate({ id: 'task-1', title: 'Updated Task' });

// Stop gracefully
await server.stop();
```
