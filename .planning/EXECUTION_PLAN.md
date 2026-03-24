# CogniMesh v5.0 - Execution Plan

> Фазы выполнения задач MVP  
> Дата: 2026-03-23  
> Версия: 1.0

---

## 🎯 Общая стратегия

**Цель:** Production-ready MVP CogniMesh v5.0

**Метрики:**
- Всего задач: 124
- Критических (P0): 28
- Оценка времени: ~300-350 человеко-часов
- Целевой срок MVP: 4-6 недель (при 2 разработчиках)

---

## 📊 Фазы выполнения

### Phase 0: Foundation (Неделя 0)
**Длительность:** 3-5 дней  
**Задачи:** 5  
**Цель:** Подготовка инфраструктуры для разработки

| Код | Задача | Зависимости | Время | Assignee |
|-----|--------|-------------|-------|----------|
| INT-001 | Fix roadmaps import | - | 15 мин | DevOps |
| INT-002 | Fix tasks import | - | 15 мин | DevOps |
| INT-003 | Fix AgentState import | - | 10 мин | DevOps |
| INF-003 | Add .gitignore rules | - | 30 мин | DevOps |
| INF-005 | Expand .env.example | - | 1 ч | DevOps |

**Выход:** Рабочая dev-среда, исправлены критические импорты

---

### Phase 1: Core Infrastructure (Неделя 1-2)
**Длительность:** 10-12 дней  
**Задачи:** 6  
**Цель:** Стабильное ядро системы

| Код | Задача | Зависимости | Время | Assignee |
|-----|--------|-------------|-------|----------|
| DB-001 | Backup system | INT fixes | 5 ч | Backend |
| DB-002 | Migration rollback tests | DB-001 | 4 ч | Backend |
| SEC-001 | Vault integration | - | 5 ч | Security |
| SEC-002 | Health endpoints | SEC-001 | 4 ч | Backend |
| BIOS-001 | Create agent.js | - | 5 ч | Core |
| BIOS-002 | Client modules | BIOS-001 | 10 ч | Core |

**Критический путь:** INT fixes → DB-001 → SEC-001 → BIOS-002

**Выход:** Работает БД с бэкапами, health checks, базовый Agent класс

---

### Phase 2: Domain Layer (Неделя 2-3)
**Длительность:** 8-10 дней  
**Задачи:** 8  
**Цель:** Полноценные домены с документацией

| Код | Задача | Зависимости | Время | Assignee |
|-----|--------|-------------|-------|----------|
| DOM-001 | tasks CONTRACT.md | - | 3 ч | TechWriter |
| DOM-002 | roadmaps CONTRACT.md | - | 3 ч | TechWriter |
| DOM-003 | thought CONTRACT.md | - | 3 ч | TechWriter |
| TEST-001 | tasks integration tests | DOM-001 | 5 ч | QA |
| TEST-002 | roadmaps integration tests | DOM-002 | 5 ч | QA |
| TEST-003 | merkle integration tests | - | 4 ч | QA |
| TEST-004 | thought integration tests | DOM-003 | 4 ч | QA |
| TEST-005 | context integration tests | - | 4 ч | QA |

**Критический путь:** DOM-001 → TEST-001, DOM-002 → TEST-002

**Выход:** Все домены покрыты тестами и документацией

---

### Phase 3: API & Integration (Неделя 3-4)
**Длительность:** 7-9 дней  
**Задачи:** 5  
**Цель:** Полноценное API для внешних интеграций

| Код | Задача | Зависимости | Время | Assignee |
|-----|--------|-------------|-------|----------|
| API-001 | OpenAPI specification | DOM-* | 7 ч | TechWriter |
| INT-011 | WebSocket unification | BIOS-002 | 4 ч | Backend |
| INT-012 | BudgetManager → AlertManager | - | 3 ч | Backend |
| INT-013 | Init chain verification | BIOS-002 | 3 ч | Backend |
| DASH-001 | Dashboard API integration | INT-011 | 4 ч | Frontend |

**Критический путь:** DOM-* → API-001

**Выход:** OpenAPI spec, работает dashboard с реальными данными

---

