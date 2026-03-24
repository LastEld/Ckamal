# Анализ структуры src/ - Дублирующиеся паттерны и проблемы

> Сгенерировано: 2026-03-23
> Скоуп: e:\Ckamal\src

---

## 1. ДУБЛИРУЮЩИЕСЯ ПАТТЕРНЫ

### 1.1 🔴 КРИТИЧНЫЕ: Дублирование AgentState констант

| Что дублируется | Где определено | Различия | Рекомендация |
|----------------|----------------|----------|--------------|
| `AgentState` | `gsd/agent-pool.js:13-20` | IDLE, BUSY, ERROR, TERMINATED, SPAWNING, HEALTH_CHECKING | **ВЫБРАТЬ ОДИН ИСТОЧНИК** |
| `AgentState` | `gsd/agent-types.js:54-61` | PENDING, INITIALIZING, READY, BUSY, FAILED, TERMINATED | **ВЫБРАТЬ ОДИН ИСТОЧНИК** |
| `AgentState` | `gsd/engine.js:36-41` | IDLE, BUSY, ERROR, TERMINATED | **ВЫБРАТЬ ОДИН ИСТОЧНИК** |

**Проблема:** Три разных набора состояний агента в разных модулях:
- `agent-pool.js` использует IDLE/BUSY/ERROR/TERMINATED/SPAWNING/HEALTH_CHECKING
- `agent-types.js` использует PENDING/INITIALIZING/READY/BUSY/FAILED/TERMINATED
- `engine.js` использует IDLE/BUSY/ERROR/TERMINATED

**Риск:** Несовместимость состояний при интеграции компонентов.

**Рекомендация:**
```javascript
// Создать единый источник: gsd/constants/states.js
export const AgentState = Object.freeze({
    PENDING: "pending",
    INITIALIZING: "initializing",
    READY: "ready",        // вместо IDLE
    BUSY: "busy",
    ERROR: "error",        // или FAILED - выбрать одно
    TERMINATED: "terminated"
});
```

---

### 1.2 🔴 КРИТИЧНЫЕ: Дублирование Circuit Breaker

| Что дублируется | Где определено | Рекомендация |
|----------------|----------------|--------------|
| `CircuitBreaker` класс | `claude/core/resilience.js:36-236` | **УНИФИЦИРОВАТЬ** |
| `CircuitBreaker` класс | `claude/resilience/circuit-breaker.js:164-414` | **УНИФИЦИРОВАТЬ** |
| `CircuitState` константы | `claude/core/resilience.js:16-20` | **УНИФИЦИРОВАТЬ** |
| `CircuitState` константы | `claude/resilience/circuit-breaker.js:17-21` | **УНИФИЦИРОВАТЬ** |

**Проблема:** Два полноценных Circuit Breaker реализации с одинаковой логикой (CLOSED/OPEN/HALF_OPEN).

**Рекомендация:** Оставить только `claude/resilience/circuit-breaker.js` (более полная версия с persistence), удалить из `claude/core/resilience.js`.

---

### 1.3 🔴 КРИТИЧНЫЕ: Дублирование Retry логики

| Что дублируется | Где определено | Рекомендация |
|----------------|----------------|--------------|
| `calculateRetryDelay()` | `claude/core/retry.js:176-198` | **УНИФИЦИРОВАТЬ** |
| `calculateRetryDelay()` | `claude/core/resilience.js:285-299` | **УНИФИЦИРОВАТЬ** |
| `isRetryableError()` | `claude/core/retry.js:139-168` | **УНИФИЦИРОВАТЬ** |
| `isRetryableError()` | `claude/core/resilience.js:307-338` | **УНИФИЦИРОВАТЬ** |
| `withRetry()` | `claude/core/retry.js:216-300` | **УНИФИЦИРОВАТЬ** |
| `withRetry()` | `claude/core/resilience.js:348-380` | **УНИФИЦИРОВАТЬ** |
| `RetryExhaustedError` | `claude/core/retry.js:305-320` | **УНИФИЦИРОВАТЬ** |
| `RetryExhaustedError` | `claude/core/resilience.js:385-397` | **УНИФИЦИРОВАТЬ** |

**Рекомендация:** Сохранить `claude/core/retry.js` (более продвинутая версия с метриками), удалить дубли из `claude/core/resilience.js`.

---

### 1.4 🟠 ВАЖНЫЕ: Дублирование LRU Cache

