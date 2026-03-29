# Round 3, Step 4: Documentation Comparison

**Date:** March 29, 2026  
**Scope:** Comparative analysis of Paperclip vs Ckamal documentation approaches  
**Goal:** Identify absorbed practices and recommend future adoptions

---

## Executive Summary

This document synthesizes findings from R1S5 (Ckamal documentation review) and R2S4 (Paperclip documentation review) to compare documentation strategies. The analysis reveals fundamental differences in philosophy: **Paperclip uses a specification-driven, planning-heavy approach**, while **Ckamal employs a feature-driven, current-state approach**.

| Metric | Paperclip | Ckamal | Winner |
|--------|-----------|--------|--------|
| Total Doc Files | 172 | 82 | Paperclip |
| Documentation Size | ~2.1 MB | ~1.3 MB | Paperclip |
| Planning Documents | 27 dated plans | 0 | Paperclip |
| SPEC Documents | 2 (1,405 lines) | 0 | Paperclip |
| README Quality | 290 lines + visuals | 502 lines + diagrams | Tie |
| CONTRIBUTING.md | 74 lines | 503 lines | Ckamal |
| API Coverage | 11 endpoints | 50+ endpoints | Ckamal |
| State Machines | Documented | Implied | Paperclip |

**Key Finding:** Ckamal has not adopted Paperclip's `doc/plans/` tradition or SPEC.md pattern despite these being identified as best practices.

---

## 1. doc/plans/ Tradition - Did We Adopt This?

### Paperclip Approach
Paperclip maintains **27 dated planning documents** in `doc/plans/YYYY-MM-DD-descriptive-slug.md` format:

| Date | Document | Focus |
|------|----------|-------|
| 2026-02-16 | module-system.md | Plugin architecture |
| 2026-02-18 | agent-authentication.md | Auth tiers (JWT, OAuth) |
| 2026-02-19 | ceo-agent-creation-and-hiring.md | CEO governance |
| 2026-03-14 | budget-policies-and-enforcement.md | Budget controls |
| 2026-03-17 | memory-service-surface-api.md | Memory service |

**Structure per plan document:**
```markdown
## Problem
## Design Principles
## Data Model Changes
## API Changes
## UI Changes
## Implementation Phases
## Tests
## Risks
## Open Questions
```

### Ckamal Status
**NOT ADOPTED.**

Ckamal has **zero dated planning documents**. Architecture decisions appear in:
- `docs/architecture/*.md` (current state only)
- `docs/archive/*.md` (post-hoc documentation)
- Root-level markdown files (mixed content)

**Gap Impact:** Design history is not preserved. Rationale for decisions is lost over time.

### Adoption Recommendation
**Priority: P0 - High Impact, Low Effort**

Create `docs/plans/YYYY-MM-DD-*.md` for:
- Major features before implementation
- Architecture decisions
- API changes
- Database migrations

---

## 2. SPEC.md Pattern - Do We Have Equivalent?

### Paperclip Hierarchy
```
doc/SPEC.md (531 lines) - Long-horizon vision/strategy
└── doc/SPEC-implementation.md (874 lines) - V1 build contract
    └── doc/plans/*.md (27 files) - Feature designs
```

**SPEC.md covers:**
- Company Model (Board governance, budget delegation)
- Agent Model (Adapter config, exportable orgs)
- Org Structure (Visibility, cross-team work)
- Heartbeat System (Adapters, pause behavior)
- Inter-Agent Communication
- Anti-Requirements (explicit scope boundaries)
- Principles (9 consolidated)

**SPEC-implementation.md covers:**
- Explicit V1 product decisions (table format)
- Canonical Data Model (15 tables with full specs)
- State machines (Agent, Issue, Approval)
- Auth and Permissions (Matrix)
- API Contract (Full endpoint list)
- Delivery Plan (6 milestones)
- Acceptance Criteria

### Ckamal Status
**NO EQUIVALENT.**

