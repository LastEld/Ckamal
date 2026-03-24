# Project Status

Date: 2026-03-25
Project: Ckamal
Status: Clean main release candidate staged locally

## Scope

The active scope is still the same:

- finish the existing subscription-backed integrations for Codex GPT-5.3 and GPT-5.4
- finish the existing subscription-backed integrations for Claude Opus 4.6 and Claude Sonnet 4.5 / 4.6
- finish the existing subscription-backed integrations for Kimi K2.5
- keep the supported operator surfaces to `desktop app`, `CLI`, and `VS Code`
- make the repository honest and publishable on GitHub without mock success paths

## Verified local state

- `npm run lint` passes
- `npm run test:unit` passes (`373` tests)
- `npm run test:integration` passes (`236` tests)
- `npm run test:e2e` passes (`9` tests)
- `npm run verify:provider-matrix` passes for all `6` canonical model groups
- `npm run build -- --skip-lint` passes and creates a release bundle
- root-level generated clutter was removed and historical reports were moved into `docs/`
- GitHub workflows now match the real Node/ESM release gate
- GitHub Pages content and transparent logo assets now exist locally

## Architectural hump count

The project currently uses a **6-hump** branding model:

1. AMS / BIOS orchestration
2. Subscription runtime matrix
3. Domain state contract
4. Tool and router bus
5. Operator surfaces
6. Observability and release control

This count is canonical for the current logo assets.

## What is still pending

The remaining steps are remote, not local:

- publish the repository into remote `main`
- observe the first real GitHub Actions runs
- observe the first real GitHub Pages deployment

Until those three happen, the repository is a local release candidate rather than a completed GitHub release.
