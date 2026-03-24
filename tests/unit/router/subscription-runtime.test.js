import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ModelRouter } from '../../../src/router/model-router.js';
import { FallbackSystem } from '../../../src/router/fallback.js';
import { SubscriptionRuntimeManager } from '../../../src/router/subscription-runtime.js';
import {
  getDefaultFallbackChains,
  normalizeModelId
} from '../../../src/clients/catalog.js';

describe('Subscription Runtime', () => {
  it('normalizes legacy model aliases to subscription-backed ids', () => {
    assert.equal(normalizeModelId('claude-opus-4'), 'claude-opus-4-6');
    assert.equal(normalizeModelId('kimi-k2'), 'kimi-k2-5');
    assert.equal(normalizeModelId('gpt-5.4-codex'), 'gpt-5.4-codex');
  });

  it('registers subscription-backed router defaults', async () => {
    const router = new ModelRouter({ enableCache: false });
    await router.initialize();

    const modelIds = router.getModels().map((model) => model.id);

    assert.ok(modelIds.includes('claude-sonnet-4-6'));
    assert.ok(modelIds.includes('gpt-5.4-codex'));
    assert.ok(modelIds.includes('gpt-5.3-codex'));
    assert.ok(modelIds.includes('kimi-k2-5'));
    assert.ok(!modelIds.includes('gpt-4o'));
    assert.ok(!modelIds.includes('gpt-4o-mini'));

    await router.shutdown();
  });

  it('registers subscription-backed fallback chains', async () => {
    const fallback = new FallbackSystem({ router: { routeTask() {}, executeOnModel() {} } });
    await fallback.initialize();

    const standard = fallback.getFallbackChain('standard');
    const economy = fallback.getFallbackChain('economy');

    assert.deepEqual(standard, getDefaultFallbackChains().standard);
    assert.deepEqual(economy, getDefaultFallbackChains().economy);
    assert.ok(!standard.includes('gpt-4o'));
    assert.ok(economy.includes('gpt-5.3-codex'));

    await fallback.shutdown();
  });

  it('attaches shared subscription executors without duplicating provider clients', async () => {
    const executors = new Map();
    const models = new Map();
    const createdClients = [];

    const router = {
      registerExecutor(modelId, executor) {
        executors.set(modelId, executor);
      },
      getModel(modelId) {
        if (!models.has(modelId)) {
          models.set(modelId, { id: modelId, available: true });
        }

        return models.get(modelId);
      }
    };

    const factory = {
      async create(provider, mode, config) {
        createdClients.push({ provider, mode, model: config.model });

        return {
          async initialize() {},
          async execute(task, options) {
            return {
              provider,
              mode,
              model: options.model,
              description: task.description
            };
          },
          async disconnect() {}
        };
      }
    };

    const runtime = new SubscriptionRuntimeManager({
      factory,
      skipUnavailable: false
    });

    const registeredModels = await runtime.registerExecutors(router);

    assert.ok(registeredModels.includes('gpt-5.4-codex'));
    assert.ok(registeredModels.includes('claude-sonnet-4-6'));
    assert.ok(registeredModels.includes('kimi-k2-5'));
    assert.equal(createdClients.length, 3);

    const codexResult = await executors.get('gpt-5.4-codex')({
      id: 'task-1',
      type: 'code',
      content: 'Implement the router binding'
    });

    assert.equal(codexResult.provider, 'codex');
    assert.equal(codexResult.mode, 'cli');
    assert.equal(codexResult.model, 'gpt-5.4-codex');
    assert.equal(codexResult.description, 'Implement the router binding');

    await runtime.shutdown();
  });
});
