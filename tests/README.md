# CogniMesh v5.0 Testing Guide

## Testing Philosophy

CogniMesh follows a comprehensive testing strategy with three layers:

1. **Unit Tests** - Fast, isolated tests for individual modules
2. **Integration Tests** - Cross-module and API endpoint testing
3. **E2E Tests** - Full workflow and user journey validation

### Principles

- **Test behavior, not implementation** - Focus on what code does, not how
- **Arrange-Act-Assert** - Clear structure for all tests
- **One assertion per concept** - Keep tests focused and readable
- **Fast feedback** - Unit tests should run in milliseconds
- **Deterministic** - Same input always produces same output

## Running Tests

### Prerequisites

```bash
# Ensure Node.js 20+ is installed
node --version

# Install dependencies (if package.json exists)
npm install
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Categories

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Specific file
node --test tests/unit/bios/bios.test.js
```

### Run with Coverage

```bash
npm run test:coverage
```

### Watch Mode

```bash
npm run test:watch
```

### Debug Mode

```bash
node --test --inspect-brk tests/unit/bios/bios.test.js
```

## Writing Tests

### File Naming

- Unit tests: `{module}.test.js`
- Integration tests: `{feature}.test.js`
- E2E tests: `{workflow}.test.js`

### Test Structure Template

```javascript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('Module Name', () => {
  // Test suite setup
  before(async () => {
    // Arrange shared resources
  });

  after(async () => {
    // Cleanup
  });

  describe('Feature Group', () => {
    it('should do something specific', async () => {
      // Arrange
      const input = { test: 'data' };
      
      // Act
      const result = await functionUnderTest(input);
      
      // Assert
      assert.equal(result.status, 'success');
      assert.deepEqual(result.data, expectedData);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      const invalidInput = null;
      
      // Act & Assert
      await assert.rejects(
        async () => await functionUnderTest(invalidInput),
        { message: /invalid input/i }
      );
    });
  });
});
```

### Mocking Guidelines

```javascript
import { mock, restoreAllMocks } from 'node:test';

// Mock a module
const mockFn = mock.fn((arg) => `mocked: ${arg}`);

// Restore after tests
after(() => {
  restoreAllMocks();
});
```

### Using Fixtures

```javascript
import { loadFixture } from '../helpers/test-server.js';

const cvTemplate = loadFixture('cv-templates.json', 'default-cv');
```

## Coverage Requirements

### Minimum Thresholds

| Category | Threshold |
|----------|-----------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

### Critical Paths (100% Coverage Required)

- `bios/` - Core orchestration logic
- `security/` - Authentication & authorization
- `middleware/` - Request processing pipeline
- `db/` - Data access layer

### Coverage Report

```bash
# Generate HTML report
npm run test:coverage:html

# View in browser
open coverage/index.html
```

## Test Categories

### Unit Tests (`tests/unit/`)

Fast, isolated tests with all dependencies mocked.

- `bios/` - Core orchestration system
- `alerts/` - Alert management
- `analysis/` - Data analysis modules
- `claude/` - Claude AI integration
- `db/` - Database layer
- `domains/` - Domain-specific logic
- `gsd/` - Getting Stuff Done module
- `middleware/` - Express/Fastify middleware
- `security/` - Auth & security
- `tools/` - Tool implementations
- `utils/` - Utility functions

### Integration Tests (`tests/integration/`)

Test module interactions and external integrations.

- `api.test.js` - REST API endpoints
- `websocket.test.js` - WebSocket connections
- `mcp-tools.test.js` - MCP tool execution
- `multi-client.test.js` - Multi-client scenarios

### E2E Tests (`tests/e2e/`)

Full user workflow testing.

- `full-workflow.test.js` - Complete user journeys
- `bios-console.test.js` - Console/CLI interactions

### Fixtures (`tests/fixtures/`)

Reusable test data:

- `cv-templates.json` - CV/Resume templates
- `test-data.sql` - Database seed data
- `mock-clients.js` - Mock client implementations

### Helpers (`tests/helpers/`)

Test utilities:

- `test-server.js` - Server setup/teardown
- `test-client.js` - HTTP/WebSocket clients
- `assertions.js` - Custom assertions

## CI/CD Integration

Tests run automatically on:

1. Pull request creation
2. Push to main branch
3. Release tagging

### GitHub Actions

```yaml
- name: Run Tests
  run: npm test
  
- name: Coverage Report
  run: npm run test:coverage
```

## Debugging Failed Tests

1. **Isolate the test**: Run single file
2. **Add logging**: Use `console.log` or debugger
3. **Check mocks**: Verify mock behavior matches expectations
4. **Review fixtures**: Ensure test data is valid
5. **Check timing**: Look for race conditions in async code

## Best Practices

- Keep tests independent - no shared state
- Use descriptive test names
- Test edge cases and error paths
- Avoid testing third-party code
- Clean up resources in `after` hooks
- Use factories for complex test data
- Prefer explicit assertions over snapshot testing
