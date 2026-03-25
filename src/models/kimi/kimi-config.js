/**
 * Kimi Configuration Module
 * Model variants, context management, cost and speed optimization
 * 
 * @module models/kimi/kimi-config
 */

/**
 * Model variants with their specifications
 */
export const KIMI_MODELS = {
  // Standard chat models with different context sizes
  'moonshot-v1-8k': {
    id: 'moonshot-v1-8k',
    name: 'Moonshot V1 8K',
    contextWindow: 8192,
    maxOutputTokens: 4096,
    description: 'Fast, cost-effective model for simple tasks',
    bestFor: ['quick_chat', 'simple_qa', 'basic_completion'],
    speed: 'fastest',
    cost: 'lowest'
  },

  'moonshot-v1-32k': {
    id: 'moonshot-v1-32k',
    name: 'Moonshot V1 32K',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    description: 'Balanced model for most tasks',
    bestFor: ['code_review', 'document_analysis', 'medium_context'],
    speed: 'fast',
    cost: 'low'
  },

  'moonshot-v1-128k': {
    id: 'moonshot-v1-128k',
    name: 'Moonshot V1 128K',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    description: 'Large context model for comprehensive analysis',
    bestFor: ['large_codebase', 'long_documents', 'complex_analysis'],
    speed: 'medium',
    cost: 'medium'
  },

  'moonshot-v1-256k': {
    id: 'moonshot-v1-256k',
    name: 'Moonshot V1 256K',
    contextWindow: 262144,
    maxOutputTokens: 8192,
    description: 'Maximum context model for enterprise use',
    bestFor: ['enterprise_analysis', 'multi_file_refactoring', 'deep_research'],
    speed: 'medium',
    cost: 'high'
  },

  // Vision model for multimodal tasks
  'moonshot-v1-vision': {
    id: 'moonshot-v1-vision',
    name: 'Moonshot V1 Vision',
    contextWindow: 8192,
    maxOutputTokens: 4096,
    description: 'Vision-capable model for image analysis',
    bestFor: ['image_analysis', 'ocr', 'visual_qa', 'ui_analysis'],
    speed: 'fast',
    cost: 'low',
    vision: true
  },

  // Auto-selection marker
  AUTO: 'auto'
};

/**
 * Model aliases for common use cases
 */
export const MODEL_ALIASES = {
  DEFAULT: 'moonshot-v1-128k',
  FAST: 'moonshot-v1-8k',
  BALANCED: 'moonshot-v1-32k',
  LARGE: 'moonshot-v1-128k',
  MAX: 'moonshot-v1-256k',
  VISION: 'moonshot-v1-vision'
};

/**
 * Context window thresholds for model selection
 */
export const CONTEXT_THRESHOLDS = {
  TINY: 4096,      // Use 8k model
  SMALL: 16384,    // Use 8k or 32k model  
  MEDIUM: 65536,   // Use 32k or 128k model
  LARGE: 122880,   // Use 128k model
  XLARGE: 245760   // Use 256k model
};

/**
 * Feature configuration
 */
export const FEATURES = {
  LONG_CONTEXT: {
    enabled: true,
    defaultModel: 'moonshot-v1-256k',
    minContextTokens: 64000,
    contextCachingThreshold: 64000
  },

  THINKING_MODE: {
    enabled: true,
    defaultTemperature: 0.3,
    maxReasoningTokens: 8192
  },

  MULTIMODAL: {
    enabled: true,
    defaultModel: 'moonshot-v1-vision',
    supportedFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
    maxImageSize: 20 * 1024 * 1024, // 20MB
    maxImagesPerRequest: 10
  },

  CHINESE_OPTIMIZATION: {
    enabled: true,
    defaultTemperature: 0.2,
    optimizationTypes: ['general', 'text_processing', 'search', 'display', 'storage']
  },

  STREAMING: {
    enabled: true,
    chunkSize: 1024,
    defaultTimeout: 300000 // 5 minutes
  },

  CONTEXT_CACHING: {
    enabled: true,
    threshold: 64000,
    maxCacheSize: 100 * 1024 * 1024, // 100MB
    ttl: 3600000 // 1 hour
  }
};

/**
 * Cost optimization settings
 */
export const COST_OPTIMIZATION = {
  // Token cost thresholds for warnings
  WARNING_THRESHOLD: 0.50,  // $0.50
  LIMIT_THRESHOLD: 5.00,    // $5.00

  // Auto model selection based on input size
  AUTO_SELECT: {
    enabled: true,
    strategy: 'balanced' // 'cost', 'speed', 'quality', 'balanced'
  },

  // Caching settings
  CACHING: {
    enabled: true,
    minTokens: 64000,
    reuseThreshold: 0.8 // 80% similarity
  },

  // Batch processing
  BATCH: {
    enabled: true,
    maxConcurrency: 3,
    delayBetweenRequests: 100 // ms
  }
};

