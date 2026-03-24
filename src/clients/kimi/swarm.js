/**
 * Kimi Swarm Client
 * Agent swarm mode for parallel task execution
 */

import { BaseClient } from '../base-client.js';
import { EventEmitter } from 'events';

export class KimiSwarmClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'kimi',
      mode: 'swarm'
    });
    this.apiKey = config.apiKey || process.env.MOONSHOT_API_KEY;
    this.baseURL = config.baseURL || 'https://api.moonshot.cn/v1';
    this.maxAgents = config.maxAgents || 5;
    this.agents = new Map();
    this.taskQueue = [];
    this.results = new Map();
  }

  async initialize() {
    this.status = 'initializing';

    if (!this.apiKey) {
      throw new Error('Moonshot API key not provided for swarm mode');
    }

    try {
      await this._verifyApiAccess();

      // Initialize agent pool
      await this._initializeAgents();

      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      throw error;
    }
  }

  async _verifyApiAccess() {
    const response = await fetch(`${this.baseURL}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });

    if (!response.ok) {
      throw new Error(`API verification failed: ${response.statusText}`);
    }
  }

  /**
   * Initialize agent pool
   */
  async _initializeAgents() {
    for (let i = 0; i < this.maxAgents; i++) {
      const agent = new SwarmAgent({
        id: `agent-${i}`,
        apiKey: this.apiKey,
        baseURL: this.baseURL,
        model: this.config.model || 'moonshot-v1-128k'
      });

      agent.on('result', (result) => {
        this.emit('agentResult', { agentId: agent.id, result });
      });

      agent.on('error', (error) => {
        this.emit('agentError', { agentId: agent.id, error });
      });

      this.agents.set(agent.id, agent);
    }
  }

  async send(message, options = {}) {
    // In swarm mode, send creates a single-agent task
    return this.execute({
      type: 'single',
      description: message.content
    }, options);
  }

  /**
   * Execute tasks using swarm
   */
  async execute(task, options = {}) {
    if (task.type === 'swarm' || task.parallelAgents > 1) {
      return this._executeSwarm(task, options);
    }

    // Single agent execution
    const agent = this._getAvailableAgent();
    if (!agent) {
      throw new Error('No available agents in swarm');
    }

    return agent.execute(task, options);
  }

  /**
   * Execute tasks in parallel using multiple agents
   */
  async _executeSwarm(task, options) {
    const subtasks = task.subtasks || this._decomposeTask(task);
    const agentCount = Math.min(subtasks.length, this.maxAgents);
    const agents = this._getAvailableAgents(agentCount);

    if (agents.length === 0) {
      throw new Error('No available agents for swarm execution');
    }

    this.emit('swarmStart', {
      taskCount: subtasks.length,
      agentCount: agents.length
    });

    // Distribute tasks among agents
    const executions = subtasks.map((subtask, index) => {
      const agent = agents[index % agents.length];
      return agent.execute(subtask, options)
        .then(result => ({
          subtaskId: subtask.id,
          agentId: agent.id,
          success: true,
          result
        }))
        .catch(error => ({
          subtaskId: subtask.id,
          agentId: agent.id,
          success: false,
          error: error.message
        }));
    });

    const results = await Promise.all(executions);

    // Aggregate results
    const aggregated = this._aggregateResults(results, task.aggregateMode);

    this.emit('swarmComplete', {
      taskCount: subtasks.length,
      successCount: results.filter(r => r.success).length,
      results: aggregated
    });

    return aggregated;
  }

  /**
   * Decompose a complex task into subtasks
   */
  _decomposeTask(task) {
    // Simple decomposition strategy
    if (task.subtasks) {
      return task.subtasks.map((st, i) => ({
        id: `subtask-${i}`,
        description: st.description || st,
        type: st.type || 'general',
        code: st.code,
        dependencies: st.dependencies || []
      }));
    }

    // Default: treat as single task
    return [{
      id: 'subtask-0',
      description: task.description,
      type: task.type || 'general',
      code: task.code
    }];
  }

  /**
   * Aggregate swarm results
   */
  _aggregateResults(results, mode = 'merge') {
    switch (mode) {
      case 'merge':
        return {
          content: results
            .filter(r => r.success)
            .map(r => r.result.content || r.result)
            .join('\n\n---\n\n'),
          summary: {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
          }
        };

      case 'vote':
        // Voting aggregation for consensus tasks
        const votes = {};
        for (const r of results.filter(r => r.success)) {
          const key = JSON.stringify(r.result);
          votes[key] = (votes[key] || 0) + 1;
        }
        const winner = Object.entries(votes)
          .sort((a, b) => b[1] - a[1])[0];
        return {
          content: winner ? JSON.parse(winner[0]) : null,
          confidence: winner ? winner[1] / results.length : 0,
          summary: { votes }
        };

      case 'parallel':
        // Return all results separately
        return {
          results: results.map(r => ({
            success: r.success,
            result: r.success ? r.result : null,
            error: r.success ? null : r.error
          })),
          summary: {
            total: results.length,
            successful: results.filter(r => r.success).length
          }
        };

      default:
        return results;
    }
  }

  /**
   * Get an available agent
   */
  _getAvailableAgent() {
    for (const agent of this.agents.values()) {
      if (!agent.busy) {
        return agent;
      }
    }
    return null;
  }

  /**
   * Get multiple available agents
   */
  _getAvailableAgents(count) {
    const available = [];
    for (const agent of this.agents.values()) {
      if (!agent.busy) {
        available.push(agent);
        if (available.length >= count) break;
      }
    }
    return available;
  }

  getCapabilities() {
    return {
      provider: 'kimi',
      mode: 'swarm',
      contextWindow: 256000,
      features: ['parallel_execution', 'task_decomposition', 'result_aggregation'],
      streaming: false,
      supportsFiles: true,
      maxAgents: this.maxAgents,
      aggregationModes: ['merge', 'vote', 'parallel']
    };
  }

  async _doPing() {
    // Ping all agents
    await Promise.all(
      Array.from(this.agents.values()).map(agent => agent.ping())
    );
  }

  async disconnect() {
    for (const agent of this.agents.values()) {
      await agent.disconnect();
    }
    this.agents.clear();
    await super.disconnect();
  }
}

/**
 * Individual swarm agent
 */
class SwarmAgent extends EventEmitter {
  constructor(config) {
    super();
    this.id = config.id;
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.model = config.model;
    this.busy = false;
  }

  async execute(task, options) {
    this.busy = true;

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: options.model || this.model,
          messages: [
            {
              role: 'system',
              content: `You are Agent ${this.id} in a swarm. Focus on your assigned task.`
            },
            {
              role: 'user',
              content: this._buildPrompt(task)
            }
          ],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens || 2048
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const result = {
        content: data.choices[0]?.message?.content || '',
        usage: data.usage,
        agentId: this.id
      };

      this.emit('result', result);
      return result;
    } finally {
      this.busy = false;
    }
  }

  _buildPrompt(task) {
    let prompt = '';

    if (task.description) {
      prompt += `${task.description}\n\n`;
    }

    if (task.code) {
      prompt += `Code:\n\`\`\`\n${task.code}\n\`\`\`\n`;
    }

    return prompt.trim();
  }

  async ping() {
    const response = await fetch(`${this.baseURL}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });

    if (!response.ok) {
      throw new Error('Ping failed');
    }
  }

  async disconnect() {
    this.busy = false;
    this.removeAllListeners();
  }
}
