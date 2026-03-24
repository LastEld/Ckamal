# Analysis Module

## Overview

The Analysis Module provides advanced Retrieval-Augmented Generation (RAG) capabilities for CogniMesh v5.0. It enables intelligent document retrieval, semantic search, and context-aware responses through a sophisticated embedding-based architecture with quality assurance and memory management.

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Analysis Module                             │
├──────────────┬──────────────────────────┬───────────────────────┤
│   RAGSystem  │      Memory QR Layer     │   Quality Engine      │
├──────────────┤  ┌────────────────────┐  │  ┌─────────────────┐  │
│ Embedding    │  │ Short-term Memory  │  │  │ Relevance Check │  │
│ Generation   │  │ Long-term Memory   │  │  │ Coverage Check  │  │
│ Vector Store │  │ Consolidation      │  │  │ Diversity Check │  │
│ Retrieval    │  └────────────────────┘  │  └─────────────────┘  │
└──────────────┴──────────────────────────┴───────────────────────┘
```

### Component Interaction

```
User Query → Embedding Generator → Vector Search → Memory QR → 
Quality Check → Results
                ↓
          Document Store
          (Chunks + Embeddings)
```

## Components

### RAGSystem

The core RAG orchestrator that coordinates all operations:

- **Document Ingestion**: Processes documents into chunks with embeddings
- **Vector Storage**: Manages vector database connections
- **Semantic Search**: Retrieves relevant context using vector similarity
- **Query Processing**: Handles filtering and result ranking

### EmbeddingGenerator

Handles text-to-vector conversion:

- **Model Management**: Supports multiple embedding models
- **Batch Processing**: Efficient bulk embedding generation
- **Caching**: LRU cache for frequently accessed embeddings
- **Dimension Configuration**: Flexible vector dimensions

### MemoryQR Layer

Query-Response memory system for conversational context:

- **Short-term Memory**: Recent interactions (session-based)
- **Long-term Memory**: Important historical queries
- **Consolidation**: Automatic promotion based on importance
- **Recall**: Semantic search through past interactions

### QualityChecker

Ensures RAG output quality:

- **Relevance Scoring**: Measures query-result alignment
- **Coverage Analysis**: Checks for information completeness
- **Diversity Metrics**: Prevents redundant results
- **Issue Detection**: Identifies quality problems

### MetricsCollector

Tracks RAG performance:

- **Latency Tracking**: Query and embedding timing
- **Hit Rates**: Cache performance metrics
- **Token Usage**: Embedding token consumption
- **Result Statistics**: Retrieval effectiveness

## Usage

### Basic Document Search

```javascript
import { RAGSystem } from './analysis/index.js';

const rag = new RAGSystem({
  embeddingModel: 'text-embedding-3-small',
  chunkSize: 512,
  chunkOverlap: 50,
  topK: 5
});

await rag.initialize();

// Add documentation
await rag.addDocument(`
# CogniMesh Architecture

CogniMesh follows a modular architecture with clear separation of concerns...
`, {
  source: 'architecture.md',
  category: 'documentation'
});

// Search
const results = await rag.query('What is the architecture?');
results.forEach(r => {
  console.log(`Score: ${r.score}, Content: ${r.content.substring(0, 100)}...`);
});
```

### Batch Document Processing

```javascript
const documents = [
  { content: 'Doc 1...', metadata: { source: 'file1.txt' } },
  { content: 'Doc 2...', metadata: { source: 'file2.txt' } },
  { content: 'Doc 3...', metadata: { source: 'file3.txt' } }
];

const ids = await rag.addDocuments(documents);
console.log(`Added ${ids.length} documents`);
```

### Advanced Query with Filters

```javascript
const results = await rag.query('deployment process', {
  topK: 10,
  filters: {
    category: 'documentation',
    source: { $in: ['deployment.md', 'ops.md'] }
  }
});
```

### Memory QR for Conversations

```javascript
import { MemoryQR } from './analysis/index.js';

const memory = new MemoryQR(rag, {
  shortTermCapacity: 50,
  longTermThreshold: 0.7
});

// Store interaction
await memory.remember(
  'How do I configure alerts?',
  'Alerts can be configured in src/alerts/config.js...',
  0.85  // High importance
);

// Recall related memories
const memories = await memory.recall('alert configuration', {
  minImportance: 0.6
});

memories.forEach(m => {
  console.log(`Previous Q: ${m.query}`);
  console.log(`Previous A: ${m.response}`);
});
```

### Quality Assessment

```javascript
import { QualityChecker } from './analysis/index.js';

const checker = new QualityChecker({
  minRelevanceScore: 0.75,
  coverageThreshold: 0.8
});

const report = checker.checkRetrievalQuality(
  'What is CogniMesh?',
  results
);

if (report.issues.length > 0) {
  console.warn('Quality issues:', report.issues);
  console.log('Recommendations:', report.recommendations);
}
```

### Performance Monitoring

```javascript
import { MetricsCollector } from './analysis/index.js';

const metrics = new MetricsCollector();

// After queries
metrics.recordRetrieval(query, results, duration);

// Get statistics
const stats = metrics.getStats();
console.log(`Cache hit rate: ${stats.cacheHitRate}%`);
console.log(`Avg latency: ${stats.averageLatency}ms`);
```

## Configuration

### RAGSystem Configuration

```javascript
{
  // Embedding configuration
  embeddingModel: 'text-embedding-3-small',  // or 'text-embedding-3-large'
  embeddingDimensions: 1536,                    // Model-specific
  
  // Chunking configuration
  chunkSize: 512,                              // Characters per chunk
  chunkOverlap: 50,                            // Overlap between chunks
  chunkingStrategy: 'sentence',                // 'sentence' | 'paragraph' | 'fixed'
  
  // Retrieval configuration
  topK: 5,                                     // Default results count
  minScore: 0.7,                               // Minimum similarity score
  
  // Vector store
  vectorStore: 'chroma',                       // 'chroma' | 'pinecone' | 'weaviate'
  vectorStoreConfig: {
    collection: 'cognimesh_docs',
    distance: 'cosine'
  },
  
  // Caching
  cacheEnabled: true,
  cacheMaxSize: 1000,
  
  // Quality settings
  qualityCheckEnabled: true
}
```

### EmbeddingGenerator Configuration

```javascript
{
  model: 'text-embedding-3-small',
  dimensions: 1536,
  batchSize: 100,
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000
}
```

### MemoryQR Configuration

```javascript
{
  shortTermCapacity: 50,        // Max short-term memories
  longTermCapacity: 1000,       // Max long-term memories
  longTermThreshold: 0.7,       // Importance threshold for promotion
  consolidationInterval: 3600000, // 1 hour
  decayFactor: 0.95             // Memory decay rate
}
```

### QualityChecker Configuration

```javascript
{
  minRelevanceScore: 0.75,
  coverageThreshold: 0.8,
  diversityThreshold: 0.6,
  maxLatencyMs: 2000,
  enableDetailedReports: true
}
```

## Best Practices

1. **Optimize Chunk Size**: Balance between context and precision
2. **Use Overlap**: Ensure context continuity between chunks
3. **Cache Embeddings**: Reduce API calls and latency
4. **Filter Early**: Apply metadata filters before vector search
5. **Monitor Quality**: Regular quality assessments
6. **Manage Memory**: Regular consolidation for Memory QR
7. **Handle Errors**: Implement retry logic for embedding generation
8. **Batch Operations**: Process documents in batches for efficiency
