# Clients Module

## Overview

`src/clients` is the canonical provider runtime for the active release path.

It exposes subscription-backed local operator surfaces only:

- `Claude Code` on `cli`, `desktop`, `vscode`
- `Codex` on `cli`, `app`, `vscode`
- `Kimi Code` on `cli`, `vscode`

This module is the public client layer used by:

- `src/router/subscription-runtime.js`
- `src/bios/client-gateway.js`
- `tests/e2e/clients.spec.js`

## Directory Shape

```text
clients/
├── base-client.js
├── catalog.js
├── index.js
├── claude/
│   ├── cli.js
│   ├── desktop.js
│   ├── vscode.js
│   └── index.js
├── codex/
│   ├── app.js
│   ├── cli.js
│   ├── vscode.js
│   └── index.js
└── kimi/
    ├── cli.js
    ├── vscode.js
    └── index.js
```

## Canonical Truth

- Surface declarations live in `catalog.js`.
- Factory and provider exports live in `index.js`.
- Subscription-first routing is verified by `verifyCanonicalSubscriptionSurfaceMatrix()`.
- Local clients remain operator-managed; the repository does not provision third-party subscriptions for the user.

## Not In Scope Anymore

These are not part of the active client surface:

- `mcp`
- `copilot`
- `cursor`
- `swarm`
- generic `ide` aliases
- API-billing-first defaults

## Where To Start

- Add or verify provider/runtime mappings in `catalog.js`.
- Change provider construction in `index.js`.
- Change concrete surface behavior in `claude/`, `codex/`, or `kimi/`.
- Change router attachment in `src/router/subscription-runtime.js`.
