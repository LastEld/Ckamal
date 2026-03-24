# API Specifications

**Path**: `.spec/api/`  
**Purpose**: API контракты и interface definitions

---

## Источники спецификаций

Спецификации API хранятся в `src/domains/*/CONTRACT.md` и доступны через симлинки/индексы ниже.

## Доступные контракты

| Домен | Файл | Статус | Описание |
|-------|------|--------|----------|
| **domains** (master) | [`src/domains/CONTRACT.md`](../../src/domains/CONTRACT.md) | ✅ Active | Мастер-контракт всех доменов |
| architecture | [`src/domains/architecture/CONTRACT.md`](../../src/domains/architecture/CONTRACT.md) | ✅ Active | Архитектурный анализ модулей |
| context | [`src/domains/context/CONTRACT.md`](../../src/domains/context/CONTRACT.md) | ✅ Active | Контекст и immutable snapshots |
| gsd | [`src/domains/gsd/CONTRACT.md`](../../src/domains/gsd/CONTRACT.md) | ✅ Active | GSD методология и leases |
| integrations | [`src/domains/integrations/CONTRACT.md`](../../src/domains/integrations/CONTRACT.md) | ✅ Active | Webhooks и notifications |
| merkle | [`src/domains/merkle/CONTRACT.md`](../../src/domains/merkle/CONTRACT.md) | ✅ Active | Merkle tree proofs и verification |
| retention | [`src/domains/retention/CONTRACT.md`](../../src/domains/retention/CONTRACT.md) | ✅ Active | Retention policies и GC |

## Ожидаемые контракты

| Домен | Приоритет | Заметки |
|-------|-----------|---------|
| orchestration | P1 | Tool graph analysis |
| roadmaps | P1 | Roadmap management |
| tasks | P0 | Task CRUD, Eisenhower Matrix |
| thought | P1 | Thought recording chain |

---

## Структура контракта

Каждый контракт должен содержать:

1. **Interface Map** - таблица экспортируемых функций
2. **Invariants** - неизменяемые правила домена
3. **Acceptance Criteria** - критерии приёмки
4. **Dependencies** - зависимости и потребители
5. **Architectural Boundaries** - границы слоёв

---

## Template: API-{domain}.md

```markdown
# API Contract: {Domain}

**Surface**: src/domains/{domain}  
**Version**: 1.0.0  
**Date**: YYYY-MM-DD

---

## 1. Domain Overview

## 2. Interface Map

### 2.1 Domain Exports

| Export | Type | Signature | Purpose | Consumer |
|--------|------|-----------|---------|----------|

### 2.2 Controller Exports

| Export | Type | Description |
|--------|------|-------------|

### 2.3 MCP Tool Schema

| Tool | Required Params | Description |
|------|-----------------|-------------|

## 3. Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|

## 4. Acceptance Criteria

## 5. Dependencies

### Required
- 

### Provided To
- 

## 6. Sign-off

**Contract Status**: Draft → Review → Approved → Deprecated  
**Ready for**: Implementation / Testing / Production
```
