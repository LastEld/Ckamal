/**
 * Pattern Recognizer - Pattern recognition and prediction
 * @module intelligence/patterns
 */

/**
 * Sequence item
 * @typedef {string|number|Object} SequenceItem
 */

/**
 * Pattern definition
 * @typedef {Object} Pattern
 * @property {SequenceItem[]} sequence - Pattern sequence
 * @property {number} frequency - Occurrence frequency
 * @property {number} confidence - Pattern confidence (0-1)
 * @property {number} lastSeen - Last seen timestamp
 * @property {string[]} nextItems - Commonly following items
 */

/**
 * Recognition result
 * @typedef {Object} RecognitionResult
 * @property {boolean} matched - Whether a pattern was matched
 * @property {Pattern[]} matches - Matching patterns
 * @property {number} confidence - Recognition confidence
 * @property {string} [matchedPattern] - Name of matched pattern
 */

/**
 * Prediction result
 * @typedef {Object} PredictionResult
 * @property {SequenceItem[]} predictions - Predicted next items
 * @property {Object.<string, number>} probabilities - Probability per item
 * @property {number} confidence - Prediction confidence
 */

/**
 * Pattern Recognizer with learning and prediction capabilities
 */
export class PatternRecognizer {
  /**
   * Create a Pattern Recognizer
   * @param {Object} options - Configuration options
   * @param {number} options.minPatternLength - Minimum pattern length
   * @param {number} options.maxPatternLength - Maximum pattern length
   * @param {number} options.minConfidence - Minimum confidence threshold
   * @param {number} options.frequencyThreshold - Minimum frequency for patterns
   */
  constructor(options = {}) {
    this.minPatternLength = options.minPatternLength || 2;
    this.maxPatternLength = options.maxPatternLength || 10;
    this.minConfidence = options.minConfidence || 0.5;
    this.frequencyThreshold = options.frequencyThreshold || 2;
    
    /** @type {Map<string, Pattern>} */
    this.patterns = new Map();
    
    /** @type {SequenceItem[]} */
    this.history = [];
    
    /** @type {Map<string, Map<string, number>>} */
    this.transitions = new Map();
    
    /** @type {Map<string, number>} */
    this.itemFrequencies = new Map();
    
    this.totalSequences = 0;
  }

  /**
   * Learn patterns from a sequence
   * @param {SequenceItem[]} sequence - Sequence to learn from
   * @returns {Object} Learning statistics
   */
  learn(sequence) {
    if (!Array.isArray(sequence) || sequence.length < this.minPatternLength) {
      return { patternsLearned: 0, transitionsLearned: 0 };
    }

    // Add to history
    this.history.push(...sequence);
    if (this.history.length > 10000) {
      this.history = this.history.slice(-5000);
    }

    this.totalSequences++;

    let patternsLearned = 0;
    let transitionsLearned = 0;

    // Extract patterns of various lengths
    for (let length = this.minPatternLength; length <= Math.min(this.maxPatternLength, sequence.length); length++) {
      for (let i = 0; i <= sequence.length - length; i++) {
        const subsequence = sequence.slice(i, i + length);
        const patternKey = this.serializeSequence(subsequence);

        // Update pattern frequency
        if (this.patterns.has(patternKey)) {
          const pattern = this.patterns.get(patternKey);
          pattern.frequency++;
          pattern.lastSeen = Date.now();
          
          // Update confidence based on frequency
          pattern.confidence = Math.min(0.99, pattern.frequency / (pattern.frequency + 10));
        } else {
          this.patterns.set(patternKey, {
            sequence: subsequence,
            frequency: 1,
            confidence: 0.1,
            lastSeen: Date.now(),
            nextItems: []
          });
          patternsLearned++;
        }

        // Learn transition to next item
        if (i + length < sequence.length) {
          const nextItem = this.serializeItem(sequence[i + length]);
          this.learnTransition(patternKey, nextItem);
          transitionsLearned++;
        }
      }
    }

    // Update item frequencies
    for (const item of sequence) {
      const key = this.serializeItem(item);
      this.itemFrequencies.set(key, (this.itemFrequencies.get(key) || 0) + 1);
    }

    // Prune low-frequency patterns
    this.prunePatterns();

    return {
      patternsLearned,
      transitionsLearned,
      totalPatterns: this.patterns.size,
      totalTransitions: this.getTotalTransitions()
    };
  }

