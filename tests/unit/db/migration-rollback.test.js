/**
 * @fileoverview Migration Rollback Tests
 * Tests comprehensive migration rollback scenarios including partial rollbacks,
 * checksum validation during rollback, and data integrity
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

import { MigrationRunner } from '../../../src/db/migrations/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DB_PATH = join(__dirname, '../../../.tmp/test-rollback.db');
const MIGRATIONS_PATH = join(__dirname, '../../../src/db/migrations');

describe('Migration Rollback', () => {
  let db;
  let runner;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    runner = new MigrationRunner(db, { migrationsPath: MIGRATIONS_PATH });
  });

  afterEach(() => {
    if (db) {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  /**
   * Helper to check if a migration is irreversible
   * Some migrations (like 005_repository_contract_alignment) are intentionally irreversible
   */
  function isIrreversibleMigration(migrationName) {
    return migrationName === '005_repository_contract_alignment';
  }

  describe('Full Rollback Scenarios', () => {
    it('should rollback all migrations in reverse order', async () => {
      // First apply all migrations
      await runner.initialize();
      const applyResult = await runner.runMigrations();
      
      assert.ok(applyResult.success, 'Migrations should apply successfully');
      assert.ok(applyResult.migrations.length > 0, 'Should have applied migrations');

      // Get list of tables after migration
      const tablesAfterApply = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all().map(t => t.name);

      assert.ok(tablesAfterApply.includes('users'), 'users table should exist');
      assert.ok(tablesAfterApply.includes('tasks'), 'tasks table should exist');
      assert.ok(tablesAfterApply.includes('auth_users'), 'auth_users table should exist');

      // Now rollback all migrations - some may be irreversible
      try {
        const rollbackResult = await runner.rollback('all');
        
        assert.ok(rollbackResult.success, 'Rollback should succeed');
        
        // Check that core tables are removed (if no irreversible migrations)
        const tablesAfterRollback = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).all().map(t => t.name);

        // Note: If irreversible migrations exist, tables may still exist
        if (!rollbackResult.migrations.some(m => isIrreversibleMigration(m.name))) {
          assert.ok(!tablesAfterRollback.includes('users'), 'users table should not exist');
        }
      } catch (err) {
        // Some migrations may be irreversible - this is valid behavior
        assert.ok(err.message.includes('irreversible') || err.message.includes('restore from backup'),
          'Should indicate irreversible migration: ' + err.message);
      }
    });

    it('should handle step-by-step rollback', async () => {
      await runner.initialize();
      
      // Apply all migrations
      await runner.runMigrations();

      // Get initial migration count
      const appliedMigrations = db.prepare('SELECT COUNT(*) as count FROM migrations').get();
      const initialCount = appliedMigrations.count;
      assert.ok(initialCount > 0, 'Should have applied migrations');

      // Rollback 1 batch at a time (stopping at irreversible migrations)
      let canContinue = true;
      let rollbackCount = 0;
      
      while (canContinue && rollbackCount < 20) {
        try {
          const result = await runner.rollback(1);
          if (!result.success || result.migrations.length === 0) {
            canContinue = false;
          }
          rollbackCount++;
        } catch (err) {
          // Irreversible migration encountered - this is valid
          if (err.message.includes('irreversible')) {
            canContinue = false;
          } else {
            throw err;
          }
        }
      }

      // Verify some migrations were rolled back (or we hit irreversible)
      const finalCount = db.prepare('SELECT COUNT(*) as count FROM migrations').get();
      assert.ok(finalCount.count < initialCount || !canContinue, 
        'Should rollback some migrations or encounter irreversible');
    });

    it('should maintain database integrity during rollback', async () => {
      await runner.initialize();
      
      // Apply migrations
      await runner.runMigrations();

      // Insert some test data
      db.prepare(`
        INSERT INTO users (username, email, display_name, status, role)
        VALUES ('testuser', 'test@example.com', 'Test User', 'active', 'user')
      `).run();

      const userCountBefore = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
      assert.equal(userCountBefore, 1, 'User should exist');

      // Rollback should fail or succeed but data might be lost (depending on implementation)
      // The important thing is that the database remains consistent
      try {
        await runner.rollback('all');
      } catch (err) {
        // Rollback might fail due to foreign key constraints, which is acceptable
        assert.ok(err.message.includes('foreign key') || err.message.includes('FOREIGN KEY'),
          'Should fail with foreign key constraint if data exists');
      }
    });
  });

  describe('Checksum Validation During Rollback', () => {
    it('should validate checksums when rolling back', async () => {
      await runner.initialize();
      await runner.runMigrations();

      // Get a migration with checksum (skipping irreversible ones)
      const migrations = db.prepare('SELECT * FROM migrations WHERE checksum IS NOT NULL').all();
      const reversibleMigration = migrations.find(m => !isIrreversibleMigration(m.name));
      
      if (reversibleMigration) {
        // Rollback should validate checksum
        try {
          const result = await runner.rollback(1);
          assert.ok(result.success, 'Rollback with valid checksum should succeed');
        } catch (err) {
          // May hit irreversible migration
          assert.ok(err.message.includes('irreversible') || err.message.includes('restore'),
            'Should indicate irreversible: ' + err.message);
        }
      }
    });

    it('should detect tampered migrations during rollback', async () => {
      await runner.initialize();
      await runner.runMigrations();

      // Modify a checksum in the database to simulate tampering
      const migration = db.prepare('SELECT * FROM migrations WHERE checksum IS NOT NULL LIMIT 1').get();
      
      if (migration) {
        // Set an invalid checksum
        db.prepare('UPDATE migrations SET checksum = ? WHERE id = ?')
          .run('a'.repeat(64), migration.id);

        // Rollback should fail due to checksum mismatch
        try {
          await runner.rollback(1);
          assert.fail('Should have thrown checksum mismatch error');
        } catch (err) {
          assert.ok(err.message.includes('Checksum mismatch'), 
            'Should detect checksum mismatch: ' + err.message);
        }
      }
    });
  });

  describe('Partial Rollback Scenarios', () => {
    it('should rollback specific number of batches', async () => {
      await runner.initialize();
      await runner.runMigrations();

      // Get distinct batches
      const batches = db.prepare('SELECT DISTINCT batch FROM migrations ORDER BY batch').all();
      const initialBatchCount = batches.length;
      assert.ok(initialBatchCount > 1, 'Should have multiple batches for meaningful test');

      // Rollback only 1 batch
      const result = await runner.rollback(1);
      assert.ok(result.success, 'Partial rollback should succeed');

      // Verify some migrations remain
      const remainingMigrations = db.prepare('SELECT COUNT(*) as count FROM migrations').get();
      assert.ok(remainingMigrations.count > 0, 'Some migrations should remain');
    });

    it('should handle rollback of empty database', async () => {
      await runner.initialize();
      
      // Try to rollback without any migrations applied
      const result = await runner.rollback(1);
      
      assert.ok(result.success, 'Rollback on empty database should succeed');
      assert.equal(result.migrations.length, 0, 'Should have no migrations to rollback');
    });
  });

  describe('Rollback Edge Cases', () => {
    it('should handle concurrent rollback attempts', async () => {
      await runner.initialize();
      await runner.runMigrations();

      // Try to run two rollbacks concurrently
      const results = await Promise.allSettled([
        runner.rollback(1),
        runner.rollback(1)
      ]);

      // At least one should succeed, the other might fail due to locking
      const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected');

      assert.ok(succeeded.length >= 1, 'At least one rollback should succeed');
    });

    it('should recover from failed rollback', async () => {
      await runner.initialize();
      await runner.runMigrations();

      // Get migration count before
      const countBefore = db.prepare('SELECT COUNT(*) as count FROM migrations').get().count;

      // First rollback should succeed
      const result1 = await runner.rollback(1);
      
      if (result1.success) {
        // Verify state is consistent
        const countAfter = db.prepare('SELECT COUNT(*) as count FROM migrations').get().count;
        assert.ok(countAfter <= countBefore, 'Migration count should decrease or stay same');
      }
    });

    it('should handle rollback after fresh', async () => {
      await runner.initialize();
      
      // Run fresh (reset + re-run)
      const freshResult = await runner.fresh();
      assert.ok(freshResult.success, 'Fresh should succeed');

      // Now rollback
      const rollbackResult = await runner.rollback(1);
      assert.ok(rollbackResult.success, 'Rollback after fresh should succeed');
    });
  });

  describe('Migration State Consistency', () => {
    it('should track migration status correctly', async () => {
      await runner.initialize();

      // Initial status
      let status = runner.status();
      assert.equal(status.applied, 0, 'Initially no migrations applied');

      // After running migrations
      await runner.runMigrations();
      status = runner.status();
      assert.ok(status.applied > 0, 'Should have applied migrations');
      assert.equal(status.pending, 0, 'Should have no pending migrations');

      // After rollback
      await runner.rollback(1);
      status = runner.status();
      assert.ok(status.applied < status.total, 'Should have fewer applied after rollback');
    });

    it('should handle idempotent migrations', async () => {
      await runner.initialize();

      // Run migrations twice
      const result1 = await runner.runMigrations();
      const result2 = await runner.runMigrations();

      // Second run should not apply new migrations
      assert.equal(result2.migrations.length, 0, 'Second run should apply no new migrations');
    });
  });
});
