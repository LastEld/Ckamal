/**
 * Kimi Native Client
 * Full integration with Moonshot AI API for 256K context, high-speed processing
 * 
 * Features:
 * - Native Moonshot API integration
 * - 256K context window management
 * - High-speed processing with streaming
 * - Multimodal support (images)
 * - Thinking mode for deep reasoning
 * - Chinese language optimization
 * - Batch code review (up to 50 files)
 * - Multi-file refactoring
 * - Documentation generation
 * 
 * @module models/kimi/kimi-client
 */

import { EventEmitter } from 'events';
import { createReadStream, readFileSync, existsSync, statSync } from 'fs';
import { extname, basename } from 'path';
import { Readable } from 'stream';

/**
 * Error types for Kimi client operations
 */
export class KimiError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'KimiError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export class KimiAuthError extends KimiError {
  constructor(message, details = {}) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'KimiAuthError';
  }
}

export class KimiRateLimitError extends KimiError {
  constructor(message, retryAfter, details = {}) {
    super(message, 'RATE_LIMIT', details);
    this.name = 'KimiRateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class KimiContextError extends KimiError {
  constructor(message, details = {}) {
    super(message, 'CONTEXT_ERROR', details);
    this.name = 'KimiContextError';
  }
}

/**
 * KimiClient - Native Moonshot AI API client
 * 
 * @extends EventEmitter
 * @example
 * const client = new KimiClient({ apiKey: 'your-api-key' });
 * await client.initialize();
 * const response = await client.send('Hello Kimi!');
 */
export class KimiClient extends EventEmitter {
  /**
   * Creates a new KimiClient instance
   * @param {Object} options - Client configuration options
   * @param {string} [options.apiKey] - Moonshot API key (defaults to MOONSHOT_API_KEY env var)
   * @param {string} [options.baseURL] - API base URL
   * @param {string} [options.model] - Default model to use
   * @param {number} [options.timeout] - Request timeout in milliseconds
   * @param {number} [options.maxRetries] - Maximum number of retries
   * @param {Object} [options.features] - Feature flags
   */
  constructor(options = {}) {
    super();

    this.apiKey = options.apiKey || process.env.MOONSHOT_API_KEY;
    this.baseURL = options.baseURL || 'https://api.moonshot.cn/v1';
    this.defaultModel = options.model || 'moonshot-v1-128k';
    this.timeout = options.timeout || 300000; // 5 minutes default for long context
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;

    // Context management
    this.maxContextTokens = 256000;
    this.contextCache = new Map();
    this.contextCacheSize = 0;
    this.maxCacheSize = 100 * 1024 * 1024; // 100MB cache

    // Feature flags
    this.features = {
      longContext: options.features?.longContext ?? true,
      thinkingMode: options.features?.thinkingMode ?? true,
      multimodal: options.features?.multimodal ?? true,
      chineseOptimization: options.features?.chineseOptimization ?? true,
      streaming: options.features?.streaming ?? true,
      contextCaching: options.features?.contextCaching ?? true
    };

    // Request tracking
    this.activeRequests = 0;
    this.maxConcurrentRequests = options.maxConcurrentRequests || 5;
    this.requestQueue = [];

    // Conversation tracking
    this.conversations = new Map();
    this.currentConversationId = null;

    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      averageLatency: 0,
      errors: 0
    };

    this._validateApiKey();
  }

  /**
   * Validates the API key
   * @private
   */
  _validateApiKey() {
    if (!this.apiKey) {
      throw new KimiAuthError(
        'MOONSHOT_API_KEY environment variable or apiKey option is required',
        { hint: 'Get your API key from https://platform.moonshot.cn' }
      );
    }

    if (this.apiKey.length < 32) {
      throw new KimiAuthError(
        'Invalid API key format. Key appears to be too short.',
        { hint: 'Ensure you are using a valid Moonshot API key' }
      );
    }
  }