/**
 * Speed optimization settings
 */
export const SPEED_OPTIMIZATION = {
  // Timeouts
  DEFAULT_TIMEOUT: 300000,    // 5 minutes
  QUICK_TIMEOUT: 30000,       // 30 seconds
  STREAMING_TIMEOUT: 600000,  // 10 minutes

  // Concurrency
  MAX_CONCURRENT_REQUESTS: 5,
  QUEUE_SIZE: 20,

  // Streaming settings
  STREAMING: {
    enabled: true,
    bufferSize: 1024,
    minChunks: 10
  },

  // Preload settings
  PRELOAD: {
    enabled: true,
    warmupOnInit: true,
    models: ['moonshot-v1-8k', 'moonshot-v1-32k']
  }
};

/**
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  model: MODEL_ALIASES.DEFAULT,
  temperature: 0.7,
  maxTokens: 8192,
  timeout: SPEED_OPTIMIZATION.DEFAULT_TIMEOUT,
  maxRetries: 3,
  retryDelay: 1000,
  maxConcurrentRequests: SPEED_OPTIMIZATION.MAX_CONCURRENT_REQUESTS,
  
  features: {
    longContext: FEATURES.LONG_CONTEXT.enabled,
    thinkingMode: FEATURES.THINKING_MODE.enabled,
    multimodal: FEATURES.MULTIMODAL.enabled,
    chineseOptimization: FEATURES.CHINESE_OPTIMIZATION.enabled,
    streaming: FEATURES.STREAMING.enabled,
    contextCaching: FEATURES.CONTEXT_CACHING.enabled
  },

  costOptimization: {
    enabled: true,
    autoSelectModel: COST_OPTIMIZATION.AUTO_SELECT.enabled,
    strategy: COST_OPTIMIZATION.AUTO_SELECT.strategy,
    warningThreshold: COST_OPTIMIZATION.WARNING_THRESHOLD
  },

  speedOptimization: {
    enabled: true,
    streaming: SPEED_OPTIMIZATION.STREAMING.enabled,
    preload: SPEED_OPTIMIZATION.PRELOAD.enabled
  }
};

/**
 * Configuration presets for different use cases
 */
export const PRESETS = {
  // Fast responses
  speed: {
    model: MODEL_ALIASES.FAST,
    temperature: 0.7,
    maxTokens: 4096,
    timeout: SPEED_OPTIMIZATION.QUICK_TIMEOUT,
    features: {
      ...DEFAULT_CONFIG.features,
      longContext: false
    }
  },

  // Cost-efficient
  economical: {
    model: MODEL_ALIASES.FAST,
    temperature: 0.5,
    maxTokens: 2048,
    features: {
      ...DEFAULT_CONFIG.features,
      thinkingMode: false,
      contextCaching: true
    },
    costOptimization: {
      ...DEFAULT_CONFIG.costOptimization,
      autoSelectModel: true,
      strategy: 'cost'
    }
  },

  // High quality
  quality: {
    model: MODEL_ALIASES.LARGE,
    temperature: 0.3,
    maxTokens: 8192,
    features: {
      ...DEFAULT_CONFIG.features,
      thinkingMode: true,
      longContext: true
    }
  },

  // Maximum capability
  maximum: {
    model: MODEL_ALIASES.MAX,
    temperature: 0.3,
    maxTokens: 16384,
    timeout: 600000,
    features: {
      longContext: true,
      thinkingMode: true,
      multimodal: true,
      chineseOptimization: true,
      streaming: true,
      contextCaching: true
    }
  },

  // Coding tasks
  coding: {
    model: MODEL_ALIASES.LARGE,
    temperature: 0.3,
    maxTokens: 8192,
    features: {
      ...DEFAULT_CONFIG.features,
      thinkingMode: true,
      chineseOptimization: true
    }
  },

  // Vision tasks
  vision: {
    model: MODEL_ALIASES.VISION,
    temperature: 0.3,
    maxTokens: 4096,
    features: {
      ...DEFAULT_CONFIG.features,
      multimodal: true
    }
  },

  // Long context analysis
  analysis: {
    model: MODEL_ALIASES.MAX,
    temperature: 0.2,
    maxTokens: 16384,
    timeout: 600000,
    features: {
      longContext: true,
      thinkingMode: true,
      contextCaching: true
    }
  }
};

