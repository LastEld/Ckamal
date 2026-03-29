/**
 * Database Migrations Status Check
 * Checks if all migrations are applied
 */

import * as f from '../utils/formatters.js';  // eslint-disable-line no-unused-vars
import { readdir } from 'fs/promises';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

/**
 * Check migrations status
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check result
 */
export async function checkMigrations(_options = {}) {
  const migrationsDir = resolve(join(process.cwd(), 'src', 'db', 'migrations'));
  // const dbPath = process.env.DATABASE_PATH || './data/cognimesh.db';

  try {
    // Check if migrations directory exists
    if (!existsSync(migrationsDir)) {
      return {
        name: 'Database Migrations',
        status: 'warn',
        message: 'Migrations directory not found',
        canRepair: false,
        repairHint: 'Migrations directory should exist at src/db/migrations',
        details: { migrationsDir }
      };
    }

    // Get available migration files
    const files = await readdir(migrationsDir);
    const migrationFiles = files
      .filter(f => f.endsWith('.js') && !f.includes('index'))
      .sort();

    if (migrationFiles.length === 0) {
      return {
        name: 'Database Migrations',
        status: 'warn',
        message: 'No migration files found',
        canRepair: false,
        repairHint: 'No migrations to apply',
        details: { migrationsDir }
      };
    }

    // Try to get applied migrations from database
    let appliedMigrations = [];
    try {
      const dbModule = await import('../../../db/connection/index.js');
      const connection = dbModule.getConnection();

      if (connection) {
        try {
          const stmt = connection.prepare('SELECT name FROM migrations ORDER BY applied_at');
          appliedMigrations = stmt.all ? stmt.all().map(r => r.name) : [];
        } catch (err) {
          // Migrations table might not exist yet
        }
      }
    } catch (err) {
      // Database not available
    }

    // Compare available vs applied
    const availableNames = migrationFiles.map(f => f.replace('.js', ''));
    const pendingMigrations = availableNames.filter(name => !appliedMigrations.includes(name));

    if (pendingMigrations.length > 0) {
      return {
        name: 'Database Migrations',
        status: 'warn',
        message: `${pendingMigrations.length} pending migration(s)`,
        canRepair: true,
        repair: repairMigrations,
        repairHint: `Run \`npm run db:migrate\` to apply pending migrations`,
        details: {
          total: migrationFiles.length,
          applied: appliedMigrations.length,
          pending: pendingMigrations.length,
          pendingList: pendingMigrations.slice(0, 5) // Show first 5
        }
      };
    }

    return {
      name: 'Database Migrations',
      status: 'pass',
      message: `${appliedMigrations.length} migrations applied (up to date)`,
      details: {
        total: migrationFiles.length,
        applied: appliedMigrations.length,
        latest: appliedMigrations[appliedMigrations.length - 1]
      }
    };

  } catch (err) {
    return {
      name: 'Database Migrations',
      status: 'warn',
      message: `Could not check migrations: ${err.message}`,
      canRepair: false,
      repairHint: 'Check database connection and migrations directory',
      details: { error: err.message }
    };
  }
}

/**
 * Repair migrations - run pending migrations
 * @returns {Promise<void>}
 */
export async function repairMigrations() {
  const { execSync } = await import('child_process');

  try {
    execSync('npm run db:migrate', {
      cwd: process.cwd(),
      stdio: 'inherit',
      encoding: 'utf-8'
    });
  } catch (err) {
    throw new Error(`Migration repair failed: ${err.message}`);
  }
}

export default checkMigrations;
