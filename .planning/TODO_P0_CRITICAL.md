# P0 - CRITICAL Tasks (Блокирует Production)

> Эти задачи должны быть выполнены до запуска в продакшен

---

## 🚨 Integration Fixes (Сломанные импорты)

### INT-001: Исправить путь импорта roadmaps
- **Файл:** `src/controllers/roadmaps.js:9`
- **Проблема:** `import * as roadmapDomain from '../interface/domain/roadmaps/index.js'`
- **Папка `interface/domain` не существует!**
- **Решение:** 
  ```javascript
  // Было:
  import * as roadmapDomain from '../interface/domain/roadmaps/index.js';
  
  // Стало (вариант 1 - напрямую к домену):
  import * as roadmapDomain from '../domains/roadmaps/index.js';
  
  // Стало (вариант 2 - через gateway):
  import { RoadmapGateway } from '../composition/roadmap-gateway.js';
  ```
- **Приоритет:** 🔴 CRITICAL
- **Время:** 15 минут

### INT-002: Исправить путь импорта tasks
- **Файл:** `src/controllers/tasks.js:9`
- **Проблема:** `import * as taskDomain from '../interface/domain/tasks/index.js'`
- **Решение:** Аналогично INT-001
- **Приоритет:** 🔴 CRITICAL
- **Время:** 15 минут

### INT-003: Исправить импорт AgentState/AgentStatus
- **Файл:** `src/bios/spawn-manager.js:7`
- **Проблема:** Импортируется `AgentState`, но `src/gsd/agent.js` экспортирует `AgentStatus`
- **Решение:**
  ```javascript
  // Было:
  import { Agent, AgentState } from '../gsd/agent.js';
  
  // Стало:
  import { Agent, AgentStatus } from '../gsd/agent.js';
  // Или создать alias:
  const AgentState = AgentStatus;
  ```
- **Приоритет:** 🔴 CRITICAL
- **Время:** 10 минут

---

## 🗄️ Database & Backup

### DB-001: Система бэкапа/восстановления SQLite
- **Файл:** `src/db/backup.js` (создать)
- **Требования:**
  - `createBackup()` - полный бэкап БД + WAL
  - `restoreFromBackup(backupPath)` - восстановление
  - `listBackups()` - список бэкапов
  - `scheduleBackups(cronExpression)` - автоматические бэкапы
- **RTO:** < 1 час (Recovery Time Objective)
- **RPO:** < 15 минут (Recovery Point Objective)
- **Стратегия:**
  ```
  Ежедневно: Полный бэкап в 02:00
  Каждые 4 часа: Инкрементальный бэкап WAL
  Хранение: 7 дней полных, 24 часа инкрементальных
  ```
- **Приоритет:** 🔴 CRITICAL
- **Время:** 4-6 часов

### DB-002: Тесты для rollback миграций
- **Файл:** `tests/db/migrations.spec.js` (создать)
- **Тест кейсы:**
  - `up()` применяет миграцию корректно
  - `down()` откатывает миграцию
  - Foreign keys целостны после отката
  - Checksum валидация (добавить в MigrationRunner)
- **Приоритет:** 🔴 CRITICAL
- **Время:** 3-4 часа

---

## 📚 Documentation (Contracts)

### DOM-001: CONTRACT.md для domains/tasks
- **Файл:** `src/domains/tasks/CONTRACT.md` (создать)
- **Основа:** `src/domains/tasks/ACCEPTANCE.md` (173 строки, 18 сценариев)
- **Структура (как в merkle/CONTRACT.md):**
  ```markdown
  # Task Domain Contract
  
  ## Overview
  ## Classes
  ### TaskManager
  #### Methods
  ## Types
  ## Usage Example
  ```
- **Ключевые сущности:**
  - Task (Eisenhower Matrix: urgent-important, not-urgent-important, urgent-not-important, not-urgent-not-important)
  - Subtask
  - TaskStatus: not_started, in_progress, completed, cancelled
- **Методы:** createTask, updateTask, deleteTask, organizeByMatrix, linkToRoadmap, logTime
- **Приоритет:** 🔴 CRITICAL
- **Время:** 2-3 часа

