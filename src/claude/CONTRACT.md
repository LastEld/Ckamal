# Claude Module Contract

## Overview

The Claude Module provides comprehensive integration with Anthropic's Claude AI models for CogniMesh v5.0. It includes core client functionality, batch processing, context management, conversation handling, extended thinking, resilience patterns, streaming, tokens optimization, and vision capabilities.

## Public Interfaces

### ClaudeClient

Main client for Claude API interactions.

```javascript
import { ClaudeClient } from './claude/core/index.js';

const client = new ClaudeClient({
  sessionToken: process.env.CLAUDE_SESSION_TOKEN,
  organizationId: process.env.CLAUDE_ORG_ID
});
```

**Methods:**

- `constructor(options)` - Creates Claude client
  - `options.sessionToken` - Claude session token
  - `options.organizationId` - Organization ID
  - `options.retryPolicy` - Retry configuration
  - `options.maxConcurrentRequests` - Concurrency limit

- `sendMessage(messages, options)` - Sends messages to Claude
  - `messages` (Array) - Message array with role/content
  - `options.model` - Model to use
  - `options.maxTokens` - Maximum response tokens
  - `options.temperature` - Sampling temperature
  - Returns: Promise<MessageResponse>

- `streamMessage(messages, options)` - Streams response from Claude
  - Returns: AsyncIterable<StreamChunk>

- `createConversation()` - Creates a new conversation
  - Returns: Promise<Conversation>

- `getConversation(id)` - Retrieves a conversation
  - Returns: Promise<Conversation>

- `close()` - Closes client connections
  - Returns: Promise<void>

### BatchManager

Manages batch processing of Claude requests.

- `constructor(client, options)` - Creates batch manager
  - `options.batchSize` - Maximum batch size
  - `options.concurrency` - Concurrent requests

- `addRequest(request)` - Adds request to batch
  - Returns: Promise<BatchJob>

- `executeBatch()` - Executes pending batch
  - Returns: Promise<BatchResult[]>

- `getJobStatus(jobId)` - Gets job status
  - Returns: Promise<BatchJobStatus>

- `cancelJob(jobId)` - Cancels pending job
  - Returns: Promise<boolean>

### ContextCompressor

Manages context window compression.

- `constructor(options)` - Creates compressor
  - `options.strategy` - Compression strategy
  - `options.targetTokens` - Target token count

- `compress(messages, maxTokens)` - Compresses message history
  - Returns: CompressedMessage[]

- `estimateTokens(messages)` - Estimates token count
  - Returns: number

- `getCompressionStats()` - Returns compression statistics

### ConversationManager

Manages conversation state and history.

- `createConversation(options)` - Creates conversation
  - Returns: Promise<Conversation>

- `addMessage(conversationId, message)` - Adds message
  - Returns: Promise<Message>

- `getHistory(conversationId, options)` - Gets conversation history
  - Returns: Promise<Message[]>

- `forkConversation(conversationId, messageIndex)` - Forks conversation
  - Returns: Promise<Conversation>

- `deleteConversation(conversationId)` - Deletes conversation
  - Returns: Promise<boolean>

### ExtendedThinkingController

Manages extended thinking budgets.

- `constructor(options)` - Creates controller
  - `options.maxBudgetTokens` - Maximum thinking tokens
  - `options.enabled` - Enable extended thinking

- `setBudget(tokens)` - Sets thinking budget
  - Returns: void

- `getBudgetStatus()` - Gets current budget status
  - Returns: BudgetStatus

- `isWithinBudget(estimatedTokens)` - Checks budget availability
  - Returns: boolean

### StreamingProtocol

Handles streaming response protocols.

- `createStream(options)` - Creates stream handler
  - Returns: StreamHandler

- `parseChunk(data)` - Parses stream chunk
  - Returns: StreamChunk

- `validateStream(stream)` - Validates stream integrity
  - Returns: boolean

### TokenOptimizer

Optimizes token usage.

- `constructor(options)` - Creates optimizer
  - `options.budgetType` - Budget constraint type
  - `options.alertLevel` - Alert threshold

