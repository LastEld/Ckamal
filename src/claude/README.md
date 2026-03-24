# Claude Module

## Overview

The Claude Module provides comprehensive integration with Anthropic's Claude AI models for CogniMesh v5.0. It offers a complete toolkit for interacting with Claude, including core API client functionality, advanced features like batch processing and streaming, context management, vision capabilities, and resilience patterns.

## Architecture

### Module Structure

```
claude/
├── core/           # Core client and resilience
├── batch/          # Batch processing
├── context/        # Context compression
├── conversation/   # Conversation management
├── extended-thinking/  # Extended thinking budgets
├── resilience/     # Resilience patterns
├── router/         # Request routing
├── streaming/      # Streaming protocols
├── tokens/         # Token optimization
└── vision/         # Vision preprocessing
```

### Component Interaction

```
User Request → Router → Core Client → Anthropic API
                  ↓
            ┌─────┴─────┐
            ↓           ↓
      Batch Manager  Streaming
            ↓           ↓
      Token Optimizer ← Context Compressor
            ↓
      Extended Thinking
```

## Components

### Core Client

The foundational Claude API client:

- **Authentication**: Session token and organization management
- **Message Sending**: Synchronous message exchange
- **Error Handling**: Automatic retry with exponential backoff
- **Rate Limiting**: Request throttling and queue management
- **Connection Management**: HTTP/2 connection pooling

### Batch Processing

Efficient batch request handling:

- **Request Queuing**: Queue multiple requests
- **Parallel Execution**: Concurrent processing with configurable limits
- **Progress Tracking**: Monitor batch progress
- **Partial Results**: Handle partial failures
- **Cancellation**: Cancel pending requests

### Context Management

Context window optimization:

- **Compression Strategies**: Multiple compression algorithms
- **Token Estimation**: Accurate token counting
- **Smart Truncation**: Intelligent message trimming
- **Summarization**: Automatic context summarization

### Conversation Management

Stateful conversation handling:

- **Conversation Creation**: Initialize new conversations
- **History Tracking**: Persistent message history
- **Forking**: Branch conversations at any point
- **Metadata**: Attach custom metadata to conversations

### Extended Thinking

Budget management for extended thinking:

- **Budget Allocation**: Configure thinking token budgets
- **Usage Tracking**: Monitor thinking token consumption
- **Budget Alerts**: Notifications on budget thresholds
- **Adaptive Budgeting**: Dynamic budget adjustment

### Streaming

Real-time response streaming:

- **SSE Protocol**: Server-sent events implementation
- **Chunk Processing**: Handle partial content
- **Stream Control**: Pause, resume, cancel streams
- **Error Recovery**: Handle stream interruptions

### Token Optimization

Token usage optimization:

- **Budget Types**: Daily, weekly, monthly budgets
- **Cost Estimation**: Pre-request cost prediction
- **Alert Levels**: Configurable alert thresholds
- **Optimization Suggestions**: Recommendations for efficiency

### Vision

Image processing for vision models:

- **Image Preprocessing**: Resize, format conversion
- **OCR Integration**: Text extraction from images
- **Analysis**: Image content analysis
- **Multi-modal**: Combine text and image inputs

## Usage

### Basic Setup

```javascript
import { ClaudeClient } from './claude/core/index.js';

const client = new ClaudeClient({
  sessionToken: process.env.CLAUDE_SESSION_TOKEN,
  organizationId: process.env.CLAUDE_ORG_ID,
  retryPolicy: { maxRetries: 3, baseDelay: 1000 },
  maxConcurrentRequests: 5
});
```

### Simple Conversation

```javascript
const response = await client.sendMessage([
  { role: 'user', content: 'Explain quantum computing' }
], {
  model: 'claude-3-sonnet-20240229',
  maxTokens: 2048,
  temperature: 0.7
});

console.log(response.content[0].text);
```

### Streaming Response

```javascript
const stream = client.streamMessage([
  { role: 'user', content: 'Write a poem about AI' }
], { model: 'claude-3-opus-20240229' });

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta') {
    process.stdout.write(chunk.delta.text);
  }
}
```

### Conversation Management

