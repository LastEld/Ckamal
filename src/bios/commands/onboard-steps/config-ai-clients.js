/**
 * AI Client Configuration Step
 * Configure paths for Claude, Codex, and Kimi clients
 */

import { existsSync } from 'fs';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
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

function findClientInPath(command) {
  try {
    const result = execSync(`where ${command}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return result.trim().split('\n')[0];
  } catch {
    return null;
  }
}

async function detectClient(name, command, defaultPaths) {
  // First check PATH
  const inPath = findClientInPath(command);
  if (inPath) {
    return { detected: true, path: inPath, source: 'PATH' };
  }

  // Check default paths
  for (const defaultPath of defaultPaths) {
    if (existsSync(defaultPath)) {
      return { detected: true, path: defaultPath, source: 'default' };
    }
  }

  return { detected: false, path: null };
}

const CLIENT_CONFIGS = {
  claude: {
    name: 'Claude Code/CLI',
    command: 'claude',
    envVar: 'CLAUDE_CLI_PATH',
    featureFlag: 'FEATURE_CLAUDE',
    defaultPaths: [
      'C:\\Program Files\\Claude\\claude.exe',
      'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Claude\\claude.exe',
      '/usr/local/bin/claude',
      '/opt/claude/bin/claude'
    ]
  },
  codex: {
    name: 'Codex CLI',
    command: 'codex',
    envVar: 'CODEX_CLI_PATH',
    featureFlag: 'FEATURE_CODEX',
    defaultPaths: [
      'C:\\Program Files\\Codex\\codex.exe',
      'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Codex\\codex.exe',
      '/usr/local/bin/codex',
      '/opt/codex/bin/codex'
    ]
  },
  kimi: {
    name: 'Kimi CLI',
    command: 'kimi',
    envVar: 'KIMI_CLI_PATH',
    featureFlag: 'FEATURE_KIMI',
    defaultPaths: [
      'C:\\Program Files\\Kimi\\kimi.exe',
      'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Kimi\\kimi.exe',
      '/usr/local/bin/kimi',
      '/opt/kimi/bin/kimi'
    ]
  }
};

export async function configureAIClients(options = {}) {
  const { yes = false, clients: providedClients } = options;
  
  console.log(f.colorize('Configuring AI clients...', 'cyan'));
  console.log();
  console.log(f.colorize('CogniMesh uses your existing AI client subscriptions.', 'dim'));
  console.log(f.colorize('No API keys needed - we just need the path to each CLI.', 'dim'));
  console.log();

  const clients = providedClients || {};
  const results = {};

  for (const [clientId, config] of Object.entries(CLIENT_CONFIGS)) {
    console.log(f.colorize(`${config.name}`, 'bright'));
    
    // let clientConfig = clients[clientId] || {};
    let detected = await detectClient(config.name, config.command, config.defaultPaths);
    
    if (detected.detected) {
      console.log(f.success(`  Found: ${detected.path} (${detected.source})`));
      
      if (!yes) {
        const useIt = await question(f.colorize('  Use this path? [Y/n]: ', 'dim'));
        if (useIt.toLowerCase() === 'n') {
          detected.detected = false;
        }
      }
    }

    let finalPath = detected.detected ? detected.path : null;
    let enabled = detected.detected;

    if (!detected.detected && !yes) {
      const manualPath = await question(f.colorize('  Enter path (or press Enter to skip): ', 'dim'));
      if (manualPath.trim()) {
        finalPath = manualPath.trim();
        enabled = true;
      }
    }

    results[clientId] = {
      enabled,
      path: finalPath,
      envVar: config.envVar,
      featureFlag: config.featureFlag
    };

    if (enabled) {
      console.log(f.success(`  ${config.name} enabled`));
    } else {
      console.log(f.warning(`  ${config.name} skipped`));
    }
    console.log();
  }

  const enabledCount = Object.values(results).filter(c => c.enabled).length;
  
  return {
    success: true,
    data: { 
      step: 'config-ai-clients', 
      clients: results,
      enabledCount
    },
    message: `${enabledCount} AI client(s) configured`
  };
}

export default configureAIClients;
