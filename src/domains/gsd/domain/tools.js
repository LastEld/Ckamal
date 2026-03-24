/**
 * @fileoverview GSD Tool Definitions - Task execution handlers
 * @module domains/gsd/domain/tools
 */

/**
 * Tool execution result
 * @typedef {Object} ToolResult
 * @property {boolean} success - Whether execution succeeded
 * @property {*} result - Execution result
 * @property {string} [error] - Error message if failed
 * @property {number} duration - Execution duration in ms
 */

/**
 * Tool definition
 * @typedef {Object} ToolDefinition
 * @property {string} name - Tool name
 * @property {string} description - Tool description
 * @property {Object} parameters - JSON Schema for parameters
 * @property {Function} handler - Execution handler
 */

/**
 * Manages GSD tool definitions and execution
 */
export class GSDTools {
  constructor() {
    /** @type {Map<string, ToolDefinition>} */
    this.tools = new Map();
    this.#registerDefaultTools();
  }

  /**
   * Registers a new tool
   * @param {string} name - Tool name
   * @param {ToolDefinition} definition - Tool definition
   * @returns {GSDTools} This instance for chaining
   */
  register(name, definition) {
    this.tools.set(name, {
      name,
      description: definition.description || '',
      parameters: definition.parameters || {},
      handler: definition.handler
    });
    return this;
  }

  /**
   * Unregisters a tool
   * @param {string} name - Tool name
   * @returns {boolean} True if tool was removed
   */
  unregister(name) {
    return this.tools.delete(name);
  }

