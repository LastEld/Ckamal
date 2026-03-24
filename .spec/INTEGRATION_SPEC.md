# CogniMesh Integration Specification

## AI Client Integration Requirements

Based on the proposal analysis, CogniMesh must support three distinct AI client styles with different capabilities and integration patterns.

---

## 1. Codex-Style Client (e.g., Copilot/Cursor as Codex successor)

| Aspect | Specification |
|--------|--------------|
| **Primary Surface** | IDE-first (VS Code, Cursor, JetBrains) with some CLI tools |
| **Context Window** | Large but editor-scoped; usually current file + nearby files; full-repo query via special commands |
| **File Awareness (CLI)** | Depends on tool; many index repo and support multi-file edits and queries |
| **File Awareness (IDE)** | Very strong: autocomplete, inline edits, refactors based on open files + indexed project |
| **Project Memory** | Usually session-based; some tools add "memory banks" to persist notes/config between runs |
| **MCP Support** | Original OpenAI Codex did not have MCP; alternatives expose plugin/tool APIs |
| **Multi-agent** | Single-agent per session; agent mode for multi-file edits and autonomous tasks |
| **Best For** | IDE + agent/CLI that indexes repo (e.g., Cursor + agent mode) |

### Integration Strategy for CogniMesh
- Provide **IDE plugin-friendly endpoints** with session-based auth
- Support **editor-scoped context** via context snapshots
- Implement **memory bank** persistence for cross-session continuity
- Expose **MCP-compatible tool protocol** for plugin integration
- Support **multi-file context** in requests

---

## 2. Kimi Code / Kimi CLI

| Aspect | Specification |
|--------|--------------|
| **Primary Surface** | Terminal-first CLI + IDE integrations (VS Code, Zed, JetBrains) |
| **Context Window** | Up to 256K tokens in CLI ("K2.5" models), good for large projects |
| **File Awareness (CLI)** | CLI can scan working directory, path autocomplete, multi-file edits; raw shell + agent mode |
| **File Awareness (IDE)** | IDE integration via ACP: can act on open files and parts of workspace |
| **Project Memory** | Session-based with built-in multi-agent context management |
| **MCP Support** | Supports MCP-style protocol (Moonshot/Kimi tooling) and custom tools in CLI |
| **Multi-agent** | Explicit multi-agent orchestration in CLI with context management |
| **Best For** | Kimi CLI (256K context, terminal-first, raw shell + agent) |

### Integration Strategy for CogniMesh
- Implement **terminal-first CLI compatibility** with raw shell commands
- Support **256K token context windows** in request handling
- Enable **multi-agent orchestration** with context sharing
- Provide **ACP-compatible endpoints** for IDE integration
- Support **path autocomplete** and working directory scanning

---

## 3. Claude Code / Claude CLI

| Aspect | Specification |
|--------|--------------|
| **Primary Surface** | Terminal-first CLI, desktop app, IDE extensions (VS Code, JetBrains) |
| **Context Window** | Full-repo context for CLI sessions; can read, glob, grep entire project |
| **File Awareness (CLI)** | CLI deeply repo-aware; tools for Read, Edit, Glob, Grep, LS, Bash with plan mode |
| **File Awareness (IDE)** | IDE plugins use workspace + open files; share same engine |
| **Project Memory** | Session-based with compaction and planning; keeps decisions via plans and config files |
| **MCP Support** | Full native MCP support; CLI connects to many MCP servers as first-class capabilities |
| **Multi-agent** | Rich "agentic" system with subagents, plan mode, tools, hooks, skills; multiple subagents in parallel |
| **Best For** | Claude Code CLI (full repo tools, MCP, plan mode, subagents) |

### Integration Strategy for CogniMesh
- **Full native MCP server implementation** with complete tool protocol
- Support **full-repo context** loading and management
- Implement **plan mode** compatible workflow
- Enable **subagent spawning** and parallel execution
- Support **config hierarchy on disk** (`.claude/`, plans, rules, hooks)
- Provide **session compaction** for long-running contexts

---

## Unified Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    COGNIMESH MCP SERVER                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Codex API  │  │  Kimi API   │  │    Claude API (Native)  │  │
│  │  (Plugin)   │  │  (ACP-style)│  │       (Full MCP)        │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          ▼                                       │
│              ┌───────────────────────┐                           │
│              │   UNIFIED CONTROLLER  │                           │
│              │   (Request Router)    │                           │
│              └───────────┬───────────┘                           │
│                          │                                       │
│         ┌────────────────┼────────────────┐                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Context    │  │   Tasks     │  │  Roadmaps   │              │
│  │  Manager    │  │   Domain    │  │   Domain    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   GSD       │  │    RAG      │  │   Merkle    │              │
│  │  Engine     │  │  Analysis   │  │   Audit     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Integration Points

### 1. MCP Tool Registry
All three clients interact via MCP tools:
- **Codex**: Custom plugin API mapping to MCP
- **Kimi**: ACP protocol with MCP-style tooling
- **Claude**: Native MCP server connection

### 2. Context Management
| Client | Context Strategy |
|--------|-----------------|
| Codex | Editor-scoped snapshots, memory banks |
| Kimi | 256K token windows, multi-agent context |
| Claude | Full-repo context, session compaction |

### 3. Authentication
| Client | Auth Method |
|--------|-------------|
| Codex | IDE session tokens |
| Kimi | API keys + session tokens |
| Claude | **Subscription only** (NO API KEYS from playground) |

### 4. File Operations
| Client | File Access |
|--------|-------------|
| Codex | Indexed project, multi-file via IDE |
| Kimi | Working directory scan, path autocomplete |
| Claude | Full repo tools (Read, Edit, Glob, Grep, LS) |

---

## Implementation Requirements

### For Claude Integration (Sub-Agents 5-7)
**CRITICAL**: Remove all API key-based tools. Only subscription-based access allowed.

```javascript
// BAD - DO NOT IMPLEMENT
class ClaudeApiKeyClient { ... }

// GOOD - IMPLEMENT THIS
class ClaudeSubscriptionClient {
  // Uses CLAUDE_SESSION_TOKEN from subscription
  // No playground API keys
}
```

### For Database (Sub-Agents 12-13)
Implement multi-connection SQLite support:
```javascript
// Connection pool for concurrent access
class ConnectionPool {
  minConnections: 2,
  maxConnections: 10,
  acquireTimeout: 5000
}
```

### For All Clients
- Unified error handling
- Circuit breaker pattern
- Request/response interceptors
- Proper logging and audit

---

*Generated: 2026-03-23*
*Version: 4.0.0 Integration Spec*
