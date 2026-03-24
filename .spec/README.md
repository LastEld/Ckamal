# SPEC Driven Development

**Root**: `.spec/`  
**Purpose**: Централизованное хранилище спецификаций проекта AMS (Agent Management System)  
**Version**: 1.0.0  
**Date**: 2026-03-23

---

## Структура спецификаций

```
.spec/
├── README.md              # Этот файл
├── api/                   # API контракты
├── acceptance/            # Acceptance критерии
├── architecture/          # Архитектурные решения (ADR)
├── domains/               # Спецификации по доменам
├── features/              # Функциональные спецификации
├── requirements/          # Требования
└── design/                # Design docs
```

---

## Маппинг существующих спецификаций

### API Контракты (src/domains/*/CONTRACT.md)

| Домен | Исходный файл | Описание |
|-------|---------------|----------|
| **domains** (master) | `src/domains/CONTRACT.md` | Мастер-контракт всех доменов |
| architecture | `src/domains/architecture/CONTRACT.md` | Архитектурный анализ |
| context | `src/domains/context/CONTRACT.md` | Контекст и снапшоты |
| gsd | `src/domains/gsd/CONTRACT.md` | GSD методология |
| integrations | `src/domains/integrations/CONTRACT.md` | Интеграции и webhooks |
| merkle | `src/domains/merkle/CONTRACT.md` | Merkle tree proofs |
| retention | `src/domains/retention/CONTRACT.md` | Retention policies |

### Acceptance Критерии

| Домен | Исходный файл |
|-------|---------------|
| merkle | `src/domains/merkle/ACCEPTANCE.md` |

### Архитектура

| Домен | Исходный файл |
|-------|---------------|
| merkle | `src/domains/merkle/ARCHITECTURE.md` |
| domains | `src/domains/VERIFICATION.md` |

### Domain Specs (дополнительные)

| Домен | Файлы |
|-------|-------|
| merkle | `src/domains/merkle/INTERFACE.md`, `src/domains/merkle/INVARIANTS.md` |

---

## Принципы SPEC driven development

### 1. Спецификация первична
- Каждая фича начинается со спецификации
- Код реализует спецификацию, а не наоборот
- Spec файлы живут дольше кода

### 2. Структура спецификации

```
.spec/
├── requirements/          # ЧТО нужно сделать
│   └── REQ-{id}.md       # Business requirements
├── features/              # КАК это работает с точки зрения пользователя
│   └── FEAT-{id}.md      # Feature specifications (Gherkin-style)
├── api/                   # КАКИЕ интерфейсы
│   └── API-{domain}.md   # API contracts
├── architecture/          # КАК устроено внутри
│   └── ADR-{nnnn}-{title}.md  # Architecture Decision Records
├── acceptance/            # КАК проверить
│   └── ACC-{domain}.md   # Acceptance criteria
└── design/                # UI/UX design
    └── DES-{id}.md       # Design specifications
```

### 3. Naming Conventions

- `REQ-{id}.md` - Требования (REQ-001-authentication.md)
- `FEAT-{id}.md` - Фичи (FEAT-001-batch-api.md)
- `ADR-{nnnn}-{title}.md` - Архитектурные решения (ADR-0001-use-sqlite.md)
- `API-{domain}.md` - API контракты (API-merkle.md)
- `ACC-{domain}.md` - Acceptance критерии (ACC-merkle.md)
- `DES-{id}.md` - Design specs (DES-001-dashboard.md)

---

## Workflow

### Создание новой фичи

1. **Requirements** → `.spec/requirements/REQ-{id}.md`
2. **Feature Spec** → `.spec/features/FEAT-{id}.md`
3. **API Contract** → `.spec/api/API-{domain}.md` (или обновление)
4. **Architecture** → `.spec/architecture/ADR-{nnnn}-{title}.md` (если новое решение)
5. **Acceptance** → `.spec/acceptance/ACC-{domain}.md`
6. **Implementation** → `src/`

### Обновление существующей фичи

1. Обновить спецификацию
2. Обновить acceptance критерии
3. Обновить код
4. Обновить ADR если архитектура меняется

---

## Статус покрытия

| Домен | Contract | Acceptance | Architecture | Interface | Invariants |
|-------|----------|------------|--------------|-----------|------------|
| architecture | ✅ | ❌ | ❌ | ❌ | ❌ |
| context | ✅ | ❌ | ❌ | ❌ | ❌ |
| gsd | ✅ | ❌ | ❌ | ❌ | ❌ |
| integrations | ✅ | ❌ | ❌ | ❌ | ❌ |
| merkle | ✅ | ✅ | ✅ | ✅ | ✅ |
| orchestration | ❌ | ❌ | ❌ | ❌ | ❌ |
| retention | ✅ | ❌ | ❌ | ❌ | ❌ |
| roadmaps | ❌ | ❌ | ❌ | ❌ | ❌ |
| tasks | ❌ | ❌ | ❌ | ❌ | ❌ |
| thought | ❌ | ❌ | ❌ | ❌ | ❌ |

**Всего доменов**: 10  
**С контрактами**: 6/10 (60%)  
**Полное покрытие (merkle)**: 1/10 (10%)

---

## Template: Новая спецификация

### Шаблон Contract (API-{domain}.md)

```markdown
# API Contract: {Domain}

**Surface**: src/domains/{domain}  
**Version**: 1.0.0  
**Status**: Draft → Review → Approved → Deprecated

## 1. Interface Map

| Export | Type | Signature | Purpose |
|--------|------|-----------|---------|

## 2. Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|

## 3. Acceptance Criteria

- [ ] AC-1: ...

## 4. Dependencies

### Required
- 

### Provided To
- 
```

### Шаблон Feature (FEAT-{id}.md)

```markdown
# Feature: {Title}

**ID**: FEAT-{id}  
**Status**: Draft  
**Priority**: P0/P1/P2  
**Owner**: 

## User Story

As a {role}, I want {goal}, so that {benefit}.

## Acceptance Criteria (Gherkin)

### Scenario: {Title}
**Given** {context}  
**When** {action}  
**Then** {expected result}

## Technical Notes

## Dependencies

## Open Questions
```

### Шаблон ADR (ADR-{nnnn}-{title}.md)

```markdown
# ADR-{nnnn}: {Title}

**Status**: Proposed → Accepted → Deprecated → Superseded by ADR-{nnnn}  
**Date**: YYYY-MM-DD  
**Deciders**: 

## Context

## Decision

## Consequences

### Positive
- 

### Negative
- 

## Alternatives Considered

## References
```

---

*Generated by: Agent Management System (AMS)*  
*Spec Version: 1.0.0*
