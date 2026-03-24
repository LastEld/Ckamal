# 🔍 AMS Code Archaeology Report

> **Project:** Agent Management System (AMS)  
> **Location:** `e:\Ckamal`  
> **Generated:** 2026-03-23  
> **Updated:** 2026-03-23  
> **Analysts:** 3 Sub-agents (Core, GSD+Intel, Infrastructure)

---

## 🗑️ Последние изменения (Cleanup 2026-03-23)

### Удалённые модули и файлы

| Категория | Элементы | Статус |
|-----------|----------|--------|
| **Agent .md файлы** | Все старые файлы из `.agents/` | ✅ Удалены |
| **Runtime модуль** | `src/runtime/` (полностью) | ✅ Удалён |
| **Performance модуль** | `src/performance/` (полностью) | ✅ Удалён |
| **Computer use (beta)** | `src/claude/computer/` | ✅ Удалён |
| **Claude Computer контроллеры** | `claude-computer.js`, `claude-computer-beta.js` | ✅ Удалены |
| **DB Schema** | `src/db/thread-schema.sql` | ✅ Удалён |
| **Analysis модули** | `auto-fix.js`, `codebase-scanner.js` | ✅ Удалены |
| **Intelligence Models** | `src/intelligence/models/` (полностью) | ✅ Удалён |
| **DB Provider** | `src/db/providers/postgres.js` | ✅ Удалён |
| **Claude Tools (старые)** | `claude-api.js`, `claude-api-core.js` | ✅ Удалены |

### Создана новая структура

| Папка | Назначение |
|-------|------------|
| `.spec/` | SPEC driven development - требования, архитектура, дизайн |
| `.spec/requirements/` | Функциональные и нефункциональные требования |
| `.spec/architecture/` | Архитектурные решения и ADR |
| `.spec/design/` | Дизайн-документы |
| `.spec/features/` | Feature specifications |
| `.spec/api/` | API specifications |
| `.spec/acceptance/` | Acceptance criteria |
| `.spec/domains/` | Domain specifications |

---

---

## 📋 Executive Summary

Полная археология кодовой базы AMS выявила **425+ файлов**, организованных в **40+ модулей** с четкой архитектурой:

| Layer | Files | Purpose |
|-------|-------|---------|
| **Core** | ~120 | MCP server, Claude API, Controllers, DB |
| **GSD & Intelligence** | ~60 | Workflow engine, AI routing, Analysis |
| **Infrastructure** | ~90 | Middleware, Utils, Security, Tools |
| **Legacy/Unused** | ~15 | Требуют аудита |

---

## 🗂️ Полная структура проекта

