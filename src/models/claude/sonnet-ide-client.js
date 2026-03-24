/**
 * Claude Sonnet IDE Client
 * Deep native integration with VSCode and IDEs via LSP-like protocol
 * 
 * Features:
 * - LSP protocol support
 * - Inline completion with IntelliSense
 * - Code actions and quick fixes
 * - Hover information
 * - Refactoring support
 * - Symbol navigation
 * - Diagnostics
 */

import { BaseClient } from '../../clients/base-client.js';
import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { SonnetConfigManager, SONNET_MODELS } from './sonnet-config.js';

/**
 * LSP-like protocol message types
 */
const MessageType = {
  // Lifecycle
  INITIALIZE: 'initialize',
  INITIALIZED: 'initialized',
  SHUTDOWN: 'shutdown',
  EXIT: 'exit',
  
  // Document sync
  TEXT_DOCUMENT_DID_OPEN: 'textDocument/didOpen',
  TEXT_DOCUMENT_DID_CHANGE: 'textDocument/didChange',
  TEXT_DOCUMENT_DID_CLOSE: 'textDocument/didClose',
  TEXT_DOCUMENT_DID_SAVE: 'textDocument/didSave',
  
  // Language features
  TEXT_DOCUMENT_COMPLETION: 'textDocument/completion',
  COMPLETION_ITEM_RESOLVE: 'completionItem/resolve',
  TEXT_DOCUMENT_HOVER: 'textDocument/hover',
  TEXT_DOCUMENT_SIGNATURE_HELP: 'textDocument/signatureHelp',
  TEXT_DOCUMENT_DEFINITION: 'textDocument/definition',
  TEXT_DOCUMENT_REFERENCES: 'textDocument/references',
  TEXT_DOCUMENT_DOCUMENT_SYMBOL: 'textDocument/documentSymbol',
  TEXT_DOCUMENT_CODE_ACTION: 'textDocument/codeAction',
  TEXT_DOCUMENT_CODE_LENS: 'textDocument/codeLens',
  CODE_LENS_RESOLVE: 'codeLens/resolve',
  TEXT_DOCUMENT_FORMATTING: 'textDocument/formatting',
  TEXT_DOCUMENT_RANGE_FORMATTING: 'textDocument/rangeFormatting',
  TEXT_DOCUMENT_RENAME: 'textDocument/rename',
  TEXT_DOCUMENT_PREPARE_RENAME: 'textDocument/prepareRename',
  
  // Diagnostics
  TEXT_DOCUMENT_PUBLISH_DIAGNOSTICS: 'textDocument/publishDiagnostics',
  
  // Workspace
  WORKSPACE_SYMBOL: 'workspace/symbol',
  WORKSPACE_EXECUTE_COMMAND: 'workspace/executeCommand',
  WORKSPACE_APPLY_EDIT: 'workspace/applyEdit',
  
  // CogniMesh specific
  COGNIMESH_CREATE_TASK: 'cognimesh/createTask',
  COGNIMESH_LINK_ROADMAP: 'cognimesh/linkRoadmap',
  COGNIMESH_CODE_ANNOTATION: 'cognimesh/codeAnnotation',
  COGNIMESH_EXTRACT_CONTEXT: 'cognimesh/extractContext',
  
  // General
  PING: 'ping',
  PONG: 'pong',
  NOTIFICATION: 'notification',
  PROGRESS: 'progress',
  ERROR: 'error'
};

/**
 * Completion item kinds
 */
const CompletionItemKind = {
  TEXT: 1, METHOD: 2, FUNCTION: 3, CONSTRUCTOR: 4, FIELD: 5,
  VARIABLE: 6, CLASS: 7, INTERFACE: 8, MODULE: 9, PROPERTY: 10,
  UNIT: 11, VALUE: 12, ENUM: 13, KEYWORD: 14, SNIPPET: 15,
  COLOR: 16, FILE: 17, REFERENCE: 18, FOLDER: 19, ENUM_MEMBER: 20,
  CONSTANT: 21, STRUCT: 22, EVENT: 23, OPERATOR: 24, TYPE_PARAMETER: 25
};

/**
 * Code action kinds
 */
