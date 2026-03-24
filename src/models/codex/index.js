/**
 * @fileoverview GPT 5.4 Codex Integration Module
 * @module models/codex
 * 
 * Deep native integration with GPT 5.4 Codex providing:
 * - 256K token context window management
 * - Advanced reasoning capabilities
 * - Architecture design
 * - Complex multi-file refactoring
 * - Algorithm optimization
 * - Multimodal analysis (image + code)
 * - Performance and security analysis
 * - Full system design generation
 * 
 * Three integration modes:
 * - App: Desktop application integration
 * - CLI: Command-line interface with batch processing
 * - IDE: VSCode integration with IntelliSense
 * 
 * @example
 * import { createGPT54Client, TaskType, ReasoningMode } from './models/codex/index.js';
 * 
 * // Basic API client
 * const client = createGPT54Client({ apiKey: 'your-api-key' });
 * await client.initialize();
 * 
 * // Advanced reasoning
 * const result = await client.advancedReasoning('Design a caching strategy', {
 *   mode: ReasoningMode.CHAIN_OF_THOUGHT
 * });
 * 
 * // Architecture design
 * const architecture = await client.codeArchitecture({
 *   description: 'Microservices platform',
 *   constraints: ['AWS', 'Kubernetes']
 * });
 * 
 * // Complex refactoring
 * const refactored = await client.complexRefactoring(files, {
 *   goal: 'Improve maintainability'
 * });
 */

// Core client and types
export {
  GPT54Client,
  createGPT54Client,
  GPT54ClientError,
  GPT54AuthError,
  GPT54RateLimitError,
  GPT54ContextError,
  ReasoningMode,
  TaskType,
} from './gpt54-client.js';

// Configuration
export {
  GPT54Config,
  createGPT54Config,
  GPT54_DEFAULTS,
  GPT54_MODELS,
  MODEL_ALIASES,
  REASONING_MODES,
  CONTEXT_THRESHOLDS,
  PRESETS,
  GPT54ConfigError,
  getDefaults,
  getModelInfo,
  estimateCost,
} from './gpt54-config.js';

// App client
export {
  GPT54AppClient,
  createGPT54AppClient,
  GPT54AppError,
} from './gpt54-app.js';

// CLI client
export {
  GPT54CliClient,
  createGPT54CliClient,
  GPT54CliError,
} from './gpt54-cli.js';

// IDE client
export {
  GPT54IDEClient,
  createGPT54IDEClient,
  GPT54IdeError,
  CompletionItemKind,
  DiagnosticSeverity,
} from './gpt54-ide.js';

/**
 * Creates a fully configured GPT 5.4 Codex integration
 * @param {Object} options - Setup options
 * @param {string} [options.apiKey] - OpenAI API key
 * @param {string} [options.mode] - Integration mode ('app', 'cli', 'ide')
 * @param {Object} [options.config] - Configuration options
 * @returns {Promise<Object>} Configured client
 * 
 * @example
 * const integration = await createGPT54Integration({
 *   mode: 'cli',
 *   config: { reasoningEnabled: true }
 * });
 * await integration.initialize();
 */