| Что дублируется | Где определено | Особенности | Рекомендация |
|----------------|----------------|-------------|--------------|
| `LRUCache` класс | `utils/cache.js:14-146` | TTL, maxSize, hits/misses stats | **УНИФИЦИРОВАТЬ** |
| `LRUCache` класс | `analysis/lru-cache.js:6-151` | + maxBytes, size estimation | **УНИФИЦИРОВАТЬ** |
| `RouterCache` класс | `intelligence/router-cache.js:9-349` | + warming, pre-computation | **УНИФИЦИРОВАТЬ** |

**Рекомендация:** Создать иерархию:
```
utils/cache.js - базовый LRUCache
analysis/lru-cache.js → extends базовый с maxBytes
intelligence/router-cache.js → extends с warming
```

---

### 1.5 🟠 ВАЖНЫЕ: Дублирование estimateTokens

| Что дублируется | Где определено | Использование | Рекомендация |
|----------------|----------------|---------------|--------------|
| `estimateTokens()` | `utils/token-counter.js:25` | Общий токен-каунтер | **СДЕЛАТЬ ЕДИНСТВЕННЫМ** |
| `estimateTokens()` | `config/claude.js:204` | Конфигурация Claude | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `analysis/rag-embeddings.js:85` | RAG эмбеддинги | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `analysis/memory-qr.js:72` | Memory QR | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `services/context-manager.js:25` | Context manager | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `utils/tiered-storage.js:375` | Tiered storage | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `claude/core/models.js:467` | Core models | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `claude/context/tokens.js:20` | Context tokens | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `claude/conversation/context.js:23` | Conversation | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `claude/router/complexity.js:114` | Router | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `controllers/memory.js:38` | Controller | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `claude/extended-thinking/parser.js:501` | Extended thinking | **ИМПОРТИРОВАТЬ из utils** |
| `estimateTokens()` | `claude/messages/store.js:48` | Messages store | **ИМПОРТИРОВАТЬ из utils** |

**Всего: 13 реализаций одной функции!**

**Рекомендация:** 
- `utils/token-counter.js` - единственная реализация
- Все остальные - re-export или import

---

### 1.6 🟠 ВАЖНЫЕ: Дублирование Alert констант

| Что дублируется | Где определено | Рекомендация |
|----------------|----------------|--------------|
| `ALERT_SEVERITY` | `alerts/rules.js:33-40` | **УНИФИЦИРОВАТЬ** |
| `ALERT_SEVERITY` | `alerts/engine.js:42-49` | **УНИФИЦИРОВАТЬ** |
| `ALERT_STATUS` | `alerts/engine.js:52-60` | **УНИФИЦИРОВАТЬ** |
| `ALERT_STATUS` | `alerts/manager.js:14-22` | **УНИФИЦИРОВАТЬ** |

**Проблема:** Разные наборы статусов:
- `engine.js`: FIRING, ACKNOWLEDGED, RESOLVED, SILENCED
- `manager.js`: ACTIVE, ACKNOWLEDGED, RESOLVED, SILENCED, ESCALATED

**Рекомендация:** Создать `alerts/constants.js` с единым набором.

---

### 1.7 🟡 СРЕДНИЕ: Дублирование File Lock

| Что дублируется | Где определено | Рекомендация |
|----------------|----------------|--------------|
| File lock функции | `composition/file-lock.js` | **СДЕЛАТЬ ИСТОЧНИКОМ** |
| File lock re-export | `utils/file-lock.js` | **ОСТАВИТЬ КАК ALIAS** |

**OK:** Уже сделано правильно - `utils/file-lock.js` просто re-export.

---

### 1.8 🟡 СРЕДНИЕ: Дублирование конфигурации AMS_ROOT

| Что дублируется | Где определено | Рекомендация |
|----------------|----------------|--------------|
| `AMS_ROOT` | `config.js:15` | **СДЕЛАТЬ ИСТОЧНИКОМ** |
| `AMS_ROOT` | `domains/gsd/config.js:8` | **ИМПОРТИРОВАТЬ из корня** |

**Проблема:** `domains/gsd/config.js` переопределяет AMS_ROOT с другой логикой path resolution.

---

### 1.9 🔴 КРИТИЧНЫЕ: Дублирование Agent Pool системы

| Компонент | gsd/agent-pool.js | gsd/agent-pool-manager.js | Рекомендация |
|-----------|-------------------|---------------------------|--------------|
| Pool lifecycle | ✅ | ✅ | **УНИФИЦИРОВАТЬ** |
| Agent spawning | ✅ | ✅ | **УНИФИЦИРОВАТЬ** |
| Health checks | ✅ | ✅ | **УНИФИЦИРОВАТЬ** |
| Auto-scaling | ✅ | ✅ | **УНИФИЦИРОВАТЬ** |
| State management | Map + файлы | Map + EventEmitter | **ВЫБРАТЬ ОДИН** |

