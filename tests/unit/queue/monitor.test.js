/**
 * @fileoverview Unit tests for Queue Monitor
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { QueueMonitor, AlertSeverity, MetricType } from '../../../src/queue/monitor.js';
import { TaskQueue } from '../../../src/queue/task-queue.js';

describe('QueueMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new QueueMonitor({ autoSnapshot: false });
  });

  describe('registerComponent', () => {
    it('should register a component', () => {
      const queue = new TaskQueue();
      
      monitor.registerComponent('main', queue);
      
      assert.equal(monitor.components.main, queue);
    });

    it('should listen to component events', (t, done) => {
      const queue = new TaskQueue();
      monitor.registerComponent('main', queue);
      
      monitor.on('event', (event) => {
        assert.equal(event.type, 'task:enqueued');
        assert.equal(event.component, 'main');
        done();
      });
      
      queue.enqueue({ id: 't1', execute: async () => 'done' });
    });
  });

  describe('unregisterComponent', () => {
    it('should unregister a component', () => {
      const queue = new TaskQueue();
      monitor.registerComponent('main', queue);
      
      const removed = monitor.unregisterComponent('main');
      
      assert.equal(removed, true);
      assert.equal(monitor.components.main, undefined);
    });

    it('should return false for non-existent component', () => {
      assert.equal(monitor.unregisterComponent('nonexistent'), false);
    });
  });

  describe('increment', () => {
    it('should increment counter', () => {
      monitor.increment('test.counter');
      monitor.increment('test.counter', 5);
      
      assert.equal(monitor.getMetric('test.counter'), 6);
    });

    it('should record metric history', () => {
      monitor.increment('test.counter');
      
      const history = monitor.getMetricHistory('test.counter');
      
      assert.ok(history.length > 0);
      assert.equal(history[0].type, MetricType.COUNTER);
    });
  });

  describe('gauge', () => {
    it('should set gauge value', () => {
      monitor.gauge('test.gauge', 42);
      
      assert.equal(monitor.getMetric('test.gauge'), 42);
    });

    it('should update gauge value', () => {
      monitor.gauge('test.gauge', 10);
      monitor.gauge('test.gauge', 20);
      
      assert.equal(monitor.getMetric('test.gauge'), 20);
    });
  });

  describe('recordDuration', () => {
    it('should record histogram value', () => {
      monitor.recordDuration('test.duration', 100);
      
      const history = monitor.getMetricHistory('test.duration');
      
      assert.equal(history[0].value, 100);
      assert.equal(history[0].type, MetricType.HISTOGRAM);
    });
  });

  describe('recordRate', () => {
    it('should calculate and record rate', () => {
      monitor.recordRate('test.rate', 120, 60); // 120 per 60 seconds
      
      const history = monitor.getMetricHistory('test.rate');
      
      assert.equal(history[0].value, 2); // 2 per second
      assert.equal(history[0].type, MetricType.RATE);
    });
  });

  describe('getMetricHistory', () => {
    it('should return metric history', () => {
      monitor.increment('test.counter');
      monitor.increment('test.counter');
      
      const history = monitor.getMetricHistory('test.counter');
      
      assert.ok(history.length >= 2);
    });

    it('should filter by duration', () => {
      monitor.increment('test.counter');
      
      const history = monitor.getMetricHistory('test.counter', 1000); // Last 1 second
      
      assert.ok(history.length >= 1);
    });
  });

  describe('addAlertRule', () => {
    it('should add an alert rule', () => {
      const id = monitor.addAlertRule({
        name: 'High Error Rate',
        metric: 'errors',
        operator: 'gt',
        threshold: 10,
        severity: AlertSeverity.ERROR
      });
      
      assert.ok(id);
      assert.ok(monitor.alertRules.has(id));
    });

    it('should use provided id', () => {
      const id = monitor.addAlertRule({
        id: 'custom-id',
        name: 'Test Rule',
        metric: 'test',
        operator: 'gt',
        threshold: 1,
        severity: AlertSeverity.WARNING
      });
      
      assert.equal(id, 'custom-id');
    });
  });

  describe('removeAlertRule', () => {
    it('should remove an alert rule', () => {
      const id = monitor.addAlertRule({
        name: 'Test',
        metric: 'test',
        operator: 'gt',
        threshold: 1,
        severity: AlertSeverity.WARNING
      });
      
      const removed = monitor.removeAlertRule(id);
      
      assert.equal(removed, true);
      assert.equal(monitor.alertRules.has(id), false);
    });
  });

  describe('setRuleEnabled', () => {
    it('should enable/disable rule', () => {
      const id = monitor.addAlertRule({
        name: 'Test',
        metric: 'test',
        operator: 'gt',
        threshold: 1,
        severity: AlertSeverity.WARNING
      });
      
      monitor.setRuleEnabled(id, false);
      assert.equal(monitor.alertRules.get(id).enabled, false);
      
      monitor.setRuleEnabled(id, true);
      assert.equal(monitor.alertRules.get(id).enabled, true);
    });

    it('should return false for non-existent rule', () => {
      assert.equal(monitor.setRuleEnabled('nonexistent', false), false);
    });
  });

  describe('evaluateRules', () => {
    it('should trigger alert when threshold exceeded', () => {
      monitor.addAlertRule({
        name: 'High Value',
        metric: 'test.metric',
        operator: 'gt',
        threshold: 10,
        severity: AlertSeverity.ERROR
      });
      
      monitor.increment('test.metric', 15);
      
      const alerts = monitor.evaluateRules();
      
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].severity, AlertSeverity.ERROR);
    });

    it('should respect operators', () => {
      monitor.addAlertRule({
        name: 'Low Value',
        metric: 'test.metric',
        operator: 'lt',
        threshold: 5,
        severity: AlertSeverity.WARNING
      });
      
      monitor.gauge('test.metric', 3);
      
      const alerts = monitor.evaluateRules();
      
      assert.equal(alerts.length, 1);
    });

    it('should respect cooldown', () => {
      monitor.addAlertRule({
        name: 'High Value',
        metric: 'test.metric',
        operator: 'gt',
        threshold: 10,
        severity: AlertSeverity.ERROR,
        cooldown: 60000
      });
      
      monitor.increment('test.metric', 15);
      
      monitor.evaluateRules();
      const secondEvaluation = monitor.evaluateRules();
      
      assert.equal(secondEvaluation.length, 0); // Cooldown prevents second alert
    });

    it('should not trigger disabled rules', () => {
      monitor.addAlertRule({
        name: 'High Value',
        metric: 'test.metric',
        operator: 'gt',
        threshold: 10,
        severity: AlertSeverity.ERROR,
        enabled: false
      });
      
      monitor.increment('test.metric', 15);
      
      const alerts = monitor.evaluateRules();
      
      assert.equal(alerts.length, 0);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an alert', () => {
      monitor.addAlertRule({
        name: 'High Value',
        metric: 'test.metric',
        operator: 'gt',
        threshold: 10,
        severity: AlertSeverity.ERROR
      });
      
      monitor.increment('test.metric', 15);
      const alerts = monitor.evaluateRules();
      const alertId = alerts[0].id;
      
      const acknowledged = monitor.acknowledgeAlert(alertId, 'admin');
      
      assert.equal(acknowledged, true);
      assert.equal(monitor.activeAlerts.get(alertId).acknowledged, true);
      assert.equal(monitor.activeAlerts.get(alertId).acknowledgedBy, 'admin');
    });

    it('should return false for non-existent alert', () => {
      assert.equal(monitor.acknowledgeAlert('nonexistent'), false);
    });
  });

  describe('resolveAlert', () => {
    it('should resolve an alert', () => {
      monitor.addAlertRule({
        name: 'High Value',
        metric: 'test.metric',
        operator: 'gt',
        threshold: 10,
        severity: AlertSeverity.ERROR
      });
      
      monitor.increment('test.metric', 15);
      const alerts = monitor.evaluateRules();
      const alertId = alerts[0].id;
      
      const resolved = monitor.resolveAlert(alertId);
      
      assert.equal(resolved, true);
      assert.equal(monitor.activeAlerts.has(alertId), false);
    });

    it('should return false for non-existent alert', () => {
      assert.equal(monitor.resolveAlert('nonexistent'), false);
    });
  });

  describe('getActiveAlerts', () => {
    it('should return active alerts', () => {
      monitor.addAlertRule({
        name: 'High Value',
        metric: 'test.metric',
        operator: 'gt',
        threshold: 10,
        severity: AlertSeverity.ERROR
      });
      
      monitor.increment('test.metric', 15);
      monitor.evaluateRules();
      
      const alerts = monitor.getActiveAlerts();
      
      assert.equal(alerts.length, 1);
    });

    it('should filter by severity', () => {
      monitor.addAlertRule({
        name: 'Error Alert',
        metric: 'errors',
        operator: 'gt',
        threshold: 1,
        severity: AlertSeverity.ERROR
      });
      monitor.addAlertRule({
        name: 'Warning Alert',
        metric: 'warnings',
        operator: 'gt',
        threshold: 1,
        severity: AlertSeverity.WARNING
      });
      
      monitor.increment('errors', 5);
      monitor.increment('warnings', 5);
      monitor.evaluateRules();
      
      const errorAlerts = monitor.getActiveAlerts({ severity: AlertSeverity.ERROR });
      
      assert.equal(errorAlerts.length, 1);
      assert.equal(errorAlerts[0].severity, AlertSeverity.ERROR);
    });
  });

  describe('getAlertHistory', () => {
    it('should return alert history', () => {
      monitor.addAlertRule({
        name: 'High Value',
        metric: 'test.metric',
        operator: 'gt',
        threshold: 10,
        severity: AlertSeverity.ERROR
      });
      
      monitor.increment('test.metric', 15);
      monitor.evaluateRules();
      
      const history = monitor.getAlertHistory();
      
      assert.equal(history.length, 1);
    });

    it('should limit history size', () => {
      // Create multiple rules to bypass cooldown
      for (let i = 0; i < 5; i++) {
        monitor.addAlertRule({
          name: `High Value ${i}`,
          metric: `test.metric.${i}`,
          operator: 'gt',
          threshold: 0,
          severity: AlertSeverity.ERROR
        });
        monitor.increment(`test.metric.${i}`, 1);
        monitor.evaluateRules();
      }
      
      const history = monitor.getAlertHistory(3);
      
      assert.equal(history.length, 3);
    });
  });

  describe('takeSnapshot', () => {
    it('should take a snapshot', () => {
      const queue = new TaskQueue();
      monitor.registerComponent('queue', queue);
      queue.enqueue({ id: 't1', execute: async () => 'done' });
      
      const snapshot = monitor.takeSnapshot();
      
      assert.ok(snapshot.timestamp);
      assert.ok(snapshot.components.queue);
      assert.ok(snapshot.metrics);
    });
  });

  describe('getHealth', () => {
    it('should return healthy status', () => {
      const health = monitor.getHealth();
      
      assert.equal(health.status, 'healthy');
      assert.equal(health.activeAlerts, 0);
    });

    it('should return critical status with critical alerts', () => {
      monitor.addAlertRule({
        name: 'Critical',
        metric: 'critical',
        operator: 'gt',
        threshold: 0,
        severity: AlertSeverity.CRITICAL
      });
      
      monitor.increment('critical', 1);
      monitor.evaluateRules();
      
      const health = monitor.getHealth();
      
      assert.equal(health.status, 'critical');
    });

    it('should return degraded status with error alerts', () => {
      monitor.addAlertRule({
        name: 'Error',
        metric: 'errors',
        operator: 'gt',
        threshold: 0,
        severity: AlertSeverity.ERROR
      });
      
      monitor.increment('errors', 1);
      monitor.evaluateRules();
      
      const health = monitor.getHealth();
      
      assert.equal(health.status, 'degraded');
    });
  });

  describe('getStats', () => {
    it('should return monitor statistics', () => {
      monitor.addAlertRule({
        name: 'Test',
        metric: 'test',
        operator: 'gt',
        threshold: 1,
        severity: AlertSeverity.WARNING
      });
      
      const stats = monitor.getStats();
      
      assert.equal(stats.rules, 1);
      assert.equal(stats.components, 0);
    });
  });

  describe('getDashboardData', () => {
    it('should return dashboard data', () => {
      const data = monitor.getDashboardData();
      
      assert.ok(data.health);
      assert.ok(data.snapshot);
      assert.ok(data.recentAlerts);
      assert.ok(data.topMetrics);
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      monitor.increment('test.counter', 5);
      monitor.gauge('test.gauge', 10);
      
      monitor.clearMetrics();
      
      assert.equal(monitor.getMetric('test.counter'), null);
      assert.equal(monitor.getMetric('test.gauge'), null);
    });
  });

  describe('events', () => {
    it('should emit alert event', (t, done) => {
      monitor.on('alert', (alert) => {
        assert.equal(alert.name, 'High Value');
        done();
      });
      
      monitor.addAlertRule({
        name: 'High Value',
        metric: 'test.metric',
        operator: 'gt',
        threshold: 10,
        severity: AlertSeverity.ERROR
      });
      
      monitor.increment('test.metric', 15);
      monitor.evaluateRules();
    });
  });
});
