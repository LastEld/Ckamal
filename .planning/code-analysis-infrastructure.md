# Code Analysis: Infrastructure

## Дерево папок
```
src/
├── middleware/
│   ├── index.js              # Re-exports + core middleware (circuit breaker, retry, rate limit)
│   ├── auth.js               # JWT token-based authentication
│   ├── acl.js                # Role-based access control (RBAC)
│   ├── audit.js              # Action instrumentation with AsyncLocalStorage
│   ├── auth-permissions.js   # Tool-to-permission mappings
│   ├── metrics.js            # Performance metrics collection
│   ├── orchestration.js      # Pre/post tool orchestration rules
│   ├── runtime-pid-lock.js   # Runtime PID file locking
│   ├── startup-lock.js       # DB initialization lock
│   ├── tool-lock.js          # MCP tool execution serialization
│   └── watcher-leader.js     # File watcher leader election
├── utils/
│   ├── cache.js              # LRU Cache implementation
│   ├── file-lock.js          # Re-export from composition/file-lock
│   ├── git-checkpoint.js     # Git-based checkpoint system
│   ├── tiered-storage.js     # 3-tier memory storage (short/medium/long)
│   └── token-counter.js      # Token estimation and budget management
├── watchers/
│   └── index.js              # File watchers for bidirectional GSD sync
├── websocket/
│   ├── server.js             # Claude WebSocket server (v4)
│   ├── client.js             # WebSocket client SDK
│   └── stream-manager.js     # Streaming lifecycle management
├── alerts/
│   ├── channels.js           # Multi-channel notification system
│   ├── engine.js             # Rule-based alert engine
│   ├── manager.js            # Alert lifecycle management
│   └── rules.js              # Alert rule definitions and evaluation
├── analytics/
│   ├── index.js              # Re-exports
│   ├── budget.js             # Budget management for Claude API
│   ├── cost-tracker.js       # Cost tracking and usage stats
│   └── reports.js            # Report generation (daily/weekly/monthly)
├── security/
│   ├── audit.js              # Basic security scanning
│   ├── audit-comprehensive.js# Comprehensive security audit
│   ├── sanitizer.js          # Input sanitization
│   └── validator.js          # Input validation framework
├── validation/
│   ├── schemas.js            # Zod schemas for validation
│   └── safe-id.js            # Safe ID validation utilities
├── tools/
│   ├── claude-api.js         # Claude API tools (15 tools)
│   ├── claude-api-core.js    # Core Claude API tools (v4)
│   ├── gsd-workflow.js       # GSD workflow tools (15 tools)
│   ├── intelligence.js       # Intelligence layer tools (20+ tools)
│   ├── memory-smart.js       # Smart memory tools (10 tools)
│   ├── observability.js      # Observability tools (15+ tools)
│   └── profile.js            # Tool profile resolver
└── dashboard/
    ├── server.js             # Dashboard HTTP server
    ├── websocket.js          # Dashboard WebSocket manager
    └── public/
        ├── index.html        # Dashboard UI
        ├── app.js            # Dashboard JS app
        └── styles.css        # Dashboard styles
```

## Подробный анализ

### src/middleware/

#### index.js
- **Назначение**: Основной middleware слой - circuit breaker, retry logic, rate limiting
- **Ключевые переменные**:
  - `const circuitBreakers = new Map()` - состояние circuit breaker для каждого инструмента
  - `const rateLimits = new Map()` - состояние rate limiting
  - `const CIRCUIT_THRESHOLD = 5` - порог срабатывания circuit breaker
  - `const CIRCUIT_TIMEOUT = 30000` - таймаут в 30 секунд
  - `const RATE_LIMIT_MAX = 100` - макс запросов в минуту
- **Функции**:
  - `withCircuitBreaker(toolName, fn)` - обертка с circuit breaker
  - `withRetry(fn, maxRetries)` - retry с exponential backoff
  - `withRateLimit(toolName, fn)` - rate limiting
  - `getMiddlewareStats()` - получение статистики
- **Используется в**: Все MCP tools через tool router

