/**
 * Dashboard API Integration Tests
 * Verifies that Dashboard Server integrates with real domain APIs
 */

import { DashboardServer } from '../src/dashboard/server.js';
import { TaskDomain } from '../src/domains/tasks/index.js';
import { RoadmapDomain } from '../src/domains/roadmaps/index.js';
import { AlertManager } from '../src/alerts/manager.js';

describe('Dashboard API Integration', () => {
  let server;
  let taskDomain;
  let roadmapDomain;
  let alertManager;

  beforeEach(() => {
    taskDomain = new TaskDomain();
    roadmapDomain = new RoadmapDomain();
    alertManager = new AlertManager();
    
    server = new DashboardServer({
      port: 3999,
      authEnabled: false,
      taskDomain,
      roadmapDomain,
      alertManager,
    });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    alertManager?.dispose();
  });

  describe('Constructor', () => {
    it('should initialize with real domain instances', () => {
      expect(server.taskDomain).toBe(taskDomain);
      expect(server.roadmapDomain).toBe(roadmapDomain);
      expect(server.alertManager).toBe(alertManager);
    });

    it('should create default domain instances if not provided', () => {
      const defaultServer = new DashboardServer({ port: 3998, authEnabled: false });
      expect(defaultServer.taskDomain).toBeInstanceOf(TaskDomain);
      expect(defaultServer.roadmapDomain).toBeInstanceOf(RoadmapDomain);
      expect(defaultServer.alertManager).toBeInstanceOf(AlertManager);
    });
  });

  describe('Task Domain Integration', () => {
    it('should create and retrieve tasks via domain', () => {
      const task = taskDomain.createTask({
        title: 'Test Task',
        priority: 'high',
        urgent: true,
        important: true,
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.quadrant).toBe('urgent-important');

      const retrieved = taskDomain.getTask(task.id);
      expect(retrieved).toEqual(task);
    });

    it('should filter tasks by quadrant', () => {
      taskDomain.createTask({ title: 'Task 1', urgent: true, important: true });
      taskDomain.createTask({ title: 'Task 2', urgent: false, important: true });
      taskDomain.createTask({ title: 'Task 3', urgent: true, important: false });

      const urgentImportant = taskDomain.listTasks({ quadrant: 'urgent-important' });
      expect(urgentImportant).toHaveLength(1);

      const allTasks = taskDomain.listTasks();
      expect(allTasks).toHaveLength(3);
    });

    it('should support batch updates', () => {
      const task1 = taskDomain.createTask({ title: 'Task 1' });
      const task2 = taskDomain.createTask({ title: 'Task 2' });

      const result = taskDomain.batchUpdate([task1.id, task2.id], { status: 'in_progress' });
      
      expect(result.count).toBe(2);
      expect(result.updated).toHaveLength(2);
      expect(result.failed).toHaveLength(0);

      expect(taskDomain.getTask(task1.id).status).toBe('in_progress');
      expect(taskDomain.getTask(task2.id).status).toBe('in_progress');
    });

    it('should provide task statistics', () => {
      taskDomain.createTask({ title: 'Task 1', priority: 'high' });
      taskDomain.createTask({ title: 'Task 2', priority: 'medium' });
      taskDomain.createTask({ title: 'Task 3', priority: 'low', status: 'done' });

      const stats = taskDomain.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(2);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.medium).toBe(1);
      expect(stats.byPriority.low).toBe(1);
    });

    it('should organize tasks by Eisenhower matrix', () => {
      taskDomain.createTask({ title: 'Do First', urgent: true, important: true });
      taskDomain.createTask({ title: 'Schedule', urgent: false, important: true });
      taskDomain.createTask({ title: 'Delegate', urgent: true, important: false });
      taskDomain.createTask({ title: 'Eliminate', urgent: false, important: false });

      const matrix = taskDomain.organizeByMatrix();
      
      expect(matrix.urgentImportant).toHaveLength(1);
      expect(matrix.notUrgentImportant).toHaveLength(1);
      expect(matrix.urgentNotImportant).toHaveLength(1);
      expect(matrix.notUrgentNotImportant).toHaveLength(1);
    });
  });

  describe('Roadmap Domain Integration', () => {
    it('should create and retrieve roadmaps', () => {
      const roadmap = roadmapDomain.createRoadmap({
        title: 'Test Roadmap',
        category: 'learning',
        difficulty: 'beginner',
      });

      expect(roadmap.id).toBeDefined();
      expect(roadmap.title).toBe('Test Roadmap');

      const retrieved = roadmapDomain.getRoadmap(roadmap.id);
      expect(retrieved).toEqual(roadmap);
    });

    it('should track user progress', () => {
      const roadmap = roadmapDomain.createRoadmap({
        title: 'Learning Path',
        nodes: [
          { id: 'node1', title: 'Lesson 1' },
          { id: 'node2', title: 'Lesson 2' },
        ],
      });

      roadmapDomain.enrollUser(roadmap.id, 'user1');
      const progress = roadmapDomain.getProgress(roadmap.id, 'user1');

      expect(progress.progressPercent).toBe(0);
      expect(progress.totalNodes).toBe(2);

      roadmapDomain.updateNodeStatus(roadmap.id, 'user1', 'node1', 'completed');
      const updated = roadmapDomain.getProgress(roadmap.id, 'user1');
      
      expect(updated.progressPercent).toBe(50);
    });
  });

  describe('Alert Manager Integration', () => {
    it('should create and manage alerts', () => {
      const alert = alertManager.createAlert('system', 'Test alert', {
        priority: 'HIGH',
      });

      expect(alert.id).toBeDefined();
      expect(alert.state).toBe('PENDING');

      const retrieved = alertManager.getAlert(alert.id);
      expect(retrieved).toEqual(alert);
    });

    it('should acknowledge alerts', () => {
      const alert = alertManager.createAlert('test', 'Alert to ack');
      
      const acknowledged = alertManager.acknowledgeAlert(alert.id, {
        acknowledgedBy: 'testuser',
      });

      expect(acknowledged.state).toBe('ACKNOWLEDGED');
      expect(acknowledged.acknowledgedBy).toBe('testuser');
    });

    it('should provide alert metrics', () => {
      alertManager.createAlert('test', 'Alert 1', { priority: 'HIGH' });
      alertManager.createAlert('test', 'Alert 2', { priority: 'MEDIUM' });

      const metrics = alertManager.getMetrics();
      
      expect(metrics.total).toBe(2);
      expect(metrics.created).toBe(2);
      expect(metrics.byState.pending).toBe(2);
    });
  });

  describe('WebSocket Integration', () => {
    it('should setup WebSocket event handlers', () => {
      // Verify that alert manager events are wired up
      const alert = alertManager.createAlert('test', 'WebSocket test');
      
      // Event handlers should be set up in constructor
      expect(server.wsServer).toBeNull(); // Not started yet
      
      // The event handler should not throw even if wsServer is null
      expect(() => {
        alertManager.emit('alertCreated', { alert });
      }).not.toThrow();
    });
  });
});
