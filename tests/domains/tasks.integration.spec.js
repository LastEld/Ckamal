/**
 * @fileoverview Tasks Domain Integration Tests (TEST-001)
 * @module tests/domains/tasks.integration
 */

import { describe, it, before as beforeAll, after as afterAll, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TaskDomain } from '../../src/domains/tasks/index.js';
import { GSDSync, MockGSDAdapter } from '../../src/domains/tasks/gsd-sync.js';
import { FileStorage, InMemoryStorageBackend } from '../../src/domains/tasks/file-storage.js';
import { MarkdownSync } from '../../src/domains/tasks/markdown-sync.js';
import { TaskRepository } from '../../src/db/repositories/tasks.js';
import { ConnectionPool } from '../../src/db/connection/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test database path
const TEST_DB_PATH = join(__dirname, '../../.tmp/test-tasks.db');

function createThrownMatcher(expected) {
  if (expected instanceof RegExp || typeof expected === 'function') {
    return expected;
  }

  if (typeof expected === 'string') {
    return new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }

  return undefined;
}

function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toContain(expected) {
      if (typeof actual === 'string') {
        assert.ok(actual.includes(expected));
        return;
      }

      assert.ok(Array.isArray(actual) && actual.includes(expected));
    },
    toMatch(expected) {
      const matcher = expected instanceof RegExp
        ? expected
        : new RegExp(String(expected).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      assert.match(String(actual), matcher);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
    toBeNull() {
      assert.strictEqual(actual, null);
    },
    toThrow(expected) {
      assert.throws(actual, createThrownMatcher(expected));
    },
    toBeGreaterThan(expected) {
      assert.ok(actual > expected);
    },
    toBeGreaterThanOrEqual(expected) {
      assert.ok(actual >= expected);
    },
    toHaveProperty(expected) {
      assert.ok(actual !== null && actual !== undefined);
      assert.ok(expected in actual);
    },
    get not() {
      return {
        toBe(expected) {
          assert.notStrictEqual(actual, expected);
        },
        toContain(expected) {
          if (typeof actual === 'string') {
            assert.ok(!actual.includes(expected));
            return;
          }

          assert.ok(Array.isArray(actual) && !actual.includes(expected));
        }
      };
    },
    get rejects() {
      return {
        async toThrow(expected) {
          await assert.rejects(actual, createThrownMatcher(expected));
        }
      };
    }
  };
}

/**
 * Tasks Domain Integration Test Suite
 * Covers: CRUD, Eisenhower Matrix, GSD Sync, File Storage, Markdown Sync
 */
