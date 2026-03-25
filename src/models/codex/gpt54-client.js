/**
 * @fileoverview GPT 5.4 Codex Native Client
 * @module models/codex/gpt54-client
 * 
 * Deep native integration with GPT 5.4 Codex (Advanced Reasoning):
 * - Native API implementation with 256K context
 * - Advanced reasoning with chain-of-thought
 * - Architecture design capabilities
 * - Complex multi-file refactoring
 * - Algorithm optimization
 * - Multimodal analysis (image + code)
 * - Performance and security analysis
 * - System design generation
 * 
 * Features:
 * - Streaming support with WebSocket
 * - Session management
 * - Cost tracking
 * - Context compression
 * - Checkpoint creation
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { GPT54Config } from './gpt54-config.js';

/**
 * Error types for GPT 5.4 Codex client
 */
export class GPT54ClientError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'GPT54ClientError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export class GPT54AuthError extends GPT54ClientError {
  constructor(message, details = {}) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'GPT54AuthError';
  }
}

export class GPT54RateLimitError extends GPT54ClientError {
  constructor(message, retryAfter, details = {}) {
    super(message, 'RATE_LIMIT', details);
    this.name = 'GPT54RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class GPT54ContextError extends GPT54ClientError {
  constructor(message, details = {}) {
    super(message, 'CONTEXT_ERROR', details);
    this.name = 'GPT54ContextError';
  }
}

/**
 * Reasoning modes for advanced analysis
 * @enum {string}
 */
export const ReasoningMode = {
  STANDARD: 'standard',
  ADVANCED: 'advanced',
  CHAIN_OF_THOUGHT: 'chain_of_thought',
  STEP_BY_STEP: 'step_by_step',
  COMPARATIVE: 'comparative',
  ANALYSIS: 'analysis',
  SYNTHESIS: 'synthesis',
};

/**
 * Task types for specialized processing
 * @enum {string}
 */
export const TaskType = {
  CODE_GENERATION: 'code_generation',
  CODE_REVIEW: 'code_review',
  REFACTORING: 'refactoring',
  ARCHITECTURE: 'architecture',
  DEBUGGING: 'debugging',
  OPTIMIZATION: 'optimization',
  DOCUMENTATION: 'documentation',
  TESTING: 'testing',
  SECURITY: 'security',
  PERFORMANCE: 'performance',
};

/**
 * GPT 5.4 Codex Native Client
 * Implements deep integration with GPT 5.4 Codex API
 * @extends EventEmitter
 */
export class GPT54Client extends EventEmitter {
  #config;
  #apiKey;
  #baseURL;
  #ws;
  #currentSession;
  #connectionState;
  #messageQueue;
  #heartbeatTimer;
  #reconnectAttempts;
  #streamCallbacks;
  #activeRequests;
  #requestQueue;
  #metrics;
  #checkpoints;
  
  /**
   * Connection states
   * @enum {string}
   */
  static ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    AUTHENTICATING: 'authenticating',
    READY: 'ready',
    ERROR: 'error',
    RECONNECTING: 'reconnecting',
  };
  
  /**
   * Creates a GPT54Client instance
   * @param {Object} options - Client options
   * @param {string} [options.apiKey] - OpenAI API key
   * @param {string} [options.baseURL] - API base URL
   * @param {string} [options.websocketUrl] - WebSocket URL
   * @param {Object} [options.config] - GPT54Config instance or options
   */
  constructor(options = {}) {
    super();
    
    this.#config = options.config instanceof GPT54Config 
      ? options.config 
      : new GPT54Config(options.config || {});
    
    this.#apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.#baseURL = options.baseURL || 'https://api.openai.com/v1';
    
    this.#ws = null;
    this.#currentSession = null;
    this.#connectionState = GPT54Client.ConnectionState.DISCONNECTED;
    this.#messageQueue = [];
    this.#heartbeatTimer = null;
    this.#reconnectAttempts = 0;
    this.#streamCallbacks = new Map();
    this.#activeRequests = 0;
    this.#requestQueue = [];
    this.#checkpoints = new Map();
    
    this.#metrics = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      errors: 0,
      reasoningTokens: 0,
    };
    
