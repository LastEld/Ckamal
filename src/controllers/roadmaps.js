/**
 * Roadmaps Controller
 * Roadmap management controller with learning path generation
 * 
 * @module controllers/roadmaps
 * @version 1.0.0
 */

import * as roadmapDomain from '../domains/roadmaps/index.js';
import {
    validateRequest,
    formatResponse,
    formatListResponse,
    handleError,
    parsePagination
} from './helpers.js';

/**
 * Node progress status values
 * @readonly
 * @enum {string}
 */
export const NodeStatus = {
    NOT_STARTED: 'not_started',
    STARTED: 'started',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    MASTERED: 'mastered'
};

/**
 * Learning pace options
 * @readonly
 * @enum {string}
 */
export const LearningPace = {
    FAST: 'fast',
    NORMAL: 'normal',
    DEEP: 'deep'
};

/**
 * Roadmap schema for validation
 * @const {Object}
 */
const ROADMAP_SCHEMA = {
    required: ['roadmapId'],
    types: {
        roadmapId: 'string',
        title: 'string',
        description: 'string',
        markdown: 'string'
    },
    validators: {
        roadmapId: (value) => value.length >= 1 || 'Roadmap ID is required',
        title: (value) => !value || value.length >= 1 || 'Title cannot be empty'
    }
};

/**
 * RoadmapController class
 * Manages roadmaps, user enrollment, and learning paths
 */
export class RoadmapController {
    /**
     * Create a new RoadmapController
     * @param {Object} [options] - Controller options
     * @param {Object} [options.gateway] - Data gateway (defaults to roadmapDomain)
     */
    constructor(options = {}) {
        this.gateway = options.gateway || roadmapDomain;
        this.name = 'RoadmapController';
    }

