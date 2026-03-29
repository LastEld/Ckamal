/**
 * @fileoverview Result quality checking for RAG system
 * @module analysis/rag-quality
 */

import { EmbeddingGenerator } from './rag-embeddings.js';

/**
 * @typedef {Object} QualityCheckResult
 * @property {number} overallScore - Overall quality score (0-1)
 * @property {number} relevanceScore - Relevance score (0-1)
 * @property {number} confidenceScore - Confidence score (0-1)
 * @property {number} hallucinationRisk - Hallucination risk (0-1, higher is worse)
 * @property {boolean} passesThreshold - Whether result passes quality threshold
 * @property {Object} details - Detailed quality metrics
 */

/**
 * @typedef {Object} QualityThresholds
 * @property {number} minOverallScore - Minimum overall score (0-1)
 * @property {number} minRelevanceScore - Minimum relevance score (0-1)
 * @property {number} maxHallucinationRisk - Maximum allowed hallucination risk (0-1)
 * @property {number} minConfidenceScore - Minimum confidence score (0-1)
 */

/**
 * Quality checker for RAG results
 */
export class QualityChecker {
  /**
   * Default quality thresholds
   * @type {QualityThresholds}
   */
  static DEFAULT_THRESHOLDS = {
    minOverallScore: 0.6,
    minRelevanceScore: 0.5,
    maxHallucinationRisk: 0.3,
    minConfidenceScore: 0.5
  };

  /**
   * Creates a new QualityChecker
   * @param {Object} options - Configuration options
   * @param {QualityThresholds} [options.thresholds] - Quality thresholds
   * @param {EmbeddingGenerator} [options.embedder] - Embedding generator for semantic checks
   */
  constructor(options = {}) {
    this.thresholds = { ...QualityChecker.DEFAULT_THRESHOLDS, ...options.thresholds };
    this.embedder = options.embedder ?? null;

    // Statistics
    this.stats = {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      averageScore: 0,
      totalScore: 0
    };
  }

  /**
   * Check quality of a RAG result
   * @param {Object} result - RAG result to check
   * @param {string} result.query - Original query
   * @param {string} result.response - Generated response
   * @param {Array<Object>} [result.sources=[]] - Source documents used
   * @param {number} [result.confidence] - System confidence score
   * @returns {Promise<QualityCheckResult>} Quality check result
   */
  async check(result) {
    this.stats.totalChecks++;

    const checks = await Promise.all([
      this._checkRelevance(result),
      this._checkConfidence(result),
      this._checkHallucination(result)
    ]);

    const relevanceScore = checks[0];
    const confidenceScore = checks[1];
    const hallucinationRisk = checks[2];

    // Calculate overall score (weighted average)
    const overallScore = (
      relevanceScore * 0.4 +
      confidenceScore * 0.3 +
      (1 - hallucinationRisk) * 0.3
    );

    // Check against thresholds
    const passesThreshold =
      overallScore >= this.thresholds.minOverallScore &&
      relevanceScore >= this.thresholds.minRelevanceScore &&
      hallucinationRisk <= this.thresholds.maxHallucinationRisk &&
      confidenceScore >= this.thresholds.minConfidenceScore;

    if (passesThreshold) {
      this.stats.passedChecks++;
    } else {
      this.stats.failedChecks++;
    }

    this.stats.totalScore += overallScore;
    this.stats.averageScore = this.stats.totalScore / this.stats.totalChecks;

    return {
      overallScore,
      relevanceScore,
      confidenceScore,
      hallucinationRisk,
      passesThreshold,
      details: {
        queryLength: result.query?.length ?? 0,
        responseLength: result.response?.length ?? 0,
        sourceCount: result.sources?.length ?? 0,
        thresholdChecks: {
          overall: overallScore >= this.thresholds.minOverallScore,
          relevance: relevanceScore >= this.thresholds.minRelevanceScore,
          hallucination: hallucinationRisk <= this.thresholds.maxHallucinationRisk,
          confidence: confidenceScore >= this.thresholds.minConfidenceScore
        }
      }
    };
  }

