# CogniMesh (brand: Ckamal)

Multi-agent AI orchestration platform. Subscription-only ($18-20/month flat per provider). No API keys, no metered billing.

## Architecture

- **Node.js ESM** (`"type": "module"` in package.json)
- **Providers**: Claude (Anthropic), Codex/GPT (OpenAI), Kimi (Moonshot)
- **Surfaces**: CLI, Desktop App, VS Code Extension per provider
- **Model matrix**: 7 models across 3 providers, verified by `npm run verify:provider-matrix`

## Key Conventions

- `costPer1kTokens` in catalog.js = **routing weights**, NOT billing rates
- Analytics stub in `src/analytics/index.js` is a no-op — billing code archived to `src/analytics/_archived/`
- All CLI clients use subprocess spawning with `shell: true` only for `.cmd`/`.bat` wrappers on Windows
- Kimi CLI uses `-p` flag for prompt content, Claude CLI uses positional argument
- GitHub Pages site lives in `docs/` folder
- Logo: `docs/assets/brand/proposallogo2-transparent.png` (transparent background)

## Commands

```bash
npm test                        # Unit tests (Node test runner)
npm run verify:provider-matrix  # Verify 7-model subscription matrix
npm run verify:docs             # Validate doc references
npm run build                   # Production build (lint + bundle)
npm run lint                    # ESLint (warnings only, no errors)
```

## Rules

- Never add API billing, metered cost tracking, or invoice features
- Never reference "6 humps" — that concept was removed
- Keep all model configs without `pricing` fields
- Test with `npm test` before committing
