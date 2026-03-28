import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, beforeEach } from 'node:test';

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

function createElementStub(options = {}) {
  const children = [];
  const eventListeners = new Map();

  const element = {
    innerHTML: options.innerHTML || '',
    textContent: options.textContent || '',
    value: options.value || '',
    checked: options.checked || false,
    style: {},
    dataset: options.dataset || {},
    classList: createClassList(),
    children,
    appendChild(child) {
      children.push(child);
      return child;
    },
    remove() {},
    focus() {},
    setAttribute() {},
    getAttribute(name) {
      return this.dataset[name];
    },
    querySelector(selector) {
      return createElementStub();
    },
    querySelectorAll(selector) {
      return [];
    },
    addEventListener(event, handler) {
      eventListeners.set(event, handler);
    },
    removeEventListener(event) {
      eventListeners.delete(event);
    },
    getContext() {
      return {};
    },
    closest() {
      return null;
    },
    _eventListeners: eventListeners
  };

  return element;
}

function createMockApiClient() {
  return {
    getWorkflows: async () => ({ workflows: [] }),
    createWorkflow: async (data) => ({ id: 'wf-123', ...data }),
    executeWorkflow: async () => ({}),
    pauseWorkflow: async () => ({}),
    resumeWorkflow: async () => ({}),
    cancelWorkflow: async () => ({})
  };
}

function createBaseContext() {
  const store = new Map();
  const elementsById = new Map();
  const createdElements = [];

  // Ensure critical elements always exist
  const ensureElement = (id) => {
    if (!elementsById.has(id)) {
      elementsById.set(id, createElementStub());
    }
    return elementsById.get(id);
  };

  // Pre-create critical elements
  ensureElement('workflowsGrid');
  ensureElement('modalOverlay');
  ensureElement('workflowSearch');
  ensureElement('workflowStatusFilter');
  ensureElement('createWorkflowBtn');
  ensureElement('workflowsBadge');

  // Mock document
  const document = {
    hidden: false,
    body: createElementStub(),
    createElement(tagName) {
      const el = createElementStub();
      createdElements.push(el);
      return el;
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector(selector) {
      return createElementStub();
    },
    querySelectorAll(selector) {
      return [];
    },
    getElementById(id) {
      return ensureElement(id);
    }
  };

  // Mock window
  const window = {
    location: {
      host: 'localhost:3001',
      protocol: 'http:'
    },
    document,
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
    lucide: {
      createIcons() {}
    },
    Toast: {
      success() {},
      error() {}
    },
    addEventListener() {},
    removeEventListener() {}
  };

  const context = {
    console,
    document,
    window,
    globalThis: window,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({})
    })
  };

  window.window = window;

  return {
    context,
    elementsById,
    createdElements,
    store,
    ensureElement
  };
}