Ckamal has:
- `ARCHITECTURE.md` (62KB) - System design overview
- `docs/architecture/*.md` - Component-specific docs
- `docs/features/*.md` - Feature documentation

**Missing:**
- ❌ Explicit specification hierarchy
- ❌ Vision document codifying product direction
- ❌ V1 implementation contract
- ❌ Canonical data model specification
- ❌ Explicit state machine documentation

### Gap Impact
Without SPEC.md equivalent:
- Product vision is implicit in code
- Scope boundaries are unclear
- New contributors lack strategic context
- Version planning is ad-hoc

---

## 3. Planning Document Structure

### Paperclip's Planning Excellence

Every plan document includes:

| Section | Purpose |
|---------|---------|
| **Problem** | Why this matters |
| **Product Decisions** | What we're doing |
| **Data Model** | Schema changes |
| **API Plan** | Endpoint changes |
| **UI Plan** | Interface changes |
| **Implementation Phases** | How to build |
| **Tests** | Verification |
| **Risks** | What could go wrong |
| **Open Questions** | Decisions to make |

**Example from agent-authentication.md:**
```markdown
## Authentication Tiers

### Tier 1: Local Adapter (claude-local, codex-local)
**Trust model:** The adapter process runs on the same machine...
**Approach:** Paperclip generates a token and passes it directly...
**Token format:** Short-lived JWT issued per heartbeat...

### Tier 2: CLI-Driven Key Exchange
...

### Tier 3: Agent Self-Registration (Invite Link)
...
```

### Ckamal's Approach
Ckamal documents features post-implementation in `docs/features/`:
- `docs/features/APPROVALS.md`
- `docs/features/AUTHENTICATION.md`
- `docs/features/BILLING.md`
- `docs/features/HEARTBEAT.md`
- `docs/features/ISSUES.md`
- `docs/features/PLUGINS.md`

**Structure:** Architecture → Usage → API Reference

**Missing:** Pre-implementation planning, design rationale, rejected alternatives.

---

## 4. API Documentation Quality

### Paperclip Strengths

**Explicit Error Semantics:**
| Code | Meaning | Action |
|------|---------|--------|
| 400 | Validation error | Check request body |
| 409 | Conflict | Another agent owns task. **Do not retry.** |
| 422 | Semantic violation | Invalid state transition |

**Authentication Tiers Documented:**
- Agent API keys (long-lived)
- Agent run JWTs (short-lived)
- User session cookies

**Coverage:** 11 API endpoint files in `docs/api/`

### Ckamal Strengths

**Comprehensive Endpoint Coverage:**
- `API_REFERENCE.md` (93KB, 2000+ lines)
- `docs/api/ENDPOINTS.md` (938 lines)
- 50+ endpoints documented

**MCP Tools Documentation:**
- All 58 MCP tools documented with input/output schemas
- Categories: Task (11), Roadmap (13), Claude (12), System (12), Analysis (10)

**OpenAPI Specification:**
- `openapi.yaml` in root
- `docs/OPENAPI.yaml`

### Comparison

| Aspect | Paperclip | Ckamal | Winner |
|--------|-----------|--------|--------|
| Error semantics | ✅ Excellent | ⚠️ Basic | Paperclip |
| Auth tier docs | ✅ Documented | ❌ Missing | Paperclip |
| Endpoint count | 11 | 50+ | Ckamal |
| MCP tool docs | N/A | ✅ 58 tools | Ckamal |
| OpenAPI | ✅ Yes | ✅ Yes | Tie |
| Request/Response examples | ✅ Good | ✅ Good | Tie |

---

## 5. Developer Guides

### Paperclip's Developer Experience

| Document | Purpose | Lines |
|----------|---------|-------|
| `CONTRIBUTING.md` | Contribution guidelines | 74 |
| `doc/DEVELOPING.md` | Full dev setup | 450 |
| `doc/CLI.md` | CLI reference | 195 |
| `doc/DATABASE.md` | Database options | 168 |
| `doc/DEPLOYMENT-MODES.md` | Auth mode taxonomy | 8KB |

