import { EventEmitter } from 'events';

/**
 * Unit test runner for component-level testing
 */
export class UnitTestRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    this.timeout = options.timeout || 30000; // 30s default timeout
    this.parallel = options.parallel ?? true;
    this.maxConcurrency = options.maxConcurrency || 4;
    this.reporters = options.reporters || ['console'];
    this.coverageEnabled = options.coverage ?? true;
    this.testPattern = options.testPattern || '**/*.test.js';
    this.testCases = new Map();
    this.hooks = {
      beforeAll: [],
      afterAll: [],
      beforeEach: [],
      afterEach: []
    };
  }
  
  /**
   * Register a test case
   * @param {string} name - Test name
   * @param {Function} fn - Test function
   * @param {Object} options - Test options
   */
  test(name, fn, options = {}) {
    this.testCases.set(name, {
      name,
      fn,
      timeout: options.timeout || this.timeout,
      skip: options.skip || false,
      only: options.only || false,
      tags: options.tags || []
    });
  }
  
  /**
   * Register a skipped test
   * @param {string} name - Test name
   * @param {Function} fn - Test function
   */
  skip(name, fn) {
    this.testCases.set(name, { name, fn, skip: true });
  }
  
  /**
   * Register an exclusive test
   * @param {string} name - Test name
   * @param {Function} fn - Test function
   */
  only(name, fn) {
    this.testCases.set(name, { name, fn, only: true });
  }
  
  /**
   * Register beforeAll hook
   * @param {Function} fn - Hook function
   */
  beforeAll(fn) {
    this.hooks.beforeAll.push(fn);
  }
  
  /**
   * Register afterAll hook
   * @param {Function} fn - Hook function
   */
  afterAll(fn) {
    this.hooks.afterAll.push(fn);
  }
  
  /**
   * Register beforeEach hook
   * @param {Function} fn - Hook function
   */
  beforeEach(fn) {
    this.hooks.beforeEach.push(fn);
  }
  
  /**
   * Register afterEach hook
   * @param {Function} fn - Hook function
   */
  afterEach(fn) {
    this.hooks.afterEach.push(fn);
  }
  
  /**
   * Run unit tests
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Run options
   * @returns {Promise<Object>} Test results
   */
  async run(patchId, options = {}) {
    this.emit('run:start', { patchId, timestamp: new Date() });
    
    const startTime = Date.now();
    const results = {
      patchId,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      successRate: 0,
      duration: 0,
      failures: [],
      tests: []
    };
    
    try {
      // Execute beforeAll hooks
      await this.executeHooks('beforeAll');
      
      // Filter tests
      let testsToRun = Array.from(this.testCases.values());
      
      // Handle .only modifier
      const onlyTests = testsToRun.filter(t => t.only);
      if (onlyTests.length > 0) {
        testsToRun = onlyTests;
      }
      
      // Filter by tags if specified
      if (options.tags) {
        testsToRun = testsToRun.filter(t => 
          options.tags.some(tag => t.tags?.includes(tag))
        );
      }
      
      results.total = testsToRun.length;
      
      // Run tests
      if (this.parallel && !options.serial) {
        await this.runParallel(testsToRun, results, options);
      } else {
        await this.runSerial(testsToRun, results, options);
      }
      
      // Execute afterAll hooks
      await this.executeHooks('afterAll');
      
      results.duration = Date.now() - startTime;
      results.successRate = results.total > 0 
        ? results.passed / (results.total - results.skipped) 
        : 0;
      
      this.emit('run:complete', { results });
      
      return results;
    } catch (error) {
      results.duration = Date.now() - startTime;
      results.error = error.message;
      this.emit('run:error', { error });
      return results;
    }
  }
  
  /**
   * Run tests serially
   * @param {Array} tests - Tests to run
   * @param {Object} results - Results object
   * @param {Object} options - Run options
   * @private
   */
  async runSerial(tests, results, options) {
    for (const test of tests) {
      await this.runTest(test, results);
    }
  }
  
  /**
   * Run tests in parallel
   * @param {Array} tests - Tests to run
   * @param {Object} results - Results object
   * @param {Object} options - Run options
   * @private
   */
  async runParallel(tests, results, options) {
    const concurrency = options.concurrency || this.maxConcurrency;
    const chunks = this.chunkArray(tests, concurrency);
    
    for (const chunk of chunks) {
      await Promise.all(chunk.map(test => this.runTest(test, results)));
    }
  }
  
  /**
   * Run a single test
   * @param {Object} test - Test case
   * @param {Object} results - Results object
   * @private
   */
  async runTest(test, results) {
    this.emit('test:start', { name: test.name });
    
    if (test.skip) {
      results.skipped++;
      results.tests.push({ name: test.name, status: 'skipped' });
      this.emit('test:skip', { name: test.name });
      return;
    }
    
    const testStart = Date.now();
    
    try {
      // Execute beforeEach hooks
      await this.executeHooks('beforeEach');
      
      // Run test with timeout
      await this.runWithTimeout(test.fn, test.timeout);
      
      // Execute afterEach hooks
      await this.executeHooks('afterEach');
      
      results.passed++;
      results.tests.push({
        name: test.name,
        status: 'passed',
        duration: Date.now() - testStart
      });
      
      this.emit('test:pass', { name: test.name, duration: Date.now() - testStart });
    } catch (error) {
      results.failed++;
      const failure = {
        testName: test.name,
        message: error.message,
        stack: error.stack,
        duration: Date.now() - testStart
      };
      results.failures.push(failure);
      results.tests.push({
        name: test.name,
        status: 'failed',
        error: failure,
        duration: Date.now() - testStart
      });
      
      this.emit('test:fail', failure);
    }
  }
  
  /**
   * Execute hooks by type
   * @param {string} type - Hook type
   * @private
   */
  async executeHooks(type) {
    for (const hook of this.hooks[type]) {
      await hook();
    }
  }
  
  /**
   * Run function with timeout
   * @param {Function} fn - Function to run
   * @param {number} timeout - Timeout in ms
   * @returns {Promise}
   * @private
   */
  async runWithTimeout(fn, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Test timed out after ${timeout}ms`));
      }, timeout);
      
      Promise.resolve(fn())
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
  
  /**
   * Chunk array into smaller arrays
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array} Chunked array
   * @private
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  /**
   * Assertion utilities
   */
  assert = {
    equal: (actual, expected, message) => {
      if (actual !== expected) {
        throw new Error(message || `Expected ${expected} but got ${actual}`);
      }
    },
    
    notEqual: (actual, expected, message) => {
      if (actual === expected) {
        throw new Error(message || `Expected values to not be equal`);
      }
    },
    
    true: (value, message) => {
      if (value !== true) {
        throw new Error(message || `Expected true but got ${value}`);
      }
    },
    
    false: (value, message) => {
      if (value !== false) {
        throw new Error(message || `Expected false but got ${value}`);
      }
    },
    
    throws: async (fn, expectedError, message) => {
      try {
        await fn();
        throw new Error(message || 'Expected function to throw');
      } catch (error) {
        if (expectedError && !error.message.includes(expectedError)) {
          throw new Error(message || `Expected error containing "${expectedError}" but got "${error.message}"`);
        }
      }
    },
    
    asyncThrows: async (fn, expectedError, message) => {
      return this.assert.throws(fn, expectedError, message);
    },
    
    deepEqual: (actual, expected, message) => {
      const actualStr = JSON.stringify(actual);
      const expectedStr = JSON.stringify(expected);
      if (actualStr !== expectedStr) {
        throw new Error(message || `Expected deep equality but objects differ`);
      }
    },
    
    includes: (array, value, message) => {
      if (!array.includes(value)) {
        throw new Error(message || `Expected array to include ${value}`);
      }
    },
    
    match: (string, regex, message) => {
      if (!regex.test(string)) {
        throw new Error(message || `Expected string to match ${regex}`);
      }
    },
    
    greaterThan: (actual, expected, message) => {
      if (!(actual > expected)) {
        throw new Error(message || `Expected ${actual} to be greater than ${expected}`);
      }
    },
    
    lessThan: (actual, expected, message) => {
      if (!(actual < expected)) {
        throw new Error(message || `Expected ${actual} to be less than ${expected}`);
      }
    },
    
    approximately: (actual, expected, delta, message) => {
      if (Math.abs(actual - expected) > delta) {
        throw new Error(message || `Expected ${actual} to be approximately ${expected} (±${delta})`);
      }
    }
  };
  
  /**
   * Generate test report
   * @param {Object} results - Test results
   * @returns {string} Markdown report
   */
  generateReport(results) {
    let report = `# Unit Test Report\n\n`;
    report += `**Total:** ${results.total}\n`;
    report += `**Passed:** ✅ ${results.passed}\n`;
    report += `**Failed:** ❌ ${results.failed}\n`;
    report += `**Skipped:** ⏭️ ${results.skipped}\n`;
    report += `**Success Rate:** ${(results.successRate * 100).toFixed(1)}%\n`;
    report += `**Duration:** ${results.duration}ms\n\n`;
    
    if (results.failures.length > 0) {
      report += `## Failures\n\n`;
      for (const failure of results.failures) {
        report += `### ${failure.testName}\n\n`;
        report += `\`\`\`\n${failure.message}\n\n${failure.stack || ''}\n\`\`\`\n\n`;
      }
    }
    
    return report;
  }
}

export default UnitTestRunner;
