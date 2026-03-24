# CogniMesh Master Specification

## Project Overview

**CogniMesh** is a production-grade MCP Server integrating multi-agent orchestration, educational roadmaps, and AI (Claude/Kimi/Codex-style) APIs. Provides verifiable audit via Merkle trees, RAG context analysis, and intelligent request routing.

### Key Integration Requirements

Based on the proposal table, CogniMesh must support three AI client styles:

| Aspect | Codex-style | Kimi Code | Claude Code |
|--------|-------------|-----------|-------------|
| Context Window | Editor-scoped | Up to 256K tokens | Full-repo context |
| File Awareness | IDE-first + indexing | CLI scan + multi-file | Deep repo-aware (tools) |
| Project Memory | Session-based | Multi-agent context | Config hierarchy on disk |
| MCP Support | Limited/Plugin API | MCP-style protocol | Full native MCP |
| Multi-agent | Single-agent | Explicit multi-agent | Rich subagent system |

### Architecture Principles

1. **Domain-Driven Design** - 10 isolated domains
2. **Circuit Breaker** - Resilience at all levels
3. **Merkle Trees** - Cryptographic verification
4. **RAG + Memory QR** - Intelligent context search
5. **ACL + Audit** - Security and audit trail
6. **Lazy Loading** - Startup optimization

---

## New Directory Structure (Target)

```
src/
├── alerts/           # Alert system (channels, engine, manager, rules)
├── analysis/         # RAG, embeddings, metrics, quality, memory-qr
├── analytics/        # Cost tracking, budget, reports
├── claude/           # Claude AI integration (REMOVE API KEY TOOLS - subscription only)
├── composition/      # Gateway layer (db, roadmap, git-checkpoint)
├── controllers/      # MCP Tool Handlers (unified, autonomous, tasks, roadmaps)
├── dashboard/        # Web dashboard (server, websocket, public/)
├── db/               # SQLite with multi-connection support
├── domains/          # 10 domains (architecture, context, gsd, integrations, merkle, orchestration, retention, roadmaps, tasks, thought)
├── gsd/              # GSD Engine (engine, agent-pool, planner)
├── intelligence/     # ML router, optimizer
├── middleware/       # Auth, ACL, audit, circuit-breaker
├── security/         # Security modules
├── tools/            # MCP Tool Definitions
├── utils/            # Utilities
├── validation/       # Schema validation
├── websocket/        # WebSocket server
├── server.js         # MCP Server entry point
└── config.js         # Configuration
```

---

## Sub-Agent Assignments

| Sub-Agent | Responsibility | Notes |
|-----------|---------------|-------|
| SA-1 | Root structure, package.json, docs | Helper for main agent |
| SA-2 | `src/alerts/` | Alert system |
| SA-3 | `src/analysis/` | RAG, embeddings, memory-qr |
| SA-4 | `src/analytics/` | Cost tracker, budget, reports |
| SA-5 | `src/claude/core/`, `extended-thinking/` | Core client, resilience |
| SA-6 | `src/claude/vision/`, `batch/`, `streaming/` | Vision, batch, streaming |
| SA-7 | `src/claude/context/`, `conversation/`, `tokens/`, `router/`, `resilience/` | Context management |
| SA-8 | `src/composition/` | Gateway layer |
| SA-9 | `src/controllers/unified.js`, `autonomous.js` | Main controllers |
| SA-10 | `src/controllers/tasks.js`, `roadmaps.js`, `claude-*.js` | Domain controllers |
| SA-11 | `src/dashboard/` | Web dashboard |
| SA-12 | `src/db/connection/`, `repositories/` | DB connection |
| SA-13 | `src/db/migrations/`, SQL schemas | Multi-connection support |
| SA-14 | `src/domains/architecture/`, `context/`, `gsd/` | Domains 1-3 |
| SA-15 | `src/domains/integrations/`, `merkle/`, `orchestration/` | Domains 4-6 |
| SA-16 | `src/domains/retention/`, `roadmaps/`, `tasks/`, `thought/` | Domains 7-10 |
| SA-17 | `src/gsd/engine.js`, `agent-pool.js` | GSD core |
| SA-18 | `src/gsd/planner.js` + workflow | GSD planner |
| SA-19 | `src/gsd/` remaining files | GSD complete |
| SA-20 | `src/intelligence/router.js` | ML Router |
| SA-21 | `src/intelligence/optimizer.js` + AI components | Intelligence |
| SA-22 | `src/middleware/auth.js`, `acl.js` | Security middleware |
| SA-23 | `src/middleware/audit.js`, `circuit-breaker.js` | Audit & resilience |
| SA-24 | `src/security/` | Security modules |
| SA-25 | `src/tools/`, `utils/`, `validation/`, `websocket/` | Remaining + final integration |

---

## Critical Constraints

### For Sub-Agents 5, 6, 7 (Claude integration):
- **REMOVE all API key-based tools** - Only subscription-based access allowed
- No playground API key tools
- All Claude access via subscription/organization only

### For Sub-Agent 12, 13 (Database):
- Implement **multi-connection support** for SQLite
- Better than current single-connection model

### For All Sub-Agents:
- Follow existing code patterns from `src/api/`, `src/domain/`, `src/infrastructure/`
- Maintain CONTRACT.md interfaces where they exist
- Ensure circuit-breaker pattern where appropriate
- Add proper error handling

---

## Integration Points

1. **Server Entry** (`server.js`): Must register all controllers, middleware, WebSocket
2. **Config** (`config.js`): Central configuration with environment overrides
3. **Domain Contracts**: All domains must expose consistent interface per CONTRACT.md
4. **Database**: Unified connection pool with multi-connection support
5. **MCP Tools**: All tools registered in `src/tools/`

---

*Generated: 2026-03-23*
*Version: 3.3.0 → 4.0.0 restructuring*
