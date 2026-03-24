/**
 * Simple tests for Codex CLI Client
 * Run with: node tests/clients/codex-cli-simple.test.js
 */

import { CodexCliClient, MODEL_CONFIGS, TaskComplexityAnalyzer } from '../../src/clients/codex/cli.js';

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected value > ${expected}, got ${actual}`);
      }
    },
    toBeLessThan(expected) {
      if (!(actual < expected)) {
        throw new Error(`Expected value < ${expected}, got ${actual}`);
      }
    },
    toContain(expected) {
      if (!actual.includes(expected)) {
        throw new Error(`Expected array to contain ${expected}`);
      }
    }
  };
}

console.log('\n🧪 Codex CLI Client - GPT 5.3/5.4 Dual-Mode Tests\n');

// Model Configuration Tests
console.log('Model Configuration:');
test('should have correct GPT 5.4 Codex configuration', () => {
  const config = MODEL_CONFIGS['gpt-5.4-codex'];
  expect(config).toBeDefined();
  expect(config.name).toBe('gpt-5.4-codex');
  expect(config.contextWindow).toBe(200000);
  expect(config.maxOutputTokens).toBe(8192);
});

test('should have correct GPT 5.3 Codex configuration', () => {
  const config = MODEL_CONFIGS['gpt-5.3-codex'];
  expect(config).toBeDefined();
  expect(config.name).toBe('gpt-5.3-codex');
  expect(config.contextWindow).toBe(128000);
  expect(config.maxOutputTokens).toBe(4096);
});

// Client Tests
console.log('\nClient Configuration:');
const client = new CodexCliClient({ apiKey: 'test-key' });

test('should default to GPT 5.4 Codex', () => {
  expect(client.model).toBe('gpt-5.4-codex');
});

test('should have available models', () => {
  expect(client.availableModels.length).toBeGreaterThan(0);
  expect(client.availableModels).toContain('gpt-5.4-codex');
  expect(client.availableModels).toContain('gpt-5.3-codex');
});

// Model Switching Tests
console.log('\nModel Switching:');
test('should switch to GPT 5.3 Codex', () => {
  const result = client.switchModel('gpt-5.3-codex');
  expect(result.success).toBe(true);
  expect(result.currentModel).toBe('gpt-5.3-codex');
});

test('should switch back to GPT 5.4 Codex', () => {
  const result = client.switchModel('gpt-5.4-codex');
  expect(result.success).toBe(true);
  expect(result.currentModel).toBe('gpt-5.4-codex');
});

// Task Complexity Analysis Tests
console.log('\nTask Complexity Analysis:');
test('should analyze simple task as low complexity', () => {
  const task = { description: 'Fix typo in readme' };
  const complexity = TaskComplexityAnalyzer.analyze(task);
  expect(complexity).toBeLessThan(0.5);
});

test('should estimate tokens correctly', () => {
  const task = { description: 'A'.repeat(400) };
  const tokens = TaskComplexityAnalyzer.estimateTokens(task);
  expect(tokens).toBeGreaterThan(0);
});

// Cost Comparison Tests
console.log('\nCost Comparison:');
test('should compare costs between models', () => {
  const task = { description: 'Implement function' };
  const comparison = client.compareCosts(task);
  expect(comparison.estimates).toBeDefined();
  expect(comparison.estimates['gpt-5.4-codex']).toBeDefined();
  expect(comparison.estimates['gpt-5.3-codex']).toBeDefined();
});

// Capabilities Tests
console.log('\nCapabilities:');
test('should report dual-mode capabilities', () => {
  const caps = client.getCapabilities();
  expect(caps.provider).toBe('codex');
  expect(caps.features).toContain('model_switching');
  expect(caps.features).toContain('auto_selection');
});

// Batch Operations Tests
console.log('\nBatch Operations:');
test('should queue tasks', () => {
  client.queueTask({ description: 'Task 1' });
  client.queueTask({ description: 'Task 2' });
  expect(client.batchQueue.length).toBeGreaterThan(0);
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50) + '\n');

process.exit(failed > 0 ? 1 : 0);
