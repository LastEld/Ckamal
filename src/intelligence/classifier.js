/**
 * Intent Classifier - Natural language intent classification
 * @module intelligence/classifier
 */

/**
 * Training example
 * @typedef {Object} TrainingExample
 * @property {string} input - Input text
 * @property {string|string[]} labels - Label(s) for the input
 * @property {number} [weight] - Example weight (default: 1)
 */

/**
 * Classification result
 * @typedef {Object} ClassificationResult
 * @property {string[]} labels - Predicted labels
 * @property {Object.<string, number>} scores - Confidence scores per label
 * @property {number} confidence - Overall confidence score
 * @property {boolean} isMultiLabel - Whether multi-label classification was used
 */

/**
 * Intent Classifier with multi-label support and confidence scoring
 */
export class IntentClassifier {
  /**
   * Create an Intent Classifier
   * @param {Object} options - Configuration options
   * @param {string[]} options.labels - Available labels
   * @param {boolean} options.multiLabel - Enable multi-label classification
   * @param {number} options.confidenceThreshold - Minimum confidence threshold
   * @param {number} options.multiLabelThreshold - Threshold for multi-label (default: 0.3)
   */
  constructor(options = {}) {
    this.labels = options.labels || [];
    this.multiLabel = options.multiLabel ?? true;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.5;
    this.multiLabelThreshold = options.multiLabelThreshold ?? 0.3;
    
    this.trainingData = [];
    this.labelVectors = new Map();
    this.vocabulary = new Map();
    this.idf = new Map();
    this.isTrained = false;
    
    // Feature weights learned during training
    this.featureWeights = new Map();
  }

