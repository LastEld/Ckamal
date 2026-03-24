# Code Analysis: Core Modules

## Дерево папок

```
src/
├── server.js                      # Entry point - MCP Server
├── config.js                      # Centralized configuration
├── config-auth.js                 # Auth configuration module
├── config/
│   ├── index.js                   # Config loader with validation
│   └── claude.js                  # Claude API configuration
├── controllers/
│   ├── index.js                   # Main tool router
│   ├── analysis.js                # Codebase analysis tools
│   ├── analytics.js               # Analytics controller
│   ├── audit.js                   # Audit log controller
│   ├── autonomous.js              # Autonomous execution controller
│   ├── claude-*.js                # Claude-specific controllers (15 files)
│   ├── context.js                 # Context management
│   ├── memory.js                  # Memory controller
│   ├── merkle.js                  # Merkle tree controller
│   ├── performance.js             # Performance monitoring
│   ├── roadmaps.js                # Roadmap controller
│   ├── tasks.js                   # Task controller
│   ├── thought.js                 # Thought chain controller
│   ├── unified.js                 # Unified interface controller
│   ├── watchers.js                # File watchers controller
│   └── autonomous/                # Autonomous sub-modules
│       ├── change-ops.js
│       ├── intents.js
│       ├── persistence.js
│       ├── roadmap-helpers.js
│       └── tools.js
├── claude/
│   ├── core/                      # Claude API foundation
│   │   ├── index.js               # Core exports
│   │   ├── client.js              # Enhanced API client
│   │   ├── models.js              # Model registry
│   │   ├── budget.js              # Budget management
│   │   ├── resilience.js          # Circuit breaker & retry
│   │   ├── retry.js               # Advanced retry logic
│   │   ├── prompt-cache.js        # Prompt caching
│   │   ├── deduplication.js       # Request deduplication
│   │   └── enhanced-client.js     # Extended client features
│   ├── admin/                     # Organization & workspace mgmt
│   ├── analytics/                 # Conversation analytics
│   ├── batch/                     # Batch processing
│   ├── batch-api/                 # Message Batches API
│   ├── citations/                 # Citation handling
│   ├── computer/                  # Computer use (beta)
│   ├── context/                   # Context optimization
│   ├── conversation/              # Conversation management
│   ├── extended-thinking/         # Extended thinking mode
│   ├── files/                     # File handling
│   ├── messages/                  # Message indexing
│   ├── models/                    # Model features registry
│   ├── pdf-api/                   # PDF API integration
│   ├── resilience/                # Resilience patterns
│   ├── router/                    # Smart routing
│   ├── streaming/                 # Streaming support
│   ├── threads/                   # Thread management
│   ├── tokens/                    # Token management
│   ├── tool-chain/                # Tool chain composer
│   ├── usage/                     # Usage & billing
│   ├── vision/                    # Vision capabilities
│   ├── webhooks/                  # Webhook handling
│   └── workspaces/                # Workspace management
├── db/
│   ├── index.js                   # Database facade & CRUD
│   ├── bootstrap.js               # DB initialization
│   ├── timeseries.js              # Time-series metrics
│   ├── schema.sql                 # Main schema
│   ├── vector-schema.sql          # Vector storage schema
│   ├── message-index-schema.sql   # Message index schema
│   ├── thread-schema.sql          # Thread schema
│   ├── schema-batch.sql           # Batch schema
│   ├── connection/                # Connection management
│   │   └── index.js               # Provider abstraction
│   ├── migrations/                # Database migrations
│   ├── indexing/                  # Async indexing queue
│   ├── transactions/              # Transaction controller
│   ├── providers/                 # DB providers (sqlite, postgres)
│   ├── repositories/              # Data repositories
│   │   ├── tasks.js               # Task repository
│   │   ├── projects.js            # Project repository
│   │   ├── contexts.js            # Context repository
│   │   ├── rag.js                 # RAG repository
│   │   ├── memory-frames.js       # Memory frame repository
│   │   ├── merkle.js              # Merkle tree repository
│   │   ├── roadmap-progress.js    # Progress repository
│   │   ├── circuit-breaker-state.js
│   │   └── project-members.js     # ACL repository
│   └── audit/
│       └── context-resolution.js  # Action context resolver
├── domains/
│   ├── roadmaps/                  # Roadmap domain
│   │   └── index.js               # Roadmap operations
│   ├── tasks/                     # Task domain
│   │   ├── index.js               # Task CRUD & Eisenhower matrix
│   │   ├── gsd-sync.js            # GSD sync logic
│   │   ├── markdown-sync.js       # Markdown sync
│   │   └── file-storage.js        # File storage
│   ├── gsd/                       # GSD domain
│   │   ├── index.js               # GSD state management
│   │   ├── config.js              # GSD config
│   │   ├── constants.js           # GSD constants
│   │   ├── tools.js               # GSD tools
│   │   └── validation.js          # Input validation
│   ├── context/                   # Context domain
│   │   └── index.js               # Context snapshots
│   ├── thought/                   # Thought chain domain
│   │   └── index.js               # Thought operations
│   ├── merkle/                    # Merkle tree domain
│   ├── architecture/              # Architecture domain
│   ├── integrations/              # Integrations domain
│   ├── orchestration/             # Orchestration domain
│   ├── retention/                 # Data retention domain
│   └── CONTRACT.md                # Domain contracts
├── services/
│   ├── context-manager.js         # Context window management
│   └── embeddings.js              # Embedding service
├── middleware/
│   ├── index.js                   # Middleware exports
│   ├── auth.js                    # Authentication
│   ├── acl.js                     # Access control
│   ├── audit.js                   # Audit logging
│   ├── metrics.js                 # Metrics collection
│   ├── orchestration.js           # Orchestration hooks
│   ├── runtime-pid-lock.js        # Runtime PID locking
│   ├── startup-lock.js            # Startup locking
│   ├── tool-lock.js               # Tool serialization
│   └── watcher-leader.js          # Watcher leader election
├── composition/                   # Composition gateways
│   ├── db-gateway.js              # DB access gateway
│   ├── roadmap-gateway.js         # Roadmap access gateway
│   ├── git-checkpoint-gateway.js  # Git checkpoint gateway
│   └── todos-template.js          # TODO templates
├── tools/                         # Tool implementations
│   ├── claude-api.js              # Claude API tools
│   ├── claude-api-core.js         # Core Claude tools
│   ├── gsd-workflow.js            # GSD workflow tools
│   ├── intelligence.js            # Intelligence tools
│   ├── memory-smart.js            # Smart memory tools
│   ├── observability.js           # Observability tools
│   └── profile.js                 # Tool profile management
├── gsd/                           # GSD engine (legacy)
│   ├── index.js
│   ├── agent.js
│   ├── agent-pool.js
│   ├── agent-pool-manager.js
│   ├── agent-pool-index.js
│   ├── agent-types.js
│   ├── aggregator.js
│   ├── auto-scaler.js
│   ├── checkpoint.js
│   ├── concurrency.js
│   ├── engine.js
│   ├── load-balancer.js
│   ├── lock.js
│   ├── parallel-executor.js
│   ├── planner.js
│   ├── task-queue.js
│   └── verifier.js
├── analysis/                      # Analysis modules
│   ├── index.js
│   ├── auto-fix.js
│   ├── codebase-scanner.js
│   ├── lru-cache.js
│   ├── memory-qr.js
│   ├── rag.js
│   ├── rag-constants.js
│   ├── rag-embeddings.js
│   ├── rag-metrics.js
│   ├── rag-quality.js
│   └── rag-search.js
├── intelligence/                  # AI/ML intelligence layer
│   ├── index.js
│   ├── anomaly.js
│   ├── classifier.js
│   ├── learner.js
│   ├── matcher.js
│   ├── measurement.js
│   ├── models/
│   ├── optimizer.js
│   ├── optimizers/
│   ├── patterns.js
│   ├── predictor.js
│   ├── recommender.js
│   ├── router-cache.js
│   ├── router-engine.js
│   ├── router.js
│   ├── scheduler.js
│   └── scorer.js
├── alerts/                        # Alert system
├── analytics/                     # Analytics system
├── composition/                   # Composition layer
├── dashboard/                     # Web dashboard
├── metrics/                       # Metrics collection
├── performance/                   # Performance optimization
├── runtime/                       # Runtime management
├── security/                      # Security modules
├── validation/                    # Validation schemas
├── utils/                         # Utilities
├── watchers/                      # File watchers
└── websocket/                     # WebSocket server
```

