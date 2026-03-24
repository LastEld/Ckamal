# Release Recovery Subagent Brief

Date: 2026-03-24
Mode: AMS orchestration

## Main Agent Role

The main agent owns:

- final prioritization
- code changes
- truth arbitration when docs and code disagree
- final release readiness decision

Subagents do not invent scope. They audit and hand off facts.

## Subagent 1 - Integration Matrix Auditor

Mission:

- map every existing provider/model/mode implementation
- identify which files are canonical and which are duplicates or side paths
- highlight API-first logic that conflicts with subscription-backed local tooling

Primary files:

- `E:\Ckamal\src\clients\index.js`
- `E:\Ckamal\src\clients\catalog.js`
- `E:\Ckamal\src\bios\client-gateway.js`
- `E:\Ckamal\src\models\claude\*`
- `E:\Ckamal\src\models\codex\*`
- `E:\Ckamal\src\models\kimi\*`

Deliverable:

- provider/model/mode matrix
- canonical runtime recommendation based only on existing code
- critical mismatches

## Subagent 2 - Release Readiness Auditor

Mission:

- identify lint blockers, test-runner mismatches, runtime mocks, and fake/stub logic
- separate production blockers from test-only concerns

Primary files:

- `E:\Ckamal\package.json`
- `E:\Ckamal\src\controllers\*`
- `E:\Ckamal\src\tools\definitions\*`
- `E:\Ckamal\tests\*`

Deliverable:

- prioritized blocker list
- exact files that block honest release
- minimum path to a green verification baseline

## Subagent 3 - Docs and Plan Truth Auditor

Mission:

- compare README, integration reports, TODO docs, and project status against actual code and scripts
- mark documents that overclaim completion

Primary files:

- `E:\Ckamal\README.md`
- `E:\Ckamal\PROJECT_STATUS.md`
- `E:\Ckamal\.planning\TODO_MASTER.md`
- `E:\Ckamal\GPT54_CODEX_INTEGRATION.md`
- `E:\Ckamal\CLAUDE_SONNET_46_INTEGRATION.md`
- `E:\Ckamal\KIMI_25_INTEGRATION_REPORT.md`

Deliverable:

- stale or misleading docs list
- docs that can stay as source of truth
- docs to update only after code is fixed

## Handoff Format

Each subagent hands back:

1. facts
2. blockers
3. exact file list
4. no speculation beyond the current repository state

