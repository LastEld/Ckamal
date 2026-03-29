/**
 * Database Connectivity Check
 * Validates database connection and schema
 */

import * as f from '../utils/formatters.js';  // eslint-disable-line no-unused-vars
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Check database connectivity
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check result
 */
export async function checkDatabase(_options = {}) {
  const dbPath = process.env.DATABASE_PATH || './data/cognimesh.db';
  const resolvedPath = resolve(dbPath);

  // Check if database file exists
  const fileExists = existsSync(resolvedPath);

  try {
    // Try to import and use the database module
    let dbModule;
    try {
      dbModule = await import('../../../db/connection/index.js');
    } catch (err) {
      // Try alternative path
      dbModule = await import('../../db/connection/index.js');
    }

    if (!dbModule || !dbModule.getConnection) {
      return {
        name: 'Database Connection',
        status: fileExists ? 'warn' : 'fail',
        message: fileExists ? 'DB module unavailable, but file exists' : 'Database module not available',
        canRepair: !fileExists,
        repair: fileExists ? null : repairDatabase,
        repairHint: fileExists
          ? 'Database file exists but connection module unavailable'
          : 'Run `npm run db:migrate` to initialize the database',
        details: { path: resolvedPath, exists: fileExists }
      };
    }

    // Try to get connection and run a test query
    let connection;
    try {
      connection = dbModule.getConnection();
      if (connection && typeof connection.exec === 'function') {
        connection.exec('SELECT 1 as test');
      } else if (connection && typeof connection.query === 'function') {
        await connection.query('SELECT 1 as test');
      }
    } catch (connErr) {
      return {
        name: 'Database Connection',
        status: 'fail',
        message: `Connection failed: ${connErr.message}`,
        canRepair: true,
        repair: repairDatabase,
        repairHint: 'Attempt to repair database connection or run `npm run db:migrate`',
        details: { path: resolvedPath, error: connErr.message }
      };
    }

    // Check migrations status
    const migrationsStatus = await checkMigrationsStatus(connection);

    if (migrationsStatus.pending > 0) {
      return {
        name: 'Database Connection',
        status: 'warn',
        message: `Connected, ${migrationsStatus.pending} pending migration(s)`,
        canRepair: true,
        repair: repairDatabase,
        repairHint: `Run \`npm run db:migrate\` to apply ${migrationsStatus.pending} pending migration(s)`,
        details: { path: resolvedPath, migrations: migrationsStatus }
      };
    }

    return {
      name: 'Database Connection',
      status: 'pass',
      message: `Connected (${migrationsStatus.applied} migrations applied)`,
      details: { path: resolvedPath, migrations: migrationsStatus }
    };

  } catch (err) {
    return {
      name: 'Database Connection',
      status: fileExists ? 'warn' : 'fail',
      message: fileExists ? `DB exists but check failed: ${err.message}` : `Database error: ${err.message}`,
      canRepair: true,
      repair: repairDatabase,
      repairHint: 'Run `npm run db:migrate` to initialize the database',
      details: { path: resolvedPath, exists: fileExists, error: err.message }
    };
  }
}

/**
 * Check migrations status
 * @param {Object} connection - Database connection
 * @returns {Promise<Object>} Migrations status
 */
async function checkMigrationsStatus(connection) {
  const result = { applied: 0, pending: 0, total: 0 };

  try {
    // Try to get migration info from database
    let rows;
    try {
      const stmt = connection.prepare('SELECT name FROM migrations ORDER BY applied_at');
      rows = stmt.all ? stmt.all() : [];
    } catch (err) {
      // Migrations table might not exist
      rows = [];
    }

    result.applied = rows.length;

    // Get available migration files
    const fs = await import('fs/promises');
    const { join } = await import('path');

    const migrationsDir = join(process.cwd(), 'src', 'db', 'migrations');
    let files = [];
    try {
      files = await fs.readdir(migrationsDir);
    } catch (err) {
      // Migrations directory might not exist
    }

    const migrationFiles = files.filter(f => f.endsWith('.js') && !f.includes('index'));
    result.total = migrationFiles.length;
    result.pending = Math.max(0, result.total - result.applied);

  } catch (err) {
    // Ignore errors, return default
  }

  return result;
}

/**
 * Repair database - run migrations
 * @returns {Promise<void>}
 */
export async function repairDatabase() {
  const { execSync } = await import('child_process');

  try {
    execSync('npm run db:migrate', {
      cwd: process.cwd(),
      stdio: 'inherit',
      encoding: 'utf-8'
    });
  } catch (err) {
    throw new Error(`Database repair failed: ${err.message}`);
  }
}

export default checkDatabase;
