# OpenAI Codex API Specification

## Исследование выполнено: 2026-03-23

---

## 1. GPT-5.4 Codex

### Обзор
GPT-5.4 — флагманская reasoning модель OpenAI, объединившая возможности GPT-5.2 XHIGH (глубокий анализ, архитектура, документация) и GPT-5.3 Codex (генерация кода, исправление багов, рефакторинг). Это первая основная reasoning модель, включающая передовые coding-возможности Codex.

### Ключевые характеристики
| Параметр | Значение |
|----------|----------|
| Контекстное окно | 1,050,000 tokens (1M) |
| Макс. output tokens | 128,000 |
| Knowledge cutoff | Aug 31, 2025 |
| Поддержка изображений | Да |
| Computer Use | Нативная поддержка |

### API Endpoints

#### Chat Completions API (Legacy)
```http
POST https://api.openai.com/v1/chat/completions
```

**Request:**
```json
{
  "model": "gpt-5.4",
  "messages": [
    {"role": "system", "content": "You are a helpful coding assistant."},
    {"role": "user", "content": "Refactor this function to use async/await"}
  ],
  "reasoning_effort": "high",
  "max_completion_tokens": 128000,
  "stream": true
}
```

#### Responses API (Recommended)
```http
POST https://api.openai.com/v1/responses
```

**Request:**
```json
{
  "model": "gpt-5.4",
  "input": "Analyze this codebase and suggest improvements",
  "tools": [
    {"type": "code_interpreter"},
    {"type": "web_search"},
    {"type": "file_search"}
  ],
  "reasoning": {"effort": "high"},
  "max_output_tokens": 128000
}
```

### Reasoning Effort Settings
GPT-5.4 поддерживает 5 уровней reasoning:
- `none` — Без reasoning (быстрее, дешевле)
- `low` — Минимальный reasoning
- `medium` — Средний уровень (по умолчанию)
- `high` — Высокий уровень
- `xhigh` — Максимальный reasoning (глубокий анализ)

### Streaming
```python
from openai import OpenAI

client = OpenAI()

response = client.chat.completions.create(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "Generate code"}],
    stream=True,
    reasoning_effort="high"
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### Tool Use
GPT-5.4 поддерживает встроенные инструменты:
- `web_search` — Поиск в интернете
- `file_search` — Поиск по файлам (RAG)
- `code_interpreter` — Интерпретация Python кода
- `computer_use` — Управление компьютером
- `mcp` — Model Context Protocol

**Пример function calling:**
```json
{
  "model": "gpt-5.4",
  "messages": [{"role": "user", "content": "Get weather in NYC"}],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {"type": "string"},
          "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
        }
      }
    }
  }]
}
```

---

## 2. GPT-5.3 Codex

### Обзор
GPT-5.3 Codex — специализированная модель для агентского программирования. Оптимизирована для задач кодирования в средах типа Codex, Cursor, Replit.

### Ключевые характеристики
| Параметр | Значение |
|----------|----------|
| Контекстное окно | 400,000 tokens |
| Макс. output tokens | 128,000 |
| Knowledge cutoff | Aug 31, 2025 |
| Поддержка изображений | Да |
| Reasoning effort | low, medium, high, xhigh |

### Model IDs
- `gpt-5.3-codex` — Основная модель
- `gpt-5.3-codex-latest` — Последняя версия

### Отличия от GPT-5.4
| Capability | GPT-5.3 Codex | GPT-5.4 |
|------------|---------------|---------|
| Контекст | 400K | 1,050K |
| Computer Use | ❌ | ✅ |
| Tool Search | ❌ | ✅ |
| SWE-bench Verified | 75.2% | ~80% |
| Скорость | Очень быстрая | Средняя |
| Terminal-Bench | 77.3% | 75.1% |

### Когда использовать GPT-5.3 Codex
- Чистое программирование без агентских задач
- Бюджетные ограничения (на 30% дешевле)
- Высокая скорость генерации кода
- Терминальное программирование

---

## 3. Pricing (Март 2026)

### GPT-5.4 Family
| Модель | Input | Cached Input | Output | Context |
|--------|-------|--------------|--------|---------|
| GPT-5.4 | $2.50/1M | $0.25/1M | $15.00/1M | 1M |
| GPT-5.4 pro | $30.00/1M | — | $180.00/1M | 1M |
| GPT-5.4 mini | $0.75/1M | — | $4.50/1M | 400K |
| GPT-5.4 nano | $0.20/1M | — | $1.25/1M | 400K |

### GPT-5.3 Codex
| Модель | Input | Cached Input | Output | Context |
|--------|-------|--------------|--------|---------|
| GPT-5.3 Codex | $1.75/1M | $0.175/1M | $14.00/1M | 400K |

### Long Context Pricing (GPT-5.4)
Для контекста >272K tokens:
- Input: 2x стандартная цена
- Output: 1.5x стандартная цена

### Batch & Flex Pricing
- Batch API: 50% от стандартной цены
- Flex: 50% от стандартной цены
- Priority: 2x стандартная цена

### Regional Processing
+10% uplift для GPT-5.4 и GPT-5.4 pro

---

## 4. OpenAI Assistants API

### ⚠️ Важно: Deprecation Notice
Assistants API объявлена устаревшей и будет полностью отключена **26 августа 2026**. OpenAI рекомендует мигрировать на Responses API.

### Core Concepts

#### Assistant
```json
{
  "id": "asst_abc123",
  "object": "assistant",
  "name": "Code Assistant",
  "instructions": "You are a helpful coding assistant.",
  "model": "gpt-5.4",
  "tools": [
    {"type": "code_interpreter"},
    {"type": "file_search"}
  ]
}
```

#### Thread
Контейнер для сообщений (до 100,000 сообщений).

```http
POST https://api.openai.com/v1/threads
```

#### Run
Выполнение ассистента на треде.

```http
POST https://api.openai.com/v1/threads/{thread_id}/runs
```

**States:**
- `queued` — В очереди
- `in_progress` — Выполняется
- `completed` — Завершено
- `failed` — Ошибка
- `cancelled` — Отменено
- `expired` — Истекло время
- `requires_action` — Требуется действие

### Tools

#### Code Interpreter
```json
{
  "type": "code_interpreter"
}
```
- Цена: $0.03 за сессию (1 час)
- Выполняет Python код в sandbox
- Генерирует файлы (изображения, CSV, etc.)

#### File Search
```json
{
  "type": "file_search"
}
```
- Цена: $0.10/GB/day хранения (первый GB бесплатно)
- Использует Vector Stores
- Лимит: 10,000 файлов на vector store

#### Function Calling
```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get weather for location",
    "parameters": {...}
  }
}
```

### File Handling

#### Upload File
```http
POST https://api.openai.com/v1/files
Content-Type: multipart/form-data
```

**Purposes:**
- `assistants` — Для Assistants API
- `batch` — Для Batch API
- `fine-tune` — Для файн-тюнинга
- `vision` — Для vision моделей

### Rate Limits (Assistants API)
| Method | Limit |
|--------|-------|
| GET | 1000 RPM |
| POST | 300 RPM |
| POST /runs | 200 RPM |
| DELETE | 300 RPM |

---

## 5. Responses API (Рекомендуемый подход)

### Почему Responses API
- ✅ Stateful conversations (автоматическое управление контекстом)
- ✅ Сохранение reasoning state между вызовами
- ✅ Встроенные инструменты (web_search, file_search, code_interpreter)
- ✅ 40-80% лучшее использование кэша
- ✅ Мультимодальность из коробки

### Endpoints
```http
POST https://api.openai.com/v1/responses
GET  https://api.openai.com/v1/responses/{response_id}
POST https://api.openai.com/v1/responses/{response_id}/continue
```

### Request Structure
```json
{
  "model": "gpt-5.4",
  "input": [
    {"role": "user", "content": "Analyze this code"},
    {"role": "assistant", "content": "I'll analyze it..."},
    {"role": "user", "content": "Now optimize it"}
  ],
  "instructions": "You are a senior developer",
  "tools": [
    {"type": "code_interpreter"}
  ],
  "reasoning": {
    "effort": "high"
  },
  "max_output_tokens": 128000,
  "store": true
}
```

### Streaming Events
```javascript
event: response.created
event: response.in_progress
event: response.output_item.added
event: response.content_part.added
event: response.text.delta
event: response.tool_call.done
event: response.completed
```

---

## 6. Rate Limits по Tiers

| Tier | RPM | TPM | Batch Queue |
|------|-----|-----|-------------|
| Free | Not supported | — | — |
| Tier 1 | 500 | 500,000 | 1,500,000 |
| Tier 2 | 5,000 | 1,000,000 | 3,000,000 |
| Tier 3 | 5,000 | 2,000,000 | 100,000,000 |
| Tier 4 | 10,000 | 4,000,000 | 200,000,000 |
| Tier 5 | 15,000 | 40,000,000 | 15,000,000,000 |

---

## 7. Migration Strategy

### От Chat Completions к Responses
```python
# Старый подход (Chat Completions)
response = client.chat.completions.create(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "Hello"}]
)
print(response.choices[0].message.content)

