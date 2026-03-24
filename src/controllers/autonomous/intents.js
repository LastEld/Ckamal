/**
 * @fileoverview Intent Parser
 * Parses natural language input into structured intents.
 * @module controllers/autonomous/intents
 */

import { z } from 'zod';

/**
 * Intent types
 * @enum {string}
 */
export const IntentType = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  QUERY: 'QUERY',
  ANALYZE: 'ANALYZE',
  EXECUTE: 'EXECUTE',
};

/**
 * @typedef {Object} ParsedIntent
 * @property {IntentType} type - Intent type
 * @property {string} action - Action verb
 * @property {string} target - Target entity
 * @property {Object} entities - Extracted entities
 * @property {number} confidence - Parsing confidence (0-1)
 * @property {string} original - Original input
 */

/**
 * Intent parsing result schema
 * @const {z.ZodSchema}
 */
const intentSchema = z.object({
  type: z.nativeEnum(IntentType),
  action: z.string().min(1),
  target: z.string().min(1),
  entities: z.record(z.any()),
  confidence: z.number().min(0).max(1),
  original: z.string(),
});

/**
 * Intent patterns for type detection
 * @const {Object}
 */
const INTENT_PATTERNS = {
  [IntentType.CREATE]: [
    /\b(create|make|build|generate|add|new|initialize|start|setup|deploy)\b/i,
  ],
  [IntentType.UPDATE]: [
    /\b(update|modify|change|edit|alter|patch|upgrade|refresh|sync)\b/i,
  ],
  [IntentType.DELETE]: [
    /\b(delete|remove|destroy|drop|clear|clean|purge|uninstall)\b/i,
  ],
  [IntentType.QUERY]: [
    /\b(get|find|search|list|show|display|fetch|retrieve|query|look)\b/i,
  ],
  [IntentType.ANALYZE]: [
    /\b(analyze|check|validate|verify|review|inspect|examine|assess|evaluate)\b/i,
  ],
  [IntentType.EXECUTE]: [
    /\b(run|execute|perform|trigger|invoke|call|process|handle)\b/i,
  ],
};

/**
 * Entity extraction patterns
 * @const {Object}
 */
