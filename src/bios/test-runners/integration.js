import { EventEmitter } from 'events';

/**
 * Integration test runner for end-to-end testing
 */
export class IntegrationTestRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    this.timeout = options.timeout || 60000; // 60s default timeout
    this.setupTimeout = options.setupTimeout || 30000;
    this.teardownTimeout = options.teardownTimeout || 30000;
    this.scenarios = new Map();
    this.services = new Map();
    this.fixtures = new Map();
    this.globalState = {};
  }
  
  /**
   * Register a test scenario
   * @param {string} name - Scenario name
   * @param {Object} config - Scenario configuration
   * @param {Function} config.setup - Setup function
   * @param {Function} config.test - Test function
   * @param {Function} config.teardown - Teardown function
   * @param {Object} config.dependencies - Service dependencies
   * @param {Array} config.fixtures - Required fixtures
   */
  scenario(name, config) {
    this.scenarios.set(name, {
      name,
      setup: config.setup || (async () => {}),
      test: config.test,
      teardown: config.teardown || (async () => {}),
      dependencies: config.dependencies || {},
      fixtures: config.fixtures || [],
      timeout: config.timeout || this.timeout,
      skip: config.skip || false,
      tags: config.tags || []
    });
  }
  
  /**
   * Register a service mock/stub
   * @param {string} name - Service name
   * @param {Object} service - Service implementation
   */
  registerService(name, service) {
    this.services.set(name, service);
  }
  
  /**
   * Register a test fixture
   * @param {string} name - Fixture name
   * @param {Function} loader - Fixture loader function
   */
  registerFixture(name, loader) {
    this.fixtures.set(name, loader);
  }
  
  /**
   * Run integration tests
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
      scenarios: []
    };
    
    try {
      // Filter scenarios
      let scenariosToRun = Array.from(this.scenarios.values());
      
      if (options.tags) {
        scenariosToRun = scenariosToRun.filter(s => 
          options.tags.some(tag => s.tags?.includes(tag))
        );
      }
      
      if (options.scenarios) {
        scenariosToRun = scenariosToRun.filter(s => 
          options.scenarios.includes(s.name)
        );
      }
      
      results.total = scenariosToRun.length;
      
      // Run scenarios
      for (const scenario of scenariosToRun) {
        await this.runScenario(scenario, results, options);
      }
      
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
   * Run a single scenario
   * @param {Object} scenario - Scenario configuration
   * @param {Object} results - Results object
   * @param {Object} options - Run options
   * @private
   */
  async runScenario(scenario, results, options) {
    this.emit('scenario:start', { name: scenario.name });
    
    if (scenario.skip) {
      results.skipped++;
      results.scenarios.push({ name: scenario.name, status: 'skipped' });
      this.emit('scenario:skip', { name: scenario.name });
      return;
    }
    
    const scenarioStart = Date.now();
    const scenarioState = {};
    let services = {};
    
    try {
      // Load fixtures
      const fixtures = await this.loadFixtures(scenario.fixtures);
      
      // Initialize dependencies
      services = await this.initializeDependencies(scenario.dependencies);
      
      // Setup scenario
      await this.runWithTimeout(
        () => scenario.setup({ services, fixtures, state: scenarioState, global: this.globalState }),
        this.setupTimeout
      );
      
      // Run test
      await this.runWithTimeout(
        () => scenario.test({ services, fixtures, state: scenarioState, global: this.globalState }),
        scenario.timeout
      );
      
      // Teardown
      await this.runWithTimeout(
        () => scenario.teardown({ services, state: scenarioState, global: this.globalState }),
        this.teardownTimeout
      );
      
      // Cleanup services
      await this.cleanupDependencies(services);
      
      results.passed++;
      results.scenarios.push({
        name: scenario.name,
        status: 'passed',
        duration: Date.now() - scenarioStart
      });
      
      this.emit('scenario:pass', {
        name: scenario.name,
        duration: Date.now() - scenarioStart
      });
    } catch (error) {
      results.failed++;
      
      // Attempt teardown even on failure
      try {
        await this.runWithTimeout(
          () => scenario.teardown({ services, state: scenarioState, global: this.globalState }),
          this.teardownTimeout
        );
      } catch (teardownError) {
        // Log teardown error but don't override original error
        this.emit('scenario:teardown-error', { scenario: scenario.name, error: teardownError.message });
      }
      
      // Cleanup services
      try {
        await this.cleanupDependencies(services);
      } catch (cleanupError) {
        this.emit('scenario:cleanup-error', { scenario: scenario.name, error: cleanupError.message });
      }
      
      const failure = {
        testName: scenario.name,
        message: error.message,
        stack: error.stack,
        duration: Date.now() - scenarioStart,
        scenario: scenario.name
      };
      results.failures.push(failure);
      results.scenarios.push({
        name: scenario.name,
        status: 'failed',
        error: failure,
        duration: Date.now() - scenarioStart
      });
      
      this.emit('scenario:fail', failure);
    }
  }
  
  /**
   * Load fixtures
   * @param {Array} fixtureNames - Fixture names to load
   * @returns {Promise<Object>} Loaded fixtures
   * @private
   */
  async loadFixtures(fixtureNames) {
    const fixtures = {};
    
    for (const name of fixtureNames) {
      const loader = this.fixtures.get(name);
      if (loader) {
        fixtures[name] = await loader();
      }
    }
    
    return fixtures;
  }
  
  /**
   * Initialize service dependencies
   * @param {Object} dependencies - Dependencies configuration
   * @returns {Promise<Object>} Initialized services
   * @private
   */
  async initializeDependencies(dependencies) {
    const services = {};
    
    for (const [name, config] of Object.entries(dependencies)) {
      const service = this.services.get(name);
      if (service) {
        services[name] = await this.initializeService(service, config);
      }
    }
    
    return services;
  }
  
  /**
   * Initialize a service
   * @param {Object} service - Service definition
   * @param {Object} config - Service configuration
   * @returns {Promise<Object>} Initialized service
   * @private
   */
  async initializeService(service, config) {
    if (service.initialize) {
      return await service.initialize(config);
    }
    return service;
  }
  
  /**
   * Cleanup service dependencies
   * @param {Object} services - Services to cleanup
   * @private
   */
  async cleanupDependencies(services) {
    for (const [name, service] of Object.entries(services)) {
      if (service?.cleanup || service?.destroy) {
        await (service.cleanup || service.destroy)();
      }
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
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);
      
      Promise.resolve(fn())
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
  
  /**
   * HTTP request helper for integration tests
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response
   */
  async httpRequest(options) {
    // This would use an actual HTTP client in production
    // For now, returns a mock structure
    return {
      status: 200,
      headers: {},
      body: null,
      json: async () => null,
      text: async () => ''
    };
  }
  
  /**
   * WebSocket helper for integration tests
   * @param {string} url - WebSocket URL
   * @param {Object} options - Connection options
   * @returns {Promise<Object>} WebSocket client
   */
  async wsConnect(url, options = {}) {
    // This would use an actual WebSocket client in production
    return {
      send: () => {},
      close: () => {},
      on: () => {},
      once: () => {}
    };
  }
  
  /**
   * Database helper for integration tests
   * @param {string} connectionString - Database connection
   * @returns {Promise<Object>} Database client
   */
  async dbConnect(connectionString) {
    // This would use an actual database client in production
    return {
      query: async () => [],
      insert: async () => {},
      update: async () => {},
      delete: async () => {},
      close: async () => {}
    };
  }
  
  /**
   * Wait for a condition to be met
   * @param {Function} condition - Condition function
   * @param {Object} options - Wait options
   * @returns {Promise<boolean>}
   */
  async waitFor(condition, options = {}) {
    const interval = options.interval || 100;
    const timeout = options.timeout || 5000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }
  
  /**
   * Assertion utilities for integration tests
   */
  assert = {
    statusCode: (response, expected, message) => {
      if (response.status !== expected) {
        throw new Error(message || `Expected status ${expected} but got ${response.status}`);
      }
    },
    
    jsonEqual: (actual, expected, message) => {
      const actualStr = JSON.stringify(actual);
      const expectedStr = JSON.stringify(expected);
      if (actualStr !== expectedStr) {
        throw new Error(message || `JSON mismatch:\nExpected: ${expectedStr}\nActual: ${actualStr}`);
      }
    },
    
    jsonContains: (actual, expected, message) => {
      for (const [key, value] of Object.entries(expected)) {
        if (actual[key] !== value) {
          throw new Error(message || `Expected ${key} to be ${value} but got ${actual[key]}`);
        }
      }
    },
    
    header: (response, name, expected, message) => {
      const actual = response.headers[name.toLowerCase()];
      if (actual !== expected) {
        throw new Error(message || `Expected header ${name} to be ${expected} but got ${actual}`);
      }
    },
    
    hasHeader: (response, name, message) => {
      if (!(name.toLowerCase() in response.headers)) {
        throw new Error(message || `Expected header ${name} to be present`);
      }
    },
    
    responseTime: (duration, maxDuration, message) => {
      if (duration > maxDuration) {
        throw new Error(message || `Response time ${duration}ms exceeds ${maxDuration}ms`);
      }
    },
    
    serviceHealthy: async (service, message) => {
      if (service?.health) {
        const healthy = await service.health();
        if (!healthy) {
          throw new Error(message || 'Service is not healthy');
        }
      }
    }
  };
  
  /**
   * Generate integration test report
   * @param {Object} results - Test results
   * @returns {string} Markdown report
   */
  generateReport(results) {
    let report = `# Integration Test Report\n\n`;
    report += `**Total Scenarios:** ${results.total}\n`;
    report += `**Passed:** ✅ ${results.passed}\n`;
    report += `**Failed:** ❌ ${results.failed}\n`;
    report += `**Skipped:** ⏭️ ${results.skipped}\n`;
    report += `**Success Rate:** ${(results.successRate * 100).toFixed(1)}%\n`;
    report += `**Duration:** ${results.duration}ms\n\n`;
    
    if (results.scenarios.length > 0) {
      report += `## Scenarios\n\n`;
      for (const scenario of results.scenarios) {
        const icon = scenario.status === 'passed' ? '✅' : scenario.status === 'failed' ? '❌' : '⏭️';
        report += `- ${icon} **${scenario.name}** (${scenario.duration}ms)\n`;
      }
      report += '\n';
    }
    
    if (results.failures.length > 0) {
      report += `## Failures\n\n`;
      for (const failure of results.failures) {
        report += `### ${failure.scenario}\n\n`;
        report += `\`\`\`\n${failure.message}\n\n${failure.stack || ''}\n\`\`\`\n\n`;
      }
    }
    
    return report;
  }
}

export default IntegrationTestRunner;
