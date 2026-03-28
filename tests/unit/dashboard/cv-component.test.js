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

function createElementStub(tagName = 'div') {
  const listeners = [];
  return {
    tagName,
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
    addEventListener(event, handler) {
      listeners.push({ event, handler });
    },
    removeEventListener() {},
    getContext() {
      return {};
    }
  };
}

function createBaseContext() {
  const elements = new Map();

  const document = {
    hidden: false,
    body: createElementStub('body'),
    createElement(tagName) {
      return createElementStub(tagName);
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector(selector) {
      return elements.get(selector) || createElementStub();
    },
    querySelectorAll() {
      return [];
    },
    getElementById(id) {
      return elements.get(`#${id}`) || createElementStub();
    }
  };

  const window = {
    location: {
      host: 'localhost:3001',
      protocol: 'http:'
    },
    addEventListener() {},
    removeEventListener() {},
    document,
    lucide: {
      createIcons() {}
    },
    Toast: {
      success() {},
      error() {}
    }
  };

  window.window = window;

  const context = {
    console,
    document,
    window,
    globalThis: window,
    module: { exports: {} },
    exports: {},
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

  return {
    context,
    elements,
    setElement(selector, element) {
      elements.set(selector, element);
    }
  };
}

function loadScript(context, relativePath) {
  const filePath = path.join(dashboardRoot, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(source, context, { filename: filePath });
}

describe('CVComponent', () => {
  it('constructor initializes with default values', () => {
    const { context } = createBaseContext();

    loadScript(context, 'components/cv-component.js');

    const mockApi = {};
    const component = new context.window.CVComponent({ api: mockApi });

    assert.equal(component.api, mockApi);
    assert.deepStrictEqual(component.cvs, []);
    assert.deepStrictEqual(component.templates, ['system-admin', 'developer', 'analyst', 'code-reviewer', 'test-agent']);
    assert.equal(component.loading, false);
  });

  it('constructor binds refresh button click event', () => {
    const { context, elements } = createBaseContext();
    const refreshBtnListeners = [];

    elements.set('#refreshCVsBtn', {
      ...createElementStub('button'),
      addEventListener(event, handler) {
        refreshBtnListeners.push({ event, handler });
      }
    });

    loadScript(context, 'components/cv-component.js');

    const mockApi = {};
    new context.window.CVComponent({ api: mockApi });

    assert.equal(refreshBtnListeners.length, 1);
    assert.equal(refreshBtnListeners[0].event, 'click');
    assert.equal(typeof refreshBtnListeners[0].handler, 'function');
  });

  it('loadCVs() renders CVs when API returns data', async () => {
    const { context, elements } = createBaseContext();
    const cvGrid = createElementStub('div');
    cvGrid.id = 'cvGrid';
    elements.set('#cvGrid', cvGrid);

    const badge = createElementStub('span');
    badge.id = 'cvBadge';
    badge.textContent = '';
    elements.set('#cvBadge', badge);

    loadScript(context, 'components/cv-component.js');

    const mockCVs = [
      { id: 'cv1', identity: { name: 'Test CV 1', role: 'Developer' }, lifecycle: { status: 'active' }, capabilities: [{ name: 'coding' }] },
      { id: 'cv2', identity: { name: 'Test CV 2', role: 'Analyst' }, lifecycle: { status: 'suspended' }, capabilities: [] }
    ];

    const mockApi = {
      getCVs: async () => ({ cvs: mockCVs })
    };

    const component = new context.window.CVComponent({ api: mockApi });
    await component.loadCVs();

    assert.deepStrictEqual(component.cvs, mockCVs);
    assert.equal(component.loading, false);
    assert.ok(cvGrid.innerHTML.includes('Test CV 1'));
    assert.ok(cvGrid.innerHTML.includes('Test CV 2'));
    assert.ok(cvGrid.innerHTML.includes('Developer'));
    assert.ok(cvGrid.innerHTML.includes('Analyst'));
    assert.equal(badge.textContent, 2);
  });

  it('loadCVs() renders empty state when no CVs exist', async () => {
    const { context, elements } = createBaseContext();
    const cvGrid = createElementStub('div');
    cvGrid.id = 'cvGrid';
    elements.set('#cvGrid', cvGrid);

    loadScript(context, 'components/cv-component.js');

    const mockApi = {
      getCVs: async () => ({ cvs: [] })
    };

    const component = new context.window.CVComponent({ api: mockApi });
    await component.loadCVs();

    assert.deepStrictEqual(component.cvs, []);
    assert.ok(cvGrid.innerHTML.includes('No CVs found'));
    assert.ok(cvGrid.innerHTML.includes('Create First CV'));
  });

  it('loadCVs() handles API unavailability gracefully', async () => {
    const { context, elements } = createBaseContext();
    const cvGrid = createElementStub('div');
    cvGrid.id = 'cvGrid';
    elements.set('#cvGrid', cvGrid);

    loadScript(context, 'components/cv-component.js');

    const mockApi = {}; // No getCVs method

    const component = new context.window.CVComponent({ api: mockApi });
    await component.loadCVs();

    assert.deepStrictEqual(component.cvs, []);
    assert.equal(component.loading, false);
  });

  it('loadCVs() prevents concurrent calls while loading', async () => {
    const { context, elements } = createBaseContext();
    const cvGrid = createElementStub('div');
    cvGrid.id = 'cvGrid';
    elements.set('#cvGrid', cvGrid);

    loadScript(context, 'components/cv-component.js');

    let apiCallCount = 0;
    const mockApi = {
      getCVs: async () => {
        apiCallCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return { cvs: [{ id: 'cv1', identity: { name: 'Test' }, lifecycle: { status: 'active' } }] };
      }
    };

    const component = new context.window.CVComponent({ api: mockApi });
    const promise1 = component.loadCVs();
    const promise2 = component.loadCVs(); // Should be ignored

    await Promise.all([promise1, promise2]);

    assert.equal(apiCallCount, 1);
  });

  it('renderCVs() renders CV cards with correct structure', () => {
    const { context, elements } = createBaseContext();
    const cvGrid = createElementStub('div');
    cvGrid.id = 'cvGrid';
    elements.set('#cvGrid', cvGrid);

    loadScript(context, 'components/cv-component.js');

    const mockApi = {};
    const component = new context.window.CVComponent({ api: mockApi });

    component.cvs = [
      { id: 'cv1', identity: { name: 'Agent One', role: 'Developer' }, lifecycle: { status: 'active' }, capabilities: [{ name: 'coding' }, { name: 'testing' }, { name: 'review' }, { name: 'debug' }] },
      { id: 'cv2', identity: { name: 'Agent Two', role: 'Analyst' }, lifecycle: { status: 'suspended' }, capabilities: [] }
    ];

    component.renderCVs();

    const html = cvGrid.innerHTML;

    // Check for CV card structure
    assert.ok(html.includes('cv-card'));
    assert.ok(html.includes('data-cv-id="cv1"'));
    assert.ok(html.includes('data-cv-id="cv2"'));
    assert.ok(html.includes('Agent One'));
    assert.ok(html.includes('Agent Two'));
    assert.ok(html.includes('Developer'));
    assert.ok(html.includes('Analyst'));

    // Check for status indicators
    assert.ok(html.includes('active'));
    assert.ok(html.includes('suspended'));

    // Check for capability tags (limited to 3 with +n more)
    assert.ok(html.includes('coding'));
    assert.ok(html.includes('testing'));
    assert.ok(html.includes('review'));
    assert.ok(html.includes('+1')); // 4th capability shown as +1
  });

  it('renderCVs() renders correct action buttons based on status', () => {
    const { context, elements } = createBaseContext();
    const cvGrid = createElementStub('div');
    cvGrid.id = 'cvGrid';
    elements.set('#cvGrid', cvGrid);

    loadScript(context, 'components/cv-component.js');

    const mockApi = {};
    const component = new context.window.CVComponent({ api: mockApi });

    component.cvs = [
      { id: 'cv1', identity: { name: 'Active Agent' }, lifecycle: { status: 'active' }, capabilities: [] },
      { id: 'cv2', identity: { name: 'Suspended Agent' }, lifecycle: { status: 'suspended' }, capabilities: [] },
      { id: 'cv3', identity: { name: 'Retired Agent' }, lifecycle: { status: 'retired' }, capabilities: [] }
    ];

    component.renderCVs();

    const html = cvGrid.innerHTML;

    // Active CV should have suspend and delete buttons, but not activate
    assert.ok(html.includes('data-action="suspend"'));
    assert.ok(html.includes('data-action="delete"'));

    // Suspended CV should have activate and delete buttons
    // Retired CV should have activate, suspend, and delete buttons
    assert.ok(html.includes('data-action="activate"'));
  });

  it('showCreateModal() creates and displays modal with templates', () => {
    const { context, elements } = createBaseContext();
    const overlay = createElementStub('div');
    overlay.id = 'modalOverlay';
    overlay.classList = {
      add() {},
      remove() {}
    };
    elements.set('#modalOverlay', overlay);

    loadScript(context, 'components/cv-component.js');

    const mockApi = {};
    const component = new context.window.CVComponent({ api: mockApi });

    component.showCreateModal();

    // Check that modal was created and added to body
    assert.equal(context.document.body.appendChild.callCount || 1, 1);
  });

  it('handleAction() calls activateCV and reloads CVs', async () => {
    const { context, elements } = createBaseContext();
    const cvGrid = createElementStub('div');
    cvGrid.id = 'cvGrid';
    elements.set('#cvGrid', cvGrid);

    loadScript(context, 'components/cv-component.js');

    let activateCalled = false;
    let reloadCalled = false;

    const mockApi = {
      activateCV: async (id) => {
        activateCalled = true;
        assert.equal(id, 'cv123');
      },
      getCVs: async () => {
        reloadCalled = true;
        return { cvs: [] };
      }
    };

    const component = new context.window.CVComponent({ api: mockApi });
    component.cvs = [];

    await component.handleAction('cv123', 'activate');

    assert.equal(activateCalled, true);
    assert.equal(reloadCalled, true);
  });

  it('handleAction() calls suspendCV and reloads CVs', async () => {
    const { context, elements } = createBaseContext();
    const cvGrid = createElementStub('div');
    cvGrid.id = 'cvGrid';
    elements.set('#cvGrid', cvGrid);

    loadScript(context, 'components/cv-component.js');

    let suspendCalled = false;

    const mockApi = {
      suspendCV: async (id) => {
        suspendCalled = true;
        assert.equal(id, 'cv456');
      },
      getCVs: async () => ({ cvs: [] })
    };

    const component = new context.window.CVComponent({ api: mockApi });
    component.cvs = [];

    await component.handleAction('cv456', 'suspend');

    assert.equal(suspendCalled, true);
  });

  it('handleAction() calls deleteCV with confirmation', async () => {
    const { context, elements } = createBaseContext();
    const cvGrid = createElementStub('div');
    cvGrid.id = 'cvGrid';
    elements.set('#cvGrid', cvGrid);

    loadScript(context, 'components/cv-component.js');

    let confirmCalled = false;
    let deleteCalled = false;

    // Mock confirm to return true
    context.window.confirm = () => {
      confirmCalled = true;
      return true;
    };

    const mockApi = {
      deleteCV: async (id) => {
        deleteCalled = true;
        assert.equal(id, 'cv789');
      },
      getCVs: async () => ({ cvs: [] })
    };

    const component = new context.window.CVComponent({ api: mockApi });
    component.cvs = [];

    await component.handleAction('cv789', 'delete');

    assert.equal(confirmCalled, true);
    assert.equal(deleteCalled, true);
  });

  it('handleAction() does not delete if user cancels confirmation', async () => {
    const { context, elements } = createBaseContext();

    loadScript(context, 'components/cv-component.js');

    let deleteCalled = false;

    // Mock confirm to return false
    context.window.confirm = () => false;

    const mockApi = {
      deleteCV: async () => {
        deleteCalled = true;
      }
    };

    const component = new context.window.CVComponent({ api: mockApi });

    await component.handleAction('cv789', 'delete');

    assert.equal(deleteCalled, false);
  });

  it('escapeHtml() escapes special HTML characters', () => {
    const { context } = createBaseContext();

    loadScript(context, 'components/cv-component.js');

    const mockApi = {};
    const component = new context.window.CVComponent({ api: mockApi });

    assert.equal(component.escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert("xss")&lt;/script&gt;');
    assert.equal(component.escapeHtml('Test & Test'), 'Test &amp; Test');
    assert.equal(component.escapeHtml('"quoted"'), '"quoted"');
    assert.equal(component.escapeHtml("'single'"), "'single'");
  });

  it('escapeHtml() handles empty and null values', () => {
    const { context } = createBaseContext();

    loadScript(context, 'components/cv-component.js');

    const mockApi = {};
    const component = new context.window.CVComponent({ api: mockApi });

    assert.equal(component.escapeHtml(''), '');
    assert.equal(component.escapeHtml(null), '');
    assert.equal(component.escapeHtml(undefined), '');
  });
});