  /**
   * Classify input text into intent labels
   * @param {string} input - Input text to classify
   * @returns {ClassificationResult} Classification result with labels and confidence
   */
  classify(input) {
    if (!this.isTrained) {
      return {
        labels: ['unknown'],
        scores: { unknown: 0 },
        confidence: 0,
        isMultiLabel: false
      };
    }

    const features = this.extractFeatures(input);
    const scores = this.computeScores(features);
    
    let labels;
    let confidence;

    if (this.multiLabel) {
      // Multi-label: select all labels above threshold
      labels = Object.entries(scores)
        .filter(([_, score]) => score >= this.multiLabelThreshold)
        .sort((a, b) => b[1] - a[1])
        .map(([label]) => label);
      
      if (labels.length === 0) {
        // Fallback to highest score
        labels = [Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown'];
      }
      
      // Multi-label confidence is average of selected labels
      confidence = labels.reduce((sum, label) => sum + scores[label], 0) / labels.length;
    } else {
      // Single-label: select highest score
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      labels = [sorted[0][0]];
      confidence = sorted[0][1];
    }

    // Apply confidence threshold
    if (confidence < this.confidenceThreshold) {
      labels = ['uncertain'];
      confidence = 1 - confidence;
    }

    return {
      labels,
      scores,
      confidence: Math.round(confidence * 100) / 100,
      isMultiLabel: this.multiLabel && labels.length > 1
    };
  }

  /**
   * Train the classifier with examples
   * @param {TrainingExample[]} examples - Training examples
   * @returns {Object} Training statistics
   */
  train(examples) {
    this.trainingData = [...this.trainingData, ...examples];
    
    // Build vocabulary
    this.buildVocabulary();
    
    // Compute IDF
    this.computeIDF();
    
    // Build label vectors
    this.buildLabelVectors();
    
    // Learn feature weights
    this.learnFeatureWeights();
    
    this.isTrained = true;
    
    return {
      examplesTrained: this.trainingData.length,
      vocabularySize: this.vocabulary.size,
      labels: this.labels,
      avgExamplesPerLabel: this.trainingData.length / this.labels.length
    };
  }

  /**
   * Get confidence score for a specific label
   * @param {string} input - Input text
   * @param {string} label - Label to check
   * @returns {number} Confidence score (0-1)
   */
  getConfidence(input, label) {
    if (!this.isTrained || !this.labels.includes(label)) {
      return 0;
    }
    
    const features = this.extractFeatures(input);
    const scores = this.computeScores(features);
    return scores[label] || 0;
  }

  /**
   * Add a new label dynamically
   * @param {string} label - New label to add
   * @param {TrainingExample[]} [examples] - Initial training examples
   */
  addLabel(label, examples = []) {
    if (!this.labels.includes(label)) {
      this.labels.push(label);
    }
    
    if (examples.length > 0) {
      this.train(examples);
    }
  }

  /**
   * Evaluate classifier performance
   * @param {TrainingExample[]} testSet - Test examples
   * @returns {Object} Evaluation metrics
   */
  evaluate(testSet) {
    let correct = 0;
    let total = testSet.length;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    for (const example of testSet) {
      const result = this.classify(example.input);
      const expected = Array.isArray(example.labels) ? example.labels : [example.labels];
      const predicted = result.labels;

      if (this.multiLabel) {
        const match = expected.every(l => predicted.includes(l)) && 
                     predicted.every(l => expected.includes(l));
        if (match) correct++;
        
        truePositives += predicted.filter(l => expected.includes(l)).length;
        falsePositives += predicted.filter(l => !expected.includes(l)).length;
        falseNegatives += expected.filter(l => !predicted.includes(l)).length;
      } else {
        if (predicted[0] === expected[0]) correct++;
        if (expected.includes(predicted[0])) truePositives++;
        else falsePositives++;
      }
    }

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;

    return {
      accuracy: correct / total,
      precision,
      recall,
      f1,
      totalTested: total
    };
  }

  /**
   * Extract TF-IDF features from input
   * @private
   * @param {string} input - Input text
   * @returns {Map<string, number>} Feature vector
   */
  extractFeatures(input) {
    const tokens = this.tokenize(input);
    const tf = new Map();
    
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    
    // Normalize TF and apply IDF
    const features = new Map();
    for (const [token, count] of tf) {
      const normalizedTf = count / tokens.length;
      const idf = this.idf.get(token) || Math.log(this.trainingData.length + 1);
      features.set(token, normalizedTf * idf);
    }
    
    return features;
  }

  /**
   * Compute similarity scores for all labels
   * @private
   * @param {Map<string, number>} features - Feature vector
   * @returns {Object.<string, number>} Scores per label
   */
  computeScores(features) {
    const scores = {};
    
    for (const label of this.labels) {
      const labelVector = this.labelVectors.get(label);
      if (!labelVector) {
        scores[label] = 0;
        continue;
      }
      
      // Cosine similarity
      let dotProduct = 0;
      let normFeatures = 0;
      let normLabel = 0;
      
      for (const [token, value] of features) {
        const labelValue = labelVector.get(token) || 0;
        dotProduct += value * labelValue;
        normFeatures += value * value;
      }
      
      for (const value of labelVector.values()) {
        normLabel += value * value;
      }
      
      const similarity = normFeatures > 0 && normLabel > 0 
        ? dotProduct / (Math.sqrt(normFeatures) * Math.sqrt(normLabel))
        : 0;
      
      // Apply learned feature weights
      const weight = this.featureWeights.get(label) || 1;
      scores[label] = Math.min(1, Math.max(0, similarity * weight));
    }
    
    // Softmax normalization
    const expScores = Object.entries(scores).map(([k, v]) => [k, Math.exp(v)]);
    const sumExp = expScores.reduce((sum, [_, v]) => sum + v, 0);
    
    return Object.fromEntries(expScores.map(([k, v]) => [k, v / sumExp]));
  }

  /**
   * Tokenize input text
   * @private
   * @param {string} text - Text to tokenize
   * @returns {string[]} Tokens
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !this.isStopWord(t));
  }

  /**
   * Check if word is a stop word
   * @private
   * @param {string} word - Word to check
   * @returns {boolean}
   */
  isStopWord(word) {
    const stopWords = new Set(['the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 
      'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'a', 'an', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'them', 'their', 'there', 'then', 'than', 'when', 'where']);
    return stopWords.has(word);
  }

  /**
   * Build vocabulary from training data
   * @private
   */
  buildVocabulary() {
    this.vocabulary.clear();
    
    for (const example of this.trainingData) {
      const tokens = this.tokenize(example.input);
      for (const token of tokens) {
        this.vocabulary.set(token, (this.vocabulary.get(token) || 0) + 1);
      }
    }
    
    // Prune rare terms
    for (const [token, count] of this.vocabulary) {
      if (count < 2) {
        this.vocabulary.delete(token);
      }
    }
  }

  /**
   * Compute IDF scores
   * @private
   */
  computeIDF() {
    this.idf.clear();
    const n = this.trainingData.length;
    
    for (const token of this.vocabulary.keys()) {
      let docsWithToken = 0;
      for (const example of this.trainingData) {
        if (this.tokenize(example.input).includes(token)) {
          docsWithToken++;
        }
      }
      this.idf.set(token, Math.log((n + 1) / (docsWithToken + 1)) + 1);
    }
  }

  /**
   * Build centroid vectors for each label
   * @private
   */
  buildLabelVectors() {
    this.labelVectors.clear();
    
    for (const label of this.labels) {
      const examples = this.trainingData.filter(e => {
        const labels = Array.isArray(e.labels) ? e.labels : [e.labels];
        return labels.includes(label);
      });
      
      if (examples.length === 0) continue;
      
      // Average feature vectors
      const vector = new Map();
      for (const example of examples) {
        const features = this.extractFeatures(example.input);
        const weight = example.weight || 1;
        for (const [token, value] of features) {
          vector.set(token, (vector.get(token) || 0) + value * weight);
        }
      }
      
      // Normalize
      for (const [token, value] of vector) {
        vector.set(token, value / examples.length);
      }
      
      this.labelVectors.set(label, vector);
    }
  }

  /**
   * Learn feature weights from training data
   * @private
   */
  learnFeatureWeights() {
    this.featureWeights.clear();
    
    for (const label of this.labels) {
      const examples = this.trainingData.filter(e => {
        const labels = Array.isArray(e.labels) ? e.labels : [e.labels];
        return labels.includes(label);
      });
      
      const otherExamples = this.trainingData.filter(e => {
        const labels = Array.isArray(e.labels) ? e.labels : [e.labels];
        return !labels.includes(label);
      });
      
      if (examples.length === 0) continue;
      
      // Calculate weight based on class separability
      const labelStrength = examples.length / this.trainingData.length;
      const distinctiveness = examples.length / (otherExamples.length + 1);
      
      this.featureWeights.set(label, 1 + Math.log(1 + distinctiveness) * labelStrength);
    }
  }
}

export default IntentClassifier;
