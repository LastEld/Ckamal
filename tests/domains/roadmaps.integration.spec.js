/**
 * @fileoverview Integration tests for Roadmaps Domain
 * @module tests/domains/roadmaps
 * 
 * Test Coverage:
 * - Roadmap CRUD operations
 * - Progress tracking (enroll, update, get)
 * - Personalized path recommendations
 * - Enrollment management
 * 
 * @see src/domains/roadmaps/index.js
 * @see src/domains/roadmaps/ACCEPTANCE.md
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RoadmapDomain } from '../../src/domains/roadmaps/index.js';
import {
  assertISODate,
  assertHasKeys,
  assertInRange,
  assertThrows
} from '../helpers/assertions.js';

describe('Roadmaps Domain Integration Tests', () => {
  let domain;

  beforeEach(() => {
    domain = new RoadmapDomain();
  });

  // ============================================================================
  // Scenario 1-2: Roadmap Creation
  // ============================================================================
  describe('Roadmap CRUD', () => {
    describe('createRoadmap', () => {
      it('should create roadmap with valid data', () => {
        const data = {
          title: 'JavaScript Fundamentals',
          description: 'Learn JS basics',
          category: 'programming',
          createdBy: 'user_123',
          difficulty: 'beginner',
          tags: ['javascript', 'web']
        };

        const roadmap = domain.createRoadmap(data);

        assert.ok(roadmap.id, 'Should have unique ID');
        assert.ok(roadmap.id.startsWith('rm_'), 'ID should have rm_ prefix');
        assert.equal(roadmap.title, data.title);
        assert.equal(roadmap.description, data.description);
        assert.equal(roadmap.category, data.category);
        assert.equal(roadmap.createdBy, data.createdBy);
        assert.equal(roadmap.difficulty, data.difficulty);
        assert.deepEqual(roadmap.tags, data.tags);
        assert.deepEqual(roadmap.nodes, []);
        assertISODate(roadmap.createdAt);
        assertISODate(roadmap.updatedAt);
        assert.equal(roadmap.createdAt, roadmap.updatedAt, 'Timestamps should match on creation');
      });

      it('should apply default values for optional fields', () => {
        const roadmap = domain.createRoadmap({ title: 'Test Roadmap' });

        assert.equal(roadmap.description, '');
        assert.equal(roadmap.category, 'general');
        assert.deepEqual(roadmap.nodes, []);
        assert.equal(roadmap.createdBy, 'system');
        assert.equal(roadmap.difficulty, 'beginner');
        assert.deepEqual(roadmap.tags, []);
      });

      it('should create roadmap with nodes', () => {
        const nodes = [
          {
            id: 'node_1',
            title: 'Introduction',
            description: 'Intro lesson',
            prerequisites: [],
            estimatedHours: 2,
            resources: ['https://example.com/intro'],
            type: 'lesson'
          },
          {
            id: 'node_2',
            title: 'Advanced Topic',
            description: 'Advanced lesson',
            prerequisites: ['node_1'],
            estimatedHours: 4,
            resources: [],
            type: 'lesson'
          }
        ];

        const roadmap = domain.createRoadmap({
          title: 'Test with Nodes',
          nodes
        });

        assert.equal(roadmap.nodes.length, 2);
        assert.equal(roadmap.nodes[0].id, 'node_1');
        assert.equal(roadmap.nodes[1].prerequisites[0], 'node_1');
      });

      it('should throw error when title is missing', async () => {
        await assertThrows(
          () => domain.createRoadmap({}),
          'Roadmap title is required'
        );
      });

      it('should throw error when title is empty string', async () => {
        await assertThrows(
          () => domain.createRoadmap({ title: '' }),
          'Roadmap title is required'
        );
      });

      it('should throw error when title is not a string', async () => {
        await assertThrows(
          () => domain.createRoadmap({ title: 123 }),
          'Roadmap title is required'
        );
      });
    });

    // ============================================================================
    // Scenario 3: Roadmap Retrieval
    // ============================================================================
    describe('getRoadmap', () => {
      it('should return roadmap by ID', () => {
        const created = domain.createRoadmap({ title: 'Test' });
        const retrieved = domain.getRoadmap(created.id);

        assert.ok(retrieved);
        assert.equal(retrieved.id, created.id);
        assert.equal(retrieved.title, created.title);
      });

      it('should return undefined for non-existent ID', () => {
        const result = domain.getRoadmap('non_existent_id');
        assert.equal(result, undefined);
      });

      it('should return undefined for invalid ID types', () => {
        assert.equal(domain.getRoadmap(null), undefined);
        assert.equal(domain.getRoadmap(undefined), undefined);
        assert.equal(domain.getRoadmap(123), undefined);
        assert.equal(domain.getRoadmap({}), undefined);
      });
    });

    // ============================================================================
    // Scenario 4-5: Roadmap Update
    // ============================================================================
    describe('updateRoadmap', () => {
      it('should update allowed fields', async () => {
        const roadmap = domain.createRoadmap({
          title: 'Original Title',
          description: 'Original description'
        });

        // Small delay to ensure timestamp difference
        await new Promise(r => setTimeout(r, 10));

        const updated = domain.updateRoadmap(roadmap.id, {
          title: 'Updated Title',
          description: 'Updated description',
          category: 'updated_category',
          difficulty: 'advanced',
          tags: ['new', 'tags']
        });

        assert.equal(updated.title, 'Updated Title');
        assert.equal(updated.description, 'Updated description');
        assert.equal(updated.category, 'updated_category');
        assert.equal(updated.difficulty, 'advanced');
        assert.deepEqual(updated.tags, ['new', 'tags']);
        assert.ok(new Date(updated.updatedAt) >= new Date(roadmap.createdAt), 'updatedAt should be >= createdAt');
      });

      it('should preserve immutable fields on update', () => {
        const roadmap = domain.createRoadmap({ title: 'Test' });
        const originalId = roadmap.id;
        const originalCreatedAt = roadmap.createdAt;
        const originalCreatedBy = roadmap.createdBy;

        const updated = domain.updateRoadmap(roadmap.id, {
          title: 'Updated',
          id: 'attempted_new_id',
          createdAt: '2020-01-01T00:00:00.000Z',
          createdBy: 'attempted_new_creator'
        });

        assert.equal(updated.id, originalId);
        assert.equal(updated.createdAt, originalCreatedAt);
        assert.equal(updated.createdBy, originalCreatedBy);
        assert.equal(updated.title, 'Updated');
      });

      it('should update nodes array', () => {
        const roadmap = domain.createRoadmap({
          title: 'Test',
          nodes: [{ id: 'n1', title: 'Node 1' }]
        });

        const newNodes = [
          { id: 'n1', title: 'Updated Node 1' },
          { id: 'n2', title: 'Node 2' }
        ];

        const updated = domain.updateRoadmap(roadmap.id, { nodes: newNodes });

        assert.equal(updated.nodes.length, 2);
        assert.equal(updated.nodes[0].title, 'Updated Node 1');
      });

      it('should throw error for non-existent roadmap', async () => {
        await assertThrows(
          () => domain.updateRoadmap('non_existent', { title: 'New' }),
          'Roadmap not found: non_existent'
        );
      });
    });

    // ============================================================================
    // Scenario 6: Roadmap Deletion
    // ============================================================================
    describe('deleteRoadmap', () => {
      it('should delete roadmap and return true', () => {
        const roadmap = domain.createRoadmap({ title: 'To Delete' });
        
        const result = domain.deleteRoadmap(roadmap.id);
        
        assert.equal(result, true);
        assert.equal(domain.getRoadmap(roadmap.id), undefined);
      });

      it('should return false for non-existent roadmap', () => {
        const result = domain.deleteRoadmap('non_existent');
        assert.equal(result, false);
      });

      it('should cascade delete and clean up enrollments', () => {
        const roadmap = domain.createRoadmap({
          title: 'Test',
          nodes: [{ id: 'n1', title: 'Node 1' }]
        });
        
        domain.enrollUser(roadmap.id, 'user_1');
        domain.enrollUser(roadmap.id, 'user_2');
        
        // Verify enrollments exist
        assert.ok(domain.getProgress(roadmap.id, 'user_1'));
        assert.ok(domain.getProgress(roadmap.id, 'user_2'));
        
        // Delete roadmap
        domain.deleteRoadmap(roadmap.id);
        
        // Enrollments should be cleaned up
        assert.throws(
          () => domain.getProgress(roadmap.id, 'user_1'),
          /not enrolled/
        );
        assert.throws(
          () => domain.getProgress(roadmap.id, 'user_2'),
          /not enrolled/
        );
      });
    });

    // ============================================================================
    // Scenario 17: Roadmap Listing with Filters
    // ============================================================================
    describe('listRoadmaps', () => {
      beforeEach(() => {
        domain.createRoadmap({ title: 'JS Basics', category: 'programming', difficulty: 'beginner' });
        domain.createRoadmap({ title: 'React Advanced', category: 'programming', difficulty: 'advanced' });
        domain.createRoadmap({ title: 'Design Patterns', category: 'design', difficulty: 'intermediate' });
        domain.createRoadmap({ title: 'UI Fundamentals', category: 'design', difficulty: 'beginner' });
      });

      it('should return all roadmaps without filters', () => {
        const roadmaps = domain.listRoadmaps();
        assert.equal(roadmaps.length, 4);
      });

      it('should filter by category', () => {
        const programming = domain.listRoadmaps({ category: 'programming' });
        assert.equal(programming.length, 2);
        assert.ok(programming.every(r => r.category === 'programming'));

        const design = domain.listRoadmaps({ category: 'design' });
        assert.equal(design.length, 2);
        assert.ok(design.every(r => r.category === 'design'));
      });

      it('should filter by difficulty', () => {
        const beginner = domain.listRoadmaps({ difficulty: 'beginner' });
        assert.equal(beginner.length, 2);
        assert.ok(beginner.every(r => r.difficulty === 'beginner'));

        const advanced = domain.listRoadmaps({ difficulty: 'advanced' });
        assert.equal(advanced.length, 1);
        assert.equal(advanced[0].title, 'React Advanced');
      });

      it('should apply multiple filters', () => {
        const results = domain.listRoadmaps({ 
          category: 'programming', 
          difficulty: 'beginner' 
        });
        assert.equal(results.length, 1);
        assert.equal(results[0].title, 'JS Basics');
      });

      it('should return empty array when no matches', () => {
        const results = domain.listRoadmaps({ category: 'non_existent' });
        assert.deepEqual(results, []);
      });
    });
  });

  // ============================================================================
  // Scenario 7-11: Enrollment and Progress Tracking
  // ============================================================================
  describe('Progress Tracking', () => {
    let roadmap;

    beforeEach(() => {
      roadmap = domain.createRoadmap({
        title: 'Test Roadmap',
        nodes: [
          { id: 'node_1', title: 'Lesson 1', prerequisites: [] },
          { id: 'node_2', title: 'Lesson 2', prerequisites: ['node_1'] },
          { id: 'node_3', title: 'Assessment', prerequisites: ['node_2'], type: 'assessment' }
        ]
      });
    });

    describe('enrollUser', () => {
      it('should create enrollment with initialized status', () => {
        const enrollment = domain.enrollUser(roadmap.id, 'user_123');

        assert.equal(enrollment.roadmapId, roadmap.id);
        assert.equal(enrollment.userId, 'user_123');
        assert.equal(enrollment.progressPercent, 0);
        assertISODate(enrollment.enrolledAt);
        assertISODate(enrollment.lastAccessedAt);
        
        // All nodes should be not_started
        assert.equal(enrollment.nodeStatus.node_1, 'not_started');
        assert.equal(enrollment.nodeStatus.node_2, 'not_started');
        assert.equal(enrollment.nodeStatus.node_3, 'not_started');
      });

      it('should throw error for duplicate enrollment', async () => {
        domain.enrollUser(roadmap.id, 'user_123');
        
        await assertThrows(
          () => domain.enrollUser(roadmap.id, 'user_123'),
          'User user_123 is already enrolled in roadmap'
        );
      });

      it('should throw error for non-existent roadmap', async () => {
        await assertThrows(
          () => domain.enrollUser('non_existent', 'user_123'),
          'Roadmap not found: non_existent'
        );
      });

      it('should allow same user to enroll in different roadmaps', () => {
        const roadmap2 = domain.createRoadmap({ title: 'Another Roadmap' });
        
        const enrollment1 = domain.enrollUser(roadmap.id, 'user_123');
        const enrollment2 = domain.enrollUser(roadmap2.id, 'user_123');
        
        assert.equal(enrollment1.roadmapId, roadmap.id);
        assert.equal(enrollment2.roadmapId, roadmap2.id);
      });

      it('should allow different users to enroll in same roadmap', () => {
        const enrollment1 = domain.enrollUser(roadmap.id, 'user_1');
        const enrollment2 = domain.enrollUser(roadmap.id, 'user_2');
        
        assert.equal(enrollment1.userId, 'user_1');
        assert.equal(enrollment2.userId, 'user_2');
      });
    });

    describe('getProgress', () => {
      it('should calculate progress correctly', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        
        // Complete 1 of 3 nodes
        domain.updateNodeStatus(roadmap.id, 'user_123', 'node_1', 'completed');
        
        const progress = domain.getProgress(roadmap.id, 'user_123');
        
        assert.equal(progress.progressPercent, 33); // 1/3 * 100 rounded
        assert.equal(progress.completedNodes, 1);
        assert.equal(progress.totalNodes, 3);
        assert.equal(progress.roadmapId, roadmap.id);
        assert.equal(progress.userId, 'user_123');
        assertISODate(progress.enrolledAt);
        assertISODate(progress.lastAccessedAt);
      });

      it('should return 0% progress for new enrollment', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        
        const progress = domain.getProgress(roadmap.id, 'user_123');
        
        assert.equal(progress.progressPercent, 0);
        assert.equal(progress.completedNodes, 0);
      });

      it('should return 100% when all nodes completed', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        
        domain.updateNodeStatus(roadmap.id, 'user_123', 'node_1', 'completed');
        domain.updateNodeStatus(roadmap.id, 'user_123', 'node_2', 'completed');
        domain.updateNodeStatus(roadmap.id, 'user_123', 'node_3', 'completed');
        
        const progress = domain.getProgress(roadmap.id, 'user_123');
        
        assert.equal(progress.progressPercent, 100);
        assert.equal(progress.completedNodes, 3);
      });

      it('should throw error for non-enrolled user', async () => {
        await assertThrows(
          () => domain.getProgress(roadmap.id, 'not_enrolled'),
          'User not_enrolled is not enrolled in roadmap'
        );
      });

      it('should update lastAccessedAt on progress check', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        
        const before = new Date();
        const progress = domain.getProgress(roadmap.id, 'user_123');
        const after = new Date();
        
        const accessed = new Date(progress.lastAccessedAt);
        assert.ok(accessed >= before && accessed <= after);
      });

      it('should handle roadmap with no nodes', () => {
        const emptyRoadmap = domain.createRoadmap({ title: 'Empty' });
        domain.enrollUser(emptyRoadmap.id, 'user_123');
        
        const progress = domain.getProgress(emptyRoadmap.id, 'user_123');
        
        assert.equal(progress.progressPercent, 0);
        assert.equal(progress.completedNodes, 0);
        assert.equal(progress.totalNodes, 0);
      });
    });

    describe('updateNodeStatus', () => {
      beforeEach(() => {
        domain.enrollUser(roadmap.id, 'user_123');
      });

      it('should update node status to in_progress', () => {
        const enrollment = domain.updateNodeStatus(
          roadmap.id, 
          'user_123', 
          'node_1', 
          'in_progress'
        );
        
        assert.equal(enrollment.nodeStatus.node_1, 'in_progress');
        assertISODate(enrollment.lastAccessedAt);
      });

      it('should update node status to completed', () => {
        const enrollment = domain.updateNodeStatus(
          roadmap.id, 
          'user_123', 
          'node_1', 
          'completed'
        );
        
        assert.equal(enrollment.nodeStatus.node_1, 'completed');
      });

      it('should update node status to not_started', () => {
        // First set to completed
        domain.updateNodeStatus(roadmap.id, 'user_123', 'node_1', 'completed');
        
        // Then back to not_started
        const enrollment = domain.updateNodeStatus(
          roadmap.id, 
          'user_123', 
          'node_1', 
          'not_started'
        );
        
        assert.equal(enrollment.nodeStatus.node_1, 'not_started');
      });

      it('should throw error for invalid status', async () => {
        await assertThrows(
          () => domain.updateNodeStatus(roadmap.id, 'user_123', 'node_1', 'invalid_status'),
          'Invalid status: invalid_status'
        );
      });

      it('should throw error for non-enrolled user', async () => {
        await assertThrows(
          () => domain.updateNodeStatus(roadmap.id, 'not_enrolled', 'node_1', 'completed'),
          'User not_enrolled is not enrolled in roadmap'
        );
      });
    });
  });

  // ============================================================================
  // Scenario 14-16: Personalized Path Recommendations
  // ============================================================================
  describe('Personalize Path', () => {
    let roadmap;

    beforeEach(() => {
      roadmap = domain.createRoadmap({
        title: 'Learning Path',
        nodes: [
          { 
            id: 'foundation', 
            title: 'Foundation', 
            prerequisites: [],
            type: 'lesson',
            estimatedHours: 2
          },
          { 
            id: 'intermediate', 
            title: 'Intermediate', 
            prerequisites: ['foundation'],
            type: 'lesson',
            estimatedHours: 3
          },
          { 
            id: 'advanced', 
            title: 'Advanced', 
            prerequisites: ['intermediate'],
            type: 'lesson',
            estimatedHours: 4
          },
          { 
            id: 'assessment', 
            title: 'Final Assessment', 
            prerequisites: ['advanced'],
            type: 'assessment',
            estimatedHours: 1
          },
          { 
            id: 'project', 
            title: 'Capstone Project', 
            prerequisites: ['advanced'],
            type: 'project',
            estimatedHours: 8
          }
        ]
      });
    });

    describe('recommendNext', () => {
      it('should recommend foundation nodes (no prerequisites)', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        
        const recommendations = domain.recommendNext('user_123', roadmap.id);
        
        assert.equal(recommendations.length, 1);
        assert.equal(recommendations[0].nodeId, 'foundation');
        assert.equal(recommendations[0].priority, 70);
        assert.equal(recommendations[0].reason, 'Foundation node available');
      });

      it('should prioritize in-progress nodes (priority 80)', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        domain.updateNodeStatus(roadmap.id, 'user_123', 'foundation', 'in_progress');
        
        const recommendations = domain.recommendNext('user_123', roadmap.id);
        
        assert.equal(recommendations.length, 1);
        assert.equal(recommendations[0].nodeId, 'foundation');
        assert.equal(recommendations[0].priority, 80);
        assert.equal(recommendations[0].reason, 'Continue in-progress node');
      });

      it('should recommend assessment nodes with priority 60', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        domain.updateNodeStatus(roadmap.id, 'user_123', 'foundation', 'completed');
        domain.updateNodeStatus(roadmap.id, 'user_123', 'intermediate', 'completed');
        domain.updateNodeStatus(roadmap.id, 'user_123', 'advanced', 'completed');
        
        const recommendations = domain.recommendNext('user_123', roadmap.id);
        
        const assessment = recommendations.find(r => r.nodeId === 'assessment');
        assert.ok(assessment);
        assert.equal(assessment.priority, 60);
        assert.equal(assessment.reason, 'Ready for assessment');
      });

      it('should not recommend nodes with unmet prerequisites', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        
        // Only foundation is available (no prereqs)
        const recommendations = domain.recommendNext('user_123', roadmap.id);
        
        const nodeIds = recommendations.map(r => r.nodeId);
        assert.ok(nodeIds.includes('foundation'));
        assert.ok(!nodeIds.includes('intermediate'));
        assert.ok(!nodeIds.includes('advanced'));
        assert.ok(!nodeIds.includes('assessment'));
      });

      it('should unlock dependent nodes when prerequisites met', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        
        // Initially only foundation available
        let recommendations = domain.recommendNext('user_123', roadmap.id);
        assert.equal(recommendations.length, 1);
        assert.equal(recommendations[0].nodeId, 'foundation');
        
        // Complete foundation
        domain.updateNodeStatus(roadmap.id, 'user_123', 'foundation', 'completed');
        
        // Now intermediate should be available
        recommendations = domain.recommendNext('user_123', roadmap.id);
        assert.ok(recommendations.some(r => r.nodeId === 'intermediate'));
      });

      it('should not recommend completed nodes', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        domain.updateNodeStatus(roadmap.id, 'user_123', 'foundation', 'completed');
        domain.updateNodeStatus(roadmap.id, 'user_123', 'intermediate', 'completed');
        
        const recommendations = domain.recommendNext('user_123', roadmap.id);
        
        assert.ok(!recommendations.some(r => r.nodeId === 'foundation'));
        assert.ok(!recommendations.some(r => r.nodeId === 'intermediate'));
        assert.ok(recommendations.some(r => r.nodeId === 'advanced'));
      });

      it('should return empty array for non-enrolled user', () => {
        const recommendations = domain.recommendNext('not_enrolled', roadmap.id);
        assert.deepEqual(recommendations, []);
      });

      it('should return recommendations from all enrolled roadmaps when no roadmapId specified', () => {
        const roadmap2 = domain.createRoadmap({
          title: 'Second Roadmap',
          nodes: [
            { id: 'r2_node1', title: 'R2 Node 1', prerequisites: [] }
          ]
        });
        
        domain.enrollUser(roadmap.id, 'user_123');
        domain.enrollUser(roadmap2.id, 'user_123');
        
        const recommendations = domain.recommendNext('user_123');
        
        // Should have recommendations from both roadmaps
        assert.ok(recommendations.some(r => r.roadmapId === roadmap.id));
        assert.ok(recommendations.some(r => r.roadmapId === roadmap2.id));
      });

      it('should sort recommendations by priority descending', () => {
        const roadmapWithMultiple = domain.createRoadmap({
          title: 'Multi-path',
          nodes: [
            { id: 'a1', title: 'Assessment 1', prerequisites: [], type: 'assessment' },
            { id: 'l1', title: 'Lesson 1', prerequisites: [], type: 'lesson' },
            { id: 'l2', title: 'Lesson 2', prerequisites: [], type: 'lesson' }
          ]
        });
        
        domain.enrollUser(roadmapWithMultiple.id, 'user_123');
        
        // Start one node
        domain.updateNodeStatus(roadmapWithMultiple.id, 'user_123', 'l1', 'in_progress');
        
        const recommendations = domain.recommendNext('user_123', roadmapWithMultiple.id);
        
        // Should have 3 recommendations: l1 (in_progress), a1 (assessment), l2 (available)
        assert.equal(recommendations.length, 3);
        
        // Verify specific priorities exist
        const inProgressRec = recommendations.find(r => r.nodeId === 'l1');
        const assessmentRec = recommendations.find(r => r.nodeId === 'a1');
        const lessonRec = recommendations.find(r => r.nodeId === 'l2');
        
        assert.ok(inProgressRec, 'Should have in_progress recommendation');
        assert.ok(assessmentRec, 'Should have assessment recommendation');
        assert.ok(lessonRec, 'Should have lesson recommendation');
        
        // Verify priorities
        assert.equal(inProgressRec.priority, 80, 'In-progress should have priority 80');
        assert.equal(assessmentRec.priority, 60, 'Assessment should have priority 60');
        assert.equal(lessonRec.priority, 50, 'Available lesson should have priority 50');
        
        // Verify in-progress appears first (highest priority)
        const inProgressIndex = recommendations.findIndex(r => r.nodeId === 'l1');
        assert.equal(inProgressIndex, 0, 'In-progress should be first (highest priority)');
      });

      it('should include recommendation metadata', () => {
        domain.enrollUser(roadmap.id, 'user_123');
        
        const recommendations = domain.recommendNext('user_123', roadmap.id);
        
        assertHasKeys(recommendations[0], ['nodeId', 'roadmapId', 'title', 'reason', 'priority', 'estimatedHours']);
        assert.equal(recommendations[0].roadmapId, roadmap.id);
        assert.equal(recommendations[0].title, 'Foundation');
        assert.equal(recommendations[0].estimatedHours, 2);
        assertInRange(recommendations[0].priority, 0, 100);
      });
    });
  });

  // ============================================================================
  // Scenario 18: User Enrollments Listing
  // ============================================================================
  describe('Enrollment Management', () => {
    describe('getUserEnrollments', () => {
      it('should return all enrollments for a user', () => {
        const roadmap1 = domain.createRoadmap({ 
          title: 'Roadmap 1', 
          category: 'cat1' 
        });
        const roadmap2 = domain.createRoadmap({ 
          title: 'Roadmap 2', 
          category: 'cat2' 
        });
        
        domain.enrollUser(roadmap1.id, 'user_123');
        domain.enrollUser(roadmap2.id, 'user_123');
        
        const enrollments = domain.getUserEnrollments('user_123');
        
        assert.equal(enrollments.length, 2);
        assert.ok(enrollments.some(e => e.roadmapTitle === 'Roadmap 1'));
        assert.ok(enrollments.some(e => e.roadmapTitle === 'Roadmap 2'));
      });

      it('should include roadmap metadata in enrollments', () => {
        const roadmap = domain.createRoadmap({ 
          title: 'Test Roadmap', 
          category: 'programming' 
        });
        domain.enrollUser(roadmap.id, 'user_123');
        
        const enrollments = domain.getUserEnrollments('user_123');
        
        assert.equal(enrollments.length, 1);
        assert.equal(enrollments[0].roadmapTitle, 'Test Roadmap');
        assert.equal(enrollments[0].roadmapCategory, 'programming');
        assert.equal(enrollments[0].userId, 'user_123');
        assert.equal(enrollments[0].roadmapId, roadmap.id);
      });

      it('should include progress information', () => {
        const roadmap = domain.createRoadmap({
          title: 'Test',
          nodes: [{ id: 'n1', title: 'Node 1' }]
        });
        domain.enrollUser(roadmap.id, 'user_123');
        domain.updateNodeStatus(roadmap.id, 'user_123', 'n1', 'completed');
        
        // getUserEnrollments returns raw enrollment data
        const enrollments = domain.getUserEnrollments('user_123');
        
        // Verify enrollment structure and node status
        assert.ok(enrollments[0].nodeStatus);
        assert.equal(enrollments[0].nodeStatus.n1, 'completed');
        assert.equal(enrollments[0].roadmapTitle, 'Test');
        
        // Progress calculation is done in getProgress, verify it separately
        const progress = domain.getProgress(roadmap.id, 'user_123');
        assert.equal(progress.progressPercent, 100);
      });

      it('should return empty array for user with no enrollments', () => {
        const enrollments = domain.getUserEnrollments('no_enrollments');
        assert.deepEqual(enrollments, []);
      });

      it('should only return enrollments for specified user', () => {
        const roadmap = domain.createRoadmap({ title: 'Test' });
        domain.enrollUser(roadmap.id, 'user_1');
        domain.enrollUser(roadmap.id, 'user_2');
        
        const enrollments = domain.getUserEnrollments('user_1');
        
        assert.equal(enrollments.length, 1);
        assert.equal(enrollments[0].userId, 'user_1');
      });

      it('should exclude enrollments for deleted roadmaps', () => {
        const roadmap = domain.createRoadmap({ title: 'To Delete' });
        domain.enrollUser(roadmap.id, 'user_123');
        
        // Verify enrollment exists
        assert.equal(domain.getUserEnrollments('user_123').length, 1);
        
        // Delete roadmap
        domain.deleteRoadmap(roadmap.id);
        
        // Enrollment should not be listed
        const enrollments = domain.getUserEnrollments('user_123');
        assert.equal(enrollments.length, 0);
      });
    });
  });

  // ============================================================================
  // Business Logic Validation
  // ============================================================================
  describe('Business Logic', () => {
    it('should maintain data isolation between users', () => {
      const roadmap = domain.createRoadmap({
        title: 'Test',
        nodes: [{ id: 'n1', title: 'Node 1' }]
      });
      
      domain.enrollUser(roadmap.id, 'user_1');
      domain.enrollUser(roadmap.id, 'user_2');
      
      // User 1 completes node
      domain.updateNodeStatus(roadmap.id, 'user_1', 'n1', 'completed');
      
      // User 2 should still have not_started
      const user2Progress = domain.getProgress(roadmap.id, 'user_2');
      assert.equal(user2Progress.nodeStatus.n1, 'not_started');
      
      // User 1 should have completed
      const user1Progress = domain.getProgress(roadmap.id, 'user_1');
      assert.equal(user1Progress.nodeStatus.n1, 'completed');
    });

    it('should handle complex prerequisite chains', () => {
      const roadmap = domain.createRoadmap({
        title: 'Complex Chain',
        nodes: [
          { id: 'a', title: 'A', prerequisites: [] },
          { id: 'b', title: 'B', prerequisites: ['a'] },
          { id: 'c', title: 'C', prerequisites: ['b'] },
          { id: 'd', title: 'D', prerequisites: ['a', 'b', 'c'] }
        ]
      });
      
      domain.enrollUser(roadmap.id, 'user_123');
      
      // Initially only A available
      let recs = domain.recommendNext('user_123', roadmap.id);
      assert.deepEqual(recs.map(r => r.nodeId), ['a']);
      
      // Complete A -> B available
      domain.updateNodeStatus(roadmap.id, 'user_123', 'a', 'completed');
      recs = domain.recommendNext('user_123', roadmap.id);
      assert.deepEqual(recs.map(r => r.nodeId), ['b']);
      
      // Complete B -> C available
      domain.updateNodeStatus(roadmap.id, 'user_123', 'b', 'completed');
      recs = domain.recommendNext('user_123', roadmap.id);
      assert.ok(recs.some(r => r.nodeId === 'c'));
      assert.ok(!recs.some(r => r.nodeId === 'd')); // Still needs C
      
      // Complete C -> D available
      domain.updateNodeStatus(roadmap.id, 'user_123', 'c', 'completed');
      recs = domain.recommendNext('user_123', roadmap.id);
      assert.ok(recs.some(r => r.nodeId === 'd'));
    });

    it('should handle concurrent enrollments correctly', () => {
      const roadmap = domain.createRoadmap({
        title: 'Popular Course',
        nodes: [
          { id: 'n1', title: 'Node 1' },
          { id: 'n2', title: 'Node 2' }
        ]
      });
      
      const users = ['user_1', 'user_2', 'user_3', 'user_4', 'user_5'];
      
      // All users enroll
      users.forEach(userId => {
        domain.enrollUser(roadmap.id, userId);
      });
      
      // Each user should have independent enrollment
      users.forEach(userId => {
        const progress = domain.getProgress(roadmap.id, userId);
        assert.equal(progress.userId, userId);
        assert.equal(progress.progressPercent, 0);
      });
      
      // Verify all enrollments are tracked
      assert.equal(domain.getUserEnrollments('user_1').length, 1);
    });

    it('should calculate progress correctly with partial completions', () => {
      const roadmap = domain.createRoadmap({
        title: 'Progress Test',
        nodes: [
          { id: 'n1', title: 'Node 1' },
          { id: 'n2', title: 'Node 2' },
          { id: 'n3', title: 'Node 3' }
        ]
      });
      
      domain.enrollUser(roadmap.id, 'user_123');
      
      // 0/3 = 0%
      let progress = domain.getProgress(roadmap.id, 'user_123');
      assert.equal(progress.progressPercent, 0);
      
      // 1/3 = 33%
      domain.updateNodeStatus(roadmap.id, 'user_123', 'n1', 'completed');
      progress = domain.getProgress(roadmap.id, 'user_123');
      assert.equal(progress.progressPercent, 33);
      
      // 2/3 = 67%
      domain.updateNodeStatus(roadmap.id, 'user_123', 'n2', 'completed');
      progress = domain.getProgress(roadmap.id, 'user_123');
      assert.equal(progress.progressPercent, 67);
      
      // 3/3 = 100%
      domain.updateNodeStatus(roadmap.id, 'user_123', 'n3', 'completed');
      progress = domain.getProgress(roadmap.id, 'user_123');
      assert.equal(progress.progressPercent, 100);
    });

    it('should handle in-progress status in recommendations correctly', () => {
      const roadmap = domain.createRoadmap({
        title: 'Multi-branch',
        nodes: [
          { id: 'root', title: 'Root', prerequisites: [] },
          { id: 'branch_a', title: 'Branch A', prerequisites: ['root'] },
          { id: 'branch_b', title: 'Branch B', prerequisites: ['root'] },
          { id: 'branch_c', title: 'Branch C', prerequisites: ['root'] }
        ]
      });
      
      domain.enrollUser(roadmap.id, 'user_123');
      domain.updateNodeStatus(roadmap.id, 'user_123', 'root', 'completed');
      domain.updateNodeStatus(roadmap.id, 'user_123', 'branch_a', 'in_progress');
      
      const recs = domain.recommendNext('user_123', roadmap.id);
      
      // Should recommend in-progress first, then available branches
      assert.equal(recs[0].nodeId, 'branch_a');
      assert.equal(recs[0].priority, 80);
      
      // Other branches should be at priority 50
      const otherBranches = recs.filter(r => r.nodeId !== 'branch_a');
      assert.ok(otherBranches.every(r => r.priority === 50));
    });
  });
});
