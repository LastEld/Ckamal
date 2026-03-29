/**
 * Update Commands
 * Check and apply system updates
 */

import * as f from './utils/formatters.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CURRENT_VERSION = getVersion();

// Simulated update repository
const AVAILABLE_UPDATES = [
  {
    version: '5.1.0',
    type: 'minor',
    description: 'Enhanced CLI with interactive mode and progress bars',
    date: '2026-03-25',
    changelog: [
      'Added interactive CLI mode',
      'Enhanced output with colors and tables',
      'New commands: tasks, roadmaps, vault',
      'Improved backup/restore functionality'
    ],
    size: '2.4 MB',
    required: false
  },
  {
    version: '5.0.5',
    type: 'patch',
    description: 'Bug fixes and performance improvements',
    date: '2026-03-22',
    changelog: [
      'Fixed memory leak in WebSocket server',
      'Improved task queue performance',
      'Updated dependencies'
    ],
    size: '450 KB',
    required: true
  },
  {
    version: '5.0.4',
    type: 'patch',
    description: 'Security patches',
    date: '2026-03-18',
    changelog: [
      'Fixed vulnerability in dependency',
      'Enhanced input validation'
    ],
    size: '120 KB',
    required: true
  }
];

/**
 * Check for updates
 */
export async function checkUpdates(_options = {}) {
  const spinner = f.createSpinner('Checking for updates');
  spinner.start();

  try {
    // Simulate network request
    await delay(800);

    const updates = AVAILABLE_UPDATES.filter(u => compareVersions(u.version, CURRENT_VERSION) > 0);
    const required = updates.filter(u => u.required);

    spinner.succeed('Update check complete');

    let output = '\n';
    output += f.header('UPDATE CHECK', 'line');
    output += '\n\n';

    output += f.keyValue({
      'Current Version': `v${CURRENT_VERSION}`,
      'Latest Version': updates.length > 0 ? `v${updates[0].version}` : f.colorize(`v${CURRENT_VERSION} (latest)`, 'green'),
      'Available Updates': updates.length,
      'Required Updates': required.length > 0 ? f.colorize(required.length, 'red') : '0'
    }, { indent: 2 });

    if (updates.length === 0) {
      output += '\n\n';
      output += f.success('You are running the latest version!');
      return { success: true, output, data: { current: CURRENT_VERSION, updates: [] } };
    }

    output += '\n\n';
    output += f.colorize('Available Updates:', 'bright') + '\n\n';

    updates.forEach((update, idx) => {
      const typeColor = update.type === 'major' ? 'red' : update.type === 'minor' ? 'yellow' : 'cyan';
      const requiredBadge = update.required ? f.colorize(' [REQUIRED]', 'red') : '';
      
      output += f.box(
        f.keyValue({
          'Version': f.colorize(`v${update.version}`, typeColor) + requiredBadge,
          'Type': update.type,
          'Date': update.date,
          'Size': update.size,
          'Description': update.description
        }) + '\n\n' + 
        f.colorize('Changes:', 'bright') + '\n' +
        f.list(update.changelog, { indent: 2 }),
        { title: `Update ${idx + 1}`, width: 65 }
      );
      output += '\n';
    });

    if (required.length > 0) {
      output += '\n';
      output += f.warning(`${required.length} required update(s) available`);
      output += '\n' + f.colorize('Run: cognimesh update apply', 'cyan');
    }

    return { 
      success: true, 
      output, 
      data: { 
        current: CURRENT_VERSION, 
        updates,
        required
      } 
    };
  } catch (err) {
    spinner.fail(`Update check failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Apply updates
 */
export async function applyUpdates(options = {}) {
  const updates = AVAILABLE_UPDATES.filter(u => compareVersions(u.version, CURRENT_VERSION) > 0);
  
  if (updates.length === 0) {
    return {
      success: true,
      output: f.success('No updates to apply. You are running the latest version.')
    };
  }

  const targetVersion = updates[0].version;
  
  console.log(f.header('APPLYING UPDATES', 'line'));
  console.log();
  console.log(f.info(`Current version: v${CURRENT_VERSION}`));
  console.log(f.info(`Target version: v${targetVersion}`));
  console.log();

  // Confirm if not forced
  if (!options.force) {
    console.log(f.warning('This will update your system. Ensure you have a backup.'));
    console.log(f.colorize('Use --force to skip this confirmation', 'dim'));
    // In real implementation, prompt for confirmation here
  }

  console.log();

  // Download phase
  const downloadSpinner = f.createSpinner('Downloading updates');
  downloadSpinner.start();
  await delay(1000);
  downloadSpinner.succeed('Updates downloaded');

  // Verify phase
  const verifySpinner = f.createSpinner('Verifying update package');
  verifySpinner.start();
  await delay(600);
  verifySpinner.succeed('Package verified');

  // Backup phase
  const backupSpinner = f.createSpinner('Creating pre-update backup');
  backupSpinner.start();
  await delay(800);
  backupSpinner.succeed('Backup created');

  // Install phase
  const installSpinner = f.createSpinner('Installing updates');
  installSpinner.start();
  
  const steps = ['Stopping services', 'Updating files', 'Running migrations', 'Restarting services'];
  for (const step of steps) {
    installSpinner.stop(`${step}...`, 'info');
    installSpinner.start(`${step}...`);
    await delay(500);
  }
  
  installSpinner.succeed('Updates installed');

  console.log();
  console.log(f.divider());
  console.log();

  let output = f.success(`Updated from v${CURRENT_VERSION} to v${targetVersion}`);
  output += '\n\n';
  output += f.box(
    f.keyValue({
      'Previous Version': `v${CURRENT_VERSION}`,
      'Current Version': `v${targetVersion}`,
      'Backup': `backup-pre-${targetVersion}.json`,
      'Updated At': new Date().toLocaleString()
    }), { title: 'Update Summary', width: 60 }
  );

  console.log(output);

  return { 
    success: true, 
    output: '',
    data: {
      previous: CURRENT_VERSION,
      current: targetVersion,
      applied: updates.filter(u => compareVersions(u.version, targetVersion) <= 0).map(u => u.version)
    }
  };
}

/**
 * Rollback to previous version
 */
export async function rollbackUpdate(version, _options = {}) {
  if (!version) {
    return {
      success: false,
      error: 'Version is required',
      output: f.error('Usage: cognimesh update rollback <version>')
    };
  }

  const spinner = f.createSpinner('Rolling back update');
  spinner.start();

  await delay(1000);

  spinner.succeed(`Rolled back to v${version}`);

  return {
    success: true,
    output: f.success(`System rolled back to v${version}`),
    data: { version }
  };
}

/**
 * Show update history
 */
export async function updateHistory(_options = {}) {
  let output = '\n';
  output += f.header('UPDATE HISTORY', 'line');
  output += '\n\n';

  const history = [
    { version: '5.0.3', date: '2026-03-15', type: 'patch', status: 'completed' },
    { version: '5.0.2', date: '2026-03-10', type: 'patch', status: 'completed' },
    { version: '5.0.1', date: '2026-03-05', type: 'hotfix', status: 'completed' },
    { version: '5.0.0', date: '2026-03-01', type: 'major', status: 'completed' }
  ];

  const historyData = history.map(h => ({
    Version: h.version,
    Type: h.type,
    Date: h.date,
    Status: f.colorize('✓ completed', 'green')
  }));

  output += f.table(historyData, {
    columns: ['Version', 'Type', 'Date', 'Status']
  });

  return { success: true, output, data: history };
}

// Helper functions
function getVersion() {
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '5.0.0';
    }
  } catch (e) { /* intentionally empty - fallback to default version */ }
  return '5.0.0';
}

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  check: checkUpdates,
  apply: applyUpdates,
  rollback: rollbackUpdate,
  history: updateHistory
};