#### auth.js (642 строки)
- **Назначение**: JWT-based аутентификация для AMS MCP tools
- **Ключевые переменные**:
  - `const AUTH_MODES` - TRUST, TOKEN, HYBRID, REQUIRED
  - `const TOKEN_EXTRACTORS` - способы извлечения токена
  - `const authContextStorage = new AsyncLocalStorage()` - контекст аутентификации
  - `const tokenRevocations = new Map()` - отозванные токены
- **Функции**:
  - `validateToken(token)` - валидация JWT
  - `generateToken(options)` - генерация нового токена
  - `extractAndValidateToken(args)` - извлечение из аргументов
  - `hasPermission(permission)` - проверка разрешений
  - `requirePermission(permission)` - требование разрешения
- **Используется в**: Все защищенные tools, unified controller

#### acl.js (406 строк)
- **Назначение**: Role-based access control для проектов
- **Ключевые переменные**:
  - `const ROLE_HIERARCHY = { owner: 4, admin: 3, member: 2, viewer: 1 }`
  - `const TOOL_PERMISSIONS` - маппинг tool -> минимальная роль
  - `const projectOverrideStorage = new AsyncLocalStorage()`
- **Функции**:
  - `enforceACL(toolName, args)` - главный ACL gate
  - `resolveProjectContext(args)` - разрешение проекта
  - `checkAccess(projectId, userId, requiredRole)` - проверка доступа
  - `setProjectOverride(projectId)` - установка текущего проекта
- **Используется в**: routeTool перед выполнением каждого tool

#### audit.js (409 строк)
- **Назначение**: Action instrumentation с AsyncLocalStorage
- **Ключевые переменные**:
  - `const sessionStorage = new AsyncLocalStorage()` - изолированный контекст
  - `const sessionByScope = new Map()` - scope-based сессии
  - `const SESSION_SCOPE_TTL_MS = 30 * 60 * 1000` - TTL 30 минут
- **Функции**:
  - `withAudit(toolName, args, fn)` - обертка аудита
  - `startSession(contextId)` - старт сессии
  - `generateSessionId()` - генерация ID
  - `hashResult(result)` - хеширование результата
- **Используется в**: Все tools через middleware stack

#### auth-permissions.js (722 строки)
- **Назначение**: Маппинг tools на permission strings
- **Ключевые переменные**:
  - `const TOOL_PERMISSIONS` - полный маппинг всех tools
  - `const rolePermissions` - permissions по ролям
- **Функции**:
  - `getToolPermission(toolName)` - получить permission для tool
  - `toolRequiresAuth(toolName)` - требуется ли auth
  - `getRolePermissions(role)` - получить permissions роли
- **Используется в**: auth.js для permission checking

#### metrics.js (254 строки)
- **Назначение**: Performance monitoring для tools
- **Ключевые переменные**:
  - `const metricsStore = new Map()` - in-memory хранилище
  - `const MAX_STORE_SIZE = 1000`
  - `const SLOW_QUERY_THRESHOLD = 1000` // ms
- **Функции**:
  - `withMetrics(toolName, args, fn)` - обертка с метриками
  - `getMetrics(toolName)` - получить метрики
  - `getSlowOperations(threshold)` - медленные операции
- **Используется в**: Все tools через middleware

#### orchestration.js (532 строки)
- **Назначение**: Deterministic pre/post rules для tools
- **Ключевые функции**:
  - `applyOrchestrationBefore(toolName, args)` - pre-execution hooks
  - `applyOrchestrationAfter(toolName, args, result)` - post-execution hooks
- **Поддерживаемые правила**:
  - roadmap_export_to_gsd: валидация roadmap + core dirs
  - roadmap_repair/repair_all: pre-validation
  - watcher_start/stop: project scaffold + GSD binding
  - analysis_rag_index: auto GC
  - memory_pack: auto GC
  - roadmap_register: cache invalidation + validation

#### runtime-pid-lock.js (92 строки)
- **Назначение**: Runtime PID lock для сервера
- **Ключевые переменные**:
  - `const PID_PATH` - путь к PID файлу
- **Функции**:
  - `acquireRuntimePidLock()` - захват блокировки
  - `releaseRuntimePidLock(handle)` - освобождение
