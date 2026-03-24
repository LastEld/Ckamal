/**
 * @fileoverview Claude Opus 4.6 Coding Tasks Implementation
 * @module models/claude/opus-coding
 * 
 * Specialized coding task implementations using Claude Opus 4.6:
 * - Code completion and autocompletion
 * - Code review with multi-file analysis
 * - Refactoring with architectural changes
 * - Debug assistance with reasoning
 * - Architecture design with 1M context
 * - Git integration for code changes
 * - Diff generation and application
 */

import { EventEmitter } from 'events';
import { OpusClient, OpusClientError } from './opus-client.js';
import { execSync } from 'child_process';
import { readFile, writeFile, access } from 'fs/promises';
import { join, relative, dirname } from 'path';

/**
 * Coding task types
 * @enum {string}
 */
export const CodingTaskType = {
  CODE_COMPLETION: 'code_completion',
  CODE_REVIEW: 'code_review',
  REFACTORING: 'refactoring',
  DEBUG_ASSISTANCE: 'debug_assistance',
  ARCHITECTURE_DESIGN: 'architecture_design',
  DOCUMENTATION: 'documentation',
  TEST_GENERATION: 'test_generation',
};

/**
 * Error types for coding tasks
 */
export class CodingTaskError extends Error {
  constructor(message, code, taskId, details = {}) {
    super(message);
    this.name = 'CodingTaskError';
    this.code = code;
    this.taskId = taskId;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Claude Opus Coding Assistant
 * Specialized interface for coding tasks with multi-file analysis
 * @extends EventEmitter
 */
export class OpusCodingAssistant extends EventEmitter {
  #client;
  #gitEnabled;
  #projectRoot;
  #activeTasks;
  
  /**
   * Creates an OpusCodingAssistant
   * @param {OpusClient} client - OpusClient instance
   * @param {Object} options - Assistant options
   * @param {boolean} [options.gitEnabled=true] - Enable git integration
   * @param {string} [options.projectRoot] - Project root directory
   */
  constructor(client, options = {}) {
    super();
    
    if (!(client instanceof OpusClient)) {
      throw new CodingTaskError(
        'Valid OpusClient instance required',
        'INVALID_CLIENT'
      );
    }
    
    this.#client = client;
    this.#gitEnabled = options.gitEnabled ?? true;
    this.#projectRoot = options.projectRoot || process.cwd();
    this.#activeTasks = new Map();
    
    this.#setupEventForwarding();
  }
  
  /**
   * Forwards client events
   * @private
   */
  #setupEventForwarding() {
    const events = ['delta', 'done', 'error', 'cost:recorded'];
    events.forEach(event => {
      this.#client.on(event, (data) => this.emit(event, data));
    });
  }
  
  // ==================== Code Completion ====================
  
  /**
   * Provides intelligent code completion
   * @param {Object} options - Completion options
   * @param {string} options.code - Current code context
   * @param {string} [options.language] - Programming language
   * @param {string} [options.cursorPosition] - Cursor position (line:col)
   * @param {string[]} [options.relevantFiles] - Additional files for context
   * @param {Object} [callbacks] - Streaming callbacks
   * @returns {Promise<Object>} Completion result
   */
  async codeCompletion(options, callbacks = {}) {
    const taskId = this.#generateTaskId('completion');
    
    const prompt = this.#buildCompletionPrompt(options);
    
    const request = {
      message: prompt,
      messages: [
        {
          role: 'system',
          content: `You are an expert ${options.language || 'software'} developer. ` +
            'Provide concise, accurate code completions. ' +
            'Only output the completion code, no explanations unless asked.'
        },
        { role: 'user', content: prompt }
      ],
      enableThinking: false,
      maxTokens: 2048,
    };
    
    return this.#executeTask(taskId, CodingTaskType.CODE_COMPLETION, request, callbacks);
  }
  
  /**
   * Builds completion prompt
   * @private
   * @param {Object} options - Completion options
   * @returns {string} Formatted prompt
   */
  #buildCompletionPrompt(options) {
    const lines = [
      'Complete the following code:',
      '',
      '```' + (options.language || ''),
      options.code,
      '```',
    ];
    
    if (options.cursorPosition) {
      lines.push('', `Cursor position: ${options.cursorPosition}`);
    }
    
    if (options.relevantFiles?.length > 0) {
      lines.push('', 'Relevant context files:', ...options.relevantFiles.map(f => `- ${f}`));
    }
    
    return lines.join('\n');
  }
  
