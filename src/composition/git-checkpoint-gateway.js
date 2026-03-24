/**
 * @fileoverview Git Checkpoint Gateway - Manages git-based checkpoints/snapshots
 * @module composition/git-checkpoint-gateway
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * Checkpoint data structure
 * @typedef {Object} Checkpoint
 * @property {string} id - Commit hash (SHA)
 * @property {string} message - Checkpoint description/message
 * @property {string} author - Author name
 * @property {string} email - Author email
 * @property {Date} createdAt - Commit timestamp
 * @property {Array<string>} tags - Associated tags
 * @property {Array<string>} branches - Branches containing this commit
 * @property {string} [parentId] - Parent commit hash
 * @property {number} fileChanges - Number of files changed
 * @property {number} insertions - Lines added
 * @property {number} deletions - Lines removed
 */

/**
 * Diff result structure
 * @typedef {Object} CheckpointDiff
 * @property {string} fromId - Source checkpoint ID
 * @property {string} toId - Target checkpoint ID
 * @property {Array<{path: string, change: 'added'|'modified'|'deleted'|'renamed', additions: number, deletions: number}>} files - Changed files
 * @property {string} summary - Human-readable summary
 */

/**
 * Git Checkpoint Gateway for managing repository snapshots
 * @extends EventEmitter
 */
export class GitCheckpointGateway extends EventEmitter {
  /**
   * Repository root path
   * @type {string}
   * @private
   */
  #repoPath;

  /**
   * Checkpoint tag prefix
   * @type {string}
   * @private
   */
  #tagPrefix = 'checkpoint/';

  /**
   * Whether git is available
   * @type {boolean}
   * @private
   */
  #gitAvailable = false;

  /**
   * Creates a new GitCheckpointGateway instance
   * @param {Object} [options={}] - Gateway options
   * @param {string} [options.repoPath=process.cwd()] - Path to git repository
   * @param {string} [options.tagPrefix='checkpoint/'] - Prefix for checkpoint tags
   */
  constructor(options = {}) {
    super();
    this.#repoPath = options.repoPath || process.cwd();
    this.#tagPrefix = options.tagPrefix || 'checkpoint/';
    this.#checkGitAvailability();
  }

  /**
   * Executes a git command in the repository
   * @param {string} command - Git command (without 'git' prefix)
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<{stdout: string, stderr: string}>} Command output
   * @throws {Error} If git command fails
   * @private
   */
  async #git(command, options = {}) {
    const { cwd = this.#repoPath, ...execOptions } = options;
    const fullCommand = `git -C "${cwd}" ${command}`;
    
    try {
      const result = await execAsync(fullCommand, execOptions);
      return result;
    } catch (error) {
      throw new Error(`Git command failed: ${error.message}`);
    }
  }