```
e:\Ckamal/
├── .planning/                    # 📋 Планы и анализ (создано)
│   ├── ARCHAEOLOGY.md           # ← Этот файл (сводный отчёт)
│   ├── required-folders.md      # Анализ необходимых папок
│   ├── unused-code-analysis.md  # Неиспользуемый код
│   ├── code-analysis-core.md    # Анализ core модулей
│   ├── code-analysis-gsd-intel.md # Анализ GSD & Intelligence
│   └── code-analysis-infrastructure.md # Анализ инфраструктуры
├── .tmp/                         # 📝 Временные файлы (создано)
├── .worktrees/                   # 🌳 Git worktrees (создано)
├── data/                         # 💾 Данные системы (создано)
│   ├── locks/                    # Lock-файлы
│   ├── state/                    # Состояние доменов
│   │   ├── agent-pools/
│   │   ├── agents/
│   │   ├── checkpoints/
│   │   └── workflows/
│   ├── checkpoints/              # Git чекпоинты проектов
│   ├── projects/                 # Runtime проекты
│   ├── gsd/                      # GSD данные
│   ├── uploads/                  # Загруженные файлы
│   └── ams.db                    # SQLite БД
├── config/                       # ⚙️ Конфигурация (создано)
├── archive/                      # 📦 Архив (создано)
├── logs/                         # 📄 Логи (создано)
├── cache/                        # 🚀 Кэш (создано)
├── .github/                      # 🐙 GitHub Actions (создано)
└── src/                          # 📦 Исходный код
    ├── server.js                 # Entry point MCP
    ├── config.js                 # Центральная конфигурация
    ├── config-auth.js            # Auth конфигурация
    ├── alerts/                   # Alert system
    ├── analysis/                 # RAG, TF-IDF, Codebase scanner
    ├── analytics/                # Cost tracking, Budget
    ├── claude/                   # Claude API integration
    │   ├── admin/                # Organization & workspaces
    │   ├── analytics/            # Conversation analytics
    │   ├── batch/                # Batch processing
    │   ├── batch-api/            # Message Batches API
    │   ├── citations/            # Citation handling
    │   ├── computer/             # Computer use (beta/deprecated)
    │   ├── context/              # Context optimization
    │   ├── conversation/         # Conversation management
    │   ├── core/                 # API foundation
    │   │   ├── client.js         # Enhanced API client (778 lines)
    │   │   ├── models.js         # Model registry
    │   │   ├── budget.js         # Budget management
    │   │   ├── resilience.js     # Circuit breaker & retry
    │   │   └── ...
    │   ├── extended-thinking/    # Extended thinking mode
    │   ├── files/                # File handling
    │   ├── messages/             # Message indexing
    │   ├── models/               # Model features
    │   ├── pdf-api/              # PDF API
    │   ├── resilience/           # Resilience patterns
    │   ├── router/               # Smart routing
    │   ├── streaming/            # Streaming (WS + SSE)
    │   ├── threads/              # Thread management
    │   ├── tokens/               # Token management
    │   ├── tool-chain/           # Tool chain composer
    │   ├── usage/                # Usage & billing
    │   ├── vision/               # Vision capabilities
    │   ├── webhooks/             # Webhook handling
    │   └── workspaces/           # Workspace management
    ├── composition/              # Composition gateways
    ├── config/                   # Config loaders
    ├── controllers/              # MCP tool controllers
    │   ├── index.js              # Main router (533 lines)
    │   ├── unified.js            # Unified interface
    │   ├── autonomous.js         # Autonomous execution
    │   └── claude-*.js           # 15 Claude controllers
    ├── dashboard/                # Web dashboard
    ├── db/                       # Database layer
    │   ├── index.js              # Facade & CRUD (950 lines)
    │   ├── bootstrap.js          # DB initialization
    │   ├── connection/           # Connection management
    │   ├── migrations/           # Migrations
    │   ├── providers/            # SQLite/Postgres
    │   ├── repositories/         # Data repositories
    │   └── audit/                # Audit context
    ├── domains/                  # Business logic domains
    │   ├── architecture/         # Architecture domain
    │   ├── context/              # Context snapshots
    │   ├── gsd/                  # GSD domain logic
    │   ├── integrations/         # Integrations
    │   ├── merkle/               # Merkle tree
    │   ├── orchestration/        # Orchestration
    │   ├── retention/            # Data retention
    │   ├── roadmaps/             # Roadmap operations
    │   ├── tasks/                # Task CRUD
    │   └── thought/              # Thought chains
    ├── gsd/                      # GSD engine (legacy)
    ├── intelligence/             # AI/ML intelligence
    ├── middleware/               # Express/MCP middleware
    ├── performance/              # Performance optimization
    ├── runtime/                  # Runtime coordinator
    ├── security/                 # Security & sanitization
    ├── services/                 # Services
    ├── tools/                    # MCP tool implementations
    ├── utils/                    # Utilities
    ├── validation/               # Validation schemas
    ├── watchers/                 # File watchers
    └── websocket/                # WebSocket server
```

---

## 🔑 Ключевые переменные системы

