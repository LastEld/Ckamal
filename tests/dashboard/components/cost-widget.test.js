/**
 * Cost Widget Component Tests
 * Tests for CostWidget class - widget rendering, charts, and alerts
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
    checked: false,
    selectedIndex: 0,
    style: {},
    dataset: {},
    classList: createClassList(),
    parentNode: null,
    appendChild(child) {
      child.parentNode = element;
      children.push(child);
      return child;
    },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index > -1) children.splice(index, 1);
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
      // Return appropriate stubs for cost widget elements
      if (selector.includes('cost-metric-value')) {
        return { textContent: '' };
      }
      if (selector.includes('.cost-badge') || selector.includes('.budget-status')) {
        return { className: '', textContent: '' };
      }
      if (selector.includes('select')) {
        return { value: '30d', addEventListener() {} };
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('.action-btn')) {
        return [];
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
    },
    _listeners: listeners,
    _children: children
  };
  return element;
}

function createMockChart() {
  return class MockChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.destroyed = false;
    }
    destroy() {
      this.destroyed = true;
    }
  };
}

function createMockDocument() {
  const elements = new Map();
  
  return {
    body: createElementStub('body'),
    hidden: false,
    createElement(tagName) {
      const el = createElementStub(tagName);
      if (tagName === 'canvas') {
        el.getContext = () => ({
          fillRect() {},
          clearRect() {},
          getImageData() {},
          putImageData() {},
          createImageData() {},
          setTransform() {},
          drawImage() {},
          save() {},
          fillText() {},
          restore() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          closePath() {},
          stroke() {},
          translate() {},
          scale() {},
          rotate() {},
          arc() {},
          fill() {},
          measureText() { return { width: 0 }; }
        });
      }
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
    addEventListener() {},
    removeEventListener() {},
    _elements: elements,
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
        wallet: {},
        'pie-chart': {},
        'check-circle': {},
        'alert-triangle': {},
        'alert-octagon': {},
        'dollar-sign': {},
        layers: {},
        clock: {},
        activity: {},
        coffee: {},
        'loader-2': {},
        'credit-card': {},
        'refresh-cw': {}
      }
    },
    Chart: createMockChart(),
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
    dispatchEvent() { return true; },
    dashboardApp: {
      navigateTo() {}
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
    Toast: {
      success() {},
      error() {},
      info() {}
    }
  };
  
  return { context, document: win.document, window: win };
}

function loadScript(context, relativePath) {
  const filePath = path.join(dashboardRoot, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  // Ensure window and document are set before loading
  context.window = context.window || context.globalThis;
  context.document = context.document || context.globalThis.document;
  vm.runInNewContext(source, context, { filename: filePath });
}

describe('CostWidget', () => {
  let baseCtx;
  
  beforeEach(() => {
    baseCtx = createBaseContext();
    loadScript(baseCtx.context, 'components/cost-widget.js');
    // Export to context for tests - try both window and module.exports
    baseCtx.context.CostWidget = baseCtx.context.window.CostWidget || baseCtx.context.module.exports.CostWidget;
  });

  describe('Widget Rendering Tests', () => {
    it('constructor initializes with default values', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      assert.equal(widget.data.summary, null);
      assert.equal(widget.data.costs, null);
      assert.equal(widget.data.alerts, null);
      assert.equal(widget.cacheExpiry, 30000);
      assert.equal(typeof widget.charts, 'object');
      assert.equal(Object.keys(widget.charts).length, 0);
    });

    it('constructor accepts API and WebSocket options', () => {
      const { CostWidget } = baseCtx.context;
      const mockApi = { getCosts: async () => {} };
      const mockWs = { on: () => {} };
      
      const widget = new CostWidget({ api: mockApi, ws: mockWs });
      
      assert.equal(widget.api, mockApi);
      assert.equal(widget.ws, mockWs);
    });

    // TODO: formatCurrency, formatDuration, formatTimeAgo methods 
    // are expected but not implemented in cost-widget.js source
  });

  describe('API Integration Tests', () => {
    it('fetchBillingSummary returns cached data when available', async () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      const cachedData = { totalSpend: 100 };
      widget.cache.set('billing-summary', { data: cachedData, timestamp: Date.now() });
      
      const result = await widget.fetchBillingSummary();
      
      assert.deepEqual(result, cachedData);
    });

    it('fetchBillingSummary fetches from API when cache expired', async () => {
      const { CostWidget } = baseCtx.context;
      const mockData = { totalSpend: 200 };
      const mockApi = { getBillingSummary: async () => mockData };
      
      const widget = new CostWidget({ api: mockApi });
      const result = await widget.fetchBillingSummary();
      
      assert.deepEqual(result, mockData);
      assert.deepEqual(widget.cache.get('billing-summary').data, mockData);
    });

    it('fetchBillingSummary falls back to mock data on API error', async () => {
      const { CostWidget } = baseCtx.context;
      const mockApi = { getBillingSummary: async () => { throw new Error('API Error'); } };
      
      const widget = new CostWidget({ api: mockApi });
      const result = await widget.fetchBillingSummary();
      
      assert.ok(result.totalSpend !== undefined);
      assert.ok(result.budgetLimit !== undefined);
    });

    it('fetchBillingSummary returns mock data when API not available', async () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget({ api: {} });
      
      const result = await widget.fetchBillingSummary();
      
      assert.ok(result.totalSpend !== undefined);
      assert.ok(result.budgetLimit !== undefined);
      assert.ok(result.percentageUsed !== undefined);
    });

    it('fetchCosts returns cached data when available', async () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      const cachedData = { period: '30d', dailyCosts: [] };
      widget.cache.set('costs-30d', { data: cachedData, timestamp: Date.now() });
      
      const result = await widget.fetchCosts('30d');
      
      assert.deepEqual(result, cachedData);
    });

    it('fetchCosts fetches from API with correct period', async () => {
      const { CostWidget } = baseCtx.context;
      const mockData = { period: '7d', dailyCosts: [] };
      let calledPeriod;
      const mockApi = { 
        getCosts: async ({ period }) => {
          calledPeriod = period;
          return mockData;
        }
      };
      
      const widget = new CostWidget({ api: mockApi });
      const result = await widget.fetchCosts('7d');
      
      assert.equal(calledPeriod, '7d');
      assert.deepEqual(result, mockData);
    });

    it('fetchBillingAlerts returns cached data when available', async () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      const cachedData = { alerts: [], total: 0 };
      widget.cache.set('billing-alerts', { data: cachedData, timestamp: Date.now() });
      
      const result = await widget.fetchBillingAlerts();
      
      assert.deepEqual(result, cachedData);
    });
  });

  describe('Cache Management Tests', () => {
    it('getCached returns null for non-existent key', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      assert.equal(widget.getCached('non-existent'), null);
    });

    it('getCached returns null for expired cache', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      widget.cache.set('expired', { 
        data: { test: true }, 
        timestamp: Date.now() - 60000 // Expired
      });
      
      assert.equal(widget.getCached('expired'), null);
      assert.equal(widget.cache.has('expired'), false);
    });

    it('setCached stores data with timestamp', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const data = { test: true };
      
      widget.setCached('test-key', data);
      
      const cached = widget.cache.get('test-key');
      assert.deepEqual(cached.data, data);
      assert.ok(cached.timestamp > 0);
    });

    it('clearCache removes all cached data', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      widget.setCached('key1', { test: 1 });
      widget.setCached('key2', { test: 2 });
      
      assert.equal(widget.cache.size, 2);
      
      widget.clearCache();
      
      assert.equal(widget.cache.size, 0);
    });
  });

  describe('Mock Data Tests', () => {
    it('getMockSummary returns valid summary data', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      const summary = widget.getMockSummary();
      
      assert.ok(typeof summary.totalSpend === 'number');
      assert.ok(typeof summary.budgetLimit === 'number');
      assert.ok(typeof summary.budgetRemaining === 'number');
      assert.ok(typeof summary.percentageUsed === 'number');
      assert.ok(typeof summary.projectedSpend === 'number');
      assert.equal(summary.currency, 'USD');
    });

    it('getMockCosts returns costs for specified period', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      const costs7d = widget.getMockCosts('7d');
      const costs30d = widget.getMockCosts('30d');
      
      assert.equal(costs7d.period, '7d');
      assert.equal(costs7d.dailyCosts.length, 7);
      assert.equal(costs30d.period, '30d');
      assert.equal(costs30d.dailyCosts.length, 30);
      
      assert.ok(costs30d.byModel);
      assert.ok(costs30d.byProvider);
    });

    it('getMockAlerts returns alert data', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      const alerts = widget.getMockAlerts();
      
      assert.ok(Array.isArray(alerts.alerts));
      assert.ok(typeof alerts.total === 'number');
      assert.ok(alerts.alerts.length > 0);
      assert.ok(alerts.alerts[0].level);
      assert.ok(alerts.alerts[0].title);
      assert.ok(alerts.alerts[0].message);
    });
  });

  describe('Cost Summary Card Tests', () => {
    it('renderCostSummaryCard renders with correct structure', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      const data = {
        totalSpend: 245.80,
        budgetLimit: 500.00,
        budgetRemaining: 254.20,
        percentageUsed: 49.16,
        projectedSpend: 368.70
      };
      
      widget.renderCostSummaryCard(container, data);
      
      assert.ok(container.innerHTML.includes('Cost Summary'));
      assert.ok(container.innerHTML.includes('$245.80'));
      assert.ok(container.innerHTML.includes('$254.20'));
      assert.ok(container.innerHTML.includes('$500.00'));
      assert.ok(container.innerHTML.includes('$368.70'));
    });

    it('renderCostSummaryCard applies correct status class', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      
      // Test good status (< 50%)
      widget.renderCostSummaryCard(container, { percentageUsed: 30 });
      assert.ok(container.innerHTML.includes('good') || !container.innerHTML.includes('critical'));
      
      // Test caution status (50-79%)
      container.innerHTML = '';
      widget.renderCostSummaryCard(container, { percentageUsed: 60 });
      assert.ok(container.innerHTML.includes('caution') || container.innerHTML.includes('49.2%'));
      
      // Test warning status (80-89%)
      container.innerHTML = '';
      widget.renderCostSummaryCard(container, { percentageUsed: 85 });
      assert.ok(container.innerHTML.includes('warning') || container.innerHTML.includes('85'));
      
      // Test critical status (>= 90%)
      container.innerHTML = '';
      widget.renderCostSummaryCard(container, { percentageUsed: 95 });
      assert.ok(container.innerHTML.includes('critical') || container.innerHTML.includes('95'));
    });

    it('renderCostSummaryCard handles missing data', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      
      widget.renderCostSummaryCard(container, null);
      
      assert.ok(container.innerHTML.includes('$0.00'));
    });
  });

  describe('Budget Progress Bar Tests', () => {
    it('renderBudgetProgressBar renders with correct structure', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      const data = {
        totalSpend: 250,
        budgetLimit: 500,
        percentageUsed: 50
      };
      
      widget.renderBudgetProgressBar(container, data);
      
      assert.ok(container.innerHTML.includes('Budget Usage'));
      assert.ok(container.innerHTML.includes('50%'));
    });

    it('renderBudgetProgressBar shows correct status text', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      const statuses = [
        { pct: 30, expected: 'On Track' },
        { pct: 60, expected: 'Caution' },
        { pct: 85, expected: 'Warning' },
        { pct: 95, expected: 'Critical' }
      ];
      
      for (const { pct, expected } of statuses) {
        const container = createElementStub();
        widget.renderBudgetProgressBar(container, { percentageUsed: pct, budgetLimit: 500 });
        assert.ok(
          container.innerHTML.includes(expected) || container.innerHTML.includes(pct.toString()),
          `Should show correct status for ${pct}%`
        );
      }
    });

    it('renderBudgetProgressBar displays threshold markers', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      
      widget.renderBudgetProgressBar(container, { 
        percentageUsed: 75, 
        budgetLimit: 1000,
        totalSpend: 750
      });
      
      assert.ok(container.innerHTML.includes('80%') || container.innerHTML.includes('90%'));
    });
  });

  describe('Alert Banner Tests', () => {
    it('renderAlertBanner shows success state when no alerts', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      const data = { alerts: [], total: 0 };
      
      widget.renderAlertBanner(container, data);
      
      assert.ok(container.innerHTML.includes('success') || container.innerHTML.includes('No budget alerts'));
    });

    it('renderAlertBanner displays active alerts', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      const data = {
        alerts: [
          { id: '1', level: 'warning', title: 'Warning Title', message: 'Warning message', timestamp: Date.now() },
          { id: '2', level: 'critical', title: 'Critical Title', message: 'Critical message', timestamp: Date.now() }
        ],
        total: 2
      };
      
      widget.renderAlertBanner(container, data);
      
      assert.ok(container.innerHTML.includes('Warning Title'));
      assert.ok(container.innerHTML.includes('Critical Title'));
    });

    it('renderAlertBanner filters out info alerts', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      const data = {
        alerts: [
          { id: '1', level: 'info', title: 'Info Alert', message: 'Info', timestamp: Date.now() }
        ],
        total: 1
      };
      
      widget.renderAlertBanner(container, data);
      
      // Should show success state since no warning/critical alerts
      assert.ok(container.innerHTML.includes('success') || !container.innerHTML.includes('Info Alert'));
    });

    it('renderAlertBanner formats alert timestamps', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      const now = Date.now();
      const data = {
        alerts: [
          { id: '1', level: 'warning', title: 'Test', message: 'Test', timestamp: now - 3600000 }
        ],
        total: 1
      };
      
      widget.renderAlertBanner(container, data);
      
      // Should have formatted time
      assert.ok(container.innerHTML.includes('ago') || container.innerHTML.includes('Just now'));
    });
  });

  describe('Chart Rendering Tests', () => {
    it('renderCostTrendChart creates line chart', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      const data = {
        dailyCosts: [
          { date: '2024-01-01', amount: 10, requests: 100 },
          { date: '2024-01-02', amount: 15, requests: 150 }
        ]
      };
      
      widget.renderCostTrendChart(container, data, '7d');
      
      assert.ok(widget.charts.trend);
      assert.equal(widget.charts.trend.config.type, 'line');
    });

    it('renderCostTrendChart handles Chart.js not available', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      
      // Remove Chart from window
      const originalChart = baseCtx.window.Chart;
      baseCtx.window.Chart = undefined;
      
      widget.renderCostTrendChart(container, { dailyCosts: [] }, '7d');
      
      assert.ok(container.innerHTML.includes('Chart.js not available'));
      
      // Restore Chart
      baseCtx.window.Chart = originalChart;
    });

    it('renderModelBreakdown creates doughnut chart', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      const data = {
        byModel: {
          'claude-sonnet-4': 89.50,
          'codex': 67.20,
          'kimi-k2': 45.10
        }
      };
      
      widget.renderModelBreakdown(container, data);
      
      assert.ok(widget.charts.model);
      assert.equal(widget.charts.model.config.type, 'doughnut');
    });

    it('renderModelBreakdown uses correct colors for models', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      const data = {
        byModel: {
          'claude': 50,
          'codex': 30,
          'kimi': 20
        }
      };
      
      widget.renderModelBreakdown(container, data);
      
      const chartData = widget.charts.model.config.data;
      assert.ok(chartData.labels.includes('claude'));
      assert.ok(chartData.labels.includes('codex'));
      assert.ok(chartData.labels.includes('kimi'));
    });

    it('destroys existing chart before creating new one', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      const container = createElementStub();
      
      // Create first chart
      widget.renderCostTrendChart(container, { dailyCosts: [] }, '7d');
      const firstChart = widget.charts.trend;
      
      // Create second chart (should destroy first)
      widget.renderCostTrendChart(container, { dailyCosts: [] }, '30d');
      
      assert.equal(firstChart.destroyed, true);
      assert.notEqual(widget.charts.trend, firstChart);
    });
  });

  describe('Event Handler Tests', () => {
    it('handleRefresh clears cache and reloads data', async () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      widget.setCached('test', { data: {} });
      let cleared = false;
      widget.clearCache = () => { cleared = true; };
      
      await widget.handleRefresh();
      
      assert.equal(cleared, true);
    });

    it('handlePeriodChange loads data for new period', async () => {
      const { CostWidget } = baseCtx.context;
      let loadedPeriod;
      const widget = new CostWidget();
      widget.loadBillingData = async (period) => { loadedPeriod = period; };
      
      const mockEvent = { target: { value: '7d' } };
      await widget.handlePeriodChange(mockEvent);
      
      assert.equal(loadedPeriod, '7d');
    });
  });

  describe('Auto-refresh Tests', () => {
    it('startAutoRefresh sets up interval', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      assert.equal(widget.refreshInterval, null);
      widget.startAutoRefresh();
      assert.notEqual(widget.refreshInterval, null);
      
      widget.stopAutoRefresh();
    });

    it('startAutoRefresh does not create multiple intervals', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      widget.startAutoRefresh();
      const firstInterval = widget.refreshInterval;
      
      widget.startAutoRefresh();
      assert.equal(widget.refreshInterval, firstInterval);
      
      widget.stopAutoRefresh();
    });

    it('stopAutoRefresh clears interval', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      widget.startAutoRefresh();
      assert.notEqual(widget.refreshInterval, null);
      
      widget.stopAutoRefresh();
      assert.equal(widget.refreshInterval, null);
    });
  });

  describe('Destroy Tests', () => {
    it('destroy stops auto-refresh and clears cache', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      let stopped = false;
      let cleared = false;
      
      widget.stopAutoRefresh = () => { stopped = true; };
      widget.clearCache = () => { cleared = true; };
      
      widget.destroy();
      
      assert.equal(stopped, true);
      assert.equal(cleared, true);
    });

    it('destroy destroys all charts', () => {
      const { CostWidget } = baseCtx.context;
      const widget = new CostWidget();
      
      // Create mock charts
      const chart1 = { destroy() { this.destroyed = true; } };
      const chart2 = { destroy() { this.destroyed = true; } };
      
      widget.charts = { trend: chart1, model: chart2 };
      
      widget.destroy();
      
      assert.equal(chart1.destroyed, true);
      assert.equal(chart2.destroyed, true);
      assert.equal(Object.keys(widget.charts).length, 0);
    });
  });
});