    this.#validateApiKey();
    this.#setupEventHandlers();
  }
  
  /**
   * Validates the API key
   * @private
   */
  #validateApiKey() {
    if (process.env.NODE_ENV !== 'test') {
      throw new GPT54ClientError(
        'GPT54Client is test-only; subscription-only runtime must use CLI or desktop surfaces',
        'NOT_CONFIGURED'
      );
    }

    if (!this.#apiKey) {
      throw new GPT54AuthError(
        'OPENAI_API_KEY environment variable or apiKey option is required',
        { hint: 'Get your API key from https://platform.openai.com' }
      );
    }
    
    if (this.#apiKey.length < 32) {
      throw new GPT54AuthError(
        'Invalid API key format. Key appears to be too short.',
        { hint: 'Ensure you are using a valid OpenAI API key' }
      );
    }
  }
  
  /**
   * Sets up internal event handlers
   * @private
   */
  #setupEventHandlers() {
    // Forward config events
    this.#config.on('cost:recorded', (data) => this.emit('cost:recorded', data));
    this.#config.on('budget:warning', (data) => this.emit('budget:warning', data));
    this.#config.on('budget:exceeded', (data) => this.emit('budget:exceeded', data));
  }
  
  // ==================== Connection Management ====================
  
  /**
   * Gets current connection state
   * @returns {string} Connection state
   */
  get connectionState() {
    return this.#connectionState;
  }
  
  /**
   * Checks if client is ready for requests
   * @returns {boolean} Whether client is ready
   */
  get isReady() {
    return this.#connectionState === GPT54Client.ConnectionState.READY;
  }
  
  /**
   * Gets current metrics
   * @returns {Object} Client metrics
   */
  get metrics() {
    return { ...this.#metrics };
  }
  
  /**
   * Initializes the client and establishes connection
   * @param {Object} options - Initialization options
   * @returns {Promise<void>}
   * @throws {GPT54ClientError} On connection failure
   */
  async initialize(options = {}) {
    if (this.isReady) {
      return;
    }
    
    this.#setConnectionState(GPT54Client.ConnectionState.CONNECTING);
    this.emit('initializing');
    
    try {
      // Verify API access
      await this.#verifyApiAccess();
      
      // Initialize session
      this.#currentSession = {
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
        messages: [],
        contextTokens: 0,
        metadata: options.sessionMetadata || {},
      };
      
      this.#setConnectionState(GPT54Client.ConnectionState.READY);
      this.#reconnectAttempts = 0;
      
      this.emit('initialized', { 
        sessionId: this.#currentSession.id,
        connectionState: this.#connectionState,
      });
      
    } catch (error) {
      this.#setConnectionState(GPT54Client.ConnectionState.ERROR);
      throw new GPT54ClientError(
        `Failed to initialize: ${error.message}`,
        'INIT_ERROR',
        { cause: error }
      );
    }
  }
  
  /**
   * Verifies API access by listing models
   * @private
   */
  async #verifyApiAccess() {
    const response = await this.#makeRequest('/models', { method: 'GET' });
    
    if (!response.ok) {
      const error = await response.text();
      throw new GPT54AuthError(`API verification failed: ${error}`);
    }
    
    const data = await response.json();
    this.availableModels = data.data?.map(m => m.id) || [];
    
    // Verify GPT-5.4-codex is available
    if (!this.availableModels.some(m => m.includes('gpt-5.4') || m.includes('codex'))) {
      this.emit('warning', { message: 'GPT 5.4 Codex model not found in available models' });
    }
    
    return data;
  }
  
  /**
   * Sets connection state and emits event
   * @private
   * @param {string} state - New state
   */
  #setConnectionState(state) {
    this.#connectionState = state;
    this.emit('state:change', state);
  }
  
  // ==================== HTTP Request Handling ====================
  
  /**
   * Makes an HTTP request with retry logic
   * @private
   */
  async #makeRequest(endpoint, options = {}, retryCount = 0) {
    const url = `${this.#baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeout = options.timeout || this.#config.getConfig().requestTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Client-Version': '5.4.0',
          ...options.headers,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After'), 10) || 60;
        
        if (retryCount < this.#config.getConfig().maxRetries) {
          await this.#delay(retryAfter * 1000);
          return this.#makeRequest(endpoint, options, retryCount + 1);
        }
        
        throw new GPT54RateLimitError('Rate limit exceeded', retryAfter);
      }
      
      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        throw new GPT54AuthError('Invalid or expired API key', { status: response.status });
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new GPT54ClientError('Request timeout', 'TIMEOUT_ERROR', { timeout });
      }
      
      // Retry on network errors
      if (retryCount < this.#config.getConfig().maxRetries && this.#isRetryableError(error)) {
        await this.#delay(this.#config.getConfig().retryDelay * Math.pow(2, retryCount));
        return this.#makeRequest(endpoint, options, retryCount + 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Checks if error is retryable
   * @private
   */
  #isRetryableError(error) {
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE'];
    return retryableCodes.includes(error.code);
  }
  
  /**
   * Delay helper
   * @private
   */
  #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Acquires request slot for concurrency control
   * @private
   */
  async #acquireRequestSlot() {
    const maxConcurrent = this.#config.getConfig().maxConcurrentRequests;
    
    if (this.#activeRequests < maxConcurrent) {
      this.#activeRequests++;
      return () => {
        this.#activeRequests--;
        this.#processQueue();
      };
    }
    
    return new Promise((resolve) => {
      this.#requestQueue.push(resolve);
    });
  }
  
  /**
   * Processes queued requests
   * @private
   */
  #processQueue() {
    const maxConcurrent = this.#config.getConfig().maxConcurrentRequests;
    
    if (this.#requestQueue.length > 0 && this.#activeRequests < maxConcurrent) {
      const next = this.#requestQueue.shift();
      this.#activeRequests++;
      next(() => {
        this.#activeRequests--;
        this.#processQueue();
      });
    }
  }
  
  // ==================== Core API Methods ====================
  
  /**
   * Sends a message to GPT 5.4 Codex
   * @param {string|Object} message - Message content or object
   * @param {Object} options - Send options
   * @param {string} [options.model] - Model to use
   * @param {number} [options.temperature] - Sampling temperature
   * @param {number} [options.maxTokens] - Maximum tokens in response
   * @param {boolean} [options.streaming] - Enable streaming
   * @param {boolean} [options.reasoning] - Enable reasoning mode
   * @param {string} [options.reasoningMode] - Reasoning mode type
   * @param {Array} [options.messages] - Previous messages for context
   * @param {string} [options.system] - System prompt
   * @returns {Promise<Object>} Response from GPT
   * @throws {GPT54ClientError} If not ready or request fails
   */
  async send(message, options = {}) {
    if (!this.isReady) {
      throw new GPT54ClientError('Client not initialized', 'NOT_READY');
    }
    
    const release = await this.#acquireRequestSlot();
    const startTime = Date.now();
    
    try {
      this.#metrics.totalRequests++;
      
      const messages = this.#buildMessages(message, options);
      const config = this.#config.getConfig();
      const model = options.model || config.modelId;
      
      // Estimate tokens and check context limit
      const estimatedTokens = this.#estimateTokens(messages);
      if (estimatedTokens > config.contextWindow) {
        throw new GPT54ContextError(
          `Context too large: ${estimatedTokens} tokens (max: ${config.contextWindow})`,
          { estimatedTokens, maxTokens: config.contextWindow }
        );
      }
      
      const body = {
        model,
        messages,
        temperature: options.temperature ?? config.temperature,
        max_tokens: options.maxTokens || config.maxOutputTokens,
        stream: options.streaming ?? config.streaming,
      };
      
      // Add reasoning if enabled
      if (options.reasoning || config.reasoningEnabled) {
        body.reasoning = {
          mode: options.reasoningMode || config.reasoningMode,
          effort: options.reasoningEffort || config.reasoningEffort,
        };
      }
      
      const response = await this.#makeRequest('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new GPT54ClientError(`API request failed: ${error}`, 'API_ERROR', { status: response.status });
      }
      
      // Handle streaming response
      if (body.stream) {
        return this.#handleStreamingResponse(response, startTime);
      }
      
      const data = await response.json();
      
      // Update metrics
      const latency = Date.now() - startTime;
      this.#updateMetrics(latency, data.usage);
      
      // Record cost
      this.#config.recordUsage(
        data.usage?.prompt_tokens || 0,
        data.usage?.completion_tokens || 0,
        this.#currentSession.id
      );
      
      // Add to session
      this.#addToSession(messages[messages.length - 1], data.choices[0]?.message);
      
      this.emit('messageSent', {
        model: data.model,
        tokensUsed: data.usage?.total_tokens,
        latency,
        timestamp: new Date().toISOString(),
      });
      
      return {
        content: data.choices[0]?.message?.content || '',
        reasoning: data.choices[0]?.message?.reasoning_content || null,
        usage: data.usage,
        model: data.model,
        id: data.id,
        latency,
      };
      
    } catch (error) {
      this.#metrics.errors++;
      this.emit('error', error);
      throw error;
    } finally {
      release();
    }
  }
  
  /**
   * Builds messages array for API
   * @private
   */
  #buildMessages(message, options) {
    const messages = [];
    
    // System message
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    
    // Previous messages
    if (options.messages) {
      messages.push(...options.messages);
    }
    
    // Session messages
    if (this.#currentSession?.messages.length > 0 && !options.skipSession) {
      messages.push(...this.#currentSession.messages.slice(-10));
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
   * Adds messages to session
   * @private
   */
  #addToSession(userMessage, assistantMessage) {
    if (!this.#currentSession) return;
    
    this.#currentSession.messages.push(userMessage);
    if (assistantMessage) {
      this.#currentSession.messages.push({
        role: 'assistant',
        content: assistantMessage.content,
      });
    }
    
    // Update token count
    this.#currentSession.contextTokens = this.#estimateTokens(this.#currentSession.messages);
  }
  
  /**
   * Estimates tokens from text
   * @private
   */
  #estimateTokens(messages) {
    if (!Array.isArray(messages)) {
      return Math.ceil(messages.length / 4);
    }
    
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += Math.ceil(msg.content.length / 4);
      } else if (Array.isArray(msg.content)) {
        // Multimodal
        for (const item of msg.content) {
          if (item.type === 'text') {
            total += Math.ceil(item.text.length / 4);
          } else if (item.type === 'image_url') {
            total += 1000; // Approximate for images
          }
        }
      }
    }
    return total;
  }
  
  /**
   * Handles streaming response
   * @private
   */
  async *#handleStreamingResponse(response, startTime) {
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
              this.#updateMetrics(latency, { total_tokens: this.#estimateTokens(fullContent) });
              
              yield {
                type: 'done',
                content: fullContent,
                reasoning: fullReasoning,
                latency,
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
                  finishReason: parsed.choices[0]?.finish_reason,
                };
              }
              
              if (delta?.reasoning_content) {
                fullReasoning += delta.reasoning_content;
                yield {
                  type: 'reasoning',
                  reasoning: delta.reasoning_content,
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
   * Updates metrics
   * @private
   */
  #updateMetrics(latency, usage) {
    const totalTokens = usage?.total_tokens || 0;
    this.#metrics.totalTokens += totalTokens;
    
    // Update average latency
    const n = this.#metrics.totalRequests;
    this.#metrics.averageLatency = ((this.#metrics.averageLatency * (n - 1)) + latency) / n;
    
    // Update reasoning tokens
    if (usage?.reasoning_tokens) {
      this.#metrics.reasoningTokens += usage.reasoning_tokens;
    }
  }
  
  /**
   * Executes a task with structured input
   * @param {Object} task - Task definition
   * @param {string} task.type - Task type
   * @param {string} task.description - Task description
   * @param {string} [task.code] - Code to process
   * @param {Array} [task.files] - Files to analyze
   * @param {string} [task.language] - Programming language
   * @param {string} [task.instructions] - Additional instructions
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Task result
   */
  async execute(task, options = {}) {
    const prompt = this.#buildTaskPrompt(task);
    const systemPrompt = this.#getSystemPromptForTask(task.type);
    
    return this.send(prompt, {
      ...options,
      system: options.system || systemPrompt,
      temperature: options.temperature ?? 0.3,
      reasoning: options.reasoning ?? true,
      reasoningMode: options.reasoningMode || ReasoningMode.CHAIN_OF_THOUGHT,
    });
  }
  
  /**
   * Builds task prompt
   * @private
   */
  #buildTaskPrompt(task) {
    let prompt = '';
    
    if (task.type) {
      prompt += `Task Type: ${task.type}\n\n`;
    }
    
    if (task.description) {
      prompt += `Description: ${task.description}\n\n`;
    }
    
    if (task.files && task.files.length > 0) {
      prompt += `Files:\n`;
      for (const file of task.files) {
        prompt += `\n--- ${file.path} ---\n`;
        prompt += file.content || '';
        prompt += '\n';
      }
      prompt += '\n';
    }
    
    if (task.code) {
      prompt += `Code:\n\`\`\`${task.language || ''}\n${task.code}\n\`\`\`\n\n`;
    }
    
    if (task.instructions) {
      prompt += `Instructions: ${task.instructions}\n`;
    }
    
    return prompt.trim();
  }
  
  /**
   * Gets system prompt for task type
   * @private
   */
  #getSystemPromptForTask(type) {
    const prompts = {
      [TaskType.CODE_GENERATION]: `You are an expert software developer using GPT 5.4 Codex. Generate high-quality, production-ready code with proper error handling, documentation, and tests.`,
      [TaskType.CODE_REVIEW]: `You are a senior code reviewer. Provide thorough, constructive feedback focusing on correctness, performance, security, and maintainability.`,
      [TaskType.REFACTORING]: `You are a refactoring expert. Suggest concrete improvements that enhance code quality while preserving functionality. Provide before/after comparisons.`,
      [TaskType.ARCHITECTURE]: `You are a software architect. Design scalable, maintainable systems with clear component boundaries and proper separation of concerns.`,
      [TaskType.DEBUGGING]: `You are a debugging specialist. Identify root causes, trace execution flows, and provide actionable fixes.`,
      [TaskType.OPTIMIZATION]: `You are a performance optimization expert. Identify bottlenecks and suggest specific optimizations with expected improvements.`,
      [TaskType.DOCUMENTATION]: `You are a technical writer. Create clear, comprehensive documentation with examples and proper formatting.`,
      [TaskType.TESTING]: `You are a testing specialist. Design comprehensive test suites covering unit, integration, and edge cases.`,
      [TaskType.SECURITY]: `You are a security analyst. Identify vulnerabilities and provide remediation strategies following security best practices.`,
      [TaskType.PERFORMANCE]: `You are a performance engineer. Analyze code for efficiency and suggest optimizations with quantified improvements.`,
    };
    
    return prompts[type] || prompts[TaskType.CODE_GENERATION];
  }
  
  // ==================== Advanced Reasoning ====================
  
  /**
   * Performs advanced reasoning with chain-of-thought
   * @param {string} prompt - The problem or question
   * @param {Object} options - Reasoning options
   * @param {string} [options.mode] - Reasoning mode
   * @param {string} [options.context] - Additional context
   * @param {string} [options.constraints] - Constraints to consider
   * @param {number} [options.steps] - Number of reasoning steps
   * @returns {Promise<Object>} Reasoning result with detailed analysis
   */
  async advancedReasoning(prompt, options = {}) {
    const mode = options.mode || ReasoningMode.CHAIN_OF_THOUGHT;
    const reasoningPrompt = this.#buildReasoningPrompt(prompt, mode, options);
    
    const systemPrompt = `You are GPT 5.4 Codex in advanced reasoning mode. Use ${mode} reasoning.

Follow these guidelines:
1. Break down complex problems systematically
2. Show your reasoning process explicitly
3. Consider multiple approaches and evaluate trade-offs
4. Provide well-justified conclusions
5. Highlight any assumptions or limitations

Use the following format:
<reasoning>
[Your detailed step-by-step reasoning]
</reasoning>
<conclusion>
[Your final answer/conclusion]
</conclusion>`;
    
    return this.send(reasoningPrompt, {
      ...options,
      reasoning: true,
      reasoningMode: mode,
      maxTokens: options.maxTokens || 16384,
      temperature: options.temperature ?? 0.3,
      system: options.system || systemPrompt,
    });
  }
  
  /**
   * Builds reasoning prompt based on mode
   * @private
   */
  #buildReasoningPrompt(prompt, mode, options) {
    let finalPrompt = '';
    
    if (options.context) {
      finalPrompt += `Context:\n${options.context}\n\n`;
    }
    
    finalPrompt += `Problem/Question:\n${prompt}\n\n`;
    
    if (options.constraints) {
      finalPrompt += `Constraints:\n${options.constraints}\n\n`;
    }
    
    const modeInstructions = {
      [ReasoningMode.CHAIN_OF_THOUGHT]: 'Think through this step by step, showing your reasoning process.',
      [ReasoningMode.STEP_BY_STEP]: 'Break this down into clear steps and solve each one systematically.',
      [ReasoningMode.COMPARATIVE]: 'Analyze multiple approaches, compare their pros and cons, then recommend the best solution.',
      [ReasoningMode.ANALYSIS]: 'Analyze this problem thoroughly, identifying all components and their relationships.',
      [ReasoningMode.SYNTHESIS]: 'Synthesize information from multiple perspectives to form a comprehensive solution.',
    };
    
    finalPrompt += modeInstructions[mode] || modeInstructions[ReasoningMode.CHAIN_OF_THOUGHT];
    
    return finalPrompt;
  }
  
  // ==================== Architecture Design ====================
  
  /**
   * Designs system architecture
   * @param {Object} requirements - Architecture requirements
   * @param {string} requirements.description - System description
   * @param {Array} [requirements.constraints] - Design constraints
   * @param {Array} [requirements.components] - Required components
   * @param {number} [requirements.scale] - Expected scale
   * @param {Object} options - Design options
   * @returns {Promise<Object>} Architecture design
   */
  async codeArchitecture(requirements, options = {}) {
    const prompt = this.#buildArchitecturePrompt(requirements);
    
    const systemPrompt = `You are an expert software architect using GPT 5.4 Codex. Design comprehensive system architectures.

Your architecture designs should include:
1. High-level system overview
2. Component breakdown with responsibilities
3. Data flow diagrams (described in text)
4. API specifications
5. Database schema recommendations
6. Scalability considerations
7. Security architecture
8. Deployment strategy

Use markdown formatting for clarity. Include Mermaid diagrams where applicable.`;
    
    return this.send(prompt, {
      ...options,
      reasoning: true,
      reasoningMode: ReasoningMode.ANALYSIS,
      maxTokens: options.maxTokens || 24000,
      temperature: options.temperature ?? 0.2,
      system: options.system || systemPrompt,
    });
  }
  
  /**
   * Builds architecture prompt
   * @private
   */
  #buildArchitecturePrompt(requirements) {
    let prompt = `# System Architecture Design Request\n\n`;
    
    prompt += `## Description\n${requirements.description}\n\n`;
    
    if (requirements.constraints?.length > 0) {
      prompt += `## Constraints\n`;
      for (const constraint of requirements.constraints) {
        prompt += `- ${constraint}\n`;
      }
      prompt += '\n';
    }
    
    if (requirements.components?.length > 0) {
      prompt += `## Required Components\n`;
      for (const component of requirements.components) {
        prompt += `- ${component}\n`;
      }
      prompt += '\n';
    }
    
    if (requirements.scale) {
      prompt += `## Expected Scale\n${requirements.scale}\n\n`;
    }
    
    if (requirements.existingCode) {
      prompt += `## Existing Code Context\n${requirements.existingCode}\n\n`;
    }
    
    prompt += `## Design Request\nPlease provide a comprehensive architecture design including:
1. System overview and architecture pattern
2. Component breakdown
3. Data flow
4. API design
5. Database schema
6. Security considerations
7. Deployment recommendations`;
    
    return prompt;
  }
  
  // ==================== Complex Refactoring ====================
  
  /**
   * Performs complex multi-file refactoring
   * @param {Array<{path: string, content: string}>} files - Files to refactor
   * @param {Object} options - Refactoring options
   * @param {string} [options.goal] - Refactoring goal
   * @param {string} [options.strategy] - Refactoring strategy
   * @param {boolean} [options.preserveBehavior] - Whether to preserve behavior
   * @returns {Promise<Object>} Refactoring plan and results
   */
  async complexRefactoring(files, options = {}) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new GPT54ClientError('Files array is required', 'INVALID_INPUT');
    }
    
    const prompt = this.#buildRefactoringPrompt(files, options);
    
    const systemPrompt = `You are a refactoring expert using GPT 5.4 Codex. Perform complex multi-file refactoring.

Your refactoring output should include:
1. Analysis of current code structure
2. Refactoring strategy and rationale
3. Step-by-step refactoring plan
4. Modified files with clear diffs
5. New files if needed
6. Tests to verify correctness
7. Migration guide

Use unified diff format for changes. Ensure all changes preserve existing functionality.`;
    
    return this.send(prompt, {
      ...options,
      reasoning: true,
      reasoningMode: ReasoningMode.STEP_BY_STEP,
      maxTokens: options.maxTokens || 24000,
      temperature: options.temperature ?? 0.2,
      system: options.system || systemPrompt,
    });
  }
  
  /**
   * Builds refactoring prompt
   * @private
   */
  #buildRefactoringPrompt(files, options) {
    let prompt = `# Complex Refactoring Request\n\n`;
    
    if (options.goal) {
      prompt += `## Goal\n${options.goal}\n\n`;
    }
    
    if (options.strategy) {
      prompt += `## Strategy\n${options.strategy}\n\n`;
    }
    
    prompt += `## Files to Refactor (${files.length})\n\n`;
    
    for (const file of files) {
      prompt += `### File: ${file.path}\n`;
      prompt += `\`\`\`\n${file.content}\n\`\`\`\n\n`;
    }
    
    prompt += `## Requirements\n`;
    prompt += `- Preserve existing behavior: ${options.preserveBehavior !== false ? 'Yes' : 'No'}\n`;
    if (options.targetPattern) {
      prompt += `- Target pattern: ${options.targetPattern}\n`;
    }
    if (options.technologies) {
      prompt += `- Technologies: ${options.technologies.join(', ')}\n`;
    }
    prompt += '\n';
    
    prompt += `## Output Format\nPlease provide:
1. Analysis of current structure
2. Proposed changes with unified diffs
3. Any new files needed
4. Test recommendations
5. Migration steps`;
    
    return prompt;
  }
  
  // ==================== Algorithm Design ====================
  
  /**
   * Designs and optimizes algorithms
   * @param {Object} spec - Algorithm specification
   * @param {string} spec.problem - Problem description
   * @param {string} [spec.input] - Input format
   * @param {string} [spec.output] - Output format
   * @param {Array} [spec.constraints] - Constraints
   * @param {Object} options - Design options
   * @returns {Promise<Object>} Algorithm design with complexity analysis
   */
  async algorithmDesign(spec, options = {}) {
    const prompt = this.#buildAlgorithmPrompt(spec);
    
    const systemPrompt = `You are an algorithms expert using GPT 5.4 Codex. Design and optimize algorithms.

Your algorithm designs should include:
1. Problem analysis and approach
2. Algorithm description with pseudocode
3. Implementation in requested language
4. Time and space complexity analysis
5. Proof of correctness (if applicable)
6. Edge cases and handling
7. Optimization strategies
8. Alternative approaches comparison

Provide clean, well-commented code with comprehensive test cases.`;
    
    return this.send(prompt, {
      ...options,
      reasoning: true,
      reasoningMode: ReasoningMode.COMPARATIVE,
      maxTokens: options.maxTokens || 16000,
      temperature: options.temperature ?? 0.2,
      system: options.system || systemPrompt,
    });
  }
  
  /**
   * Builds algorithm prompt
   * @private
   */
  #buildAlgorithmPrompt(spec) {
    let prompt = `# Algorithm Design Request\n\n`;
    
    prompt += `## Problem\n${spec.problem}\n\n`;
    
    if (spec.input) {
      prompt += `## Input Format\n${spec.input}\n\n`;
    }
    
    if (spec.output) {
      prompt += `## Output Format\n${spec.output}\n\n`;
    }
    
    if (spec.constraints?.length > 0) {
      prompt += `## Constraints\n`;
      for (const constraint of spec.constraints) {
        prompt += `- ${constraint}\n`;
      }
      prompt += '\n';
    }
    
    if (spec.targetComplexity) {
      prompt += `## Target Complexity\n${spec.targetComplexity}\n\n`;
    }
    
    if (spec.language) {
      prompt += `## Implementation Language\n${spec.language}\n\n`;
    }
    
    prompt += `## Deliverables\n1. Algorithm description
2. Pseudocode
3. Implementation
4. Complexity analysis
5. Test cases`;
    
    return prompt;
  }
  
  // ==================== Multimodal Analysis ====================
  
  /**
   * Performs multimodal analysis (image + code)
   * @param {string} imagePath - Path to image or base64 data URL
   * @param {string} code - Code to analyze alongside image
   * @param {string} prompt - Analysis prompt
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Multimodal analysis result
   */
  async multimodalAnalysis(imagePath, code, prompt, options = {}) {
    const imageContent = await this.#prepareImageContent(imagePath, options);
    
    let fullPrompt = prompt || 'Analyze the image and code together.';
    
    if (code) {
      fullPrompt += `\n\nCode:\n\`\`\`${options.language || ''}\n${code}\n\`\`\``;
    }
    
    const multimodalContent = [
      imageContent,
      { type: 'text', text: fullPrompt },
    ];
    
    return this.send(multimodalContent, {
      ...options,
      model: options.model || 'gpt-5.4-codex-vision',
      maxTokens: options.maxTokens || 4096,
      system: options.system || 'You are an expert at analyzing images and code together. Provide insights on UI/UX, code structure, and their relationship.',
    });
  }
  
  /**
   * Prepares image content for API
   * @private
   */
  async #prepareImageContent(imagePath, options) {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Handle base64 data URLs
    if (imagePath.startsWith('data:')) {
      return {
        type: 'image_url',
        image_url: { url: imagePath },
      };
    }
    
    // Handle file paths
    try {
      const stats = await fs.stat(imagePath);
      const maxSize = options.maxImageSize || 20 * 1024 * 1024; // 20MB
      
      if (stats.size > maxSize) {
        throw new GPT54ClientError(
          `Image file too large: ${stats.size} bytes (max: ${maxSize})`,
          'FILE_TOO_LARGE'
        );
      }
      
      const content = await fs.readFile(imagePath);
      const base64 = content.toString('base64');
      const ext = path.extname(imagePath).toLowerCase();
      
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
      };
      
      const mimeType = mimeTypes[ext] || 'image/png';
      
      return {
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64}` },
      };
    } catch (error) {
      if (error instanceof GPT54ClientError) throw error;
      throw new GPT54ClientError(
        `Failed to load image: ${error.message}`,
        'IMAGE_LOAD_ERROR',
        { path: imagePath }
      );
    }
  }
  
  // ==================== Performance Analysis ====================
  
  /**
   * Analyzes code for performance optimization
   * @param {string} code - Code to analyze
   * @param {Object} options - Analysis options
   * @param {string} [options.language] - Programming language
   * @param {string} [options.focus] - Focus area (cpu, memory, io, network)
   * @param {Object} [options.profiles] - Performance profiles
   * @returns {Promise<Object>} Performance analysis with recommendations
   */
  async performanceAnalysis(code, options = {}) {
    const prompt = this.#buildPerformancePrompt(code, options);
    
    const systemPrompt = `You are a performance optimization expert using GPT 5.4 Codex. Analyze code for performance bottlenecks.

