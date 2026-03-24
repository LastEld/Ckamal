# Kimi 2.5 API Спецификация для CogniMesh

> **Исследование:** Research Agent #2  
> **Дата:** 2026-03-23  
> **Источник:** platform.moonshot.cn/docs

---

## 1. Общая информация

### 1.1 Базовый URL
```
https://api.moonshot.cn/v1
```

### 1.2 Совместимость
- Полная совместимость с **OpenAI SDK** (Python ≥3.7.1, Node.js ≥18, openai≥1.0.0)
- Drop-in замена для OpenAI API

### 1.3 Базовая конфигурация
```python
from openai import OpenAI

client = OpenAI(
    api_key="$MOONSHOT_API_KEY",
    base_url="https://api.moonshot.cn/v1",
)
```

---

## 2. Доступные модели

### 2.1 Флагманская модель: kimi-k2.5
| Параметр | Значение |
|----------|----------|
| Контекст | **256,144 tokens (256K)** |
| Архитектура | Native Multimodal (MoE) |
| Вход | Текст + Изображения + Видео |
| Режимы | Thinking / Non-thinking |
| Цена input (cache miss) | ¥4.00 / 1M tokens |
| Цена input (cache hit) | ¥0.70 / 1M tokens |
| Цена output | ¥21.00 / 1M tokens |

### 2.2 Другие модели Kimi K2
| Модель | Контекст | Input | Output | Особенности |
|--------|----------|-------|--------|-------------|
| kimi-k2-0905-preview | 256K | ¥4.00 | ¥16.00 | Улучшенное Agentic Coding |
| kimi-k2-turbo-preview | 256K | ¥8.00 | ¥58.00 | **60-100 tokens/sec** |
| kimi-k2-thinking | 256K | ¥4.00 | ¥16.00 | Deep reasoning |
| kimi-k2-thinking-turbo | 256K | ¥8.00 | ¥58.00 | Быстрое рассуждение |
| kimi-k2-0711-preview | 128K | ¥4.00 | ¥16.00 | Базовая модель |

### 2.3 Legacy модели (Moonshot-v1)
| Модель | Контекст | Input | Output |
|--------|----------|-------|--------|
| moonshot-v1-8k | 8K | ¥2.00 | ¥10.00 |
| moonshot-v1-32k | 32K | ¥5.00 | ¥20.00 |
| moonshot-v1-128k | 128K | ¥10.00 | ¥30.00 |

### 2.4 Получение списка моделей
```python
GET https://api.moonshot.cn/v1/models

model_list = client.models.list()
for model in model_list.data:
    print(model.id)
```

---

## 3. Chat Completion API

### 3.1 Endpoint
```
POST https://api.moonshot.cn/v1/chat/completions
```

### 3.2 Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `model` | string | ✅ | ID модели (kimi-k2.5 и др.) |
| `messages` | array | ✅ | История сообщений |
| `max_completion_tokens` | int | ❌ | Макс. токенов в ответе |
| `temperature` | float | ❌ | Температура семплирования [0-1] |
| `top_p` | float | ❌ | Nucleus sampling |
| `n` | int | ❌ | Кол-во вариантов ответа |
| `stream` | bool | ❌ | Потоковая передача |
| `stream_options.include_usage` | bool | ❌ | Включить usage в stream |
| `response_format` | object | ❌ | `{"type": "json_object"}` |
| `tools` | array | ❌ | Определение инструментов |
| `tool_choice` | string | ❌ | "auto", "none", или конкретный tool |
| `thinking` | object | ❌ | Только для kimi-k2.5 |
| `prompt_cache_key` | string | ❌ | Ключ для кэширования |
| `safety_identifier` | string | ❌ | ID для safety tracking |
| `stop` | string/array | ❌ | Стоп-слова |

### 3.3 Параметры для kimi-k2.5 (особенности)

```json
{
  "thinking": {
    "type": "enabled"  // или "disabled"
  }
}
```

**Ограничения kimi-k2.5:**
- `temperature`: фиксирован 1.0 (thinking) или 0.6 (non-thinking)
- `top_p`: фиксирован 0.95
- `n`: фиксирован 1
- `presence_penalty`: фиксирован 0.0
- `frequency_penalty`: фиксирован 0.0

### 3.4 Формат сообщений

```json
{
  "messages": [
    {
      "role": "system",
      "content": "Ты Kimi, ИИ-ассистент от Moonshot AI..."
    },
    {
      "role": "user",
      "content": "Привет!"
    },
    {
      "role": "assistant",
      "content": "Привет! Чем могу помочь?"
    }
  ]
}
```

**Роли:** `system`, `user`, `assistant`, `tool`

