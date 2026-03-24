#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [rootDir, suffix, ...flags] = process.argv.slice(2);

if (!rootDir || !suffix) {
  console.error('Usage: node scripts/run-node-tests.js <rootDir> <suffix> [--watch]');
  process.exit(1);
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return collectFiles(fullPath);
      }

      return entry.name.endsWith(suffix) ? [fullPath] : [];
    })
  );

  return files.flat();
}

const files = (await collectFiles(path.resolve(rootDir))).sort();

if (files.length === 0) {
  console.error(`No test files found under ${rootDir} matching *${suffix}`);
  process.exit(1);
}

const nodeArgs = ['--test'];
if (flags.includes('--watch')) {
  nodeArgs.push('--watch');
}
nodeArgs.push(...files);

const result = spawnSync(process.execPath, nodeArgs, {
  stdio: 'inherit'
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
