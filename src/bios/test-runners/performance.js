import { EventEmitter } from 'events';

/**
 * Performance test runner for latency, throughput, and memory testing
 */
export class PerformanceTestRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    this.defaultDuration = options.defaultDuration || 30000; // 30s default
    this.defaultWarmup = options.defaultWarmup || 5000; // 5s warmup
    this.maxConcurrent = options.maxConcurrent || 100;
    this.metrics = new Map();
    this.baselines = new Map();
  }
  
  /**
   * Run performance tests
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Performance results
   */
  async run(patchId, options = {}) {
    this.emit('run:start', { patchId, timestamp: new Date() });
    
    const startTime = Date.now();
    const results = {
      patchId,
      timestamp: new Date(),
      duration: 0,
      latency: {},
      throughput: 0,
      memory: {},
      errors: 0,
      errorRate: 0,
      loadTests: []
    };
    
    try {
      // Latency tests
      if (options.latency !== false) {
        this.emit('test:latency:start');
        results.latency = await this.measureLatency({
          duration: options.latencyDuration || this.defaultDuration,
          warmup: options.warmup || this.defaultWarmup,
          operation: options.operation,
          ...options.latencyOptions
        });
        this.emit('test:latency:complete', results.latency);
      }
      
      // Throughput tests
      if (options.throughput !== false) {
        this.emit('test:throughput:start');
        results.throughput = await this.measureThroughput({
          duration: options.throughputDuration || this.defaultDuration,
          concurrency: options.concurrency || this.maxConcurrent,
          operation: options.operation,
          ...options.throughputOptions
        });
        this.emit('test:throughput:complete', results.throughput);
      }
      
      // Memory tests
      if (options.memory !== false) {
        this.emit('test:memory:start');
        results.memory = await this.measureMemory({
          duration: options.memoryDuration || this.defaultDuration,
          operation: options.operation,
          ...options.memoryOptions
        });
        this.emit('test:memory:complete', results.memory);
      }
      
      // Load tests
      if (options.loadTests) {
        for (const loadTest of options.loadTests) {
          this.emit('test:load:start', { name: loadTest.name });
          const loadResult = await this.runLoadTest(loadTest);
          results.loadTests.push(loadResult);
          this.emit('test:load:complete', { name: loadTest.name, result: loadResult });
        }
      }
      
      results.duration = Date.now() - startTime;
      
      // Calculate error rate
      const totalRequests = results.latency.samples || results.throughput.totalRequests || 0;
      results.errorRate = totalRequests > 0 ? results.errors / totalRequests : 0;
      
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
   * Measure latency metrics
   * @param {Object} options - Measurement options
   * @returns {Promise<Object>} Latency metrics
   */
  async measureLatency(options = {}) {
    const { duration, warmup, operation } = options;
    
    // Warmup phase
    if (warmup > 0) {
      await this.runWarmup(operation, warmup);
    }
    
    const samples = [];
    const startTime = Date.now();
    let errors = 0;
    
    while (Date.now() - startTime < duration) {
      const latencyStart = process.hrtime.bigint();
      
      try {
        await operation();
        const latency = Number(process.hrtime.bigint() - latencyStart) / 1_000_000; // Convert to ms
        samples.push(latency);
      } catch (error) {
        errors++;
      }
    }
    
    // Calculate percentiles
    samples.sort((a, b) => a - b);
    
    return {
      samples: samples.length,
      errors,
      min: samples[0] || 0,
      max: samples[samples.length - 1] || 0,
      avg: samples.reduce((a, b) => a + b, 0) / samples.length || 0,
      p50: this.calculatePercentile(samples, 50),
      p90: this.calculatePercentile(samples, 90),
      p95: this.calculatePercentile(samples, 95),
      p99: this.calculatePercentile(samples, 99),
      p999: this.calculatePercentile(samples, 99.9),
      stdDev: this.calculateStdDev(samples)
    };
  }
  
  /**
   * Measure throughput metrics
   * @param {Object} options - Measurement options
   * @returns {Promise<Object>} Throughput metrics
   */
  async measureThroughput(options = {}) {
    const { duration, concurrency, operation } = options;
    
    const results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      requestsPerSecond: 0,
      concurrency
    };
    
    const startTime = Date.now();
    const workers = [];
    
    // Create concurrent workers
    for (let i = 0; i < concurrency; i++) {
      workers.push(this.throughputWorker(operation, duration, startTime, results));
    }
    
    await Promise.all(workers);
    
    const elapsed = (Date.now() - startTime) / 1000;
    results.requestsPerSecond = results.totalRequests / elapsed;
    results.elapsed = elapsed;
    
    return results;
  }
  
  /**
   * Throughput worker
   * @private
   */
  async throughputWorker(operation, duration, startTime, results) {
    while (Date.now() - startTime < duration) {
      try {
        await operation();
        results.successfulRequests++;
      } catch (error) {
        results.failedRequests++;
      }
      results.totalRequests++;
    }
  }
  
  /**
   * Measure memory metrics
   * @param {Object} options - Measurement options
   * @returns {Promise<Object>} Memory metrics
   */
  async measureMemory(options = {}) {
    const { duration, operation } = options;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const initialMemory = process.memoryUsage();
    const samples = [];
    const startTime = Date.now();
    
    while (Date.now() - startTime < duration) {
      await operation();
      
      if (global.gc) {
        global.gc();
      }
      
      const current = process.memoryUsage();
      samples.push({
        rss: current.rss,
        heapTotal: current.heapTotal,
        heapUsed: current.heapUsed,
        external: current.external,
        arrayBuffers: current.arrayBuffers
      });
    }
    
    const finalMemory = process.memoryUsage();
    
    // Calculate memory stats
    const heapUsedSamples = samples.map(s => s.heapUsed);
    const rssSamples = samples.map(s => s.rss);
    
    return {
      initial: initialMemory,
      final: finalMemory,
      delta: {
        rss: finalMemory.rss - initialMemory.rss,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        external: finalMemory.external - initialMemory.external
      },
      peak: {
        rss: Math.max(...rssSamples),
        heapUsed: Math.max(...heapUsedSamples)
      },
      average: {
        rss: rssSamples.reduce((a, b) => a + b, 0) / rssSamples.length,
        heapUsed: heapUsedSamples.reduce((a, b) => a + b, 0) / heapUsedSamples.length
      },
      samples: samples.length
    };
  }
  
  /**
   * Run a load test with varying concurrency
   * @param {Object} config - Load test configuration
   * @returns {Promise<Object>} Load test results
   */
  async runLoadTest(config) {
    const {
      name,
      stages,
      operation
    } = config;
    
    const results = {
      name,
      stages: [],
      overall: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgRequestsPerSecond: 0
      }
    };
    
    for (const stage of stages) {
      this.emit('load:stage:start', { test: name, stage: stage.name });
      
      const stageResult = await this.runLoadStage(stage, operation);
      results.stages.push(stageResult);
      
      results.overall.totalRequests += stageResult.totalRequests;
      results.overall.successfulRequests += stageResult.successfulRequests;
      results.overall.failedRequests += stageResult.failedRequests;
      
      this.emit('load:stage:complete', { test: name, stage: stage.name, result: stageResult });
    }
    
    results.overall.avgRequestsPerSecond = results.overall.totalRequests / 
      results.stages.reduce((acc, s) => acc + s.duration, 0);
    
    return results;
  }
  
  /**
   * Run a single load stage
   * @private
   */
  async runLoadStage(stage, operation) {
    const startTime = Date.now();
    const results = {
      name: stage.name,
      duration: stage.duration,
      targetRps: stage.targetRps,
      concurrency: stage.concurrency,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      latencies: [],
      actualRps: 0
    };
    
    const workers = [];
    const targetInterval = 1000 / stage.targetRps;
    
    for (let i = 0; i < stage.concurrency; i++) {
      workers.push(this.loadWorker(operation, stage.duration, targetInterval, results));
    }
    
    await Promise.all(workers);
    
    const elapsed = (Date.now() - startTime) / 1000;
    results.actualRps = results.totalRequests / elapsed;
    
    // Calculate latency percentiles
    results.latencies.sort((a, b) => a - b);
    results.latency = {
      min: results.latencies[0] || 0,
      max: results.latencies[results.latencies.length - 1] || 0,
      avg: results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length || 0,
      p50: this.calculatePercentile(results.latencies, 50),
      p95: this.calculatePercentile(results.latencies, 95),
      p99: this.calculatePercentile(results.latencies, 99)
    };
    
    return results;
  }
  
  /**
   * Load test worker
   * @private
   */
  async loadWorker(operation, duration, interval, results) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < duration) {
      const latencyStart = process.hrtime.bigint();
      
      try {
        await operation();
        results.successfulRequests++;
      } catch (error) {
        results.failedRequests++;
      }
      
      const latency = Number(process.hrtime.bigint() - latencyStart) / 1_000_000;
      results.latencies.push(latency);
      results.totalRequests++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  
  /**
   * Run warmup phase
   * @private
   */
  async runWarmup(operation, duration) {
    const startTime = Date.now();
    while (Date.now() - startTime < duration) {
      try {
        await operation();
      } catch (error) {
        // Ignore warmup errors
      }
    }
  }
  
  /**
   * Measure performance for a specific operation
   * @param {Object} test - Test configuration
   * @returns {Promise<Object>} Performance metrics
   */
  async measure(test) {
    const startTime = Date.now();
    
    // Force GC before measurement
    if (global.gc) {
      global.gc();
    }
    
    const initialMemory = process.memoryUsage();
    const latencies = [];
    let operations = 0;
    let errors = 0;
    
    const measureStart = Date.now();
    
    while (Date.now() - measureStart < (test.duration || 5000)) {
      const opStart = process.hrtime.bigint();
      
      try {
        await test.operation();
        const latency = Number(process.hrtime.bigint() - opStart) / 1_000_000;
        latencies.push(latency);
        operations++;
      } catch (error) {
        errors++;
      }
    }
    
    // Force GC after measurement
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage();
    
    latencies.sort((a, b) => a - b);
    
    return {
      latency: {
        min: latencies[0] || 0,
        max: latencies[latencies.length - 1] || 0,
        avg: latencies.reduce((a, b) => a + b, 0) / latencies.length || 0,
        p50: this.calculatePercentile(latencies, 50),
        p95: this.calculatePercentile(latencies, 95),
        p99: this.calculatePercentile(latencies, 99)
      },
      throughput: operations / ((Date.now() - measureStart) / 1000),
      memory: {
        used: finalMemory.heapUsed - initialMemory.heapUsed,
        total: finalMemory.heapTotal,
        rss: finalMemory.rss
      },
      operations,
      errors,
      duration: Date.now() - startTime
    };
  }
  
  /**
   * Calculate percentile
   * @param {Array} sortedArray - Sorted array of values
   * @param {number} percentile - Percentile to calculate
   * @returns {number} Percentile value
   * @private
   */
  calculatePercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    if (upper >= sortedArray.length) return sortedArray[lower];
    
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }
  
  /**
   * Calculate standard deviation
   * @param {Array} values - Array of values
   * @returns {number} Standard deviation
   * @private
   */
  calculateStdDev(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  }
  
  /**
   * Store baseline metrics
   * @param {string} name - Test name
   * @param {Object} metrics - Baseline metrics
   */
  storeBaseline(name, metrics) {
    this.baselines.set(name, {
      timestamp: new Date(),
      metrics
    });
  }
  
  /**
   * Compare results with baseline
   * @param {Object} current - Current results
   * @param {string} baselineName - Baseline name
   * @returns {Object} Comparison results
   */
  compareWithBaseline(current, baselineName) {
    const baseline = this.baselines.get(baselineName);
    if (!baseline) {
      return { error: 'Baseline not found' };
    }
    
    const comparison = {
      timestamp: new Date(),
      latency: {},
      throughput: {},
      memory: {},
      regressions: []
    };
    
    // Compare latency
    if (current.latency?.p95 && baseline.metrics.latency?.p95) {
      const latencyChange = ((current.latency.p95 - baseline.metrics.latency.p95) / baseline.metrics.latency.p95) * 100;
      comparison.latency.p95 = {
        baseline: baseline.metrics.latency.p95,
        current: current.latency.p95,
        change: latencyChange.toFixed(2) + '%',
        regression: latencyChange > 10
      };
      if (comparison.latency.p95.regression) {
        comparison.regressions.push('latency.p95');
      }
    }
    
    // Compare throughput
    if (current.throughput && baseline.metrics.throughput) {
      const throughputChange = ((current.throughput - baseline.metrics.throughput) / baseline.metrics.throughput) * 100;
      comparison.throughput = {
        baseline: baseline.metrics.throughput,
        current: current.throughput,
        change: throughputChange.toFixed(2) + '%',
        regression: throughputChange < -10
      };
      if (comparison.throughput.regression) {
        comparison.regressions.push('throughput');
      }
    }
    
    // Compare memory
    if (current.memory?.used && baseline.metrics.memory?.used) {
      const memoryChange = ((current.memory.used - baseline.metrics.memory.used) / baseline.metrics.memory.used) * 100;
      comparison.memory.used = {
        baseline: baseline.metrics.memory.used,
        current: current.memory.used,
        change: memoryChange.toFixed(2) + '%',
        regression: memoryChange > 15
      };
      if (comparison.memory.used.regression) {
        comparison.regressions.push('memory.used');
      }
    }
    
    return comparison;
  }
  
  /**
   * Generate performance report
   * @param {Object} results - Performance results
   * @returns {string} Markdown report
   */
  generateReport(results) {
    let report = `# Performance Test Report\n\n`;
    report += `**Timestamp:** ${results.timestamp.toISOString()}\n`;
    report += `**Duration:** ${results.duration}ms\n\n`;
    
    // Latency
    if (Object.keys(results.latency).length > 0) {
      report += `## Latency\n\n`;
      report += `| Metric | Value (ms) |\n`;
      report += `|--------|------------|\n`;
      report += `| Min | ${results.latency.min?.toFixed(2) || 'N/A'} |\n`;
      report += `| Avg | ${results.latency.avg?.toFixed(2) || 'N/A'} |\n`;
      report += `| P50 | ${results.latency.p50?.toFixed(2) || 'N/A'} |\n`;
      report += `| P90 | ${results.latency.p90?.toFixed(2) || 'N/A'} |\n`;
      report += `| P95 | ${results.latency.p95?.toFixed(2) || 'N/A'} |\n`;
      report += `| P99 | ${results.latency.p99?.toFixed(2) || 'N/A'} |\n`;
      report += `| Max | ${results.latency.max?.toFixed(2) || 'N/A'} |\n`;
      report += `| StdDev | ${results.latency.stdDev?.toFixed(2) || 'N/A'} |\n`;
      report += `\n`;
    }
    
    // Throughput
    if (results.throughput) {
      report += `## Throughput\n\n`;
      if (typeof results.throughput === 'object') {
        report += `- **Requests/sec:** ${results.throughput.requestsPerSecond?.toFixed(2) || 'N/A'}\n`;
        report += `- **Total Requests:** ${results.throughput.totalRequests || 'N/A'}\n`;
        report += `- **Successful:** ${results.throughput.successfulRequests || 'N/A'}\n`;
        report += `- **Failed:** ${results.throughput.failedRequests || 'N/A'}\n`;
        report += `- **Concurrency:** ${results.throughput.concurrency || 'N/A'}\n`;
      } else {
        report += `- **Requests/sec:** ${results.throughput.toFixed(2)}\n`;
      }
      report += `\n`;
    }
    
    // Memory
    if (Object.keys(results.memory).length > 0) {
      report += `## Memory\n\n`;
      report += `| Metric | Value (MB) |\n`;
      report += `|--------|------------|\n`;
      
      const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
      
      if (results.memory.delta) {
        report += `| RSS Delta | ${toMB(results.memory.delta.rss)} |\n`;
        report += `| Heap Used Delta | ${toMB(results.memory.delta.heapUsed)} |\n`;
      }
      if (results.memory.peak) {
        report += `| Peak RSS | ${toMB(results.memory.peak.rss)} |\n`;
        report += `| Peak Heap | ${toMB(results.memory.peak.heapUsed)} |\n`;
      }
      report += `\n`;
    }
    
    // Load tests
    if (results.loadTests?.length > 0) {
      report += `## Load Tests\n\n`;
      for (const loadTest of results.loadTests) {
        report += `### ${loadTest.name}\n\n`;
        report += `| Stage | Duration | Target RPS | Actual RPS | Success Rate |\n`;
        report += `|-------|----------|------------|------------|--------------|\n`;
        
        for (const stage of loadTest.stages) {
          const successRate = stage.totalRequests > 0 
            ? ((stage.successfulRequests / stage.totalRequests) * 100).toFixed(1) + '%'
            : 'N/A';
          report += `| ${stage.name} | ${stage.duration}ms | ${stage.targetRps} | ${stage.actualRps.toFixed(1)} | ${successRate} |\n`;
        }
        report += `\n`;
      }
    }
    
    // Errors
    if (results.errors > 0 || results.errorRate > 0) {
      report += `## Errors\n\n`;
      report += `- **Total Errors:** ${results.errors}\n`;
      report += `- **Error Rate:** ${(results.errorRate * 100).toFixed(2)}%\n`;
      report += `\n`;
    }
    
    return report;
  }
}

export default PerformanceTestRunner;