### Phase 4: Hardening (Неделя 4-5)
**Длительность:** 7-9 дней  
**Задачи:** 6  
**Цель:** Production-ready безопасность и стабильность

| Код | Задача | Зависимости | Время | Assignee |
|-----|--------|-------------|-------|----------|
| SEC-011 | Rate-limiter integration | SEC-002 | 4 ч | Security |
| SEC-012 | Security audit | SEC-001 | 3 ч | Security |
| INF-002 | CI/CD workflows | TEST-* | 6 ч | DevOps |
| INF-004 | Prometheus/Grafana | SEC-002 | 6 ч | DevOps |
| TEST-011 | Analytics tests | - | 4 ч | QA |
| TEST-012 | Controllers tests | - | 4 ч | QA |

**Критический путь:** TEST-* → INF-002

**Выход:** CI/CD, мониторинг, rate limiting

---

### Phase 5: Polish & Release (Неделя 5-6)
**Длительность:** 5-7 дней  
**Задачи:** 4  
**Цель:** MVP готов к релизу

| Код | Задача | Зависимости | Время | Assignee |
|-----|--------|-------------|-------|----------|
| DOC-001 | Update .spec/README.md | API-001 | 2 ч | TechWriter |
| INF-001 | .agents/ structure | - | 3 ч | DevOps |
| TEST-013 | npm test scripts | TEST-* | 2 ч | QA |
| DASH-002 | WS security hardening | SEC-011 | 3 ч | Frontend |

**Выход:** MVP v5.0 Released

---

## 🔀 Зависимости между задачами

### Граф зависимостей

```
Phase 0:
  INT-001 ──┐
  INT-002 ──┼→ Phase 1
  INT-003 ──┘

Phase 1:
  DB-001 ──────┬→ DB-002
               │
  SEC-001 ─────┼→ SEC-002 ──┐
               │             ├──→ Phase 3
  BIOS-001 ────┼→ BIOS-002 ──┘
               │
  DOM-001 ─────┼→ TEST-001 ──┐
  DOM-002 ─────┼→ TEST-002 ──┼→ Phase 4
  DOM-003 ─────┼→ TEST-004 ──┘
               │
               └→ TEST-003, TEST-005

Phase 3:
  API-001 ─────→ Phase 4
  INT-011 ─────→ DASH-001

Phase 4:
  TEST-* ──────→ INF-002
  SEC-* ───────→ Phase 5
```

### Критические зависимости

| Задача | Требует | Блокирует |
|--------|---------|-----------|
| DB-001 | INT fixes | DB-002, Phase 2 |
| BIOS-002 | BIOS-001 | INT-011, INT-013 |
| SEC-002 | SEC-001 | SEC-011, INF-004 |
| TEST-* | DOM-* | INF-002, Phase 5 |
| API-001 | DOM-* | Phase 4 |

---

## 🛤️ Критический путь

**Путь:** `INT fixes → DB-001 → SEC-001 → BIOS-002 → DOM-* → API-001 → INF-002 → MVP`

**Время критического пути:** ~85-95 часов

### Оптимизация критического пути

1. **Параллельность:** DOM-* и BIOS-* можно делать параллельно
2. **Ранний старт:** SEC-001 можно начать сразу после Phase 0
3. **Ускорение:** Добавить 2го разработчика на DOM tasks

---

## 📅 Timeline

```
Неделя:  0    1         2         3         4         5         6
         |----|---------|---------|---------|---------|---------|
Phase 0: [####]
Phase 1:      [###########]
Phase 2:                 [########]
Phase 3:                           [#######]
Phase 4:                                    [#######]
Phase 5:                                              [#####]

MVP:                                                       [DONE]
```

---

## ⚠️ Риски

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| BIOS-002 сложнее ожидаемого | Средняя | Высокое | Early POC, разбить на sub-tasks |
| SEC-001 Vault integration | Низкая | Высокое | Fallback к env vars |
| DOM-* acceptance критерии | Средняя | Среднее | Early review CONTRACT.md |
| TEST-* coverage < 80% | Средняя | Среднее | Доп. время в Phase 4 |

---

*Generated by SubAgent #3*  
*Part of CogniMesh Multi-Agent System*
