#!/usr/bin/env node
/**
 * CogniMesh Setup Wizard
 * Interactive 5-minute configuration for CogniMesh v5.0
 */

import { createInterface } from 'readline';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function printBanner() {
  console.log('');
  console.log(c('cyan', '╔════════════════════════════════════════════════════════════╗'));
  console.log(c('cyan', '║                                                            ║'));
  console.log(c('cyan', '║') + c('bright', c('cyan', '            🧠 CogniMesh v5.0 Setup Wizard 🚀              ')) + c('cyan', '║'));
  console.log(c('cyan', '║                                                            ║'));
  console.log(c('cyan', '║') + '         Configure your multi-agent orchestration          ' + c('cyan', '║'));
  console.log(c('cyan', '║') + '                  in under 5 minutes!                      ' + c('cyan', '║'));
  console.log(c('cyan', '║                                                            ║'));
  console.log(c('cyan', '╚════════════════════════════════════════════════════════════╝'));
  console.log('');
}

function printStep(step, total, title) {
  console.log(c('bright', c('blue', `\n[${step}/${total}] ${title}`)));
  console.log(c('dim', '─'.repeat(60)));
}

function printSuccess(message) {
  console.log(c('green', `  ✓ ${message}`));
}

function printError(message) {
  console.log(c('red', `  ✗ ${message}`));
}

function printWarning(message) {
  console.log(c('yellow', `  ⚠ ${message}`));
}

function printInfo(message) {
  console.log(c('cyan', `  ℹ ${message}`));
}

async function checkPrerequisites() {
  const checks = {
    node: false,
    nodeVersion: null,
    npm: false,
    npmVersion: null
  };

  try {
    checks.nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
    checks.node = true;
    const major = parseInt(checks.nodeVersion.slice(1).split('.')[0]);
    if (major >= 18) {
      printSuccess(`Node.js ${checks.nodeVersion} (v18+ required)`);
    } else {
      printWarning(`Node.js ${checks.nodeVersion} (v18+ recommended)`);
    }
  } catch {
    printError('Node.js not found. Please install Node.js v18+');
  }

  try {
    checks.npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    checks.npm = true;
    printSuccess(`npm v${checks.npmVersion}`);
  } catch {
    printError('npm not found. Please install npm');
  }

  return checks.node && checks.npm;
}

async function askInstallationDirectory() {
  const defaultDir = process.cwd();
  printInfo(`Default: ${defaultDir}`);
  const dir = await question(c('dim', '  Installation directory (press Enter for default): '));
  const finalDir = dir.trim() || defaultDir;
  
  try {
    if (!existsSync(finalDir)) {
      mkdirSync(finalDir, { recursive: true });
      printSuccess(`Created directory: ${finalDir}`);
    } else {
      printSuccess(`Using existing directory: ${finalDir}`);
    }
    return finalDir;
  } catch (error) {
    printError(`Cannot use directory: ${error.message}`);
    return askInstallationDirectory();
  }
}

async function askPort(service, defaultPort) {
  const input = await question(c('dim', `  ${service} port (default: ${defaultPort}): `));
  const port = input.trim() ? parseInt(input) : defaultPort;
  if (isNaN(port) || port < 1 || port > 65535) {
    printWarning('Invalid port. Using default.');
    return defaultPort;
  }
  return port;
}

async function askClientPreferences() {
  console.log('');
  printInfo('Which AI clients do you have installed?');
  printInfo('CogniMesh uses your existing subscriptions (no API keys needed)');
  console.log('');

  const clients = {
    claude: false,
    codex: false,
    kimi: false
  };

  const claude = await question(c('dim', '  Do you have Claude Code/CLI installed? [Y/n]: '));
  clients.claude = claude.toLowerCase() !== 'n';
  if (clients.claude) printSuccess('Claude enabled');

  const codex = await question(c('dim', '  Do you have Codex CLI installed? [Y/n]: '));
  clients.codex = codex.toLowerCase() !== 'n';
  if (clients.codex) printSuccess('Codex enabled');

  const kimi = await question(c('dim', '  Do you have Kimi CLI installed? [Y/n]: '));
  clients.kimi = kimi.toLowerCase() !== 'n';
  if (clients.kimi) printSuccess('Kimi enabled');

  if (!clients.claude && !clients.codex && !clients.kimi) {
    printWarning('No clients selected. You can configure later.');
  }

  return clients;
}

