# Analysis Module Contract

## Overview

The Analysis Module provides Retrieval-Augmented Generation (RAG) capabilities for CogniMesh v5.0. It includes embedding generation, vector storage, quality assessment, and the Memory QR layer for enhanced context retrieval.

## Public Interfaces

### RAGSystem

Main class for RAG operations.

```javascript
import { RAGSystem } from './analysis/index.js';

const rag = new RAGSystem({
  embeddingModel: 'text-embedding-3-small',
  vectorStore: 'chroma',
  chunkSize: 512
});
```

**Methods:**

- `constructor(config)` - Creates RAG system instance
  - `config.embeddingModel` - Model for embeddings
  - `config.vectorStore` - Vector database type
  - `config.chunkSize` - Document chunk size
  - `config.chunkOverlap` - Overlap between chunks
  - `config.topK` - Number of results to retrieve

- `initialize()` - Initializes the RAG system
  - Returns: Promise<void>

- `addDocument(document, metadata)` - Adds a document to the knowledge base
  - `document` (string) - Document content
  - `metadata` (Object) - Document metadata
  - Returns: Promise<string> - Document ID

- `addDocuments(documents)` - Adds multiple documents
  - `documents` (Array<{content, metadata}>) - Documents to add
  - Returns: Promise<string[]> - Document IDs

- `query(question, options)` - Queries the knowledge base
  - `question` (string) - Query text
  - `options.filters` - Metadata filters
  - `options.topK` - Number of results
  - Returns: Promise<QueryResult[]>

- `deleteDocument(id)` - Removes a document
  - `id` (string) - Document ID
  - Returns: Promise<boolean>

- `updateDocument(id, updates)` - Updates document content/metadata
  - `id` (string) - Document ID
  - `updates` (Object) - Fields to update
  - Returns: Promise<Document>

- `clear()` - Clears all documents
  - Returns: Promise<void>

- `close()` - Closes connections
  - Returns: Promise<void>

### EmbeddingGenerator

Generates vector embeddings for text.

- `constructor(model, options)` - Creates embedding generator
  - `model` (string) - Model identifier
  - `options.dimensions` - Embedding dimensions
  - `options.batchSize` - Batch processing size

- `generate(text)` - Generates embedding for single text
  - `text` (string) - Input text
  - Returns: Promise<number[]>

- `generateBatch(texts)` - Generates embeddings for multiple texts
  - `texts` (string[]) - Input texts
  - Returns: Promise<number[][]>

- `getModelInfo()` - Returns model information
  - Returns: ModelInfo

### QualityChecker

Assesses quality of RAG operations.

- `constructor(options)` - Creates quality checker
  - `options.minRelevanceScore` - Minimum relevance threshold
  - `options.coverageThreshold` - Coverage threshold

- `checkRetrievalQuality(query, results)` - Checks retrieval quality
  - `query` (string) - Original query
  - `results` (QueryResult[]) - Retrieved results
  - Returns: RetrievalQualityReport

- `checkAnswerQuality(answer, sources)` - Checks answer quality
  - `answer` (string) - Generated answer
  - `sources` (QueryResult[]) - Source documents
  - Returns: AnswerQualityReport

- `checkContextRelevance(query, context)` - Checks context relevance
  - `query` (string) - Query text
  - `context` (string) - Context text
  - Returns: RelevanceScore

### MetricsCollector

Collects RAG performance metrics.

- `constructor()` - Creates metrics collector

- `recordRetrieval(query, results, duration)` - Records retrieval metrics
  - `query` (string) - Query text
  - `results` (QueryResult[]) - Retrieved results
  - `duration` (number) - Retrieval duration in ms

- `recordEmbedding(text, duration, tokens)` - Records embedding metrics
  - `text` (string) - Input text
  - `duration` (number) - Embedding duration
  - `tokens` (number) - Token count

- `getStats()` - Returns aggregated statistics
  - Returns: RAGStatistics

- `exportReport()` - Exports metrics report
  - Returns: MetricsReport

### MemoryQR

Memory Query-Response layer for enhanced context.

- `constructor(ragSystem, options)` - Creates MemoryQR instance
  - `ragSystem` (RAGSystem) - Parent RAG system
  - `options.shortTermCapacity` - Short-term memory capacity
  - `options.longTermThreshold` - Threshold for long-term storage

- `remember(query, response, importance)` - Stores query-response pair
  - `query` (string) - Query text
  - `response` (string) - Response text
  - `importance` (number) - Importance score (0-1)
  - Returns: Promise<string> - Memory ID

