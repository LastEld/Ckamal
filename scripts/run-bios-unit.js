#!/usr/bin/env node
/**
 * BIOS Unit Test Runner Adapter
 * 
 * Запускает unit-тесты через BIOS UnitTestRunner
 * Использование: node scripts/run-bios-unit.js [options]
 */

import { UnitTestRunner } from '../src/bios/test-runners/unit.js';
import { glob } from 'fs/promises';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  pattern: '**/*.test.js',
  coverage: args.includes('--coverage'),
  watch: args.includes('--watch'),
  serial: args.includes('--serial'),
  tags: []
};

// Parse --tag argument
const tagIndex = args.indexOf('--tag');
if (tagIndex !== -1 && args[tagIndex + 1]) {
  options.tags = [args[tagIndex + 1]];
}

// Parse --pattern argument
const patternIndex = args.indexOf('--pattern');
if (patternIndex !== -1 && args[patternIndex + 1]) {
  options.pattern = args[patternIndex + 1];
}

async function discoverTests(pattern) {
  const testsDir = join(__dirname, '..', 'tests', 'unit');
  const testFiles = [];
  
  try {
    const files = await glob(`${testsDir}/**/*.test.js`);
    for await (const file of files) {
      testFiles.push(file);
    }
  } catch (error) {
    console.log('ℹ️  No unit tests directory found or empty');
  }
  
  return testFiles;
}

async function loadTestFile(filePath, runner) {
  try {
    // Create a test context that mimics Jest/Jasmine API
    const context = {
      describe: (name, fn) => {
        // Group tests under describe blocks
        const originalTest = runner.test.bind(runner);
        runner.test = (testName, testFn, opts) => {
          return originalTest(`${name} › ${testName}`, testFn, opts);
        };
        fn();
        runner.test = originalTest;
      },
      it: (name, fn, opts) => runner.test(name, fn, opts),
      test: (name, fn, opts) => runner.test(name, fn, opts),
      beforeAll: (fn) => runner.beforeAll(fn),
      afterAll: (fn) => runner.afterAll(fn),
      beforeEach: (fn) => runner.beforeEach(fn),
      afterEach: (fn) => runner.afterEach(fn),
      expect: createExpectAPI(runner)
    };
    
    // Make context available globally for test files
    global.describe = context.describe;
    global.it = context.it;
    global.test = context.test;
    global.beforeAll = context.beforeAll;
    global.afterAll = context.afterAll;
    global.beforeEach = context.beforeEach;
    global.afterEach = context.afterEach;
    global.expect = context.expect;
    
    // Import the test file
    await import(filePath);
    
  } catch (error) {
    console.error(`❌ Failed to load test file ${filePath}:`, error.message);
  }
}

function createExpectAPI(runner) {
  return (actual) => ({
    toBe: (expected) => runner.assert.equal(actual, expected),
    toEqual: (expected) => runner.assert.deepEqual(actual, expected),
    toBeTruthy: () => runner.assert.true(!!actual),
    toBeFalsy: () => runner.assert.false(!!actual),
    toBeGreaterThan: (expected) => runner.assert.greaterThan(actual, expected),
    toBeLessThan: (expected) => runner.assert.lessThan(actual, expected),
    toBeNull: () => runner.assert.equal(actual, null),
    toBeUndefined: () => runner.assert.equal(actual, undefined),
    toContain: (expected) => runner.assert.includes(actual, expected),
    toMatch: (expected) => runner.assert.match(actual, expected),
    toThrow: async (expected) => {
      if (typeof actual === 'function') {
        await runner.assert.throws(actual, expected);
      }
    },
    not: {
      toBe: (expected) => runner.assert.notEqual(actual, expected),
      toEqual: (expected) => {
        try {
          runner.assert.deepEqual(actual, expected);
          throw new Error('Expected objects to not be equal');
        } catch (e) {
          if (!e.message.includes('Expected objects to not be equal')) throw e;
        }
      },
      toContain: (expected) => {
        if (actual.includes(expected)) {
          throw new Error(`Expected array to not contain ${expected}`);
        }
      }
    }
  });
}

async function main() {
  console.log('🧪 BIOS Unit Test Runner\n');
  
  const runner = new UnitTestRunner({
    coverage: options.coverage,
    parallel: !options.serial,
    reporters: ['console']
  });
  
  // Set up event listeners
  runner.on('run:start', ({ patchId }) => {
    console.log(`Starting test run: ${patchId}\n`);
  });
  
  runner.on('test:start', ({ name }) => {
    console.log(`  ⏳ ${name}`);
  });
  
  runner.on('test:pass', ({ name, duration }) => {
    console.log(`  ✅ ${name} (${duration}ms)`);
  });
  
  runner.on('test:fail', ({ testName, message }) => {
    console.log(`  ❌ ${testName}`);
    console.log(`     ${message}`);
  });
  
  runner.on('test:skip', ({ name }) => {
    console.log(`  ⏭️  ${name}`);
  });
  
  // Discover and load test files
  const testFiles = await discoverTests(options.pattern);
  console.log(`Found ${testFiles.length} test file(s)\n`);
  
  for (const file of testFiles) {
    await loadTestFile(file, runner);
  }
  
  // Generate a unique patch ID for this test run
  const patchId = `unit-test-${Date.now()}`;
  
  // Run tests
  const results = await runner.run(patchId, {
    tags: options.tags,
    serial: options.serial
  });
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('Test Summary');
  console.log('='.repeat(50));
  console.log(`Total:    ${results.total}`);
  console.log(`Passed:   ${results.passed} ✅`);
  console.log(`Failed:   ${results.failed} ❌`);
  console.log(`Skipped:  ${results.skipped} ⏭️`);
  console.log(`Duration: ${results.duration}ms`);
  console.log(`Success:  ${(results.successRate * 100).toFixed(1)}%`);
  
  if (results.failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of results.failures) {
      console.log(`\n  ❌ ${failure.testName}`);
      console.log(`     ${failure.message}`);
    }
  }
  
  console.log('\n' + runner.generateReport(results));
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
