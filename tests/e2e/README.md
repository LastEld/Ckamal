# CogniMesh E2E Test Suite

## Overview

End-to-end (E2E) test suite for CogniMesh v5.0, covering complete user workflows and integration scenarios across all system components.

## Test Structure

```
tests/e2e/
├── README.md           # This documentation
├── setup.js            # E2E test setup and utilities
├── flows.spec.js       # Core business flows (Tasks, Roadmaps)
└── clients.spec.js     # Client integration tests
```

## Test Categories

### 1. Task Management Flow (`flows.spec.js`)

Tests the complete task lifecycle:

- **Create Task**: Create tasks with different priorities and quadrants
- **Update Task**: Modify task status and properties
- **Batch Operations**: Create multiple tasks at once
- **Eisenhower Matrix**: Organize tasks by quadrants
- **Complete Workflow**: Full lifecycle from creation to completion

### 2. Roadmap Flow (`flows.spec.js`)

Tests learning path and roadmap functionality:

- **Create Roadmap**: Create roadmaps with nodes and edges
- **Track Progress**: Update and retrieve progress for roadmap nodes
- **Generate Path**: Create personalized learning paths
- **Validate Roadmap**: Check roadmap structure integrity
- **Repair Roadmap**: Fix issues in roadmap structure

### 3. Client Integration (`clients.spec.js`)

Tests all AI provider clients:

#### Claude Clients
- `ClaudeCliClient` - CLI integration with Sonnet 4.6
- `ClaudeDesktopClient` - Desktop app integration
- Features: code analysis, generation, review, batch processing

#### Kimi Clients
- `KimiCliClient` - CLI integration with 256K context
- `KimiSwarmClient` - Swarm orchestration
- Features: long context, thinking mode, multimodal

#### Codex Clients
- `CodexCliClient` - Dual-mode GPT 5.3/5.4 support
- Features: auto model selection, cost tracking, batch operations

## Running Tests

### Run All E2E Tests
```bash
npm run test:e2e
```

### Run Specific Test File
```bash
jest tests/e2e/flows.spec.js
jest tests/e2e/clients.spec.js
```

### Run with Coverage
```bash
jest tests/e2e --coverage
```

### Run in Watch Mode
```bash
jest tests/e2e --watch
```

## Environment Variables

Required environment variables for full client testing:

```bash
# Claude (Anthropic)
ANTHROPIC_API_KEY=sk-ant-...

# Kimi (Moonshot AI)
MOONSHOT_API_KEY=sk-...

# Codex (OpenAI)
OPENAI_API_KEY=sk-...
```

Tests will run in mock mode if API keys are not provided.

## Test Configuration

### Default Timeouts
- **Setup**: 60 seconds
- **Test Case**: 30 seconds
- **Teardown**: 30 seconds

### Server Configuration
- **Port**: Random available port (0)
- **Environment**: `test`
- **Diagnostics**: Skipped for faster startup

## Utilities

### `setup.js` - Test Utilities

```javascript
import { 
  setupE2E, 
  teardownE2E, 
  createAuthenticatedClient,
  createTestData 
} from './setup.js';

// Setup test environment
const { server, baseUrl, authToken } = await setupE2E();

// Create authenticated client
const client = createAuthenticatedClient(baseUrl, authToken);

// Use test data helpers
const testData = createTestData(client);
const { task } = await testData.createTask({ title: 'Test' });
```

## Writing New E2E Tests

### Basic Test Structure

```javascript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { CogniMeshServer } from '../../src/server.js';

describe('My Feature', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = new CogniMeshServer({ port: 0 });
    await server.initialize();
    await server.start();
    baseUrl = `http://localhost:${server.port}`;
  }, 60000);

  afterAll(async () => {
    await server.stop();
  }, 30000);

  it('should do something', async () => {
    // Your test code
  }, 30000);
});
```

### Best Practices

1. **Use unique test data**: Prefix test data with test identifier
2. **Clean up after tests**: Remove created resources in `afterAll`
3. **Handle timeouts**: Set appropriate timeouts for long operations
4. **Mock external APIs**: Don't rely on external services in CI
5. **Test isolation**: Each test should be independent

## CI Integration

GitHub Actions workflow:

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run test:e2e
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          MOONSHOT_API_KEY: ${{ secrets.MOONSHOT_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Troubleshooting

### Common Issues

1. **Port already in use**: Server uses random port - should auto-resolve
2. **Database locked**: Ensure no other tests are running
3. **Timeout errors**: Increase timeout for slow operations
4. **API rate limits**: Use mock mode for CI/CD

### Debug Mode

```bash
# Run with debug output
DEBUG=cognimesh:* npm run test:e2e

# Run specific test with verbose output
jest tests/e2e/flows.spec.js -t "should create task" --verbose
```

## Coverage Report

E2E tests cover:

- ✅ Task Management API
- ✅ Roadmap API
- ✅ Client Authentication
- ✅ Client Capabilities
- ✅ Business Logic Flows
- ✅ Error Handling
- ✅ Edge Cases

## Maintenance

- Update tests when API changes
- Add tests for new features
- Keep test data realistic
- Document complex test scenarios
