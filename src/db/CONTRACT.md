# Database Module Contract

## Overview

The Database Module provides data persistence for CogniMesh v5.0. It includes connection pooling, repository patterns, migration management, and support for both SQLite and vector databases.

## Public Interfaces

### ConnectionPool

Manages database connections with pooling.

```javascript
import { ConnectionPool } from './db/connection/index.js';

const pool = new ConnectionPool({
  databasePath: './data/app.db',
  maxConnections: 10
});
```

**Methods:**

- `constructor(config)` - Creates connection pool
  - `config.databasePath` - Path to database
  - `config.minConnections` - Minimum connections (default: 2)
  - `config.maxConnections` - Maximum connections (default: 10)
  - `config.acquireTimeout` - Acquisition timeout
  - `config.idleTimeout` - Idle connection timeout

- `initialize()` - Initializes pool
  - Returns: Promise<void>

- `acquire()` - Acquires connection from pool
  - Returns: Promise<Database>

- `release(db)` - Releases connection back to pool
  - Returns: void

- `query(sql, params)` - Executes query
  - Returns: Promise<any[]>

- `get(sql, params)` - Gets single row
  - Returns: Promise<any>

- `run(sql, params)` - Executes run statement
  - Returns: Promise<{lastID, changes}>

- `withTransaction(fn)` - Executes in transaction
  - Returns: Promise<any>

- `getStats()` - Returns pool statistics
  - Returns: PoolStats

- `close()` - Closes all connections
  - Returns: Promise<void>

### RepositoryFactory

Factory for creating repository instances.

- `constructor(options)` - Creates factory
  - `options.databasePath` - Database path
  - `options.pool` - Existing connection pool

- `initialize()` - Initializes factory
  - Returns: Promise<void>

- `get tasks()` - Gets task repository
  - Returns: TaskRepository

- `get roadmaps()` - Gets roadmap repository
  - Returns: RoadmapRepository

- `get merkle()` - Gets merkle repository
  - Returns: MerkleRepository

- `get contexts()` - Gets context repository
  - Returns: ContextRepository

- `get(name)` - Gets repository by name
  - Returns: Repository

- `transaction(fn)` - Executes cross-repo transaction
  - Returns: Promise<any>

- `close()` - Closes all repositories
  - Returns: Promise<void>

### BaseRepository

Base class for all repositories.

- `constructor(pool)` - Creates repository
  - `pool` (ConnectionPool) - Connection pool

- `findById(id)` - Finds by ID
  - Returns: Promise<any>

- `findAll(filters)` - Finds all matching
  - Returns: Promise<any[]>

- `create(data)` - Creates new record
  - Returns: Promise<any>

- `update(id, data)` - Updates record
  - Returns: Promise<any>

- `delete(id)` - Deletes record
  - Returns: Promise<boolean>

- `count(filters)` - Counts matching records
  - Returns: Promise<number>

### TaskRepository

Task-specific repository.

- `findByStatus(status)` - Finds by status
- `findByQuadrant(quadrant)` - Finds by Eisenhower quadrant
- `findByPriority(priority)` - Finds by priority
- `updateStatus(id, status)` - Updates task status
- `setQuadrant(id, quadrant)` - Sets quadrant

### RoadmapRepository

Roadmap-specific repository.

- `findWithPhases(id)` - Gets roadmap with phases
- `updateProgress(id, progress)` - Updates progress
- `getPhaseRoadmap(phaseId)` - Gets phase's roadmap

### MerkleRepository

Merkle tree storage repository.

- `storeTree(rootHash, tree)` - Stores tree
- `getTree(rootHash)` - Retrieves tree
- `verifyPath(rootHash, leaf, path)` - Verifies path

### ContextRepository

Context storage repository.

- `storeContext(id, context)` - Stores context
- `getContext(id)` - Retrieves context
- `updateMessages(id, messages)` - Updates messages

### MigrationRunner

Database migration management.

- `constructor(pool, options)` - Creates runner
  - `options.migrationsPath` - Path to migration files

- `runMigrations()` - Runs pending migrations
  - Returns: Promise<MigrationResult>

- `getPending()` - Gets pending migrations
  - Returns: Promise<Migration[]>

- `getApplied()` - Gets applied migrations
  - Returns: Promise<Migration[]>

- `rollback(count)` - Rolls back migrations
  - Returns: Promise<MigrationResult>

## Data Structures

### PoolStats

```typescript
interface PoolStats {
  total: number;
  inUse: number;
  available: number;
  healthCheckFailures: number;
}
```

### PoolConfig

```typescript
interface PoolConfig {
  databasePath: string;
  minConnections?: number;
  maxConnections?: number;
  acquireTimeout?: number;
  idleTimeout?: number;
  healthCheckInterval?: number;
  maxHealthCheckFailures?: number;
}
```

### PooledConnection

```typescript
interface PooledConnection {
  db: sqlite3.Database;
  inUse: boolean;
  lastUsed: number;
  createdAt: number;
  healthCheckFailures: number;
}
```

### Migration

```typescript
interface Migration {
  id: number;
  name: string;
  batch: number;
  appliedAt: string;
}
```

### MigrationResult

```typescript
interface MigrationResult {
  success: boolean;
  migrations: Migration[];
  batch: number;
  error?: Error;
}
```

## Events

The Database module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `initialized` | `{ poolSize }` | Pool initialized |
| `connectionCreated` | `{ connection }` | New connection created |
| `connectionAcquired` | `{ connection }` | Connection acquired |
| `connectionReleased` | `{ connection }` | Connection released |
| `connectionError` | `{ error }` | Connection error |
| `healthCheckFailed` | `{ connection, error }` | Health check failed |
| `reconnecting` | `{ connection }` | Reconnecting |
| `reconnected` | `{ connection }` | Reconnected |
| `shuttingDown` | `{}` | Pool shutting down |
| `closed` | `{}` | Pool closed |
| `migration:applied` | `{ migration }` | Migration applied |
| `migration:error` | `{ migration, error }` | Migration failed |

## Error Handling

### DatabaseError

Base error for database operations.

### ConnectionError

Thrown when connection fails.

### PoolError

Thrown when pool operations fail.

### MigrationError

Thrown when migration fails.

### RepositoryError

Thrown when repository operations fail.

## Usage Example

```javascript
import { ConnectionPool, RepositoryFactory } from './db/index.js';

// Initialize connection pool
const pool = new ConnectionPool({
  databasePath: './data/cognimesh.db',
  maxConnections: 10
});

await pool.initialize();

// Create repositories
const repos = new RepositoryFactory({ pool });
await repos.initialize();

// Use repositories
const tasks = await repos.tasks.findByStatus('pending');
const roadmaps = await repos.roadmaps.findAll();

// Transaction
await repos.transaction(async (repos) => {
  const task = await repos.tasks.create({ title: 'New Task' });
  await repos.roadmaps.updateProgress(roadmapId, {
    taskCount: { $increment: 1 }
  });
});

// Migrations
import { MigrationRunner } from './db/migrations/index.js';
const runner = new MigrationRunner(pool, {
  migrationsPath: './src/db/migrations'
});
await runner.runMigrations();

// Cleanup
await repos.close();
await pool.close();
```
