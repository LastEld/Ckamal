/**
 * @fileoverview Routines Controller
 * REST API controller for scheduled routine management
 * 
 * @module controllers/routines-controller
 * @version 5.0.0
 */

import { RoutineService, RoutinePriority, TriggerKind } from '../domains/routines/routine-service.js';
import {
    validateRequest,
    formatResponse,
    formatListResponse,
    handleError
} from './helpers.js';

/**
 * Routine schema for validation
 * @const {Object}
 */
const ROUTINE_SCHEMA = {
    required: ['companyId', 'name'],
    types: {
        companyId: 'string',
        name: 'string',
        description: 'string',
        projectId: 'string',
        goalId: 'string',
        parentIssueId: 'string',
        assigneeAgentId: 'string',
        priority: 'string',
        concurrencyPolicy: 'string',
        catchUpPolicy: 'string',
        maxRetries: 'number',
        timeoutSeconds: 'number'
    },
    enums: {
        priority: Object.values(RoutinePriority),
        concurrencyPolicy: ['allow_multiple', 'skip_if_active', 'coalesce_if_active'],
        catchUpPolicy: ['skip_missed', 'run_once', 'run_all_missed']
    },
    validators: {
        companyId: (value) => value.length > 0 || 'companyId cannot be empty',
        name: (value) => value.length >= 1 && value.length <= 255 || 'Name must be between 1 and 255 characters'
    }
};

/**
 * Trigger schema for validation
 * @const {Object}
 */
const TRIGGER_SCHEMA = {
    required: ['kind'],
    types: {
        kind: 'string',
        label: 'string',
        cronExpression: 'string',
        timezone: 'string',
        eventType: 'string',
        signingMode: 'string',
        replayWindowSec: 'number'
    },
    enums: {
        kind: Object.values(TriggerKind)
    },
    validators: {
        kind: (value) => Object.values(TriggerKind).includes(value) || 'Invalid trigger kind'
    }
};

/**
 * RoutinesController class
 * Manages scheduled routines, triggers, runs, and agent assignments
 */
export class RoutinesController {
    /**
     * Create a new RoutinesController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.db] - Database instance
     * @param {Object} [options.service] - RoutineService instance (optional)
     * @param {Object} [options.logger] - Logger instance
     */
    constructor(options = {}) {
        this.service = options.service;
        this.db = options.db;
        this.logger = options.logger || console;
        this.name = 'RoutinesController';
    }

    /**
     * Get or initialize the routine service
     * @private
     * @returns {RoutineService}
     */
    _getService() {
        if (!this.service) {
            if (!this.db) {
                throw new Error('Database instance required for RoutineService');
            }
            this.service = new RoutineService({ db: this.db, logger: this.logger });
        }
        return this.service;
    }

    // ========================================================================
    // Routine CRUD
    // ========================================================================

