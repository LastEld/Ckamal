/**
 * Cursor IDE Client
 * Integration with Cursor editor
 */

import { BaseClient } from '../base-client.js';
import net from 'net';
import http from 'http';

export class CodexCursorClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'codex',
      mode: 'cursor'
    });
    this.port = config.port || 8443;
    this.host = config.host || 'localhost';
    this.socket = null;
    this.responseHandlers = new Map();
    this.requestId = 0;
    this.composerEnabled = config.composerEnabled ?? true;
  }

  async initialize() {
    this.status = 'initializing';

    try {
      // Check if Cursor is running
      await this._checkCursorHealth();

      // Connect to Cursor
      await this._connectSocket();

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
   * Check Cursor API health
   */
  _checkCursorHealth() {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${this.host}:${this.port}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Cursor not responding: ${res.statusCode}`));
        }
      });

      req.on('error', (error) => {
        reject(new Error(`Cursor IDE not running: ${error.message}`));
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Cursor health check timeout'));
      });
    });
  }

  /**
   * Connect to Cursor socket
   */
  _connectSocket() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Cursor socket connection timeout'));
      }, 10000);

      this.socket = net.connect({ port: this.port + 1, host: this.host });

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket.on('data', (data) => {
        this._handleData(data);
      });

      this.socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.socket.on('close', () => {
        this.updateHealth({ connected: false });
        this.emit('disconnected');
      });
    });
  }

  _handleData(data) {
    try {
      const lines = data.toString().split('\n').filter(Boolean);

      for (const line of lines) {
        const message = JSON.parse(line);

        if (message.id && this.responseHandlers.has(message.id)) {
          const { resolve, reject } = this.responseHandlers.get(message.id);
          this.responseHandlers.delete(message.id);

          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message);
          }
        } else if (message.type === 'progress') {
          this.emit('progress', message);
        } else if (message.type === 'notification') {
          this.emit('notification', message);
        }
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Cursor client not connected');
    }

    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 120000;

      this.responseHandlers.set(id, { resolve, reject });

      const payload = {
        id,
        type: 'chat',
        content: message.content,
        useComposer: options.useComposer ?? this.composerEnabled,
        context: options.context,
        options: {
          model: options.model,
          temperature: options.temperature
        }
      };

      this.socket.write(JSON.stringify(payload) + '\n');

      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Request timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  async execute(task, options = {}) {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 300000;

      this.responseHandlers.set(id, { resolve, reject });

      const payload = {
        id,
        type: 'task',
        task: {
          description: task.description,
          code: task.code,
          filePath: task.filePath,
          language: task.language,
          mode: task.mode || 'edit' // 'edit', 'generate', 'refactor'
        },
        useComposer: options.useComposer ?? this.composerEnabled
      };

      this.socket.write(JSON.stringify(payload) + '\n');

      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Task timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Use Cursor Composer for multi-file edits
   */
  async compose(instruction, files, options = {}) {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 300000;

      this.responseHandlers.set(id, { resolve, reject });

      const payload = {
        id,
        type: 'compose',
        instruction,
        files: files.map(f => ({
          path: f.path,
          content: f.content
        })),
        options: {
          autoApply: options.autoApply ?? false,
          reviewChanges: options.reviewChanges ?? true
        }
      };

      this.socket.write(JSON.stringify(payload) + '\n');

      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Composer timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Get inline completion at cursor position
   */
  async completeAtPosition(filePath, position, context, options = {}) {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 10000;

      this.responseHandlers.set(id, { resolve, reject });

      const payload = {
        id,
        type: 'complete',
        filePath,
        position: {
          line: position.line,
          character: position.character
        },
        context: {
          prefix: context.prefix,
          suffix: context.suffix,
          languageId: context.languageId
        }
      };

      this.socket.write(JSON.stringify(payload) + '\n');

      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error('Completion timeout'));
        }
      }, timeout);
    });
  }

  /**
   * Generate code from natural language
   */
  async generate(description, options = {}) {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 60000;

      this.responseHandlers.set(id, { resolve, reject });

      const payload = {
        id,
        type: 'generate',
        description,
        targetFile: options.targetFile,
        language: options.language,
        context: options.context
      };

      this.socket.write(JSON.stringify(payload) + '\n');

      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error('Generate timeout'));
        }
      }, timeout);
    });
  }

  /**
   * Explain selected code
   */
  async explain(selection, options = {}) {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 30000;

      this.responseHandlers.set(id, { resolve, reject });

      const payload = {
        id,
        type: 'explain',
        selection: {
          filePath: selection.filePath,
          startLine: selection.startLine,
          endLine: selection.endLine,
          text: selection.text
        }
      };

      this.socket.write(JSON.stringify(payload) + '\n');

      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error('Explain timeout'));
        }
      }, timeout);
    });
  }

  getCapabilities() {
    return {
      provider: 'codex',
      mode: 'cursor',
      contextWindow: 128000,
      features: [
        'chat',
        'inline_completion',
        'composer',
        'generate',
        'explain',
        'edit',
        'refactor'
      ],
      streaming: true,
      supportsFiles: true,
      supportsComposer: true,
      supportsEditorContext: true
    };
  }

  async _doPing() {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      this.responseHandlers.set(id, { resolve, reject });

      this.socket.write(JSON.stringify({ id, type: 'ping' }) + '\n');

      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error('Ping timeout'));
        }
      }, 5000);
    });
  }

  async disconnect() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.responseHandlers.clear();
    await super.disconnect();
  }
}
