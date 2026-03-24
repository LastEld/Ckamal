# GPT 5.3 Codex Module

Cost-effective AI coding assistant with dual-mode support for GPT 5.3 and 5.4.

## Features

- **Cost-Effective**: 75% cost savings vs GPT 5.4 for routine tasks
- **Fast Response**: Optimized for quick completions (< 2s target)
- **Dual-Mode**: Automatic model selection based on task complexity
- **Caching**: Response caching for frequently used queries
- **Batch Processing**: Efficient batch operations
- **Cost Tracking**: Built-in usage and cost monitoring

## Quick Start

### Basic Usage

```javascript
const { GPT53Client } = require('./gpt53-client');

const client = new GPT53Client();
await client.initialize();

// Quick completion
const result = await client.quickCompletion('function fibonacci(');
console.log(result.content);

// Refactoring
const refactored = await client.standardRefactoring(code, 'Use async/await');

// Generate tests
const tests = await client.unitTestGeneration(code, { framework: 'jest' });
```

### App Integration

```javascript
const { createGPT53App } = require('./gpt53-app');

const app = createGPT53App({
  useDualMode: true,
  selectionMode: 'auto',
});

await app.initialize();

// All operations with automatic model selection
const result = await app.complete('function to reverse array');
```

### Dual-Mode Client

```javascript
const { DualModeCodexClient } = require('./gpt53-dual-client');

const client = new DualModeCodexClient({
  selectionMode: 'auto', // 'auto', '53', '54', 'cost', 'speed'
});

await client.initialize();

// Automatic model selection
const result = await client.execute({
  type: 'code_generation',
  requirements: 'Create a REST API endpoint',
});

// Compare costs before execution
const comparison = await client.compareCosts(task);
console.log(`Savings: ${comparison.savings.percent}%`);
```

### CLI Usage

```bash
# Start interactive CLI
node src/models/codex/gpt53-cli.js

# CLI Commands:
#   model [auto|53|54|cost|speed]  - Switch model
#   complete <prompt>              - Quick completion
#   refactor <file>                - Refactor code
#   generate <description>         - Generate code
#   test <file>                    - Generate tests
#   analyze <file>                 - Analyze code
#   batch <files...>               - Batch process
#   cost                           - Show cost summary
#   compare <prompt>               - Compare model costs
```

## Configuration

Environment variables:

```bash
OPENAI_API_KEY=your_api_key
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_ORG_ID=your_org_id
```

## Cost Comparison

| Model | Input (per 1M) | Output (per 1M) | Typical Savings |
|-------|----------------|-----------------|-----------------|
| GPT 5.3 | $0.50 | $1.50 | - |
| GPT 5.4 | $2.00 | $6.00 | 75% |

## Task Routing

### Use GPT 5.3 for:
- Quick completions (< 2s)
- Simple refactoring
- Code formatting
- Unit test generation
- Basic analysis
- Syntax checking

### Use GPT 5.4 for:
- Complex architecture
- Large contexts (> 120K tokens)
- Advanced reasoning
- Production-critical code
- Novel problem solving

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DualModeCodexClient                       │
├─────────────────────────────────────────────────────────────┤
│  TaskComplexityAnalyzer                                      │
│  ├── Token count estimation                                  │
│  ├── Cognitive complexity assessment                         │
│  ├── Context depth analysis                                  │
│  └── Model selection recommendation                          │
├─────────────────────────────────────────────────────────────┤
│  GPT53Client              │  GPT54Client                     │
│  (Cost-effective)         │  (Premium)                       │
│  ├── 128K context         │  ├── 256K context                │
│  ├── Fast responses       │  ├── Advanced reasoning          │
│  └── $0.50/$1.50          │  └── $2.00/$6.00                 │
├─────────────────────────────────────────────────────────────┤
│  ResponseCache  │  BatchProcessor  │  CostTracker            │
└─────────────────────────────────────────────────────────────┘
```

## API Reference

### GPT53Client

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize the client |
| `quickCompletion(prompt)` | Fast code completion |
| `standardRefactoring(code, instructions)` | Code refactoring |
| `codeGeneration(requirements, context)` | Generate code |
| `unitTestGeneration(code, options)` | Generate tests |
| `simpleAnalysis(code, type)` | Analyze code |
| `getCapabilities()` | Get model capabilities |
| `getMetrics()` | Get usage metrics |

### DualModeCodexClient

| Method | Description |
|--------|-------------|
| `execute(task, options)` | Execute with auto-selection |
| `selectModel(task)` | Get model recommendation |
| `compareCosts(task)` | Compare model costs |
| `setSelectionMode(mode)` | Set selection mode |

### GPT53App

| Method | Description |
|--------|-------------|
| `complete(prompt)` | Quick completion |
| `refactor(code, instructions)` | Refactor code |
| `generate(requirements)` | Generate code |
| `generateTests(code)` | Generate tests |
| `analyze(code, type)` | Analyze code |
| `batch(tasks)` | Batch processing |

## License

MIT
