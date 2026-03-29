/**
 * @fileoverview Skill Sync - Syncs skills to AI client directories
 * @module domains/skills/skill-sync
 *
 * Manages synchronization of skills to AI client directories:
 * - Claude: ~/.claude/skills/
 * - Codex: ~/.codex/skills/
 * - Kimi: ~/.kimi/skills/
 *
 * Handles client detection, sync conflicts, and cleanup.
 */

import { 
  readFileSync, 
  writeFileSync, 
  existsSync, 
  mkdirSync, 
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync
} from 'fs';
import { join, resolve, dirname } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

/**
 * @typedef {Object} SyncTarget
 * @property {string} client - Client type (claude, codex, kimi)
 * @property {string} path - Skills directory path
 * @property {boolean} exists - Whether directory exists
 * @property {boolean} writable - Whether directory is writable
 * @property {string} mode - Sync mode (copy, symlink, ephemeral)
 */

/**
 * @typedef {Object} SyncResult
 * @property {string} skillId - Skill ID
 * @property {string} client - Client type
 * @property {string} status - sync_status (synced, failed, skipped, removed)
 * @property {string} [error] - Error message if failed
 * @property {string} [path] - Synced file path
 * @property {string} [checksum] - Content checksum
 */

/**
 * @typedef {Object} SyncLog
 * @property {string} id - Log ID
 * @property {string} operation - Operation type (sync, cleanup, full)
 * @property {string} client - Target client or 'all'
 * @property {number} totalSkills - Total skills processed
 * @property {number} synced - Successfully synced
 * @property {number} failed - Failed to sync
 * @property {number} removed - Removed skills
 * @property {Object[]} details - Detailed results
 * @property {string} startedAt - ISO timestamp
 * @property {string} completedAt - ISO timestamp
 * @property {number} durationMs - Operation duration
 */

// Client configuration
const CLIENT_CONFIG = Object.freeze({
  claude: Object.freeze({
    name: 'Claude',
    skillDir: '.claude/skills',
    configFiles: ['claude.json', 'settings.json'],
    supportsSymlinks: true,
    defaultMode: 'symlink'
  }),
  codex: Object.freeze({
    name: 'Codex',
    skillDir: '.codex/skills',
    configFiles: ['codex.json', 'config.json'],
    supportsSymlinks: true,
    defaultMode: 'symlink'
  }),
  kimi: Object.freeze({
    name: 'Kimi',
    skillDir: '.kimi/skills',
    configFiles: ['kimi.json', 'settings.json'],
    supportsSymlinks: true,
    defaultMode: 'copy'
  })
});

/**
 * Generates a UUID
 * @returns {string} UUID string
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `cm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gets current ISO timestamp
 * @returns {string} ISO timestamp
 */
function now() {
  return new Date().toISOString();
}

/**
 * Calculates MD5 checksum of content
 * @param {string} content - Content to hash
 * @returns {string} MD5 hash
 */
