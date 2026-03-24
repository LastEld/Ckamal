# CogniMesh BIOS (Basic Input/Output System)

## Overview

The BIOS layer is the foundational firmware of CogniMesh v5.0, providing system lifecycle management, multi-agent orchestration, health monitoring, and unified interfaces for coordinating multiple AI provider clients (Claude, Kimi, Codex).

**Key Features:**
- Multi-phase boot sequence with diagnostics
- System state management (BOOT, OPERATIONAL, MAINTENANCE, SAFE_MODE)
- Agent orchestration with multiple execution strategies
- Multi-client gateway for AI provider abstraction
- CV (Curriculum Vitae) registry for agent management
- Automated update and patch management
- Comprehensive health monitoring and alerting
- Interactive operator console

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Operator Console                            │
│         (Interactive CLI for system management)                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                     CogniMeshBIOS                               │
│              (Core system lifecycle management)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Boot Mode  │  │Operational   │  │Safe Mode     │          │
│  │              │  │   Mode       │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │Diagnose Mode │  │Maintenance   │                             │
│  │              │  │   Mode       │                             │
│  └──────────────┘  └──────────────┘                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
│AgentOrchestrator│ │  ClientGateway  │ │  SystemMonitor  │
│                 │ │                 │ │                 │
│ • spawnAgent()  │ │ • Claude        │ │ • Health checks │
│ • delegateTask()│ │ • Kimi          │ │ • Metrics       │
│ • parallelExec()│ │ • Codex         │ │ • Alerts        │
│ • chainExec()   │ │                 │ │                 │
│ • swarmExec()   │ │                 │ │                 │
│ • planModeExec()│ │                 │ │                 │
└───────┬────────┘ └────────┬────────┘ └─────────────────┘
        │                   │
┌───────▼────────┐ ┌────────▼────────┐
│   CVRegistry   │ │  UpdateManager  │
│                │ │                 │
│ • registerCV() │ │ • checkUpdates()│
│ • findCVs()    │ │ • download()    │
│ • getCV()      │ │ • apply()       │
│ • updatePerf() │ │ • rollback()    │
└────────────────┘ └────────┬────────┘
                            │
                   ┌────────▼────────┐
                   │  PatchVerifier  │
                   │                 │
                   │ • verifyPatch() │
                   │ • runTests()    │
                   │ • approve()     │
                   │ • reject()      │
                   └─────────────────┘
```

---

## Component Descriptions

### CogniMeshBIOS (`index.js`)

The core BIOS class that manages system state transitions, component registration, and the boot lifecycle.

**Key Responsibilities:**
- System boot sequence with 4 phases
- State machine management (5 states)
- Component lifecycle registration
- Health monitoring integration
- Graceful shutdown handling

**Modes:**
| Mode | Purpose |
|------|---------|
| `BOOT` | Initial startup, configuration loading |
| `DIAGNOSE` | System diagnostics and health checks |
| `OPERATIONAL` | Normal system operation |
| `MAINTENANCE` | Scheduled maintenance activities |
| `SAFE_MODE` | Degraded operation after critical failure |

---

### OperatorConsole (`console.js`)

Interactive command-line interface for operators to manage the CogniMesh system.

**Built-in Commands:**
```bash
status              # Display system status
agents list         # List all agents
agents spawn <cv>   # Spawn new agent from CV
clients             # Show client connections
delegate <task>     # Delegate task to client
parallel <tasks>    # Execute tasks in parallel
chain <steps>       # Chain tasks sequentially
update check        # Check for updates
patch verify <id>   # Verify a patch
logs --tail 100     # Show system logs
metrics             # Display system metrics
test --suite all    # Run regression tests
help                # Show help
exit                # Exit console
```

---

### AgentOrchestrator (`orchestrator.js`)

Multi-client task execution engine supporting various execution strategies.

**Execution Strategies:**

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Single** | Direct task delegation to one client | Simple tasks, specific client requirement |
| **Parallel** | Execute tasks across multiple clients simultaneously | Batch processing, comparison |
| **Chain** | Sequential execution with data handoff | Multi-step workflows |
| **Swarm** | Kimi-style collaborative agent swarm | Complex collaborative tasks |
| **Plan** | Claude-style plan mode with approval | Complex tasks requiring human oversight |

---

### CVRegistry (`cv-registry.js`)

Registry for managing agent Curriculum Vitae with indexing and search capabilities.

**Indexing:**
- Capabilities index (fast capability lookup)
- Domain index (expertise domain search)
- Tool index (tool proficiency lookup)
- Status index (lifecycle status filtering)

**Search Capabilities:**
```javascript
const matches = registry.findCVs({
  capabilities: ['javascript', 'react'],
  domains: ['frontend', 'ui'],
  tools: ['git', 'jest'],
  languages: ['typescript'],
  status: 'active'
});
```

---

### ClientGateway (`client-gateway.js`)

Unified interface for multiple AI provider clients.

**Supported Providers:**

| Provider | Modes | Context | Key Features |
|----------|-------|---------|--------------|
| **Claude** | CLI, Desktop, IDE, MCP | 1M tokens | MCP, Plan Mode, Sub-agents, Streaming |
| **Kimi** | CLI, IDE, Swarm | 256K tokens | Swarm Mode, Multimodal, Thinking Mode |
| **Codex** | CLI, Copilot, Cursor | 128K tokens | Code Completion, Infilling, Edit Style |

**Fallback Chain:** `claude → codex → kimi`

---

### UpdateManager (`update-manager.js`)

Handles system updates with checksum verification and rollback capabilities.

**Update Flow:**
```
CHECK → DOWNLOAD → VERIFY → APPLY → CONFIRM
   ↓        ↓          ↓        ↓       ↓
  Idle   Downloaded  Verified  Applied  Complete
