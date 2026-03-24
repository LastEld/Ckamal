# Code Analysis: GSD & Intelligence

## Дерево папок

```
src/
├── gsd/                          # GSD (Get Stuff Done) Workflow System
│   ├── engine.js                 # Workflow state machine, execution engine
│   ├── agent.js                  # Individual agent lifecycle
│   ├── agent-pool.js             # Legacy agent pool management
│   ├── agent-pool-manager.js     # New AgentPool class with EventEmitter
│   ├── agent-pool-index.js       # Public exports index
│   ├── agent-types.js            # Agent type registry (planner, executor, etc.)
│   ├── aggregator.js             # Result aggregation strategies (20+ strategies)
│   ├── auto-scaler.js            # Auto-scaling policies for agent pools
│   ├── checkpoint.js             # State snapshots, rollback capability
│   ├── concurrency.js            # Semaphore, ReadWriteLock, Barrier
│   ├── index.js                  # Parallel execution exports
│   ├── load-balancer.js          # 10 load balancing strategies
│   ├── lock.js                   # Distributed locking system
│   ├── parallel-executor.js      # Map-Reduce, WorkerPool
│   ├── planner.js                # Auto-phase planning based on goals
│   ├── task-queue.js             # Priority queue with bulkhead pattern
│   └── verifier.js               # Goal-backward verification engine
│
├── intelligence/                 # AI-powered routing & optimization
│   ├── index.js                  # Main exports facade
│   ├── router.js                 # Legacy intelligent routing
│   ├── router-engine.js          # IntelligentRouter class with ML
│   ├── router-cache.js           # LRU cache with TTL for routes
│   ├── scheduler.js              # OptimizationScheduler, BackgroundOptimizer
│   ├── classifier.js             # RequestClassifier with intent detection
│   ├── matcher.js                # SemanticMatcher with embeddings
│   ├── scorer.js                 # Multi-criteria scoring engine
│   ├── learner.js                # Pattern learning from feedback
│   ├── patterns.js               # PatternRecognizer & PatternStore
│   ├── predictor.js              # Time-series forecasting
│   ├── recommender.js            # RecommendationEngine
│   ├── anomaly.js                # Anomaly detection (Z-score, IQR, MAD)
│   ├── measurement.js            # ImpactMeasurement for optimizations
│   ├── optimizer.js              # High-level optimization coordinator
│   └── models/
│       ├── routing-model.js      # classifyRequest, selectTool, A/B tests
│       └── usage-model.js        # Usage statistics & token prediction
│   └── optimizers/
│       ├── index.js              # Optimizers exports
│       ├── cache.js              # CacheOptimizer with TTL tuning
│       ├── query.js              # QueryOptimizer with index advisor
│       ├── config.js             # ConfigTuner with A/B experiments
│       └── scaler.js             # ResourceScaler with auto-scaling
│
├── analysis/                     # Content analysis & RAG
│   ├── index.js                  # TF-IDF search, recommendations
│   ├── rag.js                    # RAG facade (search, index, stats)
│   ├── auto-fix.js               # Auto-fix generators for code issues
│   ├── codebase-scanner.js       # Regex-based code scanner
│   ├── lru-cache.js              # LRU cache implementation
│   └── rag-*.js                  # RAG sub-modules (constants, metrics, etc.)
│
├── composition/                  # Cross-domain composition layer
│   ├── db-gateway.js             # DB access gateway (re-exports)
│   ├── file-lock.js              # File locking system with timeout
│   ├── git-checkpoint-gateway.js # Git checkpoint gateway
│   ├── roadmap-gateway.js        # Roadmap domain gateway
│   └── todos-template.js         # Todo templates
│
├── runtime/                      # Multi-client runtime system
│   ├── index.js                  # Runtime exports facade
│   ├── coordinator.js            # RuntimeCoordinator singleton
│   ├── daemon.js                 # AmsDaemon socket server
│   ├── client-bridge.js          # Client connection to daemon
│   ├── contract.js               # Runtime contract validation
│   ├── coexistence-manager.js    # Multi-client role management
│   └── conflict-resolver.js      # Contention resolution with backoff
│
├── performance/                  # Performance optimization
│   ├── index.js                  # Performance module exports
│   ├── monitor.js                # PerformanceMetrics, LatencyHistogram
│   ├── optimizer.js              # QueryOptimizer, IndexAdvisor
│   ├── pool.js                   # ConnectionPool, QueryCache
│   └── warmup.js                 # CacheWarmup strategies
│
└── metrics/                      # Prometheus-compatible metrics
    └── collector.js              # MetricsCollector with cardinality protection
```

