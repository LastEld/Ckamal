/**
 * @fileoverview Alert trigger rules including threshold, pattern,
 * anomaly detection, and composite rule combinations.
 * @module alerts/rules
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} EvaluationContext
 * @property {Object} data - Data to evaluate against
 * @property {number} [timestamp] - Evaluation timestamp
 * @property {Object} [history] - Historical data for context
 */

/**
 * @typedef {Object} RuleResult
 * @property {boolean} triggered - Whether the rule triggered
 * @property {string} ruleId - Rule identifier
 * @property {string} ruleType - Type of rule
 * @property {string} [message] - Trigger message
 * @property {Object} [details] - Additional trigger details
 * @property {number} severity - Trigger severity (1-10)
 */

/**
 * Base class for all alert rules.
 * @extends EventEmitter
 * @abstract
 */
export class BaseRule extends EventEmitter {
  /**
   * Creates a new BaseRule instance.
   * @param {string} id - Unique rule identifier
   * @param {Object} [options={}] - Rule options
   * @param {string} [options.description] - Rule description
   * @param {boolean} [options.enabled=true] - Whether rule is enabled
   * @param {number} [options.severity=5] - Default severity (1-10)
   */
  constructor(id, options = {}) {
    super();
    this.id = id;
    this.description = options.description || '';
    this.enabled = options.enabled !== false;
    this.severity = options.severity || 5;
    this.metrics = {
      evaluations: 0,
      triggers: 0,
      lastEvaluated: null,
      lastTriggered: null
    };
  }

  /**
   * Evaluates the rule against provided context.
   * @abstract
   * @param {EvaluationContext} context - Evaluation context
   * @returns {RuleResult} Evaluation result
   */
  evaluate(context) {
    throw new Error('evaluate() must be implemented by subclass');
  }

  /**
   * Creates a successful (non-triggered) result.
   * @protected
   * @returns {RuleResult} Non-triggered result
   */
  createNegativeResult() {
    return {
      triggered: false,
      ruleId: this.id,
      ruleType: this.constructor.name
    };
  }

  /**
   * Creates a triggered result.
   * @protected
   * @param {string} message - Trigger message
   * @param {Object} [details={}] - Additional details
   * @param {number} [severity] - Override severity
   * @returns {RuleResult} Triggered result
   */
  createTriggeredResult(message, details = {}, severity) {
    return {
      triggered: true,
      ruleId: this.id,
      ruleType: this.constructor.name,
      message,
      details,
      severity: severity || this.severity
    };
  }

  /**
   * Updates metrics after evaluation.
   * @protected
   * @param {boolean} triggered - Whether rule triggered
   */
  updateMetrics(triggered) {
    this.metrics.evaluations++;
    this.metrics.lastEvaluated = new Date().toISOString();
    
    if (triggered) {
      this.metrics.triggers++;
      this.metrics.lastTriggered = this.metrics.lastEvaluated;
    }
  }
}

/**
 * Threshold-based rule that triggers when value exceeds a threshold.
 * @extends BaseRule
 */
export class ThresholdRule extends BaseRule {
  /**
   * Comparison operators.
   * @readonly
   * @enum {string}
   */
  static Operator = {
    GT: 'GT',      // Greater than
    GTE: 'GTE',    // Greater than or equal
    LT: 'LT',      // Less than
    LTE: 'LTE',    // Less than or equal
    EQ: 'EQ',      // Equal
    NEQ: 'NEQ'     // Not equal
  };

  /**
   * Creates a new ThresholdRule instance.
   * @param {string} id - Rule identifier
   * @param {Object} config - Rule configuration
   * @param {string} config.metric - Metric path to evaluate (e.g., 'cpu.usage')
   * @param {number} config.threshold - Threshold value
   * @param {string} [config.operator='GT'] - Comparison operator
   * @param {number} [config.durationMs=0] - Duration threshold must be exceeded
   * @param {Object} [options={}] - Rule options
   */
  constructor(id, config, options = {}) {
    super(id, options);
    this.metric = config.metric;
    this.threshold = config.threshold;
    this.operator = config.operator || ThresholdRule.Operator.GT;
    this.durationMs = config.durationMs || 0;
    
    /** @type {Map<string, number>} */
    this.firstExceeded = new Map();
  }