### 3.5 Мультимодальный контент (Vision)

```python
messages=[
    {"role": "system", "content": "你是 Kimi。"},
    {
        "role": "user",
        "content": [
            {
                "type": "image_url",
                "image_url": {
                    "url": "data:image/jpeg;base64,{base64_image}"
                }
            },
            {
                "type": "text",
                "text": "Опиши это изображение"
            }
        ]
    }
]
```

**Поддерживаемые форматы изображений:**
- PNG, JPEG, WebP, GIF
- Base64 или `ms://{file_id}`
- Рекомендуемое разрешение: до 4K (4096×2160)

**Видео:**
- Форматы: MP4, MPEG, MOV, AVI, FLV, MPG, WebM, WMV, 3GPP
- Рекомендуемое разрешение: до 2K (2048×1080)

### 3.6 Формат ответа (Non-streaming)

```json
{
  "id": "cmpl-04ea926191a14749b7f2c7a48a68abc6",
  "object": "chat.completion",
  "created": 1698999496,
  "model": "kimi-k2.5",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Привет! 1+1=2"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 19,
    "completion_tokens": 21,
    "total_tokens": 40,
    "cached_tokens": 10
  }
}
```

### 3.7 Потоковая передача (Streaming)

```python
response = client.chat.completions.create(
    model="kimi-k2.5",
    messages=messages,
    stream=True,
    stream_options={"include_usage": True}
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

**Формат chunk:**
```
data: {"id":"...","object":"chat.completion.chunk","created":1698999575,"model":"kimi-k2.5","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}]}

data: [DONE]
```

---

## 4. Tool Use (Function Calling)

### 4.1 Определение инструментов

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "CodeRunner",
        "description": "代码执行器，支持运行 python 和 javascript 代码",
        "parameters": {
          "type": "object",
          "properties": {
            "language": {
              "type": "string",
              "enum": ["python", "javascript"]
            },
            "code": {
              "type": "string",
              "description": "代码写在这里"
            }
          },
          "required": ["language", "code"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

### 4.2 Ограничения
- Макс. 128 инструментов на запрос
- Имя функции: `^[a-zA-Z_][a-zA-Z0-9-_]{0,63}$`
- Для kimi-k2.5 в thinking mode: `tool_choice` только "auto" или "none"

### 4.3 Официальные инструменты Kimi
- `$web_search` - веб-поиск (временно не работает с thinking mode)

---

## 5. Files API

### 5.1 Загрузка файла
```
POST https://api.moonshot.cn/v1/files
```

```python
file_object = client.files.create(
    file=Path("document.pdf"),
    purpose="file-extract"  # или "image", "video"
)
```

### 5.2 Получение содержимого
```python
file_content = client.files.content(file_id=file_object.id).text
```

### 5.3 Список файлов
```python
GET https://api.moonshot.cn/v1/files
file_list = client.files.list()
```

### 5.4 Удаление файла
```python
DELETE https://api.moonshot.cn/v1/files/{file_id}
client.files.delete(file_id=file_id)
```

### 5.5 Ограничения
- Макс. 1000 файлов на пользователя
- Макс. размер файла: 100MB
- Общий объем: 10GB
- **File API временно бесплатен**

### 5.6 Поддерживаемые форматы
**Документы:** PDF, TXT, CSV, DOC, DOCX, XLS, XLSX, PPT, PPTX, MD, EPUB, HTML, JSON, MOBI, LOG

**Изображения:** JPEG, PNG, BMP, GIF, SVG, WebP, ICO, TIFF, AVIF, и др.

**Код:** GO, C, CPP, CS, JAVA, JS, CSS, PHP, PY, YAML, TS, TSX, и др.

---

## 6. Token Estimation API

### 6.1 Подсчет токенов
```
POST https://api.moonshot.cn/v1/tokenize/estimate
```

```python
response = client.post(
    "https://api.moonshot.cn/v1/tokenize/estimate",
    json={
        "model": "kimi-k2.5",
        "messages": messages
    }
)
```

---

## 7. Rate Limits (Ограничения)

### 7.1 Tier System

| Tier | Пополнение | Concurrency | RPM | TPM | TPD |
|------|------------|-------------|-----|-----|-----|
| Tier 0 | ¥0 | 1 | 3 | 500,000 | 1,500,000 |
| Tier 1 | ¥50 | 50 | 200 | 2,000,000 | Unlimited |
| Tier 2 | ¥100 | 100 | 500 | 3,000,000 | Unlimited |
| Tier 3 | ¥500 | 200 | 5,000 | 3,000,000 | Unlimited |
| Tier 4 | ¥5,000 | 400 | 5,000 | 4,000,000 | Unlimited |
| Tier 5 | ¥20,000 | 1,000 | 10,000 | 5,000,000 | Unlimited |

### 7.2 Определения
- **Concurrency**: Одновременные запросы
- **RPM**: Requests Per Minute
- **TPM**: Tokens Per Minute
- **TPD**: Tokens Per Day

---

## 8. Особенности Code Generation

### 8.1 Kimi Code / Kimi CLI
- **Kimi CLI** - командный инструмент для разработки
- Поддержка **MCP (Model Context Protocol)**
- Интеграция с **Zed Editor**, **VS Code** (Cline, RooCode)
- Интеграция с **Claude Code**

### 8.2 Установка Kimi CLI
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install --python 3.13 kimi-cli
```

### 8.3 Kimi Agent SDK
Поддерживаемые языки:
- **Go** - github.com/MoonshotAI/kimi-agent-sdk/tree/main/go
- **Node.js** - github.com/MoonshotAI/kimi-agent-sdk/tree/main/node/agent_sdk
- **Python** - github.com/MoonshotAI/kimi-agent-sdk/tree/main/python

### 8.4 Конфигурация для Claude Code
```bash
export ANTHROPIC_BASE_URL=https://api.moonshot.cn/anthropic
export ANTHROPIC_AUTH_TOKEN=${MOONSHOT_API_KEY}
export ANTHROPIC_MODEL=kimi-k2.5
export CLAUDE_CODE_SUBAGENT_MODEL=kimi-k2.5
export ENABLE_TOOL_SEARCH=false
claude
```

---

## 9. Дополнительные возможности

### 9.1 JSON Mode
```json
{
  "response_format": {"type": "json_object"}
}
```

### 9.2 Partial Mode (Prefill)
```json
{
  "role": "assistant",
  "content": "{",
  "partial": true
}
```

### 9.3 Context Caching
- Автоматическое кэширование для повторяющихся запросов
- `prompt_cache_key` для оптимизации кэш-попаданий
- Скидка при cache hit: ¥0.70 vs ¥4.00

### 9.4 Web Search Tool
- Официальный инструмент `$web_search`
- Временно несовместим с thinking mode

---

## 10. Обработка ошибок

### 10.1 HTTP Status Codes
| Код | Тип ошибки | Описание |
|-----|------------|----------|
| 400 | content_filter | Контент отклонен фильтром |
| 400 | invalid_request_error | Неверный запрос |
| 401 | invalid_authentication_error | Ошибка аутентификации |
| 403 | permission_denied_error | Нет доступа |
| 404 | resource_not_found_error | Модель не найдена |
| 429 | rate_limit_reached_error | Превышен лимит RPM/TPM/TPD |
| 429 | exceeded_current_quota_error | Недостаточно средств |
| 429 | engine_overloaded_error | Перегрузка сервера |
| 500 | server_error | Внутренняя ошибка |

### 10.2 Формат ошибки
```json
{
  "error": {
    "type": "content_filter",
    "message": "The request was rejected because it was considered high risk"
  }
}
```

---

## 11. Китайская языковая оптимизация

### 11.1 Токенизация
- 1 токен ≈ 1.5-2 китайских иероглифа
- Модель оптимизирована для китайского и английского языков
- Системный промпт должен содержать указание о языке

### 11.2 Рекомендуемый системный промпт
```
你是 Kimi，由 Moonshot AI 提供的人工智能助手，你更擅长中文和英文的对话。
你会为用户提供安全，有帮助，准确的回答。
同时，你会拒绝一切涉及恐怖主义，种族歧视，黄色暴力等问题的回答。
Moonshot AI 为专有名词，不可翻译成其他语言。
```

---

## 12. Интеграция с IDE

### 12.1 VS Code + Cline/RooCode
1. Установить расширение Cline/RooCode
2. API Provider: `Moonshot`
3. Entrypoint: `api.moonshot.cn`
4. Model: `kimi-k2.5`
5. Отключить browser tool

### 12.2 Zed Editor
```json
{
  "agent_servers": {
    "Kimi CLI": {
      "command": "kimi",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

---

## 13. Ссылки

- **Документация:** https://platform.moonshot.cn/docs
- **Playground:** https://platform.moonshot.cn/playground
- **Console:** https://platform.moonshot.cn/console
- **Kimi CLI:** https://github.com/MoonshotAI/kimi-cli
- **Kimi Agent SDK:** https://github.com/MoonshotAI/kimi-agent-sdk
- **K2 Vendor Verifier:** https://github.com/MoonshotAI/K2-Vendor-Verifier

---

*Документ создан для интеграции CogniMesh с Kimi 2.5 API*
