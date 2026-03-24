# Dashboard Module

## Overview

The Dashboard Module provides a comprehensive web-based monitoring and management interface for CogniMesh v5.0. It features an Express.js HTTP server with REST API endpoints, WebSocket support for real-time updates, and a modern single-page application frontend.

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Dashboard Module                      │
├────────────────────────────────┬────────────────────────┤
│         Backend (Node.js)      │     Frontend (SPA)     │
├────────────────────────────────┼────────────────────────┤
│ Express Server                 │ App.js                 │
│ ├── REST API Routes            │ ├── TasksComponent     │
│ ├── Auth Middleware            │ ├── RoadmapsComponent  │
│ ├── Rate Limiting              │ ├── AnalyticsComponent │
│ └── Error Handling             │ ├── AlertsComponent    │
│                                │ ├── APIClient          │
│ WebSocket Server               │ └── WebSocketClient    │
│ ├── Real-time Updates          │                        │
│ ├── Room Management            │ styles.css             │
│ └── Heartbeat                  │ index.html             │
└────────────────────────────────┴────────────────────────┘
```

### API Structure

```
/api/auth/*         - Authentication
/api/tasks/*        - Task management
/api/roadmaps/*     - Roadmap operations
/api/analytics/*    - Analytics data
/api/alerts/*       - Alert management
/api/system/*       - System status
/api/agents/*       - Agent proxy
```

## Components

### Backend Server

**DashboardServer**
- Express application setup
- Middleware configuration
- Route registration
- Static file serving
- Error handling

**WebSocket Server**
- Client connection management
- Room-based broadcasting
- Heartbeat monitoring
- Reconnection handling

**API Routes**
- Authentication (JWT-based)
- CRUD operations
- Batch operations
- Real-time events

### Frontend Application

**App.js**
- Application initialization
- Route handling
- State management
- Component coordination

**TasksComponent**
- Task list view
- Eisenhower matrix
- Task creation/editing
- Filter and search

**RoadmapsComponent**
- Roadmap overview
- Phase visualization
- Progress tracking
- Gantt chart

**AnalyticsComponent**
- Dashboard charts
- Trend analysis
- Performance metrics
- Export functionality

**AlertsComponent**
- Alert feed
- Severity indicators
- Acknowledge actions
- Notification settings

**APIClient**
- HTTP request wrapper
- Authentication handling
- Error interception
- Response caching

**WebSocketClient**
- Connection management
- Message parsing
- Event subscription
- Auto-reconnection

## Usage

### Server Setup

```javascript
import { DashboardServer } from './dashboard/server.js';

const server = new DashboardServer({
  port: 3000,
  host: '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET,
  authEnabled: true,
  apiBaseUrl: 'http://localhost:8080'
});

// Start server
await server.start();
console.log('Dashboard running at http://localhost:3000');
```

### Authentication

```javascript
// Login
POST /api/auth/login
{
  "username": "admin",
  "password": "secret"
}

// Response
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "admin",
    "username": "admin",
    "role": "admin"
  }
}
```

### Task API

```javascript
// List tasks with filters
GET /api/tasks?quadrant=do_first&priority=high

// Create task
POST /api/tasks
{
  "title": "Review code",
  "priority": "high",
  "quadrant": "do_first"
}

// Update task (partial)
PATCH /api/tasks/123
{
  "quadrant": "schedule"
}

// Batch update
POST /api/tasks/batch
{
  "ids": ["1", "2", "3"],
  "updates": { "status": "completed" }
}
```

### Eisenhower Matrix

```javascript
// Get matrix data
GET /api/tasks/matrix

// Response
{
  "doFirst": [...],      // Urgent & Important
  "schedule": [...],     // Not Urgent & Important
  "delegate": [...],     // Urgent & Not Important
  "eliminate": [...]     // Not Urgent & Not Important
}
```

### Roadmap API

```javascript
// Get roadmap with progress
GET /api/roadmaps/123

// Update roadmap
PUT /api/roadmaps/123
{
  "name": "Updated Name",
  "phases": [...]
}

// Get progress
GET /api/roadmaps/123/progress

// Response
{
  "roadmapId": "123",
  "overallProgress": 75,
  "phaseProgress": [...]
}
```

### Analytics API

```javascript
// Dashboard stats
GET /api/analytics/dashboard

// Trend data
GET /api/analytics/trends?period=7d

// Performance metrics
GET /api/analytics/performance

// Agent activity
GET /api/analytics/agents
```

### WebSocket Events

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000');

// Subscribe to events
ws.send(JSON.stringify({
  type: 'subscribe',
  events: ['task.created', 'alert.new']
}));

// Receive updates
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message.type, message.data);
};
```

### System Status

```javascript
// Get system status
GET /api/system/status

// Response
{
  "status": "operational",
  "components": {
    "api": "healthy",
    "websocket": "healthy",
    "database": "healthy",
    "agents": "healthy"
  }
}

// Get metrics (admin only)
GET /api/system/metrics
```

## Configuration

### Server Configuration

```javascript
{
  // Network
  port: 3000,
  host: '0.0.0.0',
  
  // Security
  jwtSecret: 'your-secret-key',
  authEnabled: true,
  corsOrigin: 'http://localhost:3000',
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxRequests: 100           // per IP
  },
  
  // Body parsing
  maxBodySize: '10mb',
  
  // Static files
  staticDir: './public',
  
  // API proxy
  apiBaseUrl: 'http://localhost:8080',
  
  // WebSocket
  websocket: {
    enabled: true,
    path: '/ws',
    heartbeatInterval: 15000,
    heartbeatTimeout: 30000
  }
}
```

### Frontend Configuration

```javascript
{
  // API
  apiBaseUrl: '/api',
  wsUrl: 'ws://localhost:3000/ws',
  
  // Features
  enableRealTime: true,
  enableNotifications: true,
  
  // UI
  theme: 'light',  // 'light' | 'dark' | 'auto'
  refreshInterval: 30000,  // 30 seconds
  
  // Pagination
  defaultPageSize: 20,
  pageSizeOptions: [10, 20, 50, 100]
}
```

### Security Headers

```javascript
{
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "cdn.jsdelivr.net"],
    styleSrc: ["'self'", "fonts.googleapis.com"],
    fontSrc: ["'self'", "fonts.gstatic.com"]
  },
  helmet: true,
  hsts: true,
  noSniff: true,
  xssFilter: true
}
```

## Best Practices

1. **Enable HTTPS**: Use HTTPS in production
2. **Secure JWT**: Use strong JWT secrets
3. **Rate Limiting**: Protect against abuse
4. **Input Validation**: Validate all API inputs
5. **Error Handling**: Don't expose internal errors
6. **Caching**: Cache appropriate responses
7. **Monitoring**: Log important events
8. **Graceful Degradation**: Handle WebSocket failures
