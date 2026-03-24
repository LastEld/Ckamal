/**
 * GPT 5.3 Codex Configuration
 * Cost-effective configuration for fast, efficient code tasks
 */

'use strict';

/**
 * Default configuration for GPT 5.3 Codex
 * Optimized for cost-effectiveness and speed
 */
const GPT53_CONFIG = {
  // Model identification
  model: {
    name: 'gpt-5.3-codex',
    version: '5.3',
    provider: 'openai',
    description: 'Cost-effective coding model with 128K context',
  },

  // Context configuration
  context: {
    maxTokens: 128000,
    maxOutputTokens: 16384,
    tokenBuffer: 1000,
    chunkSize: 64000,
    overlapSize: 2000,
  },

  // Cost optimization settings
  cost: {
    // Pricing per 1M tokens (example rates)
    inputPricePer1M: 0.50,
    outputPricePer1M: 1.50,
    cachedInputPricePer1M: 0.25,
    
    // Cost thresholds for auto-selection
    maxInputCost: 0.10,      // Max $0.10 for input
    maxOutputCost: 0.15,     // Max $0.15 for output
    
    // Budget settings
    dailyBudget: 10.00,
    monthlyBudget: 200.00,
    
    // Optimization flags
    useCaching: true,
    useBatching: true,
    compressPrompts: true,
  },

  // Performance settings
  performance: {
    // Response time targets
    targetResponseTime: 2000,    // 2 seconds target
    maxResponseTime: 10000,      // 10 seconds max
    
    // Throughput settings
    maxConcurrentRequests: 10,
    requestTimeout: 30000,
    
    // Streaming settings
    streamingEnabled: true,
    streamingChunkSize: 256,
    
    // Retry settings
    maxRetries: 3,
    retryDelay: 1000,
    retryMultiplier: 2,
  },

  // Task complexity thresholds for auto-selection
  complexity: {
    // Use GPT 5.3 for these task types (faster, cheaper)
    fastTasks: [
      'quick_completion',
      'simple_refactor',
      'code_format',
      'comment_add',
      'variable_rename',
      'simple_generation',
      'unit_test_simple',
      'syntax_check',
      'code_review_simple',
      'documentation_simple',
    ],
    
    // Token thresholds
    smallContextThreshold: 8000,     // < 8K tokens -> 5.3
    mediumContextThreshold: 32000,   // < 32K tokens -> 5.3
    
    // Complexity score thresholds
    complexityThreshold: 0.6,        // < 0.6 complexity -> 5.3
  },

  // API settings
  api: {
    baseURL: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.OPENAI_ORG_ID,
    
    // Request settings
    temperature: 0.2,
    topP: 0.95,
    frequencyPenalty: 0,
    presencePenalty: 0,
    
    // Headers
    headers: {
      'Content-Type': 'application/json',
    },
  },

  // Caching configuration
  cache: {
    enabled: true,
    ttl: 3600,                    // 1 hour default
    maxSize: 1000,                // Max cached responses
    compressionEnabled: true,
    keyPrefix: 'gpt53:',
  },

  // Batch processing settings
  batch: {
    enabled: true,
    maxBatchSize: 10,
    maxWaitTime: 5000,            // 5 seconds
    flushOnExit: true,
  },

  // Capabilities
  capabilities: {
    maxContextTokens: 128000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsJSONMode: true,
    supportsVision: false,        // 5.3 is text-only
    supportsToolUse: true,
    supportsBatching: true,
    supportsCaching: true,
  },

  // Monitoring
  monitoring: {
    enabled: true,
    logLevel: 'info',
    trackTokens: true,
    trackCost: true,
    trackLatency: true,
    trackCacheHitRate: true,
  },
};

/**
 * Task-specific configurations
 */
const TASK_CONFIGS = {
  quickCompletion: {
    maxTokens: 256,
    temperature: 0.1,
    maxContextTokens: 4000,
    timeout: 2000,
  },
  
  standardRefactoring: {
    maxTokens: 2048,
    temperature: 0.2,
    maxContextTokens: 16000,
    timeout: 10000,
  },
  
  codeGeneration: {
    maxTokens: 4096,
    temperature: 0.3,
    maxContextTokens: 32000,
    timeout: 15000,
  },
  
  unitTestGeneration: {
    maxTokens: 2048,
    temperature: 0.2,
    maxContextTokens: 16000,
    timeout: 8000,
  },
  
  simpleAnalysis: {
    maxTokens: 1024,
    temperature: 0.1,
    maxContextTokens: 8000,
    timeout: 5000,
  },
};

/**
 * Get configuration for a specific task
 * @param {string} taskType - Type of task
 * @returns {Object} Task configuration
 */
function getTaskConfig(taskType) {
  return TASK_CONFIGS[taskType] || TASK_CONFIGS.quickCompletion;
}

/**
 * Calculate estimated cost for a request
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {boolean} useCache - Whether to use cached pricing
 * @returns {Object} Cost breakdown
 */
function calculateCost(inputTokens, outputTokens, useCache = false) {
  const inputPrice = useCache 
    ? GPT53_CONFIG.cost.cachedInputPricePer1M 
    : GPT53_CONFIG.cost.inputPricePer1M;
  const outputPrice = GPT53_CONFIG.cost.outputPricePer1M;
  
  const inputCost = (inputTokens / 1000000) * inputPrice;
  const outputCost = (outputTokens / 1000000) * outputPrice;
  const totalCost = inputCost + outputCost;
  
  return {
    inputCost,
    outputCost,
    totalCost,
    inputTokens,
    outputTokens,
    currency: 'USD',
  };
}

/**
 * Estimate if a task should use GPT 5.3 based on complexity
 * @param {Object} task - Task description
 * @returns {boolean} Whether to use GPT 5.3
 */
function shouldUseGPT53(task) {
  // Check task type
  if (GPT53_CONFIG.complexity.fastTasks.includes(task.type)) {
    return true;
  }
  
  // Check context size
  if (task.estimatedTokens && task.estimatedTokens < GPT53_CONFIG.complexity.smallContextThreshold) {
    return true;
  }
  
  // Check complexity score
  if (task.complexityScore && task.complexityScore < GPT53_CONFIG.complexity.complexityThreshold) {
    return true;
  }
  
  return false;
}

/**
 * Create environment-specific configuration
 * @param {string} env - Environment name
 * @returns {Object} Environment configuration
 */
function createEnvConfig(env = 'development') {
  const baseConfig = { ...GPT53_CONFIG };
  
  switch (env) {
    case 'production':
      return {
        ...baseConfig,
        cost: {
          ...baseConfig.cost,
          dailyBudget: 50.00,
          monthlyBudget: 1000.00,
        },
        performance: {
          ...baseConfig.performance,
          maxConcurrentRequests: 20,
        },
      };
      
    case 'testing':
      return {
        ...baseConfig,
        cost: {
          ...baseConfig.cost,
          dailyBudget: 1.00,
          monthlyBudget: 10.00,
        },
        performance: {
          ...baseConfig.performance,
          maxRetries: 1,
          requestTimeout: 5000,
        },
      };
      
    default: // development
      return baseConfig;
  }
}

module.exports = {
  GPT53_CONFIG,
  TASK_CONFIGS,
  getTaskConfig,
  calculateCost,
  shouldUseGPT53,
  createEnvConfig,
};
