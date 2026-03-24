import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { MigrationRunner } from '../../../src/db/migrations/index.js';
import { ConnectionPool } from '../../../src/db/connection/index.js';
import { TaskRepository } from '../../../src/db/repositories/tasks.js';
import { RoadmapRepository } from '../../../src/db/repositories/roadmaps.js';
import { ContextRepository } from '../../../src/db/repositories/contexts.js';
import { MerkleRepository } from '../../../src/db/repositories/merkle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DB_PATH = join(__dirname, '../../../.tmp/test-repository-contract.db');
const MIGRATIONS_PATH = join(__dirname, '../../../src/db/migrations');

describe('Repository contract alignment', () => {
  let pool;
  let tasks;
  let roadmaps;
  let contexts;
  let merkle;

  before(async () => {
    const tmpDir = dirname(TEST_DB_PATH);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    const db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');

    const runner = new MigrationRunner(db, { migrationsPath: MIGRATIONS_PATH });
    await runner.runMigrations();
    db.close();

    pool = new ConnectionPool({
      databasePath: TEST_DB_PATH,
      minConnections: 1,
      maxConnections: 3
    });
    await pool.initialize();

    tasks = new TaskRepository(pool);
    roadmaps = new RoadmapRepository(pool);
    contexts = new ContextRepository(pool);
    merkle = new MerkleRepository(pool);
  });

  after(async () => {
    if (pool) {
      await pool.close();
    }

    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it('adds the compatibility schema expected by repositories', () => {
    const db = new Database(TEST_DB_PATH, { readonly: true });

    const tasksColumns = db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name);
    const roadmapColumns = db.prepare('PRAGMA table_info(roadmaps)').all().map(column => column.name);
    const contextColumns = db.prepare('PRAGMA table_info(contexts)').all().map(column => column.name);
    const merkleColumns = db.prepare('PRAGMA table_info(merkle_trees)').all().map(column => column.name);
    const merkleNodesExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'merkle_nodes'")
      .get();

    for (const column of ['quadrant', 'due_date', 'roadmap_id', 'context_id', 'tags', 'estimated_minutes', 'actual_minutes']) {
      assert.ok(tasksColumns.includes(column), `tasks is missing ${column}`);
    }

    for (const column of ['name', 'parent_id', 'start_date', 'target_date', 'milestones']) {
      assert.ok(roadmapColumns.includes(column), `roadmaps is missing ${column}`);
    }

    for (const column of ['state_data', 'version', 'checksum', 'size_bytes', 'compressed', 'created_by', 'expires_at']) {
      assert.ok(contextColumns.includes(column), `contexts is missing ${column}`);
    }

    for (const column of ['name', 'context_id', 'description', 'updated_at']) {
      assert.ok(merkleColumns.includes(column), `merkle_trees is missing ${column}`);
    }

    assert.ok(merkleNodesExists, 'merkle_nodes table is missing');
    db.close();
  });

  it('persists aligned repository data without schema drift', async () => {
    const context = await contexts.create({
      name: 'Release Context',
      description: 'Session state for release recovery',
      context_type: 'session',
      state_data: JSON.stringify({ phase: 'contract-aligned', owner: 'codex' }),
      created_by: 'codex',
      expires_at: '2026-04-01T00:00:00.000Z'
    });

    assert.equal(await contexts.verifyIntegrity(context.id), true);

    const roadmap = await roadmaps.create({
      name: 'Release Recovery',
      description: 'Prepare repository for release',
      status: 'active',
      start_date: '2026-03-24T00:00:00.000Z',
      target_date: '2026-04-01T00:00:00.000Z'
    });

    const rawRoadmap = await pool.get(
      'SELECT title, name, start_date, started_at, target_date, target_at FROM roadmaps WHERE id = ?',
      [roadmap.id]
    );

    assert.equal(rawRoadmap.title, 'Release Recovery');
    assert.equal(rawRoadmap.name, 'Release Recovery');
    assert.equal(rawRoadmap.start_date, rawRoadmap.started_at);
    assert.equal(rawRoadmap.target_date, rawRoadmap.target_at);

    const task = await tasks.create({
      title: 'Ship release candidate',
      description: 'Close repository/schema contract drift',
      quadrant: 'urgent-important',
      status: 'in-progress',
      priority: 9,
      due_date: '2026-03-28T00:00:00.000Z',
      roadmap_id: roadmap.id,
      context_id: context.id,
      tags: JSON.stringify(['release', 'contract']),
      estimated_minutes: 180,
      actual_minutes: 45
    });

    assert.equal(task.status, 'in-progress');
    assert.equal(task.due_date, '2026-03-28T00:00:00.000Z');

    const rawTask = await pool.get(
      'SELECT status, due_date, deadline_at, roadmap_id, context_id FROM tasks WHERE id = ?',
      [task.id]
    );

    assert.equal(rawTask.status, 'running');
    assert.equal(rawTask.due_date, rawTask.deadline_at);
    assert.equal(rawTask.roadmap_id, roadmap.id);
    assert.equal(rawTask.context_id, context.id);

    const progress = await roadmaps.getProgress(roadmap.id);
    assert.equal(progress.totalTasks, 1);
    assert.equal(progress.inProgressTasks, 1);

    const leafHashes = ['alpha', 'beta'].map(value =>
      createHash('sha256').update(value).digest('hex')
    );

    const tree = await merkle.createTree(
      {
        name: 'Release Integrity Tree',
        context_id: context.id,
        description: 'Tracks release artifacts'
      },
      leafHashes
    );

    assert.equal(tree.name, 'Release Integrity Tree');
    assert.equal(tree.context_id, context.id);
    assert.ok(tree.root_hash);

    const proof = await merkle.getProof(tree.id, 0);
    assert.ok(proof, 'merkle proof was not generated');
    assert.equal(await merkle.verifyProof(proof), true);
    assert.equal(merkle.verifyProofSync(proof), true);

    const nodes = await merkle.getTreeNodes(tree.id);
    assert.ok(nodes.length >= 3, 'expected leaf and internal merkle nodes');
  });
});
