#!/usr/bin/env node
/**
 * BIOS Performance Test Runner Adapter
 * 
 * Запускает performance-тесты через BIOS PerformanceTestRunner
 * Использование: node scripts/run-bios-performance.js [options]
 */

import { PerformanceTestRunner } from '../src/bios/test-runners/performance.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  duration: 30000,
  warmup: 5000,
  concurrency: 100,
  latency: !args.includes('--no-latency'),
  throughput: !args.includes('--no-throughput'),
  memory: !args.includes('--no-memory'),
  saveReport: args.includes('--save-report'),
  baseline: null,
  compare: false
};

// Parse --duration argument
const durationIndex = args.indexOf('--duration');
if (durationIndex !== -1 && args[durationIndex + 1]) {
  options.duration = parseInt(args[durationIndex + 1], 10) * 1000; // Convert to ms
}

// Parse --warmup argument
const warmupIndex = args.indexOf('--warmup');
if (warmupIndex !== -1 && args[warmupIndex + 1]) {
  options.warmup = parseInt(args[warmupIndex + 1], 10) * 1000;
}

// Parse --concurrency argument
const concurrencyIndex = args.indexOf('--concurrency');
if (concurrencyIndex !== -1 && args[concurrencyIndex + 1]) {
  options.concurrency = parseInt(args[concurrencyIndex + 1], 10);
}

// Parse --baseline argument
const baselineIndex = args.indexOf('--baseline');
if (baselineIndex !== -1 && args[baselineIndex + 1]) {
  options.baseline = args[baselineIndex + 1];
  options.compare = true;
}

