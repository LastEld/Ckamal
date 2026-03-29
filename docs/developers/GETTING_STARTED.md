# Getting Started - Developer Guide

Welcome to the CogniMesh developer documentation! This guide will help you set up your development environment and understand the codebase structure.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Running Tests](#running-tests)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **Git**: For version control
- **GitHub Token**: For GitHub integration testing (optional for basic development)

---

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/Ckamal.git
cd Ckamal
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your development credentials
# At minimum, set GITHUB_TOKEN for testing
```

### 4. Run System Diagnostics

```bash
npm run bios:diagnose
```

This verifies your environment is properly configured.

### 5. Start Development Server

```bash
# Start the main server
npm start

# Or use watch mode for automatic restarts
npm run dev
```

---

## Project Structure

```
Ckamal/
├── src/                          # Source code
│   ├── bios/                     # BIOS orchestration system
│   │   ├── commands/             # CLI commands
│   │   ├── modes/                # System modes (boot, operational, etc.)
│   │   └── *.js                  # Core BIOS components
│   ├── clients/                  # AI client integrations
│   │   ├── claude/               # Claude (Anthropic) integration
│   │   ├── codex/                # Codex (OpenAI) integration
│   │   ├── kimi/                 # Kimi (Moonshot) integration
│   │   └── catalog.js            # Model/surface registry
│   ├── controllers/              # HTTP request handlers
│   ├── dashboard/                # Web dashboard
│   │   ├── public/               # Static assets and frontend components
│   │   │   └── components/       # UI components
│   │   ├── server.js             # Dashboard API server
│   │   └── websocket.js          # Real-time WebSocket server
│   ├── db/                       # Database layer
│   │   ├── migrations/           # Database schema migrations
│   │   ├── repositories/         # Data access layer
│   │   └── connection/           # Database connection management
│   ├── domains/                  # Business domains (DDD)
│   │   ├── activity/             # Activity logging
│   │   ├── approvals/            # Approval workflows
│   │   ├── company/              # Multi-tenant company management
│   │   ├── context/              # Context snapshots
│   │   ├── documents/            # Document management
│   │   ├── gsd/                  # GSD (Getting Stuff Done) workflows
│   │   ├── issues/               # Issue tracking
│   │   ├── merkle/               # Merkle tree audit
│   │   ├── roadmaps/             # Roadmap management
│   │   ├── routines/             # Scheduled routines
│   │   ├── skills/               # AI client skills
│   │   ├── tasks/                # Task management
│   │   └── webhooks/             # Webhook handling
│   ├── middleware/               # Express middleware
│   ├── plugins/                  # Plugin system
│   │   ├── plugin-sdk.js         # Plugin SDK for developers
│   │   ├── plugin-loader.js      # Plugin loading mechanism
│   │   └── plugin-registry.js    # Plugin registration
│   ├── router/                   # AI model routing
│   ├── security/                 # Security utilities
│   ├── tools/                    # MCP tool definitions
│   └── utils/                    # Utility functions
├── tests/                        # Test suite
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── e2e/                      # End-to-end tests
│   ├── api/                      # API tests
│   ├── auth/                     # Authentication tests
│   ├── domains/                  # Domain-specific tests
│   └── fixtures/                 # Test data
├── docs/                         # Documentation
│   └── developers/               # This developer guide
├── scripts/                      # Utility scripts
├── config/                       # Configuration files
└── data/                         # Local database storage
```

### Key Architecture Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **BIOS** | System lifecycle and orchestration | `src/bios/` |
| **Domains** | Business logic (DDD pattern) | `src/domains/` |
| **Repositories** | Data access layer | `src/db/repositories/` |
| **Controllers** | HTTP request handling | `src/controllers/` |
| **Clients** | AI provider integrations | `src/clients/` |
| **Router** | Model selection and routing | `src/router/` |
| **Plugins** | Extension system | `src/plugins/` |

---

## Running Tests

### All Tests

```bash
npm test
```

Runs the complete test suite: unit, integration, auth, and API tests.

### Unit Tests

```bash
npm run test:unit
```

Fast tests with no external dependencies.

### Integration Tests

```bash
npm run test:integration
```

Tests with database and service dependencies.

### E2E Tests

```bash
npm run test:e2e
```

End-to-end tests simulating real user workflows.

### API Tests

```bash
npm run test:api
```

HTTP API endpoint tests.

### Authentication Tests

```bash
npm run test:auth
```

Auth flow and permission tests.

### BIOS Tests

```bash
# All BIOS verification tests
npm run test:bios:all

# Individual test suites
npm run test:bios:unit
npm run test:bios:integration
npm run test:bios:performance
npm run test:bios:security
```

### Coverage Report

```bash
npm run test:coverage
```

Generates test coverage report.

### Watch Mode

```bash
npm run test:watch
```

Runs tests on file changes.

---

## Development Workflow

### Branch Naming

- `feature/description` - New features
- `bugfix/description` - Bug fixes
- `hotfix/description` - Critical fixes
- `docs/description` - Documentation
- `refactor/description` - Code refactoring
- `test/description` - Test additions

Examples:
```
feature/add-websocket-authentication
bugfix/fix-task-dependency-resolution
docs/update-api-reference
```

### Before Committing

```bash
# 1. Run linter
npm run lint

# 2. Run tests
npm test

# 3. Format code
npm run format

# 4. Run BIOS verification
npm run test:bios:all
```

### Creating a Pull Request

1. Push your branch to your fork
2. Create PR to `develop` (or `main` for hotfixes)
3. Fill out the PR template
4. Ensure CI checks pass

---

## Code Style

### JavaScript/Node.js

We follow a modified Airbnb JavaScript Style Guide.

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

#### Import Order

```javascript
// 1. Node.js built-ins
import { EventEmitter } from 'events';
import { readFile } from 'fs/promises';

// 2. External packages
import express from 'express';
import winston from 'winston';

// 3. Internal modules
import { Config } from './config.js';
import { logger } from './utils/logger.js';

// 4. Relative imports
import { TaskManager } from '../domains/tasks/index.js';
```

#### Documentation

Use JSDoc for all public APIs:

```javascript
/**
 * Creates a new task in the system.
 * @param {string} title - Task title
 * @param {string} [description] - Task description
 * @param {Object} [options] - Additional options
 * @param {number} [options.priority=5] - Task priority (1-10)
 * @returns {Promise<Task>} Created task
 * @throws {ValidationError} If title is invalid
 * @example
 * const task = await createTask('Fix bug', 'Critical production issue');
 */
async function createTask(title, description, options = {}) {
  // Implementation
}
```

---

## Troubleshooting

### Common Issues

#### "Cannot find module"

```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
```

#### Database locked

```bash
# Kill any hanging Node processes
npx kill-port 3000

# Or on Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

#### Migration errors

```bash
# Reset database (WARNING: deletes all data)
rm data/cognimesh.db
npm run db:migrate
```

#### BIOS not starting

```bash
# Check system health
npm run bios:diagnose

# Check logs
npm run bios:maintenance -- logs
```

### Getting Help

- 💬 [GitHub Discussions](https://github.com/cognimesh/cognimesh/discussions)
- 🐛 [Issue Tracker](https://github.com/cognimesh/cognimesh/issues)
- 📧 [Email](mailto:contributors@cognimesh.io)

---

## Next Steps

- Read [DOMAIN_DEVELOPMENT.md](./DOMAIN_DEVELOPMENT.md) to learn about creating domains
- Read [PLUGIN_DEVELOPMENT.md](./PLUGIN_DEVELOPMENT.md) to build plugins
- Read [TESTING.md](./TESTING.md) for testing best practices
- Read [API_CLIENT.md](./API_CLIENT.md) to use the JavaScript SDK
