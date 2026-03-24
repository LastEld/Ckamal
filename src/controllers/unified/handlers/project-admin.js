/**
 * @fileoverview Project Admin Handler - Create, delete, update projects
 * @module controllers/unified/handlers/project-admin
 */

import { z } from 'zod';
import { EventEmitter } from 'events';

/**
 * Project states
 * @enum {string}
 */
export const ProjectState = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
};

/**
 * In-memory project store
 * @type {Map<string, Object>}
 */
const projectStore = new Map();

/**
 * Project event emitter
 * @type {EventEmitter}
 */
const projectEvents = new EventEmitter();

/**
 * Project management tools
 * @const {Object}
 */
export const projectAdminTools = {
  /**
   * Create a new project
   * @param {Object} params
   * @param {string} params.name - Project name
   * @param {string} [params.description] - Project description
   * @param {Object} [params.config] - Project configuration
   * @param {string[]} [params.tags] - Project tags
   * @returns {Promise<Object>} Created project
   */
  'project.create': async (params) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Check for duplicate names
    for (const project of projectStore.values()) {
      if (project.name === params.name && project.state !== ProjectState.DELETED) {
        throw new Error(`Project with name '${params.name}' already exists`);
      }
    }

    const project = {
      id,
      name: params.name,
      description: params.description || '',
      state: ProjectState.ACTIVE,
      config: params.config || {},
      tags: params.tags || [],
      createdAt: now,
      updatedAt: now,
      metadata: {
        version: 1,
        createdBy: params.createdBy || 'system',
      },
    };

    projectStore.set(id, project);
    projectEvents.emit('project:created', { id, project });

    return { id, name: project.name, state: project.state, createdAt: project.createdAt };
  },

  /**
   * Delete a project
   * @param {Object} params
   * @param {string} params.id - Project ID
   * @param {boolean} [params.permanent=false] - Permanently delete
   * @returns {Promise<Object>} Deletion result
   */
  'project.delete': async (params) => {
    const project = projectStore.get(params.id);
    if (!project) {
      throw new Error(`Project '${params.id}' not found`);
    }

    if (params.permanent) {
      projectStore.delete(params.id);
      projectEvents.emit('project:deleted', { id: params.id, permanent: true });
      return { id: params.id, deleted: true, permanent: true };
    }

    project.state = ProjectState.DELETED;
    project.updatedAt = new Date().toISOString();
    projectEvents.emit('project:deleted', { id: params.id, permanent: false });

    return { id: params.id, deleted: true, permanent: false };
  },

  /**
   * Update a project
   * @param {Object} params
   * @param {string} params.id - Project ID
   * @param {string} [params.name] - New name
   * @param {string} [params.description] - New description
   * @param {Object} [params.config] - Config updates
   * @param {string[]} [params.tags] - New tags
   * @returns {Promise<Object>} Updated project
   */
  'project.update': async (params) => {
    const project = projectStore.get(params.id);
    if (!project) {
      throw new Error(`Project '${params.id}' not found`);
    }

    if (project.state === ProjectState.DELETED) {
      throw new Error(`Cannot update deleted project`);
    }

    const updates = {};
    
    if (params.name !== undefined) {
      // Check for duplicate names
      for (const p of projectStore.values()) {
        if (p.id !== params.id && p.name === params.name && p.state !== ProjectState.DELETED) {
          throw new Error(`Project with name '${params.name}' already exists`);
        }
      }
      updates.name = params.name;
    }

    if (params.description !== undefined) updates.description = params.description;
    if (params.config !== undefined) {
      updates.config = { ...project.config, ...params.config };
    }
    if (params.tags !== undefined) updates.tags = params.tags;

    Object.assign(project, updates);
    project.updatedAt = new Date().toISOString();
    project.metadata.version++;

    projectEvents.emit('project:updated', { id: params.id, updates, project });

    return { 
      id: params.id, 
      name: project.name, 
      state: project.state,
      updatedAt: project.updatedAt,
    };
  },

  /**
   * Archive a project
   * @param {Object} params
   * @param {string} params.id - Project ID
   * @returns {Promise<Object>} Archived project
   */
  'project.archive': async (params) => {
    const project = projectStore.get(params.id);
    if (!project) {
      throw new Error(`Project '${params.id}' not found`);
    }

    if (project.state === ProjectState.DELETED) {
      throw new Error(`Cannot archive deleted project`);
    }

    project.state = ProjectState.ARCHIVED;
    project.updatedAt = new Date().toISOString();
    project.metadata.version++;

    projectEvents.emit('project:archived', { id: params.id, project });

    return { id: params.id, state: project.state, archivedAt: project.updatedAt };
  },

  /**
   * Activate a project
   * @param {Object} params
   * @param {string} params.id - Project ID
   * @returns {Promise<Object>} Activated project
   */
  'project.activate': async (params) => {
    const project = projectStore.get(params.id);
    if (!project) {
      throw new Error(`Project '${params.id}' not found`);
    }

    if (project.state === ProjectState.DELETED) {
      throw new Error(`Cannot activate deleted project`);
    }

    project.state = ProjectState.ACTIVE;
    project.updatedAt = new Date().toISOString();
    project.metadata.version++;

    projectEvents.emit('project:activated', { id: params.id, project });

    return { id: params.id, state: project.state, activatedAt: project.updatedAt };
  },

  /**
   * Get project details
   * @param {Object} params
   * @param {string} params.id - Project ID
   * @returns {Promise<Object>} Project details
   */
  'project.get': async (params) => {
    const project = projectStore.get(params.id);
    if (!project) {
      throw new Error(`Project '${params.id}' not found`);
    }
    return { ...project };
  },

  /**
   * List projects
   * @param {Object} params
   * @param {string} [params.state] - Filter by state
   * @param {string[]} [params.tags] - Filter by tags
   * @param {number} [params.limit=50] - Maximum results
   * @returns {Promise<Object[]>} Project list
   */
  'project.list': async (params) => {
    let projects = Array.from(projectStore.values());

    if (params.state) {
      projects = projects.filter(p => p.state === params.state);
    }

    if (params.tags && params.tags.length > 0) {
      projects = projects.filter(p => 
        params.tags.some(tag => p.tags.includes(tag))
      );
    }

    const limit = params.limit || 50;
    projects = projects.slice(0, limit);

    return projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      state: p.state,
      tags: p.tags,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  },

  /**
   * Search projects
   * @param {Object} params
   * @param {string} params.query - Search query
   * @param {number} [params.limit=20] - Maximum results
   * @returns {Promise<Object[]>} Search results
   */
  'project.search': async (params) => {
    const query = params.query.toLowerCase();
    const limit = params.limit || 20;

    const results = Array.from(projectStore.values())
      .filter(p => 
        p.state !== ProjectState.DELETED &&
        (p.name.toLowerCase().includes(query) ||
         p.description.toLowerCase().includes(query) ||
         p.tags.some(t => t.toLowerCase().includes(query)))
      )
      .slice(0, limit)
      .map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        state: p.state,
        tags: p.tags,
      }));

    return results;
  },
};

