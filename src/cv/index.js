/**
 * CV (Curriculum Vitae) System for CogniMesh v5.0
 * 
 * A comprehensive system for managing agent CVs, enforcing rights at runtime,
 * monitoring obligations, and creating agents from templates.
 * 
 * @module cv
 */

import { CVRegistry } from './registry.js';
import { RightsEngine, TimeBasedPolicy, RateLimitPolicy } from './engine.js';
import { ObligationsMonitor } from './obligations.js';
import { CVFactory, createAgentCV } from './factory.js';
import { CVManager } from './manager.js';
import {
  CVSchema,
  RightsSchema,
  ObligationsSchema,
  validateCV,
  validatePartialCV,
  validateRights,
  validateObligations,
  createDefaultCV,
  sanitizeCV,
  diffCVs,
  mergeCVs
} from './schema.js';

// Core Components
export { CVRegistry } from './registry.js';
export { RightsEngine } from './engine.js';
export { ObligationsMonitor } from './obligations.js';
export { CVFactory } from './factory.js';
export { CVManager } from './manager.js';

// Schema and Validation
export {
  CVSchema,
  RightsSchema,
  ObligationsSchema,
  validateCV,
  validatePartialCV,
  validateRights,
  validateObligations,
  createDefaultCV,
  sanitizeCV,
  diffCVs,
  mergeCVs
} from './schema.js';

// Predefined Policies
export { TimeBasedPolicy, RateLimitPolicy } from './engine.js';

// Convenience Functions
export { createAgentCV } from './factory.js';

/**
 * Create a fully configured CV system instance
 * @param {Object} options - Configuration options
 * @returns {Object} - Configured CV system
 */
export function createCVSystem(options = {}) {
  // Create components
  const registry = options.registry || new CVRegistry(options.registryOptions);
  const factory = options.factory || new CVFactory(registry, options.factoryOptions);
  const rightsEngine = options.rightsEngine || new RightsEngine(options.rightsOptions);
  const obligationsMonitor = options.obligationsMonitor || new ObligationsMonitor(options.obligationsOptions);
  
  // Create manager
  const manager = new CVManager({
    registry,
    factory,
    rightsEngine,
    obligationsMonitor,
    ...options.managerOptions
  });
  
  return {
    registry,
    factory,
    rightsEngine,
    obligationsMonitor,
    manager,
    
    /**
     * Initialize the CV system
     */
    async initialize() {
      // Load templates from filesystem
      const templates = [
        'system-admin',
        'code-reviewer',
        'developer',
        'test-agent',
        'analyst'
      ];
      
      for (const templateName of templates) {
        try {
          factory.loadTemplate(templateName, 'yaml');
        } catch (error) {
          console.warn(`Failed to load template '${templateName}': ${error.message}`);
        }
      }
      
      return this;
    },
    
    /**
     * Create an agent with full lifecycle management
     * @param {string} templateName - Template to use
     * @param {Object} overrides - Property overrides
     * @returns {Object} - Created agent CV
     */
    async createAgent(templateName, overrides = {}) {
      // Create CV from template
      const cv = factory.createFromTemplate(templateName, overrides, {
        autoRegister: true
      });
      
      // Activate the CV
      await manager.activate(cv.identity.id);
      
      // Register with obligations monitor
      obligationsMonitor.register(cv.identity.id, cv);
      
      return cv;
    },
    
    /**
     * Spawn an agent for task execution
     * @param {string} cvId - CV ID
     * @param {Object} context - Execution context
     * @returns {Object} - Agent instance
     */
    async spawnAgent(cvId, context = {}) {
      const cv = registry.get(cvId);
      if (!cv) {
        throw new Error(`CV '${cvId}' not found`);
      }
      
      // Check if CV is active
      if (cv.lifecycle?.status !== 'active') {
        throw new Error(`CV '${cvId}' is not active (status: ${cv.lifecycle?.status})`);
      }
      
      // Validate rights
      const rightsCheck = rightsEngine.validate(cv.rights || {});
      if (!rightsCheck.valid) {
        throw new Error(`Invalid rights configuration: ${rightsCheck.errors.join(', ')}`);
      }
      
      // Create agent instance
      const agent = {
        id: `${cvId}-${Date.now()}`,
        cvId,
        cv,
        context,
        spawnedAt: Date.now(),
        
        /**
         * Check if agent has permission for action
         */
        async hasPermission(action, resource, ctx = {}) {
          return rightsEngine.check({
            cv,
            action,
            resource,
            context: { ...context, ...ctx }
          });
        },
        
        /**
         * Execute with permission check
         */
        async execute(action, resource, fn, ctx = {}) {
          await rightsEngine.require({
            cv,
            action,
            resource,
            context: { ...context, ...ctx }
          });
          
          // Track execution
          obligationsMonitor.recordTaskStart(this.id, { id: action });
          
          try {
            const result = await fn();
            obligationsMonitor.recordTaskComplete(this.id, { success: true });
            return result;
          } catch (error) {
            obligationsMonitor.recordTaskFailure(this.id, error);
            throw error;
          }
        },
        
        /**
         * Get compliance status
         */
        getCompliance() {
          return obligationsMonitor.checkCompliance(cvId);
        },
        
        /**
         * Terminate agent
         */
        terminate() {
          // Final compliance check
          const compliance = obligationsMonitor.checkCompliance(cvId);
          
          // Unregister
          obligationsMonitor.unregister(this.id);
          
          return { terminated: true, compliance };
        }
      };
      
      return agent;
    },
    
    /**
     * Get system health
     * @returns {Object} - Health status
     */
    getHealth() {
      const registryStats = registry.getStats();
      const rightsStats = rightsEngine.getStats();
      const obligationsStats = obligationsMonitor.getStats();
      
      return {
        status: 'healthy',
        timestamp: Date.now(),
        components: {
          registry: {
            status: 'healthy',
            totalCVs: registryStats.total,
            byStatus: registryStats.byStatus
          },
          rightsEngine: {
            status: 'healthy',
            totalChecks: rightsStats.totalChecks,
            cacheHitRate: rightsStats.totalChecks > 0 
              ? rightsStats.cacheHits / rightsStats.totalChecks 
              : 0
          },
          obligationsMonitor: {
            status: 'healthy',
            activeMonitors: obligationsStats.activeMonitors,
            totalViolations: obligationsStats.totalViolations
          }
        }
      };
    },
    
    /**
     * Dispose the system
     */
    async dispose() {
      obligationsMonitor.stop();
      // Clear caches
      rightsEngine.clearCache();
    }
  };
}

/**
 * Quick start - Create a CV system with default configuration
 * @returns {Promise<Object>} - Configured CV system
 */
export async function quickStart() {
  const system = createCVSystem();
  await system.initialize();
  return system;
}

// Default export
export default {
  CVRegistry,
  RightsEngine,
  ObligationsMonitor,
  CVFactory,
  CVManager,
  createCVSystem,
  quickStart
};
