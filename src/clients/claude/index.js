/**
 * Claude Client Integration
 * Exports all Claude-specific client implementations
 */

export { ClaudeCliClient } from './cli.js';
export { ClaudeDesktopClient } from './desktop.js';
export { ClaudeVSCodeClient } from './vscode.js';

// Default export with all clients
export default {
  CliClient: (await import('./cli.js')).ClaudeCliClient,
  DesktopClient: (await import('./desktop.js')).ClaudeDesktopClient,
  VSCodeClient: (await import('./vscode.js')).ClaudeVSCodeClient
};
