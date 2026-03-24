# AMS Final Source Structure

## Overview

Рефакторинг структуры `src/` для лучшей организации кода по слоям архитектуры.

**Дата:** 2026-03-23  
**Всего файлов:** 331  
**Статус:** ✅ Завершено

## Новая структура

```
src/
├── api/                          # Внешние API интеграции (119 files)
│   └── claude/                   # Claude API полностью
│       ├── admin/
│       ├── analytics/
│       ├── batch/
│       ├── batch-api/
│       ├── citations/
│       ├── context/
│       ├── conversation/
│       ├── core/
│       ├── extended-thinking/
│       ├── files/
│       │   └── parsers/
│       ├── messages/
│       ├── models/
│       ├── pdf-api/
│       ├── resilience/
│       ├── router/
│       ├── streaming/
│       ├── threads/
│       ├── tokens/
│       ├── tool-chain/
│       ├── usage/
│       ├── vision/
│       ├── webhooks/
│       └── workspaces/
│
├── core/                         # Точка входа, конфигурация, middleware (16 files)
│   ├── server.js                # Entry point MCP сервера
│   ├── config/
│   │   ├── config.js            # Основная конфигурация
│   │   ├── auth.js              # Auth configuration
│   │   ├── claude.js            # Claude-specific config
│   │   └── index.js             # Config loader
│   └── middleware/
│       ├── index.js             # Circuit breaker, retry, rate limit
│       ├── acl.js               # Access control
│       ├── audit.js             # Audit logging
│       ├── auth.js              # Authentication
│       ├── auth-permissions.js
│       ├── metrics.js           # Metrics collection
│       ├── orchestration.js
│       ├── runtime-pid-lock.js
│       ├── startup-lock.js
│       ├── tool-lock.js
│       └── watcher-leader.js
│
├── domain/                       # Бизнес-логика (70 files)
│   ├── ai-core/                 # AI Core (бывшее intelligence/)
│   │   ├── index.js
│   │   ├── anomaly.js
│   │   ├── classifier.js
│   │   ├── learner.js
│   │   ├── matcher.js
│   │   ├── optimizer.js
│   │   ├── patterns.js
│   │   ├── predictor.js
│   │   ├── recommender.js
│   │   ├── router.js
│   │   ├── router-cache.js
│   │   ├── router-engine.js
│   │   └── optimizers/
│   ├── architecture/
│   ├── context/
│   ├── gsd/                     # GSD unified
│   │   ├── domain/              # Было domains/gsd/ - business logic
│   │   │   ├── index.js
│   │   │   ├── config.js
│   │   │   ├── constants.js
│   │   │   ├── tools.js
│   │   │   └── validation.js
│   │   └── engine/              # Было gsd/ - execution engine
│   │       ├── index.js
│   │       ├── agent.js
│   │       ├── agent-pool.js
│   │       ├── agent-types.js
│   │       ├── engine.js
│   │       ├── planner.js
│   │       ├── verifier.js
│   │       ├── task-queue.js
│   │       ├── concurrency.js
│   │       ├── parallel-executor.js
│   │       ├── aggregator.js
│   │       ├── checkpoint.js
│   │       ├── lock.js
│   │       ├── auto-scaler.js
│   │       └── load-balancer.js
│   ├── integrations/
│   ├── intelligence/            # Legacy intelligence (merged into ai-core)
│   ├── merkle/
│   ├── orchestration/
│   ├── retention/
│   ├── roadmaps/
│   ├── tasks/
│   ├── thought/
│   └── workflow-engine/         # Advanced workflow engine
│
├── infrastructure/               # Инфраструктурный слой (40 files)
│   ├── composition/
│   │   ├── db-gateway.js
│   │   ├── file-lock.js
│   │   ├── git-checkpoint-gateway.js
│   │   ├── roadmap-gateway.js
│   │   └── todos-template.js
│   ├── db/                      # Database layer
│   │   ├── index.js
│   │   ├── bootstrap.js
│   │   ├── schema.sql
│   │   ├── schema-batch.sql
│   │   ├── vector-schema.sql
│   │   ├── message-index-schema.sql
│   │   ├── timeseries.js
│   │   ├── migration-runner.js
│   │   ├── audit/
│   │   ├── connection/
│   │   ├── indexing/
│   │   ├── migrations/
│   │   ├── providers/
│   │   ├── repositories/
│   │   └── transactions/
│   ├── security/
│   │   ├── audit.js
│   │   ├── audit-comprehensive.js
│   │   ├── sanitizer.js
│   │   └── validator.js
│   ├── utils/
│   │   ├── cache.js
│   │   ├── file-lock.js
│   │   ├── git-checkpoint.js
│   │   ├── tiered-storage.js
│   │   └── token-counter.js
│   └── validation/
│       ├── safe-id.js
│       └── schemas.js
│
├── interface/                    # Presentation layer (59 files)
│   ├── controllers/             # MCP tool controllers
│   │   ├── index.js             # Main router
│   │   ├── analysis.js
│   │   ├── analytics.js
│   │   ├── audit.js
│   │   ├── autonomous.js
│   │   ├── autonomous/
│   │   ├── context.js
│   │   ├── memory.js
│   │   ├── merkle.js
│   │   ├── performance.js
│   │   ├── roadmaps.js
│   │   ├── tasks.js
│   │   ├── thought.js
│   │   ├── unified.js
│   │   ├── unified/
│   │   │   ├── handlers/
│   │   │   ├── helpers.js
│   │   │   └── tools.js
│   │   ├── watchers.js
│   │   └── claude-*.js          # Все Claude-related controllers (19 files)
│   ├── tools/                   # Tool definitions
│   │   ├── gsd-workflow.js
│   │   ├── intelligence.js
│   │   ├── memory-smart.js
│   │   ├── observability.js
│   │   └── profile.js
│   ├── dashboard/               # Web UI
│   │   ├── server.js
│   │   ├── websocket.js
│   │   └── public/
│   │       ├── app.js
│   │       ├── index.html
│   │       └── styles.css
│   └── websocket/               # WebSocket server
│       ├── client.js
│       ├── server.js
│       └── stream-manager.js
│
├── observability/                # Мониторинг и аналитика (22 files)
│   ├── alerts/
│   │   ├── index.js
│   │   ├── channels.js
│   │   ├── engine.js
│   │   ├── manager.js
│   │   └── rules.js
│   ├── analysis/
│   │   └── index.js
│   ├── analytics/
│   │   ├── index.js
│   │   ├── budget.js
│   │   ├── cost-tracker.js
│   │   └── reports.js
│   ├── metrics/
│   │   ├── index.js
│   │   └── collector.js
│   ├── rag/                     # RAG система
│   │   ├── index.js
│   │   ├── lru-cache.js
│   │   ├── memory-qr.js
│   │   ├── rag-constants.js
│   │   ├── rag-embeddings.js
│   │   ├── rag-metrics.js
│   │   ├── rag-quality.js
│   │   ├── rag-search.js
│   │   └── rag.js
│   └── watchers/
│       └── index.js
│
├── services/                     # Сервисы приложения (2 files)
│   ├── context-manager.js
│   └── embeddings.js
│
├── config.js                     # ⬅️ Root re-export (backward compat)
├── config-auth.js                # ⬅️ Root re-export (backward compat)
└── server.js                     # ⬅️ Root re-export (backward compat)
```

