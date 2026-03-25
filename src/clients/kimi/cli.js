/**
 * Kimi 2.5 CLI Client
 * Integration with Moonshot AI API and Kimi Code CLI
 * Features: 256K context, thinking mode, multimodal capabilities
 */

import { BaseClient } from '../base-client.js';
import { spawn } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import os from 'os';

export class KimiCliClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'kimi',
      mode: 'cli'
    });
    this.cliPath = config.cliPath || this._findCliPath();
    this.model = config.model || 'moonshot-v1-128k';
    this.maxContextTokens = 256000;
    this.preferApi = false;
    
    // Feature flags
    this.features = {
      thinkingMode: config.thinkingMode ?? true,
      multimodal: config.multimodal ?? true,
      longContext: config.longContext ?? true,
      chineseOptimization: config.chineseOptimization ?? true
    };
  }

  _notConfigured(message) {
    const error = new Error(message);
    error.code = 'NOT_CONFIGURED';
    return error;
  }

  /**
   * Find Kimi CLI executable
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

  async initialize() {
    this.status = 'initializing';

    try {
      if (this.preferApi) {
        throw this._notConfigured('Kimi API billing fallback is disabled; use the CLI or VS Code surface');
      }

      // Verify CLI availability
      const { execSync } = await import('child_process');
      execSync(`${this.cliPath} --version`, { stdio: 'pipe' });

      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      throw this._notConfigured(`Kimi CLI not found or not working: ${error.message}`);
    }
  }

  /**
   * Verify API access
   */
  async _verifyApiAccess() {
    throw this._notConfigured('Kimi metered API access is disabled in subscription-only release mode');
  }

  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Kimi CLI client not connected');
    }

    if (this.preferApi) {
      throw this._notConfigured('Kimi API billing fallback is disabled; use the CLI or VS Code surface');
    }

    return this._sendViaCli(message, options);
  }

  /**
   * Send via Moonshot API
   */
  async _sendViaApi() {
    throw this._notConfigured('Kimi API billing path is disabled; use the CLI or VS Code surface');
  }

  /**
   * Build a normalized message array for local prompt handling.
   */
  _buildMessages(message, options) {
    const messages = [];
    
    // System message
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    } else if (options.chinese) {
      messages.push({ 
        role: 'system', 
        content: '你是Kimi，一个由月之暗面科技有限公司开发的AI助手。请用中文回复。' 
      });
    } else {
      messages.push({ 
        role: 'system', 
        content: 'You are Kimi, an AI assistant developed by Moonshot AI.' 
      });
    }

    // Add context/messages history if provided
    if (options.messages) {
      messages.push(...options.messages);
    }

    // Current message
    if (typeof message === 'string') {
      messages.push({ role: 'user', content: message });
    } else if (message.content) {
      messages.push({ role: 'user', content: message.content });
    } else if (message.multimodal) {
      // Multimodal content
      messages.push({ 
        role: 'user', 
        content: message.multimodal 
      });
    }

    return messages;
  }

  async _sendViaCli(message, options) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 180000;
      const args = ['--print'];

      if (options.model) {
        args.push('--model', options.model);
      }

      // Thinking mode
      if (options.thinking || options.reasoning) {
        args.push('--thinking');
      }

      const content = typeof message === 'string' ? message : message.content;
      args.push(content);

      const child = spawn(this.cliPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: options.cwd || process.cwd(),
        env: (() => {
          const env = { ...process.env };
          delete env.MOONSHOT_API_KEY;
          delete env.KIMI_API_KEY;
          return env;
        })()
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

  async execute(task, options = {}) {
    const prompt = this._buildTaskPrompt(task);
    return this.send({ content: prompt }, options);
  }

  /**
   * Build task prompt
   */
  _buildTaskPrompt(task) {
    let prompt = '';

    if (task.description) {
      prompt += `Task: ${task.description}\n\n`;
    }

    if (task.code) {
      prompt += `Code:\n\`\`\`${task.language || ''}\n${task.code}\n\`\`\`\n\n`;
    }

    if (task.instructions) {
      prompt += `Instructions: ${task.instructions}\n`;
    }

    return prompt.trim();
  }

  // ============================================================================
  // ADVANCED FEATURES FOR KIMI 2.5
  // ============================================================================

  /**
   * Long Context Analysis - Analyze multiple files with 256K context window
   * @param {Array<{path: string, content?: string}>} files - Files to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async longContextAnalyze(files, options = {}) {
    if (!this.features.longContext) {
      throw new Error('Long context feature is disabled');
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('Files array is required');
    }

    // Load file contents
    const fileContents = [];
    let totalTokens = 0;

    for (const file of files) {
      try {
        let content = file.content;
        
        if (!content && file.path) {
          if (!existsSync(file.path)) {
            console.warn(`File not found: ${file.path}`);
            continue;
          }
          content = readFileSync(file.path, 'utf-8');
        }

        if (content) {
          const fileTokens = this._estimateTokens(content);
          
          // Check if adding this file would exceed context limit
          if (totalTokens + fileTokens > this.maxContextTokens * 0.9) {
            console.warn(`Skipping ${file.path}: would exceed context limit`);
            continue;
          }

          fileContents.push({
            path: file.path,
            name: file.path.split('/').pop(),
            content,
            tokens: fileTokens
          });
          totalTokens += fileTokens;
        }
      } catch (error) {
        console.warn(`Error reading file ${file.path}: ${error.message}`);
      }
    }

    if (fileContents.length === 0) {
      throw new Error('No valid files to analyze');
    }

    // Build analysis prompt
    const analysisType = options.analysisType || 'comprehensive';
    const prompt = this._buildLongContextPrompt(fileContents, analysisType, options);

    // Use appropriate model for long context
    const model = totalTokens > 120000 ? 'moonshot-v1-128k' : this.model;

    return this.send(
      { content: prompt },
      {
        ...options,
        model,
        maxTokens: options.maxTokens || 16384,
        system: options.system || this._getLongContextSystemPrompt(analysisType),
        contextCaching: totalTokens > 64000
      }
    );
  }

  /**
   * Build long context analysis prompt
   */
  _buildLongContextPrompt(files, analysisType, options) {
    let prompt = '';

    // Task description
    prompt += `# Long Context Analysis Task\n\n`;
    prompt += `Analysis Type: ${analysisType}\n`;
    prompt += `Files to analyze: ${files.length}\n`;
    prompt += `Total estimated tokens: ${files.reduce((sum, f) => sum + f.tokens, 0)}\n\n`;

    if (options.question) {
      prompt += `## Question/Focus\n${options.question}\n\n`;
    }

    if (options.instructions) {
      prompt += `## Instructions\n${options.instructions}\n\n`;
    }

    // File contents
    prompt += `## Files\n\n`;
    for (const file of files) {
      const ext = extname(file.path).slice(1) || 'txt';
      prompt += `### File: ${file.path}\n`;
      prompt += `\`\`\`${ext}\n${file.content}\n\`\`\`\n\n`;
    }

    // Analysis request
    prompt += `## Analysis Request\n\n`;
    prompt += this._getAnalysisRequest(analysisType, options);

    return prompt;
  }

  /**
   * Get analysis request based on type
   */
  _getAnalysisRequest(type, options) {
    const requests = {
      comprehensive: `Please provide a comprehensive analysis of all the provided files. Include:
1. Overall architecture and design patterns
2. Key components and their relationships
3. Code quality assessment
4. Potential issues or improvements
5. Documentation completeness`,

      refactor: `Please analyze the codebase and suggest refactoring opportunities:
1. Identify code duplication
2. Suggest extraction of common functionality
3. Recommend design pattern improvements
4. Identify tightly coupled components
5. Propose better organization`,

      review: `Please perform a code review:
1. Check for bugs and logical errors
2. Identify security issues
3. Review error handling
4. Assess performance implications
5. Verify adherence to best practices`,

      documentation: `Please analyze the code and generate documentation:
1. Module/API documentation
2. Function/method descriptions
3. Usage examples
4. Architecture overview
5. Setup/Installation guide`,

      dependencies: `Please analyze dependencies and imports:
1. Map all import relationships
2. Identify circular dependencies
3. Suggest dependency optimizations
4. Find unused dependencies
5. Recommend modularization`,

      custom: options.customPrompt || 'Please analyze the provided files.'
    };

    return requests[type] || requests.comprehensive;
  }

  /**
   * Get system prompt for long context analysis
   */
  _getLongContextSystemPrompt(analysisType) {
    const prompts = {
      comprehensive: 'You are an expert software architect. Provide thorough, well-structured analysis of codebases. Use markdown formatting.',
      refactor: 'You are a refactoring expert. Suggest concrete, actionable improvements with code examples.',
      review: 'You are a senior code reviewer. Be thorough but constructive in your feedback.',
      documentation: 'You are a technical writer. Create clear, comprehensive documentation.',
      dependencies: 'You are a dependency analysis expert. Map relationships and suggest optimizations.',
      custom: 'You are an expert software engineer. Provide detailed analysis and recommendations.'
    };

    return prompts[analysisType] || prompts.comprehensive;
  }

  /**
   * Thinking Mode - Enable deep reasoning for complex problems
   * @param {string} prompt - The prompt to think about
   * @param {Object} options - Thinking options
   * @returns {Promise<Object>} Thinking result with reasoning
   */
  async thinkingMode(prompt, options = {}) {
    if (!this.features.thinkingMode) {
      throw new Error('Thinking mode feature is disabled');
    }

    const thinkingPrompt = this._buildThinkingPrompt(prompt, options);
    
    return this.send(
      { content: thinkingPrompt },
      {
        ...options,
        thinking: true,
        reasoning: true,
        maxTokens: options.maxTokens || 16384,
        temperature: options.temperature ?? 0.3, // Lower temperature for reasoning
        system: options.system || `You are Kimi in thinking mode. Follow these guidelines:
1. Break down complex problems into steps
2. Show your reasoning process explicitly
3. Consider multiple approaches
4. Evaluate trade-offs
5. Provide well-justified conclusions

Use the following format:
<thinking>
[Your step-by-step reasoning]
</thinking>
<answer>
[Your final answer]
</answer>`
      }
    );
  }

  /**
   * Build thinking mode prompt
   */
  _buildThinkingPrompt(prompt, options) {
    let finalPrompt = '';

    if (options.context) {
      finalPrompt += `Context:\n${options.context}\n\n`;
    }

    finalPrompt += `Problem/Question:\n${prompt}\n\n`;

    if (options.constraints) {
      finalPrompt += `Constraints:\n${options.constraints}\n\n`;
    }

    if (options.examples) {
      finalPrompt += `Examples:\n${options.examples}\n\n`;
    }

    finalPrompt += `Please think through this problem step by step.`;

    return finalPrompt;
  }

  /**
   * Multimodal Analysis - Analyze images with text prompts
   * @param {string} imagePath - Path to image file
   * @param {string} prompt - Analysis prompt
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async multimodalAnalyze(imagePath, prompt, options = {}) {
    if (!this.features.multimodal) {
      throw new Error('Multimodal feature is disabled');
    }

    if (!existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    // Check file size
    const stats = statSync(imagePath);
    const maxSize = options.maxImageSize || 20 * 1024 * 1024; // 20MB default
    
    if (stats.size > maxSize) {
      throw new Error(`Image file too large: ${stats.size} bytes (max: ${maxSize})`);
    }

    // Read and encode image
    const imageBuffer = readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Determine MIME type
    const ext = extname(imagePath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    const mimeType = mimeTypes[ext] || 'image/png';

    // Build multimodal content
    const multimodalContent = [
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64Image}`,
          detail: options.detail || 'high' // high, low, or auto
        }
      },
      {
        type: 'text',
        text: prompt
      }
    ];

    return this.send(
      { multimodal: multimodalContent },
      {
        ...options,
        model: options.model || 'moonshot-v1-vision', // Use vision model if available
        maxTokens: options.maxTokens || 4096,
        system: options.system || 'You are a visual analysis expert. Describe what you see in detail.'
      }
    );
  }

  /**
   * Batch Multimodal Analysis - Analyze multiple images
   * @param {Array<{path: string, prompt?: string}>} images - Images to analyze
   * @param {string} globalPrompt - Global prompt for all images
   * @param {Object} options - Analysis options
   * @returns {Promise<Array>} Analysis results
   */
  async batchMultimodalAnalyze(images, globalPrompt, options = {}) {
    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('Images array is required');
    }

    const results = [];
    const concurrency = options.concurrency || 3;

    // Process in batches
    for (let i = 0; i < images.length; i += concurrency) {
      const batch = images.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (img) => {
        try {
          const prompt = img.prompt || globalPrompt;
          const result = await this.multimodalAnalyze(img.path, prompt, options);
          return { path: img.path, success: true, result };
        } catch (error) {
          return { path: img.path, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Delay between batches if requested
      if (options.batchDelay && i + concurrency < images.length) {
        await this._delay(options.batchDelay);
      }
    }

    return results;
  }

  /**
   * Chinese Optimization - Optimize code for Chinese language processing
   * @param {string} code - Code to optimize
   * @param {Object} options - Optimization options
   * @returns {Promise<Object>} Optimized code with explanations
   */
  async chineseOptimization(code, options = {}) {
    if (!this.features.chineseOptimization) {
      throw new Error('Chinese optimization feature is disabled');
    }

    const optimizationType = options.type || 'general';
    const prompt = this._buildChineseOptimizationPrompt(code, optimizationType, options);

    return this.send(
      { content: prompt },
      {
        ...options,
        chinese: true,
        maxTokens: options.maxTokens || 8192,
        temperature: options.temperature ?? 0.2,
        system: `你是代码优化专家，专注于中文处理和国际化支持。请提供：
1. 优化后的代码
2. 优化说明（中文）
3. 性能影响分析
4. 兼容性注意事项

输出格式：
## 优化后的代码
[代码]

## 优化说明
[说明]

## 性能影响
[分析]

## 兼容性
[注意事项]`
      }
    );
  }

  /**
   * Build Chinese optimization prompt
   */
  _buildChineseOptimizationPrompt(code, type, options) {
    let prompt = '';

    prompt += `## 待优化代码\n\n`;
    prompt += `\`\`\`${options.language || 'javascript'}\n${code}\n\`\`\`\n\n`;

    const typePrompts = {
      general: `请优化上述代码，特别关注以下方面：
1. 中文字符串处理效率
2. Unicode 支持
3. 文本编码兼容性
4. 正则表达式优化（中文匹配）
5. 字符串长度计算（考虑双字节字符）`,

      text_processing: `请优化文本处理代码，重点关注：
1. 中文分词效率
2. 字符边界检测
3. 文本截断（不断开汉字）
4. 全角/半角转换
5. 繁简转换优化`,

      search: `请优化搜索相关代码，关注：
1. 中文搜索引擎优化
2. 拼音索引支持
3. 模糊匹配算法
4. 同义词处理
5. 搜索结果排序`,

      display: `请优化显示相关代码，关注：
1. 中文字体渲染优化
2. 文本换行（CJK规则）
3. 文字对齐
4. 字号适配
5. 行高调整`,

      storage: `请优化存储相关代码，关注：
1. 数据库字符集设置
2. 字段长度计算
3. 索引优化
4. 编码转换
5. 压缩算法选择`,

      custom: options.customRequirements || '请根据需求优化代码。'
    };

    prompt += `## 优化要求\n\n${typePrompts[type] || typePrompts.general}\n\n`;

    if (options.requirements) {
      prompt += `## 额外要求\n\n${options.requirements}\n\n`;
    }

    if (options.targetLanguage) {
      prompt += `## 目标语言\n请将优化后的代码转换为 ${options.targetLanguage} 语言。\n\n`;
    }

    prompt += `请提供优化后的代码和详细说明。`;

    return prompt;
  }

  // ============================================================================
  // CODING FEATURES
  // ============================================================================

  /**
   * Batch Code Review - Review multiple files
   * @param {Array<string>} filePaths - Paths to files to review
   * @param {Object} options - Review options
   * @returns {Promise<Object>} Review results
   */
  async batchCodeReview(filePaths, options = {}) {
    return this.longContextAnalyze(
      filePaths.map(path => ({ path })),
      {
        ...options,
        analysisType: 'review',
        system: `You are a senior code reviewer. For each file, provide:
1. Overall quality score (1-10)
2. Critical issues (must fix)
3. Warnings (should fix)
4. Suggestions (could improve)
5. Positive observations

Format your review with clear sections and actionable feedback.`,
        maxTokens: options.maxTokens || 16384
      }
    );
  }

  /**
   * Multi-file Refactoring - Refactor across multiple files
   * @param {Array<{path: string, content?: string}>} files - Files to refactor
   * @param {string} goal - Refactoring goal
   * @param {Object} options - Refactoring options
   * @returns {Promise<Object>} Refactoring plan and suggestions
   */
  async multiFileRefactoring(files, goal, options = {}) {
    return this.longContextAnalyze(
      files,
      {
        ...options,
        analysisType: 'refactor',
        question: goal,
        instructions: `Provide a detailed refactoring plan including:
1. Step-by-step refactoring strategy
2. Code changes for each file
3. New files to create (if needed)
4. Tests to add/update
5. Migration steps
6. Risk assessment`,
        maxTokens: options.maxTokens || 16384
      }
    );
  }

  /**
   * Documentation Generation - Generate docs from code
   * @param {Array<{path: string, content?: string}>} files - Files to document
   * @param {Object} options - Documentation options
   * @returns {Promise<Object>} Generated documentation
   */
  async documentationGeneration(files, options = {}) {
    const docType = options.docType || 'api';
    
    return this.longContextAnalyze(
      files,
      {
        ...options,
        analysisType: 'documentation',
        system: this._getDocSystemPrompt(docType),
        maxTokens: options.maxTokens || 16384
      }
    );
  }

  /**
   * Get documentation system prompt
   */
  _getDocSystemPrompt(docType) {
    const prompts = {
      api: `Generate comprehensive API documentation including:
1. Module overview
2. Function/class signatures
3. Parameter descriptions
4. Return value details
5. Usage examples
6. Error handling

Use standard documentation format (JSDoc/Swagger/etc based on the code).`,

      readme: `Generate a comprehensive README.md including:
1. Project description
2. Installation instructions
3. Usage examples
4. API overview
5. Contributing guidelines
6. License information`,

      architecture: `Generate architecture documentation including:
1. System overview
2. Component diagrams (in text)
3. Data flow
4. Design patterns used
5. Technology stack
6. Deployment architecture`,

      custom: 'Generate documentation as specified by the user.'
    };

    return prompts[docType] || prompts.api;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Estimate token count
   */
  _estimateTokens(content) {
    if (typeof content === 'string') {
      // Rough estimation: ~4 chars per token for English, ~2 for Chinese
      const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
      const otherChars = content.length - chineseChars;
      return Math.ceil((chineseChars / 2) + (otherChars / 4));
    }
    
    if (Array.isArray(content)) {
      return content.reduce((sum, msg) => {
        if (typeof msg.content === 'string') {
          return sum + this._estimateTokens(msg.content);
        }
        return sum;
      }, 0);
    }
    
    return 0;
  }

  /**
   * Delay helper
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getCapabilities() {
    return {
      provider: 'kimi',
      mode: 'cli',
      contextWindow: this.maxContextTokens,
      features: [
        'long_context',
        'thinking_mode',
        'multimodal',
        'chinese_optimization',
        'batch_code_review',
        'multi_file_refactoring',
        'documentation_generation'
      ],
      featureFlags: { ...this.features },
      streaming: true,
      supportsFiles: true,
      supportsImages: this.features.multimodal,
      models: [
        'moonshot-v1-8k',
        'moonshot-v1-32k',
        'moonshot-v1-128k',
        'moonshot-v1-256k',
        'moonshot-v1-vision'
      ],
      maxImageSize: 20 * 1024 * 1024, // 20MB
      supportedImageFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
    };
  }

  async _doPing() {
    const { execSync } = await import('child_process');
    execSync(`${this.cliPath} --version`, { stdio: 'pipe' });
  }

  async disconnect() {
    await super.disconnect();
  }
}

export default KimiCliClient;
