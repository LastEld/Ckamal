import { EventEmitter } from 'events';
import { RegressionSuite } from './regression-suite.js';
import { UnitTestRunner } from './test-runners/unit.js';
import { IntegrationTestRunner } from './test-runners/integration.js';
import { PerformanceTestRunner } from './test-runners/performance.js';
import { SecurityTestRunner } from './test-runners/security.js';

/**
 * Patch verification system for CogniMesh
 * Performs static analysis, unit tests, integration tests, performance tests, and security scans
 */
export class PatchVerifier extends EventEmitter {
  constructor(options = {}) {
    super();
    this.testSuites = new Map();
    this.thresholds = {
      minSuccessRate: options.minSuccessRate ?? 0.95,
      maxLatencyRegression: options.maxLatencyRegression ?? 1.1, // 10% max regression
      maxErrorRate: options.maxErrorRate ?? 0.01,
      maxComplexity: options.maxComplexity ?? 20,
      minCodeCoverage: options.minCodeCoverage ?? 0.80
    };
    
    this.baselineMetrics = new Map();
    this.verificationHistory = [];
    
    // Initialize runners
    this.unitRunner = new UnitTestRunner();
    this.integrationRunner = new IntegrationTestRunner();
    this.performanceRunner = new PerformanceTestRunner();
    this.securityRunner = new SecurityTestRunner();
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Forward runner events
    [this.unitRunner, this.integrationRunner, this.performanceRunner, this.securityRunner].forEach(runner => {
      runner.on('test:start', (data) => this.emit('test:start', data));
      runner.on('test:complete', (data) => this.emit('test:complete', data));
      runner.on('test:fail', (data) => this.emit('test:fail', data));
    });
  }
  
  /**
   * Register a test suite
   * @param {string} name - Suite name
   * @param {Object} suite - Test suite configuration
   */
  registerTestSuite(name, suite) {
    this.testSuites.set(name, suite);
    this.emit('suite:registered', { name, suite });
  }
  
  /**
   * Unregister a test suite
   * @param {string} name - Suite name
   */
  unregisterTestSuite(name) {
    const suite = this.testSuites.get(name);
    this.testSuites.delete(name);
    this.emit('suite:unregistered', { name, suite });
  }
  
  /**
   * Verify a patch through the complete pipeline
   * @param {string} patchId - Unique patch identifier
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Verification result
   */
  async verifyPatch(patchId, options = {}) {
    this.emit('verify:start', { patchId, timestamp: new Date() });
    
    const results = {
      patchId,
      timestamp: new Date(),
      phases: {},
      passed: false,
      score: 0,
      issues: [],
      duration: 0
    };
    
    const startTime = Date.now();
    
    try {
      // Phase 1: Static Analysis
      this.emit('phase:start', { patchId, phase: 'static-analysis' });
      results.phases.staticAnalysis = await this.runStaticAnalysis(patchId, options);
      this.emit('phase:complete', { patchId, phase: 'static-analysis', result: results.phases.staticAnalysis });
      
      // Phase 2: Unit Tests
      this.emit('phase:start', { patchId, phase: 'unit-tests' });
      results.phases.unitTests = await this.runUnitTests(patchId, options);
      this.emit('phase:complete', { patchId, phase: 'unit-tests', result: results.phases.unitTests });
      
      // Phase 3: Integration Tests
      this.emit('phase:start', { patchId, phase: 'integration-tests' });
      results.phases.integrationTests = await this.runIntegrationTests(patchId, options);
      this.emit('phase:complete', { patchId, phase: 'integration-tests', result: results.phases.integrationTests });
      
      // Phase 4: Performance Tests
      this.emit('phase:start', { patchId, phase: 'performance-tests' });
      results.phases.performanceTests = await this.runPerformanceTests(patchId, options);
      this.emit('phase:complete', { patchId, phase: 'performance-tests', result: results.phases.performanceTests });
      
      // Phase 5: Security Scan
      this.emit('phase:start', { patchId, phase: 'security-scan' });
      results.phases.securityScan = await this.runSecurityScan(patchId, options);
      this.emit('phase:complete', { patchId, phase: 'security-scan', result: results.phases.securityScan });
      
      // Calculate overall score and determine pass/fail
      results.score = this.calculateOverallScore(results.phases);
      results.passed = this.determinePassFail(results);
      results.duration = Date.now() - startTime;
      
      // Collect all issues
      results.issues = this.collectIssues(results.phases);
      
      // Store verification history
      this.verificationHistory.push({
        patchId,
        timestamp: results.timestamp,
        score: results.score,
        passed: results.passed
      });
      
      this.emit('verify:complete', { patchId, results });
      
      return results;
    } catch (error) {
      results.duration = Date.now() - startTime;
      results.issues.push({
        severity: 'critical',
        phase: 'verification',
        message: error.message,
        stack: error.stack
      });
      
      this.emit('verify:error', { patchId, error });
      return results;
    }
  }
  