  /**
   * Check relevance of response to query and sources
   * @private
   * @param {Object} result - RAG result
   * @returns {Promise<number>} Relevance score (0-1)
   */
  async _checkRelevance(result) {
    const { query, response, sources = [] } = result;

    if (!query || !response) return 0;

    let scores = [];

    // Query-response relevance (if embedder available)
    if (this.embedder) {
      try {
        const queryEmbed = await this.embedder.generate(query);
        const responseEmbed = await this.embedder.generate(response);
        const similarity = EmbeddingGenerator.cosineSimilarity(
          queryEmbed.vector,
          responseEmbed.vector
        );
        scores.push((similarity + 1) / 2); // Normalize to 0-1
      } catch {
        // Fall through to lexical checks
      }
    }

    // Lexical overlap with query
    const queryTerms = this._extractTerms(query);
    const responseTerms = this._extractTerms(response);
    const queryOverlap = this._calculateOverlap(queryTerms, responseTerms);
    scores.push(queryOverlap);

    // Source coverage
    if (sources.length > 0) {
      const sourceTexts = sources.map(s => s.content || s.text || '').join(' ');
      const sourceTerms = this._extractTerms(sourceTexts);
      const sourceOverlap = this._calculateOverlap(sourceTerms, responseTerms);
      scores.push(sourceOverlap);

      // Check for source attribution
      const attributionScore = this._checkAttribution(response, sources);
      scores.push(attributionScore);
    }

    return scores.length > 0 
      ? scores.reduce((a, b) => a + b, 0) / scores.length 
      : 0.5;
  }

  /**
   * Check confidence of the result
   * @private
   * @param {Object} result - RAG result
   * @returns {Promise<number>} Confidence score (0-1)
   */
  async _checkConfidence(result) {
    const scores = [];

    // System confidence score
    if (typeof result.confidence === 'number') {
      scores.push(Math.max(0, Math.min(1, result.confidence)));
    }

    // Source quality indicators
    if (result.sources && result.sources.length > 0) {
      // Average source score if available
      const sourceScores = result.sources
        .map(s => s.score || s.relevance || s.confidence)
        .filter(s => typeof s === 'number');
      
      if (sourceScores.length > 0) {
        const avgSourceScore = sourceScores.reduce((a, b) => a + b, 0) / sourceScores.length;
        scores.push(avgSourceScore);
      }

      // Number of sources (more is generally better, up to a point)
      const sourceCountScore = Math.min(result.sources.length / 5, 1);
      scores.push(sourceCountScore);
    }

    // Response completeness indicators
    if (result.response) {
      // Check for uncertainty phrases
      const uncertaintyPhrases = [
        'i don\'t know', 'not sure', 'unclear', 'ambiguous',
        'cannot determine', 'insufficient information', 'no information'
      ];
      
      const lowerResponse = result.response.toLowerCase();
      const uncertaintyCount = uncertaintyPhrases.filter(p => 
        lowerResponse.includes(p)
      ).length;
      
      const certaintyScore = Math.max(0, 1 - (uncertaintyCount * 0.2));
      scores.push(certaintyScore);
    }

    return scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0.5;
  }

  /**
   * Check for potential hallucination
   * @private
   * @param {Object} result - RAG result
   * @returns {Promise<number>} Hallucination risk (0-1, higher is worse)
   */
  async _checkHallucination(result) {
    const { response, sources = [] } = result;

    if (!response || sources.length === 0) return 0.5;

    const risks = [];

    // Check for specific claims not in sources
    const sourceTexts = sources.map(s => (s.content || s.text || '').toLowerCase());
    const responseSentences = this._splitSentences(response);

    let unverifiedClaims = 0;
    for (const sentence of responseSentences) {
      const lowerSentence = sentence.toLowerCase();
      
      // Skip questions and generic statements
      if (lowerSentence.includes('?')) continue;
      if (sentence.length < 20) continue;

      // Check if sentence content appears in sources
      const sentenceTerms = this._extractTerms(sentence);
      const foundInSources = sourceTexts.some(source => {
        const sourceTerms = this._extractTerms(source);
        const overlap = this._calculateOverlap(sentenceTerms, sourceTerms);
        return overlap > 0.3; // At least 30% term overlap
      });

      if (!foundInSources) {
        unverifiedClaims++;
      }
    }

    // Calculate claim verification risk
    if (responseSentences.length > 0) {
      const verificationRisk = unverifiedClaims / responseSentences.length;
      risks.push(verificationRisk);
    }

    // Check for speculative language
    const speculativePhrases = [
      'might be', 'could be', 'possibly', 'perhaps', 'maybe',
      'it seems', 'appears to', 'likely', 'probably', 'I think'
    ];
    
    const lowerResponse = response.toLowerCase();
    const speculativeCount = speculativePhrases.filter(p => 
      lowerResponse.includes(p)
    ).length;
    
    const speculativeRisk = Math.min(speculativeCount * 0.1, 0.5);
    risks.push(speculativeRisk);

    // Check for contradictory statements
    const contradictionRisk = this._checkContradictions(response, sources);
    risks.push(contradictionRisk);

    return risks.length > 0
      ? risks.reduce((a, b) => a + b, 0) / risks.length
      : 0;
  }