  /**
   * Recognize patterns in a sequence
   * @param {SequenceItem[]} sequence - Sequence to analyze
   * @returns {RecognitionResult} Recognition results
   */
  recognize(sequence) {
    if (!Array.isArray(sequence) || sequence.length === 0) {
      return { matched: false, matches: [], confidence: 0 };
    }

    const matches = [];
    let totalConfidence = 0;

    // Check for exact matches
    const sequenceKey = this.serializeSequence(sequence);
    if (this.patterns.has(sequenceKey)) {
      const pattern = this.patterns.get(sequenceKey);
      matches.push(pattern);
      totalConfidence = pattern.confidence;
    }

    // Check for partial matches (subsequences)
    for (let length = this.minPatternLength; length <= Math.min(this.maxPatternLength, sequence.length); length++) {
      for (let i = 0; i <= sequence.length - length; i++) {
        const subsequence = sequence.slice(i, i + length);
        const key = this.serializeSequence(subsequence);

        if (this.patterns.has(key)) {
          const pattern = this.patterns.get(key);
          
          // Calculate match confidence based on coverage
          const coverage = length / sequence.length;
          const matchConfidence = pattern.confidence * coverage;

          if (matchConfidence >= this.minConfidence) {
            matches.push({
              ...pattern,
              matchConfidence,
              position: i
            });
            totalConfidence = Math.max(totalConfidence, matchConfidence);
          }
        }
      }
    }

    // Check for similar patterns (allowing for minor variations)
    const similarMatches = this.findSimilarPatterns(sequence);
    matches.push(...similarMatches);

    // Sort by confidence
    matches.sort((a, b) => (b.matchConfidence || b.confidence) - (a.matchConfidence || a.confidence));

    return {
      matched: matches.length > 0,
      matches: matches.slice(0, 5), // Return top 5
      confidence: Math.min(1, totalConfidence),
      matchedPattern: matches[0]?.sequence ? this.serializeSequence(matches[0].sequence) : undefined
    };
  }

  /**
   * Predict next items in a sequence
   * @param {SequenceItem[]} sequence - Input sequence
   * @param {number} [count=1] - Number of predictions to return
   * @returns {PredictionResult} Prediction results
   */
  predictNext(sequence, count = 1) {
    if (!Array.isArray(sequence) || sequence.length === 0) {
      return { predictions: [], probabilities: {}, confidence: 0 };
    }

    const probabilities = new Map();

    // Try exact pattern match first
    for (let length = Math.min(sequence.length, this.maxPatternLength); length >= this.minPatternLength; length--) {
      const subsequence = sequence.slice(-length);
      const key = this.serializeSequence(subsequence);

      if (this.transitions.has(key)) {
        const transitions = this.transitions.get(key);
        const totalTransitions = Array.from(transitions.values()).reduce((a, b) => a + b, 0);

        for (const [nextItem, freq] of transitions) {
          const prob = freq / totalTransitions;
          const current = probabilities.get(nextItem) || { prob: 0, weight: 0 };
          
          // Weight by pattern length (longer = more reliable)
          const weight = length / this.maxPatternLength;
          probabilities.set(nextItem, {
            prob: current.prob + prob * weight,
            weight: current.weight + weight
          });
        }
      }
    }

    // Normalize probabilities
    const normalized = {};
    let totalWeight = 0;
    
    for (const [item, data] of probabilities) {
      normalized[item] = data.prob / (data.weight || 1);
      totalWeight += data.weight;
    }

    // Sort by probability
    const sorted = Object.entries(normalized)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count);

    const predictions = sorted.map(([item, _]) => this.deserializeItem(item));
    const resultProbabilities = Object.fromEntries(sorted);

    // Calculate confidence
    const maxProb = sorted[0]?.[1] || 0;
    const confidence = Math.min(1, maxProb * (1 + totalWeight / 10));

