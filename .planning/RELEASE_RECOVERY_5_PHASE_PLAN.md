# Release Recovery 5-Phase Plan

Date: 2026-03-25
Owner: Main AMS orchestrator
Project: Ckamal

## Objective

Ship the existing subscription-backed integrations for Codex, Claude, and Kimi as a clean GitHub-ready project with:

- honest runtime behavior
- clean root structure
- real release workflows
- branded GitHub Pages surface
- canonical documentation

## Phase 1 — Truth and baseline repair

State: completed

Completed:

- runtime fake-success paths removed from the repaired core paths
- repository/schema contract aligned through the current repository recovery pass
- package integrity repaired
- lint/test suites made runnable again

## Phase 2 — Provider surface consolidation

State: completed

Completed:

- canonical subscription surface matrix exported from `src/clients/catalog.js`
- runtime resolution aligned across `src/clients/index.js`, `src/router/subscription-runtime.js`, and `src/bios/client-gateway.js`
- provider matrix verification script added to the release gate

## Phase 3 — Subscription-backed integration completion

State: completed

Completed:

- subscription-first defaults preserved in the current config/runtime path
- supported model groups verified through local smoke coverage
- release workflow no longer assumes npm publication or fake build steps

## Phase 4 — Verification and operator UX

State: completed

Completed:

- `lint`, `unit`, `integration`, `e2e`, and provider matrix checks are all part of the canonical release gate
- root docs cleaned and historical reports moved under `docs/`
- GitHub Pages landing and transparent logo assets added

## Phase 5 — GitHub release hardening

State: in final execution

Final tasks:

1. Commit the cleaned repository state.
2. Push that state to remote `main`.
3. Confirm the first live runs for `CI`, `Patch Verification`, `Release`, and `Pages`.
4. Confirm the repository and Pages surfaces render correctly on GitHub.

## Definition of done

This recovery is done only when:

- remote `main` contains the cleaned project
- GitHub Actions run from the canonical workflows
- GitHub Pages deploys from `docs/`
- the repository face matches the canonical docs and logo assets