  /**
   * Evaluates if value exceeds threshold.
   * @param {EvaluationContext} context - Evaluation context
   * @returns {RuleResult} Evaluation result
   */
  evaluate(context) {
    if (!this.enabled) return this.createNegativeResult();

    const value = this.extractValue(context.data, this.metric);
    
    if (value === undefined || value === null) {
      return this.createNegativeResult();
    }

    const exceeded = this.compare(value, this.threshold);
    const sourceKey = context.data.source || 'default';
    
    let triggered = false;
    let message = '';

    if (exceeded) {
      const now = Date.now();
      const firstTime = this.firstExceeded.get(sourceKey);
      
      if (!firstTime) {
        this.firstExceeded.set(sourceKey, now);
      }
      
      if (this.durationMs === 0 || (now - firstTime) >= this.durationMs) {
        triggered = true;
        message = `Metric '${this.metric}' (${value}) ${this.getOperatorText()} ${this.threshold}`;
      }
    } else {
      this.firstExceeded.delete(sourceKey);
    }

    this.updateMetrics(triggered);

    if (triggered) {
      this.emit('triggered', { rule: this, value, context });
      return this.createTriggeredResult(message, {
        metric: this.metric,
        value,
        threshold: this.threshold,
        operator: this.operator,
        duration: this.durationMs
      });
    }

    return this.createNegativeResult();
  }

  /**
   * Extracts a value from data using dot notation path.
   * @private
   * @param {Object} data - Data object
   * @param {string} path - Dot notation path
   * @returns {any} Extracted value
   */
  extractValue(data, path) {
    return path.split('.').reduce((obj, key) => obj?.[key], data);
  }

  /**
   * Compares value against threshold using configured operator.
   * @private
   * @param {number} value - Value to compare
   * @param {number} threshold - Threshold value
   * @returns {boolean} Comparison result
   */
  compare(value, threshold) {
    switch (this.operator) {
      case ThresholdRule.Operator.GT: return value > threshold;
      case ThresholdRule.Operator.GTE: return value >= threshold;
      case ThresholdRule.Operator.LT: return value < threshold;
      case ThresholdRule.Operator.LTE: return value <= threshold;
      case ThresholdRule.Operator.EQ: return value === threshold;
      case ThresholdRule.Operator.NEQ: return value !== threshold;
      default: return false;
    }
  }

  /**
   * Gets human-readable operator text.
   * @private
   * @returns {string} Operator description
   */
  getOperatorText() {
    const texts = {
      [ThresholdRule.Operator.GT]: 'exceeds',
      [ThresholdRule.Operator.GTE]: 'is greater than or equal to',
      [ThresholdRule.Operator.LT]: 'is below',
      [ThresholdRule.Operator.LTE]: 'is less than or equal to',
      [ThresholdRule.Operator.EQ]: 'equals',
      [ThresholdRule.Operator.NEQ]: 'is not equal to'
    };
    return texts[this.operator] || 'compares to';
  }
}

/**
 * Pattern-based rule that triggers on regex matches.
 * @extends BaseRule
 */
export class PatternRule extends BaseRule {
  /**
   * Creates a new PatternRule instance.
   * @param {string} id - Rule identifier
   * @param {Object} config - Rule configuration
   * @param {string} config.field - Field to match against
   * @param {string} config.pattern - Regex pattern
   * @param {string} [config.flags=''] - Regex flags
   * @param {boolean} [config.caseSensitive=true] - Case sensitivity
   * @param {Object} [options={}] - Rule options
   */
  constructor(id, config, options = {}) {
    super(id, options);
    this.field = config.field;
    this.pattern = config.pattern;
    this.flags = config.flags || '';
    this.caseSensitive = config.caseSensitive !== false;
    
    const regexFlags = this.caseSensitive ? this.flags : this.flags + 'i';
    this.regex = new RegExp(config.pattern, regexFlags);
  }

