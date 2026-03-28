#!/usr/bin/env node
/**
 * BIOS Integration Test Runner Adapter
 * 
 * Запускает integration-тесты через BIOS IntegrationTestRunner
 * Использование: node scripts/run-bios-integration.js [options]
 */

import { IntegrationTestRunner } from '../src/bios/test-runners/integration.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  scenario: null,
  tags: [],
  setupTimeout: 30000,
  teardownTimeout: 30000
};

// Parse --scenario argument
const scenarioIndex = args.indexOf('--scenario');
if (scenarioIndex !== -1 && args[scenarioIndex + 1]) {
  options.scenario = args[scenarioIndex + 1];
}

// Parse --tag argument
const tagIndex = args.indexOf('--tag');
if (tagIndex !== -1 && args[tagIndex + 1]) {
  options.tags = [args[tagIndex + 1]];
}

// Parse --timeout argument
const timeoutIndex = args.indexOf('--timeout');
if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
  options.setupTimeout = parseInt(args[timeoutIndex + 1], 10);
  options.teardownTimeout = parseInt(args[timeoutIndex + 1], 10);
}

async function discoverScenarios() {
  const scenariosDir = join(__dirname, '..', 'tests', 'integration');
  const scenarios = [];
  
  try {
    const { glob } = await import('fs/promises');
    const files = await glob(`${scenariosDir}/**/*.test.js`);
    for await (const file of files) {
      scenarios.push(file);
    }
  } catch (error) {
    console.log('ℹ️  No integration scenarios directory found or empty');
  }
  
  return scenarios;
}

async function loadScenarioFile(filePath, runner) {
  try {
    // Create scenario context
    const context = {
      scenario: (name, config) => runner.scenario(name, config),
      registerService: (name, service) => runner.registerService(name, service),
      registerFixture: (name, loader) => runner.registerFixture(name, loader),
      httpRequest: (opts) => runner.httpRequest(opts),
      wsConnect: (url, opts) => runner.wsConnect(url, opts),
      dbConnect: (connStr) => runner.dbConnect(connStr),
      waitFor: (condition, opts) => runner.waitFor(condition, opts),
      assert: runner.assert,
      globalState: runner.globalState
    };
    
    // Make context available globally
    global.scenario = context.scenario;
    global.registerService = context.registerService;
    global.registerFixture = context.registerFixture;
    global.httpRequest = context.httpRequest;
    global.wsConnect = context.wsConnect;
    global.dbConnect = context.dbConnect;
    global.waitFor = context.waitFor;
    global.assert = context.assert;
    
    // Import the scenario file
    await import(filePath);
    
  } catch (error) {
    console.error(`❌ Failed to load scenario file ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔗 BIOS Integration Test Runner\n');
  
  const runner = new IntegrationTestRunner({
    setupTimeout: options.setupTimeout,
    teardownTimeout: options.teardownTimeout
  });
  
  // Register common services
  runner.registerService('mock-http', {
    initialize: async (config) => ({
      baseURL: config.baseURL || 'http://localhost:3000',
      health: async () => true
    }),
    cleanup: async () => {}
  });
  
  runner.registerService('mock-db', {
    initialize: async (config) => ({
      connectionString: config.connectionString,
      health: async () => true,
      query: async () => []
    }),
    cleanup: async () => {}
  });
  
  // Set up event listeners
  runner.on('run:start', ({ patchId }) => {
    console.log(`Starting integration test run: ${patchId}\n`);
  });
  
  runner.on('scenario:start', ({ name }) => {
    console.log(`  🎬 ${name}`);
  });
  
  runner.on('scenario:pass', ({ name, duration }) => {
    console.log(`  ✅ ${name} (${duration}ms)`);
  });
  
  runner.on('scenario:fail', ({ scenario, message }) => {
    console.log(`  ❌ ${scenario}`);
    console.log(`     ${message}`);
  });
  
  runner.on('scenario:skip', ({ name }) => {
    console.log(`  ⏭️  ${name}`);
  });
  
  runner.on('scenario:teardown-error', ({ scenario, error }) => {
    console.log(`  ⚠️  Teardown error in ${scenario}: ${error}`);
  });
  
  // Discover and load scenario files
  const scenarioFiles = await discoverScenarios();
  console.log(`Found ${scenarioFiles.length} scenario file(s)\n`);
  
  for (const file of scenarioFiles) {
    await loadScenarioFile(file, runner);
  }
  
  // Generate a unique patch ID for this test run
  const patchId = `integration-test-${Date.now()}`;
  
  // Prepare run options
  const runOptions = {
    tags: options.tags.length > 0 ? options.tags : undefined
  };
  
  if (options.scenario) {
    runOptions.scenarios = [options.scenario];
  }
  
  // Run scenarios
  const results = await runner.run(patchId, runOptions);
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('Integration Test Summary');
  console.log('='.repeat(50));
  console.log(`Total Scenarios: ${results.total}`);
  console.log(`Passed:          ${results.passed} ✅`);
  console.log(`Failed:          ${results.failed} ❌`);
  console.log(`Skipped:         ${results.skipped} ⏭️`);
  console.log(`Duration:        ${results.duration}ms`);
  console.log(`Success Rate:    ${(results.successRate * 100).toFixed(1)}%`);
  
  if (results.failures.length > 0) {
    console.log('\nFailed Scenarios:');
    for (const failure of results.failures) {
      console.log(`\n  ❌ ${failure.scenario || failure.testName}`);
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