**Notable Features:**
1. **Worktree-Local Instances:** `paperclipai worktree init`
2. **Embedded PostgreSQL:** Zero-config development
3. **Dependency Lockfile Policy:** CI owns `pnpm-lock.yaml`
4. **Contribution "Thinking Path":** PRs must include reasoning from project goal

**Role-Specific Guides:**
- **Board Operator Guides (11):** Creating companies, managing agents, approvals
- **Agent Developer Guides (6):** Heartbeat protocol, task workflow, cost reporting

### Ckamal's Developer Documentation

| Document | Purpose | Lines |
|----------|---------|-------|
| `CONTRIBUTING.md` | Contribution guidelines | 503 |
| `docs/developers/GETTING_STARTED.md` | Developer onboarding | 397 |
| `docs/developers/PLUGIN_DEVELOPMENT.md` | Plugin authoring | 739 |
| `docs/developers/TESTING.md` | Test guidelines | - |
| `docs/cli/COMMANDS.md` | CLI documentation | 1000+ |

**Ckamal Strengths:**
- More comprehensive CONTRIBUTING.md (503 vs 74 lines)
- Better code style documentation
- More CLI command coverage
- Plugin SDK documentation

**Ckaml Weaknesses:**
- No worktree-local development docs
- No embedded DB documentation
- Limited persona separation
- No "Thinking Path" PR format

### Comparison

| Aspect | Paperclip | Ckamal | Winner |
|--------|-----------|--------|--------|
| CONTRIBUTING.md length | 74 lines | 503 lines | Ckamal |
| Dev environment tooling | ✅ Excellent | ⚠️ Basic | Paperclip |
| Code style docs | ⚠️ Basic | ✅ Comprehensive | Ckamal |
| Persona separation | ✅ Strong | ⚠️ Weak | Paperclip |
| Worktree support | ✅ Documented | ❌ Missing | Paperclip |

---

## 6. Anti-Requirements Documentation

### Paperclip's Anti-Requirements (Excellent Practice)

From `SPEC.md`:

| What | Why Not |
|------|---------|
| Not an Agent runtime | Orchestrates, doesn't execute |
| Not a knowledge base | Plugin territory |
| Not a SaaS | Single-tenant, self-hosted |
| Not automatically self-healing | Surfaces problems |
| Does not auto-reassign work | Manual recovery |

From `PRODUCT.md`:

**Do not:**
- Do not make the core product a general chat app
- Do not build a complete Jira/GitHub replacement
- Do not build enterprise-grade RBAC first
- Do not lead with raw bash logs and transcripts
- Do not force users to understand provider/API-key plumbing

### Ckamal Status
**NOT ADOPTED.**

Ckamal has no explicit anti-requirements section. Scope boundaries are implied through:
- Feature descriptions
- Architecture documentation
- "What's New" sections

**Gap Impact:**
- Scope creep risk
- Unclear product boundaries
- Difficult to say "no" to feature requests

---

## 7. State Machine Documentation

### Paperclip's State Machines

From `SPEC-implementation.md`:

**Agent Status:**
```
active | paused | idle | running | error | terminated
```

**Issue Status:**
```
backlog | todo | in_progress | in_review | done | blocked | cancelled
```

**Approval Status:**
```
pending | approved | rejected
```

Each includes:
- Allowed transitions
- Invariants
- Terminal states

### Ckamal's Approach

From `docs/features/ISSUES.md`:
```
backlog ─────► todo ─────► in_progress ─────► in_review ─────► completed
   │              │              │               │
   │              │              │               └────► blocked
   │              │              │
   └──────────────┴──────────────┴────────────────────► cancelled
```

**Difference:** Ckamal documents current workflow; Paperclip documents formal state machine with transitions and invariants.