  /**
   * Evaluates if data matches the pattern.
   * @param {EvaluationContext} context - Evaluation context
   * @returns {RuleResult} Evaluation result
   */
  evaluate(context) {
    if (!this.enabled) return this.createNegativeResult();

    const value = this.extractValue(context.data, this.field);
    
    if (value === undefined || value === null) {
      return this.createNegativeResult();
    }

    const strValue = String(value);
    const match = this.regex.test(strValue);

    this.updateMetrics(match);

    if (match) {
      const matches = strValue.match(this.regex);
      const message = `Field '${this.field}' matches pattern '${this.pattern}'`;
      
      this.emit('triggered', { rule: this, value: strValue, matches, context });
      
      return this.createTriggeredResult(message, {
        field: this.field,
        value: strValue,
        pattern: this.pattern,
        matches: matches ? matches.slice(0, 10) : [] // Limit matches
      });
    }

    return this.createNegativeResult();
  }

  /**
   * Extracts a value from data using dot notation path.
   * @private
   * @param {Object} data - Data object
   * @param {string} path - Dot notation path
   * @returns {any} Extracted value
   */
  extractValue(data, path) {
    return path.split('.').reduce((obj, key) => obj?.[key], data);
  }
}

/**
 * Anomaly detection rule using statistical methods.
 * @extends BaseRule
 */
export class AnomalyRule extends BaseRule {
  /**
   * Anomaly detection methods.
   * @readonly
   * @enum {string}
   */
  static Method = {
    ZSCORE: 'ZSCORE',
    IQR: 'IQR',
    MAD: 'MAD' // Median Absolute Deviation
  };

  /**
   * Creates a new AnomalyRule instance.
   * @param {string} id - Rule identifier
   * @param {Object} config - Rule configuration
   * @param {string} config.metric - Metric to analyze
   * @param {string} [config.method='ZSCORE'] - Detection method
   * @param {number} [config.threshold=3] - Anomaly threshold
   * @param {number} [config.windowSize=100] - History window size
   * @param {Object} [options={}] - Rule options
   */
  constructor(id, config, options = {}) {
    super(id, options);
    this.metric = config.metric;
    this.method = config.method || AnomalyRule.Method.ZSCORE;
    this.threshold = config.threshold || 3;
    this.windowSize = config.windowSize || 100;
    
    /** @type {Array<number>} */
    this.history = [];
    
    /** @type {Object} */
    this.stats = {
      mean: 0,
      stdDev: 0,
      median: 0,
      mad: 0
    };
  }

  /**
   * Evaluates if current value is anomalous.
   * @param {EvaluationContext} context - Evaluation context
   * @returns {RuleResult} Evaluation result
   */
  evaluate(context) {
    if (!this.enabled) return this.createNegativeResult();

    const value = this.extractValue(context.data, this.metric);
    
    if (value === undefined || value === null) {
      return this.createNegativeResult();
    }

    // Update history
    this.history.push(value);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }

    // Need minimum data points
    if (this.history.length < 10) {
      return this.createNegativeResult();
    }

    // Calculate statistics
    this.calculateStats();

    // Detect anomaly
    const { isAnomaly, score } = this.detectAnomaly(value);

    this.updateMetrics(isAnomaly);

    if (isAnomaly) {
      const message = `Anomaly detected in '${this.metric}': score ${score.toFixed(2)}`;
      
      this.emit('triggered', { 
        rule: this, 
        value, 
        score, 
        stats: { ...this.stats },
        context 
      });
      
      return this.createTriggeredResult(message, {
        metric: this.metric,
        value,
        score,
        method: this.method,
        stats: { ...this.stats },
        threshold: this.threshold
      });
    }

