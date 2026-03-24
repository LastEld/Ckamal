/**
 * Tasks Controller
 * Task management controller with Eisenhower matrix support
 * 
 * @module controllers/tasks
 * @version 1.0.0
 */

import * as taskDomain from '../domains/tasks/index.js';
import {
    validateRequest,
    formatResponse,
    formatListResponse,
    handleError,
    parsePagination
} from './helpers.js';

/**
 * Task priority levels
 * @readonly
 * @enum {string}
 */
export const TaskPriority = {
    URGENT_IMPORTANT: 'urgent_important',
    NOT_URGENT_IMPORTANT: 'not_urgent_important',
    URGENT_NOT_IMPORTANT: 'urgent_not_important',
    NOT_URGENT_NOT_IMPORTANT: 'not_urgent_not_important'
};

/**
 * Task status values
 * @readonly
 * @enum {string}
 */
export const TaskStatus = {
    BACKLOG: 'backlog',
    TODO: 'todo',
    IN_PROGRESS: 'in_progress',
    REVIEW: 'review',
    DONE: 'done',
    CANCELLED: 'cancelled'
};

/**
 * Task schema for validation
 * @const {Object}
 */
const TASK_SCHEMA = {
    required: ['title'],
    types: {
        title: 'string',
        description: 'string',
        status: 'string',
        priority: 'string',
        progress: 'number',
        roadmapId: 'string',
        nodeId: 'string',
        phase: 'string'
    },
    enums: {
        status: Object.values(TaskStatus),
        priority: Object.values(TaskPriority)
    },
    validators: {
        title: (value) => value.length >= 1 && value.length <= 500 || 'Title must be between 1 and 500 characters',
        progress: (value) => (value >= 0 && value <= 100) || 'Progress must be between 0 and 100'
    }
};

/**
 * TaskController class
 * Manages tasks with support for Eisenhower matrix prioritization
 */
export class TaskController {
    /**
     * Create a new TaskController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.gateway] - Data gateway (defaults to taskDomain)
     */
    constructor(options = {}) {
        this.gateway = options.gateway || taskDomain;
        this.name = 'TaskController';
    }