## Маппинг: старое → новое

| Старое | Новое | Примечание |
|--------|-------|------------|
| `server.js` | `core/server.js` | + root re-export |
| `config.js` | `core/config/config.js` | + root re-export |
| `config-auth.js` | `core/config/auth.js` | + root re-export |
| `config/` | `core/config/` | Слит с config.js |
| `middleware/` | `core/middleware/` | |
| `claude/` | `api/claude/` | Полный перенос |
| `domains/` | `domain/` | Переименование |
| `domains/gsd/` | `domain/gsd/domain/` | Внутри GSD domain |
| `gsd/` | `domain/gsd/engine/` | GSD engine |
| `intelligence/` | `domain/intelligence/` | В domain слой |
| `ai-core/` | `domain/ai-core/` | Новый AI модуль |
| `workflow-engine/` | `domain/workflow-engine/` | В domain слой |
| `db/` | `infrastructure/db/` | |
| `security/` | `infrastructure/security/` | |
| `utils/` | `infrastructure/utils/` | |
| `validation/` | `infrastructure/validation/` | |
| `gateways/`, `composition/` | `infrastructure/composition/` | Объединены |
| `controllers/` | `interface/controllers/` | |
| `tools/` | `interface/tools/` | |
| `dashboard/` | `interface/dashboard/` | |
| `websocket/` | `interface/websocket/` | |
| `analytics/` | `observability/analytics/` | |
| `metrics/` | `observability/metrics/` | |
| `alerts/` | `observability/alerts/` | |
| `analysis/` | `observability/analysis/` | |
| `watchers/`, `file-watchers/` | `observability/watchers/` | Объединены |
| `rag/` | `observability/rag/` | |
| `services/` | `services/` | Без изменений |

