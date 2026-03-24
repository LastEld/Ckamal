/**
 * @fileoverview Task verification with success criteria and failure classification.
 * @module gsd/verifier
 */

/**
 * Verification result types.
 * @readonly
 * @enum {string}
 */
export const VerificationResult = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  PARTIAL: 'partial',
  RETRY: 'retry',
  SKIP: 'skip'
};

/**
 * Failure types for classification.
 * @readonly
 * @enum {string}
 */
export const FailureType = {
  TRANSIENT: 'transient',      // Temporary, can retry
  PERMANENT: 'permanent',      // Permanent failure, don't retry
  TIMEOUT: 'timeout',          // Time limit exceeded
  VALIDATION: 'validation',    // Validation failed
  DEPENDENCY: 'dependency',    // Dependency not met
  UNKNOWN: 'unknown'           // Unclassified failure
};

/**
 * Verification rule structure.
 * @typedef {Object} ValidationRule
 * @property {string} name - Rule name
 * @property {Function} validate - Validation function (result) => boolean
 * @property {string} [message] - Error message on failure
 * @property {FailureType} [failureType] - Type of failure for this rule
 * @property {boolean} [required=true] - Whether rule is required
 */

/**
 * Success criteria structure.
 * @typedef {Object} SuccessCriteria
 * @property {Function} [check] - Custom check function
 * @property {ValidationRule[]} [rules] - Validation rules
 * @property {number} [minConfidence=1.0] - Minimum confidence threshold
 * @property {number} [maxRetries=3] - Maximum retry attempts
 * @property {number} [retryDelay=1000] - Delay between retries in ms
 */

/**
 * Verification result structure.
 * @typedef {Object} VerificationOutcome
 * @property {VerificationResult} result - Verification result
 * @property {FailureType} [failureType] - Type of failure
 * @property {string[]} [errors] - Error messages
 * @property {Object} [details] - Additional details
 * @property {boolean} [shouldRetry] - Whether to retry
 * @property {number} [confidence] - Confidence score 0-1
 */

/**
 * Verifies task results against success criteria.
 */
export class Verifier {
  /**
   * @param {Object} [options] - Verifier options
   * @param {SuccessCriteria} [options.defaultCriteria] - Default success criteria
   * @param {boolean} [options.strictMode=false] - Strict validation mode
   */
  constructor(options = {}) {
    this.defaultCriteria = options.defaultCriteria || {};
    this.strictMode = options.strictMode || false;
    
    /** @type {Map<string, ValidationRule[]>} */
    this.ruleSets = new Map();
  }

  /**
   * Register a rule set for a task type.
   * @param {string} taskType - Task type identifier
   * @param {ValidationRule[]} rules - Validation rules
   */
  registerRuleSet(taskType, rules) {
    this.ruleSets.set(taskType, rules);
  }

  /**
   * Get rules for a task.
   * @param {Object} task - Task object
   * @param {SuccessCriteria} [criteria] - Success criteria
   * @returns {ValidationRule[]}
   * @private
   */
  getRules(task, criteria = {}) {
    const rules = [];

    // Add rules from registered rule set
    if (task.type && this.ruleSets.has(task.type)) {
      rules.push(...this.ruleSets.get(task.type));
    }

    // Add rules from criteria
    if (criteria.rules) {
      rules.push(...criteria.rules);
    }

    return rules;
  }

  /**
   * Classify failure type from error.
   * @param {Error} error - Error object
   * @param {Object} [context] - Additional context
   * @returns {FailureType}
   * @private
   */
  classifyFailure(error, context = {}) {
    const message = error?.message || String(error);
    const code = error?.code || context.code;

    // Timeout errors
    if (code === 'ETIMEOUT' || message.includes('timeout')) {
      return FailureType.TIMEOUT;
    }

    // Network/transient errors
    if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(code) ||
        message.includes('network') ||
        message.includes('temporary')) {
      return FailureType.TRANSIENT;
    }

    // Validation errors
    if (code === 'EVALIDATION' || message.includes('validation') || message.includes('invalid')) {
      return FailureType.VALIDATION;
    }

    // Dependency errors
    if (code === 'EDEPENDENCY' || message.includes('dependency') || message.includes('required')) {
      return FailureType.DEPENDENCY;
    }

    // Permanent errors
    if (code === 'EPERM' || message.includes('permission') || message.includes('unauthorized')) {
      return FailureType.PERMANENT;
    }