| Переменная | Файл | Назначение | Где используется |
|------------|------|------------|------------------|
| `AMS_ROOT` | `config.js` | Корень проекта | Везде |
| `AMS_DB_PATH` | `config.js` | Путь к SQLite | `db/bootstrap.js` |
| `AMS_RUNTIME_PROJECTS_DIR` | `config.js` | Проекты runtime | `controllers/`, `domains/` |
| `AMS_CHECKPOINT_DIR` | `config.js` | Git чекпоинты | `utils/git-checkpoint.js` |
| `AMS_PLANNING_ROOT` | `config.js` | Планы | `controllers/autonomous.js` |
| `GSD_ROOT` | `domains/gsd/config.js` | GSD данные | `gsd/`, `domains/gsd/` |
| `AMS_FILE_UPLOAD_DIR` | `config.js` | Загрузки | `claude/files/handler.js` |
| `ANTHROPIC_API_KEY` | Env | Claude API | `claude/core/client.js` |
| `AMS_USER_ID` | Env | ACL identity | `middleware/acl.js` |
| `AMS_SECURITY_MODE` | Env | Режим безопасности | `middleware/auth.js` |
| `AMS_AUTONOMOUS_APPLY_ENABLED` | Env | Разрешить apply | `controllers/autonomous.js` |

---

## 🏗️ Архитектурные паттерны

### 1. Layered Architecture
```
┌─────────────────┐
│   Controllers   │  ← MCP tools routing
├─────────────────┤
│    Domains      │  ← Business logic
├─────────────────┤
│   Services      │  ← Use cases
├─────────────────┤
│   Repositories  │  ← Data access
├─────────────────┤
│   Database      │  ← SQLite/Postgres
└─────────────────┘
```

### 2. Facade Pattern
- `src/db/index.js` (950 lines) - Единая точка доступа к БД
- `src/controllers/index.js` (533 lines) - Центральный роутер tools

### 3. Gateway Pattern
- `src/composition/db-gateway.js`
- `src/composition/roadmap-gateway.js`
- `src/composition/git-checkpoint-gateway.js`

### 4. Repository Pattern
- `src/db/repositories/*.js` - 8 репозиториев для сущностей

### 5. Circuit Breaker
- `src/claude/core/resilience.js`
- `src/middleware/circuit-breaker.js`
- Монотонный тайминг через `performance.now()`

### 6. AsyncLocalStorage
- Thread-safe контекст для audit, auth, ACL
- `src/middleware/audit.js`

---

## 🔌 MCP Tools (90+ инструментов)

| Category | Count | File |
|----------|-------|------|
| Claude API | 15 | `tools/claude-api.js` |
| Claude Core | 12 | `tools/claude-api-core.js` |
| GSD Workflow | 15 | `tools/gsd-workflow.js` |
| Intelligence | 20+ | `tools/intelligence.js` |
| Memory Smart | 10 | `tools/memory-smart.js` |
| Observability | 15+ | `tools/observability.js` |
| Profile | 5 | `tools/profile.js` |

---

## ⚠️ Неиспользуемый / Legacy код

### 🔴 Критичный (требует проверки)
| Файл | Проблема | Рекомендация |
|------|----------|--------------|
| `src/gsd/engine.js` | Sleep stubs (`Math.random`) | Реализовать реальное выполнение |
| `src/gsd/agent.js` | Заглушки агентов | Доработать или удалить |
| `src/runtime/daemon.js` | Статус неясен | Проверить интеграцию |
| `src/runtime/client-bridge.js` | Нет ссылок | Удалить если не используется |

### 🟡 Устаревшие пути
| Старый путь | Новый путь | Где в коде |
|-------------|------------|------------|
| `projects/get-shit-done/` | `data/gsd/` | `domains/gsd/config.js:11` |
| Checkpoint `project` mode | `separate` mode | `utils/git-checkpoint.js:38-44` |
| `src/gsd/*` | `src/domains/gsd/` | Перенесено |