```

**Safety Features:**
- Automatic backup before applying
- Checksum verification
- Auto-rollback on failure
- Update history tracking

---

### PatchVerifier (`patch-verifier.js`)

Comprehensive patch verification with 5-phase testing pipeline.

**Verification Phases:**
1. **Static Analysis** - Syntax, style, complexity checks
2. **Unit Tests** - Component-level testing
3. **Integration Tests** - Cross-component testing
4. **Performance Tests** - Benchmark and regression testing
5. **Security Scan** - Vulnerability detection

**Quality Thresholds:**
- Minimum success rate: 95%
- Maximum latency regression: 10%
- Maximum error rate: 1%
- Minimum code coverage: 80%

---

### SystemMonitor (`system-monitor.js`)

Health monitoring and alerting subsystem.

**Metric Types:**
- CPU usage
- Memory consumption
- Disk I/O
- Network latency
- Component health
- Custom metrics

**Alert Levels:**
- `INFO` - Informational
- `WARNING` - Attention required
- `ERROR` - Action required
- `CRITICAL` - Immediate action required

---

## Usage Examples

### Basic System Boot

```javascript
import { CogniMeshBIOS } from './bios/index.js';

const bios = new CogniMeshBIOS();

// Boot the system
const success = await bios.boot({
  configPath: './config/bios.json'
});

if (success) {
  console.log('System operational:', bios.getStatus());
} else {
  console.error('Boot failed, entering safe mode');
}
```

### Agent Orchestration

```javascript
import { AgentOrchestrator } from './bios/orchestrator.js';

const orchestrator = new AgentOrchestrator();

// Spawn an agent
const agent = await orchestrator.spawnAgent({
  id: 'code-reviewer',
  name: 'Code Reviewer',
  capabilities: {
    languages: ['javascript', 'typescript'],
    domains: ['code-review'],
    maxContextTokens: 128000
  }
}, { client: 'claude' });

// Delegate a task
const result = await orchestrator.delegateTask({
  type: 'review-code',
  data: { files: ['src/app.js'] }
}, { client: 'claude', priority: 2 });
```

### Parallel Execution

```javascript
// Execute tasks in parallel across multiple clients
const results = await orchestrator.parallelExecution([
  { type: 'analyze', data: { target: 'performance' } },
  { type: 'analyze', data: { target: 'security' } },
  { type: 'analyze', data: { target: 'maintainability' } }
], {
  clients: ['claude', 'kimi', 'codex'],
  aggregation: 'merge'
});
```

### Chain Execution

```javascript
// Chain tasks with data handoff
const result = await orchestrator.chainExecution([
  { client: 'kimi', task: 'research', data: { topic: 'AI patterns' } },
  { client: 'codex', task: 'implement', transform: (prev) => ({ code: prev.findings }) },
  { client: 'claude', task: 'review', transform: (prev) => ({ code: prev.implementation }) }
], {
  initialData: { project: 'my-app' }
});
```

### CV Registry

```javascript
import { CVRegistry } from './bios/cv-registry.js';

const registry = new CVRegistry();

// Register a CV
registry.registerCV({
  id: 'frontend-specialist',
  name: 'Frontend Specialist',
  version: '1.0.0',
  capabilities: {
    languages: ['javascript', 'typescript', 'css'],
    domains: ['frontend', 'react', 'vue'],
    tools: ['webpack', 'vite', 'jest'],
    maxContextTokens: 128000,
    supportsStreaming: true,
    supportsVision: false
  }
});

// Find matching CVs
const matches = registry.findCVs({
  capabilities: ['javascript', 'react'],
  domains: ['frontend']
});
```

### Client Gateway

```javascript
import { ClientGateway } from './bios/client-gateway.js';

