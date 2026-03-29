/**
 * @fileoverview Finance Controller
 * REST API endpoints for finance event ledger.
 */

import { FinanceService } from '../domains/billing/finance-service.js';
import { formatResponse, formatListResponse, formatError } from './helpers.js';

function parseIntOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class FinanceController {
  constructor(options = {}) {
    this.db = options.db || null;
    this.financeService = options.financeService || new FinanceService({ db: this.db });
    this.name = 'FinanceController';
  }

  async initialize() {
    return this;
  }

  async handle(req, res) {
    const method = req.method;
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/finance/events' && method === 'GET') {
      return this.listEvents(req, res, url);
    }

    if (pathname === '/api/finance/events' && method === 'POST') {
      return this.createEvent(req, res);
    }

    if (pathname === '/api/finance/summary' && method === 'GET') {
      return this.getSummary(req, res, url);
    }

    const eventMatch = pathname.match(/^\/api\/finance\/events\/([^/]+)$/);
    if (eventMatch && method === 'GET') {
      return this.getEvent(req, res, eventMatch[1]);
    }

    return false;
  }

  async createEvent(req, res) {
    try {
      const body = await this._parseBody(req);
      const event = await this.financeService.createEvent(body);
      this._send(res, 201, formatResponse(event, { message: 'Finance event created' }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to create finance event');
      return true;
    }
  }

  async getEvent(_req, res, idOrUuid) {
    try {
      const event = await this.financeService.getEvent(idOrUuid);
      if (!event) {
        this._send(res, 404, formatError(new Error('Finance event not found')));
        return true;
      }
      this._send(res, 200, formatResponse(event));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to fetch finance event');
      return true;
    }
  }

  async listEvents(_req, res, url) {
    try {
      const query = Object.fromEntries(url.searchParams);
      const filters = {
        company_id: query.company_id,
        event_type: query.event_type,
        start_date: query.start_date,
        end_date: query.end_date
      };
      const pagination = {
        limit: parseIntOrUndefined(query.limit) || 50,
        offset: parseIntOrUndefined(query.offset) || 0
      };

      const result = await this.financeService.listEvents(filters, pagination);
      this._send(res, 200, formatListResponse(result.items, {
        total: result.pagination.total,
        limit: result.pagination.limit,
        offset: result.pagination.offset
      }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to list finance events');
      return true;
    }
  }

  async getSummary(_req, res, url) {
    try {
      const query = Object.fromEntries(url.searchParams);
      const summary = await this.financeService.getSummary({
        company_id: query.company_id,
        start_date: query.start_date,
        end_date: query.end_date
      });
      this._send(res, 200, formatResponse(summary));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to get finance summary');
      return true;
    }
  }

  async _parseBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1024 * 1024) {
          reject(new Error('Request body too large'));
        }
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

  _send(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }

  _sendError(res, error, fallbackMessage) {
    const status = /not found/i.test(error?.message || '') ? 404 : 400;
    this._send(res, status, formatError(error instanceof Error ? error : new Error(fallbackMessage)));
  }
}

export const createFinanceController = (options) => new FinanceController(options);

export default FinanceController;
