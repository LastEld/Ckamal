# CogniMesh Deployment Architecture

## Overview

CogniMesh supports multiple deployment options from local development to production cloud environments. This document covers deployment patterns, environment configuration, and scaling considerations.

## Deployment Options

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────────┐
│   Local Development     │  │    Docker Compose       │  │  Cloud (Railway) │
├─────────────────────────┤  ├─────────────────────────┤  ├──────────────────┤
│                         │  │                         │  │                  │
│  ┌─────────────────┐    │  │  ┌─────────────────┐    │  │  ┌────────────┐  │
│  │  Node.js 20+    │    │  │  │  CogniMesh      │    │  │  │ CogniMesh  │  │
│  │  ├─ Server      │    │  │  │  ├─ App         │    │  │  │ Container  │  │
│  │  ├─ Dashboard   │    │  │  │  ├─ Dashboard   │    │  │  └─────┬──────┘  │
│  │  └─ MCP Server  │    │  │  │  └─ MCP Server  │    │  │        │         │
│  │                 │    │  │  └────────┬────────┘    │  │  ┌─────┴──────┐  │
│  │  SQLite (local) │    │  │           │              │  │  │ PostgreSQL │  │
│  │                 │    │  │  ┌────────┴────────┐    │  │  │  (Managed) │  │
│  │  WebSocket      │    │  │  │  SQLite Volume  │    │  │  └────────────┘  │
│  │  Port 8080      │    │  │  │  (Persistent)   │    │  │                  │
│  │                 │    │  │  └─────────────────┘    │  │  Redis (opt)     │
│  │  HTTP Port 3000 │    │  │                         │  │                  │
│  └─────────────────┘    │  │  ┌─────────────────┐    │  │  Load Balancer   │
│                         │  │  │  Nginx (opt)    │    │  │  Auto-scaling    │
│  Single process         │  │  │  Reverse Proxy  │    │  │                  │
│  In-memory session      │  │  └─────────────────┘    │  │  HTTPS by default│
└─────────────────────────┘  └─────────────────────────┘  └──────────────────┘
```

## Local Development

### Prerequisites
- Node.js 20+
- npm or yarn
- Git

### Setup

```bash
# Clone repository
git clone https://github.com/cognimesh/cognimesh.git
cd cognimesh

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### Development Environment Variables

```env
# Server
NODE_ENV=development
PORT=3000
HOST=localhost

# Database
DB_PATH=./data/cognimesh.db

# WebSocket
WS_PORT=8080
WS_HEARTBEAT_INTERVAL=30000

# Auth
COGNIMESH_AUTH_MODE=trust
COGNIMESH_AUTH_SECRET=dev-secret-change-in-production
COGNIMESH_AUTH_AUTO_GENERATE=true

# AI Providers (optional)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
MOONSHOT_API_KEY=
```

## Docker Deployment

### Docker Compose (Recommended for Self-Hosting)

```yaml
# docker-compose.yml
version: '3.8'

services:
  cognimesh:
    build: .
    ports:
      - "3000:3000"
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/data/cognimesh.db
      - COGNIMESH_AUTH_MODE=required
      - COGNIMESH_AUTH_SECRET=${AUTH_SECRET}
    volumes:
      - cognimesh-data:/data
      - ./plugins:/app/plugins:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  cognimesh-data:
```

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Create data directory
RUN mkdir -p /data && chown -R node:node /data

USER node

EXPOSE 3000 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "src/index.js"]
```

### Building and Running

```bash
# Build image
docker build -t cognimesh:latest .

# Run container
docker run -d \
  -p 3000:3000 \
  -p 8080:8080 \
  -v cognimesh-data:/data \
  -e COGNIMESH_AUTH_SECRET=$(openssl rand -hex 32) \
  --name cognimesh \
  cognimesh:latest

# Or use docker-compose
docker-compose up -d
```

## Cloud Deployment (Railway)

### Configuration

```toml
# railway.toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node src/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[deploy.env]
NODE_ENV = "production"
COGNIMESH_AUTH_MODE = "required"
```

### Environment Variables in Railway

```
NODE_ENV=production
COGNIMESH_AUTH_SECRET=<generate-random-secret>
COGNIMESH_AUTH_ALGORITHM=HS256
COGNIMESH_TOKEN_LIFETIME=3600
COGNIMESH_REFRESH_LIFETIME=604800
ANTHROPIC_API_KEY=<your-key>
OPENAI_API_KEY=<your-key>
MOONSHOT_API_KEY=<your-key>
GITHUB_TOKEN=<your-token>
```

### Deploy

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up
```

## Production Configuration

### Environment Variables

