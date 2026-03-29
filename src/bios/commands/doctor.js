/**
 * Doctor Command
 * Comprehensive system diagnostics with auto-repair capabilities
 * Inspired by Paperclip's doctor command
 */

import * as f from './utils/formatters.js';
import { createInterface } from 'readline';

// Import all check modules
import {
  checkNodeVersion,
  checkEnvironment,
  checkDatabase,
  repairDatabase,
  checkPermissions,
  repairPermissions,
  checkMigrations,
  repairMigrations,
  checkAIClients,
  checkPorts,
  checkDiskSpace,
  checkMemory,
  checkConfig,
  checkGitHub
} from './doctor-checks/index.js';

// Status icons
const STATUS_ICON = {
  pass: f.colorize('✓', 'green'),
  warn: f.colorize('!', 'yellow'),
  fail: f.colorize('✗', 'red'),
  running: f.colorize('●', 'cyan')
};

// All checks in order of execution
const CHECKS = [
  { id: 'node', name: 'Node.js Version', run: checkNodeVersion, critical: true },
  { id: 'config', name: 'Config Files', run: checkConfig, critical: true },
  { id: 'env', name: 'Environment Variables', run: checkEnvironment, critical: true },
  { id: 'permissions', name: 'Directory Permissions', run: checkPermissions, repair: repairPermissions },
  { id: 'database', name: 'Database Connection', run: checkDatabase, repair: repairDatabase },
  { id: 'migrations', name: 'Database Migrations', run: checkMigrations, repair: repairMigrations },
  { id: 'github', name: 'GitHub API', run: checkGitHub },
  { id: 'ai', name: 'AI Clients', run: checkAIClients },
  { id: 'ports', name: 'Port Availability', run: checkPorts },
  { id: 'disk', name: 'Disk Space', run: checkDiskSpace },
  { id: 'memory', name: 'Memory Availability', run: checkMemory }
];

/**
 * Doctor command - Run system diagnostics
 * @param {Object} options - Command options
 * @param {boolean} options.repair - Auto-repair fixable issues
 * @param {boolean} options.yes - Skip confirmation prompts
 * @returns {Promise<Object>} Diagnostic results
 */
export async function doctorCommand(options = {}) {
  const startTime = Date.now();
  const results = [];
  let aborted = false;

  // Print header
  console.log(f.header('COGNIMESH DOCTOR', 'box'));
  console.log();
  console.log(f.colorize('Running comprehensive system diagnostics...', 'dim'));
  console.log();

  // Run each check
  for (const check of CHECKS) {
    if (aborted) break;

    // Print running status
    process.stdout.write(`  ${STATUS_ICON.running} ${check.name}... `);

    try {
      let result = await check.run(options);

      // Clear running indicator and print result
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
      printResult(result);

      // Handle critical failures
      if (result.status === 'fail' && check.critical) {
        results.push(result);
        console.log();
        console.log(f.error(`Critical check failed: ${check.name}`));
        console.log(f.colorize('Cannot continue with critical failure.', 'yellow'));
        aborted = true;
        break;
      }

      // Attempt repair if requested
      if ((result.status === 'fail' || result.status === 'warn') && result.canRepair && options.repair) {
        const repaired = await attemptRepair(result, check, options);
        if (repaired) {
          // Re-run check to verify repair
          process.stdout.write(`  ${STATUS_ICON.running} ${check.name} (verifying)... `);
          result = await check.run(options);
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          printResult({ ...result, message: `${result.message} (repaired)` });
        }
      }

      results.push(result);

    } catch (err) {
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
      const errorResult = {
        name: check.name,
        status: 'fail',
        message: `Check failed: ${err.message}`,
        canRepair: false
      };
      printResult(errorResult);
      results.push(errorResult);
    }
  }

  // Print summary
  console.log();
  const summary = printSummary(results, Date.now() - startTime);

  // Return without data since all output was already printed
  // The CLI's print function checks for data and tries to use outputManager
  return {
    success: summary.failed === 0,
    output: null,  // null indicates output already handled
    message: summary.failed === 0 ? 'All checks passed' : `${summary.failed} check(s) failed`
  };
}

/**
 * Print a check result
 * @param {Object} result - Check result
 */
