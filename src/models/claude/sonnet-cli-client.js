/**
 * Claude Sonnet CLI Client
 * Deep native integration with Claude Sonnet 4.6/4.5 via CLI
 * 
 * Features:
 * - Interactive mode support
 * - Batch processing
 * - File operations
 * - Git integration
 * - Project context management
 * - Code analysis workflows
 */

import { BaseClient } from '../../clients/base-client.js';
import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve, relative, extname, dirname } from 'path';
import os from 'os';
import { SonnetConfigManager, SONNET_MODELS } from './sonnet-config.js';

export class SonnetCliClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'claude',
      mode: 'sonnet-cli',
      name: config.name || 'claude-sonnet-cli'
    });
    
    // Configuration
    this.configManager = new SonnetConfigManager(config);
    this.modelConfig = this.configManager.getModelConfig(config.modelId);
    
    // CLI settings
    this.process = null;
    this.cliPath = config.cliPath || this._findCliPath();
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseURL = config.baseURL || 'https://api.anthropic.com/v1';
    this.preferApi = config.preferApi ?? false;
    
    // State
    this.messageQueue = [];
    this.responseBuffer = '';
    this.conversationHistory = [];
    this.projectContext = new Map();
    this.sessionStartTime = null;
    
    // Git integration
    this.gitCache = new Map();
    
    // Cost tracking
    this.costTracker = this.configManager.getCostTracker();
  }

  /**
   * Find Claude CLI executable
   */
  _findCliPath() {
    const platform = os.platform();
    const paths = platform === 'win32' 
      ? [
          'claude.cmd',
          'claude.exe',
          join(os.homedir(), 'AppData', 'Local', 'npm', 'claude.cmd'),
          join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude.cmd'),
          join(os.homedir(), 'AppData', 'Local', 'Anthropic', 'claude.cmd'),
          join(os.homedir(), 'AppData', 'Roaming', 'Anthropic', 'claude.cmd'),
          join(os.homedir(), 'AppData', 'Local', 'Programs', 'claude', 'claude.exe')
        ]
      : [
          'claude',
          '/usr/local/bin/claude',
          '/usr/bin/claude',
          '/opt/anthropic/claude',
          join(os.homedir(), '.local', 'bin', 'claude'),
          join(os.homedir(), '.npm-global', 'bin', 'claude'),
          join(os.homedir(), '.anthropic', 'bin', 'claude'),
          '/Applications/Claude.app/Contents/MacOS/claude'
        ];

    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Try to find in PATH
    try {
      const cmd = platform === 'win32' ? 'where claude' : 'which claude';
      const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      const foundPath = result.trim().split('\n')[0];
      if (foundPath) return foundPath;
    } catch {
      // Not found in PATH
    }

    return 'claude'; // Fallback to PATH lookup
  }

  /**
   * Initialize the client
   */
  async initialize() {
    this.status = 'initializing';
    this.sessionStartTime = Date.now();
    
    // Start cost tracking session
    this.costTracker.startSession(`sonnet-cli-${this.id}`);
    
    try {
      // Try API first if preferred and key available
      if (this.preferApi && this.apiKey) {
        await this._verifyApiAccess();
        this.status = 'ready';
        this.updateHealth({ connected: true });
        this.emit('ready');
        return true;
      }
      
      // Verify CLI is available
      execSync(`${this.cliPath} --version`, { stdio: 'pipe' });
      
      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready');
      return true;
    } catch (error) {
      // Fallback to API if CLI fails but API key available
      if (this.apiKey) {
        try {
          await this._verifyApiAccess();
          this.status = 'ready';
          this.updateHealth({ connected: true });
          this.emit('ready');
          return true;
        } catch (apiError) {
          this.status = 'error';
          this.updateHealth({ connected: false, lastError: apiError.message });
          throw new Error(`Claude Sonnet API verification failed: ${apiError.message}`);
        }
      } else {
        this.status = 'error';
        this.updateHealth({ connected: false, lastError: error.message });
        throw new Error(`Claude CLI not found or not working: ${error.message}`);
      }
    }
  }

  /**
   * Verify API access
   */
  async _verifyApiAccess() {
    const response = await fetch(`${this.baseURL}/models`, {
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API verification failed: ${response.statusText}`);
    }
  }

  /**
   * Send a message to Claude Sonnet
   */
  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Claude Sonnet CLI client not connected');
    }

    // Estimate token usage (billing handled by subscription)
    const estimatedInput = this._estimateTokens(message.content || message);
    const estimatedOutput = options.maxTokens || 4096;
    const estimatedUsage = this.costTracker.estimateUsage(estimatedInput, estimatedOutput);

    // Prefer API for direct control and better features
    if (this.preferApi && this.apiKey) {
      return this._sendViaApi(message, options);
    }

    return this._sendViaCli(message, options);
  }

  /**
   * Send via Anthropic API
   */
  async _sendViaApi(message, options = {}) {
    const messages = [];
    const model = options.model || this.modelConfig.id;
    
    // Optimize context if needed
    if (options.useHistory && this.conversationHistory.length > 0) {
      const optimizer = this.configManager.getOptimizer();
      const optimized = optimizer.optimizeContext(
        this.conversationHistory.slice(-20),
        this.modelConfig.contextWindow * 0.8
      );
      messages.push(...optimized.messages);
    }
    
    messages.push({
      role: 'user',
      content: message.content || message
    });

    const requestBody = {
      model,
      max_tokens: options.maxTokens || this.configManager.get('maxTokens'),
      temperature: options.temperature ?? this.configManager.get('temperature'),
      top_p: options.topP ?? this.configManager.get('topP'),
      system: options.system || this._getSystemPrompt(options),
      messages,
      stream: options.streaming ?? this.configManager.get('performance.streaming.enabled')
    };

    // Add extended thinking if enabled
    if (options.extendedThinking ?? this.configManager.get('extendedThinking.enabled')) {
      requestBody.thinking = {
        type: 'enabled',
        budget_tokens: options.thinkingBudget || this.configManager.get('extendedThinking.budgetTokens')
      };
    }

    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'anthropic-beta': 'computer-use-2024-10-22'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.statusText} - ${error}`);
    }

    const data = await response.json();
    
    // Track costs
    if (data.usage) {
      this.costTracker.recordUsage(
        data.usage.input_tokens,
        data.usage.output_tokens,
        this.modelConfig
      );
    }

    // Store in conversation history
    if (options.useHistory) {
      this.conversationHistory.push(
        { role: 'user', content: message.content || message },
        { role: 'assistant', content: data.content[0]?.text || '' }
      );
    }

    return {
      content: data.content[0]?.text || '',
      thinking: data.content.find(c => c.type === 'thinking')?.thinking,
      usage: data.usage,
      model: data.model,
      id: data.id,
      stop_reason: data.stop_reason
    };
  }

  /**
   * Send via CLI
   */
  async _sendViaCli(message, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 180000;
      const args = [];
      
      // Add model flag if specified
      if (options.model) {
        args.push('--model', options.model);
      }
      
      // Add print flag for non-interactive output
      if (options.print !== false) {
        args.push('--print');
      }
      
      // Add working directory
      if (options.cwd) {
        args.push('--cwd', options.cwd);
      }

      // Add the message content
      args.push(message.content || message);

      const child = spawn(this.cliPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: options.cwd || process.cwd(),
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: this.apiKey || ''
        }
      });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Claude Sonnet CLI timeout after ${timeout}ms`));
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
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        } else {
          resolve({
            content: stdout.trim(),
            raw: stdout,
            stderr: stderr,
            exitCode: code
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * Execute a task
   */
  async execute(task, options = {}) {
    const command = this._buildTaskCommand(task);
    return this.send({ content: command }, { 
      ...options, 
      context: task.context || options.context 
    });
  }

  /**
   * Build command from task definition
   */
  _buildTaskCommand(task) {
    if (task.command) {
      return task.command;
    }

    if (task.description) {
      let prompt = task.description;
      
      if (task.code) {
        prompt += `\n\n\`\`\`${task.language || ''}\n${task.code}\n\`\`\``;
      }
      
      if (task.instructions) {
        prompt += `\n\nInstructions: ${task.instructions}`;
      }
      
      return prompt;
    }

    if (task.code) {
      return `Analyze and improve this code:\n\`\`\`${task.language || ''}\n${task.code}\n\`\`\``;
    }

    throw new Error('Task must have command, description, or code');
  }

  // ==================== CORE METHODS ====================

  /**
   * Analyze code file
   * @param {string} filePath - Path to file to analyze
   * @param {Object} options - Analysis options
   */
  async codeAnalyze(filePath, options = {}) {
    const resolvedPath = resolve(filePath);
    
    if (!existsSync(resolvedPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const code = readFileSync(resolvedPath, 'utf-8');
    const stats = statSync(resolvedPath);
    const language = this._detectLanguage(resolvedPath);

    const prompt = `Please analyze the following ${language} code file:\n\n` +
      `File: ${filePath}\n` +
      `Size: ${stats.size} bytes\n` +
      `Lines: ${code.split('\n').length}\n\n` +
      `Code:\n\`\`\`${language}\n${code}\n\`\`\`\n\n` +
      `Please provide:\n` +
      `1. Overall structure and purpose\n` +
      `2. Key functions/classes and their roles\n` +
      `3. Potential issues or bugs\n` +
      `4. Performance considerations\n` +
      `5. Security concerns (if any)\n` +
      `6. Suggestions for improvement\n` +
      (options.focus ? `\nFocus areas: ${options.focus}` : '');

    return this.send(
      { content: prompt },
      { ...options, context: 'analysis', maxTokens: options.maxTokens || 4096 }
    );
  }

  /**
   * Generate code from prompt
   * @param {string} prompt - Generation prompt
   * @param {string} language - Target programming language
   * @param {Object} options - Generation options
   */
  async codeGenerate(prompt, language, options = {}) {
    const systemPrompt = `You are an expert ${language} developer. Generate clean, well-documented, production-ready code. ` +
      `Include:\n` +
      `- Clear comments explaining complex logic\n` +
      `- Error handling where appropriate\n` +
      `- Type hints/annotations if applicable\n` +
      `- Example usage\n` +
      (options.requirements ? `\nAdditional requirements: ${options.requirements}` : '');

    const fullPrompt = `Generate ${language} code for the following:\n\n${prompt}\n\n` +
      `Provide only the code and brief explanation. Wrap code in \`\`\`${language} blocks.`;

    return this.send(
      { content: fullPrompt },
      { ...options, system: systemPrompt, context: 'coding', maxTokens: options.maxTokens || 4096 }
    );
  }

  /**
   * Review code file
   * @param {string} filePath - Path to file to review
   * @param {Object} options - Review options
   */
  async codeReview(filePath, options = {}) {
    const resolvedPath = resolve(filePath);
    
    if (!existsSync(resolvedPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const code = readFileSync(resolvedPath, 'utf-8');
    const language = this._detectLanguage(resolvedPath);

    // Try to get git diff if in git repo
    let gitDiff = '';
    try {
      gitDiff = execSync(`git diff HEAD -- "${resolvedPath}"`, { 
        encoding: 'utf-8',
        cwd: options.cwd || process.cwd()
      });
    } catch {
      // Not a git repo or no changes
    }

    let prompt = `Please conduct a thorough code review of the following ${language} file:\n\n` +
      `File: ${filePath}\n\n` +
      `Code:\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;

    if (gitDiff) {
      prompt += `Recent changes (git diff):\n\`\`\`diff\n${gitDiff}\n\`\`\`\n\n`;
    }

    prompt += `Please review and provide:\n` +
      `## Summary\nBrief overview of the code\n\n` +
      `## Issues Found\n` +
      `- Bugs or logical errors\n` +
      `- Security vulnerabilities\n` +
      `- Performance bottlenecks\n` +
      `- Code style violations\n\n` +
      `## Recommendations\nSpecific, actionable improvements\n\n` +
      `## Positive Aspects\nWhat's done well\n\n` +
      (options.strict ? 'Be strict and thorough in your review.' : '');

    return this.send(
      { content: prompt },
      { ...options, context: 'review', maxTokens: options.maxTokens || 4096 }
    );
  }

  /**
   * Explain code file
   * @param {string} filePath - Path to file to explain
   * @param {Object} options - Explanation options
   */
  async explainCode(filePath, options = {}) {
    const resolvedPath = resolve(filePath);
    
    if (!existsSync(resolvedPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const code = readFileSync(resolvedPath, 'utf-8');
    const language = this._detectLanguage(resolvedPath);
    const level = options.level || 'intermediate'; // beginner, intermediate, expert

    let prompt = `Please explain the following ${language} code:\n\n` +
      `File: ${filePath}\n\n` +
      `Code:\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;

    switch (level) {
      case 'beginner':
        prompt += `Explain this code for a beginner programmer. Cover:\n` +
          `1. What this code does in simple terms\n` +
          `2. Break down each section line by line\n` +
          `3. Explain any technical terms\n` +
          `4. Provide a simple analogy if helpful\n`;
        break;
      case 'expert':
        prompt += `Explain this code for an expert developer. Focus on:\n` +
          `1. Architecture and design patterns used\n` +
          `2. Edge cases and error handling\n` +
          `3. Performance characteristics\n` +
          `4. Integration points and dependencies\n`;
        break;
      default:
        prompt += `Explain this code:\n` +
          `1. Overall purpose and functionality\n` +
          `2. Key components and their interactions\n` +
          `3. Important algorithms or logic\n` +
          `4. Dependencies and external calls\n`;
    }

    if (options.questions) {
      prompt += `\n\nAlso answer these specific questions: ${options.questions}`;
    }

    return this.send(
      { content: prompt },
      { ...options, maxTokens: options.maxTokens || 4096 }
    );
  }

  // ==================== INTERACTIVE MODE ====================

  /**
   * Start interactive chat session
   * @param {Object} options - Session options
   */
  async startInteractiveSession(options = {}) {
    const { createInterface } = await import('readline');
    
    console.log(`\n🤖 Claude Sonnet ${this.modelConfig.version} Interactive Mode\n`);
    console.log('Type your message and press Enter. Commands:');
    console.log('  /exit, /quit - Exit session');
    console.log('  /clear - Clear conversation history');
    console.log('  /status - Show session status');
    console.log('  /cost - Show cost tracking info');
    console.log('  /file <path> - Load file into context\n');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'You> '
    });

    const session = {
      messages: [],
      startTime: Date.now(),
      filesLoaded: []
    };

    rl.prompt();

    rl.on('line', async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        rl.prompt();
        return;
      }

      // Handle commands
      if (trimmed.startsWith('/')) {
        const [cmd, ...args] = trimmed.slice(1).split(' ');
        
        switch (cmd) {
          case 'exit':
          case 'quit':
            console.log('\n👋 Goodbye!');
            rl.close();
            return;
            
          case 'clear':
            session.messages = [];
            this.conversationHistory = [];
            console.log('Conversation history cleared.\n');
            rl.prompt();
            return;
            
          case 'status':
            console.log(`\n📊 Session Status:`);
            console.log(`  Duration: ${Math.floor((Date.now() - session.startTime) / 1000)}s`);
            console.log(`  Messages: ${session.messages.length}`);
            console.log(`  Model: ${this.modelConfig.name}`);
            console.log(`  Files loaded: ${session.filesLoaded.length}\n`);
            rl.prompt();
            return;
            
          case 'cost':
            const stats = this.costTracker.getStats();
            console.log(`\nToken Usage:`);
            console.log(`  Total tokens: ${stats.inputTokens + stats.outputTokens}`);
            console.log(`  Requests: ${stats.requests}`);
            console.log(`  Avg tokens/request: ${stats.averageTokensPerRequest.toFixed(0)}\n`);
            rl.prompt();
            return;
            
          case 'file':
            const filePath = args.join(' ');
            if (!filePath) {
              console.log('Usage: /file <path>\n');
              rl.prompt();
              return;
            }
            try {
              const content = readFileSync(resolve(filePath), 'utf-8');
              session.filesLoaded.push(filePath);
              const filePrompt = `File loaded: ${filePath}\n\n\`\`\`\n${content}\n\`\`\`\n\nPlease acknowledge and wait for my questions about this file.`;
              session.messages.push({ role: 'user', content: filePrompt });
              console.log(`✅ File loaded: ${filePath}\n`);
            } catch (error) {
              console.log(`❌ Error loading file: ${error.message}\n`);
            }
            rl.prompt();
            return;
            
          default:
            console.log(`Unknown command: /${cmd}\n`);
            rl.prompt();
            return;
        }
      }

      try {
        process.stdout.write('\n🤖 Thinking...\n');
        
        const response = await this.send(
          { content: trimmed },
          { 
            ...options, 
            useHistory: true,
            maxTokens: options.maxTokens || 4096 
          }
        );

        console.log(`\n${response.content}\n`);
        
        session.messages.push(
          { role: 'user', content: trimmed },
          { role: 'assistant', content: response.content }
        );
      } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
      }

      rl.prompt();
    });

    return new Promise((resolve) => {
      rl.on('close', () => {
        this.costTracker.endSession();
        resolve(session);
      });
    });
  }

  // ==================== BATCH PROCESSING ====================

  /**
   * Process multiple tasks in batch
   * @param {Array} tasks - Array of task objects
   * @param {Object} options - Batch options
   */
  async batchProcess(tasks, options = {}) {
    const results = [];
    const concurrency = options.concurrency || 1;
    const delay = options.delay || 1000; // Delay between requests to avoid rate limits

    console.log(`Processing ${tasks.length} tasks with concurrency ${concurrency}...\n`);

    for (let i = 0; i < tasks.length; i += concurrency) {
      const batch = tasks.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (task, idx) => {
        const taskNum = i + idx + 1;
        console.log(`[${taskNum}/${tasks.length}] Processing: ${task.description || task.id || 'unnamed'}...`);
        
        try {
          const result = await this.execute(task, options);
          console.log(`[${taskNum}/${tasks.length}] ✓ Completed`);
          return { success: true, task, result };
        } catch (error) {
          console.log(`[${taskNum}/${tasks.length}] ✗ Failed: ${error.message}`);
          return { success: false, task, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Delay between batches
      if (i + concurrency < tasks.length) {
        await new Promise(r => setTimeout(r, delay));
      }
    }

    const successful = results.filter(r => r.success).length;
    const costStats = this.costTracker.getStats();
    
    console.log(`\nBatch complete: ${successful}/${tasks.length} successful`);
    console.log(`Total tokens: ${costStats.inputTokens + costStats.outputTokens}`);

    return {
      total: tasks.length,
      successful,
      failed: tasks.length - successful,
      totalTokens: costStats.inputTokens + costStats.outputTokens,
      results
    };
  }

  // ==================== GIT INTEGRATION ====================

  /**
   * Analyze git diff
   * @param {string} ref - Git ref (commit, branch, etc.)
   * @param {Object} options - Analysis options
   */
  async analyzeGitDiff(ref = 'HEAD', options = {}) {
    try {
      const diff = execSync(`git diff ${ref}^..${ref}`, { encoding: 'utf-8' });
      
      if (!diff.trim()) {
        return { content: 'No changes found in the specified ref.' };
      }

      const prompt = `Please analyze the following git diff and provide a code review:\n\n` +
        `\`\`\`diff\n${diff}\n\`\`\`\n\n` +
        `Please provide:\n` +
        `1. Summary of changes\n` +
        `2. Potential issues or concerns\n` +
        `3. Suggestions for improvement\n` +
        `4. Overall assessment`;

      return this.send({ content: prompt }, { ...options, maxTokens: 4096 });
    } catch (error) {
      throw new Error(`Git diff analysis failed: ${error.message}`);
    }
  }

  /**
   * Generate commit message
   * @param {Object} options - Generation options
   */
  async generateCommitMessage(options = {}) {
    try {
      const diff = execSync('git diff --cached', { encoding: 'utf-8' });
      
      if (!diff.trim()) {
        throw new Error('No staged changes found');
      }

      const prompt = `Generate a concise, conventional commit message for the following changes:\n\n` +
        `\`\`\`diff\n${diff.substring(0, 8000)}\n\`\`\`\n\n` +
        `Format: <type>(<scope>): <description>\n\n` +
        `Types: feat, fix, docs, style, refactor, test, chore\n` +
        `Keep the first line under 72 characters. Add body if needed.`;

      return this.send({ content: prompt }, { ...options, maxTokens: 256 });
    } catch (error) {
      throw new Error(`Commit message generation failed: ${error.message}`);
    }
  }

  // ==================== PROJECT CONTEXT ====================

  /**
   * Load project context
   * @param {string} projectPath - Path to project root
   */
  async loadProjectContext(projectPath) {
    const resolvedPath = resolve(projectPath);
    
    if (!existsSync(resolvedPath)) {
      throw new Error(`Project path not found: ${projectPath}`);
    }

    const context = {
      path: resolvedPath,
      files: [],
      structure: [],
      packageInfo: null,
      gitInfo: null
    };

    // Read package.json if exists
    const packagePath = join(resolvedPath, 'package.json');
    if (existsSync(packagePath)) {
      context.packageInfo = JSON.parse(readFileSync(packagePath, 'utf-8'));
    }

    // Get git info
    try {
      context.gitInfo = {
        branch: execSync('git branch --show-current', { 
          cwd: resolvedPath, 
          encoding: 'utf-8' 
        }).trim(),
        lastCommit: execSync('git log -1 --oneline', { 
          cwd: resolvedPath, 
          encoding: 'utf-8' 
        }).trim()
      };
    } catch {
      // Not a git repo
    }

    // Get project structure (first 2 levels)
    try {
      const entries = readdirSync(resolvedPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subEntries = readdirSync(join(resolvedPath, entry.name), { withFileTypes: true })
            .filter(e => !e.name.startsWith('.'))
            .map(e => e.name);
          context.structure.push(`${entry.name}/: ${subEntries.slice(0, 5).join(', ')}${subEntries.length > 5 ? '...' : ''}`);
        } else if (entry.isFile()) {
          context.structure.push(entry.name);
        }
      }
    } catch (error) {
      // Ignore permission errors
    }

    this.projectContext.set(resolvedPath, context);
    return context;
  }

  // ==================== UTILITY METHODS ====================

  _getSystemPrompt(options = {}) {
    const basePrompt = `You are Claude Sonnet ${this.modelConfig.version}, an AI assistant made by Anthropic.`;
    
    if (options.context === 'coding') {
      return `${basePrompt} You are an expert software engineer. Provide clear, well-structured code with explanations. Follow best practices and include error handling.`;
    }
    
    if (options.context === 'analysis') {
      return `${basePrompt} You are a code analysis expert. Provide detailed analysis including potential issues, improvements, and best practices.`;
    }
    
    if (options.context === 'review') {
      return `${basePrompt} You are conducting a thorough code review. Identify bugs, security issues, performance concerns, and style violations. Provide actionable feedback.`;
    }
    
    return options.system || basePrompt;
  }

  _detectLanguage(filePath) {
    const ext = extname(filePath).toLowerCase();
    const languageMap = {
      '.js': 'javascript', '.jsx': 'jsx', '.ts': 'typescript', '.tsx': 'tsx',
      '.py': 'python', '.java': 'java', '.cpp': 'cpp', '.c': 'c',
      '.h': 'c', '.hpp': 'cpp', '.cs': 'csharp', '.go': 'go',
      '.rs': 'rust', '.rb': 'ruby', '.php': 'php', '.swift': 'swift',
      '.kt': 'kotlin', '.scala': 'scala', '.r': 'r', '.m': 'matlab',
      '.sh': 'bash', '.bash': 'bash', '.ps1': 'powershell', '.sql': 'sql',
      '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'scss',
      '.sass': 'sass', '.less': 'less', '.json': 'json', '.xml': 'xml',
      '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.md': 'markdown',
      '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro', '.lua': 'lua',
      '.pl': 'perl', '.groovy': 'groovy', '.dart': 'dart', '.elm': 'elm',
      '.fs': 'fsharp', '.hs': 'haskell', '.erl': 'erlang', '.ex': 'elixir',
      '.clj': 'clojure', '.lisp': 'lisp', '.vim': 'vim', '.dockerfile': 'dockerfile',
      '.tf': 'terraform', '.hcl': 'hcl', '.proto': 'protobuf', '.graphql': 'graphql',
      '.prisma': 'prisma'
    };
    return languageMap[ext] || 'text';
  }

  _estimateTokens(content) {
    if (typeof content === 'string') {
      return Math.ceil(content.length / 4);
    }
    if (Array.isArray(content)) {
      return content.reduce((sum, msg) => sum + this._estimateTokens(msg.content || msg), 0);
    }
    return 0;
  }

  getCapabilities() {
    return {
      provider: 'claude',
      mode: 'sonnet-cli',
      version: this.modelConfig.version,
      contextWindow: this.modelConfig.contextWindow,
      maxOutputTokens: this.modelConfig.maxOutputTokens,
      features: [
        'code_analysis',
        'code_generation',
        'code_review',
        'code_explanation',
        'file_operations',
        'command_execution',
        'interactive_mode',
        'batch_processing',
        'multi_file_analysis',
        'git_integration',
        'cost_tracking',
        'extended_thinking'
      ],
      streaming: true,
      supportsFiles: true,
      supportsImages: true,
      supportsSystemPrompts: true,
      models: Object.keys(SONNET_MODELS)
    };
  }

  async _doPing() {
    if (this.apiKey && this.preferApi) {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        }
      });
      if (!response.ok) throw new Error('API ping failed');
    } else {
      execSync(`${this.cliPath} --version`, { stdio: 'pipe' });
    }
  }

  async disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.conversationHistory = [];
    this.projectContext.clear();
    this.costTracker.endSession();
    await super.disconnect();
  }
}

export default SonnetCliClient;