```javascript
import { ConversationManager } from './claude/conversation/index.js';

const convManager = new ConversationManager(client);

// Create conversation
const conversation = await convManager.createConversation({
  name: 'Research Discussion',
  model: 'claude-3-sonnet-20240229'
});

// Add messages
await convManager.addMessage(conversation.id, {
  role: 'user',
  content: 'What are the latest developments in LLMs?'
});

// Get history
const history = await convManager.getHistory(conversation.id);

// Fork at specific point
const forked = await convManager.forkConversation(
  conversation.id, 
  5  // Fork after 5th message
);
```

### Batch Processing

```javascript
import { BatchManager } from './claude/batch/index.js';

const batch = new BatchManager(client, {
  batchSize: 20,
  concurrency: 5
});

// Queue requests
for (const prompt of prompts) {
  await batch.addRequest({
    messages: [{ role: 'user', content: prompt }],
    options: { maxTokens: 500 }
  });
}

// Execute
const results = await batch.executeBatch();
results.forEach((result, i) => {
  if (result.success) {
    console.log(`Result ${i}:`, result.data.content[0].text);
  } else {
    console.error(`Error ${i}:`, result.error);
  }
});
```

### Vision Analysis

```javascript
import { VisionPreprocessor } from './claude/vision/index.js';

const vision = new VisionPreprocessor({
  maxSize: { width: 1024, height: 1024 },
  format: 'jpeg'
});

const imageBuffer = fs.readFileSync('chart.png');
const processed = await vision.processImage(imageBuffer);

const response = await client.sendMessage([
  {
    role: 'user',
    content: [
      { type: 'text', text: 'What does this chart show?' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: processed.base64
        }
      }
    ]
  }
]);
```

### Token Budget Management

```javascript
import { TokenOptimizer } from './claude/tokens/index.js';

const optimizer = new TokenOptimizer({
  budgetType: 'daily',
  dailyLimit: 100000,
  alertLevel: 0.8
});

// Check budget before request
const estimate = optimizer.calculateCost(messages, 'claude-3-sonnet');
if (optimizer.isWithinBudget(estimate.totalTokens)) {
  const response = await client.sendMessage(messages);
  optimizer.recordUsage(response.usage);
} else {
  console.warn('Token budget exceeded');
}
```

## Configuration

### Client Configuration

```javascript
{
  // Authentication
  sessionToken: 'sk-ant-...',
  organizationId: 'org-...',
  
  // Request settings
  defaultModel: 'claude-3-sonnet-20240229',
  defaultMaxTokens: 4096,
  defaultTemperature: 1.0,
  
  // Retry configuration
  retryPolicy: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  },
  
  // Concurrency
  maxConcurrentRequests: 10,
  requestTimeout: 120000,
  
  // Resilience
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 60000
  }
}
```

### Batch Configuration

```javascript
{
  batchSize: 50,           // Maximum requests per batch
  concurrency: 10,         // Parallel requests
  retryFailed: true,       // Retry failed requests
  retryAttempts: 3,
  progressInterval: 1000   // Progress update interval (ms)
}
```

### Streaming Configuration

```javascript
{
  heartbeatInterval: 15000,  // Keep-alive interval
  maxReconnects: 3,
  reconnectDelay: 1000,
  bufferSize: 1024          // Chunk buffer size
}
```

### Context Compression

```javascript
{
  strategy: 'summarization',  // 'summarization' | 'truncation' | 'hybrid'
  targetTokens: 8000,
  preserveRecent: 4,          // Keep N most recent messages
  summarizationModel: 'claude-3-haiku'
}
```

## Best Practices

1. **Handle Rate Limits**: Implement exponential backoff for rate limit errors
2. **Use Streaming**: For long responses, use streaming to improve UX
3. **Context Management**: Monitor context window and compress when needed
4. **Token Budgets**: Set and monitor token budgets to control costs
5. **Batch Processing**: Use batching for multiple independent requests
6. **Error Classification**: Use `classifyError()` for appropriate error handling
7. **Vision Optimization**: Pre-process images to reduce token usage
8. **Conversation Forking**: Use forking to explore different conversation paths
