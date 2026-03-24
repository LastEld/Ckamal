# Консолидация конфигурации AMS

## Обзор

Данный документ описывает план миграции разбросанной конфигурации в централизованную структуру.

---

## 1. АНАЛИЗ ТЕКУЩЕГО СОСТОЯНИЯ

### 1.1 Файлы конфигурации (найдено)

| Файл | Строк | Описание |
|------|-------|----------|
| `src/config.js` | 199 | Основная конфигурация AMS |
| `src/config/index.js` | 404 | Loader конфигурации с JSON |
| `src/config/claude.js` | 322 | Claude API конфигурация |
| `src/config-auth.js` | 280 | Auth конфигурация |
| `src/domains/gsd/config.js` | 22 | GSD domain конфигурация |
| `src/domains/gsd/constants.js` | 110 | GSD константы (skills, spawn rules) |
| `src/claude/core/models.js` | 726 | Claude модели (дублирование!) |
| `src/analysis/rag-constants.js` | 56 | RAG константы |
| `src/gsd/engine.js` | 794 | Workflow/Phase/Agent states |
| `src/gsd/agent-types.js` | 177 | Agent types + AgentState |
| `src/gsd/agent-pool.js` | 100+ | AgentState + AgentType |
| `src/alerts/rules.js` | 897 | Alert константы |

### 1.2 Дублирующиеся определения

#### AgentState (3 дубликата!)
```javascript
// src/gsd/agent-types.js (строки 54-61)
export const AgentState = Object.freeze({
    PENDING: "pending",
    INITIALIZING: "initializing",
    READY: "ready",
    BUSY: "busy",
    FAILED: "failed",
    TERMINATED: "terminated"
});

// src/gsd/engine.js (строки 36-41)
export const AgentState = Object.freeze({
    IDLE: "idle",
    BUSY: "busy",
    ERROR: "error",
    TERMINATED: "terminated"
});

// src/gsd/agent-pool.js (строки 13-20)
export const AgentState = Object.freeze({
    IDLE: "idle",
    BUSY: "busy",
    ERROR: "error",
    TERMINATED: "terminated",
    SPAWNING: "spawning",
    HEALTH_CHECKING: "health_checking"
});
```

#### CLAUDE_MODELS (2 дубликата!)
```javascript
// src/config/claude.js (строки 25-112)
// src/claude/core/models.js (строки 41-283)
// Разные структуры данных!
```

#### Alert константы (дублирование)
```javascript
// src/alerts/rules.js и src/alerts/engine.js
// ALERT_SEVERITY, ALERT_STATUS определены в обоих
```

### 1.3 Разбросанные пути

| Путь | Текущее место | Используется в |
|------|---------------|----------------|
| `AMS_ROOT` | `src/config.js`, `src/domains/gsd/config.js` | 15+ файлов |
| `GSD_ROOT` | `src/domains/gsd/config.js` | gsd/* |
| `WORKFLOW_STORAGE_DIR` | `src/gsd/engine.js` | engine.js |
| `POOL_STORAGE_DIR` | `src/gsd/agent-pool.js` | agent-pool.js |
| `STATE_FILE` | `src/domains/gsd/config.js` | domains/gsd/* |
| `PLANNING_ROOT` | `src/domains/gsd/config.js` | domains/gsd/* |
| `WORKFLOW_CATALOG_PATH` | `src/tools/gsd-workflow.js` | gsd-workflow.js |
| `CHECKPOINT_DIR` | `src/config.js` | composition/* |

---

## 2. ЦЕЛЕВАЯ СТРУКТУРА

### 2.1 Новая файловая структура

```
src/config/
├── index.js              # Единая точка входа (реэкспорт)
├── core.js               # Базовая конфигурация (было: config.js)
├── paths.js              # ВСЕ пути в одном месте
├── states.js             # ВСЕ константы состояний
├── auth.js               # Auth конфигурация
├── claude.js             # Claude API (упрощенная)
├── models.js             # Модели (из claude/core/models.js)
├── rag.js                # RAG константы
├── gsd.js                # GSD константы (skills, spawn rules)
└── alerts.js             # Alert константы
```

### 2.2 Содержимое новых файлов

#### `src/config/paths.js` (НОВЫЙ)
```javascript
/**
 * Централизованные пути AMS
 * ВСЕ пути проекта определены здесь
 */
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root
export const AMS_ROOT = process.env.AMS_ROOT || path.resolve(__dirname, "../..");