function calculateChecksum(content) {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Ensures directory exists
 * @param {string} dir - Directory path
 */
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Detects if a client is installed
 * @param {string} client - Client type (claude, codex, kimi)
 * @returns {Object} Detection result
 */
function detectClient(client) {
  const config = CLIENT_CONFIG[client];
  if (!config) {
    return { installed: false, error: `Unknown client: ${client}` };
  }

  const home = homedir();
  const skillPath = join(home, config.skillDir);
  const parentDir = dirname(skillPath);

  // Check if parent directory exists (indicates client installation)
  const parentExists = existsSync(parentDir);
  
  // Check if skills directory exists or can be created
  let exists = existsSync(skillPath);
  let writable = false;

  if (exists) {
    try {
      const stats = statSync(skillPath);
      writable = stats.isDirectory();
    } catch {
      writable = false;
    }
  } else if (parentExists) {
    // Try to create skills directory
    try {
      mkdirSync(skillPath, { recursive: true });
      exists = true;
      writable = true;
    } catch {
      writable = false;
    }
  }

  // Look for config files
  const configFound = config.configFiles.some(file => 
    existsSync(join(parentDir, file))
  );

  return {
    installed: parentExists || configFound,
    detected: configFound,
    path: skillPath,
    exists,
    writable,
    parentDir
  };
}

/**
 * Skill Sync Service - Manages skill synchronization
 */
export class SkillSync {
  /** @type {Map<string, SyncLog>} */
  #logs = new Map();
  
  /** @type {SkillService} */
  #skillService = null;
  
  /** @type {Object} Repository instance */
  #repo = null;

  /**
   * @param {Object} options
   * @param {SkillService} options.skillService - Skill service instance
   * @param {Object} [options.repositories] - Repository factory
   */
  constructor(options) {
    this.#skillService = options.skillService;
    this.#repo = options.repositories?.skillSyncLogs ?? null;
  }

  // ==================== Client Detection ====================

  /**
   * Detect all installed clients
   * @returns {Object} Map of client detection results
   */
  detectClients() {
    const results = {};
    for (const client of Object.keys(CLIENT_CONFIG)) {
      results[client] = this.detectClient(client);
    }
    return results;
  }

  /**
   * Detect specific client
   * @param {string} client - Client type
   * @returns {Object} Detection result
   */
  detectClient(client) {
    return detectClient(client);
  }

  /**
   * Check if client is available for sync
   * @param {string} client - Client type
   * @returns {boolean} True if available
   */
  isClientAvailable(client) {
    const detection = detectClient(client);
    return detection.installed && detection.writable;
  }

  /**
   * Get available clients
   * @returns {string[]} List of available client types
   */
  getAvailableClients() {
    return Object.keys(CLIENT_CONFIG).filter(client => 
      this.isClientAvailable(client)
    );
  }

  // ==================== Sync Operations ====================

  /**
   * Sync skills to a specific client
   * @param {string} client - Client type (claude, codex, kimi) or 'all'
   * @param {Object} [options] - Sync options
   * @param {string[]} [options.skillIds] - Specific skills to sync (default: all active)
   * @param {string} [options.mode] - Sync mode (copy, symlink, ephemeral)
   * @param {boolean} [options.dryRun] - Preview changes without applying
   * @param {boolean} [options.cleanOrphaned] - Remove orphaned skills
   * @returns {Promise<SyncLog>} Sync log
   */
  async sync(client, options = {}) {
    const startTime = Date.now();
    const operation = options.dryRun ? 'preview' : 'sync';
    
    // Determine target clients
    const targets = client === 'all' 
      ? this.getAvailableClients()
      : [client];

    if (targets.length === 0) {
      throw new Error(`No available clients found for sync`);
    }

    // Get skills to sync
    const skills = options.skillIds 
      ? options.skillIds.map(id => this.#skillService.getSkill(id)).filter(Boolean)
      : this.#skillService.listSkills({ status: 'active' });

    const results = [];
    let totalSynced = 0;
    let totalFailed = 0;
    let totalRemoved = 0;

    // Sync to each target client
    for (const targetClient of targets) {
      const detection = detectClient(targetClient);
      
      if (!detection.writable) {
        results.push({
          client: targetClient,
          status: 'skipped',
          error: 'Client directory not writable'
        });
        continue;
      }

      // Sync each skill
      for (const skill of skills) {
        try {
          const result = await this.#syncSkillToClient(
            skill, 
            targetClient, 
            detection.path,
            options
          );
          results.push(result);
          
          if (result.status === 'synced') totalSynced++;
          else if (result.status === 'failed') totalFailed++;
        } catch (err) {
          results.push({
            skillId: skill.id,
            client: targetClient,
            status: 'failed',
            error: err.message
          });
          totalFailed++;
        }
      }

      // Clean orphaned skills if requested
      if (options.cleanOrphaned) {
        const removed = await this.#cleanOrphanedSkills(targetClient, detection.path, skills, options);
        totalRemoved += removed.length;
        results.push(...removed);
      }
    }

    const log = {
      id: generateUUID(),
      operation,
      client,
      totalSkills: skills.length,
      synced: totalSynced,
      failed: totalFailed,
      removed: totalRemoved,
      details: results,
      startedAt: now(),
      completedAt: now(),
      durationMs: Date.now() - startTime
    };

    this.#logs.set(log.id, log);

    if (this.#repo) {
      this.#repo.create(this.#toLogRow(log)).catch(() => {});
    }

    return log;
  }

  /**
   * Sync a single skill to a client
   * @private
   */
  async #syncSkillToClient(skill, client, targetPath, options = {}) {
    const mode = options.mode || CLIENT_CONFIG[client].defaultMode;
    const skillDir = join(targetPath, skill.name);
    const skillFile = join(skillDir, 'SKILL.md');

    // Check for conflicts
    const conflict = this.#detectConflict(skill, skillDir);
    if (conflict.exists && !options.force) {
      if (conflict.checksum === calculateChecksum(skill.content)) {
        return {
          skillId: skill.id,
          client,
          status: 'skipped',
          reason: 'Already up to date',
          path: skillFile
        };
      }
    }

    if (options.dryRun) {
      return {
        skillId: skill.id,
        client,
        status: 'preview',
        action: conflict.exists ? 'update' : 'create',
        path: skillFile
      };
    }

    try {
      // Ensure skill directory exists
      ensureDir(skillDir);

      // Write skill file
      writeFileSync(skillFile, skill.content, 'utf-8');

      // Write metadata file
      const metadata = {
        id: skill.id,
        name: skill.name,
        version: skill.version,
        syncedAt: now(),
        checksum: calculateChecksum(skill.content)
      };
      writeFileSync(
        join(skillDir, '.cognimesh-skill.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );

      return {
        skillId: skill.id,
        client,
        status: 'synced',
        path: skillFile,
        checksum: metadata.checksum,
        previousConflict: conflict.exists ? conflict : null
      };
    } catch (err) {
      return {
        skillId: skill.id,
        client,
        status: 'failed',
        error: err.message
      };
    }
  }

  /**
   * Detect sync conflicts
   * @private
   */
  #detectConflict(skill, targetDir) {
    if (!existsSync(targetDir)) {
      return { exists: false };
    }

    const metadataPath = join(targetDir, '.cognimesh-skill.json');
    const skillPath = join(targetDir, 'SKILL.md');

    if (!existsSync(skillPath)) {
      return { exists: false };
    }

    const result = {
      exists: true,
      hasMetadata: existsSync(metadataPath),
      checksum: null,
      external: false
    };

    if (result.hasMetadata) {
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
        result.checksum = metadata.checksum;
        result.skillId = metadata.id;
        result.version = metadata.version;
      } catch {
        // Invalid metadata
      }
    } else {
      // No metadata - external skill
      result.external = true;
      try {
        const content = readFileSync(skillPath, 'utf-8');
        result.checksum = calculateChecksum(content);
      } catch {
        // Can't read file
      }
    }

    return result;
  }

  /**
   * Clean orphaned skills from client directory
   * @private
   */
  async #cleanOrphanedSkills(client, targetPath, activeSkills, options = {}) {
    const results = [];
    const activeNames = new Set(activeSkills.map(s => s.name));

    if (!existsSync(targetPath)) {
      return results;
    }

    const entries = readdirSync(targetPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillName = entry.name;
      const skillDir = join(targetPath, skillName);
      const metadataPath = join(skillDir, '.cognimesh-skill.json');

      // Skip if it's an active skill
      if (activeNames.has(skillName)) continue;

      // Only remove if it has our metadata (indicates we synced it)
      if (!existsSync(metadataPath)) continue;

      if (options.dryRun) {
        results.push({
          skillName,
          client,
          status: 'preview',
          action: 'remove'
        });
        continue;
      }

      try {
        rmSync(skillDir, { recursive: true, force: true });
        results.push({
          skillName,
          client,
          status: 'removed',
          path: skillDir
        });
      } catch (err) {
        results.push({
          skillName,
          client,
          status: 'failed',
          action: 'remove',
          error: err.message
        });
      }
    }

    return results;
  }

  // ==================== Skill Removal ====================

  /**
   * Remove skill from all clients
   * @param {string} skillId - Skill ID or name
   * @param {Object} [options] - Removal options
   * @param {string} [options.client] - Specific client (default: all)
   * @param {boolean} [options.dryRun] - Preview only
   * @returns {Promise<SyncLog>} Removal log
   */
  async removeSkill(skillId, options = {}) {
    const skill = this.#skillService.getSkill(skillId) || 
                  this.#skillService.getSkillByName(skillId);
    
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const startTime = Date.now();
    const targets = options.client 
      ? [options.client]
      : Object.keys(CLIENT_CONFIG);

    const results = [];

    for (const client of targets) {
      const detection = detectClient(client);
      if (!detection.exists) continue;

      const skillDir = join(detection.path, skill.name);
      
      if (!existsSync(skillDir)) {
        results.push({
          skillId: skill.id,
          client,
          status: 'skipped',
          reason: 'Not present'
        });
        continue;
      }

      // Verify it's our skill
      const metadataPath = join(skillDir, '.cognimesh-skill.json');
      if (existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
          if (metadata.id !== skill.id) {
            results.push({
              skillId: skill.id,
              client,
              status: 'skipped',
              reason: 'Different skill with same name'
            });
            continue;
          }
        } catch {
          // Invalid metadata, proceed with caution
        }
      }

      if (options.dryRun) {
        results.push({
          skillId: skill.id,
          client,
          status: 'preview',
          action: 'remove',
          path: skillDir
        });
        continue;
      }

      try {
        rmSync(skillDir, { recursive: true, force: true });
        results.push({
          skillId: skill.id,
          client,
          status: 'removed',
          path: skillDir
        });
      } catch (err) {
        results.push({
          skillId: skill.id,
          client,
          status: 'failed',
          error: err.message
        });
      }
    }

    const log = {
      id: generateUUID(),
      operation: 'remove',
      client: options.client || 'all',
      totalSkills: 1,
      synced: 0,
      failed: results.filter(r => r.status === 'failed').length,
      removed: results.filter(r => r.status === 'removed').length,
      details: results,
      startedAt: now(),
      completedAt: now(),
      durationMs: Date.now() - startTime
    };

    this.#logs.set(log.id, log);
    return log;
  }

  // ==================== Sync Status ====================

  /**
   * Get sync status for a skill
   * @param {string} skillId - Skill ID
   * @returns {Object} Sync status per client
   */
  getSyncStatus(skillId) {
    const skill = this.#skillService.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const status = {};
    
    for (const [client, config] of Object.entries(CLIENT_CONFIG)) {
      const detection = detectClient(client);
      if (!detection.exists) {
        status[client] = { available: false };
        continue;
      }

      const skillDir = join(detection.path, skill.name);
      const skillFile = join(skillDir, 'SKILL.md');
      const metadataFile = join(skillDir, '.cognimesh-skill.json');

      if (!existsSync(skillFile)) {
        status[client] = { 
          available: true, 
          synced: false,
          path: skillDir
        };
        continue;
      }

      const result = {
        available: true,
        synced: true,
        path: skillFile,
        upToDate: false
      };

      if (existsSync(metadataFile)) {
        try {
          const metadata = JSON.parse(readFileSync(metadataFile, 'utf-8'));
          result.syncedVersion = metadata.version;
          result.syncedAt = metadata.syncedAt;
          result.upToDate = metadata.id === skill.id && metadata.version === skill.version;
          result.checksum = metadata.checksum;
        } catch {
          // Invalid metadata
        }
      }

      // Check content hash
      try {
        const content = readFileSync(skillFile, 'utf-8');
        const currentChecksum = calculateChecksum(content);
        result.checksumMatch = currentChecksum === result.checksum;
      } catch {
        // Can't read file
      }

      status[client] = result;
    }

    return status;
  }

  /**
   * Get all sync logs
   * @param {Object} [filters] - Filter options
   * @returns {SyncLog[]} Sync logs
   */
  getLogs(filters = {}) {
    let logs = Array.from(this.#logs.values());
    
    if (filters.client) {
      logs = logs.filter(l => l.client === filters.client || l.client === 'all');
    }
    if (filters.operation) {
      logs = logs.filter(l => l.operation === filters.operation);
    }

    return logs.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }

  /**
   * Get specific sync log
   * @param {string} logId - Log ID
   * @returns {SyncLog|undefined} The log
   */
  getLog(logId) {
    return this.#logs.get(logId);
  }

  // ==================== Utility ====================

  /**
   * Convert sync log to database row
   * @private
   */
  #toLogRow(log) {
    return {
      id: log.id,
      operation: log.operation,
      client: log.client,
      total_skills: log.totalSkills,
      synced: log.synced,
      failed: log.failed,
      removed: log.removed,
      details: JSON.stringify(log.details),
      started_at: log.startedAt,
      completed_at: log.completedAt,
      duration_ms: log.durationMs
    };
  }

  /**
   * Load logs from repository
   */
  async loadFromRepository() {
    if (!this.#repo) return;

    try {
      const rows = await this.#repo.findAll({ limit: 1000 });
      for (const row of rows) {
        const log = this.#hydrateLogFromRow(row);
        this.#logs.set(log.id, log);
      }
    } catch {
      // Repository not ready
    }
  }

  /**
   * Hydrate log from database row
   * @private
   */
  #hydrateLogFromRow(row) {
    return {
      id: row.id,
      operation: row.operation,
      client: row.client,
      totalSkills: row.total_skills,
      synced: row.synced,
      failed: row.failed,
      removed: row.removed,
      details: JSON.parse(row.details || '[]'),
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms
    };
  }
}

export default SkillSync;
