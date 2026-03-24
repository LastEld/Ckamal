# GitHub Main Release Checklist

Date: 2026-03-25

## Local state

- [x] README is GitHub-facing and readable
- [x] Project status is honest
- [x] Integration checklist is honest
- [x] Transparent PNG logo exists
- [x] GitHub Pages site exists under `docs/`
- [x] `ci.yml` exists
- [x] `patch-verification.yml` exists
- [x] `release.yml` exists
- [x] `pages.yml` exists
- [x] `npm run verify:release` passes locally
- [x] `npm run build -- --skip-lint` passes locally

## Remote execution still required

- [ ] Remote `origin` points to `LastEld/Ckamal`
- [ ] Local branch is `main`
- [ ] First push to remote succeeds
- [ ] GitHub Actions run successfully on `main`
- [ ] GitHub Pages deploy succeeds
- [ ] Repository homepage points to Pages URL
- [ ] First release tag succeeds