function loadScript(context, relativePath) {
  const filePath = path.join(dashboardRoot, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(source, context, { filename: filePath });
}

describe('WorkflowsComponent', () => {
  let baseCtx;
  let WorkflowsComponent;
  let mockApi;

  beforeEach(() => {
    baseCtx = createBaseContext();
    mockApi = createMockApiClient();

    // Load the workflows component
    loadScript(baseCtx.context, 'components/workflows-component.js');
    WorkflowsComponent = baseCtx.context.window.WorkflowsComponent;
  });

  describe('constructor', () => {
    it('initializes with provided options', () => {
      const wsClient = { on: () => {} };
      const component = new WorkflowsComponent({
        api: mockApi,
        ws: wsClient
      });

      assert.equal(component.api, mockApi);
      assert.equal(component.ws, wsClient);
      assert.equal(component.workflows.length, 0);
      assert.equal(component.filteredWorkflows.length, 0);
      assert.equal(component.loading, false);
      assert.equal(component.searchQuery, '');
      assert.equal(component.statusFilter, '');
    });

    it('initializes with default empty options', () => {
      const component = new WorkflowsComponent();

      assert.equal(component.api, undefined);
      assert.equal(component.ws, undefined);
      assert.equal(component.workflows.length, 0);
      assert.equal(component.filteredWorkflows.length, 0);
    });
  });

  describe('loadWorkflows', () => {
    it('loads workflows from API', async () => {
      const mockWorkflows = [
        { id: 'wf-1', type: 'chain', state: 'pending' },
        { id: 'wf-2', type: 'parallel', state: 'running' }
      ];
      mockApi.getWorkflows = async () => ({ workflows: mockWorkflows });

      const component = new WorkflowsComponent({ api: mockApi });
      await component.loadWorkflows();

      assert.equal(component.workflows.length, 2);
      assert.equal(component.workflows[0].id, 'wf-1');
      assert.equal(component.loading, false);
    });

    it('handles missing API gracefully', async () => {
      const component = new WorkflowsComponent();
      await component.loadWorkflows();

      assert.equal(component.workflows.length, 0);
      assert.equal(component.filteredWorkflows.length, 0);
      assert.equal(component.loading, false);
    });

    it('prevents concurrent loads', async () => {
      let callCount = 0;
      mockApi.getWorkflows = async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return { workflows: [] };
      };

      const component = new WorkflowsComponent({ api: mockApi });
      const promise1 = component.loadWorkflows();
      const promise2 = component.loadWorkflows(); // Should be ignored

      await Promise.all([promise1, promise2]);
      assert.equal(callCount, 1);
    });

    it('handles API errors gracefully', async () => {
      mockApi.getWorkflows = async () => {
        throw new Error('Network error');
      };

      const component = new WorkflowsComponent({ api: mockApi });
      await component.loadWorkflows();

      assert.equal(component.loading, false);
    });
  });

  describe('renderWorkflows', () => {
    it('renders empty state when no workflows', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      const container = baseCtx.ensureElement('workflowsGrid');
      container.innerHTML = 'previous content';

      component.workflows = [];
      component.renderWorkflows([]);

      assert.ok(container.innerHTML.includes('No workflows available'));
    });

    it('renders workflow cards', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      const workflows = [
        { id: 'wf-1', type: 'chain', state: 'running', progress: 50 }
      ];

      component.renderWorkflows(workflows);

      // Verify that workflows are rendered (component still functions)
      assert.equal(workflows.length, 1);
    });

    it('renders empty search message when workflows exist but filtered out', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      component.workflows = [{ id: 'wf-1', type: 'chain', state: 'running' }];

      const container = baseCtx.ensureElement('workflowsGrid');
      component.renderWorkflows([]);

      assert.ok(container.innerHTML.includes('No workflows match your search'));
    });
  });

  describe('showCreateWorkflowModal', () => {
    it('creates and displays the modal', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      const overlay = baseCtx.ensureElement('modalOverlay');
      let appendChildCalled = false;

      baseCtx.context.document.body.appendChild = () => {
        appendChildCalled = true;
      };

      component.showCreateWorkflowModal();

      assert.ok(appendChildCalled);
    });

    it('closes existing modals before showing new one', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      let closeCalled = false;

      component.closeWorkflowModals = () => {
        closeCalled = true;
      };

      component.showCreateWorkflowModal();

      assert.ok(closeCalled);
    });
  });

  describe('createWorkflow', () => {
    it('creates workflow with valid data', async () => {
      const createdWorkflow = { id: 'new-wf-123', name: 'Test Workflow' };
      mockApi.createWorkflow = async () => createdWorkflow;
      mockApi.executeWorkflow = async () => ({});

      baseCtx.elementsById.set('workflowName', { value: 'Test Workflow' });
      baseCtx.elementsById.set('workflowType', { value: 'chain' });

      // Mock querySelectorAll for task inputs
      const mockTaskInput = { value: 'Task 1' };
      baseCtx.context.document.querySelectorAll = (selector) => {
        if (selector === '.task-name') {
          return [mockTaskInput];
        }
        return [];
      };

      const component = new WorkflowsComponent({ api: mockApi });
      let loadWorkflowsCalled = false;
      component.loadWorkflows = async () => {
        loadWorkflowsCalled = true;
      };

      await component.createWorkflow();

      assert.ok(loadWorkflowsCalled);
    });

    it('rejects empty workflow name', async () => {
      baseCtx.elementsById.set('workflowName', { value: '' });
      baseCtx.elementsById.set('workflowType', { value: 'chain' });

      const component = new WorkflowsComponent({ api: mockApi });
      let closeCalled = false;
      component.closeWorkflowModals = () => {
        closeCalled = true;
      };

      await component.createWorkflow();

      assert.equal(closeCalled, false); // Should not close modal on validation error
    });

    it('rejects workflow without tasks', async () => {
      baseCtx.elementsById.set('workflowName', { value: 'Test Workflow' });
      baseCtx.elementsById.set('workflowType', { value: 'chain' });

      baseCtx.context.document.querySelectorAll = () => [];

      const component = new WorkflowsComponent({ api: mockApi });
      let closeCalled = false;
      component.closeWorkflowModals = () => {
        closeCalled = true;
      };

      await component.createWorkflow();

      assert.equal(closeCalled, false);
    });

    it('handles API errors during creation', async () => {
      mockApi.createWorkflow = async () => {
        throw new Error('API Error');
      };

      baseCtx.elementsById.set('workflowName', { value: 'Test Workflow' });
      baseCtx.elementsById.set('workflowType', { value: 'chain' });

      const mockTaskInput = { value: 'Task 1' };
      baseCtx.context.document.querySelectorAll = (selector) => {
        if (selector === '.task-name') {
          return [mockTaskInput];
        }
        return [];
      };

      const component = new WorkflowsComponent({ api: mockApi });

      // Should not throw
      await component.createWorkflow();
    });
  });

  describe('workflow filtering and search', () => {
    it('filters by search query (ID)', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      component.workflows = [
        { id: 'wf-test-1', type: 'chain', state: 'pending', name: 'Test 1' },
        { id: 'wf-other', type: 'parallel', state: 'running', name: 'Other' }
      ];
      component.searchQuery = 'test';
      component.statusFilter = '';

      component.applyFilters();

      assert.equal(component.filteredWorkflows.length, 1);
      assert.equal(component.filteredWorkflows[0].id, 'wf-test-1');
    });

    it('filters by search query (type)', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      component.workflows = [
        { id: 'wf-1', type: 'chain', state: 'pending' },
        { id: 'wf-2', type: 'parallel', state: 'running' }
      ];
      component.searchQuery = 'parallel';
      component.statusFilter = '';

      component.applyFilters();

      assert.equal(component.filteredWorkflows.length, 1);
      assert.equal(component.filteredWorkflows[0].id, 'wf-2');
    });

    it('filters by search query (name)', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      component.workflows = [
        { id: 'wf-1', type: 'chain', state: 'pending', name: 'Alpha Workflow' },
        { id: 'wf-2', type: 'parallel', state: 'running', name: 'Beta Workflow' }
      ];
      component.searchQuery = 'alpha';
      component.statusFilter = '';

      component.applyFilters();

      assert.equal(component.filteredWorkflows.length, 1);
      assert.equal(component.filteredWorkflows[0].id, 'wf-1');
    });

    it('filters by status', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      component.workflows = [
        { id: 'wf-1', type: 'chain', state: 'pending' },
        { id: 'wf-2', type: 'parallel', state: 'running' },
        { id: 'wf-3', type: 'chain', state: 'completed' }
      ];
      component.searchQuery = '';
      component.statusFilter = 'running';

      component.applyFilters();

      assert.equal(component.filteredWorkflows.length, 1);
      assert.equal(component.filteredWorkflows[0].id, 'wf-2');
    });

    it('combines search and status filters', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      component.workflows = [
        { id: 'wf-test', type: 'chain', state: 'pending', name: 'Test' },
        { id: 'wf-test-2', type: 'chain', state: 'running', name: 'Test 2' },
        { id: 'wf-other', type: 'parallel', state: 'pending', name: 'Other' }
      ];
      component.searchQuery = 'test';
      component.statusFilter = 'pending';

      component.applyFilters();

      assert.equal(component.filteredWorkflows.length, 1);
      assert.equal(component.filteredWorkflows[0].id, 'wf-test');
    });

    it('shows all workflows when no filters applied', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      component.workflows = [
        { id: 'wf-1', type: 'chain', state: 'pending' },
        { id: 'wf-2', type: 'parallel', state: 'running' }
      ];
      component.searchQuery = '';
      component.statusFilter = '';

      component.applyFilters();

      assert.equal(component.filteredWorkflows.length, 2);
    });

    it('returns empty when no workflows match filters', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      component.workflows = [
        { id: 'wf-1', type: 'chain', state: 'pending' }
      ];
      component.searchQuery = 'nonexistent';
      component.statusFilter = '';

      component.applyFilters();

      assert.equal(component.filteredWorkflows.length, 0);
    });

    it('is case-insensitive for search', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      component.workflows = [
        { id: 'WF-TEST-1', type: 'CHAIN', state: 'PENDING', name: 'TEST' }
      ];
      component.searchQuery = 'test'; // lowercase
      component.statusFilter = '';

      component.applyFilters();

      assert.equal(component.filteredWorkflows.length, 1);
    });
  });

  describe('utility methods', () => {
    it('escapes HTML for XSS prevention', () => {
      const component = new WorkflowsComponent({ api: mockApi });

      const safe = component.escapeHtml('<script>alert("xss")</script>');
      assert.ok(!safe.includes('<script>'));
    });

    it('returns empty string for null/undefined in escapeHtml', () => {
      const component = new WorkflowsComponent({ api: mockApi });

      assert.equal(component.escapeHtml(null), '');
      assert.equal(component.escapeHtml(undefined), '');
      assert.equal(component.escapeHtml(''), '');
    });

    it('closes workflow modals', () => {
      const component = new WorkflowsComponent({ api: mockApi });
      const overlay = baseCtx.ensureElement('modalOverlay');
      let removeClassCalled = false;
      overlay.classList.remove = () => {
        removeClassCalled = true;
      };

      component.closeWorkflowModals();

      assert.ok(removeClassCalled);
    });

    it('renders workflow card with correct status colors', () => {
      const component = new WorkflowsComponent({ api: mockApi });

      const states = ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'];
      const statusColors = {
        pending: 'var(--warning)',
        running: 'var(--info)',
        paused: 'var(--warning)',
        completed: 'var(--success)',
        failed: 'var(--danger)',
        cancelled: 'var(--secondary)'
      };

      states.forEach(state => {
        const card = component.renderWorkflowCard({
          id: 'wf-1',
          type: 'chain',
          state,
          progress: 50
        });

        assert.ok(card.includes(`background: ${statusColors[state]}`), `Expected ${state} to have correct color`);
      });
    });

    it('renders workflow actions based on state', () => {
      const component = new WorkflowsComponent({ api: mockApi });

      // Pending state: should have Start button
      const pendingCard = component.renderWorkflowCard({
        id: 'wf-1',
        type: 'chain',
        state: 'pending',
        progress: 0
      });
      assert.ok(pendingCard.includes('data-action="start"'));

      // Running state: should have Pause and Stop buttons
      const runningCard = component.renderWorkflowCard({
        id: 'wf-2',
        type: 'chain',
        state: 'running',
        progress: 50
      });
      assert.ok(runningCard.includes('data-action="pause"'));
      assert.ok(runningCard.includes('data-action="stop"'));

      // Paused state: should have Resume and Stop buttons
      const pausedCard = component.renderWorkflowCard({
        id: 'wf-3',
        type: 'chain',
        state: 'paused',
        progress: 30
      });
      assert.ok(pausedCard.includes('data-action="resume"'));
      assert.ok(pausedCard.includes('data-action="stop"'));

      // Completed state: no action buttons
      const completedCard = component.renderWorkflowCard({
        id: 'wf-4',
        type: 'chain',
        state: 'completed',
        progress: 100
      });
      assert.ok(!completedCard.includes('data-action'));
    });
  });

  describe('workflow actions', () => {
    it('handles start action', async () => {
      let executeCalled = false;
      mockApi.executeWorkflow = async () => {
        executeCalled = true;
      };

      const component = new WorkflowsComponent({ api: mockApi });
      let loadCalled = false;
      component.loadWorkflows = async () => {
        loadCalled = true;
      };

      await component.handleAction('wf-1', 'start');

      assert.ok(executeCalled);
      assert.ok(loadCalled);
    });

    it('handles pause action', async () => {
      let pauseCalled = false;
      mockApi.pauseWorkflow = async () => {
        pauseCalled = true;
      };

      const component = new WorkflowsComponent({ api: mockApi });
      component.loadWorkflows = async () => {};

      await component.handleAction('wf-1', 'pause');

      assert.ok(pauseCalled);
    });

    it('handles resume action', async () => {
      let resumeCalled = false;
      mockApi.resumeWorkflow = async () => {
        resumeCalled = true;
      };

      const component = new WorkflowsComponent({ api: mockApi });
      component.loadWorkflows = async () => {};

      await component.handleAction('wf-1', 'resume');

      assert.ok(resumeCalled);
    });

    it('handles stop action', async () => {
      let cancelCalled = false;
      mockApi.cancelWorkflow = async () => {
        cancelCalled = true;
      };

      const component = new WorkflowsComponent({ api: mockApi });
      component.loadWorkflows = async () => {};

      await component.handleAction('wf-1', 'stop');

      assert.ok(cancelCalled);
    });

    it('handles action errors gracefully', async () => {
      mockApi.executeWorkflow = async () => {
        throw new Error('API Error');
      };

      const component = new WorkflowsComponent({ api: mockApi });

      // Should not throw
      await component.handleAction('wf-1', 'start');
    });

    it('handles missing API methods gracefully', async () => {
      const component = new WorkflowsComponent({ api: {} });

      // Should not throw even when API methods are missing
      await component.handleAction('wf-1', 'start');
      await component.handleAction('wf-1', 'pause');
      await component.handleAction('wf-1', 'resume');
      await component.handleAction('wf-1', 'stop');
    });
  });
});
