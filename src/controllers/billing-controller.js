/**
 * @fileoverview Billing Controller for CogniMesh v5.0
 * REST API endpoints for cost tracking and budget management
 * @module controllers/billing-controller
 * @version 1.0.0
 */

import { CostService } from '../domains/billing/cost-service.js';
import { BudgetService } from '../domains/billing/budget-service.js';
import {
  formatResponse,
  formatListResponse,
  formatError
} from './helpers.js';

/**
 * Billing Controller managing cost tracking and budget APIs
 * @class BillingController
 */
export class BillingController {
  /**
   * Creates a BillingController instance
   * @param {Object} options - Controller options
   * @param {Object} options.db - Database connection
   * @param {Object} [options.repositories] - Repository factory
   */
  constructor(options = {}) {
    this.db = options.db || null;
    this.repositories = options.repositories || null;
    this.costService = new CostService({ repositories: this.repositories, db: this.db });
    this.budgetService = new BudgetService({ 
      repositories: this.repositories, 
      db: this.db, 
      costService: this.costService 
    });
    this.name = 'BillingController';
  }

  /**
   * Initialize the controller
   * @returns {Promise<BillingController>}
   */
  async initialize() {
    return this;
  }

  // ============================================================================
  // Cost Endpoints
  // ============================================================================