  /**
   * Initialize the client
   */
  async initialize() {
    this.emit('initializing');

    try {
      // Verify API access by listing models
      await this._verifyApiAccess();
      
      this.emit('ready');
      return true;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Verify API access by listing available models
   * @private
   */
  async _verifyApiAccess() {
    const response = await this._makeRequest('/models', { method: 'GET' });
    
    if (!response.ok) {
      const error = await response.text();
      throw new KimiAuthError(`API verification failed: ${error}`);
    }

    const data = await response.json();
    this.availableModels = data.data?.map(m => m.id) || [];
    
    return data;
  }

  /**
   * Make an HTTP request with retry logic
   * @private
   */
  async _makeRequest(endpoint, options = {}, retryCount = 0) {
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After'), 10) || 60;
        
        if (retryCount < this.maxRetries) {
          await this._delay(retryAfter * 1000);
          return this._makeRequest(endpoint, options, retryCount + 1);
        }
        
        throw new KimiRateLimitError('Rate limit exceeded', retryAfter);
      }

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        throw new KimiAuthError('Invalid or expired API key', { status: response.status });
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new KimiError('Request timeout', 'TIMEOUT_ERROR', { timeout: this.timeout });
      }

      // Retry on network errors
      if (retryCount < this.maxRetries && this._isRetryableError(error)) {
        await this._delay(this.retryDelay * Math.pow(2, retryCount));
        return this._makeRequest(endpoint, options, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'];
    return retryableCodes.includes(error.code);
  }

  /**
   * Delay helper
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Acquire request slot for concurrency control
   * @private
   */
  async _acquireRequestSlot() {
    if (this.activeRequests < this.maxConcurrentRequests) {
      this.activeRequests++;
      return () => {
        this.activeRequests--;
        this._processQueue();
      };
    }

    return new Promise((resolve) => {
      this.requestQueue.push(resolve);
    });
  }

  /**
   * Process queued requests
   * @private
   */
  _processQueue() {
    if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      const next = this.requestQueue.shift();
      this.activeRequests++;
      next(() => {
        this.activeRequests--;
        this._processQueue();
      });
    }
  }

  /**
   * Send a message to Kimi
   * @param {string|Object} message - Message content or message object
   * @param {Object} options - Send options
   * @param {string} [options.model] - Model to use
   * @param {number} [options.temperature] - Sampling temperature (0-1)
   * @param {number} [options.maxTokens] - Maximum tokens in response
   * @param {boolean} [options.streaming] - Enable streaming response
   * @param {boolean} [options.thinking] - Enable thinking mode
   * @param {Array} [options.messages] - Previous messages for context
   * @param {string} [options.system] - System prompt
   * @returns {Promise<Object>} Response from Kimi
   */
  async send(message, options = {}) {
    const release = await this._acquireRequestSlot();
    const startTime = Date.now();

    try {
      this.metrics.totalRequests++;

      const messages = this._buildMessages(message, options);
      const model = options.model || this.defaultModel;
      
      // Estimate tokens and check context limit
      const estimatedTokens = this._estimateTokens(messages);
      if (estimatedTokens > this.maxContextTokens) {
        throw new KimiContextError(
          `Context too large: ${estimatedTokens} tokens (max: ${this.maxContextTokens})`,
          { estimatedTokens, maxTokens: this.maxContextTokens }
        );
      }

      const body = {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 8192,
        stream: options.streaming ?? this.features.streaming,
        ...(options.thinking && { reasoning: true })
      };

      // Use context caching for large contexts
      if (this.features.contextCaching && estimatedTokens > 64000) {
        body.context_caching = true;
      }

      const response = await this._makeRequest('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new KimiError(`API request failed: ${error}`, 'API_ERROR', { status: response.status });
      }

      // Handle streaming response
      if (body.stream) {
        return this._handleStreamingResponse(response, startTime);
      }

      const data = await response.json();
      
      // Update metrics
      const latency = Date.now() - startTime;
      this._updateMetrics(latency, data.usage?.total_tokens);

      this.emit('messageSent', {
        model: data.model,
        tokensUsed: data.usage?.total_tokens,
        latency,
        timestamp: new Date().toISOString()
      });

      return {
        content: data.choices[0]?.message?.content || '',
        reasoning: data.choices[0]?.message?.reasoning_content || null,
        usage: data.usage,
        model: data.model,
        id: data.id,
        latency
      };
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Handle streaming response
   * @private
   */
  async *_handleStreamingResponse(response, startTime) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let fullReasoning = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            const data = line.trim().slice(6);

            if (data === '[DONE]') {
              const latency = Date.now() - startTime;
              this._updateMetrics(latency, this._estimateTokens(fullContent));
              
              yield {
                type: 'done',
                content: fullContent,
                reasoning: fullReasoning,
                latency
              };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta;
              
              if (delta?.content) {
                fullContent += delta.content;
                yield {
                  type: 'content',
                  content: delta.content,
                  finishReason: parsed.choices[0]?.finish_reason
                };
              }
              
              if (delta?.reasoning_content) {
                fullReasoning += delta.reasoning_content;
                yield {
                  type: 'reasoning',
                  reasoning: delta.reasoning_content
                };
              }
            } catch (parseError) {
              this.emit('parseError', { line: data, error: parseError.message });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Build messages array for API
   * @private
   */
  _buildMessages(message, options) {
    const messages = [];

    // System message
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }

    // Previous messages
    if (options.messages) {
      messages.push(...options.messages);
    }

    // Current message
    if (typeof message === 'string') {
      messages.push({ role: 'user', content: message });
    } else if (message.content) {
      messages.push({ role: 'user', content: message.content });
    } else if (Array.isArray(message)) {
      // Multimodal content
      messages.push({ role: 'user', content: message });
    }

    return messages;
  }

  /**
   * Execute a task with structured input
   * @param {Object} task - Task definition
   * @param {string} task.description - Task description
   * @param {string} [task.code] - Code to process
   * @param {string} [task.language] - Programming language
   * @param {string} [task.instructions] - Additional instructions
   * @param {Object} options - Execution options
   */
  async execute(task, options = {}) {
    const prompt = this._buildTaskPrompt(task);
    return this.send(prompt, {
      ...options,
      temperature: options.temperature ?? 0.3
    });
  }

  /**
   * Build task prompt
   * @private
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
  // LONG CONTEXT ANALYSIS (256K)
  // ============================================================================

  /**
   * Long Context Analysis - Analyze multiple files with 256K context window
   * @param {Array<{path: string, content?: string}>} files - Files to analyze
   * @param {Object} options - Analysis options
   * @param {string} [options.analysisType] - Type of analysis (comprehensive, refactor, review, documentation, dependencies)
   * @param {string} [options.question] - Specific question to answer
   * @param {string} [options.instructions] - Additional instructions
   * @param {string} [options.system] - System prompt
   * @returns {Promise<Object>} Analysis result
   */
  async longContextAnalyze(files, options = {}) {
    if (!this.features.longContext) {
      throw new KimiError('Long context feature is disabled', 'FEATURE_DISABLED');
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new KimiError('Files array is required', 'INVALID_INPUT');
    }

    // Load and validate file contents
    const fileContents = await this._loadFiles(files);
    
    if (fileContents.length === 0) {
      throw new KimiError('No valid files to analyze', 'INVALID_INPUT');
    }

    // Build analysis prompt
    const analysisType = options.analysisType || 'comprehensive';
    const prompt = this._buildLongContextPrompt(fileContents, analysisType, options);

    // Select appropriate model based on content size
    const totalTokens = fileContents.reduce((sum, f) => sum + f.tokens, 0);
    const model = totalTokens > 120000 ? 'moonshot-v1-256k' : this.defaultModel;

    return this.send(prompt, {
      ...options,
      model,
      maxTokens: options.maxTokens || 16384,
      system: options.system || this._getLongContextSystemPrompt(analysisType),
      contextCaching: totalTokens > 64000
    });
  }

  /**
   * Load files and calculate tokens
   * @private
   */
  async _loadFiles(files) {
    const fileContents = [];
    let totalTokens = 0;

    for (const file of files) {
      try {
        let content = file.content;

        if (!content && file.path) {
          if (!existsSync(file.path)) {
            this.emit('warning', { message: `File not found: ${file.path}` });
            continue;
          }
          content = readFileSync(file.path, 'utf-8');
        }

        if (content) {
          const tokens = this._estimateTokens(content);

          // Skip if would exceed context limit
          if (totalTokens + tokens > this.maxContextTokens * 0.9) {
            this.emit('warning', { 
              message: `Skipping ${file.path}: would exceed context limit`,
              path: file.path,
              tokens
            });
            continue;
          }

          fileContents.push({
            path: file.path,
            name: basename(file.path),
            content,
            tokens,
            extension: extname(file.path).slice(1)
          });
          totalTokens += tokens;
        }
      } catch (error) {
        this.emit('warning', { 
          message: `Error reading file ${file.path}: ${error.message}`,
          path: file.path,
          error: error.message
        });
      }
    }

    return fileContents;
  }

  /**
   * Build long context analysis prompt
   * @private
   */
  _buildLongContextPrompt(files, analysisType, options) {
    let prompt = `# Long Context Analysis Task\n\n`;
    prompt += `Analysis Type: ${analysisType}\n`;
    prompt += `Files to analyze: ${files.length}\n`;
    prompt += `Total estimated tokens: ${files.reduce((sum, f) => sum + f.tokens, 0)}\n\n`;

    if (options.question) {
      prompt += `## Question/Focus\n${options.question}\n\n`;
    }

    if (options.instructions) {
      prompt += `## Instructions\n${options.instructions}\n\n`;
    }

    prompt += `## Files\n\n`;
    for (const file of files) {
      prompt += `### File: ${file.path}\n`;
      prompt += `\`\`\`${file.extension}\n${file.content}\n\`\`\`\n\n`;
    }

    prompt += `## Analysis Request\n\n`;
    prompt += this._getAnalysisRequest(analysisType, options);

    return prompt;
  }

  /**
   * Get analysis request based on type
   * @private
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
   * @private
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

  // ============================================================================
  // THINKING MODE
  // ============================================================================

  /**
   * Thinking Mode - Enable deep reasoning for complex problems
   * @param {string} prompt - The prompt to think about
   * @param {Object} options - Thinking options
   * @param {string} [options.context] - Additional context
   * @param {string} [options.constraints] - Constraints to consider
   * @param {string} [options.examples] - Examples to reference
   * @returns {Promise<Object>} Thinking result with reasoning
   */
  async thinkingMode(prompt, options = {}) {
    if (!this.features.thinkingMode) {
      throw new KimiError('Thinking mode feature is disabled', 'FEATURE_DISABLED');
    }

    const thinkingPrompt = this._buildThinkingPrompt(prompt, options);

    return this.send(thinkingPrompt, {
      ...options,
      thinking: true,
      maxTokens: options.maxTokens || 16384,
      temperature: options.temperature ?? 0.3,
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
    });
  }

  /**
   * Build thinking mode prompt
   * @private
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

  // ============================================================================
  // MULTIMODAL ANALYSIS
  // ============================================================================

  /**
   * Multimodal Analysis - Analyze images with text prompts
   * @param {string} imagePath - Path to image file or base64 data URL
   * @param {string} prompt - Analysis prompt
   * @param {Object} options - Analysis options
   * @param {string} [options.detail] - Detail level (high, low, auto)
   * @param {number} [options.maxImageSize] - Maximum image size in bytes
   * @returns {Promise<Object>} Analysis result
   */
  async multimodalAnalyze(imagePath, prompt, options = {}) {
    if (!this.features.multimodal) {
      throw new KimiError('Multimodal feature is disabled', 'FEATURE_DISABLED');
    }

    const imageContent = await this._prepareImageContent(imagePath, options);

    const multimodalContent = [
      imageContent,
      {
        type: 'text',
        text: prompt
      }
    ];

    return this.send(multimodalContent, {
      ...options,
      model: options.model || 'moonshot-v1-vision',
      maxTokens: options.maxTokens || 4096,
      system: options.system || 'You are a visual analysis expert. Describe what you see in detail.'
    });
  }

  /**
   * Prepare image content for API
   * @private
   */
  async _prepareImageContent(imagePath, options) {
    // Handle base64 data URLs
    if (imagePath.startsWith('data:')) {
      return {
        type: 'image_url',
        image_url: {
          url: imagePath,
          detail: options.detail || 'high'
        }
      };
    }

    // Handle file paths
    if (!existsSync(imagePath)) {
      throw new KimiError(`Image file not found: ${imagePath}`, 'FILE_NOT_FOUND');
    }

    const stats = statSync(imagePath);
    const maxSize = options.maxImageSize || 20 * 1024 * 1024; // 20MB default

    if (stats.size > maxSize) {
      throw new KimiError(
        `Image file too large: ${stats.size} bytes (max: ${maxSize})`,
        'FILE_TOO_LARGE'
      );
    }

    const imageBuffer = readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

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

    return {
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64Image}`,
        detail: options.detail || 'high'
      }
    };
  }

  /**
   * Batch Multimodal Analysis - Analyze multiple images
   * @param {Array<{path: string, prompt?: string}>} images - Images to analyze
   * @param {string} globalPrompt - Global prompt for all images
   * @param {Object} options - Analysis options
   * @param {number} [options.concurrency] - Number of concurrent requests
   * @param {number} [options.batchDelay] - Delay between batches in ms
   * @returns {Promise<Array>} Analysis results
   */
  async batchMultimodalAnalyze(images, globalPrompt, options = {}) {
    if (!Array.isArray(images) || images.length === 0) {
      throw new KimiError('Images array is required', 'INVALID_INPUT');
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

  // ============================================================================
  // CHINESE OPTIMIZATION
  // ============================================================================

  /**
   * Chinese Optimization - Optimize code for Chinese language processing
   * @param {string} code - Code to optimize
   * @param {Object} options - Optimization options
   * @param {string} [options.type] - Optimization type (general, text_processing, search, display, storage)
   * @param {string} [options.language] - Source language
   * @param {string} [options.targetLanguage] - Target language for conversion
   * @returns {Promise<Object>} Optimized code with explanations
   */
  async chineseOptimization(code, options = {}) {
    if (!this.features.chineseOptimization) {
      throw new KimiError('Chinese optimization feature is disabled', 'FEATURE_DISABLED');
    }

    const optimizationType = options.type || 'general';
    const prompt = this._buildChineseOptimizationPrompt(code, optimizationType, options);

    return this.send(prompt, {
      ...options,
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
    });
  }

  /**
   * Build Chinese optimization prompt
   * @private
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
   * Batch Code Review - Review multiple files (up to 50)
   * @param {Array<string>} filePaths - Paths to files to review
   * @param {Object} options - Review options
   * @param {number} [options.maxFiles] - Maximum number of files (default: 50)
   * @param {string} [options.focus] - Review focus (security, performance, style, all)
   * @returns {Promise<Object>} Review results
   */
  async batchCodeReview(filePaths, options = {}) {
    const maxFiles = options.maxFiles || 50;
    
    if (filePaths.length > maxFiles) {
      this.emit('warning', { 
        message: `Limiting review to ${maxFiles} files (requested: ${filePaths.length})`,
        requested: filePaths.length,
        limited: maxFiles
      });
      filePaths = filePaths.slice(0, maxFiles);
    }

    const focusPrompts = {
      security: 'Focus on security vulnerabilities, injection risks, and data protection.',
      performance: 'Focus on algorithm efficiency, memory usage, and optimization opportunities.',
      style: 'Focus on code style, naming conventions, and maintainability.',
      all: 'Provide comprehensive review covering all aspects.'
    };

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

${focusPrompts[options.focus] || focusPrompts.all}

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
6. Risk assessment

Ensure the refactoring maintains backward compatibility where possible.`,
        maxTokens: options.maxTokens || 16384
      }
    );
  }

  /**
   * Documentation Generation - Generate docs from code
   * @param {Array<{path: string, content?: string}>} files - Files to document
   * @param {Object} options - Documentation options
   * @param {string} [options.docType] - Documentation type (api, readme, architecture)
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
   * @private
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
   * @param {string|Array} content - Content to estimate
   * @returns {number} Estimated token count
   */
  _estimateTokens(content) {
    if (typeof content === 'string') {
      // Rough estimation: ~4 chars per token for English, ~2 for Chinese
      const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
      const otherChars = content.length - chineseChars;
      return Math.ceil((chineseChars / 2) + (otherChars / 4));
    }

    if (Array.isArray(content)) {
      return content.reduce((sum, item) => {
        if (typeof item.content === 'string') {
          return sum + this._estimateTokens(item.content);
        }
        if (Array.isArray(item.content)) {
          // Multimodal content
          return sum + item.content.reduce((s, c) => {
            if (c.type === 'text') return s + this._estimateTokens(c.text);
            return s + 256; // Estimate for images
          }, 0);
        }
        return sum;
      }, 0);
    }

    return 0;
  }

  /**
   * Update metrics
   * @private
   */
  _updateMetrics(latency, tokens) {
    this.metrics.totalTokens += tokens || 0;
    
    // Running average
    const n = this.metrics.totalRequests;
    this.metrics.averageLatency = 
      (this.metrics.averageLatency * (n - 1) + latency) / n;
  }

  /**
   * Get client capabilities
   * @returns {Object} Capabilities object
   */
  getCapabilities() {
    return {
      provider: 'kimi',
      contextWindow: this.maxContextTokens,
      features: [
        'long_context',
        'thinking_mode',
        'multimodal',
        'chinese_optimization',
        'batch_code_review',
        'multi_file_refactoring',
        'documentation_generation',
        'streaming',
        'context_caching'
      ],
      featureFlags: { ...this.features },
      models: [
        'moonshot-v1-8k',
        'moonshot-v1-32k',
        'moonshot-v1-128k',
        'moonshot-v1-256k',
        'moonshot-v1-vision'
      ],
      availableModels: this.availableModels || [],
      maxImageSize: 20 * 1024 * 1024, // 20MB
      supportedImageFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
      streaming: true,
      supportsFiles: true,
      supportsImages: this.features.multimodal
    };
  }

  /**
   * Get client metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length
    };
  }

  /**
   * Clear context cache
   */
  clearCache() {
    this.contextCache.clear();
    this.contextCacheSize = 0;
  }

  /**
   * Close the client and cleanup resources
   */
  async close() {
    this.clearCache();
    this.conversations.clear();
    this.requestQueue = [];
    this.activeRequests = 0;
    this.removeAllListeners();
  }
}

export default KimiClient;