const ENTITY_PATTERNS = {
  project: /\b(?:project|app|application|repo|repository)\s+(?:named?\s+)?["']?([^"'\s]+)["']?/i,
  name: /\b(?:named?|called?)\s+["']?([^"'\s]+)["']?/i,
  id: /\b(?:id|uuid|identifier)\s*[:=]?\s*["']?([a-f0-9-]{36})["']?/i,
  file: /\b(?:file|path)\s*[:=]?\s*["']?([^"'\s]+)["']?/i,
  url: /\b(https?:\/\/[^\s]+)/i,
  email: /\b([\w.-]+@[\w.-]+\.\w+)\b/i,
  number: /\b(\d+)\b/g,
  boolean: /\b(true|false|yes|no|on|off)\b/gi,
};

/**
 * Intent Parser
 * Parses natural language input into structured intent objects.
 */
export class IntentParser {
  /**
   * Creates an IntentParser instance
   * @param {Object} [config] - Parser configuration
   * @param {Object} [config.customPatterns] - Custom intent patterns
   * @param {Object} [config.entityExtractors] - Custom entity extractors
   */
  constructor(config = {}) {
    this.config = {
      minConfidence: 0.5,
      ...config,
    };

    // Merge custom patterns if provided
    this.patterns = config.customPatterns
      ? { ...INTENT_PATTERNS, ...config.customPatterns }
      : INTENT_PATTERNS;

    this.entityPatterns = config.entityExtractors
      ? { ...ENTITY_PATTERNS, ...config.entityExtractors }
      : ENTITY_PATTERNS;
  }

  /**
   * Parse input into structured intent
   * @param {string} input - Natural language input
   * @returns {ParsedIntent} Parsed intent
   * @example
   * const intent = parser.parseIntent('Create a new project named MyApp');
   * // Returns: { type: 'CREATE', action: 'create', target: 'project', ... }
   */
  parseIntent(input) {
    if (!input || typeof input !== 'string') {
      throw new Error('Input must be a non-empty string');
    }

    const normalizedInput = input.trim();

    // Detect intent type
    const type = this.#detectIntentType(normalizedInput);

    // Extract action
    const action = this.#extractAction(normalizedInput, type);

    // Extract target
    const target = this.#extractTarget(normalizedInput);

    // Extract entities
    const entities = this.#extractEntities(normalizedInput);

    // Calculate confidence
    const confidence = this.#calculateConfidence(normalizedInput, type, entities);

    const intent = {
      type,
      action,
      target,
      entities,
      confidence,
      original: normalizedInput,
    };

    // Validate
    const validation = intentSchema.safeParse(intent);
    if (!validation.success) {
      throw new Error(`Invalid intent: ${validation.error.message}`);
    }

    return intent;
  }

  /**
   * Parse multiple inputs
   * @param {string[]} inputs - Array of inputs
   * @returns {ParsedIntent[]} Array of parsed intents
   */
  parseIntents(inputs) {
    return inputs.map(input => this.parseIntent(input));
  }

  /**
   * Check if input matches intent type
   * @param {string} input - Input to check
   * @param {IntentType} type - Intent type to match
   * @returns {boolean} Whether input matches type
   */
  matchesType(input, type) {
    const patterns = this.patterns[type];
    if (!patterns) return false;

    return patterns.some(pattern => pattern.test(input));
  }

  /**
   * Get best matching intent type
   * @param {string} input - Input to analyze
   * @returns {Object} Best match with confidence
   */
  getBestMatch(input) {
    const matches = Object.values(IntentType).map(type => ({
      type,
      confidence: this.#calculateTypeConfidence(input, type),
    }));

    matches.sort((a, b) => b.confidence - a.confidence);
    return matches[0];
  }

  /**
   * Add custom pattern
   * @param {IntentType} type - Intent type
   * @param {RegExp} pattern - Pattern to add
   * @returns {IntentParser} this for chaining
   */
  addPattern(type, pattern) {
    if (!this.patterns[type]) {
      this.patterns[type] = [];
    }
    this.patterns[type].push(pattern);
    return this;
  }

  /**
   * Add custom entity extractor
   * @param {string} name - Entity name
   * @param {RegExp} pattern - Extraction pattern
   * @returns {IntentParser} this for chaining
   */
  addEntityExtractor(name, pattern) {
    this.entityPatterns[name] = pattern;
    return this;
  }

  /**
   * Detect intent type from input
   * @private
   * @param {string} input - Normalized input
   * @returns {IntentType} Detected intent type
   */
  #detectIntentType(input) {
    const scores = {};

    for (const [type, patterns] of Object.entries(this.patterns)) {
      scores[type] = 0;
      for (const pattern of patterns) {
        const matches = input.match(pattern);
        if (matches) {
          scores[type] += matches.length;
        }
      }
    }

    // Find highest scoring type
    let bestType = IntentType.EXECUTE; // Default
    let bestScore = 0;

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    return bestType;
  }

  /**
   * Extract action verb from input
   * @private
   * @param {string} input - Normalized input
   * @param {IntentType} type - Detected intent type
   * @returns {string} Action verb
   */
  #extractAction(input, type) {
    const patterns = this.patterns[type];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[0].toLowerCase();
      }
    }

    // Fallback: first word
    return input.split(' ')[0].toLowerCase();
  }

  /**
   * Extract target entity from input
   * @private
   * @param {string} input - Normalized input
   * @returns {string} Target entity
   */
  #extractTarget(input) {
    // Common target patterns
    const targetPatterns = [
      /\b(?:the|a|an)\s+(\w+)/i,
      /\b(create|update|delete|get|run|analyze)\s+(?:the|a|an)?\s*(\w+)/i,
    ];

    for (const pattern of targetPatterns) {
      const match = input.match(pattern);
      if (match) {
        // Return the last captured group
        return match[match.length - 1].toLowerCase();
      }
    }

    return 'unknown';
  }

  /**
   * Extract entities from input
   * @private
   * @param {string} input - Normalized input
   * @returns {Object} Extracted entities
   */
  #extractEntities(input) {
    const entities = {};

    for (const [name, pattern] of Object.entries(this.entityPatterns)) {
      if (name === 'number' || name === 'boolean') {
        // Multiple matches for these
        const matches = [...input.matchAll(pattern)];
        if (matches.length > 0) {
          entities[name] = matches.map(m => 
            name === 'number' ? parseInt(m[1], 10) : m[1].toLowerCase() === 'true' || m[1].toLowerCase() === 'yes'
          );
        }
      } else {
        const match = input.match(pattern);
        if (match) {
          entities[name] = match[1];
        }
      }
    }

    return entities;
  }

  /**
   * Calculate parsing confidence
   * @private
   * @param {string} input - Original input
   * @param {IntentType} type - Detected type
   * @param {Object} entities - Extracted entities
   * @returns {number} Confidence score (0-1)
   */
  #calculateConfidence(input, type, entities) {
    let confidence = this.#calculateTypeConfidence(input, type);

    // Boost confidence based on entity extraction
    const entityCount = Object.keys(entities).length;
    if (entityCount > 0) {
      confidence += Math.min(entityCount * 0.1, 0.3);
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate type detection confidence
   * @private
   * @param {string} input - Original input
   * @param {IntentType} type - Intent type
   * @returns {number} Confidence score
   */
  #calculateTypeConfidence(input, type) {
    const patterns = this.patterns[type];
    let matches = 0;
    let total = 0;

    for (const pattern of patterns) {
      const patternMatches = input.match(pattern);
      if (patternMatches) {
        matches += patternMatches.length;
      }
      total++;
    }

    return Math.min(matches / Math.max(total * 0.5, 1), 0.7);
  }
}

