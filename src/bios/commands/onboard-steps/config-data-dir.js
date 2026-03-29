/**
 * Data Directory Configuration Step
 */

import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

import { createInterface } from 'readline';
import * as f from '../utils/formatters.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

export async function configureDataDir(options = {}) {
  const { yes = false, dataDir: providedDir } = options;
  
  console.log(f.colorize('Configuring data directory...', 'cyan'));
  console.log();

  // Default directories
  const defaultDir = join(process.cwd(), 'data');


  let baseDir = providedDir;

  if (!yes && !providedDir) {
    console.log(f.colorize('Default data directory:', 'dim'), defaultDir);
    const input = await question(f.colorize('  Data directory (press Enter for default): ', 'dim'));
    baseDir = input.trim() || defaultDir;
  } else {
    baseDir = baseDir || defaultDir;
  }

  // Resolve to absolute path
  baseDir = resolve(baseDir);

  // Create directories
  const dirs = {
    base: baseDir,
    data: join(baseDir, 'db'),
    cache: join(baseDir, 'cache'),
    logs: join(baseDir, 'logs'),
    vault: join(baseDir, 'vault'),
    backups: join(baseDir, 'backups'),
    state: join(baseDir, 'state')
  };

  const created = [];
  const existing = [];

  for (const [name, dirPath] of Object.entries(dirs)) {
    if (!existsSync(dirPath)) {
      try {
        mkdirSync(dirPath, { recursive: true });
        created.push(name);
      } catch (err) {
        return {
          success: false,
          data: { step: 'config-data-dir', dir: dirPath },
          message: `Failed to create directory ${name}: ${err.message}`
        };
      }
    } else {
      existing.push(name);
    }
  }

  console.log();
  if (created.length > 0) {
    created.forEach(name => console.log(f.success(`Created ${name}/ directory`)));
  }
  if (existing.length > 0) {
    existing.forEach(name => console.log(f.info(`Using existing ${name}/ directory`)));
  }

  console.log();
  console.log(f.colorize('Data directory:', 'cyan'), baseDir);
  console.log();

  return {
    success: true,
    data: { 
      step: 'config-data-dir', 
      dirs,
      created,
      existing
    },
    message: `Data directory configured at ${baseDir}`
  };
}

export default configureDataDir;
