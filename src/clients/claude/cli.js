/**
 * Claude Code CLI Client
 * Integration with Claude Code command-line interface (Sonnet 4.6)
 * Supports: interactive mode, batch processing, file operations, coding workflows
 */

import { BaseClient } from '../base-client.js';
import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, resolve, extname } from 'path';
import os from 'os';

export class ClaudeCliClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'claude',
      mode: 'cli',
      name: config.name || 'claude-sonnet-4.6'
    });
    this.process = null;
    this.messageQueue = [];
    this.responseBuffer = '';
    this.cliPath = config.cliPath || this._findCliPath();
    this.model = config.model || 'claude-sonnet-4-6';
    this.preferApi = false;
    this.contextWindow = 200000; // 200K context window for Sonnet 4.6
    this.projectContext = new Map(); // Project-wide context storage
    this.conversationHistory = [];
  }

  _notConfigured(message) {
    const error = new Error(message);
    error.code = 'NOT_CONFIGURED';
    return error;
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
          join(os.homedir(), 'AppData', 'Roaming', 'Anthropic', 'claude.cmd')
        ]
      : [
          'claude',
          '/usr/local/bin/claude',
          '/usr/bin/claude',
          '/opt/anthropic/claude',
          join(os.homedir(), '.local', 'bin', 'claude'),
          join(os.homedir(), '.npm-global', 'bin', 'claude'),
          join(os.homedir(), '.anthropic', 'bin', 'claude')
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
   * Check if command exists in PATH
   */
  _isInPath(cmd) {
    try {
      const platform = os.platform();
      execSync(platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async initialize() {
    this.status = 'initializing';
    
    try {
      if (this.preferApi) {
        throw this._notConfigured('Claude API billing fallback is disabled; use the CLI, VS Code, or desktop surface');
      }

      // Verify CLI is available
      execSync(`${this.cliPath} --version`, { stdio: 'pipe' });
      
      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      throw this._notConfigured(`Claude CLI not found or not working: ${error.message}`);
    }
  }

  /**
   * Verify API access
   */
  async _verifyApiAccess() {
    throw this._notConfigured('Claude metered API access is disabled in subscription-only release mode');
  }

  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Claude CLI client not connected');
    }

    if (this.preferApi) {
      throw this._notConfigured('Claude API billing fallback is disabled; use the CLI, VS Code, or desktop surface');
    }

    return this._sendViaCli(message, options);
  }

  /**
   * Send via Anthropic API
   */
  async _sendViaApi() {
    throw this._notConfigured('Claude API billing path is disabled; use the CLI, VS Code, or desktop surface');
  }

  /**
   * Send via CLI
   */
  async _sendViaCli(message, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 120000;
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
      args.push(message.content);

      const child = spawn(this.cliPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: options.cwd || process.cwd(),
        env: (() => {
          const env = { ...process.env };
          delete env.ANTHROPIC_API_KEY;
          return env;
        })()
      });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Claude CLI timeout after ${timeout}ms`));
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
   * Get system prompt based on context
   */
  _getSystemPrompt(options = {}) {
    const basePrompt = 'You are Claude, an AI assistant made by Anthropic.';
    
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

  async execute(task, options = {}) {
    // Build a structured command based on task type
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

  // ==================== CODING WORKFLOWS ====================

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

  /**
   * Multi-file analysis
   * @param {string[]} filePaths - Array of file paths
   * @param {Object} options - Analysis options
   */
  async analyzeMultipleFiles(filePaths, options = {}) {
    const files = [];
    const resolvedPaths = filePaths.map(p => resolve(p));

    for (const path of resolvedPaths) {
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf-8');
        files.push({ path, content, language: this._detectLanguage(path) });
      }
    }

    if (files.length === 0) {
      throw new Error('No valid files found to analyze');
    }

    let prompt = `Please analyze the following ${files.length} files as a cohesive system:\n\n`;

    for (const file of files) {
      prompt += `=== ${file.path} ===\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n`;
    }

    prompt += `Please provide:\n` +
      `1. System architecture overview\n` +
      `2. How these files interact\n` +
      `3. Data flow between components\n` +
      `4. Potential integration issues\n` +
      `5. Overall code quality assessment\n`;

    return this.send(
      { content: prompt },
      { ...options, context: 'analysis', maxTokens: options.maxTokens || 8192 }
    );
  }

  /**
   * Generate diff for code changes
   * @param {string} originalPath - Original file path
   * @param {string} modifiedPath - Modified file path (or content)
   * @param {Object} options - Diff options
   */
  async generateDiff(originalPath, modifiedPath, options = {}) {
    const original = existsSync(originalPath) 
      ? readFileSync(originalPath, 'utf-8')
      : originalPath;
    
    const modified = existsSync(modifiedPath)
      ? readFileSync(modifiedPath, 'utf-8')
      : modifiedPath;

    const language = this._detectLanguage(originalPath);

    const prompt = `Please review the following code changes and provide a summary:\n\n` +
      `Original:\n\`\`\`${language}\n${original}\n\`\`\`\n\n` +
      `Modified:\n\`\`\`${language}\n${modified}\n\`\`\`\n\n` +
      `Please provide:\n` +
      `1. Summary of changes\n` +
      `2. Potential impact\n` +
      `3. Any concerns or issues\n` +
      `4. Suggestions for improvement\n`;

    return this.send(
      { content: prompt },
      { ...options, maxTokens: options.maxTokens || 4096 }
    );
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

  /**
   * Get project context for prompts
   */
  getProjectContextPrompt(projectPath) {
    const context = this.projectContext.get(resolve(projectPath));
    if (!context) return '';

    let prompt = 'Project Context:\n';
    
    if (context.packageInfo) {
      prompt += `- Name: ${context.packageInfo.name}\n`;
      prompt += `- Description: ${context.packageInfo.description || 'N/A'}\n`;
      prompt += `- Version: ${context.packageInfo.version}\n`;
    }

    if (context.gitInfo) {
      prompt += `- Git Branch: ${context.gitInfo.branch}\n`;
      prompt += `- Last Commit: ${context.gitInfo.lastCommit}\n`;
    }

    prompt += `- Structure:\n${context.structure.map(s => `  - ${s}`).join('\n')}\n`;

    return prompt;
  }

  // ==================== INTERACTIVE MODE ====================

  /**
   * Start interactive chat session
   * @param {Object} options - Session options
   */
  async startInteractiveSession(options = {}) {
    const { createInterface } = await import('readline');
    
    console.log('\n🤖 Claude Sonnet 4.6 Interactive Mode\n');
    console.log('Type your message and press Enter. Type "exit" to quit, "clear" to clear history.\n');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'You> '
    });

    const session = {
      messages: [],
      startTime: Date.now()
    };

    rl.prompt();

    rl.on('line', async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        rl.prompt();
        return;
      }

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log('\n👋 Goodbye!');
        rl.close();
        return;
      }

      if (trimmed.toLowerCase() === 'clear') {
        session.messages = [];
        this.conversationHistory = [];
        console.log('History cleared.\n');
        rl.prompt();
        return;
      }

      if (trimmed.toLowerCase() === 'status') {
        console.log(`\nSession duration: ${Math.floor((Date.now() - session.startTime) / 1000)}s`);
        console.log(`Messages exchanged: ${session.messages.length}`);
        console.log(`Model: ${this.model}\n`);
        rl.prompt();
        return;
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
      rl.on('close', () => resolve(session));
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
    console.log(`\nBatch complete: ${successful}/${tasks.length} successful`);

    return {
      total: tasks.length,
      successful,
      failed: tasks.length - successful,
      results
    };
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Detect programming language from file extension
   */
  _detectLanguage(filePath) {
    const ext = extname(filePath).toLowerCase();
    const languageMap = {
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.r': 'r',
      '.m': 'matlab',
      '.sh': 'bash',
      '.bash': 'bash',
      '.ps1': 'powershell',
      '.sql': 'sql',
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.md': 'markdown',
      '.vue': 'vue',
      '.svelte': 'svelte',
      '.astro': 'astro',
      '.lua': 'lua',
      '.pl': 'perl',
      '.groovy': 'groovy',
      '.dart': 'dart',
      '.elm': 'elm',
      '.fs': 'fsharp',
      '.hs': 'haskell',
      '.erl': 'erlang',
      '.ex': 'elixir',
      '.clj': 'clojure',
      '.lisp': 'lisp',
      '.vim': 'vim',
      '.dockerfile': 'dockerfile',
      '.tf': 'terraform',
      '.hcl': 'hcl',
      '.proto': 'protobuf',
      '.graphql': 'graphql',
      '.prisma': 'prisma'
    };
    return languageMap[ext] || 'text';
  }

  getCapabilities() {
    return {
      provider: 'claude',
      mode: 'cli',
      model: this.model,
      contextWindow: this.contextWindow,
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
        'diff_generation'
      ],
      streaming: true,
      supportsFiles: true,
      supportsImages: true,
      supportsSystemPrompts: true,
      models: [
        'claude-sonnet-4-6',
        'claude-opus-4',
        'claude-haiku-3-5'
      ]
    };
  }

  async _doPing() {
    execSync(`${this.cliPath} --version`, { stdio: 'pipe' });
  }

  async disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.conversationHistory = [];
    this.projectContext.clear();
    await super.disconnect();
  }
}

export default ClaudeCliClient;
