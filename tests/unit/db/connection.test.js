/**
 * @fileoverview Unit tests for Database Connection Pool
 * Tests connection management, pool sizing, load handling, and edge cases
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import { ConnectionPool } from '../../../src/db/connection/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DB_DIR = join(__dirname, '../../../.tmp');

describe('Database Connection', () => {
  let pool;
  let testDbPath;

  before(async () => {
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    testDbPath = join(TEST_DB_DIR, `test-connection-${Date.now()}.db`);
  });

  after(async () => {
    if (pool) {
      try {
        await pool.close();
      } catch {
        // Ignore cleanup errors
      }
    }
    // Cleanup test dbs
    try {
      const files = fs.readdirSync(TEST_DB_DIR);
      for (const file of files) {
        if (file.startsWith('test-') && file.endsWith('.db')) {
          fs.unlinkSync(join(TEST_DB_DIR, file));
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Connection Management', () => {
    it('should establish connection with valid database path', async () => {
      pool = new ConnectionPool({
        databasePath: testDbPath,
        minConnections: 1,
        maxConnections: 3
      });

      await pool.initialize();
      const stats = pool.getStats();
      
      assert.ok(stats.total >= 1, 'Pool should have at least 1 connection');
      assert.equal(stats.inUse, 0, 'No connections should be in use initially');
    });

    it('should reject invalid database path', async () => {
      const invalidPool = new ConnectionPool({
        databasePath: '/nonexistent/path/to/db.sqlite',
        minConnections: 1,
        maxConnections: 3,
        acquireTimeout: 1000
      });

      try {
        await invalidPool.initialize();
        assert.fail('Should have thrown an error');
      } catch (err) {
        assert.ok(err.message.includes('SQLITE_CANTOPEN') || err.message.includes('unable to open'), 
          'Should throw database open error');
      }
    });

    it('should acquire and release connections', async () => {
      if (!pool) {
        pool = new ConnectionPool({
          databasePath: join(TEST_DB_DIR, `test-acquire-${Date.now()}.db`),
          minConnections: 1,
          maxConnections: 3
        });
        await pool.initialize();
      }

      const db = await pool.acquire();
      assert.ok(db, 'Should acquire a database connection');
      
      const statsDuring = pool.getStats();
      assert.equal(statsDuring.inUse, 1, 'One connection should be in use');
      
      pool.release(db);
      
      const statsAfter = pool.getStats();
      assert.equal(statsAfter.inUse, 0, 'No connections should be in use after release');
    });

    it('should execute queries and return results', async () => {
      if (!pool) {
        pool = new ConnectionPool({
          databasePath: join(TEST_DB_DIR, `test-queries-${Date.now()}.db`),
          minConnections: 1,
          maxConnections: 3
        });
        await pool.initialize();
      }

      await pool.run(`
        CREATE TABLE IF NOT EXISTS test_table (
          id INTEGER PRIMARY KEY,
          name TEXT
        )
      `);

      const insertResult = await pool.run(
        'INSERT INTO test_table (name) VALUES (?)',
        ['test']
      );
      
      assert.ok(insertResult.lastID > 0, 'Should have lastID');
      assert.equal(insertResult.changes, 1, 'Should have 1 change');

      const row = await pool.get('SELECT * FROM test_table WHERE id = ?', [insertResult.lastID]);
      assert.equal(row.name, 'test', 'Should retrieve correct data');

      const all = await pool.all('SELECT * FROM test_table');
      assert.ok(Array.isArray(all), 'Should return array');
      assert.equal(all.length, 1, 'Should have 1 row');
    });
  });

  describe('Pool Management', () => {
    it('should manage connection pool size correctly', async () => {
      const testPool = new ConnectionPool({
        databasePath: join(TEST_DB_DIR, `test-pool-size-${Date.now()}.db`),
        minConnections: 2,
        maxConnections: 5
      });

      await testPool.initialize();
      
      const stats = testPool.getStats();
      assert.ok(stats.total >= 2, 'Pool should have at least minConnections');
      
      await testPool.close();
    });

    it('should handle pool exhaustion with timeout', async () => {
      const testPool = new ConnectionPool({
        databasePath: join(TEST_DB_DIR, `test-exhaustion-${Date.now()}.db`),
        minConnections: 1,
        maxConnections: 2,
        acquireTimeout: 1000
      });

      await testPool.initialize();

      // Acquire all connections
      const conn1 = await testPool.acquire();
      const conn2 = await testPool.acquire();

      // Try to acquire a third connection - should timeout
      try {
        await testPool.acquire();
        assert.fail('Should have thrown timeout error');
      } catch (err) {
        assert.ok(err.message.includes('Failed to acquire connection'), 
          'Should throw acquire timeout error');
      }

      testPool.release(conn1);
      testPool.release(conn2);
      await testPool.close();
    });

    it('should create new connections when needed', async () => {
      const testPool = new ConnectionPool({
        databasePath: join(TEST_DB_DIR, `test-grow-${Date.now()}.db`),
        minConnections: 1,
        maxConnections: 5
      });

      await testPool.initialize();
      const initialStats = testPool.getStats();
      
      // Acquire multiple connections to trigger pool growth
      const connections = [];
      for (let i = 0; i < 3; i++) {
        connections.push(await testPool.acquire());
      }
      
      const duringStats = testPool.getStats();
      assert.ok(duringStats.total >= 3, 'Pool should have grown to accommodate demand');
      
      // Release all
      connections.forEach(c => testPool.release(c));
      await testPool.close();
    });
  });

  describe('Transaction Support', () => {
    it('should execute transactions successfully', async () => {
      if (!pool) {
        pool = new ConnectionPool({
          databasePath: join(TEST_DB_DIR, `test-tx-${Date.now()}.db`),
          minConnections: 1,
          maxConnections: 3
        });
        await pool.initialize();
      }

      await pool.run(`
        CREATE TABLE IF NOT EXISTS tx_test (
          id INTEGER PRIMARY KEY,
          value TEXT
        )
      `);

      const result = await pool.withTransaction(async (db) => {
        await new Promise((resolve, reject) => {
          db.run('INSERT INTO tx_test (value) VALUES (?)', ['tx1'], function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID });
          });
        });
        await new Promise((resolve, reject) => {
          db.run('INSERT INTO tx_test (value) VALUES (?)', ['tx2'], function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID });
          });
        });
        return 'success';
      });

      assert.equal(result, 'success', 'Transaction should return success');

      const rows = await pool.all('SELECT * FROM tx_test WHERE value LIKE "tx%"');
      assert.equal(rows.length, 2, 'Both inserts should be committed');
    });

    it('should rollback on transaction failure', async () => {
      if (!pool) {
        pool = new ConnectionPool({
          databasePath: join(TEST_DB_DIR, `test-tx-rollback-${Date.now()}.db`),
          minConnections: 1,
          maxConnections: 3
        });
        await pool.initialize();
      }

      await pool.run(`
        CREATE TABLE IF NOT EXISTS tx_test (
          id INTEGER PRIMARY KEY,
          value TEXT
        )
      `);
      await pool.run('DELETE FROM tx_test');

      try {
        await pool.withTransaction(async (db) => {
          await new Promise((resolve, reject) => {
            db.run('INSERT INTO tx_test (value) VALUES (?)', ['will-rollback'], function(err) {
              if (err) reject(err);
              else resolve();
            });
          });
          throw new Error('Intentional failure');
        });
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.equal(err.message, 'Intentional failure');
      }

      const rows = await pool.all('SELECT * FROM tx_test WHERE value = ?', ['will-rollback']);
      assert.equal(rows.length, 0, 'Insert should have been rolled back');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query results', async () => {
      if (!pool) {
        pool = new ConnectionPool({
          databasePath: join(TEST_DB_DIR, `test-empty-${Date.now()}.db`),
          minConnections: 1,
          maxConnections: 3
        });
        await pool.initialize();
      }

      await pool.run(`
        CREATE TABLE IF NOT EXISTS empty_test (
          id INTEGER PRIMARY KEY,
          value TEXT
        )
      `);

      const rows = await pool.all('SELECT * FROM empty_test WHERE 1=0');
      assert.ok(Array.isArray(rows), 'Should return array');
      assert.equal(rows.length, 0, 'Should be empty');

      const row = await pool.get('SELECT * FROM empty_test WHERE 1=0');
      assert.equal(row, undefined, 'Should return undefined for no results');
    });

    it('should handle special characters in queries', async () => {
      if (!pool) {
        pool = new ConnectionPool({
          databasePath: join(TEST_DB_DIR, `test-special-${Date.now()}.db`),
          minConnections: 1,
          maxConnections: 3
        });
        await pool.initialize();
      }

      await pool.run(`
        CREATE TABLE IF NOT EXISTS special_test (
          id INTEGER PRIMARY KEY,
          value TEXT
        )
      `);

      const specialValues = [
        "value with 'quotes'",
        'value with "double quotes"',
        'value with \n newline',
        'value with \t tab',
        'value with unicode: 中文 🎉',
        'value with backslash \\'
      ];

      for (const value of specialValues) {
        const result = await pool.run('INSERT INTO special_test (value) VALUES (?)', [value]);
        const row = await pool.get('SELECT * FROM special_test WHERE id = ?', [result.lastID]);
        assert.equal(row.value, value, `Should handle special characters: ${value}`);
      }
    });

    it('should reject invalid SQL', async () => {
      if (!pool) {
        pool = new ConnectionPool({
          databasePath: join(TEST_DB_DIR, `test-invalid-${Date.now()}.db`),
          minConnections: 1,
          maxConnections: 3
        });
        await pool.initialize();
      }

      try {
        await pool.run('INVALID SQL SYNTAX');
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('SQLITE_ERROR') || err.message.includes('syntax error'), 
          'Should throw SQL error: ' + err.message);
      }
    });

    it('should handle releasing unknown connections gracefully', async () => {
      if (!pool) {
        pool = new ConnectionPool({
          databasePath: join(TEST_DB_DIR, `test-release-${Date.now()}.db`),
          minConnections: 1,
          maxConnections: 3
        });
        await pool.initialize();
      }

      // Create a fake connection
      const fakeDb = { fake: true };
      
      // Should not throw
      pool.release(fakeDb);
      
      // Stats should be unchanged
      const stats = pool.getStats();
      assert.ok(stats.total >= 0, 'Stats should be valid');
    });

    it('should emit events during lifecycle', async () => {
      const events = [];
      
      const eventPool = new ConnectionPool({
        databasePath: join(TEST_DB_DIR, `test-events-${Date.now()}.db`),
        minConnections: 1,
        maxConnections: 2
      });

      eventPool.on('initializing', () => events.push('initializing'));
      eventPool.on('initialized', () => events.push('initialized'));
      eventPool.on('connectionCreated', () => events.push('connectionCreated'));
      eventPool.on('connectionAcquired', () => events.push('connectionAcquired'));
      eventPool.on('connectionReleased', () => events.push('connectionReleased'));
      eventPool.on('shuttingDown', () => events.push('shuttingDown'));
      eventPool.on('closed', () => events.push('closed'));

      await eventPool.initialize();
      const conn = await eventPool.acquire();
      eventPool.release(conn);
      await eventPool.close();

      assert.ok(events.includes('initializing'), 'Should emit initializing');
      assert.ok(events.includes('initialized'), 'Should emit initialized');
      assert.ok(events.includes('connectionCreated'), 'Should emit connectionCreated');
      assert.ok(events.includes('connectionAcquired'), 'Should emit connectionAcquired');
      assert.ok(events.includes('connectionReleased'), 'Should emit connectionReleased');
      assert.ok(events.includes('shuttingDown'), 'Should emit shuttingDown');
      assert.ok(events.includes('closed'), 'Should emit closed');
    });
  });
});
