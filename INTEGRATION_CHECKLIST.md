# Integration Checklist

Date: 2026-03-25  
Project: Ckamal / CogniMesh BIOS  
Status: completed release-gate checklist for published GitHub main and `v5.0.0`

## Core Verification

- [x] `npm run lint`
- [x] `npm run test:unit`
- [x] `npm run test:integration`
- [x] `npm run test:e2e`
- [x] `npm run verify:provider-matrix`
- [x] `npm run build -- --skip-lint`

## Runtime Matrix

- [x] `gpt-5.3-codex` -> `cli`
- [x] `gpt-5.4-codex` -> `vscode`, `app`, `cli`
- [x] `claude-opus-4-6` -> `desktop`, `cli`
- [x] `claude-sonnet-4-6` -> `vscode`, `cli`
- [x] `claude-sonnet-4-5` -> `cli`, `vscode`
- [x] `kimi-k2-5` -> `vscode`, `cli`

## Subscription-Only Policy

- [x] release config defaults away from API-first behavior
- [x] provider matrix verification exists as a dedicated script
- [x] canonical runtime aliases are normalized in the client catalog
- [x] release docs state that live execution still depends on local operator-managed clients

## Browser / Operator Surface

- [x] dashboard public scripts expose browser globals cleanly
- [x] dashboard browser shell has a Node-based smoke test
- [x] operator dashboard route layer has dedicated tests under `tests/unit/dashboard/`
- [x] cross-platform build entrypoint exists through `npm run build`

## GitHub Face

- [x] root README replaced with a GitHub-facing public surface
- [x] historical overclaiming reports moved out of the root
- [x] Pages landing page exists under `docs/`
- [x] transparent camel logo and banner exist under `docs/assets/brand/`
- [x] GitHub Actions workflows exist for CI, patch verification, Pages, and release
- [x] repository homepage points to GitHub Pages

## Release Lane

- [x] release archives are packaged from verified build output
- [x] release workflow generates SHA256 checksums
- [x] tag push path creates a GitHub release
- [x] Pages deployment path uploads the `docs/` artifact
- [x] `v5.0.0` release exists with uploaded `.tar.gz`, `.zip`, and `.sha256` assets

## Remaining External Dependencies

These are not repository blockers, but they remain real operator prerequisites:

- local installation and authentication for the external desktop/CLI/VS Code clients you intend to use
- valid GitHub token and permissions when running GitHub-facing automations
- local environment values for any non-default runtime paths

## Authority

Use these files as the current release truth:

- `README.md`
- `PROJECT_STATUS.md`
- `.planning/RELEASE_RECOVERY_5_PHASE_PLAN.md`
- `.planning/GITHUB_RELEASE_CHECKLIST.md`