  // ==================== Code Review ====================
  
  /**
   * Performs comprehensive code review
   * @param {Object} options - Review options
   * @param {string|string[]} options.files - Files to review
   * @param {string} [options.focus] - Focus areas (security, performance, style)
   * @param {boolean} [options.includeSuggestions=true] - Include improvement suggestions
   * @param {Object} [callbacks] - Streaming callbacks
   * @returns {Promise<Object>} Review result with findings
   */
  async codeReview(options, callbacks = {}) {
    const taskId = this.#generateTaskId('review');
    
    // Load file contents
    const fileContents = await this.#loadFiles(options.files);
    
    const prompt = this.#buildReviewPrompt(fileContents, options);
    
    const request = {
      messages: [
        {
          role: 'system',
          content: 'You are an expert code reviewer. Analyze code for bugs, ' +
            'security issues, performance problems, and style violations. ' +
            'Provide structured, actionable feedback.'
        },
        { role: 'user', content: prompt }
      ],
      enableThinking: true,
      maxTokens: 8192,
    };
    
    const result = await this.#executeTask(taskId, CodingTaskType.CODE_REVIEW, request, callbacks);
    
    // Parse structured review results
    return this.#parseReviewResult(result, fileContents);
  }
  
  /**
   * Builds code review prompt
   * @private
   * @param {Array<Object>} files - File contents
   * @param {Object} options - Review options
   * @returns {string} Formatted prompt
   */
  #buildReviewPrompt(files, options) {
    const lines = [
      '# Code Review Request',
      '',
      `Focus areas: ${options.focus || 'general, security, performance, maintainability'}`,
      '',
      '## Files to Review',
      '',
    ];
    
    for (const file of files) {
      lines.push(
        `### ${file.path}`,
        '',
        '```' + this.#getLanguage(file.path),
        file.content,
        '```',
        ''
      );
    }
    
    lines.push(
      '',
      '## Review Format',
      '',
      'Provide your review in the following JSON structure:',
      '',
      '```json',
      JSON.stringify({
        summary: 'Brief overall assessment',
        findings: [
          {
            file: 'file path',
            line: 'line number or range',
            severity: 'critical|high|medium|low',
            category: 'bug|security|performance|style|suggestion',
            description: 'Detailed explanation',
            suggestion: 'How to fix or improve',
            code: 'Suggested code if applicable'
          }
        ],
        metrics: {
          complexity: 'assessment',
          testCoverage: 'assessment',
          maintainability: 'score 1-10'
        }
      }, null, 2),
      '```'
    );
    