---

## Подробный анализ каждого файла

### src/gsd/

#### engine.js (794 lines)
- **Назначение**: Ядро GSD workflow engine - управление состоянием, планирование, параллельное выполнение
- **Ключевые классы/функции**:
  - `WorkflowState`, `PhaseState`, `AgentState` - константы состояний
  - `createWorkflow()` - создание workflow с фазами
  - `executeWorkflow()` - запуск workflow с обработкой зависимостей
  - `processWorkflowPhases()` - параллельная обработка фаз
  - `parallelMap()` - Map-Reduce паттерн для агентов
  - `reduceResults()` - 8 стратегий редукции (merge, concat, sum, etc.)
- **Ключевые переменные**:
  - `workflowRegistry` - Map с workflow в памяти
  - `phaseRegistry` - Map с фазами
  - `DEFAULT_MAX_PARALLEL = 4` - лимит параллелизма
  - `DEFAULT_TIMEOUT_MS = 5min` - таймаут по умолчанию
- **Импорты**: `@modelcontextprotocol/sdk`, `../domains/gsd/config.js`
- **Связи**: agent-pool.js (спавн агентов), checkpoint.js (сохранение состояния)
- **Заглушки**: `simulatePhaseExecution()` - случайная задержка 100-500ms, 5% failure rate

#### agent.js (487 lines)
- **Назначение**: Жизненный цикл отдельного агента, выполнение задач, health monitoring
- **Ключевые классы**:
  - `class Agent extends EventEmitter` - основной класс агента
  - Состояния: PENDING → INITIALIZING → READY → BUSY → FAILED/TERMINATED
- **Ключевые методы**:
  - `initialize()` - инициализация агента
  - `executeTask()` - выполнение задачи с таймаутом
  - `ping()` - health check
  - `terminate()` / `restart()` - управление жизненным циклом
- **Ключевые переменные**:
  - `metrics` - tasksCompleted, tasksFailed, averageLatency
  - `health` - status, consecutiveFailures, lastError
  - `config.timeout = 300000` - 5 минут таймаут
- **Заглушки**: `_simulateWork(100ms)`, `_executeTaskLogic()` - случайные задержки

#### agent-pool.js (692 lines) - LEGACY
- **Назначение**: Legacy система управления пулами агентов
- **Ключевые функции**:
  - `createPool()` - создание пула
  - `spawnAgent()` - спавн агента
  - `acquireAgentFromPool()` - получение агента из пула
  - `scalePool()` / `autoScalePool()` - масштабирование
  - `healthCheckAgent()` - проверка здоровья
- **Ключевые переменные**:
  - `agentRegistry` - Map агентов
  - `poolRegistry` - Map пулов
  - `DRYPROBE_POOL_ID` - ID эфемерного пула
  - `DEFAULT_HEALTH_CHECK_INTERVAL = 30s`
- **Связи**: agent-types.js, ../domains/gsd/config.js

#### agent-pool-manager.js (568 lines) - NEW
- **Назначение**: Новый менеджер пулов на EventEmitter
- **Ключевые классы**:
  - `class AgentPool extends EventEmitter` - управление пулом
- **Ключевые методы**:
  - `initialize()` - запуск с minSize агентов
  - `spawnAgent()` / `terminateAgent()` - управление агентами
  - `scale()` - масштабирование до targetSize
  - `assignTask()` - назначение задачи с очередью
  - `checkHealth()` - проверка всех агентов
  - `_autoScale()` - автоматическое масштабирование
- **Ключевые переменные**:
  - `agents: Map()` - агенты в пуле
  - `taskQueue: []` - очередь задач
  - `config.autoScale`, `scaleUpThreshold = 0.8`

