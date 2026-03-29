/**
 * @fileoverview Billing Domain - Cost tracking and budget management
 * @module domains/billing
 * 
 * This domain provides comprehensive cost tracking and budget management
 * for AI API usage across the CogniMesh platform.
 */

export { CostService } from './cost-service.js';
export { BudgetService } from './budget-service.js';
export { FinanceService } from './finance-service.js';
export { BudgetPolicyService } from './budget-policy-service.js';

/**
 * Billing domain configuration
 * @typedef {Object} BillingConfig
 * @property {Object} db - Database connection
 * @property {Object} [repositories] - Repository factory
 */

/**
 * Billing domain facade
 * Provides unified access to cost tracking and budget management
 */
export class BillingDomain {
  /**
   * Creates a BillingDomain instance
   * @param {BillingConfig} config - Configuration
   */
  constructor(config = {}) {
    this.db = config.db || null;
    this.repositories = config.repositories || null;
    
    // Lazy-loaded services
    this._costService = null;
    this._budgetService = null;
    this._financeService = null;
    this._budgetPolicyService = null;
  }

  /**
   * Get CostService instance
   * @returns {CostService}
   */
  get costService() {
    if (!this._costService) {
      const { CostService } = require('./cost-service.js');
      this._costService = new CostService({
        db: this.db,
        repositories: this.repositories
      });
    }
    return this._costService;
  }

  /**
   * Get BudgetService instance
   * @returns {BudgetService}
   */
  get budgetService() {
    if (!this._budgetService) {
      const { BudgetService } = require('./budget-service.js');
      this._budgetService = new BudgetService({
        db: this.db,
        repositories: this.repositories,
        costService: this.costService
      });
    }
    return this._budgetService;
  }

  /**
   * Get FinanceService instance
   * @returns {FinanceService}
   */
  get financeService() {
    if (!this._financeService) {
      const { FinanceService } = require('./finance-service.js');
      this._financeService = new FinanceService({ db: this.db });
    }
    return this._financeService;
  }

  /**
   * Get BudgetPolicyService instance
   * @returns {BudgetPolicyService}
   */
  get budgetPolicyService() {
    if (!this._budgetPolicyService) {
      const { BudgetPolicyService } = require('./budget-policy-service.js');
      this._budgetPolicyService = new BudgetPolicyService({ db: this.db });
    }
    return this._budgetPolicyService;
  }

  /**
   * Initialize the billing domain
   * @returns {Promise<void>}
   */
  async initialize() {
    // Services are lazy-loaded, nothing to initialize
    console.log('[BillingDomain] Initialized');
  }

  /**
   * Get dashboard summary
   * @param {Object} options - Summary options
   * @returns {Promise<Object>}
   */
  async getDashboardSummary(options = {}) {
    return this.costService.getDashboardSummary(options);
  }

  /**
   * Check budget status
   * @param {string} budgetUuid - Budget UUID
   * @returns {Promise<Object>}
   */
  async checkBudgetStatus(budgetUuid) {
    return this.budgetService.getBudgetStatus(budgetUuid);
  }

  /**
   * Get all budget statuses for a scope
   * @param {Object} scope - Scope filter
   * @returns {Promise<Array>}
   */
  async getBudgetStatuses(scope = null) {
    return this.budgetService.getAllBudgetStatuses(scope);
  }

  /**
   * Get unacknowledged alerts
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async getAlerts(options = {}) {
    return this.budgetService.getAlerts(options);
  }
}

export default BillingDomain;
