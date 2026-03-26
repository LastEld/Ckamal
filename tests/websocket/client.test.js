/**
 * @fileoverview WebSocket Client Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketClient } from '../../src/websocket/client.js';
import { WebSocketServer } from '../../src/websocket/server.js';
import { createServer } from 'http';

describe('WebSocketClient', () => {
  let httpServer;
  let wss;
  let port;

  before(async () => {
    httpServer = createServer();
    wss = new WebSocketServer(httpServer, {
      authenticate: false,
      enablePresence: true,
      enableHistory: true,
      enableTyping: true,
    });

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    await wss.start();
  });

  after(async () => {
    await wss.stop();
    httpServer.close();
  });

  describe('Connection', () => {
    it('should connect to server', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: false,
          debug: false
        });

        client.on('connect', () => {
          assert.equal(client.isConnected, true);
          client.destroy();
          resolve();
        });

        client.connect();
        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });

    it('should auto-connect', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true,
          debug: false
        });

        client.on('connect', () => {
          assert.equal(client.isConnected, true);
          client.destroy();
          resolve();
        });
        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });

    it('should track connection state', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: false
        });

        assert.equal(client.state.isConnected, false);

        client.on('connect', () => {
          assert.equal(client.state.isConnected, true);
          assert.ok(client.state.connectedAt instanceof Date);
          assert.ok(client.state.connectionId);
          client.destroy();
          resolve();
        });

        client.connect();
        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });
  });

  describe('Reconnection', () => {
    it('should reconnect on disconnect', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoReconnect: true,
          reconnectInterval: 100,
          maxReconnectAttempts: 3,
          debug: false
        });

        let reconnecting = false;

        client.on('connect', () => {
          if (!reconnecting) {
            reconnecting = true;
            client.disconnect();
          } else {
            client.destroy();
            resolve();
          }
        });

        client.on('reconnecting', (attempt) => {
          assert.ok(attempt > 0);
        });

        setTimeout(() => reject(new Error('timeout')), 10000);
      });
    });

    it('should emit reconnect_failed after max attempts', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:99999`,
          autoConnect: false,
          autoReconnect: true,
          reconnectInterval: 50,
          maxReconnectAttempts: 2,
          debug: false
        });

        client.on('reconnect_failed', () => {
          client.destroy();
          resolve();
        });

        client.connect().catch(() => {
          // Expected to fail
        });

        setTimeout(() => reject(new Error('timeout')), 10000);
      });
    });
  });

  describe('Room Operations', () => {
    it('should subscribe to room', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        client.on('subscribed', (room) => {
          assert.equal(room, 'test-room');
          client.destroy();
          resolve();
        });

        client.on('connect', () => {
          client.subscribe('test-room');
        });

        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });

    it('should unsubscribe from room', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        let subscribed = false;

        client.on('subscribed', (room) => {
          if (!subscribed) {
            subscribed = true;
            client.unsubscribe(room);
          }
        });

        client.on('message', (message) => {
          if (message.type === 'unsubscribed') {
            client.destroy();
            resolve();
          }
        });

        client.on('connect', () => {
          client.subscribe('test-room-2');
        });

        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });
  });

  describe('Messaging', () => {
    it('should send and receive messages', async () => {
      await new Promise((resolve, reject) => {
        const client1 = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        const client2 = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        let connected = 0;

        const checkConnected = () => {
          connected++;
          if (connected === 2) {
            client1.subscribe('msg-room');
            client2.subscribe('msg-room');
          }
        };

        client1.on('connect', checkConnected);
        client2.on('connect', checkConnected);

        client2.on('message', (message) => {
          if (message.text === 'Hello from client1!') {
            client1.destroy();
            client2.destroy();
            resolve();
          }
        });

        client1.on('subscribed', () => {
          client1.broadcastToRoom('msg-room', { text: 'Hello from client1!' });
        });

        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });
  });

  describe('Presence', () => {
    it('should update presence', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        client.on('presence', (message) => {
          if (message.type === 'presence:updated') {
            assert.equal(message.user.status, 'busy');
            client.destroy();
            resolve();
          }
        });

        client.on('subscribed', () => {
          client.updatePresence('presence-room', 'busy', { task: 'testing' });
        });

        client.on('connect', () => {
          client.subscribe('presence-room');
        });

        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });
  });

  describe('Typing Indicators', () => {
    it('should send typing indicators', async () => {
      await new Promise((resolve, reject) => {
        const client1 = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        const client2 = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        let connected = 0;

        const checkConnected = () => {
          connected++;
          if (connected === 2) {
            client1.subscribe('typing-test-room');
            client2.subscribe('typing-test-room');
          }
        };

        client1.on('connect', checkConnected);
        client2.on('connect', checkConnected);

        client2.on('typing', (message) => {
          if (message.type === 'typing:started') {
            assert.equal(message.context.field, 'input');
            client1.destroy();
            client2.destroy();
            resolve();
          }
        });

        client1.on('subscribed', () => {
          client1.startTyping('typing-test-room', { field: 'input' });
        });

        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });
  });

  describe('History', () => {
    it('should request history', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        client.on('history', (room, messages) => {
          assert.equal(room, 'history-test-room');
          assert.ok(Array.isArray(messages));
          client.destroy();
          resolve();
        });

        client.on('subscribed', () => {
          client.getHistory('history-test-room', { limit: 10 });
        });

        client.on('connect', () => {
          client.subscribe('history-test-room');
        });

        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });
  });

  describe('Annotations', () => {
    it('should create annotation', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        client.on('annotation', (message) => {
          if (message.type === 'annotation:created') {
            assert.equal(message.annotation.content, 'Test note');
            assert.equal(message.annotation.x, 50);
            assert.equal(message.annotation.y, 100);
            client.destroy();
            resolve();
          }
        });

        client.on('subscribed', () => {
          client.createAnnotation('annotation-room', {
            x: 50, y: 100,
            content: 'Test note',
            type: 'note'
          });
        });

        client.on('connect', () => {
          client.subscribe('annotation-room');
        });

        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });
  });

  describe('Task Collaboration', () => {
    it('should subscribe to task', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        client.on('task', (message) => {
          if (message.type === 'task:subscribed') {
            assert.equal(message.taskId, 'task-test-123');
            client.destroy();
            resolve();
          }
        });

        client.on('connect', () => {
          client.subscribeToTask('task-test-123');
        });

        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });

    it('should update task', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        let subscribed = false;

        client.on('task', (message) => {
          if (message.type === 'task:subscribed') {
            subscribed = true;
            client.updateTask('task-update-123', { status: 'completed' });
          }
          if (message.type === 'task:updated' && subscribed) {
            assert.equal(message.changes.status, 'completed');
            client.destroy();
            resolve();
          }
        });

        client.on('connect', () => {
          client.subscribeToTask('task-update-123');
        });

        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });
  });

  describe('Cleanup', () => {
    it('should clean up on destroy', async () => {
      await new Promise((resolve, reject) => {
        const client = new WebSocketClient({
          url: `ws://localhost:${port}`,
          autoConnect: true
        });

        client.on('connect', () => {
          assert.equal(client.isConnected, true);
          client.destroy();

          setTimeout(() => {
            assert.equal(client.isConnected, false);
            resolve();
          }, 100);
        });

        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    });
  });
});
