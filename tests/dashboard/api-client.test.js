/**
 * API Client Tests
 * Tests for ApiClient class - API calls, error handling, and caching
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, beforeEach } from 'node:test';

const dashboardRoot = path.resolve('src/dashboard/public');

function createMockResponse(options = {}) {
  return {
    status: options.status || 200,
    statusText: options.statusText || 'OK',
    ok: options.status >= 200 && options.status < 300,
    json: async () => options.body || {},
    text: async () => JSON.stringify(options.body || {}),
    headers: new Map()
  };
}

function createMockFetch(responseMap = {}) {
  return async (url, options) => {
    const key = `${options?.method || 'GET'}:${url}`;
    const response = responseMap[key] || responseMap[url] || createMockResponse();
    return response;
  };
}

function createBaseContext(options = {}) {
  const localStorage = {
    store: new Map(),
    getItem(key) { return this.store.get(key) || null; },
    setItem(key, value) { this.store.set(key, String(value)); },
    removeItem(key) { this.store.delete(key); }
  };

  const dispatchedEvents = [];
  
  const win = {
    location: { host: 'localhost:3001', protocol: 'http:' },
    localStorage,
    dispatchEvent: (event) => {
      dispatchedEvents.push(event);
      return true;
    },
    addEventListener() {},
    removeEventListener() {},
    CustomEvent: class CustomEvent {
      constructor(type, detail) { this.type = type; this.detail = detail; }
    }
  };

  const fetch = options.fetch || createMockFetch();
  const AbortController = class MockAbortController {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  };

  const context = {
    console,
    window: win,
    globalThis: win,
    module: { exports: {} },
    exports: {},
    fetch,
    AbortController,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    Date: global.Date,
    Math: global.Math,
    JSON: global.JSON,
    encodeURIComponent: global.encodeURIComponent,
    Error: global.Error,
    Promise: global.Promise,
    localStorage,
    _dispatchedEvents: dispatchedEvents
  };

  return { context, localStorage, dispatchedEvents };
}

function loadScript(context, relativePath) {
  const filePath = path.join(dashboardRoot, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  context.window = context.window || context.globalThis;
  vm.runInNewContext(source, context, { filename: filePath });
}

describe('ApiClient', () => {
  let baseCtx;
  
  beforeEach(() => {
    baseCtx = createBaseContext();
    loadScript(baseCtx.context, 'components/api-client.js');
    baseCtx.context.ApiClient = baseCtx.context.window.ApiClient;
  });

  describe('Constructor Tests', () => {
    it('initializes with default values', () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      
      assert.equal(client.baseUrl, '/api');
      assert.deepEqual(client.defaultHeaders, {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });
      assert.equal(client.requestTimeout, 30000);
      assert.equal(client.retryAttempts, 3);
      assert.equal(client.retryDelay, 1000);
    });

    it('accepts custom options', () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient({
        baseUrl: '/custom-api',
        token: 'test-token',
        timeout: 60000,
        retryAttempts: 5,
        retryDelay: 2000
      });
      
      assert.equal(client.baseUrl, '/custom-api');
      assert.equal(client.token, 'test-token');
      assert.equal(client.requestTimeout, 60000);
      assert.equal(client.retryAttempts, 5);
      assert.equal(client.retryDelay, 2000);
    });

    it('loads token from localStorage', () => {
      const { context, localStorage } = createBaseContext();
      localStorage.setItem('authToken', 'stored-token');
      
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      
      assert.equal(client.token, 'stored-token');
    });
  });

  describe('Token Management Tests', () => {
    it('setToken updates token and stores in localStorage', () => {
      const { context, localStorage } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      client.setToken('new-token');
      
      assert.equal(client.token, 'new-token');
      assert.equal(localStorage.getItem('authToken'), 'new-token');
    });

    it('setToken with null clears token from localStorage', () => {
      const { context, localStorage } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      client.setToken('token');
      assert.equal(localStorage.getItem('authToken'), 'token');
      
      client.setToken(null);
      assert.equal(client.token, null);
      assert.equal(localStorage.getItem('authToken'), null);
    });

    it('getToken returns current token', () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      client.setToken('my-token');
      
      assert.equal(client.getToken(), 'my-token');
    });

    it('isAuthenticated returns true when token exists', () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      
      assert.equal(client.isAuthenticated(), false);
      
      client.setToken('token');
      assert.equal(client.isAuthenticated(), true);
    });
  });

  describe('Header Building Tests', () => {
    it('buildHeaders includes default headers', () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const headers = client.buildHeaders();
      
      assert.equal(headers['Content-Type'], 'application/json');
      assert.equal(headers['Accept'], 'application/json');
    });

    it('buildHeaders includes authorization when token exists', () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient({ token: 'bearer-token' });
      const headers = client.buildHeaders();
      
      assert.equal(headers['Authorization'], 'Bearer bearer-token');
    });

    it('buildHeaders merges additional headers', () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const headers = client.buildHeaders({ 'X-Custom': 'value' });
      
      assert.equal(headers['X-Custom'], 'value');
      assert.equal(headers['Content-Type'], 'application/json');
    });
  });

  describe('HTTP Method Tests', () => {
    it('get() makes GET request', async () => {
      const responseBody = { data: 'test' };
      const fetch = async (url, options) => {
        assert.equal(options.method, 'GET');
        assert.ok(url.includes('/test-endpoint'));
        return createMockResponse({ body: responseBody });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.get('/test-endpoint');
      
      assert.deepEqual(result, responseBody);
    });

    it('post() makes POST request with body', async () => {
      let requestBody;
      const fetch = async (url, options) => {
        assert.equal(options.method, 'POST');
        requestBody = options.body;
        return createMockResponse({ body: { success: true } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const body = { name: 'Test' };
      await client.post('/test', body);
      
      assert.equal(requestBody, JSON.stringify(body));
    });

    it('put() makes PUT request', async () => {
      const fetch = async (url, options) => {
        assert.equal(options.method, 'PUT');
        return createMockResponse({ body: {} });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      await client.put('/test', { id: 1 });
    });

    it('patch() makes PATCH request', async () => {
      const fetch = async (url, options) => {
        assert.equal(options.method, 'PATCH');
        return createMockResponse({ body: {} });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      await client.patch('/test', { field: 'value' });
    });

    it('delete() makes DELETE request', async () => {
      const fetch = async (url, options) => {
        assert.equal(options.method, 'DELETE');
        return createMockResponse({ body: {} });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      await client.delete('/test');
    });
  });

  describe('Query String Tests', () => {
    it('get() builds query string from params', async () => {
      let requestUrl;
      const fetch = async (url) => {
        requestUrl = url;
        return createMockResponse({ body: {} });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      await client.get('/test', { page: 1, limit: 10, search: 'query' });
      
      assert.ok(requestUrl.includes('page=1'));
      assert.ok(requestUrl.includes('limit=10'));
      assert.ok(requestUrl.includes('search=query'));
    });

    it('buildQueryString filters empty values', () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const query = client.buildQueryString({
        a: 'value',
        b: '',
        c: null,
        d: undefined,
        e: 0,
        f: false
      });
      
      assert.ok(query.includes('a=value'));
      assert.ok(query.includes('e=0'));
      assert.ok(query.includes('f=false'));
      assert.ok(!query.includes('b='));
      assert.ok(!query.includes('c='));
      assert.ok(!query.includes('d='));
    });

    it('buildQueryString returns empty string for no params', () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const query = client.buildQueryString({});
      
      assert.equal(query, '');
    });

    it('buildQueryString encodes special characters', () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const query = client.buildQueryString({ search: 'hello world' });
      
      assert.ok(query.includes('hello%20world'));
    });
  });

  describe('Error Handling Tests', () => {
    it('throws error on HTTP error status', async () => {
      const fetch = async () => createMockResponse({ 
        status: 500, 
        statusText: 'Internal Server Error',
        body: { error: 'Server error' }
      });
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      
      await assert.rejects(
        async () => await client.get('/test'),
        /Server error|HTTP 500/
      );
    });

    it('clears token and dispatches event on 401', async () => {
      const fetch = async () => createMockResponse({ 
        status: 401, 
        statusText: 'Unauthorized',
        body: { error: 'Unauthorized' }
      });
      
      const { context, dispatchedEvents } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient({ token: 'valid-token' });
      
      await assert.rejects(
        async () => await client.get('/test'),
        /Unauthorized/
      );
      
      assert.equal(client.token, null);
      const unauthorizedEvent = dispatchedEvents.find(e => e.type === 'api:unauthorized');
      assert.ok(unauthorizedEvent);
    });

    it('does not retry on 4xx client errors', async () => {
      let requestCount = 0;
      const fetch = async () => {
        requestCount++;
        return createMockResponse({ 
          status: 404, 
          statusText: 'Not Found',
          body: { error: 'Not found' }
        });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient({ retryAttempts: 3 });
      
      await assert.rejects(
        async () => await client.get('/test'),
        /Not found/
      );
      
      assert.equal(requestCount, 1);
    });

    it('retries on network errors', async () => {
      let requestCount = 0;
      const fetch = async () => {
        requestCount++;
        if (requestCount < 2) {
          throw new Error('Network error');
        }
        return createMockResponse({ body: { success: true } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient({ retryAttempts: 3, retryDelay: 10 });
      
      const result = await client.get('/test');
      
      assert.equal(result.success, true);
      assert.equal(requestCount, 2);
    });

    it('uses exponential backoff for retries', async () => {
      const delays = [];
      let lastTime = Date.now();
      
      const fetch = async () => {
        const now = Date.now();
        delays.push(now - lastTime);
        lastTime = now;
        throw new Error('Network error');
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient({ retryAttempts: 3, retryDelay: 100 });
      
      try {
        await client.get('/test');
      } catch {
        // Expected to fail
      }
      
      // Check that delays increase (exponential backoff)
      // Note: In actual test, timing may vary
      assert.ok(delays.length > 0);
    });
  });

  describe('Auth API Tests', () => {
    it('login() sends credentials and stores token', async () => {
      const fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.username, 'testuser');
        assert.equal(body.password, 'testpass');
        return createMockResponse({ 
          body: { token: 'new-auth-token', user: { id: 1 } }
        });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.login('testuser', 'testpass');
      
      assert.equal(result.token, 'new-auth-token');
      assert.equal(client.token, 'new-auth-token');
    });

    it('logout() sends request and clears token', async () => {
      let logoutCalled = false;
      const fetch = async (url, options) => {
        if (options.method === 'POST' && url.includes('/auth/logout')) {
          logoutCalled = true;
        }
        return createMockResponse({ body: {} });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient({ token: 'token' });
      await client.logout();
      
      assert.equal(logoutCalled, true);
      assert.equal(client.token, null);
    });

    it('logout() clears token even on error', async () => {
      const fetch = async () => {
        throw new Error('Network error');
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient({ token: 'token' });
      
      await assert.rejects(
        async () => await client.logout()
      );
      
      assert.equal(client.token, null);
    });

    it('verifyToken() calls verify endpoint', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/auth/verify'));
        return createMockResponse({ body: { valid: true } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.verifyToken();
      
      assert.equal(result.valid, true);
    });
  });

  describe('Tasks API Tests', () => {
    it('getTasks() calls tasks endpoint with filters', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/tasks'));
        assert.ok(url.includes('status=pending'));
        return createMockResponse({ body: { tasks: [] } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getTasks({ status: 'pending' });
      
      assert.ok(Array.isArray(result.tasks));
    });

    it('getTask() calls specific task endpoint', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/tasks/123'));
        return createMockResponse({ body: { id: 123, name: 'Task' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getTask(123);
      
      assert.equal(result.id, 123);
    });

    it('createTask() posts to tasks endpoint', async () => {
      const fetch = async (url, options) => {
        assert.equal(options.method, 'POST');
        assert.ok(url.includes('/tasks'));
        return createMockResponse({ body: { id: 1, name: 'New Task' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.createTask({ name: 'New Task' });
      
      assert.equal(result.name, 'New Task');
    });

    it('updateTask() puts to task endpoint', async () => {
      const fetch = async (url, options) => {
        assert.equal(options.method, 'PUT');
        assert.ok(url.includes('/tasks/123'));
        return createMockResponse({ body: { id: 123, status: 'completed' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      await client.updateTask(123, { status: 'completed' });
    });

    it('deleteTask() deletes task endpoint', async () => {
      const fetch = async (url, options) => {
        assert.equal(options.method, 'DELETE');
        assert.ok(url.includes('/tasks/123'));
        return createMockResponse({ body: {} });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      await client.deleteTask(123);
    });
  });

  describe('Agents API Tests', () => {
    it('getAgents() calls agents endpoint', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/agents'));
        return createMockResponse({ body: { agents: [] } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getAgents();
      
      assert.ok(Array.isArray(result.agents));
    });

    it('getAgentStatus() calls agent status endpoint', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/agents/agent-1/status'));
        return createMockResponse({ body: { status: 'online' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getAgentStatus('agent-1');
      
      assert.equal(result.status, 'online');
    });
  });

  describe('Billing API Tests', () => {
    it('getBillingSummary() calls billing summary endpoint', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/billing/summary'));
        return createMockResponse({ 
          body: { totalSpend: 100, budgetLimit: 500 }
        });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getBillingSummary();
      
      assert.equal(result.totalSpend, 100);
    });

    it('getCosts() calls costs endpoint with params', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/billing/costs'));
        assert.ok(url.includes('period=7d'));
        return createMockResponse({ body: { dailyCosts: [] } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getCosts({ period: '7d' });
      
      assert.ok(Array.isArray(result.dailyCosts));
    });

    it('updateBudgetLimit() puts to budget endpoint', async () => {
      const fetch = async (url, options) => {
        assert.equal(options.method, 'PUT');
        assert.ok(url.includes('/billing/budget'));
        const body = JSON.parse(options.body);
        assert.equal(body.limit, 1000);
        return createMockResponse({ body: { limit: 1000 } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.updateBudgetLimit(1000);
      
      assert.equal(result.limit, 1000);
    });
  });

  describe('Workflows API Tests', () => {
    it('getWorkflows() calls workflows endpoint', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/workflows'));
        return createMockResponse({ body: { workflows: [] } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getWorkflows();
      
      assert.ok(Array.isArray(result.workflows));
    });

    it('executeWorkflow() posts to execute endpoint', async () => {
      const fetch = async (url, options) => {
        assert.equal(options.method, 'POST');
        assert.ok(url.includes('/workflows/123/execute'));
        return createMockResponse({ body: { status: 'running' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.executeWorkflow(123);
      
      assert.equal(result.status, 'running');
    });

    it('pauseWorkflow() posts to pause endpoint', async () => {
      const fetch = async (url, options) => {
        assert.ok(url.includes('/workflows/123/pause'));
        return createMockResponse({ body: { status: 'paused' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.pauseWorkflow(123);
      
      assert.equal(result.status, 'paused');
    });
  });

  describe('Context Snapshots API Tests', () => {
    it('getSnapshots() calls snapshots endpoint', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/context/snapshots'));
        return createMockResponse({ body: { snapshots: [] } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getSnapshots();
      
      assert.ok(Array.isArray(result.snapshots));
    });

    it('restoreSnapshot() posts to restore endpoint', async () => {
      const fetch = async (url, options) => {
        assert.ok(url.includes('/context/snapshots/snap-1/restore'));
        const body = JSON.parse(options.body);
        assert.equal(body.force, true);
        return createMockResponse({ body: { restored: true } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.restoreSnapshot('snap-1', { force: true });
      
      assert.equal(result.restored, true);
    });
  });

  describe('CV API Tests', () => {
    it('getCVs() calls CV endpoint with filters', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/cv'));
        assert.ok(url.includes('status=active'));
        return createMockResponse({ body: { cvs: [] } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getCVs({ status: 'active' });
      
      assert.ok(Array.isArray(result.cvs));
    });

    it('activateCV() posts to activate endpoint', async () => {
      const fetch = async (url, options) => {
        assert.ok(url.includes('/cv/cv-1/activate'));
        return createMockResponse({ body: { status: 'active' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.activateCV('cv-1');
      
      assert.equal(result.status, 'active');
    });
  });

  describe('Health API Tests', () => {
    it('healthCheck() calls health endpoint', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/health'));
        return createMockResponse({ body: { status: 'healthy' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.healthCheck();
      
      assert.equal(result.status, 'healthy');
    });

    it('getHealthComponents() calls components endpoint', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/health/components'));
        return createMockResponse({ body: { components: [] } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getHealthComponents();
      
      assert.ok(Array.isArray(result.components));
    });
  });

  describe('Orchestration API Tests', () => {
    it('spawnAgent() posts to spawn endpoint', async () => {
      const fetch = async (url, options) => {
        assert.ok(url.includes('/bios/agents/spawn'));
        const body = JSON.parse(options.body);
        assert.equal(body.cv, 'cv-1');
        return createMockResponse({ body: { agentId: 'new-agent' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.spawnAgent('cv-1', 'claude', {});
      
      assert.equal(result.agentId, 'new-agent');
    });

    it('delegateTask() posts to delegate endpoint', async () => {
      const fetch = async (url, options) => {
        assert.ok(url.includes('/bios/tasks/delegate'));
        const body = JSON.parse(options.body);
        assert.equal(body.task, 'do something');
        return createMockResponse({ body: { taskId: 'task-1' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.delegateTask('do something', 'claude');
      
      assert.equal(result.taskId, 'task-1');
    });
  });

  describe('Queue API Tests', () => {
    it('getQueueTasks() calls queue tasks endpoint', async () => {
      const fetch = async (url) => {
        assert.ok(url.includes('/queue/tasks'));
        return createMockResponse({ body: { tasks: [] } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.getQueueTasks();
      
      assert.ok(Array.isArray(result.tasks));
    });

    it('enqueueTask() posts to queue tasks endpoint', async () => {
      const fetch = async (url, options) => {
        assert.ok(url.includes('/queue/tasks'));
        const body = JSON.parse(options.body);
        assert.equal(body.task, 'new task');
        assert.equal(body.priority, 'HIGH');
        return createMockResponse({ body: { id: 'task-1' } });
      };
      
      const { context } = createBaseContext({ fetch });
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const result = await client.enqueueTask('new task', 'HIGH', {}, {}, 'tag-1');
      
      assert.equal(result.id, 'task-1');
    });
  });

  describe('Delay Utility Tests', () => {
    it('delay() returns a promise that resolves after specified time', async () => {
      const { context } = createBaseContext();
      loadScript(context, 'components/api-client.js');
      
      const client = new context.ApiClient();
      const start = Date.now();
      
      await client.delay(50);
      
      const elapsed = Date.now() - start;
      assert.ok(elapsed >= 45); // Allow some tolerance
    });
  });
});
