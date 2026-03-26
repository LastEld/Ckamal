/**
 * @fileoverview WebSocket Server Tests
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from '../../src/websocket/server.js';
import { createServer } from 'http';
import WebSocket from 'ws';

describe('WebSocketServer', () => {
  let httpServer;
  let wss;
  let port;

  before(async () => {
    httpServer = createServer();
    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });
  });

  after(() => {
    httpServer.close();
  });

  beforeEach(async () => {
    wss = new WebSocketServer(httpServer, {
      authenticate: false,
      enablePresence: true,
      enableHistory: true,
      enableTyping: true,
      enableCursors: true,
      enableActivityFeed: true,
      enableNotifications: true,
    });
    await wss.start();
  });

  afterEach(async () => {
    await wss.stop();
  });

  describe('Connection', () => {
    it('should accept connections', async () => {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', () => {
          assert.equal(ws.readyState, WebSocket.OPEN);
          ws.close();
          resolve();
        });
        ws.on('error', reject);
      });
    });

    it('should send connected message', async () => {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          assert.equal(message.type, 'connected');
          assert.ok(message.id);
          assert.ok(message.serverTime);
          assert.ok(message.features);
          ws.close();
          resolve();
        });
        ws.on('error', reject);
      });
    });

    it('should track client count', async () => {
      assert.equal(wss.getClientCount(), 0);

      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', () => {
          assert.equal(wss.getClientCount(), 1);
          ws.close();
        });
        ws.on('close', () => {
          setTimeout(() => {
            assert.equal(wss.getClientCount(), 0);
            resolve();
          }, 100);
        });
        ws.on('error', reject);
      });
    });
  });

  describe('Room Management', () => {
    it('should subscribe to room', async () => {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'subscribe',
            room: 'test-room'
          }));
        });
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'subscribed') {
            assert.equal(message.room, 'test-room');
            assert.ok(message.members !== undefined);
            assert.ok(message.presence !== undefined);
            ws.close();
            resolve();
          }
        });
        ws.on('error', reject);
      });
    });

    it('should track room members', async () => {
      await new Promise((resolve, reject) => {
        const ws1 = new WebSocket(`ws://localhost:${port}`);
        const ws2 = new WebSocket(`ws://localhost:${port}`);
        let connected = 0;

        const trySubscribe = () => {
          connected++;
          if (connected === 2) {
            ws1.send(JSON.stringify({
              type: 'subscribe',
              room: 'test-room',
              presence: { userId: 'user-1' }
            }));
          }
        };

        ws1.on('open', trySubscribe);
        ws2.on('open', trySubscribe);

        ws2.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'user:joined') {
            assert.equal(message.user.id, 'user-1');
            ws1.close();
            ws2.close();
            resolve();
          }
        });
        ws1.on('error', reject);
        ws2.on('error', reject);
      });
    });

    it('should broadcast to room', async () => {
      await new Promise((resolve, reject) => {
        const ws1 = new WebSocket(`ws://localhost:${port}`);
        const ws2 = new WebSocket(`ws://localhost:${port}`);
        let subscribed = 0;

        ws1.on('open', () => {
          ws1.send(JSON.stringify({ type: 'subscribe', room: 'broadcast-room' }));
        });

        ws2.on('open', () => {
          ws2.send(JSON.stringify({ type: 'subscribe', room: 'broadcast-room' }));
        });

        ws1.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'subscribed') {
            subscribed++;
            if (subscribed === 2) {
              ws1.send(JSON.stringify({
                type: 'broadcast',
                room: 'broadcast-room',
                payload: { text: 'Hello!' }
              }));
            }
          }
        });

        ws2.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.text === 'Hello!') {
            assert.ok(message.senderId);
            assert.ok(message.timestamp);
            ws1.close();
            ws2.close();
            resolve();
          }
        });

        ws1.on('error', reject);
        ws2.on('error', reject);
      });
    });
  });

  describe('Presence', () => {
    it('should update presence', async () => {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        let subscribed = false;

        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'subscribe', room: 'presence-room' }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'subscribed') {
            subscribed = true;
            ws.send(JSON.stringify({
              type: 'presence:update',
              room: 'presence-room',
              status: 'busy',
              data: { currentTask: 'testing' }
            }));
          }
          if (message.type === 'presence:updated' && subscribed) {
            assert.equal(message.room, 'presence-room');
            assert.equal(message.user.status, 'busy');
            ws.close();
            resolve();
          }
        });
        ws.on('error', reject);
      });
    });
  });

  describe('Typing Indicators', () => {
    it('should track typing', async () => {
      await new Promise((resolve, reject) => {
        const ws1 = new WebSocket(`ws://localhost:${port}`);
        const ws2 = new WebSocket(`ws://localhost:${port}`);
        let subscribed = 0;

        const setup = (ws) => {
          ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'subscribe', room: 'typing-room' }));
          });
          ws.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.type === 'subscribed') {
              subscribed++;
              if (subscribed === 2) {
                ws1.send(JSON.stringify({
                  type: 'typing:start',
                  room: 'typing-room',
                  context: { field: 'message' }
                }));
              }
            }
          });
        };

        setup(ws1);

        ws2.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'typing:started') {
            assert.equal(message.room, 'typing-room');
            assert.equal(message.context.field, 'message');
            ws1.close();
            ws2.close();
            resolve();
          }
        });

        setup(ws2);
        ws1.on('error', reject);
        ws2.on('error', reject);
      });
    });
  });

  describe('Message History', () => {
    it('should store and retrieve history', async () => {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        let step = 0;

        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'subscribe', room: 'history-room' }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'subscribed' && step === 0) {
            step = 1;
            ws.send(JSON.stringify({
              type: 'broadcast',
              room: 'history-room',
              payload: { text: 'Message 1' }
            }));
          }
          if (message.type === 'broadcast:confirmed' && step === 1) {
            step = 2;
            ws.send(JSON.stringify({
              type: 'history:get',
              room: 'history-room',
              limit: 10
            }));
          }
          if (message.type === 'history:response' && step === 2) {
            assert.equal(message.room, 'history-room');
            assert.ok(Array.isArray(message.messages));
            assert.ok(message.messages.length > 0);
            ws.close();
            resolve();
          }
        });
        ws.on('error', reject);
      });
    });
  });

  describe('Activity Feed', () => {
    it('should track activities', async () => {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        let subscribed = false;

        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'subscribe', room: 'activity-room' }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'subscribed') {
            subscribed = true;
            ws.send(JSON.stringify({ type: 'activity:get', limit: 10 }));
          }
          if (message.type === 'activity:response' && subscribed) {
            assert.ok(Array.isArray(message.activities));
            ws.close();
            resolve();
          }
        });
        ws.on('error', reject);
      });
    });
  });

  describe('Annotations', () => {
    it('should create annotation', async () => {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        let subscribed = false;

        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'subscribe', room: 'annotation-room' }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'subscribed') {
            subscribed = true;
            ws.send(JSON.stringify({
              type: 'annotation:create',
              room: 'annotation-room',
              x: 100, y: 200,
              content: 'Test annotation',
              document: 'doc-1'
            }));
          }
          if (message.type === 'annotation:created' && subscribed) {
            assert.equal(message.annotation.content, 'Test annotation');
            assert.equal(message.annotation.x, 100);
            assert.equal(message.annotation.y, 200);
            ws.close();
            resolve();
          }
        });
        ws.on('error', reject);
      });
    });
  });

  describe('Task Collaboration', () => {
    it('should subscribe to task', async () => {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'task:subscribe', taskId: 'task-123' }));
        });
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'task:subscribed') {
            assert.equal(message.taskId, 'task-123');
            assert.equal(message.room, 'task:task-123');
            ws.close();
            resolve();
          }
        });
        ws.on('error', reject);
      });
    });

    it('should update task', async () => {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        let subscribed = false;

        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'task:subscribe', taskId: 'task-456' }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'task:subscribed') {
            subscribed = true;
            ws.send(JSON.stringify({
              type: 'task:update',
              taskId: 'task-456',
              changes: { status: 'in_progress' }
            }));
          }
          if (message.type === 'task:updated' && subscribed) {
            assert.equal(message.taskId, 'task-456');
            assert.equal(message.changes.status, 'in_progress');
            ws.close();
            resolve();
          }
        });
        ws.on('error', reject);
      });
    });
  });

  describe('Statistics', () => {
    it('should provide server stats', () => {
      const stats = wss.getStats();

      assert.ok('clients' in stats);
      assert.ok('users' in stats);
      assert.ok('rooms' in stats);
      assert.ok('isRunning' in stats);
      assert.ok('roomStats' in stats);
      assert.ok('features' in stats);

      assert.equal(stats.isRunning, true);
      assert.equal(stats.features.presence, true);
      assert.equal(stats.features.history, true);
      assert.equal(stats.features.typing, true);
      assert.equal(stats.features.cursors, true);
      assert.equal(stats.features.activityFeed, true);
      assert.equal(stats.features.notifications, true);
    });
  });
});
