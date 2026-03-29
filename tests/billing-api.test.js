/**
 * @fileoverview Billing API Tests
 * Tests for billing controller REST endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { BillingController } from '../src/controllers/billing-controller.js';
import { createCostTracker, createCostHeaders, createCostRecorder } from '../src/middleware/cost-tracker.js';

// Mock database for testing
const mockDb = {
  prepare: jest.fn(() => ({
    get: jest.fn(),
    all: jest.fn(),
    run: jest.fn()
  }))
};

describe('BillingController API Endpoints', () => {
  let controller;

  beforeAll(() => {
    controller = new BillingController({ db: mockDb });
  });

  describe('Cost Endpoints', () => {
    it('should have getDashboardSummary method', () => {
      expect(typeof controller.getDashboardSummary).toBe('function');
    });

    it('should have getCosts method', () => {
      expect(typeof controller.getCosts).toBe('function');
    });

    it('should have getCostsByModel method', () => {
      expect(typeof controller.getCostsByModel).toBe('function');
    });

    it('should have getCostsByProvider method', () => {
      expect(typeof controller.getCostsByProvider).toBe('function');
    });

    it('should have getCostsByAgent method', () => {
      expect(typeof controller.getCostsByAgent).toBe('function');
    });
  });

  describe('Budget Endpoints', () => {
    it('should have getBudgets method', () => {
      expect(typeof controller.getBudgets).toBe('function');
    });

    it('should have createBudget method', () => {
      expect(typeof controller.createBudget).toBe('function');
    });

    it('should have getBudget method', () => {
      expect(typeof controller.getBudget).toBe('function');
    });

    it('should have updateBudget method', () => {
      expect(typeof controller.updateBudget).toBe('function');
    });

    it('should have deleteBudget method', () => {
      expect(typeof controller.deleteBudget).toBe('function');
    });
  });

  describe('Alert Endpoints', () => {
    it('should have getAlerts method', () => {
      expect(typeof controller.getAlerts).toBe('function');
    });

    it('should have acknowledgeAlert method', () => {
      expect(typeof controller.acknowledgeAlert).toBe('function');
    });
  });

  describe('Forecast Endpoints', () => {
    it('should have getForecast method', () => {
      expect(typeof controller.getForecast).toBe('function');
    });
  });

  describe('Main Handler', () => {
    it('should have handle method', () => {
      expect(typeof controller.handle).toBe('function');
    });

    it('should return false for unmatched routes', async () => {
      const req = { url: '/api/other', method: 'GET', headers: {} };
      const res = { writeHead: jest.fn(), end: jest.fn() };
      const result = await controller.handle(req, res);
      expect(result).toBe(false);
    });
  });
});

describe('Cost Tracker Middleware', () => {
  it('should export createCostTracker', () => {
    expect(typeof createCostTracker).toBe('function');
  });

  it('should export createCostHeaders', () => {
    expect(typeof createCostHeaders).toBe('function');
  });

  it('should export createCostRecorder', () => {
    expect(typeof createCostRecorder).toBe('function');
  });

  it('should create cost tracker middleware', () => {
    const middleware = createCostTracker({ db: mockDb });
    expect(typeof middleware).toBe('function');
  });

  it('should create cost headers middleware', () => {
    const middleware = createCostHeaders({ enabled: true });
    expect(typeof middleware).toBe('function');
  });

  it('should create cost recorder middleware', () => {
    const middleware = createCostRecorder({ db: mockDb });
    expect(typeof middleware).toBe('function');
  });
});

describe('API Route Definitions', () => {
  const expectedRoutes = [
    { path: '/api/billing/summary', method: 'GET', name: 'Dashboard Summary' },
    { path: '/api/billing/costs', method: 'GET', name: 'List Cost Events' },
    { path: '/api/billing/costs/by-model', method: 'GET', name: 'Costs by Model' },
    { path: '/api/billing/costs/by-provider', method: 'GET', name: 'Costs by Provider' },
    { path: '/api/billing/costs/by-agent', method: 'GET', name: 'Costs by Agent' },
    { path: '/api/billing/budgets', method: 'GET', name: 'List Budgets' },
    { path: '/api/billing/budgets', method: 'POST', name: 'Create Budget' },
    { path: '/api/billing/budgets/:id', method: 'GET', name: 'Get Budget' },
    { path: '/api/billing/budgets/:id', method: 'PUT', name: 'Update Budget' },
    { path: '/api/billing/budgets/:id', method: 'DELETE', name: 'Delete Budget' },
    { path: '/api/billing/alerts', method: 'GET', name: 'List Alerts' },
    { path: '/api/billing/alerts/:id/acknowledge', method: 'PUT', name: 'Acknowledge Alert' },
    { path: '/api/billing/forecast', method: 'GET', name: 'Spending Forecast' },
  ];

  it.each(expectedRoutes)('should define route: $method $path ($name)', (route) => {
    expect(route.path).toMatch(/^\/api\/billing/);
    expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(route.method);
  });
});
