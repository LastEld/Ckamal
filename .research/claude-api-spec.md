# Claude API Specification for CogniMesh Integration

**Research Date:** 2026-03-23  
**Research Agent:** #1 (Claude API Specialist)  
**Status:** ✅ COMPLETED

---

## Executive Summary

This document provides comprehensive specifications for integrating Anthropic Claude API into CogniMesh. It covers Claude Opus 4.6, Sonnet 4.6, and Sonnet 4.5 APIs with detailed information on methods, parameters, capabilities, and pricing.

---

## 1. Base API Information

### Endpoint
```
Base URL: https://api.anthropic.com
API Version: 2023-06-01
```

### Required Headers
| Header | Value | Required |
|--------|-------|----------|
| `x-api-key` | Your API key from Console | ✅ |
| `anthropic-version` | API version (e.g., `2023-06-01`) | ✅ |
| `content-type` | `application/json` | ✅ |

### Request Size Limits
| Endpoint | Maximum Size |
|----------|--------------|
| Standard endpoints (Messages, Token Counting) | 32 MB |
| Batch API | 256 MB |
| Files API | 500 MB |

---

## 2. Available APIs

### General Availability
| API | Endpoint | Description |
|-----|----------|-------------|
| **Messages API** | `POST /v1/messages` | Primary conversational interface |
| **Message Batches API** | `POST /v1/messages/batches` | Async processing with 50% cost reduction |
| **Token Counting API** | `POST /v1/messages/count_tokens` | Pre-request token counting |
| **Models API** | `GET /v1/models` | List available models |

### Beta APIs
| API | Endpoint | Description |
|-----|----------|-------------|
| **Files API** | `POST /v1/files`, `GET /v1/files` | File upload and management |
| **Skills API** | `POST /v1/skills`, `GET /v1/skills` | Custom agent skills |

---

## 3. Model Specifications

### 3.1 Claude Opus 4.6

**Model IDs:**
- Alias: `claude-opus-4-6`
- Snapshot: `claude-opus-4-6-20260205`

**Specifications:**
| Parameter | Value |
|-----------|-------|
| Context Window | 200K tokens (standard), 1M tokens (beta) |
| Max Output Tokens | 128K tokens |
| Knowledge Cutoff | May 2025 |
| Input Modalities | Text, Image, PDF |
| Output Format | Text |
| Release Date | February 2026 |

**Pricing:**
| Tier | Input | Output |
|------|-------|--------|
| Standard (≤200K) | $5.00 / MTok | $25.00 / MTok |
| Long Context (>200K) | $10.00 / MTok | $37.50 / MTok |
| Batch API | $2.50 / MTok | $12.50 / MTok |
| Cache Read | $0.50 / MTok (0.1x base) | - |
| Cache Write (5min) | $6.25 / MTok (1.25x base) | - |
| Cache Write (1hour) | $10.00 / MTok (2x base) | - |

**Best For:**
- Complex reasoning and research
- Multi-step analysis
- Code generation and architecture
- Long-running professional tasks
- Agent workflows across entire workflows

---

### 3.2 Claude Sonnet 4.6

**Model IDs:**
- Alias: `claude-sonnet-4-6`
- Snapshot: `claude-sonnet-4-6-20260217`

**Specifications:**
| Parameter | Value |
|-----------|-------|
| Context Window | 200K tokens (standard), 1M tokens (beta) |
| Max Output Tokens | 64K tokens |
| Knowledge Cutoff | Not disclosed (likely mid-2025) |
| Input Modalities | Text, Image, PDF |
| Output Format | Text |
| Release Date | February 17, 2026 |

**Pricing:**
| Tier | Input | Output |
|------|-------|--------|
| Standard (≤200K) | $3.00 / MTok | $15.00 / MTok |
| Long Context (>200K) | $6.00 / MTok | $22.50 / MTok |
| Batch API | $1.50 / MTok | $7.50 / MTok |
| Cache Read | $0.30 / MTok (0.1x base) | - |

**Performance Benchmarks:**
- SWE-bench Verified: 79.6% (vs Opus 4.6: 80.7%)
- OSWorld (agentic): ~71% (vs Opus 4.6: 72.5%)

**Key Features:**
- Near-Opus performance at 40% lower cost
- Adaptive effort controls
- Context compaction (beta)
- Extended thinking modes
- Hybrid reasoning