describe('Tasks Domain Integration', () => {
  let taskDomain;
  let taskRepository;
  let connectionPool;
  let gsdSync;
  let gsdAdapter;
  let fileStorage;
  let storageBackend;
  let markdownSync;
  let testTasks = [];

  // Setup test environment
  beforeAll(async () => {
    // Ensure test directory exists
    const testDir = dirname(TEST_DB_PATH);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Remove old test database if exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Initialize connection pool
    connectionPool = new ConnectionPool({
      databasePath: TEST_DB_PATH,
      minConnections: 1,
      maxConnections: 3
    });
    await connectionPool.initialize();

    // Create tasks table
    await connectionPool.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        quadrant TEXT DEFAULT 'not-urgent-not-important',
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 5,
        due_date TEXT,
        roadmap_id INTEGER,
        context_id INTEGER,
        tags TEXT,
        estimated_minutes INTEGER,
        actual_minutes INTEGER,
        completed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize repository and domain
    taskRepository = new TaskRepository(connectionPool);
    taskDomain = new TaskDomain();

    // Initialize GSD sync with mock adapter
    gsdAdapter = new MockGSDAdapter();
    gsdSync = new GSDSync(gsdAdapter);

    // Initialize file storage with in-memory backend
    storageBackend = new InMemoryStorageBackend();
    fileStorage = new FileStorage(storageBackend, {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['text/plain', 'application/json', 'image/png', 'image/jpeg']
    });

    // Initialize markdown sync
    markdownSync = new MarkdownSync();
  });

  // Cleanup after all tests
  afterAll(async () => {
    if (connectionPool) {
      await connectionPool.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  // Reset state before each test
  beforeEach(() => {
    testTasks = [];
    taskDomain = new TaskDomain();
    gsdAdapter = new MockGSDAdapter();
    gsdSync = new GSDSync(gsdAdapter);
    storageBackend = new InMemoryStorageBackend();
    fileStorage = new FileStorage(storageBackend, {
      maxFileSize: 10 * 1024 * 1024,
      allowedMimeTypes: ['text/plain', 'application/json', 'image/png', 'image/jpeg']
    });
    markdownSync = new MarkdownSync();
  });

  /**
   * ============================================
   * CRUD Operations Tests
   * ============================================
   */
  describe('CRUD Operations', () => {
    describe('createTask', () => {
      it('should create a task with minimal data', () => {
        const task = taskDomain.createTask({
          title: 'Test Task'
        });

        expect(task).toBeDefined();
        expect(task.id).toMatch(/^task_\d+_[a-z0-9]+$/);
        expect(task.title).toBe('Test Task');
        expect(task.status).toBe('backlog');
        expect(task.priority).toBe('medium');
        expect(task.quadrant).toBe('not-urgent-not-important');
        expect(task.createdAt).toBeDefined();
        expect(task.updatedAt).toBeDefined();
        testTasks.push(task);
      });

      it('should create a task with all fields', () => {
        const task = taskDomain.createTask({
          title: 'Complete Task',
          description: 'Full description',
          status: 'in_progress',
          priority: 'high',
          urgent: true,
          important: true,
          tags: ['test', 'integration'],
          dueDate: '2026-12-31',
          estimatedMinutes: 120,
          createdBy: 'test-user',
          assignees: ['user-1', 'user-2']
        });

        expect(task.title).toBe('Complete Task');
        expect(task.description).toBe('Full description');
        expect(task.status).toBe('in_progress');
        expect(task.priority).toBe('high');
        expect(task.urgent).toBe(true);
        expect(task.important).toBe(true);
        expect(task.quadrant).toBe('urgent-important');
        expect(task.tags).toEqual(['test', 'integration']);
        expect(task.dueDate).toBe('2026-12-31');
        expect(task.estimatedMinutes).toBe(120);
        expect(task.createdBy).toBe('test-user');
        expect(task.assignees).toEqual(['user-1', 'user-2']);
        testTasks.push(task);
      });

      it('should throw error when title is missing', () => {
        expect(() => taskDomain.createTask({})).toThrow('Task title is required');
        expect(() => taskDomain.createTask({ title: '' })).toThrow('Task title is required');
      });

      it('should create subtask with parent relationship', () => {
        const parent = taskDomain.createTask({ title: 'Parent Task' });
        const child = taskDomain.createTask({
          title: 'Child Task',
          parentTaskId: parent.id
        });

        expect(child.parentTaskId).toBe(parent.id);
        
        const updatedParent = taskDomain.getTask(parent.id);
        expect(updatedParent.subtasks).toContain(child.id);
        testTasks.push(parent, child);
      });

      it('should correctly calculate all quadrants', () => {
        const q1 = taskDomain.createTask({ title: 'Q1', urgent: true, important: true });
        const q2 = taskDomain.createTask({ title: 'Q2', urgent: false, important: true });
        const q3 = taskDomain.createTask({ title: 'Q3', urgent: true, important: false });
        const q4 = taskDomain.createTask({ title: 'Q4', urgent: false, important: false });

        expect(q1.quadrant).toBe('urgent-important');
        expect(q2.quadrant).toBe('not-urgent-important');
        expect(q3.quadrant).toBe('urgent-not-important');
        expect(q4.quadrant).toBe('not-urgent-not-important');
        testTasks.push(q1, q2, q3, q4);
      });
    });

    describe('getTask', () => {
      it('should retrieve a task by ID', () => {
        const created = taskDomain.createTask({ title: 'Get Task Test' });
        const retrieved = taskDomain.getTask(created.id);

        expect(retrieved).toEqual(created);
        testTasks.push(created);
      });

      it('should return undefined for non-existent task', () => {
        const result = taskDomain.getTask('non-existent-id');
        expect(result).toBeUndefined();
      });

      it('should return undefined for invalid ID', () => {
        expect(taskDomain.getTask(null)).toBeUndefined();
        expect(taskDomain.getTask(undefined)).toBeUndefined();
        expect(taskDomain.getTask(123)).toBeUndefined();
      });
    });

    describe('updateTask', () => {
      it('should update task properties', () => {
        const task = taskDomain.createTask({
          title: 'Original Title',
          status: 'backlog'
        });

        const updated = taskDomain.updateTask(task.id, {
          title: 'Updated Title',
          status: 'in_progress',
          priority: 'high'
        });

        expect(updated.title).toBe('Updated Title');
        expect(updated.status).toBe('in_progress');
        expect(updated.priority).toBe('high');
        expect(updated.updatedAt).not.toBe(task.createdAt);
        testTasks.push(task);
      });

      it('should recalculate quadrant when urgent/important changes', () => {
        const task = taskDomain.createTask({
          title: 'Quadrant Test',
          urgent: false,
          important: false
        });
        expect(task.quadrant).toBe('not-urgent-not-important');

        const updated = taskDomain.updateTask(task.id, {
          urgent: true,
          important: true
        });

        expect(updated.quadrant).toBe('urgent-important');
        testTasks.push(task);
      });

      it('should throw error for non-existent task', () => {
        expect(() => {
          taskDomain.updateTask('non-existent', { title: 'New' });
        }).toThrow('Task not found: non-existent');
      });

      it('should only update allowed fields', () => {
        const task = taskDomain.createTask({ title: 'Allowed Fields' });
        const originalId = task.id;
        const originalCreatedAt = task.createdAt;

        const updated = taskDomain.updateTask(task.id, {
          title: 'New Title',
          id: 'new-id',
          createdAt: '2020-01-01',
          customField: 'value'
        });

        expect(updated.id).toBe(originalId);
        expect(updated.createdAt).toBe(originalCreatedAt);
        expect(updated.customField).toBeUndefined();
        expect(updated.title).toBe('New Title');
        testTasks.push(task);
      });
    });

    describe('deleteTask', () => {
      it('should delete a task', () => {
        const task = taskDomain.createTask({ title: 'To Delete' });
        const deleted = taskDomain.deleteTask(task.id);

        expect(deleted).toBe(true);
        expect(taskDomain.getTask(task.id)).toBeUndefined();
      });

      it('should return false for non-existent task', () => {
        const result = taskDomain.deleteTask('non-existent');
        expect(result).toBe(false);
      });

      it('should delete subtasks when parent is deleted', () => {
        const parent = taskDomain.createTask({ title: 'Parent' });
        const child1 = taskDomain.createTask({ title: 'Child 1', parentTaskId: parent.id });
        const child2 = taskDomain.createTask({ title: 'Child 2', parentTaskId: parent.id });

        taskDomain.deleteTask(parent.id);

        expect(taskDomain.getTask(parent.id)).toBeUndefined();
        expect(taskDomain.getTask(child1.id)).toBeUndefined();
        expect(taskDomain.getTask(child2.id)).toBeUndefined();
      });

      it('should remove child reference from parent when subtask deleted', () => {
        const parent = taskDomain.createTask({ title: 'Parent' });
        const child = taskDomain.createTask({ title: 'Child', parentTaskId: parent.id });

        taskDomain.deleteTask(child.id);

        const updatedParent = taskDomain.getTask(parent.id);
        expect(updatedParent.subtasks).not.toContain(child.id);
        testTasks.push(parent);
      });
    });

    describe('listTasks', () => {
      beforeEach(() => {
        // Create test tasks for listing
        taskDomain.createTask({ title: 'Task 1', status: 'backlog', priority: 'high', tags: ['tag1'] });
        taskDomain.createTask({ title: 'Task 2', status: 'in_progress', priority: 'medium', tags: ['tag1', 'tag2'] });
        taskDomain.createTask({ title: 'Task 3', status: 'done', priority: 'low', tags: ['tag2'] });
        taskDomain.createTask({ 
          title: 'Task 4', 
          status: 'backlog', 
          priority: 'high',
          assignees: ['user-1'],
          urgent: true,
          important: true
        });
      });

      it('should list all tasks without filters', () => {
        const tasks = taskDomain.listTasks();
        expect(tasks.length).toBeGreaterThanOrEqual(4);
      });

      it('should filter by status', () => {
        const backlogTasks = taskDomain.listTasks({ status: 'backlog' });
        expect(backlogTasks.every(t => t.status === 'backlog')).toBe(true);
      });

      it('should filter by priority', () => {
        const highPriority = taskDomain.listTasks({ priority: 'high' });
        expect(highPriority.every(t => t.priority === 'high')).toBe(true);
      });

      it('should filter by quadrant', () => {
        const urgentImportant = taskDomain.listTasks({ quadrant: 'urgent-important' });
        expect(urgentImportant.every(t => t.quadrant === 'urgent-important')).toBe(true);
      });

      it('should filter by assignee', () => {
        const user1Tasks = taskDomain.listTasks({ assignee: 'user-1' });
        expect(user1Tasks.every(t => t.assignees.includes('user-1'))).toBe(true);
      });

      it('should filter by tags (all must match)', () => {
        const tagTasks = taskDomain.listTasks({ tags: ['tag1', 'tag2'] });
        expect(tagTasks.every(t => 
          t.tags.includes('tag1') && t.tags.includes('tag2')
        )).toBe(true);
      });
    });
  });

  /**
   * ============================================
   * Eisenhower Matrix Tests
   * ============================================
   */
  describe('Eisenhower Matrix', () => {
    beforeEach(() => {
      // Create tasks in all quadrants
      taskDomain.createTask({ title: 'Q1 Task 1', urgent: true, important: true, status: 'in_progress' });
      taskDomain.createTask({ title: 'Q1 Task 2', urgent: true, important: true, status: 'backlog' });
      taskDomain.createTask({ title: 'Q2 Task 1', urgent: false, important: true, status: 'backlog' });
      taskDomain.createTask({ title: 'Q3 Task 1', urgent: true, important: false, status: 'in_progress' });
      taskDomain.createTask({ title: 'Q4 Task 1', urgent: false, important: false, status: 'backlog' });
    });

    describe('organizeByMatrix', () => {
      it('should organize all tasks by quadrant', () => {
        const matrix = taskDomain.organizeByMatrix();

        expect(matrix).toHaveProperty('urgentImportant');
        expect(matrix).toHaveProperty('notUrgentImportant');
        expect(matrix).toHaveProperty('urgentNotImportant');
        expect(matrix).toHaveProperty('notUrgentNotImportant');

        expect(matrix.urgentImportant.length).toBe(2);
        expect(matrix.notUrgentImportant.length).toBe(1);
        expect(matrix.urgentNotImportant.length).toBe(1);
        expect(matrix.notUrgentNotImportant.length).toBe(1);
      });

      it('should filter by assignee', () => {
        const task = taskDomain.createTask({
          title: 'Assigned Task',
          urgent: true,
          important: true,
          assignees: ['test-user']
        });

        const matrix = taskDomain.organizeByMatrix({ assignee: 'test-user' });
        expect(matrix.urgentImportant.length).toBe(1);
        expect(matrix.urgentImportant[0].id).toBe(task.id);
      });

      it('should filter by status', () => {
        const matrix = taskDomain.organizeByMatrix({ status: 'in_progress' });
        
        expect(matrix.urgentImportant.length).toBe(1);
        expect(matrix.urgentNotImportant.length).toBe(1);
        expect(matrix.notUrgentImportant.length).toBe(0);
        expect(matrix.notUrgentNotImportant.length).toBe(0);
      });

      it('should return empty arrays when no tasks match', () => {
        const matrix = taskDomain.organizeByMatrix({ assignee: 'non-existent' });
        
        expect(matrix.urgentImportant).toEqual([]);
        expect(matrix.notUrgentImportant).toEqual([]);
        expect(matrix.urgentNotImportant).toEqual([]);
        expect(matrix.notUrgentNotImportant).toEqual([]);
      });
    });

    describe('Repository Eisenhower Methods', () => {
      it('should get matrix from repository', async () => {
        // Create tasks in DB
        await taskRepository.create({
          title: 'DB Q1 Task',
          quadrant: 'urgent-important',
          status: 'pending',
          priority: 10
        });
        await taskRepository.create({
          title: 'DB Q2 Task',
          quadrant: 'not-urgent-important',
          status: 'pending',
          priority: 8
        });

        const matrix = await taskRepository.getEisenhowerMatrix();
        
        expect(matrix.urgentImportant.length).toBeGreaterThanOrEqual(1);
        expect(matrix.notUrgentImportant.length).toBeGreaterThanOrEqual(1);
      });

      it('should get tasks by quadrant from repository', async () => {
        await taskRepository.create({
          title: 'Quadrant Task',
          quadrant: 'urgent-important',
          status: 'pending'
        });

        const tasks = await taskRepository.findByQuadrant('urgent-important');
        expect(tasks.every(t => t.quadrant === 'urgent-important')).toBe(true);
      });

      it('should move task to different quadrant', async () => {
        const task = await taskRepository.create({
          title: 'Moveable Task',
          quadrant: 'not-urgent-not-important',
          status: 'pending'
        });

        const moved = await taskRepository.moveToQuadrant(task.id, 'urgent-important');
        expect(moved.quadrant).toBe('urgent-important');
      });

      it('should throw error for invalid quadrant', async () => {
        const task = await taskRepository.create({
          title: 'Test Task',
          quadrant: 'urgent-important',
          status: 'pending'
        });

        await expect(taskRepository.moveToQuadrant(task.id, 'invalid-quadrant'))
          .rejects.toThrow('Invalid quadrant: invalid-quadrant');
      });
    });
  });

  /**
   * ============================================
   * GSD Sync Integration Tests
   * ============================================
   */
  describe('GSD Sync Integration', () => {
    beforeEach(() => {
      // Setup mock GSD tasks
      gsdAdapter.addMockTask({
        id: 'gsd-1',
        title: 'GSD Task 1',
        description: 'From GSD',
        status: 'next',
        modifiedAt: new Date().toISOString()
      });
      gsdAdapter.addMockTask({
        id: 'gsd-2',
        title: 'GSD Task 2',
        status: 'done',
        modifiedAt: new Date().toISOString()
      });
    });

    describe('syncWithGSD', () => {
      it('should sync local tasks to GSD', async () => {
        const localTasks = [
          {
            id: 'local-1',
            title: 'Local Task 1',
            status: 'backlog',
            priority: 'high',
            tags: ['project:test'],
            updatedAt: new Date().toISOString()
          }
        ];

        const result = await gsdSync.sync({ localTasks });

        expect(result.exported).toBeGreaterThanOrEqual(1);
        expect(result.errors).toEqual([]);
        expect(result.syncedAt).toBeDefined();
      });

      it('should import tasks from GSD', async () => {
        const imported = await gsdSync.importFromGSD();

        expect(imported.length).toBe(2);
        expect(imported[0]).toHaveProperty('externalId');
        expect(imported[0]).toHaveProperty('title');
        expect(imported[0]).toHaveProperty('status');
      });

      it('should export tasks to GSD', async () => {
        const tasks = [
          {
            id: 'export-1',
            title: 'Export Task',
            status: 'in_progress',
            priority: 'medium',
            tags: ['context:work'],
            dueDate: '2026-12-31',
            estimatedMinutes: 60
          }
        ];

        const exported = await gsdSync.exportToGSD(tasks);

        expect(exported.length).toBe(1);
        expect(exported[0].title).toBe('Export Task');
      });

      it('should handle bidirectional sync', async () => {
        const localTasks = [
          {
            id: 'bi-1',
            title: 'Bidirectional Task',
            status: 'backlog',
            priority: 'high',
            updatedAt: new Date(Date.now() - 1000).toISOString()
          }
        ];

        const result = await gsdSync.sync({ localTasks });

        expect(result.imported).toBeGreaterThanOrEqual(0);
        expect(result.exported).toBeGreaterThanOrEqual(0);
        expect(result.syncedAt).toBeDefined();
      });

      it('should track ID mapping after sync', async () => {
        const localTasks = [
          {
            id: 'map-1',
            title: 'Mapping Task',
            status: 'backlog',
            updatedAt: new Date().toISOString()
          }
        ];

        await gsdSync.sync({ localTasks });
        const mapping = gsdSync.getIdMapping();

        expect(Object.keys(mapping).length).toBeGreaterThanOrEqual(1);
        expect(mapping['map-1']).toBeDefined();
      });
    });

    describe('getGSDStatus', () => {
      it('should return last sync timestamp', async () => {
        const beforeSync = gsdSync.getLastSync();
        expect(beforeSync).toBeNull();

        await gsdSync.sync({ localTasks: [] });
        
        const afterSync = gsdSync.getLastSync();
        expect(afterSync).toBeDefined();
        expect(new Date(afterSync).getTime()).toBeGreaterThan(0);
      });

      it('should return ID mapping', async () => {
        const tasks = [
          {
            id: 'status-1',
            title: 'Status Test',
            status: 'backlog',
            updatedAt: new Date().toISOString()
          }
        ];

        await gsdSync.sync({ localTasks: tasks });
        
        const mapping = gsdSync.getIdMapping();
        expect(typeof mapping).toBe('object');
      });
    });

    describe('status mapping', () => {
      it('should map GSD status to internal status correctly', async () => {
        const gsdTasks = [
          { id: 'map-inbox', title: 'Inbox', status: 'inbox', modifiedAt: new Date().toISOString() },
          { id: 'map-next', title: 'Next', status: 'next', modifiedAt: new Date().toISOString() },
          { id: 'map-waiting', title: 'Waiting', status: 'waiting', modifiedAt: new Date().toISOString() },
          { id: 'map-scheduled', title: 'Scheduled', status: 'scheduled', modifiedAt: new Date().toISOString() },
          { id: 'map-someday', title: 'Someday', status: 'someday', modifiedAt: new Date().toISOString() },
          { id: 'map-done', title: 'Done', status: 'done', modifiedAt: new Date().toISOString() }
        ];

        gsdAdapter.clear();
        gsdTasks.forEach(t => gsdAdapter.addMockTask(t));

        const imported = await gsdSync.importFromGSD();

        const statusMap = {
          'Inbox': 'backlog',
          'Next': 'todo',
          'Waiting': 'in_progress',
          'Scheduled': 'todo',
          'Someday': 'backlog',
          'Done': 'done'
        };

        imported.forEach(task => {
          const original = gsdTasks.find(t => t.id === task.externalId);
          expect(task.status).toBe(statusMap[original.title]);
        });
      });
    });
  });

  /**
   * ============================================
   * File Storage Tests
   * ============================================
   */
  describe('File Storage', () => {
    describe('attachFile', () => {
      it('should upload file attachment', async () => {
        const task = taskDomain.createTask({ title: 'File Test' });
        const buffer = Buffer.from('Test file content');

        const fileMeta = await fileStorage.upload({
          taskId: task.id,
          filename: 'test.txt',
          mimeType: 'text/plain',
          buffer: buffer,
          uploadedBy: 'test-user'
        });

        expect(fileMeta).toBeDefined();
        expect(fileMeta.id).toMatch(/^file_\d+_[a-z0-9]+$/);
        expect(fileMeta.originalName).toBe('test.txt');
        expect(fileMeta.mimeType).toBe('text/plain');
        expect(fileMeta.size).toBe(buffer.length);
        expect(fileMeta.hash).toBeDefined();
        expect(fileMeta.taskId).toBe(task.id);
        expect(fileMeta.uploadedBy).toBe('test-user');
        testTasks.push(task);
      });

      it('should add attachment reference to task', async () => {
        const task = taskDomain.createTask({ title: 'Attachment Test' });
        const buffer = Buffer.from('Attachment content');

        const fileMeta = await fileStorage.upload({
          taskId: task.id,
          filename: 'attach.txt',
          mimeType: 'text/plain',
          buffer,
          uploadedBy: 'user-1'
        });

        const updatedTask = taskDomain.addAttachment(task.id, fileMeta.id);
        
        expect(updatedTask.attachments).toContain(fileMeta.id);
        testTasks.push(task);
      });

      it('should reject oversized files', async () => {
        const largeBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
        
        await expect(fileStorage.upload({
          taskId: 'task-123',
          filename: 'large.bin',
          mimeType: 'application/octet-stream',
          buffer: largeBuffer,
          uploadedBy: 'test-user'
        })).rejects.toThrow('exceeds maximum allowed');
      });

      it('should reject invalid MIME types', async () => {
        const buffer = Buffer.from('Content');
        
        await expect(fileStorage.upload({
          taskId: 'task-123',
          filename: 'file.exe',
          mimeType: 'application/x-executable',
          buffer,
          uploadedBy: 'test-user'
        })).rejects.toThrow('MIME type application/x-executable is not allowed');
      });

      it('should require all upload parameters', async () => {
        await expect(fileStorage.upload({})).rejects.toThrow('Missing required upload parameters');
      });
    });

    describe('detachFile', () => {
      it('should remove attachment from task', async () => {
        const task = taskDomain.createTask({ title: 'Detach Test' });
        const buffer = Buffer.from('Content');

        const fileMeta = await fileStorage.upload({
          taskId: task.id,
          filename: 'detach.txt',
          mimeType: 'text/plain',
          buffer,
          uploadedBy: 'user-1'
        });

        taskDomain.addAttachment(task.id, fileMeta.id);
        const updated = taskDomain.removeAttachment(task.id, fileMeta.id);

        expect(updated.attachments).not.toContain(fileMeta.id);
        testTasks.push(task);
      });

      it('should delete file from storage', async () => {
        const buffer = Buffer.from('Deletable content');

        const fileMeta = await fileStorage.upload({
          taskId: 'task-123',
          filename: 'delete.txt',
          mimeType: 'text/plain',
          buffer,
          uploadedBy: 'user-1'
        });

        const deleted = await fileStorage.delete(fileMeta.id);
        expect(deleted).toBe(true);

        const exists = await fileStorage.exists(fileMeta.id);
        expect(exists).toBe(false);
      });

      it('should return false when deleting non-existent file', async () => {
        const result = await fileStorage.delete('non-existent-file');
        expect(result).toBe(false);
      });
    });

    describe('file operations', () => {
      it('should download file with integrity check', async () => {
        const originalContent = 'Downloadable content';
        const buffer = Buffer.from(originalContent);

        const fileMeta = await fileStorage.upload({
          taskId: 'task-123',
          filename: 'download.txt',
          mimeType: 'text/plain',
          buffer,
          uploadedBy: 'user-1'
        });

        const downloaded = await fileStorage.download(fileMeta.id);

        expect(downloaded.metadata.id).toBe(fileMeta.id);
        expect(downloaded.buffer.toString()).toBe(originalContent);
      });

      it('should list files by task', async () => {
        const taskId = 'task-multi';
        
        await fileStorage.upload({
          taskId,
          filename: 'file1.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Content 1'),
          uploadedBy: 'user-1'
        });
        
        await fileStorage.upload({
          taskId,
          filename: 'file2.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Content 2'),
          uploadedBy: 'user-1'
        });

        const files = fileStorage.listByTask(taskId);
        expect(files.length).toBe(2);
      });

      it('should calculate storage size for task', async () => {
        const taskId = 'task-size';
        const content1 = 'a'.repeat(100);
        const content2 = 'b'.repeat(200);

        await fileStorage.upload({
          taskId,
          filename: 'size1.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(content1),
          uploadedBy: 'user-1'
        });

        await fileStorage.upload({
          taskId,
          filename: 'size2.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(content2),
          uploadedBy: 'user-1'
        });

        const totalSize = fileStorage.getTaskStorageSize(taskId);
        expect(totalSize).toBe(300);
      });

      it('should copy file to another task', async () => {
        const fileMeta = await fileStorage.upload({
          taskId: 'source-task',
          filename: 'copy.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Copy me'),
          uploadedBy: 'user-1'
        });

        const copied = await fileStorage.copyToTask(fileMeta.id, 'target-task', 'user-2');

        expect(copied.id).not.toBe(fileMeta.id);
        expect(copied.taskId).toBe('target-task');
        expect(copied.uploadedBy).toBe('user-2');
        expect(copied.metadata.copiedFrom).toBe(fileMeta.id);
      });
    });
  });

  /**
   * ============================================
   * Markdown Sync Tests
   * ============================================
   */
  describe('Markdown Sync', () => {
    describe('exportToMarkdown', () => {
      it('should export tasks to markdown format', () => {
        const tasks = [
          {
            title: 'Task One',
            status: 'backlog',
            priority: 'high',
            tags: ['important', 'work'],
            dueDate: '2026-12-31',
            estimatedMinutes: 60,
            urgent: true,
            important: true
          },
          {
            title: 'Task Two',
            status: 'done',
            priority: 'medium',
            tags: ['personal']
          }
        ];

        const markdown = markdownSync.exportToMarkdown(tasks);

        expect(markdown).toContain('# Tasks');
        expect(markdown).toContain('- [ ] [!!] Task One #important #work @due(2026-12-31) @est(60m) @urgent @important');
        expect(markdown).toContain('- [x] [!] Task Two #personal');
      });

      it('should include YAML frontmatter by default', () => {
        const tasks = [{ title: 'Single', status: 'backlog' }];
        const markdown = markdownSync.exportToMarkdown(tasks);

        expect(markdown).toContain('---');
        expect(markdown).toContain('title: Tasks');
        expect(markdown).toContain('count: 1');
      });

      it('should group by quadrant when requested', () => {
        const tasks = [
          { title: 'Q1', status: 'backlog', urgent: true, important: true },
          { title: 'Q2', status: 'backlog', urgent: false, important: true },
          { title: 'Q3', status: 'backlog', urgent: true, important: false }
        ];

        const markdown = markdownSync.exportToMarkdown(tasks, { groupByQuadrant: true });

        expect(markdown).toContain('## 🔥 Do First');
        expect(markdown).toContain('## 📅 Schedule');
        expect(markdown).toContain('## ↗️ Delegate');
      });

      it('should group by status when requested', () => {
        const tasks = [
          { title: 'Backlog Task', status: 'backlog' },
          { title: 'In Progress Task', status: 'in_progress' },
          { title: 'Done Task', status: 'done' }
        ];

        const markdown = markdownSync.exportToMarkdown(tasks, { groupByStatus: true });

        expect(markdown).toContain('## BACKLOG');
        expect(markdown).toContain('## IN PROGRESS');
        expect(markdown).toContain('## DONE');
      });

      it('should use custom title when provided', () => {
        const tasks = [{ title: 'Task', status: 'backlog' }];
        const markdown = markdownSync.exportToMarkdown(tasks, { title: 'My Tasks' });

        expect(markdown).toContain('# My Tasks');
        expect(markdown).toContain('title: My Tasks');
      });
    });

    describe('importFromMarkdown', () => {
      it('should parse tasks from markdown', () => {
        const markdown = `
- [ ] Task One
- [x] Task Two
- [-] Task Three
        `;

        const result = markdownSync.importFromMarkdown(markdown);

        expect(result.tasks.length).toBe(3);
        expect(result.tasks[0].title).toBe('Task One');
        expect(result.tasks[0].status).toBe('backlog');
        expect(result.tasks[1].status).toBe('done');
        expect(result.tasks[2].status).toBe('in_progress');
      });

      it('should parse priority markers', () => {
        const markdown = `
- [ ] [!!!] Critical Task
- [ ] [!!] High Task
- [ ] [!] Medium Task
- [ ] Low Task
        `;

        const result = markdownSync.importFromMarkdown(markdown);

        expect(result.tasks[0].priority).toBe('critical');
        expect(result.tasks[1].priority).toBe('high');
        expect(result.tasks[2].priority).toBe('medium');
        expect(result.tasks[3].priority).toBe('medium'); // default
      });

      it('should parse tags', () => {
        const markdown = `- [ ] Task with #tag1 and #tag-2 #important`;

        const result = markdownSync.importFromMarkdown(markdown);

        expect(result.tasks[0].tags).toEqual(['tag1', 'tag-2', 'important']);
        expect(result.tasks[0].title).toBe('Task with and');
      });

      it('should parse due dates', () => {
        const markdown = `- [ ] Task @due(2026-12-25)`;

        const result = markdownSync.importFromMarkdown(markdown);

        expect(result.tasks[0].dueDate).toBe('2026-12-25');
        expect(result.tasks[0].title).toBe('Task');
      });

      it('should parse time estimates', () => {
        const markdown = `- [ ] Task @est(90m)`;

        const result = markdownSync.importFromMarkdown(markdown);

        expect(result.tasks[0].estimatedMinutes).toBe(90);
      });

      it('should parse Eisenhower markers', () => {
        const markdown = `- [ ] Task @urgent @important`;

        const result = markdownSync.importFromMarkdown(markdown);

        expect(result.tasks[0].urgent).toBe(true);
        expect(result.tasks[0].important).toBe(true);
      });

      it('should parse task descriptions/body', () => {
        const markdown = `
- [ ] Main Task
  This is a description
  With multiple lines

- [ ] Next Task
        `;

        const result = markdownSync.importFromMarkdown(markdown);

        expect(result.tasks[0].body).toContain('This is a description');
        expect(result.tasks[0].body).toContain('With multiple lines');
      });

      it('should skip frontmatter', () => {
        const markdown = `---
title: Test Tasks
count: 2
---

- [ ] Task One
- [ ] Task Two`;

        const result = markdownSync.importFromMarkdown(markdown);

        expect(result.tasks.length).toBe(2);
        expect(result.lineCount).toBe(7);
      });

      it('should use default priority from options', () => {
        const markdown = `- [ ] Plain Task`;

        const result = markdownSync.importFromMarkdown(markdown, { defaultPriority: 'low' });

        expect(result.tasks[0].priority).toBe('low');
      });

      it('should handle complex task with all features', () => {
        const markdown = `- [ ] [!!] Complex Task #work #urgent @due(2026-06-15) @est(120m) @urgent @important`;

        const result = markdownSync.importFromMarkdown(markdown);
        const task = result.tasks[0];

        expect(task.title).toBe('Complex Task');
        expect(task.priority).toBe('high');
        expect(task.tags).toEqual(['work', 'urgent']);
        expect(task.dueDate).toBe('2026-06-15');
        expect(task.estimatedMinutes).toBe(120);
        expect(task.urgent).toBe(true);
        expect(task.important).toBe(true);
      });
    });

    describe('roundtrip conversion', () => {
      it('should preserve task data through export and import', () => {
        const originalTasks = [
          {
            title: 'Roundtrip Task',
            status: 'in_progress',
            priority: 'high',
            tags: ['test', 'integration'],
            dueDate: '2026-12-31',
            estimatedMinutes: 90,
            urgent: true,
            important: false
          }
        ];

        const markdown = markdownSync.exportToMarkdown(originalTasks);
        const result = markdownSync.importFromMarkdown(markdown);

        expect(result.tasks.length).toBe(1);
        expect(result.tasks[0].title).toBe(originalTasks[0].title);
        expect(result.tasks[0].status).toBe(originalTasks[0].status);
        expect(result.tasks[0].priority).toBe(originalTasks[0].priority);
        expect(result.tasks[0].dueDate).toBe(originalTasks[0].dueDate);
        expect(result.tasks[0].estimatedMinutes).toBe(originalTasks[0].estimatedMinutes);
        expect(result.tasks[0].urgent).toBe(originalTasks[0].urgent);
        expect(result.tasks[0].important).toBe(originalTasks[0].important);
      });
    });
  });

  /**
   * ============================================
   * Integration Flow Tests
   * ============================================
   */
  describe('Integration Flows', () => {
    it('should complete full task lifecycle with attachments and sync', async () => {
      // 1. Create task
      const task = taskDomain.createTask({
        title: 'Integration Task',
        priority: 'high',
        urgent: true,
        important: true,
        tags: ['integration', 'test']
      });

      // 2. Add attachment
      const buffer = Buffer.from('Test attachment content');
      const fileMeta = await fileStorage.upload({
        taskId: task.id,
        filename: 'attachment.txt',
        mimeType: 'text/plain',
        buffer,
        uploadedBy: 'test-user'
      });
      taskDomain.addAttachment(task.id, fileMeta.id);

      // 3. Update task status
      taskDomain.updateTask(task.id, { status: 'in_progress' });

      // 4. Export to markdown
      const tasks = taskDomain.listTasks({ status: 'in_progress' });
      const markdown = markdownSync.exportToMarkdown(tasks);
      expect(markdown).toContain(task.title);

      // 5. Sync with GSD
      const syncResult = await gsdSync.sync({
        localTasks: [taskDomain.getTask(task.id)]
      });
      expect(syncResult.exported).toBeGreaterThanOrEqual(1);

      // 6. Verify task in matrix
      const matrix = taskDomain.organizeByMatrix();
      expect(matrix.urgentImportant.some(t => t.id === task.id)).toBe(true);

      // Cleanup
      await fileStorage.delete(fileMeta.id);
      taskDomain.deleteTask(task.id);
    });

    it('should handle task with all features correctly', async () => {
      // Create complex task
      const task = taskDomain.createTask({
        title: 'Complex Integration Task',
        description: 'A complex task for testing',
        priority: 'critical',
        urgent: true,
        important: true,
        dueDate: new Date().toISOString().split('T')[0],
        estimatedMinutes: 180,
        createdBy: 'test-user',
        assignees: ['user-1', 'user-2'],
        tags: ['complex', 'integration', 'e2e']
      });

      // Add multiple attachments
      const file1 = await fileStorage.upload({
        taskId: task.id,
        filename: 'doc1.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Document 1'),
        uploadedBy: 'user-1'
      });
      taskDomain.addAttachment(task.id, file1.id);

      const file2 = await fileStorage.upload({
        taskId: task.id,
        filename: 'doc2.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Document 2'),
        uploadedBy: 'user-2'
      });
      taskDomain.addAttachment(task.id, file2.id);

      // Export and re-import via markdown
      const markdown = markdownSync.exportToMarkdown([taskDomain.getTask(task.id)]);
      const imported = markdownSync.importFromMarkdown(markdown);

      // Verify task properties preserved
      const currentTask = taskDomain.getTask(task.id);
      expect(currentTask.attachments.length).toBe(2);
      expect(currentTask.tags).toContain('complex');
      expect(currentTask.quadrant).toBe('urgent-important');

      // Cleanup
      await fileStorage.delete(file1.id);
      await fileStorage.delete(file2.id);
      taskDomain.deleteTask(task.id);
    });
  });

  /**
   * ============================================
   * Error Handling Tests
   * ============================================
   */
  describe('Error Handling', () => {
    it('should handle invalid file operations gracefully', async () => {
      await expect(fileStorage.download('non-existent'))
        .rejects.toThrow('File not found');
    });

    it('should handle GSD sync errors', async () => {
      const brokenAdapter = {
        fetchRemote: async () => { throw new Error('Network error'); },
        pushRemote: async () => { throw new Error('Push failed'); },
        deleteRemote: async () => false,
        updateRemote: async () => { throw new Error('Update failed'); }
      };

      const brokenSync = new GSDSync(brokenAdapter);
      const result = await brokenSync.sync({ localTasks: [] });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Network error');
    });

    it('should handle repository database errors gracefully', async () => {
      // This tests error handling for DB operations
      const invalidTask = await taskRepository.create({
        title: '', // Invalid but might be allowed by schema
        quadrant: 'invalid-quadrant',
        status: 'pending'
      });

      // Should still create but with defaults
      expect(invalidTask).toBeDefined();
      expect(invalidTask.id).toBeDefined();
    });
  });

  /**
   * ============================================
   * Cleanup Tests
   * ============================================
   */
  describe('Cleanup', () => {
    it('should clean up all test data', async () => {
      // Create test data
      const task = taskDomain.createTask({ title: 'Cleanup Test' });
      const buffer = Buffer.from('Cleanup content');
      const file = await fileStorage.upload({
        taskId: task.id,
        filename: 'cleanup.txt',
        mimeType: 'text/plain',
        buffer,
        uploadedBy: 'test-user'
      });

      // Verify creation
      expect(taskDomain.getTask(task.id)).toBeDefined();
      expect(await fileStorage.exists(file.id)).toBe(true);

      // Cleanup
      await fileStorage.delete(file.id);
      taskDomain.deleteTask(task.id);

      // Verify cleanup
      expect(taskDomain.getTask(task.id)).toBeUndefined();
      expect(await fileStorage.exists(file.id)).toBe(false);
    });

    it('should handle cascading deletes correctly', () => {
      const parent = taskDomain.createTask({ title: 'Parent for Cascade' });
      const child1 = taskDomain.createTask({ title: 'Child 1', parentTaskId: parent.id });
      const child2 = taskDomain.createTask({ title: 'Child 2', parentTaskId: parent.id });
      const grandchild = taskDomain.createTask({ title: 'Grandchild', parentTaskId: child1.id });

      // Delete parent
      taskDomain.deleteTask(parent.id);

      // Verify cascade
      expect(taskDomain.getTask(parent.id)).toBeUndefined();
      expect(taskDomain.getTask(child1.id)).toBeUndefined();
      expect(taskDomain.getTask(child2.id)).toBeUndefined();
      expect(taskDomain.getTask(grandchild.id)).toBeUndefined();
    });
  });
});