/**
 * Select optimal model based on context size and requirements
 * @param {number} estimatedTokens - Estimated token count
 * @param {Object} options - Selection options
 * @param {string} [options.strategy] - Selection strategy ('cost', 'speed', 'quality', 'balanced')
 * @param {boolean} [options.requireVision] - Whether vision capability is needed
 * @returns {string} Selected model ID
 */
export function selectModel(estimatedTokens, options = {}) {
  const strategy = options.strategy || 'balanced';

  // Vision tasks require vision model
  if (options.requireVision) {
    return KIMI_MODELS['moonshot-v1-vision'].id;
  }

  // Select based on context size
  let candidates = [];

  if (estimatedTokens <= CONTEXT_THRESHOLDS.TINY) {
    candidates = ['moonshot-v1-8k', 'moonshot-v1-32k'];
  } else if (estimatedTokens <= CONTEXT_THRESHOLDS.SMALL) {
    candidates = ['moonshot-v1-8k', 'moonshot-v1-32k'];
  } else if (estimatedTokens <= CONTEXT_THRESHOLDS.MEDIUM) {
    candidates = ['moonshot-v1-32k', 'moonshot-v1-128k'];
  } else if (estimatedTokens <= CONTEXT_THRESHOLDS.LARGE) {
    candidates = ['moonshot-v1-128k'];
  } else {
    candidates = ['moonshot-v1-256k'];
  }

  // Apply strategy (cost strategy uses context size as proxy since billing is subscription-based)
  const modelScores = candidates.map(modelId => {
    const model = KIMI_MODELS[modelId];
    let score = 0;

    switch (strategy) {
      case 'cost':
        // Prefer smaller context models as a proxy for efficiency
        score = -model.contextWindow;
        break;
      case 'speed':
        score = model.speed === 'fastest' ? 3 : model.speed === 'fast' ? 2 : 1;
        break;
      case 'quality':
        score = model.contextWindow;
        break;
      case 'balanced':
      default:
        // Balance efficiency and speed
        const speedScore = model.speed === 'fastest' ? 3 : model.speed === 'fast' ? 2 : 1;
        score = speedScore;
        break;
    }

    return { modelId, score };
  });

  modelScores.sort((a, b) => b.score - a.score);
  return modelScores[0].modelId;
}

/**
 * Estimate token usage for a request (billing handled by subscription)
 * @param {string} model - Model ID
 * @param {number} inputTokens - Input token count
 * @param {number} outputTokens - Output token count
 * @param {number} [imageCount] - Number of images (for vision model)
 * @returns {Object} Token usage breakdown
 */
export function estimateUsage(model, inputTokens, outputTokens, imageCount = 0) {
  const modelInfo = KIMI_MODELS[model];

  if (!modelInfo) {
    throw new Error(`Unknown model: ${model}`);
  }

  return {
    inputTokens,
    outputTokens,
    imageCount,
    totalTokens: inputTokens + outputTokens,
    model: modelInfo.id
  };
}

/**
 * Get configuration for a specific use case
 * @param {string} useCase - Use case name
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Configuration object
 */
export function getConfig(useCase = 'default', overrides = {}) {
  const preset = PRESETS[useCase] || PRESETS.speed;
  
  return {
    ...DEFAULT_CONFIG,
    ...preset,
    ...overrides,
    features: {
      ...DEFAULT_CONFIG.features,
      ...preset.features,
      ...overrides.features
    }
  };
}

/**
 * Validate configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // Validate model
  if (config.model && !KIMI_MODELS[config.model] && config.model !== 'auto') {
    errors.push(`Invalid model: ${config.model}`);
  }

  // Validate temperature
  if (config.temperature !== undefined) {
    if (config.temperature < 0 || config.temperature > 2) {
      errors.push('Temperature must be between 0 and 2');
    }
  }

  // Validate maxTokens
  if (config.maxTokens !== undefined) {
    const modelInfo = KIMI_MODELS[config.model];
    if (modelInfo && config.maxTokens > modelInfo.maxOutputTokens) {
      warnings.push(
        `maxTokens (${config.maxTokens}) exceeds model limit (${modelInfo.maxOutputTokens})`
      );
    }
  }

  // Validate timeout
  if (config.timeout !== undefined && config.timeout < 1000) {
    warnings.push('Timeout is very short (< 1 second)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export default {
  KIMI_MODELS,
  MODEL_ALIASES,
  CONTEXT_THRESHOLDS,
  FEATURES,
  COST_OPTIMIZATION,
  SPEED_OPTIMIZATION,
  DEFAULT_CONFIG,
  PRESETS,
  selectModel,
  estimateUsage,
  getConfig,
  validateConfig
};
