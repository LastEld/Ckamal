/**
 * @fileoverview GPT 5.4 Codex IDE Integration Client
 * @module models/codex/gpt54-ide
 * 
 * VSCode IDE integration with GPT 5.4 Codex:
 * - Advanced IntelliSense with AI-powered completions
 * - Smart refactoring suggestions
 * - Architecture suggestions inline
 * - Performance insights
 * - Code review inline
 * - Documentation generation
 * - Multimodal support (hover image previews)
 * - Reasoning visualization panel
 * 
 * Features:
 * - Language Server Protocol (LSP) compatible
 * - Real-time streaming completions
 * - Workspace context awareness
 * - Symbol analysis
 * - Type inference assistance
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { extname, basename, dirname, join, relative } from 'path';
import { GPT54Client, TaskType, ReasoningMode } from './gpt54-client.js';
import { GPT54Config, PRESETS } from './gpt54-config.js';

/**
 * IDE Client Error types
 */
export class GPT54IdeError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'GPT54IdeError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Completion item kinds
 * @enum {number}
 */
export const CompletionItemKind = {
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
  TYPE_PARAMETER: 25,
};

/**
 * Diagnostic severity levels
 * @enum {number}
 */
export const DiagnosticSeverity = {
  ERROR: 1,
  WARNING: 2,
  INFORMATION: 3,
  HINT: 4,
};

/**
 * GPT 5.4 Codex IDE Client
 * Provides IDE integration capabilities
 * @extends EventEmitter
 */
export class GPT54IDEClient extends EventEmitter {
  #client;
  #config;
  #workspace;
  #documents;
  #completionsCache;
  #analysisCache;
  #port;
  #server;
  