export async function createGPT54Integration(options = {}) {
  const mode = options.mode || 'client';
  
  switch (mode) {
    case 'app': {
      const { createGPT54AppClient } = await import('./gpt54-app.js');
      const client = createGPT54AppClient(options);
      return {
        client,
        mode: 'app',
        async initialize() {
          await client.initialize();
          return this;
        },
        async close() {
          await client.close();
        },
      };
    }
    
    case 'cli': {
      const { createGPT54CliClient } = await import('./gpt54-cli.js');
      const client = createGPT54CliClient(options);
      return {
        client,
        mode: 'cli',
        async initialize() {
          await client.initialize();
          return this;
        },
        async close() {
          await client.close();
        },
      };
    }
    
    case 'ide': {
      const { createGPT54IDEClient } = await import('./gpt54-ide.js');
      const client = createGPT54IDEClient(options);
      return {
        client,
        mode: 'ide',
        async initialize() {
          await client.initialize();
          return this;
        },
        async close() {
          await client.close();
        },
      };
    }
    
    case 'client':
    default: {
      const { createGPT54Client } = await import('./gpt54-client.js');
      const client = createGPT54Client(options);
      return {
        client,
        mode: 'client',
        async initialize() {
          await client.initialize();
          return this;
        },
        async close() {
          await client.close();
        },
      };
    }
  }
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Module version
 * @constant {string}
 */
export const VERSION = '1.0.0';

/**
 * Module name
 * @constant {string}
 */
export const MODULE_NAME = 'gpt-5.4-codex';

/**
 * Default model ID
 * @constant {string}
 */
export const DEFAULT_MODEL = 'gpt-5.4-codex';

// ============================================================================
// Quick Helpers
// ============================================================================

/**
 * Quick analysis helper - analyze files with minimal setup
 * @param {Array<string>} filePaths - Paths to files to analyze
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis result
 * 
 * @example
 * const result = await quickAnalyze(['src/index.js', 'src/utils.js'], {
 *   goal: 'Review for security issues'
 * });
 */
export async function quickAnalyze(filePaths, options = {}) {
  const { createGPT54Client } = await import('./gpt54-client.js');
  const { glob } = await import('glob');
  
  // Expand globs and load files
  const files = [];
  for (const pattern of filePaths) {
    if (pattern.includes('*')) {
      const matches = await glob(pattern, { absolute: true });
      for (const match of matches) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const content = await fs.readFile(match, 'utf8');
        files.push({ path: match, name: path.basename(match), content });
      }
    } else {
      const fs = await import('fs/promises');
      const path = await import('path');
      const content = await fs.readFile(pattern, 'utf8');
      files.push({ path: pattern, name: path.basename(pattern), content });
    }
  }
  
  const client = createGPT54Client();
  await client.initialize();
  
  try {
    const result = await client.complexRefactoring(files, {
      goal: options.goal || 'Comprehensive analysis',
      ...options,
    });
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Quick reasoning helper
 * @param {string} prompt - Problem to reason about
 * @param {Object} options - Reasoning options
 * @returns {Promise<Object>} Reasoning result
 * 
 * @example
 * const result = await quickReason('Design a caching strategy', {
 *   mode: ReasoningMode.CHAIN_OF_THOUGHT
 * });
 */
export async function quickReason(prompt, options = {}) {
  const { createGPT54Client, ReasoningMode } = await import('./gpt54-client.js');
  
  const client = createGPT54Client();
  await client.initialize();
  
  try {
    const result = await client.advancedReasoning(prompt, {
      mode: options.mode || ReasoningMode.CHAIN_OF_THOUGHT,
      ...options,
    });
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Quick architecture design helper
 * @param {Object} requirements - Architecture requirements
 * @param {Object} options - Design options
 * @returns {Promise<Object>} Architecture design
 * 
 * @example
 * const design = await quickArchitecture({
 *   description: 'E-commerce platform',
 *   constraints: ['AWS', 'microservices']
 * });
 */
export async function quickArchitecture(requirements, options = {}) {
  const { createGPT54Client } = await import('./gpt54-client.js');
  
  const client = createGPT54Client();
  await client.initialize();
  
  try {
    const result = await client.codeArchitecture(requirements, options);
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Quick refactoring helper
 * @param {Array<{path: string, content: string}>} files - Files to refactor
 * @param {Object} options - Refactoring options
 * @returns {Promise<Object>} Refactoring result
 * 
 * @example
 * const result = await quickRefactor([
 *   { path: 'src/index.js', content: '...' }
 * ], { goal: 'Modernize to ES6+' });
 */
export async function quickRefactor(files, options = {}) {
  const { createGPT54Client } = await import('./gpt54-client.js');
  
  const client = createGPT54Client();
  await client.initialize();
  
  try {
    const result = await client.complexRefactoring(files, options);
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Quick system design helper
 * @param {Object} spec - System specification
 * @param {Object} options - Design options
 * @returns {Promise<Object>} System design
 * 
 * @example
 * const design = await quickSystemDesign({
 *   name: 'Video Streaming Service',
 *   description: 'Netflix-like platform',
 *   requirements: ['4K streaming', 'Global CDN']
 * });
 */
export async function quickSystemDesign(spec, options = {}) {
  const { createGPT54Client } = await import('./gpt54-client.js');
  
  const client = createGPT54Client();
  await client.initialize();
  
  try {
    const result = await client.systemDesign(spec, options);
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Quick security audit helper
 * @param {string} code - Code to audit
 * @param {Object} options - Audit options
 * @returns {Promise<Object>} Security audit
 * 
 * @example
 * const audit = await quickSecurityAudit(code, { deepScan: true });
 */
export async function quickSecurityAudit(code, options = {}) {
  const { createGPT54Client } = await import('./gpt54-client.js');
  
  const client = createGPT54Client();
  await client.initialize();
  
  try {
    const result = await client.securityAnalysis(code, {
      deepScan: options.deepScan ?? true,
      ...options,
    });
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Quick performance analysis helper
 * @param {string} code - Code to analyze
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Performance analysis
 * 
 * @example
 * const analysis = await quickPerformanceAnalysis(code, { focus: 'memory' });
 */
export async function quickPerformanceAnalysis(code, options = {}) {
  const { createGPT54Client } = await import('./gpt54-client.js');
  
  const client = createGPT54Client();
  await client.initialize();
  
  try {
    const result = await client.performanceAnalysis(code, options);
    return result;
  } finally {
    await client.close();
  }
}

/**
 * Quick multimodal analysis helper
 * @param {string} imagePath - Path to image
 * @param {string} code - Code context
 * @param {string} prompt - Analysis prompt
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis result
 * 
 * @example
 * const result = await quickMultimodal('ui.png', code, 'Analyze this UI implementation');
 */
export async function quickMultimodal(imagePath, code, prompt, options = {}) {
  const { createGPT54Client } = await import('./gpt54-client.js');
  
  const client = createGPT54Client();
  await client.initialize();
  
  try {
    const result = await client.multimodalAnalysis(imagePath, code, prompt, options);
    return result;
  } finally {
    await client.close();
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Version
  VERSION,
  MODULE_NAME,
  DEFAULT_MODEL,
  
  // Factory functions
  createGPT54Integration,
  
  // Classes (lazy loaded)
  get GPT54Client() { return import('./gpt54-client.js').then(m => m.GPT54Client); },
  get GPT54Config() { return import('./gpt54-config.js').then(m => m.GPT54Config); },
  get GPT54AppClient() { return import('./gpt54-app.js').then(m => m.GPT54AppClient); },
  get GPT54CliClient() { return import('./gpt54-cli.js').then(m => m.GPT54CliClient); },
  get GPT54IDEClient() { return import('./gpt54-ide.js').then(m => m.GPT54IDEClient); },
  
  // Enums (lazy loaded)
  get ReasoningMode() { return import('./gpt54-client.js').then(m => m.ReasoningMode); },
  get TaskType() { return import('./gpt54-client.js').then(m => m.TaskType); },
  get CompletionItemKind() { return import('./gpt54-ide.js').then(m => m.CompletionItemKind); },
  get DiagnosticSeverity() { return import('./gpt54-ide.js').then(m => m.DiagnosticSeverity); },
  
  // Quick helpers
  analyze: quickAnalyze,
  reason: quickReason,
  architecture: quickArchitecture,
  refactor: quickRefactor,
  systemDesign: quickSystemDesign,
  securityAudit: quickSecurityAudit,
  performanceAnalysis: quickPerformanceAnalysis,
  multimodal: quickMultimodal,
};
