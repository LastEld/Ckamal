/**
 * CogniMesh v5.0 - Database Migration Runner
 * ES Module - SQLite-compatible migration system with advisory locking
 */

import { readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join, basename } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * MigrationRunner - Manages database migrations with advisory locking
 */
export class MigrationRunner {
  constructor(db, options = {}) {
    this.db = db;
    this.migrationsPath = options.migrationsPath || __dirname;
    this.tableName = options.migrationsTable || 'migrations';
    this.lockTimeout = options.lockTimeout || 30000; // 30 seconds
  }

  /**
   * Initialize migration tracking table
   */
  async initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        batch INTEGER NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT,
        execution_time_ms INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_batch 
        ON ${this.tableName}(batch);
      
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_applied_at 
        ON ${this.tableName}(applied_at);
    `);
  }

  /**
   * Calculate SHA256 checksum of file contents
   * @param {string} filePath - Path to the migration file
   * @returns {string} SHA256 hash in hex format
   */
  _calculateChecksum(filePath) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return createHash('sha256').update(content, 'utf-8').digest('hex');
    } catch (err) {
      throw new Error(`Failed to calculate checksum for ${filePath}: ${err.message}`);
    }
  }

  /**
   * Validate that the current file checksum matches the stored checksum
   * @param {string} migrationId - Migration name
   * @param {string} expectedChecksum - Stored checksum to validate against
   * @returns {boolean} true if valid
   * @throws {Error} If checksum does not match
   */
  _validateChecksum(migrationId, expectedChecksum) {
    const migrationPath = join(this.migrationsPath, `${migrationId}.js`);
    const currentChecksum = this._calculateChecksum(migrationPath);
    
    if (currentChecksum !== expectedChecksum) {
      throw new Error(
        `Checksum mismatch for migration "${migrationId}". ` +
        `The migration file has been modified after it was applied. ` +
        `Expected: ${expectedChecksum}, Actual: ${currentChecksum}. ` +
        `Manual intervention required.`
      );
    }
    
    return true;
  }

  /**
   * Store checksum for a migration
   * @param {string} migrationId - Migration name
   * @param {string} checksum - SHA256 checksum to store
   */
  _storeChecksum(migrationId, checksum) {
    this.db.prepare(
      `UPDATE ${this.tableName} SET checksum = ? WHERE name = ?`
    ).run(checksum, migrationId);
  }

  /**
   * Acquire advisory lock to prevent concurrent migrations
   */
  async acquireLock() {
    const lockKey = 'migration_lock';
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.lockTimeout) {
      try {
        // SQLite advisory lock using a dedicated lock table
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS _migration_lock (
            lock_key TEXT PRIMARY KEY,
            acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            process_id TEXT
          );
          
          INSERT INTO _migration_lock (lock_key, process_id) 
          VALUES ('${lockKey}', '${process.pid}')
          ON CONFLICT DO NOTHING;
        `);
        
        const result = this.db.prepare(
          `SELECT process_id FROM _migration_lock WHERE lock_key = ?`
        ).get(lockKey);
        
        if (result && result.process_id === String(process.pid)) {
          return true;
        }
      } catch (err) {
        // Lock not acquired, wait and retry
      }
      
      await new Promise(r => setTimeout(r, 100));
    }
    
    throw new Error('Could not acquire migration lock within timeout');
  }

  /**
   * Release advisory lock
   */
  async releaseLock() {
    this.db.prepare(`DELETE FROM _migration_lock WHERE lock_key = ?`).run('migration_lock');
  }

  /**
   * Get list of migration files sorted by name
   */
  getMigrationFiles() {
    const files = readdirSync(this.migrationsPath)
      .filter(f => f.endsWith('.js') && f !== 'index.js' && /^\d+_/.test(f))
      .sort();
    return files;
  }

  /**
   * Get currently applied migrations
   */
  getAppliedMigrations() {
    return this.db.prepare(
      `SELECT * FROM ${this.tableName} ORDER BY batch ASC, name ASC`
    ).all();
  }

  /**
   * Get pending migrations
   */
  getPendingMigrations() {
    const applied = this.getAppliedMigrations().map(m => m.name);
    const files = this.getMigrationFiles();
    
    return files
      .filter(f => !applied.includes(basename(f, '.js')))
      .map(f => ({
        name: basename(f, '.js'),
        path: join(this.migrationsPath, f)
      }));
  }

  /**
   * Get next batch number
   */
  getNextBatch() {
    const result = this.db.prepare(
      `SELECT COALESCE(MAX(batch), 0) + 1 as next_batch FROM ${this.tableName}`
    ).get();
    return result.next_batch;
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
    await this.initialize();
    await this.acquireLock();
    
    const pending = this.getPendingMigrations();
    const batch = this.getNextBatch();
    const results = [];
    
    try {
      for (const migration of pending) {
        const startTime = Date.now();
        
        try {
          // Calculate checksum before running migration
          const checksum = this._calculateChecksum(migration.path);
          
          // Dynamic import for ES modules
          const { up } = await import(pathToFileURL(migration.path).href);
          
          // Run migration in transaction
          this.db.transaction(() => {
            up(this.db);
          })();
          
          const executionTime = Date.now() - startTime;
          
          // Record migration with checksum
          this.db.prepare(`
            INSERT INTO ${this.tableName} (name, batch, checksum, execution_time_ms)
            VALUES (?, ?, ?, ?)
          `).run(migration.name, batch, checksum, executionTime);
          
          results.push({
            name: migration.name,
            status: 'applied',
            batch,
            executionTime,
            checksum
          });
          
        } catch (err) {
          results.push({
            name: migration.name,
            status: 'failed',
            error: err.message
          });
          throw err;
        }
      }
      
      return {
        success: true,
        batch,
        migrations: results
      };
      
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Create a new migration file
   */
  async createMigration(name) {
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const sanitizedName = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const filename = `${timestamp}_${sanitizedName}.js`;
    const filepath = join(this.migrationsPath, filename);
    
    const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

/**
 * Apply migration
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  // Migration logic here
}

/**
 * Rollback migration
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  // Rollback logic here
}
`;
    
    const { writeFileSync } = await import('fs');
    writeFileSync(filepath, template);
    
    return { filename, path: filepath };
  }

  /**
   * Rollback migrations
   * @param {number} steps - Number of batches to rollback, or 'all' for complete rollback
   */
  async rollback(steps = 1) {
    await this.initialize();
    await this.acquireLock();
    
    try {
      // Get batches to rollback
      const batchQuery = steps === 'all' 
        ? `SELECT DISTINCT batch FROM ${this.tableName} ORDER BY batch DESC`
        : `SELECT DISTINCT batch FROM ${this.tableName} ORDER BY batch DESC LIMIT ?`;
      
      const batches = this.db.prepare(batchQuery).all(...(steps === 'all' ? [] : [steps]));
      
      const results = [];
      
      for (const { batch } of batches) {
        const migrations = this.db.prepare(`
          SELECT * FROM ${this.tableName} 
          WHERE batch = ? 
          ORDER BY name DESC
        `).all(batch);
        
        for (const migration of migrations) {
          try {
            const migrationPath = join(this.migrationsPath, `${migration.name}.js`);
            
            // Validate checksum before rollback
            if (migration.checksum) {
              this._validateChecksum(migration.name, migration.checksum);
            }
            
            const { down } = await import(pathToFileURL(migrationPath).href);
            
            // Run rollback in transaction
            this.db.transaction(() => {
              down(this.db);
            })();
            
            // Remove migration record
            this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(migration.id);
            
            results.push({
              name: migration.name,
              status: 'rolled_back',
              batch
            });
            
          } catch (err) {
            results.push({
              name: migration.name,
              status: 'rollback_failed',
              error: err.message
            });
            throw err;
          }
        }
      }
      
      return {
        success: true,
        batches: batches.map(b => b.batch),
        migrations: results
      };
      
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Check migration status
   */
  status() {
    const applied = this.getAppliedMigrations();
    const pending = this.getPendingMigrations();
    
    return {
      applied: applied.length,
      pending: pending.length,
      total: applied.length + pending.length,
      currentBatch: applied.length > 0 
        ? Math.max(...applied.map(m => m.batch)) 
        : 0,
      lastApplied: applied.length > 0 
        ? applied[applied.length - 1].name 
        : null
    };
  }

  /**
   * Reset database (rollback all migrations)
   */
  async reset() {
    return this.rollback('all');
  }

  /**
   * Fresh start - reset and re-run all migrations
   */
  async fresh() {
    await this.reset();
    return this.runMigrations();
  }
}

/**
 * Factory function to create migration runner
 */
export function createMigrationRunner(db, options = {}) {
  return new MigrationRunner(db, options);
}

/**
 * Run migrations helper
 */
export async function runMigrations(db, options = {}) {
  const runner = createMigrationRunner(db, options);
  return runner.runMigrations();
}

export default {
  MigrationRunner,
  createMigrationRunner,
  runMigrations
};
