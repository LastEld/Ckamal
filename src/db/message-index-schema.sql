-- ============================================================================
-- CogniMesh v5.0 - FTS5 Message Indexing Schema
-- Comprehensive full-text search for messages with ranking and highlighting
-- ============================================================================

-- ----------------------------------------------------------------------------
-- MESSAGES_FTS - Primary FTS5 virtual table for messages
-- ----------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    -- Content fields
    content,                   -- Full message content
    content_plain,             -- Plain text version (no markdown/formatting)
    
    -- Metadata columns (stored, not indexed)
    conversation_id UNINDEXED,
    sender_id UNINDEXED,
    sender_type UNINDEXED,
    message_type UNINDEXED,
    sent_at UNINDEXED,
    
    -- FTS configuration
    tokenize='porter unicode61 remove_diacritics 2',
    prefix='2,3,4',           -- Prefix indexes for autocomplete
    
    -- External content table
    content_rowid='id',
    content='messages'
);

-- ----------------------------------------------------------------------------
-- MESSAGES_FTS_AUX - Auxiliary table for FTS metadata
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages_fts_aux (
    rowid INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL UNIQUE,
    
    -- Indexing status
    indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    index_version INTEGER DEFAULT 1,
    
    -- Content stats
    word_count INTEGER,
    char_count INTEGER,
    
    -- Search metadata
    searchable_content TEXT,   -- Content as actually indexed
    keywords TEXT,             -- Extracted keywords (JSON array)
    
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_fts_aux_message ON messages_fts_aux(message_id);
CREATE INDEX idx_fts_aux_indexed ON messages_fts_aux(indexed_at);

-- ----------------------------------------------------------------------------
-- MESSAGES_FTS_RANK_CACHE - Cached ranking results
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages_fts_rank_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Query hash for cache key
    query_hash TEXT NOT NULL,
    query_normalized TEXT NOT NULL,
    
    -- Search context
    conversation_id INTEGER,
    sender_id INTEGER,
    date_from DATETIME,
    date_to DATETIME,
    message_types TEXT,        -- JSON array
    
    -- Cached results
    results TEXT NOT NULL,     -- JSON array of {message_id, rank, snippet}
    result_count INTEGER,
    top_rank REAL,
    
    -- Cache metadata
    expires_at DATETIME,
    hit_count INTEGER DEFAULT 1,
    last_hit_at DATETIME,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(query_hash, conversation_id, sender_id)
);

CREATE INDEX idx_fts_rank_cache_hash ON messages_fts_rank_cache(query_hash);
CREATE INDEX idx_fts_rank_cache_context ON messages_fts_rank_cache(conversation_id);
CREATE INDEX idx_fts_rank_cache_expires ON messages_fts_rank_cache(expires_at);

-- ----------------------------------------------------------------------------
-- MESSAGE_SEARCH_LOGS - Search query logging
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_search_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
    
    -- Query info
    query_text TEXT NOT NULL,
    query_normalized TEXT,
    query_hash TEXT,
    
    -- Filters applied
    conversation_id INTEGER,
    sender_id INTEGER,
    sender_type TEXT,
    message_type TEXT,
    date_range TEXT,           -- JSON: {from, to}
    
    -- Results
    result_count INTEGER,
    top_result_id INTEGER,
    top_result_rank REAL,
    
    -- Performance
    search_time_ms INTEGER,
    fts_time_ms INTEGER,
    filter_time_ms INTEGER,
    
    -- User interaction
    result_clicked INTEGER,    -- Which result was clicked (1-based)
    time_to_click_ms INTEGER,
    
    -- Attribution
    user_id INTEGER,
    session_id TEXT,
    request_id TEXT,
    client_ip TEXT,
    
    searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (top_result_id) REFERENCES messages(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_search_logs_query ON message_search_logs(query_hash);
CREATE INDEX idx_search_logs_user ON message_search_logs(user_id);
CREATE INDEX idx_search_logs_conversation ON message_search_logs(conversation_id);
CREATE INDEX idx_search_logs_searched ON message_search_logs(searched_at);

-- ----------------------------------------------------------------------------
-- MESSAGE_SEARCH_SUGGESTIONS - Query suggestions/autocomplete
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_search_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    suggestion_text TEXT NOT NULL,
    suggestion_type TEXT DEFAULT 'term' CHECK (suggestion_type IN ('term', 'phrase', 'user', 'date')),
    
    -- Context
    source_query TEXT,         -- Original query that led to this suggestion
    conversation_id INTEGER,
    
    -- Usage stats
    frequency INTEGER DEFAULT 1,
    last_used_at DATETIME,
    click_count INTEGER DEFAULT 0,
    
    -- Ranking
    score REAL DEFAULT 1.0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(suggestion_text, conversation_id)
);

