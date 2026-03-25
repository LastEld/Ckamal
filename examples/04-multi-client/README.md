# Multi-Client Examples

These examples demonstrate the current canonical subscription-backed surfaces.

## Canonical Surfaces

- Claude Code: `cli`, `desktop`, `vscode`
- Codex: `cli`, `app`, `vscode`
- Kimi Code: `cli`, `vscode`

## Files

- `unified-client.js` - prints the canonical matrix and probes configured local surfaces
- `claude-example.js` - Claude CLI, desktop, and VS Code surface smoke example
- `codex-example.js` - Codex CLI, app, and VS Code surface smoke example
- `kimi-example.js` - Kimi CLI and VS Code surface smoke example
- `chain-execution.js` - BIOS client-gateway routing example

## Environment

Configure only the local surfaces you actually use:

```bash
CLAUDE_CLI_PATH=...
CLAUDE_DESKTOP_URL=...
CLAUDE_VSCODE_SOCKET_PATH=...

CODEX_CLI_PATH=...
CODEX_APP_URL=...
CODEX_VSCODE_PORT=16101

KIMI_CLI_PATH=...
KIMI_VSCODE_SOCKET_PATH=...
```

## Run

```bash
node examples/04-multi-client/unified-client.js
node examples/04-multi-client/claude-example.js
node examples/04-multi-client/codex-example.js
node examples/04-multi-client/kimi-example.js
node examples/04-multi-client/chain-execution.js
```

These examples are local-surface probes and routing demonstrations. They do not create API-billing-first flows.
