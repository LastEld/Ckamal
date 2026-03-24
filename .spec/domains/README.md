# Domain Specifications

**Path**: `.spec/domains/`  
**Purpose**: Объединённые спецификации по доменам (контракты + acceptance + архитектура)

---

## Существующие домены

Проект AMS имеет 10 доменов в `src/domains/`:

### С полной спецификацией (1/10)

| Домен | Contract | Acceptance | Architecture | Interface | Invariants |
|-------|----------|------------|--------------|-----------|------------|
| **merkle** | ✅ | ✅ | ✅ | ✅ | ✅ |

Файлы:
- [`src/domains/merkle/CONTRACT.md`](../../src/domains/merkle/CONTRACT.md)
- [`src/domains/merkle/ACCEPTANCE.md`](../../src/domains/merkle/ACCEPTANCE.md)
- [`src/domains/merkle/ARCHITECTURE.md`](../../src/domains/merkle/ARCHITECTURE.md)
- [`src/domains/merkle/INTERFACE.md`](../../src/domains/merkle/INTERFACE.md)
- [`src/domains/merkle/INVARIANTS.md`](../../src/domains/merkle/INVARIANTS.md)

### С базовой спецификацией (5/10)

| Домен | Contract | Описание |
|-------|----------|----------|
| **architecture** | ✅ | Архитектурный анализ модулей |
| **context** | ✅ | Контекст и immutable snapshots |
| **gsd** | ✅ | GSD методология |
| **integrations** | ✅ | Webhooks и notifications |
| **retention** | ✅ | Retention policies |

### Без спецификации (4/10)

| Домен | Приоритет | Заметки |
|-------|-----------|---------|
| **orchestration** | P1 | Tool graph analysis |
| **roadmaps** | P1 | Roadmap management |
| **tasks** | P0 | Task CRUD (критично!) |
| **thought** | P1 | Thought recording |

---

## Структура спецификации домена

Каждый домен должен иметь:

```
src/domains/{domain}/
├── index.js              # Implementation
├── CONTRACT.md           # ✅ API контракт (обязательно)
├── ACCEPTANCE.md         # ⬜ Acceptance критерии
├── ARCHITECTURE.md       # ⬜ Архитектура домена
├── INTERFACE.md          # ⬜ Interface definitions (опционально)
└── INVARIANTS.md         # ⬜ Invariants (опционально)
```

---

## Roadmap создания спецификаций

### Приоритет P0 (критично)
- [ ] tasks/CONTRACT.md
- [ ] tasks/ACCEPTANCE.md

### Приоритет P1 (важно)
- [ ] roadmaps/CONTRACT.md
- [ ] orchestration/CONTRACT.md
- [ ] thought/CONTRACT.md
- [ ] architecture/ACCEPTANCE.md
- [ ] context/ACCEPTANCE.md
- [ ] gsd/ACCEPTANCE.md
- [ ] integrations/ACCEPTANCE.md
- [ ] retention/ACCEPTANCE.md

### Приоритет P2 (желательно)
- [ ] architecture/ARCHITECTURE.md
- [ ] context/ARCHITECTURE.md
- [ ] gsd/ARCHITECTURE.md
- [ ] integrations/ARCHITECTURE.md
- [ ] retention/ARCHITECTURE.md

---

## Domain Ownership Matrix

| Domain | Owner | Reviewer | Status |
|--------|-------|----------|--------|
| architecture | - | - | 📝 Needs spec |
| context | - | - | 📝 Needs spec |
| gsd | - | - | 📝 Needs spec |
| integrations | - | - | 📝 Needs spec |
| merkle | ✅ | ✅ | ✅ Complete |
| orchestration | - | - | ❌ No spec |
| retention | - | - | 📝 Needs spec |
| roadmaps | - | - | ❌ No spec |
| tasks | - | - | ❌ No spec |
| thought | - | - | ❌ No spec |
