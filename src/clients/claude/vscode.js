/**
 * Claude VSCode Client
 * Integration with Anthropic Sonnet 4.6 VSCode Extension
 * 
 * Features:
 * - LSP-like protocol for IDE communication
 * - Unix/TCP Socket communication
 * - Inline completion with IntelliSense
 * - Code actions and quick fixes
 * - Hover information
 * - Refactoring operations
 * - Diagnostics
 * - Symbol navigation (go to definition, find references)
 * - Task/Roadmap integration from code
 * - Code annotations
 */

import { BaseClient } from '../base-client.js';
import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';

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
 * Insert text format for completions
 */
// const InsertTextFormat = {
//   PLAIN_TEXT: 1,
//   SNIPPET: 2
// };

/**
 * Completion item kinds
 */
const CompletionItemKind = {
  TEXT: 1,
  METHOD: 2,
  FUNCTION: 3,
  CONSTRUCTOR: 4,
  FIELD: 5,
  VARIABLE: 6,
  CLASS: 7,
  INTERFACE: 8,
  MODULE: 9,
  PROPERTY: 10,
  UNIT: 11,
  VALUE: 12,
  ENUM: 13,
  KEYWORD: 14,
  SNIPPET: 15,
  COLOR: 16,
  FILE: 17,
  REFERENCE: 18,
  FOLDER: 19,
  ENUM_MEMBER: 20,
  CONSTANT: 21,
  STRUCT: 22,
  EVENT: 23,
  OPERATOR: 24,
  TYPE_PARAMETER: 25
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
 * Diagnostic severity
 */
const DiagnosticSeverity = {
  ERROR: 1,
  WARNING: 2,
  INFORMATION: 3,
  HINT: 4
};

/**
 * Claude VSCode Client
 * Advanced IDE integration with LSP-like protocol
 */
export class ClaudeVSCodeClient extends BaseClient {
  constructor(config = {}) {
    super({
      ...config,
      provider: 'claude',
      mode: 'vscode',
      version: '4.6'
    });
    
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
    
    // Task/Roadmap integration
    this.taskExtractor = new TaskExtractor();
    this.annotationManager = new CodeAnnotationManager();
    
    // Performance
    this.completionCache = new Map();
    this.cacheTimeout = config.cacheTimeout || 30000;
    
    // Streaming support
    this.streamHandlers = new Map();
  }

  /**
   * Get default socket path based on platform
   */
  _getDefaultSocketPath() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      return '\\\\.\\pipe\\claude-vscode-sonnet46';
    } else if (platform === 'darwin') {
      return `${process.env.HOME}/Library/Application Support/Claude/vscode-sonnet46.sock`;
    } else {
      return `${process.env.HOME}/.config/claude/vscode-sonnet46.sock`;
    }
  }

  /**
   * Build LSP client capabilities
   */
  _buildClientCapabilities() {
    return {
      workspace: {
        applyEdit: true,
        workspaceEdit: {
          documentChanges: true
        },
        didChangeConfiguration: {
          dynamicRegistration: true
        },
        didChangeWatchedFiles: {
          dynamicRegistration: true
        },
        symbol: {
          dynamicRegistration: true,
          symbolKind: {
            valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
          }
        },
        executeCommand: {
          dynamicRegistration: true
        },
        configuration: true,
        semanticTokens: {
          dynamicRegistration: true
        }
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
            tagSupport: {
              valueSet: [1]
            }
          },
          completionItemKind: {
            valueSet: Array.from({ length: 25 }, (_, i) => i + 1)
          },
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
        definition: {
          dynamicRegistration: true,
          linkSupport: true
        },
        references: {
          dynamicRegistration: true
        },
        documentHighlight: {
          dynamicRegistration: true
        },
        documentSymbol: {
          dynamicRegistration: true,
          symbolKind: {
            valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
          },
          hierarchicalDocumentSymbolSupport: true
        },
        codeAction: {
          dynamicRegistration: true,
          codeActionLiteralSupport: {
            codeActionKind: {
              valueSet: Object.values(CodeActionKind)
            }
          },
          isPreferredSupport: true,
          disabledSupport: true,
          dataSupport: true,
          resolveSupport: {
            properties: ['edit']
          }
        },
        codeLens: {
          dynamicRegistration: true
        },
        formatting: {
          dynamicRegistration: true
        },
        rangeFormatting: {
          dynamicRegistration: true
        },
        rename: {
          dynamicRegistration: true,
          prepareSupport: true,
          prepareSupportDefaultBehavior: 1
        },
        publishDiagnostics: {
          relatedInformation: true,
          versionSupport: true,
          tagSupport: {
            valueSet: [1, 2]
          },
          codeDescriptionSupport: true,
          dataSupport: true
        },
        semanticTokens: {
          dynamicRegistration: true,
          requests: {
            range: true,
            full: {
              delta: true
            }
          }
        }
      },
      window: {
        workDoneProgress: true,
        showMessage: {
          messageActionItem: {
            additionalPropertiesSupport: true
          }
        },
        showDocument: {
          support: true
        }
      },
      general: {
        regularExpressions: {
          engine: 'ECMAScript',
          version: 'ES2020'
        },
        markdown: {
          parser: 'marked',
          version: '1.1.0'
        }
      },
      // CogniMesh-specific capabilities
      cognimesh: {
        taskExtraction: true,
        roadmapIntegration: true,
        codeAnnotations: true,
        contextSnapshots: true,
        auditLogging: true
      }
    };
  }

  /**
   * Initialize the client and establish connection
   */
  async initialize() {
    this.status = 'initializing';
    
    try {
      // Establish socket connection
      await this._connect();
      
      // Send LSP initialize request
      const initResult = await this._sendRequest(MessageType.INITIALIZE, {
        processId: process.pid,
        clientInfo: {
          name: 'CogniMesh Claude VSCode Client',
          version: '4.6.0'
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
   * Connect to VSCode extension via socket
   */
  _connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('VSCode extension connection timeout'));
      }, 30000);

      if (this.port) {
        // TCP connection
        this.socket = net.connect({ port: this.port, host: this.host });
      } else {
        // Unix/Windows socket connection
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
        this._handleProgress(message.params);
        break;
      case MessageType.NOTIFICATION:
        this.emit('notification', message.params);
        break;
      case MessageType.PONG:
        // Ping response
        break;
      default:
        // Check for custom notification handlers
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
   * Send LSP notification (no response expected)
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

  //===========================================================================
  // LSP DOCUMENT SYNCHRONIZATION
  //===========================================================================

  /**
   * Open a document in the editor
   */
  async openDocument(uri, languageId, version, text) {
    this.openDocuments.set(uri, { languageId, version, text });
    this.documentVersions.set(uri, version);
    
    if (this.socket && !this.socket.destroyed) {
      this._sendNotification(MessageType.TEXT_DOCUMENT_DID_OPEN, {
        textDocument: {
          uri,
          languageId,
          version,
          text
        }
      });
    }
  }

  /**
   * Update document content
   */
  async changeDocument(uri, changes, version) {
    const doc = this.openDocuments.get(uri);
    if (!doc) {
      throw new Error(`Document not open: ${uri}`);
    }
    
    doc.version = version;
    this.documentVersions.set(uri, version);
    
    if (this.socket && !this.socket.destroyed) {
      this._sendNotification(MessageType.TEXT_DOCUMENT_DID_CHANGE, {
        textDocument: {
          uri,
          version
        },
        contentChanges: changes
      });
    }
  }

  /**
   * Close a document
   */
  async closeDocument(uri) {
    this.openDocuments.delete(uri);
    this.documentVersions.delete(uri);
    
    if (this.socket && !this.socket.destroyed) {
      this._sendNotification(MessageType.TEXT_DOCUMENT_DID_CLOSE, {
        textDocument: {
          uri
        }
      });
    }
  }

  /**
   * Save a document
   */
  async saveDocument(uri, text) {
    if (this.socket && !this.socket.destroyed) {
      this._sendNotification(MessageType.TEXT_DOCUMENT_DID_SAVE, {
        textDocument: {
          uri
        },
        text
      });
    }
  }

  //===========================================================================
  // INLINE COMPLETION & INTELLISENSE
  //===========================================================================

  /**
   * Get inline completion at position
   * @param {Object} document - Document object with uri, text, languageId
   * @param {Object} position - Position with line and character
   * @param {Object} options - Completion options
   * @returns {Promise<Object>} Completion items
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
    
    const params = {
      textDocument: {
        uri: document.uri
      },
      position,
      context: {
        triggerKind: options.triggerKind || 1, // Invoked
        triggerCharacter: options.triggerCharacter
      }
    };
    
    const result = await this._sendRequest(
      MessageType.TEXT_DOCUMENT_COMPLETION, 
      params, 
      options.timeout || 10000
    );
    
    // Enhance completions with AI-powered suggestions
    const enhancedResult = await this._enhanceCompletions(document, position, result);
    
    // Cache result
    this.completionCache.set(cacheKey, {
      data: enhancedResult,
      timestamp: Date.now()
    });
    
    return enhancedResult;
  }

  /**
   * Enhance completions with AI context
   */
  async _enhanceCompletions(document, position, baseCompletions) {
    // Get surrounding context
    const context = this._getCompletionContext(document, position);
    
    return {
      ...baseCompletions,
      isIncomplete: false,
      items: (baseCompletions.items || []).map(item => ({
        ...item,
        // Add CogniMesh-specific metadata
        data: {
          ...item.data,
          cognimesh: {
            source: 'lsp+ai',
            confidence: this._calculateConfidence(item, context),
            contextRelevance: this._calculateRelevance(item, context)
          }
        }
      }))
    };
  }

  /**
   * Get completion context
   */
  _getCompletionContext(document, position) {
    const lines = (document.text || '').split('\n');
    const currentLine = lines[position.line] || '';
    const prefix = currentLine.substring(0, position.character);
    const suffix = currentLine.substring(position.character);
    
    return {
      prefix,
      suffix,
      line: currentLine,
      precedingLines: lines.slice(Math.max(0, position.line - 5), position.line),
      followingLines: lines.slice(position.line + 1, position.line + 3),
      languageId: document.languageId
    };
  }

  /**
   * Calculate confidence score for completion
   */
  _calculateConfidence(item, context) {
    let score = 0.5;
    
    // Boost for exact prefix match
    if (context.prefix && item.label?.toLowerCase().startsWith(context.prefix.toLowerCase())) {
      score += 0.3;
    }
    
    // Boost for type relevance
    if (item.kind === CompletionItemKind.FUNCTION && context.prefix.includes('(')) {
      score += 0.1;
    }
    
    // Boost for documentation
    if (item.documentation) {
      score += 0.1;
    }
    
    return Math.min(1, score);
  }

  /**
   * Calculate relevance score
   */
  _calculateRelevance(item, context) {
    // Simple relevance based on naming patterns
    const patterns = {
      react: /^(use[A-Z]|handle|on[A-Z]|render)/,
      test: /^(test|describe|it|expect|mock)/,
      async: /^(async|await|Promise|fetch)/
    };
    
    for (const [category, pattern] of Object.entries(patterns)) {
      if (pattern.test(item.label)) {
        return category;
      }
    }
    
    return 'general';
  }

  /**
   * Resolve additional completion details
   */
  async resolveCompletionItem(item) {
    if (!this.serverCapabilities?.completionProvider?.resolveProvider) {
      return item;
    }
    
    return await this._sendRequest(MessageType.COMPLETION_ITEM_RESOLVE, item);
  }

  //===========================================================================
  // HOVER INFORMATION
  //===========================================================================

  /**
   * Get hover information at position
   * @param {Object} document - Document object
   * @param {Object} position - Position with line and character
   * @returns {Promise<Object>} Hover information
   */
  async provideHover(document, position) {
    const params = {
      textDocument: {
        uri: document.uri
      },
      position
    };
    
    const hover = await this._sendRequest(
      MessageType.TEXT_DOCUMENT_HOVER, 
      params,
      10000
    );
    
    // Enhance with CogniMesh context
    return this._enhanceHover(hover, document, position);
  }

  /**
   * Enhance hover with additional context
   */
  async _enhanceHover(hover, document, position) {
    if (!hover) return null;
    
    // Extract code annotations if any
    const annotations = await this.annotationManager.getAnnotationsAtPosition(
      document.uri, 
      position
    );
    
    return {
      ...hover,
      cognimesh: {
        annotations,
        relatedTasks: await this._findRelatedTasks(document.uri, position),
        relatedRoadmapNodes: await this._findRelatedRoadmapNodes(document.uri)
      }
    };
  }

  /**
   * Get signature help
   */
  async getSignatureHelp(document, position, triggerCharacter) {
    const params = {
      textDocument: {
        uri: document.uri
      },
      position,
      context: {
        isRetrigger: false,
        triggerCharacter
      }
    };
    
    return await this._sendRequest(MessageType.TEXT_DOCUMENT_SIGNATURE_HELP, params);
  }

  //===========================================================================
  // CODE ACTIONS & QUICK FIXES
  //===========================================================================

  /**
   * Get code actions for a range
   * @param {Object} document - Document object
   * @param {Object} range - Range with start and end positions
   * @param {Object} context - Code action context
   * @returns {Promise<Array>} Code actions
   */
  async codeAction(document, range, context = {}) {
    const params = {
      textDocument: {
        uri: document.uri
      },
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
    
    // Add CogniMesh-specific actions
    const cognimeshActions = await this._getCognimeshCodeActions(document, range);
    
    return [...(actions || []), ...cognimeshActions];
  }

  /**
   * Get CogniMesh-specific code actions
   */
  async _getCognimeshCodeActions(document, range) {
    const actions = [];
    
    // Task extraction action
    const selectedText = this._getTextInRange(document, range);
    if (selectedText && this.taskExtractor.looksLikeTask(selectedText)) {
      actions.push({
        title: '📝 Create CogniMesh Task',
        kind: CodeActionKind.QUICK_FIX,
        command: {
          command: 'cognimesh.createTaskFromSelection',
          title: 'Create Task',
          arguments: [document.uri, range, selectedText]
        }
      });
    }
    
    // Roadmap link action
    if (this._isRoadmapRelated(selectedText)) {
      actions.push({
        title: '🗺️ Link to Roadmap',
        kind: CodeActionKind.QUICK_FIX,
        command: {
          command: 'cognimesh.linkToRoadmap',
          title: 'Link to Roadmap',
          arguments: [document.uri, range]
        }
      });
    }
    
    // Add annotation action
    actions.push({
      title: '💭 Add CogniMesh Annotation',
      kind: CodeActionKind.QUICK_FIX,
      command: {
        command: 'cognimesh.addAnnotation',
        title: 'Add Annotation',
        arguments: [document.uri, range]
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

  /**
   * Apply workspace edit
   */
  async _applyWorkspaceEdit(edit) {
    return await this._sendRequest(MessageType.WORKSPACE_APPLY_EDIT, {
      edit
    });
  }

  /**
   * Execute workspace command
   */
  async executeCommand(command, arguments_) {
    return await this._sendRequest(MessageType.WORKSPACE_EXECUTE_COMMAND, {
      command,
      arguments: arguments_
    });
  }

  //===========================================================================
  // REFACTORING OPERATIONS
  //===========================================================================

  /**
   * Perform refactoring operation
   * @param {Object} document - Document object
   * @param {Object} range - Range to refactor
   * @param {string} operation - Operation type (extract, inline, rename, etc.)
   * @param {Object} options - Refactoring options
   * @returns {Promise<Object>} Workspace edit
   */
  async refactoring(document, range, operation, options = {}) {
    const kind = this._getRefactorKind(operation);
    
    const params = {
      textDocument: {
        uri: document.uri
      },
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
      throw new Error(`No ${operation} refactoring available for this selection`);
    }
    
    // Execute the first matching action
    return await this.executeCodeAction(relevantActions[0]);
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
      textDocument: {
        uri: document.uri
      },
      position,
      newName
    };
    
    return await this._sendRequest(MessageType.TEXT_DOCUMENT_RENAME, params, 15000);
  }

  /**
   * Prepare rename (for preview)
   */
  async prepareRename(document, position) {
    const params = {
      textDocument: {
        uri: document.uri
      },
      position
    };
    
    return await this._sendRequest(
      MessageType.TEXT_DOCUMENT_PREPARE_RENAME, 
      params,
      5000
    );
  }

  /**
   * Format document
   */
  async formatDocument(document, options = {}) {
    const params = {
      textDocument: {
        uri: document.uri
      },
      options: {
        tabSize: options.tabSize || 2,
        insertSpaces: options.insertSpaces !== false,
        trimTrailingWhitespace: options.trimTrailingWhitespace,
        insertFinalNewline: options.insertFinalNewline,
        trimFinalNewlines: options.trimFinalNewlines
      }
    };
    
    return await this._sendRequest(MessageType.TEXT_DOCUMENT_FORMATTING, params);
  }

  /**
   * Format range
   */
  async formatRange(document, range, options = {}) {
    const params = {
      textDocument: {
        uri: document.uri
      },
      range,
      options: {
        tabSize: options.tabSize || 2,
        insertSpaces: options.insertSpaces !== false
      }
    };
    
    return await this._sendRequest(MessageType.TEXT_DOCUMENT_RANGE_FORMATTING, params);
  }

  //===========================================================================
  // SYMBOL NAVIGATION
  //===========================================================================

  /**
   * Go to definition
   * @param {Object} document - Document object
   * @param {Object} position - Position
   * @returns {Promise<Array>} Definition locations
   */
  async goToDefinition(document, position) {
    const params = {
      textDocument: {
        uri: document.uri
      },
      position,
      workDoneToken: undefined
    };
    
    return await this._sendRequest(
      MessageType.TEXT_DOCUMENT_DEFINITION,
      params,
      10000
    );
  }

  /**
   * Find all references
   * @param {Object} document - Document object
   * @param {Object} position - Position
   * @param {boolean} includeDeclaration - Include declaration in results
   * @returns {Promise<Array>} Reference locations
   */
  async findAllReferences(document, position, includeDeclaration = true) {
    const params = {
      textDocument: {
        uri: document.uri
      },
      position,
      context: {
        includeDeclaration
      }
    };
    
    return await this._sendRequest(
      MessageType.TEXT_DOCUMENT_REFERENCES,
      params,
      15000
    );
  }

  /**
   * Get document symbols
   */
  async getDocumentSymbols(document) {
    const params = {
      textDocument: {
        uri: document.uri
      }
    };
    
    return await this._sendRequest(
      MessageType.TEXT_DOCUMENT_DOCUMENT_SYMBOL,
      params,
      10000
    );
  }

  /**
   * Search workspace symbols
   */
  async searchWorkspaceSymbols(query, options = {}) {
    const params = {
      query,
      ...options
    };
    
    return await this._sendRequest(MessageType.WORKSPACE_SYMBOL, params, 15000);
  }

  //===========================================================================
  // DIAGNOSTICS
  //===========================================================================

  /**
   * Get diagnostics for document
   * @param {Object} document - Document object
   * @returns {Promise<Array>} Diagnostics
   */
  async diagnostics(document) {
    // Request diagnostics from server
    const result = await this._sendRequest('textDocument/diagnostic', {
      textDocument: {
        uri: document.uri,
        version: this.documentVersions.get(document.uri) || 1
      }
    }, 30000);
    
    // Enhance with CogniMesh-specific diagnostics
    const cognimeshDiagnostics = await this._getCognimeshDiagnostics(document);
    
    return {
      items: [...(result?.items || []), ...cognimeshDiagnostics],
      kind: result?.kind || 'full'
    };
  }

  /**
   * Get CogniMesh-specific diagnostics
   */
  async _getCognimeshDiagnostics(document) {
    const diagnostics = [];
    const text = document.text || this.openDocuments.get(document.uri)?.text || '';
    
    // Check for TODO comments that could be tasks
    const todoRegex = /(?:TODO|FIXME|HACK|XXX|NOTE)\s*[:\-]?\s*(.+?)(?:\r?\n|$)/gi;
    let match;
    
    while ((match = todoRegex.exec(text)) !== null) {
      const lines = text.substring(0, match.index).split('\n');
      const line = lines.length - 1;
      const character = lines[lines.length - 1].length;
      
      diagnostics.push({
        range: {
          start: { line, character },
          end: { line, character: character + match[0].length }
        },
        severity: DiagnosticSeverity.INFORMATION,
        code: 'cognimesh-todo',
        source: 'CogniMesh',
        message: `Task candidate: "${match[1].trim()}"`,
        data: {
          cognimesh: {
            type: 'task-candidate',
            description: match[1].trim(),
            category: match[0].includes('TODO') ? 'todo' : 
                      match[0].includes('FIXME') ? 'fixme' : 'note'
          }
        }
      });
    }
    
    // Check for roadmap markers
    const roadmapRegex = /@roadmap\[([^\]]+)\]/gi;
    while ((match = roadmapRegex.exec(text)) !== null) {
      const lines = text.substring(0, match.index).split('\n');
      const line = lines.length - 1;
      const character = lines[lines.length - 1].length;
      
      diagnostics.push({
        range: {
          start: { line, character },
          end: { line, character: character + match[0].length }
        },
        severity: DiagnosticSeverity.HINT,
        code: 'cognimesh-roadmap',
        source: 'CogniMesh',
        message: `Linked to roadmap: ${match[1]}`,
        data: {
          cognimesh: {
            type: 'roadmap-link',
            nodeId: match[1]
          }
        }
      });
    }
    
    return diagnostics;
  }

  /**
   * Handle diagnostics notification from server
   */
  _handleDiagnostics(params) {
    this.emit('diagnostics', {
      uri: params.uri,
      version: params.version,
      diagnostics: params.diagnostics
    });
  }

  //===========================================================================
  // TASK/ROADMAP INTEGRATION
  //===========================================================================

  /**
   * Create task from code selection
   * @param {Object} document - Document object
   * @param {Object} range - Selected range
   * @param {Object} taskData - Task metadata
   * @returns {Promise<Object>} Created task
   */
  async createTaskFromCode(document, range, taskData = {}) {
    const selectedText = this._getTextInRange(document, range);
    
    const params = {
      uri: document.uri,
      range,
      code: selectedText,
      languageId: document.languageId,
      task: {
        title: taskData.title || this.taskExtractor.extractTitle(selectedText),
        description: taskData.description || selectedText,
        type: taskData.type || 'code-task',
        priority: taskData.priority || 'medium',
        tags: taskData.tags || this.taskExtractor.extractTags(selectedText),
        context: {
          filePath: document.uri,
          lineStart: range.start.line,
          lineEnd: range.end.line,
          codeSnippet: selectedText.substring(0, 500)
        }
      }
    };
    
    return await this._sendRequest(MessageType.COGNIMESH_CREATE_TASK, params, 30000);
  }

  /**
   * Link code to roadmap node
   * @param {Object} document - Document object
   * @param {Object} range - Selected range
   * @param {string} nodeId - Roadmap node ID
   * @returns {Promise<Object>} Link result
   */
  async linkToRoadmap(document, range, nodeId) {
    const params = {
      uri: document.uri,
      range,
      nodeId,
      code: this._getTextInRange(document, range)
    };
    
    return await this._sendRequest(MessageType.COGNIMESH_LINK_ROADMAP, params, 15000);
  }

  /**
   * Add code annotation
   * @param {Object} document - Document object
   * @param {Object} range - Range to annotate
   * @param {Object} annotation - Annotation data
   * @returns {Promise<Object>} Annotation result
   */
  async addCodeAnnotation(document, range, annotation) {
    const params = {
      uri: document.uri,
      range,
      annotation: {
        id: crypto.randomUUID(),
        type: annotation.type || 'note',
        content: annotation.content,
        author: annotation.author,
        timestamp: new Date().toISOString(),
        metadata: annotation.metadata || {}
      }
    };
    
    return await this._sendRequest(MessageType.COGNIMESH_CODE_ANNOTATION, params);
  }

  /**
   * Extract context for CogniMesh
   * @param {Object} document - Document object
   * @param {Object} position - Position
   * @returns {Promise<Object>} Extracted context
   */
  async extractContext(document, position) {
    const params = {
      textDocument: {
        uri: document.uri
      },
      position
    };
    
    return await this._sendRequest(MessageType.COGNIMESH_EXTRACT_CONTEXT, params, 10000);
  }

  /**
   * Find related tasks for a file/position
   */
  async _findRelatedTasks(_uri, _position) {
    // This would integrate with CogniMesh task manager
    // For now, return placeholder
    return [];
  }

  /**
   * Find related roadmap nodes for a file
   */
  async _findRelatedRoadmapNodes(_uri) {
    // This would integrate with CogniMesh roadmap system
    // For now, return placeholder
    return [];
  }

  //===========================================================================
  // CODE ANNOTATIONS
  //===========================================================================

  /**
   * Get all annotations for a document
   */
  async getDocumentAnnotations(uri) {
    return await this.annotationManager.getAnnotationsForDocument(uri);
  }

  /**
   * Update annotation
   */
  async updateAnnotation(annotationId, updates) {
    return await this.annotationManager.updateAnnotation(annotationId, updates);
  }

  /**
   * Delete annotation
   */
  async deleteAnnotation(annotationId) {
    return await this.annotationManager.deleteAnnotation(annotationId);
  }

  //===========================================================================
  // UTILITY METHODS
  //===========================================================================

  /**
   * Get text in range from document
   */
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

  /**
   * Check if text looks roadmap-related
   */
  _isRoadmapRelated(text) {
    if (!text) return false;
    const roadmapKeywords = ['roadmap', 'milestone', 'phase', 'epic', 'feature'];
    return roadmapKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );
  }

  /**
   * Handle progress notifications
   */
  _handleProgress(params) {
    this.emit('progress', params);
  }

  /**
   * Register notification handler
   */
  onNotification(method, handler) {
    if (!this.notificationHandlers.has(method)) {
      this.notificationHandlers.set(method, []);
    }
    this.notificationHandlers.get(method).push(handler);
  }

  /**
   * Unregister notification handler
   */
  offNotification(method, handler) {
    if (this.notificationHandlers.has(method)) {
      const handlers = this.notificationHandlers.get(method);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  //===========================================================================
  // BASE CLIENT IMPLEMENTATIONS
  //===========================================================================

  async send(message, options = {}) {
    return await this._sendRequest('window/showMessage', {
      type: message.type || 1,
      message: message.content
    }, options.timeout);
  }

  async execute(task, options = {}) {
    // Map generic task to appropriate LSP method
    switch (task.type) {
      case 'code-action':
        return await this.codeAction(
          task.document,
          task.range,
          task.context
        );
      case 'refactor':
        return await this.refactoring(
          task.document,
          task.range,
          task.operation,
          task.options
        );
      case 'format':
        return await this.formatDocument(task.document, task.options);
      case 'complete':
        return await this.inlineCompletion(
          task.document,
          task.position,
          task.options
        );
      default:
        return await this._sendRequest('workspace/executeCommand', {
          command: task.command || 'cognimesh.execute',
          arguments: [task]
        }, options.timeout || 300000);
    }
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
        'document_formatting',
        'workspace_symbols',
        'signature_help',
        'cognimesh_tasks',
        'cognimesh_roadmaps',
        'cognimesh_annotations'
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
    // Send shutdown request
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

//===========================================================================
// TASK EXTRACTOR UTILITY
//===========================================================================

class TaskExtractor {
  constructor() {
    this.taskPatterns = [
      /(?:TODO|FIXME|HACK|XXX)\s*[:\-]?\s*(.+)/i,
      /\/\/\s*(?:TASK|ISSUE)\s*[:\-]?\s*(.+)/i,
      /#\s*(?:TASK|ISSUE)\s*[:\-]?\s*(.+)/i,
      /\/\*\s*(?:TASK|ISSUE)\s*[:\-]?\s*(.+?)\*\//is
    ];
    
    this.tagPatterns = [
      /#(\w+)/g,
      /@(\w+)/g
    ];
  }

  looksLikeTask(text) {
    if (!text || text.length < 5) return false;
    return this.taskPatterns.some(pattern => pattern.test(text));
  }

  extractTitle(text) {
    for (const pattern of this.taskPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().substring(0, 100);
      }
    }
    
    // Fallback: first line, truncated
    const firstLine = text.split('\n')[0].trim();
    return firstLine.length > 100 ? firstLine.substring(0, 97) + '...' : firstLine;
  }

  extractTags(text) {
    const tags = [];
    for (const pattern of this.tagPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        tags.push(match[1]);
      }
    }
    return [...new Set(tags)]; // Deduplicate
  }
}

//===========================================================================
// CODE ANNOTATION MANAGER
//===========================================================================

class CodeAnnotationManager extends EventEmitter {
  constructor() {
    super();
    this.annotations = new Map();
  }

  async getAnnotationsForDocument(uri) {
    return Array.from(this.annotations.values())
      .filter(a => a.uri === uri)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async getAnnotationsAtPosition(uri, position) {
    return Array.from(this.annotations.values())
      .filter(a => {
        if (a.uri !== uri) return false;
        return this._isPositionInRange(position, a.range);
      });
  }

  async addAnnotation(annotation) {
    this.annotations.set(annotation.id, annotation);
    this.emit('annotationAdded', annotation);
    return annotation;
  }

  async updateAnnotation(id, updates) {
    const annotation = this.annotations.get(id);
    if (!annotation) throw new Error(`Annotation not found: ${id}`);
    
    const updated = { ...annotation, ...updates, updatedAt: new Date().toISOString() };
    this.annotations.set(id, updated);
    this.emit('annotationUpdated', updated);
    return updated;
  }

  async deleteAnnotation(id) {
    const annotation = this.annotations.get(id);
    if (!annotation) return false;
    
    this.annotations.delete(id);
    this.emit('annotationDeleted', annotation);
    return true;
  }

  _isPositionInRange(position, range) {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }
    if (position.line === range.start.line && position.character < range.start.character) {
      return false;
    }
    if (position.line === range.end.line && position.character > range.end.character) {
      return false;
    }
    return true;
  }
}

export default ClaudeVSCodeClient;
