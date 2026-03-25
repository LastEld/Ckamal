#!/usr/bin/env node

import { ClientGateway } from '../../src/bios/client-gateway.js';

function buildGatewayConfig() {
  return {
    claude: {
      cli: process.env.CLAUDE_CLI_PATH ? { cliPath: process.env.CLAUDE_CLI_PATH } : false,
      desktop: process.env.CLAUDE_DESKTOP_URL ? { desktopUrl: process.env.CLAUDE_DESKTOP_URL } : false,
      vscode: process.env.CLAUDE_VSCODE_SOCKET_PATH ? { socketPath: process.env.CLAUDE_VSCODE_SOCKET_PATH } : false
    },
    codex: {
      cli: process.env.CODEX_CLI_PATH ? { cliPath: process.env.CODEX_CLI_PATH } : false,
      app: process.env.CODEX_APP_URL ? { appUrl: process.env.CODEX_APP_URL } : false,
      vscode: process.env.CODEX_VSCODE_PORT ? { port: Number(process.env.CODEX_VSCODE_PORT) } : false
    },
    kimi: {
      cli: process.env.KIMI_CLI_PATH ? { cliPath: process.env.KIMI_CLI_PATH } : false,
      vscode: process.env.KIMI_VSCODE_SOCKET_PATH ? { socketPath: process.env.KIMI_VSCODE_SOCKET_PATH } : false
    }
  };
}

async function main() {
  const gateway = new ClientGateway(buildGatewayConfig());
  await gateway.initialize();

  const tasks = [
    { type: 'code_analyze', description: 'Review a CLI workflow' },
    { type: 'inline_completion', description: 'Complete editor code', requiresEditorContext: true },
    { type: 'multimodal_analyze', description: 'Inspect a screenshot', hasImages: true }
  ];

  for (const task of tasks) {
    const client = gateway.selectBestClient(task);
    console.log(task.type, '->', client ? `${client.provider}:${client.mode}` : 'no client available');
  }

  await gateway.shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
