/**
 * @fileoverview Unit tests for MigrationRunner with checksum validation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MigrationRunner } from '../../../src/db/migrations/index.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Create mock database for tests
function createMockDb() {
  const data = { migrations: [] };
  let lockAcquired = false;
  
  return {
    exec: (sql) => {
      // Track table creation
      if (sql.includes('CREATE TABLE IF NOT EXISTS migrations')) {
        data.migrations = data.migrations || [];
      }
    },
    prepare: (sql) => {
      const self = {
        run: (...params) => {
          // INSERT
          if (sql.includes('INSERT INTO migrations')) {
            const name = params[0];
            const batch = params[1];
            const checksum = params[2] || null;
            const executionTime = params[3] || null;
            const id = data.migrations.length + 1;
            data.migrations.push({ id, name, batch, checksum, execution_time_ms: executionTime });
            return { lastInsertRowid: id, changes: 1 };
          }
          
          // UPDATE checksum
          if (sql.includes('UPDATE migrations SET checksum')) {
            const checksum = params[0];
            const name = params[1];
            const row = data.migrations.find(r => r.name === name);
            if (row) {
              row.checksum = checksum;
              return { changes: 1 };
            }
            return { changes: 0 };
          }
          
          // DELETE
          if (sql.includes('DELETE FROM migrations')) {
            const id = params[0];
            const idx = data.migrations.findIndex(r => r.id === id);
            if (idx !== -1) {
              data.migrations.splice(idx, 1);
              return { changes: 1 };
            }
            return { changes: 0 };
          }
          
          // Lock table operations
          if (sql.includes('_migration_lock')) {
            if (sql.includes('DELETE')) {
              lockAcquired = false;
              return { changes: 1 };
            }
            if (sql.includes('SELECT process_id')) {
              return { get: () => lockAcquired ? { process_id: String(process.pid) } : undefined };
            }
          }
          
          return { changes: 0 };
        },
        get: (...params) => {
          // SELECT single row
          if (sql.includes('SELECT checksum FROM migrations')) {
            const name = params[0];
            return data.migrations.find(r => r.name === name);
          }
          
          if (sql.includes('SELECT process_id FROM _migration_lock')) {
            return lockAcquired ? { process_id: String(process.pid) } : undefined;
          }
          
          if (sql.includes('COALESCE(MAX(batch)')) {
            if (data.migrations.length === 0) return { next_batch: 1 };
            const maxBatch = Math.max(...data.migrations.map(r => r.batch));
            return { next_batch: maxBatch + 1 };
          }
          
          return undefined;
        },
        all: (...params) => {
          if (sql.includes('SELECT * FROM migrations ORDER BY batch ASC')) {
            return [...data.migrations].sort((a, b) => {
              if (a.batch !== b.batch) return a.batch - b.batch;
              return a.name.localeCompare(b.name);
            });
          }
          
          if (sql.includes('SELECT DISTINCT batch FROM migrations')) {
            const batches = [...new Set(data.migrations.map(m => m.batch))].sort((a, b) => b - a);
            const limit = params[0];
            const result = limit ? batches.slice(0, limit) : batches;
            return result.map(batch => ({ batch }));
          }
          
          if (sql.includes('WHERE batch =')) {
            const batch = params[0];
            return data.migrations
              .filter(m => m.batch === batch)
              .sort((a, b) => b.name.localeCompare(a.name));
          }
          
          return [];
        }
      };
      
      // Handle lock table queries
      if (sql.includes('SELECT process_id FROM _migration_lock')) {
        return {
          get: () => lockAcquired ? { process_id: String(process.pid) } : undefined
        };
      }
      
      return self;
    },
    transaction: (fn) => {
      return () => fn();
    },
    _data: data,
    _acquireLock: () => { lockAcquired = true; },
    _releaseLock: () => { lockAcquired = false; }
  };
}

describe('MigrationRunner - Checksum Validation', () => {
  let testDir;
  let runner;
  let mockDb;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = join(tmpdir(), `migration-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    // Create a simple test migration file
    const migrationContent = `
export function up(db) {
  db.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY)');
}

export function down(db) {
  db.exec('DROP TABLE test_table');
}
`;
    writeFileSync(join(testDir, '001_test_migration.js'), migrationContent);
    
    mockDb = createMockDb();
    runner = new MigrationRunner(mockDb, { migrationsPath: testDir });
    
    // Override lock methods for testing
    runner.acquireLock = async () => { 
      mockDb._acquireLock();
      return true; 
    };
    runner.releaseLock = async () => { 
      mockDb._releaseLock();
    };
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('_calculateChecksum', () => {
    it('should calculate SHA256 checksum for a file', () => {
      const checksum = runner._calculateChecksum(join(testDir, '001_test_migration.js'));
      
      assert.ok(typeof checksum === 'string', 'Checksum should be a string');
      assert.ok(checksum.length === 64, 'SHA256 checksum should be 64 hex characters');
      assert.ok(/^[a-f0-9]{64}$/.test(checksum), 'Checksum should be valid hex');
    });

    it('should throw error for non-existent file', () => {
      assert.throws(() => {
        runner._calculateChecksum(join(testDir, 'non_existent.js'));
      }, /Failed to calculate checksum/);
    });

    it('should return consistent checksum for same content', () => {
      const filePath = join(testDir, '001_test_migration.js');
      const checksum1 = runner._calculateChecksum(filePath);
      const checksum2 = runner._calculateChecksum(filePath);
      
      assert.strictEqual(checksum1, checksum2, 'Same file should produce same checksum');
    });

    it('should return different checksum for different content', () => {
      const filePath1 = join(testDir, '001_test_migration.js');
      
      // Create a second file with different content
      const differentContent = `
export function up(db) {
  db.exec('CREATE TABLE other_table (id INTEGER PRIMARY KEY, name TEXT)');
}

export function down(db) {
  db.exec('DROP TABLE other_table');
}
`;
      writeFileSync(join(testDir, '002_other_migration.js'), differentContent);
      const filePath2 = join(testDir, '002_other_migration.js');
      
      const checksum1 = runner._calculateChecksum(filePath1);
      const checksum2 = runner._calculateChecksum(filePath2);
      
      assert.notStrictEqual(checksum1, checksum2, 'Different files should produce different checksums');
    });
  });

  describe('_validateChecksum', () => {
    it('should return true when checksum matches', () => {
      const filePath = join(testDir, '001_test_migration.js');
      const expectedChecksum = runner._calculateChecksum(filePath);
      
      const result = runner._validateChecksum('001_test_migration', expectedChecksum);
      
      assert.strictEqual(result, true, 'Should return true for matching checksum');
    });

    it('should throw error when checksum does not match', () => {
      const wrongChecksum = 'a'.repeat(64); // Fake checksum
      
      assert.throws(() => {
        runner._validateChecksum('001_test_migration', wrongChecksum);
      }, /Checksum mismatch/);
    });

    it('should include migration name in error message', () => {
      const wrongChecksum = 'b'.repeat(64);
      
      try {
        runner._validateChecksum('001_test_migration', wrongChecksum);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('001_test_migration'), 'Error should mention migration name');
        assert.ok(err.message.includes('has been modified'), 'Error should indicate file modification');
      }
    });
  });

  describe('_storeChecksum', () => {
    it('should store checksum in database', () => {
      const checksum = 'abc123def456';
      const migrationName = 'test_migration';
      
      // First insert a migration record
      mockDb.prepare('INSERT INTO migrations (name, batch) VALUES (?, ?)').run(migrationName, 1);
      
      // Store checksum
      runner._storeChecksum(migrationName, checksum);
      
      // Verify it was stored
      const result = mockDb.prepare('SELECT checksum FROM migrations WHERE name = ?').get(migrationName);
      assert.strictEqual(result.checksum, checksum, 'Checksum should be stored');
    });

    it('should update existing checksum', () => {
      const migrationName = 'test_migration';
      const checksum1 = 'checksum1';
      const checksum2 = 'checksum2';
      
      // Insert and store first checksum
      mockDb.prepare('INSERT INTO migrations (name, batch) VALUES (?, ?)').run(migrationName, 1);
      runner._storeChecksum(migrationName, checksum1);
      
      // Update with new checksum
      runner._storeChecksum(migrationName, checksum2);
      
      const result = mockDb.prepare('SELECT checksum FROM migrations WHERE name = ?').get(migrationName);
      assert.strictEqual(result.checksum, checksum2, 'Checksum should be updated');
    });
  });

  describe('Integration with runMigrations', () => {
    it('should store checksum when applying migration', async () => {
      await runner.initialize();
      
      // Run migrations
      const result = await runner.runMigrations();
      
      // Check that checksum was stored
      const applied = mockDb._data.migrations;
      assert.ok(applied.length > 0, 'Migration should be applied');
      assert.ok(applied[0].checksum, 'Checksum should be stored');
      assert.ok(applied[0].checksum.length === 64, 'Checksum should be SHA256');
    });

    it('should include checksum in result', async () => {
      await runner.initialize();
      
      const result = await runner.runMigrations();
      
      if (result.migrations.length > 0) {
        assert.ok(result.migrations[0].checksum, 'Result should include checksum');
      }
    });
  });

  describe('Integration with rollback', () => {
    it('should validate checksum during rollback', async () => {
      // Setup: apply migration with checksum
      const checksum = runner._calculateChecksum(join(testDir, '001_test_migration.js'));
      
      mockDb.prepare('INSERT INTO migrations (name, batch, checksum) VALUES (?, ?, ?)')
        .run('001_test_migration', 1, checksum);
      
      // Should not throw - checksum matches
      await runner.initialize();
      const result = await runner.rollback(1);
      
      assert.ok(result.success, 'Rollback should succeed with valid checksum');
    });

    it('should throw error when rolling back modified migration', async () => {
      // Setup: apply migration with wrong checksum
      const wrongChecksum = 'c'.repeat(64);
      
      mockDb.prepare('INSERT INTO migrations (name, batch, checksum) VALUES (?, ?, ?)')
        .run('001_test_migration', 1, wrongChecksum);
      
      await runner.initialize();
      
      // Should throw because file was "modified"
      try {
        await runner.rollback(1);
        assert.fail('Should have thrown checksum mismatch error');
      } catch (err) {
        assert.ok(err.message.includes('Checksum mismatch'), 'Should throw checksum mismatch error');
      }
    });

    it('should allow rollback when checksum is null (backward compatibility)', async () => {
      // Setup: migration without checksum (old migration)
      mockDb.prepare('INSERT INTO migrations (name, batch, checksum) VALUES (?, ?, ?)')
        .run('001_test_migration', 1, null);
      
      await runner.initialize();
      
      // Should succeed - no checksum to validate
      const result = await runner.rollback(1);
      assert.ok(result.success, 'Rollback should succeed when checksum is null');
    });
  });

  describe('Security', () => {
    it('should detect any file modification', async () => {
      const filePath = join(testDir, '001_test_migration.js');
      const originalChecksum = runner._calculateChecksum(filePath);
      
      // Modify the file
      const modifiedContent = `
export function up(db) {
  db.exec('CREATE TABLE modified_table (id INTEGER PRIMARY KEY)');
}

export function down(db) {
  db.exec('DROP TABLE modified_table');
}
`;
      writeFileSync(filePath, modifiedContent);
      
      // Validate should fail
      assert.throws(() => {
        runner._validateChecksum('001_test_migration', originalChecksum);
      }, /Checksum mismatch/);
    });

    it('should use SHA256 algorithm', () => {
      const filePath = join(testDir, '001_test_migration.js');
      const checksum = runner._calculateChecksum(filePath);
      
      // SHA256 produces 256-bit (32 byte) hash = 64 hex characters
      assert.strictEqual(checksum.length, 64, 'Should use SHA256 (64 hex chars)');
    });
  });
});

describe('MigrationRunner - Checksum Edge Cases', () => {
  it('should handle empty files', () => {
    const testDir = join(tmpdir(), `empty-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    try {
      // Create empty migration file
      writeFileSync(join(testDir, 'empty_migration.js'), '');
      
      const mockDb = createMockDb();
      const runner = new MigrationRunner(mockDb, { migrationsPath: testDir });
      
      const checksum = runner._calculateChecksum(join(testDir, 'empty_migration.js'));
      
      // Empty file should still produce valid SHA256
      assert.ok(/^[a-f0-9]{64}$/.test(checksum), 'Empty file should produce valid SHA256');
      assert.strictEqual(
        checksum,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'Empty file should have known SHA256 hash'
      );
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should handle special characters in file content', () => {
    const testDir = join(tmpdir(), `special-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    try {
      // Create migration with special characters
      const specialContent = `
export function up(db) {
  // Special chars: ñ 中文 🎉 émojis
  db.exec("CREATE TABLE special (name TEXT DEFAULT 'test\\nvalue')");
}
export function down(db) {}
`;
      writeFileSync(join(testDir, 'special_migration.js'), specialContent);
      
      const mockDb = createMockDb();
      const runner = new MigrationRunner(mockDb, { migrationsPath: testDir });
      
      const checksum = runner._calculateChecksum(join(testDir, 'special_migration.js'));
      
      assert.ok(/^[a-f0-9]{64}$/.test(checksum), 'Special chars should produce valid SHA256');
      
      // Verify consistency
      const checksum2 = runner._calculateChecksum(join(testDir, 'special_migration.js'));
      assert.strictEqual(checksum, checksum2, 'Should be consistent');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should handle very large migration files', () => {
    const testDir = join(tmpdir(), `large-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    try {
      // Create a large migration file (100KB instead of 1MB for faster test)
      const largeContent = 'export function up(db) {\n' + 
        'const sql = `' + 'x'.repeat(100 * 1024) + '`;\n' +
        'db.exec(sql);\n' +
        '}\nexport function down(db) {}';
      
      writeFileSync(join(testDir, 'large_migration.js'), largeContent);
      
      const mockDb = createMockDb();
      const runner = new MigrationRunner(mockDb, { migrationsPath: testDir });
      
      const startTime = Date.now();
      const checksum = runner._calculateChecksum(join(testDir, 'large_migration.js'));
      const duration = Date.now() - startTime;
      
      assert.ok(/^[a-f0-9]{64}$/.test(checksum), 'Large file should produce valid SHA256');
      assert.ok(duration < 500, 'Should calculate checksum quickly (<500ms for 100KB)');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
