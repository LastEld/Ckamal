#!/usr/bin/env node

import { ClaudeVSCodeClient } from '../src/clients/claude/vscode.js';

async function main() {
  if (!process.env.CLAUDE_VSCODE_SOCKET_PATH) {
    console.log('Set CLAUDE_VSCODE_SOCKET_PATH to probe the Claude VS Code surface.');
    return;
  }

  const client = new ClaudeVSCodeClient({
    socketPath: process.env.CLAUDE_VSCODE_SOCKET_PATH
  });

  try {
    await client.initialize();
    console.log(client.getCapabilities());
  } finally {
    await client.disconnect?.().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
