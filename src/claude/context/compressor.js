/**
 * @fileoverview Context Compression Module for CogniMesh v5.0
 * Provides hierarchical compression strategies for context optimization.
 * @module claude/context/compressor
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} CompressionResult
 * @property {string} content - Compressed content
 * @property {number} originalTokens - Original token count
 * @property {number} compressedTokens - Compressed token count
 * @property {number} ratio - Compression ratio achieved
 * @property {string} strategy - Compression strategy used
 */

/**
 * @typedef {Object} CompressionOptions
 * @property {number} [minChunkSize=100] - Minimum chunk size for processing
 * @property {number} [maxChunkSize=2000] - Maximum chunk size for processing
 * @property {boolean} [preserveStructure=true] - Preserve document structure
 * @property {string[]} [preserveKeywords=[]] - Keywords to always preserve
 */

/**
 * ContextCompressor implements hierarchical compression strategies
 * to reduce context size while preserving semantic meaning.
 * @extends EventEmitter
 */
export class ContextCompressor extends EventEmitter {
  /** @type {CompressionOptions} */
  #options;

  /**
   * Creates a ContextCompressor instance.
   * @param {CompressionOptions} [options={}] - Compression configuration
   */
  constructor(options = {}) {
    super();
    this.#options = {
      minChunkSize: 100,
      maxChunkSize: 2000,
      preserveStructure: true,
      preserveKeywords: [],
      ...options
    };
  }

  /**
   * Compresses context to target token count using hierarchical strategies.
   * @param {string} context - Context content to compress
   * @param {number} targetTokens - Target token count
   * @param {Object} [options] - Compression options
   * @returns {CompressionResult} Compression result with metadata
   */
  compress(context, targetTokens, options = {}) {
    const originalTokens = this.#estimateTokens(context);
    
    if (originalTokens <= targetTokens) {
      return {
        content: context,
        originalTokens,
        compressedTokens: originalTokens,
        ratio: 1,
        strategy: 'none'
      };
    }

    const targetRatio = targetTokens / originalTokens;
    let compressed = context;
    let strategy = 'identity';

    // Hierarchical compression strategies
    if (targetRatio < 0.15) {
      // Aggressive: extract key points only
      compressed = this.extractKeyPoints(context, { maxPoints: Math.ceil(targetTokens / 10) });
      strategy = 'key_points';
    } else if (targetRatio < 0.4) {
      // Medium: summarization
      compressed = this.summarize(context, targetRatio * 1.2);
      strategy = 'summarization';
    } else {
      // Light: remove redundant content
      compressed = this.#removeRedundancy(context);
      strategy = 'redundancy_removal';
    }

    // Final truncation if still over target
    const compressedTokens = this.#estimateTokens(compressed);
    if (compressedTokens > targetTokens) {
      compressed = this.#smartTruncate(compressed, targetTokens, options);
      strategy += '+truncation';
    }

    const result = {
      content: compressed,
      originalTokens,
      compressedTokens: this.#estimateTokens(compressed),
      ratio: this.#estimateTokens(compressed) / originalTokens,
      strategy
    };

    this.emit('compressed', result);
    return result;
  }

  /**
   * Summarizes text to approximate target ratio.
   * @param {string} text - Text to summarize
   * @param {number} ratio - Target compression ratio (0-1)
   * @returns {string} Summarized text
   */
  summarize(text, ratio) {
    if (!text || ratio >= 1) return text;
    if (ratio <= 0) return '';

    const paragraphs = this.#splitIntoParagraphs(text);
    const targetParagraphs = Math.max(1, Math.ceil(paragraphs.length * ratio));
    
    // Score paragraphs by importance
    const scored = paragraphs.map((p, idx) => ({
      text: p,
      score: this.#calculateImportance(p, idx, paragraphs.length),
      index: idx
    }));

    // Keep most important paragraphs while preserving order
    scored.sort((a, b) => b.score - a.score);
    const keepIndices = scored
      .slice(0, targetParagraphs)
      .map(s => s.index)
      .sort((a, b) => a - b);

    return keepIndices.map(i => paragraphs[i]).join('\n\n');
  }

  /**
   * Extracts key points from text.
   * @param {string} text - Text to analyze
   * @param {Object} [options] - Extraction options
   * @param {number} [options.maxPoints=5] - Maximum key points
   * @returns {string} Formatted key points
   */
  extractKeyPoints(text, options = {}) {
    const maxPoints = options.maxPoints || 5;
    const sentences = this.#splitIntoSentences(text);
    
    if (sentences.length <= maxPoints) {
      return sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
    }

    // Score sentences by importance features
    const scored = sentences.map((sent, idx) => ({
      text: sent,
      score: this.#calculateSentenceScore(sent, idx, sentences),
      index: idx
    }));

    scored.sort((a, b) => b.score - a.score);
    const topSentences = scored
      .slice(0, maxPoints)
      .sort((a, b) => a.index - b.index);

    return topSentences.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
  }

  /**
   * Performs hierarchical compression at multiple levels.
   * @param {string} text - Text to compress hierarchically
   * @param {number[]} levels - Target token counts for each level
   * @returns {CompressionResult[]} Array of compression results for each level
   */
  compressHierarchical(text, levels) {
    const results = [];
    let currentContent = text;
    const originalTokens = this.#estimateTokens(text);

    for (const targetTokens of levels.sort((a, b) => a - b)) {
      if (targetTokens >= this.#estimateTokens(currentContent)) {
        continue;
      }

      const result = this.compress(currentContent, targetTokens);
      results.push(result);
      currentContent = result.content;
    }

    return results;
  }

  /**
   * Calculates importance score for a paragraph.
   * @private
   * @param {string} paragraph - Paragraph text
   * @param {number} index - Paragraph index
   * @param {number} total - Total paragraphs
   * @returns {number} Importance score
   */
  #calculateImportance(paragraph, index, total) {
    let score = 0;
    
    // Position weight: intro and conclusion are important
    if (index === 0 || index === total - 1) score += 3;
    if (index < total * 0.2 || index > total * 0.8) score += 1;

    // Content features
    const words = paragraph.split(/\s+/);
    score += Math.log(words.length + 1); // Length factor
    
    // Indicator phrases
    const indicators = ['important', 'key', 'main', 'summary', 'conclusion', 'therefore', 'thus'];
    const lower = paragraph.toLowerCase();
    indicators.forEach(ind => {
      if (lower.includes(ind)) score += 0.5;
    });

    // Keywords preservation
    this.#options.preserveKeywords.forEach(keyword => {
      if (lower.includes(keyword.toLowerCase())) score += 2;
    });

    return score;
  }

  /**
   * Calculates sentence importance score.
   * @private
   * @param {string} sentence - Sentence text
   * @param {number} index - Sentence index
   * @param {string[]} allSentences - All sentences
   * @returns {number} Sentence score
   */
  #calculateSentenceScore(sentence, index, allSentences) {
    let score = 0;
    const words = sentence.split(/\s+/).filter(w => w.length > 0);
    
    // Position bonus
    if (index === 0) score += 2;
    if (index === allSentences.length - 1) score += 1.5;

    // Length factor (not too short, not too long)
    const wordCount = words.length;
    if (wordCount > 5 && wordCount < 30) score += 1;

    // Capitalized words (likely proper nouns)
    const capWords = words.filter(w => /^[A-Z]/.test(w)).length;
    score += capWords * 0.3;

    // Numbers often indicate important data
    const numbers = sentence.match(/\d+/g);
    if (numbers) score += numbers.length * 0.5;

    // Keywords
    const lower = sentence.toLowerCase();
    const keyPhrases = ['significant', 'critical', 'essential', 'result', 'finding', 'conclusion'];
    keyPhrases.forEach(phrase => {
      if (lower.includes(phrase)) score += 1;
    });

    return score;
  }

  /**
   * Removes redundant content.
   * @private
   * @param {string} text - Text to process
   * @returns {string} Deduplicated text
   */
  #removeRedundancy(text) {
    const sentences = this.#splitIntoSentences(text);
    const seen = new Set();
    const unique = [];

    for (const sent of sentences) {
      const normalized = sent.toLowerCase().replace(/\s+/g, ' ').trim();
      const signature = normalized.substring(0, 50);
      
      if (!seen.has(signature)) {
        seen.add(signature);
        unique.push(sent);
      }
    }

    return unique.join(' ');
  }

  /**
   * Smart truncation preserving sentence boundaries.
   * @private
   * @param {string} text - Text to truncate
   * @param {number} targetTokens - Target token count
   * @param {Object} options - Truncation options
   * @returns {string} Truncated text
   */
  #smartTruncate(text, targetTokens, options = {}) {
    const targetChars = targetTokens * 4; // Approximate
    
    if (text.length <= targetChars) return text;

    // Find last sentence boundary before target
    const truncated = text.substring(0, targetChars);
    const lastSentence = truncated.lastIndexOf('.');
    const lastParagraph = truncated.lastIndexOf('\n\n');
    
    const cutPoint = Math.max(
      lastSentence > 0 ? lastSentence + 1 : 0,
      lastParagraph > 0 ? lastParagraph : 0
    );

    if (cutPoint > targetChars * 0.7) {
      return truncated.substring(0, cutPoint).trim() + ' [...truncated]';
    }

    return truncated.trim() + ' [...]';
  }

  /**
   * Splits text into paragraphs.
   * @private
   * @param {string} text - Text to split
   * @returns {string[]} Paragraphs
   */
  #splitIntoParagraphs(text) {
    return text.split(/\n\n+/).filter(p => p.trim().length > 0);
  }

  /**
   * Splits text into sentences.
   * @private
   * @param {string} text - Text to split
   * @returns {string[]} Sentences
   */
  #splitIntoSentences(text) {
    return text
      .replace(/([.!?])\s+/g, "$1\n")
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Estimates token count.
   * @private
   * @param {string} text - Text to estimate
   * @returns {number} Estimated tokens
   */
  #estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Updates compression options.
   * @param {Partial<CompressionOptions>} options - New options
   */
  setOptions(options) {
    this.#options = { ...this.#options, ...options };
  }

  /**
   * Gets current compression options.
   * @returns {CompressionOptions} Current options
   */
  getOptions() {
    return { ...this.#options };
  }
}

export default ContextCompressor;
