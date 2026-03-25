/**
 * @fileoverview E2E test utilities for the node:test runtime.
 */

export {
  setupE2E,
  teardownE2E,
  createAuthenticatedClient,
  waitForServer,
  createTestData,
  setupNodeTestGlobals,
  testContext
} from './setup.js';

export { describe, it, before as beforeAll, after as afterAll } from 'node:test';
export { expect } from './expect.js';

export const E2E_METADATA = {
  version: '2.0.0',
  description: 'CogniMesh E2E Test Suite',
  testFiles: [
    'flows.spec.js',
    'clients.spec.js'
  ],
  supportedClients: [
    'ClaudeCliClient',
    'ClaudeDesktopClient',
    'KimiCliClient',
    'CodexCliClient'
  ],
  flows: [
    'Dashboard Auth',
    'Task Management',
    'Roadmap Progress',
    'Client Surface Verification'
  ]
};

export const DEFAULT_CONFIG = {
  port: 0,
  host: '127.0.0.1',
  environment: 'test',
  timeouts: {
    setup: 60000,
    teardown: 30000,
    test: 30000
  }
};

export default {
  E2E_METADATA,
  DEFAULT_CONFIG
};
