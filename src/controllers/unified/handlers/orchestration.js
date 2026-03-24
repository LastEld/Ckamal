/**
 * @fileoverview Orchestration Handler - Schedule and route operations
 * @module controllers/unified/handlers/orchestration
 */

import { z } from 'zod';
import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Schedule types
 * @enum {string}
 */
export const ScheduleType = {
  ONCE: 'once',
  INTERVAL: 'interval',
  CRON: 'cron',
  EVENT: 'event',
};

/**
 * Schedule states
 * @enum {string}
 */
export const ScheduleState = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Schedule store
 * @type {Map<string, Object>}
 */
const scheduleStore = new Map();

/**
 * Route registry
 * @type {Map<string, Object>}
 */
const routeRegistry = new Map();

/**
 * Orchestration event emitter
 * @type {EventEmitter}
 */
const orchestrationEvents = new EventEmitter();

/**
 * Active timers
 * @type {Map<string, Timeout>}
 */
const activeTimers = new Map();

/**
 * Orchestration tools
 * @const {Object}
 */
export const orchestrationTools = {
  /**
   * Schedule a task
   * @param {Object} params
   * @param {string} params.name - Schedule name
   * @param {string} params.type - Schedule type (once, interval, cron, event)
   * @param {string} [params.cron] - Cron expression
   * @param {number} [params.interval] - Interval in milliseconds
   * @param {string} [params.at] - ISO timestamp for one-time execution
   * @param {string} params.task - Task to execute
   * @param {Object} [params.params] - Task parameters
   * @returns {Promise<Object>} Created schedule
   */
  'orchestration.schedule': async (params) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const schedule = {
      id,
      name: params.name,
      type: params.type,
      cron: params.cron,
      interval: params.interval,
      at: params.at,
      task: params.task,
      params: params.params || {},
      state: ScheduleState.PENDING,
      nextRun: calculateNextRun(params),
      lastRun: null,
      runCount: 0,
      maxRuns: params.maxRuns || null,
      createdAt: now,
      updatedAt: now,
    };

    scheduleStore.set(id, schedule);
    orchestrationEvents.emit('schedule:created', { id, schedule });

    // Activate schedule
    activateSchedule(id);

    return {
      id,
      name: schedule.name,
      type: schedule.type,
      state: schedule.state,
      nextRun: schedule.nextRun,
      createdAt: schedule.createdAt,
    };
  },

  /**
   * Cancel a schedule
   * @param {Object} params
   * @param {string} params.id - Schedule ID
   * @returns {Promise<Object>} Cancellation result
   */
  'orchestration.schedule.cancel': async (params) => {
    const schedule = scheduleStore.get(params.id);
    if (!schedule) {
      throw new Error(`Schedule '${params.id}' not found`);
    }

    // Clear timer if active
    const timer = activeTimers.get(params.id);
    if (timer) {
      clearTimeout(timer);
      activeTimers.delete(params.id);
    }

    schedule.state = ScheduleState.CANCELLED;
    schedule.updatedAt = new Date().toISOString();

    orchestrationEvents.emit('schedule:cancelled', { id: params.id, schedule });

    return { id: params.id, state: schedule.state, cancelledAt: schedule.updatedAt };
  },

  /**
   * Pause a schedule
   * @param {Object} params
   * @param {string} params.id - Schedule ID
   * @returns {Promise<Object>} Paused schedule
   */
  'orchestration.schedule.pause': async (params) => {
    const schedule = scheduleStore.get(params.id);
    if (!schedule) {
      throw new Error(`Schedule '${params.id}' not found`);
    }

    if (schedule.state !== ScheduleState.PENDING && schedule.state !== ScheduleState.RUNNING) {
      throw new Error(`Cannot pause schedule in '${schedule.state}' state`);
    }

    // Clear timer
    const timer = activeTimers.get(params.id);
    if (timer) {
      clearTimeout(timer);
      activeTimers.delete(params.id);
    }

    schedule.state = ScheduleState.PAUSED;
    schedule.updatedAt = new Date().toISOString();

    orchestrationEvents.emit('schedule:paused', { id: params.id, schedule });

    return { id: params.id, state: schedule.state, pausedAt: schedule.updatedAt };
  },

  /**
   * Resume a paused schedule
   * @param {Object} params
   * @param {string} params.id - Schedule ID
   * @returns {Promise<Object>} Resumed schedule
   */
  'orchestration.schedule.resume': async (params) => {
    const schedule = scheduleStore.get(params.id);
    if (!schedule) {
      throw new Error(`Schedule '${params.id}' not found`);
    }

    if (schedule.state !== ScheduleState.PAUSED) {
      throw new Error(`Cannot resume schedule in '${schedule.state}' state`);
    }

    schedule.state = ScheduleState.PENDING;
    schedule.updatedAt = new Date().toISOString();
    schedule.nextRun = calculateNextRun(schedule);

    activateSchedule(params.id);

    orchestrationEvents.emit('schedule:resumed', { id: params.id, schedule });

    return { id: params.id, state: schedule.state, nextRun: schedule.nextRun };
  },

  /**
   * List schedules
   * @param {Object} params
   * @param {string} [params.state] - Filter by state
   * @param {number} [params.limit=50] - Maximum results
   * @returns {Promise<Object[]>} Schedule list
   */
  'orchestration.schedule.list': async (params) => {
    let schedules = Array.from(scheduleStore.values());

    if (params.state) {
      schedules = schedules.filter(s => s.state === params.state);
    }

    const limit = params.limit || 50;
    schedules = schedules.slice(0, limit);

    return schedules.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      state: s.state,
      nextRun: s.nextRun,
      lastRun: s.lastRun,
      runCount: s.runCount,
      createdAt: s.createdAt,
    }));
  },

  /**
   * Register a route
   * @param {Object} params
   * @param {string} params.name - Route name
   * @param {string} params.pattern - Route pattern
   * @param {string} params.target - Target handler
   * @param {Object} [params.config] - Route configuration
   * @returns {Promise<Object>} Registered route
   */
  'orchestration.route.register': async (params) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const route = {
      id,
      name: params.name,
      pattern: params.pattern,
      target: params.target,
      config: params.config || {},
      active: true,
      matchCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    routeRegistry.set(id, route);
    orchestrationEvents.emit('route:registered', { id, route });

    return {
      id,
      name: route.name,
      pattern: route.pattern,
      target: route.target,
      active: route.active,
      createdAt: route.createdAt,
    };
  },

  /**
   * Unregister a route
   * @param {Object} params
   * @param {string} params.id - Route ID
   * @returns {Promise<Object>} Unregistration result
   */
  'orchestration.route.unregister': async (params) => {
    const route = routeRegistry.get(params.id);
    if (!route) {
      throw new Error(`Route '${params.id}' not found`);
    }

    routeRegistry.delete(params.id);
    orchestrationEvents.emit('route:unregistered', { id: params.id });

    return { id: params.id, unregistered: true };
  },

  /**
   * List routes
   * @param {Object} params
   * @param {boolean} [params.active] - Filter by active status
   * @returns {Promise<Object[]>} Route list
   */
  'orchestration.route.list': async (params) => {
    let routes = Array.from(routeRegistry.values());

    if (params.active !== undefined) {
      routes = routes.filter(r => r.active === params.active);
    }

    return routes.map(r => ({
      id: r.id,
      name: r.name,
      pattern: r.pattern,
      target: r.target,
      active: r.active,
      matchCount: r.matchCount,
      createdAt: r.createdAt,
    }));
  },

  /**
   * Route a request
   * @param {Object} params
   * @param {string} params.path - Request path
   * @param {Object} [params.context] - Request context
   * @returns {Promise<Object>} Routing result
   */
  'orchestration.route': async (params) => {
    const path = params.path;
    const context = params.context || {};

    // Find matching route
    const routes = Array.from(routeRegistry.values())
      .filter(r => r.active)
      .sort((a, b) => (b.config.priority || 0) - (a.config.priority || 0));

    for (const route of routes) {
      const match = matchRoute(path, route.pattern);
      if (match) {
        route.matchCount++;
        orchestrationEvents.emit('route:matched', { route, path, context });
        
        return {
          matched: true,
          route: {
            id: route.id,
            name: route.name,
            target: route.target,
          },
          params: match,
          context,
        };
      }
    }

    return { matched: false, path };
  },

  /**
   * Trigger immediate execution
   * @param {Object} params
   * @param {string} params.task - Task to execute
   * @param {Object} [params.params] - Task parameters
   * @returns {Promise<Object>} Execution result
   */
  'orchestration.trigger': async (params) => {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();

    orchestrationEvents.emit('trigger:started', { 
      id: executionId, 
      task: params.task,
      params: params.params,
    });

    try {
      // In a real implementation, this would execute the task
      const result = {
        executed: true,
        task: params.task,
        duration: Date.now() - startTime,
      };

      orchestrationEvents.emit('trigger:completed', { id: executionId, result });

      return {
        id: executionId,
        task: params.task,
        status: 'completed',
        result,
      };
    } catch (error) {
      orchestrationEvents.emit('trigger:failed', { id: executionId, error });
      throw error;
    }
  },
};

