#!/usr/bin/env node
/**
 * CogniMesh Prerequisites Check
 * Run this to verify your system is ready for CogniMesh
 * 
 * Usage: node scripts/check-prerequisites.js
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const CHECKS = {
  node: {
    name: 'Node.js',
    minVersion: '18.0.0',
    command: 'node --version',
    extractVersion: (output) => output.replace('v', '').trim(),
    check: (version) => compareVersions(version, '18.0.0') >= 0,
    installUrl: 'https://nodejs.org/en/download/',
    required: true
  },
  npm: {
    name: 'npm',
    minVersion: '8.0.0',
    command: 'npm --version',
    extractVersion: (output) => output.trim(),
    check: (version) => compareVersions(version, '8.0.0') >= 0,
    installUrl: 'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm',
    required: true
  },
  git: {
    name: 'Git',
    minVersion: '2.30.0',
    command: 'git --version',
    extractVersion: (output) => output.replace('git version ', '').trim(),
    check: (version) => compareVersions(version, '2.30.0') >= 0,
    installUrl: 'https://git-scm.com/downloads',
    required: true
  },
  sqlite: {
    name: 'SQLite',
    minVersion: '3.35.0',
    command: 'sqlite3 --version',
    extractVersion: (output) => output.split(' ')[0].trim(),
    check: (version) => compareVersions(version, '3.35.0') >= 0,
    installUrl: 'https://sqlite.org/download.html',
    required: false
  }
};

// Compare semantic versions
function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;
    
    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }
  
  return 0;
}

// Run a command and return output
function runCommand(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    return null;
  }
}

// Check directory structure
function checkDirectories() {
  const requiredDirs = ['src', 'config', 'data', 'logs'];
  const optionalDirs = ['cache', 'docs'];
  
  console.log('\n📁 Directory Structure:');
  
  for (const dir of requiredDirs) {
    const exists = existsSync(resolve(dir));
    const icon = exists ? '✓' : '✗';
    const status = exists ? 'exists' : 'missing';
    console.log(`  ${icon} ${dir}/ (${status})`);
  }
  
  for (const dir of optionalDirs) {
    const exists = existsSync(resolve(dir));
    const icon = exists ? '✓' : '○';
    const status = exists ? 'exists' : 'will be created';
    console.log(`  ${icon} ${dir}/ (${status})`);
  }
}

// Check environment file
function checkEnvironment() {
  console.log('\n🔧 Environment Configuration:');
  
  const envExists = existsSync(resolve('.env'));
  const envExampleExists = existsSync(resolve('.env.example'));
  
  if (envExists) {
    console.log('  ✓ .env file found');
  } else if (envExampleExists) {
    console.log('  ✗ .env file missing');
    console.log('    → Run: cp .env.minimal .env');
  } else {
    console.log('  ✗ No .env or .env.example found');
  }
}

// Main check function
async function runChecks() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     CogniMesh Prerequisites Check                      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  let passed = 0;
  let failed = 0;
  let warnings = 0;
  
  for (const [key, check] of Object.entries(CHECKS)) {
    process.stdout.write(`Checking ${check.name}... `);
    
    const output = runCommand(check.command);
    
    if (output === null) {
      const icon = check.required ? '✗' : '⚠';
      const level = check.required ? 'ERROR' : 'WARNING';
      console.log(`${icon} NOT FOUND (${level})`);
      console.log(`  → Install from: ${check.installUrl}`);
      
      if (check.required) {
        failed++;
      } else {
        warnings++;
      }
      continue;
    }
    
    const version = check.extractVersion(output);
    const isValid = check.check(version);
    
    if (isValid) {
      console.log(`✓ ${version}`);
      passed++;
    } else {
      const icon = check.required ? '✗' : '⚠';
      const level = check.required ? 'ERROR' : 'WARNING';
      console.log(`${icon} ${version} (requires >= ${check.minVersion}) (${level})`);
      console.log(`  → Update from: ${check.installUrl}`);
      
      if (check.required) {
        failed++;
      } else {
        warnings++;
      }
    }
  }
  
  checkDirectories();
  checkEnvironment();
  
  // Summary
  console.log('\n' + '═'.repeat(58));
  console.log('SUMMARY:');
  console.log(`  ✓ Passed: ${passed}`);
  console.log(`  ⚠ Warnings: ${warnings}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log('═'.repeat(58));
  
  if (failed === 0) {
    console.log('\n✅ All required prerequisites met!');
    console.log('   You can now run: npm install');
    process.exit(0);
  } else {
    console.log('\n❌ Some required prerequisites are missing.');
    console.log('   Please install the missing items and try again.');
    process.exit(1);
  }
}

runChecks().catch(error => {
  console.error('Error running checks:', error);
  process.exit(1);
});