// Load performance test definitions
async function loadPerformanceTests() {
  const testsDir = join(__dirname, '..', 'tests', 'performance');
  const tests = [];
  
  try {
    const { glob } = await import('fs/promises');
    const files = await glob(`${testsDir}/**/*.perf.js`);
    for await (const file of files) {
      const module = await import(file);
      if (module.default) {
        tests.push(module.default);
      }
      if (module.tests) {
        tests.push(...module.tests);
      }
    }
  } catch (error) {
    console.log('ℹ️  No performance tests directory found or empty');
  }
  
  return tests;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(ms) {
  if (ms < 1000) return ms.toFixed(2) + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}

async function main() {
  console.log('⚡ BIOS Performance Test Runner\n');
  
  const runner = new PerformanceTestRunner({
    defaultDuration: options.duration,
    defaultWarmup: options.warmup,
    maxConcurrent: options.concurrency
  });
  
  // Set up event listeners
  runner.on('run:start', ({ patchId }) => {
    console.log(`Starting performance test run: ${patchId}\n`);
  });
  
  runner.on('test:latency:start', () => {
    console.log('  📏 Measuring latency...');
  });
  
  runner.on('test:latency:complete', (latency) => {
    console.log(`     ✓ P50: ${latency.p50.toFixed(2)}ms, P95: ${latency.p95.toFixed(2)}ms, P99: ${latency.p99.toFixed(2)}ms`);
  });
  
  runner.on('test:throughput:start', () => {
    console.log('  📊 Measuring throughput...');
  });
  
  runner.on('test:throughput:complete', (throughput) => {
    if (typeof throughput === 'object') {
      console.log(`     ✓ ${throughput.requestsPerSecond.toFixed(2)} req/s (${throughput.totalRequests} total)`);
    } else {
      console.log(`     ✓ ${throughput.toFixed(2)} req/s`);
    }
  });
  
  runner.on('test:memory:start', () => {
    console.log('  🧠 Measuring memory usage...');
  });
  
  runner.on('test:memory:complete', (memory) => {
    if (memory.delta) {
      console.log(`     ✓ Heap delta: ${formatBytes(memory.delta.heapUsed)}`);
    }
  });
  
  runner.on('test:load:start', ({ name }) => {
    console.log(`  🚀 Load test: ${name}`);
  });
  
  runner.on('test:load:complete', ({ name, result }) => {
    const totalRequests = result.overall.totalRequests;
    const successRate = (result.overall.successfulRequests / totalRequests * 100).toFixed(1);
    console.log(`     ✓ ${totalRequests} requests, ${successRate}% success`);
  });
  
  // Load baseline if specified
  if (options.baseline) {
    const baselinePath = join(__dirname, '..', 'tests', 'performance', 'baselines', `${options.baseline}.json`);
    try {
      const baselineData = JSON.parse(await import('fs/promises').then(fs => fs.readFile(baselinePath, 'utf-8')));
      runner.storeBaseline(options.baseline, baselineData);
      console.log(`📋 Loaded baseline: ${options.baseline}\n`);
    } catch (error) {
      console.log(`⚠️  Could not load baseline: ${options.baseline}\n`);
    }
  }
  
  // Load performance tests
  const perfTests = await loadPerformanceTests();
  
  // Default operation for basic performance testing
  const defaultOperation = async () => {
    // Simple CPU-bound operation for testing
    const start = Date.now();
    while (Date.now() - start < 1) {
      // Busy wait for 1ms
    }
  };
  
  // Generate a unique patch ID for this test run
  const patchId = `perf-test-${Date.now()}`;
  
  // Run performance tests
  const results = await runner.run(patchId, {
    operation: perfTests.length > 0 ? perfTests[0].operation : defaultOperation,
    latency: options.latency,
    throughput: options.throughput,
    memory: options.memory,
    latencyDuration: options.duration,
    throughputDuration: options.duration,
    memoryDuration: options.duration,
    warmup: options.warmup,
    concurrency: options.concurrency
  });
  
  // Compare with baseline if specified
  let comparison = null;
  if (options.compare && options.baseline) {
    comparison = runner.compareWithBaseline(results, options.baseline);
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Performance Test Summary');
  console.log('='.repeat(60));
  console.log(`Duration: ${formatDuration(results.duration)}`);
  
  if (Object.keys(results.latency).length > 0) {
    console.log('\n📏 Latency:');
    console.log(`  Min:    ${results.latency.min?.toFixed(2)}ms`);
    console.log(`  Avg:    ${results.latency.avg?.toFixed(2)}ms`);
    console.log(`  P50:    ${results.latency.p50?.toFixed(2)}ms`);
    console.log(`  P95:    ${results.latency.p95?.toFixed(2)}ms`);
    console.log(`  P99:    ${results.latency.p99?.toFixed(2)}ms`);
    console.log(`  Max:    ${results.latency.max?.toFixed(2)}ms`);
  }
  
  if (results.throughput) {
    console.log('\n📊 Throughput:');
    if (typeof results.throughput === 'object') {
      console.log(`  Requests/sec: ${results.throughput.requestsPerSecond?.toFixed(2)}`);
      console.log(`  Total:        ${results.throughput.totalRequests}`);
      console.log(`  Successful:   ${results.throughput.successfulRequests}`);
      console.log(`  Failed:       ${results.throughput.failedRequests}`);
    } else {
      console.log(`  ${results.throughput.toFixed(2)} req/s`);
    }
  }
  
  if (Object.keys(results.memory).length > 0) {
    console.log('\n🧠 Memory:');
    if (results.memory.delta) {
      console.log(`  RSS Delta:      ${formatBytes(results.memory.delta.rss)}`);
      console.log(`  Heap Delta:     ${formatBytes(results.memory.delta.heapUsed)}`);
    }
    if (results.memory.peak) {
      console.log(`  Peak RSS:       ${formatBytes(results.memory.peak.rss)}`);
      console.log(`  Peak Heap:      ${formatBytes(results.memory.peak.heapUsed)}`);
    }
  }
  
  if (results.loadTests?.length > 0) {
    console.log('\n🚀 Load Tests:');
    for (const loadTest of results.loadTests) {
      console.log(`\n  ${loadTest.name}:`);
      for (const stage of loadTest.stages) {
        const successRate = stage.totalRequests > 0 
          ? ((stage.successfulRequests / stage.totalRequests) * 100).toFixed(1)
          : 'N/A';
        console.log(`    ${stage.name}: ${stage.actualRps.toFixed(1)} req/s (${successRate}% success)`);
      }
    }
  }
  
  // Show comparison with baseline
  if (comparison) {
    console.log('\n📊 Comparison with Baseline:');
    if (comparison.error) {
      console.log(`  ⚠️  ${comparison.error}`);
    } else {
      if (comparison.latency.p95) {
        const icon = comparison.latency.p95.regression ? '❌' : '✅';
        console.log(`  ${icon} Latency P95: ${comparison.latency.p95.change}`);
      }
      if (comparison.throughput.change) {
        const icon = comparison.throughput.regression ? '❌' : '✅';
        console.log(`  ${icon} Throughput: ${comparison.throughput.change}`);
      }
      if (comparison.memory.used) {
        const icon = comparison.memory.used.regression ? '❌' : '✅';
        console.log(`  ${icon} Memory: ${comparison.memory.used.change}`);
      }
      if (comparison.regressions.length > 0) {
        console.log(`\n  ⚠️  Regressions detected: ${comparison.regressions.join(', ')}`);
      }
    }
  }
  
  if (results.errors > 0) {
    console.log(`\n⚠️  Errors: ${results.errors} (${(results.errorRate * 100).toFixed(2)}%)`);
  }
  
  // Generate and optionally save report
  const report = runner.generateReport(results);
  console.log('\n' + report);
  
  if (options.saveReport) {
    const reportsDir = join(__dirname, '..', 'tests', 'performance', 'reports');
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }
    const reportPath = join(reportsDir, `perf-report-${Date.now()}.md`);
    writeFileSync(reportPath, report);
    console.log(`\n💾 Report saved to: ${reportPath}`);
  }
  
  // Exit with error code if there are significant performance regressions
  const hasRegressions = comparison?.regressions?.length > 0;
  process.exit(hasRegressions ? 2 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
