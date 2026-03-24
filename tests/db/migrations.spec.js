/**
 * @fileoverview Database Migration Tests (DB-002)
 * Tests for rollback migrations, checksum validation, and FK integrity
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import migrations - convert to file:// URLs for Windows compatibility
const migration001Path = 'file:///' + join(__dirname, '../../src/db/migrations/001_initial_schema.js').replace(/\\/g, '/');
const migration002Path = 'file:///' + join(__dirname, '../../src/db/migrations/002_add_indexes.js').replace(/\\/g, '/');

// Regular paths for file system operations
const migration001FsPath = join(__dirname, '../../src/db/migrations/001_initial_schema.js');
const migration002FsPath = join(__dirname, '../../src/db/migrations/002_add_indexes.js');

/**
 * Calculate checksum for migration file content
 * @param {string} filePath - Path to migration file
 * @returns {string} SHA-256 checksum
 */
function calculateChecksum(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Create in-memory database for testing
 * Uses better-sqlite3 for compatibility with migrations
 */
async function createTestDatabase() {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Close database connection
 * @param {Object} db - Database instance
 */
async function closeDatabase(db) {
  if (db && db.close) {
    db.close();
  }
}

/**
 * Check if table exists
 * @param {Object} db - Database instance
 * @param {string} tableName - Table name
 * @returns {boolean}
 */
function tableExists(db, tableName) {
  const query = `SELECT name FROM sqlite_master WHERE type='table' AND name=?`;
  const row = db.prepare(query).get(tableName);
  return !!row;
}

/**
 * Check if index exists
 * @param {Object} db - Database instance
 * @param {string} indexName - Index name
 * @returns {boolean}
 */
function indexExists(db, indexName) {
  const query = `SELECT name FROM sqlite_master WHERE type='index' AND name=?`;
  const row = db.prepare(query).get(indexName);
  return !!row;
}

/**
 * Check if trigger exists
 * @param {Object} db - Database instance
 * @param {string} triggerName - Trigger name
 * @returns {boolean}
 */
function triggerExists(db, triggerName) {
  const query = `SELECT name FROM sqlite_master WHERE type='trigger' AND name=?`;
  const row = db.prepare(query).get(triggerName);
  return !!row;
}

/**
 * Get all foreign keys for a table
 * @param {Object} db - Database instance
 * @param {string} tableName - Table name
 * @returns {Array}
 */
function getForeignKeys(db, tableName) {
  const query = `PRAGMA foreign_key_list(${tableName})`;
  return db.prepare(query).all();
}

/**
 * Get row count from table
 * @param {Object} db - Database instance
 * @param {string} tableName - Table name
 * @returns {number}
 */
function getRowCount(db, tableName) {
  const query = `SELECT COUNT(*) as count FROM ${tableName}`;
  const row = db.prepare(query).get();
  return row ? row.count : 0;
}

describe('Database Migrations', () => {
  
  describe('001_initial_schema', () => {
    it('should apply up migration correctly', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);

        const tables = [
          'users', 'tasks', 'roadmaps', 'roadmap_nodes', 'contexts',
          'conversations', 'messages', 'checkpoints', 'audit_logs',
          'merkle_trees', 'merkle_leaves', 'batches', 'alerts', 
          'analytics', 'settings'
        ];

        for (const table of tables) {
          assert.ok(tableExists(db, table), `Table ${table} should exist after up migration`);
        }
      } finally {
        await closeDatabase(db);
      }
    });

    it('should create users table with correct structure', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);
        const columns = db.prepare("PRAGMA table_info(users)").all();
        const columnNames = columns.map(c => c.name);
        
        assert.ok(columnNames.includes('id'), 'users table should have id column');
        assert.ok(columnNames.includes('uuid'), 'users table should have uuid column');
        assert.ok(columnNames.includes('email'), 'users table should have email column');
        assert.ok(columnNames.includes('username'), 'users table should have username column');
        assert.ok(columnNames.includes('password_hash'), 'users table should have password_hash column');
        assert.ok(columnNames.includes('status'), 'users table should have status column');
        assert.ok(columnNames.includes('role'), 'users table should have role column');
        assert.ok(columnNames.includes('created_at'), 'users table should have created_at column');
        assert.ok(columnNames.includes('updated_at'), 'users table should have updated_at column');
        assert.ok(columnNames.includes('deleted_at'), 'users table should have deleted_at column');
      } finally {
        await closeDatabase(db);
      }
    });

    it('should create tasks table with foreign keys', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);
        const foreignKeys = getForeignKeys(db, 'tasks');
        
        assert.ok(foreignKeys.length > 0, 'tasks table should have foreign keys');
        const fkReferences = foreignKeys.map(fk => fk.table);
        assert.ok(fkReferences.includes('users') || fkReferences.includes('tasks'), 
          'tasks should reference users or tasks table');
      } finally {
        await closeDatabase(db);
      }
    });

    it('should create indexes on users table', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);
        const indexes = ['idx_users_email', 'idx_users_username', 'idx_users_status', 'idx_users_deleted_at'];
        for (const index of indexes) {
          assert.ok(indexExists(db, index), `Index ${index} should exist`);
        }
      } finally {
        await closeDatabase(db);
      }
    });

    it('should create update triggers', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);
        const triggers = [
          'trg_users_updated_at', 'trg_tasks_updated_at', 'trg_roadmaps_updated_at',
          'trg_roadmap_nodes_updated_at', 'trg_contexts_updated_at',
          'trg_conversations_updated_at', 'trg_messages_updated_at',
          'trg_batches_updated_at', 'trg_settings_updated_at'
        ];

        for (const trigger of triggers) {
          assert.ok(triggerExists(db, trigger), `Trigger ${trigger} should exist`);
        }
      } finally {
        await closeDatabase(db);
      }
    });

    it('should support UUID generation', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);
        
        db.prepare(`INSERT INTO users (username, email, display_name, status, role)
          VALUES ('testuser', 'test@example.com', 'Test User', 'active', 'user')`).run();
        
        const user = db.prepare('SELECT uuid FROM users LIMIT 1').get();
        assert.ok(user, 'User should be inserted');
        assert.ok(user.uuid, 'User should have auto-generated UUID');
        assert.match(user.uuid, /^[0-9a-f]{32}$/, 'UUID should be 32 hex characters');
      } finally {
        await closeDatabase(db);
      }
    });

    it('should rollback with down migration', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);
        assert.ok(tableExists(db, 'users'), 'users should exist before rollback');

        migration001.down(db);

        const tables = [
          'users', 'tasks', 'roadmaps', 'roadmap_nodes', 'contexts',
          'conversations', 'messages', 'checkpoints', 'audit_logs',
          'merkle_trees', 'merkle_leaves', 'batches', 'alerts', 
          'analytics', 'settings', 'migrations'
        ];

        for (const table of tables) {
          assert.ok(!tableExists(db, table), `Table ${table} should not exist after down migration`);
        }
      } finally {
        await closeDatabase(db);
      }
    });

    it('should drop triggers on down migration', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);
        migration001.down(db);

        const triggers = ['trg_users_updated_at', 'trg_tasks_updated_at', 'trg_roadmaps_updated_at'];
        for (const trigger of triggers) {
          assert.ok(!triggerExists(db, trigger), `Trigger ${trigger} should not exist after down migration`);
        }
      } finally {
        await closeDatabase(db);
      }
    });

    it('should handle multiple up/down cycles', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);
        migration001.down(db);
        migration001.up(db);
        migration001.down(db);
        migration001.up(db);

        assert.ok(tableExists(db, 'users'), 'users should exist after cycles');
        assert.ok(tableExists(db, 'tasks'), 'tasks should exist after cycles');
        
        db.prepare(`INSERT INTO users (username, email, display_name, status, role)
          VALUES ('testuser', 'test@example.com', 'Test User', 'active', 'user')`).run();
        
        const count = getRowCount(db, 'users');
        assert.equal(count, 1, 'Should be able to insert data after cycles');
      } finally {
        await closeDatabase(db);
      }
    });
  });

  describe('002_add_indexes', () => {
    it('should apply up migration correctly', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      const migration002 = await import(migration002Path);
      
      try {
        migration001.up(db);
        migration002.up(db);

        const indexes = [
          'idx_users_role_status', 'idx_users_last_login',
          'idx_tasks_queue', 'idx_tasks_assignee_status', 'idx_tasks_overdue',
          'idx_tasks_hierarchy', 'idx_roadmaps_active',
          'idx_nodes_type_status', 'idx_nodes_dependencies',
          'idx_contexts_access', 'idx_contexts_public'
        ];

        for (const index of indexes) {
          assert.ok(indexExists(db, index), `Index ${index} should exist after up migration`);
        }
      } finally {
        await closeDatabase(db);
      }
    });

    it('should create FTS5 virtual tables', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      const migration002 = await import(migration002Path);
      
      try {
        migration001.up(db);
        migration002.up(db);

        const ftsTables = ['messages_fts', 'tasks_fts', 'contexts_fts'];
        for (const table of ftsTables) {
          assert.ok(tableExists(db, table), `FTS5 table ${table} should exist`);
        }
      } finally {
        await closeDatabase(db);
      }
    });

    it('should create FTS5 sync triggers', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      const migration002 = await import(migration002Path);
      
      try {
        migration001.up(db);
        migration002.up(db);

        const ftsTriggers = [
          'trg_messages_fts_insert', 'trg_messages_fts_update', 'trg_messages_fts_delete',
          'trg_tasks_fts_insert', 'trg_tasks_fts_update', 'trg_tasks_fts_delete',
          'trg_contexts_fts_insert', 'trg_contexts_fts_update', 'trg_contexts_fts_delete'
        ];

        for (const trigger of ftsTriggers) {
          assert.ok(triggerExists(db, trigger), `FTS trigger ${trigger} should exist`);
        }
      } finally {
        await closeDatabase(db);
      }
    });

    it('should create document_chunks table', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      const migration002 = await import(migration002Path);
      
      try {
        migration001.up(db);
        migration002.up(db);

        assert.ok(tableExists(db, 'document_chunks'), 'document_chunks table should exist');
        assert.ok(indexExists(db, 'idx_chunks_context'), 'idx_chunks_context index should exist');
      } finally {
        await closeDatabase(db);
      }
    });

    it('should create index_statistics table', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      const migration002 = await import(migration002Path);
      
      try {
        migration001.up(db);
        migration002.up(db);

        assert.ok(tableExists(db, 'index_statistics'), 'index_statistics table should exist');
      } finally {
        await closeDatabase(db);
      }
    });

    it('should rollback with down migration', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      const migration002 = await import(migration002Path);
      
      try {
        migration001.up(db);
        migration002.up(db);

        assert.ok(indexExists(db, 'idx_users_role_status'), 'Index should exist before rollback');

        migration002.down(db);

        const indexes = [
          'idx_users_role_status', 'idx_tasks_queue', 'idx_roadmaps_active',
          'idx_contexts_access', 'idx_conversations_recent'
        ];

        for (const index of indexes) {
          assert.ok(!indexExists(db, index), `Index ${index} should not exist after down migration`);
        }
      } finally {
        await closeDatabase(db);
      }
    });

    it('should drop FTS5 tables on down migration', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      const migration002 = await import(migration002Path);
      
      try {
        migration001.up(db);
        migration002.up(db);
        migration002.down(db);

        const ftsTables = ['messages_fts', 'tasks_fts', 'contexts_fts'];
        for (const table of ftsTables) {
          assert.ok(!tableExists(db, table), `FTS5 table ${table} should not exist after down migration`);
        }
      } finally {
        await closeDatabase(db);
      }
    });

    it('should preserve core tables after down migration', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      const migration002 = await import(migration002Path);
      
      try {
        migration001.up(db);
        migration002.up(db);
        migration002.down(db);

        assert.ok(tableExists(db, 'users'), 'users table should still exist');
        assert.ok(tableExists(db, 'tasks'), 'tasks table should still exist');
        assert.ok(tableExists(db, 'roadmaps'), 'roadmaps table should still exist');
      } finally {
        await closeDatabase(db);
      }
    });
  });

  describe('MigrationRunner Checksum Validation', () => {
    it('should calculate consistent checksums for migration files', () => {
      const checksum001 = calculateChecksum(migration001FsPath);
      const checksum002 = calculateChecksum(migration002FsPath);

      assert.ok(checksum001, 'Checksum for 001 should be calculated');
      assert.ok(checksum002, 'Checksum for 002 should be calculated');
      assert.notEqual(checksum001, checksum002, 'Different files should have different checksums');
      assert.equal(checksum001.length, 64, 'SHA-256 checksum should be 64 characters');
      assert.match(checksum001, /^[0-9a-f]+$/, 'Checksum should be hex string');
    });

    it('should produce same checksum for same content', () => {
      const checksum1 = calculateChecksum(migration001FsPath);
      const checksum2 = calculateChecksum(migration001FsPath);

      assert.equal(checksum1, checksum2, 'Same file should produce same checksum');
    });
  });

  describe('Combined Migration Flow', () => {
    it('should apply all migrations in sequence', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      const migration002 = await import(migration002Path);
      
      try {
        migration001.up(db);
        migration002.up(db);

        assert.ok(tableExists(db, 'users'), 'users from 001 should exist');
        assert.ok(tableExists(db, 'document_chunks'), 'document_chunks from 002 should exist');
        assert.ok(indexExists(db, 'idx_users_role_status'), 'indexes from 002 should exist');
        assert.ok(tableExists(db, 'messages_fts'), 'FTS tables from 002 should exist');
      } finally {
        await closeDatabase(db);
      }
    });

    it('should rollback all migrations in reverse order', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      const migration002 = await import(migration002Path);
      
      try {
        migration001.up(db);
        migration002.up(db);
        migration002.down(db);
        migration001.down(db);

        assert.ok(!tableExists(db, 'users'), 'All tables should be dropped');
        assert.ok(!tableExists(db, 'document_chunks'), 'All 002 tables should be dropped');
        assert.ok(!indexExists(db, 'idx_users_role_status'), 'All indexes should be dropped');
      } finally {
        await closeDatabase(db);
      }
    });
  });

  describe('Foreign Key Integrity', () => {
    it('should enforce FK constraints on tasks table', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);

        assert.throws(() => {
          db.prepare(`INSERT INTO tasks (title, description, creator_id)
            VALUES ('Test', 'Test', 99999)`).run();
        }, /FOREIGN KEY constraint failed/i, 'Should throw FK constraint error');
      } finally {
        await closeDatabase(db);
      }
    });

    it('should cascade delete on task parent_id', async () => {
      const db = await createTestDatabase();
      const migration001 = await import(migration001Path);
      
      try {
        migration001.up(db);
        
        db.prepare(`INSERT INTO users (username, email, display_name, status, role)
          VALUES ('testuser', 'test@example.com', 'Test User', 'active', 'user')`).run();
        
        const parentTask = db.prepare(`INSERT INTO tasks (title, creator_id, status)
          VALUES ('Parent Task', 1, 'pending')`).run();
        const parentId = parentTask.lastInsertRowid;

        db.prepare(`INSERT INTO tasks (title, parent_id, creator_id, status)
          VALUES ('Child Task', ?, 1, 'pending')`).run(parentId);

        const childBefore = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE parent_id = ?').get(parentId);
        assert.equal(childBefore.count, 1, 'Child task should exist');

        db.prepare('DELETE FROM tasks WHERE id = ?').run(parentId);

        const childAfter = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE parent_id = ?').get(parentId);
        assert.equal(childAfter.count, 0, 'Child task should be cascade deleted');
      } finally {
        await closeDatabase(db);
      }
    });
  });
});