- `optimizeRequest(request, constraints)` - Optimizes request for token efficiency
  - Returns: OptimizedRequest

- `calculateCost(messages, model)` - Calculates estimated cost
  - Returns: CostEstimate

- `suggestTruncation(messages, maxTokens)` - Suggests truncation points
  - Returns: TruncationSuggestion[]

### VisionPreprocessor

Preprocesses images for vision models.

- `constructor(options)` - Creates preprocessor
  - `options.maxSize` - Maximum image size
  - `options.format` - Target format

- `processImage(imageBuffer, options)` - Processes image
  - Returns: Promise<ProcessedImage>

- `extractText(imageBuffer)` - Extracts text from image (OCR)
  - Returns: Promise<string>

- `analyzeImage(imageBuffer, prompt)` - Analyzes image content
  - Returns: Promise<ImageAnalysis>

### Resilience Patterns

Error handling and retry mechanisms.

- `RetryPolicy` - Configurable retry policy
- `Bulkhead` - Concurrency limiter
- `CircuitBreaker` - Failure circuit breaker
- `withTimeout(fn, ms)` - Timeout wrapper
- `classifyError(error)` - Error classification
- `isRetryableError(error)` - Retryability check
- `calculateBackoff(attempt)` - Backoff calculation

## Data Structures

### Message

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  id?: string;
  timestamp?: string;
}
```

### ContentBlock

```typescript
interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: ImageSource;
  tool_use_id?: string;
  input?: any;
  output?: any;
}
```

### MessageResponse

```typescript
interface MessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: TokenUsage;
}
```

### TokenUsage

```typescript
interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}
```

### Conversation

```typescript
interface Conversation {
  id: string;
  name: string;
  messages: Message[];
  model: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}
```

### StreamChunk

```typescript
interface StreamChunk {
  type: 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  index?: number;
  delta?: ContentDelta;
  usage?: TokenUsage;
}
```

### BatchJob

```typescript
interface BatchJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  request: RequestPayload;
  result?: MessageResponse;
  error?: Error;
  createdAt: string;
  completedAt?: string;
}
```

## Events

The Claude module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `message:sent` | `{ request }` | Message sent to Claude |
| `message:received` | `{ response }` | Response received |
| `stream:started` | `{ conversationId }` | Stream started |
| `stream:chunk` | `{ chunk }` | Stream chunk received |
| `stream:stopped` | `{ reason }` | Stream ended |
| `conversation:created` | `{ conversation }` | New conversation |
| `conversation:updated` | `{ conversation }` | Conversation modified |
| `batch:started` | `{ batchId, count }` | Batch processing started |
| `batch:completed` | `{ batchId, results }` | Batch completed |
| `error` | `{ error, context }` | Error occurred |
| `rateLimited` | `{ retryAfter }` | Rate limit hit |

## Error Handling

### ClaudeError

Base error for Claude operations.

### AuthenticationError

Thrown when authentication fails.

### RateLimitError

Thrown when rate limit is exceeded.

- `retryAfter`: Seconds until retry is allowed

### ConversationError

Thrown when conversation operations fail.

### StreamingError

Thrown when streaming fails.

### BatchError

Thrown when batch processing fails.

## Usage Example

```javascript
import { ClaudeClient, BatchManager } from './claude/core/index.js';
import { TokenOptimizer } from './claude/tokens/index.js';

// Initialize client
const client = new ClaudeClient({
  sessionToken: process.env.CLAUDE_SESSION_TOKEN
});

// Simple message
const response = await client.sendMessage([
  { role: 'user', content: 'Hello, Claude!' }
], {
  model: 'claude-3-sonnet-20240229',
  maxTokens: 1024
});

// Streaming
for await (const chunk of client.streamMessage([
  { role: 'user', content: 'Write a story' }
])) {
  process.stdout.write(chunk.delta?.text || '');
}

// Batch processing
const batch = new BatchManager(client, { batchSize: 10 });
for (const request of requests) {
  await batch.addRequest(request);
}
const results = await batch.executeBatch();

// Cleanup
await client.close();
```