Your analysis should include:
1. Time complexity analysis (Big O)
2. Space complexity analysis
3. Identified bottlenecks with line numbers
4. Specific optimization recommendations
5. Expected performance improvements
6. Benchmark suggestions
7. Memory usage analysis

Be specific and quantitative where possible.`;
    
    return this.send(prompt, {
      ...options,
      reasoning: true,
      reasoningMode: ReasoningMode.ANALYSIS,
      maxTokens: options.maxTokens || 12000,
      temperature: options.temperature ?? 0.2,
      system: options.system || systemPrompt,
    });
  }
  
  /**
   * Builds performance analysis prompt
   * @private
   */
  #buildPerformancePrompt(code, options) {
    let prompt = `# Performance Analysis Request\n\n`;
    
    prompt += `## Code\n\`\`\`${options.language || ''}\n${code}\n\`\`\`\n\n`;
    
    if (options.focus) {
      prompt += `## Focus Area\n${options.focus}\n\n`;
    }
    
    if (options.profiles) {
      prompt += `## Performance Profiles\n`;
      prompt += `- CPU usage: ${options.profiles.cpu || 'N/A'}\n`;
      prompt += `- Memory usage: ${options.profiles.memory || 'N/A'}\n`;
      prompt += `- I/O operations: ${options.profiles.io || 'N/A'}\n`;
      prompt += '\n';
    }
    
    if (options.constraints) {
      prompt += `## Constraints\n${options.constraints}\n\n`;
    }
    
    prompt += `## Analysis Request\nPlease provide:
1. Complexity analysis
2. Bottleneck identification
3. Optimization recommendations
4. Expected improvements
5. Benchmark suggestions`;
    
    return prompt;
  }
  
  // ==================== Security Analysis ====================
  
  /**
   * Performs security audit on code
   * @param {string} code - Code to audit
   * @param {Object} options - Audit options
   * @param {string} [options.language] - Programming language
   * @param {Array} [options.threatModel] - Threat model considerations
   * @param {boolean} [options.deepScan] - Enable deep scanning
   * @returns {Promise<Object>} Security analysis with vulnerabilities
   */
  async securityAnalysis(code, options = {}) {
    const prompt = this.#buildSecurityPrompt(code, options);
    
    const systemPrompt = `You are a security analyst using GPT 5.4 Codex. Perform comprehensive security audits.

Your security analysis should include:
1. Vulnerability identification (CVE-style)
2. Severity assessment (Critical/High/Medium/Low)
3. Affected code locations
4. Exploitation scenarios
5. Remediation recommendations
6. Secure code examples
7. Defense in depth suggestions
8. Compliance considerations (OWASP, etc.)

Be thorough and reference specific line numbers.`;
    
    return this.send(prompt, {
      ...options,
      reasoning: true,
      reasoningMode: ReasoningMode.ANALYSIS,
      maxTokens: options.maxTokens || 14000,
      temperature: options.temperature ?? 0.2,
      system: options.system || systemPrompt,
    });
  }
  
  /**
   * Builds security analysis prompt
   * @private
   */
  #buildSecurityPrompt(code, options) {
    let prompt = `# Security Analysis Request\n\n`;
    
    prompt += `## Code\n\`\`\`${options.language || ''}\n${code}\n\`\`\`\n\n`;
    
    if (options.threatModel?.length > 0) {
      prompt += `## Threat Model\n`;
      for (const threat of options.threatModel) {
        prompt += `- ${threat}\n`;
      }
      prompt += '\n';
    }
    
    prompt += `## Scan Depth\n${options.deepScan ? 'Deep scan enabled' : 'Standard scan'}\n\n`;
    
    if (options.context) {
      prompt += `## Application Context\n${options.context}\n\n`;
    }
    
    prompt += `## Analysis Request\nPlease provide:
1. Vulnerability findings with severity
2. Line numbers for each issue
3. Exploitation scenarios
4. Remediation code
5. Prevention recommendations`;
    
    return prompt;
  }
  
  // ==================== System Design ====================
  
  /**
   * Generates full system design document
   * @param {Object} spec - System specification
   * @param {string} spec.name - System name
   * @param {string} spec.description - System description
   * @param {Array} spec.requirements - Functional requirements
   * @param {Array} spec.nonFunctional - Non-functional requirements
   * @param {Object} options - Design options
   * @returns {Promise<Object>} Complete system design document
   */
  async systemDesign(spec, options = {}) {
    const prompt = this.#buildSystemDesignPrompt(spec);
    
    const systemPrompt = `You are a principal software architect using GPT 5.4 Codex. Create comprehensive system design documents.

Your system design should include:
1. Executive summary
2. Requirements analysis
3. Architecture overview and patterns
4. Component design (detailed)
5. Data model and storage
6. API specifications (OpenAPI style)
7. Security architecture
8. Scalability and performance design
9. Deployment architecture
10. Monitoring and observability
11. Disaster recovery
12. Cost estimates

Use professional architecture documentation standards. Include diagrams as text descriptions.`;
    
    return this.send(prompt, {
      ...options,
      reasoning: true,
      reasoningMode: ReasoningMode.SYNTHESIS,
      maxTokens: options.maxTokens || 32000,
      temperature: options.temperature ?? 0.2,
      system: options.system || systemPrompt,
    });
  }
  
  /**
   * Builds system design prompt
   * @private
   */
  #buildSystemDesignPrompt(spec) {
    let prompt = `# System Design Document Request\n\n`;
    
    prompt += `## System Name\n${spec.name}\n\n`;
    prompt += `## Description\n${spec.description}\n\n`;
    
    if (spec.requirements?.length > 0) {
      prompt += `## Functional Requirements\n`;
      for (let i = 0; i < spec.requirements.length; i++) {
        prompt += `${i + 1}. ${spec.requirements[i]}\n`;
      }
      prompt += '\n';
    }
    
    if (spec.nonFunctional?.length > 0) {
      prompt += `## Non-Functional Requirements\n`;
      for (let i = 0; i < spec.nonFunctional.length; i++) {
        prompt += `${i + 1}. ${spec.nonFunctional[i]}\n`;
      }
      prompt += '\n';
    }
    
    if (spec.constraints?.length > 0) {
      prompt += `## Constraints\n`;
      for (const constraint of spec.constraints) {
        prompt += `- ${constraint}\n`;
      }
      prompt += '\n';
    }
    
    if (spec.techStack) {
      prompt += `## Preferred Tech Stack\n${spec.techStack}\n\n`;
    }
    
    if (spec.scale) {
      prompt += `## Expected Scale\n${spec.scale}\n\n`;
    }
    
    prompt += `## Deliverables\nPlease create a comprehensive system design document covering all aspects mentioned in your instructions.`;
    
    return prompt;
  }
  
  // ==================== Session Management ====================
  
  /**
   * Creates a checkpoint of current session
   * @param {string} [label] - Checkpoint label
   * @returns {Object} Checkpoint data
   */
  createCheckpoint(label) {
    if (!this.#currentSession) {
      throw new GPT54ClientError('No active session', 'NO_SESSION');
    }
    
    const checkpoint = {
      id: `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      label: label || `Checkpoint ${this.#checkpoints.size + 1}`,
      timestamp: Date.now(),
      sessionId: this.#currentSession.id,
      messages: [...this.#currentSession.messages],
      contextTokens: this.#currentSession.contextTokens,
    };
    
    this.#checkpoints.set(checkpoint.id, checkpoint);
    this.emit('checkpoint:created', checkpoint);
    
    return checkpoint;
  }
  
  /**
   * Restores session from checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @returns {boolean} Whether restore succeeded
   */
  restoreCheckpoint(checkpointId) {
    if (!this.#currentSession) {
      throw new GPT54ClientError('No active session', 'NO_SESSION');
    }
    
    const checkpoint = this.#checkpoints.get(checkpointId);
    if (!checkpoint) {
      return false;
    }
    
    this.#currentSession.messages = [...checkpoint.messages];
    this.#currentSession.contextTokens = checkpoint.contextTokens;
    
    this.emit('checkpoint:restored', checkpoint);
    return true;
  }
  
  /**
   * Gets current session info
   * @returns {Object|null} Session info
   */
  getCurrentSession() {
    return this.#currentSession ? { ...this.#currentSession } : null;
  }
  
  /**
   * Gets all checkpoints
   * @returns {Array} Checkpoints
   */
  getCheckpoints() {
    return Array.from(this.#checkpoints.values());
  }
  
  // ==================== Cost and Metrics ====================
  
  /**
   * Gets usage statistics (token counts - billing handled by subscription)
   * @returns {Object} Usage statistics
   */
  getCostStats() {
    return this.#config.getUsageStats();
  }
  
  /**
   * Gets current metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    return { ...this.#metrics };
  }
  
  // ==================== Cleanup ====================
  
  /**
   * Closes the client and cleans up
   * @returns {Promise<void>}
   */
  async close() {
    if (this.#heartbeatTimer) {
      clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
    
    if (this.#ws) {
      this.#ws.close(1000, 'Client closing');
      this.#ws = null;
    }
    
    this.#currentSession = null;
    this.#checkpoints.clear();
    
    this.#setConnectionState(GPT54Client.ConnectionState.DISCONNECTED);
    this.emit('closed');
  }
}

/**
 * Creates a GPT54Client instance
 * @param {Object} options - Client options
 * @returns {GPT54Client} Client instance
 */
export function createGPT54Client(options = {}) {
  return new GPT54Client(options);
}

export default GPT54Client;
