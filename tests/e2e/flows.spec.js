/**
 * @fileoverview Honest dashboard HTTP E2E flow tests.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DashboardServer } from '../../src/dashboard/server.js';

describe('E2E Dashboard Flows', () => {
  /** @type {DashboardServer} */
  let server;
  /** @type {string} */
  let baseUrl;
  /** @type {string} */
  let authToken;

  before(async () => {
    server = new DashboardServer({
      port: 0,
      host: '127.0.0.1',
      jwtSecret: 'e2e-secret'
    });

    await server.start();

    const address = server.server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    });

    assert.equal(loginResponse.ok, true);

    const loginPayload = await loginResponse.json();
    authToken = loginPayload.token;
    assert.ok(authToken);
  });

  after(async () => {
    await server.stop();
  });

  it('authenticates against the real dashboard auth routes', async () => {
    const verifyResponse = await fetch(`${baseUrl}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    assert.equal(verifyResponse.ok, true);

    const verifyPayload = await verifyResponse.json();
    assert.equal(verifyPayload.valid, true);
    assert.equal(verifyPayload.user.username, 'admin');
    assert.equal(verifyPayload.user.role, 'admin');
  });

  it('creates, updates, lists, batches, and organizes tasks through the real dashboard API', async () => {
    const createResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'E2E Test Task',
        priority: 'high',
        urgent: true,
        important: true
      })
    });

    assert.equal(createResponse.status, 201);
    const createdTask = await createResponse.json();
    assert.ok(createdTask.id);
    assert.equal(createdTask.title, 'E2E Test Task');
    assert.equal(createdTask.quadrant, 'urgent-important');

    const patchResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'in_progress' })
    });

    assert.equal(patchResponse.ok, true);
    const patchedTask = await patchResponse.json();
    assert.equal(patchedTask.status, 'in_progress');

    const getResponse = await fetch(`${baseUrl}/api/tasks/${createdTask.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.equal(getResponse.ok, true);
    const fetchedTask = await getResponse.json();
    assert.equal(fetchedTask.id, createdTask.id);
    assert.equal(fetchedTask.status, 'in_progress');

    const batchTasks = [];
    for (const title of ['Batch Task 1', 'Batch Task 2']) {
      const response = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          priority: 'medium',
          urgent: false,
          important: true
        })
      });

      assert.equal(response.status, 201);
      batchTasks.push(await response.json());
    }

    const batchResponse = await fetch(`${baseUrl}/api/tasks/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ids: batchTasks.map((task) => task.id),
        updates: { status: 'done' }
      })
    });

    assert.equal(batchResponse.ok, true);
    const batchPayload = await batchResponse.json();
    assert.equal(batchPayload.updated, 2);
    assert.deepEqual(batchPayload.failed, []);

    const listResponse = await fetch(`${baseUrl}/api/tasks?status=done`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    assert.equal(listResponse.ok, true);
    const listPayload = await listResponse.json();
    assert.ok(listPayload.tasks.some((task) => task.id === batchTasks[0].id));
    assert.ok(listPayload.tasks.some((task) => task.id === batchTasks[1].id));

    const matrixResponse = await fetch(`${baseUrl}/api/tasks/matrix`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    assert.equal(matrixResponse.ok, true);
    const matrixPayload = await matrixResponse.json();
    assert.ok(Array.isArray(matrixPayload.doFirst));
    assert.ok(Array.isArray(matrixPayload.schedule));
    assert.ok(Array.isArray(matrixPayload.delegate));
    assert.ok(Array.isArray(matrixPayload.eliminate));
    assert.ok(matrixPayload.doFirst.some((task) => task.id === createdTask.id));
  });

  it('serves roadmap list, detail, progress, phase creation, and analytics against real domain state', async () => {
    const roadmap = server.roadmapDomain.createRoadmap({
      title: 'E2E Roadmap',
      description: 'Roadmap seeded through the real domain for HTTP verification',
      nodes: [
        { id: 'node-1', title: 'Introduction', type: 'lesson' },
        { id: 'node-2', title: 'Advanced Topic', type: 'lesson' }
      ]
    });

    server.roadmapDomain.enrollUser(roadmap.id, 'admin');
    server.roadmapDomain.updateNodeStatus(roadmap.id, 'admin', 'node-1', 'completed');

    const listResponse = await fetch(`${baseUrl}/api/roadmaps`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.equal(listResponse.ok, true);
    const listPayload = await listResponse.json();
    assert.ok(listPayload.roadmaps.some((item) => item.id === roadmap.id));

    const detailResponse = await fetch(`${baseUrl}/api/roadmaps/${roadmap.id}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.equal(detailResponse.ok, true);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.id, roadmap.id);
    assert.equal(detailPayload.title, 'E2E Roadmap');

    const progressResponse = await fetch(`${baseUrl}/api/roadmaps/${roadmap.id}/progress`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.equal(progressResponse.ok, true);
    const progressPayload = await progressResponse.json();
    assert.equal(progressPayload.roadmapId, roadmap.id);
    assert.equal(progressPayload.overallProgress, 50);
    assert.equal(progressPayload.totalMilestones, 2);

    const phaseResponse = await fetch(`${baseUrl}/api/roadmaps/${roadmap.id}/phases`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Phase 3',
        type: 'milestone'
      })
    });

    assert.equal(phaseResponse.status, 201);
    const phasePayload = await phaseResponse.json();
    assert.equal(phasePayload.roadmapId, roadmap.id);
    assert.equal(phasePayload.node.title, 'Phase 3');

    const analyticsResponse = await fetch(`${baseUrl}/api/analytics/dashboard`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.equal(analyticsResponse.ok, true);
    const analyticsPayload = await analyticsResponse.json();
    assert.ok(analyticsPayload.taskStats);
    assert.ok(analyticsPayload.alerts);
  });
});
