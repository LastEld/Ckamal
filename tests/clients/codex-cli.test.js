/**
 * Tests for Codex CLI Client with GPT 5.3/5.4 Dual-Mode Support
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodexCliClient, MODEL_CONFIGS, TaskComplexityAnalyzer } from '../../src/clients/codex/cli.js';

describe('CodexCliClient - GPT 5.3/5.4 Dual-Mode', () => {
  let client;

  beforeEach(() => {
    client = new CodexCliClient({
      apiKey: 'test-key',
      preferApi: true
    });
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Model Configuration', () => {
    it('should have correct GPT 5.4 Codex configuration', () => {
      const config = MODEL_CONFIGS['gpt-5.4-codex'];
      expect(config).toBeDefined();
      expect(config.name).toBe('gpt-5.4-codex');
      expect(config.contextWindow).toBe(200000);
      expect(config.maxOutputTokens).toBe(8192);
      expect(config.costPer1kInput).toBe(0.015);
      expect(config.costPer1kOutput).toBe(0.060);
      expect(config.bestFor).toBe('complex_tasks');
    });

    it('should have correct GPT 5.3 Codex configuration', () => {
      const config = MODEL_CONFIGS['gpt-5.3-codex'];
      expect(config).toBeDefined();
      expect(config.name).toBe('gpt-5.3-codex');
      expect(config.contextWindow).toBe(128000);
      expect(config.maxOutputTokens).toBe(4096);
      expect(config.costPer1kInput).toBe(0.005);
      expect(config.costPer1kOutput).toBe(0.015);
      expect(config.bestFor).toBe('quick_tasks');
    });

    it('should default to GPT 5.4 Codex', () => {
      expect(client.model).toBe('gpt-5.4-codex');
    });
  });

  describe('Model Switching', () => {
    it('should switch to GPT 5.3 Codex', () => {
      const result = client.switchModel('gpt-5.3-codex');
      expect(result.success).toBe(true);
      expect(result.currentModel).toBe('gpt-5.3-codex');
      expect(client.model).toBe('gpt-5.3-codex');
    });

    it('should switch back to GPT 5.4 Codex', () => {
      client.switchModel('gpt-5.3-codex');
      const result = client.switchModel('gpt-5.4-codex');
      expect(result.success).toBe(true);
      expect(result.currentModel).toBe('gpt-5.4-codex');
    });

    it('should throw error for unknown model', () => {
      expect(() => client.switchModel('unknown-model')).toThrow('Unknown model');
    });
  });

  describe('Task Complexity Analysis', () => {
    it('should analyze simple task as low complexity', () => {
      const task = {
        description: 'Fix typo in readme'
      };
      const complexity = TaskComplexityAnalyzer.analyze(task);
      expect(complexity).toBeLessThan(0.5);
    });

    it('should analyze complex task as high complexity', () => {
      const task = {
        description: 'Design and implement a scalable microservices architecture with proper load balancing, service discovery, and fault tolerance mechanisms. Optimize for high throughput and low latency.',
        code: 'function complex() { /* 300 lines of code */ }',
        files: ['src/service1.js', 'src/service2.js', 'src/service3.js', 'src/service4.js', 'src/service5.js', 'src/service6.js']
      };
      const complexity = TaskComplexityAnalyzer.analyze(task);
      expect(complexity).toBeGreaterThan(0.4);
    });

    it('should estimate tokens correctly', () => {
      const task = {
        description: 'A'.repeat(400) // ~100 tokens
      };
      const tokens = TaskComplexityAnalyzer.estimateTokens(task);
      expect(tokens).toBeGreaterThanOrEqual(90);
      expect(tokens).toBeLessThanOrEqual(110);
    });
  });

  describe('Auto Model Selection', () => {
    it('should select GPT 5.3 for simple tasks', async () => {
      const task = {
        description: 'Fix typo'
      };
      const model = await client.autoSelectModel(task);
      expect(model).toBe('gpt-5.3-codex');
    });

    it('should select GPT 5.4 for large context tasks', async () => {
      const task = {
        description: 'Analyze code',
        code: 'x'.repeat(500000) // Large code block
      };
      const model = await client.autoSelectModel(task);
      expect(model).toBe('gpt-5.4-codex');
    });

    it('should select GPT 5.4 for multi-file tasks', async () => {
      const task = {
        description: 'Refactor codebase',
        files: ['file1.js', 'file2.js', 'file3.js', 'file4.js', 'file5.js', 'file6.js', 'file7.js']
      };
      const model = await client.autoSelectModel(task);
      expect(model).toBe('gpt-5.4-codex');
    });
  });

  describe('Cost Comparison', () => {
    it('should compare costs between models', () => {
      const task = {
        description: 'Implement a function to calculate fibonacci numbers'
      };
      const comparison = client.compareCosts(task);
      
      expect(comparison.estimates).toHaveProperty('gpt-5.4-codex');
      expect(comparison.estimates).toHaveProperty('gpt-5.3-codex');
      expect(comparison.recommendation).toBeDefined();
      expect(comparison.recommendation.cheapestModel).toBeDefined();
    });

    it('should recommend GPT 5.3 for cost savings on simple tasks', () => {
      const task = {
        description: 'Simple task'
      };
      const comparison = client.compareCosts(task);
      
      // GPT 5.3 should be cheaper
      expect(comparison.estimates['gpt-5.3-codex'].estimatedCost)
        .toBeLessThan(comparison.estimates['gpt-5.4-codex'].estimatedCost);
    });
  });

  describe('Performance Metrics', () => {
    it('should track requests', () => {
      expect(client.getMetrics().requests).toBe(0);
    });

    it('should track model usage', () => {
      client._updateMetrics('gpt-5.3-codex', 100, { total_tokens: 500 });
      const metrics = client.getMetrics();
      
      expect(metrics.requests).toBe(1);
      expect(metrics.modelUsage['gpt-5.3-codex']).toBeDefined();
      expect(metrics.modelUsage['gpt-5.3-codex'].requests).toBe(1);
    });

    it('should calculate average latency', () => {
      client._updateMetrics('gpt-5.3-codex', 100, { total_tokens: 100 });
      client._updateMetrics('gpt-5.3-codex', 200, { total_tokens: 100 });
      client._updateMetrics('gpt-5.3-codex', 300, { total_tokens: 100 });
      
      const metrics = client.getMetrics();
      expect(metrics.averageLatency).toBe(200);
    });
  });

  describe('Capabilities', () => {
    it('should report dual-mode capabilities', () => {
      const caps = client.getCapabilities();
      
      expect(caps.provider).toBe('codex');
      expect(caps.mode).toBe('cli');
      expect(caps.features).toContain('model_switching');
      expect(caps.features).toContain('auto_selection');
      expect(caps.features).toContain('cost_tracking');
      expect(caps.features).toContain('performance_metrics');
      expect(caps.availableModels).toContain('gpt-5.4-codex');
      expect(caps.availableModels).toContain('gpt-5.3-codex');
    });
  });

  describe('Batch Operations', () => {
    it('should queue tasks', () => {
      client.queueTask({ description: 'Task 1' });
      client.queueTask({ description: 'Task 2' });
      
      expect(client.batchQueue.length).toBe(2);
      expect(client.getMetrics().queueSize).toBe(2);
    });

    it('should return correct queue position', () => {
      const result1 = client.queueTask({ description: 'Task 1' });
      const result2 = client.queueTask({ description: 'Task 2' });
      
      expect(result1.position).toBe(1);
      expect(result2.position).toBe(2);
    });
  });
});

