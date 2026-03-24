# Context Domain Acceptance Criteria

## Functional Requirements

- FR1: System shall capture complete project snapshots with file hashes
- FR2: System shall restore project state from any stored snapshot
- FR3: System shall compare snapshots and identify changes (added/removed/modified)
- FR4: System shall support incremental snapshots with optional content inclusion
- FR5: System shall prune old snapshots based on age or count policies
- FR6: System shall exclude configurable patterns from snapshots
- FR7: System shall emit progress events during capture operations
- FR8: System shall cache snapshots for fast retrieval

## Test Scenarios

### Scenario 1: Snapshot Capture
- Given: A project directory with various file types
- When: capture() is called with project path
- Then: All files are scanned recursively
- And: Each file gets SHA-256 hash calculated
- And: File metadata (size, modified time) is captured
- And: Snapshot includes total file count and size
- And: Events 'captureStarted' and 'captureComplete' are emitted

### Scenario 2: Snapshot with Content Inclusion
- Given: A project with files under 100KB size limit
- When: capture() is called with includeContent=true
- Then: File contents are included for files <= maxContentSize
- And: File contents are excluded for larger files
- And: Content is stored as UTF-8 string in snapshot

### Scenario 3: Snapshot Filtering by Extension
- Given: A project with .js, .ts, .css, and .html files
- When: capture() is called with includeExtensions=['.js', '.ts']
- Then: Only JavaScript and TypeScript files are included
- And: Other file types are excluded from snapshot
- And: Metadata reflects filtered file count

### Scenario 4: Snapshot Comparison
- Given: Two snapshots of the same project at different times
- When: compare() is called with both snapshot IDs
- Then: Added files are identified (present in second, not first)
- And: Removed files are identified (present in first, not second)
- And: Modified files are identified (hash mismatch)
- And: Unchanged files are tracked separately
- And: Summary counts are accurate for each change type

### Scenario 5: Project Restoration
- Given: A valid snapshot ID with file records
- When: restore() is called with snapshotId
- Then: All files from snapshot are recreated at target path
- And: Directory structure is recreated as needed
- And: File modification times are restored when possible
- And: Event 'restoreComplete' is emitted with operation details

### Scenario 6: Dry Run Restoration
- Given: A snapshot with multiple files
- When: restore() is called with dryRun=true
- Then: No actual file operations are performed
- And: List of planned operations is returned
- And: Operations include source, target, and size for each file

### Scenario 7: Snapshot Pruning by Age
- Given: 10 snapshots with ages ranging from 1 day to 1 year
- When: prune() is called with maxAge of 30 days
- Then: Snapshots older than 30 days are deleted
- And: Snapshots newer than 30 days are preserved
- And: Deleted snapshot IDs are returned
- And: Event 'pruneComplete' is emitted with deletion count

### Scenario 8: Snapshot Pruning by Count
- Given: 20 snapshots in chronological order
- When: prune() is called with maxCount=10
- Then: Only 10 most recent snapshots are kept
- And: 10 oldest snapshots are deleted
- And: Pruning preserves newest snapshots first

### Scenario 9: Dry Run Pruning
- Given: Multiple snapshots eligible for pruning
- When: prune() is called with dryRun=true
- Then: No snapshots are actually deleted
- And: List of snapshots that would be deleted is returned
- And: Event indicates dryRun status

### Scenario 10: Exclusion Pattern Matching
- Given: A project with node_modules and .git directories
- When: Snapshot capture is performed
- Then: node_modules contents are excluded
- And: .git directory contents are excluded
- And: Files matching *.log pattern are excluded
- And: Exclusions work with glob patterns and substring matching

### Scenario 11: Snapshot Listing
- Given: Multiple stored snapshots
- When: listSnapshots() is called
- Then: All snapshots are returned with id, timestamp, projectPath, fileCount
- And: Results are sorted by timestamp descending (newest first)
- And: Invalid/corrupted snapshot files are skipped gracefully

### Scenario 12: Cache Management
- Given: A snapshot retrieved multiple times
- When: getSnapshot() is called repeatedly
- Then: First call loads from disk
- And: Subsequent calls return cached instance
- And: Cache is invalidated on snapshot deletion

## Performance Requirements

- PR1: Snapshot capture of 1000 files completes in < 3 seconds
- PR2: Hash calculation uses streaming to handle large files
- PR3: Snapshot comparison completes in O(n) where n is total unique files
- PR4: Memory usage scales with snapshot size, not total history
- PR5: Progress events emitted at most every 100ms to prevent event flooding
- PR6: Cache retrieval is O(1) for previously accessed snapshots

## Security Requirements

- SR1: Snapshot files are stored with restricted permissions
- SR2: Path traversal in snapshot restore is prevented
- SR3: Binary files are handled safely without content corruption
- SR4: Snapshot directory is excluded from snapshots to prevent recursion
- SR5: Invalid/corrupted snapshot files don't crash the system