- **Используется в**: server.js при старте

#### startup-lock.js (116 строк)
- **Назначение**: DB initialization lock
- **Ключевые переменные**:
  - `const LOCK_PATH` - путь к lock файлу
  - `AMS_DB_INIT_LOCK_TIMEOUT_MS` - таймаут
- **Функции**:
  - `acquireStartupLock()` - ожидание блокировки
  - `releaseStartupLock(handle)` - освобождение
- **Используется в**: db/index.js при инициализации

#### tool-lock.js (146 строк)
- **Назначение**: MCP tool execution serialization
- **Ключевые переменные**:
  - `const LOCK_PATH` - глобальный lock файл
  - `let localQueue = Promise.resolve()` - локальная очередь
- **Функции**:
  - `withSerializedToolExecution(toolName, fn)` - сериализация
- **Используется в**: SQLite mode для предотвращения concurrency issues

#### watcher-leader.js (101 строка)
- **Назначение**: File watcher leader election
- **Функции**:
  - `acquireWatcherLeaderLock()` - стать leader
  - `releaseWatcherLeaderLock(handle)` - освободить
- **Используется в**: watchers/index.js

---

### src/utils/

#### cache.js (213 строк)
- **Назначение**: LRU Cache с TTL поддержкой
- **Классы**:
  - `LRUCache` - основной кэш
    - `get(key)`, `set(key, value)`, `delete(key)`
    - `stats()` - hit rate, size
  - `cachedQuery(queryFn, options)` - обертка для запросов
- **Используется в**: analytics, claude, routing

#### git-checkpoint.js (438 строк)
- **Назначение**: Git-based checkpoint система
- **Режимы**: 'separate' (default), 'project', 'off'
- **Функции**:
  - `checkpointCreate(projectPath, sessionId, description)` - создать
  - `checkpointRollback(projectPath, hash)` - откат
  - `checkpointList(projectPath, limit)` - список
  - `checkpointStatus(projectPath)` - статус
- **Используется в**: autonomous, watchers

#### tiered-storage.js (651 строка)
- **Назначение**: 3-tier memory storage
- **Tiers**: short (1h), medium (7d), long (permanent)
- **Функции**:
  - `storeMemory({key, value, relevance})` - сохранить
  - `getMemory(key)` - получить
  - `searchByTags(tags)` - поиск по тегам
  - `promoteMemory(key, targetTier)` - продвинуть tier
  - `runTieredGc()` - garbage collection
- **Используется в**: memory tools, context manager

#### token-counter.js (494 строки)
- **Назначение**: Token estimation и budget management
- **Классы**:
  - `TokenBudget` - управление бюджетом токенов
    - `add(message)`, `optimize()`, `getStats()`
- **Функции**:
  - `estimateTokens(text)` - быстрая оценка
  - `countTokens(text)` - более точный подсчет
  - `countMessageTokens(messages)` - для ChatML
- **Используется в**: claude tools, context compression

---

### src/watchers/

#### index.js (509 строк)
- **Назначение**: File watchers для bidirectional GSD sync
- **Ключевые переменные**:
  - `const watchers = new Map()` - активные watchers
  - `const debounceTimers = new Map()` - дебаунс таймеры
  - `const DEBOUNCE_DELAY_MS = 300`
- **Функции**:
  - `watchProject(projectName)` - начать наблюдение
  - `unwatchProject(projectName)` - остановить
  - `syncTodosToDb(filePath, projectId)` - синхронизация
  - `initWatchers(projectNames)` - инициализация
  - `retryFailedWatchers()` - retry с exponential backoff
- **Используется в**: server.js, unified tools

---

### src/websocket/

#### server.js (755 строк)
- **Назначение**: Claude WebSocket server v4
- **Функции**:
  - `createWebSocketServer()` - создание сервера
  - `handleConnection(ws, req)` - обработка подключения
  - `handleStreamRequest(client, message)` - streaming
  - `broadcast(topic, data)` - broadcast сообщений
- **Поддерживает**: WebSocket + SSE endpoints
- **Используется в**: server.js при старте