### DOM-002: CONTRACT.md для domains/roadmaps
- **Файл:** `src/domains/roadmaps/CONTRACT.md` (создать)
- **Основа:** `src/domains/roadmaps/ACCEPTANCE.md` (168 строк, 19 сценариев)
- **Ключевые сущности:**
  - Roadmap
  - RoadmapNode
  - Enrollment
  - NodeStatus: not_started, in_progress, completed
- **Методы:** createRoadmap, enrollUser, getProgress, updateNodeStatus, recommendNext
- **Приоритет:** 🔴 CRITICAL
- **Время:** 2-3 часа

### DOM-003: CONTRACT.md для domains/thought
- **Файл:** `src/domains/thought/CONTRACT.md` (создать)
- **Основа:** `src/domains/thought/ACCEPTANCE.md` (192 строки, 20 сценариев)
- **Ключевые сущности:**
  - ThoughtRecord
  - ThoughtChain
- **Методы:** recordThought, getChain, verifyChain, getMerkleProof, exportToJSON, importFromJSON
- **Интеграция:** Merkle Domain для верификации
- **Приоритет:** 🔴 CRITICAL
- **Время:** 2-3 часа

### API-001: OpenAPI/Swagger спецификация
- **Файл:** `.spec/api/openapi.yaml` (создать)
- **Покрытие:** 58 MCP Tools
  - Task Tools: 11
  - Roadmap Tools: 13
  - Claude Tools: 12
  - System Tools: 12
  - Analysis Tools: 10
- **Структура:**
  ```yaml
  openapi: 3.0.0
  info:
    title: CogniMesh MCP API
    version: 5.0.0
  paths:
    /tools/{toolName}:
      post:
        summary: Execute MCP Tool
  ```
- **Источники:**
  - `API_REFERENCE.md`
  - `src/tools/definitions/*.js`
  - `src/controllers/*.js`
- **Приоритет:** 🔴 CRITICAL
- **Время:** 6-8 часов

---

## 🔒 Security

### SEC-001: HashiCorp Vault интеграция
- **Файл:** `src/security/vault.js` (создать)
- **Секреты для хранения:**
  - ANTHROPIC_API_KEY
  - KIMI_API_KEY
  - OPENAI_API_KEY
  - GITHUB_TOKEN
  - DATABASE_URL (с паролем)
- **Функции:**
  - `getSecret(path)` - получение секрета
  - `rotateSecret(path)` - ротация
  - Интеграция с `src/config.js`
- **Приоритет:** 🔴 CRITICAL
- **Время:** 4-6 часов

### SEC-002: Health Check Endpoints
- **Файлы:**
  - `src/server.js` - добавить endpoints
  - `src/bios/system-monitor.js` - интеграция
- **Endpoints:**
  - `GET /health` - общий статус
  - `GET /health/ready` - readiness probe (БД, кэш)
  - `GET /health/live` - liveness probe (сервер работает)
- **Проверки:**
  - BIOS state
  - Database connection
  - AI clients connectivity
  - WebSocket server
  - Agent Pool status
- **Приоритет:** 🔴 CRITICAL
- **Время:** 3-4 часа

---

## 🧪 Testing

### TEST-001: Интеграционные тесты для domains/tasks
- **Файл:** `tests/domains/tasks.integration.spec.js` (создать)
- **Покрытие:**
  - CRUD операции
  - Eisenhower Matrix организация
  - gsd-sync интеграция
  - File storage
  - Markdown sync
- **Приоритет:** 🔴 CRITICAL
- **Время:** 4-6 часов

### TEST-002: Интеграционные тесты для domains/roadmaps
- **Файл:** `tests/domains/roadmaps.integration.spec.js` (создать)
- **Покрытие:**
  - Roadmap CRUD
  - Progress tracking
  - Personalize path
  - Enrollment
- **Приоритет:** 🔴 CRITICAL
- **Время:** 4-6 часов

### TEST-003: Интеграционные тесты для domains/merkle
- **Файл:** `tests/domains/merkle.integration.spec.js` (создать)
- **Покрытие:**
  - Tree creation
  - Proof generation
  - Proof verification
  - Tree comparison
- **Приоритет:** 🔴 CRITICAL
- **Время:** 3-4 часа