  /**
   * Creates a GPT54IDEClient instance
   * @param {Object} options - IDE client options
   * @param {string} [options.apiKey] - OpenAI API key
   * @param {Object} [options.config] - Configuration
   * @param {string} [options.workspaceRoot] - Workspace root directory
   * @param {number} [options.port] - Server port for LSP
   */
  constructor(options = {}) {
    super();
    
    this.#config = new GPT54Config({
      ...PRESETS.coding,
      ...options.config,
    });
    
    this.#client = new GPT54Client({
      apiKey: options.apiKey,
      config: this.#config,
    });
    
    this.#workspace = options.workspaceRoot || process.cwd();
    this.#port = options.port || 18123;
    this.#documents = new Map();
    this.#completionsCache = new Map();
    this.#analysisCache = new Map();
  }
  
  // ==================== Initialization ====================
  
  /**
   * Initializes the IDE client
   * @param {Object} options - Initialization options
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    this.emit('initializing');
    
    try {
      await this.#client.initialize();
      
      // Load workspace if specified
      if (options.workspaceRoot) {
        this.#workspace = options.workspaceRoot;
        await this.#loadWorkspace();
      }
      
      this.emit('ready');
      
    } catch (error) {
      this.emit('error', error);
      throw new GPT54IdeError(
        `Failed to initialize: ${error.message}`,
        'INIT_ERROR',
        { cause: error }
      );
    }
  }
  
  /**
   * Loads workspace files
   * @private
   * @returns {Promise<void>}
   */
  async #loadWorkspace() {
    const entries = await fs.readdir(this.#workspace, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = extname(entry.name).slice(1);
        if (this.#config.getConfig().supportedFormats.includes(ext)) {
          // Track supported files
          this.#documents.set(join(this.#workspace, entry.name), {
            version: 0,
            content: null,
          });
        }
      }
    }
  }
  
  // ==================== IntelliSense ====================
  
  /**
   * Provides inline completion suggestions
   * @param {Object} document - Document object
   * @param {Object} position - Cursor position {line, character}
 * @param {Object} context - Completion context
   * @returns {Promise<Array>} Completion items
   */
  async inlineCompletion(document, position, context = {}) {
    const documentId = document.uri || document.path;
    const cacheKey = `${documentId}:${position.line}:${position.character}`;
    
    // Check cache
    if (this.#completionsCache.has(cacheKey)) {
      const cached = this.#completionsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 30000) { // 30s cache
        return cached.items;
      }
    }
    
    // Get document content
    const content = document.content || await this.#getDocumentContent(document);
    const lines = content.split('\n');
    
    // Build context
    const prefix = lines.slice(0, position.line).join('\n') + '\n' + 
                   lines[position.line].slice(0, position.character);
    const suffix = lines[position.line].slice(position.character) + '\n' +
                   lines.slice(position.line + 1).join('\n');
    
    // Create completion prompt
    const prompt = this.#buildCompletionPrompt(prefix, suffix, context);
    
    const response = await this.#client.send(prompt, {
      maxTokens: 200,
      temperature: 0.2,
      system: `You are an expert code completion engine. Complete the code naturally and correctly.

Rules:
1. Continue from where the cursor is
2. Match the existing code style
3. Use appropriate variable names
4. Add proper error handling
5. Include comments for complex logic
6. Only output the completion, no explanations

Current context: ${context.language || 'javascript'} file`,
    });
    
    const completion = response.content.trim();
    
    if (!completion) {
      return [];
    }
    
    const items = [{
      label: completion.split('\n')[0].slice(0, 50) + '...',
      insertText: completion,
      kind: CompletionItemKind.SNIPPET,
      detail: 'GPT 5.4 Codex',
      documentation: {
        kind: 'markdown',
        value: 'AI-powered completion',
      },
      preselect: true,
    }];
    
    // Cache results
    this.#completionsCache.set(cacheKey, {
      items,
      timestamp: Date.now(),
    });
    
    return items;
  }
  
  /**
   * Builds completion prompt
   * @private
   */
  #buildCompletionPrompt(prefix, suffix, context) {
    let prompt = '<|fim_prefix|>' + prefix + '<|fim_suffix|>' + suffix + '<|fim_middle|>';
    
    if (context.language) {
      prompt = `Language: ${context.language}\n\n${prompt}`;
    }
    
    if (context.functionName) {
      prompt += `\n\nFunction: ${context.functionName}`;
    }
    
    return prompt;
  }
  
  /**
   * Provides full completion suggestions
   * @param {Object} document - Document object
   * @param {Object} position - Cursor position
   * @param {string} [trigger] - Trigger character
   * @returns {Promise<Array>} Completion items
   */
  async provideCompletion(document, position, trigger = null) {
    const content = document.content || await this.#getDocumentContent(document);
    const lines = content.split('\n');
    const currentLine = lines[position.line];
    
    // Extract context
    const linePrefix = currentLine.slice(0, position.character);
    const lineSuffix = currentLine.slice(position.character);
    
    // Build prompt
    const prompt = `Complete the following code:

Context:
${lines.slice(Math.max(0, position.line - 10), position.line).join('\n')}

Current line:
${linePrefix}[CURSOR]${lineSuffix}

Provide 3 completion suggestions:`;
    
    const response = await this.#client.send(prompt, {
      maxTokens: 500,
      temperature: 0.3,
      system: 'Provide code completions. Format: 1. [completion] 2. [completion] 3. [completion]',
    });
    
    // Parse completions
    const completions = this.#parseCompletions(response.content);
    
    return completions.map((completion, index) => ({
      label: completion.label || `Suggestion ${index + 1}`,
      insertText: completion.text,
      kind: CompletionItemKind.SNIPPET,
      detail: 'GPT 5.4',
      sortText: String(index).padStart(2, '0'),
      documentation: completion.explanation ? {
        kind: 'markdown',
        value: completion.explanation,
      } : undefined,
    }));
  }
  
  /**
   * Parses completions from response
   * @private
   */
  #parseCompletions(content) {
    const completions = [];
    const lines = content.split('\n');
    let current = null;
    
    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*(.+)$/);
      if (match) {
        if (current) completions.push(current);
        current = { label: match[2].slice(0, 30), text: match[2], explanation: '' };
      } else if (current && line.trim()) {
        current.explanation += line + '\n';
      }
    }
    
    if (current) completions.push(current);
    
    return completions.length > 0 ? completions : [{ text: content }];
  }
  
  // ==================== Smart Refactoring ====================
  
  /**
   * Provides refactoring suggestions
   * @param {Object} document - Document object
   * @param {Object} range - Selected range
   * @param {Object} options - Refactoring options
   * @returns {Promise<Array>} Refactoring edits
   */
  async provideRefactoring(document, range, options = {}) {
    const content = document.content || await this.#getDocumentContent(document);
    const selectedText = this.#extractRange(content, range);
    
    const prompt = `Refactor the following code for better quality:

\`\`\`
${selectedText}
\`\`\`

Provide:
1. Explanation of issues
2. Refactored code
3. Benefits of the changes`;
    
    const response = await this.#client.send(prompt, {
      maxTokens: 1500,
      temperature: 0.2,
      reasoning: true,
      reasoningMode: ReasoningMode.CHAIN_OF_THOUGHT,
    });
    
    // Parse refactoring result
    const refactored = this.#extractCodeBlock(response.content);
    
    if (!refactored) {
      return [];
    }
    
    return [{
      title: 'GPT 5.4 Refactor',
      kind: 'refactor.extract',
      edits: [{
        range,
        newText: refactored,
      }],
      documentation: {
        kind: 'markdown',
        value: response.content,
      },
    }];
  }
  
  /**
   * Extracts code block from markdown
   * @private
   */
  #extractCodeBlock(content) {
    const match = content.match(/```[\w]*\n([\s\S]*?)```/);
    return match ? match[1].trim() : content.trim();
  }
  
  /**
   * Extracts text range
   * @private
   */
  #extractRange(content, range) {
    const lines = content.split('\n');
    
    if (range.start.line === range.end.line) {
      return lines[range.start.line].slice(range.start.character, range.end.character);
    }
    
    let result = lines[range.start.line].slice(range.start.character) + '\n';
    for (let i = range.start.line + 1; i < range.end.line; i++) {
      result += lines[i] + '\n';
    }
    result += lines[range.end.line].slice(0, range.end.character);
    
    return result;
  }
  
  // ==================== Architecture Suggestions ====================
  
  /**
   * Provides architecture suggestions
   * @param {Object} document - Document object
   * @returns {Promise<Array>} Architecture hints
   */
  async provideArchitectureSuggestions(document) {
    const content = document.content || await this.#getDocumentContent(document);
    
    // Get workspace context
    const workspaceFiles = await this.#getWorkspaceContext();
    
    const prompt = `Analyze the following code for architectural improvements:

Current file:
\`\`\`
${content.slice(0, 3000)}
\`\`\`

Workspace context:
${workspaceFiles.map(f => `- ${f.name}`).join('\n')}

Provide architectural suggestions focusing on:
1. Design patterns that could be applied
2. Separation of concerns
3. Potential abstractions
4. Module boundaries`;
    
    const response = await this.#client.send(prompt, {
      maxTokens: 2000,
      temperature: 0.3,
      reasoning: true,
    });
    
    // Parse suggestions into code lens or hover items
    return this.#parseArchitectureSuggestions(response.content);
  }
  
  /**
   * Parses architecture suggestions
   * @private
   */
  #parseArchitectureSuggestions(content) {
    const suggestions = [];
    const sections = content.split(/\n##?\s+/);
    
    for (const section of sections) {
      if (!section.trim()) continue;
      
      const lines = section.split('\n');
      const title = lines[0].trim();
      const description = lines.slice(1).join('\n').trim();
      
      if (title && description) {
        suggestions.push({
          title,
          description,
          command: {
            title: 'View Architecture Suggestion',
            command: 'gpt54.showArchitectureSuggestion',
            arguments: [title, description],
          },
        });
      }
    }
    
    return suggestions;
  }
  
  /**
   * Gets workspace context
   * @private
   */
  async #getWorkspaceContext() {
    const files = [];
    
    try {
      const entries = await fs.readdir(this.#workspace, { withFileTypes: true });
      
      for (const entry of entries.slice(0, 20)) {
        if (entry.isFile()) {
          files.push({ name: entry.name });
        }
      }
    } catch (error) {
      // Ignore workspace read errors
    }
    
    return files;
  }
  
  // ==================== Performance Insights ====================
  
  /**
   * Provides performance insights for code
   * @param {Object} document - Document object
   * @param {Object} range - Selected range (optional)
   * @returns {Promise<Array>} Performance diagnostics
   */
  async providePerformanceInsights(document, range = null) {
    const content = document.content || await this.#getDocumentContent(document);
    const code = range ? this.#extractRange(content, range) : content;
    
    const response = await this.#client.performanceAnalysis(code, {
      language: document.language,
    });
    
    // Parse into diagnostics
    return this.#parsePerformanceInsights(response.content, range);
  }
  
  /**
   * Parses performance insights
   * @private
   */
  #parsePerformanceInsights(content, range) {
    const insights = [];
    
    // Look for line number references
    const lineMatches = content.matchAll(/line\s+(\d+)|Line\s+(\d+)/gi);
    const lines = new Set();
    
    for (const match of lineMatches) {
      const line = parseInt(match[1] || match[2], 10) - 1;
      lines.add(line);
    }
    
    // Create diagnostic items
    for (const line of lines) {
      insights.push({
        range: range || { start: { line, character: 0 }, end: { line, character: 100 } },
        message: this.#extractInsightForLine(content, line),
        severity: DiagnosticSeverity.INFORMATION,
        source: 'GPT 5.4 Performance',
        code: 'perf-insight',
      });
    }
    
    return insights;
  }
  
  /**
   * Extracts insight for specific line
   * @private
   */
  #extractInsightForLine(content, line) {
    // Simple extraction - in practice, would parse more carefully
    const lines = content.split('\n');
    const contextIndex = lines.findIndex(l => l.includes(`line ${line + 1}`) || l.includes(`Line ${line + 1}`));
    
    if (contextIndex >= 0) {
      return lines.slice(contextIndex, contextIndex + 2).join(' ').slice(0, 200);
    }
    
    return 'Performance consideration';
  }
  
  // ==================== Code Review ====================
  
  /**
   * Provides inline code review comments
   * @param {Object} document - Document object
   * @returns {Promise<Array>} Review comments
   */
  async provideCodeReview(document) {
    const content = document.content || await this.#getDocumentContent(document);
    
    const response = await this.#client.execute({
      type: TaskType.CODE_REVIEW,
      description: `Review code for quality issues`,
      code: content,
      language: document.language,
    }, {
      maxTokens: 3000,
    });
    
    return this.#parseReviewComments(response.content);
  }
  
  /**
   * Parses review comments
   * @private
   */
  #parseReviewComments(content) {
    const comments = [];
    
    // Look for patterns like "Line X: ..." or "line X - ..."
    const pattern = /(?:line|Line)\s*(\d+)[:\s-]+(.+?)(?=\n(?:line|Line)\s*\d+|$)/gis;
    const matches = content.matchAll(pattern);
    
    for (const match of matches) {
      const line = parseInt(match[1], 10) - 1;
      const message = match[2].trim();
      
      comments.push({
        range: {
          start: { line, character: 0 },
          end: { line, character: 100 },
        },
        message,
        severity: this.#determineSeverity(message),
        source: 'GPT 5.4 Review',
      });
    }
    
    return comments;
  }
  
  /**
   * Determines severity from message
   * @private
   */
  #determineSeverity(message) {
    const lower = message.toLowerCase();
    if (lower.includes('critical') || lower.includes('security') || lower.includes('error')) {
      return DiagnosticSeverity.ERROR;
    }
    if (lower.includes('warning') || lower.includes('caution')) {
      return DiagnosticSeverity.WARNING;
    }
    return DiagnosticSeverity.INFORMATION;
  }
  
  // ==================== Documentation ====================
  
  /**
   * Generates documentation for code
   * @param {Object} document - Document object
   * @param {Object} range - Selected range
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated documentation
   */
  async generateDocumentation(document, range, options = {}) {
    const content = document.content || await this.#getDocumentContent(document);
    const code = range ? this.#extractRange(content, range) : content;
    
    const prompt = `Generate ${options.style || 'JSDoc'} documentation for:

\`\`\`${document.language || 'javascript'}
${code}
\`\`\`

Requirements:
${options.requirements || '- Document all parameters\n- Document return values\n- Include examples\n- Add type information'}`;
    
    const response = await this.#client.send(prompt, {
      maxTokens: 2000,
      temperature: 0.2,
    });
    
    return {
      documentation: response.content,
      insertPosition: range ? range.start : { line: 0, character: 0 },
    };
  }
  
  /**
   * Generates hover documentation
   * @param {Object} document - Document object
   * @param {Object} position - Hover position
   * @returns {Promise<Object>} Hover content
   */
  async provideHover(document, position) {
    const content = document.content || await this.#getDocumentContent(document);
    const symbol = this.#extractSymbolAtPosition(content, position);
    
    if (!symbol) {
      return null;
    }
    
    const prompt = `Explain the following code symbol in detail:

Symbol: ${symbol.text}
Context:
\`\`\`
${symbol.context}
\`\`\`

Provide:
1. What it does
2. Parameters/arguments
3. Return value
4. Usage example`;
    
    const response = await this.#client.send(prompt, {
      maxTokens: 800,
      temperature: 0.3,
    });
    
    return {
      contents: {
        kind: 'markdown',
        value: response.content,
      },
      range: symbol.range,
    };
  }
  
  /**
   * Extracts symbol at position
   * @private
   */
  #extractSymbolAtPosition(content, position) {
    const lines = content.split('\n');
    const line = lines[position.line];
    
    // Find word boundaries
    let start = position.character;
    let end = position.character;
    
    while (start > 0 && /\w/.test(line[start - 1])) start--;
    while (end < line.length && /\w/.test(line[end])) end++;
    
    const text = line.slice(start, end);
    
    if (!text) return null;
    
    // Get context (surrounding lines)
    const contextStart = Math.max(0, position.line - 5);
    const contextEnd = Math.min(lines.length, position.line + 5);
    const context = lines.slice(contextStart, contextEnd).join('\n');
    
    return {
      text,
      context,
      range: {
        start: { line: position.line, character: start },
        end: { line: position.line, character: end },
      },
    };
  }
  
  // ==================== Helper Methods ====================
  
  /**
   * Gets document content
   * @private
   * @param {Object} document - Document object
   * @returns {Promise<string>} Document content
   */
  async #getDocumentContent(document) {
    if (document.content) {
      return document.content;
    }
    
    const path = document.uri || document.path;
    if (!path) {
      throw new GPT54IdeError('Document has no content or path', 'INVALID_DOCUMENT');
    }
    
    return fs.readFile(path, 'utf8');
  }
  
  /**
   * Updates document cache
   * @param {string} uri - Document URI
   * @param {string} content - Document content
   * @param {number} version - Document version
   */
  updateDocument(uri, content, version) {
    this.#documents.set(uri, { content, version });
    
    // Clear related caches
    for (const key of this.#completionsCache.keys()) {
      if (key.startsWith(uri)) {
        this.#completionsCache.delete(key);
      }
    }
  }
  
  /**
   * Removes document from cache
   * @param {string} uri - Document URI
   */
  removeDocument(uri) {
    this.#documents.delete(uri);
    
    // Clear related caches
    for (const key of this.#completionsCache.keys()) {
      if (key.startsWith(uri)) {
        this.#completionsCache.delete(key);
      }
    }
  }
  
  // ==================== Advanced Features ====================
  
  /**
   * Provides reasoning visualization data
   * @param {string} prompt - Prompt to analyze
   * @returns {Promise<Object>} Reasoning data
   */
  async visualizeReasoning(prompt) {
    const response = await this.#client.advancedReasoning(prompt, {
      mode: ReasoningMode.CHAIN_OF_THOUGHT,
    });
    
    return {
      reasoning: response.reasoning,
      conclusion: response.content,
      steps: this.#parseReasoningSteps(response.reasoning),
    };
  }
  
  /**
   * Parses reasoning steps
   * @private
   */
  #parseReasoningSteps(reasoning) {
    if (!reasoning) return [];
    
    const steps = [];
    const lines = reasoning.split('\n');
    let currentStep = null;
    
    for (const line of lines) {
      const stepMatch = line.match(/^(?:Step|step)\s*(\d+)[:\.]\s*(.+)/);
      
      if (stepMatch) {
        if (currentStep) steps.push(currentStep);
        currentStep = {
          number: parseInt(stepMatch[1], 10),
          title: stepMatch[2].trim(),
          content: '',
        };
      } else if (currentStep && line.trim()) {
        currentStep.content += line + '\n';
      }
    }
    
    if (currentStep) steps.push(currentStep);
    
    return steps;
  }
  
  /**
   * Analyzes image with code context
   * @param {string} imagePath - Image path
   * @param {Object} document - Related document
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeImageWithCode(imagePath, document) {
    const content = document.content || await this.#getDocumentContent(document);
    
    return this.#client.multimodalAnalysis(
      imagePath,
      content,
      'Analyze this image in the context of the provided code. Identify UI components, suggest implementations, or debug visual issues.'
    );
  }
  
  // ==================== Cleanup ====================
  
  /**
   * Closes the IDE client
   * @returns {Promise<void>}
   */
  async close() {
    await this.#client.close();
    
    this.#documents.clear();
    this.#completionsCache.clear();
    this.#analysisCache.clear();
    
    this.emit('closed');
  }
  
  /**
   * Gets client statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      documents: this.#documents.size,
      cacheSize: this.#completionsCache.size,
      workspace: this.#workspace,
      ...this.#client.getMetrics(),
      ...this.#client.getCostStats(),
    };
  }
}

/**
 * Creates a GPT54IDEClient instance
 * @param {Object} options - Client options
 * @returns {GPT54IDEClient} IDE client instance
 */
export function createGPT54IDEClient(options = {}) {
  return new GPT54IDEClient(options);
}

export default GPT54IDEClient;
