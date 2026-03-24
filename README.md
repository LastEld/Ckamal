<p align="center">
  <img src="docs/assets/brand/ckamal-banner.svg" alt="Ckamal banner" width="100%" />
</p>

<p align="center">
  <strong>Ckamal is the GitHub-facing release surface for the existing CogniMesh BIOS codebase.</strong>
</p>

<p align="center">
  <a href="https://github.com/LastEld/Ckamal/actions/workflows/ci.yml"><img src="https://github.com/LastEld/Ckamal/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/LastEld/Ckamal/actions/workflows/patch-verification.yml"><img src="https://github.com/LastEld/Ckamal/actions/workflows/patch-verification.yml/badge.svg" alt="Patch verification status" /></a>
  <a href="https://github.com/LastEld/Ckamal/actions/workflows/pages.yml"><img src="https://github.com/LastEld/Ckamal/actions/workflows/pages.yml/badge.svg" alt="Pages status" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-1C130F?logo=node.js&logoColor=white" alt="Node 18+" />
  <img src="https://img.shields.io/badge/models-6%20groups-B66C41" alt="Six model groups" />
  <img src="https://img.shields.io/badge/humps-6-D39A66" alt="Six humps" />
</p>

## Overview

Ckamal keeps one job in scope: package the existing CogniMesh BIOS project into a clean, honest, controllable repository that is ready for GitHub `main`, GitHub Actions, GitHub Pages, and release automation.

The project is built around subscription-backed integrations to existing operator-managed clients, not API-billing-first defaults. The current declared model groups are:

- `gpt-5.3-codex`
- `gpt-5.4-codex`
- `claude-opus-4-6`
- `claude-sonnet-4-6`
- `claude-sonnet-4-5`
- `kimi-k2-5`

Supported operator surfaces:

- `desktop app`
- `CLI`
- `VS Code extension`

Live execution still depends on the operator having the corresponding local client installed and authenticated. The repo verifies the runtime map and release surface; it does not magically provision third-party subscriptions.

## Table Of Contents

1. [Six Humps](#six-humps)
2. [Verified Release Gate](#verified-release-gate)
3. [Runtime Matrix](#runtime-matrix)
4. [Quick Start](#quick-start)
5. [GitHub Surface](#github-surface)
6. [Repository Shape](#repository-shape)
7. [Truth Docs](#truth-docs)

## Six Humps

The camel logo uses `6` humps because the project rests on `6` stable release-critical abstractions:

1. `AMS / BIOS orchestration`
   Spawn lifecycle, modes, agent pool control, and orchestration policy.
2. `Subscription runtime matrix`
   GPT, Claude, and Kimi model groups mapped to desktop, CLI, and VS Code surfaces.
3. `Repository contract`
   Tasks, roadmaps, contexts, merkle state, migrations, and repository code.
4. `Execution bus`
   Router, queue, tools registry, middleware, and runtime gateways.
5. `Operator surfaces`
   CLI, dashboard, browser shell, and local control UX.
6. `GitHub release plane`
   README, Actions, Pages, release packaging, tags, and public repo hygiene.

Cross-cutting systems like security, monitoring, analytics, and rate limiting strengthen every hump, but they are not counted as separate structural pillars.

## Verified Release Gate

Canonical verification commands:

```bash
npm run verify:release
npm run verify:provider-matrix
npm run build -- --skip-lint
```

`verify:release` runs:

- `npm run lint`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run verify:provider-matrix`

Build smoke is cross-platform through `npm run build`, which dispatches to the existing PowerShell or Bash build script depending on the host OS.

## Runtime Matrix

The canonical runtime matrix is defined in [src/clients/catalog.js](/abs/path/placeholder) and exercised by [tests/e2e/clients.spec.js](/abs/path/placeholder). The current model group to surface map is:

| Model group | Surfaces |
| --- | --- |
| `gpt-5.3-codex` | `cli` |
| `gpt-5.4-codex` | `vscode`, `app`, `cli` |
| `claude-opus-4-6` | `desktop`, `cli` |
| `claude-sonnet-4-6` | `vscode`, `cli` |
| `claude-sonnet-4-5` | `cli`, `vscode` |
| `kimi-k2-5` | `vscode`, `cli` |

Compatibility aliases:

- `ide` normalizes to `vscode`
- `sonnet-cli` normalizes to `cli`
- `sonnet-ide` normalizes to `vscode`

## Quick Start

```bash
git clone https://github.com/LastEld/Ckamal.git
cd Ckamal
npm install
npm run verify:release
npm start
```

Optional but common local runtime environment values:

```bash
GITHUB_TOKEN=ghp_your_token_here
DATABASE_PATH=./data/cognimesh.db
CLAUDE_CLI_PATH=...
CODEX_CLI_PATH=...
KIMI_CLI_PATH=...
CLAUDE_VSCODE_SOCKET_PATH=...
CODEX_VSCODE_PORT=...
KIMI_VSCODE_SOCKET_PATH=...
```

Use API keys only if you intentionally run API-backed workflows outside the subscription-first release path.

## GitHub Surface

The repository is prepared with:

- `CI` workflow for lint, unit, integration, e2e, provider matrix, and build smoke.
- `Patch Verification` workflow as a public release gate on source changes.
- `Pages` workflow that deploys the `docs/` surface.
- `Release` workflow that verifies, builds, packages archives, generates checksums, and creates a GitHub release on tag push.
- A public landing page at `docs/index.html`.
- A transparent camel logo and banner under `docs/assets/brand/`.

Intended Pages URL:

- [https://lasteld.github.io/Ckamal/](https://lasteld.github.io/Ckamal/)

## Repository Shape

Top-level directories that matter for release:

- `src/` application code, clients, BIOS, dashboard, domains, router, tools
- `tests/` unit, integration, e2e, websocket, provider surface coverage
- `docs/` Pages surface, integrations, release docs, historical reports
- `.github/workflows/` CI, patch verification, Pages, release
- `.planning/` release recovery plan and GitHub release checklist
- `config/` observability and infrastructure defaults
- `scripts/` build, migrate, deploy, release, verification helpers

Historical reports were moved out of the root into `docs/reports/historical/` to keep the public root honest and clean.

## Truth Docs

The current release truth lives in:

- [PROJECT_STATUS.md](/abs/path/placeholder)
- [INTEGRATION_CHECKLIST.md](/abs/path/placeholder)
- [.planning/RELEASE_RECOVERY_5_PHASE_PLAN.md](/abs/path/placeholder)
- [.planning/GITHUB_RELEASE_CHECKLIST.md](/abs/path/placeholder)

Anything older in `docs/reports/historical/` is context, not authority.
