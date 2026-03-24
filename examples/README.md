# CogniMesh v5.0 Examples

> Comprehensive examples demonstrating the CogniMesh BIOS multi-agent orchestration system.

## Quick Navigation

| Example | Difficulty | Topics Covered | Estimated Time |
|---------|------------|----------------|----------------|
| [01-hello-world](./01-hello-world/) | ⭐ Beginner | BIOS initialization, basic boot | 5 min |
| [02-basic-usage](./02-basic-usage/) | ⭐ Beginner | Server setup, tool execution | 10 min |
| [03-agent-orchestration](./03-agent-orchestration/) | ⭐⭐ Intermediate | Agent spawning, delegation, parallel execution | 15 min |
| [04-multi-client](./04-multi-client/) | ⭐⭐ Intermediate | Multi-client coordination (Claude, Kimi, Codex) | 15 min |
| [05-bios-console](./05-bios-console/) | ⭐⭐ Intermediate | Interactive console commands | 10 min |
| [06-auto-updates](./06-auto-updates/) | ⭐⭐⭐ Advanced | Update management, versioning | 15 min |
| [07-custom-agents](./07-custom-agents/) | ⭐⭐⭐ Advanced | Custom CV creation, agent types | 20 min |
| [08-advanced](./08-advanced/) | ⭐⭐⭐⭐ Expert | Custom middleware, event handling | 25 min |

## Prerequisites

All examples assume you have:

1. **Node.js 18+** installed
2. **CogniMesh v5.0** dependencies installed (`npm install`)
3. **Environment variables** configured (see individual examples)

```bash
# Install dependencies
npm install

# Set required environment variable
export GITHUB_TOKEN="your_github_token_here"

# Or copy example environment file
cp .env.example .env
# Edit .env with your configuration
```

## Running Examples

Each example can be run independently:

```bash
# Navigate to example directory
cd examples/01-hello-world

# Run the example
node hello.js

# Or run with debugging
DEBUG=cognimesh:* node hello.js
```

## Example Structure

Each example follows a consistent structure:

```
XX-example-name/
├── README.md           # Detailed explanation
├── *.js                # Runnable code files
└── package.json        # (if additional deps needed)
```

## Learning Path

### For Beginners
Start with examples 01 and 02 to understand the basics of BIOS initialization and server setup.

### For Intermediate Users
Progress through examples 03-05 to learn agent orchestration, multi-client coordination, and console management.

### For Advanced Users
Explore examples 06-08 to master auto-updates, custom agents, and advanced system integration.

## Common Patterns

### Pattern 1: BIOS Boot Sequence
```javascript
import { CogniMeshBIOS } from '../src/bios/index.js';

const bios = new CogniMeshBIOS();
await bios.boot();
console.log('BIOS State:', bios.state);
```

### Pattern 2: Server Initialization
```javascript
import { CogniMeshServer } from '../src/server.js';

const server = new CogniMeshServer();
await server.initialize();
await server.start();
```

### Pattern 3: Tool Execution
```javascript
const result = await server.tools.execute('system_health', {
  detailed: true
});
```

## Troubleshooting

### Common Issues

1. **BIOS Boot Fails**
   - Check GITHUB_TOKEN is set
   - Verify database directory is writable

2. **Port Already in Use**
   - Change port in configuration or kill existing process

3. **Module Not Found**
   - Ensure you're running from project root
   - Check that `npm install` completed successfully

## Contributing

When adding new examples:

1. Follow the numbering convention (next available number)
2. Include comprehensive README.md
3. Add inline comments explaining key concepts
4. Show expected output
5. Test on clean environment

## License

MIT © CogniMesh Systems