  /**
   * Run static analysis on the patch
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis results
   */
  async runStaticAnalysis(patchId, options = {}) {
    const results = {
      passed: true,
      score: 100,
      issues: [],
      metrics: {}
    };
    
    try {
      // Syntax check
      const syntaxResult = await this.checkSyntax(patchId, options);
      results.metrics.syntax = syntaxResult;
      if (!syntaxResult.valid) {
        results.passed = false;
        results.issues.push(...syntaxResult.issues);
      }
      
      // Code style check
      const styleResult = await this.checkCodeStyle(patchId, options);
      results.metrics.style = styleResult;
      if (styleResult.violations.length > 0) {
        results.issues.push(...styleResult.violations.map(v => ({
          severity: 'warning',
          type: 'style',
          message: v.message,
          location: v.location
        })));
      }
      
      // Complexity analysis
      const complexityResult = await this.analyzeComplexity(patchId, options);
      results.metrics.complexity = complexityResult;
      if (complexityResult.cyclomatic > this.thresholds.maxComplexity) {
        results.passed = false;
        results.issues.push({
          severity: 'error',
          type: 'complexity',
          message: `Cyclomatic complexity ${complexityResult.cyclomatic} exceeds threshold ${this.thresholds.maxComplexity}`,
          location: complexityResult.location
        });
      }
      
      // Code coverage check
      const coverageResult = await this.checkCodeCoverage(patchId, options);
      results.metrics.coverage = coverageResult;
      if (coverageResult.percentage < this.thresholds.minCodeCoverage) {
        results.passed = false;
        results.issues.push({
          severity: 'error',
          type: 'coverage',
          message: `Code coverage ${(coverageResult.percentage * 100).toFixed(1)}% below threshold ${(this.thresholds.minCodeCoverage * 100).toFixed(1)}%`
        });
      }
      
      results.score = this.calculatePhaseScore(results);
      return results;
    } catch (error) {
      results.passed = false;
      results.issues.push({
        severity: 'critical',
        type: 'analysis-error',
        message: error.message
      });
      return results;
    }
  }
  
  /**
   * Run unit tests
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runUnitTests(patchId, options = {}) {
    const suite = this.testSuites.get('unit');
    const results = await this.unitRunner.run(patchId, {
      ...suite,
      ...options
    });
    
    return {
      passed: results.successRate >= this.thresholds.minSuccessRate,
      score: results.successRate * 100,
      metrics: {
        total: results.total,
        passed: results.passed,
        failed: results.failed,
        skipped: results.skipped,
        successRate: results.successRate,
        duration: results.duration
      },
      issues: results.failures.map(f => ({
        severity: 'error',
        type: 'unit-test-failure',
        message: f.message,
        test: f.testName,
        stack: f.stack
      }))
    };
  }
  
  /**
   * Run integration tests
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runIntegrationTests(patchId, options = {}) {
    const suite = this.testSuites.get('integration');
    const results = await this.integrationRunner.run(patchId, {
      ...suite,
      ...options
    });
    
    return {
      passed: results.successRate >= this.thresholds.minSuccessRate,
      score: results.successRate * 100,
      metrics: {
        total: results.total,
        passed: results.passed,
        failed: results.failed,
        skipped: results.skipped,
        successRate: results.successRate,
        duration: results.duration
      },
      issues: results.failures.map(f => ({
        severity: 'error',
        type: 'integration-test-failure',
        message: f.message,
        test: f.testName,
        scenario: f.scenario
      }))
    };
  }
  
  /**
   * Run performance tests
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runPerformanceTests(patchId, options = {}) {
    const suite = this.testSuites.get('performance');
    const results = await this.performanceRunner.run(patchId, {
      ...suite,
      ...options
    });
    
    const issues = [];
    const baseline = this.baselineMetrics.get('performance');
    
    if (baseline) {
      // Check for latency regression
      if (results.latency.p95 > baseline.latency.p95 * this.thresholds.maxLatencyRegression) {
        issues.push({
          severity: 'warning',
          type: 'latency-regression',
          message: `P95 latency ${results.latency.p95}ms exceeds baseline ${baseline.latency.p95}ms by >10%`,
          baseline: baseline.latency.p95,
          current: results.latency.p95
        });
      }
      
      // Check for throughput regression
      if (results.throughput < baseline.throughput / this.thresholds.maxLatencyRegression) {
        issues.push({
          severity: 'warning',
          type: 'throughput-regression',
          message: `Throughput ${results.throughput} req/s below baseline ${baseline.throughput} by >10%`,
          baseline: baseline.throughput,
          current: results.throughput
        });
      }
    }
    
    return {
      passed: issues.length === 0,
      score: issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 20),
      metrics: results,
      baseline,
      issues
    };
  }
  
  /**
   * Run security scan
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Scan options
   * @returns {Promise<Object>} Scan results
   */
  async runSecurityScan(patchId, options = {}) {
    const results = await this.securityRunner.run(patchId, options);
    
    const criticalIssues = results.vulnerabilities.filter(v => v.severity === 'critical');
    const highIssues = results.vulnerabilities.filter(v => v.severity === 'high');
    
    return {
      passed: criticalIssues.length === 0,
      score: Math.max(0, 100 - criticalIssues.length * 50 - highIssues.length * 20),
      metrics: {
        vulnerabilitiesFound: results.vulnerabilities.length,
        secretsFound: results.secrets.length,
        dependencyIssues: results.dependencyIssues.length
      },
      vulnerabilities: results.vulnerabilities,
      secrets: results.secrets,
      dependencyIssues: results.dependencyIssues,
      issues: [
        ...criticalIssues.map(v => ({
          severity: 'critical',
          type: 'security-vulnerability',
          message: v.message,
          cwe: v.cwe,
          recommendation: v.recommendation
        })),
        ...results.secrets.map(s => ({
          severity: 'critical',
          type: 'secret-exposure',
          message: `Potential secret exposed: ${s.type}`,
          location: s.location
        }))
      ]
    };
  }
  