---

## Файлы по папкам

### src/server.js
- **Назначение**: Entry point AMS MCP Server. Управляет жизненным циклом сервера, инициализацией и graceful shutdown.
- **Ключевые переменные**:
  - `activeRequests` (number) - счётчик активных запросов
  - `isShuttingDown` (boolean) - флаг завершения работы
  - `initReady` (Promise) - гейт инициализации (блокирует tool calls до готовности)
  - `idleTimer` (Timeout) - таймер idle timeout
  - `initialParentPid` (number) - PID родительского процесса для мониторинга
- **Импорты**:
  - `@modelcontextprotocol/sdk` - MCP SDK (Server, StdioServerTransport, schemas)
  - `./config.js` - конфигурация (AMS_ROOT, таймауты, режимы)
  - `./db/index.js` - инициализация БД
  - `./domains/*` - доменные модули (roadmaps, tasks, gsd, context)
  - `./controllers/index.js` - маршрутизация tool calls
  - `./middleware/*` - ACL, audit, circuit breaker, retry, rate limit
  - `./websocket/server.js` - WebSocket сервер
- **Экспорты**: Нет (standalone executable)
- **Связи**: 
  - Вызывает `initDatabase()` → `./db/index.js`
  - Регистрирует runtime hooks для RAG и memory
  - Инициализирует все domain modules

