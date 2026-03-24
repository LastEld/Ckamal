/**
 * Kimi CLI Implementation
 * CLI-specific implementations for Kimi Code integration
 * 
 * Features:
 * - Interactive mode with streaming
 * - Batch processing
 * - Project-wide analysis
 * - File watching
 * - Command-line interface
 * 
 * @module models/kimi/kimi-cli
 */

import { KimiClient } from './kimi-client.js';
import { spawn } from 'child_process';
import { existsSync, readFileSync, watch } from 'fs';
import { basename, join, extname, relative } from 'path';
import { glob } from 'glob';
import os from 'os';

/**
 * Kimi CLI Client - Enhanced CLI integration for Kimi Code
 * @extends KimiClient
 */
export class KimiCliClient extends KimiClient {
  constructor(options = {}) {
    super({
      ...options,
      features: {
        longContext: true,
        thinkingMode: true,
        multimodal: true,
        chineseOptimization: true,
        streaming: true,
        contextCaching: true,
        ...options.features
      }
    });

    this.cliPath = options.cliPath || this._findCliPath();
    this.workingDir = options.workingDir || process.cwd();
    
    // Interactive mode settings
    this.interactiveMode = false;
    this.sessionHistory = [];
    this.maxHistorySize = options.maxHistorySize || 100;

    // Batch processing settings
    this.batchQueue = [];
    this.batchConcurrency = options.batchConcurrency || 3;

    // File watching
    this.watchers = new Map();
    this.autoAnalyzeOnChange = options.autoAnalyzeOnChange || false;

    // Project analysis cache
    this.projectCache = null;
    this.projectCacheExpiry = null;
  }