    return lines.join('\n');
  }
  
  /**
   * Parses review result
   * @private
   * @param {string} result - Raw result
   * @param {Array<Object>} files - Reviewed files
   * @returns {Object} Parsed review
   */
  #parseReviewResult(result, files) {
    try {
      // Extract JSON from markdown code blocks
      const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      
      // Try parsing entire response as JSON
      return JSON.parse(result);
    } catch {
      // Return unstructured review
      return {
        summary: 'Review completed',
        rawReview: result,
        findings: [],
        files: files.map(f => f.path),
      };
    }
  }
  
  // ==================== Refactoring ====================
  
  /**
   * Performs code refactoring
   * @param {Object} options - Refactoring options
   * @param {string|string[]} options.files - Files to refactor
   * @param {string} options.goal - Refactoring goal
   * @param {string} [options.strategy] - Refactoring strategy
   * @param {boolean} [options.previewOnly=false] - Generate diff without applying
   * @param {Object} [callbacks] - Streaming callbacks
   * @returns {Promise<Object>} Refactoring result with diff
   */
  async refactoring(options, callbacks = {}) {
    const taskId = this.#generateTaskId('refactor');
    
    // Create checkpoint before refactoring
    if (this.#gitEnabled && !options.previewOnly) {
      await this.#createGitCheckpoint(`pre-refactor-${taskId}`);
    }
    
    const fileContents = await this.#loadFiles(options.files);
    
    const prompt = this.#buildRefactoringPrompt(fileContents, options);
    
    const request = {
      messages: [
        {
          role: 'system',
          content: 'You are an expert software architect. Perform refactoring ' +
            'while preserving functionality. Provide changes as unified diff format.'
        },
        { role: 'user', content: prompt }
      ],
      enableThinking: true,
      maxTokens: 16384,
    };
    
    const result = await this.#executeTask(taskId, CodingTaskType.REFACTORING, request, callbacks);
    
    // Parse and optionally apply changes
    return this.#processRefactoringResult(result, fileContents, options);
  }
  
  /**
   * Builds refactoring prompt
   * @private
   * @param {Array<Object>} files - File contents
   * @param {Object} options - Refactoring options
   * @returns {string} Formatted prompt
   */
  #buildRefactoringPrompt(files, options) {
    const lines = [
      '# Refactoring Request',
      '',
      `Goal: ${options.goal}`,
      options.strategy ? `Strategy: ${options.strategy}` : '',
      '',
      '## Files to Refactor',
      '',
    ];
    
    for (const file of files) {
      lines.push(
        `### ${file.path}`,
        '',
        '```' + this.#getLanguage(file.path),
        file.content,
        '```',
        ''
      );
    }
    
    lines.push(
      '',
      '## Instructions',
      '',
      '1. Analyze the code and identify refactoring opportunities',
      '2. Provide the refactored code in unified diff format',
      '3. Include brief explanation of changes',
      '4. Ensure all functionality is preserved',
      '',
      'Format your response as:',
      '- Analysis section',
      '- Unified diff for each modified file',
      '- Summary of changes'
    );
    
    return lines.join('\n');
  }
  
  /**
   * Processes refactoring result
   * @private
   * @param {string} result - Raw result
   * @param {Array<Object>} originalFiles - Original files
   * @param {Object} options - Refactoring options
   * @returns {Object} Processed result
   */
  async #processRefactoringResult(result, originalFiles, options) {
    // Extract diffs
    const diffs = this.#extractDiffs(result);
    
    const processedResult = {
      analysis: this.#extractAnalysis(result),
      diffs,
      summary: this.#extractSummary(result),
      applied: false,
    };
    
    // Apply changes if not preview only
    if (!options.previewOnly && diffs.length > 0) {
      await this.#applyDiffs(diffs);
      processedResult.applied = true;
      
      this.emit('refactoring:applied', { 
        files: diffs.map(d => d.file),
        originalFiles: originalFiles.map(f => f.path),
      });
    }
    
    return processedResult;
  }
  
  // ==================== Debug Assistance ====================
  
  /**
   * Provides debug assistance
   * @param {Object} options - Debug options
   * @param {string} options.error - Error message or description
   * @param {string} [options.stackTrace] - Stack trace
   * @param {string|string[]} [options.codeFiles] - Relevant code files
   * @param {string} [options.logs] - Log output
   * @param {Object} [callbacks] - Streaming callbacks
   * @returns {Promise<Object>} Debug analysis and suggestions
   */
  async debugAssistance(options, callbacks = {}) {
    const taskId = this.#generateTaskId('debug');
    
    const fileContents = options.codeFiles 
      ? await this.#loadFiles(options.codeFiles)
      : [];
    
    const prompt = this.#buildDebugPrompt(options, fileContents);
    
    const request = {
      messages: [
        {
          role: 'system',
          content: 'You are an expert debugger. Analyze errors systematically ' +
            'and provide root cause analysis with concrete solutions.'
        },
        { role: 'user', content: prompt }
      ],
      enableThinking: true,
      maxTokens: 8192,
    };
    
    const result = await this.#executeTask(taskId, CodingTaskType.DEBUG_ASSISTANCE, request, callbacks);
    
    return this.#parseDebugResult(result);
  }
  
  /**
   * Builds debug prompt
   * @private
   * @param {Object} options - Debug options
   * @param {Array<Object>} files - Code files
   * @returns {string} Formatted prompt
   */
  #buildDebugPrompt(options, files) {
    const lines = [
      '# Debug Assistance Request',
      '',
      '## Error Description',
      '',
      '```',
      options.error,
      '```',
    ];
    
    if (options.stackTrace) {
      lines.push(
        '',
        '## Stack Trace',
        '',
        '```',
        options.stackTrace,
        '```'
      );
    }
    
    if (files.length > 0) {
      lines.push('', '## Relevant Code Files', '');
      for (const file of files) {
        lines.push(
          `### ${file.path}`,
          '',
          '```' + this.#getLanguage(file.path),
          file.content,
          '```',
          ''
        );
      }
    }
    
    if (options.logs) {
      lines.push(
        '',
        '## Logs',
        '',
        '```',
        options.logs,
        '```'
      );
    }
    
    lines.push(
      '',
      '## Required Output',
      '',
      '1. Root cause analysis',
      '2. Explanation of why the error occurs',
      '3. Concrete solution with code example',
      '4. Prevention recommendations'
    );
    
    return lines.join('\n');
  }
  
  /**
   * Parses debug result
   * @private
   * @param {string} result - Raw result
   * @returns {Object} Parsed debug info
   */
  #parseDebugResult(result) {
    // Try to extract structured sections
    const sections = {
      rootCause: result.match(/(?:root cause|cause)[\s\S]*?(?=\n##|\n\n#|$)/i)?.[0] || '',
      explanation: result.match(/(?:explanation|why)[\s\S]*?(?=\n##|\n\n#|$)/i)?.[0] || '',
      solution: result.match(/(?:solution|fix)[\s\S]*?(?=\n##|\n\n#|$)/i)?.[0] || '',
      prevention: result.match(/(?:prevention|recommend)[\s\S]*?(?=\n##|\n\n#|$)/i)?.[0] || '',
    };
    
    return {
      ...sections,
      fullAnalysis: result,
    };
  }
  
  // ==================== Architecture Design ====================
  
  /**
   * Designs system architecture
   * @param {Object} options - Architecture options
   * @param {string} options.requirements - System requirements
   * @param {string} [options.constraints] - Design constraints
   * @param {string} [options.existingCode] - Paths to existing code to consider
   * @param {Object} [callbacks] - Streaming callbacks
   * @returns {Promise<Object>} Architecture design document
   */
  async architectureDesign(options, callbacks = {}) {
    const taskId = this.#generateTaskId('architecture');
    
    const existingFiles = options.existingCode
      ? await this.#loadFiles(options.existingCode)
      : [];
    
    const prompt = this.#buildArchitecturePrompt(options, existingFiles);
    
    const request = {
      messages: [
        {
          role: 'system',
          content: 'You are an expert software architect. Design scalable, ' +
            'maintainable systems with clear component boundaries and interfaces.'
        },
        { role: 'user', content: prompt }
      ],
      enableThinking: true,
      maxTokens: 32768, // Maximum for architecture design
    };
    
    const result = await this.#executeTask(taskId, CodingTaskType.ARCHITECTURE_DESIGN, request, callbacks);
    
    return this.#parseArchitectureResult(result);
  }
  
  /**
   * Builds architecture prompt
   * @private
   * @param {Object} options - Architecture options
   * @param {Array<Object>} existingFiles - Existing code files
   * @returns {string} Formatted prompt
   */
  #buildArchitecturePrompt(options, existingFiles) {
    const lines = [
      '# Architecture Design Request',
      '',
      '## Requirements',
      '',
      options.requirements,
    ];
    
    if (options.constraints) {
      lines.push(
        '',
        '## Constraints',
        '',
        options.constraints
      );
    }
    
    if (existingFiles.length > 0) {
      lines.push('', '## Existing Code Context', '');
      for (const file of existingFiles) {
        lines.push(
          `### ${file.path}`,
          '',
          '```',
          file.content.length > 5000 
            ? file.content.substring(0, 5000) + '\n... [truncated]'
            : file.content,
          '```',
          ''
        );
      }
    }
    
    lines.push(
      '',
      '## Deliverables',
      '',
      'Provide a comprehensive architecture design including:',
      '',
      '1. **Overview** - High-level system description',
      '2. **Component Diagram** - Text-based diagram of components',
      '3. **Component Details** - Each component\'s responsibilities',
      '4. **Data Flow** - How data moves through the system',
      '5. **Interfaces** - API contracts between components',
      '6. **Technology Stack** - Recommended technologies with rationale',
      '7. **Implementation Phases** - Phased rollout plan',
      '8. **Considerations** - Scalability, security, observability'
    );
    
    return lines.join('\n');
  }
  
  /**
   * Parses architecture result
   * @private
   * @param {string} result - Raw result
   * @returns {Object} Parsed architecture
   */
  #parseArchitectureResult(result) {
    return {
      overview: this.#extractSection(result, 'overview|high-level'),
      components: this.#extractSection(result, 'component|module'),
      dataFlow: this.#extractSection(result, 'data flow|flow'),
      interfaces: this.#extractSection(result, 'interface|api'),
      technology: this.#extractSection(result, 'technology|stack'),
      phases: this.#extractSection(result, 'phase|implementation'),
      considerations: this.#extractSection(result, 'consideration|scalability'),
      fullDocument: result,
    };
  }
  
  // ==================== Helper Methods ====================
  
  /**
   * Executes a coding task
   * @private
   * @param {string} taskId - Task ID
   * @param {string} taskType - Task type
   * @param {Object} request - Request object
   * @param {Object} callbacks - Callbacks
   * @returns {Promise<string>} Task result
   */
  async #executeTask(taskId, taskType, request, callbacks) {
    this.#activeTasks.set(taskId, { type: taskType, startTime: Date.now() });
    
    try {
      const result = await this.#client.stream(request, {
        onChunk: callbacks.onChunk,
        onThinking: callbacks.onThinking,
        onDone: callbacks.onDone,
        onError: callbacks.onError,
      });
      
      const task = this.#activeTasks.get(taskId);
      task.endTime = Date.now();
      task.duration = task.endTime - task.startTime;
      task.status = 'completed';
      
      this.emit('task:completed', { taskId, type: taskType, duration: task.duration });
      
      return result;
    } catch (error) {
      const task = this.#activeTasks.get(taskId);
      task.status = 'failed';
      task.error = error.message;
      
      this.emit('task:failed', { taskId, type: taskType, error });
      throw error;
    }
  }
  
  /**
   * Loads file contents
   * @private
   * @param {string|string[]} files - File paths
   * @returns {Promise<Array<Object>>} File contents
   */
  async #loadFiles(files) {
    const paths = Array.isArray(files) ? files : [files];
    const contents = [];
    
    for (const filePath of paths) {
      try {
        const fullPath = join(this.#projectRoot, filePath);
        const content = await readFile(fullPath, 'utf8');
        contents.push({ path: filePath, content, fullPath });
      } catch (error) {
        this.emit('file:error', { path: filePath, error: error.message });
      }
    }
    
    return contents;
  }
  
  /**
   * Creates git checkpoint
   * @private
   * @param {string} name - Checkpoint name
   */
  async #createGitCheckpoint(name) {
    if (!this.#gitEnabled) return;
    
    try {
      execSync(`git stash push -m "${name}"`, { cwd: this.#projectRoot });
      this.emit('git:checkpoint', { name });
    } catch (error) {
      this.emit('git:error', { operation: 'checkpoint', error: error.message });
    }
  }
  
  /**
   * Applies diffs to files
   * @private
   * @param {Array<Object>} diffs - Diffs to apply
   */
  async #applyDiffs(diffs) {
    for (const diff of diffs) {
      const filePath = join(this.#projectRoot, diff.file);
      await writeFile(filePath, diff.newContent, 'utf8');
    }
  }
  
  /**
   * Extracts diffs from result
   * @private
   * @param {string} result - Raw result
   * @returns {Array<Object>} Extracted diffs
   */
  #extractDiffs(result) {
    const diffs = [];
    const diffRegex = /```diff\n([\s\S]*?)\n```/g;
    let match;
    
    while ((match = diffRegex.exec(result)) !== null) {
      const diffContent = match[1];
      const fileMatch = diffContent.match(/^--- a?\/(.+)$/m);
      
      diffs.push({
        file: fileMatch?.[1] || 'unknown',
        diff: diffContent,
      });
    }
    
    return diffs;
  }
  
  /**
   * Extracts section from text
   * @private
   * @param {string} text - Source text
   * @param {string} pattern - Section pattern
   * @returns {string} Extracted section
   */
  #extractSection(text, pattern) {
    const regex = new RegExp(`(?:^|\n)#+\s*(?:${pattern})[^\n]*\n([\s\S]*?)(?=\n#+|$)`, 'i');
    const match = text.match(regex);
    return match?.[1]?.trim() || '';
  }
  
  /**
   * Extracts analysis from result
   * @private
   * @param {string} result - Raw result
   * @returns {string} Analysis section
   */
  #extractAnalysis(result) {
    return this.#extractSection(result, 'analysis');
  }
  
  /**
   * Extracts summary from result
   * @private
   * @param {string} result - Raw result
   * @returns {string} Summary section
   */
  #extractSummary(result) {
    return this.#extractSection(result, 'summary|conclusion');
  }
  
  /**
   * Gets language from file path
   * @private
   * @param {string} filePath - File path
   * @returns {string} Language identifier
   */
  #getLanguage(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap = {
      js: 'javascript',
      ts: 'typescript',
      jsx: 'jsx',
      tsx: 'tsx',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
    };
    return langMap[ext] || ext;
  }
  
  /**
   * Generates task ID
   * @private
   * @param {string} prefix - ID prefix
   * @returns {string} Generated ID
   */
  #generateTaskId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
  
  /**
   * Gets active tasks
   * @returns {Array<Object>} Active tasks
   */
  getActiveTasks() {
    return Array.from(this.#activeTasks.entries()).map(([id, task]) => ({
      id,
      ...task,
    }));
  }
  
  /**
   * Generates diff between original and modified content
   * @param {string} original - Original content
   * @param {string} modified - Modified content
   * @param {string} [filename='file'] - Filename for diff header
   * @returns {string} Unified diff
   */
  generateDiff(original, modified, filename = 'file') {
    const lines1 = original.split('\n');
    const lines2 = modified.split('\n');
    
    // Simple diff generation
    const diff = [
      `--- a/${filename}`,
      `+++ b/${filename}`,
      '@@ -1,' + lines1.length + ' +1,' + lines2.length + ' @@',
    ];
    
    // This is a simplified diff - in production, use a proper diff library
    for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
      if (lines1[i] !== lines2[i]) {
        if (lines1[i]) diff.push(`-${lines1[i]}`);
        if (lines2[i]) diff.push(`+${lines2[i]}`);
      } else {
        diff.push(` ${lines1[i]}`);
      }
    }
    
    return diff.join('\n');
  }
}

/**
 * Creates an OpusCodingAssistant instance
 * @param {OpusClient} client - OpusClient instance
 * @param {Object} options - Assistant options
 * @returns {OpusCodingAssistant} Assistant instance
 */
export function createOpusCodingAssistant(client, options = {}) {
  return new OpusCodingAssistant(client, options);
}

export default OpusCodingAssistant;
