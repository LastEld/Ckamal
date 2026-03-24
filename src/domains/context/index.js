/**
 * @fileoverview Context Domain - Project context snapshot management
 * @module domains/context
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Context snapshot
 * @typedef {Object} ContextSnapshot
 * @property {string} id - Unique snapshot identifier
 * @property {string} projectPath - Captured project path
 * @property {string} timestamp - ISO timestamp
 * @property {FileSnapshot[]} files - File snapshots
 * @property {Object} metadata - Additional metadata
 * @property {number} metadata.fileCount - Total file count
 * @property {number} metadata.totalSize - Total size in bytes
 * @property {string[]} metadata.extensions - File extensions found
 */

/**
 * File snapshot
 * @typedef {Object} FileSnapshot
 * @property {string} path - Relative file path
 * @property {string} hash - Content hash (SHA-256)
 * @property {number} size - File size in bytes
 * @property {string} modified - Last modified timestamp
 * @property {string} [content] - File content (optional, for small files)
 */

/**
 * Snapshot comparison result
 * @typedef {Object} SnapshotComparison
 * @property {string} snapshotId1 - First snapshot ID
 * @property {string} snapshotId2 - Second snapshot ID
 * @property {FileChange[]} added - Added files
 * @property {FileChange[]} removed - Removed files
 * @property {FileChange[]} modified - Modified files
 * @property {FileChange[]} unchanged - Unchanged files
 * @property {Object} summary - Change summary
 * @property {number} summary.totalChanges - Total number of changes
 * @property {number} summary.addedCount - Added file count
 * @property {number} summary.removedCount - Removed file count
 * @property {number} summary.modifiedCount - Modified file count
 */

/**
 * File change entry
 * @typedef {Object} FileChange
 * @property {string} path - File path
 * @property {string} type - Change type (added, removed, modified, unchanged)
 * @property {number} [sizeBefore] - Size before change (for modified)
 * @property {number} [sizeAfter] - Size after change (for modified/added)
 * @property {string} [hashBefore] - Hash before change
 * @property {string} [hashAfter] - Hash after change
 */

/**
 * Prune options
 * @typedef {Object} PruneOptions
 * @property {number} [maxAge] - Maximum age in milliseconds
 * @property {number} [maxCount] - Maximum number of snapshots to keep
 * @property {boolean} [dryRun] - If true, don't actually delete
 */

/**
 * Manages project context snapshots for comparison and restoration
 * @extends EventEmitter
 */
export class ContextSnapshotManager extends EventEmitter {
  /**
   * @param {Object} options - Manager options
   * @param {string} [options.snapshotDir='.snapshots'] - Directory to store snapshots
   * @param {number} [options.maxContentSize=102400] - Max file size to store content (bytes)
   * @param {string[]} [options.excludePatterns] - Patterns to exclude
   */
  constructor(options = {}) {
    super();
    this.snapshotDir = options.snapshotDir || '.snapshots';
    this.maxContentSize = options.maxContentSize || 102400; // 100KB
    this.excludePatterns = options.excludePatterns || [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.snapshots',
      '*.log'
    ];
    /** @type {Map<string, ContextSnapshot>} */
    this.cache = new Map();
  }