---

## 8. README Quality

### Paperclip README

| Aspect | Score | Notes |
|--------|-------|-------|
| Visual Appeal | 10/10 | Header video, badges, feature matrix |
| Product Positioning | 10/10 | "Control plane for autonomous AI companies" |
| Value Proposition | 9/10 | "If OpenClaw is an employee, Paperclip is the company" |
| Quickstart | 10/10 | `npx paperclipai onboard --yes` |
| Feature Overview | 9/10 | 9 features in visual table grid |
| Problem/Solution | 10/10 | Before/After comparison table |

**Notable Elements:**
- Header video demonstrating product
- "What Paperclip is not" section clarifying boundaries
- Star history chart showing project growth
- Integration ecosystem logo grid

### Ckamal README

| Aspect | Score | Notes |
|--------|-------|-------|
| Visual Appeal | 8/10 | Logo, badges, architecture diagram |
| Product Positioning | 8/10 | "Multi-model AI orchestration" clear |
| Quickstart | 9/10 | Interactive setup wizard highlighted |
| Model Matrix | 9/10 | Comprehensive table with 7 models |
| Feature Overview | 8/10 | Highlights section with 8 features |

**Notable Elements:**
- ASCII architecture diagram
- Model/provider matrix with badges
- Deploy buttons (Heroku, Railway)
- Release gate documentation

### Comparison

| Element | Paperclip | Ckamal | Winner |
|---------|-----------|--------|--------|
| Video demonstration | ✅ Yes | ❌ No | Paperclip |
| "What it's not" section | ✅ Yes | ❌ No | Paperclip |
| Visual polish | ✅ High | ✅ Good | Paperclip |
| Model matrix | ⚠️ Basic | ✅ Excellent | Ckamal |
| Quickstart simplicity | ✅ One command | ✅ Interactive | Tie |

---

## 9. CHANGELOG Maintenance

### Paperclip

**Location:** `releases/` directory with versioned files
- `releases/v0.2.7.md`
- `releases/v0.3.0.md`
- `releases/v2026.318.0.md`

**No root CHANGELOG.md** - identified as a gap.

### Ckamal

**Location:** Root `CHANGELOG.md` (354 lines)

Format: Keep a Changelog standard
```markdown
## [5.0.1] - 2026-03-28

### 🐛 Bug Fixes
#### ParseInt Radix Fixes
- Fixed 74 `parseInt()` calls to use explicit radix 10 parameter
...

## [5.0.0] - 2026-03-23
### 🎉 Major Release - CogniMesh BIOS
...
```

**Also:** `docs/CHANGELOG_NEW.md` (duplicate - needs consolidation)

### Winner: Ckamal

Ckamal has better CHANGELOG maintenance with:
- Clear version history
- Categorized changes
- Detailed release notes
- Semantic versioning

---

## 10. Overall Documentation Strategy

### Paperclip's Strategy: **Specification-Driven**

```
Vision (SPEC.md)
    ↓
Implementation Contract (SPEC-implementation.md)
    ↓
Feature Plans (doc/plans/YYYY-MM-DD-*.md)
    ↓
Code Implementation
    ↓
User Guides (docs/guides/)
```

**Characteristics:**
- ✅ Design before implementation
- ✅ Preserved design history
- ✅ Explicit scope boundaries
- ✅ Role-based documentation
- ⚠️ Heavier overhead
- ⚠️ Requires discipline

### Ckamal's Strategy: **Feature-Driven**

```
Feature Implementation
    ↓
Documentation (docs/features/)
    ↓
User Guides (docs/tutorials/)
    ↓
API Reference (API_REFERENCE.md)
```

**Characteristics:**
- ✅ Lighter weight
- ✅ Faster iteration
- ✅ Comprehensive API docs
- ✅ Good CHANGELOG maintenance
- ⚠️ Design rationale lost
- ⚠️ Scope boundaries unclear
- ⚠️ No planning tradition