async function askGitHubToken() {
  console.log('');
  printInfo('GitHub integration requires a Personal Access Token');
  printInfo('Create one at: https://github.com/settings/tokens');
  printInfo('Required scopes: repo, workflow, read:org');
  console.log('');

  const token = await question(c('dim', '  GitHub Token (or press Enter to skip): '));
  const trimmed = token.trim();
  
  if (trimmed) {
    if (trimmed.startsWith('ghp_') || trimmed.startsWith('github_pat_')) {
      printSuccess('GitHub token captured');
      return trimmed;
    } else {
      printWarning('Token format looks unusual, but will be saved');
      return trimmed;
    }
  }
  
  printWarning('No GitHub token provided. You can add it later in .env');
  return '';
}

function generateEnvFile(config) {
  const jwtSecret = Array.from({ length: 48 }, () => 
    Math.random().toString(36).charAt(2)
  ).join('');

  const sessionSecret = Array.from({ length: 48 }, () => 
    Math.random().toString(36).charAt(2)
  ).join('');

  const securityPepper = Array.from({ length: 32 }, () => 
    Math.random().toString(36).charAt(2)
  ).join('');

  const envContent = `# CogniMesh v5.0 - Environment Configuration
# Generated by setup wizard on ${new Date().toISOString()}

# ============================================================
# Essential Configuration (Required)
# ============================================================

# Node environment: development | test | production
NODE_ENV=development

# Main server port
COGNIMESH_PORT=${config.ports.main}

# Dashboard port
DASHBOARD_PORT=${config.ports.dashboard}

# WebSocket server port
WS_PORT=${config.ports.websocket}

# ============================================================
# Client Preferences (Enable clients you have installed)
# ============================================================

# These feature flags enable routing to your local clients
# No API keys needed - uses your existing subscriptions
FEATURE_CLAUDE=${config.clients.claude}
FEATURE_CODEX=${config.clients.codex}
FEATURE_KIMI=${config.clients.kimi}

# ============================================================
# GitHub Integration (Recommended)
# ============================================================

# GitHub Personal Access Token
# Generate at: https://github.com/settings/tokens
# Required scopes: repo, workflow, read:org
GITHUB_TOKEN=${config.githubToken}

# Default GitHub repository (format: owner/repo)
GITHUB_REPO=

# ============================================================
# Security (Auto-generated - Change in production!)
# ============================================================

# JWT secret for authentication (min 32 characters)
JWT_SECRET=${jwtSecret}

# Session secret (min 32 characters)
SESSION_SECRET=${sessionSecret}

# Security pepper for hashing
SECURITY_PEPPER=${securityPepper}

# Admin password (change in production!)
ADMIN_PASSWORD=admin

# ============================================================
# Database & Storage
# ============================================================

DATABASE_PATH=./data/cognimesh.db
STATE_PATH=./data/state

# ============================================================
# System Settings
# ============================================================

BIOS_MODE=OPERATIONAL
AUTO_UPDATE=true
LOG_LEVEL=INFO
DASHBOARD_ENABLED=true

# ============================================================
# Optional: Advanced Configuration
# ============================================================
# See .env.example for all available options
# ============================================================
`;

  return envContent;
}

