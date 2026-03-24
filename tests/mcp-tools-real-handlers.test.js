/**
 * @fileoverview Tests for MCP Tools with Real Handlers
 * Tests the implementation of real handlers for Task, Roadmap, and System tools.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { registry, initializeRegistry, getToolCounts } from '../src/tools/index.js';
import { taskTools, taskDomain } from '../src/tools/definitions/task-tools.js';
import { roadmapTools, roadmapDomain } from '../src/tools/definitions/roadmap-tools.js';
import { systemTools } from '../src/tools/definitions/system-tools.js';

describe('MCP Tools - Real Handlers Implementation', () => {
  beforeAll(() => {
    // Initialize registry with all tools
    registry.initialize();
  });

  beforeEach(() => {
    // Clear domain data before each test
    // Note: In real implementation, we might want to use isolated domains per test
  });

  describe('Tool Registry', () => {
    it('should have correct tool counts', () => {
      const counts = getToolCounts();
      expect(counts.total).toBeGreaterThan(0);
      expect(counts.task).toBeGreaterThan(0);
      expect(counts.roadmap).toBeGreaterThan(0);
      expect(counts.system).toBeGreaterThan(0);
    });

    it('should be initialized with all tools', () => {
      expect(registry.isInitialized).toBe(true);
      expect(registry.count).toBe(getToolCounts().total);
    });

    it('should provide registry statistics', () => {
      const stats = registry.getRegistryStats();
      expect(stats.totalTools).toBeGreaterThan(0);
      expect(stats).toHaveProperty('tagDistribution');
      expect(stats).toHaveProperty('totalExecutions');
    });
  });

  describe('Task Domain', () => {
    it('should create a task', () => {
      const task = taskDomain.createTask({
        title: 'Test Task',
        description: 'Test Description',
        priority: 'high',
        urgent: true,
        important: true
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.quadrant).toBe('urgent-important');
      expect(task.status).toBe('backlog');
    });

    it('should retrieve a task by ID', () => {
      const task = taskDomain.createTask({ title: 'Retrievable Task' });
      const retrieved = taskDomain.getTask(task.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(task.id);
    });

    it('should update a task', () => {
      const task = taskDomain.createTask({ title: 'Updatable Task' });
      const updated = taskDomain.updateTask(task.id, { 
        title: 'Updated Task',
        status: 'in_progress'
      });

      expect(updated.title).toBe('Updated Task');
      expect(updated.status).toBe('in_progress');
    });

    it('should delete a task', () => {
      const task = taskDomain.createTask({ title: 'Deletable Task' });
      const deleted = taskDomain.deleteTask(task.id);

      expect(deleted).toBe(true);
      expect(taskDomain.getTask(task.id)).toBeUndefined();
    });

    it('should list tasks with filters', () => {
      taskDomain.createTask({ title: 'Task 1', priority: 'high' });
      taskDomain.createTask({ title: 'Task 2', priority: 'low' });

      const allTasks = taskDomain.listTasks({});
      expect(allTasks.length).toBeGreaterThanOrEqual(2);

      const highPriorityTasks = taskDomain.listTasks({ priority: 'high' });
      expect(highPriorityTasks.every(t => t.priority === 'high')).toBe(true);
    });

    it('should organize tasks by Eisenhower matrix', () => {
      taskDomain.createTask({ title: 'Q1 Task', urgent: true, important: true });
      taskDomain.createTask({ title: 'Q2 Task', urgent: false, important: true });
      taskDomain.createTask({ title: 'Q3 Task', urgent: true, important: false });
      taskDomain.createTask({ title: 'Q4 Task', urgent: false, important: false });

      const matrix = taskDomain.organizeByMatrix({});
      
      expect(matrix).toHaveProperty('urgentImportant');
      expect(matrix).toHaveProperty('notUrgentImportant');
      expect(matrix).toHaveProperty('urgentNotImportant');
      expect(matrix).toHaveProperty('notUrgentNotImportant');
    });
  });

  describe('Roadmap Domain', () => {
    it('should create a roadmap', () => {
      const roadmap = roadmapDomain.createRoadmap({
        title: 'Test Roadmap',
        description: 'Test Description',
        category: 'test'
      });

      expect(roadmap).toBeDefined();
      expect(roadmap.id).toBeDefined();
      expect(roadmap.title).toBe('Test Roadmap');
      expect(roadmap.nodes).toEqual([]);
    });

    it('should retrieve a roadmap by ID', () => {
      const roadmap = roadmapDomain.createRoadmap({ title: 'Retrievable Roadmap' });
      const retrieved = roadmapDomain.getRoadmap(roadmap.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(roadmap.id);
    });

    it('should update a roadmap', () => {
      const roadmap = roadmapDomain.createRoadmap({ title: 'Updatable Roadmap' });
      const updated = roadmapDomain.updateRoadmap(roadmap.id, { 
        title: 'Updated Roadmap',
        category: 'updated'
      });

      expect(updated.title).toBe('Updated Roadmap');
      expect(updated.category).toBe('updated');
    });

    it('should delete a roadmap', () => {
      const roadmap = roadmapDomain.createRoadmap({ title: 'Deletable Roadmap' });
      const deleted = roadmapDomain.deleteRoadmap(roadmap.id);

      expect(deleted).toBe(true);
      expect(roadmapDomain.getRoadmap(roadmap.id)).toBeUndefined();
    });

    it('should list roadmaps with filters', () => {
      roadmapDomain.createRoadmap({ title: 'Roadmap 1', category: 'tech' });
      roadmapDomain.createRoadmap({ title: 'Roadmap 2', category: 'business' });

      const allRoadmaps = roadmapDomain.listRoadmaps({});
      expect(allRoadmaps.length).toBeGreaterThanOrEqual(2);

      const techRoadmaps = roadmapDomain.listRoadmaps({ category: 'tech' });
      expect(techRoadmaps.every(r => r.category === 'tech')).toBe(true);
    });

    it('should enroll a user and track progress', () => {
      const roadmap = roadmapDomain.createRoadmap({
        title: 'Progress Roadmap',
        nodes: [
          { id: 'node1', title: 'Node 1', description: '', prerequisites: [], estimatedHours: 1, resources: [], type: 'lesson' },
          { id: 'node2', title: 'Node 2', description: '', prerequisites: [], estimatedHours: 1, resources: [], type: 'lesson' }
        ]
      });

      const enrollment = roadmapDomain.enrollUser(roadmap.id, 'user123');
      expect(enrollment).toBeDefined();
      expect(enrollment.userId).toBe('user123');
      expect(enrollment.progressPercent).toBe(0);

      // Update node status
      roadmapDomain.updateNodeStatus(roadmap.id, 'user123', 'node1', 'completed');
      
      const progress = roadmapDomain.getProgress(roadmap.id, 'user123');
      expect(progress.progressPercent).toBe(50);
    });
  });

  describe('Task Tools', () => {
    it('should execute task_create', async () => {
      const result = await registry.execute('task_create', {
        title: 'MCP Test Task',
        description: 'Created via MCP tool',
        priority: 'medium'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.title).toBe('MCP Test Task');
    });

    it('should execute task_get', async () => {
      const createResult = await registry.execute('task_create', {
        title: 'Get Test Task'
      });

      const result = await registry.execute('task_get', {
        id: createResult.data.id
      });

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(createResult.data.id);
    });

    it('should execute task_list', async () => {
      const result = await registry.execute('task_list', {
        page: 1,
        pageSize: 10
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('tasks');
      expect(result.data).toHaveProperty('total');
      expect(Array.isArray(result.data.tasks)).toBe(true);
    });

    it('should execute task_update', async () => {
      const createResult = await registry.execute('task_create', {
        title: 'Update Test Task'
      });

      const result = await registry.execute('task_update', {
        id: createResult.data.id,
        title: 'Updated Title',
        status: 'in_progress'
      });

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Updated Title');
      expect(result.data.status).toBe('in_progress');
    });

    it('should execute task_delete', async () => {
      const createResult = await registry.execute('task_create', {
        title: 'Delete Test Task'
      });

      const result = await registry.execute('task_delete', {
        id: createResult.data.id
      });

      expect(result.success).toBe(true);
      expect(result.data.deleted).toBe(true);
    });

    it('should execute task_search', async () => {
      await registry.execute('task_create', {
        title: 'Searchable Task',
        description: 'Contains search term: xyz123'
      });

      const result = await registry.execute('task_search', {
        query: 'xyz123',
        page: 1,
        pageSize: 10
      });

      expect(result.success).toBe(true);
      expect(result.data.tasks.length).toBeGreaterThan(0);
    });

    it('should execute task_stats', async () => {
      const result = await registry.execute('task_stats', {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('total');
      expect(result.data).toHaveProperty('byStatus');
      expect(result.data).toHaveProperty('byPriority');
    });

    it('should execute task_eisenhower_matrix', async () => {
      const result = await registry.execute('task_eisenhower_matrix', {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('urgentImportant');
      expect(result.data).toHaveProperty('notUrgentImportant');
      expect(result.data).toHaveProperty('urgentNotImportant');
      expect(result.data).toHaveProperty('notUrgentNotImportant');
    });
  });

  describe('Roadmap Tools', () => {
    it('should execute roadmap_create', async () => {
      const result = await registry.execute('roadmap_create', {
        title: 'MCP Test Roadmap',
        description: 'Created via MCP tool',
        category: 'test'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.title).toBe('MCP Test Roadmap');
    });

    it('should execute roadmap_get', async () => {
      const createResult = await registry.execute('roadmap_create', {
        title: 'Get Test Roadmap'
      });

      const result = await registry.execute('roadmap_get', {
        id: createResult.data.id
      });

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(createResult.data.id);
    });

    it('should execute roadmap_list', async () => {
      const result = await registry.execute('roadmap_list', {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('roadmaps');
      expect(result.data).toHaveProperty('total');
    });

    it('should execute roadmap_update', async () => {
      const createResult = await registry.execute('roadmap_create', {
        title: 'Update Test Roadmap'
      });

      const result = await registry.execute('roadmap_update', {
        id: createResult.data.id,
        title: 'Updated Roadmap Title'
      });

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Updated Roadmap Title');
    });

    it('should execute roadmap_delete', async () => {
      const createResult = await registry.execute('roadmap_create', {
        title: 'Delete Test Roadmap'
      });

      const result = await registry.execute('roadmap_delete', {
        id: createResult.data.id
      });

      expect(result.success).toBe(true);
      expect(result.data.deleted).toBe(true);
    });

    it('should execute roadmap_stats', async () => {
      const createResult = await registry.execute('roadmap_create', {
        title: 'Stats Test Roadmap',
        initialNodes: [
          { title: 'Node 1', type: 'lesson', estimatedHours: 2 },
          { title: 'Node 2', type: 'project', estimatedHours: 5 }
        ]
      });

      const result = await registry.execute('roadmap_stats', {
        id: createResult.data.id
      });

      expect(result.success).toBe(true);
      expect(result.data.totalNodes).toBe(2);
      expect(result.data).toHaveProperty('byType');
      expect(result.data).toHaveProperty('complexity');
    });

    it('should execute roadmap_add_node', async () => {
      const createResult = await registry.execute('roadmap_create', {
        title: 'Add Node Test Roadmap'
      });

      const result = await registry.execute('roadmap_add_node', {
        roadmapId: createResult.data.id,
        title: 'New Node',
        type: 'lesson',
        estimatedHours: 3
      });

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('New Node');
    });

    it('should execute roadmap_export', async () => {
      const createResult = await registry.execute('roadmap_create', {
        title: 'Export Test Roadmap'
      });

      const jsonResult = await registry.execute('roadmap_export', {
        id: createResult.data.id,
        format: 'json'
      });

      expect(jsonResult.success).toBe(true);
      expect(jsonResult.data.format).toBe('json');
      expect(jsonResult.data.content).toContain('Export Test Roadmap');

      const mdResult = await registry.execute('roadmap_export', {
        id: createResult.data.id,
        format: 'markdown'
      });

      expect(mdResult.success).toBe(true);
      expect(mdResult.data.format).toBe('markdown');
    });
  });

  describe('System Tools', () => {
    it('should execute system_health', async () => {
      const result = await registry.execute('system_health', {
        detailed: false
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('overall');
      expect(result.data).toHaveProperty('components');
      expect(result.data).toHaveProperty('uptime');
      expect(result.data).toHaveProperty('version');
    });

    it('should execute system_metrics', async () => {
      const result = await registry.execute('system_metrics', {
        components: ['memory', 'process']
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('memory');
      expect(result.data).toHaveProperty('process');
      expect(result.data).toHaveProperty('timestamp');
    });

    it('should execute system_status', async () => {
      const result = await registry.execute('system_status', {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('mode');
      expect(result.data).toHaveProperty('version');
      expect(result.data).toHaveProperty('nodeVersion');
    });

    it('should execute system_config_get and system_config_set', async () => {
      // Set a config value
      const setResult = await registry.execute('system_config_set', {
        section: 'test',
        key: 'value',
        value: 42
      });

      expect(setResult.success).toBe(true);
      expect(setResult.data.updated).toBe(true);

      // Get the config
      const getResult = await registry.execute('system_config_get', {
        section: 'test'
      });

      expect(getResult.success).toBe(true);
      expect(getResult.data.test).toBeDefined();
    });

    it('should execute system_logs', async () => {
      const result = await registry.execute('system_logs', {
        limit: 10
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('logs');
      expect(result.data).toHaveProperty('total');
      expect(result.data).toHaveProperty('hasMore');
    });

    it('should execute system_backup_create and system_backup_list', async () => {
      const createResult = await registry.execute('system_backup_create', {
        type: 'full',
        components: ['config']
      });

      expect(createResult.success).toBe(true);
      expect(createResult.data).toHaveProperty('id');
      expect(createResult.data).toHaveProperty('status');

      const listResult = await registry.execute('system_backup_list', {});

      expect(listResult.success).toBe(true);
      expect(listResult.data).toHaveProperty('backups');
      expect(listResult.data.backups.length).toBeGreaterThan(0);
    });

    it('should execute system_maintenance', async () => {
      const result = await registry.execute('system_maintenance', {
        action: 'run_task',
        task: 'verify'
      });

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
    });

    it('should execute system_cache_clear', async () => {
      const result = await registry.execute('system_cache_clear', {
        caches: ['memory']
      });

      expect(result.success).toBe(true);
      expect(result.data.cleared).toContain('memory');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent tool', async () => {
      const result = await registry.execute('non_existent_tool', {});
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors[0]).toContain('not found');
    });

    it('should handle invalid parameters', async () => {
      const result = await registry.execute('task_create', {
        // Missing required 'title'
        description: 'No title provided'
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle non-existent task', async () => {
      const result = await registry.execute('task_get', {
        id: 'non-existent-id-12345'
      });

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
    });

    it('should handle non-existent roadmap', async () => {
      const result = await registry.execute('roadmap_get', {
        id: 'non-existent-id-12345'
      });

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
    });
  });
});