### src/config.js
- **Назначение**: Централизованная конфигурация всех компонентов AMS. Избегает циклических импортов.
- **Ключевые переменные**:
  - `AMS_ROOT` (string) - корневая директория проекта
  - `AMS_NODE_ENV` (string) - режим (development/test/production)
  - `AMS_SECURITY_MODE` (string) - 'permissive' | 'enforced'
  - `AMS_DB_PROVIDER` (string) - 'sqlite' | 'postgres'
  - `AMS_MCP_IDLE_TIMEOUT_MS` (number) - idle timeout для MCP
  - `AMS_WATCH_MODE` (string) - 'all' | 'none' | 'list'
  - `AMS_EMBEDDING_PROVIDER` (string) - 'local' | 'openai'
  - `AMS_AUTONOMOUS_APPLY_ENABLED` (boolean) - разрешить автономное применение
- **Импорты**: `fs`, `path`, `fileURLToPath`
- **Экспорты**: Все переменные конфигурации как named exports
- **Связи**: Используется всеми модулями

### src/config-auth.js
- **Назначение**: Дополнительная конфигурация аутентификации и авторизации
- **Ключевые переменные**:
  - `AMS_AUTH_MODE` (string) - 'trust' | 'token' | 'hybrid' | 'required'
  - `AMS_AUTH_SECRET` (string) - HMAC signing secret
  - `AMS_AUTH_TOKEN_LIFETIME` (number) - время жизни токена
  - `AMS_DESKTOP_MODE` (boolean) - режим десктопа
  - `AMS_AUTH_RATE_LIMIT_MAX` (number) - лимит запросов
- **Импорты**: `fs`, `path`, `os`
- **Экспорты**: Конфигурация + helper функции (`isAuthRequired`, `isTokenAuthEnabled`, `getAuthConfig`)
- **Связи**: Используется `./middleware/auth.js`, `./middleware/acl.js`

### src/config/index.js
- **Назначение**: Загрузчик конфигурации из JSON-файлов с валидацией
- **Ключевые переменные**:
  - `_config` (object) - кэш загруженной конфигурации
  - `_configHash` (string) - SHA256 хеш конфига
  - `_driftDetected` (boolean) - флаг изменения конфигурации
- **Импорты**: `fs`, `path`, `crypto`
- **Экспорты**: `loadConfig`, `getConfig`, `getFullConfig`, `getDriftStatus`, `saveConfigBaseline`
- **Связи**: Загружает `config/default.json`, `config/{NODE_ENV}.json`

### src/config/claude.js
- **Назначение**: Конфигурация Claude API
- **Ключевые переменные**:
  - `CLAUDE_API_KEY` (string) - API ключ
  - `CLAUDE_MODELS` (object) - реестр моделей с параметрами
  - `CLAUDE_RATE_LIMIT` (object) - лимиты RPM/TPM
  - `CLAUDE_TIMEOUTS` (object) - таймауты
- **Импорты**: `fileURLToPath`, `path`
- **Экспорты**: Конфигурация + функции (`getModelConfig`, `calculateCost`, `estimateTokens`)
- **Связи**: Используется всеми Claude-контроллерами

---

## src/claude/

### src/claude/core/
- **Назначение**: Foundation layer для всех Claude API interactions

