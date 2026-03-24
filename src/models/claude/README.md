# Claude Sonnet Deep Native Integration

This module provides deep native integration with Claude 4.6/4.5 Sonnet for both CLI and IDE environments.

## Overview

The Claude Sonnet integration provides:

- **200K context window** support for large codebases
- **Cost-effective pricing** ($3/M input, $15/M output tokens)
- **Extended thinking** mode for complex reasoning
- **Native CLI integration** with interactive mode and batch processing
- **Full IDE integration** with LSP protocol support
- **Git integration** for diff analysis and commit messages

## Components

### 1. Configuration (`sonnet-config.js`)

Centralized configuration for Claude Sonnet models:

```javascript
import { SonnetConfigManager, SONNET_MODELS } from './sonnet-config.js';

const config = new SonnetConfigManager({
  modelId: 'SONNET_4_6',
  extendedThinking: { enabled: true, budgetTokens: 4000 },
  costTracking: { enabled: true, warnThreshold: 10.00 }
});
```

**Features:**
- Model selection (4.6 vs 4.5)
- Cost tracking with thresholds
- Performance optimization (caching, context compression)
- Retry configuration

### 2. CLI Client (`sonnet-cli-client.js`)

Full-featured CLI client for command-line workflows:

```javascript
import { SonnetCliClient } from './sonnet-cli-client.js';

const client = new SonnetCliClient({
  apiKey: process.env.ANTHROPIC_API_KEY,
  modelId: 'SONNET_4_6',
  preferApi: true
});

await client.initialize();

// Code analysis
const analysis = await client.codeAnalyze('./src/app.js', {
  focus: 'performance,security'
});

// Code generation
const code = await client.codeGenerate(
  'Create a REST API endpoint for user authentication',
  'typescript'
);

// Interactive session
await client.startInteractiveSession();
```

**Core Methods:**
- `initialize()` - Setup and verify connection
- `send()` - Send messages
- `execute()` - Execute tasks
- `codeAnalyze()` - Analyze code files
- `codeGenerate()` - Generate code
- `codeReview()` - Review code
- `explainCode()` - Explain code at different levels
- `startInteractiveSession()` - Interactive mode
- `batchProcess()` - Batch processing
- `analyzeGitDiff()` - Git diff analysis
- `generateCommitMessage()` - Commit message generation

### 3. IDE Client (`sonnet-ide-client.js`)

LSP protocol-compatible IDE client:

```javascript
import { SonnetIdeClient } from './sonnet-ide-client.js';

const client = new SonnetIdeClient({
  socketPath: '/tmp/claude-sonnet.sock',
  workspaceFolders: [{ uri: 'file:///project', name: 'project' }]
});

await client.initialize();

// Inline completion
const completions = await client.inlineCompletion(
  { uri: 'file:///project/src/app.ts', text: '...', languageId: 'typescript' },
  { line: 10, character: 15 }
);

// Hover information
const hover = await client.provideHover(document, position);

// Code actions
const actions = await client.codeAction(document, range, context);

// Refactoring
const edit = await client.refactoring(document, range, 'extract', options);
```

**Core Methods:**
- `initialize()` - LSP initialization
- `inlineCompletion()` - IDE completion
- `provideHover()` - Hover information
- `codeAction()` - Code actions/quick fixes
- `refactoring()` - Refactoring support
- `renameSymbol()` - Symbol renaming
- `openDocument()` - Document synchronization

### 4. CV Configuration (`cv/claude-sonnet-specialist.yaml`)

Specialist agent CV with rights and obligations:

```yaml
id: claude-sonnet-specialist
name: Claude Sonnet Specialist
capabilities:
  maxContextTokens: 200000
  features:
    - extended_thinking
    - computer_use
    - vision
rights:
  cli:
    - canExecuteShellCommands
    - canReadFiles
    - canWriteFiles
  ide:
    - canProvideInlineCompletions
    - canShowHoverInfo
obligations:
  responseTime:
    inlineCompletion: 500ms
    hoverInfo: 300ms
```

## BIOS Integration

The Sonnet clients are automatically registered with the BIOS Client Gateway:

```javascript
import { ClientGateway } from './bios/client-gateway.js';

const gateway = new ClientGateway({
  claudeSonnet: {
    cli: { apiKey: process.env.ANTHROPIC_API_KEY },
    ide: { socketPath: '/tmp/claude-sonnet.sock' }
  }
});

await gateway.initialize();

// Execute with Sonnet
const result = await gateway.executeWithSonnet({
  type: 'code_analyze',
  filePath: './src/app.js'
});

// Or auto-select best client
const client = gateway.selectBestClient({
  type: 'code_completion',
  language: 'typescript'
});
```

## Task Routing

The Client Gateway includes Sonnet in task routing:

| Task Type | Primary | Fallback |
|-----------|---------|----------|
| Code Completion | Claude Sonnet IDE | Codex, Kimi |
| IDE Integration | Claude Sonnet IDE | Claude, Kimi |
| CLI Coding | Claude Sonnet CLI | Claude, Kimi, Codex |
| Complex Reasoning | Claude | Kimi, Codex |
| Long Context | Kimi | Claude, Codex |

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=your_api_key

# Optional
CLAUDE_SONNET_MODEL=claude-sonnet-4-6
CLAUDE_SONNET_CONTEXT_WINDOW=200000
CLAUDE_SONNET_COST_WARN_THRESHOLD=10.00
CLAUDE_SONNET_COST_MAX_THRESHOLD=50.00
```

## Cost Tracking

Built-in cost tracking with configurable thresholds:

```javascript
const tracker = client.costTracker;

// Get stats
const stats = tracker.getStats();
console.log(`Total cost: $${stats.totalCost.toFixed(4)}`);

// Listen for threshold warnings
tracker.on('thresholdWarning', ({ threshold, currentCost }) => {
  console.warn(`Cost warning: $${currentCost} approaching $${threshold}`);
});
```

## Performance Optimization

Automatic optimizations include:

- **Context compression** at 150K tokens
- **Response caching** with 5-minute TTL
- **Smart retries** with exponential backoff
- **Streaming support** for large responses

## Error Handling

All clients include comprehensive error handling:

```javascript
try {
  await client.codeAnalyze('./file.js');
} catch (error) {
  if (error.message.includes('cost budget')) {
    // Handle cost limit exceeded
  } else if (error.message.includes('context limit')) {
    // Handle context window exceeded
  }
}
```

## License

Proprietary - CogniMesh Project
