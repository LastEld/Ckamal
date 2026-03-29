/**
 * @fileoverview Ckamal Plugin SDK
 * The main SDK surface for plugin authors.
 * Provides the definePlugin factory and runtime utilities.
 * 
 * @module plugins/plugin-sdk
 * @see plugin-sdk-design.md
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';

// ============================================================================
// Types (JSDoc for type checking)
// ============================================================================

/**
 * @typedef {Object} PluginManifest
 * @property {number} apiVersion - Plugin API version
 * @property {string} id - Unique plugin identifier
 * @property {string} version - Semver version
 * @property {string} name - Human-readable name
 * @property {string} description - Plugin description
 * @property {Object} entrypoints - Entry point paths
 * @property {string} [entrypoints.worker] - Worker entry point
 * @property {string} [entrypoints.ui] - UI bundle entry point
 * @property {string[]} capabilities - Required capabilities
 * @property {ToolDeclaration[]} [tools] - Tool declarations
 * @property {EventsDeclaration} [events] - Event subscriptions
 * @property {UiSlotDeclaration[]} [uiSlots] - UI slot declarations
 * @property {Object} [configSchema] - Configuration JSON schema
 */

/**
 * @typedef {Object} ToolDeclaration
 * @property {string} name - Tool name (unique within plugin)
 * @property {string} displayName - Human-readable name
 * @property {string} description - Tool description
 * @property {Object} parametersSchema - JSON schema for parameters
 */

/**
 * @typedef {Object} ScopeKey
 * @property {('instance'|'project'|'task'|'conversation'|'user')} scopeKind - Scope type
 * @property {string} [scopeId] - ID within scope
 * @property {string} [namespace='default'] - Namespace within scope
 * @property {string} stateKey - The state key
 */

/**
 * @typedef {Object} PluginEvent
 * @property {string} eventId - UUID
 * @property {string} eventType - Event type name
 * @property {string} occurredAt - ISO 8601 timestamp
 * @property {string} [actorId] - Actor who caused the event
 * @property {('user'|'agent'|'system'|'plugin')} [actorType] - Actor type
 * @property {string} [entityId] - Primary entity ID
 * @property {string} [entityType] - Entity type
 * @property {unknown} payload - Event payload
 */

/**
 * @typedef {Object} ToolRunContext
 * @property {string} agentId - Invoking agent ID
 * @property {string} runId - Current run ID
 * @property {string} projectId - Project scope
 * @property {string} userId - Authenticated user ID
 * @property {string} [conversationId] - Optional conversation context
 */

/**
 * @typedef {Object} ToolResult
 * @property {string} [content] - Primary output
 * @property {unknown} [data] - Structured data
 * @property {string} [error] - Error message
 * @property {Array<{type: string, name: string, content: string}>} [artifacts] - Attachments
 */

// ============================================================================
// Constants
// ============================================================================

export const PLUGIN_API_VERSION = 1;

export const PLUGIN_CAPABILITIES = Object.freeze([
  'tools.register',
  'state.read',
  'state.write',
  'events.subscribe',
  'events.emit',
  'http.outbound',
  'tasks.read',
  'tasks.write',
  'conversations.read',
  'conversations.write',
  'roadmaps.read',
  'roadmaps.write',
  'system.metrics',
  'system.logs.read'
]);

export const PLUGIN_STATUSES = Object.freeze({
  INSTALLED: 'installed',
  REGISTERED: 'registered',
  LOADING: 'loading',
  INITIALIZING: 'initializing',
  ACTIVE: 'active',
  UPDATING: 'updating',
  FAILED: 'failed',
  UNLOADING: 'unloading',
  TERMINATED: 'terminated'
});

// ============================================================================
// Plugin Definition
// ============================================================================

/**
 * Plugin health diagnostics result
 * @typedef {Object} HealthDiagnostics
 * @property {('ok'|'degraded'|'error')} status - Health status
 * @property {string} [message] - Human-readable description
 * @property {Object} [details] - Additional diagnostics
 */

/**
 * Plugin definition shape
 * @typedef {Object} PluginDefinition
 * @property {(ctx: PluginContext) => Promise<void>} setup - Setup function
 * @property {() => Promise<HealthDiagnostics>} [onHealth] - Health check handler
 * @property {(config: Record<string, unknown>) => Promise<void>} [onConfigChanged] - Config change handler
 * @property {() => Promise<void>} [onShutdown] - Shutdown handler
 * @property {(config: Record<string, unknown>) => Promise<{ok: boolean, errors?: string[]}>} [onValidateConfig] - Config validator
 */

/**
 * Sealed plugin object
 * @typedef {Object} CkamalPlugin
 * @property {PluginDefinition} definition - Original definition
 * @property {string} [id] - Assigned plugin ID
 * @property {string} [instanceId] - Runtime instance ID
 */