    return this.createNegativeResult();
  }

  /**
   * Calculates statistical measures from history.
   * @private
   */
  calculateStats() {
    const sorted = [...this.history].sort((a, b) => a - b);
    const n = sorted.length;

    // Mean
    this.stats.mean = this.history.reduce((a, b) => a + b, 0) / n;

    // Median
    const mid = Math.floor(n / 2);
    this.stats.median = n % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    // Standard Deviation
    const variance = this.history.reduce((sum, val) => {
      return sum + Math.pow(val - this.stats.mean, 2);
    }, 0) / n;
    this.stats.stdDev = Math.sqrt(variance);

    // Median Absolute Deviation
    const deviations = this.history.map(v => Math.abs(v - this.stats.median));
    const sortedDeviations = deviations.sort((a, b) => a - b);
    this.stats.mad = n % 2 === 0
      ? (sortedDeviations[mid - 1] + sortedDeviations[mid]) / 2
      : sortedDeviations[mid];
  }

  /**
   * Detects if value is anomalous.
   * @private
   * @param {number} value - Value to check
   * @returns {{isAnomaly: boolean, score: number}} Detection result
   */
  detectAnomaly(value) {
    let score = 0;
    let isAnomaly = false;

    switch (this.method) {
      case AnomalyRule.Method.ZSCORE:
        if (this.stats.stdDev === 0) return { isAnomaly: false, score: 0 };
        score = Math.abs((value - this.stats.mean) / this.stats.stdDev);
        isAnomaly = score > this.threshold;
        break;

      case AnomalyRule.Method.IQR:
        const sorted = [...this.history].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lowerBound = q1 - this.threshold * iqr;
        const upperBound = q3 + this.threshold * iqr;
        score = value < lowerBound ? (lowerBound - value) / iqr : 
                value > upperBound ? (value - upperBound) / iqr : 0;
        isAnomaly = value < lowerBound || value > upperBound;
        break;

      case AnomalyRule.Method.MAD:
        if (this.stats.mad === 0) return { isAnomaly: false, score: 0 };
        score = Math.abs((value - this.stats.median) / (this.stats.mad * 1.4826));
        isAnomaly = score > this.threshold;
        break;
    }

    return { isAnomaly, score };
  }

  /**
   * Extracts a value from data using dot notation path.
   * @private
   * @param {Object} data - Data object
   * @param {string} path - Dot notation path
   * @returns {any} Extracted value
   */
  extractValue(data, path) {
    return path.split('.').reduce((obj, key) => obj?.[key], data);
  }
}

/**
 * Composite rule that combines multiple rules with AND/OR logic.
 * @extends BaseRule
 */
export class CompositeRule extends BaseRule {
  /**
   * Logical operators.
   * @readonly
   * @enum {string}
   */
  static Operator = {
    AND: 'AND',
    OR: 'OR',
    NOT: 'NOT'
  };

  /**
   * Creates a new CompositeRule instance.
   * @param {string} id - Rule identifier
   * @param {Object} config - Rule configuration
   * @param {Array<BaseRule>} config.rules - Child rules
   * @param {string} [config.operator='AND'] - Logical operator
   * @param {Object} [options={}] - Rule options
   */
  constructor(id, config, options = {}) {
    super(id, options);
    this.rules = config.rules || [];
    this.operator = config.operator || CompositeRule.Operator.AND;
    
    // Propagate child rule events
    this.rules.forEach(rule => {
      rule.on('triggered', (data) => {
        this.emit('childTriggered', { parentId: this.id, ...data });
      });
    });
  }

  /**
   * Adds a child rule.
   * @param {BaseRule} rule - Rule to add
   */
  addRule(rule) {
    this.rules.push(rule);
    rule.on('triggered', (data) => {
      this.emit('childTriggered', { parentId: this.id, ...data });
    });
  }

