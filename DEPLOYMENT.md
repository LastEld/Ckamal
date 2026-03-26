# CogniMesh v5.0 - Deployment Guide

> **Comprehensive deployment documentation for production-ready CogniMesh MCP Server**

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Configuration](#3-configuration)
4. [Deployment Options](#4-deployment-options)
5. [Database Setup](#5-database-setup)
6. [Client Configuration](#6-client-configuration)
7. [Security Hardening](#7-security-hardening)
8. [Monitoring](#8-monitoring)
9. [Backup & Recovery](#9-backup--recovery)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Node.js** | 20.0.0 LTS | 20.x LTS or 22.x LTS |
| **SQLite** | 3.35.0+ | 3.45.0+ |
| **Git** | 2.30+ | 2.40+ |
| **Memory** | 2 GB RAM | 4 GB RAM |
| **Disk** | 1 GB free | 10 GB free |
| **CPU** | 2 cores | 4+ cores |

### Required Software Installation

#### Node.js 20+ Installation

**Ubuntu/Debian:**
```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

**macOS (using Homebrew):**
```bash
brew install node@20
brew link node@20

# Verify installation
node --version
```

**Windows:**
```powershell
# Using Chocolatey
choco install nodejs-lts

# Or download from https://nodejs.org/en/download/
```

#### SQLite 3 Installation

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install sqlite3 libsqlite3-dev

# Verify installation
sqlite3 --version
```

**macOS:**
```bash
brew install sqlite

# Verify installation
sqlite3 --version
```

**Windows:**
```powershell
# Using Chocolatey
choco install sqlite

# Or download precompiled binaries from https://sqlite.org/download.html
```

#### Git Installation

**Ubuntu/Debian:**
```bash
sudo apt-get install git
```

**macOS:**
```bash
brew install git
```

**Windows:**
```powershell
choco install git
```

### Optional Tools

#### Docker (Optional but Recommended)

**Ubuntu/Debian:**
```bash
# Add Docker's official GPG key
sudo apt-get update
sudo apt-get install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add repository
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

**macOS:**
```bash
brew install --cask docker
```

#### PM2 (Optional - for Process Management)

```bash
npm install -g pm2

# Verify installation
pm2 --version
```

---

## 2. Installation

### Step 1: Clone Repository

```bash
# Clone the repository
git clone https://github.com/LastEld/Ckamal.git
cd Ckamal

# Or use SSH (recommended for development)
git clone git@github.com:LastEld/Ckamal.git
cd Ckamal
```

### Step 2: Install Dependencies

```bash
# Install production dependencies
npm ci --production

# Or for development (includes devDependencies)
npm install
```

### Step 3: Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit the environment file
nano .env  # or vim, code, etc.
```

### Step 4: Database Initialization

```bash
# Create data directory
mkdir -p data cache logs

# Initialize database (schema will be created automatically on first run)
# Or manually initialize:
sqlite3 data/cognimesh.db < src/db/schema.sql

# Run migrations
node -e "
import { ConnectionPool } from './src/db/connection/index.js';
import { MigrationRunner } from './src/db/migrations/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new ConnectionPool({
  databasePath: './data/cognimesh.db'
});
await pool.initialize();

const runner = new MigrationRunner(pool, {
  migrationsPath: path.join(__dirname, 'src', 'db', 'migrations')
});

await runner.runMigrations();
await pool.close();
console.log('Database initialized successfully');
"
```

### Step 5: First Run

```bash
# Development mode
npm start

# Or boot mode for fresh installation
npm run boot

# Production mode
NODE_ENV=production npm start
```

---

## 3. Configuration

### Environment Variables (.env)

Create a `.env` file in the project root with the following variables:

```bash
# ============================================================
# Server Configuration
# ============================================================
NODE_ENV=production                    # development | production | test
COGNIMESH_PORT=3000                    # HTTP server port
COGNIMESH_HOST=0.0.0.0                 # Bind address (0.0.0.0 for all interfaces)
COGNIMESH_NAME=cognimesh-server        # Server instance name

# ============================================================
# Paths
# ============================================================
COGNIMESH_ROOT=/opt/cognimesh          # Project root directory
COGNIMESH_DATA_DIR=/opt/cognimesh/data # Data directory
COGNIMESH_CACHE_DIR=/opt/cognimesh/cache # Cache directory
COGNIMESH_LOGS_DIR=/opt/cognimesh/logs # Logs directory

# ============================================================
# Database Configuration
# ============================================================
DATABASE_PATH=/opt/cognimesh/data/cognimesh.db
DB_MAX_CONNECTIONS=10                  # Max database connections
DB_BUSY_TIMEOUT_MS=5000                # Busy timeout in milliseconds
DB_MAX_RETRIES=5                       # Max retry attempts
DB_RETRY_DELAY_MS=200                  # Delay between retries

# ============================================================
# GitHub Configuration (Required for updates and integrations)
# ============================================================
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx  # GitHub Personal Access Token
GITHUB_REPO=LastEld/Ckamal             # Repository for auto-updates
AUTO_UPDATE=true                       # Enable automatic updates
CHECK_INTERVAL=1h                      # Update check interval

# ============================================================
# Claude Configuration (subscription-based, no API key needed)
# ============================================================
# Claude is accessed via the Claude CLI/Desktop app subscription.
# No ANTHROPIC_API_KEY required — the platform uses CLI subprocess spawning.
CLAUDE_SESSION_TOKEN=                  # Optional: Session token for Claude Desktop
CLAUDE_DEFAULT_MODEL=claude-sonnet-4-6
CLAUDE_MAX_TOKENS=4096                 # Default max tokens
CLAUDE_TEMPERATURE=0.7                 # Default temperature
CLAUDE_STREAMING_ENABLED=true          # Enable streaming responses
CLAUDE_EXTENDED_THINKING_ENABLED=false # Enable extended thinking mode

# ============================================================
# Kimi Configuration (subscription-based, no API key needed)
# ============================================================
# Kimi is accessed via the Kimi CLI app subscription.
# No KIMI_API_KEY required — the platform uses CLI subprocess spawning.
KIMI_API_URL=https://api.moonshot.cn/v1

# ============================================================
# OpenAI/Codex Configuration (subscription-based, no API key needed)
# ============================================================
# Codex is accessed via the Codex CLI app subscription.
# No OPENAI_API_KEY required — the platform uses CLI subprocess spawning.
OPENAI_API_URL=https://api.openai.com/v1

# ============================================================
# BIOS Configuration
# ============================================================
BIOS_MODE=OPERATIONAL                  # BOOT | DIAGNOSE | OPERATIONAL | MAINTENANCE | SAFE_MODE
LOG_LEVEL=info                         # debug | info | warn | error
MAX_AGENTS=50                          # Maximum concurrent agents
REGRESSION_THRESHOLD=5.0               # Performance regression threshold (%)

# ============================================================
# WebSocket Configuration
# ============================================================
WS_ENABLED=true                        # Enable WebSocket server
WS_PORT=8080                           # WebSocket port
WS_HOST=0.0.0.0                        # WebSocket bind address
WS_PATH=/ws                            # WebSocket endpoint path
WS_HEARTBEAT_INTERVAL_MS=30000         # Heartbeat interval
WS_MAX_PAYLOAD_MB=50                   # Max message size (MB)
WS_REQUIRE_AUTH=false                  # Require authentication
WS_CORS_ORIGIN=*                       # CORS origin

# ============================================================
# Dashboard Configuration
# ============================================================
DASHBOARD_ENABLED=true                 # Enable web dashboard
DASHBOARD_PORT=3001                    # Dashboard port
DASHBOARD_HOST=0.0.0.0                 # Dashboard bind address
DASHBOARD_AUTH_ENABLED=true            # Enable dashboard auth
JWT_SECRET=your-secret-key-change-this # JWT secret (change in production!)

# ============================================================
# Security Configuration
# ============================================================
SECURITY_MODE=enforced                 # enforced | permissive
REQUIRE_AUTH=false                     # Require authentication globally
API_KEY_HEADER=X-API-Key               # API key header name
RATE_LIMIT_WINDOW_MS=900000            # Rate limit window (15 min)
RATE_LIMIT_MAX=100                     # Max requests per window
SECURITY_PEPPER=your-secret-pepper     # Secret pepper for password hashing

# ============================================================
# Cache Configuration
# ============================================================
CACHE_ENABLED=true                     # Enable caching
CACHE_MAX_SIZE=1000                    # Max cache entries
CACHE_TTL_MS=60000                     # Default TTL (1 min)
CACHE_CHECK_PERIOD_MS=120              # Cleanup check period

# ============================================================
# Feature Flags
# ============================================================
FEATURE_TASKS=true                     # Enable task management
FEATURE_ROADMAPS=true                  # Enable roadmap management
FEATURE_CLAUDE=true                    # Enable Claude integration
FEATURE_WEBSOCKET=true                 # Enable WebSocket server
FEATURE_BATCH=true                     # Enable batch processing
FEATURE_STREAMING=true                 # Enable streaming
FEATURE_DASHBOARD=true                 # Enable dashboard
```

### Configuration File

You can also use a JSON configuration file at `config/cognimesh.json`:

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "env": "production"
  },
  "database": {
    "path": "/opt/cognimesh/data/cognimesh.db",
    "maxConnections": 10
  },
  "features": {
    "taskManagement": true,
    "roadmapManagement": true,
    "claudeIntegration": true
  },
  "security": {
    "mode": "enforced",
    "requireAuth": true,
    "rateLimitMax": 100
  }
}
```

Environment-specific configuration files:
- `config/cognimesh.production.json` - Production overrides
- `config/cognimesh.development.json` - Development overrides

### Feature Flags

| Flag | Description | Default |
|------|-------------|---------|
| `FEATURE_TASKS` | Task management system | `true` |
| `FEATURE_ROADMAPS` | Educational roadmaps | `true` |
| `FEATURE_CLAUDE` | Claude AI integration | `true` |
| `FEATURE_WEBSOCKET` | Real-time WebSocket | `true` |
| `FEATURE_BATCH` | Batch processing | `true` |
| `FEATURE_STREAMING` | Response streaming | `true` |
| `FEATURE_DASHBOARD` | Web dashboard | `true` |

---

## 4. Deployment Options

### Local Development

```bash
# Clone and setup
git clone https://github.com/LastEld/Ckamal.git
cd Ckamal
npm install
cp .env.example .env
# Edit .env with your settings

# Run in development mode
npm run start

# Or with specific BIOS mode
npm run diagnose    # Run diagnostics
npm run maintenance # Maintenance mode
npm run safe-mode   # Minimal functionality
```

### Production Server Deployment

#### Using Systemd (Linux)

Create `/etc/systemd/system/cognimesh.service`:

```ini
[Unit]
Description=CogniMesh MCP Server
After=network.target

[Service]
Type=simple
User=cognimesh
Group=cognimesh
WorkingDirectory=/opt/cognimesh
Environment=NODE_ENV=production
Environment=COGNIMESH_PORT=3000
EnvironmentFile=/opt/cognimesh/.env
ExecStart=/usr/bin/node src/bios/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cognimesh

[Install]
WantedBy=multi-user.target
```

Enable and start service:

```bash
# Create user
sudo useradd -r -s /bin/false cognimesh

# Set permissions
sudo chown -R cognimesh:cognimesh /opt/cognimesh

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable cognimesh
sudo systemctl start cognimesh

# Check status
sudo systemctl status cognimesh
sudo journalctl -u cognimesh -f
```

#### Using PM2 (Cross-Platform)

Create `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: 'cognimesh',
    script: './src/bios/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      COGNIMESH_PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    kill_timeout: 5000,
    listen_timeout: 10000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

Deploy with PM2:

```bash
# Start application
pm2 start ecosystem.config.cjs

# Save PM2 config
pm2 save

# Setup startup script
pm2 startup systemd

# Monitor
pm2 monit
pm2 logs cognimesh

# Restart
pm2 restart cognimesh
```

### Docker Deployment

#### Dockerfile

Create `Dockerfile`:

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:20-alpine AS production

# Install SQLite
RUN apk add --no-cache sqlite

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S cognimesh -u 1001

WORKDIR /app

# Copy dependencies
COPY --from=builder --chown=cognimesh:nodejs /app/node_modules ./node_modules

# Copy application
COPY --chown=cognimesh:nodejs . .

# Create directories
RUN mkdir -p data cache logs && chown -R cognimesh:nodejs data cache logs

# Switch to non-root user
USER cognimesh

# Expose ports
EXPOSE 3000 8080 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

CMD ["node", "src/bios/index.js"]
```

Build and run:

```bash
# Build image
docker build -t cognimesh:v5.0 .

# Run container
docker run -d \
  --name cognimesh \
  -p 3000:3000 \
  -p 8080:8080 \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/.env:/app/.env:ro \
  --restart unless-stopped \
  cognimesh:v5.0
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  cognimesh:
    build: .
    container_name: cognimesh
    restart: unless-stopped
    ports:
      - "3000:3000"    # HTTP API
      - "8080:8080"    # WebSocket
      - "3001:3001"    # Dashboard
    volumes:
      - ./data:/app/data
      - ./cache:/app/cache
      - ./logs:/app/logs
      - ./.env:/app/.env:ro
    environment:
      - NODE_ENV=production
    networks:
      - cognimesh-network
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: Prometheus for metrics
  prometheus:
    image: prom/prometheus:latest
    container_name: cognimesh-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    networks:
      - cognimesh-network
    profiles:
      - monitoring

  # Optional: Grafana for visualization
  grafana:
    image: grafana/grafana:latest
    container_name: cognimesh-grafana
    restart: unless-stopped
    ports:
      - "3002:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./config/grafana:/etc/grafana/provisioning:ro
    networks:
      - cognimesh-network
    profiles:
      - monitoring

networks:
  cognimesh-network:
    driver: bridge

volumes:
  prometheus-data:
  grafana-data:
```

Deploy:

```bash
# Start services
docker-compose up -d

# With monitoring
docker-compose --profile monitoring up -d

# View logs
docker-compose logs -f cognimesh

# Stop services
docker-compose down
```

### Kubernetes (Basic)

Create `k8s/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: cognimesh
  labels:
    name: cognimesh
```

Create `k8s/configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cognimesh-config
  namespace: cognimesh
data:
  NODE_ENV: "production"
  COGNIMESH_PORT: "3000"
  WS_ENABLED: "true"
  WS_PORT: "8080"
  DASHBOARD_ENABLED: "true"
  DASHBOARD_PORT: "3001"
```

Create `k8s/secret.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cognimesh-secrets
  namespace: cognimesh
type: Opaque
stringData:
  GITHUB_TOKEN: "your-github-token"
  JWT_SECRET: "your-jwt-secret"
```

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cognimesh
  namespace: cognimesh
  labels:
    app: cognimesh
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cognimesh
  template:
    metadata:
      labels:
        app: cognimesh
    spec:
      containers:
      - name: cognimesh
        image: cognimesh:v5.0
        ports:
        - containerPort: 3000
          name: http
        - containerPort: 8080
          name: websocket
        - containerPort: 3001
          name: dashboard
        envFrom:
        - configMapRef:
            name: cognimesh-config
        - secretRef:
            name: cognimesh-secrets
        volumeMounts:
        - name: data
          mountPath: /app/data
        - name: cache
          mountPath: /app/cache
        - name: logs
          mountPath: /app/logs
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: cognimesh-data
      - name: cache
        emptyDir: {}
      - name: logs
        emptyDir: {}
```

Create `k8s/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: cognimesh
  namespace: cognimesh
spec:
  selector:
    app: cognimesh
  ports:
  - name: http
    port: 3000
    targetPort: 3000
  - name: websocket
    port: 8080
    targetPort: 8080
  - name: dashboard
    port: 3001
    targetPort: 3001
  type: ClusterIP
```

Create `k8s/pvc.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cognimesh-data
  namespace: cognimesh
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

Deploy to Kubernetes:

```bash
# Apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Check status
kubectl get pods -n cognimesh
kubectl logs -n cognimesh -l app=cognimesh
```

---

## 5. Database Setup

### SQLite Configuration

CogniMesh uses SQLite with WAL mode for optimal performance:

```bash
# Database file location (configured in .env)
DATABASE_PATH=/opt/cognimesh/data/cognimesh.db

# Manual optimization
sqlite3 data/cognimesh.db "PRAGMA journal_mode=WAL;"
sqlite3 data/cognimesh.db "PRAGMA synchronous=NORMAL;"
sqlite3 data/cognimesh.db "PRAGMA cache_size=-64000;"  # 64MB cache
sqlite3 data/cognimesh.db "PRAGMA temp_store=memory;"
```

### Migration Execution

Migrations run automatically on startup. Manual execution:

```bash
# Run pending migrations
node -e "
import('./src/db/migrations/index.js').then(({ MigrationRunner }) => {
  return import('./src/db/connection/index.js').then(({ ConnectionPool }) => {
    const pool = new ConnectionPool({ databasePath: './data/cognimesh.db' });
    return pool.initialize().then(() => {
      const runner = new MigrationRunner(pool, { migrationsPath: './src/db/migrations' });
      return runner.runMigrations();
    });
  });
}).then(console.log).catch(console.error);
"
```

### Backup Strategy

#### Automated Daily Backup

Create `scripts/backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/opt/cognimesh/backups"
DB_PATH="/opt/cognimesh/data/cognimesh.db"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# SQLite backup (hot backup with WAL mode)
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/cognimesh_$DATE.db'"

# Compress backup
gzip "$BACKUP_DIR/cognimesh_$DATE.db"

# Backup configuration
tar czf "$BACKUP_DIR/config_$DATE.tar.gz" -C /opt/cognimesh .env config/

# Cleanup old backups
find "$BACKUP_DIR" -name "cognimesh_*.db.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "config_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: cognimesh_$DATE.db.gz"
```

Add to crontab:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /opt/cognimesh/scripts/backup.sh >> /opt/cognimesh/logs/backup.log 2>&1
```

### Database Optimization

```bash
# Run VACUUM to reclaim space
sqlite3 data/cognimesh.db "VACUUM;"

# Analyze for query optimization
sqlite3 data/cognimesh.db "ANALYZE;"

# Check database integrity
sqlite3 data/cognimesh.db "PRAGMA integrity_check;"
```

---

## 6. Client Configuration

### Claude Configuration (Subscription-Based)

CogniMesh accesses Claude through the Claude CLI/Desktop application subscription. No API key is needed.

1. Install the [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) or Claude Desktop app
2. Sign in to your Claude subscription
3. Optionally add a session token for Desktop integration:

```bash
CLAUDE_SESSION_TOKEN=your-session-token
```

### Kimi Configuration (Subscription-Based)

CogniMesh accesses Kimi through the Kimi CLI application subscription. No API key is needed.

1. Install the Kimi CLI from [Moonshot Platform](https://platform.moonshot.cn/)
2. Sign in to your Kimi subscription

### Codex Configuration (Subscription-Based)

CogniMesh accesses Codex through the Codex CLI application subscription. No API key is needed.

1. Install the [Codex CLI](https://github.com/openai/codex): `npm install -g @openai/codex`
2. Sign in to your OpenAI subscription

### Testing Connections

```bash
# Test all AI client connections
node -e "
import { loadConfig } from './src/config.js';

const config = await loadConfig();

console.log('Testing AI Client Connections...\n');

// Test Claude
if (config.clients.claude.enabled) {
  console.log('✓ Claude: Enabled');
  console.log('  Model:', config.clients.claude.defaultModel);
  console.log('  Streaming:', config.clients.claude.streamingEnabled);
} else {
  console.log('✗ Claude: Disabled (Claude CLI not found)');
}

// Test Kimi
if (config.clients.kimi.enabled) {
  console.log('✓ Kimi: Enabled');
} else {
  console.log('✗ Kimi: Disabled (Kimi CLI not found)');
}

// Test Codex
if (config.clients.codex.enabled) {
  console.log('✓ Codex: Enabled');
} else {
  console.log('✗ Codex: Disabled (Codex CLI not found)');
}
"
```

---

## 7. Security Hardening

### Firewall Rules

#### UFW (Ubuntu)

```bash
# Install UFW
sudo apt-get install ufw

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (adjust port if needed)
sudo ufw allow 22/tcp

# Allow CogniMesh ports
sudo ufw allow 3000/tcp   # HTTP API
sudo ufw allow 8080/tcp   # WebSocket
sudo ufw allow 3001/tcp   # Dashboard

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```

#### iptables

```bash
# Flush existing rules
sudo iptables -F

# Default policies
sudo iptables -P INPUT DROP
sudo iptables -P FORWARD DROP
sudo iptables -P OUTPUT ACCEPT

# Allow loopback
sudo iptables -A INPUT -i lo -j ACCEPT

# Allow established connections
sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow SSH
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow CogniMesh
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT

# Save rules
sudo iptables-save > /etc/iptables/rules.v4
```

### HTTPS Setup

#### Using Nginx as Reverse Proxy

Install Nginx:

```bash
sudo apt-get install nginx
```

Create `/etc/nginx/sites-available/cognimesh`:

```nginx
upstream cognimesh_api {
    server 127.0.0.1:3000;
}

upstream cognimesh_ws {
    server 127.0.0.1:8080;
}

upstream cognimesh_dashboard {
    server 127.0.0.1:3001;
}

# HTTP - Redirect to HTTPS
server {
    listen 80;
    server_name api.cognimesh.example.com dashboard.cognimesh.example.com;
    return 301 https://$server_name$request_uri;
}

# API Server
server {
    listen 443 ssl http2;
    server_name api.cognimesh.example.com;

    ssl_certificate /etc/letsencrypt/live/cognimesh.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cognimesh.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://cognimesh_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# WebSocket Server
server {
    listen 443 ssl http2;
    server_name ws.cognimesh.example.com;

    ssl_certificate /etc/letsencrypt/live/cognimesh.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cognimesh.example.com/privkey.pem;

    location / {
        proxy_pass http://cognimesh_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}

# Dashboard
server {
    listen 443 ssl http2;
    server_name dashboard.cognimesh.example.com;

    ssl_certificate /etc/letsencrypt/live/cognimesh.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cognimesh.example.com/privkey.pem;

    location / {
        proxy_pass http://cognimesh_dashboard;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/cognimesh /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Let's Encrypt SSL Certificate

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d api.cognimesh.example.com -d ws.cognimesh.example.com -d dashboard.cognimesh.example.com

# Auto-renewal test
sudo certbot renew --dry-run
```

### Secret Management

#### Using Environment Variables (Basic)

```bash
# Set restrictive permissions on .env
chmod 600 .env
chown cognimesh:cognimesh .env
```

#### Using Docker Secrets (Docker Swarm)

```bash
# Create secrets
echo "your-github-token" | docker secret create github_token -
echo "your-anthropic-key" | docker secret create anthropic_key -

# Use in docker-compose.yml
version: '3.8'
services:
  cognimesh:
    secrets:
      - github_token
      - anthropic_key
    environment:
      - GITHUB_TOKEN_FILE=/run/secrets/github_token
      
secrets:
  github_token:
    external: true
  anthropic_key:
    external: true
```

### Rate Limiting

Rate limiting is configured via environment variables:

```bash
# In .env
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX=100             # 100 requests per window
```

For additional protection, configure nginx:

```nginx
# Add to nginx server block
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=ws:10m rate=1r/s;

server {
    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://cognimesh_api;
    }
}
```

### Audit Logging

Audit logs are automatically stored in the database. Configure retention:

```bash
# In .env - Set audit log retention (days)
AUDIT_LOG_RETENTION_DAYS=90

# Manual cleanup
sqlite3 data/cognimesh.db "
DELETE FROM audit_logs 
WHERE timestamp < datetime('now', '-90 days');
VACUUM;
"
```

---

## 8. Monitoring

### Health Checks

CogniMesh provides a health check endpoint:

```bash
# Check server health
curl http://localhost:3000/health

# Expected response:
{
  "healthy": true,
  "status": "running",
  "version": "5.0.0",
  "uptime": 3600000,
  "timestamp": "2026-03-23T10:00:00.000Z",
  "checks": {
    "bios": true,
    "database": true,
    "repositories": true,
    "tools": true,
    "http": true,
    "websocket": true
  },
  "components": {
    "bios": {
      "state": "OPERATIONAL",
      "uptime": 3600000,
      "components": 8
    },
    "database": {
      "total": 2,
      "inUse": 0,
      "available": 2
    },
    "tools": {
      "registered": 60
    },
    "websocket": {
      "clients": 5,
      "rooms": 3
    }
  }
}
```

### Metrics (Prometheus)

Create `config/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'cognimesh'
    static_configs:
      - targets: ['cognimesh:3000']
    metrics_path: /metrics
```

Enable metrics endpoint in CogniMesh:

```bash
# In .env
METRICS_ENABLED=true
METRICS_PORT=9090
```

### Logging (Pino)

CogniMesh uses Pino for structured logging:

```bash
# In .env
LOG_LEVEL=info                    # debug | info | warn | error
LOG_FORMAT=json                   # json | pretty
LOG_DESTINATION=stdout            # stdout | file | both
LOG_FILE=/opt/cognimesh/logs/app.log
```

View logs:

```bash
# Using PM2
pm2 logs cognimesh

# Using journald (systemd)
sudo journalctl -u cognimesh -f

# Using Docker
docker logs -f cognimesh

# View structured logs
node -e "
const fs = require('fs');
const logs = fs.readFileSync('logs/app.log', 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse);
console.table(logs.slice(-10));
"
```

### Alerts

Configure alert rules in `config/alerts.json`:

```json
{
  "rules": [
    {
      "name": "high_cpu",
      "condition": "cpu_percent > 80",
      "duration": "5m",
      "severity": "warning",
      "channels": ["email", "slack"]
    },
    {
      "name": "database_connection_fail",
      "condition": "db_connections_available == 0",
      "duration": "1m",
      "severity": "critical",
      "channels": ["email", "slack", "pagerduty"]
    },
    {
      "name": "high_memory",
      "condition": "memory_percent > 90",
      "duration": "3m",
      "severity": "warning",
      "channels": ["slack"]
    }
  ],
  "channels": {
    "slack": {
      "webhook_url": "https://hooks.slack.com/services/..."
    },
    "email": {
      "smtp_host": "smtp.example.com",
      "smtp_port": 587,
      "from": "alerts@cognimesh.example.com",
      "to": ["admin@example.com"]
    }
  }
}
```

---

## 9. Backup & Recovery

### Database Backup

#### Automated Backup Script

Create `scripts/backup-database.sh`:

```bash
#!/bin/bash

set -e

BACKUP_DIR="/opt/cognimesh/backups"
DB_PATH="/opt/cognimesh/data/cognimesh.db"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Online backup (works with active connections)
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/cognimesh_$DATE.db'"

# Verify backup integrity
if sqlite3 "$BACKUP_DIR/cognimesh_$DATE.db" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "Backup verified successfully"
else
    echo "Backup integrity check failed!"
    rm "$BACKUP_DIR/cognimesh_$DATE.db"
    exit 1
fi

# Compress
gzip "$BACKUP_DIR/cognimesh_$DATE.db"

# Cleanup old backups
find "$BACKUP_DIR" -name "cognimesh_*.db.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: cognimesh_$DATE.db.gz"
```

#### Offsite Backup (S3)

```bash
# Install AWS CLI
pip install awscli

# Configure credentials
aws configure

# Backup script with S3 sync
cat > scripts/backup-s3.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/cognimesh/backups"
S3_BUCKET="s3://cognimesh-backups"

# Run local backup
/opt/cognimesh/scripts/backup-database.sh

# Sync to S3
aws s3 sync "$BACKUP_DIR" "$S3_BUCKET" --delete

# Cleanup S3 backups older than 90 days
aws s3 ls "$S3_BUCKET" | awk '{print $4}' | while read file; do
    aws s3 rm "$S3_BUCKET/$file"
done
EOF

chmod +x scripts/backup-s3.sh
```

### Configuration Backup

```bash
# Backup configuration
tar czf backups/config_$(date +%Y%m%d).tar.gz \
  .env \
  config/ \
  package.json \
  ecosystem.config.cjs
```

### Disaster Recovery

#### Recovery Procedure

```bash
#!/bin/bash
# recovery.sh - Disaster recovery script

BACKUP_FILE="$1"
RECOVERY_DIR="/opt/cognimesh/recovery"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    exit 1
fi

# Stop services
sudo systemctl stop cognimesh

# Create recovery directory
mkdir -p "$RECOVERY_DIR"

# Extract backup
cp "$BACKUP_FILE" "$RECOVERY_DIR/"
gunzip "$RECOVERY_DIR/$(basename $BACKUP_FILE)"

# Verify backup
if ! sqlite3 "$RECOVERY_DIR/$(basename $BACKUP_FILE .gz)" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "Backup integrity check failed!"
    exit 1
fi

# Backup current database (just in case)
cp /opt/cognimesh/data/cognimesh.db /opt/cognimesh/data/cognimesh.db.bak.$(date +%Y%m%d_%H%M%S)

# Restore database
cp "$RECOVERY_DIR/$(basename $BACKUP_FILE .gz)" /opt/cognimesh/data/cognimesh.db

# Fix permissions
chown cognimesh:cognimesh /opt/cognimesh/data/cognimesh.db
chmod 644 /opt/cognimesh/data/cognimesh.db

# Start services
sudo systemctl start cognimesh

echo "Recovery completed. Check service status with: sudo systemctl status cognimesh"
```

#### Point-in-Time Recovery (with WAL)

```bash
# If WAL files exist, can recover to specific point
# Copy WAL files from backup
cp backups/wal/*.wal /opt/cognimesh/data/

# Apply WAL
cd /opt/cognimesh/data
sqlite3 cognimesh.db ".recover" > cognimesh_recovered.db
```

---

## 10. Troubleshooting

### Common Issues

#### Issue: "Cannot find module 'sqlite3'"

```bash
# Rebuild native modules
npm rebuild sqlite3

# Or install build tools and reinstall
sudo apt-get install build-essential python3
rm -rf node_modules
npm install
```

#### Issue: "Port already in use"

```bash
# Find process using port
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>

# Or change port in .env
COGNIMESH_PORT=3001
```

#### Issue: "Database is locked"

```bash
# Check for hanging connections
lsof | grep cognimesh.db

# Restart application
sudo systemctl restart cognimesh

# If persistent, check WAL mode
sqlite3 data/cognimesh.db "PRAGMA journal_mode;"

# Should return "wal"
```

#### Issue: "Connection pool exhausted"

```bash
# Increase max connections in .env
DB_MAX_CONNECTIONS=20

# Check current connections
sqlite3 data/cognimesh.db ".connections"

# Restart to apply changes
sudo systemctl restart cognimesh
```

#### Issue: "BIOS boot sequence failed"

```bash
# Run diagnostics
npm run diagnose

# Check logs
sudo journalctl -u cognimesh -n 100

# Boot in safe mode
BIOS_MODE=SAFE_MODE npm start
```

### Debug Mode

Enable debug logging:

```bash
# In .env
LOG_LEVEL=debug
DEBUG=cognimesh:*

# Or run with debug flag
DEBUG=cognimesh:* npm start
```

### Logs Location

| Component | Log Location |
|-----------|-------------|
| Application | `/opt/cognimesh/logs/app.log` |
| Systemd | `journalctl -u cognimesh` |
| PM2 | `pm2 logs cognimesh` |
| Docker | `docker logs cognimesh` |
| Nginx | `/var/log/nginx/cognimesh-*.log` |
| Database | `/opt/cognimesh/data/cognimesh.db-journal` |

### Getting Help

1. Check logs: `tail -f /opt/cognimesh/logs/app.log`
2. Run diagnostics: `npm run diagnose`
3. Check health: `curl http://localhost:3000/health`
4. Review GitHub Issues: https://github.com/LastEld/Ckamal/issues

---

## Appendix

### Environment Variable Quick Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Runtime environment |
| `COGNIMESH_PORT` | No | `3000` | HTTP server port |
| `DATABASE_PATH` | No | `./data/cognimesh.db` | SQLite database path |
| `GITHUB_TOKEN` | Yes* | - | GitHub API token |
| `CLAUDE_SESSION_TOKEN` | No | - | Claude Desktop session token |
| `JWT_SECRET` | Yes* | - | JWT signing secret |

*Required in production mode

### Ports Reference

| Port | Service | Protocol |
|------|---------|----------|
| 3000 | HTTP API | HTTP/WebSocket upgrade |
| 8080 | WebSocket | WebSocket |
| 3001 | Dashboard | HTTP |

### Directory Structure

```
/opt/cognimesh/
├── data/              # Database and persistent data
├── cache/             # Cache files
├── logs/              # Log files
├── config/            # Configuration files
├── backups/           # Backup storage
├── src/               # Source code
├── .env               # Environment variables
└── package.json       # Dependencies
```

---

*Document Version: 5.0.0*  
*Last Updated: 2026-03-23*