/**
 * Define a Ckamal plugin
 * 
 * @param {PluginDefinition} definition - Plugin lifecycle handlers
 * @returns {CkamalPlugin} Sealed plugin object
 * 
 * @example
 * ```javascript
 * import { definePlugin } from '@ckamal/plugin-sdk';
 * 
 * export default definePlugin({
 *   async setup(ctx) {
 *     ctx.logger.info('Plugin starting...');
 *     
 *     ctx.tools.register('myTool', {
 *       displayName: 'My Tool',
 *       description: 'Does something useful',
 *       parametersSchema: { type: 'object', properties: {} }
 *     }, async (params, runCtx) => {
 *       return { content: 'Result!' };
 *     });
 *   },
 *   
 *   async onHealth() {
 *     return { status: 'ok' };
 *   }
 * });
 * ```
 */
export function definePlugin(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('Plugin definition must be an object');
  }
  
  if (typeof definition.setup !== 'function') {
    throw new TypeError('Plugin definition must have a setup function');
  }
  
  return Object.freeze({
    definition: Object.freeze(definition)
  });
}

// ============================================================================
// Plugin Context (created by host)
// ============================================================================

/**
 * Create a plugin context
 * This is called by the host to create the context passed to plugin.setup()
 * 
 * @param {Object} options - Context options
 * @param {PluginManifest} options.manifest - Plugin manifest
 * @param {Object} options.config - Resolved configuration
 * @param {Object} options.hostRpc - Host RPC client
 * @param {string} options.instanceId - Runtime instance ID
 * @returns {PluginContext}
 */
