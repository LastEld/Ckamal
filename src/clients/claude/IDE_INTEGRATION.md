# Claude VS Code Integration

## Overview

`ClaudeVSCodeClient` is the canonical Claude editor surface on the active release path.

Import path:

```javascript
import { ClaudeVSCodeClient } from './src/clients/claude/vscode.js';
```

This client is designed for subscription-backed local VS Code usage, not for API-first fallback behavior.

## Core Capabilities

- inline completion
- hover information
- code actions
- refactoring hooks
- document synchronization
- workspace-aware editor context

## Basic Usage

```javascript
const client = new ClaudeVSCodeClient({
  port: 16100,
  rootUri: 'file:///workspace',
  workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }]
});

await client.initialize();

await client.openDocument(
  'file:///workspace/src/app.js',
  'javascript',
  1,
  'const app = createApp();'
);

const completions = await client.inlineCompletion(
  { uri: 'file:///workspace/src/app.js', languageId: 'javascript' },
  { line: 0, character: 24 }
);

await client.disconnect();
```

## Release Truth

- The file is `vscode.js`, not `ide.js`.
- The legacy `Ide` client class is not part of the canonical public surface anymore.
- BIOS routing should target `claude:vscode`.
- Cross-provider fallback is handled by `src/bios/client-gateway.js` and `src/router/subscription-runtime.js`.