/**
 * Calculate next run time
 * @private
 * @param {Object} schedule - Schedule definition
 * @returns {string|null} ISO timestamp or null
 */
function calculateNextRun(schedule) {
  const now = Date.now();

  switch (schedule.type) {
    case ScheduleType.ONCE:
      return schedule.at;
    
    case ScheduleType.INTERVAL:
      return new Date(now + schedule.interval).toISOString();
    
    case ScheduleType.CRON:
      // Simplified: would use a cron parser in production
      return new Date(now + 60000).toISOString();
    
    case ScheduleType.EVENT:
      return null;
    
    default:
      return null;
  }
}

/**
 * Activate a schedule
 * @private
 * @param {string} id - Schedule ID
 */
function activateSchedule(id) {
  const schedule = scheduleStore.get(id);
  if (!schedule || schedule.state !== ScheduleState.PENDING) return;

  if (!schedule.nextRun) return;

  const nextRunTime = new Date(schedule.nextRun).getTime();
  const delay = Math.max(0, nextRunTime - Date.now());

  const timer = setTimeout(() => executeSchedule(id), delay);
  activeTimers.set(id, timer);
}

/**
 * Execute a scheduled task
 * @private
 * @param {string} id - Schedule ID
 */
async function executeSchedule(id) {
  const schedule = scheduleStore.get(id);
  if (!schedule) return;

  schedule.state = ScheduleState.RUNNING;
  schedule.lastRun = new Date().toISOString();
  schedule.runCount++;

  orchestrationEvents.emit('schedule:executing', { id, schedule });

  try {
    // In a real implementation, this would execute the actual task
    await new Promise(resolve => setTimeout(resolve, 100));

    if (schedule.maxRuns && schedule.runCount >= schedule.maxRuns) {
      schedule.state = ScheduleState.COMPLETED;
      orchestrationEvents.emit('schedule:completed', { id, schedule });
    } else if (schedule.type === ScheduleType.INTERVAL) {
      schedule.state = ScheduleState.PENDING;
      schedule.nextRun = calculateNextRun(schedule);
      activateSchedule(id);
    } else if (schedule.type === ScheduleType.ONCE) {
      schedule.state = ScheduleState.COMPLETED;
      orchestrationEvents.emit('schedule:completed', { id, schedule });
    } else {
      schedule.state = ScheduleState.PENDING;
      schedule.nextRun = calculateNextRun(schedule);
      activateSchedule(id);
    }
  } catch (error) {
    schedule.state = ScheduleState.FAILED;
    schedule.error = error.message;
    orchestrationEvents.emit('schedule:failed', { id, schedule, error });
  }
}

