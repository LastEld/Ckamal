#!/usr/bin/env node

import {
  ClaudeCliClient,
  ClaudeDesktopClient,
  ClaudeVSCodeClient,
  CodexCliClient,
  GPT54CodexAppClient,
  GPT54CodexVSCodeClient,
  KimiCliClient,
  KimiVSCodeClient,
  getCanonicalSubscriptionSurfaceMatrix
} from '../../src/clients/index.js';

function buildClients() {
  const clients = [];

  if (process.env.CLAUDE_CLI_PATH) {
    clients.push(['claude:cli', new ClaudeCliClient({ cliPath: process.env.CLAUDE_CLI_PATH })]);
  }
  if (process.env.CLAUDE_DESKTOP_URL) {
    clients.push(['claude:desktop', new ClaudeDesktopClient({ desktopUrl: process.env.CLAUDE_DESKTOP_URL })]);
  }
  if (process.env.CLAUDE_VSCODE_SOCKET_PATH) {
    clients.push(['claude:vscode', new ClaudeVSCodeClient({ socketPath: process.env.CLAUDE_VSCODE_SOCKET_PATH })]);
  }
  if (process.env.CODEX_CLI_PATH) {
    clients.push(['codex:cli', new CodexCliClient({ cliPath: process.env.CODEX_CLI_PATH })]);
  }
  if (process.env.CODEX_APP_URL) {
    clients.push(['codex:app', new GPT54CodexAppClient({ appUrl: process.env.CODEX_APP_URL })]);
  }
  if (process.env.CODEX_VSCODE_PORT) {
    clients.push(['codex:vscode', new GPT54CodexVSCodeClient({ port: Number(process.env.CODEX_VSCODE_PORT) })]);
  }
  if (process.env.KIMI_CLI_PATH) {
    clients.push(['kimi:cli', new KimiCliClient({ cliPath: process.env.KIMI_CLI_PATH })]);
  }
  if (process.env.KIMI_VSCODE_SOCKET_PATH) {
    clients.push(['kimi:vscode', new KimiVSCodeClient({ socketPath: process.env.KIMI_VSCODE_SOCKET_PATH })]);
  }

  return clients;
}

async function probeClient([name, client]) {
  try {
    await client.initialize();
    const capabilities = client.getCapabilities();
    console.log(`${name}: connected=${client.isConnected()} mode=${capabilities.mode}`);
  } catch (error) {
    console.log(`${name}: unavailable (${error.message})`);
  } finally {
    if (typeof client.disconnect === 'function') {
      await client.disconnect().catch(() => {});
    }
  }
}

async function main() {
  console.log('Canonical subscription matrix');
  console.table(
    getCanonicalSubscriptionSurfaceMatrix().map((entry) => ({
      model: entry.modelId,
      provider: entry.runtimeProvider,
      surfaces: entry.surfaces.join(', ')
    }))
  );

  const clients = buildClients();
  if (clients.length === 0) {
    console.log('No local surfaces configured. Set one or more *_PATH, *_URL, or *_PORT variables.');
    return;
  }

  for (const clientEntry of clients) {
    await probeClient(clientEntry);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
