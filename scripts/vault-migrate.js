#!/usr/bin/env node
/**
 * @fileoverview Vault Secrets Migration Script
 * @description Migrates secrets from .env to HashiCorp Vault
 * @usage node scripts/vault-migrate.js [--dry-run] [--path=path1,path2]
 */

import { vaultManager, VaultError } from '../src/security/vault.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Print colored message
 */
function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    dryRun: false,
    paths: null,
    verbose: false
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg.startsWith('--paths=')) {
      args.paths = arg.split('=')[1].split(',');
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }

  return args;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
${colors.bright}HashiCorp Vault Secrets Migration Tool${colors.reset}

Usage: node scripts/vault-migrate.js [options]

Options:
  --dry-run           Preview migration without making changes
  --paths=p1,p2       Migrate only specific paths (comma-separated)
  --verbose, -v       Show detailed output
  --help, -h          Show this help message

Examples:
  node scripts/vault-migrate.js --dry-run
  node scripts/vault-migrate.js --paths=api/anthropic,api/kimi
  node scripts/vault-migrate.js --verbose

Environment Variables Required:
  VAULT_ADDR          Vault server address (default: http://localhost:8200)
  VAULT_TOKEN         Vault authentication token
`);
}

/**
 * Load .env file and parse variables
 */
function loadEnvFile(envPath) {
  const secrets = {};
  
  if (!fs.existsSync(envPath)) {
    log('yellow', `⚠ .env file not found at ${envPath}`);
    return secrets;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Parse KEY=value
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    
    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    // Only include non-empty secrets
    if (value && !value.includes('xxxx') && !value.includes('your_') && !value.includes('change_')) {
      secrets[key] = value;
    }
  }

  return secrets;
}

/**
 * Map environment variables to Vault paths
 */
function getVaultPathMappings() {
  return {
    'ANTHROPIC_API_KEY': 'api/anthropic',
    'KIMI_API_KEY': 'api/kimi',
    'MOONSHOT_API_KEY': 'api/moonshot',
    'OPENAI_API_KEY': 'api/openai',
    'GITHUB_TOKEN': 'auth/github',
    'GITHUB_COPILOT_TOKEN': 'auth/github_copilot',
    'JWT_SECRET': 'security/jwt',
    'SESSION_SECRET': 'security/session',
    'DATABASE_URL': 'database/url',
    'WEBHOOK_SECRET': 'security/webhook',
    'ADMIN_PASSWORD': 'auth/admin'
  };
}

/**
 * Main migration function
 */
async function migrate(args) {
  log('cyan', '\n🔐 CogniMesh Vault Migration Tool\n');

  // Check Vault configuration
  const vaultAddr = process.env.VAULT_ADDR || 'http://localhost:8200';
  const vaultToken = process.env.VAULT_TOKEN || process.env.VAULT_DEV_ROOT_TOKEN_ID;

  log('blue', `📍 Vault Address: ${vaultAddr}`);
  
  if (!vaultToken) {
    log('red', '❌ VAULT_TOKEN not set. Please set the environment variable.');
    process.exit(1);
  }

  // Load .env file
  const envPath = path.join(process.cwd(), '.env');
  log('blue', `📄 Loading .env from: ${envPath}`);
  
  const envSecrets = loadEnvFile(envPath);
  const pathMappings = getVaultPathMappings();
  
  if (Object.keys(envSecrets).length === 0) {
    log('yellow', '⚠ No secrets found in .env file');
    process.exit(0);
  }

  log('green', `✓ Found ${Object.keys(envSecrets).length} potential secrets\n`);

  // Connect to Vault
  log('blue', '🔗 Connecting to Vault...');
  
  try {
    await vaultManager.connect({
      endpoint: vaultAddr,
      token: vaultToken,
      fallbackEnabled: false  // Disable fallback for migration
    });
    log('green', '✓ Connected to Vault\n');
  } catch (error) {
    log('red', `❌ Failed to connect to Vault: ${error.message}`);
    process.exit(1);
  }

  // Prepare migration list
  const migrations = [];
  
  for (const [envVar, value] of Object.entries(envSecrets)) {
    const vaultPath = pathMappings[envVar];
    if (!vaultPath) continue;
    
    // Filter by specified paths if provided
    if (args.paths && !args.paths.includes(vaultPath)) continue;
    
    migrations.push({
      envVar,
      vaultPath,
      value,
      preview: value.substring(0, 8) + '...' + value.substring(value.length - 4)
    });
  }

  if (migrations.length === 0) {
    log('yellow', '⚠ No secrets to migrate');
    await vaultManager.disconnect();
    process.exit(0);
  }

  // Show migration preview
  log('cyan', 'Migration Plan:');
  log('cyan', '─'.repeat(60));
  
  for (const m of migrations) {
    console.log(`  ${m.envVar} → ${m.vaultPath}`);
    if (args.verbose) {
      console.log(`    Value: ${m.preview}`);
    }
  }
  
  log('cyan', '─'.repeat(60));
  console.log(`Total: ${migrations.length} secrets\n`);

  if (args.dryRun) {
    log('yellow', '📋 DRY RUN - No changes made');
    await vaultManager.disconnect();
    return;
  }

  // Execute migration
  log('blue', '🚀 Starting migration...\n');
  
  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  for (const m of migrations) {
    try {
      // Check if secret already exists
      try {
        const existing = await vaultManager.getSecret(m.vaultPath, { 
          useCache: false, 
          allowFallback: false 
        });
        if (existing) {
          log('yellow', `⚠ ${m.vaultPath}: Already exists, skipping`);
          results.skipped.push(m);
          continue;
        }
      } catch {
        // Secret doesn't exist, proceed with migration
      }

      // Store in Vault
      await vaultManager.setSecret(m.vaultPath, m.value, {
        metadata: {
          source: 'env-migration',
          envVar: m.envVar,
          migratedAt: new Date().toISOString(),
          migratedBy: process.env.USER || 'unknown'
        }
      });

      log('green', `✓ ${m.envVar} → ${m.vaultPath}`);
      results.success.push(m);
    } catch (error) {
      log('red', `✗ ${m.vaultPath}: ${error.message}`);
      results.failed.push({ ...m, error: error.message });
    }
  }

  // Summary
  log('cyan', '\n' + '─'.repeat(60));
  log('cyan', 'Migration Summary:');
  log('cyan', '─'.repeat(60));
  console.log(`  ${colors.green}✓ Success: ${results.success.length}${colors.reset}`);
  console.log(`  ${colors.yellow}⚠ Skipped: ${results.skipped.length}${colors.reset}`);
  console.log(`  ${colors.red}✗ Failed: ${results.failed.length}${colors.reset}`);

  if (results.failed.length > 0) {
    log('red', '\nFailed migrations:');
    for (const f of results.failed) {
      console.log(`  - ${f.vaultPath}: ${f.error}`);
    }
  }

  // Next steps
  if (results.success.length > 0) {
    log('cyan', '\n📋 Next Steps:');
    console.log('  1. Verify secrets in Vault:');
    console.log(`     vault kv list secret/`);
    console.log('  2. Update your application to use Vault:');
    console.log(`     VAULT_ENABLED=true`);
    console.log('  3. Consider removing secrets from .env file');
    console.log('  4. Enable fallback for production:');
    console.log(`     VAULT_FALLBACK_ENABLED=true`);
  }

  await vaultManager.disconnect();
  
  // Exit with error code if any failed
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run migration
const args = parseArgs();
migrate(args).catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
