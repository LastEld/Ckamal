/**
 * @fileoverview Unit tests for the current CV registry public surface.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CVRegistry } from '../../../src/bios/cv-registry.js';
import { createDefaultCV } from '../../../src/bios/cv-schema.js';

function makeCV(id, name, overrides = {}) {
  const cv = createDefaultCV(id, name);
  cv.capabilities.languages = ['javascript'];
  cv.capabilities.domains = ['backend'];
  cv.capabilities.tools = ['codex'];
  cv.lifecycle.status = 'active';
  return {
    ...cv,
    ...overrides,
    capabilities: {
      ...cv.capabilities,
      ...(overrides.capabilities || {})
    },
    lifecycle: {
      ...cv.lifecycle,
      ...(overrides.lifecycle || {})
    }
  };
}

describe('CV Registry', () => {
  it('registers and retrieves valid CVs', () => {
    const registry = new CVRegistry();
    const cv = makeCV('cv_backend', 'Backend Agent');

    registry.registerCV(cv);

    assert.equal(registry.getCV('cv_backend')?.id, 'cv_backend');
    assert.equal(registry.listCVs().total, 1);
  });

  it('rejects invalid and duplicate CVs', () => {
    const registry = new CVRegistry();
    const cv = makeCV('cv_dup', 'Duplicate Agent');

    registry.registerCV(cv);

    assert.throws(
      () => registry.registerCV({ name: 'Invalid CV' }),
      /validation failed/i
    );
    assert.throws(
      () => registry.registerCV(cv),
      /already exists/i
    );
  });

  it('updates CVs and keeps indexes searchable', () => {
    const registry = new CVRegistry();
    registry.registerCV(makeCV('cv_search', 'Search Agent'));

    registry.updateCV('cv_search', {
      capabilities: {
        languages: ['javascript', 'python'],
        domains: ['backend', 'ml'],
        tools: ['codex', 'kimi']
      }
    });

    const matches = registry.findCVs({
      languages: ['python'],
      domains: ['ml'],
      tools: ['kimi']
    });

    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, 'cv_search');
  });

  it('tracks performance metrics and registry stats', () => {
    const registry = new CVRegistry();
    registry.registerCV(makeCV('cv_perf', 'Performance Agent'));

    const performance = registry.updatePerformance('cv_perf', {
      tasksSucceeded: 8,
      tasksFailed: 2,
      avgLatency: 150
    });

    assert.equal(performance.successRate, 0.8);
    assert.equal(performance.tasksCompleted, 10);

    const stats = registry.getStats();
    assert.equal(stats.totalCVs, 1);
    assert.equal(stats.byStatus.active, 1);
  });

  it('supports templates, pagination, and unregistering', () => {
    const registry = new CVRegistry();

    registry.registerTemplate('backend-template', {
      capabilities: { languages: ['javascript'] }
    });

    registry.registerCV(makeCV('cv_a', 'Alpha Agent'));
    registry.registerCV(makeCV('cv_b', 'Beta Agent'));

    const page = registry.listCVs({
      pagination: {
        offset: 0,
        limit: 1
      }
    });

    assert.deepEqual(registry.getTemplate('backend-template'), {
      capabilities: { languages: ['javascript'] }
    });
    assert.equal(page.cvs.length, 1);
    assert.equal(page.total, 2);
    assert.equal(page.hasMore, true);
    assert.equal(registry.unregisterCV('cv_a'), true);
    assert.equal(registry.getCV('cv_a'), null);
  });
});
