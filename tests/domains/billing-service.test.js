/**
 * @fileoverview Billing Domain Tests - Cost tracking and budget management
 * @module tests/domains/billing-service
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CostService } from '../../src/domains/billing/cost-service.js';
import { BudgetService } from '../../src/domains/billing/budget-service.js';

// Mock database for testing
class MockDatabase {
  constructor() {
    this.tables = {
      cost_events: [],
      cost_rates: [],
      budgets: [],
      budget_alerts: []
    };
  }

  prepare(sql) {
    const mockDb = this;
    return {
      get: (...params) => this.executeGet(sql, params),
      all: (...params) => this.executeAll(sql, params),
      run: (...params) => this.executeRun(sql, params)
    };
  }

  executeGet(sql, params) {
    // Handle cost_rates lookup
    if (sql.includes('cost_rates')) {
      const rate = this.tables.cost_rates.find(r => 
        r.provider === params[0] && r.model === params[1] && r.billing_model === params[2]
      );
      return rate || null;
    }
    // Handle count queries
    if (sql.includes('COUNT(*)')) {
      return { total: this.tables.cost_events.length };
    }
    return null;
  }

  executeAll(sql, params) {
    // Handle cost_events queries
    if (sql.includes('cost_events')) {
      let events = [...this.tables.cost_events];
      
      // Apply filters based on SQL
      if (sql.includes('created_at >= ?')) {
        const startDate = params.find(p => p instanceof Date || typeof p === 'string');
        if (startDate) {
          events = events.filter(e => new Date(e.created_at) >= new Date(startDate));
        }
      }
      
      return events;
    }
    return [];
  }

  executeRun(sql, params) {
    // Handle INSERT
    if (sql.includes('INSERT INTO cost_events')) {
      const event = this.createEventFromParams(params);
      this.tables.cost_events.push(event);
      return { changes: 1, lastInsertRowid: this.tables.cost_events.length };
    }
    
    if (sql.includes('INSERT INTO budgets')) {
      const budget = this.createBudgetFromParams(params, sql);
      this.tables.budgets.push(budget);
      return { changes: 1, lastInsertRowid: this.tables.budgets.length };
    }

    if (sql.includes('INSERT INTO budget_alerts')) {
      const alert = this.createAlertFromParams(params, sql);
      this.tables.budget_alerts.push(alert);
      return { changes: 1, lastInsertRowid: this.tables.budget_alerts.length };
    }

    // Handle UPDATE
    if (sql.includes('UPDATE budgets')) {
      return { changes: 1 };
    }

    // Handle DELETE
    if (sql.includes('DELETE FROM budgets')) {
      return { changes: 1 };
    }

    return { changes: 0 };
  }

  createEventFromParams(params) {
    // Map params to event object based on INSERT order
    return {
      uuid: params[0],
      request_id: params[1],
      company_id: params[2],
      user_id: params[3],
      agent_id: params[4],
      session_id: params[5],
      conversation_id: params[6],
      task_id: params[7],
      provider: params[8],
      model: params[9],
      billing_model: params[10],
      input_tokens: params[11],
      output_tokens: params[12],
      total_tokens: params[13],
      input_cost: params[14],
      output_cost: params[15],
      base_cost: params[16],
      total_cost: params[17],
      routing_strategy: params[18],
      estimated_cost: params[19],
      operation_type: params[20],
      metadata: params[21],
      created_at: params[22]
    };
  }

  createBudgetFromParams(params, sql) {
    return {
      uuid: params[0],
      scope_type: params[1],
      scope_id: params[2],
      name: params[3],
      description: params[4],
      period: params[5],
      amount: params[6],
      currency: params[7],
      start_date: params[8],
      end_date: params[9],
      alert_threshold_1: params[10],
      alert_threshold_2: params[11],
      alert_threshold_3: params[12],
      enforcement_mode: params[13],
      providers: params[14],
      models: params[15],
      operations: params[16],
      is_active: params[17],
      created_by: params[18],
      metadata: params[19],
      created_at: params[20],
      updated_at: params[21]
    };
  }

  createAlertFromParams(params, sql) {
    return {
      uuid: params[0],
      budget_id: params[1],
      level: params[2],
      threshold_triggered: params[3],
      current_spend: params[4],
      budget_limit: params[5],
      title: params[6],
      message: params[7],
      acknowledged: params[8],
      channels_notified: params[9],
      created_at: params[10]
    };
  }

  addRate(provider, model, inputRate, outputRate, baseCost = 0) {
    this.tables.cost_rates.push({
      provider,
      model,
      billing_model: 'subscription',
      input_rate: inputRate,
      output_rate: outputRate,
      base_cost: baseCost,
      currency: 'USD',
      effective_from: new Date().toISOString(),
      effective_until: null
    });
  }
}

describe('Billing Domain', () => {
  describe('CostService', () => {
    let costService;
    let mockDb;

    beforeEach(() => {
      mockDb = new MockDatabase();
      costService = new CostService({ db: mockDb });
    });

    describe('Cost Recording', () => {
      it('should record a cost event with calculated costs', async () => {
        mockDb.addRate('openai', 'gpt-4', 0.03, 0.06);

        const event = await costService.recordCost({
          tokens: { input: 1000, output: 500 },
          provider: 'openai',
          model: 'gpt-4',
          attribution: {
            company_id: 1,
            user_id: 1,
            agent_id: 'agent-1'
          },
          context: {
            request_id: 'req-123',
            conversation_id: 1
          },
          operation_type: 'completion'
        });

        assert.ok(event.uuid.startsWith('evt_'));
        assert.equal(event.provider, 'openai');
        assert.equal(event.model, 'gpt-4');
        assert.equal(event.input_tokens, 1000);
        assert.equal(event.output_tokens, 500);
        assert.equal(event.total_tokens, 1500);
        assert.ok(event.total_cost > 0);
        assert.equal(event.company_id, 1);
        assert.equal(event.user_id, 1);
        assert.equal(event.agent_id, 'agent-1');
        assert.ok(event.created_at);
      });

      it('should return zero cost for unknown rates', async () => {
        const event = await costService.recordCost({
          tokens: { input: 1000, output: 500 },
          provider: 'unknown',
          model: 'unknown-model',
          operation_type: 'completion'
        });

        assert.equal(event.total_cost, 0);
        assert.equal(event.input_cost, 0);
        assert.equal(event.output_cost, 0);
      });

      it('should calculate costs correctly based on rates', async () => {
        mockDb.addRate('anthropic', 'claude-3', 0.008, 0.024);

        const costs = await costService.calculateCost('anthropic', 'claude-3', {
          input: 2000,
          output: 1000
        });

        // Input: (2000 * 0.008) / 1000 = 0.016
        // Output: (1000 * 0.024) / 1000 = 0.024
        // Total: 0.04
        assert.equal(costs.input_cost, 0.016);
        assert.equal(costs.output_cost, 0.024);
        assert.equal(costs.total_cost, 0.04);
      });

      it('should include base cost in total', async () => {
        mockDb.addRate('openai', 'gpt-4', 0.03, 0.06, 0.001);

        const costs = await costService.calculateCost('openai', 'gpt-4', {
          input: 1000,
          output: 0
        });

        // Input: (1000 * 0.03) / 1000 = 0.03
        // Base: 0.001
        // Total: 0.031
        assert.equal(costs.base_cost, 0.001);
        assert.equal(costs.total_cost, 0.031);
      });

      it('should emit cost:recorded event', async () => {
        mockDb.addRate('openai', 'gpt-4', 0.03, 0.06);

        let emittedEvent = null;
        costService.on('cost:recorded', (event) => {
          emittedEvent = event;
        });

        await costService.recordCost({
          tokens: { input: 100, output: 50 },
          provider: 'openai',
          model: 'gpt-4'
        });

        assert.ok(emittedEvent);
        assert.ok(emittedEvent.uuid);
      });

      it('should store routing information', async () => {
        mockDb.addRate('openai', 'gpt-4', 0.03, 0.06);

        const event = await costService.recordCost({
          tokens: { input: 100, output: 50 },
          provider: 'openai',
          model: 'gpt-4',
          routing: {
            strategy: 'cost_optimized',
            estimated_cost: 0.005
          }
        });

        assert.equal(event.routing_strategy, 'cost_optimized');
        assert.equal(event.estimated_cost, 0.005);
      });
    });

    describe('Cost Queries', () => {
      it('should return empty array when no db connection', async () => {
        const service = new CostService({});
        const result = await service.getCosts();
        assert.deepEqual(result.events, []);
      });

      it('should filter costs by date range', async () => {
        mockDb.tables.cost_events = [
          { uuid: 'evt-1', created_at: '2024-01-15T00:00:00Z', total_cost: 1.0 },
          { uuid: 'evt-2', created_at: '2024-02-15T00:00:00Z', total_cost: 2.0 },
          { uuid: 'evt-3', created_at: '2024-03-15T00:00:00Z', total_cost: 3.0 }
        ];

        const result = await costService.getCosts({
          startDate: new Date('2024-02-01'),
          endDate: new Date('2024-02-28')
        });

        // Verify the query was processed
        assert.ok(result);
        assert.ok(result.events);
      });
    });

    describe('Cost Statistics', () => {
      it('should calculate aggregated statistics', async () => {
        mockDb.tables.cost_events = [
          { uuid: 'evt-1', total_cost: 1.5, total_tokens: 1000, input_tokens: 600, output_tokens: 400, provider: 'openai', model: 'gpt-4', operation_type: 'completion', agent_id: 'agent-1' },
          { uuid: 'evt-2', total_cost: 2.5, total_tokens: 2000, input_tokens: 1200, output_tokens: 800, provider: 'anthropic', model: 'claude-3', operation_type: 'embedding', agent_id: 'agent-2' },
          { uuid: 'evt-3', total_cost: 1.0, total_tokens: 500, input_tokens: 300, output_tokens: 200, provider: 'openai', model: 'gpt-4', operation_type: 'completion', agent_id: 'agent-1' }
        ];

        const stats = await costService.getStats();

        assert.equal(stats.totalCost, 5.0);
        assert.equal(stats.totalTokens, 3500);
        assert.equal(stats.inputTokens, 2100);
        assert.equal(stats.outputTokens, 1400);
        assert.equal(stats.requestCount, 3);
      });

      it('should group costs by provider', async () => {
        mockDb.tables.cost_events = [
          { uuid: 'evt-1', total_cost: 1.5, provider: 'openai' },
          { uuid: 'evt-2', total_cost: 2.5, provider: 'anthropic' },
          { uuid: 'evt-3', total_cost: 1.0, provider: 'openai' }
        ];

        const stats = await costService.getStats();

        assert.equal(stats.costByProvider.openai, 2.5);
        assert.equal(stats.costByProvider.anthropic, 2.5);
      });

      it('should group costs by model', async () => {
        mockDb.tables.cost_events = [
          { uuid: 'evt-1', total_cost: 1.5, model: 'gpt-4' },
          { uuid: 'evt-2', total_cost: 2.5, model: 'claude-3' },
          { uuid: 'evt-3', total_cost: 1.0, model: 'gpt-4' }
        ];

        const stats = await costService.getStats();

        assert.equal(stats.costByModel['gpt-4'], 2.5);
        assert.equal(stats.costByModel['claude-3'], 2.5);
      });

      it('should return zero values when no db', async () => {
        const service = new CostService({});
        const stats = await service.getStats();

        assert.equal(stats.totalCost, 0);
        assert.equal(stats.totalTokens, 0);
        assert.equal(stats.requestCount, 0);
        assert.deepEqual(stats.costByProvider, {});
      });
    });

    describe('Cost Forecasting', () => {
      it('should predict costs with insufficient data', async () => {
        const forecast = await costService.predictCosts(30);

        assert.equal(forecast.predictedCost, 0);
        assert.equal(forecast.confidence, 0);
        assert.equal(forecast.trend, 'insufficient_data');
        assert.equal(forecast.averageDailyCost, 0);
      });

      it('should provide daily breakdown in predictions', async () => {
        const forecast = await costService.predictCosts(7);

        assert.equal(forecast.dailyBreakdown.length, 7);
      });
    });

    describe('Dashboard Summary', () => {
      it('should return comprehensive dashboard data', async () => {
        mockDb.tables.cost_events = [
          { uuid: 'evt-1', total_cost: 1.5, total_tokens: 1000, input_tokens: 600, output_tokens: 400, provider: 'openai', model: 'gpt-4', operation_type: 'completion', agent_id: 'agent-1', created_at: new Date().toISOString() }
        ];

        const summary = await costService.getDashboardSummary({
          company_id: 1
        });

        assert.ok(summary.period);
        assert.ok(summary.summary);
        assert.ok(summary.breakdown);
        assert.ok(summary.trend);
        assert.ok(summary.forecast);

        assert.ok(typeof summary.summary.totalSpend === 'number');
        assert.ok(typeof summary.summary.totalRequests === 'number');
        assert.ok(typeof summary.summary.averageCostPerRequest === 'number');
      });
    });
  });

  describe('BudgetService', () => {
    let budgetService;
    let mockDb;

    beforeEach(() => {
      mockDb = new MockDatabase();
      budgetService = new BudgetService({ db: mockDb });
    });

    describe('Budget CRUD', () => {
      it('should create a monthly budget', async () => {
        const budget = await budgetService.createBudget({
          name: 'Monthly AI Budget',
          scope_type: 'company',
          scope_id: '1',
          period: 'monthly',
          amount: 1000
        });

        assert.ok(budget.uuid.startsWith('bud_'));
        assert.equal(budget.name, 'Monthly AI Budget');
        assert.equal(budget.period, 'monthly');
        assert.equal(budget.amount, 1000);
        assert.equal(budget.scope_type, 'company');
        assert.equal(budget.scope_id, '1');
        assert.equal(budget.currency, 'USD');
        assert.equal(budget.alert_threshold_1, 0.50);
        assert.equal(budget.alert_threshold_2, 0.75);
        assert.equal(budget.alert_threshold_3, 0.90);
        assert.equal(budget.enforcement_mode, 'hard');
      });

      it('should create a daily budget', async () => {
        const budget = await budgetService.createBudget({
          name: 'Daily Limit',
          scope_type: 'user',
          scope_id: 'user-1',
          period: 'daily',
          amount: 50
        });

        assert.equal(budget.period, 'daily');
        assert.ok(budget.start_date);
        assert.ok(budget.end_date);
      });

      it('should emit budget:created event', async () => {
        let emittedBudget = null;
        budgetService.on('budget:created', (budget) => {
          emittedBudget = budget;
        });

        await budgetService.createBudget({
          name: 'Test Budget',
          scope_type: 'global',
          period: 'weekly',
          amount: 500
        });

        assert.ok(emittedBudget);
      });

      it('should update budget', async () => {
        const budget = await budgetService.createBudget({
          name: 'Test Budget',
          scope_type: 'company',
          scope_id: '1',
          period: 'monthly',
          amount: 1000
        });

        mockDb.tables.budgets.push(budget);

        // Mock the getBudget to return the budget
        const originalGetBudget = budgetService.getBudget.bind(budgetService);
        budgetService.getBudget = async () => budget;

        const updated = await budgetService.updateBudget(budget.uuid, {
          name: 'Updated Budget',
          amount: 2000
        });

        assert.ok(updated);
      });

      it('should delete budget', async () => {
        const budget = await budgetService.createBudget({
          name: 'Test Budget',
          scope_type: 'company',
          scope_id: '1',
          period: 'monthly',
          amount: 1000
        });

        const result = await budgetService.deleteBudget(budget.uuid);
        assert.equal(result, true);
      });
    });

    describe('Budget Status', () => {
      it('should calculate budget status correctly', async () => {
        const budget = await budgetService.createBudget({
          name: 'Test Budget',
          scope_type: 'company',
          scope_id: '1',
          period: 'monthly',
          amount: 1000,
          alert_threshold_1: 0.50,
          alert_threshold_2: 0.75,
          alert_threshold_3: 0.90
        });

        // Mock database to return spend data
        mockDb.executeGet = (sql) => {
          if (sql.includes('SUM(total_cost)')) {
            return { total: 800 }; // 80% spent
          }
          return budget;
        };

        budgetService.getBudget = async () => budget;

        const status = await budgetService.getBudgetStatus(budget.uuid);

        assert.ok(status);
        assert.equal(status.limit, 1000);
        assert.equal(status.spent, 800);
        assert.equal(status.remaining, 200);
        assert.equal(status.percentage, 80);
      });

      it('should identify exceeded budgets', async () => {
        const budget = {
          uuid: 'bud-1',
          name: 'Test',
          amount: 100,
          period: 'monthly',
          scope_type: 'company',
          scope_id: '1',
          is_active: true,
          alert_threshold_1: 0.5,
          alert_threshold_2: 0.75,
          alert_threshold_3: 0.9,
          enforcement_mode: 'hard'
        };

        mockDb.executeGet = (sql) => {
          if (sql.includes('SUM(total_cost)')) {
            return { total: 150 }; // 150% spent
          }
          return budget;
        };

        budgetService.getBudget = async () => budget;

        const status = await budgetService.getBudgetStatus('bud-1');

        assert.equal(status.status, BudgetService.ALERT_LEVELS.EXCEEDED);
        assert.equal(status.isBlocking, true);
      });
    });

    describe('Budget Enforcement', () => {
      it('should allow operation within budget', async () => {
        const budget = {
          uuid: 'bud-1',
          name: 'Test',
          amount: 1000,
          period: 'monthly',
          scope_type: 'company',
          scope_id: '1',
          is_active: true,
          enforcement_mode: 'hard'
        };

        mockDb.executeGet = (sql) => {
          if (sql.includes('SUM(total_cost)')) {
            return { total: 100 }; // 10% spent
          }
          return budget;
        };

        budgetService.getBudgetsByScope = async () => [budget];

        const check = await budgetService.checkBudget({
          estimatedCost: 50,
          scope_type: 'company',
          scope_id: '1'
        });

        assert.equal(check.allowed, true);
      });

      it('should block operation when budget exceeded with hard enforcement', async () => {
        const budget = {
          uuid: 'bud-1',
          name: 'Test',
          amount: 100,
          period: 'monthly',
          scope_type: 'company',
          scope_id: '1',
          is_active: true,
          enforcement_mode: 'hard'
        };

        mockDb.executeGet = (sql) => {
          if (sql.includes('SUM(total_cost)')) {
            return { total: 150 }; // Exceeded
          }
          return budget;
        };

        budgetService.getBudgetsByScope = async () => [budget];
        budgetService.getBudgetStatus = async () => ({
          uuid: 'bud-1',
          status: 'exceeded',
          isBlocking: true,
          remaining: 0
        });

        const check = await budgetService.checkBudget({
          estimatedCost: 10,
          scope_type: 'company',
          scope_id: '1'
        });

        assert.equal(check.allowed, false);
        assert.ok(check.reason);
      });

      it('should allow operation with soft enforcement even when exceeded', async () => {
        const budget = {
          uuid: 'bud-1',
          name: 'Test',
          amount: 100,
          period: 'monthly',
          scope_type: 'company',
          scope_id: '1',
          is_active: true,
          enforcement_mode: 'soft'
        };

        mockDb.executeGet = (sql) => {
          if (sql.includes('SUM(total_cost)')) {
            return { total: 150 };
          }
          return budget;
        };

        budgetService.getBudgetsByScope = async () => [budget];
        budgetService.getBudgetStatus = async () => ({
          uuid: 'bud-1',
          status: 'exceeded',
          isBlocking: false,
          remaining: 0
        });

        const check = await budgetService.checkBudget({
          estimatedCost: 10,
          scope_type: 'company',
          scope_id: '1'
        });

        assert.equal(check.allowed, true);
        assert.ok(check.warnings);
      });

      it('should filter by provider if specified in budget', async () => {
        const budget = {
          uuid: 'bud-1',
          name: 'Test',
          amount: 1000,
          period: 'monthly',
          scope_type: 'company',
          scope_id: '1',
          is_active: true,
          providers: ['openai']
        };

        budgetService.getBudgetsByScope = async () => [budget];

        const check = await budgetService.checkBudget({
          estimatedCost: 50,
          provider: 'anthropic', // Different provider
          scope_type: 'company',
          scope_id: '1'
        });

        // Should be allowed since budget doesn't apply to this provider
        assert.equal(check.allowed, true);
      });
    });

    describe('Alert Generation', () => {
      it('should create alert when threshold exceeded', async () => {
        const budget = {
          uuid: 'bud-1',
          name: 'Test Budget',
          amount: 1000,
          period: 'monthly',
          scope_type: 'company',
          scope_id: '1',
          is_active: true,
          alert_threshold_1: 0.50,
          alert_threshold_2: 0.75,
          alert_threshold_3: 0.90
        };

        budgetService.getAllBudgetStatuses = async () => [{
          uuid: 'bud-1',
          name: 'Test Budget',
          limit: 1000,
          spent: 850,
          percentage: 85,
          status: 'critical'
        }];

        budgetService.getBudget = async () => budget;

        mockDb.executeGet = () => null; // No recent alert

        const alerts = await budgetService.checkAlerts();

        assert.ok(Array.isArray(alerts));
      });

      it('should format alert title correctly', () => {
        const status = {
          name: 'Test Budget',
          percentage: 85
        };

        const title = budgetService._formatAlertTitle('critical', status);
        assert.equal(title, 'Budget Critical: Test Budget');
      });

      it('should format alert message for exceeded budget', () => {
        const status = {
          name: 'Test Budget',
          spent: 1100,
          limit: 1000,
          percentage: 110
        };

        const message = budgetService._formatAlertMessage('exceeded', status);
        assert.ok(message.includes('exceeded'));
        assert.ok(message.includes('1100'));
        assert.ok(message.includes('1000'));
      });

      it('should acknowledge alert', async () => {
        const result = await budgetService.acknowledgeAlert('alr-1', 1);
        assert.equal(result, true);
      });
    });

    describe('Budget Forecast', () => {
      it('should return forecast with risk assessment', async () => {
        const budget = {
          uuid: 'bud-1',
          name: 'Monthly Budget',
          amount: 1000,
          period: 'monthly',
          scope_type: 'company',
          scope_id: '1'
        };

        budgetService.getBudget = async () => budget;
        budgetService.getBudgetStatus = async () => ({
          spent: 500,
          remaining: 500
        });

        const forecast = await budgetService.getForecast('bud-1', 30);

        assert.ok(forecast);
        assert.equal(forecast.budgetUuid, 'bud-1');
        assert.equal(forecast.currentSpend, 500);
        assert.equal(forecast.budgetLimit, 1000);
        assert.ok(forecast.forecast);
        assert.ok(forecast.projection);
        assert.ok(forecast.risk);
      });
    });

    describe('Period Calculations', () => {
      it('should calculate daily period correctly', () => {
        const period = budgetService._calculatePeriod('daily', new Date('2024-03-15T10:30:00Z'));
        
        assert.equal(period.start.getHours(), 0);
        assert.equal(period.start.getMinutes(), 0);
        assert.equal(period.end.getHours(), 23);
        assert.equal(period.end.getMinutes(), 59);
      });

      it('should calculate weekly period correctly', () => {
        const period = budgetService._calculatePeriod('weekly', new Date('2024-03-15')); // Friday
        
        assert.ok(period.start);
        assert.ok(period.end);
      });

      it('should calculate monthly period correctly', () => {
        const period = budgetService._calculatePeriod('monthly', new Date('2024-03-15'));
        
        assert.equal(period.start.getDate(), 1);
        assert.equal(period.start.getMonth(), 2); // March
      });

      it('should throw for unknown period', () => {
        assert.throws(() => {
          budgetService._calculatePeriod('unknown');
        }, /Unknown period type/);
      });
    });
  });
});
