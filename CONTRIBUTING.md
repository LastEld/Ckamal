# Contributing to CogniMesh

Thank you for your interest in contributing to CogniMesh! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Pull Request Process](#pull-request-process)
- [Commit Message Conventions](#commit-message-conventions)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Security](#security)

---

## Code of Conduct

This project and everyone participating in it is governed by our commitment to:

- **Be respectful** - Treat everyone with respect. Healthy debate is encouraged, but harassment is not tolerated.
- **Be constructive** - Provide constructive feedback and be open to receiving it.
- **Be collaborative** - Work together towards the best possible solutions.
- **Be inclusive** - Welcome newcomers and help them get started.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/cognimesh.git
   cd cognimesh
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Development Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your development credentials
# At minimum, set GITHUB_TOKEN for testing

# Verify installation
npm run bios:diagnose
```

---

## Development Workflow

### Branch Naming

- `feature/description` - New features
- `bugfix/description` - Bug fixes
- `hotfix/description` - Critical fixes for production
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions/improvements

Examples:
```
feature/add-websocket-authentication
bugfix/fix-task-dependency-resolution
docs/update-api-reference
```

### Before Submitting

1. **Run tests**:
   ```bash
   npm test
   ```

2. **Run linter**:
   ```bash
   npm run lint
   ```

3. **Format code**:
   ```bash
   npm run format
   ```

4. **Verify BIOS integration**:
   ```bash
   npm run test:bios:all
   ```

---

## Code Style Guidelines

### JavaScript/Node.js

We follow a modified version of the Airbnb JavaScript Style Guide with some project-specific rules.

#### General Rules

- **Use ES Modules** - All new code should use `import`/`export`
- **Use async/await** - Avoid callback-style code
- **Prefer const/let** - No `var` declarations
- **Use strict equality** - `===` and `!==` instead of `==` and `!=`

#### Naming Conventions

```javascript
// Classes: PascalCase
class CogniMeshBIOS { }
class TaskManager { }

// Functions/variables: camelCase
function calculateTotal() { }
const taskCount = 0;

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 5000;

// Private methods: _leadingUnderscore
class MyClass {
  _internalMethod() { }
}

// File names: kebab-case
// my-file.js, task-manager.js, bios-core.js
```

#### Code Structure

```javascript
// Imports: external first, then internal, then relative
import { EventEmitter } from 'events';
import express from 'express';

import { Config } from './config.js';
import { logger } from './utils/logger.js';

// Class documentation
/**
 * Manages task lifecycle and execution.
 * @extends EventEmitter
 */
class TaskManager extends EventEmitter {
  /**
   * Creates a new TaskManager instance.
   * @param {Object} options - Configuration options
   * @param {number} options.maxConcurrency - Maximum concurrent tasks
   */
  constructor(options = {}) {
    super();
    this.maxConcurrency = options.maxConcurrency || 10;
  }

  /**
   * Creates a new task.
   * @param {string} title - Task title
   * @param {string} [description] - Task description
   * @returns {Promise<Task>} Created task
   * @throws {ValidationError} If title is invalid
   */
  async create(title, description) {
    // Implementation
  }
}

export { TaskManager };
```

#### Error Handling

```javascript
// Use custom error classes
import { ValidationError, NotFoundError } from './errors/index.js';

// Async error handling
try {
  const result = await riskyOperation();
} catch (error) {
  if (error instanceof ValidationError) {
    logger.warn('Validation failed:', error.message);
    return { success: false, errors: error.errors };
  }
  logger.error('Unexpected error:', error);
  throw error;
}

// Always handle Promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
```

---

## Pull Request Process

### 1. Before Creating a PR

- [ ] Code follows style guidelines
- [ ] All tests pass (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] Documentation is updated (if needed)
- [ ] CHANGELOG.md is updated (if needed)

### 2. Creating a PR

1. **Push your branch** to your fork
2. **Create a Pull Request** from your branch to `develop` (or `main` for hotfixes)
3. **Fill out the PR template** with:
   - Description of changes
   - Related issue numbers
   - Testing performed
   - Screenshots (if UI changes)

### 3. PR Review Process

- All PRs require **at least one review** before merging
- Address review comments promptly
- Keep discussion focused and constructive
- Re-request review after making changes

### 4. Merging

- Use **"Squash and Merge"** for clean commit history
- Ensure CI checks pass before merging
- Delete your branch after merging

### PR Title Format

```
[type]: Brief description

Examples:
feat: Add WebSocket authentication
fix: Resolve memory leak in agent pool
docs: Update API reference for v5.0
refactor: Simplify task dependency resolution
test: Add integration tests for BIOS
```

---

## Commit Message Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only changes |
| `style` | Code style changes (formatting, semicolons, etc) |
| `refactor` | Code refactoring |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `chore` | Build process or auxiliary tool changes |
| `ci` | CI/CD changes |
| `security` | Security-related changes |

### Scopes

Common scopes:
- `bios` - BIOS system
- `agents` - Agent management
- `tasks` - Task management
- `claude` - Claude integration
- `kimi` - Kimi integration
- `codex` - Codex integration
- `websocket` - WebSocket server
- `api` - HTTP API
- `db` - Database
- `security` - Security features

### Examples

```
feat(bios): Add safe mode recovery mechanism

Implement automatic transition to SAFE_MODE when critical
errors are detected. Includes self-healing for common issues.

Closes #123
```

```
fix(tasks): Correct Eisenhower Matrix quadrant assignment

Tasks with due dates in the past were incorrectly assigned
to quadrant 3 instead of quadrant 1.

Fixes #456
```

```
docs(api): Add error handling examples to API reference

- Add error response examples for all endpoints
- Document rate limiting headers
- Include retry strategies

Refs #789
```

### Breaking Changes

For breaking changes, add `!` after the type/scope and include `BREAKING CHANGE:` in the footer:

```
feat(api)!: Remove deprecated v1 endpoints

BREAKING CHANGE: All /api/v1/* endpoints have been removed.
Migrate to /api/v2/* endpoints before upgrading.
```

---

## Testing Requirements

### Test Structure

```
tests/
├── unit/              # Unit tests (no external dependencies)
├── integration/       # Integration tests (with DB, etc.)
├── e2e/              # End-to-end tests
└── fixtures/         # Test data
```

### Writing Tests

```javascript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { TaskManager } from '../../src/domains/tasks/manager.js';

describe('TaskManager', () => {
  let manager;

  beforeEach(() => {
    manager = new TaskManager();
  });

  describe('create', () => {
    it('should create a task with valid input', async () => {
      const task = await manager.create('Test Task', 'Description');
      
      expect(task).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.status).toBe('pending');
    });

    it('should throw ValidationError for empty title', async () => {
      await expect(manager.create(''))
        .rejects
        .toThrow('Title is required');
    });
  });
});
```

### Test Coverage Requirements

- **Minimum coverage**: 80% for new code
- **Critical paths**: 100% coverage (BIOS, security, auth)
- Run coverage report: `npm run test:coverage`

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### BIOS Testing

```bash
# Run all BIOS verification tests
npm run test:bios:all

# Individual BIOS test suites
npm run test:bios:unit
npm run test:bios:integration
npm run test:bios:performance
npm run test:bios:security
```

---

## Documentation

### Code Documentation

- Use JSDoc for all public APIs
- Document parameters, return values, and exceptions
- Include examples for complex functions

```javascript
/**
 * Delegates a task to a specific AI client.
 * @param {string} clientId - Target client (claude|kimi|codex)
 * @param {string} task - Task description
 * @param {Object} [options] - Delegation options
 * @param {string} [options.priority='normal'] - Task priority
 * @param {number} [options.timeout=30000] - Timeout in milliseconds
 * @returns {Promise<DelegationResult>} Delegation result
 * @throws {ClientNotFoundError} If client is not connected
 * @throws {TimeoutError} If task exceeds timeout
 * 
 * @example
 * const result = await delegate('claude', 'Review this code', {
 *   priority: 'high',
 *   timeout: 60000
 * });
 */
async function delegate(clientId, task, options = {}) {
  // Implementation
}
```

### README Updates

Update README.md when:
- Adding new features
- Changing installation process
- Modifying configuration options
- Updating supported clients

### API Documentation

Update API_REFERENCE.md when:
- Adding new endpoints
- Changing request/response schemas
- Adding new error codes

---

## Security

### Reporting Security Issues

**DO NOT** create public issues for security vulnerabilities.

Instead:
1. Email security@cognimesh.io with details
2. Include reproduction steps
3. Allow 30 days for response before public disclosure

### Security Best Practices

- Never commit secrets to the repository
- Use environment variables for sensitive configuration
- Validate all user inputs
- Use parameterized queries for database access
- Implement proper error handling (don't leak stack traces)
- Follow OWASP guidelines

---

## Questions?

- 💬 [Discussions](https://github.com/cognimesh/cognimesh/discussions)
- 🐛 [Issue Tracker](https://github.com/cognimesh/cognimesh/issues)
- 📧 [Email](mailto:contributors@cognimesh.io)

Thank you for contributing to CogniMesh! 🎉