function printResult(result) {
  const icon = STATUS_ICON[result.status] || STATUS_ICON.warn;
  const statusColor = result.status === 'pass' ? 'green' : result.status === 'fail' ? 'red' : 'yellow';

  console.log(`  ${icon} ${f.colorize(result.name, statusColor)}: ${result.message}`);

  if (result.status !== 'pass' && result.repairHint) {
    console.log(`      ${f.colorize(result.repairHint, 'dim')}`);
  }
}

/**
 * Attempt to repair a failed check
 * @param {Object} result - Check result
 * @param {Object} check - Check definition
 * @param {Object} options - Command options
 * @returns {Promise<boolean>} True if repaired
 */
async function attemptRepair(result, check, options) {
  if (!result.canRepair || !check.repair) return false;

  let shouldRepair = options.yes;

  if (!shouldRepair) {
    const answer = await askQuestion(`  Repair "${result.name}"? (yes/no): `);
    shouldRepair = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
  }

  if (!shouldRepair) return false;

  process.stdout.write(`      ${f.colorize('→', 'cyan')} Repairing... `);

  try {
    await check.repair();
    console.log(f.colorize('done', 'green'));
    return true;
  } catch (err) {
    console.log(f.colorize(`failed: ${err.message}`, 'red'));
    return false;
  }
}

/**
 * Ask a question and get user input
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User answer
 */
function askQuestion(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Print diagnostic summary
 * @param {Array<Object>} results - All check results
 * @param {number} duration - Duration in milliseconds
 * @returns {Object} Summary counts
 */
function printSummary(results, duration) {
  const passed = results.filter(r => r.status === 'pass').length;
  const warned = results.filter(r => r.status === 'warn').length;
  const failed = results.filter(r => r.status === 'fail').length;

  console.log(f.divider('─', 60));
  console.log();
  console.log(f.colorize('Summary', 'bright'));
  console.log();

  // Count boxes
  const parts = [];
  parts.push(f.colorize(`${passed} passed`, 'green'));
  if (warned > 0) parts.push(f.colorize(`${warned} warnings`, 'yellow'));
  if (failed > 0) parts.push(f.colorize(`${failed} failed`, 'red'));

  console.log(`  ${parts.join(' | ')}`);
  console.log(`  Duration: ${f.formatDuration(duration)}`);
  console.log();

  // Print fix suggestions for failures
  const failures = results.filter(r => r.status === 'fail');
  if (failures.length > 0) {
    console.log(f.colorize('Failed Checks:', 'red'));
    failures.forEach(failure => {
      console.log(`  ${STATUS_ICON.fail} ${failure.name}`);
      if (failure.repairHint) {
        console.log(`      ${f.colorize(failure.repairHint, 'dim')}`);
      }
    });
    console.log();
  }

  // Print warnings
  const warnings = results.filter(r => r.status === 'warn');
  if (warnings.length > 0 && failures.length === 0) {
    console.log(f.colorize('Warnings:', 'yellow'));
    warnings.forEach(warning => {
      console.log(`  ${STATUS_ICON.warn} ${warning.name}`);
      if (warning.repairHint) {
        console.log(`      ${f.colorize(warning.repairHint, 'dim')}`);
      }
    });
    console.log();
  }

  // Final status
  if (failed > 0) {
    console.log(f.error('Some checks failed. Fix the issues above and re-run:'));
    console.log(f.colorize('  cognimesh doctor', 'cyan'));
    if (!results.some(r => r.canRepair)) {
      console.log();
      console.log(f.colorize('For detailed help:', 'dim'));
      console.log(f.colorize('  cognimesh doctor --help', 'dim'));
    }
  } else if (warned > 0) {
    console.log(f.warning('All critical checks passed with some warnings.'));
  } else {
    console.log(f.success('All checks passed! System is healthy.'));
  }

  console.log();

  return { passed, warned, failed, total: results.length };
}

/**
 * Quick check - Run minimal diagnostics
 * @returns {Promise<Object>} Quick check result
 */
export async function quickCheck() {
  const results = [];

  for (const check of CHECKS.filter(c => c.critical)) {
    try {
      const result = await check.run({});
      results.push(result);
    } catch (err) {
      results.push({
        name: check.name,
        status: 'fail',
        message: err.message
      });
    }
  }

  const failed = results.filter(r => r.status === 'fail');

  return {
    healthy: failed.length === 0,
    results,
    failed: failed.map(r => r.name)
  };
}

export default doctorCommand;
export { CHECKS };
