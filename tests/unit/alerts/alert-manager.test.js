/**
 * @fileoverview Unit tests for Alert Manager
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AlertEngine } from '../../../src/alerts/engine.js';

describe('Alert Manager', () => {
  describe('Alert Creation', () => {
    it('should create alert with valid configuration', async () => {
      const engine = new AlertEngine();
      const alert = {
        id: 'alert-1',
        type: 'system.cpu',
        message: 'CPU usage exceeded threshold',
        priority: 'HIGH',
        timestamp: new Date().toISOString(),
        metadata: { host: 'api-1' }
      };

      assert.deepEqual(engine.submit(alert), { accepted: true });
      assert.deepEqual(engine.getPendingAlerts(), [alert]);

      const metrics = engine.getMetrics();
      assert.equal(metrics.received, 1);
      assert.equal(metrics.queued, 1);
      assert.equal(metrics.queueSize, 1);
    });

    it('should validate alert severity levels', async () => {
      const engine = new AlertEngine();

      engine.submit({
        id: 'alert-low',
        type: 'system.cpu',
        message: 'Low priority alert',
        priority: 'LOW',
        metadata: { host: 'api-1' }
      });
      engine.submit({
        id: 'alert-high',
        type: 'system.memory',
        message: 'High priority alert',
        priority: 'HIGH',
        metadata: { host: 'api-1' }
      });
      engine.submit({
        id: 'alert-medium',
        type: 'system.disk',
        message: 'Medium priority alert',
        priority: 'MEDIUM',
        metadata: { host: 'api-1' }
      });

      assert.deepEqual(
        engine.getPendingAlerts().map(alert => alert.priority),
        ['HIGH', 'MEDIUM', 'LOW']
      );
    });
  });

  describe('Alert Routing', () => {
    it('should route alerts to correct channels', async () => {
      const delivered = [];
      const engine = new AlertEngine();

      engine.addChannel({
        name: 'console',
        send: async (alert) => {
          delivered.push({ channel: 'console', alertId: alert.id });
          return true;
        }
      });
      engine.addChannel({
        name: 'webhook',
        send: async (alert) => {
          delivered.push({ channel: 'webhook', alertId: alert.id });
          return true;
        }
      });

      engine.submit({
        id: 'alert-1',
        type: 'system.cpu',
        message: 'CPU usage exceeded threshold',
        priority: 'HIGH',
        metadata: { host: 'api-1' }
      });

      await engine.processBatch();

      assert.deepEqual(delivered, [
        { channel: 'console', alertId: 'alert-1' },
        { channel: 'webhook', alertId: 'alert-1' }
      ]);
      assert.equal(engine.getMetrics().processed, 1);
    });

    it('should handle routing failures gracefully', async () => {
      const engine = new AlertEngine();
      let successfulDeliveries = 0;

      engine.addChannel({
        name: 'webhook',
        send: async () => {
          throw new Error('network down');
        }
      });
      engine.addChannel({
        name: 'console',
        send: async () => {
          successfulDeliveries++;
          return true;
        }
      });

      const processedEvent = new Promise(resolve => {
        engine.once('processed', resolve);
      });

      engine.submit({
        id: 'alert-1',
        type: 'system.cpu',
        message: 'CPU usage exceeded threshold',
        priority: 'HIGH',
        metadata: { host: 'api-1' }
      });

      await engine.processBatch();
      const event = await processedEvent;

      assert.equal(successfulDeliveries, 1);
      assert.equal(event.results.find(result => result.channel === 'console').sent, true);
      assert.equal(event.results.find(result => result.channel === 'webhook').sent, false);
      assert.equal(
        event.results.find(result => result.channel === 'webhook').error,
        'network down'
      );
    });
  });

  describe('Alert Deduplication', () => {
    it('should deduplicate similar alerts', async () => {
      const engine = new AlertEngine({ deduplicationWindowMs: 60000 });
      const baseAlert = {
        type: 'system.cpu',
        message: 'CPU usage exceeded threshold',
        priority: 'HIGH',
        metadata: { host: 'api-1' }
      };

      assert.deepEqual(
        engine.submit({ ...baseAlert, id: 'alert-1' }),
        { accepted: true }
      );
      assert.deepEqual(
        engine.submit({ ...baseAlert, id: 'alert-2' }),
        { accepted: false, reason: 'duplicate' }
      );

      const metrics = engine.getMetrics();
      assert.equal(metrics.deduplicated, 1);
      assert.equal(metrics.queueSize, 1);
    });

    it('should respect deduplication window', async () => {
      const engine = new AlertEngine({ deduplicationWindowMs: 1000 });
      const originalNow = Date.now;
      let now = 1000;

      Date.now = () => now;

      try {
        const baseAlert = {
          type: 'system.cpu',
          message: 'CPU usage exceeded threshold',
          priority: 'HIGH',
          metadata: { host: 'api-1' }
        };

        assert.deepEqual(
          engine.submit({ ...baseAlert, id: 'alert-1' }),
          { accepted: true }
        );

        now = 1500;
        assert.deepEqual(
          engine.submit({ ...baseAlert, id: 'alert-2' }),
          { accepted: false, reason: 'duplicate' }
        );

        now = 2001;
        assert.deepEqual(
          engine.submit({ ...baseAlert, id: 'alert-3' }),
          { accepted: true }
        );
      } finally {
        Date.now = originalNow;
      }
    });
  });
});
