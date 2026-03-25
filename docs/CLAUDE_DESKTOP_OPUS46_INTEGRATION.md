# Claude Desktop Integration - Anthropic Opus 4.6

> **All models are accessed through flat-rate subscriptions. No API billing applies.**

## Обзор

Интеграция с Claude Desktop приложением для работы с моделью **Anthropic Opus 4.6** с поддержкой **1 миллиона токенов контекста**.

## Возможности

### Основные функции

- ✅ **1M Context Window** - работа с контекстом до 1,000,000 токенов
- ✅ **Session-based Authentication** - безопасная аутентификация сессий
- ✅ **WebSocket Connection** - реальное время через `ws://localhost:3456`
- ✅ **Streaming Responses** - потоковая передача ответов
- ✅ **File Upload** - загрузка файлов для анализа
- ✅ **Conversation History** - управление историей диалогов
- ✅ **Auto-reconnect** - автоматическое восстановление соединения

### Coding Tasks

- ✅ **Code Completion** - автодополнение кода
- ✅ **Code Review** - ревью кода с оценкой
- ✅ **Refactoring** - рефакторинг с объяснением
- ✅ **Debug Assistance** - помощь в отладке
- ✅ **Architecture Design** - проектирование архитектуры

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    CogniMesh System                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐      ┌──────────────────────────┐    │
│  │  Client Gateway  │◄────►│  ClaudeDesktopClient     │    │
│  │  (bios/)         │      │  (src/clients/claude/)   │    │
│  └──────────────────┘      └──────────────────────────┘    │
│           │                            │                    │
│           │                    WebSocket                    │
│           │                    (ws://localhost:3456)        │
│           │                            │                    │
│           │                    ┌───────────────┐            │
│           │                    │ Claude Desktop│            │
│           │                    │  Application  │            │
│           │                    └───────────────┘            │
│           │                            │                    │
│           └────────────────────────────┘                    │
│                  Anthropic Opus 4.6 API                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Установка и настройка

### Требования

1. Claude Desktop приложение установлено и запущено
2. API доступен на `localhost:3456`
3. Node.js 18+

### Настройка клиента

```javascript
import { ClaudeDesktopClient } from './src/clients/claude/desktop.js';

const client = new ClaudeDesktopClient({
  apiHost: 'localhost',          // Хост API
  apiPort: 3456,                 // Порт API
  autoReconnect: true,           // Автореконнект
  reconnectInterval: 5000,       // Интервал попыток (ms)
  maxReconnectAttempts: 10,      // Макс. попыток
  maxContextTokens: 1000000      // Макс. токенов контекста
});
```

## Использование

### Базовое использование

```javascript
import { ClaudeDesktopClient } from './src/clients/claude/desktop.js';

const client = new ClaudeDesktopClient();

// Инициализация
await client.initialize();

// Отправка сообщения
const response = await client.send({
  content: 'Hello Claude!'
});

console.log(response.content);

// Отключение
await client.disconnect();
```

### Streaming

```javascript
// Потоковая передача ответа
await client.stream(
  { content: 'Write a story...' },
  (chunk) => {
    process.stdout.write(chunk); // Построчный вывод
  }
);
```

### Загрузка файлов

```javascript
// Загрузка файла
const result = await client.uploadFile('./path/to/file.js', {
  processImmediately: true,
  extractText: true
});

// Запрос об анализе файла
const analysis = await client.send({
  content: 'Please analyze the uploaded file.'
});
```

### Coding Tasks

#### Code Completion

```javascript
const result = await client.executeCodingTask('codeCompletion', {
  code: `function fibonacci(n) {
  // cursor here
}`,
  language: 'javascript',
  cursorPosition: 35
});
```

#### Code Review

```javascript
const review = await client.executeCodingTask('codeReview', {
  code: 'const x = 1;',
  language: 'javascript',
  focusAreas: ['performance', 'security', 'best practices']
});
```

#### Refactoring

```javascript
const refactored = await client.executeCodingTask('refactoring', {
  code: '// Your code here',
  language: 'javascript',
  goals: ['Apply SOLID principles', 'Improve readability']
});
```

#### Debug Assistance

```javascript
const debug = await client.executeCodingTask('debugAssistance', {
  code: '// Code with bug',
  language: 'javascript',
  error: 'TypeError: Cannot read property...',
  stackTrace: '...'
});
```

#### Architecture Design

```javascript
const architecture = await client.executeCodingTask('architectureDesign', {
  requirements: [
    'Real-time chat application',
    'Support 10,000 users',
    'End-to-end encryption'
  ],
  techStack: 'Node.js, Redis, PostgreSQL',
  scale: '10k concurrent users'
});
```

### История диалогов

```javascript
// Получение истории с сервера
const history = await client.getConversationHistory({
  limit: 100,
  offset: 0
});

// Получение локальной истории
const localHistory = client.getLocalHistory();

// Очистка истории
await client.clearHistory(true); // true = также на сервере
```

### Использование через Client Gateway

```javascript
import { ClientGateway } from './src/bios/client-gateway.js';

const gateway = new ClientGateway({
  claude: {
    desktop: { apiPort: 3456 }
  }
});

await gateway.initialize();

// Отправка сообщения
const response = await gateway.sendToClient('claude', 'Hello!', {
  mode: 'desktop'
});

// Выполнение coding task
const result = await gateway.executeCodingTask('codeReview', {
  code: 'const x = 1;',
  language: 'javascript'
});

// Streaming через gateway
await gateway.streamFromClient('claude',
  { content: 'Write code...' },
  (chunk) => process.stdout.write(chunk)
);

// Загрузка файла
await gateway.uploadFileToClient('claude', './file.js');

// Получение истории
const history = await gateway.getConversationHistory('claude');

await gateway.shutdown();
```

## API Reference

### ClaudeDesktopClient

#### Конструктор

```javascript
new ClaudeDesktopClient(config)
```

**Config options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiHost` | string | 'localhost' | Хост API |
| `apiPort` | number | 3456 | Порт API |
| `wsUrl` | string | `ws://host:port` | WebSocket URL |
| `sessionId` | string | null | ID сессии |
| `sessionToken` | string | null | Токен сессии |
| `conversationId` | string | null | ID диалога |
| `autoReconnect` | boolean | true | Автореконнект |
| `reconnectInterval` | number | 5000 | Интервал попыток (ms) |
| `maxReconnectAttempts` | number | 10 | Макс. попыток |
| `maxContextTokens` | number | 1000000 | Макс. токенов |

#### Методы

##### `async initialize()`
Инициализация соединения и аутентификация.

##### `async send(message, options)`
Отправка сообщения.

**Parameters:**
- `message` - `{ content: string }`
- `options` - `{ maxTokens?, temperature?, streaming?, ... }`

##### `async execute(task, options)`
Выполнение задачи.

**Parameters:**
- `task` - `{ type, description, code, files, ... }`
- `options` - Execution options

##### `async stream(request, callback)`
Потоковая передача ответа.

**Parameters:**
- `request` - Request object
- `callback` - `(chunk) => void`

##### `async uploadFile(filePath, options)`
Загрузка файла.

**Parameters:**
- `filePath` - Path to file
- `options` - Upload options

##### `async getConversationHistory(options)`
Получение истории диалога.

##### `executeCodingTask(taskType, params)`
Выполнение coding task.

**Task types:**
- `codeCompletion`
- `codeReview`
- `refactoring`
- `debugAssistance`
- `architectureDesign`

##### `getCapabilities()`
Получение возможностей клиента.

##### `getContextUsage()`
Получение статистики использования контекста.

##### `async ping()`
Проверка соединения.

##### `async reconnect()`
Переподключение.

##### `async disconnect()`
Отключение.

### Events

```javascript
client.on('ready', () => {});
client.on('authenticated', ({ sessionId }) => {});
client.on('conversationCreated', ({ conversationId }) => {});
client.on('disconnected', ({ code, reason }) => {});
client.on('reconnecting', () => {});
client.on('reconnected', () => {});
client.on('error', (error) => {});
client.on('health', (health) => {});
client.on('stream', (chunk) => {});
client.on('tokenUpdate', ({ tokens }) => {});
```

## Конфигурация BIOS Gateway

```javascript
// src/bios/client-gateway.js

const gateway = new ClientGateway({
  claude: {
    desktop: {
      apiHost: 'localhost',
      apiPort: 3456,
      autoReconnect: true,
      maxReconnectAttempts: 10
    },
    cli: false,  // Отключить CLI клиент
    ide: false   // Отключить IDE клиент
  },
  autoReconnect: true,
  healthCheckInterval: 30000
});
```

## Тестирование

```bash
# Запуск тестов
npm test -- tests/clients/claude-desktop.test.js

# Запуск примеров
node examples/claude-desktop-usage.js
```

## Troubleshooting

### Ошибка подключения

```
Claude Desktop not running: connect ECONNREFUSED 127.0.0.1:3456
```

**Решение:** Убедитесь, что Claude Desktop запущен и API доступен.

### Таймаут аутентификации

```
Authentication timeout
```

**Решение:** Проверьте настройки Claude Desktop, возможно требуется включить API.

### Ошибка WebSocket

```
WebSocket connection timeout
```

**Решение:** Проверьте, что WebSocket сервер запущен на указанном порту.

## Сравнение с другими клиентами

| Feature | Desktop | CLI | IDE |
|---------|---------|-----|-----|
| Context Window | 1M | 1M | 1M |
| WebSocket | ✅ | ❌ | ❌ |
| Streaming | ✅ | ❌ | ❌ |
| File Upload | ✅ | ⚠️ | ⚠️ |
| Session Mgmt | ✅ | ❌ | ❌ |
| Auto-reconnect | ✅ | ❌ | ❌ |
| Coding Tasks | ✅ | ✅ | ✅ |

## Changelog

### v4.6.0 (Current)
- Anthropic Opus 4.6 support
- 1M context window
- Session-based authentication
- WebSocket streaming
- File upload support
- Coding tasks integration
- Auto-reconnect

## Лицензия

MIT License - часть CogniMesh проекта.
