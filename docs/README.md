# CogniMesh Documentation Hub

> **Welcome!** Get started with CogniMesh in 5 minutes or dive deep into specific topics.

<div align="center">

![CogniMesh](../docs/assets/brand/proposallogo2-transparent.png)

**Multi-model AI orchestration. Subscription-first.**

[![Quick Start](https://img.shields.io/badge/⚡_5_Minute_Setup-2ecc71?style=for-the-badge)](#5-minute-setup)
[![API Reference](https://img.shields.io/badge/📖_API_Reference-3498db?style=for-the-badge)](../API_REFERENCE.md)
[![Troubleshooting](https://img.shields.io/badge/🔧_Troubleshooting-e74c3c?style=for-the-badge)](TROUBLESHOOTING.md)

</div>

---

## 🚀 5-Minute Setup

Get CogniMesh running locally in under 5 minutes:

```bash
# 1. Clone the repository
git clone https://github.com/LastEld/Ckamal.git
cd Ckamal

# 2. Install dependencies
npm install

# 3. Verify everything works
npm run verify:release

# 4. Start the server
npm start
```

**That's it!** The server is now running at `http://localhost:3000`

<details>
<summary><b>Next steps after setup</b></summary>

1. **Access the Dashboard** → Open `http://localhost:3001`
2. **Create your first task** → Follow our [First Task Tutorial](tutorials/first-task.md)
3. **Connect AI clients** → No API keys needed — uses your existing subscriptions

</details>

---

## 📚 Documentation Index

### Getting Started

| Document | Description | Time |
|:---------|:------------|:-----|
| [First Task Tutorial](tutorials/first-task.md) | Step-by-step from install to first agent | 10 min |
| [Architecture Overview](../ARCHITECTURE.md) | System design and component overview | 15 min |
| [Deployment Guide](../DEPLOYMENT.md) | Production deployment options | 30 min |

### Reference

| Document | Description |
|:---------|:------------|
| [API Reference](../API_REFERENCE.md) | Complete HTTP, MCP, and WebSocket API docs |
| [Troubleshooting](TROUBLESHOOTING.md) | Common errors, diagnostic commands, FAQ |
| [Security Guide](SECURITY.md) | Security policy, hardening, vulnerability reporting |

### Integration Guides

| Document | Provider | Description |
|:---------|:---------|:------------|
| [Claude Desktop + Opus 4.6](CLAUDE_DESKTOP_OPUS46_INTEGRATION.md) | Anthropic | Desktop app WebSocket integration |
| [Claude Sonnet 4.6](integrations/CLAUDE_SONNET_46_INTEGRATION.md) | Anthropic | Sonnet IDE and CLI integration |
| [GPT-5.4 Codex](integrations/GPT54_CODEX_INTEGRATION.md) | OpenAI | Codex multi-surface integration |
| [Kimi 2.5](integrations/KIMI_25_INTEGRATION_REPORT.md) | Moonshot | Kimi setup and configuration |
| [Kimi VS Code](kimi-vscode-integration.md) | Moonshot | Kimi IDE extension guide |

### Operations

| Document | Description |
|:---------|:------------|
| [Deploy Checklist](release/DEPLOY_CHECKLIST.md) | Pre-deployment verification steps |
| [Monitoring](operations/MONITORING.md) | Operational monitoring and metrics |
| [Backup Automation](BACKUP_AUTOMATION.md) | Automated backup strategies |

---

## 🎯 Quick Navigation

### By Task

**I want to...**

- [Deploy to production](../DEPLOYMENT.md#4-deployment-options) → Docker, systemd, PM2, or Kubernetes
- [Troubleshoot an error](TROUBLESHOOTING.md#common-errors-and-solutions) → Common issues and fixes
- [Secure my installation](SECURITY.md#hardening-checklist) → Security hardening steps
- [Understand the API](../API_REFERENCE.md) → HTTP endpoints and MCP tools
- [Report a vulnerability](SECURITY.md#reporting-vulnerabilities) → Security disclosure process

### By Role

**Developer**
```bash
# Quick start
npm install
npm run verify:release
npm start

# Run diagnostics
npm run bios:diagnose
```

**DevOps**
```bash
# Docker deployment
docker-compose up -d

# Check health
curl http://localhost:3000/health

# View logs
docker logs -f cognimesh
```

**Security Engineer**
- [Security Policy](SECURITY.md#security-policy)
- [Hardening Checklist](SECURITY.md#hardening-checklist)
- [Supported Versions](SECURITY.md#supported-versions)

---

## 🆘 Getting Help

### Diagnostic Commands

```bash
# Run full diagnostics
npm run bios:diagnose

# Check system health
curl http://localhost:3000/health

# View logs
npm run logs

# Test all integrations
npm run verify:release
```

### Support Channels

| Channel | Best For | Response Time |
|:--------|:---------|:--------------|
| [GitHub Issues](https://github.com/LastEld/Ckamal/issues) | Bug reports, feature requests | 24-48 hours |
| [Troubleshooting Guide](TROUBLESHOOTING.md) | Self-service problem solving | Instant |
| [Documentation](.) | How-to questions | Instant |

---

## 🗺️ Learning Path

### Beginner Path

```
1. 5-Minute Setup (this page)
   ↓
2. [First Task Tutorial](tutorials/first-task.md)
   ↓
3. [Architecture Overview](../ARCHITECTURE.md)
   ↓
4. [API Basics](../API_REFERENCE.md#overview)
```

### Advanced Path

```
1. [Deployment Guide](../DEPLOYMENT.md)
   ↓
2. [Security Hardening](SECURITY.md)
   ↓
3. [Monitoring Setup](operations/MONITORING.md)
   ↓
4. [Integration Guides](integrations/)
```

---

## 📊 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CogniMesh v5.0                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Tasks     │  │  Roadmaps   │  │      AI Clients         │  │
│  │  Domain     │  │   Domain    │  │  Claude · Codex · Kimi  │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                │
│         └────────────────┼─────────────────────┘                │
│                          │                                      │
│  ┌───────────────────────┴───────────────────────┐              │
│  │              Router & BIOS                     │              │
│  │     (Multi-factor intelligent routing)         │              │
│  └───────────────────────┬───────────────────────┘              │
│                          │                                      │
│  ┌───────────────────────┴───────────────────────┐              │
│  │           HTTP API · WebSocket · MCP          │              │
│  └───────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔗 External Resources

- **GitHub Repository**: https://github.com/LastEld/Ckamal
- **Landing Page**: https://lasteld.github.io/Ckamal/
- **Model Catalog**: `src/clients/catalog.js`
- **Release Notes**: `CHANGELOG.md`

---

<div align="center">

**[Back to Main README](../README.md)** · **[Report Issue](https://github.com/LastEld/Ckamal/issues)** · **[View Source](https://github.com/LastEld/Ckamal)**

<sub>Last updated: 2026-03-28</sub>

</div>
