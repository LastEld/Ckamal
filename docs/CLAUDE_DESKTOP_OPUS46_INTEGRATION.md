# Claude Desktop Integration - Anthropic Opus 4.6

> **All models are accessed through flat-rate subscriptions. No API billing applies.**

## Overview

Integration with the Claude Desktop application for working with the **Anthropic Opus 4.6** model with support for **1 million token context**.

## Features

### Core Features

- ✅ **1M Context Window** - up to 1,000,000 token context
- ✅ **Session-based Authentication** - secure session authentication
- ✅ **WebSocket Connection** - real-time via `ws://localhost:3456`
- ✅ **Streaming Responses** - streaming responses
- ✅ **File Upload** - file upload for analysis
- ✅ **Conversation History** - conversation history management
- ✅ **Auto-reconnect** - automatic reconnection

### Coding Tasks

- ✅ **Code Completion** - code completion
- ✅ **Code Review** - code review with scoring
- ✅ **Refactoring** - refactoring with explanation
- ✅ **Debug Assistance** - debugging assistance
- ✅ **Architecture Design** - architecture design

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CogniMesh System                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐      ┌──────────────────────────┐    │
│  │  Client Gateway  │◄────►│  ClaudeDesktopClient     │    │
│  │  (bios/)         │      │  (src/clients/claude/)   │    │
│  └──────────────────┘      └──────────────────────────┘    │
│           │                            │                    │
│           │                    WebSocket                    │
│           │                    (ws://localhost:3456)        │
│           │                            │                    │
│           │                    ┌───────────────┐            │
│           │                    │ Claude Desktop│            │
│           │                    │  Application  │            │
│           │                    └───────────────┘            │
│           │                            │                    │
│           └────────────────────────────┘                    │
│                  Anthropic Opus 4.6 API                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Installation and Setup

### Requirements

1. Claude Desktop application installed and running
2. API accessible on `localhost:3456`
3. Node.js 18+

### Client Setup

```javascript
import { ClaudeDesktopClient } from './src/clients/claude/desktop.js';

const client = new ClaudeDesktopClient({
  apiHost: 'localhost',          // API host
  apiPort: 3456,                 // API port
  autoReconnect: true,           // Auto-reconnect
  reconnectInterval: 5000,       // Reconnect interval (ms)
  maxReconnectAttempts: 10,      // Max attempts
  maxContextTokens: 1000000      // Max context tokens
});
```

## Usage

### Basic Usage

```javascript
import { ClaudeDesktopClient } from './src/clients/claude/desktop.js';

const client = new ClaudeDesktopClient();

// Initialize
await client.initialize();

// Send a message
const response = await client.send({
  content: 'Hello Claude!'
});

console.log(response.content);

// Disconnect
await client.disconnect();
```

### Streaming

```javascript
// Stream a response
await client.stream(
  { content: 'Write a story...' },
  (chunk) => {
    process.stdout.write(chunk); // Line-by-line output
  }
);
```

### File Upload

```javascript
// Upload a file
const result = await client.uploadFile('./path/to/file.js', {
  processImmediately: true,
  extractText: true
});

// Request file analysis
const analysis = await client.send({
  content: 'Please analyze the uploaded file.'
});
```

### Coding Tasks

#### Code Completion

```javascript
const result = await client.executeCodingTask('codeCompletion', {
  code: `function fibonacci(n) {
  // cursor here
}`,
  language: 'javascript',
  cursorPosition: 35
});
```

#### Code Review

```javascript
const review = await client.executeCodingTask('codeReview', {
  code: 'const x = 1;',
  language: 'javascript',
  focusAreas: ['performance', 'security', 'best practices']
});
```

#### Refactoring

```javascript
const refactored = await client.executeCodingTask('refactoring', {
  code: '// Your code here',
  language: 'javascript',
  goals: ['Apply SOLID principles', 'Improve readability']
});
```

#### Debug Assistance

```javascript
const debug = await client.executeCodingTask('debugAssistance', {
  code: '// Code with bug',
  language: 'javascript',
  error: 'TypeError: Cannot read property...',
  stackTrace: '...'
});
```

#### Architecture Design

```javascript
const architecture = await client.executeCodingTask('architectureDesign', {
  requirements: [
    'Real-time chat application',
    'Support 10,000 users',
    'End-to-end encryption'
  ],
  techStack: 'Node.js, Redis, PostgreSQL',
  scale: '10k concurrent users'
});
```

### Conversation History

```javascript
// Get history from server
const history = await client.getConversationHistory({
  limit: 100,
  offset: 0
});

// Get local history
const localHistory = client.getLocalHistory();

// Clear history
await client.clearHistory(true); // true = also on server
```

### Using the Client Gateway

```javascript
import { ClientGateway } from './src/bios/client-gateway.js';

const gateway = new ClientGateway({
  claude: {
    desktop: { apiPort: 3456 }
  }
});

await gateway.initialize();

// Send a message
const response = await gateway.sendToClient('claude', 'Hello!', {
  mode: 'desktop'
});

// Execute a coding task
const result = await gateway.executeCodingTask('codeReview', {
  code: 'const x = 1;',
  language: 'javascript'
});

// Streaming via gateway
await gateway.streamFromClient('claude',
  { content: 'Write code...' },
  (chunk) => process.stdout.write(chunk)
);

// Upload a file
await gateway.uploadFileToClient('claude', './file.js');

// Get history
const history = await gateway.getConversationHistory('claude');

await gateway.shutdown();
```

## API Reference

### ClaudeDesktopClient

#### Constructor

```javascript
new ClaudeDesktopClient(config)
```

**Config options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiHost` | string | 'localhost' | API host |
| `apiPort` | number | 3456 | API port |
| `wsUrl` | string | `ws://host:port` | WebSocket URL |
| `sessionId` | string | null | Session ID |
| `sessionToken` | string | null | Session token |
| `conversationId` | string | null | Conversation ID |
| `autoReconnect` | boolean | true | Auto-reconnect |
| `reconnectInterval` | number | 5000 | Reconnect interval (ms) |
| `maxReconnectAttempts` | number | 10 | Max attempts |
| `maxContextTokens` | number | 1000000 | Max tokens |

#### Methods

##### `async initialize()`
Initialize connection and authenticate.

##### `async send(message, options)`
Send a message.

**Parameters:**
- `message` - `{ content: string }`
- `options` - `{ maxTokens?, temperature?, streaming?, ... }`

##### `async execute(task, options)`
Execute a task.

**Parameters:**
- `task` - `{ type, description, code, files, ... }`
- `options` - Execution options

##### `async stream(request, callback)`
Stream a response.

**Parameters:**
- `request` - Request object
- `callback` - `(chunk) => void`

##### `async uploadFile(filePath, options)`
Upload a file.

**Parameters:**
- `filePath` - Path to file
- `options` - Upload options

##### `async getConversationHistory(options)`
Get conversation history.

##### `executeCodingTask(taskType, params)`
Execute a coding task.

**Task types:**
- `codeCompletion`
- `codeReview`
- `refactoring`
- `debugAssistance`
- `architectureDesign`

##### `getCapabilities()`
Get client capabilities.

##### `getContextUsage()`
Get context usage statistics.

##### `async ping()`
Check connection.

##### `async reconnect()`
Reconnect.

##### `async disconnect()`
Disconnect.

### Events

```javascript
client.on('ready', () => {});
client.on('authenticated', ({ sessionId }) => {});
client.on('conversationCreated', ({ conversationId }) => {});
client.on('disconnected', ({ code, reason }) => {});
client.on('reconnecting', () => {});
client.on('reconnected', () => {});
client.on('error', (error) => {});
client.on('health', (health) => {});
client.on('stream', (chunk) => {});
client.on('tokenUpdate', ({ tokens }) => {});
```

## BIOS Gateway Configuration

```javascript
// src/bios/client-gateway.js

const gateway = new ClientGateway({
  claude: {
    desktop: {
      apiHost: 'localhost',
      apiPort: 3456,
      autoReconnect: true,
      maxReconnectAttempts: 10
    },
    cli: false,  // Disable CLI client
    ide: false   // Disable IDE client
  },
  autoReconnect: true,
  healthCheckInterval: 30000
});
```

## Testing

```bash
# Run tests
npm test -- tests/clients/claude-desktop.test.js

# Run examples
node examples/claude-desktop-usage.js
```

## Troubleshooting

### Connection Error

```
Claude Desktop not running: connect ECONNREFUSED 127.0.0.1:3456
```

**Solution:** Make sure Claude Desktop is running and the API is accessible.

### Authentication Timeout

```
Authentication timeout
```

**Solution:** Check the Claude Desktop settings; you may need to enable the API.

### WebSocket Error

```
WebSocket connection timeout
```

**Solution:** Make sure the WebSocket server is running on the specified port.

## Comparison with Other Clients

| Feature | Desktop | CLI | IDE |
|---------|---------|-----|-----|
| Context Window | 1M | 1M | 1M |
| WebSocket | ✅ | ❌ | ❌ |
| Streaming | ✅ | ❌ | ❌ |
| File Upload | ✅ | ⚠️ | ⚠️ |
| Session Mgmt | ✅ | ❌ | ❌ |
| Auto-reconnect | ✅ | ❌ | ❌ |
| Coding Tasks | ✅ | ✅ | ✅ |

## Changelog

### v4.6.0 (Current)
- Anthropic Opus 4.6 support
- 1M context window
- Session-based authentication
- WebSocket streaming
- File upload support
- Coding tasks integration
- Auto-reconnect

## License

MIT License - part of the CogniMesh project.