**Best For:**
- Daily development tasks
- Code review and bug fixing
- Enterprise batch processing
- Price-sensitive projects
- Fast prototype development

---

### 3.3 Claude Sonnet 4.5

**Model IDs:**
- Alias: `claude-sonnet-4-5`
- Snapshot: `claude-sonnet-4-5-20250929`

**Specifications:**
| Parameter | Value |
|-----------|-------|
| Context Window | 200K tokens (standard), 1M tokens (beta) |
| Max Output Tokens | 64K tokens |
| Knowledge Cutoff | July 2025 |
| Input Modalities | Text, Image, PDF |
| Output Format | Text |
| Release Date | September 29, 2025 |

**Pricing:**
| Tier | Input | Output |
|------|-------|--------|
| Standard | $3.00 / MTok | $15.00 / MTok |
| Long Context | $6.00 / MTok | $22.50 / MTok |
| Batch API | $1.50 / MTok | $7.50 / MTok |

**Best For:**
- General-purpose coding assistance
- Content generation
- Customer support bots
- Internal tools and dashboards

---

### 3.4 Claude Haiku 4.5

**Model IDs:**
- Alias: `claude-haiku-4-5`

**Specifications:**
| Parameter | Value |
|-----------|-------|
| Context Window | 200K tokens |
| Max Output Tokens | 64K tokens |

**Pricing:**
| Tier | Input | Output |
|------|-------|--------|
| Standard | $1.00 / MTok | $5.00 / MTok |
| Batch API | $0.50 / MTok | $2.50 / MTok |

**Best For:**
- High-volume, low-complexity tasks
- Classification and extraction
- Routing decisions
- Real-time applications

---

## 4. Messages API Specification

### 4.1 Request Format

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 4096,
  "messages": [
    {
      "role": "user",
      "content": "Hello, Claude!"
    }
  ],
  "system": "Optional system prompt",
  "temperature": 0.7,
  "top_p": 0.9,
  "top_k": 40,
  "stream": false,
  "stop_sequences": [],
  "tools": [],
  "tool_choice": "auto",
  "thinking": {
    "type": "adaptive"
  },
  "metadata": {}
}
```

### 4.2 Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | string | ✅ | - | Model ID to use |
| `max_tokens` | integer | ✅ | - | Maximum tokens to generate (1-128K) |
| `messages` | array | ✅ | - | Array of message objects |
| `system` | string/array | ❌ | - | System prompt/instructions |
| `temperature` | number | ❌ | 1.0 | Sampling temperature (0-1) |
| `top_p` | number | ❌ | - | Nucleus sampling (0-1) |
| `top_k` | integer | ❌ | - | Top-k sampling |
| `stream` | boolean | ❌ | false | Enable streaming |
| `stop_sequences` | array | ❌ | [] | Stop sequences |
| `tools` | array | ❌ | [] | Tool definitions |
| `tool_choice` | object/string | ❌ | "auto" | Tool selection mode |
| `thinking` | object | ❌ | - | Extended thinking config |
| `metadata` | object | ❌ | {} | Metadata tags |
| `cache_control` | object | ❌ | - | Prompt caching configuration |

### 4.3 Message Object Format

```json
{
  "role": "user",  // "user" | "assistant"
  "content": [
    {
      "type": "text",
      "text": "Message text"
    },
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/jpeg",
        "data": "base64_encoded_image"
      }
    }
  ]
}
```

### 4.4 Response Format

```json
{
  "id": "msg_01X...",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-4-6",
  "content": [
    {
      "type": "text",
      "text": "Response text here..."
    }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50
  }
}
```

### 4.5 Stop Reasons
| Value | Description |
|-------|-------------|
| `end_turn` | Natural completion |
| `max_tokens` | Hit token limit |
| `stop_sequence` | Matched stop sequence |
| `tool_use` | Requested tool execution |

---

## 5. Streaming Support

### 5.1 Enabling Streaming

Set `stream: true` in the request to enable Server-Sent Events (SSE).

### 5.2 Stream Events

| Event Type | Description |
|------------|-------------|
| `message_start` | Initial message metadata |
| `content_block_start` | Start of content block |
| `content_block_delta` | Incremental content update |
| `content_block_stop` | End of content block |
| `message_delta` | Message metadata update |
| `message_stop` | End of message |
| `ping` | Keepalive ping |

### 5.3 Python Streaming Example

```python
from anthropic import Anthropic

client = Anthropic()
stream = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)

