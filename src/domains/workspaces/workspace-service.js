/**
 * @fileoverview Execution workspace service
 * Manages isolated workspace records and operation history.
 */

const WORKSPACE_STATUSES = new Set(['active', 'paused', 'terminated']);
const OPERATION_STATUSES = new Set(['pending', 'running', 'succeeded', 'failed', 'cancelled']);

function safeJsonParse(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return fallback;
}

export class WorkspaceService {
  constructor(options = {}) {
    this.db = options.db || null;
    this.name = 'WorkspaceService';
  }

  _requireDb() {
    if (!this.db) {
      throw new Error('Database connection is required');
    }
  }

  _hydrateWorkspace(row) {
    if (!row) return null;
    return {
      ...row,
      config: safeJsonParse(row.config, {}),
      metadata: safeJsonParse(row.metadata, {})
    };
  }

  _hydrateOperation(row) {
    if (!row) return null;
    return {
      ...row,
      input_payload: safeJsonParse(row.input_payload, {}),
      output_payload: safeJsonParse(row.output_payload, {})
    };
  }

  async createWorkspace(data = {}) {
    this._requireDb();

    const companyId = String(data.company_id || '').trim();
    const name = String(data.name || '').trim();
    const status = String(data.status || 'active').trim();
    const isolationMode = String(data.isolation_mode || 'local').trim();

    if (!companyId) throw new Error('company_id is required');
    if (!name) throw new Error('name is required');
    if (!WORKSPACE_STATUSES.has(status)) {
      throw new Error(`status must be one of: ${[...WORKSPACE_STATUSES].join(', ')}`);
    }

    const result = this.db.prepare(`
      INSERT INTO execution_workspaces (
        company_id,
        name,
        status,
        isolation_mode,
        config,
        metadata,
        created_by
      )
      VALUES (
        @company_id,
        @name,
        @status,
        @isolation_mode,
        @config,
        @metadata,
        @created_by
      )
    `).run({
      company_id: companyId,
      name,
      status,
      isolation_mode: isolationMode,
      config: JSON.stringify(data.config || {}),
      metadata: JSON.stringify(data.metadata || {}),
      created_by: data.created_by || null
    });

    return this.getWorkspace(result.lastInsertRowid);
  }

