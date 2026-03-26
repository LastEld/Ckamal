/**
 * Claude VSCode Extension Client
 * LSP-like integration with Anthropic Sonnet 4.6 VSCode Extension
 * Features: inline completion, intellisense, code actions, refactoring,
 *           diagnostics, CogniMesh task/roadmap integration
 */

import { BaseClient } from '../base-client.js';
import os from 'os';

/**
 * LSP Message Types
 */
const MessageType = Object.freeze({
  REQUEST: 'request',
  RESPONSE: 'response',
  NOTIFICATION: 'notification'
});

/**
 * Code annotation manager for CogniMesh integration
 */
class CodeAnnotationManager {
  constructor() {
    this.annotations = new Map();
  }

  addAnnotation(uri, annotation) {
    if (!this.annotations.has(uri)) {
      this.annotations.set(uri, []);
    }
    this.annotations.get(uri).push(annotation);
  }

  getAnnotationsForDocument(uri) {
    return this.annotations.get(uri) || [];
  }

  getAnnotationsAtPosition(uri, position) {
    const docAnnotations = this.annotations.get(uri) || [];
    return docAnnotations.filter(a => {
      if (!a.range) return false;
      return position.line >= a.range.start.line && position.line <= a.range.end.line;
    });
  }

  removeAnnotation(uri, annotationId) {
    const docAnnotations = this.annotations.get(uri) || [];
    this.annotations.set(uri, docAnnotations.filter(a => a.id !== annotationId));
  }
}

