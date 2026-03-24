# Composition Module

## Overview

The Composition Module provides a unified data access layer for CogniMesh v5.0. It abstracts database operations, roadmap management, and git checkpoint functionality behind clean gateway interfaces, enabling loose coupling between business logic and data sources.

## Architecture

### Gateway Pattern

```
┌─────────────────────────────────────────────────────────┐
│              CompositionGatewayManager                   │
├──────────────┬──────────────────┬───────────────────────┤
│   DBGateway  │  RoadmapGateway  │ GitCheckpointGateway  │
├──────────────┼──────────────────┼───────────────────────┤
│ Query        │ Roadmap CRUD     │ Checkpoint Create     │
│ Transaction  │ Progress Track   │ Checkpoint Restore    │
│ Connection   │ Caching          │ Diff Generation       │
│ Pool         │ Filtering        │ Tag Management        │
└──────────────┴──────────────────┴───────────────────────┘
```

### Data Flow

```
Business Logic → Gateway Manager → Specific Gateway → Data Source
                      ↓
               (Caching, Events, Error Handling)
```

## Components

### DBGateway

Centralized database access:

- **Connection Pooling**: Manages database connections
- **Query Execution**: Executes SQL with parameter binding
- **Transaction Support**: Multi-query transaction handling
- **Read Replicas**: Automatic read replica routing
- **Health Monitoring**: Connection health checks

### RoadmapGateway

Roadmap data management:

- **CRUD Operations**: Create, read, update, delete roadmaps
- **Progress Tracking**: Milestone and phase progress
- **Caching**: Redis/memory caching for performance
- **Filtering**: Advanced roadmap filtering
- **Batch Operations**: Bulk roadmap updates

### GitCheckpointGateway

Version control integration:

- **Checkpoint Creation**: Git tag-based checkpoints
- **Restore Functionality**: Rollback to checkpoints
- **Diff Generation**: Compare checkpoints
- **Metadata Tracking**: Checkpoint annotations
- **Cleanup**: Old checkpoint management

## Usage

### Manager Initialization

```javascript
import { CompositionGatewayManager } from './composition/index.js';

const manager = new CompositionGatewayManager({
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    readReplica: {
      host: process.env.DB_REPLICA_HOST,
      port: parseInt(process.env.DB_REPLICA_PORT)
    }
  },
  roadmap: {
    cacheTTL: 300000,  // 5 minutes
    enableCache: true
  },
  checkpoint: {
    repoPath: process.cwd(),
    tagPrefix: 'checkpoint/',
    autoCleanup: true,
    maxCheckpoints: 50
  }
});

await manager.initialize();
```

### Database Operations

```javascript
// Simple query
const users = await manager.db.query(
  'SELECT * FROM users WHERE active = ?',
  [true]
);

// Transaction
await manager.db.transaction([
  { 
    sql: 'INSERT INTO orders (user_id, total) VALUES (?, ?)',
    params: [userId, total]
  },
  {
    sql: 'UPDATE inventory SET quantity = quantity - ? WHERE id = ?',
    params: [quantity, productId]
  }
]);

// Connection management
const connection = await manager.db.getConnection();
try {
  // Use connection
} finally {
  await connection.release();
}
```

### Roadmap Management

```javascript
// Create roadmap
const roadmap = await manager.roadmaps.createRoadmap({
  title: 'Product Launch 2024',
  description: 'Complete product launch roadmap',
  status: 'active',
  phases: [
    {
      name: 'Planning',
      order: 1,
      milestones: [
        { name: 'Market Research', completed: true },
        { name: 'Requirements Doc', completed: false }
      ]
    },
    {
      name: 'Development',
      order: 2,
      milestones: [
        { name: 'MVP Complete', completed: false },
        { name: 'Beta Testing', completed: false }
      ]
    }
  ]
});

// Update progress
await manager.roadmaps.updateProgress(roadmap.id, {
  phaseId: roadmap.phases[0].id,
  milestoneId: roadmap.phases[0].milestones[0].id,
  completed: true
});

// Get with filtering
const activeRoadmaps = await manager.roadmaps.getRoadmaps({
  status: 'active',
  createdAfter: '2024-01-01'
});

// Cache stats
const stats = manager.roadmaps.getCacheStats();
console.log(`Cache hits: ${stats.hits}, misses: ${stats.misses}`);
```