const gateway = new ClientGateway({
  claude: { cli: true, desktop: false },
  kimi: { cli: true },
  codex: { cli: true }
});

// Initialize all clients
await gateway.initialize();

// Send to specific client
const response = await gateway.sendToClient('claude', 'Analyze this code', {
  timeout: 60000
});

// Broadcast to all clients
const responses = await gateway.broadcast('Review this design', {
  filter: 'available'
});
```

### Patch Verification

```javascript
import { PatchVerifier } from './bios/patch-verifier.js';

const verifier = new PatchVerifier({
  minSuccessRate: 0.95,
  minCodeCoverage: 0.80
});

// Verify a patch
const result = await verifier.verifyPatch('patch-123', {
  skipPhases: [],
  timeout: 300000
});

if (result.passed) {
  await verifier.approvePatch('patch-123');
} else {
  await verifier.rejectPatch('patch-123', 'Failed performance tests');
}
```

### Console Usage

```javascript
import { OperatorConsole } from './bios/console.js';

const console = new OperatorConsole(bios);

// Execute commands programmatically
await console.execute('status');
await console.execute('agents spawn frontend-specialist');
await console.execute('delegate "Optimize React performance" --client claude');
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub API token | Required |
| `BIOS_MODE` | Default boot mode | `OPERATIONAL` |
| `AUTO_UPDATE` | Enable auto-updates | `false` |
| `REGRESSION_THRESHOLD` | Max regression % | `5.0` |
| `STATE_PATH` | State storage path | `./state` |
| `CLAUDE_API_KEY` | Claude API key | Optional |
| `KIMI_API_KEY` | Kimi API key | Optional |
| `CODEX_API_KEY` | Codex API key | Optional |

### BIOS Configuration File

```json
{
  "version": "5.0.0",
  "system": {
    "autoUpdate": false,
    "regressionThreshold": 5.0,
    "statePath": "./state"
  },
  "clients": {
    "claude": {
      "enabled": true,
      "modes": ["cli", "desktop"],
      "context": 1000000
    },
    "kimi": {
      "enabled": true,
      "modes": ["cli", "swarm"],
      "context": 256000
    },
    "codex": {
      "enabled": true,
      "modes": ["cli", "ide"],
      "context": 128000
    }
  },
  "orchestrator": {
    "maxConcurrentTasks": 10,
    "maxQueueSize": 100,
    "defaultTimeout": 60000,
    "autoRetry": true,
    "defaultMaxRetries": 2
  },
  "monitor": {
    "checkInterval": 30000,
    "alertThresholds": {
      "cpu": 80,
      "memory": 85,
      "disk": 90
    }
  }
}
```

---

## Directory Structure

```
src/bios/
├── index.js              # Core BIOS class
├── console.js            # Operator console
├── orchestrator.js       # Agent orchestration
├── cv-registry.js        # CV management
├── cv-factory.js         # CV creation utilities
├── cv-schema.js          # CV validation schema
├── client-gateway.js     # Multi-client interface
├── github-client.js      # GitHub API client
├── update-manager.js     # Update management
├── patch-verifier.js     # Patch verification
├── regression-suite.js   # Regression testing
├── system-monitor.js     # Health monitoring
├── spawn-manager.js      # Agent lifecycle
├── cli.js                # CLI entry point
├── tui.js                # Terminal UI
├── CONTRACT.md           # Interface contract
├── README.md             # This file
├── modes/                # System mode implementations
│   ├── boot.js
│   ├── operational.js
│   ├── maintenance.js
│   └── safe-mode.js
├── cv-templates/         # CV templates
└── test-runners/         # Test runners
    ├── unit.js
    ├── integration.js
    ├── performance.js
    └── security.js
```

---

## API Stability

| Component | Stability | Notes |
|-----------|-----------|-------|
| CogniMeshBIOS | Stable | Core API stable since v5.0 |
| AgentOrchestrator | Stable | Execution strategies stable |
| CVRegistry | Stable | Registry API stable |
| ClientGateway | Evolving | New clients may be added |
| OperatorConsole | Stable | Command interface stable |
| UpdateManager | Stable | Update flow stable |
| PatchVerifier | Evolving | New verification phases planned |

---

## Contributing

When contributing to the BIOS layer:

1. Follow the existing code style and patterns
2. Add comprehensive JSDoc comments
3. Update this README for new features
4. Update CONTRACT.md for interface changes
5. Add tests for new functionality
6. Ensure all verification phases pass

---

## License

Part of CogniMesh v5.0 - See root LICENSE file

---

## See Also

- [CONTRACT.md](./CONTRACT.md) - Detailed interface contract
- [../AGENTS.md](../AGENTS.md) - Project-wide agent guidelines
- [../PROJECT_STATUS.md](../PROJECT_STATUS.md) - Current project status
