/**
 * @fileoverview Test script for MCP Tools Real Handlers
 * Simple test runner that doesn't rely on Jest configuration
 */

import { registry, initializeRegistry, getToolCounts } from '../src/tools/index.js';
import { taskTools, taskDomain } from '../src/tools/definitions/task-tools.js';
import { roadmapTools, roadmapDomain } from '../src/tools/definitions/roadmap-tools.js';
import { systemTools } from '../src/tools/definitions/system-tools.js';

// Simple test framework
const tests = [];
let passed = 0;
let failed = 0;

function describe(name, fn) {
  tests.push({ type: 'describe', name });
  fn();
}

function it(name, fn) {
  tests.push({ type: 'it', name, fn });
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${expected} but got ${value}`);
      }
    },
    toBeDefined() {
      if (value === undefined) {
        throw new Error(`Expected value to be defined but got undefined`);
      }
    },
    toBeUndefined() {
      if (value !== undefined) {
        throw new Error(`Expected value to be undefined but got ${value}`);
      }
    },
    toBeNull() {
      if (value !== null) {
        throw new Error(`Expected null but got ${value}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(value > expected)) {
        throw new Error(`Expected value to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected) {
      if (!(value >= expected)) {
        throw new Error(`Expected value to be greater than or equal to ${expected}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(value)}`);
      }
    },
    toContain(expected) {
      if (!value.includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(value)} to contain ${JSON.stringify(expected)}`);
      }
    },
    toHaveProperty(key) {
      if (!(key in value)) {
        throw new Error(`Expected object to have property ${key}`);
      }
    }
  };
}

expect.any = (type) => ({ type: 'any', expectedType: type.name });

