#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  ClientFactory,
  verifyCanonicalSubscriptionSurfaceMatrix
} from '../src/clients/index.js';

const expectedModels = [
  'gpt-5.3-codex',
  'gpt-5.4-codex',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'kimi-k2-5'
];

async function main() {
  const verification = verifyCanonicalSubscriptionSurfaceMatrix();

  if (!verification.ok) {
    for (const issue of verification.issues) {
      console.error(`matrix issue: ${issue}`);
    }
    process.exit(1);
  }

  const matrixLines = [];

  for (const modelId of expectedModels) {
    const candidates = ClientFactory.getRuntimeCandidates(modelId);
    assert.ok(candidates.length > 0, `Expected runtime candidates for ${modelId}`);

    const surfaces = [];

    for (const candidate of candidates) {
      const client = await ClientFactory.create(candidate.provider, candidate.mode, {
        ...candidate.defaultConfig,
        model: candidate.clientModel,
        name: `${modelId}-${candidate.mode}-verify`
      });

      assert.ok(client, `Expected client instance for ${modelId}/${candidate.mode}`);
      assert.equal(client.provider, candidate.provider);
      assert.equal(client.getCapabilities().mode, candidate.mode);

      surfaces.push(candidate.mode);
    }

    matrixLines.push(`${modelId}: ${surfaces.join(', ')}`);
  }

  console.log('Verified canonical subscription surface matrix:');
  for (const line of matrixLines) {
    console.log(`- ${line}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
