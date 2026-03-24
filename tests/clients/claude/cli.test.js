/**
 * Claude CLI Client Tests
 * Tests for Claude Sonnet 4.6 integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeCliClient } from '../../../src/clients/claude/cli.js';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync, readdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

describe('ClaudeCliClient', () => {
  let client;
  let testDir;

  beforeEach(() => {
    testDir = join(os.tmpdir(), `claude-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    client = new ClaudeCliClient({
      apiKey: 'test-key',
      preferApi: true
    });
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
    
    // Cleanup test files
    try {
      if (existsSync(testDir)) {
        const files = readdirSync(testDir);
        for (const file of files) {
          const filePath = join(testDir, file);
          const stat = require('fs').statSync(filePath);
          if (stat.isDirectory()) {
            const subFiles = readdirSync(filePath);
            for (const subFile of subFiles) {
              unlinkSync(join(filePath, subFile));
            }
            rmdirSync(filePath);
          } else {
            unlinkSync(filePath);
          }
        }
        rmdirSync(testDir);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should create client with default config', () => {
      const defaultClient = new ClaudeCliClient();
      expect(defaultClient.provider).toBe('claude');
      expect(defaultClient.mode).toBe('cli');
      expect(defaultClient.model).toBe('claude-sonnet-4-6');
    });

    it('should create client with custom config', () => {
      const customClient = new ClaudeCliClient({
        name: 'custom-claude',
        model: 'claude-opus-4',
        apiKey: 'custom-key'
      });
      expect(customClient.name).toBe('custom-claude');
      expect(customClient.model).toBe('claude-opus-4');
      expect(customClient.apiKey).toBe('custom-key');
    });

    it('should get capabilities', () => {
      const caps = client.getCapabilities();
      expect(caps.provider).toBe('claude');
      expect(caps.mode).toBe('cli');
      expect(caps.contextWindow).toBe(200000);
      expect(caps.features).toContain('code_analysis');
      expect(caps.features).toContain('code_generation');
      expect(caps.features).toContain('code_review');
      expect(caps.features).toContain('interactive_mode');
      expect(caps.features).toContain('batch_processing');
    });
  });

  describe('Language Detection', () => {
    it('should detect JavaScript files', () => {
      expect(client._detectLanguage('test.js')).toBe('javascript');
      expect(client._detectLanguage('test.jsx')).toBe('jsx');
    });

    it('should detect TypeScript files', () => {
      expect(client._detectLanguage('test.ts')).toBe('typescript');
      expect(client._detectLanguage('test.tsx')).toBe('tsx');
    });

    it('should detect Python files', () => {
      expect(client._detectLanguage('test.py')).toBe('python');
    });

    it('should detect various languages', () => {
      expect(client._detectLanguage('test.java')).toBe('java');
      expect(client._detectLanguage('test.go')).toBe('go');
      expect(client._detectLanguage('test.rs')).toBe('rust');
      expect(client._detectLanguage('test.cpp')).toBe('cpp');
      expect(client._detectLanguage('test.rb')).toBe('ruby');
    });

    it('should return text for unknown extensions', () => {
      expect(client._detectLanguage('test.unknown')).toBe('text');
      expect(client._detectLanguage('test')).toBe('text');
    });
  });

  describe('Project Context', () => {
    it('should load project context', async () => {
      // Create test project structure
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        description: 'Test project'
      }));
      
      mkdirSync(join(testDir, 'src'), { recursive: true });
      writeFileSync(join(testDir, 'src', 'index.js'), 'console.log("test");');

      const context = await client.loadProjectContext(testDir);
      
      expect(context.path).toBe(testDir);
      expect(context.packageInfo).toBeDefined();
      expect(context.packageInfo.name).toBe('test-project');
      expect(context.structure).toBeDefined();
      expect(context.structure.length).toBeGreaterThan(0);
    });

    it('should get project context prompt', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'test-project',
        description: 'Test description'
      }));

      await client.loadProjectContext(testDir);
      const prompt = client.getProjectContextPrompt(testDir);
      
      expect(prompt).toContain('Project Context');
      expect(prompt).toContain('test-project');
    });
  });

  describe('System Prompts', () => {
    it('should return base prompt by default', () => {
      const prompt = client._getSystemPrompt({});
      expect(prompt).toContain('Claude');
    });

    it('should return coding prompt for coding context', () => {
      const prompt = client._getSystemPrompt({ context: 'coding' });
      expect(prompt).toContain('software engineer');
      expect(prompt).toContain('best practices');
    });

    it('should return analysis prompt for analysis context', () => {
      const prompt = client._getSystemPrompt({ context: 'analysis' });
      expect(prompt).toContain('code analysis');
    });

    it('should return review prompt for review context', () => {
      const prompt = client._getSystemPrompt({ context: 'review' });
      expect(prompt).toContain('code review');
    });

    it('should use custom system prompt if provided', () => {
      const custom = 'Custom system prompt';
      const prompt = client._getSystemPrompt({ system: custom });
      expect(prompt).toBe(custom);
    });
  });

  describe('Task Building', () => {
    it('should build from command', () => {
      const task = { command: 'test command' };
      expect(client._buildTaskCommand(task)).toBe('test command');
    });

    it('should build from description', () => {
      const task = { description: 'test description' };
      expect(client._buildTaskCommand(task)).toBe('test description');
    });

    it('should build from code', () => {
      const task = { code: 'const x = 1;' };
      const result = client._buildTaskCommand(task);
      expect(result).toContain('Analyze and improve');
      expect(result).toContain('const x = 1;');
    });

    it('should include instructions', () => {
      const task = { 
        description: 'test',
        code: 'code',
        instructions: 'do this'
      };
      const result = client._buildTaskCommand(task);
      expect(result).toContain('test');
      expect(result).toContain('code');
      expect(result).toContain('do this');
    });

    it('should throw on empty task', () => {
      expect(() => client._buildTaskCommand({})).toThrow();
    });
  });

  describe('Code Operations', () => {
    beforeEach(() => {
      // Mock API calls
      client._sendViaApi = async (message) => ({
        content: `Mocked response for: ${message.content.substring(0, 50)}...`,
        usage: { input_tokens: 100, output_tokens: 50 }
      });
      client.status = 'ready';
      client.updateHealth({ connected: true });
    });

    it('should analyze code file', async () => {
      const testFile = join(testDir, 'test.js');
      writeFileSync(testFile, 'function test() { return 42; }');

      const result = await client.codeAnalyze(testFile);
      expect(result.content).toContain('Mocked response');
      expect(result.usage).toBeDefined();
    });

    it('should throw on missing file for analyze', async () => {
      await expect(client.codeAnalyze('/nonexistent/file.js')).rejects.toThrow('File not found');
    });

    it('should generate code', async () => {
      const result = await client.codeGenerate('Create a helper function', 'javascript');
      expect(result.content).toContain('Mocked response');
    });

    it('should review code file', async () => {
      const testFile = join(testDir, 'test.js');
      writeFileSync(testFile, 'function test() { return 42; }');

      const result = await client.codeReview(testFile);
      expect(result.content).toContain('Mocked response');
    });

    it('should explain code file', async () => {
      const testFile = join(testDir, 'test.js');
      writeFileSync(testFile, 'function test() { return 42; }');

      const result = await client.explainCode(testFile);
      expect(result.content).toContain('Mocked response');
    });

    it('should analyze multiple files', async () => {
      const file1 = join(testDir, 'a.js');
      const file2 = join(testDir, 'b.js');
      writeFileSync(file1, 'const a = 1;');
      writeFileSync(file2, 'const b = 2;');

      const result = await client.analyzeMultipleFiles([file1, file2]);
      expect(result.content).toContain('Mocked response');
    });
  });

  describe('Status Management', () => {
    it('should track connection status', () => {
      expect(client.isConnected()).toBe(false);
      
      client.updateHealth({ connected: true });
      expect(client.isConnected()).toBe(true);
      
      client.updateHealth({ connected: false });
      expect(client.isConnected()).toBe(false);
    });

    it('should return status object', () => {
      client.updateHealth({ connected: true });
      const status = client.getStatus();
      
      expect(status.id).toBeDefined();
      expect(status.name).toBe('claude-sonnet-4.6');
      expect(status.provider).toBe('claude');
      expect(status.status).toBeDefined();
      expect(status.health).toBeDefined();
      expect(status.capabilities).toBeDefined();
    });
  });
});