  /**
   * Find Kimi CLI executable
   * @private
   */
  _findCliPath() {
    const platform = os.platform();
    const paths = platform === 'win32'
      ? [
          'kimi.cmd',
          'kimi.exe',
          join(os.homedir(), 'AppData', 'Roaming', 'npm', 'kimi.cmd'),
          join(os.homedir(), 'AppData', 'Local', 'npm', 'kimi.cmd'),
          join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'moonshot-ai.kimi-code', 'bin', 'kimi.cmd')
        ]
      : [
          'kimi',
          '/usr/local/bin/kimi',
          '/usr/bin/kimi',
          join(os.homedir(), '.local', 'bin', 'kimi'),
          join(os.homedir(), '.npm-global', 'bin', 'kimi'),
          join(os.homedir(), '.config', 'Code', 'User', 'globalStorage', 'moonshot-ai.kimi-code', 'bin', 'kimi')
        ];

    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return 'kimi';
  }

  /**
   * Initialize CLI client
   */
  async initialize() {
    // First try API initialization
    try {
      await super.initialize();
      this.useApi = true;
      return true;
    } catch (apiError) {
      // Fall back to CLI
      this.useApi = false;
      return this._initializeCli();
    }
  }

  /**
   * Initialize CLI mode
   * @private
   */
  async _initializeCli() {
    try {
      const { execSync } = await import('child_process');
      execSync(`${this.cliPath} --version`, { stdio: 'pipe' });
      
      this.emit('ready', { mode: 'cli' });
      return true;
    } catch (error) {
      throw new Error(`Kimi CLI not found: ${error.message}`);
    }
  }

  /**
   * Send message (overrides parent to support CLI fallback)
   */
  async send(message, options = {}) {
    if (this.useApi) {
      return super.send(message, options);
    }
    return this._sendViaCli(message, options);
  }

  /**
   * Send via CLI
   * @private
   */
  async _sendViaCli(message, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 180000;
      const args = ['--print'];

      if (options.model) {
        args.push('--model', options.model);
      }

      if (options.thinking) {
        args.push('--thinking');
      }

      if (options.temperature !== undefined) {
        args.push('--temperature', options.temperature.toString());
      }

      const content = typeof message === 'string' ? message : message.content;
      args.push(content);

      const child = spawn(this.cliPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: options.cwd || this.workingDir,
        env: {
          ...process.env,
          MOONSHOT_API_KEY: this.apiKey || ''
        }
      });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Kimi CLI timeout after ${timeout}ms`));
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);

        if (code !== 0 && code !== null) {
          reject(new Error(`Kimi CLI exited with code ${code}: ${stderr}`));
        } else {
          resolve({
            content: stdout.trim(),
            raw: stdout,
            exitCode: code,
            mode: 'cli'
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  // ============================================================================
  // INTERACTIVE MODE
  // ============================================================================

  /**
   * Start interactive mode
   * @param {Object} options - Interactive mode options
   * @param {Function} [options.onMessage] - Callback for messages
   * @param {Function} [options.onError] - Callback for errors
   * @param {boolean} [options.streaming] - Enable streaming
   */
  async startInteractiveMode(options = {}) {
    this.interactiveMode = true;
    this.emit('interactive:start');

    const rl = await import('readline');
    const interface_ = rl.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'kimi> '
    });

    interface_.prompt();

    interface_.on('line', async (line) => {
      const input = line.trim();
      
      if (input === 'exit' || input === 'quit') {
        interface_.close();
        return;
      }

      if (input === 'history') {
        console.log('\nSession History:');
        this.sessionHistory.forEach((h, i) => {
          console.log(`${i + 1}. ${h.role}: ${h.content.substring(0, 50)}...`);
        });
        interface_.prompt();
        return;
      }

      if (input === 'clear') {
        this.sessionHistory = [];
        console.log('History cleared.');
        interface_.prompt();
        return;
      }

      if (input) {
        try {
          if (options.streaming) {
            await this._handleStreamingInteraction(input, options);
          } else {
            await this._handleInteraction(input, options);
          }
        } catch (error) {
          if (options.onError) {
            options.onError(error);
          } else {
            console.error('Error:', error.message);
          }
        }
      }

      interface_.prompt();
    });

    interface_.on('close', () => {
      this.interactiveMode = false;
      this.emit('interactive:end');
    });

    return interface_;
  }

  /**
   * Handle single interaction
   * @private
   */
  async _handleInteraction(input, options) {
    const messages = this._buildContextMessages(input);
    
    const response = await this.send(
      { content: input },
      {
        ...options,
        messages: messages.slice(0, -1),
        system: options.system || this._getInteractiveSystemPrompt()
      }
    );

    // Update history
    this._addToHistory('user', input);
    this._addToHistory('assistant', response.content);

    if (options.onMessage) {
      options.onMessage(response);
    } else {
      console.log('\nKimi:', response.content, '\n');
    }
  }

  /**
   * Handle streaming interaction
   * @private
   */
  async _handleStreamingInteraction(input, options) {
    const messages = this._buildContextMessages(input);

    const stream = await this.send(
      { content: input },
      {
        ...options,
        messages: messages.slice(0, -1),
        system: options.system || this._getInteractiveSystemPrompt(),
        streaming: true
      }
    );

    let fullContent = '';
    process.stdout.write('\nKimi: ');

    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        process.stdout.write(chunk.content);
        fullContent += chunk.content;
      } else if (chunk.type === 'done') {
        console.log('\n');
      }
    }

    // Update history
    this._addToHistory('user', input);
    this._addToHistory('assistant', fullContent);
  }

  /**
   * Build context messages from history
   * @private
   */
  _buildContextMessages(currentInput) {
    const messages = [...this.sessionHistory];
    messages.push({ role: 'user', content: currentInput });
    return messages;
  }

  /**
   * Add message to history
   * @private
   */
  _addToHistory(role, content) {
    this.sessionHistory.push({ role, content, timestamp: Date.now() });

    // Trim history if too large
    while (this.sessionHistory.length > this.maxHistorySize) {
      this.sessionHistory.shift();
    }
  }

  /**
   * Get interactive system prompt
   * @private
   */
  _getInteractiveSystemPrompt() {
    return `You are Kimi, an AI assistant in interactive CLI mode. Be helpful, concise, and direct.
