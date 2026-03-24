# Architecture Specifications

**Path**: `.spec/architecture/`  
**Purpose**: Архитектурные решения (ADR), design documents, architectural boundaries

---

## Источники спецификаций

| Документ | Файл | Статус |
|----------|------|--------|
| Domain Verification | [`src/domains/VERIFICATION.md`](../../src/domains/VERIFICATION.md) | ✅ Active |
| Merkle Architecture | [`src/domains/merkle/ARCHITECTURE.md`](../../src/domains/merkle/ARCHITECTURE.md) | ✅ Complete |

## ADR (Architecture Decision Records)

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| - | - | - | - |

---

## Структура ADR

```markdown
# ADR-{nnnn}: {Title}

**Status**: Proposed → Accepted → Deprecated → Superseded  
**Date**: YYYY-MM-DD  
**Deciders**: 

## Context

Проблема или необходимость изменения.

## Decision

Принятое решение.

## Consequences

### Positive
- 

### Negative
- 

### Neutral
- 

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|-------------|------|------|----------|
| Option A | ... | ... | Rejected |
| Option B | ... | ... | Accepted |

## References
- Links
- Related ADRs
```

---

## Template: ADR-{nnnn}-{title}.md

```markdown
# ADR-{nnnn}: {Title}

**Status**: Proposed  
**Date**: YYYY-MM-DD  
**Deciders**: 

## Context

## Decision

## Consequences

### Positive

### Negative

## Alternatives Considered

## References
```
