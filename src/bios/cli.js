#!/usr/bin/env node
/**
 * CogniMesh CLI - Enhanced Command Line Interface
 * Provides interactive REPL and batch command execution with rich output
 */

import { Command } from 'commander';
import { createInterface } from 'readline';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Import commands
import * as commands from './commands/index.js';
import * as f from './commands/utils/formatters.js';
import { 
  configureOutput, 
  formatAgentList,
  formatAgentStatus,
  formatTaskOutput
} from './commands/utils/output-manager.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Read package.json for version
let version = '5.0.0';
try {
  const pkgPath = join(process.cwd(), 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    version = pkg.version || version;
  }
} catch (e) { /* intentionally empty - fallback to default version */ }

/**
 * CogniMesh CLI Application
 */
class CogniMeshCLI {
  constructor() {
    this.program = new Command();
    this.isInteractive = false;
    this.outputManager = null;
    this.setupGlobalOptions();
    this.setupCommands();
  }

  /**
   * Setup global CLI options
   */
  setupGlobalOptions() {
    this.program
      .name('cognimesh')
      .description('CogniMesh - Multi-Agent Orchestration CLI')
      .version(version, '-v, --version', 'Display version')
      .option('-i, --interactive', 'Start interactive REPL mode')
      .option('--no-color', 'Disable colored output')
      .option('--format <type>', 'Output format (table|json|yaml|csv|tree|plain)', 'auto')
      .option('--json', 'Output as JSON (shortcut for --format json)')
      .option('--yaml', 'Output as YAML (shortcut for --format yaml)')
      .option('--csv', 'Output as CSV (shortcut for --format csv)')
      .option('--no-pager', 'Disable pager for long output')
      .option('--quiet, -q', 'Suppress non-error output')
      .option('--verbose', 'Enable verbose output')
      .option('--stream', 'Enable streaming output mode')
      .configureOutput({
        writeErr: (str) => process.stderr.write(str),
        outputError: (str, write) => write(f.colorize(`Error: ${str}`, 'red'))
      });
  }

  /**
   * Initialize output manager based on CLI options
   */
  initOutputManager() {
    const opts = this.program.opts();
    
    // Resolve format priority: explicit flags > --format > auto
    let format = opts.format;
    if (opts.json) format = 'json';
    if (opts.yaml) format = 'yaml';
    if (opts.csv) format = 'csv';
    
    this.outputManager = configureOutput({
      format,
      color: opts.color,
      pager: opts.pager,
      quiet: opts.quiet,
      verbose: opts.verbose,
      stream: opts.stream
    });
  }

