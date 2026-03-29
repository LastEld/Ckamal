/**
 * Vault Commands
 * Manage secrets and credentials
 */

import * as f from './utils/formatters.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const VAULT_DIR = join(process.cwd(), '.vault');
const VAULT_FILE = join(VAULT_DIR, 'secrets.json');
const MIGRATED_FILE = join(VAULT_DIR, '.migrated');

// Ensure vault directory exists
if (!existsSync(VAULT_DIR)) {
  mkdirSync(VAULT_DIR, { recursive: true });
}

// Load or initialize vault
function loadVault() {
  if (existsSync(VAULT_FILE)) {
    try {
      return JSON.parse(readFileSync(VAULT_FILE, 'utf-8'));
    } catch (e) {
      return { secrets: {}, version: 1 };
    }
  }
  return { secrets: {}, version: 1 };
}

function saveVault(vault) {
  writeFileSync(VAULT_FILE, JSON.stringify(vault, null, 2));
}

/**
 * Migrate secrets from .env to vault
 */
export async function migrateSecrets(options = {}) {
  const spinner = f.createSpinner('Migrating secrets to vault');
  spinner.start();

  try {
    // Check if already migrated
    if (existsSync(MIGRATED_FILE) && !options.force) {
      spinner.stop('Secrets already migrated', 'warning');
      return {
        success: true,
        output: f.warning('Secrets already migrated. Use --force to re-migrate.')
      };
    }

    const envPath = join(process.cwd(), '.env');
    if (!existsSync(envPath)) {
      spinner.stop('No .env file found', 'warning');
      return {
        success: false,
        error: 'No .env file found',
        output: f.warning('No .env file found to migrate')
      };
    }

    await delay(500);

    // Parse .env file
    const envContent = readFileSync(envPath, 'utf-8');
    const secrets = {};
    const migrated = [];
    const skipped = [];

    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) return;

      const key = line.substring(0, eqIndex).trim();
      const value = line.substring(eqIndex + 1).trim().replace(/^["']|["']$/g, '');

      // Skip non-secret keys
      const isSecret = /(KEY|SECRET|TOKEN|PASSWORD|API_KEY|CREDENTIAL)/i.test(key);
      
      if (isSecret && value) {
        secrets[key] = {
          value: maskSecret(value),
          hash: hashSecret(value),
          migratedAt: new Date().toISOString()
        };
        migrated.push(key);
      } else {
        skipped.push(key);
      }
    });

    // Save to vault
    const vault = loadVault();
    vault.secrets = { ...vault.secrets, ...secrets };
    vault.migratedAt = new Date().toISOString();
    saveVault(vault);

    // Mark as migrated
    writeFileSync(MIGRATED_FILE, new Date().toISOString());

    spinner.succeed('Migration completed');

    let output = '\n';
    output += f.success(`Secrets migrated successfully`) + '\n\n';
    
    output += f.box(
      f.keyValue({
        'Migrated': migrated.length,
        'Skipped': skipped.length,
        'Total': migrated.length + skipped.length,
        'Vault Location': VAULT_FILE
      }), { title: 'Migration Summary', width: 60 }
    );

    if (migrated.length > 0) {
      output += '\n\n';
      output += f.colorize('Migrated Secrets:', 'bright') + '\n';
      migrated.forEach(key => {
        output += `  ${f.colorize('✓', 'green')} ${key}\n`;
      });
    }

    if (skipped.length > 0 && options.verbose) {
      output += '\n';
      output += f.colorize('Skipped (not secrets):', 'dim') + '\n';
      skipped.forEach(key => {
        output += `  ${f.colorize('⊘', 'dim')} ${key}\n`;
      });
    }

    output += '\n';
    output += f.info('Original .env file preserved');
    output += '\n' + f.warning('Ensure .env is in .gitignore');

    return { success: true, output, data: { migrated, skipped } };
  } catch (err) {
    spinner.fail(`Migration failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * List vault secrets
 */
export async function listSecrets(_options = {}) {
  const spinner = f.createSpinner('Loading vault');
  spinner.start();

  await delay(200);

  const vault = loadVault();
  const secrets = Object.keys(vault.secrets);

  spinner.succeed('Vault loaded');

  let output = '\n';
  output += f.header('VAULT SECRETS', 'line');
  output += '\n\n';

  if (secrets.length === 0) {
    output += f.info('No secrets in vault');
    output += '\n' + f.colorize('Use "cognimesh vault migrate" to import secrets', 'dim');
    return { success: true, output, data: [] };
  }

  const secretData = secrets.map(key => ({
    Name: key,
    Hash: vault.secrets[key].hash.substring(0, 16) + '...',
    Migrated: new Date(vault.secrets[key].migratedAt).toLocaleDateString()
  }));

  output += f.table(secretData, {
    columns: ['Name', 'Hash', 'Migrated']
  });

  output += '\n\n';
  output += f.info(`${secrets.length} secret(s) stored securely`);

  return { success: true, output, data: secrets };
}

/**
 * Add a secret to vault
 */
export async function addSecret(key, value, options = {}) {
  if (!key || !value) {
    return {
      success: false,
      error: 'Key and value are required',
      output: f.error('Usage: cognimesh vault add <key> <value>')
    };
  }

  const vault = loadVault();
  vault.secrets[key] = {
    value: maskSecret(value),
    hash: hashSecret(value),
    addedAt: new Date().toISOString()
  };
  saveVault(vault);

  return {
    success: true,
    output: f.success(`Secret "${key}" added to vault`),
    data: { key }
  };
}

/**
 * Remove a secret from vault
 */
export async function removeSecret(key, _options = {}) {
  const vault = loadVault();
  
  if (!vault.secrets[key]) {
    return {
      success: false,
      error: `Secret not found: ${key}`,
      output: f.error(`Secret not found: ${key}`)
    };
  }

  delete vault.secrets[key];
  saveVault(vault);

  return {
    success: true,
    output: f.success(`Secret "${key}" removed from vault`),
    data: { key }
  };
}

/**
 * Check vault status
 */
export async function vaultStatus(_options = {}) {
  const vault = loadVault();
  const isMigrated = existsSync(MIGRATED_FILE);
  
  const stats = {
    total: Object.keys(vault.secrets).length,
    migrated: Object.values(vault.secrets).filter(s => s.migratedAt).length,
    added: Object.values(vault.secrets).filter(s => s.addedAt && !s.migratedAt).length
  };

  let output = '\n';
  output += f.header('VAULT STATUS', 'box');
  output += '\n\n';

  output += f.keyValue({
    'Vault Location': VAULT_DIR,
    'Total Secrets': stats.total,
    'Migrated': stats.migrated,
    'Manually Added': stats.added,
    'Migration Status': isMigrated ? f.colorize('completed', 'green') : f.colorize('pending', 'yellow')
  }, { indent: 2 });

  if (!isMigrated) {
    output += '\n\n';
    output += f.warning('Secrets not yet migrated from .env');
    output += '\n' + f.colorize('Run: cognimesh vault migrate', 'cyan');
  }

  return { success: true, output, data: stats };
}

// Helper functions
function maskSecret(value) {
  if (value.length <= 8) return '********';
  return value.substring(0, 4) + '****' + value.substring(value.length - 4);
}

function hashSecret(value) {
  return createHash('sha256').update(value).digest('hex');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  migrate: migrateSecrets,
  list: listSecrets,
  add: addSecret,
  remove: removeSecret,
  status: vaultStatus
};