#### client.js
- **Переменные**: 
  - `DEFAULT_CONFIG` - дефолтная конфигурация клиента
  - `defaultClient` (ClaudeClient) - singleton instance
- **Классы**: `ClaudeClient`, `ClaudeClientError`, `ClaudeAPIError`
- **Функции**: `getClient`, `setClient`
- **Связи**: Использует `./resilience.js` (CircuitBreaker, withRetry), `./models.js` (resolveModelId)

#### models.js
- **Переменные**: `CLAUDE_MODELS`, `MODEL_ALIASES`, `DEFAULT_MODEL_SETTINGS`
- **Enum**: `ModelCapability`, `ModelTier`
- **Функции**: `resolveModelId`, `getModel`, `calculateCost`, `estimateTokens`
- **Связи**: Используется `client.js`, всеми Claude-контроллерами

#### resilience.js
- **Переменные**: `circuitBreakers` (Map)
- **Классы**: `CircuitBreaker`, `CircuitBreakerError`
- **Enum**: `CircuitState`
- **Функции**: `withRetry`, `withResilience`, `getCircuitBreaker`
- **Связи**: Используется `client.js`, `./middleware/index.js`

#### budget.js
- **Классы**: `BudgetManager`
- **Enum**: `BudgetType`, `AlertSeverity`
- **Функции**: `getBudgetManager`, `setBudgetManager`
- **Связи**: Используется `client.js` для трекинга бюджета

### src/claude/conversation/
- **Назначение**: Управление conversation сессиями
- **Файлы**: `index.js`, `manager.js`, `storage.js`, `context.js`, `templates.js`

### src/claude/threads/
- **Назначение**: Thread management (ветвление, слияние)
- **Файлы**: `index.js`, `manager.js`, `storage.js`, `branch.js`, `merge.js`

### src/claude/vision/
- **Назначение**: Vision capabilities (анализ изображений)
- **Файлы**: `index.js`, `analyzer.js`, `engine.js`, `preprocessor.js`, `storage.js`

---

## src/controllers/

### src/controllers/index.js
- **Назначение**: Центральный роутер всех MCP tools
- **Ключевые переменные**:
  - `allTools` (array) - полный список всех tools
  - `visibleTools` (array) - отфильтрованный список (профиль)
  - `toolProfileMeta` (object) - метаданные профиля
  - `visibleToolNameSet` (Set) - для быстрой проверки
- **Импорты**: Все контроллеры, `../tools/*`, `../middleware/*`, `../config.js`
- **Экспорты**: `visibleTools`, `toolProfileMeta`, `routeTool`, все handle-функции
- **Функция `routeTool(name, args)`**: 
  - Проверяет ACL
  - Применяет orchestration hooks
  - Маршрутизирует в специализированные контроллеры
  - Возвращает результат с метаданными

### src/controllers/roadmaps.js
- **Назначение**: Обработка roadmap-related tools
- **Импорты**: `../domains/roadmaps/index.js`
- **Tools**: `roadmap_list`, `roadmap_get`, `roadmap_register`, `roadmap_validate`

### src/controllers/tasks.js
- **Назначение**: Обработка task-related tools
- **Импорты**: `../domains/tasks/index.js`
- **Tools**: `task_create`, `task_update`, `task_delete`, `task_list`, `task_eisenhower`, `task_next_actions`

### src/controllers/autonomous.js
- **Назначение**: Autonomous execution pipeline
- **Импорты**: `../domains/gsd/index.js`, `../composition/git-checkpoint-gateway.js`
- **Tools**: `autonomous_plan`, `autonomous_apply`, `autonomous_dry_run`

---

## src/db/

### src/db/index.js
- **Назначение**: Database facade - единая точка доступа ко всем CRUD операциям
- **Ключевые переменные**:
  - `transactionController` - контроллер транзакций
  - `auditQueue` (Promise) - очередь для audit записей
  - `thoughtQueue` (Promise) - очередь для thought записей
- **Импорты**: 
  - `./repositories/*` - все репозитории
  - `./transactions/index.js` - transaction controller
  - `./bootstrap.js` - инициализация
  - `../config.js` - DB конфигурация
