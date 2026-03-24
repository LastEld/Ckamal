# Context Domain Contract

## Overview

The Context Domain manages project context snapshots for CogniMesh, enabling capture, restoration, and comparison of project states over time.

## Interface

### ContextSnapshotManager Class

```javascript
import { ContextSnapshotManager } from './domains/context/index.js';

const manager = new ContextSnapshotManager({
  snapshotDir: '.snapshots',
  maxContentSize: 102400,
  excludePatterns: ['node_modules', '.git', 'dist', 'build']
});

await manager.initialize();
```

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `snapshotDir` | string | `.snapshots` | Directory to store snapshots |
| `maxContentSize` | number | `102400` | Max file size to store content (bytes) |
| `excludePatterns` | string[] | See below | Patterns to exclude from snapshots |

Default exclude patterns: `['node_modules', '.git', 'dist', 'build', '.snapshots', '*.log']`

#### Methods

##### initialize()
Initializes the snapshot manager and creates snapshot directory.

- **Returns:** `Promise<void>`

##### capture(projectPath, options)
Captures a new context snapshot.

- **Parameters:**
  - `projectPath` (string): Project path to capture
  - `options` (Object, optional):
    - `includeContent` (boolean): Include file contents
    - `includeExtensions` (string[]): Specific extensions to include
- **Returns:** `Promise<ContextSnapshot>`
- **Events:**
  - `captureStarted` - Capture initiated
  - `captureProgress` - Progress updates during capture
  - `captureComplete` - Capture finished
  - `captureError` - Capture failed

##### restore(snapshotId, options)
Restores project state from snapshot.

- **Parameters:**
  - `snapshotId` (string): Snapshot to restore
  - `options` (Object, optional):
    - `targetPath` (string): Override target path
    - `dryRun` (boolean): Preview changes without applying
- **Returns:** `Promise<RestoreResult>`
- **Events:**
  - `restoreStarted` - Restore initiated
  - `restoreComplete` - Restore finished
  - `restoreError` - Restore failed

##### compare(snapshot1, snapshot2)
Compares two snapshots and returns detailed differences.

- **Parameters:**
  - `snapshot1` (string|ContextSnapshot): First snapshot ID or object
  - `snapshot2` (string|ContextSnapshot): Second snapshot ID or object
- **Returns:** `Promise<SnapshotComparison>`
- **Events:**
  - `compareStarted` - Comparison initiated
  - `compareComplete` - Comparison finished
  - `compareError` - Comparison failed

##### prune(options)
Prunes old snapshots based on age or count.

- **Parameters:**
  - `options` (PruneOptions):
    - `maxAge` (number): Maximum age in milliseconds
    - `maxCount` (number): Maximum number of snapshots to keep
    - `dryRun` (boolean): If true, don't actually delete
- **Returns:** `Promise<string[]>` - IDs of deleted snapshots
- **Events:**
  - `pruneStarted` - Prune initiated
  - `pruneComplete` - Prune finished
  - `pruneError` - Prune failed

##### listSnapshots()
Lists all available snapshots.

- **Returns:** `Promise<SnapshotListItem[]>`

##### getSnapshot(snapshotId)
Gets a specific snapshot by ID.

- **Parameters:**
  - `snapshotId` (string): Snapshot identifier
- **Returns:** `Promise<ContextSnapshot|null>`

##### deleteSnapshot(snapshotId)
Deletes a specific snapshot.

- **Parameters:**
  - `snapshotId` (string): Snapshot to delete
- **Returns:** `Promise<boolean>` - True if deleted successfully

## Types

### ContextSnapshot
```typescript
interface ContextSnapshot {
  id: string;
  projectPath: string;
  timestamp: string;
  files: FileSnapshot[];
  metadata: {
    fileCount: number;
    totalSize: number;
    extensions: string[];
  };
}
```

### FileSnapshot
```typescript
interface FileSnapshot {
  path: string;
  hash: string;           // SHA-256 hash
  size: number;
  modified: string;       // ISO timestamp
  content?: string;       // Optional file content
}
```

### SnapshotComparison
```typescript
interface SnapshotComparison {
  snapshotId1: string;
  snapshotId2: string;
  added: FileChange[];
  removed: FileChange[];
  modified: FileChange[];
  unchanged: FileChange[];
  summary: {
    totalChanges: number;
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
  };
}
```

