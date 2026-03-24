# Release Recovery 5-Phase Plan

Date: 2026-03-25  
Owner: Main AMS orchestrator  
Project: Ckamal / CogniMesh BIOS

## Objective

Finish the existing subscription-backed integrations and expose them through a clean GitHub-ready release surface.

Model groups in scope:

- `gpt-5.3-codex`
- `gpt-5.4-codex`
- `claude-opus-4-6`
- `claude-sonnet-4-6`
- `claude-sonnet-4-5`
- `kimi-k2-5`

Operator surfaces in scope:

- `desktop`
- `cli`
- `vscode`
- `app` where already present in the existing runtime map

Constraints:

- do not invent new product scope
- do not default to metered API-first operation
- do not ship mock success on normal release paths
- do not let docs, workflows, and runtime drift apart

## Phase Status

| Phase | Name | State |
| --- | --- | --- |
| 1 | Truth and baseline repair | Completed |
| 2 | Provider surface consolidation | Completed |
| 3 | Subscription-backed integration completion | Completed |
| 4 | Verification and operator UX | Completed |
| 5 | Release hardening and GitHub readiness | Completed and published on GitHub |

## What This Recovery Closed

### Phase 1

- repaired package integrity gaps
- removed key fake-success runtime paths
- aligned migration startup with the real database stack
- restored honest controller and tool runtime behavior

### Phase 2

- restored the canonical subscription surface matrix in `src/clients/catalog.js`
- aligned `src/clients/index.js` and `src/router/subscription-runtime.js`
- added a dedicated provider-matrix verification script

### Phase 3

- hardened subscription-only runtime defaults in config and routing
- preserved existing local operator surfaces instead of collapsing back to API-first paths
- verified the six declared model groups against the canonical runtime matrix

### Phase 4

- stabilized unit, integration, e2e, and dashboard operator-surface coverage
- added a dashboard browser-shell smoke test
- added a cross-platform build entrypoint through `npm run build`

### Phase 5

- cleaned the root so historical reports no longer dominate the public surface
- replaced the README with a GitHub-facing release document
- added GitHub Pages, CI, patch-verification, and release workflows that match the real package scripts
- created a public Pages landing surface and brand assets
- published `main`, enabled Pages, and released `v5.0.0` with packaged artifacts and checksums

## Release Truth

Canonical release commands:

```bash
npm run verify:release
npm run verify:provider-matrix
npm run build -- --skip-lint
```

Canonical GitHub surfaces:

- `.github/workflows/ci.yml`
- `.github/workflows/patch-verification.yml`
- `.github/workflows/release.yml`
- `.github/workflows/pages.yml`
- `docs/index.html`
- `docs/assets/brand/*`

## Definition Of Done

The repository is considered done when:

- the release gate is green locally
- the repo is pushed to GitHub `main`
- Pages deploys from `docs/`
- Actions reflect the real verification surface
- the tag/release lane packages verified artifacts without hidden API assumptions

Current state: all five conditions are satisfied.

## Residual Reality

The repo can verify its runtime map and public surface, but it cannot ship third-party subscriptions for the operator. Live model execution still depends on the user having the relevant desktop, CLI, or VS Code client installed and authenticated locally.
