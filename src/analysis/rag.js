/**
 * @fileoverview Core RAG (Retrieval-Augmented Generation) system
 * @module analysis/rag
 */

import { EmbeddingGenerator } from './rag-embeddings.js';
import { LRUCache } from './lru-cache.js';
import { MetricsCollector } from './rag-metrics.js';

/**
 * @typedef {Object} Document
 * @property {string} id - Document identifier
 * @property {string} content - Document content
 * @property {number[]} embedding - Document embedding vector
 * @property {Object} metadata - Document metadata
 * @property {number} timestamp - Index timestamp
 * @property {number} version - Document version
 */

/**
 * @typedef {Object} SearchOptions
 * @property {number} [limit=10] - Maximum results to return
 * @property {number} [threshold=0.5] - Minimum similarity threshold
 * @property {boolean} [hybrid=true] - Use hybrid search (semantic + keyword)
 * @property {number} [semanticWeight=0.7] - Weight for semantic search (0-1)
 * @property {Object} [filters] - Metadata filters
 * @property {string[]} [includeFields] - Fields to include in results
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} id - Document ID
 * @property {string} content - Document content
 * @property {number} score - Combined relevance score
 * @property {number} semanticScore - Semantic similarity score
 * @property {number} keywordScore - Keyword match score
 * @property {Object} metadata - Document metadata
 */

/**
 * Core RAG System with hybrid search capabilities
 */
export class RAGSystem {
  /**
   * Creates a new RAGSystem instance
   * @param {Object} options - Configuration options
   * @param {EmbeddingGenerator} [options.embedder] - Custom embedding generator
   * @param {number} [options.cacheSize=5000] - Search result cache size
   * @param {Object} [options.db] - Database connection (for persistent storage)
   * @param {boolean} [options.trackMetrics=true] - Enable metrics tracking
   */
  constructor(options = {}) {
    this.embedder = options.embedder ?? new EmbeddingGenerator();
    this.trackMetrics = options.trackMetrics ?? true;
    
    if (this.trackMetrics) {
      this.metrics = new MetricsCollector();
    }

    // Document storage
    /** @type {Map<string, Document>} */
    this.documents = new Map();
    
    // Inverted index for keyword search
    /** @type {Map<string, Set<string>>} */
    this.invertedIndex = new Map();
    
    // Document embeddings for similarity search
    /** @type {Map<string, number[]>} */
    this.embeddings = new Map();

    // Search result cache
    this.searchCache = new LRUCache({
      maxSize: options.cacheSize ?? 5000,
      ttlMs: 5 * 60 * 1000 // 5 minutes
    });

    // Document statistics
    this.stats = {
      totalDocuments: 0,
      totalEmbeddings: 0,
      totalSearches: 0,
      totalIndexOperations: 0,
      averageDocumentLength: 0,
      lastIndexTime: null
    };
  }

  /**
   * Index a new document
   * @param {string} id - Document identifier
   * @param {string} content - Document content
   * @param {Object} [metadata={}] - Document metadata
   * @returns {Promise<Document>} Indexed document
   */
  async indexDocument(id, content, metadata = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('Document ID must be a non-empty string');
    }

    if (!content || typeof content !== 'string') {
      throw new Error('Document content must be a non-empty string');
    }

    // Generate embedding
    const embedResult = await this.embedder.generate(content);
    
    // Check if updating existing document
    const existingDoc = this.documents.get(id);
    const version = existingDoc ? existingDoc.version + 1 : 1;

    // Remove old index entries if updating
    if (existingDoc) {
      this._removeFromInvertedIndex(id, existingDoc.content);
    }

    // Create document
    const document = {
      id,
      content,
      embedding: embedResult.vector,
      metadata: {
        ...metadata,
        embeddingModel: embedResult.model,
        embeddingDimensions: embedResult.dimensions,
        processingTimeMs: embedResult.processingTimeMs
      },
      timestamp: Date.now(),
      version
    };

    // Store document
    this.documents.set(id, document);
    this.embeddings.set(id, embedResult.vector);

    // Update inverted index
    this._addToInvertedIndex(id, content);

    // Update stats
    this.stats.totalDocuments = this.documents.size;
    this.stats.totalEmbeddings = this.embeddings.size;
    this.stats.totalIndexOperations++;
    this.stats.lastIndexTime = Date.now();
    this._updateAverageDocumentLength();

    // Clear related cache entries
    this._invalidateSearchCache(id);