### FileChange
```typescript
interface FileChange {
  path: string;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  sizeBefore?: number;
  sizeAfter?: number;
  hashBefore?: string;
  hashAfter?: string;
}
```

### RestoreResult
```typescript
interface RestoreResult {
  snapshotId: string;
  targetPath: string;
  operations: Array<{
    type: string;
    path: string;
    size?: number;
  }>;
  fileCount: number;
  dryRun: boolean;
}
```

### SnapshotListItem
```typescript
interface SnapshotListItem {
  id: string;
  timestamp: string;
  projectPath: string;
  fileCount: number;
}
```

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `captureStarted` | `{ snapshotId, projectPath, timestamp }` | Capture initiated |
| `captureProgress` | `{ current, total, file }` | Progress update |
| `captureComplete` | `{ snapshotId, snapshot }` | Capture finished |
| `captureError` | `{ snapshotId, error }` | Capture failed |
| `restoreStarted` | `{ snapshotId }` | Restore initiated |
| `restoreComplete` | `RestoreResult` | Restore finished |
| `restoreError` | `{ snapshotId, error }` | Restore failed |
| `compareStarted` | `{ snapshot1, snapshot2 }` | Comparison initiated |
| `compareComplete` | `SnapshotComparison` | Comparison finished |
| `compareError` | `{ error }` | Comparison failed |
| `pruneStarted` | `PruneOptions` | Prune initiated |
| `pruneComplete` | `{ deleted, dryRun }` | Prune finished |
| `pruneError` | `{ error }` | Prune failed |

## Usage Examples

### Basic Capture
```javascript
const manager = new ContextSnapshotManager();
await manager.initialize();

const snapshot = await manager.capture('./my-project');
console.log(`Captured ${snapshot.metadata.fileCount} files`);
console.log(`Snapshot ID: ${snapshot.id}`);
```

### Capture with Progress
```javascript
manager.on('captureProgress', ({ current, total, file }) => {
  const percent = Math.round((current / total) * 100);
  console.log(`${percent}% - ${file}`);
});

await manager.capture('./project');
```

### Compare Snapshots
```javascript
const comparison = await manager.compare('snap-abc-123', 'snap-def-456');

console.log('Changes:', comparison.summary.totalChanges);
console.log('Added:', comparison.added.length);
console.log('Removed:', comparison.removed.length);
console.log('Modified:', comparison.modified.length);

// List modified files
comparison.modified.forEach(change => {
  console.log(`${change.path}: ${change.sizeBefore} -> ${change.sizeAfter} bytes`);
});
```

### Restore with Dry Run
```javascript
const preview = await manager.restore('snap-abc-123', { dryRun: true });
console.log('Would restore:', preview.operations);

// Actually restore
await manager.restore('snap-abc-123');
```

### Prune Old Snapshots
```javascript
// Delete snapshots older than 7 days
const weekAgo = 7 * 24 * 60 * 60 * 1000;
const deleted = await manager.prune({ 
  maxAge: weekAgo,
  dryRun: false 
});
console.log(`Deleted ${deleted.length} snapshots`);

// Keep only last 10 snapshots
await manager.prune({ maxCount: 10 });
```

### Event-Driven Usage
```javascript
const manager = new ContextSnapshotManager();

manager
  .on('captureStarted', ({ snapshotId }) => {
    console.log(`Starting capture: ${snapshotId}`);
  })
  .on('captureProgress', ({ current, total }) => {
    console.log(`Progress: ${current}/${total}`);
  })
  .on('captureComplete', ({ snapshot }) => {
    console.log(`Captured ${snapshot.metadata.fileCount} files`);
  })
  .on('captureError', ({ error }) => {
    console.error('Capture failed:', error);
  });
```

## Dependencies

- Node.js `events` module
- Node.js `fs/promises` module
- Node.js `path` module
- Node.js `crypto` module

## Error Handling

Common errors:
- `ENOENT`: Project path or snapshot not found
- `EACCES`: Permission denied
- `Error`: General processing errors

All methods may throw errors. Wrap calls in try-catch blocks for production use.

## Storage Format

Snapshots are stored as JSON files in the snapshot directory:
```
.snapshots/
├── snap-abc123-def456.json
├── snap-xyz789-uvw012.json
└── ...
```

Each file contains the complete snapshot data including file metadata and optional content.