    /**
     * Create a new task
     * @param {Object} data - Task data
     * @param {string} data.title - Task title
     * @param {string} [data.description] - Task description
     * @param {string} [data.status='backlog'] - Task status
     * @param {string} [data.priority='not_urgent_important'] - Task priority
     * @param {string} [data.roadmapId] - Associated roadmap ID
     * @param {string} [data.nodeId] - Associated roadmap node ID
     * @param {string} [data.phase] - Phase identifier
     * @param {string} [data.projectId] - Project ID for scoping
     * @returns {Promise<Object>} Created task
     * 
     * @example
     * const controller = new TaskController();
     * const task = await controller.createTask({
     *   title: 'Implement feature X',
     *   priority: TaskPriority.URGENT_IMPORTANT
     * });
     */
    async createTask(data) {
        try {
            const validation = validateRequest(TASK_SCHEMA, data);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.createTask({
                title: data.title,
                description: data.description,
                status: data.status || TaskStatus.BACKLOG,
                priority: data.priority || TaskPriority.NOT_URGENT_IMPORTANT,
                roadmapId: data.roadmapId,
                nodeId: data.nodeId,
                phase: data.phase,
                projectId: data.projectId
            });

            return formatResponse(result, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create task' });
        }
    }

    /**
     * Alias for createTask
     * @deprecated Use createTask instead
     */
    async create(task, options = {}) {
        return this.createTask({ ...task, projectId: options.projectId });
    }

    /**
     * Create multiple tasks in a batch
     * @param {Array<Object>} tasks - Array of task data
     * @param {Object} [options] - Additional options
     * @param {string} [options.projectId] - Project ID for scoping
     * @returns {Promise<Object>} Created tasks
     */
    async createBatch(tasks, options = {}) {
        try {
            if (!Array.isArray(tasks) || tasks.length === 0) {
                return {
                    success: false,
                    error: 'Tasks array is required and must not be empty',
                    code: 'VALIDATION_ERROR'
                };
            }

            // Validate each task
            const errors = [];
            for (let i = 0; i < tasks.length; i++) {
                const validation = validateRequest(TASK_SCHEMA, tasks[i]);
                if (!validation.valid) {
                    errors.push(`Task ${i}: ${validation.errors.join(', ')}`);
                }
            }

            if (errors.length > 0) {
                return {
                    success: false,
                    error: `Validation failed: ${errors.join('; ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.createTaskBatch({
                projectId: options.projectId,
                tasks: tasks.map(t => ({
                    title: t.title,
                    description: t.description,
                    status: t.status || TaskStatus.BACKLOG,
                    priority: t.priority || TaskPriority.NOT_URGENT_IMPORTANT,
                    roadmapId: t.roadmapId,
                    nodeId: t.nodeId,
                    phase: t.phase,
                    progress: t.progress
                }))
            });

            return formatResponse(result, { created: true, count: tasks.length });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create tasks batch' });
        }
    }

    /**
     * Update an existing task
     * @param {string} id - Task ID
     * @param {Object} data - Fields to update
     * @returns {Promise<Object>} Updated task
     * 
     * @example
     * const updated = await controller.updateTask('task-123', {
     *   status: TaskStatus.IN_PROGRESS,
     *   progress: 50
     * });
     */
    async updateTask(id, data) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Task ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            // Validate update fields
            const updateSchema = {
                types: {
                    title: 'string',
                    status: 'string',
                    priority: 'string',
                    progress: 'number'
                },
                enums: {
                    status: Object.values(TaskStatus),
                    priority: Object.values(TaskPriority)
                }
            };

            const validation = validateRequest(updateSchema, data);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.updateTask(id, data, data.projectId);
            return formatResponse(result, { updated: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to update task' });
        }
    }

    /**
     * Alias for updateTask
     * @deprecated Use updateTask instead
     */
    async update(id, updates, options = {}) {
        return this.updateTask(id, { ...updates, projectId: options.projectId });
    }

    /**
     * Delete a task
     * @param {string} id - Task ID
     * @returns {Promise<Object>} Deletion result
     * 
     * @example
     * await controller.deleteTask('task-123');
     */
    async deleteTask(id) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Task ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            await this.gateway.deleteTask(id);
            return formatResponse({ id, deleted: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to delete task' });
        }
    }

    /**
     * Alias for deleteTask
     * @deprecated Use deleteTask instead
     */
    async delete(id) {
        return this.deleteTask(id);
    }

    /**
     * Get a single task by ID
     * @param {string} id - Task ID
     * @returns {Promise<Object>} Task data
     * 
     * @example
     * const task = await controller.getTask('task-123');
     */
    async getTask(id) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Task ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const tasks = await this.gateway.listTasks({});
            
            const task = tasks.find(t => t.id === id);
            if (!task) {
                return {
                    success: false,
                    error: `Task not found: ${id}`,
                    code: 'NOT_FOUND'
                };
            }

            return formatResponse(task);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get task' });
        }
    }

    /**
     * Get tasks with optional filters
     * @param {Object} [filters] - Filter criteria
     * @param {string} [filters.status] - Filter by status
     * @param {string} [filters.priority] - Filter by priority
     * @param {string} [filters.roadmapId] - Filter by roadmap ID
     * @param {string} [filters.projectId] - Filter by project ID
     * @param {Object} [pagination] - Pagination options
     * @param {number} [pagination.limit=50] - Items per page
     * @param {number} [pagination.offset=0] - Offset for pagination
     * @returns {Promise<Object>} List of tasks with metadata
     * 
     * @example
     * const tasks = await controller.getTasks({
     *   status: TaskStatus.IN_PROGRESS,
     *   priority: TaskPriority.URGENT_IMPORTANT
     * }, { limit: 10, offset: 0 });
     */
    async getTasks(filters = {}, pagination = {}) {
        try {
            const { limit, offset } = parsePagination(pagination);
            
            const tasks = await this.gateway.listTasks({
                status: filters.status,
                roadmapId: filters.roadmapId,
                priority: filters.priority,
                projectId: filters.projectId
            });

            // Apply pagination
            const paginatedTasks = tasks.slice(offset, offset + limit);
            
            return formatListResponse(paginatedTasks, {
                total: tasks.length,
                limit,
                offset
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list tasks' });
        }
    }

    /**
     * Organize tasks by Eisenhower Matrix quadrants
     * @param {Object} [options] - Options
     * @param {string} [options.projectId] - Project ID for scoping
     * @returns {Promise<Object>} Tasks organized by Q1/Q2/Q3/Q4
     */
    async organizeByMatrix(options = {}) {
        try {
            const result = await this.gateway.getEisenhowerMatrix(options.projectId, {
                detailMode: 'full'
            });
            
            return formatResponse({
                Q1: result.urgent_important || [],
                Q2: result.not_urgent_important || [],
                Q3: result.urgent_not_important || [],
                Q4: result.not_urgent_not_important || [],
                descriptions: {
                    Q1: 'Do first - Critical tasks requiring immediate attention',
                    Q2: 'Schedule - Important tasks for long-term success',
                    Q3: 'Delegate - Urgent tasks that can be delegated',
                    Q4: 'Eliminate - Time wasters and busy work'
                }
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to organize by matrix' });
        }
    }

    /**
     * Prioritize tasks using various strategies
     * @param {Array} [tasks] - Tasks to prioritize (fetches all if not provided)
     * @param {Object} [options] - Prioritization options
     * @param {'eisenhower'|'due_date'|'priority'} [options.strategy='eisenhower'] - Strategy to use
     * @param {string} [options.projectId] - Project ID for scoping
     * @returns {Promise<Object>} Prioritized tasks
     * 
     * @example
     * const prioritized = await controller.prioritizeTasks({ strategy: 'eisenhower' });
     */
    async prioritizeTasks(tasks, options = {}) {
        try {
            // If tasks not provided, fetch all
            if (!tasks) {
                const result = await this.getTasks({ projectId: options.projectId });
                tasks = result.data || [];
            }

            if (!Array.isArray(tasks)) {
                return {
                    success: false,
                    error: 'Tasks must be an array',
                    code: 'VALIDATION_ERROR'
                };
            }

            const strategy = options.strategy || 'eisenhower';
            
            switch (strategy) {
                case 'eisenhower':
                    return this._prioritizeByEisenhower(tasks);
                case 'due_date':
                    return this._prioritizeByDueDate(tasks);
                case 'priority':
                    return this._prioritizeByPriority(tasks);
                default:
                    return {
                        success: false,
                        error: `Unknown strategy: ${strategy}`,
                        code: 'VALIDATION_ERROR'
                    };
            }
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to prioritize tasks' });
        }
    }

    /**
     * Alias for prioritizeTasks
     * @deprecated Use prioritizeTasks instead
     */
    prioritize(tasks, options = {}) {
        try {
            if (!Array.isArray(tasks)) {
                return {
                    success: false,
                    error: 'Tasks must be an array',
                    code: 'VALIDATION_ERROR'
                };
            }

            const strategy = options.strategy || 'eisenhower';
            
            switch (strategy) {
                case 'eisenhower':
                    return this._prioritizeByEisenhower(tasks);
                case 'due_date':
                    return this._prioritizeByDueDate(tasks);
                case 'priority':
                    return this._prioritizeByPriority(tasks);
                default:
                    return {
                        success: false,
                        error: `Unknown strategy: ${strategy}`,
                        code: 'VALIDATION_ERROR'
                    };
            }
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to prioritize tasks' });
        }
    }

    /**
     * Get task statistics
     * @param {Object} [options] - Options
     * @param {string} [options.projectId] - Project ID
     * @returns {Promise<Object>} Task statistics
     */
    async getTaskStats(options = {}) {
        try {
            const result = await this.list({ projectId: options.projectId });
            const tasks = result.data || [];

            const stats = {
                total: tasks.length,
                byStatus: {},
                byPriority: {},
                byQuadrant: {
                    Q1: 0, Q2: 0, Q3: 0, Q4: 0
                },
                completion: {
                    completed: 0,
                    inProgress: 0,
                    pending: 0
                }
            };

            for (const task of tasks) {
                // Count by status
                stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
                
                // Count by priority
                stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;
                
                // Count by quadrant
                if (task.priority === TaskPriority.URGENT_IMPORTANT) stats.byQuadrant.Q1++;
                else if (task.priority === TaskPriority.NOT_URGENT_IMPORTANT) stats.byQuadrant.Q2++;
                else if (task.priority === TaskPriority.URGENT_NOT_IMPORTANT) stats.byQuadrant.Q3++;
                else if (task.priority === TaskPriority.NOT_URGENT_NOT_IMPORTANT) stats.byQuadrant.Q4++;

                // Completion stats
                if (task.status === TaskStatus.DONE) stats.completion.completed++;
                else if (task.status === TaskStatus.IN_PROGRESS) stats.completion.inProgress++;
                else stats.completion.pending++;
            }

            return formatResponse(stats);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get task stats' });
        }
    }

    /**
     * Get Eisenhower Matrix view of tasks
     * @param {Object} [options] - Options
     * @param {string} [options.projectId] - Project ID for scoping
     * @param {'compact'|'summary'|'full'} [options.detailMode='compact'] - Detail level
     * @param {number} [options.quadrantLimit] - Max tasks per quadrant
     * @returns {Promise<Object>} Eisenhower matrix
     */
    async getEisenhowerMatrix(options = {}) {
        try {
            const result = await this.gateway.getEisenhowerMatrix(options.projectId, {
                detailMode: options.detailMode || 'compact',
                quadrantLimit: options.quadrantLimit
            });
            
            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get Eisenhower matrix' });
        }
    }

    /**
     * Get urgent and important tasks (Quadrant 1)
     * @param {Array} [tasks] - Optional pre-filtered tasks
     * @param {Object} [options] - Options
     * @param {string} [options.projectId] - Project ID
     * @returns {Promise<Object>} Urgent and important tasks
     */
    async urgentImportant(tasks, options = {}) {
        if (!tasks) {
            const result = await this.list({ 
                priority: TaskPriority.URGENT_IMPORTANT,
                projectId: options.projectId 
            });
            tasks = result.data || [];
        }
        
        const filtered = tasks.filter(t => t.priority === TaskPriority.URGENT_IMPORTANT);
        return formatResponse(filtered, { 
            quadrant: 'urgent_important',
            description: 'Do first - Critical tasks requiring immediate attention'
        });
    }

    /**
     * Get not urgent but important tasks (Quadrant 2)
     * @param {Array} [tasks] - Optional pre-filtered tasks
     * @param {Object} [options] - Options
     * @param {string} [options.projectId] - Project ID
     * @returns {Promise<Object>} Not urgent but important tasks
     */
    async notUrgentImportant(tasks, options = {}) {
        if (!tasks) {
            const result = await this.list({ 
                priority: TaskPriority.NOT_URGENT_IMPORTANT,
                projectId: options.projectId 
            });
            tasks = result.data || [];
        }
        
        const filtered = tasks.filter(t => t.priority === TaskPriority.NOT_URGENT_IMPORTANT);
        return formatResponse(filtered, { 
            quadrant: 'not_urgent_important',
            description: 'Schedule - Important tasks for long-term success'
        });
    }

    /**
     * Get urgent but not important tasks (Quadrant 3)
     * @param {Array} [tasks] - Optional pre-filtered tasks
     * @param {Object} [options] - Options
     * @param {string} [options.projectId] - Project ID
     * @returns {Promise<Object>} Urgent but not important tasks
     */
    async urgentNotImportant(tasks, options = {}) {
        if (!tasks) {
            const result = await this.list({ 
                priority: TaskPriority.URGENT_NOT_IMPORTANT,
                projectId: options.projectId 
            });
            tasks = result.data || [];
        }
        
        const filtered = tasks.filter(t => t.priority === TaskPriority.URGENT_NOT_IMPORTANT);
        return formatResponse(filtered, { 
            quadrant: 'urgent_not_important',
            description: 'Delegate - Urgent tasks that can be delegated'
        });
    }

    /**
     * Get not urgent and not important tasks (Quadrant 4)
     * @param {Array} [tasks] - Optional pre-filtered tasks
     * @param {Object} [options] - Options
     * @param {string} [options.projectId] - Project ID
     * @returns {Promise<Object>} Not urgent and not important tasks
     */
    async notUrgentNotImportant(tasks, options = {}) {
        if (!tasks) {
            const result = await this.list({ 
                priority: TaskPriority.NOT_URGENT_NOT_IMPORTANT,
                projectId: options.projectId 
            });
            tasks = result.data || [];
        }
        
        const filtered = tasks.filter(t => t.priority === TaskPriority.NOT_URGENT_NOT_IMPORTANT);
        return formatResponse(filtered, { 
            quadrant: 'not_urgent_not_important',
            description: 'Eliminate - Time wasters and busy work'
        });
    }

    /**
     * Get prioritized next actions
     * @param {Object} [options] - Options
     * @param {number} [options.limit=5] - Number of actions to return
     * @param {string} [options.projectId] - Project ID
     * @returns {Promise<Object>} Next actions
     */
    async getNextActions(options = {}) {
        try {
            const result = await this.gateway.getNextActions(
                options.limit || 5,
                options.projectId
            );
            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get next actions' });
        }
    }

    /**
     * Link task to roadmap node
     * @param {string} taskId - Task ID
     * @param {string} roadmapId - Roadmap ID
     * @param {string} [nodeId] - Node ID
     * @param {string} [phase] - Phase identifier
     * @param {Object} [options] - Options
     * @param {string} [options.projectId] - Project ID
     * @returns {Promise<Object>} Link result
     */
    async linkToRoadmap(taskId, roadmapId, nodeId, phase, options = {}) {
        try {
            if (!taskId || !roadmapId) {
                return {
                    success: false,
                    error: 'Task ID and Roadmap ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.linkTaskToRoadmap(
                taskId,
                roadmapId,
                nodeId,
                phase,
                options.projectId
            );

            return formatResponse(result, { linked: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to link task to roadmap' });
        }
    }

    /**
     * Generate productivity report
     * @param {Object} [options] - Options
     * @param {string} [options.projectId] - Project ID
     * @param {'compact'|'summary'|'full'} [options.detailMode='compact'] - Detail level
     * @param {number} [options.quadrantLimit] - Max tasks per quadrant
     * @returns {Promise<Object>} Productivity report
     */
    async generateReport(options = {}) {
        try {
            const result = await this.gateway.generateProductivityReport(options.projectId, {
                detailMode: options.detailMode || 'compact',
                quadrantLimit: options.quadrantLimit
            });
            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to generate report' });
        }
    }

    /**
     * Sync tasks with GSD project
     * @param {Object} [options] - Options
     * @param {string} [options.projectName] - GSD project name
     * @returns {Promise<Object>} Sync result
     */
    async syncWithGSD(options = {}) {
        try {
            const result = await this.gateway.syncTasksToGSD(options.projectName);
            return formatResponse(result, { synced: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to sync with GSD' });
        }
    }

    /**
     * Handle task dependencies
     * @param {string} action - Action to perform (add, remove, get_chain, get_blocked)
     * @param {string} taskId - Task ID
     * @param {string} [dependsOn] - Dependency task ID
     * @param {Object} [options] - Options
     * @param {string} [options.projectId] - Project ID
     * @returns {Promise<Object>} Operation result
     */
    async handleDependencies(action, taskId, dependsOn, options = {}) {
        try {
            if (!action || !taskId) {
                return {
                    success: false,
                    error: 'Action and task ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const validActions = ['add', 'remove', 'get_chain', 'get_blocked'];
            if (!validActions.includes(action)) {
                return {
                    success: false,
                    error: `Invalid action. Valid: ${validActions.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.handleTaskDeps(
                action,
                taskId,
                dependsOn,
                options.projectId
            );

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to handle dependencies' });
        }
    }

    // Private methods

    /**
     * Prioritize tasks using Eisenhower matrix
     * @private
     * @param {Array} tasks - Tasks to prioritize
     * @returns {Object} Tasks organized by quadrant
     */
    _prioritizeByEisenhower(tasks) {
        const matrix = {
            urgent_important: [],
            not_urgent_important: [],
            urgent_not_important: [],
            not_urgent_not_important: []
        };

        for (const task of tasks) {
            const priority = task.priority || TaskPriority.NOT_URGENT_NOT_IMPORTANT;
            if (matrix[priority]) {
                matrix[priority].push(task);
            }
        }

        return formatResponse(matrix, { 
            strategy: 'eisenhower',
            total: tasks.length,
            quadrants: {
                urgent_important: { 
                    count: matrix.urgent_important.length,
                    description: 'Do first - Critical tasks requiring immediate attention'
                },
                not_urgent_important: { 
                    count: matrix.not_urgent_important.length,
                    description: 'Schedule - Important tasks for long-term success'
                },
                urgent_not_important: { 
                    count: matrix.urgent_not_important.length,
                    description: 'Delegate - Urgent tasks that can be delegated'
                },
                not_urgent_not_important: { 
                    count: matrix.not_urgent_not_important.length,
                    description: 'Eliminate - Time wasters and busy work'
                }
            }
        });
    }

    /**
     * Prioritize tasks by due date
     * @private
     * @param {Array} tasks - Tasks to prioritize
     * @returns {Object} Tasks sorted by due date
     */
    _prioritizeByDueDate(tasks) {
        const sorted = [...tasks].sort((a, b) => {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        });

        return formatResponse(sorted, { 
            strategy: 'due_date',
            total: tasks.length
        });
    }

    /**
     * Prioritize tasks by priority level
     * @private
     * @param {Array} tasks - Tasks to prioritize
     * @returns {Object} Tasks sorted by priority
     */
    _prioritizeByPriority(tasks) {
        const priorityOrder = [
            TaskPriority.URGENT_IMPORTANT,
            TaskPriority.NOT_URGENT_IMPORTANT,
            TaskPriority.URGENT_NOT_IMPORTANT,
            TaskPriority.NOT_URGENT_NOT_IMPORTANT
        ];

        const sorted = [...tasks].sort((a, b) => {
            const aIndex = priorityOrder.indexOf(a.priority);
            const bIndex = priorityOrder.indexOf(b.priority);
            return aIndex - bIndex;
        });

        return formatResponse(sorted, { 
            strategy: 'priority',
            total: tasks.length
        });
    }
}

/**
 * Create a new TaskController instance
 * @param {Object} [options] - Controller options
 * @returns {TaskController} TaskController instance
 */
/**
 * Create a new TaskController instance
 * @param {Object} [options] - Controller options
 * @returns {TaskController} TaskController instance
 */
export function createTaskController(options = {}) {
    return new TaskController(options);
}

export default TaskController;