  /**
   * Removes a child rule.
   * @param {string} ruleId - ID of rule to remove
   * @returns {boolean} Whether removal was successful
   */
  removeRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      const rule = this.rules[index];
      rule.removeAllListeners('triggered');
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Evaluates all child rules with the configured operator.
   * @param {EvaluationContext} context - Evaluation context
   * @returns {RuleResult} Evaluation result
   */
  evaluate(context) {
    if (!this.enabled || this.rules.length === 0) {
      return this.createNegativeResult();
    }

    const results = this.rules.map(rule => rule.evaluate(context));
    const triggered = results.filter(r => r.triggered);

    let isTriggered = false;
    let triggerResults = [];

    switch (this.operator) {
      case CompositeRule.Operator.AND:
        isTriggered = triggered.length === this.rules.length && this.rules.length > 0;
        triggerResults = results;
        break;
      case CompositeRule.Operator.OR:
        isTriggered = triggered.length > 0;
        triggerResults = triggered;
        break;
      case CompositeRule.Operator.NOT:
        isTriggered = triggered.length === 0 && this.rules.length > 0;
        triggerResults = results;
        break;
    }

    this.updateMetrics(isTriggered);

    if (isTriggered) {
      const message = `Composite rule '${this.id}' triggered (${this.operator})`;
      
      this.emit('triggered', { 
        rule: this, 
        operator: this.operator,
        childResults: results,
        context 
      });
      
      return this.createTriggeredResult(message, {
        operator: this.operator,
        ruleCount: this.rules.length,
        triggeredCount: triggered.length,
        childResults: triggerResults
      });
    }

    return this.createNegativeResult();
  }

  /**
   * Gets metrics for all child rules.
   * @returns {Object} Combined metrics
   */
  getChildMetrics() {
    return this.rules.map(rule => ({
      id: rule.id,
      type: rule.constructor.name,
      metrics: { ...rule.metrics }
    }));
  }
}

/**
 * Rule engine for managing and evaluating multiple rules.
 * @extends EventEmitter
 */
export class RuleEngine extends EventEmitter {
  /**
   * Creates a new RuleEngine instance.
   */
  constructor() {
    super();
    /** @type {Map<string, BaseRule>} */
    this.rules = new Map();
    this.metrics = {
      evaluations: 0,
      triggers: 0
    };
  }

  /**
   * Registers a rule with the engine.
   * @param {BaseRule} rule - Rule to register
   */
  register(rule) {
    this.rules.set(rule.id, rule);
    
    rule.on('triggered', (data) => {
      this.emit('ruleTriggered', data);
    });
  }

  /**
   * Unregisters a rule.
   * @param {string} ruleId - Rule ID
   * @returns {boolean} Whether unregistration was successful
   */
  unregister(ruleId) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.removeAllListeners('triggered');
      this.rules.delete(ruleId);
      return true;
    }
    return false;
  }

  /**
   * Evaluates all registered rules.
   * @param {EvaluationContext} context - Evaluation context
   * @returns {Array<RuleResult>} Array of evaluation results
   */
  evaluate(context) {
    const results = [];
    
    for (const rule of this.rules.values()) {
      const result = rule.evaluate(context);
      results.push(result);
      
      this.metrics.evaluations++;
      if (result.triggered) {
        this.metrics.triggers++;
      }
    }

    this.emit('evaluationComplete', { results, context });
    return results;
  }

  /**
   * Evaluates rules and returns only triggered results.
   * @param {EvaluationContext} context - Evaluation context
   * @returns {Array<RuleResult>} Triggered rule results
   */
  evaluateTriggered(context) {
    return this.evaluate(context).filter(r => r.triggered);
  }

  /**
   * Gets a rule by ID.
   * @param {string} ruleId - Rule ID
   * @returns {BaseRule|null} Rule or null if not found
   */
  getRule(ruleId) {
    return this.rules.get(ruleId) || null;
  }

  /**
   * Gets all registered rules.
   * @returns {Array<BaseRule>} All rules
   */
  getAllRules() {
    return Array.from(this.rules.values());
  }

  /**
   * Gets engine metrics.
   * @returns {Object} Engine metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      ruleCount: this.rules.size
    };
  }
}

export default {
  BaseRule,
  ThresholdRule,
  PatternRule,
  AnomalyRule,
  CompositeRule,
  RuleEngine
};
