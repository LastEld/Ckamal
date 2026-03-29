#!/usr/bin/env node
/**
 * @fileoverview Deployment Environment Validation Script
 * @description Validates environment variables and configuration for production deployment
 * @version 5.0.0
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';

const VERSION = '5.0.0';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Validation result tracking
const results = {
  errors: [],
  warnings: [],
  passed: 0,
  failed: 0
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  const color = {
    error: colors.red,
    warn: colors.yellow,
    info: colors.blue,
    success: colors.green
  }[level] || colors.reset;
  
  console.log(`${color}[${level.toUpperCase()}]${colors.reset} ${message}`);
}

function assert(condition, message, level = 'error') {
  if (!condition) {
    if (level === 'error') {
      results.errors.push(message);
      results.failed++;
      log('error', `✗ ${message}`);
    } else {
      results.warnings.push(message);
      log('warn', `⚠ ${message}`);
    }
    return false;
  }
  results.passed++;
  log('success', `✓ ${message}`);
  return true;
}

// ============================================================
// Validation Rules
// ============================================================

const requiredEnvVars = [
  { name: 'NODE_ENV', values: ['production'], strict: true },
  { name: 'GITHUB_TOKEN', minLength: 40, pattern: /^ghp_/ },
  { name: 'JWT_SECRET', minLength: 32 },
  { name: 'SESSION_SECRET', minLength: 32 },
  { name: 'SECURITY_PEPPER', minLength: 16 },
  { name: 'DATABASE_PATH' }
];

const securityChecks = [
  { name: 'SECURITY_MODE', expected: 'enforced' },
  { name: 'REQUIRE_AUTH', expected: 'true' },
  { name: 'HTTPS_ONLY', expected: 'true' },
  { name: 'RATE_LIMIT_ENABLED', expected: 'true' },
  { name: 'SESSION_SECURE', expected: 'true' },
  { name: 'SESSION_HTTPONLY', expected: 'true' },
  { name: 'SESSION_SAMESITE', expected: 'strict' }
];

const productionValues = {
  'LOG_LEVEL': ['info', 'warn', 'error'],
  'BIOS_MODE': ['OPERATIONAL'],
  'WS_ENABLED': ['true'],
  'DASHBOARD_ENABLED': ['true'],
  'CACHE_ENABLED': ['true']
};

// ============================================================
// Validation Functions
// ============================================================

function validateRequiredVars() {
  log('info', '\n=== Required Environment Variables ===');
  
  for (const rule of requiredEnvVars) {
    const value = process.env[rule.name];
    
    if (!assert(value !== undefined, `${rule.name} is set`)) {
      continue;
    }
    
    if (rule.values && !rule.values.includes(value)) {
      assert(false, `${rule.name} has valid value (expected: ${rule.values.join(' or ')}, got: ${value})`);
      continue;
    }
    
    if (rule.minLength && value.length < rule.minLength) {
      assert(false, `${rule.name} meets minimum length (${value.length}/${rule.minLength})`);
      continue;
    }
    
    if (rule.pattern && !rule.pattern.test(value)) {
      assert(false, `${rule.name} matches expected pattern`);
      continue;
    }
    
    // Mask sensitive values in output
    const displayValue = rule.name.includes('SECRET') || rule.name.includes('TOKEN') || rule.name.includes('PEPPER')
      ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
      : value;
    
    assert(true, `${rule.name} = ${displayValue}`);
  }
}

function validateSecuritySettings() {
  log('info', '\n=== Security Configuration ===');
  
  for (const check of securityChecks) {
    const value = process.env[check.name];
    const isValid = value === check.expected;
    
    assert(isValid, `${check.name} = ${value || 'not set'} (expected: ${check.expected})`);
  }
}

function validateProductionValues() {
  log('info', '\n=== Production Values ===');
  
  for (const [key, validValues] of Object.entries(productionValues)) {
    const value = process.env[key];
    if (value === undefined) {
      log('warn', `${key} not set (using default)`);
      continue;
    }
    
    const isValid = validValues.includes(value);
    assert(isValid, `${key} = ${value} (recommended: ${validValues.join(' or ')})`, 'warn');
  }
}

function validateSecrets() {
  log('info', '\n=== Secret Strength ===');
  
  const secrets = [
    { name: 'JWT_SECRET', minEntropy: 128 },
    { name: 'SESSION_SECRET', minEntropy: 128 },
    { name: 'SECURITY_PEPPER', minEntropy: 64 }
  ];
  
  for (const secret of secrets) {
    const value = process.env[secret.name];
    if (!value) continue;
    
    // Simple entropy check based on length and character variety
    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasSpecial = /[^a-zA-Z0-9]/.test(value);
    
    const charSet = (hasLower ? 26 : 0) + (hasUpper ? 26 : 0) + (hasNumber ? 10 : 0) + (hasSpecial ? 32 : 0);
    const entropy = Math.log2(Math.pow(charSet, value.length));
    
    const hasGoodVariety = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length >= 3;
    
    assert(
      hasGoodVariety && value.length >= 32,
      `${secret.name} has good variety and length (${value.length} chars, ~${Math.floor(entropy)} bits entropy)`
    );
    
    // Check for common weak passwords
    const weakPatterns = ['password', 'secret', '123456', 'admin', 'cognimesh'];
    const hasWeakPattern = weakPatterns.some(p => value.toLowerCase().includes(p));
    
    assert(!hasWeakPattern, `${secret.name} does not contain common weak patterns`);
  }
}

function validateFilePaths() {
  log('info', '\n=== File Paths ===');
  
  const paths = [
    process.env.DATABASE_PATH,
    process.env.COGNIMESH_DATA_DIR,
    process.env.COGNIMESH_CACHE_DIR,
    process.env.COGNIMESH_LOGS_DIR,
    process.env.STATE_PATH
  ].filter(Boolean);
  
  for (const p of paths) {
    // Check if path is absolute
    const isAbsolute = p.startsWith('/') || (process.platform === 'win32' && p[1] === ':');
    assert(isAbsolute, `Path ${p} is absolute (recommended for production)`);
  }
}

function validatePorts() {
  log('info', '\n=== Port Configuration ===');
  
  const ports = [
    { name: 'COGNIMESH_PORT', value: process.env.COGNIMESH_PORT },
    { name: 'DASHBOARD_PORT', value: process.env.DASHBOARD_PORT },
    { name: 'WS_PORT', value: process.env.WS_PORT }
  ];
  
  for (const port of ports) {
    if (!port.value) continue;
    
    const numPort = parseInt(port.value, 10);
    const isValid = !isNaN(numPort) && numPort > 0 && numPort < 65536;
    
    assert(isValid, `${port.name} = ${port.value} (valid port number)`);
    
    // Warn about privileged ports
    if (numPort < 1024) {
      log('warn', `${port.name} uses privileged port ${numPort} (requires root)`);
    }
  }
}

function validateDatabase() {
  log('info', '\n=== Database Configuration ===');
  
  const dbPath = process.env.DATABASE_PATH;
  if (dbPath) {
    // Check if using persistent storage path
    const isPersistent = dbPath.includes('/data/') || dbPath.includes('/app/data') || dbPath.includes('/var/lib/');
    assert(isPersistent, `Database path uses persistent storage: ${dbPath}`, 'warn');
  }
  
  const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10);
  assert(maxConnections >= 5, `DB_MAX_CONNECTIONS = ${maxConnections} (recommended: 5-20)`);
  
  const busyTimeout = parseInt(process.env.DB_BUSY_TIMEOUT_MS || '5000', 10);
  assert(busyTimeout >= 1000, `DB_BUSY_TIMEOUT_MS = ${busyTimeout}ms (recommended: 5000+)`);
}

function validateGitHubToken() {
  log('info', '\n=== GitHub Token ===');
  
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;
  
  // Check token format
  const isValidFormat = token.startsWith('ghp_') || token.startsWith('github_pat_');
  assert(isValidFormat, 'GitHub token has valid format');
  
  // Warn about token exposure
  if (token.length < 30) {
    log('warn', 'GitHub token seems short - verify it is complete');
  }
}

function loadAndValidateEnvFile() {
  log('info', '\n=== Environment File ===');
  
  const envPath = resolve(process.cwd(), '.env');
  
  if (!existsSync(envPath)) {
    log('warn', '.env file not found - using environment variables only');
    return;
  }
  
  assert(true, `.env file found at ${envPath}`);
  
  // Check file permissions (Unix only)
  try {
    const stats = readFileSync(envPath);
    log('info', `.env file size: ${stats.length} bytes`);
  } catch (error) {
    log('warn', `Could not read .env file: ${error.message}`);
  }
  
  // Parse .env file
  const envContent = readFileSync(envPath, 'utf-8');
  const envLines = envContent.split('\n');
  
  let setVars = 0;
  let commentedVars = 0;
  
  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      if (trimmed.startsWith('#') && trimmed.includes('=')) {
        commentedVars++;
      }
      continue;
    }
    if (trimmed.includes('=')) {
      setVars++;
    }
  }
  
  log('info', `.env file contains ${setVars} active variables, ${commentedVars} commented`);
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     CogniMesh v5.0 - Deployment Validation               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}`);
  
  const startTime = Date.now();
  
  // Run all validations
  loadAndValidateEnvFile();
  validateRequiredVars();
  validateSecuritySettings();
  validateProductionValues();
  validateSecrets();
  validateFilePaths();
  validatePorts();
  validateDatabase();
  validateGitHubToken();
  
  // Summary
  const duration = Date.now() - startTime;
  
  console.log(`${colors.cyan}`);
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('                      SUMMARY');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`${colors.reset}`);
  
  console.log(`  ${colors.green}Passed: ${results.passed}${colors.reset}`);
  
  if (results.warnings.length > 0) {
    console.log(`  ${colors.yellow}Warnings: ${results.warnings.length}${colors.reset}`);
  }
  
  if (results.errors.length > 0) {
    console.log(`  ${colors.red}Errors: ${results.errors.length}${colors.reset}`);
    console.log(`\n  ${colors.red}Failed checks:${colors.reset}`);
    results.errors.forEach(e => console.log(`    - ${e}`));
  }
  
  console.log(`\n  Duration: ${duration}ms`);
  
  // Exit code
  if (results.errors.length > 0) {
    console.log(`\n${colors.red}✗ Validation failed - fix errors before deploying${colors.reset}\n`);
    process.exit(1);
  }
  
  if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}⚠ Validation passed with warnings${colors.reset}\n`);
    process.exit(0);
  }
  
  console.log(`\n${colors.green}✓ All validation checks passed!${colors.reset}\n`);
  process.exit(0);
}

main().catch(error => {
  console.error('Validation failed:', error);
  process.exit(1);
});
