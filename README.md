<p align="center">
  <img src="docs/assets/brand/proposallogo2.png" alt="CogniMesh" width="280" />
</p>

<p align="center">
  <strong>Multi-model AI orchestration platform, subscription-first.</strong><br/>
  Orchestrates GPT, Claude, and Kimi through your existing subscriptions &mdash; no API keys, no metered billing.
</p>

<p align="center">
  <a href="https://github.com/LastEld/Ckamal/actions/workflows/ci.yml"><img src="https://github.com/LastEld/Ckamal/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/LastEld/Ckamal/actions/workflows/patch-verification.yml"><img src="https://github.com/LastEld/Ckamal/actions/workflows/patch-verification.yml/badge.svg" alt="Patch verification status" /></a>
  <a href="https://github.com/LastEld/Ckamal/actions/workflows/pages.yml"><img src="https://github.com/LastEld/Ckamal/actions/workflows/pages.yml/badge.svg" alt="Pages status" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-1C130F?logo=node.js&logoColor=white" alt="Node 18+" />
  <img src="https://img.shields.io/badge/models-7-B66C41" alt="7 models" />
  <img src="https://img.shields.io/badge/providers-3-D39A66" alt="3 providers" />
</p>

## Overview

CogniMesh (Ckamal) is a multi-model AI orchestration platform that routes work across GPT, Claude, and Kimi model families through operator-managed subscription surfaces. All provider access is subscription-only at a flat rate of **$18-20/month per provider** -- no API keys, no per-token billing, no usage metering.

The platform packages the existing CogniMesh BIOS codebase into a clean, controllable repository ready for GitHub `main`, GitHub Actions, GitHub Pages, and release automation.

## Table Of Contents

1. [Model Matrix](#model-matrix)
2. [Subscription Model](#subscription-model)
3. [Verified Release Gate](#verified-release-gate)
4. [Quick Start](#quick-start)
5. [GitHub Surface](#github-surface)
6. [Repository Shape](#repository-shape)
7. [Truth Docs](#truth-docs)

## Model Matrix

The canonical runtime matrix is defined in [src/clients/catalog.js](src/clients/catalog.js) and exercised by [tests/e2e/clients.spec.js](tests/e2e/clients.spec.js). All 7 models across 3 providers:

| Model | Provider | Surfaces |
| --- | --- | --- |
| `claude-opus-4-6` | Anthropic | `desktop`, `cli` |
| `claude-opus-4-5` | Anthropic | `desktop`, `cli` |
| `claude-sonnet-4-6` | Anthropic | `vscode`, `cli` |
| `claude-sonnet-4-5` | Anthropic | `cli`, `vscode` |
| `gpt-5.4-codex` | OpenAI | `vscode`, `app`, `cli` |
| `gpt-5.3-codex` | OpenAI | `cli` |
| `kimi-k2-5` | Moonshot | `vscode`, `cli` |

Compatibility aliases:

- `ide` normalizes to `vscode`
- `claude-opus-4` normalizes to `claude-opus-4-6`
- `claude-opus-4-5-latest` normalizes to `claude-opus-4-5`
- `kimi-k2` normalizes to `kimi-k2-5`

Supported operator surfaces: **Desktop App**, **CLI**, **VS Code Extension**.

## Subscription Model

CogniMesh is subscription-only. Every provider integration runs through the operator's existing subscription client -- not through direct API calls.

| Provider | Subscription | Approximate Cost |
| --- | --- | --- |
| Anthropic (Claude) | Claude Pro / Max | ~$20/month |
| OpenAI (Codex) | ChatGPT Pro / Plus | ~$20/month |
| Moonshot (Kimi) | Kimi subscription | ~$18/month |

Live execution depends on the operator having the corresponding local client installed and authenticated. The repo verifies the runtime map and release surface; it does not provision third-party subscriptions.

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

## Quick Start

```bash
git clone https://github.com/LastEld/Ckamal.git
cd Ckamal
npm install
npm run verify:release
npm start
```

Optional local runtime environment values:

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

These configure paths to your locally installed subscription clients. No API keys are needed for standard operation.

## GitHub Surface

The repository is prepared with:

- `CI` workflow for lint, unit, integration, e2e, provider matrix, and build smoke.
- `Patch Verification` workflow as a public release gate on source changes.
- `Pages` workflow that deploys the `docs/` surface.
- `Release` workflow that verifies, builds, packages archives, generates checksums, and creates a GitHub release on tag push.
- A public landing page at `docs/index.html`.

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

- [PROJECT_STATUS.md](PROJECT_STATUS.md)
- [INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md)
- [.planning/RELEASE_RECOVERY_5_PHASE_PLAN.md](.planning/RELEASE_RECOVERY_5_PHASE_PLAN.md)
- [.planning/GITHUB_RELEASE_CHECKLIST.md](.planning/GITHUB_RELEASE_CHECKLIST.md)

Anything older in `docs/reports/historical/` is context, not authority.
