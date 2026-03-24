/**
 * Backup Scheduler unit tests for the current node:test runtime.
 */

import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import cron from 'node-cron';

import { BackupScheduler } from '../../../src/db/backup-scheduler.js';

describe('BackupScheduler', () => {
  let scheduler;
  let scheduledTask;

  beforeEach(() => {
    scheduledTask = {
      stop: mock.fn()
    };

    mock.method(cron, 'validate', () => true);
    mock.method(cron, 'schedule', () => scheduledTask);

    scheduler = new BackupScheduler({
      schedule: '0 2 * * *',
      retentionDays: 14,
      verifyBackups: false
    });

    scheduler.manager = {
      initialize: mock.fn(async () => undefined),
      createBackup: mock.fn(async () => ({
        path: '/backups/backup-test.db',
        metadata: {
          name: 'backup-test',
          createdAt: new Date().toISOString(),
          size: 1024,
          version: '5.0.0'
        }
      })),
      cleanupOldBackups: mock.fn(async () => ({ deleted: 0 }))
    };
  });

  afterEach(() => {
    scheduler.stopScheduler();
    mock.restoreAll();
  });

  it('initializes and starts the scheduler with a valid cron expression', async () => {
    await scheduler.initialize();
    scheduler.startScheduler();

    assert.equal(scheduler.running, true);
    assert.equal(scheduler.manager.initialize.mock.calls.length, 1);
    assert.equal(cron.schedule.mock.calls.length, 1);
  });

  it('rejects invalid cron expressions', () => {
    mock.restoreAll();
    mock.method(cron, 'validate', () => false);

    assert.throws(
      () => scheduler.startScheduler(),
      /Invalid cron schedule/i
    );
  });

  it('stops a running scheduler cleanly', async () => {
    await scheduler.initialize();
    scheduler.startScheduler();
    scheduler.stopScheduler();

    assert.equal(scheduler.running, false);
    assert.equal(scheduler.task, null);
    assert.equal(scheduledTask.stop.mock.calls.length, 1);
  });

  it('runs the scheduled backup pipeline and records success metrics', async () => {
    await scheduler.initialize();
    const result = await scheduler.runScheduledBackup();
    const metrics = scheduler.getMetrics();

    assert.equal(result.success, true);
    assert.equal(scheduler.manager.createBackup.mock.calls.length, 1);
    assert.equal(scheduler.manager.cleanupOldBackups.mock.calls.length, 1);
    assert.equal(metrics.totalBackups, 1);
    assert.equal(metrics.successfulBackups, 1);
    assert.equal(metrics.lastBackupSize, 1024);
  });

  it('records failed backup runs honestly', async () => {
    scheduler.manager.createBackup = mock.fn(async () => {
      throw new Error('Backup failed');
    });

    await scheduler.initialize();
    const result = await scheduler.runScheduledBackup();
    const metrics = scheduler.getMetrics();

    assert.equal(result.success, false);
    assert.match(result.error, /Backup failed/i);
    assert.equal(metrics.totalBackups, 1);
    assert.equal(metrics.failedBackups, 1);
  });

  it('reports scheduler status and metric history', async () => {
    await scheduler.initialize();
    scheduler.startScheduler();
    await scheduler.runScheduledBackup();

    const status = scheduler.getStatus();
    const metrics = scheduler.getMetrics();

    assert.equal(status.running, true);
    assert.equal(status.schedule, '0 2 * * *');
    assert.equal(status.retentionDays, 14);
    assert.equal(status.s3Enabled, false);
    assert.ok(status.nextRun);
    assert.equal(metrics.recentHistory.length, 1);
    assert.equal(metrics.recentHistory[0].type, 'success');
  });
});
