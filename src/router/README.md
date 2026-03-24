# Multi-Model Router and Orchestrator

A comprehensive routing and orchestration system for multi-model AI operations with intelligent scoring, context management, fallback handling, and semantic caching.

## Features

- **Multi-Factor Scoring Algorithm**: Routes tasks based on Quality (40%), Cost (30%), Latency (20%), and Load (10%)
- **Task Complexity Analysis**: Analyzes task complexity (1-10) for optimal model selection
- **Multiple Orchestration Modes**: SINGLE, PARALLEL, CHAINED, SWARM, PLAN, and COWORK
- **Cross-Model Context Sharing**: Seamless context translation between different model formats
- **Three-Level Fallback System**: Instance retry, model escalation, and fallback chains
- **Semantic Caching**: Intelligent caching with semantic similarity matching

## Quick Start

```javascript
import { RouterSystem } from './router/index.js';

// Create and initialize the system
const system = new RouterSystem();
await system.initialize();

// Route a task
const route = await system.route({
  id: 'task-1',
  type: 'code',
  content: 'Write a function to calculate factorial'
});

console.log(`Routed to: ${route.modelId}`);
console.log(`Estimated cost: $${route.estimatedCost}`);
console.log(`Estimated latency: ${route.estimatedLatency}ms`);

// Execute with orchestration
const result = await system.executeWithMode(
  { id: 'task-1', payload: task },
  'parallel', // or 'single', 'chained', 'swarm', 'plan', 'cowork'
  { concurrency: 3 }
);
```

## Components

### ModelRouter

Core routing component with multi-factor scoring.

```javascript
import { ModelRouter, SCORING_WEIGHTS } from './router/index.js';

const router = new ModelRouter({
  weights: {
    QUALITY: 0.40,
    COST: 0.30,
    LATENCY: 0.20,
    LOAD: 0.10
  },
  fallbackThreshold: 0.3,
  enableCache: true
});

await router.initialize();

// Register custom model
router.registerModel({
  id: 'my-model',
  name: 'My Custom Model',
  provider: 'custom',
  qualityScore: 0.95,
  costPer1kTokens: 0.01,
  avgLatencyMs: 500,
  capabilities: {
    features: ['code', 'vision'],
    maxTokens: 100000,
    languages: ['javascript', 'python'],
    domains: ['coding', 'analysis']
  }
});

// Route task
const route = await router.routeTask({
  id: 'task-1',
  type: 'code',
  content: 'Implement quicksort algorithm',
  requiredFeatures: ['code']
});
```

### Orchestrator

Multi-mode task orchestration.

```javascript
import { Orchestrator, ORCHESTRATION_MODES } from './router/index.js';

const orchestrator = new Orchestrator({ router });
await orchestrator.initialize();

// Single execution
const single = await orchestrator.executeSingle({
  id: 'task-1',
  payload: { type: 'code', content: 'Hello' }
});

// Parallel execution
const parallel = await orchestrator.executeParallel([
  { id: 't1', payload: { content: 'Task 1' } },
  { id: 't2', payload: { content: 'Task 2' } }
], { concurrency: 2, aggregationStrategy: 'concatenate' });

// Chained execution
const chained = await orchestrator.executeChain([
  { id: 's1', payload: { content: 'Step 1' } },
  { id: 's2', payload: { content: 'Step 2' } },
  { id: 's3', payload: { content: 'Step 3' } }
], { passContext: true, stopOnError: true });

// Swarm execution
const swarm = await orchestrator.executeSwarm(
  { id: 'swarm', payload: { content: 'Analyze code' } },
  { count: 5, strategy: 'majority', diversity: 0.3 }
);

// Planned execution
const plan = await orchestrator.executePlan({
  id: 'my-plan',
  steps: [
    { order: 1, action: 'analyze', config: {} },
    { order: 2, action: 'implement', config: {}, dependsOn: [1] },
    { order: 3, action: 'test', config: {}, dependsOn: [2] }
  ]
});

// Collaborative work
const cowork = await orchestrator.executeCowork([
  { id: 'cw1', role: 'analyzer', payload: { content: 'Analyze' } },
  { id: 'cw2', role: 'implementer', payload: { content: 'Implement' } }
], { rounds: 3 });
```

### ContextManager

Cross-model context sharing and management.

```javascript
import { ContextManager } from './router/index.js';

const contextManager = new ContextManager();
await contextManager.initialize();

// Create context
const context = contextManager.createContext(
  'session-123',
  {
    conversation: [
      { role: 'user', content: 'How do I implement authentication?' }
    ],
    requirements: ['JWT', 'OAuth2']
  },
  { sourceModel: 'claude-sonnet-4-6' }
);

// Share context with another model
const shared = contextManager.shareContext(
  context.id,
  'gpt-4o',
  { translationOptions: { format: 'openai' } }
);

// Compact large context
const compacted = contextManager.compactContext(context.id, 'summary');

// State management
contextManager.setState('user-preference', 'dark-mode', { ttl: 3600000 });
const preference = contextManager.getState('user-preference');
```

### FallbackSystem

