/**
 * @fileoverview Budget Policy Controller
 * Handles policy and incident endpoints under /api/billing.
 */

import { BudgetPolicyService } from '../domains/billing/budget-policy-service.js';
import { formatResponse, formatListResponse, formatError } from './helpers.js';

function parseBool(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') return true;
  if (value === 0 || value === '0' || String(value).toLowerCase() === 'false') return false;
  return fallback;
}

export class BudgetPolicyController {
  constructor(options = {}) {
    this.db = options.db || null;
    this.policyService = options.policyService || new BudgetPolicyService({ db: this.db });
    this.name = 'BudgetPolicyController';
  }

  async initialize() {
    return this;
  }

  async handle(req, res) {
    const method = req.method;
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/billing/policies' && method === 'GET') {
      return this.listPolicies(req, res, url);
    }
    if (pathname === '/api/billing/policies' && method === 'POST') {
      return this.createPolicy(req, res);
    }

    const policyMatch = pathname.match(/^\/api\/billing\/policies\/([^/]+)$/);
    if (policyMatch && method === 'GET') return this.getPolicy(req, res, policyMatch[1]);
    if (policyMatch && method === 'PUT') return this.updatePolicy(req, res, policyMatch[1]);
    if (policyMatch && method === 'DELETE') return this.deletePolicy(req, res, policyMatch[1]);

    const policyEvaluateMatch = pathname.match(/^\/api\/billing\/policies\/([^/]+)\/evaluate$/);
    if (policyEvaluateMatch && method === 'POST') {
      return this.evaluatePolicy(req, res, policyEvaluateMatch[1]);
    }

    if (pathname === '/api/billing/incidents' && method === 'GET') {
      return this.listIncidents(req, res, url);
    }

    const incidentAckMatch = pathname.match(/^\/api\/billing\/incidents\/([^/]+)\/acknowledge$/);
    if (incidentAckMatch && (method === 'POST' || method === 'PUT')) {
      return this.acknowledgeIncident(req, res, incidentAckMatch[1]);
    }

    return false;
  }

  async createPolicy(req, res) {
    try {
      const body = await this._parseBody(req);
      const policy = await this.policyService.createPolicy(body);
      this._send(res, 201, formatResponse(policy, { message: 'Budget policy created' }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to create budget policy');
      return true;
    }
  }

  async listPolicies(_req, res, url) {
    try {
      const query = Object.fromEntries(url.searchParams);
      const policies = await this.policyService.listPolicies({
        company_id: query.company_id,
        scope_type: query.scope_type,
        scope_id: query.scope_id,
        is_active: parseBool(query.is_active)
      });

      this._send(res, 200, formatListResponse(policies, {
        total: policies.length,
        limit: policies.length || 1,
        offset: 0
      }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to list budget policies');
      return true;
    }
  }

  async getPolicy(_req, res, idOrUuid) {
    try {
      const policy = await this.policyService.getPolicy(idOrUuid);
      if (!policy) {
        this._send(res, 404, formatError(new Error('Budget policy not found')));
        return true;
      }
      this._send(res, 200, formatResponse(policy));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to fetch budget policy');
      return true;
    }
  }

  async updatePolicy(req, res, idOrUuid) {
    try {
      const body = await this._parseBody(req);
      const policy = await this.policyService.updatePolicy(idOrUuid, body);
      this._send(res, 200, formatResponse(policy, { message: 'Budget policy updated' }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to update budget policy');
      return true;
    }
  }

  async deletePolicy(_req, res, idOrUuid) {
    try {
      const deleted = await this.policyService.deletePolicy(idOrUuid);
      if (!deleted) {
        this._send(res, 404, formatError(new Error('Budget policy not found')));
        return true;
      }
      this._send(res, 200, formatResponse({ deleted: true }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to delete budget policy');
      return true;
    }
  }

  async evaluatePolicy(req, res, idOrUuid) {
    try {
      const body = await this._parseBody(req);
      const result = await this.policyService.evaluatePolicy(idOrUuid, body);
      this._send(res, 200, formatResponse(result));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to evaluate budget policy');
      return true;
    }
  }

  async listIncidents(_req, res, url) {
    try {
      const query = Object.fromEntries(url.searchParams);
      const incidents = await this.policyService.listIncidents({
        company_id: query.company_id,
        policy_id: query.policy_id,
        severity: query.severity,
        acknowledged: parseBool(query.acknowledged),
        limit: query.limit,
        offset: query.offset
      });

      this._send(res, 200, formatListResponse(incidents, {
        total: incidents.length,
        limit: incidents.length || 1,
        offset: 0
      }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to list budget incidents');
      return true;
    }
  }

  async acknowledgeIncident(req, res, idOrUuid) {
    try {
      const body = await this._parseBody(req).catch(() => ({}));
      const incident = await this.policyService.acknowledgeIncident(idOrUuid, body.acknowledged_by || null);
      if (!incident) {
        this._send(res, 404, formatError(new Error('Budget incident not found')));
        return true;
      }
      this._send(res, 200, formatResponse(incident, { message: 'Budget incident acknowledged' }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to acknowledge budget incident');
      return true;
    }
  }

  async _parseBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1024 * 1024) reject(new Error('Request body too large'));
      });
      req.on('end', () => {
        if (!data.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  _send(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }

  _sendError(res, error, fallbackMessage) {
    const status = /not found/i.test(error?.message || '') ? 404 : 400;
    this._send(res, status, formatError(error instanceof Error ? error : new Error(fallbackMessage)));
  }
}

export const createBudgetPolicyController = (options) => new BudgetPolicyController(options);

export default BudgetPolicyController;
