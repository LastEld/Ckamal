#!/usr/bin/env node
/**
 * BIOS Security Test Runner Adapter
 * 
 * Запускает security-тесты через BIOS SecurityTestRunner
 * Использование: node scripts/run-bios-security.js [options]
 */

import { SecurityTestRunner } from '../src/bios/test-runners/security.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  severity: 'low',
  files: [],
  owasp: !args.includes('--no-owasp'),
  secrets: !args.includes('--no-secrets'),
  dependencies: !args.includes('--no-dependencies'),
  saveReport: args.includes('--save-report'),
  failOn: 'high' // Fail on critical/high/medium/low
};

// Parse --severity argument
const severityIndex = args.indexOf('--severity');
if (severityIndex !== -1 && args[severityIndex + 1]) {
  options.severity = args[severityIndex + 1];
}

// Parse --fail-on argument
const failOnIndex = args.indexOf('--fail-on');
if (failOnIndex !== -1 && args[failOnIndex + 1]) {
  options.failOn = args[failOnIndex + 1];
}

// Parse --file arguments
let i = 0;
while ((i = args.indexOf('--file', i)) !== -1) {
  if (args[i + 1]) {
    options.files.push(args[i + 1]);
    i += 2;
  } else {
    break;
  }
}

// Discover files to scan
async function discoverFiles() {
  if (options.files.length > 0) {
    return options.files.map(f => join(process.cwd(), f));
  }
  
  const files = [];
  const srcDir = join(__dirname, '..', 'src');
  
  try {
    function scanDirectory(dir) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            scanDirectory(fullPath);
          }
        } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) {
          files.push(fullPath);
        }
      }
    }
    
    if (existsSync(srcDir)) {
      scanDirectory(srcDir);
    }
  } catch (error) {
    console.error('Error scanning files:', error.message);
  }
  
  return files;
}

// Load dependencies from package.json
function loadDependencies() {
  try {
    const packagePath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    const deps = [];
    
    for (const [name, version] of Object.entries(pkg.dependencies || {})) {
      deps.push({ name, version });
    }
    for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
      deps.push({ name, version, dev: true });
    }
    
    return deps;
  } catch (error) {
    return [];
  }
}

function severityRank(severity) {
  const ranks = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return ranks[severity] || 0;
}

function shouldFail(results, threshold) {
  const thresholdRank = severityRank(threshold);
  
  if (thresholdRank <= 4 && results.summary.critical > 0) return true;
  if (thresholdRank <= 3 && results.summary.high > 0) return true;
  if (thresholdRank <= 2 && results.summary.medium > 0) return true;
  if (thresholdRank <= 1 && results.summary.low > 0) return true;
  
  return false;
}