CREATE INDEX idx_search_suggestions_text ON message_search_suggestions(suggestion_text);
CREATE INDEX idx_search_suggestions_freq ON message_search_suggestions(frequency DESC);
CREATE INDEX idx_search_suggestions_score ON message_search_suggestions(score DESC);
CREATE INDEX idx_search_suggestions_conversation ON message_search_suggestions(conversation_id);

-- ----------------------------------------------------------------------------
-- FTS5 SYNC TRIGGERS - Keep FTS index in sync with messages table
-- ----------------------------------------------------------------------------

-- Insert trigger
CREATE TRIGGER IF NOT EXISTS trg_messages_fts_insert
AFTER INSERT ON messages
WHEN NEW.is_deleted = 0
BEGIN
    INSERT INTO messages_fts(
        rowid, 
        content, 
        content_plain,
        conversation_id,
        sender_id,
        sender_type,
        message_type,
        sent_at
    )
    VALUES (
        NEW.id,
        NEW.content,
        COALESCE(NEW.content_plain, NEW.content),
        NEW.conversation_id,
        NEW.sender_id,
        NEW.sender_type,
        NEW.message_type,
        NEW.sent_at
    );
    
    -- Update auxiliary stats
    INSERT INTO messages_fts_aux(
        message_id,
        word_count,
        char_count,
        searchable_content
    )
    VALUES (
        NEW.id,
        (SELECT COUNT(*) FROM (SELECT value FROM json_each(json_array(NEW.content_plain)))),
        LENGTH(COALESCE(NEW.content_plain, NEW.content)),
        COALESCE(NEW.content_plain, NEW.content)
    );
    
    -- Update conversation message count
    UPDATE conversations 
    SET message_count = message_count + 1,
        last_message_at = NEW.sent_at
    WHERE id = NEW.conversation_id;
END;

-- Update trigger
CREATE TRIGGER IF NOT EXISTS trg_messages_fts_update
AFTER UPDATE ON messages
WHEN NEW.is_deleted = 0 AND (
    OLD.content != NEW.content OR 
    OLD.content_plain != NEW.content_plain OR
    OLD.is_deleted != NEW.is_deleted
)
BEGIN
    UPDATE messages_fts SET
        content = NEW.content,
        content_plain = COALESCE(NEW.content_plain, NEW.content)
    WHERE rowid = NEW.id;
    
    UPDATE messages_fts_aux SET
        word_count = (SELECT COUNT(*) FROM (SELECT value FROM json_each(json_array(NEW.content_plain)))),
        char_count = LENGTH(COALESCE(NEW.content_plain, NEW.content)),
        searchable_content = COALESCE(NEW.content_plain, NEW.content),
        indexed_at = CURRENT_TIMESTAMP
    WHERE message_id = NEW.id;
END;

-- Delete trigger (soft delete - remove from FTS)
CREATE TRIGGER IF NOT EXISTS trg_messages_fts_soft_delete
AFTER UPDATE ON messages
WHEN NEW.is_deleted = 1 AND OLD.is_deleted = 0
BEGIN
    DELETE FROM messages_fts WHERE rowid = NEW.id;
END;

-- Hard delete trigger
CREATE TRIGGER IF NOT EXISTS trg_messages_fts_hard_delete
AFTER DELETE ON messages
BEGIN
    DELETE FROM messages_fts WHERE rowid = OLD.id;
    DELETE FROM messages_fts_aux WHERE message_id = OLD.id;
END;

-- ----------------------------------------------------------------------------
-- FACETED SEARCH TABLES
-- ----------------------------------------------------------------------------