When appropriate, use markdown formatting for code and structured data.
Context from this session is maintained automatically.`;
  }

  // ============================================================================
  // BATCH PROCESSING
  // ============================================================================

  /**
   * Add items to batch queue
   * @param {Array<Object>} items - Items to process
   * @param {Function} processor - Processing function
   */
  addToBatch(items, processor) {
    for (const item of items) {
      this.batchQueue.push({ item, processor });
    }
  }

  /**
   * Process batch queue
   * @param {Object} options - Processing options
   * @param {number} [options.concurrency] - Concurrent processing limit
   * @param {boolean} [options.stopOnError] - Stop on first error
   * @param {Function} [options.onProgress] - Progress callback
   */
  async processBatch(options = {}) {
    const concurrency = options.concurrency || this.batchConcurrency;
    const results = [];
    const total = this.batchQueue.length;
    let completed = 0;
    let errors = 0;

    this.emit('batch:start', { total });

    while (this.batchQueue.length > 0) {
      const batch = this.batchQueue.splice(0, concurrency);

      const batchPromises = batch.map(async ({ item, processor }) => {
        try {
          const result = await processor(item, this);
          completed++;
          
          if (options.onProgress) {
            options.onProgress({ completed, total, errors, item });
          }

          return { success: true, item, result };
        } catch (error) {
          errors++;
          
          if (options.stopOnError) {
            throw error;
          }

          return { success: false, item, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    this.emit('batch:complete', { completed, total, errors });

    return {
      results,
      summary: {
        total,
        completed,
        errors,
        successRate: (completed - errors) / total
      }
    };
  }

  /**
   * Batch analyze files
   * @param {Array<string>} filePaths - Files to analyze
   * @param {string} promptTemplate - Prompt template with {filePath} and {content} placeholders
   * @param {Object} options - Analysis options
   */
  async batchAnalyzeFiles(filePaths, promptTemplate, options = {}) {
    const items = filePaths.map(path => ({
      path,
      prompt: promptTemplate
    }));

    this.addToBatch(items, async ({ path, prompt }) => {
      if (!existsSync(path)) {
        throw new Error(`File not found: ${path}`);
      }

      const content = readFileSync(path, 'utf-8');
      const finalPrompt = prompt
        .replace(/\{filePath\}/g, path)
        .replace(/\{content\}/g, content);

      return this.send(finalPrompt, options);
    });

    return this.processBatch(options);
  }

  // ============================================================================
  // PROJECT-WIDE ANALYSIS
  // ============================================================================

  /**
   * Analyze entire project
   * @param {Object} options - Analysis options
   * @param {string} [options.rootDir] - Project root directory
   * @param {Array<string>} [options.include] - Include patterns
   * @param {Array<string>} [options.exclude] - Exclude patterns
   * @param {string} [options.analysisType] - Type of analysis
   */
  async analyzeProject(options = {}) {
    const rootDir = options.rootDir || this.workingDir;
    const include = options.include || ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'];
    const exclude = options.exclude || ['node_modules/**', '.git/**', 'dist/**', 'build/**'];

    this.emit('project:analysis:start', { rootDir });

    // Find all files
    const allFiles = [];
    for (const pattern of include) {
      const files = await glob(pattern, {
        cwd: rootDir,
        ignore: exclude,
        absolute: true
      });
      allFiles.push(...files);
    }

    // Remove duplicates
    const uniqueFiles = [...new Set(allFiles)];

    this.emit('project:files:found', { count: uniqueFiles.length });

    // Sort files by importance (entry points, core modules first)
    const prioritizedFiles = this._prioritizeFiles(uniqueFiles, rootDir);

    // Analyze in chunks if needed
    const maxFiles = options.maxFiles || 50;
    const filesToAnalyze = prioritizedFiles.slice(0, maxFiles);

    const result = await this.longContextAnalyze(
      filesToAnalyze.map(path => ({ path })),
      {
        ...options,
        analysisType: options.analysisType || 'comprehensive',
        system: options.system || `You are analyzing a complete codebase. Provide:
