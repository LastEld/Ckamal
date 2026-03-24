/**
 * @fileoverview Roadmaps Domain - Learning path and roadmap management
 * @module domains/roadmaps
 */

/**
 * Roadmap node structure
 * @typedef {Object} RoadmapNode
 * @property {string} id - Unique node identifier
 * @property {string} title - Node title
 * @property {string} description - Node description
 * @property {string[]} prerequisites - IDs of prerequisite nodes
 * @property {number} estimatedHours - Estimated completion time
 * @property {string[]} resources - Associated resource URLs
 * @property {string} type - Node type (lesson, project, assessment)
 */

/**
 * Roadmap structure
 * @typedef {Object} Roadmap
 * @property {string} id - Unique roadmap identifier
 * @property {string} title - Roadmap title
 * @property {string} description - Roadmap description
 * @property {string} category - Roadmap category
 * @property {RoadmapNode[]} nodes - Array of nodes
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string} createdBy - Creator user ID
 * @property {string} difficulty - Difficulty level (beginner, intermediate, advanced)
 * @property {string[]} tags - Searchable tags
 */

/**
 * User enrollment record
 * @typedef {Object} Enrollment
 * @property {string} roadmapId - Associated roadmap
 * @property {string} userId - Enrolled user
 * @property {string} enrolledAt - ISO timestamp
 * @property {Object.<string, string>} nodeStatus - Node completion status
 * @property {number} progressPercent - Overall progress percentage
 * @property {string} lastAccessedAt - Last access timestamp
 */

/**
 * Recommendation result
 * @typedef {Object} Recommendation
 * @property {string} nodeId - Recommended node
 * @property {string} reason - Recommendation reason
 * @property {number} priority - Priority score (0-100)
 */

/**
 * Manages learning roadmaps and user progress
 */
export class RoadmapDomain {
  /**
   * @private
   * @type {Map<string, Roadmap>}
   */
  #roadmaps = new Map();

  /**
   * @private
   * @type {Map<string, Enrollment>}
   */
  #enrollments = new Map();

  /**
   * Creates a new RoadmapDomain
   */
  constructor() {
    this.#roadmaps = new Map();
    this.#enrollments = new Map();
  }

