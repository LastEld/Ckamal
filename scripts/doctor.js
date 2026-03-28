#!/usr/bin/env node
/**
 * CogniMesh Doctor - System Diagnostics
 * Checks system health and suggests fixes
 */

import { existsSync, accessSync, constants, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createInterface } from 'readline';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

const checks = [];
let issues = 0;
let warnings = 0;

function printBanner() {
  console.log('');
  console.log(c('cyan', '╔════════════════════════════════════════════════════════════╗'));
  console.log(c('cyan', '║                                                            ║'));
  console.log(c('cyan', '║') + c('bright', c('cyan', '           🔬 CogniMesh Doctor v1.0                      ')) + c('cyan', '║'));
  console.log(c('cyan', '║') + '              System Diagnostics & Health Check            ' + c('cyan', '║'));
  console.log(c('cyan', '║                                                            ║'));
  console.log(c('cyan', '╚════════════════════════════════════════════════════════════╝'));
  console.log('');
}

function printSection(title) {
  console.log('');
  console.log(c('bright', c('blue', title)));
  console.log(c('dim', '─'.repeat(60)));
}

function printCheck(name, status, message, fix = null) {
  const statusIcon = status === 'pass' ? c('green', '✓') : status === 'warn' ? c('yellow', '⚠') : c('red', '✗');
  const statusText = status === 'pass' ? c('green', 'PASS') : status === 'warn' ? c('yellow', 'WARN') : c('red', 'FAIL');
  
  console.log(`  ${statusIcon} ${c('dim', name.padEnd(30))} ${statusText}`);
  if (message) {
    console.log(`      ${c('dim', message)}`);
  }
  if (fix && status !== 'pass') {
    console.log(`      ${c('cyan', '💡 Fix:')} ${fix}`);
  }
  
  checks.push({ name, status, message, fix });
  if (status === 'fail') issues++;
  if (status === 'warn') warnings++;
}

// Check 1: Node.js Version
function checkNodeVersion() {
  try {
    const version = execSync('node --version', { encoding: 'utf8' }).trim();
    const major = parseInt(version.slice(1).split('.')[0]);
    
    if (major >= 20) {
      printCheck('Node.js Version', 'pass', `${version} (excellent)`);
    } else if (major >= 18) {
      printCheck('Node.js Version', 'pass', `${version} (supported)`);
    } else {
      printCheck('Node.js Version', 'fail', `${version} (v18+ required)`, 
        'Update Node.js: https://nodejs.org/');
    }
    return major >= 18;
  } catch {
    printCheck('Node.js Version', 'fail', 'Not found', 
      'Install Node.js v18+: https://nodejs.org/');
    return false;
  }
}

// Check 2: npm Version
function checkNpmVersion() {
  try {
    const version = execSync('npm --version', { encoding: 'utf8' }).trim();
    printCheck('npm Version', 'pass', `v${version}`);
    return true;
  } catch {
    printCheck('npm Version', 'fail', 'Not found', 
      'npm comes with Node.js - reinstall Node.js');
    return false;
  }
}

// Check 3: Dependencies Installed
function checkDependencies() {
  const nodeModulesPath = join(PROJECT_ROOT, 'node_modules');
  const packageJsonPath = join(PROJECT_ROOT, 'package.json');
  
  if (!existsSync(nodeModulesPath)) {
    printCheck('Dependencies', 'fail', 'node_modules/ not found', 
      'Run: npm install');
    return false;
  }
  
  // Check if key dependencies exist
  const keyDeps = ['express', 'ws', 'better-sqlite3', 'winston'];
  const missing = keyDeps.filter(dep => !existsSync(join(nodeModulesPath, dep)));
  
  if (missing.length > 0) {
    printCheck('Dependencies', 'warn', `Missing: ${missing.join(', ')}`, 
      'Run: npm install');
    return false;
  }
  
  printCheck('Dependencies', 'pass', 'All required packages installed');
  return true;
}

