/**
 * @fileoverview Agent Type Definitions
 * @module agents/types
 */

/**
 * Agent types enum
 * @readonly
 * @enum {string}
 */
export const AgentType = {
  SYSTEM: 'SYSTEM',
  CODING: 'CODING',
  ANALYSIS: 'ANALYSIS',
  REVIEW: 'REVIEW',
  TEST: 'TEST'
};

/**
 * Agent lifecycle states
 * @readonly
 * @enum {string}
 */
export const AgentLifecycleState = {
  SPAWNING: 'SPAWNING',
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  SHUTTING_DOWN: 'SHUTTING_DOWN',
  DESTROYED: 'DESTROYED',
  ERROR: 'ERROR'
};

/**
 * Agent type configurations
 * @type {Object.<string, AgentTypeConfig>}
 */
export const AgentTypeConfigs = {
  [AgentType.SYSTEM]: {
    name: AgentType.SYSTEM,
    description: 'System management and coordination agent',
    capabilities: {
      canExecuteTasks: true,
      canCoordinate: true,
      canSpecialize: true,
      specializations: ['system', 'coordination', 'monitoring']
    },
    resources: {
      cpu: 1,
      memory: 512
    },
    maxConcurrentTasks: 10,
    defaultTimeout: 60000,
    heartbeatInterval: 3000,
    maxRetries: 5,
    priority: 10
  },
  [AgentType.CODING]: {
    name: AgentType.CODING,
    description: 'Code development and implementation agent',
    capabilities: {
      canExecuteTasks: true,
      canCoordinate: false,
      canSpecialize: true,
      specializations: ['coding', 'development', 'implementation', 'refactoring']
    },
    resources: {
      cpu: 2,
      memory: 2048,
      storage: 1024
    },
    maxConcurrentTasks: 3,
    defaultTimeout: 300000,
    heartbeatInterval: 10000,
    maxRetries: 2,
    priority: 5
  },
  [AgentType.ANALYSIS]: {
    name: AgentType.ANALYSIS,
    description: 'Code and data analysis agent',
    capabilities: {
      canExecuteTasks: true,
      canCoordinate: false,
      canSpecialize: true,
      specializations: ['analysis', 'research', 'investigation', 'debugging']
    },
    resources: {
      cpu: 2,
      memory: 1536
    },
    maxConcurrentTasks: 5,
    defaultTimeout: 180000,
    heartbeatInterval: 8000,
    maxRetries: 3,
    priority: 6
  },
  [AgentType.REVIEW]: {
    name: AgentType.REVIEW,
    description: 'Code review and quality assurance agent',
    capabilities: {
      canExecuteTasks: true,
      canCoordinate: false,
      canSpecialize: true,
      specializations: ['review', 'audit', 'quality', 'validation']
    },
    resources: {
      cpu: 1,
      memory: 1024
    },
    maxConcurrentTasks: 4,
    defaultTimeout: 120000,
    heartbeatInterval: 10000,
    maxRetries: 2,
    priority: 4
  },
  [AgentType.TEST]: {
    name: AgentType.TEST,
    description: 'Testing and verification agent',
    capabilities: {
      canExecuteTasks: true,
      canCoordinate: false,
      canSpecialize: true,
      specializations: ['testing', 'verification', 'validation', 'e2e']
    },
    resources: {
      cpu: 2,
      memory: 2048,
      storage: 512
    },
    maxConcurrentTasks: 3,
    defaultTimeout: 300000,
    heartbeatInterval: 10000,
    maxRetries: 2,
    priority: 5
  }
};

/**
 * Get agent type configuration
 * @param {string} type - Agent type
 * @returns {AgentTypeConfig|null} Agent type configuration
 */
export function getAgentTypeConfig(type) {
  return AgentTypeConfigs[type] || null;
}

/**
 * Check if agent type can handle a task
 * @param {string} agentType - Agent type
 * @param {string} taskType - Task type to check
 * @returns {boolean} Whether the agent can handle the task
 */
export function canHandleTask(agentType, taskType) {
  const config = getAgentTypeConfig(agentType);
  if (!config) return false;
  
  return config.capabilities.specializations.some(
    spec => taskType.toLowerCase().includes(spec.toLowerCase())
  );
}

/**
 * Get all agent types
 * @returns {string[]} Array of agent type names
 */
export function getAllAgentTypes() {
  return Object.values(AgentType);
}

/**
 * Get agent types that can handle a specific task
 * @param {string} taskType - Task type
 * @returns {string[]} Array of compatible agent types
 */
export function getCompatibleAgentTypes(taskType) {
  return getAllAgentTypes().filter(type => canHandleTask(type, taskType));
}

/**
 * Get default agent type
 * @returns {string} Default agent type
 */
export function getDefaultAgentType() {
  return AgentType.SYSTEM;
}

/**
 * Validate agent type
 * @param {string} type - Agent type to validate
 * @returns {boolean} Whether the type is valid
 */
export function isValidAgentType(type) {
  return Object.values(AgentType).includes(type);
}

/**
 * Compare agent priorities
 * @param {string} typeA - First agent type
 * @param {string} typeB - Second agent type
 * @returns {number} Negative if A has higher priority, positive if B has higher priority
 */
export function comparePriority(typeA, typeB) {
  const configA = getAgentTypeConfig(typeA);
  const configB = getAgentTypeConfig(typeB);
  
  if (!configA || !configB) return 0;
  
  return configB.priority - configA.priority;
}

/**
 * @typedef {Object} AgentTypeConfig
 * @property {string} name - Agent type name
 * @property {string} description - Agent type description
 * @property {Object} capabilities - Agent capabilities
 * @property {boolean} capabilities.canExecuteTasks - Can execute general tasks
 * @property {boolean} capabilities.canCoordinate - Can coordinate other agents
 * @property {boolean} capabilities.canSpecialize - Has specialized capabilities
 * @property {string[]} capabilities.specializations - List of specializations
 * @property {Object} resources - Resource requirements
 * @property {number} resources.cpu - CPU cores required
 * @property {number} resources.memory - Memory in MB required
 * @property {number} [resources.storage] - Storage in MB required
 * @property {number} maxConcurrentTasks - Maximum concurrent tasks
 * @property {number} defaultTimeout - Default task timeout in ms
 * @property {number} heartbeatInterval - Heartbeat interval in ms
 * @property {number} maxRetries - Maximum retries on failure
 * @property {number} priority - Task priority (higher = more important)
 */

export default {
  AgentType,
  AgentLifecycleState,
  AgentTypeConfigs,
  getAgentTypeConfig,
  canHandleTask,
  getAllAgentTypes,
  getCompatibleAgentTypes,
  getDefaultAgentType,
  isValidAgentType,
  comparePriority
};