// Data directories
export const DATA_DIR = path.join(AMS_ROOT, "data");
export const STATE_DIR = path.join(DATA_DIR, "state");
export const PROJECTS_DIR = process.env.AMS_RUNTIME_PROJECTS_DIR || path.join(DATA_DIR, "projects");
export const CHECKPOINT_DIR = process.env.AMS_CHECKPOINT_DIR || path.join(DATA_DIR, "checkpoints");

// GSD directories
export const GSD_ROOT = process.env.GSD_ROOT || path.join(DATA_DIR, "gsd");
export const GSD_STATE_FILE = path.join(STATE_DIR, "gsd-state.json");
export const WORKFLOW_STORAGE_DIR = path.join(STATE_DIR, "workflows");
export const POOL_STORAGE_DIR = path.join(STATE_DIR, "agent-pools");
export const AGENT_STORAGE_DIR = path.join(STATE_DIR, "agents");
export const GSD_WORKFLOWS_DIR = path.join(DATA_DIR, "gsd-workflows");

// Planning directories  
export const PLANNING_ROOT = process.env.AMS_PLANNING_ROOT || path.join(AMS_ROOT, ".planning");
export const PROJECT_ARTIFACTS_DIR = process.env.AMS_PROJECT_ARTIFACTS_DIR || path.join(PLANNING_ROOT, "projects");

// Config files
export const WATCH_PROJECTS_FILE = process.env.AMS_WATCH_PROJECTS_FILE || path.join(AMS_ROOT, "config", "watch-projects.json");
export const CHECKPOINT_IGNORE_FILE = process.env.AMS_CHECKPOINT_IGNORE || path.join(DATA_DIR, "ams-checkpoint-ignore.txt");

// Catalog files
export const WORKFLOW_CATALOG_PATH = path.join(GSD_WORKFLOWS_DIR, "catalog.json");
export const POOL_CATALOG_PATH = path.join(GSD_WORKFLOWS_DIR, "pools.json");
```

#### `src/config/states.js` (НОВЫЙ)
```javascript
/**
 * Централизованные константы состояний
 * ВСЕ state enums в одном месте
 */

// Workflow states (from gsd/engine.js)
export const WorkflowState = Object.freeze({
    PENDING: "pending",
    RUNNING: "running",
    PAUSED: "paused",
    COMPLETED: "completed",
    FAILED: "failed",
    ROLLED_BACK: "rolled_back"
});

// Phase states (from gsd/engine.js)
export const PhaseState = Object.freeze({
    PENDING: "pending",
    RUNNING: "running",
    WAITING: "waiting",
    COMPLETED: "completed",
    FAILED: "failed",
    SKIPPED: "skipped"
});

// Agent states (ОБЪЕДИНЕННАЯ версия)
export const AgentState = Object.freeze({
    // Lifecycle states
    PENDING: "pending",
    INITIALIZING: "initializing",
    SPAWNING: "spawning",
    
    // Active states
    IDLE: "idle",
    READY: "ready",
    BUSY: "busy",
    HEALTH_CHECKING: "health_checking",
    
    // Terminal states
    ERROR: "error",
    FAILED: "failed",
    TERMINATED: "terminated"
});

// Agent types (from gsd/agent-pool.js)
export const AgentType = Object.freeze({
    WORKER: "worker",
    ORCHESTRATOR: "orchestrator",
    SPECIALIST: "specialist",
    SUPERVISOR: "supervisor"
});