    /**
     * Create a new routine
     * @param {Object} data - Routine data
     * @param {string} data.companyId - Company ID
     * @param {string} data.name - Routine name
     * @param {string} [data.description] - Routine description
     * @param {string} [data.projectId] - Project ID
     * @param {string} [data.goalId] - Goal ID
     * @param {string} [data.parentIssueId] - Parent issue ID
     * @param {string} [data.assigneeAgentId] - Assigned agent ID
     * @param {string} [data.priority='medium'] - Priority level
     * @param {string} [data.concurrencyPolicy='coalesce_if_active'] - Concurrency handling
     * @param {string} [data.catchUpPolicy='skip_missed'] - Missed run handling
     * @param {number} [data.maxRetries=3] - Maximum retry attempts
     * @param {number} [data.timeoutSeconds=3600] - Execution timeout
     * @returns {Promise<Object>} Created routine
     * 
     * @example
     * const routine = await controller.createRoutine({
     *   companyId: 'comp-123',
     *   name: 'Daily Report',
     *   description: 'Generate daily analytics report',
     *   priority: 'high'
     * });
     */
    async createRoutine(data) {
        try {
            const validation = validateRequest(ROUTINE_SCHEMA, data);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const routine = await service.createRoutine({
                companyId: data.companyId,
                name: data.name,
                description: data.description,
                projectId: data.projectId,
                goalId: data.goalId,
                parentIssueId: data.parentIssueId,
                assigneeAgentId: data.assigneeAgentId,
                priority: data.priority || RoutinePriority.MEDIUM,
                concurrencyPolicy: data.concurrencyPolicy,
                catchUpPolicy: data.catchUpPolicy,
                maxRetries: data.maxRetries,
                timeoutSeconds: data.timeoutSeconds,
                createdByUserId: data.createdByUserId,
                createdByAgentId: data.createdByAgentId
            });

            return formatResponse(routine, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create routine' });
        }
    }

    /**
     * List routines for a company
     * @param {string} companyId - Company ID
     * @param {Object} [filters] - Filter options
     * @param {string} [filters.status] - Filter by status
     * @param {string} [filters.projectId] - Filter by project
     * @param {string} [filters.agentId] - Filter by assigned agent
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} Paginated routines
     */
    async listRoutines(companyId, filters = {}, pagination = {}) {
        try {
            if (!companyId) {
                return {
                    success: false,
                    error: 'companyId is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const result = await service.listRoutines(companyId, {
                status: filters.status,
                projectId: filters.projectId,
                agentId: filters.agentId,
                limit: pagination.limit || 50,
                offset: pagination.offset || 0
            });

            return formatListResponse(result.data, result.pagination);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list routines' });
        }
    }

    /**
     * Get a single routine by ID
     * @param {string} id - Routine ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} Routine data
     */
    async getRoutine(id, companyId) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const routine = await service.getRoutine(id, companyId);

            if (!routine) {
                return {
                    success: false,
                    error: `Routine not found: ${id}`,
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse(routine);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get routine' });
        }
    }

    /**
     * Update a routine
     * @param {string} id - Routine ID
     * @param {string} companyId - Company ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated routine
     */
    async updateRoutine(id, companyId, updates) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const routine = await service.updateRoutine(id, companyId, {
                ...updates,
                updatedByUserId: updates.updatedByUserId,
                updatedByAgentId: updates.updatedByAgentId
            });

            return formatResponse(routine, { updated: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to update routine' });
        }
    }

    /**
     * Delete a routine (soft delete via archive)
     * @param {string} id - Routine ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteRoutine(id, companyId) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            await service.deleteRoutine(id, companyId);

            return formatResponse({ id, deleted: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to delete routine' });
        }
    }

    // ========================================================================
    // Routine Execution
    // ========================================================================

    /**
     * Run a routine immediately
     * @param {string} id - Routine ID
     * @param {string} companyId - Company ID
     * @param {Object} [options] - Run options
     * @param {Object} [options.payload] - Trigger payload
     * @param {string} [options.triggeredBy] - User/agent ID who triggered
     * @returns {Promise<Object>} Created run record
     */
    async runRoutine(id, companyId, options = {}) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const run = await service.runRoutine(id, companyId, {
                payload: options.payload,
                triggeredBy: options.triggeredBy
            });

            return formatResponse(run, { triggered: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to run routine' });
        }
    }

    /**
     * Pause a routine
     * @param {string} id - Routine ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} Updated routine
     */
    async pauseRoutine(id, companyId) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const routine = await service.pauseRoutine(id, companyId);

            return formatResponse(routine, { paused: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to pause routine' });
        }
    }

    /**
     * Resume a paused routine
     * @param {string} id - Routine ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} Updated routine
     */
    async resumeRoutine(id, companyId) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const routine = await service.resumeRoutine(id, companyId);

            return formatResponse(routine, { resumed: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to resume routine' });
        }
    }

    // ========================================================================
    // Run History
    // ========================================================================

    /**
     * Get run history for a routine
     * @param {string} id - Routine ID
     * @param {string} companyId - Company ID
     * @param {Object} [options] - Query options
     * @param {string} [options.status] - Filter by status
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} Paginated runs
     */
    async getRunHistory(id, companyId, options = {}, pagination = {}) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const result = await service.getRunHistory(id, companyId, {
                status: options.status,
                limit: pagination.limit || 20,
                offset: pagination.offset || 0
            });

            return formatListResponse(result.data, result.pagination);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get run history' });
        }
    }

    /**
     * Get a specific run
     * @param {string} id - Routine ID
     * @param {string} runId - Run ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} Run record
     */
    async getRun(id, runId, companyId) {
        try {
            if (!id || !runId || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID, Run ID, and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const run = await service.getRun(runId, companyId);

            if (!run) {
                return {
                    success: false,
                    error: `Run not found: ${runId}`,
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse(run);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get run' });
        }
    }

    /**
     * Retry a failed run
     * @param {string} id - Routine ID
     * @param {string} runId - Run ID to retry
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} New run record
     */
    async retryRun(id, runId, companyId) {
        try {
            if (!id || !runId || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID, Run ID, and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const run = await service.retryRun(runId, companyId);

            return formatResponse(run, { retried: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to retry run' });
        }
    }

    // ========================================================================
    // Triggers
    // ========================================================================

    /**
     * Add a trigger to a routine
     * @param {string} id - Routine ID
     * @param {string} companyId - Company ID
     * @param {Object} data - Trigger configuration
     * @param {string} data.kind - Trigger kind (cron, webhook, event, manual)
     * @param {string} [data.cronExpression] - Cron expression for cron triggers
     * @param {string} [data.timezone] - Timezone for cron triggers
     * @param {string} [data.eventType] - Event type for event triggers
     * @param {string} [data.label] - Trigger label
     * @returns {Promise<Object>} Created trigger
     */
    async addTrigger(id, companyId, data) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const validation = validateRequest(TRIGGER_SCHEMA, data);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            let trigger;

            switch (data.kind) {
                case TriggerKind.CRON:
                    if (!data.cronExpression) {
                        return {
                            success: false,
                            error: 'cronExpression is required for cron triggers',
                            code: 'VALIDATION_ERROR'
                        };
                    }
                    trigger = await service.scheduleRoutine(id, companyId, {
                        cronExpression: data.cronExpression,
                        timezone: data.timezone || 'UTC',
                        label: data.label,
                        createdByUserId: data.createdByUserId,
                        createdByAgentId: data.createdByAgentId
                    });
                    break;

                case TriggerKind.WEBHOOK:
                    trigger = await service.createWebhookTrigger(id, companyId, {
                        label: data.label,
                        signingMode: data.signingMode,
                        replayWindowSec: data.replayWindowSec,
                        createdByUserId: data.createdByUserId,
                        createdByAgentId: data.createdByAgentId
                    });
                    break;

                case TriggerKind.EVENT:
                    if (!data.eventType) {
                        return {
                            success: false,
                            error: 'eventType is required for event triggers',
                            code: 'VALIDATION_ERROR'
                        };
                    }
                    trigger = await service.createEventTrigger(id, companyId, {
                        eventType: data.eventType,
                        filters: data.filters,
                        label: data.label,
                        createdByUserId: data.createdByUserId,
                        createdByAgentId: data.createdByAgentId
                    });
                    break;

                case TriggerKind.MANUAL:
                    trigger = await service.createEventTrigger(id, companyId, {
                        eventType: 'manual',
                        label: data.label || 'Manual trigger',
                        createdByUserId: data.createdByUserId,
                        createdByAgentId: data.createdByAgentId
                    });
                    break;

                default:
                    return {
                        success: false,
                        error: `Unsupported trigger kind: ${data.kind}`,
                        code: 'VALIDATION_ERROR'
                    };
            }

            return formatResponse(trigger, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to add trigger' });
        }
    }

    /**
     * Remove a trigger from a routine
     * @param {string} id - Routine ID
     * @param {string} triggerId - Trigger ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} Deletion result
     */
    async removeTrigger(id, triggerId, companyId) {
        try {
            if (!id || !triggerId || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID, Trigger ID, and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const deleted = await service.deleteTrigger(triggerId, companyId);

            if (!deleted) {
                return {
                    success: false,
                    error: `Trigger not found: ${triggerId}`,
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse({ triggerId, deleted: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to remove trigger' });
        }
    }

    /**
     * List triggers for a routine
     * @param {string} id - Routine ID
     * @param {string} companyId - Company ID
     * @returns {Promise<Object>} List of triggers
     */
    async listTriggers(id, companyId) {
        try {
            if (!id || !companyId) {
                return {
                    success: false,
                    error: 'Routine ID and companyId are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const triggers = await service.listTriggers(id, companyId);

            return formatResponse(triggers, { count: triggers.length });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list triggers' });
        }
    }

    // ========================================================================
    // Agent Assignments
    // ========================================================================

    /**
     * Assign an agent to a routine
     * @param {string} id - Routine ID
     * @param {string} agentId - Agent ID
     * @param {Object} [options] - Assignment options
     * @param {string} [options.type='primary'] - Assignment type
     * @param {string} [options.assignedBy] - Who made the assignment
     * @param {string} [options.notes] - Assignment notes
     * @returns {Promise<Object>} Created assignment
     */
    async assignAgent(id, agentId, options = {}) {
        try {
            if (!id || !agentId) {
                return {
                    success: false,
                    error: 'Routine ID and Agent ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const assignment = await service.assignAgent(id, agentId, {
                type: options.type || 'primary',
                assignedBy: options.assignedBy,
                notes: options.notes
            });

            return formatResponse(assignment, { assigned: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to assign agent' });
        }
    }

    /**
     * Unassign an agent from a routine
     * @param {string} id - Routine ID
     * @param {string} agentId - Agent ID
     * @returns {Promise<Object>} Unassignment result
     */
    async unassignAgent(id, agentId) {
        try {
            if (!id || !agentId) {
                return {
                    success: false,
                    error: 'Routine ID and Agent ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const service = this._getService();
            const unassigned = await service.unassignAgent(id, agentId);

            if (!unassigned) {
                return {
                    success: false,
                    error: 'Agent was not assigned to this routine',
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse({ agentId, unassigned: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to unassign agent' });
        }
    }

    // ========================================================================
    // HTTP Request Handler
    // ========================================================================

    /**
     * Handle HTTP requests
     * @param {import('http').IncomingMessage} req
     * @param {import('http').ServerResponse} res
     * @returns {Promise<boolean>}
     */
    async handle(req, res) {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;
        const method = req.method;

        // Parse request body for POST/PUT/PATCH requests
        let body = {};
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
            body = await this._readJsonBody(req);
        }

        // Parse query params for GET requests
        const queryParams = Object.fromEntries(url.searchParams);

        // POST /api/routines - Create routine
        if (pathname === '/api/routines' && method === 'POST') {
            const result = await this.createRoutine(body);
            this._sendJson(res, result.success ? 201 : (result.code === 'VALIDATION_ERROR' ? 400 : 500), result);
            return true;
        }

        // GET /api/routines - List routines
        if (pathname === '/api/routines' && method === 'GET') {
            const result = await this.listRoutines(
                queryParams.companyId,
                {
                    status: queryParams.status,
                    projectId: queryParams.projectId,
                    agentId: queryParams.agentId
                },
                {
                    limit: parseInt(queryParams.limit, 10) || 50,
                    offset: parseInt(queryParams.offset, 10) || 0
                }
            );
            this._sendJson(res, result.success ? 200 : 500, result);
            return true;
        }

        // GET /api/routines/:id - Get routine
        const getMatch = pathname.match(/^\/api\/routines\/([^/]+)$/);
        if (getMatch && method === 'GET') {
            const id = decodeURIComponent(getMatch[1]);
            const result = await this.getRoutine(id, queryParams.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // PUT /api/routines/:id - Update routine
        const updateMatch = pathname.match(/^\/api\/routines\/([^/]+)$/);
        if (updateMatch && method === 'PUT') {
            const id = decodeURIComponent(updateMatch[1]);
            const result = await this.updateRoutine(id, body.companyId, body);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // DELETE /api/routines/:id - Delete routine
        const deleteMatch = pathname.match(/^\/api\/routines\/([^/]+)$/);
        if (deleteMatch && method === 'DELETE') {
            const id = decodeURIComponent(deleteMatch[1]);
            const result = await this.deleteRoutine(id, queryParams.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/routines/:id/run - Run now
        const runMatch = pathname.match(/^\/api\/routines\/([^/]+)\/run$/);
        if (runMatch && method === 'POST') {
            const id = decodeURIComponent(runMatch[1]);
            const result = await this.runRoutine(id, body.companyId, {
                payload: body.payload,
                triggeredBy: body.triggeredBy
            });
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/routines/:id/pause - Pause
        const pauseMatch = pathname.match(/^\/api\/routines\/([^/]+)\/pause$/);
        if (pauseMatch && method === 'POST') {
            const id = decodeURIComponent(pauseMatch[1]);
            const result = await this.pauseRoutine(id, body.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/routines/:id/resume - Resume
        const resumeMatch = pathname.match(/^\/api\/routines\/([^/]+)\/resume$/);
        if (resumeMatch && method === 'POST') {
            const id = decodeURIComponent(resumeMatch[1]);
            const result = await this.resumeRoutine(id, body.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // GET /api/routines/:id/runs - List run history
        const runsMatch = pathname.match(/^\/api\/routines\/([^/]+)\/runs$/);
        if (runsMatch && method === 'GET') {
            const id = decodeURIComponent(runsMatch[1]);
            const result = await this.getRunHistory(
                id,
                queryParams.companyId,
                { status: queryParams.status },
                {
                    limit: parseInt(queryParams.limit, 10) || 20,
                    offset: parseInt(queryParams.offset, 10) || 0
                }
            );
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // GET /api/routines/:id/runs/:runId - Get run details
        const runDetailMatch = pathname.match(/^\/api\/routines\/([^/]+)\/runs\/([^/]+)$/);
        if (runDetailMatch && method === 'GET') {
            const id = decodeURIComponent(runDetailMatch[1]);
            const runId = decodeURIComponent(runDetailMatch[2]);
            const result = await this.getRun(id, runId, queryParams.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/routines/:id/runs/:runId/retry - Retry failed run
        const retryMatch = pathname.match(/^\/api\/routines\/([^/]+)\/runs\/([^/]+)\/retry$/);
        if (retryMatch && method === 'POST') {
            const id = decodeURIComponent(retryMatch[1]);
            const runId = decodeURIComponent(retryMatch[2]);
            const result = await this.retryRun(id, runId, body.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/routines/:id/triggers - Add trigger
        const triggerAddMatch = pathname.match(/^\/api\/routines\/([^/]+)\/triggers$/);
        if (triggerAddMatch && method === 'POST') {
            const id = decodeURIComponent(triggerAddMatch[1]);
            const result = await this.addTrigger(id, body.companyId, body);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 201;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // GET /api/routines/:id/triggers - List triggers
        const triggerListMatch = pathname.match(/^\/api\/routines\/([^/]+)\/triggers$/);
        if (triggerListMatch && method === 'GET') {
            const id = decodeURIComponent(triggerListMatch[1]);
            const result = await this.listTriggers(id, queryParams.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // DELETE /api/routines/:id/triggers/:triggerId - Remove trigger
        const triggerDeleteMatch = pathname.match(/^\/api\/routines\/([^/]+)\/triggers\/([^/]+)$/);
        if (triggerDeleteMatch && method === 'DELETE') {
            const id = decodeURIComponent(triggerDeleteMatch[1]);
            const triggerId = decodeURIComponent(triggerDeleteMatch[2]);
            const result = await this.removeTrigger(id, triggerId, queryParams.companyId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // POST /api/routines/:id/agents - Assign agent
        const agentAddMatch = pathname.match(/^\/api\/routines\/([^/]+)\/agents$/);
        if (agentAddMatch && method === 'POST') {
            const id = decodeURIComponent(agentAddMatch[1]);
            const result = await this.assignAgent(id, body.agentId, {
                type: body.type,
                assignedBy: body.assignedBy,
                notes: body.notes
            });
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 201;
            this._sendJson(res, statusCode, result);
            return true;
        }

        // DELETE /api/routines/:id/agents/:agentId - Unassign agent
        const agentDeleteMatch = pathname.match(/^\/api\/routines\/([^/]+)\/agents\/([^/]+)$/);
        if (agentDeleteMatch && method === 'DELETE') {
            const id = decodeURIComponent(agentDeleteMatch[1]);
            const agentId = decodeURIComponent(agentDeleteMatch[2]);
            const result = await this.unassignAgent(id, agentId);
            const statusCode = !result.success 
                ? (result.code === 'NOT_FOUND' ? 404 : result.code === 'VALIDATION_ERROR' ? 400 : 500) 
                : 200;
            this._sendJson(res, statusCode, result);
            return true;
        }

        return false;
    }

    /**
     * Read and parse JSON request body
     * @private
     * @param {import('http').IncomingMessage} req
     * @returns {Promise<Object>}
     */
    async _readJsonBody(req) {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (chunks.length === 0) return {};
        
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) return {};
        
        try {
            return JSON.parse(raw);
        } catch {
            return {};
        }
    }

    /**
     * Send JSON response
     * @private
     * @param {import('http').ServerResponse} res
     * @param {number} statusCode
     * @param {Object} payload
     */
    _sendJson(res, statusCode, payload) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload, null, 2));
    }
}

/**
 * Create a new RoutinesController instance
 * @param {Object} [options] - Controller options
 * @returns {RoutinesController} RoutinesController instance
 */
export function createRoutinesController(options = {}) {
    return new RoutinesController(options);
}

export default RoutinesController;
