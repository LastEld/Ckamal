/**
 * Claude MCP (Model Context Protocol) Client
 * Native MCP integration for Claude
 */

import { BaseClient } from '../base-client.js';
import { Client } from '@anthropic-ai/mcp';

export class ClaudeMcpClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'claude',
      mode: 'mcp'
    });
    this.mcpClient = null;
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseURL = config.baseURL || 'https://api.anthropic.com';
    this.model = config.model || 'claude-3-opus-20240229';
    this.maxTokens = config.maxTokens || 4096;
    this.tools = [];
    this.conversationHistory = [];
  }

  async initialize() {
    this.status = 'initializing';
    
    if (!this.apiKey) {
      throw new Error('Anthropic API key not provided');
    }

    try {
      this.mcpClient = new Client({
        apiKey: this.apiKey,
        baseURL: this.baseURL
      });

      // Verify connection with a simple request
      await this.mcpClient.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hello' }]
      });

      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      throw error;
    }
  }

  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Claude MCP client not connected');
    }

    const messages = [];

    // Add conversation history if enabled
    if (options.conversationId) {
      const history = this._getHistory(options.conversationId);
      messages.push(...history);
    }

    messages.push({
      role: 'user',
      content: message.content
    });

    const requestOptions = {
      model: options.model || this.model,
      max_tokens: options.maxTokens || this.maxTokens,
      messages,
      stream: options.streaming || false
    };

    // Add tools if specified
    if (options.tools || this.tools.length > 0) {
      requestOptions.tools = options.tools || this.tools;
    }

    // Add system prompt if provided
    if (options.system) {
      requestOptions.system = options.system;
    }

    try {
      let response;

      if (requestOptions.stream) {
        response = await this._handleStreamingRequest(requestOptions);
      } else {
        const result = await this.mcpClient.messages.create(requestOptions);
        response = this._formatResponse(result);
      }

      // Store in history
      if (options.conversationId) {
        this._addToHistory(options.conversationId, message.content, response.content);
      }

      return response;
    } catch (error) {
      throw new Error(`MCP request failed: ${error.message}`);
    }
  }

  /**
   * Handle streaming request
   */
  async _handleStreamingRequest(options) {
    const stream = await this.mcpClient.messages.create(options);
    let fullContent = '';
    let toolCalls = [];

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        if (chunk.delta.text) {
          fullContent += chunk.delta.text;
          this.emit('stream', { chunk: chunk.delta.text });
        }
      } else if (chunk.type === 'tool_use') {
        toolCalls.push(chunk);
        this.emit('toolUse', chunk);
      }
    }

    return {
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      streaming: true
    };
  }

  /**
   * Format MCP response to standard format
   */
  _formatResponse(result) {
    const content = result.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    const toolCalls = result.content
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: block.id,
        name: block.name,
        input: block.input
      }));

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: result.usage,
      model: result.model,
      id: result.id
    };
  }

  async execute(task, options = {}) {
    // Build structured task prompt
    const prompt = this._buildTaskPrompt(task);

    return this.send({ content: prompt }, {
      ...options,
      system: task.systemPrompt || options.system
    });
  }

  /**
   * Build task prompt from task definition
   */
  _buildTaskPrompt(task) {
    let prompt = '';

    if (task.description) {
      prompt += `# Task\n${task.description}\n\n`;
    }

    if (task.code) {
      prompt += `# Code\n\`\`\`${task.language || ''}\n${task.code}\n\`\`\`\n\n`;
    }

    if (task.files && task.files.length > 0) {
      prompt += '# Files\n';
      for (const file of task.files) {
        prompt += `\`\`\`${file.path}\n${file.content}\n\`\`\`\n\n`;
      }
    }

    if (task.instructions) {
      prompt += `# Instructions\n${task.instructions}\n`;
    }

    return prompt.trim();
  }

  /**
   * Register tools for function calling
   */
  registerTools(tools) {
    this.tools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.schema || tool.input_schema
    }));
  }

  /**
   * Call a tool with result
   */
  async callTool(toolUseId, result) {
    return this.send({
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result
      }]
    });
  }

  getCapabilities() {
    return {
      provider: 'claude',
      mode: 'mcp',
      contextWindow: 200000,
      features: ['tools', 'streaming', 'conversation_history', 'vision'],
      streaming: true,
      supportsFiles: true,
      supportsTools: true,
      supportsVision: true,
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']
    };
  }

  async _doPing() {
    await this.mcpClient.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }]
    });
  }

  _getHistory(conversationId) {
    return this.conversationHistory.filter(h => h.conversationId === conversationId)
      .flatMap(h => [
        { role: 'user', content: h.user },
        { role: 'assistant', content: h.assistant }
      ]);
  }

  _addToHistory(conversationId, user, assistant) {
    this.conversationHistory.push({ conversationId, user, assistant });
    
    // Limit history size per conversation
    const maxHistory = 20;
    const conversationHistory = this.conversationHistory
      .filter(h => h.conversationId === conversationId);
    
    if (conversationHistory.length > maxHistory) {
      const toRemove = conversationHistory.length - maxHistory;
      this.conversationHistory = this.conversationHistory.filter(
        h => h.conversationId !== conversationId || 
             conversationHistory.indexOf(h) >= toRemove
      );
    }
  }

  async disconnect() {
    this.mcpClient = null;
    this.conversationHistory = [];
    await super.disconnect();
  }
}
