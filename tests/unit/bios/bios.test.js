/**
 * @fileoverview Unit tests for the current BIOS public surface.
 */

import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { CogniMeshBIOS, SystemState } from '../../../src/bios/index.js';

describe('BIOS Core', () => {
  let bios;
  let originalGithubToken;

  beforeEach(() => {
    originalGithubToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'github_test_token';
    bios = new CogniMeshBIOS();
  });

  afterEach(async () => {
    await bios.reset({ force: true });

    if (originalGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalGithubToken;
    }

    mock.restoreAll();
  });

  it('boots into operational mode and reports status', async () => {
    const booted = await bios.boot({ skipDiagnostics: true });

    assert.equal(booted, true);
    assert.equal(bios.state, SystemState.OPERATIONAL);

    const status = bios.getStatus();
    assert.equal(status.state, SystemState.OPERATIONAL);
    assert.equal(status.version, CogniMeshBIOS.VERSION);
    assert.ok(status.bootTime);
    assert.ok(status.uptime >= 0);
    assert.equal(status.capabilities.agentExecution, true);
  });

  it('registers, lists, and unregisters components', () => {
    const component = {
      type: 'worker',
      healthCheck: async () => ({ healthy: true }),
      shutdown: mock.fn(async () => undefined)
    };

    bios.registerComponent('worker-1', component);

    assert.equal(bios.getComponent('worker-1'), component);
    assert.deepEqual(bios.getAllComponents(), [{
      id: 'worker-1',
      type: 'worker',
      hasHealthCheck: true,
      hasShutdown: true
    }]);

    assert.equal(bios.unregisterComponent('worker-1'), true);
    assert.equal(bios.getComponent('worker-1'), undefined);
  });

  it('transitions across valid states and records transition history', async () => {
    await bios.boot({ skipDiagnostics: true });

    await bios.transitionTo(SystemState.MAINTENANCE);
    await bios.transitionTo(SystemState.OPERATIONAL);
    await bios.transitionTo(SystemState.DIAGNOSE);

    const history = bios.getTransitionHistory({ limit: 3 });

    assert.equal(bios.state, SystemState.DIAGNOSE);
    assert.equal(history.length, 3);
    assert.equal(history[0].to, SystemState.DIAGNOSE);
    assert.equal(history[1].to, SystemState.OPERATIONAL);
    assert.equal(history[2].to, SystemState.MAINTENANCE);
  });

  it('rejects invalid state transitions', async () => {
    await assert.rejects(
      bios.transitionTo(SystemState.MAINTENANCE),
      /Invalid state transition/i
    );
  });

  it('updates configuration and resets back to boot state', async () => {
    await bios.boot({ skipDiagnostics: true });
    bios.updateConfig({ logLevel: 'debug', autoUpdate: true });

    assert.equal(bios.config.logLevel, 'debug');
    assert.equal(bios.config.autoUpdate, true);

    await bios.reset({ force: true });

    assert.equal(bios.state, SystemState.BOOT);
    assert.equal(bios.previousState, null);
    assert.equal(bios.bootTime, null);
    assert.deepEqual(bios.getTransitionHistory(), []);
    assert.deepEqual(bios.getErrorLog(), []);
  });
});
