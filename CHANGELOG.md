# Changelog

All notable changes to CogniMesh will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [5.0.1] - 2026-03-28

### 🐛 Bug Fixes

#### ParseInt Radix Fixes
- Fixed 74 `parseInt()` calls to use explicit radix 10 parameter
- Prevents unintended octal/hexadecimal interpretation
- Ensures consistent decimal parsing across all environments
- Affected 20 files across core modules

**Files Modified:**
- `src/config.js` - 19 environment variable parsing fixes
- `src/controllers/helpers.js` - Pagination parameter parsing
- `src/dashboard/server.js` - Query limit parsing
- `src/middleware/auth.js` - Token parsing
- `src/middleware/auth-permissions.js` - Permission ID parsing
- `src/bios/*.js` - Version and configuration parsing
- `src/security/*.js` - Scrypt and password policy parsing
- `scripts/*.js` - Migration and backup timestamp parsing

### 🔧 Improvements

#### Code Quality
- 100% test pass rate across 110+ tests
- Zero ESLint errors
- Enhanced cross-platform compatibility
- Future-proof against radix behavior changes

---

## [5.0.0] - 2026-03-23

### 🎉 Major Release - CogniMesh BIOS

CogniMesh v5.0 represents a complete architectural overhaul, transforming the system into a BIOS-like autonomous multi-agent platform with multi-client orchestration capabilities.

---

### ✨ New Features

#### BIOS Control System
- **BIOS Firmware Layer** - Complete system lifecycle management with boot sequences, diagnostics, and operational modes
- **Operator Console** - Interactive CLI with 18+ commands for system management
- **TUI Dashboard** - Blessed.js-based terminal UI for real-time monitoring
- **System Modes** - BOOT, DIAGNOSE, OPERATIONAL, MAINTENANCE, SAFE_MODE
- **CV Registry** - Agent curriculum vitae system with capability matching

#### Multi-Client Orchestration
- **Unified Client Gateway** - Seamless integration with Claude, Kimi, and Codex
- **Auto-Client Selection** - Intelligent routing based on task complexity
- **Execution Strategies** - SINGLE, PARALLEL, CHAINED, SWARM, PLAN modes
- **Fallback Chains** - Automatic failover between clients
- **Load Balancing** - Distribute load across AI providers

#### Agent System
- **Agent CV Profiles** - Programmable agent capabilities and performance metrics
- **Agent Pool Management** - Auto-scaling based on workload
- **CV Factory** - Dynamic agent creation with specialized profiles
- **Agent Lifecycle** - Complete spawn, execute, terminate workflow

#### GitHub Integration
- **Auto-Update Manager** - Check, download, apply, and rollback updates
- **Patch Verifier** - 5-phase verification (static, unit, integration, performance, security)
- **Regression Suite** - Baseline tracking and trend analysis
- **Release Management** - Automated GitHub release integration

#### Claude Integration (Pro Subscription)
- **Core Client** - Circuit breaker protected Claude API client
- **Vision Analysis** - Image and document processing
- **Batch Processing** - Mass request handling
- **Streaming** - WebSocket and SSE streaming support
- **Context Management** - Conversation compression and optimization
- **Token Optimization** - Cost-effective token usage

#### MCP Tools (58 Total)
- **Task Tools (11)** - Complete task lifecycle with Eisenhower Matrix
- **Roadmap Tools (13)** - Educational path creation and management
- **Claude Tools (12)** - AI integration capabilities
- **System Tools (12)** - Health, config, backup, maintenance
- **Analysis Tools (10)** - Code, architecture, security analysis

#### Security & Audit
- **Merkle Trees** - Cryptographic audit trail verification
- **Rate Limiting** - Token bucket algorithm with per-client limits
- **ACL System** - Role-based access control with inheritance
- **Audit Logging** - Comprehensive operation logging
- **Input Sanitization** - Zod-based validation and sanitization

#### Communication
- **WebSocket Server** - Real-time bidirectional communication
- **Stream Manager** - Backpressure handling and stream lifecycle
- **Event System** - EventEmitter-based internal communication
- **Room Broadcasting** - Targeted message distribution

#### Database & Persistence
- **Connection Pool** - SQLite with multi-connection support
- **Repository Pattern** - Abstracted data access layer
- **Migration System** - Schema versioning with rollback support
- **Vector Store** - RAG embedding storage

---

### 🔧 Technical Improvements

#### Architecture
- **BIOS Metaphor** - Firmware-inspired system design
- **Domain-Driven Design** - 10 isolated business domains
- **Event-Driven Architecture** - EventEmitter-based communication
- **Circuit Breaker Pattern** - Fault tolerance for external services
- **Repository Pattern** - Testable data access layer
- **Gateway Pattern** - Unified external service access
- **Factory Pattern** - Agent and CV creation

#### Performance
- **Connection Pooling** - SQLite multi-connection management
- **LRU Caching** - Multi-tier caching strategy
- **Lazy Loading** - On-demand domain initialization
- **Auto-Scaling** - Dynamic agent pool sizing
- **Load Balancing** - Multiple distribution strategies

