# Database Module

## Overview

The Database Module provides comprehensive data persistence capabilities for CogniMesh v5.0. It features connection pooling, a repository pattern implementation, migration management, and support for both relational (SQLite) and vector data stores.

## Architecture

### Module Structure

```
db/
├── connection/         # Connection pooling
│   └── index.js        # ConnectionPool class
├── repositories/       # Repository implementations
│   ├── base-repository.js
│   ├── tasks.js
│   ├── roadmaps.js
│   ├── merkle.js
│   └── contexts.js
└── migrations/         # Database migrations
    └── index.js        # MigrationRunner
```

### Data Flow

```
Application → Repository → ConnectionPool → SQLite
                   ↓
            (Connection Management,
             Transaction Handling)
```

## Components

### ConnectionPool

Multi-connection pool with health checks:

- **Connection Management**: Creates and manages database connections
- **Health Monitoring**: Automatic health checks and reconnection
- **Idle Cleanup**: Removes idle connections above minimum
- **Transaction Support**: Transaction-scoped connection handling
- **Statistics**: Pool usage statistics

### RepositoryFactory

Factory for repository instances:

- **Repository Creation**: Creates task, roadmap, merkle, context repos
- **Dependency Injection**: Shares connection pool across repos
- **Transaction Coordination**: Cross-repository transactions
- **Lifecycle Management**: Initializes and closes all repos

### Repositories

**BaseRepository**
- Generic CRUD operations
- Query building
- Result mapping
- Error handling

**TaskRepository**
- Task-specific queries
- Status/quadrant filtering
- Priority management
- Batch operations

**RoadmapRepository**
- Roadmap with phases
- Progress tracking
- Phase management
- Tree structures

**MerkleRepository**
- Merkle tree storage
- Hash verification
- Proof generation
- Tree persistence

**ContextRepository**
- Context storage
- Message history
- Context compression
- Session management

### MigrationRunner

Database schema evolution:

- **Migration Discovery**: Auto-discovers migration files
- **Version Tracking**: Tracks applied migrations
- **Batch Execution**: Executes migrations in batches
- **Rollback Support**: Can roll back migrations
- **Conflict Detection**: Detects migration conflicts

## Usage

### Connection Pool

```javascript
import { ConnectionPool } from './db/connection/index.js';

const pool = new ConnectionPool({
  databasePath: './data/app.db',
  minConnections: 2,
  maxConnections: 10,
  acquireTimeout: 30000,
  idleTimeout: 300000
});

await pool.initialize();

// Simple query
const rows = await pool.query(
  'SELECT * FROM tasks WHERE status = ?',
  ['pending']
);

// Get single row
const task = await pool.get(
  'SELECT * FROM tasks WHERE id = ?',
  [taskId]
);

// Insert/update/delete
const result = await pool.run(
  'INSERT INTO tasks (title, status) VALUES (?, ?)',
  ['New Task', 'pending']
);
console.log(`Created task with ID: ${result.lastID}`);

// Transaction
await pool.withTransaction(async (db) => {
  await pool.run('INSERT INTO tasks ...');
  await pool.run('UPDATE counters ...');
});

// Pool stats
const stats = pool.getStats();
console.log(`Connections: ${stats.total} total, ${stats.inUse} in use`);

// Events
pool.on('connectionError', (err) => {
  console.error('Connection error:', err);
});
```

### Repository Factory

```javascript
import { RepositoryFactory } from './db/repositories/index.js';

const repos = new RepositoryFactory({ pool });
await repos.initialize();

// Access repositories
const task = await repos.tasks.findById('task-123');
const roadmaps = await repos.roadmaps.findAll();
const tree = await repos.merkle.getTree(rootHash);

// Cross-repository transaction
await repos.transaction(async (repos) => {
  const task = await repos.tasks.create({
    title: 'Review roadmap',
    roadmapId: 'roadmap-1'
  });
  
  await repos.roadmaps.update(task.roadmapId, {
    lastActivity: new Date()
  });
});

// Available repositories
console.log('Available:', repos.available);
// ['tasks', 'roadmaps', 'merkle', 'contexts']
```

### Task Repository

```javascript
// Find by various criteria
const pending = await repos.tasks.findByStatus('pending');
const urgent = await repos.tasks.findByQuadrant('do_first');
const highPriority = await repos.tasks.findByPriority('high');

// Update status
await repos.tasks.updateStatus('task-123', 'in_progress');

// Set Eisenhower quadrant
await repos.tasks.setQuadrant('task-123', 'schedule');

// Count with filters
const count = await repos.tasks.count({
  status: 'completed',
  completedAfter: '2024-01-01'
});
```

### Roadmap Repository

```javascript
// Get with nested phases
const roadmap = await repos.roadmaps.findWithPhases('roadmap-123');

// Update progress
await repos.roadmaps.updateProgress('roadmap-123', {
  phaseId: 'phase-1',
  milestoneId: 'milestone-1',
  completed: true
});

// Find all with filtering
const active = await repos.roadmaps.findAll({
  status: 'active',
  createdAfter: '2024-01-01'
});
```

### Migrations

```javascript
import { MigrationRunner } from './db/migrations/index.js';

const runner = new MigrationRunner(pool, {
  migrationsPath: './src/db/migrations'
});

// Run pending migrations
const result = await runner.runMigrations();
console.log(`Applied ${result.migrations.length} migrations`);

// Check pending
const pending = await runner.getPending();
console.log(`${pending.length} migrations pending`);

// Rollback last batch
await runner.rollback(1);

// Migration file example (001_initial_schema.js):
export default {
  up: `
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,
  down: `
    DROP TABLE tasks;
  `
};
```

## Configuration

### Connection Pool

```javascript
{
  // Database
  databasePath: './data/cognimesh.db',
  
  // Pool sizing
  minConnections: 2,
  maxConnections: 10,
  
  // Timeouts
  acquireTimeout: 30000,      // 30 seconds
  idleTimeout: 300000,        // 5 minutes
  healthCheckInterval: 30000, // 30 seconds
  
  // Health
  maxHealthCheckFailures: 3,
  
  // SQLite pragmas
  pragmas: {
    foreign_keys: 'ON',
    journal_mode: 'WAL',
    synchronous: 'NORMAL',
    cache_size: 10000
  }
}
```

### Migration Runner

```javascript
{
  migrationsPath: './src/db/migrations',
  tableName: 'migrations',
  strict: true,  // Fail on unknown migrations
  transaction: true  // Wrap in transactions
}
```

## Best Practices

1. **Use Repository Pattern**: Access data through repositories
2. **Pool Sizing**: Size pools based on expected concurrency
3. **Transactions**: Use transactions for multi-table operations
4. **Indexing**: Add indexes for frequently queried fields
5. **Migrations**: Always use migrations for schema changes
6. **Error Handling**: Handle database errors gracefully
7. **Connection Cleanup**: Always close connections/pools
8. **Query Parameters**: Use parameterized queries
