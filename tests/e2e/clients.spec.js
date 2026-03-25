/**
 * @fileoverview E2E client surface tests for subscription-backed providers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ClaudeCliClient,
  ClaudeDesktopClient,
  ClientFactory,
  CodexCliClient,
  KimiCliClient,
  KimiSwarmClient,
  verifyCanonicalSubscriptionSurfaceMatrix
} from '../../src/clients/index.js';
import { TaskComplexityAnalyzer } from '../../src/clients/codex/cli.js';

describe('E2E Client Surface Tests', () => {
  it('verifies the canonical subscription surface matrix', () => {
    const verification = verifyCanonicalSubscriptionSurfaceMatrix();
    const matrix = Object.fromEntries(
      verification.matrix.map((entry) => [entry.modelId, entry.surfaces])
    );

    assert.equal(verification.ok, true);
    assert.deepEqual(matrix['claude-opus-4-6'], ['desktop', 'cli']);
    assert.deepEqual(matrix['claude-opus-4-5'], ['desktop', 'cli']);
    assert.deepEqual(matrix['claude-sonnet-4-6'], ['vscode', 'cli']);
    assert.deepEqual(matrix['claude-sonnet-4-5'], ['cli', 'vscode']);
    assert.deepEqual(matrix['gpt-5.4-codex'], ['vscode', 'app', 'cli']);
    assert.deepEqual(matrix['gpt-5.3-codex'], ['cli']);
    assert.deepEqual(matrix['kimi-k2-5'], ['vscode', 'cli']);
  });

  it('instantiates runtime candidates for every canonical model group via ClientFactory', async () => {
    const modelIds = [
      'gpt-5.3-codex',
      'gpt-5.4-codex',
      'claude-opus-4-6',
      'claude-opus-4-5',
      'claude-sonnet-4-6',
      'claude-sonnet-4-5',
      'kimi-k2-5'
    ];

    for (const modelId of modelIds) {
      const candidates = ClientFactory.getRuntimeCandidates(modelId);

      assert.ok(candidates.length > 0, `Expected runtime candidates for ${modelId}`);

      for (const candidate of candidates) {
        const client = await ClientFactory.create(candidate.provider, candidate.mode, {
          ...candidate.defaultConfig,
          model: candidate.clientModel,
          name: `${modelId}-${candidate.mode}-smoke`
        });

        assert.ok(client, `Expected client instance for ${modelId}/${candidate.mode}`);
        assert.equal(client.provider, candidate.provider);
        assert.equal(client.getCapabilities().mode, candidate.mode);
      }
    }
  });

  it('preserves Claude CLI local task helpers', () => {
    const client = new ClaudeCliClient({ name: 'test-claude-cli' });

    const taskCommand = client._buildTaskCommand({
      code: 'console.log("test")',
      language: 'javascript'
    });

    assert.match(taskCommand, /console\.log/);
    assert.match(taskCommand, /javascript/i);
    assert.equal(client._detectLanguage('test.ts'), 'typescript');
    assert.equal(client._detectLanguage('test.py'), 'python');
  });

  it('preserves local provider capabilities without API billing assumptions', () => {
    const claudeDesktop = new ClaudeDesktopClient({ name: 'claude-desktop' });
    const kimiCli = new KimiCliClient({
      name: 'kimi-cli',
      thinkingMode: true,
      multimodal: true,
      longContext: true
    });
    const kimiSwarm = new KimiSwarmClient({ name: 'kimi-swarm' });

    assert.equal(claudeDesktop.getCapabilities().mode, 'desktop');
    assert.equal(kimiCli.getCapabilities().provider, 'kimi');
    assert.equal(kimiCli.getCapabilities().featureFlags.thinkingMode, true);
    assert.equal(kimiCli.getCapabilities().featureFlags.multimodal, true);
    assert.equal(kimiCli.getCapabilities().featureFlags.longContext, true);
    assert.equal(kimiSwarm.getCapabilities().mode, 'swarm');
    assert.ok(kimiCli._estimateTokens('Hello world test') > 0);
  });

  it('keeps Codex local complexity, model selection, queueing, and metrics stable', async () => {
    const client = new CodexCliClient({
      name: 'test-codex-cli',
      autoModelSelection: true
    });

    const simpleTask = {
      description: 'Fix typo',
      code: 'const x = 1;'
    };
    const complexTask = {
      description: 'Implement complex distributed system with consensus algorithm',
      code: Array(300).fill('console.log("test");').join('\n'),
      files: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js']
    };

    const simpleScore = TaskComplexityAnalyzer.analyze(simpleTask);
    const complexScore = TaskComplexityAnalyzer.analyze(complexTask);

    assert.ok(simpleScore >= 0 && simpleScore <= 1);
    assert.ok(complexScore > simpleScore);
    assert.equal(await client.autoSelectModel(simpleTask), 'gpt-5.3-codex');
    assert.equal(await client.autoSelectModel(complexTask), 'gpt-5.4-codex');

    const queued = client.queueTask({ description: 'Queued task' });
    assert.equal(queued.queued, true);
    assert.equal(queued.position, 1);

    client._updateMetrics('gpt-5.4-codex', 1000, { total_tokens: 500 });
    const metrics = client.getMetrics();
    assert.equal(metrics.requests, 1);
    assert.equal(metrics.totalLatency, 1000);
    assert.equal(metrics.modelUsage['gpt-5.4-codex'].requests, 1);

    const comparison = client.compareCosts(complexTask);
    assert.ok(comparison.estimates['gpt-5.4-codex']);
    assert.ok(comparison.estimates['gpt-5.3-codex']);
    assert.ok(comparison.recommendation);

    client.resetMetrics();
    const resetMetrics = client.getMetrics();
    assert.equal(resetMetrics.requests, 0);
    assert.equal(resetMetrics.totalLatency, 0);
  });

  it('rejects unknown providers and modes through ClientFactory', async () => {
    await assert.rejects(
      ClientFactory.create('unknown', 'cli', {}),
      /Unknown provider/i
    );

    await assert.rejects(
      ClientFactory.create('claude', 'unknown', {}),
      /Unknown claude mode/i
    );
  });
});
