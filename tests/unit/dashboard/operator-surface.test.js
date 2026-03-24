import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { DashboardServer } from '../../../src/dashboard/server.js';

function startHttpServer(handler) {
  const server = createServer(handler);

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });

    server.on('error', reject);
  });
}

function stopHttpServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}

function listenExpressApp(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

describe('DashboardServer operator surface', () => {
  let dashboard;
  let dashboardHttp;
  let originalAdminPassword;

  beforeEach(() => {
    originalAdminPassword = process.env.ADMIN_PASSWORD;
  });

  afterEach(async () => {
    if (dashboardHttp) {
      await stopHttpServer(dashboardHttp);
      dashboardHttp = null;
    }

    if (dashboard) {
      await dashboard.stop().catch(() => {});
      dashboard = null;
    }

    if (originalAdminPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = originalAdminPassword;
    }
  });

  it('rejects incorrect admin credentials', async () => {
    process.env.ADMIN_PASSWORD = 'operator-secret';
    dashboard = new DashboardServer({
      authEnabled: true,
      jwtSecret: 'test-secret',
      apiBaseUrl: 'http://127.0.0.1:9',
    });

    dashboardHttp = await listenExpressApp(dashboard.app);
    const address = dashboardHttp.address();

    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'wrong-password',
      }),
    });

    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.error, 'Invalid credentials');
  });

  it('forwards system and agent routes to the real core backend path', async () => {
    const backendRequests = [];
    const backend = await startHttpServer((req, res) => {
      backendRequests.push(req.url);

      if (req.url === '/api/system/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'running',
          source: 'core-backend',
        }));
        return;
      }

      if (req.url === '/api/agents') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          agents: [{ id: 'bios', state: 'OPERATIONAL' }],
          source: 'core-backend',
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found', path: req.url }));
    });

    try {
      dashboard = new DashboardServer({
        authEnabled: false,
        apiBaseUrl: backend.baseUrl,
      });
      dashboardHttp = await listenExpressApp(dashboard.app);
      const address = dashboardHttp.address();

      const statusResponse = await fetch(`http://127.0.0.1:${address.port}/api/system/status`);
      assert.equal(statusResponse.status, 200);
      assert.deepEqual(await statusResponse.json(), {
        status: 'running',
        source: 'core-backend',
      });

      const agentsResponse = await fetch(`http://127.0.0.1:${address.port}/api/agents`);
      assert.equal(agentsResponse.status, 200);
      assert.deepEqual(await agentsResponse.json(), {
        agents: [{ id: 'bios', state: 'OPERATIONAL' }],
        source: 'core-backend',
      });

      assert.deepEqual(backendRequests, [
        '/api/system/status',
        '/api/agents',
      ]);
    } finally {
      await stopHttpServer(backend.server);
    }
  });
});
