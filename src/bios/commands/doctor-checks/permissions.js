/**
 * Data Directory Permissions Check
 * Validates read/write access to data directories
 */

import * as f from '../utils/formatters.js';  // eslint-disable-line no-unused-vars
import { existsSync, mkdirSync } from 'fs';
import { access, constants, writeFile, unlink, stat } from 'fs/promises';
import { resolve, join } from 'path';

const REQUIRED_DIRS = [
  { path: './data', name: 'Data Directory', required: true },
  { path: './cache', name: 'Cache Directory', required: false },
  { path: './logs', name: 'Logs Directory', required: false },
  { path: './.vault', name: 'Vault Directory', required: false }
];

/**
 * Check directory permissions
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check result
 */
export async function checkPermissions(_options = {}) {
  const results = [];
  let hasFailures = false;
  let hasWarnings = false;

  for (const dir of REQUIRED_DIRS) {
    const resolvedPath = resolve(dir.path);
    const result = await checkDirectory(resolvedPath, dir);
    results.push(result);

    if (result.status === 'fail') hasFailures = true;
    if (result.status === 'warn') hasWarnings = true;
  }

  if (hasFailures) {
    const failed = results.filter(r => r.status === 'fail');
    return {
      name: 'Directory Permissions',
      status: 'fail',
      message: `${failed.length} directory(s) have permission issues`,
      canRepair: true,
      repair: repairPermissions,
      repairHint: 'Attempt to create directories and fix permissions',
      details: { directories: results }
    };
  }

  if (hasWarnings) {
    return {
      name: 'Directory Permissions',
      status: 'warn',
      message: 'All directories accessible with warnings',
      canRepair: true,
      repair: repairPermissions,
      repairHint: 'Some directories are optional or have minor issues',
      details: { directories: results }
    };
  }

  const requiredCount = results.filter(r => r.required).length;
  return {
    name: 'Directory Permissions',
    status: 'pass',
    message: `${results.length} directories accessible (${requiredCount} required)`,
    details: { directories: results }
  };
}

/**
 * Check a single directory
 * @param {string} resolvedPath - Resolved directory path
 * @param {Object} config - Directory configuration
 * @returns {Promise<Object>} Directory check result
 */
async function checkDirectory(resolvedPath, config) {
  const result = {
    path: resolvedPath,
    name: config.name,
    required: config.required,
    exists: false,
    readable: false,
    writable: false,
    status: 'pass'
  };

  try {
    // Check if directory exists
    try {
      await access(resolvedPath, constants.F_OK);
      result.exists = true;

      const stats = await stat(resolvedPath);
      result.isDirectory = stats.isDirectory();
    } catch (err) {
      result.exists = false;
      result.status = config.required ? 'fail' : 'warn';
      result.message = 'Directory does not exist';
      return result;
    }

    // Check read access
    try {
      await access(resolvedPath, constants.R_OK);
      result.readable = true;
    } catch (err) {
      result.status = config.required ? 'fail' : 'warn';
      result.message = 'Not readable';
    }

    // Check write access with a test file
    try {
      const testFile = join(resolvedPath, `.doctor-test-${Date.now()}`);
      await writeFile(testFile, 'test');
      await unlink(testFile);
      result.writable = true;
    } catch (err) {
      result.status = config.required ? 'fail' : 'warn';
      result.message = result.message ? `${result.message}, not writable` : 'Not writable';
    }

    if (!result.message) {
      result.message = 'OK';
    }

  } catch (err) {
    result.status = config.required ? 'fail' : 'warn';
    result.message = `Check failed: ${err.message}`;
  }

  return result;
}

/**
 * Repair permissions - create directories
 * @returns {Promise<void>}
 */
export async function repairPermissions() {
  const errors = [];

  for (const dir of REQUIRED_DIRS) {
    const resolvedPath = resolve(dir.path);

    try {
      // Create directory if it doesn't exist
      if (!existsSync(resolvedPath)) {
        mkdirSync(resolvedPath, { recursive: true, mode: 0o755 });
      }

      // Verify write access
      const testFile = join(resolvedPath, `.doctor-test-${Date.now()}`);
      await writeFile(testFile, 'test');
      await unlink(testFile);

    } catch (err) {
      errors.push(`${dir.name}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to repair directories:\n${errors.join('\n')}`);
  }
}

export default checkPermissions;
