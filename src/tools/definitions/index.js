/**
 * @fileoverview MCP Tool Definitions Barrel Export
 * Central export for all tool definition modules.
 * @module tools/definitions
 */

export { taskTools } from './task-tools.js';
export { roadmapTools } from './roadmap-tools.js';
export { claudeTools } from './claude-tools.js';
export { systemTools } from './system-tools.js';
export { analysisTools } from './analysis-tools.js';

// Default export of all tools combined
import { taskTools } from './task-tools.js';
import { roadmapTools } from './roadmap-tools.js';
import { claudeTools } from './claude-tools.js';
import { systemTools } from './system-tools.js';
import { analysisTools } from './analysis-tools.js';

/**
 * All available MCP tool definitions
 * @type {import('../index.js').ToolDefinition[]}
 */
export const allTools = [
  ...taskTools,
  ...roadmapTools,
  ...claudeTools,
  ...systemTools,
  ...analysisTools
];

/**
 * Tool count by category
 * @type {Object<string, number>}
 */
export const toolCounts = {
  task: taskTools.length,
  roadmap: roadmapTools.length,
  claude: claudeTools.length,
  system: systemTools.length,
  analysis: analysisTools.length,
  total: allTools.length
};

export default allTools;
