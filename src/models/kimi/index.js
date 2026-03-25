/**
 * Kimi Models Module
 * Native Kimi Code integration with 256K context and multimodal support
 * 
 * @module models/kimi
 * 
 * Features:
 * - Native Moonshot API integration
 * - 256K context window management
 * - High-speed processing
 * - Multimodal capabilities (images)
 * - CLI and IDE support
 * - Chinese language optimization
 * - Batch processing
 * - Cross-file refactoring
 * 
 * @example
 * import { KimiClient, createCliClient, createIdeClient } from './models/kimi/index.js';
 * 
 * // Basic API client
 * const client = new KimiClient({ apiKey: 'your-key' });
 * await client.initialize();
 * 
 * // CLI client with interactive mode
 * const cli = new KimiCliClient();
 * await cli.initialize();
 * await cli.startInteractiveMode();
 * 
 * // IDE client for VS Code integration
 * const ide = new KimiIDEClient({ port: 18123 });
 * await ide.initialize();
 * const completion = await ide.inlineCompletion(document, position);
 */

// Core client
export { KimiClient, KimiError, KimiAuthError, KimiRateLimitError, KimiContextError } from './kimi-client.js';

// Configuration
export {
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
} from './kimi-config.js';

// Constants
export const VERSION = '1.0.0';

// Model variants for easy access
export const MODELS = {
  SMALL: 'moonshot-v1-8k',      // 8K context, fastest
  MEDIUM: 'moonshot-v1-32k',    // 32K context, balanced
  LARGE: 'moonshot-v1-128k',    // 128K context, comprehensive
  MAX: 'moonshot-v1-256k',      // 256K context, maximum capability
  VISION: 'moonshot-v1-vision'  // Image understanding
};

// Analysis types
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
 * Create a Kimi client with recommended settings for a use case
 * @param {string} useCase - Use case: 'speed', 'economical', 'quality', 'maximum', 'coding', 'vision', 'analysis'
 * @param {Object} overrides - Configuration overrides
 * @returns {KimiClient} Configured client
 * 
 * @example
 * const client = createClient('coding');
 * await client.initialize();
 */
export async function createClient(useCase = 'default', overrides = {}) {
  const { getConfig } = await import('./kimi-config.js');
  const { KimiClient } = await import('./kimi-client.js');
  
  const config = getConfig(useCase, overrides);
  return new KimiClient(config);
}

/**
 * Create a Kimi CLI client
 * @param {Object} options - CLI options
 * @returns {KimiCliClient} CLI client
 * 
 * @example
 * const cli = createCliClient({ workingDir: '/path/to/project' });
 * await cli.initialize();
 * await cli.analyzeProject();
 */
export async function createCliClient(options = {}) {
  const { KimiCliClient } = await import('./kimi-cli.js');
  return new KimiCliClient(options);
}

/**
 * Create a Kimi IDE client
 * @param {Object} options - IDE options
 * @returns {KimiIDEClient} IDE client
 * 
 * @example
 * const ide = createIdeClient({ port: 18123, workspaceRoot: '/project' });
 * await ide.initialize();
 * const completion = await ide.inlineCompletion(doc, pos);
 */
export async function createIdeClient(options = {}) {
  const { KimiIDEClient } = await import('./kimi-ide.js');
  return new KimiIDEClient(options);
}

/**
 * Quick analysis helper - analyze files with minimal setup
 * @param {Array<string>} filePaths - Paths to files to analyze
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis result
 * 
 * @example
 * const result = await quickAnalyze(['src/index.js', 'src/utils.js'], {
 *   analysisType: 'review'
 * });
 */
export async function quickAnalyze(filePaths, options = {}) {
  const { KimiClient } = await import('./kimi-client.js');
  
  const client = new KimiClient({
    model: MODELS.MAX,
    features: { longContext: true }
  });
  
  await client.initialize();
  
  try {
    const result = await client.longContextAnalyze(
      filePaths.map(path => ({ path })),
      {
        analysisType: options.analysisType || ANALYSIS_TYPES.COMPREHENSIVE,
        ...options
      }
    );
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Quick thinking mode helper
 * @param {string} prompt - Problem to think about
 * @param {Object} options - Thinking options
 * @returns {Promise<Object>} Thinking result
 * 
 * @example
 * const result = await quickThink('How should I design this API?', {
 *   context: 'Building a REST API for...'
 * });
 */
export async function quickThink(prompt, options = {}) {
  const { KimiClient } = await import('./kimi-client.js');
  
  const client = new KimiClient({
    features: { thinkingMode: true }
  });
  
  await client.initialize();
  
  try {
    const result = await client.thinkingMode(prompt, options);
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Quick image analysis helper
 * @param {string} imagePath - Path to image
 * @param {string} prompt - Analysis prompt
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis result
 * 
 * @example
 * const result = await quickAnalyzeImage('screenshot.png', 'Describe the UI elements');
 */
export async function quickAnalyzeImage(imagePath, prompt, options = {}) {
  const { KimiClient } = await import('./kimi-client.js');
  
  const client = new KimiClient({
    model: MODELS.VISION,
    features: { multimodal: true }
  });
  
  await client.initialize();
  
  try {
    const result = await client.multimodalAnalyze(imagePath, prompt, options);
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Quick Chinese optimization helper
 * @param {string} code - Code to optimize
 * @param {Object} options - Optimization options
 * @returns {Promise<Object>} Optimization result
 * 
 * @example
 * const result = await quickOptimizeChinese(code, { type: 'text_processing' });
 */
export async function quickOptimizeChinese(code, options = {}) {
  const { KimiClient } = await import('./kimi-client.js');
  
  const client = new KimiClient({
    features: { chineseOptimization: true }
  });
  
  await client.initialize();
  
  try {
    const result = await client.chineseOptimization(code, options);
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Batch code review helper
 * @param {Array<string>} filePaths - Files to review
 * @param {Object} options - Review options
 * @returns {Promise<Object>} Review results
 * 
 * @example
 * const result = await batchReview(['src/**\\/*.js'], { focus: 'security' });
 */
export async function batchReview(filePaths, options = {}) {
  const { KimiClient } = await import('./kimi-client.js');
  const { glob } = await import('glob');
  
  // Expand globs
  const allFiles = [];
  for (const pattern of filePaths) {
    if (pattern.includes('*')) {
      const files = await glob(pattern, { absolute: true });
      allFiles.push(...files);
    } else {
      allFiles.push(pattern);
    }
  }
  
  const client = new KimiClient({
    model: MODELS.MAX,
    features: { longContext: true }
  });
  
  await client.initialize();
  
  try {
    const result = await client.batchCodeReview(allFiles, options);
    return result;
  } finally {
    await client.close();
  }
}

// Default export with all exports
export default {
  // Version
  VERSION,
  
  // Constants
  MODELS,
  ANALYSIS_TYPES,
  CHINESE_OPT_TYPES,
  DOC_TYPES,
  
  // Classes (lazy loaded)
  get KimiClient() { return import('./kimi-client.js').then(m => m.KimiClient); },
  get KimiCliClient() { return import('./kimi-cli.js').then(m => m.KimiCliClient); },
  get KimiIDEClient() { return import('./kimi-ide.js').then(m => m.KimiIDEClient); },
  
  // Factory functions
  createClient,
  createCliClient,
  createIdeClient,
  
  // Quick helpers
  analyze: quickAnalyze,
  think: quickThink,
  analyzeImage: quickAnalyzeImage,
  optimizeChinese: quickOptimizeChinese,
  review: batchReview
};
