#!/usr/bin/env node
/**
 * CogniMesh CLI - Enhanced Command Line Interface
 * Provides interactive REPL and batch command execution with rich output
 */

import { Command } from 'commander';
import { createInterface } from 'readline';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// Import commands
import * as commands from './commands/index.js';
import * as f from './commands/utils/formatters.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Read package.json for version
let version = '5.0.0';
try {
  const pkgPath = join(process.cwd(), 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    version = pkg.version || version;
  }
} catch (e) {}

/**
 * CogniMesh CLI Application
 */
class CogniMeshCLI {
  constructor() {
    this.program = new Command();
    this.isInteractive = false;
    this.setupCommands();
  }

  /**
   * Setup all CLI commands
   */
  setupCommands() {
    this.program
      .name('cognimesh')
      .description('CogniMesh - Multi-Agent Orchestration CLI')
      .version(version, '-v, --version', 'Display version')
      .option('-i, --interactive', 'Start interactive REPL mode')
      .option('--no-color', 'Disable colored output')
      .option('--verbose', 'Enable verbose output')
      .configureOutput({
        writeErr: (str) => process.stderr.write(str),
        outputError: (str, write) => write(f.colorize(`Error: ${str}`, 'red'))
      });

    // ==================== STATUS COMMAND ====================
    this.program
      .command('status')
      .alias('s')
      .description('Show system status')
      .action(async () => {
        const result = await commands.status();
        this.print(result);
      });

    // ==================== CLIENTS COMMANDS ====================
    const clientsCmd = this.program
      .command('clients')
      .alias('cl')
      .description('Manage AI clients');

    clientsCmd
      .command('list')
      .alias('ls')
      .description('List all available clients')
      .action(async () => {
        const result = await commands.clients.list();
        this.print(result);
      });

    clientsCmd
      .command('test')
      .alias('t')
      .description('Test all client connections')
      .action(async () => {
        const result = await commands.clients.test();
        this.print(result);
      });

    // Client-specific shortcuts
    ['kimi', 'claude', 'codex'].forEach(clientId => {
      clientsCmd
        .command(clientId)
        .description(`Show ${clientId} client details`)
        .action(async () => {
          const result = await commands.clients.details(clientId);
          this.print(result);
        });
    });

    // ==================== TASKS COMMANDS ====================
    const tasksCmd = this.program
      .command('tasks')
      .alias('t')
      .description('Manage tasks');

    tasksCmd
      .command('create')
      .alias('c')
      .description('Create a new task')
      .argument('<description>', 'Task description')
      .option('-p, --priority <level>', 'Task priority (low|normal|high|urgent)', 'normal')
      .option('-a, --assign <client>', 'Assign to client')
      .option('--tags <tags>', 'Comma-separated tags')
      .option('--due <date>', 'Due date')
      .action(async (description, options) => {
        const result = await commands.tasks.create(description, options);
        this.print(result);
      });

    tasksCmd
      .command('list')
      .alias('ls')
      .description('List all tasks')
      .option('-f, --filter <status>', 'Filter by status')
      .option('-s, --status <status>', 'Filter by status (alias)')
      .action(async (options) => {
        const result = await commands.tasks.list(options);
        this.print(result);
      });

    tasksCmd
      .command('get')
      .alias('g')
      .description('Get task details')
      .argument('<id>', 'Task ID')
      .action(async (id) => {
        const result = await commands.tasks.get(id);
        this.print(result);
      });

    tasksCmd
      .command('update')
      .alias('u')
      .description('Update task status')
      .argument('<id>', 'Task ID')
      .argument('<status>', 'New status (pending|in-progress|completed|cancelled)')
      .action(async (id, status) => {
        const result = await commands.tasks.update(id, status);
        this.print(result);
      });

    tasksCmd
      .command('delete')
      .alias('d')
      .description('Delete a task')
      .argument('<id>', 'Task ID')
      .action(async (id) => {
        const result = await commands.tasks.delete(id);
        this.print(result);
      });

    // ==================== ROADMAPS COMMANDS ====================
    const roadmapsCmd = this.program
      .command('roadmaps')
      .alias('rm')
      .description('Manage project roadmaps');

    roadmapsCmd
      .command('create')
      .alias('c')
      .description('Create a new roadmap')
      .argument('<name>', 'Roadmap name')
      .option('-d, --description <text>', 'Roadmap description')
      .option('--phases <json>', 'JSON array of phases')
      .option('--target <date>', 'Target completion date')
      .option('-o, --output <file>', 'Save to file')
      .action(async (name, options) => {
        const result = await commands.roadmaps.create(name, options);
        this.print(result);
      });

    roadmapsCmd
      .command('list')
      .alias('ls')
      .description('List all roadmaps')
      .action(async () => {
        const result = await commands.roadmaps.list();
        this.print(result);
      });

    roadmapsCmd
      .command('get')
      .alias('g')
      .description('Get roadmap details')
      .argument('<id>', 'Roadmap ID')
      .action(async (id) => {
        const result = await commands.roadmaps.get(id);
        this.print(result);
      });

    roadmapsCmd
      .command('update')
      .alias('u')
      .description('Update a roadmap')
      .argument('<id>', 'Roadmap ID')
      .option('-n, --name <name>', 'New name')
      .option('-d, --description <text>', 'New description')
      .option('-s, --status <status>', 'New status')
      .action(async (id, options) => {
        const result = await commands.roadmaps.update(id, options);
        this.print(result);
      });

    roadmapsCmd
      .command('delete')
      .alias('d')
      .description('Delete a roadmap')
      .argument('<id>', 'Roadmap ID')
      .action(async (id) => {
        const result = await commands.roadmaps.delete(id);
        this.print(result);
      });

    // ==================== BACKUP COMMANDS ====================
    const backupCmd = this.program
      .command('backup')
      .alias('b')
      .description('Create and restore backups');

    backupCmd
      .command('create')
      .alias('c')
      .description('Create a new backup')
      .option('-n, --name <name>', 'Backup name')
      .action(async (options) => {
        const result = await commands.backup.create(options);
        this.print(result);
      });

    backupCmd
      .command('list')
      .alias('ls')
      .description('List all backups')
      .action(async () => {
        const result = await commands.backup.list();
        this.print(result);
      });

    backupCmd
      .command('restore')
      .alias('r')
      .description('Restore from backup')
      .argument('<id>', 'Backup ID')
      .option('--skip-restart', 'Skip service restart after restore')
      .action(async (id, options) => {
        const result = await commands.backup.restore(id, options);
        this.print(result);
      });

    backupCmd
      .command('delete')
      .alias('d')
      .description('Delete a backup')
      .argument('<id>', 'Backup ID')
      .action(async (id) => {
        const result = await commands.backup.delete(id);
        this.print(result);
      });

    // ==================== VAULT COMMANDS ====================
    const vaultCmd = this.program
      .command('vault')
      .alias('v')
      .description('Manage secrets and credentials');

    vaultCmd
      .command('migrate')
      .alias('m')
      .description('Migrate secrets from .env to vault')
      .option('--force', 'Force re-migration')
      .option('--verbose', 'Show verbose output')
      .action(async (options) => {
        const result = await commands.vault.migrate(options);
        this.print(result);
      });

    vaultCmd
      .command('list')
      .alias('ls')
      .description('List vault secrets')
      .action(async () => {
        const result = await commands.vault.list();
        this.print(result);
      });

    vaultCmd
      .command('add')
      .alias('a')
      .description('Add a secret to vault')
      .argument('<key>', 'Secret key')
      .argument('<value>', 'Secret value')
      .action(async (key, value) => {
        const result = await commands.vault.add(key, value);
        this.print(result);
      });

    vaultCmd
      .command('remove')
      .alias('rm')
      .description('Remove a secret from vault')
      .argument('<key>', 'Secret key')
      .action(async (key) => {
        const result = await commands.vault.remove(key);
        this.print(result);
      });

    vaultCmd
      .command('status')
      .alias('s')
      .description('Show vault status')
      .action(async () => {
        const result = await commands.vault.status();
        this.print(result);
      });

    // ==================== UPDATE COMMANDS ====================
    const updateCmd = this.program
      .command('update')
      .alias('u')
      .description('Check and apply updates');

    updateCmd
      .command('check')
      .alias('c')
      .description('Check for available updates')
      .action(async () => {
        const result = await commands.update.check();
        this.print(result);
      });

    updateCmd
      .command('apply')
      .alias('a')
      .description('Apply available updates')
      .option('--force', 'Skip confirmation')
      .action(async (options) => {
        const result = await commands.update.apply(options);
        this.print(result);
      });

    updateCmd
      .command('rollback')
      .alias('r')
      .description('Rollback to previous version')
      .argument('<version>', 'Version to rollback to')
      .action(async (version) => {
        const result = await commands.update.rollback(version);
        this.print(result);
      });

    updateCmd
      .command('history')
      .alias('h')
      .description('Show update history')
      .action(async () => {
        const result = await commands.update.history();
        this.print(result);
      });

    // ==================== INTERACTIVE COMMAND ====================
    this.program
      .command('interactive')
      .alias('i')
      .alias('repl')
      .description('Start interactive REPL mode')
      .action(() => this.startInteractiveMode());

    // ==================== HELP COMMAND ====================
    this.program
      .command('help')
      .alias('h')
      .description('Show help information')
      .argument('[command]', 'Specific command to get help for')
      .action(async (commandName) => {
        if (commandName) {
          this.program.commands.find(c => c.name() === commandName)?.help();
        } else {
          this.showHelp();
        }
      });

    // Handle default (no command)
    this.program.action(async (options) => {
      if (options.interactive) {
        await this.startInteractiveMode();
      } else {
        this.showBanner();
        this.program.help();
      }
    });
  }