  /**
   * GET /api/billing/summary - Dashboard summary
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getDashboardSummary(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = Object.fromEntries(url.searchParams);
      
      const options = {
        company_id: query.company_id ? this._parseIntOrUndefined(query.company_id) : undefined,
        user_id: query.user_id ? this._parseIntOrUndefined(query.user_id) : undefined,
        period_start: query.period_start ? this._parseDateOrUndefined(query.period_start) : undefined,
        period_end: query.period_end ? this._parseDateOrUndefined(query.period_end) : undefined
      };

      // Validate date parameters
      if (query.period_start && !options.period_start) {
        return this._sendValidationError(res, 'Invalid period_start date');
      }
      if (query.period_end && !options.period_end) {
        return this._sendValidationError(res, 'Invalid period_end date');
      }

      const summary = await this.costService.getDashboardSummary(options);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse(summary), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to get dashboard summary');
    }
  }

  /**
   * GET /api/billing/costs - List cost events
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getCosts(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = Object.fromEntries(url.searchParams);
      
      const filters = {
        startDate: query.start_date ? this._parseDateOrUndefined(query.start_date) : undefined,
        endDate: query.end_date ? this._parseDateOrUndefined(query.end_date) : undefined,
        company_id: query.company_id ? this._parseIntOrUndefined(query.company_id) : undefined,
        user_id: query.user_id ? this._parseIntOrUndefined(query.user_id) : undefined,
        agent_id: query.agent_id,
        session_id: query.session_id,
        provider: query.provider,
        model: query.model,
        operation_type: query.operation_type,
        billing_model: query.billing_model
      };

      // Validate date parameters
      if (query.start_date && !filters.startDate) {
        return this._sendValidationError(res, 'Invalid start_date');
      }
      if (query.end_date && !filters.endDate) {
        return this._sendValidationError(res, 'Invalid end_date');
      }

      // Remove undefined filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) delete filters[key];
      });

      const pagination = {
        page: this._parseIntOrDefault(query.page, 1),
        per_page: this._parseIntOrDefault(query.per_page, 50)
      };

      const result = await this.costService.getCosts(filters, pagination);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatListResponse(result.events, {
        total: result.pagination.total,
        limit: result.pagination.per_page,
        offset: (result.pagination.page - 1) * result.pagination.per_page
      }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to get cost events');
    }
  }

  /**
   * GET /api/billing/costs/by-model - Costs grouped by model
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getCostsByModel(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = Object.fromEntries(url.searchParams);
      
      const filters = this._parseCostFilters(query);
      const stats = await this.costService.getStats(filters);
      
      // Transform to array format
      const byModel = Object.entries(stats.costByModel || {}).map(([model, cost]) => ({
        model,
        cost: parseFloat((cost || 0).toFixed(4)),
        percentage: stats.totalCost > 0 
          ? parseFloat((((cost || 0) / stats.totalCost) * 100).toFixed(2))
          : 0
      })).sort((a, b) => b.cost - a.cost);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse(byModel, {
        totalCost: parseFloat((stats.totalCost || 0).toFixed(4)),
        count: byModel.length
      }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to get costs by model');
    }
  }

  /**
   * GET /api/billing/costs/by-provider - Costs grouped by provider
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getCostsByProvider(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = Object.fromEntries(url.searchParams);
      
      const filters = this._parseCostFilters(query);
      const stats = await this.costService.getStats(filters);
      
      // Transform to array format
      const byProvider = Object.entries(stats.costByProvider || {}).map(([provider, cost]) => ({
        provider,
        cost: parseFloat((cost || 0).toFixed(4)),
        percentage: stats.totalCost > 0 
          ? parseFloat((((cost || 0) / stats.totalCost) * 100).toFixed(2))
          : 0
      })).sort((a, b) => b.cost - a.cost);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse(byProvider, {
        totalCost: parseFloat((stats.totalCost || 0).toFixed(4)),
        count: byProvider.length
      }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to get costs by provider');
    }
  }

  /**
   * GET /api/billing/costs/by-agent - Costs grouped by agent
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getCostsByAgent(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = Object.fromEntries(url.searchParams);
      
      const filters = this._parseCostFilters(query);
      const stats = await this.costService.getStats(filters);
      
      // Transform to array format
      const byAgent = Object.entries(stats.costByAgent || {}).map(([agent_id, cost]) => ({
        agent_id,
        cost: parseFloat((cost || 0).toFixed(4)),
        percentage: stats.totalCost > 0 
          ? parseFloat((((cost || 0) / stats.totalCost) * 100).toFixed(2))
          : 0
      })).sort((a, b) => b.cost - a.cost);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse(byAgent, {
        totalCost: parseFloat((stats.totalCost || 0).toFixed(4)),
        count: byAgent.length
      }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to get costs by agent');
    }
  }

  // ============================================================================
  // Budget Endpoints
  // ============================================================================

  /**
   * GET /api/billing/budgets - List budgets
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getBudgets(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = Object.fromEntries(url.searchParams);
      
      const scope = query.scope_type 
        ? { type: query.scope_type, id: query.scope_id }
        : { type: 'global' };
      
      const activeOnly = query.active !== 'false';
      const budgets = await this.budgetService.getBudgetsByScope(scope, activeOnly);
      
      // Get status for each budget
      const budgetsWithStatus = await Promise.all(
        budgets.map(async (budget) => ({
          ...budget,
          status: await this.budgetService.getBudgetStatus(budget.uuid)
        }))
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse(budgetsWithStatus, { count: budgetsWithStatus.length }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to get budgets');
    }
  }

  /**
   * POST /api/billing/budgets - Create budget
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async createBudget(req, res) {
    try {
      const body = await this._parseBody(req);
      
      // Validate required fields
      const required = ['name', 'scope_type', 'period', 'amount'];
      const missing = required.filter(field => body[field] === undefined || body[field] === null || body[field] === '');
      if (missing.length > 0) {
        return this._sendValidationError(res, `Missing required fields: ${missing.join(', ')}`);
      }

      // Validate amount is a positive number
      if (typeof body.amount !== 'number' || body.amount <= 0 || isNaN(body.amount)) {
        return this._sendValidationError(res, 'Amount must be a positive number');
      }

      // Validate scope_type
      const validScopeTypes = ['global', 'company', 'user', 'agent'];
      if (!validScopeTypes.includes(body.scope_type)) {
        return this._sendValidationError(res, `scope_type must be one of: ${validScopeTypes.join(', ')}`);
      }

      // Validate period
      const validPeriods = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];
      if (!validPeriods.includes(body.period)) {
        return this._sendValidationError(res, `period must be one of: ${validPeriods.join(', ')}`);
      }

      const options = {};
      if (body.created_by) {
        options.created_by = this._parseIntOrDefault(body.created_by, 0);
      }

      const budget = await this.budgetService.createBudget(body, options);
      
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse(budget, { message: 'Budget created successfully' }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to create budget');
    }
  }

  /**
   * GET /api/billing/budgets/:id - Get budget
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {string} id - Budget UUID
   */
  async getBudget(req, res, id) {
    try {
      if (!id || typeof id !== 'string') {
        return this._sendValidationError(res, 'Budget ID is required');
      }

      const budget = await this.budgetService.getBudget(id);
      
      if (!budget) {
        return this._sendNotFoundError(res, `Budget not found: ${id}`);
      }

      const status = await this.budgetService.getBudgetStatus(id);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse({ ...budget, status }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to get budget');
    }
  }

  /**
   * PUT /api/billing/budgets/:id - Update budget
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {string} id - Budget UUID
   */
  async updateBudget(req, res, id) {
    try {
      if (!id || typeof id !== 'string') {
        return this._sendValidationError(res, 'Budget ID is required');
      }

      const body = await this._parseBody(req);
      
      // Validate amount if provided
      if (body.amount !== undefined) {
        if (typeof body.amount !== 'number' || body.amount <= 0 || isNaN(body.amount)) {
          return this._sendValidationError(res, 'Amount must be a positive number');
        }
      }

      // Check if budget exists
      const existing = await this.budgetService.getBudget(id);
      if (!existing) {
        return this._sendNotFoundError(res, `Budget not found: ${id}`);
      }

      const updated = await this.budgetService.updateBudget(id, body);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse(updated, { message: 'Budget updated successfully' }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to update budget');
    }
  }

  /**
   * DELETE /api/billing/budgets/:id - Delete budget
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {string} id - Budget UUID
   */
  async deleteBudget(req, res, id) {
    try {
      if (!id || typeof id !== 'string') {
        return this._sendValidationError(res, 'Budget ID is required');
      }

      // Check if budget exists
      const existing = await this.budgetService.getBudget(id);
      if (!existing) {
        return this._sendNotFoundError(res, `Budget not found: ${id}`);
      }

      const deleted = await this.budgetService.deleteBudget(id);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse({ deleted }, { message: 'Budget deleted successfully' }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to delete budget');
    }
  }

  // ============================================================================
  // Alert Endpoints
  // ============================================================================

  /**
   * GET /api/billing/alerts - List budget alerts
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getAlerts(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = Object.fromEntries(url.searchParams);
      
      const options = {
        limit: this._parseIntOrDefault(query.limit, 50)
      };
      
      if (query.budget_id) {
        options.budgetUuid = query.budget_id;
      }

      const alerts = await this.budgetService.getAlerts(options);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse(alerts, { count: alerts.length }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to get alerts');
    }
  }

  /**
   * PUT /api/billing/alerts/:id/acknowledge - Acknowledge alert
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {string} id - Alert UUID
   */
  async acknowledgeAlert(req, res, id) {
    try {
      if (!id || typeof id !== 'string') {
        return this._sendValidationError(res, 'Alert ID is required');
      }

      const body = await this._parseBody(req);
      const userId = body.user_id ? this._parseIntOrDefault(body.user_id, 0) : 0;
      
      const acknowledged = await this.budgetService.acknowledgeAlert(id, userId);
      
      if (!acknowledged) {
        return this._sendNotFoundError(res, `Alert not found or already acknowledged: ${id}`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse({ acknowledged: true }, { message: 'Alert acknowledged successfully' }), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to acknowledge alert');
    }
  }

  // ============================================================================
  // Forecast Endpoints
  // ============================================================================

  /**
   * GET /api/billing/forecast - Spending forecast
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getForecast(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = Object.fromEntries(url.searchParams);
      
      const days = this._parseIntOrDefault(query.days, 30);
      const filters = {};
      
      if (query.company_id) {
        filters.company_id = this._parseIntOrUndefined(query.company_id);
      }
      if (query.user_id) {
        filters.user_id = this._parseIntOrUndefined(query.user_id);
      }

      // If budget_id provided, get budget-specific forecast
      if (query.budget_id) {
        const forecast = await this.budgetService.getForecast(query.budget_id, days);
        
        if (!forecast) {
          return this._sendNotFoundError(res, `Budget not found: ${query.budget_id}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(formatResponse(forecast), null, 2));
        return true;
      }

      // General spending forecast
      const forecast = await this.costService.predictCosts(days, filters);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatResponse(forecast), null, 2));
      return true;
    } catch (error) {
      return this._sendError(res, error, 'Failed to get forecast');
    }
  }

  // ============================================================================
  // Main Route Handler
  // ============================================================================

  /**
   * Handle billing API routes
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Promise<boolean>} Whether the route was handled
   */
  async handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method;

    // Dashboard Summary
    if (pathname === '/api/billing/summary' && method === 'GET') {
      return await this.getDashboardSummary(req, res);
    }

    // Cost Events
    if (pathname === '/api/billing/costs' && method === 'GET') {
      return await this.getCosts(req, res);
    }

    // Costs by Model
    if (pathname === '/api/billing/costs/by-model' && method === 'GET') {
      return await this.getCostsByModel(req, res);
    }

    // Costs by Provider
    if (pathname === '/api/billing/costs/by-provider' && method === 'GET') {
      return await this.getCostsByProvider(req, res);
    }

    // Costs by Agent
    if (pathname === '/api/billing/costs/by-agent' && method === 'GET') {
      return await this.getCostsByAgent(req, res);
    }

    // Budgets - List
    if (pathname === '/api/billing/budgets' && method === 'GET') {
      return await this.getBudgets(req, res);
    }

    // Budgets - Create
    if (pathname === '/api/billing/budgets' && method === 'POST') {
      return await this.createBudget(req, res);
    }

    // Budget - Single operations (GET, PUT, DELETE)
    const budgetMatch = pathname.match(/^\/api\/billing\/budgets\/([^\/]+)$/);
    if (budgetMatch) {
      const id = budgetMatch[1];
      if (method === 'GET') {
        return await this.getBudget(req, res, id);
      }
      if (method === 'PUT') {
        return await this.updateBudget(req, res, id);
      }
      if (method === 'DELETE') {
        return await this.deleteBudget(req, res, id);
      }
    }

    // Alerts - List
    if (pathname === '/api/billing/alerts' && method === 'GET') {
      return await this.getAlerts(req, res);
    }

    // Alert - Acknowledge
    const alertAckMatch = pathname.match(/^\/api\/billing\/alerts\/([^\/]+)\/acknowledge$/);
    if (alertAckMatch && method === 'PUT') {
      return await this.acknowledgeAlert(req, res, alertAckMatch[1]);
    }

    // Forecast
    if (pathname === '/api/billing/forecast' && method === 'GET') {
      return await this.getForecast(req, res);
    }

    return false;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Parse cost filters from query params
   * @private
   */
  _parseCostFilters(query) {
    const filters = {};
    
    if (query.start_date) {
      filters.startDate = new Date(query.start_date);
    }
    if (query.end_date) {
      filters.endDate = new Date(query.end_date);
    }
    if (query.company_id) {
      filters.company_id = parseInt(query.company_id);
    }
    if (query.user_id) {
      filters.user_id = parseInt(query.user_id);
    }

    return filters;
  }

  /**
   * Parse request body
   * @private
   */
  async _parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          const error = new Error('Invalid JSON body');
          error.code = 'PARSE_ERROR';
          reject(error);
        }
      });
      req.on('error', (err) => {
        const error = new Error('Request read error: ' + err.message);
        error.code = 'INTERNAL_ERROR';
        reject(error);
      });
    });
  }

  /**
   * Send error response with proper status code
   * @private
   * @param {Object} res - Response object
   * @param {Error} error - Error object
   * @param {string} defaultMessage - Default error message
   * @returns {boolean} Always returns true
   */
  _sendError(res, error, defaultMessage) {
    console.error(`[BillingController] Error:`, error);
    
    // Determine appropriate status code and error code
    let statusCode = 500;
    // let errorCode = error.code || 'INTERNAL_ERROR';
    
    if (error.code === 'VALIDATION_ERROR' || error.code === 'PARSE_ERROR') {
      statusCode = 400;
    } else if (error.code === 'NOT_FOUND') {
      statusCode = 404;
    } else if (error.code === 'UNAUTHORIZED') {
      statusCode = 401;
    } else if (error.code === 'FORBIDDEN') {
      statusCode = 403;
    } else if (error.code === 'CONFLICT') {
      statusCode = 409;
    }
    
    const errorResponse = formatError(error, { defaultMessage });
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse, null, 2));
    return true;
  }

  /**
   * Send validation error response
   * @private
   * @param {Object} res - Response object
   * @param {string} message - Error message
   * @returns {boolean} Always returns true
   */
  _sendValidationError(res, message) {
    const error = new Error(message);
    error.code = 'VALIDATION_ERROR';
    return this._sendError(res, error, message);
  }

  /**
   * Send not found error response
   * @private
   * @param {Object} res - Response object
   * @param {string} message - Error message
   * @returns {boolean} Always returns true
   */
  _sendNotFoundError(res, message) {
    const error = new Error(message);
    error.code = 'NOT_FOUND';
    return this._sendError(res, error, message);
  }

  /**
   * Parse integer with default value
   * @private
   * @param {string} value - Value to parse
   * @param {number} defaultValue - Default if parsing fails
   * @returns {number}
   */
  _parseIntOrDefault(value, defaultValue) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Parse integer or return undefined
   * @private
   * @param {string} value - Value to parse
   * @returns {number|undefined}
   */
  _parseIntOrUndefined(value) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
  }

  /**
   * Parse date or return undefined
   * @private
   * @param {string} value - Date string to parse
   * @returns {Date|undefined}
   */
  _parseDateOrUndefined(value) {
    if (!value || typeof value !== 'string') return undefined;
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }
}

/**
 * Factory function to create a billing controller
 * @param {Object} options - Controller options
 * @returns {BillingController}
 */
export function createBillingController(options = {}) {
  return new BillingController(options);
}

export default BillingController;