  /**
   * Checks if a tool exists
   * @param {string} name - Tool name
   * @returns {boolean} True if tool exists
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * Gets a tool definition
   * @param {string} name - Tool name
   * @returns {ToolDefinition|undefined} Tool definition
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * Lists all registered tools
   * @returns {Array<{name: string, description: string}>} Tool list
   */
  list() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description
    }));
  }

  /**
   * Executes a tool
   * @param {string} name - Tool name
   * @param {Object} params - Tool parameters
   * @param {AbortSignal} [signal] - Abort signal
   * @returns {Promise<*>} Tool result
   * @throws {Error} If tool not found or execution fails
   */
  async execute(name, params, signal) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }

    if (signal?.aborted) {
      throw signal.reason || new Error('Execution aborted');
    }

    const startTime = Date.now();
    
    try {
      const result = await tool.handler(params, signal);
      
      return {
        success: true,
        result,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Validates parameters against tool schema
   * @param {string} name - Tool name
   * @param {Object} params - Parameters to validate
   * @returns {{valid: boolean, errors?: string[]}} Validation result
   */
  validateParams(name, params) {
    const tool = this.tools.get(name);
    if (!tool) {
      return { valid: false, errors: [`Tool "${name}" not found`] };
    }

    const errors = [];
    const schema = tool.parameters;

    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in params)) {
          errors.push(`Missing required parameter: ${required}`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, value] of Object.entries(params)) {
        const propSchema = schema.properties[key];
        if (!propSchema) {
          errors.push(`Unknown parameter: ${key}`);
          continue;
        }

        if (propSchema.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (actualType !== propSchema.type) {
            errors.push(`Parameter "${key}" should be ${propSchema.type}, got ${actualType}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Registers default GSD tools
   * @private
   */
  #registerDefaultTools() {
    // Analysis tools
    this.register('analyze', {
      description: 'Analyze code or project structure',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Target path or file' },
          type: { 
            type: 'string', 
            enum: ['structure', 'dependencies', 'complexity', 'all'],
            description: 'Analysis type'
          },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        },
        required: ['target']
      },
      handler: async (params) => {
        const { target, type = 'all' } = params;
        // Placeholder implementation
        return {
          target,
          analysisType: type,
          findings: [],
          timestamp: new Date().toISOString()
        };
      }
    });

    // Code generation
    this.register('generate', {
      description: 'Generate code or files',
      parameters: {
        type: 'object',
        properties: {
          template: { type: 'string', description: 'Template name' },
          output: { type: 'string', description: 'Output path' },
          variables: { type: 'object', description: 'Template variables' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        },
        required: ['template']
      },
      handler: async (params) => {
        const { template, output, variables = {} } = params;
        // Placeholder implementation
        return {
          template,
          output,
          generated: true,
          files: [],
          timestamp: new Date().toISOString()
        };
      }
    });

    // Code formatting
    this.register('format', {
      description: 'Format code using configured formatters',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Target file or directory' },
          prettier: { type: 'boolean', description: 'Use Prettier' },
          eslint: { type: 'boolean', description: 'Use ESLint fix' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        }
      },
      handler: async (params) => {
        const { target = '.', prettier = true, eslint = false } = params;
        // Placeholder implementation
        return {
          target,
          formatted: [],
          tools: { prettier, eslint },
          timestamp: new Date().toISOString()
        };
      }
    });

    // Linting
    this.register('lint', {
      description: 'Run linting on code',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Target path' },
          fix: { type: 'boolean', description: 'Auto-fix issues' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        }
      },
      handler: async (params) => {
        const { target = '.', fix = false } = params;
        // Placeholder implementation
        return {
          target,
          issues: [],
          fixed: fix ? 0 : undefined,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Testing
    this.register('test', {
      description: 'Run tests',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Test file pattern' },
          coverage: { type: 'boolean', description: 'Generate coverage report' },
          watch: { type: 'boolean', description: 'Watch mode' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        }
      },
      handler: async (params) => {
        const { pattern = '**/*.test.js', coverage = false, watch = false } = params;
        // Placeholder implementation
        return {
          pattern,
          passed: 0,
          failed: 0,
          skipped: 0,
          coverage: coverage ? {} : undefined,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Build
    this.register('build', {
      description: 'Build the project',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Build target' },
          production: { type: 'boolean', description: 'Production build' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        }
      },
      handler: async (params) => {
        const { target = 'dist', production = false } = params;
        // Placeholder implementation
        return {
          target,
          production,
          success: true,
          outputs: [],
          timestamp: new Date().toISOString()
        };
      }
    });

    // File operations
    this.register('readFile', {
      description: 'Read file contents',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          encoding: { type: 'string', description: 'File encoding' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        },
        required: ['path']
      },
      handler: async (params) => {
        const { promises: fs } = await import('fs');
        const { path: filePath, encoding = 'utf-8' } = params;
        const content = await fs.readFile(filePath, encoding);
        return { path: filePath, content, encoding };
      }
    });

    this.register('writeFile', {
      description: 'Write file contents',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'File content' },
          encoding: { type: 'string', description: 'File encoding' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        },
        required: ['path', 'content']
      },
      handler: async (params) => {
        const { promises: fs } = await import('fs');
        const path = await import('path');
        const { path: filePath, content, encoding = 'utf-8' } = params;
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, encoding);
        return { path: filePath, written: true };
      }
    });

    this.register('deleteFile', {
      description: 'Delete a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        },
        required: ['path']
      },
      handler: async (params) => {
        const { promises: fs } = await import('fs');
        const { path: filePath } = params;
        await fs.unlink(filePath);
        return { path: filePath, deleted: true };
      }
    });

    // Notification
    this.register('notify', {
      description: 'Send notification',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Notification message' },
          type: { 
            type: 'string', 
            enum: ['info', 'success', 'warning', 'error'],
            description: 'Notification type'
          },
          channel: { 
            type: 'string',
            enum: ['console', 'log', 'callback'],
            description: 'Notification channel'
          },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        },
        required: ['message']
      },
      handler: async (params) => {
        const { message, type = 'info', channel = 'console' } = params;
        if (channel === 'console') {
          const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
          console.log(`${icons[type]} ${message}`);
        }
        return { message, type, channel, sent: true };
      }
    });

    // Custom handler placeholder
    this.register('custom', {
      description: 'Custom task (requires handler registration)',
      parameters: {
        type: 'object',
        properties: {
          handler: { type: 'string', description: 'Handler function name' },
          params: { type: 'object', description: 'Handler parameters' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        }
      },
      handler: async (params) => {
        throw new Error('Custom tasks must have a registered handler');
      }
    });

    // Delay/wait
    this.register('delay', {
      description: 'Wait for specified duration',
      parameters: {
        type: 'object',
        properties: {
          duration: { type: 'number', description: 'Duration in milliseconds' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        },
        required: ['duration']
      },
      handler: async (params, signal) => {
        const { duration } = params;
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve({ waited: duration }), duration);
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(signal.reason || new Error('Delay cancelled'));
            });
          }
        });
      }
    });

    // HTTP request
    this.register('http', {
      description: 'Make HTTP request',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Request URL' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
          headers: { type: 'object' },
          body: { type: 'object' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        },
        required: ['url']
      },
      handler: async (params, signal) => {
        const { url, method = 'GET', headers = {}, body } = params;
        const fetch = globalThis.fetch || (await import('node-fetch')).default;
        
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal
        });

        const data = await response.json().catch(() => null);
        
        return {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers),
          data
        };
      }
    });

    // Shell command
    this.register('shell', {
      description: 'Execute shell command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          args: { type: 'array', items: { type: 'string' } },
          cwd: { type: 'string', description: 'Working directory' },
          env: { type: 'object', description: 'Environment variables' },
          timeout: { type: 'number', description: 'Timeout in ms' },
          context: { type: 'object' },
          previousResults: { type: 'object' }
        },
        required: ['command']
      },
      handler: async (params, signal) => {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);

        const { command, args = [], cwd, env, timeout = 60000 } = params;
        
        const result = await execFileAsync(command, args, {
          cwd,
          env: env ? { ...process.env, ...env } : undefined,
          timeout,
          signal
        });

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: 0
        };
      }
    });
  }
}

// Export singleton instance
export const gsdTools = new GSDTools();
export default GSDTools;