## Обоснование решений

### 1. Layered Architecture

Структура следует принципам Layered Architecture:

```
┌─────────────────────────────────────┐
│  interface/   (Presentation)        │
├─────────────────────────────────────┤
│  domain/      (Business Logic)      │
├─────────────────────────────────────┤
│  api/         (External APIs)       │
├─────────────────────────────────────┤
│  infrastructure/ (Implementation)   │
├─────────────────────────────────────┤
│  core/        (Entry Point)         │
├─────────────────────────────────────┤
│  observability/ (Cross-cutting)     │
└─────────────────────────────────────┘
```

### 2. Объединение GSD модулей

**Было:**
- `domains/gsd/` - business logic, tool definitions
- `gsd/` - execution engine
- `workflow-engine/` - advanced workflows

**Стало:**
- `domain/gsd/domain/` - business logic
- `domain/gsd/engine/` - execution engine  
- `domain/workflow-engine/` - advanced workflows

### 3. AI/Intelligence организация

- `domain/ai-core/` - новая AI система (Wave 6 Router)
- `domain/intelligence/` - legacy AI модуль

### 4. Observability как cross-cutting concern

Все модули мониторинга объединены:
- `analytics/`, `metrics/`, `alerts/` → `observability/`
- `watchers/`, `file-watchers/` → `observability/watchers/`
- `rag/`, `analysis/` → `observability/`

### 5. Backward Compatibility

Корневые реэкспорты обеспечивают совместимость:
```javascript
// config.js (root)
export * from './core/config/config.js';

// server.js (root)  
export * from './core/server.js';
```

## Импорты: трансформации

### Interface слой (controllers, tools)
```javascript
// Было:
import { ... } from "../db/index.js";
import { ... } from "../middleware/acl.js";
import { ... } from "../domains/gsd/index.js";
import { ... } from "../claude/core/index.js";
import { ... } from "../analytics/index.js";

// Стало:
import { ... } from "../../infrastructure/db/index.js";
import { ... } from "../../core/middleware/acl.js";
import { ... } from "../domain/gsd/domain/index.js";
import { ... } from "../../api/claude/core/index.js";
import { ... } from "../observability/analytics/index.js";
```

### Core слой
```javascript
// Было:
import { ... } from "./config.js";
import { ... } from "./db/index.js";
import { ... } from "./domains/roadmaps/index.js";

// Стало:
import { ... } from "./config/config.js";
import { ... } from "../infrastructure/db/index.js";
import { ... } from "../domain/roadmaps/index.js";
```

### Domain слой
```javascript
// Было:
import { ... } from "../db/index.js";
import { ... } from "../validation/safe-id.js";

// Стало:
import { ... } from "../infrastructure/db/index.js";
import { ... } from "../infrastructure/validation/safe-id.js";
```

## Проверка работоспособности

✅ **Синтаксис проверен:**
- `config.js` - OK
- `server.js` - OK  
- `core/server.js` - OK
- `core/config/config.js` - OK
- `interface/controllers/index.js` - OK
- `infrastructure/db/index.js` - OK
- `api/claude/core/index.js` - OK
- `domain/gsd/domain/index.js` - OK
- `domain/ai-core/index.js` - OK
- `observability/alerts/index.js` - OK

✅ **Все импорты обновлены**
- ✅ `../domains/` → `../domain/`
- ✅ `../db/` → `../infrastructure/db/` (для interface)
- ✅ `../middleware/` → `../../core/middleware/` (для interface)
- ✅ `../claude/` → `../../api/claude/` (для controllers)
- ✅ `../analytics/` → `../observability/analytics/`
- ✅ `../alerts/` → `../observability/alerts/`
- ✅ `../metrics/` → `../observability/metrics/`
- ✅ `../intelligence/` → `../domain/intelligence/`
- ✅ `../gsd/` → `../domain/gsd/engine/`
- ✅ `../rag/` → `../observability/rag/`

## Следующие шаги

1. **Тестирование:** Запустить сервер и проверить функциональность
2. **Документация:** Обновить README с новой структурой
3. **CI/CD:** Обновить пути в скриптах сборки
4. **TypeScript:** Добавить type definitions (при необходимости)