### Git Checkpoints

```javascript
// Create checkpoint
const checkpoint = await manager.checkpoints.createCheckpoint(
  'Before database migration',
  { files: ['migrations/*.sql'] }
);

console.log(`Created checkpoint: ${checkpoint.tag}`);

// List checkpoints
const checkpoints = await manager.checkpoints.listCheckpoints();
checkpoints.forEach(cp => {
  console.log(`${cp.tag}: ${cp.message} (${cp.createdAt})`);
});

// Compare checkpoints
const diff = await manager.checkpoints.diffCheckpoints(
  'checkpoint/001',
  'checkpoint/005'
);
console.log(`Files changed: ${diff.filesChanged.length}`);
console.log(`Additions: ${diff.additions}, Deletions: ${diff.deletions}`);

// Restore checkpoint
await manager.checkpoints.restoreCheckpoint('checkpoint/003');
```

### Event Handling

```javascript
// Database events
manager.db.on('query', ({ sql, rows, duration }) => {
  console.log(`Query took ${duration}ms, returned ${rows} rows`);
});

// Roadmap events
manager.roadmaps.on('roadmapCreated', ({ id, title }) => {
  console.log(`Roadmap created: ${title} (${id})`);
});

// Checkpoint events
manager.checkpoints.on('checkpointCreated', (checkpoint) => {
  console.log(`Checkpoint created: ${checkpoint.tag}`);
});
```

### Health Monitoring

```javascript
// Check all gateways
const health = manager.getHealthStatus();
console.log('DB Health:', health.db);
console.log('Roadmaps:', health.roadmaps);
console.log('Checkpoints:', health.checkpoints);

// Individual gateway health
const dbHealth = await manager.db.checkHealth();
if (!dbHealth.healthy) {
  console.error('Database unhealthy:', dbHealth.message);
}
```

## Configuration

### Database Configuration

```javascript
{
  host: 'localhost',
  port: 3306,
  user: 'cognimesh',
  password: 'secure-password',
  database: 'cognimesh_db',
  
  // Connection pool
  poolSize: 10,
  minConnections: 2,
  acquireTimeout: 30000,
  idleTimeout: 300000,
  
  // Read replica
  readReplica: {
    host: 'replica.local',
    port: 3306,
    user: 'readonly',
    password: 'readonly-password'
  },
  
  // SSL
  ssl: {
    ca: fs.readFileSync('ca.pem'),
    cert: fs.readFileSync('cert.pem'),
    key: fs.readFileSync('key.pem')
  }
}
```

### Roadmap Configuration

```javascript
{
  // Caching
  enableCache: true,
  cacheTTL: 300000,        // 5 minutes
  cacheMaxSize: 100,       // Max cached roadmaps
  
  // Database
  tablePrefix: 'roadmap_',
  
  // Features
  enableVersioning: true,
  enableAuditLog: true,
  
  // Validation
  maxPhases: 20,
  maxMilestonesPerPhase: 50
}
```

### Checkpoint Configuration

```javascript
{
  // Repository
  repoPath: process.cwd(),
  workTree: process.cwd(),
  gitDir: '.git',
  
  // Tagging
  tagPrefix: 'checkpoint/',
  tagDateFormat: 'YYYYMMDD-HHmmss',
  
  // Cleanup
  autoCleanup: true,
  maxCheckpoints: 100,
  retentionDays: 90,
  
  // Annotations
  includeDiff: false,
  includeStats: true
}
```

## Best Practices

1. **Use Transactions**: Group related operations in transactions
2. **Cache Strategically**: Enable caching for frequently accessed roadmaps
3. **Handle Connection Errors**: Implement retry logic for database operations
4. **Regular Checkpoints**: Create checkpoints before major changes
5. **Monitor Health**: Regular health checks for all gateways
6. **Clean Up**: Remove old checkpoints to manage repository size
7. **Pool Sizing**: Size connection pools based on expected load
8. **Event Logging**: Log important gateway events for debugging
