# Codex Insights

Date: 2026-03-25  
Project: Ckamal / CogniMesh BIOS  
Session outcome: release surface finalized and published

## Final Truth

- GitHub repository: `https://github.com/LastEld/Ckamal`
- default branch: `main`
- GitHub Pages: `https://lasteld.github.io/Ckamal/`
- tagged release: `v5.0.0`
- release assets: `.tar.gz`, `.zip`, `.sha256`

## Architecture Layers

The platform is organized into six structural layers:

1. **BIOS orchestration** — agent spawn, mode switching, pool control
2. **Subscription runtime** — provider matrix with 7 models × 3 providers
3. **Domain state** — tasks, roadmaps, contexts, merkle state
4. **Execution bus** — message routing, dead-letter handling
5. **Operator surfaces** — CLI, Desktop, VS Code, App, Copilot
6. **Release plane** — CI/CD, GitHub Actions, Pages deployment

## What Closed

- repository/schema contract was aligned for tasks, roadmaps, contexts, and merkle state
- canonical subscription-backed provider matrix was verified for seven model groups
- build, CI, patch verification, Pages, and release workflows were brought into agreement
- GitHub Pages was enabled and bound to the repository homepage
- `v5.0.0` was published with packaged artifacts and checksums

## Operator Reality

The repository is release-ready and publicly published, but live model execution still depends on the operator having the required local desktop app, CLI, or VS Code client installed and authenticated.
