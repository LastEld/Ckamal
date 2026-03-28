# CogniMesh Troubleshooting Guide

> **Quick fixes for common issues and detailed diagnostic procedures.**

<div align="center">

[![Quick Diagnose](https://img.shields.io/badge/🔍_Quick_Diagnose-3498db?style=for-the-badge)](#quick-diagnose)
[![Common Errors](https://img.shields.io/badge/⚠️_Common_Errors-e74c3c?style=for-the-badge)](#common-errors-and-solutions)
[![FAQ](https://img.shields.io/badge/❓_FAQ-2ecc71?style=for-the-badge)](#faq)

</div>

---

## Table of Contents

- [Quick Diagnose](#quick-diagnose)
- [Common Errors and Solutions](#common-errors-and-solutions)
  - [Installation Issues](#-installation-issues)
  - [Startup Issues](#-startup-issues)
  - [Runtime Issues](#-runtime-issues)
  - [AI Client Issues](#-ai-client-issues)
- [Diagnostic Commands](#diagnostic-commands)
  - [System Health](#system-health)
  - [BIOS Diagnostics](#bios-diagnostics)
  - [Log Analysis](#log-analysis)
  - [Database Diagnostics](#database-diagnostics)
  - [Network Diagnostics](#network-diagnostics)
- [FAQ](#faq)
  - [General Questions](#general-questions)
  - [Installation Questions](#installation-questions)
  - [Runtime Questions](#runtime-questions)
  - [AI Integration Questions](#ai-integration-questions)
  - [Performance Questions](#performance-questions)
- [Debug Mode](#debug-mode)
- [Log Locations](#log-locations)
- [Support Channels](#support-channels)
- [Reporting Bugs](#reporting-bugs)

---

## Quick Diagnose

Run these commands in order to quickly identify issues:

```bash
# 1. Check if the system is healthy
curl http://localhost:3000/health

# 2. Run BIOS diagnostics
npm run bios:diagnose

# 3. Verify all components
npm run verify:release

# 4. Check logs
npm run logs
```

---

## Common Errors and Solutions

### 🔴 Installation Issues

#### Error: `Cannot find module 'sqlite3'`

**Symptoms:**
```
Error: Cannot find module 'sqlite3'
Require stack: ...
```

**Solutions:**

```bash
# Solution 1: Rebuild native modules
npm rebuild sqlite3

# Solution 2: Install build tools and reinstall (Ubuntu/Debian)
sudo apt-get install build-essential python3
rm -rf node_modules
npm install

# Solution 3: Windows - install Visual Studio Build Tools
npm install --global windows-build-tools
rm -rf node_modules
npm install
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

#### Error: `EACCES: permission denied` on npm install

**Solutions:**

```bash
# Linux/macOS - Change npm directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
source ~/.profile

# Or use npx (recommended)
npx <package-name>

# Windows - Run PowerShell as Administrator
# Then retry: npm install
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

### 🟡 Startup Issues

#### Error: `Port 3000 is already in use`

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**

```bash
# Find process using the port (Linux/macOS)
sudo lsof -i :3000
# or
sudo netstat -tulpn | grep 3000

# Windows
netstat -ano | findstr :3000

# Kill the process (replace <PID> with the actual process ID)
# Linux/macOS
sudo kill -9 <PID>

# Windows
taskkill /PID <PID> /F

# Or change port in .env
echo "COGNIMESH_PORT=3001" >> .env
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

#### Error: `BIOS boot sequence failed`

**Symptoms:**
```
[BIOS] Boot sequence failed
[BIOS] Component initialization error
```

**Solutions:**

```bash
# Solution 1: Run diagnostics
npm run bios:diagnose

# Solution 2: Check detailed logs
cat logs/app.log | grep -i error
# or on Windows
findstr /i "error" logs\app.log

# Solution 3: Boot in safe mode
BIOS_MODE=SAFE_MODE npm start
# or Windows
set BIOS_MODE=SAFE_MODE && npm start

# Solution 4: Clear cache and restart
rm -rf cache/*
npm start
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

#### Error: `Database is locked`

**Symptoms:**
```
SQLITE_BUSY: database is locked
```

**Solutions:**

```bash
# Check for hanging connections (Linux/macOS)
lsof | grep cognimesh.db

# Restart the application
# systemd
sudo systemctl restart cognimesh

# PM2
pm2 restart cognimesh

# Docker
docker restart cognimesh

# Manual
pkill -f cognimesh
npm start

# Verify WAL mode is enabled
sqlite3 data/cognimesh.db "PRAGMA journal_mode;"
# Should return: wal
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

### 🟠 Runtime Issues

#### Error: `Connection pool exhausted`

**Symptoms:**
```
DatabaseError: Connection pool exhausted
```

**Solutions:**

```bash
# Increase max connections in .env
cat >> .env << EOF
DB_MAX_CONNECTIONS=20
DB_BUSY_TIMEOUT_MS=10000
EOF

# Restart to apply changes
npm start

# Monitor connections
sqlite3 data/cognimesh.db "PRAGMA database_list;"
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

#### Error: `WebSocket connection failed`

**Symptoms:**
```
WebSocket connection to 'ws://localhost:8080' failed
```

**Solutions:**

```bash
# Check if WebSocket port is available
nc -zv localhost 8080
# or
telnet localhost 8080

# Check WebSocket configuration in .env
grep WS_ .env

# Restart WebSocket server
npm run server

# Check firewall rules (Linux)
sudo ufw status
# or
sudo iptables -L | grep 8080
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

#### Error: `Rate limit exceeded`

**Symptoms:**
```
HTTP 429 Too Many Requests
```

**Solutions:**

```bash
# Check current rate limit settings
grep RATE_LIMIT .env

# Temporarily increase limits for testing
echo "RATE_LIMIT_MAX=1000" >> .env

# Wait for window to reset (default: 15 minutes)
# Or restart to clear rate limit state
npm start

# For production, implement client-side rate limiting
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

### 🔵 AI Client Issues

#### Error: `Claude client not found`

**Symptoms:**
```
Error: Claude CLI not found or not authenticated
```

**Solutions:**

```bash
# 1. Install Claude CLI
# macOS
brew install claude

# Or download from: https://docs.anthropic.com/en/docs/claude-cli

# 2. Authenticate
claude login

# 3. Verify installation
claude --version

# 4. Check path in configuration
which claude
# Add to .env if needed:
echo "CLAUDE_CLI_PATH=$(which claude)" >> .env
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

#### Error: `Kimi client not found`

**Solutions:**

```bash
# 1. Install Kimi CLI
npm install -g kimi-cli

# 2. Authenticate
kimi login

# 3. Verify
kimi --version
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

#### Error: `Codex client not found`

**Solutions:**

```bash
# 1. Install Codex CLI
npm install -g @openai/codex

# 2. Authenticate
codex login

# 3. Verify
codex --version
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

## Diagnostic Commands

### System Health

```bash
# Complete health check
curl http://localhost:3000/health | jq

# Check specific components
curl http://localhost:3000/health | jq '.checks'

# Check database health
curl http://localhost:3000/health | jq '.components.database'
```

### BIOS Diagnostics

```bash
# Run full diagnostic suite
npm run bios:diagnose

# Check specific mode
npm run bios:diagnose -- --mode=connectivity

# Output JSON for parsing
npm run bios:diagnose -- --format=json
```

### Log Analysis

```bash
# View recent errors
tail -n 100 logs/app.log | grep ERROR

# Follow logs in real-time
tail -f logs/app.log

# Search for specific error
grep -i "database" logs/app.log

# Windows PowerShell
type logs\app.log | findstr /i "error"
Get-Content logs/app.log -Wait
```

### Database Diagnostics

```bash
# Check database integrity
sqlite3 data/cognimesh.db "PRAGMA integrity_check;"

# Check table sizes
sqlite3 data/cognimesh.db ".tables"
sqlite3 data/cognimesh.db "SELECT name, sql FROM sqlite_master WHERE type='table';"

# Check active connections (if available)
sqlite3 data/cognimesh.db "PRAGMA database_list;"

# VACUUM to reclaim space
sqlite3 data/cognimesh.db "VACUUM;"

# ANALYZE for query optimization
sqlite3 data/cognimesh.db "ANALYZE;"
```

### Network Diagnostics

```bash
# Check if ports are listening
ss -tlnp | grep -E '3000|8080|3001'
# or
netstat -tlnp | grep -E '3000|8080|3001'

# Test HTTP endpoint
curl -v http://localhost:3000/health

# Test WebSocket
websocat ws://localhost:8080/ws
# or with curl
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Host: localhost:8080" \
  -H "Origin: http://localhost:8080" \
  http://localhost:8080/ws
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

## FAQ

### General Questions

**Q: Do I need API keys for the AI models?**

No! CogniMesh uses your existing subscription clients (Claude Pro, ChatGPT Plus, Kimi subscription). No API keys or metered billing required.

**Q: What are the minimum system requirements?**

- Node.js 18+ (20+ recommended)
- 2 GB RAM (4 GB recommended)
- 1 GB disk space
- SQLite 3.35+

**Q: Can I run CogniMesh on Windows?**

Yes! Use WSL2 (recommended) or PowerShell. All commands work on Windows with minor syntax adjustments.

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

### Installation Questions

**Q: Installation is taking too long**

Try these steps:
```bash
# Use faster npm registry
npm config set registry https://registry.npmmirror.com

# Or use yarn
yarn install

# Or skip optional dependencies
npm install --no-optional
```

**Q: Can I use a different database?**

CogniMesh uses SQLite by default. Other databases are not officially supported, but you can modify `src/db/connection/index.js` for other adapters.

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

### Runtime Questions

**Q: How do I change the default port?**

Edit `.env`:
```bash
COGNIMESH_PORT=3001      # HTTP API
WS_PORT=8081             # WebSocket
DASHBOARD_PORT=3002      # Dashboard
```

**Q: How do I run in the background?**

```bash
# Using PM2
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save

# Using systemd
sudo systemctl enable cognimesh
sudo systemctl start cognimesh

# Using Docker
docker-compose up -d
```

**Q: How do I update CogniMesh?**

```bash
# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Run migrations
npm run db:migrate

# Restart
npm start
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

### AI Integration Questions

**Q: Why can't CogniMesh find my Claude/Codex/Kimi installation?**

1. Make sure the CLI is in your PATH:
```bash
which claude    # or where claude on Windows
which codex
which kimi
```

2. Add explicit paths to `.env`:
```bash
CLAUDE_CLI_PATH=/usr/local/bin/claude
CODEX_CLI_PATH=/usr/local/bin/codex
KIMI_CLI_PATH=/usr/local/bin/kimi
```

**Q: Can I use multiple AI providers at once?**

Yes! CogniMesh routes tasks to the best available model. You can have all three providers (Claude, Codex, Kimi) configured simultaneously.

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

### Performance Questions

**Q: CogniMesh is using too much memory**

```bash
# Check memory usage
ps aux | grep cognimesh

# Reduce max agents
# In .env:
MAX_AGENTS=10

# Enable more aggressive caching
CACHE_TTL_MS=30000
```

**Q: Database queries are slow**

```bash
# Check for missing indexes
sqlite3 data/cognimesh.db ".indexes"

# Analyze and optimize
sqlite3 data/cognimesh.db "ANALYZE;"

# Check for long-running queries
# (Enable query logging in .env)
LOG_LEVEL=debug
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

## Debug Mode

Enable detailed logging for troubleshooting:

```bash
# In .env
LOG_LEVEL=debug
DEBUG=cognimesh:*

# Or run with debug flag
DEBUG=cognimesh:* npm start

# For specific modules
DEBUG=cognimesh:db npm start
DEBUG=cognimesh:router npm start
DEBUG=cognimesh:websocket npm start
```

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

## Log Locations

| Component | Log Location |
|:----------|:-------------|
| Application | `./logs/app.log` |
| Systemd | `journalctl -u cognimesh` |
| PM2 | `pm2 logs cognimesh` |
| Docker | `docker logs cognimesh` |
| Nginx | `/var/log/nginx/cognimesh-*.log` |
| Database | `./data/cognimesh.db-journal` |

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

## Support Channels

### Self-Service

1. **Search this guide** - Use Ctrl+F to search for your error message
2. **Check the FAQ** - Common questions answered above
3. **Review logs** - Check `./logs/app.log` for details

### Community Support

| Channel | Best For |
|:--------|:---------|
| [GitHub Issues](https://github.com/LastEld/Ckamal/issues) | Bug reports, feature requests |
| [GitHub Discussions](https://github.com/LastEld/Ckamal/discussions) | General questions, architecture discussions |

### Enterprise Support

For priority support with SLAs, contact: support@cognimesh.io

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

## Reporting Bugs

When reporting bugs, please include:

1. **System information:**
```bash
# Run this and paste output
node --version
npm --version
uname -a
npm run bios:diagnose -- --format=json
```

2. **Error message:** Full error text or screenshot

3. **Steps to reproduce:** What you did before the error

4. **Expected behavior:** What should have happened

5. **Logs:** Relevant excerpts from `./logs/app.log`

**[⬆ Back to Top](#cognimesh-troubleshooting-guide)**

---

<div align="center">

**[Back to Documentation Hub](README.md)** · **[Security Guide](SECURITY.md)** · **[API Reference](../API_REFERENCE.md)**

<sub>Last updated: 2026-03-28</sub>

</div>
