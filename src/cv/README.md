# CV (Curriculum Vitae) System

A comprehensive system for managing agent CVs, enforcing rights at runtime, monitoring obligations, and creating agents from templates.

## Overview

The CV System provides a complete framework for:
- **CV Management**: Store, retrieve, update, and version agent CVs
- **Rights Enforcement**: Runtime permission checking and access control
- **Obligations Monitoring**: SLA tracking, performance monitoring, and violation detection
- **Template System**: Create agents from predefined templates with inheritance
- **Management API**: RESTful endpoints and programmatic API

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CV SYSTEM ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CV REGISTRY (Central Store)                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   CV Store   │  │   Index      │  │   Version    │              │   │
│  │  │   (Source)   │  │   (Query)    │  │   History    │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                               │                                             │
│           ┌───────────────────┼───────────────────┐                         │
│           ▼                   ▼                   ▼                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  CV Factory     │  │  Rights Engine  │  │  Obligations    │             │
│  │  (Creation)     │  │  (Enforcement)  │  │  Monitor        │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│           │                   │                   │                         │
│           └───────────────────┼───────────────────┘                         │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CV MANAGER (Management API)                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   REST API   │  │   Bulk Ops   │  │   Lifecycle  │              │   │
│  │  │   Endpoints  │  │              │  │   Management │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. CV Registry (`registry.js`)

Central storage and indexing for agent CVs.

**Features:**
- CRUD operations for CVs
- Multi-indexing (capability, domain, tool, language, status, rights)
- Version history with rollback support
- Search and filtering
- Statistics and reporting

```javascript
import { CVRegistry } from './cv/registry.js';

const registry = new CVRegistry();

// Create a CV
const cv = registry.create({
  identity: { id: 'agent-1', name: 'Test Agent', version: '1.0.0' },
  capabilities: { languages: ['javascript'], domains: ['backend'] },
  rights: { execution: { operations: ['read', 'write'] } }
});

// Search CVs
const results = registry.search({
  languages: ['javascript'],
  domains: ['backend'],
  status: 'active'
});

// Get version history
const versions = registry.getVersions('agent-1');

// Rollback
const rolledBack = registry.rollback('agent-1', '1.0.0');
```

### 2. Rights Engine (`engine.js`)

Runtime rights validation and permission checking.

**Features:**
- Permission evaluation with caching
- Deny-override policy
- Pattern matching for resources
- Audit logging
- Custom policy support

```javascript
import { RightsEngine } from './cv/engine.js';

const engine = new RightsEngine();

// Check permission
const result = await engine.check({
  cv: agentCV,
  action: 'write',
  resource: '/workspace/file.txt',
  context: { timeOfDay: new Date().getHours() }
});

// Require permission (throws if denied)
await engine.require({
  cv: agentCV,
  action: 'execute:system',
  resource: '/bin/bash'
});

// Add custom policy
engine.addPolicy({
  name: 'business-hours',
  evaluate: (cv, action, resource, context) => {
    const hour = new Date().getHours();
    if (hour < 9 || hour > 17) {
      return { allowed: false, reason: 'Outside business hours' };
    }
    return { allowed: true };
  }
});
```

### 3. Obligations Monitor (`obligations.js`)

SLA tracking, performance monitoring, and violation detection.

**Features:**
- Task lifecycle tracking
- Response time monitoring (p50, p95, p99)
- Resource usage tracking (tokens, cost, compute)
- Violation detection and alerting
- Compliance checking

```javascript
import { ObligationsMonitor } from './cv/obligations.js';

const monitor = new ObligationsMonitor();

// Register agent
monitor.register('agent-1', agentCV);

// Track task execution
monitor.recordTaskStart('agent-1', { id: 'task-1', expectedDuration: 5000 });
monitor.recordTaskComplete('agent-1', { 
  success: true, 
  tokensUsed: 5000,
  cost: 0.10
});

// Check compliance
const compliance = monitor.checkCompliance('agent-1');

// Get performance metrics
const metrics = monitor.getPerformanceMetrics('agent-1');

// Get violations
const violations = monitor.getViolations({ severity: 'critical' });
```

### 4. CV Factory (`factory.js`)

Template-based CV creation and inheritance.

**Features:**
- Template-based creation
- CV cloning
- Specialization
- Inheritance (single and multiple)
- Effective rights calculation

```javascript
import { CVFactory } from './cv/factory.js';

const factory = new CVFactory(registry);

// Create from template
const cv = factory.createFromTemplate('developer', {
  identity: { id: 'my-dev', name: 'My Developer' }
});

// Clone
const clone = factory.clone('my-dev', {
  identity: { id: 'my-dev-clone', name: 'Clone' }
});

// Specialize
const specialist = factory.specialize('my-dev', 'frontend_expert', {
  addCertifications: ['react_expert']
});

// Inherit
const child = factory.createFromParent('my-dev', {
  identity: { name: 'Child Agent' }
});
```