// Task states (if needed)
export const TaskState = Object.freeze({
    PENDING: "pending",
    ASSIGNED: "assigned",
    RUNNING: "running",
    COMPLETED: "completed",
    FAILED: "failed",
    CANCELLED: "cancelled"
});

// Verification states (from gsd/verifier.js)
export const VerificationStatus = Object.freeze({
    PENDING: "pending",
    IN_PROGRESS: "in_progress",
    PASSED: "passed",
    FAILED: "failed",
    WARNING: "warning"
});

// Alert severity (unified)
export const AlertSeverity = Object.freeze({
    CRITICAL: "critical",
    WARNING: "warning",
    INFO: "info"
});

// Alert status
export const AlertStatus = Object.freeze({
    ACTIVE: "active",
    ACKNOWLEDGED: "acknowledged",
    RESOLVED: "resolved",
    SUPPRESSED: "suppressed"
});
```

#### `src/config/gsd.js` (НОВЫЙ)
```javascript
/**
 * GSD-specific constants
 * Moved from src/domains/gsd/constants.js
 */

// Lease and retention
export const LEASE_DURATION_MS = 60 * 60 * 1000; // 1 hour
export const STALE_PROJECT_HOURS = 24;
export const RESOURCE_CONTENT_LIMIT = 5000;
export const MAX_RETAINED_LEASES = 100;
export const MAX_HISTORY_ENTRIES = 250;
export const MAX_SPAWN_QUEUE_ENTRIES = 400;
export const MAX_SPAWN_HISTORY_ENTRIES = 300;

// ID validation
export const SAFE_ID_REGEX = /^[a-zA-Z0-9._-]+$/;
export const SAFE_KEY_PATH_PART_REGEX = /^[a-zA-Z0-9_-]+$/;
export const RESERVED_KEY_PATH_PARTS = new Set(["__proto__", "prototype", "constructor"]);

// Skill registry (from domains/gsd/constants.js)
export const DEFAULT_SKILL_REGISTRY = Object.freeze({
    "research.discovery": {
        title: "Research Discovery",
        description: "Evidence-driven discovery and source triage for phase context.",
        tags: ["research", "sources", "context"]
    },
    "planning.phase-design": {
        title: "Phase Planning",
        description: "Breaks goals into executable phase plans with constraints and dependencies.",
        tags: ["planning", "dependencies", "phase"]
    },
    // ... etc
});

// Spawn rules
export const DEFAULT_SKILL_ASSIGNMENTS = Object.freeze({
    "gsd-phase-researcher": ["research.discovery"],
    // ... etc
});

export const DEFAULT_SPAWN_RULES = Object.freeze({
    plan_phase: {
        before: ["gsd-phase-researcher"],
        beforeParallel: [],
        main: ["gsd-planner"],
        after: ["gsd-plan-checker"],
        afterParallel: [],
        notes: "Research before planning, then verify plan quality."
    },
    // ... etc
});
```

#### `src/config/rag.js` (НОВЫЙ)
```javascript
/**
 * RAG constants
 * Moved from src/analysis/rag-constants.js
 */

// Chunking
export const DEFAULT_CHUNK_SIZE = 1200;
export const DEFAULT_CHUNK_OVERLAP = 200;
export const MAX_CHUNK_SIZE = 6000;
export const MAX_CHUNK_OVERLAP = 1000;

// Search
export const DEFAULT_SOURCE_TYPES = ["context", "action", "thought"];
export const DEFAULT_SEARCH_MODE = "hybrid";
export const DEFAULT_SEMANTIC_WEIGHT = 0.7;
export const DEFAULT_CANDIDATE_LIMIT = 60;
export const MAX_SEARCH_CANDIDATES = 500;
export const DEFAULT_LIMIT = 200;

// Graph reranking
export const MAX_NEIGHBOR_WINDOW = 5;
export const DEFAULT_GRAPH_RERANK_WEIGHT = 0.2;
export const MAX_GRAPH_RERANK_WEIGHT = 0.75;