    return FailureType.UNKNOWN;
  }

  /**
   * Determine if failure should be retried.
   * @param {FailureType} failureType - Type of failure
   * @param {SuccessCriteria} [criteria] - Success criteria
   * @param {number} [attemptCount=0] - Current attempt count
   * @returns {boolean}
   * @private
   */
  shouldRetry(failureType, criteria = {}, attemptCount = 0) {
    const maxRetries = criteria.maxRetries ?? this.defaultCriteria.maxRetries ?? 3;

    if (attemptCount >= maxRetries) {
      return false;
    }

    // Only retry transient and timeout failures
    return failureType === FailureType.TRANSIENT || 
           failureType === FailureType.TIMEOUT ||
           failureType === FailureType.UNKNOWN;
  }

  /**
   * Calculate confidence score.
   * @param {Object} result - Task result
   * @param {ValidationRule[]} [rules] - Applied rules
   * @param {boolean[]} [passed] - Which rules passed
   * @returns {number} Confidence score 0-1
   * @private
   */
  calculateConfidence(result, rules = [], passed = []) {
    if (rules.length === 0) {
      return result != null ? 1.0 : 0.0;
    }

    const requiredRules = rules.filter(r => r.required !== false);
    const optionalRules = rules.filter(r => r.required === false);

    let score = 0;

    // Required rules must pass
    const requiredPassed = requiredRules.filter((_, i) => passed[i]).length;
    if (requiredRules.length > 0) {
      score += (requiredPassed / requiredRules.length) * 0.8;
    } else {
      score += 0.8;
    }

    // Optional rules contribute partially
    const optionalPassed = optionalRules.filter((_, i) => 
      passed[requiredRules.length + i]
    ).length;
    if (optionalRules.length > 0) {
      score += (optionalPassed / optionalRules.length) * 0.2;
    } else {
      score += 0.2;
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Verify a task result against success criteria.
   * @param {Object} task - Task object
   * @param {*} result - Task result to verify
   * @param {Object} [options] - Verification options
   * @param {SuccessCriteria} [options.criteria] - Success criteria
   * @param {number} [options.attemptCount=0] - Current attempt count
   * @returns {VerificationOutcome} Verification outcome
   * @example
   * const outcome = verifier.verify(task, result, {
   *   criteria: {
   *     rules: [
   *       { name: 'notNull', validate: r => r != null, message: 'Result is null' }
   *     ],
   *     minConfidence: 0.8,
   *     maxRetries: 3
   *   }
   * });
   * 
   * if (outcome.shouldRetry) {
   *   // Retry the task
   * }
   */
  verify(task, result, options = {}) {
    const criteria = { ...this.defaultCriteria, ...options.criteria };
    const attemptCount = options.attemptCount || 0;
    const errors = [];
    const passed = [];

    try {
      // Run custom check if provided
      if (criteria.check) {
        const checkResult = criteria.check(result, task);
        if (!checkResult) {
          errors.push('Custom success criteria check failed');
        }
      }

      // Run validation rules
      const rules = this.getRules(task, criteria);
      for (const rule of rules) {
        try {
          const rulePassed = rule.validate(result, task);
          passed.push(rulePassed);
          
          if (!rulePassed) {
            errors.push(rule.message || `Rule "${rule.name}" failed`);
          }
        } catch (error) {
          passed.push(false);
          errors.push(`Rule "${rule.name}" threw error: ${error.message}`);
        }
      }

      // Calculate confidence
      const confidence = this.calculateConfidence(result, rules, passed);
      const minConfidence = criteria.minConfidence ?? 1.0;

      // Determine outcome
      if (errors.length === 0 && confidence >= minConfidence) {
        return {
          result: VerificationResult.SUCCESS,
          confidence,
          shouldRetry: false
        };
      }

      // Failure case
      const failureType = errors.length > 0 
        ? this.classifyFailure(new Error(errors[0]))
        : FailureType.VALIDATION;

      const shouldRetry = this.shouldRetry(failureType, criteria, attemptCount);

      return {
        result: confidence > 0 ? VerificationResult.PARTIAL : VerificationResult.FAILURE,
        failureType,
        errors,
        details: { confidence, minConfidence, rulesPassed: passed.filter(p => p).length, totalRules: rules.length },
        shouldRetry,
        confidence
      };

    } catch (error) {
      const failureType = this.classifyFailure(error);
      const shouldRetry = this.shouldRetry(failureType, criteria, attemptCount);

      return {
        result: VerificationResult.FAILURE,
        failureType,
        errors: [error.message],
        details: { error: error.stack },
        shouldRetry,
        confidence: 0
      };
    }
  }

  /**
   * Batch verify multiple results.
   * @param {Array<{task: Object, result: *}>} items - Items to verify
   * @param {SuccessCriteria} [criteria] - Success criteria
   * @returns {VerificationOutcome[]} Array of verification outcomes
   */
  verifyBatch(items, criteria) {
    return items.map(({ task, result }) => this.verify(task, result, { criteria }));
  }

  /**
   * Create a validation rule.
   * @param {string} name - Rule name
   * @param {Function} validate - Validation function
   * @param {Object} [options] - Rule options
   * @returns {ValidationRule}
   */
  static createRule(name, validate, options = {}) {
    return {
      name,
      validate,
      message: options.message || `Rule "${name}" failed`,
      failureType: options.failureType || FailureType.VALIDATION,
      required: options.required !== false
    };
  }

  /**
   * Common validation rules.
   * @readonly
   */
  static Rules = {
    notNull: (options = {}) => Verifier.createRule(
      'notNull',
      (result) => result != null,
      { message: 'Result is null or undefined', ...options }
    ),
    
    notEmpty: (options = {}) => Verifier.createRule(
      'notEmpty',
      (result) => {
        if (result == null) return false;
        if (typeof result === 'string') return result.length > 0;
        if (Array.isArray(result)) return result.length > 0;
        if (typeof result === 'object') return Object.keys(result).length > 0;
        return true;
      },
      { message: 'Result is empty', ...options }
    ),

    isType: (type, options = {}) => Verifier.createRule(
      'isType',
      (result) => typeof result === type,
      { message: `Result is not of type ${type}`, ...options }
    ),

    hasProperty: (prop, options = {}) => Verifier.createRule(
      'hasProperty',
      (result) => result != null && prop in result,
      { message: `Result missing required property: ${prop}`, ...options }
    ),

    matchesPattern: (pattern, options = {}) => Verifier.createRule(
      'matchesPattern',
      (result) => pattern.test(String(result)),
      { message: `Result does not match pattern: ${pattern}`, ...options }
    ),

    custom: (name, fn, options = {}) => Verifier.createRule(name, fn, options)
  };
}

export default Verifier;