- **Экспорты**: 
  - Инициализация: `initDatabase`, `closeDatabase`, `getDb`
  - Транзакции: `beginTransaction`, `commitTransaction`, `rollbackTransaction`, `withTransaction`
  - Tasks: `dbCreateTask`, `dbGetTask`, `dbUpdateTask`, `dbDeleteTask`, `dbListTasks`
  - Context: `dbCreateContext`, `dbGetContext`, `dbGetLatestContext`
  - RAG: `dbUpsertRagDocument`, `dbSearchRagChunks`, `dbGetRagStats`
  - Memory: `dbUpsertMemoryFrame`, `dbGetMemoryGraph`
  - Audit: `dbLogAction`, `dbGetActionsBySession`, `dbLogThought`
  - Merkle: `dbBuildMerkleTree`, `dbGetMerkleRoot`

### src/db/bootstrap.js
- **Назначение**: Инициализация БД с миграциями
- **Ключевые переменные**:
  - `db` - database instance
  - `sqliteDbPath` - путь к SQLite
- **Импорты**: `./connection/index.js`, `./migrations/index.js`, `../config.js`
- **Экспорты**: `initDatabaseConnection`, `getDatabase`, `closeDatabaseConnection`

### src/db/repositories/
- **Назначение**: Data access layer
- **tasks.js**: CRUD для tasks, dependencies
- **projects.js**: GSD projects
- **contexts.js**: Context snapshots
- **rag.js**: RAG documents и embeddings
- **memory-frames.js**: Memory frames и edges
- **merkle.js**: Merkle tree операции
- **roadmap-progress.js**: Прогресс по roadmap

### src/db/transactions/index.js
- **Назначение**: Transaction controller с AsyncLocalStorage
- **Ключевые переменные**: `transactionController`
- **Экспорты**: `createTransactionController`
- **Функции**: `beginTransaction`, `commitTransaction`, `rollbackTransaction`, `withTransaction`

---

## src/domains/

### src/domains/roadmaps/index.js
- **Назначение**: Domain logic для educational roadmaps
- **Ключевые переменные**:
  - `ROADMAPS_DIR` - директория с roadmaps
  - `MEANINGFUL_NODE_TYPES` - фильтр learning nodes
  - LRU caches: `roadmapMetadataCache`, `roadmapGraphCache`, etc.
- **Импорты**: `fs`, `path`, `yaml`, `../../config.js`, `../../composition/db-gateway.js`
- **Экспорты**: 
  - Core: `getRoadmapDir`, `getRoadmapPath`, `getRoadmapJsonPath`
  - Operations: `listRoadmaps`, `getRoadmap`, `getRoadmapNodes`, `getRoadmapNode`
  - Management: `registerRoadmap`, `validateRoadmap`, `validateAllRoadmaps`

### src/domains/tasks/index.js
- **Назначение**: Domain logic для task management
- **Ключевые функции**:
  - `detectProjectContext()` - smart project detection с fallback
  - `createTask()`, `updateTask()`, `deleteTask()`
  - `getEisenhowerMatrix()` - матрица Эйзенхауэра
  - `getNextActions()` - приоритетные действия
  - `generateProductivityReport()`
  - `handleTaskDeps()` - управление зависимостями
- **Импорты**: `../../config.js`, `../../composition/db-gateway.js`, `./gsd-sync.js`

### src/domains/gsd/index.js
- **Назначение**: GSD (Get Shit Done) domain - spec-driven development
- **Ключевые переменные**:
  - `stateCache` - in-memory состояние
  - `activeLeases` (Map) - активные leases
- **Импорты**: `fs`, `path`, `crypto`, `../../config.js`, `./config.js`, `./constants.js`
- **Экспорты**:
  - State: `getStateValue`, `setStateValue`, `deleteStateValue`
  - Leases: `createLease`, `returnLease`
  - Agents: `resolveAgentSpawnPlan`, `queueAgentSpawnPlan`, `completeSpawnQueueItem`
  - Skills: `registerSkill`, `bindSkillToAgent`, `listSkillMatrix`
  - Project bindings: `syncProjectBinding`, `getProjectBinding`

### src/domains/context/index.js
- **Назначение**: Context snapshots для audit
- **Ключевые функции**:
  - `createContext(roadmapId)` - создание snapshot
  - `ensureContext(roadmapId)` - auto-create если изменился
  - `verifyContext(contextId)` - проверка integrity
  - `compareContexts(id1, id2)` - сравнение snapshot
- **Импорты**: `crypto`, `../../validation/schemas.js`, `../../composition/roadmap-gateway.js`, `../../composition/db-gateway.js`