  /**
   * Run full regression suite
   * @param {Object} suite - Regression suite configuration
   * @returns {Promise<Object>} Regression results
   */
  async runRegressionSuite(suite = {}) {
    this.emit('regression:start', { timestamp: new Date() });
    
    const regressionSuite = new RegressionSuite({
      baselineStorage: this.baselineMetrics,
      ...suite
    });
    
    const results = await regressionSuite.run();
    
    // Detect regressions
    const regressions = regressionSuite.detectRegressions(results, this.thresholds);
    
    // Trend analysis
    const trends = regressionSuite.analyzeTrends(this.verificationHistory);
    
    this.emit('regression:complete', { results, regressions, trends });
    
    return {
      passed: regressions.length === 0,
      results,
      regressions,
      trends,
      timestamp: new Date()
    };
  }
  
  /**
   * Measure performance for a specific test
   * @param {Object} test - Performance test configuration
   * @returns {Promise<Object>} Performance metrics
   */
  async measurePerformance(test) {
    const beforeMetrics = await this.performanceRunner.measure(test);
    
    // Run the operation
    await test.operation();
    
    const afterMetrics = await this.performanceRunner.measure(test);
    
    return {
      before: beforeMetrics,
      after: afterMetrics,
      comparison: {
        latencyDelta: afterMetrics.latency.avg - beforeMetrics.latency.avg,
        throughputDelta: afterMetrics.throughput - beforeMetrics.throughput,
        memoryDelta: afterMetrics.memory.used - beforeMetrics.memory.used
      },
      regression: afterMetrics.latency.p95 > beforeMetrics.latency.p95 * this.thresholds.maxLatencyRegression
    };
  }
  
  /**
   * Perform security scan on code
   * @param {string|Object} code - Code to scan
   * @returns {Promise<Object>} Security scan results
   */
  async securityScan(code) {
    return this.securityRunner.scan(code);
  }
  
  /**
   * Generate verification report
   * @param {Object} results - Verification results
   * @param {string} format - Report format (markdown, json)
   * @returns {string} Generated report
   */
  generateReport(results, format = 'markdown') {
    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    }
    
    const status = results.passed ? '✅ PASS' : '❌ FAIL';
    const score = results.score.toFixed(1);
    
    let report = `# Patch Verification Report\n\n`;
    report += `**Patch ID:** ${results.patchId}\n`;
    report += `**Status:** ${status}\n`;
    report += `**Overall Score:** ${score}/100\n`;
    report += `**Duration:** ${results.duration}ms\n`;
    report += `**Timestamp:** ${results.timestamp.toISOString()}\n\n`;
    
    // Phase results
    report += `## Phase Results\n\n`;
    
    for (const [phase, data] of Object.entries(results.phases)) {
      const phaseStatus = data.passed ? '✅' : '❌';
      report += `### ${phaseStatus} ${this.capitalize(phase)}\n\n`;
      report += `- **Score:** ${data.score.toFixed(1)}/100\n`;
      report += `- **Passed:** ${data.passed}\n\n`;
      
      if (data.metrics) {
        report += `**Metrics:**\n\n`;
        for (const [key, value] of Object.entries(data.metrics)) {
          if (typeof value === 'object') {
            report += `- ${key}:\n`;
            for (const [k, v] of Object.entries(value)) {
              report += `  - ${k}: ${v}\n`;
            }
          } else {
            report += `- ${key}: ${value}\n`;
          }
        }
        report += '\n';
      }
    }
    