describe('TaskComplexityAnalyzer', () => {
  describe('Complexity Scoring', () => {
    it('should score high for complex architectural tasks', () => {
      const task = {
        description: 'Design a microservices architecture with proper service boundaries, event-driven communication, and distributed transaction handling'
      };
      const score = TaskComplexityAnalyzer.analyze(task);
      expect(score).toBeGreaterThan(0.5);
    });

    it('should score low for simple edits', () => {
      const task = {
        description: 'Change variable name from x to count'
      };
      const score = TaskComplexityAnalyzer.analyze(task);
      expect(score).toBeLessThan(0.4);
    });

    it('should consider code length', () => {
      const shortTask = {
        description: 'Review code',
        code: 'function test() { return 1; }'
      };
      const longTask = {
        description: 'Review code',
        code: '\n'.repeat(300) // 300 lines
      };
      
      expect(TaskComplexityAnalyzer.analyze(longTask))
        .toBeGreaterThan(TaskComplexityAnalyzer.analyze(shortTask));
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate higher cost for GPT 5.4', () => {
      const task = {
        description: 'Implement authentication system'
      };
      
      const estimate54 = TaskComplexityAnalyzer.estimateCost(task, 'gpt-5.4-codex');
      const estimate53 = TaskComplexityAnalyzer.estimateCost(task, 'gpt-5.3-codex');
      
      expect(estimate54.estimatedCost).toBeGreaterThan(estimate53.estimatedCost);
    });

    it('should include all cost components', () => {
      const task = {
        description: 'Test task'
      };
      
      const estimate = TaskComplexityAnalyzer.estimateCost(task, 'gpt-5.3-codex');
      
      expect(estimate).toHaveProperty('model');
      expect(estimate).toHaveProperty('estimatedInputTokens');
      expect(estimate).toHaveProperty('estimatedOutputTokens');
      expect(estimate).toHaveProperty('estimatedCost');
      expect(estimate).toHaveProperty('inputCost');
      expect(estimate).toHaveProperty('outputCost');
    });
  });
});
