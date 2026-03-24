/**
 * @fileoverview Agent type definitions for the GSD Engine.
 * @module gsd/agent-types
 */

/**
 * @typedef {Object} AgentCapabilities
 * @property {boolean} canExecuteTasks - Whether the agent can execute general tasks
 * @property {boolean} canCoordinate - Whether the agent can coordinate other agents
 * @property {boolean} canSpecialize - Whether the agent has specialized capabilities
 * @property {string[]} specializations - List of specializations (for SPECIALIST type)
 */

/**
 * @typedef {Object} ResourceRequirements
 * @property {number} cpu - CPU cores required
 * @property {number} memory - Memory in MB required
 * @property {number} [storage] - Storage in MB required
 * @property {string[]} [gpu] - GPU requirements if any
 */

/**
 * @typedef {Object} AgentTypeConfig
 * @property {string} name - Agent type name
 * @property {AgentCapabilities} capabilities - Agent capabilities
 * @property {ResourceRequirements} resources - Resource requirements
 * @property {number} maxConcurrentTasks - Maximum concurrent tasks
 * @property {number} defaultTimeout - Default task timeout in ms
 * @property {number} heartbeatInterval - Heartbeat interval in ms
 * @property {number} maxRetries - Maximum retries on failure
 */

/** @type {AgentTypeConfig} */
export const WORKER = {
  name: 'WORKER',
  capabilities: {
    canExecuteTasks: true,
    canCoordinate: false,
    canSpecialize: false,
    specializations: [],
  },
  resources: {
    cpu: 1,
    memory: 512,
  },
  maxConcurrentTasks: 5,
  defaultTimeout: 30000,
  heartbeatInterval: 5000,
  maxRetries: 3,
};

/** @type {AgentTypeConfig} */
export const COORDINATOR = {
  name: 'COORDINATOR',
  capabilities: {
    canExecuteTasks: false,
    canCoordinate: true,
    canSpecialize: false,
    specializations: [],
  },
  resources: {
    cpu: 2,
    memory: 1024,
  },
  maxConcurrentTasks: 10,
  defaultTimeout: 60000,
  heartbeatInterval: 3000,
  maxRetries: 5,
};

/** @type {AgentTypeConfig} */
export const SPECIALIST = {
  name: 'SPECIALIST',
  capabilities: {
    canExecuteTasks: true,
    canCoordinate: false,
    canSpecialize: true,
    specializations: [],
  },
  resources: {
    cpu: 2,
    memory: 2048,
    storage: 1024,
  },
  maxConcurrentTasks: 3,
  defaultTimeout: 120000,
  heartbeatInterval: 10000,
  maxRetries: 2,
};

/**
 * Create a specialist type with specific specializations.
 * @param {string[]} specializations - List of specializations
 * @returns {AgentTypeConfig} Specialist configuration
 */
export function createSpecialist(specializations) {
  return {
    ...SPECIALIST,
    capabilities: {
      ...SPECIALIST.capabilities,
      specializations: [...specializations],
    },
  };
}

/**
 * Get agent type by name.
 * @param {string} typeName - Agent type name
 * @returns {AgentTypeConfig|null} Agent type configuration
 */
export function getAgentType(typeName) {
  const types = {
    WORKER,
    COORDINATOR,
    SPECIALIST,
  };
  return types[typeName] || null;
}

/**
 * Check if agent type can handle a task.
 * @param {AgentTypeConfig} agentType - Agent type configuration
 * @param {string} taskType - Task type to check
 * @returns {boolean} Whether the agent can handle the task
 */
export function canHandleTask(agentType, taskType) {
  if (!agentType) return false;
  
  if (agentType.name === 'WORKER') {
    return true; // Workers can handle any general task
  }
  
  if (agentType.name === 'COORDINATOR') {
    return false; // Coordinators don't execute tasks directly
  }
  
  if (agentType.name === 'SPECIALIST') {
    return agentType.capabilities.specializations.includes(taskType);
  }
  
  return false;
}

/**
 * Default agent type export.
 */
export default {
  WORKER,
  COORDINATOR,
  SPECIALIST,
  createSpecialist,
  getAgentType,
  canHandleTask,
};
