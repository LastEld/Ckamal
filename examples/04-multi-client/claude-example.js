#!/usr/bin/env node

import {
  ClaudeCliClient,
  ClaudeDesktopClient,
  ClaudeVSCodeClient
} from '../../src/clients/index.js';

async function show(name, client) {
  try {
    await client.initialize();
    console.log(`${name}:`, client.getCapabilities());
  } catch (error) {
    console.log(`${name}: unavailable (${error.message})`);
  } finally {
    await client.disconnect?.().catch(() => {});
  }
}

async function main() {
  const entries = [];

  if (process.env.CLAUDE_CLI_PATH) {
    entries.push(['claude:cli', new ClaudeCliClient({ cliPath: process.env.CLAUDE_CLI_PATH })]);
  }
  if (process.env.CLAUDE_DESKTOP_URL) {
    entries.push(['claude:desktop', new ClaudeDesktopClient({ desktopUrl: process.env.CLAUDE_DESKTOP_URL })]);
  }
  if (process.env.CLAUDE_VSCODE_SOCKET_PATH) {
    entries.push(['claude:vscode', new ClaudeVSCodeClient({ socketPath: process.env.CLAUDE_VSCODE_SOCKET_PATH })]);
  }

  if (entries.length === 0) {
    console.log('Set CLAUDE_CLI_PATH, CLAUDE_DESKTOP_URL, or CLAUDE_VSCODE_SOCKET_PATH.');
    return;
  }

  for (const entry of entries) {
    await show(...entry);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
