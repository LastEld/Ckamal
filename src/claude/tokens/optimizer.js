/**
 * @fileoverview Token Optimization Module for CogniMesh v5.0
 * Provides prompt optimization and smart truncation strategies.
 * @module claude/tokens/optimizer
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} OptimizationResult
 * @property {string} optimized - Optimized prompt
 * @property {number} originalTokens - Original token count
 * @property {number} optimizedTokens - Optimized token count
 * @property {number} savings - Tokens saved
 * @property {string[]} strategies - Strategies applied
 * @property {Object} [warnings] - Optimization warnings
 */

/**
 * @typedef {Object} TruncationResult
 * @property {string} truncated - Truncated text
 * @property {number} originalTokens - Original token count
 * @property {number} truncatedTokens - Truncated token count
 * @property {string} strategy - Truncation strategy used
 * @property {boolean} complete - Whether content was fully preserved
 */

/**
 * TokenOptimizer provides intelligent prompt optimization
 * and smart truncation strategies.
 * @extends EventEmitter
 */
export class TokenOptimizer extends EventEmitter {
  /** @type {Set<string>} */
  #subscribers = new Set();
  
  /** @type {Object} */
  #strategies;

  /**
   * Creates a TokenOptimizer instance.
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.strategies] - Strategy configuration
   */
  constructor(options = {}) {
    super();
    
    this.#strategies = {
      removeWhitespace: true,
      removeComments: true,
      shortenExamples: true,
      compressLists: true,
      prioritizeInstructions: true,
      ...options.strategies
    };
  }

  /**
   * Validates subscriber authentication.
   * @private
   * @param {string} subscriptionKey - Subscriber key
   * @throws {Error} If not authenticated
   */
  #requireAuth(subscriptionKey) {
    if (!this.#subscribers.has(subscriptionKey)) {
      throw new Error('Unauthorized: Valid subscription required');
    }
  }

  /**
   * Subscribes to the optimizer.
   * @param {string} subscriptionKey - Unique subscriber identifier
   * @returns {boolean} Success status
   */
  subscribe(subscriptionKey) {
    if (this.#subscribers.has(subscriptionKey)) {
      return false;
    }
    this.#subscribers.add(subscriptionKey);
    this.emit('subscribed', { subscriptionKey, timestamp: Date.now() });
    return true;
  }

  /**
   * Unsubscribes from the optimizer.
   * @param {string} subscriptionKey - Subscriber identifier
   * @returns {boolean} Success status
   */
  unsubscribe(subscriptionKey) {
    const removed = this.#subscribers.delete(subscriptionKey);
    if (removed) {
      this.emit('unsubscribed', { subscriptionKey, timestamp: Date.now() });
    }
    return removed;
  }

  /**
   * Optimizes a prompt for token efficiency.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} prompt - Prompt to optimize
   * @param {Object} [options] - Optimization options
   * @param {number} [options.targetTokens] - Target token count
   * @param {string[]} [options.preserveSections] - Sections to preserve
   * @returns {OptimizationResult} Optimization result
   */
  optimizePrompt(subscriptionKey, prompt, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Invalid prompt: must be non-empty string');
    }

    const originalTokens = this.countTokens(prompt);
    const strategies = [];
    let optimized = prompt;
    const warnings = {};

    // Apply optimization strategies
    if (this.#strategies.removeWhitespace) {
      const before = optimized;
      optimized = this.#optimizeWhitespace(optimized);
      if (optimized !== before) strategies.push('whitespace');
    }

    if (this.#strategies.removeComments) {
      const before = optimized;
      optimized = this.#removeComments(optimized);
      if (optimized !== before) strategies.push('comments');
    }

    if (this.#strategies.shortenExamples) {
      const before = optimized;
      optimized = this.#shortenExamples(optimized);
      if (optimized !== before) strategies.push('examples');
    }

    if (this.#strategies.compressLists) {
      const before = optimized;
      optimized = this.#compressLists(optimized);
      if (optimized !== before) strategies.push('lists');
    }

    // If target specified and still over, apply aggressive strategies
    const optimizedTokens = this.countTokens(optimized);
    if (options.targetTokens && optimizedTokens > options.targetTokens) {
      const aggressive = this.#applyAggressiveOptimization(
        optimized, 
        options.targetTokens,
        options.preserveSections || []
      );
      optimized = aggressive.text;
      strategies.push(...aggressive.strategies);
      
      if (aggressive.warnings) {
        Object.assign(warnings, aggressive.warnings);
      }
    }

    const finalTokens = this.countTokens(optimized);
    const result = {
      optimized,
      originalTokens,
      optimizedTokens: finalTokens,
      savings: originalTokens - finalTokens,
      strategies,
      warnings: Object.keys(warnings).length > 0 ? warnings : undefined
    };

    this.emit('promptOptimized', result);
    return result;
  }

  /**
   * Suggests compression strategies for text.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} text - Text to analyze
   * @returns {Object} Compression suggestions
   */
  suggestCompression(subscriptionKey, text) {
    this.#requireAuth(subscriptionKey);
    
    const suggestions = [];
    const tokenCount = this.countTokens(text);

    // Analyze text for compression opportunities
    const whitespaceCount = (text.match(/\s+/g) || []).length;
    if (whitespaceCount > tokenCount * 0.1) {
      suggestions.push({
        type: 'whitespace',
        potential: Math.floor(whitespaceCount * 0.5),
        description: 'Excess whitespace can be reduced'
      });
    }

    const commentPatterns = [
      /\/\/.*$/gm,      // Single line comments
      /\/\*[\s\S]*?\*\//g,  // Multi-line comments
      /#.*$/gm,         // Hash comments
      /<!--[\s\S]*?-->/g  // HTML comments
    ];
    
    let commentTokens = 0;
    for (const pattern of commentPatterns) {
      const matches = text.match(pattern) || [];
      commentTokens += matches.reduce((sum, m) => sum + this.countTokens(m), 0);
    }
    
    if (commentTokens > 0) {
      suggestions.push({
        type: 'comments',
        potential: commentTokens,
        description: 'Comments can be removed or summarized'
      });
    }

    // Check for redundant examples
    const exampleMatches = text.match(/(?:example|e\.g\.|for instance)[\s\S]{0,500}/gi) || [];
    if (exampleMatches.length > 3) {
      suggestions.push({
        type: 'examples',
        potential: Math.floor(exampleMatches.length * 50),
        description: 'Multiple examples can be consolidated'
      });
    }

    // Check for verbose phrases
    const verbosePatterns = [
      { pattern: /in order to/gi, replacement: 'to', tokens: 2 },
      { pattern: /at this point in time/gi, replacement: 'now', tokens: 4 },
      { pattern: /due to the fact that/gi, replacement: 'because', tokens: 3 },
      { pattern: /in the event that/gi, replacement: 'if', tokens: 3 },
      { pattern: /for the purpose of/gi, replacement: 'for', tokens: 3 }
    ];

    let verboseSavings = 0;
    for (const { pattern, tokens } of verbosePatterns) {
      const matches = text.match(pattern) || [];
      verboseSavings += matches.length * tokens;
    }

    if (verboseSavings > 0) {
      suggestions.push({
        type: 'phrases',
        potential: verboseSavings,
        description: 'Verbose phrases can be simplified'
      });
    }

    // Calculate total potential
    const totalPotential = suggestions.reduce((sum, s) => sum + s.potential, 0);
    const percentSavings = tokenCount > 0 ? (totalPotential / tokenCount) * 100 : 0;

    return {
      currentTokens: tokenCount,
      suggestions: suggestions.sort((a, b) => b.potential - a.potential),
      totalPotential,
      percentSavings: Math.min(100, Math.round(percentSavings * 10) / 10),
      recommendation: percentSavings > 20 ? 'high' : percentSavings > 10 ? 'medium' : 'low'
    };
  }

  /**
   * Performs smart truncation of text.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {string} text - Text to truncate
   * @param {number} maxTokens - Maximum tokens
   * @param {Object} [options] - Truncation options
   * @param {string} [options.strategy='sentence'] - Truncation strategy
   * @returns {TruncationResult} Truncation result
   */
  smartTruncate(subscriptionKey, text, maxTokens, options = {}) {
    this.#requireAuth(subscriptionKey);
    
    const originalTokens = this.countTokens(text);
    
    if (originalTokens <= maxTokens) {
      return {
        truncated: text,
        originalTokens,
        truncatedTokens: originalTokens,
        strategy: 'none',
        complete: true
      };
    }

    const strategy = options.strategy || 'sentence';
    let truncated;

    switch (strategy) {
      case 'sentence':
        truncated = this.#truncateAtSentence(text, maxTokens);
        break;
      case 'paragraph':
        truncated = this.#truncateAtParagraph(text, maxTokens);
        break;
      case 'word':
        truncated = this.#truncateAtWord(text, maxTokens);
        break;
      case 'char':
        truncated = this.#truncateAtChar(text, maxTokens);
        break;
      case 'middle':
        truncated = this.#truncateMiddle(text, maxTokens);
        break;
      default:
        throw new Error(`Unknown truncation strategy: ${strategy}`);
    }

    const truncatedTokens = this.countTokens(truncated);
    
    const result = {
      truncated,
      originalTokens,
      truncatedTokens,
      strategy,
      complete: truncatedTokens >= originalTokens * 0.95
    };

    this.emit('textTruncated', result);
    return result;
  }

  /**
   * Counts tokens in text.
   * @param {string} text - Text to count
   * @returns {number} Token count
   */
  countTokens(text) {
    if (!text) return 0;
    // Approximate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Updates optimization strategies.
   * @param {string} subscriptionKey - Authenticated subscriber key
   * @param {Partial<typeof this.#strategies>} strategies - Strategy updates
   */
  setStrategies(subscriptionKey, strategies) {
    this.#requireAuth(subscriptionKey);
    this.#strategies = { ...this.#strategies, ...strategies };
    this.emit('strategiesUpdated', { strategies: this.#strategies });
  }

  // Private optimization methods

  /**
   * Optimizes whitespace.
   * @private
   */
  #optimizeWhitespace(text) {
    return text
      .replace(/[ \t]+/g, ' ')           // Multiple spaces to single
      .replace(/\n{3,}/g, '\n\n')         // Max 2 consecutive newlines
      .replace(/^\s+|\s+$/gm, '')        // Trim lines
      .trim();
  }

  /**
   * Removes comments.
   * @private
   */
  #removeComments(text) {
    return text
      .replace(/\/\/.*$/gm, '')                    // Single line
      .replace(/\/\*[\s\S]*?\*\//g, '')            // Multi-line
      .replace(/#.*$/gm, '')                       // Hash comments
      .replace(/<!--[\s\S]*?-->/g, '');            // HTML comments
  }

  /**
   * Shortens examples.
   * @private
   */
  #shortenExamples(text) {
    // Keep first 2 examples, summarize rest
    const examplePattern = /(Example \d+:[\s\S]{0,1000})(?=Example \d+:|$)/gi;
    let count = 0;
    
    return text.replace(examplePattern, (match) => {
      count++;
      if (count <= 2) return match;
      return `[Example ${count} truncated...]`;
    });
  }

  /**
   * Compresses lists.
   * @private
   */
  #compressLists(text) {
    // Convert verbose lists to compact format
    return text.replace(
      /(?:^|\n)(?:\s*[-*]\s+.+\n?){5,}/g,
      (match) => `[List: ${match.split('\n').filter(l => l.trim()).length} items]`
    );
  }

  /**
   * Applies aggressive optimization.
   * @private
   */
  #applyAggressiveOptimization(text, targetTokens, preserveSections) {
    const strategies = [];
    const warnings = {};
    let result = text;

    // Extract and preserve marked sections
    const preserved = new Map();
    for (const section of preserveSections) {
      const pattern = new RegExp(`(${section}[\\s\\S]{0,500})`, 'i');
      const match = text.match(pattern);
      if (match) {
        const placeholder = `__PRESERVED_${preserved.size}__`;
        preserved.set(placeholder, match[1]);
        result = result.replace(match[1], placeholder);
      }
    }

    // Remove filler words
    const before = result;
    result = result.replace(/\b(very|really|quite|rather|basically|actually|literally)\b/gi, '');
    if (result !== before) strategies.push('filler_words');

    // Shorten common phrases
    const phrases = {
      'in order to': 'to',
      'due to the fact that': 'because',
      'at this point in time': 'now',
      'in the event that': 'if',
      'for the purpose of': 'for',
      'with regard to': 'about',
      'in relation to': 'about',
      'in the near future': 'soon'
    };

    for (const [verbose, concise] of Object.entries(phrases)) {
      const pattern = new RegExp(verbose, 'gi');
      if (pattern.test(result)) {
        result = result.replace(pattern, concise);
        if (!strategies.includes('phrases')) {
          strategies.push('phrases');
        }
      }
    }

    // If still over target, truncate
    if (this.countTokens(result) > targetTokens) {
      const maxLen = targetTokens * 4; // Approximate chars
      result = this.#truncateAtSentence(result, targetTokens);
      strategies.push('truncation');
      warnings.truncation = 'Content was truncated to meet target';
    }

    // Restore preserved sections
    for (const [placeholder, content] of preserved.entries()) {
      result = result.replace(placeholder, content);
    }

    return { text: result, strategies, warnings };
  }

  /**
   * Truncates at sentence boundary.
   * @private
   */
  #truncateAtSentence(text, maxTokens) {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;

    const truncated = text.substring(0, maxChars);
    const lastSentence = truncated.lastIndexOf('.');
    
    if (lastSentence > maxChars * 0.7) {
      return truncated.substring(0, lastSentence + 1) + ' [...]';
    }
    return truncated + ' [...]';
  }

  /**
   * Truncates at paragraph boundary.
   * @private
   */
  #truncateAtParagraph(text, maxTokens) {
    const paragraphs = text.split(/\n\n+/);
    let result = [];
    let tokens = 0;

    for (const para of paragraphs) {
      const paraTokens = this.countTokens(para);
      if (tokens + paraTokens > maxTokens) break;
      result.push(para);
      tokens += paraTokens;
    }

    return result.join('\n\n') + (result.length < paragraphs.length ? '\n\n[...]' : '');
  }

  /**
   * Truncates at word boundary.
   * @private
   */
  #truncateAtWord(text, maxTokens) {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;

    const truncated = text.substring(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return truncated.substring(0, lastSpace) + ' [...]';
  }

  /**
   * Truncates at character boundary.
   * @private
   */
  #truncateAtChar(text, maxTokens) {
    const maxChars = maxTokens * 4;
    return text.substring(0, maxChars) + (text.length > maxChars ? '[...]' : '');
  }

  /**
   * Truncates middle section (preserves start and end).
   * @private
   */
  #truncateMiddle(text, maxTokens) {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;

    const keepEach = Math.floor(maxChars / 2) - 5;
    const start = text.substring(0, keepEach);
    const end = text.substring(text.length - keepEach);
    
    return start + ' [...] ' + end;
  }

  /**
   * Disposes the optimizer and clears resources.
   */
  dispose() {
    this.#subscribers.clear();
    this.removeAllListeners();
  }
}

export default TokenOptimizer;