/**
 * Match route pattern
 * @private
 * @param {string} path - Request path
 * @param {string} pattern - Route pattern
 * @returns {Object|null} Match result or null
 */
function matchRoute(path, pattern) {
  // Simple pattern matching
  // In production, this would use a proper routing library
  
  const regex = new RegExp(
    '^' + pattern
      .replace(/\*/g, '.*')
      .replace(/:([^/]+)/g, '(?<$1>[^/]+)') + '$'
  );

  const match = path.match(regex);
  if (match) {
    return match.groups || {};
  }

  return null;
}

/**
 * Schemas for orchestration tools
 * @const {Object}
 */
export const orchestrationSchemas = {
  'orchestration.schedule': z.object({
    name: z.string().min(1).max(256),
    type: z.enum(Object.values(ScheduleType)),
    cron: z.string().optional(),
    interval: z.number().int().min(1000).optional(),
    at: z.string().datetime().optional(),
    task: z.string().min(1).max(256),
    params: z.record(z.any()).optional(),
    maxRuns: z.number().int().min(1).optional(),
  }).refine(data => {
    if (data.type === ScheduleType.CRON && !data.cron) return false;
    if (data.type === ScheduleType.INTERVAL && !data.interval) return false;
    if (data.type === ScheduleType.ONCE && !data.at) return false;
    return true;
  }, {
    message: 'Missing required field for schedule type',
  }),

  'orchestration.schedule.cancel': z.object({
    id: z.string().uuid(),
  }),

  'orchestration.schedule.pause': z.object({
    id: z.string().uuid(),
  }),

  'orchestration.schedule.resume': z.object({
    id: z.string().uuid(),
  }),

  'orchestration.schedule.list': z.object({
    state: z.enum(Object.values(ScheduleState)).optional(),
    limit: z.number().int().min(1).max(1000).default(50),
  }),

  'orchestration.route.register': z.object({
    name: z.string().min(1).max(256),
    pattern: z.string().min(1),
    target: z.string().min(1).max(256),
    config: z.object({
      priority: z.number().int().optional(),
      methods: z.array(z.string()).optional(),
    }).optional(),
  }),

  'orchestration.route.unregister': z.object({
    id: z.string().uuid(),
  }),

  'orchestration.route.list': z.object({
    active: z.boolean().optional(),
  }),

  'orchestration.route': z.object({
    path: z.string().min(1),
    context: z.record(z.any()).optional(),
  }),

  'orchestration.trigger': z.object({
    task: z.string().min(1).max(256),
    params: z.record(z.any()).optional(),
  }),
};

