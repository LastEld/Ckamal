# Clients Module Contract

## Canonical runtime

`src/clients/` is the only supported provider runtime surface.

The canonical selection path is:

1. `src/clients/catalog.js`
2. `src/clients/index.js`
3. `src/router/subscription-runtime.js`
4. `src/bios/client-gateway.js`

## Supported provider surfaces

### Claude

- `src/clients/claude/cli.js`
- `src/clients/claude/desktop.js`
- `src/clients/claude/vscode.js`

### Codex

- `src/clients/codex/cli.js`
- `src/clients/codex/app.js`
- `src/clients/codex/vscode.js`

### Kimi

- `src/clients/kimi/cli.js`
- `src/clients/kimi/vscode.js`

## Explicitly removed from the release path

These are not canonical runtime surfaces anymore:

- `ide` naming as a public surface
- `mcp` as a Claude client surface
- `copilot` and `cursor` as Codex client surfaces
- `swarm` as a Kimi client surface
- provider-native `src/models/*` execution paths

Archived provider-native model code now lives under `archive/legacy-src/models/`.

## Runtime assumptions

- execution is subscription-backed and operator-managed
- the required local client must already be installed and authenticated
- the catalog may deny a model/mode combination that is not declared in `src/clients/catalog.js`
- metered API fallback is not the normal release path
