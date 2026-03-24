#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const passthroughArgs = process.argv.slice(2);

function translateArgsForPowerShell(args) {
  const translated = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--clean':
      case '-c':
        translated.push('-Clean');
        break;
      case '--verbose':
      case '-v':
        translated.push('-Verbose');
        break;
      case '--quiet':
      case '-q':
        translated.push('-Quiet');
        break;
      case '--skip-lint':
        translated.push('-SkipLint');
        break;
      case '--skip-typecheck':
        translated.push('-SkipTypeCheck');
        break;
      case '--skip-bundle':
        translated.push('-SkipBundle');
        break;
      case '--analyze':
        translated.push('-Analyze');
        break;
      case '--target':
        translated.push('-Target');
        if (args[index + 1] !== undefined) {
          translated.push(args[index + 1]);
          index += 1;
        }
        break;
      case '--output':
      case '-o':
        translated.push('-OutputDir');
        if (args[index + 1] !== undefined) {
          translated.push(args[index + 1]);
          index += 1;
        }
        break;
      default:
        translated.push(arg);
        break;
    }
  }

  return translated;
}

const command = process.platform === 'win32' ? 'powershell' : 'bash';
const commandArgs = process.platform === 'win32'
  ? ['-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'build.ps1'), ...translateArgsForPowerShell(passthroughArgs)]
  : [path.join(__dirname, 'build.sh'), ...passthroughArgs];

const result = spawnSync(command, commandArgs, {
  cwd: projectRoot,
  stdio: 'inherit'
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