#### client.js (559 строк)
- **Назначение**: WebSocket client SDK
- **Классы**:
  - `ClaudeWebSocketClient` - основной клиент
  - `ClaudeSSEClient` - SSE клиент
  - `StreamController` - управление стримом
- **Функции**: connect, disconnect, chat, stream, subscribe

#### stream-manager.js (501 строка)
- **Назначение**: Streaming lifecycle management
- **Классы**:
  - `Stream` - представление стрима
    - `start()`, `addChunk()`, `complete()`, `cancel()`
- **Функции**:
  - `createStream(config)` - создание
  - `subscribeToStream(streamId, clientId, callback)`
  - `cleanupOldStreams()` - очистка старых
- **States**: PENDING, ACTIVE, PAUSED, COMPLETED, ERROR, CANCELLED

---

### src/alerts/

#### channels.js (719 строк)
- **Назначение**: Multi-channel notification system
- **Каналы**: Log, Webhook, Email, Slack, SMS, File
- **Классы**:
  - `NotificationChannel` - базовый класс
  - `LogChannel`, `WebhookChannel`, `EmailChannel`
  - `SlackChannel`, `SMSChannel`, `FileChannel`
  - `ChannelRegistry` - реестр каналов
- **Функции**:
  - `send(alert)` - отправка уведомления
  - `test()` - тестирование канала
  - `sendToChannels(alert, channels)` - broadcast

#### engine.js (823 строки)
- **Назначение**: Rule-based alert engine
- **Константы**:
  - `ALERT_SEVERITY`: INFO, WARNING, ERROR, CRITICAL
  - `ALERT_STATUS`: PENDING, FIRING, RESOLVED, ACKNOWLEDGED
- **Функции**:
  - `initializeAlertEngine(config)` - инициализация
  - `addRule(config)` - добавить правило
  - `checkRules()` - проверка всех правил
  - `fireAlert(rule, value)` - срабатывание
  - `acknowledgeAlert(alertId)` - подтверждение
- **Персистентность**: SQLite таблицы mcp_alerts, mcp_alert_history

#### manager.js (801 строка)
- **Назначение**: Alert lifecycle и escalation
- **Классы**:
  - `AlertManager`
- **Функции**:
  - `createAlert(rule, metric)` - создание
  - `acknowledgeAlert(alertId, user)` - подтверждение
  - `resolveAlert(alertId, resolution)` - разрешение
  - `silenceAlert(ruleId, duration)` - заглушение
  - `escalateAlert(alertId, level)` - эскалация
- **Возможности**: grouping, escalation timers, notification

#### rules.js (897 строк)
- **Назначение**: Alert rule definitions
- **Типы правил**:
  - `THRESHOLD` - пороговые значения
  - `RATE` - скорость изменения
  - `ANOMALY` - аномалии (zscore, iqr, mad)
  - `COMPOSITE` - комбинированные
- **Классы**:
  - `BaseRule`, `ThresholdRule`, `RateRule`
  - `AnomalyRule`, `CompositeRule`
  - `MetricHistory`, `AlertRuleEngine`
- **Функции**:
  - `evaluate(metrics, history)` - оценка
  - `shouldFire(evalResult)` - проверка срабатывания
  - `addRule(ruleConfig)` - добавление

---

### src/analytics/

#### index.js (55 строк)
- **Назначение**: Re-exports для analytics модулей
- **Экспорты**: cost-tracker, budget, reports

#### budget.js (558 строк)
- **Назначение**: Budget management для Claude API
- **Функции**:
  - `setBudget({scope, dailyLimit, monthlyLimit})` - установка
  - `getBudget(scope, scopeId)` - получение
  - `checkBudgetStatus(scope, scopeId)` - проверка статуса
  - `checkQuota({estimatedCost})` - проверка квоты
  - `getSpendingProjections(days)` - прогнозирование
- **Scopes**: global, project, session, user