// Embeddings
export const LOCAL_EMBEDDING_MODEL = "ams-hash-v2-mp4";
export const LOCAL_EMBEDDING_PROJECTIONS = [0x9e3779b1, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f];

// Performance tracking
export const RAG_PERF_MAX_SAMPLES = 4000;

// Graph relation weights
export const GRAPH_RELATION_WEIGHTS = Object.freeze({
    action_context: 1.0,
    thought_action: 0.85,
    thought_context: 0.85,
    thought_parent: 0.5,
    thought_child: 0.5,
    context_member: 0.75,
    session_peer: 0.35,
    default: 0.25
});
```

#### `src/config/alerts.js` (НОВЫЙ)
```javascript
/**
 * Alert system constants
 * Unified from src/alerts/rules.js and src/alerts/engine.js
 */

// Rule types
export const AlertRuleType = Object.freeze({
    THRESHOLD: "threshold",
    RATE: "rate",
    ANOMALY: "anomaly",
    COMPOSITE: "composite"
});

// Operators
export const AlertOperator = Object.freeze({
    GT: "gt",
    LT: "lt",
    EQ: "eq",
    GTE: "gte",
    LTE: "lte",
    NEQ: "neq"
});

// Anomaly methods
export const AnomalyMethod = Object.freeze({
    ZSCORE: "zscore",
    IQR: "iqr",
    MAD: "mad"
});

// Composite operators
export const CompositeOperator = Object.freeze({
    AND: "and",
    OR: "or"
});

// Channel severity mapping
export const ChannelSeverity = Object.freeze({
    CRITICAL: ["email", "slack", "pagerduty", "webhook"],
    WARNING: ["email", "slack", "webhook"],
    INFO: ["slack", "log"]
});

// Default limits
export const DEFAULT_CHECK_INTERVAL_MS = 30000; // 30 seconds
export const DEFAULT_COOLDOWN_MS = 300000; // 5 minutes
export const DEFAULT_MAX_ALERTS_PER_RULE = 10;
export const DEFAULT_METRIC_HISTORY_SIZE = 10000;
export const DEFAULT_METRIC_RETENTION_HOURS = 24;
```

#### `src/config/index.js` (ОБНОВЛЕННЫЙ)
```javascript
/**
 * AMS Configuration - Unified Entry Point
 * 
 * Import order matters - base → derived
 */

// Base configuration
export * from './core.js';
export * from './paths.js';
export * from './states.js';

// Feature configurations
export * from './auth.js';
export * from './claude.js';
export * from './models.js';
export * from './rag.js';
export * from './gsd.js';
export * from './alerts.js';

