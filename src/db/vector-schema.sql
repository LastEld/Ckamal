-- ============================================================================
-- CogniMesh v5.0 - Vector/RAG Schema Extension
-- SQLite-compatible vector storage with sqlite-vec extension
-- ============================================================================

-- ----------------------------------------------------------------------------
-- DOCUMENTS - Source documents for RAG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    context_id INTEGER NOT NULL,
    
    -- Document metadata
    title TEXT,
    source_url TEXT,
    source_type TEXT DEFAULT 'upload' CHECK (source_type IN ('upload', 'url', 'api', 'sync', 'import')),
    file_path TEXT,
    file_name TEXT,
    file_size_bytes INTEGER,
    file_hash TEXT,            -- SHA256 for deduplication
    mime_type TEXT,
    
    -- Content extraction
    content_raw TEXT,          -- Original content
    content_extracted TEXT,    -- Extracted text content
    content_format TEXT,       -- 'markdown', 'plain', 'html', etc.
    language TEXT DEFAULT 'en',
    
    -- Processing status
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'extracting', 'chunking', 'embedding', 'completed', 'failed')),
    processing_error TEXT,
    processed_at DATETIME,
    
    -- Document stats
    page_count INTEGER,
    word_count INTEGER,
    char_count INTEGER,
    chunk_count INTEGER DEFAULT 0,
    
    -- Versioning
    version INTEGER DEFAULT 1,
    parent_document_id INTEGER,
    
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    
    FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_document_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE INDEX idx_documents_context ON documents(context_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_status ON documents(processing_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_source ON documents(source_type);
CREATE INDEX idx_documents_hash ON documents(file_hash);
CREATE INDEX idx_documents_parent ON documents(parent_document_id);

-- ----------------------------------------------------------------------------
-- DOCUMENT_CHUNKS - Text chunks for vector embedding
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    document_id INTEGER NOT NULL,
    context_id INTEGER NOT NULL,
    
    -- Chunk positioning
    chunk_index INTEGER NOT NULL,
    start_char INTEGER,
    end_char INTEGER,
    start_page INTEGER,
    end_page INTEGER,
    
    -- Chunk content
    content TEXT NOT NULL,
    content_plain TEXT,        -- Plain text for FTS
    token_count INTEGER,
    char_count INTEGER,
    
    -- Chunk metadata
    chunk_type TEXT DEFAULT 'paragraph' CHECK (chunk_type IN ('paragraph', 'sentence', 'section', 'page', 'semantic')),
    overlap_tokens INTEGER DEFAULT 0,  -- Overlap with previous chunk
    heading_hierarchy TEXT,    -- JSON array of parent headings
    
    -- Embedding status
    embedding_status TEXT DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
    embedding_model TEXT,
    embedding_dimensions INTEGER,
    embedded_at DATETIME,
    
    -- Quality scores
    relevance_score REAL,      -- Computed relevance if available
    quality_score REAL,        -- Content quality score
    
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE,
    UNIQUE(document_id, chunk_index)
);

CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_context ON document_chunks(context_id);
CREATE INDEX idx_chunks_status ON document_chunks(embedding_status);
CREATE INDEX idx_chunks_type ON document_chunks(chunk_type);

-- ----------------------------------------------------------------------------
-- VECTOR_EMBEDDINGS - Chunk embeddings (sqlite-vec virtual table)
-- ----------------------------------------------------------------------------
-- Note: Requires sqlite-vec extension
-- CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings USING vec0(
--     chunk_id INTEGER PRIMARY KEY,
--     embedding FLOAT[1536]  -- Dimension matches embedding model
-- );

-- Alternative: Regular table for storing embeddings as BLOB
CREATE TABLE IF NOT EXISTS chunk_embeddings_fallback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id INTEGER NOT NULL UNIQUE,
    embedding BLOB NOT NULL,   -- Raw float32 array
    dimensions INTEGER NOT NULL,
    model_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE CASCADE
);

CREATE INDEX idx_embeddings_chunk ON chunk_embeddings_fallback(chunk_id);
CREATE INDEX idx_embeddings_model ON chunk_embeddings_fallback(model_name);

-- ----------------------------------------------------------------------------
-- EMBEDDING_MODELS - Supported embedding models
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS embedding_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    
    -- Model info
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,    -- 'openai', 'cohere', 'local', 'huggingface'
    model_id TEXT NOT NULL,    -- API model identifier
    
    -- Specifications
    dimensions INTEGER NOT NULL,
    max_tokens INTEGER,
    supports_batching BOOLEAN DEFAULT 1,
    batch_size INTEGER DEFAULT 100,
    
    -- Configuration
    api_endpoint TEXT,
    config TEXT DEFAULT '{}',  -- JSON: temperature, etc.
    
    -- Status
    is_active BOOLEAN DEFAULT 1,
    is_default BOOLEAN DEFAULT 0,
    priority INTEGER DEFAULT 0,
    
    -- Usage stats
    total_embeddings INTEGER DEFAULT 0,
    total_tokens_processed INTEGER DEFAULT 0,
    avg_latency_ms REAL,
    
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_embedding_models_active ON embedding_models(is_active);
CREATE INDEX idx_embedding_models_default ON embedding_models(is_default) WHERE is_default = 1;
CREATE INDEX idx_embedding_models_provider ON embedding_models(provider);