export function createPluginContext(options) {
  const { manifest, config, hostRpc, instanceId } = options;
  
  // Event handlers registry
  const eventHandlers = new Map();
  const toolHandlers = new Map();
  const dataHandlers = new Map();
  const actionHandlers = new Map();
  
  // Internal event emitter for plugin-local events
  const localEvents = new EventEmitter();
  localEvents.setMaxListeners(100);
  
  /**
   * @type {PluginContext}
   */
  const context = {
    // Identity
    get manifest() {
      return manifest;
    },
    
    get instanceId() {
      return instanceId;
    },
    
    // Configuration
    config: {
      /**
       * Get current configuration
       * @returns {Promise<Record<string, unknown>>}
       */
      async get() {
        return hostRpc.call('config.get');
      }
    },
    
    // State management
    state: {
      /**
       * Get state value
       * @param {ScopeKey} key - State key
       * @returns {Promise<unknown>}
       */
      async get(key) {
        return hostRpc.call('state.get', {
          scopeKind: key.scopeKind,
          scopeId: key.scopeId,
          namespace: key.namespace ?? 'default',
          stateKey: key.stateKey
        });
      },
      
      /**
       * Set state value
       * @param {ScopeKey} key - State key
       * @param {unknown} value - Value to store
       * @returns {Promise<void>}
       */
      async set(key, value) {
        return hostRpc.call('state.set', {
          scopeKind: key.scopeKind,
          scopeId: key.scopeId,
          namespace: key.namespace ?? 'default',
          stateKey: key.stateKey,
          value
        });
      },
      
      /**
       * Delete state value
       * @param {ScopeKey} key - State key
       * @returns {Promise<void>}
       */
      async delete(key) {
        return hostRpc.call('state.delete', {
          scopeKind: key.scopeKind,
          scopeId: key.scopeId,
          namespace: key.namespace ?? 'default',
          stateKey: key.stateKey
        });
      }
    },
    
    // Events
    events: {
      /**
       * Subscribe to events
       * @param {string} pattern - Event pattern (e.g., 'task.created' or 'plugin.*')
       * @param {Object|Function} filterOrHandler - Filter object or handler function
       * @param {Function} [handler] - Event handler if filter provided
       * @returns {Function} Unsubscribe function
       */
      on(pattern, filterOrHandler, handler) {
        const filter = typeof filterOrHandler === 'object' ? filterOrHandler : null;
        const fn = typeof filterOrHandler === 'function' ? filterOrHandler : handler;
        
        if (typeof fn !== 'function') {
          throw new TypeError('Event handler must be a function');
        }
        
        // Validate pattern format
        if (typeof pattern !== 'string' || pattern.length === 0) {
          throw new TypeError('Event pattern must be a non-empty string');
        }
        
        // Register with host - await to ensure subscription is established
        const subscribePromise = hostRpc.call('events.subscribe', { pattern, filter }).catch(err => {
          context.logger.warn('Failed to subscribe to event', { pattern, error: err.message });
        });
        
        // Store handler locally with isolation
        const handlers = eventHandlers.get(pattern) || [];
        const registration = { 
          pattern, 
          filter, 
          fn,
          pluginId: manifest.id,  // Track plugin ID for isolation
          handlerId: `${manifest.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` // Unique handler ID
        };
        handlers.push(registration);
        eventHandlers.set(pattern, handlers);
        
        // Return unsubscribe function
        return async () => {
          const handlers = eventHandlers.get(pattern) || [];
          const index = handlers.findIndex(h => h.handlerId === registration.handlerId);
          if (index > -1) {
            handlers.splice(index, 1);
          }
          
          // Unsubscribe from host if no more handlers for this pattern
          if (handlers.length === 0) {
            try {
              await hostRpc.call('events.unsubscribe', { pattern });
            } catch (err) {
              context.logger.debug('Failed to unsubscribe from event', { pattern, error: err.message });
            }
          }
        };
      },
      
      /**
       * Emit a plugin event
       * @param {string} name - Event name (will be namespaced as plugin.{id}.{name})
       * @param {unknown} payload - Event payload
       * @returns {Promise<void>}
       */
      async emit(name, payload) {
        // Validate event name
        if (typeof name !== 'string' || name.length === 0) {
          throw new TypeError('Event name must be a non-empty string');
        }
        
        // Namespace the event with plugin ID for isolation
        const namespacedName = name.startsWith('plugin.') ? name : `plugin.${manifest.id}.${name}`;
        
        // Add plugin context to payload for tracing
        const enrichedPayload = {
          ...((payload && typeof payload === 'object') ? payload : { data: payload }),
          _pluginContext: {
            pluginId: manifest.id,
            pluginVersion: manifest.version,
            instanceId,
            emittedAt: new Date().toISOString()
          }
        };
        
        return hostRpc.call('events.emit', { name: namespacedName, payload: enrichedPayload });
      }
    },
    
    // Tool registration
    tools: {
      /**
       * Register a tool
       * @param {string} name - Tool name
       * @param {ToolDeclaration} declaration - Tool declaration
       * @param {Function} handler - Tool handler
       */
      register(name, declaration, handler) {
        // Validate tool name
        if (typeof name !== 'string' || name.length === 0) {
          throw new TypeError('Tool name must be a non-empty string');
        }
        
        // Validate tool name format (no spaces, special chars)
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
          throw new TypeError('Tool name must contain only letters, numbers, underscores, and hyphens');
        }
        
        if (typeof handler !== 'function') {
          throw new TypeError('Tool handler must be a function');
        }
        
        // Namespace tool name with plugin ID for isolation
        const namespacedName = `${manifest.id}.${name}`;
        
        // Store with namespaced name to prevent collisions
        toolHandlers.set(name, { 
          declaration, 
          handler,
          pluginId: manifest.id,
          registeredAt: new Date().toISOString()
        });
        
        // Notify host of registration with namespaced name
        hostRpc.call('tools.register', {
          name: namespacedName,
          declaration: {
            displayName: declaration.displayName || name,
            description: declaration.description || '',
            parametersSchema: declaration.parametersSchema || { type: 'object', properties: {} }
          }
        }).catch(err => {
          context.logger.error('Failed to register tool', { name: namespacedName, error: err.message });
        });
      },
      
      /**
       * Get registered tool handler (called by host)
       * @param {string} name - Tool name
       * @returns {{declaration: ToolDeclaration, handler: Function}|undefined}
       */
      _getHandler(name) {
        return toolHandlers.get(name);
      }
    },
    
    // Data/Action handlers for UI bridge
    data: {
      /**
       * Register a data handler
       * @param {string} key - Data key
       * @param {Function} handler - Data handler
       */
      register(key, handler) {
        dataHandlers.set(key, handler);
      },
      
      /**
       * Get data handler (called by host)
       * @param {string} key - Data key
       * @returns {Function|undefined}
       */
      _getHandler(key) {
        return dataHandlers.get(key);
      }
    },
    
    actions: {
      /**
       * Register an action handler
       * @param {string} key - Action key
       * @param {Function} handler - Action handler
       */
      register(key, handler) {
        actionHandlers.set(key, handler);
      },
      
      /**
       * Get action handler (called by host)
       * @param {string} key - Action key
       * @returns {Function|undefined}
       */
      _getHandler(key) {
        return actionHandlers.get(key);
      }
    },
    
    // HTTP client (proxied through host)
    http: {
      /**
       * Make HTTP request (proxied through host for audit)
       * @param {string} url - Request URL
       * @param {RequestInit} [init] - Request init
       * @returns {Promise<Response>}
       */
      async fetch(url, init) {
        const result = await hostRpc.call('http.fetch', { url, init });
        
        // Reconstruct Response-like object
        return {
          ok: result.status >= 200 && result.status < 300,
          status: result.status,
          statusText: result.statusText,
          headers: new Map(Object.entries(result.headers)),
          async text() { return result.body; },
          async json() { return JSON.parse(result.body); }
        };
      }
    },
    
    // Logging
    logger: {
      /**
       * Log info message
       * @param {string} message - Log message
       * @param {Object} [meta] - Metadata
       */
      info(message, meta) {
        hostRpc.notify('log', { level: 'info', message, meta, timestamp: new Date().toISOString() });
      },
      
      /**
       * Log warning message
       * @param {string} message - Log message
       * @param {Object} [meta] - Metadata
       */
      warn(message, meta) {
        hostRpc.notify('log', { level: 'warn', message, meta, timestamp: new Date().toISOString() });
      },
      
      /**
       * Log error message
       * @param {string} message - Log message
       * @param {Object} [meta] - Metadata
       */
      error(message, meta) {
        hostRpc.notify('log', { level: 'error', message, meta, timestamp: new Date().toISOString() });
      },
      
      /**
       * Log debug message
       * @param {string} message - Log message
       * @param {Object} [meta] - Metadata
       */
      debug(message, meta) {
        hostRpc.notify('log', { level: 'debug', message, meta, timestamp: new Date().toISOString() });
      }
    },
    
    // Internal: dispatch event to handlers
    _dispatchEvent(event) {
      for (const [pattern, handlers] of eventHandlers) {
        // Check if event matches pattern
        if (matchesPattern(event.eventType, pattern)) {
          for (const registration of handlers) {
            // Check filter if provided
            if (registration.filter && !matchesFilter(event, registration.filter)) {
              continue;
            }
            
            // Call handler (fire and forget, errors caught by host)
            registration.fn(event).catch(err => {
              context.logger.error('Event handler error', { 
                eventType: event.eventType, 
                error: err.message 
              });
            });
          }
        }
      }
    }
  };
  
  return context;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if event type matches pattern
 * @param {string} eventType - Event type
 * @param {string} pattern - Pattern (supports wildcards)
 * @returns {boolean}
 */
