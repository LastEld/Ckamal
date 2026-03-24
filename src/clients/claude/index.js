/**
 * Claude Client Integration
 * Exports all Claude-specific client implementations
 */

export { ClaudeCliClient } from './cli.js';
export { ClaudeDesktopClient } from './desktop.js';
export { ClaudeVSCodeClient, ClaudeIdeClient } from './ide.js';
export { ClaudeMcpClient } from './mcp.js';

// Default export with all clients
export default {
  CliClient: (await import('./cli.js')).ClaudeCliClient,
  DesktopClient: (await import('./desktop.js')).ClaudeDesktopClient,
  VSCodeClient: (await import('./ide.js')).ClaudeVSCodeClient,
  IdeClient: (await import('./ide.js')).ClaudeIdeClient, // Legacy
  McpClient: (await import('./mcp.js')).ClaudeMcpClient
};