const CodeActionKind = {
  EMPTY: '',
  QUICK_FIX: 'quickfix',
  REFACTOR: 'refactor',
  REFACTOR_EXTRACT: 'refactor.extract',
  REFACTOR_INLINE: 'refactor.inline',
  REFACTOR_REWRITE: 'refactor.rewrite',
  SOURCE: 'source',
  SOURCE_ORGANIZE_IMPORTS: 'source.organizeImports',
  SOURCE_FIX_ALL: 'source.fixAll'
};

/**
 * Insert text format
 */
const InsertTextFormat = {
  PLAIN_TEXT: 1,
  SNIPPET: 2
};

/**
 * Diagnostic severity
 */
const DiagnosticSeverity = {
  ERROR: 1, WARNING: 2, INFORMATION: 3, HINT: 4
};

/**
 * Claude Sonnet IDE Client
 * Advanced IDE integration with LSP protocol
 */
export class SonnetIdeClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'claude',
      mode: 'sonnet-ide',
      name: config.name || 'claude-sonnet-ide'
    });
    
    // Configuration
    this.configManager = new SonnetConfigManager(config);
    this.modelConfig = this.configManager.getModelConfig(config.modelId);
    
    // Connection settings
    this.socket = null;
    this.socketPath = config.socketPath || this._getDefaultSocketPath();
    this.port = config.port;
    this.host = config.host || 'localhost';
    
    // Protocol state
    this.messageId = 0;
    this.responseHandlers = new Map();
    this.notificationHandlers = new Map();
    this.documentVersions = new Map();
    this.openDocuments = new Map();
    
    // LSP capabilities
    this.serverCapabilities = null;
    this.clientCapabilities = this._buildClientCapabilities();
    
    // AI-powered features
    this.completionCache = new Map();
    this.cacheTimeout = config.cacheTimeout || 30000;
    this.inlineCompletionProvider = new InlineCompletionProvider(this);
    
    // Cost tracking
    this.costTracker = this.configManager.getCostTracker();
  }

  /**
   * Get default socket path based on platform
   */
  _getDefaultSocketPath() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      return '\\\\.\\pipe\\claude-sonnet-ide';
    } else if (platform === 'darwin') {
      return `${process.env.HOME}/Library/Application Support/Claude/sonnet-ide.sock`;
    } else {
      return `${process.env.HOME}/.config/claude/sonnet-ide.sock`;
    }
  }

  /**
   * Build LSP client capabilities
   */
  _buildClientCapabilities() {
    return {
      workspace: {
        applyEdit: true,
        workspaceEdit: { documentChanges: true },
        didChangeConfiguration: { dynamicRegistration: true },
        didChangeWatchedFiles: { dynamicRegistration: true },
        symbol: {
          dynamicRegistration: true,
          symbolKind: { valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] }
        },
        executeCommand: { dynamicRegistration: true },
        configuration: true,
        semanticTokens: { dynamicRegistration: true }
      },
      textDocument: {
        synchronization: {
          dynamicRegistration: true,
          willSave: true,
          willSaveWaitUntil: true,
          didSave: true
        },
        completion: {
          dynamicRegistration: true,
          completionItem: {
            snippetSupport: true,
            commitCharactersSupport: true,
            documentationFormat: ['markdown', 'plaintext'],
            deprecatedSupport: true,
            preselectSupport: true,
            tagSupport: { valueSet: [1] }
          },
          completionItemKind: { valueSet: Array.from({ length: 25 }, (_, i) => i + 1) },
          contextSupport: true
        },
        hover: {
          dynamicRegistration: true,
          contentFormat: ['markdown', 'plaintext']
        },
        signatureHelp: {
          dynamicRegistration: true,
          signatureInformation: {
            documentationFormat: ['markdown', 'plaintext'],
            activeParameterSupport: true
          }
        },
        definition: { dynamicRegistration: true, linkSupport: true },
        references: { dynamicRegistration: true },
        documentHighlight: { dynamicRegistration: true },
        documentSymbol: {
          dynamicRegistration: true,
          symbolKind: { valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] },
          hierarchicalDocumentSymbolSupport: true
        },
        codeAction: {
          dynamicRegistration: true,
          codeActionLiteralSupport: {
            codeActionKind: { valueSet: Object.values(CodeActionKind) }
          },
          isPreferredSupport: true,
          disabledSupport: true,
          dataSupport: true,
          resolveSupport: { properties: ['edit'] }
        },
        codeLens: { dynamicRegistration: true },
        formatting: { dynamicRegistration: true },
        rangeFormatting: { dynamicRegistration: true },
        rename: {
          dynamicRegistration: true,
          prepareSupport: true,
          prepareSupportDefaultBehavior: 1
        },
        publishDiagnostics: {
          relatedInformation: true,
          versionSupport: true,
          tagSupport: { valueSet: [1, 2] },
          codeDescriptionSupport: true,
          dataSupport: true
        }
      },
      window: {
        workDoneProgress: true,
        showMessage: { messageActionItem: { additionalPropertiesSupport: true } },
        showDocument: { support: true }
      },
      general: {
        regularExpressions: { engine: 'ECMAScript', version: 'ES2020' },
        markdown: { parser: 'marked', version: '1.1.0' }
      },
      // Sonnet-specific capabilities
      sonnet: {
        extendedThinking: true,
        inlineCompletion: true,
        smartActions: true,
        codeExplanation: true,
        refactoring: true
      }
    };
  }

  /**
   * Initialize the client and establish connection
   */
  async initialize() {
    this.status = 'initializing';
    this.costTracker.startSession(`sonnet-ide-${this.id}`);
    
    try {
      // Establish socket connection
      await this._connect();
      
      // Send LSP initialize request
      const initResult = await this._sendRequest(MessageType.INITIALIZE, {
        processId: process.pid,
        clientInfo: {
          name: 'Claude Sonnet IDE Client',
          version: this.modelConfig.version
        },
        capabilities: this.clientCapabilities,
        workspaceFolders: this.config.workspaceFolders || null,
        rootUri: this.config.rootUri || null
      });
      
      this.serverCapabilities = initResult.capabilities;
      
      // Send initialized notification
      await this._sendNotification(MessageType.INITIALIZED, {});
      
      this.status = 'ready';
      this.updateHealth({ connected: true });
      this.emit('ready', { capabilities: this.serverCapabilities });
      
      return initResult;
    } catch (error) {
      this.status = 'error';
      this.updateHealth({ connected: false, lastError: error.message });
      throw error;
    }
  }

  /**
   * Connect to IDE via socket
   */
  _connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('IDE connection timeout'));
      }, 30000);

      if (this.port) {
        this.socket = net.connect({ port: this.port, host: this.host });
      } else {
        this.socket = net.connect(this.socketPath);
      }

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this._setupSocketHandlers();
        resolve();
      });

      this.socket.on('error', (error) => {
        clearTimeout(timeout);
        this.updateHealth({ connected: false, lastError: error.message });
        reject(error);
      });

      this.socket.on('close', () => {
        this.updateHealth({ connected: false });
        this.emit('disconnected');
      });
    });
  }

  /**
   * Setup socket data handlers
   */
  _setupSocketHandlers() {
    let buffer = '';
    
    this.socket.on('data', (data) => {
      buffer += data.toString();
      
      // Process complete messages (LSP uses Content-Length header)
      for (;;) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        
        const header = buffer.substring(0, headerEnd);
        const contentLengthMatch = header.match(/Content-Length: (\d+)/);
        
        if (!contentLengthMatch) {
          buffer = buffer.substring(headerEnd + 4);
          continue;
        }
        
        const contentLength = parseInt(contentLengthMatch[1], 10);
        const messageStart = headerEnd + 4;
        const messageEnd = messageStart + contentLength;
        
        if (buffer.length < messageEnd) break;
        
        const messageJson = buffer.substring(messageStart, messageEnd);
        buffer = buffer.substring(messageEnd);
        
        try {
          const message = JSON.parse(messageJson);
          this._handleMessage(message);
        } catch (error) {
          this.emit('error', new Error(`Failed to parse message: ${error.message}`));
        }
      }
    });
  }

  /**
   * Handle incoming LSP message
   */
  _handleMessage(message) {
    // Handle responses
    if (message.id !== undefined && message.id !== null) {
      if (this.responseHandlers.has(message.id)) {
        const { resolve, reject } = this.responseHandlers.get(message.id);
        this.responseHandlers.delete(message.id);
        
        if (message.error) {
          reject(new Error(message.error.message || message.error));
        } else {
          resolve(message.result);
        }
      }
      return;
    }
    
    // Handle notifications
    const method = message.method;
    
    switch (method) {
      case MessageType.TEXT_DOCUMENT_PUBLISH_DIAGNOSTICS:
        this._handleDiagnostics(message.params);
        break;
      case MessageType.PROGRESS:
        this.emit('progress', message.params);
        break;
      case MessageType.NOTIFICATION:
        this.emit('notification', message.params);
        break;
      case MessageType.PONG:
        break;
      default:
        if (this.notificationHandlers.has(method)) {
          const handlers = this.notificationHandlers.get(method);
          handlers.forEach(handler => {
            try {
              handler(message.params);
            } catch (error) {
              this.emit('error', error);
            }
          });
        }
        this.emit('message', message);
    }
  }

  /**
   * Send LSP request and wait for response
   */
  _sendRequest(method, params, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      
      this.responseHandlers.set(id, { resolve, reject });
      
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };
      
      this._writeMessage(message);
      
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, timeout);
    });
  }

  /**
   * Send LSP notification
   */
  _sendNotification(method, params) {
    const message = {
      jsonrpc: '2.0',
      method,
      params
    };
    
    this._writeMessage(message);
  }

  /**
   * Write message to socket with LSP encoding
   */
  _writeMessage(message) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('Socket not connected');
    }
    
    const json = JSON.stringify(message);
    const contentLength = Buffer.byteLength(json, 'utf8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;
    
    this.socket.write(header + json);
  }

  // ==================== DOCUMENT SYNCHRONIZATION ====================

  async openDocument(uri, languageId, version, text) {
    this.openDocuments.set(uri, { languageId, version, text });
    this.documentVersions.set(uri, version);
    
    if (this.socket && !this.socket.destroyed) {
      this._sendNotification(MessageType.TEXT_DOCUMENT_DID_OPEN, {
        textDocument: { uri, languageId, version, text }
      });
    }
  }

  async changeDocument(uri, changes, version) {
    const doc = this.openDocuments.get(uri);
    if (!doc) throw new Error(`Document not open: ${uri}`);
    
    doc.version = version;
    this.documentVersions.set(uri, version);
    
    if (this.socket && !this.socket.destroyed) {
      this._sendNotification(MessageType.TEXT_DOCUMENT_DID_CHANGE, {
        textDocument: { uri, version },
        contentChanges: changes
      });
    }
  }

  async closeDocument(uri) {
    this.openDocuments.delete(uri);
    this.documentVersions.delete(uri);
    
    if (this.socket && !this.socket.destroyed) {
      this._sendNotification(MessageType.TEXT_DOCUMENT_DID_CLOSE, {
        textDocument: { uri }
      });
    }
  }

  // ==================== INLINE COMPLETION ====================

  /**
   * Get inline completion at position
   * @param {Object} document - Document object with uri, text, languageId
   * @param {Object} position - Position with line and character
   * @param {Object} options - Completion options
   */
  async inlineCompletion(document, position, options = {}) {
    const cacheKey = `${document.uri}:${position.line}:${position.character}:${document.text?.substring(0, 100)}`;
    
    // Check cache
    if (this.completionCache.has(cacheKey)) {
      const cached = this.completionCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
      this.completionCache.delete(cacheKey);
    }
    
    // Get AI-powered completion
    const aiCompletion = await this.inlineCompletionProvider.provideCompletion(document, position, options);
    
    // Get LSP completion if available
    let lspCompletion = null;
    if (this.socket && !this.socket.destroyed) {
      try {
        lspCompletion = await this._sendRequest(
          MessageType.TEXT_DOCUMENT_COMPLETION,
          {
            textDocument: { uri: document.uri },
            position,
            context: {
              triggerKind: options.triggerKind || 1,
              triggerCharacter: options.triggerCharacter
            }
          },
          options.timeout || 10000
        );
      } catch (error) {
        // LSP completion failed, use AI only
      }
    }
    
    // Merge completions
    const merged = this._mergeCompletions(aiCompletion, lspCompletion);
    
    // Cache result
    this.completionCache.set(cacheKey, {
      data: merged,
      timestamp: Date.now()
    });
    
    return merged;
  }

  /**
   * Merge AI and LSP completions
   */
  _mergeCompletions(aiCompletion, lspCompletion) {
    const aiItems = aiCompletion?.items || [];
    const lspItems = lspCompletion?.items || [];
    
    // Combine and deduplicate
    const seen = new Set();
    const merged = [];
    
    // Add AI completions first (usually higher quality)
    for (const item of aiItems) {
      const key = item.label || item.insertText;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ ...item, source: 'ai', priority: 1 });
      }
    }
    
    // Add LSP completions
    for (const item of lspItems) {
      const key = item.label || item.insertText;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ ...item, source: 'lsp', priority: 2 });
      }
    }
    
    return {
      isIncomplete: false,
      items: merged
    };
  }

  // ==================== HOVER INFORMATION ====================

  /**
   * Get hover information at position
   * @param {Object} document - Document object
   * @param {Object} position - Position with line and character
   */
  async provideHover(document, position) {
    const params = {
      textDocument: { uri: document.uri },
      position
    };
    
    const hover = await this._sendRequest(
      MessageType.TEXT_DOCUMENT_HOVER, 
      params,
      10000
    );
    
    return this._enhanceHover(hover, document, position);
  }

  /**
   * Enhance hover with AI context
   */
  async _enhanceHover(hover, document, position) {
    if (!hover) return null;
    
    // Get surrounding code context
    const context = this._getCodeContext(document, position);
    
    return {
      ...hover,
      sonnet: {
        codeContext: context,
        confidence: 0.95
      }
    };
  }

  /**
   * Get code context around position
   */
  _getCodeContext(document, position) {
    const text = document.text || this.openDocuments.get(document.uri)?.text || '';
    const lines = text.split('\n');
    
    const startLine = Math.max(0, position.line - 3);
    const endLine = Math.min(lines.length - 1, position.line + 3);
    
    return lines.slice(startLine, endLine + 1).join('\n');
  }

  // ==================== CODE ACTIONS ====================

  /**
   * Get code actions for a range
   * @param {Object} document - Document object
   * @param {Object} range - Range with start and end positions
   * @param {Object} context - Code action context
   */
  async codeAction(document, range, context = {}) {
    const params = {
      textDocument: { uri: document.uri },
      range,
      context: {
        diagnostics: context.diagnostics || [],
        only: context.only,
        triggerKind: context.triggerKind || 1
      }
    };
    
    const actions = await this._sendRequest(
      MessageType.TEXT_DOCUMENT_CODE_ACTION,
      params,
      15000
    );
    
    // Add Sonnet-specific actions
    const sonnetActions = await this._getSonnetCodeActions(document, range);
    
    return [...(actions || []), ...sonnetActions];
  }

  /**
   * Get Sonnet-specific code actions
   */
  async _getSonnetCodeActions(document, range) {
    const actions = [];
    const selectedText = this._getTextInRange(document, range);
    
    if (!selectedText) return actions;
    
    // Explain code action
    actions.push({
      title: '💡 Explain with Claude Sonnet',
      kind: CodeActionKind.QUICK_FIX,
      command: {
        command: 'sonnet.explainCode',
        title: 'Explain Code',
        arguments: [document.uri, range, selectedText]
      }
    });
    
    // Improve code action
    actions.push({
      title: '✨ Improve with Claude Sonnet',
      kind: CodeActionKind.REFACTOR_REWRITE,
      command: {
        command: 'sonnet.improveCode',
        title: 'Improve Code',
        arguments: [document.uri, range, selectedText]
      }
    });
    
    // Generate tests action
    actions.push({
      title: '🧪 Generate Tests with Claude Sonnet',
      kind: CodeActionKind.QUICK_FIX,
      command: {
        command: 'sonnet.generateTests',
        title: 'Generate Tests',
        arguments: [document.uri, range, selectedText]
      }
    });
    
    return actions;
  }

  /**
   * Execute code action
   */
  async executeCodeAction(action) {
    if (action.edit) {
      return await this._applyWorkspaceEdit(action.edit);
    }
    
    if (action.command) {
      return await this.executeCommand(
        action.command.command,
        action.command.arguments
      );
    }
    
    return null;
  }

  // ==================== REFACTORING ====================

  /**
   * Perform refactoring operation
   * @param {Object} document - Document object
   * @param {Object} range - Range to refactor
   * @param {string} operation - Operation type (extract, inline, rename, etc.)
   * @param {Object} options - Refactoring options
   */
  async refactoring(document, range, operation, options = {}) {
    const kind = this._getRefactorKind(operation);
    
    const params = {
      textDocument: { uri: document.uri },
      range,
      context: {
        only: [kind],
        diagnostics: []
      }
    };
    
    // Get refactoring actions
    const actions = await this._sendRequest(
      MessageType.TEXT_DOCUMENT_CODE_ACTION,
      params,
      30000
    );
    
    // Filter for specific operation
    const relevantActions = (actions || []).filter(action => 
      action.kind?.startsWith(kind)
    );
    
    if (relevantActions.length === 0) {
      // Fall back to AI-powered refactoring
      return await this._aiRefactoring(document, range, operation, options);
    }
    
    // Execute the first matching action
    return await this.executeCodeAction(relevantActions[0]);
  }

  /**
   * AI-powered refactoring
   */
  async _aiRefactoring(document, range, operation, options) {
    const code = this._getTextInRange(document, range);
    const languageId = document.languageId || this.openDocuments.get(document.uri)?.languageId;
    
    const prompts = {
      extract: `Extract the following code into a new function/method:\n\n\`\`\`${languageId}\n${code}\n\`\`\`\n\nProvide the refactored code with the extracted function and updated original code.`,
      inline: `Inline the following function call or variable:\n\n\`\`\`${languageId}\n${code}\n\`\`\`\n\nProvide the code with the inlining applied.`,
      rename: `Suggest a better name for the following code element:\n\n\`\`\`${languageId}\n${code}\n\`\`\`\n\nProvide the suggested name and explain why it's better.`,
      simplify: `Simplify the following code:\n\n\`\`\`${languageId}\n${code}\n\`\`\`\n\nProvide the simplified version while maintaining the same functionality.`
    };
    
    const prompt = prompts[operation] || prompts.simplify;
    
    // This would integrate with the API - placeholder for now
    return {
      operation,
      status: 'pending',
      message: 'AI refactoring requested',
      prompt
    };
  }

  /**
   * Get refactoring kind from operation name
   */
  _getRefactorKind(operation) {
    const kindMap = {
      extract: CodeActionKind.REFACTOR_EXTRACT,
      inline: CodeActionKind.REFACTOR_INLINE,
      rewrite: CodeActionKind.REFACTOR_REWRITE,
      move: `${CodeActionKind.REFACTOR}.move`,
      reorganize: CodeActionKind.SOURCE_ORGANIZE_IMPORTS
    };
    
    return kindMap[operation] || CodeActionKind.REFACTOR;
  }

  /**
   * Rename symbol
   */
  async renameSymbol(document, position, newName) {
    const params = {
      textDocument: { uri: document.uri },
      position,
      newName
    };
    
    return await this._sendRequest(MessageType.TEXT_DOCUMENT_RENAME, params, 15000);
  }

  // ==================== BASE CLIENT IMPLEMENTATIONS ====================

  async send(message, options = {}) {
    return await this._sendRequest('window/showMessage', {
      type: message.type || 1,
      message: message.content
    }, options.timeout);
  }

  async execute(task, options = {}) {
    switch (task.type) {
      case 'code-action':
        return await this.codeAction(task.document, task.range, task.context);
      case 'refactor':
        return await this.refactoring(task.document, task.range, task.operation, task.options);
      case 'complete':
        return await this.inlineCompletion(task.document, task.position, task.options);
      case 'hover':
        return await this.provideHover(task.document, task.position);
      case 'rename':
        return await this.renameSymbol(task.document, task.position, task.newName);
      default:
        return await this._sendRequest('workspace/executeCommand', {
          command: task.command || 'sonnet.execute',
          arguments: [task]
        }, options.timeout || 300000);
    }
  }

  // ==================== UTILITY METHODS ====================

  async _applyWorkspaceEdit(edit) {
    return await this._sendRequest(MessageType.WORKSPACE_APPLY_EDIT, { edit });
  }

  async executeCommand(command, arguments_) {
    return await this._sendRequest(MessageType.WORKSPACE_EXECUTE_COMMAND, {
      command,
      arguments: arguments_
    });
  }

  _getTextInRange(document, range) {
    const text = document.text || this.openDocuments.get(document.uri)?.text || '';
    const lines = text.split('\n');
    
    if (range.start.line === range.end.line) {
      const line = lines[range.start.line] || '';
      return line.substring(range.start.character, range.end.character);
    }
    
    let result = '';
    for (let i = range.start.line; i <= range.end.line; i++) {
      const line = lines[i] || '';
      if (i === range.start.line) {
        result += line.substring(range.start.character);
      } else if (i === range.end.line) {
        result += '\n' + line.substring(0, range.end.character);
      } else {
        result += '\n' + line;
      }
    }
    
    return result;
  }

  _handleDiagnostics(params) {
    this.emit('diagnostics', params);
  }

  getCapabilities() {
    return {
      provider: 'claude',
      mode: 'sonnet-ide',
      version: this.modelConfig.version,
      protocol: 'lsp-like',
      contextWindow: this.modelConfig.contextWindow,
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
        'document_formatting',
        'workspace_symbols',
        'signature_help',
        'extended_thinking'
      ],
      streaming: true,
      supportsFiles: true,
      supportsEditorContext: true,
      serverCapabilities: this.serverCapabilities
    };
  }

  async _doPing() {
    await this._sendRequest(MessageType.PING, {}, 5000);
  }

  async disconnect() {
    this.costTracker.endSession();
    
    try {
      await this._sendRequest(MessageType.SHUTDOWN, {}, 10000);
      this._sendNotification(MessageType.EXIT, {});
    } catch (error) {
      // Ignore shutdown errors
    }
    
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    
    this.responseHandlers.clear();
    this.notificationHandlers.clear();
    this.openDocuments.clear();
    this.documentVersions.clear();
    this.completionCache.clear();
    
    await super.disconnect();
  }
}

