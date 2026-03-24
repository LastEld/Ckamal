#!/usr/bin/env node
/**
 * @fileoverview Vault Integration Examples
 * @description Complete examples of using HashiCorp Vault with CogniMesh
 */

import { vaultManager, VaultError, getSecret, setSecret, rotateSecret } from '../src/security/vault.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function example1_basicConnection() {
  log('cyan', '\n📘 Example 1: Basic Connection\n');
  
  try {
    // Connect to Vault with automatic configuration from env vars
    const connected = await vaultManager.connect({
      fallbackEnabled: true  // Allow fallback to env vars if Vault unavailable
    });
    
    if (connected) {
      log('green', '✓ Connected to Vault successfully');
      
      const status = vaultManager.getStatus();
      log('blue', `  Endpoint: ${status.endpoint}`);
      log('blue', `  Cache enabled: ${status.cacheEnabled}`);
      log('blue', `  Fallback enabled: ${status.fallbackEnabled}`);
    } else {
      log('yellow', '⚠ Running in fallback mode (env vars only)');
    }
  } catch (error) {
    log('red', `✗ Connection failed: ${error.message}`);
  }
}

async function example2_getSecret() {
  log('cyan', '\n📘 Example 2: Retrieve Secrets\n');
  
  try {
    // Method 1: Using the vaultManager directly
    const apiKey = await vaultManager.getSecret('api/anthropic');
    log('green', `✓ Retrieved anthropic key: ${apiKey.substring(0, 8)}...`);
    
    // Method 2: Using the convenience export
    const kimiKey = await getSecret('api/kimi');
    log('green', `✓ Retrieved kimi key: ${kimiKey.substring(0, 8)}...`);
    
    // Method 3: With options
    const githubToken = await vaultManager.getSecret('auth/github', {
      useCache: true,
      allowFallback: true
    });
    log('green', `✓ Retrieved github token: ${githubToken.substring(0, 8)}...`);
    
  } catch (error) {
    if (error instanceof VaultError) {
      log('red', `✗ Vault error [${error.code}]: ${error.message}`);
    } else {
      log('red', `✗ Error: ${error.message}`);
    }
  }
}

async function example3_storeSecret() {
  log('cyan', '\n📘 Example 3: Store Secrets\n');
  
  try {
    if (!vaultManager.connected) {
      log('yellow', '⚠ Vault not connected, skipping store example');
      return;
    }
    
    // Store a secret with metadata
    const metadata = await setSecret('api/custom-service', 'my-secret-value', {
      metadata: {
        description: 'Custom service API key',
        owner: 'dev-team',
        environment: 'development',
        createdAt: new Date().toISOString()
      }
    });
    
    log('green', `✓ Secret stored successfully`);
    log('blue', `  Version: ${metadata.version}`);
    log('blue', `  Created: ${metadata.createdAt}`);
    
  } catch (error) {
    log('red', `✗ Failed to store secret: ${error.message}`);
  }
}

async function example4_rotateSecret() {
  log('cyan', '\n📘 Example 4: Rotate Secrets\n');
  
  try {
    if (!vaultManager.connected) {
      log('yellow', '⚠ Vault not connected, skipping rotation example');
      return;
    }
    
    // First, store a temporary secret
    await setSecret('api/temp-key', 'initial-value');
    log('blue', '  Created temporary secret');
    
    // Rotate it with auto-generated value
    const rotation = await rotateSecret('api/temp-key', {
      length: 32,
      prefix: 'prod_'
    });
    
    log('green', `✓ Secret rotated successfully`);
    log('blue', `  Path: ${rotation.path}`);
    log('blue', `  Version: ${rotation.metadata.version}`);
    log('blue', `  Rotated at: ${rotation.rotatedAt}`);
    
    // Retrieve the new value
    const newValue = await getSecret('api/temp-key');
    log('blue', `  New value: ${newValue.substring(0, 20)}...`);
    
  } catch (error) {
    log('red', `✗ Rotation failed: ${error.message}`);
  }
}

