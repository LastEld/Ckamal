#!/usr/bin/env node
/**
 * Database migration CLI wrapper for the ESM migration runner.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MigrationRunner } from '../src/db/migrations/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const databasePath = process.env.DATABASE_PATH || path.join(projectRoot, 'data', 'cognimesh.db');
const migrationsPath = path.join(projectRoot, 'src', 'db', 'migrations');

function printUsage() {
  console.log(`Usage: node scripts/migrate.js [up|down|rollback|reset|fresh|status|pending|create <name>]`);
}

async function main() {
  const [command = 'up', ...args] = process.argv.slice(2);

  if (command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  const runner = new MigrationRunner(db, { migrationsPath });

  try {
    let result;

    switch (command) {
      case 'up':
        result = await runner.runMigrations();
        break;
      case 'down':
        result = await runner.rollback(1);
        break;
      case 'rollback': {
        const rawSteps = args[0] ?? '1';
        const steps = rawSteps === 'all' ? 'all' : Number.parseInt(rawSteps, 10);
        if (steps !== 'all' && Number.isNaN(steps)) {
          throw new Error(`Invalid rollback step count: ${rawSteps}`);
        }
        result = await runner.rollback(steps);
        break;
      }
      case 'reset':
        result = await runner.reset();
        break;
      case 'fresh':
        result = await runner.fresh();
        break;
      case 'status':
        await runner.initialize();
        result = runner.status();
        break;
      case 'pending':
        await runner.initialize();
        result = runner.getPendingMigrations();
        break;
      case 'create': {
        const name = args.join(' ').trim();
        if (!name) {
          throw new Error('Migration name is required for create');
        }
        result = await runner.createMigration(name);
        break;
      }
      default:
        throw new Error(`Unsupported migration command: ${command}`);
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
