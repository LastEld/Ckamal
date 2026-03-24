# Composition Module Contract

## Overview

The Composition Module provides a centralized data access layer for CogniMesh v5.0. It serves as the primary interface between business logic and data sources, offering gateways for database operations, roadmap management, and git checkpoint functionality.

## Public Interfaces

### CompositionGatewayManager

Main coordinator for all gateway access.

```javascript
import { CompositionGatewayManager } from './composition/index.js';

const manager = new CompositionGatewayManager({
  db: { host: 'localhost', port: 3306, database: 'cognimesh' },
  roadmap: { cacheTTL: 300000 },
  checkpoint: { repoPath: process.cwd() }
});
```

**Methods:**

- `constructor(config)` - Creates gateway manager
  - `config.db` - Database configuration
  - `config.roadmap` - Roadmap gateway options
  - `config.checkpoint` - Checkpoint gateway options

- `initialize()` - Initializes all gateways
  - Returns: Promise<void>

- `getHealthStatus()` - Gets health status for all gateways
  - Returns: { db: Object, roadmaps: Object, checkpoints: Object }

- `close()` - Closes all gateways
  - Returns: Promise<void>

### DBGateway

Database access gateway.

- `constructor(config)` - Creates database gateway
  - `config.host` - Database host
  - `config.port` - Database port
  - `config.user` - Username
  - `config.password` - Password
  - `config.database` - Database name
  - `config.readReplica` - Read replica config

- `query(sql, params)` - Executes SQL query
  - `sql` (string) - SQL statement
  - `params` (Array) - Query parameters
  - Returns: Promise<QueryResult>

- `transaction(queries)` - Executes transaction
  - `queries` (Array<{sql, params}>) - Transaction queries
  - Returns: Promise<TransactionResult>

- `getConnection()` - Gets database connection
  - Returns: Promise<Connection>

- `close()` - Closes all connections
  - Returns: Promise<void>

### RoadmapGateway

Roadmap data access gateway.

- `constructor(dbGateway, options)` - Creates roadmap gateway
  - `dbGateway` (DBGateway) - Database gateway instance
  - `options.cacheTTL` - Cache TTL in milliseconds

- `getRoadmap(id)` - Gets roadmap by ID
  - `id` (string) - Roadmap ID
  - Returns: Promise<Roadmap>

- `getRoadmaps(filters)` - Gets roadmaps with filtering
  - `filters` (Object) - Filter criteria
  - Returns: Promise<Roadmap[]>

- `createRoadmap(data)` - Creates new roadmap
  - `data` (RoadmapInput) - Roadmap data
  - Returns: Promise<Roadmap>

- `updateRoadmap(id, updates)` - Updates roadmap
  - Returns: Promise<Roadmap>

- `deleteRoadmap(id)` - Deletes roadmap
  - Returns: Promise<boolean>

- `getProgress(id)` - Gets roadmap progress
  - Returns: Promise<Progress>

- `updateProgress(id, progress)` - Updates progress
  - Returns: Promise<Progress>

- `getCacheStats()` - Gets cache statistics
  - Returns: CacheStats

- `close()` - Closes gateway
  - Returns: void

### GitCheckpointGateway

Git checkpoint management gateway.

- `constructor(options)` - Creates checkpoint gateway
  - `options.repoPath` - Repository path
  - `options.tagPrefix` - Checkpoint tag prefix

- `createCheckpoint(message, options)` - Creates git checkpoint
  - `message` (string) - Checkpoint message
  - `options.files` - Specific files to include
  - Returns: Promise<Checkpoint>

- `getCheckpoint(tag)` - Gets checkpoint by tag
  - `tag` (string) - Checkpoint tag
  - Returns: Promise<Checkpoint>

- `listCheckpoints()` - Lists all checkpoints
  - Returns: Promise<Checkpoint[]>

- `restoreCheckpoint(tag)` - Restores to checkpoint
  - `tag` (string) - Checkpoint tag
  - Returns: Promise<void>

- `diffCheckpoints(from, to)` - Compares two checkpoints
  - Returns: Promise<CheckpointDiff>

- `deleteCheckpoint(tag)` - Deletes checkpoint
  - Returns: Promise<boolean>

## Data Structures

### Roadmap

```typescript
interface Roadmap {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  phases: Phase[];
  progress: Progress;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
```

### Phase

```typescript
interface Phase {
  id: string;
  name: string;
  description: string;
  order: number;
  milestones: Milestone[];
  status: string;
  startDate?: string;
  endDate?: string;
}
```

### Milestone

```typescript
interface Milestone {
  id: string;
  name: string;
  description: string;
  completed: boolean;
  completedAt?: string;
}
```

### Progress

```typescript
interface Progress {
  roadmapId: string;
  overallPercent: number;
  phaseProgress: PhaseProgress[];
  completedMilestones: number;
  totalMilestones: number;
  lastUpdated: string;
}
```

### Checkpoint

```typescript
interface Checkpoint {
  tag: string;
  message: string;
  commit: string;
  createdAt: string;
  author: string;
  files: string[];
}
```

### CheckpointDiff

```typescript
interface CheckpointDiff {
  from: string;
  to: string;
  filesChanged: FileChange[];
  additions: number;
  deletions: number;
}
```

### QueryResult

```typescript
interface QueryResult {
  rows: any[];
  fields: FieldDef[];
  rowCount: number;
  command: string;
}
```

## Events

The Composition module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `query` | `{ sql, rows, duration }` | Query executed |
| `transaction` | `{ queries, duration }` | Transaction completed |
| `roadmapCreated` | `{ id, title }` | Roadmap created |
| `roadmapUpdated` | `{ id, changes }` | Roadmap updated |
| `roadmapDeleted` | `{ id }` | Roadmap deleted |
| `checkpointCreated` | `{ tag, message }` | Checkpoint created |
| `checkpointRestored` | `{ tag }` | Checkpoint restored |
| `error` | `{ error, context }` | Error occurred |

## Error Handling

### GatewayError

Base error for gateway operations.

### DatabaseError

Thrown when database operations fail.

- `code`: 'CONNECTION_ERROR', 'QUERY_ERROR', 'TRANSACTION_ERROR'
- `sql`: SQL that caused error

### RoadmapError

Thrown when roadmap operations fail.

- `code`: 'NOT_FOUND', 'VALIDATION_ERROR', 'UPDATE_ERROR'

### CheckpointError

Thrown when checkpoint operations fail.

- `code`: 'GIT_ERROR', 'NOT_FOUND', 'RESTORE_ERROR'

## Usage Example

```javascript
import { 
  CompositionGatewayManager,
  DBGateway,
  RoadmapGateway,
  GitCheckpointGateway 
} from './composition/index.js';

// Initialize manager
const manager = new CompositionGatewayManager({
  db: {
    host: 'localhost',
    port: 3306,
    user: 'app',
    password: 'secret',
    database: 'cognimesh'
  },
  roadmap: { cacheTTL: 300000 },
  checkpoint: { repoPath: process.cwd() }
});

await manager.initialize();

// Use database
const result = await manager.db.query(
  'SELECT * FROM tasks WHERE status = ?',
  ['pending']
);

// Use roadmaps
const roadmap = await manager.roadmaps.createRoadmap({
  title: 'Q1 Development Plan',
  description: 'First quarter development roadmap',
  phases: [
    { name: 'Planning', order: 1, milestones: [] },
    { name: 'Development', order: 2, milestones: [] }
  ]
});

// Use checkpoints
const checkpoint = await manager.checkpoints.createCheckpoint(
  'Pre-release checkpoint'
);

// Cleanup
await manager.close();
```