// Check 4: Environment File
function checkEnvFile() {
  const envPath = join(PROJECT_ROOT, '.env');
  const envExamplePath = join(PROJECT_ROOT, '.env.example');
  
  if (!existsSync(envPath)) {
    if (existsSync(envExamplePath)) {
      printCheck('Environment File', 'fail', '.env not found', 
        'Copy .env.example to .env or run: npm run setup');
    } else {
      printCheck('Environment File', 'fail', '.env not found', 
        'Run: npm run setup');
    }
    return false;
  }
  
  // Check if critical variables are set
  try {
    const envContent = readFileSync(envPath, 'utf8');
    const critical = ['COGNIMESH_PORT', 'DATABASE_PATH', 'JWT_SECRET'];
    const missing = critical.filter(v => !envContent.includes(`${v}=`));
    
    if (missing.length > 0) {
      printCheck('Environment File', 'warn', `Missing variables: ${missing.join(', ')}`, 
        'Add missing variables to .env');
      return false;
    }
    
    printCheck('Environment File', 'pass', '.env configured');
    return true;
  } catch {
    printCheck('Environment File', 'fail', 'Cannot read .env', 
      'Check file permissions');
    return false;
  }
}

// Check 5: Data Directory Writable
function checkDataDirectory() {
  const dataDir = join(PROJECT_ROOT, 'data');
  const cacheDir = join(PROJECT_ROOT, 'cache');
  const logsDir = join(PROJECT_ROOT, 'logs');
  
  const dirs = [
    { name: 'Data Directory', path: dataDir },
    { name: 'Cache Directory', path: cacheDir },
    { name: 'Logs Directory', path: logsDir }
  ];
  
  let allGood = true;
  
  for (const { name, path } of dirs) {
    try {
      if (!existsSync(path)) {
        printCheck(name, 'fail', `${path} does not exist`, 
          `Create directory: mkdir ${path}`);
        allGood = false;
        continue;
      }
      
      accessSync(path, constants.W_OK);
      printCheck(name, 'pass', 'Writable');
    } catch {
      printCheck(name, 'fail', 'Not writable', 
        `Fix permissions: chmod 755 ${path}`);
      allGood = false;
    }
  }
  
  return allGood;
}

// Check 6: GitHub Token
function checkGitHubToken() {
  const envPath = join(PROJECT_ROOT, '.env');
  
  if (!existsSync(envPath)) {
    printCheck('GitHub Token', 'warn', 'Cannot check - .env missing');
    return false;
  }
  
  try {
    const envContent = readFileSync(envPath, 'utf8');
    const tokenMatch = envContent.match(/GITHUB_TOKEN=(.+)/);
    
    if (!tokenMatch || !tokenMatch[1].trim() || tokenMatch[1].includes('xxxx')) {
      printCheck('GitHub Token', 'warn', 'Not configured', 
        'Add GITHUB_TOKEN to .env (get at: https://github.com/settings/tokens)');
      return false;
    }
    
    const token = tokenMatch[1].trim();
    if (token.startsWith('ghp_') || token.startsWith('github_pat_')) {
      printCheck('GitHub Token', 'pass', 'Token configured');
      return true;
    } else {
      printCheck('GitHub Token', 'warn', 'Token format unusual', 
        'Verify token at: https://github.com/settings/tokens');
      return false;
    }
  } catch {
    printCheck('GitHub Token', 'warn', 'Cannot read .env');
    return false;
  }
}