export class ClaudeVSCodeClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'claude',
      mode: 'vscode',
      name: config.name || 'Claude-Sonnet-4.6-VSCode'
    });

    this.config.mode = 'vscode';
    this.config.version = '4.6';
    this.port = config.port || 0;
    this.host = config.host || 'localhost';
    this.cacheTimeout = config.cacheTimeout || 60000;

    // Socket path based on platform
    this.socketPath = this._getSocketPath();

    // LSP state
    this.documentVersions = new Map();
    this.openDocuments = new Map();
    this.responseHandlers = new Map();
    this.notificationHandlers = new Map();
    this.completionCache = new Map();
    this.requestId = 0;

    // CogniMesh integration
    this.annotationManager = new CodeAnnotationManager();

    // Build client capabilities
    this.clientCapabilities = this._buildClientCapabilities();
  }

  _getSocketPath() {
    const platform = os.platform();
    switch (platform) {
      case 'win32':
        return '\\\\.\\pipe\\claude-vscode-' + process.pid;
      case 'darwin':
        return os.homedir() + '/Library/Application Support/Claude/vscode.sock';
      case 'linux':
      default:
        return os.homedir() + '/.config/claude/vscode.sock';
    }
  }

  _buildClientCapabilities() {
    return {
      workspace: {
        applyEdit: true,
        workspaceFolders: true,
        configuration: true
      },
      textDocument: {
        completion: {
          completionItem: {
            snippetSupport: true,
            commitCharactersSupport: true,
            documentationFormat: ['markdown', 'plaintext']
          }
        },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        definition: { linkSupport: true },
        references: { includeDeclaration: true },
        codeAction: {
          codeActionLiteralSupport: {
            codeActionKind: { valueSet: ['quickfix', 'refactor', 'source'] }
          }
        },
        rename: { prepareSupport: true },
        formatting: { dynamicRegistration: true },
        signatureHelp: { signatureInformation: { documentationFormat: ['markdown'] } },
        documentSymbol: { hierarchicalDocumentSymbolSupport: true }
      },
      cognimesh: {
        taskExtraction: true,
        roadmapIntegration: true,
        codeAnnotations: true
      }
    };
  }

  getCapabilities() {
    return {
      provider: 'claude',
      mode: 'vscode',
      version: '4.6',
      protocol: 'lsp-like',
      contextWindow: 200000,
      features: [
        'inline_completion',
        'intellisense',
        'hover_info',
        'code_actions',
        'quick_fixes',
        'refactoring',
        'rename_symbol',
        'go_to_definition',
        'find_references',
        'diagnostics',
        'cognimesh_tasks',
        'cognimesh_roadmaps',
        'cognimesh_annotations'
      ],
      streaming: true,
      supportsFiles: true,
      supportsEditorContext: true
    };
  }

  // ==================== LSP Document Management ====================

  async openDocument(uri, languageId, version, text) {
    this.openDocuments.set(uri, { uri, languageId, version, text });
    this.documentVersions.set(uri, version);
  }

  async changeDocument(uri, changes, version) {
    const doc = this.openDocuments.get(uri);
    if (doc && changes.length > 0) {
      doc.text = changes[changes.length - 1].text ?? doc.text;
      doc.version = version;
    }
    this.documentVersions.set(uri, version);
  }

  async closeDocument(uri) {
    this.openDocuments.delete(uri);
    this.documentVersions.delete(uri);
  }

  // ==================== IDE Features ====================

  async inlineCompletion(document, position, context) {
    return this._sendLspRequest('textDocument/inlineCompletion', { document, position, context });
  }

  async provideHover(document, position) {
    return this._sendLspRequest('textDocument/hover', { document, position });
  }

  async codeAction(document, range, context) {
    return this._sendLspRequest('textDocument/codeAction', { document, range, context });
  }

  async refactoring(document, range, operation) {
    return this._sendLspRequest('textDocument/refactoring', { document, range, operation });
  }

  async diagnostics(document) {
    return this._sendLspRequest('textDocument/diagnostics', { document });
  }

  async renameSymbol(document, position, newName) {
    return this._sendLspRequest('textDocument/rename', { document, position, newName });
  }

  async goToDefinition(document, position) {
    return this._sendLspRequest('textDocument/definition', { document, position });
  }

  async findAllReferences(document, position) {
    return this._sendLspRequest('textDocument/references', { document, position });
  }

  async formatDocument(document, options) {
    return this._sendLspRequest('textDocument/formatting', { document, options });
  }

  async formatRange(document, range, options) {
    return this._sendLspRequest('textDocument/rangeFormatting', { document, range, options });
  }

  async getSignatureHelp(document, position) {
    return this._sendLspRequest('textDocument/signatureHelp', { document, position });
  }

  async getDocumentSymbols(document) {
    return this._sendLspRequest('textDocument/documentSymbol', { document });
  }

  async searchWorkspaceSymbols(query) {
    return this._sendLspRequest('workspace/symbol', { query });
  }

  // ==================== Completion ====================

  _calculateConfidence(item, context) {
    let confidence = 0.5;
    const prefix = context.prefix || '';

    if (prefix && item.label.toLowerCase().startsWith(prefix.toLowerCase())) {
      confidence += 0.3;
    }

    if (item.documentation) {
      confidence -= 0.05;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  _calculateRelevance(item, context) {
    const label = item.label || '';

    if (/^use[A-Z]/.test(label)) return 'react';
    if (/^test|^describe|^it[A-Z]|^expect/.test(label)) return 'test';
    if (/^fetch|^get[A-Z].*Data|^load|^request/.test(label)) return 'async';
    return 'general';
  }

  _getCompletionContext(document, position) {
    const lines = document.text.split('\n');
    const currentLine = lines[position.line] || '';

    return {
      prefix: currentLine.substring(0, position.character),
      suffix: currentLine.substring(position.character),
      precedingLines: lines.slice(Math.max(0, position.line - 5), position.line).join('\n'),
      followingLines: lines.slice(position.line + 1, position.line + 5).join('\n'),
      languageId: document.languageId
    };
  }

  // ==================== Refactoring ====================

  _getRefactorKind(operation) {
    switch (operation) {
      case 'extract': return 'refactor.extract';
      case 'inline': return 'refactor.inline';
      case 'rewrite': return 'refactor.rewrite';
      case 'reorganize': return 'source.organizeImports';
      default: return 'refactor';
    }
  }

  // ==================== CogniMesh Integration ====================

  async createTaskFromCode(document, range, options = {}) {
    const text = this._getTextInRange(document, range);
    return { type: 'task', text, source: document.uri, range, ...options };
  }

  async linkToRoadmap(document, range, roadmapNodeId) {
    return { type: 'roadmap-link', source: document.uri, range, roadmapNodeId };
  }

  async addCodeAnnotation(document, range, annotation) {
    const id = `ann_${Date.now()}`;
    this.annotationManager.addAnnotation(document.uri, { id, range, ...annotation });
    return { id, range, ...annotation };
  }

  async extractContext(document, range) {
    const text = this._getTextInRange(document, range);
    return { text, uri: document.uri, range, languageId: document.languageId };
  }

  async getDocumentAnnotations(uri) {
    return this.annotationManager.getAnnotationsForDocument(uri);
  }

  async _getCognimeshCodeActions(document, range) {
    const actions = [];
    const text = this._getTextInRange(document, range);

    actions.push({
      title: 'Create CogniMesh Task from Selection',
      kind: 'cognimesh.createTask',
      command: 'cognimesh.createTask',
      arguments: [document.uri, range, text]
    });

    actions.push({
      title: 'Add CogniMesh Annotation',
      kind: 'cognimesh.addAnnotation',
      command: 'cognimesh.addAnnotation',
      arguments: [document.uri, range]
    });

    if (this._isRoadmapRelated(text)) {
      actions.push({
        title: 'Link to CogniMesh Roadmap',
        kind: 'cognimesh.linkRoadmap',
        command: 'cognimesh.linkRoadmap',
        arguments: [document.uri, range]
      });
    }

    return actions;
  }

  _isRoadmapRelated(text) {
    if (!text || typeof text !== 'string') return false;
    const keywords = ['roadmap', 'milestone', 'feature', 'phase', 'epic', 'sprint'];
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
  }

  // ==================== Diagnostics ====================

  async _getCognimeshDiagnostics(document) {
    const diagnostics = [];
    const lines = document.text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // TODO detection
      const todoMatch = line.match(/\/\/\s*TODO:\s*(.+)/i);
      if (todoMatch) {
        diagnostics.push({
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: `TODO: ${todoMatch[1].trim()}`,
          severity: 3, // Information
          code: 'cognimesh-todo',
          source: 'cognimesh'
        });
      }

      // FIXME detection
      const fixmeMatch = line.match(/\/\/\s*FIXME:\s*(.+)/i);
      if (fixmeMatch) {
        diagnostics.push({
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: `FIXME: ${fixmeMatch[1].trim()}`,
          severity: 2, // Warning
          code: 'cognimesh-fixme',
          source: 'cognimesh'
        });
      }

      // @roadmap link detection
      const roadmapMatch = line.match(/@roadmap\[([^\]]+)\]/);
      if (roadmapMatch) {
        diagnostics.push({
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: `Roadmap link: ${roadmapMatch[1]}`,
          severity: 4, // Hint
          code: 'cognimesh-roadmap',
          source: 'cognimesh'
        });
      }
    }

    return diagnostics;
  }

  // ==================== Utility ====================

  _getTextInRange(document, range) {
    const lines = document.text.split('\n');
    if (range.start.line === range.end.line) {
      return (lines[range.start.line] || '').substring(range.start.character, range.end.character);
    }

    const result = [];
    for (let i = range.start.line; i <= range.end.line; i++) {
      const line = lines[i] || '';
      if (i === range.start.line) {
        result.push(line.substring(range.start.character));
      } else if (i === range.end.line) {
        result.push(line.substring(0, range.end.character));
      } else {
        result.push(line);
      }
    }
    return result.join('\n');
  }

  onNotification(method, handler) {
    if (!this.notificationHandlers.has(method)) {
      this.notificationHandlers.set(method, []);
    }
    this.notificationHandlers.get(method).push(handler);
  }

  offNotification(method, handler) {
    const handlers = this.notificationHandlers.get(method);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  // ==================== Base Client ====================

  async send(message, options = {}) {
    if (!this.isConnected()) {
      throw new Error('Claude VSCode client not connected');
    }
    return this._sendLspRequest('textDocument/chat', { content: message.content, ...options });
  }

  async execute(task, options = {}) {
    switch (task.type) {
      case 'code-action':
        return this.codeAction(task.document, task.range, task.context);
      case 'refactor':
        return this.refactoring(task.document, task.range, task.operation);
      case 'format':
        return this.formatDocument(task.document, task.options);
      case 'complete':
        return this.inlineCompletion(task.document, task.position, task.context);
      default:
        return this._sendLspRequest('execute', { task, ...options });
    }
  }

  async _sendLspRequest(method, params) {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.responseHandlers.set(id, { resolve, reject });
      // In real implementation, this would send through socket
      // For non-connected state, reject after timeout
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`LSP request timeout: ${method}`));
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
    this.responseHandlers.clear();
    this.openDocuments.clear();
    this.documentVersions.clear();
    this.completionCache.clear();
    await super.disconnect();
  }

  async _doPing() {
    return { status: 'ok' };
  }
}

export default ClaudeVSCodeClient;
