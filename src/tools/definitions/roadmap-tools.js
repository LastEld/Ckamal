/**
 * @fileoverview Roadmap Management MCP Tools
 * Provides roadmap creation, management, and visualization capabilities.
 * @module tools/definitions/roadmap-tools
 */

import { z } from 'zod';
import { createTool, createResponseSchema } from '../definition-helpers.js';
import { RoadmapDomain } from '../../domains/roadmaps/index.js';

// RoadmapDomain instance - shared across all roadmap tools
const roadmapDomain = new RoadmapDomain();

// Common schemas
const NodeStatus = z.enum(['not_started', 'in_progress', 'completed']);
const NodeType = z.enum(['lesson', 'project', 'assessment']);

const RoadmapNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  prerequisites: z.array(z.string()),
  estimatedHours: z.number(),
  resources: z.array(z.string()),
  type: NodeType
});

const RoadmapSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  nodes: z.array(RoadmapNodeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  tags: z.array(z.string())
});

const RoadmapListSchema = z.object({
  roadmaps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    category: z.string(),
    difficulty: z.string(),
    nodeCount: z.number(),
    updatedAt: z.string()
  })),
  total: z.number()
});

// Response schemas
const SingleRoadmapResponse = createResponseSchema(RoadmapSchema);
const RoadmapListResponse = createResponseSchema(RoadmapListSchema);
const ProgressResponse = createResponseSchema(z.object({
  roadmapId: z.string(),
  overallProgress: z.number(),
  completedNodes: z.number(),
  totalNodes: z.number(),
  byNode: z.record(z.string())
}));
const ExportResponse = createResponseSchema(z.object({
  format: z.string(),
  content: z.string(),
  url: z.string().optional()
}));

/**
 * Roadmap Tools Export
 */
