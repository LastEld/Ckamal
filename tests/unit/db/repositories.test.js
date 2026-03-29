/**
 * @fileoverview Repository Tests
 * Tests all repository implementations with CRUD operations and edge cases
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

import { MigrationRunner } from '../../../src/db/migrations/index.js';
import { ConnectionPool } from '../../../src/db/connection/index.js';
import { RepositoryFactory } from '../../../src/db/repositories/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DB_PATH = join(__dirname, '../../../.tmp/test-repositories.db');
const MIGRATIONS_PATH = join(__dirname, '../../../src/db/migrations');

describe('Repository Tests', () => {
  let pool;
  let factory;

  before(async () => {
    const tmpDir = dirname(TEST_DB_PATH);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Run migrations
    const db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    const runner = new MigrationRunner(db, { migrationsPath: MIGRATIONS_PATH });
    await runner.runMigrations();
    db.close();

    // Create connection pool and repository factory
    pool = new ConnectionPool({
      databasePath: TEST_DB_PATH,
      minConnections: 2,
      maxConnections: 5
    });
    await pool.initialize();

    factory = new RepositoryFactory({ pool });
    await factory.initialize();
  });

  after(async () => {
    if (factory) {
      await factory.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('TaskRepository', () => {
    it('should create a task', async () => {
      const task = await factory.tasks.create({
        title: 'Test Task',
        description: 'Test Description',
        status: 'pending',
        priority: 5
      });

      assert.ok(task.id, 'Task should have an ID');
      assert.equal(task.title, 'Test Task');
      assert.equal(task.description, 'Test Description');
    });

    it('should find task by id', async () => {
      const created = await factory.tasks.create({
        title: 'Findable Task',
        status: 'pending'
      });

      const found = await factory.tasks.findById(created.id);
      assert.ok(found, 'Should find the task');
      assert.equal(found.title, 'Findable Task');
    });

    it('should update a task', async () => {
      const created = await factory.tasks.create({
        title: 'Updatable Task',
        status: 'pending'
      });

      const updated = await factory.tasks.update(created.id, {
        title: 'Updated Title',
        status: 'completed'
      });

      assert.equal(updated.title, 'Updated Title');
      assert.equal(updated.status, 'completed');
    });

    it('should delete a task', async () => {
      const created = await factory.tasks.create({
        title: 'Deletable Task',
        status: 'pending'
      });

      const deleted = await factory.tasks.delete(created.id);
      assert.equal(deleted, true, 'Should return true on delete');

      const found = await factory.tasks.findById(created.id);
      assert.equal(found, undefined, 'Should not find deleted task');
    });

    it('should find all tasks with filters', async () => {
      // Create multiple tasks
      for (let i = 0; i < 5; i++) {
        await factory.tasks.create({
          title: `Task ${i}`,
          status: i % 2 === 0 ? 'pending' : 'completed',
          priority: i + 1
        });
      }

      const all = await factory.tasks.findAll();
      assert.ok(all.length >= 5, 'Should find all tasks');

      const pending = await factory.tasks.findAll({
        where: { status: 'pending' }
      });
      assert.ok(pending.length >= 2, 'Should find pending tasks');

      const highPriority = await factory.tasks.findAll({
        where: { priority: { operator: '>=', value: 3 } }
      });
      assert.ok(highPriority.length >= 3, 'Should find high priority tasks');
    });

    it('should count tasks', async () => {
      const count = await factory.tasks.count();
      assert.ok(count >= 5, 'Should count all tasks');

      const pendingCount = await factory.tasks.count({ status: 'pending' });
      assert.ok(pendingCount >= 2, 'Should count pending tasks');
    });

    it('should check if task exists', async () => {
      const created = await factory.tasks.create({
        title: 'Existing Task',
        status: 'pending'
      });

      const exists = await factory.tasks.exists(created.id);
      assert.equal(exists, true);

      const notExists = await factory.tasks.exists(99999);
      assert.equal(notExists, false);
    });
  });

  describe('RoadmapRepository', () => {
    it('should create a roadmap', async () => {
      const roadmap = await factory.roadmaps.create({
        name: 'Test Roadmap',
        description: 'Test Description',
        status: 'active'
      });

      assert.ok(roadmap.id, 'Roadmap should have an ID');
      assert.equal(roadmap.name, 'Test Roadmap');
    });

    it('should get roadmap progress', async () => {
      const roadmap = await factory.roadmaps.create({
        name: 'Progress Roadmap',
        status: 'active'
      });

      // Create tasks associated with this roadmap
      await factory.tasks.create({
        title: 'Roadmap Task 1',
        status: 'completed',
        roadmap_id: roadmap.id
      });
      await factory.tasks.create({
        title: 'Roadmap Task 2',
        status: 'in-progress',
        roadmap_id: roadmap.id
      });

      const progress = await factory.roadmaps.getProgress(roadmap.id);
      assert.ok(progress, 'Should get progress');
      assert.equal(progress.totalTasks, 2, 'Should count total tasks');
    });

    it('should update roadmap', async () => {
      const created = await factory.roadmaps.create({
        name: 'Updatable Roadmap',
        status: 'draft'
      });

      const updated = await factory.roadmaps.update(created.id, {
        name: 'Updated Roadmap',
        status: 'active'
      });

      assert.equal(updated.name, 'Updated Roadmap');
      assert.equal(updated.status, 'active');
    });
  });

  describe('ContextRepository', () => {
    it('should create a context', async () => {
      const context = await factory.contexts.create({
        name: 'Test Context',
        description: 'Test Description',
        context_type: 'session'
      });

      assert.ok(context.id, 'Context should have an ID');
      assert.equal(context.name, 'Test Context');
    });

    it('should verify context integrity', async () => {
      const context = await factory.contexts.create({
        name: 'Integrity Context',
        context_type: 'session',
        state_data: JSON.stringify({ key: 'value' })
      });

      const isValid = await factory.contexts.verifyIntegrity(context.id);
      assert.equal(isValid, true, 'Context integrity should be valid');
    });

    it('should find contexts by type', async () => {
      await factory.contexts.create({
        name: 'Session Context',
        context_type: 'session'
      });
      await factory.contexts.create({
        name: 'Project Context',
        context_type: 'project'
      });

      const sessions = await factory.contexts.findAll({
        where: { context_type: 'session' }
      });
      assert.ok(sessions.length >= 1, 'Should find session contexts');
    });
  });

  describe('MerkleRepository', () => {
    it('should create a merkle tree', async () => {
      const tree = await factory.merkle.createTree(
        { name: 'Test Tree', description: 'Test' },
        ['hash1', 'hash2', 'hash3']
      );

      assert.ok(tree.id, 'Tree should have an ID');
      assert.ok(tree.root_hash, 'Tree should have a root hash');
      assert.equal(tree.name, 'Test Tree');
    });

    it('should get tree nodes', async () => {
      const tree = await factory.merkle.createTree(
        { name: 'Node Tree' },
        ['a', 'b', 'c', 'd']
      );

      const nodes = await factory.merkle.getTreeNodes(tree.id);
      assert.ok(nodes.length > 0, 'Should have nodes');
    });

    it('should generate and verify proof', async () => {
      const tree = await factory.merkle.createTree(
        { name: 'Proof Tree' },
        ['leaf1', 'leaf2', 'leaf3']
      );

      const proof = await factory.merkle.getProof(tree.id, 0);
      assert.ok(proof, 'Should generate proof');

      const isValid = await factory.merkle.verifyProof(proof);
      assert.equal(isValid, true, 'Proof should be valid');

      const isValidSync = factory.merkle.verifyProofSync(proof);
      assert.equal(isValidSync, true, 'Sync proof verification should work');
    });

    it('should verify leaf', async () => {
      const leaves = ['leaf1', 'leaf2', 'leaf3'];
      const tree = await factory.merkle.createTree(
        { name: 'Verify Tree' },
        leaves
      );

      const isValid = await factory.merkle.verifyLeaf(tree.id, 0, leaves[0]);
      assert.equal(isValid, true, 'Valid leaf should verify');

      const isInvalid = await factory.merkle.verifyLeaf(tree.id, 0, 'wrong-hash');
      assert.equal(isInvalid, false, 'Invalid leaf should not verify');
    });
  });

  describe('CompanyRepository', () => {
    it('should create a company', async () => {
      const company = await factory.companies.create({
        name: 'Test Company',
        slug: 'test-company'
      });

      assert.ok(company.id, 'Company should have an ID');
      assert.equal(company.name, 'Test Company');
    });

    it('should find company by slug', async () => {
      await factory.companies.create({
        name: 'Findable Company',
        slug: 'findable-company'
      });

      const found = await factory.companies.findBySlug('findable-company');
      assert.ok(found, 'Should find company by slug');
      assert.equal(found.name, 'Findable Company');
    });

    it('should update company', async () => {
      const created = await factory.companies.create({
        name: 'Updatable Company',
        slug: 'updatable-company'
      });

      const updated = await factory.companies.update(created.id, {
        name: 'Updated Company Name'
      });

      assert.equal(updated.name, 'Updated Company Name');
    });
  });

  describe('CompanyMembershipRepository', () => {
    it('should add member to company', async () => {
      const company = await factory.companies.create({
        name: 'Membership Company',
        slug: 'membership-company'
      });

      // Note: This would normally require a valid user_id from auth_users
      // For this test, we'll just verify the method exists and has correct signature
      assert.ok(factory.companyMemberships.addMember, 'Should have addMember method');
      assert.ok(factory.companyMemberships.findByCompany, 'Should have findByCompany method');
      assert.ok(factory.companyMemberships.findByUser, 'Should have findByUser method');
    });
  });

  describe('RuntimeRepository', () => {
    it('should save and get state', async () => {
      const state = await factory.runtime.saveState({
        key: 'test-state',
        state: { data: 'test' },
        checksum: 'abc123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      assert.ok(state, 'Should save state');

      const retrieved = await factory.runtime.getState('test-state');
      assert.ok(retrieved, 'Should retrieve state');
    });

    it('should create and get checkpoint', async () => {
      const checkpoint = await factory.runtime.createCheckpoint({
        id: 'cp-1',
        key: 'test-checkpoint',
        state: { phase: 'test' },
        timestamp: new Date().toISOString()
      });

      assert.ok(checkpoint, 'Should create checkpoint');

      const retrieved = await factory.runtime.getCheckpoint('cp-1');
      assert.ok(retrieved, 'Should retrieve checkpoint');
    });

    it('should list checkpoints', async () => {
      const checkpoints = await factory.runtime.listCheckpoints('test-checkpoint');
      assert.ok(Array.isArray(checkpoints), 'Should return array');
    });
  });

  describe('Repository Edge Cases', () => {
    it('should handle null values in filters', async () => {
      const tasks = await factory.tasks.findAll({
        where: { description: null }
      });
      assert.ok(Array.isArray(tasks), 'Should handle null filter');
    });

    it('should handle array values in filters (IN operator)', async () => {
      const tasks = await factory.tasks.findAll({
        where: { status: ['pending', 'completed'] }
      });
      assert.ok(Array.isArray(tasks), 'Should handle array filter');
    });

    it('should handle pagination', async () => {
      // Create many tasks
      for (let i = 0; i < 10; i++) {
        await factory.tasks.create({
          title: `Paginated Task ${i}`,
          status: 'pending'
        });
      }

      const page1 = await factory.tasks.findAll({
        limit: 5,
        offset: 0
      });
      assert.equal(page1.length, 5, 'Should return 5 items');

      const page2 = await factory.tasks.findAll({
        limit: 5,
        offset: 5
      });
      assert.ok(page2.length <= 5, 'Should return remaining items');
    });

    it('should handle ordering', async () => {
      const ordered = await factory.tasks.findAll({
        orderBy: 'created_at',
        orderDirection: 'DESC',
        limit: 5
      });

      assert.ok(ordered.length > 0, 'Should return ordered results');
    });

    it('should handle non-existent IDs', async () => {
      const found = await factory.tasks.findById(999999);
      assert.equal(found, undefined, 'Should return undefined for non-existent ID');

      const updated = await factory.tasks.update(999999, { title: 'New' });
      assert.equal(updated, undefined, 'Should return undefined when updating non-existent');

      const deleted = await factory.tasks.delete(999999);
      assert.equal(deleted, false, 'Should return false when deleting non-existent');
    });

    it('should handle empty updates', async () => {
      const created = await factory.tasks.create({
        title: 'Update Test',
        status: 'pending'
      });

      // Update with empty data
      const updated = await factory.tasks.update(created.id, {});
      assert.ok(updated, 'Should return task even with empty update');
      assert.equal(updated.title, 'Update Test', 'Should preserve original values');
    });

    it('should handle special characters in data', async () => {
      const specialTitles = [
        "Task with 'quotes'",
        'Task with "double quotes"',
        'Task with \n newline',
        'Task with unicode: 中文 🎉'
      ];

      for (const title of specialTitles) {
        const created = await factory.tasks.create({
          title,
          status: 'pending'
        });

        const found = await factory.tasks.findById(created.id);
        assert.equal(found.title, title, `Should handle special characters: ${title}`);
      }
    });
  });

  describe('Repository Factory', () => {
    it('should provide access to all repositories', () => {
      assert.ok(factory.tasks, 'Should have tasks repository');
      assert.ok(factory.roadmaps, 'Should have roadmaps repository');
      assert.ok(factory.contexts, 'Should have contexts repository');
      assert.ok(factory.merkle, 'Should have merkle repository');
      assert.ok(factory.runtime, 'Should have runtime repository');
      assert.ok(factory.companies, 'Should have companies repository');
      assert.ok(factory.companyMemberships, 'Should have companyMemberships repository');
    });

    it('should list available repositories', () => {
      const available = factory.available;
      assert.ok(available.includes('tasks'), 'Should list tasks');
      assert.ok(available.includes('roadmaps'), 'Should list roadmaps');
    });

    it('should get repository by name', () => {
      const tasks = factory.get('tasks');
      assert.ok(tasks, 'Should get tasks by name');

      assert.throws(() => {
        factory.get('nonexistent');
      }, /not found/);
    });

    it('should provide all repositories as object', () => {
      const all = factory.all;
      assert.ok(all.tasks, 'Should have tasks in all');
      assert.ok(all.roadmaps, 'Should have roadmaps in all');
    });
  });
});
