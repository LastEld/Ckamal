/**
 * @fileoverview Task Management MCP Tools
 * Provides comprehensive task lifecycle management capabilities.
 * @module tools/definitions/task-tools
 */

import { z } from 'zod';
import { createTool, createResponseSchema } from '../definition-helpers.js';
import { TaskDomain } from '../../domains/tasks/index.js';

// TaskDomain instance - shared across all task tools
const taskDomain = new TaskDomain();

// Common schemas
const TaskStatus = z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'archived']);
const TaskPriority = z.enum(['low', 'medium', 'high', 'critical']);
const EisenhowerQuadrant = z.enum(['urgent-important', 'not-urgent-important', 'urgent-not-important', 'not-urgent-not-important']);

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: TaskStatus,
  priority: TaskPriority,
  urgent: z.boolean(),
  important: z.boolean(),
  quadrant: EisenhowerQuadrant,
  roadmapNodeId: z.string().nullable(),
  parentTaskId: z.string().nullable(),
  subtasks: z.array(z.string()),
  tags: z.array(z.string()),
  dueDate: z.string().nullable(),
  estimatedMinutes: z.number(),
  actualMinutes: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
  assignees: z.array(z.string()),
  attachments: z.array(z.string())
});

const TaskListSchema = z.object({
  tasks: z.array(TaskSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number()
});

// Response schemas
const SingleTaskResponse = createResponseSchema(TaskSchema);
const TaskListResponse = createResponseSchema(TaskListSchema);
const BulkUpdateResponse = createResponseSchema(z.object({
  updated: z.number(),
  failed: z.number(),
  details: z.array(z.object({
    id: z.string(),
    success: z.boolean(),
    error: z.string().optional()
  }))
}));
const TaskStatsResponse = createResponseSchema(z.object({
  total: z.number(),
  byStatus: z.record(z.number()),
  byPriority: z.record(z.number()),
  byQuadrant: z.record(z.number()),
  overdue: z.number(),
  completedThisWeek: z.number()
}));
const LinkResponse = createResponseSchema(z.object({
  sourceId: z.string(),
  targetId: z.string(),
  linkType: z.string()
}));

/**
 * Task Tools Export
 */
export const taskTools = [
  /**
   * Create a new task
   */
  createTool({
    name: 'task_create',
    description: 'Create a new task with title, description, priority, and optional due date',
    inputSchema: z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(5000).optional(),
      priority: TaskPriority.default('medium'),
      urgent: z.boolean().default(false),
      important: z.boolean().default(false),
      assignees: z.array(z.string()).default([]),
      dueDate: z.string().datetime().optional(),
      tags: z.array(z.string()).default([]),
      parentTaskId: z.string().optional(),
      roadmapNodeId: z.string().optional(),
      estimatedMinutes: z.number().min(0).default(0),
      createdBy: z.string().default('system')
    }),
    outputSchema: SingleTaskResponse,
    handler: async (params) => {
      return taskDomain.createTask({
        title: params.title,
        description: params.description,
        priority: params.priority,
        urgent: params.urgent,
        important: params.important,
        assignees: params.assignees,
        dueDate: params.dueDate,
        tags: params.tags,
        parentTaskId: params.parentTaskId,
        roadmapNodeId: params.roadmapNodeId,
        estimatedMinutes: params.estimatedMinutes,
        createdBy: params.createdBy
      });
    },
    tags: ['task', 'create']
  }),

  /**
   * Update an existing task
   */
  createTool({
    name: 'task_update',
    description: 'Update task properties including status, priority, assignee, and due date',
    inputSchema: z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      status: TaskStatus.optional(),
      priority: TaskPriority.optional(),
      urgent: z.boolean().optional(),
      important: z.boolean().optional(),
      assignees: z.array(z.string()).optional(),
      dueDate: z.string().datetime().optional(),
      tags: z.array(z.string()).optional(),
      estimatedMinutes: z.number().min(0).optional(),
      actualMinutes: z.number().min(0).optional()
    }),
    outputSchema: SingleTaskResponse,
    handler: async (params) => {
      const { id, ...updates } = params;
      return taskDomain.updateTask(id, updates);
    },
    tags: ['task', 'update']
  }),

  /**
   * Delete a task
   */
  createTool({
    name: 'task_delete',
    description: 'Delete a task by ID, cascading to child tasks',
    inputSchema: z.object({
      id: z.string()
    }),
    outputSchema: createResponseSchema(z.object({ deleted: z.boolean() })),
    handler: async (params) => {
      const { id } = params;
      const deleted = taskDomain.deleteTask(id);
      return { deleted };
    },
    tags: ['task', 'delete']
  }),

  /**
   * Get a single task
   */
  createTool({
    name: 'task_get',
    description: 'Retrieve a task by ID with full details',
    inputSchema: z.object({
      id: z.string()
    }),
    outputSchema: SingleTaskResponse,
    handler: async (params) => {
      const { id } = params;
      const task = taskDomain.getTask(id);
      if (!task) {
        throw new Error(`Task not found: ${id}`);
      }
      return task;
    },
    tags: ['task', 'get']
  }),

  /**
   * List tasks with filtering
   */
  createTool({
    name: 'task_list',
    description: 'List tasks with filtering by status, priority, assignee, and pagination',
    inputSchema: z.object({
      status: TaskStatus.optional(),
      priority: TaskPriority.optional(),
      quadrant: EisenhowerQuadrant.optional(),
      assignee: z.string().optional(),
      tags: z.array(z.string()).optional(),
      roadmapNodeId: z.string().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      sortBy: z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc')
    }),
    outputSchema: TaskListResponse,
    handler: async (params) => {
      const filters = {
        status: params.status,
        priority: params.priority,
        quadrant: params.quadrant,
        assignee: params.assignee,
        tags: params.tags,
        roadmapNodeId: params.roadmapNodeId
      };
      
      let tasks = taskDomain.listTasks(filters);
      const total = tasks.length;
      
      // Apply sorting
      tasks.sort((a, b) => {
        const aVal = a[params.sortBy];
        const bVal = b[params.sortBy];
        if (params.sortOrder === 'desc') {
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      });
      
      // Apply pagination
      const offset = (params.page - 1) * params.pageSize;
      tasks = tasks.slice(offset, offset + params.pageSize);
      
      return {
        tasks,
        total,
        page: params.page,
        pageSize: params.pageSize
      };
    },
    tags: ['task', 'list']
  }),

  /**
   * Search tasks
   */
  createTool({
    name: 'task_search',
    description: 'Full-text search across task titles, descriptions, and tags',
    inputSchema: z.object({
      query: z.string().min(1),
      filters: z.object({
        status: TaskStatus.optional(),
        priority: TaskPriority.optional(),
        assignee: z.string().optional()
      }).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20)
    }),
    outputSchema: TaskListResponse,
    handler: async (params) => {
      const { query, filters = {}, page, pageSize } = params;
      
      // Get all tasks and filter by search query
      let tasks = taskDomain.listTasks(filters);
      const searchLower = query.toLowerCase();
      
      tasks = tasks.filter(t => 
        t.title.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
      
      const total = tasks.length;
      
      // Apply pagination
      const offset = (page - 1) * pageSize;
      tasks = tasks.slice(offset, offset + pageSize);
      
      return {
        tasks,
        total,
        page,
        pageSize
      };
    },
    tags: ['task', 'search']
  }),

  /**
   * Get next actions
   */
  createTool({
    name: 'task_next_actions',
    description: 'Get prioritized list of next actions based on due dates, priorities, and dependencies',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).default(10),
      assignee: z.string().optional(),
      includeBlocked: z.boolean().default(false)
    }),
    outputSchema: createResponseSchema(z.object({
      actions: z.array(z.object({
        task: TaskSchema,
        reason: z.string(),
        urgency: z.number().min(0).max(1)
      }))
    })),
    handler: async (params) => {
      const { limit, assignee, includeBlocked } = params;
      
      // Get all tasks and calculate priority score
      let tasks = taskDomain.listTasks({ assignee });
      
      if (!includeBlocked) {
        tasks = tasks.filter(t => t.status !== 'done' && t.status !== 'archived');
      }
      
      const actions = tasks.map(task => {
        let urgency = 0.5;
        let reason = 'Standard priority task';
        
        // Calculate urgency based on quadrant
        switch (task.quadrant) {
          case 'urgent-important':
            urgency = 1.0;
            reason = 'Urgent and important - Do first';
            break;
          case 'not-urgent-important':
            urgency = 0.8;
            reason = 'Important - Schedule time';
            break;
          case 'urgent-not-important':
            urgency = 0.6;
            reason = 'Urgent - Consider delegating';
            break;
          case 'not-urgent-not-important':
            urgency = 0.3;
            reason = 'Low priority - Eliminate if possible';
            break;
        }
        
        // Adjust for due date
        if (task.dueDate) {
          const daysUntilDue = (new Date(task.dueDate) - new Date()) / (1000 * 60 * 60 * 24);
          if (daysUntilDue < 0) {
            urgency = Math.min(1, urgency + 0.2);
            reason = 'Overdue - ' + reason;
          } else if (daysUntilDue < 2) {
            urgency = Math.min(1, urgency + 0.1);
            reason = 'Due soon - ' + reason;
          }
        }
        
        // Adjust for status
        if (task.status === 'in_progress') {
          urgency = Math.min(1, urgency + 0.1);
          reason = 'In progress - ' + reason;
        }
        
        return { task, reason, urgency };
      });
      
      // Sort by urgency and take top N
      actions.sort((a, b) => b.urgency - a.urgency);
      
      return {
        actions: actions.slice(0, limit)
      };
    },
    tags: ['task', 'actions', 'priority']
  }),

  /**
   * Bulk update tasks
   */
  createTool({
    name: 'task_bulk_update',
    description: 'Update multiple tasks at once with the same changes',
    inputSchema: z.object({
      ids: z.array(z.string()).min(1).max(100),
      updates: z.object({
        status: TaskStatus.optional(),
        priority: TaskPriority.optional(),
        assignees: z.array(z.string()).optional(),
        tags: z.object({
          add: z.array(z.string()).optional(),
          remove: z.array(z.string()).optional()
        }).optional()
      })
    }),
    outputSchema: BulkUpdateResponse,
    handler: async (params) => {
      const { ids, updates } = params;
      const details = [];
      let updated = 0;
      let failed = 0;
      
      for (const id of ids) {
        try {
          const task = taskDomain.getTask(id);
          if (!task) {
            details.push({ id, success: false, error: 'Task not found' });
            failed++;
            continue;
          }
          
          const updateData = {};
          if (updates.status) updateData.status = updates.status;
          if (updates.priority) updateData.priority = updates.priority;
          if (updates.assignees) updateData.assignees = updates.assignees;
          
          // Handle tag modifications
          if (updates.tags) {
            let newTags = [...task.tags];
            if (updates.tags.add) {
              newTags = [...new Set([...newTags, ...updates.tags.add])];
            }
            if (updates.tags.remove) {
              newTags = newTags.filter(t => !updates.tags.remove.includes(t));
            }
            updateData.tags = newTags;
          }
          
          taskDomain.updateTask(id, updateData);
          details.push({ id, success: true });
          updated++;
        } catch (error) {
          details.push({ id, success: false, error: error.message });
          failed++;
        }
      }
      
      return {
        updated,
        failed,
        details
      };
    },
    tags: ['task', 'bulk', 'update']
  }),

  /**
   * Link tasks
   */
  createTool({
    name: 'task_link',
    description: 'Create a relationship between two tasks (blocks, relates_to, duplicates)',
    inputSchema: z.object({
      sourceId: z.string(),
      targetId: z.string(),
      linkType: z.enum(['blocks', 'relates_to', 'duplicates', 'depends_on']),
      bidirectional: z.boolean().default(false)
    }),
    outputSchema: LinkResponse,
    handler: async (params) => {
      const { sourceId, targetId, linkType, bidirectional } = params;
      
      // For now, store the link in the target task's metadata
      const targetTask = taskDomain.getTask(targetId);
      if (!targetTask) {
        throw new Error(`Target task not found: ${targetId}`);
      }
      
      const links = targetTask.metadata?.links || [];
      links.push({ sourceId, targetId, linkType, createdAt: new Date().toISOString() });
      
      taskDomain.updateTask(targetId, {
        metadata: { ...targetTask.metadata, links }
      });
      
      // If bidirectional, add reverse link
      if (bidirectional) {
        const sourceTask = taskDomain.getTask(sourceId);
        if (sourceTask) {
          const sourceLinks = sourceTask.metadata?.links || [];
          const reverseType = linkType === 'blocks' ? 'blocked_by' : 
                             linkType === 'depends_on' ? 'depended_by' : linkType;
          sourceLinks.push({ sourceId: targetId, targetId: sourceId, linkType: reverseType, createdAt: new Date().toISOString() });
          taskDomain.updateTask(sourceId, {
            metadata: { ...sourceTask.metadata, links: sourceLinks }
          });
        }
      }
      
      return { sourceId, targetId, linkType };
    },
    tags: ['task', 'link', 'relationship']
  }),

  /**
   * Get task statistics
   */
  createTool({
    name: 'task_stats',
    description: 'Get comprehensive task statistics and analytics',
    inputSchema: z.object({
      assignee: z.string().optional(),
      dateRange: z.object({
        start: z.string().datetime(),
        end: z.string().datetime()
      }).optional()
    }),
    outputSchema: TaskStatsResponse,
    handler: async (params) => {
      const { assignee } = params;
      const tasks = taskDomain.listTasks({ assignee });
      
      const byStatus = {};
      const byPriority = {};
      const byQuadrant = {};
      let overdue = 0;
      let completedThisWeek = 0;
      
      const now = new Date();
      const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      
      for (const task of tasks) {
        // Count by status
        byStatus[task.status] = (byStatus[task.status] || 0) + 1;
        
        // Count by priority
        byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
        
        // Count by quadrant
        byQuadrant[task.quadrant] = (byQuadrant[task.quadrant] || 0) + 1;
        
        // Count overdue
        if (task.dueDate && new Date(task.dueDate) < now && task.status !== 'done' && task.status !== 'archived') {
          overdue++;
        }
        
        // Count completed this week
        if (task.status === 'done' && task.updatedAt) {
          const completedDate = new Date(task.updatedAt);
          if (completedDate >= oneWeekAgo) {
            completedThisWeek++;
          }
        }
      }
      
      return {
        total: tasks.length,
        byStatus,
        byPriority,
        byQuadrant,
        overdue,
        completedThisWeek
      };
    },
    tags: ['task', 'stats', 'analytics']
  }),

  /**
   * Get task dependencies
   */
  createTool({
    name: 'task_dependencies',
    description: 'Get all dependencies and dependents for a task',
    inputSchema: z.object({
      id: z.string(),
      depth: z.number().int().min(1).max(5).default(2)
    }),
    outputSchema: createResponseSchema(z.object({
      dependencies: z.array(TaskSchema),
      dependents: z.array(TaskSchema),
      graph: z.object({
        nodes: z.array(z.object({ id: z.string(), task: TaskSchema })),
        edges: z.array(z.object({ source: z.string(), target: z.string(), type: z.string() }))
      })
    })),
    handler: async (params) => {
      const { id, depth } = params;
      
      const task = taskDomain.getTask(id);
      if (!task) {
        throw new Error(`Task not found: ${id}`);
      }
      
      // Get all tasks to find relationships
      const allTasks = taskDomain.listTasks({});
      
      const dependencies = [];
      const dependents = [];
      const nodes = [{ id, task }];
      const edges = [];
      const visited = new Set([id]);
      
      // Find tasks this task depends on (parent)
      if (task.parentTaskId) {
        const parent = taskDomain.getTask(task.parentTaskId);
        if (parent) {
          dependencies.push(parent);
          nodes.push({ id: parent.id, task: parent });
          edges.push({ source: parent.id, target: id, type: 'parent' });
        }
      }
      
      // Find tasks that depend on this task (children/subtasks)
      for (const t of allTasks) {
        if (t.parentTaskId === id) {
          dependents.push(t);
          if (!visited.has(t.id)) {
            nodes.push({ id: t.id, task: t });
            visited.add(t.id);
          }
          edges.push({ source: id, target: t.id, type: 'child' });
        }
        
        // Check for links in metadata
        const links = t.metadata?.links || [];
        for (const link of links) {
          if (link.sourceId === id) {
            const linkedTask = taskDomain.getTask(link.targetId);
            if (linkedTask) {
              dependents.push(linkedTask);
              if (!visited.has(linkedTask.id)) {
                nodes.push({ id: linkedTask.id, task: linkedTask });
                visited.add(linkedTask.id);
              }
              edges.push({ source: id, target: linkedTask.id, type: link.linkType });
            }
          } else if (link.targetId === id) {
            const linkedTask = taskDomain.getTask(link.sourceId);
            if (linkedTask) {
              dependencies.push(linkedTask);
              if (!visited.has(linkedTask.id)) {
                nodes.push({ id: linkedTask.id, task: linkedTask });
                visited.add(linkedTask.id);
              }
              edges.push({ source: linkedTask.id, target: id, type: link.linkType });
            }
          }
        }
      }
      
      return {
        dependencies,
        dependents,
        graph: { nodes, edges }
      };
    },
    tags: ['task', 'dependencies', 'graph']
  }),

  /**
   * Get Eisenhower Matrix
   */
  createTool({
    name: 'task_eisenhower_matrix',
    description: 'Get tasks organized by Eisenhower Matrix quadrants',
    inputSchema: z.object({
      assignee: z.string().optional()
    }),
    outputSchema: createResponseSchema(z.object({
      urgentImportant: z.array(TaskSchema),
      notUrgentImportant: z.array(TaskSchema),
      urgentNotImportant: z.array(TaskSchema),
      notUrgentNotImportant: z.array(TaskSchema)
    })),
    handler: async (params) => {
      const { assignee } = params;
      return taskDomain.organizeByMatrix({ assignee });
    },
    tags: ['task', 'eisenhower', 'matrix']
  })
];

export default taskTools;

// Export taskDomain for use in other modules
export { taskDomain };
