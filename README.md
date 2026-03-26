<div align="center">

<img src="docs/assets/brand/proposallogo2-transparent.png" alt="CogniMesh" width="280" />

# CogniMesh

**Multi-model AI orchestration. Subscription-first.**

Route work across GPT, Claude, and Kimi through flat-rate subscriptions.<br/>
No API keys. No metered billing. No surprises.

<br/>

[![CI](https://img.shields.io/github/actions/workflow/status/LastEld/Ckamal/ci.yml?label=CI&style=for-the-badge&logo=github&logoColor=white)](https://github.com/LastEld/Ckamal/actions/workflows/ci.yml)
[![Pages](https://img.shields.io/github/actions/workflow/status/LastEld/Ckamal/pages.yml?label=Pages&style=for-the-badge&logo=github&logoColor=white)](https://github.com/LastEld/Ckamal/actions/workflows/pages.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](#quick-start)

![Models](https://img.shields.io/badge/models-7-e67e22?style=for-the-badge)
![Providers](https://img.shields.io/badge/providers-3-3498db?style=for-the-badge)
![Surfaces](https://img.shields.io/badge/surfaces-5-9b59b6?style=for-the-badge)
![Billing](https://img.shields.io/badge/%2418--20%2Fmo-subscription--only-2ecc71?style=for-the-badge)

<br/>

[**Landing Page**](https://lasteld.github.io/Ckamal/) &nbsp;&middot;&nbsp;
[**Quick Start**](#-quick-start) &nbsp;&middot;&nbsp;
[**Model Matrix**](#-model-matrix) &nbsp;&middot;&nbsp;
[**Architecture**](#-architecture) &nbsp;&middot;&nbsp;
[**Docs**](#-documentation)

</div>

<br/>

---

<br/>

## Overview

CogniMesh orchestrates **7 AI models** from **3 providers** across **5 operator surfaces** — all through your existing flat-rate subscriptions. The intelligent router selects the best model for each task based on quality, latency, and complexity scoring.

```
                              ┌─────────────────────────────────────────────┐
                              │          Subscription Clients               │
                              │  Claude Pro   ChatGPT Pro   Kimi Sub       │
                              └──────┬──────────┬──────────────┬───────────┘
                                     │          │              │
  ┌──────────┐    ┌──────────┐    ┌──┴──────────┴──────────────┴──┐
  │ Operator │───>│  Router   │───>│         7 Models               │
  │          │    │          │    │                                 │
  │ CLI      │    │ Quality  │    │  Opus 4.6  ·  Opus 4.5        │
  │ Desktop  │    │ Latency  │    │  Sonnet 4.6  ·  Sonnet 4.5    │
  │ VS Code  │    │ Load     │    │  GPT-5.4  ·  GPT-5.3          │
  │ App      │    │ Domain   │    │  Kimi K2.5                     │
  └──────────┘    └──────────┘    └────────────────────────────────┘
```

<br/>

---

<br/>

## Highlights

<table>
<tr>
<td width="33%" valign="top">

### Multi-Model Routing

Intelligent routing across GPT, Claude, and Kimi based on task complexity, latency, and quality scores. Automatic fallback chains when primary models are unavailable.

</td>
<td width="33%" valign="top">

### Zero API Billing

No API keys needed. No metered charges. Everything routes through your existing flat-rate subscriptions at $18-20/month per provider.

</td>
<td width="33%" valign="top">

### 5 Operator Surfaces

CLI, Desktop App, VS Code Extension, Copilot, and Cursor IDE. Use the interface that fits your workflow.

</td>
</tr>
<tr>
<td width="33%" valign="top">

### Extended Thinking

Deep reasoning chains with Claude Opus and GPT-5.4. Budget-controlled thinking for complex multi-step problems.

</td>
<td width="33%" valign="top">

### BIOS Orchestration

Agent spawn management, mode switching, pool control, and the full orchestration lifecycle through the kernel.

</td>
<td width="33%" valign="top">

### Release-Ready

CI/CD pipelines, provider matrix verification, release packaging, and GitHub Actions — all wired and tested.

</td>
</tr>
</table>

<br/>

---

<br/>

## Quick Start

```bash
git clone https://github.com/LastEld/Ckamal.git
cd Ckamal
npm install
npm run verify:release    # lint + unit + integration + e2e + provider-matrix
npm start
```

<details>
<summary><b>Environment variables</b> (optional — no API keys needed)</summary>

<br/>

```bash
# Paths to your locally installed subscription clients
CLAUDE_CLI_PATH=...
CODEX_CLI_PATH=...
KIMI_CLI_PATH=...

# VS Code extension sockets
CLAUDE_VSCODE_SOCKET_PATH=...
CODEX_VSCODE_PORT=...
KIMI_VSCODE_SOCKET_PATH=...

# Infrastructure
DATABASE_PATH=./data/cognimesh.db
GITHUB_TOKEN=ghp_...
```

All models are accessed through your subscription clients. No API keys or billing setup required.

</details>

<br/>

**[back to top](#cognimesh)**

<br/>

---

<br/>

## Model Matrix

> Canonical source: [`src/clients/catalog.js`](src/clients/catalog.js)<br/>
> Verified on every CI run by [`tests/e2e/clients.spec.js`](tests/e2e/clients.spec.js)

<table>
<tr>
<th>Model</th>
<th>Provider</th>
<th>Surfaces</th>
<th>Strength</th>
</tr>

<tr>
<td><b>claude-opus-4-6</b></td>
<td><img src="https://img.shields.io/badge/Anthropic-8e44ad?style=flat-square" /></td>
<td><code>desktop</code> <code>cli</code></td>
<td>Flagship reasoning, 1M context</td>
</tr>

<tr>
<td><b>claude-opus-4-5</b></td>
<td><img src="https://img.shields.io/badge/Anthropic-8e44ad?style=flat-square" /></td>
<td><code>desktop</code> <code>cli</code></td>
<td>Premium fallback, proven stability</td>
</tr>

<tr>
<td><b>claude-sonnet-4-6</b></td>
<td><img src="https://img.shields.io/badge/Anthropic-8e44ad?style=flat-square" /></td>
<td><code>vscode</code> <code>cli</code></td>
<td>Fast IDE coding, computer use</td>
</tr>

<tr>
<td><b>claude-sonnet-4-5</b></td>
<td><img src="https://img.shields.io/badge/Anthropic-8e44ad?style=flat-square" /></td>
<td><code>cli</code> <code>vscode</code></td>
<td>Balanced performance lane</td>
</tr>

<tr>
<td><b>gpt-5.4-codex</b></td>
<td><img src="https://img.shields.io/badge/OpenAI-27ae60?style=flat-square" /></td>
<td><code>vscode</code> <code>app</code> <code>cli</code></td>
<td>Broadest surface, 256K context</td>
</tr>

<tr>
<td><b>gpt-5.3-codex</b></td>
<td><img src="https://img.shields.io/badge/OpenAI-27ae60?style=flat-square" /></td>
<td><code>cli</code></td>
<td>Lightweight local execution</td>
</tr>

<tr>
<td><b>kimi-k2-5</b></td>
<td><img src="https://img.shields.io/badge/Moonshot-2980b9?style=flat-square" /></td>
<td><code>vscode</code> <code>cli</code></td>
<td>Long context, multimodal thinking</td>
</tr>

</table>

<details>
<summary><b>Model aliases</b></summary>

<br/>

| Alias | Resolves to |
|:------|:------------|
| `ide` | `vscode` |
| `claude-opus-4` | `claude-opus-4-6` |
| `claude-opus-4-5-latest` | `claude-opus-4-5` |
| `kimi-k2` | `kimi-k2-5` |

</details>

<details>
<summary><b>Fallback chains</b></summary>

<br/>

| Chain | Models |
|:------|:-------|
| **standard** | Sonnet 4.6 &rarr; Sonnet 4.5 &rarr; GPT-5.4 &rarr; GPT-5.3 |
| **premium** | Opus 4.6 &rarr; Opus 4.5 &rarr; Sonnet 4.6 &rarr; GPT-5.4 |
| **economy** | GPT-5.3 &rarr; Kimi K2.5 &rarr; Sonnet 4.5 |
| **speed** | GPT-5.3 &rarr; Kimi K2.5 &rarr; Sonnet 4.6 |

</details>

<br/>

**[back to top](#cognimesh)**

<br/>

---

<br/>

## Subscription Model

Every provider runs through the operator's existing subscription client — never through direct API billing.

| Provider | Client | Monthly Cost |
|:---------|:-------|:-------------|
| ![Anthropic](https://img.shields.io/badge/Anthropic-8e44ad?style=flat-square&logo=data:image/svg+xml;base64,&logoColor=white) | Claude Pro / Max | ~$20 |
| ![OpenAI](https://img.shields.io/badge/OpenAI-27ae60?style=flat-square&logo=openai&logoColor=white) | ChatGPT Pro / Plus | ~$20 |
| ![Moonshot](https://img.shields.io/badge/Moonshot-2980b9?style=flat-square&logoColor=white) | Kimi subscription | ~$18 |

The router uses quality/latency/complexity scoring for model selection. `costPer1kTokens` in the catalog are **routing weights**, not billing rates.

<br/>

---

<br/>

## Architecture

```
src/
├── bios/              # BIOS orchestration, CLI, modes, kernel
├── clients/           # Surface clients (Claude, Codex, Kimi)
│   ├── catalog.js     # Canonical model ↔ surface registry
│   └── index.js       # ClientFactory
├── models/            # Provider-specific model configurations
├── router/            # Multi-factor intelligent model routing
├── controllers/       # Request handlers and domain logic
├── domains/           # Tasks, roadmaps, contexts, merkle state
├── dashboard/         # Web UI for operator management
├── db/                # SQLite schema, migrations
├── middleware/        # Auth, rate limiting, validation
├── security/          # Authentication, sanitization
└── server.js          # Main entry point
```

<br/>

---

<br/>

## Release Gate

Three commands verify the entire surface before any push, tag, or release:

| Command | What it runs |
|:--------|:-------------|
| `npm run verify:release` | lint &rarr; unit &rarr; integration &rarr; e2e &rarr; provider-matrix |
| `npm run verify:provider-matrix` | Verifies all 7 model-surface bindings match catalog |
| `npm run build` | Cross-platform build smoke test (PowerShell/Bash) |

<br/>

---

<br/>

## GitHub Surface

| Workflow | Badge | Purpose |
|:---------|:------|:--------|
| CI | [![CI](https://img.shields.io/github/actions/workflow/status/LastEld/Ckamal/ci.yml?style=flat-square&logo=github)](https://github.com/LastEld/Ckamal/actions/workflows/ci.yml) | Full test pipeline on every push |
| Patch Verification | [![Patch](https://img.shields.io/github/actions/workflow/status/LastEld/Ckamal/patch-verification.yml?style=flat-square&logo=github)](https://github.com/LastEld/Ckamal/actions/workflows/patch-verification.yml) | Pre-release validation gate |
| Pages | [![Pages](https://img.shields.io/github/actions/workflow/status/LastEld/Ckamal/pages.yml?style=flat-square&logo=github)](https://github.com/LastEld/Ckamal/actions/workflows/pages.yml) | Deploys `docs/` as GitHub Pages |
| Release | [![Release](https://img.shields.io/github/actions/workflow/status/LastEld/Ckamal/release.yml?style=flat-square&logo=github)](https://github.com/LastEld/Ckamal/actions/workflows/release.yml) | Package + checksums + GitHub Release |

**Live site:** [lasteld.github.io/Ckamal](https://lasteld.github.io/Ckamal/)

<br/>

---

<br/>

## Documentation

| Document | Description |
|:---------|:------------|
| [Claude Sonnet 4.6 Integration](docs/integrations/CLAUDE_SONNET_46_INTEGRATION.md) | Sonnet IDE and CLI integration guide |
| [GPT-5.4 Codex Integration](docs/integrations/GPT54_CODEX_INTEGRATION.md) | Codex multi-surface integration |
| [Kimi 2.5 Integration](docs/integrations/KIMI_25_INTEGRATION_REPORT.md) | Moonshot/Kimi setup and config |
| [Claude Desktop + Opus 4.6](docs/CLAUDE_DESKTOP_OPUS46_INTEGRATION.md) | Desktop app WebSocket integration |
| [Kimi VS Code](docs/kimi-vscode-integration.md) | Kimi IDE extension guide |
| [Deploy Checklist](docs/release/DEPLOY_CHECKLIST.md) | Pre-deployment verification steps |
| [Monitoring](docs/operations/MONITORING.md) | Operational monitoring and metrics |

Historical reports are archived in [`docs/reports/historical/`](docs/reports/historical/).

<br/>

**[back to top](#cognimesh)**

<br/>

---

<div align="center">

<img src="docs/assets/brand/proposallogo2-transparent.png" alt="" width="80" />

<sub><b>CogniMesh</b> &mdash; Multi-model AI orchestration, subscription-first.</sub>

</div>
