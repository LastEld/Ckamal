# Testing Guide

This guide covers testing patterns, best practices, and tooling for CogniMesh development.

## Table of Contents

- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Writing Unit Tests](#writing-unit-tests)
- [Writing Integration Tests](#writing-integration-tests)
- [Writing E2E Tests](#writing-e2e-tests)
- [Test Coverage](#test-coverage)
- [Test Fixtures](#test-fixtures)
- [Best Practices](#best-practices)
- [Common Patterns](#common-patterns)

---

## Test Structure

```
tests/
├── unit/                   # Unit tests (no external dependencies)
│   ├── bios/              # BIOS tests
│   ├── db/                # Database tests
│   ├── domains/           # Domain unit tests
│   ├── gsd/               # GSD domain tests
│   ├── middleware/        # Middleware tests
│   ├── queue/             # Queue tests
│   ├── security/          # Security tests
│   └── utils/             # Utility tests
├── integration/           # Integration tests (with DB, etc.)
│   ├── api.test.js        # API integration tests
│   ├── auth-flow.test.js  # Authentication flow
│   ├── mcp-tools.test.js  # MCP tool tests
│   └── websocket.test.js  # WebSocket tests
├── e2e/                   # End-to-end tests
│   ├── clients.spec.js    # Client integration tests
│   ├── flows.spec.js      # Workflow tests
│   └── full-workflow.test.js # Full system tests
├── api/                   # HTTP API tests
│   ├── auth-controller.test.js
│   └── companies-controller.test.js
├── auth/                  # Authentication tests
│   └── auth-service.test.js
├── domains/               # Domain integration tests
│   ├── context.integration.spec.js
│   ├── merkle.integration.spec.js
│   ├── roadmaps.integration.spec.js
│   └── tasks.integration.spec.js
├── fixtures/              # Test data
│   └── mock-clients.js
├── helpers/               # Test utilities
│   ├── assertions.js      # Custom assertions
│   ├── test-client.js     # HTTP test client
│   └── test-server.js     # Test server setup
└── setup.js               # Global test setup
```

---

## Running Tests

### All Tests

```bash
npm test
```

Runs: unit + integration + auth + API tests

### Specific Test Suites

```bash
# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# API tests
npm run test:api

# Auth tests
npm run test:auth

# BIOS tests
npm run test:bios:unit
npm run test:bios:integration
npm run test:bios:performance
npm run test:bios:security
npm run test:bios:all
```

### Watch Mode

```bash
npm run test:watch
```

Runs tests on file changes (unit tests only).

### Coverage

```bash
npm run test:coverage
```

Generates coverage report with c8.

### Single Test File

```bash
node --test tests/unit/db/repository-contract.test.js
```

---

## Writing Unit Tests

Unit tests have no external dependencies (no database, no network).

### Basic Structure

```javascript
import { describe, it, before, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MyClass } from '../../src/my-module.js';

describe('MyClass', () => {
  let instance;

  // Run once before all tests
  before(() => {
    // Global setup
  });

  // Run before each test
  beforeEach(() => {
    instance = new MyClass();
  });

  // Run after each test
  afterEach(() => {
    // Cleanup
  });

  // Run once after all tests
  after(() => {
    // Global cleanup
  });

  describe('methodName', () => {
    it('should do something expected', () => {
      const result = instance.methodName('input');
      assert.equal(result, 'expected');
    });

    it('should handle edge case', () => {
      assert.throws(() => {
        instance.methodName(null);
      }, /Invalid input/);
    });
  });
});
```

### Assertions Reference

```javascript
import assert from 'node:assert/strict';

// Equality
assert.equal(actual, expected);           // ==
assert.strictEqual(actual, expected);     // ===
assert.deepEqual(actual, expected);       // Deep equality
assert.deepStrictEqual(actual, expected); // Strict deep equality

// Truthiness
assert.ok(value);                         // truthy
assert.ok(!value);                        // falsy

// Errors
assert.throws(fn, /expected message/);
assert.throws(fn, ErrorClass);
await assert.rejects(asyncFn, /message/);

// Async
await assert.doesNotReject(asyncFn);

// Matching
assert.match(string, /pattern/);
assert.doesNotMatch(string, /pattern/);
```

### Mocking

```javascript
import { describe, it, mock } from 'node:test';

// Mock a function
const mockFn = mock.fn((x) => x * 2);
assert.equal(mockFn(5), 10);
assert.equal(mockFn.mock.callCount(), 1);

// Mock with implementation
const mockApi = mock.fn();
mockApi.mock.mockImplementation(() => Promise.resolve({ data: [] }));

// Restore
mockFn.mock.restore();

// Mock modules (using test doubles)
const original = await import('../../src/module.js');
const mocked = {
  ...original,
  expensiveFunction: () => 'mocked'
};
```

### Example: Domain Unit Test

```javascript
// tests/unit/domains/company-domain.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CompanyDomain } from '../../../src/domains/company/company-domain.js';

describe('CompanyDomain', () => {
  let domain;

  beforeEach(() => {
    domain = new CompanyDomain();
  });

  describe('createCompany', () => {
    it('should create company with valid data', () => {
      const company = domain.createCompany(
        { name: 'Test Corp' },
        'user-123'
      );

      assert.equal(company.name, 'Test Corp');
      assert.equal(company.status, 'active');
      assert.ok(company.id);
      assert.ok(company.createdAt);
    });

    it('should generate slug from name', () => {
      const company = domain.createCompany(
        { name: 'My Company Ltd' },
        'user-123'
      );

      assert.equal(company.slug, 'my-company-ltd');
    });

    it('should throw for missing name', () => {
      assert.throws(() => {
        domain.createCompany({}, 'user-123');
      }, /Company name is required/);
    });

    it('should throw for duplicate slug', () => {
      domain.createCompany({ name: 'Test Corp' }, 'user-123');

      assert.throws(() => {
        domain.createCompany({ name: 'Test Corp' }, 'user-456');
      }, /already exists/);
    });
  });

  describe('updateCompany', () => {
    it('should update allowed fields', () => {
      const company = domain.createCompany(
        { name: 'Original' },
        'user-123'
      );

      const updated = domain.updateCompany(
        company.id,
        { description: 'New description' },
        'user-123'
      );

      assert.equal(updated.description, 'New description');
      assert.equal(updated.name, 'Original'); // unchanged
    });
  });
});
```

---

## Writing Integration Tests

Integration tests use real dependencies (database, etc.).

### Database Integration Test

```javascript
// tests/integration/db/repository.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ConnectionPool } from '../../../src/db/connection/index.js';
import { TaskRepository } from '../../../src/db/repositories/tasks.js';

const TEST_DB_PATH = './.tmp/test-integration.db';

describe('TaskRepository Integration', () => {
  let pool;
  let tasks;

  before(async () => {
    // Create test database
    const db = new Database(TEST_DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'pending'
      )
    `);
    db.close();

    pool = new ConnectionPool({
      databasePath: TEST_DB_PATH,
      maxConnections: 5
    });
    await pool.initialize();

    tasks = new TaskRepository(pool);
  });

  after(async () => {
    await pool.close();
    // Clean up
    import('fs').then(fs => {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
    });
  });

  it('should create and retrieve task', async () => {
    const created = await tasks.create({ 
      title: 'Integration Test Task' 
    });

    assert.ok(created.id);
    assert.equal(created.title, 'Integration Test Task');

    const retrieved = await tasks.findById(created.id);
    assert.equal(retrieved.title, 'Integration Test Task');
  });

  it('should update task', async () => {
    const task = await tasks.create({ title: 'Original' });
    
    const updated = await tasks.update(task.id, { 
      status: 'completed' 
    });

    assert.equal(updated.status, 'completed');
  });

  it('should find with filters', async () => {
    await tasks.create({ title: 'Task 1', status: 'pending' });
    await tasks.create({ title: 'Task 2', status: 'completed' });
    await tasks.create({ title: 'Task 3', status: 'pending' });

    const pending = await tasks.findAll({
      where: { status: 'pending' }
    });

    assert.equal(pending.length, 2);
  });
});
```

### API Integration Test

```javascript
// tests/integration/api.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestServer } from '../helpers/test-server.js';
import { createTestClient } from '../helpers/test-client.js';

describe('API Integration', () => {
  let server;
  let client;

  before(async () => {
    server = await createTestServer({ port: 0 }); // Random port
    client = createTestClient(server.url);
  });

  after(async () => {
    await server.close();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await client.get('/health');
      
      assert.equal(response.status, 200);
      assert.equal(response.data.status, 'ok');
    });
  });

  describe('POST /api/tasks', () => {
    it('should create task', async () => {
      const response = await client.post('/api/tasks', {
        title: 'Test Task',
        description: 'Test description'
      });

      assert.equal(response.status, 201);
      assert.ok(response.data.id);
      assert.equal(response.data.title, 'Test Task');
    });

    it('should validate required fields', async () => {
      await assert.rejects(
        async () => client.post('/api/tasks', {}),
        /400/
      );
    });
  });
});
```

---

## Writing E2E Tests

E2E tests simulate real user workflows.

```javascript
// tests/e2e/full-workflow.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestEnvironment } from '../helpers/test-environment.js';

