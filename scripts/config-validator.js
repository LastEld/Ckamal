#!/usr/bin/env node
/**
 * CogniMesh Configuration Validator
 * Validates .env configuration without starting the server
 * 
 * Usage: node scripts/config-validator.js
 */

import { existsSync, readFileSync, accessSync, constants } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Required environment variables
const REQUIRED_VARS = [
  { name: 'GITHUB_TOKEN', pattern: /^ghp_[a-zA-Z0-9]{36}$/, hint: 'Should start with ghp_' },
  { name: 'JWT_SECRET', minLength: 16, hint: 'Should be at least 16 characters' }
];

// Optional but recommended variables
const RECOMMENDED_VARS = [
  { name: 'COGNIMESH_PORT', default: '3000', type: 'port' },
  { name: 'NODE_ENV', allowed: ['development', 'production', 'test'] },
  { name: 'DATABASE_PATH', default: './data/cognimesh.db' },
  { name: 'LOG_LEVEL', allowed: ['debug', 'info', 'warn', 'error'] }
];

// Check if .env file exists
function checkEnvFile() {
  const envPath = resolve(rootDir, '.env');
  const envMinimalPath = resolve(rootDir, '.env.minimal');
  
  if (existsSync(envPath)) {
    return { exists: true, path: envPath };
  }
  
  if (existsSync(envMinimalPath)) {
    return { 
      exists: false, 
      path: null,
      message: '.env file not found. Run: cp .env.minimal .env'
    };
  }
  
  return { 
    exists: false, 
    path: null,
    message: '.env file not found and .env.minimal template is missing'
  };
}

// Parse .env file
function parseEnvFile(path) {
  const content = readFileSync(path, 'utf-8');
  const vars = {};
  
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const [, name, value] = match;
      vars[name] = value.replace(/^["']|["']$/g, ''); // Remove quotes
    }
  }
  
  return vars;
}

// Check if a port is available
async function checkPort(port) {
  const net = await import('net');
  
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve({ available: false, error: 'Port already in use' });
      } else {
        resolve({ available: false, error: err.message });
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve({ available: true });
    });
    
    server.listen(port, '127.0.0.1');
  });
}

// Check if a path is writable
function checkWritable(path) {
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      return { writable: false, error: 'Directory does not exist' };
    }
    accessSync(dir, constants.W_OK);
    return { writable: true };
  } catch (error) {
    return { writable: false, error: error.message };
  }
}

// Validate configuration
async function validateConfig() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     CogniMesh Configuration Validator                  ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  // Check .env file
  const envCheck = checkEnvFile();
  if (!envCheck.exists) {
    console.log('❌ Configuration Error:\n');
    console.log(`   ${envCheck.message}`);
    console.log('\n➡️  Quick fix: cp .env.minimal .env && nano .env');
    process.exit(1);
  }
  
  console.log(`✓ Found .env file at: ${envCheck.path}\n`);
  
  // Parse environment variables
  let envVars;
  try {
    envVars = parseEnvFile(envCheck.path);
  } catch (error) {
    console.log('❌ Failed to parse .env file:');
    console.log(`   ${error.message}`);
    process.exit(1);
  }
  
  // Validate required variables
  console.log('Required Variables:');
  console.log('─'.repeat(50));
  
  let errors = 0;
  
  for (const req of REQUIRED_VARS) {
    const value = envVars[req.name];
    
    if (!value) {
      console.log(`✗ ${req.name}: MISSING`);
      console.log(`  → Set this in your .env file`);
      errors++;
      continue;
    }
    
    if (value === 'ghp_your_token_here' || value === 'change-this-to-a-random-string') {
      console.log(`⚠ ${req.name}: DEFAULT VALUE (not changed)`);
      console.log(`  → Update the placeholder value in .env`);
      errors++;
      continue;
    }
    
    let valid = true;
    
    if (req.pattern && !req.pattern.test(value)) {
      valid = false;
      console.log(`⚠ ${req.name}: INVALID FORMAT`);
      console.log(`  ${req.hint}`);
    }
    
    if (req.minLength && value.length < req.minLength) {
      valid = false;
      console.log(`⚠ ${req.name}: TOO SHORT`);
      console.log(`  Minimum length: ${req.minLength} characters`);
    }
    
    if (valid) {
      // Mask sensitive values
      const display = value.length > 8 
        ? value.substring(0, 4) + '...' + value.substring(value.length - 4)
        : '****';
      console.log(`✓ ${req.name}: ${display}`);
    } else {
      errors++;
    }
  }
  
  // Validate optional variables
  console.log('\nOptional Variables:');
  console.log('─'.repeat(50));
  
  for (const opt of RECOMMENDED_VARS) {
    const value = envVars[opt.name];
    
    if (!value) {
      console.log(`○ ${opt.name}: not set (will use default: ${opt.default || 'none'})`);
      continue;
    }
    
    if (opt.allowed && !opt.allowed.includes(value)) {
      console.log(`⚠ ${opt.name}: invalid value "${value}"`);
      console.log(`  Allowed values: ${opt.allowed.join(', ')}`);
      errors++;
      continue;
    }
    
    console.log(`✓ ${opt.name}: ${value}`);
    
    // Check port availability
    if (opt.type === 'port') {
      const port = parseInt(value);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.log(`  ✗ Invalid port number`);
        errors++;
      } else {
        const portCheck = await checkPort(port);
        if (!portCheck.available) {
          console.log(`  ⚠ Port ${port}: ${portCheck.error}`);
        } else {
          console.log(`  ✓ Port ${port} is available`);
        }
      }
    }
  }
  
  // Check paths
  console.log('\nPath Validation:');
  console.log('─'.repeat(50));
  
  const dataPath = envVars['DATABASE_PATH'] || './data/cognimesh.db';
  const writeCheck = checkWritable(dataPath);
  
  if (writeCheck.writable) {
    console.log(`✓ Database path is writable: ${dataPath}`);
  } else {
    console.log(`⚠ Database path issue: ${writeCheck.error}`);
    console.log(`  Path: ${dataPath}`);
    errors++;
  }
  
  // Summary
  console.log('\n' + '═'.repeat(58));
  
  if (errors === 0) {
    console.log('✅ Configuration is valid!');
    console.log('   You can now start CogniMesh with: npm start');
    process.exit(0);
  } else {
    console.log(`❌ Configuration has ${errors} issue(s) to fix.`);
    console.log('   Please address the issues above before starting.');
    process.exit(1);
  }
}

validateConfig().catch(error => {
  console.error('Validation error:', error);
  process.exit(1);
});
