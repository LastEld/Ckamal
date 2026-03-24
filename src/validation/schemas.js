/**
 * @fileoverview Zod Schema Definitions for CogniMesh v5.0
 * @module validation/schemas
 * @description Comprehensive JSON Schema definitions using Zod
 */

import { z } from 'zod';

// ============================================================================
// Common / Shared Schemas
// ============================================================================

/**
 * @typedef {Object} ValidationIssue
 * @property {Array<string|number>} path - Path to the invalid field
 * @property {string} message - Error message
 * @property {string} code - Error code
 */

/**
 * @typedef {Object} SchemaMetadata
 * @property {string} name - Schema name
 * @property {string} description - Schema description
 * @property {string} category - Schema category
 * @property {string} createdAt - ISO timestamp
 */

/** @type {z.ZodSchema<string>} */
export const uuidSchema = z.string().uuid();

/** @type {z.ZodSchema<string>} */
export const timestampSchema = z.string().datetime();

/** @type {z.ZodSchema<string>} */
export const urlSchema = z.string().url();

/** @type {z.ZodSchema<string>} */
export const emailSchema = z.string().email();

/** @type {z.ZodSchema<string>} */
export const slugSchema = z.string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format');

/** @type {z.ZodSchema<Record<string, unknown>>} */
export const metadataSchema = z.record(z.unknown()).default({});

/** @type {z.ZodSchema<string[]>} */
export const tagsSchema = z.array(z.string().min(1).max(50))
  .max(20)
  .default([]);

/** @type {z.ZodSchema<Object>} */
export const paginationParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().optional()
}).strict();

/** @type {z.ZodSchema<Object>} */
export const paginationResponseSchema = z.object({
  data: z.array(z.unknown()),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
    cursor: z.string().optional()
  })
}).strict();

// ============================================================================
// Task Schemas
// ============================================================================

/** @enum {string} */
export const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived'
};

/** @enum {string} */
export const TaskPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/** @type {z.ZodEnum<[string, string, string, string, string, string]>} */
export const taskStatusSchema = z.enum([
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
  TaskStatus.ARCHIVED
]);

/** @type {z.ZodEnum<[string, string, string, string]>} */
export const taskPrioritySchema = z.enum([
  TaskPriority.LOW,
  TaskPriority.MEDIUM,
  TaskPriority.HIGH,
  TaskPriority.CRITICAL
]);

/** @type {z.ZodSchema<Object>} */
export const taskAssigneeSchema = z.object({
  userId: uuidSchema,
  name: z.string().min(1).max(100),
  avatar: urlSchema.optional()
});

/** @type {z.ZodSchema<Object>} */
export const taskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  status: taskStatusSchema.default(TaskStatus.PENDING),
  priority: taskPrioritySchema.default(TaskPriority.MEDIUM),
  assignee: taskAssigneeSchema.optional(),
  dueDate: timestampSchema.optional(),
  estimatedHours: z.number().positive().max(1000).optional(),
  parentId: uuidSchema.optional(),
  tags: tagsSchema,
  metadata: metadataSchema,
  roadmapId: uuidSchema.optional()
}).strict();

/** @type {z.ZodSchema<Object>} */
export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assignee: taskAssigneeSchema.optional().nullable(),
  dueDate: timestampSchema.optional().nullable(),
  estimatedHours: z.number().positive().max(1000).optional().nullable(),
  tags: tagsSchema.optional(),
  metadata: metadataSchema.optional(),
  completedAt: timestampSchema.optional().nullable()
}).strict();