// Legacy compatibility re-exports
// (to be removed after migration)
export { AgentState as GsdAgentState } from './states.js';
export { WorkflowState as GsdWorkflowState } from './states.js';
```

---

## 3. ТАБЛИЦА МИГРАЦИИ

### 3.1 Импорты: Было → Стало

| Файл | Было | Стало |
|------|------|-------|
| `src/gsd/engine.js` | `import { AMS_ROOT } from "../domains/gsd/config.js"` | `import { AMS_ROOT, WORKFLOW_STORAGE_DIR } from "../config/paths.js"` |
| `src/gsd/agent-pool.js` | `import { AMS_ROOT } from "../domains/gsd/config.js"` | `import { AMS_ROOT, POOL_STORAGE_DIR } from "../config/paths.js"` |
| `src/gsd/agent-types.js` | (local AgentState) | `import { AgentState } from "../config/states.js"` |
| `src/tools/gsd-workflow.js` | `import { AMS_ROOT } from "../domains/gsd/config.js"` | `import { WORKFLOW_CATALOG_PATH, POOL_CATALOG_PATH } from "../config/paths.js"` |
| `src/domains/gsd/*.js` | `import { GSD_ROOT, STATE_FILE } from "./config.js"` | `import { GSD_ROOT, GSD_STATE_FILE } from "../../config/paths.js"` |
| `src/alerts/rules.js` | (local ALERT_SEVERITY) | `import { AlertSeverity, AlertOperator } from "../config/alerts.js"` |
| `src/alerts/engine.js` | (local ALERT_SEVERITY) | `import { AlertSeverity } from "../config/alerts.js"` |
| `src/analysis/rag*.js` | `import { ... } from "../config.js"` | `import { ... } from "../config/rag.js"` |
| `src/claude/core/models.js` | (keep as primary) | Remove duplicate from `src/config/claude.js` |
| `src/config/claude.js` | CLAUDE_MODELS | Import from `../claude/core/models.js` |

### 3.2 Константы: Было → Стало

| Константа | Было в | Перемещена в |
|-----------|--------|--------------|
| `AMS_ROOT` | `config.js`, `domains/gsd/config.js` | `config/paths.js` |
| `GSD_ROOT` | `domains/gsd/config.js` | `config/paths.js` |
| `STATE_FILE` | `domains/gsd/config.js` | `config/paths.js` → `GSD_STATE_FILE` |
| `PLANNING_ROOT` | `domains/gsd/config.js` | `config/paths.js` |
| `WORKFLOW_STORAGE_DIR` | `gsd/engine.js` (local) | `config/paths.js` |
| `POOL_STORAGE_DIR` | `gsd/agent-pool.js` (local) | `config/paths.js` |
| `WORKFLOW_CATALOG_PATH` | `tools/gsd-workflow.js` (local) | `config/paths.js` |
| `WorkflowState` | `gsd/engine.js` | `config/states.js` |
| `PhaseState` | `gsd/engine.js` | `config/states.js` |
| `AgentState` | `gsd/agent-types.js`, `gsd/engine.js`, `gsd/agent-pool.js` | `config/states.js` (merged) |
| `AgentType` | `gsd/agent-pool.js` | `config/states.js` |
| `LEASE_DURATION_MS` | `domains/gsd/constants.js` | `config/gsd.js` |
| `DEFAULT_SKILL_REGISTRY` | `domains/gsd/constants.js` | `config/gsd.js` |
| `DEFAULT_SPAWN_RULES` | `domains/gsd/constants.js` | `config/gsd.js` |
| `DEFAULT_CHUNK_SIZE` | `analysis/rag-constants.js` | `config/rag.js` |
| `GRAPH_RELATION_WEIGHTS` | `analysis/rag-constants.js` | `config/rag.js` |
| `ALERT_RULE_TYPES` | `alerts/rules.js` | `config/alerts.js` → `AlertRuleType` |
| `ALERT_OPERATORS` | `alerts/rules.js` | `config/alerts.js` → `AlertOperator` |
| `ALERT_SEVERITY` | `alerts/rules.js`, `alerts/engine.js` | `config/alerts.js` → `AlertSeverity` |

---

## 4. ПРОВЕРКА ЦЕЛОСТНОСТИ

### 4.1 Чек-лист миграции

- [ ] Создать новые файлы конфигурации
- [ ] Обновить импорты в `src/gsd/engine.js`
- [ ] Обновить импорты в `src/gsd/agent-pool.js`
- [ ] Обновить импорты в `src/gsd/agent-types.js`
- [ ] Обновить импорты в `src/tools/gsd-workflow.js`
- [ ] Обновить импорты в `src/domains/gsd/*.js`
- [ ] Обновить импорты в `src/alerts/rules.js`
- [ ] Обновить импорты в `src/alerts/engine.js`
- [ ] Обновить импорты в `src/analysis/rag*.js`
- [ ] Удалить дубликаты CLAUDE_MODELS из `src/config/claude.js`
- [ ] Смерджить AgentState определения
- [ ] Удалить `src/domains/gsd/config.js` (устарел)
- [ ] Проверить циклические зависимости
- [ ] Запустить тесты

### 4.2 Потенциальные проблемы

#### Проблема 1: Циклические зависимости
```javascript
// Было: gsd/engine.js -> domains/gsd/config.js -> (nothing)
// Стало: gsd/engine.js -> config/paths.js -> (clean)
```
✅ Решение: `config/paths.js` не имеет зависимостей от других модулей проекта

#### Проблема 2: Разные AgentState
```javascript
// agent-types.js: PENDING, INITIALIZING, READY, BUSY, FAILED, TERMINATED
// engine.js: IDLE, BUSY, ERROR, TERMINATED
// agent-pool.js: IDLE, BUSY, ERROR, TERMINATED, SPAWNING, HEALTH_CHECKING
```
✅ Решение: Объединить в единый набор (см. states.js выше)

#### Проблема 3: Разные структуры CLAUDE_MODELS
```javascript
// config/claude.js: { name, maxTokens, contextWindow, inputCostPer1K, ... }
// claude/core/models.js: { id, name, displayName, tier, capabilities[], pricing{}, ... }
```
✅ Решение: Использовать `claude/core/models.js` как канонический источник

### 4.3 Тестовые сценарии

```javascript
// Тест 1: Все импорты работают
import { 
    AMS_ROOT, 
    WORKFLOW_STORAGE_DIR,
    WorkflowState,
    AgentState,
    PhaseState,
    AlertSeverity 
} from "./config/index.js";

// Тест 2: Состояния доступны
console.log(WorkflowState.RUNNING); // "running"
console.log(AgentState.IDLE); // "idle"

// Тест 3: Пути валидны
import fs from "fs";
console.log(fs.existsSync(AMS_ROOT)); // true

// Тест 4: Нет дублирования
// Проверить что CLAUDE_MODELS определены только в одном месте
```

---

## 5. ЭТАПЫ ВНЕДРЕНИЯ

### Этап 1: Подготовка (безопасно)
1. Создать новые файлы `paths.js`, `states.js`, `rag.js`, `gsd.js`, `alerts.js`
2. Обновить `config/index.js` для реэкспорта
3. Оставить старые файлы для обратной совместимости

### Этап 2: Миграция импортов
1. Обновить импорты в `gsd/*.js`
2. Обновить импорты в `alerts/*.js`
3. Обновить импорты в `analysis/*.js`
4. Обновить импорты в `tools/*.js`

### Этап 3: Удаление дубликатов
1. Упростить `config/claude.js` (удалить CLAUDE_MODELS дубликат)
2. Удалить `domains/gsd/config.js`
3. Удалить `config-auth.js` (перенести в `config/auth.js`)

### Этап 4: Очистка
1. Пометить старые экспорты как `@deprecated`
2. Обновить документацию
3. Удалить deprecated код в следующем мажорном релизе

---

## 6. ПОСЛЕ МИГРАЦИИ

### Структура src/config/
```
src/config/
├── index.js       # 30 lines - точка входа
├── core.js        # 200 lines - env vars, базовая конфигурация
├── paths.js       # 50 lines - все пути
├── states.js      # 80 lines - все состояния
├── auth.js        # 100 lines - аутентификация
├── claude.js      # 50 lines - API URLs (models импортируются)
├── models.js      # 50 lines - реэкспорт из claude/core/models.js
├── rag.js         # 50 lines - RAG константы
├── gsd.js         # 80 lines - GSD константы
└── alerts.js      # 50 lines - Alert константы
```

### Итого
- **Было**: 11 файлов конфигурации, разбросанных по проекту, ~2500 строк
- **Стало**: 9 файлов в `src/config/`, централизовано, ~800 строк без дубликатов

---

## 7. СВЯЗАННЫЕ ЗАДАЧИ

- [ ] Обновить документацию в `AGENTS.md`
- [ ] Обновить README с новой структурой конфигурации
- [ ] Добавить тесты для `config/states.js`
- [ ] Добавить тесты для `config/paths.js`
- [ ] Создать миграционный скрипт для автоматического обновления импортов