    return {
      predictions,
      probabilities: resultProbabilities,
      confidence
    };
  }

  /**
   * Get pattern statistics
   * @returns {Object} Pattern statistics
   */
  getStats() {
    const patternSizes = Array.from(this.patterns.values()).map(p => p.sequence.length);
    const frequencies = Array.from(this.patterns.values()).map(p => p.frequency);

    return {
      totalPatterns: this.patterns.size,
      totalSequences: this.totalSequences,
      avgPatternLength: patternSizes.length > 0 ? patternSizes.reduce((a, b) => a + b, 0) / patternSizes.length : 0,
      maxPatternLength: patternSizes.length > 0 ? Math.max(...patternSizes) : 0,
      avgFrequency: frequencies.length > 0 ? frequencies.reduce((a, b) => a + b, 0) / frequencies.length : 0,
      uniqueItems: this.itemFrequencies.size,
      historySize: this.history.length
    };
  }

  /**
   * Find similar patterns with variations
   * @private
   * @param {SequenceItem[]} sequence - Sequence to match
   * @returns {Array} Similar patterns
   */
  findSimilarPatterns(sequence) {
    const similar = [];
    const sequenceKey = this.serializeSequence(sequence);

    for (const [key, pattern] of this.patterns) {
      if (key === sequenceKey) continue;

      const similarity = this.calculateSimilarity(sequence, pattern.sequence);
      
      if (similarity >= this.minConfidence) {
        similar.push({
          ...pattern,
          matchConfidence: similarity,
          similarity
        });
      }
    }

    return similar.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
  }

  /**
   * Calculate similarity between two sequences
   * @private
   * @param {SequenceItem[]} seq1 - First sequence
   * @param {SequenceItem[]} seq2 - Second sequence
   * @returns {number} Similarity score (0-1)
   */
  calculateSimilarity(seq1, seq2) {
    const len1 = seq1.length;
    const len2 = seq2.length;
    
    if (len1 === 0 && len2 === 0) return 1;
    if (len1 === 0 || len2 === 0) return 0;

    // Use Levenshtein-inspired distance for sequences
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    for (let j = 1; j <= len2; j++) {
      for (let i = 1; i <= len1; i++) {
        const cost = this.serializeItem(seq1[i - 1]) === this.serializeItem(seq2[j - 1]) ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }

    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }

  /**
   * Learn a transition between pattern and next item
   * @private
   * @param {string} patternKey - Pattern key
   * @param {string} nextItem - Next item
   */
  learnTransition(patternKey, nextItem) {
    if (!this.transitions.has(patternKey)) {
      this.transitions.set(patternKey, new Map());
    }
    
    const transitions = this.transitions.get(patternKey);
    transitions.set(nextItem, (transitions.get(nextItem) || 0) + 1);

    // Update pattern's nextItems
    const pattern = this.patterns.get(patternKey);
    if (pattern && !pattern.nextItems.includes(nextItem)) {
      pattern.nextItems.push(nextItem);
    }
  }

  /**
   * Prune low-frequency patterns
   * @private
   */
  prunePatterns() {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [key, pattern] of this.patterns) {
      // Remove old low-frequency patterns
      if (pattern.frequency < this.frequencyThreshold && 
          now - pattern.lastSeen > maxAge) {
        this.patterns.delete(key);
        this.transitions.delete(key);
      }
    }
  }

  /**
   * Serialize a sequence to string key
   * @private
   * @param {SequenceItem[]} sequence - Sequence
   * @returns {string} Serialized key
   */
  serializeSequence(sequence) {
    return sequence.map(item => this.serializeItem(item)).join('→');
  }

  /**
   * Serialize an item to string
   * @private
   * @param {SequenceItem} item - Item
   * @returns {string} Serialized item
   */
  serializeItem(item) {
    if (typeof item === 'string') return `s:${item}`;
    if (typeof item === 'number') return `n:${item}`;
    return `o:${JSON.stringify(item)}`;
  }

  /**
   * Deserialize an item from string
   * @private
   * @param {string} str - Serialized string
   * @returns {SequenceItem} Deserialized item
   */
  deserializeItem(str) {
    if (str.startsWith('s:')) return str.slice(2);
    if (str.startsWith('n:')) return parseFloat(str.slice(2));
    if (str.startsWith('o:')) return JSON.parse(str.slice(2));
    return str;
  }

  /**
   * Get total number of transitions
   * @private
   * @returns {number} Total transitions
   */
  getTotalTransitions() {
    let total = 0;
    for (const transitions of this.transitions.values()) {
      total += transitions.size;
    }
    return total;
  }

  /**
   * Export learned patterns
   * @returns {Object} Exportable pattern data
   */
  export() {
    return {
      patterns: Array.from(this.patterns.entries()),
      transitions: Array.from(this.transitions.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
      itemFrequencies: Array.from(this.itemFrequencies.entries()),
      stats: this.getStats()
    };
  }

  /**
   * Import learned patterns
   * @param {Object} data - Pattern data
   */
  import(data) {
    if (data.patterns) {
      this.patterns = new Map(data.patterns);
    }
    if (data.transitions) {
      this.transitions = new Map(
        data.transitions.map(([k, v]) => [k, new Map(v)])
      );
    }
    if (data.itemFrequencies) {
      this.itemFrequencies = new Map(data.itemFrequencies);
    }
  }

  /**
   * Clear all learned patterns
   */
  clear() {
    this.patterns.clear();
    this.transitions.clear();
    this.itemFrequencies.clear();
    this.history = [];
    this.totalSequences = 0;
  }
}

export default PatternRecognizer;
