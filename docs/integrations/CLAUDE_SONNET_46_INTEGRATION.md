# Claude Sonnet 4.6 CLI Integration

> **All models are accessed through flat-rate subscriptions. No API billing applies.**

## Overview

Полная интеграция Anthropic Claude Sonnet 4.6 с CogniMesh BIOS CLI.

## Files Created/Modified

### 1. `src/clients/claude/cli.js` (Updated)
- **BaseClient extension**: Полная интеграция с базовым клиентом
- **API + CLI support**: Поддержка как API, так и CLI режимов
- **200K context window**: Полный доступ к контексту Sonnet 4.6
- **Coding workflows**:
  - `codeAnalyze(filePath)` - Анализ кода
  - `codeGenerate(prompt, language)` - Генерация кода
  - `codeReview(filePath)` - Code review
  - `explainCode(filePath)` - Объяснение кода
  - `analyzeMultipleFiles(filePaths)` - Мульти-файловый анализ
  - `generateDiff(original, modified)` - Генерация diff
- **Project context**: Загрузка и использование контекста проекта
- **Interactive mode**: Интерактивная сессия чата
- **Batch processing**: Пакетная обработка задач
- **Git integration**: Автоматическое обнаружение git diff
- **Language detection**: Автоопределение 40+ языков программирования

### 2. `src/bios/cli.js` (Updated)
Добавлены команды:
```
bios claude chat              # Интерактивный чат
bios claude analyze <file>    # Анализ файла
bios claude generate <prompt> # Генерация кода
bios claude review <file>     # Ревью кода
bios claude explain <file>    # Объяснение кода
bios claude batch --file <f>  # Пакетная обработка
bios claude status            # Статус клиента
```

### 3. `tests/clients/claude/cli.test.js` (Created)
- Unit tests для всех функций клиента
- Tests для language detection
- Tests для project context
- Tests для code operations
- Tests для status management

### 4. `examples/claude-batch-tasks.json` (Created)
Пример файла задач для batch processing.

### 5. `examples/claude-usage.md` (Created)
Документация по использованию с примерами.

## Features

### Interactive Mode
```bash
bios claude chat
```
- Conversation history
- Команды: `exit`, `clear`, `status`
- Поддержка streaming (через API)

### Code Analysis
```bash
bios claude analyze src/app.js --focus "security,performance"
```
- Структура и назначение
- Ключевые функции/классы
- Потенциальные проблемы
- Performance considerations
- Security concerns

### Code Generation
```bash
bios claude generate "Create Redis cache wrapper" --language typescript
```
- Clean, documented code
- Error handling
- Type hints/annotations
- Example usage

### Code Review
```bash
bios claude review src/auth.js --strict
```
- Git diff integration
- Bugs и logical errors
- Security vulnerabilities
- Performance bottlenecks
- Code style violations

### Code Explanation
```bash
bios claude explain src/algorithm.js --level beginner
```
- Уровни: beginner, intermediate, expert
- Ответы на конкретные вопросы
- Line-by-line breakdown

### Batch Processing
```bash
bios claude batch --file tasks.json --concurrency 2
```
- Concurrent task execution
- Rate limit protection
- Progress reporting
- Error handling per task

## Configuration

### Access Model

Claude Sonnet 4.6 is accessed through a subscription-backed plan. No per-token or metered API billing is required.

### Constructor Options
```javascript
const client = new ClaudeCliClient({
  model: 'claude-sonnet-4-6',  // или 'claude-opus-4'
  preferApi: true,              // API vs CLI
  baseURL: 'https://api.anthropic.com/v1'
});
```

## Supported Models
- `claude-sonnet-4-6` (default)
- `claude-opus-4`
- `claude-haiku-3-5`

## Capabilities
```javascript
{
  provider: 'claude',
  mode: 'cli',
  contextWindow: 200000,
  features: [
    'code_analysis',
    'code_generation',
    'code_review',
    'code_explanation',
    'file_operations',
    'command_execution',
    'interactive_mode',
    'batch_processing',
    'multi_file_analysis',
    'git_integration',
    'diff_generation'
  ],
  streaming: true,
  supportsFiles: true,
  supportsImages: true,
  supportsSystemPrompts: true
}
```

## Testing
```bash
# Run tests
npm test tests/clients/claude/cli.test.js
```

## Integration Status
- ✅ CLI Client implemented
- ✅ BIOS CLI integration
- ✅ Coding workflows
- ✅ Project context
- ✅ Interactive mode
- ✅ Batch processing
- ✅ Git integration
- ✅ Tests created
- ✅ Documentation created
