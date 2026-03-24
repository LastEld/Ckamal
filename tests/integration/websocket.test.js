/**
 * @fileoverview Integration tests for WebSocket connections
 * Tests real-time bidirectional communication
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from '../helpers/test-server.js';
import { createWebSocketClient } from '../helpers/test-client.js';

describe('WebSocket Integration Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = await startTestServer({
      port: 0,
      enableWebSocket: true,
      environment: 'test'
    });
    baseUrl = `ws://localhost:${server.port}`;
  });

  after(async () => {
    await stopTestServer(server);
  });

  describe('Connection Management', () => {
    it('should establish WebSocket connection', async () => {
      // Arrange
      const ws = createWebSocketClient(`${baseUrl}/ws`);

      // Act & Assert
      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          assert.ok(true, 'Connection opened');
          ws.close();
          resolve();
        });
        ws.on('error', reject);
      });
    });

    it('should reject connection without auth', async () => {
      // Arrange
      const ws = createWebSocketClient(`${baseUrl}/ws`, {
        headers: {} // No auth token
      });

      // Act & Assert
      await new Promise((resolve, reject) => {
        ws.on('close', (code) => {
          assert.equal(code, 1008); // Policy violation
          resolve();
        });
        ws.on('open', () => reject(new Error('Should not connect')));
      });
    });

    it('should handle connection limits', async () => {
      // Arrange - Create max connections
      const connections = [];
      const maxConnections = 10;

      for (let i = 0; i < maxConnections + 1; i++) {
        connections.push(createWebSocketClient(`${baseUrl}/ws`));
      }

      // Act
      const results = await Promise.allSettled(
        connections.map(ws => 
          new Promise((resolve, reject) => {
            ws.on('open', () => resolve('connected'));
            ws.on('close', (code) => {
              if (code === 1013) resolve('rejected'); // Try again later
              else reject(new Error(`Unexpected close: ${code}`));
            });
          })
        )
      );

      // Assert
      const connected = results.filter(r => r.value === 'connected').length;
      const rejected = results.filter(r => r.value === 'rejected').length;
      assert.ok(connected <= maxConnections);
      assert.ok(rejected > 0);

      // Cleanup
      connections.forEach(ws => ws.close());
    });

    it('should maintain heartbeat/ping-pong', async () => {
      // Arrange
      const ws = createWebSocketClient(`${baseUrl}/ws`);
      let pongReceived = false;

      // Act
      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.ping();
        });
        
        ws.on('pong', () => {
          pongReceived = true;
          ws.close();
          resolve();
        });

        ws.on('error', reject);
      });

      // Assert
      assert.ok(pongReceived);
    });
  });

  describe('Message Protocol', () => {
    it('should echo messages', async () => {
      // Arrange
      const ws = createWebSocketClient(`${baseUrl}/ws`);
      const testMessage = { type: 'echo', data: 'hello' };

      // Act
      const response = await new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify(testMessage));
        });
        
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });

        ws.on('error', reject);
      });

      // Assert
      assert.equal(response.type, 'echo');
      assert.equal(response.data, 'hello');

      ws.close();
    });

    it('should handle JSON parse errors', async () => {
      // Arrange
      const ws = createWebSocketClient(`${baseUrl}/ws`);

      // Act
      const error = await new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send('invalid json {{{');
        });
        
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'error') resolve(msg);
        });

        ws.on('error', reject);
      });

      // Assert
      assert.equal(error.type, 'error');
      assert.ok(error.message.includes('JSON'));

      ws.close();
    });

    it('should support request-response pattern', async () => {
      // Arrange
      const ws = createWebSocketClient(`${baseUrl}/ws`);
      const requestId = 'req-001';
      const request = {
        id: requestId,
        type: 'request',
        action: 'getStatus',
        payload: {}
      };

      // Act
      const response = await new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify(request));
        });
        
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.id === requestId) resolve(msg);
        });

        ws.on('error', reject);
      });

      // Assert
      assert.equal(response.id, requestId);
      assert.ok(response.result);

      ws.close();
    });
  });

  describe('Real-time Events', () => {
    it('should receive task status updates', async () => {
      // Arrange
      const ws = createWebSocketClient(`${baseUrl}/ws`);
      const updates = [];

      // Act
      await new Promise((resolve, reject) => {
        ws.on('open', async () => {
          // Subscribe to task events
          ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'tasks'
          }));

          // Create a task via REST to trigger events
          await fetch(`http://localhost:${server.port}/api/v1/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'test', priority: 5 })
          });
        });
        
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.channel === 'tasks') {
            updates.push(msg);
            if (updates.length >= 2) {
              ws.close();
              resolve();
            }
          }
        });

        setTimeout(reject, 5000);
      });

      // Assert
      assert.ok(updates.length >= 1);
      assert.ok(updates.some(u => u.event === 'task:created'));
    });

    it('should receive workflow progress', async () => {
      // Arrange
      const ws = createWebSocketClient(`${baseUrl}/ws`);
      const progressEvents = [];

      // Act
      await new Promise((resolve, reject) => {
        ws.on('open', async () => {
          ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'workflows'
          }));

          // Start workflow
          await fetch(`http://localhost:${server.port}/api/v1/workflows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'ws-test-workflow',
              stages: [{ name: 's1', type: 'noop' }]
            })
          });
        });
        
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.channel === 'workflows') {
            progressEvents.push(msg);
            if (msg.event === 'workflow:completed') {
              ws.close();
              resolve();
            }
          }
        });

        setTimeout(reject, 10000);
      });

      // Assert
      assert.ok(progressEvents.some(e => e.event === 'workflow:started'));
      assert.ok(progressEvents.some(e => e.event === 'workflow:completed'));
    });

    it('should support channel unsubscription', async () => {
      // Arrange
      const ws = createWebSocketClient(`${baseUrl}/ws`);
      let receivedAfterUnsub = false;

      // Act
      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'test-channel'
          }));

          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'unsubscribe',
              channel: 'test-channel'
            }));

            setTimeout(() => {
              ws.close();
              resolve();
            }, 500);
          }, 500);
        });
        
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.channel === 'test-channel') {
            receivedAfterUnsub = true;
          }
        });

        setTimeout(reject, 3000);
      });

      // Assert
      assert.ok(!receivedAfterUnsub);
    });
  });

  describe('Multi-Client Scenarios', () => {
    it('should broadcast to all connected clients', async () => {
      // Arrange
      const client1 = createWebSocketClient(`${baseUrl}/ws`);
      const client2 = createWebSocketClient(`${baseUrl}/ws`);
      const messages = { c1: [], c2: [] };

      // Act
      await new Promise((resolve, reject) => {
        let connected = 0;
        
        const checkComplete = () => {
          if (messages.c1.length > 0 && messages.c2.length > 0) {
            client1.close();
            client2.close();
            resolve();
          }
        };

        [client1, client2].forEach((ws, idx) => {
          const key = idx === 0 ? 'c1' : 'c2';
          
          ws.on('open', () => {
            connected++;
            if (connected === 2) {
              // Both connected, send broadcast
              client1.send(JSON.stringify({
                type: 'broadcast',
                message: 'Hello all!'
              }));
            }
          });
          
          ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'broadcast') {
              messages[key].push(msg);
              checkComplete();
            }
          });

          ws.on('error', reject);
        });

        setTimeout(reject, 5000);
      });

      // Assert
      assert.equal(messages.c1.length, 1);
      assert.equal(messages.c2.length, 1);
    });

    it('should handle client disconnection gracefully', async () => {
      // Arrange
      const client1 = createWebSocketClient(`${baseUrl}/ws`);
      const client2 = createWebSocketClient(`${baseUrl}/ws`);
      let client2MessageCount = 0;

      // Act
      await new Promise((resolve, reject) => {
        client1.on('open', () => {
          client2.on('open', () => {
            // Disconnect client1
            client1.close();

            setTimeout(() => {
              // Client2 should still receive messages
              client2.send(JSON.stringify({ type: 'ping' }));
            }, 500);
          });
        });
        
        client2.on('message', () => {
          client2MessageCount++;
          if (client2MessageCount >= 1) {
            client2.close();
            resolve();
          }
        });

        setTimeout(reject, 3000);
      });

      // Assert
      assert.ok(client2MessageCount >= 1);
    });
  });

  describe('Error Recovery', () => {
    it('should reconnect on connection drop', async () => {
      // Arrange
      const ws = createWebSocketClient(`${baseUrl}/ws`, {
        reconnect: true,
        reconnectInterval: 100
      });
      let reconnectCount = 0;

      // Act
      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          reconnectCount++;
          if (reconnectCount === 1) {
            // Force disconnect
            ws.terminate();
          } else if (reconnectCount === 2) {
            ws.close();
            resolve();
          }
        });

        ws.on('error', () => {
          // Expected during reconnect
        });

        setTimeout(reject, 5000);
      });

      // Assert
      assert.equal(reconnectCount, 2);
    });

    it('should buffer messages while disconnected', async () => {
      // Arrange
      const messages = [];
      const ws = createWebSocketClient(`${baseUrl}/ws`, {
        bufferMessages: true
      });

      // Act
      await new Promise((resolve, reject) => {
        // Send message before connected
        ws.send(JSON.stringify({ type: 'test', data: 'buffered' }));

        ws.on('open', () => {
          // Should receive buffered message echo
          ws.send(JSON.stringify({ type: 'flush' }));
        });
        
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          messages.push(msg);
          if (messages.length >= 2) {
            ws.close();
            resolve();
          }
        });

        setTimeout(reject, 3000);
      });

      // Assert
      assert.ok(messages.some(m => m.data === 'buffered'));
    });
  });
});
