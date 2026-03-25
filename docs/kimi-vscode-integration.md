# Kimi 2.5 VSCode Integration

> **All models are accessed through flat-rate subscriptions. No API billing applies.**

## Overview

The `KimiVSCodeClient` provides advanced IDE integration for Kimi 2.5 with 256K context window support, enabling powerful AI-assisted coding features directly within VSCode.

## Features

### Core IDE Features

- **Inline Completion** - Real-time code suggestions at cursor position
- **Explain Selection** - Detailed explanation of selected code
- **Generate Tests** - Automatic test generation with framework detection
- **Optimize Performance** - Performance analysis and optimization suggestions
- **Security Audit** - Security vulnerability detection and fixes

### Kimi-Specific Features

- **256K Context Window** - Extended context for large codebases
- **File Tree Analysis** - Project structure understanding
- **Cross-File References** - Multi-file code relationships
- **Bilingual Support** - Chinese/English language support

### CogniMesh Integration

- **Task Creation** - Create CogniMesh tasks from code
- **Roadmap Integration** - Sync with project roadmaps
- **GSD Workflow** - Get Shit Done workflow support

## Configuration

```javascript
import { KimiVSCodeClient } from './src/clients/kimi/vscode.js';

const client = new KimiVSCodeClient({
  port: 18123,              // TCP socket port (default: 18123)
  host: 'localhost',        // Host address (default: localhost)
  language: 'auto',         // Language: 'zh', 'en', or 'auto'
  cogniMeshEnabled: true,   // Enable CogniMesh integration
  workspaceRoot: process.cwd() // Workspace root path
});

await client.initialize();
```

## Usage Examples

### Inline Completion

```javascript
const completion = await client.inlineCompletion(
  {
    uri: 'file:///path/to/file.js',
    languageId: 'javascript',
    content: fileContent
  },
  { line: 10, character: 15 },
  { maxLines: 5, temperature: 0.2 }
);
```

### Explain Selection

```javascript
const explanation = await client.explainSelection(
  { uri: 'file:///path/to/file.js', languageId: 'javascript' },
  {
    start: { line: 10, character: 0 },
    end: { line: 20, character: 0 },
    text: selectedCode
  },
  { detail: 'comprehensive', language: 'zh' }
);
```

### Generate Tests

```javascript
const tests = await client.generateTests(
  {
    uri: 'file:///path/to/module.js',
    languageId: 'javascript',
    content: fileContent
  },
  {
    framework: 'jest',
    coverage: 'comprehensive',
    includeMocks: true
  }
);
```

### Performance Optimization

```javascript
const optimization = await client.optimizePerformance(
  codeToOptimize,
  {
    languageId: 'javascript',
    focus: ['time', 'memory'],
    explainChanges: true
  }
);
```

### Security Audit

```javascript
const audit = await client.securityAudit(
  codeToAudit,
  {
    languageId: 'javascript',
    severity: 'all',
    includeFixes: true
  }
);
```

### CogniMesh Task Creation

```javascript
const task = await client.createCogniMeshTask(
  {
    title: 'Refactor authentication',
    description: 'Improve security in auth module',
    code: authCode,
    filePath: '/src/auth.js',
    priority: 'high',
    tags: ['security', 'refactoring']
  },
  { createRoadmap: true, gsdWorkflow: true }
);
```

## TCP Socket Protocol

The client communicates with the Kimi VSCode extension via TCP socket on port 18123.

### Message Format

```json
{
  "id": 1,
  "type": "chat|inlineCompletion|explain|generateTests|optimize|securityAudit",
  "content": "...",
  "options": {}
}
```

### Response Format

```json
{
  "id": 1,
  "content": "...",
  "error": null
}
```

## Error Handling

```javascript
client.on('error', (error) => {
  console.error('Kimi client error:', error);
});

client.on('disconnected', () => {
  console.log('Kimi extension disconnected');
});

// Automatic reconnection
await client.reconnect();
```

## Legacy Support

The legacy Ide client class is deprecated. Use `KimiVSCodeClient` from `vscode.js` for all implementations.

```javascript
import { KimiVSCodeClient } from './src/clients/kimi/vscode.js';
```

## Testing

```bash
# Run unit tests
node --test tests/unit/kimi/vscode-client.test.js
```
