/**
 * @fileoverview Integration tests for multi-client scenarios
 * Tests concurrent client interactions, load balancing, and shared state
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from '../helpers/test-server.js';
import { createTestClient, createWebSocketClient } from '../helpers/test-client.js';

describe('Multi-Client Integration Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = await startTestServer({
      port: 0,
      enableWebSocket: true,
      environment: 'test',
      maxConnections: 100
    });
    baseUrl = `http://localhost:${server.port}`;
  });

  after(async () => {
    await stopTestServer(server);
  });

  describe('Concurrent API Requests', () => {
    it('should handle multiple simultaneous CV reads', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      const numRequests = 50;

      // Create a test CV first
      const createRes = await client.post('/api/v1/cvs', {
        name: 'Concurrent Test CV',
        version: '1.0.0',
        skills: ['test']
      });
      const cvId = createRes.data.id;

      // Act
      const requests = Array.from({ length: numRequests }, () =>
        client.get(`/api/v1/cvs/${cvId}`)
      );
      const responses = await Promise.all(requests);

      // Assert
      assert.ok(responses.every(r => r.status === 200));
      assert.ok(responses.every(r => r.data.id === cvId));
    });

    it('should handle concurrent CV updates safely', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      
      const createRes = await client.post('/api/v1/cvs', {
        name: 'Concurrent Update Test',
        version: '1.0.0',
        counter: 0
      });
      const cvId = createRes.data.id;

      // Act - Multiple clients try to update
      const updates = Array.from({ length: 10 }, (_, i) =>
        client.put(`/api/v1/cvs/${cvId}`, {
          counter: i + 1,
          lastUpdate: Date.now()
        })
      );
      const responses = await Promise.all(updates);

      // Assert - All should succeed with optimistic locking
      const successful = responses.filter(r => r.status === 200);
      const conflicts = responses.filter(r => r.status === 409);
      
      assert.equal(successful.length + conflicts.length, 10);
      
      // Verify final state
      const final = await client.get(`/api/v1/cvs/${cvId}`);
      assert.ok(final.data.counter > 0);
    });

    it('should handle concurrent task submissions', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      const numTasks = 100;

      // Act
      const submissions = Array.from({ length: numTasks }, (_, i) =>
        client.post('/api/v1/tasks', {
          type: 'concurrent-test',
          priority: Math.floor(Math.random() * 10) + 1,
          payload: { index: i }
        })
      );
      const responses = await Promise.all(submissions);

      // Assert
      assert.ok(responses.every(r => r.status === 201));
      
      const taskIds = responses.map(r => r.data.taskId);
      const uniqueIds = new Set(taskIds);
      assert.equal(uniqueIds.size, numTasks, 'All task IDs should be unique');
    });
  });

  describe('WebSocket Broadcasting', () => {
    it('should broadcast to multiple WebSocket clients', async () => {
      // Arrange
      const numClients = 10;
      const clients = Array.from({ length: numClients }, () =>
        createWebSocketClient(`ws://localhost:${server.port}/ws`)
      );
      
      const messages = new Map();

      // Act
      await new Promise((resolve, reject) => {
        let connected = 0;
        
        clients.forEach((ws, idx) => {
          messages.set(idx, []);
          
          ws.on('open', () => {
            connected++;
            if (connected === numClients) {
              // All connected, send broadcast
              clients[0].send(JSON.stringify({
                type: 'broadcast',
                message: 'Hello all clients!'
              }));
            }
          });

          ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'broadcast') {
              messages.get(idx).push(msg);
              
              // Check if all received
              if (Array.from(messages.values()).every(m => m.length > 0)) {
                clients.forEach(c => c.close());
                resolve();
              }
            }
          });

          ws.on('error', reject);
        });

        setTimeout(reject, 5000);
      });

      // Assert
      assert.equal(messages.size, numClients);
      messages.forEach((msgs, idx) => {
        assert.equal(msgs.length, 1, `Client ${idx} should have 1 message`);
        assert.equal(msgs[0].message, 'Hello all clients!');
      });
    });

    it('should handle client join/leave during broadcast', async () => {
      // Arrange
      const ws1 = createWebSocketClient(`ws://localhost:${server.port}/ws`);
      const ws2 = createWebSocketClient(`ws://localhost:${server.port}/ws`);
      const received = { ws1: [], ws2: [] };

      // Act
      await new Promise((resolve, reject) => {
        let ws1Ready = false;
        let ws2Ready = false;

        ws1.on('open', () => { ws1Ready = true; checkReady(); });
        ws2.on('open', () => { ws2Ready = true; checkReady(); });

        const checkReady = () => {
          if (ws1Ready && ws2Ready) {
            // Disconnect ws2
            ws2.close();

            setTimeout(() => {
              // Send from ws1
              ws1.send(JSON.stringify({
                type: 'broadcast',
                message: 'After disconnect'
              }));
            }, 500);
          }
        };

        ws1.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'broadcast') {
            received.ws1.push(msg);
            ws1.close();
            resolve();
          }
        });

        setTimeout(reject, 3000);
      });

      // Assert
      assert.equal(received.ws1.length, 1);
      // ws2 should not receive anything after disconnect
    });

    it('should maintain separate channels for different rooms', async () => {
      // Arrange
      const roomAClients = [
        createWebSocketClient(`ws://localhost:${server.port}/ws`),
        createWebSocketClient(`ws://localhost:${server.port}/ws`)
      ];
      const roomBClients = [
        createWebSocketClient(`ws://localhost:${server.port}/ws`),
        createWebSocketClient(`ws://localhost:${server.port}/ws`)
      ];

      const roomAMessages = [];
      const roomBMessages = [];

      // Act
      await new Promise((resolve, reject) => {
        let connected = 0;
        const totalClients = roomAClients.length + roomBClients.length;

        const handleConnect = () => {
          connected++;
          if (connected === totalClients) {
            // Join rooms
            roomAClients.forEach(ws => {
              ws.send(JSON.stringify({ type: 'join', room: 'room-a' }));
            });
            roomBClients.forEach(ws => {
              ws.send(JSON.stringify({ type: 'join', room: 'room-b' }));
            });

            // Send to room-a
            setTimeout(() => {
              roomAClients[0].send(JSON.stringify({
                type: 'room-message',
                room: 'room-a',
                message: 'Hello Room A'
              }));
            }, 500);

            // Send to room-b
            setTimeout(() => {
              roomBClients[0].send(JSON.stringify({
                type: 'room-message',
                room: 'room-b',
                message: 'Hello Room B'
              }));
            }, 1000);

            // Complete after some time
            setTimeout(() => {
              [...roomAClients, ...roomBClients].forEach(ws => ws.close());
              resolve();
            }, 2000);
          }
        };

        roomAClients.forEach(ws => {
          ws.on('open', handleConnect);
          ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'room-message') roomAMessages.push(msg);
          });
        });

        roomBClients.forEach(ws => {
          ws.on('open', handleConnect);
          ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'room-message') roomBMessages.push(msg);
          });
        });

        setTimeout(reject, 5000);
      });

      // Assert
      assert.ok(roomAMessages.some(m => m.message === 'Hello Room A'));
      assert.ok(!roomAMessages.some(m => m.message === 'Hello Room B'));
      assert.ok(roomBMessages.some(m => m.message === 'Hello Room B'));
      assert.ok(!roomBMessages.some(m => m.message === 'Hello Room A'));
    });
  });

  describe('Shared State Management', () => {
    it('should maintain consistent state across REST and WebSocket', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      const ws = createWebSocketClient(`ws://localhost:${server.port}/ws`);
      
      const wsUpdates = [];

      // Act
      await new Promise((resolve, reject) => {
        ws.on('open', async () => {
          ws.send(JSON.stringify({ type: 'subscribe', channel: 'cvs' }));

          // Wait for subscription
          await new Promise(r => setTimeout(r, 500));

          // Create CV via REST
          await client.post('/api/v1/cvs', {
            name: 'Shared State Test',
            version: '1.0.0'
          });

          // Update CV via REST
          await client.put('/api/v1/cvs/shared-test', {
            name: 'Updated Name'
          });

          // Give time for events
          setTimeout(() => {
            ws.close();
            resolve();
          }, 1000);
        });

        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.channel === 'cvs') {
            wsUpdates.push(msg);
          }
        });

        ws.on('error', reject);
        setTimeout(reject, 5000);
      });

      // Assert
      assert.ok(wsUpdates.some(u => u.event === 'cv:created'));
      assert.ok(wsUpdates.some(u => u.event === 'cv:updated'));
    });

    it('should handle concurrent state modifications', async () => {
      // Arrange
      const clients = Array.from({ length: 5 }, () => 
        createTestClient(baseUrl)
      );
      
      // Create shared resource
      await clients[0].post('/api/v1/shared-resources', {
        id: 'concurrent-resource',
        value: 0
      });

      // Act - All clients try to increment
      const increments = clients.map((client, i) =>
        client.post('/api/v1/shared-resources/concurrent-resource/increment', {
          clientId: i,
          amount: 1
        })
      );

      const responses = await Promise.all(increments);

      // Assert
      const successful = responses.filter(r => r.status === 200);
      assert.equal(successful.length, 5);

      // Verify final value
      const final = await clients[0].get('/api/v1/shared-resources/concurrent-resource');
      assert.equal(final.data.value, 5);
    });
  });

  describe('Load Balancing', () => {
    it('should distribute tasks across workers', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      const numTasks = 20;

      // Act
      const submissions = Array.from({ length: numTasks }, (_, i) =>
        client.post('/api/v1/tasks', {
          type: 'worker-tracked',
          payload: { taskIndex: i }
        })
      );

      const responses = await Promise.all(submissions);

      // Get worker assignments
      const assignments = await Promise.all(
        responses.map(r => 
          client.get(`/api/v1/tasks/${r.data.taskId}/worker`)
        )
      );

      const workerIds = assignments.map(a => a.data.workerId);
      const uniqueWorkers = new Set(workerIds);

      // Assert
      assert.ok(uniqueWorkers.size > 1, 'Tasks should be distributed across multiple workers');
      assert.ok(uniqueWorkers.size <= numTasks);
    });

    it('should handle worker failure gracefully', async () => {
      // Arrange
      const client = createTestClient(baseUrl);

      // Submit task
      const submitRes = await client.post('/api/v1/tasks', {
        type: 'long-running',
        payload: { duration: 10000 }
      });
      const taskId = submitRes.data.taskId;

      // Simulate worker failure (kill worker endpoint)
      await client.post('/api/v1/admin/workers/kill', {
        graceful: false
      });

      // Wait for task migration
      await new Promise(r => setTimeout(r, 3000));

      // Act - Check task status
      const statusRes = await client.get(`/api/v1/tasks/${taskId}`);

      // Assert
      assert.ok(
        statusRes.data.status === 'running' || statusRes.data.status === 'completed',
        'Task should continue after worker failure'
      );
    });
  });

  describe('Session Management', () => {
    it('should maintain session across multiple requests', async () => {
      // Arrange
      const client = createTestClient(baseUrl, { keepCookies: true });

      // Act - Login
      const loginRes = await client.post('/api/v1/auth/login', {
        username: 'testuser',
        password: 'testpass'
      });
      assert.equal(loginRes.status, 200);

      // Make authenticated requests
      const profileRes = await client.get('/api/v1/user/profile');
      const settingsRes = await client.get('/api/v1/user/settings');

      // Assert
      assert.equal(profileRes.status, 200);
      assert.equal(settingsRes.status, 200);
      assert.equal(profileRes.data.username, 'testuser');
    });

    it('should synchronize session across HTTP and WebSocket', async () => {
      // Arrange
      const client = createTestClient(baseUrl, { keepCookies: true });

      // Login via HTTP
      const loginRes = await client.post('/api/v1/auth/login', {
        username: 'testuser',
        password: 'testpass'
      });
      const token = loginRes.data.token;

      // Connect WebSocket with same session
      const ws = createWebSocketClient(`ws://localhost:${server.port}/ws`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Act
      const authResult = await new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'auth-check'
          }));
        });

        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth-status') {
            ws.close();
            resolve(msg.authenticated);
          }
        });

        setTimeout(reject, 3000);
      });

      // Assert
      assert.equal(authResult, true);
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources on client disconnect', async () => {
      // Arrange
      const client = createTestClient(baseUrl);
      const ws = createWebSocketClient(`ws://localhost:${server.port}/ws`);

      // Create resources
      const taskRes = await client.post('/api/v1/tasks', {
        type: 'websocket-tracked',
        payload: {}
      });
      const taskId = taskRes.data.taskId;

      await new Promise((resolve) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'subscribe',
            channel: `task:${taskId}`
          }));
          setTimeout(resolve, 500);
        });
      });

      // Act - Disconnect
      ws.terminate();
      await new Promise(r => setTimeout(r, 1000));

      // Check subscriptions
      const subsRes = await client.get(`/api/v1/tasks/${taskId}/subscribers`);

      // Assert
      assert.equal(subsRes.data.count, 0);
    });

    it('should handle rapid connect/disconnect cycles', async () => {
      // Arrange
      const cycles = 10;
      
      // Act
      for (let i = 0; i < cycles; i++) {
        const ws = createWebSocketClient(`ws://localhost:${server.port}/ws`);
        
        await new Promise((resolve, reject) => {
          ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'ping' }));
            setTimeout(() => {
              ws.close();
              resolve();
            }, 100);
          });
          ws.on('error', reject);
          setTimeout(reject, 1000);
        });
      }

      // Assert - Server should still be healthy
      const client = createTestClient(baseUrl);
      const healthRes = await client.get('/health');
      assert.equal(healthRes.status, 200);
    });
  });
});