#### agent-types.js (177 lines)
- **Назначение**: Реестр типов агентов с capabilities
- **Ключевые константы**:
  - `AGENT_TYPES` - planner, executor, verifier, debugger, researcher
  - `AgentState` - PENDING, INITIALIZING, READY, BUSY, FAILED, TERMINATED
  - `MEMORY_LEVELS` - low(5 tasks), medium(10), high(20)
- **Ключевые функции**:
  - `getAgentType()`, `hasAgentType()`, `getAllAgentTypes()`
  - `validateAgentTypeConfig()` - валидация конфигурации
  - `findAgentTypesByCapability()` - поиск по capability
  - `compareAgentTypes()` - сравнение по overlap capabilities

#### aggregator.js (506 lines)
- **Назначение**: Стратегии агрегации результатов параллельных задач
- **Ключевые стратегии** (20+):
  - `concat`, `sum`, `avg`, `median`, `stdDev`, `max`, `min`
  - `merge`, `deepMerge` - объединение объектов
  - `vote`, `first`, `last`, `count`
  - `groupBy`, `histogram`, `reduce`, `stats`, `collect`, `join`
- **Ключевые классы**:
  - `class ResultAggregator` - основной агрегатор
  - `class StreamAggregator` - потоковая агрегация с window

#### auto-scaler.js (663 lines)
- **Назначение**: Автоматическое масштабирование пулов
- **Ключевые константы**:
  - `ScalingPolicyType` - THRESHOLD, SCHEDULED, METRIC_BASED, PREDICTIVE
- **Ключевые классы**:
  - `class AutoScaler extends EventEmitter`
- **Ключевые методы**:
  - `scaleUp()` / `scaleDown()` - масштабирование
  - `startMonitoring()` - запуск мониторинга
  - `_evaluateScalingPolicies()` - оценка политик
  - `_predictLoad()` - линейное предсказание нагрузки
- **Ключевые переменные**:
  - `scalingPolicies: []` - пользовательские политики
  - `metricsHistory: []` - история метрик
  - `config.cooldownPeriod = 60s`

#### checkpoint.js (656 lines)
- **Назначение**: Система checkpoint-ов для rollback
- **Ключевые константы**:
  - `CheckpointState` - ACTIVE, COMPACTING, ROLLED_BACK, EXPIRED
- **Ключевые функции**:
  - `createCheckpoint()` - создание с инкрементальным diff
  - `getCheckpoint()` - восстановление с реконструкцией
  - `rollbackToCheckpoint()` - откат с созданием pre-rollback checkpoint
  - `compactCheckpoints()` - сжатие цепочки инкрементальных
  - `compareCheckpoints()` - сравнение состояний
- **Ключевые переменные**:
  - `checkpointRegistry: Map()`
  - `DEFAULT_RETENTION_COUNT = 50`
  - `DEFAULT_RETENTION_DAYS = 7`
- **Особенности**: Сжатие RLE для частых строк

#### concurrency.js (511 lines)
- **Назначение**: Примитивы синхронизации
- **Ключевые классы**:
  - `class Semaphore` - семафор с acquire/release
  - `class ConcurrencyController` - контроллер с метриками
  - `class Barrier` - барьер синхронизации
  - `class ReadWriteLock` - read/write блокировки
  - `class Latch` - одноразовый счётчик
- **Ключевые методы**:
  - `throttle()`, `debounce()`, `rateLimit()` - утилиты

#### load-balancer.js (412 lines)
- **Назначение**: 10 стратегий балансировки нагрузки
- **Ключевые стратегии**:
  - `roundRobin` - по очереди
  - `leastConnections` - минимум активных задач
  - `leastLatency` - минимальная латентность
  - `weighted` - взвешенный случайный
  - `capacity` - по capacity score
  - `capability` - по matching capabilities
  - `priority` - по приоритету
  - `random`, `firstAvailable`
- **Ключевые классы**:
  - `class LoadBalancer`

#### lock.js (576 lines)
- **Назначение**: Распределённые блокировки
- **Ключевые классы**:
  - `class LockStore` - in-memory хранилище
  - `class DistributedLock` - основной менеджер блокировок
  - `class AutoRenewingLock` - с авто-продлением
  - `class LockRegistry` - реестр именованных блокировок
