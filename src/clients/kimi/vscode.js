/**
 * Kimi 2.5 VSCode Extension Client
 * IDE integration with Moonshot AI for code intelligence,
 * test generation, performance optimization, and security auditing
 */

import { BaseClient } from '../base-client.js';

export class KimiVSCodeClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'kimi',
      mode: 'vscode',
      name: config.name || 'Kimi-2.5-VSCode'
    });

    this.config.mode = 'vscode';
    this.port = config.port || 18123;
    this.host = config.host || 'localhost';
    this.contextWindow = 256000;
    this.languagePreference = config.language || 'auto';
    this.cogniMeshEnabled = config.cogniMeshEnabled ?? true;

    // Connection state
    this.socket = null;
    this.responseHandlers = new Map();
    this.requestId = 0;
  }

  getCapabilities() {
    return {
      provider: 'kimi',
      mode: 'vscode',
      contextWindow: this.contextWindow,
      features: [
        'inline_completion',
        'explain_selection',
        'generate_tests',
        'optimize_performance',
        'security_audit',
        'analyze_file_tree',
        'cross_file_references',
        'cogni_mesh_integration'
      ],
      streaming: true,
      supportsFiles: true,
      supportsGSD: true,
      supportsRoadmap: true,
      languagePreference: this.languagePreference
    };
  }

  // ==================== IDE Features ====================

  async inlineCompletion(document, position, context) {
    return this._sendRequest({ type: 'inlineCompletion', document, position, context });
  }

  async explainSelection(document, range, options = {}) {
    return this._sendRequest({ type: 'explainSelection', document, range, ...options });
  }

  async generateTests(document, range, options = {}) {
    return this._sendRequest({ type: 'generateTests', document, range, ...options });
  }

  async optimizePerformance(document, options = {}) {
    return this._sendRequest({ type: 'optimizePerformance', document, ...options });
  }

  async securityAudit(document, options = {}) {
    return this._sendRequest({ type: 'securityAudit', document, ...options });
  }

  // ==================== Kimi-Specific Features ====================

  async analyzeFileTree(rootPath, options = {}) {
    return this._sendRequest({ type: 'analyzeFileTree', rootPath, ...options });
  }

  async getCrossFileReferences(document, position, options = {}) {
    return this._sendRequest({ type: 'crossFileReferences', document, position, ...options });
  }

  // ==================== CogniMesh Integration ====================

  async createCogniMeshTask(taskData) {
    if (!this.cogniMeshEnabled) {
      throw new Error('CogniMesh integration is disabled');
    }
    return this._sendRequest({ type: 'cognimesh.createTask', ...taskData });
  }

  async integrateRoadmap(roadmapId, options = {}) {
    if (!this.cogniMeshEnabled) {
      throw new Error('CogniMesh integration is disabled');
    }
    return this._sendRequest({ type: 'cognimesh.integrateRoadmap', roadmapId, ...options });
  }

  async supportGSDWorkflow(workflowData) {
    if (!this.cogniMeshEnabled) {
      throw new Error('CogniMesh integration is disabled');
    }
    return this._sendRequest({ type: 'cognimesh.gsdWorkflow', ...workflowData });
  }

  // ==================== Context Management ====================

  _extractContextWindow(content, position) {
    const lines = content.split('\n');
    const cursorLine = position.line;
    const windowSize = 50;

    const prefixStart = Math.max(0, cursorLine - windowSize);
    const suffixEnd = Math.min(lines.length, cursorLine + windowSize + 1);

    return {
      prefix: lines.slice(prefixStart, cursorLine).join('\n'),
      suffix: lines.slice(cursorLine + 1, suffixEnd).join('\n'),
      cursorLine
    };
  }

  _detectTestFramework(languageId) {
    const frameworks = {
      javascript: 'jest',
      typescript: 'jest',
      python: 'pytest',
      java: 'junit',
      go: 'go-test',
      rust: 'cargo-test',
      ruby: 'rspec',
      csharp: 'nunit',
      php: 'phpunit'
    };
    return frameworks[languageId] || 'generic';
  }

  // ==================== Base Client ====================

  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Kimi VSCode client not connected');
    }
    return this._sendRequest({ type: 'chat', content: message.content, ...options });
  }

  async execute(task, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Kimi VSCode client not connected');
    }
    return this._sendRequest({ type: 'execute', task, ...options });
  }

  async _sendRequest(payload) {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.responseHandlers.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Request timeout: ${payload.type}`));
        }
      }, 5000);
    });
  }

  async initialize() {
    this.status = 'initializing';
    try {
      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      throw error;
    }
  }

  async disconnect() {
    if (this.socket) {
      this.socket = null;
    }
    this.responseHandlers.clear();
    await super.disconnect();
  }

  async _doPing() {
    return { status: 'ok' };
  }
}

export default KimiVSCodeClient;