for event in stream:
    if event.type == "content_block_delta" and event.delta.type == "text_delta":
        print(event.delta.text, end="", flush=True)
```

### 5.4 TypeScript Streaming Example

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const stream = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello!" }],
    stream: true,
});

for await (const event of stream) {
    if (event.type === "content_block_delta") {
        process.stdout.write(event.delta.text);
    }
}
```

### 5.5 Extended Thinking with Streaming

```python
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    thinking={"type": "enabled"},
    messages=[{"role": "user", "content": "Complex reasoning task..."}],
    stream=True
)
```

---

## 6. Vision Capabilities

### 6.1 Supported Image Formats
| Format | Media Type |
|--------|------------|
| JPEG | `image/jpeg` |
| PNG | `image/png` |
| GIF | `image/gif` |
| WebP | `image/webp` |

### 6.2 Vision Request Example

```python
import base64

with open("image.jpg", "rb") as f:
    image_data = base64.b64encode(f.read()).decode("utf-8")

message = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": image_data
                }
            },
            {
                "type": "text",
                "text": "Describe this image in detail."
            }
        ]
    }]
)
```

### 6.3 Vision Best Practices
- Images are downsampled if dimensions exceed limits
- Can analyze charts, diagrams, handwritten text
- PDF support includes text + visual extraction
- No image generation capability (text output only)

---

## 7. Tool Use (Function Calling)

### 7.1 Tool Definition Format

```json
{
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a location",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City name"
          },
          "unit": {
            "type": "string",
            "enum": ["celsius", "fahrenheit"]
          }
        },
        "required": ["location"]
      }
    }
  ],
  "tool_choice": "auto"
}
```

### 7.2 Tool Choice Options
| Value | Description |
|-------|-------------|
| `"auto"` | Claude decides whether to use tools |
| `"any"` | Claude must use a tool |
| `"none"` | Claude cannot use tools |
| `{"type": "tool", "name": "tool_name"}` | Force specific tool |

### 7.3 Tool Use Response

```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_01X...",
      "name": "get_weather",
      "input": {
        "location": "San Francisco",
        "unit": "celsius"
      }
    }
  ]
}
```

### 7.4 Tool Result Message

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01X...",
      "content": "Current weather in San Francisco: 18°C, sunny"
    }
  ]
}
```

---

## 8. Extended Thinking

### 8.1 Overview
Extended thinking enables step-by-step reasoning chains (up to 100 steps) for complex tasks.

### 8.2 Configuration

```json
{
  "thinking": {
    "type": "enabled" | "adaptive",
    "budget_tokens": 32000
  },
  "extra_body": {
    "effort": "low" | "medium" | "high" | "max"
  }
}
```

### 8.3 Effort Levels
| Level | Description | Cost |
|-------|-------------|------|
| `low` | Fast, minimal reasoning | Standard |
| `medium` | Balanced (default for Sonnet) | Standard |
| `high` | Thorough reasoning | 2-3x tokens |
| `max` | Maximum depth | 5x tokens |

### 8.4 Response with Thinking

```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "Step-by-step reasoning...",
      "signature": "..."
    },
    {
      "type": "text",
      "text": "Final answer..."
    }
  ]
}
```

---

## 9. Prompt Caching

### 9.1 Cache Control

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Large document content...",
          "cache_control": {"type": "ephemeral"}
        }
      ]
    }
  ]
}
```

### 9.2 Cache Durations
| Duration | Write Multiplier | Read Multiplier |
|----------|------------------|-----------------|
| 5 minutes | 1.25x | 0.1x |
| 1 hour | 2.0x | 0.1x |

### 9.3 Best Practices
- Place `cache_control` on final content block
- Cache large system prompts and reference documents
- First request pays write cost, subsequent pay read cost
- Break-even at 1-2 reuses (5min) or 2-4 reuses (1hour)

---

## 10. Rate Limits

### 10.1 Limit Tiers
Limits increase automatically with usage. Contact sales for Priority Tier.

| Metric | Free Tier | Paid Tier | Enterprise |
|--------|-----------|-----------|------------|
| Requests/min (RPM) | Limited | 200-1000+ | Custom |
| Tokens/min (TPM) | Limited | 100K+ | Custom |
| Spend limit | Low | Medium | High |

### 10.2 Response Headers
- `request-id`: Unique request identifier
- `anthropic-organization-id`: Organization ID

---

## 11. SDK Support