# Новый подход (Responses)
response = client.responses.create(
    model="gpt-5.4",
    input="Hello"
)
print(response.output_text)
```

### От Assistants API к Responses
- Использовать `store: true` для сохранения контекста
- `previous_response_id` для продолжения диалога
- Встроенные tools вместо external tools

---

## 8. Рекомендации для CogniMesh

### Model Selection Matrix
| Сценарий | Рекомендуемая модель | Причина |
|----------|---------------------|---------|
| Сложное планирование архитектуры | GPT-5.4 xhigh | Глубокий reasoning |
| Быстрая генерация кода | GPT-5.3 Codex | Скорость + стоимость |
| Агентские workflow | GPT-5.4 | Tool use + computer use |
| Длительные сессии (>272K) | GPT-5.4 | 1M контекст |
| Бюджетные задачи | GPT-5.4 mini/nano | Низкая цена |
| Fallback | GPT-5.3 Codex | Надежность + скорость |

### Integration Checklist
- [ ] Реализовать поддержку Responses API
- [ ] Настроить reasoning effort levels
- [ ] Реализовать streaming с обработкой reasoning tokens
- [ ] Настроить tool use (function calling)
- [ ] Реализовать graceful fallback на GPT-5.3 Codex
- [ ] Настроить кэширование (cached input pricing)
- [ ] Мониторинг token usage и cost
- [ ] Обработка long context (>272K) с учетом pricing

---

## 9. Полезные ссылки

- [OpenAI API Documentation](https://developers.openai.com/api/docs)
- [GPT-5.4 Model Guide](https://developers.openai.com/api/docs/models/gpt-5.4)
- [GPT-5.3 Codex Model Guide](https://developers.openai.com/api/docs/models/gpt-5.3-codex)
- [Responses API Blog](https://developers.openai.com/blog/responses-api/)
- [Assistants API Deprecation](https://help.openai.com/articles/8550641-assistants-api-v2-faq)
- [OpenAI Pricing](https://openai.com/api/pricing/)

---

*Исследование подготовлено Research Agent #3 для проекта CogniMesh*
