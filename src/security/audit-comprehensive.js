/**
 * @fileoverview Security Audit class for vulnerability scanning and compliance
 * @module @cognimesh/security/audit
 * @version 5.0.0
 */

import crypto from 'crypto';
import { readFile } from 'fs/promises';

/**
 * Security Audit class for vulnerability scanning and compliance checks
 * @class SecurityAudit
 */
export class SecurityAudit {
  /**
   * @param {Object} [options={}] - Audit options
   * @param {boolean} [options.checkDependencies=true] - Check dependencies
   * @param {boolean} [options.checkConfiguration=true] - Check configuration
   * @param {boolean} [options.checkOWASP=true] - Run OWASP checks
   * @param {boolean} [options.intrusionDetection=true] - Run intrusion detection
   */
  constructor(options = {}) {
    this.options = {
      checkDependencies: true,
      checkConfiguration: true,
      checkOWASP: true,
      intrusionDetection: true,
      ...options
    };
    
    this.vulnerabilities = [];
    this.warnings = [];
    this.findings = [];
    
    this.owaspCategories = {
      A01: 'Broken Access Control',
      A02: 'Cryptographic Failures',
      A03: 'Injection',
      A04: 'Insecure Design',
      A05: 'Security Misconfiguration',
      A06: 'Vulnerable and Outdated Components',
      A07: 'Identification and Authentication Failures',
      A08: 'Software and Data Integrity Failures',
      A09: 'Security Logging and Monitoring Failures',
      A10: 'Server-Side Request Forgery (SSRF)'
    };
  }

  /**
   * Run comprehensive security scan
   * @returns {Promise<Object>} Audit results
   */
  async runFullAudit() {
    this.vulnerabilities = [];
    this.warnings = [];
    this.findings = [];
    
    await Promise.all([
      this.scanVulnerabilities(),
      this.checkDependencies(),
      this.auditConfiguration(),
      this.intrusionDetection()
    ]);
    
    return this.generateReport();
  }

  /**
   * Scan for common vulnerabilities
   * @returns {Promise<Array>} Found vulnerabilities
   */
  async scanVulnerabilities() {
    const checks = [
      this.checkForHardcodedSecrets(),
      this.checkForInsecureProtocols(),
      this.checkForMissingSecurityHeaders(),
      this.checkForInformationDisclosure(),
      this.checkForInsecureFileUploads(),
      this.checkForPathTraversal(),
      this.checkForSQLInjectionPoints(),
      this.checkForXSSVulnerabilities()
    ];
    
    await Promise.all(checks);
    return this.vulnerabilities;
  }

  /**
   * Check for hardcoded secrets in code
   * @private
   */
  async checkForHardcodedSecrets() {
    const suspiciousVars = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'CREDENTIAL'];
    const envVars = Object.keys(process.env);
    
