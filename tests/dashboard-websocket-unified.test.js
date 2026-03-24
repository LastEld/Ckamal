/**
 * Tests for unified WebSocket implementation with Dashboard adapter
 * @module tests/dashboard-websocket-unified
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createServer } from 'http';
import { DashboardWebSocket } from '../src/dashboard/websocket.js';
import WebSocket from 'ws';

describe('DashboardWebSocket (Unified)', () => {
  let httpServer;
  let wsServer;
  let port;

  beforeAll(async () => {
    // Create HTTP server
    httpServer = createServer();
    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
      port = httpServer.address().port;
    });

    // Create WebSocket server with auth disabled for testing
    wsServer = new DashboardWebSocket(httpServer, {
      authEnabled: false,
      heartbeatInterval: 1000,
      heartbeatTimeout: 2000,
    });

    await wsServer.start();
  });

  afterAll(async () => {
    if (wsServer) {
      await wsServer.stop();
    }
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
  });

  it('should create WebSocket server instance', () => {
    expect(wsServer).toBeDefined();
    expect(wsServer.isRunning()).toBe(true);
  });

  it('should accept WebSocket connections', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    
    ws.on('open', () => {
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
      done();
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should receive connected message', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      expect(msg.type).toBe('connected');
      expect(msg.id).toBeDefined();
      ws.close();
      done();
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should handle room subscription', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let messageCount = 0;

    ws.on('open', () => {
      // Subscribe to 'tasks' room
      ws.send(JSON.stringify({ type: 'subscribe', room: 'tasks' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messageCount++;

      if (msg.type === 'subscribed') {
        expect(msg.room).toBe('tasks');
        ws.close();
        done();
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should receive task update notifications', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let subscribed = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', room: 'tasks' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'subscribed' && msg.room === 'tasks') {
        subscribed = true;
        // Send task update notification
        wsServer.notifyTaskUpdate({
          id: 'task-1',
          title: 'Test Task',
          status: 'in_progress',
        });
      }

      if (msg.type === 'task.updated') {
        expect(msg.data.id).toBe('task-1');
        expect(msg.data.title).toBe('Test Task');
        ws.close();
        done();
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should receive alert notifications', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let subscribed = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', room: 'alerts' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'subscribed' && msg.room === 'alerts') {
        subscribed = true;
        // Send alert notification
        wsServer.notifyAlert({
          level: 'warning',
          title: 'Test Alert',
          message: 'This is a test alert',
        });
      }

      if (msg.type === 'alert.new') {
        expect(msg.data.level).toBe('warning');
        expect(msg.data.title).toBe('Test Alert');
        ws.close();
        done();
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });

  it('should return dashboard stats', () => {
    const stats = wsServer.getDashboardStats();
    expect(stats).toHaveProperty('clients');
    expect(stats).toHaveProperty('rooms');
    expect(stats).toHaveProperty('isRunning');
    expect(stats.isRunning).toBe(true);
  });

  it('should support ping/pong', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'ping' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'pong') {
        expect(msg.timestamp).toBeDefined();
        ws.close();
        done();
      }
    });

    ws.on('error', (err) => {
      done(err);
    });
  });
});