---

## src/services/

### src/services/context-manager.js
- **Назначение**: Context window management с токенами и компрессией
- **Классы**: `ContextWindow`
- **Константы**: `DEFAULT_MAX_TOKENS`, `COMPRESSION_STRATEGIES`
- **Функции**: 
  - `estimateTokens(text)` - оценка токенов
  - `loadSessionContext(sessionId)` - загрузка из БД
  - `compressSessionContext(sessionId)` - компрессия
  - `rankMemoriesByRelevance(query, memories)` - ранжирование
- **Импорты**: `crypto`, `../db/index.js`, `./embeddings.js`

### src/services/embeddings.js
- **Назначение**: Генерация embeddings для RAG
- **Функции**: `generateEmbedding(text)`, `cosineSimilarity(a, b)`

---

## src/middleware/

### src/middleware/index.js
- **Назначение**: Middleware layer (circuit breaker, retry, rate limit)
- **Ключевые переменные**:
  - `circuitBreakers` (Map) - состояние circuit breaker
  - `rateLimits` (Map) - состояние rate limit
- **Функции**:
  - `withCircuitBreaker(toolName, fn)` - circuit breaker wrapper
  - `withRetry(fn, maxRetries)` - retry с exponential backoff
  - `withRateLimit(toolName, fn)` - rate limiting
  - `isRetryableError(error)` - проверка retryable ошибок
- **Импорты**: `perf_hooks`, `../config.js`
- **Re-exports**: `../middleware/auth.js`

### src/middleware/acl.js
- **Назначение**: Access Control Layer
- **Ключевые функции**: `enforceACL`, `runWithAclContext`

### src/middleware/audit.js
- **Назначение**: Audit logging
- **Ключевые функции**: `withAudit`, `runWithAuditContext`, `enrichSessionWithAcl`

---

## Таблица связей

| Файл | Импортирует из | Использует | Зависимости |
|------|----------------|------------|-------------|
| `server.js` | `./config.js`, `./db/index.js`, `./domains/*`, `./controllers/index.js`, `./middleware/*` | `initDatabase`, `routeTool`, `visibleTools`, ACL, Audit | `@modelcontextprotocol/sdk` |
| `config.js` | `fs`, `path` | `process.env` | - |
| `controllers/index.js` | `./claude-*.js`, `../tools/*`, `../middleware/*`, `../config.js` | `handle*Tool`, `enforceACL`, `withAudit`, `AMS_TOOL_PROFILE` | `@modelcontextprotocol/sdk` |
| `db/index.js` | `./repositories/*`, `./transactions/index.js`, `./bootstrap.js`, `../config.js` | `getDatabase`, `withTransaction`, все repo-функции | `better-sqlite3` или `pg` |
| `domains/roadmaps/index.js` | `fs`, `path`, `yaml`, `../../config.js`, `../../composition/db-gateway.js` | `ROADMAPS_DIR`, `dbUpdateRoadmapProgress` | `js-yaml` |
| `domains/tasks/index.js` | `../../config.js`, `../../composition/db-gateway.js` | `AMS_ACL_ENABLED`, `dbCreateTask`, `dbListTasks` | - |
| `domains/gsd/index.js` | `fs`, `path`, `crypto`, `../../config.js`, `./config.js`, `./constants.js` | `STATE_FILE`, `GSD_ROOT` | - |
| `domains/context/index.js` | `crypto`, `../../validation/schemas.js`, `../../composition/*` | `dbCreateContext`, `dbGetContext` | `zod` |
| `claude/core/client.js` | `./resilience.js`, `./models.js`, `./budget.js` | `CircuitBreaker`, `resolveModelId`, `BudgetManager` | - |
| `claude/core/models.js` | - | `process.env` | - |
| `middleware/index.js` | `perf_hooks`, `../config.js`, `./auth.js` | `AMS_DB_RETRY_*`, `performance.now()` | - |
| `services/context-manager.js` | `../db/index.js`, `./embeddings.js` | `getDb`, `generateEmbedding` | - |

---

## Ключевые переменные системы