    envVars.forEach(varName => {
      if (suspiciousVars.some(s => varName.toUpperCase().includes(s))) {
        const value = process.env[varName];
        if (value && value.length > 8 && !value.includes('${')) {
          this.addVulnerability('A02', 'Potential hardcoded secret in environment', {
            variable: varName,
            recommendation: 'Use secure secret management service'
          });
        }
      }
    });
  }

  /**
   * Check for insecure protocol usage
   * @private
   */
  async checkForInsecureProtocols() {
    const checks = [
      {
        condition: process.env.DATABASE_URL?.startsWith('http:'),
        issue: 'Database connection using unencrypted HTTP'
      },
      {
        condition: process.env.REDIS_URL?.startsWith('redis://'),
        issue: 'Redis connection without SSL/TLS'
      },
      {
        condition: process.env.NODE_ENV === 'production' && !process.env.HTTPS_ONLY,
        issue: 'HTTPS not enforced in production'
      }
    ];
    
    checks.forEach(check => {
      if (check.condition) {
        this.addVulnerability('A02', check.issue, {
          severity: 'HIGH',
          recommendation: 'Use encrypted connections (HTTPS, SSL, TLS)'
        });
      }
    });
  }

  /**
   * Check for missing security headers
   * @private
   */
  async checkForMissingSecurityHeaders() {
    const requiredHeaders = [
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Content-Security-Policy',
      'X-XSS-Protection',
      'Referrer-Policy'
    ];
    
    if (!process.env.SECURITY_HEADERS_CONFIGURED) {
      this.addWarning('A05', 'Security headers may not be configured', {
        missing: requiredHeaders,
        recommendation: 'Use Helmet.js or configure security headers manually'
      });
    }
  }

  /**
   * Check for information disclosure
   * @private
   */
  async checkForInformationDisclosure() {
    if (process.env.NODE_ENV === 'production') {
      if (process.env.DEBUG === 'true' || process.env.LOG_LEVEL === 'debug') {
        this.addVulnerability('A05', 'Debug mode enabled in production', {
          severity: 'MEDIUM',
          recommendation: 'Set DEBUG=false and LOG_LEVEL=warn in production'
        });
      }
    }
  }

  /**
   * Check for insecure file upload configurations
   * @private
   */
  async checkForInsecureFileUploads() {
    const dangerousExtensions = ['.exe', '.php', '.jsp', '.asp', '.aspx', '.sh', '.bat'];
    
    this.addWarning('A04', 'File upload security should be reviewed', {
      dangerousExtensions,
      recommendations: [
        'Validate file types by content, not just extension',
        'Store uploads outside web root',
        'Scan uploads for malware',
        'Limit file size'
      ]
    });
  }

  /**
   * Check for path traversal vulnerabilities
   * @private
   */
  async checkForPathTraversal() {
    this.addWarning('A01', 'Path traversal vulnerability check', {
      patterns: ['../', '..\\', '%2e%2e%2f'],
      recommendation: 'Validate and sanitize all file paths, use path.normalize()'
    });
  }

  /**
   * Check for SQL injection points
   * @private
   */
  async checkForSQLInjectionPoints() {
    this.addWarning('A03', 'SQL injection prevention check', {
      recommendations: [
        'Use parameterized queries',
        'Avoid string concatenation in SQL',
        'Use ORM with proper escaping',
        'Validate and sanitize all inputs'
      ]
    });
  }

  /**
   * Check for XSS vulnerabilities
   * @private
   */
  async checkForXSSVulnerabilities() {
    this.addWarning('A03', 'XSS prevention check', {
      recommendations: [
        'Escape output in HTML context',
        'Use Content Security Policy',
        'Validate and sanitize user input',
        'Use framework auto-escaping features'
      ]
    });
  }

  /**
   * Check dependencies for known vulnerabilities
   * @returns {Promise<Array>} Vulnerable dependencies
   */
  async checkDependencies() {
    try {
      const packageJson = JSON.parse(await readFile('./package.json', 'utf8'));
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      const knownVulnerablePackages = [
        { name: 'lodash', version: '<4.17.19', cve: 'CVE-2020-8203' },
        { name: 'express', version: '<4.17.3', cve: 'CVE-2022-24999' },
        { name: 'minimist', version: '<1.2.6', cve: 'CVE-2021-44906' },
        { name: 'node-fetch', version: '<2.6.7', cve: 'CVE-2022-0235' },
        { name: 'jsonwebtoken', version: '<9.0.0', cve: 'CVE-2022-23529' }
      ];
      
      for (const [name, version] of Object.entries(dependencies)) {
        const cleanVersion = version.replace(/^\^|~/, '');
        
        const vulnerable = knownVulnerablePackages.find(
          v => v.name === name && this.versionSatisfies(cleanVersion, v.version)
        );
        
        if (vulnerable) {
          this.addVulnerability('A06', `Vulnerable dependency: ${name}@${version}`, {
            cve: vulnerable.cve,
            severity: 'HIGH',
            recommendation: `Update ${name} to latest version`
          });
        }
      }
      
      const criticalPackages = ['express', 'cors', 'helmet', 'bcrypt', 'jsonwebtoken'];
      for (const pkg of criticalPackages) {
        if (!dependencies[pkg]) {
          this.addWarning('A06', `Security-critical package not found: ${pkg}`, {
            recommendation: `Consider adding ${pkg} for security`
          });
        }
      }
    } catch (error) {
      this.addWarning('A06', 'Could not check dependencies', { error: error.message });
    }
    
    return this.vulnerabilities.filter(v => v.category === 'A06');
  }

  /**
   * Check if version satisfies constraint
   * @private
   */
  versionSatisfies(version, constraint) {
    const match = constraint.match(/^([<>=]+)(.+)$/);
    if (!match) return false;
    
    const [, op, targetVersion] = match;
    const v1 = version.split('.').map(Number);
    const v2 = targetVersion.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const a = v1[i] || 0;
      const b = v2[i] || 0;
      
      if (a !== b) {
        if (op === '<') return a < b;
        if (op === '>') return a > b;
        if (op === '<=') return a <= b;
        if (op === '>=') return a >= b;
      }
    }
    
    return op.includes('=');
  }

  /**
   * Audit application configuration
   * @returns {Promise<Object>} Configuration audit results
   */
  async auditConfiguration() {
    this.checkSessionConfiguration();
    this.checkAuthenticationConfiguration();
    this.checkAuthorizationConfiguration();
    this.checkLoggingConfiguration();
    this.checkErrorHandlingConfiguration();
    
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      this.addVulnerability('A07', 'Weak or missing session secret', {
        severity: 'CRITICAL',
        recommendation: 'Generate a strong session secret (256+ bits)'
      });
    }
    
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      this.addVulnerability('A02', 'Weak JWT secret', {
        severity: 'HIGH',
        recommendation: 'Use a strong JWT secret (256+ bits) or RSA key pair'
      });
    }
    
    if (!process.env.PASSWORD_MIN_LENGTH || parseInt(process.env.PASSWORD_MIN_LENGTH) < 8) {
      this.addWarning('A07', 'Weak password policy', {
        recommendation: 'Set PASSWORD_MIN_LENGTH to at least 8'
      });
    }
    
    if (!process.env.RATE_LIMIT_ENABLED) {
      this.addWarning('A07', 'Rate limiting not explicitly enabled', {
        recommendation: 'Enable rate limiting to prevent brute force attacks'
      });
    }
    
    return {
      session: this.checkSessionConfiguration(),
      authentication: this.checkAuthenticationConfiguration(),
      authorization: this.checkAuthorizationConfiguration(),
      logging: this.checkLoggingConfiguration(),
      errorHandling: this.checkErrorHandlingConfiguration()
    };
  }

  /**
   * Check session configuration
   * @private
   */
  checkSessionConfiguration() {
    const issues = [];
    
    if (process.env.NODE_ENV === 'production') {
      if (process.env.SESSION_SECURE !== 'true') {
        issues.push('Session cookie not marked as secure');
      }
      if (process.env.SESSION_HTTPONLY !== 'true') {
        issues.push('Session cookie not marked as HttpOnly');
      }
      if (process.env.SESSION_SAMESITE !== 'strict') {
        issues.push('Session cookie SameSite not set to strict');
      }
    }
    
    issues.forEach(issue => {
      this.addWarning('A07', issue, { recommendation: 'Configure session cookies securely' });
    });
    
    return { configured: issues.length === 0, issues };
  }

  /**
   * Check authentication configuration
   * @private
   */
  checkAuthenticationConfiguration() {
    if (!process.env.MFA_ENABLED && !process.env.OTP_ENABLED) {
      this.addWarning('A07', 'Multi-factor authentication not enabled', {
        recommendation: 'Enable MFA for enhanced security'
      });
    }
    
    return { configured: true };
  }

  /**
   * Check authorization configuration
   * @private
   */
  checkAuthorizationConfiguration() {
    if (!process.env.RBAC_ENABLED && !process.env.ABAC_ENABLED) {
      this.addWarning('A01', 'RBAC/ABAC not explicitly enabled', {
        recommendation: 'Implement role-based or attribute-based access control'
      });
    }
    
    return { configured: true };
  }

  /**
   * Check logging configuration
   * @private
   */
  checkLoggingConfiguration() {
    if (!process.env.AUDIT_LOG_ENABLED) {
      this.addWarning('A09', 'Audit logging not enabled', {
        recommendation: 'Enable comprehensive audit logging'
      });
    }
    
    if (process.env.LOG_SENSITIVE_DATA === 'true') {
      this.addVulnerability('A09', 'Sensitive data may be logged', {
        severity: 'HIGH',
        recommendation: 'Set LOG_SENSITIVE_DATA=false and mask sensitive fields'
      });
    }
    
    return { configured: true };
  }

  /**
   * Check error handling configuration
   * @private
   */
  checkErrorHandlingConfiguration() {
    if (process.env.NODE_ENV === 'production' && process.env.EXPOSE_STACK_TRACES === 'true') {
      this.addVulnerability('A05', 'Stack traces exposed in production', {
        severity: 'MEDIUM',
        recommendation: 'Set EXPOSE_STACK_TRACES=false in production'
      });
    }
    
    return { configured: true };
  }

  /**
   * Run intrusion detection checks
   * @returns {Promise<Object>} Detection results
   */
  async intrusionDetection() {
    const detections = {
      suspiciousActivity: [],
      anomalies: [],
      indicators: []
    };
    
    if (process.env.NODE_OPTIONS?.includes('--inspect')) {
      detections.suspiciousActivity.push({
        type: 'DEBUGGING_ENABLED',
        description: 'Node inspector enabled',
        risk: 'HIGH'
      });
    }
    
    const suspiciousEnvVars = ['REV_SHELL', 'BACKDOOR', 'REMOTE_ACCESS'];
    for (const varName of Object.keys(process.env)) {
      if (suspiciousEnvVars.some(s => varName.toUpperCase().includes(s))) {
        detections.indicators.push({
          type: 'SUSPICIOUS_ENV_VAR',
          variable: varName,
          risk: 'CRITICAL'
        });
      }
    }
    
    if (detections.suspiciousActivity.length || detections.indicators.length) {
      this.addFinding('INTRUSION_DETECTION', 'Potential security threats detected', detections);
    }
    
    return detections;
  }

  /**
   * Add a vulnerability finding
   * @private
   */
  addVulnerability(category, description, details = {}) {
    this.vulnerabilities.push({
      id: `VULN-${String(this.vulnerabilities.length + 1).padStart(3, '0')}`,
      category,
      owaspCategory: this.owaspCategories[category],
      description,
      severity: details.severity || 'MEDIUM',
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  /**
   * Add a warning
   * @private
   */
  addWarning(category, description, details = {}) {
    this.warnings.push({
      id: `WARN-${String(this.warnings.length + 1).padStart(3, '0')}`,
      category,
      owaspCategory: this.owaspCategories[category],
      description,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  /**
   * Add a general finding
   * @private
   */
  addFinding(type, description, details = {}) {
    this.findings.push({
      id: `FIND-${String(this.findings.length + 1).padStart(3, '0')}`,
      type,
      description,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  /**
   * Generate comprehensive security report
   * @returns {Object} Security audit report
   */
  generateReport() {
    const criticalCount = this.vulnerabilities.filter(v => v.severity === 'CRITICAL').length;
    const highCount = this.vulnerabilities.filter(v => v.severity === 'HIGH').length;
    const mediumCount = this.vulnerabilities.filter(v => v.severity === 'MEDIUM').length;
    const lowCount = this.vulnerabilities.filter(v => v.severity === 'LOW').length;
    
    return {
      summary: {
        totalVulnerabilities: this.vulnerabilities.length,
        totalWarnings: this.warnings.length,
        totalFindings: this.findings.length,
        severityBreakdown: { critical: criticalCount, high: highCount, medium: mediumCount, low: lowCount },
        riskScore: this.calculateRiskScore(),
        compliance: this.calculateCompliance()
      },
      vulnerabilities: this.vulnerabilities,
      warnings: this.warnings,
      findings: this.findings,
      owaspTop10: this.groupByOWASP(),
      recommendations: this.generateRecommendations(),
      generatedAt: new Date().toISOString(),
      version: '5.0.0'
    };
  }

  /**
   * Calculate overall risk score
   * @private
   */
  calculateRiskScore() {
    const weights = { CRITICAL: 10, HIGH: 5, MEDIUM: 2, LOW: 1 };
    let score = 100;
    
    this.vulnerabilities.forEach(v => {
      score -= weights[v.severity] || 1;
    });
    
    score -= this.warnings.length * 0.5;
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate compliance score
   * @private
   */
  calculateCompliance() {
    const totalChecks = 10;
    const categoriesWithIssues = new Set([
      ...this.vulnerabilities.map(v => v.category),
      ...this.warnings.map(w => w.category)
    ]).size;
    
    return {
      owaspTop10: {
        compliant: totalChecks - categoriesWithIssues,
        total: totalChecks,
        percentage: Math.round(((totalChecks - categoriesWithIssues) / totalChecks) * 100)
      }
    };
  }

  /**
   * Group findings by OWASP category
   * @private
   */
  groupByOWASP() {
    const grouped = {};
    
    Object.keys(this.owaspCategories).forEach(code => {
      grouped[code] = {
        name: this.owaspCategories[code],
        vulnerabilities: this.vulnerabilities.filter(v => v.category === code),
        warnings: this.warnings.filter(w => w.category === code)
      };
    });
    
    return grouped;
  }

  /**
   * Generate prioritized recommendations
   * @private
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.vulnerabilities.some(v => v.severity === 'CRITICAL')) {
      recommendations.push({
        priority: 1,
        action: 'Address all CRITICAL vulnerabilities immediately',
        items: this.vulnerabilities.filter(v => v.severity === 'CRITICAL')
      });
    }
    
    if (this.vulnerabilities.some(v => v.severity === 'HIGH')) {
      recommendations.push({
        priority: 2,
        action: 'Fix HIGH severity vulnerabilities within 48 hours',
        items: this.vulnerabilities.filter(v => v.severity === 'HIGH')
      });
    }
    
    recommendations.push({
      priority: 3,
      action: 'Keep dependencies up to date',
      details: 'Regularly run npm audit and update packages'
    });
    
    recommendations.push({
      priority: 4,
      action: 'Implement continuous security monitoring',
      details: 'Set up automated security scanning in CI/CD pipeline'
    });
    
    return recommendations;
  }
}

export default SecurityAudit;
