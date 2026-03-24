# Acceptance Criteria

**Path**: `.spec/acceptance/`  
**Purpose**: Acceptance критерии и тестовые сценарии

---

## Источники спецификаций

| Домен | Файл | Статус |
|-------|------|--------|
| merkle | [`src/domains/merkle/ACCEPTANCE.md`](../../src/domains/merkle/ACCEPTANCE.md) | ✅ Complete |

## Структура acceptance критериев

### Формат (Given-When-Then)

```markdown
## A{id}: {Feature Area}

### A{id}.{sub}: {Scenario Title}
**Given**: {precondition}
**When**: {action}
**Then**:
- {expected result 1}
- {expected result 2}
```

### Категории критериев

| Категория | Префикс | Описание |
|-----------|---------|----------|
| Functional | A1-A99 | Функциональные требования |
| Performance | A100-A199 | Производительность |
| Security | A200-A299 | Безопасность |
| Error Handling | A300-A399 | Обработка ошибок |
| Integration | A400-A499 | Интеграции |

---

## Template: ACC-{domain}.md

```markdown
# {Domain} Acceptance Criteria

## A1: {Feature Name}

### A1.1: {Scenario}
**Given**: {context}
**When**: {action}
**Then**:
- Result 1
- Result 2

### A1.2: {Edge Case}
**Given**: {context}
**When**: {action}
**Then**:
- Error handling

## A2: {Another Feature}
...

## Verification Commands

```bash
# Run domain-specific tests
npm test -- --grep "{domain}"
```
```