/**
 * Schemas for project admin tools
 * @const {Object}
 */
export const projectAdminSchemas = {
  'project.create': z.object({
    name: z.string().min(1).max(256),
    description: z.string().max(2000).optional(),
    config: z.record(z.any()).optional(),
    tags: z.array(z.string().max(64)).max(50).optional(),
    createdBy: z.string().optional(),
  }),

  'project.delete': z.object({
    id: z.string().uuid(),
    permanent: z.boolean().default(false),
  }),

  'project.update': z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(256).optional(),
    description: z.string().max(2000).optional(),
    config: z.record(z.any()).optional(),
    tags: z.array(z.string().max(64)).max(50).optional(),
  }),

  'project.archive': z.object({
    id: z.string().uuid(),
  }),

  'project.activate': z.object({
    id: z.string().uuid(),
  }),

  'project.get': z.object({
    id: z.string().uuid(),
  }),

  'project.list': z.object({
    state: z.enum(Object.values(ProjectState)).optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(1000).default(50),
  }),

  'project.search': z.object({
    query: z.string().min(1).max(500),
    limit: z.number().int().min(1).max(100).default(20),
  }),
};

/**
 * Descriptions for project admin tools
 * @const {Object}
 */
export const projectAdminDescriptions = {
  'project.create': 'Create a new project',
  'project.delete': 'Delete a project (soft or hard delete)',
  'project.update': 'Update project properties',
  'project.archive': 'Archive a project',
  'project.activate': 'Activate an archived project',
  'project.get': 'Get project details',
  'project.list': 'List projects with filtering',
  'project.search': 'Search projects by name, description, or tags',
};

/**
 * Tags for project admin tools
 * @const {Object}
 */
export const projectAdminTags = {
  'project.create': ['project', 'admin', 'create'],
  'project.delete': ['project', 'admin', 'delete'],
  'project.update': ['project', 'admin', 'update'],
  'project.archive': ['project', 'admin', 'archive'],
  'project.activate': ['project', 'admin', 'activate'],
  'project.get': ['project', 'admin', 'query'],
  'project.list': ['project', 'admin', 'query'],
  'project.search': ['project', 'admin', 'query'],
};

export { projectStore, projectEvents };
export default projectAdminTools;