/** @type {z.ZodSchema<Object>} */
export const taskQuerySchema = z.object({
  status: z.union([taskStatusSchema, z.array(taskStatusSchema)]).optional(),
  priority: z.union([taskPrioritySchema, z.array(taskPrioritySchema)]).optional(),
  assigneeId: uuidSchema.optional(),
  roadmapId: uuidSchema.optional(),
  parentId: uuidSchema.optional().nullable(),
  tags: z.array(z.string()).optional(),
  search: z.string().max(200).optional(),
  dueBefore: timestampSchema.optional(),
  dueAfter: timestampSchema.optional(),
  includeArchived: z.boolean().default(false)
}).strict().merge(paginationParamsSchema).optional().default({});

/** @type {z.ZodSchema<Object>} */
export const taskIdSchema = z.object({
  id: uuidSchema
}).strict();

// ============================================================================
// Roadmap Schemas
// ============================================================================

/** @enum {string} */
export const RoadmapStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived'
};

/** @type {z.ZodEnum<[string, string, string, string, string]>} */
export const roadmapStatusSchema = z.enum([
  RoadmapStatus.DRAFT,
  RoadmapStatus.ACTIVE,
  RoadmapStatus.PAUSED,
  RoadmapStatus.COMPLETED,
  RoadmapStatus.ARCHIVED
]);

/** @type {z.ZodSchema<Object>} */
export const milestoneSchema = z.object({
  id: uuidSchema.default(() => crypto.randomUUID()),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: timestampSchema,
  status: taskStatusSchema.default(TaskStatus.PENDING),
  completionPercentage: z.number().min(0).max(100).default(0),
  dependencies: z.array(uuidSchema).default([]),
  deliverables: z.array(z.object({
    id: uuidSchema,
    title: z.string(),
    completed: z.boolean().default(false)
  })).default([])
}).strict();

/** @type {z.ZodSchema<Object>} */
export const roadmapCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  status: roadmapStatusSchema.default(RoadmapStatus.DRAFT),
  startDate: timestampSchema.optional(),
  targetDate: timestampSchema.optional(),
  milestones: z.array(milestoneSchema).max(50).default([]),
  tags: tagsSchema,
  metadata: metadataSchema
}).strict();

/** @type {z.ZodSchema<Object>} */
export const roadmapUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: roadmapStatusSchema.optional(),
  startDate: timestampSchema.optional().nullable(),
  targetDate: timestampSchema.optional().nullable(),
  milestones: z.array(milestoneSchema).max(50).optional(),
  tags: tagsSchema.optional(),
  metadata: metadataSchema.optional()
}).strict();

// ============================================================================
// User Schemas
// ============================================================================

/** @enum {string} */
export const UserRole = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  DEVELOPER: 'developer',
  VIEWER: 'viewer',
  GUEST: 'guest'
};

/** @enum {string} */
export const UserStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING: 'pending'
};

/** @type {z.ZodEnum<[string, string, string, string, string]>} */
export const userRoleSchema = z.enum([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.DEVELOPER,
  UserRole.VIEWER,
  UserRole.GUEST
]);

/** @type {z.ZodEnum<[string, string, string, string]>} */
export const userStatusSchema = z.enum([
  UserStatus.ACTIVE,
  UserStatus.INACTIVE,
  UserStatus.SUSPENDED,
  UserStatus.PENDING
]);

/** @type {z.ZodSchema<Object>} */
export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  language: z.string().length(2).default('en'),
  timezone: z.string().default('UTC'),
  notifications: z.object({
    email: z.boolean().default(true),
    push: z.boolean().default(true),
    desktop: z.boolean().default(true),
    digestFrequency: z.enum(['immediate', 'hourly', 'daily', 'weekly']).default('immediate')
  }).default({}),
  display: z.object({
    compactView: z.boolean().default(false),
    defaultView: z.enum(['list', 'board', 'timeline', 'calendar']).default('board'),
    itemsPerPage: z.number().min(5).max(100).default(25)
  }).default({})
}).strict();

/** @type {z.ZodSchema<Object>} */
export const userCreateSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(100).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    'Password must contain uppercase, lowercase, number and special character'
  ),
  name: z.string().min(1).max(100),
  role: userRoleSchema.default(UserRole.DEVELOPER),
  avatar: urlSchema.optional(),
  preferences: userPreferencesSchema.default({}),
  metadata: metadataSchema
}).strict();