1. Project overview and architecture
2. Key components and their relationships
3. Code organization and patterns
4. Potential improvements
5. Documentation gaps`
      }
    );

    // Cache result
    this.projectCache = {
      result,
      files: filesToAnalyze,
      timestamp: Date.now()
    };

    this.emit('project:analysis:complete', { filesAnalyzed: filesToAnalyze.length });

    return {
      ...result,
      metadata: {
        totalFiles: uniqueFiles.length,
        analyzedFiles: filesToAnalyze.length,
        rootDir
      }
    };
  }

  /**
   * Prioritize files for analysis
   * @private
   */
  _prioritizeFiles(files, rootDir) {
    const scores = new Map();

    for (const file of files) {
      let score = 0;
      const relativePath = relative(rootDir, file);
      const base = basename(file);

      // Prioritize entry points
      if (base === 'index.js' || base === 'index.ts' || base === 'main.js') {
        score += 100;
      }

      // Prioritize configuration files
      if (base.includes('config') || base === 'package.json' || base === 'tsconfig.json') {
        score += 80;
      }

      // Prioritize core modules (shorter paths often indicate core modules)
      const depth = relativePath.split('/').length;
      score += Math.max(0, 10 - depth) * 5;

      // Deprioritize test files
      if (file.includes('.test.') || file.includes('.spec.') || file.includes('__tests__')) {
        score -= 50;
      }

      scores.set(file, score);
    }

    return files.sort((a, b) => scores.get(b) - scores.get(a));
  }

  /**
   * Watch project files for changes
   * @param {Object} options - Watch options
   * @param {Array<string>} [options.patterns] - File patterns to watch
   * @param {Function} [options.onChange] - Change handler
   */
  async watchProject(options = {}) {
    const patterns = options.patterns || ['**/*.js', '**/*.ts'];
    const rootDir = options.rootDir || this.workingDir;

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: rootDir,
        absolute: true
      });

      for (const file of files) {
        if (this.watchers.has(file)) continue;

        const watcher = watch(file, async (eventType) => {
          if (eventType === 'change') {
            this.emit('file:change', { path: file });

            if (options.onChange) {
              options.onChange(file, eventType);
            }

            if (this.autoAnalyzeOnChange) {
              await this._analyzeChangedFile(file);
            }
          }
        });

        this.watchers.set(file, watcher);
      }
    }

    this.emit('watch:start', { watchers: this.watchers.size });

    return {
      watchers: this.watchers.size,
      stop: () => this.stopWatching()
    };
  }

  /**
   * Stop watching files
   */
  stopWatching() {
    for (const [, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
    this.emit('watch:stop');
  }

  /**
   * Analyze a changed file
   * @private
   */
  async _analyzeChangedFile(filePath) {
    try {
      const result = await this.send(
        `Analyze the changes in this file and suggest improvements:`,
        {
          messages: [
            { role: 'user', content: `File: ${filePath}` },
            { role: 'user', content: readFileSync(filePath, 'utf-8') }
          ]
        }
      );

      this.emit('file:analyzed', { path: filePath, result });
    } catch (error) {
      this.emit('file:analysis:error', { path: filePath, error });
    }
  }

  // ============================================================================
  // UTILITY COMMANDS
  // ============================================================================

  /**
   * Get project statistics
   */
  async getProjectStats(options = {}) {
    const rootDir = options.rootDir || this.workingDir;
    const patterns = options.patterns || ['**/*'];

    const stats = {
      totalFiles: 0,
      byExtension: {},
      totalLines: 0,
      languages: {}
    };

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: rootDir,
        ignore: ['node_modules/**', '.git/**'],
        nodir: true
      });

      for (const file of files) {
        stats.totalFiles++;
        
        const ext = extname(file) || 'no-extension';
        stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1;

        try {
          const content = readFileSync(join(rootDir, file), 'utf-8');
          const lines = content.split('\n').length;
          stats.totalLines += lines;
        } catch {
          // Skip binary files
        }
      }
    }

    return stats;
  }

  /**
   * Generate project summary
   */
  async generateProjectSummary(options = {}) {
    const stats = await this.getProjectStats(options);
    
    const result = await this.send(
      `Generate a project summary based on these statistics:\n\n${JSON.stringify(stats, null, 2)}`,
      {
        system: 'You are a technical writer. Create a concise project summary.',
        maxTokens: 2048
      }
    );

    return {
      stats,
      summary: result.content
    };
  }

  /**
   * Get CLI capabilities
   */
  getCapabilities() {
    return {
      ...super.getCapabilities(),
      mode: 'cli',
      features: [
        ...super.getCapabilities().features,
        'interactive_mode',
        'batch_processing',
        'project_analysis',
        'file_watching',
        'cli_fallback'
      ],
      cliPath: this.cliPath,
      useApi: this.useApi
    };
  }
}

export default KimiCliClient;
