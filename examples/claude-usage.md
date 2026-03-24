# Claude Sonnet 4.6 CLI Integration Examples

## Basic Usage

### Interactive Chat
```bash
# Start interactive session
bios claude chat

# With specific model
bios claude chat --model claude-opus-4

# Without conversation history
bios claude chat --no-history
```

### Code Analysis
```bash
# Analyze a file
bios claude analyze src/utils/helpers.js

# With focus areas
bios claude analyze src/api/routes.ts --focus "security,performance"

# Using Opus for deep analysis
bios claude analyze src/core/engine.js --model claude-opus-4
```

### Code Generation
```bash
# Generate a function
bios claude generate "Create a Redis cache wrapper with TTL support" --language typescript

# With specific requirements
bios claude generate "Build a JWT authentication middleware" \
  --language javascript \
  --requirements "Support refresh tokens, role-based access, error handling"
```

### Code Review
```bash
# Review a file
bios claude review src/services/payment.js

# Strict review mode
bios claude review src/auth/login.ts --strict
```

### Code Explanation
```bash
# Explain for intermediate level (default)
bios claude explain src/algorithms/sort.js

# Explain for beginners
bios claude explain src/algorithms/sort.js --level beginner

# Expert level with specific questions
bios claude explain src/algorithms/sort.js \
  --level expert \
  --questions "What is the time complexity? How does it compare to quicksort?"
```

### Batch Processing
```bash
# Process multiple tasks
bios claude batch --file tasks.json

# With concurrency
bios claude batch --file tasks.json --concurrency 2 --delay 2000
```

### Check Status
```bash
bios claude status
```

## API Key Configuration

### Via Environment Variable
```bash
export ANTHROPIC_API_KEY="sk-ant-xxxxx"
bios claude chat
```

### Via Command Option
```bash
bios claude analyze file.js --api-key "sk-ant-xxxxx"
```

## Programmatic Usage

```javascript
import { ClaudeCliClient } from './src/clients/claude/cli.js';

const client = new ClaudeCliClient({
  model: 'claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY
});

await client.initialize();

// Analyze code
const analysis = await client.codeAnalyze('./src/app.js');
console.log(analysis.content);

// Generate code
const generated = await client.codeGenerate(
  'Create a pagination helper',
  'typescript'
);
console.log(generated.content);

// Multi-file analysis
const multiAnalysis = await client.analyzeMultipleFiles([
  './src/config.js',
  './src/routes.js',
  './src/models.js'
]);

// Batch processing
const batchResults = await client.batchProcess([
  { description: 'Task 1', code: '...' },
  { description: 'Task 2', code: '...' }
], { concurrency: 2 });
```

## Features

- **200K Context Window**: Process large codebases
- **Multi-file Analysis**: Analyze related files together
- **Git Integration**: Automatic diff detection for reviews
- **Project Context**: Load and use project-wide context
- **Interactive Mode**: Conversational coding assistant
- **Batch Processing**: Efficient multi-task execution