#### cost-tracker.js (827 строк)
- **Назначение**: Real-time cost calculation
- **Кэши**: sessionCostCache, projectCostCache, dailyCostCache
- **Функции**:
  - `recordUsage({sessionId, model, tokens})` - запись
  - `getSessionCost(sessionId)` - стоимость сессии
  - `getProjectCost(projectId)` - стоимость проекта
  - `getCostByTimeRange({from, to, groupBy})` - по периоду
  - `getModelUsage(period)` - использование моделей
  - `predictUsage(days)` - прогнозирование

#### reports.js (723 строки)
- **Назначение**: Report generation
- **Функции**:
  - `generateDailyReport(date)` - дневной отчет
  - `generateWeeklyReport(weekStart)` - недельный
  - `generateMonthlyReport(year, month)` - месячный
  - `generateModelCostReport(period)` - по моделям
  - `generateProjectCostReport(period)` - по проектам
  - `generateOptimizationReport(period)` - оптимизации
  - `getCostDashboard()` - дашборд

---

### src/security/

#### audit.js (358 строк)
- **Назначение**: Basic security scanning
- **Паттерны**: SQL injection, secrets, path traversal, command injection
- **Функции**:
  - `detectSqlInjection(input)` - обнаружение SQLi
  - `scanForSecrets(content)` - поиск секретов
  - `detectPathTraversal(path)` - обнаружение traversal
  - `detectCommandInjection(input)` - обнаружение command injection
  - `auditInput(data)` - комплексный аудит

#### audit-comprehensive.js (1000+ строк)
- **Назначение**: Comprehensive security audit (GSD Agent-23)
- **Дополнительные паттерны**:
  - NoSQL injection, XPath injection, LDAP injection
  - XXE, SSTI, XSS, CSRF
  - Insecure deserialization, SSRF
- **Функции**:
  - `detectNoSqlInjection`, `detectXPathInjection`
  - `detectXxe`, `detectSsti`, `detectXss`
  - `scanDirectory(dirPath)` - сканирование директории
  - `checkOwaspCompliance(findings)` - OWASP compliance

#### sanitizer.js (371 строка)
- **Назначение**: Input sanitization
- **Функции**:
  - `escapeHtml(input)` - экранирование HTML
  - `sanitizeForSql(input)` - для SQL
  - `sanitizePath(path, options)` - пути
  - `sanitizeShellArg(arg)` - shell аргументы
  - `sanitizeToolInput(input)` - tool input
  - `createSafeFilename(filename)` - безопасное имя файла
  - `deepSanitize(data, options)` - глубокая очистка

#### validator.js (364 строки)
- **Назначение**: Input validation framework
- **Классы**:
  - `ValidationError`, `SecurityError`
  - `ValidationRateLimiter`
- **Функции**:
  - `sanitizedString(options)` - Zod schema
  - `validateId(id)` - валидация ID
  - `validateFilePath(path)` - валидация пути
  - `validateJson(content)` - валидация JSON
  - `withSecurity(baseSchema)` - усиление безопасностью
  - `validateToolInput(toolName, args, schema)` - tool input

---

### src/validation/

#### schemas.js (292 строки)
- **Назначение**: Zod schemas для всего приложения
- **Helper**:
  - `validate(schema, value)` - валидация с McpError
  - `validateWithDefaults(schema, value)` - с defaults
- **Schemas**:
  - `ProjectNameSchema` - имена проектов
  - `RoadmapIdSchema` - roadmap IDs
  - `CreateTaskSchema`, `UpdateTaskSchema` - задачи
  - `AutonomousRunSchema`, `ApplyChangesSchema` - autonomous
  - `MemoryPackSchema`, `MemoryGetSchema` - memory
  - `UnifiedOrchestrationSchema`, `UnifiedArchitectureSchema`

#### safe-id.js (29 строк)
- **Назначение**: Safe ID validation utility
- **Паттерны**:
  - `DEFAULT_SAFE_ID_PATTERN = /^[a-zA-Z0-9._-]+$/`
  - `ROADMAP_SAFE_ID_PATTERN = /^[a-zA-Z0-9-_]+$/`
- **Функции**:
  - `assertSafeId(id, label, pattern)` - проверка с выбросом ошибки

---

### src/tools/

