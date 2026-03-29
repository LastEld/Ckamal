/**
 * Config File Validity Check
 * Validates configuration files are valid JSON
 */

import * as f from '../utils/formatters.js';
import { readFile, access } from 'fs/promises';
import { resolve } from 'path';


const CONFIG_FILES = [
  { path: 'package.json', required: true, validate: validatePackageJson },
  { path: 'config/default.json', required: false, validate: validateConfigJson },
  { path: '.env', required: false, validate: validateEnvFile },
  { path: 'jsconfig.json', required: false, validate: null },
  { path: '.eslintrc.cjs', required: false, validate: null }
];

/**
 * Check configuration files
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Check result
 */
export async function checkConfig(_options = {}) {
  const results = [];
  let invalidCount = 0;
  let missingRequired = 0;

  for (const config of CONFIG_FILES) {
    const result = await checkConfigFile(config);
    results.push(result);

    if (!result.valid) invalidCount++;
    if (result.missing && config.required) missingRequired++;
  }

  if (missingRequired > 0) {
    const missing = results.filter(r => r.missing && r.required).map(r => r.path);
    return {
      name: 'Config Files',
      status: 'fail',
      message: `Missing required: ${missing.join(', ')}`,
      canRepair: false,
      repairHint: 'Ensure required configuration files exist',
      details: { files: results }
    };
  }

  if (invalidCount > 0) {
    const invalid = results.filter(r => !r.valid && !r.missing);
    return {
      name: 'Config Files',
      status: 'fail',
      message: `${invalid.length} config file(s) invalid`,
      canRepair: false,
      repairHint: `Fix invalid files: ${invalid.map(r => r.path).join(', ')}`,
      details: { files: results }
    };
  }

  const validCount = results.filter(r => r.valid).length;
  return {
    name: 'Config Files',
    status: 'pass',
    message: `${validCount}/${results.length} config files valid`,
    details: { files: results }
  };
}

/**
 * Check individual config file
 * @param {Object} config - File configuration
 * @returns {Promise<Object>} Check result
 */
async function checkConfigFile(config) {
  const resolvedPath = resolve(config.path);
  const result = {
    path: config.path,
    resolvedPath,
    required: config.required,
    exists: false,
    valid: false,
    missing: false
  };

  try {
    await access(resolvedPath);
    result.exists = true;

    const content = await readFile(resolvedPath, 'utf-8');

    // Validate based on file type
    if (config.path.endsWith('.json')) {
      try {
        const parsed = JSON.parse(content);
        result.valid = true;

        // Run custom validation if provided
        if (config.validate) {
          const validation = config.validate(parsed);
          if (!validation.valid) {
            result.valid = false;
            result.error = validation.error;
          }
        }
      } catch (err) {
        result.valid = false;
        result.error = `Invalid JSON: ${err.message}`;
      }
    } else if (config.path.endsWith('.cjs') || config.path.endsWith('.js')) {
      // For JS files, just check they exist and are readable
      result.valid = content.length > 0;
      if (!result.valid) {
        result.error = 'Empty file';
      }
    } else if (config.path === '.env') {
      // Basic .env validation
      result.valid = validateEnvFile(content);
      if (!result.valid) {
        result.error = 'Invalid .env format';
      }
    } else {
      result.valid = true;
    }

  } catch (err) {
    if (err.code === 'ENOENT') {
      result.missing = true;
      result.valid = !config.required; // Valid if not required and missing
      if (config.required) {
        result.error = 'File not found';
      }
    } else {
      result.valid = false;
      result.error = err.message;
    }
  }

  return result;
}

/**
 * Validate package.json
 * @param {Object} pkg - Parsed package.json
 * @returns {Object} Validation result
 */
function validatePackageJson(pkg) {
  if (!pkg.name) {
    return { valid: false, error: 'Missing name field' };
  }
  if (!pkg.version) {
    return { valid: false, error: 'Missing version field' };
  }
  return { valid: true };
}

/**
 * Validate config/default.json
 * @param {Object} config - Parsed config
 * @returns {Object} Validation result
 */
function validateConfigJson(config) {
  // Basic structure check
  if (typeof config !== 'object' || config === null) {
    return { valid: false, error: 'Config must be an object' };
  }
  return { valid: true };
}

/**
 * Validate .env file content
 * @param {string} content - File content
 * @returns {boolean} Valid
 */
function validateEnvFile(content) {
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Check for valid KEY=VALUE format
    if (!trimmed.includes('=')) {
      return false;
    }

    const eqIndex = trimmed.indexOf('=');
    const key = trimmed.substring(0, eqIndex).trim();

    // Key should not be empty and should be valid identifier
    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return false;
    }
  }

  return true;
}

export default checkConfig;