/** @type {z.ZodSchema<Object>} */
export const userUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: userRoleSchema.optional(),
  avatar: urlSchema.optional().nullable(),
  status: userStatusSchema.optional(),
  preferences: userPreferencesSchema.partial().optional(),
  metadata: metadataSchema.optional()
}).strict();

/** @type {z.ZodSchema<Object>} */
export const userLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  rememberMe: z.boolean().default(false),
  deviceInfo: z.object({
    deviceId: z.string().optional(),
    userAgent: z.string().optional(),
    ip: z.string().ip().optional()
  }).optional()
}).strict();

// ============================================================================
// Context Schemas
// ============================================================================

/** @enum {string} */
export const ContextType = {
  TASK: 'task',
  PROJECT: 'project',
  USER: 'user',
  SYSTEM: 'system',
  CUSTOM: 'custom'
};

/** @enum {string} */
export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool'
};

/** @type {z.ZodEnum<[string, string, string, string, string]>} */
export const contextTypeSchema = z.enum([
  ContextType.TASK,
  ContextType.PROJECT,
  ContextType.USER,
  ContextType.SYSTEM,
  ContextType.CUSTOM
]);

/** @type {z.ZodEnum<[string, string, string, string]>} */
export const messageRoleSchema = z.enum([
  MessageRole.USER,
  MessageRole.ASSISTANT,
  MessageRole.SYSTEM,
  MessageRole.TOOL
]);

/** @type {z.ZodSchema<Object>} */
export const contextMessageSchema = z.object({
  id: uuidSchema.default(() => crypto.randomUUID()),
  role: messageRoleSchema,
  content: z.string().min(1).max(100000),
  timestamp: timestampSchema.default(() => new Date().toISOString()),
  metadata: z.object({
    tokens: z.number().optional(),
    model: z.string().optional(),
    latency: z.number().optional(),
    attachments: z.array(z.object({
      id: uuidSchema,
      type: z.string(),
      name: z.string(),
      url: urlSchema
    })).optional()
  }).default({})
}).strict();

/** @type {z.ZodSchema<Object>} */
export const contextCreateSchema = z.object({
  type: contextTypeSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  parentId: uuidSchema.optional(),
  relatedTaskIds: z.array(uuidSchema).max(100).default([]),
  messages: z.array(contextMessageSchema).max(1000).default([]),
  maxTokens: z.number().min(100).max(100000).default(4000),
  retentionPolicy: z.enum(['forever', '30d', '90d', '1y']).default('90d'),
  metadata: metadataSchema
}).strict();

/** @type {z.ZodSchema<Object>} */
export const contextUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  messages: z.array(contextMessageSchema).max(1000).optional(),
  maxTokens: z.number().min(100).max(100000).optional(),
  retentionPolicy: z.enum(['forever', '30d', '90d', '1y']).optional(),
  metadata: metadataSchema.optional()
}).strict();

// ============================================================================
// Alert Schemas
// ============================================================================

/** @enum {string} */
export const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/** @enum {string} */
export const AlertStatus = {
  ACTIVE: 'active',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
  SILENCED: 'silenced'
};

/** @type {z.ZodEnum<[string, string, string, string]>} */
export const alertSeveritySchema = z.enum([
  AlertSeverity.INFO,
  AlertSeverity.WARNING,
  AlertSeverity.ERROR,
  AlertSeverity.CRITICAL
]);

/** @type {z.ZodEnum<[string, string, string, string]>} */
export const alertStatusSchema = z.enum([
  AlertStatus.ACTIVE,
  AlertStatus.ACKNOWLEDGED,
  AlertStatus.RESOLVED,
  AlertStatus.SILENCED
]);

