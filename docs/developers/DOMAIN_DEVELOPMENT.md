# Domain Development Guide

This guide explains how to create and work with business domains in CogniMesh. Domains follow Domain-Driven Design (DDD) principles and use a repository pattern for data access.

## Table of Contents

- [Domain Architecture Overview](#domain-architecture-overview)
- [Creating a New Domain](#creating-a-new-domain)
- [Repository Pattern](#repository-pattern)
- [Service Layer](#service-layer)
- [Domain Registry](#domain-registry)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## Domain Architecture Overview

CogniMesh uses a Domain-Driven Design approach with the following structure:

```
src/domains/
├── domain-name/              # Domain directory
│   ├── index.js              # Domain exports and main class
│   ├── domain-service.js     # Business logic service (optional)
│   ├── domain-repository.js  # Repository (if custom needed)
│   └── domain-tools.js       # Domain-specific tools (optional)
```

### Built-in Domains

| Domain | Purpose | Location |
|--------|---------|----------|
| `architecture` | Project analysis and pattern detection | `src/domains/architecture/` |
| `company` | Multi-tenant organization management | `src/domains/company/` |
| `context` | Context snapshots and state management | `src/domains/context/` |
| `documents` | Document management | `src/domains/documents/` |
| `gsd` | Workflow execution (Getting Stuff Done) | `src/domains/gsd/` |
| `issues` | Issue tracking | `src/domains/issues/` |
| `merkle` | Cryptographic audit trails | `src/domains/merkle/` |
| `roadmaps` | Roadmap and milestone management | `src/domains/roadmaps/` |
| `skills` | AI client skill management | `src/domains/skills/` |
| `tasks` | Task management | `src/domains/tasks/` |

---

## Creating a New Domain

### Step 1: Create Domain Directory

```bash
mkdir -p src/domains/my-domain
```

### Step 2: Create Domain Class

Create `src/domains/my-domain/index.js`:

```javascript
/**
 * @fileoverview My Domain - Brief description
 * @module domains/my-domain
 */

import { EventEmitter } from 'events';

/**
 * MyDomain business logic
 * @extends EventEmitter
 */
export class MyDomain extends EventEmitter {
  /**
   * @param {Object} options - Domain options
   * @param {Object} [options.repositories] - Repository instances
   * @param {Object} [options.dependencies] - Domain dependencies
   */
  constructor(options = {}) {
    super();
    
    this.repositories = options.repositories || {};
    this.dependencies = options.dependencies || {};
    
    // In-memory storage (optional)
    this.items = new Map();
  }

  /**
   * Initialize the domain
   * Called by DomainRegistry during initialization
   */
  async initialize() {
    // Load initial data from repositories
    if (this.repositories.myItems) {
      const items = await this.repositories.myItems.findAll();
      for (const item of items) {
        this.items.set(item.id, item);
      }
    }
  }

  /**
   * Dispose of resources
   * Called during shutdown
   */
  async dispose() {
    this.items.clear();
    this.removeAllListeners();
  }

  // ==================== Business Logic ====================

  /**
   * Create a new item
   * @param {Object} data - Item data
   * @returns {Object} Created item
   * @fires MyDomain#itemCreated
   */
  createItem(data) {
    // Validation
    if (!data.name) {
      throw new Error('Name is required');
    }

    // Create item
    const item = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description || '',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in memory
    this.items.set(item.id, item);

    // Persist to repository
    if (this.repositories.myItems) {
      this.repositories.myItems.create(item).catch(err => {
        this.emit('error', err);
      });
    }

    /** @event MyDomain#itemCreated */
    this.emit('itemCreated', { item });

    return item;
  }

  /**
   * Get an item by ID
   * @param {string} id - Item ID
   * @returns {Object|undefined} The item
   */
  getItem(id) {
    return this.items.get(id);
  }

  /**
   * Update an item
   * @param {string} id - Item ID
   * @param {Object} updates - Update data
   * @returns {Object} Updated item
   */
  updateItem(id, updates) {
    const item = this.items.get(id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    Object.assign(item, updates, {
      updatedAt: new Date().toISOString()
    });

    if (this.repositories.myItems) {
      this.repositories.myItems.update(id, item);
    }

    this.emit('itemUpdated', { item });
    return item;
  }

  /**
   * Delete an item
   * @param {string} id - Item ID
   * @returns {boolean} True if deleted
   */
  deleteItem(id) {
    const deleted = this.items.delete(id);
    
    if (deleted && this.repositories.myItems) {
      this.repositories.myItems.delete(id);
    }

    this.emit('itemDeleted', { id });
    return deleted;
  }

  /**
   * List all items
   * @param {Object} [filters] - Filter options
   * @returns {Array<Object>} Items
   */
  listItems(filters = {}) {
    let items = Array.from(this.items.values());

    if (filters.status) {
      items = items.filter(i => i.status === filters.status);
    }

    return items.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  }
}

// Export singleton instance
export const myDomain = new MyDomain();
export default MyDomain;
```

### Step 3: Register in Domain Registry

Edit `src/domains/index.js`:

```javascript
import { MyDomain } from './my-domain/index.js';

// In the #registerDefaultDomains method, add:
this.register('myDomain', {
  name: 'My Domain',
  version: '1.0.0',
  description: 'Brief description of the domain',
  factory: MyDomain,
  dependencies: [] // Add dependencies if needed
});

// Add convenience accessor:
myDomain(options = {}) {
  return this.get('myDomain', options);
}
```

### Step 4: Create Database Migration (if needed)

Create `src/db/migrations/XXX_my_domain.js`:

```javascript
/**
 * @param {import('sqlite3').Database} db
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS my_domain_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_my_domain_status 
    ON my_domain_items(status);
  `);
}

/**
 * @param {import('sqlite3').Database} db
 */
export function down(db) {
  db.exec(`
    DROP TABLE IF EXISTS my_domain_items;
  `);
}
```

### Step 5: Create Repository (if custom needed)

Create `src/db/repositories/my-domain-items.js`:

```javascript
import { BaseRepository } from './base-repository.js';

export class MyDomainItemRepository extends BaseRepository {
  constructor(pool) {
    super(pool, 'my_domain_items', 'id', [
      'name',
      'description',
      'status',
      'created_at',
      'updated_at'
    ]);
  }

  /**
   * Find items by status
   * @param {string} status - Item status
   * @returns {Promise<Array<Object>>}
   */
  async findByStatus(status) {
    return this.findAll({
      where: { status },
      orderBy: 'created_at',
      orderDirection: 'DESC'
    });
  }
}
```

Register in `src/db/repositories/index.js`.

---

## Repository Pattern

CogniMesh uses the Repository pattern for data access. All repositories extend `BaseRepository`.

### BaseRepository API

```javascript
import { BaseRepository } from '../db/repositories/base-repository.js';

class MyRepository extends BaseRepository {
  constructor(pool) {
    super(pool, 'table_name', 'primary_key', ['column1', 'column2']);
  }
}
```

### Available Methods

| Method | Description | Example |
|--------|-------------|---------|
| `findById(id)` | Find by primary key | `repo.findById('abc-123')` |
| `findAll(filters)` | Find with filters | `repo.findAll({ where: { status: 'active' }, limit: 10 })` |
| `create(data)` | Create new record | `repo.create({ name: 'Test' })` |
| `update(id, data)` | Update record | `repo.update('abc', { name: 'Updated' })` |
| `delete(id)` | Delete record | `repo.delete('abc')` |
| `count(where)` | Count records | `repo.count({ status: 'active' })` |
| `exists(id)` | Check existence | `repo.exists('abc')` |
| `transaction(fn)` | Run in transaction | `repo.transaction(async (tx) => { ... })` |

### Filter Options

```javascript
// Basic where
await repo.findAll({ where: { status: 'active' } });

// Array values (IN clause)
await repo.findAll({ where: { status: ['active', 'pending'] } });

// NULL values
await repo.findAll({ where: { deleted_at: null } });

// Operators
await repo.findAll({ 
  where: { 
    priority: { operator: '>', value: 5 }
  } 
});

// Ordering and pagination
await repo.findAll({
  where: { status: 'active' },
  orderBy: 'created_at',
  orderDirection: 'DESC',
  limit: 10,
  offset: 20
});
```

### Transactions

```javascript
await repo.transaction(async (txRepo) => {
  // All operations use the same transaction
  const item1 = await txRepo.create({ name: 'Item 1' });
  const item2 = await txRepo.create({ name: 'Item 2' });
  
  // If any error occurs, both operations are rolled back
  return { item1, item2 };
});
```

---

## Service Layer

Complex business logic should be separated into a service layer:

```javascript
// src/domains/my-domain/my-service.js

export class MyService {
  constructor(options = {}) {
    this.domain = options.domain;
    this.repositories = options.repositories;
  }

  /**
   * Complex business operation
   */
  async performComplexOperation(input) {
    // Validation
    this.validateInput(input);

    // Business logic
    const result = await this.calculateSomething(input);

    // Persistence
    await this.saveResult(result);

    return result;
  }

  validateInput(input) {
    if (!input.requiredField) {
      throw new Error('requiredField is required');
    }
  }

  async calculateSomething(input) {
    // Implementation
  }

  async saveResult(result) {
    await this.repositories.results.create(result);
  }
}
```

---

## Domain Registry

The `DomainRegistry` manages domain lifecycle and dependencies:

```javascript
import { domainRegistry } from './domains/index.js';

// Get a domain instance
const gsd = domainRegistry.gsd();
const company = domainRegistry.company();

// Check if domain exists
if (domainRegistry.has('myDomain')) {
  // ...
}

// Get domain info
const info = domainRegistry.info('company');
// { id: 'company', name: 'Company Domain', version: '1.0.0', ... }

// List all domains
const domains = domainRegistry.list();

// Initialize all domains
await domainRegistry.initialize();

// Dispose all domains
await domainRegistry.dispose();
```

### Workflow Builder

The registry provides a fluent workflow builder:

```javascript
const result = await domainRegistry
  .workflow()
  .ofType('code-generation')
  .task('analyze', { target: 'src/components' })
  .task('generate', { template: 'react-component' }, { after: 'analyze' })
  .task('test', {}, { after: 'generate' })
  .withTimeout(60000)
  .withContext({ language: 'javascript' })
  .execute();
```

---

## Best Practices

### 1. Domain Isolation

- Domains should be self-contained
- Avoid direct imports between domains
- Use events for cross-domain communication
- Declare dependencies explicitly

### 2. Error Handling

```javascript
// Use custom error classes
import { ValidationError, NotFoundError } from '../utils/errors.js';

async getItem(id) {
  const item = await this.repo.findById(id);
  if (!item) {
    throw new NotFoundError(`Item ${id} not found`);
  }
  return item;
}
```

### 3. Event-Driven Communication

```javascript
// Emit events for state changes
this.emit('itemCreated', { item });

// Other domains can listen
domainRegistry.get('otherDomain').on('itemCreated', handler);
```

### 4. Repository Usage

- Keep business logic in domain, data access in repository
- Use transactions for multi-table operations
- Handle repository errors gracefully

### 5. Testing

```javascript
// tests/domains/my-domain.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MyDomain } from '../../src/domains/my-domain/index.js';

describe('MyDomain', () => {
  let domain;

  beforeEach(() => {
    domain = new MyDomain();
  });

  describe('createItem', () => {
    it('should create item with valid data', () => {
      const item = domain.createItem({ name: 'Test' });
      
      assert.equal(item.name, 'Test');
      assert.equal(item.status, 'active');
      assert.ok(item.id);
    });

    it('should throw for missing name', () => {
      assert.throws(() => {
        domain.createItem({});
      }, /Name is required/);
    });
  });
});
```

---

## Examples

### Company Domain (Multi-tenant)

See `src/domains/company/company-domain.js` for a complete example of:
- Role-based permissions
- Multi-tenant data isolation
- Membership management
- Company lifecycle (create, update, suspend, delete)

### GSD Domain (Workflows)

See `src/domains/gsd/index.js` for:
- Workflow creation and execution
- Task dependency management
- Retry logic with exponential backoff
- Event-driven progress tracking

### Issues Domain

See `src/domains/issues/issue-service.js` for:
- Issue lifecycle management
- Status transitions
- Integration with other domains
