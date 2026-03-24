# Clients Module Contract

## Overview

The Clients Module provides client implementations for various AI platforms including Claude, Codex, and Kimi. It offers standardized interfaces for CLI, IDE, Desktop, and MCP (Model Context Protocol) integrations.

## Public Interfaces

### Claude Clients

#### ClaudeCliClient

Command-line interface client for Claude.

```javascript
import { ClaudeCliClient } from './clients/claude/index.js';

const cli = new ClaudeCliClient({
  sessionToken: process.env.CLAUDE_SESSION_TOKEN
});
```

**Methods:**

- `constructor(options)` - Creates CLI client
  - `options.sessionToken` - Claude session token
  - `options.outputFormat` - Output format ('text', 'json', 'markdown')

- `send(prompt, options)` - Sends prompt via CLI
  - `prompt` (string) - Input prompt
  - `options.model` - Model to use
  - `options.system` - System prompt
  - Returns: Promise<string>

- `stream(prompt, callback)` - Streams response
  - `callback(chunk)` - Called for each chunk
  - Returns: Promise<void>

- `setContext(context)` - Sets conversation context
  - `context` (string) - Context text

- `clearContext()` - Clears current context

#### ClaudeDesktopClient

Desktop application integration client.

- `constructor(options)` - Creates desktop client
  - `options.appPath` - Path to Claude desktop app
  - `options.autoLaunch` - Auto-launch app

- `isAppRunning()` - Checks if desktop app is running
  - Returns: Promise<boolean>

- `sendMessage(message)` - Sends message to desktop app
  - Returns: Promise<Response>

- `getConversations()` - Gets conversation list
  - Returns: Promise<Conversation[]>

- `openConversation(id)` - Opens specific conversation
  - Returns: Promise<void>

#### ClaudeIdeClient

IDE integration client (VS Code, etc.).

- `constructor(options)` - Creates IDE client
  - `options.ide` - IDE type ('vscode', 'jetbrains')
  - `options.extensionId` - Extension identifier

- `sendSelection(selection)` - Sends selected code
  - Returns: Promise<Response>

- `explainCode(code)` - Explains provided code
  - Returns: Promise<string>

- `refactorCode(code, instructions)` - Refactors code
  - Returns: Promise<string>

- `generateDocs(code)` - Generates documentation
  - Returns: Promise<string>

#### ClaudeMcpClient

Model Context Protocol client.

- `constructor(options)` - Creates MCP client
  - `options.serverUrl` - MCP server URL
  - `options.capabilities` - Client capabilities

- `connect()` - Connects to MCP server
  - Returns: Promise<void>

- `initialize()` - Initializes MCP session
  - Returns: Promise<InitializeResult>

- `listTools()` - Lists available tools
  - Returns: Promise<Tool[]>

- `callTool(name, params)` - Calls MCP tool
  - Returns: Promise<ToolResult>

- `listResources()` - Lists available resources
  - Returns: Promise<Resource[]>

- `readResource(uri)` - Reads resource
  - Returns: Promise<ResourceContent>

### Codex Clients

#### CodexCliClient

CLI client for OpenAI Codex.

- `constructor(options)` - Creates Codex CLI client
  - `options.apiKey` - OpenAI API key

- `complete(prompt, options)` - Gets completion
  - Returns: Promise<Completion>

- `edit(instruction, code)` - Edits code
  - Returns: Promise<string>

#### CodexCopilotClient

GitHub Copilot integration.

- `constructor(options)` - Creates Copilot client
  - `options.token` - GitHub token

- `getSuggestions(context)` - Gets code suggestions
  - Returns: Promise<Suggestion[]>

- `acceptSuggestion(id)` - Accepts suggestion
  - Returns: Promise<void>

#### CodexCursorClient

Cursor IDE integration.

- `constructor(options)` - Creates Cursor client
  - `options.cursorPath` - Cursor installation path

- `chat(message)` - Sends chat message
  - Returns: Promise<string>

- `cmdK(prompt)` - Uses Cmd+K feature
  - Returns: Promise<string>

### Kimi Clients

#### KimiCliClient

CLI client for Moonshot Kimi.

- `constructor(options)` - Creates Kimi CLI client
  - `options.apiKey` - Moonshot API key

- `chat(message, options)` - Sends chat message
  - Returns: Promise<string>

- `uploadFile(filePath)` - Uploads file
  - Returns: Promise<FileInfo>

#### KimiIdeClient

IDE integration for Kimi.

- `constructor(options)` - Creates IDE client
  - `options.ide` - IDE type

- `inlineComplete(code)` - Gets inline completion
  - Returns: Promise<string>

- `explainSelection()` - Explains selected code
  - Returns: Promise<string>

#### KimiSwarmClient

Kimi Swarm API client.

- `constructor(options)` - Creates Swarm client
  - `options.apiKey` - API key
  - `options.swarmId` - Swarm identifier

- `createSwarm(config)` - Creates agent swarm
  - Returns: Promise<Swarm>

- `executeTask(task)` - Executes task with swarm
  - Returns: Promise<SwarmResult>

- `getSwarmStatus(id)` - Gets swarm status
  - Returns: Promise<SwarmStatus>

## Data Structures

### Conversation

```typescript
interface Conversation {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}
```

### Completion

```typescript
interface Completion {
  id: string;
  text: string;
  finishReason: string;
  usage: TokenUsage;
}
```

### Suggestion

```typescript
interface Suggestion {
  id: string;
  text: string;
  confidence: number;
  range: { start: number; end: number };
}
```

### MCP Tool

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}
```

### MCP Resource

```typescript
interface Resource {
  uri: string;
  name: string;
  mimeType: string;
}
```

### Swarm

```typescript
interface Swarm {
  id: string;
  agents: Agent[];
  status: 'idle' | 'working' | 'completed' | 'error';
}
```

### SwarmResult

```typescript
interface SwarmResult {
  taskId: string;
  output: string;
  agentOutputs: Record<string, string>;
  completedAt: string;
}
```

## Events

The Clients module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `message:sent` | `{ client, message }` | Message sent |
| `message:received` | `{ client, response }` | Response received |
| `connected` | `{ client }` | Client connected |
| `disconnected` | `{ client, reason }` | Client disconnected |
| `error` | `{ client, error }` | Client error |
| `suggestion:received` | `{ suggestions }` | Code suggestion received |
| `tool:called` | `{ tool, params, result }` | MCP tool called |

## Error Handling

### ClientError

Base error for client operations.

### AuthenticationError

Thrown when authentication fails.

### ConnectionError

Thrown when connection fails.

### TimeoutError

Thrown when request times out.

### McpError

Thrown for MCP-specific errors.

### SwarmError

Thrown for swarm operation errors.

## Usage Example

```javascript
import { ClaudeCliClient, CodexCliClient } from './clients/index.js';

// Claude CLI
const claude = new ClaudeCliClient({
  sessionToken: process.env.CLAUDE_SESSION_TOKEN
});

const response = await claude.send('Explain TypeScript generics');

// Codex CLI
const codex = new CodexCliClient({
  apiKey: process.env.OPENAI_API_KEY
});

const completion = await codex.complete('function fibonacci(n) {');
```
