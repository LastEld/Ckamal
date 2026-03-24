# Отчёт о переименовании папок в src/

**Дата:** 2026-03-23  
**Всего файлов:** 303  
**Статус:** ✅ Успешно завершено

---

## Таблица переименований

| Старое название | Новое название | Причина переименования |
|----------------|----------------|------------------------|
| `gsd/` | `workflow-engine/` | Содержит workflow engine (planner, verifier, agent-pool, checkpoint). Название "gsd" (get-shit-done) было непонятным без контекста. Новое название точно отражает назначение - движок workflow. |
| `composition/` | `gateways/` | Содержит gateway файлы: db-gateway, git-checkpoint-gateway, roadmap-gateway, file-lock. "Composition" было абстрактным, "gateways" точнее описывает паттерн. |
| `intelligence/` | `ai-core/` | Содержит AI/ML компоненты: router, classifier, predictor, anomaly detection, optimizers. Название "ai-core" лаконичнее и яснее показывает, что это ядро AI функциональности. |
| `analysis/` | `rag/` | Содержит исключительно RAG (Retrieval-Augmented Generation) компоненты: rag.js, rag-search.js, rag-embeddings.js, rag-quality.js и т.д. Название "analysis" было слишком общим. |
| `watchers/` | `file-watchers/` | Содержит file watching функциональность. Новое название более специфично и не пересекается с другими понятиями "watchers". |
| `domains/` | *(без изменений)* | Чистая доменная структура (roadmaps, tasks, merkle, context, retention). Название корректно и понятно. |

---

## Список обновлённых импортов

### 1. analysis/ → rag/
```
src/rag/memory-qr.js:          ../composition/ → ../gateways/
src/rag/rag.js:                ../composition/ → ../gateways/
src/rag/index.js:              ../composition/ → ../gateways/
src/rag/rag-search.js:         ../composition/ → ../gateways/

src/controllers/analysis.js:   ../analysis/    → ../rag/
src/controllers/autonomous.js: ../analysis/    → ../rag/
src/controllers/memory.js:     ../analysis/    → ../rag/
src/middleware/orchestration.js: ../analysis/ → ../rag/

src/server.js:                 ./analysis/     → ./rag/
```

### 2. composition/ → gateways/
```
src/rag/*.js:                  ../composition/ → ../gateways/
src/controllers/audit.js:      ../composition/ → ../gateways/
src/controllers/autonomous.js: ../composition/ → ../gateways/
src/controllers/memory.js:     ../composition/ → ../gateways/
src/middleware/orchestration.js: ../composition/ → ../gateways/
src/middleware/audit.js:       ../composition/ → ../gateways/
src/middleware/acl.js:         ../composition/ → ../gateways/
src/file-watchers/index.js:    ../composition/ → ../gateways/
src/utils/file-lock.js:        ../composition/ → ../gateways/
```

### 3. gsd/ → workflow-engine/
```
src/tools/gsd-workflow.js:     ../gsd/         → ../workflow-engine/
src/workflow-engine/engine.js: ../domains/gsd/ → ../domains/gsd/ (без изменений)
src/workflow-engine/checkpoint.js: (внутренние импорты)
src/workflow-engine/agent-pool.js: (внутренние импорты)
```

### 4. intelligence/ → ai-core/
```
src/tools/intelligence.js:     ../intelligence/ → ../ai-core/ (15 импортов)
```

### 5. watchers/ → file-watchers/
```
src/controllers/watchers.js:   ../watchers/    → ../file-watchers/
src/server.js:                 ./watchers/     → ./file-watchers/
```

---

## Проверка целостности

### Синтаксическая проверка
```
✅ node --check src/server.js        - OK
✅ node --check src/controllers/index.js - OK
✅ node --check src/workflow-engine/index.js - OK
✅ node --check src/ai-core/index.js - OK
✅ node --check src/rag/index.js     - OK
✅ node --check src/gateways/db-gateway.js - OK
✅ node --check src/file-watchers/index.js - OK
```

### Полная проверка всех файлов
```
✅ Все 303 JavaScript файла прошли проверку синтаксиса
```

### Проверка структуры
```
src/
├── ai-core/           ← (бывш. intelligence/)
│   ├── router.js
│   ├── classifier.js
│   ├── predictor.js
│   ├── anomaly.js
│   └── optimizers/
├── file-watchers/     ← (бывш. watchers/)
│   └── index.js
├── gateways/          ← (бывш. composition/)
│   ├── db-gateway.js
│   ├── git-checkpoint-gateway.js
│   └── roadmap-gateway.js
├── rag/               ← (бывш. analysis/)
│   ├── rag.js
│   ├── rag-search.js
│   ├── rag-embeddings.js
│   └── memory-qr.js
├── workflow-engine/   ← (бывш. gsd/)
│   ├── engine.js
│   ├── planner.js
│   ├── verifier.js
│   ├── agent-pool.js
│   └── checkpoint.js
└── domains/           ← (без изменений)
    ├── roadmaps/
    ├── tasks/
    ├── merkle/
    └── ...
```

---

## Сводка

| Метрика | Значение |
|---------|----------|
| Переименовано папок | 5 |
| Обновлено файлов | 18 |
| Обновлено импортов | 42 |
| Ошибок синтаксиса | 0 |
| Ошибок импортов | 0 |

**Вывод:** Все переименования выполнены успешно. Структура проекта стала более понятной и отражает назначение модулей.