- **Ключевые методы**:
  - `acquire()` - с retry и exponential backoff
  - `withLock()` - выполнение с блокировкой
  - `waitForLock()` - ожидание освобождения

#### parallel-executor.js (760 lines)
- **Назначение**: Параллельное выполнение Map-Reduce
- **Ключевые классы**:
  - `class ParallelExecutor` - Map-Reduce с concurrency limit
  - `class WorkerPool` - пул воркеров с auto-scale
- **Ключевые методы**:
  - `map()` - с сохранением порядка
  - `mapUnordered()` - без порядка (быстрее)
  - `race()` - гонка с abort controller
  - `pipeline()` - потоковая обработка с backpressure

#### planner.js (590 lines)
- **Назначение**: Автоматическое планирование фаз
- **Ключевые константы**:
  - `PLANNING_TEMPLATES` - SEQUENTIAL, PARALLEL, DAG, PIPELINE
- **Ключевые функции**:
  - `planPhases()` - создание плана из goal
  - `analyzeGoal()` - анализ типа цели
  - `generatePhases()` - генерация фаз (research, design, implement, test, etc.)
  - `optimizePlan()` - оптимизация на основе feedback
- **Анализ целей**: creation, repair, refactoring, verification, deployment, analysis

#### task-queue.js (668 lines)
- **Назначение**: Очередь задач с приоритетами
- **Ключевые константы**:
  - `Priority` - CRITICAL(0), HIGH(1), NORMAL(2), LOW(3), BACKGROUND(4)
  - `TaskState` - PENDING, RUNNING, COMPLETED, FAILED, RETRYING, CANCELLED
- **Ключевые классы**:
  - `class TaskQueue` - основная очередь
  - `class DelayedTaskQueue` - с отложенным выполнением
  - `class BulkheadQueue` - изолированные очереди
- **Ключевые методы**:
  - `add()` - добавление с приоритетом
  - `process()` - обработка с concurrency
  - `pause()` / `resume()` / `stop()` - управление
  - `_calculateRetryDelay()` - exponential backoff

#### verifier.js (808 lines)
- **Назначение**: Верификация результатов goal-backward
- **Ключевые константы**:
  - `VerificationStatus` - PENDING, IN_PROGRESS, PASSED, FAILED, WARNING, SKIPPED
  - `VerificationType` - GOAL_BACKWARD, ARTIFACT_CHECK, LINK_VALIDATION, etc.
- **Ключевые функции**:
  - `verifyArtifact()` - комплексная верификация
  - `verifyGoal()` - goal-backward reasoning
  - `performArtifactCheck()` - проверки (exists, type, schema, hash, size)
  - `validateLinks()` - валидация ссылок
  - `checkQualityGate()` - проверка сложности/размера
  - `generateVerificationReport()` - markdown/HTML отчёты

---

### src/intelligence/

#### router-engine.js (547 lines)
- **Назначение**: Интеллектуальный роутер с ML
- **Ключевые классы**:
  - `class IntelligentRouter` - основной роутер
- **Ключевые методы**:
  - `route()` - маршрутизация запроса
  - `extractFeatures()` - извлечение признаков
  - `scoreHandler()` - scoring по 6 критериям
  - `learnFromFeedback()` - обучение на feedback
  - `getAccuracy()` - точность из БД
- **Веса scoring**: capability(0.35), availability(0.15), performance(0.15), history(0.2), domain(0.1), urgency(0.05)

#### classifier.js (555 lines)
- **Назначение**: Классификация intent-ов
- **Ключевые классы**:
  - `class RequestClassifier`
- **Ключевые методы**:
  - `classifyIntent()` - 8 категорий (code_generation, debugging, etc.)
  - `estimateComplexity()` - very_complex/complex/medium/simple
  - `identifyDomain()` - frontend/backend/database/devops/security
  - `detectUrgency()` - critical/high/medium/normal/low
  - `extractFeatures()` - полное извлечение признаков
  - `extractEntities()` - файлы, функции, классы, URL

