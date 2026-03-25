#!/usr/bin/env node

import {
  CodexCliClient,
  GPT54CodexAppClient,
  GPT54CodexVSCodeClient
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

  if (process.env.CODEX_CLI_PATH) {
    entries.push(['codex:cli', new CodexCliClient({ cliPath: process.env.CODEX_CLI_PATH })]);
  }
  if (process.env.CODEX_APP_URL) {
    entries.push(['codex:app', new GPT54CodexAppClient({ appUrl: process.env.CODEX_APP_URL })]);
  }
  if (process.env.CODEX_VSCODE_PORT) {
    entries.push(['codex:vscode', new GPT54CodexVSCodeClient({ port: Number(process.env.CODEX_VSCODE_PORT) })]);
  }

  if (entries.length === 0) {
    console.log('Set CODEX_CLI_PATH, CODEX_APP_URL, or CODEX_VSCODE_PORT.');
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