  async listWorkspaces(filters = {}) {
    this._requireDb();

    const where = [];
    const params = {};

    if (filters.company_id) {
      where.push('company_id = @company_id');
      params.company_id = String(filters.company_id);
    }
    if (filters.status) {
      where.push('status = @status');
      params.status = String(filters.status);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const rows = this.db.prepare(`
      SELECT *
      FROM execution_workspaces
      ${whereClause}
      ORDER BY created_at DESC
    `).all(params);

    return rows.map((row) => this._hydrateWorkspace(row));
  }

  async getWorkspace(idOrUuid) {
    this._requireDb();
    if (!idOrUuid) return null;

    const row = this.db.prepare(`
      SELECT *
      FROM execution_workspaces
      WHERE uuid = ? OR id = ?
      LIMIT 1
    `).get(String(idOrUuid), Number.parseInt(idOrUuid, 10) || -1);

    return this._hydrateWorkspace(row);
  }

  async updateWorkspace(idOrUuid, updates = {}) {
    this._requireDb();
    const workspace = await this.getWorkspace(idOrUuid);
    if (!workspace) throw new Error('Workspace not found');

    const allowed = {};

    if (updates.name !== undefined) {
      const name = String(updates.name || '').trim();
      if (!name) throw new Error('name cannot be empty');
      allowed.name = name;
    }
    if (updates.status !== undefined) {
      const status = String(updates.status || '').trim();
      if (!WORKSPACE_STATUSES.has(status)) {
        throw new Error(`status must be one of: ${[...WORKSPACE_STATUSES].join(', ')}`);
      }
      allowed.status = status;
    }
    if (updates.isolation_mode !== undefined) {
      allowed.isolation_mode = String(updates.isolation_mode || 'local').trim();
    }
    if (updates.config !== undefined) {
      allowed.config = JSON.stringify(updates.config || {});
    }
    if (updates.metadata !== undefined) {
      allowed.metadata = JSON.stringify(updates.metadata || {});
    }

    if (Object.keys(allowed).length === 0) {
      return workspace;
    }

    const setClause = Object.keys(allowed).map((key) => `${key} = @${key}`).join(', ');

    this.db.prepare(`
      UPDATE execution_workspaces
      SET ${setClause}
      WHERE id = @id
    `).run({
      ...allowed,
      id: workspace.id
    });

    return this.getWorkspace(workspace.id);
  }

  async deleteWorkspace(idOrUuid) {
    this._requireDb();
    const workspace = await this.getWorkspace(idOrUuid);
    if (!workspace) return false;

    const result = this.db.prepare(`
      DELETE FROM execution_workspaces
      WHERE id = ?
    `).run(workspace.id);

    return result.changes > 0;
  }

  async createOperation(workspaceIdOrUuid, data = {}) {
    this._requireDb();
    const workspace = await this.getWorkspace(workspaceIdOrUuid);
    if (!workspace) throw new Error('Workspace not found');

    const operationType = String(data.operation_type || '').trim();
    if (!operationType) throw new Error('operation_type is required');

    const status = String(data.status || 'pending').trim();
    if (!OPERATION_STATUSES.has(status)) {
      throw new Error(`status must be one of: ${[...OPERATION_STATUSES].join(', ')}`);
    }

    const result = this.db.prepare(`
      INSERT INTO workspace_operations (
        workspace_id,
        operation_type,
        status,
        requested_by,
        input_payload,
        output_payload,
        error_message,
        started_at,
        completed_at
      )
      VALUES (
        @workspace_id,
        @operation_type,
        @status,
        @requested_by,
        @input_payload,
        @output_payload,
        @error_message,
        @started_at,
        @completed_at
      )
    `).run({
      workspace_id: workspace.id,
      operation_type: operationType,
      status,
      requested_by: data.requested_by || null,
      input_payload: JSON.stringify(data.input_payload || {}),
      output_payload: JSON.stringify(data.output_payload || {}),
      error_message: data.error_message || null,
      started_at: data.started_at || null,
      completed_at: data.completed_at || null
    });

    return this.getOperation(result.lastInsertRowid);
  }

  async getOperation(idOrUuid) {
    this._requireDb();
    if (!idOrUuid) return null;

    const row = this.db.prepare(`
      SELECT wo.*, ew.uuid AS workspace_uuid, ew.name AS workspace_name
      FROM workspace_operations wo
      INNER JOIN execution_workspaces ew ON ew.id = wo.workspace_id
      WHERE wo.uuid = ? OR wo.id = ?
      LIMIT 1
    `).get(String(idOrUuid), Number.parseInt(idOrUuid, 10) || -1);

    return this._hydrateOperation(row);
  }

  async listOperations(workspaceIdOrUuid, filters = {}) {
    this._requireDb();
    const workspace = workspaceIdOrUuid ? await this.getWorkspace(workspaceIdOrUuid) : null;

    const where = [];
    const params = {};

    if (workspace) {
      where.push('wo.workspace_id = @workspace_id');
      params.workspace_id = workspace.id;
    }
    if (filters.status) {
      where.push('wo.status = @status');
      params.status = String(filters.status);
    }
    if (filters.operation_type) {
      where.push('wo.operation_type = @operation_type');
      params.operation_type = String(filters.operation_type);
    }
    if (filters.requested_by) {
      where.push('wo.requested_by = @requested_by');
      params.requested_by = String(filters.requested_by);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(200, Number.parseInt(filters.limit, 10) || 50));
    const offset = Math.max(0, Number.parseInt(filters.offset, 10) || 0);

    const rows = this.db.prepare(`
      SELECT wo.*, ew.uuid AS workspace_uuid, ew.name AS workspace_name
      FROM workspace_operations wo
      INNER JOIN execution_workspaces ew ON ew.id = wo.workspace_id
      ${whereClause}
      ORDER BY wo.created_at DESC
      LIMIT @limit OFFSET @offset
    `).all({
      ...params,
      limit,
      offset
    });

    return rows.map((row) => this._hydrateOperation(row));
  }

  async updateOperation(idOrUuid, updates = {}) {
    this._requireDb();
    const operation = await this.getOperation(idOrUuid);
    if (!operation) throw new Error('Operation not found');

    const allowed = {};

    if (updates.status !== undefined) {
      const status = String(updates.status || '').trim();
      if (!OPERATION_STATUSES.has(status)) {
        throw new Error(`status must be one of: ${[...OPERATION_STATUSES].join(', ')}`);
      }
      allowed.status = status;
    }
    if (updates.input_payload !== undefined) {
      allowed.input_payload = JSON.stringify(updates.input_payload || {});
    }
    if (updates.output_payload !== undefined) {
      allowed.output_payload = JSON.stringify(updates.output_payload || {});
    }
    if (updates.error_message !== undefined) {
      allowed.error_message = updates.error_message || null;
    }
    if (updates.started_at !== undefined) {
      allowed.started_at = updates.started_at || null;
    }
    if (updates.completed_at !== undefined) {
      allowed.completed_at = updates.completed_at || null;
    }

    if (Object.keys(allowed).length === 0) {
      return operation;
    }

    const setClause = Object.keys(allowed).map((key) => `${key} = @${key}`).join(', ');

    this.db.prepare(`
      UPDATE workspace_operations
      SET ${setClause}
      WHERE id = @id
    `).run({
      ...allowed,
      id: operation.id
    });

    return this.getOperation(operation.id);
  }
}

export default WorkspaceService;