// Run all tests
async function runTests() {
  console.log('\n=== MCP Tools Real Handlers Test Suite ===\n');
  
  let currentDescribe = '';
  
  for (const test of tests) {
    if (test.type === 'describe') {
      currentDescribe = test.name;
      console.log(`\n${currentDescribe}`);
    } else if (test.type === 'it') {
      try {
        await test.fn();
        console.log(`  ✓ ${test.name}`);
        passed++;
      } catch (error) {
        console.log(`  ✗ ${test.name}`);
        console.log(`    Error: ${error.message}`);
        if (error.stack) {
          const lines = error.stack.split('\n').slice(1, 3);
          for (const line of lines) {
            console.log(`    ${line.trim()}`);
          }
        }
        failed++;
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
  console.log('='.repeat(50) + '\n');
  
  return failed === 0;
}

// ==================== TESTS ====================

describe('Tool Registry', () => {
  it('should have correct tool counts', () => {
    const counts = getToolCounts();
    expect(counts.total).toBeGreaterThan(0);
    expect(counts.task).toBeGreaterThan(0);
    expect(counts.roadmap).toBeGreaterThan(0);
    expect(counts.system).toBeGreaterThan(0);
  });

  it('should be initialized with all tools', () => {
    registry.initialize();
    expect(registry.isInitialized).toEqual(true);
    expect(registry.count).toEqual(getToolCounts().total);
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
    expect(task.title).toEqual('Test Task');
    expect(task.quadrant).toEqual('urgent-important');
  });

  it('should retrieve a task by ID', () => {
    const task = taskDomain.createTask({ title: 'Retrievable Task' });
    const retrieved = taskDomain.getTask(task.id);

    expect(retrieved).toBeDefined();
    expect(retrieved.id).toEqual(task.id);
  });

  it('should update a task', () => {
    const task = taskDomain.createTask({ title: 'Updatable Task' });
    const updated = taskDomain.updateTask(task.id, { 
      title: 'Updated Task',
      status: 'in_progress'
    });

    expect(updated.title).toEqual('Updated Task');
    expect(updated.status).toEqual('in_progress');
  });

  it('should delete a task', () => {
    const task = taskDomain.createTask({ title: 'Deletable Task' });
    const deleted = taskDomain.deleteTask(task.id);

    expect(deleted).toEqual(true);
    expect(taskDomain.getTask(task.id)).toBeUndefined();
  });

  it('should organize tasks by Eisenhower matrix', () => {
    taskDomain.createTask({ title: 'Q1 Task', urgent: true, important: true });
    taskDomain.createTask({ title: 'Q2 Task', urgent: false, important: true });

    const matrix = taskDomain.organizeByMatrix({});
    
    expect(matrix).toHaveProperty('urgentImportant');
    expect(matrix).toHaveProperty('notUrgentImportant');
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
    expect(roadmap.title).toEqual('Test Roadmap');
  });

  it('should retrieve a roadmap by ID', () => {
    const roadmap = roadmapDomain.createRoadmap({ title: 'Retrievable Roadmap' });
    const retrieved = roadmapDomain.getRoadmap(roadmap.id);

    expect(retrieved).toBeDefined();
    expect(retrieved.id).toEqual(roadmap.id);
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
    expect(enrollment.userId).toEqual('user123');

    roadmapDomain.updateNodeStatus(roadmap.id, 'user123', 'node1', 'completed');
    
    const progress = roadmapDomain.getProgress(roadmap.id, 'user123');
    expect(progress.progressPercent).toEqual(50);
  });
});

describe('Task Tools', () => {
  it('should execute task_create', async () => {
    const result = await registry.execute('task_create', {
      title: 'MCP Test Task',
      description: 'Created via MCP tool',
      priority: 'medium'
    });

    expect(result.success).toEqual(true);
    expect(result.data).toBeDefined();
    expect(result.data.title).toEqual('MCP Test Task');
  });

  it('should execute task_list', async () => {
    const result = await registry.execute('task_list', {
      page: 1,
      pageSize: 10
    });

    expect(result.success).toEqual(true);
    expect(result.data).toHaveProperty('tasks');
    expect(result.data).toHaveProperty('total');
  });

  it('should execute task_stats', async () => {
    const result = await registry.execute('task_stats', {});

    expect(result.success).toEqual(true);
    expect(result.data).toHaveProperty('total');
    expect(result.data).toHaveProperty('byStatus');
  });

  it('should execute task_eisenhower_matrix', async () => {
    const result = await registry.execute('task_eisenhower_matrix', {});

    expect(result.success).toEqual(true);
    expect(result.data).toHaveProperty('urgentImportant');
    expect(result.data).toHaveProperty('notUrgentImportant');
  });
});

describe('Roadmap Tools', () => {
  it('should execute roadmap_create', async () => {
    const result = await registry.execute('roadmap_create', {
      title: 'MCP Test Roadmap',
      description: 'Created via MCP tool'
    });

    expect(result.success).toEqual(true);
    expect(result.data).toBeDefined();
    expect(result.data.title).toEqual('MCP Test Roadmap');
  });

  it('should execute roadmap_list', async () => {
    const result = await registry.execute('roadmap_list', {});
    
    if (!result.success) {
      console.log('    roadmap_list failed:', result.errors);
    }

    expect(result.success).toEqual(true);
    expect(result.data).toHaveProperty('roadmaps');
    expect(result.data).toHaveProperty('total');
  });

  it('should execute roadmap_stats', async () => {
    const createResult = await registry.execute('roadmap_create', {
      title: 'Stats Test Roadmap',
      initialNodes: [
        { title: 'Node 1', type: 'lesson', estimatedHours: 2 },
        { title: 'Node 2', type: 'project', estimatedHours: 5 }
      ]
    });
    
    if (!createResult.success) {
      console.log('    roadmap_create (for stats) failed:', createResult.errors);
    }
    
    expect(createResult.success).toEqual(true);
    expect(createResult.data).toBeDefined();

    const result = await registry.execute('roadmap_stats', {
      id: createResult.data?.id
    });
    
    if (!result.success) {
      console.log('    roadmap_stats failed:', result.errors);
    }

    expect(result.success).toEqual(true);
    expect(result.data.totalNodes).toEqual(2);
  });
});

describe('System Tools', () => {
  it('should execute system_health', async () => {
    const result = await registry.execute('system_health', {});

    expect(result.success).toEqual(true);
    expect(result.data).toHaveProperty('overall');
    expect(result.data).toHaveProperty('components');
  });

  it('should execute system_metrics', async () => {
    const result = await registry.execute('system_metrics', {
      components: ['memory', 'process']
    });
    
    if (!result.success) {
      console.log('    system_metrics failed:', result.errors);
    }

    expect(result.success).toEqual(true);
    expect(result.data).toHaveProperty('memory');
    expect(result.data).toHaveProperty('process');
  });

  it('should execute system_status', async () => {
    const result = await registry.execute('system_status', {});
    
    if (!result.success) {
      console.log('    system_status failed:', result.errors);
    }

    expect(result.success).toEqual(true);
    expect(result.data).toHaveProperty('status');
    expect(result.data).toHaveProperty('version');
  });

  it('should execute system_config_get and system_config_set', async () => {
    const setResult = await registry.execute('system_config_set', {
      section: 'test',
      key: 'value',
      value: 42
    });

    expect(setResult.success).toEqual(true);

    const getResult = await registry.execute('system_config_get', {
      section: 'test'
    });

    expect(getResult.success).toEqual(true);
  });

  it('should execute system_backup_create and system_backup_list', async () => {
    const createResult = await registry.execute('system_backup_create', {
      type: 'full',
      components: ['config']
    });

    expect(createResult.success).toEqual(true);

    const listResult = await registry.execute('system_backup_list', {});

    expect(listResult.success).toEqual(true);
    expect(listResult.data.backups.length).toBeGreaterThan(0);
  });
});

describe('Error Handling', () => {
  it('should handle non-existent tool', async () => {
    const result = await registry.execute('non_existent_tool', {});
    
    expect(result.success).toEqual(false);
    expect(result.errors[0]).toContain('not found');
  });

  it('should handle invalid parameters', async () => {
    const result = await registry.execute('task_create', {
      // Missing required 'title'
      description: 'No title provided'
    });

    expect(result.success).toEqual(false);
    expect(result.errors).toBeDefined();
  });
});

// Run tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
});
