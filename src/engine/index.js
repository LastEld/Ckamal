/**
 * @fileoverview GSD Engine Core module exports.
 * @module gsd
 */

// Core engine
export { GSDEngine } from './engine.js';

// Agent management
export { AgentPool } from './agent-pool.js';
export { Agent, AgentStatus } from './agent.js';

// Agent types
export { 
  WORKER, 
  COORDINATOR, 
  SPECIALIST,
  createSpecialist,
  getAgentType,
  canHandleTask,
} from './agent-types.js';

// Planning
export { Planner } from './planner.js';

// Default export
export { GSDEngine as default } from './engine.js';