/**
 * Descriptions for orchestration tools
 * @const {Object}
 */
export const orchestrationDescriptions = {
  'orchestration.schedule': 'Schedule a task for execution',
  'orchestration.schedule.cancel': 'Cancel a schedule',
  'orchestration.schedule.pause': 'Pause a schedule',
  'orchestration.schedule.resume': 'Resume a paused schedule',
  'orchestration.schedule.list': 'List schedules',
  'orchestration.route.register': 'Register a route',
  'orchestration.route.unregister': 'Unregister a route',
  'orchestration.route.list': 'List routes',
  'orchestration.route': 'Route a request',
  'orchestration.trigger': 'Trigger immediate execution',
};

/**
 * Tags for orchestration tools
 * @const {Object}
 */
export const orchestrationTags = {
  'orchestration.schedule': ['orchestration', 'schedule', 'create'],
  'orchestration.schedule.cancel': ['orchestration', 'schedule', 'cancel'],
  'orchestration.schedule.pause': ['orchestration', 'schedule', 'control'],
  'orchestration.schedule.resume': ['orchestration', 'schedule', 'control'],
  'orchestration.schedule.list': ['orchestration', 'schedule', 'query'],
  'orchestration.route.register': ['orchestration', 'route', 'create'],
  'orchestration.route.unregister': ['orchestration', 'route', 'delete'],
  'orchestration.route.list': ['orchestration', 'route', 'query'],
  'orchestration.route': ['orchestration', 'route'],
  'orchestration.trigger': ['orchestration', 'trigger'],
};

export { scheduleStore, routeRegistry, orchestrationEvents };
export default orchestrationTools;
