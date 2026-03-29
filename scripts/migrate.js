#!/usr/bin/env node
/**
 * CogniMesh v5.0 - Enhanced Migration Runner CLI
 * 
 * Supports: up, down, redo, status, reset, fresh
 * Features: dry-run mode, force option, verbose logging
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { createMigrationRunner } from '../src/db/migrations/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'up';
  
  const options = {
    command,
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    force: args.includes('--force') || args.includes('-f'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    steps: 1,
    timeout: 30000,
    env: process.env.NODE_ENV || 'development'
  };
  
  // Parse --steps
  const stepsIndex = args.findIndex(a => a === '--steps' || a === '-s');
  if (stepsIndex !== -1 && args[stepsIndex + 1]) {
    const steps = parseInt(args[stepsIndex + 1], 10);
    if (!isNaN(steps)) {
      options.steps = steps;
    }
  }
  
  // Parse --timeout
  const timeoutIndex = args.findIndex(a => a === '--timeout' || a === '-t');
  if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
    const timeout = parseInt(args[timeoutIndex + 1], 10);
    if (!isNaN(timeout)) {
      options.timeout = timeout;
    }
  }
  
  return options;
}

// Load configuration from .env
function loadConfig() {
  const envPath = join(rootDir, '.env');
  const config = {
    dbPath: join(rootDir, 'data', 'cognimesh.db'),
    migrationsPath: join(rootDir, 'src', 'db', 'migrations')
  };
  
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    const dbMatch = envContent.match(/DATABASE_URL\s*=\s*(.+)/);
    if (dbMatch) {
      const dbUrl = dbMatch[1].trim();
      if (dbUrl.startsWith('file:')) {
        config.dbPath = dbUrl.replace('file:', '');
      } else if (dbUrl.startsWith('./') || dbUrl.startsWith('../')) {
        config.dbPath = join(rootDir, dbUrl);
      } else {
        config.dbPath = dbUrl;
      }
    }
  }
  
  return config;
}

// Logger
class Logger {
  constructor(verbose = false) {
    this.verbose = verbose;
  }
  
  info(message) {
    console.log(`\x1b[36m[INFO]\x1b[0m ${message}`);
  }
  
  success(message) {
    console.log(`\x1b[32m[SUCCESS]\x1b[0m ${message}`);
  }
  
  warn(message) {
    console.log(`\x1b[33m[WARN]\x1b[0m ${message}`);
  }
  
  error(message) {
    console.log(`\x1b[31m[ERROR]\x1b[0m ${message}`);
  }
  
  debug(message) {
    if (this.verbose) {
      console.log(`\x1b[90m[DEBUG]\x1b[0m ${message}`);
    }
  }
  
  dryRun(message) {
    console.log(`\x1b[35m[DRY-RUN]\x1b[0m ${message}`);
  }
}

// Print banner
function printBanner() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║          CogniMesh v5.0 - Migration Runner                 ║
╚════════════════════════════════════════════════════════════╝
`);
}

// Print usage
function printUsage() {
  console.log(`
Usage: node scripts/migrate.js [command] [options]

Commands:
  up          Run pending migrations (default)
  down        Rollback migrations
  redo        Rollback and re-run last batch
  status      Show migration status
  reset       Rollback all migrations
  fresh       Reset and re-run all migrations
  create      Create a new migration file

Options:
  -d, --dry-run       Show what would happen without making changes
  -f, --force         Force run even if checksum mismatch
  -v, --verbose       Enable verbose logging
  -s, --steps <n>     Number of batches to rollback (default: 1)
  -t, --timeout <ms>  Lock timeout in milliseconds (default: 30000)
  -h, --help          Show this help message

Examples:
  node scripts/migrate.js                    # Run all pending migrations
  node scripts/migrate.js up --dry-run       # Preview migrations
  node scripts/migrate.js down --steps 2     # Rollback 2 batches
  node scripts/migrate.js redo               # Re-run last batch
  node scripts/migrate.js status             # Check status
  node scripts/migrate.js create add_users   # Create new migration
`);
}

// Create backup before migrations
function createBackup(dbPath, logger) {
  const backupPath = dbPath.replace('.db', `-${Date.now()}.backup.db`);
  try {
    const db = new Database(dbPath);
    db.backup(backupPath);
    db.close();
    logger.info(`Backup created: ${backupPath}`);
    return backupPath;
  } catch (err) {
    logger.warn(`Failed to create backup: ${err.message}`);
    return null;
  }
}

// Execute migration command
async function executeCommand(command, options, config, logger) {
  const db = new Database(config.dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  const runner = createMigrationRunner(db, {
    migrationsPath: config.migrationsPath,
    lockTimeout: options.timeout,
    migrationsTable: 'migrations'
  });
  
  try {
    switch (command) {
      case 'up':
        return await runMigrations(runner, options, logger);
        
      case 'down':
        return await rollbackMigrations(runner, options, logger);
        
      case 'redo':
        return await redoMigrations(runner, options, logger);
        
      case 'status':
        return await showStatus(runner, logger);
        
      case 'reset':
        return await resetMigrations(runner, options, logger);
        
      case 'fresh':
        return await freshMigrations(runner, options, logger);
        
      case 'create':
        return await createMigration(runner, options, logger);
        
      default:
        logger.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

// Run migrations
async function runMigrations(runner, options, logger) {
  logger.info('Checking for pending migrations...');
  
  const pending = runner.getPendingMigrations();
  
  if (pending.length === 0) {
    logger.success('No pending migrations');
    return { success: true, applied: 0 };
  }
  
  logger.info(`Found ${pending.length} pending migration(s):`);
  for (const m of pending) {
    console.log(`  • ${m.name}`);
  }
  
  if (options.dryRun) {
    logger.dryRun(`Would apply ${pending.length} migration(s)`);
    return { success: true, dryRun: true, wouldApply: pending.length };
  }
  
  logger.info('Running migrations...');
  const result = await runner.runMigrations();
  
  if (result.success) {
    logger.success(`Successfully applied batch ${result.batch}`);
    for (const m of result.migrations) {
      console.log(`  ✓ ${m.name} (${m.executionTime}ms)`);
    }
  }
  
  return result;
}

// Rollback migrations
async function rollbackMigrations(runner, options, logger) {
  const steps = options.steps;
  
  logger.info(`Rolling back ${steps} batch(es)...`);
  
  const applied = runner.getAppliedMigrations();
  
  if (applied.length === 0) {
    logger.warn('No migrations to rollback');
    return { success: true, rolledBack: 0 };
  }
  
  // Get batches that would be rolled back
  const batches = [...new Set(applied.map(m => m.batch))].sort((a, b) => b - a);
  const targetBatches = steps === 'all' ? batches : batches.slice(0, steps);
  
  const migrationsToRollback = applied.filter(m => targetBatches.includes(m.batch));
  
  logger.info(`Will rollback ${migrationsToRollback.length} migration(s):`);
  for (const m of migrationsToRollback.reverse()) {
    console.log(`  • ${m.name} (batch ${m.batch})`);
  }
  
  if (options.dryRun) {
    logger.dryRun(`Would rollback ${migrationsToRollback.length} migration(s)`);
    return { success: true, dryRun: true, wouldRollback: migrationsToRollback.length };
  }
  
  logger.warn('Rolling back migrations...');
  const result = await runner.rollback(steps);
  
  if (result.success) {
    logger.success(`Successfully rolled back batch(es): ${result.batches.join(', ')}`);
    for (const m of result.migrations) {
      console.log(`  ✓ ${m.name}`);
    }
  }
  
  return result;
}

// Redo last batch
async function redoMigrations(runner, options, logger) {
  logger.info('Redoing last batch...');
  
  // First rollback
  const rollbackResult = await rollbackMigrations(runner, { ...options, steps: 1 }, logger);
  
  if (!rollbackResult.success) {
    return rollbackResult;
  }
  
  if (options.dryRun) {
    logger.dryRun('Would re-run rolled back migrations');
    return { success: true, dryRun: true };
  }
  
  // Then migrate up
  return await runMigrations(runner, options, logger);
}

// Show migration status
async function showStatus(runner, logger) {
  const status = runner.status();
  const applied = runner.getAppliedMigrations();
  const pending = runner.getPendingMigrations();
  
  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│                  Migration Status                          │');
  console.log('├────────────────────────────────────────────────────────────┤');
  console.log(`│  Applied:  ${String(status.applied).padEnd(47)}│`);
  console.log(`│  Pending:  ${String(status.pending).padEnd(47)}│`);
  console.log(`│  Total:    ${String(status.total).padEnd(47)}│`);
  console.log(`│  Current Batch: ${String(status.currentBatch).padEnd(43)}│`);
  console.log('├────────────────────────────────────────────────────────────┤');
  
  if (status.lastApplied) {
    console.log(`│  Last Applied: ${status.lastApplied.padEnd(46)}│`);
  }
  
  console.log('└────────────────────────────────────────────────────────────┘');
  
  if (applied.length > 0) {
    console.log('\nApplied Migrations:');
    for (const m of applied) {
      const date = new Date(m.applied_at).toLocaleString();
      console.log(`  [${String(m.batch).padStart(3)}] ${m.name.padEnd(40)} ${date}`);
    }
  }
  
  if (pending.length > 0) {
    console.log('\nPending Migrations:');
    for (const m of pending) {
      console.log(`  [PENDING] ${m.name}`);
    }
  }
  
  return { success: true, status };
}

// Reset all migrations
async function resetMigrations(runner, options, logger) {
  logger.warn('⚠️  WARNING: This will rollback ALL migrations and may result in data loss!');
  
  if (options.dryRun) {
    logger.dryRun('Would rollback all migrations');
    return await rollbackMigrations(runner, { ...options, steps: 'all' }, logger);
  }
  
  if (!options.force) {
    logger.error('Use --force flag to confirm reset operation');
    logger.info('Run: node scripts/migrate.js reset --force');
    return { success: false, error: 'Confirmation required' };
  }
  
  return await rollbackMigrations(runner, { ...options, steps: 'all' }, logger);
}

// Fresh start (reset + migrate)
async function freshMigrations(runner, options, logger) {
  logger.warn('⚠️  WARNING: This will reset the database and re-run all migrations!');
  
  if (options.dryRun) {
    logger.dryRun('Would reset and re-run all migrations');
    return { success: true, dryRun: true };
  }
  
  if (!options.force) {
    logger.error('Use --force flag to confirm fresh operation');
    logger.info('Run: node scripts/migrate.js fresh --force');
    return { success: false, error: 'Confirmation required' };
  }
  
  logger.info('Resetting database...');
  await runner.reset();
  
  logger.info('Running all migrations...');
  return await runMigrations(runner, { ...options, force: false }, logger);
}

// Create new migration
async function createMigration(runner, options, logger) {
  const name = process.argv[3];
  
  if (!name) {
    logger.error('Migration name required');
    logger.info('Usage: node scripts/migrate.js create <name>');
    return { success: false };
  }
  
  const result = await runner.createMigration(name);
  logger.success(`Created migration: ${result.filename}`);
  logger.info(`Path: ${result.path}`);
  
  return { success: true, filename: result.filename };
}

// Main function
async function main() {
  printBanner();
  
  const options = parseArgs();
  const config = loadConfig();
  const logger = new Logger(options.verbose);
  
  logger.debug(`Environment: ${options.env}`);
  logger.debug(`Database: ${config.dbPath}`);
  logger.debug(`Migrations: ${config.migrationsPath}`);
  
  // Show help
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    printUsage();
    process.exit(0);
  }
  
  // Validate database exists or we're creating fresh
  if (!existsSync(config.dbPath) && options.command !== 'status') {
    logger.warn(`Database not found: ${config.dbPath}`);
    logger.info('A new database will be created');
  }
  
  // Create backup before destructive operations
  let backupPath = null;
  if (!options.dryRun && ['up', 'down', 'redo', 'fresh'].includes(options.command)) {
    if (existsSync(config.dbPath)) {
      backupPath = createBackup(config.dbPath, logger);
    }
  }
  
  try {
    const result = await executeCommand(options.command, options, config, logger);
    
    if (result.success) {
      if (!options.dryRun) {
        logger.success('Migration operation completed successfully');
      }
      process.exit(0);
    } else {
      logger.error('Migration operation failed');
      if (result.error) {
        logger.error(result.error);
      }
      process.exit(1);
    }
  } catch (err) {
    logger.error(`Migration failed: ${err.message}`);
    
    if (options.verbose) {
      console.error(err);
    }
    
    if (backupPath) {
      logger.info(`Backup available at: ${backupPath}`);
    }
    
    process.exit(1);
  }
}

// Run main
main();