/** @type {z.ZodSchema<Object>} */
export const alertConfigSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  condition: z.object({
    metric: z.string(),
    operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
    threshold: z.number(),
    duration: z.number().min(0).default(0)
  }),
  severity: alertSeveritySchema.default(AlertSeverity.WARNING),
  channels: z.array(z.enum(['email', 'slack', 'webhook', 'sms', 'push'])).min(1),
  recipients: z.array(z.string()).min(1),
  cooldown: z.number().min(0).default(300),
  autoResolve: z.boolean().default(true),
  enabled: z.boolean().default(true)
}).strict();

/** @type {z.ZodSchema<Object>} */
export const alertCreateSchema = z.object({
  configId: uuidSchema,
  severity: alertSeveritySchema,
  title: z.string().min(1).max(200),
  message: z.string().max(2000),
  source: z.string().max(100),
  metric: z.object({
    name: z.string(),
    value: z.number(),
    unit: z.string().optional()
  }).optional(),
  context: z.record(z.unknown()).optional(),
  relatedEntity: z.object({
    type: z.string(),
    id: uuidSchema
  }).optional()
}).strict();

/** @type {z.ZodSchema<Object>} */
export const alertUpdateSchema = z.object({
  status: alertStatusSchema.optional(),
  acknowledgedBy: uuidSchema.optional(),
  acknowledgedAt: timestampSchema.optional(),
  resolvedAt: timestampSchema.optional(),
  resolution: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional()
}).strict();

// ============================================================================
// Claude API Schemas
// ============================================================================

/** @type {z.ZodSchema<Object>} */
export const claudeToolSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().min(1).max(1024),
  input_schema: z.object({
    type: z.literal('object'),
    properties: z.record(z.object({
      type: z.string(),
      description: z.string().optional(),
      enum: z.array(z.string()).optional()
    })).optional(),
    required: z.array(z.string()).optional()
  })
}).strict();

/** @type {z.ZodSchema<Object>} */
export const claudeMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([
    z.string().max(100000),
    z.array(z.union([
      z.object({
        type: z.literal('text'),
        text: z.string().max(100000)
      }),
      z.object({
        type: z.literal('image'),
        source: z.object({
          type: z.enum(['base64', 'url']),
          media_type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
          data: z.string().optional(),
          url: z.string().url().optional()
        })
      }),
      z.object({
        type: z.literal('tool_use'),
        id: z.string(),
        name: z.string(),
        input: z.record(z.unknown())
      }),
      z.object({
        type: z.literal('tool_result'),
        tool_use_id: z.string(),
        content: z.union([z.string(), z.array(z.object({
          type: z.literal('text'),
          text: z.string()
        }))]).optional(),
        is_error: z.boolean().optional()
      })
    ]))
  ])
}).strict();

/** @type {z.ZodSchema<Object>} */
export const claudeRequestSchema = z.object({
  model: z.enum([
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-3-5-sonnet-20241022'
  ]),
  messages: z.array(claudeMessageSchema).min(1).max(100),
  max_tokens: z.number().min(1).max(4096).default(1024),
  temperature: z.number().min(0).max(1).default(0.7),
  system: z.string().max(10000).optional(),
  tools: z.array(claudeToolSchema).max(32).optional(),
  tool_choice: z.union([
    z.enum(['auto', 'any']),
    z.object({
      type: z.literal('tool'),
      name: z.string()
    })
  ]).optional(),
  stream: z.boolean().default(false),
  metadata: z.object({
    user_id: z.string().optional(),
    session_id: z.string().optional()
  }).optional()
}).strict();

// ============================================================================
// System Schemas
// ============================================================================

