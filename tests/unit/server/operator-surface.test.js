import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CogniMeshServer, ServerStatus } from '../../../src/server.js';
import { SystemState } from '../../../src/bios/index.js';

function createMockResponse() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = { ...this.headers, ...headers };
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(payload = '') {
      this.body = typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf8');
    },
  };
}

function createServerStub() {
  const server = new CogniMeshServer({ skipDiagnostics: true });

  server._status = ServerStatus.RUNNING;
  server._startTime = Date.now() - 5000;
  server._bios = {
    getStatus() {
      return {
        state: SystemState.OPERATIONAL,
        uptime: 2500,
        components: ['core', 'monitor'],
        capabilities: { agentExecution: true },
      };
    },
  };
  server._tools = {
    count: 2,
    list() {
      return [{ name: 'tool.alpha' }, { name: 'tool.beta' }];
    },
    getStats() {
      return { registered: 2 };
    },
  };
  server._connectionPool = {
    getStats() {
      return { total: 1, inUse: 0, available: 1 };
    },
  };
  server._repositories = { isInitialized: true };
  server._wsServer = {
    isRunning() {
      return true;
    },
    getStats() {
      return { clients: 1, rooms: 0 };
    },
    getClientCount() {
      return 1;
    },
  };

  return server;
}

describe('CogniMeshServer operator routes', () => {
  it('serves real system status through /api/system/status', async () => {
    const server = createServerStub();
    const req = { method: 'GET', url: '/api/system/status', headers: {}, socket: {} };
    const res = createMockResponse();

    const handled = await server._handleRoute(req, res);

    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body);
    assert.equal(body.status, ServerStatus.RUNNING);
    assert.equal(body.healthy, true);
    assert.equal(body.bios.state, SystemState.OPERATIONAL);
    assert.equal(body.components.tools.registered, 2);
  });

  it('serves a live agent snapshot through /api/agents', async () => {
    const server = createServerStub();
    const req = { method: 'GET', url: '/api/agents', headers: {}, socket: {} };
    const res = createMockResponse();

    const handled = await server._handleRoute(req, res);

    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body);
    assert.equal(body.total >= 2, true);
    assert.ok(body.agents.some((agent) => agent.id === 'bios'));
    assert.ok(body.agents.some((agent) => agent.id === 'tools'));
  });

  it('does not throw when the API controller lacks an HTTP handle contract', async () => {
    const server = createServerStub();
    server._controller = {};

    const req = { method: 'GET', url: '/api/unknown', headers: {}, socket: {} };
    const res = createMockResponse();

    const handled = await server._handleRoute(req, res);

    assert.equal(handled, false);
    assert.equal(res.statusCode, null);
  });
});
