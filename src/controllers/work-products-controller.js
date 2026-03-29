/**
 * @fileoverview Work Products Controller
 * REST endpoints for issue-linked work products.
 */

import { WorkProductService } from '../domains/workproducts/work-product-service.js';
import { formatResponse, formatListResponse, formatError } from './helpers.js';

export class WorkProductsController {
  constructor(options = {}) {
    this.db = options.db || null;
    this.workProductService = options.workProductService || new WorkProductService({ db: this.db });
    this.name = 'WorkProductsController';
  }

  async initialize() {
    return this;
  }

  async handle(req, res) {
    const method = req.method;
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/work-products' && method === 'GET') return this.listProducts(req, res, url);
    if (pathname === '/api/work-products' && method === 'POST') return this.createProduct(req, res);

    const productMatch = pathname.match(/^\/api\/work-products\/([^/]+)$/);
    if (productMatch && method === 'GET') return this.getProduct(req, res, productMatch[1]);
    if (productMatch && method === 'PUT') return this.updateProduct(req, res, productMatch[1]);
    if (productMatch && method === 'DELETE') return this.deleteProduct(req, res, productMatch[1]);

    const issueProductsMatch = pathname.match(/^\/api\/work-products\/issue\/([^/]+)$/);
    if (issueProductsMatch && method === 'GET') {
      return this.listIssueProducts(req, res, issueProductsMatch[1], url);
    }

    return false;
  }

  async createProduct(req, res) {
    try {
      const body = await this._parseBody(req);
      const product = await this.workProductService.createProduct(body);
      this._send(res, 201, formatResponse(product, { message: 'Work product created' }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to create work product');
      return true;
    }
  }

  async listProducts(_req, res, url) {
    try {
      const query = Object.fromEntries(url.searchParams);
      const products = await this.workProductService.listProducts({
        issue_id: query.issue_id,
        company_id: query.company_id,
        product_type: query.product_type,
        provider: query.provider,
        status: query.status,
        limit: query.limit,
        offset: query.offset
      });

      this._send(res, 200, formatListResponse(products, {
        total: products.length,
        limit: products.length || 1,
        offset: 0
      }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to list work products');
      return true;
    }
  }

  async listIssueProducts(_req, res, issueId, url) {
    try {
      const query = Object.fromEntries(url.searchParams);
      const products = await this.workProductService.listProducts({
        issue_id: issueId,
        status: query.status,
        limit: query.limit,
        offset: query.offset
      });

      this._send(res, 200, formatListResponse(products, {
        total: products.length,
        limit: products.length || 1,
        offset: 0
      }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to list issue work products');
      return true;
    }
  }

  async getProduct(_req, res, idOrUuid) {
    try {
      const product = await this.workProductService.getProduct(idOrUuid);
      if (!product) {
        this._send(res, 404, formatError(new Error('Work product not found')));
        return true;
      }
      this._send(res, 200, formatResponse(product));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to fetch work product');
      return true;
    }
  }

  async updateProduct(req, res, idOrUuid) {
    try {
      const body = await this._parseBody(req);
      const product = await this.workProductService.updateProduct(idOrUuid, body);
      this._send(res, 200, formatResponse(product, { message: 'Work product updated' }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to update work product');
      return true;
    }
  }

  async deleteProduct(_req, res, idOrUuid) {
    try {
      const deleted = await this.workProductService.deleteProduct(idOrUuid);
      if (!deleted) {
        this._send(res, 404, formatError(new Error('Work product not found')));
        return true;
      }
      this._send(res, 200, formatResponse({ deleted: true }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to delete work product');
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

export const createWorkProductsController = (options) => new WorkProductsController(options);

export default WorkProductsController;
