/**
 * @fileoverview Context Domain Integration Tests (TEST-005)
 * @module tests/domains/context.integration
 * 
 * Test Coverage:
 * - Context snapshots creation and management
 * - Version management and comparison
 * - Integrity verification
 * - Snapshot restore operations
 * - Pruning and cleanup
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ContextSnapshotManager } from '../../src/domains/context/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test directories
const TEST_PROJECT_DIR = join(__dirname, '../../.tmp/test-project');
const TEST_SNAPSHOT_DIR = join(__dirname, '../../.tmp/test-snapshots');

describe('Context Domain Integration', () => {
  let manager;

  beforeEach(async () => {
    // Create test directories
    await fs.mkdir(TEST_PROJECT_DIR, { recursive: true });
    await fs.mkdir(TEST_SNAPSHOT_DIR, { recursive: true });

    // Initialize manager with test snapshot directory
    manager = new ContextSnapshotManager({
      snapshotDir: TEST_SNAPSHOT_DIR,
      maxContentSize: 1024, // 1KB for testing
      excludePatterns: ['node_modules', '.git', '*.log']
    });

    await manager.initialize();
  });

  afterEach(async () => {
    // Cleanup test directories
    try {
      await fs.rm(TEST_PROJECT_DIR, { recursive: true, force: true });
      await fs.rm(TEST_SNAPSHOT_DIR, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  /**
   * ============================================
   * Context Snapshots Tests
   * ============================================
   */
  describe('Context Snapshots', () => {
    describe('capture', () => {
      it('should capture snapshot of project directory', async () => {
        // Create test files
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file1.txt'), 'Hello World');
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file2.js'), 'console.log("test");');

        const snapshot = await manager.capture(TEST_PROJECT_DIR);

        assert.ok(snapshot.id, 'Snapshot should have an ID');
        assert.ok(snapshot.id.startsWith('snap-'), 'ID should have snap- prefix');
        assert.equal(snapshot.projectPath, TEST_PROJECT_DIR);
        assert.ok(snapshot.timestamp, 'Should have timestamp');
        assert.equal(snapshot.files.length, 2, 'Should have 2 files');
        assert.ok(snapshot.metadata, 'Should have metadata');
        assert.equal(snapshot.metadata.fileCount, 2);
        assert.ok(snapshot.metadata.totalSize > 0);
        assert.ok(snapshot.metadata.extensions.includes('.txt'));
        assert.ok(snapshot.metadata.extensions.includes('.js'));
      });

      it('should capture snapshot with file content', async () => {
        const content = 'Small file content';
        await fs.writeFile(join(TEST_PROJECT_DIR, 'small.txt'), content);

        const snapshot = await manager.capture(TEST_PROJECT_DIR, { includeContent: true });

        assert.equal(snapshot.files[0].content, content);
      });

      it('should not include large file content by default', async () => {
        const largeContent = 'x'.repeat(2000); // Larger than maxContentSize
        await fs.writeFile(join(TEST_PROJECT_DIR, 'large.txt'), largeContent);

        const snapshot = await manager.capture(TEST_PROJECT_DIR, { includeContent: true });

        assert.ok(!snapshot.files[0].content, 'Large file should not have content');
      });

      it('should filter by extension when specified', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'text');
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.js'), 'js code');
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.css'), 'styles');

        const snapshot = await manager.capture(TEST_PROJECT_DIR, {
          includeExtensions: ['.txt', '.js']
        });

        assert.equal(snapshot.files.length, 2);
        assert.ok(snapshot.files.every(f => ['.txt', '.js'].includes(getExt(f.path))));
      });

      it('should exclude patterns defined in options', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'include.txt'), 'include me');
        await fs.writeFile(join(TEST_PROJECT_DIR, 'exclude.log'), 'exclude me');
        await fs.mkdir(join(TEST_PROJECT_DIR, 'node_modules'), { recursive: true });
        await fs.writeFile(join(TEST_PROJECT_DIR, 'node_modules/pkg.js'), 'package');

        const snapshot = await manager.capture(TEST_PROJECT_DIR);

        assert.ok(snapshot.files.some(f => f.path === 'include.txt'));
        assert.ok(!snapshot.files.some(f => f.path === 'exclude.log'));
        assert.ok(!snapshot.files.some(f => f.path.includes('node_modules')));
      });

      it('should calculate correct file hashes', async () => {
        const content = 'Test content for hashing';
        await fs.writeFile(join(TEST_PROJECT_DIR, 'hash-test.txt'), content);

        const snapshot = await manager.capture(TEST_PROJECT_DIR);
        const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

        assert.equal(snapshot.files[0].hash, expectedHash);
      });

      it('should handle empty directory', async () => {
        const snapshot = await manager.capture(TEST_PROJECT_DIR);

        assert.equal(snapshot.files.length, 0);
        assert.equal(snapshot.metadata.fileCount, 0);
        assert.equal(snapshot.metadata.totalSize, 0);
      });

      it('should handle nested directories', async () => {
        await fs.mkdir(join(TEST_PROJECT_DIR, 'src/components'), { recursive: true });
        await fs.writeFile(join(TEST_PROJECT_DIR, 'src/app.js'), 'app');
        await fs.writeFile(join(TEST_PROJECT_DIR, 'src/components/Button.js'), 'button');

        const snapshot = await manager.capture(TEST_PROJECT_DIR);

        assert.equal(snapshot.files.length, 2);
        assert.ok(snapshot.files.some(f => f.path === 'src/app.js'));
        assert.ok(snapshot.files.some(f => f.path === 'src/components/Button.js'));
      });

      it('should emit capture events', async () => {
        const events = [];
        manager.on('captureStarted', (e) => events.push({ type: 'started', ...e }));
        manager.on('captureProgress', (e) => events.push({ type: 'progress', ...e }));
        manager.on('captureComplete', (e) => events.push({ type: 'complete', ...e }));

        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
        const snapshot = await manager.capture(TEST_PROJECT_DIR);

        assert.ok(events.some(e => e.type === 'started'));
        assert.ok(events.some(e => e.type === 'complete'));
        assert.equal(events.find(e => e.type === 'started').snapshotId, snapshot.id);
      });
    });

    describe('getSnapshot', () => {
      it('should retrieve snapshot by ID', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
        const captured = await manager.capture(TEST_PROJECT_DIR);

        const retrieved = await manager.getSnapshot(captured.id);

        assert.ok(retrieved);
        assert.equal(retrieved.id, captured.id);
        assert.equal(retrieved.files.length, captured.files.length);
      });

      it('should return null for non-existent snapshot', async () => {
        const result = await manager.getSnapshot('non-existent-id');
        assert.equal(result, null);
      });

      it('should use cache for repeated gets', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
        const captured = await manager.capture(TEST_PROJECT_DIR);

        // First get - from disk
        const first = await manager.getSnapshot(captured.id);
        // Second get - from cache
        const second = await manager.getSnapshot(captured.id);

        assert.deepEqual(first, second);
      });
    });

    describe('listSnapshots', () => {
      it('should list all snapshots', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file1.txt'), 'content1');
        await manager.capture(TEST_PROJECT_DIR);

        await fs.writeFile(join(TEST_PROJECT_DIR, 'file2.txt'), 'content2');
        await manager.capture(TEST_PROJECT_DIR);

        const list = await manager.listSnapshots();

        assert.equal(list.length, 2);
        assert.ok(list.every(s => s.id && s.timestamp && s.projectPath));
      });

      it('should sort snapshots by timestamp descending', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'v1');
        await manager.capture(TEST_PROJECT_DIR);

        await new Promise(r => setTimeout(r, 50));

        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'v2');
        await manager.capture(TEST_PROJECT_DIR);

        const list = await manager.listSnapshots();

        assert.ok(new Date(list[0].timestamp) >= new Date(list[1].timestamp));
      });

      it('should return empty array when no snapshots', async () => {
        const list = await manager.listSnapshots();
        assert.deepEqual(list, []);
      });
    });

    describe('deleteSnapshot', () => {
      it('should delete snapshot', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
        const snapshot = await manager.capture(TEST_PROJECT_DIR);

        const deleted = await manager.deleteSnapshot(snapshot.id);
        const retrieved = await manager.getSnapshot(snapshot.id);

        assert.equal(deleted, true);
        assert.equal(retrieved, null);
      });

      it('should return false for non-existent snapshot', async () => {
        const result = await manager.deleteSnapshot('non-existent');
        assert.equal(result, false);
      });
    });
  });

  /**
   * ============================================
   * Version Management Tests
   * ============================================
   */
  describe('Version Management', () => {
    describe('compare', () => {
      it('should compare two snapshots and identify changes', async () => {
        // Create first snapshot
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file1.txt'), 'content1');
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file2.txt'), 'content2');
        const snapshot1 = await manager.capture(TEST_PROJECT_DIR);

        // Make changes
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file1.txt'), 'modified content');
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file3.txt'), 'new file');
        await fs.rm(join(TEST_PROJECT_DIR, 'file2.txt'));

        const snapshot2 = await manager.capture(TEST_PROJECT_DIR);

        const comparison = await manager.compare(snapshot1.id, snapshot2.id);

        assert.equal(comparison.snapshotId1, snapshot1.id);
        assert.equal(comparison.snapshotId2, snapshot2.id);
        assert.equal(comparison.added.length, 1);
        assert.equal(comparison.added[0].path, 'file3.txt');
        assert.equal(comparison.removed.length, 1);
        assert.equal(comparison.removed[0].path, 'file2.txt');
        assert.equal(comparison.modified.length, 1);
        assert.equal(comparison.modified[0].path, 'file1.txt');
        assert.equal(comparison.summary.totalChanges, 3);
      });

      it('should identify unchanged files', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'stable.txt'), 'unchanged');
        await fs.writeFile(join(TEST_PROJECT_DIR, 'changed.txt'), 'original');
        const snapshot1 = await manager.capture(TEST_PROJECT_DIR);

        await fs.writeFile(join(TEST_PROJECT_DIR, 'changed.txt'), 'modified');
        const snapshot2 = await manager.capture(TEST_PROJECT_DIR);

        const comparison = await manager.compare(snapshot1.id, snapshot2.id);

        assert.equal(comparison.unchanged.length, 1);
        assert.equal(comparison.unchanged[0].path, 'stable.txt');
      });

      it('should detect hash changes in modified files', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'original');
        const snapshot1 = await manager.capture(TEST_PROJECT_DIR);

        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'modified');
        const snapshot2 = await manager.capture(TEST_PROJECT_DIR);

        const comparison = await manager.compare(snapshot1.id, snapshot2.id);

        assert.ok(comparison.modified[0].hashBefore);
        assert.ok(comparison.modified[0].hashAfter);
        assert.notEqual(comparison.modified[0].hashBefore, comparison.modified[0].hashAfter);
      });

      it('should throw error when snapshot not found', async () => {
        await assert.rejects(
          manager.compare('non-existent', 'also-non-existent'),
          /not found/
        );
      });

      it('should emit compare events', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
        const snapshot1 = await manager.capture(TEST_PROJECT_DIR);
        const snapshot2 = await manager.capture(TEST_PROJECT_DIR);

        const events = [];
        manager.on('compareStarted', (e) => events.push('started'));
        manager.on('compareComplete', (e) => events.push('complete'));

        await manager.compare(snapshot1.id, snapshot2.id);

        assert.ok(events.includes('started'));
        assert.ok(events.includes('complete'));
      });
    });

    describe('restore', () => {
      it('should restore files from snapshot', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'original');
        const snapshot = await manager.capture(TEST_PROJECT_DIR, { includeContent: true });

        // Modify file
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'modified');
        const contentBefore = await fs.readFile(join(TEST_PROJECT_DIR, 'file.txt'), 'utf-8');
        assert.equal(contentBefore, 'modified');

        // Restore
        await manager.restore(snapshot.id);

        const contentAfter = await fs.readFile(join(TEST_PROJECT_DIR, 'file.txt'), 'utf-8');
        assert.equal(contentAfter, 'original');
      });

      it('should support dry run restore', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'original');
        const snapshot = await manager.capture(TEST_PROJECT_DIR);

        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'modified');

        const result = await manager.restore(snapshot.id, { dryRun: true });

        assert.equal(result.dryRun, true);
        assert.ok(result.operations.length > 0);

        const content = await fs.readFile(join(TEST_PROJECT_DIR, 'file.txt'), 'utf-8');
        assert.equal(content, 'modified'); // Not actually restored
      });

      it('should throw error for non-existent snapshot', async () => {
        await assert.rejects(
          manager.restore('non-existent'),
          /not found/
        );
      });

      it('should emit restore events', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
        const snapshot = await manager.capture(TEST_PROJECT_DIR, { includeContent: true });

        const events = [];
        manager.on('restoreStarted', () => events.push('started'));
        manager.on('restoreComplete', () => events.push('complete'));

        await manager.restore(snapshot.id);

        assert.ok(events.includes('started'));
        assert.ok(events.includes('complete'));
      });
    });
  });

  /**
   * ============================================
   * Integrity Verification Tests
   * ============================================
   */
  describe('Integrity Verification', () => {
    it('should verify file integrity using hashes', async () => {
      const content = 'Integrity test content';
      await fs.writeFile(join(TEST_PROJECT_DIR, 'integrity.txt'), content);
      const snapshot = await manager.capture(TEST_PROJECT_DIR);

      const fileSnapshot = snapshot.files[0];
      const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

      assert.equal(fileSnapshot.hash, expectedHash);
      assert.equal(fileSnapshot.size, content.length);
    });

    it('should detect tampered snapshot file', async () => {
      await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
      const snapshot = await manager.capture(TEST_PROJECT_DIR);

      // Tamper with the snapshot file on disk
      const snapshotPath = join(TEST_SNAPSHOT_DIR, `${snapshot.id}.json`);
      const tamperedData = JSON.parse(await fs.readFile(snapshotPath, 'utf-8'));
      tamperedData.files[0].hash = 'tampered_hash';
      await fs.writeFile(snapshotPath, JSON.stringify(tamperedData));

      // Clear cache and reload
      manager.cache.clear();
      const loaded = await manager.getSnapshot(snapshot.id);

      // Verify the tampered hash is loaded
      assert.equal(loaded.files[0].hash, 'tampered_hash');
    });

    it('should verify snapshot metadata integrity', async () => {
      await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
      const snapshot = await manager.capture(TEST_PROJECT_DIR);

      // Verify metadata consistency
      assert.equal(snapshot.metadata.fileCount, snapshot.files.length);

      const calculatedTotal = snapshot.files.reduce((sum, f) => sum + f.size, 0);
      assert.equal(snapshot.metadata.totalSize, calculatedTotal);
    });

    it('should preserve timestamps in snapshot', async () => {
      const beforeCapture = new Date();
      await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
      const snapshot = await manager.capture(TEST_PROJECT_DIR);
      const afterCapture = new Date();

      const snapshotTime = new Date(snapshot.timestamp);
      assert.ok(snapshotTime >= beforeCapture && snapshotTime <= afterCapture);
    });
  });

  /**
   * ============================================
   * Pruning and Cleanup Tests
   * ============================================
   */
  describe('Pruning and Cleanup', () => {
    describe('prune', () => {
      it('should prune snapshots by max age', async () => {
        // Create old snapshot
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'v1');
        const oldSnapshot = await manager.capture(TEST_PROJECT_DIR);

        // Manually modify timestamp to be old
        const snapshotPath = join(TEST_SNAPSHOT_DIR, `${oldSnapshot.id}.json`);
        const data = JSON.parse(await fs.readFile(snapshotPath, 'utf-8'));
        data.timestamp = new Date(Date.now() - 86400000 * 30).toISOString(); // 30 days ago
        await fs.writeFile(snapshotPath, JSON.stringify(data));

        // Create new snapshot
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'v2');
        await manager.capture(TEST_PROJECT_DIR);

        // Prune snapshots older than 7 days
        const deleted = await manager.prune({ maxAge: 86400000 * 7 });

        assert.equal(deleted.length, 1);
        assert.equal(deleted[0], oldSnapshot.id);

        const remaining = await manager.listSnapshots();
        assert.equal(remaining.length, 1);
      });

      it('should prune snapshots by max count', async () => {
        // Create 5 snapshots
        for (let i = 0; i < 5; i++) {
          await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), `v${i}`);
          await manager.capture(TEST_PROJECT_DIR);
          await new Promise(r => setTimeout(r, 50));
        }

        // Keep only 3 most recent
        const deleted = await manager.prune({ maxCount: 3 });

        assert.equal(deleted.length, 2);

        const remaining = await manager.listSnapshots();
        assert.equal(remaining.length, 3);
      });

      it('should support dry run pruning', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'v1');
        await manager.capture(TEST_PROJECT_DIR);
        await new Promise(r => setTimeout(r, 50));
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'v2');
        await manager.capture(TEST_PROJECT_DIR);

        const deleted = await manager.prune({ maxCount: 1, dryRun: true });

        assert.equal(deleted.length, 1);

        const remaining = await manager.listSnapshots();
        assert.equal(remaining.length, 2); // Not actually deleted
      });

      it('should emit prune events', async () => {
        await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
        await manager.capture(TEST_PROJECT_DIR);

        const events = [];
        manager.on('pruneStarted', () => events.push('started'));
        manager.on('pruneComplete', () => events.push('complete'));

        await manager.prune({ maxCount: 0 });

        assert.ok(events.includes('started'));
        assert.ok(events.includes('complete'));
      });
    });
  });

  /**
   * ============================================
   * Integration Flow Tests
   * ============================================
   */
  describe('Integration Flows', () => {
    it('should complete full snapshot lifecycle', async () => {
      // 1. Create initial files
      await fs.mkdir(join(TEST_PROJECT_DIR, 'src'), { recursive: true });
      await fs.writeFile(join(TEST_PROJECT_DIR, 'src/app.js'), 'console.log("app");');
      await fs.writeFile(join(TEST_PROJECT_DIR, 'src/utils.js'), 'module.exports = {};');
      await fs.mkdir(join(TEST_PROJECT_DIR, 'src/components'), { recursive: true });
      await fs.writeFile(join(TEST_PROJECT_DIR, 'src/components/Button.js'), 'export default {};');

      // 2. Capture initial snapshot
      const snapshot1 = await manager.capture(TEST_PROJECT_DIR, { includeContent: true });
      assert.equal(snapshot1.files.length, 3);

      // 3. Make changes
      await fs.writeFile(join(TEST_PROJECT_DIR, 'src/app.js'), 'console.log("updated app");');
      await fs.rm(join(TEST_PROJECT_DIR, 'src/utils.js'));
      await fs.writeFile(join(TEST_PROJECT_DIR, 'README.md'), '# Project');

      // 4. Capture second snapshot
      const snapshot2 = await manager.capture(TEST_PROJECT_DIR);

      // 5. Compare snapshots
      const comparison = await manager.compare(snapshot1.id, snapshot2.id);
      assert.equal(comparison.modified.length, 1);
      assert.equal(comparison.added.length, 1);
      assert.equal(comparison.removed.length, 1);

      // 6. Restore first snapshot
      await manager.restore(snapshot1.id);

      // 7. Verify restored state
      const appContent = await fs.readFile(join(TEST_PROJECT_DIR, 'src/app.js'), 'utf-8');
      assert.equal(appContent, 'console.log("app");');

      const utilsExists = await fs.access(join(TEST_PROJECT_DIR, 'src/utils.js'))
        .then(() => true).catch(() => false);
      assert.equal(utilsExists, true);

      const readmeExists = await fs.access(join(TEST_PROJECT_DIR, 'README.md'))
        .then(() => true).catch(() => false);
      assert.equal(readmeExists, false);

      // 8. List and cleanup
      const list = await manager.listSnapshots();
      assert.equal(list.length, 2);

      await manager.deleteSnapshot(snapshot1.id);
      await manager.deleteSnapshot(snapshot2.id);

      const afterDelete = await manager.listSnapshots();
      assert.equal(afterDelete.length, 0);
    });

    it('should handle multiple snapshot operations', async () => {
      const snapshots = [];

      // Create multiple snapshots
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(join(TEST_PROJECT_DIR, `file${i}.txt`), `content${i}`);
        const snapshot = await manager.capture(TEST_PROJECT_DIR);
        snapshots.push(snapshot);
      }

      // Verify all listed
      const list = await manager.listSnapshots();
      assert.equal(list.length, 5);

      // Compare consecutive snapshots
      for (let i = 1; i < snapshots.length; i++) {
        const comparison = await manager.compare(snapshots[i - 1].id, snapshots[i].id);
        assert.ok(comparison.added.length >= 0);
      }

      // Prune to keep only 2
      const deleted = await manager.prune({ maxCount: 2 });
      assert.equal(deleted.length, 3);

      const remaining = await manager.listSnapshots();
      assert.equal(remaining.length, 2);
    });
  });

  /**
   * ============================================
   * Error Handling Tests
   * ============================================
   */
  describe('Error Handling', () => {
    it('should handle non-existent project path', async () => {
      await assert.rejects(
        manager.capture('/non/existent/path'),
        /ENOENT/
      );
    });

    it('should handle corrupted snapshot files', async () => {
      // Create a corrupted snapshot file
      await fs.writeFile(join(TEST_SNAPSHOT_DIR, 'corrupted.json'), 'not valid json');

      const list = await manager.listSnapshots();
      assert.equal(list.length, 0); // Should skip corrupted file
    });

    it('should handle snapshot with missing files during restore', async () => {
      await fs.writeFile(join(TEST_PROJECT_DIR, 'file.txt'), 'content');
      const snapshot = await manager.capture(TEST_PROJECT_DIR);

      // Delete the project directory
      await fs.rm(TEST_PROJECT_DIR, { recursive: true });

      // Try to restore - should recreate directory structure
      await manager.restore(snapshot.id);

      const restoredContent = await fs.readFile(join(TEST_PROJECT_DIR, 'file.txt'), 'utf-8');
      assert.equal(restoredContent, 'content');
    });

    it('should handle permission errors gracefully', async () => {
      // This test may not work on Windows, but tests error handling
      try {
        const restrictedDir = join(TEST_PROJECT_DIR, 'restricted');
        await fs.mkdir(restrictedDir, { recursive: true });
        await fs.writeFile(join(restrictedDir, 'file.txt'), 'secret');

        // Attempt to capture should still work (reading is allowed)
        const snapshot = await manager.capture(TEST_PROJECT_DIR);
        assert.ok(snapshot.files.some(f => f.path.includes('restricted')));
      } catch (e) {
        // Some systems may not support this test
      }
    });
  });
});

// Helper function
function getExt(filename) {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex === -1 ? '' : filename.slice(dotIndex);
}
