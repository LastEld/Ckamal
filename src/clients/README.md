# Clients Module

## Overview

The Clients Module provides standardized client implementations for multiple AI platforms including Claude (Anthropic), Codex (OpenAI), and Kimi (Moonshot). It supports various integration types including CLI tools, IDE plugins, desktop applications, and MCP (Model Context Protocol) servers.

## Architecture

### Platform Structure

```
clients/
├── claude/         # Anthropic Claude clients
│   ├── cli.js      # Command-line interface
│   ├── desktop.js  # Desktop app integration
│   ├── ide.js      # IDE plugins
│   └── mcp.js      # MCP protocol client
├── codex/          # OpenAI Codex clients
│   ├── cli.js      # Command-line interface
│   ├── copilot.js  # GitHub Copilot
│   └── cursor.js   # Cursor IDE
└── kimi/           # Moonshot Kimi clients
    ├── cli.js      # Command-line interface
    ├── ide.js      # IDE integration
    └── swarm.js    # Kimi Swarm API
```

### Integration Patterns

```
┌─────────────────────────────────────────────────────────┐
│                    Client Interface                      │
├──────────────┬─────────────────┬────────────────────────┤
│   Claude     │     Codex       │        Kimi            │
├──────────────┼─────────────────┼────────────────────────┤
│ CLI          │ CLI             │ CLI                    │
│ Desktop      │ Copilot         │ IDE                    │
│ IDE          │ Cursor          │ Swarm                  │
│ MCP          │                 │                        │
└──────────────┴─────────────────┴────────────────────────┘
```

## Components

### Claude Clients

**CLI Client**
- Terminal-based interaction
- Scriptable automation
- Context management
- Output formatting options

**Desktop Client**
- Claude desktop app control
- Conversation management
- Window automation
- File attachment support

**IDE Client**
- VS Code integration
- JetBrains plugin support
- Code selection handling
- Inline completions

**MCP Client**
- Model Context Protocol support
- Tool invocation
- Resource access
- Capability negotiation

### Codex Clients

**CLI Client**
- OpenAI API integration
- Code completion
- Code editing
- File handling

**Copilot Client**
- GitHub Copilot API
- Suggestion management
- Acceptance tracking
- Context awareness

**Cursor Client**
- Cursor IDE integration
- Chat interface
- Cmd+K commands
- Composer features

### Kimi Clients

**CLI Client**
- Moonshot API integration
- Chat completions
- File uploads
- Long context handling

**IDE Client**
- Inline completions
- Code explanation
- Documentation generation
- Refactoring assistance

**Swarm Client**
- Multi-agent orchestration
- Task distribution
- Result aggregation
- Agent management

## Usage

### Claude CLI

```javascript
import { ClaudeCliClient } from './clients/claude/index.js';

const cli = new ClaudeCliClient({
  sessionToken: process.env.CLAUDE_SESSION_TOKEN,
  outputFormat: 'markdown'
});

// Simple prompt
const response = await cli.send('What is the capital of France?');
console.log(response);

// With options
const codeReview = await cli.send(code, {
  model: 'claude-3-sonnet-20240229',
  system: 'You are a code reviewer. Review the following code.'
});

// Streaming
await cli.stream('Write a story', (chunk) => {
  process.stdout.write(chunk);
});
```

### Claude Desktop

```javascript
import { ClaudeDesktopClient } from './clients/claude/index.js';

const desktop = new ClaudeDesktopClient({
  autoLaunch: true
});

// Check if running
if (await desktop.isAppRunning()) {
  // Send message
  await desktop.sendMessage('Analyze this document');
  
  // Get conversations
  const conversations = await desktop.getConversations();
  
  // Open specific conversation
  await desktop.openConversation(conversations[0].id);
}
```

### Claude IDE

```javascript
import { ClaudeIdeClient } from './clients/claude/index.js';

const ide = new ClaudeIdeClient({
  ide: 'vscode'
});

// Explain selected code
const selectedCode = getEditorSelection();
const explanation = await ide.explainCode(selectedCode);

// Refactor code
const refactored = await ide.refactorCode(selectedCode, [
  'Use async/await instead of callbacks',
  'Add error handling'
]);

// Generate documentation
const docs = await ide.generateDocs(selectedCode);
```