### 11.1 Official SDKs
| Language | Package | Installation |
|----------|---------|--------------|
| Python | `anthropic` | `pip install anthropic` |
| TypeScript | `@anthropic-ai/sdk` | `npm install @anthropic-ai/sdk` |
| Java | `anthropic-java` | Maven/Gradle |
| Go | `anthropic-go` | `go get` |
| C# | `Anthropic.SDK` | NuGet |
| Ruby | `anthropic` | `gem install anthropic` |
| PHP | `anthropic-php` | Composer |

### 11.2 Python SDK Example

```python
import os
from anthropic import Anthropic

client = Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY")
)

message = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    temperature=0.7,
    system="You are a helpful assistant.",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(message.content[0].text)
```

---

## 12. Third-Party Platform Access

| Platform | Model ID Pattern | Notes |
|----------|------------------|-------|
| **AWS Bedrock** | `anthropic.claude-3-sonnet-4-6-v1` | IAM integration, VPC support |
| **Google Vertex AI** | `claude-sonnet-4-6@20260217` | Regional endpoints |
| **Azure AI** | `claude-sonnet-4-6` | Azure OpenAI Service |

---

## 13. Model Comparison Matrix

| Feature | Opus 4.6 | Sonnet 4.6 | Sonnet 4.5 | Haiku 4.5 |
|---------|----------|------------|------------|-----------|
| **Intelligence** | Maximum | Near-Opus | High | Moderate |
| **Speed** | Slower | Fast | Fast | Fastest |
| **Context** | 200K/1M | 200K/1M | 200K/1M | 200K |
| **Max Output** | 128K | 64K | 64K | 64K |
| **Input Cost** | $5/MTok | $3/MTok | $3/MTok | $1/MTok |
| **Output Cost** | $25/MTok | $15/MTok | $15/MTok | $5/MTok |
| **SWE-bench** | 80.7% | 79.6% | ~78% | - |
| **Best Use** | Complex tasks | General coding | Balanced | Fast tasks |

---

## 14. Migration Guide

### 14.1 From Sonnet 4.5 to Sonnet 4.6
- **API Changes:** None - drop-in replacement
- **Model ID:** Update to `claude-sonnet-4-6`
- **Performance:** ~1-2% improvement on benchmarks
- **New Features:** Adaptive thinking, context compaction

### 14.2 From OpenAI to Claude

```python
# OpenAI format
openai.chat.completions.create(
    model="gpt-4",
    messages=messages,
    temperature=0.7
)

# Claude equivalent
anthropic.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=4096,  # Required in Claude
    messages=messages,
    temperature=0.7
)
```

**Key Differences:**
- Claude requires `max_tokens` parameter
- System prompt is top-level (`system`) not in messages array
- Content is array of blocks, not simple string
- Tool schemas are similar but naming differs

---

## 15. Integration Recommendations for CogniMesh

### 15.1 Model Selection Strategy

| Use Case | Recommended Model | Rationale |
|----------|-------------------|-----------|
| Complex reasoning | `claude-opus-4-6` | Maximum intelligence |
| General coding | `claude-sonnet-4-6` | Best cost/performance |
| High-volume tasks | `claude-haiku-4-5` | Speed and economy |
| Long context analysis | `claude-sonnet-4-6` | 1M token support |
| Agent workflows | `claude-opus-4-6` | Best tool use reliability |

### 15.2 Cost Optimization
1. Use **prompt caching** for repeated contexts
2. Enable **batch API** for non-urgent workloads
3. Implement **model routing** (Haiku → Sonnet → Opus)
4. Set appropriate `max_tokens` to avoid waste
5. Use `effort: "low"` for simple tasks

### 15.3 Error Handling
```python
try:
    response = client.messages.create(...)
except anthropic.APIError as e:
    # Handle API errors
except anthropic.RateLimitError as e:
    # Implement backoff
except anthropic.APIConnectionError as e:
    # Handle network issues
```

---

## 16. References

- **Official Docs:** https://docs.anthropic.com
- **API Reference:** https://docs.anthropic.com/en/api/getting-started
- **Python SDK:** https://github.com/anthropics/anthropic-sdk-python
- **TypeScript SDK:** https://github.com/anthropics/anthropic-sdk-typescript
- **Cookbook:** https://github.com/anthropics/anthropic-cookbook

---

*Document generated by Research Agent #1 for CogniMesh Project*  
*Last updated: 2026-03-23*