describe('Full Workflow E2E', () => {
  let env;

  before(async () => {
    env = await createTestEnvironment({
      database: true,
      server: true,
      clients: ['claude', 'codex']
    });
  });

  after(async () => {
    await env.cleanup();
  });

  it('should complete full task workflow', async () => {
    // 1. Create company
    const company = await env.api.post('/api/companies', {
      name: 'E2E Test Company'
    });

    // 2. Create task
    const task = await env.api.post('/api/tasks', {
      title: 'E2E Test Task',
      companyId: company.id
    });

    // 3. Start workflow
    const workflow = await env.api.post('/api/workflows', {
      type: 'test',
      tasks: [
        { type: 'analyze', params: { target: task.id } },
        { type: 'process', params: {}, dependsOn: 'analyze' }
      ]
    });

    // 4. Execute workflow
    const execution = await env.api.post(
      `/api/workflows/${workflow.id}/execute`
    );

    // 5. Verify completion
    assert.equal(execution.status, 'completed');

    // 6. Verify task updated
    const updatedTask = await env.api.get(`/api/tasks/${task.id}`);
    assert.equal(updatedTask.status, 'completed');
  });
});
```

---

## Test Coverage

### Coverage Requirements

| Category | Minimum Coverage |
|----------|-----------------|
| New code | 80% |
| Critical paths | 100% |
| BIOS | 90% |
| Security | 100% |
| Auth | 100% |

### Running Coverage

```bash
# All tests with coverage
npm run test:coverage