    /**
     * Create a new roadmap
     * @param {Object} data - Roadmap data
     * @param {string} data.roadmapId - Unique roadmap ID
     * @param {string} [data.title] - Roadmap title
     * @param {string} [data.description] - Roadmap description
     * @param {string} [data.markdown] - Markdown content
     * @param {Object} [data.graph] - Graph structure with nodes and edges
     * @param {boolean} [data.overwrite=false] - Whether to overwrite existing
     * @returns {Promise<Object>} Created roadmap
     * 
     * @example
     * const controller = new RoadmapController();
     * const roadmap = await controller.createRoadmap({
     *   roadmapId: 'frontend-master',
     *   title: 'Frontend Master',
     *   description: 'Complete frontend development path'
     * });
     */
    async createRoadmap(data) {
        try {
            const validation = validateRequest(ROADMAP_SCHEMA, data);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Validation failed: ${validation.errors.join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.registerRoadmap(data.roadmapId, {
                title: data.title,
                description: data.description,
                markdown: data.markdown,
                graph: data.graph,
                overwrite: data.overwrite || false
            });

            return formatResponse(result, { created: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to create roadmap' });
        }
    }

    /**
     * Alias for createRoadmap
     * @deprecated Use createRoadmap instead
     */
    async create(roadmap, options = {}) {
        return this.createRoadmap({ ...roadmap, overwrite: options.overwrite });
    }

    /**
     * Update an existing roadmap
     * @param {string} id - Roadmap ID
     * @param {Object} data - Fields to update
     * @param {string} [data.title] - New title
     * @param {string} [data.description] - New description
     * @param {string} [data.markdown] - New markdown content
     * @param {Object} [data.graph] - Updated graph structure
     * @returns {Promise<Object>} Updated roadmap
     * 
     * @example
     * const updated = await controller.updateRoadmap('frontend-master', {
     *   title: 'Frontend Master v2'
     * });
     */
    async updateRoadmap(id, data) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.registerRoadmap(id, {
                title: data.title,
                description: data.description,
                markdown: data.markdown,
                graph: data.graph,
                overwrite: true
            });

            return formatResponse(result, { updated: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to update roadmap' });
        }
    }

    /**
     * Alias for updateRoadmap
     * @deprecated Use updateRoadmap instead
     */
    async update(id, updates) {
        return this.updateRoadmap(id, updates);
    }

    /**
     * Get a roadmap by ID
     * @param {string} id - Roadmap ID
     * @param {Object} [options] - Options
     * @param {boolean} [options.includeNodes=false] - Include node structure
     * @returns {Promise<Object>} Roadmap data
     * 
     * @example
     * const roadmap = await controller.getRoadmap('frontend-master');
     */
    async getRoadmap(id, options = {}) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.getRoadmap(id);
            
            if (options.includeNodes) {
                const nodes = await this.gateway.getRoadmapNodes(id);
                result.nodes = nodes;
            }

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get roadmap' });
        }
    }

    /**
     * Alias for getRoadmap
     * @deprecated Use getRoadmap instead
     */
    async get(id, options = {}) {
        return this.getRoadmap(id, options);
    }

    /**
     * Get roadmap nodes and structure
     * @param {string} id - Roadmap ID
     * @returns {Promise<Object>} Roadmap nodes
     */
    async getNodes(id) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.getRoadmapNodes(id);
            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get roadmap nodes' });
        }
    }

    /**
     * Get a specific node from a roadmap
     * @param {string} roadmapId - Roadmap ID
     * @param {string} nodeId - Node ID
     * @returns {Promise<Object>} Node data
     */
    async getNode(roadmapId, nodeId) {
        try {
            if (!roadmapId || !nodeId) {
                return {
                    success: false,
                    error: 'Roadmap ID and Node ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.getRoadmapNode(roadmapId, nodeId);
            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get node' });
        }
    }

    /**
     * Get all roadmaps with optional filters
     * @param {Object} [filters] - Filter criteria
     * @param {Object} [pagination] - Pagination options
     * @returns {Promise<Object>} List of roadmaps
     * 
     * @example
     * const roadmaps = await controller.getRoadmaps();
     */
    async getRoadmaps(_filters = {}, pagination = {}) {
        try {
            const { limit, offset } = parsePagination(pagination);
            
            const result = await this.gateway.listRoadmaps();
            
            // Apply pagination
            const paginated = result.slice(offset, offset + limit);
            
            return formatListResponse(paginated, {
                total: result.length,
                limit,
                offset
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to list roadmaps' });
        }
    }

    /**
     * Alias for getRoadmaps
     * @deprecated Use getRoadmaps instead
     */
    async list(filters = {}, pagination = {}) {
        return this.getRoadmaps(filters, pagination);
    }

    /**
     * Delete a roadmap
     * @param {string} id - Roadmap ID
     * @returns {Promise<Object>} Deletion result
     * 
     * @example
     * await controller.deleteRoadmap('frontend-master');
     */
    async deleteRoadmap(id) {
        try {
            if (!id) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            // Note: The gateway might not have a direct delete method,
            // this is a placeholder for the interface
            await this.gateway.registerRoadmap(id, { deleted: true });
            
            return formatResponse({ id, deleted: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to delete roadmap' });
        }
    }

    /**
     * Personalize learning path for a user
     * @param {string} userId - User ID
     * @param {Object} goals - User goals
     * @param {string} [goals.roadmapId] - Target roadmap ID
     * @param {string[]} [goals.interests] - Areas of interest
     * @param {string} [goals.pace='normal'] - Learning pace
     * @returns {Promise<Object>} Personalized path
     * 
     * @example
     * const path = await controller.personalizePath('user-123', {
     *   roadmapId: 'frontend-master',
     *   interests: ['react', 'typescript'],
     *   pace: 'fast'
     * });
     */
    async personalizePath(userId, goals) {
        try {
            if (!userId) {
                return {
                    success: false,
                    error: 'User ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const roadmapId = goals.roadmapId;
            if (!roadmapId) {
                return {
                    success: false,
                    error: 'Roadmap ID is required in goals',
                    code: 'VALIDATION_ERROR'
                };
            }

            const pace = goals.pace || LearningPace.NORMAL;
            
            // Generate personalized path
            const nextTopic = await this.gateway.getNextTopic(roadmapId);
            const progress = await this.gateway.getProgress(roadmapId);

            return formatResponse({
                userId,
                roadmapId,
                pace,
                interests: goals.interests || [],
                nextTopic,
                progress,
                path: this._buildPathFromProgress(progress, nextTopic),
                recommendations: this._generateRecommendations(goals.interests, nextTopic)
            }, { personalized: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to personalize path' });
        }
    }

    /**
     * Track progress for a roadmap node
     * @param {string} roadmapId - Roadmap ID
     * @param {string} nodeId - Node ID
     * @param {Object} [options] - Progress options
     * @param {NodeStatus} [options.status='completed'] - Progress status
     * @returns {Promise<Object>} Progress result
     * 
     * @example
     * await controller.trackProgress('frontend-master', 'react-basics', {
     *   status: NodeStatus.COMPLETED
     * });
     */
    async trackProgress(roadmapId, nodeId, options = {}) {
        try {
            if (!roadmapId || !nodeId) {
                return {
                    success: false,
                    error: 'Roadmap ID and Node ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const status = options.status || NodeStatus.COMPLETED;
            
            if (!Object.values(NodeStatus).includes(status)) {
                return {
                    success: false,
                    error: `Invalid status. Valid: ${Object.values(NodeStatus).join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            await this.gateway.updateNodeProgress(roadmapId, nodeId, status);

            return formatResponse({
                roadmapId,
                nodeId,
                status,
                updated: true,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to track progress' });
        }
    }

    /**
     * Get recommendations for a user
     * @param {string} userId - User ID
     * @param {Object} [options] - Options
     * @param {number} [options.limit=5] - Max recommendations
     * @param {string[]} [options.roadmapIds] - Specific roadmap IDs to consider
     * @returns {Promise<Object>} Recommendations
     * 
     * @example
     * const recs = await controller.getRecommendations('user-123', { limit: 3 });
     */
    async getRecommendations(userId, options = {}) {
        try {
            if (!userId) {
                return {
                    success: false,
                    error: 'User ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const limit = options.limit || 5;
            const roadmapIds = options.roadmapIds || [];

            // Get all roadmaps or specified ones
            const roadmaps = roadmapIds.length > 0 
                ? roadmapIds 
                : (await this.getRoadmaps()).data?.map(r => r.roadmapId) || [];

            const recommendations = [];

            for (const roadmapId of roadmaps.slice(0, limit)) {
                try {
                    const nextTopic = await this.gateway.getNextTopic(roadmapId);
                    if (nextTopic) {
                        recommendations.push({
                            roadmapId,
                            type: 'next_topic',
                            ...nextTopic
                        });
                    }
                } catch (e) {
                    // Skip failed roadmaps
                }
            }

            return formatResponse({
                userId,
                recommendations,
                count: recommendations.length
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get recommendations' });
        }
    }

    /**
     * Generate recommendations based on interests
     * @private
     * @param {string[]} interests - User interests
     * @param {Object} nextTopic - Next recommended topic
     * @returns {Array} Recommendations
     */
    _generateRecommendations(interests, nextTopic) {
        const recs = [];
        
        if (nextTopic) {
            recs.push({
                type: 'next_topic',
                priority: 'high',
                ...nextTopic
            });
        }

        if (interests && interests.length > 0) {
            recs.push({
                type: 'interest_based',
                priority: 'medium',
                message: `Content related to: ${interests.join(', ')}`
            });
        }

        return recs;
    }

    /**
     * Enroll a user in a roadmap
     * @param {string} roadmapId - Roadmap ID
     * @param {string} userId - User ID
     * @param {Object} [options] - Enrollment options
     * @param {LearningPace} [options.pace='normal'] - Learning pace
     * @returns {Promise<Object>} Enrollment result
     * 
     * @example
     * await controller.enrollUser('frontend-master', 'user-123', {
     *   pace: LearningPace.NORMAL
     * });
     */
    async enrollUser(roadmapId, userId, options = {}) {
        try {
            if (!roadmapId || !userId) {
                return {
                    success: false,
                    error: 'Roadmap ID and User ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const pace = options.pace || LearningPace.NORMAL;
            if (!Object.values(LearningPace).includes(pace)) {
                return {
                    success: false,
                    error: `Invalid pace. Valid: ${Object.values(LearningPace).join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            // Get current progress (creates if doesn't exist)
            const progress = await this.gateway.getProgress(roadmapId);
            
            return formatResponse({
                roadmapId,
                userId,
                pace,
                enrolled: true,
                progress
            }, { enrolled: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to enroll user' });
        }
    }

    /**
     * Update progress for a roadmap node
     * @param {string} roadmapId - Roadmap ID
     * @param {string} nodeId - Node ID
     * @param {NodeStatus} progress - Progress status
     * @param {Object} [options] - Additional options
     * @returns {Promise<Object>} Update result
     * 
     * @example
     * await controller.updateNodeProgress(
     *   'frontend-master',
     *   'react-basics',
     *   NodeStatus.COMPLETED
     * );
     */
    async updateNodeProgress(roadmapId, nodeId, progress, _options = {}) {
        try {
            if (!roadmapId || !nodeId || !progress) {
                return {
                    success: false,
                    error: 'Roadmap ID, Node ID, and progress status are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!Object.values(NodeStatus).includes(progress)) {
                return {
                    success: false,
                    error: `Invalid status. Valid: ${Object.values(NodeStatus).join(', ')}`,
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.updateNodeProgress(
                roadmapId,
                nodeId,
                progress
            );

            return formatResponse(result, { updated: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to update node progress' });
        }
    }

    /**
     * Batch update node progress
     * @param {string} roadmapId - Roadmap ID
     * @param {Array<{nodeId: string, status: NodeStatus}>} updates - Progress updates
     * @returns {Promise<Object>} Batch update result
     */
    async updateProgressBatch(roadmapId, updates) {
        try {
            if (!roadmapId) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            if (!Array.isArray(updates) || updates.length === 0) {
                return {
                    success: false,
                    error: 'Updates array is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            // Validate each update
            for (const update of updates) {
                if (!update.nodeId || !update.status) {
                    return {
                        success: false,
                        error: 'Each update must have nodeId and status',
                        code: 'VALIDATION_ERROR'
                    };
                }
                if (!Object.values(NodeStatus).includes(update.status)) {
                    return {
                        success: false,
                        error: `Invalid status: ${update.status}`,
                        code: 'VALIDATION_ERROR'
                    };
                }
            }

            const result = await this.gateway.updateProgressBatch(roadmapId, updates);
            return formatResponse(result, { 
                batchUpdated: true,
                count: updates.length 
            });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to batch update progress' });
        }
    }

    /**
     * Get learning progress for a roadmap
     * @param {string} roadmapId - Roadmap ID
     * @returns {Promise<Object>} Progress data
     */
    async getProgress(roadmapId) {
        try {
            if (!roadmapId) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.getProgress(roadmapId);
            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get progress' });
        }
    }

    /**
     * Generate a personalized learning path
     * @param {string} roadmapId - Roadmap ID
     * @param {string} userId - User ID
     * @param {Object} [options] - Path generation options
     * @param {string} [options.currentNodeId] - Current node ID (for continuing)
     * @returns {Promise<Object>} Generated learning path
     * 
     * @example
     * const path = await controller.generatePath('frontend-master', 'user-123');
     */
    async generatePath(roadmapId, userId, options = {}) {
        try {
            if (!roadmapId) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            // Get next topic recommendation
            const nextTopic = await this.gateway.getNextTopic(
                roadmapId,
                options.currentNodeId
            );

            // Get progress for context
            const progress = await this.gateway.getProgress(roadmapId);

            return formatResponse({
                roadmapId,
                userId,
                currentNode: options.currentNodeId,
                nextTopic,
                progress,
                path: this._buildPathFromProgress(progress, nextTopic)
            }, { generated: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to generate path' });
        }
    }

    /**
     * Get AI-recommended next topic
     * @param {string} roadmapId - Roadmap ID
     * @param {string} [currentNodeId] - Current node ID
     * @returns {Promise<Object>} Recommended topic
     */
    async getNextTopic(roadmapId, currentNodeId) {
        try {
            if (!roadmapId) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.getNextTopic(roadmapId, currentNodeId);
            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to get next topic' });
        }
    }

    /**
     * Analyze roadmap structure
     * @param {string} roadmapId - Roadmap ID
     * @param {Object} [options] - Analysis options
     * @param {number} [options.depth=2] - Analysis depth
     * @returns {Promise<Object>} Analysis results
     */
    async analyze(roadmapId, options = {}) {
        try {
            if (!roadmapId) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.analyzeRoadmapStructure(
                roadmapId,
                options.depth || 2
            );

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to analyze roadmap' });
        }
    }

    /**
     * Check prerequisites for a node
     * @param {string} roadmapId - Roadmap ID
     * @param {string} nodeId - Node ID
     * @returns {Promise<Object>} Prerequisite check result
     */
    async checkPrerequisites(roadmapId, nodeId) {
        try {
            if (!roadmapId || !nodeId) {
                return {
                    success: false,
                    error: 'Roadmap ID and Node ID are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.checkPrerequisites(roadmapId, nodeId);
            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to check prerequisites' });
        }
    }

    /**
     * Export roadmap to GSD project
     * @param {string} roadmapId - Roadmap ID
     * @param {string} projectName - GSD project name
     * @param {Object} [options] - Export options
     * @param {LearningPace} [options.pace='normal'] - Learning pace
     * @returns {Promise<Object>} Export result
     */
    async exportToGSD(roadmapId, projectName, options = {}) {
        try {
            if (!roadmapId || !projectName) {
                return {
                    success: false,
                    error: 'Roadmap ID and project name are required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const pace = options.pace || LearningPace.NORMAL;
            const result = await this.gateway.exportToGSD(roadmapId, projectName, pace);

            return formatResponse(result, { exported: true });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to export to GSD' });
        }
    }

    /**
     * Validate a roadmap
     * @param {string} roadmapId - Roadmap ID
     * @returns {Promise<Object>} Validation result
     */
    async validate(roadmapId) {
        try {
            if (!roadmapId) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.validateRoadmap(roadmapId);
            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to validate roadmap' });
        }
    }

    /**
     * Validate multiple roadmaps
     * @param {Object} [options] - Validation options
     * @param {string[]} [options.roadmapIds] - Specific roadmap IDs to validate
     * @param {boolean} [options.includePassing=false] - Include passing roadmaps
     * @param {number} [options.maxResults=200] - Maximum results
     * @returns {Promise<Object>} Validation results
     */
    async validateAll(options = {}) {
        try {
            const result = await this.gateway.validateAllRoadmaps({
                roadmap_ids: options.roadmapIds,
                include_passing: options.includePassing || false,
                max_results: options.maxResults || 200
            });

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to validate roadmaps' });
        }
    }

    /**
     * Repair a roadmap
     * @param {string} roadmapId - Roadmap ID
     * @param {Object} [options] - Repair options
     * @param {boolean} [options.dryRun=true] - Preview only
     * @param {boolean} [options.fixGraph=true] - Fix graph issues
     * @param {boolean} [options.fixContent=true] - Fix content issues
     * @returns {Promise<Object>} Repair result
     */
    async repair(roadmapId, options = {}) {
        try {
            if (!roadmapId) {
                return {
                    success: false,
                    error: 'Roadmap ID is required',
                    code: 'VALIDATION_ERROR'
                };
            }

            const result = await this.gateway.repairRoadmap(roadmapId, {
                dry_run: options.dryRun !== false,
                fix_graph: options.fixGraph !== false,
                fix_content: options.fixContent !== false,
                create_missing_content: options.createMissingContent !== false,
                remove_self_loops: options.removeSelfLoops !== false
            });

            return formatResponse(result, { repaired: !options.dryRun });
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to repair roadmap' });
        }
    }

    /**
     * Repair multiple roadmaps
     * @param {Object} [options] - Repair options
     * @param {string[]} [options.roadmapIds] - Specific roadmap IDs
     * @param {boolean} [options.dryRun=true] - Preview only
     * @returns {Promise<Object>} Batch repair results
     */
    async repairAll(options = {}) {
        try {
            const result = await this.gateway.repairAllRoadmaps({
                roadmap_ids: options.roadmapIds,
                dry_run: options.dryRun !== false,
                fix_graph: options.fixGraph !== false,
                fix_content: options.fixContent !== false,
                create_missing_content: options.createMissingContent !== false,
                remove_self_loops: options.removeSelfLoops !== false
            });

            return formatResponse(result);
        } catch (error) {
            return handleError(error, { defaultMessage: 'Failed to repair roadmaps' });
        }
    }

    // Private methods

    /**
     * Build learning path from progress data
     * @private
     * @param {Object} progress - Progress data
     * @param {Object} nextTopic - Next recommended topic
     * @returns {Object} Learning path
     */
    _buildPathFromProgress(progress, nextTopic) {
        if (!progress || !progress.nodes) {
            return {
                completed: [],
                inProgress: [],
                pending: nextTopic ? [nextTopic] : []
            };
        }

        const completed = [];
        const inProgress = [];
        const pending = [];

        for (const node of progress.nodes) {
            switch (node.status) {
                case NodeStatus.COMPLETED:
                case NodeStatus.MASTERED:
                    completed.push(node);
                    break;
                case NodeStatus.IN_PROGRESS:
                case NodeStatus.STARTED:
                    inProgress.push(node);
                    break;
                default:
                    pending.push(node);
            }
        }

        return {
            completed,
            inProgress,
            pending: nextTopic ? [nextTopic, ...pending.filter(p => p.id !== nextTopic.id)] : pending
        };
    }
}

/**
 * Create a new RoadmapController instance
 * @param {Object} [options] - Controller options
 * @returns {RoadmapController} RoadmapController instance
 */
/**
 * Create a new RoadmapController instance
 * @param {Object} [options] - Controller options
 * @returns {RoadmapController} RoadmapController instance
 */
export function createRoadmapController(options = {}) {
    return new RoadmapController(options);
}

export default RoadmapController;
