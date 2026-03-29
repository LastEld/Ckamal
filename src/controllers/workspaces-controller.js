/**
 * @fileoverview Workspaces Controller
 * REST endpoints for execution workspaces and operations.
 */

import { WorkspaceService } from '../domains/workspaces/workspace-service.js';
import { formatResponse, formatListResponse, formatError } from './helpers.js';

export class WorkspacesController {
  constructor(options = {}) {
    this.db = options.db || null;
    this.workspaceService = options.workspaceService || new WorkspaceService({ db: this.db });
    this.name = 'WorkspacesController';
  }

  async initialize() {
    return this;
  }

  async handle(req, res) {
    const method = req.method;
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/workspaces' && method === 'GET') return this.listWorkspaces(req, res, url);
    if (pathname === '/api/workspaces' && method === 'POST') return this.createWorkspace(req, res);

    const workspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
    if (workspaceMatch && method === 'GET') return this.getWorkspace(req, res, workspaceMatch[1]);
    if (workspaceMatch && method === 'PUT') return this.updateWorkspace(req, res, workspaceMatch[1]);
    if (workspaceMatch && method === 'DELETE') return this.deleteWorkspace(req, res, workspaceMatch[1]);

    const operationsForWorkspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/operations$/);
    if (operationsForWorkspaceMatch && method === 'GET') {
      return this.listOperations(req, res, operationsForWorkspaceMatch[1], url);
    }
    if (operationsForWorkspaceMatch && method === 'POST') {
      return this.createOperation(req, res, operationsForWorkspaceMatch[1]);
    }

    const operationMatch = pathname.match(/^\/api\/workspaces\/operations\/([^/]+)$/);
    if (operationMatch && (method === 'PATCH' || method === 'PUT')) {
      return this.updateOperation(req, res, operationMatch[1]);
    }

    return false;
  }

  async createWorkspace(req, res) {
    try {
      const body = await this._parseBody(req);
      const workspace = await this.workspaceService.createWorkspace(body);
      this._send(res, 201, formatResponse(workspace, { message: 'Workspace created' }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to create workspace');
      return true;
    }
  }

  async listWorkspaces(_req, res, url) {
    try {
      const query = Object.fromEntries(url.searchParams);
      const workspaces = await this.workspaceService.listWorkspaces({
        company_id: query.company_id,
        status: query.status
      });

      this._send(res, 200, formatListResponse(workspaces, {
        total: workspaces.length,
        limit: workspaces.length || 1,
        offset: 0
      }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to list workspaces');
      return true;
    }
  }

  async getWorkspace(_req, res, idOrUuid) {
    try {
      const workspace = await this.workspaceService.getWorkspace(idOrUuid);
      if (!workspace) {
        this._send(res, 404, formatError(new Error('Workspace not found')));
        return true;
      }
      this._send(res, 200, formatResponse(workspace));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to fetch workspace');
      return true;
    }
  }

  async updateWorkspace(req, res, idOrUuid) {
    try {
      const body = await this._parseBody(req);
      const workspace = await this.workspaceService.updateWorkspace(idOrUuid, body);
      this._send(res, 200, formatResponse(workspace, { message: 'Workspace updated' }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to update workspace');
      return true;
    }
  }

  async deleteWorkspace(_req, res, idOrUuid) {
    try {
      const deleted = await this.workspaceService.deleteWorkspace(idOrUuid);
      if (!deleted) {
        this._send(res, 404, formatError(new Error('Workspace not found')));
        return true;
      }
      this._send(res, 200, formatResponse({ deleted: true }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to delete workspace');
      return true;
    }
  }

  async createOperation(req, res, workspaceIdOrUuid) {
    try {
      const body = await this._parseBody(req);
      const operation = await this.workspaceService.createOperation(workspaceIdOrUuid, body);
      this._send(res, 201, formatResponse(operation, { message: 'Workspace operation created' }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to create workspace operation');
      return true;
    }
  }

  async listOperations(_req, res, workspaceIdOrUuid, url) {
    try {
      const query = Object.fromEntries(url.searchParams);
      const operations = await this.workspaceService.listOperations(workspaceIdOrUuid, {
        status: query.status,
        operation_type: query.operation_type,
        requested_by: query.requested_by,
        limit: query.limit,
        offset: query.offset
      });

      this._send(res, 200, formatListResponse(operations, {
        total: operations.length,
        limit: operations.length || 1,
        offset: 0
      }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to list workspace operations');
      return true;
    }
  }

  async updateOperation(req, res, operationIdOrUuid) {
    try {
      const body = await this._parseBody(req);
      const operation = await this.workspaceService.updateOperation(operationIdOrUuid, body);
      this._send(res, 200, formatResponse(operation, { message: 'Workspace operation updated' }));
      return true;
    } catch (error) {
      this._sendError(res, error, 'Failed to update workspace operation');
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

export const createWorkspacesController = (options) => new WorkspacesController(options);

export default WorkspacesController;
