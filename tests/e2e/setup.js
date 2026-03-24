/**
 * @fileoverview E2E test setup for the dashboard HTTP surface.
 */

import { after as afterAll, before as beforeAll } from 'node:test';

import { DashboardServer } from '../../src/dashboard/server.js';

export const testContext = {
  server: null,
  baseUrl: null,
  authToken: null
};

export async function setupE2E() {
  const server = new DashboardServer({
    port: 0,
    host: '127.0.0.1',
    jwtSecret: 'e2e-secret'
  });

  await server.start();

  const address = server.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' })
  });

  if (!loginResponse.ok) {
    throw new Error(`Dashboard auth setup failed with status ${loginResponse.status}`);
  }

  const loginPayload = await loginResponse.json();

  testContext.server = server;
  testContext.baseUrl = baseUrl;
  testContext.authToken = loginPayload.token;

  return testContext;
}

export async function teardownE2E() {
  if (testContext.server) {
    await testContext.server.stop();
    testContext.server = null;
    testContext.baseUrl = null;
    testContext.authToken = null;
  }
}

export function createAuthenticatedClient(baseUrl = testContext.baseUrl, token = testContext.authToken) {
  return async (path, options = {}) => {
    const url = `${baseUrl}${path}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    return fetch(url, {
      ...options,
      headers
    });
  };
}

export async function waitForServer(healthUrl = `${testContext.baseUrl}/health`, timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return true;
      }
    } catch {
      // Server is still booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Server not ready after ${timeout}ms`);
}

export function createTestData(client = createAuthenticatedClient()) {
  return {
    async createTask(data = {}) {
      const response = await client('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          priority: 'medium',
          ...data
        })
      });

      return response.json();
    },

    async cleanupTasks() {
      const response = await client('/api/tasks');
      const payload = await response.json();

      for (const task of payload.tasks || []) {
        await client(`/api/tasks/${task.id}`, { method: 'DELETE' });
      }
    }
  };
}

export function setupNodeTestGlobals() {
  beforeAll(async () => {
    await setupE2E();
  }, 60000);

  afterAll(async () => {
    await teardownE2E();
  }, 30000);
}

export default {
  setupE2E,
  teardownE2E,
  createAuthenticatedClient,
  waitForServer,
  createTestData,
  setupNodeTestGlobals,
  testContext
};