  /**
   * Checks if git is available and repository exists
   * @private
   */
  async #checkGitAvailability() {
    try {
      await this.#git('rev-parse --git-dir');
      this.#gitAvailable = true;
    } catch {
      this.#gitAvailable = false;
    }
  }

  /**
   * Ensures git is available before operations
   * @throws {Error} If git is not available
   * @private
   */
  #ensureGit() {
    if (!this.#gitAvailable) {
      throw new Error('Git is not available or repository not initialized');
    }
  }

  /**
   * Parses git log output into checkpoint objects
   * @param {string} logOutput - Raw git log output
   * @returns {Array<Checkpoint>} Parsed checkpoints
   * @private
   */
  #parseLogOutput(logOutput) {
    if (!logOutput.trim()) return [];

    const lines = logOutput.trim().split('\n');
    const checkpoints = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 6) {
        checkpoints.push({
          id: parts[0],
          message: parts[1],
          author: parts[2],
          email: parts[3],
          createdAt: new Date(parseInt(parts[4]) * 1000),
          parentId: parts[5] || null,
          tags: [],
          branches: [],
          fileChanges: 0,
          insertions: 0,
          deletions: 0
        });
      }
    }

    return checkpoints;
  }

  /**
   * Creates a new checkpoint (commit)
   * @param {string} description - Checkpoint description/message
   * @param {Object} [options={}] - Checkpoint options
   * @param {boolean} [options.includeUntracked=false] - Include untracked files
   * @param {Array<string>} [options.files] - Specific files to include
   * @param {boolean} [options.createTag=true] - Create a checkpoint tag
   * @returns {Promise<Checkpoint>} Created checkpoint
   * @throws {Error} If checkpoint creation fails
   */
  async createCheckpoint(description, options = {}) {
    this.#ensureGit();
    
    const { 
      includeUntracked = false, 
      files,
      createTag = true 
    } = options;

    // Check for changes
    const { stdout: statusOutput } = await this.#git('status --porcelain');
    
    if (!statusOutput.trim() && !files) {
      throw new Error('No changes to checkpoint');
    }

    // Stage files
    if (files && files.length > 0) {
      for (const file of files) {
        await this.#git(`add "${file}"`);
      }
    } else if (includeUntracked) {
      await this.#git('add -A');
    } else {
      await this.#git('add -u');
    }

    // Create commit with checkpoint marker in message
    const checkpointMessage = `[checkpoint] ${description}`;
    await this.#git(`commit -m "${checkpointMessage.replace(/"/g, '\\"')}"`);

    // Get the commit hash
    const { stdout: commitHash } = await this.#git('rev-parse HEAD');
    const id = commitHash.trim();

    // Create tag if requested
    if (createTag) {
      const tagName = `${this.#tagPrefix}${Date.now()}`;
      await this.#git(`tag -a "${tagName}" -m "${description}" ${id}`);
    }

    // Get checkpoint details
    const checkpoint = await this.#getCheckpointDetails(id);
    
    this.emit('checkpointCreated', checkpoint);
    return checkpoint;
  }

  /**
   * Gets detailed information about a checkpoint
   * @param {string} id - Commit hash
   * @returns {Promise<Checkpoint>} Checkpoint details
   * @private
   */
  async #getCheckpointDetails(id) {
    const { stdout: logOutput } = await this.#git(
      `log -1 --format="%H|%s|%an|%ae|%ct|%P" ${id}`
    );
    
    const checkpoints = this.#parseLogOutput(logOutput);
    if (checkpoints.length === 0) {
      throw new Error(`Checkpoint not found: ${id}`);
    }

    const checkpoint = checkpoints[0];

    // Get stats
    try {
      const { stdout: statsOutput } = await this.#git(
        `diff --shortstat ${checkpoint.parentId || `${id}^`}..${id}`
      );
      const stats = this.#parseStats(statsOutput);
      checkpoint.fileChanges = stats.files;
      checkpoint.insertions = stats.insertions;
      checkpoint.deletions = stats.deletions;
    } catch {
      // First commit or no parent
      checkpoint.fileChanges = 0;
      checkpoint.insertions = 0;
      checkpoint.deletions = 0;
    }

    // Get tags
    const { stdout: tagOutput } = await this.#git(`tag --points-at ${id}`);
    checkpoint.tags = tagOutput.trim().split('\n').filter(Boolean);

    // Get branches
    const { stdout: branchOutput } = await this.#git(
      `branch -a --contains ${id} --format="%(refname:short)"`
    );
    checkpoint.branches = branchOutput.trim().split('\n').filter(Boolean);

    return checkpoint;
  }

  /**
   * Parses git diff --shortstat output
   * @param {string} statsOutput - Raw stats output
   * @returns {{files: number, insertions: number, deletions: number}} Parsed stats
   * @private
   */
  #parseStats(statsOutput) {
    const result = { files: 0, insertions: 0, deletions: 0 };
    
    if (!statsOutput) return result;

    const filesMatch = statsOutput.match(/(\d+) file/);
    const insertionsMatch = statsOutput.match(/(\d+) insertion/);
    const deletionsMatch = statsOutput.match(/(\d+) deletion/);

    if (filesMatch) result.files = parseInt(filesMatch[1]);
    if (insertionsMatch) result.insertions = parseInt(insertionsMatch[1]);
    if (deletionsMatch) result.deletions = parseInt(deletionsMatch[1]);

    return result;
  }

  /**
   * Lists all checkpoints (commits with checkpoint marker)
   * @param {Object} [options={}] - List options
   * @param {number} [options.limit=50] - Max checkpoints to return
   * @param {string} [options.branch] - Specific branch to list from
   * @param {boolean} [options.includeTagsOnly=false] - Only show tagged checkpoints
   * @returns {Promise<Array<Checkpoint>>} List of checkpoints
   * @throws {Error} If listing fails
   */
  async listCheckpoints(options = {}) {
    this.#ensureGit();
    
    const { 
      limit = 50, 
      branch,
      includeTagsOnly = false 
    } = options;

    let checkpoints = [];

    if (includeTagsOnly) {
      // Get all checkpoint tags
      const { stdout: tagOutput } = await this.#git(
        `tag -l "${this.#tagPrefix}*" --format="%(objectname)"`
      );
      
      const tagCommits = tagOutput.trim().split('\n').filter(Boolean);
      
      for (const commitId of tagCommits.slice(0, limit)) {
        try {
          const checkpoint = await this.#getCheckpointDetails(commitId);
          checkpoints.push(checkpoint);
        } catch {
          // Skip invalid commits
        }
      }
    } else {
      // Search for commits with checkpoint marker
      const revisionRange = branch ? `${branch}` : 'HEAD';
      const { stdout: logOutput } = await this.#git(
        `log ${revisionRange} --grep="^\\[checkpoint\\]" --format="%H|%s|%an|%ae|%ct|%P" -n ${limit}`
      );
      
      checkpoints = this.#parseLogOutput(logOutput);

      // Enrich with details
      for (let i = 0; i < checkpoints.length; i++) {
        try {
          const details = await this.#getCheckpointDetails(checkpoints[i].id);
          checkpoints[i] = { ...checkpoints[i], ...details };
        } catch {
          // Keep basic info if details fail
        }
      }
    }

    this.emit('checkpointsListed', { count: checkpoints.length });
    return checkpoints;
  }

  /**
   * Restores the repository to a specific checkpoint
   * @param {string} id - Checkpoint ID (commit hash)
   * @param {Object} [options={}] - Restore options
   * @param {boolean} [options.hard=false] - Hard reset (discards all changes)
   * @param {boolean} [options.createBackup=true] - Create backup branch before restore
   * @returns {Promise<boolean>} True if restored successfully
   * @throws {Error} If restore fails
   */
  async restoreCheckpoint(id, options = {}) {
    this.#ensureGit();
    
    const { hard = false, createBackup = true } = options;

    // Verify checkpoint exists
    try {
      await this.#git(`cat-file -t ${id}`);
    } catch {
      throw new Error(`Checkpoint not found: ${id}`);
    }

    // Create backup branch if requested
    if (createBackup) {
      const backupBranchName = `backup/before-restore-${Date.now()}`;
      try {
        await this.#git(`branch "${backupBranchName}"`);
      } catch {
        // Branch creation failed, continue without backup
      }
    }

    // Perform restore
    if (hard) {
      await this.#git('reset --hard');
      await this.#git(`reset --hard ${id}`);
    } else {
      // Soft restore - create new branch from checkpoint
      const tempBranch = `restore-${Date.now()}`;
      await this.#git(`checkout -b "${tempBranch}" ${id}`);
    }

    this.emit('checkpointRestored', { id, hard, backupCreated: createBackup });
    return true;
  }

  /**
   * Deletes a checkpoint tag (not the commit itself)
   * @param {string} id - Checkpoint ID (commit hash)
   * @returns {Promise<boolean>} True if deleted
   * @throws {Error} If deletion fails
   */
  async deleteCheckpoint(id) {
    this.#ensureGit();

    // Find tags pointing to this commit
    const { stdout: tagOutput } = await this.#git(`tag --points-at ${id}`);
    const tags = tagOutput.trim().split('\n').filter(t => t.startsWith(this.#tagPrefix));

    if (tags.length === 0) {
      throw new Error(`No checkpoint tag found for: ${id}`);
    }

    // Delete all checkpoint tags for this commit
    for (const tag of tags) {
      await this.#git(`tag -d "${tag}"`);
    }

    this.emit('checkpointDeleted', { id, deletedTags: tags });
    return true;
  }

  /**
   * Compares two checkpoints
   * @param {string} id1 - First checkpoint ID
   * @param {string} id2 - Second checkpoint ID
   * @returns {Promise<CheckpointDiff>} Diff between checkpoints
   * @throws {Error} If comparison fails
   */
  async compareCheckpoints(id1, id2) {
    this.#ensureGit();

    // Verify both checkpoints exist
    for (const id of [id1, id2]) {
      try {
        await this.#git(`cat-file -t ${id}`);
      } catch {
        throw new Error(`Checkpoint not found: ${id}`);
      }
    }

    // Get file changes
    const { stdout: nameStatus } = await this.#git(
      `diff --name-status ${id1}..${id2}`
    );

    const files = [];
    const lines = nameStatus.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const parts = line.split('\t');
      const status = parts[0];
      const path = parts[1];
      const newPath = parts[2];

      let change = 'modified';
      if (status.startsWith('A')) change = 'added';
      else if (status.startsWith('D')) change = 'deleted';
      else if (status.startsWith('R')) change = 'renamed';

      // Get line stats for this file
      let additions = 0;
      let deletions = 0;
      try {
        const { stdout: fileDiff } = await this.#git(
          `diff ${id1}..${id2} -- "${newPath || path}" | wc -l`
        );
        // This is a simplified approach; for accurate stats we'd parse the diff
        additions = parseInt(fileDiff.trim()) || 0;
      } catch {
        // Ignore errors for stats
      }

      files.push({
        path: change === 'renamed' ? newPath : path,
        originalPath: change === 'renamed' ? path : null,
        change,
        additions,
        deletions
      });
    }

    // Get commit info for summary
    const [cp1, cp2] = await Promise.all([
      this.#getCheckpointDetails(id1).catch(() => ({ message: id1 })),
      this.#getCheckpointDetails(id2).catch(() => ({ message: id2 }))
    ]);

    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

    const diff = {
      fromId: id1,
      toId: id2,
      files,
      summary: `Comparing "${cp1.message}" to "${cp2.message}": ${files.length} files changed, ${totalAdditions} insertions(+), ${totalDeletions} deletions(-)`
    };

    this.emit('checkpointsCompared', { id1, id2, fileCount: files.length });
    return diff;
  }

  /**
   * Gets the current checkpoint (HEAD)
   * @returns {Promise<Checkpoint|null>} Current checkpoint or null
   */
  async getCurrentCheckpoint() {
    this.#ensureGit();

    try {
      const { stdout: head } = await this.#git('rev-parse HEAD');
      return await this.#getCheckpointDetails(head.trim());
    } catch {
      return null;
    }
  }

  /**
   * Checks if the repository has uncommitted changes
   * @returns {Promise<boolean>} True if there are changes
   */
  async hasUncommittedChanges() {
    this.#ensureGit();

    try {
      const { stdout } = await this.#git('status --porcelain');
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}

export default GitCheckpointGateway;
