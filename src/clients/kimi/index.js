/**
 * Kimi 2.5 Client Integration
 * Exports all Kimi-specific client implementations with enhanced features
 * 
 * Features:
 * - 256K context window support
 * - Thinking mode for deep reasoning
 * - Multimodal capabilities (text + images)
 * - Chinese language optimization
 * - Long context analysis
 * - Batch code review
 * - Multi-file refactoring
 * - Documentation generation
 */

import { KimiCliClient } from './cli.js';

// Main client exports
export { KimiCliClient } from './cli.js';
export { KimiVSCodeClient } from './vscode.js';

// Feature flags and configuration helpers
export const KIMI_FEATURES = {
  LONG_CONTEXT: 'long_context',
  THINKING_MODE: 'thinking_mode',
  MULTIMODAL: 'multimodal',
  CHINESE_OPTIMIZATION: 'chinese_optimization',
  BATCH_REVIEW: 'batch_code_review',
  MULTI_FILE_REFACTOR: 'multi_file_refactoring',
  DOC_GENERATION: 'documentation_generation'
};

// Model recommendations based on use case
export const KIMI_MODELS = {
  // Standard chat models
  SMALL: 'moonshot-v1-8k',      // 8K context, fastest
  MEDIUM: 'moonshot-v1-32k',    // 32K context, balanced
  LARGE: 'moonshot-v1-128k',    // 128K context, comprehensive
  MAX: 'moonshot-v1-256k',      // 256K context, maximum
  
  // Special purpose
  VISION: 'moonshot-v1-vision', // Image understanding
  
  // Aliases for common use cases
  DEFAULT: 'moonshot-v1-128k',
  LONG_CONTEXT: 'moonshot-v1-256k',
  MULTIMODAL: 'moonshot-v1-vision'
};

// Analysis types for long context
export const ANALYSIS_TYPES = {
  COMPREHENSIVE: 'comprehensive',
  REFACTOR: 'refactor',
  REVIEW: 'review',
  DOCUMENTATION: 'documentation',
  DEPENDENCIES: 'dependencies',
  CUSTOM: 'custom'
};

// Chinese optimization types
export const CHINESE_OPT_TYPES = {
  GENERAL: 'general',
  TEXT_PROCESSING: 'text_processing',
  SEARCH: 'search',
  DISPLAY: 'display',
  STORAGE: 'storage',
  CUSTOM: 'custom'
};

// Documentation types
export const DOC_TYPES = {
  API: 'api',
  README: 'readme',
  ARCHITECTURE: 'architecture',
  CUSTOM: 'custom'
};

/**
 * Create a Kimi CLI client with recommended settings
 * @param {Object} config - Configuration options
 * @param {string} useCase - Use case: 'default', 'long_context', 'multimodal', 'coding'
 * @returns {KimiCliClient}
 */
export function createKimiClient(config = {}, useCase = 'default') {
  const useCaseConfigs = {
    default: {
      model: KIMI_MODELS.DEFAULT,
      features: {
        thinkingMode: true,
        multimodal: false,
        longContext: false,
        chineseOptimization: true
      }
    },
    
    long_context: {
      model: KIMI_MODELS.LONG,
      features: {
        thinkingMode: true,
        multimodal: false,
        longContext: true,
        chineseOptimization: true
      },
      preferApi: false
    },
    
    multimodal: {
      model: KIMI_MODELS.VISION,
      features: {
        thinkingMode: true,
        multimodal: true,
        longContext: false,
        chineseOptimization: true
      }
    },
    
    coding: {
      model: KIMI_MODELS.LARGE,
      features: {
        thinkingMode: true,
        multimodal: true,
        longContext: true,
        chineseOptimization: true
      },
      preferApi: false
    }
  };

  const useCaseConfig = useCaseConfigs[useCase] || useCaseConfigs.default;
  
  return new KimiCliClient({
    ...useCaseConfig,
    ...config
  });
}

/**
 * Quick analysis helper for long context tasks
 * @param {Array} files - Files to analyze
 * @param {string} type - Analysis type
 * @param {Object} options - Additional options
 */
export async function quickAnalyze(files, type = ANALYSIS_TYPES.COMPREHENSIVE, options = {}) {
  const client = createKimiClient(options, 'long_context');
  await client.initialize();
  
  try {
    const result = await client.longContextAnalyze(files, {
      analysisType: type,
      ...options
    });
    return result;
  } finally {
    await client.disconnect();
  }
}

/**
 * Quick thinking mode helper
 * @param {string} prompt - Problem to think about
 * @param {Object} options - Thinking options
 */
export async function quickThink(prompt, options = {}) {
  const client = createKimiClient(options, 'default');
  await client.initialize();
  
  try {
    const result = await client.thinkingMode(prompt, options);
    return result;
  } finally {
    await client.disconnect();
  }
}

/**
 * Quick multimodal analysis helper
 * @param {string} imagePath - Path to image
 * @param {string} prompt - Analysis prompt
 * @param {Object} options - Analysis options
 */
export async function quickAnalyzeImage(imagePath, prompt, options = {}) {
  const client = createKimiClient(options, 'multimodal');
  await client.initialize();
  
  try {
    const result = await client.multimodalAnalyze(imagePath, prompt, options);
    return result;
  } finally {
    await client.disconnect();
  }
}

/**
 * Quick Chinese optimization helper
 * @param {string} code - Code to optimize
 * @param {string} type - Optimization type
 * @param {Object} options - Optimization options
 */
export async function quickOptimizeChinese(code, type = CHINESE_OPT_TYPES.GENERAL, options = {}) {
  const client = createKimiClient(options, 'coding');
  await client.initialize();
  
  try {
    const result = await client.chineseOptimization(code, {
      type,
      ...options
    });
    return result;
  } finally {
    await client.disconnect();
  }
}

// Default export with all clients and helpers
export default {
  CliClient: (await import('./cli.js')).KimiCliClient,
  VSCodeClient: (await import('./vscode.js')).KimiVSCodeClient,
  
  // Constants
  FEATURES: KIMI_FEATURES,
  MODELS: KIMI_MODELS,
  ANALYSIS_TYPES,
  CHINESE_OPT_TYPES,
  DOC_TYPES,
  
  // Factory functions
  createClient: createKimiClient,
  
  // Quick helpers
  analyze: quickAnalyze,
  think: quickThink,
  analyzeImage: quickAnalyzeImage,
  optimizeChinese: quickOptimizeChinese
};