/**
 * Create a pre-configured intent parser for common use cases
 * @param {string} useCase - Use case name
 * @returns {IntentParser} Configured parser
 */
export function createIntentParser(useCase) {
  const configs = {
    project: {
      customPatterns: {
        [IntentType.CREATE]: [
          /\b(create|make|build|generate|add|new|initialize|start|setup)\s+(?:a\s+)?(?:new\s+)?project/i,
        ],
      },
      entityExtractors: {
        template: /\b(?:from|using)\s+(?:template\s+)?["']?([^"'\s]+)["']?/i,
        visibility: /\b(public|private|internal)\b/i,
      },
    },
    workflow: {
      customPatterns: {
        [IntentType.EXECUTE]: [
          /\b(run|execute|start|trigger|launch)\s+(?:a\s+)?(?:new\s+)?workflow/i,
        ],
      },
      entityExtractors: {
        workflowId: /\b(?:workflow|pipeline)\s+(?:id\s*[:=]?\s*)?["']?([a-f0-9-]{36})["']?/i,
        priority: /\b(?:priority|level)\s*[:=]?\s*(high|medium|low)\b/i,
      },
    },
    data: {
      customPatterns: {
        [IntentType.QUERY]: [
          /\b(get|find|search|fetch|retrieve|query|select)\s+(?:all\s+)?data/i,
        ],
      },
      entityExtractors: {
        table: /\b(?:from|in|table)\s+["']?([^"'\s]+)["']?/i,
        limit: /\blimit\s+(\d+)\b/i,
        offset: /\boffset\s+(\d+)\b/i,
      },
    },
  };

  const config = configs[useCase] || {};
  return new IntentParser(config);
}

export default IntentParser;
