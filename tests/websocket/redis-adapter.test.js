/**
 * @fileoverview Redis Adapter Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MockRedisAdapter } from '../../src/websocket/redis-adapter.js';

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
    it('should connect successfully', () => {
      assert.equal(adapter.isConnected, true);
    });

    it('should disconnect successfully', async () => {
      await adapter.disconnect();
      assert.equal(adapter.isConnected, false);
    });

    it('should have unique server ID', () => {
      assert.ok(adapter.serverId);
      assert.equal(typeof adapter.serverId, 'string');
    });
  });

  describe('Presence', () => {
    it('should set presence', async () => {
      await adapter.setPresence('room-1', 'user-1', {
        status: 'online',
        activity: 'coding'
      });

      const presence = await adapter.getPresence('room-1');
      assert.ok(presence['user-1']);
      assert.equal(presence['user-1'].status, 'online');
    });

    it('should get presence for multiple users', async () => {
      await adapter.setPresence('room-1', 'user-1', { status: 'online' });
      await adapter.setPresence('room-1', 'user-2', { status: 'away' });

      const presence = await adapter.getPresence('room-1');
      assert.equal(Object.keys(presence).length, 2);
      assert.equal(presence['user-1'].status, 'online');
      assert.equal(presence['user-2'].status, 'away');
    });

    it('should return empty object for unknown room', async () => {
      const presence = await adapter.getPresence('unknown-room');
      assert.deepEqual(presence, {});
    });

    it('should remove presence', async () => {
      await adapter.setPresence('room-1', 'user-1', { status: 'online' });
      await adapter.removePresence('room-1', 'user-1');

      const presence = await adapter.getPresence('room-1');
      assert.equal(presence['user-1'], undefined);
    });
  });

  describe('Message History', () => {
    it('should save message', async () => {
      await adapter.saveMessage('room-1', {
        id: 'msg-1',
        text: 'Hello',
        timestamp: Date.now()
      });

      const history = await adapter.getMessageHistory('room-1');
      assert.equal(history.length, 1);
      assert.equal(history[0].text, 'Hello');
    });

    it('should limit message history', async () => {
      for (let i = 0; i < 110; i++) {
        await adapter.saveMessage('room-1', {
          id: `msg-${i}`,
          text: `Message ${i}`,
          timestamp: Date.now() + i
        });
      }

      const history = await adapter.getMessageHistory('room-1', { limit: 50 });
      assert.equal(history.length, 50);
    });

    it('should filter by timestamp', async () => {
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

      assert.equal(history.length, 1);
      assert.equal(history[0].text, 'New');
    });

    it('should return empty array for unknown room', async () => {
      const history = await adapter.getMessageHistory('unknown-room');
      assert.deepEqual(history, []);
    });
  });

  describe('Lock Management', () => {
    it('should acquire lock', async () => {
      const acquired = await adapter.acquireLock('resource-1', 'holder-1');
      assert.equal(acquired, true);
    });

    it('should not acquire already held lock', async () => {
      await adapter.acquireLock('resource-1', 'holder-1');
      const acquired = await adapter.acquireLock('resource-1', 'holder-2');
      assert.equal(acquired, false);
    });

    it('should release lock', async () => {
      await adapter.acquireLock('resource-1', 'holder-1');
      const released = await adapter.releaseLock('resource-1', 'holder-1');
      assert.equal(released, true);

      const acquired = await adapter.acquireLock('resource-1', 'holder-2');
      assert.equal(acquired, true);
    });

    it('should not release lock held by another', async () => {
      await adapter.acquireLock('resource-1', 'holder-1');
      const released = await adapter.releaseLock('resource-1', 'holder-2');
      assert.equal(released, false);
    });
  });

  describe('Publishing', () => {
    it('should publish message', async () => {
      await new Promise((resolve) => {
        adapter.onMessage((message) => {
          assert.equal(message.room, 'room-1');
          assert.equal(message.payload.text, 'Hello');
          resolve();
        });

        adapter.publish('room-1', { text: 'Hello' });
      });
    });

    it('should include server ID in published message', async () => {
      await new Promise((resolve) => {
        adapter.onMessage((message) => {
          assert.equal(message.senderId, adapter.serverId);
          resolve();
        });

        adapter.publish('room-1', { text: 'Hello' });
      });
    });
  });

  describe('Statistics', () => {
    it('should provide stats', async () => {
      await adapter.setPresence('room-1', 'user-1', { status: 'online' });
      await adapter.setPresence('room-1', 'user-2', { status: 'online' });
      await adapter.setPresence('room-2', 'user-3', { status: 'away' });

      await adapter.saveMessage('room-1', { text: 'Hello' });

      const stats = await adapter.getStats();

      assert.equal(stats.connected, true);
      assert.equal(stats.mock, true);
      assert.equal(stats.serverId, adapter.serverId);
      assert.equal(stats.rooms, 2);
      assert.equal(stats.totalPresence, 3);
      assert.equal(stats.totalMessages, 1);
    });
  });
});