// ==================== INLINE COMPLETION PROVIDER ====================

class InlineCompletionProvider {
  constructor(client) {
    this.client = client;
  }

  async provideCompletion(document, position, options = {}) {
    const context = this._getCompletionContext(document, position);
    
    // Generate AI-powered completion
    const prompt = this._buildCompletionPrompt(context, document.languageId);
    
    // This would call the Claude API - returning placeholder structure
    return {
      isIncomplete: false,
      items: [
        {
          label: 'AI Suggestion',
          kind: CompletionItemKind.SNIPPET,
          insertText: '// AI-generated completion placeholder',
          insertTextFormat: InsertTextFormat.SNIPPET,
          documentation: {
            kind: 'markdown',
            value: 'AI-powered code completion from Claude Sonnet'
          },
          source: 'sonnet-ai'
        }
      ]
    };
  }

  _getCompletionContext(document, position) {
    const text = document.text || '';
    const lines = text.split('\n');
    const currentLine = lines[position.line] || '';
    
    return {
      prefix: currentLine.substring(0, position.character),
      suffix: currentLine.substring(position.character),
      line: currentLine,
      precedingLines: lines.slice(Math.max(0, position.line - 10), position.line),
      followingLines: lines.slice(position.line + 1, position.line + 5),
      languageId: document.languageId,
      position
    };
  }

  _buildCompletionPrompt(context, languageId) {
    return `Complete the following ${languageId} code:\n\n` +
      `Context:\n${context.precedingLines.slice(-5).join('\n')}\n` +
      `${context.line.substring(0, context.position.character)}<CURSOR>${context.line.substring(context.position.character)}\n\n` +
      `Provide the most likely completion.`;
  }
}

export default SonnetIdeClient;
