# CogniMesh E2E Test Suite

## Scope

The E2E suite proves the release-facing contract without depending on paid API execution.

Current coverage:

- domain flows in `flows.spec.js`
- canonical client surface matrix in `clients.spec.js`
- factory/runtime smoke for all declared model groups

## Client E2E Truth

`clients.spec.js` verifies:

- canonical model-to-surface bindings from `src/clients/catalog.js`
- `ClientFactory` instantiation for every declared runtime candidate
- stable local capabilities for Claude, Codex, and Kimi clients
- subscription-first assumptions instead of API-billing-first defaults

The suite does **not** require live third-party provider sessions to validate the release contract.

## Run

```bash
npm run test:e2e
```

## Related Commands

```bash
npm run verify:provider-matrix
npm run verify:release
```