#### claude-api.js (1000+ строк)
- **Назначение**: Claude API MCP tools (15 tools)
- **Tools**:
  - `claude_chat` - conversational messages
  - `claude_complete` - prompt completion
  - `claude_stream` - SSE streaming
  - `claude_batch` - batch processing
  - `claude_embed` - embeddings
  - `claude_vision` - image analysis
  - `claude_tool_use` - function calling
  - `claude_messages` - thread management
  - `claude_projects` - project management
  - `claude_tokens_count` - token counting
  - `claude_stream_websocket/sse` - WebSocket streaming
  - `claude_prompt_cache_create/status/metrics` - prompt caching
  - `claude_request_deduplicate` - deduplication

#### claude-api-core.js (908 строк)
- **Назначение**: Core Claude API tools (v4)
- **Tools**:
  - `claude_health_check` - health check
  - `claude_model_capabilities` - model info
  - `claude_budget_status` - budget status
  - `claude_configure` - dynamic config
  - `claude_circuit_status/reset` - circuit breaker
  - `claude_health_check_detailed/metrics` - detailed health
  - `claude_resilience_configure` - resilience config
  - `claude_fallback_test` - test fallbacks
  - `claude_bulkhead_status` - bulkhead status

#### gsd-workflow.js (1000+ строк)
- **Назначение**: GSD workflow tools (15 tools)
- **Workflow Management**:
  - `gsd_workflow_create/run/status/cancel/list`
- **Agent Management**:
  - `gsd_agent_spawn`, `gsd_agent_pool_create/scale`
  - `gsd_agent_status/terminate`
- **Phase Execution**:
  - `gsd_phase_plan/execute/status`
  - `gsd_parallel_map`
- **Verification**:
  - `gsd_verify_comprehensive`
  - `gsd_report_generate`

#### intelligence.js (1000+ строк)
- **Назначение**: Intelligence layer tools (20+ tools)
- **Routing**:
  - `intelligent_route`, `intelligent_classify`
  - `intelligent_match`, `intelligent_rank`
- **Learning**:
  - `intelligent_learn` - pattern learning
  - `intelligent_optimize` - auto-optimization
- **Prediction**:
  - `intelligent_predict` - time-series forecasting
  - `intelligent_cache_warm` - cache warming
  - `intelligent_scale` - auto-scaling
- **Resilience**:
  - `intelligent_retry`, `intelligent_fallback`
- **Monitoring**:
  - `intelligent_anomaly`, `intelligent_detect_anomaly`
  - `intelligent_recommend`, `intelligent_analyze`

#### memory-smart.js (791 строка)
- **Назначение**: Smart memory tools (10 tools)
- **Storage**:
  - `memory_smart_store` - AI-scored storage
- **Search**:
  - `memory_semantic_search` - vector search
- **Management**:
  - `memory_context_compress` - compression
  - `memory_cross_session` - session bridging
  - `memory_forget` - selective forgetting
  - `memory_prioritize` - re-ranking
  - `memory_summarize` - auto-summarize
  - `memory_embed` - embeddings
  - `memory_tier_migrate` - tier migration
  - `memory_stats` - statistics

#### observability.js (1000+ строк)
- **Назначение**: Observability tools (15+ tools)
- **Usage Tracking**:
  - `observe_claude_usage`, `observe_claude_cost`
  - `observe_token_tracking`
- **Performance**:
  - `observe_latency_dashboard`, `observe_throughput_metrics`
  - `observe_error_rates`
- **Audit & Logs**:
  - `observe_audit_realtime`, `observe_log_analyze`
  - `observe_trace_flow`
- **Health & Alerts**:
  - `observe_health_check`, `observe_system_metrics`
  - `observe_alert_create/list/acknowledge`
  - `alert_rule_create/update/delete/list`
  - `alert_resolve/silence/list`

#### profile.js (205 строк)
- **Назначение**: Tool profile resolver
- **Профили**: FULL, DEFAULT, CORE, CUSTOM
- **Функции**:
  - `resolveToolProfile(allTools, profileName, customList)`
- **Списки**:
  - `DEFAULT_HIDDEN_TOOLS` - скрытые по умолчанию
  - `CORE_ALLOWLIST` - core tools

---

### src/dashboard/