async function main() {
  console.log('🔒 BIOS Security Test Runner\n');
  
  const runner = new SecurityTestRunner({
    severityThreshold: options.severity
  });
  
  // Set up event listeners
  runner.on('scan:start', ({ patchId }) => {
    console.log(`Starting security scan: ${patchId}\n`);
  });
  
  runner.on('scan:owasp:start', () => {
    console.log('  🔍 Running OWASP security scan...');
  });
  
  runner.on('scan:owasp:complete', ({ count }) => {
    console.log(`     ✓ Scanned, ${count} issues found`);
  });
  
  runner.on('scan:secrets:start', () => {
    console.log('  🔐 Scanning for secrets...');
  });
  
  runner.on('scan:secrets:complete', ({ count }) => {
    console.log(`     ✓ Scanned, ${count} secrets found`);
  });
  
  runner.on('scan:dependencies:start', () => {
    console.log('  📦 Checking dependencies...');
  });
  
  runner.on('scan:dependencies:complete', ({ count }) => {
    console.log(`     ✓ Checked, ${count} issues found`);
  });
  
  runner.on('scan:file-error', ({ file, error }) => {
    console.log(`  ⚠️  Error scanning ${file}: ${error}`);
  });
  
  // Discover files to scan
  const files = await discoverFiles();
  console.log(`Found ${files.length} file(s) to scan\n`);
  
  // Load dependencies
  const dependencies = loadDependencies();
  
  // Generate a unique patch ID for this scan
  const patchId = `security-scan-${Date.now()}`;
  
  // Run security scan
  const results = await runner.run(patchId, {
    files: files.slice(0, 50), // Limit to first 50 files for performance
    dependencies: options.dependencies ? dependencies.slice(0, 20) : [],
    owasp: options.owasp,
    secrets: options.secrets
  });
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Security Scan Summary');
  console.log('='.repeat(60));
  console.log(`Duration: ${results.duration}ms`);
  console.log(`Files Scanned: ${files.length}`);
  
  console.log('\n📊 Vulnerability Summary:');
  console.log(`  🔴 Critical: ${results.summary.critical}`);
  console.log(`  🟠 High:     ${results.summary.high}`);
  console.log(`  🟡 Medium:   ${results.summary.medium}`);
  console.log(`  🔵 Low:      ${results.summary.low}`);
  console.log(`  ⚪ Info:     ${results.summary.info}`);
  console.log(`  📊 Total:    ${results.summary.total}`);
  
  // Print vulnerabilities by severity
  const criticalAndHigh = results.vulnerabilities.filter(
    v => v.severity === 'critical' || v.severity === 'high'
  );
  
  if (criticalAndHigh.length > 0) {
    console.log('\n🔴 Critical & High Severity Issues:');
    for (const vuln of criticalAndHigh.slice(0, 10)) {
      console.log(`\n  ${vuln.severity === 'critical' ? '🔴' : '🟠'} ${vuln.type}`);
      console.log(`     ${vuln.message}`);
      if (vuln.file) console.log(`     File: ${vuln.file}:${vuln.line || '?'}`);
      if (vuln.cwe) console.log(`     CWE: ${vuln.cwe}`);
      if (vuln.recommendation) console.log(`     Fix: ${vuln.recommendation}`);
    }
    if (criticalAndHigh.length > 10) {
      console.log(`\n  ... and ${criticalAndHigh.length - 10} more issues`);
    }
  }
  
  // Print secrets found
  if (results.secrets.length > 0) {
    console.log('\n🔐 Secrets Detected:');
    for (const secret of results.secrets) {
      console.log(`  ⚠️  ${secret.type} at ${secret.location}`);
    }
  }
  
  // Print dependency issues
  if (results.dependencyIssues.length > 0) {
    console.log('\n📦 Dependency Vulnerabilities:');
    for (const issue of results.dependencyIssues) {
      console.log(`  ${runner.getSeverityEmoji(issue.severity)} ${issue.package}@${issue.version}`);
      console.log(`     ${issue.vulnerability}`);
    }
  }
  
  // Generate report
  const report = runner.generateReport(results);
  console.log('\n' + report);
  
  // Save report if requested
  if (options.saveReport) {
    const reportsDir = join(__dirname, '..', 'tests', 'security', 'reports');
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }
    const reportPath = join(reportsDir, `security-report-${Date.now()}.md`);
    writeFileSync(reportPath, report);
    console.log(`💾 Report saved to: ${reportPath}`);
  }
  
  // Determine exit code
  const hasCriticalOrHigh = results.summary.critical > 0 || results.summary.high > 0;
  const hasSecrets = results.secrets.length > 0;
  const shouldFailBuild = shouldFail(results, options.failOn);
  
  if (hasSecrets) {
    console.log('\n⚠️  SECRETS DETECTED! Remove them immediately and rotate credentials.');
  }
  
  if (shouldFailBuild) {
    console.log(`\n❌ Security scan failed: ${options.failOn} or higher severity issues found`);
    process.exit(1);
  } else {
    console.log('\n✅ Security scan passed');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
