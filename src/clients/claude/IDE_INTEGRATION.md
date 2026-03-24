# Claude VSCode Client Integration

## Обзор

`ClaudeVSCodeClient` - это продвинутая интеграция с расширением Anthropic Sonnet 4.6 для VSCode, реализующая LSP-подобный протокол для максимальной совместимости с IDE-функциями.

## Возможности

### LSP Протокол
- Полная поддержка LSP 3.17
- Документная синхронизация
- Управление версиями документов
- Bidirectional JSON-RPC

### IDE Функции

#### 1. Inline Completion
```javascript
const completions = await client.inlineCompletion(
  { uri: 'file:///project/src/app.js', text: code, languageId: 'javascript' },
  { line: 10, character: 15 },
  { triggerKind: 1 }
);
```

#### 2. Hover Information
```javascript
const hover = await client.provideHover(
  { uri: 'file:///project/src/app.js' },
  { line: 10, character: 15 }
);
```

#### 3. Code Actions & Quick Fixes
```javascript
const actions = await client.codeAction(
  { uri: 'file:///project/src/app.js' },
  { start: { line: 10, character: 0 }, end: { line: 10, character: 20 } },
  { diagnostics: [], only: ['quickfix', 'refactor'] }
);
```

#### 4. Refactoring
```javascript
// Extract method/variable
await client.refactoring(
  document,
  range,
  'extract',
  { name: 'newMethod' }
);

// Rename symbol
await client.renameSymbol(document, position, 'newName');
```

#### 5. Symbol Navigation
```javascript
// Go to definition
const definitions = await client.goToDefinition(document, position);

// Find all references
const references = await client.findAllReferences(document, position, true);

// Get document symbols
const symbols = await client.getDocumentSymbols(document);

// Search workspace symbols
const workspaceSymbols = await client.searchWorkspaceSymbols('UserService');
```

#### 6. Diagnostics
```javascript
const diagnostics = await client.diagnostics(document);
// Включает LSP диагностики + CogniMesh-специфичные:
// - TODO/FIXME комментарии
// - Roadmap ссылки (@roadmap[node-id])
```

### CogniMesh Интеграция

#### Создание задач из кода
```javascript
const task = await client.createTaskFromCode(
  document,
  selectedRange,
  {
    title: 'Рефакторинг auth модуля',
    type: 'refactoring',
    priority: 'high',
    tags: ['security', 'auth']
  }
);
```

#### Связь с Roadmap
```javascript
await client.linkToRoadmap(document, range, 'phase-4-auth');
```

#### Code Annotations
```javascript
// Добавить аннотацию
await client.addCodeAnnotation(document, range, {
  type: 'note',
  content: 'Важно: проверить производительность',
  author: 'developer'
});

// Получить аннотации документа
const annotations = await client.getDocumentAnnotations(uri);
```

## Конфигурация

```javascript
const client = new ClaudeVSCodeClient({
  // Connection
  port: 16100,                    // TCP порт (опционально)
  host: 'localhost',              // Хост для TCP
  socketPath: '/custom/path',     // Путь к Unix/Windows сокету
  
  // Performance
  cacheTimeout: 30000,            // Таймаут кэша completion (ms)
  
  // Workspace
  rootUri: 'file:///workspace',
  workspaceFolders: [
    { uri: 'file:///workspace', name: 'project' }
  ]
});
```

## Использование

### Базовое подключение

```javascript
import { ClaudeVSCodeClient } from './src/clients/claude/ide.js';

const client = new ClaudeVSCodeClient({
  port: 16100
});

// Инициализация
await client.initialize();

// Открыть документ
await client.openDocument(
  'file:///project/src/app.js',
  'javascript',
  1,
  'const app = express();'
);

// Получить completion
const completions = await client.inlineCompletion(
  { uri: 'file:///project/src/app.js', languageId: 'javascript' },
  { line: 0, character: 21 }
);

// Закрыть документ
await client.closeDocument('file:///project/src/app.js');

// Отключение
await client.disconnect();
```

### Обработка событий

```javascript
// Диагностики
client.on('diagnostics', ({ uri, diagnostics }) => {
  console.log(`Diagnostics for ${uri}:`, diagnostics);
});

// Прогресс
client.on('progress', (params) => {
  console.log(`Progress: ${params.token} - ${params.value.kind}`);
});

// Уведомления
client.onNotification('window/showMessage', (params) => {
  console.log(`Message: ${params.message}`);
});
```

## Протокол

### LSP Message Types

Клиент поддерживает все стандартные LSP методы:

| Метод | Описание |
|-------|----------|
| `initialize` | Инициализация сессии |
| `textDocument/completion` | Автодополнение |
| `textDocument/hover` | Hover информация |
| `textDocument/signatureHelp` | Подсказки сигнатур |
| `textDocument/definition` | Переход к определению |
| `textDocument/references` | Поиск ссылок |
| `textDocument/codeAction` | Код действия |
| `textDocument/formatting` | Форматирование |
| `textDocument/rename` | Переименование |

### CogniMesh-специфичные методы

| Метод | Описание |
|-------|----------|
| `cognimesh/createTask` | Создание задачи из кода |
| `cognimesh/linkRoadmap` | Связь с roadmap node |
| `cognimesh/codeAnnotation` | Управление аннотациями |
| `cognimesh/extractContext` | Извлечение контекста |

## Совместимость

### VSCode Extensions
- Anthropic Claude for VSCode
- Kimi Code
- CogniMesh Extension

### Языки
- JavaScript/TypeScript
- Python
- Java
- Go
- Rust
- C/C++
- И многие другие (через LSP)

## Legacy Support

Для обратной совместимости доступен `ClaudeIdeClient`:

```javascript
import { ClaudeIdeClient } from './src/clients/claude/ide.js';

// Deprecated: используйте ClaudeVSCodeClient
const client = new ClaudeIdeClient({});
```

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     VSCode Extension                        │
│                   (Anthropic Sonnet 4.6)                    │
└───────────────────────────────┬─────────────────────────────┘
                                │ LSP Protocol (JSON-RPC)
                                │ Unix/TCP Socket
┌───────────────────────────────▼─────────────────────────────┐
│                   ClaudeVSCodeClient                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ LSP Protocol│  │ IDE Features│  │ CogniMesh Integration│  │
│  │ Handler     │  │ Manager     │  │ Manager              │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└───────────────────────────────┬─────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                    CogniMeshBIOS                            │
│              (Agent Orchestration Layer)                    │
└─────────────────────────────────────────────────────────────┘
```

## Тестирование

```bash
# Запуск тестов
node --test tests/unit/claude/vscode-client.test.js

# Все тесты Claude
node --test tests/unit/claude/*.test.js
```

## Roadmap

- [x] LSP Protocol Support
- [x] Inline Completion
- [x] Code Actions
- [x] Refactoring
- [x] Diagnostics
- [x] Symbol Navigation
- [x] Task/Roadmap Integration
- [x] Code Annotations
- [ ] Semantic Tokens
- [ ] Inlay Hints
- [ ] Call Hierarchy
- [ ] Type Hierarchy