Three-level fallback handling.

```javascript
import { FallbackSystem } from './router/index.js';

const fallbackSystem = new FallbackSystem({
  router,
  config: {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    preserveContext: true
  }
});

await fallbackSystem.initialize();

// Register custom fallback chain
fallbackSystem.registerFallbackChain('custom', [
  'claude-sonnet-4-6',
  'gpt-4o',
  'gpt-4o-mini'
]);

// Execute with fallback
const result = await fallbackSystem.executeWithFallback(task, {
  fallbackChain: 'standard' // or 'premium', 'economy', 'speed', 'custom'
});

if (result.success) {
  console.log(`Success after ${result.attempts} attempts`);
  console.log(`Final model: ${result.finalModel}`);
} else {
  console.log('All fallbacks exhausted');
}
```

### SemanticCache

Intelligent response caching.

```javascript
import { SemanticCache } from './router/index.js';

const cache = new SemanticCache({
  maxSize: 1000,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  semanticThreshold: 0.85,
  enableSemanticCache: true
});

await cache.initialize();

// Cache response
cache.set(
  { content: 'Write a function to reverse a string' },
  { code: 'function reverse(str) { return str.split("").reverse().join(""); }' },
  { tags: ['javascript', 'string'] }
);

// Get with semantic matching
const cached = cache.get({ content: 'How do I reverse a string in JS?' });
if (cached && cached.matchType === 'semantic') {
  console.log('Found semantically similar cached response');
}

// Cache warming
cache.warm([
  { request: { content: 'Q1' }, response: { answer: 'A1' } },
  { request: { content: 'Q2' }, response: { answer: 'A2' } }
]);

// Invalidation
cache.invalidateByTag('javascript');
cache.invalidateByPattern(/test-.*/);
```

## Configuration

### Scoring Weights

```javascript
const weights = {
  QUALITY: 0.40,  // Model quality/reliability
  COST: 0.30,     // Cost per token
  LATENCY: 0.20,  // Response time
  LOAD: 0.10      // Current load
};
```

### Default Models

- `claude-sonnet-4-6` - Claude Sonnet 4.6 (high quality)
- `claude-sonnet-4-5` - Claude Sonnet 4.5 (balanced)
- `claude-opus-4` - Claude Opus 4 (premium)
- `kimi-k2` - Kimi K2 (long context)
- `gpt-4o` - GPT-4o (versatile)
- `gpt-4o-mini` - GPT-4o Mini (cost-effective)

### Fallback Chains

- **standard**: Claude 4.6 → Claude 4.5 → GPT-4o → GPT-4o-mini
- **premium**: Opus → Claude 4.6 → Claude 4.5
- **economy**: GPT-4o-mini → Kimi K2 → GPT-4o
- **speed**: GPT-4o-mini → GPT-4o → Kimi K2

## API Reference

### ModelRouter

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize the router |
| `registerModel(profile)` | Register a new model |
| `routeTask(task)` | Route task to best model |
| `analyzeTaskComplexity(task)` | Analyze task complexity |
| `getModelScores(task, complexity)` | Get model scores |
| `selectModel(scores)` | Select best model from scores |
| `fallbackRoute(task, failedModel)` | Get fallback route |
| `getMetrics()` | Get routing metrics |

### Orchestrator

| Method | Description |
|--------|-------------|
| `executeSingle(task)` | Single model execution |
| `executeParallel(tasks, options)` | Parallel execution |
| `executeChain(tasks, options)` | Sequential execution |
| `executeSwarm(task, config)` | Agent swarm execution |
| `executePlan(plan)` | Planned execution |
| `executeCowork(tasks, options)` | Collaborative execution |

### ContextManager

| Method | Description |
|--------|-------------|
| `createContext(sessionId, data, options)` | Create context |
| `shareContext(contextId, targetModel, options)` | Share context |
| `updateContext(contextId, updates)` | Update context |
| `compactContext(contextId, strategy)` | Compact context |
| `setState(key, value, options)` | Set state |
| `getState(key, defaultValue)` | Get state |

### FallbackSystem

| Method | Description |
|--------|-------------|
| `executeWithFallback(task, options)` | Execute with fallback |
| `registerFallbackChain(name, models)` | Register chain |
| `getFallbackChain(name)` | Get chain |
| `restoreContext(executionId)` | Restore context |

### SemanticCache

| Method | Description |
|--------|-------------|
| `get(request, options)` | Get cached response |
| `set(request, response, options)` | Cache response |
| `warm(entries)` | Warm cache |
| `invalidateByTag(tag)` | Invalidate by tag |
| `invalidateByPattern(pattern)` | Invalidate by pattern |

## Examples

See `examples/router-example.js` for comprehensive usage examples:

```bash
node examples/router-example.js
```

## Testing

```bash
# Run router tests
node tests/router.test.js
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Router System                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Model     │  │ Orchestrator │  │    Context   │      │
│  │    Router    │  │              │  │   Manager    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐      │
│  │   Fallback   │  │    Cache     │  │    State     │      │
│  │    System    │  │   (Semantic) │  │   Manager    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## License

MIT