### 5. CV Manager (`manager.js`)

Management API with REST endpoints.

**Features:**
- CRUD operations
- Bulk operations
- Lifecycle management (activate, suspend, deprecate)
- Rights and compliance endpoints
- Express router generation

```javascript
import { CVManager } from './cv/manager.js';

const manager = new CVManager();

// Create CV
const result = await manager.create(cvData);

// Activate
await manager.activate('agent-1');

// Check compliance
const compliance = await manager.getCompliance('agent-1');

// Bulk operations
await manager.bulkActivate(['agent-1', 'agent-2', 'agent-3']);

// Express routes
const router = express.Router();
manager.getRouter()(router);
app.use('/api/v1/cv', router);
```

## CV Structure

A CV consists of the following main sections:

```yaml
identity:
  id: unique-id
  name: Human Readable Name
  version: 1.0.0
  description: Description
  lineage:
    parent_id: optional-parent
    template_origin: template-name

capabilities:
  languages: [javascript, python]
  domains: [backend, frontend]
  tools: [git, docker]
  ai_features:
    max_context_tokens: 100000
    supports_streaming: true

rights:
  resources:
    databases: [...]
    filesystem: [...]
    apis: [...]
  models:
    allowed: [claude:sonnet]
  execution:
    operations: [read, write]
  communication:
    can_talk_to: [agent:coordinator_*]
  admin:
    can_create_cv: false

obligations:
  output_quality:
    accuracy: { min_score: 0.85 }
  performance:
    response_time: { p95_max_ms: 5000 }
  resource_limits:
    tokens: { per_task: 100000 }

execution:
  preferred_client: claude
  timeout: 300000

resources:
  min_memory: 512
  priority: 5

specialization:
  primary: developer
  certifications: [mcp_core]

lifecycle:
  status: active
  max_lifetime: 3600000

metadata:
  tags: [developer, frontend]
  category: worker
```

## Templates

Pre-defined templates are available in `templates/`:

- **system-admin.yaml**: Full system privileges for maintenance
- **code-reviewer.yaml**: Security-focused code review
- **developer.yaml**: Standard development tasks
- **test-agent.yaml**: Automated testing
- **analyst.yaml**: Data analysis and reporting

### Template Example

```yaml
identity:
  id: developer
  name: Full-Stack Developer
  version: 1.0.0

capabilities:
  languages: [javascript, typescript, python]
  domains: [frontend, backend, api]
  tools: [mcp, git, docker]

rights:
  execution:
    operations: [read, write, execute:safe]
  resources:
    filesystem:
      - path: "/workspace/**"
        access: [read, write]

obligations:
  performance:
    response_time:
      p95_max_ms: 10000
```

## API Reference

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/cv | Create CV |
| GET | /api/v1/cv | List CVs |
| GET | /api/v1/cv/:id | Get CV |
| PUT | /api/v1/cv/:id | Update CV |
| DELETE | /api/v1/cv/:id | Delete CV |
| POST | /api/v1/cv/search | Search CVs |
| POST | /api/v1/cv/match | Match CVs to requirements |
| GET | /api/v1/cv/templates | List templates |
| POST | /api/v1/cv/templates/:name/instantiate | Create from template |
| GET | /api/v1/cv/:id/rights | Get effective rights |
| POST | /api/v1/cv/:id/check | Check permission |
| GET | /api/v1/cv/:id/compliance | Get compliance status |
| POST | /api/v1/cv/:id/activate | Activate CV |
| POST | /api/v1/cv/:id/suspend | Suspend CV |
| POST | /api/v1/cv/:id/clone | Clone CV |
| GET | /api/v1/cv/:id/versions | Get versions |
| POST | /api/v1/cv/:id/rollback | Rollback to version |

### Quick Start

```javascript
import { createCVSystem } from './cv/index.js';

// Create system
const system = createCVSystem();
await system.initialize();

// Create agent from template
const agent = await system.createAgent('developer', {
  identity: { id: 'my-agent', name: 'My Agent' }
});

// Spawn agent instance
const instance = await system.spawnAgent(agent.identity.id);

// Check permission
const canWrite = await instance.hasPermission('write', '/workspace/file.txt');

// Execute with permission check
await instance.execute('write', '/workspace/file.txt', async () => {
  // Perform write operation
});

// Get health
const health = system.getHealth();

// Dispose
await system.dispose();
```

## Testing

Run the CV system tests:

```bash
node --test tests/unit/cv/cv-system.test.js
```

## Integration with BIOS

The CV System integrates with the CogniMesh BIOS:

```javascript
import { CogniMeshBIOS } from './bios/index.js';
import { createCVSystem } from './cv/index.js';

const bios = new CogniMeshBIOS();
const cvSystem = createCVSystem();

// Boot with CV system
await bios.boot({
  cvSystem,
  validateCVs: true
});

// Spawn agents from CVs
const agent = await cvSystem.spawnAgent('system-admin');
```

## License

MIT © CogniMesh Systems