### MCP Client

```javascript
import { ClaudeMcpClient } from './clients/claude/index.js';

const mcp = new ClaudeMcpClient({
  serverUrl: 'http://localhost:3000/mcp'
});

// Connect and initialize
await mcp.connect();
await mcp.initialize();

// List available tools
const tools = await mcp.listTools();
console.log('Available tools:', tools.map(t => t.name));

// Call a tool
const result = await mcp.callTool('search_code', {
  query: 'function authenticate'
});

// Read resources
const resources = await mcp.listResources();
const content = await mcp.readResource(resources[0].uri);
```

### Codex CLI

```javascript
import { CodexCliClient } from './clients/codex/index.js';

const codex = new CodexCliClient({
  apiKey: process.env.OPENAI_API_KEY
});

// Code completion
const completion = await codex.complete('function quicksort(arr) {', {
  maxTokens: 500,
  temperature: 0.2
});

// Code editing
const edited = await codex.edit(
  'Add error handling',
  'function divide(a, b) { return a / b; }'
);
```

### Kimi CLI

```javascript
import { KimiCliClient } from './clients/kimi/index.js';

const kimi = new KimiCliClient({
  apiKey: process.env.MOONSHOT_API_KEY
});

// Chat with long context
const response = await kimi.chat(longDocument, {
  model: 'kimi-latest',
  maxTokens: 4096
});

// Upload file
const fileInfo = await kimi.uploadFile('./document.pdf');

// Reference uploaded file
const analysis = await kimi.chat('Summarize the uploaded document', {
  fileIds: [fileInfo.id]
});
```

### Kimi Swarm

```javascript
import { KimiSwarmClient } from './clients/kimi/index.js';

const swarm = new KimiSwarmClient({
  apiKey: process.env.MOONSHOT_API_KEY
});

// Create multi-agent swarm
const agentSwarm = await swarm.createSwarm({
  agents: [
    { role: 'researcher', capabilities: ['search', 'summarize'] },
    { role: 'writer', capabilities: ['compose', 'edit'] },
    { role: 'reviewer', capabilities: ['review', 'suggest'] }
  ]
});

// Execute complex task
const result = await swarm.executeTask({
  description: 'Research and write a report on AI trends',
  steps: ['research', 'draft', 'review']
});
```

## Configuration

### Claude Configuration

```javascript
{
  sessionToken: 'sk-ant-...',
  organizationId: 'org-...',
  outputFormat: 'markdown',  // 'text', 'json', 'markdown'
  model: 'claude-3-sonnet-20240229',
  maxTokens: 4096,
  temperature: 1.0
}
```

### Codex Configuration

```javascript
{
  apiKey: 'sk-...',
  model: 'gpt-4o',
  maxTokens: 4096,
  temperature: 0.2,  // Lower for code
  topP: 1
}
```

### Kimi Configuration

```javascript
{
  apiKey: 'sk-...',
  model: 'kimi-latest',
  maxTokens: 8192,   // Kimi supports long context
  temperature: 0.7
}
```

### MCP Configuration

```javascript
{
  serverUrl: 'http://localhost:3000/mcp',
  capabilities: {
    tools: { listChanged: true },
    resources: { subscribe: true },
    prompts: { listChanged: true }
  },
  timeout: 30000
}
```

### Swarm Configuration

```javascript
{
  apiKey: 'sk-...',
  maxAgents: 10,
  coordinationStrategy: 'parallel',  // 'parallel' | 'sequential' | 'hierarchical'
  timeout: 300000  // 5 minutes
}
```

## Best Practices

1. **Secure Credentials**: Store API keys in environment variables
2. **Handle Rate Limits**: Implement retry logic with exponential backoff
3. **Context Management**: Maintain conversation context appropriately
4. **Error Handling**: Handle platform-specific errors gracefully
5. **Token Management**: Monitor and optimize token usage
6. **Platform Selection**: Choose appropriate platform for use case
7. **Fallback Strategy**: Implement fallback to alternative platforms
8. **Test Integration**: Test client integration thoroughly
