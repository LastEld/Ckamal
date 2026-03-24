/**
 * @fileoverview GPT 5.4 Codex CLI Client
 * @module models/codex/gpt54-cli
 * 
 * Command-line interface for GPT 5.4 Codex:
 * - Interactive REPL mode
 * - Batch processing
 * - Project-wide analysis
 * - Architecture generation
 * - File operations
 * - Streaming output
 * 
 * Commands:
 * - chat: Interactive chat mode
 * - analyze: Analyze files or directories
 * - refactor: Multi-file refactoring
 * - architect: Generate architecture
 * - design: System design
 * - review: Code review
 * - security: Security audit
 * - performance: Performance analysis
 * - batch: Batch processing
 */

import { EventEmitter } from 'events';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { extname, basename, join, resolve, relative } from 'path';
import { createInterface } from 'readline';
import globPkg from 'glob';
import { GPT54Client, TaskType, ReasoningMode } from './gpt54-client.js';
import { GPT54Config, PRESETS } from './gpt54-config.js';

const { glob } = globPkg;

/**
 * CLI Error types
 */
export class GPT54CliError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'GPT54CliError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * GPT 5.4 Codex CLI Client
 * Provides command-line interface capabilities
 * @extends EventEmitter
 */
export class GPT54CliClient extends EventEmitter {
  #client;
  #config;
  #options;
  #session;
  #rl;
  
  /**
   * Creates a GPT54CliClient instance
   * @param {Object} options - CLI options
   * @param {string} [options.apiKey] - OpenAI API key
   * @param {Object} [options.config] - Configuration
   * @param {string} [options.workingDir] - Working directory
   * @param {boolean} [options.interactive] - Interactive mode
   * @param {boolean} [options.verbose] - Verbose output
   */
  constructor(options = {}) {
    super();
    
    this.#options = {
      workingDir: options.workingDir || process.cwd(),
      interactive: options.interactive ?? false,
      verbose: options.verbose ?? false,
      outputFormat: options.outputFormat || 'markdown',
      ...options,
    };
    
