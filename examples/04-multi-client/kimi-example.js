#!/usr/bin/env node

import {
  KimiCliClient,
  KimiVSCodeClient
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

  if (process.env.KIMI_CLI_PATH) {
    entries.push(['kimi:cli', new KimiCliClient({ cliPath: process.env.KIMI_CLI_PATH })]);
  }
  if (process.env.KIMI_VSCODE_SOCKET_PATH) {
    entries.push(['kimi:vscode', new KimiVSCodeClient({ socketPath: process.env.KIMI_VSCODE_SOCKET_PATH })]);
  }

  if (entries.length === 0) {
    console.log('Set KIMI_CLI_PATH or KIMI_VSCODE_SOCKET_PATH.');
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
