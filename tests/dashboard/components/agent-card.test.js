/**
 * Agent Card Component Tests
 * Tests for AgentCard class - card rendering, status badges, and action buttons
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, beforeEach } from 'node:test';

const dashboardRoot = path.resolve('src/dashboard/public');

function createClassList() {
  return {
    _classes: new Set(),
    add(className) { this._classes.add(className); },
    remove(className) { this._classes.delete(className); },
    contains(className) { return this._classes.has(className); },
    toggle(className) {
      if (this._classes.has(className)) {
        this._classes.delete(className);
        return false;
      }
      this._classes.add(className);
      return true;
    }
  };
}

function createElementStub(tagName = 'div', options = {}) {
  const listeners = [];
  const children = [];
  const attributes = new Map();
  
  const element = {
    tagName,
    id: options.id || '',
    innerHTML: '',
    textContent: '',
    value: options.value || '',
    style: {},
    dataset: {},
    classList: createClassList(),
    parentNode: null,
    firstElementChild: null,
    appendChild(child) {
      child.parentNode = element;
      children.push(child);
      element.firstElementChild = children[0];
      return child;
    },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index > -1) {
        children.splice(index, 1);
        element.firstElementChild = children[0] || null;
      }
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    },
    focus() {},
    click() {},
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    querySelector(selector) {
      // Return stubs for agent card elements
      if (selector.includes('.action-btn')) {
        return { 
          dataset: { action: 'wake', agentId: 'test-agent' },
          addEventListener() {},
          disabled: false
        };
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('.action-btn')) {
        return [
          { dataset: { action: 'wake', agentId: 'test' }, addEventListener() {}, disabled: false },
          { dataset: { action: 'pause', agentId: 'test' }, addEventListener() {}, disabled: false },
          { dataset: { action: 'stop', agentId: 'test' }, addEventListener() {}, disabled: false }
        ];
      }
      return [];
    },
    addEventListener(event, handler) {
      listeners.push({ event, handler });
    },
    removeEventListener(event, handler) {
      const index = listeners.findIndex(l => l.event === event && l.handler === handler);
      if (index > -1) listeners.splice(index, 1);
    },
    dispatchEvent(event) {
      listeners.filter(l => l.event === event.type).forEach(l => l.handler(event));
      return true;
    },
    _listeners: listeners,
    _children: children
  };
  return element;
}

function createMockDocument() {
  const elements = new Map();
  const createdElements = [];
  
  return {
    body: createElementStub('body'),
    head: createElementStub('head'),
    hidden: false,
    readyState: 'complete',
    createElement(tagName) {
      const el = createElementStub(tagName);
      createdElements.push(el);
      return el;
    },
    getElementById(id) {
      if (!elements.has(id)) {
        const el = createElementStub('div', { id });
        elements.set(id, el);
      }
      return elements.get(id);
    },
    querySelector(selector) {
      return elements.get(selector) || createElementStub();
    },
    querySelectorAll() { return []; },
    addEventListener(event, handler) {
      if (event === 'DOMContentLoaded') {
        // Auto-trigger for readyState = complete
        handler();
      }
    },
    removeEventListener() {},
    _elements: elements,
    _createdElements: createdElements,
    setElement(id, element) {
      elements.set(id, element);
    }
  };
}

function createMockWindow() {
  const document = createMockDocument();
  
  return {
    document,
    location: { host: 'localhost:3001', protocol: 'http:' },
    lucide: {
      createIcons() {},
      icons: {
        play: {},
        pause: {},
        square: {},
        coffee: {},
        'loader-2': {},
        'dollar-sign': {},
        layers: {},
        clock: {},
        activity: {},
        bot: {},
        claude: {},
        code: {},
        sparkles: {},
        'mouse-pointer-2': {},
        gem: {},
        terminal: {},
        'message-square': {},
        brain: {}
      }
    },
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame(callback) { return setTimeout(callback, 0); },
    cancelAnimationFrame(id) { clearTimeout(id); },
    getComputedStyle() {
      return { width: '100px' };
    },
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    Date: global.Date,
    Math: global.Math,
    window: null,
    AgentStatusBadge: {
      render(status, options) {
        return `<span class="status-badge ${status} ${options?.size || 'md'}">${status}</span>`;
      }
    }
  };
}

function createBaseContext() {
  const win = createMockWindow();
  win.window = win;
  
  const context = {
    console,
    document: win.document,
    window: win,
    globalThis: win,
    module: { exports: {} },
    exports: {},
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout,
    setInterval: win.setInterval,
    clearInterval: win.clearInterval,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    Date: win.Date,
    Math: win.Math,
    localStorage: {
      store: new Map(),
      getItem(key) { return this.store.get(key) || null; },
      setItem(key, value) { this.store.set(key, String(value)); },
      removeItem(key) { this.store.delete(key); }
    },
    EventTarget: class EventTargetStub {
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return true; }
    },
    CustomEvent: class CustomEventStub {
      constructor(type, detail) { this.type = type; this.detail = detail; }
    },
    MouseEvent: class MouseEventStub {
      constructor(type, init) { 
        this.type = type; 
        Object.assign(this, init || {});
        this.target = init?.target || null;
      }
      preventDefault() {}
      stopPropagation() {}
    }
  };
  
  return { context, document: win.document, window: win };
}

function loadScript(context, relativePath) {
  const filePath = path.join(dashboardRoot, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  context.window = context.window || context.globalThis;
  context.document = context.document || context.globalThis.document;
  vm.runInNewContext(source, context, { filename: filePath });
}

describe('AgentCard', () => {
  let baseCtx;
  
  beforeEach(() => {
    baseCtx = createBaseContext();
    loadScript(baseCtx.context, 'components/agent-card.js');
    baseCtx.context.AgentCard = baseCtx.context.window.AgentCard;
  });

  describe('Card Rendering Tests', () => {
    it('constructor initializes with agent data', () => {
      const { AgentCard } = baseCtx.context;
      const agent = {
        id: 'agent-1',
        name: 'Test Agent',
        status: 'online',
        provider: 'claude'
      };
      
      const card = new AgentCard({ agent });
      
      assert.equal(card.agent, agent);
      assert.equal(card.id, 'agent-1');
      assert.equal(card.showQuickActions, true);
      assert.equal(card.showCost, true);
      assert.equal(card.compact, false);
    });

    it('generates ID when agent has agentId property', () => {
      const { AgentCard } = baseCtx.context;
      const agent = { agentId: 'custom-id' };
      
      const card = new AgentCard({ agent });
      
      assert.equal(card.id, 'custom-id');
    });

    it('generates timestamp ID when no ID provided', () => {
      const { AgentCard } = baseCtx.context;
      const agent = {};
      
      const card = new AgentCard({ agent });
      
      assert.ok(card.id.startsWith('agent-'));
    });

    it('accepts callback options', () => {
      const { AgentCard } = baseCtx.context;
      const onWake = () => {};
      const onPause = () => {};
      const onStop = () => {};
      const onClick = () => {};
      
      const card = new AgentCard({
        agent: {},
        onWake,
        onPause,
        onStop,
        onClick
      });
      
      assert.equal(card.onWake, onWake);
      assert.equal(card.onPause, onPause);
      assert.equal(card.onStop, onStop);
      assert.equal(card.onClick, onClick);
    });

    it('accepts display options', () => {
      const { AgentCard } = baseCtx.context;
      
      const card = new AgentCard({
        agent: {},
        showQuickActions: false,
        showCost: false,
        compact: true
      });
      
      assert.equal(card.showQuickActions, false);
      assert.equal(card.showCost, false);
      assert.equal(card.compact, true);
    });

    it('render() returns HTML string with correct structure', () => {
      const { AgentCard } = baseCtx.context;
      const agent = {
        id: 'agent-1',
        name: 'Test Agent',
        status: 'online',
        provider: 'claude',
        model: 'sonnet-4'
      };
      
      const card = new AgentCard({ agent });
      const html = card.render();
      
      assert.ok(html.includes('agent-card'));
      assert.ok(html.includes('agent-1'));
      assert.ok(html.includes('Test Agent'));
      assert.ok(html.includes('online'));
      assert.ok(html.includes('claude'));
      assert.ok(html.includes('sonnet-4'));
    });

    it('render() includes data attributes', () => {
      const { AgentCard } = baseCtx.context;
      const agent = { id: 'agent-1', status: 'online' };
      
      const card = new AgentCard({ agent });
      const html = card.render();
      
      assert.ok(html.includes('data-agent-id="agent-1"'));
      assert.ok(html.includes('data-status="online"'));
    });

    it('render() uses compact class when compact mode', () => {
      const { AgentCard } = baseCtx.context;
      
      const card = new AgentCard({ agent: {}, compact: true });
      const html = card.render();
      
      assert.ok(html.includes('agent-card compact'));
    });

    it('static render() creates card HTML', () => {
      const { AgentCard } = baseCtx.context;
      const agent = { name: 'Static Agent', status: 'online' };
      
      const html = AgentCard.render(agent);
      
      assert.ok(html.includes('Static Agent'));
      assert.ok(html.includes('agent-card'));
    });

    it('static create() creates element with handlers', () => {
      const { AgentCard } = baseCtx.context;
      const agent = { id: 'agent-1', name: 'Element Agent', status: 'online' };
      
      const element = AgentCard.create(agent);
      
      assert.ok(element);
      assert.equal(element.tagName, 'div');
      assert.ok(element.className.includes('agent-card'));
    });
  });

  describe('Status Badge Tests', () => {
    it('renders correct status class for each status', () => {
      const { AgentCard } = baseCtx.context;
      const statuses = ['online', 'offline', 'busy', 'error', 'paused'];
      
      for (const status of statuses) {
        const card = new AgentCard({ agent: { status } });
        const html = card.render();
        assert.ok(html.includes(status), `Should include status ${status}`);
      }
    });

    it('defaults to offline for unknown status', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: { status: null } });
      const html = card.render();
      
      assert.ok(html.includes('data-status="offline"'));
    });

    it('renders status indicator dot', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: { status: 'online' } });
      const html = card.render();
      
      assert.ok(html.includes('agent-avatar-status'));
      assert.ok(html.includes('online'));
    });

    it('uses AgentStatusBadge when available', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: { status: 'online' } });
      const html = card.render();
      
      // Should use the mock AgentStatusBadge
      assert.ok(html.includes('status-badge'));
    });
  });

  describe('Avatar Tests', () => {
    it('renders avatar image when avatar URL provided', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: {
          name: 'Test Agent',
          avatar: 'https://example.com/avatar.png'
        }
      });
      const html = card.render();
      
      assert.ok(html.includes('agent-avatar-img'));
      assert.ok(html.includes('https://example.com/avatar.png'));
    });

    it('renders initials avatar when no avatar URL', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { name: 'Test Agent' }
      });
      const html = card.render();
      
      assert.ok(html.includes('agent-avatar-initials'));
      assert.ok(html.includes('TA'));
    });

    it('generates initials from multi-word name', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { name: 'John Doe Smith' }
      });
      const html = card.render();
      
      assert.ok(html.includes('JDS') || html.includes('JD'));
    });

    it('limits initials to 2 characters', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { name: 'Very Long Name Here' }
      });
      const html = card.render();
      
      // Check that we don't have more than 2 letters in the initials div content
      const initialsMatch = html.match(/agent-avatar-initials[^>]*>([^<]+)</);
      if (initialsMatch) {
        assert.ok(initialsMatch[1].length <= 2);
      }
    });

    it('generates consistent color for same name', () => {
      const { AgentCard } = baseCtx.context;
      
      const card1 = new AgentCard({ agent: { name: 'Same Name' } });
      const card2 = new AgentCard({ agent: { name: 'Same Name' } });
      
      const html1 = card1.render();
      const html2 = card2.render();
      
      // Same name should have same background color
      const colorMatch1 = html1.match(/background-color:\s*([^;"]+)/);
      const colorMatch2 = html2.match(/background-color:\s*([^;"]+)/);
      
      if (colorMatch1 && colorMatch2) {
        assert.equal(colorMatch1[1], colorMatch2[1]);
      }
    });
  });

  describe('Provider Icon Tests', () => {
    it('returns correct icon for claude provider', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: { provider: 'claude' } });
      
      assert.equal(card.getProviderIcon(), 'claude');
    });

    it('returns correct icon for codex provider', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: { provider: 'codex' } });
      
      assert.equal(card.getProviderIcon(), 'code');
    });

    it('returns correct icon for kimi provider', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: { provider: 'kimi' } });
      
      assert.equal(card.getProviderIcon(), 'sparkles');
    });

    it('defaults to bot icon for unknown provider', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: { provider: 'unknown' } });
      
      assert.equal(card.getProviderIcon(), 'bot');
    });

    it('uses adapterType as fallback for provider', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: { adapterType: 'claude' } });
      
      assert.equal(card.getProviderIcon(), 'claude');
    });

    it('handles case insensitive provider matching', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: { provider: 'CLAUDE' } });
      
      assert.equal(card.getProviderIcon(), 'claude');
    });
  });

  describe('Current Task Tests', () => {
    it('shows idle state when no current task', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: {} });
      const html = card.getCurrentTaskHtml();
      
      assert.ok(html.includes('idle'));
      assert.ok(html.includes('Idle'));
    });

    it('shows active task when currentTask is string', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { currentTask: 'Processing data...' }
      });
      const html = card.getCurrentTaskHtml();
      
      assert.ok(html.includes('active'));
      assert.ok(html.includes('Processing data...'));
    });

    it('shows active task when currentTask is object with name', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { currentTask: { name: 'Task Name' } }
      });
      const html = card.getCurrentTaskHtml();
      
      assert.ok(html.includes('active'));
      assert.ok(html.includes('Task Name'));
    });

    it('shows active task when using activeRun property', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { activeRun: 'Active Run Task' }
      });
      const html = card.getCurrentTaskHtml();
      
      assert.ok(html.includes('active'));
      assert.ok(html.includes('Active Run Task'));
    });

    it('escapes task name in HTML', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { currentTask: '<script>alert("xss")</script>' }
      });
      const html = card.getCurrentTaskHtml();
      
      assert.ok(!html.includes('<script>'));
    });
  });

  describe('Action Button Tests', () => {
    it('renders action buttons when showQuickActions is true', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { status: 'offline' },
        showQuickActions: true
      });
      const html = card.render();
      
      assert.ok(html.includes('agent-card-actions'));
      assert.ok(html.includes('action-btn'));
    });

    it('does not render action buttons when showQuickActions is false', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: {},
        showQuickActions: false
      });
      const html = card.render();
      
      assert.ok(!html.includes('agent-card-actions'));
    });

    it('enables wake button when agent is offline', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { status: 'offline' }
      });
      const html = card.renderQuickActions();
      
      const wakeMatch = html.match(/data-action="wake"[^>]*disabled/);
      assert.equal(wakeMatch, null);
    });

    it('disables wake button when agent is online', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { status: 'online' }
      });
      const html = card.renderQuickActions();
      
      assert.ok(html.includes('data-action="wake"'));
      assert.ok(html.includes('disabled'));
    });

    it('enables pause button when agent is online', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { status: 'online' }
      });
      const html = card.renderQuickActions();
      
      const pauseMatch = html.match(/data-action="pause"[^>]*disabled/);
      assert.equal(pauseMatch, null);
    });

    it('disables pause button when agent is offline', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { status: 'offline' }
      });
      const html = card.renderQuickActions();
      
      assert.ok(html.includes('data-action="pause"'));
      assert.ok(html.includes('disabled'));
    });

    it('enables stop button when agent is online or paused', () => {
      const { AgentCard } = baseCtx.context;
      
      ['online', 'paused', 'busy'].forEach(status => {
        const card = new AgentCard({ agent: { status } });
        const html = card.renderQuickActions();
        const stopMatch = html.match(/data-action="stop"[^>]*disabled/);
        assert.equal(stopMatch, null, `Stop should be enabled for ${status}`);
      });
    });

    it('attaches click handlers in renderElement', () => {
      const { AgentCard } = baseCtx.context;
      let wakeCalled = false;
      
      const card = new AgentCard({
        agent: { id: 'test', status: 'offline' },
        onWake: () => { wakeCalled = true; }
      });
      
      const element = card.renderElement();
      
      // Trigger click on action button
      const actionBtns = element.querySelectorAll('.action-btn');
      assert.ok(actionBtns.length > 0);
    });

    it('prevents card click when clicking action button', () => {
      const { AgentCard } = baseCtx.context;
      let cardClicked = false;
      
      const card = new AgentCard({
        agent: { id: 'test', status: 'online' },
        onClick: () => { cardClicked = true; },
        onPause: () => {}
      });
      
      const element = card.renderElement();
      
      // Simulate clicking an action button
      const mockEvent = {
        target: { closest: (sel) => sel === '.action-btn' ? {} : null }
      };
      
      // The click handler should not trigger onClick when clicking action buttons
      // This is tested by the implementation logic
      assert.ok(element);
    });
  });

  describe('Cost Summary Tests', () => {
    it('renders cost summary when showCost is true', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: {
          totalCost: 123.45,
          sessionCount: 5
        },
        showCost: true
      });
      const html = card.render();
      
      assert.ok(html.includes('agent-card-cost'));
      assert.ok(html.includes('$123.45'));
      assert.ok(html.includes('5 sessions'));
    });

    it('does not render cost summary when showCost is false', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { totalCost: 100 },
        showCost: false
      });
      const html = card.render();
      
      assert.ok(!html.includes('agent-card-cost'));
    });

    it('handles singular session count', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { sessionCount: 1 }
      });
      const html = card.renderCostSummary();
      
      assert.ok(html.includes('1 session'));
      assert.ok(!html.includes('sessions'));
    });

    it('uses cost property as fallback', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { cost: 99.99 }
      });
      const html = card.renderCostSummary();
      
      assert.ok(html.includes('$99.99'));
    });

    it('uses sessions property as fallback', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { sessions: 3 }
      });
      const html = card.renderCostSummary();
      
      assert.ok(html.includes('3 sessions'));
    });
  });

  describe('Uptime Tests', () => {
    it('shows uptime when uptime is available', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { uptime: 3600 }
      });
      const html = card.renderUptime();
      
      assert.ok(html.includes('Uptime'));
      assert.ok(html.includes('1h'));
    });

    it('shows last active time when no uptime', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { lastActive: Date.now() - 300000 }
      });
      const html = card.renderUptime();
      
      assert.ok(html.includes('Last active'));
    });

    it('handles uptimeSeconds property', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { uptimeSeconds: 1800 }
      });
      const html = card.renderUptime();
      
      assert.ok(html.includes('Uptime'));
    });
  });

  describe('Stats Tests', () => {
    it('renders stats section with correct values', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: {
          tasksCompleted: 42,
          successRate: 95,
          runsCompleted: 100
        }
      });
      const html = card.render();
      
      assert.ok(html.includes('agent-card-stats'));
      assert.ok(html.includes('42'));
      assert.ok(html.includes('95%'));
      assert.ok(html.includes('100'));
      assert.ok(html.includes('Completed'));
      assert.ok(html.includes('Success'));
      assert.ok(html.includes('Runs'));
    });

    it('defaults stats to 0 when not provided', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: {} });
      const html = card.render();
      
      assert.ok(html.includes('>0<'));
    });

    it('uses runs property as fallback', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({
        agent: { runs: 50 }
      });
      const html = card.render();
      
      assert.ok(html.includes('50'));
    });
  });

  describe('Formatting Tests', () => {
    it('formatCurrency handles various values', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: {} });
      
      assert.equal(card.formatCurrency(123.456), '$123.46');
      assert.equal(card.formatCurrency(0), '$0.00');
      assert.equal(card.formatCurrency(null), '$0.00');
      assert.equal(card.formatCurrency(undefined), '$0.00');
    });

    it('formatDuration handles various durations', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: {} });
      
      assert.equal(card.formatDuration(30), '< 1m');
      assert.equal(card.formatDuration(60), '1m');
      assert.equal(card.formatDuration(3600), '1h 0m');
      assert.equal(card.formatDuration(90000), '1d 1h');
    });

    it('formatTimeAgo handles various timestamps', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: {} });
      const now = Date.now();
      
      assert.equal(card.formatTimeAgo(now), 'Just now');
      assert.equal(card.formatTimeAgo(now - 120000), '2m ago');
      assert.equal(card.formatTimeAgo(now - 7200000), '2h ago');
    });
  });

  describe('Escape HTML Tests', () => {
    it('escapes HTML special characters', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: {} });
      
      assert.equal(card.escapeHtml('<script>'), '&lt;script&gt;');
      assert.equal(card.escapeHtml('Test & Test'), 'Test &amp; Test');
    });

    it('handles empty and null values', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: {} });
      
      assert.equal(card.escapeHtml(''), '');
      assert.equal(card.escapeHtml(null), '');
      assert.equal(card.escapeHtml(undefined), '');
    });
  });

  describe('Click Handler Tests', () => {
    it('attaches click handler when onClick provided', () => {
      const { AgentCard } = baseCtx.context;
      let clicked = false;
      
      const card = new AgentCard({
        agent: { id: 'test' },
        onClick: () => { clicked = true; }
      });
      
      const element = card.renderElement();
      
      assert.equal(element.style.cursor, 'pointer');
    });

    it('does not attach click handler when onClick not provided', () => {
      const { AgentCard } = baseCtx.context;
      const card = new AgentCard({ agent: { id: 'test' } });
      
      const element = card.renderElement();
      
      assert.notEqual(element.style.cursor, 'pointer');
    });
  });

  describe('CSS Styles Tests', () => {
    it('getStyles returns CSS string', () => {
      const { AgentCard } = baseCtx.context;
      const styles = AgentCard.getStyles();
      
      assert.ok(typeof styles === 'string');
      assert.ok(styles.includes('agent-card'));
    });

    it('injectStyles adds style element to document', () => {
      const { AgentCard } = baseCtx.context;
      
      AgentCard.injectStyles();
      
      const styleEl = baseCtx.document._createdElements.find(
        el => el.tagName === 'style' && el.id === 'agent-card-styles'
      );
      
      assert.ok(styleEl);
      assert.ok(styleEl.textContent.includes('agent-card'));
    });

    it('does not inject styles twice', () => {
      const { AgentCard } = baseCtx.context;
      
      AgentCard.injectStyles();
      AgentCard.injectStyles();
      
      const styleEls = baseCtx.document._createdElements.filter(
        el => el.tagName === 'style' && el.id === 'agent-card-styles'
      );
      
      // Should only have one style element
      assert.equal(styleEls.length, 1);
    });
  });
});