---

## What Documentation Practices Did We Absorb from Paperclip?

### Practices NOT Adopted (Identified in R2S4)

| Practice | Paperclip Status | Ckamal Status | Gap Age |
|----------|-----------------|---------------|---------|
| Dated planning docs (`doc/plans/`) | ✅ 27 files | ❌ 0 files | 3+ months |
| SPEC.md (vision document) | ✅ 531 lines | ❌ None | N/A |
| SPEC-implementation.md (V1 contract) | ✅ 874 lines | ❌ None | N/A |
| Anti-requirements list | ✅ Documented | ❌ Missing | N/A |
| State machine documentation | ✅ Formal | ⚠️ Informal | N/A |
| Role-specific guides | ✅ 17 guides | ⚠️ 6 guides | N/A |
| "Thinking Path" PR format | ✅ Required | ❌ Not used | N/A |
| Worktree-local dev docs | ✅ Documented | ❌ Missing | N/A |

### Practices Partially Adopted

| Practice | Adoption Level | Notes |
|----------|----------------|-------|
| Feature documentation | ⚠️ Partial | Ckamal has feature docs but post-hoc |
| Architecture diagrams | ⚠️ Partial | ASCII diagrams present, fewer visual |
| API error semantics | ⚠️ Partial | Basic error docs, not as explicit |
| Developer guides | ⚠️ Partial | Good coverage, missing persona separation |

### Practices Where Ckamal Exceeds Paperclip

| Practice | Ckamal Advantage |
|----------|-----------------|
| CONTRIBUTING.md | 503 vs 74 lines |
| API endpoint coverage | 50+ vs 11 endpoints |
| MCP tool documentation | 58 tools cataloged |
| Model matrix documentation | 7 models, 3 providers |
| CHANGELOG maintenance | Root-level, detailed |

---

## What Should We Adopt Going Forward?

### Immediate Wins (P0 - This Sprint)

#### 1. Create `docs/plans/` Directory
```
docs/plans/YYYY-MM-DD-feature-name.md
```

**Template:**
```markdown
# Feature Name

## Problem
## Product Decisions
## Data Model Changes
## API Changes
## UI Changes
## Implementation Phases
## Tests
## Risks
## Open Questions
```

**First candidates:**
- Multi-provider routing improvements
- Billing system enhancements
- Dashboard component architecture

#### 2. Add Anti-Requirements Section to README
```markdown
## What CogniMesh Is Not

| What | Why Not |
|------|---------|
| Not a code editor | Use VS Code/Cursor |
| Not a git host | Use GitHub/GitLab |
| Not an API billing platform | Subscription-only routing |
```

#### 3. Document State Machines
Add to `docs/features/`:
```markdown
### State Transitions

Allowed: `idle -> running -> completed`
Not Allowed: `idle -> completed` (must run first)

### Invariants
- Terminal states: `completed`, `failed`, `cancelled`
- Only `running` can transition to `completed`
```

### Medium-Term (P1 - Next 2 Weeks)

#### 4. Create SPEC.md Equivalent
Create `docs/VISION.md` or `docs/SPEC.md` with:
- Product principles
- Anti-requirements
- Long-horizon goals
- Architecture philosophy

#### 5. Create SPEC-implementation.md Equivalent
Create `docs/IMPLEMENTATION_CONTRACT.md` with:
- Current release scope
- Canonical data model
- API contract
- State machines
- Acceptance criteria

#### 6. Role-Based Documentation Restructure
```
docs/guides/
├── operators/      # Dashboard, monitoring
├── developers/     # API, plugins
└── administrators/ # Deployment, security
```

### Long-Term (P2 - Next Month)

#### 7. Adopt "Thinking Path" for PRs
Update CONTRIBUTING.md:
```markdown
## PR Description Format

### Thinking Path
1. **Project Goal:** What is CogniMesh trying to achieve?
2. **Problem:** What specific issue does this address?
3. **Solution:** What was changed and why?
4. **Verification:** How was this tested?
```