### 🟢 Возможно неиспользуется
- `src/analysis/auto-fix.js` - только 1 импорт
- `src/analysis/codebase-scanner.js` - legacy
- `src/performance/warmup.js` - проверить вызовы
- `src/db/providers/postgres.js` - используется SQLite
- `src/claude/computer/` - beta API (deprecated)

---

## 🔗 Связи между модулями

```
server.js
    ├── config.js ......................[AMS_ROOT, ENV_VARS]
    ├── db/index.js ....................[SQLite/Postgres Facade]
    │   └── repositories/*.js ..........[CRUD операции]
    ├── controllers/index.js ...........[MCP Tools Router]
    │   ├── claude-*.js ................[Claude API tools]
    │   ├── tasks.js ...................[Task domain]
    │   ├── roadmaps.js ................[Roadmap domain]
    │   ├── autonomous.js ..............[Auto execution]
    │   └── unified.js .................[Unified interface]
    ├── domains/
    │   ├── tasks/index.js .............[Task CRUD]
    │   ├── gsd/index.js ...............[GSD state]
    │   └── roadmaps/index.js ..........[Roadmap ops]
    ├── middleware/
    │   ├── auth.js ....................[Authentication]
    │   ├── acl.js .....................[Access control]
    │   └── audit.js ...................[Audit logging]
    └── tools/*.js .....................[MCP tool definitions]
```

---

## 📊 Статистика

| Метрика | Значение |
|---------|----------|
| Всего JS файлов | ~200 |
| Строк кода | ~50,000+ |
| Экспортов | ~400+ |
| Импортов | ~600+ |
| MCP Tools | 90+ |
| Middleware | 10 |
| Репозиториев | 8 |
| Контроллеров | 20+ |
| Legacy файлов | ~15 |
| Дублей паттернов | ~10 |

---

## 🗺️ Созданные папки

### ✅ MUST HAVE
- [x] `data/` - Корневая директория данных
- [x] `data/locks/` - Lock-файлы
- [x] `data/state/` - Состояние доменов
- [x] `data/projects/` - Runtime проекты
- [x] `.planning/` - Планы
- [x] `config/` - Конфигурация

### ✅ SHOULD HAVE
- [x] `data/gsd/` - GSD система
- [x] `data/uploads/` - Загрузки
- [x] `data/checkpoints/` - Git чекпоинты
- [x] `.agents/` - Agent skills (уже существует)

### ✅ NICE TO HAVE
- [x] `archive/` - Архив
- [x] `logs/` - Логи
- [x] `.tmp/` - Временные файлы
- [x] `.worktrees/` - Git worktrees
- [x] `cache/` - Кэш
- [x] `.github/` - GitHub Actions

---

## 📚 Документы анализа

| Документ | Содержание | Размер |
|----------|------------|--------|
| `ARCHAEOLOGY.md` | Сводный отчёт (этот файл) | ~8KB |
| `required-folders.md` | Анализ папок | ~12KB |
| `unused-code-analysis.md` | Неиспользуемый код | ~8KB |
| `code-analysis-core.md` | Core модули | ~33KB |
| `code-analysis-gsd-intel.md` | GSD & Intelligence | ~31KB |
| `code-analysis-infrastructure.md` | Infrastructure | ~30KB |

---

## 🔧 Рекомендации

### Немедленно
1. ✅ Папки созданы - система готова к запуску
2. ⚠️ Проверить `src/gsd/engine.js` - там sleep stubs вместо реализации

### Короткосрочно
1. Удалить `FALLBACK_GSD_ROOT` (legacy path)
2. Проверить использование `src/runtime/*`
3. Завершить реализацию GSD engine

### Долгосрочно
1. Консолидировать конфигурацию (сейчас разбросана)
2. Удалить checkpoint `project` mode
3. Интегрировать или удалить analysis модули

---

*Report generated by AMS Code Archaeology Team (3 sub-agents)*  
*Methodology: Static code analysis + Dependency tracing + Architecture mapping*