    return document;
  }

  /**
   * Search for documents
   * @param {string} query - Search query
   * @param {SearchOptions} [options={}] - Search options
   * @returns {Promise<SearchResult[]>} Search results
   */
  async search(query, options = {}) {
    const searchId = `search_${Date.now()}_${Math.random()}`;
    
    if (this.trackMetrics) {
      this.metrics.startQuery(searchId, query);
      this.metrics.startStage(searchId, 'embedding');
    }

    const limit = options.limit ?? 10;
    const threshold = options.threshold ?? 0.5;
    const hybrid = options.hybrid !== false;
    const semanticWeight = options.semanticWeight ?? 0.7;
    const keywordWeight = 1 - semanticWeight;

    // Check cache
    const cacheKey = this._searchCacheKey(query, options);
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      if (this.trackMetrics) {
        this.metrics.endQuery(searchId, { resultCount: cached.length, success: true });
      }
      return cached;
    }

    try {
      // Generate query embedding
      const queryEmbed = await this.embedder.generate(query);
      
      if (this.trackMetrics) {
        this.metrics.endStage(searchId, 'embedding', { 
          dimensions: queryEmbed.dimensions,
          cached: queryEmbed.cached 
        });
        this.metrics.startStage(searchId, 'retrieval');
      }

      // Semantic search
      let semanticResults = [];
      if (hybrid || semanticWeight > 0) {
        semanticResults = this._semanticSearch(
          queryEmbed.vector,
          limit * 2,
          threshold
        );
      }

      // Keyword search
      let keywordResults = [];
      if (hybrid || keywordWeight > 0) {
        keywordResults = this._keywordSearch(query, limit * 2);
      }

      // Merge results
      const mergedResults = this._mergeResults(
        semanticResults,
        keywordResults,
        semanticWeight,
        keywordWeight
      );

      // Apply filters
      let filteredResults = mergedResults;
      if (options.filters) {
        filteredResults = this._applyFilters(mergedResults, options.filters);
      }

      // Format and limit results
      const results = filteredResults
        .slice(0, limit)
        .map(r => this._formatResult(r, options.includeFields));

      // Cache results
      this.searchCache.set(cacheKey, results);
      this.stats.totalSearches++;

      if (this.trackMetrics) {
        this.metrics.endStage(searchId, 'retrieval', { resultCount: results.length });
        this.metrics.endQuery(searchId, { resultCount: results.length, success: true });
      }

      return results;
    } catch (error) {
      if (this.trackMetrics) {
        this.metrics.recordError(searchId, error);
      }
      throw error;
    }
  }

  /**
   * Delete a document
   * @param {string} id - Document ID
   * @returns {boolean} True if document was deleted
   */
  deleteDocument(id) {
    const doc = this.documents.get(id);
    if (!doc) return false;

    // Remove from indexes
    this._removeFromInvertedIndex(id, doc.content);
    this.embeddings.delete(id);
    this.documents.delete(id);

    // Update stats
    this.stats.totalDocuments = this.documents.size;
    this.stats.totalEmbeddings = this.embeddings.size;

    // Invalidate cache
    this._invalidateSearchCache(id);

    return true;
  }

  /**
   * Update a document
   * @param {string} id - Document ID
   * @param {string} content - New content
   * @param {Object} [metadata] - New metadata (merged with existing)
   * @returns {Promise<Document|null>} Updated document or null if not found
   */
  async updateDocument(id, content, metadata) {
    const doc = this.documents.get(id);
    if (!doc) return null;

    const newMetadata = metadata ? { ...doc.metadata, ...metadata } : doc.metadata;
    return this.indexDocument(id, content, newMetadata);
  }

  /**
   * Get a document by ID
   * @param {string} id - Document ID
   * @returns {Document|null} Document or null if not found
   */
  getDocument(id) {
    return this.documents.get(id) ?? null;
  }

  /**
   * Get multiple documents by ID
   * @param {string[]} ids - Document IDs
   * @returns {Document[]} Found documents
   */
  getDocuments(ids) {
    return ids
      .map(id => this.documents.get(id))
      .filter(Boolean);
  }

  /**
   * Check if document exists
   * @param {string} id - Document ID
   * @returns {boolean} True if document exists
   */
  hasDocument(id) {
    return this.documents.has(id);
  }

  /**
   * Get system statistics
   * @returns {Object} System statistics
   */
  getStats() {
    const cacheStats = this.searchCache.getStats();
    const metricStats = this.trackMetrics ? this.metrics.getStats() : null;

    return {
      ...this.stats,
      cache: cacheStats,
      metrics: metricStats,
      embedder: this.embedder.getCacheStats()
    };
  }

  /**
   * Clear all documents and indexes
   */
  clear() {
    this.documents.clear();
    this.embeddings.clear();
    this.invertedIndex.clear();
    this.searchCache.clear();
    this.embedder.clearCache();

    this.stats = {
      totalDocuments: 0,
      totalEmbeddings: 0,
      totalSearches: 0,
      totalIndexOperations: 0,
      averageDocumentLength: 0,
      lastIndexTime: null
    };

    if (this.trackMetrics) {
      this.metrics.clear();
    }
  }

  /**
   * Export all documents
   * @returns {Object} Export data
   */
  export() {
    return {
      documents: Array.from(this.documents.values()),
      stats: this.stats,
      exportedAt: Date.now()
    };
  }

  /**
   * Import documents
   * @param {Object} data - Import data
   * @param {Document[]} data.documents - Documents to import
   */
  async import(data) {
    this.clear();

    for (const doc of data.documents) {
      await this.indexDocument(doc.id, doc.content, doc.metadata);
    }
  }

  // Private helper methods

  /**
   * Semantic search using cosine similarity
   * @private
   */
  _semanticSearch(queryVector, limit, threshold) {
    const results = [];

    for (const [id, embedding] of this.embeddings) {
      const similarity = EmbeddingGenerator.cosineSimilarity(queryVector, embedding);
      
      if (similarity >= threshold) {
        results.push({ id, score: similarity, type: 'semantic' });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Keyword search using inverted index
   * @private
   */
  _keywordSearch(query, limit) {
    const terms = this._extractTerms(query);
    const scores = new Map();

    for (const term of terms) {
      const docIds = this.invertedIndex.get(term);
      if (!docIds) continue;

      // TF-like scoring
      const idf = Math.log(this.documents.size / (docIds.size + 1)) + 1;

      for (const docId of docIds) {
        const currentScore = scores.get(docId) ?? 0;
        scores.set(docId, currentScore + idf);
      }
    }

    // Normalize scores
    const maxScore = Math.max(...scores.values(), 1);
    const results = [];

    for (const [id, score] of scores) {
      results.push({ id, score: score / maxScore, type: 'keyword' });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Merge semantic and keyword results
   * @private
   */
  _mergeResults(semanticResults, keywordResults, semanticWeight, keywordWeight) {
    const merged = new Map();

    // Add semantic results
    for (const result of semanticResults) {
      merged.set(result.id, {
        id: result.id,
        semanticScore: result.score,
        keywordScore: 0,
        score: result.score * semanticWeight
      });
    }

    // Add/merge keyword results
    for (const result of keywordResults) {
      const existing = merged.get(result.id);
      if (existing) {
        existing.keywordScore = result.score;
        existing.score += result.score * keywordWeight;
      } else {
        merged.set(result.id, {
          id: result.id,
          semanticScore: 0,
          keywordScore: result.score,
          score: result.score * keywordWeight
        });
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Apply metadata filters
   * @private
   */
  _applyFilters(results, filters) {
    return results.filter(r => {
      const doc = this.documents.get(r.id);
      if (!doc) return false;

      for (const [key, value] of Object.entries(filters)) {
        const docValue = doc.metadata[key];
        
        if (Array.isArray(value)) {
          if (!value.includes(docValue)) return false;
        } else if (typeof value === 'object' && value !== null) {
          // Range filters: { key: { $gte: x, $lte: y } }
          if (value.$gte !== undefined && docValue < value.$gte) return false;
          if (value.$lte !== undefined && docValue > value.$lte) return false;
          if (value.$gt !== undefined && docValue <= value.$gt) return false;
          if (value.$lt !== undefined && docValue >= value.$lt) return false;
        } else {
          if (docValue !== value) return false;
        }
      }

      return true;
    });
  }

  /**
   * Format result for output
   * @private
   */
  _formatResult(result, includeFields) {
    const doc = this.documents.get(result.id);
    
    const formatted = {
      id: result.id,
      content: doc.content,
      score: result.score,
      semanticScore: result.semanticScore,
      keywordScore: result.keywordScore,
      metadata: doc.metadata
    };

    if (includeFields) {
      const filtered = { id: result.id };
      for (const field of includeFields) {
        if (formatted[field] !== undefined) {
          filtered[field] = formatted[field];
        }
      }
      return filtered;
    }

    return formatted;
  }

  /**
   * Add document to inverted index
   * @private
   */
  _addToInvertedIndex(id, content) {
    const terms = this._extractTerms(content);
    
    for (const term of terms) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set());
      }
      this.invertedIndex.get(term).add(id);
    }
  }

  /**
   * Remove document from inverted index
   * @private
   */
  _removeFromInvertedIndex(id, content) {
    const terms = this._extractTerms(content);
    
    for (const term of terms) {
      this.invertedIndex.get(term)?.delete(id);
    }
  }

  /**
   * Extract significant terms from text
   * @private
   */
  _extractTerms(text) {
    if (!text) return [];
    
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must'
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Update average document length
   * @private
   */
  _updateAverageDocumentLength() {
    if (this.documents.size === 0) {
      this.stats.averageDocumentLength = 0;
      return;
    }

    let totalLength = 0;
    for (const doc of this.documents.values()) {
      totalLength += doc.content.length;
    }

    this.stats.averageDocumentLength = totalLength / this.documents.size;
  }

  /**
   * Generate cache key for search
   * @private
   */
  _searchCacheKey(query, options) {
    const opts = {
      limit: options.limit,
      threshold: options.threshold,
      hybrid: options.hybrid,
      semanticWeight: options.semanticWeight,
      filters: options.filters
    };
    return `${query}:${JSON.stringify(opts)}`;
  }

  /**
   * Invalidate cache entries related to a document
   * @private
   */
  _invalidateSearchCache(_docId) {
    // Simple approach: clear all cache
    // For production, could track which queries reference which docs
    this.searchCache.clear();
  }
}

export default RAGSystem;
