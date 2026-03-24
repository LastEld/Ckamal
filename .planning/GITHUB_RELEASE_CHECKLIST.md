# GitHub Release Checklist

Date: 2026-03-25

## Repository Face

- [x] clean root with historical reports moved out of the public entry surface
- [x] GitHub-facing README in place
- [x] transparent camel logo committed
- [x] banner and Pages landing committed

## Verification

- [x] `npm run verify:release`
- [x] `npm run verify:provider-matrix`
- [x] `npm run build -- --skip-lint`
- [x] dashboard browser-shell smoke exists

## Workflows

- [x] CI workflow matches actual package scripts
- [x] patch verification workflow matches actual package scripts
- [x] Pages workflow uploads `docs/`
- [x] release workflow packages archives and checksums

## GitHub Operations

- [x] remote `origin` points to `https://github.com/LastEld/Ckamal.git`
- [x] branch `main` contains the verified release state
- [x] initial push to `main` completed
- [x] Pages workflow completed successfully
- [x] CI workflow completed successfully
- [x] release tag pushed
- [x] release workflow completed successfully

## Operator Reality

- [x] subscription-first matrix is documented
- [x] external local client prerequisites are documented
- [x] no normal release doc claims that Ckamal provisions third-party subscriptions itself