-- Message facets for faceted navigation
CREATE TABLE IF NOT EXISTS message_facets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    
    facet_date DATE,           -- Message date
    facet_sender_id INTEGER,
    facet_sender_type TEXT,
    facet_message_type TEXT,
    
    -- Counters
    message_count INTEGER DEFAULT 0,
    
    -- Top terms for this facet combination
    top_terms TEXT,            -- JSON array of {term, count}
    
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(conversation_id, facet_date, facet_sender_id, facet_message_type)
);

CREATE INDEX idx_message_facets_conversation ON message_facets(conversation_id);
CREATE INDEX idx_message_facets_date ON message_facets(facet_date);
CREATE INDEX idx_message_facets_sender ON message_facets(facet_sender_id);

-- ----------------------------------------------------------------------------
-- HELPER VIEWS
-- ----------------------------------------------------------------------------

-- Searchable messages view (excludes deleted)
CREATE VIEW IF NOT EXISTS v_searchable_messages AS
SELECT 
    m.id,
    m.uuid,
    m.conversation_id,
    m.parent_id,
    m.sender_id,
    m.sender_type,
    m.message_type,
    m.content,
    m.content_plain,
    m.tokens_used,
    m.sent_at,
    m.created_at,
    c.title as conversation_title,
    u.username as sender_username,
    u.display_name as sender_display_name
FROM messages m
LEFT JOIN conversations c ON m.conversation_id = c.id
LEFT JOIN users u ON m.sender_id = u.id
WHERE m.is_deleted = 0;

-- Search results with ranking view
CREATE VIEW IF NOT EXISTS v_message_search_results AS
SELECT 
    m.*,
    rank as search_rank,
    highlight(messages_fts, 0, '<mark>', '</mark>') as content_highlighted,
    snippet(messages_fts, 0, '<b>', '</b>', '...', 32) as content_snippet
FROM messages_fts
JOIN messages m ON messages_fts.rowid = m.id
WHERE m.is_deleted = 0;

-- ----------------------------------------------------------------------------
-- UPDATE TRIGGERS FOR AUXILIARY TABLES
-- ----------------------------------------------------------------------------

CREATE TRIGGER IF NOT EXISTS trg_search_suggestions_updated_at
AFTER UPDATE ON message_search_suggestions
FOR EACH ROW
BEGIN
    UPDATE message_search_suggestions 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;

-- ----------------------------------------------------------------------------
-- FTS5 OPTIMIZATION FUNCTIONS (to be called periodically)
-- ----------------------------------------------------------------------------

-- Run these periodically for maintenance:
-- INSERT INTO messages_fts(messages_fts) VALUES('optimize');
-- INSERT INTO messages_fts(messages_fts) VALUES('integrity-check');

-- Rebuild index if needed:
-- INSERT INTO messages_fts(messages_fts) VALUES('rebuild');

-- ----------------------------------------------------------------------------
-- SAMPLE QUERIES (documentation)
-- ----------------------------------------------------------------------------

/*
-- Basic full-text search
SELECT * FROM messages_fts WHERE content MATCH 'search term';

-- Search with ranking
SELECT rowid, rank, * FROM messages_fts 
WHERE content MATCH 'search term'
ORDER BY rank;

-- Search with highlighting
SELECT rowid, 
    highlight(messages_fts, 0, '<mark>', '</mark>') as highlighted,
    snippet(messages_fts, 0, '<b>', '</b>', '...', 32) as snippet
FROM messages_fts 
WHERE content MATCH 'search term';

-- Prefix search (autocomplete)
SELECT DISTINCT term FROM messages_fts_vocab 
WHERE term LIKE 'prefix%' 
ORDER BY doc_count DESC 
LIMIT 10;

-- Phrase search
SELECT * FROM messages_fts WHERE content MATCH '"exact phrase"';

-- Boolean search
SELECT * FROM messages_fts WHERE content MATCH 'term1 AND term2 NOT term3';

-- Near search (within N tokens)
SELECT * FROM messages_fts WHERE content MATCH 'term1 NEAR/5 term2';

-- Filtered search with join
SELECT m.*, rank 
FROM messages_fts fts
JOIN messages m ON fts.rowid = m.id
WHERE fts.content MATCH 'search'
    AND m.conversation_id = 123
    AND m.sent_at > datetime('now', '-7 days')
ORDER BY rank;
*/
