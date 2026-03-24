/**
 * @fileoverview WebSocket Client Tests
 */

import { WebSocketClient } from '../../src/websocket/client.js';
import { WebSocketServer } from '../../src/websocket/server.js';
import { createServer } from 'http';
import { jest } from '@jest/globals';

describe('WebSocketClient', () => {
  let httpServer;
  let wss;
  let port;

  beforeAll(async () => {
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

  afterAll(async () => {
    await wss.stop();
    httpServer.close();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Connection', () => {
    test('should connect to server', (done) => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        autoConnect: false,
        debug: false
      });

      client.on('connect', () => {
        expect(client.isConnected).toBe(true);
        client.destroy();
        done();
      });

      client.connect();
    });

    test('should auto-connect', (done) => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        autoConnect: true,
        debug: false
      });

      client.on('connect', () => {
        expect(client.isConnected).toBe(true);
        client.destroy();
        done();
      });
    });

    test('should track connection state', (done) => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        autoConnect: false
      });

      expect(client.state.isConnected).toBe(false);

      client.on('connect', () => {
        expect(client.state.isConnected).toBe(true);
        expect(client.state.connectedAt).toBeInstanceOf(Date);
        expect(client.state.connectionId).toBeDefined();
        client.destroy();
        done();
      });

      client.connect();
    });
  });

  describe('Reconnection', () => {
    test('should reconnect on disconnect', (done) => {
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
          // Force disconnect
          client.disconnect();
        } else {
          // Reconnected successfully
          client.destroy();
          done();
        }
      });

      client.on('reconnecting', (attempt) => {
        expect(attempt).toBeGreaterThan(0);
      });
    });

    test('should emit reconnect_failed after max attempts', (done) => {
      const client = new WebSocketClient({
        url: `ws://localhost:99999`, // Invalid port
        autoConnect: false,
        autoReconnect: true,
        reconnectInterval: 50,
        maxReconnectAttempts: 2,
        debug: false
      });

      client.on('reconnect_failed', () => {
        client.destroy();
        done();
      });

      client.connect().catch(() => {
        // Expected to fail
      });
    });
  });

  describe('Room Operations', () => {
    test('should subscribe to room', (done) => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        autoConnect: true
      });

      client.on('subscribed', (room, data) => {
        expect(room).toBe('test-room');
        expect(data).toBeDefined();
        client.destroy();
        done();
      });

      client.on('connect', () => {
        client.subscribe('test-room');
      });
    });

    test('should unsubscribe from room', (done) => {
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
          done();
        }
      });

      client.on('connect', () => {
        client.subscribe('test-room-2');
      });
    });
  });

  describe('Messaging', () => {
    test('should send and receive messages', (done) => {
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
          done();
        }
      });

      client1.on('subscribed', () => {
        client1.broadcastToRoom('msg-room', { text: 'Hello from client1!' });
      });
    });
  });

  describe('Presence', () => {
    test('should update presence', (done) => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        autoConnect: true
      });

      client.on('presence', (message) => {
        if (message.type === 'presence:updated') {
          expect(message.user.status).toBe('busy');
          client.destroy();
          done();
        }
      });

      client.on('subscribed', () => {
        client.updatePresence('presence-room', 'busy', { task: 'testing' });
      });

      client.on('connect', () => {
        client.subscribe('presence-room');
      });
    });
  });

  describe('Typing Indicators', () => {
    test('should send typing indicators', (done) => {
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
          expect(message.context.field).toBe('input');
          client1.destroy();
          client2.destroy();
          done();
        }
      });

      client1.on('subscribed', () => {
        client1.startTyping('typing-test-room', { field: 'input' });
      });
    });
  });

  describe('History', () => {
    test('should request history', (done) => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        autoConnect: true
      });

      client.on('history', (room, messages) => {
        expect(room).toBe('history-test-room');
        expect(Array.isArray(messages)).toBe(true);
        client.destroy();
        done();
      });

      client.on('subscribed', () => {
        client.getHistory('history-test-room', { limit: 10 });
      });

      client.on('connect', () => {
        client.subscribe('history-test-room');
      });
    });
  });

  describe('Annotations', () => {
    test('should create annotation', (done) => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        autoConnect: true
      });

      client.on('annotation', (message) => {
        if (message.type === 'annotation:created') {
          expect(message.annotation.content).toBe('Test note');
          expect(message.annotation.x).toBe(50);
          expect(message.annotation.y).toBe(100);
          client.destroy();
          done();
        }
      });

      client.on('subscribed', () => {
        client.createAnnotation('annotation-room', {
          x: 50,
          y: 100,
          content: 'Test note',
          type: 'note'
        });
      });

      client.on('connect', () => {
        client.subscribe('annotation-room');
      });
    });
  });

  describe('Task Collaboration', () => {
    test('should subscribe to task', (done) => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        autoConnect: true
      });

      client.on('task', (message) => {
        if (message.type === 'task:subscribed') {
          expect(message.taskId).toBe('task-test-123');
          client.destroy();
          done();
        }
      });

      client.on('connect', () => {
        client.subscribeToTask('task-test-123');
      });
    });

    test('should update task', (done) => {
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
          expect(message.changes.status).toBe('completed');
          client.destroy();
          done();
        }
      });

      client.on('connect', () => {
        client.subscribeToTask('task-update-123');
      });
    });
  });

  describe('Cleanup', () => {
    test('should clean up on destroy', (done) => {
      const client = new WebSocketClient({
        url: `ws://localhost:${port}`,
        autoConnect: true
      });

      client.on('connect', () => {
        expect(client.isConnected).toBe(true);
        client.destroy();
        
        setTimeout(() => {
          expect(client.isConnected).toBe(false);
          done();
        }, 100);
      });
    });
  });
});
