# GPT 5.4 Codex CLI Integration

> **All models are accessed through flat-rate subscriptions. No API billing applies.**

## Overview

GPT 5.4 Codex CLI integration for CogniMesh Phase 4. Provides advanced project analysis, batch processing, and workflow automation capabilities.

## Architecture

```
src/clients/codex/
├── cli.js          # GPT54CodexCLIClient - main client
├── index.js        # Codex client exports
├── copilot.js      # GitHub Copilot integration
└── cursor.js       # Cursor IDE integration
```

## Class GPT54CodexCLIClient

### Constructor

```javascript
const client = new GPT54CodexCLIClient({
  model: 'gpt-5.4-codex',
  reasoningModel: 'o4-mini',
  projectRoot: './my-project',
  enableReasoning: true,
  autoApprove: false,
  maxBatchSize: 50,
  timeout: 300000
});
```

### Core Methods

#### `async initialize()`
Initialize the client and verify the connection.

```javascript
await client.initialize();
// Returns: { success: true, message: '...', capabilities: {...} }
```

#### `async send(message, options)`
Send a message to Codex.

```javascript
const response = await client.send(
  { content: "Analyze this code" },
  {
    model: 'gpt-5.4-codex',
    reasoning: true,
    maxTokens: 8192
  }
);
```

#### `async projectAnalyze(path, options)`
Analyze an entire project.

```javascript
const result = await client.projectAnalyze('./src', {
  quick: false,        // Full analysis
  deep: true,          // Use reasoning model
  exclude: ['**/node_modules/**']
});

// Returns:
// {
//   success: true,
//   path: './src',
//   structure: { files: [...], stats: {...} },
//   analysis: { sampleSize, totalFiles, analysis, reasoning },
//   insights: { recommendations, metrics, summary },
//   summary: {...},
//   recommendations: [...]
// }
```

#### `async batchRefactor(files, operation, options)`
Batch file refactoring.

```javascript
const result = await client.batchRefactor(
  ['./src/file1.js', './src/file2.js'],
  {
    description: "Convert to TypeScript",
    type: 'refactor',
    instructions: "Add type annotations"
  },
  {
    batchSize: 10,
    delay: 1000,
    dryRun: false        // true = show changes without applying
  }
);

// Returns:
// {
//   success: true,
//   batchId: 'batch-...',
//   total: 100,
//   processed: 98,
//   errors: 2,
//   results: [...],
//   errorDetails: [...]
// }
```

#### `async generateArchitecture(spec, options)`
Generate architecture from specification.

```javascript
const result = await client.generateArchitecture({
  description: "E-commerce platform with microservices",
  constraints: "Must use Node.js and PostgreSQL",
  preferences: "Serverless deployment"
}, {
  outputPath: './architecture'
});

// Returns:
// {
//   success: true,
//   architecture: {...},
//   files: ['ARCHITECTURE.md', 'components.json'],
//   components: [...],
//   diagrams: [...],
//   generatedAt: '2026-03-23T...'
// }
```

#### `async optimizeCodebase(path, options)`
Codebase optimization.

```javascript
const result = await client.optimizeCodebase('./src', {
  autoApply: false,      // true = apply automatically
  targets: ['performance', 'security', 'quality']
});

// Returns:
// {
//   success: true,
//   path: './src',
//   analysis: {...},
//   targets: [...],
//   plan: {...},
//   applied: [],
//   metrics: {
//     filesAnalyzed: 150,
//     optimizationsIdentified: 23,
//     optimizationsApplied: 0
//   }
// }
```

#### `async runTests(options)`
Generate and run tests.

```javascript
const result = await client.runTests({
  testType: 'unit',      // unit|integration|e2e
  coverage: true,
  path: './src'
});
```

#### `async generateDocumentation(options)`
Generate documentation.

```javascript
const result = await client.generateDocumentation({
  format: 'markdown',    // markdown|html|json
  sections: ['api', 'guide'],
  audience: 'developers'
});
```

#### `getCapabilities()`
Get client capabilities.

```javascript
const caps = client.getCapabilities();
// Returns:
// {
//   provider: 'codex',
//   version: '5.4',
//   contextWindow: 128000,
//   maxOutputTokens: 8192,
//   features: ['completion', 'edit', 'chat', 'code_generation', ...],
//   models: ['gpt-5.4-codex', 'gpt-5.4', 'o4-mini', 'o4-mini-high'],
//   languages: ['javascript', 'typescript', 'python', ...]
// }
```

### Events

The client extends EventEmitter and emits events:

```javascript
client.on('ready', () => console.log('Client ready'));
client.on('project:analyze:start', ({ path }) => console.log(`Analyzing ${path}`));
client.on('project:analyze:complete', ({ path, files }) => console.log(`Analyzed ${files} files`));
client.on('batch:start', ({ batchId, total }) => console.log(`Batch ${batchId}: ${total} files`));
client.on('batch:progress', ({ percentage, processed, total }) => {
  console.log(`Progress: ${percentage}%`);
});
client.on('batch:complete', ({ batchId, processed, errors }) => {
  console.log(`Complete: ${processed} processed, ${errors} errors`);
});
```

## CLI Commands

### Interactive Mode (REPL)

```bash
node src/bios/cli.js -i
# or
bios interactive
```

Available REPL commands:

```
bios> codex status                    # Check client status
bios> codex analyze ./src             # Project analysis
bios> codex refactor "*.js" "Convert to TypeScript"  # Batch refactoring
bios> codex generate "E-commerce API" # Architecture generation
bios> codex optimize ./src            # Optimization
```

### Batch Mode

```bash
# Project analysis
bios codex analyze ./my-project --deep

# Batch refactoring
bios codex refactor "src/**/*.js" --instruction "Add JSDoc comments" --dry-run

# Architecture generation
bios codex generate "Microservices API with authentication" -o ./architecture

# Codebase optimization
bios codex optimize ./src --target performance,security

# Test generation
bios codex test ./src --type unit --coverage

# Documentation generation
bios codex docs ./src -f markdown -o API.md

# Status check
bios codex status
```

### Using the CogniMesh CLI

```bash
# Full analysis with reasoning
node src/bios/cli.js codex analyze ./src --deep

# Quick analysis
node src/bios/cli.js codex analyze ./src --quick

# Batch refactoring with file output
node src/bios/cli.js codex refactor "src/**/*.js" \
  --instruction "Convert to TypeScript" \
  --batch-size 5 \
  --delay 2000 \
  --dry-run

# Architecture generation
node src/bios/cli.js codex generate "E-commerce platform" \
  --language typescript \
  --framework nestjs \
  --output ./architecture

# Optimization
node src/bios/cli.js codex optimize ./src --auto-apply
```

## Usage Examples

### Example 1: Project Analysis

```javascript
import { GPT54CodexCLIClient } from './src/clients/codex/cli.js';

const client = new GPT54CodexCLIClient({
  enableReasoning: true
});

await client.initialize();

const result = await client.projectAnalyze('./src', {
  quick: false,
  deep: true
});

console.log(`Analyzed ${result.structure.stats.totalFiles} files`);
console.log('Languages:', result.structure.stats.languages);
console.log('Recommendations:', result.recommendations);

await client.disconnect();
```

### Example 2: Batch Refactoring

```javascript
import { glob } from 'glob';

const files = await glob('src/**/*.js');

const client = new GPT54CodexCLIClient();
await client.initialize();

// Progress tracking
client.on('batch:progress', ({ percentage }) => {
  process.stdout.write(`\rProgress: ${percentage}%`);
});

const result = await client.batchRefactor(
  files,
  {
    description: "Add error handling",
    instructions: "Wrap async functions in try-catch blocks"
  },
  {
    batchSize: 10,
    delay: 1000,
    dryRun: true  // Preview changes
  }
);

console.log(`\nProcessed: ${result.processed}/${result.total}`);
console.log(`Errors: ${result.errors}`);

await client.disconnect();
```

### Example 3: Architecture Generation

```javascript
const client = new GPT54CodexCLIClient();
await client.initialize();

const result = await client.generateArchitecture({
  description: `
    Real-time chat application with:
    - WebSocket support
    - Message persistence
    - User authentication
    - File attachments
  `,
  constraints: "Use Node.js, Redis, PostgreSQL",
  preferences: "Microservices architecture"
}, {
  outputPath: './generated-architecture'
});

console.log(`Generated ${result.components.length} components`);
console.log('Files:', result.files);

await client.disconnect();
```

## BIOS Integration

The client is fully integrated with the BIOS CLI:

```javascript
// src/bios/cli.js
import { GPT54CodexCLIClient } from '../clients/codex/cli.js';

// Added commands:
// - bios codex analyze [path]
// - bios codex refactor <pattern>
// - bios codex generate <spec>
// - bios codex optimize [path]
// - bios codex test [path]
// - bios codex docs [path]
// - bios codex status
```

## Configuration

### Access Model

GPT 5.4 Codex is accessed through a subscription-backed plan. No per-token or metered API billing is required.

### Environment Variables

```bash
# Optional
export CODEX_MODEL="gpt-5.4-codex"
export CODEX_REASONING_MODEL="o4-mini"
export CODEX_TIMEOUT="300000"
export CODEX_MAX_BATCH_SIZE="50"
```

### Configuration File

```json
{
  "codex": {
    "model": "gpt-5.4-codex",
    "reasoningModel": "o4-mini",
    "enableReasoning": true,
    "autoApprove": false,
    "maxBatchSize": 50,
    "timeout": 300000,
    "projectRoot": ".",
    "projectLanguage": "javascript"
  }
}
```

## Models

| Model | Context Window | Max Output | Best for |
|--------|---------------|------------|-----------|
| gpt-5.4-codex | 128K | 8192 | Code generation, analysis |
| gpt-5.4 | 128K | 4096 | General tasks |
| o4-mini | 200K | 8192 | Complex reasoning |
| o4-mini-high | 200K | 8192 | Deep analysis |

## Troubleshooting

### Error: CLI not found
```bash
# Install Codex CLI
npm install -g @openai/codex
```

### Error: Timeout
```javascript
const client = new GPT54CodexCLIClient({
  timeout: 600000  // 10 minutes for large projects
});
```

### Error: Rate limit
```javascript
const result = await client.batchRefactor(files, operation, {
  batchSize: 5,   // Fewer files per batch
  delay: 5000     // Longer delay between batches
});
```

## Security

- Use `--dry-run` before applying changes
- Review generated code before deploying
- Use `.gitignore` to exclude temporary files

## License

MIT License - see LICENSE file in the project root.
