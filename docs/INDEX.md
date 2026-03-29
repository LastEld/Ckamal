# CogniMesh Documentation Index

**Complete documentation map and navigation guide for CogniMesh v5.0.**

---

## Quick Navigation

| 🚀 [Quick Start](#quick-start) | 📚 [Documentation](#documentation-by-category) | 🏗️ [Architecture](#architecture) | 🔧 [Features](#features) | 🛠️ [API](#api-reference) |
|---|---|---|---|---|

---

## Quick Start

**New to CogniMesh?** Start here:

1. **[Quick Start Guide](QUICK_START.md)** - Get up and running in 5 minutes
2. **[Implementation Report](IMPLEMENTATION_REPORT.md)** - What was built and delivered
3. **[Architecture Overview](../ARCHITECTURE.md)** - System design and components

### One-Line Setup
```bash
git clone https://github.com/LastEld/Ckamal.git && cd Ckamal && npm install && npm run setup && npm start
```

---

## Documentation by Category

### Getting Started

| Document | Description | Audience |
|----------|-------------|----------|
| [Quick Start](QUICK_START.md) | 5-minute setup and first workflow | New users |
| [Implementation Report](IMPLEMENTATION_REPORT.md) | Comprehensive feature overview | Evaluators |
| [Tutorials - First Task](tutorials/first-task.md) | Step-by-step first agent deployment | Beginners |
| [Windows Setup](WINDOWS_SETUP.md) | Windows-specific installation | Windows users |

### Architecture & Design

| Document | Description | Audience |
|----------|-------------|----------|
| [Architecture Guide](../ARCHITECTURE.md) | System design, layers, patterns | Developers |
| [Auth Flow](architecture/AUTH_FLOW.md) | Authentication flows and security | Security engineers |
| [Database Schema](architecture/DATABASE_SCHEMA.md) | SQLite schema and migrations | Backend developers |
| [Plugin Architecture](architecture/PLUGIN_ARCHITECTURE.md) | Plugin system design | Plugin authors |

### Features & Domains

| Document | Description | Audience |
|----------|-------------|----------|
| [Authentication](features/AUTHENTICATION.md) | Multi-actor auth system | Developers |
| [Billing & Cost Tracking](features/BILLING.md) | Budget management and cost attribution | Operators |
| [Heartbeat System](features/HEARTBEAT.md) | Agent run tracking and sessions | Developers |
| [Plugins](features/PLUGINS.md) | Plugin system capabilities | Plugin authors |
| [Approvals](features/APPROVALS.md) | Human-in-the-loop workflows | Operators |
| [Issues](features/ISSUES.md) | Issue tracking system | Project managers |

### Integrations

| Document | Description | Audience |
|----------|-------------|----------|
| [Claude Sonnet 4.6](integrations/CLAUDE_SONNET_46_INTEGRATION.md) | Sonnet IDE/CLI integration | Claude users |
| [GPT-5.4 Codex](integrations/GPT54_CODEX_INTEGRATION.md) | Codex multi-surface integration | OpenAI users |
| [Kimi 2.5](integrations/KIMI_25_INTEGRATION_REPORT.md) | Moonshot/Kimi setup | Kimi users |
| [Claude Desktop + Opus 4.6](../CLAUDE_DESKTOP_OPUS46_INTEGRATION.md) | Desktop WebSocket integration | Desktop users |
| [Kimi VS Code](../kimi-vscode-integration.md) | Kimi IDE extension guide | VS Code users |
| [Rate Limiter](integrations/SEC-011_RATE_LIMITER_INTEGRATION.md) | Security rate limiting | Security engineers |

### Operations & Deployment

| Document | Description | Audience |
|----------|-------------|----------|
| [Deployment Guide](../DEPLOYMENT.md) | Production deployment | DevOps |
| [Deploy Checklist](release/DEPLOY_CHECKLIST.md) | Pre-deployment verification | Release managers |
| [Monitoring](operations/MONITORING.md) | Operational monitoring | Operators |
| [Backup Automation](BACKUP_AUTOMATION.md) | Automated backup procedures | DevOps |
| [Troubleshooting](TROUBLESHOOTING.md) | Common issues and solutions | All users |
| [Security](../SECURITY.md) | Security best practices | Security engineers |

### API & Reference

| Document | Description | Audience |
|----------|-------------|----------|
| [API Reference](../API_REFERENCE.md) | HTTP endpoints and MCP tools | API consumers |
| [API Reference New](API_REFERENCE_NEW.md) | Updated API documentation | API consumers |
| [OpenAPI Spec](OPENAPI.yaml) | OpenAPI specification | API consumers |
| [Output Formatters](output-formatters.md) | Response formatting options | Developers |

### Migration & Upgrades

| Document | Description | Audience |
|----------|-------------|----------|
| [Migration Guide](MIGRATIONS.md) | Database and version migrations | Operators |
| [Migration Guide New](MIGRATION_GUIDE.md) | Single to multi-tenant migration | Operators |
| [Changelog](../CHANGELOG.md) | Version history and changes | All users |
| [Changelog New](CHANGELOG_NEW.md) | Latest features and changes | All users |
| [Upgrade Guide](UPGRADE_GUIDE.md) | Version upgrade procedures | Operators |

### Development & Contributing

| Document | Description | Audience |
|----------|-------------|----------|
| [Contributing](../CONTRIBUTING.md) | Contribution guidelines | Contributors |
| [Documentation Best Practices](DOCUMENTATION_BEST_PRACTICES.md) | Writing project docs | Contributors |
| [Backend Integration Roadmap](BACKEND_INTERFACE_INTEGRATION_ROADMAP.md) | Integration planning | Architects |

### Historical Reports

Archived implementation reports and historical documentation:

| Document | Description |
|----------|-------------|
| [CLI Enhancement](reports/historical/CLI_ENHANCEMENT_REPORT.md) | CLI improvements |
| [Completion Report](reports/historical/COMPLETION_REPORT.md) | v4.0 completion |
| [E2E Test Suite](reports/historical/E2E_TEST_SUITE_REPORT.md) | E2E testing |
| [Final Completion](reports/historical/FINAL_COMPLETION_REPORT.md) | Final v4 completion |
| [MCP Tools Implementation](reports/historical/MCP_TOOLS_IMPLEMENTATION_REPORT.md) | MCP tools |
| [Performance Optimization](reports/historical/PERFORMANCE_OPTIMIZATION_REPORT.md) | Performance |
| [Production Readiness](reports/historical/PRODUCTION_READINESS.md) | Production status |
| [Security Hardening](reports/historical/SECURITY_HARDENING_REPORT.md) | Security improvements |
| [WebSocket Features](reports/historical/WEBSOCKET_FEATURES_REPORT.md) | WebSocket implementation |

---

## Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT INTERFACE LAYER                        │
│  Claude Desktop │ Kimi IDE │ Codex Copilot │ WebSocket/MCP      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT GATEWAY LAYER                          │
│         Unified interface for all AI client adapters             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION LAYER                          │
│           JWT │ API Keys │ Sessions │ Multi-actor               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT ORCHESTRATOR LAYER                      │
│         CogniMeshBIOS: BOOT │ OPERATIONAL │ MAINTENANCE         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTION LAYER (14 Domains)                  │
│  Tasks │ Roadmaps │ Billing │ Issues │ Approvals │ Context ...  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **BIOS Core** | `src/bios/` | System lifecycle management |
| **Client Gateway** | `src/clients/` | AI client adapters |
| **Dashboard** | `src/dashboard/` | Web UI (24 components) |
| **Domains** | `src/domains/` | Business logic (14 domains) |
| **MCP Server** | `src/mcp/` | Model Context Protocol |
| **Router** | `src/router/` | Intelligent model routing |
| **Security** | `src/security/` | Auth, audit, encryption |
| **WebSocket** | `src/websocket/` | Real-time communication |

---

## Features

### Core Capabilities

| Feature | Description | Documentation |
|---------|-------------|---------------|
| **Multi-Model Routing** | Route across 7 AI models | [Router](../ARCHITECTURE.md#router) |
| **BIOS Control** | Firmware-like system management | [BIOS](../ARCHITECTURE.md#cognimeshbios) |
| **Agent Management** | CV-based agent orchestration | [CV System](../ARCHITECTURE.md#cv-factory) |
| **Workflow Engine** | GSD workflow execution | [GSD Engine](../ARCHITECTURE.md#gsd-engine) |
| **Cost Tracking** | Real-time billing and budgets | [Billing](features/BILLING.md) |
| **Approval Workflows** | Human-in-the-loop | [Approvals](features/APPROVALS.md) |
| **Merkle Audit** | Cryptographic audit trail | [Merkle](../ARCHITECTURE.md#audit-logging) |
| **Plugin System** | Worker-isolated plugins | [Plugins](features/PLUGINS.md) |

### Model Matrix

| Model | Provider | Surfaces | Best For |
|-------|----------|----------|----------|
| claude-opus-4-6 | Anthropic | desktop, cli | Complex reasoning |
| claude-opus-4-5 | Anthropic | desktop, cli | Premium fallback |
| claude-sonnet-4-6 | Anthropic | vscode, cli | IDE coding |
| claude-sonnet-4-5 | Anthropic | cli, vscode | Balanced tasks |
| gpt-5.4-codex | OpenAI | vscode, app, cli | Broad compatibility |
| gpt-5.3-codex | OpenAI | cli | Lightweight tasks |
| kimi-k2-5 | Moonshot | vscode, cli | Long context |

---

## API Reference

### MCP Tools (58 Total)

| Category | Count | Tools |
|----------|-------|-------|
| **Task Tools** | 11 | `task_create`, `task_list`, `task_update`, `task_complete`, `task_delete`, `task_get`, `task_search`, `task_assign`, `task_set_priority`, `task_add_tags`, `task_eisenhower_matrix` |
| **Roadmap Tools** | 13 | `roadmap_create`, `roadmap_list`, `roadmap_get`, `roadmap_update`, `roadmap_add_milestone`, `roadmap_add_step`, `roadmap_complete_step`, `roadmap_delete`, `roadmap_get_progress`, `roadmap_clone`, `roadmap_export`, `roadmap_import`, `roadmap_archive` |
| **Claude Tools** | 12 | `claude_send_message`, `claude_stream_message`, `claude_vision_analysis`, `claude_batch_process`, `claude_create_conversation`, `claude_get_conversation`, `claude_list_conversations`, `claude_update_context`, `claude_optimize_tokens`, `claude_extended_thinking`, `claude_compress_context`, `claude_get_usage` |
| **System Tools** | 12 | `system_health`, `system_config`, `system_logs`, `system_backup`, `system_restore`, `system_maintenance_mode`, `system_diagnostics`, `system_get_mode`, `system_get_stats`, `system_get_version`, `system_restart`, `system_get_audit_log` |
| **Analysis Tools** | 10 | `analyze_code`, `analyze_architecture`, `analyze_security`, `analyze_performance`, `analyze_dependencies`, `generate_documentation`, `create_checkpoint`, `restore_checkpoint`, `compare_versions`, `analyze_project` |

### HTTP Endpoints

```
GET    /health                    # System health check
GET    /api/tools                 # List all MCP tools
POST   /api/tools/execute         # Execute a tool
GET    /api/workflows             # List workflows
POST   /api/workflows             # Create workflow
POST   /api/workflows/:id/execute # Execute workflow
GET    /api/cv                    # List agent CVs
POST   /api/cv                    # Create CV
GET    /api/context/snapshots     # List snapshots
POST   /api/context/snapshots     # Create snapshot
GET    /api/providers             # List AI providers
```

---

## Learning Paths

### Path 1: New User (Beginner)

1. Read [Quick Start](QUICK_START.md)
2. Complete [First Task Tutorial](tutorials/first-task.md)
3. Explore [Dashboard](../ARCHITECTURE.md#dashboard-surfaces)
4. Try [MCP Tools](../API_REFERENCE.md#mcp-tools)

### Path 2: Developer (Intermediate)

1. Study [Architecture](../ARCHITECTURE.md)
2. Review [API Reference](../API_REFERENCE.md)
3. Read [Plugin Architecture](architecture/PLUGIN_ARCHITECTURE.md)
4. Build a [custom plugin](features/PLUGINS.md)

### Path 3: Operator (Intermediate)

1. Review [Deployment Guide](../DEPLOYMENT.md)
2. Understand [Monitoring](operations/MONITORING.md)
3. Set up [Billing](features/BILLING.md)
4. Configure [Backups](BACKUP_AUTOMATION.md)

### Path 4: Architect (Advanced)

1. Deep dive [Architecture](../ARCHITECTURE.md)
2. Study [BIOS System](../ARCHITECTURE.md#cognimeshbios)
3. Understand [Security](../SECURITY.md)
4. Review [Integration Roadmap](BACKEND_INTERFACE_INTEGRATION_ROADMAP.md)

---

## Quick Links

### Common Tasks

| Task | Command/Link |
|------|--------------|
| Start server | `npm start` |
| Run setup | `npm run setup` |
| Check health | `npm run bios:diagnose` |
| View logs | `tail -f logs/combined.log` |
| Run tests | `npm run verify:release` |
| Access dashboard | http://localhost:3001 |

### GitHub Resources

| Resource | URL |
|----------|-----|
| Repository | https://github.com/LastEld/Ckamal |
| GitHub Pages | https://lasteld.github.io/Ckamal/ |
| Issues | https://github.com/LastEld/Ckamal/issues |
| Discussions | https://github.com/LastEld/Ckamal/discussions |
| Releases | https://github.com/LastEld/Ckamal/releases |

### External Documentation

| Resource | URL |
|----------|-----|
| Anthropic Claude | https://docs.anthropic.com/ |
| OpenAI Codex | https://platform.openai.com/docs |
| Moonshot Kimi | https://platform.moonshot.cn/docs |
| MCP Protocol | https://modelcontextprotocol.io/ |

---

## Statistics

| Metric | Value |
|--------|-------|
| Version | 5.0.1 |
| Source Files | 373 |
| Lines of Code | ~25,000 |
| MCP Tools | 58 |
| API Endpoints | 50+ |
| Dashboard Components | 24 |
| Database Migrations | 18 |
| Test Coverage | 87% |
| Models | 7 |
| Providers | 3 |
| Surfaces | 5 |

---

## Contributing to Documentation

See [Documentation Best Practices](DOCUMENTATION_BEST_PRACTICES.md) for guidelines on writing and maintaining project documentation.

---

<div align="center">

**[Back to README](../README.md)** · **[Quick Start](QUICK_START.md)** · **[Architecture](../ARCHITECTURE.md)**

*CogniMesh v5.0 - Multi-model AI orchestration, subscription-first.*

</div>
