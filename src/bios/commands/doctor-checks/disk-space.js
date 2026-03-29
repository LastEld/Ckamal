/**
 * Disk Space Check
 * Validates sufficient disk space is available
 */

import * as f from '../utils/formatters.js';
import { statfs } from 'fs/promises';
import { resolve } from 'path';

// Minimum free space requirements (in bytes)
const MIN_FREE_SPACE = 100 * 1024 * 1024; // 100 MB minimum
const RECOMMENDED_FREE_SPACE = 500 * 1024 * 1024; // 500 MB recommended

const CRITICAL_PATHS = [
  { path: '.', name: 'Project Root' },
  { path: './data', name: 'Data Directory' },
  { path: './logs', name: 'Logs Directory' }
];

/**
 * Check disk space
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check result
 */
export async function checkDiskSpace(_options = {}) {
  const results = [];
  let lowSpacePaths = [];
  let criticalPaths = [];

  for (const config of CRITICAL_PATHS) {
    const resolvedPath = resolve(config.path);
    const result = await checkPathSpace(resolvedPath, config.name);
    results.push(result);

    if (result.freeBytes < MIN_FREE_SPACE) {
      criticalPaths.push({ name: config.name, free: result.freeBytes });
    } else if (result.freeBytes < RECOMMENDED_FREE_SPACE) {
      lowSpacePaths.push({ name: config.name, free: result.freeBytes });
    }
  }

  if (criticalPaths.length > 0) {
    return {
      name: 'Disk Space',
      status: 'fail',
      message: `Critical: ${criticalPaths.length} path(s) below ${f.formatBytes(MIN_FREE_SPACE)}`,
      canRepair: false,
      repairHint: `Free up disk space. Critical paths: ${criticalPaths.map(p => p.name).join(', ')}`,
      details: {
        paths: results,
        critical: criticalPaths,
        minimumRequired: f.formatBytes(MIN_FREE_SPACE)
      }
    };
  }

  if (lowSpacePaths.length > 0) {
    return {
      name: 'Disk Space',
      status: 'warn',
      message: `Low space on ${lowSpacePaths.length} path(s)`,
      canRepair: false,
      repairHint: `Consider freeing up space. Recommended: ${f.formatBytes(RECOMMENDED_FREE_SPACE)}`,
      details: {
        paths: results,
        lowSpace: lowSpacePaths,
        recommended: f.formatBytes(RECOMMENDED_FREE_SPACE)
      }
    };
  }

  const totalFree = results.reduce((sum, r) => sum + r.freeBytes, 0) / results.length;

  return {
    name: 'Disk Space',
    status: 'pass',
    message: `Adequate space available (${f.formatBytes(totalFree)} free)`,
    details: {
      paths: results,
      minimumRequired: f.formatBytes(MIN_FREE_SPACE)
    }
  };
}

/**
 * Check space for a specific path
 * @param {string} path - Path to check
 * @param {string} name - Path name
 * @returns {Promise<Object>} Space check result
 */
async function checkPathSpace(path, name) {
  try {
    const stats = await statfs(path);

    // Calculate free space
    // stats.bavail = available blocks for unprivileged users
    // stats.bsize = block size
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usedBytes = totalBytes - freeBytes;
    const usedPercent = ((usedBytes / totalBytes) * 100).toFixed(1);

    return {
      name,
      path,
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: parseFloat(usedPercent),
      status: freeBytes < MIN_FREE_SPACE ? 'critical' : freeBytes < RECOMMENDED_FREE_SPACE ? 'low' : 'ok'
    };

  } catch (err) {
    // Fallback for Windows or systems without statfs
    return {
      name,
      path,
      totalBytes: 0,
      freeBytes: Infinity, // Assume OK if we can't check
      usedBytes: 0,
      usedPercent: 0,
      status: 'unknown',
      note: 'Could not check disk space on this platform'
    };
  }
}

export default checkDiskSpace;
