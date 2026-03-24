# Multi-Client Examples

This directory contains examples demonstrating how to use multiple AI clients in CogniMesh.

## Files

- `unified-client.js` - Comprehensive examples for all client types
- `claude-example.js` - Claude-specific examples
- `codex-example.js` - Codex-specific examples  
- `kimi-example.js` - Kimi-specific examples
- `chain-execution.js` - Chaining multiple clients together

## Running Examples

### Prerequisites

Set up environment variables:

```bash
# Claude (Anthropic)
export ANTHROPIC_API_KEY=sk-ant-...

# Kimi (Moonshot)
export MOONSHOT_API_KEY=sk-...

# Codex (OpenAI)
export OPENAI_API_KEY=sk-...
```

### Run Unified Example

```bash
node examples/04-multi-client/unified-client.js
```

### Run Individual Examples

```bash
# Claude MCP example
node examples/04-multi-client/claude-example.js

# Kimi Swarm example
node examples/04-multi-client/kimi-example.js

# Codex CLI example
node examples/04-multi-client/codex-example.js

# Chain execution
node examples/04-multi-client/chain-execution.js
```

## Client Comparison

| Feature | Claude MCP | Kimi Swarm | Codex CLI |
|---------|------------|------------|-----------|
| **Provider** | Anthropic | Moonshot | OpenAI |
| **Best For** | Complex reasoning | Parallel execution | Code generation |
| **Context Window** | 200K | 256K | 128K |
| **Unique Features** | Tools, Vision | Multi-agent | Inline completion |
| **Mode** | MCP Protocol | Swarm | CLI/API |

## Quick Start

```javascript
import { ClaudeMcpClient, KimiSwarmClient, CodexCliClient } from './src/clients/index.js';

// Initialize clients
const claude = new ClaudeMcpClient({ apiKey: process.env.ANTHROPIC_API_KEY });
const kimi = new KimiSwarmClient({ apiKey: process.env.MOONSHOT_API_KEY });
const codex = new CodexCliClient({ apiKey: process.env.OPENAI_API_KEY });

// Use them
await claude.initialize();
await kimi.initialize();
await codex.initialize();

// Send messages
const r1 = await claude.send({ content: 'Hello Claude!' });
const r2 = await kimi.send({ content: 'Hello Kimi!' });
const r3 = await codex.send({ content: 'Hello Codex!' });
```

## Error Handling

All clients implement consistent error handling:

```javascript
try {
  await client.initialize();
  const result = await client.send({ content: 'Hello' });
} catch (error) {
  if (error.message.includes('not connected')) {
    await client.reconnect();
  }
}
```

## Health Monitoring

```javascript
// Check client status
const status = client.getStatus();
console.log('Connected:', status.health.connected);
console.log('Latency:', status.latency);

// Ping test
const latency = await client.ping();
console.log(`Ping: ${latency}ms`);
```