| Переменная | Файл | Назначение | Где используется |
|------------|------|------------|------------------|
| `AMS_ROOT` | `config.js` | Корневая директория проекта | Все модули |
| `AMS_DB_PROVIDER` | `config.js` | Провайдер БД (sqlite/postgres) | `db/`, `db/connection/` |
| `AMS_USER_ID` | `config.js` | ID пользователя для ACL | `middleware/acl.js` |
| `AMS_SECURITY_MODE` | `config.js` | Режим безопасности | `server.js`, `middleware/acl.js` |
| `AMS_MCP_IDLE_TIMEOUT_MS` | `config.js` | Idle timeout сервера | `server.js` |
| `AMS_WATCH_MODE` | `config.js` | Режим watchers | `server.js`, `watchers/` |
| `AMS_AUTONOMOUS_APPLY_ENABLED` | `config.js` | Разрешить apply | `controllers/autonomous.js` |
| `AMS_EMBEDDING_PROVIDER` | `config.js` | Провайдер embeddings | `services/embeddings.js` |
| `CLAUDE_API_KEY` | `config/claude.js` | API ключ Claude | `claude/core/client.js` |
| `CLAUDE_DEFAULT_MODEL` | `config/claude.js` | Модель по умолчанию | `claude/core/models.js` |
| `GSD_ROOT` | `domains/gsd/config.js` | Директория GSD | `domains/gsd/index.js` |
| `STATE_FILE` | `domains/gsd/config.js` | Файл состояния GSD | `domains/gsd/index.js` |

---

## Неиспользуемый/Legacy код

### Потенциально неиспользуемые модули:

1. **`src/gsd/`** (корневая папка)
   - Статус: LEGACY
   - Причина: Перенесено в `src/domains/gsd/`
   - Файлы: `agent.js`, `engine.js`, `planner.js`, etc.

2. **`src/dashboard/`**
   - Статус: Возможно не используется
   - Файлы: `server.js`, `websocket.js`, `public/*`

3. **`src/runtime/`**
   - Статус: Неясно
   - Файлы: `coordinator.js`, `daemon.js`, `coexistence-manager.js`

4. **`src/analysis/rag-*.js` (часть)**
   - Некоторые модули могут быть частично заменены на `src/db/indexing/queue.js`

5. **`src/claude/batch/` vs `src/claude/batch-api/`**
   - Возможно дублирование функциональности
   - `batch/` - старая batch processing
   - `batch-api/` - новый Message Batches API

6. **`src/composition/file-lock.js`**
   - Статус: Возможно заменен на `src/utils/file-lock.js`

### Функции с TODO/deprecated комментариями:

- `src/controllers/claude-computer.js` - помечен как legacy (beta API)
- `src/claude/computer/` - beta API, возможно устареет

### Неиспользуемые импорты (потенциально):

- `src/controllers/index.js` импортирует множество контроллеров, но не все могут быть активны
- Часть `claude-*` контроллеров могут быть выключены через `AMS_TOOL_PROFILE`

---

## Архитектурные паттерны

1. **Layered Architecture**:
   - Presentation: `controllers/`
   - Domain: `domains/`
   - Data: `db/repositories/`
   - Services: `services/`

2. **Facade Pattern**: `db/index.js` - единая точка доступа к БД

3. **Gateway Pattern**: `composition/*-gateway.js` - изоляция внешних зависимостей

4. **Middleware Chain**: `middleware/index.js` - composable middleware

5. **Domain-Driven Design**: `domains/` - каждый домен имеет четкие границы

6. **Repository Pattern**: `db/repositories/` - абстракция доступа к данным

7. **Circuit Breaker**: `middleware/index.js`, `claude/core/resilience.js`

8. **Async Queue**: `db/index.js` (auditQueue, thoughtQueue)

---

## База данных (Схемы)

### Основные таблицы (schema.sql):
- `mcp_context` - контекст snapshots
- `mcp_session_context` - привязка сессий к контексту
- `mcp_action` - audit log действий
- `mcp_thought` - thought chain
- `gsd_projects` - GSD проекты
- `gsd_tasks` - задачи
- `task_dependencies` - зависимости задач

### RAG таблицы (vector-schema.sql):
- `rag_documents` - документы
- `rag_chunks` - чанки для поиска
- `rag_embeddings` - embedding vectors

### Memory таблицы:
- `memory_frames` - memory frames (AMS-QR)
- `memory_frame_zones` - зоны фреймов
- `memory_edges` - связи между фреймами

### Merkle таблицы:
- `merkle_trees` - Merkle trees
- `merkle_leaves` - листья деревьев

---

*Анализ создан: 2026-03-23*
*Версия AMS: 3.3.0*
