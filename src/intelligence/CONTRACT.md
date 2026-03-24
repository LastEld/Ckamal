# Intelligence Module Contract

## Overview

The Intelligence Module provides AI-powered components for CogniMesh v5.0. It includes optimization, classification, prediction, caching, query optimization, task scheduling, and pattern recognition capabilities.

## Public Interfaces

### AIOptimizer

Optimizes AI model selection and parameters.

```javascript
import { AIOptimizer } from './intelligence/index.js';

const optimizer = new AIOptimizer({
  defaultModel: 'claude-3-sonnet',
  costAware: true
});
```

**Methods:**

- `constructor(options)` - Creates AI optimizer
  - `options.defaultModel` - Default model
  - `options.costAware` - Consider cost in optimization

- `optimizeRequest(request)` - Optimizes request
  - `request.task` - Task type
  - `request.content` - Content to process
  - `request.constraints` - Optimization constraints
  - Returns: OptimizedRequest

- `selectModel(task, constraints)` - Selects best model
  - Returns: ModelRecommendation

- `estimateCost(request, model)` - Estimates execution cost
  - Returns: CostEstimate

### IntentClassifier

Classifies natural language intents.

- `constructor(options)` - Creates classifier
  - `options.labels` - Intent labels
  - `options.threshold` - Confidence threshold

- `train(examples)` - Trains classifier
  - `examples` - Training data
  - Returns: Promise<void>

- `classify(text)` - Classifies text
  - Returns: ClassificationResult

- `batchClassify(texts)` - Classifies multiple texts
  - Returns: ClassificationResult[]

- `addExample(example)` - Adds training example
  - Returns: void

### Predictor

Predicts usage patterns and trends.

- `constructor(options)` - Creates predictor

- `forecast(data, horizon)` - Forecasts future values
  - `data` - Historical data
  - `horizon` - Prediction horizon
  - Returns: ForecastResult

- `detectAnomaly(data)` - Detects anomalies
  - Returns: AnomalyResult[]

- `detectTrend(data)` - Detects trends
  - Returns: TrendResult

- `getConfidence()` - Returns model confidence
  - Returns: number

### IntelligentCache

AI-powered caching with semantic search.

- `constructor(options)` - Creates intelligent cache
  - `options.maxSize` - Maximum cache size
  - `options.similarityThreshold` - Similarity threshold

- `get(key)` - Gets cached value
  - Returns: any | undefined

- `set(key, value, metadata)` - Sets cache value
  - Returns: void

- `semanticSearch(query)` - Searches by semantic similarity
  - Returns: SearchResult[]

- `invalidate(pattern)` - Invalidates matching entries
  - Returns: number

- `getStats()` - Returns cache statistics
  - Returns: CacheStats

### QueryOptimizer

Optimizes database queries.

- `constructor(options)` - Creates query optimizer

- `optimize(query)` - Optimizes query
  - Returns: OptimizedQuery

- `suggestIndexes(workload)` - Suggests indexes
  - Returns: IndexSuggestion[]

- `estimateComplexity(query)` - Estimates query complexity
  - Returns: ComplexityEstimate

- `analyzeQuery(query)` - Analyzes query performance
  - Returns: QueryAnalysis

### Scheduler

AI-powered task scheduling.

- `constructor(options)` - Creates scheduler

- `schedule(tasks, resources)` - Schedules tasks
  - Returns: ScheduleResult

- `optimizeSchedule(schedule)` - Optimizes existing schedule
  - Returns: OptimizedSchedule

- `getEstimatedCompletion(schedule)` - Estimates completion time
  - Returns: number

### PatternRecognizer

Recognizes patterns in sequences.

- `constructor(options)` - Creates pattern recognizer

- `learn(sequence)` - Learns from sequence
  - Returns: void

- `recognize(sequence)` - Recognizes patterns
  - Returns: RecognitionResult

- `predictNext(sequence)` - Predicts next items
  - Returns: PredictionResult

- `findAnomalies(sequence)` - Finds anomalies in sequence
  - Returns: AnomalyPoint[]

## Data Structures

### OptimizedRequest

```typescript
interface OptimizedRequest {
  model: string;
  parameters: ModelParameters;
  estimatedCost: number;
  estimatedLatency: number;
  confidence: number;
}
```

### ClassificationResult

```typescript
interface ClassificationResult {
  label: string;
  confidence: number;
  scores: Record<string, number>;
}
```

### ForecastResult

```typescript
interface ForecastResult {
  predictions: number[];
  confidenceInterval: [number, number];
  confidence: number;
}
```

### SearchResult

```typescript
interface SearchResult {
  key: string;
  value: any;
  similarity: number;
  metadata: any;
}
```

### OptimizedQuery

```typescript
interface OptimizedQuery {
  sql: string;
  params: any[];
  estimatedTime: number;
  suggestedIndexes: string[];
}
```

### ScheduleResult

```typescript
interface ScheduleResult {
  assignments: TaskAssignment[];
  makespan: number;
  efficiency: number;
}
```

### Pattern

```typescript
interface Pattern {
  id: string;
  sequence: string[];
  frequency: number;
  confidence: number;
}
```

## Events

The Intelligence module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `optimized` | `{ request, result }` | Request optimized |
| `classified` | `{ text, result }` | Intent classified |
| `forecasted` | `{ data, result }` | Forecast generated |
| `cache:hit` | `{ key }` | Cache hit |
| `cache:miss` | `{ key }` | Cache miss |
| `query:optimized` | `{ query, result }` | Query optimized |
| `scheduled` | `{ tasks, schedule }` | Tasks scheduled |
| `pattern:recognized` | `{ pattern }` | Pattern recognized |

## Error Handling

### IntelligenceError

Base error for intelligence operations.

### OptimizationError

Thrown when optimization fails.

### ClassificationError

Thrown when classification fails.

### PredictionError

Thrown when prediction fails.

## Usage Example

```javascript
import { 
  AIOptimizer, 
  IntentClassifier, 
  createIntelligenceSuite 
} from './intelligence/index.js';

// Create optimizer
const optimizer = new AIOptimizer();

const result = optimizer.optimizeRequest({
  task: 'code_review',
  content: code,
  constraints: { maxLatencyMs: 2000 }
});

// Classify intent
const classifier = new IntentClassifier({
  labels: ['create_task', 'search', 'update', 'delete']
});

classifier.train([
  { input: 'create a new task', labels: ['create_task'] },
  { input: 'find all pending', labels: ['search'] }
]);

const intent = classifier.classify('add a task for tomorrow');

// Full suite
const suite = createIntelligenceSuite({});
```