```env
# Core
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DB_PATH=/data/cognimesh.db
DB_MAX_CONNECTIONS=10
DB_BUSY_TIMEOUT=5000

# Auth (Required in production)
COGNIMESH_AUTH_MODE=required
COGNIMESH_AUTH_SECRET=<32-byte-random-hex>
COGNIMESH_AUTH_ALGORITHM=HS256
COGNIMESH_TOKEN_LIFETIME=3600
COGNIMESH_REFRESH_LIFETIME=604800

# WebSocket
WS_PORT=8080
WS_HEARTBEAT_INTERVAL=30000
WS_MAX_PAYLOAD=52428800

# Security
COGNIMESH_CORS_ORIGIN=https://yourdomain.com
COGNIMESH_TRUST_PROXY=true

# AI Providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
MOONSHOT_API_KEY=

# Monitoring
SENTRY_DSN=
LOG_LEVEL=info
METRICS_ENABLED=true
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name cognimesh.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cognimesh.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # API and Dashboard
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

## Scaling Considerations

### Vertical Scaling

```
┌─────────────────────────────────────────┐
│           Single Instance               │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │         CogniMesh Node          │   │
│  │                                 │   │
│  │  CPU: 2-8 cores                │   │
│  │  RAM: 4-16 GB                  │   │
│  │  Disk: SSD recommended         │   │
│  │                                 │   │
│  │  • HTTP Server                  │   │
│  │  • WebSocket Server             │   │
│  │  • Agent Workers                │   │
│  │  • SQLite Database              │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Supports: ~100 concurrent agents       │
│            ~1000 concurrent WebSockets  │
└─────────────────────────────────────────┘
```

### SQLite Limitations

SQLite works well for:
- Single-node deployments
- Up to ~100 concurrent connections
- Datasets up to ~10GB
- Read-heavy workloads

For larger scale, consider:
- PostgreSQL (via better-sqlite3 compatibility layer)
- Connection pooling (built-in, max 10)
- Read replicas for reporting

### Agent Pool Scaling

```javascript
// Configuration
const agentPool = new AgentPool({
  minSize: 2,           // Minimum agents
  maxSize: 50,          // Maximum agents
  idleTimeout: 300000,  // 5 minutes
  scaleUpThreshold: 0.8,
  scaleDownThreshold: 0.3
});
```

### Auto-scaling Configuration

```javascript
// Auto-scaler
const autoScaler = new AutoScaler(agentPool, {
  checkInterval: 30000,
  scaleUpCooldown: 60000,
  scaleDownCooldown: 300000,
  maxAgentsPerCPU: 5,
  memoryLimitMB: 512
});
```

## High Availability

### Backup Strategy

```javascript
// Automated backups
import { BackupScheduler } from './db/backup-scheduler.js';

const scheduler = new BackupScheduler({
  db,
  backupDir: '/backups',
  schedule: '0 2 * * *',  // Daily at 2 AM
  retention: 7            // Keep 7 days
});

scheduler.start();
```

### Health Checks

```bash
# Health endpoint
GET /health

Response:
{
  "status": "healthy",
  "version": "5.0.0",
  "database": "connected",
  "websocket": "connected",
  "agents": { "active": 5, "idle": 3 },
  "uptime": 86400
}
```

### Monitoring

```javascript
// Metrics collection
const metrics = new MetricsCollector({
  enabled: true,
  exportInterval: 60000
});

// Key metrics:
// - Request latency (p50, p95, p99)
// - Agent utilization
// - Database query times
// - WebSocket connection count
// - Error rates
```

## Security Hardening

### Production Checklist

- [ ] Change default auth secret
- [ ] Enable required authentication mode
- [ ] Configure HTTPS/TLS
- [ ] Set up CORS restrictions
- [ ] Enable rate limiting
- [ ] Configure security headers
- [ ] Set up audit logging
- [ ] Enable request sanitization
- [ ] Configure backup encryption
- [ ] Set up monitoring/alerting

### Security Headers

```javascript
// Applied automatically
{
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}
```

## Troubleshooting

### Common Issues

**Database locked errors:**
```bash
# Increase busy timeout
DB_BUSY_TIMEOUT=10000
```

**Memory issues:**
```bash
# Limit agent pool
AGENT_MAX_SIZE=20
```

**WebSocket connection drops:**
```bash
# Adjust heartbeat interval
WS_HEARTBEAT_INTERVAL=15000
```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug

# Enable query logging
DB_QUERY_LOGGING=true
```

## Migration from Development to Production

1. **Export development data:**
```bash
npm run export -- --output=backup.json
```

2. **Set up production environment:**
```bash
# Configure environment variables
# Set up database
# Configure reverse proxy
# Set up SSL certificates
```

3. **Deploy:**
```bash
# Run migrations
npm run migrate

# Import data (if needed)
npm run import -- --input=backup.json

# Start server
npm start
```

4. **Verify:**
```bash
# Health check
curl https://yourdomain.com/health

# Auth check
curl -H "Authorization: Bearer $TOKEN" https://yourdomain.com/api/v1/status
```

---

*Version: 5.0.0*  
*Last Updated: 2026-03-28*
