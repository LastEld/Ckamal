/**
 * Tests for GPT 5.3 Codex Application Client
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GPT54CodexAppClient } from '../../../src/clients/codex/app.js';

describe('GPT54CodexAppClient', () => {
  let client;

  beforeEach(() => {
    client = new GPT54CodexAppClient({
      apiKey: 'test-api-key',
      costEffective: true
    });
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(client.provider).toBe('openai');
      expect(client.mode).toBe('app');
      expect(client.model).toBe('gpt-5.3-codex');
      expect(client.costEffective).toBe(true);
      expect(client.timeout).toBe(30000);
    });

    it('should accept custom configuration', () => {
      const customClient = new GPT54CodexAppClient({
        apiKey: 'custom-key',
        model: 'gpt-5.3-codex-custom',
        timeout: 60000,
        costEffective: false
      });

      expect(customClient.apiKey).toBe('custom-key');
      expect(customClient.model).toBe('gpt-5.3-codex-custom');
      expect(customClient.timeout).toBe(60000);
      expect(customClient.costEffective).toBe(false);
    });
  });

  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const caps = client.getCapabilities();

      expect(caps.provider).toBe('openai');
      expect(caps.mode).toBe('app');
      expect(caps.model).toBe('gpt-5.3-codex');
      expect(caps.features).toContain('quick_completion');
      expect(caps.features).toContain('code_generation');
      expect(caps.features).toContain('refactoring');
      expect(caps.features).toContain('test_generation');
      expect(caps.features).toContain('cost_optimization');
      expect(caps.features).toContain('fallback_support');
      expect(caps.costOptimized).toBe(true);
      expect(caps.responseTime).toBe('fast');
    });
  });

  describe('utility methods', () => {
    it('should detect JavaScript language', () => {
      const jsCode = 'function test() { return true; }';
      expect(client._detectLanguage(jsCode)).toBe('javascript');
    });

    it('should detect Python language', () => {
      const pyCode = 'def test():\n    return True';
      expect(client._detectLanguage(pyCode)).toBe('python');
    });

    it('should extract function name', () => {
      const code = 'function myFunction() { }';
      expect(client._extractFunctionName(code)).toBe('myFunction');
    });

    it('should extract code from markdown', () => {
      const content = '```javascript\nconst x = 1;\n```';
      expect(client._extractCode(content, 'javascript')).toBe('const x = 1;');
    });

    it('should return default test framework', () => {
      expect(client._getDefaultTestFramework('javascript')).toBe('Jest');
      expect(client._getDefaultTestFramework('python')).toBe('pytest');
    });
  });

  describe('task prompt building', () => {
    it('should build task prompt with description', () => {
      const task = {
        description: 'Test task',
        code: 'const x = 1;',
        language: 'javascript',
        instructions: 'Do something'
      };

      const prompt = client._buildTaskPrompt(task);

      expect(prompt).toContain('Test task');
      expect(prompt).toContain('const x = 1;');
      expect(prompt).toContain('Do something');
    });

    it('should get system prompt for different task types', () => {
      expect(client._getSystemPromptForTask('refactor')).toContain('refactoring');
      expect(client._getSystemPromptForTask('generate')).toContain('generator');
      expect(client._getSystemPromptForTask('test')).toContain('test engineer');
      expect(client._getSystemPromptForTask('unknown')).toContain('GPT 5.3');
    });
  });

  describe('stats tracking', () => {
    it('should return initial stats', () => {
      const stats = client.getStats();

      expect(stats.requests).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.cacheSize).toBe(0);
    });

    it('should clear cache', () => {
      client.responseCache.set('test', { data: 'value' });
      expect(client.responseCache.size).toBe(1);

      client.clearCache();
      expect(client.responseCache.size).toBe(0);
    });
  });
});

describe('GPT54CodexAppClient Integration', () => {
  it('should be instantiable via ClientFactory', async () => {
    const { ClientFactory } = await import('../../../src/clients/index.js');
    
    const client = await ClientFactory.create('codex', 'app', {
      apiKey: 'test-key'
    });

    expect(client).toBeDefined();
    expect(client.constructor.name).toBe('GPT54CodexAppClient');
  });

  it('should export GPT54CodexAppClient from codex index', async () => {
    const { GPT54CodexAppClient } = await import('../../../src/clients/codex/index.js');
    expect(GPT54CodexAppClient).toBeDefined();
  });

  it('should export GPT54CodexAppClient from main clients index', async () => {
    const { GPT54CodexAppClient } = await import('../../../src/clients/index.js');
    expect(GPT54CodexAppClient).toBeDefined();
  });
});
