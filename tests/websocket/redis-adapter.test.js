/**
 * @fileoverview Redis Adapter Tests
 */

import { MockRedisAdapter } from '../../src/websocket/redis-adapter.js';
import { jest } from '@jest/globals';

describe('MockRedisAdapter', () => {
  let adapter;

  beforeEach(async () => {
    adapter = new MockRedisAdapter();
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('Connection', () => {
    test('should connect successfully', () => {
      expect(adapter.isConnected).toBe(true);
    });

    test('should disconnect successfully', async () => {
      await adapter.disconnect();
      expect(adapter.isConnected).toBe(false);
    });

    test('should have unique server ID', () => {
      expect(adapter.serverId).toBeDefined();
      expect(typeof adapter.serverId).toBe('string');
    });
  });

  describe('Presence', () => {
    test('should set presence', async () => {
      await adapter.setPresence('room-1', 'user-1', {
        status: 'online',
        activity: 'coding'
      });

      const presence = await adapter.getPresence('room-1');
      expect(presence['user-1']).toBeDefined();
      expect(presence['user-1'].status).toBe('online');
    });

    test('should get presence for multiple users', async () => {
      await adapter.setPresence('room-1', 'user-1', { status: 'online' });
      await adapter.setPresence('room-1', 'user-2', { status: 'away' });

      const presence = await adapter.getPresence('room-1');
      expect(Object.keys(presence).length).toBe(2);
      expect(presence['user-1'].status).toBe('online');
      expect(presence['user-2'].status).toBe('away');
    });

    test('should return empty object for unknown room', async () => {
      const presence = await adapter.getPresence('unknown-room');
      expect(presence).toEqual({});
    });

    test('should remove presence', async () => {
      await adapter.setPresence('room-1', 'user-1', { status: 'online' });
      await adapter.removePresence('room-1', 'user-1');

      const presence = await adapter.getPresence('room-1');
      expect(presence['user-1']).toBeUndefined();
    });
  });

  describe('Message History', () => {
    test('should save message', async () => {
      await adapter.saveMessage('room-1', {
        id: 'msg-1',
        text: 'Hello',
        timestamp: Date.now()
      });

      const history = await adapter.getMessageHistory('room-1');
      expect(history.length).toBe(1);
      expect(history[0].text).toBe('Hello');
    });

    test('should limit message history', async () => {
      // Add more than 100 messages
      for (let i = 0; i < 110; i++) {
        await adapter.saveMessage('room-1', {
          id: `msg-${i}`,
          text: `Message ${i}`,
          timestamp: Date.now() + i
        });
      }

      const history = await adapter.getMessageHistory('room-1', { limit: 50 });
      expect(history.length).toBe(50);
    });

    test('should filter by timestamp', async () => {
      const now = Date.now();
      
      await adapter.saveMessage('room-1', {
        id: 'msg-1',
        text: 'Old',
        timestamp: now - 1000
      });
      
      await adapter.saveMessage('room-1', {
        id: 'msg-2',
        text: 'New',
        timestamp: now
      });

      const history = await adapter.getMessageHistory('room-1', { 
        after: now - 500 
      });
      
      expect(history.length).toBe(1);
      expect(history[0].text).toBe('New');
    });

    test('should return empty array for unknown room', async () => {
      const history = await adapter.getMessageHistory('unknown-room');
      expect(history).toEqual([]);
    });
  });

  describe('Lock Management', () => {
    test('should acquire lock', async () => {
      const acquired = await adapter.acquireLock('resource-1', 'holder-1');
      expect(acquired).toBe(true);
    });

    test('should not acquire already held lock', async () => {
      await adapter.acquireLock('resource-1', 'holder-1');
      const acquired = await adapter.acquireLock('resource-1', 'holder-2');
      expect(acquired).toBe(false);
    });

    test('should release lock', async () => {
      await adapter.acquireLock('resource-1', 'holder-1');
      const released = await adapter.releaseLock('resource-1', 'holder-1');
      expect(released).toBe(true);

      // Now another holder can acquire
      const acquired = await adapter.acquireLock('resource-1', 'holder-2');
      expect(acquired).toBe(true);
    });

    test('should not release lock held by another', async () => {
      await adapter.acquireLock('resource-1', 'holder-1');
      const released = await adapter.releaseLock('resource-1', 'holder-2');
      expect(released).toBe(false);
    });
  });

  describe('Publishing', () => {
    test('should publish message', (done) => {
      adapter.onMessage((message) => {
        expect(message.room).toBe('room-1');
        expect(message.payload.text).toBe('Hello');
        done();
      });

      adapter.publish('room-1', { text: 'Hello' });
    });

    test('should include server ID in published message', (done) => {
      adapter.onMessage((message) => {
        expect(message.senderId).toBe(adapter.serverId);
        done();
      });

      adapter.publish('room-1', { text: 'Hello' });
    });
  });

  describe('Statistics', () => {
    test('should provide stats', async () => {
      await adapter.setPresence('room-1', 'user-1', { status: 'online' });
      await adapter.setPresence('room-1', 'user-2', { status: 'online' });
      await adapter.setPresence('room-2', 'user-3', { status: 'away' });
      
      await adapter.saveMessage('room-1', { text: 'Hello' });

      const stats = await adapter.getStats();
      
      expect(stats.connected).toBe(true);
      expect(stats.mock).toBe(true);
      expect(stats.serverId).toBe(adapter.serverId);
      expect(stats.rooms).toBe(2);
      expect(stats.totalPresence).toBe(3);
      expect(stats.totalMessages).toBe(1);
    });
  });
});

// Note: RedisAdapter tests would require a running Redis instance
// These would be run as integration tests
describe.skip('RedisAdapter (Integration)', () => {
  // These tests require Redis to be running
  // Run with: REDIS_URL=redis://localhost:6379 npm test
});