#### 8. Documentation Automation
- Auto-generate API docs from OpenAPI
- Auto-update model matrix from catalog.js
- Link plans to implementations

---

## Documentation Suite Ratings

### Paperclip Documentation Grade: **A (9.2/10)**

**Strengths:**
- ✅ Comprehensive specification hierarchy
- ✅ Dated planning tradition (27 plans)
- ✅ Clear anti-requirements
- ✅ Visual polish and presentation
- ✅ Role-specific guides
- ✅ Explicit state machines
- ✅ "Thinking Path" PR format

**Weaknesses:**
- ⚠️ Contributing guide too brief (74 lines)
- ⚠️ Limited troubleshooting docs
- ⚠️ No root CHANGELOG

**Best For:**
- Large teams needing explicit contracts
- Projects requiring design preservation
- Multi-stakeholder coordination

---

### Ckamal Documentation Grade: **B+ (8.4/10)**

**Strengths:**
- ✅ Comprehensive CONTRIBUTING.md (503 lines)
- ✅ Good API endpoint coverage (50+ endpoints)
- ✅ Excellent model matrix documentation
- ✅ Strong quick start guide
- ✅ Good CHANGELOG maintenance
- ✅ 58 MCP tools documented

**Weaknesses:**
- ❌ No planning document tradition
- ❌ Missing specification hierarchy
- ❌ No anti-requirements
- ❌ Limited persona separation
- ⚠️ Duplicate documentation exists
- ⚠️ State machines not formalized

**Best For:**
- Fast-moving development teams
- Smaller teams with shared context
- API-first documentation needs

---

## Summary Matrix

| Category | Paperclip | Ckamal | Gap Status |
|----------|-----------|--------|------------|
| **Planning Tradition** | A+ (27 plans) | F (0 plans) | ❌ Not adopted |
| **Specification Hierarchy** | A (SPEC.md → SPEC-impl.md) | C (ARCHITECTURE.md only) | ❌ Not adopted |
| **Anti-Requirements** | A (documented) | F (missing) | ❌ Not adopted |
| **State Machines** | B+ (formal) | C (informal) | ⚠️ Partial |
| **README Quality** | A (visual + video) | B+ (diagrams) | ⚠️ Partial |
| **API Documentation** | B (good semantics) | A (comprehensive) | ✅ Exceeds |
| **Developer Guides** | B (role-based) | B+ (comprehensive) | ⚠️ Partial |
| **CONTRIBUTING.md** | C (74 lines) | A (503 lines) | ✅ Exceeds |
| **CHANGELOG** | C (releases/ only) | A (root + detailed) | ✅ Exceeds |
| **Persona Separation** | A (board/dev guides) | C (mixed) | ❌ Not adopted |
| **Visual Polish** | A (videos, grids) | B (ASCII diagrams) | ⚠️ Partial |

---

## Conclusion

**Key Insight:** Ckamal's documentation is **feature-complete but process-light**. While API docs, README, and CHANGELOG are excellent, the project lacks:

1. **Specification discipline** - No SPEC.md equivalent
2. **Planning tradition** - No dated design documents
3. **Scope boundaries** - No anti-requirements
4. **Persona separation** - Mixed audience docs

**Recommendation:** Adopt Paperclip's **specification-driven approach** for major features while maintaining Ckamal's **API documentation excellence**.

**Priority Actions:**
1. Create `docs/plans/` and adopt dated planning (P0)
2. Add anti-requirements to README (P0)
3. Document state machines formally (P0)
4. Create VISION.md or SPEC.md (P1)
5. Restructure guides by persona (P1)
6. Adopt "Thinking Path" for PRs (P2)

With these changes, Ckamal documentation could achieve **A-grade (9.0+)** status.

---

*Comparison Complete - March 29, 2026*
*Next Review: After implementation of P0 recommendations*
