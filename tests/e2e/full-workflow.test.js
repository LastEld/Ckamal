/**
 * @fileoverview End-to-end tests for complete user workflows
 * Tests full user journeys from start to finish
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from '../helpers/test-server.js';
import { createTestClient, createWebSocketClient } from '../helpers/test-client.js';

describe('Full Workflow E2E Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = await startTestServer({
      port: 0,
      enableWebSocket: true,
      environment: 'test',
      seedData: true
    });
    baseUrl = `http://localhost:${server.port}`;
  });

  after(async () => {
    await stopTestServer(server);
  });

  describe('CV Management Workflow', () => {
    it('should complete full CV lifecycle: create → update → publish → archive', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      const ws = createWebSocketClient(`ws://localhost:${server.port}/ws`);
      
      const events = [];
      ws.on('message', (data) => events.push(JSON.parse(data.toString())));
      await new Promise(r => ws.on('open', r));

      // Step 1: Create CV
      const createRes = await client.post('/api/v1/cvs', {
        name: 'John Developer',
        version: '1.0.0',
        email: 'john@example.com',
        phone: '+1234567890',
        summary: 'Full-stack developer with 5 years experience',
        skills: ['JavaScript', 'Node.js', 'React', 'Python'],
        experience: [
          {
            company: 'TechCorp',
            role: 'Senior Developer',
            startDate: '2020-01-01',
            endDate: null,
            description: 'Leading frontend development'
          }
        ],
        education: [
          {
            institution: 'Tech University',
            degree: 'BS Computer Science',
            graduationYear: 2019
          }
        ]
      });
      
      assert.equal(createRes.status, 201);
      const cvId = createRes.data.id;
      console.log(`  ✓ CV created: ${cvId}`);

      // Step 2: Update CV with new experience
      const updateRes = await client.put(`/api/v1/cvs/${cvId}`, {
        experience: [
          ...createRes.data.experience,
          {
            company: 'StartupXYZ',
            role: 'Junior Developer',
            startDate: '2019-06-01',
            endDate: '2019-12-31',
            description: 'Full-stack development'
          }
        ],
        version: '1.1.0'
      });
      
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.experience.length, 2);
      console.log('  ✓ CV updated with new experience');

      // Step 3: Add certifications
      const certRes = await client.post(`/api/v1/cvs/${cvId}/certifications`, {
        name: 'AWS Solutions Architect',
        issuer: 'Amazon',
        date: '2023-01-01',
        expiry: '2026-01-01'
      });
      
      assert.equal(certRes.status, 201);
      console.log('  ✓ Certification added');

      // Step 4: Generate PDF
      const pdfRes = await client.post(`/api/v1/cvs/${cvId}/export`, {
        format: 'pdf',
        template: 'modern'
      });
      
      assert.equal(pdfRes.status, 200);
      assert.ok(pdfRes.data.downloadUrl);
      console.log('  ✓ PDF generated');

      // Step 5: Publish CV
      const publishRes = await client.post(`/api/v1/cvs/${cvId}/publish`, {
        visibility: 'public',
        allowSearch: true
      });
      
      assert.equal(publishRes.status, 200);
      assert.equal(publishRes.data.status, 'published');
      assert.ok(publishRes.data.publicUrl);
      console.log('  ✓ CV published');

      // Step 6: View analytics
      const analyticsRes = await client.get(`/api/v1/cvs/${cvId}/analytics`);
      
      assert.equal(analyticsRes.status, 200);
      assert.ok(typeof analyticsRes.data.views === 'number');
      console.log('  ✓ Analytics retrieved');

      // Step 7: Archive CV
      const archiveRes = await client.post(`/api/v1/cvs/${cvId}/archive`, {
        reason: 'Found new position'
      });
      
      assert.equal(archiveRes.status, 200);
      assert.equal(archiveRes.data.status, 'archived');
      console.log('  ✓ CV archived');

      // Verify WebSocket events were received
      await new Promise(r => setTimeout(r, 500));
      ws.close();
      
      assert.ok(events.some(e => e.event === 'cv:created'));
      assert.ok(events.some(e => e.event === 'cv:updated'));
      assert.ok(events.some(e => e.event === 'cv:published'));
    });

    it('should handle bulk CV operations', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      const cvsToCreate = 5;

      // Step 1: Bulk import CVs
      const importData = Array.from({ length: cvsToCreate }, (_, i) => ({
        name: `Developer ${i + 1}`,
        version: '1.0.0',
        email: `dev${i + 1}@example.com`,
        skills: ['JavaScript', 'Node.js'],
        experience: [
          {
            company: `Company ${i + 1}`,
            role: 'Developer',
            years: 2 + i
          }
        ]
      }));

      const importRes = await client.post('/api/v1/cvs/bulk-import', {
        cvs: importData
      });

      assert.equal(importRes.status, 200);
      assert.equal(importRes.data.imported, cvsToCreate);
      console.log(`  ✓ Bulk imported ${cvsToCreate} CVs`);

      // Step 2: Bulk update
      const cvIds = importRes.data.ids;
      const bulkUpdateRes = await client.post('/api/v1/cvs/bulk-update', {
        ids: cvIds,
        updates: {
          addSkill: 'TypeScript'
        }
      });

      assert.equal(bulkUpdateRes.status, 200);
      assert.equal(bulkUpdateRes.data.updated, cvsToCreate);
      console.log('  ✓ Bulk update completed');

      // Step 3: Search and filter
      const searchRes = await client.get('/api/v1/cvs?skills=TypeScript&minExperience=3');

      assert.equal(searchRes.status, 200);
      // Should find at least some CVs matching criteria
      console.log(`  ✓ Search found ${searchRes.data.items.length} matching CVs`);

      // Step 4: Bulk export
      const exportRes = await client.post('/api/v1/cvs/bulk-export', {
        ids: cvIds,
        format: 'json'
      });

      assert.equal(exportRes.status, 200);
      assert.ok(exportRes.data.downloadUrl);
      console.log('  ✓ Bulk export generated');

      // Step 5: Bulk delete
      const deleteRes = await client.post('/api/v1/cvs/bulk-delete', {
        ids: cvIds
      });

      assert.equal(deleteRes.status, 200);
      assert.equal(deleteRes.data.deleted, cvsToCreate);
      console.log('  ✓ Bulk delete completed');
    });
  });

  describe('Task Processing Workflow', () => {
    it('should process complex multi-stage task', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      const ws = createWebSocketClient(`ws://localhost:${server.port}/ws`);

      const taskEvents = [];
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.channel === 'tasks') taskEvents.push(msg);
      });
      await new Promise(r => ws.on('open', r));

      // Step 1: Submit analysis task
      const taskRes = await client.post('/api/v1/tasks', {
        type: 'cv-analysis',
        priority: 8,
        payload: {
          cvId: 'test-cv-001',
          analysisType: 'skill-gap',
          targetRole: 'Senior Developer'
        }
      });

      assert.equal(taskRes.status, 201);
      const taskId = taskRes.data.taskId;
      console.log(`  ✓ Task submitted: ${taskId}`);

      // Step 2: Monitor task progress
      let completed = false;
      const maxAttempts = 30;
      
      for (let i = 0; i < maxAttempts && !completed; i++) {
        await new Promise(r => setTimeout(r, 500));
        const statusRes = await client.get(`/api/v1/tasks/${taskId}`);
        
        if (statusRes.data.status === 'completed') {
          completed = true;
          console.log('  ✓ Task completed');
          
          // Verify results
          assert.ok(statusRes.data.result);
          assert.ok(statusRes.data.result.analysis);
          assert.ok(statusRes.data.executionTime > 0);
        } else if (statusRes.data.status === 'failed') {
          throw new Error(`Task failed: ${statusRes.data.error}`);
        }
      }

      assert.ok(completed, 'Task should complete within timeout');

      // Step 3: Retrieve analysis results
      const resultsRes = await client.get(`/api/v1/tasks/${taskId}/results`);
      
      assert.equal(resultsRes.status, 200);
      assert.ok(resultsRes.data.skillGaps);
      assert.ok(resultsRes.data.recommendations);
      console.log('  ✓ Results retrieved');

      ws.close();
    });

    it('should handle workflow with conditional branches', async () => {
      // Arrange
      const client = createTestClient(baseUrl);

      // Define workflow with conditions
      const workflow = {
        name: 'conditional-processing',
        stages: [
          {
            name: 'validate',
            type: 'task',
            taskType: 'validation'
          },
          {
            name: 'decision',
            type: 'condition',
            condition: 'context.validationScore > 0.8',
            trueBranch: ['enhance'],
            falseBranch: ['manual-review']
          },
          {
            name: 'enhance',
            type: 'task',
            taskType: 'enhancement'
          },
          {
            name: 'manual-review',
            type: 'task',
            taskType: 'review',
            assignee: 'reviewer@example.com'
          },
          {
            name: 'finalize',
            type: 'task',
            taskType: 'completion'
          }
        ]
      };

      // Step 1: Start workflow
      const startRes = await client.post('/api/v1/workflows', workflow);
      
      assert.equal(startRes.status, 201);
      const workflowId = startRes.data.workflowId;
      console.log(`  ✓ Workflow started: ${workflowId}`);

      // Step 2: Monitor workflow execution
      let finalStatus = null;
      const maxAttempts = 60;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const statusRes = await client.get(`/api/v1/workflows/${workflowId}`);
        
        finalStatus = statusRes.data;
        
        if (['completed', 'failed', 'waiting'].includes(finalStatus.status)) {
          break;
        }
      }

      // Step 3: Verify workflow completed through correct path
      assert.ok(finalStatus.status === 'completed' || finalStatus.status === 'waiting');
      console.log(`  ✓ Workflow finished with status: ${finalStatus.status}`);
      
      // Verify stage execution
      const stages = finalStatus.stages;
      assert.ok(stages.validate.status === 'completed');
      
      // Check which branch was taken
      if (stages.enhance?.status === 'completed') {
        console.log('  ✓ High-score path taken (enhance → finalize)');
      } else if (stages['manual-review']?.status === 'completed' || 
                 stages['manual-review']?.status === 'waiting') {
        console.log('  ✓ Review path taken (manual-review)');
      }
    });
  });

  describe('Real-time Collaboration Workflow', () => {
    it('should support multiple users editing CV simultaneously', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      
      // Create initial CV
      const createRes = await client.post('/api/v1/cvs', {
        name: 'Collaborative CV',
        version: '1.0.0',
        skills: ['JavaScript']
      });
      const cvId = createRes.data.id;

      // Multiple users connect via WebSocket
      const users = ['Alice', 'Bob', 'Charlie'].map(name => ({
        name,
        ws: createWebSocketClient(`ws://localhost:${server.port}/ws`),
        events: []
      }));

      // Connect all users
      await Promise.all(users.map(user => 
        new Promise((resolve, reject) => {
          user.ws.on('open', () => {
            user.ws.send(JSON.stringify({
              type: 'join',
              document: cvId,
              user: user.name
            }));
            resolve();
          });
          user.ws.on('error', reject);
        })
      ));

      // Subscribe to document changes
      users.forEach(user => {
        user.ws.on('message', (data) => {
          user.events.push(JSON.parse(data.toString()));
        });
      });

      // Step 1: Alice adds a skill
      await client.put(`/api/v1/cvs/${cvId}`, {
        skills: ['JavaScript', 'TypeScript'],
        _editedBy: 'Alice'
      });

      await new Promise(r => setTimeout(r, 500));

      // Step 2: Bob updates experience
      await client.put(`/api/v1/cvs/${cvId}`, {
        experience: [{
          company: 'NewCorp',
          role: 'Developer',
          years: 3
        }],
        _editedBy: 'Bob'
      });

      await new Promise(r => setTimeout(r, 500));

      // Step 3: Charlie adds certification
      await client.post(`/api/v1/cvs/${cvId}/certifications`, {
        name: 'AWS Developer',
        _addedBy: 'Charlie'
      });

      await new Promise(r => setTimeout(r, 500));

      // Verify all users received all updates
      users.forEach(user => {
        const cvEvents = user.events.filter(e => e.type === 'cv:updated');
        assert.ok(cvEvents.length >= 2, `${user.name} should receive updates`);
      });

      // Cleanup
      users.forEach(user => user.ws.close());
      console.log('  ✓ All users received real-time updates');
    });
  });

  describe('Error Recovery Workflow', () => {
    it('should recover from and retry failed operations', async () => {
      // Arrange
      const client = createTestClient(baseUrl);

      // Step 1: Submit task that will fail initially
      const taskRes = await client.post('/api/v1/tasks', {
        type: 'flaky-operation',
        payload: {
          failCount: 2, // Fail first 2 attempts
          successOnRetry: 3
        },
        retryPolicy: {
          maxRetries: 3,
          backoff: 'exponential'
        }
      });

      const taskId = taskRes.data.taskId;

      // Step 2: Wait for completion with retries
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000));
        const statusRes = await client.get(`/api/v1/tasks/${taskId}`);
        
        if (statusRes.data.status === 'completed') {
          console.log(`  ✓ Task completed after ${statusRes.data.retryCount} retries`);
          assert.ok(statusRes.data.retryCount > 0);
          break;
        } else if (statusRes.data.status === 'failed') {
          throw new Error('Task failed permanently');
        }
        
        attempts++;
      }
    });

    it('should handle cascading failures gracefully', async () => {
      // Arrange
      const client = createTestClient(baseUrl);

      const workflow = {
        name: 'failure-cascade-test',
        stages: [
          { name: 'stage1', type: 'task', taskType: 'reliable' },
          { name: 'stage2', type: 'task', taskType: 'failing' },
          { name: 'stage3', type: 'task', taskType: 'compensation' }
        ],
        onStageFailure: {
          action: 'compensate',
          compensationStage: 'stage3'
        }
      };

      // Start workflow
      const startRes = await client.post('/api/v1/workflows', workflow);
      const workflowId = startRes.data.workflowId;

      // Wait for completion
      await new Promise(r => setTimeout(r, 3000));

      const statusRes = await client.get(`/api/v1/workflows/${workflowId}`);
      
      // Assert compensation was triggered
      assert.ok(statusRes.data.stages.stage3?.status === 'completed');
      assert.ok(statusRes.data.compensationTriggered);
      console.log('  ✓ Compensation workflow executed successfully');
    });
  });

  describe('Performance Workflow', () => {
    it('should handle high-throughput CV processing', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      const numCVs = 100;

      // Step 1: Bulk create CVs
      const startTime = Date.now();
      
      const createPromises = Array.from({ length: numCVs }, (_, i) =>
        client.post('/api/v1/cvs', {
          name: `Performance Test ${i}`,
          version: '1.0.0',
          skills: ['JavaScript', 'Node.js']
        })
      );

      const results = await Promise.all(createPromises);
      const createTime = Date.now() - startTime;

      assert.ok(results.every(r => r.status === 201));
      console.log(`  ✓ Created ${numCVs} CVs in ${createTime}ms`);

      // Step 2: Concurrent searches
      const searchStart = Date.now();
      
      const searchPromises = Array.from({ length: 20 }, () =>
        client.get('/api/v1/cvs?skills=JavaScript&limit=50')
      );

      const searchResults = await Promise.all(searchPromises);
      const searchTime = Date.now() - searchStart;

      assert.ok(searchResults.every(r => r.status === 200));
      console.log(`  ✓ Executed 20 concurrent searches in ${searchTime}ms`);

      // Assert reasonable performance
      assert.ok(createTime < 30000, 'Bulk create should complete within 30s');
      assert.ok(searchTime < 5000, 'Searches should complete within 5s');
    });
  });
});
