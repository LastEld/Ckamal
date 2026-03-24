/**
 * @fileoverview Embedding generation with multi-provider support and caching
 * @module analysis/rag-embeddings
 */

import { LRUCache } from './lru-cache.js';

/**
 * @typedef {Object} EmbeddingConfig
 * @property {string} provider - Provider type ('openai', 'local', 'mock')
 * @property {string} [apiKey] - API key for external providers
 * @property {string} [model] - Model name
 * @property {string} [endpoint] - Custom endpoint for local provider
 * @property {number} [dimensions] - Embedding dimensions
 * @property {number} [cacheSize] - LRU cache size
 * @property {number} [batchSize] - Batch size for generation
 */

/**
 * @typedef {Object} EmbeddingResult
 * @property {number[]} vector - Embedding vector
 * @property {number} dimensions - Vector dimensions
 * @property {string} model - Model used
 * @property {number} processingTimeMs - Processing time
 */

/**
 * Embedding generator supporting multiple providers
 */
export class EmbeddingGenerator {
  /**
   * Default dimensions by provider
   * @type {Object<string, number>}
   */
  static DEFAULT_DIMENSIONS = {
    openai: 1536,  // text-embedding-3-small
    'openai-large': 3072,  // text-embedding-3-large
    local: 768,
    mock: 384
  };

  /**
   * Default models by provider
   * @type {Object<string, string>}
   */
  static DEFAULT_MODELS = {
    openai: 'text-embedding-3-small',
    'openai-large': 'text-embedding-3-large',
    local: 'all-MiniLM-L6-v2',
    mock: 'mock-embedder'
  };

  /**
   * Creates a new EmbeddingGenerator
   * @param {EmbeddingConfig} config - Configuration options
   */
  constructor(config = {}) {
    this.provider = config.provider ?? 'local';
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = config.model ?? EmbeddingGenerator.DEFAULT_MODELS[this.provider];
    this.endpoint = config.endpoint ?? 'http://localhost:8000/embed';
    this.dimensions = config.dimensions ?? EmbeddingGenerator.DEFAULT_DIMENSIONS[this.provider] ?? 384;
    this.batchSize = config.batchSize ?? 100;

    // Initialize cache
    this.cache = new LRUCache({
      maxSize: config.cacheSize ?? 10000,
      ttlMs: 24 * 60 * 60 * 1000, // 24 hours
      onEvict: (key) => {
        this._onCacheEvict?.(key);
      }
    });

    // Statistics
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalTokens: 0,
      errors: 0
    };

    this._onCacheEvict = null;
  }

  _notConfigured(message) {
    const error = new Error(message);
    error.code = 'NOT_CONFIGURED';
    return error;
  }

  _isTestOnlyMode() {
    return process.env.NODE_ENV === 'test';
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Text to embed
   * @returns {Promise<EmbeddingResult>} Embedding result
   */
  async generate(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text must be a non-empty string');
    }

    this.stats.totalRequests++;

    // Check cache
    const cached = this.cache.get(text);
    if (cached) {
      this.stats.cacheHits++;
      return {
        ...cached,
        cached: true
      };
    }

    this.stats.cacheMisses++;

    const startTime = performance.now();
    let vector;

    try {
      switch (this.provider) {
        case 'openai':
        case 'openai-large':
          vector = await this._generateOpenAI(text);
          break;
        case 'local':
          vector = await this._generateLocal(text);
          break;
        case 'mock':
          if (!this._isTestOnlyMode()) {
            throw this._notConfigured('Mock embeddings are test-only and disabled in release runtime');
          }
          vector = this._generateMock(text);
          break;
        default:
          throw new Error(`Unsupported embedding provider: ${this.provider}`);
      }
    } catch (error) {
      this.stats.errors++;
      if (error?.code === 'NOT_CONFIGURED') {
        throw error;
      }
      throw new Error(`Embedding generation failed: ${error.message}`);
    }

    // Normalize dimensions
    vector = this._normalizeDimensions(vector);

    const result = {
      vector,
      dimensions: vector.length,
      model: this.model,
      processingTimeMs: performance.now() - startTime,
      cached: false
    };

    // Cache the result
    this.cache.set(text, {
      vector: result.vector,
      dimensions: result.dimensions,
      model: result.model
    });

    return result;
  }

  /**
   * Generate embeddings for multiple texts in batches
   * @param {string[]} texts - Texts to embed
   * @param {Object} [options] - Batch options
   * @param {boolean} [options.showProgress] - Show progress in console
   * @returns {Promise<EmbeddingResult[]>} Array of embedding results
   */
  async generateBatch(texts, options = {}) {
    if (!Array.isArray(texts)) {
      throw new Error('Texts must be an array');
    }

    const results = [];
    const total = texts.length;

    for (let i = 0; i < total; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      
      if (options.showProgress) {
        console.log(`Embedding batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(total / this.batchSize)}`);
      }

      // Process batch
      const batchPromises = batch.map(text => this.generate(text));
      const batchResults = await Promise.all(batchPromises);
      
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Generate embedding using OpenAI API
   * @private
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async _generateOpenAI(text) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        dimensions: this.dimensions
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    this.stats.totalTokens += data.usage?.total_tokens ?? 0;
    
    return data.data[0].embedding;
  }

  /**
   * Generate embedding using local endpoint
   * @private
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async _generateLocal(text) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model: this.model })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Local embedding error: ${error}`);
    }

    const data = await response.json();
    return data.embedding;
  }

  /**
   * Generate mock embedding for testing
   * @private
   * @param {string} text - Text to embed
   * @returns {number[]} Mock embedding vector
   */
  _generateMock(text) {
    // Generate deterministic pseudo-random vector based on text hash
    const hash = this._hashString(text);
    const vector = [];
    
    for (let i = 0; i < this.dimensions; i++) {
      // Use hash and position to generate value
      const value = Math.sin(hash + i * 0.1) * 0.5 + 0.5;
      vector.push(value);
    }

    // Normalize the vector
    return this._normalizeVector(vector);
  }

  /**
   * Normalize vector to target dimensions
   * @private
   * @param {number[]} vector - Input vector
   * @returns {number[]} Normalized vector
   */
  _normalizeDimensions(vector) {
    if (vector.length === this.dimensions) {
      return vector;
    }

    if (vector.length > this.dimensions) {
      // Truncate
      return vector.slice(0, this.dimensions);
    }

    // Pad with zeros
    return [...vector, ...new Array(this.dimensions - vector.length).fill(0)];
  }

  /**
   * L2 normalize a vector
   * @private
   * @param {number[]} vector - Input vector
   * @returns {number[]} L2 normalized vector
   */
  _normalizeVector(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vector;
    return vector.map(v => v / magnitude);
  }

  /**
   * Simple string hash function
   * @private
   * @param {string} str - String to hash
   * @returns {number} Hash value
   */
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Similarity score (-1 to 1)
   */
  static cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate Euclidean distance between two vectors
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Distance
   */
  static euclideanDistance(a, b) {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      ...this.cache.getStats(),
      totalRequests: this.stats.totalRequests,
      totalTokens: this.stats.totalTokens,
      errors: this.stats.errors
    };
  }

  /**
   * Clear the embedding cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Set callback for cache eviction events
   * @param {Function} callback - Function(key) called on eviction
   */
  onCacheEvict(callback) {
    this._onCacheEvict = callback;
  }
}

export default EmbeddingGenerator;
