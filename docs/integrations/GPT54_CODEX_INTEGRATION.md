# GPT 5.4 Codex CLI Integration

## Обзор

Интеграция GPT 5.4 Codex CLI для CogniMesh Phase 4. Предоставляет расширенные возможности анализа проектов, batch-обработки и автоматизации рабочих процессов.

## Архитектура

```
src/clients/codex/
├── cli.js          # GPT54CodexCLIClient - основной клиент
├── index.js        # Экспорты клиентов Codex
├── copilot.js      # GitHub Copilot интеграция
└── cursor.js       # Cursor IDE интеграция
```

## Класс GPT54CodexCLIClient

### Конструктор

```javascript
const client = new GPT54CodexCLIClient({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-5.4-codex',
  reasoningModel: 'o4-mini',
  projectRoot: './my-project',
  enableReasoning: true,
  autoApprove: false,
  maxBatchSize: 50,
  timeout: 300000
});
```

### Основные методы

#### `async initialize()`
Инициализация клиента и проверка подключения.

```javascript
await client.initialize();
// Returns: { success: true, message: '...', capabilities: {...} }
```

#### `async send(message, options)`
Отправка сообщения в Codex.

```javascript
const response = await client.send(
  { content: "Analyze this code" },
  { 
    model: 'gpt-5.4-codex',
    reasoning: true,
    maxTokens: 8192 
  }
);
```

#### `async projectAnalyze(path, options)`
Анализ всего проекта.

```javascript
const result = await client.projectAnalyze('./src', {
  quick: false,        // Полный анализ
  deep: true,          // Использовать reasoning model
  exclude: ['**/node_modules/**']
});

// Returns:
// {
//   success: true,
//   path: './src',
//   structure: { files: [...], stats: {...} },
//   analysis: { sampleSize, totalFiles, analysis, reasoning },
//   insights: { recommendations, metrics, summary },
//   summary: {...},
//   recommendations: [...]
// }
```

#### `async batchRefactor(files, operation, options)`
Batch-рефакторинг файлов.

```javascript
const result = await client.batchRefactor(
  ['./src/file1.js', './src/file2.js'],
  {
    description: "Convert to TypeScript",
    type: 'refactor',
    instructions: "Add type annotations"
  },
  {
    batchSize: 10,
    delay: 1000,
    dryRun: false        // true = показать изменения без применения
  }
);

// Returns:
// {
//   success: true,
//   batchId: 'batch-...',
//   total: 100,
//   processed: 98,
//   errors: 2,
//   results: [...],
//   errorDetails: [...]
// }
```

#### `async generateArchitecture(spec, options)`
Генерация архитектуры из спецификации.

```javascript
const result = await client.generateArchitecture({
  description: "E-commerce platform with microservices",
  constraints: "Must use Node.js and PostgreSQL",
  preferences: "Serverless deployment"
}, {
  outputPath: './architecture'
});

// Returns:
// {
//   success: true,
//   architecture: {...},
//   files: ['ARCHITECTURE.md', 'components.json'],
//   components: [...],
//   diagrams: [...],
//   generatedAt: '2026-03-23T...'
// }
```

#### `async optimizeCodebase(path, options)`
Оптимизация кодовой базы.

```javascript
const result = await client.optimizeCodebase('./src', {
  autoApply: false,      // true = применить автоматически
  targets: ['performance', 'security', 'quality']
});

// Returns:
// {
//   success: true,
//   path: './src',
//   analysis: {...},
//   targets: [...],
//   plan: {...},
//   applied: [],
//   metrics: {
//     filesAnalyzed: 150,
//     optimizationsIdentified: 23,
//     optimizationsApplied: 0
//   }
// }
```

#### `async runTests(options)`
Генерация и запуск тестов.

```javascript
const result = await client.runTests({
  testType: 'unit',      // unit|integration|e2e
  coverage: true,
  path: './src'
});
```

#### `async generateDocumentation(options)`
Генерация документации.

```javascript
const result = await client.generateDocumentation({
  format: 'markdown',    // markdown|html|json
  sections: ['api', 'guide'],
  audience: 'developers'
});
```

#### `getCapabilities()`
Получение возможностей клиента.

```javascript
const caps = client.getCapabilities();
// Returns:
// {
//   provider: 'codex',
//   version: '5.4',
//   contextWindow: 128000,
//   maxOutputTokens: 8192,
//   features: ['completion', 'edit', 'chat', 'code_generation', ...],
//   models: ['gpt-5.4-codex', 'gpt-5.4', 'o4-mini', 'o4-mini-high'],
//   languages: ['javascript', 'typescript', 'python', ...]
// }
```

### События

Клиент расширяет EventEmitter и генерирует события:

```javascript
client.on('ready', () => console.log('Client ready'));
client.on('project:analyze:start', ({ path }) => console.log(`Analyzing ${path}`));
client.on('project:analyze:complete', ({ path, files }) => console.log(`Analyzed ${files} files`));
client.on('batch:start', ({ batchId, total }) => console.log(`Batch ${batchId}: ${total} files`));
client.on('batch:progress', ({ percentage, processed, total }) => {
  console.log(`Progress: ${percentage}%`);
});
client.on('batch:complete', ({ batchId, processed, errors }) => {
  console.log(`Complete: ${processed} processed, ${errors} errors`);
});
```

## CLI Команды

### Интерактивный режим (REPL)

```bash
node src/bios/cli.js -i
# или
bios interactive
```

Доступные команды в REPL:

```
bios> codex status                    # Проверить статус клиента
bios> codex analyze ./src             # Анализ проекта
bios> codex refactor "*.js" "Convert to TypeScript"  # Batch рефакторинг
bios> codex generate "E-commerce API" # Генерация архитектуры
bios> codex optimize ./src            # Оптимизация
```

