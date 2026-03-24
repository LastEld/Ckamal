/**
 * @fileoverview WebSocket Server Tests
 */

import { WebSocketServer } from '../../src/websocket/server.js';
import { createServer } from 'http';
import WebSocket from 'ws';
import { jest } from '@jest/globals';

describe('WebSocketServer', () => {
  let httpServer;
  let wss;
  let port;

  beforeAll(async () => {
    httpServer = createServer();
    await new Promise((resolve) => {
      httpServer.listen(0, resolve);
      port = httpServer.address().port;
    });
  });

  afterAll(() => {
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
    test('should accept connections', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });
    });

    test('should send connected message', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        expect(message.type).toBe('connected');
        expect(message.id).toBeDefined();
        expect(message.serverTime).toBeDefined();
        expect(message.features).toBeDefined();
        ws.close();
        done();
      });
    });

    test('should track client count', (done) => {
      expect(wss.getClientCount()).toBe(0);
      
      const ws = new WebSocket(`ws://localhost:${port}`);
      
      ws.on('open', () => {
        expect(wss.getClientCount()).toBe(1);
        ws.close();
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(wss.getClientCount()).toBe(0);
          done();
        }, 100);
      });
    });
  });

  describe('Room Management', () => {
    test('should subscribe to room', (done) => {
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
          expect(message.room).toBe('test-room');
          expect(message.members).toBeDefined();
          expect(message.presence).toBeDefined();
          ws.close();
          done();
        }
      });
    });

    test('should track room members', (done) => {
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
          expect(message.user.id).toBe('user-1');
          ws1.close();
          ws2.close();
          done();
        }
      });
    });

    test('should broadcast to room', (done) => {
      const ws1 = new WebSocket(`ws://localhost:${port}`);
      const ws2 = new WebSocket(`ws://localhost:${port}`);
      let subscribed = 0;

      ws1.on('open', () => {
        ws1.send(JSON.stringify({
          type: 'subscribe',
          room: 'broadcast-room'
        }));
      });

      ws2.on('open', () => {
        ws2.send(JSON.stringify({
          type: 'subscribe',
          room: 'broadcast-room'
        }));
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
          expect(message.senderId).toBeDefined();
          expect(message.timestamp).toBeDefined();
          ws1.close();
          ws2.close();
          done();
        }
      });
    });
  });

  describe('Presence', () => {
    test('should update presence', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let subscribed = false;

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          room: 'presence-room'
        }));
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
          expect(message.room).toBe('presence-room');
          expect(message.user.status).toBe('busy');
          ws.close();
          done();
        }
      });
    });
  });

  describe('Typing Indicators', () => {
    test('should track typing', (done) => {
      const ws1 = new WebSocket(`ws://localhost:${port}`);
      const ws2 = new WebSocket(`ws://localhost:${port}`);
      let subscribed = 0;

      const setup = (ws) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'subscribe',
            room: 'typing-room'
          }));
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
          expect(message.room).toBe('typing-room');
          expect(message.context.field).toBe('message');
          ws1.close();
          ws2.close();
          done();
        }
      });

      setup(ws2);
    });
  });

  describe('Message History', () => {
    test('should store and retrieve history', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let step = 0;

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          room: 'history-room'
        }));
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
          expect(message.room).toBe('history-room');
          expect(message.messages).toBeInstanceOf(Array);
          expect(message.messages.length).toBeGreaterThan(0);
          ws.close();
          done();
        }
      });
    });
  });

  describe('Activity Feed', () => {
    test('should track activities', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let subscribed = false;

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          room: 'activity-room'
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'subscribed') {
          subscribed = true;
          ws.send(JSON.stringify({
            type: 'activity:get',
            limit: 10
          }));
        }
        
        if (message.type === 'activity:response' && subscribed) {
          expect(message.activities).toBeInstanceOf(Array);
          ws.close();
          done();
        }
      });
    });
  });

  describe('Annotations', () => {
    test('should create annotation', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let subscribed = false;

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          room: 'annotation-room'
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'subscribed') {
          subscribed = true;
          ws.send(JSON.stringify({
            type: 'annotation:create',
            room: 'annotation-room',
            x: 100,
            y: 200,
            content: 'Test annotation',
            document: 'doc-1'
          }));
        }
        
        if (message.type === 'annotation:created' && subscribed) {
          expect(message.annotation.content).toBe('Test annotation');
          expect(message.annotation.x).toBe(100);
          expect(message.annotation.y).toBe(200);
          ws.close();
          done();
        }
      });
    });
  });

  describe('Task Collaboration', () => {
    test('should subscribe to task', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'task:subscribe',
          taskId: 'task-123'
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'task:subscribed') {
          expect(message.taskId).toBe('task-123');
          expect(message.room).toBe('task:task-123');
          ws.close();
          done();
        }
      });
    });

    test('should update task', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let subscribed = false;

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'task:subscribe',
          taskId: 'task-456'
        }));
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
          expect(message.taskId).toBe('task-456');
          expect(message.changes.status).toBe('in_progress');
          ws.close();
          done();
        }
      });
    });
  });

  describe('Statistics', () => {
    test('should provide server stats', async () => {
      const stats = wss.getStats();
      
      expect(stats).toHaveProperty('clients');
      expect(stats).toHaveProperty('users');
      expect(stats).toHaveProperty('rooms');
      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('roomStats');
      expect(stats).toHaveProperty('features');
      
      expect(stats.isRunning).toBe(true);
      expect(stats.features.presence).toBe(true);
      expect(stats.features.history).toBe(true);
      expect(stats.features.typing).toBe(true);
      expect(stats.features.cursors).toBe(true);
      expect(stats.features.activityFeed).toBe(true);
      expect(stats.features.notifications).toBe(true);
    });
  });
});
