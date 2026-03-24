import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it } from 'node:test';

const dashboardRoot = path.resolve('src/dashboard/public');

function createClassList() {
  return {
    add() {},
    remove() {},
    contains() {
      return false;
    },
    toggle() {
      return false;
    }
  };
}

function createElementStub() {
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    style: {},
    dataset: {},
    classList: createClassList(),
    appendChild() {},
    remove() {},
    focus() {},
    setAttribute() {},
    querySelector() {
      return createElementStub();
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
    getContext() {
      return {};
    }
  };
}

function createBaseContext() {
  const listeners = new Map();
  const store = new Map();
  const windowListeners = new Map();

  const document = {
    hidden: false,
    body: createElementStub(),
    createElement() {
      return createElementStub();
    },
    addEventListener(event, handler) {
      listeners.set(event, handler);
    },
    removeEventListener(event) {
      listeners.delete(event);
    },
    querySelector() {
      return createElementStub();
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return createElementStub();
    }
  };

  const window = {
    location: {
      host: 'localhost:3001',
      protocol: 'http:'
    },
    addEventListener(event, handler) {
      windowListeners.set(event, handler);
    },
    removeEventListener(event) {
      windowListeners.delete(event);
    }
  };

  const context = {
    console,
    document,
    window,
    globalThis: window,
    module: { exports: {} },
    exports: {},
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({})
    }),
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      }
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    EventTarget: class EventTargetStub {
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return true;
      }
    }
  };

  window.window = window;
  window.document = document;
  window.localStorage = context.localStorage;
  window.fetch = context.fetch;
  window.console = console;
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  window.setInterval = setInterval;
  window.clearInterval = clearInterval;

  return {
    context,
    listeners,
    windowListeners
  };
}

function loadScript(context, relativePath) {
  const filePath = path.join(dashboardRoot, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(source, context, { filename: filePath });
}

describe('dashboard browser shell', () => {
  it('exposes public browser constructors without module tooling', () => {
    const { context } = createBaseContext();
    context.window.Chart = class ChartStub {
      destroy() {}
    };
    context.window.Sortable = class SortableStub {
      destroy() {}
    };
    context.window.lucide = { createIcons() {} };

    loadScript(context, 'components/api-client.js');
    loadScript(context, 'components/websocket-client.js');
    loadScript(context, 'components/tasks-component.js');
    loadScript(context, 'components/roadmaps-component.js');
    loadScript(context, 'components/analytics-component.js');
    loadScript(context, 'components/alerts-component.js');
    loadScript(context, 'components/dashboard-app.js');

    assert.equal(typeof context.window.ApiClient, 'function');
    assert.equal(typeof context.window.WebSocketClient, 'function');
    assert.equal(typeof context.window.TasksComponent, 'function');
    assert.equal(typeof context.window.RoadmapsComponent, 'function');
    assert.equal(typeof context.window.AnalyticsComponent, 'function');
    assert.equal(typeof context.window.AlertsComponent, 'function');
    assert.equal(typeof context.window.DashboardApp, 'function');

    const app = new context.window.DashboardApp({
      apiBaseUrl: '/api',
      wsUrl: 'ws://localhost:3001/ws'
    });

    assert.ok(app.api);
    assert.ok(app.ws);
    assert.equal(app.currentView, 'dashboard');
  });

  it('boots the browser entrypoint with guarded globals', async () => {
    const { context, listeners, windowListeners } = createBaseContext();
    let iconBooted = false;

    class DashboardAppStub {
      constructor(options) {
        this.options = options;
        this.initializeCalls = 0;
        this.hiddenCalls = 0;
        this.visibleCalls = 0;
        this.disposed = false;
      }

      async initialize() {
        this.initializeCalls += 1;
      }

      onPageHidden() {
        this.hiddenCalls += 1;
      }

      onPageVisible() {
        this.visibleCalls += 1;
      }

      dispose() {
        this.disposed = true;
      }
    }

    context.window.DashboardApp = DashboardAppStub;
    context.window.lucide = {
      createIcons() {
        iconBooted = true;
      }
    };

    loadScript(context, 'app.js');

    const domReady = listeners.get('DOMContentLoaded');
    const visibilityChange = listeners.get('visibilitychange');
    const beforeUnload = windowListeners.get('beforeunload');

    assert.equal(typeof domReady, 'function');
    assert.equal(typeof visibilityChange, 'function');
    assert.equal(typeof beforeUnload, 'function');

    await domReady();
    await Promise.resolve();

    assert.equal(iconBooted, true);
    assert.ok(context.window.dashboardApp instanceof DashboardAppStub);
    assert.equal(context.window.dashboardApp.initializeCalls, 1);

    context.document.hidden = true;
    visibilityChange();
    assert.equal(context.window.dashboardApp.hiddenCalls, 1);

    context.document.hidden = false;
    visibilityChange();
    assert.equal(context.window.dashboardApp.visibleCalls, 1);

    beforeUnload();
    assert.equal(context.window.dashboardApp.disposed, true);
  });
});
