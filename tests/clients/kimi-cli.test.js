/**
 * Kimi 2.5 CLI Client Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KimiCliClient } from '../../src/clients/kimi/cli.js';
import { ANALYSIS_TYPES, CHINESE_OPT_TYPES } from '../../src/clients/kimi/index.js';

describe('KimiCliClient', () => {
  let client;

  beforeAll(async () => {
    client = new KimiCliClient({
      apiKey: process.env.MOONSHOT_API_KEY || 'test-key',
      features: {
        thinkingMode: true,
        multimodal: true,
        longContext: true,
        chineseOptimization: true
      }
    });
  });

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Initialization', () => {
    it('should create client with correct configuration', () => {
      expect(client.provider).toBe('kimi');
      expect(client.mode).toBe('cli');
      expect(client.maxContextTokens).toBe(256000);
      expect(client.features.thinkingMode).toBe(true);
      expect(client.features.multimodal).toBe(true);
      expect(client.features.longContext).toBe(true);
      expect(client.features.chineseOptimization).toBe(true);
    });

    it('should have correct capabilities', () => {
      const caps = client.getCapabilities();
      expect(caps.provider).toBe('kimi');
      expect(caps.contextWindow).toBe(256000);
      expect(caps.features).toContain('long_context');
      expect(caps.features).toContain('thinking_mode');
      expect(caps.features).toContain('multimodal');
      expect(caps.features).toContain('chinese_optimization');
      expect(caps.features).toContain('batch_code_review');
      expect(caps.features).toContain('multi_file_refactoring');
      expect(caps.features).toContain('documentation_generation');
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens for English text', () => {
      const text = 'Hello world'.repeat(10); // ~110 chars
      const tokens = client._estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(50);
    });

    it('should estimate tokens for Chinese text', () => {
      const text = '你好世界'.repeat(10); // 40 Chinese chars
      const tokens = client._estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(30);
    });

    it('should estimate tokens for mixed content', () => {
      const content = [
        { content: 'Hello world' },
        { content: '你好世界' }
      ];
      const tokens = client._estimateTokens(content);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('Long Context Analysis', () => {
    it('should build correct analysis prompt', () => {
      const files = [
        { path: './test.js', name: 'test.js', content: 'console.log("test")', tokens: 10 }
      ];
      
      const prompt = client._buildLongContextPrompt(files, 'comprehensive', {
        question: 'What does this do?'
      });

      expect(prompt).toContain('Long Context Analysis Task');
      expect(prompt).toContain('test.js');
      expect(prompt).toContain('What does this do?');
      expect(prompt).toContain('console.log');
    });

    it('should get correct analysis request for each type', () => {
      const types = ['comprehensive', 'refactor', 'review', 'documentation', 'dependencies'];
      
      for (const type of types) {
        const request = client._getAnalysisRequest(type, {});
        expect(request).toBeTruthy();
        expect(typeof request).toBe('string');
      }
    });
  });

  describe('Thinking Mode', () => {
    it('should build correct thinking prompt', () => {
      const prompt = client._buildThinkingPrompt('How to solve X?', {
        context: 'Background info',
        constraints: 'Limited budget',
        examples: 'Example solution'
      });

      expect(prompt).toContain('How to solve X?');
      expect(prompt).toContain('Background info');
      expect(prompt).toContain('Limited budget');
      expect(prompt).toContain('Example solution');
    });
  });

  describe('Chinese Optimization', () => {
    it('should build correct optimization prompt', () => {
      const code = 'function test() {}';
      const prompt = client._buildChineseOptimizationPrompt(code, 'text_processing', {
        requirements: 'Handle Chinese text',
        targetLanguage: 'python'
      });

      expect(prompt).toContain('function test() {}');
      expect(prompt).toContain('Handle Chinese text');
      expect(prompt).toContain('python');
    });

    it('should have all optimization types defined', () => {
      const types = ['general', 'text_processing', 'search', 'display', 'storage', 'custom'];
      for (const type of types) {
        const prompt = client._buildChineseOptimizationPrompt('code', type, {});
        expect(prompt).toBeTruthy();
      }
    });
  });

  describe('Documentation Generation', () => {
    it('should get correct system prompt for each doc type', () => {
      const types = ['api', 'readme', 'architecture', 'custom'];
      
      for (const type of types) {
        const prompt = client._getDocSystemPrompt(type);
        expect(prompt).toBeTruthy();
        expect(typeof prompt).toBe('string');
      }
    });
  });

  describe('Message Building', () => {
    it('should build messages with system prompt', () => {
      const messages = client._buildMessages('Hello', { system: 'You are helpful' });
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('You are helpful');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toBe('Hello');
    });

    it('should build messages with Chinese system prompt', () => {
      const messages = client._buildMessages('Hello', { chinese: true });
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('月之暗面');
    });

    it('should include message history', () => {
      const history = [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' }
      ];
      const messages = client._buildMessages('New question', { messages: history });
      expect(messages).toHaveLength(4); // system + 2 history + new
    });
  });

  describe('Task Prompt Building', () => {
    it('should build task prompt with all fields', () => {
      const task = {
        description: 'Fix bug',
        code: 'const x = 1',
        instructions: 'Make it better',
        language: 'javascript'
      };
      
      const prompt = client._buildTaskPrompt(task);
      expect(prompt).toContain('Fix bug');
      expect(prompt).toContain('const x = 1');
      expect(prompt).toContain('Make it better');
    });

    it('should handle task with only description', () => {
      const prompt = client._buildTaskPrompt({ description: 'Test task' });
      expect(prompt).toContain('Test task');
    });
  });

  describe('Feature Flags', () => {
    it('should throw when long context is disabled', async () => {
      const disabledClient = new KimiCliClient({
        features: { longContext: false }
      });

      await expect(disabledClient.longContextAnalyze([], {}))
        .rejects.toThrow('Long context feature is disabled');
    });

    it('should throw when thinking mode is disabled', async () => {
      const disabledClient = new KimiCliClient({
        features: { thinkingMode: false }
      });

      await expect(disabledClient.thinkingMode('test'))
        .rejects.toThrow('Thinking mode feature is disabled');
    });

    it('should throw when multimodal is disabled', async () => {
      const disabledClient = new KimiCliClient({
        features: { multimodal: false }
      });

      await expect(disabledClient.multimodalAnalyze('/fake/path.png', 'test'))
        .rejects.toThrow('Multimodal feature is disabled');
    });

    it('should throw when Chinese optimization is disabled', async () => {
      const disabledClient = new KimiCliClient({
        features: { chineseOptimization: false }
      });

      await expect(disabledClient.chineseOptimization('code'))
        .rejects.toThrow('Chinese optimization feature is disabled');
    });
  });
});

describe('Kimi Client Constants', () => {
  it('should have all analysis types', () => {
    expect(ANALYSIS_TYPES.COMPREHENSIVE).toBe('comprehensive');
    expect(ANALYSIS_TYPES.REFACTOR).toBe('refactor');
    expect(ANALYSIS_TYPES.REVIEW).toBe('review');
    expect(ANALYSIS_TYPES.DOCUMENTATION).toBe('documentation');
    expect(ANALYSIS_TYPES.DEPENDENCIES).toBe('dependencies');
    expect(ANALYSIS_TYPES.CUSTOM).toBe('custom');
  });

  it('should have all Chinese optimization types', () => {
    expect(CHINESE_OPT_TYPES.GENERAL).toBe('general');
    expect(CHINESE_OPT_TYPES.TEXT_PROCESSING).toBe('text_processing');
    expect(CHINESE_OPT_TYPES.SEARCH).toBe('search');
    expect(CHINESE_OPT_TYPES.DISPLAY).toBe('display');
    expect(CHINESE_OPT_TYPES.STORAGE).toBe('storage');
    expect(CHINESE_OPT_TYPES.CUSTOM).toBe('custom');
  });
});