-- ----------------------------------------------------------------------------
-- VECTOR_SEARCH_CACHE - Cached vector search results
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vector_search_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT NOT NULL UNIQUE,  -- Hash of query + parameters
    
    -- Query info
    context_id INTEGER,
    query_text TEXT,
    query_embedding BLOB,
    embedding_model TEXT,
    
    -- Search parameters
    top_k INTEGER,
    min_score REAL,
    filters TEXT,              -- JSON filters applied
    
    -- Results (stored as JSON array of chunk IDs with scores)
    results TEXT NOT NULL,
    result_count INTEGER,
    
    -- Cache metadata
    hit_count INTEGER DEFAULT 1,
    last_hit_at DATETIME,
    expires_at DATETIME,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE
);

CREATE INDEX idx_vector_cache_key ON vector_search_cache(cache_key);
CREATE INDEX idx_vector_cache_context ON vector_search_cache(context_id);
CREATE INDEX idx_vector_cache_expires ON vector_search_cache(expires_at);

-- ----------------------------------------------------------------------------
-- SIMILARITY_QUERIES - Log of similarity searches
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS similarity_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    
    -- Query metadata
    context_id INTEGER NOT NULL,
    query_text TEXT,
    query_hash TEXT,           -- Hash for deduplication
    
    -- Parameters
    embedding_model TEXT,
    top_k INTEGER,
    min_score REAL,
    search_type TEXT DEFAULT 'cosine' CHECK (search_type IN ('cosine', 'euclidean', 'dot', 'hamming')),
    
    -- Filters
    filter_document_ids TEXT,  -- JSON array
    filter_date_from DATETIME,
    filter_date_to DATETIME,
    filter_metadata TEXT,      -- JSON metadata filters
    
    -- Results
    results_count INTEGER,
    top_score REAL,
    avg_score REAL,
    
    -- Performance
    query_time_ms INTEGER,
    embedding_time_ms INTEGER,
    
    -- Source
    user_id INTEGER,
    session_id TEXT,
    request_id TEXT,
    
    queried_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_sim_queries_context ON similarity_queries(context_id);
CREATE INDEX idx_sim_queries_hash ON similarity_queries(query_hash);
CREATE INDEX idx_sim_queries_user ON similarity_queries(user_id);
CREATE INDEX idx_sim_queries_queried ON similarity_queries(queried_at);

-- ----------------------------------------------------------------------------
-- KNOWLEDGE_GRAPHS - Graph representation of document relationships
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_graphs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    context_id INTEGER NOT NULL,
    
    name TEXT,
    description TEXT,
    
    -- Graph stats
    node_count INTEGER DEFAULT 0,
    edge_count INTEGER DEFAULT 0,
    
    -- Configuration
    extraction_model TEXT,
    relationship_types TEXT DEFAULT '[]',  -- JSON array
    
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE
);

CREATE INDEX idx_knowledge_graphs_context ON knowledge_graphs(context_id);

-- ----------------------------------------------------------------------------
-- KNOWLEDGE_NODES - Entities/concepts in knowledge graph
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    graph_id INTEGER NOT NULL,
    
    -- Node content
    label TEXT NOT NULL,
    node_type TEXT DEFAULT 'concept' CHECK (node_type IN ('concept', 'entity', 'topic', 'keyword', 'phrase')),
    description TEXT,
    
    -- Source reference
    source_chunk_ids TEXT,     -- JSON array of chunk IDs
    source_document_ids TEXT,  -- JSON array of document IDs
    
    -- Embedding (optional, for node-level search)
    embedding_id INTEGER,
    
    -- Graph properties
    centrality_score REAL,
    frequency INTEGER DEFAULT 1,
    
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (graph_id) REFERENCES knowledge_graphs(id) ON DELETE CASCADE
);

CREATE INDEX idx_knowledge_nodes_graph ON knowledge_nodes(graph_id);
CREATE INDEX idx_knowledge_nodes_label ON knowledge_nodes(label);
CREATE INDEX idx_knowledge_nodes_type ON knowledge_nodes(node_type);

-- ----------------------------------------------------------------------------
-- KNOWLEDGE_EDGES - Relationships between nodes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    graph_id INTEGER NOT NULL,
    
    source_node_id INTEGER NOT NULL,
    target_node_id INTEGER NOT NULL,
    
    relationship_type TEXT NOT NULL,
    relationship_strength REAL DEFAULT 1.0,
    
    -- Evidence
    evidence_count INTEGER DEFAULT 1,
    evidence_chunks TEXT,      -- JSON array of chunk IDs
    
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (graph_id) REFERENCES knowledge_graphs(id) ON DELETE CASCADE,
    FOREIGN KEY (source_node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    UNIQUE(source_node_id, target_node_id, relationship_type)
);