/** @type {z.ZodSchema<Object>} */
export const systemConfigSchema = z.object({
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  features: z.record(z.boolean()).default({}),
  limits: z.object({
    maxTasksPerUser: z.number().min(1).default(1000),
    maxContextsPerUser: z.number().min(1).default(100),
    maxFileSize: z.number().min(1).default(10485760),
    requestRateLimit: z.number().min(1).default(100),
    wsMessageSize: z.number().min(1).default(1048576)
  }).default({}),
  integrations: z.object({
    claude: z.object({
      apiKey: z.string().optional(),
      baseUrl: urlSchema.optional(),
      defaultModel: z.string().default('claude-3-sonnet-20240229'),
      timeout: z.number().min(1000).default(60000)
    }).optional(),
    slack: z.object({
      webhookUrl: urlSchema.optional(),
      botToken: z.string().optional()
    }).optional(),
    github: z.object({
      appId: z.string().optional(),
      privateKey: z.string().optional(),
      webhookSecret: z.string().optional()
    }).optional()
  }).default({})
}).strict();

/** @type {z.ZodSchema<Object>} */
export const systemHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: timestampSchema,
  version: z.string(),
  checks: z.record(z.object({
    status: z.enum(['pass', 'fail', 'warn']),
    responseTime: z.number(),
    message: z.string().optional()
  })),
  uptime: z.number(),
  dependencies: z.record(z.enum(['connected', 'disconnected', 'degraded'])).optional()
}).strict();

/** @type {z.ZodSchema<Object>} */
export const systemMetricsSchema = z.object({
  timestamp: timestampSchema,
  period: z.enum(['1m', '5m', '15m', '1h', '1d']),
  requests: z.object({
    total: z.number(),
    success: z.number(),
    error: z.number(),
    latency: z.object({
      p50: z.number(),
      p95: z.number(),
      p99: z.number(),
      max: z.number()
    })
  }),
  resources: z.object({
    cpu: z.object({
      usage: z.number().min(0).max(100),
      cores: z.number()
    }),
    memory: z.object({
      used: z.number(),
      total: z.number(),
      percentage: z.number().min(0).max(100)
    }),
    disk: z.object({
      used: z.number(),
      total: z.number(),
      percentage: z.number().min(0).max(100)
    })
  }),
  activeConnections: z.object({
    websocket: z.number(),
    http: z.number()
  }),
  queues: z.record(z.object({
    pending: z.number(),
    processing: z.number(),
    failed: z.number()
  })).optional()
}).strict();

// ============================================================================
// WebSocket Schemas
// ============================================================================

/** @enum {string} */
export const WebSocketEventType = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  MESSAGE: 'message',
  TYPING: 'typing',
  PRESENCE: 'presence',
  TASK_UPDATE: 'task_update',
  ALERT: 'alert',
  SYSTEM: 'system',
  PING: 'ping',
  PONG: 'pong'
};

/** @type {z.ZodEnum<[string, string, string, string, string, string, string, string, string]>} */
export const websocketEventTypeSchema = z.enum([
  WebSocketEventType.CONNECT,
  WebSocketEventType.DISCONNECT,
  WebSocketEventType.MESSAGE,
  WebSocketEventType.TYPING,
  WebSocketEventType.PRESENCE,
  WebSocketEventType.TASK_UPDATE,
  WebSocketEventType.ALERT,
  WebSocketEventType.SYSTEM,
  WebSocketEventType.PING,
  WebSocketEventType.PONG
]);

/** @type {z.ZodSchema<Object>} */
export const websocketConnectSchema = z.object({
  token: z.string().min(1),
  deviceId: z.string().optional(),
  subscriptions: z.array(z.enum([
    'tasks', 'alerts', 'messages', 'presence', 'system'
  ])).default(['tasks']),
  presence: z.object({
    status: z.enum(['online', 'away', 'busy', 'offline']).default('online'),
    message: z.string().max(100).optional()
  }).default({})
}).strict();