### Batch режим

```bash
# Анализ проекта
bios codex analyze ./my-project --deep

# Batch рефакторинг
bios codex refactor "src/**/*.js" --instruction "Add JSDoc comments" --dry-run

# Генерация архитектуры
bios codex generate "Microservices API with authentication" -o ./architecture

# Оптимизация кодовой базы
bios codex optimize ./src --target performance,security

# Генерация тестов
bios codex test ./src --type unit --coverage

# Генерация документации
bios codex docs ./src -f markdown -o API.md

# Проверка статуса
bios codex status
```

### С использованием CogniMesh CLI

```bash
# Полный анализ с reasoning
node src/bios/cli.js codex analyze ./src --deep

# Быстрый анализ
node src/bios/cli.js codex analyze ./src --quick

# Batch рефакторинг с сохранением в файл
node src/bios/cli.js codex refactor "src/**/*.js" \
  --instruction "Convert to TypeScript" \
  --batch-size 5 \
  --delay 2000 \
  --dry-run

# Генерация архитектуры
node src/bios/cli.js codex generate "E-commerce platform" \
  --language typescript \
  --framework nestjs \
  --output ./architecture

# Оптимизация
node src/bios/cli.js codex optimize ./src --auto-apply
```

## Примеры использования

### Пример 1: Анализ проекта

```javascript
import { GPT54CodexCLIClient } from './src/clients/codex/cli.js';

const client = new GPT54CodexCLIClient({
  apiKey: process.env.OPENAI_API_KEY,
  enableReasoning: true
});

await client.initialize();

const result = await client.projectAnalyze('./src', {
  quick: false,
  deep: true
});

console.log(`Analyzed ${result.structure.stats.totalFiles} files`);
console.log('Languages:', result.structure.stats.languages);
console.log('Recommendations:', result.recommendations);

await client.disconnect();
```

### Пример 2: Batch рефакторинг

```javascript
import { glob } from 'glob';

const files = await glob('src/**/*.js');

const client = new GPT54CodexCLIClient();
await client.initialize();

// Progress tracking
client.on('batch:progress', ({ percentage }) => {
  process.stdout.write(`\rProgress: ${percentage}%`);
});

const result = await client.batchRefactor(
  files,
  {
    description: "Add error handling",
    instructions: "Wrap async functions in try-catch blocks"
  },
  {
    batchSize: 10,
    delay: 1000,
    dryRun: true  // Preview changes
  }
);

console.log(`\nProcessed: ${result.processed}/${result.total}`);
console.log(`Errors: ${result.errors}`);

await client.disconnect();
```

### Пример 3: Генерация архитектуры

```javascript
const client = new GPT54CodexCLIClient();
await client.initialize();

const result = await client.generateArchitecture({
  description: `
    Real-time chat application with:
    - WebSocket support
    - Message persistence
    - User authentication
    - File attachments
  `,
  constraints: "Use Node.js, Redis, PostgreSQL",
  preferences: "Microservices architecture"
}, {
  outputPath: './generated-architecture'
});

console.log(`Generated ${result.components.length} components`);
console.log('Files:', result.files);

await client.disconnect();
```

## Интеграция с BIOS

Клиент полностью интегрирован с BIOS CLI:

```javascript
// src/bios/cli.js
import { GPT54CodexCLIClient } from '../clients/codex/cli.js';

// Добавлены команды:
// - bios codex analyze [path]
// - bios codex refactor <pattern>
// - bios codex generate <spec>
// - bios codex optimize [path]
// - bios codex test [path]
// - bios codex docs [path]
// - bios codex status
```

## Конфигурация

### Переменные окружения

```bash
# Обязательная
export OPENAI_API_KEY="sk-..."

# Опциональные
export CODEX_API_KEY="sk-..."
export CODEX_MODEL="gpt-5.4-codex"
export CODEX_REASONING_MODEL="o4-mini"
export CODEX_TIMEOUT="300000"
export CODEX_MAX_BATCH_SIZE="50"
```

### Конфигурационный файл

```json
{
  "codex": {
    "model": "gpt-5.4-codex",
    "reasoningModel": "o4-mini",
    "enableReasoning": true,
    "autoApprove": false,
    "maxBatchSize": 50,
    "timeout": 300000,
    "projectRoot": ".",
    "projectLanguage": "javascript"
  }
}
```

## Модели

| Модель | Context Window | Max Output | Лучше для |
|--------|---------------|------------|-----------|
| gpt-5.4-codex | 128K | 8192 | Code generation, analysis |
| gpt-5.4 | 128K | 4096 | General tasks |
| o4-mini | 200K | 8192 | Complex reasoning |
| o4-mini-high | 200K | 8192 | Deep analysis |

## Troubleshooting

### Ошибка: API key not found
```bash
export OPENAI_API_KEY="your-key-here"
```

### Ошибка: CLI not found
```bash
# Установка Codex CLI
npm install -g @openai/codex
```

### Ошибка: Timeout
```javascript
const client = new GPT54CodexCLIClient({
  timeout: 600000  // 10 минут для больших проектов
});
```

### Ошибка: Rate limit
```javascript
const result = await client.batchRefactor(files, operation, {
  batchSize: 5,   // Меньше файлов за раз
  delay: 5000     // Большая задержка между batch
});
```

## Безопасность

- Никогда не сохраняйте API ключи в коде
- Используйте `--dry-run` перед применением изменений
- Проверяйте сгенерированный код перед деплоем
- Используйте `.gitignore` для исключения временных файлов

## Лицензия

MIT License - см. LICENSE файл в корне проекта.