### TEST-004: Интеграционные тесты для domains/thought
- **Файл:** `tests/domains/thought.integration.spec.js` (создать)
- **Покрытие:**
  - Chain recording
  - Chain verification
  - Merkle proofs
  - JSON export/import
- **Приоритет:** 🔴 CRITICAL
- **Время:** 3-4 часа

### TEST-005: Интеграционные тесты для domains/context
- **Файл:** `tests/domains/context.integration.spec.js` (создать)
- **Покрытие:**
  - Snapshot creation
  - Version management
  - Integrity verification
  - Cleanup expired
- **Приоритет:** 🔴 CRITICAL
- **Время:** 3-4 часа

---

## 🤖 BIOS/Core

### BIOS-001: Создать src/gsd/agent.js
- **Файл:** `src/gsd/agent.js` (создать)
- **Требуется для:** `src/bios/spawn-manager.js`
- **Класс Agent:**
  ```javascript
  class Agent extends EventEmitter {
    constructor(config)
    get status() // AgentStatus: IDLE, BUSY, ERROR, TERMINATING, TERMINATED
    async initialize()
    async execute(task)
    async terminate()
    heartbeat()
    // Retry logic с exponential backoff
    // Recovery mechanisms
  }
  ```
- **Статусы:**
  - IDLE - готов к работе
  - BUSY - выполняет задачу
  - ERROR - ошибка
  - TERMINATING - завершается
  - TERMINATED - завершён
- **Приоритет:** 🔴 CRITICAL
- **Время:** 4-6 часов

### BIOS-002: Реализовать клиентские модули
- **Файлы:**
  - `src/clients/claude/desktop.js`
  - `src/clients/claude/ide.js`
  - `src/clients/claude/cli.js`
  - `src/clients/claude/mcp.js`
  - `src/clients/kimi/ide.js`
  - `src/clients/kimi/cli.js`
  - `src/clients/kimi/swarm.js`
  - `src/clients/codex/cli.js`
  - `src/clients/codex/copilot.js`
  - `src/clients/codex/cursor.js`
- **BaseClient API:**
  ```javascript
  abstract class BaseClient {
    async initialize()
    async send(message, options)
    async execute(task, options)
    async ping()
    async reconnect()
    async disconnect()
    getCapabilities()
    getStatus()
    isConnected()
  }
  ```
- **Приоритет:** 🔴 CRITICAL
- **Время:** 8-12 часов

---

## 📊 Сводка P0

| Код | Задача | Assigned To | Est. Hours | Статус |
|-----|--------|-------------|------------|--------|
| INT-001 | Fix roadmaps import | DevOps | 0.25 | ⏳ |
| INT-002 | Fix tasks import | DevOps | 0.25 | ⏳ |
| INT-003 | Fix AgentState import | DevOps | 0.15 | ⏳ |
| DB-001 | Backup system | Backend | 5 | ⏳ |
| DB-002 | Migration rollback tests | Backend | 4 | ⏳ |
| API-001 | OpenAPI spec | TechWriter | 7 | ⏳ |
| SEC-001 | Vault integration | Security | 5 | ⏳ |
| SEC-002 | Health endpoints | Backend | 4 | ⏳ |
| DOM-001 | tasks CONTRACT.md | TechWriter | 3 | ⏳ |
| DOM-002 | roadmaps CONTRACT.md | TechWriter | 3 | ⏳ |
| DOM-003 | thought CONTRACT.md | TechWriter | 3 | ⏳ |
| TEST-001 | tasks integration tests | QA | 5 | ⏳ |
| TEST-002 | roadmaps integration tests | QA | 5 | ⏳ |
| TEST-003 | merkle integration tests | QA | 4 | ⏳ |
| TEST-004 | thought integration tests | QA | 4 | ⏳ |
| TEST-005 | context integration tests | QA | 4 | ⏳ |
| BIOS-001 | Create agent.js | Core | 5 | ⏳ |
| BIOS-002 | Client modules | Core | 10 | ⏳ |

**Всего задач:** 18  
**Общее время:** ~67 часов  
**Критический путь:** INT fixes → DB-001 → SEC-001 → BIOS-002  
**Подробный план:** см. [EXECUTION_PLAN.md](./EXECUTION_PLAN.md)

---

*Эти задачи блокируют production deployment и должны быть выполнены в первую очередь.*