  /**
   * Show banner
   */
  showBanner() {
    console.log(f.header('COGNIMESH CLI', 'box'));
    console.log();
    console.log(f.colorize('Version:', 'dim'), f.colorize(version, 'cyan'));
    console.log(f.colorize('Type "cognimesh --help" for available commands', 'dim'));
    console.log();
  }

  /**
   * Show help
   */
  showHelp() {
    this.showBanner();
    this.program.help();
  }

  /**
   * Print command result
   */
  print(result) {
    if (!result) return;
    
    if (result.output) {
      console.log(result.output);
    } else if (typeof result === 'string') {
      console.log(result);
    } else if (result.message) {
      const icon = result.success !== false ? f.colorize('✓', 'green') : f.colorize('✗', 'red');
      console.log(`${icon} ${result.message}`);
    }
    
    // Print data in verbose mode
    if (this.program.opts().verbose && result.data) {
      console.log();
      console.log(f.colorize('Data:', 'dim'));
      console.log(f.json(result.data));
    }
    
    // Exit with error code if failed
    if (result.success === false) {
      process.exitCode = 1;
    }
  }

  /**
   * Start interactive REPL mode
   */
  async startInteractiveMode() {
    this.isInteractive = true;
    
    console.clear();
    console.log(f.header(`COGNIMESH CLI v${version}`, 'box'));
    console.log();
    console.log(f.colorize('Welcome to interactive mode!', 'bright'));
    console.log(f.colorize('Type "help" for commands, "exit" to quit.', 'dim'));
    console.log();

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: f.colorize('cognimesh', 'cyan') + f.colorize('>', 'dim') + ' ',
      completer: (line) => this.completer(line)
    });

    rl.prompt();

    rl.on('line', async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        rl.prompt();
        return;
      }

      // Exit commands
      if (['exit', 'quit', 'q'].includes(trimmed.toLowerCase())) {
        console.log();
        console.log(f.colorize('Goodbye! 👋', 'green'));
        rl.close();
        return;
      }

      // Clear command
      if (trimmed === 'clear') {
        console.clear();
        rl.prompt();
        return;
      }

      try {
        await this.executeInteractiveCommand(trimmed);
      } catch (error) {
        console.log(f.error(error.message));
      }

      console.log();
      rl.prompt();
    });

    rl.on('SIGINT', () => {
      console.log();
      console.log(f.colorize('Goodbye! 👋', 'green'));
      rl.close();
    });

    rl.on('close', () => {
      process.exit(0);
    });
  }

  /**
   * Execute command in interactive mode
   */
  async executeInteractiveCommand(input) {
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Map interactive commands to actual commands
    const commandMap = {
      'status': () => commands.status(),
      'clients': () => commands.clients.list(),
      'tasks': () => commands.tasks.list({}),
      'roadmaps': () => commands.roadmaps.list(),
      'backups': () => commands.backup.list(),
      'vault': () => commands.vault.status(),
      'help': () => this.showInteractiveHelp()
    };

    if (commandMap[cmd]) {
      const result = await commandMap[cmd]();
      this.print(result);
    } else if (cmd.startsWith('task ')) {
      // Handle task subcommands in interactive mode
      const subCmd = args[0];
      const desc = args.slice(1).join(' ');
      if (subCmd === 'create' && desc) {
        const result = await commands.tasks.create(desc);
        this.print(result);
      } else {
        console.log(f.error(`Unknown subcommand: ${subCmd}`));
      }
    } else {
      console.log(f.error(`Unknown command: ${cmd}. Type "help" for available commands.`));
    }
  }

  /**
   * Show interactive help
   */
  showInteractiveHelp() {
    const helpText = `
${f.colorize('Available Commands:', 'bright')}

  ${f.colorize('status', 'cyan')}        Show system status
  ${f.colorize('clients', 'cyan')}       List all clients
  ${f.colorize('tasks', 'cyan')}         List all tasks
  ${f.colorize('roadmaps', 'cyan')}      List all roadmaps
  ${f.colorize('backups', 'cyan')}       List all backups
  ${f.colorize('vault', 'cyan')}         Show vault status
  ${f.colorize('help', 'cyan')}          Show this help
  ${f.colorize('clear', 'cyan')}         Clear screen
  ${f.colorize('exit', 'cyan')}          Exit interactive mode

${f.colorize('Examples:', 'bright')}
  task create "Review code"
  status
  clients
`;
    console.log(helpText);
    return { success: true };
  }

  /**
   * Tab completion for interactive mode
   */
  completer(line) {
    const completions = [
      'status', 'clients', 'tasks', 'roadmaps', 'backups', 'vault',
      'help', 'clear', 'exit', 'quit', 'q',
      'task create', 'task list', 'task delete'
    ];
    
    const hits = completions.filter(c => c.startsWith(line.toLowerCase()));
    return [hits.length ? hits : completions, line];
  }

  /**
   * Parse and execute CLI
   */
  async run() {
    try {
      await this.program.parseAsync();
    } catch (error) {
      console.error(f.error(error.message));
      process.exit(1);
    }
  }
}

// Run CLI
const cli = new CogniMeshCLI();
cli.run();

export { CogniMeshCLI };
