import { EventEmitter } from 'events';

/**
 * Regression test suite for tracking metrics and detecting regressions
 */
export class RegressionSuite extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baselineStorage = options.baselineStorage || new Map();
    this.historyStorage = options.historyStorage || [];
    this.testCases = new Map();
    this.metrics = {
      latency: true,
      throughput: true,
      memory: true,
      errorRate: true,
      ...options.metrics
    };
    this.trendWindow = options.trendWindow || 10; // Number of runs to analyze
  }
  
  /**
   * Register a test case
   * @param {string} name - Test case name
   * @param {Object} config - Test configuration
   */
  registerTestCase(name, config) {
    this.testCases.set(name, {
      name,
      baseline: null,
      history: [],
      ...config
    });
    this.emit('test:registered', { name, config });
  }
  
  /**
   * Unregister a test case
   * @param {string} name - Test case name
   */
  unregisterTestCase(name) {
    const testCase = this.testCases.get(name);
    if (testCase) {
      this.testCases.delete(name);
      this.emit('test:unregistered', { name, testCase });
    }
  }
  
  /**
   * Run the regression suite
   * @returns {Promise<Object>} Suite results
   */
  async run() {
    this.emit('suite:start', { timestamp: new Date() });
    
    const results = {
      timestamp: new Date(),
      testCases: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        regressions: 0
      }
    };
    
    for (const [name, testCase] of this.testCases) {
      this.emit('test:start', { name, timestamp: new Date() });
      
      const testResult = await this.runTestCase(testCase);
      results.testCases[name] = testResult;
      
      results.summary.total++;
      if (testResult.passed) {
        results.summary.passed++;
      } else {
        results.summary.failed++;
      }
      if (testResult.regressions.length > 0) {
        results.summary.regressions++;
      }
      
      this.emit('test:complete', { name, result: testResult });
    }
    
    this.emit('suite:complete', { results });
    
    return results;
  }
  
  /**
   * Run a single test case
   * @param {Object} testCase - Test case configuration
   * @returns {Promise<Object>} Test results
   */
  async runTestCase(testCase) {
    const startTime = Date.now();
    const baseline = this.getBaseline(testCase.name);
    
    const result = {
      name: testCase.name,
      timestamp: new Date(),
      duration: 0,
      metrics: {},
      passed: true,
      regressions: [],
      baseline: null,
      deviation: {}
    };
    
    try {
      // Collect metrics based on configuration
      if (this.metrics.latency) {
        result.metrics.latency = await this.measureLatency(testCase);
      }
      
      if (this.metrics.throughput) {
        result.metrics.throughput = await this.measureThroughput(testCase);
      }
      
      if (this.metrics.memory) {
        result.metrics.memory = await this.measureMemory(testCase);
      }
      
      if (this.metrics.errorRate) {
        result.metrics.errorRate = await this.measureErrorRate(testCase);
      }
      
      result.duration = Date.now() - startTime;
      
      // Compare with baseline if available
      if (baseline) {
        result.baseline = baseline;
        result.deviation = this.calculateDeviation(result.metrics, baseline);
        result.regressions = this.identifyRegressions(result.metrics, baseline, testCase.thresholds);
        result.passed = result.regressions.length === 0;
      }
      
      // Store metrics for trend analysis
      this.storeMetrics(testCase.name, result.metrics);
      
      return result;
    } catch (error) {
      result.passed = false;
      result.error = error.message;
      result.duration = Date.now() - startTime;
      return result;
    }
  }
  
  /**
   * Store baseline metrics for a test
   * @param {string} testName - Test name
   * @param {Object} metrics - Metrics to store
   */
  storeBaseline(testName, metrics) {
    const baseline = {
      timestamp: new Date(),
      metrics: { ...metrics }
    };
    
    this.baselineStorage.set(testName, baseline);
    this.emit('baseline:stored', { testName, baseline });
  }
  
  /**
   * Get baseline metrics for a test
   * @param {string} testName - Test name
   * @returns {Object|null} Baseline metrics
   */
  getBaseline(testName) {
    return this.baselineStorage.get(testName) || null;
  }
  
  /**
   * Store metrics for trend analysis
   * @param {string} testName - Test name
   * @param {Object} metrics - Metrics to store
   * @private
   */
  storeMetrics(testName, metrics) {
    const testCase = this.testCases.get(testName);
    if (testCase) {
      testCase.history.push({
        timestamp: new Date(),
        metrics: { ...metrics }
      });
      
      // Keep only the last trendWindow entries
      if (testCase.history.length > this.trendWindow) {
        testCase.history.shift();
      }
    }
  }
  
  /**
   * Detect regressions by comparing current results with baseline
   * @param {Object} currentResults - Current test results
   * @param {Object} thresholds - Regression thresholds
   * @returns {Array} List of detected regressions
   */
  detectRegressions(currentResults, thresholds = {}) {
    const regressions = [];
    const defaultThresholds = {
      maxLatencyRegression: 1.1,      // 10% max latency increase
      maxMemoryRegression: 1.15,      // 15% max memory increase
      maxErrorRateRegression: 2.0,    // 2x max error rate increase
      minThroughputRegression: 0.9    // 10% max throughput decrease
    };
    
    const t = { ...defaultThresholds, ...thresholds };
    
    for (const [testName, result] of Object.entries(currentResults.testCases || {})) {
      if (!result.baseline || !result.metrics) continue;
      
      const baseline = result.baseline.metrics;
      const current = result.metrics;
      
      // Check latency regression
      if (current.latency?.p95 && baseline.latency?.p95) {
        if (current.latency.p95 > baseline.latency.p95 * t.maxLatencyRegression) {
          regressions.push({
            testName,
            type: 'latency',
            severity: 'high',
            baseline: baseline.latency.p95,
            current: current.latency.p95,
            increase: ((current.latency.p95 - baseline.latency.p95) / baseline.latency.p95 * 100).toFixed(1) + '%'
          });
        }
      }
      
      // Check memory regression
      if (current.memory?.used && baseline.memory?.used) {
        if (current.memory.used > baseline.memory.used * t.maxMemoryRegression) {
          regressions.push({
            testName,
            type: 'memory',
            severity: 'medium',
            baseline: baseline.memory.used,
            current: current.memory.used,
            increase: ((current.memory.used - baseline.memory.used) / baseline.memory.used * 100).toFixed(1) + '%'
          });
        }
      }
      
      // Check error rate regression
      if (current.errorRate !== undefined && baseline.errorRate !== undefined) {
        if (current.errorRate > baseline.errorRate * t.maxErrorRateRegression) {
          regressions.push({
            testName,
            type: 'error-rate',
            severity: 'critical',
            baseline: baseline.errorRate,
            current: current.errorRate,
            increase: ((current.errorRate - baseline.errorRate) / baseline.errorRate * 100).toFixed(1) + '%'
          });
        }
      }
      
      // Check throughput regression
      if (current.throughput && baseline.throughput) {
        if (current.throughput < baseline.throughput * t.minThroughputRegression) {
          regressions.push({
            testName,
            type: 'throughput',
            severity: 'high',
            baseline: baseline.throughput,
            current: current.throughput,
            decrease: ((baseline.throughput - current.throughput) / baseline.throughput * 100).toFixed(1) + '%'
          });
        }
      }
    }
    
    return regressions;
  }
  
  /**
   * Analyze trends in verification history
   * @param {Array} history - Verification history
   * @returns {Object} Trend analysis results
   */
  analyzeTrends(history) {
    if (history.length < 2) {
      return { insufficientData: true };
    }
    
    const trends = {
      score: this.analyzeMetricTrend(history, 'score'),
      duration: this.analyzeMetricTrend(history, 'duration'),
      passRate: this.analyzePassRateTrend(history)
    };
    
    // Detect patterns
    trends.patterns = this.detectPatterns(history);
    
    // Generate alerts
    trends.alerts = this.generateTrendAlerts(trends);
    
    return trends;
  }
  
  /**
   * Compare current metrics with baseline
   * @param {Object} current - Current metrics
   * @param {Object} baseline - Baseline metrics
   * @returns {Object} Deviation results
   * @private
   */
  calculateDeviation(current, baseline) {
    const deviation = {};
    
    for (const [key, value] of Object.entries(current)) {
      const baselineValue = baseline.metrics?.[key];
      if (baselineValue !== undefined && typeof value === 'number') {
        if (typeof baselineValue === 'number') {
          const diff = value - baselineValue;
          const percentChange = baselineValue !== 0 ? (diff / baselineValue) * 100 : 0;
          deviation[key] = {
            absolute: diff,
            percent: percentChange.toFixed(2)
          };
        } else if (typeof baselineValue === 'object' && typeof value === 'object') {
          deviation[key] = {};
          for (const [subKey, subValue] of Object.entries(value)) {
            const baseSubValue = baselineValue[subKey];
            if (baseSubValue !== undefined) {
              const diff = subValue - baseSubValue;
              const percentChange = baseSubValue !== 0 ? (diff / baseSubValue) * 100 : 0;
              deviation[key][subKey] = {
                absolute: diff,
                percent: percentChange.toFixed(2)
              };
            }
          }
        }
      }
    }
    
    return deviation;
  }
  
  /**
   * Identify specific regressions in metrics
   * @param {Object} current - Current metrics
   * @param {Object} baseline - Baseline metrics
   * @param {Object} thresholds - Regression thresholds
   * @returns {Array} Identified regressions
   * @private
   */
  identifyRegressions(current, baseline, thresholds = {}) {
    const regressions = [];
    const t = {
      latency: 1.1,
      memory: 1.15,
      errorRate: 2.0,
      throughput: 0.9,
      ...thresholds
    };
    
    if (current.latency?.p95 && baseline.metrics?.latency?.p95) {
      if (current.latency.p95 > baseline.metrics.latency.p95 * t.latency) {
        regressions.push({
          metric: 'latency.p95',
          type: 'increase',
          severity: 'high',
          message: `P95 latency increased by ${((current.latency.p95 / baseline.metrics.latency.p95 - 1) * 100).toFixed(1)}%`
        });
      }
    }
    
    if (current.memory?.used && baseline.metrics?.memory?.used) {
      if (current.memory.used > baseline.metrics.memory.used * t.memory) {
        regressions.push({
          metric: 'memory.used',
          type: 'increase',
          severity: 'medium',
          message: `Memory usage increased by ${((current.memory.used / baseline.metrics.memory.used - 1) * 100).toFixed(1)}%`
        });
      }
    }
    
    if (current.errorRate !== undefined && baseline.metrics?.errorRate !== undefined) {
      if (current.errorRate > baseline.metrics.errorRate * t.errorRate) {
        regressions.push({
          metric: 'errorRate',
          type: 'increase',
          severity: 'critical',
          message: `Error rate increased by ${((current.errorRate / baseline.metrics.errorRate - 1) * 100).toFixed(1)}%`
        });
      }
    }
    
    if (current.throughput && baseline.metrics?.throughput) {
      if (current.throughput < baseline.metrics.throughput * t.throughput) {
        regressions.push({
          metric: 'throughput',
          type: 'decrease',
          severity: 'high',
          message: `Throughput decreased by ${((1 - current.throughput / baseline.metrics.throughput) * 100).toFixed(1)}%`
        });
      }
    }
    
    return regressions;
  }
  
  /**
   * Analyze trend for a specific metric
   * @param {Array} history - History array
   * @param {string} metric - Metric name
   * @returns {Object} Trend analysis
   * @private
   */
  analyzeMetricTrend(history, metric) {
    const values = history.map(h => h[metric]).filter(v => v !== undefined);
    
    if (values.length < 2) {
      return { insufficientData: true };
    }
    
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Calculate trend using simple linear regression
    const n = values.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((acc, x, i) => acc + x * values[i], 0);
    const sumX2 = indices.reduce((acc, x) => acc + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    return {
      current: values[values.length - 1],
      average: avg.toFixed(2),
      min,
      max,
      slope: slope.toFixed(4),
      trend: slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable'
    };
  }
  
  /**
   * Analyze pass rate trend
   * @param {Array} history - History array
   * @returns {Object} Pass rate trend
   * @private
   */
  analyzePassRateTrend(history) {
    const results = history.map(h => h.passed);
    const passCount = results.filter(r => r).length;
    const passRate = (passCount / results.length * 100).toFixed(1);
    
    // Check for recent failures
    const recentResults = results.slice(-5);
    const recentPassRate = recentResults.filter(r => r).length / recentResults.length;
    
    return {
      overall: passRate + '%',
      recent: (recentPassRate * 100).toFixed(1) + '%',
      consecutiveFailures: this.countConsecutiveFailures(results),
      status: recentPassRate < 0.8 ? 'degrading' : recentPassRate === 1 ? 'stable' : 'variable'
    };
  }
  
  /**
   * Detect patterns in history
   * @param {Array} history - History array
   * @returns {Array} Detected patterns
   * @private
   */
  detectPatterns(history) {
    const patterns = [];
    
    // Check for degrading performance
    const scores = history.map(h => h.score).filter(s => s !== undefined);
    if (scores.length >= 3) {
      const recent = scores.slice(-3);
      if (recent.every((s, i) => i === 0 || s <= recent[i - 1])) {
        patterns.push({
          type: 'degrading-performance',
          description: 'Scores consistently decreasing over last 3 runs'
        });
      }
    }
    
    // Check for intermittent failures
    const results = history.map(h => h.passed);
    const failureCount = results.filter(r => !r).length;
    if (failureCount > 0 && failureCount < results.length / 2) {
      patterns.push({
        type: 'intermittent-failures',
        description: `Failures in ${failureCount} out of ${results.length} runs`
      });
    }
    
    return patterns;
  }
  
  /**
   * Generate alerts based on trends
   * @param {Object} trends - Trend analysis
   * @returns {Array} Alerts
   * @private
   */
  generateTrendAlerts(trends) {
    const alerts = [];
    
    if (trends.score?.trend === 'decreasing' && parseFloat(trends.score.slope) < -5) {
      alerts.push({
        level: 'warning',
        message: 'Verification scores showing significant decline'
      });
    }
    
    if (trends.passRate?.status === 'degrading') {
      alerts.push({
        level: 'critical',
        message: 'Pass rate has fallen below 80%'
      });
    }
    
    if (trends.passRate?.consecutiveFailures > 2) {
      alerts.push({
        level: 'critical',
        message: `${trends.passRate.consecutiveFailures} consecutive failures detected`
      });
    }
    
    return alerts;
  }
  
  /**
   * Count consecutive failures at the end of results
   * @param {Array} results - Results array
   * @returns {number} Number of consecutive failures
   * @private
   */
  countConsecutiveFailures(results) {
    let count = 0;
    for (let i = results.length - 1; i >= 0; i--) {
      if (!results[i]) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }
  
  // Measurement methods - would be implemented with actual measurement tools
  
  async measureLatency(_testCase) {
    // Implementation would use actual latency measurement
    return { avg: 0, p50: 0, p95: 0, p99: 0 };
  }
  
  async measureThroughput(_testCase) {
    // Implementation would use actual throughput measurement
    return 0;
  }
  
  async measureMemory(_testCase) {
    // Implementation would use actual memory measurement
    return { used: 0, heap: 0, rss: 0 };
  }
  
  async measureErrorRate(_testCase) {
    // Implementation would use actual error rate measurement
    return 0;
  }
  
  /**
   * Generate regression report
   * @param {Object} results - Regression results
   * @returns {string} Markdown report
   */
  generateReport(results) {
    const status = results.passed ? '✅ PASS' : '❌ FAIL';
    
    let report = `# Regression Test Report\n\n`;
    report += `**Status:** ${status}\n`;
    report += `**Timestamp:** ${results.timestamp.toISOString()}\n\n`;
    
    report += `## Summary\n\n`;
    report += `- **Total Tests:** ${results.summary.total}\n`;
    report += `- **Passed:** ${results.summary.passed}\n`;
    report += `- **Failed:** ${results.summary.failed}\n`;
    report += `- **With Regressions:** ${results.summary.regressions}\n\n`;
    
    if (results.regressions && results.regressions.length > 0) {
      report += `## Regressions Detected\n\n`;
      report += `| Test | Type | Severity | Change |\n`;
      report += `|------|------|----------|--------|\n`;
      
      for (const reg of results.regressions) {
        const change = reg.increase || reg.decrease || 'N/A';
        report += `| ${reg.testName} | ${reg.type} | ${reg.severity} | ${change} |\n`;
      }
      report += '\n';
    }
    
    if (results.trends) {
      report += `## Trend Analysis\n\n`;
      
      if (results.trends.score) {
        report += `### Score Trend\n`;
        report += `- Trend: ${results.trends.score.trend}\n`;
        report += `- Average: ${results.trends.score.average}\n\n`;
      }
      
      if (results.trends.passRate) {
        report += `### Pass Rate\n`;
        report += `- Overall: ${results.trends.passRate.overall}\n`;
        report += `- Recent: ${results.trends.passRate.recent}\n`;
        report += `- Status: ${results.trends.passRate.status}\n\n`;
      }
      
      if (results.trends.alerts && results.trends.alerts.length > 0) {
        report += `### Alerts\n\n`;
        for (const alert of results.trends.alerts) {
          const emoji = alert.level === 'critical' ? '🔴' : '🟡';
          report += `- ${emoji} ${alert.message}\n`;
        }
        report += '\n';
      }
    }
    
    return report;
  }
}

export default RegressionSuite;