// Check 7: Port Availability
function checkPortAvailability() {
  const commonPorts = [3000, 3001, 8080];
  const unavailable = [];
  
  for (const port of commonPorts) {
    try {
      // Try to check if port is in use (simplified check)
      const result = execSync(`netstat -an | findstr :${port}`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      if (result.includes(`:${port}`)) {
        unavailable.push(port);
      }
    } catch {
      // Port is likely available (netstat returns empty)
    }
  }
  
  if (unavailable.length > 0) {
    printCheck('Port Availability', 'warn', `Ports in use: ${unavailable.join(', ')}`, 
      'Edit .env to use different ports or stop conflicting services');
    return false;
  }
  
  printCheck('Port Availability', 'pass', 'Default ports available');
  return true;
}

// Check 8: Disk Space
function checkDiskSpace() {
  try {
    // Simple check - just verify we can write
    const testFile = join(PROJECT_ROOT, '.disk_test');
    writeFileSync(testFile, 'test');
    unlinkSync(testFile);
    printCheck('Disk Space', 'pass', 'Writable');
    return true;
  } catch {
    printCheck('Disk Space', 'fail', 'Cannot write to disk', 
      'Check disk space and permissions');
    return false;
  }
}

// Check 9: Security Keys
function checkSecurityKeys() {
  const envPath = join(PROJECT_ROOT, '.env');
  
  if (!existsSync(envPath)) {
    printCheck('Security Keys', 'warn', 'Cannot check - .env missing');
    return false;
  }
  
  try {
    const envContent = readFileSync(envPath, 'utf8');
    const weakPatterns = [
      { pattern: /JWT_SECRET=(change|default|secret|password|admin|123)/i, name: 'JWT_SECRET' },
      { pattern: /SESSION_SECRET=(change|default|secret|password|admin|123)/i, name: 'SESSION_SECRET' },
      { pattern: /ADMIN_PASSWORD=(admin|password|123|secret)/i, name: 'ADMIN_PASSWORD' }
    ];
    
    const weak = weakPatterns.filter(({ pattern }) => pattern.test(envContent));
    
    if (weak.length > 0) {
      const names = weak.map(w => w.name).join(', ');
      printCheck('Security Keys', 'warn', `Weak values: ${names}`, 
        'Update .env with strong, unique values');
      return false;
    }
    
    printCheck('Security Keys', 'pass', 'Keys look secure');
    return true;
  } catch {
    printCheck('Security Keys', 'warn', 'Cannot read .env');
    return false;
  }
}

// Check 10: Client Availability
function checkClients() {
  const clients = [
    { name: 'Claude', cmd: 'claude --version' },
    { name: 'Codex', cmd: 'codex --version' },
    { name: 'Kimi', cmd: 'kimi --version' }
  ];
  
  let available = 0;
  
  for (const { name, cmd } of clients) {
    try {
      execSync(cmd, { encoding: 'utf8', stdio: 'ignore' });
      available++;
    } catch {
      // Client not available
    }
  }
  
  if (available === 0) {
    printCheck('AI Clients', 'warn', 'No clients detected', 
      'Install Claude Code, Codex CLI, or Kimi CLI for AI features');
    return false;
  }
  
  printCheck('AI Clients', 'pass', `${available} client(s) available`);
  return true;
}

function printSummary() {
  console.log('');
  console.log(c('dim', '═'.repeat(60)));
  console.log('');
  
  if (issues === 0 && warnings === 0) {
    console.log(c('green', c('bright', '  🎉 All checks passed! System is healthy.')));
    console.log('');
    console.log(c('cyan', '  Ready to start: npm start'));
  } else if (issues === 0) {
    console.log(c('yellow', c('bright', `  ⚠️ ${warnings} warning(s) found`)));
    console.log(c('dim', '  System will work, but review warnings above'));
    console.log('');
    console.log(c('cyan', '  Ready to start: npm start'));
  } else {
    console.log(c('red', c('bright', `  ❌ ${issues} issue(s) need attention`)));
    if (warnings > 0) {
      console.log(c('yellow', `     + ${warnings} warning(s)`));
    }
    console.log('');
    console.log(c('cyan', '  Fix issues above, then run: npm run doctor'));
  }
  
  console.log('');
  console.log(c('dim', '═'.repeat(60)));
  console.log('');
  
  console.log(c('dim', 'Quick fixes:'));
  console.log(`  ${c('cyan', 'npm install')}     - Install dependencies`);
  console.log(`  ${c('cyan', 'npm run setup')}   - Re-run configuration wizard`);
  console.log('');
}

function printReport() {
  // Save detailed report
  const reportPath = join(PROJECT_ROOT, 'logs', 'doctor-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    checks,
    issues,
    warnings,
    healthy: issues === 0
  };
  
  try {
    if (!existsSync(dirname(reportPath))) {
      mkdirSync(dirname(reportPath), { recursive: true });
    }
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(c('dim', `  Report saved: logs/doctor-report.json`));
  } catch {
    // Silent fail for report
  }
}

// Import required for checks
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';

async function runDoctor() {
  printBanner();
  
  printSection('🔍 Runtime Environment');
  checkNodeVersion();
  checkNpmVersion();
  checkClients();
  
  printSection('📦 Dependencies');
  checkDependencies();
  
  printSection('⚙️ Configuration');
  checkEnvFile();
  checkGitHubToken();
  checkSecurityKeys();
  
  printSection('💾 Storage & Resources');
  checkDataDirectory();
  checkDiskSpace();
  checkPortAvailability();
  
  printSummary();
  printReport();
  
  process.exit(issues > 0 ? 1 : 0);
}

// Handle errors
process.on('uncaughtException', (error) => {
  console.error(c('red', `\nUnexpected error: ${error.message}`));
  process.exit(1);
});

runDoctor().catch((error) => {
  console.error(c('red', `\nDoctor failed: ${error.message}`));
  process.exit(1);
});