#### scheduler.js (520 lines)
- **Назначение**: Планировщик оптимизаций
- **Ключевые классы**:
  - `class OptimizationScheduler` - cron-подобное планирование
  - `class BackgroundOptimizer` - фоновая оптимизация
- **Ключевые методы**:
  - `schedule()` - планирование задачи
  - `startBackgroundOptimization()` - hourly/daily/weekly
  - `runOptimizationCycle()` - цикл оптимизации
- **Периоды**: hourly (cache), daily (queries), weekly (full tune)

#### anomaly.js (817 lines)
- **Назначение**: Обнаружение аномалий
- **Ключевые классы**:
  - `class AnomalyDetector` - 5 методов
  - `class StreamingAnomalyDetector` - потоковый
- **Методы detection**:
  - `zscore()` - Z-score method
  - `iqr()` - Interquartile Range
  - `mad()` - Median Absolute Deviation
  - `isolationForest()` - упрощённый Isolation Forest
  - `ensemble()` - majority voting
- **Функции**:
  - `detectAnomaly()` - основная функция
  - `analyzeRootCause()` - анализ корневых причин
  - `generateAlert()` - генерация алертов

#### predictor.js (691 lines)
- **Назначение**: Прогнозирование временных рядов
- **Ключевые классы**:
  - `class TimeSeriesPredictor` - 5 моделей
- **Модели**:
  - `movingAverage()` - скользящее среднее
  - `exponentialSmoothing()` - экспоненциальное сглаживание
  - `linearRegression()` - линейная регрессия
  - `seasonal()` - сезонная модель
  - `ensemble()` - взвешенная комбинация
- **Функции**:
  - `predictLoad()` - прогноз нагрузки
  - `predictCost()` - прогноз стоимости
  - `predictTokenUsage()` - прогноз токенов
  - `analyzeTrends()` - анализ трендов

#### models/routing-model.js (379 lines)
- **Назначение**: Модель маршрутизации
- **Ключевые паттерны**: task_create, task_list, roadmap_list, analysis_search, etc.
- **Ключевые функции**:
  - `classifyRequest()` - по keyword matching
  - `selectTool()` - выбор с учётом confidence threshold
  - `calculateConfidence()` - расчёт уверенности
  - `configureABTest()` - A/B тестирование
  - `learnFromFeedback()` - обучение

---

### src/analysis/

#### index.js (751 lines)
- **Назначение**: TF-IDF поиск и рекомендации
- **Ключевые функции**:
  - `extractRoadmapContent()` - извлечение текста из markdown
  - `extractNodesWithContent()` - извлечение нод roadmap
  - `buildTfIdfIndex()` - построение TF-IDF индекса
  - `searchNodes()` - поиск по запросу
  - `findSimilarNodes()` - поиск похожих нод
  - `getContentRecommendations()` - рекомендации на основе контента
  - `compareRoadmaps()` - сравнение roadmap
- **Кэши**: contentCache, nodesCache, tfidfCache (LRU с byte limit)

#### rag.js (113 lines)
- **Назначение**: RAG фасад
- **Ключевые функции**:
  - `ragStats()` - статистика RAG
  - `ragPerformance()` - метрики производительности
  - `ragGc()` - garbage collection

#### codebase-scanner.js (336 lines)
- **Назначение**: Сканер кода на regex
- **Детекторы**:
  - `detectConsoleLog()` - console.log → console.error
  - `detectUnsafePatterns()` - eval, new Function, execSync
  - `detectErrorHandling()` - empty catch, promise without catch
  - `detectComplexity()` - large files, deep nesting
  - `detectDeprecated()` - new Buffer, fs.exists
  - `detectPathSafety()` - path.join с untrusted input

#### auto-fix.js (91 lines)
- **Назначение**: Генератор авто-фиксов
- **Фиксы**: console_log_mcp, deprecated_buffer, empty_catch

---

### src/composition/

#### db-gateway.js (6 lines)
- **Назначение**: Gateway для доступа к БД
- **Реализация**: Re-export из ../db/index.js