#### Developer Experience
- **ES Modules** - Modern JavaScript import/export
- **Zod Validation** - Type-safe schema validation
- **JSDoc Documentation** - Comprehensive API documentation
- **Interactive Console** - Rich CLI for development
- **Comprehensive Testing** - Unit, integration, and E2E tests

---

### 🚨 Breaking Changes

#### API Changes
- **MCP Protocol v2** - Updated JSON-RPC format
- **Authentication** - JWT now required for most endpoints
- **WebSocket API** - Changed message format
- **Tool Registry** - New registration API

#### Configuration Changes
- **Environment Variables** - New naming convention with `COGNIMESH_` prefix
- **Config Structure** - Hierarchical configuration sections
- **Feature Flags** - New feature toggle system

#### Database Changes
- **Schema Updates** - Migration from v4.x requires manual intervention
- **New Tables** - Agent CV, audit logs, rate limiting
- **Index Changes** - Performance-optimized indexes

#### Removed Features
- **Legacy HTTP API** - Non-MCP endpoints removed
- **Old Task System** - Replaced with Eisenhower Matrix
- **Legacy Memory** - Replaced with RAG + Memory QR
- **Deprecated Claude Wrappers** - Consolidated into unified client

---

### 📝 Migration Guide

#### From v4.x to v5.0.0

##### 1. Backup Your Data
```bash
# Create full backup
npm run db:backup

# Export existing tasks
cp ./data/cognimesh.db ./data/cognimesh.db.backup.v4
```

##### 2. Update Configuration

**Old format (.env v4):**
```bash
PORT=3000
GITHUB_TOKEN=ghp_xxx
ANTHROPIC_KEY=sk-ant-xxx
```

**New format (.env v5):**
```bash
COGNIMESH_PORT=3000
GITHUB_TOKEN=ghp_xxx
ANTHROPIC_API_KEY=sk-ant-xxx
BIOS_MODE=OPERATIONAL
MAX_AGENTS=50
```

See [.env.example](.env.example) for complete migration reference.

##### 3. Database Migration

```bash
# Run migrations
npm run db:migrate

# Verify migration
npm run bios:diagnose
```

##### 4. Update API Calls

**Old API:**
```javascript
// v4.x
const result = await client.call('createTask', { title: 'Test' });
```

**New API:**
```javascript
// v5.0
const result = await toolRegistry.execute('task_create', { 
  title: 'Test',
  priority: 'medium' 
});
```

##### 5. Update WebSocket Connections

**Old format:**
```javascript
ws.send(JSON.stringify({ action: 'createTask', data: {} }));
```

**New format:**
```javascript
ws.send(JSON.stringify({ 
  type: 'execute_tool', 
  toolName: 'task_create',
  params: {}
}));
```

##### 6. Test Your Integration

```bash
# Run all tests
npm test

# Run BIOS verification
npm run test:bios:all

# Check system health
curl http://localhost:3000/health
```

---

### 🔒 Security Updates

- **CVE-2024-XXXX** - Fixed potential SQL injection in task search
- **Rate Limiting** - Implemented token bucket algorithm
- **Input Validation** - All inputs now validated with Zod schemas
- **Audit Logging** - All operations logged with cryptographic verification
- **Secret Management** - Vault integration for secure secret storage

---

### 📊 Statistics

| Metric | Value |
|--------|-------|
| Total Files | 211 |
| Total Directories | 19 |
| Lines of Code | ~25,000 |
| MCP Tools | 58 |
| BIOS Components | 7 |
| Client Integrations | 3 |
| Test Coverage | 85% |

---

### 🙏 Contributors

Thanks to everyone who contributed to this release:

- CogniMesh Team - Architecture and core implementation
- All beta testers - Bug reports and feedback

---

## [4.2.0] - 2026-02-15

### Added
- Task dependency tracking
- Roadmap visualization
- GitHub webhook support

### Fixed
- Memory leak in agent pool
- Race condition in task updates

## [4.1.0] - 2026-01-20

### Added
- Claude vision support
- Batch API processing
- Context compression

### Changed
- Improved error messages
- Enhanced logging

## [4.0.0] - 2025-12-10

### Added
- Initial MCP server implementation
- Task management system
- Roadmap functionality

---

## Future Releases

### [5.1.0] - Planned
- Plugin system for custom tools
- Additional AI client integrations
- Enhanced TUI dashboard
- Mobile-responsive web dashboard

### [5.2.0] - Planned
- Multi-tenant support
- Advanced analytics
- Voice interface integration
- Docker containerization

---

## Release Checklist Template

For maintainers creating new releases:

- [ ] Update version in `package.json`
- [ ] Update version in `src/bios/index.js`
- [ ] Run full test suite
- [ ] Update CHANGELOG.md
- [ ] Update API_REFERENCE.md (if needed)
- [ ] Update ARCHITECTURE.md (if needed)
- [ ] Create git tag: `git tag -a vX.Y.Z -m "Release X.Y.Z"`
- [ ] Push tag: `git push origin vX.Y.Z`
- [ ] Create GitHub release
- [ ] Update Docker images (if applicable)
- [ ] Announce in discussions

---

**Full Changelog**: https://github.com/LastEld/Ckamal/compare/v4.2.0...v5.0.0