  /**
   * Generate a unique ID
   * @private
   * @returns {string}
   */
  #generateId() {
    return `rm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current timestamp
   * @private
   * @returns {string}
   */
  #now() {
    return new Date().toISOString();
  }

  /**
   * Create a new roadmap
   * @param {Object} data - Roadmap creation data
   * @param {string} data.title - Roadmap title
   * @param {string} [data.description] - Roadmap description
   * @param {string} [data.category] - Roadmap category
   * @param {RoadmapNode[]} [data.nodes] - Initial nodes
   * @param {string} [data.createdBy] - Creator user ID
   * @param {string} [data.difficulty='beginner'] - Difficulty level
   * @param {string[]} [data.tags] - Searchable tags
   * @returns {Roadmap} Created roadmap
   */
  createRoadmap(data) {
    if (!data.title || typeof data.title !== 'string') {
      throw new Error('Roadmap title is required');
    }

    const now = this.#now();
    const roadmap = {
      id: this.#generateId(),
      title: data.title,
      description: data.description ?? '',
      category: data.category ?? 'general',
      nodes: data.nodes ?? [],
      createdAt: now,
      updatedAt: now,
      createdBy: data.createdBy ?? 'system',
      difficulty: data.difficulty ?? 'beginner',
      tags: data.tags ?? []
    };

    this.#roadmaps.set(roadmap.id, roadmap);
    return roadmap;
  }

  /**
   * Get a roadmap by ID
   * @param {string} id - Roadmap ID
   * @returns {Roadmap|undefined} The roadmap or undefined
   */
  getRoadmap(id) {
    if (!id || typeof id !== 'string') {
      return undefined;
    }
    return this.#roadmaps.get(id);
  }

  /**
   * Update an existing roadmap
   * @param {string} id - Roadmap ID
   * @param {Partial<Roadmap>} data - Update data
   * @returns {Roadmap} Updated roadmap
   * @throws {Error} If roadmap not found
   */
  updateRoadmap(id, data) {
    const roadmap = this.#roadmaps.get(id);
    if (!roadmap) {
      throw new Error(`Roadmap not found: ${id}`);
    }

    const allowedUpdates = ['title', 'description', 'category', 'nodes', 'difficulty', 'tags'];
    
    for (const key of allowedUpdates) {
      if (key in data) {
        roadmap[key] = data[key];
      }
    }

    roadmap.updatedAt = this.#now();
    this.#roadmaps.set(id, roadmap);
    
    return roadmap;
  }

  /**
   * Delete a roadmap
   * @param {string} id - Roadmap ID
   * @returns {boolean} True if deleted
   */
  deleteRoadmap(id) {
    const existed = this.#roadmaps.has(id);
    this.#roadmaps.delete(id);
    
    // Clean up enrollments
    for (const [key, enrollment] of this.#enrollments) {
      if (enrollment.roadmapId === id) {
        this.#enrollments.delete(key);
      }
    }
    
    return existed;
  }

  /**
   * Enroll a user in a roadmap
   * @param {string} roadmapId - Roadmap ID
   * @param {string} userId - User ID
   * @returns {Enrollment} Enrollment record
   * @throws {Error} If roadmap not found or already enrolled
   */
  enrollUser(roadmapId, userId) {
    if (!this.#roadmaps.has(roadmapId)) {
      throw new Error(`Roadmap not found: ${roadmapId}`);
    }

    const enrollmentKey = `${roadmapId}:${userId}`;
    if (this.#enrollments.has(enrollmentKey)) {
      throw new Error(`User ${userId} is already enrolled in roadmap ${roadmapId}`);
    }

    const roadmap = this.#roadmaps.get(roadmapId);
    const nodeStatus = {};
    
    // Initialize all nodes as not started
    for (const node of roadmap.nodes) {
      nodeStatus[node.id] = 'not_started';
    }

    const enrollment = {
      roadmapId,
      userId,
      enrolledAt: this.#now(),
      nodeStatus,
      progressPercent: 0,
      lastAccessedAt: this.#now()
    };

    this.#enrollments.set(enrollmentKey, enrollment);
    return enrollment;
  }

  /**
   * Get user progress in a roadmap
   * @param {string} roadmapId - Roadmap ID
   * @param {string} userId - User ID
   * @returns {Object} Progress details
   * @throws {Error} If not enrolled
   */
  getProgress(roadmapId, userId) {
    const enrollmentKey = `${roadmapId}:${userId}`;
    const enrollment = this.#enrollments.get(enrollmentKey);
    
    if (!enrollment) {
      throw new Error(`User ${userId} is not enrolled in roadmap ${roadmapId}`);
    }

    const roadmap = this.#roadmaps.get(roadmapId);
    const totalNodes = roadmap.nodes.length;
    const completedNodes = Object.values(enrollment.nodeStatus)
      .filter(status => status === 'completed').length;
    
    enrollment.progressPercent = totalNodes > 0 
      ? Math.round((completedNodes / totalNodes) * 100) 
      : 0;
    enrollment.lastAccessedAt = this.#now();

    return {
      roadmapId,
      userId,
      progressPercent: enrollment.progressPercent,
      completedNodes,
      totalNodes,
      nodeStatus: enrollment.nodeStatus,
      enrolledAt: enrollment.enrolledAt,
      lastAccessedAt: enrollment.lastAccessedAt
    };
  }

  /**
   * Recommend next nodes for a user
   * @param {string} userId - User ID
   * @param {string} [roadmapId] - Specific roadmap (optional)
   * @returns {Recommendation[]} Recommended nodes
   */
  recommendNext(userId, roadmapId) {
    const recommendations = [];

    // If specific roadmap provided, focus on that
    if (roadmapId) {
      return this.#getRecommendationsForRoadmap(roadmapId, userId)
        .sort((a, b) => b.priority - a.priority);
    }

    // Otherwise, check all enrolled roadmaps
    for (const [key, enrollment] of this.#enrollments) {
      if (enrollment.userId === userId) {
        const recs = this.#getRecommendationsForRoadmap(enrollment.roadmapId, userId);
        recommendations.push(...recs);
      }
    }

    // Sort by priority
    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get recommendations for a specific roadmap
   * @private
   * @param {string} roadmapId - Roadmap ID
   * @param {string} userId - User ID
   * @returns {Recommendation[]}
   */
  #getRecommendationsForRoadmap(roadmapId, userId) {
    const enrollmentKey = `${roadmapId}:${userId}`;
    const enrollment = this.#enrollments.get(enrollmentKey);
    
    if (!enrollment) {
      return [];
    }

    const roadmap = this.#roadmaps.get(roadmapId);
    if (!roadmap) {
      return [];
    }

    const recommendations = [];

    for (const node of roadmap.nodes) {
      const status = enrollment.nodeStatus[node.id];
      
      if (status === 'completed') {
        continue;
      }

      // Check prerequisites
      const prereqsMet = node.prerequisites?.every(
        prereqId => enrollment.nodeStatus[prereqId] === 'completed'
      ) ?? true;

      if (!prereqsMet) {
        continue;
      }

      let priority = 50;
      let reason = 'Next available node';
      const unlocksOtherNodes = roadmap.nodes.some(candidate =>
        candidate.prerequisites?.includes(node.id)
      );

      if (status === 'in_progress') {
        priority = 80;
        reason = 'Continue in-progress node';
      } else if (node.type === 'assessment') {
        priority = 60;
        reason = 'Ready for assessment';
      } else if ((node.prerequisites?.length ?? 0) === 0 && unlocksOtherNodes) {
        priority = 70;
        reason = 'Foundation node available';
      }

      recommendations.push({
        nodeId: node.id,
        roadmapId,
        title: node.title,
        reason,
        priority,
        estimatedHours: node.estimatedHours
      });
    }

    return recommendations;
  }

  /**
   * Update node status for a user
   * @param {string} roadmapId - Roadmap ID
   * @param {string} userId - User ID
   * @param {string} nodeId - Node ID
   * @param {string} status - New status (not_started, in_progress, completed)
   * @returns {Enrollment} Updated enrollment
   */
  updateNodeStatus(roadmapId, userId, nodeId, status) {
    const enrollmentKey = `${roadmapId}:${userId}`;
    const enrollment = this.#enrollments.get(enrollmentKey);
    
    if (!enrollment) {
      throw new Error(`User ${userId} is not enrolled in roadmap ${roadmapId}`);
    }

    const validStatuses = ['not_started', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    enrollment.nodeStatus[nodeId] = status;
    enrollment.lastAccessedAt = this.#now();
    
    return enrollment;
  }

  /**
   * List all roadmaps
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.category] - Filter by category
   * @param {string} [filters.difficulty] - Filter by difficulty
   * @returns {Roadmap[]} Matching roadmaps
   */
  listRoadmaps(filters = {}) {
    let roadmaps = Array.from(this.#roadmaps.values());

    if (filters.category) {
      roadmaps = roadmaps.filter(r => r.category === filters.category);
    }

    if (filters.difficulty) {
      roadmaps = roadmaps.filter(r => r.difficulty === filters.difficulty);
    }

    return roadmaps;
  }

  /**
   * Get user's enrolled roadmaps
   * @param {string} userId - User ID
   * @returns {Object[]} Enrollment details with roadmap info
   */
  getUserEnrollments(userId) {
    const enrollments = [];

    for (const enrollment of this.#enrollments.values()) {
      if (enrollment.userId === userId) {
        const roadmap = this.#roadmaps.get(enrollment.roadmapId);
        if (roadmap) {
          enrollments.push({
            ...enrollment,
            roadmapTitle: roadmap.title,
            roadmapCategory: roadmap.category
          });
        }
      }
    }

    return enrollments;
  }
}

export default RoadmapDomain;