**Проблема:** Две полные реализации управления пулом агентов:
1. `gsd/agent-pool.js` - функциональный стиль, Map + файловая персистентность
2. `gsd/agent-pool-manager.js` - класс-based, EventEmitter

**Рекомендация:** Выбрать `gsd/agent-pool-manager.js` (более современный), мигрировать файловую персистентность.

---

## 2. НЕИСПОЛЬЗУЕМЫЕ ЭКСПОРТЫ (Мертвый код)

### 2.1 Потенциально неиспользуемые функции

| Файл | Экспорт | Статус | Проверка |
|------|---------|--------|----------|
| `gsd/agent.js` | `Agent` класс | ✅ Используется в agent-pool-manager.js | OK |
| `gsd/agent-types.js` | `compareAgentTypes()` | ? | Найти использование |
| `gsd/agent-types.js` | `validateAgentTypeConfig()` | ? | Найти использование |
| `gsd/planner.js` | ? | ? | Проверить |
| `gsd/verifier.js` | ? | ? | Проверить |

### 2.2 Дублирующие экспорты в index файлах

```javascript
// gsd/agent-pool-index.js - ПРОБЛЕМА
export { AgentState as AgentTypeState } from "./agent-types.js";
export { AgentState } from "./agent-pool.js";
// Два разных AgentState под разными именами!
```

---

## 3. СТРАННЫЕ НАЗВАНИЯ

### 3.1 Непонятные имена файлов/папок

| Путь | Проблема | Рекомендация |
|------|----------|--------------|
| `gsd/` | Аббревиатура "Get Shit Done" | Добавить README или переименовать в `execution/` |
| `gsd/agent-pool-index.js` | Непонятно отличие от `agent-pool.js` | Переименовать в `index.js` или `gsd-index.js` |
| `analysis/memory-qr.js` | "QR" непонятно без контекста | Переименовать в `memory-quick-retrieval.js` |
| `composition/` | Непонятно что composes | Добавить README с объяснением слоя |
| `domains/gsd/` | Дублирование с `gsd/` | **КРИТИЧНО:** Объединить |
| `claude/core/` vs `claude/` | Непонятная иерархия | Унифицировать структуру |
| `intelligence/` | Пересекается с `analytics/` | Объяснить разницу или объединить |

### 3.2 Несоответствие названия и содержимого

| Файл | Название | Содержимое | Рекомендация |
|------|----------|------------|--------------|
| `gsd/engine.js` | "Engine" | Workflow engine + Agent state | Переименовать в `workflow-engine.js` |
| `gsd/agent-pool.js` | "Pool" | Pool + Agent registry + State | Разделить или переименовать |
| `alerts/engine.js` | "Engine" | Alert engine + константы | Вынести константы |
| `validation/schemas.js` | "Schemas" | Схемы + валидация | OK, но много mixed concerns |

---

## 4. РАЗБРОСАННАЯ КОНФИГУРАЦИЯ

### 4.1 Где определяются константы

| Тип констант | Файлы | Рекомендация |
|--------------|-------|--------------|
| **Системные пути** | `config.js`, `domains/gsd/config.js` | **Объединить в `config/paths.js`** |
| **База данных** | `config.js` (строки 66-97) | **Вынести в `config/database.js`** |
| **Claude API** | `config/claude.js` | OK, оставить |
| **Auth** | `config.js`, `config-auth.js` | **Объединить** |
| **RAG/Embeddings** | `analysis/rag-constants.js`, `config.js` (строки 51-65) | **Объединить в `config/embeddings.js`** |
| **GSD константы** | `domains/gsd/constants.js` | OK, оставить |
| **Alert константы** | `alerts/rules.js`, `alerts/engine.js`, `alerts/manager.js` | **Создать `alerts/constants.js`** |
| **Agent состояния** | `gsd/agent-types.js`, `gsd/agent-pool.js`, `gsd/engine.js` | **Создать `gsd/constants/states.js`** |

### 4.2 Где определяются состояния агентов

```
gsd/agent-pool.js:13-20       → AgentState (IDLE, BUSY, ERROR...)
gsd/agent-types.js:54-61      → AgentState (PENDING, READY, FAILED...)
gsd/engine.js:36-41           → AgentState (IDLE, BUSY, ERROR...)
```

**ВСЕГО 3 РАЗНЫХ НАБОРА СОСТОЯНИЙ!**

### 4.3 Где определяются Circuit Breaker константы

