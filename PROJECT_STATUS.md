# Project Status

Date: 2026-03-25  
Project: Ckamal / CogniMesh BIOS  
Status: published on GitHub `main` with live Pages, green Actions, and tagged release `v5.0.0`

## Scope

This repository packages the existing CogniMesh BIOS codebase into a clean GitHub-facing release surface for:

- Codex GPT-5.3 and GPT-5.4
- Claude Opus 4.6
- Claude Sonnet 4.5 and 4.6
- Kimi K2.5

Supported operator surfaces:

- Desktop app
- CLI
- VS Code extension

Hard rules:

- No new product scope
- No fake-success normal release paths
- No API-billing-first defaults
- No release claims beyond verified code and workflow state

## Verified State

The release gate now has dedicated commands and workflows:

- `npm run verify:release`
- `npm run verify:provider-matrix`
- `npm run build -- --skip-lint`

GitHub-facing surfaces prepared in the repository:

- `README.md` as the public operator entrypoint
- `docs/index.html` plus `pages.yml` for GitHub Pages
- `ci.yml`, `patch-verification.yml`, `release.yml`, and `pages.yml`
- release brand assets under `docs/assets/brand/`
- historical reports moved to `docs/reports/historical/`

Release-critical code and verification already integrated:

- repository contract alignment for tasks, roadmaps, contexts, and merkle state
- canonical provider matrix verification for the six subscription-backed model groups
- cross-platform build entrypoint through `npm run build`
- dashboard browser-shell smoke coverage
- green unit, integration, e2e, and provider-matrix verification paths

GitHub publication state completed:

- repository: `https://github.com/LastEld/Ckamal`
- Pages: `https://lasteld.github.io/Ckamal/`
- release: `https://github.com/LastEld/Ckamal/releases/tag/v5.0.0`
- successful GitHub workflows for CI, patch verification, Pages, and release packaging

## Real Constraints That Still Apply

These are operational prerequisites, not repository defects:

- live model execution still requires the corresponding local desktop/CLI/VS Code client to be installed and authenticated
- release automation beyond `v5.0.0` still depends on valid GitHub token permissions for future push/tag operations
- local environment values are still required where a non-default runtime path is expected

## Authority

Current truth documents:

- `README.md`
- `INTEGRATION_CHECKLIST.md`
- `.planning/RELEASE_RECOVERY_5_PHASE_PLAN.md`
- `.planning/GITHUB_RELEASE_CHECKLIST.md`

Historical completion and readiness reports remain preserved under `docs/reports/historical/`, but they are not authoritative.