#### file-lock.js (159 lines)
- **Назначение**: Файловые блокировки
- **Ключевые функции**:
  - `acquireLock()` - получение блокировки с timeout
  - `releaseLock()` - освобождение
  - `withLock()` - выполнение с блокировкой
  - `waitForLock()` - ожидание
  - `cleanupStaleLocks()` - очистка stale locks

#### roadmap-gateway.js (7 lines)
- **Назначение**: Gateway к roadmap домену
- **Экспорты**: getRoadmap, getRoadmapNodes, getRoadmapNode

---

### src/runtime/

#### coordinator.js (311 lines)
- **Назначение**: Координатор runtime (primary/client)
- **Ключевые классы**:
  - `class RuntimeCoordinator`
- **Ключевые методы**:
  - `initialize()` - определение роли (PID lock)
  - `initializePrimary()` - запуск daemon
  - `initializeClient()` - подключение к daemon
  - `shutdown()` - graceful shutdown

#### daemon.js (445 lines)
- **Назначение**: Daemon socket server
- **Ключевые классы**:
  - `class AmsDaemon extends EventEmitter`
- **Протокол**: JSON-RPC over Unix socket
- **Методы**: health, mcp.invoke, disconnect
- **Путь**: `$AMS_ROOT/data/locks/ams-daemon.sock`

#### index.js (51 lines)
- **Назначение**: Runtime exports facade
- **Экспорты**: contract, coexistence-manager, conflict-resolver

---

### src/performance/

#### monitor.js (619 lines)
- **Назначение**: Performance monitoring
- **Ключевые классы**:
  - `class LatencyHistogram` - p50/p95/p99 tracking
  - `class PerformanceMetrics` - сбор метрик
  - `class Profiler` - CPU profiling
- **Метрики**: query, cache, cpu, memory
- **Глобальный инстанс**: `globalMetrics`

#### optimizer.js (900 lines)
- **Назначение**: Query optimization
- **Ключевые классы**:
  - `class QueryPlanAnalyzer` - EXPLAIN QUERY PLAN
  - `class QueryOptimizer` - кэширование, batch
  - `class N1QueryDetector` - обнаружение N+1
  - `class IndexAdvisor` - рекомендации индексов
  - `class QueryRewriter` - переписывание запросов
  - `class MemoryManager` - управление памятью

#### index.js (73 lines)
- **Назначение**: Performance module exports
- **Экспорты**: optimizer, pool, warmup, monitor

---

### src/metrics/

#### collector.js (813 lines)
- **Назначение**: Prometheus-compatible metrics
- **Типы метрик**: COUNTER, GAUGE, HISTOGRAM, SUMMARY
- **Конфигурация**:
  - `maxCardinalityPerMetric = 1000`
  - `persistenceIntervalMs = 60s`
  - `maxPendingWrites = 5000`
- **Функции**:
  - `createCounter()`, `createGauge()`, `createHistogram()`
  - `incrementCounter()`, `setGauge()`, `observeHistogram()`
  - `exportPrometheus()` - форматирование для Prometheus
  - `collectMetrics()` - сбор метрик из системы
- **Защита**: cardinality protection, circuit breaker, deferred flush

---

## Таблица связей