    // Issues
    if (results.issues.length > 0) {
      report += `## Issues\n\n`;
      report += `| Severity | Type | Message |\n`;
      report += `|----------|------|---------|\n`;
      
      for (const issue of results.issues) {
        const severity = this.getSeverityEmoji(issue.severity);
        report += `| ${severity} ${issue.severity} | ${issue.type} | ${issue.message} |\n`;
      }
      report += '\n';
    }
    
    // Recommendations
    if (!results.passed) {
      report += `## Recommendations\n\n`;
      const criticalIssues = results.issues.filter(i => i.severity === 'critical');
      const errors = results.issues.filter(i => i.severity === 'error');
      
      if (criticalIssues.length > 0) {
        report += `🔴 **Critical issues must be resolved before approval**\n\n`;
      }
      if (errors.length > 0) {
        report += `🟡 **Errors should be addressed**\n\n`;
      }
    }
    
    return report;
  }
  
  /**
   * Approve a patch
   * @param {string} patchId - Patch identifier
   * @returns {Promise<Object>} Approval result
   */
  async approvePatch(patchId) {
    const approval = {
      patchId,
      status: 'approved',
      timestamp: new Date(),
      approvedBy: 'PatchVerifier'
    };
    
    this.emit('patch:approved', approval);
    
    return approval;
  }
  
  /**
   * Reject a patch
   * @param {string} patchId - Patch identifier
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Rejection result
   */
  async rejectPatch(patchId, reason) {
    const rejection = {
      patchId,
      status: 'rejected',
      timestamp: new Date(),
      reason,
      rejectedBy: 'PatchVerifier'
    };
    
    this.emit('patch:rejected', rejection);
    
    // Create GitHub issue for review
    await this.createReviewIssue(patchId, reason);
    
    return rejection;
  }
  
  /**
   * Create GitHub issue for review
   * @param {string} patchId - Patch identifier
   * @param {string} reason - Issue reason
   * @private
   */
  async createReviewIssue(patchId, reason) {
    // This would integrate with GitHub API
    // Implementation depends on GitHub client configuration
    this.emit('issue:created', {
      patchId,
      title: `Patch ${patchId} requires review`,
      body: reason,
      labels: ['patch-review', 'needs-attention']
    });
  }
  
  // Private helper methods
  
  async checkSyntax(patchId, options) {
    // Implementation would use actual syntax checker
    return { valid: true, issues: [] };
  }
  
  async checkCodeStyle(patchId, options) {
    // Implementation would use linter (ESLint, etc.)
    return { violations: [] };
  }
  
  async analyzeComplexity(patchId, options) {
    // Implementation would use complexity analyzer
    return { cyclomatic: 10, cognitive: 8, location: patchId };
  }
  
  async checkCodeCoverage(patchId, options) {
    // Implementation would use coverage tool
    return { percentage: 0.85 };
  }
  
  calculateOverallScore(phases) {
    const weights = {
      staticAnalysis: 0.15,
      unitTests: 0.25,
      integrationTests: 0.25,
      performanceTests: 0.20,
      securityScan: 0.15
    };
    
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const [phase, data] of Object.entries(phases)) {
      const weight = weights[phase] || 0;
      totalScore += data.score * weight;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }
  
  calculatePhaseScore(results) {
    let score = 100;
    
    for (const issue of results.issues) {
      if (issue.severity === 'critical') score -= 50;
      else if (issue.severity === 'error') score -= 20;
      else if (issue.severity === 'warning') score -= 5;
    }
    
    return Math.max(0, score);
  }
  
  determinePassFail(results) {
    // Must pass all critical phases
    const criticalPhases = ['securityScan', 'unitTests'];
    for (const phase of criticalPhases) {
      if (!results.phases[phase]?.passed) {
        return false;
      }
    }
    
    // Overall score must be >= 80
    if (results.score < 80) {
      return false;
    }
    
    // No critical issues
    const hasCritical = results.issues.some(i => i.severity === 'critical');
    if (hasCritical) {
      return false;
    }
    
    return true;
  }
  
  collectIssues(phases) {
    const allIssues = [];
    
    for (const [phase, data] of Object.entries(phases)) {
      if (data.issues) {
        for (const issue of data.issues) {
          allIssues.push({ ...issue, phase });
        }
      }
    }
    
    return allIssues;
  }
  
  capitalize(str) {
    return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
  }
  
  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🔴',
      error: '🟠',
      warning: '🟡',
      info: '🔵'
    };
    return emojis[severity] || '⚪';
  }
}

export default PatchVerifier;