#### server.js (609 строк)
- **Назначение**: Observability Dashboard HTTP server
- **API Endpoints**:
  - `/api/metrics` - metrics collection
  - `/api/stats` - real-time stats
  - `/api/audit` - audit data
  - `/api/health` - health check
  - `/api/alerts` - alerts management
  - `/api/timeline` - timeline data
- **Static**: index.html, app.js, styles.css
- **WebSocket**: Real-time updates
- **Функции**:
  - `startDashboard(port)` - старт
  - `stopDashboard()` - остановка
  - `getDashboardStatus()` - статус

#### websocket.js (474 строки)
- **Назначение**: Dashboard WebSocket manager
- **Message Types**: SUBSCRIBE, UNSUBSCRIBE, PING, PONG, UPDATE, ALERT, etc.
- **Topics**: METRICS, ALERTS, AUDIT, HEALTH, ALL
- **Классы**:
  - `DashboardClient` - обертка клиента
- **Функции**:
  - `handleConnection(ws, req)` - подключение
  - `broadcast(topic, data)` - broadcast
  - `broadcastAlert(alert)` - alert broadcast
  - `initializeWebSocketManager()` - инициализация

#### public/index.html (272 строки)
- **Назначение**: Dashboard UI
- **Views**: Overview, Metrics, Audit Log, Alerts, Health
- **Features**:
  - Metrics cards (Total Actions, Sessions, Latency, Error Rate)
  - Activity timeline chart
  - Top tools table
  - Audit log with filtering
  - Alert management
  - Health monitoring

---

## Таблица Middleware Stack

| Порядок | Middleware | Назначение | Применяется к |
|---------|-----------|------------|---------------|
| 1 | runtime-pid-lock | Prevent duplicate server instances | Server startup |
| 2 | startup-lock | Serialize DB initialization | DB init |
| 3 | tool-lock | Serialize SQLite tool calls | All tools (SQLite mode) |
| 4 | watcher-leader | Elect file watcher leader | Watcher init |
| 5 | auth | JWT token validation | Protected tools |
| 6 | acl | Role-based access control | Project-scoped tools |
| 7 | audit | Action logging with AsyncLocalStorage | All tools |
| 8 | metrics | Performance metrics collection | All tools |
| 9 | orchestration | Pre/post execution rules | Specific tools |

## Таблица Утилит

| Утилита | Назначение | Зависимости |
|---------|-----------|-------------|
| cache.js | LRU Cache с TTL | None |
| file-lock.js | File-based locking | composition/file-lock |
| git-checkpoint.js | Git checkpoints | config.js, fs |
| tiered-storage.js | 3-tier memory | db/index.js |
| token-counter.js | Token counting | None |

## Таблица MCP Tools

| Tool Category | Tool File | Tool Count | Назначение |
|--------------|-----------|------------|------------|
| Claude API | claude-api.js | 15 | Claude API integration |
| Claude Core | claude-api-core.js | 12 | Core Claude management |
| GSD Workflow | gsd-workflow.js | 15 | Multi-agent orchestration |
| Intelligence | intelligence.js | 20+ | AI routing, learning, optimization |
| Memory | memory-smart.js | 10 | Smart memory management |
| Observability | observability.js | 15+ | Monitoring, alerts, metrics |

## Связи с другими модулями

### Infrastructure использует Core:
- **config.js** - все middleware используют для конфигурации
- **db/index.js** - database connection для audit, metrics, alerts
- **domains/gsd** - orchestration middleware для GSD binding
- **domains/roadmaps** - orchestration для roadmap validation

### Infrastructure используется в:
- **server.js** - middleware stack initialization
- **controllers/** - через middleware для всех tool calls
- **domains/** - security validators, git checkpoints
- **services/** - cache, tiered-storage

### Ключевые архитектурные паттерны:
1. **AsyncLocalStorage** - thread-safe context propagation (audit, auth, acl)
2. **Circuit Breaker** - resilience для внешних API
3. **3-Tier Storage** - memory management с relevance scoring
4. **Event-Driven** - WebSocket broadcasts, alert notifications
5. **Pipeline** - middleware stack execution