| Файл | Импортирует из | Экспортирует | Зависимости |
|------|----------------|--------------|-------------|
| gsd/engine.js | @modelcontextprotocol/sdk, ../domains/gsd/config.js | WorkflowState, createWorkflow, executeWorkflow | agent-pool, checkpoint |
| gsd/agent.js | ./agent-types.js | Agent class | EventEmitter |
| gsd/agent-pool.js | @modelcontextprotocol/sdk, ../domains/gsd/config.js | AgentState, createPool, spawnAgent | fs, crypto |
| gsd/agent-pool-manager.js | ./agent.js, ./agent-types.js | AgentPool class | EventEmitter |
| gsd/scheduler.js | ./optimizers/*.js | OptimizationScheduler, BackgroundOptimizer | - |
| intelligence/router-engine.js | ./classifier.js, ./matcher.js, ./scorer.js, ./router-cache.js | IntelligentRouter | ../db/index.js |
| intelligence/classifier.js | ./models/routing-model.js | RequestClassifier | - |
| intelligence/matcher.js | ../services/embeddings.js | SemanticMatcher | - |
| intelligence/scheduler.js | ./optimizers/*.js | OptimizationScheduler | - |
| runtime/coordinator.js | ../middleware/runtime-pid-lock.js, ./daemon.js | initializeRuntime | - |
| runtime/daemon.js | ../config.js | AmsDaemon, startDaemon | net, fs/promises |
| analysis/index.js | ../composition/db-gateway.js, ../domains/roadmaps/index.js | searchNodes, getContentRecommendations | natural (NLP) |
| metrics/collector.js | ../middleware/metrics.js, ../db/timeseries.js | createCounter, exportPrometheus | - |

---

## Глобальные переменные и состояния

| Переменная | Модуль | Назначение |
|------------|--------|------------|
| `workflowRegistry: Map()` | gsd/engine.js | In-memory хранилище workflow |
| `phaseRegistry: Map()` | gsd/engine.js | In-memory хранилище фаз |
| `agentRegistry: Map()` | gsd/agent-pool.js | Реестр агентов |
| `poolRegistry: Map()` | gsd/agent-pool.js | Реестр пулов |
| `checkpointRegistry: Map()` | gsd/checkpoint.js | Реестр checkpoint-ов |
| `learnedPatterns: Map()` | intelligence/learner.js | Обученные паттерны |
| `userPreferences: Map()` | intelligence/learner.js | Предпочтения пользователей |
| `routeCache: Map()` | intelligence/router.js | Кэш маршрутов |
| `customMetrics: Map()` | metrics/collector.js | Пользовательские метрики |
| `cardinalityTracker: Map()` | metrics/collector.js | Отслеживание cardinality |
| `coordinator` (singleton) | runtime/coordinator.js | Runtime coordinator |
| `daemonInstance` | runtime/daemon.js | Singleton daemon |
| `globalMetrics` | performance/monitor.js | Глобальный сборщик метрик |

---

## Архитектурные паттерны

1. **State Machine**: Workflow/Agent/Phase состояния с чёткими переходами
2. **EventEmitter**: Асинхронная коммуникация между компонентами
3. **Singleton**: Координатор, демон, глобальные метрики
4. **Registry Pattern**: Map-based регистры для всех сущностей
5. **Strategy Pattern**: Load balancing, aggregation, prediction стратегии
6. **Observer Pattern**: Event-driven обновления метрик
7. **Circuit Breaker**: В metrics/collector для flush failures
8. **Bulkhead Pattern**: Изолированные очереди в task-queue.js
9. **Gateway Pattern**: Composition layer для cross-domain доступа
10. **Map-Reduce**: Параллельное выполнение в parallel-executor.js

---

## Проблемы/заглушки

### Sleep Stubs / Симуляция

| Файл | Функция | Реализация |
|------|---------|------------|
| gsd/engine.js | `simulatePhaseExecution()` | `Math.random() * 400 + 100` ms, 5% failure |
| gsd/agent.js | `_simulateWork()` | `setTimeout(resolve, duration)` |
| gsd/agent.js | `_executeTaskLogic()` | `Math.random() * 100 + 50` ms, 5% failure |

### TODO/FIXME найденные

| Файл | Проблема |
|------|----------|
| gsd/engine.js | "In production, replace with real agent task execution" |
| gsd/agent.js | "This would be replaced with actual task execution logic" |

### Пустые/минимальные реализации

| Файл | Компонент | Состояние |
|------|-----------|-----------|
| composition/db-gateway.js | Полный файл | Только re-export |
| composition/git-checkpoint-gateway.js | Полный файл | Только re-export |
| composition/roadmap-gateway.js | Полный файл | 1 export |

### Потенциальные проблемы

1. **Cardinaly explosion**: metrics/collector.js имеет лимит 1000, но нет cleanup
2. **Memory leaks**: Все Map-based регистры растут без bounds (кроме LRU кэшей)
3. **No actual agent execution**: Все агенты - симуляция
4. **File-based storage**: Чекпоинты и пулы хранятся в JSON файлах
5. **No distributed coordination**: DistributedLock - только in-memory
