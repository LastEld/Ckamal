/**
 * GitHub Copilot X Client
 * Integration with GitHub Copilot API
 */

import { BaseClient } from '../base-client.js';
import { spawn } from 'child_process';

export class CodexCopilotClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'codex',
      mode: 'copilot'
    });
    this.token = config.token || process.env.GITHUB_TOKEN || process.env.GITHUB_COPILOT_TOKEN;
    this.apiEndpoint = config.apiEndpoint || 'https://api.githubcopilot.com';
    this.githubHost = config.githubHost || 'github.com';
    this.sessionId = null;
  }

  async initialize() {
    this.status = 'initializing';

    if (!this.token) {
      throw new Error('GitHub token not provided for Copilot');
    }

    try {
      await this._authenticate();
      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      throw error;
    }
  }

  /**
   * Authenticate with Copilot API
   */
  async _authenticate() {
    // Check token validity
    const response = await fetch(`https://api.${this.githubHost}/user`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub authentication failed: ${response.statusText}`);
    }

    // Initialize Copilot session
    const copilotResponse = await fetch(`${this.apiEndpoint}/v1/engines/copilot-codex/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Copilot-Integration-Id': 'vscode-chat'
      },
      body: JSON.stringify({
        prompt: '',
        max_tokens: 1
      })
    });

    // 400 is expected for empty prompt, but confirms auth works
    if (copilotResponse.status !== 400 && !copilotResponse.ok) {
      throw new Error(`Copilot API check failed: ${copilotResponse.statusText}`);
    }

    this.sessionId = crypto.randomUUID();
  }

  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Copilot client not connected');
    }

    // Copilot is primarily for completions, use chat endpoint if available
    return this._chat(message, options);
  }

  /**
   * Copilot chat endpoint
   */
  async _chat(message, options) {
    const response = await fetch(`${this.apiEndpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Copilot-Integration-Id': options.integrationId || 'vscode-chat',
        'X-Request-Id': crypto.randomUUID()
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: options.system || 'You are GitHub Copilot, an AI programming assistant.' },
          { role: 'user', content: message.content }
        ],
        model: options.model || 'gpt-4o-copilot',
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens || 4096,
        stream: options.streaming || false,
        top_p: 1,
        n: 1
      })
    });

    if (!response.ok) {
      throw new Error(`Copilot chat failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
      model: data.model,
      id: data.id
    };
  }

  async execute(task, options = {}) {
    const prompt = this._buildTaskPrompt(task);
    return this.send({ content: prompt }, options);
  }

  /**
   * Get inline completion
   */
  async complete(context, options = {}) {
    const response = await fetch(`${this.apiEndpoint}/v1/engines/copilot-codex/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Copilot-Integration-Id': 'vscode',
        'OpenAI-Organization': 'github-copilot',
        'X-Request-Id': crypto.randomUUID()
      },
      body: JSON.stringify({
        prompt: context.prefix,
        suffix: context.suffix,
        max_tokens: options.maxTokens || 256,
        temperature: options.temperature ?? 0.1,
        top_p: 1,
        n: options.n || 1,
        stop: options.stop || [],
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Copilot completion failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      choices: data.choices.map(c => ({
        text: c.text,
        index: c.index
      })),
      model: data.model
    };
  }

  /**
   * Build task prompt
   */
  _buildTaskPrompt(task) {
    let prompt = '';

    if (task.description) {
      prompt += `${task.description}\n\n`;
    }

    if (task.code) {
      prompt += `\`\`\`${task.language || ''}\n${task.code}\n\`\`\``;
    }

    return prompt.trim();
  }

  getCapabilities() {
    return {
      provider: 'codex',
      mode: 'copilot',
      contextWindow: 128000,
      features: ['inline_completion', 'chat', 'explanation', 'test_generation'],
      streaming: true,
      supportsFiles: true,
      requiresAuth: true,
      models: ['gpt-4o-copilot', 'copilot-codex']
    };
  }

  async _doPing() {
    const response = await fetch(`https://api.${this.githubHost}/user`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error('Copilot ping failed');
    }
  }

  async disconnect() {
    this.sessionId = null;
    await super.disconnect();
  }
}

import crypto from 'crypto';