  /**
   * Initializes the snapshot manager
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      await fs.mkdir(this.snapshotDir, { recursive: true });
    } catch (error) {
      // Directory may already exist
    }
    await this.#loadSnapshotIndex();
  }

  /**
   * Captures a new context snapshot
   * @param {string} projectPath - Project path to capture
   * @param {Object} [options] - Capture options
   * @param {boolean} [options.includeContent=false] - Include file contents
   * @param {string[]} [options.includeExtensions] - Specific extensions to include
   * @returns {Promise<ContextSnapshot>} Captured snapshot
   * @fires ContextSnapshotManager#captureStarted
   * @fires ContextSnapshotManager#captureProgress
   * @fires ContextSnapshotManager#captureComplete
   */
  async capture(projectPath, options = {}) {
    const snapshotId = this.#generateSnapshotId();
    const timestamp = new Date().toISOString();

    /** @event ContextSnapshotManager#captureStarted */
    this.emit('captureStarted', { snapshotId, projectPath, timestamp });

    try {
      const absolutePath = path.resolve(projectPath);
      const files = await this.#scanDirectory(absolutePath);
      const fileSnapshots = await this.#captureFiles(
        files, 
        absolutePath, 
        options.includeContent,
        options.includeExtensions
      );

      const extensions = [...new Set(fileSnapshots.map(f => path.extname(f.path)))].filter(Boolean);
      const totalSize = fileSnapshots.reduce((sum, f) => sum + f.size, 0);

      /** @type {ContextSnapshot} */
      const snapshot = {
        id: snapshotId,
        projectPath: absolutePath,
        timestamp,
        files: fileSnapshots,
        metadata: {
          fileCount: fileSnapshots.length,
          totalSize,
          extensions
        }
      };

      await this.#saveSnapshot(snapshot);
      this.cache.set(snapshotId, snapshot);

      /** @event ContextSnapshotManager#captureComplete */
      this.emit('captureComplete', { snapshotId, snapshot });

      return snapshot;
    } catch (error) {
      /** @event ContextSnapshotManager#captureError */
      this.emit('captureError', { snapshotId, error });
      throw error;
    }
  }

  /**
   * Restores project state from snapshot
   * @param {string} snapshotId - Snapshot to restore
   * @param {Object} [options] - Restore options
   * @param {string} [options.targetPath] - Override target path
   * @param {boolean} [options.dryRun=false] - Preview changes without applying
   * @returns {Promise<Object>} Restore result with file operations
   * @fires ContextSnapshotManager#restoreStarted
   * @fires ContextSnapshotManager#restoreComplete
   */
  async restore(snapshotId, options = {}) {
    /** @event ContextSnapshotManager#restoreStarted */
    this.emit('restoreStarted', { snapshotId });

    try {
      const snapshot = await this.#loadSnapshot(snapshotId);
      if (!snapshot) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      }

      const targetPath = options.targetPath || snapshot.projectPath;
      const operations = [];

      for (const fileSnapshot of snapshot.files) {
        const targetFile = path.join(targetPath, fileSnapshot.path);
        
        if (options.dryRun) {
          operations.push({
            type: 'restore',
            source: fileSnapshot.path,
            target: targetFile,
            size: fileSnapshot.size
          });
        } else {
          await this.#restoreFile(fileSnapshot, targetFile);
          operations.push({
            type: 'restored',
            path: targetFile,
            size: fileSnapshot.size
          });
        }
      }

      const existingFiles = await this.#listExistingFiles(targetPath);
      const expectedFiles = new Set(
        snapshot.files.map(fileSnapshot => path.resolve(path.join(targetPath, fileSnapshot.path)))
      );

      for (const existingFile of existingFiles) {
        const resolvedFile = path.resolve(existingFile);
        if (expectedFiles.has(resolvedFile)) {
          continue;
        }

        if (options.dryRun) {
          operations.push({
            type: 'delete',
            path: resolvedFile
          });
        } else {
          await fs.unlink(resolvedFile);
          await this.#removeEmptyDirectories(path.dirname(resolvedFile), targetPath);
          operations.push({
            type: 'deleted',
            path: resolvedFile
          });
        }
      }

      const result = {
        snapshotId,
        targetPath,
        operations,
        fileCount: operations.length,
        dryRun: options.dryRun || false
      };

      /** @event ContextSnapshotManager#restoreComplete */
      this.emit('restoreComplete', result);

      return result;
    } catch (error) {
      /** @event ContextSnapshotManager#restoreError */
      this.emit('restoreError', { snapshotId, error });
      throw error;
    }
  }

  /**
   * Compares two snapshots
   * @param {string|ContextSnapshot} snapshot1 - First snapshot ID or object
   * @param {string|ContextSnapshot} snapshot2 - Second snapshot ID or object
   * @returns {Promise<SnapshotComparison>} Detailed comparison
   * @fires ContextSnapshotManager#compareStarted
   * @fires ContextSnapshotManager#compareComplete
   */
  async compare(snapshot1, snapshot2) {
    /** @event ContextSnapshotManager#compareStarted */
    this.emit('compareStarted', { snapshot1, snapshot2 });

    try {
      const s1 = typeof snapshot1 === 'string' 
        ? await this.#loadSnapshot(snapshot1) 
        : snapshot1;
      const s2 = typeof snapshot2 === 'string' 
        ? await this.#loadSnapshot(snapshot2) 
        : snapshot2;

      if (!s1 || !s2) {
        throw new Error('One or both snapshots not found');
      }

      const map1 = new Map(s1.files.map(f => [f.path, f]));
      const map2 = new Map(s2.files.map(f => [f.path, f]));

      /** @type {FileChange[]} */
      const added = [];
      /** @type {FileChange[]} */
      const removed = [];
      /** @type {FileChange[]} */
      const modified = [];
      /** @type {FileChange[]} */
      const unchanged = [];

      // Find added and modified files
      for (const [path, file2] of map2) {
        const file1 = map1.get(path);
        if (!file1) {
          added.push({
            path,
            type: 'added',
            sizeAfter: file2.size,
            hashAfter: file2.hash
          });
        } else if (file1.hash !== file2.hash) {
          modified.push({
            path,
            type: 'modified',
            sizeBefore: file1.size,
            sizeAfter: file2.size,
            hashBefore: file1.hash,
            hashAfter: file2.hash
          });
        } else {
          unchanged.push({
            path,
            type: 'unchanged',
            sizeAfter: file2.size,
            hashAfter: file2.hash
          });
        }
      }

      // Find removed files
      for (const [path, file1] of map1) {
        if (!map2.has(path)) {
          removed.push({
            path,
            type: 'removed',
            sizeBefore: file1.size,
            hashBefore: file1.hash
          });
        }
      }

      /** @type {SnapshotComparison} */
      const comparison = {
        snapshotId1: s1.id,
        snapshotId2: s2.id,
        added,
        removed,
        modified,
        unchanged,
        summary: {
          totalChanges: added.length + removed.length + modified.length,
          addedCount: added.length,
          removedCount: removed.length,
          modifiedCount: modified.length
        }
      };

      /** @event ContextSnapshotManager#compareComplete */
      this.emit('compareComplete', comparison);

      return comparison;
    } catch (error) {
      /** @event ContextSnapshotManager#compareError */
      this.emit('compareError', { error });
      throw error;
    }
  }

  /**
   * Prunes old snapshots based on age or count
   * @param {PruneOptions} [options] - Prune options
   * @returns {Promise<string[]>} IDs of deleted snapshots
   * @fires ContextSnapshotManager#pruneStarted
   * @fires ContextSnapshotManager#pruneComplete
   */
  async prune(options = {}) {
    /** @event ContextSnapshotManager#pruneStarted */
    this.emit('pruneStarted', options);

    try {
      const allSnapshots = await this.listSnapshots();
      const toDelete = [];

      if (options.maxAge) {
        const cutoffTime = Date.now() - options.maxAge;
        for (const snapshot of allSnapshots) {
          const snapshotTime = new Date(snapshot.timestamp).getTime();
          if (snapshotTime < cutoffTime) {
            toDelete.push(snapshot.id);
          }
        }
      }

      if (options.maxCount && allSnapshots.length > options.maxCount) {
        // Sort by timestamp descending (newest first)
        const sorted = [...allSnapshots].sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
        const excess = sorted.slice(options.maxCount);
        for (const snapshot of excess) {
          if (!toDelete.includes(snapshot.id)) {
            toDelete.push(snapshot.id);
          }
        }
      }

      if (!options.dryRun) {
        for (const id of toDelete) {
          await this.#deleteSnapshot(id);
        }
      }

      /** @event ContextSnapshotManager#pruneComplete */
      this.emit('pruneComplete', { 
        deleted: toDelete, 
        dryRun: options.dryRun || false 
      });

      return toDelete;
    } catch (error) {
      /** @event ContextSnapshotManager#pruneError */
      this.emit('pruneError', { error });
      throw error;
    }
  }

  /**
   * Lists all available snapshots
   * @returns {Promise<Array<{id: string, timestamp: string, projectPath: string, fileCount: number}>>} Snapshot list
   */
  async listSnapshots() {
    try {
      const files = await fs.readdir(this.snapshotDir);
      const snapshots = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(
              path.join(this.snapshotDir, file), 
              'utf-8'
            );
            const snapshot = JSON.parse(content);
            snapshots.push({
              id: snapshot.id,
              timestamp: snapshot.timestamp,
              projectPath: snapshot.projectPath,
              fileCount: snapshot.metadata?.fileCount || 0
            });
          } catch (e) {
            // Skip invalid snapshot files
          }
        }
      }

      return snapshots.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
    } catch (error) {
      return [];
    }
  }

  /**
   * Gets a specific snapshot by ID
   * @param {string} snapshotId - Snapshot identifier
   * @returns {Promise<ContextSnapshot|null>} Snapshot or null if not found
   */
  async getSnapshot(snapshotId) {
    // Check cache first
    if (this.cache.has(snapshotId)) {
      return this.cache.get(snapshotId);
    }
    return this.#loadSnapshot(snapshotId);
  }

  /**
   * Deletes a specific snapshot
   * @param {string} snapshotId - Snapshot to delete
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteSnapshot(snapshotId) {
    return this.#deleteSnapshot(snapshotId);
  }

  // Private methods

  /**
   * Generates unique snapshot ID
   * @private
   * @returns {string} Unique identifier
   */
  #generateSnapshotId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `snap-${timestamp}-${random}`;
  }

  /**
   * Scans directory for files
   * @private
   * @param {string} dirPath - Directory to scan
   * @returns {Promise<string[]>} Array of file paths
   */
  async #scanDirectory(dirPath) {
    const files = [];

    const scan = async (currentPath) => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = this.#normalizeRelativePath(path.relative(dirPath, fullPath));

        if (this.#shouldExclude(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    };

    await scan(dirPath);
    return files;
  }

  /**
   * Checks if path should be excluded
   * @private
   * @param {string} relativePath - Path to check
   * @returns {boolean} True if should be excluded
   */
  #shouldExclude(relativePath) {
    return this.excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(relativePath);
      }
      return relativePath.includes(pattern);
    });
  }

  /**
   * Captures file snapshots
   * @private
   * @param {string[]} files - File paths
   * @param {string} basePath - Base project path
   * @param {boolean} [includeContent=false] - Include file contents
   * @param {string[]} [includeExtensions] - Filter extensions
   * @returns {Promise<FileSnapshot[]>} File snapshots
   */
  async #captureFiles(files, basePath, includeContent = false, includeExtensions) {
    const fileSnapshots = [];
    const total = files.length;

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const relativePath = this.#normalizeRelativePath(path.relative(basePath, filePath));
      const ext = path.extname(filePath);

      if (includeExtensions && !includeExtensions.includes(ext)) {
        continue;
      }

      try {
        const stats = await fs.stat(filePath);
        const content = await fs.readFile(filePath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');

        /** @type {FileSnapshot} */
        const snapshot = {
          path: relativePath,
          hash,
          size: stats.size,
          modified: stats.mtime.toISOString()
        };

        if (stats.size <= this.maxContentSize) {
          snapshot.content = content.toString('utf-8');
        } else if (includeContent) {
          // Explicit content requests still honor the configured size ceiling.
        }

        fileSnapshots.push(snapshot);

        /** @event ContextSnapshotManager#captureProgress */
        this.emit('captureProgress', { 
          current: i + 1, 
          total, 
          file: relativePath 
        });
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return fileSnapshots;
  }

  /**
   * Saves snapshot to disk
   * @private
   * @param {ContextSnapshot} snapshot - Snapshot to save
   * @returns {Promise<void>}
   */
  async #saveSnapshot(snapshot) {
    const filePath = path.join(this.snapshotDir, `${snapshot.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
  }

  /**
   * Loads snapshot from disk
   * @private
   * @param {string} snapshotId - Snapshot ID
   * @returns {Promise<ContextSnapshot|null>} Loaded snapshot
   */
  async #loadSnapshot(snapshotId) {
    // Check cache first
    if (this.cache.has(snapshotId)) {
      return this.cache.get(snapshotId);
    }

    try {
      const filePath = path.join(this.snapshotDir, `${snapshotId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const snapshot = JSON.parse(content);
      this.cache.set(snapshotId, snapshot);
      return snapshot;
    } catch (error) {
      return null;
    }
  }

  /**
   * Deletes snapshot from disk
   * @private
   * @param {string} snapshotId - Snapshot ID to delete
   * @returns {Promise<boolean>} True if deleted
   */
  async #deleteSnapshot(snapshotId) {
    try {
      const filePath = path.join(this.snapshotDir, `${snapshotId}.json`);
      await fs.unlink(filePath);
      this.cache.delete(snapshotId);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Restores a single file
   * @private
   * @param {FileSnapshot} fileSnapshot - File snapshot
   * @param {string} targetPath - Target file path
   * @returns {Promise<void>}
   */
  async #restoreFile(fileSnapshot, targetPath) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    
    if (fileSnapshot.content) {
      await fs.writeFile(targetPath, fileSnapshot.content);
    } else {
      // Create placeholder if content not stored
      await fs.writeFile(targetPath, '');
    }

    // Restore modification time if possible
    try {
      const modified = new Date(fileSnapshot.modified);
      await fs.utimes(targetPath, modified, modified);
    } catch (e) {
      // Ignore timestamp errors
    }
  }

  /**
   * Lists existing files under a target path
   * @private
   * @param {string} targetPath - Path to scan
   * @returns {Promise<string[]>} Absolute file paths
   */
  async #listExistingFiles(targetPath) {
    try {
      return await this.#scanDirectory(path.resolve(targetPath));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Removes empty directories after file deletion
   * @private
   * @param {string} directoryPath - Directory to prune
   * @param {string} rootPath - Stop pruning at this path
   * @returns {Promise<void>}
   */
  async #removeEmptyDirectories(directoryPath, rootPath) {
    const resolvedRoot = path.resolve(rootPath);
    let currentPath = path.resolve(directoryPath);

    while (currentPath.startsWith(resolvedRoot) && currentPath !== resolvedRoot) {
      const entries = await fs.readdir(currentPath);
      if (entries.length > 0) {
        break;
      }

      await fs.rmdir(currentPath);
      currentPath = path.dirname(currentPath);
    }
  }

  /**
   * Normalizes relative paths for cross-platform snapshot storage
   * @private
   * @param {string} relativePath - Relative path
   * @returns {string} POSIX-style relative path
   */
  #normalizeRelativePath(relativePath) {
    return relativePath.split(path.sep).join('/');
  }

  /**
   * Loads snapshot index
   * @private
   * @returns {Promise<void>}
   */
  async #loadSnapshotIndex() {
    // Snapshots are loaded on-demand
  }
}

// Export singleton instance
export const contextSnapshotManager = new ContextSnapshotManager();
export default ContextSnapshotManager;