export const roadmapTools = [
  /**
   * Create a new roadmap
   */
  createTool({
    name: 'roadmap_create',
    description: 'Create a new roadmap with title, description, and initial nodes',
    inputSchema: z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(5000).optional(),
      category: z.string().default('general'),
      initialNodes: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        type: NodeType,
        estimatedHours: z.number().default(0),
        prerequisites: z.array(z.string()).default([]),
        resources: z.array(z.string()).default([])
      })).optional(),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
      tags: z.array(z.string()).default([]),
      createdBy: z.string().default('system')
    }),
    outputSchema: SingleRoadmapResponse,
    handler: async (params) => {
      const roadmap = roadmapDomain.createRoadmap({
        title: params.title,
        description: params.description,
        category: params.category,
        nodes: params.initialNodes?.map((node, idx) => ({
          id: `node_${idx}`,
          ...node
        })) || [],
        difficulty: params.difficulty,
        tags: params.tags,
        createdBy: params.createdBy
      });
      return roadmap;
    },
    tags: ['roadmap', 'create']
  }),

  /**
   * Get a roadmap
   */
  createTool({
    name: 'roadmap_get',
    description: 'Retrieve a roadmap by ID with all nodes and details',
    inputSchema: z.object({
      id: z.string(),
      includeProgress: z.boolean().default(true)
    }),
    outputSchema: SingleRoadmapResponse,
    handler: async (params) => {
      const { id, includeProgress } = params;
      const roadmap = roadmapDomain.getRoadmap(id);
      
      if (!roadmap) {
        throw new Error(`Roadmap not found: ${id}`);
      }
      
      // If progress requested, add it to the response
      if (includeProgress) {
        // Progress would be calculated here for a specific user
        // For now, return roadmap as-is
      }
      
      return roadmap;
    },
    tags: ['roadmap', 'get']
  }),

  /**
   * Update a roadmap
   */
  createTool({
    name: 'roadmap_update',
    description: 'Update roadmap properties including title, description, and tags',
    inputSchema: z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      category: z.string().optional(),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
      tags: z.array(z.string()).optional()
    }),
    outputSchema: SingleRoadmapResponse,
    handler: async (params) => {
      const { id, ...updates } = params;
      
      const roadmap = roadmapDomain.getRoadmap(id);
      if (!roadmap) {
        throw new Error();
      }
      
      const updated = roadmapDomain.updateRoadmap(id, updates);
      return updated;
    },
    tags: ['roadmap', 'update']
  }),

  /**
   * Delete a roadmap
   */
  createTool({
    name: 'roadmap_delete',
    description: 'Delete a roadmap',
    inputSchema: z.object({
      id: z.string()
    }),
    outputSchema: createResponseSchema(z.object({ deleted: z.boolean() })),
    handler: async (params) => {
      const { id } = params;
      const deleted = roadmapDomain.deleteRoadmap(id);
      return { deleted };
    },
    tags: ['roadmap', 'delete']
  }),

  /**
   * List roadmaps
   */
  createTool({
    name: 'roadmap_list',
    description: 'List roadmaps with filtering by category, difficulty, and pagination',
    inputSchema: z.object({
      category: z.string().optional(),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20)
    }),
    outputSchema: RoadmapListResponse,
    handler: async (params) => {
      const filters = {
        category: params.category,
        difficulty: params.difficulty
      };
      
      let roadmaps = roadmapDomain.listRoadmaps(filters);
      const total = roadmaps.length;
      
      // Format roadmaps for response
      const formattedRoadmaps = roadmaps.map(r => ({
        id: r.id,
        title: r.title,
        category: r.category,
        difficulty: r.difficulty,
        nodeCount: r.nodes?.length || 0,
        updatedAt: r.updatedAt
      }));
      
      // Apply pagination
      const offset = (params.page - 1) * params.pageSize;
      const paginated = formattedRoadmaps.slice(offset, offset + params.pageSize);
      
      return {
        roadmaps: paginated,
        total: total
      };
    },
    tags: ['roadmap', 'list']
  }),

  /**
   * Update roadmap progress
   */
  createTool({
    name: 'roadmap_update_progress',
    description: 'Update progress for roadmap nodes for a user',
    inputSchema: z.object({
      roadmapId: z.string(),
      userId: z.string(),
      nodeProgress: z.array(z.object({
        nodeId: z.string(),
        status: NodeStatus
      }))
    }),
    outputSchema: ProgressResponse,
    handler: async (params) => {
      const { roadmapId, userId, nodeProgress } = params;
      
      const roadmap = roadmapDomain.getRoadmap(roadmapId);
      if (!roadmap) {
        throw new Error();
      }
      
      // Update each node's status
      for (const { nodeId, status } of nodeProgress) {
        try {
          roadmapDomain.updateNodeStatus(roadmapId, userId, nodeId, status);
        } catch (error) {
          // Continue with other updates
        }
      }
      
      // Get updated progress
      const progress = roadmapDomain.getProgress(roadmapId, userId);
      
      return {
        success: true,
        data: {
          roadmapId,
          overallProgress: progress.progressPercent,
          completedNodes: progress.completedNodes,
          totalNodes: progress.totalNodes,
          byNode: progress.nodeStatus
        }
      };
    },
    tags: ['roadmap', 'progress', 'update']
  }),

  /**
   * Add a node to roadmap
   */
  createTool({
    name: 'roadmap_add_node',
    description: 'Add a new node to an existing roadmap',
    inputSchema: z.object({
      roadmapId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      type: NodeType.default('lesson'),
      estimatedHours: z.number().default(0),
      prerequisites: z.array(z.string()).default([]),
      resources: z.array(z.string()).default([])
    }),
    outputSchema: createResponseSchema(RoadmapNodeSchema),
    handler: async (params) => {
      const { roadmapId, ...nodeData } = params;
      
      const roadmap = roadmapDomain.getRoadmap(roadmapId);
      if (!roadmap) {
        throw new Error();
      }
      
      const node = {
        id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        title: nodeData.title,
        description: nodeData.description || '',
        type: nodeData.type,
        estimatedHours: nodeData.estimatedHours,
        prerequisites: nodeData.prerequisites,
        resources: nodeData.resources
      };
      
      // Add node to roadmap
      roadmap.nodes.push(node);
      roadmapDomain.updateRoadmap(roadmapId, { nodes: roadmap.nodes });
      
      return node;
    },
    tags: ['roadmap', 'node', 'add']
  }),

  /**
   * Remove a node from roadmap
   */
  createTool({
    name: 'roadmap_remove_node',
    description: 'Remove a node from roadmap',
    inputSchema: z.object({
      roadmapId: z.string(),
      nodeId: z.string()
    }),
    outputSchema: createResponseSchema(z.object({ removed: z.boolean(), affectedNodes: z.number() })),
    handler: async (params) => {
      const { roadmapId, nodeId } = params;
      
      const roadmap = roadmapDomain.getRoadmap(roadmapId);
      if (!roadmap) {
        throw new Error();
      }
      
      const initialCount = roadmap.nodes.length;
      roadmap.nodes = roadmap.nodes.filter(n => n.id !== nodeId);
      const removed = roadmap.nodes.length < initialCount;
      
      if (removed) {
        roadmapDomain.updateRoadmap(roadmapId, { nodes: roadmap.nodes });
      }
      
      return {
        removed,
        affectedNodes: removed ? 1 : 0
      };
    },
    tags: ['roadmap', 'node', 'remove']
  }),

  /**
   * Export roadmap
   */
  createTool({
    name: 'roadmap_export',
    description: 'Export roadmap to various formats (JSON, Markdown)',
    inputSchema: z.object({
      id: z.string(),
      format: z.enum(['json', 'markdown', 'csv']),
      options: z.object({
        includeCompleted: z.boolean().default(true),
        includeDescription: z.boolean().default(true)
      }).optional()
    }),
    outputSchema: ExportResponse,
    handler: async (params) => {
      const { id, format, options = {} } = params;
      
      const roadmap = roadmapDomain.getRoadmap(id);
      if (!roadmap) {
        throw new Error();
      }
      
      let content = '';
      
      switch (format) {
        case 'json':
          content = JSON.stringify(roadmap, null, 2);
          break;
        case 'markdown':
          content = `# ${roadmap.title}\n\n`;
          if (options.includeDescription && roadmap.description) {
            content += `${roadmap.description}\n\n`;
          }
          content += `## Nodes\n\n`;
          for (const node of roadmap.nodes) {
            content += `### ${node.title}\n`;
            if (options.includeDescription && node.description) {
              content += `${node.description}\n`;
            }
            content += `- Type: ${node.type}\n`;
            content += `- Estimated Hours: ${node.estimatedHours}\n`;
            if (node.prerequisites?.length) {
              content += `- Prerequisites: ${node.prerequisites.join(', ')}\n`;
            }
            content += '\n';
          }
          break;
        case 'csv':
          content = 'ID,Title,Type,Estimated Hours,Prerequisites\n';
          for (const node of roadmap.nodes) {
            const prereqs = node.prerequisites?.join(';') || '';
            content += `"${node.id}","${node.title}","${node.type}",${node.estimatedHours},"${prereqs}"\n`;
          }
          break;
      }
      
      return {
        success: true,
        data: {
          format,
          content,
          url: `/exports/roadmap_${id}.${format}`
        }
      };
    },
    tags: ['roadmap', 'export']
  }),

  /**
   * Import roadmap
   */
  createTool({
    name: 'roadmap_import',
    description: 'Import roadmap from external formats (JSON, CSV)',
    inputSchema: z.object({
      source: z.enum(['json', 'csv']),
      content: z.string(),
      options: z.object({
        title: z.string().optional(),
        category: z.string().default('imported'),
        createdBy: z.string().default('system')
      }).optional()
    }),
    outputSchema: SingleRoadmapResponse,
    handler: async (params) => {
      const { source, content, options = {} } = params;
      
      let importedData;
      
      try {
        switch (source) {
          case 'json':
            importedData = JSON.parse(content);
            break;
          case 'csv':
            // Simple CSV parsing
            const lines = content.split('\n').filter(l => l.trim());
            const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
            const nodes = [];
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
              const node = {};
              headers.forEach((h, idx) => {
                if (h === 'Prerequisites') {
                  node.prerequisites = values[idx] ? values[idx].split(';') : [];
                } else {
                  node[h.toLowerCase().replace(/\s+/g, '_')] = values[idx];
                }
              });
              nodes.push({
                id: node.id || `node_${i}`,
                title: node.title || 'Untitled',
                description: node.description || '',
                type: node.type || 'lesson',
                estimatedHours: parseFloat(node.estimated_hours) || 0,
                prerequisites: node.prerequisites || [],
                resources: []
              });
            }
            importedData = { nodes };
            break;
        }
      } catch (error) {
        throw new Error();
      }
      
      const roadmap = roadmapDomain.createRoadmap({
        title: options.title || importedData.title || `Imported from ${source}`,
        description: importedData.description || '',
        category: options.category,
        nodes: importedData.nodes || [],
        createdBy: options.createdBy,
        tags: ['imported']
      });
      
      return roadmap;
    },
    tags: ['roadmap', 'import']
  }),

  /**
   * Clone a roadmap
   */
  createTool({
    name: 'roadmap_clone',
    description: 'Clone an existing roadmap with options to copy nodes',
    inputSchema: z.object({
      sourceId: z.string(),
      newName: z.string().min(1).max(200),
      options: z.object({
        copyNodes: z.boolean().default(true),
        newCategory: z.string().optional(),
        newDifficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional()
      }).optional()
    }),
    outputSchema: SingleRoadmapResponse,
    handler: async (params) => {
      const { sourceId, newName, options = {} } = params;
      
      const source = roadmapDomain.getRoadmap(sourceId);
      if (!source) {
        throw new Error();
      }
      
      const roadmap = roadmapDomain.createRoadmap({
        title: newName,
        description: source.description,
        category: options.newCategory || source.category,
        nodes: options.copyNodes ? source.nodes.map(n => ({
          ...n,
          id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
        })) : [],
        difficulty: options.newDifficulty || source.difficulty,
        tags: [...source.tags, 'cloned']
      });
      
      return roadmap;
    },
    tags: ['roadmap', 'clone']
  }),

  /**
   * Get roadmap statistics
   */
  createTool({
    name: 'roadmap_stats',
    description: 'Get comprehensive statistics about roadmap',
    inputSchema: z.object({
      id: z.string()
    }),
    outputSchema: createResponseSchema(z.object({
      totalNodes: z.number(),
      byType: z.record(z.number()),
      totalEstimatedHours: z.number(),
      prerequisitesCount: z.number(),
      complexity: z.enum(['low', 'medium', 'high'])
    })),
    handler: async (params) => {
      const { id } = params;
      
      const roadmap = roadmapDomain.getRoadmap(id);
      if (!roadmap) {
        throw new Error();
      }
      
      const nodes = roadmap.nodes || [];
      const byType = {};
      let totalEstimatedHours = 0;
      let prerequisitesCount = 0;
      
      for (const node of nodes) {
        byType[node.type] = (byType[node.type] || 0) + 1;
        totalEstimatedHours += node.estimatedHours || 0;
        prerequisitesCount += node.prerequisites?.length || 0;
      }
      
      // Calculate complexity based on node count and prerequisites
      let complexity = 'low';
      if (nodes.length > 20 || prerequisitesCount > 10) {
        complexity = 'high';
      } else if (nodes.length > 10 || prerequisitesCount > 5) {
        complexity = 'medium';
      }
      
      return {
        success: true,
        data: {
          totalNodes: nodes.length,
          byType,
          totalEstimatedHours,
          prerequisitesCount,
          complexity
        }
      };
    },
    tags: ['roadmap', 'stats', 'analytics']
  }),

  /**
   * Update roadmap node
   */
  createTool({
    name: 'roadmap_update_node',
    description: 'Update an existing node in a roadmap',
    inputSchema: z.object({
      roadmapId: z.string(),
      nodeId: z.string(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      type: NodeType.optional(),
      estimatedHours: z.number().min(0).optional(),
      prerequisites: z.array(z.string()).optional(),
      resources: z.array(z.string()).optional()
    }),
    outputSchema: createResponseSchema(RoadmapNodeSchema),
    handler: async (params) => {
      const { roadmapId, nodeId, ...updates } = params;
      
      const roadmap = roadmapDomain.getRoadmap(roadmapId);
      if (!roadmap) {
        throw new Error();
      }
      
      const nodeIndex = roadmap.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex === -1) {
        throw new Error();
      }
      
      const node = {
        ...roadmap.nodes[nodeIndex],
        ...updates
      };
      
      roadmap.nodes[nodeIndex] = node;
      roadmapDomain.updateRoadmap(roadmapId, { nodes: roadmap.nodes });
      
      return node;
    },
    tags: ['roadmap', 'node', 'update']
  }),

  /**
   * Enroll user in roadmap
   */
  createTool({
    name: 'roadmap_enroll',
    description: 'Enroll a user in a roadmap',
    inputSchema: z.object({
      roadmapId: z.string(),
      userId: z.string()
    }),
    outputSchema: createResponseSchema(z.object({
      roadmapId: z.string(),
      userId: z.string(),
      enrolledAt: z.string(),
      progressPercent: z.number()
    })),
    handler: async (params) => {
      const { roadmapId, userId } = params;
      
      const enrollment = roadmapDomain.enrollUser(roadmapId, userId);
      
      return {
        success: true,
        data: {
          roadmapId: enrollment.roadmapId,
          userId: enrollment.userId,
          enrolledAt: enrollment.enrolledAt,
          progressPercent: enrollment.progressPercent
        }
      };
    },
    tags: ['roadmap', 'enroll']
  }),

  /**
   * Get user progress
   */
  createTool({
    name: 'roadmap_get_progress',
    description: 'Get user progress in a roadmap',
    inputSchema: z.object({
      roadmapId: z.string(),
      userId: z.string()
    }),
    outputSchema: ProgressResponse,
    handler: async (params) => {
      const { roadmapId, userId } = params;
      
      const progress = roadmapDomain.getProgress(roadmapId, userId);
      
      return {
        success: true,
        data: {
          roadmapId: progress.roadmapId,
          overallProgress: progress.progressPercent,
          completedNodes: progress.completedNodes,
          totalNodes: progress.totalNodes,
          byNode: progress.nodeStatus
        }
      };
    },
    tags: ['roadmap', 'progress', 'get']
  }),

  /**
   * Get recommendations
   */
  createTool({
    name: 'roadmap_recommendations',
    description: 'Get recommended next nodes for a user',
    inputSchema: z.object({
      userId: z.string(),
      roadmapId: z.string().optional(),
      limit: z.number().int().min(1).max(20).default(5)
    }),
    outputSchema: createResponseSchema(z.object({
      recommendations: z.array(z.object({
        nodeId: z.string(),
        roadmapId: z.string(),
        title: z.string(),
        reason: z.string(),
        priority: z.number(),
        estimatedHours: z.number()
      }))
    })),
    handler: async (params) => {
      const { userId, roadmapId, limit } = params;
      
      const recommendations = roadmapDomain.recommendNext(userId, roadmapId);
      
      return {
        success: true,
        data: {
          recommendations: recommendations.slice(0, limit)
        }
      };
    },
    tags: ['roadmap', 'recommendations']
  })
];

export default roadmapTools;

// Export roadmapDomain for use in other modules
export { roadmapDomain };