async function example5_batchOperations() {
  log('cyan', '\n📘 Example 5: Batch Operations\n');
  
  try {
    // Retrieve multiple secrets at once
    const secrets = await vaultManager.getSecrets([
      'api/anthropic',
      'api/kimi',
      'auth/github'
    ]);
    
    log('green', '✓ Batch retrieval complete:');
    for (const [path, value] of Object.entries(secrets)) {
      if (value) {
        log('blue', `  ${path}: ${value.substring(0, 8)}...`);
      } else {
        log('yellow', `  ${path}: (not found)`);
      }
    }
    
  } catch (error) {
    log('red', `✗ Batch operation failed: ${error.message}`);
  }
}

async function example6_cacheManagement() {
  log('cyan', '\n📘 Example 6: Cache Management\n');
  
  try {
    // First call - from Vault or env
    const start1 = Date.now();
    const secret1 = await vaultManager.getSecret('api/anthropic');
    const time1 = Date.now() - start1;
    log('blue', `  First call (from source): ${time1}ms`);
    
    // Second call - from cache (instant)
    const start2 = Date.now();
    const secret2 = await vaultManager.getSecret('api/anthropic');
    const time2 = Date.now() - start2;
    log('blue', `  Second call (from cache): ${time2}ms`);
    
    // Clear specific cache
    vaultManager.clearCache('api/anthropic');
    log('green', '✓ Cache cleared for api/anthropic');
    
    // Clear all cache
    // vaultManager.clearCache();
    
    const status = vaultManager.getStatus();
    log('blue', `  Current cache size: ${status.cacheSize}`);
    
  } catch (error) {
    log('red', `✗ Cache operation failed: ${error.message}`);
  }
}

async function example7_errorHandling() {
  log('cyan', '\n📘 Example 7: Error Handling\n');
  
  try {
    // Try to get non-existent secret
    await vaultManager.getSecret('nonexistent/path');
  } catch (error) {
    if (error instanceof VaultError) {
      log('green', '✓ Caught VaultError correctly');
      log('blue', `  Code: ${error.code}`);
      log('blue', `  Message: ${error.message}`);
      log('blue', `  Details: ${JSON.stringify(error.details)}`);
    } else {
      log('red', '✗ Unexpected error type');
    }
  }
}

async function example8_initializeFromEnv() {
  log('cyan', '\n📘 Example 8: Initialize from Environment\n');
  
  try {
    if (!vaultManager.connected) {
      log('yellow', '⚠ Vault not connected, skipping initialization example');
      return;
    }
    
    // This imports all known secrets from environment variables into Vault
    log('blue', '  Importing secrets from environment...');
    
    const results = await vaultManager.initializeFromEnv([
      'api/anthropic',
      'api/kimi',
      'api/openai',
      'auth/github'
    ]);
    
    log('green', `✓ Initialization complete`);
    log('blue', `  Imported: ${results.imported.length}`);
    log('blue', `  Skipped: ${results.skipped.length}`);
    log('blue', `  Errors: ${results.errors.length}`);
    
    if (results.imported.length > 0) {
      log('blue', '  Imported paths:');
      for (const item of results.imported) {
        log('blue', `    - ${item.path} (from ${item.envVar})`);
      }
    }
    
  } catch (error) {
    log('red', `✗ Initialization failed: ${error.message}`);
  }
}

async function runAllExamples() {
  log('bright', '╔══════════════════════════════════════════════════════════════╗');
  log('bright', '║         CogniMesh Vault Integration Examples                 ║');
  log('bright', '╚══════════════════════════════════════════════════════════════╝');
  
  await example1_basicConnection();
  await example2_getSecret();
  await example3_storeSecret();
  await example4_rotateSecret();
  await example5_batchOperations();
  await example6_cacheManagement();
  await example7_errorHandling();
  await example8_initializeFromEnv();
  
  // Cleanup
  await vaultManager.disconnect();
  
  log('cyan', '\n═══════════════════════════════════════════════════════════════');
  log('green', 'All examples completed!');
  log('cyan', '═══════════════════════════════════════════════════════════════\n');
}

// Run examples
runAllExamples().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