async function runSetup() {
  printBanner();

  // Step 1: Prerequisites
  printStep(1, 5, 'Checking Prerequisites');
  const prereqsOk = await checkPrerequisites();
  if (!prereqsOk) {
    console.log('');
    printError('Prerequisites not met. Please install Node.js v18+ and npm.');
    printInfo('Download from: https://nodejs.org/');
    process.exit(1);
  }

  // Step 2: Installation Directory
  printStep(2, 5, 'Installation Directory');
  const installDir = await askInstallationDirectory();

  // Step 3: Port Configuration
  printStep(3, 5, 'Port Configuration');
  printInfo('CogniMesh needs 3 ports for different services');
  const ports = {
    main: await askPort('Main Server', 3000),
    dashboard: await askPort('Dashboard', 3001),
    websocket: await askPort('WebSocket', 8080)
  };
  printSuccess(`Ports configured: Main=${ports.main}, Dashboard=${ports.dashboard}, WS=${ports.websocket}`);

  // Step 4: Client Preferences
  printStep(4, 5, 'AI Client Configuration');
  const clients = await askClientPreferences();

  // Step 5: GitHub Integration
  printStep(5, 5, 'GitHub Integration');
  const githubToken = await askGitHubToken();

  // Generate configuration
  console.log('');
  console.log(c('bright', c('blue', '\n[Finalizing] Generating configuration files...')));
  console.log(c('dim', '─'.repeat(60)));

  const config = {
    installDir,
    ports,
    clients,
    githubToken
  };

  // Create data directories
  const dirs = ['data', 'cache', 'logs', '.vault'];
  for (const dir of dirs) {
    const dirPath = join(installDir, dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      printSuccess(`Created ${dir}/ directory`);
    }
  }

  // Write .env file
  const envPath = join(installDir, '.env');
  const envContent = generateEnvFile(config);
  
  if (existsSync(envPath)) {
    const backup = await question(c('yellow', '  .env already exists. Create backup? [Y/n]: '));
    if (backup.toLowerCase() !== 'n') {
      const backupPath = `${envPath}.backup-${Date.now()}`;
      writeFileSync(backupPath, envContent);
      printSuccess(`Backup created: ${backupPath}`);
    }
  }

  writeFileSync(envPath, envContent);
  printSuccess(`Created .env file at ${envPath}`);

  // Installation complete
  console.log('');
  console.log(c('green', '╔════════════════════════════════════════════════════════════╗'));
  console.log(c('green', '║                                                            ║'));
  console.log(c('green', '║') + c('bright', c('green', '              ✅ Setup Complete! 🎉                        ')) + c('green', '║'));
  console.log(c('green', '║                                                            ║'));
  console.log(c('green', '╚════════════════════════════════════════════════════════════╝'));
  console.log('');

  console.log(c('bright', 'Next Steps:'));
  console.log('');
  console.log(c('cyan', '  1. Install dependencies:'));
  console.log(c('white', '     npm install'));
  console.log('');
  console.log(c('cyan', '  2. Run diagnostics:'));
  console.log(c('white', '     npm run doctor'));
  console.log('');
  console.log(c('cyan', '  3. Start the system:'));
  console.log(c('white', '     npm start'));
  console.log('');
  console.log(c('cyan', '  4. Open dashboard:'));
  console.log(c('white', `     http://localhost:${ports.dashboard}`));
  console.log('');

  console.log(c('dim', '─'.repeat(60)));
  console.log(c('bright', 'Useful Commands:'));
  console.log(`  ${c('yellow', 'npm run setup')}      - Run this wizard again`);
  console.log(`  ${c('yellow', 'npm run doctor')}     - Check system health`);
  console.log(`  ${c('yellow', 'npm run dev')}        - Start in development mode`);
  console.log(`  ${c('yellow', 'npm test')}           - Run test suite`);
  console.log(c('dim', '─'.repeat(60)));
  console.log('');

  rl.close();
}

// Handle errors gracefully
process.on('uncaughtException', (error) => {
  console.error(c('red', `\nUnexpected error: ${error.message}`));
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log(c('yellow', '\n\nSetup cancelled by user'));
  rl.close();
  process.exit(0);
});

runSetup().catch((error) => {
  console.error(c('red', `\nSetup failed: ${error.message}`));
  process.exit(1);
});
