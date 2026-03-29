import { EventEmitter } from 'events';

/**
 * Security test runner for vulnerability scanning and secret detection
 */
export class SecurityTestRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    this.owaspRules = options.owaspRules || this.getDefaultOWASPRules();
    this.dependencyCheckEnabled = options.dependencyCheck ?? true;
    this.secretPatterns = options.secretPatterns || this.getDefaultSecretPatterns();
    this.severityThreshold = options.severityThreshold || 'low';
    this.scanExclusions = options.scanExclusions || ['node_modules/**', '.git/**', '**/*.min.js'];
  }
  
  /**
   * Run security scan
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Scan options
   * @returns {Promise<Object>} Security scan results
   */
  async run(patchId, options = {}) {
    this.emit('scan:start', { patchId, timestamp: new Date() });
    
    const startTime = Date.now();
    const results = {
      patchId,
      timestamp: new Date(),
      duration: 0,
      vulnerabilities: [],
      secrets: [],
      dependencyIssues: [],
      codeIssues: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        total: 0
      }
    };
    
    try {
      // OWASP code scan
      this.emit('scan:owasp:start');
      results.codeIssues = await this.runOWASPScan(patchId, options);
      this.emit('scan:owasp:complete', { count: results.codeIssues.length });
      
      // Secret detection
      this.emit('scan:secrets:start');
      results.secrets = await this.detectSecrets(patchId, options);
      this.emit('scan:secrets:complete', { count: results.secrets.length });
      
      // Dependency vulnerability scan
      if (this.dependencyCheckEnabled) {
        this.emit('scan:dependencies:start');
        results.dependencyIssues = await this.scanDependencies(patchId, options);
        this.emit('scan:dependencies:complete', { count: results.dependencyIssues.length });
      }
      
      // Aggregate all vulnerabilities
      results.vulnerabilities = [
        ...results.codeIssues,
        ...results.dependencyIssues.map(d => ({
          type: 'dependency',
          severity: d.severity,
          message: `${d.package}: ${d.vulnerability}`,
          cwe: d.cwe,
          recommendation: d.recommendation
        }))
      ];
      
      // Calculate summary
      for (const vuln of results.vulnerabilities) {
        results.summary[vuln.severity] = (results.summary[vuln.severity] || 0) + 1;
      }
      results.summary.total = results.vulnerabilities.length;
      
      results.duration = Date.now() - startTime;
      
      this.emit('scan:complete', { results });
      
      return results;
    } catch (error) {
      results.duration = Date.now() - startTime;
      results.error = error.message;
      this.emit('scan:error', { error });
      return results;
    }
  }
  
  /**
   * Scan code for vulnerabilities
   * @param {string|Object} code - Code to scan
   * @param {Object} options - Scan options
   * @returns {Promise<Object>} Scan results
   */
  async scan(code, _options = {}) {
    const results = {
      vulnerabilities: [],
      secrets: [],
      timestamp: new Date()
    };
    
    const codeString = typeof code === 'string' ? code : JSON.stringify(code);
    
    // Run OWASP checks
    for (const rule of this.owaspRules) {
      const matches = await this.checkRule(codeString, rule);
      for (const match of matches) {
        results.vulnerabilities.push({
          type: rule.id,
          severity: rule.severity,
          message: rule.message,
          cwe: rule.cwe,
          line: match.line,
          code: match.code,
          recommendation: rule.recommendation
        });
      }
    }
    
    // Check for secrets
    results.secrets = await this.findSecrets(codeString);
    
    return results;
  }
  
  /**
   * Run OWASP security scan
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Scan options
   * @returns {Promise<Array>} Found vulnerabilities
   * @private
   */
  async runOWASPScan(patchId, options) {
    const vulnerabilities = [];
    
    // This would typically scan files in the patch
    // For now, we'll return a structure for the scan
    
    const filesToScan = options.files || [];
    
    for (const file of filesToScan) {
      for (const rule of this.owaspRules) {
        const matches = await this.scanFile(file, rule);
        for (const match of matches) {
          vulnerabilities.push({
            type: rule.id,
            severity: rule.severity,
            message: rule.message,
            file: file,
            line: match.line,
            column: match.column,
            code: match.code,
            cwe: rule.cwe,
            owasp: rule.owasp,
            recommendation: rule.recommendation
          });
        }
      }
    }
    
    return vulnerabilities;
  }
  
  /**
   * Scan a single file against a rule
   * @private
   */
  async scanFile(_file, _rule) {
    const matches = [];
    
    try {
      // In production, this would read and scan the actual file
      // For now, returning empty matches
      // Implementation would use the rule.pattern to scan file content
    } catch (error) {
      this.emit('scan:file-error', { file, error: error.message });
    }
    
    return matches;
  }
  
  /**
   * Check code against a rule
   * @private
   */
  async checkRule(code, rule) {
    const matches = [];
    
    if (rule.pattern && rule.pattern.test(code)) {
      // Find all matches with line numbers
      const lines = code.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i])) {
          matches.push({
            line: i + 1,
            code: lines[i].trim()
          });
        }
        // Reset regex lastIndex for global patterns
        rule.pattern.lastIndex = 0;
      }
    }
    
    return matches;
  }
  
  /**
   * Detect secrets in code
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Detection options
   * @returns {Promise<Array>} Found secrets
   * @private
   */
  async detectSecrets(patchId, options) {
    const secrets = [];
    const filesToScan = options.files || [];
    
    for (const file of filesToScan) {
      try {
        const fileSecrets = await this.scanFileForSecrets(file);
        secrets.push(...fileSecrets);
      } catch (error) {
        this.emit('scan:secret-error', { file, error: error.message });
      }
    }
    
    return secrets;
  }
  
  /**
   * Scan file for secrets
   * @private
   */
  async scanFileForSecrets(_file) {
    const secrets = [];
    
    // In production, this would read and scan the actual file
    // For each pattern match, add to secrets
    
    return secrets;
  }
  
  /**
   * Find secrets in code string
   * @param {string} code - Code to scan
   * @returns {Promise<Array>} Found secrets
   * @private
   */
  async findSecrets(code) {
    const secrets = [];
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of this.secretPatterns) {
        if (pattern.regex.test(lines[i])) {
          secrets.push({
            type: pattern.name,
            line: i + 1,
            location: `Line ${i + 1}`,
            confidence: pattern.confidence,
            severity: pattern.severity
          });
        }
        pattern.regex.lastIndex = 0;
      }
    }
    
    return secrets;
  }
  
  /**
   * Scan dependencies for vulnerabilities
   * @param {string} patchId - Patch identifier
   * @param {Object} options - Scan options
   * @returns {Promise<Array>} Vulnerable dependencies
   * @private
   */
  async scanDependencies(patchId, options) {
    const issues = [];
    
    // This would typically use npm audit, Snyk, or similar
    // For now, returning an empty structure
    
    const dependencies = options.dependencies || [];
    
    for (const dep of dependencies) {
      const vulnerabilities = await this.checkDependencyVulnerabilities(dep);
      issues.push(...vulnerabilities);
    }
    
    return issues;
  }
  
  /**
   * Check a dependency for vulnerabilities
   * @private
   */
  async checkDependencyVulnerabilities(_dependency) {
    // This would check against vulnerability databases
    // Returns array of vulnerabilities found
    return [];
  }
  
  /**
   * Get default OWASP security rules
   * @returns {Array} OWASP rules
   * @private
   */
  getDefaultOWASPRules() {
    return [
      {
        id: 'A01:2021-BrokenAccessControl',
        owasp: 'A01:2021',
        cwe: 'CWE-639',
        severity: 'high',
        message: 'Potential insecure direct object reference detected',
        pattern: /req\.params\[.*\].*\.findById|req\.query\[.*\].*\.find/i,
        recommendation: 'Implement proper access control checks before accessing resources'
      },
      {
        id: 'A02:2021-CryptographicFailures',
        owasp: 'A02:2021',
        cwe: 'CWE-327',
        severity: 'critical',
        message: 'Weak cryptographic algorithm detected',
        pattern: /md5|sha1\(|des\.|rc4/i,
        recommendation: 'Use strong cryptographic algorithms (AES-256, SHA-256, etc.)'
      },
      {
        id: 'A03:2021-Injection',
        owasp: 'A03:2021',
        cwe: 'CWE-89',
        severity: 'critical',
        message: 'Potential SQL injection vulnerability',
        pattern: /(exec|query)\s*\(\s*["'`].*\$\{|\.concat\(|\+.*req\./i,
        recommendation: 'Use parameterized queries or prepared statements'
      },
      {
        id: 'A03:2021-CommandInjection',
        owasp: 'A03:2021',
        cwe: 'CWE-78',
        severity: 'critical',
        message: 'Potential command injection vulnerability',
        pattern: /exec\s*\(|execSync\s*\(|spawn\s*\(.*\+.*req\./i,
        recommendation: 'Avoid passing user input to command execution functions'
      },
      {
        id: 'A07:2021-AuthFailures',
        owasp: 'A07:2021',
        cwe: 'CWE-798',
        severity: 'high',
        message: 'Hardcoded credentials detected',
        pattern: /password\s*=\s*["'][^"']+["']|secret\s*=\s*["'][^"']+["']|api[_-]?key\s*=\s*["'][^"']+["']/i,
        recommendation: 'Use environment variables or secure vaults for credentials'
      },
      {
        id: 'A05:2021-SecurityMisconfiguration',
        owasp: 'A05:2021',
        cwe: 'CWE-200',
        severity: 'medium',
        message: 'Sensitive information in error messages',
        pattern: /res\.send\(.*err\.message\)|res\.json\(.*err\.stack\)/i,
        recommendation: 'Return generic error messages to clients, log details server-side'
      },
      {
        id: 'A06:2021-VulnerableComponents',
        owasp: 'A06:2021',
        cwe: 'CWE-1035',
        severity: 'high',
        message: 'Deprecated or vulnerable function usage',
        pattern: /eval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*["']|setInterval\s*\(\s*["']/i,
        recommendation: 'Avoid using eval() and similar dangerous functions'
      },
      {
        id: 'A08:2021-IntegrityFailures',
        owasp: 'A08:2021',
        cwe: 'CWE-494',
        severity: 'high',
        message: 'Insecure deserialization detected',
        pattern: /JSON\.parse\(.*req\.|unserialize\(|pickle\.loads|yaml\.load\(/i,
        recommendation: 'Use safe deserialization methods and validate input'
      },
      {
        id: 'A10:2021-SSRF',
        owasp: 'A10:2021',
        cwe: 'CWE-918',
        severity: 'high',
        message: 'Potential Server-Side Request Forgery',
        pattern: /fetch\s*\(.*req\.|request\s*\(.*req\.|http\.get\s*\(.*req\./i,
        recommendation: 'Validate and sanitize URLs, use allowlists for external requests'
      },
      {
        id: 'A01:2021-PathTraversal',
        owasp: 'A01:2021',
        cwe: 'CWE-22',
        severity: 'high',
        message: 'Potential path traversal vulnerability',
        pattern: /fs\.(readFile|writeFile|createReadStream)\s*\(.*req\.|path\.join\s*\(.*req\./i,
        recommendation: 'Validate and sanitize file paths, use path normalization'
      }
    ];
  }
  
  /**
   * Get default secret detection patterns
   * @returns {Array} Secret patterns
   * @private
   */
  getDefaultSecretPatterns() {
    return [
      {
        name: 'AWS Access Key ID',
        regex: /AKIA[0-9A-Z]{16}/g,
        confidence: 'high',
        severity: 'critical'
      },
      {
        name: 'AWS Secret Access Key',
        regex: /[0-9a-zA-Z/+]{40}/g,
        confidence: 'medium',
        severity: 'critical'
      },
      {
        name: 'GitHub Token',
        regex: /ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|ghu_[a-zA-Z0-9]{36}|ghs_[a-zA-Z0-9]{36}|ghr_[a-zA-Z0-9]{36}/g,
        confidence: 'high',
        severity: 'critical'
      },
      {
        name: 'Private Key',
        regex: /-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
        confidence: 'high',
        severity: 'critical'
      },
      {
        name: 'JWT Token',
        regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
        confidence: 'medium',
        severity: 'high'
      },
      {
        name: 'Slack Token',
        regex: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}(-[a-zA-Z0-9]{24})?/g,
        confidence: 'high',
        severity: 'critical'
      },
      {
        name: 'Generic API Key',
        regex: /[aA][pP][iI][-_]?[kK][eE][yY][\s]*[=:]+[\s]*["\'][a-zA-Z0-9]{16,}["\']/g,
        confidence: 'medium',
        severity: 'high'
      },
      {
        name: 'Generic Secret',
        regex: /[sS][eE][cC][rR][eE][tT][\s]*[=:]+[\s]*["\'][a-zA-Z0-9]{8,}["\']/g,
        confidence: 'low',
        severity: 'medium'
      },
      {
        name: 'Password in URL',
        regex: /[a-zA-Z]{3,10}:\/\/[^/\s:@]*:[^/\s:@]*@[^/\s:@]*/g,
        confidence: 'high',
        severity: 'critical'
      },
      {
        name: 'Connection String',
        regex: /(mongodb|mysql|postgresql|redis|amqp):\/\/[^\s\"]+/gi,
        confidence: 'high',
        severity: 'high'
      }
    ];
  }
  
  /**
   * Check if severity meets threshold
   * @param {string} severity - Vulnerability severity
   * @returns {boolean} Whether severity meets threshold
   */
  meetsSeverityThreshold(severity) {
    const levels = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
    return levels[severity] >= levels[this.severityThreshold];
  }
  
  /**
   * Generate security report
   * @param {Object} results - Security scan results
   * @returns {string} Markdown report
   */
  generateReport(results) {
    let report = `# Security Scan Report\n\n`;
    report += `**Timestamp:** ${results.timestamp.toISOString()}\n`;
    report += `**Duration:** ${results.duration}ms\n\n`;
    
    // Summary
    report += `## Summary\n\n`;
    report += `| Severity | Count |\n`;
    report += `|----------|-------|\n`;
    report += `| 🔴 Critical | ${results.summary.critical} |\n`;
    report += `| 🟠 High | ${results.summary.high} |\n`;
    report += `| 🟡 Medium | ${results.summary.medium} |\n`;
    report += `| 🔵 Low | ${results.summary.low} |\n`;
    report += `| ⚪ Info | ${results.summary.info} |\n`;
    report += `| **Total** | **${results.summary.total}** |\n\n`;
    
    // Vulnerabilities
    if (results.vulnerabilities.length > 0) {
      report += `## Vulnerabilities\n\n`;
      
      for (const vuln of results.vulnerabilities) {
        const severityEmoji = this.getSeverityEmoji(vuln.severity);
        report += `### ${severityEmoji} ${vuln.type}\n\n`;
        report += `- **Severity:** ${vuln.severity}\n`;
        report += `- **Message:** ${vuln.message}\n`;
        if (vuln.cwe) report += `- **CWE:** ${vuln.cwe}\n`;
        if (vuln.owasp) report += `- **OWASP:** ${vuln.owasp}\n`;
        if (vuln.file) report += `- **File:** ${vuln.file}\n`;
        if (vuln.line) report += `- **Line:** ${vuln.line}\n`;
        if (vuln.code) report += `- **Code:** \`\`\`${vuln.code}\`\`\`\n`;
        if (vuln.recommendation) report += `- **Recommendation:** ${vuln.recommendation}\n`;
        report += '\n';
      }
    }
    
    // Secrets
    if (results.secrets.length > 0) {
      report += `## Secrets Detected\n\n`;
      report += `| Type | Location | Confidence |\n`;
      report += `|------|----------|------------|\n`;
      
      for (const secret of results.secrets) {
        report += `| ${secret.type} | ${secret.location} | ${secret.confidence} |\n`;
      }
      report += '\n';
      report += `⚠️ **WARNING:** Secrets were detected in the code. Remove them immediately and rotate any exposed credentials.\n\n`;
    }
    
    // Dependency Issues
    if (results.dependencyIssues.length > 0) {
      report += `## Dependency Vulnerabilities\n\n`;
      
      for (const issue of results.dependencyIssues) {
        report += `### ${issue.package}@${issue.version}\n\n`;
        report += `- **Vulnerability:** ${issue.vulnerability}\n`;
        report += `- **Severity:** ${issue.severity}\n`;
        report += `- **CWE:** ${issue.cwe}\n`;
        if (issue.recommendation) report += `- **Recommendation:** ${issue.recommendation}\n`;
        report += '\n';
      }
    }
    
    // Recommendations
    if (results.summary.critical > 0 || results.summary.high > 0) {
      report += `## Action Required\n\n`;
      report += `🔴 **Critical and High severity issues must be resolved before deployment.**\n\n`;
      report += `Please address the following:\n`;
      report += `1. Fix all critical vulnerabilities immediately\n`;
      report += `2. Review and remediate high severity issues\n`;
      report += `3. Run security tests again to verify fixes\n`;
      report += `4. Consider a security review for medium severity issues\n`;
    }
    
    return report;
  }
  
  /**
   * Get severity emoji
   * @private
   */
  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: '⚪'
    };
    return emojis[severity] || '⚪';
  }
}

export default SecurityTestRunner;