    this.#config = new GPT54Config(options.config || {});
    this.#client = new GPT54Client({
      apiKey: options.apiKey,
      config: this.#config,
    });
    
    this.#session = null;
    this.#rl = null;
  }
  
  // ==================== Initialization ====================
  
  /**
   * Initializes the CLI client
   * @returns {Promise<void>}
   */
  async initialize() {
    this.emit('initializing');
    
    try {
      await this.#client.initialize();
      
      this.#session = {
        id: `cli_${Date.now()}`,
        messages: [],
        files: [],
        createdAt: Date.now(),
      };
      
      if (this.#options.verbose) {
        console.log(`GPT 5.4 Codex CLI initialized`);
        console.log(`Working directory: ${this.#options.workingDir}`);
        console.log(`Model: ${this.#config.getConfig().modelId}`);
      }
      
      this.emit('ready');
      
    } catch (error) {
      this.emit('error', error);
      throw new GPT54CliError(
        `Failed to initialize: ${error.message}`,
        'INIT_ERROR',
        { cause: error }
      );
    }
  }
  
  // ==================== Interactive Mode ====================
  
  /**
   * Starts interactive REPL mode
   * @param {Object} options - REPL options
   * @returns {Promise<void>}
   */
  async startInteractiveMode(options = {}) {
    this.#rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: options.prompt || '\x1b[36mcodex>\x1b[0m ',
    });
    
    console.log('\n🚀 GPT 5.4 Codex Interactive Mode\n');
    console.log('Type \x1b[33m/help\x1b[0m for commands, \x1b[33m/exit\x1b[0m to quit\n');
    
    this.#rl.prompt();
    
    return new Promise((resolve) => {
      this.#rl.on('line', async (input) => {
        const trimmed = input.trim();
        
        if (!trimmed) {
          this.#rl.prompt();
          return;
        }
        
        // Handle commands
        if (trimmed.startsWith('/')) {
          const handled = await this.#handleCommand(trimmed);
          if (handled === 'exit') {
            resolve();
            return;
          }
        } else {
          // Regular message
          await this.#handleMessage(trimmed);
        }
        
        this.#rl.prompt();
      });
      
      this.#rl.on('close', () => {
        console.log('\n\n👋 Goodbye!\n');
        resolve();
      });
    });
  }
  
  /**
   * Handles CLI commands
   * @private
   * @param {string} command - Command input
   * @returns {Promise<string|null>} Command result
   */
  async #handleCommand(command) {
    const parts = command.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    switch (cmd) {
      case 'exit':
      case 'quit':
      case 'q':
        this.#rl.close();
        return 'exit';
        
      case 'help':
      case 'h':
        this.#printHelp();
        break;
        
      case 'clear':
        console.clear();
        break;
        
      case 'model':
        console.log(`Current model: ${this.#config.getConfig().modelId}`);
        break;
        
      case 'stats':
        this.#printStats();
        break;
        
      case 'reasoning':
        await this.#toggleReasoning(args);
        break;
        
      case 'file':
      case 'files':
        await this.#handleFileCommand(args);
        break;
        
      case 'analyze':
        await this.#handleAnalyzeCommand(args);
        break;
        
      case 'refactor':
        await this.#handleRefactorCommand(args);
        break;
        
      case 'checkpoint':
        await this.#handleCheckpointCommand(args);
        break;
        
      default:
        console.log(`\x1b[31mUnknown command: /${cmd}\x1b[0m`);
        console.log('Type /help for available commands');
    }
    
    return null;
  }
  
  /**
   * Prints help information
   * @private
   */
  #printHelp() {
    console.log('\n\x1b[1mAvailable Commands:\x1b[0m\n');
    console.log('  /help, /h          Show this help');
    console.log('  /exit, /quit, /q   Exit interactive mode');
    console.log('  /clear             Clear screen');
    console.log('  /model             Show current model');
    console.log('  /stats             Show session statistics');
    console.log('  /reasoning [on|off] Toggle reasoning mode');
    console.log('  /file add <path>   Add file to context');
    console.log('  /file list         List files in context');
    console.log('  /file clear        Clear file context');
    console.log('  /analyze <path>    Analyze files or directory');
    console.log('  /refactor <path>   Refactor files');
    console.log('  /checkpoint        Create checkpoint');
    console.log('\nJust type your message to chat with Codex.\n');
  }
  
  /**
   * Prints session statistics
   * @private
   */
  #printStats() {
    const stats = this.#client.getMetrics();
    const costStats = this.#client.getCostStats();
    
    console.log('\n\x1b[1mSession Statistics:\x1b[0m\n');
    console.log(`  Total requests: ${stats.totalRequests}`);
    console.log(`  Total tokens: ${stats.totalTokens.toLocaleString()}`);
    console.log(`  Reasoning tokens: ${stats.reasoningTokens.toLocaleString()}`);
    console.log(`  Average latency: ${Math.round(stats.averageLatency)}ms`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  Total cost: $${costStats.totalCost.toFixed(4)}`);
    console.log('');
  }
  
  /**
   * Toggles reasoning mode
   * @private
   */
  async #toggleReasoning(args) {
    const enabled = args[0] === 'on' || args[0] === 'true';
    this.#config.updateConfig({ reasoningEnabled: enabled });
    console.log(`Reasoning mode: ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Handles file commands
   * @private
   */
  async #handleFileCommand(args) {
    const subcmd = args[0];
    
    switch (subcmd) {
      case 'add':
        const path = args[1];
        if (!path) {
          console.log('\x1b[31mUsage: /file add <path>\x1b[0m');
          return;
        }
        await this.#addFileToContext(path);
        break;
        
      case 'list':
        if (this.#session.files.length === 0) {
          console.log('No files in context');
        } else {
          console.log('\nFiles in context:');
          for (const file of this.#session.files) {
            console.log(`  - ${file.name}`);
          }
        }
        break;
        
      case 'clear':
        this.#session.files = [];
        console.log('File context cleared');
        break;
        
      default:
        console.log('\x1b[31mUsage: /file [add|list|clear]\x1b[0m');
    }
  }
  
  /**
   * Adds file to context
   * @private
   */
  async #addFileToContext(filePath) {
    try {
      const fullPath = resolve(this.#options.workingDir, filePath);
      const content = await fs.readFile(fullPath, 'utf8');
      const name = basename(fullPath);
      
      this.#session.files.push({ path: fullPath, name, content });
      console.log(`\x1b[32mAdded file: ${name}\x1b[0m`);
      
    } catch (error) {
      console.log(`\x1b[31mError reading file: ${error.message}\x1b[0m`);
    }
  }
  
  /**
   * Handles analyze command
   * @private
   */
  async #handleAnalyzeCommand(args) {
    const path = args[0];
    if (!path) {
      console.log('\x1b[31mUsage: /analyze <path>\x1b[0m');
      return;
    }
    
    console.log('\nAnalyzing...\n');
    const result = await this.analyze(path);
    console.log('\n' + result.content + '\n');
  }
  
  /**
   * Handles refactor command
   * @private
   */
  async #handleRefactorCommand(args) {
    const path = args[0];
    if (!path) {
      console.log('\x1b[31mUsage: /refactor <path>\x1b[0m');
      return;
    }
    
    console.log('\nRefactoring...\n');
    const result = await this.refactor(path);
    console.log('\n' + result.content + '\n');
  }
  
  /**
   * Handles checkpoint command
   * @private
   */
  async #handleCheckpointCommand(args) {
    const label = args.join(' ') || `Checkpoint ${Date.now()}`;
    const checkpoint = this.#client.createCheckpoint(label);
    console.log(`\x1b[32mCheckpoint created: ${checkpoint.id}\x1b[0m`);
  }
  
  /**
   * Handles regular messages
   * @private
   */
  async #handleMessage(message) {
    try {
      console.log('\n\x1b[90mThinking...\x1b[0m\n');
      
      const response = await this.#client.send(message, {
        messages: this.#session.messages,
        reasoning: this.#config.getConfig().reasoningEnabled,
      });
      
      // Add to session
      this.#session.messages.push(
        { role: 'user', content: message },
        { role: 'assistant', content: response.content }
      );
      
      // Display response
      console.log('\x1b[32m' + response.content + '\x1b[0m\n');
      
      // Show reasoning if available
      if (response.reasoning) {
        console.log('\x1b[90mReasoning:\x1b[0m');
        console.log('\x1b[90m' + response.reasoning + '\x1b[0m\n');
      }
      
    } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m\n`);
    }
  }
  
  // ==================== Batch Processing ====================
  
  /**
   * Processes files in batch
   * @param {Array<string>} patterns - File patterns
   * @param {Function} processor - Processing function
   * @param {Object} options - Batch options
   * @returns {Promise<Array>} Processing results
   */
  async batchProcess(patterns, processor, options = {}) {
    // Expand patterns
    const files = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.#options.workingDir,
        absolute: true,
      });
      files.push(...matches);
    }
    
    if (files.length === 0) {
      throw new GPT54CliError('No files found matching patterns', 'NO_FILES');
    }
    
    const results = [];
    const concurrency = options.concurrency || 3;
    
    console.log(`Processing ${files.length} files...\n`);
    
    // Process in batches
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (file) => {
        try {
          const content = await fs.readFile(file, 'utf8');
          const result = await processor(file, content, this.#client);
          return { file, success: true, result };
        } catch (error) {
          return { file, success: false, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      if (this.#options.verbose) {
        console.log(`Processed ${Math.min(i + concurrency, files.length)}/${files.length}`);
      }
      
      // Delay between batches
      if (options.delay && i + concurrency < files.length) {
        await this.#delay(options.delay);
      }
    }
    
    return results;
  }
  
  /**
   * Batch code review
   * @param {Array<string>} patterns - File patterns
   * @param {Object} options - Review options
   * @returns {Promise<Object>} Review results
   */
  async batchReview(patterns, options = {}) {
    const files = await this.#loadFilesFromPatterns(patterns);
    
    if (files.length === 0) {
      throw new GPT54CliError('No files to review', 'NO_FILES');
    }
    
    console.log(`Reviewing ${files.length} files...\n`);
    
    return this.#client.execute({
      type: TaskType.CODE_REVIEW,
      description: options.description || `Review ${files.length} files`,
      files,
      instructions: options.instructions || 'Provide comprehensive code review',
    }, {
      reasoning: true,
      reasoningMode: ReasoningMode.ANALYSIS,
    });
  }
  
  // ==================== Analysis Commands ====================
  
  /**
   * Analyzes files or directories
   * @param {string} path - Path to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async analyze(path, options = {}) {
    const files = await this.#loadFilesFromPath(path);
    
    if (files.length === 0) {
      throw new GPT54CliError('No files found at path', 'NO_FILES');
    }
    
    return this.#client.execute({
      type: TaskType.CODE_REVIEW,
      description: options.description || `Analyze ${files.length} files`,
      files,
      instructions: options.instructions || 'Provide comprehensive analysis',
    }, {
      reasoning: true,
      reasoningMode: ReasoningMode.ANALYSIS,
    });
  }
  
  /**
   * Refactors files
   * @param {string} path - Path to refactor
   * @param {Object} options - Refactoring options
   * @returns {Promise<Object>} Refactoring result
   */
  async refactor(path, options = {}) {
    const files = await this.#loadFilesFromPath(path);
    
    return this.#client.complexRefactoring(files, {
      goal: options.goal || 'Improve code quality and maintainability',
      preserveBehavior: options.preserveBehavior !== false,
      ...options,
    });
  }
  
  /**
   * Generates architecture
   * @param {Object} requirements - Architecture requirements
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Architecture design
   */
  async architect(requirements, options = {}) {
    return this.#client.codeArchitecture(requirements, options);
  }
  
  /**
   * Generates system design
   * @param {Object} spec - System specification
   * @param {Object} options - Design options
   * @returns {Promise<Object>} System design
   */
  async systemDesign(spec, options = {}) {
    return this.#client.systemDesign(spec, options);
  }
  
  /**
   * Performs security audit
   * @param {string} path - Path to audit
   * @param {Object} options - Audit options
   * @returns {Promise<Object>} Security audit
   */
  async securityAudit(path, options = {}) {
    const files = await this.#loadFilesFromPath(path);
    const code = files.map(f => f.content).join('\n\n');
    
    return this.#client.securityAnalysis(code, {
      deepScan: options.deepScan ?? true,
      ...options,
    });
  }
  
  /**
   * Performs performance analysis
   * @param {string} path - Path to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Performance analysis
   */
  async performanceAnalysis(path, options = {}) {
    const files = await this.#loadFilesFromPath(path);
    const code = files.map(f => f.content).join('\n\n');
    
    return this.#client.performanceAnalysis(code, options);
  }
  
  /**
   * Generates documentation
   * @param {string} path - Path to document
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Documentation
   */
  async generateDocs(path, options = {}) {
    const files = await this.#loadFilesFromPath(path);
    
    return this.#client.execute({
      type: TaskType.DOCUMENTATION,
      description: `Generate documentation for ${files.length} files`,
      files,
      instructions: options.instructions || 'Generate comprehensive documentation',
    });
  }
  
  // ==================== Helper Methods ====================
  
  /**
   * Loads files from path pattern
   * @private
   * @param {string} path - Path or pattern
   * @returns {Promise<Array>} File objects
   */
  async #loadFilesFromPath(path) {
    // Check if it's a glob pattern
    if (path.includes('*') || path.includes('?')) {
      return this.#loadFilesFromPatterns([path]);
    }
    
    const fullPath = resolve(this.#options.workingDir, path);
    const stats = await fs.stat(fullPath);
    
    if (stats.isDirectory()) {
      return this.#loadFilesFromDirectory(fullPath);
    } else {
      return this.#loadFilesFromPatterns([path]);
    }
  }
  
  /**
   * Loads files from patterns
   * @private
   * @param {Array<string>} patterns - File patterns
   * @returns {Promise<Array>} File objects
   */
  async #loadFilesFromPatterns(patterns) {
    const files = [];
    
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.#options.workingDir,
        absolute: true,
      });
      
      for (const match of matches) {
        try {
          const content = await fs.readFile(match, 'utf8');
          files.push({
            path: match,
            name: basename(match),
            content,
            extension: extname(match).slice(1),
          });
        } catch (error) {
          if (this.#options.verbose) {
            console.warn(`Warning: Could not read ${match}: ${error.message}`);
          }
        }
      }
    }
    
    return files;
  }
  
  /**
   * Loads files from directory
   * @private
   * @param {string} dir - Directory path
   * @returns {Promise<Array>} File objects
   */
  async #loadFilesFromDirectory(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    const supportedFormats = this.#config.getConfig().supportedFormats;
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip ignored directories
        if (['node_modules', '.git', 'dist', 'build', '.tmp', 'coverage'].includes(entry.name)) {
          continue;
        }
        const subFiles = await this.#loadFilesFromDirectory(fullPath);
        files.push(...subFiles);
      } else {
        const ext = extname(entry.name).slice(1);
        if (supportedFormats.includes(ext)) {
          try {
            const content = await fs.readFile(fullPath, 'utf8');
            files.push({
              path: fullPath,
              name: entry.name,
              content,
              extension: ext,
            });
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    }
    
    return files;
  }
  
  /**
   * Delay helper
   * @private
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   */
  #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // ==================== Output Formatting ====================
  
  /**
   * Formats output based on format option
   * @param {Object} data - Data to format
   * @param {string} format - Output format
   * @returns {string} Formatted output
   */
  formatOutput(data, format = this.#options.outputFormat) {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'yaml':
        // Simple YAML formatting
        return this.#toYaml(data);
      case 'markdown':
      default:
        return typeof data === 'string' ? data : data.content || JSON.stringify(data, null, 2);
    }
  }
  
  /**
   * Simple YAML conversion
   * @private
   * @param {Object} obj - Object to convert
   * @param {number} indent - Indentation level
   * @returns {string} YAML string
   */
  #toYaml(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let yaml = '';
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        yaml += `${spaces}${key}: null\n`;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        yaml += this.#toYaml(value, indent + 1);
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${spaces}  -\n`;
            yaml += this.#toYaml(item, indent + 2).replace(/^([^ ].*)/gm, `${spaces}    $1`);
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        }
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }
    
    return yaml;
  }
  
  // ==================== Cleanup ====================
  
  /**
   * Closes the CLI client
   * @returns {Promise<void>}
   */
  async close() {
    if (this.#rl) {
      this.#rl.close();
      this.#rl = null;
    }
    
    await this.#client.close();
    
    this.emit('closed');
  }
  
  /**
   * Gets client statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.#client.getMetrics(),
      ...this.#client.getCostStats(),
      session: this.#session,
      config: this.#config.getPublicConfig(),
    };
  }
}

/**
 * Creates a GPT54CliClient instance
 * @param {Object} options - Client options
 * @returns {GPT54CliClient} CLI client instance
 */
export function createGPT54CliClient(options = {}) {
  return new GPT54CliClient(options);
}

export default GPT54CliClient;