- `recall(query, options)` - Recalls relevant memories
  - `query` (string) - Query to match
  - `options.timeRange` - Time range filter
  - `options.minImportance` - Minimum importance
  - Returns: Promise<Memory[]>

- `forget(id)` - Removes a specific memory
  - `id` (string) - Memory ID
  - Returns: Promise<boolean>

- `consolidate()` - Consolidates short-term to long-term memory
  - Returns: Promise<ConsolidationResult>

- `getMemoryStats()` - Returns memory statistics
  - Returns: MemoryStatistics

### LRUCache

Least Recently Used cache for embeddings.

- `constructor(maxSize)` - Creates LRU cache
  - `maxSize` (number) - Maximum cache entries

- `get(key)` - Retrieves cached value
  - `key` (string) - Cache key
  - Returns: any | undefined

- `set(key, value)` - Stores value in cache
  - `key` (string) - Cache key
  - `value` (any) - Value to cache

- `has(key)` - Checks if key exists
  - `key` (string) - Cache key
  - Returns: boolean

- `clear()` - Clears all cache entries

## Data Structures

### QueryResult

```typescript
interface QueryResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score: number;           // Similarity score (0-1)
  distance: number;        // Vector distance
}
```

### Document

```typescript
interface Document {
  id: string;
  content: string;
  chunks: Chunk[];
  metadata: {
    source?: string;
    createdAt: string;
    updatedAt: string;
    tags?: string[];
    [key: string]: any;
  };
  embedding?: number[];
}
```

### Chunk

```typescript
interface Chunk {
  id: string;
  content: string;
  index: number;
  embedding: number[];
  startChar: number;
  endChar: number;
}
```

### Memory

```typescript
interface Memory {
  id: string;
  query: string;
  response: string;
  importance: number;
  accessCount: number;
  lastAccessed: string;
  createdAt: string;
  memoryType: 'short_term' | 'long_term';
}
```

### RetrievalQualityReport

```typescript
interface RetrievalQualityReport {
  relevanceScore: number;
  coverageScore: number;
  diversityScore: number;
  latencyMs: number;
  issues: QualityIssue[];
  recommendations: string[];
}
```

### RAGStatistics

```typescript
interface RAGStatistics {
  totalQueries: number;
  averageLatency: number;
  cacheHitRate: number;
  averageResultsPerQuery: number;
  embeddingStats: {
    totalEmbeddings: number;
    averageEmbeddingTime: number;
    totalTokens: number;
  };
}
```

## Events

The Analysis module emits events:

| Event | Payload | Description |
|-------|---------|-------------|
| `documentAdded` | `{ id, metadata }` | Document added to knowledge base |
| `documentDeleted` | `{ id }` | Document removed |
| `documentUpdated` | `{ id, changes }` | Document modified |
| `queryExecuted` | `{ query, resultCount, duration }` | Query completed |
| `embeddingGenerated` | `{ textLength, dimensions, duration }` | Embedding created |
| `cacheHit` | `{ key }` | Cache hit occurred |
| `cacheMiss` | `{ key }` | Cache miss occurred |
| `memoryStored` | `{ id, importance }` | Memory stored in QR layer |
| `memoryRecalled` | `{ id, relevance }` | Memory recalled |
| `qualityCheckComplete` | `{ report }` | Quality assessment finished |
| `error` | `{ error, context }` | Error occurred |

## Error Handling

### RAGError

Base error for RAG operations.

### EmbeddingError

Thrown when embedding generation fails.

- `code`: 'MODEL_ERROR', 'RATE_LIMIT', 'TIMEOUT'
- `model`: Model identifier

### VectorStoreError

Thrown when vector store operations fail.

- `code`: 'CONNECTION_ERROR', 'QUERY_ERROR', 'INDEX_ERROR'
- `store`: Store type

### QualityCheckError

Thrown when quality assessment fails.

### MemoryQRError

Thrown when Memory QR operations fail.

### CacheError

Thrown when cache operations fail.

## Usage Example

```javascript
import { RAGSystem, MemoryQR } from './analysis/index.js';

// Initialize RAG system
const rag = new RAGSystem({
  embeddingModel: 'text-embedding-3-small',
  chunkSize: 512,
  topK: 5
});

await rag.initialize();

// Add documents
await rag.addDocument(
  'CogniMesh is an AI-powered productivity system...',
  { source: 'documentation', category: 'overview' }
);

// Query
const results = await rag.query('What is CogniMesh?', {
  filters: { category: 'overview' }
});

// Use Memory QR
const memory = new MemoryQR(rag);
await memory.remember(
  'What is CogniMesh?',
  'CogniMesh is an AI-powered productivity system',
  0.9
);

// Cleanup
await rag.close();
```