  /**
   * Setup all CLI commands
   */
  setupCommands() {
    // ==================== STATUS COMMAND ====================
    this.program
      .command('status')
      .alias('s')
      .description('Show system status')
      .action(async () => {
        this.initOutputManager();
        const result = await commands.status();
        this.print(result);
      });

    // ==================== PROVIDERS COMMANDS ====================
    const providersCmd = this.program
      .command('providers')
      .alias('pr')
      .description('Inspect subscription-backed provider runtimes')
      .action(async () => {
        this.initOutputManager();
        const result = await commands.providers.status();
        this.print(result);
      });

    providersCmd
      .command('list')
      .alias('ls')
      .description('List provider surfaces')
      .action(async () => {
        this.initOutputManager();
        const result = await commands.providers.list();
        this.print(result);
      });

    providersCmd
      .command('status')
      .alias('s')
      .description('Show provider runtime status')
      .action(async () => {
        this.initOutputManager();
        const result = await commands.providers.status();
        this.print(result);
      });

    providersCmd
      .command('inspect')
      .alias('show')
      .description('Inspect a provider runtime')
      .argument('<modelId>', 'Runtime model identifier')
      .action(async (modelId) => {
        this.initOutputManager();
        const result = await commands.providers.inspect(modelId);
        this.print(result);
      });

    // ==================== AGENTS COMMANDS ====================
    const agentsCmd = this.program
      .command('agents')
      .alias('ag')
      .description('Inspect and manage BIOS agents')
      .action(async () => {
        this.initOutputManager();
        const result = await commands.agents.list();
        this.printFormattedAgents(result);
      });

    agentsCmd
      .command('list')
      .alias('ls')
      .description('List control-plane agents')
      .option('-c, --client <client>', 'Filter by client')
      .option('-s, --status <status>', 'Filter by status')
      .action(async (options) => {
        this.initOutputManager();
        const result = await commands.agents.list(options);
        this.printFormattedAgents(result);
      });

    agentsCmd
      .command('inspect')
      .alias('show')
      .description('Inspect an agent')
      .argument('<agentId>', 'Agent identifier')
      .action(async (agentId) => {
        this.initOutputManager();
        const result = await commands.agents.inspect(agentId);
        this.printFormattedAgent(result);
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
        this.initOutputManager();
        const result = await commands.clients.list();
        this.print(result);
      });

    clientsCmd
      .command('test')
      .alias('t')
      .description('Test all client connections')
      .action(async () => {
        this.initOutputManager();
        const result = await commands.clients.test();
        this.print(result);
      });

    // Client-specific shortcuts
    ['kimi', 'claude', 'codex'].forEach(clientId => {
      clientsCmd
        .command(clientId)
        .description(`Show ${clientId} client details`)
        .action(async () => {
          this.initOutputManager();
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
        this.initOutputManager();
        const result = await commands.tasks.create(description, options);
        this.printFormattedTask(result);
      });

    tasksCmd
      .command('list')
      .alias('ls')
      .description('List all tasks')
      .option('-f, --filter <status>', 'Filter by status')
      .option('-s, --status <status>', 'Filter by status (alias)')
      .action(async (options) => {
        this.initOutputManager();
        const result = await commands.tasks.list(options);
        this.printFormattedTasks(result);
      });

    tasksCmd
      .command('get')
      .alias('g')
      .description('Get task details')
      .argument('<id>', 'Task ID')
      .action(async (id) => {
        this.initOutputManager();
        const result = await commands.tasks.get(id);
        this.printFormattedTask(result);
      });

    tasksCmd
      .command('update')
      .alias('u')
      .description('Update task status')
      .argument('<id>', 'Task ID')
      .argument('<status>', 'New status (pending|in-progress|completed|cancelled)')
      .action(async (id, status) => {
        this.initOutputManager();
        const result = await commands.tasks.update(id, status);
        this.print(result);
      });

    tasksCmd
      .command('delete')
      .alias('d')
      .description('Delete a task')
      .argument('<id>', 'Task ID')
      .action(async (id) => {
        this.initOutputManager();
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
        this.initOutputManager();
        const result = await commands.roadmaps.create(name, options);
        this.print(result);
      });

    roadmapsCmd
      .command('list')
      .alias('ls')
      .description('List all roadmaps')
      .action(async () => {
        this.initOutputManager();
        const result = await commands.roadmaps.list();
        this.print(result);
      });

    roadmapsCmd
      .command('get')
      .alias('g')
      .description('Get roadmap details')
      .argument('<id>', 'Roadmap ID')
      .action(async (id) => {
        this.initOutputManager();
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
        this.initOutputManager();
        const result = await commands.roadmaps.update(id, options);
        this.print(result);
      });

    roadmapsCmd
      .command('delete')
      .alias('d')
      .description('Delete a roadmap')
      .argument('<id>', 'Roadmap ID')
      .action(async (id) => {
        this.initOutputManager();
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
        this.initOutputManager();
        const result = await commands.backup.create(options);
        this.print(result);
      });

    backupCmd
      .command('list')
      .alias('ls')
      .description('List all backups')
      .action(async () => {
        this.initOutputManager();
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
        this.initOutputManager();
        const result = await commands.backup.restore(id, options);
        this.print(result);
      });

    backupCmd
      .command('delete')
      .alias('d')
      .description('Delete a backup')
      .argument('<id>', 'Backup ID')
      .action(async (id) => {
        this.initOutputManager();
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
        this.initOutputManager();
        const result = await commands.vault.migrate(options);
        this.print(result);
      });

    vaultCmd
      .command('list')
      .alias('ls')
      .description('List vault secrets')
      .action(async () => {
        this.initOutputManager();
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
        this.initOutputManager();
        const result = await commands.vault.add(key, value);
        this.print(result);
      });

    vaultCmd
      .command('remove')
      .alias('rm')
      .description('Remove a secret from vault')
      .argument('<key>', 'Secret key')
      .action(async (key) => {
        this.initOutputManager();
        const result = await commands.vault.remove(key);
        this.print(result);
      });

    vaultCmd
      .command('status')
      .alias('s')
      .description('Show vault status')
      .action(async () => {
        this.initOutputManager();
        const result = await commands.vault.status();
        this.print(result);
      });

    // ==================== SKILLS COMMANDS ====================
    const skillsCmd = this.program
      .command('skills')
      .alias('sk')
      .description('Manage and sync AI skills');

    skillsCmd
      .command('list')
      .alias('ls')
      .description('List all skills')
      .option('-s, --status <status>', 'Filter by status')
      .option('-c, --category <category>', 'Filter by category')
      .option('-t, --tag <tag>', 'Filter by tag')
      .action(async (options) => {
        this.initOutputManager();
        const result = await commands.skills.list(options);
        this.print(result);
      });

    skillsCmd
      .command('create')
      .alias('c')
      .description('Create a new skill')
      .argument('<name>', 'Skill name (kebab-case)')
      .option('-d, --description <text>', 'Skill description')
      .option('--tags <tags>', 'Comma-separated tags')
      .option('--categories <categories>', 'Comma-separated categories')
      .option('-f, --file <path>', 'Save to file path')
      .option('--company <id>', 'Company scope')
      .action(async (name, options) => {
        this.initOutputManager();
        const result = await commands.skills.create(name, options);
        this.print(result);
      });

    skillsCmd
      .command('show')
      .alias('s')
      .description('Show skill details')
      .argument('<name>', 'Skill name or ID')
      .option('--company <id>', 'Company scope')
      .option('--no-content', 'Hide content preview')
      .action(async (name, options) => {
        this.initOutputManager();
        const result = await commands.skills.show(name, options);
        this.print(result);
      });

    skillsCmd
      .command('update')
      .alias('u')
      .description('Update a skill')
      .argument('<name>', 'Skill name or ID')
      .option('-f, --file <path>', 'Load content from file')
      .option('-c, --content <text>', 'New content')
      .option('--display-name <name>', 'New display name')
      .option('--status <status>', 'New status')
      .option('--tags <tags>', 'Comma-separated tags')
      .option('--categories <categories>', 'Comma-separated categories')
      .option('--change-notes <notes>', 'Version change notes')
      .option('--no-version', 'Do not create new version')
      .action(async (name, options) => {
        this.initOutputManager();
        const result = await commands.skills.update(name, options);
        this.print(result);
      });

    skillsCmd
      .command('delete')
      .alias('d')
      .description('Delete a skill')
      .argument('<name>', 'Skill name or ID')
      .option('--force', 'Confirm deletion')
      .option('--clean', 'Remove from client directories')
      .action(async (name, options) => {
        this.initOutputManager();
        const result = await commands.skills.delete(name, options);
        this.print(result);
      });

    skillsCmd
      .command('sync')
      .alias('sy')
      .description('Sync skills to AI clients')
      .option('--client <name>', 'Target client (claude|codex|kimi|all)', 'all')
      .option('--skills <list>', 'Comma-separated skill IDs/names')
      .option('--mode <mode>', 'Sync mode (copy|symlink)')
      .option('--clean', 'Remove orphaned skills')
      .option('--dry-run', 'Preview changes without applying')
      .option('-v, --verbose', 'Show detailed output')
      .action(async (options) => {
        this.initOutputManager();
        const result = await commands.skills.sync(options);
        this.print(result);
      });

    skillsCmd
      .command('scan')
      .description('Scan project for skills')
      .option('-p, --project <path>', 'Project path to scan')
      .option('--company <id>', 'Company scope for imported skills')
      .action(async (options) => {
        this.initOutputManager();
        const result = await commands.skills.scan(options);
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
        this.initOutputManager();
        const result = await commands.update.check();
        this.print(result);
      });

    updateCmd
      .command('apply')
      .alias('a')
      .description('Apply available updates')
      .option('--force', 'Skip confirmation')
      .action(async (options) => {
        this.initOutputManager();
        const result = await commands.update.apply(options);
        this.print(result);
      });

    updateCmd
      .command('rollback')
      .alias('r')
      .description('Rollback to previous version')
      .argument('<version>', 'Version to rollback to')
      .action(async (version) => {
        this.initOutputManager();
        const result = await commands.update.rollback(version);
        this.print(result);
      });

    updateCmd
      .command('history')
      .alias('h')
      .description('Show update history')
      .action(async () => {
        this.initOutputManager();
        const result = await commands.update.history();
        this.print(result);
      });

    // ==================== DOCTOR COMMAND ====================
    this.program
      .command('doctor')
      .alias('dr')
      .alias('diagnose')
      .description('Run system diagnostics')
      .option('-r, --repair', 'Auto-repair fixable issues')
      .option('-y, --yes', 'Skip confirmation prompts for repairs')
      .action(async (options) => {
        this.initOutputManager();
        const result = await commands.doctor(options);
        this.print(result);
      });

    // ==================== OUTPUT INFO COMMAND ====================
    this.program
      .command('output:info')
      .description('Show output format information and capabilities')
      .action(() => {
        this.initOutputManager();
        const caps = this.outputManager.getCapabilities();
        console.log(f.header('OUTPUT CAPABILITIES', 'box'));
        console.log();
        console.log(f.keyValue({
          'TTY': caps.isTTY ? 'Yes' : 'No',
          'Color Support': caps.supportsColor ? 'Yes' : 'No',
          'Unicode Support': caps.supportsUnicode ? 'Yes' : 'No',
          'Terminal Width': `${caps.width} columns`,
          'Terminal Height': `${caps.height} rows`,
          'Pager': caps.hasPager || 'None'
        }, { indent: 2 }));
        console.log();
        console.log(f.colorize('Available Formats:', 'bright'));
        console.log(f.list(['table', 'json', 'yaml', 'csv', 'tree', 'plain'], { indent: 2 }));
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
   * Print formatted agent list
   */
  printFormattedAgents(result) {
    if (!result || !this.outputManager) {
      this.print(result);
      return;
    }
    
    const agents = result.data?.agents || result.data || [];
    const format = this.program.opts().json ? 'json' : 
                   this.program.opts().yaml ? 'yaml' : 
                   this.program.opts().csv ? 'csv' :
                   this.program.opts().format || 'table';
    
    if (format !== 'table') {
      // Use output manager for structured formats
      this.outputManager.render(agents, format);
    } else {
      // Use enhanced formatter for table display
      const formatted = formatAgentList(agents, { format: 'table' });
      console.log(formatted);
      
      // Add summary
      if (result.data?.source) {
        console.log();
        console.log(f.keyValue({
          Source: result.data.source,
          Total: agents.length,
          Active: agents.filter(a => ['active', 'running', 'ready'].includes(a.status)).length
        }, { indent: 2 }));
      }
    }
    
    if (result.success === false) {
      process.exitCode = 1;
    }
  }

  /**
   * Print formatted agent details
   */
  printFormattedAgent(result) {
    if (!result || !this.outputManager) {
      this.print(result);
      return;
    }
    
    const agent = result.data;
    if (!agent) {
      this.print(result);
      return;
    }
    
    const format = this.program.opts().json ? 'json' : 
                   this.program.opts().yaml ? 'yaml' : 
                   this.program.opts().format || 'table';
    
    if (format !== 'table') {
      this.outputManager.render(agent, format);
    } else {
      const formatted = formatAgentStatus(agent, { format: 'table', detailed: true });
      console.log(formatted);
    }
    
    if (result.success === false) {
      process.exitCode = 1;
    }
  }

  /**
   * Print formatted tasks
   */
  printFormattedTasks(result) {
    if (!result || !this.outputManager) {
      this.print(result);
      return;
    }
    
    const tasks = result.data || [];
    const format = this.program.opts().json ? 'json' : 
                   this.program.opts().yaml ? 'yaml' : 
                   this.program.opts().csv ? 'csv' :
                   this.program.opts().format || 'table';
    
    if (format !== 'table') {
      this.outputManager.render(tasks, format);
    } else {
      const formatted = formatTaskOutput(tasks, { format: 'table', list: true });
      console.log(formatted);
      
      // Add summary
      if (tasks.length > 0) {
        const byStatus = {};
        tasks.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
        console.log();
        console.log(f.colorize('Summary:', 'bright'), 
          Object.entries(byStatus).map(([s, c]) => `${s}: ${c}`).join(' | '));
      }
    }
    
    if (result.success === false) {
      process.exitCode = 1;
    }
  }

  /**
   * Print formatted task
   */
  printFormattedTask(result) {
    if (!result || !this.outputManager) {
      this.print(result);
      return;
    }
    
    const task = result.data;
    if (!task) {
      this.print(result);
      return;
    }
    
    const format = this.program.opts().json ? 'json' : 
                   this.program.opts().yaml ? 'yaml' : 
                   this.program.opts().format || 'table';
    
    if (format !== 'table') {
      this.outputManager.render(task, format);
    } else {
      const formatted = formatTaskOutput(task, { format: 'table' });
      console.log(formatted);
    }
    
    if (result.success === false) {
      process.exitCode = 1;
    }
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
   * Print command result (legacy method)
   */
  print(result) {
    if (!result) return;
    
    // If output manager is initialized and we have structured data, use it
    if (this.outputManager && result.data) {
      this.outputManager.render(result.data);
      return;
    }
    
    if (result.output) {
      console.log(result.output);
    } else if (typeof result === 'string') {
      console.log(result);
    } else if (result.message) {
      const icon = result.success !== false ? f.colorize('✓', 'green') : f.colorize('✗', 'red');
      console.log(`${icon} ${result.message}`);
    }
    
    // Print data in verbose mode
    if (this.program.opts()?.verbose && result.data) {
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
      'providers': () => commands.providers.status(),
      'agents': () => commands.agents.list(),
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
  ${f.colorize('providers', 'cyan')}     Show provider runtime status
  ${f.colorize('agents', 'cyan')}        List control-plane agents
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
  providers inspect gpt-5.4-codex
  agents inspect sa-00
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
      'status', 'providers', 'agents', 'clients', 'tasks', 'roadmaps', 'backups', 'vault',
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

const isMainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  const cli = new CogniMeshCLI();
  cli.run();
}

export { CogniMeshCLI };