# Specific suite with coverage
npx c8 node --test tests/unit/**/*.test.js

# Generate report
npx c8 --reporter=html --reporter=text node --test tests/unit/**/*.test.js
```

### Coverage Configuration

Add to `package.json`:

```json
{
  "c8": {
    "include": ["src/**/*.js"],
    "exclude": [
      "src/**/*.test.js",
      "src/dashboard/public/**"
    ],
    "reporter": ["text", "html", "lcov"],
    "branches": 80,
    "functions": 80,
    "lines": 80,
    "statements": 80
  }
}
```

---

## Test Fixtures

### Creating Fixtures

```javascript
// tests/fixtures/mock-clients.js

export const mockClients = {
  claude: {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    provider: 'anthropic',
    surfaces: ['desktop', 'cli'],
    models: ['claude-opus-4-6', 'claude-sonnet-4-6']
  },
  codex: {
    id: 'codex-cli',
    name: 'Codex CLI',
    provider: 'openai',
    surfaces: ['cli', 'vscode'],
    models: ['gpt-5.4-codex']
  }
};

export const mockTasks = [
  { id: 1, title: 'Task 1', status: 'pending' },
  { id: 2, title: 'Task 2', status: 'completed' }
];

export function createMockCompany(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'Test Company',
    slug: 'test-company',
    status: 'active',
    ...overrides
  };
}
```

### Using Fixtures

```javascript
import { mockClients, createMockCompany } from '../fixtures/mock-clients.js';

describe('Company Tests', () => {
  it('should use fixture', () => {
    const company = createMockCompany({ name: 'Custom' });
    assert.equal(company.name, 'Custom');
  });
});
```

---

## Best Practices

### 1. Test Independence

```javascript
// BAD: Tests depend on each other
it('test 1', () => { /* creates item */ });
it('test 2', () => { /* expects item from test 1 */ });

// GOOD: Each test is independent
it('test 1', () => { 
  createItem();
  // assertions
});
it('test 2', () => { 
  createItem();
  // assertions
});
```

### 2. Descriptive Test Names

```javascript
// BAD
it('works', () => {});

// GOOD
it('should return user when valid ID provided', () => {});
it('should throw NotFoundError when user does not exist', () => {});
```

### 3. Arrange-Act-Assert

```javascript
it('should update user email', async () => {
  // Arrange
  const user = await createUser({ email: 'old@example.com' });
  
  // Act
  const updated = await updateUser(user.id, { 
    email: 'new@example.com' 
  });
  
  // Assert
  assert.equal(updated.email, 'new@example.com');
});
```

### 4. One Concept Per Test

```javascript
// BAD: Testing multiple things
it('should handle users', () => {
  const created = createUser();
  assert.ok(created.id);
  
  const updated = updateUser(created.id);
  assert.equal(updated.name, 'New');
  
  const deleted = deleteUser(created.id);
  assert.ok(deleted);
});

// GOOD: Separate tests
it('should create user with ID', () => {});
it('should update user name', () => {});
it('should delete user', () => {});
```

### 5. Cleanup After Tests

```javascript
describe('Database Tests', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.cleanup();
  });
});
```

---

## Common Patterns

### Async Testing

```javascript
// Promises
it('should resolve with data', async () => {
  const result = await fetchData();
  assert.ok(result);
});

// Rejections
it('should reject on error', async () => {
  await assert.rejects(
    async () => fetchData('invalid'),
    /Invalid input/
  );
});

// Timeouts
it('should timeout', async () => {
  await assert.rejects(
    async () => slowOperation({ timeout: 100 }),
    /timeout/
  );
});
```

### Event Testing

```javascript
it('should emit event', async () => {
  const emitter = new EventEmitter();
  
  const eventPromise = new Promise((resolve) => {
    emitter.once('done', resolve);
  });
  
  doSomething(emitter);
  
  const event = await eventPromise;
  assert.equal(event.status, 'success');
});
```

### Stubbing External Services

```javascript
import { mock } from 'node:test';

// Create stub
const originalFetch = global.fetch;
global.fetch = mock.fn(() => 
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'mocked' })
  })
);

// Restore after test
global.fetch = originalFetch;
```

### Database Transactions in Tests

```javascript
it('should rollback on error', async () => {
  await db.transaction(async (trx) => {
    await trx.create({ name: 'Test' });
    
    // Force rollback
    throw new Error('Rollback');
  });
  
  // Verify no data persisted
  const count = await db.count();
  assert.equal(count, 0);
});
```