  /**
   * Check if response contradicts sources
   * @private
   * @param {string} response - Response text
   * @param {Array<Object>} sources - Source documents
   * @returns {number} Contradiction risk (0-1)
   */
  _checkContradictions(response, sources) {
    // Simple contradiction detection based on negation
    const negationPatterns = [
      /is not|are not|was not|were not/gi,
      /does not|do not|did not/gi,
      /cannot|can't|won't|wouldn't/gi,
      /no longer|never/gi
    ];

    const sourceText = sources.map(s => s.content || s.text || '').join(' ').toLowerCase();
    const lowerResponse = response.toLowerCase();

    let contradictions = 0;
    
    for (const pattern of negationPatterns) {
      const responseMatches = lowerResponse.match(pattern) || [];
      
      for (const match of responseMatches) {
        // Check if source has positive version
        const positiveVersion = match.replace(/not |n't /gi, ' ').trim();
        if (sourceText.includes(positiveVersion) && !sourceText.includes(match)) {
          contradictions++;
        }
      }
    }

    return Math.min(contradictions * 0.2, 1);
  }

  /**
   * Check for source attribution in response
   * @private
   * @param {string} response - Response text
   * @param {Array<Object>} sources - Source documents
   * @returns {number} Attribution score (0-1)
   */
  _checkAttribution(response, _sources) {
    const attributionPatterns = [
      /according to/gi,
      /as stated in/gi,
      /source\s*\d+/gi,
      /\[\d+\]/g,
      /document\s*\d+/gi
    ];

    let attributionCount = 0;
    for (const pattern of attributionPatterns) {
      const matches = response.match(pattern) || [];
      attributionCount += matches.length;
    }

    // Check for quotes
    const quoteMatches = response.match(/"[^"]+"/g) || [];
    attributionCount += quoteMatches.length * 0.5;

    return Math.min(attributionCount / 3, 1);
  }

  /**
   * Extract significant terms from text
   * @private
   * @param {string} text - Input text
   * @returns {Set<string>} Set of terms
   */
  _extractTerms(text) {
    if (!text) return new Set();
    
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall',
      'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
      'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'under', 'again', 'further', 'then', 'once',
      'here', 'there', 'when', 'where', 'why', 'how', 'all',
      'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
      'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
      'until', 'while', 'this', 'that', 'these', 'those', 'i',
      'me', 'my', 'myself', 'we', 'our', 'you', 'your', 'he',
      'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them',
      'their', 'what', 'which', 'who', 'whom', 'am'
    ]);

    const terms = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    return new Set(terms);
  }

  /**
   * Calculate term overlap between two sets
   * @private
   * @param {Set<string>} set1 - First term set
   * @param {Set<string>} set2 - Second term set
   * @returns {number} Overlap ratio (0-1)
   */
  _calculateOverlap(set1, set2) {
    if (set1.size === 0 || set2.size === 0) return 0;

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Split text into sentences
   * @private
   * @param {string} text - Input text
   * @returns {string[]} Array of sentences
   */
  _splitSentences(text) {
    return text
      .replace(/([.!?])\s+/g, '$1|')
      .split('|')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Update quality thresholds
   * @param {Partial<QualityThresholds>} thresholds - New threshold values
   */
  updateThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get quality statistics
   * @returns {Object} Quality statistics
   */
  getStats() {
    return {
      ...this.stats,
      passRate: this.stats.totalChecks > 0 
        ? this.stats.passedChecks / this.stats.totalChecks 
        : 0,
      thresholds: { ...this.thresholds }
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      averageScore: 0,
      totalScore: 0
    };
  }
}

export default QualityChecker;
