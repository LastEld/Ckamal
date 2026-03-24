/**
 * @fileoverview Integration tests for REST API endpoints
 * Tests HTTP request/response cycles with actual server
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from '../helpers/test-server.js';
import { createTestClient } from '../helpers/test-client.js';

describe('API Integration Tests', () => {
  let server;
  let client;
  let baseUrl;

  before(async () => {
    server = await startTestServer({
      port: 0, // Random available port
      environment: 'test'
    });
    baseUrl = `http://localhost:${server.port}`;
    client = createTestClient(baseUrl);
  });

  after(async () => {
    await stopTestServer(server);
  });

  describe('Health Endpoints', () => {
    it('GET /health should return system status', async () => {
      // Act
      const response = await client.get('/health');

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.status, 'healthy');
      assert.ok(response.data.timestamp);
      assert.ok(response.data.version);
    });

    it('GET /health/ready should return readiness status', async () => {
      // Act
      const response = await client.get('/health/ready');

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.ready, true);
      assert.ok(Array.isArray(response.data.checks));
    });

    it('GET /health/live should return liveness status', async () => {
      // Act
      const response = await client.get('/health/live');

      // Assert
      assert.equal(response.status, 200);
      assert.equal(response.data.alive, true);
    });
  });

  describe('CV Registry Endpoints', () => {
    describe('POST /api/v1/cvs', () => {
      it('should create a new CV', async () => {
        // Arrange
        const cvData = {
          name: 'Test Developer',
          version: '1.0.0',
          skills: ['javascript', 'nodejs'],
          experience: [
            { company: 'TestCo', role: 'Developer', years: 2 }
          ]
        };

        // Act
        const response = await client.post('/api/v1/cvs', cvData);

        // Assert
        assert.equal(response.status, 201);
        assert.ok(response.data.id);
        assert.equal(response.data.name, cvData.name);
        assert.equal(response.data.status, 'created');
      });

      it('should reject invalid CV data', async () => {
        // Arrange
        const invalidData = {
          name: '', // empty name
          skills: 'not-an-array'
        };

        // Act
        const response = await client.post('/api/v1/cvs', invalidData);

        // Assert
        assert.equal(response.status, 400);
        assert.ok(response.data.errors);
        assert.ok(response.data.errors.length > 0);
      });

      it('should reject duplicate CV registration', async () => {
        // Arrange
        const cvData = {
          id: 'duplicate-test-cv',
          name: 'Duplicate Test',
          version: '1.0.0'
        };

        // Create first
        await client.post('/api/v1/cvs', cvData);

        // Act - Try to create again
        const response = await client.post('/api/v1/cvs', cvData);

        // Assert
        assert.equal(response.status, 409);
        assert.ok(response.data.message.includes('already exists'));
      });
    });

    describe('GET /api/v1/cvs', () => {
      it('should list all CVs with pagination', async () => {
        // Act
        const response = await client.get('/api/v1/cvs?page=1&limit=10');

        // Assert
        assert.equal(response.status, 200);
        assert.ok(Array.isArray(response.data.items));
        assert.ok(response.data.pagination);
        assert.equal(typeof response.data.total, 'number');
      });

      it('should filter CVs by skill', async () => {
        // Arrange - Create CVs with specific skills
        await client.post('/api/v1/cvs', {
          name: 'JS Dev',
          version: '1.0.0',
          skills: ['javascript']
        });

        // Act
        const response = await client.get('/api/v1/cvs?skill=javascript');

        // Assert
        assert.equal(response.status, 200);
        assert.ok(response.data.items.every(cv => 
          cv.skills.includes('javascript')
        ));
      });

      it('should search CVs by query', async () => {
        // Act
        const response = await client.get('/api/v1/cvs?query=developer');

        // Assert
        assert.equal(response.status, 200);
        // Results should match search criteria
      });
    });

    describe('GET /api/v1/cvs/:id', () => {
      it('should retrieve a specific CV', async () => {
        // Arrange
        const createRes = await client.post('/api/v1/cvs', {
          name: 'Retrievable CV',
          version: '1.0.0'
        });
        const cvId = createRes.data.id;

        // Act
        const response = await client.get(`/api/v1/cvs/${cvId}`);

        // Assert
        assert.equal(response.status, 200);
        assert.equal(response.data.id, cvId);
        assert.equal(response.data.name, 'Retrievable CV');
      });

      it('should return 404 for non-existent CV', async () => {
        // Act
        const response = await client.get('/api/v1/cvs/non-existent-id');

        // Assert
        assert.equal(response.status, 404);
        assert.ok(response.data.message.includes('not found'));
      });

      it('should retrieve specific version', async () => {
        // Arrange
        const createRes = await client.post('/api/v1/cvs', {
          id: 'versioned-cv',
          name: 'Versioned',
          version: '1.0.0'
        });

        // Act
        const response = await client.get('/api/v1/cvs/versioned-cv?version=1.0.0');

        // Assert
        assert.equal(response.status, 200);
        assert.equal(response.data.version, '1.0.0');
      });
    });

    describe('PUT /api/v1/cvs/:id', () => {
      it('should update CV fields', async () => {
        // Arrange
        const createRes = await client.post('/api/v1/cvs', {
          name: 'Original Name',
          version: '1.0.0'
        });
        const cvId = createRes.data.id;

        // Act
        const response = await client.put(`/api/v1/cvs/${cvId}`, {
          name: 'Updated Name'
        });

        // Assert
        assert.equal(response.status, 200);
        assert.equal(response.data.name, 'Updated Name');
      });

      it('should prevent updating immutable fields', async () => {
        // Arrange
        const createRes = await client.post('/api/v1/cvs', {
          name: 'Test',
          version: '1.0.0'
        });
        const cvId = createRes.data.id;

        // Act
        const response = await client.put(`/api/v1/cvs/${cvId}`, {
          id: 'new-id' // immutable
        });

        // Assert
        assert.equal(response.status, 400);
        assert.ok(response.data.message.includes('immutable'));
      });
    });

    describe('DELETE /api/v1/cvs/:id', () => {
      it('should soft delete CV', async () => {
        // Arrange
        const createRes = await client.post('/api/v1/cvs', {
          name: 'To Delete',
          version: '1.0.0'
        });
        const cvId = createRes.data.id;

        // Act
        const response = await client.delete(`/api/v1/cvs/${cvId}`);

        // Assert
        assert.equal(response.status, 200);
        assert.equal(response.data.status, 'deleted');

        // Verify it's soft deleted (not retrievable by default)
        const getRes = await client.get(`/api/v1/cvs/${cvId}`);
        assert.equal(getRes.status, 404);
      });

      it('should hard delete CV with force flag', async () => {
        // Arrange
        const createRes = await client.post('/api/v1/cvs', {
          name: 'To Force Delete',
          version: '1.0.0'
        });
        const cvId = createRes.data.id;

        // Act
        const response = await client.delete(`/api/v1/cvs/${cvId}?force=true`);

        // Assert
        assert.equal(response.status, 204);
      });
    });
  });

  describe('Orchestrator Endpoints', () => {
    describe('POST /api/v1/tasks', () => {
      it('should schedule a new task', async () => {
        // Arrange
        const task = {
          type: 'analysis',
          priority: 5,
          payload: { data: 'test' }
        };

        // Act
        const response = await client.post('/api/v1/tasks', task);

        // Assert
        assert.equal(response.status, 201);
        assert.ok(response.data.taskId);
        assert.equal(response.data.status, 'scheduled');
      });

      it('should reject tasks with invalid priority', async () => {
        // Arrange
        const task = {
          type: 'analysis',
          priority: 100 // invalid: > 10
        };

        // Act
        const response = await client.post('/api/v1/tasks', task);

        // Assert
        assert.equal(response.status, 400);
        assert.ok(response.data.errors.includes('priority'));
      });
    });

    describe('GET /api/v1/tasks/:id', () => {
      it('should get task status', async () => {
        // Arrange
        const createRes = await client.post('/api/v1/tasks', {
          type: 'test',
          priority: 5
        });
        const taskId = createRes.data.taskId;

        // Act
        const response = await client.get(`/api/v1/tasks/${taskId}`);

        // Assert
        assert.equal(response.status, 200);
        assert.equal(response.data.id, taskId);
        assert.ok(response.data.status);
      });
    });

    describe('POST /api/v1/workflows', () => {
      it('should start a new workflow', async () => {
        // Arrange
        const workflow = {
          name: 'test-workflow',
          stages: [
            { name: 'stage1', type: 'task' },
            { name: 'stage2', type: 'task' }
          ]
        };

        // Act
        const response = await client.post('/api/v1/workflows', workflow);

        // Assert
        assert.equal(response.status, 201);
        assert.ok(response.data.workflowId);
        assert.equal(response.data.status, 'started');
      });

      it('should get workflow status', async () => {
        // Arrange
        const createRes = await client.post('/api/v1/workflows', {
          name: 'status-test',
          stages: [{ name: 's1', type: 'noop' }]
        });
        const workflowId = createRes.data.workflowId;

        // Act
        const response = await client.get(`/api/v1/workflows/${workflowId}`);

        // Assert
        assert.equal(response.status, 200);
        assert.ok(response.data.stages);
      });
    });
  });

  describe('Authentication & Security', () => {
    it('should reject requests without auth token', async () => {
      // Act
      const response = await client.get('/api/v1/admin/config', {
        headers: {} // no auth
      });

      // Assert
      assert.equal(response.status, 401);
    });

    it('should reject invalid auth tokens', async () => {
      // Act
      const response = await client.get('/api/v1/admin/config', {
        headers: { 'Authorization': 'Bearer invalid-token' }
      });

      // Assert
      assert.equal(response.status, 401);
    });

    it('should accept valid auth tokens', async () => {
      // Arrange - Get valid token
      const authRes = await client.post('/api/v1/auth/login', {
        username: 'test-user',
        password: 'test-pass'
      });
      const token = authRes.data.token;

      // Act
      const response = await client.get('/api/v1/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Assert
      assert.equal(response.status, 200);
    });

    it('should enforce rate limiting', async () => {
      // Arrange
      const requests = Array.from({ length: 110 }, () => 
        client.get('/health')
      );

      // Act
      const responses = await Promise.all(requests);

      // Assert - Some should be rate limited
      const rateLimited = responses.filter(r => r.status === 429);
      assert.ok(rateLimited.length > 0, 'Expected some requests to be rate limited');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      // Act
      const response = await client.get('/api/v1/unknown-endpoint');

      // Assert
      assert.equal(response.status, 404);
      assert.ok(response.data.message);
    });

    it('should return 405 for wrong HTTP method', async () => {
      // Act
      const response = await client.patch('/api/v1/cvs');

      // Assert
      assert.equal(response.status, 405);
    });

    it('should handle server errors gracefully', async () => {
      // Act - Trigger an error condition
      const response = await client.get('/api/v1/error-test');

      // Assert
      assert.equal(response.status, 500);
      assert.ok(response.data.message);
      assert.ok(!response.data.stack); // No stack in production
    });

    it('should validate content-type', async () => {
      // Act
      const response = await client.post('/api/v1/cvs', 'invalid json', {
        headers: { 'Content-Type': 'application/json' }
      });

      // Assert
      assert.equal(response.status, 400);
      assert.ok(response.data.message.includes('JSON'));
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include security headers', async () => {
      // Act
      const response = await client.get('/health');

      // Assert
      assert.ok(response.headers['x-content-type-options']);
      assert.ok(response.headers['x-frame-options']);
      assert.ok(response.headers['content-security-policy']);
    });

    it('should handle CORS preflight', async () => {
      // Act
      const response = await client.options('/api/v1/cvs', {
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST'
        }
      });

      // Assert
      assert.equal(response.status, 204);
      assert.ok(response.headers['access-control-allow-origin']);
    });
  });
});