function matchesPattern(eventType, pattern) {
  if (pattern === eventType) return true;
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1);
    return eventType.startsWith(prefix);
  }
  return false;
}

/**
 * Check if event matches filter
 * @param {PluginEvent} event - Event
 * @param {Object} filter - Filter object
 * @returns {boolean}
 */
function matchesFilter(event, filter) {
  for (const [key, value] of Object.entries(filter)) {
    if (key === 'projectId' && event.projectId !== value) return false;
    if (key === 'entityType' && event.entityType !== value) return false;
    if (key === 'entityId' && event.entityId !== value) return false;
    // Custom filter fields
    if (event.payload && typeof event.payload === 'object') {
      if (event.payload[key] !== value) return false;
    }
  }
  return true;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate plugin manifest
 * @param {unknown} manifest - Manifest to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateManifest(manifest) {
  const errors = [];
  
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }
  
  // Required fields
  const required = ['apiVersion', 'id', 'version', 'name', 'description', 'entrypoints', 'capabilities'];
  for (const field of required) {
    if (!(field in manifest)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate apiVersion
  if (manifest.apiVersion !== PLUGIN_API_VERSION) {
    errors.push(`Unsupported apiVersion: ${manifest.apiVersion}. Expected: ${PLUGIN_API_VERSION}`);
  }
  
  // Validate ID format (scoped like @org/name or unscoped like name)
  if (manifest.id && !/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(manifest.id)) {
    errors.push('Invalid plugin ID format');
  }
  
  // Validate version is semver-like
  if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('Version must follow semver format (x.y.z)');
  }
  
  // Validate entrypoints
  if (manifest.entrypoints) {
    if (typeof manifest.entrypoints !== 'object') {
      errors.push('entrypoints must be an object');
    } else if (!manifest.entrypoints.worker) {
      errors.push('entrypoints.worker is required');
    }
  }
  
  // Validate capabilities
  if (manifest.capabilities) {
    if (!Array.isArray(manifest.capabilities)) {
      errors.push('capabilities must be an array');
    } else {
      const invalid = manifest.capabilities.filter(c => !PLUGIN_CAPABILITIES.includes(c));
      if (invalid.length > 0) {
        errors.push(`Invalid capabilities: ${invalid.join(', ')}`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Calculate manifest hash for integrity checks
 * @param {PluginManifest} manifest - Manifest
 * @returns {string} SHA-256 hash
 */
export function hashManifest(manifest) {
  const content = JSON.stringify(manifest, Object.keys(manifest).sort());
  return createHash('sha256').update(content).digest('hex');
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  definePlugin,
  createPluginContext,
  validateManifest,
  hashManifest,
  PLUGIN_API_VERSION,
  PLUGIN_CAPABILITIES,
  PLUGIN_STATUSES
};