```
claude/core/resilience.js:16-20     → CircuitState
claude/resilience/circuit-breaker.js:17-21  → CircuitState (дубликат)
```

---

## 5. РЕКОМЕНДАЦИИ ПО РЕФАКТОРИНГУ

### 5.1 Приоритет: CRITICAL 🔴

1. **Унифицировать AgentState**
   ```
   Создать: gsd/constants/states.js
   Удалить дубли из: agent-pool.js, agent-types.js, engine.js
   ```

2. **Унифицировать Circuit Breaker**
   ```
   Оставить: claude/resilience/circuit-breaker.js
   Удалить: claude/core/resilience.js (CircuitBreaker класс)
   ```

3. **Унифицировать Retry логику**
   ```
   Оставить: claude/core/retry.js
   Удалить дубли из: claude/core/resilience.js
   ```

### 5.2 Приоритет: HIGH 🟠

4. **Создать единый estimateTokens**
   ```
   Оставить: utils/token-counter.js
   Все остальные: заменить на import
   ```

5. **Унифицировать LRU Cache**
   ```
   Базовый: utils/cache.js
   Analysis: extends базового
   Router: extends базового
   ```

6. **Объединить конфигурацию**
   ```
   config/
   ├── index.js          (текущий config.js)
   ├── paths.js          (AMS_ROOT и пути)
   ├── database.js       (DB_RETRY_* и т.д.)
   ├── auth.js           (объединить config.js + config-auth.js)
   ├── embeddings.js     (RAG константы)
   └── claude.js         (существующий)
   ```

### 5.3 Приоритет: MEDIUM 🟡

7. **Унифицировать Alert константы**
   ```
   Создать: alerts/constants.js
   ```

8. **Унифицировать Agent Pool систему**
   ```
   Оставить: gsd/agent-pool-manager.js
   Депрекейт: gsd/agent-pool.js
   ```

9. **Добавить README к непонятным папкам**
   - `gsd/README.md`
   - `composition/README.md`
   - `intelligence/README.md`

### 5.4 Структура после рефакторинга

```
src/
├── config/
│   ├── index.js              # Главный экспорт
│   ├── paths.js              # AMS_ROOT, директории
│   ├── database.js           # DB_* константы
│   ├── auth.js               # AUTH_* константы
│   ├── embeddings.js         # RAG/Embedding константы
│   └── claude.js             # Claude API конфиг
│
├── gsd/
│   ├── constants/
│   │   ├── states.js         # Единый AgentState
│   │   └── index.js          # Ре-экспорт
│   ├── index.js              # Единая точка входа
│   ├── agent.js              # Agent класс
│   ├── agent-pool-manager.js # Pool управление
│   ├── agent-types.js        # Типы агентов (без состояний)
│   ├── workflow-engine.js    # (переименован engine.js)
│   └── ...
│
├── utils/
│   ├── cache.js              # LRU Cache (единственный)
│   ├── token-counter.js      # estimateTokens (единственный)
│   └── file-lock.js          # (остается alias)
│
├── claude/
│   ├── core/
│   │   ├── retry.js          # Retry логика (единственная)
│   │   └── ...               # (resilience.js - без CircuitBreaker)
│   ├── resilience/
│   │   └── circuit-breaker.js # (единственный CircuitBreaker)
│   └── ...
│
└── alerts/
    ├── constants.js          # ALERT_SEVERITY, ALERT_STATUS
    ├── engine.js             # (без констант)
    ├── manager.js            # (без констант)
    └── rules.js              # (без констант)
```

---

## 6. МЕТРИКИ

| Категория | Количество |
|-----------|------------|
| Всего файлов .js | ~200 |
| Дублирующих AgentState | 3 |
| Дублирующих CircuitBreaker | 2 |
| Дублирующих Retry логик | 2 |
| Дублирующих estimateTokens | 13 |
| Дублирующих LRU Cache | 3 |
| Разбросанных конфигов | 7+ файлов |

---

## 7. ДЕЙСТВИЯ

- [ ] Создать `gsd/constants/states.js` - унифицировать AgentState
- [ ] Рефактор `claude/core/resilience.js` - удалить дубли
- [ ] Создать `alerts/constants.js` - унифицировать ALERT_*
- [ ] Рефактор `utils/token-counter.js` - сделать primary для estimateTokens
- [ ] Обновить все import'ы estimateTokens
- [ ] Создать `config/` структуру
- [ ] Добавить README к непонятным папкам
- [ ] Депрекейт `gsd/agent-pool.js` в пользу `agent-pool-manager.js`