CREATE INDEX idx_knowledge_edges_graph ON knowledge_edges(graph_id);
CREATE INDEX idx_knowledge_edges_source ON knowledge_edges(source_node_id);
CREATE INDEX idx_knowledge_edges_target ON knowledge_edges(target_node_id);
CREATE INDEX idx_knowledge_edges_type ON knowledge_edges(relationship_type);

-- ----------------------------------------------------------------------------
-- RAG_SESSIONS - Retrieval-Augmented Generation sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    context_id INTEGER NOT NULL,
    conversation_id INTEGER,
    
    -- Session configuration
    embedding_model TEXT,
    generation_model TEXT,
    retrieval_config TEXT DEFAULT '{}',  -- JSON: top_k, min_score, etc.
    
    -- Stats
    query_count INTEGER DEFAULT 0,
    total_retrieved_chunks INTEGER DEFAULT 0,
    total_tokens_used INTEGER DEFAULT 0,
    
    -- Quality metrics
    avg_relevance_score REAL,
    feedback_positive INTEGER DEFAULT 0,
    feedback_negative INTEGER DEFAULT 0,
    
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_query_at DATETIME,
    
    FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);

CREATE INDEX idx_rag_sessions_context ON rag_sessions(context_id);
CREATE INDEX idx_rag_sessions_conversation ON rag_sessions(conversation_id);

-- ----------------------------------------------------------------------------
-- RAG_QUERIES - Individual RAG queries within sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    session_id INTEGER NOT NULL,
    
    -- Query
    user_query TEXT NOT NULL,
    retrieved_chunks TEXT NOT NULL,  -- JSON array of {chunk_id, score, content}
    context_text TEXT,               -- Concatenated retrieved text
    
    -- Response
    generated_response TEXT,
    response_tokens INTEGER,
    
    -- Performance
    retrieval_time_ms INTEGER,
    generation_time_ms INTEGER,
    total_time_ms INTEGER,
    
    -- Feedback
    user_feedback INTEGER,     -- -1, 0, 1
    feedback_comment TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES rag_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_rag_queries_session ON rag_queries(session_id);
CREATE INDEX idx_rag_queries_created ON rag_queries(created_at);

-- ----------------------------------------------------------------------------
-- FTS5 VIRTUAL TABLES for full-text search
-- ----------------------------------------------------------------------------

-- Document content FTS
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    content_extracted,
    title,
    content_rowid='id',
    content='documents'
);

-- Chunk content FTS
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    content_plain,
    content_rowid='id',
    content='document_chunks'
);

-- ----------------------------------------------------------------------------
-- FTS5 SYNC TRIGGERS
-- ----------------------------------------------------------------------------

-- Documents FTS triggers
CREATE TRIGGER IF NOT EXISTS trg_documents_fts_insert
AFTER INSERT ON documents
WHEN NEW.content_extracted IS NOT NULL
BEGIN
    INSERT INTO documents_fts(rowid, content_extracted, title)
    VALUES (NEW.id, NEW.content_extracted, NEW.title);
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_fts_update
AFTER UPDATE ON documents
WHEN NEW.content_extracted IS NOT NULL AND (
    OLD.content_extracted != NEW.content_extracted OR 
    OLD.title != NEW.title
)
BEGIN
    UPDATE documents_fts SET 
        content_extracted = NEW.content_extracted,
        title = NEW.title
    WHERE rowid = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_fts_delete
AFTER DELETE ON documents
BEGIN
    DELETE FROM documents_fts WHERE rowid = OLD.id;
END;

-- Chunks FTS triggers
CREATE TRIGGER IF NOT EXISTS trg_chunks_fts_insert
AFTER INSERT ON document_chunks
WHEN NEW.content_plain IS NOT NULL
BEGIN
    INSERT INTO chunks_fts(rowid, content_plain)
    VALUES (NEW.id, NEW.content_plain);
END;

CREATE TRIGGER IF NOT EXISTS trg_chunks_fts_update
AFTER UPDATE ON document_chunks
WHEN NEW.content_plain IS NOT NULL AND OLD.content_plain != NEW.content_plain
BEGIN
    UPDATE chunks_fts SET content_plain = NEW.content_plain
    WHERE rowid = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_chunks_fts_delete
AFTER DELETE ON document_chunks
BEGIN
    DELETE FROM chunks_fts WHERE rowid = OLD.id;
END;

-- ----------------------------------------------------------------------------
-- Update triggers
-- ----------------------------------------------------------------------------

CREATE TRIGGER IF NOT EXISTS trg_documents_updated_at
AFTER UPDATE ON documents
FOR EACH ROW
BEGIN
    UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_document_chunks_updated_at
AFTER UPDATE ON document_chunks
FOR EACH ROW
BEGIN
    UPDATE document_chunks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_graphs_updated_at
AFTER UPDATE ON knowledge_graphs
FOR EACH ROW
BEGIN
    UPDATE knowledge_graphs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