/** @type {z.ZodSchema<Object>} */
export const websocketMessageSchema = z.object({
  id: uuidSchema.default(() => crypto.randomUUID()),
  type: websocketEventTypeSchema,
  payload: z.unknown(),
  timestamp: timestampSchema.default(() => new Date().toISOString()),
  sender: z.object({
    userId: uuidSchema,
    deviceId: z.string().optional()
  }).optional()
}).strict();

/** @type {z.ZodSchema<Object>} */
export const websocketEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    payload: z.object({
      contextId: uuidSchema,
      content: z.string().min(1).max(10000),
      replyTo: uuidSchema.optional(),
      attachments: z.array(z.object({
        id: uuidSchema,
        type: z.string(),
        name: z.string(),
        size: z.number()
      })).optional()
    })
  }),
  z.object({
    type: z.literal('typing'),
    payload: z.object({
      contextId: uuidSchema,
      isTyping: z.boolean()
    })
  }),
  z.object({
    type: z.literal('presence'),
    payload: z.object({
      userId: uuidSchema,
      status: z.enum(['online', 'away', 'busy', 'offline']),
      message: z.string().optional()
    })
  }),
  z.object({
    type: z.literal('task_update'),
    payload: z.object({
      taskId: uuidSchema,
      changes: z.record(z.unknown()),
      updatedBy: uuidSchema
    })
  }),
  z.object({
    type: z.literal('ping'),
    payload: z.object({
      timestamp: z.number()
    }).optional()
  }),
  z.object({
    type: z.literal('pong'),
    payload: z.object({
      timestamp: z.number()
    }).optional()
  })
]);

// ============================================================================
// Type Exports (for TypeScript/JSDoc)
// ============================================================================

/**
 * @typedef {z.infer<typeof taskCreateSchema>} TaskCreate
 * @typedef {z.infer<typeof taskUpdateSchema>} TaskUpdate
 * @typedef {z.infer<typeof taskQuerySchema>} TaskQuery
 * 
 * @typedef {z.infer<typeof roadmapCreateSchema>} RoadmapCreate
 * @typedef {z.infer<typeof roadmapUpdateSchema>} RoadmapUpdate
 * @typedef {z.infer<typeof milestoneSchema>} Milestone
 * 
 * @typedef {z.infer<typeof userCreateSchema>} UserCreate
 * @typedef {z.infer<typeof userUpdateSchema>} UserUpdate
 * @typedef {z.infer<typeof userLoginSchema>} UserLogin
 * @typedef {z.infer<typeof userPreferencesSchema>} UserPreferences
 * 
 * @typedef {z.infer<typeof contextCreateSchema>} ContextCreate
 * @typedef {z.infer<typeof contextUpdateSchema>} ContextUpdate
 * @typedef {z.infer<typeof contextMessageSchema>} ContextMessage
 * 
 * @typedef {z.infer<typeof alertCreateSchema>} AlertCreate
 * @typedef {z.infer<typeof alertUpdateSchema>} AlertUpdate
 * @typedef {z.infer<typeof alertConfigSchema>} AlertConfig
 * 
 * @typedef {z.infer<typeof claudeRequestSchema>} ClaudeRequest
 * @typedef {z.infer<typeof claudeMessageSchema>} ClaudeMessage
 * @typedef {z.infer<typeof claudeToolSchema>} ClaudeTool
 * 
 * @typedef {z.infer<typeof systemConfigSchema>} SystemConfig
 * @typedef {z.infer<typeof systemHealthSchema>} SystemHealth
 * @typedef {z.infer<typeof systemMetricsSchema>} SystemMetrics
 * 
 * @typedef {z.infer<typeof paginationParamsSchema>} PaginationParams
 * @typedef {z.infer<typeof paginationResponseSchema>} PaginationResponse
 * 
 * @typedef {z.infer<typeof websocketConnectSchema>} WebSocketConnect
 * @typedef {z.infer<typeof websocketMessageSchema>} WebSocketMessage
 * @typedef {z.infer<typeof websocketEventSchema>} WebSocketEvent
 */
